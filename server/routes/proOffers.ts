/**
 * Routes API PRO - Offers, Packs, Slots, Booking Policy, Promo Codes,
 * Inventory Images, Custom Labels, Promo Analytics, Promo Templates, CSV Export
 *
 * Extracted from the monolithic pro.ts.
 */

import type { RequestHandler } from "express";
import { randomUUID, randomBytes } from "node:crypto";

import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import { validateBody } from "../middleware/validate";
import { createPackSchema, updatePackSchema, type CreatePackInput, type UpdatePackInput } from "../schemas/pack";
import {
  parseBearerToken,
  getUserFromBearerToken,
  ensureRole,
  ensureCanManageOffers,
  ensureCanManageInventory,
  isRecord,
  asString,
  asNumber,
  asBoolean,
  asStringArray,
} from "./proHelpers";
import { parseIsoDatetimeOrNull } from "./proInventory";
import { safeInt } from "./proVisibility";

const log = createModuleLogger("proOffers");

// =============================================================================
// Local helpers
// =============================================================================

function normalizeConsumerPromoCode(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, "") : "";
  return s ? s : null;
}

function generateSamPromoCode(suffixLength = 10): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const n = Math.max(6, Math.min(32, Math.round(suffixLength)));
  const bytes = randomBytes(n);

  let out = "SAM";
  for (let i = 0; i < n; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

type ProConsumerPromoCodeInput = {
  code?: unknown;
  description?: unknown;
  discount_bps?: unknown;
  active?: unknown;
  is_public?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  max_uses_total?: unknown;
  max_uses_per_user?: unknown;
};

function defaultBookingPolicy(establishmentId: string) {
  return {
    establishment_id: establishmentId,
    cancellation_enabled: false,
    free_cancellation_hours: 24,
    cancellation_penalty_percent: 50,
    no_show_penalty_percent: 100,
    no_show_always_100_guaranteed: true,
    cancellation_text_fr: "",
    cancellation_text_en: "",
    modification_enabled: true,
    modification_deadline_hours: 2,
    require_guarantee_below_score: null as number | null,
    modification_text_fr: "",
    modification_text_en: "",
    deposit_per_person: null as number | null,
  };
}

// Storage constants for inventory images
const PRO_INVENTORY_IMAGES_BUCKET = "pro-inventory-images";
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function ensureProStorageBucket(
  supabase: ReturnType<typeof getAdminSupabase>,
  bucket: string,
): Promise<void> {
  try {
    const exists = await supabase.storage.getBucket(bucket);
    if (!exists.error) return;

    const msg = String(exists.error.message ?? "").toLowerCase();
    const status =
      (exists.error as any)?.statusCode ??
      (exists.error as any)?.status ??
      null;

    if (
      status === 404 ||
      msg.includes("not found") ||
      msg.includes("does not exist")
    ) {
      const created = await supabase.storage.createBucket(bucket, {
        public: true,
      });
      const cmsg = String(created.error?.message ?? "").toLowerCase();
      if (
        created.error &&
        !cmsg.includes("exists") &&
        !cmsg.includes("duplicate")
      ) {
        throw created.error;
      }
    }
  } catch (err) {
    log.warn({ err }, "Best-effort: storage bucket creation failed, upload will produce clear error");
  }
}

// =============================================================================
// Offers list (slots + packs read-only)
// =============================================================================

export const listProOffers: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const [{ data: slots, error: slotsErr }, { data: packs, error: packsErr }] = await Promise.all([
    supabase
      .from("pro_slots")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("starts_at", { ascending: true })
      .limit(300),
    supabase
      .from("packs")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (slotsErr) return res.status(500).json({ error: slotsErr.message });
  if (packsErr) return res.status(500).json({ error: packsErr.message });

  const slotArr = (slots ?? []) as Array<{ id: string; starts_at: string; capacity: number | null }>;

  const usedBySlotId = new Map<string, number>();
  const usedByStartsAtIso = new Map<string, number>();

  const minStartsAt = slotArr[0]?.starts_at ?? null;
  const maxStartsAt = slotArr[slotArr.length - 1]?.starts_at ?? null;

  if (slotArr.length && minStartsAt && maxStartsAt) {
    const slotIds = slotArr.map((s) => s.id);

    const [{ data: bySlot }, { data: byTime }] = await Promise.all([
      supabase
        .from("reservations")
        .select("slot_id, party_size")
        .in("slot_id", slotIds)
        .in("status", ["confirmed", "pending_pro_validation", "requested"])
        .limit(5000),
      supabase
        .from("reservations")
        .select("starts_at, party_size")
        .eq("establishment_id", establishmentId)
        .is("slot_id", null)
        .in("status", ["confirmed", "pending_pro_validation", "requested"])
        .gte("starts_at", minStartsAt)
        .lte("starts_at", maxStartsAt)
        .limit(5000),
    ]);

    for (const r of (bySlot ?? []) as Array<{ slot_id: string | null; party_size: number | null }>) {
      const slotId = r.slot_id;
      if (!slotId) continue;
      const size = typeof r.party_size === "number" && Number.isFinite(r.party_size) ? Math.max(0, Math.round(r.party_size)) : 0;
      usedBySlotId.set(slotId, (usedBySlotId.get(slotId) ?? 0) + size);
    }

    for (const r of (byTime ?? []) as Array<{ starts_at: string; party_size: number | null }>) {
      const startsAt = String(r.starts_at ?? "").trim();
      if (!startsAt) continue;
      const size = typeof r.party_size === "number" && Number.isFinite(r.party_size) ? Math.max(0, Math.round(r.party_size)) : 0;
      usedByStartsAtIso.set(startsAt, (usedByStartsAtIso.get(startsAt) ?? 0) + size);
    }
  }

  const slotsWithRemaining = slotArr.map((s) => {
    const cap = typeof s.capacity === "number" && Number.isFinite(s.capacity) ? Math.max(0, Math.round(s.capacity)) : null;
    const used = usedBySlotId.get(s.id) ?? usedByStartsAtIso.get(s.starts_at) ?? 0;
    const remaining_capacity = cap == null ? null : Math.max(0, cap - used);
    return { ...(s as Record<string, unknown>), remaining_capacity };
  });

  res.json({ ok: true, slots: slotsWithRemaining, packs: packs ?? [] });
};

// =============================================================================
// Slots CRUD
// =============================================================================

export const upsertProSlots: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  if (!Array.isArray(req.body.slots)) return res.status(400).json({ error: "slots is required" });

  const slotsInput = req.body.slots as unknown[];
  if (!slotsInput.length) return res.status(400).json({ error: "slots is required" });

  const rows: Record<string, unknown>[] = [];

  for (const raw of slotsInput) {
    if (!isRecord(raw)) return res.status(400).json({ error: "Invalid slot" });

    const startsRaw = asString(raw.starts_at);
    const endsRaw = asString(raw.ends_at);
    const capacity = asNumber(raw.capacity);

    if (!startsRaw || !endsRaw) return res.status(400).json({ error: "starts_at/ends_at are required" });

    const startsMs = Date.parse(startsRaw);
    const endsMs = Date.parse(endsRaw);
    if (!Number.isFinite(startsMs) || !Number.isFinite(endsMs)) {
      return res.status(400).json({ error: "starts_at/ends_at are invalid ISO datetimes" });
    }
    if (endsMs <= startsMs) {
      return res.status(400).json({ error: "ends_at must be after starts_at" });
    }

    if (capacity === undefined || !Number.isFinite(capacity) || capacity <= 0) {
      return res.status(400).json({ error: "capacity must be > 0" });
    }

    const starts_at = new Date(startsMs).toISOString();
    const ends_at = new Date(endsMs).toISOString();

    const base_price = raw.base_price === null ? null : asNumber(raw.base_price);
    const promo_type = raw.promo_type === null ? null : asString(raw.promo_type);
    const promo_value = raw.promo_value === null ? null : asNumber(raw.promo_value);
    const promo_label = raw.promo_label === null ? null : asString(raw.promo_label);
    const service_label = raw.service_label === null ? null : asString(raw.service_label);
    const active = asBoolean(raw.active);

    rows.push({
      establishment_id: establishmentId,
      starts_at,
      ends_at,
      capacity: Math.max(1, Math.round(capacity)),
      base_price: base_price == null ? null : Math.max(0, Math.round(base_price)),
      promo_type: promo_type == null ? null : promo_type,
      promo_value: promo_value == null ? null : Math.max(0, Math.round(promo_value)),
      promo_label: promo_label == null ? null : promo_label,
      service_label: service_label == null ? null : service_label,
      active: active === undefined ? true : active,
    });
  }

  const supabase = getAdminSupabase();

  // Overlap validation within the request
  const times = rows
    .map((r) => {
      const s = typeof r.starts_at === "string" ? r.starts_at : "";
      const e = typeof r.ends_at === "string" ? r.ends_at : "";
      const sMs = s ? Date.parse(s) : NaN;
      const eMs = e ? Date.parse(e) : NaN;
      return { starts_at: s, ends_at: e, sMs, eMs };
    })
    .filter((t) => Number.isFinite(t.sMs) && Number.isFinite(t.eMs))
    .sort((a, b) => a.sMs - b.sMs);

  for (let i = 1; i < times.length; i++) {
    const prev = times[i - 1];
    const cur = times[i];
    if (cur.sMs < prev.eMs) {
      return res.status(409).json({
        error: "slot_overlap",
        message: "Les creneaux ne doivent pas se chevaucher.",
        conflict: { a: { starts_at: prev.starts_at, ends_at: prev.ends_at }, b: { starts_at: cur.starts_at, ends_at: cur.ends_at } },
      });
    }
  }

  // Overlap validation against existing slots
  const minStartMs = times.reduce((acc, t) => Math.min(acc, t.sMs), Number.POSITIVE_INFINITY);
  const maxEndMs = times.reduce((acc, t) => Math.max(acc, t.eMs), Number.NEGATIVE_INFINITY);

  if (Number.isFinite(minStartMs) && Number.isFinite(maxEndMs)) {
    const minStartIso = new Date(minStartMs).toISOString();
    const maxEndIso = new Date(maxEndMs).toISOString();

    const { data: existingSlots, error: overlapsErr } = await supabase
      .from("pro_slots")
      .select("id,starts_at,ends_at")
      .eq("establishment_id", establishmentId)
      .lt("starts_at", maxEndIso)
      .gt("ends_at", minStartIso)
      .limit(5000);

    if (overlapsErr) return res.status(500).json({ error: overlapsErr.message });

    const existingTimes = (existingSlots ?? [])
      .map((s) => {
        const startsAt = typeof (s as any).starts_at === "string" ? String((s as any).starts_at).trim() : "";
        const endsAt = typeof (s as any).ends_at === "string" ? String((s as any).ends_at).trim() : "";
        const sMs = startsAt ? Date.parse(startsAt) : NaN;
        const eMs = endsAt ? Date.parse(endsAt) : NaN;
        const id = typeof (s as any).id === "string" ? String((s as any).id) : "";
        return { id, startsAt, endsAt, sMs, eMs };
      })
      .filter((x) => x.id && Number.isFinite(x.sMs) && Number.isFinite(x.eMs));

    for (const incoming of times) {
      for (const ex of existingTimes) {
        // upsert is keyed by (establishment_id, starts_at) so this is the same logical slot.
        if (ex.startsAt === incoming.starts_at) continue;

        const overlaps = ex.sMs < incoming.eMs && ex.eMs > incoming.sMs;
        if (overlaps) {
          return res.status(409).json({
            error: "slot_overlap",
            message: "Ce creneau chevauche un creneau existant.",
            existing_slot_id: ex.id,
            conflict: {
              existing: { starts_at: ex.startsAt, ends_at: ex.endsAt },
              incoming: { starts_at: incoming.starts_at, ends_at: incoming.ends_at },
            },
          });
        }
      }
    }
  }

  const { error } = await supabase.from("pro_slots").upsert(rows, { onConflict: "establishment_id,starts_at" });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, upserted: rows.length });
};

