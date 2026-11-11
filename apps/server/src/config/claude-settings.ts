import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync, copyFileSync, statSync, chmodSync } from 'fs';
import { randomUUID } from 'crypto';
import { dirname, join } from 'path';
import { homedir } from 'os';
import type { ModelConfig } from '@shared/types';

export const CLAUDE_SETTINGS_PATH = process.env.CLAUDE_SETTINGS_PATH
  || join(homedir(), '.claude', 'settings.json');

// Claude Code modelOverrides anahtarları yalnızca kanonik Anthropic model ID'lerini kabul eder
// (takma adlar "opus" gibi sessizce yok sayılır). Rol modeli boşsa anahtar silinir.
// Fable 5 ve 5.1 ayrı kanonik ID'ler; kullanıcı hangisini seçerse seçsin role gitsin.
const ROLE_KEYS: Record<keyof ModelConfig, string[]> = {
  fable: ['claude-fable-5', 'claude-fable-5-1'],
  opus: ['claude-opus-5-5'],
  sonnet: ['claude-sonnet-5-5'],
  haiku: ['claude-haiku-5-5'],
};

function modelId(value: ModelConfig[keyof ModelConfig]): string {
  if (typeof value === 'string') return value.trim();
  return (value?.id || '').trim();
}

// settings.json env bloğu Claude Code açılışında okunur; Launch sekmesi bunları yazmaz.
// _NAME olmadan /model satırı ham model ID'sini gösterir, _DESCRIPTION satır altını doldurur.
// Etiket kanonik ID'den türetilir (claude-opus-5-5 → "Opus 5.5"), böylece sürüm tek yerde durur.
const ROLE_LABEL: Record<keyof ModelConfig, string> = Object.fromEntries(
  (Object.keys(ROLE_KEYS) as (keyof ModelConfig)[]).map(role => {
    const [name, ...version] = ROLE_KEYS[role].at(-1)!.replace(/^claude-/, '').split('-');
    return [role, `${name[0].toUpperCase()}${name.slice(1)} ${version.join('.')}`];
  }),
) as Record<keyof ModelConfig, string>;

// Eski sürümlerde yazılmış kanonik anahtarlar; artık yönetilmiyor, kalırsa eski modele
// yönlendirmeye devam ederler.
const LEGACY_KEYS = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

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
  // Eski sürümlerin kanonik anahtarları silinir; kalsalar Claude Code eski modeli hâlâ
  // o ID'ye yönlendirirdi. Proxy bu ID'leri zaten rol adından çözüyor.
  for (const key of LEGACY_KEYS) delete overrides[key];
  raw.modelOverrides = overrides;

  const existingEnv = raw.env;
  const env: Record<string, string> = existingEnv && typeof existingEnv === 'object' && !Array.isArray(existingEnv)
    ? { ...(existingEnv as Record<string, string>) }
    : {};

  for (const role of Object.keys(ROLE_KEYS) as (keyof ModelConfig)[]) {
    const id = modelId(models[role]);
    const prefix = `ANTHROPIC_DEFAULT_${role.toUpperCase()}_MODEL`;
    for (const key of [prefix, `${prefix}_NAME`, `${prefix}_DESCRIPTION`]) delete env[key];
    if (!id) continue;
    env[prefix] = id;
    env[`${prefix}_NAME`] = ROLE_LABEL[role];
    env[`${prefix}_DESCRIPTION`] = `Custom ${ROLE_LABEL[role].split(' ')[0]} (${id})`;
  }
  // Kullanıcının başka env anahtarları korunur; hepsi silindiyse blok kaldırılır.
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
