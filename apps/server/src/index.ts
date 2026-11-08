import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import Fastify from 'fastify';
import { register as apiRoute } from './routes/api.route.js';
import { register as messagesRoute } from './routes/messages.route.js';
import { register as healthRoute } from './routes/health.route.js';
import { register as tokenCountRoute } from './routes/token-count.route.js';
import { registerGuard } from './routes/auth.guard.js';
import { attachCorrelationId } from './logging/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// dev'de apps/server/src, üretimde kök dist — iki düzeni de dene
const WEB_DIST = [join(__dirname, '../../web/dist'), join(__dirname, '../apps/web/dist')]
  .find(p => existsSync(join(p, 'index.html'))) ?? join(__dirname, '../apps/web/dist');

export async function createApp() {
  const app = Fastify({
    logger: { level: 'info' },
    disableRequestLogging: true,
  });

  // CORS — only allow same origin (localhost)
  await app.register(import('@fastify/cors'), {
    origin: ['http://localhost:5173', 'http://127.0.0.1:4000'],
    methods: ['GET', 'POST', 'PUT'],
  });

  // Auth guard for management API routes
  registerGuard(app);

  // Correlation IDs for log tracing
  attachCorrelationId(app);

  // API routes (available during development and production)
  await apiRoute(app);
  await messagesRoute(app);
  await healthRoute(app);
  await tokenCountRoute(app);

  // Serve static files in production (after API routes so /api/* takes priority)
  await app.register(import('@fastify/static'), { root: WEB_DIST });

  // Catch-all for SPA routing
  app.setNotFoundHandler(async (_req, reply) => {
    try {
      return reply.type('text/html').send(readFileSync(join(WEB_DIST, 'index.html')));
    } catch { return reply.code(404).send({ error: 'Not found' }); }
  });

  app.addHook('onReady', async () => {
    app.log.info({ routes: app.printRoutes() }, 'Registered routes');
  });

  return app;
}

async function main() {
  const config = await import('./config/store.js').then(m => m.loadConfig());

  const app = await createApp();
  await app.listen({ host: config.server.host, port: config.server.port });

  app.log.info({ address: `http://${config.server.host}:${config.server.port}` }, 'Server listening');
}

// file:// öneki elle eklenirse Windows yolları (C:\) eşleşmez — pathToFileURL kullan
const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (entry && import.meta.url === entry) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
