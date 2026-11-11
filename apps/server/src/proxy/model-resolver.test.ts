import { describe, it, expect } from 'vitest';
import type { ModelConfig } from '@shared/types';
import { resolveModelStrict, resolveModelAlias } from './model-resolver.js';

describe('model resolver', () => {
  const config: ModelConfig = { opus: 'openrouter/claude-3-opus', sonnet: 'openrouter/claude-3-sonnet', haiku: 'openrouter/claude-3-haiku', fable: 'openrouter/fable' };

  it('resolves bare role names and [1m] variants', () => {
    expect(resolveModelStrict('opus', config)).toEqual({ resolved: 'openrouter/claude-3-opus' });
    expect(resolveModelStrict('sonnet[1m]', config)).toEqual({ resolved: 'openrouter/claude-3-sonnet' });
    expect(resolveModelStrict('haiku', config)).toEqual({ resolved: 'openrouter/claude-3-haiku' });
  });

  it('resolves canonical and Desktop slot IDs by role prefix, version ignored', () => {
    expect(resolveModelStrict('claude-opus-4-6', config)).toEqual({ resolved: 'openrouter/claude-3-opus' });
    expect(resolveModelStrict('claude-sonnet-4-6', config)).toEqual({ resolved: 'openrouter/claude-3-sonnet' });
    expect(resolveModelStrict('claude-haiku-4-5', config)).toEqual({ resolved: 'openrouter/claude-3-haiku' });
    expect(resolveModelStrict('claude-opus', config)).toEqual({ resolved: 'openrouter/claude-3-opus' });
    for (const id of ['fable', 'claude-fable', 'claude-fable-5', 'claude-fable-5-1']) {
      expect(resolveModelStrict(id, config)).toEqual({ resolved: 'openrouter/fable' });
    }
  });

  it('passes through direct model ID', () => {
    const result = resolveModelStrict('openrouter/deepseek-r1', config);
    expect(result).toEqual({ resolved: 'openrouter/deepseek-r1' });
  });

  it('passes through vendor IDs that merely contain a role name', () => {
    expect(resolveModelStrict('anthropic/claude-3-opus', config)).toEqual({ resolved: 'anthropic/claude-3-opus' });
    expect(resolveModelStrict('openrouter/anthropic/claude-sonnet-4', config)).toEqual({ resolved: 'openrouter/anthropic/claude-sonnet-4' });
  });

  it('returns error when alias configured but empty', () => {
    const emptyConfig: ModelConfig = { opus: '', sonnet: '', haiku: '', fable: '' };
    const result = resolveModelStrict('claude-opus-4-6', emptyConfig);
    expect(result).toHaveProperty('error');
  });

  it('passes through unknown model IDs unchanged', () => {
    const result = resolveModelStrict('openrouter/some-model', config);
    expect(result).toEqual({ resolved: 'openrouter/some-model' });
  });
});
