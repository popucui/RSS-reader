import path from 'node:path';
import fs from 'node:fs';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { readGeneratedClashConfig } from './clash.js';
import { openDatabase } from './db/schema.js';
import { Repository } from './db/repository.js';
import { registerApiRoutes } from './routes/api.js';
import { registerAuthRoutes } from './routes/auth.js';
import { startScheduler } from './scheduler.js';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info'
  }
});

await app.register(cors, {
  origin: true
});

await app.register(jwt, {
  secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
});

// Add authenticate hook
app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
  // Skip auth for health and auth endpoints
  if (request.url === '/api/health' || request.url.startsWith('/api/auth/')) {
    return;
  }
  // Check if route needs auth (all /api/* routes except health)
  if (request.url.startsWith('/api/')) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  }
});

const db = openDatabase();
const repo = new Repository(db);
registerAuthRoutes(app, repo);
registerApiRoutes(app, repo);

app.get('/clash/config.yaml', async (_request, reply) => {
  const configText = await readGeneratedClashConfig();
  if (!configText) {
    return reply.code(404).send({ error: 'Clash config has not been generated yet' });
  }
  return reply
    .header('content-type', 'text/yaml; charset=utf-8')
    .header('cache-control', 'no-store')
    .send(configText);
});

const publicDir = path.resolve(process.cwd(), 'dist/public');
if (fs.existsSync(publicDir)) {
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/'
  });
}

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'Not found' });
  }
  if (fs.existsSync(publicDir)) {
    return reply.sendFile('index.html');
  }
  return reply.code(404).send({ error: 'Frontend build not found. Use npm run dev:web or npm run build.' });
});

startScheduler(repo);

await app.listen({ host: config.webHost, port: config.webPort });
