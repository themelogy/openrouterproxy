import { describe, it, expect } from 'vitest';
import { mapOpenRouterError, normalizeOpenRouterError } from './error-mapper.js';

describe('mapOpenRouterError', () => {
  it('maps 401 to unauthenticated_error', () => {
    const result = mapOpenRouterError(401, {});
    expect(result.error.type).toBe('unauthenticated_error');
  });

  it('maps 429 to rate_limit_error', () => {
    const result = mapOpenRouterError(429, {});
    expect(result.error.type).toBe('rate_limit_error');
  });

  it('maps 502 to upstream_error', () => {
    const result = mapOpenRouterError(502, {});
    expect(result.error.type).toBe('upstream_error');
  });

  it('maps 504 to timeout_error', () => {
    const result = mapOpenRouterError(504, {});
    expect(result.error.type).toBe('timeout_error');
  });

  it('maps unknown status to upstream_error with status code in message', () => {
    const result = mapOpenRouterError(503, {});
    expect(result.error.type).toBe('upstream_error');
    expect(typeof result.error.message).toBe('string');
  });

  it('maps 500 to server_error', () => {
    const result = mapOpenRouterError(500, {});
    expect(result.error.type).toBe('server_error');
  });
});

describe('normalizeOpenRouterError', () => {
  it('returns OpenRouter error body as-is when structured with error property', () => {
    const body = { error: { message: 'Rate limit exceeded', type: 'rate_limit', code: 429 } };
    const result = normalizeOpenRouterError(body);
    expect(result).toEqual(body);
  });

  it('returns null for non-error bodies (message response)', () => {
    const body = { id: 'msg_123', content: [], type: 'message' };
    expect(normalizeOpenRouterError(body)).toBeNull();
  });

  it('returns null for plain strings', () => {
    expect(normalizeOpenRouterError('error text')).toBeNull();
  });

  it('returns null for arrays', () => {
    expect(normalizeOpenRouterError([])).toBeNull();
  });

  it('returns null for numbers', () => {
    expect(normalizeOpenRouterError(42)).toBeNull();
  });

  it('returns null for null', () => {
    expect(normalizeOpenRouterError(null)).toBeNull();
  });
});
