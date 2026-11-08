import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '@shared/types';
import { loadConfig, saveConfig, maskApiKey } from '../config/store.js';
import { syncModelOverrides } from '../config/claude-settings.js';
import { getDesktopStatus, enableDesktop, disableDesktop, createDesktopLibrary } from '../config/claude-desktop.js';
import { fetchModels, fetchEndpoints } from '../proxy/openrouter-client.js';

type RequestLogEntry = {
  time: string; model: string; status: number; duration?: string; ctxTokens?: number;
  inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; cacheWriteTokens?: number; cost?: number;
};
const REQUEST_LOG_LIMIT = 200;
const requestLog: RequestLogEntry[] = [];

export async function register(app: FastifyInstance) {
  // GET /api/status — proxy health
  let statusCache: { at: number; upstreamOk: boolean } | null = null;
  app.get('/api/status', async () => {
    if (statusCache && Date.now() - statusCache.at < 60_000) {
      return { running: true, upstreamOk: statusCache.upstreamOk, lastCheck: new Date().toISOString() };
    }
    const config = loadConfig();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      await fetch(`${config.openrouter.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${config.openrouter.apiKey}` },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      statusCache = { at: Date.now(), upstreamOk: true };
      return { running: true, upstreamOk: true, lastCheck: new Date().toISOString() };
    } catch {
      statusCache = { at: Date.now(), upstreamOk: false };
      return { running: true, upstreamOk: false, lastCheck: new Date().toISOString() };
    }
  });

  // GET /api/config — config with masked API key
  app.get('/api/config', async () => {
    const config = loadConfig();
    return maskApiKey(config);
  });

  // PUT /api/config — update config
  app.put('/api/config', async (req, reply) => {
    const partial = req.body as Partial<AppConfig>;
    try {
      saveConfig(partial);
    } catch (e) {
      return reply.code(400).send({ ok: false, error: (e as Error).message });
    }
    // Config yazıldı; settings sync başarısız olsa da settings.json'a dokunmadan geç.
    if (partial.models) {
      try { syncModelOverrides(loadConfig().models); }
      catch (e) { console.warn('[api] modelOverrides güncellenemedi:', (e as Error).message); }
    }
    return { ok: true };
  });

  // POST /api/test-connection — test OpenRouter connectivity
  app.post('/api/test-connection', async (_req, reply) => {
    const config = loadConfig();
    if (!config.openrouter.apiKey) return reply.code(400).send({ ok: false, error: 'API key not configured' });
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      await fetch(`${config.openrouter.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${config.openrouter.apiKey}` },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      return { ok: true };
    } catch (e) {
      console.error('test-connection error:', e);
      return reply.code(502).send({ ok: false, error: 'Connection failed' });
    }
  });

  // GET /api/models — fetch model list from OpenRouter (optional ?q= filter)
  app.get('/api/models', async (req, reply) => {
    const config = loadConfig();
    if (!config.openrouter.apiKey) return reply.code(401).send({ error: 'API key not configured' });
    try {
      const { models } = await fetchModels();
      const q = ((req.query as any).q as string || '').toLowerCase().trim();
      if (!q) return models;
      return models.filter(m => m.id.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q));
    } catch { return reply.code(502).send({ error: 'Failed to fetch models' }); }
  });

  // GET /api/models/endpoints?model=<id> — providers serving a model, with pricing
  app.get('/api/models/endpoints', async (req, reply) => {
    const modelId = ((req.query as any).model as string || '').trim();
    if (!modelId) return reply.code(400).send({ error: 'model query param required' });
    const config = loadConfig();
    if (!config.openrouter.apiKey) return reply.code(401).send({ error: 'API key not configured' });
    try {
      return await fetchEndpoints(modelId, config.openrouter.apiKey);
    } catch (e) {
      return reply.code(502).send({ error: `Failed to fetch endpoints: ${(e as Error).message}` });
    }
  });

  // GET /api/claude-desktop — Desktop 3P entegrasyon durumu
  app.get('/api/claude-desktop', async () => getDesktopStatus());

  // POST /api/claude-desktop — { enabled: boolean } veya { create: true }
  app.post('/api/claude-desktop', async (req, reply) => {
    const { enabled, create } = (req.body ?? {}) as { enabled?: boolean; create?: boolean };
    try {
      if (create) return createDesktopLibrary();
      if (!enabled) return disableDesktop();
      const cfg = loadConfig();
      const host = cfg.server.host === '0.0.0.0' ? '127.0.0.1' : cfg.server.host;
      return enableDesktop(`http://${host}:${cfg.server.port}`);
    } catch (e) {
      return reply.code(400).send({ ok: false, error: (e as Error).message });
    }
  });

  // GET /api/requests — recent request history
  app.get('/api/requests', async () => {
    return requestLog.slice(-50);
  });

  // POST /api/requests/clear — clear request history
  app.post('/api/requests/clear', async () => {
    requestLog.length = 0;
    return { ok: true };
  });
}

export function logRequest(entry: Omit<RequestLogEntry, 'time'>): RequestLogEntry {
  const logged = { ...entry, time: new Date().toLocaleTimeString() };
  requestLog.push(logged);
  if (requestLog.length > REQUEST_LOG_LIMIT) requestLog.splice(0, requestLog.length - REQUEST_LOG_LIMIT);
  return logged;
}
