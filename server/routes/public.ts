import type { Request, Response } from "express";

import { createHash, randomBytes } from "crypto";

import { getAdminSupabase } from "../supabaseAdmin";
import {
  setBookingAttributionCookie,
  determineBookingSource,
  type BookingSource,
} from "../lib/bookingAttribution";
import {
  ensureEscrowHoldForReservation,
  settleEscrowForReservation,
  ensureEscrowHoldForPackPurchase,
  ensureInvoiceForReservation,
  ensureInvoiceForPackPurchase,
} from "../finance";
import { emitAdminNotification } from "../adminNotifications";
import { notifyProMembers } from "../proNotifications";
import { emitConsumerUserEvent } from "../consumerNotifications";
import { triggerWaitlistPromotionForSlot } from "../waitlist";
import { formatLeJjMmAaAHeure, formatDateLongFr } from "../../shared/datetime";
import { NotificationEventType } from "../../shared/notifications";
import {
  ACTIVE_WAITLIST_ENTRY_STATUS_SET,
  OCCUPYING_RESERVATION_STATUSES,
} from "../../shared/reservationStates";
import { getBillingCompanyProfile } from "../billing/companyProfile";
import {
  generateMediaInvoicePdfBuffer,
  generateMediaQuotePdfBuffer,
} from "../billing/mediaPdf";
import {
  buildLacaissePayCheckoutUrlServer,
  createLacaissePaySessionInternal,
} from "./lacaissepay";
import { sendTemplateEmail } from "../emailService";
import { scoreToReliabilityLevel } from "../consumerReliability";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Generate a URL-friendly slug from name and city
 * Matches the SQL function generate_establishment_slug for consistency
 */
function generateEstablishmentSlug(name: string | null, city: string | null): string | null {
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

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

function centsToMad(cents: unknown): number | null {
  const v = asInt(cents);
  if (v == null) return null;
  return Math.round(v) / 100;
}

function dateYmdToEndOfDayIso(ymd: string): string | null {
  const v = String(ymd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const ts = Date.parse(`${v}T23:59:59.999Z`);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function addDaysIso(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function normalizeUniverseToPackUniverse(
  universe: unknown,
): "restaurant" | "loisir" | "wellness" {
  const u = typeof universe === "string" ? universe.trim().toLowerCase() : "";
  if (u === "wellness") return "wellness";
  if (u === "loisir" || u === "culture" || u === "sport") return "loisir";
  return "restaurant";
}

function buildEstablishmentDetailsUrl(
  establishmentId: string,
  universe: unknown,
): string {
  const u = normalizeUniverseToPackUniverse(universe);
  if (u === "wellness")
    return `/wellness/${encodeURIComponent(establishmentId)}`;
  if (u === "loisir") return `/loisir/${encodeURIComponent(establishmentId)}`;
  return `/restaurant/${encodeURIComponent(establishmentId)}`;
}

function toYmd(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function timeHm(dt: Date): string {
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function promoPercentFromSlot(slot: {
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

function getRestaurantServiceLabelFromMinutes(min: number): string {
  if (min < 15 * 60) return "Midi";
  if (min < 17 * 60 + 30) return "Tea Time";
  if (min < 19 * 60 + 30) return "Happy Hour";
  return "Soir";
}

type PublicDateSlots = {
  date: string;
  services: Array<{ service: string; times: string[] }>;
  promos?: Record<string, number | null>;
  slotIds?: Record<string, string>;
  remaining?: Record<string, number | null>;
};

async function resolveEstablishmentId(args: {
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

function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.toLowerCase().includes("timeout");
}

async function withTimeout<T>(
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

async function getUserFromBearerToken(
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
      console.error("public.getUserFromBearerToken auth error", error);
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
    try {
      if (uid) {
        await supabase.from("consumer_users").upsert(
          {
            id: uid,
            email: safeEmail,
            full_name: "",
            city: "",
            country: "",
          },
          { onConflict: "id" },
        );

        await supabase
          .from("consumer_user_stats")
          .upsert({ user_id: uid }, { onConflict: "user_id" });
      }
    } catch {
      // ignore
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
        console.error(
          "public.getUserFromBearerToken consumer status read failed",
          consumerErr,
        );
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
    console.error("public.getUserFromBearerToken failed", e);
    return {
      ok: false,
      status: isTimeoutError(e) ? 504 : 503,
      error: isTimeoutError(e) ? "timeout" : "auth_unavailable",
    };
  }
}

type ConsumerMePayload = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  reliability_score: number;
  reliability_level: "excellent" | "good" | "medium" | "fragile";
};

function normalizeUserMetaString(
  meta: Record<string, unknown>,
  key: string,
): string | null {
  const raw = meta[key];
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v ? v : null;
}

async function loadConsumerReliabilitySnapshot(args: {
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
  } catch {
    // Best-effort fallback
    return { score: 80, level: scoreToReliabilityLevel(80) };
  }
}

export async function getConsumerMe(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const meta = (asRecord(userResult.user?.user_metadata) ?? {}) as Record<
    string,
    unknown
  >;

  const reliability = await loadConsumerReliabilitySnapshot({
    userId: userResult.userId,
  });

  const payload: ConsumerMePayload = {
    id: userResult.userId,
    first_name: normalizeUserMetaString(meta, "first_name"),
    last_name: normalizeUserMetaString(meta, "last_name"),
    phone: normalizeUserMetaString(meta, "phone"),
    email: userResult.email,
    reliability_score: reliability.score,
    reliability_level: reliability.level,
  };

  return res.status(200).json(payload);
}

export async function updateConsumerMe(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const body = asRecord(req.body) ?? {};
  const firstName = asString(body.first_name) ?? asString(body.firstName);
  const lastName = asString(body.last_name) ?? asString(body.lastName);
  const phone = asString(body.phone);
  const dateOfBirth = asString(body.date_of_birth) ?? asString(body.dateOfBirth);
  const city = asString(body.city);

  const nextMeta: Record<string, unknown> = {
    ...(asRecord(userResult.user?.user_metadata) ?? {}),
    ...(firstName != null ? { first_name: firstName } : {}),
    ...(lastName != null ? { last_name: lastName } : {}),
    ...(phone != null ? { phone } : {}),
    ...(dateOfBirth != null ? { date_of_birth: dateOfBirth } : {}),
  };

  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    userResult.userId,
    { user_metadata: nextMeta },
  );
  if (updateErr) return res.status(500).json({ error: updateErr.message });

  // Update consumer_users table for city and full_name
  const consumerUpdate: Record<string, unknown> = {};
  if (city != null) consumerUpdate.city = city;
  if (firstName != null || lastName != null) {
    consumerUpdate.full_name = [firstName, lastName].filter(Boolean).join(" ");
  }
  if (Object.keys(consumerUpdate).length > 0) {
    await supabase
      .from("consumer_users")
      .update(consumerUpdate)
      .eq("id", userResult.userId);
  }

  const reliability = await loadConsumerReliabilitySnapshot({
    userId: userResult.userId,
  });

  const payload: ConsumerMePayload = {
    id: userResult.userId,
    first_name: firstName ?? normalizeUserMetaString(nextMeta, "first_name"),
    last_name: lastName ?? normalizeUserMetaString(nextMeta, "last_name"),
    phone: phone ?? normalizeUserMetaString(nextMeta, "phone"),
    email: userResult.email,
    reliability_score: reliability.score,
    reliability_level: reliability.level,
  };

  return res.status(200).json(payload);
}

function getRequestLang(req: Request): "fr" | "en" {
  const raw = String(req.headers["accept-language"] ?? "")
    .trim()
    .toLowerCase();
  const first = raw.split(",")[0]?.trim() || "";
  if (first.startsWith("en")) return "en";
  if (first.startsWith("fr")) return "fr";
  return raw.includes("en") && !raw.includes("fr") ? "en" : "fr";
}

function getRequestBaseUrl(req: Request): string {
  const host = String(req.get("host") ?? "").trim();
  const proto = String(
    req.get("x-forwarded-proto") ?? req.protocol ?? "https",
  ).trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

function getRequestIp(req: Request): string | null {
  const forwarded = String(req.get("x-forwarded-for") ?? "").trim();
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  const realIp = String(req.get("x-real-ip") ?? "").trim();
  if (realIp) return realIp;
  const remoteAddr = (req.socket as any)?.remoteAddress;
  return typeof remoteAddr === "string" && remoteAddr.trim()
    ? remoteAddr.trim()
    : null;
}

function normalizeReasonCode(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  return raw.length > 80 ? raw.slice(0, 80) : raw;
}

function normalizeReasonText(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  return raw.length > 800 ? raw.slice(0, 800) : raw;
}

async function insertConsumerAccountEvent(args: {
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
  } catch {
    // ignore
  }
}

export async function deactivateConsumerAccount(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: true,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const body = asRecord(req.body) ?? {};
  const reasonCode = normalizeReasonCode(body.reason_code ?? body.reasonCode);
  const reasonText = normalizeReasonText(body.reason_text ?? body.reasonText);

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("consumer_users")
    .update({
      account_status: "deactivated",
      deactivated_at: nowIso,
      deleted_at: null,
      account_reason_code: reasonCode,
      account_reason_text: reasonText,
    })
    .eq("id", userResult.userId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "account.deactivated",
    metadata: {
      reason_code: reasonCode,
      reason_text: reasonText,
      ip,
      user_agent: userAgent,
    },
  });

  const userName = (() => {
    const meta = asRecord(userResult.user?.user_metadata) ?? {};
    const first =
      typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last =
      typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    return full || "Utilisateur";
  })();

  if (userResult.email) {
    void sendTemplateEmail({
      templateKey: "user_account_deactivated",
      lang: getRequestLang(req),
      fromKey: "noreply",
      to: [userResult.email],
      variables: { user_name: userName },
      meta: {
        user_id: userResult.userId,
        action: "account.deactivated",
        reason_code: reasonCode,
      },
    });
  }

  return res.status(200).json({ ok: true });
}

export async function reactivateConsumerAccount(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: true,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  // Check if account is already active - skip if so to avoid duplicate notifications
  const { data: currentUser } = await supabase
    .from("consumer_users")
    .select("account_status")
    .eq("id", userResult.userId)
    .single();

  if (currentUser?.account_status === "active") {
    return res.status(200).json({ ok: true, already_active: true });
  }

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;

  const { error: updateErr } = await supabase
    .from("consumer_users")
    .update({
      account_status: "active",
      deactivated_at: null,
      account_reason_code: null,
      account_reason_text: null,
    })
    .eq("id", userResult.userId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "account.reactivated",
    metadata: { ip, user_agent: userAgent },
  });

  return res.status(200).json({ ok: true });
}

export async function deleteConsumerAccount(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: true,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const body = asRecord(req.body) ?? {};
  const reasonCode = normalizeReasonCode(body.reason_code ?? body.reasonCode);
  const reasonText = normalizeReasonText(body.reason_text ?? body.reasonText);

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;

  const nowIso = new Date().toISOString();
  const placeholderEmail = `deleted+${userResult.userId}@example.invalid`;

  const supabase = getAdminSupabase();

  const { error: updateErr } = await supabase
    .from("consumer_users")
    .update({
      account_status: "deleted",
      deleted_at: nowIso,
      deactivated_at: null,
      account_reason_code: reasonCode,
      account_reason_text: reasonText,
      email: placeholderEmail,
      full_name: "",
      city: "",
      country: "",
    })
    .eq("id", userResult.userId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  // Security: invalidate any outstanding export links.
  // After deletion/anonymization, we don't want old emailed links to keep working.
  const { error: expireErr } = await supabase
    .from("consumer_data_export_requests")
    .update({ status: "expired", expires_at: nowIso })
    .eq("user_id", userResult.userId);

  if (expireErr) {
    console.error(
      "public.deleteConsumerAccount expire exports failed",
      expireErr,
    );
  }

  try {
    await supabase.auth.admin.updateUserById(userResult.userId, {
      email: placeholderEmail,
      user_metadata: {},
    });
  } catch {
    // ignore
  }

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "account.deleted",
    metadata: {
      reason_code: reasonCode,
      reason_text: reasonText,
      ip,
      user_agent: userAgent,
    },
  });

  const userName = (() => {
    const meta = asRecord(userResult.user?.user_metadata) ?? {};
    const first =
      typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last =
      typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    return full || "Utilisateur";
  })();

  if (userResult.email) {
    void sendTemplateEmail({
      templateKey: "user_account_deleted",
      lang: getRequestLang(req),
      fromKey: "noreply",
      to: [userResult.email],
      variables: { user_name: userName },
      meta: {
        user_id: userResult.userId,
        action: "account.deleted",
        reason_code: reasonCode,
      },
    });
  }

  return res.status(200).json({ ok: true });
}

export async function requestConsumerDataExport(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: true,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const body = asRecord(req.body) ?? {};
  const formatRaw = asString(body.format) ?? "json";
  const format = formatRaw.toLowerCase() === "csv" ? "csv" : "json";

  const tokenRaw = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");

  const now = new Date();
  const expiresAt = addDaysIso(now, 7);

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;

  const supabase = getAdminSupabase();

  const { error: insertErr } = await supabase
    .from("consumer_data_export_requests")
    .insert({
      user_id: userResult.userId,
      format,
      status: "ready",
      token_hash: tokenHash,
      expires_at: expiresAt,
      ip,
      user_agent: userAgent,
    });

  if (insertErr) return res.status(500).json({ error: insertErr.message });

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "account.export_requested",
    metadata: { format, ip, user_agent: userAgent },
  });

  const baseUrl = getRequestBaseUrl(req);
  const downloadUrl = baseUrl
    ? `${baseUrl}/api/consumer/account/export/download?token=${encodeURIComponent(tokenRaw)}`
    : `/api/consumer/account/export/download?token=${encodeURIComponent(tokenRaw)}`;

  const userName = (() => {
    const meta = asRecord(userResult.user?.user_metadata) ?? {};
    const first =
      typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last =
      typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    return full || "Utilisateur";
  })();

  if (userResult.email) {
    void sendTemplateEmail({
      templateKey: "user_data_export_ready",
      lang: getRequestLang(req),
      fromKey: "noreply",
      to: [userResult.email],
      variables: { user_name: userName, cta_url: downloadUrl },
      ctaUrl: downloadUrl,
      meta: {
        user_id: userResult.userId,
        action: "account.export_requested",
        format,
      },
    });
  }

  return res.status(200).json({ ok: true });
}

/**
 * Request a password reset - sends a new temporary password to the user's email.
 */
export async function requestConsumerPasswordReset(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: false,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  if (!userResult.email) {
    return res.status(400).json({ error: "no_email" });
  }

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;

  // Generate a secure temporary password
  const tempPassword = randomBytes(12).toString("base64url").slice(0, 12);

  const supabase = getAdminSupabase();

  // Update user's password
  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    userResult.userId,
    { password: tempPassword },
  );

  if (updateErr) {
    console.error("requestConsumerPasswordReset updateUserById failed", updateErr);
    return res.status(500).json({ error: "password_update_failed" });
  }

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "password.reset_requested",
    metadata: { ip, user_agent: userAgent },
  });

  const userName = (() => {
    const meta = asRecord(userResult.user?.user_metadata) ?? {};
    const first =
      typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last =
      typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    return full || "Utilisateur";
  })();

  // Send email with temporary password
  void sendTemplateEmail({
    templateKey: "user_password_reset",
    lang: getRequestLang(req),
    fromKey: "noreply",
    to: [userResult.email],
    variables: {
      user_name: userName,
      temp_password: tempPassword,
    },
    meta: {
      user_id: userResult.userId,
      action: "password.reset_requested",
    },
  });

  return res.status(200).json({ ok: true });
}

/**
 * Change the user's password. Requires current password for verification.
 */
export async function changeConsumerPassword(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: false,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  if (!userResult.email) {
    return res.status(400).json({ error: "no_email" });
  }

  const body = asRecord(req.body) ?? {};
  const currentPassword = asString(body.current_password) ?? "";
  const newPassword = asString(body.new_password) ?? "";

  if (!currentPassword.trim()) {
    return res.status(400).json({ error: "current_password_required" });
  }
  if (!newPassword.trim()) {
    return res.status(400).json({ error: "new_password_required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "password_too_short" });
  }

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;

  const supabase = getAdminSupabase();

  // Verify current password by attempting to sign in
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: userResult.email,
    password: currentPassword,
  });

  if (signInErr) {
    await insertConsumerAccountEvent({
      userId: userResult.userId,
      eventType: "password.change_failed",
      metadata: { ip, user_agent: userAgent, reason: "invalid_current_password" },
    });
    return res.status(400).json({ error: "invalid_current_password" });
  }

  // Update to new password
  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    userResult.userId,
    { password: newPassword },
  );

  if (updateErr) {
    console.error("changeConsumerPassword updateUserById failed", updateErr);
    return res.status(500).json({ error: "password_update_failed" });
  }

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "password.changed",
    metadata: { ip, user_agent: userAgent },
  });

  const userName = (() => {
    const meta = asRecord(userResult.user?.user_metadata) ?? {};
    const first =
      typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last =
      typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    return full || "Utilisateur";
  })();

  // Send confirmation email
  void sendTemplateEmail({
    templateKey: "user_password_changed",
    lang: getRequestLang(req),
    fromKey: "noreply",
    to: [userResult.email],
    variables: { user_name: userName },
    meta: {
      user_id: userResult.userId,
      action: "password.changed",
    },
  });

  return res.status(200).json({ ok: true });
}

/**
 * Request a password reset link - sends an email with a secure link to reset password.
 * Improvement over the temp password method - user creates their own new password.
 */
export async function requestConsumerPasswordResetLink(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: false,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  // Check if user has email - phone-only users cannot use this flow
  const email = userResult.email;
  const isPhoneOnlyUser = email?.endsWith("@phone.sortiraumaroc.ma") ?? false;

  if (!email || isPhoneOnlyUser) {
    return res.status(400).json({ error: "no_email", phone_only: isPhoneOnlyUser });
  }

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;
  const supabase = getAdminSupabase();

  // Generate secure token
  const resetToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Store token in database
  const { error: insertErr } = await supabase
    .from("consumer_password_reset_tokens")
    .insert({
      user_id: userResult.userId,
      token: resetToken,
      expires_at: expiresAt.toISOString(),
      ip_address: ip,
      user_agent: userAgent,
    });

  if (insertErr) {
    console.error("requestConsumerPasswordResetLink insert failed", insertErr);
    return res.status(500).json({ error: "token_creation_failed" });
  }

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "password.reset_link_requested",
    metadata: { ip, user_agent: userAgent },
  });

  const userName = (() => {
    const meta = asRecord(userResult.user?.user_metadata) ?? {};
    const first =
      typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last =
      typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    return full || "Utilisateur";
  })();

  // Build reset URL
  const baseUrl = process.env.FRONTEND_URL || "https://sortiraumaroc.ma";
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

  // Send email with reset link
  void sendTemplateEmail({
    templateKey: "user_password_reset_link",
    lang: getRequestLang(req),
    fromKey: "noreply",
    to: [email],
    variables: {
      user_name: userName,
      reset_url: resetUrl,
    },
    meta: {
      user_id: userResult.userId,
      action: "password.reset_link_requested",
    },
  });

  return res.status(200).json({ ok: true });
}

/**
 * Validate a password reset token - check if it's valid and not expired.
 * Returns user info (masked email) if valid.
 */
export async function validatePasswordResetToken(req: Request, res: Response) {
  const tokenRaw = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!tokenRaw) return res.status(400).json({ error: "missing_token" });

  const supabase = getAdminSupabase();

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("consumer_password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token", tokenRaw)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    return res.status(404).json({ error: "invalid_token" });
  }

  // Check if already used
  if (tokenRow.used_at) {
    return res.status(410).json({ error: "token_already_used" });
  }

  // Check if expired
  const expiresAt = new Date(tokenRow.expires_at);
  if (expiresAt <= new Date()) {
    return res.status(410).json({ error: "token_expired" });
  }

  // Get user email (masked)
  const { data: user } = await supabase.auth.admin.getUserById(tokenRow.user_id);
  const email = user?.user?.email ?? "";
  const maskedEmail = email ? maskEmail(email) : "";

  return res.status(200).json({
    ok: true,
    email: maskedEmail,
  });
}

/**
 * Complete password reset - set a new password using the reset token.
 */
export async function completePasswordReset(req: Request, res: Response) {
  const body = asRecord(req.body) ?? {};
  const tokenRaw = asString(body.token) ?? "";
  const newPassword = asString(body.new_password) ?? "";

  if (!tokenRaw) return res.status(400).json({ error: "missing_token" });
  if (!newPassword.trim()) return res.status(400).json({ error: "new_password_required" });
  if (newPassword.length < 8) return res.status(400).json({ error: "password_too_short" });

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;
  const supabase = getAdminSupabase();

  // Verify token
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("consumer_password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token", tokenRaw)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    return res.status(404).json({ error: "invalid_token" });
  }

  if (tokenRow.used_at) {
    return res.status(410).json({ error: "token_already_used" });
  }

  const expiresAt = new Date(tokenRow.expires_at);
  if (expiresAt <= new Date()) {
    return res.status(410).json({ error: "token_expired" });
  }

  // Update password
  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    tokenRow.user_id,
    { password: newPassword },
  );

  if (updateErr) {
    console.error("completePasswordReset updateUserById failed", updateErr);
    return res.status(500).json({ error: "password_update_failed" });
  }

  // Mark token as used
  await supabase
    .from("consumer_password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  await insertConsumerAccountEvent({
    userId: tokenRow.user_id,
    eventType: "password.reset_completed",
    metadata: { ip, user_agent: userAgent },
  });

  // Get user info for confirmation email
  const { data: user } = await supabase.auth.admin.getUserById(tokenRow.user_id);
  const email = user?.user?.email ?? "";
  const isPhoneEmail = email.endsWith("@phone.sortiraumaroc.ma");

  if (email && !isPhoneEmail) {
    const meta = asRecord(user?.user?.user_metadata) ?? {};
    const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const userName = `${first} ${last}`.trim() || "Utilisateur";

    void sendTemplateEmail({
      templateKey: "user_password_changed",
      lang: getRequestLang(req),
      fromKey: "noreply",
      to: [email],
      variables: { user_name: userName },
      meta: {
        user_id: tokenRow.user_id,
        action: "password.reset_completed",
      },
    });
  }

  return res.status(200).json({ ok: true });
}

