import type { RequestHandler } from "express";
import { randomUUID, randomBytes } from "node:crypto";

import { mkIsoInTimeZoneDayOffset } from "../../shared/datetime";

import { getAdminSupabase } from "../supabaseAdmin";
import { validateBody } from "../middleware/validate";
import { createPackSchema, updatePackSchema, type CreatePackInput, type UpdatePackInput } from "../schemas/pack";
import { ensureEscrowHoldForReservation, settleEscrowForReservation, ensureInvoiceForProInvoice, ensureInvoiceForVisibilityOrder } from "../finance";
import { emitAdminNotification } from "../adminNotifications";
import { notifyProMembers } from "../proNotifications";
import { emitConsumerUserEvent } from "../consumerNotifications";
import { recomputeConsumerUserStatsV1 } from "../consumerReliability";
import { sendLoggedEmail, sendTemplateEmail } from "../emailService";
import {
  isReservationPaymentsEnabled,
  isCommissionsEnabled,
  isPayoutsEnabled,
  isGuaranteeDepositsEnabled,
} from "../platformSettings";

import { NotificationEventType } from "../../shared/notifications";
import { canTransitionReservationStatus, OCCUPYING_RESERVATION_STATUSES } from "../../shared/reservationStates";
import { triggerWaitlistPromotionForSlot } from "../waitlist";
import {
  getSubscriptionWithDetails,
  isUsernameAccessAllowed,
  startTrial,
  cancelSubscription,
} from "../subscriptions/usernameSubscription";

type ProUser = { id: string; email?: string | null };

type ProRole = "owner" | "manager" | "reception" | "accounting" | "marketing" | string;

type MembershipRow = {
  establishment_id: string;
  user_id: string;
  role: ProRole;
};

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token && token.trim() ? token.trim() : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asBoolean(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length);
  return out;
}

function asJsonObject(v: unknown): Record<string, unknown> | undefined {
  return isRecord(v) ? v : undefined;
}

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
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

function looksLikeUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function safeParseUrl(value: string): URL | null {
  try {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function extractReservationLookupFromQrCode(raw: string): { reservationId?: string; bookingReference?: string } {
  const code = String(raw ?? "").trim();
  if (!code) return {};

  if (looksLikeUuid(code)) return { reservationId: code };

  const prefixed = code.match(/^(SAM|SAMPACK):(.+)$/i);
  if (prefixed?.[2]) {
    const payload = prefixed[2].trim();
    const parts = payload.split("|").map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const [kRaw, vRaw] = part.split("=", 2);
      const k = (kRaw ?? "").trim().toLowerCase();
      const v = (vRaw ?? "").trim();
      if (k === "ref" && v) return { bookingReference: v };
      if ((k === "reservation_id" || k === "rid") && v && looksLikeUuid(v)) return { reservationId: v };
    }
  }

  const url = safeParseUrl(code);
  if (url) {
    const reservationId = url.searchParams.get("reservation_id") ?? url.searchParams.get("rid");
    if (reservationId && looksLikeUuid(reservationId)) return { reservationId };

    const ref = url.searchParams.get("booking_reference") ?? url.searchParams.get("ref");
    if (ref && ref.trim()) return { bookingReference: ref.trim() };

    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && looksLikeUuid(last)) return { reservationId: last };
    if (last && last.trim()) return { bookingReference: last.trim() };
  }

  if (code.startsWith("{") && code.endsWith("}")) {
    try {
      const parsed = JSON.parse(code) as unknown;
      if (isRecord(parsed)) {
        const rid = asString(parsed.reservation_id) ?? asString(parsed.reservationId);
        if (rid && looksLikeUuid(rid)) return { reservationId: rid };
        const ref = asString(parsed.booking_reference) ?? asString(parsed.bookingReference);
        if (ref) return { bookingReference: ref };
      }
    } catch {
    }
  }

  const m = code.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (m?.[1]) return { reservationId: m[1] };

  return { bookingReference: code };
}

function extractEstablishmentProfileUpdate(data: unknown): Record<string, unknown> {
  if (!isRecord(data)) return {};

  const out: Record<string, unknown> = {};

  const name = asString(data.name);
  if (name !== undefined) out.name = name;

  const universe = asString(data.universe);
  if (universe !== undefined) out.universe = universe;

  const subcategory = asString(data.subcategory);
  if (subcategory !== undefined) out.subcategory = subcategory;

  const specialties = asStringArray(data.specialties);
  if (specialties !== undefined) out.specialties = specialties;

  const city = asString(data.city);
  if (city !== undefined) out.city = city;

  const postalCode = asString(data.postal_code);
  if (postalCode !== undefined) out.postal_code = postalCode;

  const region = asString(data.region);
  if (region !== undefined) out.region = region;

  const country = asString(data.country);
  if (country !== undefined) out.country = country;

  const address = asString(data.address);
  if (address !== undefined) out.address = address;

  const lat = asNumber(data.lat);
  if (lat !== undefined) out.lat = lat;

  const lng = asNumber(data.lng);
  if (lng !== undefined) out.lng = lng;

  const descriptionShort = asString(data.description_short);
  if (descriptionShort !== undefined) out.description_short = descriptionShort;

  const descriptionLong = asString(data.description_long);
  if (descriptionLong !== undefined) out.description_long = descriptionLong;

  const phone = asString(data.phone);
  if (phone !== undefined) out.phone = phone;

  const whatsapp = asString(data.whatsapp);
  if (whatsapp !== undefined) out.whatsapp = whatsapp;

  const website = asString(data.website);
  if (website !== undefined) out.website = website;

  const email = asString(data.email);
  if (email !== undefined) out.email = email;

  const socialLinks = asJsonObject(data.social_links);
  if (socialLinks !== undefined) out.social_links = socialLinks;

  const hours = asJsonObject(data.hours);
  if (hours !== undefined) out.hours = hours;

  const tags = asStringArray(data.tags);
  if (tags !== undefined) out.tags = tags;

  const amenities = asStringArray(data.amenities);
  if (amenities !== undefined) out.amenities = amenities;

  const coverUrl = asString(data.cover_url);
  if (coverUrl !== undefined) out.cover_url = coverUrl;

  const galleryUrls = asStringArray(data.gallery_urls);
  if (galleryUrls !== undefined) out.gallery_urls = galleryUrls;

  const ambianceTags = asStringArray(data.ambiance_tags);
  if (ambianceTags !== undefined) out.ambiance_tags = ambianceTags;

  const mixExperience = asJsonObject(data.mix_experience);
  if (mixExperience !== undefined) out.mix_experience = mixExperience;

  const extra = asJsonObject(data.extra);
  if (extra !== undefined) out.extra = extra;

  return out;
}

async function getUserFromBearerToken(token: string): Promise<
  { ok: true; user: ProUser } | { ok: false; error: string; status: number }
> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return { ok: false, status: 401, error: error.message };
  if (!data.user) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, user: { id: data.user.id, email: data.user.email } };
}

async function ensureRole(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const supabase = getAdminSupabase();

  const { data: membership, error: membershipError } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id,user_id,role")
    .eq("establishment_id", args.establishmentId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (membershipError) return { ok: false, status: 500, error: membershipError.message };

  const role = (membership as MembershipRow | null)?.role ?? null;
  if (!role) return { ok: false, status: 403, error: "Forbidden" };

  return { ok: true, role };
}

async function ensureCanSubmitProfileUpdate(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const res = await ensureRole(args);
  if (res.ok === false) return res;

  if (res.role !== "owner" && res.role !== "manager") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return res;
}

async function ensureCanCreateTeamMember(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const res = await ensureRole(args);
  if (res.ok === false) return res;

  if (res.role !== "owner") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return res;
}

async function ensureCanManageReservations(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const res = await ensureRole(args);
  if (res.ok === false) return res;

  if (res.role !== "owner" && res.role !== "manager" && res.role !== "reception") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return res;
}

async function ensureCanViewBilling(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const res = await ensureRole(args);
  if (res.ok === false) return res;

  if (res.role !== "owner" && res.role !== "manager" && res.role !== "accounting") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return res;
}

async function ensureCanManageInventory(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const res = await ensureRole(args);
  if (res.ok === false) return res;

  if (res.role !== "owner" && res.role !== "manager" && res.role !== "marketing") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return res;
}

async function ensureCanManageOffers(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const res = await ensureRole(args);
  if (res.ok === false) return res;

  if (res.role !== "owner" && res.role !== "manager" && res.role !== "marketing") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return res;
}

export const listMyMemberships: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_establishment_memberships")
    .select("*")
    .eq("user_id", userResult.user.id)
    .order("establishment_id", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, memberships: data ?? [] });
};

export const listMyEstablishments: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const { data: memberships, error: membershipsError } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id")
    .eq("user_id", userResult.user.id)
    .limit(200);

  if (membershipsError) return res.status(500).json({ error: membershipsError.message });

  const establishmentIds = (memberships ?? [])
    .map((m) => (isRecord(m) ? asString(m.establishment_id) : undefined))
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (!establishmentIds.length) return res.json({ ok: true, establishments: [] });

  const { data: establishments, error: establishmentsError } = await supabase
    .from("establishments")
    .select("*")
    .in("id", establishmentIds)
    .order("created_at", { ascending: false });

  if (establishmentsError) return res.status(500).json({ error: establishmentsError.message });

  res.json({ ok: true, establishments: establishments ?? [] });
};

// ---------------------------------------------------------------------------
// Password Management for Pro Users
// ---------------------------------------------------------------------------

/**
 * GET /api/pro/me/check-password-status
 * Check if the user must change their password (for first login flow)
 */
export const checkPasswordStatus: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  // Check the pro_profiles table for must_change_password flag
  const { data: profile, error } = await supabase
    .from("pro_profiles")
    .select("must_change_password")
    .eq("user_id", userResult.user.id)
    .maybeSingle();

  if (error) {
    console.error("[checkPasswordStatus] Error:", error);
    return res.json({ mustChange: false });
  }

  const mustChange = profile?.must_change_password === true;
  res.json({ mustChange });
};

/**
 * POST /api/pro/me/request-password-reset
 * Send a password reset email to the authenticated Pro user
 */
