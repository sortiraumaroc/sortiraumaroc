/**
 * Admin Settings handlers — Extracted from admin.ts
 *
 * Covers: cities, neighborhoods, categories, universe commission,
 * finance rules, reservation rules, feature flags, billing company profile,
 * and the settings snapshot endpoint.
 */

import type { RequestHandler } from "express";

import {
  requireAdminKey,
  requireSuperadmin,
  isRecord,
  asString,
  getAdminSupabase,
  getAuditActorInfo,
} from "./adminHelpers";
import {
  getBillingCompanyProfile,
  invalidateBillingCompanyProfileCache,
  type BillingCompanyProfile,
} from "../billing/companyProfile";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("adminSettings");

// =============================================================================
// Local types — used only by settings handlers
// =============================================================================

type AdminCityRow = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type AdminCategoryRow = {
  id: string;
  universe: string;
  name: string;
  parent_id: string | null;
  icon: string | null;
  commission_percent: number | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type FinanceRulesRow = {
  id: number;
  standard_commission_percent: number;
  boost_commission_percent_min: number;
  boost_commission_percent_max: number;
  guarantee_commission_percent: number;
  min_deposit_amount_cents: number;
  created_at: string;
  updated_at: string;
};

type ReservationRulesRow = {
  id: number;
  deposit_required_below_score: boolean;
  deposit_required_score_threshold: number;
  max_party_size: number;
  no_show_limit_before_block: number;
  auto_detect_no_show: boolean;
  max_reservations_per_slot: number;
  created_at: string;
  updated_at: string;
};

type FeatureFlagRow = {
  key: string;
  label: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type AdminNeighborhoodRow = {
  id: string;
  city: string;
  name: string;
  active: boolean;
  created_at: string;
};

// =============================================================================
// Local helpers
// =============================================================================

function safeString(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

/**
 * Send a notification to all pro users (best-effort).
 * Duplicated here because the original in admin.ts is also used by other sections.
 */
async function broadcastProNotification(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  title: string;
  body: string;
  category: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const { supabase, title, body, category, data } = args;

  const { data: memberships } = await supabase
    .from("pro_establishment_memberships")
    .select("user_id")
    .limit(5000);

  const userIds = new Set<string>();
  for (const row of memberships ?? []) {
    const id = isRecord(row) ? asString(row.user_id) : undefined;
    if (id) userIds.add(id);
  }

  const payload = Array.from(userIds).map((user_id) => ({
    user_id,
    establishment_id: null,
    category,
    title,
    body,
    data: data ?? {},
  }));

  if (!payload.length) return;
  // Best-effort: ignore notification errors (audit log is the source of truth).
  await supabase.from("pro_notifications").insert(payload);
}

// Default values for when tables don't exist or have no data
const DEFAULT_FINANCE_RULES = {
  id: 1,
  commission_rate_percent: 0,
  vat_rate_percent: 20,
  min_payout_amount_cents: 10000,
  payout_delay_days: 7,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as any as FinanceRulesRow;

const DEFAULT_RESERVATION_RULES = {
  id: 1,
  max_party_size: 20,
  min_advance_hours: 2,
  max_advance_days: 90,
  cancellation_deadline_hours: 24,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as any as ReservationRulesRow;

// =============================================================================
// Handlers
// =============================================================================

export const getAdminSettingsSnapshot: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const supabase = getAdminSupabase();

  // Use Promise.allSettled to handle partial failures gracefully
  const [citiesRes, categoriesRes, financeRes, reservationRes, flagsRes] =
    await Promise.all([
      Promise.resolve(supabase
        .from("admin_cities")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(500)
        .then((r) => ({ data: r.data, error: r.error })))
        .catch(() => ({ data: null, error: null })),
      Promise.resolve(supabase
        .from("admin_categories")
        .select("*")
        .order("universe", { ascending: true })
        .order("sort_order", { ascending: true })
        .limit(2000)
        .then((r) => ({ data: r.data, error: r.error })))
        .catch(() => ({ data: null, error: null })),
      Promise.resolve(supabase
        .from("finance_rules")
        .select("*")
        .eq("id", 1)
        .single()
        .then((r) => ({ data: r.data, error: r.error })))
        .catch(() => ({ data: null, error: null })),
      Promise.resolve(supabase
        .from("reservation_rules")
        .select("*")
        .eq("id", 1)
        .single()
        .then((r) => ({ data: r.data, error: r.error })))
        .catch(() => ({ data: null, error: null })),
      Promise.resolve(supabase
        .from("admin_feature_flags")
        .select("*")
        .order("label", { ascending: true })
        .limit(200)
        .then((r) => ({ data: r.data, error: r.error })))
        .catch(() => ({ data: null, error: null })),
    ]);

  // Log errors but don't fail - use defaults instead
  if (citiesRes.error) {
    log.warn({ err: citiesRes.error.message }, "getAdminSettingsSnapshot cities error");
  }
  if (categoriesRes.error) {
    log.warn({ err: categoriesRes.error.message }, "getAdminSettingsSnapshot categories error");
  }
  if (financeRes.error) {
    log.warn({ err: financeRes.error.message }, "getAdminSettingsSnapshot finance_rules error");
  }
  if (reservationRes.error) {
    log.warn({ err: reservationRes.error.message }, "getAdminSettingsSnapshot reservation_rules error");
  }
  if (flagsRes.error) {
    log.warn({ err: flagsRes.error.message }, "getAdminSettingsSnapshot feature_flags error");
  }

  let billing_company_profile: BillingCompanyProfile | null = null;
  try {
    billing_company_profile = await getBillingCompanyProfile();
  } catch (e) {
    log.warn(
      { err: e },
      "getAdminSettingsSnapshot billing_company_profile unavailable",
    );
  }

  res.json({
    ok: true,
    cities: (citiesRes.data ?? []) as AdminCityRow[],
    categories: (categoriesRes.data ?? []) as AdminCategoryRow[],
    finance_rules: (financeRes.data ?? DEFAULT_FINANCE_RULES) as FinanceRulesRow,
    reservation_rules: (reservationRes.data ?? DEFAULT_RESERVATION_RULES) as ReservationRulesRow,
    feature_flags: (flagsRes.data ?? []) as FeatureFlagRow[],
    billing_company_profile,
  });
};

export const updateAdminBillingCompanyProfile: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  function maybeInt(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return Math.round(n);
    }
    return null;
  }

  const patch: Record<string, unknown> = {};

  const requiredFields: Array<keyof BillingCompanyProfile> = [
    "legal_name",
    "trade_name",
    "legal_form",
    "ice",
    "rc_number",
    "rc_court",
    "address_line1",
    "city",
    "country",
    "default_currency",
  ];

  for (const key of requiredFields) {
    if ((req.body as any)[key] === undefined) continue;
    const value = asString((req.body as any)[key]);
    if (!value)
      return res.status(400).json({ error: `${String(key)} is required` });
    patch[key] = value;
  }

  const addressLine2Raw = (req.body as any).address_line2;
  if (addressLine2Raw !== undefined)
    patch.address_line2 = safeString(addressLine2Raw);

  const capitalRaw = (req.body as any).capital_mad;
  if (capitalRaw !== undefined) {
    const parsed = maybeInt(capitalRaw);
    if (parsed == null)
      return res.status(400).json({ error: "capital_mad must be a number" });
    patch.capital_mad = Math.max(0, parsed);
  }

  const bank_name = (req.body as any).bank_name;
  if (bank_name !== undefined) patch.bank_name = safeString(bank_name);
  const rib = (req.body as any).rib;
  if (rib !== undefined) patch.rib = safeString(rib);
  const iban = (req.body as any).iban;
  if (iban !== undefined) patch.iban = safeString(iban);
  const swift = (req.body as any).swift;
  if (swift !== undefined) patch.swift = safeString(swift);
  const bank_account_holder = (req.body as any).bank_account_holder;
  if (bank_account_holder !== undefined)
    patch.bank_account_holder = safeString(bank_account_holder);
  const bank_instructions = (req.body as any).bank_instructions;
  if (bank_instructions !== undefined)
    patch.bank_instructions = safeString(bank_instructions);

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();

  const { data: beforeRow } = await supabase
    .from("billing_company_profile")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  const { data, error } = await supabase
    .from("billing_company_profile")
    .update(patch)
    .eq("id", "default")
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "settings.billing_company_profile.update",
    entity_type: "billing_company_profile",
    entity_id: "default",
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  invalidateBillingCompanyProfileCache();

  let profile: BillingCompanyProfile | null = null;
  try {
    profile = await getBillingCompanyProfile();
  } catch (e) {
    log.error({ err: e }, "updateAdminBillingCompanyProfile: failed to refetch");
  }

  if (!profile)
    return res
      .status(500)
      .json({ error: "billing_company_profile_unavailable" });

  res.json({ ok: true, profile });
};

export const listAdminCities: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_cities")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: (data ?? []) as AdminCityRow[] });
};

export const createAdminCity: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const name = asString(req.body.name);
  const active = typeof req.body.active === "boolean" ? req.body.active : true;
  if (!name) return res.status(400).json({ error: "Nom requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_cities")
    .insert({ name, active })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "settings.cities.create",
    entity_type: "admin_cities",
    entity_id: (data as any)?.id ?? null,
    metadata: { after: data, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true, item: data as AdminCityRow });
};

