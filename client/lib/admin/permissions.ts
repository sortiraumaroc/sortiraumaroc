export const ADMIN_MODULES = [
  "dashboard",
  "users",
  "pros",
  "establishments",
  "reservations",
  "payments",
  "reviews",
  "deals",
  "support",
  "content",
  "settings",
  "collaborators",
  "roles",
  "logs",
  "finance",
] as const;

export type AdminModule = (typeof ADMIN_MODULES)[number];

export const ADMIN_ACTIONS = ["read", "write", "delete", "approve", "export", "bulk"] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export type AdminPermissionKey = `${AdminModule}.${AdminAction}`;

export type AdminRole = {
  id: string;
  name: string;
  permissions: Partial<Record<AdminModule, Partial<Record<AdminAction, boolean>>>>;
};

export type AdminCollaborator = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  function?: string | null;
  joinedAt?: string | null;
  avatarUrl?: string | null;
  status: "active" | "suspended";
  roleId: string;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type AdminCollaboratorFormData = {
  email: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  function?: string;
  joinedAt?: string;
  avatarUrl?: string;
  roleId: string;
  password?: string;
};

export function hasPermission(role: AdminRole | null | undefined, module: AdminModule, action: AdminAction): boolean {
  if (!role) return false;
  return role.permissions?.[module]?.[action] === true;
}

export function roleAllowsAny(role: AdminRole | null | undefined, module: AdminModule, actions: AdminAction[]): boolean {
  if (!role) return false;
  return actions.some((a) => hasPermission(role, module, a));
}

export function makeSuperadminRole(): AdminRole {
  const permissions: AdminRole["permissions"] = {};
  for (const m of ADMIN_MODULES) {
    permissions[m] = {
      read: true,
      write: true,
      delete: true,
      approve: true,
      export: true,
      bulk: true,
    };
  }
  return { id: "superadmin", name: "Super-administrateur", permissions };
}
