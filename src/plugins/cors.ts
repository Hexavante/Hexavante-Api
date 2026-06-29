import cors from '@fastify/cors';
import { FastifyInstance } from 'fastify';

const isDevelopment = process.env.NODE_ENV !== 'production';

export async function corsPlugin(fastify: FastifyInstance) {
  await fastify.register(cors, {
    origin: isDevelopment
      ? ['http://localhost:3000', 'http://localhost:3045', 'http://127.0.0.1:3000', 'http://127.0.0.1:3045']
      : (process.env.CORS_ORIGIN?.split(',') || []),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400, // 24 hours
  });
}
