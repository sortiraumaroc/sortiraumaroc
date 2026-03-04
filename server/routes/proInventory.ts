/**
 * Routes API PRO - Inventory Management
 *
 * Extracted from the monolithic pro.ts.
 *
 * Endpoints for:
 * - Listing inventory (categories, items, variants)
 * - Demo seed
 * - Pending changes (moderation queue)
 * - CRUD categories & items
 * - Green-thumb (popularity)
 */

import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

import { getAdminSupabase } from "../supabaseAdmin";
import { emitAdminNotification } from "../adminNotifications";
import { createModuleLogger } from "../lib/logger";
import {
  parseBearerToken,
  getUserFromBearerToken,
  ensureRole,
  ensureCanManageInventory,
  isRecord,
  asString,
  asNumber,
  asBoolean,
  asStringArray,
  asJsonObject,
  normalizeEmail,
  isDemoRoutesAllowed,
  getDemoProEmail,
  type ProUser,
  type ProRole,
} from "./proHelpers";

const log = createModuleLogger("proInventory");

// =============================================================================
// Local helpers
// =============================================================================

/** @internal — exported for testing */
export function normalizeUrlList(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    if (!/^https?:\/\//i.test(v)) continue;
    out.push(v);
  }
  return out;
}

/** @internal — exported for testing */
export function parseIsoDatetimeOrNull(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

type InventoryVariantInput = {
  title?: unknown;
  quantity?: unknown;
  unit?: unknown;
  price?: unknown;
  currency?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
};

/** @internal — exported for testing */
export function parseInventoryVariants(input: unknown):
  | { ok: true; variants: Array<{ title: string | null; quantity: number | null; unit: string | null; price: number; currency: string; sort_order: number; is_active: boolean }> }
  | { ok: false; error: string } {
  if (input === undefined) return { ok: true, variants: [] };
  if (!Array.isArray(input)) return { ok: false, error: "variants doit être un tableau" };

  const out: Array<{ title: string | null; quantity: number | null; unit: string | null; price: number; currency: string; sort_order: number; is_active: boolean }> = [];

  for (const raw of input as InventoryVariantInput[]) {
    if (!isRecord(raw)) return { ok: false, error: "variant invalide" };

    const priceRaw = asNumber(raw.price);
    if (priceRaw === undefined || !Number.isFinite(priceRaw)) return { ok: false, error: "variant.price requis" };
    const price = Math.round(priceRaw);
    if (price < 0) return { ok: false, error: "variant.price invalide" };

    const quantityRaw = raw.quantity === null ? null : asNumber(raw.quantity);
    const quantity = quantityRaw == null ? null : Math.round(quantityRaw);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) return { ok: false, error: "variant.quantity invalide" };

    const unit = asString(raw.unit) ?? null;
    const title = asString(raw.title) ?? null;
    const currency = (asString(raw.currency) ?? "MAD").toUpperCase();
    const sort_order = asNumber(raw.sort_order) !== undefined ? Math.round(asNumber(raw.sort_order) as number) : 0;
    const is_active = asBoolean(raw.is_active) ?? true;

    out.push({ title, quantity, unit, price, currency, sort_order, is_active });
  }

  return { ok: true, variants: out };
}

// =============================================================================
// Handlers
// =============================================================================

