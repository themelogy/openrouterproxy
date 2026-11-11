import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { register, withPromptCache, pickSessionId, extractUsage, tapSseUsage } from './messages.route.js';

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
    expect(body.data.map((m: any) => m.id)).toEqual(['claude-fable', 'claude-opus', 'claude-sonnet', 'claude-haiku']);
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

describe('extractUsage', () => {
  it('extracts Anthropic usage fields and OpenRouter cost', () => {
    const usage = extractUsage({
      usage: {
        input_tokens: 120,
        output_tokens: 30,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 200,
        cost: 0.0042,
      },
    });
    expect(usage).toEqual({ inputTokens: 120, outputTokens: 30, cachedInputTokens: 1000, cacheWriteTokens: 200, cost: 0.0042 });
  });

  it('returns an empty usage object for a stream or a malformed body', () => {
    expect(extractUsage(new ReadableStream())).toEqual({});
    expect(extractUsage(undefined)).toEqual({});
  });
});

describe('tapSseUsage', () => {
  it('passes bytes through untouched and merges usage from events split across chunks', async () => {
    const events = [
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":120,"cache_read_input_tokens":1000}}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":30,"cost":0.0042}}\n\n',
    ].join('');
    // Satır ortasında bölünmüş chunk'lar; tail tamponu bunu toparlamalı
    const chunks = [events.slice(0, 40), events.slice(40, 95), events.slice(95)];
    const source = new ReadableStream<Uint8Array>({
      start(c) { for (const s of chunks) c.enqueue(new TextEncoder().encode(s)); c.close(); },
    });

    const usage: Record<string, number | undefined> = {};
    const text = await new Response(tapSseUsage(source, u => Object.assign(usage, u))).text();

    expect(text).toBe(events);
    expect(usage).toEqual({ inputTokens: 120, outputTokens: 30, cachedInputTokens: 1000, cacheWriteTokens: undefined, cost: 0.0042 });
  });
});

describe('pickSessionId', () => {
  it('prefers a body session_id over headers', () => {
    expect(pickSessionId({ session_id: 'body-id' }, { 'x-claude-code-session-id': 'hdr' })).toBe('body-id');
  });

  it('falls back to x-claude-code-session-id then x-session-id', () => {
    expect(pickSessionId({}, { 'x-claude-code-session-id': 'a' })).toBe('a');
    expect(pickSessionId({}, { 'x-session-id': 'b' })).toBe('b');
  });

  it('rejects empty, non-string, and over-256-character values without inventing one', () => {
    expect(pickSessionId({}, {})).toBeUndefined();
    expect(pickSessionId({}, { 'x-session-id': '' })).toBeUndefined();
    expect(pickSessionId({}, { 'x-session-id': ['a', 'b'] })).toBeUndefined();
    expect(pickSessionId({}, { 'x-session-id': 'x'.repeat(257) })).toBeUndefined();
    expect(pickSessionId({}, { 'x-session-id': 'x'.repeat(256) })).toBe('x'.repeat(256));
  });
});
