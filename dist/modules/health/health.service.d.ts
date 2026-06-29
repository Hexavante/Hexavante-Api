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
export declare class HealthService {
    check(): Promise<HealthCheck>;
    private checkDatabase;
    private checkRedis;
    private getMemoryUsage;
    private getCpuUsage;
    private determineOverallStatus;
}
//# sourceMappingURL=health.service.d.ts.map