export const deleteProSlot: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const slotId = typeof req.params.slotId === "string" ? req.params.slotId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!slotId) return res.status(400).json({ error: "slotId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("pro_slots").delete().eq("id", slotId).eq("establishment_id", establishmentId);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// =============================================================================
// Packs CRUD
// =============================================================================

export const validateCreateProPack = validateBody(createPackSchema);

export const createProPack: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const validatedBody = req.validatedBody as CreatePackInput | undefined;

  const title = validatedBody?.title ?? asString(req.body?.title);
  const price = validatedBody?.price ?? asNumber(req.body?.price);

  if (!title || !title.trim()) return res.status(400).json({ error: "title is required" });
  if (price === undefined || !Number.isFinite(price) || price <= 0) return res.status(400).json({ error: "price is required" });

  const supabase = getAdminSupabase();

  // Check for duplicate pack
  const { data: existingPacks } = await supabase
    .from("packs")
    .select("id, title")
    .eq("establishment_id", establishmentId)
    .ilike("title", title.trim())
    .eq("price", Math.round(price));

  if (existingPacks && existingPacks.length > 0) {
    return res.status(409).json({ error: `Un pack "${existingPacks[0].title}" avec ce prix existe deja.` });
  }

  const body = validatedBody ?? req.body;

  const { data, error } = await supabase
    .from("packs")
    .insert({
      establishment_id: establishmentId,
      title: title.trim(),
      description: body.description ?? null,
      label: body.label ?? null,
      items: body.items ?? [],
      price: Math.round(price),
      original_price: body.original_price ?? null,
      is_limited: body.is_limited ?? false,
      stock: body.stock ?? null,
      availability: body.availability ?? "permanent",
      max_reservations: body.max_reservations ?? null,
      active: body.active ?? true,
      valid_from: body.valid_from ?? null,
      valid_to: body.valid_to ?? null,
      conditions: body.conditions ?? null,
      cover_url: body.cover_url ?? null,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: "Erreur lors de la creation du pack" });

  res.json({ ok: true, id: (data as { id: string } | null)?.id ?? null });
};

export const deleteProPack: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const packId = typeof req.params.packId === "string" ? req.params.packId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!packId) return res.status(400).json({ error: "packId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("packs").delete().eq("id", packId).eq("establishment_id", establishmentId);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

export const updateProPack: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const packId = typeof req.params.packId === "string" ? req.params.packId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!packId) return res.status(400).json({ error: "packId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const supabase = getAdminSupabase();

  const updates: Record<string, unknown> = {};

  if (typeof req.body.title === "string") {
    const title = req.body.title.trim();
    if (!title) return res.status(400).json({ error: "title cannot be empty" });
    updates.title = title;
  }

  if (typeof req.body.description === "string") {
    updates.description = req.body.description.trim() || null;
  } else if (req.body.description === null) {
    updates.description = null;
  }

  if (typeof req.body.label === "string") {
    updates.label = req.body.label.trim() || null;
  } else if (req.body.label === null) {
    updates.label = null;
  }

  if (typeof req.body.price === "number" && Number.isFinite(req.body.price) && req.body.price > 0) {
    updates.price = Math.round(req.body.price);
  }

  if (typeof req.body.original_price === "number" && Number.isFinite(req.body.original_price)) {
    updates.original_price = Math.round(req.body.original_price);
  } else if (req.body.original_price === null) {
    updates.original_price = null;
  }

  if (typeof req.body.is_limited === "boolean") {
    updates.is_limited = req.body.is_limited;
  }

  if (typeof req.body.stock === "number" && Number.isFinite(req.body.stock)) {
    updates.stock = Math.round(req.body.stock);
  } else if (req.body.stock === null) {
    updates.stock = null;
  }

  if (typeof req.body.availability === "string") {
    updates.availability = req.body.availability;
  }

  if (typeof req.body.active === "boolean") {
    updates.active = req.body.active;
  }

  if (typeof req.body.valid_from === "string") {
    updates.valid_from = req.body.valid_from.trim() || null;
  } else if (req.body.valid_from === null) {
    updates.valid_from = null;
  }

  if (typeof req.body.valid_to === "string") {
    updates.valid_to = req.body.valid_to.trim() || null;
  } else if (req.body.valid_to === null) {
    updates.valid_to = null;
  }

  if (typeof req.body.conditions === "string") {
    updates.conditions = req.body.conditions.trim() || null;
  } else if (req.body.conditions === null) {
    updates.conditions = null;
  }

  if (typeof req.body.cover_url === "string") {
    updates.cover_url = req.body.cover_url.trim() || null;
  } else if (req.body.cover_url === null) {
    updates.cover_url = null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("packs")
    .update(updates)
    .eq("id", packId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// =============================================================================
// Booking Policy
// =============================================================================

export const getProBookingPolicy: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase.from("booking_policies").select("*").eq("establishment_id", establishmentId).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });

  const defaults = defaultBookingPolicy(establishmentId);
  const row = data ? ({ ...defaults, ...(data as Record<string, unknown>) } as Record<string, unknown>) : (defaults as Record<string, unknown>);

  res.json({ ok: true, policy: row });
};

export const updateProBookingPolicy: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const patch: Record<string, unknown> = {};

  const cancellation_enabled = asBoolean(req.body.cancellation_enabled);
  if (cancellation_enabled !== undefined) patch.cancellation_enabled = cancellation_enabled;

  const free_cancellation_hours = asNumber(req.body.free_cancellation_hours);
  if (free_cancellation_hours !== undefined) patch.free_cancellation_hours = Math.max(0, Math.round(free_cancellation_hours));

  const cancellation_penalty_percent = asNumber(req.body.cancellation_penalty_percent);
  if (cancellation_penalty_percent !== undefined) patch.cancellation_penalty_percent = Math.min(100, Math.max(0, Math.round(cancellation_penalty_percent)));

  const no_show_penalty_percent = asNumber(req.body.no_show_penalty_percent);
  if (no_show_penalty_percent !== undefined) patch.no_show_penalty_percent = Math.min(100, Math.max(0, Math.round(no_show_penalty_percent)));

  const no_show_always_100_guaranteed = asBoolean(req.body.no_show_always_100_guaranteed);
  if (no_show_always_100_guaranteed !== undefined) patch.no_show_always_100_guaranteed = no_show_always_100_guaranteed;

  if (typeof req.body.cancellation_text_fr === "string") patch.cancellation_text_fr = req.body.cancellation_text_fr;
  if (typeof req.body.cancellation_text_en === "string") patch.cancellation_text_en = req.body.cancellation_text_en;

  const modification_enabled = asBoolean(req.body.modification_enabled);
  if (modification_enabled !== undefined) patch.modification_enabled = modification_enabled;

  const modification_deadline_hours = asNumber(req.body.modification_deadline_hours);
  if (modification_deadline_hours !== undefined) patch.modification_deadline_hours = Math.max(0, Math.round(modification_deadline_hours));

  const requireScoreRaw = req.body.require_guarantee_below_score;
  if (requireScoreRaw === null) {
    patch.require_guarantee_below_score = null;
  } else {
    const requireScore = asNumber(requireScoreRaw);
    if (requireScore !== undefined) patch.require_guarantee_below_score = Math.min(100, Math.max(0, Math.round(requireScore)));
  }

  if (typeof req.body.modification_text_fr === "string") patch.modification_text_fr = req.body.modification_text_fr;
  if (typeof req.body.modification_text_en === "string") patch.modification_text_en = req.body.modification_text_en;

  const depositRaw = req.body.deposit_per_person;
  if (depositRaw === null) {
    patch.deposit_per_person = null;
  } else {
    const depositAmount = asNumber(depositRaw);
    if (depositAmount !== undefined) patch.deposit_per_person = Math.max(0, Math.round(depositAmount));
  }

  if (!Object.keys(patch).length) return res.status(400).json({ error: "No changes provided" });

  patch.updated_at = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("booking_policies")
    .upsert({ establishment_id: establishmentId, ...(patch as Record<string, unknown>) }, { onConflict: "establishment_id" });

  if (error) return res.status(500).json({ error: error.message });

  const { data, error: getErr } = await supabase.from("booking_policies").select("*").eq("establishment_id", establishmentId).maybeSingle();
  if (getErr) return res.status(500).json({ error: getErr.message });

  const defaults = defaultBookingPolicy(establishmentId);
  const row = data ? ({ ...defaults, ...(data as Record<string, unknown>) } as Record<string, unknown>) : (defaults as Record<string, unknown>);

  res.json({ ok: true, policy: row });
};

// =============================================================================
// Consumer Promo Codes CRUD
// =============================================================================

export const listProConsumerPromoCodes: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const select =
    "id,code,description,discount_bps,applies_to_pack_id,applies_to_establishment_ids,active,is_public,starts_at,ends_at,max_uses_total,max_uses_per_user,created_at,updated_at,deleted_at";

  const { data, error } = await supabase
    .from("consumer_promo_codes")
    .select(select)
    .contains("applies_to_establishment_ids", [establishmentId])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (/relation .*consumer_promo_codes.* does not exist/i.test(error.message)) {
      return res.json({ ok: true, promo_codes: [] });
    }
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, promo_codes: data ?? [] });
};

