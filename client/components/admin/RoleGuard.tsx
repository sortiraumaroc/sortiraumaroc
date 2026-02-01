import type { ReactNode } from "react";

import type { AdminAction, AdminModule, AdminRole } from "@/lib/admin/permissions";
import { hasPermission } from "@/lib/admin/permissions";

export function RoleGuard(props: {
  role: AdminRole | null | undefined;
  module: AdminModule;
  action: AdminAction;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  if (hasPermission(props.role, props.module, props.action)) return <>{props.children}</>;
  return <>{props.fallback ?? null}</>;
}