export const listProInventory: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  await supabase.rpc("apply_pro_inventory_reactivations", { p_establishment_id: establishmentId });

  const [{ data: categories, error: catErr }, { data: items, error: itemErr }] = await Promise.all([
    supabase
      .from("pro_inventory_categories")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("pro_inventory_items")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (catErr) return res.status(500).json({ error: catErr.message });
  if (itemErr) return res.status(500).json({ error: itemErr.message });

  const itemIds = (items ?? []).map((i) => (isRecord(i) ? asString(i.id) : undefined)).filter((x): x is string => !!x);

  const { data: variants, error: vErr } = itemIds.length
    ? await supabase
        .from("pro_inventory_variants")
        .select("*")
        .in("item_id", itemIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(2000)
    : { data: [], error: null };

  if (vErr) return res.status(500).json({ error: vErr.message });

  const byItem = new Map<string, unknown[]>();
  for (const v of variants ?? []) {
    const itemId = isRecord(v) ? asString(v.item_id) : undefined;
    if (!itemId) continue;
    const arr = byItem.get(itemId) ?? [];
    arr.push(v);
    byItem.set(itemId, arr);
  }

  const itemsWithVariants = (items ?? []).map((i) => {
    const id = isRecord(i) ? asString(i.id) : undefined;
    return { ...(i as Record<string, unknown>), variants: id ? byItem.get(id) ?? [] : [] };
  });

  res.json({ ok: true, categories: categories ?? [], items: itemsWithVariants });
};

// =============================================================================
// Demo Seed
// =============================================================================

type DemoSeedInsertStats = { categories: number; items: number; variants: number };

type DemoSeedPayload = {
  categories: Array<{
    id: string;
    establishment_id: string;
    parent_id: string | null;
    title: string;
    description: string | null;
    sort_order: number;
    is_active: boolean;
  }>;
  items: Array<{
    id: string;
    establishment_id: string;
    category_id: string | null;
    title: string;
    description: string | null;
    labels: string[];
    base_price: number | null;
    currency: string;
    is_active: boolean;
    visible_when_unavailable: boolean;
    scheduled_reactivation_at: string | null;
    photos: string[];
    meta: Record<string, unknown>;
  }>;
  variants: Array<{
    id: string;
    item_id: string;
    title: string | null;
    quantity: number | null;
    unit: string | null;
    price: number;
    currency: string;
    sort_order: number;
    is_active: boolean;
  }>;
};

function buildDemoSeedPayload(args: {
  establishmentId: string;
  universe: string;
  seedTag: string;
  seededAt: string;
}): DemoSeedPayload {
  const baseMeta = {
    demo_seed: args.seedTag,
    demo_seeded_at: args.seededAt,
    demo_universe: args.universe,
  } as const;

  const currency = "MAD";
  const addDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

  const mkCat = (data: Omit<DemoSeedPayload["categories"][number], "establishment_id">) => ({
    ...data,
    establishment_id: args.establishmentId,
  });

  const mkItem = (data: Omit<DemoSeedPayload["items"][number], "establishment_id" | "currency">) => ({
    ...data,
    establishment_id: args.establishmentId,
    currency,
  });

  const u = (args.universe ?? "").toLowerCase();

  if (u === "restaurant") {
    const catEntrees = randomUUID();
    const catPlats = randomUUID();
    const catDesserts = randomUUID();
    const catBoissons = randomUUID();
    const catVins = randomUUID();

    const itemOysters = randomUUID();
    const itemTajine = randomUUID();
    const itemPastilla = randomUUID();
    const itemTea = randomUUID();
    const itemWine = randomUUID();

    return {
      categories: [
        mkCat({ id: catEntrees, parent_id: null, title: "Entrées", description: "Pour bien commencer.", sort_order: 10, is_active: true }),
        mkCat({ id: catPlats, parent_id: null, title: "Plats", description: "Cuisine du moment.", sort_order: 20, is_active: true }),
        mkCat({ id: catDesserts, parent_id: null, title: "Desserts", description: "Douceurs maison.", sort_order: 30, is_active: true }),
        mkCat({ id: catBoissons, parent_id: null, title: "Boissons", description: "Boissons chaudes et fraîches.", sort_order: 40, is_active: true }),
        mkCat({ id: catVins, parent_id: catBoissons, title: "Vins", description: "Sélection de vins.", sort_order: 41, is_active: true }),
      ],
      items: [
        mkItem({
          id: itemOysters,
          category_id: catEntrees,
          title: "Huîtres de Dakhla",
          description: "Servies fraîches avec citron et vinaigre d'échalotes.",
          labels: ["fruits_de_mer", "best_seller"],
          base_price: null,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/3296391/pexels-photo-3296391.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            allergens: ["mollusques"],
          },
        }),
        mkItem({
          id: itemTajine,
          category_id: catPlats,
          title: "Tajine d'agneau aux pruneaux",
          description: "Agneau fondant, pruneaux caramélisés, amandes grillées.",
          labels: ["traditionnel", "suggestion_chef"],
          base_price: 140,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/958545/pexels-photo-958545.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            spicy_level: 1,
          },
        }),
        mkItem({
          id: itemPastilla,
          category_id: catPlats,
          title: "Pastilla fruits de mer",
          description: "Feuilleté croustillant, sauce onctueuse, herbes fraîches.",
          labels: ["fruits_de_mer", "signature"],
          base_price: 160,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/6646367/pexels-photo-6646367.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
          },
        }),
        mkItem({
          id: itemTea,
          category_id: catBoissons,
          title: "Thé à la menthe",
          description: "Thé vert, menthe fraîche, servi à la marocaine.",
          labels: ["traditionnel"],
          base_price: 20,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/5946648/pexels-photo-5946648.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            hot: true,
          },
        }),
        mkItem({
          id: itemWine,
          category_id: catVins,
          title: "Vin blanc de la maison",
          description: "Servi frais. Disponible au verre ou à la bouteille.",
          labels: ["coup_de_coeur"],
          base_price: null,
          is_active: false,
          visible_when_unavailable: true,
          scheduled_reactivation_at: addDays(2),
          photos: [
            "https://images.pexels.com/photos/1283219/pexels-photo-1283219.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            alcohol: true,
          },
        }),
      ],
      variants: [
        {
          id: randomUUID(),
          item_id: itemOysters,
          title: "6 pièces",
          quantity: 6,
          unit: "pièces",
          price: 90,
          currency,
          sort_order: 10,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemOysters,
          title: "12 pièces",
          quantity: 12,
          unit: "pièces",
          price: 170,
          currency,
          sort_order: 20,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemWine,
          title: "Verre (12 cl)",
          quantity: 12,
          unit: "cl",
          price: 45,
          currency,
          sort_order: 10,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemWine,
          title: "Bouteille (75 cl)",
          quantity: 75,
          unit: "cl",
          price: 220,
          currency,
          sort_order: 20,
          is_active: true,
        },
      ],
    };
  }

  if (u === "hebergement") {
    const catRooms = randomUUID();
    const catSuites = randomUUID();
    const catServices = randomUUID();
    const catWellness = randomUUID();

    const itemRoom = randomUUID();
    const itemSuite = randomUUID();
    const itemBreakfast = randomUUID();
    const itemHammam = randomUUID();
    const itemTransfer = randomUUID();

    return {
      categories: [
        mkCat({ id: catRooms, parent_id: null, title: "Chambres", description: "Vos chambres et tarifs.", sort_order: 10, is_active: true }),
        mkCat({ id: catSuites, parent_id: null, title: "Suites", description: "Suites premium.", sort_order: 20, is_active: true }),
        mkCat({ id: catServices, parent_id: null, title: "Services", description: "Services additionnels.", sort_order: 30, is_active: true }),
        mkCat({ id: catWellness, parent_id: catServices, title: "Bien-être", description: "Spa, hammam, soins.", sort_order: 31, is_active: true }),
      ],
      items: [
        mkItem({
          id: itemRoom,
          category_id: catRooms,
          title: "Chambre Double Deluxe",
          description: "Lit Queen, climatisation, Wi‑Fi, salle de bain privative.",
          labels: ["best_seller", "coup_de_coeur"],
          base_price: null,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            capacity: 2,
            bed: "Queen",
            amenities: ["Wi‑Fi", "Climatisation", "Douche"],
          },
        }),
        mkItem({
          id: itemSuite,
          category_id: catSuites,
          title: "Suite Atlas (vue patio)",
          description: "Suite spacieuse avec coin salon et vue sur le patio.",
          labels: ["signature"],
          base_price: null,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/164595/pexels-photo-164595.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            capacity: 3,
            bed: "King",
          },
        }),
        mkItem({
          id: itemBreakfast,
          category_id: catServices,
          title: "Petit-déjeuner marocain",
          description: "Mssemen, baghrir, amlou, jus d'orange, thé à la menthe.",
          labels: ["traditionnel"],
          base_price: null,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            served_from: "08:00",
            served_to: "11:00",
          },
        }),
        mkItem({
          id: itemHammam,
          category_id: catWellness,
          title: "Hammam & gommage",
          description: "Rituel traditionnel: vapeur + savon noir + gommage.",
          labels: ["specialite", "healthy"],
          base_price: 250,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/3865676/pexels-photo-3865676.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            duration_minutes: 60,
          },
        }),
        mkItem({
          id: itemTransfer,
          category_id: catServices,
          title: "Transfert aéroport (aller)",
          description: "Prise en charge à l'aéroport, chauffeur privé.",
          labels: ["nouveaute"],
          base_price: 300,
          is_active: false,
          visible_when_unavailable: true,
          scheduled_reactivation_at: addDays(3),
          photos: [
            "https://images.pexels.com/photos/1149831/pexels-photo-1149831.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            includes: ["Chauffeur", "Véhicule climatisé"],
          },
        }),
      ],
      variants: [
        {
          id: randomUUID(),
          item_id: itemRoom,
          title: "1 nuit",
          quantity: 1,
          unit: "nuit",
          price: 950,
          currency,
          sort_order: 10,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemRoom,
          title: "2 nuits",
          quantity: 2,
          unit: "nuits",
          price: 1750,
          currency,
          sort_order: 20,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemSuite,
          title: "1 nuit",
          quantity: 1,
          unit: "nuit",
          price: 1400,
          currency,
          sort_order: 10,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemSuite,
          title: "2 nuits",
          quantity: 2,
          unit: "nuits",
          price: 2600,
          currency,
          sort_order: 20,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemBreakfast,
          title: "1 personne",
          quantity: 1,
          unit: "pers.",
          price: 80,
          currency,
          sort_order: 10,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemBreakfast,
          title: "2 personnes",
          quantity: 2,
          unit: "pers.",
          price: 150,
          currency,
          sort_order: 20,
          is_active: true,
        },
      ],
    };
  }

  // Fallback: generic (loisir / services)
  const catServices = randomUUID();
  const catExcursions = randomUUID();
  const catWellness = randomUUID();

  const itemTour = randomUUID();
  const itemQuad = randomUUID();
  const itemMassage = randomUUID();

  return {
    categories: [
      mkCat({ id: catExcursions, parent_id: null, title: "Excursions", description: "Sorties et visites.", sort_order: 10, is_active: true }),
      mkCat({ id: catServices, parent_id: null, title: "Services", description: "Prestations à la carte.", sort_order: 20, is_active: true }),
      mkCat({ id: catWellness, parent_id: catServices, title: "Bien-être", description: "Massage, détente.", sort_order: 21, is_active: true }),
    ],
    items: [
      mkItem({
        id: itemTour,
        category_id: catExcursions,
        title: "Visite guidée (médina)",
        description: "Guide local, parcours sur-mesure, durée 2h.",
        labels: ["coup_de_coeur"],
        base_price: null,
        is_active: true,
        visible_when_unavailable: true,
        scheduled_reactivation_at: null,
        photos: [
          "https://images.pexels.com/photos/386026/pexels-photo-386026.jpeg?auto=compress&cs=tinysrgb&w=1200",
        ],
        meta: {
          ...baseMeta,
          duration_minutes: 120,
        },
      }),
      mkItem({
        id: itemQuad,
        category_id: catExcursions,
        title: "Sortie quad (demi-journée)",
        description: "Équipement inclus, encadrement, parcours découverte.",
        labels: ["best_seller"],
        base_price: null,
        is_active: true,
        visible_when_unavailable: true,
        scheduled_reactivation_at: null,
        photos: [
          "https://images.pexels.com/photos/100582/pexels-photo-100582.jpeg?auto=compress&cs=tinysrgb&w=1200",
        ],
        meta: {
          ...baseMeta,
          min_age: 16,
        },
      }),
      mkItem({
        id: itemMassage,
        category_id: catWellness,
        title: "Massage relaxant",
        description: "Massage 60 min.",
        labels: ["healthy"],
        base_price: null,
        is_active: true,
        visible_when_unavailable: true,
        scheduled_reactivation_at: null,
        photos: [
          "https://images.pexels.com/photos/3757954/pexels-photo-3757954.jpeg?auto=compress&cs=tinysrgb&w=1200",
        ],
        meta: {
          ...baseMeta,
          duration_minutes: 60,
        },
      }),
    ],
    variants: [
      {
        id: randomUUID(),
        item_id: itemTour,
        title: "1 personne",
        quantity: 1,
        unit: "pers.",
        price: 120,
        currency,
        sort_order: 10,
        is_active: true,
      },
      {
        id: randomUUID(),
        item_id: itemTour,
        title: "2 personnes",
        quantity: 2,
        unit: "pers.",
        price: 200,
        currency,
        sort_order: 20,
        is_active: true,
      },
      {
        id: randomUUID(),
        item_id: itemQuad,
        title: "1 personne",
        quantity: 1,
        unit: "pers.",
        price: 450,
        currency,
        sort_order: 10,
        is_active: true,
      },
      {
        id: randomUUID(),
        item_id: itemMassage,
        title: "60 min",
        quantity: 60,
        unit: "min",
        price: 320,
        currency,
        sort_order: 10,
        is_active: true,
      },
      {
        id: randomUUID(),
        item_id: itemMassage,
        title: "90 min",
        quantity: 90,
        unit: "min",
        price: 450,
        currency,
        sort_order: 20,
        is_active: true,
      },
    ],
  };
}

