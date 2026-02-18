/**
 * Module Activation Logic (Phase 3.9)
 *
 * Controls platform-wide and per-establishment feature toggles.
 *
 * Rules:
 *  - Admin can activate/deactivate modules globally (entire platform)
 *  - Admin can activate/deactivate modules for a specific establishment
 *  - When globally disabled: module disappears everywhere (pro dashboard, fiches, homepage)
 *  - Already-purchased Packs remain valid & consumable even when module is disabled
 *  - Per-establishment toggle only affects that establishment
 *  - Same mechanism for all modules: packs, advertising, visibility, digital_menu, booking_link, loyalty
 *
 * Checking order:
 *  1. Is module globally active? If not → disabled.
 *  2. Is module active for this specific establishment? If not → disabled.
 *  3. Otherwise → enabled.
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { emitAdminNotification } from "./adminNotifications";
import type { PlatformModule } from "../shared/packsBillingTypes";

// =============================================================================
// Types
// =============================================================================

type OpResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; errorCode?: string };

export interface ModuleStatus {
  module: PlatformModule;
  globallyActive: boolean;
  /** Only set if checking for a specific establishment */
  establishmentActive?: boolean;
  /** Final computed result: enabled only if both global + establishment active */
  effectivelyEnabled: boolean;
}

export interface GlobalModuleInfo {
  module: PlatformModule;
  isGloballyActive: boolean;
  activatedAt: string | null;
  deactivatedAt: string | null;
  updatedBy: string | null;
}

export interface EstablishmentModuleInfo {
  module: PlatformModule;
  establishmentId: string;
  isActive: boolean;
  activatedAt: string | null;
  deactivatedAt: string | null;
  updatedBy: string | null;
}

// All available modules
export const ALL_PLATFORM_MODULES: PlatformModule[] = [
  "packs",
  "advertising",
  "visibility",
  "digital_menu",
  "booking_link",
  "loyalty",
];

// =============================================================================
// 1. Check module status
// =============================================================================

/**
 * Check if a module is enabled globally.
 */
export async function isModuleGloballyActive(
  module: PlatformModule,
): Promise<boolean> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("module_activations")
    .select("is_globally_active")
    .eq("module", module)
    .maybeSingle();

  if (error || !data) return false;

  return (data as any).is_globally_active === true;
}

/**
 * Check if a module is enabled for a specific establishment.
 * Returns the effective status considering both global and per-establishment toggles.
 */
export async function getModuleStatus(
  module: PlatformModule,
  establishmentId?: string,
): Promise<ModuleStatus> {
  const supabase = getAdminSupabase();

  // 1. Check global toggle
  const { data: globalRow } = await supabase
    .from("module_activations")
    .select("is_globally_active")
    .eq("module", module)
    .maybeSingle();

  const globallyActive = (globalRow as any)?.is_globally_active === true;

  if (!establishmentId) {
    return {
      module,
      globallyActive,
      effectivelyEnabled: globallyActive,
    };
  }

  // 2. Check per-establishment toggle
  const { data: estRow } = await supabase
    .from("establishment_module_activations")
    .select("is_active")
    .eq("establishment_id", establishmentId)
    .eq("module", module)
    .maybeSingle();

  // If no row exists for establishment, it defaults to active (opt-out model)
  const establishmentActive = estRow ? (estRow as any).is_active === true : true;

  return {
    module,
    globallyActive,
    establishmentActive,
    // Module is effectively enabled only if BOTH global AND establishment are active
    effectivelyEnabled: globallyActive && establishmentActive,
  };
}

/**
 * Check multiple modules at once for an establishment.
 * Useful for dashboards / API to know which tabs to show.
 */
