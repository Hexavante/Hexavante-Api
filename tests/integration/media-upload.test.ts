import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/server";
import { prisma } from "../../src/config/prisma";

/**
 * Upload de avatar/banner via API (fluxo do Desktop).
 * Precisa de banco+Redis locais (mesmo esquema dos demais testes de integração).
 */

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function multipartBody(
  boundary: string,
  parts: Array<{ name: string; filename: string; contentType: string; data: Buffer }>,
): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.contentType}\r\n\r\n`,
      ),
      part.data,
      Buffer.from("\r\n"),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

describe("POST /api/v1/users/me/avatar|banner", () => {
  let app: FastifyInstance;
  let cookie: string;
  const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const user = await prisma.user.create({
      data: {
        fullName: "Upload Test",
        email: `upload-${suffix}@example.com`,
        username: `upload_${suffix}`,
      },
      select: { id: true },
    });
    const token = randomBytes(32).toString("base64url");
    await prisma.session.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_60_1000),
      },
    });
    cookie = `__Secure-hexavante.session_token=${token}`;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: `upload-${suffix}@example.com` } } });
    await prisma.user.deleteMany({ where: { email: `upload-${suffix}@example.com` } });
    await app.close();
  });

  function post(
    url: string,
    payload: Buffer,
    extraHeaders: Record<string, string> = {},
  ) {
    const boundary = "----hexavante-test-boundary";
    return app.inject({
      method: "POST",
      url,
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        cookie,
        ...extraHeaders,
      },
      payload,
    });
  }

  function filePart(data: Buffer, filename = "foto.png", contentType = "image/png") {
    return multipartBody("----hexavante-test-boundary", [
      { name: "file", filename, contentType, data },
    ]);
  }

  it("401 sem sessão", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/users/me/avatar",
      headers: { "content-type": "multipart/form-data; boundary=----x" },
      payload: filePart(PNG_1X1),
    });
    expect(response.statusCode).toBe(401);
  });

  it("avatar válido: 200 + { avatarUrl } persistido", async () => {
    const response = await post("/api/v1/users/me/avatar", filePart(PNG_1X1));
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(typeof body.avatarUrl).toBe("string");
    expect(body.avatarUrl).toMatch(/\/uploads\/avatars\/.+\.png$/);
    expect(Object.keys(body)).toEqual(["avatarUrl"]);

    const user = await prisma.user.findUnique({
      where: { email: `upload-${suffix}@example.com` },
      select: { avatarUrl: true },
    });
    expect(user?.avatarUrl).toBe(body.avatarUrl);
  });

  it("banner válido: 200 + { bannerUrl }", async () => {
    const response = await post("/api/v1/users/me/banner", filePart(PNG_1X1));
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.bannerUrl).toMatch(/\/uploads\/banners\/.+\.png$/);
  });

  it("rejeita texto com MIME de imagem (magic bytes mandam)", async () => {
    const response = await post(
      "/api/v1/users/me/avatar",
      filePart(Buffer.from("nao sou imagem"), "foto.png", "image/png"),
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toContain("PNG, JPG, GIF ou WebP");
  });

  it("rejeita SVG", async () => {
    const response = await post(
      "/api/v1/users/me/avatar",
      filePart(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        "foto.svg",
        "image/svg+xml",
      ),
    );
    expect(response.statusCode).toBe(400);
  });

  it("rejeita avatar acima de 5MB (parser + checagem)", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    const response = await post("/api/v1/users/me/avatar", filePart(big, "grande.png"));
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toContain("5MB");
  });

  it("rejeita campo extra inesperado", async () => {
    const boundary = "----hexavante-test-boundary";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="userId"\r\n\r\noutro-user\r\n`,
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="foto.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      PNG_1X1,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await post("/api/v1/users/me/avatar", payload);
    // userId via campo é rejeitado: nunca decide o proprietário (só a sessão).
    expect(response.statusCode).toBe(400);
  });

  it("rejeita mais de um arquivo (exatamente um por operação)", async () => {
    const response = await post(
      "/api/v1/users/me/avatar",
      multipartBody("----hexavante-test-boundary", [
        { name: "file", filename: "a.png", contentType: "image/png", data: PNG_1X1 },
        { name: "file", filename: "b.png", contentType: "image/png", data: PNG_1X1 },
      ]),
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toContain("exatamente um arquivo");
  });
});