export const createProConsumerPromoCode: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const body = req.body as ProConsumerPromoCodeInput;

  const providedCode = normalizeConsumerPromoCode(body.code);
  const shouldGenerateCode = !providedCode;
  let code = providedCode ?? generateSamPromoCode();

  const discountBps = Math.max(0, Math.min(10000, safeInt(body.discount_bps)));
  if (discountBps <= 0) return res.status(400).json({ error: "discount_bps must be > 0" });

  const startsAt = body.starts_at === null ? null : parseIsoDatetimeOrNull(body.starts_at);
  const endsAt = body.ends_at === null ? null : parseIsoDatetimeOrNull(body.ends_at);
  if (startsAt && endsAt) {
    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);
    if (endDate.getTime() < startDate.getTime()) return res.status(400).json({ error: "ends_at must be >= starts_at" });
  }

  const maxUsesTotalRaw = body.max_uses_total === null ? null : safeInt(body.max_uses_total);
  const maxUsesPerUserRaw = body.max_uses_per_user === null ? null : safeInt(body.max_uses_per_user);
  const maxUsesTotal = maxUsesTotalRaw != null && maxUsesTotalRaw >= 1 ? maxUsesTotalRaw : null;
  const maxUsesPerUser = maxUsesPerUserRaw != null && maxUsesPerUserRaw >= 1 ? maxUsesPerUserRaw : null;

  const isPublic = typeof body.is_public === "boolean" ? body.is_public : false;

  const supabase = getAdminSupabase();

  for (let attempt = 0; attempt < 8; attempt++) {
    const payload: Record<string, unknown> = {
      code,
      description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
      discount_bps: discountBps,
      applies_to_pack_id: null,
      applies_to_establishment_ids: [establishmentId],
      active: typeof body.active === "boolean" ? body.active : true,
      is_public: isPublic,
      starts_at: startsAt,
      ends_at: endsAt,
      max_uses_total: maxUsesTotal,
      max_uses_per_user: maxUsesPerUser,
    };

    const { data, error } = await supabase.from("consumer_promo_codes").insert(payload).select("*").single();
    if (!error) return res.json({ ok: true, promo_code: data });

    if (/duplicate key value violates unique constraint/i.test(error.message)) {
      if (!shouldGenerateCode) return res.status(409).json({ error: "code_already_exists" });
      code = generateSamPromoCode();
      continue;
    }

    return res.status(500).json({ error: error.message });
  }

  return res.status(500).json({ error: "unable_to_generate_code" });
};

