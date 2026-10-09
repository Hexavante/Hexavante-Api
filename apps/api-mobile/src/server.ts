import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./config/logger";
import { prisma } from "./config/prisma";
import { closeRedisClient } from "./config/redis";
import { handleError } from "./lib/errors/errorHandler";
import { getUploadRoot, BANNER_MAX_BYTES } from "./lib/uploads";
import { corsPlugin } from "./plugins/cors";
import { helmetPlugin } from "./plugins/helmet";
import { compressPlugin } from "./plugins/compress";
import { registerGlobalRateLimit } from "./plugins/rate-limit";
import { healthRoutes } from "./modules/health/health.routes";
import { registerPlatformSecurity, PLATFORM, TOKEN_AUDIENCE, TOKEN_ISSUER } from "./platform-security";
import { authRoutes } from "./modules/auth/routes/auth.routes";
import { oauthRoutes } from "./modules/auth/routes/oauth.routes";
import { userRoutes } from "./modules/users/routes/user.routes";
import { courseRoutes } from "./modules/courses/routes/course.routes";
import { gamificationRoutes } from "./modules/gamification/routes/gamification.routes";
import { shopRoutes } from "./modules/shop/routes/shop.routes";
import { examRoutes } from "./modules/exams/routes/exam.routes";
import { tutorialRoutes } from "./modules/tutorials/routes/tutorial.routes";
import { platformRoutes } from "./modules/platform/routes/platform.routes";
import { mediaRoutes } from "./modules/media/routes/media.routes";
import { certificateRoutes } from "./modules/certificates/routes/certificate.routes";
import { notificationRoutes } from "./modules/notifications/routes/notification.routes";
import { conversationRoutes } from "./modules/conversations/routes/conversation.routes";
import { instructorRoutes } from "./modules/instructor/routes/instructor.routes";
import { liveRoomRoutes } from "./modules/live-rooms/routes/live-room.routes";
import { securityRoutes } from "./modules/security/routes/security.routes";

const AUTH_SECRET_ENV = "MOBILE_AUTH_SECRET";
function requireSecret(name: string): string {
  const value = process.env[name] || (process.env.NODE_ENV === "production" ? "" : `dev-only-${PLATFORM}-auth-secret-change-me`);
  if (value.length < 32) throw new Error(`${name} deve ter ao menos 32 caracteres`);
  return value;
}

export async function buildApp() {
  const app = Fastify({ logger: false, trustProxy: true });
  app.addHook("onRequest", (request, _reply, done) => { request.log = logger as never; done(); });
  await app.register(corsPlugin);
  await app.register(helmetPlugin);
  await registerGlobalRateLimit(app);
  await app.register(compressPlugin);
  await app.register(multipart, { limits: { fileSize: BANNER_MAX_BYTES, files: 1, fields: 0 } });
  await app.register(fastifyStatic, { root: path.join(getUploadRoot()), prefix: "/uploads/", index: false, redirect: false, allowedPath: (value) => /^\/(avatars|banners)\/[A-Za-z0-9_-]+\.(jpg|png|gif|webp)$/.test(value) });
  await app.register(cookie, { secret: requireSecret(AUTH_SECRET_ENV), hook: "onRequest", parseOptions: {} });
  await registerPlatformSecurity(app);
  app.addSchema({ $id: "HealthCheck", type: "object", additionalProperties: true });

  const docsUser = process.env.MOBILE_SWAGGER_USER;
  const docsPass = process.env.MOBILE_SWAGGER_PASS;
  if (process.env.NODE_ENV !== "production" || (docsUser && docsPass)) {
    await app.register(swagger, { openapi: { info: { title: "Hexavante Mobile API", version: "1.0.0" }, servers: [{ url: "https://mobile-api.hexavante.com.br", description: "Produção" }], components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } } } });
    await app.register(swaggerUi, { routePrefix: "/docs", uiHooks: { onRequest: (request, reply, done) => { if (!docsUser || !docsPass) return done(); const auth=request.headers.authorization; const decoded=auth?.startsWith("Basic ") ? Buffer.from(auth.slice(6),"base64").toString() : ""; if (decoded===`${docsUser}:${docsPass}`) return done(); reply.header("WWW-Authenticate", 'Basic realm="Hexavante API Docs"').code(401).send({error:"Autenticação necessária"}); } } });
  }

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(oauthRoutes);
  await app.register(userRoutes);
  await app.register(courseRoutes);
  await app.register(gamificationRoutes);
  await app.register(shopRoutes);
  await app.register(examRoutes);
  await app.register(tutorialRoutes);
  await app.register(platformRoutes);
  await app.register(mediaRoutes);
  await app.register(certificateRoutes);
  await app.register(notificationRoutes);
  await app.register(conversationRoutes);
  await app.register(instructorRoutes);
  await app.register(liveRoomRoutes);
  await app.register(securityRoutes);
  app.get("/", async () => ({ status: "ok", platform: PLATFORM, issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE, version: "1.0.0", health: "/health", docs: "/docs" }));
  app.setErrorHandler((error, request, reply) => { if (!reply.sent) handleError(error, request, reply); });
  await app.ready();
  return app;
}

export async function start(): Promise<void> {
  const app = await buildApp();
  const shutdown = async (signal: string) => { logger.info({signal}, "Received shutdown signal"); await app.close(); await closeRedisClient(); await prisma.$disconnect(); };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  const port = Number(process.env.MOBILE_PORT || process.env.PORT || 3047);
  const host = process.env.HOST || "0.0.0.0";
  await app.listen({port,host});
  logger.info({port,host,platform:PLATFORM}, "API listening");
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) start().catch((error) => { logger.error({error}, "Failed to start API"); process.exit(1); });