export const requestPasswordReset: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const user = userResult.user;
  const email = user.email;

  if (!email) {
    return res.status(400).json({ error: "No email associated with this account" });
  }

  const supabase = getAdminSupabase();
  const baseUrl = (process.env.PUBLIC_URL ?? "https://sortiraumaroc.com").replace(/\/+$/, "");

  try {
    // Generate a password reset link using Supabase Admin
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${baseUrl}/pro?tab=account&reset=1`,
      },
    });

    if (error) {
      console.error("[requestPasswordReset] Supabase error:", error);
      return res.status(500).json({ error: "Impossible de générer le lien de réinitialisation" });
    }

    const resetLink = data?.properties?.action_link;
    if (!resetLink) {
      return res.status(500).json({ error: "Lien de réinitialisation non généré" });
    }

    // Send the email using our template system
    await sendTemplateEmail({
      templateKey: "pro_password_reset",
      fromKey: "noreply",
      lang: "fr",
      to: [email],
      variables: {
        email,
        reset_link: resetLink,
        base_url: baseUrl,
      },
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("[requestPasswordReset] Error:", e);
    res.status(500).json({ error: "Erreur lors de l'envoi de l'email" });
  }
};

/**
 * POST /api/pro/me/change-password
 * Change the password for the authenticated Pro user
 * Requires current password verification
 */
export const changePassword: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const user = userResult.user;
  const email = user.email;

  if (!email) {
    return res.status(400).json({ error: "No email associated with this account" });
  }

  const body = req.body;
  if (!isRecord(body)) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const currentPassword = asString(body.currentPassword);
  const newPassword = asString(body.newPassword);

  if (!currentPassword) {
    return res.status(400).json({ error: "Le mot de passe actuel est requis" });
  }

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caractères" });
  }

  const supabase = getAdminSupabase();

  try {
    // Verify current password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (signInError) {
      return res.status(400).json({ error: "Le mot de passe actuel est incorrect" });
    }

    // Update password using admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("[changePassword] Update error:", updateError);
      // Check for weak password error
      if ((updateError as any).code === "weak_password" || updateError.message?.includes("weak")) {
        return res.status(400).json({
          error: "Le mot de passe est trop faible ou trop courant. Choisissez un mot de passe plus complexe (au moins 8 caractères, avec des lettres, chiffres et caractères spéciaux)."
        });
      }
      return res.status(500).json({ error: "Impossible de changer le mot de passe" });
    }

    // Clear the must_change_password flag if it exists
    await supabase
      .from("pro_profiles")
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    res.json({ ok: true });
  } catch (e) {
    console.error("[changePassword] Error:", e);
    res.status(500).json({ error: "Erreur lors du changement de mot de passe" });
  }
};

export const createProEstablishment: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const name = asString(req.body.name);
  const city = asString(req.body.city);
  const universe = asString(req.body.universe);

  const contactName = asString(req.body.contact_name) ?? asString(req.body.contactName) ?? null;
  const contactPhone = asString(req.body.contact_phone) ?? asString(req.body.contactPhone) ?? null;

  if (!name || name.length < 2) return res.status(400).json({ error: "Nom requis" });
  if (!city || city.length < 2) return res.status(400).json({ error: "Ville requise" });
  if (!universe) return res.status(400).json({ error: "Univers requis" });

  const supabase = getAdminSupabase();

  const { data: created, error: createErr } = await supabase
    .from("establishments")
    .insert({
      name,
      city,
      universe,
      subcategory: universe,
      created_by: userResult.user.id,
      extra: {
        contact_name: contactName,
        contact_phone: contactPhone,
      },
    })
    .select("*")
    .single();

  if (createErr || !created) return res.status(500).json({ error: createErr?.message ?? "Impossible de créer l’établissement" });

  const { error: membershipErr } = await supabase.from("pro_establishment_memberships").insert({
    establishment_id: (created as { id: string }).id,
    user_id: userResult.user.id,
    role: "owner",
  });

  if (membershipErr) {
    await supabase.from("establishments").delete().eq("id", (created as { id: string }).id);
    return res.status(500).json({ error: membershipErr.message });
  }

  return res.json({ ok: true, establishment: created });
};

export const createProOnboardingRequest: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const establishment_name_raw = asString(req.body.establishment_name) ?? asString(req.body.establishmentName);
  const city_raw = asString(req.body.city);
  const universe_raw = asString(req.body.universe);

  const establishment_name = establishment_name_raw ? establishment_name_raw.trim() : null;
  const city = city_raw ? city_raw.trim() : null;
  const universe = universe_raw ? universe_raw.trim() : null;

  const contact_name = asString(req.body.contact_name) ?? asString(req.body.contactName);
  const phone = asString(req.body.phone);

  const email = userResult.user.email ? normalizeEmail(userResult.user.email) : null;

  if (!email) return res.status(400).json({ error: "Email manquant" });

  // Establishment details are optional during signup.
  // If the user starts filling them, require the full set to avoid partial/invalid requests.
  const hasAnyEstablishmentField = !!(establishment_name || city || universe);
  if (hasAnyEstablishmentField) {
    if (!establishment_name || establishment_name.length < 2) {
      return res.status(400).json({ error: "Nom de l’établissement requis" });
    }
    if (!city || city.length < 2) return res.status(400).json({ error: "Ville requise" });
    if (!universe) return res.status(400).json({ error: "Univers requis" });
  }

  const supabase = getAdminSupabase();

  const { error } = await supabase.from("pro_onboarding_requests").insert({
    user_id: userResult.user.id,
    email,
    contact_name: contact_name ?? null,
    phone: phone ?? null,
    establishment_name: establishment_name ?? null,
    city: city ?? null,
    universe: universe ?? null,
    status: "pending",
  });

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true });
};

export const submitEstablishmentProfileUpdate: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanSubmitProfileUpdate({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const update = extractEstablishmentProfileUpdate(req.body);
  if (!Object.keys(update).length) return res.status(400).json({ error: "No changes provided" });

  const supabase = getAdminSupabase();

  // Snapshot current establishment values to generate a per-field change set.
  const { data: establishmentData, error: estError } = await supabase
    .from("establishments")
    .select(
      [
        "id",
        "verified",
        "name",
        "universe",
        "subcategory",
        "specialties",
        "city",
        "postal_code",
        "region",
        "country",
        "address",
        "lat",
        "lng",
        "description_short",
        "description_long",
        "phone",
        "whatsapp",
        "website",
        "social_links",
        "hours",
        "tags",
        "amenities",
        "cover_url",
        "gallery_urls",
        "ambiance_tags",
        "extra",
        "mix_experience",
      ].join(","),
    )
    .eq("id", establishmentId)
    .single();

  if (estError) return res.status(404).json({ error: estError.message });

  const establishmentRecord = (establishmentData ?? {}) as Record<string, unknown>;

  const { data: draft, error: draftError } = await supabase
    .from("establishment_profile_drafts")
    .insert({ establishment_id: establishmentId, created_by: userResult.user.id, data: update, status: "pending" })
    .select("id")
    .single();

  if (draftError) return res.status(500).json({ error: draftError.message });

  const { data: moderation, error: moderationError } = await supabase
    .from("moderation_queue")
    .insert({
      entity_type: "establishment",
      entity_id: establishmentId,
      action: "profile_update",
      payload: { draft_id: draft.id, user_id: userResult.user.id, role: permission.role },
      status: "pending",
    })
    .select("id")
    .single();

  if (moderationError) {
    await supabase.from("establishment_profile_drafts").delete().eq("id", draft.id);
    return res.status(500).json({ error: moderationError.message });
  }

  await supabase.from("establishment_profile_drafts").update({ moderation_id: moderation.id }).eq("id", draft.id);

  const changeRows = Object.entries(update).map(([field, nextValue]) => {
    const prevValue = Object.prototype.hasOwnProperty.call(establishmentRecord, field) ? establishmentRecord[field] : null;
    return {
      draft_id: draft.id,
      establishment_id: establishmentId,
      field,
      before: prevValue ?? null,
      after: nextValue ?? null,
      status: "pending",
    };
  });

  console.log("[Pro Profile Update] Creating changeRows:", changeRows.length, "for draft:", draft.id);
  console.log("[Pro Profile Update] Fields to update:", changeRows.map(r => r.field));

  const { error: changeError } = await supabase.from("establishment_profile_draft_changes").insert(changeRows);

  if (changeError) {
    console.log("[Pro Profile Update] Change insert error:", changeError);
  } else {
    console.log("[Pro Profile Update] Changes inserted successfully");
  }

  if (changeError) {
    await supabase.from("moderation_queue").delete().eq("id", moderation.id);
    await supabase.from("establishment_profile_drafts").delete().eq("id", draft.id);
    return res.status(500).json({ error: changeError.message });
  }

  const { error: statusError } = await supabase
    .from("establishments")
    .update({ edit_status: "pending_modification" })
    .eq("id", establishmentId);

  if (statusError) {
    await supabase.from("establishment_profile_draft_changes").delete().eq("draft_id", draft.id);
    await supabase.from("moderation_queue").delete().eq("id", moderation.id);
    await supabase.from("establishment_profile_drafts").delete().eq("id", draft.id);
    return res.status(500).json({ error: statusError.message });
  }

  try {
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
      category: "moderation",
      title: "Mise à jour de la fiche envoyée",
      body: "Votre fiche établissement a été envoyée en modération.",
      data: { establishmentId, draftId: draft.id, action: "profile_update_submitted" },
    }));

    if (out.length) {
      await supabase.from("pro_notifications").insert(out);
    }
  } catch {
    // ignore (best-effort)
  }

  void emitAdminNotification({
    type: "profile_update_submitted",
    title: "Mise à jour fiche établissement",
    body: `Fiche envoyée en modération · établissement ${establishmentId}`,
    data: { establishmentId, draftId: draft.id, moderationId: moderation.id },
  });

  res.json({ ok: true, draft_id: draft.id, moderation_id: moderation.id });
};

export const listProEstablishmentProfileDrafts: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanSubmitProfileUpdate({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("establishment_profile_drafts")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, drafts: data ?? [] });
};

export const listProEstablishmentProfileDraftChanges: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const draftId = typeof req.params.draftId === "string" ? req.params.draftId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!draftId) return res.status(400).json({ error: "draftId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanSubmitProfileUpdate({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data: draft, error: draftErr } = await supabase
    .from("establishment_profile_drafts")
    .select("id,establishment_id")
    .eq("id", draftId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (draftErr) return res.status(500).json({ error: draftErr.message });
  if (!draft) return res.status(404).json({ error: "draft_not_found" });

  const { data, error } = await supabase
    .from("establishment_profile_draft_changes")
    .select("*")
    .eq("draft_id", draftId)
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, changes: data ?? [] });
};

function isDemoRoutesAllowed(): boolean {
  // Defense-in-depth: even if a demo/seed route gets registered by mistake, it should be a no-op in production.
  if (process.env.NODE_ENV === "production") return false;
  return String(process.env.ALLOW_DEMO_ROUTES ?? "").toLowerCase() === "true";
}

function getDemoProCredentials(): { email: string; password: string } | null {
  if (!isDemoRoutesAllowed()) return null;

  const email = String(process.env.DEMO_PRO_EMAIL ?? "").trim().toLowerCase();
  const password = String(process.env.DEMO_PRO_PASSWORD ?? "").trim();

  if (!email || !email.includes("@") || !password) return null;
  return { email, password };
}

function getDemoProEmail(): string | null {
  return getDemoProCredentials()?.email ?? null;
}

export const createManualReservation: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const startsAtRaw = asString(req.body.starts_at);
  const endsAtRaw = asString(req.body.ends_at);
  const statusRaw = asString(req.body.status);
  const partySizeRaw = asNumber(req.body.party_size);
  const amountTotalRaw = asNumber(req.body.amount_total);
  const amountDepositRaw = asNumber(req.body.amount_deposit);
  const currency = asString(req.body.currency) ?? "MAD";
  const metaInput = asJsonObject(req.body.meta) ?? {};

  if (!startsAtRaw) return res.status(400).json({ error: "starts_at is required" });
  const startsAt = new Date(startsAtRaw);
  if (!Number.isFinite(startsAt.getTime())) return res.status(400).json({ error: "starts_at invalide" });

  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  if (endsAtRaw && (!endsAt || !Number.isFinite(endsAt.getTime()))) return res.status(400).json({ error: "ends_at invalide" });

  const allowedStatuses = new Set([
    "requested",
    "pending_pro_validation",
    "confirmed",
    "refused",
    "waitlist",
    "cancelled",
    "cancelled_user",
    "cancelled_pro",
    "noshow",
  ]);
  const status = statusRaw && allowedStatuses.has(statusRaw) ? statusRaw : "requested";

  // payment_status is managed server-side (webhook/admin). Manual reservations always start as pending.
  const payment_status = "pending";

  const party_size = typeof partySizeRaw === "number" && Number.isFinite(partySizeRaw) && partySizeRaw > 0 ? Math.round(partySizeRaw) : null;
  const amount_total = typeof amountTotalRaw === "number" && Number.isFinite(amountTotalRaw) && amountTotalRaw >= 0 ? Math.round(amountTotalRaw) : null;

  // Check if reservation payments are enabled (Phase 1 = disabled)
  const paymentsEnabled = await isReservationPaymentsEnabled();
  const commissionsEnabled = await isCommissionsEnabled();

  // In test mode (Phase 1), ignore deposits and commissions
  const amount_deposit = paymentsEnabled && typeof amountDepositRaw === "number" && Number.isFinite(amountDepositRaw) && amountDepositRaw >= 0
    ? Math.round(amountDepositRaw)
    : null;

  const supabase = getAdminSupabase();

  const { data: est, error: estErr } = await supabase.from("establishments").select("universe").eq("id", establishmentId).maybeSingle();
  if (estErr) return res.status(500).json({ error: estErr.message });

  const kind = asString(req.body.kind) ?? (typeof (est as { universe?: unknown } | null)?.universe === "string" ? (est as { universe: string }).universe : "unknown");

  // In test mode (Phase 1), no commissions
  const commission_percent = commissionsEnabled ? 10 : 0;
  const commission_amount = commissionsEnabled && amount_deposit ? Math.round((amount_deposit * commission_percent) / 100) : null;

  const meta = {
    ...metaInput,
    source: "manual",
    created_by_pro: userResult.user.id,
    created_by_role: permission.role,
  };

  const { data: created, error: createErr } = await supabase
    .from("reservations")
    .insert({
      booking_reference: `PRO-${establishmentId.slice(0, 6)}-${randomUUID().slice(0, 8)}`,
      kind,
      establishment_id: establishmentId,
      user_id: null,
      status,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt ? endsAt.toISOString() : null,
      party_size,
      amount_total,
      amount_deposit,
      currency,
      payment_status,
      commission_percent,
      commission_amount,
      checked_in_at: null,
      meta,
    })
    .select("id")
    .single();

  if (createErr || !created) return res.status(500).json({ error: createErr?.message ?? "Impossible de créer la réservation" });

  res.json({ ok: true, reservation_id: (created as { id: string }).id });
};

export const listProReservations: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("starts_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, reservations: data ?? [] });
};

function isOfferExpiredByIso(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return true;
  return ts < Date.now();
}

type ProWaitlistEntryRow = {
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
};

async function expireWaitlistEntryBestEffortPro(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  entry: ProWaitlistEntryRow;
  actorUserId: string;
  reason: string;
}): Promise<void> {
  try {
    if (!args.entry?.id) return;
    if (args.entry.status !== "offer_sent") return;
    if (!isOfferExpiredByIso(args.entry.offer_expires_at)) return;

    const nowIso = new Date().toISOString();

    await args.supabase
      .from("waitlist_entries")
      .update({ status: "offer_expired", offer_expires_at: null, updated_at: nowIso })
      .eq("id", args.entry.id);

    await args.supabase.from("waitlist_events").insert({
      waitlist_entry_id: args.entry.id,
      reservation_id: args.entry.reservation_id,
      establishment_id: null,
      slot_id: args.entry.slot_id,
      user_id: args.entry.user_id,
      event_type: "waitlist_offer_expired",
      actor_role: "pro",
      actor_user_id: args.actorUserId,
      metadata: { reason: args.reason, offer_expires_at: args.entry.offer_expires_at },
    });

    await args.supabase.from("system_logs").insert({
      actor_user_id: args.actorUserId,
      actor_role: "pro",
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
        actorRole: "pro",
        actorUserId: args.actorUserId,
        reason: "offer_expired_lazy_check",
      });
    }

    args.entry.status = "offer_expired";
    args.entry.offer_expires_at = null;
  } catch {
    // ignore
  }
}

export const listProWaitlist: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const statusRaw = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "active";
  const statusFilter = statusRaw === "waiting" || statusRaw === "offer_sent" || statusRaw === "active" || statusRaw === "all" ? statusRaw : "active";

  const supabase = getAdminSupabase();

  let query = supabase
    .from("waitlist_entries")
    .select(
      "id,reservation_id,slot_id,user_id,status,position,offer_sent_at,offer_expires_at,created_at,updated_at,reservations!inner(id,booking_reference,establishment_id,starts_at,party_size,status,meta,created_at)",
    )
    .eq("reservations.establishment_id", establishmentId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(300);

  if (statusFilter === "waiting") {
    query = query.in("status", ["waiting", "queued"]);
  } else if (statusFilter === "offer_sent") {
    query = query.in("status", ["offer_sent"]);
  } else if (statusFilter === "active") {
    query = query.in("status", ["waiting", "queued", "offer_sent"]);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const rows = (data ?? []) as any[];
  const entries: Array<ProWaitlistEntryRow & { reservation: any | null }> = rows.map((r) => ({
    id: String(r?.id ?? ""),
    reservation_id: String(r?.reservation_id ?? ""),
    slot_id: typeof r?.slot_id === "string" ? r.slot_id : null,
    user_id: String(r?.user_id ?? ""),
    status: String(r?.status ?? ""),
    position: typeof r?.position === "number" ? r.position : null,
    offer_sent_at: typeof r?.offer_sent_at === "string" ? r.offer_sent_at : null,
    offer_expires_at: typeof r?.offer_expires_at === "string" ? r.offer_expires_at : null,
    created_at: typeof r?.created_at === "string" ? r.created_at : "",
    updated_at: typeof r?.updated_at === "string" ? r.updated_at : "",
    reservation: (r as any)?.reservations ?? null,
  }));

  for (const e of entries) {
    // eslint-disable-next-line no-await-in-loop
    await expireWaitlistEntryBestEffortPro({ supabase, entry: e, actorUserId: userResult.user.id, reason: "pro_list" });
  }

  res.json({ ok: true, items: entries });
};

export const sendProWaitlistOffer: RequestHandler = async (req, res) => {
  const entryId = typeof req.params.id === "string" ? req.params.id : "";
  if (!entryId || !looksLikeUuid(entryId)) return res.status(400).json({ error: "invalid_waitlist_id" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const { data: entry, error: entryErr } = await supabase
    .from("waitlist_entries")
    .select("id,reservation_id,slot_id,status,user_id")
    .eq("id", entryId)
    .maybeSingle();

  if (entryErr) return res.status(500).json({ error: entryErr.message });
  if (!(entry as any)?.id) return res.status(404).json({ error: "waitlist_entry_not_found" });

  const reservationId = String((entry as any).reservation_id ?? "");
  if (!reservationId) return res.status(409).json({ error: "missing_reservation_id" });

  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("id,establishment_id,slot_id")
    .eq("id", reservationId)
    .maybeSingle();

  if (resErr) return res.status(500).json({ error: resErr.message });
  const establishmentId = String((reservation as any)?.establishment_id ?? "");
  if (!establishmentId) return res.status(409).json({ error: "missing_establishment_id" });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const bodySlotId = isRecord(req.body) ? (asString((req.body as any).slot_id) ?? asString((req.body as any).slotId)) : undefined;
  const slotId = bodySlotId ?? (typeof (entry as any)?.slot_id === "string" ? String((entry as any).slot_id) : String((reservation as any)?.slot_id ?? ""));
  if (!slotId || !looksLikeUuid(slotId)) return res.status(409).json({ error: "missing_slot_id" });
  if (bodySlotId && bodySlotId !== slotId) return res.status(400).json({ error: "slot_id_mismatch" });

  const result = await triggerWaitlistPromotionForSlot({
    supabase: supabase as any,
    slotId,
    actorRole: "pro",
    actorUserId: userResult.user.id,
    reason: "pro_manual_send_offer",
  });

  await supabase.from("system_logs").insert({
    actor_user_id: userResult.user.id,
    actor_role: "pro",
    action: "waitlist.offer_sent",
    entity_type: "waitlist_entry",
    entity_id: entryId,
    payload: {
      establishment_id: establishmentId,
      slot_id: slotId,
      requested_entry_id: entryId,
      result,
    },
  });

  res.json({ ok: true, result });
};

export const closeProWaitlistEntry: RequestHandler = async (req, res) => {
  const entryId = typeof req.params.id === "string" ? req.params.id : "";
  if (!entryId || !looksLikeUuid(entryId)) return res.status(400).json({ error: "invalid_waitlist_id" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const { data: entry, error: entryErr } = await supabase
    .from("waitlist_entries")
    .select("id,reservation_id,slot_id,status,user_id")
    .eq("id", entryId)
    .maybeSingle();

  if (entryErr) return res.status(500).json({ error: entryErr.message });
  if (!(entry as any)?.id) return res.status(404).json({ error: "waitlist_entry_not_found" });

  const reservationId = String((entry as any).reservation_id ?? "");
  if (!reservationId) return res.status(409).json({ error: "missing_reservation_id" });

  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("id,establishment_id")
    .eq("id", reservationId)
    .maybeSingle();

  if (resErr) return res.status(500).json({ error: resErr.message });
  const establishmentId = String((reservation as any)?.establishment_id ?? "");
  if (!establishmentId) return res.status(409).json({ error: "missing_establishment_id" });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const reason = isRecord(req.body) ? (asString((req.body as any).reason) ?? asString((req.body as any).message) ?? "") : "";
  const nowIso = new Date().toISOString();

  await supabase
    .from("waitlist_entries")
    .update({ status: "removed", offer_expires_at: null, updated_at: nowIso, meta: { reason: reason || null } })
    .eq("id", entryId);

  await supabase.from("waitlist_events").insert({
    waitlist_entry_id: entryId,
    reservation_id: reservationId,
    establishment_id: establishmentId,
    slot_id: (entry as any)?.slot_id ?? null,
    user_id: (entry as any)?.user_id ?? null,
    event_type: "waitlist_removed_by_pro",
    actor_role: "pro",
    actor_user_id: userResult.user.id,
    metadata: { reason: reason || null },
  });

  await supabase.from("system_logs").insert({
    actor_user_id: userResult.user.id,
    actor_role: "pro",
    action: "waitlist.removed_by_pro",
    entity_type: "waitlist_entry",
    entity_id: entryId,
    payload: { establishment_id: establishmentId, reservation_id: reservationId, reason: reason || null },
  });

  res.json({ ok: true });
};

export const listProReservationMessageTemplates: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("reservation_messages_templates")
    .select("id,owner_type,owner_id,code,label,body,is_active,created_at,updated_at")
    .or(`owner_type.eq.global,and(owner_type.eq.pro,owner_id.eq.${establishmentId})`)
    .order("owner_type", { ascending: true })
    .order("label", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, templates: data ?? [] });
};

export const createProReservationMessageTemplate: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const code = asString(req.body.code) ?? "";
  const label = asString(req.body.label) ?? "";
  const body = asString(req.body.body) ?? "";
  const isActive = typeof req.body.is_active === "boolean" ? req.body.is_active : true;

  if (!code.trim()) return res.status(400).json({ error: "code is required" });
  if (!label.trim()) return res.status(400).json({ error: "label is required" });
  if (!body.trim()) return res.status(400).json({ error: "body is required" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("reservation_messages_templates")
    .insert({
      owner_type: "pro",
      owner_id: establishmentId,
      code: code.trim(),
      label: label.trim(),
      body: body.trim(),
      is_active: isActive,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, id: (data as { id: string } | null)?.id ?? null });
};

export const updateProReservationMessageTemplate: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const templateId = typeof req.params.templateId === "string" ? req.params.templateId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!templateId) return res.status(400).json({ error: "templateId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const code = asString(req.body.code);
  const label = asString(req.body.label);
  const body = asString(req.body.body);
  const isActive = typeof req.body.is_active === "boolean" ? req.body.is_active : undefined;

  const patch: Record<string, unknown> = {};
  if (code !== undefined) {
    if (!code.trim()) return res.status(400).json({ error: "code is required" });
    patch.code = code.trim();
  }
  if (label !== undefined) {
    if (!label.trim()) return res.status(400).json({ error: "label is required" });
    patch.label = label.trim();
  }
  if (body !== undefined) {
    if (!body.trim()) return res.status(400).json({ error: "body is required" });
    patch.body = body.trim();
  }
  if (isActive !== undefined) patch.is_active = isActive;

  if (!Object.keys(patch).length) return res.status(400).json({ error: "No changes provided" });

  const supabase = getAdminSupabase();

  const { data: existing, error: existingErr } = await supabase
    .from("reservation_messages_templates")
    .select("id, owner_type, owner_id")
    .eq("id", templateId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });

  const row = existing as { id: string; owner_type: string; owner_id: string | null } | null;
  if (!row?.id) return res.status(404).json({ error: "Template introuvable" });

  // Only PRO-owned templates are editable from the PRO space
  if (row.owner_type !== "pro" || row.owner_id !== establishmentId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { error } = await supabase
    .from("reservation_messages_templates")
    .update(patch)
    .eq("id", templateId)
    .eq("owner_type", "pro")
    .eq("owner_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

export const listProOffers: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const [{ data: slots, error: slotsErr }, { data: packs, error: packsErr }] = await Promise.all([
    supabase
      .from("pro_slots")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("starts_at", { ascending: true })
      .limit(300),
    supabase
      .from("packs")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (slotsErr) return res.status(500).json({ error: slotsErr.message });
  if (packsErr) return res.status(500).json({ error: packsErr.message });

  const slotArr = (slots ?? []) as Array<{ id: string; starts_at: string; capacity: number | null }>;

  const usedBySlotId = new Map<string, number>();
  const usedByStartsAtIso = new Map<string, number>();

  const minStartsAt = slotArr[0]?.starts_at ?? null;
  const maxStartsAt = slotArr[slotArr.length - 1]?.starts_at ?? null;

  if (slotArr.length && minStartsAt && maxStartsAt) {
    const slotIds = slotArr.map((s) => s.id);

    const [{ data: bySlot }, { data: byTime }] = await Promise.all([
      supabase
        .from("reservations")
        .select("slot_id, party_size")
        .in("slot_id", slotIds)
        .in("status", ["confirmed", "pending_pro_validation", "requested"])
        .limit(5000),
      supabase
        .from("reservations")
        .select("starts_at, party_size")
        .eq("establishment_id", establishmentId)
        .is("slot_id", null)
        .in("status", ["confirmed", "pending_pro_validation", "requested"])
        .gte("starts_at", minStartsAt)
        .lte("starts_at", maxStartsAt)
        .limit(5000),
    ]);

    for (const r of (bySlot ?? []) as Array<{ slot_id: string | null; party_size: number | null }>) {
      const slotId = r.slot_id;
      if (!slotId) continue;
      const size = typeof r.party_size === "number" && Number.isFinite(r.party_size) ? Math.max(0, Math.round(r.party_size)) : 0;
      usedBySlotId.set(slotId, (usedBySlotId.get(slotId) ?? 0) + size);
    }

    for (const r of (byTime ?? []) as Array<{ starts_at: string; party_size: number | null }>) {
      const startsAt = String(r.starts_at ?? "").trim();
      if (!startsAt) continue;
      const size = typeof r.party_size === "number" && Number.isFinite(r.party_size) ? Math.max(0, Math.round(r.party_size)) : 0;
      usedByStartsAtIso.set(startsAt, (usedByStartsAtIso.get(startsAt) ?? 0) + size);
    }
  }

  const slotsWithRemaining = slotArr.map((s) => {
    const cap = typeof s.capacity === "number" && Number.isFinite(s.capacity) ? Math.max(0, Math.round(s.capacity)) : null;
    const used = usedBySlotId.get(s.id) ?? usedByStartsAtIso.get(s.starts_at) ?? 0;
    const remaining_capacity = cap == null ? null : Math.max(0, cap - used);
    return { ...(s as Record<string, unknown>), remaining_capacity };
  });

  res.json({ ok: true, slots: slotsWithRemaining, packs: packs ?? [] });
};

export const upsertProSlots: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  if (!Array.isArray(req.body.slots)) return res.status(400).json({ error: "slots is required" });

  const slots = req.body.slots as unknown[];
  if (!slots.length) return res.status(400).json({ error: "slots is required" });

  const rows: Record<string, unknown>[] = [];

  for (const raw of slots) {
    if (!isRecord(raw)) return res.status(400).json({ error: "Invalid slot" });

    const startsRaw = asString(raw.starts_at);
    const endsRaw = asString(raw.ends_at);
    const capacity = asNumber(raw.capacity);

    if (!startsRaw || !endsRaw) return res.status(400).json({ error: "starts_at/ends_at are required" });

    const startsMs = Date.parse(startsRaw);
    const endsMs = Date.parse(endsRaw);
    if (!Number.isFinite(startsMs) || !Number.isFinite(endsMs)) {
      return res.status(400).json({ error: "starts_at/ends_at are invalid ISO datetimes" });
    }
    if (endsMs <= startsMs) {
      return res.status(400).json({ error: "ends_at must be after starts_at" });
    }

    if (capacity === undefined || !Number.isFinite(capacity) || capacity <= 0) {
      return res.status(400).json({ error: "capacity must be > 0" });
    }

    const starts_at = new Date(startsMs).toISOString();
    const ends_at = new Date(endsMs).toISOString();

    const base_price = raw.base_price === null ? null : asNumber(raw.base_price);
    const promo_type = raw.promo_type === null ? null : asString(raw.promo_type);
    const promo_value = raw.promo_value === null ? null : asNumber(raw.promo_value);
    const promo_label = raw.promo_label === null ? null : asString(raw.promo_label);
    const service_label = raw.service_label === null ? null : asString(raw.service_label);
    const active = asBoolean(raw.active);

    rows.push({
      establishment_id: establishmentId,
      starts_at,
      ends_at,
      capacity: Math.max(1, Math.round(capacity)),
      base_price: base_price === undefined ? null : Math.max(0, Math.round(base_price)),
      promo_type: promo_type === undefined ? null : promo_type,
      promo_value: promo_value === undefined ? null : Math.max(0, Math.round(promo_value)),
      promo_label: promo_label === undefined ? null : promo_label,
      service_label: service_label === undefined ? null : service_label,
      active: active === undefined ? true : active,
    });
  }

  const supabase = getAdminSupabase();

  // Hard business rule: do not allow overlapping slots for the same establishment.
  // We validate overlaps within the request AND against existing slots, before writing.
  const times = rows
    .map((r) => {
      const s = typeof r.starts_at === "string" ? r.starts_at : "";
      const e = typeof r.ends_at === "string" ? r.ends_at : "";
      const sMs = s ? Date.parse(s) : NaN;
      const eMs = e ? Date.parse(e) : NaN;
      return { starts_at: s, ends_at: e, sMs, eMs };
    })
    .filter((t) => Number.isFinite(t.sMs) && Number.isFinite(t.eMs))
    .sort((a, b) => a.sMs - b.sMs);

  for (let i = 1; i < times.length; i++) {
    const prev = times[i - 1];
    const cur = times[i];
    if (cur.sMs < prev.eMs) {
      return res.status(409).json({
        error: "slot_overlap",
        message: "Les créneaux ne doivent pas se chevaucher.",
        conflict: { a: { starts_at: prev.starts_at, ends_at: prev.ends_at }, b: { starts_at: cur.starts_at, ends_at: cur.ends_at } },
      });
    }
  }

  const minStartMs = times.reduce((acc, t) => Math.min(acc, t.sMs), Number.POSITIVE_INFINITY);
  const maxEndMs = times.reduce((acc, t) => Math.max(acc, t.eMs), Number.NEGATIVE_INFINITY);

  if (Number.isFinite(minStartMs) && Number.isFinite(maxEndMs)) {
    const minStartIso = new Date(minStartMs).toISOString();
    const maxEndIso = new Date(maxEndMs).toISOString();

    const { data: existingSlots, error: overlapsErr } = await supabase
      .from("pro_slots")
      .select("id,starts_at,ends_at")
      .eq("establishment_id", establishmentId)
      .lt("starts_at", maxEndIso)
      .gt("ends_at", minStartIso)
      .limit(5000);

    if (overlapsErr) return res.status(500).json({ error: overlapsErr.message });

    const existingTimes = (existingSlots ?? [])
      .map((s) => {
        const startsAt = typeof (s as any).starts_at === "string" ? String((s as any).starts_at).trim() : "";
        const endsAt = typeof (s as any).ends_at === "string" ? String((s as any).ends_at).trim() : "";
        const sMs = startsAt ? Date.parse(startsAt) : NaN;
        const eMs = endsAt ? Date.parse(endsAt) : NaN;
        const id = typeof (s as any).id === "string" ? String((s as any).id) : "";
        return { id, startsAt, endsAt, sMs, eMs };
      })
      .filter((x) => x.id && Number.isFinite(x.sMs) && Number.isFinite(x.eMs));

    for (const incoming of times) {
      for (const ex of existingTimes) {
        // upsert is keyed by (establishment_id, starts_at) so this is the same logical slot.
        if (ex.startsAt === incoming.starts_at) continue;

        const overlaps = ex.sMs < incoming.eMs && ex.eMs > incoming.sMs;
        if (overlaps) {
          return res.status(409).json({
            error: "slot_overlap",
            message: "Ce créneau chevauche un créneau existant.",
            existing_slot_id: ex.id,
            conflict: {
              existing: { starts_at: ex.startsAt, ends_at: ex.endsAt },
              incoming: { starts_at: incoming.starts_at, ends_at: incoming.ends_at },
            },
          });
        }
      }
    }
  }

  const { error } = await supabase.from("pro_slots").upsert(rows, { onConflict: "establishment_id,starts_at" });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, upserted: rows.length });
};

export const deleteProSlot: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const slotId = typeof req.params.slotId === "string" ? req.params.slotId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!slotId) return res.status(400).json({ error: "slotId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("pro_slots").delete().eq("id", slotId).eq("establishment_id", establishmentId);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

/**
 * Middleware de validation pour createProPack
 * Utilise Zod pour valider le body de la requête
 */
export const validateCreateProPack = validateBody(createPackSchema);

export const createProPack: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  // Utiliser les données validées par Zod si disponibles, sinon fallback sur l'ancien comportement
  const validatedBody = req.validatedBody as CreatePackInput | undefined;

  const title = validatedBody?.title ?? asString(req.body?.title);
  const price = validatedBody?.price ?? asNumber(req.body?.price);

  if (!title || !title.trim()) return res.status(400).json({ error: "title is required" });
  if (price === undefined || !Number.isFinite(price) || price <= 0) return res.status(400).json({ error: "price is required" });

  const supabase = getAdminSupabase();

  // Check for duplicate pack (same title and price for this establishment)
  const { data: existingPacks } = await supabase
    .from("packs")
    .select("id, title")
    .eq("establishment_id", establishmentId)
    .ilike("title", title.trim())
    .eq("price", Math.round(price));

  if (existingPacks && existingPacks.length > 0) {
    return res.status(409).json({ error: `Un pack "${existingPacks[0].title}" avec ce prix existe déjà.` });
  }

  // Utiliser les données validées pour l'insertion
  const body = validatedBody ?? req.body;

  const { data, error } = await supabase
    .from("packs")
    .insert({
      establishment_id: establishmentId,
      title: title.trim(),
      description: body.description ?? null,
      label: body.label ?? null,
      items: body.items ?? [],
      price: Math.round(price),
      original_price: body.original_price ?? null,
      is_limited: body.is_limited ?? false,
      stock: body.stock ?? null,
      availability: body.availability ?? "permanent",
      max_reservations: body.max_reservations ?? null,
      active: body.active ?? true,
      valid_from: body.valid_from ?? null,
      valid_to: body.valid_to ?? null,
      conditions: body.conditions ?? null,
      cover_url: body.cover_url ?? null,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: "Erreur lors de la création du pack" });

  res.json({ ok: true, id: (data as { id: string } | null)?.id ?? null });
};

export const deleteProPack: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const packId = typeof req.params.packId === "string" ? req.params.packId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!packId) return res.status(400).json({ error: "packId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("packs").delete().eq("id", packId).eq("establishment_id", establishmentId);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

export const updateProPack: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const packId = typeof req.params.packId === "string" ? req.params.packId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!packId) return res.status(400).json({ error: "packId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const supabase = getAdminSupabase();

  // Build update object only with provided fields
  const updates: Record<string, unknown> = {};

  if (typeof req.body.title === "string") {
    const title = req.body.title.trim();
    if (!title) return res.status(400).json({ error: "title cannot be empty" });
    updates.title = title;
  }

  if (typeof req.body.description === "string") {
    updates.description = req.body.description.trim() || null;
  } else if (req.body.description === null) {
    updates.description = null;
  }

  if (typeof req.body.label === "string") {
    updates.label = req.body.label.trim() || null;
  } else if (req.body.label === null) {
    updates.label = null;
  }

  if (typeof req.body.price === "number" && Number.isFinite(req.body.price) && req.body.price > 0) {
    updates.price = Math.round(req.body.price);
  }

  if (typeof req.body.original_price === "number" && Number.isFinite(req.body.original_price)) {
    updates.original_price = Math.round(req.body.original_price);
  } else if (req.body.original_price === null) {
    updates.original_price = null;
  }

  if (typeof req.body.is_limited === "boolean") {
    updates.is_limited = req.body.is_limited;
  }

  if (typeof req.body.stock === "number" && Number.isFinite(req.body.stock)) {
    updates.stock = Math.round(req.body.stock);
  } else if (req.body.stock === null) {
    updates.stock = null;
  }

  if (typeof req.body.availability === "string") {
    updates.availability = req.body.availability;
  }

  if (typeof req.body.active === "boolean") {
    updates.active = req.body.active;
  }

  if (typeof req.body.valid_from === "string") {
    updates.valid_from = req.body.valid_from.trim() || null;
  } else if (req.body.valid_from === null) {
    updates.valid_from = null;
  }

  if (typeof req.body.valid_to === "string") {
    updates.valid_to = req.body.valid_to.trim() || null;
  } else if (req.body.valid_to === null) {
    updates.valid_to = null;
  }

  if (typeof req.body.conditions === "string") {
    updates.conditions = req.body.conditions.trim() || null;
  } else if (req.body.conditions === null) {
    updates.conditions = null;
  }

  if (typeof req.body.cover_url === "string") {
    updates.cover_url = req.body.cover_url.trim() || null;
  } else if (req.body.cover_url === null) {
    updates.cover_url = null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("packs")
    .update(updates)
    .eq("id", packId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

function defaultBookingPolicy(establishmentId: string) {
  return {
    establishment_id: establishmentId,
    cancellation_enabled: false,
    free_cancellation_hours: 24,
    cancellation_penalty_percent: 50,
    no_show_penalty_percent: 100,
    no_show_always_100_guaranteed: true,
    cancellation_text_fr: "",
    cancellation_text_en: "",
    modification_enabled: true,
    modification_deadline_hours: 2,
    require_guarantee_below_score: null as number | null,
    modification_text_fr: "",
    modification_text_en: "",
    // Deposit per person in MAD. If null or 0, guaranteed booking is disabled.
    deposit_per_person: null as number | null,
  };
}

export const getProBookingPolicy: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase.from("booking_policies").select("*").eq("establishment_id", establishmentId).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });

  const defaults = defaultBookingPolicy(establishmentId);
  const row = data ? ({ ...defaults, ...(data as Record<string, unknown>) } as Record<string, unknown>) : (defaults as Record<string, unknown>);

  res.json({ ok: true, policy: row });
};

export const updateProBookingPolicy: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const patch: Record<string, unknown> = {};

  const cancellation_enabled = asBoolean(req.body.cancellation_enabled);
  if (cancellation_enabled !== undefined) patch.cancellation_enabled = cancellation_enabled;

  const free_cancellation_hours = asNumber(req.body.free_cancellation_hours);
  if (free_cancellation_hours !== undefined) patch.free_cancellation_hours = Math.max(0, Math.round(free_cancellation_hours));

  const cancellation_penalty_percent = asNumber(req.body.cancellation_penalty_percent);
  if (cancellation_penalty_percent !== undefined) patch.cancellation_penalty_percent = Math.min(100, Math.max(0, Math.round(cancellation_penalty_percent)));

  const no_show_penalty_percent = asNumber(req.body.no_show_penalty_percent);
  if (no_show_penalty_percent !== undefined) patch.no_show_penalty_percent = Math.min(100, Math.max(0, Math.round(no_show_penalty_percent)));

  const no_show_always_100_guaranteed = asBoolean(req.body.no_show_always_100_guaranteed);
  if (no_show_always_100_guaranteed !== undefined) patch.no_show_always_100_guaranteed = no_show_always_100_guaranteed;

  if (typeof req.body.cancellation_text_fr === "string") patch.cancellation_text_fr = req.body.cancellation_text_fr;
  if (typeof req.body.cancellation_text_en === "string") patch.cancellation_text_en = req.body.cancellation_text_en;

  const modification_enabled = asBoolean(req.body.modification_enabled);
  if (modification_enabled !== undefined) patch.modification_enabled = modification_enabled;

  const modification_deadline_hours = asNumber(req.body.modification_deadline_hours);
  if (modification_deadline_hours !== undefined) patch.modification_deadline_hours = Math.max(0, Math.round(modification_deadline_hours));

  const requireScoreRaw = req.body.require_guarantee_below_score;
  if (requireScoreRaw === null) {
    patch.require_guarantee_below_score = null;
  } else {
    const requireScore = asNumber(requireScoreRaw);
    if (requireScore !== undefined) patch.require_guarantee_below_score = Math.min(100, Math.max(0, Math.round(requireScore)));
  }

  if (typeof req.body.modification_text_fr === "string") patch.modification_text_fr = req.body.modification_text_fr;
  if (typeof req.body.modification_text_en === "string") patch.modification_text_en = req.body.modification_text_en;

  // Deposit per person handling: null disables guaranteed booking, 0+ enables it
  const depositRaw = req.body.deposit_per_person;
  if (depositRaw === null) {
    patch.deposit_per_person = null;
  } else {
    const depositAmount = asNumber(depositRaw);
    if (depositAmount !== undefined) patch.deposit_per_person = Math.max(0, Math.round(depositAmount));
  }

  if (!Object.keys(patch).length) return res.status(400).json({ error: "No changes provided" });

  patch.updated_at = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("booking_policies")
    .upsert({ establishment_id: establishmentId, ...(patch as Record<string, unknown>) }, { onConflict: "establishment_id" });

  if (error) return res.status(500).json({ error: error.message });

  const { data, error: getErr } = await supabase.from("booking_policies").select("*").eq("establishment_id", establishmentId).maybeSingle();
  if (getErr) return res.status(500).json({ error: getErr.message });

  const defaults = defaultBookingPolicy(establishmentId);
  const row = data ? ({ ...defaults, ...(data as Record<string, unknown>) } as Record<string, unknown>) : (defaults as Record<string, unknown>);

  res.json({ ok: true, policy: row });
};

function normalizeConsumerPromoCode(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, "") : "";
  return s ? s : null;
}

function generateSamPromoCode(suffixLength = 10): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const n = Math.max(6, Math.min(32, Math.round(suffixLength)));
  const bytes = randomBytes(n);

  let out = "SAM";
  for (let i = 0; i < n; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

type ProConsumerPromoCodeInput = {
  code?: unknown;
  description?: unknown;
  discount_bps?: unknown;
  active?: unknown;
  is_public?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  max_uses_total?: unknown;
  max_uses_per_user?: unknown;
};

export const listProConsumerPromoCodes: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const select =
    "id,code,description,discount_bps,applies_to_pack_id,applies_to_establishment_ids,active,is_public,starts_at,ends_at,max_uses_total,max_uses_per_user,created_at,updated_at,deleted_at";

  const { data, error } = await supabase
    .from("consumer_promo_codes")
    .select(select)
    .contains("applies_to_establishment_ids", [establishmentId])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (/relation .*consumer_promo_codes.* does not exist/i.test(error.message)) {
      return res.json({ ok: true, promo_codes: [] });
    }
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, promo_codes: data ?? [] });
};

export const createProConsumerPromoCode: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const body = req.body as ProConsumerPromoCodeInput;

  const providedCode = normalizeConsumerPromoCode(body.code);
  const shouldGenerateCode = !providedCode;
  let code = providedCode ?? generateSamPromoCode();

  const discountBps = Math.max(0, Math.min(10000, safeInt(body.discount_bps)));
  if (discountBps <= 0) return res.status(400).json({ error: "discount_bps must be > 0" });

  const startsAt = body.starts_at === null ? null : parseIsoDatetimeOrNull(body.starts_at);
  const endsAt = body.ends_at === null ? null : parseIsoDatetimeOrNull(body.ends_at);
  if (startsAt && endsAt) {
    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);
    if (endDate.getTime() < startDate.getTime()) return res.status(400).json({ error: "ends_at must be >= starts_at" });
  }

  const maxUsesTotalRaw = body.max_uses_total === null ? null : safeInt(body.max_uses_total);
  const maxUsesPerUserRaw = body.max_uses_per_user === null ? null : safeInt(body.max_uses_per_user);
  const maxUsesTotal = maxUsesTotalRaw != null && maxUsesTotalRaw >= 1 ? maxUsesTotalRaw : null;
  const maxUsesPerUser = maxUsesPerUserRaw != null && maxUsesPerUserRaw >= 1 ? maxUsesPerUserRaw : null;

  const isPublic = typeof body.is_public === "boolean" ? body.is_public : false;

  const supabase = getAdminSupabase();

  for (let attempt = 0; attempt < 8; attempt++) {
    const payload: Record<string, unknown> = {
      code,
      description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
      discount_bps: discountBps,
      applies_to_pack_id: null,
      applies_to_establishment_ids: [establishmentId],
      active: typeof body.active === "boolean" ? body.active : true,
      is_public: isPublic,
      starts_at: startsAt,
      ends_at: endsAt,
      max_uses_total: maxUsesTotal,
      max_uses_per_user: maxUsesPerUser,
    };

    const { data, error } = await supabase.from("consumer_promo_codes").insert(payload).select("*").single();
    if (!error) return res.json({ ok: true, promo_code: data });

    // Collision on code (unique constraint)
    if (/duplicate key value violates unique constraint/i.test(error.message)) {
      if (!shouldGenerateCode) return res.status(409).json({ error: "code_already_exists" });
      code = generateSamPromoCode();
      continue;
    }

    return res.status(500).json({ error: error.message });
  }

  return res.status(500).json({ error: "unable_to_generate_code" });
};

export const updateProConsumerPromoCode: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const promoId = typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!promoId) return res.status(400).json({ error: "id is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const body = req.body as ProConsumerPromoCodeInput;

  const supabase = getAdminSupabase();

  const { data: beforeRow, error: beforeErr } = await supabase
    .from("consumer_promo_codes")
    .select("*")
    .eq("id", promoId)
    .contains("applies_to_establishment_ids", [establishmentId])
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!beforeRow) return res.status(404).json({ error: "promo_not_found" });

  const patch: Record<string, unknown> = {};

  if (body.description !== undefined) {
    patch.description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
  }

  if (body.discount_bps !== undefined) {
    const discountBps = Math.max(0, Math.min(10000, safeInt(body.discount_bps)));
    if (discountBps <= 0) return res.status(400).json({ error: "discount_bps must be > 0" });
    patch.discount_bps = discountBps;
  }

  if (body.active !== undefined) patch.active = Boolean(body.active);

  if (body.is_public !== undefined) patch.is_public = Boolean(body.is_public);

  if (body.starts_at !== undefined) {
    patch.starts_at = body.starts_at === null ? null : parseIsoDatetimeOrNull(body.starts_at);
  }

  if (body.ends_at !== undefined) {
    patch.ends_at = body.ends_at === null ? null : parseIsoDatetimeOrNull(body.ends_at);
  }

  if (body.max_uses_total !== undefined) {
    const v = body.max_uses_total === null ? null : safeInt(body.max_uses_total);
    if (v !== null && v < 1) return res.status(400).json({ error: "max_uses_total invalide" });
    patch.max_uses_total = v;
  }

  if (body.max_uses_per_user !== undefined) {
    const v = body.max_uses_per_user === null ? null : safeInt(body.max_uses_per_user);
    if (v !== null && v < 1) return res.status(400).json({ error: "max_uses_per_user invalide" });
    patch.max_uses_per_user = v;
  }

  const nextStartsAt = (patch.starts_at !== undefined ? patch.starts_at : (beforeRow as any).starts_at) as any;
  const nextEndsAt = (patch.ends_at !== undefined ? patch.ends_at : (beforeRow as any).ends_at) as any;
  if (nextStartsAt && nextEndsAt) {
    const startDate = new Date(String(nextStartsAt));
    const endDate = new Date(String(nextEndsAt));
    if (Number.isFinite(startDate.getTime()) && Number.isFinite(endDate.getTime()) && endDate.getTime() < startDate.getTime()) {
      return res.status(400).json({ error: "ends_at must be >= starts_at" });
    }
  }

  if (!Object.keys(patch).length) return res.status(400).json({ error: "No changes provided" });

  const { data, error } = await supabase
    .from("consumer_promo_codes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", promoId)
    .contains("applies_to_establishment_ids", [establishmentId])
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, promo_code: data });
};

export const deleteProConsumerPromoCode: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const promoId = typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!promoId) return res.status(400).json({ error: "id is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("consumer_promo_codes")
    .update({ active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", promoId)
    .contains("applies_to_establishment_ids", [establishmentId])
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, promo_code: data });
};

export const getProDashboardMetrics: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const since = parseIsoDatetimeOrNull(req.query.since);
  const until = parseIsoDatetimeOrNull(req.query.until);
  if (!since || !until) return res.status(400).json({ error: "since/until requis" });

  const sinceDate = new Date(since);
  const untilDate = new Date(until);
  if (!Number.isFinite(sinceDate.getTime()) || !Number.isFinite(untilDate.getTime()) || sinceDate.getTime() >= untilDate.getTime()) {
    return res.status(400).json({ error: "Fenêtre since/until invalide" });
  }

  const supabase = getAdminSupabase();

  const [resvRes, visitsRes, packsRes, reviewsRes] = await Promise.all([
    supabase
      .from("reservations")
      .select("*")
      .eq("establishment_id", establishmentId)
      .gte("starts_at", since)
      .lt("starts_at", until)
      .order("starts_at", { ascending: false })
      .limit(5000),
    supabase
      .from("establishment_visits")
      .select("visited_at")
      .eq("establishment_id", establishmentId)
      .gte("visited_at", since)
      .lt("visited_at", until)
      .order("visited_at", { ascending: false })
      .limit(5000),
    supabase
      .from("pack_purchases")
      .select("*")
      .eq("establishment_id", establishmentId)
      .gte("created_at", since)
      .lt("created_at", until)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("reviews")
      .select("rating")
      .eq("establishment_id", establishmentId)
      .eq("status", "published")
      .gte("created_at", since)
      .lt("created_at", until)
      .limit(5000),
  ]);

  if (resvRes.error) return res.status(500).json({ error: resvRes.error.message });
  if (visitsRes.error) return res.status(500).json({ error: visitsRes.error.message });
  if (packsRes.error) return res.status(500).json({ error: packsRes.error.message });
  // Reviews errors are non-fatal (table might not exist yet)

  // Calculate review stats
  const reviews = reviewsRes.data ?? [];
  const reviewCount = reviews.length;
  const avgRating = reviewCount > 0
    ? reviews.reduce((sum, r) => sum + (typeof r.rating === "number" ? r.rating : 0), 0) / reviewCount
    : null;

  // Calculate no-shows from reservations
  const reservations = resvRes.data ?? [];
  const noShowCount = reservations.filter((r: any) => r.status === "noshow").length;

  // Calculate new vs returning clients
  // Get all user_ids from current period reservations
  const currentPeriodUserIds = new Set<string>();
  for (const r of reservations) {
    if ((r as any).user_id) {
      currentPeriodUserIds.add((r as any).user_id);
    }
  }

  // Get historical reservations for this establishment (before the query window)
  let newClientsCount = 0;
  let returningClientsCount = 0;

  if (currentPeriodUserIds.size > 0) {
    const { data: historicalReservations } = await supabase
      .from("reservations")
      .select("user_id")
      .eq("establishment_id", establishmentId)
      .lt("starts_at", since)
      .not("user_id", "is", null)
      .limit(10000);

    const historicalUserIds = new Set<string>();
    for (const r of historicalReservations ?? []) {
      if ((r as any).user_id) {
        historicalUserIds.add((r as any).user_id);
      }
    }

    // Count new vs returning
    for (const userId of currentPeriodUserIds) {
      if (historicalUserIds.has(userId)) {
        returningClientsCount += 1;
      } else {
        newClientsCount += 1;
      }
    }
  }

  res.json({
    ok: true,
    reservations,
    visits: visitsRes.data ?? [],
    packPurchases: packsRes.data ?? [],
    reviewCount,
    avgRating,
    noShowCount,
    newClientsCount,
    returningClientsCount,
  });
};

export const getProDashboardAlerts: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  const [invRes, notifRes] = await Promise.all([
    supabase
      .from("pro_invoices")
      .select("*")
      .eq("establishment_id", establishmentId)
      .eq("status", "due")
      .order("due_date", { ascending: true })
      .limit(10),
    supabase
      .from("pro_notifications")
      .select("*")
      .eq("user_id", userResult.user.id)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  if (invRes.error) return res.status(500).json({ error: invRes.error.message });
  if (notifRes.error) return res.status(500).json({ error: notifRes.error.message });

  res.json({
    ok: true,
    invoicesDue: invRes.data ?? [],
    notifications: notifRes.data ?? [],
    dayWindow: { start: start.toISOString(), end: end.toISOString() },
  });
};

// ---------------------------------------------------------------------------
// Phase 7: PRO partner-facing impact report (read-only)
// Reuses Phase 6 KPI definitions, scoped to a single establishment.
// No business rules are modified here.
// ---------------------------------------------------------------------------

type ProImpactMetricBlock = {
  eligible: number;
  no_shows: number;
  honored: number;
  protected: number;
  no_show_rate: number;
  honored_rate: number;
  protected_share: number;
};

type ProImpactSeriesRow = {
  week_start: string;
  eligible: number;
  no_shows: number;
  protected: number;
  no_show_rate: number;
  protected_share: number;
};

function clampInt(n: number, min: number, max: number): number {
  const v = Number.isFinite(n) ? Math.floor(n) : min;
  return Math.min(max, Math.max(min, v));
}

function parseDateBoundary(raw: string, endOfDay: boolean): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const iso = endOfDay ? `${v}T23:59:59.999Z` : `${v}T00:00:00.000Z`;
    const ts = Date.parse(iso);
    return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
  }

  const ts = Date.parse(v);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function startOfWeekUtcIso(inputIso: string): string {
  const d = new Date(inputIso);
  if (!Number.isFinite(d.getTime())) return inputIso;

  const day = d.getUTCDay(); // 0..6, Sunday=0
  const diffToMonday = (day + 6) % 7; // Monday=0
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function computeRates(b: Omit<ProImpactMetricBlock, "no_show_rate" | "honored_rate" | "protected_share">): ProImpactMetricBlock {
  const eligible = Math.max(0, Math.floor(b.eligible));
  const noShows = Math.max(0, Math.floor(b.no_shows));
  const honored = Math.max(0, Math.floor(b.honored));
  const protectedCount = Math.max(0, Math.floor(b.protected));

  const noShowRate = eligible > 0 ? noShows / eligible : 0;
  const honoredRate = eligible > 0 ? honored / eligible : 0;
  const protectedShare = eligible > 0 ? protectedCount / eligible : 0;

  return {
    eligible,
    no_shows: noShows,
    honored,
    protected: protectedCount,
    no_show_rate: noShowRate,
    honored_rate: honoredRate,
    protected_share: protectedShare,
  };
}

function isEligibleReservationStatus(statusRaw: unknown): boolean {
  const s = String(statusRaw ?? "").toLowerCase();
  if (!s) return false;
  if (s === "refused" || s === "waitlist") return false;
  if (s === "requested" || s === "pending_pro_validation") return false;
  if (s === "cancelled" || s.startsWith("cancelled_")) return false;
  return true;
}

function isProtectedReservation(row: { amount_deposit?: unknown; meta?: unknown }): boolean {
  const deposit =
    typeof row.amount_deposit === "number" && Number.isFinite(row.amount_deposit)
      ? Math.max(0, Math.round(row.amount_deposit))
      : 0;
  if (deposit > 0) return true;

  const meta = row.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return (meta as Record<string, unknown>).guarantee_required === true;
  }

  return false;
}

export const getProImpactReport: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const now = new Date();
  const nowIso = now.toISOString();

  const afterEndIso = parseDateBoundary(String(req.query.after_end ?? ""), true) ?? nowIso;
  const afterStartIso =
    parseDateBoundary(String(req.query.after_start ?? ""), false) ??
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const beforeEndIso = parseDateBoundary(String(req.query.before_end ?? ""), true) ?? afterStartIso;
  const beforeStartIso =
    parseDateBoundary(String(req.query.before_start ?? ""), false) ??
    new Date(new Date(beforeEndIso).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const seriesWeeks = clampInt(typeof req.query.series_weeks === "string" ? Number(req.query.series_weeks) : 12, 4, 26);

  const seriesEndIso = afterEndIso;
  const seriesFromIso = new Date(new Date(seriesEndIso).getTime() - seriesWeeks * 7 * 24 * 60 * 60 * 1000).toISOString();

  const fetchFromIso = [beforeStartIso, afterStartIso, seriesFromIso]
    .filter(Boolean)
    .map((x) => String(x))
    .sort()[0] ?? seriesFromIso;

  const supabase = getAdminSupabase();

  const batchSize = 10000;
  const maxRows = 50000;
  const rows: Array<{
    id: string;
    status: unknown;
    starts_at: string;
    checked_in_at: unknown;
    amount_deposit: unknown;
    meta: unknown;
  }> = [];

  for (let offset = 0; offset < maxRows; offset += batchSize) {
    const { data, error } = await supabase
      .from("reservations")
      .select("id,status,starts_at,checked_in_at,amount_deposit,meta")
      .eq("establishment_id", establishmentId)
      .gte("starts_at", fetchFromIso)
      .lte("starts_at", seriesEndIso)
      .order("starts_at", { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (error) return res.status(500).json({ error: error.message });

    const page = (data ?? []) as any[];
    for (const item of page) {
      const startsAt = typeof item?.starts_at === "string" ? String(item.starts_at) : "";
      if (!startsAt) continue;
      rows.push({
        id: String(item.id ?? ""),
        status: item.status,
        starts_at: startsAt,
        checked_in_at: item.checked_in_at,
        amount_deposit: item.amount_deposit,
        meta: item.meta,
      });
    }

    if (page.length < batchSize) break;
  }

  const initBlock = (): Omit<ProImpactMetricBlock, "no_show_rate" | "honored_rate" | "protected_share"> => ({
    eligible: 0,
    no_shows: 0,
    honored: 0,
    protected: 0,
  });

  const before = initBlock();
  const after = initBlock();
  const afterProtected = initBlock();
  const afterNonProtected = initBlock();

  const series = new Map<string, { week_start: string } & ReturnType<typeof initBlock>>();

  const inRange = (iso: string, from: string, to: string) => iso >= from && iso <= to;

  for (const r of rows) {
    const startsAtIso = r.starts_at;
    const status = String(r.status ?? "").toLowerCase();

    if (!isEligibleReservationStatus(status)) continue;

    const protectedFlag = isProtectedReservation(r);
    const isNoShow = status === "noshow";
    const isHonored = !!(typeof r.checked_in_at === "string" && r.checked_in_at.trim());

    if (inRange(startsAtIso, beforeStartIso, beforeEndIso)) {
      before.eligible += 1;
      if (isNoShow) before.no_shows += 1;
      if (isHonored) before.honored += 1;
      if (protectedFlag) before.protected += 1;
    }

    if (inRange(startsAtIso, afterStartIso, afterEndIso)) {
      after.eligible += 1;
      if (isNoShow) after.no_shows += 1;
      if (isHonored) after.honored += 1;
      if (protectedFlag) after.protected += 1;

      const group = protectedFlag ? afterProtected : afterNonProtected;
      group.eligible += 1;
      if (isNoShow) group.no_shows += 1;
      if (isHonored) group.honored += 1;
      if (protectedFlag) group.protected += 1;
    }

    if (inRange(startsAtIso, seriesFromIso, seriesEndIso)) {
      const weekStart = startOfWeekUtcIso(startsAtIso);
      const bucket = series.get(weekStart) ?? { week_start: weekStart, ...initBlock() };
      bucket.eligible += 1;
      if (isNoShow) bucket.no_shows += 1;
      if (protectedFlag) bucket.protected += 1;
      series.set(weekStart, bucket);
    }
  }

  const seriesRows: ProImpactSeriesRow[] = Array.from(series.values())
    .map((b) => ({
      week_start: b.week_start,
      eligible: b.eligible,
      no_shows: b.no_shows,
      protected: b.protected,
      no_show_rate: b.eligible > 0 ? b.no_shows / b.eligible : 0,
      protected_share: b.eligible > 0 ? b.protected / b.eligible : 0,
    }))
    .sort((a, b) => a.week_start.localeCompare(b.week_start));

  return res.json({
    ok: true,
    generated_at: nowIso,
    periods: {
      before: { start: beforeStartIso, end: beforeEndIso },
      after: { start: afterStartIso, end: afterEndIso },
      series: { start: seriesFromIso, end: seriesEndIso, weeks: seriesWeeks },
    },
    kpi: {
      before: computeRates(before),
      after: computeRates(after),
      after_protected: computeRates(afterProtected),
      after_non_protected: computeRates(afterNonProtected),
      series: seriesRows,
      assumptions: {
        eligible_status_excluded: ["refused", "waitlist", "requested", "pending_pro_validation", "cancelled*"],
        honored_definition: "checked_in_at != null",
        no_show_definition: "status = noshow",
        protected_definition: "amount_deposit > 0 OR meta.guarantee_required=true",
      },
    },
  });
};

function parseIsoOrNull(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  const dt = new Date(v);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString();
}

export const listProNotifications: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const fromIso = parseIsoOrNull(req.query.from);
  const toIso = parseIsoOrNull(req.query.to);
  const unreadOnly = String(req.query.unread_only ?? "").toLowerCase() === "true";

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 200;

  const supabase = getAdminSupabase();

  let q = supabase
    .from("pro_notifications")
    .select("*")
    .eq("user_id", userResult.user.id)
    .or(`establishment_id.is.null,establishment_id.eq.${establishmentId}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (fromIso) q = q.gte("created_at", fromIso);
  if (toIso) q = q.lt("created_at", toIso);
  if (unreadOnly) q = q.is("read_at", null);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const { count, error: countErr } = await supabase
    .from("pro_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userResult.user.id)
    .is("read_at", null)
    .or(`establishment_id.is.null,establishment_id.eq.${establishmentId}`);

  if (countErr) return res.status(500).json({ error: countErr.message });

  res.json({ ok: true, unreadCount: typeof count === "number" ? count : 0, notifications: data ?? [] });
};

export const markProNotificationRead: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const notificationId = typeof req.params.notificationId === "string" ? req.params.notificationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!notificationId) return res.status(400).json({ error: "notificationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("pro_notifications")
    .update({ read_at: nowIso })
    .eq("id", notificationId)
    .eq("user_id", userResult.user.id)
    .or(`establishment_id.is.null,establishment_id.eq.${establishmentId}`)
    .select("id")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Not found" });

  res.json({ ok: true });
};

export const markAllProNotificationsRead: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("pro_notifications")
    .update({ read_at: nowIso })
    .eq("user_id", userResult.user.id)
    .is("read_at", null)
    .or(`establishment_id.is.null,establishment_id.eq.${establishmentId}`);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

export const deleteProNotification: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const notificationId = typeof req.params.notificationId === "string" ? req.params.notificationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!notificationId) return res.status(400).json({ error: "notificationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", userResult.user.id)
    .or(`establishment_id.is.null,establishment_id.eq.${establishmentId}`)
    .select("id")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Not found" });

  res.json({ ok: true });
};

