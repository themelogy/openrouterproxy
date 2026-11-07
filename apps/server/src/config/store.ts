import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync, copyFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { dirname } from 'path';
import type { AppConfig, OpenRouterConfig } from '@shared/types';
import { DEFAULT_CONFIG } from '@shared/types';
import { AppConfigSchema, CONFIG_PATH } from './schema.js';

const MASK = '••••';

function ensureDir() {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// Ham dosya içeriği (bilinmeyen alanlar dahil). Dosya yoksa null, bozuksa hata fırlatır.
function readRaw(): Record<string, unknown> | null {
  if (!existsSync(CONFIG_PATH)) return null;
  const text = readFileSync(CONFIG_PATH, 'utf-8');
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('config root must be an object');
  return raw as Record<string, unknown>;
}

// Bilinen üst düzey alanları seç — kullanıcının elle eklediği alanlar doğrulamayı kırmasın
const KNOWN_KEYS = Object.keys(AppConfigSchema.shape) as (keyof AppConfig)[];

function validate(raw: Record<string, unknown>): AppConfig {
  const known: Record<string, unknown> = {};
  for (const k of KNOWN_KEYS) if (raw[k] !== undefined) known[k] = raw[k];
  return AppConfigSchema.parse(known);
}

// Nesneleri iç içe birleştir; diziler bilinçli olarak bütünüyle değiştirilir.
// undefined ve null mevcut alanı silmez (JSON.stringify'ta kaybolma = veri kaybı).
function deepMerge(base: unknown, patch: unknown): unknown {
  if (patch === undefined || patch === null) return base;
  if (typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out: Record<string, unknown> = {
    ...(base && typeof base === 'object' && !Array.isArray(base) ? base as Record<string, unknown> : {}),
  };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    out[k] = deepMerge(out[k], v);
  }
  return out;
}

function readExisting(): AppConfig | null {
  const raw = readRaw();
  return raw ? validate(raw) : null;
}

export function loadConfig(): AppConfig {
  try {
    ensureDir();
    const existing = readExisting();
    if (existing) return existing;
  } catch (e) {
    console.error('[loadConfig] okunamadı, varsayılanlar kullanılıyor. Dosya dokunulmadı:', (e as Error).message);
  }
  // Kopya döndür — çağıranların varsayılanları mutasyona uğratmasını engeller
  return structuredClone(DEFAULT_CONFIG);
}

export function saveConfig(patch: Partial<AppConfig>): void {
  ensureDir();

  // Okuma başarısızsa burada hata fırlat. Varsayılanlarla üzerine yazma.
  const raw = readRaw();
  // Bilinmeyen alanları korumak için ham dosya üzerine birleştir (dosya yoksa varsayılan iskeleti)
  const current = raw
    ?? (structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>);
  const merged = deepMerge(current, patch) as Record<string, unknown>;

  // Boş veya maskelenmiş anahtar = değişiklik yok; mevcut anahtarı koru (veri kaybını önler).
  // Dosyada anahtar yoksa maske diske yazılmamalı — boş string olarak kalır.
  const incomingKey = patch.openrouter?.apiKey;
  const currentKey = (current.openrouter as Record<string, unknown> | undefined)?.apiKey;
  if (incomingKey === '' || (typeof incomingKey === 'string' && incomingKey.includes('•'))) {
    if (currentKey !== undefined) {
      if (incomingKey === '') console.warn('[saveConfig] boş API key geldi, mevcut anahtar korundu');
      (merged.openrouter as Record<string, unknown>).apiKey = currentKey;
    } else {
      (merged.openrouter as Record<string, unknown>).apiKey = '';
    }
  }

  // Yazmadan önce doğrula; şema varsayılanları taban, dosyadaki mevcut değerler üstte kalır
  const validated = validate(merged) as unknown as Record<string, unknown>;
  for (const k of KNOWN_KEYS) merged[k] = deepMerge(validated[k], merged[k]);

  // Sıfırlanma şüphesi için yedek: her yazmadan önce önceki hali saklanır
  if (existsSync(CONFIG_PATH)) copyFileSync(CONFIG_PATH, CONFIG_PATH + '.bak');

  const tmp = CONFIG_PATH + '.tmp.' + randomUUID();
  try {
    writeFileSync(tmp, JSON.stringify(merged, null, 2));
    renameSync(tmp, CONFIG_PATH);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* tmp zaten yok */ }
    throw e;
  }
}

export function maskApiKey(cfg: AppConfig) {
  return {
    ...cfg,
    openrouter: { ...cfg.openrouter, apiKey: MASK },
  };
}