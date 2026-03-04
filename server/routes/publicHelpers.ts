/**
 * Public Route Helpers — Shared utilities for public route modules.
 *
 * Extracted from the monolithic public.ts to support module decomposition.
 * Contains type coercion, date/time helpers, auth checks, and common patterns.
 */

import type { Request } from "express";

import { getAdminSupabase } from "../supabaseAdmin";
import { scoreToReliabilityLevel } from "../consumerReliability";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("public-helpers");

// Re-export getAdminSupabase for convenience
export { getAdminSupabase } from "../supabaseAdmin";

// =============================================================================
// Type coercion helpers
// =============================================================================

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v : null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

export function centsToMad(cents: unknown): number | null {
  const v = asInt(cents);
  if (v == null) return null;
  return Math.round(v) / 100;
}

// =============================================================================
// Slug generation
// =============================================================================

/**
 * Generate a URL-friendly slug from name and city
 * Matches the SQL function generate_establishment_slug for consistency
 */
export function generateEstablishmentSlug(name: string | null, city: string | null): string | null {
  const namePart = (name ?? "").trim();
  const cityPart = (city ?? "").trim();

  if (!namePart) return null;

  let slug = cityPart ? `${namePart}-${cityPart}` : namePart;

  // Convert to lowercase
  slug = slug.toLowerCase();

  // Remove accents (transliterate common French/Arabic accents)
  const accentMap: Record<string, string> = {
    'à': 'a', 'â': 'a', 'ä': 'a', 'á': 'a', 'ã': 'a', 'å': 'a', 'æ': 'ae',
    'ç': 'c', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i',
    'î': 'i', 'ï': 'i', 'ñ': 'n', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o',
    'ö': 'o', 'ø': 'o', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ý': 'y',
    'ÿ': 'y', 'œ': 'oe', 'ß': 'ss',
  };
  slug = slug.replace(/[àâäáãåæçèéêëìíîïñòóôõöøùúûüýÿœß]/g, (char) => accentMap[char] || char);

  // Replace spaces and special characters with hyphens
  slug = slug.replace(/[^a-z0-9]+/g, '-');

  // Remove leading/trailing hyphens
  slug = slug.replace(/^-+|-+$/g, '');

  // Remove multiple consecutive hyphens
  slug = slug.replace(/-+/g, '-');

  // Ensure minimum length
  if (slug.length < 3) {
    slug = slug ? `${slug}-etablissement` : null;
  }

  return slug || null;
}

// =============================================================================
// Date / time helpers
// =============================================================================

