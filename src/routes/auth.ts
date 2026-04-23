import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import z from 'zod';
import type { Repository } from '../db/repository.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6)
});

export interface AuthUser {
  id: number;
  email: string;
}

export function registerAuthRoutes(app: FastifyInstance, repo: Repository): void {
  // POST /api/auth/register - public
  app.post('/api/auth/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;

    // Check if user already exists
    const existingUser = repo.findUserByEmail(email);
    if (existingUser) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = repo.createUser({ email, passwordHash });
    repo.adoptLegacySourcesForUser(user.id);

    // Generate JWT
    const token = app.jwt.sign({ id: user.id, email: user.email });

    return reply.code(201).send({ token, user: { id: user.id, email: user.email } });
  });

  // POST /api/auth/login - public
  app.post('/api/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;

    // Find user
    const user = repo.findUserByEmail(email);
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = app.jwt.sign({ id: user.id, email: user.email });
    repo.adoptLegacySourcesForUser(user.id);

    return reply.send({ token, user: { id: user.id, email: user.email } });
  });

  // GET /api/auth/me - protected (auth required)
  app.get('/api/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    // This endpoint is protected by the global hook, but auth routes are skipped
    // So we need to manually verify here
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const user = request.user as AuthUser;
    repo.adoptLegacySourcesForUser(user.id);
    return { id: user.id, email: user.email };
  });

  app.post('/api/auth/password', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const parsed = passwordChangeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const authUser = request.user as AuthUser;
    const user = repo.findUserById(authUser.id);
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      return reply.code(400).send({ error: 'Current password is incorrect' });
    }

    const nextHash = await bcrypt.hash(parsed.data.newPassword, 10);
    repo.updateUserPassword(user.id, nextHash);
    return { ok: true };
  });
}
