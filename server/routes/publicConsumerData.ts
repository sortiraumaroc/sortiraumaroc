import type { Request, Response } from "express";

import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("publicConsumerData");

import { emitAdminNotification } from "../adminNotifications";
import { notifyProMembers } from "../proNotifications";
import { emitConsumerUserEvent } from "../consumerNotifications";
import { formatLeJjMmAaAHeure, formatDateLongFr } from "../../shared/datetime";
import { NotificationEventType } from "../../shared/notifications";
import {
  OCCUPYING_RESERVATION_STATUSES,
} from "../../shared/reservationStates";
import { sendTemplateEmail } from "../emailService";
import { isDemoRoutesAllowed } from "./publicEstablishments";
import {
  ensureEscrowHoldForPackPurchase,
  ensureInvoiceForPackPurchase,
  settleEscrowForReservation,
  ensureInvoiceForReservation,
} from "../finance";
import {
  determineBookingSource,
  type BookingSource,
} from "../lib/bookingAttribution";

import {
  getAdminSupabase,
  isUuid,
  asString,
  asRecord,
  asInt,
  centsToMad,
  dateYmdToEndOfDayIso,
  addDaysIso,
  normalizeUniverseToPackUniverse,
  buildEstablishmentDetailsUrl,
  getUserFromBearerToken,
  getRequestLang,
  getRequestBaseUrl,
  getRequestIp,
} from "./publicHelpers";

