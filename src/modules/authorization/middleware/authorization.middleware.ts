import { FastifyRequest, FastifyReply } from "fastify";
import { AuthorizationService } from "../service/authorization.service";
import { AuthorizationRepository } from "../repository/authorization.repository";
import { ForbiddenError, UnauthorizedError } from "../../../lib/errors/AppError";

// O hook onRequest do authorizationRoutes anexa o serviço à requisição,
// mas ele só alcança as rotas do próprio plugin (encapsulamento do Fastify).
// Rotas de outros módulos (cursos, moderação) usam esta instância
// compartilhada — mesmos caches, sem acoplamento entre plugins.
let sharedService: AuthorizationService | null = null;

function getService(request: FastifyRequest): AuthorizationService {
  const attached = (request as any).authorizationService as
    | AuthorizationService
    | undefined;
  if (attached) return attached;
  if (!sharedService) {
    sharedService = new AuthorizationService(new AuthorizationRepository());
  }
  return sharedService;
}

export function permission(name: string) {
  return async (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> => {
    const user = request.user;
    if (!user?.id) {
      throw new UnauthorizedError("Usuário não autenticado");
    }

    const service = getService(request);
    const result = await service.hasPermission(user.id, name);
    if (!result.granted) {
      throw new ForbiddenError(`Permissão necessária: ${name}`);
    }
  };
}
