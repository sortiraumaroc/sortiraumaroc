import type { Request, Response } from "express";
import crypto from "crypto";

import { getAdminSupabase } from "../supabaseAdmin";
import {
  ensureEscrowHoldForReservation,
  settleEscrowForReservation,
  ensureEscrowHoldForPackPurchase,
  settlePackPurchaseForRefund,
  ensureInvoiceForPackPurchase,
  ensureInvoiceForReservation,
  ensureInvoiceForVisibilityOrder,
  computeCommissionSnapshotForEstablishment,
} from "../finance";
import { emitAdminNotification } from "../adminNotifications";
import { notifyProMembers } from "../proNotifications";
import { emitConsumerUserEvent } from "../consumerNotifications";
import { sendLoggedEmail, sendTemplateEmail } from "../emailService";
import { parseLacaissePayWebhook } from "./lacaissepay";

import { formatLeJjMmAaAHeure } from "../../shared/datetime";
import { NotificationEventType } from "../../shared/notifications";
import { ACTIVE_WAITLIST_ENTRY_STATUSES } from "../../shared/reservationStates";

type Actor = { userId: string; role: string };

type WebhookEvent = {
  event_id?: string;
  kind?: string;
  provider?: string;
  occurred_at?: string;

  reservation_id?: string;
  booking_reference?: string;

  pack_purchase_id?: string;

  visibility_order_id?: string;

  transaction_id?: string;

  payment_status?: "paid" | "refunded" | "pending";
  amount_deposit_cents?: number;
  amount_total_cents?: number;
  currency?: string;
  paid_at?: string;
};