export async function getAllModuleStatuses(
  establishmentId?: string,
): Promise<ModuleStatus[]> {
  const supabase = getAdminSupabase();

  // Fetch all global toggles
  const { data: globalRows } = await supabase
    .from("module_activations")
    .select("module, is_globally_active");

  const globalMap = new Map<string, boolean>();
  if (globalRows) {
    for (const row of globalRows as any[]) {
      globalMap.set(row.module, row.is_globally_active === true);
    }
  }

  // If checking for a specific establishment, fetch its toggles
  const estMap = new Map<string, boolean>();
  if (establishmentId) {
    const { data: estRows } = await supabase
      .from("establishment_module_activations")
      .select("module, is_active")
      .eq("establishment_id", establishmentId);

    if (estRows) {
      for (const row of estRows as any[]) {
        estMap.set(row.module, row.is_active === true);
      }
    }
  }

  return ALL_PLATFORM_MODULES.map((mod) => {
    const globallyActive = globalMap.get(mod) ?? false;
    const establishmentActive = establishmentId
      ? estMap.has(mod)
        ? estMap.get(mod)!
        : true // default active if no row
      : undefined;

    return {
      module: mod,
      globallyActive,
      ...(establishmentId !== undefined ? { establishmentActive } : {}),
      effectivelyEnabled:
        globallyActive && (establishmentActive === undefined || establishmentActive),
    };
  });
}

// =============================================================================
// 2. Toggle global module (admin only)
// =============================================================================

/**
 * Activate or deactivate a module globally.
 * When deactivated, the module disappears across the entire platform.
 * Already-sold Packs remain valid and consumable.
 */
export async function toggleGlobalModule(
  module: PlatformModule,
  activate: boolean,
  adminUserId: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  // Upsert (in case the row was deleted or never seeded)
  const { error } = await supabase
    .from("module_activations")
    .upsert(
      {
        module,
        is_globally_active: activate,
        activated_at: activate ? now : null,
        deactivated_at: activate ? null : now,
        updated_by: adminUserId,
        updated_at: now,
      },
      { onConflict: "module" },
    );

  if (error) return { ok: false, error: error.message };

  // Admin notification
  const action = activate ? "active" : "desactive";
  void (async () => {
    try {
      await emitAdminNotification({
        type: "module_toggle",
        title: `Module "${module}" ${action} globalement`,
        body: `Le module "${module}" a ete ${action} sur toute la plateforme par un administrateur.`,
        data: { module, activate, admin_user_id: adminUserId },
      });
    } catch { /* best-effort */ }
  })();

  console.log(`[ModuleActivation] Global: ${module} → ${activate ? "ON" : "OFF"} by ${adminUserId}`);

  return { ok: true, data: undefined };
}

// =============================================================================
// 3. Toggle per-establishment module (admin only)
// =============================================================================

/**
 * Activate or deactivate a module for a specific establishment.
 * Only effective if the module is globally active.
 */
export async function toggleEstablishmentModule(
  module: PlatformModule,
  establishmentId: string,
  activate: boolean,
  adminUserId: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  // Check global status first
  const globallyActive = await isModuleGloballyActive(module);
  if (!globallyActive && activate) {
    return {
      ok: false,
      error: `Le module "${module}" est desactive globalement. Activez-le d'abord au niveau global.`,
      errorCode: "globally_disabled",
    };
  }

  // Upsert for establishment
  const { error } = await supabase
    .from("establishment_module_activations")
    .upsert(
      {
        establishment_id: establishmentId,
        module,
        is_active: activate,
        activated_at: activate ? now : null,
        deactivated_at: activate ? null : now,
        updated_by: adminUserId,
        updated_at: now,
      },
      { onConflict: "establishment_id,module" },
    );

  if (error) return { ok: false, error: error.message };

  console.log(
    `[ModuleActivation] Establishment ${establishmentId}: ${module} → ${activate ? "ON" : "OFF"} by ${adminUserId}`,
  );

  return { ok: true, data: undefined };
}

// =============================================================================
// 4. Bulk operations (admin)
// =============================================================================

/**
 * Deactivate ALL modules for an establishment (e.g., when establishment is deactivated).
 */
