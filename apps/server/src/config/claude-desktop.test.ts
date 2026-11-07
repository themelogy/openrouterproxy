import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const desktopDir = mkdtempSync(join(tmpdir(), 'cc-desktop-'));
const libDir = join(desktopDir, 'Claude-3p', 'configLibrary');
const otherCfg = join(desktopDir, 'Claude-3p', 'claude_desktop_config.json');
const mainCfg = join(desktopDir, 'Claude', 'claude_desktop_config.json');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf-8'));

let mod: typeof import('./claude-desktop.js');

beforeAll(async () => {
  process.env.CLAUDE_DESKTOP_DIR = desktopDir;
  mkdirSync(libDir, { recursive: true });
  mkdirSync(join(desktopDir, 'Claude'), { recursive: true });
  writeFileSync(join(libDir, '_meta.json'), JSON.stringify({
    appliedId: 'other-profile',
    entries: [{ id: 'other-profile', name: 'oMLX' }],
  }));
  writeFileSync(otherCfg, JSON.stringify({ deploymentMode: '1p', preferences: { theme: 'dark' } }));
  mod = await import('./claude-desktop.js');
});

describe('claude desktop toggle', () => {
  it('restores the previous settings when disabled', () => {
    expect(mod.getDesktopStatus()).toMatchObject({ installed: true, enabled: false, dir: desktopDir });

    mod.enableDesktop('http://127.0.0.1:4000');
    expect(mod.getDesktopStatus().enabled).toBe(true);

    const profile = readJson(join(libDir, `${mod.PROFILE_ID}.json`));
    expect(profile.inferenceGatewayBaseUrl).toBe('http://127.0.0.1:4000');
    expect(profile.inferenceProvider).toBe('gateway');

    const meta = readJson(join(libDir, '_meta.json'));
    expect(meta.appliedId).toBe(mod.PROFILE_ID);
    expect(meta.entries.map((e: { id: string }) => e.id)).toEqual(['other-profile', mod.PROFILE_ID]);

    expect(readJson(otherCfg).deploymentMode).toBe('3p');
    expect(readJson(otherCfg).preferences).toEqual({ theme: 'dark' });
    expect(readJson(mainCfg).deploymentMode).toBe('3p');

    // Yeniden açmak önceki yedeği ezmemeli
    mod.enableDesktop('http://127.0.0.1:4001');
    mod.disableDesktop();

    const after = readJson(join(libDir, '_meta.json'));
    expect(after.appliedId).toBe('other-profile');
    expect(after.entries.map((e: { id: string }) => e.id)).toEqual(['other-profile']);
    expect(existsSync(join(libDir, `${mod.PROFILE_ID}.json`))).toBe(false);

    expect(readJson(otherCfg).deploymentMode).toBe('1p');
    expect(readJson(otherCfg).preferences).toEqual({ theme: 'dark' });
    // Bizim oluşturduğumuz dosya tamamen geri alınır
    expect(existsSync(mainCfg)).toBe(false);
    expect(mod.getDesktopStatus()).toMatchObject({ installed: true, enabled: false, dir: desktopDir });
  });
});

describe('createDesktopLibrary', () => {
  it('creates the missing 3P config folder', async () => {
    // DESKTOP_DIR import anında bağlanıyor — yeni dizin için modülü yeniden yükle
    vi.resetModules();
    const bare = mkdtempSync(join(tmpdir(), 'cc-desktop-bare-'));
    process.env.CLAUDE_DESKTOP_DIR = bare;
    const fresh = await import('./claude-desktop.js');

    expect(fresh.getDesktopStatus().installed).toBe(false);
    expect(fresh.createDesktopLibrary()).toMatchObject({ installed: true, enabled: false });
    expect(existsSync(join(bare, 'Claude-3p', 'configLibrary'))).toBe(true);

    process.env.CLAUDE_DESKTOP_DIR = desktopDir;
  });
});
