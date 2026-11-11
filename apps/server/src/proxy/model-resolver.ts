import type { ModelConfig, ProviderOptions } from '@shared/types';

const ALIAS_MAP: Record<string, keyof ModelConfig> = {
  'claude-fable-5': 'fable',
  'claude-fable-5-1': 'fable',
  'claude-opus-2': 'opus',
  'claude-sonnet-3.5': 'sonnet',
  'claude-haiku-3': 'haiku',
  // Claude Code env var aliases: ANTHROPIC_DEFAULT_OPUS_MODEL etc.
  'fable': 'fable',
  'opus': 'opus',
  'sonnet': 'sonnet',
  'haiku': 'haiku',
  // Claude Desktop gateway modu bu slot ID'lerini gönderir (GET /v1/models)
  'claude-fable': 'fable',
  'claude-opus': 'opus',
  'claude-sonnet': 'sonnet',
  'claude-haiku': 'haiku',
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

  // Claude Code sends the resolved ID (via modelOverrides), so match configured role IDs too.
  // shortcut: two roles sharing one ID resolve to the first role's options
  for (const role of ['fable', 'opus', 'sonnet', 'haiku'] as const) {
    const entry = parseModelValue(config[role]);
    if (entry.id && entry.id === requestModel) {
      return { resolved: requestModel, providerOptions: entry.providerOptions };
    }
  }

  // Pass through any non-alias model ID (assumed to be direct OpenRouter model)
  return { resolved: requestModel };
}

// OpenRouter'ın Anthropic uyumlu ucu camelCase allowFallbacks'ı reddeder
const WIRE_PROVIDER_KEYS: Record<string, string> = { allowFallbacks: 'allow_fallbacks' };

export function toWireProvider(opts: ProviderOptions): Record<string, unknown> {
  const wire: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(opts)) {
    if (value === undefined) continue;
    wire[WIRE_PROVIDER_KEYS[key] ?? key] = value;
  }
  return wire;
}

export function resolveModelAlias(requestModel: string, config: ModelConfig): string | null {
  const result = resolveModelStrict(requestModel, config);
  return 'resolved' in result ? result.resolved : null;
}
