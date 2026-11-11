import type { FastifyInstance } from 'fastify';
import { MessageRequestSchema, ZodMessageRequest, stripAnthropicFields } from '../proxy/request-validator.js';
import { loadConfig } from '../config/store.js';
import { resolveModelStrict, toWireProvider } from '../proxy/model-resolver.js';
import { fetchMessage } from '../proxy/openrouter-client.js';
import { mapOpenRouterError, normalizeOpenRouterError } from '../proxy/error-mapper.js';
import { logRequest } from './api.route.js';
import { estimateContextTokens } from './token-count.route.js';

// Claude Desktop (gateway modu) bu ID'lerde claude|opus|sonnet|haiku geçmesini şart koşar.
const DESKTOP_SLOTS = [
  { id: 'claude-fable', role: 'fable', tier: 'fable' },
  { id: 'claude-opus', role: 'opus', tier: 'opus' },
  { id: 'claude-sonnet', role: 'sonnet', tier: 'sonnet' },
  { id: 'claude-haiku', role: 'haiku', tier: 'haiku' },
] as const;

function slotEntry(id: string, tier: string, model: unknown) {
  const entry = typeof model === 'string' ? { id: model } : (model as { id: string });
  return {
    id,
    object: 'model',
    type: 'model',
    display_name: entry?.id || id,
    created_at: '2025-01-01T00:00:00Z',
    anthropic_family_tier: tier,
    is_family_default: true,
    max_tokens: 8192,
  };
}

const isClaudeModel = (id: string) => id.startsWith('anthropic/') || id.toLowerCase().includes('claude');

function hasExplicitBreakpoint(body: Record<string, unknown>): boolean {
  if (body.cache_control) return true;
  const blocks = (v: unknown) => Array.isArray(v) ? v : [];
  if (blocks(body.system).some((b: any) => b?.cache_control)) return true;
  return blocks(body.messages).some((m: any) =>
    Array.isArray(m?.content) && m.content.some((b: any) => b?.cache_control));
}

export function withPromptCache(
  body: Record<string, unknown>, enabled: boolean, resolvedModel: string,
): Record<string, unknown> {
  if (!enabled || !isClaudeModel(resolvedModel) || hasExplicitBreakpoint(body)) return body;
  return { ...body, cache_control: { type: 'ephemeral' } };
}

function validSessionId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 256;
}

// session_id yalnızca kaynağı varsa geçer; uydurulmuş bir ID sticky routing'i bozar.
export function pickSessionId(
  body: Record<string, unknown>, headers: Record<string, unknown>,
): string | undefined {
  if (validSessionId(body.session_id)) return body.session_id;
  const h = headers['x-claude-code-session-id'] ?? headers['x-session-id'];
  return validSessionId(h) ? h : undefined;
}

export function extractUsage(body: unknown): {
  inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; cacheWriteTokens?: number; cost?: number;
} {
  if (!body || typeof body !== 'object' || body instanceof ReadableStream) return {};
  const u = (body as { usage?: Record<string, unknown> }).usage;
  if (!u) return {};
  const num = (v: unknown) => typeof v === 'number' ? v : undefined;
  return {
    inputTokens: num(u.input_tokens),
    outputTokens: num(u.output_tokens),
    cachedInputTokens: num(u.cache_read_input_tokens),
    cacheWriteTokens: num(u.cache_creation_input_tokens),
    cost: num(u.cost),
  };
}

type Usage = ReturnType<typeof extractUsage>;

// Sadece tanımlı alanlar üzerine yazılır: message_delta usage'ında input_tokens yok,
// boş değerle önceki gerçek değeri silmemeli.
function mergeUsage(into: Usage, extra: Usage) {
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) (into as Record<string, unknown>)[key] = value;
  }
}

// SSE akışını olduğu gibi geçirir, sadece data: satırlarını okuyup usage toplar.
// Chunk'lar satır ortasında bölünebilir; tail ile tamamlanır.
export function tapSseUsage(
  stream: ReadableStream<Uint8Array>,
  onUsage: (u: Usage) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let tail = '';

  const consume = (text: string, final: boolean) => {
    const lines = (tail + text).split('\n');
    tail = final ? '' : lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      try {
        const evt = JSON.parse(line.slice(5).trim());
        // message_start usage'ı message içinde, message_delta kökte taşır.
        onUsage({ ...mergeSafely(evt?.message), ...mergeSafely(evt) });
      } catch { /* kısmi veya JSON olmayan satır — pass-through etkilenmez */ }
    }
  };

  return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      consume(decoder.decode(chunk, { stream: true }), false);
    },
    flush() { consume(decoder.decode(), true); },
  }));
}

