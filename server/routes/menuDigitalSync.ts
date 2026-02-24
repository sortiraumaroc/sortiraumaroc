/**
 * Menu Digital Sync API
 *
 * Synchronizes establishment inventory data from Sortir Au Maroc (Supabase)
 * to the menu_sam digital menu system (MySQL).
 *
 * This enables pros to manage their menu in one place (SAM dashboard)
 * while having it automatically available on the QR code menu system.
 */

import type { RequestHandler } from "express";
import type { Express } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import { zParams } from "../lib/validate";
import { EstablishmentIdParams } from "../schemas/proReservations";

const log = createModuleLogger("menuDigitalSync");

// Environment variable for menu_sam API endpoint
const MENU_SAM_API_URL = process.env.MENU_SAM_API_URL || "http://localhost:8081";
const MENU_SAM_SYNC_SECRET = process.env.MENU_SAM_SYNC_SECRET || "";

type ProUser = { id: string; email?: string | null };
type ProRole = "owner" | "manager" | "reception" | "accounting" | "marketing" | string;

type MembershipRow = {
  establishment_id: string;
  user_id: string;
  role: ProRole;
};

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token && token.trim() ? token.trim() : null;
}

/**
 * Authenticate pro user and verify establishment access
 */
async function authenticateProForEstablishment(
  req: { headers: { authorization?: string }; params: { establishmentId?: string } },
  requiredRoles: ProRole[] = ["owner", "manager"]
): Promise<{ user: ProUser; establishmentId: string } | { error: string; status: number }> {
  const supabase = getAdminSupabase();
  const token = parseBearerToken(req.headers.authorization);

  if (!token) {
    return { error: "Unauthorized", status: 401 };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return { error: "Invalid token", status: 401 };
  }

  const user: ProUser = { id: userData.user.id, email: userData.user.email };
  const establishmentId = req.params.establishmentId;

  if (!establishmentId) {
    return { error: "Missing establishment ID", status: 400 };
  }

  // Check membership
  const { data: membership, error: membershipError } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id, user_id, role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    return { error: "Access denied", status: 403 };
  }

  const mem = membership as MembershipRow;
  if (!requiredRoles.includes(mem.role)) {
    return { error: "Insufficient permissions", status: 403 };
  }

  return { user, establishmentId };
}

/**
 * GET /api/pro/establishments/:establishmentId/menu-digital/status
 *
 * Get the current menu digital sync status for an establishment
 */
export const getMenuDigitalStatus: RequestHandler = async (req, res) => {
  const auth = await authenticateProForEstablishment(req as any, ["owner", "manager"]);
  if ("error" in auth) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { establishmentId } = auth;
  const supabase = getAdminSupabase();

  // Get establishment details
  const { data: establishment, error: estError } = await supabase
    .from("establishments")
    .select("id, name, slug, username, menu_digital_enabled, menu_digital_last_sync, menu_digital_plan, menu_digital_expires_at")
    .eq("id", establishmentId)
    .single();

  if (estError || !establishment) {
    return res.status(404).json({ error: "Establishment not found" });
  }

  // Get inventory stats
  const { count: categoryCount } = await supabase
    .from("pro_inventory_categories")
    .select("id", { count: "exact", head: true })
    .eq("establishment_id", establishmentId)
    .eq("is_active", true);

  const { count: itemCount } = await supabase
    .from("pro_inventory_items")
    .select("id", { count: "exact", head: true })
    .eq("establishment_id", establishmentId)
    .eq("is_active", true);

  const est = establishment as {
    id: string;
    name: string | null;
    slug: string | null;
    username: string | null;
    menu_digital_enabled: boolean | null;
    menu_digital_last_sync: string | null;
    menu_digital_plan: string | null;
    menu_digital_expires_at: string | null;
  };

  // Check if subscription is expired
  const isExpired = est.menu_digital_expires_at
    ? new Date(est.menu_digital_expires_at) < new Date()
    : false;

  return res.json({
    ok: true,
    status: {
      enabled: est.menu_digital_enabled ?? false,
      plan: est.menu_digital_plan as "silver" | "premium" | null,
      expiresAt: est.menu_digital_expires_at,
      isExpired,
      lastSync: est.menu_digital_last_sync,
      slug: est.slug,
      username: est.username,
      menuUrl: est.slug ? `${process.env.MENU_DIGITAL_BASE_URL || "https://menu.sam.ma"}/${est.slug}` : null,
      stats: {
        categories: categoryCount ?? 0,
        items: itemCount ?? 0,
      },
    },
  });
};

