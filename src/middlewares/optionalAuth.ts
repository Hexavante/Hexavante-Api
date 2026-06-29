import { FastifyRequest, FastifyReply } from "fastify";

/**
 * Middleware de autenticação opcional.
 *
 * Tenta recuperar a sessão do usuário, mas não bloqueia a requisição
 * caso não haja sessão válida. O handler receberá `request.user` como
 * undefined se o usuário não estiver autenticado.
 *
 * Usado em rotas públicas que se comportam diferente para usuários
 * autenticados (ex: rankings, perfis públicos, preview de cursos).
 *
 * Uso:
 *   fastify.get('/rota', { preHandler: optionalAuth }, handler)
 *
 * TODO: Implementar tentativa de leitura de sessão com Better Auth após configuração.
 */
export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // TODO: Substituir por tentativa real de leitura de sessão via Better Auth
  // Exemplo futuro:
  //   try {
  //     const session = await auth.api.getSession({ headers: request.headers });
  //     if (session) request.user = session.user;
  //   } catch {
  //     // Sem sessão — continua sem bloquear
  //   }
}
