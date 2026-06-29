import { FastifyRequest, FastifyReply } from "fastify";

/**
 * Middleware de autorização baseada em roles (RBAC).
 *
 * Verifica se o usuário autenticado possui uma das roles permitidas.
 * Deve ser usado após o middleware `authenticate`.
 *
 * Uso:
 *   fastify.get('/rota', { preHandler: [authenticate, authorize(['admin', 'teacher'])] }, handler)
 *
 * TODO: Implementar checagem de roles após configuração do RBAC no Better Auth.
 */
export function authorize(allowedRoles: string[]) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // TODO: Substituir por validação real de roles via Better Auth
    // Exemplo futuro:
    //   const user = request.user;
    //   if (!user) return reply.status(401).send({ success: false, error: 'Unauthorized' });
    //   const hasRole = allowedRoles.some(role => user.roles.includes(role));
    //   if (!hasRole) return reply.status(403).send({ success: false, error: 'Forbidden' });
  };
}
