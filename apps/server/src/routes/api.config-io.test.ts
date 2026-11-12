import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { unlinkSync } from 'fs';
import { saveConfig, loadConfig } from '../config/store.js';
import { CONFIG_PATH } from '../config/schema.js';
import { register } from './api.route.js';

let app: FastifyInstance;

beforeEach(async () => {
  try { unlinkSync(CONFIG_PATH); } catch { /* yok */ }
  try { unlinkSync(CONFIG_PATH + '.bak'); } catch { /* yok */ }
  saveConfig({ openrouter: { apiKey: 'sk-secret', baseUrl: 'https://openrouter.ai/api/v1' } });
  app = Fastify();
  await register(app);
});
afterEach(async () => {
  await app.close();
  try { unlinkSync(CONFIG_PATH); } catch { /* yok */ }
  try { unlinkSync(CONFIG_PATH + '.bak'); } catch { /* yok */ }
});

describe('GET /api/config/export', () => {
  it('omits the API key but keeps the base URL', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config/export' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.openrouter).toEqual({ baseUrl: 'https://openrouter.ai/api/v1' });
    expect(JSON.stringify(body)).not.toContain('sk-secret');
  });

  it('sends an attachment filename', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config/export' });
    expect(res.headers['content-disposition']).toContain('claude-code-proxy-config.json');
  });
});

describe('POST /api/config/import', () => {
  it('applies models and profiles from the uploaded config', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/config/import',
      payload: {
        models: { fable: '', opus: 'a/b', sonnet: 'a/c', haiku: 'a/d' },
        profiles: [{ name: 'Cheap', models: { fable: '', opus: 'x/y', sonnet: 'x/z', haiku: 'x/w' } }],
      },
    });
    expect(res.statusCode).toBe(200);
    const cfg = loadConfig();
    expect(cfg.models.opus).toBe('a/b');
    expect(cfg.profiles).toEqual([{ name: 'Cheap', models: { fable: '', opus: 'x/y', sonnet: 'x/z', haiku: 'x/w' } }]);
  });

  it('keeps the local API key when the upload carries none', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/config/import',
      payload: { openrouter: { baseUrl: 'https://example.com/api/v1' } },
    });
    const cfg = loadConfig();
    expect(cfg.openrouter.apiKey).toBe('sk-secret');
    expect(cfg.openrouter.baseUrl).toBe('https://example.com/api/v1');
  });

  it('rejects a non-object body', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/config/import', payload: [1, 2] });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/status readiness', () => {
  it('reports key and models configured', async () => {
    saveConfig({ models: { fable: '', opus: 'a/b', sonnet: '', haiku: '' } });
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.json().keyConfigured).toBe(true);
    expect(res.json().modelsConfigured).toBe(true);
  });

  it('reports models not configured when every role is empty', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.json().modelsConfigured).toBe(false);
  });
});
