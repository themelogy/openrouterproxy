import { describe, it, expect } from 'vitest';
import { redactSensitive } from './logger.js';

describe('redactSensitive', () => {
  it('masks apiKey field', () => {
    const result = redactSensitive({ apiKey: 'secret-key' });
    expect(result.apiKey).toBe('********');
  });

  it('masks nested apiKey', () => {
    const result = redactSensitive({ openrouter: { apiKey: 'secret-key' } });
    expect((result as any).openrouter.apiKey).toBe('********');
  });

  it('masks token field', () => {
    const result = redactSensitive({ token: 'my-token' });
    expect(result.token).toBe('********');
  });

  it('leaves non-sensitive fields unchanged', () => {
    const result = redactSensitive({ host: 'localhost', port: 4000 });
    expect(result.host).toBe('localhost');
    expect(result.port).toBe(4000);
  });

  it('handles null and undefined', () => {
    expect(redactSensitive(null as unknown as Record<string, unknown>)).toBeNull();
    expect(redactSensitive(undefined as unknown as Record<string, unknown>)).toBeUndefined();
  });

  it('masks multiple sensitive keys', () => {
    const result = redactSensitive({ apiKey: 'key1', token: 'tok1', name: 'test' });
    expect(result.apiKey).toBe('********');
    expect(result.token).toBe('********');
    expect(result.name).toBe('test');
  });

  it('masks nested objects recursively', () => {
    const result = redactSensitive({ openrouter: { apiKey: 'secret', baseUrl: 'https://example.com' } });
    expect((result as any).openrouter.apiKey).toBe('********');
    expect((result as any).openrouter.baseUrl).toBe('https://example.com');
  });

  it('handles arrays', () => {
    const result = redactSensitive({ items: ['a', 'b'] });
    expect(result.items).toEqual(['a', 'b']);
  });
});
