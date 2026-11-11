import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync, copyFileSync, statSync, chmodSync } from 'fs';
import { randomUUID } from 'crypto';
import { dirname, join } from 'path';
import { homedir } from 'os';
import type { ModelConfig } from '@shared/types';

export const CLAUDE_SETTINGS_PATH = process.env.CLAUDE_SETTINGS_PATH
  || join(homedir(), '.claude', 'settings.json');

// Claude Code modelOverrides anahtarları yalnızca kanonik Anthropic model ID'lerini kabul eder
// (takma adlar "opus" gibi sessizce yok sayılır). Rol modeli boşsa anahtar silinir.
const ROLE_KEYS: Record<keyof ModelConfig, string> = {
  fable: 'claude-fable-5',
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
};

// /model menüsünde görünen etiketler; sürüm sabit, model ID'sinden türetilemez
const ROLE_LABELS: Record<keyof ModelConfig, string> = {
  fable: 'Fable 5.1',
  opus: 'Opus 4.6',
  sonnet: 'Sonnet 4.6',
  haiku: 'Haiku 4.5',
};

const ROLE_ENV: Record<keyof ModelConfig, string> = {
  fable: 'FABLE',
  opus: 'OPUS',
  sonnet: 'SONNET',
  haiku: 'HAIKU',
};

function modelId(value: ModelConfig[keyof ModelConfig]): string {
  if (typeof value === 'string') return value.trim();
  return (value?.id || '').trim();
}

// "deepseek/deepseek-v4.1-flash-1017" → "deepseek-v4.1-flash" (açıklama metni için kısa ad)
function shortModel(id: string): string {
  return (id.split('/').pop() || id).replace(/-\d+$/, '');
}

export function syncModelOverrides(models: ModelConfig): void {
  const exists = existsSync(CLAUDE_SETTINGS_PATH);
  let raw: Record<string, unknown> = {};
  if (exists) {
    // Bozuk settings.json'ın üzerine yazma — kullanıcının ayarları kaybolmasın
    const parsed = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('settings.json root must be an object');
    }
    raw = parsed;
  }

  const existing = raw.modelOverrides;
  const overrides: Record<string, string> = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...(existing as Record<string, string>) }
    : {};

  for (const role of Object.keys(ROLE_KEYS) as (keyof ModelConfig)[]) {
    const id = modelId(models[role]);
    if (id) overrides[ROLE_KEYS[role]] = id;
    else delete overrides[ROLE_KEYS[role]];
  }
  raw.modelOverrides = overrides;

  // /model seçicide rol adı ve açıklaması env'den okunur; rol boşsa üç anahtar da silinir
  const env: Record<string, string> = { ...(raw.env as Record<string, string> | undefined) };
  for (const role of Object.keys(ROLE_ENV) as (keyof ModelConfig)[]) {
    const id = modelId(models[role]);
    const prefix = `ANTHROPIC_DEFAULT_${ROLE_ENV[role]}_MODEL`;
    if (id) {
      env[prefix] = id;
      env[`${prefix}_NAME`] = ROLE_LABELS[role];
      env[`${prefix}_DESCRIPTION`] = `Custom ${ROLE_LABELS[role].split(' ')[0]} (${shortModel(id)})`;
    } else {
      delete env[prefix];
      delete env[`${prefix}_NAME`];
      delete env[`${prefix}_DESCRIPTION`];
    }
  }
  if (Object.keys(env).length > 0) raw.env = env;
  else delete raw.env;

  const dir = dirname(CLAUDE_SETTINGS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // settings.json gizli değerler içerebilir: mevcut izinleri koru, yenide 0600
  const mode = exists ? statSync(CLAUDE_SETTINGS_PATH).mode & 0o777 : 0o600;
  if (exists) copyFileSync(CLAUDE_SETTINGS_PATH, CLAUDE_SETTINGS_PATH + '.bak');

  const tmp = CLAUDE_SETTINGS_PATH + '.tmp.' + randomUUID();
  try {
    writeFileSync(tmp, JSON.stringify(raw, null, 2), { mode });
    chmodSync(tmp, mode);
    renameSync(tmp, CLAUDE_SETTINGS_PATH);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* tmp zaten yok */ }
    throw e;
  }
}
