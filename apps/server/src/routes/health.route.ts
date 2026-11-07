import { FastifyInstance } from 'fastify';

export async function register(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok' }));
}
