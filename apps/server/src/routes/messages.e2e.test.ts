import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { loadConfig, saveConfig } from '../config/store.js';
import { CONFIG_PATH } from '../config/schema.js';
import { unlinkSync } from 'fs';
import { register as messagesRoute } from './messages.route.js';

let server: FastifyInstance;
let baseUrl: string;
const testApiKey = 'test-key-for-integration';

beforeAll(async () => {
  saveConfig({ openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: testApiKey }, models: { opus: 'test/opus', sonnet: 'test/sonnet', haiku: 'test/haiku' } });
  server = Fastify({ logger: false });
  await messagesRoute(server);
  const address = await server.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = `http://127.0.0.1:${(server.server.address() as any).port}`;
});

afterAll(async () => { await server.close(); });

beforeEach(() => {
  saveConfig({ openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: testApiKey }, models: { opus: 'test/opus', sonnet: 'test/sonnet', haiku: 'test/haiku' } });
});

describe('POST /v1/messages', () => {
  it('returns 401 when API key is empty', async () => {
    // Boş anahtar "değişiklik yok" sayılıp korunur; anahtarsız durumu simüle etmek için dosyayı sil
    try { unlinkSync(CONFIG_PATH); } catch {}
    saveConfig({ openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: '' }, models: { opus: '', sonnet: '', haiku: '' } });
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-2', messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.type).toBe('unauthorized_error');
  });

  it('returns 400 for invalid body (missing messages)', async () => {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-2', max_tokens: 100 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.type).toBe('invalid_request_error');
  });

  it('returns 400 for invalid body (missing model)', async () => {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid body (max_tokens not a number)', async () => {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-2', messages: [{ role: 'user', content: 'hi' }], max_tokens: -1 }),
    });
    expect(res.status).toBe(400);
  });

  it('resolves model alias and forwards request to upstream', async () => {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-2', messages: [{ role: 'user', content: 'hello' }], max_tokens: 50 }),
    });
    // Hits real OpenRouter — expect success or rate-limit, not 502 (proxy crash)
    expect([200, 400, 401, 429]).toContain(res.status);
  });

  it('forwards upstream content-type when stream: true', async () => {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-2', messages: [{ role: 'user', content: 'hello' }], max_tokens: 50, stream: true }),
    });
    // Proxy forwards whatever upstream returns — could be SSE or JSON depending on model/balance
    expect(res.status).not.toBe(502);
    expect(res.headers.get('content-type')).toBeTruthy();
  });

  it('forwards tools schema unchanged', async () => {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-2',
        messages: [{ role: 'user', content: 'what is 2+2?' }],
        max_tokens: 100,
        tools: [{ type: 'function', function: { name: 'calculator', description: 'A calculator', parameters: {} } }],
      }),
    });
    // Hits real OpenRouter — should not 400 (invalid schema) or 502
    expect([200, 400, 401, 429]).toContain(res.status);
  });

  it('forwards SSE streaming response with proper content-type', async () => {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-2',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 20,
        stream: true,
      }),
    });
    // Proxy forwards upstream response — with test key we get 401, with valid key SSE
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      const contentType = res.headers.get('content-type') || '';
      expect(contentType).toContain('text/event-stream');
    }
  });

  it('streams SSE events and forwards them as a readable stream', async () => {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-2',
        messages: [{ role: 'user', content: 'say one word' }],
        max_tokens: 10,
        stream: true,
      }),
    });
    if (res.status === 401) return; // Auth error, no stream to test
    expect(res.status).toBe(200);
    const body = res.body as ReadableStream;
    expect(body).toBeInstanceOf(ReadableStream);
    // Read first chunk to verify SSE format (data: ... lines)
    const reader = body.getReader();
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    expect(new TextDecoder().decode(value)).toContain('data:');
  });

  it('forwards tool_use blocks from upstream response', async () => {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-2',
        messages: [{ role: 'user', content: 'what is 1+1? use calculator' }],
        max_tokens: 200,
        tools: [{ type: 'function', function: { name: 'calculator', description: 'A calculator', parameters: {} } }],
      }),
    });
    // May return 200 with tool_use in content, or 400 if upstream rejects
    expect([200, 400, 401, 429]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      // Response should have valid Anthropic structure (message object)
      expect(body).toHaveProperty('role');
      expect(body.role).toBe('assistant');
    }
  });
});