export const listProInvoices: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;

  const supabase = getAdminSupabase();
  let q = supabase
    .from("pro_invoices")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("due_date", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const invoices = (data ?? []) as Array<Record<string, unknown>>;
  const invoiceIds = invoices
    .map((inv) => (typeof inv.id === "string" ? inv.id : ""))
    .filter((x): x is string => !!x);

  const financeByProInvoiceId = new Map<string, { invoice_number: string; issued_at: string }>();

  if (invoiceIds.length) {
    try {
      const { data: finRows, error: finErr } = await supabase
        .from("finance_invoices")
        .select("reference_id,invoice_number,issued_at")
        .eq("reference_type", "pro_invoice")
        .in("reference_id", invoiceIds)
        .limit(500);

      if (finErr) throw finErr;

      for (const row of (finRows ?? []) as Array<Record<string, unknown>>) {
        const refId = typeof row.reference_id === "string" ? row.reference_id : "";
        const invoiceNumber = typeof row.invoice_number === "string" ? row.invoice_number : "";
        const issuedAt = typeof row.issued_at === "string" ? row.issued_at : "";
        if (refId && invoiceNumber && issuedAt) {
          financeByProInvoiceId.set(refId, { invoice_number: invoiceNumber, issued_at: issuedAt });
        }
      }
    } catch {
      // ignore: we can still return pro_invoices without finance invoice identifiers
    }
  }

  const enriched = invoices.map((inv) => {
    const id = typeof inv.id === "string" ? inv.id : "";
    const fin = id ? financeByProInvoiceId.get(id) : undefined;
    return {
      ...inv,
      invoice_number: fin?.invoice_number ?? null,
      invoice_issued_at: fin?.issued_at ?? null,
    };
  });

  res.json({ ok: true, invoices: enriched });
};

export const getProInvoiceFinanceInvoice: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const proInvoiceId = typeof req.params.invoiceId === "string" ? req.params.invoiceId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!proInvoiceId) return res.status(400).json({ error: "invoiceId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data: invoiceRow, error: invErr } = await supabase
    .from("pro_invoices")
    .select("id")
    .eq("id", proInvoiceId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invoiceRow) return res.status(404).json({ error: "invoice_not_found" });

  const actor = { userId: userResult.user.id, role: `pro:${roleRes.role}` };

  try {
    const financeInvoice = await ensureInvoiceForProInvoice({
      proInvoiceId,
      actor,
      idempotencyKey: `invoice:pro_invoice:${proInvoiceId}`,
    });

    if (!financeInvoice) return res.status(400).json({ error: "invoice_unavailable" });

    return res.json({
      ok: true,
      invoice: {
        id: financeInvoice.id,
        invoice_number: financeInvoice.invoice_number,
        issued_at: financeInvoice.issued_at,
        amount_cents: financeInvoice.amount_cents,
        currency: financeInvoice.currency,
        reference_type: financeInvoice.reference_type,
        reference_id: financeInvoice.reference_id,
      },
    });
  } catch (e) {
    console.error("getProInvoiceFinanceInvoice failed", e);
    return res.status(500).json({ error: "invoice_error" });
  }
};

function normalizeUrlList(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    if (!/^https?:\/\//i.test(v)) continue;
    out.push(v);
  }
  return out;
}

function parseIsoDatetimeOrNull(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

type InventoryVariantInput = {
  title?: unknown;
  quantity?: unknown;
  unit?: unknown;
  price?: unknown;
  currency?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
};

function parseInventoryVariants(input: unknown):
  | { ok: true; variants: Array<{ title: string | null; quantity: number | null; unit: string | null; price: number; currency: string; sort_order: number; is_active: boolean }> }
  | { ok: false; error: string } {
  if (input === undefined) return { ok: true, variants: [] };
  if (!Array.isArray(input)) return { ok: false, error: "variants doit être un tableau" };

  const out: Array<{ title: string | null; quantity: number | null; unit: string | null; price: number; currency: string; sort_order: number; is_active: boolean }> = [];

  for (const raw of input as InventoryVariantInput[]) {
    if (!isRecord(raw)) return { ok: false, error: "variant invalide" };

    const priceRaw = asNumber(raw.price);
    if (priceRaw === undefined || !Number.isFinite(priceRaw)) return { ok: false, error: "variant.price requis" };
    const price = Math.round(priceRaw);
    if (price < 0) return { ok: false, error: "variant.price invalide" };

    const quantityRaw = raw.quantity === null ? null : asNumber(raw.quantity);
    const quantity = quantityRaw === undefined ? null : Math.round(quantityRaw);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) return { ok: false, error: "variant.quantity invalide" };

    const unit = asString(raw.unit) ?? null;
    const title = asString(raw.title) ?? null;
    const currency = (asString(raw.currency) ?? "MAD").toUpperCase();
    const sort_order = asNumber(raw.sort_order) !== undefined ? Math.round(asNumber(raw.sort_order) as number) : 0;
    const is_active = asBoolean(raw.is_active) ?? true;

    out.push({ title, quantity, unit, price, currency, sort_order, is_active });
  }

  return { ok: true, variants: out };
}

export const listProInventory: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  await supabase.rpc("apply_pro_inventory_reactivations", { p_establishment_id: establishmentId });

  const [{ data: categories, error: catErr }, { data: items, error: itemErr }] = await Promise.all([
    supabase
      .from("pro_inventory_categories")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("pro_inventory_items")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (catErr) return res.status(500).json({ error: catErr.message });
  if (itemErr) return res.status(500).json({ error: itemErr.message });

  const itemIds = (items ?? []).map((i) => (isRecord(i) ? asString(i.id) : undefined)).filter((x): x is string => !!x);

  const { data: variants, error: vErr } = itemIds.length
    ? await supabase
        .from("pro_inventory_variants")
        .select("*")
        .in("item_id", itemIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(2000)
    : { data: [], error: null };

  if (vErr) return res.status(500).json({ error: vErr.message });

  const byItem = new Map<string, unknown[]>();
  for (const v of variants ?? []) {
    const itemId = isRecord(v) ? asString(v.item_id) : undefined;
    if (!itemId) continue;
    const arr = byItem.get(itemId) ?? [];
    arr.push(v);
    byItem.set(itemId, arr);
  }

  const itemsWithVariants = (items ?? []).map((i) => {
    const id = isRecord(i) ? asString(i.id) : undefined;
    return { ...(i as Record<string, unknown>), variants: id ? byItem.get(id) ?? [] : [] };
  });

  res.json({ ok: true, categories: categories ?? [], items: itemsWithVariants });
};

type DemoSeedInsertStats = { categories: number; items: number; variants: number };

type DemoSeedPayload = {
  categories: Array<{
    id: string;
    establishment_id: string;
    parent_id: string | null;
    title: string;
    description: string | null;
    sort_order: number;
    is_active: boolean;
  }>;
  items: Array<{
    id: string;
    establishment_id: string;
    category_id: string | null;
    title: string;
    description: string | null;
    labels: string[];
    base_price: number | null;
    currency: string;
    is_active: boolean;
    visible_when_unavailable: boolean;
    scheduled_reactivation_at: string | null;
    photos: string[];
    meta: Record<string, unknown>;
  }>;
  variants: Array<{
    id: string;
    item_id: string;
    title: string | null;
    quantity: number | null;
    unit: string | null;
    price: number;
    currency: string;
    sort_order: number;
    is_active: boolean;
  }>;
};

function buildDemoSeedPayload(args: {
  establishmentId: string;
  universe: string;
  seedTag: string;
  seededAt: string;
}): DemoSeedPayload {
  const baseMeta = {
    demo_seed: args.seedTag,
    demo_seeded_at: args.seededAt,
    demo_universe: args.universe,
  } as const;

  const currency = "MAD";
  const addDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

  const mkCat = (data: Omit<DemoSeedPayload["categories"][number], "establishment_id">) => ({
    ...data,
    establishment_id: args.establishmentId,
  });

  const mkItem = (data: Omit<DemoSeedPayload["items"][number], "establishment_id" | "currency">) => ({
    ...data,
    establishment_id: args.establishmentId,
    currency,
  });

  const u = (args.universe ?? "").toLowerCase();

  if (u === "restaurant") {
    const catEntrees = randomUUID();
    const catPlats = randomUUID();
    const catDesserts = randomUUID();
    const catBoissons = randomUUID();
    const catVins = randomUUID();

    const itemOysters = randomUUID();
    const itemTajine = randomUUID();
    const itemPastilla = randomUUID();
    const itemTea = randomUUID();
    const itemWine = randomUUID();

    return {
      categories: [
        mkCat({ id: catEntrees, parent_id: null, title: "Entrées", description: "Pour bien commencer.", sort_order: 10, is_active: true }),
        mkCat({ id: catPlats, parent_id: null, title: "Plats", description: "Cuisine du moment.", sort_order: 20, is_active: true }),
        mkCat({ id: catDesserts, parent_id: null, title: "Desserts", description: "Douceurs maison.", sort_order: 30, is_active: true }),
        mkCat({ id: catBoissons, parent_id: null, title: "Boissons", description: "Boissons chaudes et fraîches.", sort_order: 40, is_active: true }),
        mkCat({ id: catVins, parent_id: catBoissons, title: "Vins", description: "Sélection de vins.", sort_order: 41, is_active: true }),
      ],
      items: [
        mkItem({
          id: itemOysters,
          category_id: catEntrees,
          title: "Huîtres de Dakhla",
          description: "Servies fraîches avec citron et vinaigre d'échalotes.",
          labels: ["fruits_de_mer", "best_seller"],
          base_price: null,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/3296391/pexels-photo-3296391.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            allergens: ["mollusques"],
          },
        }),
        mkItem({
          id: itemTajine,
          category_id: catPlats,
          title: "Tajine d'agneau aux pruneaux",
          description: "Agneau fondant, pruneaux caramélisés, amandes grillées.",
          labels: ["traditionnel", "suggestion_chef"],
          base_price: 140,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/958545/pexels-photo-958545.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            spicy_level: 1,
          },
        }),
        mkItem({
          id: itemPastilla,
          category_id: catPlats,
          title: "Pastilla fruits de mer",
          description: "Feuilleté croustillant, sauce onctueuse, herbes fraîches.",
          labels: ["fruits_de_mer", "signature"],
          base_price: 160,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/6646367/pexels-photo-6646367.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
          },
        }),
        mkItem({
          id: itemTea,
          category_id: catBoissons,
          title: "Thé à la menthe",
          description: "Thé vert, menthe fraîche, servi à la marocaine.",
          labels: ["traditionnel"],
          base_price: 20,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/5946648/pexels-photo-5946648.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            hot: true,
          },
        }),
        mkItem({
          id: itemWine,
          category_id: catVins,
          title: "Vin blanc de la maison",
          description: "Servi frais. Disponible au verre ou à la bouteille.",
          labels: ["coup_de_coeur"],
          base_price: null,
          is_active: false,
          visible_when_unavailable: true,
          scheduled_reactivation_at: addDays(2),
          photos: [
            "https://images.pexels.com/photos/1283219/pexels-photo-1283219.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            alcohol: true,
          },
        }),
      ],
      variants: [
        {
          id: randomUUID(),
          item_id: itemOysters,
          title: "6 pièces",
          quantity: 6,
          unit: "pièces",
          price: 90,
          currency,
          sort_order: 10,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemOysters,
          title: "12 pièces",
          quantity: 12,
          unit: "pièces",
          price: 170,
          currency,
          sort_order: 20,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemWine,
          title: "Verre (12 cl)",
          quantity: 12,
          unit: "cl",
          price: 45,
          currency,
          sort_order: 10,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemWine,
          title: "Bouteille (75 cl)",
          quantity: 75,
          unit: "cl",
          price: 220,
          currency,
          sort_order: 20,
          is_active: true,
        },
      ],
    };
  }

  if (u === "hebergement") {
    const catRooms = randomUUID();
    const catSuites = randomUUID();
    const catServices = randomUUID();
    const catWellness = randomUUID();

    const itemRoom = randomUUID();
    const itemSuite = randomUUID();
    const itemBreakfast = randomUUID();
    const itemHammam = randomUUID();
    const itemTransfer = randomUUID();

    return {
      categories: [
        mkCat({ id: catRooms, parent_id: null, title: "Chambres", description: "Vos chambres et tarifs.", sort_order: 10, is_active: true }),
        mkCat({ id: catSuites, parent_id: null, title: "Suites", description: "Suites premium.", sort_order: 20, is_active: true }),
        mkCat({ id: catServices, parent_id: null, title: "Services", description: "Services additionnels.", sort_order: 30, is_active: true }),
        mkCat({ id: catWellness, parent_id: catServices, title: "Bien-être", description: "Spa, hammam, soins.", sort_order: 31, is_active: true }),
      ],
      items: [
        mkItem({
          id: itemRoom,
          category_id: catRooms,
          title: "Chambre Double Deluxe",
          description: "Lit Queen, climatisation, Wi‑Fi, salle de bain privative.",
          labels: ["best_seller", "coup_de_coeur"],
          base_price: null,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            capacity: 2,
            bed: "Queen",
            amenities: ["Wi‑Fi", "Climatisation", "Douche"],
          },
        }),
        mkItem({
          id: itemSuite,
          category_id: catSuites,
          title: "Suite Atlas (vue patio)",
          description: "Suite spacieuse avec coin salon et vue sur le patio.",
          labels: ["signature"],
          base_price: null,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/164595/pexels-photo-164595.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            capacity: 3,
            bed: "King",
          },
        }),
        mkItem({
          id: itemBreakfast,
          category_id: catServices,
          title: "Petit-déjeuner marocain",
          description: "Mssemen, baghrir, amlou, jus d'orange, thé à la menthe.",
          labels: ["traditionnel"],
          base_price: null,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            served_from: "08:00",
            served_to: "11:00",
          },
        }),
        mkItem({
          id: itemHammam,
          category_id: catWellness,
          title: "Hammam & gommage",
          description: "Rituel traditionnel: vapeur + savon noir + gommage.",
          labels: ["specialite", "healthy"],
          base_price: 250,
          is_active: true,
          visible_when_unavailable: true,
          scheduled_reactivation_at: null,
          photos: [
            "https://images.pexels.com/photos/3865676/pexels-photo-3865676.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            duration_minutes: 60,
          },
        }),
        mkItem({
          id: itemTransfer,
          category_id: catServices,
          title: "Transfert aéroport (aller)",
          description: "Prise en charge à l'aéroport, chauffeur privé.",
          labels: ["nouveaute"],
          base_price: 300,
          is_active: false,
          visible_when_unavailable: true,
          scheduled_reactivation_at: addDays(3),
          photos: [
            "https://images.pexels.com/photos/1149831/pexels-photo-1149831.jpeg?auto=compress&cs=tinysrgb&w=1200",
          ],
          meta: {
            ...baseMeta,
            includes: ["Chauffeur", "Véhicule climatisé"],
          },
        }),
      ],
      variants: [
        {
          id: randomUUID(),
          item_id: itemRoom,
          title: "1 nuit",
          quantity: 1,
          unit: "nuit",
          price: 950,
          currency,
          sort_order: 10,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemRoom,
          title: "2 nuits",
          quantity: 2,
          unit: "nuits",
          price: 1750,
          currency,
          sort_order: 20,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemSuite,
          title: "1 nuit",
          quantity: 1,
          unit: "nuit",
          price: 1400,
          currency,
          sort_order: 10,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemSuite,
          title: "2 nuits",
          quantity: 2,
          unit: "nuits",
          price: 2600,
          currency,
          sort_order: 20,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemBreakfast,
          title: "1 personne",
          quantity: 1,
          unit: "pers.",
          price: 80,
          currency,
          sort_order: 10,
          is_active: true,
        },
        {
          id: randomUUID(),
          item_id: itemBreakfast,
          title: "2 personnes",
          quantity: 2,
          unit: "pers.",
          price: 150,
          currency,
          sort_order: 20,
          is_active: true,
        },
      ],
    };
  }

  const catServices = randomUUID();
  const catExcursions = randomUUID();
  const catWellness = randomUUID();

  const itemTour = randomUUID();
  const itemQuad = randomUUID();
  const itemMassage = randomUUID();

  return {
    categories: [
      mkCat({ id: catExcursions, parent_id: null, title: "Excursions", description: "Sorties et visites.", sort_order: 10, is_active: true }),
      mkCat({ id: catServices, parent_id: null, title: "Services", description: "Prestations à la carte.", sort_order: 20, is_active: true }),
      mkCat({ id: catWellness, parent_id: catServices, title: "Bien-être", description: "Massage, détente.", sort_order: 21, is_active: true }),
    ],
    items: [
      mkItem({
        id: itemTour,
        category_id: catExcursions,
        title: "Visite guidée (médina)",
        description: "Guide local, parcours sur-mesure, durée 2h.",
        labels: ["coup_de_coeur"],
        base_price: null,
        is_active: true,
        visible_when_unavailable: true,
        scheduled_reactivation_at: null,
        photos: [
          "https://images.pexels.com/photos/386026/pexels-photo-386026.jpeg?auto=compress&cs=tinysrgb&w=1200",
        ],
        meta: {
          ...baseMeta,
          duration_minutes: 120,
        },
      }),
      mkItem({
        id: itemQuad,
        category_id: catExcursions,
        title: "Sortie quad (demi-journée)",
        description: "Équipement inclus, encadrement, parcours découverte.",
        labels: ["best_seller"],
        base_price: null,
        is_active: true,
        visible_when_unavailable: true,
        scheduled_reactivation_at: null,
        photos: [
          "https://images.pexels.com/photos/100582/pexels-photo-100582.jpeg?auto=compress&cs=tinysrgb&w=1200",
        ],
        meta: {
          ...baseMeta,
          min_age: 16,
        },
      }),
      mkItem({
        id: itemMassage,
        category_id: catWellness,
        title: "Massage relaxant",
        description: "Massage 60 min.",
        labels: ["healthy"],
        base_price: null,
        is_active: true,
        visible_when_unavailable: true,
        scheduled_reactivation_at: null,
        photos: [
          "https://images.pexels.com/photos/3757954/pexels-photo-3757954.jpeg?auto=compress&cs=tinysrgb&w=1200",
        ],
        meta: {
          ...baseMeta,
          duration_minutes: 60,
        },
      }),
    ],
    variants: [
      {
        id: randomUUID(),
        item_id: itemTour,
        title: "1 personne",
        quantity: 1,
        unit: "pers.",
        price: 120,
        currency,
        sort_order: 10,
        is_active: true,
      },
      {
        id: randomUUID(),
        item_id: itemTour,
        title: "2 personnes",
        quantity: 2,
        unit: "pers.",
        price: 200,
        currency,
        sort_order: 20,
        is_active: true,
      },
      {
        id: randomUUID(),
        item_id: itemQuad,
        title: "1 personne",
        quantity: 1,
        unit: "pers.",
        price: 450,
        currency,
        sort_order: 10,
        is_active: true,
      },
      {
        id: randomUUID(),
        item_id: itemMassage,
        title: "60 min",
        quantity: 60,
        unit: "min",
        price: 320,
        currency,
        sort_order: 10,
        is_active: true,
      },
      {
        id: randomUUID(),
        item_id: itemMassage,
        title: "90 min",
        quantity: 90,
        unit: "min",
        price: 450,
        currency,
        sort_order: 20,
        is_active: true,
      },
    ],
  };
}

export const seedDemoProInventory: RequestHandler = async (req, res) => {
  if (!isDemoRoutesAllowed()) return res.status(404).json({ error: "not_found" });

  const demoEmail = getDemoProEmail();
  if (!demoEmail) return res.status(404).json({ error: "not_found" });

  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const email = userResult.user.email ? normalizeEmail(userResult.user.email) : "";
  if (email !== demoEmail) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();

  const { data: existingItems, error: existingErr } = await supabase
    .from("pro_inventory_items")
    .select("id")
    .eq("establishment_id", establishmentId)
    .limit(1);
  if (existingErr) return res.status(500).json({ error: existingErr.message });

  if ((existingItems ?? []).length) {
    return res.json({ ok: true, skipped: true, reason: "already_has_items" } as const);
  }

  const { data: est, error: estErr } = await supabase
    .from("establishments")
    .select("id,universe")
    .eq("id", establishmentId)
    .single();
  if (estErr) return res.status(500).json({ error: estErr.message });

  const universe = (isRecord(est) ? asString((est as Record<string, unknown>).universe) : undefined) ?? "";

  const seedTag = "v1";
  const seededAt = new Date().toISOString();
  const payload = buildDemoSeedPayload({ establishmentId, universe, seedTag, seededAt });

  const stats: DemoSeedInsertStats = { categories: 0, items: 0, variants: 0 };

  if (payload.categories.length) {
    const { error: catErr } = await supabase.from("pro_inventory_categories").insert(payload.categories);
    if (catErr) return res.status(500).json({ error: catErr.message });
    stats.categories = payload.categories.length;
  }

  if (payload.items.length) {
    const { error: itemErr } = await supabase.from("pro_inventory_items").insert(payload.items);
    if (itemErr) return res.status(500).json({ error: itemErr.message });
    stats.items = payload.items.length;
  }

  if (payload.variants.length) {
    const { error: vErr } = await supabase.from("pro_inventory_variants").insert(payload.variants);
    if (vErr) return res.status(500).json({ error: vErr.message });
    stats.variants = payload.variants.length;
  }

  return res.json({ ok: true, inserted: stats } as const);
};

// ============================================================================
// Pro Inventory Pending Changes (Moderation Queue)
// ============================================================================

export const listProInventoryPendingChanges: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const statusFilter = asString(req.query.status) ?? "pending";

  const { data, error } = await supabase
    .from("pro_inventory_pending_changes")
    .select("*")
    .eq("establishment_id", establishmentId)
    .eq("status", statusFilter)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, pendingChanges: data ?? [] });
};

export const createProInventoryCategory: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const title = asString(req.body.title);
  if (!title) return res.status(400).json({ error: "title is required" });

  const parent_id = asString(req.body.parent_id) ?? null;
  const description = asString(req.body.description) ?? null;
  const sort_order = asNumber(req.body.sort_order) !== undefined ? Math.round(asNumber(req.body.sort_order) as number) : 0;
  const is_active = asBoolean(req.body.is_active) ?? true;

  const supabase = getAdminSupabase();

  // Pro users: submit to moderation queue
  const payload = { title, parent_id, description, sort_order, is_active };

  const { data: pendingChange, error: pendingErr } = await supabase
    .from("pro_inventory_pending_changes")
    .insert({
      establishment_id: establishmentId,
      change_type: "create_category",
      payload,
      submitted_by: userResult.user.id,
    })
    .select("*")
    .single();

  if (pendingErr) return res.status(500).json({ error: pendingErr.message });

  res.json({ ok: true, pending: true, pendingChange, message: "Votre demande de création de catégorie a été soumise pour modération." });
};