export async function listConsumerPackPurchases(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const { data: purchases, error: purchasesErr } = await supabase
    .from("pack_purchases")
    .select("*")
    .contains("meta", { buyer_user_id: userResult.userId })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (purchasesErr)
    return res.status(500).json({ error: purchasesErr.message });

  const purchaseArr = (purchases ?? []) as Array<Record<string, unknown>>;

  const establishmentIds = Array.from(
    new Set(
      purchaseArr
        .map((p) =>
          typeof p.establishment_id === "string" ? p.establishment_id : "",
        )
        .filter(Boolean),
    ),
  );

  const packIds = Array.from(
    new Set(
      purchaseArr
        .map((p) => (typeof p.pack_id === "string" ? p.pack_id : ""))
        .filter(Boolean),
    ),
  );

  const [{ data: establishments }, { data: packs }] = await Promise.all([
    establishmentIds.length
      ? supabase
          .from("establishments")
          .select("id,name,universe")
          .in("id", establishmentIds)
          .limit(500)
      : Promise.resolve({ data: [] as unknown[] }),
    packIds.length
      ? supabase.from("packs").select("id,title").in("id", packIds).limit(500)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const establishmentById = new Map<string, Record<string, unknown>>();
  for (const e of (establishments ?? []) as Array<Record<string, unknown>>) {
    const id = typeof e.id === "string" ? e.id : "";
    if (id) establishmentById.set(id, e);
  }

  const packById = new Map<string, Record<string, unknown>>();
  for (const p of (packs ?? []) as Array<Record<string, unknown>>) {
    const id = typeof p.id === "string" ? p.id : "";
    if (id) packById.set(id, p);
  }

  const now = Date.now();

  const items = purchaseArr
    .map((row) => {
      const meta = asRecord(row.meta);
      if (meta && meta.hidden_by_user === true) return null;

      const id = typeof row.id === "string" ? row.id : "";
      const establishmentId =
        typeof row.establishment_id === "string" ? row.establishment_id : "";
      const packId = typeof row.pack_id === "string" ? row.pack_id : "";
      if (!id || !establishmentId || !packId) return null;

      const est = establishmentById.get(establishmentId) ?? {};
      const pack = packById.get(packId) ?? {};

      const universe = normalizeUniverseToPackUniverse(est.universe);
      const establishmentName =
        typeof est.name === "string" ? est.name : undefined;

      const unitCents = asInt(row.unit_price) ?? 0;
      const qty = Math.max(1, Math.min(50, asInt(row.quantity) ?? 1));

      const createdAtIso =
        typeof row.created_at === "string" && row.created_at
          ? row.created_at
          : new Date().toISOString();
      const validUntilIso =
        typeof row.valid_until === "string" && row.valid_until
          ? row.valid_until
          : addDaysIso(new Date(createdAtIso), 45);

      const statusRaw =
        typeof row.status === "string"
          ? row.status.trim().toLowerCase()
          : "active";
      const status =
        statusRaw === "used" ||
        statusRaw === "refunded" ||
        statusRaw === "active"
          ? statusRaw
          : "active";

      // If the pack expired, keep status=active but the UI will display "Expiré" based on validUntilIso.
      const validUntilTs = Date.parse(validUntilIso);
      const expired = Number.isFinite(validUntilTs) && validUntilTs < now;

      const paymentStatus =
        typeof row.payment_status === "string"
          ? row.payment_status.trim().toLowerCase()
          : "paid";
      const payment = {
        status:
          paymentStatus === "paid" ||
          paymentStatus === "pending" ||
          paymentStatus === "refunded"
            ? paymentStatus
            : "pending",
        currency: String(row.currency ?? "MAD").toUpperCase(),
        depositAmount: centsToMad(unitCents) ?? 0,
        totalAmount: centsToMad(asInt(row.total_price) ?? unitCents * qty) ?? 0,
        paidAtIso: paymentStatus === "paid" ? createdAtIso : undefined,
        methodLabel:
          paymentStatus === "paid"
            ? "Paiement sécurisé"
            : "Paiement en attente",
      };

      const title =
        typeof pack.title === "string" && pack.title.trim()
          ? pack.title.trim()
          : typeof meta?.pack_title === "string"
            ? String(meta.pack_title).trim()
            : "Pack";

      return {
        id,
        packId,
        title,
        universe,
        establishmentId,
        establishmentName,
        detailsUrl: buildEstablishmentDetailsUrl(establishmentId, est.universe),
        quantity: qty,
        unitMad: centsToMad(unitCents) ?? 0,
        validFromIso: createdAtIso,
        validUntilIso,
        createdAtIso,
        payment,
        status: expired && status === "active" ? "active" : status,
      };
    })
    .filter(Boolean);

  return res.json({ ok: true, items });
}

function normalizeConsumerPromoCode(v: unknown): string | null {
  const s =
    typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, "") : "";
  return s ? s : null;
}

function isWithinPromoWindow(args: {
  now: Date;
  startsAt: unknown;
  endsAt: unknown;
}): boolean {
  const nowMs = args.now.getTime();

  const startsMs =
    typeof args.startsAt === "string" ? new Date(args.startsAt).getTime() : NaN;
  if (Number.isFinite(startsMs) && nowMs < startsMs) return false;

  const endsMs =
    typeof args.endsAt === "string" ? new Date(args.endsAt).getTime() : NaN;
  if (Number.isFinite(endsMs) && nowMs > endsMs) return false;

  return true;
}

function promoAppliesToEstablishment(args: {
  promoEstablishmentIds: unknown;
  establishmentId: string;
}): boolean {
  const list = Array.isArray(args.promoEstablishmentIds)
    ? (args.promoEstablishmentIds as unknown[])
    : [];
  const ids = list.filter((x) => typeof x === "string") as string[];
  if (!ids.length) return true;
  return ids.includes(args.establishmentId);
}

export async function checkoutConsumerPack(req: Request, res: Response) {
  if (!isDemoRoutesAllowed())
    return res.status(404).json({ error: "not_found" });

  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const body = asRecord(req.body) ?? {};

  const packId = asString(body.pack_id) ?? asString(body.packId);
  if (!packId || !isUuid(packId))
    return res.status(400).json({ error: "invalid_pack_id" });

  const quantityRaw = asInt(body.quantity);
  const quantity = Math.max(1, Math.min(50, quantityRaw ?? 1));

  const contact = asRecord(body.contact) ?? {};
  const buyerName =
    asString(body.buyer_name) ??
    asString(body.buyerName) ??
    asString(contact.full_name) ??
    asString(contact.name);
  const buyerEmail =
    asString(body.buyer_email) ??
    asString(body.buyerEmail) ??
    asString(contact.email);

  const supabase = getAdminSupabase();

  const { data: pack, error: packErr } = await supabase
    .from("packs")
    .select(
      "id,establishment_id,title,price,active,is_limited,stock,valid_from,valid_to",
    )
    .eq("id", packId)
    .maybeSingle();

  if (packErr) return res.status(500).json({ error: packErr.message });
  if (!pack) return res.status(404).json({ error: "pack_not_found" });

  const active = (pack as any).active !== false;
  if (!active) return res.status(400).json({ error: "pack_inactive" });

  const establishmentId = String((pack as any).establishment_id ?? "");
  if (!establishmentId || !isUuid(establishmentId))
    return res.status(500).json({ error: "invalid_pack_establishment" });

  const unitPrice = asInt((pack as any).price) ?? 0;
  if (!unitPrice || unitPrice <= 0)
    return res.status(500).json({ error: "invalid_pack_price" });

  const isLimited = (pack as any).is_limited === true;
  const stock = (pack as any).stock == null ? null : asInt((pack as any).stock);

  if (isLimited && stock != null && stock <= 0) {
    return res.status(400).json({ error: "pack_out_of_stock" });
  }

  if (isLimited && stock != null && quantity > stock) {
    return res.status(400).json({ error: "pack_stock_insufficient" });
  }

  const { data: establishment, error: estErr } = await supabase
    .from("establishments")
    .select("id,name,universe")
    .eq("id", establishmentId)
    .maybeSingle();

  if (estErr) return res.status(500).json({ error: estErr.message });

  const universe = normalizeUniverseToPackUniverse(
    (establishment as any)?.universe,
  );

  const validTo =
    typeof (pack as any).valid_to === "string"
      ? String((pack as any).valid_to).trim()
      : "";
  const validUntilIso =
    dateYmdToEndOfDayIso(validTo) ?? addDaysIso(new Date(), 45);

  const promoCode =
    normalizeConsumerPromoCode(
      asString(body.promo_code) ?? asString(body.promoCode),
    ) ?? normalizeConsumerPromoCode(asString(body.promo));

  const subtotalCents = Math.max(0, Math.round(unitPrice * quantity));
  let discountCents = 0;
  let promoMeta: Record<string, unknown> | null = null;

  if (promoCode) {
    try {
      const { data: promo, error: promoErr } = await supabase
        .from("consumer_promo_codes")
        .select(
          "id,code,discount_bps,applies_to_pack_id,applies_to_establishment_ids,active,starts_at,ends_at,max_uses_total,max_uses_per_user,deleted_at",
        )
        .eq("code", promoCode)
        .is("deleted_at", null)
        .maybeSingle();

      if (promoErr) throw promoErr;
      if (!promo?.id || (promo as any).active === false)
        return res.status(404).json({ error: "promo_not_found" });

      const now = new Date();
      if (
        !isWithinPromoWindow({
          now,
          startsAt: (promo as any).starts_at,
          endsAt: (promo as any).ends_at,
        })
      ) {
        return res.status(400).json({ error: "promo_not_active" });
      }

      const appliesToPackId =
        typeof (promo as any).applies_to_pack_id === "string"
          ? String((promo as any).applies_to_pack_id)
          : "";
      if (appliesToPackId && appliesToPackId !== packId)
        return res.status(400).json({ error: "promo_not_applicable" });

      if (
        !promoAppliesToEstablishment({
          promoEstablishmentIds: (promo as any).applies_to_establishment_ids,
          establishmentId,
        })
      ) {
        return res.status(400).json({ error: "promo_not_applicable" });
      }

      const maxUsesTotal = asInt((promo as any).max_uses_total);
      const maxUsesPerUser = asInt((promo as any).max_uses_per_user);

      if (
        (maxUsesTotal != null && maxUsesTotal > 0) ||
        (maxUsesPerUser != null && maxUsesPerUser > 0)
      ) {
        const promoId = String((promo as any).id ?? "");
        if (!promoId) return res.status(400).json({ error: "promo_invalid" });

        const [totalRes, userRes] = await Promise.all([
          maxUsesTotal != null && maxUsesTotal > 0
            ? supabase
                .from("consumer_promo_code_redemptions")
                .select("id", { count: "exact", head: true })
                .eq("promo_code_id", promoId)
            : Promise.resolve({ count: null, error: null } as any),
          maxUsesPerUser != null && maxUsesPerUser > 0
            ? supabase
                .from("consumer_promo_code_redemptions")
                .select("id", { count: "exact", head: true })
                .eq("promo_code_id", promoId)
                .eq("user_id", userResult.userId)
            : Promise.resolve({ count: null, error: null } as any),
        ]);

        if (totalRes?.error) throw totalRes.error;
        if (userRes?.error) throw userRes.error;

        const totalCount =
          typeof totalRes?.count === "number" ? totalRes.count : 0;
        const userCount =
          typeof userRes?.count === "number" ? userRes.count : 0;

        if (
          maxUsesTotal != null &&
          maxUsesTotal > 0 &&
          totalCount >= maxUsesTotal
        ) {
          return res.status(400).json({ error: "promo_maxed_out" });
        }

        if (
          maxUsesPerUser != null &&
          maxUsesPerUser > 0 &&
          userCount >= maxUsesPerUser
        ) {
          return res.status(400).json({ error: "promo_user_limit_reached" });
        }
      }

      const bps = Math.max(
        0,
        Math.min(10000, asInt((promo as any).discount_bps) ?? 0),
      );
      if (bps <= 0) return res.status(400).json({ error: "promo_invalid" });

      discountCents = Math.max(
        0,
        Math.min(subtotalCents, Math.round((subtotalCents * bps) / 10000)),
      );
      promoMeta = {
        promo_id: (promo as any).id,
        code: promoCode,
        discount_bps: bps,
        subtotal_cents: subtotalCents,
        discount_cents: discountCents,
      };
    } catch (e: any) {
      const msg = typeof e?.message === "string" ? e.message : "";
      if (/relation .*consumer_promo_codes.* does not exist/i.test(msg)) {
        return res.status(400).json({ error: "promo_unavailable" });
      }
      return res.status(500).json({ error: msg || "promo_error" });
    }
  }

  const totalCents = Math.max(0, Math.round(subtotalCents - discountCents));
  const isFree = totalCents <= 0;

  const nowIso = new Date().toISOString();
  const insertMeta: Record<string, unknown> = {
    buyer_user_id: userResult.userId,
    pack_title:
      typeof (pack as any).title === "string" ? (pack as any).title : undefined,
    pack_id: packId,
    establishment_id: establishmentId,
    establishment_name:
      typeof (establishment as any)?.name === "string"
        ? (establishment as any).name
        : undefined,
    universe,
    valid_until: validUntilIso,
    source: "consumer_checkout",
    ...(promoMeta ? { promo: promoMeta } : {}),
  };

  if (isFree) {
    insertMeta.paid_at = nowIso;
    insertMeta.payment_transaction_id = promoMeta
      ? `promo_${String(promoMeta.promo_id ?? "")}`
      : "promo_free";
  }

  // NOTE: pack_purchases has no buyer_user_id column; we keep the link inside meta for now.
  const { data: inserted, error: insErr } = await supabase
    .from("pack_purchases")
    .insert({
      establishment_id: establishmentId,
      pack_id: packId,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      quantity,
      unit_price: unitPrice,
      total_price: totalCents,
      currency: "MAD",
      payment_status: isFree ? "paid" : "pending",
      status: "active",
      valid_until: validUntilIso,
      meta: insertMeta,
    })
    .select("*")
    .single();

  if (insErr) return res.status(500).json({ error: insErr.message });

  const purchaseId = String((inserted as any)?.id ?? "");

  if (isFree && purchaseId) {
    // Paid immediately (free pack)
    if (promoMeta?.promo_id) {
      void recordPromoRedemptionBestEffort({
        supabase,
        promoId: String(promoMeta.promo_id),
        userId: userResult.userId,
        purchaseId,
      });
    }

    // Run best-effort side-effects.
    try {
      await adjustPackStockBestEffort({ supabase, packId, delta: -quantity });
    } catch (err) {
      log.warn({ err }, "adjustPackStockBestEffort failed (free checkout)");
    }

    try {
      const actor = { userId: userResult.userId, role: "consumer" };
      await ensureEscrowHoldForPackPurchase({ purchaseId, actor });
    } catch (err) {
      log.warn({ err }, "escrow hold failed (free checkout)");
    }

    try {
      await notifyProMembers({
        supabase,
        establishmentId,
        category: "billing",
        title: "Pack acheté",
        body: promoMeta
          ? `Achat pack · promo ${String(promoMeta.code ?? "")}`
          : "Achat pack",
        data: {
          purchaseId,
          establishmentId,
          action: "pack_purchase_paid",
          event_type: NotificationEventType.pack_purchased,
          source: "consumer_checkout_free",
        },
      });

      void emitAdminNotification({
        type: "pack_purchased",
        title: "Pack acheté",
        body: promoMeta
          ? `Achat pack · promo ${String(promoMeta.code ?? "")}`
          : "Achat pack",
        data: {
          purchaseId,
          establishmentId,
          paymentStatus: "paid",
          event_type: NotificationEventType.pack_purchased,
          source: "consumer_checkout_free",
        },
      });

      await emitConsumerUserEvent({
        supabase,
        userId: userResult.userId,
        eventType: NotificationEventType.pack_purchased,
        metadata: {
          purchaseId,
          establishmentId,
          promo_code: promoCode ?? null,
        },
      });
    } catch (err) {
      log.warn({ err }, "notifications failed (free checkout)");
    }
  }

  return res.json({
    ok: true,
    purchase_id: purchaseId || null,
    payment: isFree
      ? {
          provider: "promo",
          status: "paid",
        }
      : {
          provider: "stub",
          status: "pending",
          confirm_endpoint: `/api/consumer/packs/purchases/${encodeURIComponent(purchaseId)}/confirm`,
        },
  });
}

function appendStringToMetaList(
  meta: Record<string, unknown>,
  key: string,
  value: string,
  max = 50,
): Record<string, unknown> {
  const list = Array.isArray(meta[key]) ? (meta[key] as unknown[]) : [];
  const existing = list.filter((x) => typeof x === "string") as string[];
  const next = existing.includes(value)
    ? existing
    : [...existing, value].slice(-max);
  return { ...meta, [key]: next };
}

function createStubEventId(): string {
  const rand = Math.random().toString(16).slice(2, 10);
  return `stub_evt_${Date.now()}_${rand}`;
}

function createStubTransactionId(purchaseId: string): string {
  const rand = Math.random().toString(16).slice(2, 8);
  return `stub_txn_${purchaseId.slice(0, 8)}_${Date.now()}_${rand}`;
}

async function adjustPackStockBestEffort(args: {
  supabase: any;
  packId: string;
  delta: number;
}) {
  try {
    const { data: pack } = await args.supabase
      .from("packs")
      .select("id,is_limited,stock")
      .eq("id", args.packId)
      .maybeSingle();

    const isLimited = (pack as any)?.is_limited === true;
    const stock =
      (pack as any)?.stock == null ? null : asInt((pack as any)?.stock);
    if (!isLimited || stock == null) return;

    const nextStock = Math.max(0, Math.round(stock + args.delta));
    await args.supabase
      .from("packs")
      .update({ stock: nextStock })
      .eq("id", args.packId);
  } catch (err) {
    log.warn({ err }, "adjustPackStockBestEffort failed");
  }
}

async function recordPromoRedemptionBestEffort(args: {
  supabase: any;
  promoId: string;
  userId: string;
  purchaseId: string;
}): Promise<void> {
  try {
    const promoId = String(args.promoId ?? "").trim();
    const userId = String(args.userId ?? "").trim();
    const purchaseId = String(args.purchaseId ?? "").trim();
    if (!promoId || !userId || !purchaseId) return;

    const { error } = await args.supabase
      .from("consumer_promo_code_redemptions")
      .insert({
        promo_code_id: promoId,
        user_id: userId,
        pack_purchase_id: purchaseId,
      });

    if (error) {
      // Ignore duplicates (same purchase recorded twice)
      if (/duplicate key value violates unique constraint/i.test(error.message))
        return;
    }
  } catch (err) {
    log.warn({ err }, "recordPromoRedemptionBestEffort failed");
  }
}

export async function confirmConsumerPackPurchase(req: Request, res: Response) {
  if (!isDemoRoutesAllowed())
    return res.status(404).json({ error: "not_found" });

  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const purchaseId = typeof req.params.id === "string" ? req.params.id : "";
  if (!purchaseId || !isUuid(purchaseId))
    return res.status(400).json({ error: "invalid_purchase_id" });

  const supabase = getAdminSupabase();

  const { data: existing, error: selErr } = await supabase
    .from("pack_purchases")
    .select(
      "id,establishment_id,pack_id,quantity,total_price,currency,payment_status,status,meta",
    )
    .eq("id", purchaseId)
    .maybeSingle();

  if (selErr) return res.status(500).json({ error: selErr.message });
  if (!existing?.id)
    return res.status(404).json({ error: "pack_purchase_not_found" });

  const meta = asRecord((existing as any).meta) ?? {};
  const buyerUserId = asString(meta.buyer_user_id);
  if (!buyerUserId || buyerUserId !== userResult.userId)
    return res.status(403).json({ error: "forbidden" });

  const currentPaymentStatus = String(
    (existing as any).payment_status ?? "pending",
  )
    .trim()
    .toLowerCase();
  if (currentPaymentStatus === "paid")
    return res.json({ ok: true, already_paid: true });
  if (currentPaymentStatus === "refunded")
    return res.status(400).json({ error: "already_refunded" });

  const eventId = createStubEventId();
  const transactionId = createStubTransactionId(purchaseId);
  const paidAtIso = new Date().toISOString();

  let nextMeta: Record<string, unknown> = { ...meta };
  if (!asString(nextMeta.payment_transaction_id))
    nextMeta.payment_transaction_id = transactionId;
  nextMeta = appendStringToMetaList(nextMeta, "payment_event_ids", eventId);
  nextMeta = { ...nextMeta, paid_at: paidAtIso };

  const { error: updErr } = await supabase
    .from("pack_purchases")
    .update({ payment_status: "paid", updated_at: paidAtIso, meta: nextMeta })
    .eq("id", purchaseId);

  if (updErr) return res.status(500).json({ error: updErr.message });

  // Record promo redemption (best-effort) once payment is confirmed.
  try {
    const promo = asRecord((meta as any).promo);
    const promoId =
      promo && typeof promo.promo_id === "string" ? promo.promo_id : "";
    if (promoId) {
      await recordPromoRedemptionBestEffort({
        supabase,
        promoId,
        userId: userResult.userId,
        purchaseId,
      });
    }
  } catch (err) {
    log.warn({ err }, "promo redemption recording failed (confirm)");
  }

  // Finance pipeline: create escrow hold for pack purchase (best-effort).
  try {
    const actor = { userId: userResult.userId, role: "consumer" };
    await ensureEscrowHoldForPackPurchase({ purchaseId, actor });
  } catch (e) {
    log.error({ err: e }, "finance pipeline failed (consumer pack confirm)");
    // Do not block the response on finance errors
  }

  const qty = Math.max(1, Math.min(50, asInt((existing as any).quantity) ?? 1));
  const packId = asString((existing as any).pack_id);
  if (packId)
    await adjustPackStockBestEffort({ supabase, packId, delta: -qty });

  // Best-effort notifications
  try {
    const establishmentId = asString((existing as any).establishment_id);
    const total = asInt((existing as any).total_price) ?? 0;
    const currency = asString((existing as any).currency) || "MAD";
    const totalLabel = total ? `${Math.round(total / 100)} ${currency}` : "";

    if (establishmentId) {
      await notifyProMembers({
        supabase,
        establishmentId,
        category: "billing",
        title: "Pack acheté",
        body: `Achat pack${totalLabel ? ` · ${totalLabel}` : ""}`,
        data: {
          purchaseId,
          establishmentId,
          action: "pack_purchase_paid",
          event_type: NotificationEventType.pack_purchased,
          source: "consumer_confirm",
          transaction_id: transactionId,
        },
      });

      void emitAdminNotification({
        type: "pack_purchased",
        title: "Pack acheté",
        body: `Achat pack${totalLabel ? ` · ${totalLabel}` : ""}`,
        data: {
          purchaseId,
          establishmentId,
          paymentStatus: "paid",
          event_type: NotificationEventType.pack_purchased,
          source: "consumer_confirm",
          transaction_id: transactionId,
        },
      });

      await emitConsumerUserEvent({
        supabase,
        userId: buyerUserId,
        eventType: NotificationEventType.pack_purchased,
        metadata: {
          purchaseId,
          establishmentId,
          transaction_id: transactionId,
        },
      });
    }
  } catch (err) {
    log.warn({ err }, "notifications failed (pack purchase confirm)");
  }

  return res.json({ ok: true });
}

export async function hideConsumerPackPurchase(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const purchaseId = typeof req.params.id === "string" ? req.params.id : "";
  if (!purchaseId || !isUuid(purchaseId))
    return res.status(400).json({ error: "invalid_purchase_id" });

  const supabase = getAdminSupabase();

  const { data: existing, error: selErr } = await supabase
    .from("pack_purchases")
    .select("id,meta")
    .eq("id", purchaseId)
    .maybeSingle();

  if (selErr) return res.status(500).json({ error: selErr.message });
  if (!existing?.id)
    return res.status(404).json({ error: "pack_purchase_not_found" });

  const meta = asRecord((existing as any).meta) ?? {};
  const buyerUserId = asString(meta.buyer_user_id);
  if (!buyerUserId || buyerUserId !== userResult.userId)
    return res.status(403).json({ error: "forbidden" });

  const nowIso = new Date().toISOString();
  const nextMeta = { ...meta, hidden_by_user: true, hidden_at: nowIso };

  const { error: updErr } = await supabase
    .from("pack_purchases")
    .update({ meta: nextMeta, updated_at: nowIso })
    .eq("id", purchaseId);

  if (updErr) return res.status(500).json({ error: updErr.message });

  return res.json({ ok: true });
}

export async function getConsumerReservation(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const reservationId = typeof req.params.id === "string" ? req.params.id : "";
  if (!reservationId || !isUuid(reservationId))
    return res.status(400).json({ error: "invalid_reservation_id" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id,booking_reference,kind,establishment_id,user_id,status,starts_at,ends_at,party_size,amount_total,amount_deposit,currency,payment_status,checked_in_at,refusal_reason_code,refusal_reason_custom,is_from_waitlist,slot_id,meta,created_at,updated_at,establishments(name,city,address,phone)",
    )
    .eq("id", reservationId)
    .eq("user_id", userResult.userId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "reservation_not_found" });

  const reservation = data as any;

  // NEW: auto-promotion waitlist logic
  try {
    const { data: waitlistEntry } = await supabase
      .from("waitlist_entries")
      .select(
        "id,reservation_id,slot_id,status,position,offer_sent_at,offer_expires_at,created_at,updated_at",
      )
      .eq("reservation_id", reservationId)
      .limit(1)
      .maybeSingle();

    reservation.waitlist_offer = waitlistEntry ?? null;
  } catch (err) {
    log.warn({ err }, "waitlist entry lookup failed (getConsumerReservation)");
    reservation.waitlist_offer = null;
  }

  return res.json({ ok: true, reservation });
}

export async function getConsumerReservationInvoice(
  req: Request,
  res: Response,
) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const reservationId = typeof req.params.id === "string" ? req.params.id : "";
  if (!reservationId || !isUuid(reservationId))
    return res.status(400).json({ error: "invalid_reservation_id" });

  const supabase = getAdminSupabase();

  const { data: reservation, error } = await supabase
    .from("reservations")
    .select("id,user_id,establishment_id,payment_status")
    .eq("id", reservationId)
    .eq("user_id", userResult.userId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!reservation)
    return res.status(404).json({ error: "reservation_not_found" });

  const paymentStatus = String((reservation as any).payment_status ?? "")
    .trim()
    .toLowerCase();
  if (paymentStatus !== "paid" && paymentStatus !== "refunded") {
    return res.status(400).json({ error: "invoice_unavailable" });
  }

  try {
    const actor = { userId: userResult.userId, role: "consumer" };
    const inv = await ensureInvoiceForReservation({
      reservationId,
      actor,
      idempotencyKey: `invoice:consumer:reservation:${reservationId}`,
    });

    if (!inv) return res.status(400).json({ error: "invoice_unavailable" });

    return res.json({
      ok: true,
      invoice: {
        id: inv.id,
        invoice_number: inv.invoice_number,
        issued_at: inv.issued_at,
        amount_cents: inv.amount_cents,
        currency: inv.currency,
        reference_type: inv.reference_type,
        reference_id: inv.reference_id,
      },
    });
  } catch (e) {
    log.error({ err: e }, "getConsumerReservationInvoice failed");
    return res.status(500).json({ error: "invoice_error" });
  }
}

