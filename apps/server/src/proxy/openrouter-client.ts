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

    const respHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => { respHeaders[key] = val; });

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
