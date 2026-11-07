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

  it('rejects with timeout_error when request exceeds timeout', async () => {
    const mockFetch = vi.fn((url: string, opts: { signal?: AbortSignal }) => {
      return new Promise((_, reject) => {
        opts.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
      });
    });
    globalThis.fetch = mockFetch as any;

    const { fetchMessage } = await import('./openrouter-client.js');
    const config = { baseUrl: 'http://example.com', apiKey: 'test' };
    const body = { model: 'test', messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 };

    await expect(fetchMessage(config, 'test', body, undefined, 10)).rejects.toThrow('timeout');
  });

  it('forwards upstream response when within timeout', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ id: 'msg_1', content: [], type: 'message' }),
    });
    globalThis.fetch = mockFetch as any;

    const { fetchMessage } = await import('./openrouter-client.js');
    const config = { baseUrl: 'http://example.com', apiKey: 'test' };
    const body = { model: 'test', messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 };

    const result = await fetchMessage(config, 'test', body);
    expect(result.status).toBe(200);
  });

  it('drops content-encoding/content-length from upstream headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Map([['content-type', 'application/json'], ['content-encoding', 'gzip'], ['content-length', '881']]),
      json: async () => ({ id: 'msg_1' }),
    });
    globalThis.fetch = mockFetch as any;

    const { fetchMessage } = await import('./openrouter-client.js');
    const result = await fetchMessage({ baseUrl: 'http://example.com', apiKey: 'test' }, 'test', {});

    expect(result.headers['content-type']).toBe('application/json');
    expect(result.headers['content-encoding']).toBeUndefined();
    expect(result.headers['content-length']).toBeUndefined();
  });

  it('rejects when client abort signal fires', async () => {
    const controller = new AbortController();

    const mockFetch = vi.fn((url: string, opts: { signal?: AbortSignal }) => {
      return new Promise((_, reject) => {
        opts.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
      });
    });
    globalThis.fetch = mockFetch as any;

    const { fetchMessage } = await import('./openrouter-client.js');
    const config = { baseUrl: 'http://example.com', apiKey: 'test' };
    const body = { model: 'test', messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 };

    // Abort after 5ms (shorter than default 30s timeout)
    setTimeout(() => controller.abort(), 5);

    await expect(fetchMessage(config, 'test', body, controller.signal)).rejects.toThrow('timeout');
  });

  it('handles pre-aborted signal', async () => {
    const mockFetch = vi.fn(); // should not be called
    globalThis.fetch = mockFetch as any;

    const { fetchMessage } = await import('./openrouter-client.js');
    const config = { baseUrl: 'http://example.com', apiKey: 'test' };
    const body = { model: 'test', messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 };
    const controller = new AbortController();
    controller.abort();

    await expect(fetchMessage(config, 'test', body, controller.signal)).rejects.toThrow('timeout');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
