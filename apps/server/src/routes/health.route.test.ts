import { describe, it, expect } from 'vitest';

describe('health route', () => {
  it('exports a register function', async () => {
    const route = await import('./health.route.js');
    expect(typeof route.register).toBe('function');
  });
});
