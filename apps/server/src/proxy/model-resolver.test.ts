import { describe, it, expect } from 'vitest';
import type { ModelConfig } from '@shared/types';
import { resolveModelStrict, resolveModelAlias } from './model-resolver.js';

describe('model resolver', () => {
  const config: ModelConfig = { opus: 'openrouter/claude-3-opus', sonnet: 'openrouter/claude-3-sonnet', haiku: 'openrouter/claude-3-haiku', fable: 'openrouter/fable' };

  it('resolves opus alias', () => {
    const result = resolveModelStrict('claude-opus-2', config);
    expect(result).toEqual({ resolved: 'openrouter/claude-3-opus' });
  });

  it('resolves sonnet alias', () => {
    const result = resolveModelStrict('claude-sonnet-3.5', config);
    expect(result).toEqual({ resolved: 'openrouter/claude-3-sonnet' });
  });

  it('resolves haiku alias', () => {
    const result = resolveModelStrict('claude-haiku-3', config);
    expect(result).toEqual({ resolved: 'openrouter/claude-3-haiku' });
  });

  it('resolves fable aliases and canonical IDs to the fable role', () => {
    for (const id of ['fable', 'claude-fable', 'claude-fable-5', 'claude-fable-5-1']) {
      expect(resolveModelStrict(id, config)).toEqual({ resolved: 'openrouter/fable' });
    }
  });

  it('resolves Claude Desktop gateway slot IDs', () => {
    expect(resolveModelStrict('claude-opus', config)).toEqual({ resolved: 'openrouter/claude-3-opus' });
    expect(resolveModelStrict('claude-sonnet', config)).toEqual({ resolved: 'openrouter/claude-3-sonnet' });
    expect(resolveModelStrict('claude-haiku', config)).toEqual({ resolved: 'openrouter/claude-3-haiku' });
  });

  it('passes through direct model ID', () => {
    const result = resolveModelStrict('openrouter/deepseek-r1', config);
    expect(result).toEqual({ resolved: 'openrouter/deepseek-r1' });
  });

  it('returns error when alias configured but empty', () => {
    const emptyConfig: ModelConfig = { opus: '', sonnet: '', haiku: '', fable: '' };
    const result = resolveModelStrict('claude-opus-2', emptyConfig);
    expect(result).toHaveProperty('error');
  });

  it('passes through unknown model IDs unchanged', () => {
    const result = resolveModelStrict('openrouter/some-model', config);
    expect(result).toEqual({ resolved: 'openrouter/some-model' });
  });
});
