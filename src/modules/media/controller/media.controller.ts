import { FastifyRequest, FastifyReply } from "fastify";
import { MediaService } from "../service/media.service";
import { BadRequestError } from "../../../lib/errors/AppError";
import { AVATAR_MAX_BYTES, BANNER_MAX_BYTES } from "../../../lib/uploads";
import { asyncHandler } from "../../../lib/errors/errorHandler";

/**
 * Upload de mídia de perfil. O `userId` vem exclusivamente da sessão
 * autenticada (`request.user`) — nunca do body/query/FormData.
 * O único campo multipart aceito é `file` (parser: 1 arquivo, 0 fields).
 */
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  updateAvatar = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const buffer = await this.readSingleFile(request, AVATAR_MAX_BYTES, "5MB");
    const result = await this.mediaService.updateAvatar(request.user!.id, buffer);
    reply.send(result);
  });

  updateBanner = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const buffer = await this.readSingleFile(request, BANNER_MAX_BYTES, "8MB");
    const result = await this.mediaService.updateBanner(request.user!.id, buffer);
    reply.send(result);
  });

  private async readSingleFile(
    request: FastifyRequest,
    maxBytes: number,
    maxLabel: string,
  ): Promise<Buffer> {
    // Limites no próprio parser: o busboy interrompe o stream ao atingir
    // fileSize (nada é carregado integralmente antes da rejeição) e o
    // plugin lança erros codificados (FST_REQ_FILE_TOO_LARGE, FST_FILES_LIMIT,
    // FST_FIELDS_LIMIT) — mapeados aqui para 400 pt-BR em vez de 500/413 cru.
    //
    // Consome TODOS os arquivos (não só o primeiro): o 2º arquivo/campo
    // estoura o limite `files: 1, fields: 0` ainda na iteração e cai no 400.
    // Cada stream é consumido/drenado antes de avançar (sem isso o parser
    // trava por backpressure e a request suspende).
    try {
      const buffers: Buffer[] = [];
      const files = request.files({
        limits: { fileSize: maxBytes, files: 1, fields: 0 },
      });
      for await (const file of files) {
        if (file.fieldname !== "file") {
          file.file.resume();
          throw new BadRequestError('O campo do arquivo deve se chamar "file".');
        }
        if (buffers.length === 0) {
          buffers.push(await file.toBuffer());
          if (file.file.truncated) {
            throw new BadRequestError(`A imagem deve ter no máximo ${maxLabel}.`);
          }
        } else {
          file.file.resume();
        }
      }
      if (buffers.length !== 1) {
        throw new BadRequestError(
          buffers.length === 0
            ? "Selecione uma imagem válida."
            : "Envie exatamente um arquivo de imagem.",
        );
      }
      return buffers[0] as Buffer;
    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      const code = (error as { code?: string })?.code || "";
      if (code === "FST_REQ_FILE_TOO_LARGE") {
        throw new BadRequestError(`A imagem deve ter no máximo ${maxLabel}.`);
      }
      if (
        code === "FST_FILES_LIMIT" ||
        code === "FST_FIELDS_LIMIT" ||
        code === "FST_PARTS_LIMIT"
      ) {
        throw new BadRequestError("Envie exatamente um arquivo de imagem.");
      }
      throw error;
    }
  }
}
