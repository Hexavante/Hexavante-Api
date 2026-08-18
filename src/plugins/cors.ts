import { FastifyInstance } from 'fastify';

const isDevelopment = process.env.NODE_ENV !== 'production';

const devOrigins = [
  'http://localhost:3000',
  'http://localhost:3045',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3045',
  'http://127.0.0.1:5173',
  'https://hexavante.com.br',
  'https://www.hexavante.com.br',
  ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
];

const allowedOrigins = new Set(
  isDevelopment
    ? devOrigins
    : [...devOrigins, ...(process.env.CORS_ORIGIN?.split(',') || [])]
);

function isOriginAllowed(origin: string | undefined): boolean {
  return typeof origin === 'string' ? allowedOrigins.has(origin) : false;
}

export async function corsPlugin(fastify: FastifyInstance) {
  // Set CORS headers at the HTTP server level — before Fastify processes the request.
  // This ensures headers survive through Fastify's entire request lifecycle.
  const server = fastify.server;
  if (server) {
    server.on('request', (req, res) => {
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
