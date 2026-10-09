import { FastifyRequest, FastifyReply } from "fastify";
import { AuthorizationService } from "../service/authorization.service";
import {
  permissionSchema,
  roleSchema,
} from "../schemas/authorization.schemas";
import { validateBody } from "../../../lib/validation/validate";
import {
  NotFoundError,
  ConflictError,
} from "../../../lib/errors/AppError";

export class AuthorizationController {
  constructor(
    private readonly authorizationService: AuthorizationService,
  ) {}

  async getContext(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    const context = await this.authorizationService.getPermissionContext(userId);
    if (!context) {
      throw new NotFoundError("Usuário não encontrado");
    }

    reply.send(context);
  }

  async checkPermission(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { permission: permissionName } = request.params as {
      permission: string;
    };
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    const result = await this.authorizationService.hasPermission(
      userId,
      permissionName,
    );
    reply.send(result);
  }

  async getUserPermissions(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    const permissions = await this.authorizationService.getUserPermissions(
      userId,
    );
    reply.send({ permissions });
  }

  async createPermission(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    await validateBody(permissionSchema)(request, reply);
    const body = request.body as {
      name: string;
      resource: string;
      action: string;
      description?: string;
    };

    const permission = await this.authorizationService.createPermission(body);

    reply.status(201).send({ permission });
  }

  async createRole(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    await validateBody(roleSchema)(request, reply);
    const body = request.body as {
      name: string;
      description?: string;
      permissionIds?: string[];
    };

    const existing = await this.authorizationService.findRoleByName(body.name);
    if (existing) {
      throw new ConflictError("Esta role já existe");
    }

    const role = await this.authorizationService.createRole({
      name: body.name,
      description: body.description,
    });

    if (body.permissionIds?.length) {
      for (const permissionId of body.permissionIds) {
        await this.authorizationService.assignPermissionToRole(
          role.id,
          permissionId,
        );
      }
    }

    reply.status(201).send({ role });
  }

  async listPermissions(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const permissions = await this.authorizationService.findAllPermissions();
    reply.send({ permissions });
  }

  async listRoles(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const roles = await this.authorizationService.findAllRoles();
    reply.send({ roles });
  }
}