/**
 * PUBLIC: Request a password reset link - no auth required.
 * User provides email, server finds user, generates token, sends email.
 * Always returns 200 (even if email not found) to prevent enumeration.
 */
export async function requestPublicPasswordResetLink(req: Request, res: Response) {
  const body = asRecord(req.body) ?? {};
  const emailRaw = asString(body.email) ?? "";
  const email = emailRaw.toLowerCase().trim();

  if (!email || !/.+@.+\..+/.test(email)) {
    // Still return 200 to prevent email enumeration
    return res.status(200).json({ ok: true });
  }

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;
  const supabase = getAdminSupabase();

  try {
    // Find user by email via Supabase Auth admin API
    const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1 });
    // listUsers doesn't support email filter directly, use RPC or iterate
    // Instead, use signInWithPassword attempt or list from users table
    const { data: usersData } = await supabase
      .from("users")
      .select("id, email, display_name, first_name, last_name")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (!usersData?.id) {
      // User not found - return 200 to prevent enumeration
      console.log(`[PublicPasswordReset] No user found for ${email}`);
      return res.status(200).json({ ok: true });
    }

    const userId = usersData.id;

    // Check if phone-only user
    if (email.endsWith("@phone.sortiraumaroc.ma")) {
      return res.status(200).json({ ok: true });
    }

    // Generate secure token
    const resetToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token in database
    const { error: insertErr } = await supabase
      .from("consumer_password_reset_tokens")
      .insert({
        user_id: userId,
        token: resetToken,
        expires_at: expiresAt.toISOString(),
        ip_address: ip,
        user_agent: userAgent,
      });

    if (insertErr) {
      console.error("[PublicPasswordReset] insert failed", insertErr);
      return res.status(200).json({ ok: true });
    }

    const userName = (() => {
      const dn = usersData.display_name;
      if (dn && typeof dn === "string" && dn.trim()) return dn.trim();
      const first = typeof usersData.first_name === "string" ? usersData.first_name.trim() : "";
      const last = typeof usersData.last_name === "string" ? usersData.last_name.trim() : "";
      const full = `${first} ${last}`.trim();
      return full || "Utilisateur";
    })();

    // Build reset URL
    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || "https://sortiraumaroc.ma";
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

    // Send email with reset link
    void sendTemplateEmail({
      templateKey: "user_password_reset_link",
      lang: getRequestLang(req),
      fromKey: "noreply",
      to: [email],
      variables: {
        user_name: userName,
        reset_url: resetUrl,
      },
      meta: {
        user_id: userId,
        action: "password.reset_link_requested_public",
      },
    });

    console.log(`[PublicPasswordReset] Reset link sent to ${email}`);
  } catch (err) {
    console.error("[PublicPasswordReset] Error:", err);
  }

  // Always return 200 to prevent enumeration
  return res.status(200).json({ ok: true });
}

/**
 * PUBLIC: Send welcome email after successful signup.
 * Called by the client after Supabase auth.signUp() succeeds.
 */
export async function sendWelcomeEmail(req: Request, res: Response) {
  const body = asRecord(req.body) ?? {};
  const userId = asString(body.user_id) ?? "";
  const email = asString(body.email) ?? "";

  if (!email || !/.+@.+\..+/.test(email.trim())) {
    return res.status(400).json({ error: "email_required" });
  }

  try {
    const userName = (() => {
      const name = asString(body.name) ?? "";
      return name || email.split("@")[0] || "Utilisateur";
    })();

    void sendTemplateEmail({
      templateKey: "user_welcome",
      lang: getRequestLang(req),
      fromKey: "hello",
      to: [email.trim().toLowerCase()],
      variables: {
        user_name: userName,
      },
      meta: {
        user_id: userId || null,
        action: "user.welcome",
      },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[WelcomeEmail] Error:", err);
    return res.status(500).json({ error: "email_send_failed" });
  }
}

/**
 * Helper to mask email for display (e.g., s***@gmail.com)
 */
function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx <= 1) return email;
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  const masked = local[0] + "***" + (local.length > 1 ? local[local.length - 1] : "");
  return masked + domain;
}

function csvEscapeCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[\n\r",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function downloadConsumerDataExport(req: Request, res: Response) {
  const tokenRaw =
    typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!tokenRaw) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");
  const supabase = getAdminSupabase();

  const nowIso = new Date().toISOString();

  const { data: requestRow, error: requestErr } = await supabase
    .from("consumer_data_export_requests")
    .select("id,user_id,format,expires_at,status")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (requestErr || !requestRow)
    return res.status(404).json({ error: "not_found" });

  const expiresAtIso =
    typeof (requestRow as any).expires_at === "string"
      ? String((requestRow as any).expires_at)
      : "";
  if (expiresAtIso && Date.parse(expiresAtIso) <= Date.now()) {
    void supabase
      .from("consumer_data_export_requests")
      .update({ status: "expired" })
      .eq("id", (requestRow as any).id);
    return res.status(410).json({ error: "expired" });
  }

  const userId = String((requestRow as any).user_id ?? "");
  const format =
    String((requestRow as any).format ?? "json").toLowerCase() === "csv"
      ? "csv"
      : "json";

  const [userRowRes, reservationsRes, purchasesRes, eventsRes] =
    await Promise.all([
      supabase
        .from("consumer_users")
        .select("*")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("reservations")
        .select(
          "id,booking_reference,kind,establishment_id,user_id,status,starts_at,ends_at,party_size,amount_total,amount_deposit,currency,meta,created_at,payment_status,checked_in_at,updated_at,refusal_reason_code,refusal_reason_custom,is_from_waitlist",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("consumer_purchases")
        .select(
          "id,user_id,currency,total_amount,status,purchased_at,items,metadata",
        )
        .eq("user_id", userId)
        .order("purchased_at", { ascending: false })
        .limit(2000),
      supabase
        .from("consumer_user_events")
        .select("id,user_id,event_type,occurred_at,metadata")
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false })
        .limit(5000),
    ]);

  const userRow = userRowRes.error ? null : (userRowRes.data as any);
  const reservations = reservationsRes.error
    ? []
    : ((reservationsRes.data as any[]) ?? []);
  const purchases = purchasesRes.error
    ? []
    : ((purchasesRes.data as any[]) ?? []);
  const events = eventsRes.error ? [] : ((eventsRes.data as any[]) ?? []);

  void supabase
    .from("consumer_data_export_requests")
    .update({ status: "delivered", delivered_at: nowIso })
    .eq("id", (requestRow as any).id);

  if (format === "csv") {
    const rows: Array<{
      type: string;
      id: string;
      created_at: string;
      data: string;
    }> = [];

    if (userRow) {
      rows.push({
        type: "user",
        id: String(userRow.id ?? userId),
        created_at: String(userRow.updated_at ?? userRow.created_at ?? nowIso),
        data: JSON.stringify(userRow),
      });
    }

    for (const r of reservations) {
      rows.push({
        type: "reservation",
        id: String(r.id ?? ""),
        created_at: String(r.created_at ?? nowIso),
        data: JSON.stringify(r),
      });
    }

    for (const p of purchases) {
      rows.push({
        type: "purchase",
        id: String(p.id ?? ""),
        created_at: String(p.purchased_at ?? nowIso),
        data: JSON.stringify(p),
      });
    }

    for (const e of events) {
      rows.push({
        type: "event",
        id: String(e.id ?? ""),
        created_at: String(e.occurred_at ?? nowIso),
        data: JSON.stringify(e),
      });
    }

    const header = ["type", "id", "created_at", "data"].join(",");
    const body = rows
      .map((r) =>
        [
          csvEscapeCell(r.type),
          csvEscapeCell(r.id),
          csvEscapeCell(r.created_at),
          csvEscapeCell(r.data),
        ].join(","),
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sam-data-export-${userId}.csv"`,
    );
    return res.status(200).send([header, body].join("\n"));
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="sam-data-export-${userId}.json"`,
  );
  return res.status(200).json({
    generated_at: nowIso,
    user: userRow,
    reservations,
    purchases,
    events,
  });
}

type SitemapUrl = {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
  alternates?: { fr: string; en: string; xDefault: string };
};

export async function getPublicSitemapXml(req: Request, res: Response) {
  const supabase = getAdminSupabase();

  const [
    { data: establishments, error: estError },
    { data: contentPagesRaw, error: contentError },
    { data: blogArticlesRaw, error: blogError },
  ] = await Promise.all([
    supabase
      .from("establishments")
      .select("id,universe,updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(50000),
    supabase
      .from("content_pages")
      .select("slug_fr,slug_en,canonical_url_fr,canonical_url_en,updated_at")
      .eq("status", "published")
      .limit(500),
    supabase
      .from("blog_articles")
      .select("slug,updated_at")
      .eq("is_published", true)
      .limit(500),
  ]);

  const contentPages = contentError ? [] : (contentPagesRaw ?? []);
  const blogArticles = blogError ? [] : (blogArticlesRaw ?? []);
  if (contentError)
    console.error("sitemap: failed to load content_pages", contentError);
  if (blogError)
    console.error("sitemap: failed to load blog_articles", blogError);

  if (estError) return res.status(500).send("Unable to generate sitemap");

  const baseUrl = (() => {
    const host = String(req.get("host") ?? "");
    const proto = String(
      req.get("x-forwarded-proto") ?? req.protocol ?? "https",
    );
    if (!host) return "";
    return `${proto}://${host}`;
  })();

  const urls: SitemapUrl[] = [];

  // Static pages with high priority
  const staticPaths: Array<{
    path: string;
    changefreq: string;
    priority: number;
  }> = [
    { path: "/", changefreq: "daily", priority: 1.0 },
    { path: "/results", changefreq: "daily", priority: 0.9 },
    { path: "/faq", changefreq: "weekly", priority: 0.7 },
    { path: "/aide", changefreq: "weekly", priority: 0.7 },
    {
      path: "/ajouter-mon-etablissement",
      changefreq: "monthly",
      priority: 0.6,
    },
  ];

  for (const item of staticPaths) {
    urls.push({
      loc: baseUrl ? `${baseUrl}${item.path}` : item.path,
      changefreq: item.changefreq,
      priority: item.priority,
    });
  }

  // Content pages (localized slugs)
  for (const row of (contentPages ?? []) as Array<{
    slug_fr: string | null;
    slug_en: string | null;
    canonical_url_fr?: string | null;
    canonical_url_en?: string | null;
    updated_at?: string | null;
  }>) {
    const slugFr = row.slug_fr ? String(row.slug_fr) : "";
    const slugEn = row.slug_en ? String(row.slug_en) : "";
    if (!slugFr || !slugEn) continue;

    const frPath = `/content/${slugFr}`;
    const enPath = `/en/content/${slugEn}`;

    const frUrl =
      String(row.canonical_url_fr ?? "").trim() ||
      (baseUrl ? `${baseUrl}${frPath}` : frPath);
    const enUrl =
      String(row.canonical_url_en ?? "").trim() ||
      (baseUrl ? `${baseUrl}${enPath}` : enPath);

    urls.push({
      loc: frUrl,
      alternates: {
        fr: frUrl,
        en: enUrl,
        xDefault: frUrl,
      },
      lastmod: row.updated_at ? String(row.updated_at) : undefined,
      changefreq: "monthly",
      priority: 0.6,
    });
  }

  // Blog articles
  for (const row of (blogArticles ?? []) as Array<{
    slug: string | null;
    updated_at?: string | null;
  }>) {
    const slug = row.slug ? String(row.slug) : null;
    if (!slug) continue;
    urls.push({
      loc: baseUrl ? `${baseUrl}/blog/${slug}` : `/blog/${slug}`,
      lastmod: row.updated_at ? String(row.updated_at) : undefined,
      changefreq: "weekly",
      priority: 0.7,
    });
  }

  // Establishments (dynamic content)
  for (const row of (establishments ?? []) as Array<{
    id: string;
    universe: unknown;
    updated_at?: string | null;
  }>) {
    const id = String(row.id ?? "");
    if (!id) continue;
    const path = buildEstablishmentDetailsUrl(id, row.universe);
    urls.push({
      loc: baseUrl ? `${baseUrl}${path}` : path,
      lastmod: row.updated_at ? String(row.updated_at) : undefined,
      changefreq: "weekly",
      priority: 0.8,
    });
  }

  const escapeXml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls.map((u) => {
      const lastmod = u.lastmod
        ? `<lastmod>${escapeXml(new Date(u.lastmod).toISOString())}</lastmod>`
        : "";
      const changefreq = u.changefreq
        ? `<changefreq>${escapeXml(u.changefreq)}</changefreq>`
        : "";
      const priority = u.priority ? `<priority>${u.priority}</priority>` : "";

      if (!baseUrl) {
        return `<url><loc>${escapeXml(u.loc)}</loc>${lastmod}${changefreq}${priority}</url>`;
      }

      let pathname = "";
      try {
        const parsed = new URL(u.loc);
        pathname = parsed.pathname || "/";
      } catch {
        pathname = u.loc.startsWith(baseUrl)
          ? u.loc.slice(baseUrl.length)
          : u.loc;
      }

      const defaultFrUrl = `${baseUrl}${pathname}`;
      const defaultEnUrl =
        pathname === "/" ? `${baseUrl}/en/` : `${baseUrl}/en${pathname}`;
      const defaultXDefaultUrl = defaultFrUrl;

      const frUrl = u.alternates?.fr ?? defaultFrUrl;
      const enUrl = u.alternates?.en ?? defaultEnUrl;
      const xDefaultUrl = u.alternates?.xDefault ?? defaultXDefaultUrl;

      const alternates = [
        `<xhtml:link rel="alternate" hreflang="fr" href="${escapeXml(frUrl)}" />`,
        `<xhtml:link rel="alternate" hreflang="en" href="${escapeXml(enUrl)}" />`,
        `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(xDefaultUrl)}" />`,
      ].join("");

      return `<url><loc>${escapeXml(frUrl)}</loc>${alternates}${lastmod}${changefreq}${priority}</url>`;
    }),
    "</urlset>",
  ].join("");

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.status(200).send(xml);
}

export async function getPublicEstablishment(req: Request, res: Response) {
  const ref = String(req.params.ref ?? "");
  const title = typeof req.query.title === "string" ? req.query.title : null;

  const establishmentId = await resolveEstablishmentId({ ref, title });
  if (!establishmentId)
    return res.status(404).json({ error: "establishment_not_found" });

  const supabase = getAdminSupabase();

  const { data: establishment, error: estError } = await supabase
    .from("establishments")
    .select(
      "id,slug,name,universe,subcategory,city,address,postal_code,region,country,lat,lng,description_short,description_long,phone,whatsapp,website,social_links,cover_url,gallery_urls,hours,tags,amenities,extra,booking_enabled,status,menu_digital_enabled,email",
    )
    .eq("id", establishmentId)
    .maybeSingle();

  if (estError) return res.status(500).json({ error: estError.message });
  if (!establishment)
    return res.status(404).json({ error: "establishment_not_found" });

  const nowIso = new Date().toISOString();

  const [
    { data: slots, error: slotsError },
    { data: packs, error: packsError },
    { data: bookingPolicy, error: bookingPolicyError },
    { data: inventoryCategories, error: inventoryCategoriesError },
    { data: inventoryItems, error: inventoryItemsError },
  ] = await Promise.all([
    supabase
      .from("pro_slots")
      .select(
        "id,establishment_id,starts_at,ends_at,capacity,base_price,promo_type,promo_value,promo_label,service_label,active",
      )
      .eq("establishment_id", establishmentId)
      .eq("active", true)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(500),
    supabase
      .from("packs")
      .select(
        "id,establishment_id,title,description,label,items,price,original_price,is_limited,stock,availability,max_reservations,active,valid_from,valid_to,conditions",
      )
      .eq("establishment_id", establishmentId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(200),
    supabase
      .from("booking_policies")
      .select("*")
      .eq("establishment_id", establishmentId)
      .maybeSingle(),
    // Fetch inventory categories
    supabase
      .from("pro_inventory_categories")
      .select("id,title,description,parent_id,sort_order,is_active")
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(100),
    // Fetch inventory items
    supabase
      .from("pro_inventory_items")
      .select("id,category_id,title,description,base_price,currency,labels,photos,sort_order,is_active")
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(500),
  ]);

  if (slotsError) return res.status(500).json({ error: slotsError.message });
  if (packsError) return res.status(500).json({ error: packsError.message });
  if (bookingPolicyError)
    return res.status(500).json({ error: bookingPolicyError.message });
  // Note: inventory errors are non-fatal - we just won't show menu if it fails
  if (inventoryCategoriesError) console.error("[Public] Inventory categories error:", inventoryCategoriesError.message);
  if (inventoryItemsError) console.error("[Public] Inventory items error:", inventoryItemsError.message);

  // Group slots to a DateSlots format for the public booking widgets.
  const slotsArr = (slots ?? []) as Array<{
    id: string;
    starts_at: string;
    capacity: number | null;
    promo_type: string | null;
    promo_value: number | null;
    promo_label: string | null;
    service_label: string | null;
  }>;

  const usedBySlotId = new Map<string, number>();
  const usedByStartsAtIso = new Map<string, number>();

  const minStartsAt = slotsArr[0]?.starts_at ?? null;
  const maxStartsAt = slotsArr[slotsArr.length - 1]?.starts_at ?? null;

  if (slotsArr.length) {
    const slotIds = slotsArr.map((s) => s.id);

    const [{ data: bySlot }, { data: byTime }] = await Promise.all([
      supabase
        .from("reservations")
        .select("slot_id, party_size")
        .in("slot_id", slotIds)
        .in("status", OCCUPYING_RESERVATION_STATUSES as unknown as string[])
        .limit(5000),
      minStartsAt && maxStartsAt
        ? supabase
            .from("reservations")
            .select("starts_at, party_size")
            .eq("establishment_id", establishmentId)
            .is("slot_id", null)
            .in("status", ["confirmed", "pending_pro_validation", "requested"])
            .gte("starts_at", minStartsAt)
            .lte("starts_at", maxStartsAt)
            .limit(5000)
        : Promise.resolve({
            data: [] as Array<{ starts_at: string; party_size: number | null }>,
          }),
    ]);

    for (const r of (bySlot ?? []) as Array<{
      slot_id: string | null;
      party_size: number | null;
    }>) {
      const slotId = r.slot_id;
      if (!slotId) continue;
      const size =
        typeof r.party_size === "number" && Number.isFinite(r.party_size)
          ? Math.max(0, Math.round(r.party_size))
          : 0;
      usedBySlotId.set(slotId, (usedBySlotId.get(slotId) ?? 0) + size);
    }

    for (const r of (byTime ?? []) as Array<{
      starts_at: string;
      party_size: number | null;
    }>) {
      const startsAt = String(r.starts_at ?? "").trim();
      if (!startsAt) continue;
      const size =
        typeof r.party_size === "number" && Number.isFinite(r.party_size)
          ? Math.max(0, Math.round(r.party_size))
          : 0;
      usedByStartsAtIso.set(
        startsAt,
        (usedByStartsAtIso.get(startsAt) ?? 0) + size,
      );
    }
  }

  const byDate = new Map<string, PublicDateSlots>();

  for (const s of slotsArr) {
    const dt = new Date(s.starts_at);
    if (!Number.isFinite(dt.getTime())) continue;

    const date = toYmd(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()));
    const time = timeHm(dt);

    const minutes = dt.getHours() * 60 + dt.getMinutes();
    const derivedServiceLabel = getRestaurantServiceLabelFromMinutes(minutes);
    const serviceLabel =
      String(s.service_label ?? "").trim() || derivedServiceLabel;

    const dateSlot = byDate.get(date) ?? {
      date,
      services: [],
      promos: {},
      slotIds: {},
      remaining: {},
    };
    const promos = dateSlot.promos ?? {};
    const slotIds = dateSlot.slotIds ?? {};
    const remaining =
      (
        dateSlot as PublicDateSlots & {
          remaining?: Record<string, number | null>;
        }
      ).remaining ?? {};

    const promo = promoPercentFromSlot({
      promo_type: s.promo_type,
      promo_value: s.promo_value,
    });
    promos[time] = promo;
    slotIds[time] = s.id;

    const used =
      usedBySlotId.get(s.id) ?? usedByStartsAtIso.get(s.starts_at) ?? 0;
    const cap =
      typeof s.capacity === "number" && Number.isFinite(s.capacity)
        ? Math.max(0, Math.round(s.capacity))
        : null;
    remaining[time] = cap == null ? null : Math.max(0, cap - used);

    const existingService = dateSlot.services.find(
      (x) => x.service === serviceLabel,
    );
    if (existingService) {
      if (!existingService.times.includes(time))
        existingService.times.push(time);
    } else {
      dateSlot.services.push({ service: serviceLabel, times: [time] });
    }

    // Keep service time ordering
    for (const svc of dateSlot.services) {
      svc.times.sort((a, b) => a.localeCompare(b));
    }

    (
      dateSlot as PublicDateSlots & {
        remaining?: Record<string, number | null>;
      }
    ).remaining = remaining;
    byDate.set(date, dateSlot);
  }

  const availableSlots = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const normalizedPacks = ((packs ?? []) as Array<Record<string, unknown>>).map(
    (p) => {
      // Packs are stored in DB in cents, but the public consumer UI expects MAD amounts.
      // Normalize at the API boundary to avoid leaking cents into the UI.
      const priceMad = centsToMad(p.price);
      const originalMad = centsToMad(p.original_price);
      return {
        ...p,
        price: priceMad,
        original_price: originalMad,
      };
    },
  );

  // Generate slug on-the-fly if not present in database
  const estSlug = establishment.slug ?? generateEstablishmentSlug(
    establishment.name as string | null,
    establishment.city as string | null
  );

  // Generate menu digital URL if enabled
  const menuDigitalBaseUrl = process.env.MENU_DIGITAL_BASE_URL || "https://menu.sam.ma";
  const menuDigitalEnabled = Boolean((establishment as any).menu_digital_enabled);
  const menuDigitalUrl = menuDigitalEnabled && estSlug
    ? `${menuDigitalBaseUrl}/${estSlug}`
    : null;

  const establishmentWithSlug = {
    ...establishment,
    slug: estSlug,
    menu_digital_enabled: menuDigitalEnabled,
    menu_digital_url: menuDigitalUrl,
  };

  // Transform inventory into MenuCategory format for the frontend
  const menuCategories = transformInventoryToMenuCategories(
    inventoryCategories ?? [],
    inventoryItems ?? []
  );

  return res.json({
    establishment: establishmentWithSlug,
    booking_policy: bookingPolicy ?? null,
    offers: {
      slots: slotsArr,
      packs: normalizedPacks,
      availableSlots,
    },
    menu: menuCategories,
  });
}