export const seedDemoProInventory: RequestHandler = async (req, res) => {
  if (!isDemoRoutesAllowed()) return res.status(404).json({ error: "not_found" });

  const demoEmail = getDemoProEmail();
  if (!demoEmail) return res.status(404).json({ error: "not_found" });

  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const email = userResult.user.email ? normalizeEmail(userResult.user.email) : "";
  if (email !== demoEmail) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();

  const { data: existingItems, error: existingErr } = await supabase
    .from("pro_inventory_items")
    .select("id")
    .eq("establishment_id", establishmentId)
    .limit(1);
  if (existingErr) return res.status(500).json({ error: existingErr.message });

  if ((existingItems ?? []).length) {
    return res.json({ ok: true, skipped: true, reason: "already_has_items" } as const);
  }

  const { data: est, error: estErr } = await supabase
    .from("establishments")
    .select("id,universe")
    .eq("id", establishmentId)
    .single();
  if (estErr) return res.status(500).json({ error: estErr.message });

  const universe = (isRecord(est) ? asString((est as Record<string, unknown>).universe) : undefined) ?? "";

  const seedTag = "v1";
  const seededAt = new Date().toISOString();
  const payload = buildDemoSeedPayload({ establishmentId, universe, seedTag, seededAt });

  const stats: DemoSeedInsertStats = { categories: 0, items: 0, variants: 0 };

  if (payload.categories.length) {
    const { error: catErr } = await supabase.from("pro_inventory_categories").insert(payload.categories);
    if (catErr) return res.status(500).json({ error: catErr.message });
    stats.categories = payload.categories.length;
  }

  if (payload.items.length) {
    const { error: itemErr } = await supabase.from("pro_inventory_items").insert(payload.items);
    if (itemErr) return res.status(500).json({ error: itemErr.message });
    stats.items = payload.items.length;
  }

  if (payload.variants.length) {
    const { error: vErr } = await supabase.from("pro_inventory_variants").insert(payload.variants);
    if (vErr) return res.status(500).json({ error: vErr.message });
    stats.variants = payload.variants.length;
  }

  return res.json({ ok: true, inserted: stats } as const);
};

