import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { createApp } from '../index.js';

let server: FastifyInstance;
let baseUrl: string;
const testApiKey = process.env.OPENROUTER_API_KEY || '';

describe.skipIf(!testApiKey)('Claude Code session simulation', () => {
  beforeAll(async () => {
    server = await createApp();
    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = `http://127.0.0.1:${(server.server.address() as any).port}`;
  });

  afterAll(async () => { await server.close(); });

  it('completes a full conversation turn through the proxy', async () => {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'What is 2+2?' }],
        max_tokens: 10,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('assistant');
    expect(Array.isArray(body.content)).toBe(true);
  });

  it('handles multi-turn conversation with tool_use', async () => {
    const userRes = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'what is 2+2?' }],
        max_tokens: 100,
        tools: [{ type: 'function', function: { name: 'calculator', description: 'A calculator', parameters: {} } }],
      }),
    });
    expect(userRes.status).toBe(200);
    const userBody = await userRes.json();
    expect(userBody.role).toBe('assistant');

    // If the model decided to use a tool, verify the tool_use block
    if (userBody.content.some((c: any) => c.type === 'tool_use')) {
      const toolUse = userBody.content.find((c: any) => c.type === 'tool_use');
      expect(toolUse).toHaveProperty('id');
      expect(toolUse).toHaveProperty('name');
      expect(toolUse).toHaveProperty('input');
    }
  });

  it('forwards error responses from upstream correctly', async () => {
    // Send an invalid request to trigger a proper error mapping
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: -1, // Invalid — should get 400 from upstream
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.type).toBe('invalid_request_error');
  });
});
