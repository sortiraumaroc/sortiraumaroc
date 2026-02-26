/**
 * Admin Establishments Routes — Establishment CRUD, slots, reservations, QR logs, etc.
 *
 * Extracted from the monolithic admin.ts.
 * Handles listing, creating, updating, and deleting establishments,
 * wizard creation/update, status management, flags, reservations,
 * slots, QR logs, pack billing, conversations, offers, and duplicate detection.
 */

import type { RequestHandler } from "express";
import {
  requireAdminKey,
  isRecord,
  asString,
  asStringArray,
  asJsonObject,
  normalizeEmail,
  generateProvisionalPassword,
  getAdminSupabase,
  getAdminSessionSub,
  getAuditActorInfo,
  emitAdminNotification,
  translateErrorMessage,
} from "./adminHelpers";
import { createModuleLogger } from "../lib/logger";
import {
  ensureEscrowHoldForReservation,
  settleEscrowForReservation,
  ensureInvoiceForReservation,
} from "../finance";
import { recomputeConsumerUserStatsV1 } from "../consumerReliability";
import { transformWizardHoursToOpeningHours } from "../lib/transformHours";
import { triggerWaitlistPromotionForSlot } from "../waitlist";

const log = createModuleLogger("adminEstablishments");

// =============================================================================
// Local types
// =============================================================================

type ReservationRow = {
  id: string;
  booking_reference: string | null;
  establishment_id: string;
  status: string | null;
  payment_status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  party_size: number | null;
  amount_total: number | null;
  amount_deposit: number | null;
  currency: string | null;
  checked_in_at: string | null;
  meta: unknown;
};

type ProConversationRow = {
  id: string;
  establishment_id: string;
  reservation_id: string | null;
  subject: string | null;
  status: string | null;
  updated_at: string | null;
  created_at: string | null;
  meta: unknown;
};

type ProMessageRow = {
  id: string;
  establishment_id: string;
  conversation_id: string;
  from_role: string | null;
  body: string | null;
  sender_user_id: string | null;
  created_at: string | null;
  meta: unknown;
};

type QrScanLogRow = {
  id: string;
  establishment_id: string;
  reservation_id: string | null;
  booking_reference: string | null;
  scanned_at: string | null;
  scanned_by_user_id: string | null;
  holder_name: string | null;
  result: string | null;
  payload: string | null;
};

// =============================================================================
// Local helpers
// =============================================================================

/**
 * Generate a URL-friendly slug from name + city (same logic as public.ts).
 */
function generateEstablishmentSlug(name: string | null, city: string | null): string | null {
  const namePart = (name ?? "").trim();
  const cityPart = (city ?? "").trim();
  if (!namePart) return null;
  let slug = cityPart ? `${namePart}-${cityPart}` : namePart;
  slug = slug.toLowerCase();
  const accentMap: Record<string, string> = {
    'à': 'a', 'â': 'a', 'ä': 'a', 'á': 'a', 'ã': 'a', 'å': 'a', 'æ': 'ae',
    'ç': 'c', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i',
    'î': 'i', 'ï': 'i', 'ñ': 'n', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o',
    'ö': 'o', 'ø': 'o', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ý': 'y',
    'ÿ': 'y', 'œ': 'oe', 'ß': 'ss',
  };
  slug = slug.replace(/[àâäáãåæçèéêëìíîïñòóôõöøùúûüýÿœß]/g, (char) => accentMap[char] || char);
  slug = slug.replace(/[^a-z0-9]+/g, '-');
  slug = slug.replace(/^-+|-+$/g, '');
  slug = slug.replace(/-+/g, '-');
  if (slug.length < 3) {
    slug = slug ? `${slug}-etablissement` : null as any;
  }
  return slug || null;
}

/**
 * Normalise a string for fuzzy comparison:
 * lowercase, trim, remove accents, collapse whitespace, strip common suffixes.
 */
export function normalizeEstName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")          // remove accents
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function computeCompletenessScore(row: Record<string, unknown>): number {
  const fields: Array<{ key: string; weight: number }> = [
    { key: "name", weight: 8 },
    { key: "description_short", weight: 6 },
    { key: "description_long", weight: 8 },
    { key: "address", weight: 6 },
    { key: "city", weight: 4 },
    { key: "postal_code", weight: 3 },
    { key: "region", weight: 3 },
    { key: "phone", weight: 5 },
    { key: "whatsapp", weight: 3 },
    { key: "email", weight: 5 },
    { key: "website", weight: 4 },
    { key: "cover_url", weight: 8 },
    { key: "gallery_urls", weight: 7 },
    { key: "hours", weight: 5 },
    { key: "universe", weight: 3 },
    { key: "subcategory", weight: 3 },
    { key: "lat", weight: 3 },
    { key: "lng", weight: 3 },
    { key: "tags", weight: 3 },
    { key: "amenities", weight: 3 },
    { key: "social_links", weight: 3 },
    { key: "specialties", weight: 3 },
    { key: "ambiance_tags", weight: 2 },
    { key: "service_types", weight: 2 },
  ];

  const totalWeight = fields.reduce((s, f) => s + f.weight, 0);
  let earned = 0;

  for (const f of fields) {
    const v = row[f.key];
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    earned += f.weight;
  }

  return Math.round((earned / totalWeight) * 100);
}

// =============================================================================
// Exported handlers
// =============================================================================

export const searchEstablishmentsByName: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  if (!name || name.length < 2) {
    return res.json({ items: [] });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("establishments")
    .select("id,name,city,status,cover_url")
    .ilike("name", `%${name}%`)
    .order("name", { ascending: true })
    .limit(10);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data ?? [] });
};

export const listEstablishments: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const search =
    typeof req.query.search === "string" ? req.query.search.trim() : "";
  const supabase = getAdminSupabase();

  const selectCols =
    "id,name,city,universe,subcategory,status,created_at,updated_at,verified,premium,curated,admin_created_by_name,admin_updated_by_name,cover_url,is_online";

  // Paginate to fetch all rows (Supabase caps at 1000 per request)
  const PAGE_SIZE = 1000;
  let allItems: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    let q = supabase
      .from("establishments")
      .select(selectCols)
      .order("updated_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    const page = data ?? [];
    allItems = allItems.concat(page);
    hasMore = page.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  // Server-side search: filter by name, city or id (case-insensitive)
  if (search) {
    const lc = search.toLowerCase();
    allItems = allItems.filter((e: any) => {
      const nameVal = String(e.name ?? "").toLowerCase();
      const city = String(e.city ?? "").toLowerCase();
      const id = String(e.id ?? "").toLowerCase();
      return nameVal.includes(lc) || city.includes(lc) || id === lc;
    });
  }

  res.json({ items: allItems });
};

