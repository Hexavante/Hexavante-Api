import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Abstração de storage de mídia de perfil (avatar/banner).
 *
 * Espelha o backend do Web (filesystem local, layout `<root>/avatars|banners`,
 * URLs absolutas no banco), sem importar código Next.js:
 * - `UPLOAD_DIR`: raiz dos arquivos (default `<cwd>/public/uploads`).
 *   Aponte para um volume compartilhado com o Web para convergência total.
 * - `MEDIA_BASE_URL`: base pública das URLs (default: a própria API).
 *   Com volume compartilhado, aponte para a URL do app
 *   (`https://app.hexavante.com.br`) e as URLs saem idênticas às do Web.
 */

export type ProfileMediaKind = "avatars" | "banners";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const BANNER_MAX_BYTES = 8 * 1024 * 1024;

/** Raiz dos uploads. Leitura preguiçosa para respeitar a env vigente. */
export function getUploadRoot(): string {
  const dir = process.env.UPLOAD_DIR?.trim();
  return dir || path.join(process.cwd(), "public", "uploads");
}

/** Base pública das URLs de mídia (sem barra final). */
export function getMediaBaseUrl(): string {
  const explicit = process.env.MEDIA_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const api =
    process.env.BETTER_AUTH_URL ||
    process.env.AUTH_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://api.hexavante.com.br"
      : "http://localhost:3045");
  return api.replace(/\/$/, "");
}

/**
 * Nome de arquivo gerado no servidor: nunca usa o filename original
 * (anti path traversal e anti sobrescrita arbitrária).
 */
export function buildProfileFilename(userId: string, ext: string): string {
  const safeUser =
    userId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "user";
  const rand = randomBytes(4).toString("hex");
  return `${safeUser}-${Date.now()}-${rand}.${ext}`;
}

/** URL pública do arquivo recém-salvo. */
export function profileUploadUrl(kind: ProfileMediaKind, filename: string): string {
  return `${getMediaBaseUrl()}/uploads/${kind}/${filename}`;
}

/** Grava o arquivo validado. O nome vem de `buildProfileFilename`. */
export async function saveProfileUpload(
  kind: ProfileMediaKind,
  filename: string,
  buffer: Buffer,
): Promise<void> {
  const base = path.basename(filename);
  if (!base || base !== filename || base.includes("..")) {
    throw new Error("Nome de arquivo inválido.");
  }
  const dir = path.join(getUploadRoot(), kind);
  await mkdir(dir, { recursive: true });
  // `wx` impede sobrescrita mesmo em colisão improvável ou chamada indevida.
  await writeFile(path.join(dir, base), buffer, { flag: "wx" });
}

/**
 * Remove um arquivo anterior — SOMENTE se estiver sob nossa base e prefixo
 * (`/uploads/<kind>/`, filename sem `/` ou `..`), mesma semântica do Web.
 * Nunca lança: arquivo ausente/externo é ignorado silenciosamente.
 */
export async function deleteProfileUpload(
  publicUrl: string | null | undefined,
  kind: ProfileMediaKind,
): Promise<void> {
  try {
    if (!publicUrl) return;
    const base = getMediaBaseUrl();
    let rel: string | null = null;
    if (publicUrl.startsWith(`${base}/uploads/`)) {
      rel = publicUrl.slice(base.length);
    } else if (publicUrl.startsWith("/uploads/")) {
      rel = publicUrl;
    }
    const prefix = `/uploads/${kind}/`;
    if (!rel || !rel.startsWith(prefix)) return;
    const filename = rel.slice(prefix.length);
    if (!filename || filename.includes("/") || filename.includes("..")) return;
    await unlink(path.join(getUploadRoot(), kind, filename));
  } catch {
    // Arquivo já removido ou externo — segue o jogo.
  }
}
