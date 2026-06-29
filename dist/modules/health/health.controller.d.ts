import { FastifyRequest, FastifyReply } from 'fastify';
import { HealthService } from './health.service';
export declare class HealthController {
    private readonly healthService;
    constructor(healthService: HealthService);
    check(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}
//# sourceMappingURL=health.controller.d.ts.map