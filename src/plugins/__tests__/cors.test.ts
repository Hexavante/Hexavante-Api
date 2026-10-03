import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
