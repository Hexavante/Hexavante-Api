import { prisma } from "../../../config/prisma";
import type {
  Role,
  Permission,
  PermissionContext,
} from "../types/authorization.types";

const roleSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

const permissionSelect = {
  id: true,
  name: true,
  resource: true,
  action: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface IAuthorizationRepository {
  findRoleById(id: string): Promise<Role | null>;
  findRoleByName(name: string): Promise<Role | null>;
  findAllRoles(): Promise<Role[]>;
  createRole(data: { name: string; description?: string }): Promise<Role>;

  findPermissionById(id: string): Promise<Permission | null>;
  findPermissionByName(name: string): Promise<Permission | null>;
  findAllPermissions(): Promise<Permission[]>;
  createPermission(data: {
    name: string;
    resource: string;
    action: string;
    description?: string;
  }): Promise<Permission>;

  findRolesByUserId(userId: string): Promise<string[]>;
  findPermissionsByUserId(userId: string): Promise<string[]>;
  buildPermissionContext(userId: string): Promise<PermissionContext | null>;
  assignRoleToUser(
    userId: string,
    roleId: string,
    assignedBy?: string,
  ): Promise<void>;
  assignPermissionToRole(
    roleId: string,
    permissionId: string,
  ): Promise<void>;
}

export class AuthorizationRepository implements IAuthorizationRepository {
  async findRoleById(id: string): Promise<Role | null> {
    const role = await prisma.role.findUnique({
      where: { id },
      select: roleSelect,
    });
    if (!role) return null;
    return { ...role, permissions: [] };
  }

  async findRoleByName(name: string): Promise<Role | null> {
    const role = await prisma.role.findUnique({
      where: { name },
      select: roleSelect,
    });
    if (!role) return null;
    return { ...role, permissions: [] };
  }

  async findAllRoles(): Promise<Role[]> {
    const roles = await prisma.role.findMany({
      select: roleSelect,
      orderBy: { name: "asc" },
    });
    return roles.map((r) => ({ ...r, permissions: [] }));
  }

  async createRole(data: {
    name: string;
    description?: string;
  }): Promise<Role> {
    const role = await prisma.role.create({
      data,
      select: roleSelect,
    });
    return { ...role, permissions: [] };
  }

  async findPermissionById(id: string): Promise<Permission | null> {
    return prisma.permission.findUnique({
      where: { id },
      select: permissionSelect,
    });
  }

  async findPermissionByName(name: string): Promise<Permission | null> {
    return prisma.permission.findUnique({
      where: { name },
      select: permissionSelect,
    });
  }

  async findAllPermissions(): Promise<Permission[]> {
    return prisma.permission.findMany({
      select: permissionSelect,
      orderBy: { name: "asc" },
    });
  }

  async createPermission(data: {
    name: string;
    resource: string;
    action: string;
    description?: string;
  }): Promise<Permission> {
    return prisma.permission.create({
      data,
      select: permissionSelect,
    });
  }

  async findRolesByUserId(userId: string): Promise<string[]> {
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: { role: { select: { name: true } } },
    });
    return userRoles.map((ur) => ur.role.name);
  }

  async findPermissionsByUserId(userId: string): Promise<string[]> {
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: { select: { name: true } } },
            },
          },
        },
      },
    });

    const permissionSet = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.permissions) {
        permissionSet.add(rp.permission.name);
      }
    }
    return Array.from(permissionSet).sort();
  }

  async buildPermissionContext(
    userId: string,
  ): Promise<PermissionContext | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) return null;

    const [roles, permissions] = await Promise.all([
      this.findRolesByUserId(userId),
      this.findPermissionsByUserId(userId),
    ]);

    return {
      userId,
      roles,
      permissions,
      directPermissions: [],
    };
  }

  async assignRoleToUser(
    userId: string,
    roleId: string,
    assignedBy?: string,
  ): Promise<void> {
    await prisma.userRole.create({
      data: { userId, roleId, assignedBy },
    });
  }

  async assignPermissionToRole(
    roleId: string,
    permissionId: string,
  ): Promise<void> {
    await prisma.rolePermission.create({
      data: { roleId, permissionId },
    });
  }
}