export const updateProInventoryCategory: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const categoryId = typeof req.params.categoryId === "string" ? req.params.categoryId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!categoryId) return res.status(400).json({ error: "categoryId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const patch: Record<string, unknown> = {};

  const title = asString(req.body.title);
  if (title !== undefined) patch.title = title;

  const description = req.body.description === null ? null : asString(req.body.description);
  if (description !== undefined) patch.description = description;

  const sortOrderRaw = asNumber(req.body.sort_order);
  if (sortOrderRaw !== undefined) patch.sort_order = Math.round(sortOrderRaw);

  const isActiveRaw = asBoolean(req.body.is_active);
  if (isActiveRaw !== undefined) patch.is_active = isActiveRaw;

  if (!Object.keys(patch).length) return res.status(400).json({ error: "No changes provided" });

  const supabase = getAdminSupabase();

  // Pro users: submit to moderation queue
  const { data: pendingChange, error: pendingErr } = await supabase
    .from("pro_inventory_pending_changes")
    .insert({
      establishment_id: establishmentId,
      change_type: "update_category",
      target_id: categoryId,
      payload: patch,
      submitted_by: userResult.user.id,
    })
    .select("*")
    .single();

  if (pendingErr) return res.status(500).json({ error: pendingErr.message });

  res.json({ ok: true, pending: true, pendingChange, message: "Votre demande de modification de catégorie a été soumise pour modération." });
};

export const deleteProInventoryCategory: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const categoryId = typeof req.params.categoryId === "string" ? req.params.categoryId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!categoryId) return res.status(400).json({ error: "categoryId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  // Pro users: submit to moderation queue
  const { data: pendingChange, error: pendingErr } = await supabase
    .from("pro_inventory_pending_changes")
    .insert({
      establishment_id: establishmentId,
      change_type: "delete_category",
      target_id: categoryId,
      payload: {},
      submitted_by: userResult.user.id,
    })
    .select("*")
    .single();

  if (pendingErr) return res.status(500).json({ error: pendingErr.message });

  res.json({ ok: true, pending: true, pendingChange, message: "Votre demande de suppression de catégorie a été soumise pour modération." });
};

export const createProInventoryItem: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const title = asString(req.body.title);
  if (!title) return res.status(400).json({ error: "title is required" });

  const category_id = asString(req.body.category_id) ?? null;
  const description = asString(req.body.description) ?? null;

  const labelsRaw = asStringArray(req.body.labels) ?? [];
  const labels = labelsRaw.map((x) => x.trim()).filter(Boolean).slice(0, 20);

  const photosRaw = asStringArray(req.body.photos) ?? [];
  const photos = normalizeUrlList(photosRaw).slice(0, 12);

  const basePriceRaw = req.body.base_price === null ? null : asNumber(req.body.base_price);
  const base_price = basePriceRaw === undefined ? null : Math.round(basePriceRaw);
  if (base_price !== null && (!Number.isFinite(base_price) || base_price < 0)) return res.status(400).json({ error: "base_price invalide" });

  const currency = (asString(req.body.currency) ?? "MAD").toUpperCase();

  const is_active = asBoolean(req.body.is_active) ?? true;
  const visible_when_unavailable = asBoolean(req.body.visible_when_unavailable) ?? true;

  const scheduled = parseIsoDatetimeOrNull(req.body.scheduled_reactivation_at);
  const scheduled_reactivation_at = scheduled ? scheduled : null;

  const meta = asJsonObject(req.body.meta) ?? {};

  const variantsRes = parseInventoryVariants(req.body.variants);
  if (variantsRes.ok === false) return res.status(400).json({ error: variantsRes.error });

  const supabase = getAdminSupabase();

  // Pro users: submit to moderation queue
  const payload = {
    category_id,
    title,
    description,
    labels,
    base_price,
    currency,
    is_active,
    visible_when_unavailable,
    scheduled_reactivation_at,
    photos,
    meta,
    variants: variantsRes.variants,
  };

  const { data: pendingChange, error: pendingErr } = await supabase
    .from("pro_inventory_pending_changes")
    .insert({
      establishment_id: establishmentId,
      change_type: "create_item",
      payload,
      submitted_by: userResult.user.id,
    })
    .select("*")
    .single();

  if (pendingErr) return res.status(500).json({ error: pendingErr.message });

  res.json({ ok: true, pending: true, pendingChange, message: "Votre demande de création d'offre a été soumise pour modération." });
};

export const updateProInventoryItem: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!itemId) return res.status(400).json({ error: "itemId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const patch: Record<string, unknown> = {};

  const title = asString(req.body.title);
  if (title !== undefined) patch.title = title;

  const description = req.body.description === null ? null : asString(req.body.description);
  if (description !== undefined) patch.description = description;

  const categoryId = req.body.category_id === null ? null : asString(req.body.category_id);
  if (categoryId !== undefined) patch.category_id = categoryId;

  const labelsRaw = asStringArray(req.body.labels);
  if (labelsRaw !== undefined) patch.labels = labelsRaw.map((x) => x.trim()).filter(Boolean).slice(0, 20);

  const photosRaw = asStringArray(req.body.photos);
  if (photosRaw !== undefined) patch.photos = normalizeUrlList(photosRaw).slice(0, 12);

  const basePriceRaw = req.body.base_price === null ? null : asNumber(req.body.base_price);
  if (basePriceRaw !== undefined) {
    const v = basePriceRaw === null ? null : Math.round(basePriceRaw);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return res.status(400).json({ error: "base_price invalide" });
    patch.base_price = v;
  }

  const currencyRaw = asString(req.body.currency);
  if (currencyRaw !== undefined) patch.currency = currencyRaw.toUpperCase();

  const isActiveRaw = asBoolean(req.body.is_active);
  if (isActiveRaw !== undefined) patch.is_active = isActiveRaw;

  const visibleRaw = asBoolean(req.body.visible_when_unavailable);
  if (visibleRaw !== undefined) patch.visible_when_unavailable = visibleRaw;

  if (req.body.scheduled_reactivation_at !== undefined) {
    patch.scheduled_reactivation_at = parseIsoDatetimeOrNull(req.body.scheduled_reactivation_at);
  }

  const metaRaw = req.body.meta === null ? {} : asJsonObject(req.body.meta);
  if (metaRaw !== undefined) patch.meta = metaRaw;

  const variantsProvided = Object.prototype.hasOwnProperty.call(req.body, "variants");
  const variantsParsed = variantsProvided
    ? parseInventoryVariants(req.body.variants)
    : ({ ok: true, variants: [] } as const);
  if (variantsParsed.ok === false) return res.status(400).json({ error: variantsParsed.error });

  if (!Object.keys(patch).length && !variantsProvided) return res.status(400).json({ error: "No changes provided" });

  const supabase = getAdminSupabase();

  // Pro users: submit to moderation queue
  const payload = {
    ...patch,
    ...(variantsProvided ? { variants: variantsParsed.variants } : {}),
  };

  const { data: pendingChange, error: pendingErr } = await supabase
    .from("pro_inventory_pending_changes")
    .insert({
      establishment_id: establishmentId,
      change_type: "update_item",
      target_id: itemId,
      payload,
      submitted_by: userResult.user.id,
    })
    .select("*")
    .single();

  if (pendingErr) return res.status(500).json({ error: pendingErr.message });

  res.json({ ok: true, pending: true, pendingChange, message: "Votre demande de modification d'offre a été soumise pour modération." });
};

export const deleteProInventoryItem: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!itemId) return res.status(400).json({ error: "itemId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  // Pro users: submit to moderation queue
  const { data: pendingChange, error: pendingErr } = await supabase
    .from("pro_inventory_pending_changes")
    .insert({
      establishment_id: establishmentId,
      change_type: "delete_item",
      target_id: itemId,
      payload: {},
      submitted_by: userResult.user.id,
    })
    .select("*")
    .single();

  if (pendingErr) return res.status(500).json({ error: pendingErr.message });

  res.json({ ok: true, pending: true, pendingChange, message: "Votre demande de suppression d'offre a été soumise pour modération." });
};

export const greenThumbProInventoryItem: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!itemId) return res.status(400).json({ error: "itemId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase.rpc("increment_pro_inventory_popularity", {
    p_establishment_id: establishmentId,
    p_item_id: itemId,
  });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, popularity: data });
};

export const updateProReservation: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const reservationId = typeof req.params.reservationId === "string" ? req.params.reservationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!reservationId) return res.status(400).json({ error: "reservationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const statusRaw = asString(req.body.status);
  const paymentStatusRaw = asString(req.body.payment_status);
  const checkedInAtRaw = asString(req.body.checked_in_at);
  const refusalReasonCodeRaw = asString(req.body.refusal_reason_code) ?? asString(req.body.refusalReasonCode);
  const refusalReasonCustomRaw = asString(req.body.refusal_reason_custom) ?? asString(req.body.refusalReasonCustom);
  const isFromWaitlistRaw = typeof req.body.is_from_waitlist === "boolean" ? req.body.is_from_waitlist : typeof req.body.isFromWaitlist === "boolean" ? req.body.isFromWaitlist : undefined;
  const proMessageRaw = asString(req.body.pro_message) ?? asString(req.body.proMessage);
  const templateCodeRaw = asString(req.body.template_code) ?? asString(req.body.templateCode);

  const startsAtRaw = asString(req.body.starts_at) ?? asString(req.body.startsAt);
  const partySizeRaw = asNumber(req.body.party_size ?? req.body.partySize);
  const slotIdRaw = asString(req.body.slot_id) ?? asString(req.body.slotId);

  const metaPatchRaw = isRecord(req.body.meta_patch) ? (req.body.meta_patch as Record<string, unknown>) : isRecord(req.body.metaPatch) ? (req.body.metaPatch as Record<string, unknown>) : null;
  const metaDeleteKeysRaw = Array.isArray(req.body.meta_delete_keys)
    ? req.body.meta_delete_keys
    : Array.isArray(req.body.metaDeleteKeys)
      ? req.body.metaDeleteKeys
      : null;

  const patch: Record<string, unknown> = {};

  const supabase = getAdminSupabase();

  const notifyProMembers = async (payload: { title: string; body: string; category: string; data?: Record<string, unknown> }) => {
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

  const { data: existing, error: existingErr } = await supabase
    .from("reservations")
    .select("status, payment_status, amount_deposit, meta, starts_at, ends_at, party_size, slot_id, user_id, booking_reference, checked_in_at")
    .eq("id", reservationId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (!existing) return res.status(404).json({ error: "reservation introuvable" });

  const previousStatus = String((existing as { status?: unknown }).status ?? "");
  const previousPaymentStatus = String((existing as { payment_status?: unknown }).payment_status ?? "");
  const previousCheckedInAt = typeof (existing as any)?.checked_in_at === "string" ? String((existing as any).checked_in_at).trim() : "";
  const existingDepositCents =
    typeof (existing as { amount_deposit?: unknown }).amount_deposit === "number" && Number.isFinite((existing as { amount_deposit: number }).amount_deposit)
      ? Math.max(0, Math.round((existing as { amount_deposit: number }).amount_deposit))
      : 0;

  const consumerUserId = typeof (existing as any)?.user_id === "string" ? String((existing as any).user_id).trim() : "";
  const bookingReference = typeof (existing as any)?.booking_reference === "string" ? String((existing as any).booking_reference).trim() : "";

  // ---------------------------------------------------------------------------
  // PROTECTION WINDOW CHECK: Prevent cancellation/refusal of free reservations
  // within the protection window (X hours before the reservation starts)
  // ---------------------------------------------------------------------------
  const isNegativeStatusChange = statusRaw && (
    statusRaw === "refused" ||
    statusRaw === "cancelled_pro" ||
    statusRaw === "cancelled" ||
    statusRaw === "waitlist"
  );

  if (isNegativeStatusChange && previousStatus !== statusRaw) {
    // Only check protection if the reservation is confirmed/pending and unpaid
    const isPotentiallyProtected = (
      (previousStatus === "confirmed" || previousStatus === "pending_pro_validation") &&
      existingDepositCents === 0 &&
      previousPaymentStatus !== "paid"
    );

    if (isPotentiallyProtected) {
      const { data: protectionResult, error: protectionErr } = await supabase.rpc(
        "is_reservation_protected",
        { p_reservation_id: reservationId }
      );

      if (!protectionErr && protectionResult && (protectionResult as any).protected === true) {
        const hoursUntilStart = (protectionResult as any).hours_until_start ?? 0;
        const protectionWindowHours = (protectionResult as any).protection_window_hours ?? 2;

        return res.status(403).json({
          error: "reservation_protected",
          message: `Cette réservation gratuite ne peut pas être annulée ou refusée car elle est protégée (${Math.round(hoursUntilStart * 10) / 10}h avant le début, fenêtre de protection: ${protectionWindowHours}h)`,
          protection_details: protectionResult,
        });
      }
    }
  }

  if (statusRaw) {
    const allowedStatuses = new Set([
      "requested",
      "pending_pro_validation",
      "confirmed",
      "refused",
      "waitlist",
      "cancelled",
      "cancelled_user",
      "cancelled_pro",
      "noshow",
    ]);
    if (!allowedStatuses.has(statusRaw)) return res.status(400).json({ error: "status invalide" });

    // Deep business rule: strict state-machine transitions.
    if (!canTransitionReservationStatus({ from: previousStatus, to: statusRaw })) {
      return res.status(400).json({ error: "invalid_status_transition", from: previousStatus, to: statusRaw });
    }

    // Enforce: guaranteed reservations cannot be confirmed until payment is validated.
    if (statusRaw === "confirmed" && existingDepositCents > 0 && previousPaymentStatus !== "paid") {
      return res.status(409).json({ error: "Réservation garantie non payée" });
    }

    patch.status = statusRaw;

    // Keep refusal fields coherent
    if (statusRaw === "confirmed") {
      patch.refusal_reason_code = null;
      patch.refusal_reason_custom = null;
    }
  }

  if (paymentStatusRaw) {
    return res.status(403).json({ error: "payment_status_managed_by_system" });
  }

  if (checkedInAtRaw !== undefined) {
    if (checkedInAtRaw === "") {
      patch.checked_in_at = null;
    } else {
      const d = new Date(checkedInAtRaw);
      if (!Number.isFinite(d.getTime())) return res.status(400).json({ error: "checked_in_at invalide" });
      patch.checked_in_at = d.toISOString();
    }
  }

  if (startsAtRaw !== undefined) {
    const existingSlotId = typeof (existing as any)?.slot_id === "string" ? String((existing as any).slot_id) : "";
    const isChangingSlot = slotIdRaw !== undefined;

    // If the reservation is slot-based, time changes must happen through slot_id (the slot is the source of truth).
    if (existingSlotId && !isChangingSlot) {
      return res.status(400).json({ error: "starts_at_requires_slot_change" });
    }

    if (!startsAtRaw) return res.status(400).json({ error: "starts_at invalide" });
    const d = new Date(startsAtRaw);
    if (!Number.isFinite(d.getTime())) return res.status(400).json({ error: "starts_at invalide" });
    patch.starts_at = d.toISOString();
  }

  if (partySizeRaw !== undefined) {
    if (!Number.isFinite(partySizeRaw)) return res.status(400).json({ error: "party_size invalide" });
    const n = Math.max(1, Math.round(partySizeRaw));
    patch.party_size = n;
  }

  if (slotIdRaw !== undefined) {
    patch.slot_id = slotIdRaw ? slotIdRaw : null;
  }

  if (refusalReasonCodeRaw !== undefined) patch.refusal_reason_code = refusalReasonCodeRaw || null;
  if (refusalReasonCustomRaw !== undefined) patch.refusal_reason_custom = refusalReasonCustomRaw || null;
  if (isFromWaitlistRaw !== undefined) patch.is_from_waitlist = isFromWaitlistRaw;

  const existingMeta = (existing as { meta?: unknown }).meta;
  const metaBase = existingMeta && typeof existingMeta === "object" && existingMeta !== null ? (existingMeta as Record<string, unknown>) : {};

  const hadProposedChange = isRecord(metaBase.proposed_change);

  const allowedMetaKeys = new Set([
    "guest_first_name",
    "guest_last_name",
    "guest_phone",
    "guest_comment",
    "client_risk_score",
    "no_show_count",
    "guarantee_required",
    "modification_requested",
    "requested_change",
    "proposed_change",
    "present_at",
  ]);

  const nextMeta = { ...metaBase };

  if (metaPatchRaw) {
    for (const [k, v] of Object.entries(metaPatchRaw)) {
      if (!allowedMetaKeys.has(k)) continue;
      nextMeta[k] = v;
    }
  }

  if (metaDeleteKeysRaw) {
    for (const kRaw of metaDeleteKeysRaw) {
      const k = typeof kRaw === "string" ? kRaw : "";
      if (!k) continue;
      if (!allowedMetaKeys.has(k)) continue;
      delete nextMeta[k];
    }
  }

  if (proMessageRaw) {
    nextMeta.last_pro_message = {
      body: proMessageRaw,
      template_code: templateCodeRaw ?? null,
      at: new Date().toISOString(),
      by_user_id: userResult.user.id,
      by_role: permission.role,
    };
  }

  // Slot capacity guard + slot-as-truth if slot_id is set/changed.
  if (Object.prototype.hasOwnProperty.call(patch, "slot_id")) {
    const nextSlotId = patch.slot_id as string | null;
    if (nextSlotId) {
      const { data: slot, error: slotErr } = await supabase
        .from("pro_slots")
        .select("id, capacity, starts_at, ends_at")
        .eq("id", nextSlotId)
        .eq("establishment_id", establishmentId)
        .maybeSingle();

      if (slotErr) return res.status(500).json({ error: slotErr.message });
      if (!slot) return res.status(400).json({ error: "slot_id invalide" });

      const slotStartsRaw = typeof (slot as any).starts_at === "string" ? String((slot as any).starts_at).trim() : "";
      const slotEndsRaw = typeof (slot as any).ends_at === "string" ? String((slot as any).ends_at).trim() : "";

      const slotStarts = slotStartsRaw ? new Date(slotStartsRaw) : null;
      if (!slotStarts || !Number.isFinite(slotStarts.getTime())) return res.status(400).json({ error: "slot_starts_at_invalid" });

      const slotStartsIso = slotStarts.toISOString();

      // If the caller tried to set starts_at along with slot_id, it must match the slot.
      if (startsAtRaw) {
        const d = new Date(startsAtRaw);
        if (!Number.isFinite(d.getTime())) return res.status(400).json({ error: "starts_at invalide" });
        if (d.toISOString() !== slotStartsIso) return res.status(400).json({ error: "slot_starts_at_mismatch" });
      }

      // Slot is the source of truth
      patch.starts_at = slotStartsIso;
      if (slotEndsRaw) {
        const d = new Date(slotEndsRaw);
        patch.ends_at = Number.isFinite(d.getTime()) ? d.toISOString() : null;
      } else {
        patch.ends_at = null;
      }

      const cap = typeof (slot as { capacity?: unknown }).capacity === "number" ? Math.max(0, Math.round((slot as { capacity: number }).capacity)) : null;
      if (cap != null) {
        const currentPartySize = typeof (existing as { party_size?: unknown }).party_size === "number" ? Math.max(1, Math.round((existing as { party_size: number }).party_size)) : 1;
        const nextPartySize = typeof patch.party_size === "number" ? Math.max(1, Math.round(patch.party_size as number)) : currentPartySize;

        const { data: usedRows, error: usedErr } = await supabase
          .from("reservations")
          .select("party_size")
          .eq("establishment_id", establishmentId)
          .eq("slot_id", nextSlotId)
          .neq("id", reservationId)
          .in("status", OCCUPYING_RESERVATION_STATUSES as unknown as string[])
          .limit(5000);

        if (usedErr) return res.status(500).json({ error: usedErr.message });

        const used = (usedRows ?? []).reduce((acc, row) => {
          const n = typeof (row as { party_size?: unknown }).party_size === "number" ? Math.max(0, Math.round((row as { party_size: number }).party_size)) : 0;
          return acc + n;
        }, 0);

        const remaining = Math.max(0, cap - used);
        if (remaining < nextPartySize) return res.status(400).json({ error: "Capacité insuffisante sur ce créneau" });
      }
    }
  }

  if (Object.keys(nextMeta).length !== Object.keys(metaBase).length || proMessageRaw || metaPatchRaw || metaDeleteKeysRaw) {
    patch.meta = nextMeta;
  }

  const hasProposedChange = isRecord(nextMeta.proposed_change);
  const proposedStartsAt = hasProposedChange ? asString((nextMeta.proposed_change as any)?.starts_at) : null;

  if (!Object.keys(patch).length) return res.status(400).json({ error: "No changes provided" });

  const nextStatus = typeof patch.status === "string" ? (patch.status as string) : previousStatus;

  const { error } = await supabase
    .from("reservations")
    .update(patch)
    .eq("id", reservationId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  if (statusRaw && statusRaw !== previousStatus) {
    await supabase.from("system_logs").insert({
      actor_user_id: userResult.user.id,
      actor_role: `pro:${permission.role}`,
      action: "reservation.status_changed",
      entity_type: "reservation",
      entity_id: reservationId,
      payload: {
        establishment_id: establishmentId,
        previous_status: previousStatus,
        new_status: nextStatus,
        refusal_reason_code: refusalReasonCodeRaw ?? null,
        template_code: templateCodeRaw ?? null,
      },
    });

    try {
      const kind = String(nextStatus || "").toLowerCase();

      let consumerEventType: string | null = null;
      let adminType: string | null = null;

      if (kind === "confirmed") {
        consumerEventType = NotificationEventType.booking_confirmed;
        adminType = NotificationEventType.booking_confirmed;
      } else if (kind === "refused") {
        consumerEventType = NotificationEventType.booking_refused;
        adminType = NotificationEventType.booking_refused;
      } else if (kind === "waitlist") {
        consumerEventType = NotificationEventType.booking_waitlisted;
        adminType = NotificationEventType.booking_waitlisted;
      } else if (kind === "noshow") {
        consumerEventType = NotificationEventType.noshow_marked;
        adminType = NotificationEventType.noshow_marked;
      } else if (kind === "cancelled" || kind.startsWith("cancelled_")) {
        consumerEventType = NotificationEventType.booking_cancelled;
        adminType = NotificationEventType.booking_cancelled;
      }

      const ref = bookingReference || reservationId;
      const title = consumerEventType
        ? consumerEventType === NotificationEventType.booking_confirmed
          ? "Réservation confirmée"
          : consumerEventType === NotificationEventType.booking_refused
            ? "Réservation refusée"
            : consumerEventType === NotificationEventType.booking_waitlisted
              ? "Réservation en liste d’attente"
              : consumerEventType === NotificationEventType.noshow_marked
                ? "No-show marqué"
                : consumerEventType === NotificationEventType.booking_cancelled
                  ? "Réservation annulée"
                  : "Mise à jour réservation"
        : "Mise à jour réservation";

      const body = `Réservation ${ref} · ${previousStatus} → ${nextStatus}`;

      if (consumerEventType && consumerUserId) {
        await emitConsumerUserEvent({
          supabase,
          userId: consumerUserId,
          eventType: consumerEventType,
          metadata: {
            reservationId,
            bookingReference: bookingReference || undefined,
            establishmentId,
            previousStatus,
            nextStatus,
          },
        });
      }

      if (adminType) {
        void emitAdminNotification({
          type: adminType,
          title,
          body,
          data: {
            reservationId,
            bookingReference: bookingReference || undefined,
            establishmentId,
            previousStatus,
            nextStatus,
          },
        });
      }
    } catch {
      // ignore
    }
  }

  if (paymentStatusRaw && paymentStatusRaw !== previousPaymentStatus) {
    await supabase.from("system_logs").insert({
      actor_user_id: userResult.user.id,
      actor_role: `pro:${permission.role}`,
      action: "reservation.payment_status_changed",
      entity_type: "reservation",
      entity_id: reservationId,
      payload: {
        establishment_id: establishmentId,
        previous_payment_status: previousPaymentStatus,
        new_payment_status: paymentStatusRaw,
      },
    });

    try {
      const title =
        paymentStatusRaw === "paid"
          ? "Paiement reçu"
          : paymentStatusRaw === "refunded"
            ? "Paiement remboursé"
            : "Paiement en attente";

      const body = `Réservation ${reservationId} · ${previousPaymentStatus} → ${paymentStatusRaw}`;

      await notifyProMembers({
        category: "billing",
        title,
        body,
        data: { reservationId, action: "payment_status_changed", previous: previousPaymentStatus, next: paymentStatusRaw },
      });

      void emitAdminNotification({
        type: paymentStatusRaw === "paid" ? "payment_received" : paymentStatusRaw === "refunded" ? "payment_refunded" : "payment_pending",
        title,
        body,
        data: { reservationId, establishmentId, previousPaymentStatus, paymentStatus: paymentStatusRaw },
      });

      if (consumerUserId && paymentStatusRaw === "refunded") {
        await emitConsumerUserEvent({
          supabase,
          userId: consumerUserId,
          eventType: NotificationEventType.refund_done,
          metadata: {
            reservationId,
            bookingReference: bookingReference || undefined,
            establishmentId,
            previousPaymentStatus,
            paymentStatus: paymentStatusRaw,
          },
        });
      }
    } catch {
      // ignore
    }
  }

  if (hasProposedChange && !hadProposedChange) {
    try {
      const title = "Créneau alternatif proposé";
      const body = `Réservation ${reservationId}${proposedStartsAt ? ` · proposé: ${proposedStartsAt}` : ""}`;

      // Audit trail (best-effort)
      try {
        await supabase.from("system_logs").insert({
          actor_user_id: userResult.user.id,
          actor_role: `pro:${permission.role}`,
          action: "reservation.proposed_change_created",
          entity_type: "reservation",
          entity_id: reservationId,
          payload: {
            establishment_id: establishmentId,
            proposed_change: (nextMeta as any)?.proposed_change ?? null,
          },
        });
      } catch {
        // ignore
      }

      await notifyProMembers({
        category: "booking",
        title,
        body,
        data: { reservationId, action: "proposed_change_created", starts_at: proposedStartsAt },
      });

      void emitAdminNotification({
        type: "alternative_slot_proposed",
        title,
        body,
        data: { reservationId, establishmentId, proposedStartsAt },
      });

      if (consumerUserId) {
        await emitConsumerUserEvent({
          supabase,
          userId: consumerUserId,
          eventType: NotificationEventType.booking_change_proposed,
          metadata: {
            reservationId,
            bookingReference: bookingReference || undefined,
            establishmentId,
            proposedStartsAt: proposedStartsAt || undefined,
          },
        });
      }
    } catch {
      // ignore
    }
  }

  if (consumerUserId && typeof proMessageRaw === "string" && proMessageRaw.trim()) {
    try {
      await emitConsumerUserEvent({
        supabase,
        userId: consumerUserId,
        eventType: NotificationEventType.message_received,
        metadata: {
          reservationId,
          bookingReference: bookingReference || undefined,
          establishmentId,
          from_role: "pro",
          channel: "template",
        },
      });
    } catch {
      // ignore
    }
  }

  // Finance pipeline (escrow/ledger)
  try {
    const actor = { userId: userResult.user.id, role: `pro:${permission.role}` };

    if (paymentStatusRaw && paymentStatusRaw !== previousPaymentStatus && paymentStatusRaw === "paid") {
      await ensureEscrowHoldForReservation({ reservationId, actor });
    }

    const cancelStatuses = new Set(["cancelled", "cancelled_user", "cancelled_pro", "refused", "waitlist"]);

    const computeCancelRefundPercent = async (): Promise<number> => {
      const defaults = { free_cancellation_hours: 24, cancellation_penalty_percent: 50 };

      let freeHours = defaults.free_cancellation_hours;
      let penaltyPct = defaults.cancellation_penalty_percent;

      try {
        const { data: policyRow } = await supabase
          .from("booking_policies")
          .select("free_cancellation_hours,cancellation_penalty_percent")
          .eq("establishment_id", establishmentId)
          .maybeSingle();

        if (typeof (policyRow as any)?.free_cancellation_hours === "number") {
          freeHours = Math.max(0, Math.round((policyRow as any).free_cancellation_hours));
        }

        if (typeof (policyRow as any)?.cancellation_penalty_percent === "number") {
          penaltyPct = Math.min(100, Math.max(0, Math.round((policyRow as any).cancellation_penalty_percent)));
        }
      } catch {
        // ignore
      }

      const startsAtIso = typeof (existing as any)?.starts_at === "string" ? String((existing as any).starts_at) : "";
      const startsAt = startsAtIso ? new Date(startsAtIso) : null;
      const hoursToStart = startsAt && Number.isFinite(startsAt.getTime()) ? (startsAt.getTime() - Date.now()) / (1000 * 60 * 60) : Number.POSITIVE_INFINITY;

      return hoursToStart >= freeHours ? 100 : Math.max(0, 100 - penaltyPct);
    };

    const computeNoShowRefundPercent = async (): Promise<number> => {
      const defaults = { no_show_penalty_percent: 100, no_show_always_100_guaranteed: true };

      let penaltyPct = defaults.no_show_penalty_percent;
      let always100Guaranteed = defaults.no_show_always_100_guaranteed;

      try {
        const { data: policyRow } = await supabase
          .from("booking_policies")
          .select("no_show_penalty_percent,no_show_always_100_guaranteed")
          .eq("establishment_id", establishmentId)
          .maybeSingle();

        if (typeof (policyRow as any)?.no_show_penalty_percent === "number") {
          penaltyPct = Math.min(100, Math.max(0, Math.round((policyRow as any).no_show_penalty_percent)));
        }

        if (typeof (policyRow as any)?.no_show_always_100_guaranteed === "boolean") {
          always100Guaranteed = (policyRow as any).no_show_always_100_guaranteed;
        }
      } catch {
        // ignore
      }

      if (always100Guaranteed && existingDepositCents > 0) penaltyPct = 100;

      return Math.max(0, 100 - penaltyPct);
    };

    const refundPercentForCancel =
      statusRaw && (statusRaw === "cancelled" || statusRaw === "cancelled_user" || statusRaw === "cancelled_pro")
        ? await computeCancelRefundPercent()
        : 100;

    if (paymentStatusRaw && paymentStatusRaw !== previousPaymentStatus && paymentStatusRaw === "refunded") {
      await settleEscrowForReservation({ reservationId, actor, reason: "cancel", refundPercent: 100 });
    }

    if (statusRaw && cancelStatuses.has(statusRaw)) {
      await settleEscrowForReservation({ reservationId, actor, reason: "cancel", refundPercent: refundPercentForCancel });
    }

    if (statusRaw === "noshow") {
      const refundPercentForNoShow = await computeNoShowRefundPercent();
      await settleEscrowForReservation({ reservationId, actor, reason: "noshow", refundPercent: refundPercentForNoShow });
    }

    if (checkedInAtRaw && checkedInAtRaw !== "") {
      await settleEscrowForReservation({ reservationId, actor, reason: "checkin" });
    }
  } catch (e) {
    console.error("finance pipeline failed (pro.updateReservation)", e);
  }

  // NEW: auto-promotion waitlist logic
  // When a reservation frees capacity (cancel, move slot, reduce party size), offer the slot to the next waitlist entry.
  try {
    const occupancy = new Set(["confirmed", "pending_pro_validation", "requested"]);
    const prevSlotId = typeof (existing as any)?.slot_id === "string" ? String((existing as any).slot_id) : "";

    const previousPartySize =
      typeof (existing as any)?.party_size === "number" && Number.isFinite((existing as any).party_size)
        ? Math.max(1, Math.round((existing as any).party_size))
        : 1;

    const nextPartySize =
      typeof (patch as any)?.party_size === "number" && Number.isFinite((patch as any).party_size)
        ? Math.max(1, Math.round((patch as any).party_size))
        : previousPartySize;

    const nextSlotIdRaw = Object.prototype.hasOwnProperty.call(patch, "slot_id") ? (patch.slot_id as any) : prevSlotId;
    const nextSlotId = typeof nextSlotIdRaw === "string" ? nextSlotIdRaw : nextSlotIdRaw == null ? "" : String(nextSlotIdRaw);

    const prevOccupies = occupancy.has(previousStatus);
    const nextOccupies = occupancy.has(nextStatus);

    const freedByStatus = prevOccupies && !nextOccupies;
    const freedBySlotMove = prevOccupies && prevSlotId && nextSlotId && prevSlotId !== nextSlotId;
    const freedByPartyReduction = prevOccupies && nextOccupies && prevSlotId && prevSlotId === nextSlotId && nextPartySize < previousPartySize;

    if (prevSlotId && (freedByStatus || freedBySlotMove || freedByPartyReduction)) {
      void triggerWaitlistPromotionForSlot({
        supabase: supabase as any,
        slotId: prevSlotId,
        actorRole: `pro:${permission.role}`,
        actorUserId: userResult.user.id,
        reason: "pro_update_freed_capacity",
      });
    }
  } catch {
    // ignore
  }

  // Reliability stats (v1): recompute after a no-show or a first check-in.
  // Best-effort: do not block business flows.
  try {
    const nextCheckedInAt = Object.prototype.hasOwnProperty.call(patch, "checked_in_at") ? (patch as any).checked_in_at : null;
    const hasFirstCheckin = !!nextCheckedInAt && !previousCheckedInAt;

    const shouldRecompute =
      !!consumerUserId && ((statusRaw && statusRaw !== previousStatus && statusRaw === "noshow") || hasFirstCheckin);

    if (shouldRecompute) {
      await recomputeConsumerUserStatsV1({ supabase, userId: consumerUserId });
    }
  } catch {
    // ignore
  }

  res.json({ ok: true });
};

export const listProQrScanLogs: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("qr_scan_logs")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("scanned_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, logs: data ?? [] });
};

export const scanProQrCode: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const rawCode = asString(req.body.code);
  const holderName = asString(req.body.holder_name) ?? null;
  if (!rawCode) return res.status(400).json({ error: "code is required" });

  const lookup = extractReservationLookupFromQrCode(rawCode);
  const reservationId = lookup.reservationId;
  const bookingReference = lookup.bookingReference;

  if (!reservationId && !bookingReference) return res.status(400).json({ error: "Impossible de lire le QR code" });

  const supabase = getAdminSupabase();

  const query = supabase
    .from("reservations")
    .select("id,booking_reference,status,payment_status,amount_deposit,checked_in_at,starts_at,user_id")
    .eq("establishment_id", establishmentId)
    .limit(1);

  const { data: reservation, error: resErr } = reservationId
    ? await query.eq("id", reservationId).maybeSingle()
    : await query.eq("booking_reference", bookingReference as string).maybeSingle();

  if (resErr) return res.status(500).json({ error: resErr.message });

  const r = reservation as
    | {
        id: string;
        booking_reference: string | null;
        status: string | null;
        payment_status: string | null;
        amount_deposit: number | null;
        checked_in_at: string | null;
        starts_at: string | null;
      }
    | null;

  if (!r?.id) return res.status(404).json({ error: "Réservation introuvable" });

  const deposit = typeof r.amount_deposit === "number" && Number.isFinite(r.amount_deposit) ? r.amount_deposit : 0;
  const isGuaranteed = deposit > 0;

  const { data: alreadyAccepted, error: acceptedErr } = await supabase
    .from("qr_scan_logs")
    .select("id,scanned_at")
    .eq("reservation_id", r.id)
    .eq("result", "accepted")
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (acceptedErr) return res.status(500).json({ error: acceptedErr.message });

  const nowIso = new Date().toISOString();

  const finalize = async (args: { result: "accepted" | "rejected"; reason: string; message: string }) => {
    const { data: log, error: logErr } = await supabase
      .from("qr_scan_logs")
      .insert({
        establishment_id: establishmentId,
        reservation_id: r.id,
        booking_reference: r.booking_reference,
        payload: JSON.stringify({ code: rawCode, reason: args.reason }),
        scanned_by_user_id: userResult.user.id,
        scanned_at: nowIso,
        holder_name: holderName,
        result: args.result,
      })
      .select("id")
      .single();

    if (logErr) {
      const msg = String(logErr.message ?? "");
      const duplicate = msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique");
      if (duplicate && args.result === "accepted") {
        return res.json({
          ok: true,
          result: "rejected",
          reason: "already_used",
          message: "Déjà validé (utilisation unique)",
          log_id: (log as { id?: string } | null)?.id ?? "",
          reservation: r,
        });
      }
      return res.status(500).json({ error: logErr.message });
    }

    if (args.result === "accepted") {
      if (!r.checked_in_at) {
        await supabase
          .from("reservations")
          .update({ checked_in_at: nowIso })
          .eq("id", r.id)
          .eq("establishment_id", establishmentId);

        // Reliability stats (v1): check-in improves reliability.
        try {
          const consumerUserId = typeof (r as any)?.user_id === "string" ? String((r as any).user_id).trim() : "";
          if (consumerUserId) {
            await recomputeConsumerUserStatsV1({ supabase, userId: consumerUserId });
          }
        } catch {
          // ignore
        }

        // Finance pipeline: check-in triggers settlement (release escrow -> commission + payout)
        try {
          const actor = { userId: userResult.user.id, role: `pro:${permission.role}` };
          await settleEscrowForReservation({ reservationId: r.id, actor, reason: "checkin" });
        } catch (e) {
          console.error("finance pipeline failed (pro.qrCheckin)", e);
        }
      }
    }

    return res.json({
      ok: true,
      result: args.result,
      reason: args.reason,
      message: args.message,
      log_id: (log as { id: string }).id,
      reservation: r,
    });
  };

  if ((alreadyAccepted as { id?: string } | null)?.id) {
    return finalize({ result: "rejected", reason: "already_used", message: "Déjà validé (utilisation unique)" });
  }

  if ((r.status ?? "") !== "confirmed") {
    return finalize({ result: "rejected", reason: "not_confirmed", message: "Réservation non confirmée" });
  }

  if (isGuaranteed && (r.payment_status ?? "") !== "paid") {
    return finalize({ result: "rejected", reason: "unpaid", message: "Réservation garantie non payée" });
  }

  return finalize({ result: "accepted", reason: "ok", message: "Validation acceptée" });
};

export const listProPackBilling: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const [{ data: purchases, error: pErr }, { data: redemptions, error: rErr }] = await Promise.all([
    supabase
      .from("pack_purchases")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("pack_redemptions")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("redeemed_at", { ascending: false })
      .limit(1000),
  ]);

  if (pErr) return res.status(500).json({ error: pErr.message });
  if (rErr) return res.status(500).json({ error: rErr.message });

  res.json({ ok: true, purchases: purchases ?? [], redemptions: redemptions ?? [] });
};

export const listProConversations: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_conversations")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, conversations: data ?? [] });
};

export const listProConversationMessages: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const conversationId = typeof req.params.conversationId === "string" ? req.params.conversationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!conversationId) return res.status(400).json({ error: "conversationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_messages")
    .select("*")
    .eq("establishment_id", establishmentId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, messages: data ?? [] });
};

