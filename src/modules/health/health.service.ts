import { prisma } from '../../config/prisma';
import { getRedisClient } from '../../config/redis';

const START_TIME = Date.now();

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  environment: string;
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
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  responseTime: number;
}

export class HealthService {
  async check(): Promise<HealthCheck> {
    const startTime = Date.now();

    // Check database
    const dbCheck = await this.checkDatabase();

    // Check redis
    const redisCheck = await this.checkRedis();

    // Get memory usage
    const memory = this.getMemoryUsage();

    // Get CPU usage
    const cpu = this.getCpuUsage();

    const responseTime = Date.now() - startTime;

    // Determine overall status
    const overallStatus = this.determineOverallStatus(dbCheck.status, redisCheck.status);

    return {
      status: overallStatus,
      uptime: Date.now() - START_TIME,
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: dbCheck,
      redis: redisCheck,
      memory,
      cpu,
      responseTime,
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

  private getMemoryUsage() {
    const usage = process.memoryUsage();
    const used = usage.heapUsed / 1024 / 1024; // MB
    const total = usage.heapTotal / 1024 / 1024; // MB
    const percentage = (used / total) * 100;

    return {
      used: Math.round(used * 100) / 100,
      total: Math.round(total * 100) / 100,
      percentage: Math.round(percentage * 100) / 100,
    };
  }

  private getCpuUsage() {
    // CPU usage is complex to get accurately in Node.js
    // This is a simplified version using process.cpuUsage()
    const usage = process.cpuUsage();
    const total = usage.user + usage.system;
    // Convert to percentage (simplified)
    const percentage = (total / 1000000) * 100; // Convert microseconds to seconds

    return {
      usage: Math.min(100, Math.round(percentage * 100) / 100),
    };
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