// =============================================================================
// Pro Inventory Pending Changes (Moderation Queue)
// =============================================================================

export const listProInventoryPendingChanges: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const statusFilter = asString(req.query.status) ?? "pending";

  const { data, error } = await supabase
    .from("pro_inventory_pending_changes")
    .select("*")
    .eq("establishment_id", establishmentId)
    .eq("status", statusFilter)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, pendingChanges: data ?? [] });
};

export const createProInventoryCategory: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const title = asString(req.body.title);
  if (!title) return res.status(400).json({ error: "title is required" });

  const parent_id = asString(req.body.parent_id) ?? null;
  const description = asString(req.body.description) ?? null;
  const sort_order = asNumber(req.body.sort_order) !== undefined ? Math.round(asNumber(req.body.sort_order) as number) : 0;
  const is_active = asBoolean(req.body.is_active) ?? true;

  const supabase = getAdminSupabase();

  // Pro users: submit to moderation queue
  const payload = { title, parent_id, description, sort_order, is_active };

  const { data: pendingChange, error: pendingErr } = await supabase
    .from("pro_inventory_pending_changes")
    .insert({
      establishment_id: establishmentId,
      change_type: "create_category",
      payload,
      submitted_by: userResult.user.id,
    })
    .select("*")
    .single();

  if (pendingErr) return res.status(500).json({ error: pendingErr.message });

  void emitAdminNotification({
    type: "inventory_change",
    title: "Modification inventaire",
    body: `Nouvelle demande : création de catégorie "${title}"`,
    data: { establishmentId, changeType: "create_category", pendingChangeId: pendingChange?.id },
  });

  res.json({ ok: true, pending: true, pendingChange, message: "Votre demande de création de catégorie a été soumise pour modération." });
};

