import { getAdminSupabase } from "../supabaseAdmin";

export type BillingCompanyProfile = {
  legal_name: string;
  trade_name: string;
  legal_form: string;
  ice: string;
  rc_number: string;
  rc_court: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  country: string;
  capital_mad: number;
  default_currency: string;

  bank_name: string | null;
  rib: string | null;
  iban: string | null;
  swift: string | null;
  bank_account_holder: string | null;
  bank_instructions: string | null;

  updated_at: string;
};

type CacheEntry = { value: BillingCompanyProfile; fetchedAt: number };

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: CacheEntry | null = null;

export function invalidateBillingCompanyProfileCache(): void {
  cache = null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asNullableString(v: unknown): string | null {
  const s = asString(v);
  return s ? s : null;
}

function asInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return 0;
}

function normalizeRow(row: unknown): BillingCompanyProfile {
  if (!isRecord(row)) throw new Error("Invalid billing_company_profile row");

  const legal_name = asString(row.legal_name);
  const trade_name = asString(row.trade_name);
  const legal_form = asString(row.legal_form);
  const ice = asString(row.ice);
  const rc_number = asString(row.rc_number);
  const rc_court = asString(row.rc_court);
  const address_line1 = asString(row.address_line1);
  const address_line2 = asNullableString(row.address_line2);
  const city = asString(row.city);
  const country = asString(row.country);
  const capital_mad = asInt(row.capital_mad);
  const default_currency = asString(row.default_currency) || "MAD";

  const bank_name = asNullableString(row.bank_name);
  const rib = asNullableString(row.rib);
  const iban = asNullableString(row.iban);
  const swift = asNullableString(row.swift);
  const bank_account_holder = asNullableString(row.bank_account_holder);
  const bank_instructions = asNullableString(row.bank_instructions);

  const updated_at = asString(row.updated_at) || new Date().toISOString();

  const missing: string[] = [];
  if (!legal_name) missing.push("legal_name");
  if (!trade_name) missing.push("trade_name");
  if (!legal_form) missing.push("legal_form");
  if (!ice) missing.push("ice");
  if (!rc_number) missing.push("rc_number");
  if (!rc_court) missing.push("rc_court");
  if (!address_line1) missing.push("address_line1");
  if (!city) missing.push("city");
  if (!country) missing.push("country");
  if (!default_currency) missing.push("default_currency");

  if (missing.length) {
    throw new Error(
      `billing_company_profile is missing required fields: ${missing.join(", ")}`,
    );
  }

  return {
    legal_name,
    trade_name,
    legal_form,
    ice,
    rc_number,
    rc_court,
    address_line1,
    address_line2,
    city,
    country,
    capital_mad,
    default_currency,

    bank_name,
    rib,
    iban,
    swift,
    bank_account_holder,
    bank_instructions,

    updated_at,
  };
}

export async function getBillingCompanyProfile(): Promise<BillingCompanyProfile> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.value;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("billing_company_profile")
    .select(
      "legal_name,trade_name,legal_form,ice,rc_number,rc_court,address_line1,address_line2,city,country,capital_mad,default_currency,bank_name,rib,iban,swift,bank_account_holder,bank_instructions,updated_at",
    )
    .eq("id", "default")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data)
    throw new Error("billing_company_profile row not found (id=default)");

  const normalized = normalizeRow(data);
  cache = { value: normalized, fetchedAt: Date.now() };
  return normalized;
}
