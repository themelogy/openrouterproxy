import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// Upstream'e çıkmadan hata gövdesi dönüşümünü sınamak için fetchMessage sahtelenir.
const upstream = vi.hoisted(() => ({ reply: null as null | { status: number; body: unknown } }));

vi.mock('../config/store.js', () => ({
  loadConfig: () => ({
    server: { host: '127.0.0.1', port: 4000, timeoutMs: 3_000_000 },
    openrouter: { baseUrl: 'https://example.test/api/v1', apiKey: 'k' },
    models: { opus: 'test/opus', sonnet: 'test/sonnet', haiku: 'test/haiku' },
  }),
}));

vi.mock('../proxy/openrouter-client.js', async (orig) => {
  const actual = await orig<typeof import('../proxy/openrouter-client.js')>();
  return {
    ...actual,
    fetchMessage: async () => ({ status: upstream.reply!.status, headers: {}, body: upstream.reply!.body }),
  };
});

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  const { register } = await import('./messages.route.js');
  await register(app);
  await app.ready();
});

afterAll(async () => { await app.close(); });

function post() {
  return app.inject({
    method: 'POST',
    url: '/v1/messages',
    payload: { model: 'claude-sonnet', messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 },
  });
}

describe('upstream error mapping', () => {
  it('keeps an Anthropic-shaped error body untouched', async () => {
    const body = { type: 'error', error: { type: 'invalid_request_error', message: 'bad' } };
    upstream.reply = { status: 400, body };
    const res = await post();
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(body);
  });

  it('maps a non-Anthropic error body by status', async () => {
    upstream.reply = { status: 429, body: { detail: 'slow down' } };
    const res = await post();
    expect(res.statusCode).toBe(429);
    expect(res.json().error.type).toBe('rate_limit_error');
  });

  it('passes successful responses through unchanged', async () => {
    const body = { type: 'message', content: [] };
    upstream.reply = { status: 200, body };
    const res = await post();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(body);
  });
});