export async function getConsumerPackPurchaseInvoice(
  req: Request,
  res: Response,
) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const purchaseId = typeof req.params.id === "string" ? req.params.id : "";
  if (!purchaseId || !isUuid(purchaseId))
    return res.status(400).json({ error: "invalid_purchase_id" });

  const supabase = getAdminSupabase();

  const { data: purchase, error } = await supabase
    .from("pack_purchases")
    .select("id,meta,payment_status")
    .eq("id", purchaseId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!purchase)
    return res.status(404).json({ error: "pack_purchase_not_found" });

  const meta = asRecord((purchase as any).meta) ?? {};
  const buyerUserId = asString(meta.buyer_user_id);
  if (!buyerUserId || buyerUserId !== userResult.userId)
    return res.status(403).json({ error: "forbidden" });

  const paymentStatus = String((purchase as any).payment_status ?? "")
    .trim()
    .toLowerCase();
  if (paymentStatus !== "paid" && paymentStatus !== "refunded") {
    return res.status(400).json({ error: "invoice_unavailable" });
  }

  try {
    const actor = { userId: userResult.userId, role: "consumer" };
    const inv = await ensureInvoiceForPackPurchase({
      purchaseId,
      actor,
      idempotencyKey: `invoice:consumer:pack_purchase:${purchaseId}`,
    });

    if (!inv) return res.status(400).json({ error: "invoice_unavailable" });

    return res.json({
      ok: true,
      invoice: {
        id: inv.id,
        invoice_number: inv.invoice_number,
        issued_at: inv.issued_at,
        amount_cents: inv.amount_cents,
        currency: inv.currency,
        reference_type: inv.reference_type,
        reference_id: inv.reference_id,
      },
    });
  } catch (e) {
    log.error({ err: e }, "getConsumerPackPurchaseInvoice failed");
    return res.status(500).json({ error: "invoice_error" });
  }
}

