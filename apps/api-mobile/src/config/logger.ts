import pino from "pino";
const isDevelopment = process.env.NODE_ENV !== "production";
export const logger = pino({ level: process.env.MOBILE_LOG_LEVEL || "info", base: { platform: "mobile", service: "api-mobile" }, transport: isDevelopment ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:mm:ss Z", ignore: "pid,hostname" } } : undefined, serializers: { err: pino.stdSerializers.err, error: pino.stdSerializers.err } });
