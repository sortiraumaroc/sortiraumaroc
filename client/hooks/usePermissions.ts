/**
 * usePermissions — Centralized permission check hook for Pro dashboard
 *
 * Fetches the permission matrix for the current establishment from the API.
 * Returns a `can(permission)` function that checks permissions for the current role.
 * Owner ALWAYS returns true for all permissions.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import type { ProRole } from "@/lib/pro/types";
import { getEstablishmentPermissions } from "@/lib/pro/api";
import {
  DEFAULT_PERMISSIONS,
  type PermissionKey,
  type PermissionMatrix,
  type CustomizableRole,
} from "../../shared/permissionTypes";

type UsePermissionsReturn = {
  /** Check if current role has a specific permission */
  can: (permission: PermissionKey) => boolean;
  /** Full matrix (for owner editing UI) */
  matrix: PermissionMatrix;
  /** Loading state */
  loading: boolean;
  /** Refetch permissions (after save) */
  refetch: () => void;
};

export function usePermissions(
  establishmentId: string | null,
  role: ProRole | null,
): UsePermissionsReturn {
  const [matrix, setMatrix] = useState<PermissionMatrix>(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!establishmentId || !role) return;

    let cancelled = false;
    setLoading(true);

    getEstablishmentPermissions(establishmentId)
      .then((m) => {
        if (!cancelled) setMatrix(m);
      })
      .catch(() => {
        // Fallback to defaults on error
        if (!cancelled) setMatrix(DEFAULT_PERMISSIONS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [establishmentId, role, version]);

  const can = useMemo(() => {
    return (permission: PermissionKey): boolean => {
      if (!role) return false;
      if (role === "owner") return true;
      const rolePerms = matrix[role as CustomizableRole];
      if (!rolePerms) return false;
      return rolePerms[permission] ?? false;
    };
  }, [role, matrix]);

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  return { can, matrix, loading, refetch };
}
