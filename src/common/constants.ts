export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';
export const TENANT_REQUIRED_KEY = 'tenantRequired';
export const LAST_LOGOUT_PREFIX = 'lastLogoutAt:';
export const TENANT_DEACTIVATED_PREFIX = 'tenantDeactivatedAt:';
export const TENANT_SLUG_CACHE_PREFIX = 'tenantSlug:';

export const SYSTEM_ADMIN_ROLE = 'system_admin';
export const BUILT_IN_ROLE_CODES = ['system_admin', 'admin', 'member', 'viewer'] as const;
export type BuiltInRoleCode = (typeof BUILT_IN_ROLE_CODES)[number];
export const ACCESS_CACHE_PREFIX = 'auth:access:';

export const PermissionCode = {
  UserRead: 'user.read',
  UserCreate: 'user.create',
  UserUpdate: 'user.update',
  UserDelete: 'user.delete',
  UserAssignRoles: 'user.assign_roles',
  RoleRead: 'role.read',
  RoleCreate: 'role.create',
  RoleUpdate: 'role.update',
  RoleDelete: 'role.delete',
  RoleAssignPermissions: 'role.assign_permissions',
  PermissionRead: 'permission.read',
  PermissionCreate: 'permission.create',
  PermissionUpdate: 'permission.update',
  PermissionDelete: 'permission.delete',
  TenantRead: 'tenant.read',
  TenantCreate: 'tenant.create',
  TenantUpdate: 'tenant.update',
  TenantDelete: 'tenant.delete',
  DeadLetterRetry: 'dead_letter.retry',
} as const;

export type PermissionCodeValue = (typeof PermissionCode)[keyof typeof PermissionCode];

export const BUILT_IN_PERMISSIONS: ReadonlyArray<{ code: PermissionCodeValue; name: string }> = [
  { code: PermissionCode.UserRead, name: '查看用户' },
  { code: PermissionCode.UserCreate, name: '创建用户' },
  { code: PermissionCode.UserUpdate, name: '更新用户' },
  { code: PermissionCode.UserDelete, name: '删除用户' },
  { code: PermissionCode.UserAssignRoles, name: '分配用户角色' },
  { code: PermissionCode.RoleRead, name: '查看角色' },
  { code: PermissionCode.RoleCreate, name: '创建角色' },
  { code: PermissionCode.RoleUpdate, name: '更新角色' },
  { code: PermissionCode.RoleDelete, name: '删除角色' },
  { code: PermissionCode.RoleAssignPermissions, name: '配置角色权限' },
  { code: PermissionCode.PermissionRead, name: '查看权限字典' },
  { code: PermissionCode.PermissionCreate, name: '创建权限' },
  { code: PermissionCode.PermissionUpdate, name: '更新权限' },
  { code: PermissionCode.PermissionDelete, name: '删除权限' },
  { code: PermissionCode.TenantRead, name: '查看租户' },
  { code: PermissionCode.TenantCreate, name: '创建租户' },
  { code: PermissionCode.TenantUpdate, name: '更新租户' },
  { code: PermissionCode.TenantDelete, name: '删除租户' },
  { code: PermissionCode.DeadLetterRetry, name: '重试死信消息' },
];

export const TENANT_ADMIN_PERMISSIONS: readonly PermissionCodeValue[] = [
  PermissionCode.UserRead,
  PermissionCode.UserCreate,
  PermissionCode.UserUpdate,
  PermissionCode.UserDelete,
  PermissionCode.UserAssignRoles,
  PermissionCode.RoleRead,
  PermissionCode.RoleCreate,
  PermissionCode.RoleUpdate,
  PermissionCode.RoleDelete,
  PermissionCode.RoleAssignPermissions,
  PermissionCode.PermissionRead,
];

export const PLATFORM_PERMISSION_CODES: readonly PermissionCodeValue[] = [
  PermissionCode.PermissionCreate,
  PermissionCode.PermissionUpdate,
  PermissionCode.PermissionDelete,
  PermissionCode.TenantRead,
  PermissionCode.TenantCreate,
  PermissionCode.TenantUpdate,
  PermissionCode.TenantDelete,
];
