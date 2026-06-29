import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema } from 'zod';
export declare function validateBody<T>(schema: ZodSchema<T>): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
export declare function validateQuery<T>(schema: ZodSchema<T>): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
export declare function validateParams<T>(schema: ZodSchema<T>): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
//# sourceMappingURL=validate.d.ts.map