export const sendProConversationMessage: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const conversationId = typeof req.params.conversationId === "string" ? req.params.conversationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!conversationId) return res.status(400).json({ error: "conversationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const body = asString(req.body.body);
  if (!body) return res.status(400).json({ error: "body is required" });

  const supabase = getAdminSupabase();

  const { data: msg, error: msgErr } = await supabase
    .from("pro_messages")
    .insert({
      conversation_id: conversationId,
      establishment_id: establishmentId,
      from_role: "pro",
      body,
      sender_user_id: userResult.user.id,
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

  // Best-effort notifications (do not block the message).
  try {
    const { data: convo } = await supabase
      .from("pro_conversations")
      .select("subject,reservation_id")
      .eq("id", conversationId)
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    const subject = typeof (convo as any)?.subject === "string" ? String((convo as any).subject).trim() : "Conversation";
    const reservationId = typeof (convo as any)?.reservation_id === "string" ? String((convo as any).reservation_id).trim() : null;

    const snippet = body.length > 120 ? `${body.slice(0, 120)}…` : body;

    const title = "Nouveau message";
    const notifBody = `${subject} · ${snippet}`;

    await notifyProMembers({
      supabase,
      establishmentId,
      category: "messages",
      title,
      body: notifBody,
      excludeUserIds: [userResult.user.id],
      data: {
        conversationId,
        reservationId,
        action: "message_received",
        event_type: NotificationEventType.message_received,
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
        event_type: NotificationEventType.message_received,
      },
    });

    if (reservationId) {
      const { data: resRow } = await supabase
        .from("reservations")
        .select("user_id,booking_reference")
        .eq("establishment_id", establishmentId)
        .eq("id", reservationId)
        .maybeSingle();

      const consumerUserId = typeof (resRow as any)?.user_id === "string" ? String((resRow as any).user_id).trim() : "";
      const bookingReference = typeof (resRow as any)?.booking_reference === "string" ? String((resRow as any).booking_reference).trim() : "";

      if (consumerUserId) {
        await emitConsumerUserEvent({
          supabase,
          userId: consumerUserId,
          eventType: NotificationEventType.message_received,
          metadata: {
            establishmentId,
            conversationId,
            reservationId,
            bookingReference: bookingReference || undefined,
            subject,
            snippet,
            from_role: "pro",
          },
        });
      }
    }
  } catch {
    // ignore
  }

  res.json({ ok: true, message: msg });
};

export const getOrCreateProConversationForReservation: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const reservationId = asString(req.body.reservation_id);
  const subjectOverride = asString(req.body.subject);
  if (!reservationId) return res.status(400).json({ error: "reservation_id is required" });

  const supabase = getAdminSupabase();

  const { data: existing, error: findErr } = await supabase
    .from("pro_conversations")
    .select("*")
    .eq("establishment_id", establishmentId)
    .eq("reservation_id", reservationId)
    .limit(1)
    .maybeSingle();

  if (findErr) return res.status(500).json({ error: findErr.message });
  if ((existing as { id?: string } | null)?.id) return res.json({ ok: true, conversation: existing });

  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("booking_reference")
    .eq("establishment_id", establishmentId)
    .eq("id", reservationId)
    .maybeSingle();

  if (resErr) return res.status(500).json({ error: resErr.message });

  const ref = (reservation as { booking_reference?: string | null } | null)?.booking_reference ?? reservationId.slice(0, 8);

  const { data: created, error: createErr } = await supabase
    .from("pro_conversations")
    .insert({
      establishment_id: establishmentId,
      reservation_id: reservationId,
      subject: subjectOverride ?? `Réservation ${ref}`,
      status: "open",
      meta: {},
    })
    .select("*")
    .single();

  if (createErr) return res.status(500).json({ error: createErr.message });

  res.json({ ok: true, conversation: created });
};

// =============================================================================
// CLIENT MESSAGING HISTORY & READ STATUS
// =============================================================================

/**
 * Get all conversations with a specific client (by user_id from reservation)
 * This allows pro to see the full history of exchanges with a client across all reservations
 */
export const listProClientHistory: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const clientUserId = typeof req.params.clientUserId === "string" ? req.params.clientUserId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!clientUserId) return res.status(400).json({ error: "clientUserId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  // Get all reservations from this client for this establishment
  const { data: reservations, error: resErr } = await supabase
    .from("reservations")
    .select("id, booking_reference, starts_at, party_size, status, customer_name, customer_email")
    .eq("establishment_id", establishmentId)
    .eq("user_id", clientUserId)
    .order("starts_at", { ascending: false })
    .limit(100);

  if (resErr) return res.status(500).json({ error: resErr.message });

  const reservationIds = (reservations ?? []).map((r: any) => r.id);

  if (reservationIds.length === 0) {
    return res.json({ ok: true, client: null, reservations: [], conversations: [], messages: [] });
  }

  // Get all conversations for these reservations
  const { data: conversations, error: convErr } = await supabase
    .from("pro_conversations")
    .select("*")
    .eq("establishment_id", establishmentId)
    .in("reservation_id", reservationIds)
    .order("updated_at", { ascending: false });

  if (convErr) return res.status(500).json({ error: convErr.message });

  const conversationIds = (conversations ?? []).map((c: any) => c.id);

  // Get all messages for these conversations
  let messages: any[] = [];
  if (conversationIds.length > 0) {
    const { data: msgs, error: msgErr } = await supabase
      .from("pro_messages")
      .select("*")
      .eq("establishment_id", establishmentId)
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true })
      .limit(1000);

    if (msgErr) return res.status(500).json({ error: msgErr.message });
    messages = msgs ?? [];
  }

  // Get client info from first reservation
  const firstRes = reservations?.[0] as any;
  const client = firstRes
    ? {
        user_id: clientUserId,
        name: firstRes.customer_name || null,
        email: firstRes.customer_email || null,
        total_reservations: reservations?.length ?? 0,
      }
    : null;

  res.json({
    ok: true,
    client,
    reservations: reservations ?? [],
    conversations: conversations ?? [],
    messages,
  });
};

/**
 * Mark messages as read by the pro (when pro opens a conversation)
 * Also returns read status of messages sent by pro (read_by_client_at)
 */
export const markProMessagesRead: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const conversationId = typeof req.params.conversationId === "string" ? req.params.conversationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!conversationId) return res.status(400).json({ error: "conversationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  // Mark all client messages in this conversation as read by pro
  const { error: updateErr } = await supabase
    .from("pro_messages")
    .update({ read_by_pro_at: nowIso })
    .eq("establishment_id", establishmentId)
    .eq("conversation_id", conversationId)
    .eq("from_role", "client")
    .is("read_by_pro_at", null);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  // Reset unread count on conversation
  await supabase
    .from("pro_conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId)
    .eq("establishment_id", establishmentId);

  res.json({ ok: true, marked_at: nowIso });
};

/**
 * Get message read receipts (who read what and when)
 */
export const getProMessageReadReceipts: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const conversationId = typeof req.params.conversationId === "string" ? req.params.conversationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!conversationId) return res.status(400).json({ error: "conversationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  // Get messages with read status
  const { data: messages, error } = await supabase
    .from("pro_messages")
    .select("id, from_role, read_by_pro_at, read_by_client_at, created_at")
    .eq("establishment_id", establishmentId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, messages: messages ?? [] });
};

// =============================================================================
// AUTO-REPLY SETTINGS
// =============================================================================

/**
 * Get auto-reply settings for an establishment
 */
export const getProAutoReplySettings: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_auto_reply_settings")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });

  // Return default settings if none exist
  const settings = data ?? {
    id: null,
    establishment_id: establishmentId,
    enabled: false,
    message: "Bonjour, merci pour votre message. Nous sommes actuellement indisponibles mais nous vous répondrons dès que possible.",
    start_time: null,
    end_time: null,
    days_of_week: [],
    is_on_vacation: false,
    vacation_start: null,
    vacation_end: null,
    vacation_message: "Nous sommes actuellement en congés. Nous traiterons votre message à notre retour.",
    created_at: null,
    updated_at: null,
  };

  res.json({ ok: true, settings });
};

/**
 * Update auto-reply settings for an establishment
 */
export const updateProAutoReplySettings: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id, requiredRole: "manager" });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  // Build update object from allowed fields
  const updateData: Record<string, unknown> = {
    establishment_id: establishmentId,
    updated_at: nowIso,
  };

  if (typeof req.body.enabled === "boolean") updateData.enabled = req.body.enabled;
  if (typeof req.body.message === "string") updateData.message = req.body.message.trim().slice(0, 1000);
  if (typeof req.body.start_time === "string" || req.body.start_time === null) updateData.start_time = req.body.start_time;
  if (typeof req.body.end_time === "string" || req.body.end_time === null) updateData.end_time = req.body.end_time;
  if (Array.isArray(req.body.days_of_week)) updateData.days_of_week = req.body.days_of_week.filter((d: unknown) => typeof d === "number" && d >= 0 && d <= 6);
  if (typeof req.body.is_on_vacation === "boolean") updateData.is_on_vacation = req.body.is_on_vacation;
  if (typeof req.body.vacation_start === "string" || req.body.vacation_start === null) updateData.vacation_start = req.body.vacation_start;
  if (typeof req.body.vacation_end === "string" || req.body.vacation_end === null) updateData.vacation_end = req.body.vacation_end;
  if (typeof req.body.vacation_message === "string") updateData.vacation_message = req.body.vacation_message.trim().slice(0, 1000);

  // Upsert settings
  const { data: existing } = await supabase
    .from("pro_auto_reply_settings")
    .select("id")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  let result;
  if ((existing as any)?.id) {
    const { data, error } = await supabase
      .from("pro_auto_reply_settings")
      .update(updateData)
      .eq("establishment_id", establishmentId)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    result = data;
  } else {
    updateData.created_at = nowIso;
    const { data, error } = await supabase
      .from("pro_auto_reply_settings")
      .insert(updateData)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    result = data;
  }

  res.json({ ok: true, settings: result });
};

export const seedFakeReservations: RequestHandler = async (req, res) => {
  if (!isDemoRoutesAllowed()) return res.status(404).json({ error: "not_found" });

  const demoEmail = getDemoProEmail();
  if (!demoEmail) return res.status(404).json({ error: "not_found" });

  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const email = userResult.user.email ? normalizeEmail(userResult.user.email) : "";
  if (email !== demoEmail) return res.status(403).json({ error: "Forbidden" });

  const countPerStatusRaw = isRecord(req.body) ? asNumber(req.body.count_per_status) : undefined;
  const countPerStatus = Math.min(10, Math.max(1, Math.round(countPerStatusRaw ?? 2)));

  const supabase = getAdminSupabase();

  const { data: est, error: estErr } = await supabase.from("establishments").select("universe").eq("id", establishmentId).maybeSingle();
  if (estErr) return res.status(500).json({ error: estErr.message });
  const kind = typeof (est as { universe?: unknown } | null)?.universe === "string" ? (est as { universe: string }).universe : "unknown";

  const [{ data: slots, error: slotsErr }, { data: packs, error: packsErr }] = await Promise.all([
    supabase
      .from("pro_slots")
      .select("id,starts_at,base_price")
      .eq("establishment_id", establishmentId)
      .order("starts_at", { ascending: true })
      .limit(25),
    supabase
      .from("packs")
      .select("id,price")
      .eq("establishment_id", establishmentId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  if (slotsErr) return res.status(500).json({ error: slotsErr.message });
  if (packsErr) return res.status(500).json({ error: packsErr.message });

  const slotRows = (slots ?? []) as Array<{ id: string; starts_at: string; base_price: number | null }>;
  const packRows = (packs ?? []) as Array<{ id: string; price: number }>;

  const batchId = randomUUID();
  const now = new Date();

  const templates: Array<{
    status: "requested" | "confirmed" | "cancelled" | "noshow";
    payment: "pending" | "paid" | "refunded";
    timeOffsetsDays: number[];
    hours: number[];
  }> = [
    { status: "requested", payment: "pending", timeOffsetsDays: [1, 2, 3, 5, 7], hours: [18, 19, 20, 21] },
    { status: "confirmed", payment: "paid", timeOffsetsDays: [-1, -2, -4, -6, -9], hours: [19, 20, 21] },
    { status: "cancelled", payment: "refunded", timeOffsetsDays: [-2, -5, -8, -11], hours: [18, 20] },
    { status: "noshow", payment: "paid", timeOffsetsDays: [-3, -6, -10, -14], hours: [19, 21] },
  ];

  const amountSamplesMad = [180, 220, 260, 320, 380, 450, 520, 600, 750, 980];

  const demoGuests = [
    { first: "Youssef", last: "El Amrani", phone: "06 12 34 56 78" },
    { first: "Fatima Zahra", last: "El Idrissi", phone: "07 23 45 67 89" },
    { first: "Ahmed", last: "Al Fassi", phone: "06 98 76 54 32" },
    { first: "Khadija", last: "Benali", phone: "07 11 22 33 44" },
    { first: "Omar", last: "Berrada", phone: "06 55 66 77 88" },
    { first: "Salma", last: "Aït Lahcen", phone: "07 88 77 66 55" },
    { first: "Hicham", last: "El Kettani", phone: "06 33 44 55 66" },
    { first: "Nadia", last: "Chraibi", phone: "07 44 55 66 77" },
  ];

  const demoComments = [
    "Table en terrasse si possible",
    "Allergie: fruits à coque",
    "Anniversaire (petite attention)",
    "Arrivée un peu en retard",
    "Besoin d’une chaise bébé",
    "Sans gluten si possible",
    "Merci de confirmer par WhatsApp",
    "",
  ];

  const mkIso = (days: number, hour: number) =>
    mkIsoInTimeZoneDayOffset({
      baseDate: now,
      daysOffset: days,
      hour,
    });

  const rows: Array<Record<string, unknown>> = [];

  for (const t of templates) {
    for (let i = 0; i < countPerStatus; i += 1) {
      const offset = t.timeOffsetsDays[i % t.timeOffsetsDays.length];
      const hour = t.hours[i % t.hours.length];

      const slot = slotRows.length ? slotRows[(i + rows.length) % slotRows.length] : null;
      const pack = packRows.length ? packRows[(i + rows.length) % packRows.length] : null;

      const useSlot = !!slot && (t.status === "requested" || t.status === "confirmed");
      const usePack = !!pack && (t.status === "requested" || t.status === "confirmed") && (i % 2 === 1);

      const starts_at = useSlot ? slot!.starts_at : mkIso(offset, hour);

      const amountTotalCents = usePack
        ? pack!.price
        : useSlot && typeof slot!.base_price === "number"
          ? slot!.base_price
          : Math.round(amountSamplesMad[(i + rows.length) % amountSamplesMad.length] * 100);

      const depositForRequest = t.status === "requested" ? i % 2 === 1 : true;

      const payment_status =
        t.status === "requested"
          ? depositForRequest
            ? "paid"
            : "pending"
          : t.payment;

      const amountDepositCents =
        t.status === "requested"
          ? depositForRequest
            ? Math.round(amountTotalCents * 0.3)
            : null
          : Math.round(amountTotalCents * 0.3);

      const commission_percent = 10;
      const commission_amount = amountDepositCents ? Math.round((amountDepositCents * commission_percent) / 100) : null;

      const guest = demoGuests[(i + rows.length) % demoGuests.length];
      const comment = demoComments[(i + rows.length * 2) % demoComments.length];

      rows.push({
        booking_reference: `FAKE-${establishmentId.slice(0, 6)}-${randomUUID().slice(0, 8)}`,
        kind,
        establishment_id: establishmentId,
        user_id: null,
        status: t.status,
        starts_at,
        ends_at: null,
        party_size: kind === "hebergement" ? 2 : 2 + ((i + rows.length) % 5),
        amount_total: amountTotalCents,
        amount_deposit: amountDepositCents,
        currency: "MAD",
        payment_status,
        commission_percent,
        commission_amount,
        checked_in_at: t.status === "confirmed" && i % 2 === 0 ? new Date().toISOString() : null,
        meta: {
          demo: true,
          source: "seed",
          seed_batch: batchId,
          seeded_by_pro: userResult.user.id,
          seeded_by_role: permission.role,
          guest_first_name: guest.first,
          guest_last_name: guest.last,
          guest_phone: guest.phone,
          guest_comment: comment,
          client_risk_score: Math.max(35, 95 - (((i + rows.length) * 9) % 70)),
          no_show_count: ((i + rows.length) % 3) === 0 ? 1 : 0,
          ...(useSlot ? { slot_id: slot!.id } : {}),
          ...(usePack ? { pack_id: pack!.id } : {}),
        },
      });
    }
  }

  if (rows.length > 200) return res.status(400).json({ error: "Too many rows" });

  const { error: insertErr } = await supabase.from("reservations").insert(rows);
  if (insertErr) return res.status(500).json({ error: insertErr.message });

  res.json({ ok: true, inserted: rows.length, batch_id: batchId });
};

export const createProTeamUser: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const emailRaw = asString(req.body.email);
  const password = asString(req.body.password);
  const roleRaw = asString(req.body.role);

  const email = emailRaw ? normalizeEmail(emailRaw) : "";

  if (!email || !email.includes("@")) return res.status(400).json({ error: "Email invalide" });
  if (!password || password.length < 6) return res.status(400).json({ error: "Mot de passe invalide" });

  const allowedRoles = new Set<ProRole>(["manager", "reception", "accounting", "marketing"]);
  const targetRole: ProRole = roleRaw && allowedRoles.has(roleRaw) ? roleRaw : "manager";

  const supabase = getAdminSupabase();

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created.user) {
    return res.status(400).json({ error: createErr?.message ?? "Impossible de créer l’utilisateur" });
  }

  const { error: membershipErr } = await supabase.from("pro_establishment_memberships").insert({
    establishment_id: establishmentId,
    user_id: created.user.id,
    role: targetRole,
  });

  if (membershipErr) return res.status(500).json({ error: membershipErr.message });

  // Create pro_profiles entry with must_change_password flag
  const { error: profileErr } = await supabase.from("pro_profiles").upsert(
    {
      id: created.user.id,
      must_change_password: true,
    },
    { onConflict: "id" }
  );

  if (profileErr) {
    console.error("[createProTeamUser] Failed to create pro_profiles:", profileErr.message);
  }

  // Send welcome email with provisional password
  try {
    // Get establishment name for the email
    const { data: establishment } = await supabase
      .from("establishments")
      .select("name")
      .eq("id", establishmentId)
      .maybeSingle();

    const establishmentName = establishment?.name ?? "l'établissement";
    const baseUrl = (process.env.PUBLIC_URL ?? "https://sortiraumaroc.com").replace(/\/+$/, "");
    const loginUrl = `${baseUrl}/pro`;

    await sendTemplateEmail({
      templateKey: "pro_welcome_password",
      lang: "fr",
      fromKey: "pro",
      to: [email],
      variables: {
        email,
        password,
        establishment_name: establishmentName,
        login_url: loginUrl,
      },
    });
  } catch (emailErr) {
    console.error("[createProTeamUser] Failed to send welcome email:", emailErr);
    // Don't fail the request, user was created successfully
  }

  res.json({ ok: true, user_id: created.user.id });
};

export const listProTeamMembers: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("pro_establishment_memberships")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // Fetch emails and ban status for all members using auth.admin.getUserById
  const members = data ?? [];
  const userDataMap = new Map<string, { email: string; is_banned: boolean }>();

  for (const m of members as Array<{ user_id?: string }>) {
    const userId = m.user_id;
    if (!userId) continue;

    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId);
    if (userErr) {
      console.error(`[listProTeamMembers] Failed to get user ${userId}:`, userErr.message);
      continue;
    }
    if (userData?.user) {
      const user = userData.user;
      const isBanned = !!(user.banned_until && new Date(user.banned_until) > new Date());
      userDataMap.set(userId, {
        email: user.email ?? "",
        is_banned: isBanned,
      });
    }
  }

  // Enrich members with email and is_banned
  const enrichedMembers = members.map((m: { user_id?: string }) => {
    const userData = m.user_id ? userDataMap.get(m.user_id) : null;
    return {
      ...m,
      email: userData?.email ?? null,
      is_banned: userData?.is_banned ?? false,
    };
  });

  console.log(`[listProTeamMembers] Found ${userDataMap.size} users for ${members.length} members`);

  return res.json({ ok: true, members: enrichedMembers });
};

export const updateProTeamMemberRole: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const membershipId = typeof req.params.membershipId === "string" ? req.params.membershipId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!membershipId) return res.status(400).json({ error: "membershipId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const roleRaw = asString(req.body.role);
  const allowedRoles = new Set<ProRole>(["manager", "reception", "accounting", "marketing"]);
  const nextRole: ProRole = roleRaw && allowedRoles.has(roleRaw) ? roleRaw : "";
  if (!nextRole) return res.status(400).json({ error: "Role invalide" });

  const supabase = getAdminSupabase();

  const { data: existing, error: existingErr } = await supabase
    .from("pro_establishment_memberships")
    .select("id,role")
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (!existing) return res.status(404).json({ error: "membership_not_found" });

  const currentRole = (existing as { role?: unknown } | null)?.role;
  if (typeof currentRole === "string" && currentRole === "owner") {
    return res.status(400).json({ error: "Cannot change owner role" });
  }

  const { error } = await supabase
    .from("pro_establishment_memberships")
    .update({ role: nextRole })
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true });
};

export const deleteProTeamMember: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const membershipId = typeof req.params.membershipId === "string" ? req.params.membershipId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!membershipId) return res.status(400).json({ error: "membershipId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  // Check if the membership exists and is not owner
  const { data: existing, error: existingErr } = await supabase
    .from("pro_establishment_memberships")
    .select("id,role,user_id")
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (!existing) return res.status(404).json({ error: "membership_not_found" });

  const currentRole = (existing as { role?: unknown } | null)?.role;
  if (typeof currentRole === "string" && currentRole === "owner") {
    return res.status(400).json({ error: "Cannot delete owner membership" });
  }

  // Delete the membership
  const { error: deleteErr } = await supabase
    .from("pro_establishment_memberships")
    .delete()
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId);

  if (deleteErr) return res.status(500).json({ error: deleteErr.message });

  return res.json({ ok: true });
};

export const updateProTeamMemberEmail: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const membershipId = typeof req.params.membershipId === "string" ? req.params.membershipId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!membershipId) return res.status(400).json({ error: "membershipId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const emailRaw = asString(req.body.email);
  const newEmail = emailRaw ? normalizeEmail(emailRaw) : "";
  if (!newEmail || !newEmail.includes("@")) return res.status(400).json({ error: "Email invalide" });

  const supabase = getAdminSupabase();

  // Get the membership to find user_id
  const { data: membership, error: membershipErr } = await supabase
    .from("pro_establishment_memberships")
    .select("id,role,user_id")
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (membershipErr) return res.status(500).json({ error: membershipErr.message });
  if (!membership) return res.status(404).json({ error: "membership_not_found" });

  const userId = (membership as { user_id?: string }).user_id;
  if (!userId) return res.status(400).json({ error: "user_id not found" });

  // Update the user's email
  const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  });

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  return res.json({ ok: true, email: newEmail });
};

export const toggleProTeamMemberActive: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const membershipId = typeof req.params.membershipId === "string" ? req.params.membershipId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!membershipId) return res.status(400).json({ error: "membershipId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const active = asBoolean(req.body.active);
  if (typeof active !== "boolean") return res.status(400).json({ error: "active must be a boolean" });

  const supabase = getAdminSupabase();

  // Get the membership to find user_id and check role
  const { data: membership, error: membershipErr } = await supabase
    .from("pro_establishment_memberships")
    .select("id,role,user_id")
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (membershipErr) return res.status(500).json({ error: membershipErr.message });
  if (!membership) return res.status(404).json({ error: "membership_not_found" });

  const currentRole = (membership as { role?: string }).role;
  if (currentRole === "owner") {
    return res.status(400).json({ error: "Cannot deactivate owner" });
  }

  const userId = (membership as { user_id?: string }).user_id;
  if (!userId) return res.status(400).json({ error: "user_id not found" });

  // Ban or unban the user
  if (active) {
    // Unban: set ban_duration to "none"
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: "none",
    });
    if (updateErr) return res.status(500).json({ error: updateErr.message });
  } else {
    // Ban indefinitely
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: "876600h", // ~100 years
    });
    if (updateErr) return res.status(500).json({ error: updateErr.message });
  }

  return res.json({ ok: true, active });
};

export const resetProTeamMemberPassword: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const membershipId = typeof req.params.membershipId === "string" ? req.params.membershipId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!membershipId) return res.status(400).json({ error: "membershipId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  // Get the membership to find user_id
  const { data: membership, error: membershipErr } = await supabase
    .from("pro_establishment_memberships")
    .select("id,role,user_id")
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (membershipErr) return res.status(500).json({ error: membershipErr.message });
  if (!membership) return res.status(404).json({ error: "membership_not_found" });

  const userId = (membership as { user_id?: string }).user_id;
  if (!userId) return res.status(400).json({ error: "user_id not found" });

  // Get the user's email
  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId);
  if (userErr || !userData?.user?.email) {
    return res.status(500).json({ error: "Could not get user email" });
  }

  const email = userData.user.email;

  // Generate a new temporary password
  const tempPassword = randomBytes(8).toString("hex");

  // Update the user's password
  const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
    password: tempPassword,
  });

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  // Mark that user must change password
  await supabase.from("pro_profiles").upsert(
    { id: userId, must_change_password: true },
    { onConflict: "id" }
  );

  // Send email with new password
  try {
    const { data: establishment } = await supabase
      .from("establishments")
      .select("name")
      .eq("id", establishmentId)
      .maybeSingle();

    const establishmentName = establishment?.name ?? "l'établissement";
    const baseUrl = (process.env.PUBLIC_URL ?? "https://sortiraumaroc.com").replace(/\/+$/, "");
    const loginUrl = `${baseUrl}/pro`;

    await sendTemplateEmail({
      templateKey: "pro_password_reset",
      lang: "fr",
      fromKey: "pro",
      to: [email],
      variables: {
        email,
        password: tempPassword,
        establishment_name: establishmentName,
        login_url: loginUrl,
      },
    });
  } catch (emailErr) {
    console.error("[resetProTeamMemberPassword] Failed to send email:", emailErr);
    // Don't fail - password was reset successfully
  }

  return res.json({ ok: true });
};

export const activateProOwnerMembership: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const { data: est, error: estErr } = await supabase
    .from("establishments")
    .select("id,created_by")
    .eq("id", establishmentId)
    .maybeSingle();

  if (estErr) return res.status(500).json({ error: estErr.message });

  const createdBy = (est as { created_by?: unknown } | null)?.created_by;
  if (typeof createdBy !== "string" || createdBy !== userResult.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { data: existing, error: existingErr } = await supabase
    .from("pro_establishment_memberships")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userResult.user.id)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });

  if (!existing) {
    const { error } = await supabase.from("pro_establishment_memberships").insert({
      establishment_id: establishmentId,
      user_id: userResult.user.id,
      role: "owner",
    });

    if (error) return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true });
};

