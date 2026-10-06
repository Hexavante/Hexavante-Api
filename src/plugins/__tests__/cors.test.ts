import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { corsPlugin } from '../cors';

/**
 * Regressão do CORS em nível de servidor HTTP.
 *
 * Bug que este arquivo prende: com `server.on('request')` (listener registrado
 * DEPOIS do do Fastify) o preflight respondido sincronamente pelo
 * notFoundHandler fazia `res.setHeader` após os headers irem ao ar →
 * ERR_HTTP_HEADERS_SENT → processo caía e a request seguinte recebia
 * "connection refused".
 */
describe('corsPlugin', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(corsPlugin);
    app.get('/ping', async () => ({ ok: true }));
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address === null || typeof address === 'string') throw new Error('sem porta');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('preflight devolve 204 com allow-origin + credentials para a landing', async () => {
    const response = await fetch(`${baseUrl}/qualquer-rota`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://hexavante.com.br',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://hexavante.com.br');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    await response.text();
  });

  it('request seguinte NÃO derruba o processo (regressão ERR_HTTP_HEADERS_SENT)', async () => {
    const first = await fetch(`${baseUrl}/ping`, {
      headers: { origin: 'https://app.hexavante.com.br' },
    });
    expect(first.status).toBe(200);
    expect(first.headers.get('access-control-allow-origin')).toBe('https://app.hexavante.com.br');
    expect(first.headers.get('access-control-allow-credentials')).toBe('true');
    await first.text();

    // segunda request (mesma conexão keep-alive) — antes do fix o processo já
    // tinha morrido aqui e o fetch rejeitaria com "fetch failed"
    const second = await fetch(`${baseUrl}/ping`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://hexavante.com.br',
        'access-control-request-method': 'GET',
      },
    });
    expect(second.status).toBe(204);
    expect(second.headers.get('access-control-allow-origin')).toBe('https://hexavante.com.br');
    await second.text();

    const third = await fetch(`${baseUrl}/ping`, {
      headers: { origin: 'https://app.hexavante.com.br' },
    });
    expect(third.status).toBe(200);
    expect(third.headers.get('access-control-allow-credentials')).toBe('true');
    await third.text();
  });

  it('origem fora da allowlist não recebe allow-origin', async () => {
    const response = await fetch(`${baseUrl}/ping`, {
      headers: { origin: 'https://evil.com' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    await response.text();
  });

  it('sem Origin (curl/server-side) segue normal', async () => {
    const response = await fetch(`${baseUrl}/ping`);
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    await response.text();
  });
});

/**
 * P1-9: allowlist de produção — sem localhost/127.0.0.1, sem "*",
 * com os hosts próprios (landing, app, admin).
 *
 * O módulo computa a allowlist no load, então cada caso reimporta
 * o plugin com a env correspondente (vi.resetModules + import dinâmico).
 */
describe('corsPlugin em produção', () => {
  async function bootProdApp(extraEnv: Record<string, string> = {}) {
    vi.stubEnv('NODE_ENV', 'production');
    for (const [key, value] of Object.entries(extraEnv)) {
      vi.stubEnv(key, value);
    }
    vi.resetModules();
    const { corsPlugin: prodCors } = await import('../cors');
    const prodApp = Fastify({ logger: false });
    await prodApp.register(prodCors);
    prodApp.get('/ping', async () => ({ ok: true }));
    await prodApp.listen({ port: 0, host: '127.0.0.1' });
    const address = prodApp.server.address();
    if (address === null || typeof address === 'string') throw new Error('sem porta');
    return { prodApp, url: `http://127.0.0.1:${address.port}` };
  }

  async function closeProdApp(prodApp: FastifyInstance) {
    await prodApp.close();
    vi.unstubAllEnvs();
    vi.resetModules();
  }

  it('localhost NÃO recebe allow-origin em produção', async () => {
    const { prodApp, url } = await bootProdApp();
    try {
      const response = await fetch(`${url}/ping`, {
        headers: { origin: 'http://localhost:3000' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      await response.text();
    } finally {
      await closeProdApp(prodApp);
    }
  });

  it('127.0.0.1 NÃO recebe allow-origin em produção', async () => {
    const { prodApp, url } = await bootProdApp();
    try {
      const response = await fetch(`${url}/ping`, {
        headers: { origin: 'http://127.0.0.1:5173' },
      });
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      await response.text();
    } finally {
      await closeProdApp(prodApp);
    }
  });

  it('hosts próprios recebem allow-origin + credentials em produção', async () => {
    const { prodApp, url } = await bootProdApp();
    try {
      for (const origin of [
        'https://hexavante.com.br',
        'https://www.hexavante.com.br',
        'https://app.hexavante.com.br',
        'https://painel.hexavante.com.br',
      ]) {
        const response = await fetch(`${url}/ping`, { headers: { origin } });
        expect(response.headers.get('access-control-allow-origin')).toBe(origin);
        expect(response.headers.get('access-control-allow-credentials')).toBe('true');
        await response.text();
      }
    } finally {
      await closeProdApp(prodApp);
    }
  });

  it('CORS_ORIGIN="*" não abre nada (é descartado)', async () => {
    const { prodApp, url } = await bootProdApp({ CORS_ORIGIN: '*' });
    try {
      const evil = await fetch(`${url}/ping`, {
        headers: { origin: 'https://evil.com' },
      });
      expect(evil.headers.get('access-control-allow-origin')).toBeNull();
      await evil.text();

      const app = await fetch(`${url}/ping`, {
        headers: { origin: 'https://app.hexavante.com.br' },
      });
      expect(app.headers.get('access-control-allow-origin')).toBe(
        'https://app.hexavante.com.br'
      );
      await app.text();
    } finally {
      await closeProdApp(prodApp);
    }
  });
});
