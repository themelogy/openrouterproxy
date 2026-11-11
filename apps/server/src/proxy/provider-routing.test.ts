import { describe, it, expect } from 'vitest';
import type { ModelConfig } from '@shared/types';
import { resolveModelStrict, toWireProvider } from './model-resolver.js';

describe('provider routing', () => {
  it('returns provider options when model config uses object format with sort', () => {
    const config: ModelConfig = {
      opus: { id: 'anthropic/claude-3.5-sonnet', providerOptions: { sort: 'price' } },
      sonnet: '',
      haiku: '',
      fable: '',
    };
    const result = resolveModelStrict('claude-opus-2', config);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.resolved).toBe('anthropic/claude-3.5-sonnet');
      expect(result.providerOptions).toEqual({ sort: 'price' });
    }
  });

  it('returns provider options with only filter', () => {
    const config: ModelConfig = {
      opus: { id: 'anthropic/claude-3.5-sonnet', providerOptions: { only: ['together', 'fireworks'], allowFallbacks: false } },
      sonnet: '',
      haiku: '',
      fable: '',
    };
    const result = resolveModelStrict('claude-opus-2', config);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.providerOptions).toEqual({ only: ['together', 'fireworks'], allowFallbacks: false });
    }
  });

  it('returns provider options with ignore filter', () => {
    const config = {
      opus: { id: 'anthropic/claude-3.5-sonnet', providerOptions: { ignore: ['deepseek'] } },
      sonnet: '',
      haiku: '',
      fable: '',
    };
    const result = resolveModelStrict('claude-opus-2', config);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.providerOptions).toEqual({ ignore: ['deepseek'] });
    }
  });

  it('returns no provider options for string config (backward compat)', () => {
    const config = {
      opus: 'anthropic/claude-3.5-sonnet',
      sonnet: '',
      haiku: '',
      fable: '',
    };
    const result = resolveModelStrict('claude-opus-2', config);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.resolved).toBe('anthropic/claude-3.5-sonnet');
      expect(result.providerOptions).toBeUndefined();
    }
  });

  it('passes through non-alias model without provider options', () => {
    const config = { opus: '', sonnet: '', haiku: '', fable: '' };
    const result = resolveModelStrict('anthropic/claude-3.5-haiku', config);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.resolved).toBe('anthropic/claude-3.5-haiku');
      expect(result.providerOptions).toBeUndefined();
    }
  });

  it('handles empty model ID in object format', () => {
    const config: ModelConfig = {
      opus: { id: '', providerOptions: { sort: 'price' as const } },
      sonnet: '',
      haiku: '',
      fable: '',
    };
    const result = resolveModelStrict('claude-opus-2', config);
    expect('error' in result).toBe(true);
  });

  it('handles empty model ID string (backward compat)', () => {
    const config = { opus: '', sonnet: '', haiku: '', fable: '' };
    const result = resolveModelStrict('claude-opus-2', config);
    expect('error' in result).toBe(true);
  });

  it('supports throughput sort strategy', () => {
    const config: ModelConfig = {
      opus: '',
      sonnet: { id: 'anthropic/claude-3.5-sonnet', providerOptions: { sort: 'throughput' as const } },
      haiku: '',
      fable: '',
    };
    const result = resolveModelStrict('claude-sonnet-5-5', config);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.providerOptions).toEqual({ sort: 'throughput' as const });
    }
  });

  it('applies role provider options when Claude Code sends the resolved ID', () => {
    const config: ModelConfig = {
      opus: { id: 'deepseek/deepseek-v4.1-flash-1017', providerOptions: { only: ['inference-net/us'], allowFallbacks: false } },
      sonnet: '',
      haiku: '',
      fable: '',
    };
    const result = resolveModelStrict('deepseek/deepseek-v4.1-flash-1017', config);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.providerOptions).toEqual({ only: ['inference-net/us'], allowFallbacks: false });
    }
  });

  it('serializes allowFallbacks as allow_fallbacks for the wire', () => {
    expect(toWireProvider({ only: ['inference-net/us'], allowFallbacks: false, sort: 'price' }))
      .toEqual({ only: ['inference-net/us'], allow_fallbacks: false, sort: 'price' });
  });

  it('supports all provider options together', () => {
    const config: ModelConfig = {
      opus: { id: 'anthropic/claude-3.5-opus', providerOptions: { sort: 'price' as const, only: ['fireworks'], ignore: ['deepseek'], allowFallbacks: false } },
      sonnet: '',
      haiku: '',
      fable: '',
    };
    const result = resolveModelStrict('claude-opus-2', config);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.providerOptions).toEqual({ sort: 'price' as const, only: ['fireworks'], ignore: ['deepseek'], allowFallbacks: false });
    }
  });
});
