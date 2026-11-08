import { createHash } from 'node:crypto';
import type { OpenRouterConfig } from '@shared/types';

export class UpstreamAbortError extends Error {
  constructor(public readonly code: 'upstream_timeout' | 'client_closed') {
    super(code);
    this.name = 'AbortError';
  }
}

export async function fetchMessage(
  config: OpenRouterConfig,
  body: unknown,
  signal?: AbortSignal,
  timeoutMs = 30_000,
): Promise<{ status: number; headers: Record<string, string>; body: ReadableStream | object | string }> {
  if (signal?.aborted) throw new UpstreamAbortError('client_closed');

  const url = `${config.baseUrl}/messages`;
  const streaming = (body as { stream?: boolean })?.stream === true;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    'Accept': streaming ? 'text/event-stream' : 'application/json',
  };

  const controller = new AbortController();
  // Timeout ile istemci iptali aynı sinyale düşüyor; sebebi ayrı tutulur.
  let reason: 'upstream_timeout' | 'client_closed' = 'client_closed';
  const timeoutId = setTimeout(() => { reason = 'upstream_timeout'; controller.abort(); }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    // fetch already decoded the body: forwarding content-encoding/content-length
    // makes downstream clients try to gunzip plain JSON.
    const respHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      if (key === 'content-encoding' || key === 'content-length') return;
      if (key === 'transfer-encoding' || key === 'connection') return;
      respHeaders[key] = val;
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      clearTimeout(timeoutId); // SSE akışına toplam süre sınırı konmaz
      return { status: response.status, headers: respHeaders, body: response.body as ReadableStream };
    }

    const text = await response.text();
    try {
      return { status: response.status, headers: respHeaders, body: text ? JSON.parse(text) : {} };
    } catch {
      return { status: response.status, headers: respHeaders, body: text };
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new UpstreamAbortError(reason);
    throw err;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onAbort);
  }
}

const MODELS_TTL_MS = 10 * 60_000;
const MODELS_TIMEOUT_MS = 15_000;
let modelsCache: { at: number; models: Array<{ id: string; name: string }> } | null = null;
let modelsInFlight: Promise<Array<{ id: string; name: string }>> | null = null;

// Bir çağıranın iptali paylaşılan upstream isteği iptal etmemeli; her çağıran kendi sinyaline yarışır.
function abortable<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export async function fetchModels(signal?: AbortSignal): Promise<{ models: Array<{ id: string; name: string }> }> {
  if (modelsCache && Date.now() - modelsCache.at < MODELS_TTL_MS) {
    return { models: [...modelsCache.models] };
  }

  if (!modelsInFlight) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS);
    modelsInFlight = (async () => {
      const response = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal });
      if (!response.ok) throw new Error(`models fetch failed: ${response.status}`);
      const data = await response.json();
      return (data.data ?? []).map((m: any) => ({ id: m.id, name: m.name }));
    })().then(
      models => {
        modelsCache = { at: Date.now(), models };
        return models;
      },
      err => { throw err; },
    ).finally(() => {
      clearTimeout(timer);
      modelsInFlight = null;
    });
  }

  return { models: [...await abortable(modelsInFlight, signal)] };
}

export interface ModelEndpoint {
  tag: string;
  providerName: string;
  /** USD per 1M tokens */
  promptUsdPerM: number;
  /** USD per 1M tokens */
  completionUsdPerM: number;
  contextLength: number | null;
  quantization: string | null;
  uptimeLast30m: number | null;
  /** median ms, last 30m */
  latencyMs: number | null;
  /** median tokens/sec, last 30m */
  throughputTokPerSec: number | null;
}

// $/token → $/1M, 4 basamak (float artıklarını at)
const perM = (v: unknown) => Math.round(Number(v ?? 0) * 1e10) / 1e4;

// Bu metrikler auth'lu istekte { p50, p75, p90, p99 } olarak döner
const p50 = (v: any): number | null => typeof v === 'number' ? v : (typeof v?.p50 === 'number' ? v.p50 : null);

export function mapEndpoints(data: any): ModelEndpoint[] {
  return (data?.data?.endpoints ?? []).map((e: any) => ({
    tag: e.tag,
    providerName: e.provider_name ?? e.tag,
    promptUsdPerM: perM(e.pricing?.prompt),
    completionUsdPerM: perM(e.pricing?.completion),
    contextLength: e.context_length ?? null,
    quantization: e.quantization ?? null,
    uptimeLast30m: e.uptime_last_30m ?? null,
    latencyMs: p50(e.latency_last_30m),
    throughputTokPerSec: p50(e.throughput_last_30m),
  }));
}

// Endpoint fiyatları nadiren değişir; model başına 5 dk yeter.
const ENDPOINT_TTL_MS = 5 * 60_000;
const ENDPOINT_MAX_ENTRIES = 256;
const endpointCache = new Map<string, { at: number; endpoints: ModelEndpoint[] }>();
const endpointInFlight = new Map<string, Promise<ModelEndpoint[]>>();

const keyFingerprint = (apiKey: string) => createHash('sha256').update(apiKey).digest('hex').slice(0, 16);

function pruneEndpoints() {
  const now = Date.now();
  for (const [k, v] of endpointCache) if (now - v.at >= ENDPOINT_TTL_MS) endpointCache.delete(k);
  while (endpointCache.size > ENDPOINT_MAX_ENTRIES) {
    let oldestKey = '';
    let oldestAt = Infinity;
    for (const [k, v] of endpointCache) if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k; }
    endpointCache.delete(oldestKey);
  }
}

export async function fetchEndpoints(modelId: string, apiKey: string, signal?: AbortSignal): Promise<ModelEndpoint[]> {
  const key = `${modelId}|${keyFingerprint(apiKey)}`;
  const cached = endpointCache.get(key);
  if (cached && Date.now() - cached.at < ENDPOINT_TTL_MS) return [...cached.endpoints];
  if (cached) endpointCache.delete(key);

  let pending = endpointInFlight.get(key);
  if (!pending) {
    pending = (async () => {
      // Auth'lu istekte latency/throughput geliyor; anonim çağrıda bu alanlar null.
      const url = `https://openrouter.ai/api/v1/models/${modelId}/endpoints`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!response.ok) throw new Error(`endpoints fetch failed: ${response.status}`);
      const endpoints = mapEndpoints(await response.json());
      endpointCache.set(key, { at: Date.now(), endpoints });
      pruneEndpoints();
      return endpoints;
    })().finally(() => endpointInFlight.delete(key));
    endpointInFlight.set(key, pending);
  }

  return [...await abortable(pending, signal)];
}
