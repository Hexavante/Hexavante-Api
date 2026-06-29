import compress from '@fastify/compress';
export async function compressPlugin(fastify) {
    await fastify.register(compress, {
        encodings: ['gzip', 'deflate', 'br'],
        threshold: 1024, // Only compress responses larger than 1KB
        inflateIfDeflated: true,
        zlibOptions: {
            level: 6,
        },
    });
}
//# sourceMappingURL=compress.js.map