async function adjustPackStockForPurchaseBestEffort(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  packId: string;
  delta: number;
}): Promise<void> {
  try {
    const { data: pack } = await args.supabase
      .from("packs")
      .select("id,is_limited,stock")
      .eq("id", args.packId)
      .maybeSingle();

    const isLimited = (pack as any)?.is_limited === true;
    const stock = (pack as any)?.stock;
    const stockInt = typeof stock === "number" && Number.isFinite(stock) ? Math.round(stock) : stock == null ? null : Number(stock);

    if (!isLimited || stockInt == null || !Number.isFinite(stockInt)) return;

    const nextStock = Math.max(0, Math.round(stockInt + args.delta));
    await args.supabase.from("packs").update({ stock: nextStock }).eq("id", args.packId);
  } catch {
    // ignore
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readWebhookKey(req: Request, body: Record<string, unknown>): string {
  const headerKey = asString(req.header("x-webhook-key") ?? "");
  if (headerKey) return headerKey;

  const q = isRecord(req.query) ? (req.query as Record<string, unknown>) : {};

  return (
    asString(q.webhook_key) ||
    asString(q.secret) ||
    asString(q.token) ||
    asString(body.webhook_key) ||
    asString(body.secret) ||
    asString(body.token)
  );
}

function expectedWebhookKey(): string {
  // Prefer a dedicated secret, but keep ADMIN_API_KEY as fallback for dev environments.
  return (process.env.PAYMENTS_WEBHOOK_KEY || process.env.ADMIN_API_KEY || "").trim();
}

/**
 * SECURITY: Verify HMAC signature for webhook requests
 * This provides cryptographic proof that the webhook came from a legitimate source
 *
 * Expected header: X-Webhook-Signature: sha256=<hex-encoded-hmac>
 * The signature is computed over the raw request body using the webhook secret
 */
function verifyWebhookSignature(req: Request, secret: string): { valid: boolean; reason?: string } {
  const signatureHeader = req.header("x-webhook-signature") || req.header("x-signature");

  // If no signature header is provided, fall back to key-based auth (backward compatibility)
  // In production, you should eventually require signatures
  if (!signatureHeader) {
    return { valid: true, reason: "no_signature_header" };
  }

  // Parse the signature header (format: "sha256=<hex>")
  const parts = signatureHeader.split("=");
  if (parts.length !== 2) {
    return { valid: false, reason: "invalid_signature_format" };
  }

  const algorithm = parts[0].toLowerCase();
  const providedSignature = parts[1].toLowerCase();

  if (algorithm !== "sha256") {
    return { valid: false, reason: "unsupported_algorithm" };
  }

  // Get the raw body for signature verification
  // Express stores the raw body in req.body if configured properly, but we need the string form
  let rawBody: string;
  if (typeof (req as any).rawBody === "string") {
    rawBody = (req as any).rawBody;
  } else if (Buffer.isBuffer((req as any).rawBody)) {
    rawBody = (req as any).rawBody.toString("utf8");
  } else {
    // Fallback: stringify the body (not ideal for signature verification)
    rawBody = JSON.stringify(req.body);
  }

  // Compute the expected signature
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex")
    .toLowerCase();

  // Use timing-safe comparison to prevent timing attacks
  const providedBuffer = Buffer.from(providedSignature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (providedBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: "signature_length_mismatch" };
  }

  const isValid = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  return { valid: isValid, reason: isValid ? undefined : "signature_mismatch" };
}

function normalizePaymentStatus(value: unknown): WebhookEvent["payment_status"] {
  const s = asString(value).toLowerCase();
  if (s === "paid" || s === "pending" || s === "refunded") return s as WebhookEvent["payment_status"];
  return undefined;
}

function normalizeKind(value: unknown): string {
  const s = asString(value).toLowerCase();
  return s;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function normalizeIso(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  const ts = Date.parse(s);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function buildActor(event: WebhookEvent): Actor {
  const provider = asString(event.provider) || "unknown";
  return { userId: `webhook:${provider}`, role: "system:payments_webhook" };
}

function canDedupByMeta(meta: unknown, eventId: string): boolean {
  if (!isRecord(meta)) return false;
  const list = meta.payment_event_ids;
  return Array.isArray(list) && list.some((x) => typeof x === "string" && x === eventId);
}

function appendEventIdToMeta(meta: unknown, eventId: string): Record<string, unknown> {
  const base = isRecord(meta) ? { ...meta } : {};
  const existing = Array.isArray(base.payment_event_ids)
    ? (base.payment_event_ids as unknown[]).filter((x) => typeof x === "string")
    : [];

  const next = existing.includes(eventId) ? existing : [...existing, eventId].slice(-50);
  return { ...base, payment_event_ids: next };
}

function appendTransactionIdToMeta(meta: unknown, transactionId: string): Record<string, unknown> {
  const base = isRecord(meta) ? { ...meta } : {};
  const current = asString(base.payment_transaction_id);
  if (current && current === transactionId) return base;
  if (current && current !== transactionId) {
    return {
      ...base,
      payment_transaction_id: transactionId,
      payment_transaction_id_previous: current,
    };
  }
  return { ...base, payment_transaction_id: transactionId };
}

function getPublicBaseUrl(): string {
  return asString(process.env.PUBLIC_BASE_URL) || "https://sortiraumaroc.ma";
}

function listInternalVisibilityOrderEmails(): string[] {
  const raw = typeof process.env.VISIBILITY_ORDERS_EMAILS === "string" ? process.env.VISIBILITY_ORDERS_EMAILS.trim() : "";
  if (raw) {
    return raw
      .split(/[;,]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const domain = (process.env.EMAIL_DOMAIN || "sortiraumaroc.ma").trim() || "sortiraumaroc.ma";
  return [`pro@${domain}`];
}

async function listAuthEmailsByUserIds(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  userIds: string[];
}): Promise<string[]> {
  const wanted = new Set(args.userIds.map((x) => asString(x)).filter(Boolean));
  if (!wanted.size) return [];

  const emails: string[] = [];

  for (let page = 1; page <= 20; page += 1) {
    if (emails.length >= wanted.size) break;
    const { data, error } = await args.supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;

    for (const u of data.users ?? []) {
      const uid = asString((u as any)?.id);
      if (!uid || !wanted.has(uid)) continue;
      const em = asString((u as any)?.email);
      if (em) emails.push(em);
    }

    if (!data.users?.length) break;
  }

  return Array.from(new Set(emails.map((x) => x.trim()).filter(Boolean)));
}

async function getConsumerEmailAndName(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  userId: string;
}): Promise<{ email: string; fullName: string }> {
  const userId = asString(args.userId);
  if (!userId) return { email: "", fullName: "" };

  try {
    const { data } = await args.supabase.from("consumer_users").select("email,full_name").eq("id", userId).maybeSingle();
    const email = typeof (data as any)?.email === "string" ? String((data as any).email).trim() : "";
    const fullName = typeof (data as any)?.full_name === "string" ? String((data as any).full_name).trim() : "";
    if (email) return { email, fullName };
  } catch {
    // ignore
  }

  // Fallback: try auth users
  try {
    const emails = await listAuthEmailsByUserIds({ supabase: args.supabase, userIds: [userId] });
    return { email: emails[0] ?? "", fullName: "" };
  } catch {
    return { email: "", fullName: "" };
  }
}

async function getProMemberEmailsForEstablishment(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  establishmentId: string;
}): Promise<string[]> {
  const establishmentId = asString(args.establishmentId);
  if (!establishmentId) return [];

  try {
    const { data: memberships } = await args.supabase
      .from("pro_establishment_memberships")
      .select("user_id")
      .eq("establishment_id", establishmentId)
      .limit(5000);

    const userIds = Array.from(
      new Set(
        ((memberships ?? []) as Array<any>)
          .map((m) => (typeof m?.user_id === "string" ? m.user_id : ""))
          .map((x) => asString(x))
          .filter(Boolean),
      ),
    ).slice(0, 200);

    return await listAuthEmailsByUserIds({ supabase: args.supabase, userIds });
  } catch {
    return [];
  }
}

async function getEstablishmentName(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  establishmentId: string;
}): Promise<string> {
  const establishmentId = asString(args.establishmentId);
  if (!establishmentId) return "";

  try {
    const { data } = await args.supabase.from("establishments").select("name").eq("id", establishmentId).maybeSingle();
    return typeof (data as any)?.name === "string" ? String((data as any).name) : "";
  } catch {
    return "";
  }
}

export async function handlePaymentsWebhook(req: Request, res: Response) {
  const expected = expectedWebhookKey();
  if (!expected) {
    return res
      .status(503)
      .json({ ok: false, status: "ERROR", error: "PAYMENTS_WEBHOOK_KEY (or ADMIN_API_KEY fallback) is missing" });
  }

  const body = isRecord(req.body) ? (req.body as Record<string, unknown>) : {};

  // SECURITY: First, verify HMAC signature if provided
  const signatureResult = verifyWebhookSignature(req, expected);
  if (!signatureResult.valid) {
    console.warn(
      "[PaymentsWebhook] SECURITY: Invalid webhook signature",
      "Reason:",
      signatureResult.reason,
      "IP:",
      req.ip || req.socket?.remoteAddress
    );
    return res.status(401).json({
      ok: false,
      status: "ERROR",
      error: "Invalid signature",
      reason: signatureResult.reason,
    });
  }

  // If signature was provided and valid, we're authenticated
  // Otherwise, fall back to API key verification
  if (signatureResult.reason === "no_signature_header") {
    const provided = readWebhookKey(req, body);
    if (!provided || provided !== expected) {
      console.warn(
        "[PaymentsWebhook] SECURITY: Invalid webhook key",
        "IP:",
        req.ip || req.socket?.remoteAddress
      );
      return res.status(401).json({ ok: false, status: "ERROR", error: "Unauthorized" });
    }
  }

  const lacaisse = parseLacaissePayWebhook(body);

  // Handle LacaissePay payments for SAM Media invoices.
  if (lacaisse && lacaisse.externalId.startsWith("MEDIA_INVOICE:")) {
    const invoiceId = lacaisse.externalId.slice("MEDIA_INVOICE:".length).trim();
    if (!invoiceId || !isUuid(invoiceId)) {
      return res.status(400).json({ ok: false, status: "ERROR", error: "invalid_invoice_id" });
    }

    // Only record successful payments.
    if (lacaisse.status !== "paid") {
      return res.json({ ok: true, status: "OK", ignored: true });
    }

    const supabase = getAdminSupabase();

    const { data: invoice, error: invErr } = await supabase
      .from("media_invoices")
      .select("id,total_amount,paid_amount,status")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invErr) return res.status(500).json({ ok: false, status: "ERROR", error: invErr.message });
    if (!invoice) return res.status(404).json({ ok: false, status: "ERROR", error: "invoice_not_found" });

    const total = typeof (invoice as any).total_amount === "number" ? (invoice as any).total_amount : Number((invoice as any).total_amount ?? 0);
    const prevPaid = typeof (invoice as any).paid_amount === "number" ? (invoice as any).paid_amount : Number((invoice as any).paid_amount ?? 0);

    const amount = Math.round((Number(lacaisse.amount) || 0) * 100) / 100;
    if (!amount || amount <= 0) return res.status(400).json({ ok: false, status: "ERROR", error: "invalid_amount" });

    const nextPaid = Math.round((prevPaid + amount) * 100) / 100;
    const nextStatus = nextPaid >= total ? "paid" : "partial";

    const paidAt = lacaisse.createdAt || new Date().toISOString();

    const { error: payErr } = await supabase.from("media_invoice_payments").insert({
      invoice_id: invoiceId,
      method: "card",
      amount,
      reference: `lacaissepay:${lacaisse.operationId}`,
      paid_at: paidAt,
    });

    if (payErr) return res.status(500).json({ ok: false, status: "ERROR", error: payErr.message });

    const { error: updErr } = await supabase
      .from("media_invoices")
      .update({ paid_amount: nextPaid, status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", invoiceId);

    if (updErr) return res.status(500).json({ ok: false, status: "ERROR", error: updErr.message });

    await supabase.from("admin_audit_log").insert({
      action: "media.invoice.webhook_paid",
      entity_type: "media_invoices",
      entity_id: invoiceId,
      metadata: { provider: "lacaissepay", operation_id: lacaisse.operationId, amount, paid_at: paidAt },
    });

    return res.json({ ok: true, status: "OK" });
  }

  // If LacaissePay posts its native payload, normalize it to our unified format for the existing logic.
  const normalized = lacaisse
    ? ({
        ...body,
        provider: "lacaissepay",
        kind: lacaisse.status === "paid" ? "reservation.paid" : "reservation.pending",
        reservation_id: lacaisse.externalId,
        transaction_id: lacaisse.operationId,
        payment_status: lacaisse.status,
        amount_total_cents: Math.round((Number(lacaisse.amount) || 0) * 100),
        currency: "MAD",
        paid_at: lacaisse.createdAt,
      } as Record<string, unknown>)
    : body;

  const event: WebhookEvent = {
    event_id: asString(normalized.event_id) || undefined,
    kind: asString(normalized.kind) || undefined,
    provider: asString(normalized.provider) || undefined,
    occurred_at: normalizeIso(normalized.occurred_at) || undefined,

    reservation_id: asString(normalized.reservation_id) || undefined,
    booking_reference: asString(normalized.booking_reference) || undefined,

    pack_purchase_id: asString(normalized.pack_purchase_id || normalized.pack_purchaseId || normalized.purchase_id || normalized.purchaseId) || undefined,

    visibility_order_id: asString(normalized.visibility_order_id || normalized.visibility_orderId || normalized.order_id || normalized.orderId) || undefined,

    transaction_id: asString(normalized.transaction_id || normalized.transactionId || normalized.payment_id || normalized.paymentId) || undefined,

    payment_status: normalizePaymentStatus(normalized.payment_status),
    amount_deposit_cents: asNumber(normalized.amount_deposit_cents) ?? undefined,
    amount_total_cents: asNumber(normalized.amount_total_cents) ?? undefined,
    currency: asString(normalized.currency) || undefined,
    paid_at: normalizeIso(normalized.paid_at) || undefined,
  };

  const kind = normalizeKind(event.kind);

  const statusFromKind =
    kind === "reservation.paid"
      ? "paid"
      : kind === "reservation.refunded"
        ? "refunded"
        : kind === "pack.paid"
          ? "paid"
          : kind === "pack.refunded"
            ? "refunded"
            : kind === "visibility.paid"
              ? "paid"
              : kind === "visibility.refunded"
                ? "refunded"
                : undefined;

  const nextPaymentStatus = event.payment_status ?? statusFromKind;

  if (!nextPaymentStatus) {
    return res.status(400).json({ ok: false, error: "payment_status (or kind reservation.paid/reservation.refunded) is required" });
  }

  const reservationId = asString(event.reservation_id);
  const bookingRef = asString(event.booking_reference);
  const packPurchaseId = asString(event.pack_purchase_id);
  const visibilityOrderId = asString(event.visibility_order_id);
  const transactionId = asString(event.transaction_id);

  const isPackEvent = kind.startsWith("pack.") || !!packPurchaseId;
  const isVisibilityEvent = kind.startsWith("visibility.") || !!visibilityOrderId;

  if (isPackEvent) {
    if (!packPurchaseId && !transactionId) {
      return res.status(400).json({ ok: false, status: "ERROR", error: "pack_purchase_id or transaction_id is required" });
    }

    const supabase = getAdminSupabase();

    const packQ = supabase
      .from("pack_purchases")
      .select("id,establishment_id,pack_id,buyer_name,buyer_email,quantity,unit_price,total_price,currency,payment_status,status,valid_until,meta,created_at,updated_at")
      .limit(1);

    const { data: existing, error: selErr } = packPurchaseId
      ? isUuid(packPurchaseId)
        ? await packQ.eq("id", packPurchaseId).maybeSingle()
        : await packQ.contains("meta", { purchase_reference: packPurchaseId }).maybeSingle()
      : await packQ.contains("meta", { payment_transaction_id: transactionId }).maybeSingle();

    if (selErr) return res.status(500).json({ ok: false, status: "ERROR", error: selErr.message });
    if (!existing?.id) return res.status(404).json({ ok: false, status: "ERROR", error: "pack_purchase_not_found" });

    const eventId = asString(event.event_id);
    if (eventId && canDedupByMeta((existing as any).meta, eventId)) {
      return res.json({ ok: true, status: "OK", deduped: true });
    }

    const prevPaymentStatus = asString((existing as any).payment_status).toLowerCase();

    const patch: Record<string, unknown> = {
      payment_status: nextPaymentStatus,
      updated_at: new Date().toISOString(),
    };

    if (nextPaymentStatus === "refunded") patch.status = "refunded";

    if (typeof event.amount_total_cents === "number") patch.total_price = Math.max(0, Math.round(event.amount_total_cents));
    if (event.currency) patch.currency = event.currency.toUpperCase();

    let nextMeta: Record<string, unknown> = isRecord((existing as any).meta) ? { ...((existing as any).meta as Record<string, unknown>) } : {};

    if (transactionId) {
      nextMeta = appendTransactionIdToMeta(nextMeta, transactionId);
    }

    if (eventId) {
      nextMeta = appendEventIdToMeta(nextMeta, eventId);
    }

    if (nextPaymentStatus === "paid") {
      const paidAtIso = event.paid_at ?? new Date().toISOString();
      nextMeta = { ...nextMeta, paid_at: paidAtIso };
    }

    patch.meta = nextMeta;

    // Snapshot commission when payment is validated (best-effort, do not block).
    if (nextPaymentStatus === "paid") {
      const priceCents = typeof patch.total_price === "number"
        ? Math.round(patch.total_price)
        : typeof (existing as any).total_price === "number"
          ? Math.round((existing as any).total_price)
          : null;

      if (priceCents !== null && priceCents > 0) {
        try {
          const establishmentId = asString((existing as any).establishment_id);
          const snapshot = await computeCommissionSnapshotForEstablishment({
            establishmentId,
            depositCents: priceCents,
          });

          // For packs, we don't typically store commission in pack_purchases table,
          // but we pass it to the escrow pipeline via the actor metadata
          nextMeta = { ...nextMeta, commission_percent: snapshot.commission_percent, commission_amount: snapshot.commission_amount };
          patch.meta = nextMeta;
        } catch (e) {
          console.error("commission snapshot failed for pack purchase", e);
          // Do not block the webhook on commission calculation errors
        }
      }
    }

    const { error: updErr } = await supabase.from("pack_purchases").update(patch).eq("id", (existing as any).id);
    if (updErr) return res.status(500).json({ ok: false, status: "ERROR", error: updErr.message });

    // Finance pipeline: handle escrow for pack purchases (best-effort, do not block).
    try {
      const actor = buildActor(event);
      if (nextPaymentStatus === "paid" && prevPaymentStatus !== "paid") {
        await ensureEscrowHoldForPackPurchase({ purchaseId: (existing as any).id, actor });

        const invKey = eventId
          ? `invoice:pack_purchase:${String((existing as any).id)}:${eventId}`
          : transactionId
            ? `invoice:pack_purchase:${String((existing as any).id)}:${transactionId}`
            : null;

        await ensureInvoiceForPackPurchase({
          purchaseId: (existing as any).id,
          actor,
          idempotencyKey: invKey,
          issuedAtIso: event.paid_at ?? null,
        });
      }

      if (nextPaymentStatus === "refunded" && prevPaymentStatus === "paid") {
        await settlePackPurchaseForRefund({ purchaseId: (existing as any).id, actor });
      }
    } catch (e) {
      console.error("finance pipeline failed (pack_purchase webhook)", e);
      // Do not block the webhook on finance errors
    }

    // Best-effort: keep pack stock in sync for limited offers.
    try {
      const packId = asString((existing as any).pack_id);
      const qty = typeof (existing as any).quantity === "number" && Number.isFinite((existing as any).quantity)
        ? Math.max(1, Math.min(50, Math.floor((existing as any).quantity)))
        : 1;

      if (packId && prevPaymentStatus !== nextPaymentStatus) {
        if (nextPaymentStatus === "paid" && prevPaymentStatus !== "paid") {
          await adjustPackStockForPurchaseBestEffort({ supabase, packId, delta: -qty });
        }

        if (nextPaymentStatus === "refunded" && prevPaymentStatus === "paid") {
          await adjustPackStockForPurchaseBestEffort({ supabase, packId, delta: qty });
        }
      }
    } catch {
      // ignore
    }

    // Best-effort notifications (do not block the webhook).
    try {
      const establishmentId = asString((existing as any).establishment_id);
      const total = typeof patch.total_price === "number" ? patch.total_price : (existing as any).total_price;
      const currency = (typeof patch.currency === "string" ? patch.currency : asString((existing as any).currency)) || "MAD";

      const totalLabel = typeof total === "number" && Number.isFinite(total) ? `${Math.round(total / 100)} ${currency}` : "";

      const { proTitle, proBody, proAction, adminType, canonical } = (() => {
        if (nextPaymentStatus === "paid") {
          return {
            proTitle: "Pack acheté",
            proBody: `Achat pack${totalLabel ? ` · ${totalLabel}` : ""}`,
            proAction: "pack_purchase_paid",
            adminType: "pack_purchased",
            canonical: NotificationEventType.pack_purchased,
          };
        }

        if (nextPaymentStatus === "refunded") {
          return {
            proTitle: "Pack remboursé",
            proBody: `Achat pack${totalLabel ? ` · ${totalLabel}` : ""}`,
            proAction: "pack_purchase_refunded",
            adminType: "pack_refunded",
            canonical: NotificationEventType.refund_done,
          };
        }

        return {
          proTitle: "Pack en attente",
          proBody: `Achat pack${totalLabel ? ` · ${totalLabel}` : ""}`,
          proAction: "pack_purchase_pending",
          adminType: "pack_pending",
          canonical: NotificationEventType.payment_failed,
        };
      })();

      if (establishmentId) {
        await notifyProMembers({
          supabase,
          establishmentId,
          category: "billing",
          title: proTitle,
          body: proBody,
          data: {
            purchaseId: asString((existing as any).id),
            establishmentId,
            action: proAction,
            event_type: canonical,
            source: "payments_webhook",
            transaction_id: transactionId || undefined,
          },
        });

        await emitAdminNotification({
          type: adminType,
          title: proTitle,
          body: proBody,
          data: {
            purchaseId: asString((existing as any).id),
            establishmentId,
            paymentStatus: nextPaymentStatus,
            event_type: canonical,
            source: "payments_webhook",
            transaction_id: transactionId || undefined,
          },
        });

        const buyerUserId = isRecord((existing as any).meta) ? asString(((existing as any).meta as any).buyer_user_id) : "";
        if (buyerUserId && nextPaymentStatus === "paid") {
          await emitConsumerUserEvent({
            supabase,
            userId: buyerUserId,
            eventType: NotificationEventType.pack_purchased,
            metadata: {
              purchaseId: asString((existing as any).id),
              establishmentId,
              transaction_id: transactionId || undefined,
            },
          });
        }

        if (buyerUserId && nextPaymentStatus === "refunded") {
          await emitConsumerUserEvent({
            supabase,
            userId: buyerUserId,
            eventType: NotificationEventType.refund_done,
            metadata: {
              purchaseId: asString((existing as any).id),
              establishmentId,
              transaction_id: transactionId || undefined,
            },
          });
        }
      }
    } catch {
      // ignore
    }

    return res.json({ ok: true, status: "OK" });
  }

  if (isVisibilityEvent) {
    if (!visibilityOrderId && !transactionId) {
      return res.status(400).json({ ok: false, status: "ERROR", error: "visibility_order_id or transaction_id is required" });
    }

    const supabase = getAdminSupabase();

    const q = supabase
      .from("visibility_orders")
      .select("id,establishment_id,created_by_user_id,payment_status,status,currency,subtotal_cents,tax_cents,total_cents,paid_at,meta,created_at,updated_at")
      .limit(1);

    const { data: existing, error: selErr } = visibilityOrderId
      ? isUuid(visibilityOrderId)
        ? await q.eq("id", visibilityOrderId).maybeSingle()
        : await q.contains("meta", { purchase_reference: visibilityOrderId }).maybeSingle()
      : await q.contains("meta", { payment_transaction_id: transactionId }).maybeSingle();

    if (selErr) return res.status(500).json({ ok: false, status: "ERROR", error: selErr.message });
    if (!existing?.id) return res.status(404).json({ ok: false, status: "ERROR", error: "visibility_order_not_found" });

    const eventId = asString(event.event_id);
    if (eventId && canDedupByMeta((existing as any).meta, eventId)) {
      return res.json({ ok: true, status: "OK", deduped: true });
    }

    const prevPaymentStatus = asString((existing as any).payment_status).toLowerCase();

    const patch: Record<string, unknown> = {
      payment_status: nextPaymentStatus,
      updated_at: new Date().toISOString(),
    };

    if (nextPaymentStatus === "refunded") patch.status = "refunded";

    if (typeof event.amount_total_cents === "number") patch.total_cents = Math.max(0, Math.round(event.amount_total_cents));
    if (event.currency) patch.currency = event.currency.toUpperCase();

    let nextMeta: Record<string, unknown> = isRecord((existing as any).meta) ? { ...((existing as any).meta as Record<string, unknown>) } : {};

    if (transactionId) nextMeta = appendTransactionIdToMeta(nextMeta, transactionId);
    if (eventId) nextMeta = appendEventIdToMeta(nextMeta, eventId);

    if (nextPaymentStatus === "paid") {
      const paidAtIso = event.paid_at ?? new Date().toISOString();
      patch.paid_at = paidAtIso;
      nextMeta = { ...nextMeta, paid_at: paidAtIso };
    }

    patch.meta = nextMeta;

    // Snapshot commission when payment is validated (best-effort, do not block).
    if (nextPaymentStatus === "paid") {
      const totalCents = typeof patch.total_cents === "number"
        ? Math.round(patch.total_cents)
        : typeof (existing as any).total_cents === "number"
          ? Math.round((existing as any).total_cents)
          : null;

      if (totalCents !== null && totalCents > 0) {
        try {
          const establishmentId = asString((existing as any).establishment_id);
          const snapshot = await computeCommissionSnapshotForEstablishment({
            establishmentId,
            depositCents: totalCents,
          });

          // Store commission info in metadata for visibility orders
          nextMeta = { ...nextMeta, commission_percent: snapshot.commission_percent, commission_amount: snapshot.commission_amount };
          patch.meta = nextMeta;
        } catch (e) {
          console.error("commission snapshot failed for visibility order", e);
          // Do not block the webhook on commission calculation errors
        }
      }
    }

    const { error: updErr } = await supabase.from("visibility_orders").update(patch).eq("id", (existing as any).id);
    if (updErr) return res.status(500).json({ ok: false, status: "ERROR", error: updErr.message });

    // Finance pipeline: invoice generation (best-effort).
    try {
      const actor = buildActor(event);
      if (nextPaymentStatus === "paid" && prevPaymentStatus !== "paid") {
        const invKey = eventId
          ? `invoice:visibility_order:${String((existing as any).id)}:${eventId}`
          : transactionId
            ? `invoice:visibility_order:${String((existing as any).id)}:${transactionId}`
            : null;

        await ensureInvoiceForVisibilityOrder({
          orderId: (existing as any).id,
          actor,
          idempotencyKey: invKey,
          issuedAtIso: event.paid_at ?? null,
        });
      }
    } catch (e) {
      console.error("finance pipeline failed (visibility_order webhook)", e);
    }

    // Best-effort notifications.
    try {
      const establishmentId = asString((existing as any).establishment_id);
      const total = typeof patch.total_cents === "number" ? patch.total_cents : (existing as any).total_cents;
      const currency = (typeof patch.currency === "string" ? patch.currency : asString((existing as any).currency)) || "MAD";
      const totalLabel = typeof total === "number" && Number.isFinite(total) ? `${Math.round(total / 100)} ${currency}` : "";

      const { proTitle, proBody, proAction, adminType, canonical } = (() => {
        if (nextPaymentStatus === "paid") {
          return {
            proTitle: "Commande visibilité payée",
            proBody: `Commande visibilité${totalLabel ? ` · ${totalLabel}` : ""}`,
            proAction: "visibility_order_paid",
            adminType: "visibility_order_paid",
            canonical: NotificationEventType.payment_succeeded,
          };
        }

        if (nextPaymentStatus === "refunded") {
          return {
            proTitle: "Commande visibilité remboursée",
            proBody: `Commande visibilité${totalLabel ? ` · ${totalLabel}` : ""}`,
            proAction: "visibility_order_refunded",
            adminType: "visibility_order_refunded",
            canonical: NotificationEventType.refund_done,
          };
        }

        return {
          proTitle: "Commande visibilité en attente",
          proBody: `Commande visibilité${totalLabel ? ` · ${totalLabel}` : ""}`,
          proAction: "visibility_order_pending",
          adminType: "visibility_order_pending",
          canonical: NotificationEventType.payment_pending,
        };
      })();

      if (establishmentId) {
        await notifyProMembers({
          supabase,
          establishmentId,
          category: "visibility",
          title: proTitle,
          body: proBody,
          data: {
            orderId: asString((existing as any).id),
            establishmentId,
            action: proAction,
            event_type: canonical,
            source: "payments_webhook",
            transaction_id: transactionId || undefined,
          },
        });

        await emitAdminNotification({
          type: adminType,
          title: proTitle,
          body: proBody,
          data: {
            orderId: asString((existing as any).id),
            establishmentId,
            paymentStatus: nextPaymentStatus,
            event_type: canonical,
            source: "payments_webhook",
            transaction_id: transactionId || undefined,
          },
        });
      }
    } catch {
      // ignore
    }

    // Emails transactionnels (best-effort)
    if (nextPaymentStatus === "paid" && prevPaymentStatus !== "paid") {
      void (async () => {
        try {
          const baseUrl = getPublicBaseUrl();
          const establishmentId = asString((existing as any).establishment_id);
          const orderId = asString((existing as any).id);

          if (!establishmentId || !orderId) return;

          const totalCents = typeof patch.total_cents === "number" ? patch.total_cents : (existing as any).total_cents;
          const currency = (typeof patch.currency === "string" ? patch.currency : asString((existing as any).currency)) || "MAD";
          const amountLabel = typeof totalCents === "number" && Number.isFinite(totalCents) ? `${Math.round(totalCents / 100)} ${currency}` : "";

          const establishmentName = await getEstablishmentName({ supabase, establishmentId });

          const proEmails = await getProMemberEmailsForEstablishment({ supabase, establishmentId });
          const internalEmails = listInternalVisibilityOrderEmails();

          const visibilityCtaUrl = `${baseUrl}/pro?tab=visibility&eid=${encodeURIComponent(establishmentId)}`;
          const billingCtaUrl = `${baseUrl}/pro?tab=billing&eid=${encodeURIComponent(establishmentId)}`;
          const adminUrl = `${baseUrl}/admin/visibility`;

          if (proEmails.length) {
            await sendTemplateEmail({
              templateKey: "pro_visibility_activated",
              lang: "fr",
              fromKey: "pro",
              to: proEmails.slice(0, 50),
              variables: {
                establishment: establishmentName,
                amount: amountLabel,
                cta_url: visibilityCtaUrl,
              },
              ctaUrl: visibilityCtaUrl,
              meta: {
                source: "payments.webhook.visibility_order",
                establishment_id: establishmentId,
                order_id: orderId,
                payment_status: nextPaymentStatus,
              },
            });

            await sendTemplateEmail({
              templateKey: "finance_invoice_to_pro",
              lang: "fr",
              fromKey: "finance",
              to: proEmails.slice(0, 50),
              variables: {
                establishment: establishmentName,
                amount: amountLabel,
                cta_url: billingCtaUrl,
              },
              ctaUrl: billingCtaUrl,
              meta: {
                source: "payments.webhook.visibility_order",
                establishment_id: establishmentId,
                order_id: orderId,
                payment_status: nextPaymentStatus,
              },
            });
          }

          if (internalEmails.length) {
            await sendLoggedEmail({
              emailId: `admin_visibility_order_paid:${orderId}`,
              fromKey: "finance",
              to: internalEmails,
              subject: `Commande Visibilité payée — ${establishmentName || establishmentId}`,
              bodyText: [
                "Une commande Visibilité vient d’être payée.",
                "",
                `Établissement: ${establishmentName || establishmentId}`,
                `Commande: ${orderId}`,
                amountLabel ? `Montant: ${amountLabel}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
              ctaLabel: "Ouvrir dans l’admin",
              ctaUrl: adminUrl,
              meta: {
                source: "payments.webhook.visibility_order",
                establishment_id: establishmentId,
                order_id: orderId,
                payment_status: nextPaymentStatus,
              },
            });
          }
        } catch {
          // ignore
        }
      })();
    }

    return res.json({ ok: true, status: "OK" });
  }

  if (!reservationId && !bookingRef && !transactionId) {
    return res.status(400).json({ ok: false, status: "ERROR", error: "reservation_id, booking_reference or transaction_id is required" });
  }

  const supabase = getAdminSupabase();

  const q = supabase
    .from("reservations")
    .select("id,booking_reference,establishment_id,user_id,status,starts_at,slot_id,party_size,payment_status,checked_in_at,amount_deposit,amount_total,currency,commission_percent,commission_amount,meta")
    .limit(1);

  const { data: existing, error: selErr } = reservationId
    ? isUuid(reservationId)
      ? await q.eq("id", reservationId).maybeSingle()
      : await q.eq("booking_reference", reservationId).maybeSingle()
    : bookingRef
      ? await q.eq("booking_reference", bookingRef).maybeSingle()
      : await q.contains("meta", { payment_transaction_id: transactionId }).maybeSingle();

  if (selErr) return res.status(500).json({ ok: false, status: "ERROR", error: selErr.message });
  if (!existing?.id) return res.status(404).json({ ok: false, status: "ERROR", error: "reservation_not_found" });

  const eventId = asString(event.event_id);
  if (eventId && canDedupByMeta(existing.meta, eventId)) {
    return res.json({ ok: true, status: "OK", deduped: true });
  }

  const prevPaymentStatus = asString((existing as any).payment_status).toLowerCase();

  // SECURITY: Validate that the paid amount matches the expected amount (stored in reservation)
  const expectedDepositCents = typeof (existing as any).amount_deposit === "number"
    ? Math.round((existing as any).amount_deposit)
    : null;
  const expectedTotalCents = typeof (existing as any).amount_total === "number"
    ? Math.round((existing as any).amount_total)
    : null;
  const webhookAmountCents = typeof event.amount_total_cents === "number"
    ? Math.round(event.amount_total_cents)
    : null;

  // CRITICAL: If we have an expected amount and webhook sends a different amount, log it
  // Allow a small tolerance (1 MAD = 100 centimes) for rounding differences
  const AMOUNT_TOLERANCE_CENTS = 100;
  if (
    expectedDepositCents !== null &&
    webhookAmountCents !== null &&
    Math.abs(expectedDepositCents - webhookAmountCents) > AMOUNT_TOLERANCE_CENTS
  ) {
    console.warn(
      "[PaymentsWebhook] SECURITY: Amount mismatch! Expected:",
      expectedDepositCents,
      "Received:",
      webhookAmountCents,
      "Reservation:",
      existing.id,
      "Diff:",
      webhookAmountCents - expectedDepositCents
    );

    // If amount is significantly LOWER than expected, reject the payment
    if (webhookAmountCents < expectedDepositCents - AMOUNT_TOLERANCE_CENTS) {
      console.error(
        "[PaymentsWebhook] CRITICAL: Underpayment detected! Rejecting payment.",
        "Expected:",
        expectedDepositCents,
        "Received:",
        webhookAmountCents
      );

      // Log this security event
      await supabase.from("system_logs").insert({
        actor_user_id: null,
        actor_role: "system:payments_webhook",
        action: "payment.amount_mismatch_rejected",
        entity_type: "reservation",
        entity_id: existing.id,
        payload: {
          expected_cents: expectedDepositCents,
          received_cents: webhookAmountCents,
          difference_cents: webhookAmountCents - expectedDepositCents,
          transaction_id: transactionId || null,
          provider: event.provider,
        },
      }).catch(() => { /* ignore logging errors */ });

      return res.status(400).json({
        ok: false,
        status: "ERROR",
        error: "amount_mismatch",
        expected: expectedDepositCents,
        received: webhookAmountCents,
      });
    }
  }

  const patch: Record<string, unknown> = {
    payment_status: nextPaymentStatus,
    updated_at: new Date().toISOString(),
  };

  // Keep a trace to link provider transaction -> reservation.
  if (transactionId) {
    patch.meta = appendTransactionIdToMeta(existing.meta, transactionId);
  }

  // SECURITY: Do NOT overwrite amounts from webhook - use stored amounts only
  // The webhook amount is logged for audit but never used to update the reservation
  // This prevents attackers from paying less than the expected amount
  // if (typeof event.amount_deposit_cents === "number") patch.amount_deposit = Math.max(0, Math.round(event.amount_deposit_cents));
  // if (typeof event.amount_total_cents === "number") patch.amount_total = Math.max(0, Math.round(event.amount_total_cents));
  if (event.currency) patch.currency = event.currency.toUpperCase();

  if (eventId) {
    const baseMeta = patch.meta ?? existing.meta;
    patch.meta = appendEventIdToMeta(baseMeta, eventId);
  }

  // Snapshot commission when payment is validated (best-effort, do not block).
  if (nextPaymentStatus === "paid") {
    const depositCents = typeof patch.amount_deposit === "number"
      ? Math.round(patch.amount_deposit)
      : typeof (existing as any).amount_deposit === "number"
        ? Math.round((existing as any).amount_deposit)
        : null;

    if (depositCents !== null && depositCents > 0) {
      try {
        const establishmentId = asString((existing as any).establishment_id);
        const snapshot = await computeCommissionSnapshotForEstablishment({
          establishmentId,
          depositCents,
        });

        patch.commission_percent = snapshot.commission_percent;
        patch.commission_amount = snapshot.commission_amount;
      } catch (e) {
        console.error("commission snapshot failed for reservation", e);
        // Do not block the webhook on commission calculation errors
      }
    }
  }

  const { error: updErr } = await supabase.from("reservations").update(patch).eq("id", existing.id);
  if (updErr) return res.status(500).json({ ok: false, status: "ERROR", error: updErr.message });

  // Auto-confirm guaranteed reservations only AFTER payment is validated.
  // Best-effort: never block the webhook.
  try {
    if (nextPaymentStatus === "paid") {
      const statusPrev = String((existing as any).status ?? "");
      const depositCentsRaw = typeof patch.amount_deposit === "number" ? patch.amount_deposit : (existing as any).amount_deposit;
      const depositCents = typeof depositCentsRaw === "number" && Number.isFinite(depositCentsRaw) ? Math.max(0, Math.round(depositCentsRaw)) : 0;

      const shouldAutoConfirm = depositCents > 0 && (statusPrev === "pending_pro_validation" || statusPrev === "requested");

      if (shouldAutoConfirm) {
        const establishmentId = asString((existing as any).establishment_id);
        const slotId = asString((existing as any).slot_id);
        const partySizeRaw = (existing as any).party_size;
        const partySize = typeof partySizeRaw === "number" && Number.isFinite(partySizeRaw) ? Math.max(1, Math.round(partySizeRaw)) : 1;

        let canConfirm = true;
        let blockReason: string | null = null;

        // Hard business rule: do not let a paid booking jump ahead of an active waitlist.
        // If there is an active waitlist queue for this slot, we keep the reservation in its previous status
        // and rely on the waitlist promotion flow.
        if (slotId) {
          const meta = isRecord((existing as any).meta) ? ((existing as any).meta as Record<string, unknown>) : null;
          const isFromWaitlist = (existing as any).is_from_waitlist === true || (meta ? meta.is_from_waitlist === true : false);

          if (isFromWaitlist) {
            canConfirm = false;
            blockReason = "waitlist_origin";
          } else {
            const { data: activeWait } = await supabase
              .from("waitlist_entries")
              .select("id")
              .eq("slot_id", slotId)
              .in("status", ACTIVE_WAITLIST_ENTRY_STATUSES as unknown as string[])
              .neq("reservation_id", existing.id)
              .limit(1)
              .maybeSingle();

            if ((activeWait as any)?.id) {
              canConfirm = false;
              blockReason = "waitlist_priority";
            }
          }
        }

        if (canConfirm && establishmentId && slotId) {
          const { data: slot } = await supabase
            .from("pro_slots")
            .select("id,capacity")
            .eq("id", slotId)
            .eq("establishment_id", establishmentId)
            .maybeSingle();

          const cap =
            slot && typeof (slot as any).capacity === "number" && Number.isFinite((slot as any).capacity)
              ? Math.max(0, Math.round((slot as any).capacity))
              : null;

          if (cap != null) {
            const { data: usedRows } = await supabase
              .from("reservations")
              .select("party_size")
              .eq("establishment_id", establishmentId)
              .eq("slot_id", slotId)
              .neq("id", existing.id)
              .in("status", ["confirmed", "pending_pro_validation", "requested"])
              .limit(5000);

            const used = (usedRows ?? []).reduce((acc, row) => {
              const n = typeof (row as any).party_size === "number" && Number.isFinite((row as any).party_size) ? Math.max(0, Math.round((row as any).party_size)) : 0;
              return acc + n;
            }, 0);

            const remaining = Math.max(0, cap - used);
            if (remaining < partySize) {
              canConfirm = false;
              blockReason = "capacity_insufficient";
            }
          }
        }

        if (canConfirm) {
          const nowIso = new Date().toISOString();
          await supabase
            .from("reservations")
            .update({ status: "confirmed", updated_at: nowIso })
            .eq("id", existing.id)
            .neq("status", "confirmed");

          await supabase.from("system_logs").insert({
            actor_user_id: null,
            actor_role: "system:payments_webhook",
            action: "reservation.auto_confirm",
            entity_type: "reservation",
            entity_id: existing.id,
            payload: {
              booking_reference: asString((existing as any).booking_reference) ?? null,
              previous_status: statusPrev,
              new_status: "confirmed",
              reason: "payment_validated",
            },
          });
        } else {
          await supabase.from("system_logs").insert({
            actor_user_id: null,
            actor_role: "system:payments_webhook",
            action: "reservation.auto_confirm_failed",
            entity_type: "reservation",
            entity_id: existing.id,
            payload: {
              booking_reference: asString((existing as any).booking_reference) ?? null,
              previous_status: statusPrev,
              reason: blockReason ?? "blocked",
            },
          });
        }
      }
    }
  } catch {
    // ignore
  }

  // Best-effort notifications (do not block the webhook).
  try {
    const br = asString(existing.booking_reference) || asString(existing.id);
    const starts = asString((existing as any).starts_at);
    const when = starts ? formatLeJjMmAaAHeure(starts) : "";

    const total = typeof patch.amount_total === "number" ? patch.amount_total : (existing as any).amount_total;
    const currency = (typeof patch.currency === "string" ? patch.currency : asString((existing as any).currency)) || "MAD";

    const totalLabel = typeof total === "number" && Number.isFinite(total) ? `${Math.round(total / 100)} ${currency}` : "";

    const { proCategory, proTitle, proBody, proAction, adminType, canonical } = (() => {
      if (nextPaymentStatus === "paid") {
        return {
          proCategory: "billing",
          proTitle: "Paiement reçu",
          proBody: `Réservation ${br}${when ? ` · ${when}` : ""}${totalLabel ? ` · ${totalLabel}` : ""}`,
          proAction: "payment_received",
          adminType: "payment_received",
          canonical: NotificationEventType.payment_succeeded,
        };
      }

      if (nextPaymentStatus === "refunded") {
        return {
          proCategory: "billing",
          proTitle: "Paiement remboursé",
          proBody: `Réservation ${br}${when ? ` · ${when}` : ""}${totalLabel ? ` · ${totalLabel}` : ""}`,
          proAction: "payment_refunded",
          adminType: "payment_refunded",
          canonical: NotificationEventType.refund_done,
        };
      }

      return {
        proCategory: "billing",
        proTitle: "Paiement en attente",
        proBody: `Réservation ${br}${when ? ` · ${when}` : ""}${totalLabel ? ` · ${totalLabel}` : ""}`,
        proAction: "payment_pending",
        adminType: "payment_pending",
        canonical: NotificationEventType.payment_failed,
      };
    })();

    const establishmentId = asString(existing.establishment_id);

    if (establishmentId) {
      await notifyProMembers({
        supabase,
        establishmentId,
        category: proCategory,
        title: proTitle,
        body: proBody,
        data: {
          reservationId: asString(existing.id),
          establishmentId,
          action: proAction,
          event_type: canonical,
          source: "payments_webhook",
          transaction_id: transactionId || undefined,
        },
      });

      await emitAdminNotification({
        type: adminType,
        title: proTitle,
        body: proBody,
        data: {
          reservationId: asString(existing.id),
          establishmentId,
          bookingReference: br,
          paymentStatus: nextPaymentStatus,
          event_type: canonical,
          source: "payments_webhook",
          transaction_id: transactionId || undefined,
        },
      });

      const consumerUserId = asString((existing as any).user_id);
      if (consumerUserId) {
        await emitConsumerUserEvent({
          supabase,
          userId: consumerUserId,
          eventType: canonical,
          metadata: {
            reservationId: asString(existing.id),
            bookingReference: br,
            paymentStatus: nextPaymentStatus,
            establishmentId,
            transaction_id: transactionId || undefined,
          },
        });
      }
    }
  } catch {
    // ignore
  }

  // Emails transactionnels (best-effort)
  if (nextPaymentStatus === "paid" && prevPaymentStatus !== "paid") {
    void (async () => {
      try {
        const baseUrl = getPublicBaseUrl();

        const reservationId = asString(existing.id);
        const establishmentId = asString((existing as any).establishment_id);
        const consumerUserId = asString((existing as any).user_id);

        const bookingReference = asString((existing as any).booking_reference) || reservationId;
        const startsAt = asString((existing as any).starts_at);
        const whenLabel = startsAt ? formatLeJjMmAaAHeure(startsAt) : "";

        const total = typeof patch.amount_total === "number" ? patch.amount_total : (existing as any).amount_total;
        const currency = (typeof patch.currency === "string" ? patch.currency : asString((existing as any).currency)) || "MAD";
        const amountLabel = typeof total === "number" && Number.isFinite(total) ? `${Math.round(total / 100)} ${currency}` : "";

        const establishmentName = establishmentId ? await getEstablishmentName({ supabase, establishmentId }) : "";

        const consumerCtaUrl = `${baseUrl}/profile/bookings/${encodeURIComponent(reservationId)}`;

        if (consumerUserId) {
          const { email: consumerEmail, fullName: consumerName } = await getConsumerEmailAndName({ supabase, userId: consumerUserId });

          if (consumerEmail) {
            await sendTemplateEmail({
              templateKey: "finance_payment_confirmation",
              lang: "fr",
              fromKey: "finance",
              to: [consumerEmail],
              variables: {
                user_name: consumerName || "",
                booking_ref: bookingReference,
                amount: amountLabel,
                date: whenLabel,
                establishment: establishmentName,
                cta_url: consumerCtaUrl,
              },
              ctaUrl: consumerCtaUrl,
              meta: {
                source: "payments.webhook.reservation",
                reservation_id: reservationId,
                establishment_id: establishmentId,
                payment_status: nextPaymentStatus,
              },
            });
          }
        }

        if (establishmentId) {
          const proEmails = await getProMemberEmailsForEstablishment({ supabase, establishmentId });
          if (proEmails.length) {
            const proCtaUrl = `${baseUrl}/pro?tab=reservations&eid=${encodeURIComponent(establishmentId)}&rid=${encodeURIComponent(reservationId)}`;

            await sendTemplateEmail({
              templateKey: "pro_payment_received",
              lang: "fr",
              fromKey: "finance",
              to: proEmails.slice(0, 50),
              variables: {
                booking_ref: bookingReference,
                amount: amountLabel,
                date: whenLabel,
                establishment: establishmentName,
                cta_url: proCtaUrl,
              },
              ctaUrl: proCtaUrl,
              meta: {
                source: "payments.webhook.reservation",
                reservation_id: reservationId,
                establishment_id: establishmentId,
                payment_status: nextPaymentStatus,
              },
            });
          }
        }
      } catch {
        // ignore
      }
    })();
  }

  const actor = buildActor(event);

  try {
    if (nextPaymentStatus === "paid") {
      await ensureEscrowHoldForReservation({ reservationId: existing.id, actor });

      const invKey = eventId
        ? `invoice:reservation:${String(existing.id)}:${eventId}`
        : transactionId
          ? `invoice:reservation:${String(existing.id)}:${transactionId}`
          : null;

      await ensureInvoiceForReservation({
        reservationId: existing.id,
        actor,
        idempotencyKey: invKey,
        issuedAtIso: event.paid_at ?? null,
      });
    }

    if (nextPaymentStatus === "refunded") {
      await settleEscrowForReservation({ reservationId: existing.id, actor, reason: "cancel" });
    }
  } catch (e) {
    // Non-blocking: webhook provider can retry, and reconciliation can repair.
    const msg = e instanceof Error ? e.message : String(e ?? "");
    return res.status(202).json({ ok: true, status: "OK", warning: msg });
  }

  // Some providers expect a stable OK marker in the response body.
  return res.json({ ok: true, status: "OK" });
}
