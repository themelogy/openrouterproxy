import { describe, it, expect, vi } from 'vitest';
import type { FastifyInstance, FastifyRequest } from 'fastify';

// Mock loadConfig
vi.mock('../config/store.js', () => ({
  loadConfig: vi.fn(() => ({
    server: { host: '127.0.0.1', port: 4000, timeoutMs: 3_000_000 },
    openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: '' },
    models: { opus: '', sonnet: '', haiku: '' },
    security: { localAuthToken: 'test-token', allowRemote: false },
  })),
}));

import { authGuard } from './auth.guard.js';

function mockRequest(ip: string, headers: Record<string, unknown> = {}): FastifyRequest {
  return { ip, headers } as unknown as FastifyRequest;
}

describe('auth guard', () => {
  it('rejects remote IP when allowRemote is not set', async () => {
    const req = mockRequest('192.168.1.1');
    await expect(authGuard(req)).rejects.toThrow('Forbidden: management API only accessible on localhost');
  });

  it('allows loopback IPv4 with a valid token', async () => {
    const req = mockRequest('127.0.0.1', { authorization: 'Bearer test-token' });
    await expect(authGuard(req)).resolves.toBeUndefined();
  });

  it('allows loopback IPv6 with a valid token', async () => {
    const req = mockRequest('::1', { authorization: 'Bearer test-token' });
    await expect(authGuard(req)).resolves.toBeUndefined();
  });

  it('rejects non-loopback IPv6', async () => {
    const req = mockRequest('2001:db8::1');
    await expect(authGuard(req)).rejects.toThrow('Forbidden: management API only accessible on localhost');
  });

  it('rejects a missing token when one is configured', async () => {
    const req = mockRequest('127.0.0.1');
    await expect(authGuard(req)).rejects.toThrow('Unauthorized: invalid local auth token');
  });

  it('rejects invalid local auth token', async () => {
    const req = mockRequest('127.0.0.1', { authorization: 'Bearer wrong-token' });
    await expect(authGuard(req)).rejects.toThrow('Unauthorized: invalid local auth token');
  });
});
