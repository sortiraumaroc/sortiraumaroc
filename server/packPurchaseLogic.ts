/**
 * Pack Purchase Logic (Phase 3.2 + 3.4)
 *
 * Handles:
 *  - Pack purchase flow (verifications, promo code, payment confirmation)
 *  - Promo code validation (pack-specific promo codes)
 *  - Commission calculation (3-tier: custom > category > default)
 *  - Transaction creation in unified ledger
 *  - VosFactures receipt generation
 *  - Notifications (email + SMS + in-app)
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { notifyProMembers } from "./proNotifications";
import { sendTemplateEmail } from "./emailService";
import { checkAndMarkSoldOut } from "./packLifecycleLogic";
import { generatePackSaleReceipt } from "./vosfactures/documents";
import {
  getBillingPeriodCode,
} from "../shared/packsBillingTypes";

// =============================================================================
// Types
// =============================================================================

type OpResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; errorCode?: string };

export interface PurchasePackInput {
  userId: string;
  packId: string;
  quantity: number;
  promoCode?: string | null;
  paymentMethod: "card" | "wallet" | "mobile_payment";
  paymentReference?: string | null;
}

export interface PurchaseResult {
  purchaseId: string;
  totalPriceCents: number;
  discountCents: number;
  commissionCents: number;
  qrCodeToken: string;
}

export interface PromoValidationResult {
  valid: boolean;
  promoCodeId?: string;
  discountType?: "percentage" | "fixed_amount";
  discountValue?: number;
  discountCents?: number;
  isPlatformCode?: boolean;
  error?: string;
}

// =============================================================================
// 1. Validate Promo Code
// =============================================================================

export async function validatePackPromoCode(
  code: string,
  packId: string,
  userId: string,
  packPriceCents: number,
  establishmentId: string,
): Promise<PromoValidationResult> {
  const supabase = getAdminSupabase();

  const { data: promo, error } = await supabase
    .from("pack_promo_codes")
    .select("*")
    .ilike("code", code.toUpperCase())
    .eq("is_active", true)
    .maybeSingle();

  if (error || !promo) {
    return { valid: false, error: "Code promo invalide ou inactif." };
  }

  const p = promo as any;
  const now = new Date();

  // Check dates
  if (p.start_date && new Date(p.start_date) > now) {
    return { valid: false, error: "Ce code promo n'est pas encore actif." };
  }
  if (p.end_date && new Date(p.end_date) < now) {
    return { valid: false, error: "Ce code promo a expire." };
  }

  // Check scope
  if (p.applies_to === "specific_pack" && p.specific_pack_id !== packId) {
    return { valid: false, error: "Ce code promo n'est pas applicable a ce Pack." };
  }
  if (p.applies_to === "all_establishment_packs" && p.establishment_id !== establishmentId) {
    return { valid: false, error: "Ce code promo n'est pas applicable a cet etablissement." };
  }

  // Check global usage limit
  if (p.max_total_uses !== null && p.current_uses >= p.max_total_uses) {
    return { valid: false, error: "Ce code promo a atteint sa limite d'utilisation." };
  }

  // Check per-user limit
  if (p.max_uses_per_user > 0) {
    const { count } = await supabase
      .from("pack_purchases")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("promo_code_id", p.id);

    if ((count ?? 0) >= p.max_uses_per_user) {
      return { valid: false, error: "Vous avez deja utilise ce code promo." };
    }
  }

  // Calculate discount
  let discountCents = 0;
  if (p.discount_type === "percentage") {
    // discount_value is in basis points (e.g., 1000 = 10%)
    discountCents = Math.round((packPriceCents * p.discount_value) / 10000);
  } else {
    // fixed_amount — discount_value is in centimes
    discountCents = Math.min(p.discount_value, packPriceCents);
  }

  return {
    valid: true,
    promoCodeId: p.id,
    discountType: p.discount_type,
    discountValue: p.discount_value,
    discountCents,
    isPlatformCode: p.is_platform_code === true,
  };
}

// =============================================================================
// 2. Calculate Commission (3-tier hierarchy using SQL function)
// =============================================================================

async function calculateCommission(
  establishmentId: string,
  amountCents: number,
  category?: string | null,
): Promise<{ rate: number; amountCents: number }> {
  const supabase = getAdminSupabase();

  // Use the SQL function get_commission_rate
  const { data, error } = await supabase.rpc("get_commission_rate", {
    p_establishment_id: establishmentId,
    p_commission_type: "pack_sale",
    p_category: category ?? null,
  });

  if (error) {
    console.error("[Commission] RPC error, using default 15%:", error.message);
    const defaultRate = 15;
    return {
      rate: defaultRate,
      amountCents: Math.round((amountCents * defaultRate) / 100),
    };
  }

  const rate = typeof data === "number" ? data : 15;
  return {
    rate,
    amountCents: Math.round((amountCents * rate) / 100),
  };
}

// =============================================================================
// 3. Confirm Pack Purchase (after payment confirmation)
// =============================================================================

/**
 * Called after payment is confirmed (webhook or immediate).
 * Creates the purchase, transaction, receipt, and notifications.
 */
