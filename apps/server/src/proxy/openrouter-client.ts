import type { OpenRouterConfig } from '@shared/types';

export async function fetchMessage(
  config: OpenRouterConfig,
  model: string,
  body: unknown,
  signal?: AbortSignal,
  timeoutMs = 30_000,
): Promise<{ status: number; headers: Record<string, string>; body: ReadableStream | object }> {
  const url = `${config.baseUrl}/messages`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    'Accept': 'text/event-stream',
  };

  // Pre-aborted signal check
  if (signal?.aborted) throw new Error('timeout');

  const controller = new AbortController();

  // Timeout triggers abort
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Client disconnect triggers abort
  signal?.addEventListener('abort', () => controller.abort(), { once: true });

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
      respHeaders[key] = val;
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      return { status: response.status, headers: respHeaders, body: response.body as ReadableStream };
    }

    const json = await response.json();
    return { status: response.status, headers: respHeaders, body: json };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchModels(signal?: AbortSignal): Promise<{ models: Array<{ id: string; name: string }> }> {
  const response = await fetch('https://openrouter.ai/api/v1/models', { signal });
  const data = await response.json();
  return { models: (data.data ?? []).map((m: any) => ({ id: m.id, name: m.name })) };
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
const endpointCache = new Map<string, { at: number; endpoints: ModelEndpoint[] }>();

export async function fetchEndpoints(modelId: string, apiKey: string, signal?: AbortSignal): Promise<ModelEndpoint[]> {
  const cached = endpointCache.get(modelId);
  if (cached && Date.now() - cached.at < ENDPOINT_TTL_MS) return cached.endpoints;

  // Auth'lu istekte latency/throughput geliyor; anonim çağrıda bu alanlar null.
  const url = `https://openrouter.ai/api/v1/models/${modelId}/endpoints`;
  const response = await fetch(url, { signal, headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`endpoints fetch failed: ${response.status}`);
  const endpoints = mapEndpoints(await response.json());
  endpointCache.set(modelId, { at: Date.now(), endpoints });
  return endpoints;
}
