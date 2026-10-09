import type { FastifyInstance } from "fastify";

const configured = (process.env.MOBILE_CORS_ORIGIN || "").split(",").map((value) => value.trim()).filter(Boolean);
const development = process.env.NODE_ENV === "production" ? [] : ["capacitor://localhost","http://localhost","exp://localhost"];
const allowedOrigins = new Set([...configured, ...development]);
const allowHeaders = "Content-Type, Authorization, X-Requested-With, X-Hexavante-Client, X-Hexavante-Client-Version";

function allowed(origin: string | undefined): origin is string { return typeof origin === "string" && allowedOrigins.has(origin); }
function apply(origin: string, set: (name: string, value: string) => void): void {
  set("Access-Control-Allow-Origin", origin);
  set("Vary", "Origin");
  set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  set("Access-Control-Allow-Headers", allowHeaders);
  set("Access-Control-Expose-Headers", "Content-Range, X-Content-Range");
  set("Access-Control-Max-Age", "86400");
}

export async function corsPlugin(app: FastifyInstance): Promise<void> {
  app.server.prependListener("request", (request, response) => {
    if (!response.headersSent && allowed(request.headers.origin)) apply(request.headers.origin, (name,value) => response.setHeader(name,value));
  });
  app.setNotFoundHandler(async (request, reply) => {
    if (allowed(request.headers.origin)) apply(request.headers.origin, (name,value) => reply.header(name,value));
    if (request.method === "OPTIONS") return reply.code(204).send();
    return reply.code(404).send({error:"Route not found"});
  });
}
