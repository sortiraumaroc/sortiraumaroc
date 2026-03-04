/**
 * Routes API PRO - Visibility (SAM Media) offers, orders, finance dashboard & payouts
 *
 * Extracted from the monolithic pro.ts.
 *
 * Endpoints for:
 * - Listing visibility offers
 * - Validating promo codes
 * - Checkout & confirm visibility orders
 * - Listing visibility orders & invoices
 * - Downloading invoice PDFs
 * - Demo account seeding
 * - Finance dashboard
 * - Terms acceptance
 * - Bank details
 * - Payout windows, requests
 */

import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

import { getAdminSupabase } from "../supabaseAdmin";
import { emitAdminNotification } from "../adminNotifications";
import { notifyProMembers } from "../proNotifications";
import { ensureInvoiceForVisibilityOrder } from "../finance";
import { generateVisibilityOrderInvoicePdf } from "../subscriptions/usernameInvoicing";
import { sendLoggedEmail, sendTemplateEmail } from "../emailService";
import { NotificationEventType } from "../../shared/notifications";
import { createModuleLogger } from "../lib/logger";
import {
  parseBearerToken,
  getUserFromBearerToken,
  ensureRole,
  ensureCanViewBilling,
  isRecord,
  asString,
  listInternalVisibilityOrderEmails,
  isDemoRoutesAllowed,
  getDemoProCredentials,
  getDemoProEmail,
  type ProUser,
  type ProRole,
} from "./proHelpers";

const log = createModuleLogger("proVisibility");

// ---------------------------------------------------------------------------
// Visibilité (SAM Media) - offers + orders
// ---------------------------------------------------------------------------

type VisibilityOfferRow = {
  id: string;
  title: string;
  description: string | null;
  type: "pack" | "option" | string;
  deliverables: string[] | null;
  duration_days: number | null;
  price_cents: number | null;
  currency: string | null;
  active: boolean | null;
  allow_quantity: boolean | null;
  tax_rate_bps: number | null;
  tax_label: string | null;
  display_order: number | null;
  deleted_at?: string | null;
};

/** Parse a value as an integer; returns 0 when the value is not a finite number. */
export function safeInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return 0;
}

function safeCurrency(v: unknown): string {
  const c = typeof v === "string" ? v.trim().toUpperCase() : "";
  return c || "MAD";
}

function normalizeVisibilityStatus(v: unknown): "pending" | "in_progress" | "delivered" | "cancelled" | "refunded" {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "in_progress") return "in_progress";
  if (s === "delivered") return "delivered";
  if (s === "cancelled") return "cancelled";
  if (s === "refunded") return "refunded";
  return "pending";
}

function createStubEventId(): string {
  const rand = Math.random().toString(16).slice(2, 10);
  return `stub_evt_${Date.now()}_${rand}`;
}

function createStubTransactionId(orderId: string): string {
  const rand = Math.random().toString(16).slice(2, 8);
  return `stub_txn_${orderId.slice(0, 8)}_${Date.now()}_${rand}`;
}

function appendStringToMetaList(meta: Record<string, unknown>, key: string, value: string, max = 50): Record<string, unknown> {
  const list = Array.isArray(meta[key]) ? (meta[key] as unknown[]) : [];
  const existing = list.filter((x) => typeof x === "string") as string[];
  const next = existing.includes(value) ? existing : [...existing, value].slice(-max);
  return { ...meta, [key]: next };
}

type VisibilityPromoCodeRow = {
  id: string;
  code: string;
  description: string | null;
  discount_bps: number | null;
  applies_to_type: string | null;
  applies_to_offer_id: string | null;
  applies_to_establishment_ids: string[] | null;
  active: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  deleted_at: string | null;
};

function normalizePromoCode(v: unknown): string {
  return typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, "") : "";
}

function isWithinPromoWindow(row: VisibilityPromoCodeRow, now = new Date()): boolean {
  const startIso = row.starts_at;
  const endIso = row.ends_at;
  if (startIso) {
    const s = new Date(startIso);
    if (Number.isFinite(s.getTime()) && s.getTime() > now.getTime()) return false;
  }
  if (endIso) {
    const e = new Date(endIso);
    if (Number.isFinite(e.getTime()) && e.getTime() < now.getTime()) return false;
  }
  return true;
}

function normalizePromoEstablishmentIds(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;

  const out: string[] = [];
  for (const raw of v) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= 200) break;
  }

  return out.length ? out : null;
}

function promoAppliesToEstablishment(promo: VisibilityPromoCodeRow, establishmentId: string): boolean {
  const list = normalizePromoEstablishmentIds((promo as any).applies_to_establishment_ids) ?? null;
  if (!list || list.length === 0) return true;
  return list.includes(establishmentId);
}

async function getActiveVisibilityPromoCode(args: { code: string; establishmentId: string }): Promise<VisibilityPromoCodeRow | null> {
  const code = args.code;
  if (!code) return null;

  const supabase = getAdminSupabase();

  const baseSelect = "id,code,description,discount_bps,applies_to_type,applies_to_offer_id,active,starts_at,ends_at,deleted_at";
  const selectWithEst = `${baseSelect},applies_to_establishment_ids`;

  const run = async (select: string) => {
    return await supabase
      .from("visibility_promo_codes")
      .select(select)
      .is("deleted_at", null)
      .eq("active", true)
      .eq("code", code)
      .limit(1)
      .maybeSingle();
  };

  const first = await run(selectWithEst);
  const res = first.error && /applies_to_establishment_ids/i.test(first.error.message) ? await run(baseSelect) : first;

  if (res.error) return null;
  const row = res.data as any as VisibilityPromoCodeRow | null;
  if (!row?.id) return null;
  if (!isWithinPromoWindow(row)) return null;
  if (!promoAppliesToEstablishment(row, args.establishmentId)) return null;

  const normalizedIds = normalizePromoEstablishmentIds((row as any).applies_to_establishment_ids);
  return { ...(row as any), applies_to_establishment_ids: normalizedIds } as VisibilityPromoCodeRow;
}

function promoAppliesToOffer(promo: VisibilityPromoCodeRow, offer: VisibilityOfferRow): boolean {
  const offerType = String(offer.type ?? "").toLowerCase();
  const promoType = promo.applies_to_type ? String(promo.applies_to_type).toLowerCase() : null;
  if (promo.applies_to_offer_id && String(promo.applies_to_offer_id) === String(offer.id)) return true;
  if (promoType) return promoType === offerType;
  return true;
}

function computePromoDiscountCents(args: { promo: VisibilityPromoCodeRow; lines: Array<{ offer: VisibilityOfferRow; quantity: number }> }): {
  eligibleSubtotalCents: number;
  discountCents: number;
} {
  const bps = Math.max(0, Math.min(10000, safeInt(args.promo.discount_bps)));
  if (bps <= 0) return { eligibleSubtotalCents: 0, discountCents: 0 };

  let eligibleSubtotalCents = 0;
  for (const line of args.lines) {
    if (!promoAppliesToOffer(args.promo, line.offer)) continue;
    const unit = Math.max(0, safeInt(line.offer.price_cents));
    eligibleSubtotalCents += unit * Math.max(1, Math.min(50, safeInt(line.quantity)));
  }

  const discountCents = Math.round((eligibleSubtotalCents * bps) / 10000);
  return { eligibleSubtotalCents, discountCents: Math.max(0, discountCents) };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const listProVisibilityOffers: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const filterType = typeof req.query.type === "string" ? req.query.type.trim().toLowerCase() : "";

  const supabase = getAdminSupabase();
  let q = supabase
    .from("visibility_offers")
    .select("id,title,description,type,deliverables,duration_days,price_cents,currency,active,allow_quantity,tax_rate_bps,tax_label,display_order,deleted_at")
    .is("deleted_at", null)
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);

  if (filterType) {
    q = q.eq("type", filterType);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const offers = (data ?? []).map((o: any) => ({
    ...o,
    // Keep legacy client compatibility (some UIs expect is_active)
    is_active: typeof o?.active === "boolean" ? o.active : Boolean(o?.is_active),
  }));

  return res.json({ ok: true, offers });
};

