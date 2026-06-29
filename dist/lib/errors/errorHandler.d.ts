import { FastifyReply, FastifyRequest } from 'fastify';
export declare function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply): void;
export declare function asyncHandler<T = unknown>(fn: (request: FastifyRequest, reply: FastifyReply) => Promise<T>): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
//# sourceMappingURL=errorHandler.d.ts.map