export const updateProConsumerPromoCode: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const promoId = typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!promoId) return res.status(400).json({ error: "id is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const body = req.body as ProConsumerPromoCodeInput;

  const supabase = getAdminSupabase();

  const { data: beforeRow, error: beforeErr } = await supabase
    .from("consumer_promo_codes")
    .select("*")
    .eq("id", promoId)
    .contains("applies_to_establishment_ids", [establishmentId])
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!beforeRow) return res.status(404).json({ error: "promo_not_found" });

  const patch: Record<string, unknown> = {};

  if (body.description !== undefined) {
    patch.description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
  }

  if (body.discount_bps !== undefined) {
    const discountBps = Math.max(0, Math.min(10000, safeInt(body.discount_bps)));
    if (discountBps <= 0) return res.status(400).json({ error: "discount_bps must be > 0" });
    patch.discount_bps = discountBps;
  }

  if (body.active !== undefined) patch.active = Boolean(body.active);

  if (body.is_public !== undefined) patch.is_public = Boolean(body.is_public);

  if (body.starts_at !== undefined) {
    patch.starts_at = body.starts_at === null ? null : parseIsoDatetimeOrNull(body.starts_at);
  }

  if (body.ends_at !== undefined) {
    patch.ends_at = body.ends_at === null ? null : parseIsoDatetimeOrNull(body.ends_at);
  }

  if (body.max_uses_total !== undefined) {
    const v = body.max_uses_total === null ? null : safeInt(body.max_uses_total);
    if (v !== null && v < 1) return res.status(400).json({ error: "max_uses_total invalide" });
    patch.max_uses_total = v;
  }

  if (body.max_uses_per_user !== undefined) {
    const v = body.max_uses_per_user === null ? null : safeInt(body.max_uses_per_user);
    if (v !== null && v < 1) return res.status(400).json({ error: "max_uses_per_user invalide" });
    patch.max_uses_per_user = v;
  }

  const nextStartsAt = (patch.starts_at !== undefined ? patch.starts_at : (beforeRow as any).starts_at) as any;
  const nextEndsAt = (patch.ends_at !== undefined ? patch.ends_at : (beforeRow as any).ends_at) as any;
  if (nextStartsAt && nextEndsAt) {
    const startDate = new Date(String(nextStartsAt));
    const endDate = new Date(String(nextEndsAt));
    if (Number.isFinite(startDate.getTime()) && Number.isFinite(endDate.getTime()) && endDate.getTime() < startDate.getTime()) {
      return res.status(400).json({ error: "ends_at must be >= starts_at" });
    }
  }

  if (!Object.keys(patch).length) return res.status(400).json({ error: "No changes provided" });

  const { data, error } = await supabase
    .from("consumer_promo_codes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", promoId)
    .contains("applies_to_establishment_ids", [establishmentId])
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, promo_code: data });
};