export const updateAdminCity: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const patch: Record<string, unknown> = {};
  const name = asString(req.body.name);
  if (name !== undefined) patch.name = name;
  if (typeof req.body.active === "boolean") patch.active = req.body.active;

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();

  const { data: beforeRow } = await supabase
    .from("admin_cities")
    .select("*")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("admin_cities")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "settings.cities.update",
    entity_type: "admin_cities",
    entity_id: id,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({ ok: true, item: data as AdminCityRow });
};

export const deleteAdminCity: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data: beforeRow } = await supabase
    .from("admin_cities")
    .select("*")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("admin_cities").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "settings.cities.delete",
    entity_type: "admin_cities",
    entity_id: id,
    metadata: { before: beforeRow ?? null, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Admin Neighborhoods (Quartiers)
// ---------------------------------------------------------------------------

export const listAdminNeighborhoods: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const city = typeof req.query.city === "string" ? req.query.city : "";

  const supabase = getAdminSupabase();
  let query = supabase
    .from("admin_neighborhoods")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true })
    .limit(500);

  if (city) query = query.eq("city", city);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: (data ?? []) as AdminNeighborhoodRow[] });
};

export const createAdminNeighborhood: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const city = asString(req.body.city);
  const name = asString(req.body.name);
  if (!city) return res.status(400).json({ error: "Ville requise" });
  if (!name) return res.status(400).json({ error: "Nom du quartier requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_neighborhoods")
    .insert({ city, name, active: true })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Unique constraint violation — neighborhood already exists, return it
      const { data: existing } = await supabase
        .from("admin_neighborhoods")
        .select("*")
        .eq("city", city)
        .eq("name", name)
        .single();
      return res.json({ ok: true, item: existing as AdminNeighborhoodRow, existing: true });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, item: data as AdminNeighborhoodRow });
};