export const listProCampaigns: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("pro_campaigns")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  const campaigns = (data ?? []) as Array<Record<string, unknown>>;

  const getStartIso = (c: Record<string, unknown>): string => {
    const starts = asString(c.starts_at);
    if (starts) return starts;
    const created = asString(c.created_at);
    return created ?? nowIso;
  };

  const getEndIso = (c: Record<string, unknown>): string => {
    const ends = asString(c.ends_at);
    return ends ?? nowIso;
  };

  // Derive reservation/pack conversions within the campaign window.
  // This is not perfect attribution (it counts all conversions during the period)
  // but gives PRO users usable, real-time visibility without additional client integrations.
  let minStartMs = Number.POSITIVE_INFINITY;
  let maxEndMs = Number.NEGATIVE_INFINITY;

  for (const c of campaigns) {
    const sMs = Date.parse(getStartIso(c));
    const eMs = Date.parse(getEndIso(c));
    if (Number.isFinite(sMs)) minStartMs = Math.min(minStartMs, sMs);
    if (Number.isFinite(eMs)) maxEndMs = Math.max(maxEndMs, eMs);
  }

  let reservationTimes: number[] = [];
  let packPurchaseTimes: number[] = [];

  if (Number.isFinite(minStartMs) && Number.isFinite(maxEndMs)) {
    const minIso = new Date(minStartMs).toISOString();
    const maxIso = new Date(maxEndMs).toISOString();

    const [{ data: reservations }, { data: purchases }] = await Promise.all([
      supabase
        .from("reservations")
        .select("created_at")
        .eq("establishment_id", establishmentId)
        .gte("created_at", minIso)
        .lte("created_at", maxIso)
        .limit(5000),
      supabase
        .from("pack_purchases")
        .select("created_at,payment_status")
        .eq("establishment_id", establishmentId)
        .gte("created_at", minIso)
        .lte("created_at", maxIso)
        .limit(5000),
    ]);

    reservationTimes = (reservations ?? [])
      .map((r) => (isRecord(r) ? Date.parse(asString((r as any).created_at) ?? "") : NaN))
      .filter((t) => Number.isFinite(t));

    packPurchaseTimes = (purchases ?? [])
      .filter((p) => {
        const ps = isRecord(p) ? asString((p as any).payment_status) : null;
        return (ps ?? "").toLowerCase() === "paid";
      })
      .map((p) => (isRecord(p) ? Date.parse(asString((p as any).created_at) ?? "") : NaN))
      .filter((t) => Number.isFinite(t));
  }

  const patched = campaigns.map((c) => {
    const sMs = Date.parse(getStartIso(c));
    const eMs = Date.parse(getEndIso(c));

    const windowStart = Number.isFinite(sMs) ? sMs : nowMs;
    const windowEnd = Number.isFinite(eMs) ? eMs : nowMs;

    const derivedReservations = reservationTimes.reduce(
      (acc, t) => (t >= windowStart && t <= windowEnd ? acc + 1 : acc),
      0,
    );
    const derivedPacks = packPurchaseTimes.reduce((acc, t) => (t >= windowStart && t <= windowEnd ? acc + 1 : acc), 0);

    const existingReservations = safeInt((c as any).reservations_count);
    const existingPacks = safeInt((c as any).packs_count);

    const next: Record<string, unknown> = {
      ...c,
      reservations_count: Math.max(existingReservations, derivedReservations),
      packs_count: Math.max(existingPacks, derivedPacks),
    };

    // Best-effort auto-end campaigns when their end date has passed
    if (asString(c.ends_at)) {
      const endsMs = Date.parse(asString(c.ends_at) ?? "");
      const status = (asString(c.status) ?? "").toLowerCase();
      if (Number.isFinite(endsMs) && endsMs < nowMs && status === "active") {
        next.status = "ended";
      }
    }

    return next;
  });

  return res.json({ ok: true, campaigns: patched });
};

export const createProCampaign: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (permission.role !== "owner" && permission.role !== "marketing") {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const type = asString(req.body.type) ?? "home_feature";
  const title = asString(req.body.title) ?? "";
  const budget = asNumber(req.body.budget);

  const billingModelRaw = asString((req.body as any).billing_model) ?? asString((req.body as any).billingModel) ?? "cpc";
  const billing_model = billingModelRaw.trim().toLowerCase();

  const startsAtRaw = asString(req.body.starts_at);
  const endsAtRaw = asString(req.body.ends_at);

  if (!title || title.length < 2) return res.status(400).json({ error: "Titre requis" });
  if (budget === undefined || !Number.isFinite(budget) || budget <= 0) return res.status(400).json({ error: "Budget invalide" });
  if (billing_model !== "cpc" && billing_model !== "cpm") {
    return res.status(400).json({ error: "Mode de facturation invalide" });
  }

  const starts_at = startsAtRaw ? new Date(startsAtRaw).toISOString() : null;
  const ends_at = endsAtRaw ? new Date(endsAtRaw).toISOString() : null;

  const nowMs = Date.now();
  const startsMs = starts_at ? Date.parse(starts_at) : null;
  const endsMs = ends_at ? Date.parse(ends_at) : null;

  let status: "draft" | "active" | "ended" = "active";
  if (startsMs != null && Number.isFinite(startsMs) && startsMs > nowMs) status = "draft";
  if (endsMs != null && Number.isFinite(endsMs) && endsMs <= nowMs) status = "ended";

  // Default pricing (in cents)
  const cpc_cents = 200; // 2 MAD / click
  const cpm_cents = 2000; // 20 MAD / 1000 impressions

  const budgetCents = Math.round(budget);

  const supabase = getAdminSupabase();
  const { data: created, error } = await supabase
    .from("pro_campaigns")
    .insert({
      establishment_id: establishmentId,
      type,
      title,
      billing_model,
      budget: budgetCents,
      cpc_cents,
      cpm_cents,
      spent_cents: 0,
      remaining_cents: Math.max(0, budgetCents),
      impressions: 0,
      clicks: 0,
      reservations_count: 0,
      packs_count: 0,
      starts_at,
      ends_at,
      status,
      metrics: {},
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, campaign: created });
};

export const deleteProCampaign: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const campaignId = typeof req.params.campaignId === "string" ? req.params.campaignId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!campaignId) return res.status(400).json({ error: "campaignId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (permission.role !== "owner" && permission.role !== "marketing") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("pro_campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Visibilité (SAM Media) - offers + orders
// ---------------------------------------------------------------------------

type VisibilityOfferRow = {
  id: string;
  title: string;
  description: string | null;
  type: "pack" | "option" | string;
  deliverables: string[] | null;
  duration_days: number | null;
  price_cents: number | null;
  currency: string | null;
  active: boolean | null;
  allow_quantity: boolean | null;
  tax_rate_bps: number | null;
  tax_label: string | null;
  display_order: number | null;
  deleted_at?: string | null;
};

function safeInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return 0;
}

function safeCurrency(v: unknown): string {
  const c = typeof v === "string" ? v.trim().toUpperCase() : "";
  return c || "MAD";
}

function normalizeVisibilityStatus(v: unknown): "pending" | "in_progress" | "delivered" | "cancelled" | "refunded" {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "in_progress") return "in_progress";
  if (s === "delivered") return "delivered";
  if (s === "cancelled") return "cancelled";
  if (s === "refunded") return "refunded";
  return "pending";
}

function createStubEventId(): string {
  const rand = Math.random().toString(16).slice(2, 10);
  return `stub_evt_${Date.now()}_${rand}`;
}

function createStubTransactionId(orderId: string): string {
  const rand = Math.random().toString(16).slice(2, 8);
  return `stub_txn_${orderId.slice(0, 8)}_${Date.now()}_${rand}`;
}

function appendStringToMetaList(meta: Record<string, unknown>, key: string, value: string, max = 50): Record<string, unknown> {
  const list = Array.isArray(meta[key]) ? (meta[key] as unknown[]) : [];
  const existing = list.filter((x) => typeof x === "string") as string[];
  const next = existing.includes(value) ? existing : [...existing, value].slice(-max);
  return { ...meta, [key]: next };
}

type VisibilityPromoCodeRow = {
  id: string;
  code: string;
  description: string | null;
  discount_bps: number | null;
  applies_to_type: string | null;
  applies_to_offer_id: string | null;
  applies_to_establishment_ids: string[] | null;
  active: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  deleted_at: string | null;
};

function normalizePromoCode(v: unknown): string {
  return typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, "") : "";
}

function isWithinPromoWindow(row: VisibilityPromoCodeRow, now = new Date()): boolean {
  const startIso = row.starts_at;
  const endIso = row.ends_at;
  if (startIso) {
    const s = new Date(startIso);
    if (Number.isFinite(s.getTime()) && s.getTime() > now.getTime()) return false;
  }
  if (endIso) {
    const e = new Date(endIso);
    if (Number.isFinite(e.getTime()) && e.getTime() < now.getTime()) return false;
  }
  return true;
}

function normalizePromoEstablishmentIds(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;

  const out: string[] = [];
  for (const raw of v) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= 200) break;
  }

  return out.length ? out : null;
}

function promoAppliesToEstablishment(promo: VisibilityPromoCodeRow, establishmentId: string): boolean {
  const list = normalizePromoEstablishmentIds((promo as any).applies_to_establishment_ids) ?? null;
  if (!list || list.length === 0) return true;
  return list.includes(establishmentId);
}

async function getActiveVisibilityPromoCode(args: { code: string; establishmentId: string }): Promise<VisibilityPromoCodeRow | null> {
  const code = args.code;
  if (!code) return null;

  const supabase = getAdminSupabase();

  const baseSelect = "id,code,description,discount_bps,applies_to_type,applies_to_offer_id,active,starts_at,ends_at,deleted_at";
  const selectWithEst = `${baseSelect},applies_to_establishment_ids`;

  const run = async (select: string) => {
    return await supabase
      .from("visibility_promo_codes")
      .select(select)
      .is("deleted_at", null)
      .eq("active", true)
      .eq("code", code)
      .limit(1)
      .maybeSingle();
  };

  const first = await run(selectWithEst);
  const res = first.error && /applies_to_establishment_ids/i.test(first.error.message) ? await run(baseSelect) : first;

  if (res.error) return null;
  const row = res.data as any as VisibilityPromoCodeRow | null;
  if (!row?.id) return null;
  if (!isWithinPromoWindow(row)) return null;
  if (!promoAppliesToEstablishment(row, args.establishmentId)) return null;

  const normalizedIds = normalizePromoEstablishmentIds((row as any).applies_to_establishment_ids);
  return { ...(row as any), applies_to_establishment_ids: normalizedIds } as VisibilityPromoCodeRow;
}

function promoAppliesToOffer(promo: VisibilityPromoCodeRow, offer: VisibilityOfferRow): boolean {
  const offerType = String(offer.type ?? "").toLowerCase();
  const promoType = promo.applies_to_type ? String(promo.applies_to_type).toLowerCase() : null;
  if (promo.applies_to_offer_id && String(promo.applies_to_offer_id) === String(offer.id)) return true;
  if (promoType) return promoType === offerType;
  return true;
}

function computePromoDiscountCents(args: { promo: VisibilityPromoCodeRow; lines: Array<{ offer: VisibilityOfferRow; quantity: number }> }): {
  eligibleSubtotalCents: number;
  discountCents: number;
} {
  const bps = Math.max(0, Math.min(10000, safeInt(args.promo.discount_bps)));
  if (bps <= 0) return { eligibleSubtotalCents: 0, discountCents: 0 };

  let eligibleSubtotalCents = 0;
  for (const line of args.lines) {
    if (!promoAppliesToOffer(args.promo, line.offer)) continue;
    const unit = Math.max(0, safeInt(line.offer.price_cents));
    eligibleSubtotalCents += unit * Math.max(1, Math.min(50, safeInt(line.quantity)));
  }

  const discountCents = Math.round((eligibleSubtotalCents * bps) / 10000);
  return { eligibleSubtotalCents, discountCents: Math.max(0, discountCents) };
}

export const listProVisibilityOffers: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const filterType = typeof req.query.type === "string" ? req.query.type.trim().toLowerCase() : "";

  const supabase = getAdminSupabase();
  let q = supabase
    .from("visibility_offers")
    .select("id,title,description,type,deliverables,duration_days,price_cents,currency,active,allow_quantity,tax_rate_bps,tax_label,display_order,deleted_at")
    .is("deleted_at", null)
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);

  if (filterType) {
    q = q.eq("type", filterType);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const offers = (data ?? []).map((o: any) => ({
    ...o,
    // Keep legacy client compatibility (some UIs expect is_active)
    is_active: typeof o?.active === "boolean" ? o.active : Boolean(o?.is_active),
  }));

  return res.json({ ok: true, offers });
};

export const validateProVisibilityPromoCode: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  if (!Array.isArray((req.body as any).items)) return res.status(400).json({ error: "items is required" });

  const promoCode = normalizePromoCode((req.body as any).promo_code);
  if (!promoCode) return res.status(400).json({ error: "promo_code is required" });

  const rawItems = (req.body as any).items as Array<Record<string, unknown>>;
  const normalized = rawItems
    .map((it) => {
      const offerId = typeof it.offer_id === "string" ? it.offer_id.trim() : "";
      const qty = typeof it.quantity === "number" && Number.isFinite(it.quantity) ? Math.floor(it.quantity) : safeInt(it.quantity);
      return { offer_id: offerId, quantity: Math.max(1, Math.min(50, qty || 1)) };
    })
    .filter((x) => x.offer_id);

  if (!normalized.length) return res.status(400).json({ error: "No valid items" });

  const offerIds = [...new Set(normalized.map((x) => x.offer_id))];
  const supabase = getAdminSupabase();

  const { data: offers, error: offersErr } = await supabase
    .from("visibility_offers")
    .select("id,title,description,type,deliverables,duration_days,price_cents,currency,active,allow_quantity,tax_rate_bps,tax_label,display_order,deleted_at")
    .in("id", offerIds)
    .is("deleted_at", null)
    .limit(200);

  if (offersErr) return res.status(500).json({ error: offersErr.message });

  const byId = new Map<string, VisibilityOfferRow>();
  for (const o of (offers ?? []) as any[]) {
    if (typeof o?.id === "string") byId.set(o.id, o as VisibilityOfferRow);
  }

  const lines: Array<{ offer: VisibilityOfferRow; quantity: number }> = [];
  let subtotalCents = 0;
  let currency = "MAD";

  for (const line of normalized) {
    const off = byId.get(line.offer_id);
    if (!off || off.active !== true) return res.status(400).json({ error: "offer_inactive", offer_id: line.offer_id });

    const allowQty = off.allow_quantity === true;
    const quantity = allowQty ? line.quantity : 1;
    const unit = Math.max(0, safeInt(off.price_cents));

    subtotalCents += unit * quantity;
    currency = safeCurrency(off.currency);

    lines.push({ offer: off, quantity });
  }

  const promo = await getActiveVisibilityPromoCode({ code: promoCode, establishmentId });
  if (!promo) return res.status(404).json({ error: "promo_not_found" });

  const { eligibleSubtotalCents, discountCents } = computePromoDiscountCents({ promo, lines });
  if (eligibleSubtotalCents <= 0 || discountCents <= 0) {
    return res.status(400).json({ error: "promo_not_applicable" });
  }

  const totalCents = Math.max(0, subtotalCents - discountCents);

  return res.json({
    ok: true,
    promo: {
      code: promo.code,
      description: promo.description,
      discount_bps: safeInt(promo.discount_bps),
      applies_to_type: promo.applies_to_type,
      applies_to_offer_id: promo.applies_to_offer_id,
      applies_to_establishment_ids: promo.applies_to_establishment_ids,
    },
    eligible_subtotal_cents: eligibleSubtotalCents,
    discount_cents: discountCents,
    currency,
    total_cents: totalCents,
  });
};