export const updateProInventoryCategory: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const categoryId = typeof req.params.categoryId === "string" ? req.params.categoryId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!categoryId) return res.status(400).json({ error: "categoryId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const patch: Record<string, unknown> = {};

  const title = asString(req.body.title);
  if (title !== undefined) patch.title = title;

  const description = req.body.description === null ? null : asString(req.body.description);
  if (description !== undefined) patch.description = description;

  const sortOrderRaw = asNumber(req.body.sort_order);
  if (sortOrderRaw !== undefined) patch.sort_order = Math.round(sortOrderRaw);

  const isActiveRaw = asBoolean(req.body.is_active);
  if (isActiveRaw !== undefined) patch.is_active = isActiveRaw;

  if (!Object.keys(patch).length) return res.status(400).json({ error: "No changes provided" });

  const supabase = getAdminSupabase();

  // Pro users: submit to moderation queue
  const { data: pendingChange, error: pendingErr } = await supabase
    .from("pro_inventory_pending_changes")
    .insert({
      establishment_id: establishmentId,
      change_type: "update_category",
      target_id: categoryId,
      payload: patch,
      submitted_by: userResult.user.id,
    })
    .select("*")
    .single();

  if (pendingErr) return res.status(500).json({ error: pendingErr.message });

  void emitAdminNotification({
    type: "inventory_change",
    title: "Modification inventaire",
    body: `Nouvelle demande : modification de catégorie`,
    data: { establishmentId, changeType: "update_category", targetId: categoryId, pendingChangeId: pendingChange?.id },
  });

  res.json({ ok: true, pending: true, pendingChange, message: "Votre demande de modification de catégorie a été soumise pour modération." });
};

export const deleteProInventoryCategory: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const categoryId = typeof req.params.categoryId === "string" ? req.params.categoryId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!categoryId) return res.status(400).json({ error: "categoryId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  // Pro users: submit to moderation queue
  const { data: pendingChange, error: pendingErr } = await supabase
    .from("pro_inventory_pending_changes")
    .insert({
      establishment_id: establishmentId,
      change_type: "delete_category",
      target_id: categoryId,
      payload: {},
      submitted_by: userResult.user.id,
    })
    .select("*")
    .single();

  if (pendingErr) return res.status(500).json({ error: pendingErr.message });

  void emitAdminNotification({
    type: "inventory_change",
    title: "Modification inventaire",
    body: `Nouvelle demande : suppression de catégorie`,
    data: { establishmentId, changeType: "delete_category", targetId: categoryId, pendingChangeId: pendingChange?.id },
  });

  res.json({ ok: true, pending: true, pendingChange, message: "Votre demande de suppression de catégorie a été soumise pour modération." });
};

export const createProInventoryItem: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const title = asString(req.body.title);
  if (!title) return res.status(400).json({ error: "title is required" });

  const category_id = asString(req.body.category_id) ?? null;
  const description = asString(req.body.description) ?? null;

  const labelsRaw = asStringArray(req.body.labels) ?? [];
  const labels = labelsRaw.map((x) => x.trim()).filter(Boolean).slice(0, 20);

  const photosRaw = asStringArray(req.body.photos) ?? [];
  const photos = normalizeUrlList(photosRaw).slice(0, 12);

  const basePriceRaw = req.body.base_price === null ? null : asNumber(req.body.base_price);
  const base_price = basePriceRaw == null ? null : Math.round(basePriceRaw);
  if (base_price !== null && (!Number.isFinite(base_price) || base_price < 0)) return res.status(400).json({ error: "base_price invalide" });

  const currency = (asString(req.body.currency) ?? "MAD").toUpperCase();

  const is_active = asBoolean(req.body.is_active) ?? true;
  const visible_when_unavailable = asBoolean(req.body.visible_when_unavailable) ?? true;

  const scheduled = parseIsoDatetimeOrNull(req.body.scheduled_reactivation_at);
  const scheduled_reactivation_at = scheduled ? scheduled : null;

  const meta = asJsonObject(req.body.meta) ?? {};

  const variantsRes = parseInventoryVariants(req.body.variants);
  if (variantsRes.ok === false) return res.status(400).json({ error: variantsRes.error });

  const supabase = getAdminSupabase();

  // Pro users: submit to moderation queue
  const payload = {
    category_id,
    title,
    description,
    labels,
    base_price,
    currency,
    is_active,
    visible_when_unavailable,
    scheduled_reactivation_at,
    photos,
    meta,
    variants: variantsRes.variants,
  };

  const { data: pendingChange, error: pendingErr } = await supabase
    .from("pro_inventory_pending_changes")
    .insert({
      establishment_id: establishmentId,
      change_type: "create_item",
      payload,
      submitted_by: userResult.user.id,
    })
    .select("*")
    .single();

  if (pendingErr) return res.status(500).json({ error: pendingErr.message });

  void emitAdminNotification({
    type: "inventory_change",
    title: "Modification inventaire",
    body: `Nouvelle demande : création d'offre "${title}"`,
    data: { establishmentId, changeType: "create_item", pendingChangeId: pendingChange?.id },
  });

  res.json({ ok: true, pending: true, pendingChange, message: "Votre demande de création d'offre a été soumise pour modération." });
};

