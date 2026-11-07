import { describe, it, expect } from 'vitest';
import { countTokens } from './token-count.route.js';

describe('countTokens', () => {
  it('estimates tokens for a simple text message', () => {
    const messages = [{ role: 'user' as const, content: 'Hello world' }];
    const result = countTokens(messages);
    expect(typeof result.total_tokens).toBe('number');
    expect(result.total_tokens).toBeGreaterThan(0);
  });

  it('handles empty messages array', () => {
    const result = countTokens([]);
    expect(result.total_tokens).toBe(0);
  });

  it('counts tool messages', () => {
    const messages = [
      { role: 'user' as const, content: 'What is 2+2?' },
      { role: 'assistant' as const, content: [{ type: 'tool_use', id: 'tc1', name: 'calculator', input: { expression: '2+2' } }] },
      { role: 'tool' as const, content: '4', tool_call_id: 'tc1' },
    ];
    const result = countTokens(messages);
    expect(result.total_tokens).toBeGreaterThan(5); // tool messages add tokens
  });

  it('handles multi-modal messages (text + image)', () => {
    const messages = [
      { role: 'user' as const, content: [{ type: 'text', text: 'Describe this image' }] },
    ];
    const result = countTokens(messages);
    expect(result.total_tokens).toBeGreaterThan(0);
  });

  it('handles string content mixed with array content', () => {
    const messages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there!' },
    ];
    const result = countTokens(messages);
    expect(result.total_tokens).toBeGreaterThan(0);
  });

  it('counts image content blocks as ~850 tokens each', () => {
    const messages = [
      { role: 'user' as const, content: [{ type: 'image', source: { type: 'base64', data: 'x' } }] },
    ];
    const result = countTokens(messages);
    expect(result.total_tokens).toBeGreaterThanOrEqual(850); // at least one image block
  });

  it('counts tool_use blocks as ~16 tokens each', () => {
    const messages = [
      { role: 'assistant' as const, content: [{ type: 'tool_use', id: '1', name: 'calc', input: { x: 1 } }] },
    ];
    const result = countTokens(messages);
    expect(result.total_tokens).toBeGreaterThan(16); // base + tool_use tokens
  });
});