export const checkoutProVisibilityCart: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  if (!Array.isArray((req.body as any).items)) return res.status(400).json({ error: "items is required" });

  const promoCode = normalizePromoCode((req.body as any).promo_code);

  const rawItems = (req.body as any).items as Array<Record<string, unknown>>;
  if (!rawItems.length) return res.status(400).json({ error: "items is required" });

  const normalized = rawItems
    .map((it) => {
      const offerId = typeof it.offer_id === "string" ? it.offer_id.trim() : "";
      const qty = typeof it.quantity === "number" && Number.isFinite(it.quantity) ? Math.floor(it.quantity) : safeInt(it.quantity);
      return { offer_id: offerId, quantity: Math.max(1, Math.min(50, qty || 1)) };
    })
    .filter((x) => x.offer_id);

  if (!normalized.length) return res.status(400).json({ error: "No valid items" });

  const offerIds = [...new Set(normalized.map((x) => x.offer_id))];
  const supabase = getAdminSupabase();

  const { data: offers, error: offersErr } = await supabase
    .from("visibility_offers")
    .select("id,title,description,type,deliverables,duration_days,price_cents,currency,active,allow_quantity,tax_rate_bps,tax_label,display_order,deleted_at")
    .in("id", offerIds)
    .is("deleted_at", null)
    .limit(200);

  if (offersErr) return res.status(500).json({ error: offersErr.message });

  const byId = new Map<string, VisibilityOfferRow>();
  for (const o of (offers ?? []) as any[]) {
    if (typeof o?.id === "string") byId.set(o.id, o as VisibilityOfferRow);
  }

  for (const id of offerIds) {
    const off = byId.get(id);
    if (!off || off.active !== true) {
      return res.status(400).json({ error: "offer_inactive", offer_id: id });
    }
    const price = typeof off.price_cents === "number" && Number.isFinite(off.price_cents) ? Math.round(off.price_cents) : null;
    if (price == null || price <= 0) {
      return res.status(400).json({ error: "offer_missing_price", offer_id: id });
    }
  }

  const orderItems: Array<Record<string, unknown>> = [];

  const computedLines: Array<{ offer: VisibilityOfferRow; quantity: number }> = [];

  let subtotalCents = 0;
  let taxCents = 0;
  let currency = "MAD";

  for (const line of normalized) {
    const off = byId.get(line.offer_id)!;

    const allowQty = off.allow_quantity === true;
    const quantity = allowQty ? line.quantity : 1;

    const unit = Math.max(0, safeInt(off.price_cents));
    const lineSubtotal = unit * quantity;

    const rateBps = Math.max(0, safeInt(off.tax_rate_bps));
    const lineTax = Math.round((lineSubtotal * rateBps) / 10000);

    subtotalCents += lineSubtotal;
    taxCents += lineTax;

    currency = safeCurrency(off.currency);

    orderItems.push({
      offer_id: off.id,
      title: off.title,
      description: off.description,
      type: off.type,
      deliverables: Array.isArray(off.deliverables) ? off.deliverables : [],
      duration_days: off.duration_days ?? null,
      quantity,
      unit_price_cents: unit,
      total_price_cents: lineSubtotal,
      currency,
      tax_rate_bps: rateBps,
      tax_label: off.tax_label ?? "TVA",
    });

    computedLines.push({ offer: off, quantity });
  }

  let discountCents = 0;
  let promoMeta: Record<string, unknown> | null = null;

  if (promoCode) {
    const promo = await getActiveVisibilityPromoCode({ code: promoCode, establishmentId });
    if (!promo) return res.status(400).json({ error: "promo_not_found" });

    const { eligibleSubtotalCents, discountCents: computedDiscount } = computePromoDiscountCents({ promo, lines: computedLines });
    if (eligibleSubtotalCents <= 0 || computedDiscount <= 0) {
      return res.status(400).json({ error: "promo_not_applicable" });
    }

    discountCents = Math.min(subtotalCents, computedDiscount);
    promoMeta = {
      code: promo.code,
      promo_id: promo.id,
      discount_bps: safeInt(promo.discount_bps),
      discount_cents: discountCents,
      eligible_subtotal_cents: eligibleSubtotalCents,
      applies_to_type: promo.applies_to_type,
      applies_to_offer_id: promo.applies_to_offer_id,
      applies_to_establishment_ids: promo.applies_to_establishment_ids,
    };

    subtotalCents = Math.max(0, subtotalCents - discountCents);
  }

  const totalCents = subtotalCents + taxCents;

  if (totalCents <= 0) return res.status(400).json({ error: "empty_total" });

  const meta: Record<string, unknown> = {
    buyer_user_id: userResult.user.id,
    buyer_role: `pro:${permission.role}`,
    cart: {
      items: normalized,
      promo_code: promoCode || null,
    },
    promo: promoMeta,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("visibility_orders")
    .insert({
      establishment_id: establishmentId,
      created_by_user_id: userResult.user.id,
      payment_status: "pending",
      status: "pending",
      currency,
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: totalCents,
      meta,
    })
    .select("id")
    .single();

  if (insErr) return res.status(500).json({ error: insErr.message });

  const orderId = typeof (inserted as any)?.id === "string" ? String((inserted as any).id) : "";
  if (!orderId) return res.status(500).json({ error: "order_create_failed" });

  const itemRows = orderItems.map((it) => ({ ...it, order_id: orderId }));
  const { error: itemsInsertErr } = await supabase.from("visibility_order_items").insert(itemRows);
  if (itemsInsertErr) return res.status(500).json({ error: itemsInsertErr.message });

  // Notify admin that a visibility order has been created (pending payment)
  try {
    await emitAdminNotification({
      type: "visibility_order_created",
      title: "Demande visibilité créée",
      body: `Commande créée · ${Math.round(totalCents / 100)} ${currency}`,
      data: { establishmentId, orderId, paymentStatus: "pending", source: "pro_checkout" },
    });
  } catch {
    // ignore
  }

  // Email interne (best-effort)
  void (async () => {
    try {
      const to = listInternalVisibilityOrderEmails();
      if (!to.length) return;

      const baseUrl = (process.env.PUBLIC_BASE_URL || "https://sortiraumaroc.ma").trim() || "https://sortiraumaroc.ma";
      const adminUrl = `${baseUrl}/admin/visibility`;

      const { data: estRow } = await supabase
        .from("establishments")
        .select("name,city")
        .eq("id", establishmentId)
        .maybeSingle();

      const establishmentName = typeof (estRow as any)?.name === "string" ? String((estRow as any).name) : "";
      const establishmentCity = typeof (estRow as any)?.city === "string" ? String((estRow as any).city) : "";
      const estLabel = establishmentName
        ? `${establishmentName}${establishmentCity ? ` (${establishmentCity})` : ""}`
        : establishmentId;

      const amountLabel = totalCents > 0 ? `${Math.round(totalCents / 100)} ${currency}` : "";

      await sendLoggedEmail({
        emailId: `admin_visibility_order_created:${orderId}`,
        fromKey: "pro",
        to,
        subject: `Nouvelle commande Visibilité — ${establishmentName || establishmentId}`,
        bodyText: [
          "Une nouvelle commande Visibilité vient d’être créée.",
          "",
          `Établissement: ${estLabel}`,
          `Commande: ${orderId}`,
          "Paiement: pending",
          amountLabel ? `Montant: ${amountLabel}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        ctaLabel: "Ouvrir dans l’admin",
        ctaUrl: adminUrl,
        meta: {
          source: "pro.createProVisibilityOrder",
          establishment_id: establishmentId,
          order_id: orderId,
          payment_status: "pending",
        },
      });
    } catch {
      // ignore
    }
  })();

  const allowDemoRoutes = isDemoRoutesAllowed();

  return res.json({
    ok: true,
    order_id: orderId,
    payment: {
      provider: allowDemoRoutes ? "stub" : "unknown",
      status: "pending",
      confirm_endpoint: allowDemoRoutes
        ? `/api/pro/establishments/${encodeURIComponent(establishmentId)}/visibility/orders/${encodeURIComponent(orderId)}/confirm`
        : null,
    },
  });
};

export const confirmProVisibilityOrder: RequestHandler = async (req, res) => {
  if (!isDemoRoutesAllowed()) return res.status(404).json({ error: "not_found" });

  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const orderId = typeof req.params.orderId === "string" ? req.params.orderId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!orderId) return res.status(400).json({ error: "orderId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data: existing, error: selErr } = await supabase
    .from("visibility_orders")
    .select("id,establishment_id,created_by_user_id,payment_status,status,currency,total_cents,meta")
    .eq("id", orderId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (selErr) return res.status(500).json({ error: selErr.message });
  if (!existing?.id) return res.status(404).json({ error: "order_not_found" });

  const meta = isRecord((existing as any).meta) ? ({ ...((existing as any).meta as Record<string, unknown>) } as Record<string, unknown>) : {};

  // Only the creator can confirm in demo mode.
  const creatorId = asString((existing as any).created_by_user_id);
  if (creatorId && creatorId !== userResult.user.id) return res.status(403).json({ error: "Forbidden" });

  if (String((existing as any).payment_status ?? "").toLowerCase() === "paid") {
    return res.json({ ok: true, already_paid: true });
  }

  const eventId = createStubEventId();
  const transactionId = createStubTransactionId(orderId);
  const paidAtIso = new Date().toISOString();

  let nextMeta = meta;
  nextMeta = appendStringToMetaList(nextMeta, "payment_event_ids", eventId);
  nextMeta = { ...nextMeta, payment_transaction_id: transactionId, paid_at: paidAtIso };

  const { error: updErr } = await supabase
    .from("visibility_orders")
    .update({ payment_status: "paid", paid_at: paidAtIso, meta: nextMeta })
    .eq("id", orderId)
    .eq("establishment_id", establishmentId);

  if (updErr) return res.status(500).json({ error: updErr.message });

  // ─────────────────────────────────────────────────────────────────────────
  // Menu Digital Provisioning (if order contains menu_digital items)
  // ─────────────────────────────────────────────────────────────────────────
  void (async () => {
    try {
      // Fetch order items to check for menu_digital type
      const { data: orderItems, error: itemsErr } = await supabase
        .from("visibility_order_items")
        .select("id, offer_id, title, type, duration_days, unit_price_cents")
        .eq("order_id", orderId);

      if (itemsErr || !orderItems?.length) return;

      // Find menu_digital items
      const menuDigitalItems = (orderItems as any[]).filter((item) => item.type === "menu_digital");
      if (!menuDigitalItems.length) return;

      // Determine plan from item title (SILVER or PREMIUM)
      const firstItem = menuDigitalItems[0];
      const itemTitle = String(firstItem.title || "").toUpperCase();
      const plan = itemTitle.includes("PREMIUM") ? "premium" : "silver";
      const durationDays = firstItem.duration_days || 365;
      const pricePaidCents = firstItem.unit_price_cents || 0;

      // Fetch establishment details including current subscription
      const { data: estRow, error: estErr } = await supabase
        .from("establishments")
        .select("id, name, slug, username, city, cover_url, description_short, phone, address, menu_digital_expires_at")
        .eq("id", establishmentId)
        .single();

      if (estErr || !estRow) {
        console.error("[Menu Digital] Failed to fetch establishment:", estErr);
        return;
      }

      const est = estRow as {
        id: string;
        name: string | null;
        slug: string | null;
        username: string | null;
        city: string | null;
        cover_url: string | null;
        description_short: string | null;
        phone: string | null;
        address: string | null;
        menu_digital_expires_at: string | null;
      };

      // Use username or slug as the menu identifier
      const menuSlug = est.username || est.slug;
      if (!menuSlug) {
        console.error("[Menu Digital] Establishment has no username or slug");
        return;
      }

      // Get user email for account creation
      const userEmail = userResult.user.email?.trim() || "";
      if (!userEmail) {
        console.error("[Menu Digital] User has no email");
        return;
      }

      // Calculate expiration date
      // If there's an existing non-expired subscription, extend from that date
      // Otherwise, start from now
      let baseDate = new Date();
      if (est.menu_digital_expires_at) {
        const currentExpiry = new Date(est.menu_digital_expires_at);
        if (currentExpiry > baseDate) {
          // Subscription still active - extend from current expiry
          baseDate = currentExpiry;
          console.log("[Menu Digital] Extending existing subscription from", currentExpiry.toISOString());
        }
      }
      const expiresAt = new Date(baseDate);
      expiresAt.setDate(expiresAt.getDate() + durationDays);

      // Provision account on menu_sam
      const MENU_SAM_API_URL = process.env.MENU_SAM_API_URL || "http://localhost:8081";
      const MENU_SAM_SYNC_SECRET = process.env.MENU_SAM_SYNC_SECRET || "";

      const provisionPayload = {
        samEstablishmentId: est.id,
        supabaseUserId: userResult.user.id,
        email: userEmail,
        plan,
        slug: menuSlug,
        establishmentName: est.name || "Sans nom",
        city: est.city,
        coverUrl: est.cover_url,
        description: est.description_short,
        phone: est.phone,
        address: est.address,
        pricePaidCents,
        durationDays,
        expiresAt: expiresAt.toISOString(),
        samOrderId: orderId,
      };

      const provisionResponse = await fetch(`${MENU_SAM_API_URL}/api/sync/provision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sync-Secret": MENU_SAM_SYNC_SECRET,
        },
        body: JSON.stringify(provisionPayload),
      });

      if (!provisionResponse.ok) {
        const errorText = await provisionResponse.text();
        console.error("[Menu Digital] Provisioning failed:", errorText);
        return;
      }

      const provisionResult = await provisionResponse.json();
      console.log("[Menu Digital] Account provisioned:", provisionResult);

      // Update establishment to mark menu digital as enabled with plan and expiration
      await supabase
        .from("establishments")
        .update({
          menu_digital_enabled: true,
          menu_digital_plan: plan,
          menu_digital_expires_at: expiresAt.toISOString(),
          menu_digital_last_sync: paidAtIso,
        })
        .eq("id", establishmentId);

      // Send access email to pro user
      const menuUrl = `${process.env.MENU_DIGITAL_BASE_URL || "https://menu.sam.ma"}/${menuSlug}`;
      const proAccessUrl = `${process.env.MENU_DIGITAL_BASE_URL || "https://menu.sam.ma"}/pro`;

      try {
        await sendTemplateEmail({
          templateKey: "pro_menu_digital_activated",
          lang: "fr",
          fromKey: "pro",
          to: [userEmail],
          variables: {
            establishment: est.name || menuSlug,
            plan: plan === "premium" ? "Premium" : "Silver",
            menu_url: menuUrl,
            pro_access_url: proAccessUrl,
            expires_at: expiresAt.toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
          },
          ctaUrl: proAccessUrl,
          meta: {
            source: "pro.confirmProVisibilityOrder.menuDigital",
            establishment_id: establishmentId,
            order_id: orderId,
            plan,
          },
        });
      } catch (emailErr) {
        console.error("[Menu Digital] Failed to send activation email:", emailErr);
      }

    } catch (err) {
      console.error("[Menu Digital] Provisioning error:", err);
    }
  })();
  // ─────────────────────────────────────────────────────────────────────────

  const actor = { userId: userResult.user.id, role: `pro:${permission.role}` };

  try {
    await ensureInvoiceForVisibilityOrder({
      orderId,
      actor,
      idempotencyKey: `invoice:visibility_order:${orderId}:${eventId}`,
      issuedAtIso: paidAtIso,
    });
  } catch {
    // ignore
  }

  try {
    await notifyProMembers({
      supabase,
      establishmentId,
      category: "visibility",
      title: "Commande visibilité payée",
      body: `Paiement confirmé · ${Math.round(safeInt((existing as any).total_cents) / 100)} ${safeCurrency((existing as any).currency)}`,
      data: {
        orderId,
        establishmentId,
        action: "visibility_order_paid",
        event_type: NotificationEventType.payment_received,
        source: "visibility_confirm",
      },
    });

    await emitAdminNotification({
      type: "visibility_order_paid",
      title: "Commande visibilité payée",
      body: `Commande payée · ${Math.round(safeInt((existing as any).total_cents) / 100)} ${safeCurrency((existing as any).currency)}`,
      data: { establishmentId, orderId, paymentStatus: "paid", source: "visibility_confirm" },
    });
  } catch {
    // ignore
  }

  // Email interne (best-effort)
  void (async () => {
    try {
      const to = listInternalVisibilityOrderEmails();
      if (!to.length) return;

      const baseUrl = (process.env.PUBLIC_BASE_URL || "https://sortiraumaroc.ma").trim() || "https://sortiraumaroc.ma";
      const adminUrl = `${baseUrl}/admin/visibility`;

      const { data: estRow } = await supabase
        .from("establishments")
        .select("name,city")
        .eq("id", establishmentId)
        .maybeSingle();

      const establishmentName = typeof (estRow as any)?.name === "string" ? String((estRow as any).name) : "";
      const establishmentCity = typeof (estRow as any)?.city === "string" ? String((estRow as any).city) : "";
      const estLabel = establishmentName
        ? `${establishmentName}${establishmentCity ? ` (${establishmentCity})` : ""}`
        : establishmentId;

      const totalCents = safeInt((existing as any).total_cents);
      const currency = safeCurrency((existing as any).currency);
      const amountLabel = totalCents > 0 ? `${Math.round(totalCents / 100)} ${currency}` : "";

      await sendLoggedEmail({
        emailId: `admin_visibility_order_paid:${orderId}`,
        fromKey: "finance",
        to,
        subject: `Commande Visibilité payée — ${establishmentName || establishmentId}`,
        bodyText: [
          "Une commande Visibilité vient d’être payée.",
          "",
          `Établissement: ${estLabel}`,
          `Commande: ${orderId}`,
          amountLabel ? `Montant: ${amountLabel}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        ctaLabel: "Ouvrir dans l’admin",
        ctaUrl: adminUrl,
        meta: {
          source: "pro.confirmProVisibilityOrder",
          establishment_id: establishmentId,
          order_id: orderId,
          payment_status: "paid",
        },
      });
    } catch {
      // ignore
    }
  })();

  // Emails transactionnels (best-effort)
  void (async () => {
    try {
      const baseUrl = (process.env.PUBLIC_BASE_URL || "https://sortiraumaroc.ma").trim() || "https://sortiraumaroc.ma";
      const email = typeof userResult.user.email === "string" ? userResult.user.email.trim() : "";
      if (!email) return;

      const { data: estRow } = await supabase.from("establishments").select("name").eq("id", establishmentId).maybeSingle();
      const establishmentName = typeof (estRow as any)?.name === "string" ? String((estRow as any).name) : "";

      const totalCents = safeInt((existing as any).total_cents);
      const currency = safeCurrency((existing as any).currency);
      const amountLabel = totalCents > 0 ? `${Math.round(totalCents / 100)} ${currency}` : "";

      const visibilityCtaUrl = `${baseUrl}/pro?tab=visibility&eid=${encodeURIComponent(establishmentId)}`;
      const billingCtaUrl = `${baseUrl}/pro?tab=billing&eid=${encodeURIComponent(establishmentId)}`;

      await sendTemplateEmail({
        templateKey: "pro_visibility_activated",
        lang: "fr",
        fromKey: "pro",
        to: [email],
        variables: {
          establishment: establishmentName,
          amount: amountLabel,
          cta_url: visibilityCtaUrl,
        },
        ctaUrl: visibilityCtaUrl,
        meta: {
          source: "pro.confirmProVisibilityOrder",
          establishment_id: establishmentId,
          order_id: orderId,
          payment_status: "paid",
        },
      });

      await sendTemplateEmail({
        templateKey: "finance_invoice_to_pro",
        lang: "fr",
        fromKey: "finance",
        to: [email],
        variables: {
          establishment: establishmentName,
          amount: amountLabel,
          cta_url: billingCtaUrl,
        },
        ctaUrl: billingCtaUrl,
        meta: {
          source: "pro.confirmProVisibilityOrder",
          establishment_id: establishmentId,
          order_id: orderId,
          payment_status: "paid",
        },
      });
    } catch {
      // ignore
    }
  })();

  return res.json({ ok: true });
};

export const listProVisibilityOrders: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : null;
  const limit = limitRaw != null && Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;

  const { data: orders, error } = await supabase
    .from("visibility_orders")
    .select("id,establishment_id,created_by_user_id,payment_status,status,currency,subtotal_cents,tax_cents,total_cents,paid_at,meta,created_at,updated_at")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });

  const orderIds = (orders ?? [])
    .map((o: any) => (typeof o?.id === "string" ? o.id : ""))
    .filter((x: string) => !!x);

  const itemsByOrderId = new Map<string, Array<Record<string, unknown>>>();
  if (orderIds.length) {
    try {
      const { data: items, error: itemsErr } = await supabase
        .from("visibility_order_items")
        .select("order_id,offer_id,title,description,type,deliverables,duration_days,quantity,unit_price_cents,total_price_cents,currency,tax_rate_bps,tax_label")
        .in("order_id", orderIds)
        .order("created_at", { ascending: true })
        .limit(1000);

      if (itemsErr) throw itemsErr;

      for (const it of (items ?? []) as Array<Record<string, unknown>>) {
        const oid = typeof it.order_id === "string" ? it.order_id : "";
        if (!oid) continue;
        const list = itemsByOrderId.get(oid) ?? [];
        list.push(it);
        itemsByOrderId.set(oid, list);
      }
    } catch {
      // ignore
    }
  }

  const financeByOrderId = new Map<string, { invoice_number: string; issued_at: string }>();
  if (orderIds.length) {
    try {
      const { data: fin, error: finErr } = await supabase
        .from("finance_invoices")
        .select("reference_id,invoice_number,issued_at")
        .eq("reference_type", "visibility_order")
        .in("reference_id", orderIds)
        .limit(500);

      if (finErr) throw finErr;

      for (const row of (fin ?? []) as Array<Record<string, unknown>>) {
        const refId = typeof row.reference_id === "string" ? row.reference_id : "";
        const invoiceNumber = typeof row.invoice_number === "string" ? row.invoice_number : "";
        const issuedAt = typeof row.issued_at === "string" ? row.issued_at : "";
        if (refId && invoiceNumber && issuedAt) financeByOrderId.set(refId, { invoice_number: invoiceNumber, issued_at: issuedAt });
      }
    } catch {
      // ignore
    }
  }

  const enriched = (orders ?? []).map((o: any) => {
    const id = typeof o?.id === "string" ? o.id : "";
    const fin = id ? financeByOrderId.get(id) : undefined;
    return {
      ...o,
      items: id ? itemsByOrderId.get(id) ?? [] : [],
      invoice_number: fin?.invoice_number ?? null,
      invoice_issued_at: fin?.issued_at ?? null,
    };
  });

  return res.json({ ok: true, orders: enriched });
};

export const getProVisibilityOrderInvoice: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const orderId = typeof req.params.orderId === "string" ? req.params.orderId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!orderId) return res.status(400).json({ error: "orderId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data: order, error: orderErr } = await supabase
    .from("visibility_orders")
    .select("id")
    .eq("id", orderId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (orderErr) return res.status(500).json({ error: orderErr.message });
  if (!order) return res.status(404).json({ error: "order_not_found" });

  const actor = { userId: userResult.user.id, role: `pro:${permission.role}` };

  try {
    const fin = await ensureInvoiceForVisibilityOrder({
      orderId,
      actor,
      idempotencyKey: `invoice:visibility_order:${orderId}`,
    });

    if (!fin) return res.status(400).json({ error: "invoice_unavailable" });

    return res.json({
      ok: true,
      invoice: {
        id: fin.id,
        invoice_number: fin.invoice_number,
        issued_at: fin.issued_at,
        amount_cents: fin.amount_cents,
        currency: fin.currency,
        reference_type: fin.reference_type,
        reference_id: fin.reference_id,
      },
    });
  } catch (e) {
    console.error("getProVisibilityOrderInvoice failed", e);
    return res.status(500).json({ error: "invoice_error" });
  }
};

export const downloadProVisibilityOrderInvoicePdf: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const orderId = typeof req.params.orderId === "string" ? req.params.orderId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!orderId) return res.status(400).json({ error: "orderId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data: order, error: orderErr } = await supabase
    .from("visibility_orders")
    .select("id,payment_status")
    .eq("id", orderId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (orderErr) return res.status(500).json({ error: orderErr.message });
  if (!order) return res.status(404).json({ error: "order_not_found" });

  const paymentStatus = typeof (order as any).payment_status === "string"
    ? ((order as any).payment_status as string).toLowerCase()
    : "";

  if (paymentStatus !== "paid") {
    return res.status(400).json({ error: "order_not_paid" });
  }

  try {
    // Import dynamically to avoid circular dependencies
    const { generateVisibilityOrderInvoicePdf } = await import("../subscriptions/usernameInvoicing");

    const result = await generateVisibilityOrderInvoicePdf(orderId);

    if (!result) {
      return res.status(404).json({ error: "invoice_not_found" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Content-Length", result.pdf.length);
    return res.send(result.pdf);
  } catch (e) {
    console.error("downloadProVisibilityOrderInvoicePdf failed", e);
    return res.status(500).json({ error: "pdf_generation_error" });
  }
};

export const ensureProDemoAccount: RequestHandler = async (_req, res) => {
  if (!isDemoRoutesAllowed()) return res.status(404).json({ error: "not_found" });

  const creds = getDemoProCredentials();
  if (!creds) return res.status(500).json({ error: "demo_not_configured" });

  const supabase = getAdminSupabase();

  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) return res.status(500).json({ error: listErr.message });

  const existing = (list.users ?? []).find((u) => (u.email ?? "").toLowerCase() === creds.email);

  let userId = existing?.id ?? null;

  if (!userId) {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: creds.email,
      password: creds.password,
      email_confirm: true,
    });

    if (createErr || !created.user) {
      return res.status(500).json({ error: createErr?.message ?? "Impossible de créer le compte démo" });
    }

    userId = created.user.id;
  }

  const desired = [
    {
      demo_index: 1,
      name: "Démo — Riad Atlas",
      city: "Marrakech",
      universe: "restaurant" as const,
      subcategory: "Restaurant",
    },
    {
      demo_index: 2,
      name: "Démo — Oasis Spa",
      city: "Casablanca",
      universe: "loisir" as const,
      subcategory: "Spa / Loisirs",
    },
    {
      demo_index: 3,
      name: "Démo — Atlas Lodge",
      city: "Agadir",
      universe: "hebergement" as const,
      subcategory: "Hôtel / Lodge",
    },
  ];

  const { data: current, error: currentErr } = await supabase
    .from("establishments")
    .select("id,name,city,universe,subcategory,extra")
    .eq("created_by", userId)
    .contains("extra", { demo: true })
    .order("created_at", { ascending: true });

  if (currentErr) return res.status(500).json({ error: currentErr.message });

  const byIndex = new Map<number, { id: string; universe: string }>();

  for (const row of (current ?? []) as Array<{ id: string; universe: string; subcategory: string | null; extra: unknown }>) {
    const extra = (row.extra ?? {}) as Record<string, unknown>;
    const idx = typeof extra.demo_index === "number" ? extra.demo_index : null;
    if (idx) byIndex.set(idx, { id: row.id, universe: row.universe });

    if (!row.subcategory) {
      void supabase.from("establishments").update({ subcategory: row.universe }).eq("id", row.id);
    }
  }

  for (const d of desired) {
    if (byIndex.has(d.demo_index)) continue;

    const { data: created, error: createErr } = await supabase
      .from("establishments")
      .insert({
        name: d.name,
        city: d.city,
        universe: d.universe,
        subcategory: d.subcategory,
        created_by: userId,
        status: "active",
        verified: true,
        extra: {
          demo: true,
          demo_index: d.demo_index,
        },
      })
      .select("id,universe")
      .single();

    if (createErr || !created) {
      return res.status(500).json({ error: createErr?.message ?? "Impossible de créer l’établissement démo" });
    }

    byIndex.set(d.demo_index, { id: (created as { id: string }).id, universe: (created as { universe: string }).universe });
  }

  const establishments = desired.map((d) => {
    const found = byIndex.get(d.demo_index);
    if (!found) throw new Error("demo establishment missing");
    return { id: found.id, universe: found.universe, idx: d.demo_index };
  });

  for (const e of establishments) {
    const { data: mem, error: memErr } = await supabase
      .from("pro_establishment_memberships")
      .select("id")
      .eq("establishment_id", e.id)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (memErr) return res.status(500).json({ error: memErr.message });

    if (!(mem as { id: string } | null)?.id) {
      const { error: createMemErr } = await supabase.from("pro_establishment_memberships").insert({
        establishment_id: e.id,
        user_id: userId,
        role: "owner",
      });

      if (createMemErr) return res.status(500).json({ error: createMemErr.message });
    }

    const { count: visitsCount } = await supabase
      .from("establishment_visits")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", e.id)
      .eq("session_id", "demo-seed");

    if (!visitsCount) {
      const now = Date.now();
      const visits = Array.from({ length: 60 }, (_, i) => {
        const daysAgo = i % 20;
        return {
          establishment_id: e.id,
          session_id: "demo-seed",
          path: "/results",
          visited_at: new Date(now - daysAgo * 24 * 60 * 60 * 1000 - i * 60 * 60 * 1000).toISOString(),
        };
      });
      const { error } = await supabase.from("establishment_visits").insert(visits);
      if (error) return res.status(500).json({ error: error.message });
    }

    const { count: resCount } = await supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", e.id)
      .eq("meta->>demo", "true");

    if (!resCount) {
      const base = new Date();
      const mk = (days: number, hours: number) => {
        const d = new Date(base);
        d.setDate(d.getDate() + days);
        d.setHours(hours, 0, 0, 0);
        return d.toISOString();
      };

      const rows = [
        { status: "confirmed", pay: "paid", days: -2, h: 20, party: 2, total: 45000, dep: 15000 },
        { status: "confirmed", pay: "paid", days: -5, h: 21, party: 4, total: 98000, dep: 25000 },
        { status: "noshow", pay: "paid", days: -8, h: 19, party: 2, total: 32000, dep: 12000 },
        { status: "cancelled", pay: "refunded", days: -10, h: 20, party: 3, total: 60000, dep: 18000 },

        // Demande NON garantie (pas de prépaiement)
        { status: "requested", pay: "pending", days: 1, h: 20, party: 2, total: 38000, dep: null },

        // Demande GARANTIE (prépayée / acompte)
        { status: "requested", pay: "paid", days: 3, h: 19, party: 5, total: 120000, dep: 30000 },
      ];

      const reservations = rows.map((r) => {
        const commissionPercent = 10;
        const deposit = typeof r.dep === "number" ? r.dep : null;
        const commissionAmount = deposit ? Math.round((deposit * commissionPercent) / 100) : null;

        return {
          booking_reference: `DEMO-${e.idx}-${randomUUID().slice(0, 8)}`,
          kind: e.universe,
          establishment_id: e.id,
          status: r.status,
          starts_at: mk(r.days, r.h),
          party_size: r.party,
          amount_total: r.total,
          amount_deposit: deposit,
          currency: "MAD",
          payment_status: r.pay,
          commission_percent: commissionPercent,
          commission_amount: commissionAmount,
          meta: {
            demo: true,
          },
        };
      });

      const { error } = await supabase.from("reservations").insert(reservations);
      if (error) return res.status(500).json({ error: error.message });
    }

    const { count: packsCount } = await supabase
      .from("packs")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", e.id)
      .eq("label", "DEMO");

    if (!packsCount) {
      const packs = [
        {
          establishment_id: e.id,
          title: "Pack découverte",
          description: "Offre spéciale démo",
          label: "DEMO",
          items: [],
          price: 19900,
          original_price: 24900,
          is_limited: true,
          stock: 50,
          availability: "permanent",
          active: true,
        },
        {
          establishment_id: e.id,
          title: "Pack premium",
          description: "Meilleure offre démo",
          label: "DEMO",
          items: [],
          price: 34900,
          original_price: 44900,
          is_limited: true,
          stock: 25,
          availability: "permanent",
          active: true,
        },
      ];

      const { error } = await supabase.from("packs").insert(packs);
      if (error) return res.status(500).json({ error: error.message });
    }

    const { count: slotsCount } = await supabase
      .from("pro_slots")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", e.id);

    if (!slotsCount) {
      const now = new Date();
      const slots = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() + i + 1);
        d.setHours(18 + (i % 3), 0, 0, 0);

        return {
          establishment_id: e.id,
          starts_at: d.toISOString(),
          ends_at: null,
          capacity: 20 + i * 5,
          base_price: 0,
          promo_type: i % 2 === 0 ? "percent" : null,
          promo_value: i % 2 === 0 ? 15 : null,
          promo_label: i % 2 === 0 ? "DEMO" : null,
          active: true,
        };
      });

      const { error } = await supabase.from("pro_slots").insert(slots);
      if (error) return res.status(500).json({ error: error.message });
    }

    const { count: invCount } = await supabase
      .from("pro_invoices")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", e.id);

    if (!invCount) {
      const today = new Date();
      const periodStart = new Date(today);
      periodStart.setDate(1);
      const periodEnd = new Date(today);
      periodEnd.setDate(28);

      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 10);

      const invoices = [
        {
          establishment_id: e.id,
          period_start: periodStart.toISOString().slice(0, 10),
          period_end: periodEnd.toISOString().slice(0, 10),
          currency: "MAD",
          commission_total: 8500,
          visibility_total: 12000,
          amount_due: 20500,
          status: "due",
          due_date: dueDate.toISOString().slice(0, 10),
          line_items: [{ demo: true, label: "Commissions", amount: 8500 }, { demo: true, label: "Visibilité", amount: 12000 }],
        },
        {
          establishment_id: e.id,
          period_start: new Date(periodStart.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          period_end: new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          currency: "MAD",
          commission_total: 7600,
          visibility_total: 0,
          amount_due: 7600,
          status: "paid",
          due_date: new Date(dueDate.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          paid_at: new Date(dueDate.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
          line_items: [{ demo: true, label: "Commissions", amount: 7600 }],
        },
      ];

      const { error } = await supabase.from("pro_invoices").insert(invoices);
      if (error) return res.status(500).json({ error: error.message });
    }

    const { count: notifCount } = await supabase
      .from("pro_notifications")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", e.id)
      .eq("category", "demo");

    if (!notifCount) {
      const { error } = await supabase.from("pro_notifications").insert([
        {
          user_id: userId,
          establishment_id: e.id,
          category: "demo",
          title: "Bienvenue dans le compte démo",
          body: "Explorez les réservations, packs, factures et statistiques.",
          data: { demo: true },
        },
        {
          user_id: userId,
          establishment_id: e.id,
          category: "demo",
          title: "Astuce",
          body: "Dans Réservations, testez les actions Check-in / Annuler / No-show.",
          data: { demo: true },
        },
      ]);
      if (error) return res.status(500).json({ error: error.message });
    }
  }

  return res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// PRO Finance Dashboard & Payout Workflow
// ---------------------------------------------------------------------------

type ProFinanceDashboard = {
  establishment_id: string;
  currency: string;
  total_payable_cents: number;
  eligible_at: string | null;
  window_start: string | null;
  window_end: string | null;
  payout_requests_count: number;
  next_eligible_payout: {
    date: string;
    amount_cents: number;
  } | null;
};

export const getProFinanceDashboard: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  // Get pending payout batches (eligible for payout request)
  const { data: payouts, error: payoutsErr } = await supabase
    .from("finance_payouts")
    .select("id,amount_cents,currency,status,window_start,window_end,eligible_at")
    .eq("establishment_id", establishmentId)
    .in("status", ["pending", "processing"])
    .order("eligible_at", { ascending: true })
    .limit(100);

  if (payoutsErr) return res.status(500).json({ error: payoutsErr.message });

  const currency = (payouts?.[0] as any)?.currency ?? "MAD";

  const totalPayableCents = (payouts ?? []).reduce((sum: number, p: any) => {
    const amt = typeof p?.amount_cents === "number" ? Math.round(p.amount_cents) : 0;
    return sum + amt;
  }, 0);

  const nextEligible = (payouts ?? []).find((p: any) => {
    const eligibleAt = p?.eligible_at ? new Date(p.eligible_at) : null;
    return eligibleAt && eligibleAt <= new Date();
  });

  // Count existing payout requests
  const { count: requestsCount, error: requestsErr } = await supabase
    .from("finance_payout_requests")
    .select("id", { count: "exact", head: true })
    .eq("establishment_id", establishmentId);

  if (requestsErr) return res.status(500).json({ error: requestsErr.message });

  const dashboard: ProFinanceDashboard = {
    establishment_id: establishmentId,
    currency,
    total_payable_cents: totalPayableCents,
    eligible_at: (nextEligible as any)?.eligible_at ?? null,
    window_start: (nextEligible as any)?.window_start ?? null,
    window_end: (nextEligible as any)?.window_end ?? null,
    payout_requests_count: requestsCount ?? 0,
    next_eligible_payout: nextEligible
      ? {
          date: (nextEligible as any).eligible_at ?? "",
          amount_cents: typeof (nextEligible as any).amount_cents === "number" ? Math.round((nextEligible as any).amount_cents) : 0,
        }
      : null,
  };

  res.json({ ok: true, dashboard });
};

export const acceptProTerms: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const termsVersion = asString(req.body.terms_version);
  if (!termsVersion) return res.status(400).json({ error: "terms_version is required" });

  const supabase = getAdminSupabase();

  // Record acceptance
  const { error: insertErr } = await supabase.from("finance_pro_terms_acceptances").insert({
    establishment_id: establishmentId,
    user_id: userResult.user.id,
    terms_version: termsVersion,
    accepted_at: new Date().toISOString(),
  });

  if (insertErr) return res.status(500).json({ error: insertErr.message });

  res.json({ ok: true });
};

export const getProBankDetails: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("finance_pro_bank_details")
    .select(
      "id,establishment_id,bank_code,bank_name,bank_address,holder_name,holder_address,rib_24,is_validated,validated_at,validated_by,created_at,updated_at",
    )
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, item: data ?? null });
};

type PayoutWindow = {
  window_start: string;
  window_end: string;
  eligible_at: string;
  payout_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  has_request: boolean;
};

export const listProPayoutWindows: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  // Fetch all payouts with payout requests
  const { data: payouts, error: payoutsErr } = await supabase
    .from("finance_payouts")
    .select("id,amount_cents,currency,status,window_start,window_end,eligible_at")
    .eq("establishment_id", establishmentId)
    .order("eligible_at", { ascending: false })
    .limit(100);

  if (payoutsErr) return res.status(500).json({ error: payoutsErr.message });

  const payoutIds = (payouts ?? []).map((p: any) => p?.id).filter(Boolean);

  let requestsByPayoutId = new Map<string, boolean>();
  if (payoutIds.length) {
    const { data: requests, error: requestsErr } = await supabase
      .from("finance_payout_requests")
      .select("payout_id")
      .in("payout_id", payoutIds)
      .limit(1000);

    if (!requestsErr) {
      requestsByPayoutId = new Map((requests ?? []).map((r: any) => [r?.payout_id, true]));
    }
  }

  const windows: PayoutWindow[] = (payouts ?? []).map((p: any) => ({
    window_start: p?.window_start ?? "",
    window_end: p?.window_end ?? "",
    eligible_at: p?.eligible_at ?? "",
    payout_id: p?.id ?? "",
    amount_cents: typeof p?.amount_cents === "number" ? Math.round(p.amount_cents) : 0,
    currency: p?.currency ?? "MAD",
    status: p?.status ?? "pending",
    has_request: requestsByPayoutId.has(p?.id),
  }));

  res.json({ ok: true, windows });
};

type CreatePayoutRequestResult = {
  id: string;
  payout_id: string;
  establishment_id: string;
  status: string;
  pro_comment: string | null;
  created_at: string;
};

export const createProPayoutRequest: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const payoutId = asString(req.body.payout_id);
  const proComment = asString(req.body.pro_comment);

  if (!payoutId) return res.status(400).json({ error: "payout_id is required" });

  const supabase = getAdminSupabase();

  // Verify payout exists and belongs to this establishment + is eligible
  const { data: payout, error: payoutErr } = await supabase
    .from("finance_payouts")
    .select("id,establishment_id,status,amount_cents,currency,window_start,window_end,eligible_at")
    .eq("id", payoutId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (payoutErr) return res.status(500).json({ error: payoutErr.message });
  if (!payout) return res.status(404).json({ error: "payout_not_found" });

  const eligibleAt = (payout as any)?.eligible_at ? new Date((payout as any).eligible_at) : null;
  if (!eligibleAt || eligibleAt > new Date()) {
    return res.status(400).json({ error: "payout_not_yet_eligible" });
  }

  // Check for existing request
  const { data: existing, error: existingErr } = await supabase
    .from("finance_payout_requests")
    .select("id")
    .eq("payout_id", payoutId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (existing) return res.status(409).json({ error: "payout_request_already_exists" });

  // Create request
  const { data: created, error: createErr } = await supabase
    .from("finance_payout_requests")
    .insert({
      payout_id: payoutId,
      establishment_id: establishmentId,
      status: "submitted",
      created_by_user_id: userResult.user.id,
      pro_comment: proComment ?? null,
    })
    .select("id,payout_id,establishment_id,status,pro_comment,created_at")
    .single();

  if (createErr) return res.status(500).json({ error: createErr.message });

  // Notify admin
  void emitAdminNotification({
    type: "payout_request_submitted",
    title: "Nouvelle demande de payout",
    body: `PRO ${establishmentId.slice(0, 8)} a soumis une demande de payout (${typeof (payout as any)?.amount_cents === "number" ? (payout as any).amount_cents / 100 : 0} MAD)`,
    data: { payoutRequestId: (created as any)?.id ?? "", payoutId, establishmentId },
  });

  // Email interne (best-effort) — aligné avec la création Superadmin.
  void (async () => {
    try {
      const baseUrl = (process.env.PUBLIC_BASE_URL || "https://sortiraumaroc.ma").trim() || "https://sortiraumaroc.ma";
      const emailDomain = (process.env.EMAIL_DOMAIN || "sortiraumaroc.ma").trim() || "sortiraumaroc.ma";

      const toRaw = (process.env.FINANCE_PAYOUT_REQUEST_EMAIL || `finance@${emailDomain}`).trim();
      const to = Array.from(
        new Set(
          toRaw
            .split(/[,;\s]+/g)
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      );

      if (!to.length) return;

      const { data: estRow } = await supabase
        .from("establishments")
        .select("name")
        .eq("id", establishmentId)
        .maybeSingle();

      const establishmentName =
        typeof (estRow as any)?.name === "string" && String((estRow as any).name).trim()
          ? String((estRow as any).name).trim()
          : establishmentId.slice(0, 8);

      const amountCents = typeof (payout as any)?.amount_cents === "number" ? Math.round((payout as any).amount_cents) : 0;
      const currency = safeCurrency((payout as any)?.currency);
      const amountLabel = amountCents > 0 ? `${Math.round(amountCents / 100)} ${currency}` : "";

      const windowStart = typeof (payout as any)?.window_start === "string" ? String((payout as any).window_start) : "";
      const windowEnd = typeof (payout as any)?.window_end === "string" ? String((payout as any).window_end) : "";
      const eligibleAtIso = typeof (payout as any)?.eligible_at === "string" ? String((payout as any).eligible_at) : "";

      const proEmail = typeof userResult.user.email === "string" ? userResult.user.email.trim() : "";
      const adminUrl = `${baseUrl}/admin/finance/payout-requests`;

      let ribLabel = "Non renseigné";
      let ribValidatedLabel = "En attente";
      try {
        const { data: bankRow } = await supabase
          .from("finance_pro_bank_details")
          .select("rib_24,is_validated")
          .eq("establishment_id", establishmentId)
          .maybeSingle();

        const rib24 = typeof (bankRow as any)?.rib_24 === "string" ? String((bankRow as any).rib_24).trim() : "";
        if (rib24) ribLabel = rib24;
        ribValidatedLabel = (bankRow as any)?.is_validated ? "Validé" : "En attente";
      } catch {
        // ignore
      }

      await sendTemplateEmail({
        templateKey: "pro_payout_request_created",
        lang: "fr",
        fromKey: "finance",
        to,
        variables: {
          establishment: establishmentName,
          establishment_id: establishmentId,
          payout_request_id: String((created as any)?.id ?? ""),
          payout_id: payoutId,
          amount: amountLabel,
          window_start: windowStart,
          window_end: windowEnd,
          eligible_at: eligibleAtIso,
          pro_user_id: userResult.user.id,
          pro_email: proEmail,
          pro_comment: proComment ?? "",

          rib: ribLabel,
          rib_status: ribValidatedLabel,

          cta_url: adminUrl,
        },
        ctaUrl: adminUrl,
        emailId: `payout_request_created:${String((created as any)?.id ?? payoutId)}`,
        meta: {
          source: "pro.createProPayoutRequest",
          establishment_id: establishmentId,
          payout_request_id: String((created as any)?.id ?? ""),
          payout_id: payoutId,
        },
      });
    } catch {
      // ignore
    }
  })();

  res.json({ ok: true, item: created as CreatePayoutRequestResult });
};

export const listProPayoutRequests: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  // Fetch payout requests with payout details
  const { data: requests, error: requestsErr } = await supabase
    .from("finance_payout_requests")
    .select("id,payout_id,status,pro_comment,created_at")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (requestsErr) return res.status(500).json({ error: requestsErr.message });

  // Fetch related payouts
  const payoutIds = (requests ?? []).map((r: any) => r?.payout_id).filter(Boolean);
  let payoutsByPayoutId = new Map<string, any>();
  if (payoutIds.length) {
    const { data: payouts, error: payoutsErr } = await supabase
      .from("finance_payouts")
      .select("id,window_start,window_end,eligible_at,amount_cents,currency,status")
      .in("id", payoutIds)
      .limit(1000);

    if (!payoutsErr) {
      payoutsByPayoutId = new Map((payouts ?? []).map((p: any) => [p?.id, p]));
    }
  }

  const result = (requests ?? [])
    .map((r: any) => {
      const payout = payoutsByPayoutId.get(r?.payout_id);
      return {
        id: r?.id,
        payout_id: r?.payout_id,
        status: r?.status,
        pro_comment: r?.pro_comment,
        created_at: r?.created_at,
        payout: payout
          ? {
              window_start: payout.window_start,
              window_end: payout.window_end,
              eligible_at: payout.eligible_at,
              amount_cents: typeof payout.amount_cents === "number" ? Math.round(payout.amount_cents) : 0,
              currency: payout.currency,
              status: payout.status,
            }
          : null,
      };
    });

  res.json({ ok: true, requests: result });
};

// =============================================================================
// INVENTORY IMAGE UPLOAD
// =============================================================================

const PRO_INVENTORY_IMAGES_BUCKET = "pro-inventory-images";
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const uploadProInventoryImage: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  // Validate content type
  const contentType = req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return res.status(400).json({ error: "Content-Type must be multipart/form-data" });
  }

  // Get the file from the request
  const file = (req as any).file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // Validate file size
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return res.status(400).json({
      error: "file_too_large",
      message: `Le fichier dépasse la taille maximale de 5 MB`,
      maxSize: MAX_IMAGE_SIZE_BYTES,
      actualSize: file.size
    });
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return res.status(400).json({
      error: "invalid_mime_type",
      message: `Format non accepté. Formats autorisés: JPG, PNG, WebP, GIF`,
      allowedTypes: ALLOWED_MIME_TYPES,
      actualType: file.mimetype
    });
  }

  // Generate unique filename
  const extension = file.originalname.split(".").pop()?.toLowerCase() || "jpg";
  const uniqueId = randomUUID();
  const filename = `${establishmentId}/${uniqueId}.${extension}`;

  const supabase = getAdminSupabase();

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(PRO_INVENTORY_IMAGES_BUCKET)
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    console.error("[uploadProInventoryImage] upload error:", uploadError);
    return res.status(500).json({ error: "upload_failed", message: uploadError.message });
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(PRO_INVENTORY_IMAGES_BUCKET)
    .getPublicUrl(filename);

  res.json({
    ok: true,
    url: publicUrl,
    filename: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
  });
};

export const deleteProInventoryImage: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const imageUrl = typeof req.body.url === "string" ? req.body.url.trim() : "";
  if (!imageUrl) return res.status(400).json({ error: "url is required" });

  // Extract path from URL
  const match = imageUrl.match(/\/pro-inventory-images\/(.+)$/);
  if (!match || !match[1]) {
    return res.status(400).json({ error: "invalid_url", message: "URL does not belong to inventory images bucket" });
  }

  const filePath = match[1];

  // Verify the file belongs to this establishment
  if (!filePath.startsWith(`${establishmentId}/`)) {
    return res.status(403).json({ error: "forbidden", message: "Cannot delete images from other establishments" });
  }

  const supabase = getAdminSupabase();

  const { error: deleteError } = await supabase.storage
    .from(PRO_INVENTORY_IMAGES_BUCKET)
    .remove([filePath]);

  if (deleteError) {
    console.error("[deleteProInventoryImage] delete error:", deleteError);
    return res.status(500).json({ error: "delete_failed", message: deleteError.message });
  }

  res.json({ ok: true });
};

// =============================================================================
// CUSTOM INVENTORY LABELS
// =============================================================================

export const listProCustomLabels: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_inventory_custom_labels")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, labels: data ?? [] });
};

export const createProCustomLabel: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const labelId = asString(req.body.label_id);
  const emoji = asString(req.body.emoji) ?? "🏷️";
  const title = asString(req.body.title);
  const titleAr = asString(req.body.title_ar);
  const color = asString(req.body.color) ?? "slate";
  const sortOrder = asNumber(req.body.sort_order) ?? 0;

  if (!labelId || !title) {
    return res.status(400).json({ error: "label_id and title are required" });
  }

  // Validate label_id format (lowercase, underscores, no spaces)
  if (!/^[a-z0-9_]+$/.test(labelId)) {
    return res.status(400).json({ error: "label_id must be lowercase alphanumeric with underscores only" });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_inventory_custom_labels")
    .insert({
      establishment_id: establishmentId,
      label_id: labelId,
      emoji,
      title,
      title_ar: titleAr ?? null,
      color,
      sort_order: sortOrder,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Label ID already exists" });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, label: data });
};

export const updateProCustomLabel: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const labelId = typeof req.params.labelId === "string" ? req.params.labelId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!labelId) return res.status(400).json({ error: "labelId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const patch: Record<string, unknown> = {};

  const emoji = asString(req.body.emoji);
  const title = asString(req.body.title);
  const titleAr = asString(req.body.title_ar);
  const color = asString(req.body.color);
  const sortOrder = asNumber(req.body.sort_order);
  const isActive = asBoolean(req.body.is_active);

  if (emoji !== undefined) patch.emoji = emoji;
  if (title !== undefined) patch.title = title;
  if (titleAr !== undefined) patch.title_ar = titleAr;
  if (color !== undefined) patch.color = color;
  if (sortOrder !== undefined) patch.sort_order = sortOrder;
  if (isActive !== undefined) patch.is_active = isActive;

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_inventory_custom_labels")
    .update(patch)
    .eq("id", labelId)
    .eq("establishment_id", establishmentId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Label not found" });

  res.json({ ok: true, label: data });
};

export const deleteProCustomLabel: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const labelId = typeof req.params.labelId === "string" ? req.params.labelId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!labelId) return res.status(400).json({ error: "labelId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("pro_inventory_custom_labels")
    .delete()
    .eq("id", labelId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// =============================================================================
// INVENTORY ITEMS REORDER
// =============================================================================

export const reorderProInventoryItems: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageInventory({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const itemIds = asStringArray(req.body.item_ids);
  if (!itemIds || itemIds.length === 0) {
    return res.status(400).json({ error: "item_ids array is required" });
  }

  const supabase = getAdminSupabase();

  // Update sort_order for each item
  const updates = itemIds.map((id, index) =>
    supabase
      .from("pro_inventory_items")
      .update({ sort_order: index })
      .eq("id", id)
      .eq("establishment_id", establishmentId)
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    return res.status(500).json({ error: "Some items could not be reordered" });
  }

  res.json({ ok: true });
};

// =============================================================================
// PROMO ANALYTICS - Get usage stats for promo codes
// =============================================================================

export const getProPromoAnalytics: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  // Get all promo codes for this establishment with usage stats
  const { data: promoCodes, error: promoErr } = await supabase
    .from("consumer_promo_codes")
    .select("id, code, discount_bps, is_public, active, starts_at, ends_at, max_uses_total, max_uses_per_user, total_uses, total_revenue_generated, total_discount_given, created_at")
    .contains("applies_to_establishment_ids", [establishmentId])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (promoErr) return res.status(500).json({ error: promoErr.message });

  // Get pack purchases that used promo codes
  const { data: packPurchases, error: ppErr } = await supabase
    .from("pack_purchases")
    .select("id, pack_id, amount_paid, promo_code_id, created_at")
    .eq("establishment_id", establishmentId)
    .not("promo_code_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (ppErr) return res.status(500).json({ error: ppErr.message });

  // Calculate stats per promo code
  const promoStats: Record<string, { uses: number; revenue: number; avgDiscount: number }> = {};
  for (const purchase of packPurchases ?? []) {
    const promoId = purchase.promo_code_id as string;
    if (!promoStats[promoId]) {
      promoStats[promoId] = { uses: 0, revenue: 0, avgDiscount: 0 };
    }
    promoStats[promoId].uses += 1;
    promoStats[promoId].revenue += (purchase.amount_paid ?? 0) as number;
  }

  // Compute conversion rate (uses / total views would need tracking, so use uses / max_uses_total as proxy)
  const analytics = (promoCodes ?? []).map((promo) => {
    const stats = promoStats[promo.id] ?? { uses: 0, revenue: 0, avgDiscount: 0 };
    const conversionRate = promo.max_uses_total ? (stats.uses / promo.max_uses_total) * 100 : null;
    return {
      ...promo,
      usage_count: promo.total_uses ?? stats.uses,
      revenue_generated: promo.total_revenue_generated ?? stats.revenue,
      discount_given: promo.total_discount_given ?? 0,
      conversion_rate: conversionRate,
    };
  });

  // Calculate totals
  const totalUsage = analytics.reduce((sum, p) => sum + (p.usage_count ?? 0), 0);
  const totalRevenue = analytics.reduce((sum, p) => sum + (p.revenue_generated ?? 0), 0);
  const totalDiscount = analytics.reduce((sum, p) => sum + (p.discount_given ?? 0), 0);

  res.json({
    ok: true,
    analytics,
    summary: {
      total_codes: analytics.length,
      total_usage: totalUsage,
      total_revenue: totalRevenue,
      total_discount: totalDiscount,
    },
  });
};

// =============================================================================
// PROMO TEMPLATES - CRUD for reusable promo configurations
// =============================================================================

export const listProPromoTemplates: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("promo_templates")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, templates: data ?? [] });
};

export const createProPromoTemplate: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const body = req.body as Record<string, unknown>;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return res.status(400).json({ error: "name is required" });

  const discountBps = safeInt(body.discount_bps);
  if (discountBps <= 0 || discountBps > 10000) return res.status(400).json({ error: "discount_bps must be between 1 and 10000" });

  const supabase = getAdminSupabase();

  const payload: Record<string, unknown> = {
    establishment_id: establishmentId,
    name,
    description: typeof body.description === "string" ? body.description.trim() || null : null,
    discount_bps: discountBps,
    is_public: typeof body.is_public === "boolean" ? body.is_public : false,
    max_uses_total: body.max_uses_total ? safeInt(body.max_uses_total) : null,
    max_uses_per_user: body.max_uses_per_user ? safeInt(body.max_uses_per_user) : null,
    min_cart_amount: body.min_cart_amount ? safeInt(body.min_cart_amount) : null,
    valid_days_of_week: Array.isArray(body.valid_days_of_week) ? body.valid_days_of_week : null,
    valid_hours_start: typeof body.valid_hours_start === "string" ? body.valid_hours_start : null,
    valid_hours_end: typeof body.valid_hours_end === "string" ? body.valid_hours_end : null,
    first_purchase_only: typeof body.first_purchase_only === "boolean" ? body.first_purchase_only : false,
    new_customers_only: typeof body.new_customers_only === "boolean" ? body.new_customers_only : false,
    applies_to_pack_ids: Array.isArray(body.applies_to_pack_ids) ? body.applies_to_pack_ids : null,
    applies_to_slot_ids: Array.isArray(body.applies_to_slot_ids) ? body.applies_to_slot_ids : null,
  };

  const { data, error } = await supabase.from("promo_templates").insert(payload).select("*").single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, template: data });
};

export const updateProPromoTemplate: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const templateId = typeof req.params.templateId === "string" ? req.params.templateId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!templateId) return res.status(400).json({ error: "templateId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const body = req.body as Record<string, unknown>;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "name cannot be empty" });
    patch.name = name;
  }
  if (body.description !== undefined) patch.description = typeof body.description === "string" ? body.description.trim() || null : null;
  if (body.discount_bps !== undefined) {
    const bps = safeInt(body.discount_bps);
    if (bps <= 0 || bps > 10000) return res.status(400).json({ error: "discount_bps must be between 1 and 10000" });
    patch.discount_bps = bps;
  }
  if (body.is_public !== undefined) patch.is_public = Boolean(body.is_public);
  if (body.max_uses_total !== undefined) patch.max_uses_total = body.max_uses_total ? safeInt(body.max_uses_total) : null;
  if (body.max_uses_per_user !== undefined) patch.max_uses_per_user = body.max_uses_per_user ? safeInt(body.max_uses_per_user) : null;
  if (body.min_cart_amount !== undefined) patch.min_cart_amount = body.min_cart_amount ? safeInt(body.min_cart_amount) : null;
  if (body.valid_days_of_week !== undefined) patch.valid_days_of_week = Array.isArray(body.valid_days_of_week) ? body.valid_days_of_week : null;
  if (body.valid_hours_start !== undefined) patch.valid_hours_start = typeof body.valid_hours_start === "string" ? body.valid_hours_start : null;
  if (body.valid_hours_end !== undefined) patch.valid_hours_end = typeof body.valid_hours_end === "string" ? body.valid_hours_end : null;
  if (body.first_purchase_only !== undefined) patch.first_purchase_only = Boolean(body.first_purchase_only);
  if (body.new_customers_only !== undefined) patch.new_customers_only = Boolean(body.new_customers_only);
  if (body.applies_to_pack_ids !== undefined) patch.applies_to_pack_ids = Array.isArray(body.applies_to_pack_ids) ? body.applies_to_pack_ids : null;
  if (body.applies_to_slot_ids !== undefined) patch.applies_to_slot_ids = Array.isArray(body.applies_to_slot_ids) ? body.applies_to_slot_ids : null;

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("promo_templates")
    .update(patch)
    .eq("id", templateId)
    .eq("establishment_id", establishmentId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, template: data });
};

export const deleteProPromoTemplate: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const templateId = typeof req.params.templateId === "string" ? req.params.templateId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!templateId) return res.status(400).json({ error: "templateId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("promo_templates")
    .delete()
    .eq("id", templateId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

export const createPromoFromTemplate: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const templateId = typeof req.params.templateId === "string" ? req.params.templateId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!templateId) return res.status(400).json({ error: "templateId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const body = req.body as Record<string, unknown>;

  const supabase = getAdminSupabase();

  // Get template
  const { data: template, error: tplErr } = await supabase
    .from("promo_templates")
    .select("*")
    .eq("id", templateId)
    .eq("establishment_id", establishmentId)
    .single();

  if (tplErr || !template) return res.status(404).json({ error: "Template not found" });

  // Generate code
  const code = typeof body.code === "string" && body.code.trim() ? body.code.trim().toUpperCase() : generateSamPromoCode();

  // Create promo code from template
  const payload: Record<string, unknown> = {
    code,
    description: template.description,
    discount_bps: template.discount_bps,
    applies_to_pack_id: null,
    applies_to_establishment_ids: [establishmentId],
    active: true,
    is_public: template.is_public,
    starts_at: body.starts_at ? parseIsoDatetimeOrNull(body.starts_at as string) : null,
    ends_at: body.ends_at ? parseIsoDatetimeOrNull(body.ends_at as string) : null,
    max_uses_total: template.max_uses_total,
    max_uses_per_user: template.max_uses_per_user,
    // Advanced fields from template
    min_cart_amount: template.min_cart_amount,
    valid_days_of_week: template.valid_days_of_week,
    valid_hours_start: template.valid_hours_start,
    valid_hours_end: template.valid_hours_end,
    first_purchase_only: template.first_purchase_only,
    new_customers_only: template.new_customers_only,
    applies_to_pack_ids: template.applies_to_pack_ids,
    applies_to_slot_ids: template.applies_to_slot_ids,
  };

  const { data, error } = await supabase.from("consumer_promo_codes").insert(payload).select("*").single();

  if (error) {
    if (/duplicate key value violates unique constraint/i.test(error.message)) {
      return res.status(409).json({ error: "code_already_exists" });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, promo_code: data });
};

// =============================================================================
// PROMO CSV EXPORT
// =============================================================================

export const exportProPromoCodesCsv: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageOffers({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const { data: promoCodes, error } = await supabase
    .from("consumer_promo_codes")
    .select("*")
    .contains("applies_to_establishment_ids", [establishmentId])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Build CSV
  const headers = [
    "Code",
    "Description",
    "Remise (%)",
    "Public",
    "Actif",
    "Début",
    "Fin",
    "Limite totale",
    "Limite par user",
    "Utilisations",
    "Revenus générés",
    "Remises accordées",
    "Créé le",
  ];

  const rows = (promoCodes ?? []).map((p) => [
    p.code ?? "",
    (p.description ?? "").replace(/"/g, '""'),
    ((p.discount_bps ?? 0) / 100).toFixed(0),
    p.is_public ? "Oui" : "Non",
    p.active ? "Oui" : "Non",
    p.starts_at ? new Date(p.starts_at).toLocaleDateString("fr-FR") : "",
    p.ends_at ? new Date(p.ends_at).toLocaleDateString("fr-FR") : "",
    p.max_uses_total ?? "",
    p.max_uses_per_user ?? "",
    p.total_uses ?? 0,
    ((p.total_revenue_generated ?? 0) / 100).toFixed(2),
    ((p.total_discount_given ?? 0) / 100).toFixed(2),
    p.created_at ? new Date(p.created_at).toLocaleDateString("fr-FR") : "",
  ]);

  const csvContent = [
    headers.map((h) => `"${h}"`).join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="promo-codes-${establishmentId.slice(0, 8)}.csv"`);
  res.send("\uFEFF" + csvContent); // BOM for Excel compatibility
};

// ============================================
// Reservation History / Timeline
// ============================================

export const getReservationHistory: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);
  const reservationId = asString(req.params.reservationId);

  if (!establishmentId || !reservationId) {
    return res.status(400).json({ error: "establishmentId and reservationId are required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this establishment" });
  }

  // Fetch history
  const { data: history, error } = await supabase
    .from("reservation_history")
    .select("*")
    .eq("reservation_id", reservationId)
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ history: history ?? [] });
};

export const logReservationAction: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const userEmail = sessionData.user.email ?? "Pro";
  const establishmentId = asString(req.params.establishmentId);
  const reservationId = asString(req.params.reservationId);

  if (!establishmentId || !reservationId) {
    return res.status(400).json({ error: "establishmentId and reservationId are required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this establishment" });
  }

  const body = req.body as Record<string, unknown>;
  const action = asString(body.action);
  const actionLabel = asString(body.action_label);
  const message = asString(body.message);
  const previousStatus = asString(body.previous_status);
  const newStatus = asString(body.new_status);
  const previousData = asJsonObject(body.previous_data);
  const newData = asJsonObject(body.new_data);

  if (!action || !actionLabel) {
    return res.status(400).json({ error: "action and action_label are required" });
  }

  const { data, error } = await supabase
    .from("reservation_history")
    .insert({
      reservation_id: reservationId,
      establishment_id: establishmentId,
      actor_type: "pro",
      actor_id: userId,
      actor_name: userEmail,
      action,
      action_label: actionLabel,
      previous_status: previousStatus,
      new_status: newStatus,
      previous_data: previousData,
      new_data: newData,
      message,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, entry: data });
};

