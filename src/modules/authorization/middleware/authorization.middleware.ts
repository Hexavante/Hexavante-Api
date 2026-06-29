import { FastifyRequest, FastifyReply } from "fastify";
import { AuthorizationService } from "../service/authorization.service";
import { ForbiddenError } from "../../../lib/errors/AppError";

export function permission(name: string) {
  return async (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> => {
    const user = request.user;
    if (!user?.id) {
      throw new ForbiddenError("Usuário não autenticado");
    }

    const service: AuthorizationService = (request as any).authorizationService;
    if (!service) {
      throw new Error(
        "AuthorizationService não registrado. Registre o authorizationRoutes primeiro.",
      );
    }

    const result = await service.hasPermission(user.id, name);
    if (!result.granted) {
      throw new ForbiddenError(`Permissão necessária: ${name}`);
    }
  };
}
