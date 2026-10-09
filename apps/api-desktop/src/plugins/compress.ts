import compress from '@fastify/compress';
import { FastifyInstance } from 'fastify';

export async function compressPlugin(fastify: FastifyInstance) {
  await fastify.register(compress, {
    encodings: ['gzip', 'deflate', 'br'],
    threshold: 1024, // Only compress responses larger than 1KB
    inflateIfDeflated: true,
    zlibOptions: {
      level: 6,
    },
  });
}
