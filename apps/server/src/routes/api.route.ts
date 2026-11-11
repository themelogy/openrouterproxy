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

// /models herkese açık — anahtar yanlış olsa da 200 döner. /key anahtarı doğrular.
export async function checkKey(
  baseUrl: string, apiKey: string, timeoutMs: number,
): Promise<{ ok: boolean; status: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function register(app: FastifyInstance) {
  // GET /api/status — proxy health
  let statusCache: { at: number; upstreamOk: boolean } | null = null;
  app.get('/api/status', async () => {
    if (statusCache && Date.now() - statusCache.at < 60_000) {
      return { running: true, upstreamOk: statusCache.upstreamOk, lastCheck: new Date().toISOString() };
    }
    const config = loadConfig();
    const upstreamOk = config.openrouter.apiKey
      ? (await checkKey(config.openrouter.baseUrl, config.openrouter.apiKey, 5000)).ok
      : false;
    statusCache = { at: Date.now(), upstreamOk };
    return { running: true, upstreamOk, lastCheck: new Date().toISOString() };
  });

  // GET /api/config — config with masked API key
  app.get('/api/config', async () => {
    const config = loadConfig();
    return maskApiKey(config);
  });

  // GET /api/launch-key — unmasked key for the Launch command (localhost-only via auth guard)
  app.get('/api/launch-key', async () => ({ apiKey: loadConfig().openrouter.apiKey }));

  // PUT /api/config — update config
  app.put('/api/config', async (req, reply) => {
    const partial = req.body as Partial<AppConfig>;
    try {
      saveConfig(partial);
    } catch (e) {
      return reply.code(400).send({ ok: false, error: (e as Error).message });
    }
    // Anahtar/baseUrl değişti: 60 sn'lik status cache eski sonucu göstermesin.
    if (partial.openrouter) statusCache = null;
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
    const result = await checkKey(config.openrouter.baseUrl, config.openrouter.apiKey, 10000);
    if (result.ok) return { ok: true };
    return reply.code(502).send({
      ok: false,
      error: result.status === 401 ? 'Invalid API key' : 'Connection failed',
    });
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