export const validateProVisibilityPromoCode: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  if (!Array.isArray((req.body as any).items)) return res.status(400).json({ error: "items is required" });

  const promoCode = normalizePromoCode((req.body as any).promo_code);
  if (!promoCode) return res.status(400).json({ error: "promo_code is required" });

  const rawItems = (req.body as any).items as Array<Record<string, unknown>>;
  const normalized = rawItems
    .map((it) => {
      const offerId = typeof it.offer_id === "string" ? it.offer_id.trim() : "";
      const qty = typeof it.quantity === "number" && Number.isFinite(it.quantity) ? Math.floor(it.quantity) : safeInt(it.quantity);
      return { offer_id: offerId, quantity: Math.max(1, Math.min(50, qty || 1)) };
    })
    .filter((x) => x.offer_id);

  if (!normalized.length) return res.status(400).json({ error: "No valid items" });

  const offerIds = [...new Set(normalized.map((x) => x.offer_id))];
  const supabase = getAdminSupabase();

  const { data: offers, error: offersErr } = await supabase
    .from("visibility_offers")
    .select("id,title,description,type,deliverables,duration_days,price_cents,currency,active,allow_quantity,tax_rate_bps,tax_label,display_order,deleted_at")
    .in("id", offerIds)
    .is("deleted_at", null)
    .limit(200);

  if (offersErr) return res.status(500).json({ error: offersErr.message });

  const byId = new Map<string, VisibilityOfferRow>();
  for (const o of (offers ?? []) as any[]) {
    if (typeof o?.id === "string") byId.set(o.id, o as VisibilityOfferRow);
  }

  const lines: Array<{ offer: VisibilityOfferRow; quantity: number }> = [];
  let subtotalCents = 0;
  let currency = "MAD";

  for (const line of normalized) {
    const off = byId.get(line.offer_id);
    if (!off || off.active !== true) return res.status(400).json({ error: "offer_inactive", offer_id: line.offer_id });

    const allowQty = off.allow_quantity === true;
    const quantity = allowQty ? line.quantity : 1;
    const unit = Math.max(0, safeInt(off.price_cents));

    subtotalCents += unit * quantity;
    currency = safeCurrency(off.currency);

    lines.push({ offer: off, quantity });
  }

  const promo = await getActiveVisibilityPromoCode({ code: promoCode, establishmentId });
  if (!promo) return res.status(404).json({ error: "promo_not_found" });

  const { eligibleSubtotalCents, discountCents } = computePromoDiscountCents({ promo, lines });
  if (eligibleSubtotalCents <= 0 || discountCents <= 0) {
    return res.status(400).json({ error: "promo_not_applicable" });
  }

  const totalCents = Math.max(0, subtotalCents - discountCents);

  return res.json({
    ok: true,
    promo: {
      code: promo.code,
      description: promo.description,
      discount_bps: safeInt(promo.discount_bps),
      applies_to_type: promo.applies_to_type,
      applies_to_offer_id: promo.applies_to_offer_id,
      applies_to_establishment_ids: promo.applies_to_establishment_ids,
    },
    eligible_subtotal_cents: eligibleSubtotalCents,
    discount_cents: discountCents,
    currency,
    total_cents: totalCents,
  });
};

