import { getAdminSupabase } from "../supabaseAdmin";

function safeNumber(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export type CommissionSnapshot = {
  commission_percent: number | null;
  commission_amount: number | null;
  source: "establishment_override" | "category" | "finance_rules" | "none";
};

export async function computeCommissionSnapshotForEstablishment(args: {
  establishmentId: string;
  depositCents: number | null;
}): Promise<CommissionSnapshot> {
  const supabase = getAdminSupabase();

  const deposit = typeof args.depositCents === "number" && Number.isFinite(args.depositCents) ? Math.max(0, Math.round(args.depositCents)) : null;

  const [estRes, overrideRes, financeRulesRes] = await Promise.all([
    supabase.from("establishments").select("id,universe,subcategory").eq("id", args.establishmentId).maybeSingle(),
    supabase
      .from("establishment_commission_overrides")
      .select("active,commission_percent,commission_amount_cents")
      .eq("establishment_id", args.establishmentId)
      .maybeSingle(),
    supabase.from("finance_rules").select("standard_commission_percent").eq("id", 1).maybeSingle(),
  ]);

  if (estRes.error) throw estRes.error;
  if (overrideRes.error) throw overrideRes.error;
  if (financeRulesRes.error) throw financeRulesRes.error;

  const est = estRes.data as any;
  const universe = typeof est?.universe === "string" ? est.universe : null;
  const subcategory = typeof est?.subcategory === "string" ? est.subcategory : null;

  const override = overrideRes.data as any;
  const overrideActive = override ? override.active !== false : false;

  // 1) Establishment override
  if (override && overrideActive) {
    const explicitAmountRaw = safeNumber(override.commission_amount_cents);
    const explicitAmount = explicitAmountRaw == null ? null : Math.max(0, Math.round(explicitAmountRaw));
    const pctRaw = safeNumber(override.commission_percent);
    const pct = pctRaw == null ? null : clamp(pctRaw, 0, 100);

    if (explicitAmount != null) {
      return {
        commission_percent: null,
        commission_amount: deposit == null ? null : Math.min(deposit, explicitAmount),
        source: "establishment_override",
      };
    }

    if (pct != null) {
      return {
        commission_percent: pct,
        commission_amount: deposit == null ? null : Math.max(0, Math.round((deposit * pct) / 100)),
        source: "establishment_override",
      };
    }
  }

  // 2) Category override (best-effort)
  if (universe) {
    const { data: catRows, error: catErr } = await supabase
      .from("admin_categories")
      .select("commission_percent,name,universe,active")
      .eq("universe", universe)
      .eq("active", true)
      .limit(50);

    if (catErr) throw catErr;

    const wanted = (subcategory ?? universe).toLowerCase();
    const match = (catRows ?? []).find((r: any) => {
      const name = typeof r?.name === "string" ? r.name.toLowerCase() : "";
      return name === wanted;
    });

    const catPctRaw = safeNumber(match?.commission_percent);
    const catPct = catPctRaw == null ? null : clamp(catPctRaw, 0, 100);

    if (catPct != null) {
      return {
        commission_percent: catPct,
        commission_amount: deposit == null ? null : Math.max(0, Math.round((deposit * catPct) / 100)),
        source: "category",
      };
    }
  }

  // 3) Global finance rules
  const financePctRaw = safeNumber((financeRulesRes.data as any)?.standard_commission_percent);
  const financePct = financePctRaw == null ? null : clamp(financePctRaw, 0, 100);

  if (financePct != null) {
    return {
      commission_percent: financePct,
      commission_amount: deposit == null ? null : Math.max(0, Math.round((deposit * financePct) / 100)),
      source: "finance_rules",
    };
  }

  return { commission_percent: null, commission_amount: null, source: "none" };
}

/**
 * Compute pack commission for an establishment.
 * Priority: establishment pack override > establishment override > category > global
 */
export async function computePackCommissionSnapshotForEstablishment(args: {
  establishmentId: string;
  amountCents: number | null;
}): Promise<CommissionSnapshot> {
  const supabase = getAdminSupabase();

  const amount = typeof args.amountCents === "number" && Number.isFinite(args.amountCents) ? Math.max(0, Math.round(args.amountCents)) : null;

  const [estRes, overrideRes, financeRulesRes] = await Promise.all([
    supabase.from("establishments").select("id,universe,subcategory").eq("id", args.establishmentId).maybeSingle(),
    supabase
      .from("establishment_commission_overrides")
      .select("active,commission_percent,commission_amount_cents,pack_commission_percent,pack_commission_amount_cents")
      .eq("establishment_id", args.establishmentId)
      .maybeSingle(),
    supabase.from("finance_rules").select("standard_commission_percent").eq("id", 1).maybeSingle(),
  ]);

  if (estRes.error) throw estRes.error;
  if (overrideRes.error) throw overrideRes.error;
  if (financeRulesRes.error) throw financeRulesRes.error;

  const est = estRes.data as any;
  const universe = typeof est?.universe === "string" ? est.universe : null;
  const subcategory = typeof est?.subcategory === "string" ? est.subcategory : null;

  const override = overrideRes.data as any;
  const overrideActive = override ? override.active !== false : false;

  // 1) Pack-specific commission override
  if (override && overrideActive) {
    const packAmountRaw = safeNumber(override.pack_commission_amount_cents);
    const packAmount = packAmountRaw == null ? null : Math.max(0, Math.round(packAmountRaw));
    const packPctRaw = safeNumber(override.pack_commission_percent);
    const packPct = packPctRaw == null ? null : clamp(packPctRaw, 0, 100);

    if (packAmount != null) {
      return {
        commission_percent: null,
        commission_amount: amount == null ? null : Math.min(amount, packAmount),
        source: "establishment_override",
      };
    }

    if (packPct != null) {
      return {
        commission_percent: packPct,
        commission_amount: amount == null ? null : Math.max(0, Math.round((amount * packPct) / 100)),
        source: "establishment_override",
      };
    }

    // Fallback to reservation commission if no pack-specific commission
    const explicitAmountRaw = safeNumber(override.commission_amount_cents);
    const explicitAmount = explicitAmountRaw == null ? null : Math.max(0, Math.round(explicitAmountRaw));
    const pctRaw = safeNumber(override.commission_percent);
    const pct = pctRaw == null ? null : clamp(pctRaw, 0, 100);

    if (explicitAmount != null) {
      return {
        commission_percent: null,
        commission_amount: amount == null ? null : Math.min(amount, explicitAmount),
        source: "establishment_override",
      };
    }

    if (pct != null) {
      return {
        commission_percent: pct,
        commission_amount: amount == null ? null : Math.max(0, Math.round((amount * pct) / 100)),
        source: "establishment_override",
      };
    }
  }

  // 2) Category override (best-effort)
  if (universe) {
    const { data: catRows, error: catErr } = await supabase
      .from("admin_categories")
      .select("commission_percent,name,universe,active")
      .eq("universe", universe)
      .eq("active", true)
      .limit(50);

    if (catErr) throw catErr;

    const wanted = (subcategory ?? universe).toLowerCase();
    const match = (catRows ?? []).find((r: any) => {
      const name = typeof r?.name === "string" ? r.name.toLowerCase() : "";
      return name === wanted;
    });

    const catPctRaw = safeNumber(match?.commission_percent);
    const catPct = catPctRaw == null ? null : clamp(catPctRaw, 0, 100);

    if (catPct != null) {
      return {
        commission_percent: catPct,
        commission_amount: amount == null ? null : Math.max(0, Math.round((amount * catPct) / 100)),
        source: "category",
      };
    }
  }

  // 3) Global finance rules
  const financePctRaw = safeNumber((financeRulesRes.data as any)?.standard_commission_percent);
  const financePct = financePctRaw == null ? null : clamp(financePctRaw, 0, 100);

  if (financePct != null) {
    return {
      commission_percent: financePct,
      commission_amount: amount == null ? null : Math.max(0, Math.round((amount * financePct) / 100)),
      source: "finance_rules",
    };
  }

  return { commission_percent: null, commission_amount: null, source: "none" };
}
