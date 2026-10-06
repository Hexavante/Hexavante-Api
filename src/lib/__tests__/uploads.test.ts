import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildProfileFilename,
  deleteProfileUpload,
  getMediaBaseUrl,
  getUploadRoot,
  profileUploadUrl,
} from "../uploads";

describe("uploads (storage abstraction)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("buildProfileFilename: ignora userId malicioso, sem traversal", () => {
    const name = buildProfileFilename("../../etc/passwd", "png");
    expect(name).not.toContain("/");
    expect(name).not.toContain("..");
    expect(name).toMatch(/^etcpasswd-\d+-[0-9a-f]{8}\.png$/);
  });

  it("buildProfileFilename: nunca repete o filename original", () => {
    const a = buildProfileFilename("user-1", "jpg");
    const b = buildProfileFilename("user-1", "jpg");
    expect(a).not.toBe(b);
    expect(a.endsWith(".jpg")).toBe(true);
  });

  it("getUploadRoot: respeita UPLOAD_DIR", () => {
    vi.stubEnv("UPLOAD_DIR", "/tmp/meus-uploads");
    expect(getUploadRoot()).toBe("/tmp/meus-uploads");
  });

  it("getMediaBaseUrl: prefere MEDIA_BASE_URL, sem barra final", () => {
    vi.stubEnv("MEDIA_BASE_URL", "https://cdn.exemplo.com/");
    expect(getMediaBaseUrl()).toBe("https://cdn.exemplo.com");
  });

  it("getMediaBaseUrl: default é a própria API fora de produção", () => {
    vi.stubEnv("MEDIA_BASE_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NODE_ENV", "test");
    expect(getMediaBaseUrl()).toBe("http://localhost:3045");
  });

  it("profileUploadUrl: monta URL sob /uploads/<kind>/", () => {
    vi.stubEnv("MEDIA_BASE_URL", "https://api.hexavante.com.br");
    expect(profileUploadUrl("avatars", "u-1.png")).toBe(
      "https://api.hexavante.com.br/uploads/avatars/u-1.png",
    );
  });

  describe("deleteProfileUpload (guards)", () => {
    const root = mkdtempSync(path.join(tmpdir(), "hexavante-uploads-test-"));

    function seed(kind: "avatars" | "banners", filename: string): string {
      mkdirSync(path.join(root, kind), { recursive: true });
      writeFileSync(path.join(root, kind, filename), "bytes");
      return `https://api.hexavante.com.br/uploads/${kind}/${filename}`;
    }

    it("apaga arquivo próprio e ignora o resto", async () => {
      vi.stubEnv("UPLOAD_DIR", root);
      vi.stubEnv("MEDIA_BASE_URL", "https://api.hexavante.com.br");
      const url = seed("avatars", "u-1-123-abcdef12.png");
      expect(existsSync(path.join(root, "avatars", "u-1-123-abcdef12.png"))).toBe(true);

      await deleteProfileUpload(url, "avatars");
      expect(existsSync(path.join(root, "avatars", "u-1-123-abcdef12.png"))).toBe(false);

      // Segunda chamada (já removido) não lança.
      await deleteProfileUpload(url, "avatars");
    });

    it("não apaga URL de outra base, outro kind ou com traversal", async () => {
      vi.stubEnv("UPLOAD_DIR", root);
      vi.stubEnv("MEDIA_BASE_URL", "https://api.hexavante.com.br");
      seed("avatars", "vitima.png");

      await deleteProfileUpload("https://evil.com/uploads/avatars/vitima.png", "avatars");
      await deleteProfileUpload(
        "https://api.hexavante.com.br/uploads/banners/vitima.png",
        "avatars",
      );
      await deleteProfileUpload(
        "https://api.hexavante.com.br/uploads/avatars/../banners/vitima.png",
        "avatars",
      );
      await deleteProfileUpload(null, "avatars");

      expect(existsSync(path.join(root, "avatars", "vitima.png"))).toBe(true);
    });
  });
});
