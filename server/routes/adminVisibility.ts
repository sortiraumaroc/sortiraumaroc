/**
 * adminVisibility.ts
 * -------------------------------------------------------------------
 * Admin handlers for the Visibility (SAM Media) module:
 *   - Visibility offers  (CRUD)
 *   - Visibility promo codes (CRUD)
 *   - Consumer promo codes (CRUD)
 *   - Visibility orders (list, update status, update item meta)
 *   - Visibility invoices (get)
 *
 * Extracted from admin.ts — Feb 2026.
 * -------------------------------------------------------------------
 */

import type { RequestHandler } from "express";
import {
  requireAdminKey,
  isRecord,
  getAdminSupabase,
  getAuditActorInfo,
} from "./adminHelpers";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("adminVisibility");

// ---------------------------------------------------------------------------
// Local helper functions (copies — also present in admin.ts for other modules)
// ---------------------------------------------------------------------------

/** @internal — exported for testing */
export function safeInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return 0;
}

/** @internal — exported for testing */
export function safeString(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

/** @internal — exported for testing */
export function safeCurrency(v: unknown): string {
  const c = typeof v === "string" ? v.trim().toUpperCase() : "";
  return c || "MAD";
}

/** @internal — exported for testing */
export function normalizeOfferType(
  v: unknown,
): "pack" | "option" | "menu_digital" | "media_video" | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (
    s === "pack" ||
    s === "option" ||
    s === "menu_digital" ||
    s === "media_video"
  )
    return s;
  return null;
}

/** @internal — exported for testing */
export function parseDeliverables(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const it of v) {
    const s = typeof it === "string" ? it.trim() : "";
    if (!s) continue;
    out.push(s);
  }
  return out.slice(0, 50);
}

/** @internal — exported for testing */
export function normalizePromoCode(v: unknown): string | null {
  const s =
    typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, "") : "";
  return s ? s : null;
}

/** @internal — exported for testing */
export function normalizePromoScopeType(
  v: unknown,
): "pack" | "option" | "menu_digital" | "media_video" | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (
    s === "pack" ||
    s === "option" ||
    s === "menu_digital" ||
    s === "media_video"
  )
    return s;
  return null;
}

/** @internal — exported for testing */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/** @internal — exported for testing */
export function normalizeUuidArray(v: unknown): string[] | null {
  if (v === null) return null;
  if (!Array.isArray(v)) return null;

  const out: string[] = [];
  for (const raw of v) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    if (!isUuid(id)) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= 200) break;
  }

  return out.length ? out : null;
}

/** @internal — exported for testing */
export function safeIsoOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VisibilityOfferInput = {
  title?: unknown;
  description?: unknown;
  type?: unknown;
  deliverables?: unknown;
  duration_days?: unknown;
  price_cents?: unknown;
  currency?: unknown;
  active?: unknown;
  allow_quantity?: unknown;
  tax_rate_bps?: unknown;
  tax_label?: unknown;
  display_order?: unknown;
};

type VisibilityPromoCodeInput = {
  code?: unknown;
  description?: unknown;
  discount_bps?: unknown;
  applies_to_type?: unknown;
  applies_to_offer_id?: unknown;
  applies_to_establishment_ids?: unknown;
  active?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
};

type ConsumerPromoCodeInput = {
  code?: unknown;
  description?: unknown;
  discount_bps?: unknown;
  applies_to_pack_id?: unknown;
  applies_to_establishment_ids?: unknown;
  active?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
};

// ---------------------------------------------------------------------------
// Visibility Offers
// ---------------------------------------------------------------------------

export const listAdminVisibilityOffers: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  const includeDeleted =
    typeof req.query.include_deleted === "string"
      ? req.query.include_deleted === "true"
      : false;

  let q = supabase
    .from("visibility_offers")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);

  if (!includeDeleted) q = q.is("deleted_at", null);

  const { data, error } = await q;
  if (error) {
    log.error({ err: error }, "listAdminVisibilityOffers failed");
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, offers: data ?? [] });
};