// ---------------------------------------------------------------------------
// Admin Categories
// ---------------------------------------------------------------------------

export const listAdminCategories: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_categories")
    .select("*")
    .order("universe", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(2000);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, items: (data ?? []) as AdminCategoryRow[] });
};

export const createAdminCategory: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const universe = asString(req.body.universe);
  const name = asString(req.body.name);
  const icon = asString(req.body.icon);
  const parentId = asString(req.body.parent_id) ?? null;
  const sortOrder =
    typeof req.body.sort_order === "number" &&
    Number.isFinite(req.body.sort_order)
      ? Math.floor(req.body.sort_order)
      : 0;
  const active = typeof req.body.active === "boolean" ? req.body.active : true;
  const commissionPercent =
    typeof req.body.commission_percent === "number" &&
    Number.isFinite(req.body.commission_percent)
      ? req.body.commission_percent
      : null;

  if (!universe) return res.status(400).json({ error: "Univers requis" });
  if (!name) return res.status(400).json({ error: "Nom requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_categories")
    .insert({
      universe,
      name,
      icon: icon ?? null,
      parent_id: parentId,
      commission_percent: commissionPercent,
      sort_order: sortOrder,
      active,
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "settings.categories.create",
    entity_type: "admin_categories",
    entity_id: (data as any)?.id ?? null,
    metadata: { after: data, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true, item: data as AdminCategoryRow });
};

export const updateAdminCategory: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const patch: Record<string, unknown> = {};

  const universe = asString(req.body.universe);
  if (universe !== undefined) patch.universe = universe;

  const name = asString(req.body.name);
  if (name !== undefined) patch.name = name;

  const icon = asString(req.body.icon);
  if (icon !== undefined) patch.icon = icon || null;

  const parentId = asString(req.body.parent_id);
  if (parentId !== undefined) patch.parent_id = parentId || null;

  if (typeof req.body.active === "boolean") patch.active = req.body.active;

  if (
    typeof req.body.sort_order === "number" &&
    Number.isFinite(req.body.sort_order)
  )
    patch.sort_order = Math.floor(req.body.sort_order);

  if (req.body.commission_percent === null) patch.commission_percent = null;
  if (
    typeof req.body.commission_percent === "number" &&
    Number.isFinite(req.body.commission_percent)
  )
    patch.commission_percent = req.body.commission_percent;

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();
  const { data: beforeRow } = await supabase
    .from("admin_categories")
    .select("*")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("admin_categories")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "settings.categories.update",
    entity_type: "admin_categories",
    entity_id: id,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({ ok: true, item: data as AdminCategoryRow });
};