export const createEstablishment: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const payload = isRecord(req.body) ? req.body : {};

  const name = asString(payload.name);
  const city = asString(payload.city);
  const universe = asString(payload.universe);

  const ownerEmailRaw = asString(payload.owner_email);
  const ownerEmail = ownerEmailRaw ? normalizeEmail(ownerEmailRaw) : "";

  if (!name) return res.status(400).json({ error: "Nom requis" });
  if (!city) return res.status(400).json({ error: "Ville requise" });
  if (!ownerEmail || !ownerEmail.includes("@"))
    return res.status(400).json({ error: "Email du propriétaire requis" });

  const supabase = getAdminSupabase();

  const provisionalPassword = generateProvisionalPassword();

  const { data: createdUser, error: createUserErr } =
    await supabase.auth.admin.createUser({
      email: ownerEmail,
      password: provisionalPassword,
      email_confirm: true,
    });

  if (createUserErr || !createdUser.user) {
    return res.status(400).json({
      error: translateErrorMessage(createUserErr?.message) ?? "Impossible de créer l'utilisateur",
    });
  }

  const ownerUserId = createdUser.user.id;

  const extra = (() => {
    const base = asJsonObject(payload.extra);
    const contactName = asString(payload.contact_name);
    const contactPhone = asString(payload.contact_phone);
    const merged: Record<string, unknown> = { ...(base ?? {}) };
    if (contactName) merged.contact_name = contactName;
    if (contactPhone) merged.contact_phone = contactPhone;
    merged.admin_created = true;
    merged.owner_email = ownerEmail;
    return Object.keys(merged).length ? merged : undefined;
  })();

  const insertPayload: Record<string, unknown> = {
    name,
    city,
    universe: universe ?? null,
    subcategory: (universe ?? null) as any,
    status: "active",
    is_online: true,
    verified: false,
    created_by: ownerUserId,
  };

  if (extra) insertPayload.extra = extra;

  const { data: createdEst, error: createEstErr } = await supabase
    .from("establishments")
    .insert(insertPayload)
    .select("*")
    .single();

  if (createEstErr || !createdEst) {
    await supabase.auth.admin.deleteUser(ownerUserId);
    return res.status(500).json({
      error: createEstErr?.message ?? "Impossible de créer l'établissement",
    });
  }

  const establishmentId = (createdEst as any)?.id as string | undefined;

  const { error: membershipErr } = await supabase
    .from("pro_establishment_memberships")
    .insert({
      establishment_id: establishmentId,
      user_id: ownerUserId,
      role: "owner",
    });

  if (membershipErr) {
    await supabase.from("establishments").delete().eq("id", establishmentId);
    await supabase.auth.admin.deleteUser(ownerUserId);
    return res.status(500).json({ error: membershipErr.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "establishment.create",
    entity_type: "establishment",
    entity_id: establishmentId ?? null,
    metadata: {
      name,
      city,
      universe: universe ?? null,
      status: "active",
      owner_email: ownerEmail,
      owner_user_id: ownerUserId,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({
    item: createdEst,
    owner: {
      email: ownerEmail,
      user_id: ownerUserId,
      temporary_password: provisionalPassword,
    },
  });
};

/**
 * POST /api/admin/establishments/wizard
 * Create an establishment via the admin wizard (7 steps).
 */
export const createEstablishmentWizard: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const payload = isRecord(req.body) ? req.body : {};

  // Step 1 — Identity
  const name = asString(payload.name);
  const universeRaw = asString(payload.universe);
  // Map UI universe values to valid DB enum (booking_kind) values
  const UNIVERSE_TO_DB: Record<string, string> = {
    restaurants: "restaurant",
    restaurant: "restaurant",
    loisirs: "loisir",
    loisir: "loisir",
    sport: "loisir",
    hebergement: "hebergement",
    hotels: "hebergement",
    hotel: "hebergement",
    wellness: "wellness",
    culture: "culture",
    shopping: "loisir",
    rentacar: "loisir",
  };
  const universe = universeRaw
    ? UNIVERSE_TO_DB[universeRaw.toLowerCase()] ?? universeRaw
    : undefined;
  const category = asString(payload.category);
  const subcategory = asString(payload.subcategory);
  const specialties = asStringArray(payload.specialties);

  // Step 2 — Location
  const country = asString(payload.country) ?? "Maroc";
  const region = asString(payload.region);
  const city = asString(payload.city);
  const postal_code = asString(payload.postal_code);
  const neighborhood = asString(payload.neighborhood);
  const address = asString(payload.address);
  const lat = typeof payload.lat === "number" ? payload.lat : undefined;
  const lng = typeof payload.lng === "number" ? payload.lng : undefined;

  // Step 3 — Contact
  const phone = asString(payload.phone);
  const whatsapp = asString(payload.whatsapp);
  const booking_email = asString(payload.booking_email);
  const google_maps_url = asString(payload.google_maps_link);
  const website = asString(payload.website);
  const ownerEmailRaw = asString(payload.owner_email);
  const ownerEmail = ownerEmailRaw ? normalizeEmail(ownerEmailRaw) : "";

  // Step 4 — Descriptions
  const description_short = asString(payload.short_description);
  const description_long = asString(payload.long_description);

  // Step 6 — Hours
  // Transform wizard DaySchedule format to openingHours format for OpeningHoursBlock
  const rawHours = isRecord(payload.hours) ? payload.hours : undefined;
  const hours = rawHours
    ? transformWizardHoursToOpeningHours(rawHours as Record<string, unknown>)
    : undefined;

  // Step 7 — Tags & extras
  const ambiance_tags = asStringArray(payload.ambiance_tags);
  const service_types = asStringArray(payload.service_types);
  const general_tags = asStringArray(payload.general_tags);
  const amenities = asStringArray(payload.amenities);
  const highlights = asStringArray(payload.highlights);
  const social_links = isRecord(payload.social_links) ? payload.social_links : undefined;

  // Validation
  if (!name || name.length < 2) return res.status(400).json({ error: "Le nom doit contenir au moins 2 caractères" });
  if (!universe) return res.status(400).json({ error: "L'univers est requis" });
  if (!city) return res.status(400).json({ error: "La ville est requise" });
  if (!address) return res.status(400).json({ error: "L'adresse est requise" });
  if (!phone) return res.status(400).json({ error: "Le téléphone est requis" });

  const supabase = getAdminSupabase();

  // Create owner user only if owner email is provided
  let ownerUserId: string | null = null;
  let provisionalPassword: string | null = null;

  if (ownerEmail && ownerEmail.includes("@")) {
    provisionalPassword = generateProvisionalPassword();
    const { data: createdUser, error: createUserErr } =
      await supabase.auth.admin.createUser({
        email: ownerEmail,
        password: provisionalPassword,
        email_confirm: true,
      });

    if (createUserErr || !createdUser.user) {
      return res.status(400).json({
        error: translateErrorMessage(createUserErr?.message) ?? "Impossible de créer l'utilisateur",
      });
    }

    ownerUserId = createdUser.user.id;
  }

  // Get admin actor info for "Created by" tracking
  const actor = getAuditActorInfo(req);

  // Store general_tags in tags, highlights in separate column
  const insertPayload: Record<string, unknown> = {
    name,
    universe: universe ?? null,
    category: category ?? null,
    subcategory: subcategory ?? null,
    specialties: specialties ?? [],
    country,
    region: region ?? null,
    city,
    postal_code: postal_code ?? null,
    neighborhood: neighborhood ?? null,
    address,
    lat: lat ?? null,
    lng: lng ?? null,
    phone: phone ?? null,
    whatsapp: whatsapp ?? null,
    email: booking_email ?? null,
    google_maps_url: google_maps_url ?? null,
    website: website ?? null,
    description_short: description_short ?? null,
    description_long: description_long ?? null,
    hours: hours ?? null,
    tags: general_tags && general_tags.length > 0 ? general_tags : null,
    highlights: highlights && highlights.length > 0 ? highlights : null,
    amenities: amenities ?? null,
    ambiance_tags: ambiance_tags ?? null,
    service_types: service_types ?? null,
    social_links: social_links ?? null,
    status: "active",
    is_online: true,
    verified: false,
    created_by: ownerUserId ?? actor.actor_id ?? null,
    admin_created_by_name: actor.actor_name ?? null,
    admin_created_by_id: actor.actor_id ?? null,
    extra: {
      admin_created: true,
      ...(ownerEmail ? { owner_email: ownerEmail } : {}),
    },
  };

  const { data: createdEst, error: createEstErr } = await supabase
    .from("establishments")
    .insert(insertPayload)
    .select("*")
    .single();

  if (createEstErr || !createdEst) {
    if (ownerUserId) await supabase.auth.admin.deleteUser(ownerUserId);
    return res.status(500).json({
      error: createEstErr?.message ?? "Impossible de créer l'établissement",
    });
  }

  const establishmentId = (createdEst as any)?.id as string | undefined;

  // Generate and save slug
  if (establishmentId && name) {
    let slug = generateEstablishmentSlug(name, city);
    if (slug) {
      const { data: existing } = await supabase
        .from("establishments").select("id").eq("slug", slug).neq("id", establishmentId).limit(1);
      if (existing && existing.length > 0) {
        let counter = 2;
        let candidate = `${slug}-${counter}`;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data: check } = await supabase
            .from("establishments").select("id").eq("slug", candidate).limit(1);
          if (!check || check.length === 0) break;
          counter++;
          candidate = `${slug}-${counter}`;
        }
        slug = candidate;
      }
      await supabase.from("establishments").update({ slug }).eq("id", establishmentId);
    }
  }

  // Create membership only if owner user was created
  if (ownerUserId) {
    const { error: membershipErr } = await supabase
      .from("pro_establishment_memberships")
      .insert({
        establishment_id: establishmentId,
        user_id: ownerUserId,
        role: "owner",
      });

    if (membershipErr) {
      await supabase.from("establishments").delete().eq("id", establishmentId);
      await supabase.auth.admin.deleteUser(ownerUserId);
      return res.status(500).json({ error: membershipErr.message });
    }
  }

  // Audit log
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "establishment.wizard_create",
    entity_type: "establishment",
    entity_id: establishmentId ?? null,
    metadata: {
      name,
      city,
      universe: universe ?? null,
      status: "pending",
      owner_email: ownerEmail,
      owner_user_id: ownerUserId,
      actor_email: actor.actor_email,
      actor_name: actor.actor_name,
      actor_role: actor.actor_role,
      wizard: true,
    },
  });

  res.json({
    item: createdEst,
    owner: {
      email: ownerEmail,
      user_id: ownerUserId,
      temporary_password: provisionalPassword,
    },
  });
};