export const deleteProConsumerPromoCode: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const promoId = typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!promoId) return res.status(400).json({ error: "id is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("consumer_promo_codes")
    .update({ active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", promoId)
    .contains("applies_to_establishment_ids", [establishmentId])
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, promo_code: data });
};

// =============================================================================
// Inventory Image Upload
// =============================================================================

export const uploadProInventoryImage: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const contentType = req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return res.status(400).json({ error: "Content-Type must be multipart/form-data" });
  }

  const file = (req as any).file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return res.status(400).json({
      error: "file_too_large",
      message: `Le fichier depasse la taille maximale de 5 MB`,
      maxSize: MAX_IMAGE_SIZE_BYTES,
      actualSize: file.size,
    });
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return res.status(400).json({
      error: "invalid_mime_type",
      message: `Format non accepte. Formats autorises: JPG, PNG, WebP, GIF`,
      allowedTypes: ALLOWED_MIME_TYPES,
      actualType: file.mimetype,
    });
  }

  const extension = file.originalname.split(".").pop()?.toLowerCase() || "jpg";
  const uniqueId = randomUUID();
  const filename = `${establishmentId}/${uniqueId}.${extension}`;

  const supabase = getAdminSupabase();

  await ensureProStorageBucket(supabase, PRO_INVENTORY_IMAGES_BUCKET);

  const { error: uploadError } = await supabase.storage
    .from(PRO_INVENTORY_IMAGES_BUCKET)
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    log.error({ err: uploadError }, "uploadProInventoryImage upload error");
    return res.status(500).json({ error: "upload_failed", message: uploadError.message });
  }

  const { data: { publicUrl } } = supabase.storage
    .from(PRO_INVENTORY_IMAGES_BUCKET)
    .getPublicUrl(filename);

  res.json({
    ok: true,
    url: publicUrl,
    filename: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
  });
};

