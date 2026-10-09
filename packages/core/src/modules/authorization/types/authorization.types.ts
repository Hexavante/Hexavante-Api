export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPermission {
  userId: string;
  permissionId: string;
  permission: Permission;
  grantedAt: Date;
  grantedBy: string;
}

export interface PermissionContext {
  userId: string;
  roles: string[];
  permissions: string[];
  directPermissions: string[];
}

export interface PermissionCheckResult {
  granted: boolean;
  reason: "role" | "direct" | "denied";
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}