/**
 * PATCH /api/admin/establishments/wizard/:id
 * Update an existing establishment via the admin wizard (7 steps).
 */
export const updateEstablishmentWizard: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId = typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId) return res.status(400).json({ error: "ID établissement requis" });

  const payload = isRecord(req.body) ? req.body : {};

  // Step 1 — Identity
  const name = asString(payload.name);
  const universeRaw = asString(payload.universe);
  const UNIVERSE_TO_DB: Record<string, string> = {
    restaurants: "restaurant",
    restaurant: "restaurant",
    loisirs: "loisir",
    loisir: "loisir",
    sport: "loisir",
    hebergement: "hebergement",
    hotels: "hebergement",
    hotel: "hebergement",
    wellness: "wellness",
    culture: "culture",
    shopping: "loisir",
    rentacar: "loisir",
  };
  const universe = universeRaw
    ? UNIVERSE_TO_DB[universeRaw.toLowerCase()] ?? universeRaw
    : undefined;
  const category = asString(payload.category);
  const subcategory = asString(payload.subcategory);
  const specialties = asStringArray(payload.specialties);

  // Step 2 — Location
  const country = asString(payload.country) ?? "Maroc";
  const region = asString(payload.region);
  const city = asString(payload.city);
  const postal_code = asString(payload.postal_code);
  const neighborhood = asString(payload.neighborhood);
  const address = asString(payload.address);
  const lat = typeof payload.lat === "number" ? payload.lat : undefined;
  const lng = typeof payload.lng === "number" ? payload.lng : undefined;

  // Step 3 — Contact
  const phone = asString(payload.phone);
  const whatsapp = asString(payload.whatsapp);
  const booking_email = asString(payload.booking_email);
  const google_maps_url = asString(payload.google_maps_link);
  const website = asString(payload.website);

  // Step 4 — Descriptions
  const description_short = asString(payload.short_description);
  const description_long = asString(payload.long_description);

  // Step 6 — Hours
  const rawHours = isRecord(payload.hours) ? payload.hours : undefined;
  const hours = rawHours
    ? transformWizardHoursToOpeningHours(rawHours as Record<string, unknown>)
    : undefined;

  // Step 7 — Tags & extras
  const ambiance_tags = asStringArray(payload.ambiance_tags);
  const service_types = asStringArray(payload.service_types);
  const general_tags = asStringArray(payload.general_tags);
  const highlights = asStringArray(payload.highlights);
  const amenities = asStringArray(payload.amenities);
  const social_links = isRecord(payload.social_links) ? payload.social_links : undefined;

  // Validation
  if (!name || name.length < 2) return res.status(400).json({ error: "Le nom doit contenir au moins 2 caractères" });

  const supabase = getAdminSupabase();

  // Verify establishment exists
  const { data: existing, error: fetchErr } = await supabase
    .from("establishments")
    .select("id, name")
    .eq("id", establishmentId)
    .single();
  if (fetchErr || !existing) return res.status(404).json({ error: "Établissement non trouvé" });

  // Store general_tags in tags, highlights in separate column
  const actor = getAuditActorInfo(req);

  const updatePayload: Record<string, unknown> = {
    name,
    ...(universe ? { universe } : {}),
    ...(category ? { category } : {}),
    ...(subcategory ? { subcategory } : {}),
    specialties: specialties ?? [],
    country,
    ...(region ? { region } : {}),
    ...(city ? { city } : {}),
    ...(postal_code ? { postal_code } : {}),
    ...(neighborhood ? { neighborhood } : {}),
    ...(address ? { address } : {}),
    ...(lat != null ? { lat } : {}),
    ...(lng != null ? { lng } : {}),
    ...(phone ? { phone } : {}),
    ...(whatsapp ? { whatsapp } : {}),
    ...(booking_email ? { email: booking_email } : {}),
    ...(google_maps_url ? { google_maps_url } : {}),
    ...(website ? { website } : {}),
    ...(description_short ? { description_short } : {}),
    ...(description_long ? { description_long } : {}),
    ...(hours ? { hours } : {}),
    ...(general_tags && general_tags.length > 0 ? { tags: general_tags } : {}),
    ...(highlights && highlights.length > 0 ? { highlights } : {}),
    ...(amenities ? { amenities } : {}),
    ...(ambiance_tags ? { ambiance_tags } : {}),
    ...(service_types ? { service_types } : {}),
    ...(social_links ? { social_links } : {}),
    admin_updated_by_name: actor.actor_name ?? null,
    admin_updated_by_id: actor.actor_id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: updatedEst, error: updateErr } = await supabase
    .from("establishments")
    .update(updatePayload)
    .eq("id", establishmentId)
    .select("*")
    .single();

  if (updateErr) {
    return res.status(500).json({ error: updateErr.message });
  }

  // Update slug if name changed
  if (name !== existing.name && name && city) {
    let slug = generateEstablishmentSlug(name, city);
    if (slug) {
      const { data: slugExisting } = await supabase
        .from("establishments").select("id").eq("slug", slug).neq("id", establishmentId).limit(1);
      if (slugExisting?.length) {
        let counter = 2;
        let candidate = `${slug}-${counter}`;
        while (true) {
          const { data: check } = await supabase.from("establishments").select("id").eq("slug", candidate).limit(1);
          if (!check?.length) break;
          counter++;
          candidate = `${slug}-${counter}`;
        }
        slug = candidate;
      }
      await supabase.from("establishments").update({ slug }).eq("id", establishmentId);
    }
  }

  // Audit log
  await supabase.from("audit_logs").insert({
    action: "establishment.wizard_update",
    actor_id: actor.actor_id,
    actor_name: actor.actor_name,
    actor_role: actor.actor_role,
    entity_type: "establishment",
    entity_id: establishmentId,
    metadata: { name, city, universe },
  });

  res.json({ item: updatedEst });
};

