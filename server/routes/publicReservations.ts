import type { Request, Response } from "express";

import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("publicReservations");

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
import { sendTemplateEmail } from "../emailService";
import { isDemoRoutesAllowed } from "./publicEstablishments";
import {
  ensureEscrowHoldForReservation,
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
  getUserFromBearerToken,
  isTimeoutError,
  withTimeout,
  getRequestLang,
  getRequestBaseUrl,
  getRequestIp,
  resolveEstablishmentId,
  normalizeUserMetaString,
  moroccoDateParts,
  toYmd,
  timeHm,
  promoPercentFromSlot,
  getRestaurantServiceLabelFromMinutes,
  addDaysIso,
  type PublicDateSlots,
} from "./publicHelpers";

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
  } catch (err) {
    log.warn({ err }, "failed to track establishment visit");
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
  } catch (err) {
    log.warn({ err }, "failed to track campaign event");
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
    log.warn({ startsAt, now: new Date(now).toISOString(), userId: userResult?.userId }, "SECURITY: Attempt to create reservation in the past");
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
    } catch (err) {
      log.warn({ err }, "failed to check overlapping reservations");
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
        log.warn({ clientAmountTotal, serverAmountTotal: amountTotal, slotId }, "SECURITY: Client amount mismatch");
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
        log.error({ err: e }, "finance pipeline failed (public.createReservation update)");
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
    log.error({ err: e }, "finance pipeline failed (public.createReservation insert)");
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
      } catch (err) {
        log.warn({ err }, "failed to emit consumer booking notification");
      }
    }
  } catch (err) {
    log.warn({ err }, "failed to send pro/admin booking notifications");
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
      const startsRaw = String((inserted as any)?.starts_at ?? startsAtIso);
      const starts = formatDateLongFr(startsRaw) || startsRaw;

      const amountTotal =
        typeof (inserted as any)?.amount_total === "number" &&
        Number.isFinite((inserted as any).amount_total) &&
        (inserted as any).amount_total > 0
          ? (inserted as any).amount_total as number
          : 0;
      const amount = amountTotal > 0 ? `${Math.round(amountTotal)} MAD` : "Sans acompte";

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
        asString(process.env.PUBLIC_BASE_URL) || "https://sam.ma";
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
            guests: String(party ?? 1),
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
          guests: String(party ?? 1),
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
    } catch (err) {
      log.warn({ err }, "failed to send transactional booking emails");
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
      log.error({ err: error }, "listConsumerReservations supabase error");
      return res.status(500).json({ error: "db_error" });
    }

    data = (rows ?? []) as unknown[];
  } catch (e) {
    log.error({ err: e }, "listConsumerReservations failed");
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
  } catch (err) {
    log.warn({ err }, "failed to attach waitlist offer state to reservations");
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
  } catch (err) {
    log.warn({ err }, "failed to expire waitlist entry");
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
  } catch (err) {
    log.warn({ err }, "failed to emit consumer waitlist notification");
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
  } catch (err) {
    log.warn({ err }, "failed to fetch waitlist entry after creation");
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
  } catch (err) {
    log.warn({ err }, "failed to send pro/admin waitlist notifications");
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
      log.error({ err: error }, "listConsumerNotifications supabase error");
      return res.status(500).json({ error: "db_error" });
    }

    return res.json({ ok: true, items: data ?? [] });
  } catch (e) {
    log.error({ err: e }, "listConsumerNotifications failed");
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
      log.error({ err: error }, "getConsumerNotificationsUnreadCount supabase error");
      return res.status(500).json({ error: "db_error" });
    }

    return res.json({
      ok: true,
      unread: typeof count === "number" ? count : 0,
    });
  } catch (e) {
    log.error({ err: e }, "getConsumerNotificationsUnreadCount failed");
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
      log.error({ err: error }, "markConsumerNotificationRead supabase error");
      return res.status(500).json({ error: "db_error" });
    }

    if (!data) return res.status(404).json({ error: "not_found" });

    return res.json({ ok: true });
  } catch (e) {
    log.error({ err: e }, "markConsumerNotificationRead failed");
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
      log.error({ err: error }, "markAllConsumerNotificationsRead supabase error");
      return res.status(500).json({ error: "db_error" });
    }

    const updatedCount = Array.isArray(data) ? data.length : 0;
    return res.json({ ok: true, updated: updatedCount });
  } catch (e) {
    log.error({ err: e }, "markAllConsumerNotificationsRead failed");
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
      log.error({ err: error }, "deleteConsumerNotification supabase error");
      return res.status(500).json({ error: "db_error" });
    }

    if (!data) return res.status(404).json({ error: "not_found" });

    return res.json({ ok: true });
  } catch (e) {
    log.error({ err: e }, "deleteConsumerNotification failed");
    return res
      .status(isTimeoutError(e) ? 504 : 503)
      .json({ error: isTimeoutError(e) ? "timeout" : "service_unavailable" });
  }
}

