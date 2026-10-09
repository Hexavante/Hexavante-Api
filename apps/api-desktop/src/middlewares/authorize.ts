import { FastifyRequest, FastifyReply } from "fastify";
import { ForbiddenError, UnauthorizedError } from "../lib/errors/AppError";
import { prisma } from "../config/prisma";

export function authorize(allowedRoles: string[]) {
  return async function (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError("Usuário não autenticado");
    }

    const userRoles = await prisma.userRole.findMany({
      where: { userId: request.user.id },
      select: { role: { select: { name: true } } },
    });

    const roleNames = userRoles.map((ur) => ur.role.name);
    const hasRole = allowedRoles.some((role) => roleNames.includes(role));

    if (!hasRole) {
      throw new ForbiddenError("Você não tem permissão para acessar este recurso");
    }
  };
}