export const getEstablishment: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("establishments")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return res.status(404).json({ error: error.message });

  res.json({ item: data });
};

/**
 * DELETE /api/admin/establishments/:id
 * Delete an establishment (admin or superadmin only)
 */
export const deleteEstablishment: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  // Only superadmin and admin can delete establishments
  const session = (req as any).adminSession;
  if (session && session.role !== "superadmin" && session.role !== "admin") {
    return res.status(403).json({ error: "Seuls les administrateurs peuvent supprimer des établissements" });
  }

  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "ID établissement requis" });

  const supabase = getAdminSupabase();

  // Verify establishment exists
  const { data: existing, error: fetchErr } = await supabase
    .from("establishments")
    .select("id, name, status")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return res.status(404).json({ error: "Établissement non trouvé" });
  }

  // Delete related data (cascade or manually if no CASCADE)
  // Note: If FKs have ON DELETE CASCADE, this will be automatic

  // Delete memberships
  await supabase
    .from("pro_establishment_memberships")
    .delete()
    .eq("establishment_id", id);

  // Delete the establishment
  const { error: deleteErr } = await supabase
    .from("establishments")
    .delete()
    .eq("id", id);

  if (deleteErr) {
    return res.status(500).json({ error: deleteErr.message });
  }

  // Audit log
  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "establishment.delete",
    entity_type: "establishment",
    entity_id: id,
    metadata: {
      name: existing.name,
      status: existing.status,
      deleted_at: new Date().toISOString(),
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({ ok: true });
};

