import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync, copyFileSync, statSync, chmodSync } from 'fs';
import { randomUUID } from 'crypto';
import { dirname, join } from 'path';
import { homedir } from 'os';
import type { ModelConfig } from '@shared/types';

export const CLAUDE_SETTINGS_PATH = process.env.CLAUDE_SETTINGS_PATH
  || join(homedir(), '.claude', 'settings.json');

// Claude Code modelOverrides anahtarları yalnızca kanonik Anthropic model ID'lerini kabul eder
// (takma adlar "opus" gibi sessizce yok sayılır). Rol modeli boşsa anahtar silinir.
const ROLE_KEYS: Record<keyof ModelConfig, string[]> = {
  opus: ['claude-opus-4-6', 'claude-opus-5-5'],
  sonnet: ['claude-sonnet-4-6', 'claude-sonnet-5', 'claude-sonnet-5-5'],
  haiku: ['claude-haiku-4-5', 'claude-haiku-5-5'],
};

function modelId(value: ModelConfig[keyof ModelConfig]): string {
  if (typeof value === 'string') return value.trim();
  return (value?.id || '').trim();
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
    for (const key of ROLE_KEYS[role]) {
      if (id) overrides[key] = id;
      else delete overrides[key];
    }
  }
  raw.modelOverrides = overrides;

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
