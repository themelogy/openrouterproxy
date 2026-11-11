import type { ModelConfig, ProviderOptions } from '@shared/types';

const ROLES = ['fable', 'opus', 'sonnet', 'haiku'] as const;

// "sonnet", "opus[1m]", "claude-sonnet-5-5", "claude-fable-5-1", "claude-haiku-5-5" → rol adı.
// Sürüm eki önemsiz; tanınmayan ID (ör. openrouter/claude-3-opus) olduğu gibi geçer.
function roleOf(model: string): keyof ModelConfig | undefined {
  const m = model.toLowerCase().replace(/\[1m\]$/, '');
  const s = m.startsWith('claude-') ? m.slice(7) : m;
  return ROLES.find(r => s === r || s.startsWith(`${r}-`));
}

export interface ResolvedModel {
  resolved: string;
  providerOptions?: ProviderOptions;
}

function parseModelValue(value: ModelConfig['opus']): { id: string; providerOptions?: ProviderOptions } {
  if (typeof value === 'string') return { id: value };
  return { id: value.id, providerOptions: value.providerOptions };
}

export function resolveModelStrict(requestModel: string, config: ModelConfig): { resolved: string; providerOptions?: ProviderOptions } | { error: string } {
  const alias = roleOf(requestModel);
  if (alias) {
    const entry = parseModelValue(config[alias]);
    if (!entry.id) return { error: `Model alias "${requestModel}" is configured but the ${alias} model ID is empty` };
    return { resolved: entry.id, providerOptions: entry.providerOptions };
  }

  // Claude Code sends the resolved ID (via modelOverrides), so match configured role IDs too.
  // shortcut: two roles sharing one ID resolve to the first role's options
  for (const role of ROLES) {
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
