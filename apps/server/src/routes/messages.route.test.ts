import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { register } from './messages.route.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await register(app);
  await app.ready();
});

afterAll(async () => { await app.close(); });

describe('messages route', () => {
  it('exports a register function', () => {
    expect(typeof register).toBe('function');
  });

  // Claude Desktop gateway modu bu ID filtrelerini uygular: tier anahtarı olmalı,
  // OpenRouter sağlayıcı adları (deepseek, gpt, qwen...) ID'de geçmemeli.
  it('exposes Claude tier slots over GET /v1/models', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/models?limit=1000' });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.has_more).toBe(false);
    expect(body.data.map((m: any) => m.id)).toEqual(['claude-opus', 'claude-sonnet', 'claude-haiku']);
    for (const m of body.data) {
      expect(m.anthropic_family_tier).toBe(m.id.replace('claude-', ''));
      expect(m.is_family_default).toBe(true);
      expect(typeof m.display_name).toBe('string');
      expect(typeof m.max_tokens).toBe('number');
    }
  });
});
