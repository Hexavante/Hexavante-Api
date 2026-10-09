/**
 * Validação centralizada de variáveis de ambiente sensíveis.
 *
 * Regra: em produção (`NODE_ENV=production`) segredos ausentes ou fracos
 * recusam o startup com erro explícito — nunca há fallback previsível.
 * Fora de produção, valores de ambiente são respeitados quando definidos;
 * o fallback é uma constante explicitamente insegura, usada só em dev/teste.
 */

export const MIN_AUTH_SECRET_LENGTH = 32;

const DEV_ONLY_INSECURE_SECRET = "dev-only-insecure-secret";

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Retorna o `AUTH_SECRET` válido para assinar cookies/sessões.
 * Em produção, lança se ausente ou com menos de 32 caracteres.
 */
export function requireAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (isProduction()) {
    if (!secret || secret.length < MIN_AUTH_SECRET_LENGTH) {
      throw new Error(
        `AUTH_SECRET ausente ou inválido: em produção defina AUTH_SECRET com ao menos ` +
          `${MIN_AUTH_SECRET_LENGTH} caracteres (ex.: openssl rand -base64 32). ` +
          `Nenhum valor padrão é usado em produção.`,
      );
    }
    return secret;
  }
  return secret || DEV_ONLY_INSECURE_SECRET;
}

export interface DocsAuthConfig {
  enabled: boolean;
  user: string | null;
  pass: string | null;
}

/**
 * P1-2: decide exposição do Swagger (`/docs`) sem nenhuma credencial padrão.
 * - Produção: `/docs` só existe quando `SWAGGER_USER` e `SWAGGER_PASS`
 *   estão definidos; sem eles, o registro nem acontece (404).
 * - Dev/teste: `/docs` existe sempre; com credenciais, exige basic auth;
 *   sem credenciais, fica aberto (ambiente local).
 */
export function resolveDocsAuth(): DocsAuthConfig {
  const user = process.env.SWAGGER_USER?.trim() || null;
  const pass = process.env.SWAGGER_PASS || null;
  if (isProduction()) {
    if (!user || !pass) return { enabled: false, user: null, pass: null };
    return { enabled: true, user, pass };
  }
  return { enabled: true, user, pass };
}