export const listEstablishmentReservationHistory: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this establishment" });
  }

  // Parse query params
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
  const action = asString(req.query.action);

  // Build query
  let query = supabase
    .from("reservation_history")
    .select("*, reservations!inner(booking_reference, starts_at, party_size)")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (action) {
    query = query.eq("action", action);
  }

  const { data: history, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  res.json({ history: history ?? [], limit, offset });
};

// ---------------------------------------------------------------------------
// Username management (Custom short URLs like @username)
// ---------------------------------------------------------------------------

const USERNAME_COOLDOWN_DAYS = 180;

function validateUsernameFormat(username: string): { valid: boolean; error?: string } {
  const normalized = username.toLowerCase().trim();

  if (normalized.length < 3) {
    return { valid: false, error: "Le nom d'utilisateur doit contenir au moins 3 caractères" };
  }

  if (normalized.length > 30) {
    return { valid: false, error: "Le nom d'utilisateur ne peut pas dépasser 30 caractères" };
  }

  // Must start with a letter
  if (!/^[a-z]/.test(normalized)) {
    return { valid: false, error: "Le nom d'utilisateur doit commencer par une lettre" };
  }

  // Only lowercase letters, numbers, underscores, and dots
  if (!/^[a-z][a-z0-9._]*$/.test(normalized)) {
    return { valid: false, error: "Seuls les lettres minuscules, chiffres, points et underscores sont autorisés" };
  }

  // Cannot end with underscore or dot
  if (/[._]$/.test(normalized)) {
    return { valid: false, error: "Le nom d'utilisateur ne peut pas se terminer par un point ou underscore" };
  }

  // No consecutive dots or underscores
  if (/\.\./.test(normalized) || /__/.test(normalized) || /\._/.test(normalized) || /_\./.test(normalized)) {
    return { valid: false, error: "Pas de points ou underscores consécutifs" };
  }

  // Reserved usernames
  const reserved = [
    "admin", "administrator", "support", "help", "contact", "info",
    "sortiraumaroc", "sam", "booking", "reservations", "pro", "api",
    "www", "mail", "email", "account", "accounts", "user", "users",
    "settings", "config", "login", "logout", "signup", "signin",
    "register", "password", "reset", "dashboard", "profile", "profiles",
    "establishment", "establishments", "restaurant", "restaurants",
    "hotel", "hotels", "spa", "spas", "activity", "activities",
    "event", "events", "test", "demo", "example", "null", "undefined",
  ];

  if (reserved.includes(normalized)) {
    return { valid: false, error: "Ce nom d'utilisateur est réservé" };
  }

  return { valid: true };
}

export const checkUsernameAvailability: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const username = asString(req.query.username);
  if (!username) {
    return res.status(400).json({ error: "username is required", available: false });
  }

  const normalized = username.toLowerCase().trim();

  // Validate format
  const validation = validateUsernameFormat(normalized);
  if (!validation.valid) {
    return res.json({ available: false, error: validation.error });
  }

  // Check if already taken by an establishment
  const { data: existingEstablishment } = await supabase
    .from("establishments")
    .select("id")
    .ilike("username", normalized)
    .maybeSingle();

  if (existingEstablishment) {
    return res.json({ available: false, error: "Ce nom d'utilisateur est déjà pris" });
  }

  // Check if pending in moderation queue
  const { data: pendingRequest } = await supabase
    .from("establishment_username_requests")
    .select("id")
    .ilike("requested_username", normalized)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingRequest) {
    return res.json({ available: false, error: "Ce nom d'utilisateur est en cours de validation" });
  }

  return res.json({ available: true });
};

export const getEstablishmentUsername: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this establishment" });
  }

  // Get establishment username info
  const { data: establishment } = await supabase
    .from("establishments")
    .select("username, username_changed_at")
    .eq("id", establishmentId)
    .single();

  if (!establishment) {
    return res.status(404).json({ error: "Establishment not found" });
  }

  // Get pending request if any
  const { data: pendingRequest } = await supabase
    .from("establishment_username_requests")
    .select("id, requested_username, status, created_at, rejection_reason")
    .eq("establishment_id", establishmentId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .maybeSingle();

  // Calculate if can change
  let canChange = true;
  let nextChangeDate: string | null = null;

  if (establishment.username_changed_at) {
    const changedAt = new Date(establishment.username_changed_at);
    const cooldownEnd = new Date(changedAt.getTime() + USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();

    if (now < cooldownEnd) {
      canChange = false;
      nextChangeDate = cooldownEnd.toISOString();
    }
  }

  // If there's a pending request, cannot submit another
  if (pendingRequest) {
    canChange = false;
  }

  // Get subscription status (gracefully handle if table doesn't exist)
  let subscription = null;
  let canUseUsername = false;
  try {
    subscription = await getSubscriptionWithDetails(establishmentId);
    canUseUsername = subscription?.can_use_username ?? false;
  } catch (e) {
    console.warn("[getEstablishmentUsername] Error fetching subscription:", e);
    // Continue without subscription info
  }

  // Cannot change username without active subscription
  if (!canUseUsername) {
    canChange = false;
  }

  return res.json({
    username: establishment.username,
    usernameChangedAt: establishment.username_changed_at,
    pendingRequest,
    canChange,
    nextChangeDate,
    cooldownDays: USERNAME_COOLDOWN_DAYS,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          is_trial: subscription.is_trial,
          trial_ends_at: subscription.trial_ends_at,
          starts_at: subscription.starts_at,
          expires_at: subscription.expires_at,
          grace_period_ends_at: subscription.grace_period_ends_at,
          cancelled_at: subscription.cancelled_at,
          days_remaining: subscription.days_remaining,
          can_use_username: subscription.can_use_username,
        }
      : null,
    canUseUsername,
  });
};

export const submitUsernameRequest: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);
  const body = req.body as Record<string, unknown>;
  const requestedUsername = asString(body.username);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  if (!requestedUsername) {
    return res.status(400).json({ error: "username is required" });
  }

  const normalized = requestedUsername.toLowerCase().trim();

  // Validate format
  const validation = validateUsernameFormat(normalized);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  // Check membership with edit rights
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || !["owner", "manager"].includes(membership.role)) {
    return res.status(403).json({ error: "Only owners and managers can change username" });
  }

  // Check username subscription is active (gating)
  const hasActiveSubscription = await isUsernameAccessAllowed(establishmentId);
  if (!hasActiveSubscription) {
    return res.status(403).json({
      error: "Un abonnement actif est requis pour utiliser cette fonctionnalite",
      code: "SUBSCRIPTION_REQUIRED",
    });
  }

  // Check establishment exists and cooldown
  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, name, username, username_changed_at")
    .eq("id", establishmentId)
    .single();

  if (!establishment) {
    return res.status(404).json({ error: "Establishment not found" });
  }

  // Check cooldown period
  if (establishment.username_changed_at) {
    const changedAt = new Date(establishment.username_changed_at);
    const cooldownEnd = new Date(changedAt.getTime() + USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();

    if (now < cooldownEnd) {
      const daysRemaining = Math.ceil((cooldownEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      return res.status(400).json({
        error: `Vous devez attendre encore ${daysRemaining} jours avant de pouvoir changer votre nom d'utilisateur`,
      });
    }
  }

  // Check no pending request
  const { data: existingPending } = await supabase
    .from("establishment_username_requests")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPending) {
    return res.status(400).json({ error: "Une demande est déjà en cours de validation" });
  }

  // Check username availability
  const { data: existingUsername } = await supabase
    .from("establishments")
    .select("id")
    .ilike("username", normalized)
    .neq("id", establishmentId)
    .maybeSingle();

  if (existingUsername) {
    return res.status(400).json({ error: "Ce nom d'utilisateur est déjà pris" });
  }

  const { data: pendingUsername } = await supabase
    .from("establishment_username_requests")
    .select("id")
    .ilike("requested_username", normalized)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingUsername) {
    return res.status(400).json({ error: "Ce nom d'utilisateur est en cours de validation par un autre établissement" });
  }

  // Create the request
  const { data: newRequest, error: insertError } = await supabase
    .from("establishment_username_requests")
    .insert({
      establishment_id: establishmentId,
      requested_username: normalized,
      requested_by: userId,
      status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  // Notify admins
  emitAdminNotification({
    category: "username_request",
    title: "Nouvelle demande de nom d'utilisateur",
    body: `${establishment.name || "Un établissement"} demande le nom @${normalized}`,
    data: {
      establishmentId,
      requestId: newRequest.id,
      requestedUsername: normalized,
    },
  });

  return res.json({
    ok: true,
    request: newRequest,
    message: "Votre demande a été envoyée en modération",
  });
};

export const cancelUsernameRequest: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);
  const requestId = asString(req.params.requestId);

  if (!establishmentId || !requestId) {
    return res.status(400).json({ error: "establishmentId and requestId are required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || !["owner", "manager"].includes(membership.role)) {
    return res.status(403).json({ error: "Only owners and managers can cancel requests" });
  }

  // Delete the pending request
  const { error: deleteError } = await supabase
    .from("establishment_username_requests")
    .delete()
    .eq("id", requestId)
    .eq("establishment_id", establishmentId)
    .eq("status", "pending");

  if (deleteError) {
    return res.status(500).json({ error: deleteError.message });
  }

  return res.json({ ok: true, message: "Demande annulée" });
};

// ---------------------------------------------------------------------------
// Username Subscription Management
// ---------------------------------------------------------------------------

export const getUsernameSubscription: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this establishment" });
  }

  const subscription = await getSubscriptionWithDetails(establishmentId);

  // Check if establishment already had a trial
  const { data: previousTrial } = await supabase
    .from("username_subscriptions")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("is_trial", true)
    .limit(1)
    .maybeSingle();

  return res.json({
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          is_trial: subscription.is_trial,
          trial_ends_at: subscription.trial_ends_at,
          starts_at: subscription.starts_at,
          expires_at: subscription.expires_at,
          grace_period_ends_at: subscription.grace_period_ends_at,
          cancelled_at: subscription.cancelled_at,
          price_cents: subscription.price_cents,
          currency: subscription.currency,
          days_remaining: subscription.days_remaining,
          can_use_username: subscription.can_use_username,
        }
      : null,
    can_start_trial: !previousTrial && !subscription,
    has_used_trial: !!previousTrial,
  });
};

export const startUsernameTrialHandler: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  // Check membership with edit rights
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || !["owner", "manager", "marketing"].includes(membership.role)) {
    return res.status(403).json({ error: "Only owners, managers and marketing can start a trial" });
  }

  try {
    const subscription = await startTrial(establishmentId, userId);
    return res.json({
      ok: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        is_trial: subscription.is_trial,
        trial_ends_at: subscription.trial_ends_at,
      },
      message: "Votre essai gratuit de 14 jours est actif !",
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Impossible de demarrer l'essai" });
  }
};

export const cancelUsernameSubscriptionHandler: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  // Check membership with edit rights (owner only for cancel)
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || membership.role !== "owner") {
    return res.status(403).json({ error: "Only owners can cancel subscriptions" });
  }

  try {
    const subscription = await cancelSubscription(establishmentId, userId);
    return res.json({
      ok: true,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            cancelled_at: subscription.cancelled_at,
            expires_at: subscription.expires_at,
          }
        : null,
      message: "L'abonnement reste actif jusqu'a expiration. Vous ne recevrez plus de rappels de renouvellement.",
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Impossible d'annuler l'abonnement" });
  }
};

// ---------------------------------------------------------------------------
// BOOKING SOURCE STATS (Direct Link vs Platform)
// ---------------------------------------------------------------------------

export const getProBookingSourceStats: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this establishment" });
  }

  // Parse period filter
  const period = asString(req.query.period) || "month";
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "day":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week":
      const dayOfWeek = now.getDay();
      startDate = new Date(now);
      startDate.setDate(now.getDate() - dayOfWeek);
      startDate.setHours(0, 0, 0, 0);
      break;
    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case "month":
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  const startIso = startDate.toISOString();

  // Get stats by booking source
  const { data: reservations, error: resError } = await supabase
    .from("reservations")
    .select("id, booking_source, amount_total, status, commission_amount")
    .eq("establishment_id", establishmentId)
    .gte("created_at", startIso)
    .in("status", ["confirmed", "pending_pro_validation", "noshow"]);

  if (resError) {
    return res.status(500).json({ error: resError.message });
  }

  const rows = (reservations ?? []) as Array<{
    id: string;
    booking_source: string | null;
    amount_total: number | null;
    status: string;
    commission_amount: number | null;
  }>;

  // Calculate stats
  let platformCount = 0;
  let platformRevenue = 0;
  let platformCommissions = 0;
  let directLinkCount = 0;
  let directLinkRevenue = 0;
  let directLinkSavings = 0;

  // Get establishment commission rate for savings calculation
  const { data: commissionOverride } = await supabase
    .from("establishment_commission_overrides")
    .select("commission_percent")
    .eq("establishment_id", establishmentId)
    .eq("active", true)
    .maybeSingle();

  const { data: financeRules } = await supabase
    .from("finance_rules")
    .select("standard_commission_percent")
    .eq("id", 1)
    .maybeSingle();

  const commissionRate =
    (commissionOverride as any)?.commission_percent ??
    (financeRules as any)?.standard_commission_percent ??
    10;

  for (const r of rows) {
    const source = r.booking_source || "platform";
    const amount = typeof r.amount_total === "number" ? r.amount_total : 0;
    const commission = typeof r.commission_amount === "number" ? r.commission_amount : 0;

    if (source === "direct_link") {
      directLinkCount++;
      directLinkRevenue += amount;
      // Calculate savings (commission that would have been charged)
      directLinkSavings += Math.round((amount * commissionRate) / 100);
    } else {
      platformCount++;
      platformRevenue += amount;
      platformCommissions += commission;
    }
  }

  const totalCount = platformCount + directLinkCount;
  const conversionRate = totalCount > 0 ? Math.round((directLinkCount / totalCount) * 100) : 0;

  return res.json({
    ok: true,
    period,
    startDate: startIso,
    stats: {
      platform: {
        count: platformCount,
        revenue: platformRevenue,
        commissions: platformCommissions,
      },
      directLink: {
        count: directLinkCount,
        revenue: directLinkRevenue,
        savings: directLinkSavings,
      },
      total: {
        count: totalCount,
        revenue: platformRevenue + directLinkRevenue,
      },
      directLinkPercent: conversionRate,
    },
  });
};

// ---------------------------------------------------------------------------
// PRO ONLINE STATUS (Activity/Assiduity System)
// ---------------------------------------------------------------------------

/**
 * GET /api/pro/establishments/:establishmentId/online-status
 * Get current online status and activity stats for an establishment
 */
export const getProOnlineStatus: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  // Get establishment online status and activity data
  const { data: establishment, error: estErr } = await supabase
    .from("establishments")
    .select("id, name, is_online, online_since, last_online_at, total_online_minutes, activity_score")
    .eq("id", establishmentId)
    .maybeSingle();

  if (estErr) return res.status(500).json({ error: estErr.message });
  if (!establishment) return res.status(404).json({ error: "Establishment not found" });

  // Get recent activity stats (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const { data: recentActivity } = await supabase
    .from("pro_activity_daily")
    .select("date, online_minutes, sessions_count, reservations_handled, reservations_confirmed")
    .eq("establishment_id", establishmentId)
    .gte("date", sevenDaysAgo)
    .order("date", { ascending: false });

  // Calculate current session duration if online
  let currentSessionMinutes = 0;
  if (establishment.is_online && establishment.online_since) {
    currentSessionMinutes = Math.floor((Date.now() - new Date(establishment.online_since).getTime()) / 60000);
  }

  return res.json({
    ok: true,
    status: {
      is_online: establishment.is_online ?? false,
      online_since: establishment.online_since,
      last_online_at: establishment.last_online_at,
      current_session_minutes: currentSessionMinutes,
      total_online_minutes: establishment.total_online_minutes ?? 0,
      activity_score: establishment.activity_score ?? 0,
    },
    recent_activity: recentActivity ?? [],
  });
};

/**
 * POST /api/pro/establishments/:establishmentId/toggle-online
 * Toggle establishment online/offline status
 */
export const toggleProOnlineStatus: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const body = isRecord(req.body) ? req.body : {};
  const isOnline = typeof body.is_online === "boolean" ? body.is_online : undefined;

  if (isOnline === undefined) {
    return res.status(400).json({ error: "is_online (boolean) is required" });
  }

  const supabase = getAdminSupabase();

  // Call the RPC function to toggle status
  const { data, error } = await supabase.rpc("toggle_establishment_online", {
    p_establishment_id: establishmentId,
    p_user_id: userResult.user.id,
    p_is_online: isOnline,
  });

  if (error) {
    console.error("[toggleProOnlineStatus] RPC error:", error);
    return res.status(500).json({ error: error.message });
  }

  const result = data as { ok: boolean; action?: string; error?: string; [key: string]: unknown };

  if (!result.ok) {
    return res.status(400).json({ error: result.error || "toggle_failed" });
  }

  // Log the action
  await supabase.from("system_logs").insert({
    actor_user_id: userResult.user.id,
    actor_role: `pro:${permission.role}`,
    action: isOnline ? "establishment.went_online" : "establishment.went_offline",
    entity_type: "establishment",
    entity_id: establishmentId,
    payload: result,
  });

  return res.json({
    ok: true,
    is_online: isOnline,
    ...result,
  });
};

/**
 * GET /api/pro/establishments/:establishmentId/activity-stats
 * Get detailed activity statistics for the dashboard
 */
export const getProActivityStats: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  // Get establishment activity score
  const { data: establishment } = await supabase
    .from("establishments")
    .select("activity_score, total_online_minutes, is_online, last_online_at")
    .eq("id", establishmentId)
    .maybeSingle();

  // Get last 30 days activity
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const { data: dailyStats } = await supabase
    .from("pro_activity_daily")
    .select("*")
    .eq("establishment_id", establishmentId)
    .gte("date", thirtyDaysAgo)
    .order("date", { ascending: true });

  // Calculate aggregates
  const stats = (dailyStats ?? []).reduce(
    (acc, day) => {
      acc.total_online_minutes += day.online_minutes || 0;
      acc.total_sessions += day.sessions_count || 0;
      acc.total_reservations_handled += day.reservations_handled || 0;
      acc.total_reservations_confirmed += day.reservations_confirmed || 0;
      acc.days_active += 1;
      return acc;
    },
    {
      total_online_minutes: 0,
      total_sessions: 0,
      total_reservations_handled: 0,
      total_reservations_confirmed: 0,
      days_active: 0,
    }
  );

  const confirmationRate =
    stats.total_reservations_handled > 0
      ? Math.round((stats.total_reservations_confirmed / stats.total_reservations_handled) * 100)
      : 0;

  return res.json({
    ok: true,
    activity_score: establishment?.activity_score ?? 0,
    is_online: establishment?.is_online ?? false,
    last_online_at: establishment?.last_online_at,
    period: "30_days",
    stats: {
      ...stats,
      total_online_hours: Math.round(stats.total_online_minutes / 60),
      avg_daily_minutes: stats.days_active > 0 ? Math.round(stats.total_online_minutes / stats.days_active) : 0,
      confirmation_rate: confirmationRate,
    },
    daily_breakdown: dailyStats ?? [],
    // Tips for improving score
    tips: getActivityImprovementTips(establishment?.activity_score ?? 0, stats),
  });
};

function getActivityImprovementTips(score: number, stats: { days_active: number; total_online_minutes: number; total_reservations_handled: number }): string[] {
  const tips: string[] = [];

  if (score < 30) {
    tips.push("Connectez-vous plus régulièrement pour améliorer votre visibilité");
  }

  if (stats.days_active < 15) {
    tips.push("Essayez d'être en ligne au moins 15 jours par mois");
  }

  if (stats.total_online_minutes < 1800) { // Less than 30 hours/month
    tips.push("Augmentez votre temps en ligne pour être mieux classé dans les recherches");
  }

  if (stats.total_reservations_handled < 5) {
    tips.push("Répondez rapidement aux demandes de réservation");
  }

  if (score >= 70) {
    tips.push("Excellent ! Maintenez votre activité pour garder votre visibilité");
  }

  return tips;
}
