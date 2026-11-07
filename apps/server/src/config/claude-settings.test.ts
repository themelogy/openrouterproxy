import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { syncModelOverrides, CLAUDE_SETTINGS_PATH } from './claude-settings.js';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';

const BACKUP_PATH = CLAUDE_SETTINGS_PATH + '.bak';
const cleanup = () => {
  for (const p of [CLAUDE_SETTINGS_PATH, BACKUP_PATH]) { try { unlinkSync(p); } catch {} }
};

describe('claude settings sync', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('writes canonical model IDs covering current Claude model families', () => {
    syncModelOverrides({ opus: 'deepseek/opus', sonnet: { id: 'deepseek/sonnet' }, haiku: 'deepseek/haiku' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.modelOverrides['claude-opus-4-6']).toBe('deepseek/opus');
    expect(raw.modelOverrides['claude-opus-5-5']).toBe('deepseek/opus');
    expect(raw.modelOverrides['claude-sonnet-4-6']).toBe('deepseek/sonnet');
    expect(raw.modelOverrides['claude-haiku-4-5']).toBe('deepseek/haiku');
  });

  it('preserves unrelated settings and user-added overrides', () => {
    writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify({
      theme: 'dark',
      modelOverrides: { 'claude-opus-4-6': 'old/model', 'claude-fable-5': 'x/y' },
    }));
    syncModelOverrides({ opus: 'new/opus', sonnet: 'new/sonnet', haiku: 'new/haiku' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.theme).toBe('dark');
    expect(raw.modelOverrides['claude-opus-4-6']).toBe('new/opus');
    expect(raw.modelOverrides['claude-fable-5']).toBe('x/y');
  });

  it('removes the override when a role model is cleared', () => {
    syncModelOverrides({ opus: 'a/b', sonnet: 'a/c', haiku: 'a/d' });
    syncModelOverrides({ opus: '', sonnet: 'a/c', haiku: 'a/d' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.modelOverrides['claude-opus-4-6']).toBeUndefined();
    expect(raw.modelOverrides['claude-sonnet-4-6']).toBe('a/c');
  });

  it('refuses to overwrite a broken settings file', () => {
    const broken = '{not json';
    writeFileSync(CLAUDE_SETTINGS_PATH, broken);
    expect(() => syncModelOverrides({ opus: 'a/b', sonnet: 'a/c', haiku: 'a/d' })).toThrow();
    expect(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8')).toBe(broken);
  });
});
