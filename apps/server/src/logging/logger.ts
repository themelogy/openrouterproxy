import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

/** Redact sensitive fields from log objects. */
export function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return obj;

  const keys = ['apiKey', 'api_key', 'token', 'authorization', 'secret'];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (keys.some(k => lower.includes(k.toLowerCase()))) {
      result[key] = '********';
    } else if (Array.isArray(value)) {
      result[key] = value.map(v => typeof v === 'object' && v !== null ? redactSensitive(v as Record<string, unknown>) : v);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/** Attach correlation ID to request for log tracing. */
export function attachCorrelationId(app: FastifyInstance) {
  app.addHook('onRequest', async (req: FastifyRequest, reply: any) => {
    const id = randomUUID();
    req.id = id;
    reply.header('X-Request-ID', id);
  });
}