export const deleteProInventoryImage: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const imageUrl = typeof req.body.url === "string" ? req.body.url.trim() : "";
  if (!imageUrl) return res.status(400).json({ error: "url is required" });

  const match = imageUrl.match(/\/pro-inventory-images\/(.+)$/);
  if (!match || !match[1]) {
    return res.status(400).json({ error: "invalid_url", message: "URL does not belong to inventory images bucket" });
  }

  const filePath = match[1];

  if (!filePath.startsWith(`${establishmentId}/`)) {
    return res.status(403).json({ error: "forbidden", message: "Cannot delete images from other establishments" });
  }

  const supabase = getAdminSupabase();

  const { error: deleteError } = await supabase.storage
    .from(PRO_INVENTORY_IMAGES_BUCKET)
    .remove([filePath]);

  if (deleteError) {
    log.error({ err: deleteError }, "deleteProInventoryImage delete error");
    return res.status(500).json({ error: "delete_failed", message: deleteError.message });
  }

  res.json({ ok: true });
};

// =============================================================================
// Custom Inventory Labels
// =============================================================================

export const listProCustomLabels: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_inventory_custom_labels")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, labels: data ?? [] });
};

export const createProCustomLabel: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const labelId = asString(req.body.label_id);
  const emoji = asString(req.body.emoji) ?? "\uD83C\uDFF7\uFE0F";
  const title = asString(req.body.title);
  const titleAr = asString(req.body.title_ar);
  const color = asString(req.body.color) ?? "slate";
  const sortOrder = asNumber(req.body.sort_order) ?? 0;

  if (!labelId || !title) {
    return res.status(400).json({ error: "label_id and title are required" });
  }

  if (!/^[a-z0-9_]+$/.test(labelId)) {
    return res.status(400).json({ error: "label_id must be lowercase alphanumeric with underscores only" });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_inventory_custom_labels")
    .insert({
      establishment_id: establishmentId,
      label_id: labelId,
      emoji,
      title,
      title_ar: titleAr ?? null,
      color,
      sort_order: sortOrder,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Label ID already exists" });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, label: data });
};

export const updateProCustomLabel: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const labelId = typeof req.params.labelId === "string" ? req.params.labelId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!labelId) return res.status(400).json({ error: "labelId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const patch: Record<string, unknown> = {};

  const emoji = asString(req.body.emoji);
  const title = asString(req.body.title);
  const titleAr = asString(req.body.title_ar);
  const color = asString(req.body.color);
  const sortOrder = asNumber(req.body.sort_order);
  const isActive = asBoolean(req.body.is_active);

  if (emoji !== undefined) patch.emoji = emoji;
  if (title !== undefined) patch.title = title;
  if (titleAr !== undefined) patch.title_ar = titleAr;
  if (color !== undefined) patch.color = color;
  if (sortOrder !== undefined) patch.sort_order = sortOrder;
  if (isActive !== undefined) patch.is_active = isActive;

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_inventory_custom_labels")
    .update(patch)
    .eq("id", labelId)
    .eq("establishment_id", establishmentId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Label not found" });

  res.json({ ok: true, label: data });
};

export const deleteProCustomLabel: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const labelId = typeof req.params.labelId === "string" ? req.params.labelId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!labelId) return res.status(400).json({ error: "labelId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("pro_inventory_custom_labels")
    .delete()
    .eq("id", labelId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// =============================================================================
// Inventory Items Reorder
// =============================================================================

export const reorderProInventoryItems: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const itemIds = asStringArray(req.body.item_ids);
  if (!itemIds || itemIds.length === 0) {
    return res.status(400).json({ error: "item_ids array is required" });
  }

  const supabase = getAdminSupabase();

  const updates = itemIds.map((id, index) =>
    supabase
      .from("pro_inventory_items")
      .update({ sort_order: index })
      .eq("id", id)
      .eq("establishment_id", establishmentId)
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    return res.status(500).json({ error: "Some items could not be reordered" });
  }

  res.json({ ok: true });
};

// =============================================================================
// Promo Analytics
// =============================================================================

export const getProPromoAnalytics: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data: promoCodes, error: promoErr } = await supabase
    .from("consumer_promo_codes")
    .select("id, code, discount_bps, is_public, active, starts_at, ends_at, max_uses_total, max_uses_per_user, total_uses, total_revenue_generated, total_discount_given, created_at")
    .contains("applies_to_establishment_ids", [establishmentId])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (promoErr) return res.status(500).json({ error: promoErr.message });

  const { data: packPurchases, error: ppErr } = await supabase
    .from("pack_purchases")
    .select("id, pack_id, amount_paid, promo_code_id, created_at")
    .eq("establishment_id", establishmentId)
    .not("promo_code_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (ppErr) return res.status(500).json({ error: ppErr.message });

  const promoStats: Record<string, { uses: number; revenue: number; avgDiscount: number }> = {};
  for (const purchase of packPurchases ?? []) {
    const promoId = purchase.promo_code_id as string;
    if (!promoStats[promoId]) {
      promoStats[promoId] = { uses: 0, revenue: 0, avgDiscount: 0 };
    }
    promoStats[promoId].uses += 1;
    promoStats[promoId].revenue += (purchase.amount_paid ?? 0) as number;
  }

  const analytics = (promoCodes ?? []).map((promo) => {
    const stats = promoStats[promo.id] ?? { uses: 0, revenue: 0, avgDiscount: 0 };
    const conversionRate = promo.max_uses_total ? (stats.uses / promo.max_uses_total) * 100 : null;
    return {
      ...promo,
      usage_count: promo.total_uses ?? stats.uses,
      revenue_generated: promo.total_revenue_generated ?? stats.revenue,
      discount_given: promo.total_discount_given ?? 0,
      conversion_rate: conversionRate,
    };
  });

  const totalUsage = analytics.reduce((sum, p) => sum + (p.usage_count ?? 0), 0);
  const totalRevenue = analytics.reduce((sum, p) => sum + (p.revenue_generated ?? 0), 0);
  const totalDiscount = analytics.reduce((sum, p) => sum + (p.discount_given ?? 0), 0);

  res.json({
    ok: true,
    analytics,
    summary: {
      total_codes: analytics.length,
      total_usage: totalUsage,
      total_revenue: totalRevenue,
      total_discount: totalDiscount,
    },
  });
};

// =============================================================================
// Promo Templates CRUD
// =============================================================================

export const listProPromoTemplates: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("promo_templates")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, templates: data ?? [] });
};

