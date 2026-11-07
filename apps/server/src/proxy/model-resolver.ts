import type { ModelConfig, ProviderOptions } from '@shared/types';

const ALIAS_MAP: Record<string, keyof ModelConfig> = {
  'claude-opus-2': 'opus',
  'claude-sonnet-3.5': 'sonnet',
  'claude-haiku-3': 'haiku',
  // Claude Code env var aliases: ANTHROPIC_DEFAULT_OPUS_MODEL etc.
  'opus': 'opus',
  'sonnet': 'sonnet',
  'haiku': 'haiku',
};

export interface ResolvedModel {
  resolved: string;
  providerOptions?: ProviderOptions;
}

function parseModelValue(value: ModelConfig['opus']): { id: string; providerOptions?: ProviderOptions } {
  if (typeof value === 'string') return { id: value };
  return { id: value.id, providerOptions: value.providerOptions };
}

export function resolveModelStrict(requestModel: string, config: ModelConfig): { resolved: string; providerOptions?: ProviderOptions } | { error: string } {
  const alias = ALIAS_MAP[requestModel];
  if (alias) {
    const entry = parseModelValue(config[alias]);
    if (!entry.id) return { error: `Model alias "${requestModel}" is configured but the ${alias} model ID is empty` };
    return { resolved: entry.id, providerOptions: entry.providerOptions };
  }

  // Pass through any non-alias model ID (assumed to be direct OpenRouter model)
  return { resolved: requestModel };
}

export function resolveModelAlias(requestModel: string, config: ModelConfig): string | null {
  const result = resolveModelStrict(requestModel, config);
  return 'resolved' in result ? result.resolved : null;
}