// Helper function to transform pro_inventory data to MenuCategory format
function transformInventoryToMenuCategories(
  categories: Array<{
    id: string;
    title: string;
    description?: string | null;
    parent_id?: string | null;
    sort_order?: number;
  }>,
  items: Array<{
    id: string;
    category_id?: string | null;
    title: string;
    description?: string | null;
    base_price?: number | null;
    currency?: string | null;
    labels?: string[] | null;
    photos?: string[] | null;
    sort_order?: number;
  }>
): Array<{
  id: string;
  name: string;
  items: Array<{
    id: number;
    name: string;
    description: string;
    price: string;
    badges?: string[];
  }>;
}> {
  // Build category map
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // Group items by category
  const itemsByCategory = new Map<string, typeof items>();
  const uncategorizedItems: typeof items = [];

  for (const item of items) {
    if (item.category_id && categoryMap.has(item.category_id)) {
      const existing = itemsByCategory.get(item.category_id) ?? [];
      existing.push(item);
      itemsByCategory.set(item.category_id, existing);
    } else {
      uncategorizedItems.push(item);
    }
  }

  // Map labels to badge format
  const labelToBadge = (label: string): string | null => {
    const l = label.toLowerCase().trim();
    if (l === "best_seller" || l === "populaire") return "Best seller";
    if (l === "vegetarien" || l === "végétarien") return "Végétarien";
    if (l === "nouveau" || l === "new") return "Nouveau";
    if (l === "specialite" || l === "spécialité") return "Spécialité";
    if (l === "healthy" || l === "sain") return "Healthy";
    if (l === "rapide") return "Rapide";
    return null;
  };

  // Format price
  const formatPrice = (price: number | null | undefined, currency: string | null | undefined): string => {
    if (price == null || !Number.isFinite(price)) return "";
    const curr = currency || "MAD";
    return `${price.toFixed(0)} ${curr}`;
  };

  // Transform item to MenuSection format
  const transformItem = (item: typeof items[0], index: number) => {
    const badges = (item.labels ?? [])
      .map(labelToBadge)
      .filter((b): b is string => b !== null);

    return {
      id: index + 1,
      name: item.title,
      description: item.description ?? "",
      price: formatPrice(item.base_price, item.currency),
      badges: badges.length > 0 ? badges : undefined,
    };
  };

  // Build result - only include root categories (no parent_id)
  // For now, flatten subcategories into their parents
  const rootCategories = categories.filter((c) => !c.parent_id);
  const result: Array<{
    id: string;
    name: string;
    items: Array<{
      id: number;
      name: string;
      description: string;
      price: string;
      badges?: string[];
    }>;
  }> = [];

  for (const cat of rootCategories) {
    const catItems = itemsByCategory.get(cat.id) ?? [];

    // Also include items from subcategories
    const subcategories = categories.filter((c) => c.parent_id === cat.id);
    for (const sub of subcategories) {
      const subItems = itemsByCategory.get(sub.id) ?? [];
      catItems.push(...subItems);
    }

    if (catItems.length === 0) continue;

    result.push({
      id: cat.id,
      name: cat.title,
      items: catItems.map((item, i) => transformItem(item, i)),
    });
  }

  // Add uncategorized items if any
  if (uncategorizedItems.length > 0) {
    result.push({
      id: "uncategorized",
      name: "Autres",
      items: uncategorizedItems.map((item, i) => transformItem(item, i)),
    });
  }

  return result;
}

type PublicEstablishmentListItem = {
  id: string;
  name: string | null;
  universe: string | null;
  subcategory: string | null;
  city: string | null;
  address: string | null;
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
  // Activity/assiduity fields
  is_online?: boolean;
  activity_score?: number;
};

type PublicEstablishmentsListResponse = {
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

function normalizePublicUniverseAliases(raw: unknown): string[] {
  const u = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!u) return [];

  // The `establishments.universe` column is backed by a Postgres enum.
  // Passing unknown values (e.g. "restaurants", "hotels", "sport") triggers a 500.
  // So we map UI-friendly values to DB-safe enum values and drop anything else.
  const aliases: Record<string, string[]> = {
    restaurants: ["restaurant"],
    restaurant: ["restaurant"],

    loisirs: ["loisir"],
    loisir: ["loisir"],
    sport: ["loisir"],

    wellness: ["wellness"],

    hebergement: ["hebergement"],
    hotels: ["hebergement"],
    hotel: ["hebergement"],

    culture: ["culture"],

    // NOTE: "shopping" exists as a UI universe, but may not exist in the DB enum.
    // Returning [] means "no filter" to avoid a backend 500.
    shopping: [],
  };

  const allowed = new Set([
    "restaurant",
    "loisir",
    "hebergement",
    "wellness",
    "culture",
  ]);
  const candidates = aliases[u] ?? [u];
  const safe = candidates.filter((value) => allowed.has(value));

  // If the user asked for an unknown universe, don't filter at all.
  // This avoids breaking the whole page with a backend 500.
  return safe;
}

