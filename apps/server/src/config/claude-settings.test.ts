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

  it('writes env labels for every configured role', () => {
    syncModelOverrides({ fable: 'deepseek/deepseek-v4.1-flash-1017', opus: 'a/opus-2', sonnet: 'a/sonnet-3', haiku: 'a/haiku-4' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.env).toEqual({
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'deepseek/deepseek-v4.1-flash-1017',
      ANTHROPIC_DEFAULT_FABLE_MODEL_NAME: 'Fable 5.1',
      ANTHROPIC_DEFAULT_FABLE_MODEL_DESCRIPTION: 'Custom Fable (deepseek-v4.1-flash)',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'a/opus-2',
      ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: 'Opus 4.6',
      ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION: 'Custom Opus (opus)',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'a/sonnet-3',
      ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: 'Sonnet 4.6',
      ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION: 'Custom Sonnet (sonnet)',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'a/haiku-4',
      ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME: 'Haiku 4.5',
      ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION: 'Custom Haiku (haiku)',
    });
  });

  it('removes env keys when a role is cleared and keeps unrelated env', () => {
    writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify({
      env: { ANTHROPIC_DEFAULT_OPUS_MODEL: 'old', KEEP_ME: 'yes' },
    }));
    syncModelOverrides({ fable: '', opus: '', sonnet: 'a/c', haiku: 'a/d' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.env.KEEP_ME).toBe('yes');
    expect(raw.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeUndefined();
    expect(raw.env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME).toBeUndefined();
    expect(raw.env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBeUndefined();
    expect(raw.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('a/c');
  });

  it('drops the env block entirely when no role is set', () => {
    writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify({ theme: 'dark' }));
    syncModelOverrides({ fable: '', opus: '', sonnet: '', haiku: '' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.env).toBeUndefined();
    expect(raw.theme).toBe('dark');
  });

  it('refuses to overwrite a broken settings file', () => {
    const broken = '{not json';
    writeFileSync(CLAUDE_SETTINGS_PATH, broken);
    expect(() => syncModelOverrides({ fable: '', opus: 'a/b', sonnet: 'a/c', haiku: 'a/d' })).toThrow();
    expect(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8')).toBe(broken);
  });
});
