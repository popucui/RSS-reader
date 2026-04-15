import path from 'node:path';
import fs from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { openDatabase } from './db/schema.js';
import { Repository } from './db/repository.js';
import { registerApiRoutes } from './routes/api.js';
import { startScheduler } from './scheduler.js';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info'
  }
});

await app.register(cors, {
  origin: true
});

const db = openDatabase();
const repo = new Repository(db);
registerApiRoutes(app, repo);

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
