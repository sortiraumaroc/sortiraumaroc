import { getAdminSupabase } from "../supabaseAdmin";

import { isUniqueViolation } from "./errors";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("financeInvoices");
import type { FinanceActor } from "./types";

export type FinanceInvoice = {
  id: string;
  invoice_seq: number;
  invoice_number: string;
  issued_at: string;
  reference_type: string;
  reference_id: string;
  idempotency_key: string | null;
  payer_user_id: string | null;
  establishment_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  snapshot: unknown;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeIsoOrNull(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  const ts = Date.parse(s);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function safeCurrency(value: unknown): string {
  const c = asString(value).toUpperCase();
  return c || "MAD";
}

function safeInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return 0;
}

async function createInvoiceRow(args: {
  referenceType: string;
  referenceId: string;
  idempotencyKey?: string | null;
  payerUserId?: string | null;
  establishmentId?: string | null;
  issuedAtIso?: string | null;
  amountCents: number;
  currency: string;
  status?: string;
  snapshot: unknown;
}): Promise<FinanceInvoice> {
  const supabase = getAdminSupabase();

  const payload: Record<string, unknown> = {
    reference_type: args.referenceType,
    reference_id: args.referenceId,
    idempotency_key: args.idempotencyKey ?? null,
    payer_user_id: args.payerUserId ?? null,
    establishment_id: args.establishmentId ?? null,
    issued_at: args.issuedAtIso ?? null,
    amount_cents: Math.max(0, Math.round(args.amountCents)),
    currency: safeCurrency(args.currency),
    status: args.status ?? "issued",
    snapshot: args.snapshot ?? {},
  };

  const selectCols =
    "id,invoice_seq,invoice_number,issued_at,reference_type,reference_id,idempotency_key,payer_user_id,establishment_id,amount_cents,currency,status,snapshot,pdf_url,created_at,updated_at";

  const { data, error } = await supabase.from("finance_invoices").insert(payload).select(selectCols).single();

  if (!error) return data as unknown as FinanceInvoice;

  if (isUniqueViolation(error)) {
    // Prefer looking up by idempotency key (when present), otherwise by reference.
    if (args.idempotencyKey) {
      const { data: existingByKey, error: selErr } = await supabase
        .from("finance_invoices")
        .select(selectCols)
        .eq("idempotency_key", args.idempotencyKey)
        .maybeSingle();

      if (selErr) throw selErr;
      if (existingByKey) return existingByKey as unknown as FinanceInvoice;
    }

    const { data: existingByRef, error: selErr } = await supabase
      .from("finance_invoices")
      .select(selectCols)
      .eq("reference_type", args.referenceType)
      .eq("reference_id", args.referenceId)
      .maybeSingle();

    if (selErr) throw selErr;
    if (existingByRef) return existingByRef as unknown as FinanceInvoice;
  }

  throw error;
}

export async function ensureInvoiceForReservation(args: {
  reservationId: string;
  actor: FinanceActor;
  idempotencyKey?: string | null;
  issuedAtIso?: string | null;
}): Promise<FinanceInvoice | null> {
  const supabase = getAdminSupabase();

  const { data: reservation, error } = await supabase
    .from("reservations")
    .select(
      "id,booking_reference,establishment_id,user_id,starts_at,party_size,amount_deposit,amount_total,currency,payment_status,meta,created_at,updated_at,establishments(id,name,city,address)",
    )
    .eq("id", args.reservationId)
    .maybeSingle();

  if (error) throw error;
  if (!reservation) return null;

  const paymentStatus = asString((reservation as any).payment_status).toLowerCase();
  if (paymentStatus !== "paid" && paymentStatus !== "refunded") return null;

  const depositCents = safeInt((reservation as any).amount_deposit);
  const totalCents = safeInt((reservation as any).amount_total);
  const amountCents = depositCents > 0 ? depositCents : totalCents;
  if (amountCents <= 0) return null;

  const currency = safeCurrency((reservation as any).currency);

  const meta = isRecord((reservation as any).meta) ? ((reservation as any).meta as Record<string, unknown>) : {};
  const issuedAtIso = args.issuedAtIso ?? safeIsoOrNull(meta.paid_at) ?? null;

  const bookingReference = asString((reservation as any).booking_reference) || asString((reservation as any).id);

  const establishmentId = asString((reservation as any).establishment_id) || null;
  const userId = asString((reservation as any).user_id) || null;

  const snapshot = {
    kind: "reservation_deposit",
    generated_at: new Date().toISOString(),
    actor: { user_id: args.actor.userId ?? null, role: args.actor.role ?? null },
    reservation: {
      id: asString((reservation as any).id),
      booking_reference: bookingReference,
      starts_at: (reservation as any).starts_at ?? null,
      party_size: (reservation as any).party_size ?? null,
      amount_deposit_cents: depositCents,
      amount_total_cents: totalCents,
      currency,
      payment_status: paymentStatus,
      meta,
      created_at: (reservation as any).created_at ?? null,
      updated_at: (reservation as any).updated_at ?? null,
    },
    establishment: (reservation as any).establishments ?? null,
    payment: {
      invoice_amount_cents: amountCents,
      currency,
      transaction_id: typeof meta.payment_transaction_id === "string" ? meta.payment_transaction_id : null,
    },
  };

  return await createInvoiceRow({
    referenceType: "reservation",
    referenceId: asString((reservation as any).id),
    idempotencyKey: args.idempotencyKey ?? null,
    payerUserId: userId,
    establishmentId,
    issuedAtIso,
    amountCents,
    currency,
    snapshot,
  });
}

export async function ensureInvoiceForPackPurchase(args: {
  purchaseId: string;
  actor: FinanceActor;
  idempotencyKey?: string | null;
  issuedAtIso?: string | null;
}): Promise<FinanceInvoice | null> {
  const supabase = getAdminSupabase();

  const { data: purchase, error } = await supabase
    .from("pack_purchases")
    .select("id,establishment_id,pack_id,buyer_name,buyer_email,quantity,unit_price,total_price,currency,payment_status,status,valid_until,meta,created_at,updated_at")
    .eq("id", args.purchaseId)
    .maybeSingle();

  if (error) throw error;
  if (!purchase) return null;

  const paymentStatus = asString((purchase as any).payment_status).toLowerCase();
  if (paymentStatus !== "paid" && paymentStatus !== "refunded") return null;

  const amountCents = safeInt((purchase as any).total_price);
  if (amountCents <= 0) return null;

  const currency = safeCurrency((purchase as any).currency);

  const meta = isRecord((purchase as any).meta) ? ((purchase as any).meta as Record<string, unknown>) : {};
  const buyerUserId = typeof meta.buyer_user_id === "string" ? meta.buyer_user_id : null;

  const issuedAtIso = args.issuedAtIso ?? safeIsoOrNull(meta.paid_at) ?? null;

  let establishment: Record<string, unknown> | null = null;
  let pack: Record<string, unknown> | null = null;

  try {
    const establishmentId = asString((purchase as any).establishment_id);
    const packId = asString((purchase as any).pack_id);

    const [estRes, packRes] = await Promise.all([
      establishmentId ? supabase.from("establishments").select("id,name,universe").eq("id", establishmentId).maybeSingle() : Promise.resolve({ data: null } as any),
      packId ? supabase.from("packs").select("id,title").eq("id", packId).maybeSingle() : Promise.resolve({ data: null } as any),
    ]);

    establishment = (estRes as any).data ?? null;
    pack = (packRes as any).data ?? null;
  } catch (err) {
    log.warn({ err }, "Failed to fetch establishment/pack for invoice snapshot");
    establishment = null;
    pack = null;
  }

  const snapshot = {
    kind: "pack_purchase",
    generated_at: new Date().toISOString(),
    actor: { user_id: args.actor.userId ?? null, role: args.actor.role ?? null },
    purchase: {
      id: asString((purchase as any).id),
      establishment_id: asString((purchase as any).establishment_id) || null,
      pack_id: asString((purchase as any).pack_id) || null,
      buyer_name: (purchase as any).buyer_name ?? null,
      buyer_email: (purchase as any).buyer_email ?? null,
      quantity: (purchase as any).quantity ?? null,
      unit_price_cents: safeInt((purchase as any).unit_price),
      total_price_cents: amountCents,
      currency,
      payment_status: paymentStatus,
      status: (purchase as any).status ?? null,
      valid_until: (purchase as any).valid_until ?? null,
      meta,
      created_at: (purchase as any).created_at ?? null,
      updated_at: (purchase as any).updated_at ?? null,
    },
    establishment,
    pack,
    payment: {
      invoice_amount_cents: amountCents,
      currency,
      transaction_id: typeof meta.payment_transaction_id === "string" ? meta.payment_transaction_id : null,
      purchase_reference: typeof meta.purchase_reference === "string" ? meta.purchase_reference : null,
    },
  };

  return await createInvoiceRow({
    referenceType: "pack_purchase",
    referenceId: asString((purchase as any).id),
    idempotencyKey: args.idempotencyKey ?? null,
    payerUserId: buyerUserId,
    establishmentId: asString((purchase as any).establishment_id) || null,
    issuedAtIso,
    amountCents,
    currency,
    snapshot,
  });
}

export async function ensureInvoiceForVisibilityOrder(args: {
  orderId: string;
  actor: FinanceActor;
  idempotencyKey?: string | null;
  issuedAtIso?: string | null;
}): Promise<FinanceInvoice | null> {
  const supabase = getAdminSupabase();

  const { data: order, error } = await supabase
    .from("visibility_orders")
    .select("id,establishment_id,created_by_user_id,payment_status,status,currency,subtotal_cents,tax_cents,total_cents,paid_at,meta,created_at,updated_at")
    .eq("id", args.orderId)
    .maybeSingle();

  if (error) throw error;
  if (!order) return null;

  const paymentStatus = asString((order as any).payment_status).toLowerCase();
  if (paymentStatus !== "paid" && paymentStatus !== "refunded") return null;

  const amountCents = safeInt((order as any).total_cents);
  if (amountCents <= 0) return null;

  const currency = safeCurrency((order as any).currency);
  const establishmentId = asString((order as any).establishment_id) || null;

  const meta = isRecord((order as any).meta) ? ((order as any).meta as Record<string, unknown>) : {};

  const payerUserId = asString((order as any).created_by_user_id) || (typeof meta.buyer_user_id === "string" ? meta.buyer_user_id : null);

  const issuedAtIso =
    args.issuedAtIso ??
    safeIsoOrNull((order as any).paid_at) ??
    safeIsoOrNull(meta.paid_at) ??
    safeIsoOrNull((order as any).created_at) ??
    null;

  let establishment: Record<string, unknown> | null = null;
  try {
    if (establishmentId) {
      const { data } = await supabase.from("establishments").select("id,name,city,address").eq("id", establishmentId).maybeSingle();
      establishment = (data as any) ?? null;
    }
  } catch (err) {
    log.warn({ err }, "Failed to fetch establishment for visibility order invoice");
    establishment = null;
  }

  let items: Array<Record<string, unknown>> = [];
  try {
    const { data, error: itemsErr } = await supabase
      .from("visibility_order_items")
      .select(
        "id,offer_id,title,description,type,deliverables,duration_days,quantity,unit_price_cents,total_price_cents,currency,tax_rate_bps,tax_label,created_at",
      )
      .eq("order_id", asString((order as any).id))
      .order("created_at", { ascending: true })
      .limit(500);
    if (itemsErr) throw itemsErr;
    items = (data ?? []) as Array<Record<string, unknown>>;
  } catch (err) {
    log.warn({ err }, "Failed to fetch visibility order items for invoice");
    items = [];
  }

  const snapshot = {
    kind: "visibility_order",
    generated_at: new Date().toISOString(),
    actor: { user_id: args.actor.userId ?? null, role: args.actor.role ?? null },
    order: {
      ...(order as Record<string, unknown>),
      currency,
      payment_status: paymentStatus,
    },
    items,
    establishment,
    payment: {
      invoice_amount_cents: amountCents,
      currency,
      transaction_id: typeof meta.payment_transaction_id === "string" ? meta.payment_transaction_id : null,
    },
  };

  return await createInvoiceRow({
    referenceType: "visibility_order",
    referenceId: asString((order as any).id),
    idempotencyKey: args.idempotencyKey ?? null,
    payerUserId,
    establishmentId,
    issuedAtIso,
    amountCents,
    currency,
    snapshot,
  });
}

export async function ensureInvoiceForProInvoice(args: {
  proInvoiceId: string;
  actor: FinanceActor;
  idempotencyKey?: string | null;
  issuedAtIso?: string | null;
}): Promise<FinanceInvoice | null> {
  const supabase = getAdminSupabase();

  const { data: proInvoice, error } = await supabase
    .from("pro_invoices")
    .select("id,establishment_id,period_start,period_end,currency,commission_total,visibility_total,amount_due,status,due_date,paid_at,line_items,created_at,updated_at")
    .eq("id", args.proInvoiceId)
    .maybeSingle();

  if (error) throw error;
  if (!proInvoice) return null;

  const amountCents = safeInt((proInvoice as any).amount_due);
  if (amountCents <= 0) return null;

  const currency = safeCurrency((proInvoice as any).currency);
  const establishmentId = asString((proInvoice as any).establishment_id) || null;

  let establishment: Record<string, unknown> | null = null;
  try {
    if (establishmentId) {
      const { data } = await supabase.from("establishments").select("id,name").eq("id", establishmentId).maybeSingle();
      establishment = (data as any) ?? null;
    }
  } catch (err) {
    log.warn({ err }, "Failed to fetch establishment for pro invoice");
    establishment = null;
  }

  const issuedAtIso = args.issuedAtIso ?? safeIsoOrNull((proInvoice as any).paid_at) ?? safeIsoOrNull((proInvoice as any).created_at) ?? null;

  const snapshot = {
    kind: "pro_invoice",
    generated_at: new Date().toISOString(),
    actor: { user_id: args.actor.userId ?? null, role: args.actor.role ?? null },
    pro_invoice: {
      ...(proInvoice as Record<string, unknown>),
      currency,
    },
    establishment,
    payment: {
      invoice_amount_cents: amountCents,
      currency,
    },
  };

  return await createInvoiceRow({
    referenceType: "pro_invoice",
    referenceId: asString((proInvoice as any).id),
    idempotencyKey: args.idempotencyKey ?? null,
    payerUserId: null,
    establishmentId,
    issuedAtIso,
    amountCents,
    currency,
    snapshot,
  });
}