export const updateProInventoryItem: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!itemId) return res.status(400).json({ error: "itemId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const patch: Record<string, unknown> = {};

  const title = asString(req.body.title);
  if (title !== undefined) patch.title = title;

  const description = req.body.description === null ? null : asString(req.body.description);
  if (description !== undefined) patch.description = description;

  const categoryId = req.body.category_id === null ? null : asString(req.body.category_id);
  if (categoryId !== undefined) patch.category_id = categoryId;

  const labelsRaw = asStringArray(req.body.labels);
  if (labelsRaw !== undefined) patch.labels = labelsRaw.map((x) => x.trim()).filter(Boolean).slice(0, 20);

  const photosRaw = asStringArray(req.body.photos);
  if (photosRaw !== undefined) patch.photos = normalizeUrlList(photosRaw).slice(0, 12);

  const basePriceRaw = req.body.base_price === null ? null : asNumber(req.body.base_price);
  if (basePriceRaw !== undefined) {
    const v = basePriceRaw === null ? null : Math.round(basePriceRaw);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return res.status(400).json({ error: "base_price invalide" });
    patch.base_price = v;
  }

  const currencyRaw = asString(req.body.currency);
  if (currencyRaw !== undefined) patch.currency = currencyRaw.toUpperCase();

  const isActiveRaw = asBoolean(req.body.is_active);
  if (isActiveRaw !== undefined) patch.is_active = isActiveRaw;

  const visibleRaw = asBoolean(req.body.visible_when_unavailable);
  if (visibleRaw !== undefined) patch.visible_when_unavailable = visibleRaw;

  if (req.body.scheduled_reactivation_at !== undefined) {
    patch.scheduled_reactivation_at = parseIsoDatetimeOrNull(req.body.scheduled_reactivation_at);
  }

  const metaRaw = req.body.meta === null ? {} : asJsonObject(req.body.meta);
  if (metaRaw !== undefined) patch.meta = metaRaw;

  const variantsProvided = Object.prototype.hasOwnProperty.call(req.body, "variants");
  const variantsParsed = variantsProvided
    ? parseInventoryVariants(req.body.variants)
    : ({ ok: true, variants: [] } as const);
  if (variantsParsed.ok === false) return res.status(400).json({ error: variantsParsed.error });

  if (!Object.keys(patch).length && !variantsProvided) return res.status(400).json({ error: "No changes provided" });

  const supabase = getAdminSupabase();

  // Pro users: submit to moderation queue
  const payload = {
    ...patch,
    ...(variantsProvided ? { variants: variantsParsed.variants } : {}),
  };

  const { data: pendingChange, error: pendingErr } = await supabase
    .from("pro_inventory_pending_changes")
    .insert({
      establishment_id: establishmentId,
      change_type: "update_item",
      target_id: itemId,
      payload,
      submitted_by: userResult.user.id,
    })
    .select("*")
    .single();

  if (pendingErr) return res.status(500).json({ error: pendingErr.message });

  void emitAdminNotification({
    type: "inventory_change",
    title: "Modification inventaire",
    body: `Nouvelle demande : modification d'offre`,
    data: { establishmentId, changeType: "update_item", targetId: itemId, pendingChangeId: pendingChange?.id },
  });

  res.json({ ok: true, pending: true, pendingChange, message: "Votre demande de modification d'offre a été soumise pour modération." });
};

export const deleteProInventoryItem: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!itemId) return res.status(400).json({ error: "itemId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  // Pro users: submit to moderation queue
  const { data: pendingChange, error: pendingErr } = await supabase
    .from("pro_inventory_pending_changes")
    .insert({
      establishment_id: establishmentId,
      change_type: "delete_item",
      target_id: itemId,
      payload: {},
      submitted_by: userResult.user.id,
    })
    .select("*")
    .single();

  if (pendingErr) return res.status(500).json({ error: pendingErr.message });

  void emitAdminNotification({
    type: "inventory_change",
    title: "Modification inventaire",
    body: `Nouvelle demande : suppression d'offre`,
    data: { establishmentId, changeType: "delete_item", targetId: itemId, pendingChangeId: pendingChange?.id },
  });

  res.json({ ok: true, pending: true, pendingChange, message: "Votre demande de suppression d'offre a été soumise pour modération." });
};

export const greenThumbProInventoryItem: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!itemId) return res.status(400).json({ error: "itemId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase.rpc("increment_pro_inventory_popularity", {
    p_establishment_id: establishmentId,
    p_item_id: itemId,
  });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, popularity: data });
};
