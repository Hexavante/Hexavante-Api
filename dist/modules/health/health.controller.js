export class HealthController {
    healthService;
    constructor(healthService) {
        this.healthService = healthService;
    }
    async check(request, reply) {
        const health = await this.healthService.check();
        // Return appropriate status code based on health status
        const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
        reply.status(statusCode).send(health);
    }
}
//# sourceMappingURL=health.controller.js.map