export async function confirmPackPurchase(
  input: PurchasePackInput,
): Promise<OpResult<PurchaseResult>> {
  const supabase = getAdminSupabase();

  // ── Step 1: Fetch pack and validate ─────────────────────────
  const { data: pack, error: packErr } = await supabase
    .from("packs")
    .select("id, title, price, original_price, establishment_id, stock, sold_count, is_limited, limit_per_client, moderation_status, is_multi_use, total_uses, validity_end_date, category, cover_url")
    .eq("id", input.packId)
    .maybeSingle();

  if (packErr) return { ok: false, error: packErr.message };
  if (!pack) return { ok: false, error: "Pack introuvable.", errorCode: "not_found" };

  const p = pack as any;

  if (p.moderation_status !== "active") {
    return { ok: false, error: "Ce Pack n'est pas en vente.", errorCode: "not_active" };
  }

  // ── Step 2: Check stock ─────────────────────────────────────
  if (p.is_limited && p.stock != null) {
    const remaining = p.stock - p.sold_count;
    if (remaining < input.quantity) {
      return { ok: false, error: `Stock insuffisant (${remaining} restant(s)).`, errorCode: "out_of_stock" };
    }
  }

  // ── Step 2b: Anti-fraud — check duplicate purchase (Phase 7) ──
  // Prevent the same user from purchasing the same pack twice within 2 minutes
  // (protects against double-click, network retry, or scripted attacks)
  {
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from("pack_purchases")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("pack_id", input.packId)
      .eq("payment_status", "completed")
      .gte("created_at", twoMinAgo);

    if ((recentCount ?? 0) > 0) {
      return {
        ok: false,
        error: "Un achat identique a été effectué il y a moins de 2 minutes. Vérifiez vos achats.",
        errorCode: "duplicate_purchase",
      };
    }
  }

  // ── Step 2c: Anti-fraud — verify email confirmed (Phase 7) ──
  {
    const { data: authUser } = await supabase.auth.admin.getUserById(input.userId);
    if (!authUser?.user?.email_confirmed_at) {
      return {
        ok: false,
        error: "Veuillez confirmer votre adresse email avant d'acheter un Pack.",
        errorCode: "email_not_verified",
      };
    }
  }

  // ── Step 3: Check per-client limit ──────────────────────────
  if (p.limit_per_client > 0) {
    const { count } = await supabase
      .from("pack_purchases")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("pack_id", input.packId)
      .in("payment_status", ["completed", "paid"]);

    if ((count ?? 0) + input.quantity > p.limit_per_client) {
      return {
        ok: false,
        error: `Limite de ${p.limit_per_client} Pack(s) par client atteinte.`,
        errorCode: "limit_reached",
      };
    }
  }

  // ── Step 4: Validate promo code (if any) ────────────────────
  let promoResult: PromoValidationResult | null = null;
  let discountCents = 0;
  let promoCodeId: string | null = null;
  let isPlatformCode = false;

  if (input.promoCode) {
    promoResult = await validatePackPromoCode(
      input.promoCode,
      input.packId,
      input.userId,
      p.price * input.quantity,
      p.establishment_id,
    );

    if (!promoResult.valid) {
      return { ok: false, error: promoResult.error || "Code promo invalide.", errorCode: "promo_invalid" };
    }

    discountCents = promoResult.discountCents ?? 0;
    promoCodeId = promoResult.promoCodeId ?? null;
    isPlatformCode = promoResult.isPlatformCode ?? false;
  }

  // ── Step 5: Calculate final price ───────────────────────────
  const grossCents = p.price * input.quantity;
  const totalPriceCents = Math.max(0, grossCents - discountCents);

  // ── Step 6: Calculate commission ────────────────────────────
  // Platform promo: commission on FULL price (before discount)
  // Pro promo: commission on PAID price (after discount)
  const commissionBase = isPlatformCode ? grossCents : totalPriceCents;
  const commission = await calculateCommission(
    p.establishment_id,
    commissionBase,
    p.category,
  );

  // ── Step 7: Generate QR code token ──────────────────────────
  const qrCodeToken = crypto.randomUUID();

  // ── Step 8: Fetch buyer info ────────────────────────────────
  const { data: authUser } = await supabase.auth.admin.getUserById(input.userId);
  const buyerName = authUser?.user?.user_metadata?.full_name ||
    authUser?.user?.user_metadata?.name ||
    authUser?.user?.email ||
    "Client sam.ma";
  const buyerEmail = authUser?.user?.email || "";

  // ── Step 9: Create pack purchase ────────────────────────────
  const now = new Date();
  const purchasePayload: Record<string, unknown> = {
    pack_id: input.packId,
    user_id: input.userId,
    establishment_id: p.establishment_id,
    buyer_name: buyerName,
    buyer_email: buyerEmail,
    quantity: input.quantity,
    unit_price: Math.round(totalPriceCents / Math.max(input.quantity, 1)),
    total_price: totalPriceCents,
    currency: "MAD",
    promo_code_id: promoCodeId,
    promo_discount_amount: discountCents,
    payment_method: input.paymentMethod,
    payment_reference: input.paymentReference ?? null,
    payment_status: "completed",
    paid_at: now.toISOString(),
    qr_code_token: qrCodeToken,
    status: "active", // V1 compat
    is_multi_use: p.is_multi_use,
    uses_remaining: p.is_multi_use ? p.total_uses : 1,
    uses_total: p.is_multi_use ? p.total_uses : 1,
    expires_at: p.validity_end_date ? new Date(p.validity_end_date + "T23:59:59Z").toISOString() : null,
    meta: {
      buyer_user_id: input.userId,
      pack_title: p.title,
      pack_price_cents: p.price,
      promo_code: input.promoCode ?? null,
      is_platform_promo: isPlatformCode,
      discount_cents: discountCents,
    },
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const { data: purchase, error: purchaseErr } = await supabase
    .from("pack_purchases")
    .insert(purchasePayload)
    .select("id")
    .single();

  if (purchaseErr) {
    return { ok: false, error: purchaseErr.message, errorCode: "db_error" };
  }

  const purchaseId = (purchase as any).id as string;

  // ── Step 10: Increment sold_count ───────────────────────────
  await supabase.rpc("increment_field", {
    table_name: "packs",
    field_name: "sold_count",
    row_id: input.packId,
    increment_by: input.quantity,
  }).then(
    () => {},
    // Fallback: manual increment
    async () => {
      await supabase
        .from("packs")
        .update({ sold_count: p.sold_count + input.quantity, updated_at: now.toISOString() })
        .eq("id", input.packId);
    },
  );

  // ── Step 11: Increment promo code usage ─────────────────────
  if (promoCodeId) {
    void (async () => {
      try {
        const { data: promoData } = await supabase
          .from("pack_promo_codes")
          .select("current_uses")
          .eq("id", promoCodeId)
          .maybeSingle();
        if (promoData) {
          await supabase
            .from("pack_promo_codes")
            .update({ current_uses: (promoData as any).current_uses + 1, updated_at: now.toISOString() })
            .eq("id", promoCodeId);
        }
      } catch { /* best-effort */ }
    })();
  }

  // ── Step 12: Create unified transaction ─────────────────────
  const billingPeriod = getBillingPeriodCode(now);
  const netAmount = totalPriceCents - commission.amountCents;

  void (async () => {
    try {
      await supabase.from("transactions").insert({
        establishment_id: p.establishment_id,
        user_id: input.userId,
        type: "pack_sale",
        reference_type: "pack_purchase",
        reference_id: purchaseId,
        gross_amount: totalPriceCents,
        commission_rate: commission.rate,
        commission_amount: commission.amountCents,
        net_amount: netAmount,
        promo_discount_amount: discountCents,
        promo_absorbed_by: isPlatformCode ? "platform" : discountCents > 0 ? "pro" : null,
        payment_method: input.paymentMethod,
        payment_reference: input.paymentReference ?? null,
        status: "completed",
        billing_period: billingPeriod,
      });
    } catch (err) {
      console.error("[PackPurchase] Failed to create transaction:", err);
    }
  })();

  // ── Step 13: Check sold out ─────────────────────────────────
  void checkAndMarkSoldOut(input.packId);

  // ── Step 14: Generate VosFactures receipt ────────────────────
  void (async () => {
    try {
      // Fetch establishment name
      const { data: estab } = await supabase
        .from("establishments")
        .select("name")
        .eq("id", p.establishment_id)
        .maybeSingle();

      await generatePackSaleReceipt({
        purchaseId,
        packTitle: p.title,
        establishmentName: (estab as any)?.name || "Etablissement",
        buyerName,
        buyerEmail,
        totalPriceCents,
        promoDiscountCents: discountCents > 0 ? discountCents : undefined,
        quantity: input.quantity,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference ?? undefined,
      });
    } catch (err) {
      console.error("[PackPurchase] VosFactures receipt failed:", err);
    }
  })();

  // ── Step 15: Notifications ──────────────────────────────────

  // Email + notification to pro
  void (async () => {
    try {
      await notifyProMembers({
        supabase,
        establishmentId: p.establishment_id,
        category: "pack_sale",
        title: "Nouveau Pack vendu !",
        body: `Le Pack "${p.title}" vient d'etre vendu a ${buyerName}. Montant: ${(totalPriceCents / 100).toFixed(2)} MAD.`,
        data: { pack_id: input.packId, purchase_id: purchaseId, amount_cents: totalPriceCents },
      });
    } catch { /* best-effort */ }
  })();

  // Email to client
  void (async () => {
    try {
      if (buyerEmail) {
        await sendTemplateEmail({
          templateKey: "pack_purchase_confirmation",
          lang: "fr",
          fromKey: "noreply",
          to: [buyerEmail],
          variables: {
            buyer_name: buyerName,
            pack_title: p.title,
            amount: (totalPriceCents / 100).toFixed(2),
            currency: "MAD",
            validity_date: p.validity_end_date || "illimitee",
          },
          meta: { type: "pack_purchase", purchase_id: purchaseId },
        });
      }
    } catch { /* best-effort */ }
  })();

  return {
    ok: true,
    data: {
      purchaseId,
      totalPriceCents,
      discountCents,
      commissionCents: commission.amountCents,
      qrCodeToken,
    },
  };
}
