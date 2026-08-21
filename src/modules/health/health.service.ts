import { prisma } from '../../config/prisma';
import { getRedisClient } from '../../config/redis';

const START_TIME = Date.now();

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  database: {
    status: 'up' | 'down';
    responseTime?: number;
  };
  redis: {
    status: 'up' | 'down';
    responseTime?: number;
  };
}

export class HealthService {
  async check(): Promise<HealthCheck> {
    const startTime = Date.now();

    // Check database
    const dbCheck = await this.checkDatabase();

    // Check redis
    const redisCheck = await this.checkRedis();

    // Determine overall status
    const overallStatus = this.determineOverallStatus(dbCheck.status, redisCheck.status);

    return {
      status: overallStatus,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: dbCheck,
      redis: redisCheck,
    };
  }

  private async checkDatabase(): Promise<{ status: 'up' | 'down'; responseTime?: number }> {
    const startTime = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: 'up',
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'down',
      };
    }
  }

  private async checkRedis(): Promise<{ status: 'up' | 'down'; responseTime?: number }> {
    const startTime = Date.now();
    try {
      const redis = getRedisClient();
      await redis.ping();
      return {
        status: 'up',
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'down',
      };
    }
  }

  private determineOverallStatus(db: 'up' | 'down', redis: 'up' | 'down'): 'healthy' | 'degraded' | 'unhealthy' {
    if (db === 'down') {
      return 'unhealthy';
    }
    if (redis === 'down') {
      return 'degraded';
    }
    return 'healthy';
  }
}
