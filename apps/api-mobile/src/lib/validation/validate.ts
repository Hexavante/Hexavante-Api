import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodObject, ZodRawShape } from 'zod';

// Schemas podem ser planos ({email}) ou envelopes ({params:{...}}).
// Desembrulha automaticamente para a parte validada.
function parsePart(schema: ZodSchema, part: 'body' | 'query' | 'params', data: unknown) {
  if (schema instanceof ZodObject) {
    const shape = (schema as ZodObject<ZodRawShape>).shape;
    const inner = (shape as Record<string, ZodSchema | undefined>)[part];
    if (inner) {
      const result = inner.safeParse(data);
      return { result, assign: (req: FastifyRequest) => { (req as unknown as Record<string, unknown>)[part] = result.success ? result.data : data; } };
    }
  }
  const result = schema.safeParse(data);
  return { result, assign: (req: FastifyRequest) => { (req as unknown as Record<string, unknown>)[part] = result.success ? result.data : data; } };
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { result, assign } = parsePart(schema, 'body', request.body);

    if (!result.success) {
      throw result.error;
    }

    assign(request);
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { result, assign } = parsePart(schema, 'query', request.query);

    if (!result.success) {
      throw result.error;
    }

    assign(request);
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { result, assign } = parsePart(schema, 'params', request.params);

    if (!result.success) {
      throw result.error;
    }

    assign(request);
  };
}
