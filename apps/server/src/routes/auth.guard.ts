import type { FastifyInstance, FastifyRequest } from 'fastify';
import { loadConfig } from '../config/store.js';

/** Guard for management API routes — blocks remote access and validates optional local auth token. */
export async function authGuard(req: FastifyRequest) {
  const config = loadConfig();

  const security = config.security || {};

  // Block remote access unless explicitly allowed
  if (security.allowRemote !== true && req.ip !== '127.0.0.1' && req.ip !== '::1') {
    throw new Error('Forbidden: management API only accessible on localhost');
  }

  // Validate local auth token if configured
  const token = req.headers.authorization;
  if (security.localAuthToken && token) {
    const header = typeof token === 'string' ? token : String(token);
    if (header !== `Bearer ${security.localAuthToken}`) {
      throw new Error('Unauthorized: invalid local auth token');
    }
  }
}

export function registerGuard(app: FastifyInstance) {
  // Protect all /api/* routes with auth guard
  app.addHook('onRequest', async (req) => {
    if (req.url.startsWith('/api/')) {
      await authGuard(req);
    }
  });

  // Prevent client from overriding upstream authorization header
  app.addHook('onRequest', async (req) => {
    if (req.url.startsWith('/v1/')) {
      // Strip any client-sent Authorization header — proxy uses its own configured key
      req.headers.authorization = undefined;
    }
  });
}
