import { beforeAll, describe, expect, it } from "vitest";

let desktop: typeof import("../apps/api-desktop/src/platform-security");
let mobile: typeof import("../apps/api-mobile/src/platform-security");

beforeAll(async () => {
  process.env.DESKTOP_TOKEN_SECRET = "desktop-test-secret-at-least-32-characters";
  process.env.MOBILE_TOKEN_SECRET = "mobile-test-secret-that-is-different-32";
  desktop = await import("../apps/api-desktop/src/platform-security");
  mobile = await import("../apps/api-mobile/src/platform-security");
});

describe("isolamento de plataforma", () => {
  it("aceita somente os cabeçalhos do cliente correto", () => {
    expect(desktop.isPlatformClient({ "x-hexavante-client": "desktop", "x-hexavante-client-version": "1.2.0" })).toBe(true);
    expect(desktop.isPlatformClient({ "x-hexavante-client": "mobile", "x-hexavante-client-version": "1.2.0" })).toBe(false);
    expect(mobile.isPlatformClient({ "x-hexavante-client": "mobile", "x-hexavante-client-version": "2.0.0" })).toBe(true);
    expect(mobile.isPlatformClient({ "x-hexavante-client": "desktop", "x-hexavante-client-version": "2.0.0" })).toBe(false);
  });

  it("rejeita na Mobile API um token emitido pela Desktop API", async () => {
    const token = await desktop.signPlatformClaims("opaque-session", "user-1", new Date(Date.now() + 60_000));
    await expect(desktop.verifyPlatformToken(token)).resolves.toBe("opaque-session");
    await expect(mobile.verifyPlatformToken(token)).rejects.toThrow();
  });

  it("rejeita na Desktop API um token emitido pela Mobile API", async () => {
    const token = await mobile.signPlatformClaims("opaque-session", "user-1", new Date(Date.now() + 60_000));
    await expect(mobile.verifyPlatformToken(token)).resolves.toBe("opaque-session");
    await expect(desktop.verifyPlatformToken(token)).rejects.toThrow();
  });
});

it("aplica identificação de cliente e isolamento do bearer no HTTP", async () => {
  const Fastify = (await import("fastify")).default;
  const app = Fastify();
  await desktop.registerPlatformSecurity(app);
  app.get("/protected", async (request) => ({ authorization: request.headers.authorization }));
  await app.ready();

  expect((await app.inject({ method: "GET", url: "/protected" })).statusCode).toBe(403);
  expect((await app.inject({ method: "GET", url: "/protected", headers: { "x-hexavante-client": "mobile", "x-hexavante-client-version": "1" } })).statusCode).toBe(403);

  const desktopToken = await desktop.signPlatformClaims("desktop-session", "user-1", new Date(Date.now() + 60_000));
  const accepted = await app.inject({ method: "GET", url: "/protected", headers: { authorization: `Bearer ${desktopToken}`, "x-hexavante-client": "desktop", "x-hexavante-client-version": "1.0.0" } });
  expect(accepted.statusCode).toBe(200);
  expect(accepted.json()).toEqual({ authorization: "Bearer desktop-session" });

  const mobileToken = await mobile.signPlatformClaims("mobile-session", "user-1", new Date(Date.now() + 60_000));
  const rejected = await app.inject({ method: "GET", url: "/protected", headers: { authorization: `Bearer ${mobileToken}`, "x-hexavante-client": "desktop", "x-hexavante-client-version": "1.0.0" } });
  expect(rejected.statusCode).toBe(401);
  await app.close();
});
