import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, saveConfig, maskApiKey } from './store.js';
import { CONFIG_PATH } from './schema.js';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';

const BACKUP_PATH = CONFIG_PATH + '.bak';

describe('config store', () => {
  beforeEach(() => { try { unlinkSync(CONFIG_PATH); } catch {} try { unlinkSync(BACKUP_PATH); } catch {} });
  afterEach(() => { try { unlinkSync(CONFIG_PATH); } catch {} try { unlinkSync(BACKUP_PATH); } catch {} });

  it('creates default config on first load', () => {
    const cfg = loadConfig();
    expect(cfg.server.host).toBe('127.0.0.1');
    expect(cfg.server.port).toBe(4000);
  });

  it('persists and reloads config', () => {
    saveConfig({ models: { opus: 'foo/bar', sonnet: 'baz/qux', haiku: 'quux/corge', fable: '' } });
    const cfg = loadConfig();
    expect(cfg.models.opus).toBe('foo/bar');
  });

  it('masks API key', () => {
    const cfg = loadConfig();
    const masked = maskApiKey(cfg);
    expect(masked.openrouter.apiKey).toBe('••••');
  });

  it('rejects invalid config', () => {
    expect(() => saveConfig({ server: { port: 99999 } as any })).toThrow();
  });

  it('preserves unknown fields written by the user across saves', () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({
      server: { host: '127.0.0.1', port: 4000, timeoutMs: 3_000_000 },
      openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-real' },
      models: { opus: 'a/b', sonnet: 'a/c', haiku: 'a/d', fable: '' },
      myCustomField: { keep: true },
    }));
    saveConfig({ models: { opus: 'x/y', sonnet: 'a/c', haiku: 'a/d', fable: '' } });
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    expect(raw.myCustomField).toEqual({ keep: true });
    expect(raw.models.opus).toBe('x/y');
    expect(raw.openrouter.apiKey).toBe('sk-real');
  });

  it('merges nested partial objects instead of replacing them', () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({
      server: { host: '127.0.0.1', port: 4000, timeoutMs: 3_000_000 },
      openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-real' },
      models: { opus: 'a/b', sonnet: 'a/c', haiku: 'a/d', fable: '' },
      security: { allowRemote: false, localAuthToken: 'tok' },
    }));
    // UI kısmi nesne gönderiyor: yalnızca host değişiyor
    saveConfig({ server: { host: 'localhost' } as any });
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    expect(raw.server).toEqual({ host: 'localhost', port: 4000, timeoutMs: 3_000_000, bodyLimit: 64 * 1024 * 1024 });
    expect(raw.models).toEqual({ opus: 'a/b', sonnet: 'a/c', haiku: 'a/d', fable: '' });
    expect(raw.security).toEqual({ allowRemote: false, localAuthToken: 'tok' });
  });

  it('preserves nested fields the schema does not know', () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({
      server: { host: '127.0.0.1', port: 4000 },
      openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-real', httpReferer: 'https://me.dev', appTitle: 'My Proxy' },
      models: { opus: 'a/b', sonnet: 'a/c', haiku: 'a/d', fable: '' },
    }));
    // Eksik server.timeoutMs şema varsayılanıyla eklenir; elle eklenen alanlar korunur
    saveConfig({ models: { opus: 'x/y', sonnet: 'a/c', haiku: 'a/d', fable: '' } });
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    expect(raw.openrouter.httpReferer).toBe('https://me.dev');
    expect(raw.openrouter.appTitle).toBe('My Proxy');
    expect(raw.openrouter.apiKey).toBe('sk-real');
    expect(raw.server.timeoutMs).toBe(3_000_000);
  });

  it('backs up the previous file before each write', () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({
      server: { host: '127.0.0.1', port: 4000, timeoutMs: 3_000_000 },
      openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-real' },
      models: { opus: 'a/b', sonnet: 'a/c', haiku: 'a/d', fable: '' },
    }));
    saveConfig({ server: { port: 4100 } } as any);
    const backup = JSON.parse(readFileSync(BACKUP_PATH, 'utf-8'));
    expect(backup.server.port).toBe(4000);
    expect(backup.openrouter.apiKey).toBe('sk-real');
  });

  it('never persists the mask when no key exists yet', () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({
      server: { host: '127.0.0.1', port: 4000, timeoutMs: 3_000_000 },
      openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: '' },
      models: { opus: 'a/b', sonnet: 'a/c', haiku: 'a/d', fable: '' },
    }));
    saveConfig({ openrouter: { apiKey: '••••' } as any });
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    expect(raw.openrouter.apiKey).toBe('');
  });

  it('treats null like undefined instead of deleting the field', () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({
      server: { host: '127.0.0.1', port: 4000, timeoutMs: 3_000_000 },
      openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-real' },
      models: { opus: 'a/b', sonnet: 'a/c', haiku: 'a/d', fable: '' },
    }));
    saveConfig({ server: { host: null } } as any);
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    expect(raw.server.host).toBe('127.0.0.1');
  });

  it('does not delete fields when patch contains undefined', () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({
      server: { host: '127.0.0.1', port: 4000, timeoutMs: 3_000_000 },
      openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-real' },
      models: { opus: 'a/b', sonnet: 'a/c', haiku: 'a/d', fable: '' },
    }));
    saveConfig({ server: { port: undefined } } as any);
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    expect(raw.server.port).toBe(4000);
  });

  it('does not rewrite an unreadable config file', () => {
    const broken = '{"server": {"port": 99999}}';
    writeFileSync(CONFIG_PATH, broken);
    loadConfig();
    expect(readFileSync(CONFIG_PATH, 'utf-8')).toBe(broken);
  });
});