export const createProPromoTemplate: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const body = req.body as Record<string, unknown>;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return res.status(400).json({ error: "name is required" });

  const discountBps = safeInt(body.discount_bps);
  if (discountBps <= 0 || discountBps > 10000) return res.status(400).json({ error: "discount_bps must be between 1 and 10000" });

  const supabase = getAdminSupabase();

  const payload: Record<string, unknown> = {
    establishment_id: establishmentId,
    name,
    description: typeof body.description === "string" ? body.description.trim() || null : null,
    discount_bps: discountBps,
    is_public: typeof body.is_public === "boolean" ? body.is_public : false,
    max_uses_total: body.max_uses_total ? safeInt(body.max_uses_total) : null,
    max_uses_per_user: body.max_uses_per_user ? safeInt(body.max_uses_per_user) : null,
    min_cart_amount: body.min_cart_amount ? safeInt(body.min_cart_amount) : null,
    valid_days_of_week: Array.isArray(body.valid_days_of_week) ? body.valid_days_of_week : null,
    valid_hours_start: typeof body.valid_hours_start === "string" ? body.valid_hours_start : null,
    valid_hours_end: typeof body.valid_hours_end === "string" ? body.valid_hours_end : null,
    first_purchase_only: typeof body.first_purchase_only === "boolean" ? body.first_purchase_only : false,
    new_customers_only: typeof body.new_customers_only === "boolean" ? body.new_customers_only : false,
    applies_to_pack_ids: Array.isArray(body.applies_to_pack_ids) ? body.applies_to_pack_ids : null,
    applies_to_slot_ids: Array.isArray(body.applies_to_slot_ids) ? body.applies_to_slot_ids : null,
  };

  const { data, error } = await supabase.from("promo_templates").insert(payload).select("*").single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, template: data });
};