export async function listConsumerReservationMessages(
  req: Request,
  res: Response,
) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const reservationId = typeof req.params.id === "string" ? req.params.id : "";
  if (!reservationId || !isUuid(reservationId))
    return res.status(400).json({ error: "invalid_reservation_id" });

  const supabase = getAdminSupabase();

  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("id,user_id,establishment_id,booking_reference")
    .eq("id", reservationId)
    .eq("user_id", userResult.userId)
    .maybeSingle();

  if (resErr) return res.status(500).json({ error: resErr.message });
  if (!reservation)
    return res.status(404).json({ error: "reservation_not_found" });

  const establishmentId = String((reservation as any).establishment_id ?? "");
  if (!establishmentId)
    return res.json({ ok: true, conversation: null, messages: [] });

  const { data: convo, error: convoErr } = await supabase
    .from("pro_conversations")
    .select(
      "id,subject,reservation_id,establishment_id,status,created_at,updated_at",
    )
    .eq("establishment_id", establishmentId)
    .eq("reservation_id", reservationId)
    .limit(1)
    .maybeSingle();

  if (convoErr) return res.status(500).json({ error: convoErr.message });
  if (!convo?.id)
    return res.json({ ok: true, conversation: null, messages: [] });

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const { data: messages, error: msgErr } = await supabase
    .from("pro_messages")
    .select(
      "id,conversation_id,establishment_id,from_role,body,created_at,sender_user_id",
    )
    .eq("establishment_id", establishmentId)
    .eq("conversation_id", convo.id)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (msgErr) return res.status(500).json({ error: msgErr.message });

  return res.json({ ok: true, conversation: convo, messages: messages ?? [] });
}

