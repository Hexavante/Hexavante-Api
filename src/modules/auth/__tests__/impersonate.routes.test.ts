import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { impersonateRoutes } from '../routes/impersonate.routes';

const ctx = vi.hoisted(() => ({
  roles: ['SUPERADMIN'], actor: vi.fn(), target: vi.fn(), session: vi.fn(),
}));
vi.mock('../../../middlewares/authenticate', () => ({
  authenticate: async (req: { user?: unknown }) => { req.user = { id: 'actor', roles: ctx.roles }; },
}));
vi.mock('../../../config/prisma', () => ({ prisma: {
  $transaction: (fn: (db: unknown) => unknown) => fn({ userRole: { findFirst: ctx.actor }, user: { findUnique: ctx.target } }),
} }));
vi.mock('../../../lib/session', () => ({ createSession: ctx.session, extractSessionToken: vi.fn() }));

const app = Fastify();
beforeAll(async () => { await app.register(cookie); await app.register(impersonateRoutes); });
afterAll(async () => { await app.close(); });
beforeEach(() => {
  vi.resetAllMocks();
  ctx.roles = ['SUPERADMIN'];
  ctx.actor.mockResolvedValue({userId:'actor'});
  ctx.session.mockResolvedValue({token:'fake-test-token'});
});
const request = () => app.inject({ method:'POST', url:'/admin/impersonate-user', payload:{userId:'target'} });
it('recusa administrador comum', async () => {
  ctx.roles = ['ADMIN'];
  expect((await request()).statusCode).toBe(403);
  expect(ctx.session).not.toHaveBeenCalled();
});
it.each(['MODERATOR','ADMIN','SUPERADMIN'])('protege alvo com papel %s',async role=>{
  ctx.target.mockResolvedValue({id:'target', role:'user', roles:[{role:{name:role}}]});
  expect((await request()).statusCode).toBe(403);
  expect(ctx.session).not.toHaveBeenCalled();
});
it('aceita superadmin sem ADMIN para alvo comum e registra o autor',async()=>{
  ctx.target.mockResolvedValue({id:'target', email:'test@example.test',fullName:'Teste', role:'user', roles:[]});
  expect((await request()).statusCode).toBe(200);
  expect(ctx.session).toHaveBeenCalledWith('target',expect.any(String),expect.anything(),expect.objectContaining({impersonatedBy:'actor'}));
});
