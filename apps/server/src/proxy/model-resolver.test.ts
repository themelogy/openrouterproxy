import { describe, it, expect } from 'vitest';
import type { ModelConfig } from '@shared/types';
import { resolveModelStrict, resolveModelAlias } from './model-resolver.js';

describe('model resolver', () => {
  const config: ModelConfig = { fable: '', opus: 'openrouter/claude-3-opus', sonnet: 'openrouter/claude-3-sonnet', haiku: 'openrouter/claude-3-haiku' };

  it('resolves fable alias', () => {
    const fableConfig: ModelConfig = { fable: 'openrouter/fable', opus: 'openrouter/claude-3-opus', sonnet: '', haiku: '' };
    expect(resolveModelStrict('claude-fable-5', fableConfig)).toEqual({ resolved: 'openrouter/fable' });
    expect(resolveModelStrict('claude-fable', fableConfig)).toEqual({ resolved: 'openrouter/fable' });
  });

  it('resolves opus alias', () => {
    const result = resolveModelStrict('claude-opus-4-6', config);
    expect(result).toEqual({ resolved: 'openrouter/claude-3-opus' });
  });

  it('resolves sonnet alias', () => {
    const result = resolveModelStrict('claude-sonnet-4-6', config);
    expect(result).toEqual({ resolved: 'openrouter/claude-3-sonnet' });
  });

  it('resolves haiku alias', () => {
    const result = resolveModelStrict('claude-haiku-4-5', config);
    expect(result).toEqual({ resolved: 'openrouter/claude-3-haiku' });
  });

  it('resolves Claude Desktop gateway slot IDs', () => {
    expect(resolveModelStrict('claude-opus', config)).toEqual({ resolved: 'openrouter/claude-3-opus' });
    expect(resolveModelStrict('claude-sonnet', config)).toEqual({ resolved: 'openrouter/claude-3-sonnet' });
    expect(resolveModelStrict('claude-haiku', config)).toEqual({ resolved: 'openrouter/claude-3-haiku' });
  });

  it('rejects a model that no role is configured for', () => {
    const result = resolveModelStrict('openrouter/deepseek-r1', config);
    expect(result).toHaveProperty('error');
  });

  it('returns error when alias configured but empty', () => {
    const emptyConfig: ModelConfig = { fable: '', opus: '', sonnet: '', haiku: '' };
    const result = resolveModelStrict('claude-opus-4-6', emptyConfig);
    expect(result).toHaveProperty('error');
  });

  it('rejects unknown model IDs', () => {
    const result = resolveModelStrict('openrouter/some-model', config);
    expect(result).toHaveProperty('error');
  });
});