export const createAdminVisibilityOffer: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const body = req.body as VisibilityOfferInput;

  const title = safeString(body.title);
  const type = normalizeOfferType(body.type);

  if (!title) return res.status(400).json({ error: "Titre requis" });
  if (!type)
    return res.status(400).json({
      error: "type must be one of: pack, option, menu_digital, media_video",
    });

  const priceCentsRaw =
    body.price_cents === null ? null : safeInt(body.price_cents);
  const priceCents = priceCentsRaw === null ? null : Math.max(0, priceCentsRaw);
  const currency = safeCurrency(body.currency);

  const active = typeof body.active === "boolean" ? body.active : false;

  // Validation: no active offer without a positive price.
  if (active && (!priceCents || priceCents <= 0)) {
    return res.status(400).json({ error: "active_offer_requires_price" });
  }

  const payload: Record<string, unknown> = {
    title,
    description: safeString(body.description),
    type,
    deliverables: parseDeliverables(body.deliverables),
    duration_days:
      body.duration_days === null
        ? null
        : Math.max(0, safeInt(body.duration_days)) || null,
    price_cents: priceCents,
    currency,
    allow_quantity:
      typeof body.allow_quantity === "boolean" ? body.allow_quantity : false,
    tax_rate_bps: Math.max(0, safeInt(body.tax_rate_bps)),
    tax_label: safeString(body.tax_label) ?? "TVA",
    active,
    display_order: safeInt(body.display_order),
  };

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("visibility_offers")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    log.error({ err: error }, "createAdminVisibilityOffer insert failed");
    return res.status(500).json({ error: error.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "visibility.offer.create",
    entity_type: "visibility_offers",
    entity_id: (data as any)?.id ?? null,
    metadata: { after: data, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true, offer: data });
};