export const updateProPromoTemplate: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const templateId = typeof req.params.templateId === "string" ? req.params.templateId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!templateId) return res.status(400).json({ error: "templateId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const body = req.body as Record<string, unknown>;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "name cannot be empty" });
    patch.name = name;
  }
  if (body.description !== undefined) patch.description = typeof body.description === "string" ? body.description.trim() || null : null;
  if (body.discount_bps !== undefined) {
    const bps = safeInt(body.discount_bps);
    if (bps <= 0 || bps > 10000) return res.status(400).json({ error: "discount_bps must be between 1 and 10000" });
    patch.discount_bps = bps;
  }
  if (body.is_public !== undefined) patch.is_public = Boolean(body.is_public);
  if (body.max_uses_total !== undefined) patch.max_uses_total = body.max_uses_total ? safeInt(body.max_uses_total) : null;
  if (body.max_uses_per_user !== undefined) patch.max_uses_per_user = body.max_uses_per_user ? safeInt(body.max_uses_per_user) : null;
  if (body.min_cart_amount !== undefined) patch.min_cart_amount = body.min_cart_amount ? safeInt(body.min_cart_amount) : null;
  if (body.valid_days_of_week !== undefined) patch.valid_days_of_week = Array.isArray(body.valid_days_of_week) ? body.valid_days_of_week : null;
  if (body.valid_hours_start !== undefined) patch.valid_hours_start = typeof body.valid_hours_start === "string" ? body.valid_hours_start : null;
  if (body.valid_hours_end !== undefined) patch.valid_hours_end = typeof body.valid_hours_end === "string" ? body.valid_hours_end : null;
  if (body.first_purchase_only !== undefined) patch.first_purchase_only = Boolean(body.first_purchase_only);
  if (body.new_customers_only !== undefined) patch.new_customers_only = Boolean(body.new_customers_only);
  if (body.applies_to_pack_ids !== undefined) patch.applies_to_pack_ids = Array.isArray(body.applies_to_pack_ids) ? body.applies_to_pack_ids : null;
  if (body.applies_to_slot_ids !== undefined) patch.applies_to_slot_ids = Array.isArray(body.applies_to_slot_ids) ? body.applies_to_slot_ids : null;

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("promo_templates")
    .update(patch)
    .eq("id", templateId)
    .eq("establishment_id", establishmentId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, template: data });
};

export const deleteProPromoTemplate: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const templateId = typeof req.params.templateId === "string" ? req.params.templateId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!templateId) return res.status(400).json({ error: "templateId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("promo_templates")
    .delete()
    .eq("id", templateId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

export const createPromoFromTemplate: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const templateId = typeof req.params.templateId === "string" ? req.params.templateId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!templateId) return res.status(400).json({ error: "templateId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const body = req.body as Record<string, unknown>;

  const supabase = getAdminSupabase();

  const { data: template, error: tplErr } = await supabase
    .from("promo_templates")
    .select("*")
    .eq("id", templateId)
    .eq("establishment_id", establishmentId)
    .single();

  if (tplErr || !template) return res.status(404).json({ error: "Template not found" });

  const code = typeof body.code === "string" && body.code.trim() ? body.code.trim().toUpperCase() : generateSamPromoCode();

  const payload: Record<string, unknown> = {
    code,
    description: template.description,
    discount_bps: template.discount_bps,
    applies_to_pack_id: null,
    applies_to_establishment_ids: [establishmentId],
    active: true,
    is_public: template.is_public,
    starts_at: body.starts_at ? parseIsoDatetimeOrNull(body.starts_at as string) : null,
    ends_at: body.ends_at ? parseIsoDatetimeOrNull(body.ends_at as string) : null,
    max_uses_total: template.max_uses_total,
    max_uses_per_user: template.max_uses_per_user,
    min_cart_amount: template.min_cart_amount,
    valid_days_of_week: template.valid_days_of_week,
    valid_hours_start: template.valid_hours_start,
    valid_hours_end: template.valid_hours_end,
    first_purchase_only: template.first_purchase_only,
    new_customers_only: template.new_customers_only,
    applies_to_pack_ids: template.applies_to_pack_ids,
    applies_to_slot_ids: template.applies_to_slot_ids,
  };

  const { data, error } = await supabase.from("consumer_promo_codes").insert(payload).select("*").single();

  if (error) {
    if (/duplicate key value violates unique constraint/i.test(error.message)) {
      return res.status(409).json({ error: "code_already_exists" });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, promo_code: data });
};

// =============================================================================
// Promo CSV Export
// =============================================================================

export const exportProPromoCodesCsv: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data: promoCodes, error } = await supabase
    .from("consumer_promo_codes")
    .select("*")
    .contains("applies_to_establishment_ids", [establishmentId])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const headers = [
    "Code",
    "Description",
    "Remise (%)",
    "Public",
    "Actif",
    "Debut",
    "Fin",
    "Limite totale",
    "Limite par user",
    "Utilisations",
    "Revenus generes",
    "Remises accordees",
    "Cree le",
  ];

  const csvRows = (promoCodes ?? []).map((p) => [
    p.code ?? "",
    (p.description ?? "").replace(/"/g, '""'),
    ((p.discount_bps ?? 0) / 100).toFixed(0),
    p.is_public ? "Oui" : "Non",
    p.active ? "Oui" : "Non",
    p.starts_at ? new Date(p.starts_at).toLocaleDateString("fr-FR") : "",
    p.ends_at ? new Date(p.ends_at).toLocaleDateString("fr-FR") : "",
    p.max_uses_total ?? "",
    p.max_uses_per_user ?? "",
    p.total_uses ?? 0,
    ((p.total_revenue_generated ?? 0) / 100).toFixed(2),
    ((p.total_discount_given ?? 0) / 100).toFixed(2),
    p.created_at ? new Date(p.created_at).toLocaleDateString("fr-FR") : "",
  ]);

  const csvContent = [
    headers.map((h) => `"${h}"`).join(","),
    ...csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="promo-codes-${establishmentId.slice(0, 8)}.csv"`);
  res.send("\uFEFF" + csvContent);
};