export const updateEstablishmentStatus: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = req.params.id;
  const status = typeof req.body?.status === "string" ? req.body.status : null;

  if (!status) return res.status(400).json({ error: "Statut requis" });

  const supabase = getAdminSupabase();
  const actor = getAuditActorInfo(req);
  const { error } = await supabase
    .from("establishments")
    .update({
      status,
      admin_updated_by_name: actor.actor_name ?? null,
      admin_updated_by_id: actor.actor_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "establishment.status",
    entity_type: "establishment",
    entity_id: id,
    metadata: { status, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

/**
 * POST /api/admin/establishments/batch-status
 * Batch update the status of multiple establishments.
 */
export const batchUpdateEstablishmentStatus: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((v: unknown) => typeof v === "string" && v.trim()) : [];
  const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";

  if (!ids.length) return res.status(400).json({ error: "ids[] requis (au moins un)" });
  if (!status) return res.status(400).json({ error: "status requis" });

  const allowed = ["active", "pending", "suspended", "rejected"];
  if (!allowed.includes(status)) return res.status(400).json({ error: `Statut invalide. Valeurs acceptées : ${allowed.join(", ")}` });

  const supabase = getAdminSupabase();
  const actor = getAuditActorInfo(req);
  const { error, count } = await supabase
    .from("establishments")
    .update({
      status,
      admin_updated_by_name: actor.actor_name ?? null,
      admin_updated_by_id: actor.actor_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (error) return res.status(500).json({ error: error.message });

  // Audit log for each establishment
  for (const id of ids) {
    await supabase.from("admin_audit_log").insert({
      actor_id: actor.actor_id,
      action: "establishment.batch_status",
      entity_type: "establishment",
      entity_id: id,
      metadata: { status, batch_size: ids.length, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
    });
  }

  res.json({ ok: true, updated: count ?? ids.length });
};

export const updateEstablishmentFlags: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = req.params.id;
  const body = req.body ?? {};

  // Extract boolean flags
  const updates: Record<string, boolean> = {};
  if (typeof body.verified === "boolean") updates.verified = body.verified;
  if (typeof body.premium === "boolean") updates.premium = body.premium;
  if (typeof body.curated === "boolean") updates.curated = body.curated;

  // is_online: superadmin only
  if (typeof body.is_online === "boolean") {
    const actor = getAuditActorInfo(req);
    if (actor.actor_role !== "superadmin") {
      return res.status(403).json({ error: "Seul le superadmin peut modifier le statut en ligne." });
    }
    updates.is_online = body.is_online;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Aucun flag à mettre à jour" });
  }

  const supabase = getAdminSupabase();
  const actor = getAuditActorInfo(req);
  const { error } = await supabase
    .from("establishments")
    .update({
      ...updates,
      admin_updated_by_name: actor.actor_name ?? null,
      admin_updated_by_id: actor.actor_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "establishment.flags",
    entity_type: "establishment",
    entity_id: id,
    metadata: { ...updates, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

export const listAdminEstablishmentReservations: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("starts_at", { ascending: false })
    .limit(300);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as ReservationRow[] });
};

export const updateAdminEstablishmentReservation: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  const reservationId =
    typeof req.params.reservationId === "string"
      ? req.params.reservationId
      : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });
  if (!reservationId)
    return res.status(400).json({ error: "Identifiant de réservation requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const statusRaw = asString(req.body.status);
  const paymentStatusRaw = asString(req.body.payment_status);
  const checkedInAtRaw = asString(req.body.checked_in_at);
  const startsAtRaw =
    asString(req.body.starts_at) ?? asString(req.body.startsAt);

  const metaDeleteKeysRaw = Array.isArray(req.body.meta_delete_keys)
    ? req.body.meta_delete_keys
    : Array.isArray(req.body.metaDeleteKeys)
      ? req.body.metaDeleteKeys
      : null;

  const patch: Record<string, unknown> = {};

  if (statusRaw) {
    const allowedStatuses = new Set([
      "requested",
      "pending_pro_validation",
      "confirmed",
      "refused",
      "waitlist",
      "cancelled",
      "cancelled_user",
      "cancelled_pro",
      "noshow",
    ]);
    if (!allowedStatuses.has(statusRaw))
      return res.status(400).json({ error: "status invalide" });
    patch.status = statusRaw;
  }

  if (paymentStatusRaw) {
    const allowedPayment = new Set(["pending", "paid", "refunded"]);
    if (!allowedPayment.has(paymentStatusRaw))
      return res.status(400).json({ error: "payment_status invalide" });
    patch.payment_status = paymentStatusRaw;
  }

  if (checkedInAtRaw !== undefined) {
    if (checkedInAtRaw === "") {
      patch.checked_in_at = null;
    } else {
      const d = new Date(checkedInAtRaw);
      if (!Number.isFinite(d.getTime()))
        return res.status(400).json({ error: "checked_in_at invalide" });
      patch.checked_in_at = d.toISOString();
    }
  }

  if (startsAtRaw !== undefined) {
    if (!startsAtRaw)
      return res.status(400).json({ error: "starts_at invalide" });
    const d = new Date(startsAtRaw);
    if (!Number.isFinite(d.getTime()))
      return res.status(400).json({ error: "starts_at invalide" });
    patch.starts_at = d.toISOString();
  }

  const supabase = getAdminSupabase();

  const { data: existingData, error: existingErr } = await supabase
    .from("reservations")
    .select(
      "payment_status, status, slot_id, party_size, meta, starts_at, amount_deposit, user_id, checked_in_at",
    )
    .eq("id", reservationId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (!existingData)
    return res.status(404).json({ error: "reservation introuvable" });

  const existing = existingData as any;

  const previousPaymentStatus = String(existing.payment_status ?? "");
  const previousStatus = String(existing.status ?? "");
  const slotId =
    typeof existing.slot_id === "string"
      ? String(existing.slot_id)
      : null;
  const consumerUserId =
    typeof existing.user_id === "string"
      ? String(existing.user_id).trim()
      : "";
  const previousCheckedInAt =
    typeof existing.checked_in_at === "string"
      ? String(existing.checked_in_at).trim()
      : "";

  const metaBaseRaw = existing.meta;
  const metaBase =
    metaBaseRaw &&
    typeof metaBaseRaw === "object" &&
    metaBaseRaw !== null &&
    !Array.isArray(metaBaseRaw)
      ? (metaBaseRaw as Record<string, unknown>)
      : {};
  const nextMeta = { ...metaBase };

  const allowedMetaKeys = new Set([
    "modification_requested",
    "requested_change",
    "proposed_change",
  ]);

  if (metaDeleteKeysRaw) {
    for (const kRaw of metaDeleteKeysRaw) {
      const k = typeof kRaw === "string" ? kRaw : "";
      if (!k || !allowedMetaKeys.has(k)) continue;
      delete nextMeta[k];
    }

    // Only set meta if something changed (avoid noisy writes)
    if (Object.keys(nextMeta).length !== Object.keys(metaBase).length) {
      patch.meta = nextMeta;
    }
  }

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const { error } = await supabase
    .from("reservations")
    .update(patch)
    .eq("id", reservationId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "reservation.update",
    entity_type: "reservation",
    entity_id: reservationId,
    metadata: { establishment_id: establishmentId, patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  if (paymentStatusRaw && paymentStatusRaw !== previousPaymentStatus) {
    await supabase.from("system_logs").insert({
      actor_user_id: null,
      actor_role: "admin",
      action: "reservation.payment_status_changed",
      entity_type: "reservation",
      entity_id: reservationId,
      payload: {
        establishment_id: establishmentId,
        previous_payment_status: previousPaymentStatus,
        new_payment_status: paymentStatusRaw,
      },
    });

    try {
      const title =
        paymentStatusRaw === "paid"
          ? "Paiement reçu"
          : paymentStatusRaw === "refunded"
            ? "Paiement remboursé"
            : "Paiement en attente";

      const { data: memberships } = await supabase
        .from("pro_establishment_memberships")
        .select("user_id")
        .eq("establishment_id", establishmentId)
        .limit(5000);

      const userIds = new Set<string>();
      for (const row of (memberships ?? []) as Array<{ user_id?: unknown }>) {
        const uid = isRecord(row) ? asString(row.user_id) : null;
        if (uid) userIds.add(uid);
      }

      const out = Array.from(userIds).map((user_id) => ({
        user_id,
        establishment_id: establishmentId,
        category: "billing",
        title,
        body: `Réservation ${reservationId} · ${previousPaymentStatus} → ${paymentStatusRaw}`,
        data: {
          reservationId,
          action: "payment_status_changed",
          previous: previousPaymentStatus,
          next: paymentStatusRaw,
        },
      }));

      if (out.length) await supabase.from("pro_notifications").insert(out);
    } catch (err) {
      log.warn({ err }, "pro notification insert failed");
    }
  }

  // Finance pipeline (escrow/ledger)
  try {
    const financeActor = { userId: null, role: "admin" };

    if (
      paymentStatusRaw &&
      paymentStatusRaw !== previousPaymentStatus &&
      paymentStatusRaw === "paid"
    ) {
      await ensureEscrowHoldForReservation({ reservationId, actor: financeActor });
      await ensureInvoiceForReservation({ reservationId, actor: financeActor });
    }

    const cancelStatuses = new Set([
      "cancelled",
      "cancelled_user",
      "cancelled_pro",
      "refused",
      "waitlist",
    ]);

    const existingDepositCents =
      typeof existing.amount_deposit === "number" &&
      Number.isFinite(existing.amount_deposit)
        ? Math.max(0, Math.round(existing.amount_deposit))
        : 0;

    const computeCancelRefundPercent = async (): Promise<number> => {
      const defaults = {
        free_cancellation_hours: 24,
        cancellation_penalty_percent: 50,
      };

      let freeHours = defaults.free_cancellation_hours;
      let penaltyPct = defaults.cancellation_penalty_percent;

      try {
        const { data: policyRow } = await supabase
          .from("booking_policies")
          .select("free_cancellation_hours,cancellation_penalty_percent")
          .eq("establishment_id", establishmentId)
          .maybeSingle();

        if (typeof (policyRow as any)?.free_cancellation_hours === "number") {
          freeHours = Math.max(
            0,
            Math.round((policyRow as any).free_cancellation_hours),
          );
        }

        if (
          typeof (policyRow as any)?.cancellation_penalty_percent === "number"
        ) {
          penaltyPct = Math.min(
            100,
            Math.max(
              0,
              Math.round((policyRow as any).cancellation_penalty_percent),
            ),
          );
        }
      } catch (err) {
        log.warn({ err }, "fetch cancellation policy failed");
      }

      const startsAtIso =
        typeof existing.starts_at === "string"
          ? String(existing.starts_at)
          : "";
      const startsAt = startsAtIso ? new Date(startsAtIso) : null;
      const hoursToStart =
        startsAt && Number.isFinite(startsAt.getTime())
          ? (startsAt.getTime() - Date.now()) / (1000 * 60 * 60)
          : Number.POSITIVE_INFINITY;

      return hoursToStart >= freeHours ? 100 : Math.max(0, 100 - penaltyPct);
    };

    const computeNoShowRefundPercent = async (): Promise<number> => {
      const defaults = {
        no_show_penalty_percent: 100,
        no_show_always_100_guaranteed: true,
      };

      let penaltyPct = defaults.no_show_penalty_percent;
      let always100Guaranteed = defaults.no_show_always_100_guaranteed;

      try {
        const { data: policyRow } = await supabase
          .from("booking_policies")
          .select("no_show_penalty_percent,no_show_always_100_guaranteed")
          .eq("establishment_id", establishmentId)
          .maybeSingle();

        if (typeof (policyRow as any)?.no_show_penalty_percent === "number") {
          penaltyPct = Math.min(
            100,
            Math.max(0, Math.round((policyRow as any).no_show_penalty_percent)),
          );
        }

        if (
          typeof (policyRow as any)?.no_show_always_100_guaranteed === "boolean"
        ) {
          always100Guaranteed = (policyRow as any)
            .no_show_always_100_guaranteed;
        }
      } catch (err) {
        log.warn({ err }, "fetch noshow policy failed");
      }

      if (always100Guaranteed && existingDepositCents > 0) penaltyPct = 100;

      return Math.max(0, 100 - penaltyPct);
    };

    if (
      paymentStatusRaw &&
      paymentStatusRaw !== previousPaymentStatus &&
      paymentStatusRaw === "refunded"
    ) {
      // Explicit refund => always full refund.
      await settleEscrowForReservation({
        reservationId,
        actor: financeActor,
        reason: "cancel",
        refundPercent: 100,
      });
    }

    if (statusRaw && cancelStatuses.has(statusRaw)) {
      const refundPercentForCancel = statusRaw.startsWith("cancelled")
        ? await computeCancelRefundPercent()
        : 100;
      await settleEscrowForReservation({
        reservationId,
        actor: financeActor,
        reason: "cancel",
        refundPercent: refundPercentForCancel,
      });
    }

    if (statusRaw === "noshow") {
      const refundPercentForNoShow = await computeNoShowRefundPercent();
      await settleEscrowForReservation({
        reservationId,
        actor: financeActor,
        reason: "noshow",
        refundPercent: refundPercentForNoShow,
      });
    }

    if (checkedInAtRaw && checkedInAtRaw !== "") {
      await settleEscrowForReservation({
        reservationId,
        actor: financeActor,
        reason: "checkin",
      });
    }
  } catch (e) {
    log.error({ err: e }, "finance pipeline failed (admin.updateReservation)");
  }

  // NEW: auto-promotion waitlist logic
  try {
    const occupancy = new Set([
      "confirmed",
      "pending_pro_validation",
      "requested",
    ]);
    const prevOccupies = occupancy.has(previousStatus);

    const nextStatus = statusRaw ? statusRaw : previousStatus;
    const nextOccupies = occupancy.has(nextStatus);

    if (slotId && prevOccupies && !nextOccupies) {
      void triggerWaitlistPromotionForSlot({
        supabase: supabase as any,
        slotId,
        actorRole: "admin",
        actorUserId: null,
        reason: "admin_update_freed_capacity",
      });
    }
  } catch (err) {
    log.warn({ err }, "waitlist promotion trigger failed");
  }

  // Reliability stats (v1): recompute after a no-show or a first check-in.
  // Best-effort: do not block admin operations.
  try {
    const nextCheckedInAt = Object.prototype.hasOwnProperty.call(
      patch,
      "checked_in_at",
    )
      ? (patch as any).checked_in_at
      : null;
    const hasFirstCheckin = !!nextCheckedInAt && !previousCheckedInAt;

    const shouldRecompute =
      !!consumerUserId &&
      ((statusRaw && statusRaw !== previousStatus && statusRaw === "noshow") ||
        hasFirstCheckin);

    if (shouldRecompute) {
      await recomputeConsumerUserStatsV1({ supabase, userId: consumerUserId });
    }
  } catch (err) {
    log.warn({ err }, "recompute consumer stats failed");
  }

  res.json({ ok: true });
};

/**
 * PUT /api/admin/establishments/:id/slots/upsert
 * Create or update slots for an establishment (admin version).
 * Body: { slots: Array<{ starts_at, ends_at, capacity, base_price?, service_label?, active? }> }
 */
export const adminUpsertSlots: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId = typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId) return res.status(400).json({ error: "Identifiant requis" });

  if (!Array.isArray(req.body?.slots) || !req.body.slots.length) {
    return res.status(400).json({ error: "slots array is required" });
  }

  const supabase = getAdminSupabase();
  const rawSlots = req.body.slots as unknown[];
  const rows: Record<string, unknown>[] = [];

  for (const raw of rawSlots) {
    if (typeof raw !== "object" || raw === null) return res.status(400).json({ error: "Invalid slot" });
    const r = raw as Record<string, unknown>;

    const startsRaw = typeof r.starts_at === "string" ? r.starts_at.trim() : "";
    const endsRaw = typeof r.ends_at === "string" ? r.ends_at.trim() : "";
    const capacity = typeof r.capacity === "number" ? r.capacity : NaN;

    if (!startsRaw || !endsRaw) return res.status(400).json({ error: "starts_at/ends_at are required" });

    const startsMs = Date.parse(startsRaw);
    const endsMs = Date.parse(endsRaw);
    if (!Number.isFinite(startsMs) || !Number.isFinite(endsMs)) {
      return res.status(400).json({ error: "starts_at/ends_at are invalid ISO datetimes" });
    }
    if (endsMs <= startsMs) {
      return res.status(400).json({ error: "ends_at must be after starts_at" });
    }
    if (!Number.isFinite(capacity) || capacity <= 0) {
      return res.status(400).json({ error: "capacity must be > 0" });
    }

    rows.push({
      establishment_id: establishmentId,
      starts_at: new Date(startsMs).toISOString(),
      ends_at: new Date(endsMs).toISOString(),
      capacity: Math.max(1, Math.round(capacity)),
      base_price: r.base_price == null ? null : Math.max(0, Math.round(Number(r.base_price) || 0)),
      promo_type: r.promo_type == null ? null : String(r.promo_type),
      promo_value: r.promo_value == null ? null : Math.max(0, Math.round(Number(r.promo_value) || 0)),
      promo_label: r.promo_label == null ? null : String(r.promo_label),
      service_label: r.service_label == null ? null : String(r.service_label),
      active: r.active === false ? false : true,
    });
  }

  const { error } = await supabase.from("pro_slots").upsert(rows, { onConflict: "establishment_id,starts_at" });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, upserted: rows.length });
};

/**
 * DELETE /api/admin/establishments/:id/slots/:slotId
 * Delete a single slot for an establishment (admin version).
 * If the slot has reservations (FK constraint), deactivate it instead.
 */
export const adminDeleteSlot: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId = typeof req.params.id === "string" ? req.params.id : "";
  const slotId = typeof req.params.slotId === "string" ? req.params.slotId : "";
  if (!establishmentId || !slotId) return res.status(400).json({ error: "establishmentId and slotId are required" });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("pro_slots").delete().eq("id", slotId).eq("establishment_id", establishmentId);

  if (error) {
    // FK violation → slot has reservations, deactivate instead
    if (error.code === "23503" || error.message?.includes("foreign key")) {
      const { error: upErr } = await supabase
        .from("pro_slots")
        .update({ active: false })
        .eq("id", slotId)
        .eq("establishment_id", establishmentId);
      if (upErr) return res.status(500).json({ error: upErr.message });
      return res.json({ ok: true, deactivated: true });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true });
};

/**
 * DELETE /api/admin/establishments/:id/slots/bulk
 * Delete multiple slots at once for an establishment (admin version).
 * Slots with reservations (FK constraint) are deactivated instead of deleted.
 */
export const adminBulkDeleteSlots: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId = typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const slotIds = Array.isArray(req.body?.slotIds) ? req.body.slotIds : [];
  const validIds = slotIds.filter((id: unknown) => typeof id === "string" && id.trim());
  if (!validIds.length) return res.status(400).json({ error: "slotIds array is required" });

  const supabase = getAdminSupabase();

  // Try to delete all at once
  const { error, count } = await supabase
    .from("pro_slots")
    .delete({ count: "exact" })
    .in("id", validIds)
    .eq("establishment_id", establishmentId);

  if (!error) {
    return res.json({ ok: true, deleted: count ?? validIds.length, deactivated: 0 });
  }

  // FK violation → some slots have reservations.
  // Fall back to one-by-one: delete if possible, deactivate otherwise.
  if (error.code === "23503" || error.message?.includes("foreign key")) {
    let deleted = 0;
    let deactivated = 0;

    for (const id of validIds) {
      const { error: delErr } = await supabase
        .from("pro_slots")
        .delete()
        .eq("id", id)
        .eq("establishment_id", establishmentId);

      if (!delErr) {
        deleted++;
      } else if (delErr.code === "23503" || delErr.message?.includes("foreign key")) {
        const { error: upErr } = await supabase
          .from("pro_slots")
          .update({ active: false })
          .eq("id", id)
          .eq("establishment_id", establishmentId);
        if (!upErr) deactivated++;
      }
    }

    return res.json({ ok: true, deleted, deactivated });
  }

  return res.status(500).json({ error: error.message });
};

/**
 * GET /api/admin/ftour-slots
 * List all Ftour-type slots across all establishments, with establishment info.
 * Query params: ?from=ISO&to=ISO (optional date range filter)
 */
export const listAdminFtourSlots: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();

    let query = supabase
      .from("pro_slots")
      .select("*, establishments!inner(id, name, city)")
      .eq("service_label", "Ftour")
      .eq("active", true)
      .order("starts_at", { ascending: true })
      .limit(2000);

    if (typeof req.query.from === "string" && req.query.from) {
      query = query.gte("starts_at", req.query.from);
    }
    if (typeof req.query.to === "string" && req.query.to) {
      query = query.lte("starts_at", req.query.to);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true, slots: data ?? [] });
  } catch (err) {
    console.error("[admin] listAdminFtourSlots error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

export const detectDuplicateEstablishments: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("establishments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.json({ groups: [] });

  // Build groups: same normalised name + same normalised city
  type Row = Record<string, unknown> & { id: string; name: string | null; city: string | null; created_at: string | null; status: string | null };
  const rows = data as Row[];

  const buckets = new Map<string, Row[]>();

  for (const row of rows) {
    const nName = normalizeEstName(row.name as string | null);
    const nCity = normalizeEstName(row.city as string | null);
    if (!nName) continue; // skip unnamed establishments
    const key = `${nName}||${nCity}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  const groups: Array<{
    name: string;
    city: string;
    items: Array<{
      id: string;
      name: string | null;
      city: string | null;
      status: string | null;
      created_at: string | null;
      completeness: number;
      filledFields: number;
      totalFields: number;
    }>;
  }> = [];

  const totalFields = 23; // number of scored fields

  for (const [, bucket] of buckets) {
    if (bucket.length < 2) continue;

    const first = bucket[0];
    groups.push({
      name: (first.name as string) ?? "",
      city: (first.city as string) ?? "",
      items: bucket.map((row) => {
        const score = computeCompletenessScore(row);
        // Count filled fields for display
        const fieldKeys = [
          "name", "description_short", "description_long", "address", "city",
          "postal_code", "region", "phone", "whatsapp", "email", "website",
          "cover_url", "gallery_urls", "hours", "universe", "subcategory",
          "lat", "lng", "tags", "amenities", "social_links", "specialties",
          "ambiance_tags", "service_types",
        ];
        let filled = 0;
        for (const k of fieldKeys) {
          const v = row[k];
          if (v === null || v === undefined || v === "") continue;
          if (Array.isArray(v) && v.length === 0) continue;
          if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
          filled++;
        }
        return {
          id: row.id,
          name: row.name as string | null,
          city: row.city as string | null,
          status: row.status as string | null,
          created_at: row.created_at as string | null,
          completeness: score,
          filledFields: filled,
          totalFields,
        };
      }).sort((a, b) => b.completeness - a.completeness), // richest first
    });
  }

  // Sort groups by number of duplicates (biggest groups first)
  groups.sort((a, b) => b.items.length - a.items.length);

  res.json({ groups });
};

export const listAdminWaitlist: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const isUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );

  const establishmentIdRaw =
    typeof req.query.establishment_id === "string"
      ? req.query.establishment_id.trim()
      : "";
  const establishmentId =
    establishmentIdRaw && isUuid(establishmentIdRaw) ? establishmentIdRaw : "";

  const statusRaw =
    typeof req.query.status === "string" ? req.query.status.trim() : "";
  const statusList = statusRaw
    ? statusRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const fromRaw =
    typeof req.query.from === "string" ? req.query.from.trim() : "";
  const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";

  const parseDateBoundary = (raw: string, endOfDay: boolean): string | null => {
    if (!raw) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const iso = endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`;
      const ts = Date.parse(iso);
      return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
    }

    const ts = Date.parse(raw);
    return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
  };

  const fromIso = parseDateBoundary(fromRaw, false);
  const toIso = parseDateBoundary(toRaw, true);

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const supabase = getAdminSupabase();

  let q = supabase
    .from("waitlist_entries")
    .select(
      "id,reservation_id,slot_id,user_id,status,position,offer_sent_at,offer_expires_at,created_at,updated_at,reservations!inner(id,booking_reference,establishment_id,starts_at,party_size,status,created_at,meta,establishments(id,name,city,universe))",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (establishmentId)
    q = q.eq("reservations.establishment_id", establishmentId);
  if (statusList.length) q = q.in("status", statusList);
  if (fromIso) q = q.gte("created_at", fromIso);
  if (toIso) q = q.lte("created_at", toIso);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

export const listAdminEstablishmentQrLogs: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("qr_scan_logs")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("scanned_at", { ascending: false })
    .limit(300);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as QrScanLogRow[] });
};

