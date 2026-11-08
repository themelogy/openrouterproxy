import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { register, withPromptCache } from './messages.route.js';

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

describe('withPromptCache', () => {
  it('adds one top-level breakpoint for a Claude model when enabled', () => {
    const out = withPromptCache({ messages: [{ role: 'user', content: 'hi' }] }, true, 'anthropic/claude-sonnet-4');
    expect(out.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('does nothing when disabled or for a non-Claude model', () => {
    expect(withPromptCache({ messages: [] }, false, 'anthropic/claude-sonnet-4')).not.toHaveProperty('cache_control');
    expect(withPromptCache({ messages: [] }, true, 'deepseek/deepseek-chat')).not.toHaveProperty('cache_control');
  });

  // claude-* slotlarını kullanıcı non-Claude modellere override edebilir; karar çözümlenmiş
  // upstream modeline göre verilir, istemcinin gönderdiği alias'a göre değil.
  it('keys off the resolved model, not the client alias, when slots are overridden', () => {
    expect(withPromptCache({ messages: [] }, true, 'deepseek/deepseek-chat')).not.toHaveProperty('cache_control');
    expect(withPromptCache({ messages: [] }, true, 'google/gemini-2.5-pro')).not.toHaveProperty('cache_control');
    expect(withPromptCache({ messages: [] }, true, 'anthropic/claude-sonnet-4')).toHaveProperty('cache_control');
    expect(withPromptCache({ messages: [] }, true, 'openrouter/anthropic/claude-sonnet-4')).toHaveProperty('cache_control');
  });

  it('does not override an explicit breakpoint anywhere in the body', () => {
    const top = withPromptCache({ cache_control: { type: 'ephemeral', ttl: '1h' } }, true, 'claude-x');
    expect(top.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });

    const nested = withPromptCache(
      { system: [{ type: 'text', text: 's', cache_control: { type: 'ephemeral' } }] },
      true,
      'claude-x',
    );
    expect(nested).not.toHaveProperty('cache_control');

    const inMessage = withPromptCache(
      { messages: [{ role: 'user', content: [{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }] }] },
      true,
      'claude-x',
    );
    expect(inMessage).not.toHaveProperty('cache_control');
  });
});
