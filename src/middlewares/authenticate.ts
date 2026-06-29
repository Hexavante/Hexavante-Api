import { FastifyRequest, FastifyReply } from "fastify";

/**
 * Middleware de autenticação obrigatória.
 *
 * Verifica se a requisição possui uma sessão válida via Better Auth.
 * Deve ser usado em rotas que exigem usuário autenticado.
 *
 * Uso:
 *   fastify.get('/rota', { preHandler: authenticate }, handler)
 *
 * TODO: Implementar validação de sessão com Better Auth após configuração.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // TODO: Substituir por validação real do Better Auth
  // Exemplo futuro:
  //   const session = await auth.api.getSession({ headers: request.headers });
  //   if (!session) return reply.status(401).send({ success: false, error: 'Unauthorized' });
  //   request.user = session.user;
}
