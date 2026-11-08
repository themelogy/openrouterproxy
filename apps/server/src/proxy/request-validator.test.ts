import { describe, it, expect } from 'vitest';
import { stripAnthropicFields } from './request-validator.js';

describe('stripAnthropicFields', () => {
  const body = {
    model: 'claude-sonnet',
    messages: [{ role: 'user', content: 'hi' }],
    tools: [{ name: 'read' }],
    cache_control: { type: 'ephemeral' },
    context_management: { edits: [] },
  };

  it('passes every field through when the strip list is empty', () => {
    expect(stripAnthropicFields(body)).toEqual(body);
  });

  it('removes only the listed keys', () => {
    const out = stripAnthropicFields(body, ['context_management']);
    expect(out).not.toHaveProperty('context_management');
    expect(out).toHaveProperty('cache_control');
    expect(out).toHaveProperty('tools');
  });
});