export const updateAdminVisibilityOffer: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const offerId = typeof req.params.id === "string" ? req.params.id : "";
  if (!offerId) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const body = req.body as VisibilityOfferInput;

  const supabase = getAdminSupabase();

  const { data: beforeRow, error: beforeErr } = await supabase
    .from("visibility_offers")
    .select("*")
    .eq("id", offerId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!beforeRow) return res.status(404).json({ error: "offer_not_found" });

  const patch: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = safeString(body.title);
    if (!title) return res.status(400).json({ error: "Titre requis" });
    patch.title = title;
  }

  if (body.description !== undefined)
    patch.description = safeString(body.description);

  if (body.type !== undefined) {
    const type = normalizeOfferType(body.type);
    if (!type)
      return res.status(400).json({
        error: "type must be one of: pack, option, menu_digital, media_video",
      });
    patch.type = type;
  }

  if (body.deliverables !== undefined)
    patch.deliverables = parseDeliverables(body.deliverables);

  if (body.duration_days !== undefined) {
    patch.duration_days =
      body.duration_days === null
        ? null
        : Math.max(0, safeInt(body.duration_days)) || null;
  }

  if (body.price_cents !== undefined) {
    patch.price_cents =
      body.price_cents === null ? null : Math.max(0, safeInt(body.price_cents));
  }

  if (body.currency !== undefined) patch.currency = safeCurrency(body.currency);

  if (body.allow_quantity !== undefined)
    patch.allow_quantity = Boolean(body.allow_quantity);

  if (body.tax_rate_bps !== undefined)
    patch.tax_rate_bps = Math.max(0, safeInt(body.tax_rate_bps));
  if (body.tax_label !== undefined)
    patch.tax_label = safeString(body.tax_label) ?? "TVA";

  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.display_order !== undefined)
    patch.display_order = safeInt(body.display_order);

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const nextActive =
    typeof patch.active === "boolean"
      ? patch.active
      : Boolean((beforeRow as any).active);
  const nextPrice =
    patch.price_cents === null
      ? null
      : typeof patch.price_cents === "number"
        ? patch.price_cents
        : typeof (beforeRow as any).price_cents === "number"
          ? (beforeRow as any).price_cents
          : null;

  if (nextActive && (!nextPrice || nextPrice <= 0)) {
    return res.status(400).json({ error: "active_offer_requires_price" });
  }

  const { data, error } = await supabase
    .from("visibility_offers")
    .update(patch)
    .eq("id", offerId)
    .select("*")
    .single();
  if (error) {
    log.error({ err: error, offerId }, "updateAdminVisibilityOffer failed");
    return res.status(500).json({ error: error.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "visibility.offer.update",
    entity_type: "visibility_offers",
    entity_id: offerId,
    metadata: {
      before: beforeRow,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({ ok: true, offer: data });
};

export const deleteAdminVisibilityOffer: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const offerId = typeof req.params.id === "string" ? req.params.id : "";
  if (!offerId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: beforeRow } = await supabase
    .from("visibility_offers")
    .select("*")
    .eq("id", offerId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("visibility_offers")
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq("id", offerId)
    .select("*")
    .single();

  if (error) {
    log.error({ err: error, offerId }, "deleteAdminVisibilityOffer failed");
    return res.status(500).json({ error: error.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "visibility.offer.delete",
    entity_type: "visibility_offers",
    entity_id: offerId,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Visibility Promo Codes
// ---------------------------------------------------------------------------

export const listAdminVisibilityPromoCodes: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const includeDeleted =
    typeof req.query.include_deleted === "string"
      ? req.query.include_deleted === "true"
      : false;

  const supabase = getAdminSupabase();

  const baseSelect =
    "id,code,description,discount_bps,applies_to_type,applies_to_offer_id,active,starts_at,ends_at,created_at,updated_at,deleted_at";
  const selectWithEst = `${baseSelect},applies_to_establishment_ids`;

  const run = async (select: string) => {
    let q = supabase
      .from("visibility_promo_codes")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(500);

    if (!includeDeleted) q = q.is("deleted_at", null);
    return await q;
  };

  const first = await run(selectWithEst);
  if (
    first.error &&
    /applies_to_establishment_ids/i.test(first.error.message)
  ) {
    const fallback = await run(baseSelect);
    if (fallback.error) {
      log.error({ err: fallback.error }, "listAdminVisibilityPromoCodes fallback failed");
      return res.status(500).json({ error: fallback.error.message });
    }

    const rows = (fallback.data ?? []).map((r: any) => ({
      ...r,
      applies_to_establishment_ids: null,
    }));
    return res.json({ ok: true, promo_codes: rows });
  }

  if (first.error) {
    log.error({ err: first.error }, "listAdminVisibilityPromoCodes failed");
    return res.status(500).json({ error: first.error.message });
  }
  res.json({ ok: true, promo_codes: first.data ?? [] });
};

export const createAdminVisibilityPromoCode: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const body = req.body as VisibilityPromoCodeInput;

  const code = normalizePromoCode(body.code);
  if (!code) return res.status(400).json({ error: "Code requis" });

  const discountBps = Math.max(0, Math.min(10000, safeInt(body.discount_bps)));
  if (discountBps <= 0)
    return res.status(400).json({ error: "La remise doit être supérieure à 0" });

  const establishmentIds = normalizeUuidArray(
    body.applies_to_establishment_ids,
  );

  const payload: Record<string, unknown> = {
    code,
    description: safeString(body.description),
    discount_bps: discountBps,
    applies_to_type:
      body.applies_to_type === null
        ? null
        : normalizePromoScopeType(body.applies_to_type),
    applies_to_offer_id:
      typeof body.applies_to_offer_id === "string" &&
      body.applies_to_offer_id.trim()
        ? body.applies_to_offer_id.trim()
        : null,
    active: typeof body.active === "boolean" ? body.active : true,
    starts_at: safeIsoOrNull(body.starts_at),
    ends_at: safeIsoOrNull(body.ends_at),
  };

  if (establishmentIds) payload.applies_to_establishment_ids = establishmentIds;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("visibility_promo_codes")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    log.error({ err: error }, "createAdminVisibilityPromoCode insert failed");
    return res.status(500).json({ error: error.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "visibility.promo.create",
    entity_type: "visibility_promo_codes",
    entity_id: (data as any)?.id ?? null,
    metadata: { after: data, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true, promo_code: data });
};

export const updateAdminVisibilityPromoCode: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const promoId = typeof req.params.id === "string" ? req.params.id : "";
  if (!promoId) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const body = req.body as VisibilityPromoCodeInput;

  const supabase = getAdminSupabase();

  const { data: beforeRow, error: beforeErr } = await supabase
    .from("visibility_promo_codes")
    .select("*")
    .eq("id", promoId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!beforeRow) return res.status(404).json({ error: "promo_not_found" });

  const patch: Record<string, unknown> = {};

  if (body.code !== undefined) {
    const code = normalizePromoCode(body.code);
    if (!code) return res.status(400).json({ error: "Code requis" });
    patch.code = code;
  }

  if (body.description !== undefined)
    patch.description = safeString(body.description);

  if (body.discount_bps !== undefined) {
    const discountBps = Math.max(
      0,
      Math.min(10000, safeInt(body.discount_bps)),
    );
    if (discountBps <= 0)
      return res.status(400).json({ error: "La remise doit être supérieure à 0" });
    patch.discount_bps = discountBps;
  }

  if (body.applies_to_type !== undefined) {
    patch.applies_to_type =
      body.applies_to_type === null
        ? null
        : normalizePromoScopeType(body.applies_to_type);
  }

  if (body.applies_to_offer_id !== undefined) {
    patch.applies_to_offer_id =
      body.applies_to_offer_id === null
        ? null
        : typeof body.applies_to_offer_id === "string" &&
            body.applies_to_offer_id.trim()
          ? body.applies_to_offer_id.trim()
          : null;
  }

  if (body.applies_to_establishment_ids !== undefined) {
    patch.applies_to_establishment_ids = normalizeUuidArray(
      body.applies_to_establishment_ids,
    );
  }

  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.starts_at !== undefined)
    patch.starts_at = safeIsoOrNull(body.starts_at);
  if (body.ends_at !== undefined) patch.ends_at = safeIsoOrNull(body.ends_at);

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const { data, error } = await supabase
    .from("visibility_promo_codes")
    .update(patch)
    .eq("id", promoId)
    .select("*")
    .single();
  if (error) {
    log.error({ err: error, promoId }, "updateAdminVisibilityPromoCode failed");
    return res.status(500).json({ error: error.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "visibility.promo.update",
    entity_type: "visibility_promo_codes",
    entity_id: promoId,
    metadata: {
      before: beforeRow,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({ ok: true, promo_code: data });
};

export const deleteAdminVisibilityPromoCode: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const promoId = typeof req.params.id === "string" ? req.params.id : "";
  if (!promoId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: beforeRow } = await supabase
    .from("visibility_promo_codes")
    .select("*")
    .eq("id", promoId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("visibility_promo_codes")
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq("id", promoId)
    .select("*")
    .single();

  if (error) {
    log.error({ err: error, promoId }, "deleteAdminVisibilityPromoCode failed");
    return res.status(500).json({ error: error.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "visibility.promo.delete",
    entity_type: "visibility_promo_codes",
    entity_id: promoId,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Consumer Promo Codes
// ---------------------------------------------------------------------------

export const listAdminConsumerPromoCodes: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const includeDeleted =
    typeof req.query.include_deleted === "string"
      ? req.query.include_deleted === "true"
      : false;
  const supabase = getAdminSupabase();

  const select =
    "id,code,description,discount_bps,applies_to_pack_id,applies_to_establishment_ids,active,starts_at,ends_at,created_at,updated_at,deleted_at";

  let q = supabase
    .from("consumer_promo_codes")
    .select(select)
    .order("created_at", { ascending: false })
    .limit(500);
  if (!includeDeleted) q = q.is("deleted_at", null);

  const { data, error } = await q;
  if (error) {
    // Graceful fallback when the migration hasn't been applied yet.
    if (
      /relation .*consumer_promo_codes.* does not exist/i.test(error.message)
    ) {
      return res.json({ ok: true, promo_codes: [] });
    }
    log.error({ err: error }, "listAdminConsumerPromoCodes failed");
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, promo_codes: data ?? [] });
};

export const createAdminConsumerPromoCode: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const body = req.body as ConsumerPromoCodeInput;

  const code = normalizePromoCode(body.code);
  if (!code) return res.status(400).json({ error: "Code requis" });

  const discountBps = Math.max(0, Math.min(10000, safeInt(body.discount_bps)));
  if (discountBps <= 0)
    return res.status(400).json({ error: "La remise doit être supérieure à 0" });

  const packId =
    typeof body.applies_to_pack_id === "string" &&
    body.applies_to_pack_id.trim()
      ? body.applies_to_pack_id.trim()
      : null;
  if (packId && !isUuid(packId))
    return res.status(400).json({ error: "invalid_pack_id" });

  const establishmentIds = normalizeUuidArray(
    body.applies_to_establishment_ids,
  );

  const payload: Record<string, unknown> = {
    code,
    description: safeString(body.description),
    discount_bps: discountBps,
    applies_to_pack_id: packId,
    active: typeof body.active === "boolean" ? body.active : true,
    starts_at: safeIsoOrNull(body.starts_at),
    ends_at: safeIsoOrNull(body.ends_at),
  };

  if (establishmentIds) payload.applies_to_establishment_ids = establishmentIds;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("consumer_promo_codes")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    log.error({ err: error }, "createAdminConsumerPromoCode insert failed");
    return res.status(500).json({ error: error.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "consumer.promo.create",
    entity_type: "consumer_promo_codes",
    entity_id: (data as any)?.id ?? null,
    metadata: { after: data, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  return res.json({ ok: true, promo_code: data });
};

export const updateAdminConsumerPromoCode: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const promoId = typeof req.params.id === "string" ? req.params.id : "";
  if (!promoId) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const body = req.body as ConsumerPromoCodeInput;

  const supabase = getAdminSupabase();

  const { data: beforeRow, error: beforeErr } = await supabase
    .from("consumer_promo_codes")
    .select("*")
    .eq("id", promoId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!beforeRow) return res.status(404).json({ error: "promo_not_found" });

  const patch: Record<string, unknown> = {};

  if (body.code !== undefined) {
    const code = normalizePromoCode(body.code);
    if (!code) return res.status(400).json({ error: "Code requis" });
    patch.code = code;
  }

  if (body.description !== undefined)
    patch.description = safeString(body.description);

  if (body.discount_bps !== undefined) {
    const discountBps = Math.max(
      0,
      Math.min(10000, safeInt(body.discount_bps)),
    );
    if (discountBps <= 0)
      return res.status(400).json({ error: "La remise doit être supérieure à 0" });
    patch.discount_bps = discountBps;
  }

  if (body.applies_to_pack_id !== undefined) {
    const packId =
      body.applies_to_pack_id === null
        ? null
        : typeof body.applies_to_pack_id === "string" &&
            body.applies_to_pack_id.trim()
          ? body.applies_to_pack_id.trim()
          : null;

    if (packId && !isUuid(packId))
      return res.status(400).json({ error: "invalid_pack_id" });
    patch.applies_to_pack_id = packId;
  }

  if (body.applies_to_establishment_ids !== undefined) {
    patch.applies_to_establishment_ids = normalizeUuidArray(
      body.applies_to_establishment_ids,
    );
  }

  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.starts_at !== undefined)
    patch.starts_at = safeIsoOrNull(body.starts_at);
  if (body.ends_at !== undefined) patch.ends_at = safeIsoOrNull(body.ends_at);

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const { data, error } = await supabase
    .from("consumer_promo_codes")
    .update(patch)
    .eq("id", promoId)
    .select("*")
    .single();
  if (error) {
    log.error({ err: error, promoId }, "updateAdminConsumerPromoCode failed");
    return res.status(500).json({ error: error.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "consumer.promo.update",
    entity_type: "consumer_promo_codes",
    entity_id: promoId,
    metadata: {
      before: beforeRow,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  return res.json({ ok: true, promo_code: data });
};

export const deleteAdminConsumerPromoCode: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const promoId = typeof req.params.id === "string" ? req.params.id : "";
  if (!promoId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: beforeRow } = await supabase
    .from("consumer_promo_codes")
    .select("*")
    .eq("id", promoId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("consumer_promo_codes")
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq("id", promoId)
    .select("*")
    .single();

  if (error) {
    log.error({ err: error, promoId }, "deleteAdminConsumerPromoCode failed");
    return res.status(500).json({ error: error.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "consumer.promo.delete",
    entity_type: "consumer_promo_codes",
    entity_id: promoId,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  return res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Visibility Orders
// ---------------------------------------------------------------------------

export const listAdminVisibilityOrders: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 100;

  const paymentStatus =
    typeof req.query.payment_status === "string"
      ? req.query.payment_status.trim().toLowerCase()
      : "all";
  const status =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "all";

  const supabase = getAdminSupabase();

  let q = supabase
    .from("visibility_orders")
    .select(
      "id,establishment_id,created_by_user_id,payment_status,status,currency,subtotal_cents,tax_cents,total_cents,paid_at,meta,created_at,updated_at,establishments(id,name,city)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (paymentStatus !== "all" && paymentStatus)
    q = q.eq("payment_status", paymentStatus);
  if (status !== "all" && status) q = q.eq("status", status);

  const { data: orders, error } = await q;
  if (error) {
    log.error({ err: error }, "listAdminVisibilityOrders failed");
    return res.status(500).json({ error: error.message });
  }

  const orderIds = (orders ?? [])
    .map((o: any) => (typeof o?.id === "string" ? o.id : ""))
    .filter((x: string) => !!x);

  const itemsByOrderId = new Map<string, any[]>();
  if (orderIds.length) {
    const { data: items, error: itemsErr } = await supabase
      .from("visibility_order_items")
      .select(
        "id,order_id,offer_id,title,description,type,deliverables,duration_days,quantity,unit_price_cents,total_price_cents,currency,tax_rate_bps,tax_label,meta,created_at",
      )
      .in("order_id", orderIds)
      .order("created_at", { ascending: true })
      .limit(5000);

    if (itemsErr) {
      log.error({ err: itemsErr }, "listAdminVisibilityOrders items fetch failed");
      return res.status(500).json({ error: itemsErr.message });
    }

    for (const it of (items ?? []) as any[]) {
      const oid = typeof it?.order_id === "string" ? it.order_id : "";
      if (!oid) continue;
      const list = itemsByOrderId.get(oid) ?? [];
      list.push(it);
      itemsByOrderId.set(oid, list);
    }
  }

  const financeByOrderId = new Map<
    string,
    { id: string; invoice_number: string; issued_at: string }
  >();
  if (orderIds.length) {
    try {
      const { data: fin, error: finErr } = await supabase
        .from("finance_invoices")
        .select("id,reference_id,invoice_number,issued_at")
        .eq("reference_type", "visibility_order")
        .in("reference_id", orderIds)
        .limit(1000);

      if (finErr) throw finErr;

      for (const row of (fin ?? []) as Array<Record<string, unknown>>) {
        const refId =
          typeof row.reference_id === "string" ? row.reference_id : "";
        const id = typeof row.id === "string" ? row.id : "";
        const invoiceNumber =
          typeof row.invoice_number === "string" ? row.invoice_number : "";
        const issuedAt = typeof row.issued_at === "string" ? row.issued_at : "";
        if (refId && id && invoiceNumber && issuedAt)
          financeByOrderId.set(refId, {
            id,
            invoice_number: invoiceNumber,
            issued_at: issuedAt,
          });
      }
    } catch (err) {
      log.warn({ err }, "Non-fatal: failed to fetch finance invoices for visibility orders");
    }
  }

  const out = (orders ?? []).map((o: any) => {
    const id = typeof o?.id === "string" ? o.id : "";
    const fin = id ? financeByOrderId.get(id) : undefined;
    return {
      ...o,
      items: id ? (itemsByOrderId.get(id) ?? []) : [],
      finance_invoice: fin ?? null,
    };
  });

  res.json({ ok: true, orders: out });
};

export const updateAdminVisibilityOrderStatus: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const orderId = typeof req.params.id === "string" ? req.params.id : "";
  if (!orderId) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const statusRaw =
    typeof req.body.status === "string"
      ? req.body.status.trim().toLowerCase()
      : "";

  const nextStatus = (() => {
    if (statusRaw === "pending") return "pending";
    if (statusRaw === "in_progress") return "in_progress";
    if (statusRaw === "delivered") return "delivered";
    if (statusRaw === "cancelled") return "cancelled";
    if (statusRaw === "refunded") return "refunded";
    return null;
  })();

  if (!nextStatus) return res.status(400).json({ error: "invalid_status" });

  const supabase = getAdminSupabase();

  const { data: beforeRow, error: beforeErr } = await supabase
    .from("visibility_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!beforeRow) return res.status(404).json({ error: "order_not_found" });

  const patch: Record<string, unknown> = { status: nextStatus };

  // If admin marks refunded, keep payment_status consistent.
  if (nextStatus === "refunded") patch.payment_status = "refunded";

  const { error: updateError } = await supabase
    .from("visibility_orders")
    .update(patch)
    .eq("id", orderId);
  if (updateError) {
    log.error({ err: updateError, orderId }, "updateAdminVisibilityOrderStatus failed");
    return res.status(500).json({ error: updateError.message });
  }

  // Fetch the updated order with establishment
  const { data: updatedOrder, error: fetchError } = await supabase
    .from("visibility_orders")
    .select("*,establishments(id,name,city)")
    .eq("id", orderId)
    .single();
  if (fetchError) return res.status(500).json({ error: fetchError.message });

  // Fetch items separately
  const { data: items } = await supabase
    .from("visibility_order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  // Fetch finance invoice separately
  let financeInvoice = null;
  try {
    const { data: fin } = await supabase
      .from("finance_invoices")
      .select("id,invoice_number,issued_at")
      .eq("reference_type", "visibility_order")
      .eq("reference_id", orderId)
      .maybeSingle();
    if (fin) financeInvoice = fin;
  } catch (err) {
    log.warn({ err }, "Non-fatal: failed to fetch finance invoice for order detail");
  }

  const fullOrder = {
    ...updatedOrder,
    items: items ?? [],
    finance_invoice: financeInvoice,
  };

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "visibility.order.update_status",
    entity_type: "visibility_orders",
    entity_id: orderId,
    metadata: {
      before: beforeRow,
      after: fullOrder,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({ ok: true, order: fullOrder });
};

export const updateAdminVisibilityOrderItemMeta: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const orderId =
    typeof req.params.orderId === "string" ? req.params.orderId : "";
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";

  if (!orderId) return res.status(400).json({ error: "Identifiant de commande requis" });
  if (!itemId) return res.status(400).json({ error: "Identifiant d'article requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const metaRaw = (req.body as any).meta;
  const meta = isRecord(metaRaw) ? metaRaw : null;
  if (!meta) return res.status(400).json({ error: "Les métadonnées doivent être un objet" });

  const supabase = getAdminSupabase();

  const { data: beforeRow, error: beforeErr } = await supabase
    .from("visibility_order_items")
    .select("id,order_id,meta")
    .eq("id", itemId)
    .eq("order_id", orderId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!beforeRow) return res.status(404).json({ error: "item_not_found" });

  const { data, error } = await supabase
    .from("visibility_order_items")
    .update({ meta })
    .eq("id", itemId)
    .eq("order_id", orderId)
    .select("id,order_id,meta")
    .single();

  if (error) {
    log.error({ err: error, orderId, itemId }, "updateAdminVisibilityOrderItemMeta failed");
    return res.status(500).json({ error: error.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "visibility.order_item.update_meta",
    entity_type: "visibility_order_items",
    entity_id: itemId,
    metadata: {
      before: beforeRow,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({ ok: true, item: data });
};

// ---------------------------------------------------------------------------
// Visibility Invoice
// ---------------------------------------------------------------------------

export const getAdminVisibilityInvoice: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const invoiceId =
    typeof req.params.invoiceId === "string" ? req.params.invoiceId : "";
  if (!invoiceId)
    return res.status(400).json({ error: "Identifiant de facture requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("finance_invoices")
    .select(
      "id,invoice_number,issued_at,reference_type,reference_id,amount_cents,currency,status,snapshot,pdf_url,created_at,updated_at",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    log.error({ err: error, invoiceId }, "getAdminVisibilityInvoice failed");
    return res.status(500).json({ error: error.message });
  }
  if (!data) return res.status(404).json({ error: "invoice_not_found" });

  res.json({ ok: true, invoice: data });
};