function maxPromoPercent(
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

export async function getPublicBillingCompanyProfile(
  _req: Request,
  res: Response,
) {
  try {
    const profile = await getBillingCompanyProfile();
    res.json({ ok: true, profile });
  } catch (e) {
    console.error("getPublicBillingCompanyProfile failed", e);
    res.status(500).json({ error: "billing_profile_unavailable" });
  }
}

export async function listPublicEstablishments(req: Request, res: Response) {
  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 24;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(60, Math.max(1, Math.floor(limitRaw)))
    : 24;

  const offsetRaw =
    typeof req.query.offset === "string" ? Number(req.query.offset) : 0;
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(0, Math.floor(offsetRaw))
    : 0;

  const q = asString(req.query.q);
  const city = asString(req.query.city);
  const category = asString(req.query.category); // Filter by subcategory/activity type
  const sortMode = asString(req.query.sort); // "best" for best results scoring

  const promoOnly =
    String(req.query.promo ?? "").trim() === "1" ||
    String(req.query.promoOnly ?? "").trim() === "1";

  const universeAliases = normalizePublicUniverseAliases(req.query.universe);
  const universeMeta = asString(req.query.universe) ?? undefined;

  const supabase = getAdminSupabase();

  // Note: verified, premium, curated, is_online, activity_score columns may not exist yet - handle gracefully
  // These will be added by migrations:
  // - 20260201_search_engine_enhancement.sql (verified, premium, curated)
  // - 20260204_pro_activity_score.sql (is_online, activity_score)
  let estQuery = supabase
    .from("establishments")
    .select(
      "id,slug,name,universe,subcategory,city,address,region,country,lat,lng,cover_url,booking_enabled,updated_at,tags,amenities,is_online,activity_score",
    )
    .eq("status", "active");

  if (universeAliases.length === 1) {
    estQuery = estQuery.eq("universe", universeAliases[0]);
  } else if (universeAliases.length > 1) {
    estQuery = estQuery.in("universe", universeAliases);
  }

  if (city) {
    // City values are usually normalized (e.g. "Marrakech"), but we keep it case-insensitive for resilience.
    estQuery = estQuery.ilike("city", city);
  }

  // If there's a search query, use the scored search function for better results
  if (q && q.length >= 2) {
    // Use the PostgreSQL search function with scoring
    const universeFilter = universeAliases.length === 1 ? universeAliases[0] : null;

    const { data: scoredResults, error: searchErr } = await supabase.rpc(
      'search_establishments_scored',
      {
        search_query: q,
        filter_universe: universeFilter,
        filter_city: city || null,
        result_limit: limit,
        result_offset: offset,
      }
    );

    if (!searchErr && scoredResults && scoredResults.length > 0) {
      // Return scored results directly
      const ids = scoredResults.map((r: any) => r.id);
      const nowIso = new Date().toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();

      const [{ data: slots }, { data: reservations }] = await Promise.all([
        ids.length
          ? supabase
              .from("pro_slots")
              .select("establishment_id,starts_at,promo_type,promo_value,active")
              .in("establishment_id", ids)
              .eq("active", true)
              .gte("starts_at", nowIso)
              .order("starts_at", { ascending: true })
              .limit(5000)
          : Promise.resolve({ data: [] as unknown[] }),
        ids.length
          ? supabase
              .from("reservations")
              .select("establishment_id,created_at,status")
              .in("establishment_id", ids)
              .gte("created_at", thirtyDaysAgo)
              .in("status", ["confirmed", "pending_pro_validation", "requested"])
              .limit(5000)
          : Promise.resolve({ data: [] as unknown[] }),
      ]);

      const nextSlotByEst = new Map<string, string>();
      const promoByEst = new Map<string, number>();
      for (const s of (slots ?? []) as Array<Record<string, unknown>>) {
        const estId = typeof s.establishment_id === "string" ? s.establishment_id : "";
        const startsAt = typeof s.starts_at === "string" ? s.starts_at : "";
        if (!estId || !startsAt) continue;
        if (!nextSlotByEst.has(estId)) nextSlotByEst.set(estId, startsAt);
        const promo = maxPromoPercent(s.promo_type, s.promo_value);
        if (promo != null) promoByEst.set(estId, Math.max(promoByEst.get(estId) ?? 0, promo));
      }

      const reservationCountByEst = new Map<string, number>();
      for (const r of (reservations ?? []) as Array<Record<string, unknown>>) {
        const estId = typeof r.establishment_id === "string" ? r.establishment_id : "";
        if (estId) reservationCountByEst.set(estId, (reservationCountByEst.get(estId) ?? 0) + 1);
      }

      // Fetch activity data for scored results
      const { data: activityData } = ids.length
        ? await supabase
            .from("establishments")
            .select("id,is_online,activity_score")
            .in("id", ids)
        : { data: [] };

      const activityByEst = new Map<string, { isOnline: boolean; activityScore: number | null }>();
      for (const a of (activityData ?? []) as Array<Record<string, unknown>>) {
        const estId = typeof a.id === "string" ? a.id : "";
        if (!estId) continue;
        activityByEst.set(estId, {
          isOnline: typeof a.is_online === "boolean" ? a.is_online : false,
          activityScore: typeof a.activity_score === "number" && Number.isFinite(a.activity_score) ? a.activity_score : null,
        });
      }

      const items: PublicEstablishmentListItem[] = scoredResults.map((e: any) => {
        const promo = promoByEst.get(e.id) ?? null;
        if (promoOnly && (!promo || promo <= 0)) return null;

        const activity = activityByEst.get(e.id);
        const isOnline = activity?.isOnline ?? false;
        const activityScore = activity?.activityScore ?? null;

        return {
          id: e.id,
          name: e.name,
          universe: e.universe,
          subcategory: e.subcategory,
          city: e.city,
          address: null,
          region: null,
          country: null,
          lat: null,
          lng: null,
          cover_url: e.cover_url,
          booking_enabled: null,
          promo_percent: promo ?? e.promo_percent ?? null,
          next_slot_at: nextSlotByEst.get(e.id) ?? null,
          reservations_30d: reservationCountByEst.get(e.id) ?? e.reservations_30d ?? 0,
          avg_rating: e.rating_avg ?? null,
          review_count: 0,
          reviews_last_30d: 0,
          verified: false,
          premium: false,
          curated: false,
          slug: generateEstablishmentSlug(e.name, e.city),
          relevance_score: e.relevance_score,
          total_score: e.total_score,
          // Activity/assiduity fields
          is_online: isOnline,
          activity_score: activityScore ?? undefined,
        };
      }).filter(Boolean);

      return res.json({
        items,
        count: items.length,
        universe: universeMeta,
        search_mode: 'scored',
      });
    }

    // Fallback to basic search if scored search fails or returns no results
    const searchTerm = `%${q}%`;
    estQuery = estQuery.or(
      `name.ilike.${searchTerm},subcategory.ilike.${searchTerm},tags.cs.{${q}}`
    );
  } else if (q) {
    // Short query (< 2 chars): use basic ilike search
    const searchTerm = `%${q}%`;
    estQuery = estQuery.or(
      `name.ilike.${searchTerm},subcategory.ilike.${searchTerm},tags.cs.{${q}}`
    );
  }

  // Filter by category/subcategory (activity type)
  if (category) {
    estQuery = estQuery.ilike("subcategory", `%${category}%`);
  }

  // Apply ordering based on sort mode
  // Note: avg_rating/review_count columns not yet created - use updated_at for now
  estQuery = estQuery
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: establishments, error: estErr } = await estQuery;
  if (estErr) return res.status(500).json({ error: estErr.message });

  const estArr = (establishments ?? []) as Array<Record<string, unknown>>;
  const ids = estArr
    .map((e) => (typeof e.id === "string" ? e.id : ""))
    .filter(Boolean);

  const nowIso = new Date().toISOString();
  const thirtyDaysAgo = new Date(
    Date.now() - 1000 * 60 * 60 * 24 * 30,
  ).toISOString();

  const [{ data: slots }, { data: reservations }] = await Promise.all([
    ids.length
      ? supabase
          .from("pro_slots")
          .select("establishment_id,starts_at,promo_type,promo_value,active")
          .in("establishment_id", ids)
          .eq("active", true)
          .gte("starts_at", nowIso)
          .order("starts_at", { ascending: true })
          .limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
    ids.length
      ? supabase
          .from("reservations")
          .select("establishment_id,created_at,status")
          .in("establishment_id", ids)
          .gte("created_at", thirtyDaysAgo)
          .in("status", ["confirmed", "pending_pro_validation", "requested"]) // ignore cancelled/no_show for "popular"
          .limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const nextSlotByEst = new Map<string, string>();
  const promoByEst = new Map<string, number>();

  for (const s of (slots ?? []) as Array<Record<string, unknown>>) {
    const establishmentId =
      typeof s.establishment_id === "string" ? s.establishment_id : "";
    const startsAt = typeof s.starts_at === "string" ? s.starts_at : "";
    if (!establishmentId || !startsAt) continue;

    if (!nextSlotByEst.has(establishmentId)) {
      nextSlotByEst.set(establishmentId, startsAt);
    }

    const promo = maxPromoPercent(s.promo_type, s.promo_value);
    if (promo != null) {
      promoByEst.set(
        establishmentId,
        Math.max(promoByEst.get(establishmentId) ?? 0, promo),
      );
    }
  }

  const reservationCountByEst = new Map<string, number>();
  for (const r of (reservations ?? []) as Array<Record<string, unknown>>) {
    const establishmentId =
      typeof r.establishment_id === "string" ? r.establishment_id : "";
    if (!establishmentId) continue;
    reservationCountByEst.set(
      establishmentId,
      (reservationCountByEst.get(establishmentId) ?? 0) + 1,
    );
  }

  // Best results scoring function: rating × sqrt(review_count) × velocity_multiplier × assiduity_factor
  // Activity/assiduity score is weighted at 30% to reward engaged establishments
  const computeBestScore = (args: {
    avgRating: number | null;
    reviewCount: number;
    reviewsLast30d: number;
    reservations30d: number;
    activityScore: number | null;
    isOnline: boolean;
  }): number => {
    const rating = args.avgRating ?? 3.0; // Default to neutral rating
    const reviewCount = Math.max(1, args.reviewCount); // Avoid division by zero
    const reviewsLast30d = args.reviewsLast30d;
    const reservations30d = args.reservations30d;
    const activityScore = args.activityScore ?? 0; // 0-100 scale
    const isOnline = args.isOnline;

    // Velocity multiplier: boost for recent activity
    // If reviewsLast30d is high relative to total reviews, it means momentum
    const velocityRatio = reviewCount > 0 ? reviewsLast30d / Math.sqrt(reviewCount) : 0;
    const velocityMultiplier = 1 + Math.min(velocityRatio, 2); // Cap at 3x

    // Base score: rating × sqrt(review_count) gives diminishing returns for more reviews
    const baseScore = rating * Math.sqrt(reviewCount);

    // Add reservation activity as a bonus
    const reservationBonus = Math.sqrt(reservations30d) * 0.5;

    // Assiduity factor: 0.7 to 1.3 range based on activity_score (0-100)
    // Score of 0 → factor of 0.7 (30% penalty)
    // Score of 50 → factor of 1.0 (neutral)
    // Score of 100 → factor of 1.3 (30% boost)
    const assiduityFactor = 0.7 + (activityScore / 100) * 0.6;

    // Online bonus: currently online establishments get a small visibility boost
    const onlineBonus = isOnline ? 2.0 : 0;

    return (baseScore * velocityMultiplier + reservationBonus) * assiduityFactor + onlineBonus;
  };

  const items: PublicEstablishmentListItem[] = estArr
    .map((e) => {
      const id = typeof e.id === "string" ? e.id : "";
      if (!id) return null;

      const promo = promoByEst.get(id) ?? null;
      if (promoOnly && (!promo || promo <= 0)) return null;

      const avgRating = typeof e.avg_rating === "number" && Number.isFinite(e.avg_rating) ? e.avg_rating : null;
      const reviewCount = typeof e.review_count === "number" && Number.isFinite(e.review_count) ? e.review_count : 0;
      const reviewsLast30d = typeof e.reviews_last_30d === "number" && Number.isFinite(e.reviews_last_30d) ? e.reviews_last_30d : 0;
      const reservations30d = reservationCountByEst.get(id) ?? 0;
      // Activity/assiduity fields - may not exist until migration 20260204_pro_activity_score.sql is run
      const isOnline = typeof e.is_online === "boolean" ? e.is_online : false;
      const activityScore = typeof e.activity_score === "number" && Number.isFinite(e.activity_score) ? e.activity_score : null;

      const item: PublicEstablishmentListItem = {
        id,
        name: typeof e.name === "string" ? e.name : null,
        universe: typeof e.universe === "string" ? e.universe : null,
        subcategory: typeof e.subcategory === "string" ? e.subcategory : null,
        city: typeof e.city === "string" ? e.city : null,
        address: typeof e.address === "string" ? e.address : null,
        region: typeof e.region === "string" ? e.region : null,
        country: typeof e.country === "string" ? e.country : null,
        lat: typeof e.lat === "number" && Number.isFinite(e.lat) ? e.lat : null,
        lng: typeof e.lng === "number" && Number.isFinite(e.lng) ? e.lng : null,
        cover_url: typeof e.cover_url === "string" ? e.cover_url : null,
        booking_enabled:
          typeof e.booking_enabled === "boolean" ? e.booking_enabled : null,
        promo_percent: promo,
        next_slot_at: nextSlotByEst.get(id) ?? null,
        reservations_30d: reservations30d,
        avg_rating: avgRating,
        review_count: reviewCount,
        reviews_last_30d: reviewsLast30d,
        // These columns may not exist yet - default to false until migration is run
        verified: typeof e.verified === "boolean" ? e.verified : false,
        premium: typeof e.premium === "boolean" ? e.premium : false,
        curated: typeof e.curated === "boolean" ? e.curated : false,
        // Activity/assiduity fields
        is_online: isOnline,
        activity_score: activityScore ?? undefined,
      };

      // Compute best score if sorting by best
      if (sortMode === "best") {
        item.best_score = computeBestScore({
          avgRating,
          reviewCount,
          reviewsLast30d,
          reservations30d,
          activityScore,
          isOnline,
        });
      }

      return item;
    })
    .filter(Boolean) as PublicEstablishmentListItem[];

  // Sort by best_score if sort=best
  if (sortMode === "best") {
    items.sort((a, b) => (b.best_score ?? 0) - (a.best_score ?? 0));
  }

  const payload: PublicEstablishmentsListResponse = {
    ok: true,
    items,
    meta: {
      limit,
      offset,
      ...(universeMeta ? { universe: universeMeta } : {}),
      ...(city ? { city } : {}),
      ...(q ? { q } : {}),
      ...(promoOnly ? { promoOnly: true } : {}),
    },
  };

  return res.json(payload);
}

// ============================================
// SEARCH AUTOCOMPLETE API
// ============================================

type AutocompleteSuggestion = {
  id: string;
  term: string;
  category: "establishment" | "cuisine" | "dish" | "tag" | "city" | "activity" | "accommodation" | "hashtag";
  displayLabel: string;
  iconName: string | null;
  universe: string | null;
  extra?: {
    establishmentId?: string;
    coverUrl?: string;
    city?: string;
    usageCount?: number;
  };
};

type AutocompleteResponse = {
  ok: true;
  suggestions: AutocompleteSuggestion[];
  query: string;
};

export async function searchAutocomplete(req: Request, res: Response) {
  const q = asString(req.query.q);
  const rawUniverse = asString(req.query.universe);
  const limitParam = asInt(req.query.limit);
  const limit = Math.min(Math.max(limitParam ?? 10, 1), 20);

  // Normalize universe: "restaurants" -> "restaurant", etc.
  const universeMap: Record<string, string> = {
    restaurants: "restaurant",
    sport: "wellness",
    sport_bien_etre: "wellness",
    hebergement: "hebergement",
    loisirs: "loisir",
    culture: "culture",
  };
  const universe = rawUniverse ? (universeMap[rawUniverse] ?? rawUniverse) : null;

  if (!q || q.length < 2) {
    return res.json({ ok: true, suggestions: [], query: q ?? "" });
  }

  const supabase = getAdminSupabase();
  const suggestions: AutocompleteSuggestion[] = [];
  const searchTerm = q.toLowerCase().trim();

  // 1. Search establishments by name (highest priority)
  const { data: establishments } = await supabase
    .from("establishments")
    .select("id,name,universe,city,cover_url")
    .eq("status", "active")
    .ilike("name", `%${searchTerm}%`)
    .limit(5);

  if (establishments) {
    for (const est of establishments as Array<Record<string, unknown>>) {
      if (!universe || est.universe === universe) {
        suggestions.push({
          id: `est-${est.id}`,
          term: String(est.name ?? ""),
          category: "establishment",
          displayLabel: String(est.name ?? ""),
          iconName: "building",
          universe: typeof est.universe === "string" ? est.universe : null,
          extra: {
            establishmentId: String(est.id),
            coverUrl: typeof est.cover_url === "string" ? est.cover_url : undefined,
            city: typeof est.city === "string" ? est.city : undefined,
          },
        });
      }
    }
  }

  // 2. Search in search_suggestions table (if it exists)
  try {
    let suggQuery = supabase
      .from("search_suggestions")
      .select("id,term,category,display_label,icon_name,universe")
      .eq("is_active", true)
      .ilike("term", `%${searchTerm}%`)
      .limit(10);

    if (universe) {
      // Filter by universe or null (applies to all)
      suggQuery = suggQuery.or(`universe.eq.${universe},universe.is.null`);
    }

    const { data: searchSuggestions } = await suggQuery;

    if (searchSuggestions) {
      for (const sugg of searchSuggestions as Array<Record<string, unknown>>) {
        const cat = String(sugg.category ?? "tag");
        suggestions.push({
          id: String(sugg.id),
          term: String(sugg.term ?? ""),
          category: cat as AutocompleteSuggestion["category"],
          displayLabel: String(sugg.display_label ?? sugg.term ?? ""),
          iconName: typeof sugg.icon_name === "string" ? sugg.icon_name : null,
          universe: typeof sugg.universe === "string" ? sugg.universe : null,
        });
      }
    }
  } catch {
    // search_suggestions table may not exist yet - continue without it
  }

  // 3. Search cities (from establishments or home_cities)
  if (suggestions.filter((s) => s.category === "city").length === 0) {
    const { data: cities } = await supabase
      .from("home_cities")
      .select("id,name,slug")
      .eq("is_active", true)
      .ilike("name", `%${searchTerm}%`)
      .limit(5);

    if (cities) {
      for (const city of cities as Array<Record<string, unknown>>) {
        suggestions.push({
          id: `city-${city.id}`,
          term: String(city.name ?? ""),
          category: "city",
          displayLabel: String(city.name ?? ""),
          iconName: "map-pin",
          universe: null,
        });
      }
    }
  }

  // 4. Fallback: search distinct tags from establishments
  if (suggestions.length < limit) {
    try {
      const { data: tagResults } = await supabase
        .rpc("search_establishment_tags", { search_term: searchTerm })
        .limit(5);

      if (tagResults) {
        for (const tag of tagResults as Array<{ tag: string }>) {
          if (!suggestions.some((s) => s.term.toLowerCase() === tag.tag.toLowerCase())) {
            suggestions.push({
              id: `tag-${tag.tag}`,
              term: tag.tag,
              category: "tag",
              displayLabel: tag.tag,
              iconName: "tag",
              universe: null,
            });
          }
        }
      }
    } catch {
      // RPC may not exist - continue
    }
  }

  // 5. Search hashtags from video descriptions (with usage count)
  // Only search if query starts with # or looks like a hashtag term
  const isHashtagSearch = searchTerm.startsWith("#") || searchTerm.startsWith("%23");
  const hashtagSearchTerm = searchTerm.replace(/^#/, "").replace(/^%23/, "");

  if (hashtagSearchTerm.length >= 1) {
    try {
      const { data: hashtagResults } = await supabase
        .rpc("search_hashtags", { search_term: hashtagSearchTerm })
        .limit(5);

      if (hashtagResults) {
        for (const ht of hashtagResults as Array<{ hashtag: string; usage_count: number }>) {
          const hashtagTerm = `#${ht.hashtag}`;
          if (!suggestions.some((s) => s.term.toLowerCase() === hashtagTerm.toLowerCase())) {
            suggestions.push({
              id: `hashtag-${ht.hashtag}`,
              term: hashtagTerm,
              category: "hashtag",
              displayLabel: `${hashtagTerm} (${ht.usage_count})`,
              iconName: "hash",
              universe: null,
              extra: {
                usageCount: ht.usage_count,
              },
            });
          }
        }
      }
    } catch {
      // RPC may not exist - continue without hashtag search
    }
  }

  // Remove duplicates and limit results
  const seen = new Set<string>();
  const uniqueSuggestions = suggestions.filter((s) => {
    const key = `${s.category}-${s.term.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort: establishments first, then by category
  // Hashtags are sorted by usage count (higher = more relevant)
  const categoryOrder: Record<string, number> = {
    establishment: 0,
    cuisine: 1,
    dish: 2,
    activity: 3,
    hashtag: 4,
    tag: 5,
    city: 6,
    accommodation: 7,
  };

  uniqueSuggestions.sort((a, b) => {
    const orderA = categoryOrder[a.category] ?? 99;
    const orderB = categoryOrder[b.category] ?? 99;
    return orderA - orderB;
  });

  return res.json({
    ok: true,
    suggestions: uniqueSuggestions.slice(0, limit),
    query: q,
  } as AutocompleteResponse);
}

// ============================================
// POPULAR SEARCHES API (for empty state)
// ============================================
export async function getPopularSearches(req: Request, res: Response) {
  const rawUniverse = asString(req.query.universe);
  const city = asString(req.query.city);
  const limit = Math.min(Math.max(asInt(req.query.limit) ?? 10, 1), 20);

  // Normalize universe: "restaurants" -> "restaurant", etc.
  const universeMap: Record<string, string> = {
    restaurants: "restaurant",
    sport: "wellness",
    sport_bien_etre: "wellness",
    hebergement: "hebergement",
    loisirs: "loisir",
    culture: "culture",
    shopping: "shopping",
    rentacar: "rentacar",
  };
  const universe = rawUniverse ? (universeMap[rawUniverse] ?? rawUniverse) : null;

  const supabase = getAdminSupabase();

  // Try to get from search_suggestions - prioritize universe-specific suggestions
  try {
    if (universe) {
      // First, get suggestions specific to this universe
      const { data: universeSpecific } = await supabase
        .from("search_suggestions")
        .select("term,category,display_label,icon_name,universe,search_count")
        .eq("is_active", true)
        .eq("universe", universe)
        .order("search_count", { ascending: false })
        .limit(limit);

      // If we have enough universe-specific suggestions, return them
      if (universeSpecific && universeSpecific.length >= limit) {
        return res.json({
          ok: true,
          searches: (universeSpecific as Array<Record<string, unknown>>).map((s) => ({
            term: String(s.term ?? ""),
            category: String(s.category ?? "tag"),
            displayLabel: String(s.display_label ?? s.term ?? ""),
            iconName: typeof s.icon_name === "string" ? s.icon_name : null,
          })),
        });
      }

      // If we have some universe-specific suggestions but not enough, complement with generic ones
      if (universeSpecific && universeSpecific.length > 0) {
        const remaining = limit - universeSpecific.length;
        const existingTerms = universeSpecific.map((s) => String(s.term));

        const { data: genericSuggestions } = await supabase
          .from("search_suggestions")
          .select("term,category,display_label,icon_name,universe,search_count")
          .eq("is_active", true)
          .is("universe", null)
          .not("term", "in", `(${existingTerms.map(t => `"${t}"`).join(",")})`)
          .order("search_count", { ascending: false })
          .limit(remaining);

        const combined = [...universeSpecific, ...(genericSuggestions || [])];
        return res.json({
          ok: true,
          searches: (combined as Array<Record<string, unknown>>).map((s) => ({
            term: String(s.term ?? ""),
            category: String(s.category ?? "tag"),
            displayLabel: String(s.display_label ?? s.term ?? ""),
            iconName: typeof s.icon_name === "string" ? s.icon_name : null,
          })),
        });
      }

      // If universe is specified but no universe-specific suggestions found, skip DB and use hardcoded fallbacks
      // This ensures each universe gets relevant suggestions
    }

    // Only use generic DB suggestions when NO universe is specified
    if (!universe) {
      const { data } = await supabase
        .from("search_suggestions")
        .select("term,category,display_label,icon_name,universe,search_count")
        .eq("is_active", true)
        .order("search_count", { ascending: false })
        .limit(limit);

      if (data && data.length > 0) {
        return res.json({
          ok: true,
          searches: (data as Array<Record<string, unknown>>).map((s) => ({
            term: String(s.term ?? ""),
            category: String(s.category ?? "tag"),
            displayLabel: String(s.display_label ?? s.term ?? ""),
            iconName: typeof s.icon_name === "string" ? s.icon_name : null,
          })),
        });
      }
    }
  } catch {
    // Table may not exist
  }

  // Fallback: return hardcoded popular searches per universe
  const fallbackSearches = universe === "restaurant"
    ? [
        // Cuisines
        { term: "marocain", category: "cuisine", displayLabel: "Cuisine Marocaine", iconName: "utensils" },
        { term: "japonais", category: "cuisine", displayLabel: "Japonais", iconName: "utensils" },
        { term: "italien", category: "cuisine", displayLabel: "Italien", iconName: "utensils" },
        { term: "libanais", category: "cuisine", displayLabel: "Libanais", iconName: "utensils" },
        // Plats
        { term: "sushi", category: "dish", displayLabel: "Sushi", iconName: "utensils" },
        { term: "tajine", category: "dish", displayLabel: "Tajine", iconName: "utensils" },
        { term: "brunch", category: "dish", displayLabel: "Brunch", iconName: "coffee" },
        { term: "pizza", category: "dish", displayLabel: "Pizza", iconName: "utensils" },
        // Tags/ambiances
        { term: "terrasse", category: "tag", displayLabel: "Terrasse", iconName: "sun" },
        { term: "romantique", category: "tag", displayLabel: "Romantique", iconName: "heart" },
        { term: "rooftop", category: "tag", displayLabel: "Rooftop", iconName: "building" },
        { term: "vue mer", category: "tag", displayLabel: "Vue Mer", iconName: "waves" },
      ]
    : universe === "hebergement"
    ? [
        // Types d'hébergement
        { term: "riad", category: "accommodation", displayLabel: "Riad", iconName: "home" },
        { term: "hotel", category: "accommodation", displayLabel: "Hôtel", iconName: "building" },
        { term: "villa", category: "accommodation", displayLabel: "Villa", iconName: "home" },
        { term: "appartement", category: "accommodation", displayLabel: "Appartement", iconName: "building" },
        // Équipements/Tags
        { term: "piscine", category: "tag", displayLabel: "Piscine", iconName: "waves" },
        { term: "spa", category: "tag", displayLabel: "Spa", iconName: "sparkles" },
        { term: "vue mer", category: "tag", displayLabel: "Vue Mer", iconName: "waves" },
        { term: "luxe", category: "tag", displayLabel: "Luxe", iconName: "star" },
        { term: "jacuzzi", category: "tag", displayLabel: "Jacuzzi", iconName: "waves" },
        { term: "petit dejeuner", category: "tag", displayLabel: "Petit-déjeuner inclus", iconName: "coffee" },
      ]
    : universe === "wellness"
    ? [
        // Types de soins
        { term: "spa", category: "activity", displayLabel: "Spa", iconName: "sparkles" },
        { term: "hammam", category: "activity", displayLabel: "Hammam", iconName: "droplet" },
        { term: "massage", category: "activity", displayLabel: "Massage", iconName: "hand" },
        { term: "coiffeur", category: "activity", displayLabel: "Coiffeur", iconName: "scissors" },
        { term: "esthetique", category: "activity", displayLabel: "Esthétique", iconName: "sparkles" },
        // Tags
        { term: "detente", category: "tag", displayLabel: "Détente", iconName: "heart" },
        { term: "soins visage", category: "tag", displayLabel: "Soins Visage", iconName: "sparkles" },
        { term: "manucure", category: "tag", displayLabel: "Manucure", iconName: "hand" },
      ]
    : universe === "loisir"
    ? [
        // Types d'activités
        { term: "escape game", category: "activity", displayLabel: "Escape Game", iconName: "puzzle" },
        { term: "karting", category: "activity", displayLabel: "Karting", iconName: "car" },
        { term: "bowling", category: "activity", displayLabel: "Bowling", iconName: "target" },
        { term: "paintball", category: "activity", displayLabel: "Paintball", iconName: "target" },
        { term: "quad", category: "activity", displayLabel: "Quad", iconName: "car" },
        { term: "jet ski", category: "activity", displayLabel: "Jet Ski", iconName: "waves" },
        // Tags
        { term: "famille", category: "tag", displayLabel: "En Famille", iconName: "users" },
        { term: "entre amis", category: "tag", displayLabel: "Entre Amis", iconName: "users" },
        { term: "enfants", category: "tag", displayLabel: "Pour Enfants", iconName: "baby" },
        { term: "plein air", category: "tag", displayLabel: "Plein Air", iconName: "sun" },
      ]
    : universe === "culture"
    ? [
        // Types de lieux/activités
        { term: "musee", category: "activity", displayLabel: "Musée", iconName: "building" },
        { term: "cinema", category: "activity", displayLabel: "Cinéma", iconName: "film" },
        { term: "theatre", category: "activity", displayLabel: "Théâtre", iconName: "drama" },
        { term: "galerie", category: "activity", displayLabel: "Galerie d'Art", iconName: "image" },
        { term: "concert", category: "activity", displayLabel: "Concert", iconName: "music" },
        // Tags
        { term: "exposition", category: "tag", displayLabel: "Exposition", iconName: "image" },
        { term: "histoire", category: "tag", displayLabel: "Histoire", iconName: "book" },
        { term: "art contemporain", category: "tag", displayLabel: "Art Contemporain", iconName: "palette" },
      ]
    : universe === "shopping"
    ? [
        // Types de commerces
        { term: "centre commercial", category: "activity", displayLabel: "Centre Commercial", iconName: "shopping-bag" },
        { term: "souk", category: "activity", displayLabel: "Souk", iconName: "store" },
        { term: "boutique", category: "activity", displayLabel: "Boutique", iconName: "shirt" },
        { term: "artisanat", category: "activity", displayLabel: "Artisanat", iconName: "hand" },
        { term: "bijouterie", category: "activity", displayLabel: "Bijouterie", iconName: "gem" },
        // Tags
        { term: "mode", category: "tag", displayLabel: "Mode", iconName: "shirt" },
        { term: "decoration", category: "tag", displayLabel: "Décoration", iconName: "home" },
        { term: "luxe", category: "tag", displayLabel: "Luxe", iconName: "star" },
      ]
    : universe === "rentacar"
    ? [
        // Types de véhicules
        { term: "voiture", category: "activity", displayLabel: "Voiture", iconName: "car" },
        { term: "4x4", category: "activity", displayLabel: "4x4 / SUV", iconName: "car" },
        { term: "moto", category: "activity", displayLabel: "Moto / Scooter", iconName: "bike" },
        { term: "minibus", category: "activity", displayLabel: "Minibus", iconName: "bus" },
        { term: "luxe", category: "activity", displayLabel: "Véhicule de Luxe", iconName: "car" },
        // Tags
        { term: "avec chauffeur", category: "tag", displayLabel: "Avec Chauffeur", iconName: "user" },
        { term: "aeroport", category: "tag", displayLabel: "Aéroport", iconName: "plane" },
        { term: "longue duree", category: "tag", displayLabel: "Longue Durée", iconName: "calendar" },
      ]
    : [
        // Default fallback (tous univers)
        { term: "spa", category: "activity", displayLabel: "Spa", iconName: "sparkles" },
        { term: "restaurant", category: "cuisine", displayLabel: "Restaurant", iconName: "utensils" },
        { term: "escape game", category: "activity", displayLabel: "Escape Game", iconName: "puzzle" },
        { term: "famille", category: "tag", displayLabel: "En Famille", iconName: "users" },
        { term: "terrasse", category: "tag", displayLabel: "Terrasse", iconName: "sun" },
        { term: "romantique", category: "tag", displayLabel: "Romantique", iconName: "heart" },
      ];

  return res.json({
    ok: true,
    searches: fallbackSearches.slice(0, limit),
  });
}

type PublicHomeFeedItem = PublicEstablishmentListItem & {
  distance_km?: number | null;
  curated?: boolean;
  score?: number;
};

type PublicHomeFeedResponse = {
  ok: true;
  lists: {
    best_deals: PublicHomeFeedItem[];
    selected_for_you: PublicHomeFeedItem[];
    near_you: PublicHomeFeedItem[];
    most_booked: PublicHomeFeedItem[];
  };
  meta: {
    universe?: string;
    city?: string;
    lat?: number;
    lng?: number;
    sessionId?: string;
    favoriteCount?: number;
  };
};

function parseFloatSafe(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// ============================================
// PUBLIC CATEGORIES (Level 2)
// ============================================
export async function getPublicCategories(req: Request, res: Response) {
  const universe = asString(req.query.universe);

  const supabase = getAdminSupabase();

  let query = supabase
    .from("categories")
    .select("id,universe_slug,slug,name_fr,name_en,description_fr,description_en,icon_name,image_url,display_order,requires_booking,supports_packs")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name_fr", { ascending: true });

  if (universe) {
    query = query.eq("universe_slug", universe);
  }

  const { data, error } = await query.limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    ok: true,
    items: (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ""),
      slug: String(row.slug ?? ""),
      universe: String(row.universe_slug ?? ""),
      nameFr: String(row.name_fr ?? ""),
      nameEn: String(row.name_en ?? ""),
      descriptionFr: row.description_fr ? String(row.description_fr) : null,
      descriptionEn: row.description_en ? String(row.description_en) : null,
      iconName: row.icon_name ? String(row.icon_name) : null,
      imageUrl: row.image_url ? String(row.image_url) : null,
      requiresBooking: Boolean(row.requires_booking),
      supportsPacks: Boolean(row.supports_packs),
    })),
  });
}

// ============================================
// PUBLIC CATEGORY IMAGES (Subcategories - Level 3)
// ============================================
export async function getPublicCategoryImages(req: Request, res: Response) {
  const universe = asString(req.query.universe);

  const supabase = getAdminSupabase();

  // Use basic columns only (category_slug may not exist if migration wasn't run)
  let query = supabase
    .from("category_images")
    .select("category_id,name,image_url,universe,display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (universe) {
    query = query.eq("universe", universe);
  }

  const { data, error } = await query.limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    ok: true,
    items: (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.category_id ?? ""),
      name: String(row.name ?? ""),
      imageUrl: String(row.image_url ?? ""),
      universe: String(row.universe ?? ""),
      categorySlug: null,
    })),
  });
}

function hasFiniteCoords(
  lat: number | null,
  lng: number | null,
): lat is number {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng)
  );
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const q =
    s1 * s1 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      s2 *
      s2;
  return 2 * R * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function normalizeKind(
  raw: unknown,
): "best_deals" | "selected_for_you" | "near_you" | "most_booked" | null {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!v) return null;
  if (v === "best_deals") return "best_deals";
  if (v === "selected_for_you") return "selected_for_you";
  if (v === "near_you") return "near_you";
  if (v === "most_booked") return "most_booked";
  return null;
}

function sameText(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const aa = (a ?? "").trim().toLowerCase();
  const bb = (b ?? "").trim().toLowerCase();
  if (!aa || !bb) return false;
  return aa === bb;
}

export async function getPublicHomeFeed(req: Request, res: Response) {
  const city = asString(req.query.city);
  const lat = parseFloatSafe(req.query.lat);
  const lng = parseFloatSafe(req.query.lng);

  const requestedUniverse = asString(req.query.universe) ?? undefined;
  const universeAliases = normalizePublicUniverseAliases(req.query.universe);

  const sessionIdRaw = asString(req.query.sessionId ?? req.query.session_id);
  const sessionId = sessionIdRaw && isUuid(sessionIdRaw) ? sessionIdRaw : null;

  const favoritesRaw = asString(req.query.favorites);
  const favoriteIds = new Set(
    (favoritesRaw ? favoritesRaw.split(",") : [])
      .map((v) => v.trim())
      .filter((v) => v && isUuid(v))
      .slice(0, 50),
  );

  const supabase = getAdminSupabase();

  // Universe values in DB are enum-backed. For curation we store the DB-safe universe.
  const curationUniverse =
    universeAliases.length === 1 ? universeAliases[0] : null;

  // 1) candidates
  let estQuery = supabase
    .from("establishments")
    .select(
      "id,slug,name,universe,subcategory,city,address,region,country,lat,lng,cover_url,booking_enabled,updated_at",
    )
    .eq("status", "active");

  if (universeAliases.length === 1) {
    estQuery = estQuery.eq("universe", universeAliases[0]);
  } else if (universeAliases.length > 1) {
    estQuery = estQuery.in("universe", universeAliases);
  }

  if (city) {
    estQuery = estQuery.ilike("city", city);
  }

  estQuery = estQuery.order("updated_at", { ascending: false }).range(0, 199);

  const { data: establishments, error: estErr } = await estQuery;
  if (estErr) return res.status(500).json({ error: estErr.message });

  const estArr = (establishments ?? []) as Array<Record<string, unknown>>;
  const ids = estArr
    .map((e) => (typeof e.id === "string" ? e.id : ""))
    .filter(Boolean);

  const nowIso = new Date().toISOString();
  const thirtyDaysAgo = new Date(
    Date.now() - 1000 * 60 * 60 * 24 * 30,
  ).toISOString();

  const [{ data: slots }, { data: reservations }] = await Promise.all([
    ids.length
      ? supabase
          .from("pro_slots")
          .select("establishment_id,starts_at,promo_type,promo_value,active")
          .in("establishment_id", ids)
          .eq("active", true)
          .gte("starts_at", nowIso)
          .order("starts_at", { ascending: true })
          .limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
    ids.length
      ? supabase
          .from("reservations")
          .select("establishment_id,created_at,status")
          .in("establishment_id", ids)
          .gte("created_at", thirtyDaysAgo)
          .in("status", OCCUPYING_RESERVATION_STATUSES as unknown as string[])
          .limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const nextSlotByEst = new Map<string, string>();
  const promoByEst = new Map<string, number>();

  for (const s of (slots ?? []) as Array<Record<string, unknown>>) {
    const establishmentId =
      typeof s.establishment_id === "string" ? s.establishment_id : "";
    const startsAt = typeof s.starts_at === "string" ? s.starts_at : "";
    if (!establishmentId || !startsAt) continue;

    if (!nextSlotByEst.has(establishmentId)) {
      nextSlotByEst.set(establishmentId, startsAt);
    }

    const promo = maxPromoPercent(s.promo_type, s.promo_value);
    if (promo != null) {
      promoByEst.set(
        establishmentId,
        Math.max(promoByEst.get(establishmentId) ?? 0, promo),
      );
    }
  }

  const reservationCountByEst = new Map<string, number>();
  for (const r of (reservations ?? []) as Array<Record<string, unknown>>) {
    const establishmentId =
      typeof r.establishment_id === "string" ? r.establishment_id : "";
    if (!establishmentId) continue;
    reservationCountByEst.set(
      establishmentId,
      (reservationCountByEst.get(establishmentId) ?? 0) + 1,
    );
  }

  const candidateItems: PublicHomeFeedItem[] = estArr
    .map((e) => {
      const id = typeof e.id === "string" ? e.id : "";
      if (!id) return null;

      const promo = promoByEst.get(id) ?? null;

      const latVal =
        typeof e.lat === "number" && Number.isFinite(e.lat) ? e.lat : null;
      const lngVal =
        typeof e.lng === "number" && Number.isFinite(e.lng) ? e.lng : null;

      const distance =
        lat != null && lng != null && hasFiniteCoords(latVal, lngVal)
          ? haversineKm({ lat, lng }, { lat: latVal, lng: lngVal })
          : null;

      return {
        id,
        name: typeof e.name === "string" ? e.name : null,
        universe: typeof e.universe === "string" ? e.universe : null,
        subcategory: typeof e.subcategory === "string" ? e.subcategory : null,
        city: typeof e.city === "string" ? e.city : null,
        address: typeof e.address === "string" ? e.address : null,
        region: typeof e.region === "string" ? e.region : null,
        country: typeof e.country === "string" ? e.country : null,
        lat: latVal,
        lng: lngVal,
        cover_url: typeof e.cover_url === "string" ? e.cover_url : null,
        booking_enabled:
          typeof e.booking_enabled === "boolean" ? e.booking_enabled : null,
        promo_percent: promo,
        next_slot_at: nextSlotByEst.get(id) ?? null,
        reservations_30d: reservationCountByEst.get(id) ?? 0,
        distance_km:
          distance != null && Number.isFinite(distance)
            ? Math.max(0, distance)
            : null,
      };
    })
    .filter(Boolean) as PublicHomeFeedItem[];

  const candidateById = new Map(candidateItems.map((i) => [i.id, i] as const));

  // 2) personalization signals from session visits
  const preferredSubcategories = new Set<string>();
  if (sessionId) {
    const { data: visits } = await supabase
      .from("establishment_visits")
      .select("establishment_id,visited_at")
      .eq("session_id", sessionId)
      .gte("visited_at", thirtyDaysAgo)
      .order("visited_at", { ascending: false })
      .limit(200);

    const visitedIds = Array.from(
      new Set(
        ((visits as Array<{ establishment_id: string }> | null) ?? [])
          .map((v) => v.establishment_id)
          .filter(isUuid),
      ),
    ).slice(0, 50);

    if (visitedIds.length) {
      const { data: visitedEsts } = await supabase
        .from("establishments")
        .select("id,universe,subcategory,status")
        .in("id", visitedIds)
        .eq("status", "active")
        .limit(200);

      for (const row of (visitedEsts ?? []) as Array<Record<string, unknown>>) {
        const sub =
          typeof row.subcategory === "string" ? row.subcategory.trim() : "";
        if (!sub) continue;

        // If we have a selected universe, prefer signals coming from the same universe.
        if (
          curationUniverse &&
          typeof row.universe === "string" &&
          row.universe !== curationUniverse
        )
          continue;

        preferredSubcategories.add(sub);
      }
    }
  }

  const scoreItem = (item: PublicHomeFeedItem): number => {
    let score = 0;

    const promo =
      typeof item.promo_percent === "number" &&
      Number.isFinite(item.promo_percent)
        ? item.promo_percent
        : 0;
    const reservations =
      typeof item.reservations_30d === "number" &&
      Number.isFinite(item.reservations_30d)
        ? item.reservations_30d
        : 0;

    score += reservations * 2;
    score += promo * 3;

    if (item.next_slot_at) score += 25;
    if (item.booking_enabled) score += 10;
    if (item.cover_url) score += 3;
    if (item.lat != null && item.lng != null) score += 2;

    if (item.subcategory && preferredSubcategories.has(item.subcategory))
      score += 18;
    if (favoriteIds.has(item.id)) score += 50;

    return score;
  };

  // 3) admin curation overlay
  const curatedByKind = new Map<
    "best_deals" | "selected_for_you" | "near_you" | "most_booked",
    string[]
  >();
  if (curationUniverse) {
    const { data: curations } = await supabase
      .from("home_curation_items")
      .select("kind,establishment_id,weight,city,starts_at,ends_at")
      .eq("universe", curationUniverse)
      .limit(200);

    const nowTs = Date.now();
    const active = (
      (curations as Array<Record<string, unknown>> | null) ?? []
    ).filter((row) => {
      const kind = normalizeKind(row.kind);
      if (!kind) return false;

      const rowCity = typeof row.city === "string" ? row.city : null;
      if (city) {
        if (rowCity && !sameText(rowCity, city)) return false;
      } else {
        // If no city filter, only keep global curations.
        if (rowCity) return false;
      }

      const startsAt =
        typeof row.starts_at === "string" ? Date.parse(row.starts_at) : NaN;
      const endsAt =
        typeof row.ends_at === "string" ? Date.parse(row.ends_at) : NaN;

      if (Number.isFinite(startsAt) && startsAt > nowTs) return false;
      if (Number.isFinite(endsAt) && endsAt < nowTs) return false;

      return true;
    });

    const byKind = new Map<string, Array<{ id: string; weight: number }>>();
    for (const row of active) {
      const kind = normalizeKind(row.kind);
      const estId =
        typeof row.establishment_id === "string" ? row.establishment_id : "";
      if (!kind || !estId || !isUuid(estId)) continue;
      const weight =
        typeof row.weight === "number" && Number.isFinite(row.weight)
          ? row.weight
          : 100;
      const bucket = byKind.get(kind) ?? [];
      bucket.push({ id: estId, weight });
      byKind.set(kind, bucket);
    }

    (
      Array.from(byKind.entries()) as Array<
        [string, Array<{ id: string; weight: number }>]
      >
    ).forEach(([kind, arr]) => {
      arr.sort((a, b) => b.weight - a.weight);
      curatedByKind.set(
        kind as any,
        arr.map((x) => x.id),
      );
    });
  }

  const withCuratedFirst = (
    kind: "best_deals" | "selected_for_you" | "near_you" | "most_booked",
    base: PublicHomeFeedItem[],
  ): PublicHomeFeedItem[] => {
    const curatedIds = curatedByKind.get(kind) ?? [];
    const curated: PublicHomeFeedItem[] = curatedIds
      .map((id) => candidateById.get(id))
      .filter(Boolean)
      .map((item) => ({ ...item, curated: true }));

    if (!curatedIds.length) return base;

    const curatedSet = new Set(curatedIds);
    return [...curated, ...base.filter((i) => !curatedSet.has(i.id))];
  };

  // 4) build lists
  const bestDealsBase = [...candidateItems]
    .filter(
      (i) =>
        typeof i.promo_percent === "number" &&
        Number.isFinite(i.promo_percent) &&
        (i.promo_percent ?? 0) > 0,
    )
    .sort((a, b) => {
      const ap = a.promo_percent ?? 0;
      const bp = b.promo_percent ?? 0;
      if (bp !== ap) return bp - ap;

      const at = a.next_slot_at ? Date.parse(a.next_slot_at) : Infinity;
      const bt = b.next_slot_at ? Date.parse(b.next_slot_at) : Infinity;
      if (at !== bt) return at - bt;

      return (b.reservations_30d ?? 0) - (a.reservations_30d ?? 0);
    });

  const mostBookedBase = [...candidateItems].sort(
    (a, b) => (b.reservations_30d ?? 0) - (a.reservations_30d ?? 0),
  );

  const nearBase =
    lat != null && lng != null
      ? [...candidateItems]
          .filter(
            (i) =>
              typeof i.distance_km === "number" &&
              Number.isFinite(i.distance_km),
          )
          .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))
      : [...candidateItems].sort((a, b) => {
          const at = a.next_slot_at ? Date.parse(a.next_slot_at) : Infinity;
          const bt = b.next_slot_at ? Date.parse(b.next_slot_at) : Infinity;
          if (at !== bt) return at - bt;
          return (b.reservations_30d ?? 0) - (a.reservations_30d ?? 0);
        });

  const selectedBase = [...candidateItems]
    .map((i) => {
      const score = scoreItem(i);
      return { ...i, score };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const bestDeals = withCuratedFirst("best_deals", bestDealsBase);
  const selectedForYou = withCuratedFirst("selected_for_you", selectedBase);
  const nearYou = withCuratedFirst("near_you", nearBase);
  const mostBooked = withCuratedFirst("most_booked", mostBookedBase);

  const used = new Set<string>();
  const takeUnique = (
    items: PublicHomeFeedItem[],
    limit: number,
  ): PublicHomeFeedItem[] => {
    const out: PublicHomeFeedItem[] = [];
    for (const item of items) {
      if (out.length >= limit) break;
      if (used.has(item.id)) continue;
      used.add(item.id);
      out.push(item);
    }
    return out;
  };

  const lists = {
    best_deals: takeUnique(bestDeals, 12),
    selected_for_you: takeUnique(selectedForYou, 12),
    near_you: takeUnique(nearYou, 12),
    most_booked: takeUnique(mostBooked, 12),
  };

  const payload: PublicHomeFeedResponse = {
    ok: true,
    lists,
    meta: {
      ...(requestedUniverse ? { universe: requestedUniverse } : {}),
      ...(city ? { city } : {}),
      ...(lat != null ? { lat } : {}),
      ...(lng != null ? { lng } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(favoriteIds.size ? { favoriteCount: favoriteIds.size } : {}),
    },
  };

  return res.json(payload);
}

function isDemoRoutesAllowed(): boolean {
  // Defense-in-depth: even if a demo route gets registered by mistake, it should be a no-op in production.
  if (process.env.NODE_ENV === "production") return false;
  return String(process.env.ALLOW_DEMO_ROUTES ?? "").toLowerCase() === "true";
}

export async function ensureConsumerDemoAccount(_req: Request, res: Response) {
  if (!isDemoRoutesAllowed())
    return res.status(404).json({ error: "not_found" });

  const email = String(process.env.DEMO_CONSUMER_EMAIL ?? "")
    .trim()
    .toLowerCase();
  const password = String(process.env.DEMO_CONSUMER_PASSWORD ?? "").trim();

  if (!email || !email.includes("@") || !password) {
    return res.status(500).json({ error: "demo_not_configured" });
  }

  const supabase = getAdminSupabase();

  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) return res.status(500).json({ error: listErr.message });

  const existing = (list.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email,
  );

  if (!existing?.id) {
    const { data: created, error: createErr } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createErr || !created.user) {
      return res
        .status(500)
        .json({
          error: createErr?.message ?? "Impossible de créer le compte démo",
        });
    }
  }

  return res.json({ ok: true });
}

function isVisitSessionId(v: string): boolean {
  return isUuid(v);
}

export async function trackPublicEstablishmentVisit(
  req: Request,
  res: Response,
) {
  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  if (!establishmentId || !isUuid(establishmentId))
    return res.status(400).json({ error: "invalid_establishment" });

  const body = asRecord(req.body) ?? {};
  const session_id =
    asString(body.session_id) ?? asString(body.sessionId) ?? null;
  const path = asString(body.path) ?? null;

  if (!session_id || !isVisitSessionId(session_id)) {
    // Do not error hard: tracking should never block UX.
    return res.status(200).json({ ok: true, skipped: true });
  }

  const safePath = path ? path.slice(0, 500) : null;

  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from("establishment_visits").insert({
      establishment_id: establishmentId,
      session_id,
      path: safePath,
    });

    if (error) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    return res.status(200).json({ ok: true });
  } catch {
    return res.status(200).json({ ok: true, skipped: true });
  }
}

function normalizeCampaignEventType(
  value: unknown,
): "impression" | "click" | "reservation" | "pack" | null {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (v === "impression" || v === "impressions" || v === "view")
    return "impression";
  if (v === "click" || v === "clic" || v === "clicks") return "click";
  if (v === "reservation" || v === "booking" || v === "conversion_reservation")
    return "reservation";
  if (v === "pack" || v === "packs" || v === "conversion_pack") return "pack";
  return null;
}

function safeJsonMeta(value: unknown): Record<string, unknown> {
  const rec = asRecord(value);
  if (!rec) return {};
  // Keep payload reasonably small
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (Object.keys(out).length >= 40) break;
    const key = k.slice(0, 60);
    if (typeof v === "string") out[key] = v.slice(0, 500);
    else if (typeof v === "number" || typeof v === "boolean" || v === null)
      out[key] = v;
  }
  return out;
}

export async function trackPublicCampaignEvent(req: Request, res: Response) {
  const campaignId =
    typeof req.params.campaignId === "string" ? req.params.campaignId : "";
  if (!campaignId || !isUuid(campaignId)) {
    // Do not error hard: tracking should never block UX.
    return res.status(200).json({ ok: true, skipped: true });
  }

  const body = asRecord(req.body) ?? {};
  const event_type = normalizeCampaignEventType(
    body.event_type ?? body.eventType ?? body.type,
  );
  const session_id_raw =
    asString(body.session_id) ?? asString(body.sessionId) ?? null;
  const session_id =
    session_id_raw && isUuid(session_id_raw) ? session_id_raw : null;

  if (!event_type) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const nowIso = new Date().toISOString();

  try {
    const supabase = getAdminSupabase();

    const { data: campaign, error: campaignErr } = await supabase
      .from("pro_campaigns")
      .select("*")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignErr || !campaign) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const status =
      typeof (campaign as any).status === "string"
        ? String((campaign as any).status)
            .trim()
            .toLowerCase()
        : "";
    const startsAtIso =
      typeof (campaign as any).starts_at === "string"
        ? String((campaign as any).starts_at)
        : null;
    const endsAtIso =
      typeof (campaign as any).ends_at === "string"
        ? String((campaign as any).ends_at)
        : null;

    const startsMs = startsAtIso ? Date.parse(startsAtIso) : null;
    const endsMs = endsAtIso ? Date.parse(endsAtIso) : null;
    const nowMs = Date.now();

    // Respect scheduling windows
    if (startsMs != null && Number.isFinite(startsMs) && nowMs < startsMs) {
      return res.status(200).json({ ok: true, skipped: true });
    }
    if (endsMs != null && Number.isFinite(endsMs) && nowMs > endsMs) {
      // Best effort auto-end
      await supabase
        .from("pro_campaigns")
        .update({ status: "ended", updated_at: nowIso })
        .eq("id", campaignId);
      return res.status(200).json({ ok: true, skipped: true });
    }

    // Only active campaigns are billed/tracked
    if (status !== "active") {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const budget = asInt((campaign as any).budget) ?? 0;
    const spent = asInt((campaign as any).spent_cents) ?? 0;
    const remaining =
      asInt((campaign as any).remaining_cents) ?? Math.max(0, budget - spent);

    const billingModel =
      typeof (campaign as any).billing_model === "string"
        ? String((campaign as any).billing_model)
            .trim()
            .toLowerCase()
        : "cpc";
    const cpcCents = asInt((campaign as any).cpc_cents) ?? 200; // 2 MAD
    const cpmCents = asInt((campaign as any).cpm_cents) ?? 2000; // 20 MAD / 1000

    const isBillableImpression =
      billingModel === "cpm" && event_type === "impression";
    const isBillableClick = billingModel === "cpc" && event_type === "click";

    const cost_cents = isBillableClick
      ? cpcCents
      : isBillableImpression
        ? Math.max(0, Math.round(cpmCents / 1000))
        : 0;

    if (cost_cents > 0 && remaining <= 0) {
      await supabase
        .from("pro_campaigns")
        .update({ status: "ended", updated_at: nowIso })
        .eq("id", campaignId);
      return res.status(200).json({ ok: true, skipped: true });
    }

    const meta = {
      ...safeJsonMeta(body.meta),
      ...(typeof req.headers["user-agent"] === "string"
        ? { user_agent: String(req.headers["user-agent"]).slice(0, 300) }
        : {}),
      ...(typeof req.headers.referer === "string"
        ? { referrer: String(req.headers.referer).slice(0, 500) }
        : {}),
    };

    // Insert raw event first (dedupe can happen here)
    const { error: eventErr } = await supabase
      .from("pro_campaign_events")
      .insert({
        campaign_id: campaignId,
        establishment_id: (campaign as any).establishment_id ?? null,
        session_id,
        event_type,
        cost_cents,
        meta,
      });

    if (eventErr) {
      // Duplicate or transient failure: do not block UX.
      return res.status(200).json({ ok: true, skipped: true });
    }

    const incImpressions = event_type === "impression" ? 1 : 0;
    const incClicks = event_type === "click" ? 1 : 0;
    const incReservations = event_type === "reservation" ? 1 : 0;
    const incPacks = event_type === "pack" ? 1 : 0;

    const nextImpressions =
      (asInt((campaign as any).impressions) ?? 0) + incImpressions;
    const nextClicks = (asInt((campaign as any).clicks) ?? 0) + incClicks;
    const nextReservations =
      (asInt((campaign as any).reservations_count) ?? 0) + incReservations;
    const nextPacks = (asInt((campaign as any).packs_count) ?? 0) + incPacks;

    const nextSpent = spent + cost_cents;
    const nextRemaining = Math.max(0, budget - nextSpent);

    const prevMetrics = asRecord((campaign as any).metrics) ?? {};
    const nextMetrics = {
      ...prevMetrics,
      last_event_at: nowIso,
      billing_model: billingModel,
    };

    const patch: Record<string, unknown> = {
      impressions: nextImpressions,
      clicks: nextClicks,
      reservations_count: nextReservations,
      packs_count: nextPacks,
      spent_cents: nextSpent,
      remaining_cents: nextRemaining,
      metrics: nextMetrics,
      updated_at: nowIso,
    };

    if (nextRemaining <= 0 && budget > 0 && cost_cents > 0) {
      patch.status = "ended";
    }

    const { error: updErr } = await supabase
      .from("pro_campaigns")
      .update(patch)
      .eq("id", campaignId);
    if (updErr) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    return res.status(200).json({ ok: true });
  } catch {
    return res.status(200).json({ ok: true, skipped: true });
  }
}

type LatLng = { lat: number; lng: number };

type GeocodeCacheEntry = { coords: LatLng | null; expiresAt: number };
const GEOCODE_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const geocodeCache = new Map<string, GeocodeCacheEntry>();
const geocodeInFlight = new Map<string, Promise<LatLng | null>>();
let lastNominatimFetchAt = 0;

function parseCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

async function geocodeWithNominatim(
  query: string,
  signal?: AbortSignal,
): Promise<LatLng | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;

  // Nominatim usage policy asks for <= 1 req/sec.
  const now = Date.now();
  const elapsed = now - lastNominatimFetchAt;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }

  lastNominatimFetchAt = Date.now();

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      // Nominatim discourages direct browser usage; adding a server-side UA helps with compliance.
      "User-Agent": "sortiaumaroc-web/1.0 (contact: contact@sortiaumaroc.com)",
    },
    signal,
  });

  if (!res.ok) return null;

  const data: unknown = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0] as { lat?: unknown; lon?: unknown };
  const lat = parseCoord(first.lat);
  const lng = parseCoord(first.lon);
  if (lat == null || lng == null) return null;

  return { lat, lng };
}

export async function geocodePublic(req: Request, res: Response) {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) return res.status(200).json({ coords: null });
  if (q.length > 200) return res.status(400).json({ error: "query_too_long" });

  const key = q.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached && cached.expiresAt > Date.now())
    return res.status(200).json({ coords: cached.coords });

  const inFlight = geocodeInFlight.get(key);
  if (inFlight) {
    const coords = await inFlight;
    return res.status(200).json({ coords });
  }

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  const promise = geocodeWithNominatim(q, controller.signal)
    .then((coords) => {
      geocodeCache.set(key, {
        coords,
        expiresAt: Date.now() + GEOCODE_CACHE_TTL_MS,
      });
      return coords;
    })
    .catch(() => {
      geocodeCache.set(key, {
        coords: null,
        expiresAt: Date.now() + 1000 * 60,
      });
      return null;
    })
    .finally(() => {
      geocodeInFlight.delete(key);
    });

  geocodeInFlight.set(key, promise);

  const coords = await promise;
  return res.status(200).json({ coords });
}

export async function createConsumerReservation(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const body = asRecord(req.body) ?? {};

  const establishmentId =
    asString(body.establishment_id) ?? asString(body.establishmentId);
  const bookingReference =
    asString(body.booking_reference) ?? asString(body.bookingReference);
  const startsAt = asString(body.starts_at) ?? asString(body.startsAt);
  const slotId = asString(body.slot_id) ?? asString(body.slotId);

  const kind = asString(body.kind) ?? "restaurant";
  const statusInput = asString(body.status) ?? "requested";

  // payment_status is server-managed (webhook/admin). Consumers cannot create a paid reservation.
  let paymentStatus = "pending";

  // Backward compatible mapping: old clients send status="requested" for non-guaranteed.
  let status =
    statusInput === "requested" ? "pending_pro_validation" : statusInput;

  const partySize =
    typeof body.party_size === "number"
      ? Math.round(body.party_size)
      : typeof body.partySize === "number"
        ? Math.round(body.partySize)
        : null;

  // SECURITY: Store client-provided amounts for reference only, but recalculate server-side
  const clientAmountTotal =
    typeof body.amount_total === "number"
      ? Math.round(body.amount_total)
      : typeof body.amountTotal === "number"
        ? Math.round(body.amountTotal)
        : null;
  const clientAmountDeposit =
    typeof body.amount_deposit === "number"
      ? Math.round(body.amount_deposit)
      : typeof body.amountDeposit === "number"
        ? Math.round(body.amountDeposit)
        : null;

  // CRITICAL SECURITY: Amounts will be recalculated from slot base_price after slot validation
  // These will be overwritten with server-calculated values
  let amountTotal: number | null = null;
  let amountDeposit: number | null = null;

  // Enforce: a guaranteed reservation (deposit > 0) cannot be confirmed until payment is validated.
  if (
    (amountDeposit ?? 0) > 0 &&
    paymentStatus !== "paid" &&
    status === "confirmed"
  ) {
    status = "pending_pro_validation";
  }

  const meta = asRecord(body.meta) ?? {};

  if (!establishmentId || !isUuid(establishmentId))
    return res.status(400).json({ error: "invalid_establishment_id" });
  if (!startsAt) return res.status(400).json({ error: "missing_starts_at" });

  const startsAtDate = new Date(startsAt);
  if (!Number.isFinite(startsAtDate.getTime()))
    return res.status(400).json({ error: "invalid_starts_at" });

  // SECURITY: Prevent booking dates in the past
  // Allow a small tolerance (5 minutes) for clock skew and network latency
  const PAST_DATE_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  if (startsAtDate.getTime() < now - PAST_DATE_TOLERANCE_MS) {
    console.warn(
      "[CreateReservation] SECURITY: Attempt to create reservation in the past",
      "startsAt:", startsAt,
      "now:", new Date(now).toISOString(),
      "userId:", userResult?.userId
    );
    return res.status(400).json({ error: "reservation_date_in_past" });
  }

  // SECURITY: Prevent booking too far in the future (max 1 year)
  const MAX_FUTURE_DAYS = 365;
  const maxFutureDate = now + MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000;
  if (startsAtDate.getTime() > maxFutureDate) {
    return res.status(400).json({ error: "reservation_date_too_far_future" });
  }

  let startsAtIso = startsAtDate.toISOString();
  let endsAtIso: string | null = null;

  const supabase = getAdminSupabase();

  let waitlistAuto = false;

  // Deep business rule: prevent duplicate active bookings for the same slot by the same user.
  if (slotId && isUuid(slotId) && !bookingReference) {
    const { data: dup } = await supabase
      .from("reservations")
      .select("id,status")
      .eq("user_id", userResult.userId)
      .eq("slot_id", slotId)
      .in("status", [
        "confirmed",
        "pending_pro_validation",
        "requested",
        "waitlist",
      ])
      .limit(1)
      .maybeSingle();

    if ((dup as any)?.id) {
      return res.status(409).json({ error: "duplicate_slot_booking" });
    }
  }

  // Safety net: if the slot is already full, store the request as waitlist.
  // This protects against race conditions and direct URL manipulation.
  if (slotId && isUuid(slotId) && status !== "waitlist") {
    const { data: slot, error: slotErr } = await supabase
      .from("pro_slots")
      .select("id,capacity,starts_at,ends_at,base_price")
      .eq("id", slotId)
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    if (slotErr) return res.status(500).json({ error: slotErr.message });
    if (!slot) return res.status(400).json({ error: "slot_not_found" });

    const slotStartsRaw =
      typeof (slot as any).starts_at === "string"
        ? String((slot as any).starts_at).trim()
        : "";
    const slotStarts = slotStartsRaw ? new Date(slotStartsRaw) : null;
    if (!slotStarts || !Number.isFinite(slotStarts.getTime()))
      return res.status(400).json({ error: "slot_starts_at_invalid" });

    const slotStartsIso = slotStarts.toISOString();
    if (slotStartsIso !== startsAtIso)
      return res.status(400).json({ error: "slot_starts_at_mismatch" });

    const slotEndsRaw =
      typeof (slot as any).ends_at === "string"
        ? String((slot as any).ends_at).trim()
        : "";
    const slotEnds = slotEndsRaw ? new Date(slotEndsRaw) : null;
    endsAtIso =
      slotEnds && Number.isFinite(slotEnds.getTime())
        ? slotEnds.toISOString()
        : null;

    // Deep business rule: prevent the same user from booking overlapping slots.
    // (Minimal server-side guard; UI can still show availability, but server is authoritative.)
    try {
      const assumedEndIso =
        endsAtIso ||
        new Date(
          new Date(startsAtIso).getTime() + 2 * 60 * 60 * 1000,
        ).toISOString();
      const windowStartIso = new Date(
        new Date(startsAtIso).getTime() - 6 * 60 * 60 * 1000,
      ).toISOString();
      const windowEndIso = new Date(
        new Date(assumedEndIso).getTime() + 6 * 60 * 60 * 1000,
      ).toISOString();

      const { data: nearby } = await supabase
        .from("reservations")
        .select("id,starts_at,ends_at,status,establishment_id")
        .eq("user_id", userResult.userId)
        .in("status", [
          "confirmed",
          "pending_pro_validation",
          "requested",
          "waitlist",
        ])
        .gte("starts_at", windowStartIso)
        .lt("starts_at", windowEndIso)
        .limit(200);

      const aStart = new Date(startsAtIso).getTime();
      const aEnd = new Date(assumedEndIso).getTime();

      for (const r of (nearby ?? []) as any[]) {
        const rid = typeof r?.id === "string" ? r.id : "";
        if (!rid) continue;

        const bStartIso = typeof r?.starts_at === "string" ? r.starts_at : "";
        if (!bStartIso) continue;
        const bStart = new Date(bStartIso).getTime();
        if (!Number.isFinite(bStart)) continue;

        const bEndIso = typeof r?.ends_at === "string" ? r.ends_at : "";
        const bEnd = bEndIso
          ? new Date(bEndIso).getTime()
          : bStart + 2 * 60 * 60 * 1000;

        const overlaps = aStart < bEnd && bStart < aEnd;
        if (!overlaps) continue;

        return res.status(409).json({ error: "overlapping_reservation" });
      }
    } catch {
      // ignore
    }

    // Deep business rule: waitlist has priority over direct bookings.
    // If there are active waitlist entries on the slot, new requests go to waitlist (even if capacity exists).
    const { data: hasQueue, error: queueErr } = await supabase
      .from("waitlist_entries")
      .select("id,status")
      .eq("slot_id", slotId)
      .in("status", Array.from(ACTIVE_WAITLIST_ENTRY_STATUS_SET))
      .limit(1)
      .maybeSingle();

    if (queueErr) return res.status(500).json({ error: queueErr.message });

    if ((hasQueue as any)?.id) {
      status = "waitlist";
      paymentStatus = "pending";
      waitlistAuto = true;
    }

    const cap =
      typeof (slot as any).capacity === "number" &&
      Number.isFinite((slot as any).capacity)
        ? Math.max(0, Math.round((slot as any).capacity))
        : null;

    if (cap != null && status !== "waitlist") {
      const { data: existingForSlot } = await supabase
        .from("reservations")
        .select("party_size")
        .eq("slot_id", slotId)
        .in("status", OCCUPYING_RESERVATION_STATUSES as unknown as string[])
        .limit(5000);

      let used = 0;
      for (const r of (existingForSlot ?? []) as Array<{
        party_size: number | null;
      }>) {
        const size =
          typeof r.party_size === "number" && Number.isFinite(r.party_size)
            ? Math.max(0, Math.round(r.party_size))
            : 0;
        used += size;
      }

      const remaining = Math.max(0, cap - used);
      const requestedSize =
        typeof partySize === "number" && Number.isFinite(partySize)
          ? Math.max(1, Math.round(partySize))
          : 1;

      if (remaining <= 0 || requestedSize > remaining) {
        status = "waitlist";
        paymentStatus = "pending";
        waitlistAuto = true;
      }
    }

    // SECURITY: Recalculate price from slot base_price (NEVER trust client-provided amounts)
    const slotBasePrice = typeof (slot as any).base_price === "number" && Number.isFinite((slot as any).base_price)
      ? Math.max(0, Math.round((slot as any).base_price))
      : null;

    if (slotBasePrice !== null && slotBasePrice > 0) {
      const effectivePartySize = typeof partySize === "number" && Number.isFinite(partySize)
        ? Math.max(1, Math.round(partySize))
        : 1;
      // Price is in centimes (base_price is stored in centimes)
      // Total = base_price * party_size
      // Deposit = total (100% deposit for guaranteed reservations)
      amountTotal = slotBasePrice * effectivePartySize;
      amountDeposit = amountTotal; // Default: full amount as deposit

      // Log if client-provided amounts differ significantly (potential manipulation attempt)
      if (clientAmountTotal !== null && Math.abs(clientAmountTotal - amountTotal) > 100) {
        console.warn(
          "[CreateReservation] SECURITY: Client amount mismatch - client:",
          clientAmountTotal,
          "server calculated:",
          amountTotal,
          "slotId:",
          slotId
        );
      }
    }
  }

  // Upsert on booking_reference when provided (idempotent on refresh / double submits)
  const payloadMeta: Record<string, unknown> = {
    ...meta,
    source: "user",
    is_from_waitlist: status === "waitlist" ? true : undefined,
    waitlist_auto: waitlistAuto ? true : undefined,
    // Store client-provided amounts for audit trail (NEVER use these for actual billing)
    client_amount_total: clientAmountTotal,
    client_amount_deposit: clientAmountDeposit,
    amount_calculated_server_side: amountTotal !== null,
  };

  // ---------------------------------------------------------------------------
  // BOOKING SOURCE TRACKING (Direct Link vs Platform)
  // ---------------------------------------------------------------------------
  // Determine if this reservation comes from a direct link (book.sam.ma/:username)
  // or from the platform (sam.ma). Direct link reservations are NOT commissioned.
  const bookingSourceInfo = determineBookingSource(req, establishmentId);

  const payload: Record<string, unknown> = {
    kind,
    establishment_id: establishmentId,
    user_id: userResult.userId,
    status,
    payment_status: paymentStatus,
    starts_at: startsAtIso,
    ends_at: endsAtIso,
    party_size: partySize,
    amount_total: amountTotal,
    amount_deposit: amountDeposit,
    currency: "MAD",
    meta: payloadMeta,
    // Booking source tracking (direct_link = no commission, platform = commission)
    booking_source: bookingSourceInfo.bookingSource,
    referral_slug: bookingSourceInfo.referralSlug,
    source_url: bookingSourceInfo.sourceUrl,
  };

  if (slotId && isUuid(slotId)) payload.slot_id = slotId;

  if (status === "waitlist") {
    payload.is_from_waitlist = true;
    // Waitlist requests should never be marked as paid.
    payload.payment_status = "pending";
  }

  if (bookingReference) payload.booking_reference = bookingReference;

  // If booking_reference is present, try update first, else insert.
  if (bookingReference) {
    const { data: existing } = await supabase
      .from("reservations")
      .select("id,booking_reference")
      .eq("booking_reference", bookingReference)
      .maybeSingle();

    if (existing?.id) {
      const { data: updated, error: updErr } = await supabase
        .from("reservations")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();

      if (updErr) return res.status(500).json({ error: updErr.message });

      try {
        const nextPaymentStatus = String(
          (updated as any)?.payment_status ?? payload.payment_status ?? "",
        ).toLowerCase();
        const rid = String((updated as any)?.id ?? "");
        if (rid && nextPaymentStatus === "paid") {
          await ensureEscrowHoldForReservation({
            reservationId: rid,
            actor: { userId: userResult.userId, role: "user" },
          });
        }
      } catch (e) {
        console.error(
          "finance pipeline failed (public.createReservation update)",
          e,
        );
      }

      return res.json({ reservation: updated });
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("reservations")
    .insert(payload)
    .select("*")
    .maybeSingle();
  if (insErr) return res.status(500).json({ error: insErr.message });

  try {
    const nextPaymentStatus = String(
      (inserted as any)?.payment_status ?? payload.payment_status ?? "",
    ).toLowerCase();
    const rid = String((inserted as any)?.id ?? "");
    if (rid && nextPaymentStatus === "paid") {
      await ensureEscrowHoldForReservation({
        reservationId: rid,
        actor: { userId: userResult.userId, role: "user" },
      });
    }
  } catch (e) {
    console.error(
      "finance pipeline failed (public.createReservation insert)",
      e,
    );
  }

  try {
    const notifyProMembers = async (args: {
      title: string;
      body: string;
      category: string;
      data?: Record<string, unknown>;
    }) => {
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
        category: args.category,
        title: args.title,
        body: args.body,
        data: args.data ?? {},
      }));

      if (!out.length) return;
      await supabase.from("pro_notifications").insert(out);
    };

    const rid = String((inserted as any)?.id ?? "");
    if (rid) {
      const br = String(
        (inserted as any)?.booking_reference ?? bookingReference ?? rid,
      );
      const starts = String((inserted as any)?.starts_at ?? startsAtIso);
      const startsLabel = starts ? formatLeJjMmAaAHeure(starts) : "";
      const party =
        typeof (inserted as any)?.party_size === "number"
          ? Math.max(1, Math.round((inserted as any).party_size))
          : partySize;
      const statusSaved = String((inserted as any)?.status ?? status);

      const title =
        statusSaved === "waitlist"
          ? "Nouvelle demande (liste d’attente)"
          : "Nouvelle réservation";
      const bodyText = `Réservation ${br}${startsLabel ? ` · ${startsLabel}` : ""}${party ? ` · ${party} pers.` : ""}`;

      await notifyProMembers({
        category: "booking",
        title,
        body: bodyText,
        data: { reservationId: rid, action: "new_reservation" },
      });

      void emitAdminNotification({
        type:
          statusSaved === "waitlist" ? "waitlist_request" : "new_reservation",
        title,
        body: bodyText,
        data: {
          reservationId: rid,
          establishmentId,
          bookingReference: br,
          startsAt: starts,
          partySize: party ?? null,
        },
      });

      // Inform consumer (best-effort)
      try {
        await emitConsumerUserEvent({
          supabase,
          userId: userResult.userId,
          eventType:
            statusSaved === "waitlist"
              ? NotificationEventType.booking_waitlisted
              : NotificationEventType.booking_created,
          metadata: {
            reservationId: rid,
            establishmentId,
            bookingReference: br || undefined,
            startsAt: starts || undefined,
            status: statusSaved,
            source: "user",
          },
        });
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore (best-effort)
  }

  // Emails transactionnels (best-effort)
  void (async () => {
    try {
      const rid = String((inserted as any)?.id ?? "");
      if (!rid) return;

      const statusSaved = String((inserted as any)?.status ?? "");
      const bookingRef = String(
        (inserted as any)?.booking_reference ?? bookingReference ?? rid,
      );
      const starts = String((inserted as any)?.starts_at ?? startsAtIso);

      const amount =
        typeof (inserted as any)?.amount_total === "number" &&
        Number.isFinite((inserted as any).amount_total)
          ? `${Math.round((inserted as any).amount_total)} MAD`
          : "";

      const { data: estRow } = await supabase
        .from("establishments")
        .select("name")
        .eq("id", establishmentId)
        .maybeSingle();
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

      const baseUrl =
        asString(process.env.PUBLIC_BASE_URL) || "https://sortiraumaroc.ma";
      const consumerCtaUrl = `${baseUrl}/profile/bookings/${encodeURIComponent(rid)}`;

      if (consumerEmail) {
        await sendTemplateEmail({
          templateKey: "user_booking_confirmed",
          lang: "fr",
          fromKey: "noreply",
          to: [consumerEmail],
          variables: {
            user_name: consumerName || "",
            booking_ref: bookingRef,
            date: starts,
            amount,
            establishment: establishmentName,
            cta_url: consumerCtaUrl,
          },
          ctaUrl: consumerCtaUrl,
          meta: {
            source: "public.createConsumerReservation",
            reservation_id: rid,
            status: statusSaved,
          },
        });
      }

      // Notify PRO members by email (best-effort)
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

      if (!userIds.length) return;

      const wanted = new Set(userIds);
      const emails: string[] = [];
      for (let page = 1; page <= 20; page++) {
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

      if (!emails.length) return;

      const proCtaUrl = `${baseUrl}/pro?tab=reservations`;

      await sendTemplateEmail({
        templateKey: "pro_new_booking",
        lang: "fr",
        fromKey: "pro",
        to: Array.from(new Set(emails)).slice(0, 50),
        variables: {
          user_name: consumerName || "Client",
          booking_ref: bookingRef,
          date: starts,
          amount,
          establishment: establishmentName,
          cta_url: proCtaUrl,
        },
        ctaUrl: proCtaUrl,
        meta: {
          source: "public.createConsumerReservation",
          reservation_id: rid,
          establishment_id: establishmentId,
        },
      });
    } catch {
      // ignore
    }
  })();

  return res.json({ reservation: inserted });
}

export async function listConsumerReservations(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  let data: unknown[] | null = null;

  try {
    const { data: rows, error } = await withTimeout(
      supabase
        .from("reservations")
        .select(
          "id,booking_reference,kind,establishment_id,user_id,status,starts_at,ends_at,party_size,amount_total,amount_deposit,currency,payment_status,checked_in_at,refusal_reason_code,refusal_reason_custom,is_from_waitlist,slot_id,meta,created_at,updated_at,establishments(name,city,address,phone)",
        )
        .eq("user_id", userResult.userId)
        .order("starts_at", { ascending: false })
        .limit(200),
      8000,
    );

    if (error) {
      console.error("public.listConsumerReservations supabase error", error);
      return res.status(500).json({ error: "db_error" });
    }

    data = (rows ?? []) as unknown[];
  } catch (e) {
    console.error("public.listConsumerReservations failed", e);
    return res
      .status(isTimeoutError(e) ? 504 : 503)
      .json({ error: isTimeoutError(e) ? "timeout" : "service_unavailable" });
  }

  const reservations = (data ?? []) as any[];

  // NEW: auto-promotion waitlist logic
  // Attach waitlist offer state (if any) so the consumer UI can show Accept/Refuse buttons.
  try {
    const reservationIds = reservations
      .map((r) => String(r?.id ?? ""))
      .filter(Boolean);
    if (reservationIds.length) {
      const { data: waitlistRows, error: waitlistErr } = await withTimeout(
        supabase
          .from("waitlist_entries")
          .select(
            "id,reservation_id,slot_id,status,position,offer_sent_at,offer_expires_at,created_at,updated_at",
          )
          .in("reservation_id", reservationIds)
          .limit(5000),
        6000,
      );

      if (waitlistErr) throw waitlistErr;

      const byReservationId = new Map<string, any>();
      for (const row of (waitlistRows ?? []) as any[]) {
        const rid = String(row?.reservation_id ?? "");
        if (!rid) continue;
        byReservationId.set(rid, row);
      }

      for (const r of reservations) {
        const rid = String(r?.id ?? "");
        (r as any).waitlist_offer = rid
          ? (byReservationId.get(rid) ?? null)
          : null;
      }
    }
  } catch {
    // Best-effort: ignore
  }

  return res.json({ ok: true, reservations });
}

function isOfferExpiredByIso(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return true;
  return ts < Date.now();
}

type WaitlistEntryRow = {
  id: string;
  reservation_id: string;
  slot_id: string | null;
  user_id: string;
  status: string;
  position: number | null;
  offer_sent_at: string | null;
  offer_expires_at: string | null;
  created_at: string;
  updated_at: string;
  meta?: unknown;
};

async function expireWaitlistEntryBestEffort(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  entry: WaitlistEntryRow;
  actorRole: string;
  actorUserId: string | null;
  reason: string;
}): Promise<void> {
  try {
    if (!args.entry?.id) return;
    if (args.entry.status !== "offer_sent") return;
    if (!isOfferExpiredByIso(args.entry.offer_expires_at)) return;

    const nowIso = new Date().toISOString();

    await args.supabase
      .from("waitlist_entries")
      .update({
        status: "offer_expired",
        offer_expires_at: null,
        updated_at: nowIso,
      })
      .eq("id", args.entry.id);

    await args.supabase.from("waitlist_events").insert({
      waitlist_entry_id: args.entry.id,
      reservation_id: args.entry.reservation_id,
      establishment_id: null,
      slot_id: args.entry.slot_id,
      user_id: args.entry.user_id,
      event_type: "waitlist_offer_expired",
      actor_role: args.actorRole,
      actor_user_id: args.actorUserId,
      metadata: {
        reason: args.reason,
        offer_expires_at: args.entry.offer_expires_at,
      },
    });

    await args.supabase.from("system_logs").insert({
      actor_user_id: args.actorUserId,
      actor_role: args.actorRole,
      action: "waitlist.offer_expired",
      entity_type: "waitlist_entry",
      entity_id: args.entry.id,
      payload: {
        reservation_id: args.entry.reservation_id,
        slot_id: args.entry.slot_id,
        offer_expires_at: args.entry.offer_expires_at,
        reason: args.reason,
      },
    });

    if (args.entry.slot_id) {
      void triggerWaitlistPromotionForSlot({
        supabase: args.supabase as any,
        slotId: args.entry.slot_id,
        actorRole: args.actorRole,
        actorUserId: args.actorUserId,
        reason: "offer_expired_lazy_check",
      });
    }
  } catch {
    // ignore
  }
}

export async function listConsumerWaitlist(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const statusFilterRaw =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "active";
  const statusFilter =
    statusFilterRaw === "expired" ||
    statusFilterRaw === "active" ||
    statusFilterRaw === "all"
      ? statusFilterRaw
      : "active";

  const supabase = getAdminSupabase();

  const { data: entries, error: entriesErr } = await supabase
    .from("waitlist_entries")
    .select(
      "id,reservation_id,slot_id,user_id,status,position,offer_sent_at,offer_expires_at,created_at,updated_at,meta",
    )
    .eq("user_id", userResult.userId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (entriesErr) return res.status(500).json({ error: entriesErr.message });

  const entryRows = (entries ?? []) as WaitlistEntryRow[];

  // Lazy expiration: if an offer is past its expiry, mark as expired and try next.
  for (const e of entryRows) {
    // eslint-disable-next-line no-await-in-loop
    await expireWaitlistEntryBestEffort({
      supabase,
      entry: e,
      actorRole: "user",
      actorUserId: userResult.userId,
      reason: "consumer_list",
    });
  }

  const reservationIds = Array.from(
    new Set(
      entryRows.map((e) => String(e.reservation_id ?? "")).filter(Boolean),
    ),
  );

  const { data: reservations, error: resErr } = reservationIds.length
    ? await supabase
        .from("reservations")
        .select(
          "id,booking_reference,establishment_id,user_id,status,starts_at,ends_at,party_size,slot_id,meta,created_at,updated_at,establishments(id,name,city,universe)",
        )
        .in("id", reservationIds)
        .eq("user_id", userResult.userId)
        .limit(500)
    : ({ data: [] as unknown[], error: null } as any);

  if (resErr) return res.status(500).json({ error: resErr.message });

  const reservationById = new Map<string, any>();
  for (const r of (reservations ?? []) as any[]) {
    const id = String(r?.id ?? "");
    if (id) reservationById.set(id, r);
  }

  const activeStatuses = new Set([
    "waiting",
    "offer_sent",
    "queued",
    "accepted",
    "converted_to_booking",
  ]);
  const expiredStatuses = new Set([
    "expired",
    "cancelled",
    "declined",
    "offer_timeout",
    "offer_gone",
    "offer_expired",
    "offer_refused",
    "slot_gone",
    "removed",
  ]);

  const items = entryRows
    .map((e) => {
      const rid = String(e.reservation_id ?? "");
      const reservation = reservationById.get(rid) ?? null;
      return {
        ...e,
        reservation,
        establishment: reservation?.establishments ?? null,
      };
    })
    .filter((x) => Boolean(x.id));

  const filtered = items.filter((x) => {
    const status = String(x.status ?? "").trim();

    if (statusFilter === "all") return true;

    const isExpired =
      expiredStatuses.has(status) ||
      (status === "offer_sent" && isOfferExpiredByIso(x.offer_expires_at));
    const isActive = activeStatuses.has(status) && !isExpired;

    return statusFilter === "active" ? isActive : isExpired;
  });

  return res.json({ ok: true, items: filtered });
}

export async function cancelConsumerWaitlist(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const entryId = typeof req.params.id === "string" ? req.params.id : "";
  if (!entryId || !isUuid(entryId))
    return res.status(400).json({ error: "invalid_waitlist_id" });

  const supabase = getAdminSupabase();

  const { data: entry, error: entryErr } = await supabase
    .from("waitlist_entries")
    .select("id,reservation_id,slot_id,user_id,status,offer_expires_at")
    .eq("id", entryId)
    .eq("user_id", userResult.userId)
    .maybeSingle();

  if (entryErr) return res.status(500).json({ error: entryErr.message });
  if (!entry?.id)
    return res.status(404).json({ error: "waitlist_entry_not_found" });

  const entryStatus = String((entry as any).status ?? "");
  if (entryStatus === "converted_to_booking" || entryStatus === "accepted") {
    return res.status(409).json({ error: "waitlist_entry_already_converted" });
  }

  const nowIso = new Date().toISOString();

  await supabase
    .from("waitlist_entries")
    .update({ status: "cancelled", offer_expires_at: null, updated_at: nowIso })
    .eq("id", entryId)
    .eq("user_id", userResult.userId);

  const reservationId = String((entry as any).reservation_id ?? "");

  const { data: reservationMetaRow } = reservationId
    ? await supabase
        .from("reservations")
        .select("meta")
        .eq("id", reservationId)
        .maybeSingle()
    : ({ data: null } as any);

  const prevMeta = asRecord((reservationMetaRow as any)?.meta) ?? {};
  const nextMeta: Record<string, unknown> = {
    ...prevMeta,
    cancelled_at: nowIso,
    cancelled_by: "user",
    waitlist_cancelled_at: nowIso,
  };

  await supabase
    .from("reservations")
    .update({ status: "cancelled_user", meta: nextMeta })
    .eq("id", reservationId)
    .eq("user_id", userResult.userId);

  await supabase.from("waitlist_events").insert({
    waitlist_entry_id: entryId,
    reservation_id: (entry as any).reservation_id,
    establishment_id: null,
    slot_id: (entry as any).slot_id,
    user_id: userResult.userId,
    event_type: "waitlist_cancelled",
    actor_role: "user",
    actor_user_id: userResult.userId,
    metadata: { reason: "user_cancel" },
  });

  await supabase.from("system_logs").insert({
    actor_user_id: userResult.userId,
    actor_role: "user",
    action: "waitlist.cancelled",
    entity_type: "waitlist_entry",
    entity_id: entryId,
    payload: {
      reservation_id: (entry as any).reservation_id,
      slot_id: (entry as any).slot_id,
      previous_status: entryStatus,
    },
  });

  const sid = String((entry as any).slot_id ?? "");
  if (sid) {
    void triggerWaitlistPromotionForSlot({
      supabase: supabase as any,
      slotId: sid,
      actorRole: "user",
      actorUserId: userResult.userId,
      reason: "cancel_waitlist",
    });
  }

  return res.json({ ok: true });
}

export async function acceptConsumerWaitlistOffer(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const entryId = typeof req.params.id === "string" ? req.params.id : "";
  if (!entryId || !isUuid(entryId))
    return res.status(400).json({ error: "invalid_waitlist_id" });

  const supabase = getAdminSupabase();

  const { data: entry, error: entryErr } = await supabase
    .from("waitlist_entries")
    .select(
      "id,reservation_id,slot_id,user_id,status,position,offer_expires_at",
    )
    .eq("id", entryId)
    .eq("user_id", userResult.userId)
    .maybeSingle();

  if (entryErr) return res.status(500).json({ error: entryErr.message });
  if (!entry?.id)
    return res.status(404).json({ error: "waitlist_entry_not_found" });

  const reservationId = String((entry as any).reservation_id ?? "");
  if (!reservationId)
    return res.status(409).json({ error: "missing_reservation_id" });

  // Delegate to the existing reservation action to avoid duplicating the full conversion logic.
  req.params.id = reservationId;
  req.body = { action: "waitlist_accept_offer" };
  return await updateConsumerReservation(req, res);
}

export async function refuseConsumerWaitlistOffer(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const entryId = typeof req.params.id === "string" ? req.params.id : "";
  if (!entryId || !isUuid(entryId))
    return res.status(400).json({ error: "invalid_waitlist_id" });

  const supabase = getAdminSupabase();

  const { data: entry, error: entryErr } = await supabase
    .from("waitlist_entries")
    .select("id,reservation_id,user_id")
    .eq("id", entryId)
    .eq("user_id", userResult.userId)
    .maybeSingle();

  if (entryErr) return res.status(500).json({ error: entryErr.message });
  if (!entry?.id)
    return res.status(404).json({ error: "waitlist_entry_not_found" });

  const reservationId = String((entry as any).reservation_id ?? "");
  if (!reservationId)
    return res.status(409).json({ error: "missing_reservation_id" });

  req.params.id = reservationId;
  req.body = { action: "waitlist_refuse_offer" };
  return await updateConsumerReservation(req, res);
}

export async function createConsumerWaitlist(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  if (!establishmentId || !isUuid(establishmentId))
    return res.status(400).json({ error: "invalid_establishment_id" });

  const supabase = getAdminSupabase();

  const body = asRecord(req.body) ?? {};

  const startsAt = asString(body.starts_at) ?? asString(body.startsAt);
  const slotId = asString(body.slot_id) ?? asString(body.slotId);
  const partySize =
    typeof body.party_size === "number"
      ? Math.round(body.party_size)
      : typeof body.partySize === "number"
        ? Math.round(body.partySize)
        : null;

  if (!startsAt) return res.status(400).json({ error: "missing_starts_at" });
  if (!slotId || !isUuid(slotId))
    return res.status(400).json({ error: "invalid_slot_id" });

  // Prevent duplicates: one active waitlist entry per user/slot.
  const activeEntryStatuses = ["waiting", "offer_sent", "queued"];

  const { data: existingEntry, error: existingEntryErr } = await supabase
    .from("waitlist_entries")
    .select("id,reservation_id,status,slot_id,offer_expires_at,created_at")
    .eq("user_id", userResult.userId)
    .eq("slot_id", slotId)
    .in("status", activeEntryStatuses)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingEntryErr)
    return res.status(500).json({ error: existingEntryErr.message });
  if (existingEntry?.id) {
    return res.status(409).json({
      error: "waitlist_duplicate",
      waitlist_entry_id: (existingEntry as any).id,
      reservation_id: (existingEntry as any).reservation_id,
    });
  }

  // Only allow explicit waitlist when slot is full (or insufficient).
  const { data: slotRow, error: slotErr } = await supabase
    .from("pro_slots")
    .select("id,capacity,starts_at,ends_at")
    .eq("id", slotId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (slotErr) return res.status(500).json({ error: slotErr.message });

  const cap =
    typeof (slotRow as any)?.capacity === "number" &&
    Number.isFinite((slotRow as any).capacity)
      ? Math.max(0, Math.round((slotRow as any).capacity))
      : null;
  if (cap == null) return res.status(404).json({ error: "slot_not_found" });

  const { data: usedRows, error: usedErr } = await supabase
    .from("reservations")
    .select("party_size")
    .eq("slot_id", slotId)
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

  const requestedSize =
    typeof partySize === "number" && Number.isFinite(partySize)
      ? Math.max(1, Math.round(partySize))
      : 1;
  const remaining = Math.max(0, cap - used);

  if (remaining > 0 && requestedSize <= remaining) {
    return res.status(409).json({ error: "slot_not_full" });
  }

  const notifyChannel =
    asString(body.notify_channel) ?? asString(body.notifyChannel);
  const notes = asString(body.notes) ?? asString(body.message);
  const desiredStart =
    asString(body.desired_start) ?? asString(body.desiredStart);
  const desiredEnd = asString(body.desired_end) ?? asString(body.desiredEnd);

  const nowIso = new Date().toISOString();

  const payloadMeta: Record<string, unknown> = {
    source: "user",
    is_from_waitlist: true,
    waitlist_auto: false,
    waitlist_notify_channel: notifyChannel ?? undefined,
    waitlist_notes: notes ?? undefined,
    waitlist_desired_start: desiredStart ?? undefined,
    waitlist_desired_end: desiredEnd ?? undefined,
    waitlist_created_via: "consumer_waitlist_endpoint",
    waitlist_created_at: nowIso,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("reservations")
    .insert({
      kind: "restaurant",
      establishment_id: establishmentId,
      user_id: userResult.userId,
      status: "waitlist",
      payment_status: "pending",
      starts_at: startsAt,
      slot_id: slotId,
      party_size: partySize,
      currency: "MAD",
      meta: payloadMeta,
      is_from_waitlist: true,
    })
    .select("*")
    .single();

  if (insErr) return res.status(500).json({ error: insErr.message });

  await supabase.from("system_logs").insert({
    actor_user_id: userResult.userId,
    actor_role: "user",
    action: "waitlist.created",
    entity_type: "reservation",
    entity_id: String((inserted as any)?.id ?? ""),
    payload: {
      establishment_id: establishmentId,
      slot_id: slotId,
      starts_at: startsAt,
      party_size: partySize,
      notify_channel: notifyChannel ?? null,
    },
  });

  // Best-effort: consumer notification
  try {
    await emitConsumerUserEvent({
      supabase,
      userId: userResult.userId,
      eventType: NotificationEventType.booking_waitlisted,
      metadata: {
        reservationId: String((inserted as any)?.id ?? ""),
        establishmentId,
        slotId,
      },
    });
  } catch {
    // ignore
  }

  // Return waitlist entry if DB created it (trigger/RPC).
  let waitlistEntry: any = null;
  try {
    const { data } = await supabase
      .from("waitlist_entries")
      .select(
        "id,reservation_id,slot_id,status,position,offer_sent_at,offer_expires_at,created_at,updated_at",
      )
      .eq("reservation_id", String((inserted as any)?.id ?? ""))
      .eq("user_id", userResult.userId)
      .maybeSingle();
    waitlistEntry = data ?? null;
  } catch {
    waitlistEntry = null;
  }

  // Best-effort notifications for PRO + Admin.
  try {
    const rid = String((inserted as any)?.id ?? "");
    if (rid) {
      const br = String((inserted as any)?.booking_reference ?? rid);
      const startsLabel = startsAt ? formatLeJjMmAaAHeure(startsAt) : "";
      const party =
        typeof partySize === "number" && Number.isFinite(partySize)
          ? Math.max(1, Math.round(partySize))
          : null;

      const title = "Nouvelle demande (liste d’attente)";
      const bodyText = `Demande ${br}${startsLabel ? ` · ${startsLabel}` : ""}${party ? ` · ${party} pers.` : ""}`;

      await notifyProMembers({
        supabase,
        establishmentId,
        category: "booking",
        title,
        body: bodyText,
        data: {
          reservationId: rid,
          waitlistEntryId:
            String((waitlistEntry as any)?.id ?? "") || undefined,
          establishmentId,
          slotId,
          event_type: NotificationEventType.booking_waitlisted,
          source: "consumer_waitlist_endpoint",
        },
      });

      void emitAdminNotification({
        type: "waitlist_request",
        title,
        body: bodyText,
        data: {
          reservationId: rid,
          waitlistEntryId:
            String((waitlistEntry as any)?.id ?? "") || undefined,
          establishmentId,
          slotId,
          startsAt,
          partySize: party,
          source: "consumer_waitlist_endpoint",
        },
      });
    }
  } catch {
    // ignore
  }

  return res.json({
    ok: true,
    reservation: inserted,
    waitlist_entry: waitlistEntry,
  });
}

export async function listConsumerNotifications(req: Request, res: Response) {
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

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("consumer_user_events")
        .select("id,event_type,occurred_at,metadata,read_at")
        .eq("user_id", userResult.userId)
        .order("occurred_at", { ascending: false })
        .limit(limit),
      8000,
    );

    if (error) {
      console.error("public.listConsumerNotifications supabase error", error);
      return res.status(500).json({ error: "db_error" });
    }

    return res.json({ ok: true, items: data ?? [] });
  } catch (e) {
    console.error("public.listConsumerNotifications failed", e);
    return res
      .status(isTimeoutError(e) ? 504 : 503)
      .json({ error: isTimeoutError(e) ? "timeout" : "service_unavailable" });
  }
}

export async function getConsumerNotificationsUnreadCount(
  req: Request,
  res: Response,
) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  try {
    const { count, error } = await withTimeout(
      supabase
        .from("consumer_user_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userResult.userId)
        .is("read_at", null),
      8000,
    );

    if (error) {
      console.error(
        "public.getConsumerNotificationsUnreadCount supabase error",
        error,
      );
      return res.status(500).json({ error: "db_error" });
    }

    return res.json({
      ok: true,
      unread: typeof count === "number" ? count : 0,
    });
  } catch (e) {
    console.error("public.getConsumerNotificationsUnreadCount failed", e);
    return res
      .status(isTimeoutError(e) ? 504 : 503)
      .json({ error: isTimeoutError(e) ? "timeout" : "service_unavailable" });
  }
}

export async function markConsumerNotificationRead(
  req: Request,
  res: Response,
) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const notificationId = typeof req.params.id === "string" ? req.params.id : "";
  if (!notificationId) return res.status(400).json({ error: "id is required" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("consumer_user_events")
        .update({ read_at: nowIso })
        .eq("id", notificationId)
        .eq("user_id", userResult.userId)
        .is("read_at", null)
        .select("id")
        .maybeSingle(),
      8000,
    );

    if (error) {
      console.error(
        "public.markConsumerNotificationRead supabase error",
        error,
      );
      return res.status(500).json({ error: "db_error" });
    }

    if (!data) return res.status(404).json({ error: "not_found" });

    return res.json({ ok: true });
  } catch (e) {
    console.error("public.markConsumerNotificationRead failed", e);
    return res
      .status(isTimeoutError(e) ? 504 : 503)
      .json({ error: isTimeoutError(e) ? "timeout" : "service_unavailable" });
  }
}

export async function markAllConsumerNotificationsRead(
  req: Request,
  res: Response,
) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const body = asRecord(req.body) ?? {};
  const idsRaw = Array.isArray(body.ids) ? body.ids : null;
  const ids = (idsRaw ?? [])
    .filter((x) => typeof x === "string" && x.trim())
    .map((x) => x.trim())
    .slice(0, 500);

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  try {
    let q = supabase
      .from("consumer_user_events")
      .update({ read_at: nowIso })
      .eq("user_id", userResult.userId)
      .is("read_at", null);

    if (ids.length) {
      q = q.in("id", ids);
    }

    const { data, error } = await withTimeout(q.select("id").limit(5000), 8000);

    if (error) {
      console.error(
        "public.markAllConsumerNotificationsRead supabase error",
        error,
      );
      return res.status(500).json({ error: "db_error" });
    }

    const updatedCount = Array.isArray(data) ? data.length : 0;
    return res.json({ ok: true, updated: updatedCount });
  } catch (e) {
    console.error("public.markAllConsumerNotificationsRead failed", e);
    return res
      .status(isTimeoutError(e) ? 504 : 503)
      .json({ error: isTimeoutError(e) ? "timeout" : "service_unavailable" });
  }
}

export async function deleteConsumerNotification(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const notificationId = typeof req.params.id === "string" ? req.params.id : "";
  if (!notificationId) return res.status(400).json({ error: "id is required" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("consumer_user_events")
        .delete()
        .eq("id", notificationId)
        .eq("user_id", userResult.userId)
        .select("id")
        .maybeSingle(),
      8000,
    );

    if (error) {
      console.error("public.deleteConsumerNotification supabase error", error);
      return res.status(500).json({ error: "db_error" });
    }

    if (!data) return res.status(404).json({ error: "not_found" });

    return res.json({ ok: true });
  } catch (e) {
    console.error("public.deleteConsumerNotification failed", e);
    return res
      .status(isTimeoutError(e) ? 504 : 503)
      .json({ error: isTimeoutError(e) ? "timeout" : "service_unavailable" });
  }
}

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
    } catch {
      // ignore
    }

    try {
      const actor = { userId: userResult.userId, role: "consumer" };
      await ensureEscrowHoldForPackPurchase({ purchaseId, actor });
    } catch {
      // ignore
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
    } catch {
      // ignore
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
  } catch {
    // ignore
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
  } catch {
    // ignore
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
  } catch {
    // ignore
  }

  // Finance pipeline: create escrow hold for pack purchase (best-effort).
  try {
    const actor = { userId: userResult.userId, role: "consumer" };
    await ensureEscrowHoldForPackPurchase({ purchaseId, actor });
  } catch (e) {
    console.error("finance pipeline failed (consumer pack confirm)", e);
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
  } catch {
    // ignore
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
  } catch {
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
    console.error("getConsumerReservationInvoice failed", e);
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
    console.error("getConsumerPackPurchaseInvoice failed", e);
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
      from_role: "user",
      body,
      sender_user_id: userResult.userId,
      meta: {},
    })
    .select("*")
    .single();

  if (msgErr) return res.status(500).json({ error: msgErr.message });

  await supabase
    .from("pro_conversations")
    .update({ updated_at: new Date().toISOString() })
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
        from_role: "user",
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
        from_role: "user",
      },
    });
  } catch {
    // ignore
  }

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
    } catch {
      // If policy lookup fails, we default to allowing the request.
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
    } catch {
      // ignore
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
    } catch {
      // ignore (fallback to defaults)
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
    } catch {
      // ignore
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
    } catch {
      // ignore
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
    } catch {
      // ignore
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
    } catch {
      // ignore
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
  } catch {
    // ignore
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
      console.error(
        "finance pipeline failed (public.updateReservation cancellation)",
        e,
      );
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
  } catch {
    // ignore
  }

  if (proNotification) {
    try {
      await notifyProMembers(proNotification);
    } catch {
      // ignore
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
          asString(process.env.PUBLIC_BASE_URL) || "https://sortiraumaroc.ma";

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
      } catch {
        // ignore
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
  } catch {
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
  } catch {
    // ignore
  }

  return res.json({ ok: true, reservation });
};

// ---------------------------------------------------------------------------
// Public (no account) — SAM Media quote view / accept
// ---------------------------------------------------------------------------

export async function getPublicMediaQuote(req: Request, res: Response) {
  const token =
    typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: link, error: linkErr } = await supabase
    .from("media_quote_public_links")
    .select("id,quote_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(404).json({ error: "link_not_found" });

  const expiresAt = String((link as any).expires_at ?? "");
  if (expiresAt && expiresAt < nowIso)
    return res.status(410).json({ error: "link_expired" });

  const quoteId = String((link as any).quote_id ?? "");
  if (!quoteId) return res.status(404).json({ error: "quote_not_found" });

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select(
      "id,quote_number,status,client_type,pro_user_id,establishment_id,issued_at,valid_until,currency,payment_method,notes,payment_terms,delivery_estimate,subtotal_amount,tax_amount,total_amount,sent_at,accepted_at,rejected_at,created_at,updated_at,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,address,city,ice,notes),establishments(name,city)",
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const { data: items, error: itemsErr } = await supabase
    .from("media_quote_items")
    .select(
      "id,item_type,name_snapshot,description_snapshot,category_snapshot,unit_price_snapshot,quantity,tax_rate_snapshot,line_subtotal,line_tax,line_total",
    )
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  return res.json({
    ok: true,
    quote: { ...(quote as any), items: items ?? [] },
    link: {
      expires_at: (link as any).expires_at,
      used_at: (link as any).used_at,
    },
  });
}

export async function getPublicMediaQuotePdf(req: Request, res: Response) {
  const token =
    typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: link, error: linkErr } = await supabase
    .from("media_quote_public_links")
    .select("id,quote_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(404).json({ error: "link_not_found" });

  const expiresAt = String((link as any).expires_at ?? "");
  if (expiresAt && expiresAt < nowIso)
    return res.status(410).json({ error: "link_expired" });

  const quoteId = String((link as any).quote_id ?? "");
  if (!quoteId) return res.status(404).json({ error: "quote_not_found" });

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select(
      "id,quote_number,status,client_type,pro_user_id,establishment_id,issued_at,valid_until,currency,payment_method,notes,payment_terms,delivery_estimate,subtotal_amount,tax_amount,total_amount,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,address,city,ice,notes),establishments(name,city)",
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const { data: items, error: itemsErr } = await supabase
    .from("media_quote_items")
    .select(
      "id,item_type,name_snapshot,description_snapshot,unit_price_snapshot,quantity,tax_rate_snapshot,line_total",
    )
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  try {
    const company = await getBillingCompanyProfile();
    const pdf = await generateMediaQuotePdfBuffer({
      company,
      quote: quote as any,
      items: (items ?? []).map((it: any) => ({
        name_snapshot: String(it.name_snapshot ?? ""),
        description_snapshot: it.description_snapshot ?? null,
        quantity: Number(it.quantity ?? 0),
        unit_price_snapshot: Number(it.unit_price_snapshot ?? 0),
        tax_rate_snapshot: Number(it.tax_rate_snapshot ?? 0),
        line_total: Number(it.line_total ?? 0),
      })),
    });

    const filename = `${String((quote as any).quote_number ?? "devis")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${filename}\"`,
    );
    return res.status(200).send(pdf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
}

export async function acceptPublicMediaQuote(req: Request, res: Response) {
  const token =
    typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: link, error: linkErr } = await supabase
    .from("media_quote_public_links")
    .select("id,quote_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(404).json({ error: "link_not_found" });

  const expiresAt = String((link as any).expires_at ?? "");
  if (expiresAt && expiresAt < nowIso)
    return res.status(410).json({ error: "link_expired" });

  const quoteId = String((link as any).quote_id ?? "");
  if (!quoteId) return res.status(404).json({ error: "quote_not_found" });

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select("id,status")
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const status = String((quote as any).status ?? "")
    .trim()
    .toLowerCase();
  if (status === "accepted") {
    return res.json({ ok: true, already_accepted: true });
  }

  if (status !== "sent" && status !== "draft") {
    return res.status(409).json({ error: "quote_not_acceptable" });
  }

  const { error: updErr } = await supabase
    .from("media_quotes")
    .update({ status: "accepted", accepted_at: nowIso, updated_at: nowIso })
    .eq("id", quoteId);

  if (updErr) return res.status(500).json({ error: updErr.message });

  // Best-effort: mark link as used.
  if (!(link as any).used_at) {
    await supabase
      .from("media_quote_public_links")
      .update({ used_at: nowIso })
      .eq("id", (link as any).id);
  }

  return res.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Public (no account) — SAM Media invoice view / pdf
// ---------------------------------------------------------------------------

export async function getPublicMediaInvoice(req: Request, res: Response) {
  const token =
    typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: link, error: linkErr } = await supabase
    .from("media_invoice_public_links")
    .select("id,invoice_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(404).json({ error: "link_not_found" });

  const expiresAt = String((link as any).expires_at ?? "");
  if (expiresAt && expiresAt < nowIso)
    return res.status(410).json({ error: "link_expired" });

  const invoiceId = String((link as any).invoice_id ?? "");
  if (!invoiceId) return res.status(404).json({ error: "invoice_not_found" });

  const { data: invoice, error: invErr } = await supabase
    .from("media_invoices")
    .select(
      "id,invoice_number,status,client_type,pro_user_id,establishment_id,issued_at,due_at,currency,payment_method,notes,subtotal_amount,tax_amount,total_amount,paid_amount,created_at,updated_at,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,address,city,ice,notes),establishments(name,city),media_quotes(quote_number)",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

  const { data: items, error: itemsErr } = await supabase
    .from("media_invoice_items")
    .select(
      "id,item_type,name_snapshot,description_snapshot,category_snapshot,unit_price_snapshot,quantity,tax_rate_snapshot,line_subtotal,line_tax,line_total",
    )
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  return res.json({
    ok: true,
    invoice: { ...(invoice as any), items: items ?? [] },
    link: {
      expires_at: (link as any).expires_at,
      used_at: (link as any).used_at,
    },
  });
}

export async function getPublicMediaInvoicePdf(req: Request, res: Response) {
  const token =
    typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: link, error: linkErr } = await supabase
    .from("media_invoice_public_links")
    .select("id,invoice_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(404).json({ error: "link_not_found" });

  const expiresAt = String((link as any).expires_at ?? "");
  if (expiresAt && expiresAt < nowIso)
    return res.status(410).json({ error: "link_expired" });

  const invoiceId = String((link as any).invoice_id ?? "");
  if (!invoiceId) return res.status(404).json({ error: "invoice_not_found" });

  const { data: invoice, error: invErr } = await supabase
    .from("media_invoices")
    .select(
      "id,invoice_number,status,client_type,pro_user_id,establishment_id,issued_at,due_at,currency,payment_method,notes,subtotal_amount,tax_amount,total_amount,paid_amount,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,address,city,ice,notes),establishments(name,city)",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

  const { data: items, error: itemsErr } = await supabase
    .from("media_invoice_items")
    .select(
      "id,item_type,name_snapshot,description_snapshot,unit_price_snapshot,quantity,tax_rate_snapshot,line_total",
    )
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  try {
    const company = await getBillingCompanyProfile();
    const pdf = await generateMediaInvoicePdfBuffer({
      company,
      invoice: invoice as any,
      items: (items ?? []).map((it: any) => ({
        name_snapshot: String(it.name_snapshot ?? ""),
        description_snapshot: it.description_snapshot ?? null,
        quantity: Number(it.quantity ?? 0),
        unit_price_snapshot: Number(it.unit_price_snapshot ?? 0),
        tax_rate_snapshot: Number(it.tax_rate_snapshot ?? 0),
        line_total: Number(it.line_total ?? 0),
      })),
    });

    const filename = `${String((invoice as any).invoice_number ?? "facture")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${filename}\"`,
    );
    return res.status(200).send(pdf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
}

function isProduction(): boolean {
  const env = String(process.env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  return env === "production" || env === "prod";
}

function expectedWebhookKey(): string {
  // Prefer a dedicated secret, but keep ADMIN_API_KEY as fallback for dev environments.
  return (
    process.env.PAYMENTS_WEBHOOK_KEY ||
    process.env.ADMIN_API_KEY ||
    ""
  ).trim();
}

export async function createPublicMediaInvoicePaymentSession(
  req: Request,
  res: Response,
) {
  const token =
    typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: link, error: linkErr } = await supabase
    .from("media_invoice_public_links")
    .select("id,invoice_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(404).json({ error: "link_not_found" });

  const expiresAt = String((link as any).expires_at ?? "");
  if (expiresAt && expiresAt < nowIso)
    return res.status(410).json({ error: "link_expired" });

  const invoiceId = String((link as any).invoice_id ?? "");
  if (!invoiceId) return res.status(404).json({ error: "invoice_not_found" });

  const { data: invoice, error: invErr } = await supabase
    .from("media_invoices")
    .select(
      "id,invoice_number,status,client_type,currency,payment_method,total_amount,paid_amount,pro_user_id,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,city),establishments(name,city)",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

  const status = String((invoice as any).status ?? "")
    .trim()
    .toLowerCase();
  if (status === "cancelled")
    return res.status(409).json({ error: "invoice_cancelled" });

  const paymentMethod = String((invoice as any).payment_method ?? "")
    .trim()
    .toLowerCase();
  if (paymentMethod && paymentMethod !== "card") {
    return res.status(409).json({ error: "payment_method_not_card" });
  }

  const total =
    typeof (invoice as any).total_amount === "number"
      ? (invoice as any).total_amount
      : Number((invoice as any).total_amount ?? 0);
  const paid =
    typeof (invoice as any).paid_amount === "number"
      ? (invoice as any).paid_amount
      : Number((invoice as any).paid_amount ?? 0);
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);

  if (!remaining || remaining <= 0) {
    return res.json({ ok: true, already_paid: true });
  }

  const baseUrl = getRequestBaseUrl(req);
  if (!baseUrl) return res.status(500).json({ error: "missing_base_url" });

  const pageUrl = `${baseUrl}/invoices/${encodeURIComponent(token)}`;
  const acceptUrl = `${pageUrl}?payment_status=success`;
  const declineUrl = `${pageUrl}?payment_status=failed`;

  const key = expectedWebhookKey();
  if (!key)
    return res
      .status(503)
      .json({
        error: "PAYMENTS_WEBHOOK_KEY (or ADMIN_API_KEY fallback) is missing",
      });

  const notificationUrl = `${baseUrl}/api/payments/webhook?webhook_key=${encodeURIComponent(key)}`;

  const pro = isRecord((invoice as any).pro_profiles)
    ? ((invoice as any).pro_profiles as Record<string, unknown>)
    : null;

  const customerEmail =
    pro && typeof pro.email === "string" ? pro.email.trim() : "";
  if (!customerEmail)
    return res.status(400).json({ error: "missing_customer_email" });

  const customerPhoneRaw =
    pro && typeof pro.phone === "string" ? pro.phone.trim() : "";

  const devPhoneOverride = String(
    process.env.LACAISSEPAY_DEV_PHONE ?? "",
  ).trim();
  const phoneToUse =
    !isProduction() && devPhoneOverride
      ? devPhoneOverride
      : customerPhoneRaw || "+212611159538";

  const displayName =
    (pro && typeof pro.contact_name === "string" && pro.contact_name.trim()) ||
    (pro && typeof pro.company_name === "string" && pro.company_name.trim()) ||
    "Client";

  const nameParts = displayName.split(" ").filter(Boolean);
  const customerFirstName = nameParts[0] || "Client";
  const customerLastName = nameParts.slice(1).join(" ") || "SAM";

  const currency =
    typeof (invoice as any).currency === "string"
      ? (invoice as any).currency
      : "MAD";
  if (String(currency).toUpperCase() !== "MAD") {
    return res.status(400).json({ error: "unsupported_currency" });
  }

  try {
    const externalReference = `MEDIA_INVOICE:${invoiceId}`;

    const session = await createLacaissePaySessionInternal({
      orderId: invoiceId,
      externalReference,
      amountMad: remaining,
      customerEmail,
      customerPhone: phoneToUse,
      customerFirstName,
      customerLastName,
      acceptUrl,
      declineUrl,
      notificationUrl,
      companyName: "Sortir Au Maroc",
    });

    const config = {
      customer: {
        email: customerEmail,
        phone: phoneToUse,
        firstName: customerFirstName,
        lastName: customerLastName,
        phoneClient: customerPhoneRaw || phoneToUse,
      },
      urls: {
        accept: acceptUrl,
        decline: declineUrl,
        notification: notificationUrl,
        externalReference,
      },
      frontend: {
        theme: "default",
        companyName: "Sortir Au Maroc",
      },
    };

    const checkoutUrl = buildLacaissePayCheckoutUrlServer({
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
      config,
    });

    await supabase.from("admin_audit_log").insert({
      action: "media.invoice.payment_session.create",
      entity_type: "media_invoices",
      entity_id: invoiceId,
      metadata: { provider: "lacaissepay", amount: remaining, currency: "MAD" },
    });

    return res.json({ ok: true, checkout_url: checkoutUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
}

// ---------------------------------------------------------------------------
// PUBLIC UNIVERSES
// ---------------------------------------------------------------------------

export async function getPublicUniverses(req: Request, res: Response) {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("universes")
    .select("slug,label_fr,label_en,icon_name,color,sort_order,image_url")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, universes: data ?? [] });
}

// ---------------------------------------------------------------------------
// PUBLIC HOME SETTINGS (Hero Background, etc.)
// ---------------------------------------------------------------------------

export async function getPublicHomeSettings(req: Request, res: Response) {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("home_settings")
    .select("key,value");

  if (error) {
    // Table might not exist yet, return defaults
    return res.json({
      ok: true,
      settings: {
        hero: { background_image_url: null, overlay_opacity: 0.7 },
      },
    });
  }

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  // Ensure hero key exists with defaults
  if (!settings.hero) {
    settings.hero = { background_image_url: null, overlay_opacity: 0.7 };
  }

  res.json({ ok: true, settings });
}

// ---------------------------------------------------------------------------
// PUBLIC HOME CITIES
// ---------------------------------------------------------------------------

export async function getPublicHomeCities(req: Request, res: Response) {
  const supabase = getAdminSupabase();
  const countryCode = typeof req.query.country === "string" ? req.query.country.toUpperCase() : null;

  let query = supabase
    .from("home_cities")
    .select("id,name,slug,image_url,country_code")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  // Filter by country if specified
  if (countryCode) {
    query = query.eq("country_code", countryCode);
  }

  const { data, error } = await query;

  if (error) {
    // Table might not exist yet, return empty array
    if (error.code === "42P01") {
      return res.json({ ok: true, cities: [] });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, cities: data ?? [] });
}

// ---------------------------------------------------------------------------
// PUBLIC COUNTRIES
// ---------------------------------------------------------------------------

export async function getPublicCountries(req: Request, res: Response) {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("countries")
    .select("id,name,name_en,code,flag_emoji,currency_code,is_default")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    // Table might not exist yet, return default Morocco
    if (error.code === "42P01") {
      return res.json({
        ok: true,
        countries: [
          { id: "default", name: "Maroc", name_en: "Morocco", code: "MA", flag_emoji: "🇲🇦", currency_code: "MAD", is_default: true }
        ]
      });
    }
    return res.status(500).json({ error: error.message });
  }

  // If no countries configured, return Morocco as default
  if (!data || data.length === 0) {
    return res.json({
      ok: true,
      countries: [
        { id: "default", name: "Maroc", name_en: "Morocco", code: "MA", flag_emoji: "🇲🇦", currency_code: "MAD", is_default: true }
      ]
    });
  }

  res.json({ ok: true, countries: data });
}

// ---------------------------------------------------------------------------
// DETECT USER COUNTRY (via IP geolocation)
// ---------------------------------------------------------------------------

export async function detectUserCountry(req: Request, res: Response) {
  // Get IP from various headers (for proxies/load balancers)
  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.headers["x-real-ip"]?.toString() ||
    req.socket.remoteAddress ||
    "127.0.0.1";

  // For local development, return Morocco
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return res.json({ ok: true, country_code: "MA", detected: false, reason: "local" });
  }

  try {
    // Use free IP geolocation API (ip-api.com - free for non-commercial use)
    // For production, consider using a paid service like MaxMind, IPinfo, etc.
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
    if (response.ok) {
      const data = await response.json() as { countryCode?: string };
      if (data.countryCode) {
        return res.json({ ok: true, country_code: data.countryCode, detected: true });
      }
    }
  } catch {
    // Silently fail and return default
  }

  // Default to Morocco if detection fails
  res.json({ ok: true, country_code: "MA", detected: false, reason: "fallback" });
}

// ---------------------------------------------------------------------------
// PUBLIC HOME VIDEOS
// ---------------------------------------------------------------------------

export async function getPublicHomeVideos(req: Request, res: Response) {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("home_videos")
    .select("id,youtube_url,title,description,thumbnail_url,establishment_id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    // Table might not exist yet, return empty array
    if (error.code === "42P01") {
      return res.json({ ok: true, videos: [] });
    }
    return res.status(500).json({ error: error.message });
  }

  // Fetch establishment names for videos that have establishment_id
  const videos = data ?? [];
  const establishmentIds = videos
    .filter((v: any) => v.establishment_id)
    .map((v: any) => v.establishment_id);

  let establishmentMap: Record<string, { name: string; universe: string; slug: string | null }> = {};
  if (establishmentIds.length > 0) {
    const { data: establishments } = await supabase
      .from("establishments")
      .select("id,name,universe,slug")
      .in("id", establishmentIds);

    if (establishments) {
      for (const e of establishments as Array<{ id: string; name: string; universe: string; slug: string | null }>) {
        establishmentMap[e.id] = { name: e.name, universe: e.universe, slug: e.slug };
      }
    }
  }

  const enrichedVideos = videos.map((v: any) => ({
    id: v.id,
    youtube_url: v.youtube_url,
    title: v.title,
    description: v.description,
    thumbnail_url: v.thumbnail_url,
    establishment_id: v.establishment_id,
    establishment_name: v.establishment_id ? establishmentMap[v.establishment_id]?.name ?? null : null,
    establishment_universe: v.establishment_id ? establishmentMap[v.establishment_id]?.universe ?? null : null,
    establishment_slug: v.establishment_id ? establishmentMap[v.establishment_id]?.slug ?? null : null,
  }));

  res.json({ ok: true, videos: enrichedVideos });
}

// ---------------------------------------------------------------------------
// PUBLIC HOME TAKEOVER
// ---------------------------------------------------------------------------

export async function getPublicHomeTakeover(req: Request, res: Response) {
  const supabase = getAdminSupabase();

  // Call the database function to get today's confirmed home takeover
  const { data, error } = await supabase.rpc("get_today_home_takeover");

  if (error) {
    // Table or function might not exist yet
    if (error.code === "42P01" || error.code === "42883") {
      return res.json({ ok: true, takeover: null });
    }
    return res.status(500).json({ error: error.message });
  }

  // The function returns a table, so data is an array
  const takeover = Array.isArray(data) && data.length > 0 ? data[0] : null;

  // If no takeover today or no visual assets configured, return null
  if (!takeover) {
    return res.json({ ok: true, takeover: null });
  }

  // Only return takeover if it has at least a headline or a banner
  const hasContent =
    takeover.headline ||
    takeover.banner_desktop_url ||
    takeover.banner_mobile_url;

  if (!hasContent) {
    return res.json({ ok: true, takeover: null });
  }

  res.json({ ok: true, takeover });
}

// ---------------------------------------------------------------------------
// PUBLIC ESTABLISHMENT BY USERNAME (for book.sam.ma/:username)
// ---------------------------------------------------------------------------

/**
 * Get establishment by username and set booking attribution cookie.
 * This endpoint is used by the direct booking page (book.sam.ma/:username).
 *
 * The cookie is HTTPOnly to prevent client-side manipulation (anti-cheat).
 * It contains the establishment ID and username, valid for 48 hours.
 *
 * Reservations made within 48h of visiting via this endpoint will be
 * attributed as "direct_link" and will NOT incur commission.
 */
export async function getPublicEstablishmentByUsername(
  req: Request,
  res: Response
) {
  const username = String(req.params.username ?? "").trim().toLowerCase();

  if (!username || username.length < 3) {
    return res.status(400).json({ error: "invalid_username" });
  }

  const supabase = getAdminSupabase();

  // Find establishment by username (case-insensitive)
  const { data: establishment, error: estError } = await supabase
    .from("establishments")
    .select(
      "id,slug,username,name,universe,subcategory,city,address,postal_code,region,country,lat,lng,description_short,description_long,phone,whatsapp,website,social_links,cover_url,gallery_urls,hours,tags,amenities,extra,booking_enabled,status,email"
    )
    .ilike("username", username)
    .eq("status", "active")
    .maybeSingle();

  if (estError) {
    return res.status(500).json({ error: estError.message });
  }

  if (!establishment) {
    return res.status(404).json({ error: "establishment_not_found" });
  }

  const establishmentId = String((establishment as any).id ?? "");
  const establishmentUsername = String((establishment as any).username ?? "");

  // Set the booking attribution cookie (HTTPOnly, 48h expiration)
  // This cookie will be read when creating a reservation to determine
  // if it's a "direct_link" (no commission) or "platform" (commission) booking.
  setBookingAttributionCookie(res, {
    slug: establishmentUsername,
    establishmentId: establishmentId,
  });

  // Fetch additional data (slots, packs, booking policy) like getPublicEstablishment
  const nowIso = new Date().toISOString();

  const [
    { data: slots, error: slotsError },
    { data: packs, error: packsError },
    { data: bookingPolicy, error: bookingPolicyError },
  ] = await Promise.all([
    supabase
      .from("pro_slots")
      .select(
        "id,starts_at,ends_at,capacity,base_price,promo_type,promo_value,promo_label,service_label"
      )
      .eq("establishment_id", establishmentId)
      .eq("active", true)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(500),
    supabase
      .from("pro_packs")
      .select(
        "id,title,description,label,items,price,original_price,is_limited,stock,availability,valid_from,valid_to,conditions,max_reservations"
      )
      .eq("establishment_id", establishmentId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("pro_booking_policies")
      .select("*")
      .eq("establishment_id", establishmentId)
      .maybeSingle(),
  ]);

  // Compute average rating
  let avgRating: number | null = null;
  let reviewCount = 0;
  try {
    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating")
      .eq("establishment_id", establishmentId)
      .eq("status", "approved")
      .limit(1000);

    if (reviews && reviews.length > 0) {
      reviewCount = reviews.length;
      const sum = reviews.reduce(
        (acc: number, r: any) => acc + (Number(r.rating) || 0),
        0
      );
      avgRating = Math.round((sum / reviewCount) * 10) / 10;
    }
  } catch {
    // Ignore errors
  }

  // Group slots by date (simplified for direct booking)
  const slotsByDate: Record<string, any[]> = {};
  for (const slot of (slots ?? []) as any[]) {
    const date = String(slot.starts_at ?? "").split("T")[0];
    if (!date) continue;
    if (!slotsByDate[date]) slotsByDate[date] = [];
    slotsByDate[date].push(slot);
  }

  res.json({
    ok: true,
    establishment: {
      ...establishment,
      avg_rating: avgRating,
      review_count: reviewCount,
    },
    slots: slots ?? [],
    slotsByDate,
    packs: packs ?? [],
    bookingPolicy: bookingPolicy ?? null,
    attributionSet: true, // Indicates the attribution cookie was set
  });
}

/**
 * Validate a promo code for a booking/reservation.
 * POST /api/public/booking/promo/validate
 *
 * Body: { code: string, establishmentId?: string }
 * Response: { valid: boolean, discount_bps?: number, message?: string }
 */
export async function validateBookingPromoCode(req: Request, res: Response) {
  try {
    const code = String(req.body?.code ?? "").trim().toUpperCase();
    const establishmentId = req.body?.establishmentId
      ? String(req.body.establishmentId).trim()
      : null;

    if (!code) {
      return res.status(400).json({ valid: false, message: "Code requis" });
    }

    const { data: promo, error: promoErr } = await supabase
      .from("consumer_promo_codes")
      .select(
        "id,code,discount_bps,applies_to_establishment_ids,active,starts_at,ends_at,max_uses_total,max_uses_per_user,deleted_at"
      )
      .eq("code", code)
      .is("deleted_at", null)
      .maybeSingle();

    if (promoErr) {
      console.error("[validateBookingPromoCode] DB error:", promoErr);
      return res.status(500).json({ valid: false, message: "Erreur serveur" });
    }

    if (!promo) {
      return res.json({ valid: false, message: "Code promo invalide" });
    }

    // Check if active
    if (!promo.active) {
      return res.json({ valid: false, message: "Ce code promo n'est plus actif" });
    }

    // Check date validity
    const now = new Date();
    if (promo.starts_at && new Date(promo.starts_at) > now) {
      return res.json({ valid: false, message: "Ce code promo n'est pas encore valide" });
    }
    if (promo.ends_at && new Date(promo.ends_at) < now) {
      return res.json({ valid: false, message: "Ce code promo a expiré" });
    }

    // Check establishment scope if specified
    if (
      establishmentId &&
      promo.applies_to_establishment_ids &&
      Array.isArray(promo.applies_to_establishment_ids) &&
      promo.applies_to_establishment_ids.length > 0
    ) {
      if (!promo.applies_to_establishment_ids.includes(establishmentId)) {
        return res.json({
          valid: false,
          message: "Ce code promo n'est pas valide pour cet établissement",
        });
      }
    }

    // Check max total uses
    if (promo.max_uses_total != null && promo.max_uses_total > 0) {
      const { count, error: countErr } = await supabase
        .from("consumer_promo_code_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("promo_code_id", promo.id);

      if (!countErr && count != null && count >= promo.max_uses_total) {
        return res.json({
          valid: false,
          message: "Ce code promo a atteint son nombre maximum d'utilisations",
        });
      }
    }

    // Calculate discount percentage for display
    const discountPercent = Math.round(promo.discount_bps / 100);

    return res.json({
      valid: true,
      discount_bps: promo.discount_bps,
      discount_percent: discountPercent,
      message: `Code valide ! -${discountPercent}% sur votre réservation`,
      promo_id: promo.id,
    });
  } catch (err: any) {
    console.error("[validateBookingPromoCode] Error:", err);
    return res.status(500).json({ valid: false, message: "Erreur serveur" });
  }
}
