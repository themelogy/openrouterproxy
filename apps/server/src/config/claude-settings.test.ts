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

  it('writes exactly the four canonical model IDs', () => {
    syncModelOverrides({ fable: 'deepseek/fable', opus: 'deepseek/opus', sonnet: { id: 'deepseek/sonnet' }, haiku: 'deepseek/haiku' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.modelOverrides).toEqual({
      'claude-fable-5': 'deepseek/fable',
      'claude-opus-4-6': 'deepseek/opus',
      'claude-sonnet-4-6': 'deepseek/sonnet',
      'claude-haiku-4-5': 'deepseek/haiku',
    });
  });

  it('preserves unrelated settings and user-added overrides', () => {
    writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify({
      theme: 'dark',
      modelOverrides: { 'claude-opus-4-6': 'old/model', 'claude-fable-5-1': 'x/y' },
    }));
    syncModelOverrides({ fable: '', opus: 'new/opus', sonnet: 'new/sonnet', haiku: 'new/haiku' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.theme).toBe('dark');
    expect(raw.modelOverrides['claude-opus-4-6']).toBe('new/opus');
    expect(raw.modelOverrides['claude-fable-5-1']).toBe('x/y');
  });

  it('removes the override when a role model is cleared', () => {
    syncModelOverrides({ fable: 'a/e', opus: 'a/b', sonnet: 'a/c', haiku: 'a/d' });
    syncModelOverrides({ fable: '', opus: '', sonnet: 'a/c', haiku: 'a/d' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.modelOverrides['claude-fable-5']).toBeUndefined();
    expect(raw.modelOverrides['claude-opus-4-6']).toBeUndefined();
    expect(raw.modelOverrides['claude-sonnet-4-6']).toBe('a/c');
  });

  it('refuses to overwrite a broken settings file', () => {
    const broken = '{not json';
    writeFileSync(CLAUDE_SETTINGS_PATH, broken);
    expect(() => syncModelOverrides({ fable: '', opus: 'a/b', sonnet: 'a/c', haiku: 'a/d' })).toThrow();
    expect(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8')).toBe(broken);
  });
});
