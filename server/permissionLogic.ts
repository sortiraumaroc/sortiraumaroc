/**
 * Permission Logic — Centralized permission resolution with cache
 *
 * Resolves permissions for a given establishment + role by checking
 * the `pro_role_permissions` table, with fallback to defaults.
 * Owner always has ALL permissions (short-circuit before DB lookup).
 * 5-minute TTL cache per establishment.
 */

import { getAdminSupabase } from "./supabaseAdmin";
import {
  DEFAULT_PERMISSIONS,
  OWNER_ONLY_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  CUSTOMIZABLE_ROLES,
  type CustomizableRole,
  type PermissionKey,
  type PermissionMatrix,
} from "../shared/permissionTypes";

// =============================================================================
// In-memory cache: Map<establishmentId, { matrix, fetchedAt }>
// =============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CacheEntry = {
  matrix: PermissionMatrix;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();

/** Evict a specific establishment from cache (call after write). */
export function evictPermissionCache(establishmentId: string): void {
  cache.delete(establishmentId);
}

// =============================================================================
// Read: get the full permission matrix for an establishment
// =============================================================================

/**
 * Fetch the full permission matrix for an establishment (with cache).
 * If no custom rows exist, returns DEFAULT_PERMISSIONS.
 */
export async function getPermissionMatrix(
  establishmentId: string,
): Promise<PermissionMatrix> {
  const now = Date.now();
  const cached = cache.get(establishmentId);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.matrix;
  }

  const supabase = getAdminSupabase();
  const { data: rows, error } = await supabase
    .from("pro_role_permissions")
    .select(
      "role, manage_profile, manage_team, manage_reservations, view_billing, manage_inventory, manage_offers",
    )
    .eq("establishment_id", establishmentId);

  // Start from a deep copy of defaults
  const matrix: PermissionMatrix = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));

  if (!error && rows) {
    for (const row of rows as Array<Record<string, unknown>>) {
      const role = row.role as string;
      if (!CUSTOMIZABLE_ROLES.includes(role as CustomizableRole)) continue;

      const roleKey = role as CustomizableRole;
      for (const key of ALL_PERMISSION_KEYS) {
        if (OWNER_ONLY_PERMISSIONS.has(key)) {
          matrix[roleKey][key] = false; // Force owner-only
        } else if (typeof row[key] === "boolean") {
          matrix[roleKey][key] = row[key] as boolean;
        }
      }
    }
  }

  cache.set(establishmentId, { matrix, fetchedAt: now });
  return matrix;
}

// =============================================================================
// Check: single permission check
// =============================================================================

/**
 * Check a single permission for a given role at an establishment.
 * Owner ALWAYS returns true (short-circuit).
 */
export async function hasPermission(
  establishmentId: string,
  role: string,
  permission: PermissionKey,
): Promise<boolean> {
  // Owner always has all permissions
  if (role === "owner") return true;

  const matrix = await getPermissionMatrix(establishmentId);
  const rolePerms = matrix[role as CustomizableRole];
  if (!rolePerms) return false; // unknown role = no permissions

  return rolePerms[permission] ?? false;
}

// =============================================================================
// Write: save custom permissions for a role
// =============================================================================

/**
 * Save custom permissions for one role at an establishment.
 * Upserts a single row. Evicts cache immediately.
 */
export async function saveRolePermissions(
  establishmentId: string,
  role: CustomizableRole,
  permissions: Partial<Record<PermissionKey, boolean>>,
): Promise<void> {
  // Build safe update — never allow manage_team to be customized
  const safePerms: Record<string, unknown> = {};
  for (const key of ALL_PERMISSION_KEYS) {
    if (OWNER_ONLY_PERMISSIONS.has(key)) continue;
    if (typeof permissions[key] === "boolean") {
      safePerms[key] = permissions[key];
    }
  }

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("pro_role_permissions")
    .upsert(
      {
        establishment_id: establishmentId,
        role,
        ...safePerms,
        manage_team: false, // Force
        updated_at: new Date().toISOString(),
      },
      { onConflict: "establishment_id,role" },
    );

  if (error) {
    throw new Error(`Failed to save role permissions: ${error.message}`);
  }

  evictPermissionCache(establishmentId);
}

// =============================================================================
// Reset: delete all custom permissions for an establishment
// =============================================================================

/**
 * Reset all permissions for an establishment to defaults.
 * Deletes all rows for that establishment. Evicts cache.
 */
export async function resetPermissionsToDefaults(
  establishmentId: string,
): Promise<void> {
  const supabase = getAdminSupabase();
  await supabase
    .from("pro_role_permissions")
    .delete()
    .eq("establishment_id", establishmentId);

  evictPermissionCache(establishmentId);
}