export async function deactivateAllModulesForEstablishment(
  establishmentId: string,
  adminUserId: string,
): Promise<OpResult<number>> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  let deactivated = 0;

  for (const mod of ALL_PLATFORM_MODULES) {
    const { error } = await supabase
      .from("establishment_module_activations")
      .upsert(
        {
          establishment_id: establishmentId,
          module: mod,
          is_active: false,
          deactivated_at: now,
          activated_at: null,
          updated_by: adminUserId,
          updated_at: now,
        },
        { onConflict: "establishment_id,module" },
      );

    if (!error) deactivated++;
  }

  console.log(
    `[ModuleActivation] Bulk deactivate for ${establishmentId}: ${deactivated}/${ALL_PLATFORM_MODULES.length} modules`,
  );

  return { ok: true, data: deactivated };
}

/**
 * Reactivate ALL modules for an establishment (e.g., when establishment is reactivated).
 * Only activates modules that are globally active.
 */
export async function reactivateAllModulesForEstablishment(
  establishmentId: string,
  adminUserId: string,
): Promise<OpResult<number>> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  // Fetch global states
  const { data: globalRows } = await supabase
    .from("module_activations")
    .select("module, is_globally_active");

  const globalMap = new Map<string, boolean>();
  if (globalRows) {
    for (const row of globalRows as any[]) {
      globalMap.set(row.module, row.is_globally_active === true);
    }
  }

  let reactivated = 0;

  for (const mod of ALL_PLATFORM_MODULES) {
    const isGlobal = globalMap.get(mod) ?? false;
    if (!isGlobal) continue; // Skip globally disabled modules

    const { error } = await supabase
      .from("establishment_module_activations")
      .upsert(
        {
          establishment_id: establishmentId,
          module: mod,
          is_active: true,
          activated_at: now,
          deactivated_at: null,
          updated_by: adminUserId,
          updated_at: now,
        },
        { onConflict: "establishment_id,module" },
      );

    if (!error) reactivated++;
  }

  console.log(
    `[ModuleActivation] Bulk reactivate for ${establishmentId}: ${reactivated} modules`,
  );

  return { ok: true, data: reactivated };
}

// =============================================================================
// 5. Admin dashboard helpers
// =============================================================================

/**
 * Get all global module statuses (for admin dashboard).
 */
export async function getGlobalModuleInfos(): Promise<GlobalModuleInfo[]> {
  const supabase = getAdminSupabase();

  const { data: rows } = await supabase
    .from("module_activations")
    .select("module, is_globally_active, activated_at, deactivated_at, updated_by")
    .order("module");

  if (!rows) return [];

  return (rows as any[]).map((r) => ({
    module: r.module as PlatformModule,
    isGloballyActive: r.is_globally_active,
    activatedAt: r.activated_at,
    deactivatedAt: r.deactivated_at,
    updatedBy: r.updated_by,
  }));
}

/**
 * Get module statuses for a specific establishment (for admin / pro dashboard).
 */
export async function getEstablishmentModuleInfos(
  establishmentId: string,
): Promise<EstablishmentModuleInfo[]> {
  const supabase = getAdminSupabase();

  const { data: rows } = await supabase
    .from("establishment_module_activations")
    .select("module, is_active, activated_at, deactivated_at, updated_by")
    .eq("establishment_id", establishmentId)
    .order("module");

  if (!rows) return [];

  return (rows as any[]).map((r) => ({
    module: r.module as PlatformModule,
    establishmentId,
    isActive: r.is_active,
    activatedAt: r.activated_at,
    deactivatedAt: r.deactivated_at,
    updatedBy: r.updated_by,
  }));
}

/**
 * Count establishments with a specific module status.
 * Useful for admin stats.
 */
export async function countEstablishmentsWithModule(
  module: PlatformModule,
  active: boolean,
): Promise<number> {
  const supabase = getAdminSupabase();

  const { count, error } = await supabase
    .from("establishment_module_activations")
    .select("id", { count: "exact", head: true })
    .eq("module", module)
    .eq("is_active", active);

  if (error) return 0;
  return count ?? 0;
}
