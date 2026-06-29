import { FastifyRequest, FastifyReply } from 'fastify';
import { HealthService } from './health.service';

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  async check(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const health = await this.healthService.check();
    
    // Return appropriate status code based on health status
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    
    reply.status(statusCode).send(health);
  }
}
