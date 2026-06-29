import { AppError } from './AppError';
import { logger } from '../../config/logger';
import { ZodError } from 'zod';
import { createZodErrorResponse } from '../validation/zod-error-formatter';
export function handleError(error, request, reply) {
    if (error instanceof ZodError) {
        logger.warn({
            errors: error.issues,
            path: request.url,
            method: request.method,
        }, 'Validation error');
        reply.status(400).send(createZodErrorResponse(error));
        return;
    }
    if (error instanceof AppError) {
        logger.warn({
            error: error.message,
            code: error.code,
            statusCode: error.statusCode,
            path: request.url,
            method: request.method,
        }, 'Application error');
        reply.status(error.statusCode).send({
            success: false,
            error: error.message,
            code: error.code,
        });
        return;
    }
    if (error instanceof Error) {
        logger.error({
            error: error.message,
            stack: error.stack,
            path: request.url,
            method: request.method,
        }, 'Unexpected error');
        reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
        return;
    }
    logger.error({
        error: String(error),
        path: request.url,
        method: request.method,
    }, 'Unknown error');
    reply.status(500).send({
        success: false,
        error: 'Internal server error',
    });
}
export function asyncHandler(fn) {
    return async (request, reply) => {
        try {
            await fn(request, reply);
        }
        catch (error) {
            handleError(error, request, reply);
        }
    };
}
//# sourceMappingURL=errorHandler.js.map