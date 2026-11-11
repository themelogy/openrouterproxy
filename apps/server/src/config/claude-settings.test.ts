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

  it('writes the canonical model IDs for every role', () => {
    syncModelOverrides({ opus: 'deepseek/opus', sonnet: { id: 'deepseek/sonnet' }, haiku: 'deepseek/haiku', fable: 'deepseek/fable' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.modelOverrides).toEqual({
      'claude-opus-5-5': 'deepseek/opus',
      'claude-sonnet-5-5': 'deepseek/sonnet',
      'claude-haiku-5-5': 'deepseek/haiku',
      'claude-fable-5': 'deepseek/fable',
      'claude-fable-5-1': 'deepseek/fable',
    });
  });

  it('writes the picker env vars alongside the overrides', () => {
    syncModelOverrides({ opus: 'deepseek/opus', sonnet: 'deepseek/sonnet', haiku: 'deepseek/haiku', fable: 'deepseek/fable' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.env).toEqual({
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'deepseek/fable',
      ANTHROPIC_DEFAULT_FABLE_MODEL_NAME: 'Fable 5.1',
      ANTHROPIC_DEFAULT_FABLE_MODEL_DESCRIPTION: 'Custom Fable (deepseek/fable)',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek/opus',
      ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: 'Opus 5.5',
      ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION: 'Custom Opus (deepseek/opus)',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek/sonnet',
      ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: 'Sonnet 5.5',
      ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION: 'Custom Sonnet (deepseek/sonnet)',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek/haiku',
      ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME: 'Haiku 5.5',
      ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION: 'Custom Haiku (deepseek/haiku)',
    });
  });

  it('drops the env vars of a cleared role but keeps unrelated env entries', () => {
    writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify({ env: { MY_FLAG: '1', ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: 'stale' } }));
    syncModelOverrides({ opus: '', sonnet: 'a/c', haiku: 'a/d', fable: '' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.env.MY_FLAG).toBe('1');
    expect(raw.env).not.toHaveProperty('ANTHROPIC_DEFAULT_OPUS_MODEL_NAME');
    expect(raw.env).not.toHaveProperty('ANTHROPIC_DEFAULT_FABLE_MODEL');
    expect(raw.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('a/c');
  });

  it('removes the env block when no role is configured', () => {
    syncModelOverrides({ opus: 'a/b', sonnet: 'a/c', haiku: 'a/d', fable: 'a/f' });
    syncModelOverrides({ opus: '', sonnet: '', haiku: '', fable: '' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw).not.toHaveProperty('env');
  });

  it('removes both fable keys when the fable role is cleared', () => {
    syncModelOverrides({ opus: 'a/b', sonnet: 'a/c', haiku: 'a/d', fable: 'a/f' });
    syncModelOverrides({ opus: 'a/b', sonnet: 'a/c', haiku: 'a/d', fable: '' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.modelOverrides['claude-fable-5']).toBeUndefined();
    expect(raw.modelOverrides['claude-fable-5-1']).toBeUndefined();
  });

  it('preserves unrelated settings and user-added overrides', () => {
    writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify({
      theme: 'dark',
      modelOverrides: { 'claude-opus-5-5': 'old/model', 'claude-mythos-5': 'x/y' },
    }));
    syncModelOverrides({ opus: 'new/opus', sonnet: 'new/sonnet', haiku: 'new/haiku', fable: 'new/fable' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.theme).toBe('dark');
    expect(raw.modelOverrides['claude-opus-5-5']).toBe('new/opus');
    expect(raw.modelOverrides['claude-mythos-5']).toBe('x/y');
  });

  it('removes the override when a role model is cleared', () => {
    syncModelOverrides({ opus: 'a/b', sonnet: 'a/c', haiku: 'a/d', fable: '' });
    syncModelOverrides({ opus: '', sonnet: 'a/c', haiku: 'a/d', fable: '' });
    const raw = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    expect(raw.modelOverrides['claude-opus-5-5']).toBeUndefined();
    expect(raw.modelOverrides['claude-sonnet-5-5']).toBe('a/c');
  });

  it('refuses to overwrite a broken settings file', () => {
    const broken = '{not json';
    writeFileSync(CLAUDE_SETTINGS_PATH, broken);
    expect(() => syncModelOverrides({ opus: 'a/b', sonnet: 'a/c', haiku: 'a/d', fable: '' })).toThrow();
    expect(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8')).toBe(broken);
  });
});
