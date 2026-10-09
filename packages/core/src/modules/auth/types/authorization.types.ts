/**
 * Role de um usuário no sistema.
 * Roles agrupam conjuntos de permissões (ex: 'admin', 'teacher', 'student').
 */
export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Permissão granular do sistema.
 * Segue o padrão `recurso.ação` (ex: 'course.create', 'user.delete').
 */
export interface Permission {
  id: string;
  name: string; // ex: 'course.create'
  resource: string; // ex: 'course'
  action: string; // ex: 'create'
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Relação entre usuário e permissão.
 * Permite permissões concedidas diretamente ao usuário,
 * além das herdadas pelas suas roles.
 */
export interface UserPermission {
  userId: string;
  permissionId: string;
  permission: Permission;
  grantedAt: Date;
  grantedBy: string; // userId de quem concedeu
}

/**
 * Contexto de verificação de permissão.
 * Contém todas as informações necessárias para decidir
 * se um usuário pode executar uma ação.
 */
export interface PermissionContext {
  userId: string;
  roles: string[]; // nomes das roles do usuário
  permissions: string[]; // nomes das permissões (roles + diretas)
  directPermissions: string[]; // apenas permissões concedidas diretamente
}

/**
 * Resultado de uma verificação de permissão.
 */
export interface PermissionCheckResult {
  granted: boolean;
  reason: "role" | "direct" | "denied";
}
