import { fileTypeFromBuffer } from "file-type";
import { BadRequestError } from "../../../lib/errors/AppError";
import {
  AVATAR_MAX_BYTES,
  BANNER_MAX_BYTES,
  buildProfileFilename,
  deleteProfileUpload,
  profileUploadUrl,
  saveProfileUpload,
  type ProfileMediaKind,
} from "../../../lib/uploads";
import { UserRepository } from "../../users/repository/user.repository";

/**
 * Upload de avatar/banner via API (Desktop e demais clientes REST).
 *
 * Fluxo seguro (espelha o Web sem copiar suas falhas):
 * 1. valida tamanho + assinatura real do arquivo (magic bytes — nunca o
 *    MIME/extensão do cliente); só raster: JPEG, PNG, GIF, WebP (sem SVG);
 * 2. faz upload com nome gerado no servidor;
 * 3. confirma o upload e atualiza o banco (mesmos campos do Web);
 * 4. somente depois remove o arquivo antigo (se for nosso);
 * 5. falha de banco após o upload → remove o arquivo novo (sem lixo).
 *
 * Uma falha aqui nunca apaga a mídia atual nem perde alterações textuais
 * (upload e PATCH /users/me são independentes).
 */
const ALLOWED_MIME_TO_EXT = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);

export class MediaService {
  constructor(private readonly users: UserRepository = new UserRepository()) {}

  async updateAvatar(userId: string, buffer: Buffer): Promise<{ avatarUrl: string }> {
    const { url } = await this.updateProfileMedia(userId, "avatars", buffer, AVATAR_MAX_BYTES, "5MB");
    return { avatarUrl: url };
  }

  async updateBanner(userId: string, buffer: Buffer): Promise<{ bannerUrl: string }> {
    const { url } = await this.updateProfileMedia(userId, "banners", buffer, BANNER_MAX_BYTES, "8MB");
    return { bannerUrl: url };
  }

  private async updateProfileMedia(
    userId: string,
    kind: ProfileMediaKind,
    buffer: Buffer,
    maxBytes: number,
    maxLabel: string,
  ): Promise<{ url: string }> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestError("Selecione uma imagem válida.");
    }
    if (buffer.length > maxBytes) {
      throw new BadRequestError(`A imagem deve ter no máximo ${maxLabel}.`);
    }

    // Magic bytes: o que vale é o conteúdo real, não o que o cliente declarou.
    const detected = await fileTypeFromBuffer(buffer);
    const ext = (detected && ALLOWED_MIME_TO_EXT.get(detected.mime)) || null;
    if (!ext) {
      throw new BadRequestError("Use uma imagem PNG, JPG, GIF ou WebP.");
    }

    const filename = buildProfileFilename(userId, ext);
    await saveProfileUpload(kind, filename, buffer);
    const url = profileUploadUrl(kind, filename);

    let previous: { avatarUrl: string | null; bannerUrl: string | null };
    let updateAttempted = false;
    try {
      // Toda operação de banco após o upload fica no try, para remover
      // o novo arquivo também se a leitura do valor anterior falhar.
      previous = await this.users.findMediaUrls(userId);
      if (kind === "avatars") {
        updateAttempted = true;
        await this.users.updateAvatarUrl(userId, url);
      } else {
        updateAttempted = true;
        await this.users.updateBannerUrl(userId, url);
      }
    } catch (error) {
      // A conexão pode cair depois do commit. Só removemos o novo arquivo
      // quando conseguimos confirmar que o banco não o referencia.
      let safeToDelete = !updateAttempted;
      if (updateAttempted) {
        try {
          const current = await this.users.findMediaUrls(userId);
          const currentUrl = kind === "avatars" ? current.avatarUrl : current.bannerUrl;
          safeToDelete = currentUrl !== url;
        } catch {
          // Sem confirmação, preservar a imagem evita quebrar um perfil que
          // talvez já aponte para ela. Um órfão eventual é mais seguro.
        }
      }
      if (safeToDelete) await deleteProfileUpload(url, kind);
      throw error;
    }

    // Troca confirmada: remove a anterior (só se for arquivo nosso).
    const oldUrl = kind === "avatars" ? previous.avatarUrl : previous.bannerUrl;
    if (oldUrl && oldUrl !== url) {
      await deleteProfileUpload(oldUrl, kind);
    }

    return { url };
  }
}
