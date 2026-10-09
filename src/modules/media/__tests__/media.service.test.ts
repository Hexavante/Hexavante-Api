import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Evita conexão real: o import do repository puxa o módulo prisma.
vi.mock("../../../../packages/core/src/config/prisma", () => ({ prisma: {} }));

import { MediaService } from "../service/media.service";
import { getUploadRoot } from "../../../lib/uploads";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const NOT_AN_IMAGE = Buffer.from("sou um texto, não uma imagem");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

function fakeUsers(overrides: Record<string, unknown> = {}) {
  return {
    findMediaUrls: vi.fn().mockResolvedValue({ avatarUrl: null, bannerUrl: null }),
    updateAvatarUrl: vi.fn().mockImplementation(async (_id: string, url: string) => ({ avatarUrl: url })),
    updateBannerUrl: vi.fn().mockImplementation(async (_id: string, url: string) => ({ bannerUrl: url })),
    ...overrides,
  } as any;
}

/**
 * Service de mídia com filesystem real em tmpdir (UPLOAD_DIR por teste)
 * e repositório fake. Sem banco, sem rede.
 */
describe("MediaService", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "hexavante-media-test-"));
    vi.stubEnv("UPLOAD_DIR", root);
    vi.stubEnv("MEDIA_BASE_URL", "https://api.hexavante.com.br");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function uploadedFiles(kind: "avatars" | "banners"): string[] {
    try {
      return readdirSync(path.join(getUploadRoot(), kind));
    } catch {
      return [];
    }
  }

  it("avatar válido: salva, persiste e responde { avatarUrl }", async () => {
    const users = fakeUsers();
    const service = new MediaService(users);

    const result = await service.updateAvatar("user-1", PNG_1X1);

    expect(result.avatarUrl).toMatch(
      /^https:\/\/api\.hexavante\.com\.br\/uploads\/avatars\/user-1-\d+-[0-9a-f]{8}\.png$/,
    );
    expect(users.updateAvatarUrl).toHaveBeenCalledWith("user-1", result.avatarUrl);
    expect(uploadedFiles("avatars")).toHaveLength(1);
  });

  it("rejeita conteúdo que não é imagem (magic bytes)", async () => {
    const service = new MediaService(fakeUsers());
    await expect(service.updateAvatar("user-1", NOT_AN_IMAGE)).rejects.toThrow(
      "Use uma imagem PNG, JPG, GIF ou WebP.",
    );
    expect(uploadedFiles("avatars")).toHaveLength(0);
  });

  it("rejeita SVG mesmo com dados válidos", async () => {
    const service = new MediaService(fakeUsers());
    await expect(service.updateBanner("user-1", SVG)).rejects.toThrow(
      "Use uma imagem PNG, JPG, GIF ou WebP.",
    );
    expect(uploadedFiles("banners")).toHaveLength(0);
  });

  it("rejeita buffer vazio e acima do limite", async () => {
    const service = new MediaService(fakeUsers());
    await expect(service.updateAvatar("user-1", Buffer.alloc(0))).rejects.toThrow(
      "Selecione uma imagem válida.",
    );
    await expect(
      service.updateAvatar("user-1", Buffer.alloc(5 * 1024 * 1024 + 1)),
    ).rejects.toThrow("no máximo 5MB");
    await expect(
      service.updateBanner("user-1", Buffer.alloc(8 * 1024 * 1024 + 1)),
    ).rejects.toThrow("no máximo 8MB");
  });

  it("troca: apaga o arquivo antigo somente após confirmar o banco", async () => {
    const oldUrl = "https://api.hexavante.com.br/uploads/avatars/user-1-antigo.png";
    const users = fakeUsers({
      findMediaUrls: vi.fn().mockResolvedValue({ avatarUrl: oldUrl, bannerUrl: null }),
    });
    // Arquivo antigo "legado" presente no disco.
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(path.join(root, "avatars"), { recursive: true });
    writeFileSync(path.join(root, "avatars", "user-1-antigo.png"), "antigo");
    const order: string[] = [];
    users.updateAvatarUrl.mockImplementation(async (_id: string, url: string) => {
      order.push(`banco:${existsSync(path.join(root, "avatars", "user-1-antigo.png")) ? "antigo-presente" : "antigo-sumiu"}`);
      return { avatarUrl: url };
    });

    const service = new MediaService(users);
    const result = await service.updateAvatar("user-1", PNG_1X1);

    expect(result.avatarUrl).not.toBe(oldUrl);
    // Banco atualizado com o antigo ainda em disco; depois, antigo removido.
    expect(order).toEqual(["banco:antigo-presente"]);
    expect(existsSync(path.join(root, "avatars", "user-1-antigo.png"))).toBe(false);
    expect(uploadedFiles("avatars")).toHaveLength(1);
  });

  it("falha de banco após upload: remove o arquivo novo (sem lixo)", async () => {
    const users = fakeUsers({
      updateAvatarUrl: vi.fn().mockRejectedValue(new Error("banco fora do ar")),
    });
    const service = new MediaService(users);

    await expect(service.updateAvatar("user-1", PNG_1X1)).rejects.toThrow("banco fora do ar");
    expect(uploadedFiles("avatars")).toHaveLength(0);
  });

  it("falha ao ler a URL anterior: remove o arquivo novo", async () => {
    const users = fakeUsers({
      findMediaUrls: vi.fn().mockRejectedValue(new Error("banco fora do ar")),
    });
    const service = new MediaService(users);

    await expect(service.updateAvatar("user-1", PNG_1X1)).rejects.toThrow("banco fora do ar");
    expect(uploadedFiles("avatars")).toHaveLength(0);
  });
});