export async function sendConsumerReservationMessage(
  req: Request,
  res: Response,
) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const reservationId = typeof req.params.id === "string" ? req.params.id : "";
  if (!reservationId || !isUuid(reservationId))
    return res.status(400).json({ error: "invalid_reservation_id" });

  const bodyRecord = asRecord(req.body);
  const body = bodyRecord ? asString(bodyRecord.body) : null;
  if (!body) return res.status(400).json({ error: "body is required" });

  const supabase = getAdminSupabase();

  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("id,user_id,establishment_id,booking_reference")
    .eq("id", reservationId)
    .eq("user_id", userResult.userId)
    .maybeSingle();

  if (resErr) return res.status(500).json({ error: resErr.message });
  if (!reservation)
    return res.status(404).json({ error: "reservation_not_found" });

  const establishmentId = String((reservation as any).establishment_id ?? "");
  const br = String(
    (reservation as any).booking_reference ?? reservationId.slice(0, 8),
  );
  if (!establishmentId)
    return res.status(400).json({ error: "missing_establishment" });

  // Ensure conversation exists (consumer can create the thread).
  const { data: existingConvo, error: findErr } = await supabase
    .from("pro_conversations")
    .select("id,subject")
    .eq("establishment_id", establishmentId)
    .eq("reservation_id", reservationId)
    .limit(1)
    .maybeSingle();

  if (findErr) return res.status(500).json({ error: findErr.message });

  const conversationId = existingConvo?.id
    ? String(existingConvo.id)
    : (
        await supabase
          .from("pro_conversations")
          .insert({
            establishment_id: establishmentId,
            reservation_id: reservationId,
            subject: `Réservation ${br}`,
            status: "open",
            meta: {},
          })
          .select("id")
          .single()
      ).data?.id;

  if (!conversationId)
    return res.status(500).json({ error: "conversation_create_failed" });

  const { data: msg, error: msgErr } = await supabase
    .from("pro_messages")
    .insert({
      conversation_id: conversationId,
      establishment_id: establishmentId,
      from_role: "client",
      body,
      sender_user_id: userResult.userId,
      meta: {},
    })
    .select("*")
    .single();

  if (msgErr) return res.status(500).json({ error: msgErr.message });

  // Update conversation: bump updated_at and increment unread_count
  // We read-then-write because Supabase JS doesn't support SQL increment directly
  const { data: convRow } = await supabase
    .from("pro_conversations")
    .select("unread_count")
    .eq("id", conversationId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();
  const currentUnread = typeof (convRow as any)?.unread_count === "number" ? (convRow as any).unread_count : 0;
  await supabase
    .from("pro_conversations")
    .update({ updated_at: new Date().toISOString(), unread_count: currentUnread + 1 })
    .eq("id", conversationId)
    .eq("establishment_id", establishmentId);

  // Notify PROs + SUPERADMIN (best-effort)
  try {
    const snippet = body.length > 120 ? `${body.slice(0, 120)}…` : body;
    const title = "Nouveau message";
    const notifBody = `Réservation ${br} · ${snippet}`;

    await notifyProMembers({
      supabase,
      establishmentId,
      category: "messages",
      title,
      body: notifBody,
      data: {
        conversationId,
        reservationId,
        bookingReference: br,
        action: "message_received",
        event_type: NotificationEventType.message_received,
        from_role: "client",
      },
    });

    void emitAdminNotification({
      type: "message_received",
      title,
      body: notifBody,
      data: {
        establishmentId,
        conversationId,
        reservationId,
        bookingReference: br,
        event_type: NotificationEventType.message_received,
        from_role: "client",
      },
    });
  } catch (err) {
    log.warn({ err }, "pro/admin notifications failed (sendConsumerReservationMessage)");
  }

  // ─── Auto-reply logic ───
  // Check if establishment has auto-reply enabled and conditions match
  void (async () => {
    try {
      const { data: arSettings } = await supabase
        .from("pro_auto_reply_settings")
        .select("*")
        .eq("establishment_id", establishmentId)
        .maybeSingle();

      if (!arSettings) return;
      const ar = arSettings as Record<string, unknown>;

      const now = new Date();
      let shouldAutoReply = false;
      let autoReplyMessage = "";

      // 1. Vacation mode takes priority
      if (ar.is_on_vacation === true) {
        const vacStart = typeof ar.vacation_start === "string" ? new Date(ar.vacation_start) : null;
        const vacEnd = typeof ar.vacation_end === "string" ? new Date(ar.vacation_end) : null;
        const inRange = (!vacStart || now >= vacStart) && (!vacEnd || now <= vacEnd);
        if (inRange) {
          shouldAutoReply = true;
          autoReplyMessage = typeof ar.vacation_message === "string" && ar.vacation_message.trim()
            ? ar.vacation_message.trim()
            : "Nous sommes actuellement en congés. Nous traiterons votre message à notre retour.";
        }
      }

      // 2. Schedule-based auto-reply
      if (!shouldAutoReply && ar.enabled === true) {
        const daysOfWeek = Array.isArray(ar.days_of_week) ? ar.days_of_week : [];
        const startTime = typeof ar.start_time === "string" ? ar.start_time : null;
        const endTime = typeof ar.end_time === "string" ? ar.end_time : null;

        const currentDay = now.getDay(); // 0=Sunday
        const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

        // Check if current day is an absence day
        const isAbsenceDay = daysOfWeek.includes(currentDay);

        // Check time range (supports overnight ranges like 18:00 - 09:00)
        let inTimeRange = false;
        if (startTime && endTime) {
          if (startTime <= endTime) {
            // Same-day range: e.g., 14:00 - 18:00
            inTimeRange = currentHHMM >= startTime && currentHHMM <= endTime;
          } else {
            // Overnight range: e.g., 18:00 - 09:00
            inTimeRange = currentHHMM >= startTime || currentHHMM <= endTime;
          }
        } else {
          // If no time range defined but day is absence day, auto-reply all day
          inTimeRange = isAbsenceDay;
        }

        if (isAbsenceDay && inTimeRange) {
          shouldAutoReply = true;
          autoReplyMessage = typeof ar.message === "string" && ar.message.trim()
            ? ar.message.trim()
            : "Bonjour, merci pour votre message. Nous sommes actuellement indisponibles mais nous vous répondrons dès que possible.";
        }
      }

      if (!shouldAutoReply || !autoReplyMessage) return;

      // Avoid spamming: check if we already sent an auto-reply in the last 30 minutes
      const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
      const { data: recentAutoReplies } = await supabase
        .from("pro_messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("establishment_id", establishmentId)
        .eq("from_role", "auto")
        .gte("created_at", thirtyMinAgo)
        .limit(1);

      if (recentAutoReplies && recentAutoReplies.length > 0) return;

      // Insert auto-reply message
      await supabase
        .from("pro_messages")
        .insert({
          conversation_id: conversationId,
          establishment_id: establishmentId,
          from_role: "auto",
          body: autoReplyMessage,
          sender_user_id: null,
          meta: { auto_reply: true },
        });

      // Update conversation timestamp
      await supabase
        .from("pro_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId)
        .eq("establishment_id", establishmentId);
    } catch (err) {
      log.warn({ err }, "auto-reply failed");
    }
  })();

  return res.json({ ok: true, conversation_id: conversationId, message: msg });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export const updateConsumerReservation: (
  req: Request,
  res: Response,
) => Promise<Response | void> = async (req, res) => {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const reservationId = typeof req.params.id === "string" ? req.params.id : "";
  if (!reservationId || !isUuid(reservationId))
    return res.status(400).json({ error: "invalid_reservation_id" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const actionRaw = asString(req.body.action);
  const action = (actionRaw ?? "").toLowerCase();

  const supabase = getAdminSupabase();

  const { data: existing, error: existingErr } = await supabase
    .from("reservations")
    .select(
      "id,user_id,status,meta,establishment_id,booking_reference,starts_at,slot_id,party_size,payment_status,amount_total,amount_deposit,currency",
    )
    .eq("id", reservationId)
    .eq("user_id", userResult.userId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (!existing)
    return res.status(404).json({ error: "reservation_not_found" });

  const establishmentId = asString((existing as any).establishment_id);
  const bookingRef =
    asString((existing as any).booking_reference) ?? reservationId;
  const previousStatus = String((existing as any).status ?? "");
  const startsAtIso = asString((existing as any).starts_at);
  const slotId = asString((existing as any).slot_id);
  const partySize =
    typeof (existing as any).party_size === "number" &&
    Number.isFinite((existing as any).party_size)
      ? Math.max(1, Math.round((existing as any).party_size))
      : null;

  const metaBase = isRecord((existing as any).meta)
    ? ((existing as any).meta as Record<string, unknown>)
    : {};
  const nextMeta: Record<string, unknown> = { ...metaBase };

  const patch: Record<string, unknown> = {};

  const notifyProMembers = async (payload: {
    title: string;
    body: string;
    category: string;
    data?: Record<string, unknown>;
  }) => {
    if (!establishmentId) return;

    const { data: memberships } = await supabase
      .from("pro_establishment_memberships")
      .select("user_id")
      .eq("establishment_id", establishmentId)
      .limit(5000);

    const userIds = new Set<string>();
    for (const row of (memberships ?? []) as Array<{ user_id?: unknown }>) {
      const id = isRecord(row) ? asString(row.user_id) : null;
      if (id) userIds.add(id);
    }

    const out = Array.from(userIds).map((user_id) => ({
      user_id,
      establishment_id: establishmentId,
      category: payload.category,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));

    if (!out.length) return;

    // Best-effort: ignore notification errors.
    await supabase.from("pro_notifications").insert(out);
  };

  let proNotification: {
    title: string;
    body: string;
    category: string;
    data?: Record<string, unknown>;
  } | null = null;
  let cancelRefundPercent: number | null = null;

  if (action === "request_change") {
    const allowed = new Set([
      "confirmed",
      "pending_pro_validation",
      "requested",
    ]);
    if (!allowed.has(previousStatus)) {
      return res
        .status(409)
        .json({
          error: "modification_not_allowed_for_status",
          status: previousStatus,
        });
    }

    // Deep business rule: enforce establishment modification policy (server-side).
    try {
      const { data: policyRow } = await supabase
        .from("booking_policies")
        .select("modification_enabled,modification_deadline_hours")
        .eq("establishment_id", establishmentId)
        .maybeSingle();

      const modificationEnabled =
        typeof (policyRow as any)?.modification_enabled === "boolean"
          ? Boolean((policyRow as any).modification_enabled)
          : true;
      const deadlineHoursRaw =
        typeof (policyRow as any)?.modification_deadline_hours === "number"
          ? Math.round((policyRow as any).modification_deadline_hours)
          : 2;
      const deadlineHours = Math.max(0, deadlineHoursRaw);

      if (!modificationEnabled)
        return res.status(409).json({ error: "modification_disabled" });

      if (startsAtIso) {
        const startsAt = new Date(startsAtIso);
        if (Number.isFinite(startsAt.getTime())) {
          const hoursToStart =
            (startsAt.getTime() - Date.now()) / (1000 * 60 * 60);
          if (hoursToStart < deadlineHours) {
            return res
              .status(409)
              .json({
                error: "modification_deadline_passed",
                deadline_hours: deadlineHours,
              });
          }
        }
      }
    } catch (err) {
      log.warn({ err }, "modification policy lookup failed");
    }

    const requestedChange =
      asRecord(req.body.requested_change) ??
      asRecord(req.body.requestedChange) ??
      {};

    const startsAtRaw = asString(
      requestedChange.starts_at ?? requestedChange.startsAt,
    );
    const partySizeRaw =
      typeof requestedChange.party_size === "number"
        ? requestedChange.party_size
        : typeof requestedChange.partySize === "number"
          ? requestedChange.partySize
          : undefined;

    const requested: Record<string, unknown> = {};

    if (startsAtRaw) {
      const d = new Date(startsAtRaw);
      if (!Number.isFinite(d.getTime()))
        return res.status(400).json({ error: "starts_at invalide" });
      requested.starts_at = d.toISOString();
    }

    if (partySizeRaw !== undefined) {
      if (!Number.isFinite(partySizeRaw))
        return res.status(400).json({ error: "party_size invalide" });
      requested.party_size = Math.max(1, Math.round(partySizeRaw));
    }

    if (!Object.keys(requested).length) {
      return res.status(400).json({ error: "missing_requested_change" });
    }

    requested.at = new Date().toISOString();

    nextMeta.modification_requested = true;
    nextMeta.requested_change = requested;

    // If the user requests a new change, clear any previous proposal.
    delete nextMeta.proposed_change;

    patch.meta = nextMeta;

    // Audit trail (best-effort)
    try {
      await supabase.from("system_logs").insert({
        actor_user_id: userResult.userId,
        actor_role: "user",
        action: "reservation.modification_requested",
        entity_type: "reservation",
        entity_id: reservationId,
        payload: {
          establishment_id: establishmentId,
          requested_change: nextMeta.requested_change ?? null,
        },
      });
    } catch (err) {
      log.warn({ err }, "audit trail failed (modification_requested)");
    }

    const requestedStartsAt =
      typeof requested.starts_at === "string" ? requested.starts_at : null;
    const requestedStartsLabel = requestedStartsAt
      ? formatLeJjMmAaAHeure(requestedStartsAt)
      : "";
    const startsAtLabel = startsAtIso ? formatLeJjMmAaAHeure(startsAtIso) : "";
    const requestedParty =
      typeof requested.party_size === "number" ? requested.party_size : null;

    proNotification = {
      category: "booking",
      title: "Demande de modification",
      body: `Réservation ${bookingRef}${startsAtLabel ? ` (${startsAtLabel})` : ""}${requestedStartsLabel ? ` → ${requestedStartsLabel}` : ""}${requestedParty ? ` · ${requestedParty} pers.` : ""}`,
      data: { reservationId, action: "request_change" },
    };
  } else if (action === "cancel_request") {
    delete nextMeta.requested_change;
    delete nextMeta.modification_requested;
    patch.meta = nextMeta;
  } else if (action === "request_cancellation") {
    const cancellable = new Set([
      "confirmed",
      "pending_pro_validation",
      "requested",
      "waitlist",
    ]);
    if (!cancellable.has(previousStatus)) {
      return res
        .status(409)
        .json({
          error: "cancellation_not_allowed_for_status",
          status: previousStatus,
        });
    }

    if (!startsAtIso)
      return res.status(409).json({ error: "missing_starts_at" });

    const d = new Date(startsAtIso);
    if (!Number.isFinite(d.getTime()))
      return res.status(409).json({ error: "invalid_starts_at" });
    if (d.getTime() < Date.now())
      return res.status(409).json({ error: "reservation_already_started" });

    // Deep business rule: enforce cancellation policy.
    const defaults = {
      cancellation_enabled: false,
      free_cancellation_hours: 24,
      cancellation_penalty_percent: 50,
    };

    let policy = { ...defaults };
    try {
      const { data: policyRow } = await supabase
        .from("booking_policies")
        .select(
          "cancellation_enabled,free_cancellation_hours,cancellation_penalty_percent",
        )
        .eq("establishment_id", establishmentId)
        .maybeSingle();

      policy = {
        ...defaults,
        ...(policyRow && typeof policyRow === "object"
          ? (policyRow as any)
          : {}),
      };
    } catch (err) {
      log.warn({ err }, "cancellation policy lookup failed");
    }

    const cancellationEnabled =
      typeof (policy as any).cancellation_enabled === "boolean"
        ? Boolean((policy as any).cancellation_enabled)
        : false;
    if (!cancellationEnabled)
      return res.status(409).json({ error: "cancellation_disabled" });

    const freeHoursRaw =
      typeof (policy as any).free_cancellation_hours === "number"
        ? Math.round((policy as any).free_cancellation_hours)
        : defaults.free_cancellation_hours;
    const freeHours = Math.max(0, freeHoursRaw);

    const penaltyPctRaw =
      typeof (policy as any).cancellation_penalty_percent === "number"
        ? Math.round((policy as any).cancellation_penalty_percent)
        : defaults.cancellation_penalty_percent;
    const penaltyPct = Math.min(100, Math.max(0, penaltyPctRaw));

    const hoursToStart = (d.getTime() - Date.now()) / (1000 * 60 * 60);
    cancelRefundPercent =
      hoursToStart >= freeHours ? 100 : Math.max(0, 100 - penaltyPct);

    patch.status = "cancelled_user";
    nextMeta.cancelled_at = new Date().toISOString();
    nextMeta.cancelled_by = "user";
    nextMeta.cancellation_policy = {
      free_cancellation_hours: freeHours,
      cancellation_penalty_percent: penaltyPct,
      refund_percent: cancelRefundPercent,
      hours_to_start: Math.round(hoursToStart * 10) / 10,
    };
    patch.meta = nextMeta;

    // Audit trail (best-effort)
    try {
      await supabase.from("system_logs").insert({
        actor_user_id: userResult.userId,
        actor_role: "user",
        action: "reservation.cancellation_requested",
        entity_type: "reservation",
        entity_id: reservationId,
        payload: {
          establishment_id: establishmentId,
          cancellation_policy: nextMeta.cancellation_policy ?? null,
        },
      });
    } catch (err) {
      log.warn({ err }, "audit trail failed (cancellation_requested)");
    }

    proNotification = {
      category: "booking",
      title: "Demande d’annulation",
      body: `Réservation ${bookingRef}${partySize ? ` · ${partySize} pers.` : ""}${startsAtIso ? ` · ${formatLeJjMmAaAHeure(startsAtIso)}` : ""}`,
      data: { reservationId, action: "request_cancellation" },
    };
  } else if (action === "accept_proposed_change") {
    const proposed = isRecord(nextMeta.proposed_change)
      ? (nextMeta.proposed_change as Record<string, unknown>)
      : null;
    const startsAtRaw =
      proposed && typeof proposed.starts_at === "string"
        ? proposed.starts_at
        : null;
    if (!startsAtRaw)
      return res.status(409).json({ error: "no_proposed_change" });

    const d = new Date(startsAtRaw);
    if (!Number.isFinite(d.getTime()))
      return res
        .status(400)
        .json({ error: "proposed_change.starts_at invalide" });

    patch.starts_at = d.toISOString();
    patch.status = "pending_pro_validation";

    delete nextMeta.proposed_change;
    delete nextMeta.requested_change;
    delete nextMeta.modification_requested;

    patch.meta = nextMeta;

    // Audit trail (best-effort)
    try {
      await supabase.from("system_logs").insert({
        actor_user_id: userResult.userId,
        actor_role: "user",
        action: "reservation.proposed_change_accepted",
        entity_type: "reservation",
        entity_id: reservationId,
        payload: {
          establishment_id: establishmentId,
          previous_starts_at: startsAtIso ?? null,
          accepted_starts_at: (patch.starts_at as string) ?? null,
        },
      });
    } catch (err) {
      log.warn({ err }, "audit trail failed (proposed_change_accepted)");
    }

    proNotification = {
      category: "booking",
      title: "Créneau alternatif accepté",
      body: `Réservation ${bookingRef}${startsAtIso ? ` (${formatLeJjMmAaAHeure(startsAtIso)})` : ""} → ${formatLeJjMmAaAHeure(d.toISOString())}`,
      data: { reservationId, action: "accept_proposed_change" },
    };
  } else if (action === "decline_proposed_change") {
    const proposed = isRecord(nextMeta.proposed_change)
      ? (nextMeta.proposed_change as Record<string, unknown>)
      : null;
    const startsAtRaw =
      proposed && typeof proposed.starts_at === "string"
        ? proposed.starts_at
        : null;

    delete nextMeta.proposed_change;
    patch.meta = nextMeta;

    // Audit trail (best-effort)
    try {
      await supabase.from("system_logs").insert({
        actor_user_id: userResult.userId,
        actor_role: "user",
        action: "reservation.proposed_change_declined",
        entity_type: "reservation",
        entity_id: reservationId,
        payload: {
          establishment_id: establishmentId,
          proposed_starts_at: startsAtRaw ?? null,
        },
      });
    } catch (err) {
      log.warn({ err }, "audit trail failed (proposed_change_declined)");
    }

    proNotification = {
      category: "booking",
      title: "Créneau alternatif refusé",
      body: `Réservation ${bookingRef}${partySize ? ` · ${partySize} pers.` : ""}${startsAtIso ? ` · ${formatLeJjMmAaAHeure(startsAtIso)}` : ""}${startsAtRaw ? ` · proposé: ${formatLeJjMmAaAHeure(startsAtRaw)}` : ""}`,
      data: { reservationId, action: "decline_proposed_change" },
    };
  } else if (action === "waitlist_accept_offer") {
    // NEW: auto-promotion waitlist logic
    const { data: entry, error: entryErr } = await supabase
      .from("waitlist_entries")
      .select("id,status,offer_expires_at,slot_id,position")
      .eq("reservation_id", reservationId)
      .eq("user_id", userResult.userId)
      .maybeSingle();

    if (entryErr) return res.status(500).json({ error: entryErr.message });
    if (!entry?.id)
      return res.status(409).json({ error: "waitlist_entry_not_found" });

    const entryStatus = String((entry as any).status ?? "");
    if (entryStatus !== "offer_sent")
      return res.status(409).json({ error: "waitlist_offer_not_active" });

    const expiresAtIso =
      typeof (entry as any).offer_expires_at === "string"
        ? String((entry as any).offer_expires_at)
        : "";
    const expiresAt = expiresAtIso ? new Date(expiresAtIso) : null;
    if (
      !expiresAt ||
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() < Date.now()
    ) {
      // Mark as expired and try to promote next.
      await supabase
        .from("waitlist_entries")
        .update({ status: "offer_expired", offer_expires_at: null })
        .eq("id", (entry as any).id);

      await supabase.from("waitlist_events").insert({
        waitlist_entry_id: (entry as any).id,
        reservation_id: reservationId,
        establishment_id: establishmentId,
        slot_id: (entry as any).slot_id,
        user_id: userResult.userId,
        event_type: "waitlist_offer_expired",
        actor_role: "user",
        actor_user_id: userResult.userId,
        metadata: { reason: "expired_before_accept" },
      });

      await supabase.from("system_logs").insert({
        actor_user_id: userResult.userId,
        actor_role: "user",
        action: "waitlist.offer_expired",
        entity_type: "waitlist_entry",
        entity_id: String((entry as any).id ?? ""),
        payload: {
          reservation_id: reservationId,
          establishment_id: establishmentId,
          slot_id: (entry as any).slot_id ?? null,
          reason: "expired_before_accept",
        },
      });

      const sid = String((entry as any).slot_id ?? slotId ?? "");
      if (sid) {
        void triggerWaitlistPromotionForSlot({
          supabase: supabase as any,
          slotId: sid,
          actorRole: "user",
          actorUserId: userResult.userId,
          reason: "offer_expired_on_accept",
        });
      }

      return res.status(410).json({ error: "waitlist_offer_expired" });
    }

    const sid = String((entry as any).slot_id ?? slotId ?? "");
    if (!sid) return res.status(409).json({ error: "missing_slot_id" });

    // Capacity check before converting.
    const { data: slotRow, error: slotErr } = await supabase
      .from("pro_slots")
      .select("id,capacity,starts_at,ends_at")
      .eq("id", sid)
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    if (slotErr) return res.status(500).json({ error: slotErr.message });

    const cap =
      typeof (slotRow as any)?.capacity === "number" &&
      Number.isFinite((slotRow as any).capacity)
        ? Math.max(0, Math.round((slotRow as any).capacity))
        : null;
    if (cap == null) return res.status(409).json({ error: "slot_not_found" });

    const { data: usedRows, error: usedErr } = await supabase
      .from("reservations")
      .select("party_size")
      .eq("slot_id", sid)
      .in("status", OCCUPYING_RESERVATION_STATUSES as unknown as string[])
      .limit(5000);

    if (usedErr) return res.status(500).json({ error: usedErr.message });

    const used = (usedRows ?? []).reduce((acc, row) => {
      const n =
        typeof (row as any)?.party_size === "number" &&
        Number.isFinite((row as any).party_size)
          ? Math.max(0, Math.round((row as any).party_size))
          : 0;
      return acc + n;
    }, 0);

    const requestedSize = partySize ?? 1;
    const remaining = Math.max(0, cap - used);

    if (remaining < requestedSize) {
      await supabase
        .from("waitlist_entries")
        .update({
          status: "offer_expired",
          offer_expires_at: null,
          meta: { reason: "no_capacity_on_accept" },
        })
        .eq("id", (entry as any).id);

      await supabase.from("waitlist_events").insert({
        waitlist_entry_id: (entry as any).id,
        reservation_id: reservationId,
        establishment_id: establishmentId,
        slot_id: sid,
        user_id: userResult.userId,
        event_type: "waitlist_offer_expired",
        actor_role: "user",
        actor_user_id: userResult.userId,
        metadata: { reason: "no_capacity_on_accept", remaining, requestedSize },
      });

      await supabase.from("system_logs").insert({
        actor_user_id: userResult.userId,
        actor_role: "user",
        action: "waitlist.offer_expired",
        entity_type: "waitlist_entry",
        entity_id: String((entry as any).id ?? ""),
        payload: {
          reservation_id: reservationId,
          establishment_id: establishmentId,
          slot_id: sid,
          reason: "no_capacity_on_accept",
          remaining,
          requestedSize,
        },
      });

      void triggerWaitlistPromotionForSlot({
        supabase: supabase as any,
        slotId: sid,
        actorRole: "user",
        actorUserId: userResult.userId,
        reason: "no_capacity_on_accept",
      });

      return res.status(409).json({ error: "offer_no_longer_available" });
    }

    // Slot is the source of truth
    try {
      const slotStartsRaw =
        typeof (slotRow as any)?.starts_at === "string"
          ? String((slotRow as any).starts_at).trim()
          : "";
      const slotEndsRaw =
        typeof (slotRow as any)?.ends_at === "string"
          ? String((slotRow as any).ends_at).trim()
          : "";

      const slotStarts = slotStartsRaw ? new Date(slotStartsRaw) : null;
      if (slotStarts && Number.isFinite(slotStarts.getTime())) {
        patch.starts_at = slotStarts.toISOString();
      }

      if (slotEndsRaw) {
        const slotEnds = new Date(slotEndsRaw);
        patch.ends_at = Number.isFinite(slotEnds.getTime())
          ? slotEnds.toISOString()
          : null;
      } else {
        patch.ends_at = null;
      }
    } catch (err) {
      log.warn({ err }, "slot date sync failed (waitlist_accept_offer)");
    }

    // Deep business rule: if a deposit is required, do not allow conversion to confirmed until payment is completed.
    const existingPaymentStatus = String(
      (existing as any)?.payment_status ?? "",
    ).toLowerCase();
    const existingDepositCents =
      typeof (existing as any)?.amount_deposit === "number" &&
      Number.isFinite((existing as any).amount_deposit)
        ? Math.max(0, Math.round((existing as any).amount_deposit))
        : 0;

    if (existingDepositCents > 0 && existingPaymentStatus !== "paid") {
      return res.status(402).json({
        error: "payment_required",
        reservation_id: reservationId,
        amount_deposit: existingDepositCents,
        currency: String((existing as any)?.currency ?? "MAD"),
      });
    }

    patch.status = "confirmed";
    patch.is_from_waitlist = true;
    nextMeta.waitlist_promoted_at = new Date().toISOString();
    nextMeta.waitlist_offer_accepted_at = new Date().toISOString();
    patch.meta = nextMeta;

    await supabase
      .from("waitlist_entries")
      .update({ status: "converted_to_booking", offer_expires_at: null })
      .eq("id", (entry as any).id);

    await supabase.from("waitlist_events").insert({
      waitlist_entry_id: (entry as any).id,
      reservation_id: reservationId,
      establishment_id: establishmentId,
      slot_id: sid,
      user_id: userResult.userId,
      event_type: "waitlist_offer_accepted",
      actor_role: "user",
      actor_user_id: userResult.userId,
      metadata: { expiresAt: expiresAtIso },
    });

    await supabase.from("system_logs").insert({
      actor_user_id: userResult.userId,
      actor_role: "user",
      action: "waitlist.offer_accepted",
      entity_type: "waitlist_entry",
      entity_id: String((entry as any).id ?? ""),
      payload: {
        reservation_id: reservationId,
        establishment_id: establishmentId,
        slot_id: sid,
        expiresAt: expiresAtIso,
      },
    });

    proNotification = {
      category: "booking",
      title: "Liste d’attente : offre acceptée",
      body: `Réservation ${bookingRef}${partySize ? ` · ${partySize} pers.` : ""}${startsAtIso ? ` · ${formatLeJjMmAaAHeure(startsAtIso)}` : ""}`,
      data: { reservationId, action: "waitlist_offer_accepted" },
    };
  } else if (action === "waitlist_refuse_offer") {
    // NEW: auto-promotion waitlist logic
    const { data: entry, error: entryErr } = await supabase
      .from("waitlist_entries")
      .select("id,status,offer_expires_at,slot_id,position")
      .eq("reservation_id", reservationId)
      .eq("user_id", userResult.userId)
      .maybeSingle();

    if (entryErr) return res.status(500).json({ error: entryErr.message });
    if (!entry?.id)
      return res.status(409).json({ error: "waitlist_entry_not_found" });

    const sid = String((entry as any).slot_id ?? slotId ?? "");

    await supabase
      .from("waitlist_entries")
      .update({ status: "offer_refused", offer_expires_at: null })
      .eq("id", (entry as any).id);

    await supabase.from("waitlist_events").insert({
      waitlist_entry_id: (entry as any).id,
      reservation_id: reservationId,
      establishment_id: establishmentId,
      slot_id: sid || null,
      user_id: userResult.userId,
      event_type: "waitlist_offer_refused",
      actor_role: "user",
      actor_user_id: userResult.userId,
      metadata: { reason: "user_refused" },
    });

    await supabase.from("system_logs").insert({
      actor_user_id: userResult.userId,
      actor_role: "user",
      action: "waitlist.offer_refused",
      entity_type: "waitlist_entry",
      entity_id: String((entry as any).id ?? ""),
      payload: {
        reservation_id: reservationId,
        establishment_id: establishmentId,
        slot_id: sid || null,
        reason: "user_refused",
      },
    });

    patch.status = "cancelled_user";
    nextMeta.cancelled_at = new Date().toISOString();
    nextMeta.cancelled_by = "user";
    nextMeta.waitlist_offer_refused_at = new Date().toISOString();
    patch.meta = nextMeta;

    if (sid) {
      void triggerWaitlistPromotionForSlot({
        supabase: supabase as any,
        slotId: sid,
        actorRole: "user",
        actorUserId: userResult.userId,
        reason: "offer_refused",
      });
    }

    proNotification = {
      category: "booking",
      title: "Liste d’attente : offre refusée",
      body: `Réservation ${bookingRef}${partySize ? ` · ${partySize} pers.` : ""}${startsAtIso ? ` · ${formatLeJjMmAaAHeure(startsAtIso)}` : ""}`,
      data: { reservationId, action: "waitlist_offer_refused" },
    };
  } else {
    return res.status(400).json({ error: "unknown_action" });
  }

  const { data: updated, error: updErr } = await supabase
    .from("reservations")
    .update(patch)
    .eq("id", reservationId)
    .eq("user_id", userResult.userId)
    .select(
      "id,booking_reference,kind,establishment_id,user_id,status,starts_at,ends_at,party_size,amount_total,amount_deposit,currency,payment_status,checked_in_at,refusal_reason_code,refusal_reason_custom,is_from_waitlist,slot_id,meta,created_at,updated_at,establishments(name,city,address,phone)",
    )
    .maybeSingle();

  if (updErr) return res.status(500).json({ error: updErr.message });
  if (!updated) return res.status(404).json({ error: "reservation_not_found" });

  // Audit trail: status change (best-effort)
  try {
    const nextStatus =
      typeof (updated as any)?.status === "string"
        ? String((updated as any).status)
        : previousStatus;
    if (nextStatus && nextStatus !== previousStatus) {
      await supabase.from("system_logs").insert({
        actor_user_id: userResult.userId,
        actor_role: "user",
        action: "reservation.status_changed",
        entity_type: "reservation",
        entity_id: reservationId,
        payload: {
          establishment_id: establishmentId,
          previous_status: previousStatus,
          new_status: nextStatus,
          action,
        },
      });
    }
  } catch (err) {
    log.warn({ err }, "audit trail failed (status_changed)");
  }

  // Finance pipeline: settle/refund deposit for cancellations according to booking policy.
  if (action === "request_cancellation") {
    try {
      const paymentStatus = String(
        (existing as any)?.payment_status ?? "",
      ).toLowerCase();
      const depositCents =
        typeof (existing as any)?.amount_deposit === "number" &&
        Number.isFinite((existing as any).amount_deposit)
          ? Math.max(0, Math.round((existing as any).amount_deposit))
          : 0;

      if (paymentStatus === "paid" && depositCents > 0) {
        await settleEscrowForReservation({
          reservationId,
          actor: { userId: userResult.userId, role: "user" },
          reason: "cancel",
          refundPercent: cancelRefundPercent,
        });
      }
    } catch (e) {
      log.error({ err: e }, "finance pipeline failed (public.updateReservation cancellation)");
    }
  }

  // NEW: auto-promotion waitlist logic
  // If a confirmed/requested booking gets cancelled, a slot may open -> trigger auto-offer.
  try {
    const prevOccupies = new Set([
      "confirmed",
      "pending_pro_validation",
      "requested",
    ]);
    const nextStatus =
      typeof (updated as any)?.status === "string"
        ? String((updated as any).status)
        : previousStatus;
    const nextOccupies = prevOccupies.has(nextStatus);
    const prevWasOccupying = prevOccupies.has(previousStatus);

    if (prevWasOccupying && !nextOccupies && slotId) {
      void triggerWaitlistPromotionForSlot({
        supabase: supabase as any,
        slotId,
        actorRole: "user",
        actorUserId: userResult.userId,
        reason: `consumer_update:${action}`,
      });
    }
  } catch (err) {
    log.warn({ err }, "waitlist promotion trigger failed");
  }

  if (proNotification) {
    try {
      await notifyProMembers(proNotification);
    } catch (err) {
      log.warn({ err }, "notifyProMembers failed (updateConsumerReservation)");
    }

    void emitAdminNotification({
      type: action,
      title: proNotification.title,
      body: proNotification.body,
      data: {
        reservationId,
        establishmentId,
        action,
      },
    });
  }

  // Emails transactionnels (best-effort)
  if (
    action === "request_change" ||
    action === "request_cancellation" ||
    action === "waitlist_refuse_offer" ||
    action === "accept_proposed_change"
  ) {
    void (async () => {
      try {
        const baseUrl =
          asString(process.env.PUBLIC_BASE_URL) || "https://sam.ma";

        const { data: estRow } = establishmentId
          ? await supabase
              .from("establishments")
              .select("name")
              .eq("id", establishmentId)
              .maybeSingle()
          : ({ data: null } as any);

        const establishmentName =
          typeof (estRow as any)?.name === "string"
            ? String((estRow as any).name)
            : "";

        const { data: consumerRow } = await supabase
          .from("consumer_users")
          .select("email,full_name")
          .eq("id", userResult.userId)
          .maybeSingle();

        const consumerEmail =
          typeof (consumerRow as any)?.email === "string"
            ? String((consumerRow as any).email).trim()
            : "";
        const consumerName =
          typeof (consumerRow as any)?.full_name === "string"
            ? String((consumerRow as any).full_name).trim()
            : "";

        const listProEmails = async (): Promise<string[]> => {
          if (!establishmentId) return [];

          const { data: memberships } = await supabase
            .from("pro_establishment_memberships")
            .select("user_id")
            .eq("establishment_id", establishmentId)
            .limit(5000);

          const userIds = Array.from(
            new Set(
              ((memberships ?? []) as Array<any>)
                .map((m) => (typeof m?.user_id === "string" ? m.user_id : ""))
                .filter(Boolean),
            ),
          ).slice(0, 200);

          if (!userIds.length) return [];

          const wanted = new Set(userIds);
          const emails: string[] = [];
          for (let page = 1; page <= 20; page += 1) {
            if (emails.length >= wanted.size) break;
            const { data, error } = await supabase.auth.admin.listUsers({
              page,
              perPage: 1000,
            });
            if (error) break;
            for (const u of data.users ?? []) {
              const uid = String((u as any)?.id ?? "");
              if (!uid || !wanted.has(uid)) continue;
              const em = String((u as any)?.email ?? "").trim();
              if (em) emails.push(em);
            }
            if (!data.users?.length) break;
          }

          return Array.from(new Set(emails)).slice(0, 50);
        };

        if (action === "request_change") {
          const requested = isRecord(nextMeta.requested_change)
            ? (nextMeta.requested_change as Record<string, unknown>)
            : null;
          const requestedStartsAt =
            requested && typeof requested.starts_at === "string"
              ? requested.starts_at
              : "";

          const requestedDateLabel = requestedStartsAt
            ? formatDateLongFr(requestedStartsAt)
            : startsAtIso
              ? formatDateLongFr(startsAtIso)
              : "";

          const proEmails = await listProEmails();
          if (proEmails.length) {
            const proCtaUrl = `${baseUrl}/pro?tab=reservations&eid=${encodeURIComponent(establishmentId)}&rid=${encodeURIComponent(reservationId)}`;

            await sendTemplateEmail({
              templateKey: "pro_customer_change_request",
              lang: "fr",
              fromKey: "pro",
              to: proEmails,
              variables: {
                booking_ref: bookingRef,
                date: requestedDateLabel,
                guests: String(partySize ?? 1),
                user_name: consumerName || "Client",
                establishment: establishmentName,
                cta_url: proCtaUrl,
              },
              ctaUrl: proCtaUrl,
              meta: {
                source: "public.updateConsumerReservation",
                action,
                reservation_id: reservationId,
                establishment_id: establishmentId,
              },
            });
          }
        }

        if (
          action === "request_cancellation" ||
          action === "waitlist_refuse_offer"
        ) {
          const dateLabel = startsAtIso
            ? formatDateLongFr(startsAtIso)
            : "";

          if (consumerEmail) {
            const consumerCtaUrl = `${baseUrl}/profile/bookings/${encodeURIComponent(reservationId)}`;

            await sendTemplateEmail({
              templateKey: "user_booking_cancelled",
              lang: "fr",
              fromKey: "noreply",
              to: [consumerEmail],
              variables: {
                user_name: consumerName,
                booking_ref: bookingRef,
                date: dateLabel,
                guests: String(partySize ?? 1),
                establishment: establishmentName,
                cta_url: consumerCtaUrl,
              },
              ctaUrl: consumerCtaUrl,
              meta: {
                source: "public.updateConsumerReservation",
                action,
                reservation_id: reservationId,
                establishment_id: establishmentId,
              },
            });
          }

          const proEmails = await listProEmails();
          if (proEmails.length) {
            const proCtaUrl = `${baseUrl}/pro?tab=reservations&eid=${encodeURIComponent(establishmentId)}&rid=${encodeURIComponent(reservationId)}`;

            await sendTemplateEmail({
              templateKey: "pro_customer_cancelled",
              lang: "fr",
              fromKey: "pro",
              to: proEmails,
              variables: {
                booking_ref: bookingRef,
                date: dateLabel,
                guests: String(partySize ?? 1),
                user_name: consumerName || "Client",
                establishment: establishmentName,
                cta_url: proCtaUrl,
              },
              ctaUrl: proCtaUrl,
              meta: {
                source: "public.updateConsumerReservation",
                action,
                reservation_id: reservationId,
                establishment_id: establishmentId,
              },
            });
          }
        }

        if (action === "accept_proposed_change") {
          const nextStartsAt =
            typeof (updated as any)?.starts_at === "string"
              ? String((updated as any).starts_at)
              : "";
          const dateLabel = nextStartsAt
            ? formatDateLongFr(nextStartsAt)
            : "";

          if (consumerEmail) {
            const consumerCtaUrl = `${baseUrl}/profile/bookings/${encodeURIComponent(reservationId)}`;

            await sendTemplateEmail({
              templateKey: "user_booking_updated",
              lang: "fr",
              fromKey: "noreply",
              to: [consumerEmail],
              variables: {
                user_name: consumerName,
                booking_ref: bookingRef,
                date: dateLabel,
                guests: String(partySize ?? 1),
                establishment: establishmentName,
                cta_url: consumerCtaUrl,
              },
              ctaUrl: consumerCtaUrl,
              meta: {
                source: "public.updateConsumerReservation",
                action,
                reservation_id: reservationId,
                establishment_id: establishmentId,
              },
            });
          }
        }
      } catch (err) {
        log.warn({ err }, "transactional emails failed (updateConsumerReservation)");
      }
    })();
  }

  const reservation = updated as any;

  // NEW: auto-promotion waitlist logic
  try {
    const { data: waitlistEntry } = await supabase
      .from("waitlist_entries")
      .select(
        "id,reservation_id,slot_id,status,position,offer_sent_at,offer_expires_at,created_at,updated_at",
      )
      .eq("reservation_id", reservationId)
      .limit(1)
      .maybeSingle();

    reservation.waitlist_offer = waitlistEntry ?? null;
  } catch (err) {
    log.warn({ err }, "waitlist entry lookup failed (updateConsumerReservation)");
    reservation.waitlist_offer = null;
  }

  // Best-effort: consumer notification event
  try {
    let eventType: string | null = null;
    let channel: string | null = null;

    if (action === "request_change") {
      eventType = NotificationEventType.booking_change_requested;
      channel = "booking";
    } else if (action === "accept_proposed_change") {
      eventType = NotificationEventType.booking_change_accepted;
      channel = "booking";
    } else if (action === "decline_proposed_change") {
      eventType = NotificationEventType.booking_change_declined;
      channel = "booking";
    } else if (action === "request_cancellation") {
      eventType = NotificationEventType.booking_cancel_requested;
      channel = "booking";
    } else if (action === "waitlist_accept_offer") {
      eventType = NotificationEventType.booking_confirmed;
      channel = "waitlist";
    } else if (action === "waitlist_refuse_offer") {
      eventType = NotificationEventType.booking_cancelled;
      channel = "waitlist";
    }

    if (eventType) {
      await emitConsumerUserEvent({
        supabase,
        userId: userResult.userId,
        eventType,
        metadata: {
          reservationId,
          establishmentId,
          bookingReference: bookingRef || undefined,
          action,
          from_role: "user",
          channel: channel || undefined,
        },
      });
    }
  } catch (err) {
    log.warn({ err }, "consumer notification event failed (updateConsumerReservation)");
  }

  return res.json({ ok: true, reservation });
};