/**
 * POST /api/pro/establishments/:establishmentId/menu-digital/enable
 *
 * Enable menu digital sync for an establishment
 */
export const enableMenuDigital: RequestHandler = async (req, res) => {
  const auth = await authenticateProForEstablishment(req as any, ["owner", "manager"]);
  if ("error" in auth) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { establishmentId } = auth;
  const supabase = getAdminSupabase();

  // Get establishment details
  const { data: establishment, error: estError } = await supabase
    .from("establishments")
    .select("id, name, slug, city, cover_url, description_short, phone, address")
    .eq("id", establishmentId)
    .single();

  if (estError || !establishment) {
    return res.status(404).json({ error: "Establishment not found" });
  }

  const est = establishment as {
    id: string;
    name: string | null;
    slug: string | null;
    city: string | null;
    cover_url: string | null;
    description_short: string | null;
    phone: string | null;
    address: string | null;
  };

  // Call menu_sam API to create/link the place
  try {
    const response = await fetch(`${MENU_SAM_API_URL}/api/sync/establishment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Secret": MENU_SAM_SYNC_SECRET,
      },
      body: JSON.stringify({
        samEstablishmentId: est.id,
        name: est.name || "Sans nom",
        slug: est.slug,
        city: est.city,
        coverUrl: est.cover_url,
        description: est.description_short,
        phone: est.phone,
        address: est.address,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ errorText }, "menu SAM sync error");
      return res.status(500).json({ error: "Failed to enable menu digital" });
    }

    const result = await response.json();

    // Update establishment to mark menu digital as enabled
    await supabase
      .from("establishments")
      .update({
        menu_digital_enabled: true,
        menu_digital_last_sync: new Date().toISOString(),
      })
      .eq("id", establishmentId);

    return res.json({
      ok: true,
      message: "Menu digital enabled",
      placeId: result.placeId,
      menuUrl: est.slug ? `${process.env.MENU_DIGITAL_BASE_URL || "https://menu.sam.ma"}/${est.slug}` : null,
    });

  } catch (error) {
    log.error({ err: error }, "menu SAM API error");
    return res.status(500).json({ error: "Failed to connect to menu digital service" });
  }
};

/**
 * POST /api/pro/establishments/:establishmentId/menu-digital/sync
 *
 * Manually trigger a full sync of inventory to menu_sam
 */
export const syncMenuDigital: RequestHandler = async (req, res) => {
  const auth = await authenticateProForEstablishment(req as any, ["owner", "manager"]);
  if ("error" in auth) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { establishmentId } = auth;
  const supabase = getAdminSupabase();

  // Check if menu digital is enabled
  const { data: establishment, error: estError } = await supabase
    .from("establishments")
    .select("id, name, slug, menu_digital_enabled")
    .eq("id", establishmentId)
    .single();

  if (estError || !establishment) {
    return res.status(404).json({ error: "Establishment not found" });
  }

  const est = establishment as {
    id: string;
    name: string | null;
    slug: string | null;
    menu_digital_enabled: boolean | null;
  };

  if (!est.menu_digital_enabled) {
    return res.status(400).json({ error: "Menu digital is not enabled. Please enable it first." });
  }

  // Fetch all inventory categories
  const { data: categories, error: catError } = await supabase
    .from("pro_inventory_categories")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("sort_order", { ascending: true });

  if (catError) {
    return res.status(500).json({ error: "Failed to fetch categories" });
  }

  // Fetch all inventory items with their variants
  const { data: items, error: itemsError } = await supabase
    .from("pro_inventory_items")
    .select(`
      *,
      variants:pro_inventory_variants(*)
    `)
    .eq("establishment_id", establishmentId)
    .order("popularity", { ascending: false });

  if (itemsError) {
    return res.status(500).json({ error: "Failed to fetch items" });
  }

  // Transform data for menu_sam format
  const syncPayload = {
    samEstablishmentId: establishmentId,
    categories: (categories || []).map((cat: any) => ({
      samCategoryId: cat.id,
      title: cat.title,
      description: cat.description,
      sortOrder: cat.sort_order,
      parentId: cat.parent_id,
      isActive: cat.is_active,
    })),
    items: (items || []).map((item: any) => {
      // Get the primary variant (first one or lowest priced)
      const variants = item.variants || [];
      const primaryVariant = variants.length > 0
        ? variants.reduce((min: any, v: any) =>
            (v.price < min.price ? v : min), variants[0])
        : null;

      return {
        samItemId: item.id,
        samCategoryId: item.category_id,
        title: item.title,
        description: item.description,
        price: primaryVariant?.price ?? item.base_price ?? 0,
        samVariantId: primaryVariant?.id,
        photos: item.photos || [],
        labels: item.labels || [],
        isActive: item.is_active,
        popularity: item.popularity,
        // Include all variants for complex menus
        variants: variants.map((v: any) => ({
          samVariantId: v.id,
          title: v.title,
          price: v.price,
          isActive: v.is_active,
        })),
      };
    }),
  };

  // Send to menu_sam
  try {
    const response = await fetch(`${MENU_SAM_API_URL}/api/sync/full`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Secret": MENU_SAM_SYNC_SECRET,
      },
      body: JSON.stringify(syncPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ errorText }, "menu SAM sync error");
      return res.status(500).json({ error: "Failed to sync menu" });
    }

    const result = await response.json();

    // Update last sync timestamp
    await supabase
      .from("establishments")
      .update({ menu_digital_last_sync: new Date().toISOString() })
      .eq("id", establishmentId);

    return res.json({
      ok: true,
      message: "Menu synchronized successfully",
      stats: {
        categoriesSynced: syncPayload.categories.length,
        itemsSynced: syncPayload.items.length,
      },
      menuUrl: est.slug ? `${process.env.MENU_DIGITAL_BASE_URL || "https://menu.sam.ma"}/${est.slug}` : null,
    });

  } catch (error) {
    log.error({ err: error }, "menu SAM API error");
    return res.status(500).json({ error: "Failed to connect to menu digital service" });
  }
};

/**
 * POST /api/pro/establishments/:establishmentId/menu-digital/disable
 *
 * Disable menu digital for an establishment
 */
export const disableMenuDigital: RequestHandler = async (req, res) => {
  const auth = await authenticateProForEstablishment(req as any, ["owner", "manager"]);
  if ("error" in auth) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { establishmentId } = auth;
  const supabase = getAdminSupabase();

  // Update establishment
  await supabase
    .from("establishments")
    .update({ menu_digital_enabled: false })
    .eq("id", establishmentId);

  // Optionally notify menu_sam to disable the place
  try {
    await fetch(`${MENU_SAM_API_URL}/api/sync/disable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Secret": MENU_SAM_SYNC_SECRET,
      },
      body: JSON.stringify({ samEstablishmentId: establishmentId }),
    });
  } catch (error) {
    // Log but don't fail - the important thing is SAM side is disabled
    log.error({ err: error }, "failed to notify menu_sam of disable");
  }

  return res.json({ ok: true, message: "Menu digital disabled" });
};

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerMenuDigitalRoutes(app: Express) {
  app.get("/api/pro/establishments/:establishmentId/menu-digital/status", zParams(EstablishmentIdParams), getMenuDigitalStatus);
  app.post("/api/pro/establishments/:establishmentId/menu-digital/enable", zParams(EstablishmentIdParams), enableMenuDigital);
  app.post("/api/pro/establishments/:establishmentId/menu-digital/sync", zParams(EstablishmentIdParams), syncMenuDigital);
  app.post("/api/pro/establishments/:establishmentId/menu-digital/disable", zParams(EstablishmentIdParams), disableMenuDigital);
}
