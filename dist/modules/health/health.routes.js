import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { asyncHandler } from '../../lib/errors/errorHandler';
export async function healthRoutes(fastify) {
    const healthService = new HealthService();
    const healthController = new HealthController(healthService);
    fastify.get('/health', {
        schema: {
            description: 'Health check endpoint',
            tags: ['Health'],
            response: {
                200: {
                    description: 'Health check response',
                    $ref: '#/components/schemas/HealthCheck',
                },
                503: {
                    description: 'Service unhealthy',
                    $ref: '#/components/schemas/HealthCheck',
                },
            },
        },
    }, asyncHandler(healthController.check.bind(healthController)));
}
//# sourceMappingURL=health.routes.js.map