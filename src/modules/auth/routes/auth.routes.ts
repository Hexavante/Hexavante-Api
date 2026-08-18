import { FastifyInstance } from 'fastify';
import { AuthController } from '../controller/auth.controller';
import { AuthService } from '../service/auth.service';
import { asyncHandler } from '../../../lib/errors/errorHandler';
import { auth } from '../../../config/auth';

export async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService();
  const authController = new AuthController(authService);

  fastify.post('/api/v1/auth/login', asyncHandler(authController.login.bind(authController)));
  fastify.post('/api/v1/auth/register', asyncHandler(authController.register.bind(authController)));
  fastify.post('/api/v1/auth/logout', asyncHandler(authController.logout.bind(authController)));
  fastify.get('/api/v1/auth/session', asyncHandler(authController.session.bind(authController)));

  // OAuth success page (used as callbackURL for desktop Electron OAuth)
  fastify.get('/api/v1/auth/oauth/success', async (_request, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Autenticado</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0b0b1a;color:#fff;text-align:center}p{font-size:1.125rem;opacity:.8}</style>
</head><body><div><h1>✅ Autenticado!</h1><p>Login realizado com sucesso. Esta janela será fechada automaticamente.</p>
<script>window.close()</script></div></body></html>`);
  });

  // GET redirect for OAuth (browser-friendly)
  fastify.get('/oauth/:provider', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const { callbackURL: rawCallbackURL } = request.query as { callbackURL?: string };
    const host = request.headers.host || 'localhost:3045';
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    const baseUrl = `${isLocal ? 'http' : 'https'}://${host}`;
    const socialUrl = new URL('/api/auth/sign-in/social', baseUrl);

    // Resolve relative callbackURLs to the web app's origin
    const webOrigin = process.env.CORS_ORIGIN?.split(',')[0]?.trim() || 'https://hexavante.com.br';
    const callbackURL = rawCallbackURL
      ? (rawCallbackURL.startsWith('http') ? rawCallbackURL : `${webOrigin}${rawCallbackURL.startsWith('/') ? '' : '/'}${rawCallbackURL}`)
      : `${webOrigin}/`;

    if (callbackURL) {
      socialUrl.searchParams.set('callbackURL', callbackURL);
    }

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Cookie', request.headers.cookie || '');
    headers.set('Origin', baseUrl);

    const req = new Request(socialUrl.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider, callbackURL }),
    });

    const response = await auth.handler(req);

    response.headers.forEach((value, key) => {
      if (key !== 'content-type' && key !== 'content-length') {
        reply.header(key, value);
      }
    });

    const body = response.body ? await response.text() : 'null';
    const data = JSON.parse(body);

    if (data.redirect && data.url) {
      return reply.redirect(data.url);
    }

    return reply.send(data);
  });
}
