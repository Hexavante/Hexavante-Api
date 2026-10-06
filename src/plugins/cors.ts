import { FastifyInstance } from 'fastify';

const isProduction = process.env.NODE_ENV === 'production';

// Origens locais de desenvolvimento. NUNCA entram na allowlist de produção.
const localhostOrigins = [
  'http://localhost:3000',
  'http://localhost:3045',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3045',
  'http://127.0.0.1:5173',
];

// Hosts próprios atendidos com credentials em produção: landing, app web
// (sessão no cookie __Secure-hexavante.session_token) e admin (painel).
// A landing compra moedas com credentials: "include", então o origin precisa
// estar na allowlist E receber Access-Control-Allow-Credentials: true.
const prodBaseOrigins = [
  'https://hexavante.com.br',
  'https://www.hexavante.com.br',
  'https://app.hexavante.com.br',
  'https://painel.hexavante.com.br',
];

// Origens extras por ambiente. "*" é descartado de propósito: com
// credentials:true o navegador exige a origin espelhada de forma exata, e
// "*" nunca igualaria um Origin real (só mascarava configuração errada).
const envOrigins = (process.env.CORS_ORIGIN?.split(',') || [])
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0 && origin !== '*');

const selfOrigins = process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [];

const allowedOrigins = new Set(
  isProduction
    ? [...prodBaseOrigins, ...envOrigins, ...selfOrigins]
    : [...localhostOrigins, ...prodBaseOrigins, ...envOrigins, ...selfOrigins]
);

function isOriginAllowed(origin: string | undefined): boolean {
  return typeof origin === 'string' ? allowedOrigins.has(origin) : false;
}

export async function corsPlugin(fastify: FastifyInstance) {
  // Set CORS headers at the HTTP server level — before Fastify processes the request.
  // This ensures headers survive through Fastify's entire request lifecycle.
  const server = fastify.server;
  if (server) {
    // `prependListener` é essencial: o listener do Fastify já está registrado
    // no `server` (foi ele quem criou) e responde SINCRONAMENTE em alguns
    // caminhos — ex.: o preflight OPTIONS do notFoundHandler manda 204 no
    // mesmo tick. Com `server.on(...)` o nosso hook rodava DEPOIS, chamava
    // `res.setHeader` com headers já enviados e o processo MORRIA com
    // ERR_HTTP_HEADERS_SENT (request seguinte → conexão recusada).
    // O guard `headersSent` cobre qualquer outro listener que responda antes.
    server.prependListener('request', (req, res) => {
      if (res.headersSent) return;
      const origin = req.headers.origin;
      if (isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin as string);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Range, X-Content-Range');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
    });
  }

  // Handle OPTIONS preflight via Fastify's not-found handler.
  fastify.setNotFoundHandler(async (request, reply) => {
    const origin = request.headers.origin;
    if (isOriginAllowed(origin)) {
      reply.header('Access-Control-Allow-Origin', origin as string);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Expose-Headers', 'Content-Range, X-Content-Range');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      reply.header('Access-Control-Max-Age', '86400');
    }
    if (request.method === 'OPTIONS') {
      reply.status(204);
      reply.send('');
      return;
    }
    reply.status(404);
    reply.send({ error: 'Route not found' });
  });
}
