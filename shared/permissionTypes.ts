/**
 * Permission Types — Shared between client & server
 *
 * Defines the 6 permission categories, the customizable roles,
 * default permission matrix, and French UI labels.
 */

// =============================================================================
// Permission keys
// =============================================================================

/** The 6 permission categories */
export type PermissionKey =
  | "manage_profile"
  | "manage_team"
  | "manage_reservations"
  | "view_billing"
  | "manage_inventory"
  | "manage_offers";

export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  "manage_profile",
  "manage_team",
  "manage_reservations",
  "view_billing",
  "manage_inventory",
  "manage_offers",
];

/** Non-customizable: always owner-only */
export const OWNER_ONLY_PERMISSIONS: ReadonlySet<PermissionKey> = new Set(["manage_team"]);

// =============================================================================
// Customizable roles (owner excluded — always has all permissions)
// =============================================================================

export type CustomizableRole = "manager" | "reception" | "accounting" | "marketing";

export const CUSTOMIZABLE_ROLES: CustomizableRole[] = [
  "manager",
  "reception",
  "accounting",
  "marketing",
];

// =============================================================================
// Permission matrix type & defaults
// =============================================================================

/** Full permission map: role → permission → boolean */
export type PermissionMatrix = Record<CustomizableRole, Record<PermissionKey, boolean>>;

/**
 * Default permission matrix — matches the previously hard-coded values exactly.
 * Used as fallback when no custom permissions exist in the database.
 */
export const DEFAULT_PERMISSIONS: PermissionMatrix = {
  manager: {
    manage_profile: true,
    manage_team: false,
    manage_reservations: true,
    view_billing: true,
    manage_inventory: true,
    manage_offers: true,
  },
  reception: {
    manage_profile: false,
    manage_team: false,
    manage_reservations: true,
    view_billing: false,
    manage_inventory: false,
    manage_offers: false,
  },
  accounting: {
    manage_profile: false,
    manage_team: false,
    manage_reservations: false,
    view_billing: true,
    manage_inventory: false,
    manage_offers: false,
  },
  marketing: {
    manage_profile: false,
    manage_team: false,
    manage_reservations: false,
    view_billing: false,
    manage_inventory: true,
    manage_offers: true,
  },
};

// =============================================================================
// French labels for UI display
// =============================================================================

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  manage_profile: "Fiche établissement",
  manage_team: "Gestion équipe",
  manage_reservations: "Réservations",
  view_billing: "Facturation",
  manage_inventory: "Inventaire / Packs",
  manage_offers: "Offres / Campagnes",
};

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  manage_profile: "Modifier la fiche, les paramètres et les avis",
  manage_team: "Créer et gérer les membres de l'équipe",
  manage_reservations: "Gérer les réservations, la liste d'attente et le scanner",
  view_billing: "Consulter la facturation et les finances",
  manage_inventory: "Gérer le menu, les packs et l'inventaire",
  manage_offers: "Gérer les offres, campagnes, visibilité et publicités",
};

export const ROLE_LABELS: Record<CustomizableRole, string> = {
  manager: "Manager",
  reception: "Réception",
  accounting: "Comptable",
  marketing: "Marketing",
};