export function dateYmdToEndOfDayIso(ymd: string): string | null {
  const v = String(ymd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const ts = Date.parse(`${v}T23:59:59.999Z`);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

export function addDaysIso(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export const MOROCCO_TZ = "Africa/Casablanca";

/** Extract date parts in Morocco timezone */
export function moroccoDateParts(dt: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOROCCO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(dt);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

export function toYmd(dt: Date): string {
  const { year, month, day } = moroccoDateParts(dt);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function timeHm(dt: Date): string {
  const { hour, minute } = moroccoDateParts(dt);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function moroccoMinutes(dt: Date): number {
  const { hour, minute } = moroccoDateParts(dt);
  return hour * 60 + minute;
}

// =============================================================================
// Universe / URL helpers
// =============================================================================

export function normalizeUniverseToPackUniverse(
  universe: unknown,
): "restaurant" | "loisir" | "wellness" {
  const u = typeof universe === "string" ? universe.trim().toLowerCase() : "";
  if (u === "wellness") return "wellness";
  if (u === "loisir" || u === "culture" || u === "sport") return "loisir";
  return "restaurant";
}

export function buildEstablishmentDetailsUrl(
  establishmentId: string,
  universe: unknown,
): string {
  const u = normalizeUniverseToPackUniverse(universe);
  if (u === "wellness")
    return `/wellness/${encodeURIComponent(establishmentId)}`;
  if (u === "loisir") return `/loisir/${encodeURIComponent(establishmentId)}`;
  return `/restaurant/${encodeURIComponent(establishmentId)}`;
}

// =============================================================================
// Slot / service helpers
// =============================================================================

export function promoPercentFromSlot(slot: {
  promo_type: string | null;
  promo_value: number | null;
}): number | null {
  if (!slot.promo_type || slot.promo_type !== "percent") return null;
  const n =
    typeof slot.promo_value === "number" && Number.isFinite(slot.promo_value)
      ? Math.round(slot.promo_value)
      : null;
  if (!n || n <= 0) return null;
  return Math.min(95, Math.max(1, n));
}

export function getRestaurantServiceLabelFromMinutes(min: number): string {
  if (min < 15 * 60) return "Midi";
  if (min < 17 * 60 + 30) return "Tea Time";
  if (min < 19 * 60 + 30) return "Happy Hour";
  return "Soir";
}

// =============================================================================
// Types
// =============================================================================

export type PublicDateSlots = {
  date: string;
  services: Array<{ service: string; times: string[] }>;
  promos?: Record<string, number | null>;
  slotIds?: Record<string, string>;
  remaining?: Record<string, number | null>;
};

export type ConsumerMePayload = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  city: string | null;
  country: string | null;
  socio_professional_status: string | null;
  reliability_score: number;
  reliability_level: "excellent" | "good" | "medium" | "fragile";
};

type UserFromBearerOptions = {
  allowDeactivated?: boolean;
  allowDeleted?: boolean;
};

type UserFromBearerOk = {
  ok: true;
  userId: string;
  email: string | null;
  user: any;
  consumerStatus: string | null;
  accountStatus: string | null;
};

type UserFromBearerErr = {
  ok: false;
  error: string;
  status: number;
};

// =============================================================================
// Establishment ID resolution
// =============================================================================

export async function resolveEstablishmentId(args: {
  ref: string;
  title?: string | null;
}): Promise<string | null> {
  const ref = args.ref.trim();
  if (!ref) return null;

  const supabase = getAdminSupabase();

  // 1) UUID already
  if (isUuid(ref)) return ref;

  // 2) Try to find by slug (new friendly URLs like "atlas-lodge-agadir")
  {
    const { data: slugMatch } = await supabase
      .from("establishments")
      .select("id")
      .eq("slug", ref)
      .eq("status", "active")
      .limit(1);

    const slugId = (slugMatch as Array<{ id: string }> | null)?.[0]?.id;
    if (slugId) return slugId;
  }

  // 2a) Try to find by slug prefix (for fallback slugs generated from name only)
  // This handles cases where client generates "riad-atlas" but DB has "riad-atlas-marrakech"
  {
    const { data: slugPrefixMatch } = await supabase
      .from("establishments")
      .select("id,slug")
      .like("slug", `${ref}-%`)
      .eq("status", "active")
      .limit(1);

    const slugPrefixId = (slugPrefixMatch as Array<{ id: string; slug: string }> | null)?.[0]?.id;
    if (slugPrefixId) return slugPrefixId;
  }

  // 2b) Try to find by username (custom short URLs like @monrestaurant)
  {
    const { data: usernameMatch } = await supabase
      .from("establishments")
      .select("id")
      .ilike("username", ref)
      .eq("status", "active")
      .limit(1);

    const usernameId = (usernameMatch as Array<{ id: string }> | null)?.[0]?.id;
    if (usernameId) return usernameId;
  }

  // 3) numeric legacy: map to demo_index (stored in `extra.demo_index`)
  if (/^\d+$/.test(ref)) {
    const n = Number(ref);

    // Try a direct PostgREST JSON path filter first (fast path).
    const { data: direct, error: directErr } = await supabase
      .from("establishments")
      .select("id")
      // PostgREST supports JSON path via ->> in column names.
      .eq("extra->>demo_index", String(n))
      .limit(1);

    const directId = (direct as Array<{ id: string }> | null)?.[0]?.id;
    if (!directErr && directId) return directId;

    // Fallback: scan a bigger batch and match in JS (covers environments where JSON path filters are restricted).
    const { data: demoMatches } = await supabase
      .from("establishments")
      .select("id,extra")
      .limit(5000);

    const match = (
      (demoMatches as Array<{ id: string; extra?: unknown }> | null) ?? []
    ).find((r) => {
      const extra = asRecord(r.extra);
      const demoIndex = extra ? Number(extra.demo_index) : NaN;
      return Number.isFinite(demoIndex) && demoIndex === n;
    });

    if (match?.id) return match.id;
  }

  // 4) by title param (exact / ilike)
  const title = asString(args.title);
  if (title) {
    const { data } = await supabase
      .from("establishments")
      .select("id,name,status")
      .eq("status", "active")
      .ilike("name", `%${title}%`)
      .limit(5);

    const best = (data as Array<{ id: string; name: string }> | null)?.[0];
    if (best?.id) return best.id;
  }

  // 5) last resort: any active establishment whose name contains the ref
  const { data } = await supabase
    .from("establishments")
    .select("id,name,status")
    .eq("status", "active")
    .ilike("name", `%${ref}%`)
    .limit(5);

  const best = (data as Array<{ id: string; name: string }> | null)?.[0];
  return best?.id ?? null;
}

// =============================================================================
// Timeout helpers
// =============================================================================

export function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.toLowerCase().includes("timeout");
}

export async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });

  try {
    // Supabase query builders are "thenables" (PromiseLike) but not always full Promises.
    // Wrapping them ensures we can safely race and keep TypeScript happy.
    return (await Promise.race([Promise.resolve(promise), timeout])) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// =============================================================================
// Auth helpers
// =============================================================================

export async function getUserFromBearerToken(
  token: string,
  opts?: UserFromBearerOptions,
): Promise<UserFromBearerOk | UserFromBearerErr> {
  const supabase = getAdminSupabase();

  try {
    const { data, error } = await withTimeout(
      supabase.auth.getUser(token),
      8000,
    );

    if (error) {
      // Auth error (expired/invalid token, etc.)
      log.error({ err: error }, "getUserFromBearerToken auth error");
      return { ok: false, status: 401, error: "unauthorized" };
    }

    if (!data.user) return { ok: false, status: 401, error: "unauthorized" };

    const uid = typeof data.user.id === "string" ? data.user.id.trim() : "";
    const emailRaw =
      typeof data.user.email === "string"
        ? data.user.email.trim().toLowerCase()
        : "";
    const email = emailRaw || null;
    const safeEmail =
      emailRaw ||
      (uid ? `unknown+${uid}@example.invalid` : "unknown@example.invalid");

    // Best-effort: ensure the shadow consumer_users record exists so consumer_user_events FK inserts succeed.
    // Uses INSERT ... ON CONFLICT DO NOTHING to avoid overwriting existing full_name/city/country.
    try {
      if (uid) {
        const { error: insErr } = await supabase
          .from("consumer_users")
          .insert(
            { id: uid, email: safeEmail, full_name: "", city: "", country: "" },
          );
        // If already exists (conflict on id), that's fine — don't overwrite.
        if (insErr && insErr.code !== "23505") {
          log.error({ err: insErr }, "getUserFromBearerToken consumer_users insert failed");
        }

        await supabase
          .from("consumer_user_stats")
          .upsert({ user_id: uid }, { onConflict: "user_id" });
      }
    } catch (err) {
      log.warn({ err }, "consumer_users shadow record upsert failed");
    }

    let consumerStatus: string | null = null;
    let accountStatus: string | null = null;
    let deactivatedAtIso: string | null = null;

    if (uid) {
      const { data: consumerRow, error: consumerErr } = await supabase
        .from("consumer_users")
        .select("status,account_status,deactivated_at")
        .eq("id", uid)
        .maybeSingle();

      // If we can't read account status, fail safe.
      if (consumerErr) {
        log.error({ err: consumerErr }, "getUserFromBearerToken consumer status read failed");
        return { ok: false, status: 503, error: "account_state_unavailable" };
      }

      consumerStatus =
        typeof (consumerRow as any)?.status === "string"
          ? String((consumerRow as any).status)
          : null;
      accountStatus =
        typeof (consumerRow as any)?.account_status === "string"
          ? String((consumerRow as any).account_status)
          : null;
      deactivatedAtIso =
        typeof (consumerRow as any)?.deactivated_at === "string"
          ? String((consumerRow as any).deactivated_at)
          : null;
    }

    if (consumerStatus === "suspended") {
      return { ok: false, status: 403, error: "account_suspended" };
    }

    if (accountStatus === "deactivated" && opts?.allowDeactivated !== true) {
      // While deactivated, users cannot perform authenticated actions (e.g. create bookings).
      // Reactivation is done explicitly by calling /api/consumer/account/reactivate after a successful re-login.
      return { ok: false, status: 403, error: "account_deactivated" };
    }

    if (accountStatus === "deleted" && opts?.allowDeleted !== true) {
      return { ok: false, status: 403, error: "account_deleted" };
    }

    return {
      ok: true,
      userId: uid || String(data.user.id ?? ""),
      email,
      user: data.user,
      consumerStatus,
      accountStatus,
    };
  } catch (e) {
    // Network / dependency outage (avoid leaking raw "fetch failed")
    log.error({ err: e }, "getUserFromBearerToken failed");
    return {
      ok: false,
      status: isTimeoutError(e) ? 504 : 503,
      error: isTimeoutError(e) ? "timeout" : "auth_unavailable",
    };
  }
}

// =============================================================================
// User metadata helpers
// =============================================================================

export function normalizeUserMetaString(
  meta: Record<string, unknown>,
  key: string,
): string | null {
  const raw = meta[key];
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v ? v : null;
}

export async function loadConsumerReliabilitySnapshot(args: {
  userId: string;
}): Promise<{
  score: number;
  level: "excellent" | "good" | "medium" | "fragile";
}> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return { score: 80, level: scoreToReliabilityLevel(80) };

  const supabase = getAdminSupabase();

  try {
    const { data, error } = await supabase
      .from("consumer_user_stats")
      .select("reliability_score")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    const scoreRaw = (data as any)?.reliability_score;
    const score =
      typeof scoreRaw === "number" && Number.isFinite(scoreRaw)
        ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
        : 80;

    return { score, level: scoreToReliabilityLevel(score) };
  } catch (err) {
    log.warn({ err }, "loadConsumerReliabilitySnapshot failed, using default");
    return { score: 80, level: scoreToReliabilityLevel(80) };
  }
}

// =============================================================================
// Request helpers
// =============================================================================

export function getRequestLang(req: Request): "fr" | "en" {
  const raw = String(req.headers["accept-language"] ?? "")
    .trim()
    .toLowerCase();
  const first = raw.split(",")[0]?.trim() || "";
  if (first.startsWith("en")) return "en";
  if (first.startsWith("fr")) return "fr";
  return raw.includes("en") && !raw.includes("fr") ? "en" : "fr";
}

/**
 * Map app locale (query param) to PostgreSQL search language.
 * fr -> 'fr', en -> 'en', es/it -> 'en', ar -> 'both' (test FR+EN, take best)
 */
export function getSearchLang(req: Request): "fr" | "en" | "both" {
  const locale = String(req.query.lang ?? "").trim();
  if (locale === "en") return "en";
  if (locale === "es" || locale === "it") return "en";
  if (locale === "ar") return "both";
  return "fr";
}

export function getRequestBaseUrl(req: Request): string {
  const host = String(req.get("host") ?? "").trim();
  const proto = String(
    req.get("x-forwarded-proto") ?? req.protocol ?? "https",
  ).trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

export function getRequestIp(req: Request): string | null {
  const forwarded = String(req.get("x-forwarded-for") ?? "").trim();
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  const realIp = String(req.get("x-real-ip") ?? "").trim();
  if (realIp) return realIp;
  const remoteAddr = (req.socket as any)?.remoteAddress;
  return typeof remoteAddr === "string" && remoteAddr.trim()
    ? remoteAddr.trim()
    : null;
}

// =============================================================================
// Reason / event helpers
// =============================================================================

export function normalizeReasonCode(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  return raw.length > 80 ? raw.slice(0, 80) : raw;
}

export function normalizeReasonText(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  return raw.length > 800 ? raw.slice(0, 800) : raw;
}

export async function insertConsumerAccountEvent(args: {
  userId: string;
  eventType: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const supabase = getAdminSupabase();
  const occurredAt = new Date().toISOString();

  try {
    await supabase.from("consumer_user_events").insert({
      user_id: args.userId,
      event_type: args.eventType,
      occurred_at: occurredAt,
      metadata: args.metadata ?? {},
    });
  } catch (err) {
    log.warn({ err }, "insertConsumerAccountEvent failed");
  }
}

// ---------------------------------------------------------------------------
// Shared types for establishments / landing / config
// ---------------------------------------------------------------------------

export type PublicEstablishmentListItem = {
  id: string;
  name: string | null;
  universe: string | null;
  subcategory: string | null;
  city: string | null;
  address: string | null;
  neighborhood: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  cover_url: string | null;
  booking_enabled: boolean | null;
  promo_percent: number | null;
  next_slot_at: string | null;
  reservations_30d: number;
  avg_rating: number | null;
  review_count: number;
  reviews_last_30d: number;
  best_score?: number;
  verified: boolean;
  premium: boolean;
  curated: boolean;
  slug?: string | null;
  relevance_score?: number;
  total_score?: number;
  tags?: string[] | null;
  is_online?: boolean;
  activity_score?: number;
  google_rating?: number | null;
  google_review_count?: number | null;
};

export type PublicEstablishmentsListResponse = {
  ok: true;
  items: PublicEstablishmentListItem[];
  meta: {
    limit: number;
    offset: number;
    universe?: string;
    city?: string;
    q?: string;
    promoOnly?: boolean;
  };
};

/**
 * Extract promo percentage from slot data.
 * Returns null if the slot has no valid percentage promo.
 */
export function maxPromoPercent(
  promo_type: unknown,
  promo_value: unknown,
): number | null {
  const type =
    typeof promo_type === "string" ? promo_type.trim().toLowerCase() : "";
  if (type !== "percent") return null;
  const raw =
    typeof promo_value === "number" && Number.isFinite(promo_value)
      ? promo_value
      : Number(promo_value);
  if (!Number.isFinite(raw)) return null;
  const n = Math.round(raw);
  if (n <= 0) return null;
  return Math.min(95, Math.max(1, n));
}