export const checkoutProVisibilityCart: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  if (!Array.isArray((req.body as any).items)) return res.status(400).json({ error: "items is required" });

  const promoCode = normalizePromoCode((req.body as any).promo_code);

  const rawItems = (req.body as any).items as Array<Record<string, unknown>>;
  if (!rawItems.length) return res.status(400).json({ error: "items is required" });

  const normalized = rawItems
    .map((it) => {
      const offerId = typeof it.offer_id === "string" ? it.offer_id.trim() : "";
      const qty = typeof it.quantity === "number" && Number.isFinite(it.quantity) ? Math.floor(it.quantity) : safeInt(it.quantity);
      return { offer_id: offerId, quantity: Math.max(1, Math.min(50, qty || 1)) };
    })
    .filter((x) => x.offer_id);

  if (!normalized.length) return res.status(400).json({ error: "No valid items" });

  const offerIds = [...new Set(normalized.map((x) => x.offer_id))];
  const supabase = getAdminSupabase();

  const { data: offers, error: offersErr } = await supabase
    .from("visibility_offers")
    .select("id,title,description,type,deliverables,duration_days,price_cents,currency,active,allow_quantity,tax_rate_bps,tax_label,display_order,deleted_at")
    .in("id", offerIds)
    .is("deleted_at", null)
    .limit(200);

  if (offersErr) return res.status(500).json({ error: offersErr.message });

  const byId = new Map<string, VisibilityOfferRow>();
  for (const o of (offers ?? []) as any[]) {
    if (typeof o?.id === "string") byId.set(o.id, o as VisibilityOfferRow);
  }

  for (const id of offerIds) {
    const off = byId.get(id);
    if (!off || off.active !== true) {
      return res.status(400).json({ error: "offer_inactive", offer_id: id });
    }
    const price = typeof off.price_cents === "number" && Number.isFinite(off.price_cents) ? Math.round(off.price_cents) : null;
    if (price == null || price <= 0) {
      return res.status(400).json({ error: "offer_missing_price", offer_id: id });
    }
  }

  const orderItems: Array<Record<string, unknown>> = [];

  const computedLines: Array<{ offer: VisibilityOfferRow; quantity: number }> = [];

  let subtotalCents = 0;
  let taxCents = 0;
  let currency = "MAD";

  for (const line of normalized) {
    const off = byId.get(line.offer_id)!;

    const allowQty = off.allow_quantity === true;
    const quantity = allowQty ? line.quantity : 1;

    const unit = Math.max(0, safeInt(off.price_cents));
    const lineSubtotal = unit * quantity;

    const rateBps = Math.max(0, safeInt(off.tax_rate_bps));
    const lineTax = Math.round((lineSubtotal * rateBps) / 10000);

    subtotalCents += lineSubtotal;
    taxCents += lineTax;

    currency = safeCurrency(off.currency);

    orderItems.push({
      offer_id: off.id,
      title: off.title,
      description: off.description,
      type: off.type,
      deliverables: Array.isArray(off.deliverables) ? off.deliverables : [],
      duration_days: off.duration_days ?? null,
      quantity,
      unit_price_cents: unit,
      total_price_cents: lineSubtotal,
      currency,
      tax_rate_bps: rateBps,
      tax_label: off.tax_label ?? "TVA",
    });

    computedLines.push({ offer: off, quantity });
  }

  let discountCents = 0;
  let promoMeta: Record<string, unknown> | null = null;

  if (promoCode) {
    const promo = await getActiveVisibilityPromoCode({ code: promoCode, establishmentId });
    if (!promo) return res.status(400).json({ error: "promo_not_found" });

    const { eligibleSubtotalCents, discountCents: computedDiscount } = computePromoDiscountCents({ promo, lines: computedLines });
    if (eligibleSubtotalCents <= 0 || computedDiscount <= 0) {
      return res.status(400).json({ error: "promo_not_applicable" });
    }

    discountCents = Math.min(subtotalCents, computedDiscount);
    promoMeta = {
      code: promo.code,
      promo_id: promo.id,
      discount_bps: safeInt(promo.discount_bps),
      discount_cents: discountCents,
      eligible_subtotal_cents: eligibleSubtotalCents,
      applies_to_type: promo.applies_to_type,
      applies_to_offer_id: promo.applies_to_offer_id,
      applies_to_establishment_ids: promo.applies_to_establishment_ids,
    };

    subtotalCents = Math.max(0, subtotalCents - discountCents);
  }

  const totalCents = subtotalCents + taxCents;

  if (totalCents <= 0) return res.status(400).json({ error: "empty_total" });

  const meta: Record<string, unknown> = {
    buyer_user_id: userResult.user.id,
    buyer_role: `pro:${permission.role}`,
    cart: {
      items: normalized,
      promo_code: promoCode || null,
    },
    promo: promoMeta,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("visibility_orders")
    .insert({
      establishment_id: establishmentId,
      created_by_user_id: userResult.user.id,
      payment_status: "pending",
      status: "pending",
      currency,
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: totalCents,
      meta,
    })
    .select("id")
    .single();

  if (insErr) return res.status(500).json({ error: insErr.message });

  const orderId = typeof (inserted as any)?.id === "string" ? String((inserted as any).id) : "";
  if (!orderId) return res.status(500).json({ error: "order_create_failed" });

  const itemRows = orderItems.map((it) => ({ ...it, order_id: orderId }));
  const { error: itemsInsertErr } = await supabase.from("visibility_order_items").insert(itemRows);
  if (itemsInsertErr) return res.status(500).json({ error: itemsInsertErr.message });

  // Notify admin that a visibility order has been created (pending payment)
  try {
    await emitAdminNotification({
      type: "visibility_order_created",
      title: "Demande visibilité créée",
      body: `Commande créée · ${Math.round(totalCents / 100)} ${currency}`,
      data: { establishmentId, orderId, paymentStatus: "pending", source: "pro_checkout" },
    });
  } catch (err) {
    log.warn({ err }, "visibility order created notification failed");
  }

  // Email interne (best-effort)
  void (async () => {
    try {
      const to = listInternalVisibilityOrderEmails();
      if (!to.length) return;

      const baseUrl = (process.env.PUBLIC_BASE_URL || "https://sam.ma").trim() || "https://sam.ma";
      const adminUrl = `${baseUrl}/admin/visibility`;

      const { data: estRow } = await supabase
        .from("establishments")
        .select("name,city")
        .eq("id", establishmentId)
        .maybeSingle();

      const establishmentName = typeof (estRow as any)?.name === "string" ? String((estRow as any).name) : "";
      const establishmentCity = typeof (estRow as any)?.city === "string" ? String((estRow as any).city) : "";
      const estLabel = establishmentName
        ? `${establishmentName}${establishmentCity ? ` (${establishmentCity})` : ""}`
        : establishmentId;

      const amountLabel = totalCents > 0 ? `${Math.round(totalCents / 100)} ${currency}` : "";

      await sendLoggedEmail({
        emailId: `admin_visibility_order_created:${orderId}`,
        fromKey: "pro",
        to,
        subject: `Nouvelle commande Visibilité — ${establishmentName || establishmentId}`,
        bodyText: [
          "Une nouvelle commande Visibilité vient d'être créée.",
          "",
          `Établissement: ${estLabel}`,
          `Commande: ${orderId}`,
          "Paiement: pending",
          amountLabel ? `Montant: ${amountLabel}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        ctaLabel: "Ouvrir dans l'admin",
        ctaUrl: adminUrl,
        meta: {
          source: "pro.createProVisibilityOrder",
          establishment_id: establishmentId,
          order_id: orderId,
          payment_status: "pending",
        },
      });
    } catch (err) {
      log.warn({ err }, "visibility order created email failed");
    }
  })();

  const allowDemoRoutes = isDemoRoutesAllowed();

  return res.json({
    ok: true,
    order_id: orderId,
    payment: {
      provider: allowDemoRoutes ? "stub" : "unknown",
      status: "pending",
      confirm_endpoint: allowDemoRoutes
        ? `/api/pro/establishments/${encodeURIComponent(establishmentId)}/visibility/orders/${encodeURIComponent(orderId)}/confirm`
        : null,
    },
  });
};

export const confirmProVisibilityOrder: RequestHandler = async (req, res) => {
  if (!isDemoRoutesAllowed()) return res.status(404).json({ error: "not_found" });

  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const orderId = typeof req.params.orderId === "string" ? req.params.orderId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!orderId) return res.status(400).json({ error: "orderId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data: existing, error: selErr } = await supabase
    .from("visibility_orders")
    .select("id,establishment_id,created_by_user_id,payment_status,status,currency,total_cents,meta")
    .eq("id", orderId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (selErr) return res.status(500).json({ error: selErr.message });
  if (!existing?.id) return res.status(404).json({ error: "order_not_found" });

  const meta = isRecord((existing as any).meta) ? ({ ...((existing as any).meta as Record<string, unknown>) } as Record<string, unknown>) : {};

  // Only the creator can confirm in demo mode.
  const creatorId = asString((existing as any).created_by_user_id);
  if (creatorId && creatorId !== userResult.user.id) return res.status(403).json({ error: "Forbidden" });

  if (String((existing as any).payment_status ?? "").toLowerCase() === "paid") {
    return res.json({ ok: true, already_paid: true });
  }

  const eventId = createStubEventId();
  const transactionId = createStubTransactionId(orderId);
  const paidAtIso = new Date().toISOString();

  let nextMeta = meta;
  nextMeta = appendStringToMetaList(nextMeta, "payment_event_ids", eventId);
  nextMeta = { ...nextMeta, payment_transaction_id: transactionId, paid_at: paidAtIso };

  const { error: updErr } = await supabase
    .from("visibility_orders")
    .update({ payment_status: "paid", paid_at: paidAtIso, meta: nextMeta })
    .eq("id", orderId)
    .eq("establishment_id", establishmentId);

  if (updErr) return res.status(500).json({ error: updErr.message });

  // ─────────────────────────────────────────────────────────────────────────
  // Menu Digital Provisioning (if order contains menu_digital items)
  // ─────────────────────────────────────────────────────────────────────────
  void (async () => {
    try {
      // Fetch order items to check for menu_digital type
      const { data: orderItems, error: itemsErr } = await supabase
        .from("visibility_order_items")
        .select("id, offer_id, title, type, duration_days, unit_price_cents")
        .eq("order_id", orderId);

      if (itemsErr || !orderItems?.length) return;

      // Find menu_digital items
      const menuDigitalItems = (orderItems as any[]).filter((item) => item.type === "menu_digital");
      if (!menuDigitalItems.length) return;

      // Determine plan from item title (SILVER or PREMIUM)
      const firstItem = menuDigitalItems[0];
      const itemTitle = String(firstItem.title || "").toUpperCase();
      const plan = itemTitle.includes("PREMIUM") ? "premium" : "silver";
      const durationDays = firstItem.duration_days || 365;
      const pricePaidCents = firstItem.unit_price_cents || 0;

      // Fetch establishment details including current subscription
      const { data: estRow, error: estErr } = await supabase
        .from("establishments")
        .select("id, name, slug, username, city, cover_url, description_short, phone, address, menu_digital_expires_at")
        .eq("id", establishmentId)
        .single();

      if (estErr || !estRow) {
        log.error({ err: estErr }, "[Menu Digital] Failed to fetch establishment");
        return;
      }

      const est = estRow as {
        id: string;
        name: string | null;
        slug: string | null;
        username: string | null;
        city: string | null;
        cover_url: string | null;
        description_short: string | null;
        phone: string | null;
        address: string | null;
        menu_digital_expires_at: string | null;
      };

      // Use username or slug as the menu identifier
      const menuSlug = est.username || est.slug;
      if (!menuSlug) {
        log.error("[Menu Digital] Establishment has no username or slug");
        return;
      }

      // Get user email for account creation
      const userEmail = userResult.user.email?.trim() || "";
      if (!userEmail) {
        log.error("[Menu Digital] User has no email");
        return;
      }

      // Calculate expiration date
      // If there's an existing non-expired subscription, extend from that date
      // Otherwise, start from now
      let baseDate = new Date();
      if (est.menu_digital_expires_at) {
        const currentExpiry = new Date(est.menu_digital_expires_at);
        if (currentExpiry > baseDate) {
          // Subscription still active - extend from current expiry
          baseDate = currentExpiry;
          log.info({ from: currentExpiry.toISOString() }, "[Menu Digital] Extending existing subscription");
        }
      }
      const expiresAt = new Date(baseDate);
      expiresAt.setDate(expiresAt.getDate() + durationDays);

      // Provision account on menu_sam
      const MENU_SAM_API_URL = process.env.MENU_SAM_API_URL || "http://localhost:8081";
      const MENU_SAM_SYNC_SECRET = process.env.MENU_SAM_SYNC_SECRET || "";

      const provisionPayload = {
        samEstablishmentId: est.id,
        supabaseUserId: userResult.user.id,
        email: userEmail,
        plan,
        slug: menuSlug,
        establishmentName: est.name || "Sans nom",
        city: est.city,
        coverUrl: est.cover_url,
        description: est.description_short,
        phone: est.phone,
        address: est.address,
        pricePaidCents,
        durationDays,
        expiresAt: expiresAt.toISOString(),
        samOrderId: orderId,
      };

      const provisionResponse = await fetch(`${MENU_SAM_API_URL}/api/sync/provision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sync-Secret": MENU_SAM_SYNC_SECRET,
        },
        body: JSON.stringify(provisionPayload),
      });

      if (!provisionResponse.ok) {
        const errorText = await provisionResponse.text();
        log.error({ errorText }, "[Menu Digital] Provisioning failed");
        return;
      }

      const provisionResult = await provisionResponse.json();
      log.info({ result: provisionResult }, "[Menu Digital] Account provisioned");

      // Update establishment to mark menu digital as enabled with plan and expiration
      await supabase
        .from("establishments")
        .update({
          menu_digital_enabled: true,
          menu_digital_plan: plan,
          menu_digital_expires_at: expiresAt.toISOString(),
          menu_digital_last_sync: paidAtIso,
        })
        .eq("id", establishmentId);

      // Send access email to pro user
      const menuUrl = `${process.env.MENU_DIGITAL_BASE_URL || "https://menu.sam.ma"}/${menuSlug}`;
      const proAccessUrl = `${process.env.MENU_DIGITAL_BASE_URL || "https://menu.sam.ma"}/pro`;

      try {
        await sendTemplateEmail({
          templateKey: "pro_menu_digital_activated",
          lang: "fr",
          fromKey: "pro",
          to: [userEmail],
          variables: {
            establishment: est.name || menuSlug,
            plan: plan === "premium" ? "Premium" : "Silver",
            menu_url: menuUrl,
            pro_access_url: proAccessUrl,
            expires_at: expiresAt.toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
          },
          ctaUrl: proAccessUrl,
          meta: {
            source: "pro.confirmProVisibilityOrder.menuDigital",
            establishment_id: establishmentId,
            order_id: orderId,
            plan,
          },
        });
      } catch (emailErr) {
        log.error({ err: emailErr }, "[Menu Digital] Failed to send activation email");
      }

    } catch (err) {
      log.error({ err }, "[Menu Digital] Provisioning error");
    }
  })();
  // ─────────────────────────────────────────────────────────────────────────

  const actor = { userId: userResult.user.id, role: `pro:${permission.role}` };

  try {
    await ensureInvoiceForVisibilityOrder({
      orderId,
      actor,
      idempotencyKey: `invoice:visibility_order:${orderId}:${eventId}`,
      issuedAtIso: paidAtIso,
    });
  } catch (err) {
    log.warn({ err }, "visibility invoice creation failed");
  }

  try {
    await notifyProMembers({
      supabase,
      establishmentId,
      category: "visibility",
      title: "Commande visibilité payée",
      body: `Paiement confirmé · ${Math.round(safeInt((existing as any).total_cents) / 100)} ${safeCurrency((existing as any).currency)}`,
      data: {
        orderId,
        establishmentId,
        action: "visibility_order_paid",
        event_type: NotificationEventType.payment_received,
        source: "visibility_confirm",
      },
    });

    await emitAdminNotification({
      type: "visibility_order_paid",
      title: "Commande visibilité payée",
      body: `Commande payée · ${Math.round(safeInt((existing as any).total_cents) / 100)} ${safeCurrency((existing as any).currency)}`,
      data: { establishmentId, orderId, paymentStatus: "paid", source: "visibility_confirm" },
    });
  } catch (err) {
    log.warn({ err }, "visibility order paid notification failed");
  }

  // Email interne (best-effort)
  void (async () => {
    try {
      const to = listInternalVisibilityOrderEmails();
      if (!to.length) return;

      const baseUrl = (process.env.PUBLIC_BASE_URL || "https://sam.ma").trim() || "https://sam.ma";
      const adminUrl = `${baseUrl}/admin/visibility`;

      const { data: estRow } = await supabase
        .from("establishments")
        .select("name,city")
        .eq("id", establishmentId)
        .maybeSingle();

      const establishmentName = typeof (estRow as any)?.name === "string" ? String((estRow as any).name) : "";
      const establishmentCity = typeof (estRow as any)?.city === "string" ? String((estRow as any).city) : "";
      const estLabel = establishmentName
        ? `${establishmentName}${establishmentCity ? ` (${establishmentCity})` : ""}`
        : establishmentId;

      const totalCents = safeInt((existing as any).total_cents);
      const currency = safeCurrency((existing as any).currency);
      const amountLabel = totalCents > 0 ? `${Math.round(totalCents / 100)} ${currency}` : "";

      await sendLoggedEmail({
        emailId: `admin_visibility_order_paid:${orderId}`,
        fromKey: "finance",
        to,
        subject: `Commande Visibilité payée — ${establishmentName || establishmentId}`,
        bodyText: [
          "Une commande Visibilité vient d'être payée.",
          "",
          `Établissement: ${estLabel}`,
          `Commande: ${orderId}`,
          amountLabel ? `Montant: ${amountLabel}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        ctaLabel: "Ouvrir dans l'admin",
        ctaUrl: adminUrl,
        meta: {
          source: "pro.confirmProVisibilityOrder",
          establishment_id: establishmentId,
          order_id: orderId,
          payment_status: "paid",
        },
      });
    } catch (err) {
      log.warn({ err }, "visibility paid email failed");
    }
  })();

  // Emails transactionnels (best-effort)
  void (async () => {
    try {
      const baseUrl = (process.env.PUBLIC_BASE_URL || "https://sam.ma").trim() || "https://sam.ma";
      const email = typeof userResult.user.email === "string" ? userResult.user.email.trim() : "";
      if (!email) return;

      const { data: estRow } = await supabase.from("establishments").select("name").eq("id", establishmentId).maybeSingle();
      const establishmentName = typeof (estRow as any)?.name === "string" ? String((estRow as any).name) : "";

      const totalCents = safeInt((existing as any).total_cents);
      const currency = safeCurrency((existing as any).currency);
      const amountLabel = totalCents > 0 ? `${Math.round(totalCents / 100)} ${currency}` : "";

      const visibilityCtaUrl = `${baseUrl}/pro?tab=visibility&eid=${encodeURIComponent(establishmentId)}`;
      const billingCtaUrl = `${baseUrl}/pro?tab=billing&eid=${encodeURIComponent(establishmentId)}`;

      await sendTemplateEmail({
        templateKey: "pro_visibility_activated",
        lang: "fr",
        fromKey: "pro",
        to: [email],
        variables: {
          establishment: establishmentName,
          amount: amountLabel,
          cta_url: visibilityCtaUrl,
        },
        ctaUrl: visibilityCtaUrl,
        meta: {
          source: "pro.confirmProVisibilityOrder",
          establishment_id: establishmentId,
          order_id: orderId,
          payment_status: "paid",
        },
      });

      await sendTemplateEmail({
        templateKey: "finance_invoice_to_pro",
        lang: "fr",
        fromKey: "finance",
        to: [email],
        variables: {
          establishment: establishmentName,
          amount: amountLabel,
          cta_url: billingCtaUrl,
        },
        ctaUrl: billingCtaUrl,
        meta: {
          source: "pro.confirmProVisibilityOrder",
          establishment_id: establishmentId,
          order_id: orderId,
          payment_status: "paid",
        },
      });
    } catch (err) {
      log.warn({ err }, "visibility receipt email failed");
    }
  })();

  return res.json({ ok: true });
};

export const listProVisibilityOrders: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : null;
  const limit = limitRaw != null && Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;

  const { data: orders, error } = await supabase
    .from("visibility_orders")
    .select("id,establishment_id,created_by_user_id,payment_status,status,currency,subtotal_cents,tax_cents,total_cents,paid_at,meta,created_at,updated_at")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });

  const orderIds = (orders ?? [])
    .map((o: any) => (typeof o?.id === "string" ? o.id : ""))
    .filter((x: string) => !!x);

  const itemsByOrderId = new Map<string, Array<Record<string, unknown>>>();
  if (orderIds.length) {
    try {
      const { data: items, error: itemsErr } = await supabase
        .from("visibility_order_items")
        .select("order_id,offer_id,title,description,type,deliverables,duration_days,quantity,unit_price_cents,total_price_cents,currency,tax_rate_bps,tax_label")
        .in("order_id", orderIds)
        .order("created_at", { ascending: true })
        .limit(1000);

      if (itemsErr) throw itemsErr;

      for (const it of (items ?? []) as Array<Record<string, unknown>>) {
        const oid = typeof it.order_id === "string" ? it.order_id : "";
        if (!oid) continue;
        const list = itemsByOrderId.get(oid) ?? [];
        list.push(it);
        itemsByOrderId.set(oid, list);
      }
    } catch (err) {
      log.warn({ err }, "fetch visibility order items failed");
    }
  }

  const financeByOrderId = new Map<string, { invoice_number: string; issued_at: string }>();
  if (orderIds.length) {
    try {
      const { data: fin, error: finErr } = await supabase
        .from("finance_invoices")
        .select("reference_id,invoice_number,issued_at")
        .eq("reference_type", "visibility_order")
        .in("reference_id", orderIds)
        .limit(500);

      if (finErr) throw finErr;

      for (const row of (fin ?? []) as Array<Record<string, unknown>>) {
        const refId = typeof row.reference_id === "string" ? row.reference_id : "";
        const invoiceNumber = typeof row.invoice_number === "string" ? row.invoice_number : "";
        const issuedAt = typeof row.issued_at === "string" ? row.issued_at : "";
        if (refId && invoiceNumber && issuedAt) financeByOrderId.set(refId, { invoice_number: invoiceNumber, issued_at: issuedAt });
      }
    } catch (err) {
      log.warn({ err }, "fetch finance invoices failed");
    }
  }

  const enriched = (orders ?? []).map((o: any) => {
    const id = typeof o?.id === "string" ? o.id : "";
    const fin = id ? financeByOrderId.get(id) : undefined;
    return {
      ...o,
      items: id ? itemsByOrderId.get(id) ?? [] : [],
      invoice_number: fin?.invoice_number ?? null,
      invoice_issued_at: fin?.issued_at ?? null,
    };
  });

  return res.json({ ok: true, orders: enriched });
};

export const getProVisibilityOrderInvoice: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const orderId = typeof req.params.orderId === "string" ? req.params.orderId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!orderId) return res.status(400).json({ error: "orderId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data: order, error: orderErr } = await supabase
    .from("visibility_orders")
    .select("id")
    .eq("id", orderId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (orderErr) return res.status(500).json({ error: orderErr.message });
  if (!order) return res.status(404).json({ error: "order_not_found" });

  const actor = { userId: userResult.user.id, role: `pro:${permission.role}` };

  try {
    const fin = await ensureInvoiceForVisibilityOrder({
      orderId,
      actor,
      idempotencyKey: `invoice:visibility_order:${orderId}`,
    });

    if (!fin) return res.status(400).json({ error: "invoice_unavailable" });

    return res.json({
      ok: true,
      invoice: {
        id: fin.id,
        invoice_number: fin.invoice_number,
        issued_at: fin.issued_at,
        amount_cents: fin.amount_cents,
        currency: fin.currency,
        reference_type: fin.reference_type,
        reference_id: fin.reference_id,
      },
    });
  } catch (e) {
    log.error({ err: e }, "getProVisibilityOrderInvoice failed");
    return res.status(500).json({ error: "invoice_error" });
  }
};

export const downloadProVisibilityOrderInvoicePdf: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const orderId = typeof req.params.orderId === "string" ? req.params.orderId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!orderId) return res.status(400).json({ error: "orderId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data: order, error: orderErr } = await supabase
    .from("visibility_orders")
    .select("id,payment_status")
    .eq("id", orderId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (orderErr) return res.status(500).json({ error: orderErr.message });
  if (!order) return res.status(404).json({ error: "order_not_found" });

  const paymentStatus = typeof (order as any).payment_status === "string"
    ? ((order as any).payment_status as string).toLowerCase()
    : "";

  if (paymentStatus !== "paid") {
    return res.status(400).json({ error: "order_not_paid" });
  }

  try {
    const result = await generateVisibilityOrderInvoicePdf(orderId);

    if (!result) {
      return res.status(404).json({ error: "invoice_not_found" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Content-Length", result.pdf.length);
    return res.send(result.pdf);
  } catch (e) {
    log.error({ err: e }, "downloadProVisibilityOrderInvoicePdf failed");
    return res.status(500).json({ error: "pdf_generation_error" });
  }
};

export const ensureProDemoAccount: RequestHandler = async (_req, res) => {
  if (!isDemoRoutesAllowed()) return res.status(404).json({ error: "not_found" });

  const creds = getDemoProCredentials();
  if (!creds) return res.status(500).json({ error: "demo_not_configured" });

  const supabase = getAdminSupabase();

  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) return res.status(500).json({ error: listErr.message });

  const existing = (list.users ?? []).find((u) => (u.email ?? "").toLowerCase() === creds.email);

  let userId = existing?.id ?? null;

  if (!userId) {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: creds.email,
      password: creds.password,
      email_confirm: true,
    });

    if (createErr || !created.user) {
      return res.status(500).json({ error: createErr?.message ?? "Impossible de créer le compte démo" });
    }

    userId = created.user.id;
  }

  const desired = [
    {
      demo_index: 1,
      name: "Démo — Riad Atlas",
      city: "Marrakech",
      universe: "restaurant" as const,
      subcategory: "Restaurant",
    },
    {
      demo_index: 2,
      name: "Démo — Oasis Spa",
      city: "Casablanca",
      universe: "loisir" as const,
      subcategory: "Spa / Loisirs",
    },
    {
      demo_index: 3,
      name: "Démo — Atlas Lodge",
      city: "Agadir",
      universe: "hebergement" as const,
      subcategory: "Hôtel / Lodge",
    },
  ];

  const { data: current, error: currentErr } = await supabase
    .from("establishments")
    .select("id,name,city,universe,subcategory,extra")
    .eq("created_by", userId)
    .contains("extra", { demo: true })
    .order("created_at", { ascending: true });

  if (currentErr) return res.status(500).json({ error: currentErr.message });

  const byIndex = new Map<number, { id: string; universe: string }>();

  for (const row of (current ?? []) as Array<{ id: string; universe: string; subcategory: string | null; extra: unknown }>) {
    const extra = (row.extra ?? {}) as Record<string, unknown>;
    const idx = typeof extra.demo_index === "number" ? extra.demo_index : null;
    if (idx) byIndex.set(idx, { id: row.id, universe: row.universe });

    if (!row.subcategory) {
      void supabase.from("establishments").update({ subcategory: row.universe }).eq("id", row.id);
    }
  }

  for (const d of desired) {
    if (byIndex.has(d.demo_index)) continue;

    const { data: created, error: createErr } = await supabase
      .from("establishments")
      .insert({
        name: d.name,
        city: d.city,
        universe: d.universe,
        subcategory: d.subcategory,
        created_by: userId,
        status: "active",
        verified: true,
        extra: {
          demo: true,
          demo_index: d.demo_index,
        },
      })
      .select("id,universe")
      .single();

    if (createErr || !created) {
      return res.status(500).json({ error: createErr?.message ?? "Impossible de créer l'établissement démo" });
    }

    byIndex.set(d.demo_index, { id: (created as { id: string }).id, universe: (created as { universe: string }).universe });
  }

  const establishments = desired.map((d) => {
    const found = byIndex.get(d.demo_index);
    if (!found) throw new Error("demo establishment missing");
    return { id: found.id, universe: found.universe, idx: d.demo_index };
  });

  for (const e of establishments) {
    const { data: mem, error: memErr } = await supabase
      .from("pro_establishment_memberships")
      .select("id")
      .eq("establishment_id", e.id)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (memErr) return res.status(500).json({ error: memErr.message });

    if (!(mem as { id: string } | null)?.id) {
      const { error: createMemErr } = await supabase.from("pro_establishment_memberships").insert({
        establishment_id: e.id,
        user_id: userId,
        role: "owner",
      });

      if (createMemErr) return res.status(500).json({ error: createMemErr.message });
    }

    const { count: visitsCount } = await supabase
      .from("establishment_visits")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", e.id)
      .eq("session_id", "demo-seed");

    if (!visitsCount) {
      const now = Date.now();
      const visits = Array.from({ length: 60 }, (_, i) => {
        const daysAgo = i % 20;
        return {
          establishment_id: e.id,
          session_id: "demo-seed",
          path: "/results",
          visited_at: new Date(now - daysAgo * 24 * 60 * 60 * 1000 - i * 60 * 60 * 1000).toISOString(),
        };
      });
      const { error } = await supabase.from("establishment_visits").insert(visits);
      if (error) return res.status(500).json({ error: error.message });
    }

    const { count: resCount } = await supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", e.id)
      .eq("meta->>demo", "true");

    if (!resCount) {
      const base = new Date();
      const mk = (days: number, hours: number) => {
        const d = new Date(base);
        d.setDate(d.getDate() + days);
        d.setHours(hours, 0, 0, 0);
        return d.toISOString();
      };

      const rows = [
        { status: "confirmed", pay: "paid", days: -2, h: 20, party: 2, total: 45000, dep: 15000 },
        { status: "confirmed", pay: "paid", days: -5, h: 21, party: 4, total: 98000, dep: 25000 },
        { status: "noshow", pay: "paid", days: -8, h: 19, party: 2, total: 32000, dep: 12000 },
        { status: "cancelled", pay: "refunded", days: -10, h: 20, party: 3, total: 60000, dep: 18000 },

        // Demande NON garantie (pas de prépaiement)
        { status: "requested", pay: "pending", days: 1, h: 20, party: 2, total: 38000, dep: null },

        // Demande GARANTIE (prépayée / acompte)
        { status: "requested", pay: "paid", days: 3, h: 19, party: 5, total: 120000, dep: 30000 },
      ];

      const reservations = rows.map((r) => {
        const commissionPercent = 10;
        const deposit = typeof r.dep === "number" ? r.dep : null;
        const commissionAmount = deposit ? Math.round((deposit * commissionPercent) / 100) : null;

        return {
          booking_reference: `DEMO-${e.idx}-${randomUUID().slice(0, 8)}`,
          kind: e.universe,
          establishment_id: e.id,
          status: r.status,
          starts_at: mk(r.days, r.h),
          party_size: r.party,
          amount_total: r.total,
          amount_deposit: deposit,
          currency: "MAD",
          payment_status: r.pay,
          commission_percent: commissionPercent,
          commission_amount: commissionAmount,
          meta: {
            demo: true,
          },
        };
      });

      const { error } = await supabase.from("reservations").insert(reservations);
      if (error) return res.status(500).json({ error: error.message });
    }

    const { count: packsCount } = await supabase
      .from("packs")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", e.id)
      .eq("label", "DEMO");

    if (!packsCount) {
      const packs = [
        {
          establishment_id: e.id,
          title: "Pack découverte",
          description: "Offre spéciale démo",
          label: "DEMO",
          items: [],
          price: 19900,
          original_price: 24900,
          is_limited: true,
          stock: 50,
          availability: "permanent",
          active: true,
        },
        {
          establishment_id: e.id,
          title: "Pack premium",
          description: "Meilleure offre démo",
          label: "DEMO",
          items: [],
          price: 34900,
          original_price: 44900,
          is_limited: true,
          stock: 25,
          availability: "permanent",
          active: true,
        },
      ];

      const { error } = await supabase.from("packs").insert(packs);
      if (error) return res.status(500).json({ error: error.message });
    }

    const { count: slotsCount } = await supabase
      .from("pro_slots")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", e.id);

    if (!slotsCount) {
      const now = new Date();
      const slots = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() + i + 1);
        d.setHours(18 + (i % 3), 0, 0, 0);

        return {
          establishment_id: e.id,
          starts_at: d.toISOString(),
          ends_at: null,
          capacity: 20 + i * 5,
          base_price: 0,
          promo_type: i % 2 === 0 ? "percent" : null,
          promo_value: i % 2 === 0 ? 15 : null,
          promo_label: i % 2 === 0 ? "DEMO" : null,
          active: true,
        };
      });

      const { error } = await supabase.from("pro_slots").insert(slots);
      if (error) return res.status(500).json({ error: error.message });
    }

    const { count: invCount } = await supabase
      .from("pro_invoices")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", e.id);

    if (!invCount) {
      const today = new Date();
      const periodStart = new Date(today);
      periodStart.setDate(1);
      const periodEnd = new Date(today);
      periodEnd.setDate(28);

      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 10);

      const invoices = [
        {
          establishment_id: e.id,
          period_start: periodStart.toISOString().slice(0, 10),
          period_end: periodEnd.toISOString().slice(0, 10),
          currency: "MAD",
          commission_total: 8500,
          visibility_total: 12000,
          amount_due: 20500,
          status: "due",
          due_date: dueDate.toISOString().slice(0, 10),
          line_items: [{ demo: true, label: "Commissions", amount: 8500 }, { demo: true, label: "Visibilité", amount: 12000 }],
        },
        {
          establishment_id: e.id,
          period_start: new Date(periodStart.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          period_end: new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          currency: "MAD",
          commission_total: 7600,
          visibility_total: 0,
          amount_due: 7600,
          status: "paid",
          due_date: new Date(dueDate.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          paid_at: new Date(dueDate.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
          line_items: [{ demo: true, label: "Commissions", amount: 7600 }],
        },
      ];

      const { error } = await supabase.from("pro_invoices").insert(invoices);
      if (error) return res.status(500).json({ error: error.message });
    }

    const { count: notifCount } = await supabase
      .from("pro_notifications")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", e.id)
      .eq("category", "demo");

    if (!notifCount) {
      const { error } = await supabase.from("pro_notifications").insert([
        {
          user_id: userId,
          establishment_id: e.id,
          category: "demo",
          title: "Bienvenue dans le compte démo",
          body: "Explorez les réservations, packs, factures et statistiques.",
          data: { demo: true },
        },
        {
          user_id: userId,
          establishment_id: e.id,
          category: "demo",
          title: "Astuce",
          body: "Dans Réservations, testez les actions Check-in / Annuler / No-show.",
          data: { demo: true },
        },
      ]);
      if (error) return res.status(500).json({ error: error.message });
    }
  }

  return res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// PRO Finance Dashboard & Payout Workflow
// ---------------------------------------------------------------------------

type ProFinanceDashboard = {
  establishment_id: string;
  currency: string;
  total_payable_cents: number;
  eligible_at: string | null;
  window_start: string | null;
  window_end: string | null;
  payout_requests_count: number;
  next_eligible_payout: {
    date: string;
    amount_cents: number;
  } | null;
};

export const getProFinanceDashboard: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  // Get pending payout batches (eligible for payout request)
  const { data: payouts, error: payoutsErr } = await supabase
    .from("finance_payouts")
    .select("id,amount_cents,currency,status,window_start,window_end,eligible_at")
    .eq("establishment_id", establishmentId)
    .in("status", ["pending", "processing"])
    .order("eligible_at", { ascending: true })
    .limit(100);

  if (payoutsErr) return res.status(500).json({ error: payoutsErr.message });

  const currency = (payouts?.[0] as any)?.currency ?? "MAD";

  const totalPayableCents = (payouts ?? []).reduce((sum: number, p: any) => {
    const amt = typeof p?.amount_cents === "number" ? Math.round(p.amount_cents) : 0;
    return sum + amt;
  }, 0);

  const nextEligible = (payouts ?? []).find((p: any) => {
    const eligibleAt = p?.eligible_at ? new Date(p.eligible_at) : null;
    return eligibleAt && eligibleAt <= new Date();
  });

  // Count existing payout requests
  const { count: requestsCount, error: requestsErr } = await supabase
    .from("finance_payout_requests")
    .select("id", { count: "exact", head: true })
    .eq("establishment_id", establishmentId);

  if (requestsErr) return res.status(500).json({ error: requestsErr.message });

  const dashboard: ProFinanceDashboard = {
    establishment_id: establishmentId,
    currency,
    total_payable_cents: totalPayableCents,
    eligible_at: (nextEligible as any)?.eligible_at ?? null,
    window_start: (nextEligible as any)?.window_start ?? null,
    window_end: (nextEligible as any)?.window_end ?? null,
    payout_requests_count: requestsCount ?? 0,
    next_eligible_payout: nextEligible
      ? {
          date: (nextEligible as any).eligible_at ?? "",
          amount_cents: typeof (nextEligible as any).amount_cents === "number" ? Math.round((nextEligible as any).amount_cents) : 0,
        }
      : null,
  };

  res.json({ ok: true, dashboard });
};

export const acceptProTerms: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const termsVersion = asString(req.body.terms_version);
  if (!termsVersion) return res.status(400).json({ error: "terms_version is required" });

  const supabase = getAdminSupabase();

  // Record acceptance
  const { error: insertErr } = await supabase.from("finance_pro_terms_acceptances").insert({
    establishment_id: establishmentId,
    user_id: userResult.user.id,
    terms_version: termsVersion,
    accepted_at: new Date().toISOString(),
  });

  if (insertErr) return res.status(500).json({ error: insertErr.message });

  res.json({ ok: true });
};

export const getProBankDetails: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("finance_pro_bank_details")
    .select(
      "id,establishment_id,bank_code,bank_name,bank_address,holder_name,holder_address,rib_24,is_validated,validated_at,validated_by,created_at,updated_at",
    )
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, item: data ?? null });
};

type PayoutWindow = {
  window_start: string;
  window_end: string;
  eligible_at: string;
  payout_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  has_request: boolean;
};

export const listProPayoutWindows: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  // Fetch all payouts with payout requests
  const { data: payouts, error: payoutsErr } = await supabase
    .from("finance_payouts")
    .select("id,amount_cents,currency,status,window_start,window_end,eligible_at")
    .eq("establishment_id", establishmentId)
    .order("eligible_at", { ascending: false })
    .limit(100);

  if (payoutsErr) return res.status(500).json({ error: payoutsErr.message });

  const payoutIds = (payouts ?? []).map((p: any) => p?.id).filter(Boolean);

  let requestsByPayoutId = new Map<string, boolean>();
  if (payoutIds.length) {
    const { data: requests, error: requestsErr } = await supabase
      .from("finance_payout_requests")
      .select("payout_id")
      .in("payout_id", payoutIds)
      .limit(1000);

    if (!requestsErr) {
      requestsByPayoutId = new Map((requests ?? []).map((r: any) => [r?.payout_id, true]));
    }
  }

  const windows: PayoutWindow[] = (payouts ?? []).map((p: any) => ({
    window_start: p?.window_start ?? "",
    window_end: p?.window_end ?? "",
    eligible_at: p?.eligible_at ?? "",
    payout_id: p?.id ?? "",
    amount_cents: typeof p?.amount_cents === "number" ? Math.round(p.amount_cents) : 0,
    currency: p?.currency ?? "MAD",
    status: p?.status ?? "pending",
    has_request: requestsByPayoutId.has(p?.id),
  }));

  res.json({ ok: true, windows });
};

type CreatePayoutRequestResult = {
  id: string;
  payout_id: string;
  establishment_id: string;
  status: string;
  pro_comment: string | null;
  created_at: string;
};

export const createProPayoutRequest: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const payoutId = asString(req.body.payout_id);
  const proComment = asString(req.body.pro_comment);

  if (!payoutId) return res.status(400).json({ error: "payout_id is required" });

  const supabase = getAdminSupabase();

  // Verify payout exists and belongs to this establishment + is eligible
  const { data: payout, error: payoutErr } = await supabase
    .from("finance_payouts")
    .select("id,establishment_id,status,amount_cents,currency,window_start,window_end,eligible_at")
    .eq("id", payoutId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (payoutErr) return res.status(500).json({ error: payoutErr.message });
  if (!payout) return res.status(404).json({ error: "payout_not_found" });

  const eligibleAt = (payout as any)?.eligible_at ? new Date((payout as any).eligible_at) : null;
  if (!eligibleAt || eligibleAt > new Date()) {
    return res.status(400).json({ error: "payout_not_yet_eligible" });
  }

  // Check for existing request
  const { data: existing, error: existingErr } = await supabase
    .from("finance_payout_requests")
    .select("id")
    .eq("payout_id", payoutId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (existing) return res.status(409).json({ error: "payout_request_already_exists" });

  // Create request
  const { data: created, error: createErr } = await supabase
    .from("finance_payout_requests")
    .insert({
      payout_id: payoutId,
      establishment_id: establishmentId,
      status: "submitted",
      created_by_user_id: userResult.user.id,
      pro_comment: proComment ?? null,
    })
    .select("id,payout_id,establishment_id,status,pro_comment,created_at")
    .single();

  if (createErr) return res.status(500).json({ error: createErr.message });

  // Notify admin
  void emitAdminNotification({
    type: "payout_request_submitted",
    title: "Nouvelle demande de payout",
    body: `PRO ${establishmentId.slice(0, 8)} a soumis une demande de payout (${typeof (payout as any)?.amount_cents === "number" ? (payout as any).amount_cents / 100 : 0} MAD)`,
    data: { payoutRequestId: (created as any)?.id ?? "", payoutId, establishmentId },
  });

  // Email interne (best-effort) — aligné avec la création Superadmin.
  void (async () => {
    try {
      const baseUrl = (process.env.PUBLIC_BASE_URL || "https://sam.ma").trim() || "https://sam.ma";
      const emailDomain = (process.env.EMAIL_DOMAIN || "sortiraumaroc.ma").trim() || "sortiraumaroc.ma";

      const toRaw = (process.env.FINANCE_PAYOUT_REQUEST_EMAIL || `finance@${emailDomain}`).trim();
      const to = Array.from(
        new Set(
          toRaw
            .split(/[,;\s]+/g)
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      );

      if (!to.length) return;

      const { data: estRow } = await supabase
        .from("establishments")
        .select("name")
        .eq("id", establishmentId)
        .maybeSingle();

      const establishmentName =
        typeof (estRow as any)?.name === "string" && String((estRow as any).name).trim()
          ? String((estRow as any).name).trim()
          : establishmentId.slice(0, 8);

      const amountCents = typeof (payout as any)?.amount_cents === "number" ? Math.round((payout as any).amount_cents) : 0;
      const currency = safeCurrency((payout as any)?.currency);
      const amountLabel = amountCents > 0 ? `${Math.round(amountCents / 100)} ${currency}` : "";

      const windowStart = typeof (payout as any)?.window_start === "string" ? String((payout as any).window_start) : "";
      const windowEnd = typeof (payout as any)?.window_end === "string" ? String((payout as any).window_end) : "";
      const eligibleAtIso = typeof (payout as any)?.eligible_at === "string" ? String((payout as any).eligible_at) : "";

      const proEmail = typeof userResult.user.email === "string" ? userResult.user.email.trim() : "";
      const adminUrl = `${baseUrl}/admin/finance/payout-requests`;

      let ribLabel = "Non renseigné";
      let ribValidatedLabel = "En attente";
      try {
        const { data: bankRow } = await supabase
          .from("finance_pro_bank_details")
          .select("rib_24,is_validated")
          .eq("establishment_id", establishmentId)
          .maybeSingle();

        const rib24 = typeof (bankRow as any)?.rib_24 === "string" ? String((bankRow as any).rib_24).trim() : "";
        if (rib24) ribLabel = rib24;
        ribValidatedLabel = (bankRow as any)?.is_validated ? "Validé" : "En attente";
      } catch (err) {
        log.warn({ err }, "fetch bank details failed");
      }

      await sendTemplateEmail({
        templateKey: "pro_payout_request_created",
        lang: "fr",
        fromKey: "finance",
        to,
        variables: {
          establishment: establishmentName,
          establishment_id: establishmentId,
          payout_request_id: String((created as any)?.id ?? ""),
          payout_id: payoutId,
          amount: amountLabel,
          window_start: windowStart,
          window_end: windowEnd,
          eligible_at: eligibleAtIso,
          pro_user_id: userResult.user.id,
          pro_email: proEmail,
          pro_comment: proComment ?? "",

          rib: ribLabel,
          rib_status: ribValidatedLabel,

          cta_url: adminUrl,
        },
        ctaUrl: adminUrl,
        emailId: `payout_request_created:${String((created as any)?.id ?? payoutId)}`,
        meta: {
          source: "pro.createProPayoutRequest",
          establishment_id: establishmentId,
          payout_request_id: String((created as any)?.id ?? ""),
          payout_id: payoutId,
        },
      });
    } catch (err) {
      log.warn({ err }, "payout request email failed");
    }
  })();

  res.json({ ok: true, item: created as CreatePayoutRequestResult });
};

export const listProPayoutRequests: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  // Fetch payout requests with payout details
  const { data: requests, error: requestsErr } = await supabase
    .from("finance_payout_requests")
    .select("id,payout_id,status,pro_comment,created_at")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (requestsErr) return res.status(500).json({ error: requestsErr.message });

  // Fetch related payouts
  const payoutIds = (requests ?? []).map((r: any) => r?.payout_id).filter(Boolean);
  let payoutsByPayoutId = new Map<string, any>();
  if (payoutIds.length) {
    const { data: payouts, error: payoutsErr } = await supabase
      .from("finance_payouts")
      .select("id,window_start,window_end,eligible_at,amount_cents,currency,status")
      .in("id", payoutIds)
      .limit(1000);

    if (!payoutsErr) {
      payoutsByPayoutId = new Map((payouts ?? []).map((p: any) => [p?.id, p]));
    }
  }

  const result = (requests ?? [])
    .map((r: any) => {
      const payout = payoutsByPayoutId.get(r?.payout_id);
      return {
        id: r?.id,
        payout_id: r?.payout_id,
        status: r?.status,
        pro_comment: r?.pro_comment,
        created_at: r?.created_at,
        payout: payout
          ? {
              window_start: payout.window_start,
              window_end: payout.window_end,
              eligible_at: payout.eligible_at,
              amount_cents: typeof payout.amount_cents === "number" ? Math.round(payout.amount_cents) : 0,
              currency: payout.currency,
              status: payout.status,
            }
          : null,
      };
    });

  res.json({ ok: true, requests: result });
};
