import { describe, it, expect } from 'vitest';

describe('messages route', () => {
  it('exports a register function', async () => {
    const route = await import('./messages.route.js');
    expect(typeof route.register).toBe('function');
  });
});
