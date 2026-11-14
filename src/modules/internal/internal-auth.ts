import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { AppError } from "../../lib/errors/AppError";

/**
 * Autenticação serviço-a-serviço para `/internal/v1/*`.
 *
 * Usada pelos servidores do Web e do Admin (nunca pelo navegador) enquanto
 * as regras de negócio migram para a API. Essas rotas agem sobre QUALQUER
 * usuário (ex.: conceder XP), então não aceitam sessão de usuário — só o
 * token compartilhado `INTERNAL_API_TOKEN`.
 *
 * - Token ausente/curto no servidor → rotas desligadas (503), nunca abertas.
 * - Comparação em tempo constante sobre o SHA-256 (tamanhos sempre iguais).
 */

export const INTERNAL_TOKEN_HEADER = "x-internal-token";
export const MIN_INTERNAL_TOKEN_LENGTH = 32;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function getInternalToken(): string | null {
  const token = process.env.INTERNAL_API_TOKEN?.trim();
  if (!token || token.length < MIN_INTERNAL_TOKEN_LENGTH) return null;
  return token;
}

export function isValidInternalToken(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string" || provided.length === 0) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

export async function requireInternalToken(request: FastifyRequest): Promise<void> {
  const expected = getInternalToken();
  if (!expected) {
    throw new AppError(503, "API interna desabilitada (INTERNAL_API_TOKEN não configurado).");
  }
  if (!isValidInternalToken(request.headers[INTERNAL_TOKEN_HEADER], expected)) {
    throw new AppError(401, "Token interno inválido.");
  }
}