export const listAdminEstablishmentPackBilling: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const [{ data: purchases, error: pErr }, { data: redemptions, error: rErr }] =
    await Promise.all([
      supabase
        .from("pack_purchases")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("pack_redemptions")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("redeemed_at", { ascending: false })
        .limit(1000),
    ]);

  if (pErr) return res.status(500).json({ error: pErr.message });
  if (rErr) return res.status(500).json({ error: rErr.message });

  res.json({
    ok: true,
    purchases: purchases ?? [],
    redemptions: redemptions ?? [],
  });
};

export const listAdminEstablishmentConversations: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_conversations")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as ProConversationRow[] });
};

export const listAdminEstablishmentConversationMessages: RequestHandler =
  async (req, res) => {
    if (!requireAdminKey(req, res)) return;

    const establishmentId =
      typeof req.params.id === "string" ? req.params.id : "";
    const conversationId =
      typeof req.params.conversationId === "string"
        ? req.params.conversationId
        : "";
    if (!establishmentId)
      return res.status(400).json({ error: "Identifiant requis" });
    if (!conversationId)
      return res.status(400).json({ error: "Identifiant de conversation requis" });

    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("pro_messages")
      .select("*")
      .eq("establishment_id", establishmentId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ items: (data ?? []) as ProMessageRow[] });
  };

export const listAdminEstablishmentOffers: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const [{ data: slots, error: slotsErr }, { data: packs, error: packsErr }] =
    await Promise.all([
      supabase
        .from("pro_slots")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("starts_at", { ascending: true })
        .limit(500),
      supabase
        .from("packs")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  if (slotsErr) return res.status(500).json({ error: slotsErr.message });
  if (packsErr) return res.status(500).json({ error: packsErr.message });

  res.json({ ok: true, slots: slots ?? [], packs: packs ?? [] });
};
