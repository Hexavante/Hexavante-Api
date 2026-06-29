import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { logger } from "./config/logger";
import { closeRedisClient } from "./config/redis";
import { authRoutes } from "./modules/auth/routes/auth.routes";
import { healthRoutes } from "./modules/health/health.routes";
import { prisma } from "./config/prisma";
import { corsPlugin } from "./plugins/cors";
import { helmetPlugin } from "./plugins/helmet";
import { rateLimitPlugin } from "./plugins/rate-limit";
import { compressPlugin } from "./plugins/compress";

const fastify = Fastify({
  logger: false,
});

fastify.addHook("onRequest", (request, reply, done) => {
  request.log = logger as any;
  done();
});

await fastify.register(corsPlugin);
await fastify.register(helmetPlugin);
await fastify.register(rateLimitPlugin);
await fastify.register(compressPlugin);

await fastify.register(swagger, {
  openapi: {
    info: {
      title: "Hexavante API",
      description: "API da Plataforma Educacional Hexavante",
      version: "1.0.0",
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3045}`,
        description: "Development server",
      },
    ],
  },
});

await fastify.register(swaggerUi, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: false,
  },
});

fastify.addSchema({
  $id: "HealthCheck",
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["healthy", "degraded", "unhealthy"],
      description: "Overall health status",
    },
    uptime: {
      type: "number",
      description: "Server uptime in milliseconds",
    },
    environment: {
      type: "string",
      description: "Current environment",
    },
    version: {
      type: "string",
      description: "API version",
    },
    timestamp: {
      type: "string",
      format: "date-time",
      description: "Current timestamp",
    },
    database: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["up", "down"] },
        responseTime: {
          type: "number",
          description: "Response time in milliseconds",
        },
      },
    },
    redis: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["up", "down"] },
        responseTime: {
          type: "number",
          description: "Response time in milliseconds",
        },
      },
    },
    memory: {
      type: "object",
      properties: {
        used: { type: "number", description: "Used memory in MB" },
        total: { type: "number", description: "Total memory in MB" },
        percentage: { type: "number", description: "Memory usage percentage" },
      },
    },
    cpu: {
      type: "object",
      properties: {
        usage: { type: "number", description: "CPU usage percentage" },
      },
    },
    responseTime: {
      type: "number",
      description: "Health check response time in milliseconds",
    },
  },
});

await fastify.register(healthRoutes);
await fastify.register(authRoutes);

fastify.get("/", async () => {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    health: "/health",
    docs: "/docs",
  };
});

fastify.setErrorHandler((error, request, reply) => {
  logger.error(
    {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      path: request.url,
      method: request.method,
    },
    "Unhandled error",
  );

  reply.status(500).send({
    success: false,
    error: "Internal server error",
  });
});

const gracefulShutdown = async (signal: string) => {
  logger.info({ signal }, "Received shutdown signal");
  await fastify.close();
  await closeRedisClient();
  await prisma.$disconnect();
  logger.info("Server shutdown complete");
  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3045;
    const host = process.env.HOST || "0.0.0.0";
    await fastify.listen({ port, host });
    logger.info(`🚀 Server running on http://${host}:${port}`);
    logger.info(`📖 Documentation available at http://${host}:${port}/docs`);
  } catch (err) {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  }
};

start();