export const deleteAdminCategory: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data: beforeRow } = await supabase
    .from("admin_categories")
    .select("*")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("admin_categories")
    .delete()
    .eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "settings.categories.delete",
    entity_type: "admin_categories",
    entity_id: id,
    metadata: { before: beforeRow ?? null, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Universe Commission
// ---------------------------------------------------------------------------

export const applyAdminUniverseCommission: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const universe = asString(req.body.universe);
  const commission =
    typeof req.body.commission_percent === "number" &&
    Number.isFinite(req.body.commission_percent)
      ? req.body.commission_percent
      : undefined;

  if (!universe) return res.status(400).json({ error: "Univers requis" });
  if (commission === undefined)
    return res.status(400).json({ error: "Pourcentage de commission requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_categories")
    .update({ commission_percent: commission })
    .eq("universe", universe)
    .select("id");

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "settings.categories.apply_universe_commission",
    entity_type: "admin_categories",
    entity_id: null,
    metadata: {
      universe,
      commission_percent: commission,
      affected: (data ?? []).length,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({ ok: true, affected: (data ?? []).length });
};

// ---------------------------------------------------------------------------
// Finance Rules
// ---------------------------------------------------------------------------

export const getAdminFinanceRules: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("finance_rules")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, item: data as FinanceRulesRow });
};

export const updateAdminFinanceRules: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const patch: Record<string, unknown> = {};

  const standard =
    typeof req.body.standard_commission_percent === "number" &&
    Number.isFinite(req.body.standard_commission_percent)
      ? req.body.standard_commission_percent
      : undefined;
  const boostMin =
    typeof req.body.boost_commission_percent_min === "number" &&
    Number.isFinite(req.body.boost_commission_percent_min)
      ? req.body.boost_commission_percent_min
      : undefined;
  const boostMax =
    typeof req.body.boost_commission_percent_max === "number" &&
    Number.isFinite(req.body.boost_commission_percent_max)
      ? req.body.boost_commission_percent_max
      : undefined;
  const guarantee =
    typeof req.body.guarantee_commission_percent === "number" &&
    Number.isFinite(req.body.guarantee_commission_percent)
      ? req.body.guarantee_commission_percent
      : undefined;
  const minDepositCents =
    typeof req.body.min_deposit_amount_cents === "number" &&
    Number.isFinite(req.body.min_deposit_amount_cents)
      ? Math.floor(req.body.min_deposit_amount_cents)
      : undefined;

  if (standard !== undefined) patch.standard_commission_percent = standard;
  if (boostMin !== undefined) patch.boost_commission_percent_min = boostMin;
  if (boostMax !== undefined) patch.boost_commission_percent_max = boostMax;
  if (guarantee !== undefined) patch.guarantee_commission_percent = guarantee;
  if (minDepositCents !== undefined)
    patch.min_deposit_amount_cents = minDepositCents;

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();

  const { data: beforeRow } = await supabase
    .from("finance_rules")
    .select("*")
    .eq("id", 1)
    .single();

  const { data, error } = await supabase
    .from("finance_rules")
    .update(patch)
    .eq("id", 1)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "settings.finance_rules.update",
    entity_type: "finance_rules",
    entity_id: null,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  await broadcastProNotification({
    supabase,
    category: "finance",
    title: "Commissions mises à jour",
    body: "De nouvelles règles de commission/garantie ont été appliquées. Ouvrez votre espace Pro pour voir le détail.",
    data: { kind: "finance_rules" },
  });

  res.json({ ok: true, item: data as FinanceRulesRow });
};

