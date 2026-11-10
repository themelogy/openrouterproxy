import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../index.js';

let server: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
  server = await createApp();
  await server.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = `http://127.0.0.1:${(server.server.address() as any).port}`;
});

afterAll(async () => { await server.close(); });

describe('request body size', () => {
  // Uzun Claude Code oturumları 1 MiB'ı aşan gövdeler gönderir; Fastify'ın
  // varsayılan limiti bunları 413 + connection: close ile keser ve istemci
  // yüklemeye devam ederken ECONNRESET görür.
  it('accepts a multi-megabyte /v1/messages body', async () => {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-2',
        messages: [{ role: 'user', content: 'x'.repeat(8 * 1024 * 1024) }],
        max_tokens: 10,
      }),
    });
    expect(res.status).not.toBe(413);
    expect(res.status).not.toBe(500);
  });
});
