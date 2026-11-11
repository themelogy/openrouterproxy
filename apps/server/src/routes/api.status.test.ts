import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

vi.mock('../config/store.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  maskApiKey: vi.fn((cfg: unknown) => cfg),
}));

import { loadConfig } from '../config/store.js';
import { register } from './api.route.js';

const config = (apiKey: string) => ({
  server: { host: '127.0.0.1', port: 4000, timeoutMs: 3_000_000 },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey },
  models: { opus: '', sonnet: '', haiku: '' },
});

let app: FastifyInstance;
beforeEach(async () => {
  app = Fastify();
  await register(app);
});
afterEach(async () => { await app.close(); vi.unstubAllGlobals(); });

function stubFetch(status: number) {
  const fetchMock = vi.fn(async (_url: string) => new Response('{}', { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('GET /api/status', () => {
  // /models herkese açık: yanlış anahtarla 200 döner, bu yüzden status her zaman yeşildi.
  it('reports upstream down when the key is rejected', async () => {
    vi.mocked(loadConfig).mockReturnValue(config('bad-key') as any);
    stubFetch(401);
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.json().upstreamOk).toBe(false);
  });

  it('reports upstream ok for a valid key', async () => {
    vi.mocked(loadConfig).mockReturnValue(config('good-key') as any);
    stubFetch(200);
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.json().upstreamOk).toBe(true);
  });

  it('reports upstream down without calling out when no key is set', async () => {
    vi.mocked(loadConfig).mockReturnValue(config('') as any);
    const fetchMock = stubFetch(200);
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.json().upstreamOk).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('probes /key, not the public /models endpoint', async () => {
    vi.mocked(loadConfig).mockReturnValue(config('k') as any);
    const fetchMock = stubFetch(200);
    await app.inject({ method: 'GET', url: '/api/status' });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/key$/);
  });
});

describe('POST /api/test-connection', () => {
  it('fails on an invalid key', async () => {
    vi.mocked(loadConfig).mockReturnValue(config('bad-key') as any);
    stubFetch(401);
    const res = await app.inject({ method: 'POST', url: '/api/test-connection' });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ ok: false, error: 'Invalid API key' });
  });
});
