import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync, copyFileSync, statSync, chmodSync } from 'fs';
import { randomUUID } from 'crypto';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { CONFIG_PATH } from './schema.js';

// Desktop 3P klasörü macOS'ta Application Support, Windows'ta %APPDATA% altında
export const DESKTOP_DIR = process.env.CLAUDE_DESKTOP_DIR
  || (process.platform === 'win32'
    ? process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    : join(homedir(), 'Library', 'Application Support'));

export const PROFILE_ID = '00000000-0000-4000-8000-0000000000c1';
const PROFILE_NAME = 'openrouter-proxy';

const LIBRARY_DIR = join(DESKTOP_DIR, 'Claude-3p', 'configLibrary');
const PROFILE_PATH = join(LIBRARY_DIR, `${PROFILE_ID}.json`);
const META_PATH = join(LIBRARY_DIR, '_meta.json');

// Desktop 3P modunu iki kurulum da okur; ikisine de yazılır, ikisinden de geri alınır
const APP_CONFIG_PATHS = [
  join(DESKTOP_DIR, 'Claude-3p', 'claude_desktop_config.json'),
  join(DESKTOP_DIR, 'Claude', 'claude_desktop_config.json'),
];

// Açmadan önceki hali burada saklanır — kapatınca geri yazılır
const BACKUP_PATH = join(dirname(CONFIG_PATH), 'claude-desktop-backup.json');

interface Backup {
  appliedId: string | null;
  configs: Array<{ path: string; existed: boolean; deploymentMode?: unknown }>;
}

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${path} root must be an object`);
  return raw as Record<string, unknown>;
}

function writeJson(path: string, data: unknown) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const existed = existsSync(path);
  const mode = existed ? statSync(path).mode & 0o777 : 0o600;
  if (existed) copyFileSync(path, path + '.bak');

  const tmp = path + '.tmp.' + randomUUID();
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2), { mode });
    chmodSync(tmp, mode);
    renameSync(tmp, path);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* tmp zaten yok */ }
    throw e;
  }
}

export interface DesktopStatus {
  installed: boolean;
  enabled: boolean;
  dir: string;
  libraryDir: string;
}

// Aranan yolları da döndür: kullanıcı Desktop'ın nereye bakacağını görebilsin
export function getDesktopStatus(): DesktopStatus {
  const installed = existsSync(LIBRARY_DIR);
  const paths = { dir: DESKTOP_DIR, libraryDir: LIBRARY_DIR };
  try {
    return { ...paths, installed, enabled: readJson(META_PATH)?.appliedId === PROFILE_ID };
  } catch {
    return { ...paths, installed, enabled: false };
  }
}

// Windows'ta Claude-3p henüz açılmamışsa klasör yok — kullanıcı butondan oluşturabilir
export function createDesktopLibrary(): DesktopStatus {
  mkdirSync(LIBRARY_DIR, { recursive: true });
  return getDesktopStatus();
}

export function enableDesktop(baseUrl: string): DesktopStatus {
  if (!existsSync(LIBRARY_DIR)) throw new Error(`Claude Desktop 3P config klasörü bulunamadı: ${LIBRARY_DIR}`);

  // Yeniden açmada önceki yedeği koru: asıl "eski hal" ilk açmadaki değerler
  const prior: Backup | null = existsSync(BACKUP_PATH)
    ? JSON.parse(readFileSync(BACKUP_PATH, 'utf-8'))
    : null;
  if (!prior) {
    const meta = readJson(META_PATH);
    const backup: Backup = {
      appliedId: typeof meta?.appliedId === 'string' ? meta.appliedId : null,
      configs: APP_CONFIG_PATHS.map(path => {
        const cfg = readJson(path);
        return { path, existed: cfg !== null, deploymentMode: cfg?.deploymentMode };
      }),
    };
    writeJson(BACKUP_PATH, backup);
  }

  writeJson(PROFILE_PATH, {
    inferenceProvider: 'gateway',
    inferenceGatewayBaseUrl: baseUrl,
    inferenceGatewayApiKey: 'placeholder',
    inferenceGatewayAuthScheme: 'bearer',
    disableDeploymentModeChooser: true,
    chatTabEnabled: true,
  });

  const meta = readJson(META_PATH) ?? {};
  const entries = Array.isArray(meta.entries) ? [...(meta.entries as Array<{ id?: string; name?: string }>)] : [];
  if (!entries.some(e => e?.id === PROFILE_ID)) entries.push({ id: PROFILE_ID, name: PROFILE_NAME });
  writeJson(META_PATH, { ...meta, appliedId: PROFILE_ID, entries });

  for (const path of APP_CONFIG_PATHS) {
    const cfg = readJson(path) ?? {};
    writeJson(path, { ...cfg, deploymentMode: '3p' });
  }
  return getDesktopStatus();
}

export function disableDesktop(): DesktopStatus {
  const backup: Backup | null = existsSync(BACKUP_PATH)
    ? JSON.parse(readFileSync(BACKUP_PATH, 'utf-8'))
    : null;

  // Yedek yoksa (başka bir araç açmış olabilir) yalnızca bizim profili temizle
  if (!backup) {
    if (existsSync(PROFILE_PATH)) unlinkSync(PROFILE_PATH);
    return getDesktopStatus();
  }

  for (const c of backup.configs) {
    const cfg = readJson(c.path);
    if (!cfg) continue;
    if (c.deploymentMode === undefined) delete cfg.deploymentMode;
    else cfg.deploymentMode = c.deploymentMode;
    if (c.existed || Object.keys(cfg).length > 0) writeJson(c.path, cfg);
    else unlinkSync(c.path);
  }

  const meta = readJson(META_PATH);
  if (meta) {
    const entries = Array.isArray(meta.entries)
      ? (meta.entries as Array<{ id?: string }>).filter(e => e?.id !== PROFILE_ID)
      : [];
    const appliedId = meta.appliedId === PROFILE_ID ? backup.appliedId : meta.appliedId;
    const next: Record<string, unknown> = { ...meta, entries };
    if (appliedId == null) delete next.appliedId;
    else next.appliedId = appliedId;
    writeJson(META_PATH, next);
  }

  if (existsSync(PROFILE_PATH)) unlinkSync(PROFILE_PATH);
  unlinkSync(BACKUP_PATH);
  return getDesktopStatus();
}
