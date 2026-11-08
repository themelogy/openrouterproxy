import { describe, it, expect, vi } from 'vitest';

describe('openrouter client', () => {
  it('resolves the fetchMessage signature', async () => {
    const client = await import('./openrouter-client.js');
    expect(typeof client.fetchMessage).toBe('function');
  });

  it('resolves the fetchModels signature', async () => {
    const client = await import('./openrouter-client.js');
    expect(typeof client.fetchModels).toBe('function');
  });

  it('maps endpoints to per-million pricing with defaults for missing fields', async () => {
    const { mapEndpoints } = await import('./openrouter-client.js');
    const result = mapEndpoints({
      data: { endpoints: [{
        tag: 'deepinfra/fp4',
        provider_name: 'DeepInfra',
        pricing: { prompt: '0.00000032', completion: '0.00000089' },
        context_length: 163840,
        quantization: 'fp4',
        uptime_last_30m: 100,
        latency_last_30m: { p50: 352.5, p75: 477, p90: 797, p99: 4825 },
        throughput_last_30m: { p50: 254, p75: 185, p90: 126, p99: 36 },
      }, { tag: 'bare' }] },
    });

    expect(result[0]).toEqual({
      tag: 'deepinfra/fp4',
      providerName: 'DeepInfra',
      promptUsdPerM: 0.32,
      completionUsdPerM: 0.89,
      contextLength: 163840,
      quantization: 'fp4',
      uptimeLast30m: 100,
      latencyMs: 352.5,
      throughputTokPerSec: 254,
    });
    expect(result[1].providerName).toBe('bare');
    expect(result[1].promptUsdPerM).toBe(0);
    expect(result[1].contextLength).toBeNull();
    expect(result[1].latencyMs).toBeNull();
    expect(result[1].throughputTokPerSec).toBeNull();
  });

  it('classifies a timeout as upstream_timeout', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn((_url: string, opts: any) => new Promise((_res, rej) => {
      opts.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    })));
    const { fetchMessage } = await import('./openrouter-client.js');
    await expect(fetchMessage({ baseUrl: 'http://x', apiKey: 'k' }, {}, undefined, 5))
      .rejects.toMatchObject({ name: 'AbortError', code: 'upstream_timeout' });
    vi.unstubAllGlobals();
  });

  it('forwards upstream response when within timeout', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ id: 'msg_1', content: [], type: 'message' }),
      { headers: { 'content-type': 'application/json' } },
    )));

    const { fetchMessage } = await import('./openrouter-client.js');
    const config = { baseUrl: 'http://example.com', apiKey: 'test' };
    const body = { model: 'test', messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 };

    const result = await fetchMessage(config, body);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ id: 'msg_1', content: [], type: 'message' });
    vi.unstubAllGlobals();
  });

  it('drops content-encoding/content-length from upstream headers', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'msg_1' }), {
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
        'content-length': '881',
      },
    })));

    const { fetchMessage } = await import('./openrouter-client.js');
    const result = await fetchMessage({ baseUrl: 'http://example.com', apiKey: 'test' }, {});

    expect(result.headers['content-type']).toBe('application/json');
    expect(result.headers['content-encoding']).toBeUndefined();
    expect(result.headers['content-length']).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('sends Accept: application/json when the body is not streaming', async () => {
    vi.resetModules();
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal('fetch', mockFetch);
    const { fetchMessage } = await import('./openrouter-client.js');
    await fetchMessage({ baseUrl: 'http://x', apiKey: 'k' }, { stream: false });
    const init = (mockFetch.mock.calls[0] as any[])[1];
    expect(init.headers.Accept).toBe('application/json');
    vi.unstubAllGlobals();
  });

  it('sends Accept: text/event-stream when the body is streaming', async () => {
    vi.resetModules();
    const mockFetch = vi.fn(async () => new Response('data: {}\n\n', { headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', mockFetch);
    const { fetchMessage } = await import('./openrouter-client.js');
    await fetchMessage({ baseUrl: 'http://x', apiKey: 'k' }, { stream: true });
    const init = (mockFetch.mock.calls[0] as any[])[1];
    expect(init.headers.Accept).toBe('text/event-stream');
    vi.unstubAllGlobals();
  });

  it('classifies a client abort as client_closed', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn((_url: string, opts: any) => new Promise((_res, rej) => {
      opts.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    })));
    const { fetchMessage } = await import('./openrouter-client.js');
    const ac = new AbortController();
    const p = fetchMessage({ baseUrl: 'http://x', apiKey: 'k' }, {}, ac.signal, 60_000);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError', code: 'client_closed' });
    vi.unstubAllGlobals();
  });

  it('preserves the real status when an error body is not JSON', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>bad gateway</html>', { status: 429 })));
    const { fetchMessage } = await import('./openrouter-client.js');
    const out = await fetchMessage({ baseUrl: 'http://x', apiKey: 'k' }, {});
    expect(out.status).toBe(429);
    expect(out.body).toBe('<html>bad gateway</html>');
    vi.unstubAllGlobals();
  });

  it('collapses concurrent fetchModels calls into one upstream request', async () => {
    vi.resetModules();
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'a', name: 'A' }] })));
    vi.stubGlobal('fetch', mockFetch);
    const { fetchModels } = await import('./openrouter-client.js');
    const [a, b] = await Promise.all([fetchModels(), fetchModels()]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(a.models).toEqual(b.models);
    vi.unstubAllGlobals();
  });

  it('serves fetchModels from cache within the TTL and refetches after it', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'a', name: 'A' }] })));
    vi.stubGlobal('fetch', mockFetch);
    const { fetchModels } = await import('./openrouter-client.js');
    await fetchModels();
    await fetchModels();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 10 * 60_000 + 1);
    await fetchModels();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not cache a failed fetchModels response', async () => {
    vi.resetModules();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'a', name: 'A' }] })));
    vi.stubGlobal('fetch', mockFetch);
    const { fetchModels } = await import('./openrouter-client.js');
    await expect(fetchModels()).rejects.toThrow();
    const ok = await fetchModels();
    expect(ok.models).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('does not let one caller abort reject other fetchModels waiters', async () => {
    vi.resetModules();
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    vi.stubGlobal('fetch', vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify({ data: [{ id: 'a', name: 'A' }] }));
    }));
    const { fetchModels } = await import('./openrouter-client.js');
    const ac = new AbortController();
    const aborted = fetchModels(ac.signal);
    const survivor = fetchModels();
    ac.abort();
    await expect(aborted).rejects.toThrow();
    release();
    await expect(survivor).resolves.toEqual({ models: [{ id: 'a', name: 'A' }] });
    vi.unstubAllGlobals();
  });

  it('returns a copy of the cached models array', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'a', name: 'A' }] }))));
    const { fetchModels } = await import('./openrouter-client.js');
    const first = await fetchModels();
    first.models.push({ id: 'injected', name: 'x' });
    const second = await fetchModels();
    expect(second.models.map(m => m.id)).toEqual(['a']);
    vi.unstubAllGlobals();
  });

  it('collapses concurrent fetchEndpoints calls for the same model and key', async () => {
    vi.resetModules();
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ data: { endpoints: [{ tag: 'x' }] } })));
    vi.stubGlobal('fetch', mockFetch);
    const { fetchEndpoints } = await import('./openrouter-client.js');
    await Promise.all([fetchEndpoints('m', 'key'), fetchEndpoints('m', 'key')]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('keeps a separate endpoint cache entry per API key', async () => {
    vi.resetModules();
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ data: { endpoints: [{ tag: 'x' }] } })));
    vi.stubGlobal('fetch', mockFetch);
    const { fetchEndpoints } = await import('./openrouter-client.js');
    await fetchEndpoints('m', 'key-a');
    await fetchEndpoints('m', 'key-b');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('does not cache a failed endpoints response', async () => {
    vi.resetModules();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('bad', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { endpoints: [{ tag: 'x' }] } })));
    vi.stubGlobal('fetch', mockFetch);
    const { fetchEndpoints } = await import('./openrouter-client.js');
    await expect(fetchEndpoints('m', 'k')).rejects.toThrow();
    await expect(fetchEndpoints('m', 'k')).resolves.toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('returns a copy of the cached endpoints array', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { endpoints: [{ tag: 'x' }] } }))));
    const { fetchEndpoints } = await import('./openrouter-client.js');
    const first = await fetchEndpoints('m', 'k');
    first.push({ tag: 'injected' } as any);
    const second = await fetchEndpoints('m', 'k');
    expect(second.map(e => e.tag)).toEqual(['x']);
    vi.unstubAllGlobals();
  });

  it('handles pre-aborted signal', async () => {
    vi.resetModules();
    const mockFetch = vi.fn(); // should not be called
    vi.stubGlobal('fetch', mockFetch);

    const { fetchMessage } = await import('./openrouter-client.js');
    const config = { baseUrl: 'http://example.com', apiKey: 'test' };
    const body = { model: 'test', messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 };
    const controller = new AbortController();
    controller.abort();

    await expect(fetchMessage(config, body, controller.signal)).rejects.toMatchObject({ code: 'client_closed' });
    expect(mockFetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
