import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      throw result.error;
    }

    request.body = result.data;
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.query);

    if (!result.success) {
      throw result.error;
    }

    request.query = result.data;
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.params);

    if (!result.success) {
      throw result.error;
    }

    request.params = result.data;
  };
}
