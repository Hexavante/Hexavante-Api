import type { IAuthorizationRepository } from "../repository/authorization.repository";
import type {
  PermissionContext,
  PermissionCheckResult,
  Role,
  Permission,
} from "../types/authorization.types";
import {
  PermissionCache,
  RoleCache,
} from "../../../lib/cache";

export class AuthorizationService {
  constructor(
    private readonly repository: IAuthorizationRepository,
    private readonly permissionCache: PermissionCache = new PermissionCache(),
    private readonly roleCache: RoleCache = new RoleCache(),
  ) {}

  async getPermissionContext(userId: string): Promise<PermissionContext | null> {
    const [cachedRoles, cachedPermissions] = await Promise.all([
      this.roleCache.get(userId),
      this.permissionCache.get(userId),
    ]);

    if (cachedRoles && cachedPermissions) {
      return {
        userId,
        roles: cachedRoles,
        permissions: cachedPermissions,
        directPermissions: [],
      };
    }

    const context = await this.repository.buildPermissionContext(userId);
    if (!context) return null;

    await Promise.all([
      this.roleCache.set(userId, context.roles),
      this.permissionCache.set(userId, context.permissions),
    ]);

    return context;
  }

  async hasPermission(
    userId: string,
    permissionName: string,
  ): Promise<PermissionCheckResult> {
    const context = await this.getPermissionContext(userId);
    if (!context) {
      return { granted: false, reason: "denied" };
    }

    if (context.permissions.includes(permissionName)) {
      return { granted: true, reason: "role" };
    }

    return { granted: false, reason: "denied" };
  }

  async hasRole(userId: string, roleName: string): Promise<boolean> {
    const context = await this.getPermissionContext(userId);
    if (!context) return false;
    return context.roles.includes(roleName);
  }

  async hasAnyRole(userId: string, roleNames: string[]): Promise<boolean> {
    const context = await this.getPermissionContext(userId);
    if (!context) return false;
    return roleNames.some((role) => context.roles.includes(role));
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const context = await this.getPermissionContext(userId);
    return context?.permissions ?? [];
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await Promise.all([
      this.permissionCache.invalidate(userId),
      this.roleCache.invalidate(userId),
    ]);
  }

  async assignRoleToUser(
    userId: string,
    roleId: string,
    assignedBy?: string,
  ): Promise<void> {
    await this.repository.assignRoleToUser(userId, roleId, assignedBy);
    await this.invalidateUserCache(userId);
  }

  async createRole(data: {
    name: string;
    description?: string;
  }): Promise<Role> {
    return this.repository.createRole(data);
  }

  async findRoleByName(name: string): Promise<Role | null> {
    return this.repository.findRoleByName(name);
  }

  async findAllRoles(): Promise<Role[]> {
    return this.repository.findAllRoles();
  }

  async createPermission(data: {
    name: string;
    resource: string;
    action: string;
    description?: string;
  }): Promise<Permission> {
    return this.repository.createPermission(data);
  }

  async findAllPermissions(): Promise<Permission[]> {
    return this.repository.findAllPermissions();
  }

  async assignPermissionToRole(
    roleId: string,
    permissionId: string,
  ): Promise<void> {
    await this.repository.assignPermissionToRole(roleId, permissionId);
  }
}