function mergeSafely(body: unknown): Usage {
  const out: Usage = {};
  mergeUsage(out, extractUsage(body));
  return out;
}

export async function register(app: FastifyInstance) {
  // GET /v1/models — Claude Desktop gateway model discovery
  app.get('/v1/models', async () => {
    const { models } = loadConfig();
    return {
      data: DESKTOP_SLOTS.map(s => slotEntry(s.id, s.tier, models[s.role])),
      has_more: false,
      last_id: null,
    };
  });

  app.post('/v1/messages', async (req, reply) => {
    const started = Date.now();

    let parsed: ZodMessageRequest;
    try {
      parsed = MessageRequestSchema.parse(req.body);
    } catch (err) {
      const zErr = err as Error;
      return reply.code(400).send({ error: { type: 'invalid_request_error', message: zErr.message } });
    }

    const config = loadConfig();
    if (!config.openrouter.apiKey) {
      return reply.code(401).send({ error: { type: 'unauthorized_error', message: 'OpenRouter API key not configured' } });
    }

    const modelResult = resolveModelStrict(parsed.model, config.models);
    if ('error' in modelResult) {
      return reply.code(400).send({ error: { type: 'invalid_model', message: modelResult.error } });
    }

    const upstreamBody: Record<string, unknown> = stripAnthropicFields(parsed, config.stripFields);
    // Resolve alias model to actual OpenRouter model ID
    upstreamBody.model = modelResult.resolved;
    if (modelResult.providerOptions) {
      upstreamBody.provider = toWireProvider(modelResult.providerOptions);
    }

    // let, not const: session_id is assigned to finalBody below.
    let finalBody = withPromptCache(upstreamBody, config.enablePromptCaching === true, modelResult.resolved);

    const sessionId = pickSessionId(upstreamBody, req.headers);
    if (sessionId && !validSessionId(upstreamBody.session_id)) finalBody.session_id = sessionId;

    const abortController = new AbortController();
    const onClientAbort = () => abortController.abort();
    req.raw.on('aborted', onClientAbort);
    // SSE akarken istemci soketi kapanabilir; normal bitiş writableEnded ile ayrılır.
    const onClose = () => { if (!reply.raw.writableEnded) abortController.abort(); };
    reply.raw.on('close', onClose);

    try {
      const result = await fetchMessage(config.openrouter, finalBody, abortController.signal, config.server.timeoutMs);
      reply.status(result.status);

      for (const [key, value] of Object.entries(result.headers)) {
        const lower = key.toLowerCase();
        if (lower !== 'transfer-encoding' && lower !== 'connection') {
          reply.header(key, value);
        }
      }

      const ctxTokens = estimateContextTokens(parsed);
      const entry = logRequest({
        model: parsed.model,
        status: result.status,
        duration: `${Date.now() - started}ms`,
        ctxTokens,
        ...extractUsage(result.body),
      });

      let body = result.body;
      // Streaming'de usage message_start/message_delta olaylarında gelir; akış bitince
      // aynı log satırı doldurulur, böylece iptal edilen istek de kaybolmaz.
      if (body instanceof ReadableStream) {
        body = tapSseUsage(body, u => mergeUsage(entry, u));
      }

      // Upstream hata gövdesi Anthropic şemasında değilse dönüştür; uyumlu gövde aynen geçer.
      if (result.status >= 400 && !(body instanceof ReadableStream)) {
        body = normalizeOpenRouterError(body) ?? mapOpenRouterError(result.status, body);
      }

      return reply.send(body);
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === 'upstream_timeout') return reply.code(504).send({ error: { type: 'upstream_timeout', message: 'Upstream request timed out' } });
      if (e.code === 'client_closed') return reply.code(499).send({ error: { type: 'client_closed', message: 'Request was cancelled' } });
      return reply.code(502).send({ error: { type: 'upstream_error', message: 'Upstream request failed' } });
    } finally {
      req.raw.off('aborted', onClientAbort);
      reply.raw.off('close', onClose);
    }
  });
}