// ---------------------------------------------------------------------------
// Reservation Rules
// ---------------------------------------------------------------------------

export const getAdminReservationRules: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("reservation_rules")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, item: data as ReservationRulesRow });
};

export const updateAdminReservationRules: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const patch: Record<string, unknown> = {};

  if (typeof req.body.deposit_required_below_score === "boolean")
    patch.deposit_required_below_score = req.body.deposit_required_below_score;

  if (
    typeof req.body.deposit_required_score_threshold === "number" &&
    Number.isFinite(req.body.deposit_required_score_threshold)
  ) {
    patch.deposit_required_score_threshold = Math.floor(
      req.body.deposit_required_score_threshold,
    );
  }

  if (
    typeof req.body.max_party_size === "number" &&
    Number.isFinite(req.body.max_party_size)
  ) {
    patch.max_party_size = Math.floor(req.body.max_party_size);
  }

  if (
    typeof req.body.no_show_limit_before_block === "number" &&
    Number.isFinite(req.body.no_show_limit_before_block)
  ) {
    patch.no_show_limit_before_block = Math.floor(
      req.body.no_show_limit_before_block,
    );
  }

  if (typeof req.body.auto_detect_no_show === "boolean")
    patch.auto_detect_no_show = req.body.auto_detect_no_show;

  if (
    typeof req.body.max_reservations_per_slot === "number" &&
    Number.isFinite(req.body.max_reservations_per_slot)
  ) {
    patch.max_reservations_per_slot = Math.floor(
      req.body.max_reservations_per_slot,
    );
  }

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();

  const { data: beforeRow } = await supabase
    .from("reservation_rules")
    .select("*")
    .eq("id", 1)
    .single();

  const { data, error } = await supabase
    .from("reservation_rules")
    .update(patch)
    .eq("id", 1)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "settings.reservation_rules.update",
    entity_type: "reservation_rules",
    entity_id: null,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({ ok: true, item: data as ReservationRulesRow });
};

// ---------------------------------------------------------------------------
// Feature Flags
// ---------------------------------------------------------------------------

export const listAdminFeatureFlags: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_feature_flags")
    .select("*")
    .order("label", { ascending: true })
    .limit(200);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: (data ?? []) as FeatureFlagRow[] });
};

export const updateAdminFeatureFlag: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const key = typeof req.params.key === "string" ? req.params.key.trim() : "";
  if (!key) return res.status(400).json({ error: "Clé requise" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  if (typeof req.body.enabled !== "boolean")
    return res.status(400).json({ error: "Statut requis" });

  const supabase = getAdminSupabase();

  const { data: beforeRow } = await supabase
    .from("admin_feature_flags")
    .select("*")
    .eq("key", key)
    .single();

  const { data, error } = await supabase
    .from("admin_feature_flags")
    .update({ enabled: req.body.enabled })
    .eq("key", key)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "settings.feature_flags.update",
    entity_type: "admin_feature_flags",
    entity_id: null,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
      key,
    },
  });

  res.json({ ok: true, item: data as FeatureFlagRow });
};
