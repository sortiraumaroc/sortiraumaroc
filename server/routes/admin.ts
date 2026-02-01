import type { RequestHandler } from "express";
import { createHash, randomBytes } from "crypto";

import {
  parseCookies,
  getSessionCookieName,
  verifyAdminSessionToken,
} from "../adminSession";
import {
  assertAdminApiEnabled,
  checkAdminKey,
  getAdminSupabase,
} from "../supabaseAdmin";
import {
  ensureEscrowHoldForReservation,
  settleEscrowForReservation,
  ensureInvoiceForReservation,
} from "../finance";
import { recomputeConsumerUserStatsV1 } from "../consumerReliability";
import { emitAdminNotification } from "../adminNotifications";
import { sendLoggedEmail, sendTemplateEmail } from "../emailService";
import { triggerWaitlistPromotionForSlot } from "../waitlist";
import {
  renderSambookingEmail,
  sendSambookingEmail,
  type SambookingSenderKey,
} from "../email";
import {
  getBillingCompanyProfile,
  invalidateBillingCompanyProfileCache,
  type BillingCompanyProfile,
} from "../billing/companyProfile";
import {
  generateMediaInvoicePdfBuffer,
  generateMediaQuotePdfBuffer,
} from "../billing/mediaPdf";
import {
  buildRib24FromParts,
  detectMoroccanBankName,
  digitsOnly,
  type RibParts,
} from "../../shared/rib";

type ModerationQueueRow = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  payload: unknown;
};

type EstablishmentRow = {
  id: string;
  verified: boolean;
  name: string | null;
  universe: string | null;
  subcategory: string | null;
  specialties: string[] | null;
  city: string | null;
  postal_code: string | null;
  region: string | null;
  country: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  description_short: string | null;
  description_long: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  social_links: unknown;
  hours: unknown;
  tags: string[] | null;
  amenities: string[] | null;
  cover_url: string | null;
  gallery_urls: string[] | null;
  ambiance_tags: string[] | null;
  extra: unknown;
  mix_experience: unknown;
};

function getAdminSessionToken(
  req: Parameters<RequestHandler>[0],
): { token: string; source: "cookie" | "header" } | null {
  const cookies = parseCookies(req.header("cookie") ?? undefined);
  const cookieToken = cookies[getSessionCookieName()];
  if (cookieToken) return { token: cookieToken, source: "cookie" };

  const headerToken = req.header("x-admin-session") ?? undefined;
  if (headerToken && headerToken.trim())
    return { token: headerToken.trim(), source: "header" };

  const authHeader = req.header("authorization") ?? undefined;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return { token: bearer, source: "header" };
  }

  return null;
}

function hasValidAdminSession(req: Parameters<RequestHandler>[0]): boolean {
  const session = getAdminSessionToken(req);
  if (!session) return false;
  return verifyAdminSessionToken(session.token) !== null;
}

function isSafeMethod(method: string | undefined): boolean {
  const m = (method || "GET").toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS";
}

function isSameOrigin(req: Parameters<RequestHandler>[0]): boolean {
  const originHeader = req.header("origin");
  if (!originHeader) return true;

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  const host = req.header("x-forwarded-host") ?? req.header("host");
  if (!host) return false;

  return origin.host === host;
}

export function requireAdminKey(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): boolean {
  const enabled = assertAdminApiEnabled();
  if (enabled.ok === false) {
    res.status(503).json({ error: enabled.message });
    return false;
  }

  const session = getAdminSessionToken(req);
  if (session) {
    const payload = verifyAdminSessionToken(session.token);
    if (payload !== null) {
      // CSRF protection for cookie-based sessions (cookies can be sent cross-site).
      // Header-based sessions are safe because browsers can't forge custom headers cross-site.
      if (
        session.source === "cookie" &&
        !isSafeMethod(req.method) &&
        !isSameOrigin(req)
      ) {
        res.status(403).json({ error: "Accès refusé" });
        return false;
      }

      // Expose session payload on request for downstream handlers
      (req as any).adminSession = payload;
      return true;
    }
  }

  const header = req.header("x-admin-key") ?? undefined;
  if (!checkAdminKey(header)) {
    res.status(401).json({ error: "Non autorisé" });
    return false;
  }

  return true;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

/**
 * Translate common Supabase/API error messages to French
 */
function translateErrorMessage(message: string | undefined): string {
  if (!message) return "Erreur inattendue";

  const translations: Record<string, string> = {
    "A user with this email address has already been registered":
      "Un utilisateur avec cette adresse email existe déjà",
    "User already registered":
      "Utilisateur déjà enregistré",
    "Email already exists":
      "Cette adresse email est déjà utilisée",
    "Invalid email":
      "Adresse email invalide",
    "Password should be at least 6 characters":
      "Le mot de passe doit contenir au moins 6 caractères",
    "Email not confirmed":
      "Adresse email non confirmée",
    "Invalid login credentials":
      "Identifiants de connexion invalides",
    "User not found":
      "Utilisateur introuvable",
    "Email rate limit exceeded":
      "Limite d'envoi d'emails dépassée, réessayez plus tard",
    "For security purposes, you can only request this once every 60 seconds":
      "Pour des raisons de sécurité, vous ne pouvez faire cette demande qu'une fois par minute",
    "Unable to validate email address: invalid format":
      "Format d'adresse email invalide",
    "Signup requires a valid password":
      "L'inscription nécessite un mot de passe valide",
    "Password is too weak":
      "Le mot de passe est trop faible",
    "New password should be different from the old password":
      "Le nouveau mot de passe doit être différent de l'ancien",
  };

  // Check for exact match
  if (translations[message]) {
    return translations[message];
  }

  // Check for partial match (some Supabase messages have dynamic parts)
  for (const [key, value] of Object.entries(translations)) {
    if (message.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }

  return message;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function generateProvisionalPassword(): string {
  const token = randomBytes(18).toString("base64url");
  return `Sam-${token}`;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
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

function extractEstablishmentProfileUpdate(
  data: unknown,
): Partial<EstablishmentRow> {
  if (!isRecord(data)) return {};

  const update: Partial<EstablishmentRow> = {};

  const name = asString(data.name);
  if (name !== undefined) update.name = name;

  const universe = asString(data.universe);
  if (universe !== undefined) update.universe = universe;

  const subcategory = asString(data.subcategory);
  if (subcategory !== undefined) update.subcategory = subcategory;

  const specialties = asStringArray(data.specialties);
  if (specialties !== undefined) update.specialties = specialties;

  const city = asString(data.city);
  if (city !== undefined) update.city = city;

  const postalCode = asString(data.postal_code);
  if (postalCode !== undefined) update.postal_code = postalCode;

  const region = asString(data.region);
  if (region !== undefined) update.region = region;

  const country = asString(data.country);
  if (country !== undefined) update.country = country;

  const address = asString(data.address);
  if (address !== undefined) update.address = address;

  const lat = asNumber(data.lat);
  if (lat !== undefined) update.lat = lat;

  const lng = asNumber(data.lng);
  if (lng !== undefined) update.lng = lng;

  const descriptionShort = asString(data.description_short);
  if (descriptionShort !== undefined)
    update.description_short = descriptionShort;

  const descriptionLong = asString(data.description_long);
  if (descriptionLong !== undefined) update.description_long = descriptionLong;

  const phone = asString(data.phone);
  if (phone !== undefined) update.phone = phone;

  const whatsapp = asString(data.whatsapp);
  if (whatsapp !== undefined) update.whatsapp = whatsapp;

  const website = asString(data.website);
  if (website !== undefined) update.website = website;

  const socialLinks = asJsonObject(data.social_links);
  if (socialLinks !== undefined) update.social_links = socialLinks;

  const hours = asJsonObject(data.hours);
  if (hours !== undefined) update.hours = hours;

  const tags = asStringArray(data.tags);
  if (tags !== undefined) update.tags = tags;

  const amenities = asStringArray(data.amenities);
  if (amenities !== undefined) update.amenities = amenities;

  const coverUrl = asString(data.cover_url);
  if (coverUrl !== undefined) update.cover_url = coverUrl;

  const galleryUrls = asStringArray(data.gallery_urls);
  if (galleryUrls !== undefined) update.gallery_urls = galleryUrls;

  const ambianceTags = asStringArray(data.ambiance_tags);
  if (ambianceTags !== undefined) update.ambiance_tags = ambianceTags;

  const mixExperience = asJsonObject(data.mix_experience);
  if (mixExperience !== undefined) update.mix_experience = mixExperience;

  const extra = asJsonObject(data.extra);
  if (extra !== undefined) update.extra = extra;

  return update;
}

async function applyEstablishmentProfileUpdate(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  moderation: ModerationQueueRow;
  decidedAtIso: string;
}): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const { supabase, moderation, decidedAtIso } = args;
  const payload = isRecord(moderation.payload) ? moderation.payload : {};
  const draftId = asString(payload.draft_id);
  if (!draftId)
    return {
      ok: false,
      status: 400,
      error: "Identifiant de brouillon manquant",
    };

  const { data: draft, error: draftError } = await supabase
    .from("establishment_profile_drafts")
    .select("*")
    .eq("id", draftId)
    .single();

  if (draftError) return { ok: false, status: 404, error: draftError.message };

  if (draft.status !== "pending") {
    return {
      ok: false,
      status: 409,
      error: `Draft already decided (${draft.status})`,
    };
  }

  const establishmentId = moderation.entity_id ?? draft.establishment_id;

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

  if (estError) return { ok: false, status: 404, error: estError.message };

  const establishment = establishmentData as unknown as EstablishmentRow | null;
  if (!establishment)
    return { ok: false, status: 404, error: "Établissement introuvable" };

  const update = extractEstablishmentProfileUpdate(draft.data);
  if (establishment.verified) {
    delete update.universe;
    delete update.subcategory;
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  const establishmentRecord = establishment as unknown as Record<
    string,
    unknown
  >;

  for (const [key, value] of Object.entries(update)) {
    before[key] = establishmentRecord[key];
    after[key] = value;
  }

  const { error: estUpdateError } = await supabase
    .from("establishments")
    .update({ ...update, edit_status: "none" })
    .eq("id", establishment.id);

  if (estUpdateError) return { ok: false, error: estUpdateError.message };

  const { error: draftUpdateError } = await supabase
    .from("establishment_profile_drafts")
    .update({ status: "approved", decided_at: decidedAtIso, reason: null })
    .eq("id", draftId);

  if (draftUpdateError) return { ok: false, error: draftUpdateError.message };

  // If per-field rows exist, accept all of them for consistency.
  await supabase
    .from("establishment_profile_draft_changes")
    .update({
      status: "accepted",
      decided_at: decidedAtIso,
      decided_by: null,
      reason: null,
    })
    .eq("draft_id", draftId)
    .eq("status", "pending");

  await supabase.from("establishment_profile_change_log").insert({
    establishment_id: establishment.id,
    actor_id: null,
    action: "profile_update.approved",
    before,
    after,
    draft_id: draftId,
  });

  // Notify the Pro.
  if (draft.created_by) {
    const copy = decisionToNotificationCopy("approved");
    await supabase.from("pro_notifications").insert({
      user_id: draft.created_by,
      establishment_id: establishment.id,
      category: "moderation",
      title: copy.title,
      body: `${copy.body} (${String(establishment.name ?? "votre établissement")})`,
      data: { targetTab: "establishment", draftId, decision: "approved" },
    });
  }

  return { ok: true };
}

async function rejectEstablishmentProfileUpdate(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  moderation: ModerationQueueRow;
  decidedAtIso: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const { supabase, moderation, decidedAtIso, reason } = args;
  const payload = isRecord(moderation.payload) ? moderation.payload : {};
  const draftId = asString(payload.draft_id);
  if (!draftId)
    return {
      ok: false,
      status: 400,
      error: "Identifiant de brouillon manquant",
    };

  const { data: draft, error: draftError } = await supabase
    .from("establishment_profile_drafts")
    .select("*")
    .eq("id", draftId)
    .single();

  if (draftError) return { ok: false, status: 404, error: draftError.message };

  if (draft.status !== "pending") {
    return {
      ok: false,
      status: 409,
      error: `Draft already decided (${draft.status})`,
    };
  }

  const establishmentId = moderation.entity_id ?? draft.establishment_id;

  const { error: estUpdateError } = await supabase
    .from("establishments")
    .update({ edit_status: "none" })
    .eq("id", establishmentId);

  if (estUpdateError) return { ok: false, error: estUpdateError.message };

  const { error: draftUpdateError } = await supabase
    .from("establishment_profile_drafts")
    .update({ status: "rejected", decided_at: decidedAtIso, reason })
    .eq("id", draftId);

  if (draftUpdateError) return { ok: false, error: draftUpdateError.message };

  // If per-field rows exist, reject all of them for consistency.
  await supabase
    .from("establishment_profile_draft_changes")
    .update({
      status: "rejected",
      decided_at: decidedAtIso,
      decided_by: null,
      reason,
    })
    .eq("draft_id", draftId)
    .eq("status", "pending");

  await supabase.from("establishment_profile_change_log").insert({
    establishment_id: establishmentId,
    actor_id: null,
    action: "profile_update.rejected",
    before: null,
    after: { reason },
    draft_id: draftId,
  });

  // Notify the Pro.
  if (draft.created_by) {
    const copy = decisionToNotificationCopy("rejected");
    const { data: est } = await supabase
      .from("establishments")
      .select("name")
      .eq("id", establishmentId)
      .single();
    await supabase.from("pro_notifications").insert({
      user_id: draft.created_by,
      establishment_id: establishmentId,
      category: "moderation",
      title: copy.title,
      body: `${copy.body} (${String((est as any)?.name ?? "votre établissement")})`,
      data: { targetTab: "establishment", draftId, decision: "rejected" },
    });
  }

  return { ok: true };
}

type DraftChangeRow = {
  id: string;
  draft_id: string;
  establishment_id: string;
  field: string;
  before: unknown;
  after: unknown;
  status: string;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
};

type PendingProfileUpdateAdmin = {
  draft: {
    id: string;
    establishment_id: string;
    created_by: string;
    created_at: string;
    moderation_id: string | null;
    status: string;
    decided_at: string | null;
    reason: string | null;
  };
  author: { user_id: string; email: string | null };
  changes: DraftChangeRow[];
};

function getAdminSessionSub(req: Parameters<RequestHandler>[0]): string | null {
  const cookies = parseCookies(req.header("cookie") ?? undefined);
  const token = cookies[getSessionCookieName()];
  if (!token) return null;
  const payload = verifyAdminSessionToken(token);
  return payload?.sub ?? null;
}

const PROFILE_UPDATE_FIELD_LABELS: Record<string, string> = {
  name: "Nom",
  universe: "Univers",
  subcategory: "Sous-catégorie",
  specialties: "Spécialités",
  city: "Ville",
  postal_code: "Code postal",
  region: "Région",
  country: "Pays",
  address: "Adresse",
  lat: "Latitude",
  lng: "Longitude",
  description_short: "Description courte",
  description_long: "Description longue",
  phone: "Téléphone",
  whatsapp: "WhatsApp",
  website: "Site web",
  social_links: "Réseaux sociaux",
  hours: "Horaires",
  tags: "Tags",
  amenities: "Équipements",
  cover_url: "Photo de couverture",
  gallery_urls: "Photos (galerie)",
  ambiance_tags: "Ambiances",
  extra: "Infos complémentaires",
  mix_experience: "Points forts",
};

const PROFILE_UPDATE_FIELDS = new Set(Object.keys(PROFILE_UPDATE_FIELD_LABELS));

function prettyFieldLabel(field: string): string {
  return PROFILE_UPDATE_FIELD_LABELS[field] ?? field;
}

function decisionToNotificationCopy(decision: string): {
  title: string;
  body: string;
} {
  const s = (decision ?? "").toLowerCase();
  if (s === "approved") {
    return {
      title: "Modifications validées",
      body: "Vos modifications ont été validées par l’équipe Sortir Au Maroc et sont désormais visibles sur votre fiche.",
    };
  }
  if (s === "partially_accepted") {
    return {
      title: "Modifications partiellement validées",
      body: "Certaines de vos modifications ont été acceptées, d’autres refusées. Consultez le détail pour voir ce qui a été ajusté.",
    };
  }
  return {
    title: "Modifications refusées",
    body: "Vos modifications n’ont pas pu être acceptées. Merci de vérifier les informations ou de contacter le support.",
  };
}

async function finalizeDraftIfComplete(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  establishmentId: string;
  draftId: string;
  decidedAtIso: string;
  adminSub: string | null;
}): Promise<
  | { ok: true; finalized: false }
  | {
      ok: true;
      finalized: true;
      status: "approved" | "rejected" | "partially_accepted";
    }
  | { ok: false; status?: number; error: string }
> {
  const { supabase, establishmentId, draftId, decidedAtIso, adminSub } = args;

  const { data: draft, error: draftError } = await supabase
    .from("establishment_profile_drafts")
    .select("id, establishment_id, created_by, moderation_id, status")
    .eq("id", draftId)
    .single();

  if (draftError) return { ok: false, status: 404, error: draftError.message };

  if (String((draft as any).status) !== "pending") {
    // Already finalized.
    return { ok: true, finalized: false };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("establishment_profile_draft_changes")
    .select("status")
    .eq("draft_id", draftId)
    .limit(500);

  if (rowsError) return { ok: false, error: rowsError.message };

  const statuses = (rows ?? []).map((r) =>
    String((r as any).status ?? "").toLowerCase(),
  );
  if (statuses.some((s) => s === "pending"))
    return { ok: true, finalized: false };

  const acceptedCount = statuses.filter((s) => s === "accepted").length;
  const rejectedCount = statuses.filter((s) => s === "rejected").length;

  const overall: "approved" | "rejected" | "partially_accepted" =
    acceptedCount > 0 && rejectedCount > 0
      ? "partially_accepted"
      : acceptedCount > 0
        ? "approved"
        : "rejected";

  const { error: draftUpdateError } = await supabase
    .from("establishment_profile_drafts")
    .update({ status: overall, decided_at: decidedAtIso })
    .eq("id", draftId);

  if (draftUpdateError) return { ok: false, error: draftUpdateError.message };

  const moderationId = (draft as any).moderation_id as string | null;
  if (moderationId) {
    await supabase
      .from("moderation_queue")
      .update({ status: overall, decided_at: decidedAtIso })
      .eq("id", moderationId);
  }

  await supabase
    .from("establishments")
    .update({ edit_status: "none" })
    .eq("id", establishmentId);

  // Notify the Pro who submitted the draft.
  const authorUserId = String((draft as any).created_by ?? "");
  if (authorUserId) {
    const { data: est, error: estError } = await supabase
      .from("establishments")
      .select("id,name")
      .eq("id", establishmentId)
      .single();

    const estName = estError
      ? "votre établissement"
      : String((est as any)?.name ?? "") || "votre établissement";
    const copy = decisionToNotificationCopy(overall);

    await supabase.from("pro_notifications").insert({
      user_id: authorUserId,
      establishment_id: establishmentId,
      category: "moderation",
      title: copy.title,
      body: `${copy.body} (${estName})`,
      data: { targetTab: "establishment", draftId, decision: overall },
    });
  }

  await supabase.from("admin_audit_log").insert({
    actor_id: null,
    action: "establishment.profile_update.finalize",
    entity_type: "establishment",
    entity_id: establishmentId,
    metadata: { draft_id: draftId, decision: overall, actor: adminSub },
  });

  return { ok: true, finalized: true, status: overall };
}

async function getPendingProfileUpdateForEstablishment(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  establishmentId: string;
}): Promise<
  | { ok: true; items: PendingProfileUpdateAdmin[] }
  | { ok: false; status?: number; error: string }
> {
  const { supabase, establishmentId } = args;

  const { data: drafts, error: draftsError } = await supabase
    .from("establishment_profile_drafts")
    .select(
      "id, establishment_id, created_by, created_at, moderation_id, status, decided_at, reason",
    )
    .eq("establishment_id", establishmentId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);

  if (draftsError) return { ok: false, error: draftsError.message };

  const list = (drafts ?? []) as any[];
  if (!list.length) return { ok: true, items: [] };

  const draftIds = list.map((d) => String(d.id)).filter(Boolean);
  const authorIds = Array.from(
    new Set(list.map((d) => String(d.created_by)).filter(Boolean)),
  );

  const [changesRes, authorsRes] = await Promise.all([
    supabase
      .from("establishment_profile_draft_changes")
      .select("*")
      .in("draft_id", draftIds)
      .order("created_at", { ascending: true }),
    authorIds.length
      ? supabase
          .from("users_pro")
          .select("user_id,email")
          .in("user_id", authorIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (changesRes.error) return { ok: false, error: changesRes.error.message };
  if (authorsRes.error) return { ok: false, error: authorsRes.error.message };

  const byDraft: Record<string, DraftChangeRow[]> = {};
  for (const c of (changesRes.data ?? []) as any[]) {
    const did = String(c.draft_id ?? "");
    if (!did) continue;
    if (!byDraft[did]) byDraft[did] = [];
    byDraft[did].push(c as DraftChangeRow);
  }

  const authorEmailById = new Map<string, string | null>();
  for (const a of (authorsRes.data ?? []) as any[]) {
    const id = String(a.user_id ?? "");
    if (!id) continue;
    authorEmailById.set(id, typeof a.email === "string" ? a.email : null);
  }

  const items: PendingProfileUpdateAdmin[] = list.map((d) => {
    const did = String(d.id);
    const uid = String(d.created_by);
    return {
      draft: {
        id: did,
        establishment_id: String(d.establishment_id),
        created_by: uid,
        created_at: String(d.created_at),
        moderation_id: d.moderation_id ? String(d.moderation_id) : null,
        status: String(d.status),
        decided_at: d.decided_at ? String(d.decided_at) : null,
        reason: d.reason ? String(d.reason) : null,
      },
      author: { user_id: uid, email: authorEmailById.get(uid) ?? null },
      changes: (byDraft[did] ?? []).slice(),
    };
  });

  return { ok: true, items };
}

export const listAdminEstablishmentPendingProfileUpdates: RequestHandler =
  async (req, res) => {
    if (!requireAdminKey(req, res)) return;

    const establishmentId =
      typeof req.params.id === "string" ? req.params.id : "";
    if (!establishmentId)
      return res.status(400).json({ error: "Identifiant d'établissement manquant" });

    const supabase = getAdminSupabase();
    const result = await getPendingProfileUpdateForEstablishment({
      supabase,
      establishmentId,
    });
    if (result.ok === false)
      return res.status(result.status ?? 500).json({ error: result.error });

    res.json({ items: result.items });
  };

async function applyAcceptedFieldUpdate(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  establishmentId: string;
  field: string;
  value: unknown;
  decidedAtIso: string;
  draftId: string;
}): Promise<
  { ok: true; before: unknown } | { ok: false; status?: number; error: string }
> {
  const { supabase, establishmentId, field, value, decidedAtIso, draftId } =
    args;

  if (!PROFILE_UPDATE_FIELDS.has(field)) {
    return { ok: false, status: 400, error: "Champ non supporté" };
  }

  const { data: est, error: estError } = await supabase
    .from("establishments")
    .select(["verified", field].join(","))
    .eq("id", establishmentId)
    .single();

  if (estError) return { ok: false, status: 404, error: estError.message };

  const verified = !!(est as any)?.verified;
  if (verified && (field === "universe" || field === "subcategory")) {
    return {
      ok: false,
      status: 409,
      error: "Champ verrouillé après validation",
    };
  }

  const before = (est as any)?.[field];

  const { error: updateError } = await supabase
    .from("establishments")
    .update({ [field]: value, updated_at: decidedAtIso })
    .eq("id", establishmentId);

  if (updateError) return { ok: false, error: updateError.message };

  await supabase.from("establishment_profile_change_log").insert({
    establishment_id: establishmentId,
    actor_id: null,
    action: "profile_update.field.accepted",
    before: { [field]: before },
    after: { [field]: value },
    draft_id: draftId,
  });

  return { ok: true, before };
}

export const acceptAdminEstablishmentProfileChange: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  const draftId =
    typeof req.params.draftId === "string" ? req.params.draftId : "";
  const changeId =
    typeof req.params.changeId === "string" ? req.params.changeId : "";

  if (!establishmentId || !draftId || !changeId)
    return res.status(400).json({ error: "Identifiants manquants" });

  const supabase = getAdminSupabase();
  const decidedAt = new Date().toISOString();
  const adminSub = getAdminSessionSub(req);

  const { data: change, error: changeError } = await supabase
    .from("establishment_profile_draft_changes")
    .select("*")
    .eq("id", changeId)
    .eq("draft_id", draftId)
    .single();

  if (changeError) return res.status(404).json({ error: changeError.message });

  const currentStatus = String((change as any).status ?? "").toLowerCase();
  if (currentStatus !== "pending")
    return res
      .status(409)
      .json({ error: `Changement déjà décidé (${currentStatus})` });

  const field = String((change as any).field ?? "");
  const value = (change as any).after;

  const applyRes = await applyAcceptedFieldUpdate({
    supabase,
    establishmentId,
    field,
    value,
    decidedAtIso: decidedAt,
    draftId,
  });

  if (applyRes.ok === false)
    return res.status(applyRes.status ?? 500).json({ error: applyRes.error });

  const { error: updateError } = await supabase
    .from("establishment_profile_draft_changes")
    .update({
      status: "accepted",
      decided_at: decidedAt,
      decided_by: null,
      reason: null,
    })
    .eq("id", changeId);

  if (updateError) return res.status(500).json({ error: updateError.message });

  await supabase.from("admin_audit_log").insert({
    actor_id: null,
    action: "establishment.profile_update.accept",
    entity_type: "establishment",
    entity_id: establishmentId,
    metadata: {
      draft_id: draftId,
      change_id: changeId,
      field,
      field_label: prettyFieldLabel(field),
      actor: adminSub,
    },
  });

  const finalizeRes = await finalizeDraftIfComplete({
    supabase,
    establishmentId,
    draftId,
    decidedAtIso: decidedAt,
    adminSub,
  });

  if (finalizeRes.ok === false)
    return res
      .status(finalizeRes.status ?? 500)
      .json({ error: finalizeRes.error });

  res.json({
    ok: true,
    finalized: finalizeRes.finalized,
    status: finalizeRes.finalized ? finalizeRes.status : null,
  });
};

export const rejectAdminEstablishmentProfileChange: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  const draftId =
    typeof req.params.draftId === "string" ? req.params.draftId : "";
  const changeId =
    typeof req.params.changeId === "string" ? req.params.changeId : "";

  if (!establishmentId || !draftId || !changeId)
    return res.status(400).json({ error: "Identifiants manquants" });

  const reason =
    typeof req.body?.reason === "string" ? req.body.reason.trim() : null;

  const supabase = getAdminSupabase();
  const decidedAt = new Date().toISOString();
  const adminSub = getAdminSessionSub(req);

  const { data: change, error: changeError } = await supabase
    .from("establishment_profile_draft_changes")
    .select("*")
    .eq("id", changeId)
    .eq("draft_id", draftId)
    .single();

  if (changeError) return res.status(404).json({ error: changeError.message });

  const currentStatus = String((change as any).status ?? "").toLowerCase();
  if (currentStatus !== "pending")
    return res
      .status(409)
      .json({ error: `Changement déjà décidé (${currentStatus})` });

  const field = String((change as any).field ?? "");

  const { error: updateError } = await supabase
    .from("establishment_profile_draft_changes")
    .update({
      status: "rejected",
      decided_at: decidedAt,
      decided_by: null,
      reason: reason || null,
    })
    .eq("id", changeId);

  if (updateError) return res.status(500).json({ error: updateError.message });

  await supabase.from("establishment_profile_change_log").insert({
    establishment_id: establishmentId,
    actor_id: null,
    action: "profile_update.field.rejected",
    before: { [field]: (change as any).before },
    after: { reason: reason || null, field },
    draft_id: draftId,
  });

  await supabase.from("admin_audit_log").insert({
    actor_id: null,
    action: "establishment.profile_update.reject",
    entity_type: "establishment",
    entity_id: establishmentId,
    metadata: {
      draft_id: draftId,
      change_id: changeId,
      field,
      field_label: prettyFieldLabel(field),
      reason: reason || null,
      actor: adminSub,
    },
  });

  const finalizeRes = await finalizeDraftIfComplete({
    supabase,
    establishmentId,
    draftId,
    decidedAtIso: decidedAt,
    adminSub,
  });

  if (finalizeRes.ok === false)
    return res
      .status(finalizeRes.status ?? 500)
      .json({ error: finalizeRes.error });

  res.json({
    ok: true,
    finalized: finalizeRes.finalized,
    status: finalizeRes.finalized ? finalizeRes.status : null,
  });
};

export const acceptAllAdminEstablishmentProfileUpdates: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  const draftId =
    typeof req.params.draftId === "string" ? req.params.draftId : "";
  if (!establishmentId || !draftId)
    return res.status(400).json({ error: "Identifiants manquants" });

  const supabase = getAdminSupabase();
  const decidedAt = new Date().toISOString();
  const adminSub = getAdminSessionSub(req);

  const { data: changes, error: changesError } = await supabase
    .from("establishment_profile_draft_changes")
    .select("*")
    .eq("draft_id", draftId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(500);

  if (changesError)
    return res.status(500).json({ error: changesError.message });

  for (const c of (changes ?? []) as any[]) {
    const field = String(c.field ?? "");
    const value = c.after;
    const applyRes = await applyAcceptedFieldUpdate({
      supabase,
      establishmentId,
      field,
      value,
      decidedAtIso: decidedAt,
      draftId,
    });

    if (applyRes.ok === false) {
      // Skip fields that cannot be applied (e.g. locked fields)
      await supabase
        .from("establishment_profile_draft_changes")
        .update({
          status: "rejected",
          decided_at: decidedAt,
          decided_by: null,
          reason: applyRes.error,
        })
        .eq("id", String(c.id));
      continue;
    }

    await supabase
      .from("establishment_profile_draft_changes")
      .update({
        status: "accepted",
        decided_at: decidedAt,
        decided_by: null,
        reason: null,
      })
      .eq("id", String(c.id));
  }

  await supabase.from("admin_audit_log").insert({
    actor_id: null,
    action: "establishment.profile_update.accept_all",
    entity_type: "establishment",
    entity_id: establishmentId,
    metadata: { draft_id: draftId, actor: adminSub },
  });

  const finalizeRes = await finalizeDraftIfComplete({
    supabase,
    establishmentId,
    draftId,
    decidedAtIso: decidedAt,
    adminSub,
  });
  if (finalizeRes.ok === false)
    return res
      .status(finalizeRes.status ?? 500)
      .json({ error: finalizeRes.error });

  res.json({
    ok: true,
    finalized: finalizeRes.finalized,
    status: finalizeRes.finalized ? finalizeRes.status : null,
  });
};

export const rejectAllAdminEstablishmentProfileUpdates: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  const draftId =
    typeof req.params.draftId === "string" ? req.params.draftId : "";
  if (!establishmentId || !draftId)
    return res.status(400).json({ error: "Identifiants manquants" });

  const reason =
    typeof req.body?.reason === "string" ? req.body.reason.trim() : null;

  const supabase = getAdminSupabase();
  const decidedAt = new Date().toISOString();
  const adminSub = getAdminSessionSub(req);

  const { error: updateError } = await supabase
    .from("establishment_profile_draft_changes")
    .update({
      status: "rejected",
      decided_at: decidedAt,
      decided_by: null,
      reason: reason || null,
    })
    .eq("draft_id", draftId)
    .eq("status", "pending");

  if (updateError) return res.status(500).json({ error: updateError.message });

  await supabase.from("establishment_profile_change_log").insert({
    establishment_id: establishmentId,
    actor_id: null,
    action: "profile_update.rejected",
    before: null,
    after: { reason: reason || null },
    draft_id: draftId,
  });

  await supabase.from("admin_audit_log").insert({
    actor_id: null,
    action: "establishment.profile_update.reject_all",
    entity_type: "establishment",
    entity_id: establishmentId,
    metadata: { draft_id: draftId, reason: reason || null, actor: adminSub },
  });

  const finalizeRes = await finalizeDraftIfComplete({
    supabase,
    establishmentId,
    draftId,
    decidedAtIso: decidedAt,
    adminSub,
  });
  if (finalizeRes.ok === false)
    return res
      .status(finalizeRes.status ?? 500)
      .json({ error: finalizeRes.error });

  res.json({
    ok: true,
    finalized: finalizeRes.finalized,
    status: finalizeRes.finalized ? finalizeRes.status : null,
  });
};

export const listModerationQueue: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status =
    typeof req.query.status === "string" ? req.query.status : "pending";
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("moderation_queue")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data ?? [] });
};

export const approveModerationItem: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = req.params.id;
  const supabase = getAdminSupabase();

  const { data: item, error: readError } = await supabase
    .from("moderation_queue")
    .select("*")
    .eq("id", id)
    .single();

  if (readError) return res.status(404).json({ error: readError.message });

  const decidedAt = new Date().toISOString();

  const moderation = item as ModerationQueueRow;

  if (
    moderation.entity_type === "establishment" &&
    moderation.action === "profile_update"
  ) {
    const result = await applyEstablishmentProfileUpdate({
      supabase,
      moderation,
      decidedAtIso: decidedAt,
    });
    if (result.ok === false)
      return res.status(result.status ?? 500).json({ error: result.error });
  }

  const { error: updateError } = await supabase
    .from("moderation_queue")
    .update({ status: "approved", decided_at: decidedAt, reason: null })
    .eq("id", id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  await supabase.from("admin_audit_log").insert({
    action: "moderation.approve",
    entity_type: moderation.entity_type,
    entity_id: moderation.entity_id,
    metadata: { moderation_id: id },
  });

  res.json({ ok: true });
};

export const rejectModerationItem: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = req.params.id;
  const reason =
    typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

  if (!reason) return res.status(400).json({ error: "Raison requise" });

  const supabase = getAdminSupabase();

  const { data: item, error: readError } = await supabase
    .from("moderation_queue")
    .select("*")
    .eq("id", id)
    .single();

  if (readError) return res.status(404).json({ error: readError.message });

  const decidedAt = new Date().toISOString();

  const moderation = item as ModerationQueueRow;

  if (
    moderation.entity_type === "establishment" &&
    moderation.action === "profile_update"
  ) {
    const result = await rejectEstablishmentProfileUpdate({
      supabase,
      moderation,
      decidedAtIso: decidedAt,
      reason,
    });
    if (result.ok === false)
      return res.status(result.status ?? 500).json({ error: result.error });
  }

  const { error: updateError } = await supabase
    .from("moderation_queue")
    .update({ status: "rejected", decided_at: decidedAt, reason })
    .eq("id", id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  await supabase.from("admin_audit_log").insert({
    action: "moderation.reject",
    entity_type: moderation.entity_type,
    entity_id: moderation.entity_id,
    metadata: { moderation_id: id, reason },
  });

  res.json({ ok: true });
};

type ConsumerUserAdminRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  city: string;
  country: string;
  reliability_score: number | null;
  reservations_count: number | null;
  no_shows_count: number | null;
  created_at: string;
  last_activity_at: string;
};

type ConsumerUserEventRow = {
  id: string;
  user_id: string;
  event_type: string;
  occurred_at: string;
  metadata: unknown;
};

type ConsumerPurchaseRow = {
  id: string;
  user_id: string;
  currency: string;
  total_amount: number;
  status: string;
  purchased_at: string;
  items: unknown;
  metadata: unknown;
};

export const listConsumerUsers: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_consumer_users")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    items: (data ?? []) as ConsumerUserAdminRow[],
  });
};

type ConsumerAccountActionAdminRow = {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  action_type: string;
  occurred_at: string;
  reason_code: string | null;
  reason_text: string | null;
  ip: string | null;
  user_agent: string | null;
};

export const listConsumerAccountActions: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const actionType =
    typeof req.query.type === "string" ? req.query.type.trim() : "";
  const userId =
    typeof req.query.user_id === "string" ? req.query.user_id.trim() : "";

  const limit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 500;
  const safeLimit = Number.isFinite(limit)
    ? Math.min(2000, Math.max(1, Math.floor(limit)))
    : 500;

  const supabase = getAdminSupabase();
  let query = supabase
    .from("admin_consumer_account_actions")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(safeLimit);

  if (actionType) query = query.eq("action_type", actionType);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as ConsumerAccountActionAdminRow[] });
};

export const getConsumerUser: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_consumer_users")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return res.status(404).json({ error: error.message });

  res.json({ item: data as ConsumerUserAdminRow });
};

export const recomputeConsumerUserReliability: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const computed = await recomputeConsumerUserStatsV1({ supabase, userId: id });

  await supabase.from("admin_audit_log").insert({
    action: "consumer.reliability.recompute",
    entity_type: "consumer_user",
    entity_id: id,
    metadata: {
      reliability_score: computed.reliabilityScore,
      reliability_level: computed.reliabilityLevel,
      reservations_count: computed.reservationsCount,
      no_shows_count: computed.noShowsCount,
    },
  });

  res.json({
    ok: true,
    reliability_score: computed.reliabilityScore,
    reliability_level: computed.reliabilityLevel,
    reservations_count: computed.reservationsCount,
    no_shows_count: computed.noShowsCount,
  });
};

export const listConsumerUserEvents: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const limit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const safeLimit = Number.isFinite(limit)
    ? Math.min(500, Math.max(1, Math.floor(limit)))
    : 200;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_consumer_user_events")
    .select("*")
    .eq("user_id", id)
    .order("occurred_at", { ascending: false })
    .limit(safeLimit);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as ConsumerUserEventRow[] });
};

export const updateConsumerUserStatus: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  const status =
    typeof req.body?.status === "string" ? req.body.status.trim() : "";

  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (status !== "active" && status !== "suspended") {
    return res
      .status(400)
      .json({ error: "status must be active or suspended" });
  }

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("consumer_users")
    .update({ status })
    .eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "consumer_user.status",
    entity_type: "consumer_user",
    entity_id: null,
    metadata: { user_id: id, status },
  });

  res.json({ ok: true });
};

export const updateConsumerUserEvent: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  const eventId =
    typeof req.params.eventId === "string" ? req.params.eventId : "";

  if (!userId) return res.status(400).json({ error: "Identifiant requis" });
  if (!eventId) return res.status(400).json({ error: "Identifiant d'événement requis" });

  const eventType =
    typeof req.body?.event_type === "string"
      ? req.body.event_type.trim()
      : undefined;
  const occurredAt =
    typeof req.body?.occurred_at === "string"
      ? req.body.occurred_at.trim()
      : undefined;
  const metadata = req.body?.metadata as unknown;

  const patch: Record<string, unknown> = {};
  if (eventType) patch.event_type = eventType;
  if (typeof occurredAt === "string") patch.occurred_at = occurredAt;
  if (req.body && "metadata" in req.body) patch.metadata = metadata ?? {};

  if (!Object.keys(patch).length) return res.json({ ok: true });

  const supabase = getAdminSupabase();
  const { data: existing, error: readErr } = await supabase
    .from("consumer_user_events")
    .select("id,user_id")
    .eq("id", eventId)
    .eq("user_id", userId)
    .single();

  if (readErr || !existing)
    return res.status(404).json({ error: "Événement introuvable" });

  const { error: updateErr } = await supabase
    .from("consumer_user_events")
    .update(patch)
    .eq("id", eventId)
    .eq("user_id", userId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await supabase.from("admin_audit_log").insert({
    action: "consumer_user_event.update",
    entity_type: "consumer_user_event",
    entity_id: eventId as any,
    metadata: { user_id: userId, patch },
  });

  res.json({ ok: true });
};

export const listConsumerUserPurchases: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_consumer_purchases")
    .select("*")
    .eq("user_id", id)
    .order("purchased_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as ConsumerPurchaseRow[] });
};

export const updateConsumerUserPurchase: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  const purchaseId =
    typeof req.params.purchaseId === "string" ? req.params.purchaseId : "";

  if (!userId) return res.status(400).json({ error: "Identifiant requis" });
  if (!purchaseId)
    return res.status(400).json({ error: "Identifiant d'achat requis" });

  const patch: Record<string, unknown> = {};

  const status =
    typeof req.body?.status === "string" ? req.body.status.trim() : undefined;
  const currency =
    typeof req.body?.currency === "string"
      ? req.body.currency.trim()
      : undefined;
  const totalAmount =
    typeof req.body?.total_amount === "number"
      ? req.body.total_amount
      : undefined;
  const purchasedAt =
    typeof req.body?.purchased_at === "string"
      ? req.body.purchased_at.trim()
      : undefined;

  if (status) patch.status = status;
  if (currency) patch.currency = currency;
  if (typeof totalAmount === "number" && Number.isFinite(totalAmount))
    patch.total_amount = Math.max(0, Math.floor(totalAmount));
  if (typeof purchasedAt === "string") patch.purchased_at = purchasedAt;
  if (req.body && "items" in req.body)
    patch.items = (req.body as any).items ?? [];
  if (req.body && "metadata" in req.body)
    patch.metadata = (req.body as any).metadata ?? {};

  if (!Object.keys(patch).length) return res.json({ ok: true });

  const supabase = getAdminSupabase();

  const { data: existing, error: readErr } = await supabase
    .from("consumer_purchases")
    .select("id,user_id")
    .eq("id", purchaseId)
    .eq("user_id", userId)
    .single();

  if (readErr || !existing)
    return res.status(404).json({ error: "Achat introuvable" });

  const { error: updateErr } = await supabase
    .from("consumer_purchases")
    .update(patch)
    .eq("id", purchaseId)
    .eq("user_id", userId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await supabase.from("admin_audit_log").insert({
    action: "consumer_purchase.update",
    entity_type: "consumer_purchase",
    entity_id: purchaseId as any,
    metadata: { user_id: userId, patch },
  });

  res.json({ ok: true });
};

type ProMembershipRow = {
  establishment_id: string;
  user_id: string;
  role: string;
};

type AuthUserRow = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

type ProUserAdminRow = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  establishments_count: number;
  establishment_ids: string[];
  roles: Record<string, number>;
};

type ProMembershipAdminRow = {
  establishment_id: string;
  role: string;
  establishment: {
    id: string;
    name: string | null;
    title: string | null;
    city: string | null;
    status: string | null;
    universe: string | null;
    subcategory: string | null;
    created_at: string | null;
  } | null;
};

type ReservationRow = {
  id: string;
  booking_reference: string | null;
  establishment_id: string;
  status: string | null;
  payment_status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  party_size: number | null;
  amount_total: number | null;
  amount_deposit: number | null;
  currency: string | null;
  checked_in_at: string | null;
  meta: unknown;
};

type ProConversationRow = {
  id: string;
  establishment_id: string;
  reservation_id: string | null;
  subject: string | null;
  status: string | null;
  updated_at: string | null;
  created_at: string | null;
  meta: unknown;
};

type ProMessageRow = {
  id: string;
  establishment_id: string;
  conversation_id: string;
  from_role: string | null;
  body: string | null;
  sender_user_id: string | null;
  created_at: string | null;
  meta: unknown;
};

type QrScanLogRow = {
  id: string;
  establishment_id: string;
  reservation_id: string | null;
  booking_reference: string | null;
  scanned_at: string | null;
  scanned_by_user_id: string | null;
  holder_name: string | null;
  result: string | null;
  payload: string | null;
};

async function fetchAuthUsersByIds(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  userIds: string[];
}): Promise<Map<string, AuthUserRow>> {
  const out = new Map<string, AuthUserRow>();
  const wanted = new Set(args.userIds.filter(Boolean));
  if (!wanted.size) return out;

  const perPage = 1000;
  const maxPages = 50;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await args.supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;

    const users = (data as any)?.users as
      | Array<Record<string, unknown>>
      | undefined;
    if (!users?.length) break;

    for (const u of users) {
      const id = typeof u.id === "string" ? u.id : "";
      if (!id || !wanted.has(id)) continue;

      out.set(id, {
        id,
        email: typeof u.email === "string" ? u.email : null,
        created_at: typeof u.created_at === "string" ? u.created_at : null,
        last_sign_in_at:
          typeof u.last_sign_in_at === "string" ? u.last_sign_in_at : null,
      });
    }

    if (out.size >= wanted.size) break;
    if (users.length < perPage) break;
  }

  return out;
}

export const listProUsers: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  // 1. Récupérer les PROs avec établissements
  const { data: memberships, error: memErr } = await supabase
    .from("pro_establishment_memberships")
    .select("user_id,establishment_id,role")
    .limit(5000);

  if (memErr) return res.status(500).json({ error: memErr.message });

  const rows = (memberships ?? []) as ProMembershipRow[];

  const byUser = new Map<
    string,
    { establishments: Set<string>; roles: Record<string, number> }
  >();
  for (const m of rows) {
    const userId = typeof m.user_id === "string" ? m.user_id : "";
    const estId =
      typeof m.establishment_id === "string" ? m.establishment_id : "";
    const role =
      typeof m.role === "string" && m.role.trim() ? m.role.trim() : "unknown";
    if (!userId || !estId) continue;

    const existing = byUser.get(userId) ?? {
      establishments: new Set<string>(),
      roles: {},
    };
    existing.establishments.add(estId);
    existing.roles[role] = (existing.roles[role] ?? 0) + 1;
    byUser.set(userId, existing);
  }

  // 2. Récupérer les PROs depuis pro_profiles (même sans établissement)
  const { data: proProfiles } = await supabase
    .from("pro_profiles")
    .select("user_id")
    .limit(5000);

  const proUserIdsFromProfiles = (proProfiles ?? [])
    .map((p: any) => (typeof p.user_id === "string" ? p.user_id : ""))
    .filter(Boolean);

  // 3. Récupérer les PROs créés via l'admin (même sans établissement ni profil)
  const { data: auditLogs } = await supabase
    .from("admin_audit_log")
    .select("entity_id")
    .eq("action", "pro.user.create")
    .eq("entity_type", "pro_user")
    .limit(5000);

  const proUserIdsFromAudit = (auditLogs ?? [])
    .map((log: any) => (typeof log.entity_id === "string" ? log.entity_id : ""))
    .filter(Boolean);

  // Ajouter les PROs sans établissement à la map
  const allProUserIds = new Set([...proUserIdsFromProfiles, ...proUserIdsFromAudit]);
  for (const userId of allProUserIds) {
    if (!byUser.has(userId)) {
      byUser.set(userId, {
        establishments: new Set<string>(),
        roles: {},
      });
    }
  }

  const userIds = Array.from(byUser.keys());

  let authById: Map<string, AuthUserRow>;
  try {
    authById = await fetchAuthUsersByIds({ supabase, userIds });
  } catch (e) {
    const msg = (e as any)?.message
      ? String((e as any).message)
      : "Auth lookup failed";
    return res.status(500).json({ error: msg });
  }

  const items: ProUserAdminRow[] = userIds.map((id) => {
    const agg = byUser.get(id);
    const au = authById.get(id) ?? null;
    return {
      id,
      email: au?.email ?? null,
      created_at: au?.created_at ?? null,
      last_sign_in_at: au?.last_sign_in_at ?? null,
      establishments_count: agg ? agg.establishments.size : 0,
      establishment_ids: agg ? Array.from(agg.establishments).sort() : [],
      roles: agg ? agg.roles : {},
    };
  });

  items.sort((a, b) => b.establishments_count - a.establishments_count);

  res.json({ items });
};

export const createProUser: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const payload = isRecord(req.body) ? req.body : {};
  const emailRaw = asString(payload.email);
  const email = emailRaw ? normalizeEmail(emailRaw) : "";
  const establishmentIds = asStringArray(payload.establishment_ids) ?? [];
  const role = asString(payload.role) ?? "owner";

  if (!email || !email.includes("@"))
    return res.status(400).json({ error: "Email requis" });

  const supabase = getAdminSupabase();
  const provisionalPassword = generateProvisionalPassword();

  const { data: createdUser, error: createUserErr } =
    await supabase.auth.admin.createUser({
      email,
      password: provisionalPassword,
      email_confirm: true,
    });

  if (createUserErr || !createdUser.user) {
    return res.status(400).json({
      error: translateErrorMessage(createUserErr?.message) ?? "Impossible de créer l'utilisateur",
    });
  }

  const userId = createdUser.user.id;

  // Créer une entrée dans pro_profiles pour que le Pro apparaisse dans les listes
  // Set must_change_password to force password change on first login
  const { error: profileErr } = await supabase
    .from("pro_profiles")
    .upsert(
      {
        user_id: userId,
        email,
        client_type: "A",
        must_change_password: true,
      },
      { onConflict: "user_id" }
    );

  if (profileErr) {
    console.error("Erreur création pro_profiles:", profileErr);
    // On continue même si ça échoue, le Pro est créé
  }

  if (establishmentIds.length) {
    const rows = establishmentIds.map((establishmentId) => ({
      establishment_id: establishmentId,
      user_id: userId,
      role,
    }));

    const { error: membershipErr } = await supabase
      .from("pro_establishment_memberships")
      .insert(rows);
    if (membershipErr) {
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: membershipErr.message });
    }
  }

  await supabase.from("admin_audit_log").insert({
    action: "pro.user.create",
    entity_type: "pro_user",
    entity_id: userId,
    metadata: { email, establishment_ids: establishmentIds, role },
  });

  // Send welcome email with provisional password
  const baseUrl = (process.env.PUBLIC_URL ?? "https://sortiraumaroc.com").replace(/\/+$/, "");
  const loginUrl = `${baseUrl}/pro`;

  // Get establishment name(s) for the welcome email
  let establishmentName = "votre établissement";
  if (establishmentIds.length) {
    const { data: estNames } = await supabase
      .from("establishments")
      .select("name")
      .in("id", establishmentIds)
      .limit(3);
    if (estNames && estNames.length > 0) {
      const names = estNames.map((e) => e.name).filter(Boolean);
      establishmentName = names.length > 1 ? names.join(", ") : (names[0] ?? "votre établissement");
    }
  }

  try {
    await sendTemplateEmail({
      templateKey: "pro_welcome_password",
      lang: "fr",
      fromKey: "pro",
      to: [email],
      variables: {
        email,
        password: provisionalPassword,
        establishment_name: establishmentName,
        login_url: loginUrl,
      },
    });
  } catch (emailErr) {
    console.error("[createProUser] Failed to send welcome email:", emailErr);
    // Continue even if email fails - we'll return the password anyway
  }

  res.json({
    owner: {
      email,
      user_id: userId,
      temporary_password: provisionalPassword,
    },
  });
};

export const listProUserMemberships: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  if (!userId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: memberships, error: memErr } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id,role")
    .eq("user_id", userId)
    .order("establishment_id", { ascending: true })
    .limit(500);

  if (memErr) return res.status(500).json({ error: memErr.message });

  const memRows = (memberships ?? []) as Array<{
    establishment_id: string;
    role: string;
  }>;
  const establishmentIds = memRows
    .map((m) =>
      typeof m.establishment_id === "string" ? m.establishment_id : "",
    )
    .filter(Boolean);

  let establishments: any[] = [];
  if (establishmentIds.length) {
    const { data: estData, error: estErr } = await supabase
      .from("establishments")
      .select("id,name,city,status,universe,subcategory,created_at")
      .in("id", establishmentIds)
      .limit(500);

    if (estErr) return res.status(500).json({ error: estErr.message });
    establishments = estData ?? [];
  }

  const estById = new Map<string, any>();
  for (const e of establishments) {
    if (e && typeof e.id === "string") estById.set(e.id, e);
  }

  const items: ProMembershipAdminRow[] = memRows.map((m) => ({
    establishment_id: m.establishment_id,
    role: m.role,
    establishment: estById.get(m.establishment_id) ?? null,
  }));

  res.json({ items });
};

export const setProUserMemberships: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  if (!userId) return res.status(400).json({ error: "Identifiant requis" });

  const payload = isRecord(req.body) ? req.body : {};
  const role = asString(payload.role) ?? "owner";
  const establishmentIdsRaw = asStringArray(payload.establishment_ids) ?? [];
  const establishmentIds = Array.from(
    new Set(establishmentIdsRaw.filter(Boolean)),
  );

  if (!establishmentIds.length) {
    return res.status(400).json({ error: "Identifiants d'établissements requis" });
  }

  const supabase = getAdminSupabase();

  const { data: existing, error: existingErr } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id")
    .eq("user_id", userId)
    .limit(2000);

  if (existingErr) return res.status(500).json({ error: existingErr.message });

  const existingIds = (existing ?? [])
    .map((r) =>
      r && typeof (r as any).establishment_id === "string"
        ? String((r as any).establishment_id)
        : "",
    )
    .filter(Boolean);

  const toRemove = existingIds.filter((id) => !establishmentIds.includes(id));

  const rows = establishmentIds.map((establishmentId) => ({
    establishment_id: establishmentId,
    user_id: userId,
    role,
  }));

  const { error: upsertErr } = await supabase
    .from("pro_establishment_memberships")
    .upsert(rows, { onConflict: "establishment_id,user_id" });

  if (upsertErr) return res.status(500).json({ error: upsertErr.message });

  if (toRemove.length) {
    const { error: delErr } = await supabase
      .from("pro_establishment_memberships")
      .delete()
      .eq("user_id", userId)
      .in("establishment_id", toRemove);

    if (delErr) return res.status(500).json({ error: delErr.message });
  }

  await supabase.from("admin_audit_log").insert({
    action: "pro.memberships.set",
    entity_type: "pro_user",
    entity_id: userId,
    metadata: {
      role,
      establishment_ids: establishmentIds,
      removed_ids: toRemove,
    },
  });

  res.json({
    ok: true,
    establishment_ids: establishmentIds,
    removed_ids: toRemove,
  });
};

/**
 * Suspend or reactivate a Pro user account
 * - Suspends: sets status to 'suspended', disables auth user
 * - Reactivates: sets status to 'active', re-enables auth user
 */
export const suspendProUser: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  if (!userId) return res.status(400).json({ error: "Identifiant utilisateur requis" });

  const payload = isRecord(req.body) ? req.body : {};
  const suspend = payload.suspend === true;
  const reason = asString(payload.reason) ?? null;
  const adminUserId = asString(payload.admin_user_id) ?? null;

  const supabase = getAdminSupabase();

  // Check if user exists
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
  if (authError || !authData.user) {
    return res.status(404).json({ error: "Utilisateur non trouvé" });
  }

  const email = authData.user.email ?? "";

  // Update pro_profiles status
  const profileUpdate: Record<string, unknown> = {
    status: suspend ? "suspended" : "active",
    updated_at: new Date().toISOString(),
  };

  if (suspend) {
    profileUpdate.suspended_at = new Date().toISOString();
    profileUpdate.suspended_by = adminUserId;
    profileUpdate.suspension_reason = reason;
  } else {
    profileUpdate.suspended_at = null;
    profileUpdate.suspended_by = null;
    profileUpdate.suspension_reason = null;
  }

  // Upsert pro_profile (create if doesn't exist)
  const { error: profileError } = await supabase
    .from("pro_profiles")
    .upsert(
      {
        user_id: userId,
        ...profileUpdate,
      },
      { onConflict: "user_id" }
    );

  if (profileError) {
    console.error("[suspendProUser] Profile update error:", profileError);
    return res.status(500).json({ error: profileError.message });
  }

  // Ban/unban the user in Supabase Auth
  // This prevents them from logging in
  const { error: banError } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: suspend ? "876000h" : "0h", // 100 years if suspended, 0 to unban
  });

  if (banError) {
    console.error("[suspendProUser] Auth ban error:", banError);
    // Don't fail - profile status was already updated
  }

  // Audit log
  await supabase.from("admin_audit_log").insert({
    action: suspend ? "pro.user.suspended" : "pro.user.reactivated",
    entity_type: "pro_user",
    entity_id: userId,
    metadata: {
      email,
      reason,
      by: adminUserId,
    },
  });

  res.json({
    ok: true,
    status: suspend ? "suspended" : "active",
    email,
  });
};

/**
 * Bulk delete Pro users permanently
 * - Deletes from pro_establishment_memberships
 * - Deletes from pro_profiles
 * - Deletes from Supabase Auth
 * - Logs to audit trail
 */
export const bulkDeleteProUsers: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const payload = isRecord(req.body) ? req.body : {};
  const ids = Array.isArray(payload.ids) ? payload.ids.filter((id): id is string => typeof id === "string") : [];
  const adminUserId = asString(payload.admin_user_id) ?? null;

  if (ids.length === 0) {
    return res.status(400).json({ error: "Aucun utilisateur sélectionné" });
  }

  if (ids.length > 50) {
    return res.status(400).json({ error: "Maximum 50 utilisateurs à la fois" });
  }

  const supabase = getAdminSupabase();
  const results: { id: string; email: string | null; success: boolean; error?: string }[] = [];

  for (const userId of ids) {
    try {
      // Get user info first
      const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
      const email = authData?.user?.email ?? null;

      if (authError) {
        results.push({ id: userId, email: null, success: false, error: "Utilisateur non trouvé" });
        continue;
      }

      // 1. Delete from pro_establishment_memberships
      const { error: membershipError } = await supabase
        .from("pro_establishment_memberships")
        .delete()
        .eq("user_id", userId);

      if (membershipError) {
        console.error(`[bulkDeleteProUsers] Membership delete error for ${userId}:`, membershipError);
      }

      // 2. Delete from pro_profiles
      const { error: profileError } = await supabase
        .from("pro_profiles")
        .delete()
        .eq("user_id", userId);

      if (profileError) {
        console.error(`[bulkDeleteProUsers] Profile delete error for ${userId}:`, profileError);
      }

      // 3. Delete from Supabase Auth
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);

      if (authDeleteError) {
        console.error(`[bulkDeleteProUsers] Auth delete error for ${userId}:`, authDeleteError);
        results.push({ id: userId, email, success: false, error: authDeleteError.message });
        continue;
      }

      // 4. Audit log
      await supabase.from("admin_audit_log").insert({
        action: "pro.user.deleted",
        entity_type: "pro_user",
        entity_id: userId,
        metadata: {
          email,
          by: adminUserId,
          permanent: true,
        },
      });

      results.push({ id: userId, email, success: true });
    } catch (err) {
      console.error(`[bulkDeleteProUsers] Unexpected error for ${userId}:`, err);
      results.push({ id: userId, email: null, success: false, error: "Erreur inattendue" });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  res.json({
    ok: true,
    deleted: successCount,
    failed: failureCount,
    results,
  });
};

/**
 * Regenerate password for a Pro user
 * - Generate a new provisional password
 * - Update the user in Supabase Auth
 * - Set must_change_password flag
 * - Send email with new password
 */
export const regenerateProUserPassword: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  if (!userId) return res.status(400).json({ error: "Identifiant utilisateur requis" });

  const supabase = getAdminSupabase();

  // Get user info first
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
  if (authError || !authData.user) {
    return res.status(404).json({ error: "Utilisateur non trouvé" });
  }

  const email = authData.user.email;
  if (!email) {
    return res.status(400).json({ error: "L'utilisateur n'a pas d'adresse email" });
  }

  // Generate new password
  const newPassword = generateProvisionalPassword();

  // Update password in Supabase Auth
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (updateError) {
    return res.status(500).json({ error: `Erreur lors de la mise à jour du mot de passe: ${updateError.message}` });
  }

  // Set must_change_password flag
  const { error: profileError } = await supabase
    .from("pro_profiles")
    .upsert(
      {
        user_id: userId,
        must_change_password: true,
      },
      { onConflict: "user_id" }
    );

  if (profileError) {
    console.error("[regenerateProUserPassword] Failed to set must_change_password:", profileError.message);
  }

  // Get establishment names for the email
  const { data: memberships } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id")
    .eq("user_id", userId)
    .limit(3);

  let establishmentName = "votre établissement";
  if (memberships && memberships.length > 0) {
    const estIds = memberships.map((m) => m.establishment_id);
    const { data: estNames } = await supabase
      .from("establishments")
      .select("name")
      .in("id", estIds)
      .limit(3);
    if (estNames && estNames.length > 0) {
      const names = estNames.map((e) => e.name).filter(Boolean);
      establishmentName = names.length > 1 ? names.join(", ") : (names[0] ?? "votre établissement");
    }
  }

  // Send email with new password
  const baseUrl = (process.env.PUBLIC_URL ?? "https://sortiraumaroc.com").replace(/\/+$/, "");
  const loginUrl = `${baseUrl}/pro`;

  try {
    await sendTemplateEmail({
      templateKey: "pro_password_reset",
      lang: "fr",
      fromKey: "pro",
      to: [email],
      variables: {
        email,
        password: newPassword,
        establishment_name: establishmentName,
        login_url: loginUrl,
      },
    });
  } catch (emailErr) {
    console.error("[regenerateProUserPassword] Failed to send email:", emailErr);
    // Continue - password was updated successfully
  }

  // Log the action
  await supabase.from("admin_audit_log").insert({
    action: "pro.user.password_regenerated",
    entity_type: "pro_user",
    entity_id: userId,
    metadata: { email },
  });

  // In development, also return the password for testing purposes
  const isDev = process.env.NODE_ENV !== "production";

  res.json({
    ok: true,
    message: "Nouveau mot de passe généré et envoyé par email",
    ...(isDev && { password: newPassword, email }),
  });
};

export const getEstablishment: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("establishments")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return res.status(404).json({ error: error.message });

  res.json({ item: data });
};

export const listAdminEstablishmentReservations: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("starts_at", { ascending: false })
    .limit(300);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as ReservationRow[] });
};

export const updateAdminEstablishmentReservation: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  const reservationId =
    typeof req.params.reservationId === "string"
      ? req.params.reservationId
      : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });
  if (!reservationId)
    return res.status(400).json({ error: "Identifiant de réservation requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const statusRaw = asString(req.body.status);
  const paymentStatusRaw = asString(req.body.payment_status);
  const checkedInAtRaw = asString(req.body.checked_in_at);
  const startsAtRaw =
    asString(req.body.starts_at) ?? asString(req.body.startsAt);

  const metaDeleteKeysRaw = Array.isArray(req.body.meta_delete_keys)
    ? req.body.meta_delete_keys
    : Array.isArray(req.body.metaDeleteKeys)
      ? req.body.metaDeleteKeys
      : null;

  const patch: Record<string, unknown> = {};

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
    if (!allowedStatuses.has(statusRaw))
      return res.status(400).json({ error: "status invalide" });
    patch.status = statusRaw;
  }

  if (paymentStatusRaw) {
    const allowedPayment = new Set(["pending", "paid", "refunded"]);
    if (!allowedPayment.has(paymentStatusRaw))
      return res.status(400).json({ error: "payment_status invalide" });
    patch.payment_status = paymentStatusRaw;
  }

  if (checkedInAtRaw !== undefined) {
    if (checkedInAtRaw === "") {
      patch.checked_in_at = null;
    } else {
      const d = new Date(checkedInAtRaw);
      if (!Number.isFinite(d.getTime()))
        return res.status(400).json({ error: "checked_in_at invalide" });
      patch.checked_in_at = d.toISOString();
    }
  }

  if (startsAtRaw !== undefined) {
    if (!startsAtRaw)
      return res.status(400).json({ error: "starts_at invalide" });
    const d = new Date(startsAtRaw);
    if (!Number.isFinite(d.getTime()))
      return res.status(400).json({ error: "starts_at invalide" });
    patch.starts_at = d.toISOString();
  }

  const supabase = getAdminSupabase();

  const { data: existing, error: existingErr } = await supabase
    .from("reservations")
    .select(
      "payment_status, status, slot_id, party_size, meta, starts_at, amount_deposit, user_id, checked_in_at",
    )
    .eq("id", reservationId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (!existing)
    return res.status(404).json({ error: "reservation introuvable" });

  const previousPaymentStatus = String(
    (existing as { payment_status?: unknown }).payment_status ?? "",
  );
  const previousStatus = String((existing as any)?.status ?? "");
  const slotId =
    typeof (existing as any)?.slot_id === "string"
      ? String((existing as any).slot_id)
      : null;
  const consumerUserId =
    typeof (existing as any)?.user_id === "string"
      ? String((existing as any).user_id).trim()
      : "";
  const previousCheckedInAt =
    typeof (existing as any)?.checked_in_at === "string"
      ? String((existing as any).checked_in_at).trim()
      : "";

  const metaBaseRaw = (existing as { meta?: unknown }).meta;
  const metaBase =
    metaBaseRaw &&
    typeof metaBaseRaw === "object" &&
    metaBaseRaw !== null &&
    !Array.isArray(metaBaseRaw)
      ? (metaBaseRaw as Record<string, unknown>)
      : {};
  const nextMeta = { ...metaBase };

  const allowedMetaKeys = new Set([
    "modification_requested",
    "requested_change",
    "proposed_change",
  ]);

  if (metaDeleteKeysRaw) {
    for (const kRaw of metaDeleteKeysRaw) {
      const k = typeof kRaw === "string" ? kRaw : "";
      if (!k || !allowedMetaKeys.has(k)) continue;
      delete nextMeta[k];
    }

    // Only set meta if something changed (avoid noisy writes)
    if (Object.keys(nextMeta).length !== Object.keys(metaBase).length) {
      patch.meta = nextMeta;
    }
  }

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const { error } = await supabase
    .from("reservations")
    .update(patch)
    .eq("id", reservationId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "reservation.update",
    entity_type: "reservation",
    entity_id: reservationId,
    metadata: { establishment_id: establishmentId, patch },
  });

  if (paymentStatusRaw && paymentStatusRaw !== previousPaymentStatus) {
    await supabase.from("system_logs").insert({
      actor_user_id: null,
      actor_role: "admin",
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
        category: "billing",
        title,
        body: `Réservation ${reservationId} · ${previousPaymentStatus} → ${paymentStatusRaw}`,
        data: {
          reservationId,
          action: "payment_status_changed",
          previous: previousPaymentStatus,
          next: paymentStatusRaw,
        },
      }));

      if (out.length) await supabase.from("pro_notifications").insert(out);
    } catch {
      // ignore
    }
  }

  // Finance pipeline (escrow/ledger)
  try {
    const actor = { userId: null, role: "admin" };

    if (
      paymentStatusRaw &&
      paymentStatusRaw !== previousPaymentStatus &&
      paymentStatusRaw === "paid"
    ) {
      await ensureEscrowHoldForReservation({ reservationId, actor });
      await ensureInvoiceForReservation({ reservationId, actor });
    }

    const cancelStatuses = new Set([
      "cancelled",
      "cancelled_user",
      "cancelled_pro",
      "refused",
      "waitlist",
    ]);

    const existingDepositCents =
      typeof (existing as any)?.amount_deposit === "number" &&
      Number.isFinite((existing as any).amount_deposit)
        ? Math.max(0, Math.round((existing as any).amount_deposit))
        : 0;

    const computeCancelRefundPercent = async (): Promise<number> => {
      const defaults = {
        free_cancellation_hours: 24,
        cancellation_penalty_percent: 50,
      };

      let freeHours = defaults.free_cancellation_hours;
      let penaltyPct = defaults.cancellation_penalty_percent;

      try {
        const { data: policyRow } = await supabase
          .from("booking_policies")
          .select("free_cancellation_hours,cancellation_penalty_percent")
          .eq("establishment_id", establishmentId)
          .maybeSingle();

        if (typeof (policyRow as any)?.free_cancellation_hours === "number") {
          freeHours = Math.max(
            0,
            Math.round((policyRow as any).free_cancellation_hours),
          );
        }

        if (
          typeof (policyRow as any)?.cancellation_penalty_percent === "number"
        ) {
          penaltyPct = Math.min(
            100,
            Math.max(
              0,
              Math.round((policyRow as any).cancellation_penalty_percent),
            ),
          );
        }
      } catch {
        // ignore
      }

      const startsAtIso =
        typeof (existing as any)?.starts_at === "string"
          ? String((existing as any).starts_at)
          : "";
      const startsAt = startsAtIso ? new Date(startsAtIso) : null;
      const hoursToStart =
        startsAt && Number.isFinite(startsAt.getTime())
          ? (startsAt.getTime() - Date.now()) / (1000 * 60 * 60)
          : Number.POSITIVE_INFINITY;

      return hoursToStart >= freeHours ? 100 : Math.max(0, 100 - penaltyPct);
    };

    const computeNoShowRefundPercent = async (): Promise<number> => {
      const defaults = {
        no_show_penalty_percent: 100,
        no_show_always_100_guaranteed: true,
      };

      let penaltyPct = defaults.no_show_penalty_percent;
      let always100Guaranteed = defaults.no_show_always_100_guaranteed;

      try {
        const { data: policyRow } = await supabase
          .from("booking_policies")
          .select("no_show_penalty_percent,no_show_always_100_guaranteed")
          .eq("establishment_id", establishmentId)
          .maybeSingle();

        if (typeof (policyRow as any)?.no_show_penalty_percent === "number") {
          penaltyPct = Math.min(
            100,
            Math.max(0, Math.round((policyRow as any).no_show_penalty_percent)),
          );
        }

        if (
          typeof (policyRow as any)?.no_show_always_100_guaranteed === "boolean"
        ) {
          always100Guaranteed = (policyRow as any)
            .no_show_always_100_guaranteed;
        }
      } catch {
        // ignore
      }

      if (always100Guaranteed && existingDepositCents > 0) penaltyPct = 100;

      return Math.max(0, 100 - penaltyPct);
    };

    if (
      paymentStatusRaw &&
      paymentStatusRaw !== previousPaymentStatus &&
      paymentStatusRaw === "refunded"
    ) {
      // Explicit refund => always full refund.
      await settleEscrowForReservation({
        reservationId,
        actor,
        reason: "cancel",
        refundPercent: 100,
      });
    }

    if (statusRaw && cancelStatuses.has(statusRaw)) {
      const refundPercentForCancel = statusRaw.startsWith("cancelled")
        ? await computeCancelRefundPercent()
        : 100;
      await settleEscrowForReservation({
        reservationId,
        actor,
        reason: "cancel",
        refundPercent: refundPercentForCancel,
      });
    }

    if (statusRaw === "noshow") {
      const refundPercentForNoShow = await computeNoShowRefundPercent();
      await settleEscrowForReservation({
        reservationId,
        actor,
        reason: "noshow",
        refundPercent: refundPercentForNoShow,
      });
    }

    if (checkedInAtRaw && checkedInAtRaw !== "") {
      await settleEscrowForReservation({
        reservationId,
        actor,
        reason: "checkin",
      });
    }
  } catch (e) {
    console.error("finance pipeline failed (admin.updateReservation)", e);
  }

  // NEW: auto-promotion waitlist logic
  try {
    const occupancy = new Set([
      "confirmed",
      "pending_pro_validation",
      "requested",
    ]);
    const prevOccupies = occupancy.has(previousStatus);

    const nextStatus = statusRaw ? statusRaw : previousStatus;
    const nextOccupies = occupancy.has(nextStatus);

    if (slotId && prevOccupies && !nextOccupies) {
      void triggerWaitlistPromotionForSlot({
        supabase: supabase as any,
        slotId,
        actorRole: "admin",
        actorUserId: null,
        reason: "admin_update_freed_capacity",
      });
    }
  } catch {
    // ignore
  }

  // Reliability stats (v1): recompute after a no-show or a first check-in.
  // Best-effort: do not block admin operations.
  try {
    const nextCheckedInAt = Object.prototype.hasOwnProperty.call(
      patch,
      "checked_in_at",
    )
      ? (patch as any).checked_in_at
      : null;
    const hasFirstCheckin = !!nextCheckedInAt && !previousCheckedInAt;

    const shouldRecompute =
      !!consumerUserId &&
      ((statusRaw && statusRaw !== previousStatus && statusRaw === "noshow") ||
        hasFirstCheckin);

    if (shouldRecompute) {
      await recomputeConsumerUserStatsV1({ supabase, userId: consumerUserId });
    }
  } catch {
    // ignore
  }

  res.json({ ok: true });
};

export const listAdminFinanceDiscrepancies: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const statusRaw =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "open";
  const severityRaw =
    typeof req.query.severity === "string"
      ? req.query.severity.trim().toLowerCase()
      : "all";

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const allowedStatus = new Set(["open", "acknowledged", "resolved", "all"]);
  const allowedSeverity = new Set(["low", "medium", "high", "all"]);

  const status = allowedStatus.has(statusRaw) ? statusRaw : "open";
  const severity = allowedSeverity.has(severityRaw) ? severityRaw : "all";

  const supabase = getAdminSupabase();

  let q = supabase
    .from("finance_reconciliation_discrepancies")
    .select(
      "id,created_at,entity_type,entity_id,kind,expected_amount_cents,actual_amount_cents,currency,severity,status,opened_at,resolved_at,notes,metadata",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") q = q.eq("status", status);
  if (severity !== "all") q = q.eq("severity", severity);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

export const updateAdminFinanceDiscrepancy: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const statusRaw = asString(req.body.status);
  const notesRaw = asString(req.body.notes);

  const allowedStatus = new Set(["open", "acknowledged", "resolved"]);
  if (statusRaw && !allowedStatus.has(statusRaw))
    return res.status(400).json({ error: "status invalide" });

  const patch: Record<string, unknown> = {};
  if (statusRaw) patch.status = statusRaw;
  if (notesRaw !== undefined) patch.notes = notesRaw || null;
  if (statusRaw === "resolved") patch.resolved_at = new Date().toISOString();

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("finance_reconciliation_discrepancies")
    .update(patch)
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "finance.discrepancy.update",
    entity_type: "finance.reconciliation_discrepancies",
    entity_id: id,
    metadata: { patch },
  });

  res.json({ ok: true });
};

export const runAdminFinanceReconciliation: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const supabase = getAdminSupabase();

  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("id,status,payment_status,checked_in_at,amount_deposit")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });

  const actor = { userId: null, role: "system:reconcile" };
  const cancelStatuses = new Set([
    "cancelled",
    "cancelled_user",
    "cancelled_pro",
    "refused",
    "waitlist",
  ]);

  let holdsEnsured = 0;
  let settlesAttempted = 0;
  let errorsCount = 0;

  for (const row of (reservations ?? []) as Array<any>) {
    const reservationId = String(row?.id ?? "");
    if (!reservationId) continue;

    const deposit =
      typeof row?.amount_deposit === "number" &&
      Number.isFinite(row.amount_deposit)
        ? Math.round(row.amount_deposit)
        : 0;
    const payment = String(row?.payment_status ?? "").toLowerCase();
    const status = String(row?.status ?? "").toLowerCase();
    const checkedInAt = row?.checked_in_at ? String(row.checked_in_at) : null;

    try {
      if (deposit > 0 && payment === "paid") {
        await ensureEscrowHoldForReservation({ reservationId, actor });
        holdsEnsured++;
      }

      if (deposit > 0) {
        if (checkedInAt) {
          await settleEscrowForReservation({
            reservationId,
            actor,
            reason: "checkin",
          });
          settlesAttempted++;
        } else if (status === "noshow") {
          await settleEscrowForReservation({
            reservationId,
            actor,
            reason: "noshow",
          });
          settlesAttempted++;
        } else if (payment === "refunded" || cancelStatuses.has(status)) {
          await settleEscrowForReservation({
            reservationId,
            actor,
            reason: "cancel",
          });
          settlesAttempted++;
        }
      }
    } catch (e) {
      errorsCount++;
      console.error("reconciliation failed", { reservationId }, e);
    }
  }

  await supabase.from("admin_audit_log").insert({
    action: "finance.reconcile.run",
    entity_type: "finance.reconciliation_discrepancies",
    entity_id: null,
    metadata: { limit, holdsEnsured, settlesAttempted, errorsCount },
  });

  res.json({ ok: true, limit, holdsEnsured, settlesAttempted, errorsCount });
};

export const listAdminFinancePayouts: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const statusRaw =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "pending";
  const establishmentId =
    typeof req.query.establishment_id === "string"
      ? req.query.establishment_id.trim()
      : "";
  const currency =
    typeof req.query.currency === "string"
      ? req.query.currency.trim().toUpperCase()
      : "";

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const allowedStatus = new Set([
    "pending",
    "processing",
    "sent",
    "failed",
    "cancelled",
    "all",
  ]);
  const status = allowedStatus.has(statusRaw) ? statusRaw : "pending";

  const supabase = getAdminSupabase();

  let q = supabase
    .from("finance_payouts")
    .select(
      "id,created_at,requested_at,processed_at,establishment_id,amount_cents,currency,status,provider,provider_reference,failure_reason,idempotency_key,metadata",
    )
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (status !== "all") q = q.eq("status", status);
  if (establishmentId) q = q.eq("establishment_id", establishmentId);
  if (currency) q = q.eq("currency", currency);

  const { data: payouts, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const establishmentIds = Array.from(
    new Set(
      ((payouts ?? []) as Array<any>)
        .map((p) => String(p?.establishment_id ?? ""))
        .filter(Boolean),
    ),
  );

  let establishmentsById = new Map<
    string,
    { id: string; name: string | null; city: string | null }
  >();
  if (establishmentIds.length) {
    const { data: ests, error: estErr } = await supabase
      .from("establishments")
      .select("id,name,city")
      .in("id", establishmentIds)
      .limit(1000);

    if (!estErr) {
      establishmentsById = new Map(
        ((ests ?? []) as Array<any>)
          .map((row) => ({
            id: String(row?.id ?? ""),
            name: row?.name == null ? null : String(row.name),
            city: row?.city == null ? null : String(row.city),
          }))
          .filter((x) => x.id)
          .map((x) => [x.id, x] as const),
      );
    }
  }

  const items = ((payouts ?? []) as Array<any>).map((row) => {
    const estId = String(row?.establishment_id ?? "");
    return {
      ...row,
      establishment: estId ? (establishmentsById.get(estId) ?? null) : null,
    };
  });

  res.json({ ok: true, items });
};

export const updateAdminFinancePayout: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const statusRaw = asString(req.body.status);
  const providerRaw = asString(req.body.provider);
  const providerRefRaw = asString(req.body.provider_reference);
  const failureReasonRaw = asString(req.body.failure_reason);
  const metadataRaw = asJsonObject(req.body.metadata);

  const allowedStatus = new Set([
    "pending",
    "processing",
    "sent",
    "failed",
    "cancelled",
  ]);
  if (statusRaw && !allowedStatus.has(statusRaw))
    return res.status(400).json({ error: "status invalide" });

  const patch: Record<string, unknown> = {};
  if (statusRaw) patch.status = statusRaw;
  if (providerRaw !== undefined) patch.provider = providerRaw || null;
  if (providerRefRaw !== undefined)
    patch.provider_reference = providerRefRaw || null;
  if (failureReasonRaw !== undefined)
    patch.failure_reason = failureReasonRaw || null;
  if (metadataRaw !== undefined)
    patch.metadata = Object.keys(metadataRaw).length ? metadataRaw : null;

  if (
    statusRaw &&
    (statusRaw === "sent" ||
      statusRaw === "failed" ||
      statusRaw === "cancelled")
  ) {
    patch.processed_at = new Date().toISOString();
  }

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("finance_payouts")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) return res.status(500).json({ error: error.message });
  if (!data || !Array.isArray(data) || !data.length)
    return res.status(404).json({ error: "Introuvable" });

  await supabase.from("admin_audit_log").insert({
    action: "finance.payout.update",
    entity_type: "finance.payouts",
    entity_id: id,
    metadata: { patch },
  });

  if (statusRaw === "failed") {
    void emitAdminNotification({
      type: "payout_failed",
      title: "Paiement échoué",
      body: `Payout ${id}${failureReasonRaw ? ` · ${failureReasonRaw}` : ""}`,
      data: {
        payoutId: id,
        status: statusRaw,
        failureReason: failureReasonRaw ?? null,
      },
    });
  }

  res.json({ ok: true });
};

type AdminUnifiedLogItem = {
  id: string;
  created_at: string;
  source: "admin" | "system";
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_user_id?: string | null;
  actor_role?: string | null;
  details: unknown;
};

function asEmailSenderKey(v: unknown): SambookingSenderKey | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (
    s === "hello" ||
    s === "support" ||
    s === "pro" ||
    s === "finance" ||
    s === "no-reply"
  )
    return s;
  return null;
}

function splitEmails(raw: unknown): string[] {
  const s = typeof raw === "string" ? raw : "";
  return s
    .split(/[,;\n]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function clampText(v: unknown, max: number): string {
  const s = typeof v === "string" ? v : "";
  return s.length > max ? s.slice(0, max) : s;
}

export const listAdminLogs: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const sourceRaw =
    typeof req.query.source === "string"
      ? req.query.source.trim().toLowerCase()
      : "all";
  const entityType =
    typeof req.query.entity_type === "string"
      ? req.query.entity_type.trim()
      : "";
  const entityId =
    typeof req.query.entity_id === "string" ? req.query.entity_id.trim() : "";
  const actionFilter =
    typeof req.query.action === "string" ? req.query.action.trim() : "";

  const limit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const safeLimit = Number.isFinite(limit)
    ? Math.min(500, Math.max(1, Math.floor(limit)))
    : 200;

  const internalLimit = Math.min(1000, safeLimit * 2);

  const supabase = getAdminSupabase();

  const fetchAdmin = async () => {
    let q = supabase
      .from("admin_audit_log")
      .select("id,created_at,action,entity_type,entity_id,metadata")
      .order("created_at", { ascending: false })
      .limit(internalLimit);

    if (entityType) q = q.eq("entity_type", entityType);
    if (entityId) q = q.eq("entity_id", entityId);
    if (actionFilter) q = q.ilike("action", `%${actionFilter}%`);

    return q;
  };

  const fetchSystem = async () => {
    let q = supabase
      .from("system_logs")
      .select(
        "id,created_at,action,entity_type,entity_id,actor_user_id,actor_role,payload",
      )
      .order("created_at", { ascending: false })
      .limit(internalLimit);

    if (entityType) q = q.eq("entity_type", entityType);
    if (entityId) q = q.eq("entity_id", entityId);
    if (actionFilter) q = q.ilike("action", `%${actionFilter}%`);

    return q;
  };

  const wantAdmin = sourceRaw === "all" || sourceRaw === "admin";
  const wantSystem = sourceRaw === "all" || sourceRaw === "system";

  const [
    { data: adminRows, error: adminErr },
    { data: systemRows, error: systemErr },
  ] = await Promise.all([
    wantAdmin
      ? fetchAdmin()
      : Promise.resolve({ data: [], error: null } as any),
    wantSystem
      ? fetchSystem()
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (adminErr) return res.status(500).json({ error: adminErr.message });
  if (systemErr) return res.status(500).json({ error: systemErr.message });

  const adminItems: AdminUnifiedLogItem[] = (
    (adminRows ?? []) as Array<any>
  ).map((row) => ({
    id: String(row.id ?? ""),
    created_at: String(row.created_at ?? ""),
    source: "admin",
    action: String(row.action ?? ""),
    entity_type: row.entity_type == null ? null : String(row.entity_type),
    entity_id: row.entity_id == null ? null : String(row.entity_id),
    details: row.metadata ?? null,
  }));

  const systemItems: AdminUnifiedLogItem[] = (
    (systemRows ?? []) as Array<any>
  ).map((row) => ({
    id: String(row.id ?? ""),
    created_at: String(row.created_at ?? ""),
    source: "system",
    action: String(row.action ?? ""),
    entity_type: row.entity_type == null ? null : String(row.entity_type),
    entity_id: row.entity_id == null ? null : String(row.entity_id),
    actor_user_id: row.actor_user_id == null ? null : String(row.actor_user_id),
    actor_role: row.actor_role == null ? null : String(row.actor_role),
    details: row.payload ?? null,
  }));

  const items = [...adminItems, ...systemItems]
    .filter((x) => x.id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, safeLimit);

  res.json({ ok: true, items });
};

export const sendAdminTestEmail: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const fromKey = asEmailSenderKey(req.body?.from);
  if (!fromKey)
    return res.status(400).json({ ok: false, error: "Expéditeur invalide" });

  const toList = splitEmails(req.body?.to);
  if (!toList.length || !toList.every(isEmailAddress)) {
    return res
      .status(400)
      .json({ ok: false, error: "Email destinataire invalide" });
  }

  const subject = clampText(req.body?.subject, 160) || "Test email";
  const bodyText =
    clampText(req.body?.message, 4000) ||
    "Bonjour,\n\nCeci est un email de test Sortir Au Maroc.";

  const ctaLabel = clampText(req.body?.cta_label, 60) || null;
  const ctaUrl = clampText(req.body?.cta_url, 500) || null;

  const emailId = randomBytes(16).toString("hex");

  const actorSub = getAdminSessionSubAny(req) ?? "admin_key";
  const supabase = getAdminSupabase();

  const meta = {
    email_id: emailId,
    from_key: fromKey,
    to: toList,
    subject,
    cta_label: ctaLabel,
    cta_url: ctaUrl,
    actor: actorSub,
  };

  const rendered = await renderSambookingEmail({
    emailId,
    fromKey,
    to: toList,
    subject,
    bodyText,
    ctaLabel,
    ctaUrl,
    variables: {
      date: new Date().toISOString(),
    },
  });

  await supabase.from("system_logs").insert({
    actor_user_id: null,
    actor_role: "admin",
    action: "email.queued",
    entity_type: "email",
    entity_id: emailId,
    payload: {
      ...meta,
      html: rendered.html.slice(0, 50_000),
      text: rendered.text.slice(0, 20_000),
    },
  });

  try {
    const sent = await sendSambookingEmail({
      emailId,
      fromKey,
      to: toList,
      subject,
      bodyText,
      ctaLabel,
      ctaUrl,
      variables: {
        date: new Date().toISOString(),
      },
    });

    await supabase.from("system_logs").insert({
      actor_user_id: null,
      actor_role: "admin",
      action: "email.sent",
      entity_type: "email",
      entity_id: emailId,
      payload: { ...meta, message_id: sent.messageId || null },
    });

    return res.json({
      ok: true,
      email_id: emailId,
      message_id: sent.messageId || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Erreur email");

    await supabase.from("system_logs").insert({
      actor_user_id: null,
      actor_role: "admin",
      action: "email.failed",
      entity_type: "email",
      entity_id: emailId,
      payload: { ...meta, error: msg },
    });

    void emitAdminNotification({
      type: "email_failed",
      title: "Email échoué",
      body: `${fromKey} → ${toList.join(", ")} · ${subject}`,
      data: { emailId, error: msg },
    });

    return res.status(503).json({ ok: false, email_id: emailId, error: msg });
  }
};

// ---------------------------------------------------------------------------
// Superadmin settings (Paramètres)
// ---------------------------------------------------------------------------

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

function getAdminSessionSubAny(
  req: Parameters<RequestHandler>[0],
): string | null {
  const session = getAdminSessionToken(req);
  if (!session) return null;
  const payload = verifyAdminSessionToken(session.token);
  return payload?.sub ?? null;
}

export function requireSuperadmin(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): boolean {
  if (!requireAdminKey(req, res)) return false;

  // API key-based access is treated as superadmin.
  const headerKey = req.header("x-admin-key") ?? undefined;
  if (checkAdminKey(headerKey)) return true;

  // Check if the session has superadmin role
  const session = (req as any).adminSession;
  if (session?.role === "superadmin") return true;

  // Legacy check: if ADMIN_DASHBOARD_USERNAME is set, allow that specific user
  const cfgUsername = process.env.ADMIN_DASHBOARD_USERNAME?.trim();
  if (cfgUsername) {
    const sub = getAdminSessionSubAny(req);
    if (sub === cfgUsername) return true;
  }

  res.status(403).json({ error: "Accès refusé" });
  return false;
}

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
const DEFAULT_FINANCE_RULES: FinanceRulesRow = {
  id: 1,
  commission_rate_percent: 0,
  vat_rate_percent: 20,
  min_payout_amount_cents: 10000,
  payout_delay_days: 7,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const DEFAULT_RESERVATION_RULES: ReservationRulesRow = {
  id: 1,
  max_party_size: 20,
  min_advance_hours: 2,
  max_advance_days: 90,
  cancellation_deadline_hours: 24,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const getAdminSettingsSnapshot: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const supabase = getAdminSupabase();

  // Use Promise.allSettled to handle partial failures gracefully
  const [citiesRes, categoriesRes, financeRes, reservationRes, flagsRes] =
    await Promise.all([
      supabase
        .from("admin_cities")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(500)
        .then((r) => ({ data: r.data, error: r.error }))
        .catch(() => ({ data: null, error: null })),
      supabase
        .from("admin_categories")
        .select("*")
        .order("universe", { ascending: true })
        .order("sort_order", { ascending: true })
        .limit(2000)
        .then((r) => ({ data: r.data, error: r.error }))
        .catch(() => ({ data: null, error: null })),
      supabase
        .from("finance_rules")
        .select("*")
        .eq("id", 1)
        .single()
        .then((r) => ({ data: r.data, error: r.error }))
        .catch(() => ({ data: null, error: null })),
      supabase
        .from("reservation_rules")
        .select("*")
        .eq("id", 1)
        .single()
        .then((r) => ({ data: r.data, error: r.error }))
        .catch(() => ({ data: null, error: null })),
      supabase
        .from("admin_feature_flags")
        .select("*")
        .order("label", { ascending: true })
        .limit(200)
        .then((r) => ({ data: r.data, error: r.error }))
        .catch(() => ({ data: null, error: null })),
    ]);

  // Log errors but don't fail - use defaults instead
  if (citiesRes.error) {
    console.warn("[getAdminSettingsSnapshot] cities error:", citiesRes.error.message);
  }
  if (categoriesRes.error) {
    console.warn("[getAdminSettingsSnapshot] categories error:", categoriesRes.error.message);
  }
  if (financeRes.error) {
    console.warn("[getAdminSettingsSnapshot] finance_rules error:", financeRes.error.message);
  }
  if (reservationRes.error) {
    console.warn("[getAdminSettingsSnapshot] reservation_rules error:", reservationRes.error.message);
  }
  if (flagsRes.error) {
    console.warn("[getAdminSettingsSnapshot] feature_flags error:", flagsRes.error.message);
  }

  let billing_company_profile: BillingCompanyProfile | null = null;
  try {
    billing_company_profile = await getBillingCompanyProfile();
  } catch (e) {
    console.warn(
      "[getAdminSettingsSnapshot] billing_company_profile unavailable",
      e,
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

  await supabase.from("admin_audit_log").insert({
    action: "settings.billing_company_profile.update",
    entity_type: "billing_company_profile",
    entity_id: "default",
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor: getAdminSessionSubAny(req),
    },
  });

  invalidateBillingCompanyProfileCache();

  let profile: BillingCompanyProfile | null = null;
  try {
    profile = await getBillingCompanyProfile();
  } catch (e) {
    console.error("updateAdminBillingCompanyProfile: failed to refetch", e);
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

  await supabase.from("admin_audit_log").insert({
    action: "settings.cities.create",
    entity_type: "admin_cities",
    entity_id: (data as any)?.id ?? null,
    metadata: { after: data, actor: getAdminSessionSubAny(req) },
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

  await supabase.from("admin_audit_log").insert({
    action: "settings.cities.update",
    entity_type: "admin_cities",
    entity_id: id,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor: getAdminSessionSubAny(req),
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

  await supabase.from("admin_audit_log").insert({
    action: "settings.cities.delete",
    entity_type: "admin_cities",
    entity_id: id,
    metadata: { before: beforeRow ?? null, actor: getAdminSessionSubAny(req) },
  });

  res.json({ ok: true });
};

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

  await supabase.from("admin_audit_log").insert({
    action: "settings.categories.create",
    entity_type: "admin_categories",
    entity_id: (data as any)?.id ?? null,
    metadata: { after: data, actor: getAdminSessionSubAny(req) },
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

  await supabase.from("admin_audit_log").insert({
    action: "settings.categories.update",
    entity_type: "admin_categories",
    entity_id: id,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor: getAdminSessionSubAny(req),
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

  await supabase.from("admin_audit_log").insert({
    action: "settings.categories.delete",
    entity_type: "admin_categories",
    entity_id: id,
    metadata: { before: beforeRow ?? null, actor: getAdminSessionSubAny(req) },
  });

  res.json({ ok: true });
};

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

  await supabase.from("admin_audit_log").insert({
    action: "settings.categories.apply_universe_commission",
    entity_type: "admin_categories",
    entity_id: null,
    metadata: {
      universe,
      commission_percent: commission,
      affected: (data ?? []).length,
      actor: getAdminSessionSubAny(req),
    },
  });

  res.json({ ok: true, affected: (data ?? []).length });
};

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

  await supabase.from("admin_audit_log").insert({
    action: "settings.finance_rules.update",
    entity_type: "finance_rules",
    entity_id: null,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor: getAdminSessionSubAny(req),
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

  await supabase.from("admin_audit_log").insert({
    action: "settings.reservation_rules.update",
    entity_type: "reservation_rules",
    entity_id: null,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor: getAdminSessionSubAny(req),
    },
  });

  res.json({ ok: true, item: data as ReservationRulesRow });
};

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

  await supabase.from("admin_audit_log").insert({
    action: "settings.feature_flags.update",
    entity_type: "admin_feature_flags",
    entity_id: null,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor: getAdminSessionSubAny(req),
      key,
    },
  });

  res.json({ ok: true, item: data as FeatureFlagRow });
};

export const listAdminEstablishmentOffers: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const [{ data: slots, error: slotsErr }, { data: packs, error: packsErr }] =
    await Promise.all([
      supabase
        .from("pro_slots")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("starts_at", { ascending: true })
        .limit(500),
      supabase
        .from("packs")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  if (slotsErr) return res.status(500).json({ error: slotsErr.message });
  if (packsErr) return res.status(500).json({ error: packsErr.message });

  res.json({ ok: true, slots: slots ?? [], packs: packs ?? [] });
};

export const listAdminEstablishmentQrLogs: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("qr_scan_logs")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("scanned_at", { ascending: false })
    .limit(300);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as QrScanLogRow[] });
};

export const listAdminEstablishmentPackBilling: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const [{ data: purchases, error: pErr }, { data: redemptions, error: rErr }] =
    await Promise.all([
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

  res.json({
    ok: true,
    purchases: purchases ?? [],
    redemptions: redemptions ?? [],
  });
};

// ---------------------------------------------------------------------------
// Visibilité (SAM Media) - offers + orders
// ---------------------------------------------------------------------------

type VisibilityOfferInput = {
  title?: unknown;
  description?: unknown;
  type?: unknown;
  deliverables?: unknown;
  duration_days?: unknown;
  price_cents?: unknown;
  currency?: unknown;
  active?: unknown;
  allow_quantity?: unknown;
  tax_rate_bps?: unknown;
  tax_label?: unknown;
  display_order?: unknown;
};

function safeInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return 0;
}

function safeString(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function safeCurrency(v: unknown): string {
  const c = typeof v === "string" ? v.trim().toUpperCase() : "";
  return c || "MAD";
}

function normalizeMediaPaymentMethod(v: unknown): "card" | "bank_transfer" {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "card" || s === "cb" || s === "credit_card") return "card";
  if (s === "bank_transfer" || s === "virement" || s === "transfer")
    return "bank_transfer";
  return "bank_transfer";
}

function normalizeOfferType(
  v: unknown,
): "pack" | "option" | "menu_digital" | "media_video" | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (
    s === "pack" ||
    s === "option" ||
    s === "menu_digital" ||
    s === "media_video"
  )
    return s;
  return null;
}

function parseDeliverables(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const it of v) {
    const s = typeof it === "string" ? it.trim() : "";
    if (!s) continue;
    out.push(s);
  }
  return out.slice(0, 50);
}

export const listAdminVisibilityOffers: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  const includeDeleted =
    typeof req.query.include_deleted === "string"
      ? req.query.include_deleted === "true"
      : false;

  let q = supabase
    .from("visibility_offers")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);

  if (!includeDeleted) q = q.is("deleted_at", null);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, offers: data ?? [] });
};

export const createAdminVisibilityOffer: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const body = req.body as VisibilityOfferInput;

  const title = safeString(body.title);
  const type = normalizeOfferType(body.type);

  if (!title) return res.status(400).json({ error: "Titre requis" });
  if (!type)
    return res.status(400).json({
      error: "type must be one of: pack, option, menu_digital, media_video",
    });

  const priceCentsRaw =
    body.price_cents === null ? null : safeInt(body.price_cents);
  const priceCents = priceCentsRaw === null ? null : Math.max(0, priceCentsRaw);
  const currency = safeCurrency(body.currency);

  const active = typeof body.active === "boolean" ? body.active : false;

  // Validation: no active offer without a positive price.
  if (active && (!priceCents || priceCents <= 0)) {
    return res.status(400).json({ error: "active_offer_requires_price" });
  }

  const payload: Record<string, unknown> = {
    title,
    description: safeString(body.description),
    type,
    deliverables: parseDeliverables(body.deliverables),
    duration_days:
      body.duration_days === null
        ? null
        : Math.max(0, safeInt(body.duration_days)) || null,
    price_cents: priceCents,
    currency,
    allow_quantity:
      typeof body.allow_quantity === "boolean" ? body.allow_quantity : false,
    tax_rate_bps: Math.max(0, safeInt(body.tax_rate_bps)),
    tax_label: safeString(body.tax_label) ?? "TVA",
    active,
    display_order: safeInt(body.display_order),
  };

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("visibility_offers")
    .insert(payload)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "visibility.offer.create",
    entity_type: "visibility_offers",
    entity_id: (data as any)?.id ?? null,
    metadata: { after: data, actor: getAdminSessionSubAny(req) },
  });

  res.json({ ok: true, offer: data });
};

export const updateAdminVisibilityOffer: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const offerId = typeof req.params.id === "string" ? req.params.id : "";
  if (!offerId) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const body = req.body as VisibilityOfferInput;

  const supabase = getAdminSupabase();

  const { data: beforeRow, error: beforeErr } = await supabase
    .from("visibility_offers")
    .select("*")
    .eq("id", offerId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!beforeRow) return res.status(404).json({ error: "offer_not_found" });

  const patch: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = safeString(body.title);
    if (!title) return res.status(400).json({ error: "Titre requis" });
    patch.title = title;
  }

  if (body.description !== undefined)
    patch.description = safeString(body.description);

  if (body.type !== undefined) {
    const type = normalizeOfferType(body.type);
    if (!type)
      return res.status(400).json({
        error: "type must be one of: pack, option, menu_digital, media_video",
      });
    patch.type = type;
  }

  if (body.deliverables !== undefined)
    patch.deliverables = parseDeliverables(body.deliverables);

  if (body.duration_days !== undefined) {
    patch.duration_days =
      body.duration_days === null
        ? null
        : Math.max(0, safeInt(body.duration_days)) || null;
  }

  if (body.price_cents !== undefined) {
    patch.price_cents =
      body.price_cents === null ? null : Math.max(0, safeInt(body.price_cents));
  }

  if (body.currency !== undefined) patch.currency = safeCurrency(body.currency);

  if (body.allow_quantity !== undefined)
    patch.allow_quantity = Boolean(body.allow_quantity);

  if (body.tax_rate_bps !== undefined)
    patch.tax_rate_bps = Math.max(0, safeInt(body.tax_rate_bps));
  if (body.tax_label !== undefined)
    patch.tax_label = safeString(body.tax_label) ?? "TVA";

  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.display_order !== undefined)
    patch.display_order = safeInt(body.display_order);

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const nextActive =
    typeof patch.active === "boolean"
      ? patch.active
      : Boolean((beforeRow as any).active);
  const nextPrice =
    patch.price_cents === null
      ? null
      : typeof patch.price_cents === "number"
        ? patch.price_cents
        : typeof (beforeRow as any).price_cents === "number"
          ? (beforeRow as any).price_cents
          : null;

  if (nextActive && (!nextPrice || nextPrice <= 0)) {
    return res.status(400).json({ error: "active_offer_requires_price" });
  }

  const { data, error } = await supabase
    .from("visibility_offers")
    .update(patch)
    .eq("id", offerId)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "visibility.offer.update",
    entity_type: "visibility_offers",
    entity_id: offerId,
    metadata: {
      before: beforeRow,
      after: data,
      actor: getAdminSessionSubAny(req),
    },
  });

  res.json({ ok: true, offer: data });
};

export const deleteAdminVisibilityOffer: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const offerId = typeof req.params.id === "string" ? req.params.id : "";
  if (!offerId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: beforeRow } = await supabase
    .from("visibility_offers")
    .select("*")
    .eq("id", offerId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("visibility_offers")
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq("id", offerId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "visibility.offer.delete",
    entity_type: "visibility_offers",
    entity_id: offerId,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor: getAdminSessionSubAny(req),
    },
  });

  res.json({ ok: true });
};

type VisibilityPromoCodeInput = {
  code?: unknown;
  description?: unknown;
  discount_bps?: unknown;
  applies_to_type?: unknown;
  applies_to_offer_id?: unknown;
  applies_to_establishment_ids?: unknown;
  active?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
};

function normalizePromoCode(v: unknown): string | null {
  const s =
    typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, "") : "";
  return s ? s : null;
}

function normalizePromoScopeType(
  v: unknown,
): "pack" | "option" | "menu_digital" | "media_video" | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (
    s === "pack" ||
    s === "option" ||
    s === "menu_digital" ||
    s === "media_video"
  )
    return s;
  return null;
}

function normalizeUuidArray(v: unknown): string[] | null {
  if (v === null) return null;
  if (!Array.isArray(v)) return null;

  const out: string[] = [];
  for (const raw of v) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    if (!isUuid(id)) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= 200) break;
  }

  return out.length ? out : null;
}

function safeIsoOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

export const listAdminVisibilityPromoCodes: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const includeDeleted =
    typeof req.query.include_deleted === "string"
      ? req.query.include_deleted === "true"
      : false;

  const supabase = getAdminSupabase();

  const baseSelect =
    "id,code,description,discount_bps,applies_to_type,applies_to_offer_id,active,starts_at,ends_at,created_at,updated_at,deleted_at";
  const selectWithEst = `${baseSelect},applies_to_establishment_ids`;

  const run = async (select: string) => {
    let q = supabase
      .from("visibility_promo_codes")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(500);

    if (!includeDeleted) q = q.is("deleted_at", null);
    return await q;
  };

  const first = await run(selectWithEst);
  if (
    first.error &&
    /applies_to_establishment_ids/i.test(first.error.message)
  ) {
    const fallback = await run(baseSelect);
    if (fallback.error)
      return res.status(500).json({ error: fallback.error.message });

    const rows = (fallback.data ?? []).map((r: any) => ({
      ...r,
      applies_to_establishment_ids: null,
    }));
    return res.json({ ok: true, promo_codes: rows });
  }

  if (first.error) return res.status(500).json({ error: first.error.message });
  res.json({ ok: true, promo_codes: first.data ?? [] });
};

export const createAdminVisibilityPromoCode: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const body = req.body as VisibilityPromoCodeInput;

  const code = normalizePromoCode(body.code);
  if (!code) return res.status(400).json({ error: "Code requis" });

  const discountBps = Math.max(0, Math.min(10000, safeInt(body.discount_bps)));
  if (discountBps <= 0)
    return res.status(400).json({ error: "La remise doit être supérieure à 0" });

  const establishmentIds = normalizeUuidArray(
    body.applies_to_establishment_ids,
  );

  const payload: Record<string, unknown> = {
    code,
    description: safeString(body.description),
    discount_bps: discountBps,
    applies_to_type:
      body.applies_to_type === null
        ? null
        : normalizePromoScopeType(body.applies_to_type),
    applies_to_offer_id:
      typeof body.applies_to_offer_id === "string" &&
      body.applies_to_offer_id.trim()
        ? body.applies_to_offer_id.trim()
        : null,
    active: typeof body.active === "boolean" ? body.active : true,
    starts_at: safeIsoOrNull(body.starts_at),
    ends_at: safeIsoOrNull(body.ends_at),
  };

  if (establishmentIds) payload.applies_to_establishment_ids = establishmentIds;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("visibility_promo_codes")
    .insert(payload)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "visibility.promo.create",
    entity_type: "visibility_promo_codes",
    entity_id: (data as any)?.id ?? null,
    metadata: { after: data, actor: getAdminSessionSubAny(req) },
  });

  res.json({ ok: true, promo_code: data });
};

export const updateAdminVisibilityPromoCode: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const promoId = typeof req.params.id === "string" ? req.params.id : "";
  if (!promoId) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const body = req.body as VisibilityPromoCodeInput;

  const supabase = getAdminSupabase();

  const { data: beforeRow, error: beforeErr } = await supabase
    .from("visibility_promo_codes")
    .select("*")
    .eq("id", promoId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!beforeRow) return res.status(404).json({ error: "promo_not_found" });

  const patch: Record<string, unknown> = {};

  if (body.code !== undefined) {
    const code = normalizePromoCode(body.code);
    if (!code) return res.status(400).json({ error: "Code requis" });
    patch.code = code;
  }

  if (body.description !== undefined)
    patch.description = safeString(body.description);

  if (body.discount_bps !== undefined) {
    const discountBps = Math.max(
      0,
      Math.min(10000, safeInt(body.discount_bps)),
    );
    if (discountBps <= 0)
      return res.status(400).json({ error: "La remise doit être supérieure à 0" });
    patch.discount_bps = discountBps;
  }

  if (body.applies_to_type !== undefined) {
    patch.applies_to_type =
      body.applies_to_type === null
        ? null
        : normalizePromoScopeType(body.applies_to_type);
  }

  if (body.applies_to_offer_id !== undefined) {
    patch.applies_to_offer_id =
      body.applies_to_offer_id === null
        ? null
        : typeof body.applies_to_offer_id === "string" &&
            body.applies_to_offer_id.trim()
          ? body.applies_to_offer_id.trim()
          : null;
  }

  if (body.applies_to_establishment_ids !== undefined) {
    patch.applies_to_establishment_ids = normalizeUuidArray(
      body.applies_to_establishment_ids,
    );
  }

  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.starts_at !== undefined)
    patch.starts_at = safeIsoOrNull(body.starts_at);
  if (body.ends_at !== undefined) patch.ends_at = safeIsoOrNull(body.ends_at);

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const { data, error } = await supabase
    .from("visibility_promo_codes")
    .update(patch)
    .eq("id", promoId)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "visibility.promo.update",
    entity_type: "visibility_promo_codes",
    entity_id: promoId,
    metadata: {
      before: beforeRow,
      after: data,
      actor: getAdminSessionSubAny(req),
    },
  });

  res.json({ ok: true, promo_code: data });
};

export const deleteAdminVisibilityPromoCode: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const promoId = typeof req.params.id === "string" ? req.params.id : "";
  if (!promoId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: beforeRow } = await supabase
    .from("visibility_promo_codes")
    .select("*")
    .eq("id", promoId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("visibility_promo_codes")
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq("id", promoId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "visibility.promo.delete",
    entity_type: "visibility_promo_codes",
    entity_id: promoId,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor: getAdminSessionSubAny(req),
    },
  });

  res.json({ ok: true });
};

type ConsumerPromoCodeInput = {
  code?: unknown;
  description?: unknown;
  discount_bps?: unknown;
  applies_to_pack_id?: unknown;
  applies_to_establishment_ids?: unknown;
  active?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
};

export const listAdminConsumerPromoCodes: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const includeDeleted =
    typeof req.query.include_deleted === "string"
      ? req.query.include_deleted === "true"
      : false;
  const supabase = getAdminSupabase();

  const select =
    "id,code,description,discount_bps,applies_to_pack_id,applies_to_establishment_ids,active,starts_at,ends_at,created_at,updated_at,deleted_at";

  let q = supabase
    .from("consumer_promo_codes")
    .select(select)
    .order("created_at", { ascending: false })
    .limit(500);
  if (!includeDeleted) q = q.is("deleted_at", null);

  const { data, error } = await q;
  if (error) {
    // Graceful fallback when the migration hasn't been applied yet.
    if (
      /relation .*consumer_promo_codes.* does not exist/i.test(error.message)
    ) {
      return res.json({ ok: true, promo_codes: [] });
    }
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, promo_codes: data ?? [] });
};

export const createAdminConsumerPromoCode: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const body = req.body as ConsumerPromoCodeInput;

  const code = normalizePromoCode(body.code);
  if (!code) return res.status(400).json({ error: "Code requis" });

  const discountBps = Math.max(0, Math.min(10000, safeInt(body.discount_bps)));
  if (discountBps <= 0)
    return res.status(400).json({ error: "La remise doit être supérieure à 0" });

  const packId =
    typeof body.applies_to_pack_id === "string" &&
    body.applies_to_pack_id.trim()
      ? body.applies_to_pack_id.trim()
      : null;
  if (packId && !isUuid(packId))
    return res.status(400).json({ error: "invalid_pack_id" });

  const establishmentIds = normalizeUuidArray(
    body.applies_to_establishment_ids,
  );

  const payload: Record<string, unknown> = {
    code,
    description: safeString(body.description),
    discount_bps: discountBps,
    applies_to_pack_id: packId,
    active: typeof body.active === "boolean" ? body.active : true,
    starts_at: safeIsoOrNull(body.starts_at),
    ends_at: safeIsoOrNull(body.ends_at),
  };

  if (establishmentIds) payload.applies_to_establishment_ids = establishmentIds;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("consumer_promo_codes")
    .insert(payload)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "consumer.promo.create",
    entity_type: "consumer_promo_codes",
    entity_id: (data as any)?.id ?? null,
    metadata: { after: data, actor: getAdminSessionSubAny(req) },
  });

  return res.json({ ok: true, promo_code: data });
};

export const updateAdminConsumerPromoCode: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const promoId = typeof req.params.id === "string" ? req.params.id : "";
  if (!promoId) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const body = req.body as ConsumerPromoCodeInput;

  const supabase = getAdminSupabase();

  const { data: beforeRow, error: beforeErr } = await supabase
    .from("consumer_promo_codes")
    .select("*")
    .eq("id", promoId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!beforeRow) return res.status(404).json({ error: "promo_not_found" });

  const patch: Record<string, unknown> = {};

  if (body.code !== undefined) {
    const code = normalizePromoCode(body.code);
    if (!code) return res.status(400).json({ error: "Code requis" });
    patch.code = code;
  }

  if (body.description !== undefined)
    patch.description = safeString(body.description);

  if (body.discount_bps !== undefined) {
    const discountBps = Math.max(
      0,
      Math.min(10000, safeInt(body.discount_bps)),
    );
    if (discountBps <= 0)
      return res.status(400).json({ error: "La remise doit être supérieure à 0" });
    patch.discount_bps = discountBps;
  }

  if (body.applies_to_pack_id !== undefined) {
    const packId =
      body.applies_to_pack_id === null
        ? null
        : typeof body.applies_to_pack_id === "string" &&
            body.applies_to_pack_id.trim()
          ? body.applies_to_pack_id.trim()
          : null;

    if (packId && !isUuid(packId))
      return res.status(400).json({ error: "invalid_pack_id" });
    patch.applies_to_pack_id = packId;
  }

  if (body.applies_to_establishment_ids !== undefined) {
    patch.applies_to_establishment_ids = normalizeUuidArray(
      body.applies_to_establishment_ids,
    );
  }

  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.starts_at !== undefined)
    patch.starts_at = safeIsoOrNull(body.starts_at);
  if (body.ends_at !== undefined) patch.ends_at = safeIsoOrNull(body.ends_at);

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const { data, error } = await supabase
    .from("consumer_promo_codes")
    .update(patch)
    .eq("id", promoId)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "consumer.promo.update",
    entity_type: "consumer_promo_codes",
    entity_id: promoId,
    metadata: {
      before: beforeRow,
      after: data,
      actor: getAdminSessionSubAny(req),
    },
  });

  return res.json({ ok: true, promo_code: data });
};

export const deleteAdminConsumerPromoCode: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const promoId = typeof req.params.id === "string" ? req.params.id : "";
  if (!promoId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: beforeRow } = await supabase
    .from("consumer_promo_codes")
    .select("*")
    .eq("id", promoId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("consumer_promo_codes")
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq("id", promoId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "consumer.promo.delete",
    entity_type: "consumer_promo_codes",
    entity_id: promoId,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor: getAdminSessionSubAny(req),
    },
  });

  return res.json({ ok: true });
};

export const listAdminVisibilityOrders: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 100;

  const paymentStatus =
    typeof req.query.payment_status === "string"
      ? req.query.payment_status.trim().toLowerCase()
      : "all";
  const status =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "all";

  const supabase = getAdminSupabase();

  let q = supabase
    .from("visibility_orders")
    .select(
      "id,establishment_id,created_by_user_id,payment_status,status,currency,subtotal_cents,tax_cents,total_cents,paid_at,meta,created_at,updated_at,establishments(id,name,city)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (paymentStatus !== "all" && paymentStatus)
    q = q.eq("payment_status", paymentStatus);
  if (status !== "all" && status) q = q.eq("status", status);

  const { data: orders, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const orderIds = (orders ?? [])
    .map((o: any) => (typeof o?.id === "string" ? o.id : ""))
    .filter((x: string) => !!x);

  const itemsByOrderId = new Map<string, any[]>();
  if (orderIds.length) {
    const { data: items, error: itemsErr } = await supabase
      .from("visibility_order_items")
      .select(
        "id,order_id,offer_id,title,description,type,deliverables,duration_days,quantity,unit_price_cents,total_price_cents,currency,tax_rate_bps,tax_label,meta,created_at",
      )
      .in("order_id", orderIds)
      .order("created_at", { ascending: true })
      .limit(5000);

    if (itemsErr) return res.status(500).json({ error: itemsErr.message });

    for (const it of (items ?? []) as any[]) {
      const oid = typeof it?.order_id === "string" ? it.order_id : "";
      if (!oid) continue;
      const list = itemsByOrderId.get(oid) ?? [];
      list.push(it);
      itemsByOrderId.set(oid, list);
    }
  }

  const financeByOrderId = new Map<
    string,
    { id: string; invoice_number: string; issued_at: string }
  >();
  if (orderIds.length) {
    try {
      const { data: fin, error: finErr } = await supabase
        .from("finance_invoices")
        .select("id,reference_id,invoice_number,issued_at")
        .eq("reference_type", "visibility_order")
        .in("reference_id", orderIds)
        .limit(1000);

      if (finErr) throw finErr;

      for (const row of (fin ?? []) as Array<Record<string, unknown>>) {
        const refId =
          typeof row.reference_id === "string" ? row.reference_id : "";
        const id = typeof row.id === "string" ? row.id : "";
        const invoiceNumber =
          typeof row.invoice_number === "string" ? row.invoice_number : "";
        const issuedAt = typeof row.issued_at === "string" ? row.issued_at : "";
        if (refId && id && invoiceNumber && issuedAt)
          financeByOrderId.set(refId, {
            id,
            invoice_number: invoiceNumber,
            issued_at: issuedAt,
          });
      }
    } catch {
      // ignore
    }
  }

  const out = (orders ?? []).map((o: any) => {
    const id = typeof o?.id === "string" ? o.id : "";
    const fin = id ? financeByOrderId.get(id) : undefined;
    return {
      ...o,
      items: id ? (itemsByOrderId.get(id) ?? []) : [],
      finance_invoice: fin ?? null,
    };
  });

  res.json({ ok: true, orders: out });
};

export const updateAdminVisibilityOrderStatus: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const orderId = typeof req.params.id === "string" ? req.params.id : "";
  if (!orderId) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const statusRaw =
    typeof req.body.status === "string"
      ? req.body.status.trim().toLowerCase()
      : "";

  const nextStatus = (() => {
    if (statusRaw === "pending") return "pending";
    if (statusRaw === "in_progress") return "in_progress";
    if (statusRaw === "delivered") return "delivered";
    if (statusRaw === "cancelled") return "cancelled";
    if (statusRaw === "refunded") return "refunded";
    return null;
  })();

  if (!nextStatus) return res.status(400).json({ error: "invalid_status" });

  const supabase = getAdminSupabase();

  const { data: beforeRow, error: beforeErr } = await supabase
    .from("visibility_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!beforeRow) return res.status(404).json({ error: "order_not_found" });

  const patch: Record<string, unknown> = { status: nextStatus };

  // If admin marks refunded, keep payment_status consistent.
  if (nextStatus === "refunded") patch.payment_status = "refunded";

  const { data, error } = await supabase
    .from("visibility_orders")
    .update(patch)
    .eq("id", orderId)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "visibility.order.update_status",
    entity_type: "visibility_orders",
    entity_id: orderId,
    metadata: {
      before: beforeRow,
      after: data,
      actor: getAdminSessionSubAny(req),
    },
  });

  res.json({ ok: true, order: data });
};

export const updateAdminVisibilityOrderItemMeta: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const orderId =
    typeof req.params.orderId === "string" ? req.params.orderId : "";
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";

  if (!orderId) return res.status(400).json({ error: "Identifiant de commande requis" });
  if (!itemId) return res.status(400).json({ error: "Identifiant d'article requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const metaRaw = (req.body as any).meta;
  const meta = isRecord(metaRaw) ? metaRaw : null;
  if (!meta) return res.status(400).json({ error: "Les métadonnées doivent être un objet" });

  const supabase = getAdminSupabase();

  const { data: beforeRow, error: beforeErr } = await supabase
    .from("visibility_order_items")
    .select("id,order_id,meta")
    .eq("id", itemId)
    .eq("order_id", orderId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!beforeRow) return res.status(404).json({ error: "item_not_found" });

  const { data, error } = await supabase
    .from("visibility_order_items")
    .update({ meta })
    .eq("id", itemId)
    .eq("order_id", orderId)
    .select("id,order_id,meta")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "visibility.order_item.update_meta",
    entity_type: "visibility_order_items",
    entity_id: itemId,
    metadata: {
      before: beforeRow,
      after: data,
      actor: getAdminSessionSubAny(req),
    },
  });

  res.json({ ok: true, item: data });
};

export const getAdminVisibilityInvoice: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const invoiceId =
    typeof req.params.invoiceId === "string" ? req.params.invoiceId : "";
  if (!invoiceId)
    return res.status(400).json({ error: "Identifiant de facture requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("finance_invoices")
    .select(
      "id,invoice_number,issued_at,reference_type,reference_id,amount_cents,currency,status,snapshot,pdf_url,created_at,updated_at",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "invoice_not_found" });

  res.json({ ok: true, invoice: data });
};

// ---------------------------------------------------------------------------
// Visibilité (SAM Media) - Quotes & Invoices (external clients + catalog linked)
// ---------------------------------------------------------------------------

type MediaExternalClientInput = {
  company_name?: unknown;
  contact_name?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  city?: unknown;
  country?: unknown;
  notes?: unknown;
};

type MediaCreateQuoteInput = {
  pro_user_id?: unknown;
  establishment_id?: unknown;
  valid_until?: unknown;
  currency?: unknown;
  notes?: unknown;
  payment_terms?: unknown;
  delivery_estimate?: unknown;
};

type MediaAddQuoteItemInput = {
  catalog_item_id?: unknown;
  quantity?: unknown;

  // Superadmin-only (free lines)
  item_type?: unknown;
  name?: unknown;
  description?: unknown;
  category?: unknown;
  unit_price?: unknown;
  tax_rate?: unknown;
};

type MediaUpdateQuoteItemInput = {
  quantity?: unknown;
};

type MediaSendQuoteEmailInput = {
  lang?: unknown;
  to_email?: unknown;
};

type MediaUpdateQuoteInput = {
  status?: unknown;
  valid_until?: unknown;
  currency?: unknown;
  notes?: unknown;
  payment_terms?: unknown;
  delivery_estimate?: unknown;
};

type MediaConvertQuoteToInvoiceInput = {
  due_at?: unknown;
  notes?: unknown;
};

type MediaSendInvoiceEmailInput = {
  lang?: unknown;
  to_email?: unknown;
};

type MediaMarkInvoicePaidInput = {
  amount?: unknown;
  method?: unknown;
  reference?: unknown;
  paid_at?: unknown;
};

function safeMoneyNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizePercent(v: unknown): number {
  const n = safeMoneyNumber(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, roundMoney(n)));
}

function normalizeLang(v: unknown): "fr" | "en" {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "en" ? "en" : "fr";
}

function parseEmail(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

function getRequestBaseUrl(req: Parameters<RequestHandler>[0]): string {
  const host = String(
    req.get("x-forwarded-host") ?? req.get("host") ?? "",
  ).trim();
  const proto = String(
    req.get("x-forwarded-proto") ?? (req as any).protocol ?? "https",
  ).trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function nextMediaQuoteNumber(
  supabase: ReturnType<typeof getAdminSupabase>,
): Promise<string> {
  const { data, error } = await supabase.rpc("media_next_quote_number");
  if (error) throw new Error(error.message);
  const v = typeof data === "string" ? data.trim() : "";
  if (!v) throw new Error("quote_number_generation_failed");
  return v;
}

async function nextMediaInvoiceNumber(
  supabase: ReturnType<typeof getAdminSupabase>,
): Promise<string> {
  const { data, error } = await supabase.rpc("media_next_invoice_number");
  if (error) throw new Error(error.message);
  const v = typeof data === "string" ? data.trim() : "";
  if (!v) throw new Error("invoice_number_generation_failed");
  return v;
}

async function recomputeMediaQuoteTotals(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  quoteId: string;
}): Promise<void> {
  const { supabase, quoteId } = args;
  const { data: items, error: itemsErr } = await supabase
    .from("media_quote_items")
    .select("line_subtotal,line_tax,line_total")
    .eq("quote_id", quoteId)
    .limit(5000);

  if (itemsErr) throw new Error(itemsErr.message);

  let subtotal = 0;
  let tax = 0;
  let total = 0;

  for (const it of (items ?? []) as any[]) {
    const s =
      typeof it?.line_subtotal === "number"
        ? it.line_subtotal
        : Number(it?.line_subtotal ?? 0);
    const t =
      typeof it?.line_tax === "number"
        ? it.line_tax
        : Number(it?.line_tax ?? 0);
    const tt =
      typeof it?.line_total === "number"
        ? it.line_total
        : Number(it?.line_total ?? 0);
    subtotal += Number.isFinite(s) ? s : 0;
    tax += Number.isFinite(t) ? t : 0;
    total += Number.isFinite(tt) ? tt : 0;
  }

  const patch = {
    subtotal_amount: roundMoney(subtotal),
    tax_amount: roundMoney(tax),
    total_amount: roundMoney(total),
    updated_at: new Date().toISOString(),
  };

  const { error: updErr } = await supabase
    .from("media_quotes")
    .update(patch)
    .eq("id", quoteId);
  if (updErr) throw new Error(updErr.message);
}

async function recomputeMediaInvoiceTotals(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  invoiceId: string;
}): Promise<void> {
  const { supabase, invoiceId } = args;
  const { data: items, error: itemsErr } = await supabase
    .from("media_invoice_items")
    .select("line_subtotal,line_tax,line_total")
    .eq("invoice_id", invoiceId)
    .limit(5000);

  if (itemsErr) throw new Error(itemsErr.message);

  let subtotal = 0;
  let tax = 0;
  let total = 0;

  for (const it of (items ?? []) as any[]) {
    const s =
      typeof it?.line_subtotal === "number"
        ? it.line_subtotal
        : Number(it?.line_subtotal ?? 0);
    const t =
      typeof it?.line_tax === "number"
        ? it.line_tax
        : Number(it?.line_tax ?? 0);
    const tt =
      typeof it?.line_total === "number"
        ? it.line_total
        : Number(it?.line_total ?? 0);
    subtotal += Number.isFinite(s) ? s : 0;
    tax += Number.isFinite(t) ? t : 0;
    total += Number.isFinite(tt) ? tt : 0;
  }

  const patch = {
    subtotal_amount: roundMoney(subtotal),
    tax_amount: roundMoney(tax),
    total_amount: roundMoney(total),
    updated_at: new Date().toISOString(),
  };

  const { error: updErr } = await supabase
    .from("media_invoices")
    .update(patch)
    .eq("id", invoiceId);
  if (updErr) throw new Error(updErr.message);
}

function computeMediaLine(args: {
  unitPrice: number;
  quantity: number;
  taxRate: number;
}): {
  line_subtotal: number;
  line_tax: number;
  line_total: number;
} {
  const unitPrice = Number.isFinite(args.unitPrice) ? args.unitPrice : 0;
  const quantity = Number.isFinite(args.quantity)
    ? Math.max(1, Math.floor(args.quantity))
    : 1;
  const taxRate = Number.isFinite(args.taxRate)
    ? Math.max(0, Math.min(100, args.taxRate))
    : 0;

  const subtotal = roundMoney(unitPrice * quantity);
  const tax = roundMoney(subtotal * (taxRate / 100));
  const total = roundMoney(subtotal + tax);

  return { line_subtotal: subtotal, line_tax: tax, line_total: total };
}

async function getMediaQuoteWithItems(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  quoteId: string;
}) {
  const { supabase, quoteId } = args;

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select(
      "*,pro_user_id,establishment_id,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,city,address,ice,notes),establishments(id,name,city)",
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteErr) throw new Error(quoteErr.message);
  if (!quote) return null;

  const { data: items, error: itemsErr } = await supabase
    .from("media_quote_items")
    .select("*")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (itemsErr) throw new Error(itemsErr.message);

  return { ...(quote as any), items: items ?? [] };
}

async function getMediaInvoiceWithItems(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  invoiceId: string;
}) {
  const { supabase, invoiceId } = args;

  const { data: invoice, error: invErr } = await supabase
    .from("media_invoices")
    .select(
      "*,pro_user_id,establishment_id,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,city,address,ice,notes),establishments(id,name,city),media_quotes(id,quote_number)",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) throw new Error(invErr.message);
  if (!invoice) return null;

  const { data: items, error: itemsErr } = await supabase
    .from("media_invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (itemsErr) throw new Error(itemsErr.message);

  return { ...(invoice as any), items: items ?? [] };
}

async function ensureMediaQuotePublicLink(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  quoteId: string;
  baseUrl: string;
  expiresDays?: number;
}): Promise<{ token: string; publicUrl: string; expiresAt: string }> {
  const { supabase, quoteId, baseUrl } = args;
  const expiresDays =
    typeof args.expiresDays === "number" && Number.isFinite(args.expiresDays)
      ? Math.max(1, Math.floor(args.expiresDays))
      : 30;

  const token = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(
    Date.now() + expiresDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Keep at most one active link per quote (delete previous unused links)
  await supabase
    .from("media_quote_public_links")
    .delete()
    .eq("quote_id", quoteId)
    .is("used_at", null);

  const { error } = await supabase
    .from("media_quote_public_links")
    .insert({ quote_id: quoteId, token_hash: tokenHash, expires_at: expiresAt })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const publicUrl = `${baseUrl}/quotes/${encodeURIComponent(token)}`;
  return { token, publicUrl, expiresAt };
}

async function ensureMediaInvoicePublicLink(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  invoiceId: string;
  baseUrl: string;
  expiresDays?: number;
}): Promise<{ token: string; publicUrl: string; expiresAt: string }> {
  const { supabase, invoiceId, baseUrl } = args;
  const expiresDays =
    typeof args.expiresDays === "number" && Number.isFinite(args.expiresDays)
      ? Math.max(1, Math.floor(args.expiresDays))
      : 30;

  const token = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(
    Date.now() + expiresDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Keep at most one active link per invoice (delete previous unused links)
  await supabase
    .from("media_invoice_public_links")
    .delete()
    .eq("invoice_id", invoiceId)
    .is("used_at", null);

  const { error } = await supabase
    .from("media_invoice_public_links")
    .insert({
      invoice_id: invoiceId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const publicUrl = `${baseUrl}/invoices/${encodeURIComponent(token)}`;
  return { token, publicUrl, expiresAt };
}

// ---------------------------------------------------------------------------
// Pro profiles (clients = Pro)
// ---------------------------------------------------------------------------

type ProProfileRow = {
  user_id: string;
  client_type: string;
  company_name: string | null;
  contact_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  postal_code: string | null;
  country: string | null;
  ice: string | null;
  rc: string | null;
  notes: string | null;
};

type ProProfileAdminItem = ProProfileRow & {
  establishments: Array<{
    id: string;
    name: string | null;
    city: string | null;
  }>;
};

export const listAdminProProfiles: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(200, Math.max(1, Math.floor(limitRaw)))
    : 50;

  const supabase = getAdminSupabase();

  // 1) Récupérer les PROs depuis pro_profiles
  // Note: Using only columns that exist in the base table (extended fields may not be migrated yet)
  let query = supabase
    .from("pro_profiles")
    .select(
      "user_id,client_type,company_name,contact_name,email,phone,city,address,ice,notes",
    )
    .order("company_name", { ascending: true })
    .limit(limit);

  if (q) {
    const safe = q.replace(/,/g, " ").trim();
    const filters = [
      `company_name.ilike.%${safe}%`,
      `email.ilike.%${safe}%`,
      `contact_name.ilike.%${safe}%`,
      `city.ilike.%${safe}%`,
    ];
    if (isUuid(safe)) filters.push(`user_id.eq.${safe}`);
    query = query.or(filters.join(","));
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const profiles = (data ?? []) as any[];
  const existingUserIds = new Set(
    profiles.map((p) => String(p.user_id ?? "")).filter(Boolean)
  );

  // 2) Également récupérer les PROs créés via admin_audit_log qui n'ont pas d'entrée dans pro_profiles
  const { data: auditLogs } = await supabase
    .from("admin_audit_log")
    .select("entity_id,metadata,created_at")
    .eq("action", "pro.user.create")
    .not("entity_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  // Ajouter les PROs de l'audit log qui ne sont pas déjà dans pro_profiles
  for (const log of (auditLogs ?? []) as any[]) {
    const userId = String(log.entity_id ?? "");
    if (!userId || existingUserIds.has(userId)) continue;

    const metadata = log.metadata ?? {};
    const email = String(metadata.email ?? "");

    // Filtrer par recherche si présente
    if (q) {
      const safe = q.toLowerCase();
      const matchesEmail = email.toLowerCase().includes(safe);
      const matchesId = isUuid(q) && userId === q;
      if (!matchesEmail && !matchesId) continue;
    }

    profiles.push({
      user_id: userId,
      client_type: "A",
      company_name: null,
      contact_name: null,
      first_name: null,
      last_name: null,
      email: email || null,
      phone: null,
      city: null,
      address: null,
      postal_code: null,
      country: "Maroc",
      ice: null,
      rc: null,
      notes: null,
    });
    existingUserIds.add(userId);
  }

  const userIds = Array.from(existingUserIds);

  const out: ProProfileAdminItem[] = [];
  if (!userIds.length) return res.json({ ok: true, items: out });

  const { data: memberships, error: memErr } = await supabase
    .from("pro_establishment_memberships")
    .select("user_id,establishment_id,role,created_at")
    .in("user_id", userIds)
    .limit(5000);

  if (memErr) return res.status(500).json({ error: memErr.message });

  const memRows = (memberships ?? []) as any[];
  const establishmentIds = Array.from(
    new Set(
      memRows.map((m) => String(m.establishment_id ?? "")).filter(Boolean),
    ),
  );

  const { data: establishments, error: estErr } = establishmentIds.length
    ? await supabase
        .from("establishments")
        .select("id,name,city")
        .in("id", establishmentIds)
        .limit(2000)
    : ({ data: [], error: null } as any);

  if (estErr) return res.status(500).json({ error: estErr.message });

  const estById = new Map<
    string,
    { id: string; name: string | null; city: string | null }
  >();
  for (const e of (establishments ?? []) as any[]) {
    const id = typeof e?.id === "string" ? e.id : "";
    if (!id) continue;
    estById.set(id, {
      id,
      name: typeof e.name === "string" ? e.name : null,
      city: typeof e.city === "string" ? e.city : null,
    });
  }

  const memByUser = new Map<
    string,
    Array<{ establishment_id: string; role: string; created_at: string | null }>
  >();
  for (const m of memRows) {
    const uid = typeof m?.user_id === "string" ? m.user_id : "";
    const eid =
      typeof m?.establishment_id === "string" ? m.establishment_id : "";
    if (!uid || !eid) continue;
    const list = memByUser.get(uid) ?? [];
    list.push({
      establishment_id: eid,
      role: String(m.role ?? ""),
      created_at: typeof m.created_at === "string" ? m.created_at : null,
    });
    memByUser.set(uid, list);
  }

  for (const p of profiles) {
    const uid = String(p.user_id ?? "");
    const mem = memByUser.get(uid) ?? [];
    mem.sort((a, b) => {
      const ar = a.role === "owner" ? 0 : 1;
      const br = b.role === "owner" ? 0 : 1;
      if (ar !== br) return ar - br;
      return String(a.created_at ?? "").localeCompare(
        String(b.created_at ?? ""),
      );
    });

    const establishmentsForUser = mem
      .map((m) => estById.get(m.establishment_id) ?? null)
      .filter(Boolean) as Array<{
      id: string;
      name: string | null;
      city: string | null;
    }>;

    out.push({
      user_id: uid,
      client_type: String(p.client_type ?? ""),
      company_name: typeof p.company_name === "string" ? p.company_name : null,
      contact_name: typeof p.contact_name === "string" ? p.contact_name : null,
      first_name: typeof p.first_name === "string" ? p.first_name : null,
      last_name: typeof p.last_name === "string" ? p.last_name : null,
      email: typeof p.email === "string" ? p.email : null,
      phone: typeof p.phone === "string" ? p.phone : null,
      city: typeof p.city === "string" ? p.city : null,
      address: typeof p.address === "string" ? p.address : null,
      postal_code: typeof p.postal_code === "string" ? p.postal_code : null,
      country: typeof p.country === "string" ? p.country : null,
      ice: typeof p.ice === "string" ? p.ice : null,
      rc: typeof p.rc === "string" ? p.rc : null,
      notes: typeof p.notes === "string" ? p.notes : null,
      establishments: establishmentsForUser,
    });
  }

  return res.json({ ok: true, items: out });
};

export const getAdminProProfile: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = String(req.params.id ?? "").trim();
  if (!userId || !isUuid(userId)) {
    return res.status(400).json({ error: "ID utilisateur invalide" });
  }

  const supabase = getAdminSupabase();

  // Note: Using only columns that exist in the base table (extended fields may not be migrated yet)
  const { data: profile, error } = await supabase
    .from("pro_profiles")
    .select(
      "user_id,client_type,company_name,contact_name,email,phone,city,address,ice,notes",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  if (!profile) {
    // Check if the user exists in audit log
    const { data: auditLog } = await supabase
      .from("admin_audit_log")
      .select("entity_id,metadata")
      .eq("action", "pro.user.create")
      .eq("entity_id", userId)
      .maybeSingle();

    if (auditLog) {
      const metadata = auditLog.metadata ?? {};
      return res.json({
        ok: true,
        profile: {
          user_id: userId,
          client_type: "A",
          company_name: null,
          contact_name: null,
          email: String(metadata.email ?? "") || null,
          phone: null,
          city: null,
          address: null,
          ice: null,
          notes: null,
          establishments: [],
        },
      });
    }

    return res.status(404).json({ error: "Profil Pro non trouvé" });
  }

  // Get establishments
  const { data: memberships } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id,role,created_at")
    .eq("user_id", userId)
    .limit(100);

  const establishmentIds = (memberships ?? [])
    .map((m: any) => String(m.establishment_id ?? ""))
    .filter(Boolean);

  let establishments: Array<{ id: string; name: string | null; city: string | null }> = [];
  if (establishmentIds.length) {
    const { data: estData } = await supabase
      .from("establishments")
      .select("id,name,city")
      .in("id", establishmentIds);

    establishments = (estData ?? []).map((e: any) => ({
      id: String(e.id ?? ""),
      name: typeof e.name === "string" ? e.name : null,
      city: typeof e.city === "string" ? e.city : null,
    }));
  }

  return res.json({
    ok: true,
    profile: {
      user_id: profile.user_id,
      client_type: String(profile.client_type ?? ""),
      company_name: profile.company_name,
      contact_name: profile.contact_name,
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      phone: profile.phone,
      city: profile.city,
      address: profile.address,
      postal_code: profile.postal_code,
      country: profile.country,
      ice: profile.ice,
      rc: profile.rc,
      notes: profile.notes,
      establishments,
    },
  });
};

export const updateAdminProProfile: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = String(req.params.id ?? "").trim();
  if (!userId || !isUuid(userId)) {
    return res.status(400).json({ error: "ID utilisateur invalide" });
  }

  const body = req.body ?? {};
  const updates: Record<string, any> = {};

  // Validate and collect fields to update
  if ("company_name" in body) {
    updates.company_name = typeof body.company_name === "string" ? body.company_name.trim() || null : null;
  }
  if ("contact_name" in body) {
    updates.contact_name = typeof body.contact_name === "string" ? body.contact_name.trim() || null : null;
  }
  if ("first_name" in body) {
    updates.first_name = typeof body.first_name === "string" ? body.first_name.trim() || null : null;
  }
  if ("last_name" in body) {
    updates.last_name = typeof body.last_name === "string" ? body.last_name.trim() || null : null;
  }
  if ("email" in body) {
    updates.email = typeof body.email === "string" ? body.email.trim().toLowerCase() || null : null;
  }
  if ("phone" in body) {
    updates.phone = typeof body.phone === "string" ? body.phone.trim() || null : null;
  }
  if ("city" in body) {
    updates.city = typeof body.city === "string" ? body.city.trim() || null : null;
  }
  if ("address" in body) {
    updates.address = typeof body.address === "string" ? body.address.trim() || null : null;
  }
  if ("postal_code" in body) {
    updates.postal_code = typeof body.postal_code === "string" ? body.postal_code.trim() || null : null;
  }
  if ("country" in body) {
    updates.country = typeof body.country === "string" ? body.country.trim() || null : null;
  }
  if ("ice" in body) {
    updates.ice = typeof body.ice === "string" ? body.ice.trim() || null : null;
  }
  if ("rc" in body) {
    updates.rc = typeof body.rc === "string" ? body.rc.trim() || null : null;
  }
  if ("notes" in body) {
    updates.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  }
  if ("client_type" in body) {
    const ct = String(body.client_type ?? "").toUpperCase();
    if (ct === "A" || ct === "B") {
      updates.client_type = ct;
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Aucune modification fournie" });
  }

  const supabase = getAdminSupabase();

  // Check if profile exists, create if not
  const { data: existing } = await supabase
    .from("pro_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    // Create new profile
    const { error: insertErr } = await supabase
      .from("pro_profiles")
      .insert({
        user_id: userId,
        client_type: updates.client_type ?? "A",
        ...updates,
      });

    if (insertErr) {
      console.error("Error creating pro_profile:", insertErr);
      return res.status(500).json({ error: insertErr.message });
    }
  } else {
    // Update existing profile
    const { error: updateErr } = await supabase
      .from("pro_profiles")
      .update(updates)
      .eq("user_id", userId);

    if (updateErr) {
      console.error("Error updating pro_profile:", updateErr);
      return res.status(500).json({ error: updateErr.message });
    }
  }

  // Log the update
  await supabase.from("admin_audit_log").insert({
    action: "pro.profile.update",
    entity_type: "pro_profile",
    entity_id: userId,
    metadata: { updates },
  });

  return res.json({ ok: true });
};

export const listAdminMediaQuotes: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "";
  const clientType =
    typeof req.query.client_type === "string"
      ? req.query.client_type.trim().toUpperCase()
      : "";

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const supabase = getAdminSupabase();

  let q = supabase
    .from("media_quotes")
    .select(
      "id,quote_number,status,client_type,pro_user_id,establishment_id,issued_at,valid_until,currency,subtotal_amount,tax_amount,total_amount,sent_at,accepted_at,rejected_at,created_at,updated_at,pro_profiles(user_id,client_type,company_name,contact_name,email,city,ice),establishments(id,name,city)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && status !== "all") q = q.eq("status", status);
  if (
    clientType &&
    clientType !== "ALL" &&
    (clientType === "A" || clientType === "B")
  )
    q = q.eq("pro_profiles.client_type", clientType);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, quotes: data ?? [] });
};

export const getAdminMediaQuote: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  try {
    const quote = await getMediaQuoteWithItems({ supabase, quoteId });
    if (!quote) return res.status(404).json({ error: "quote_not_found" });
    return res.json({ ok: true, quote });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const createAdminMediaQuote: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const body = req.body as MediaCreateQuoteInput;

  const proUserIdRaw = (body as any).pro_user_id;
  const proUserId = typeof proUserIdRaw === "string" ? proUserIdRaw.trim() : "";
  if (!proUserId || !isUuid(proUserId))
    return res.status(400).json({ error: "Identifiant Pro requis" });

  const establishmentIdRaw = (body as any).establishment_id;
  const establishmentId =
    typeof establishmentIdRaw === "string" ? establishmentIdRaw.trim() : "";
  const establishmentIdOrNull =
    establishmentId && isUuid(establishmentId) ? establishmentId : null;
  if (establishmentId && !establishmentIdOrNull)
    return res.status(400).json({ error: "Identifiant d'établissement invalide" });

  const validUntil = safeIsoOrNull(body.valid_until);
  const currency = safeCurrency(body.currency);

  const supabase = getAdminSupabase();

  const { data: pro, error: proErr } = await supabase
    .from("pro_profiles")
    .select("user_id")
    .eq("user_id", proUserId)
    .maybeSingle();

  if (proErr) return res.status(500).json({ error: proErr.message });
  if (!pro) return res.status(404).json({ error: "pro_not_found" });

  if (establishmentIdOrNull) {
    const { data: est, error: estErr } = await supabase
      .from("establishments")
      .select("id")
      .eq("id", establishmentIdOrNull)
      .maybeSingle();
    if (estErr) return res.status(500).json({ error: estErr.message });
    if (!est) return res.status(400).json({ error: "establishment_not_found" });
  }

  try {
    const quoteNumber = await nextMediaQuoteNumber(supabase);

    const payment_method = normalizeMediaPaymentMethod(
      (body as any).payment_method ?? (body as any).paymentMethod,
    );

    const payload: Record<string, unknown> = {
      quote_number: quoteNumber,
      status: "draft",
      client_type: "pro",
      pro_user_id: proUserId,
      establishment_id: establishmentIdOrNull,
      issued_at: new Date().toISOString(),
      valid_until: validUntil,
      currency,
      payment_method,
      notes: safeString(body.notes),
      payment_terms: safeString(body.payment_terms),
      delivery_estimate: safeString(body.delivery_estimate),
      subtotal_amount: 0,
      tax_amount: 0,
      total_amount: 0,
      created_by_admin_id: (() => {
        const actor = getAdminSessionSubAny(req);
        return actor && isUuid(actor) ? actor : null;
      })(),
    };

    const { data, error } = await supabase
      .from("media_quotes")
      .insert(payload)
      .select("id")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    await supabase.from("admin_audit_log").insert({
      action: "media.quote.create",
      entity_type: "media_quotes",
      entity_id: (data as any)?.id ?? null,
      metadata: { after: payload, actor: getAdminSessionSubAny(req) },
    });

    const quote = await getMediaQuoteWithItems({
      supabase,
      quoteId: (data as any).id,
    });
    return res.json({ ok: true, quote });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const updateAdminMediaQuote: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const body = req.body as MediaUpdateQuoteInput;

  const supabase = getAdminSupabase();

  const { data: before, error: beforeErr } = await supabase
    .from("media_quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!before) return res.status(404).json({ error: "quote_not_found" });

  const patch: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const s =
      typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
    const next =
      s === "draft" ||
      s === "sent" ||
      s === "accepted" ||
      s === "rejected" ||
      s === "expired" ||
      s === "cancelled"
        ? s
        : null;
    if (!next) return res.status(400).json({ error: "invalid_status" });
    patch.status = next;
    if (next === "sent") patch.sent_at = new Date().toISOString();
    if (next === "accepted") patch.accepted_at = new Date().toISOString();
    if (next === "rejected") patch.rejected_at = new Date().toISOString();
  }

  if (body.valid_until !== undefined)
    patch.valid_until = safeIsoOrNull(body.valid_until);
  if (body.currency !== undefined) patch.currency = safeCurrency(body.currency);
  if (body.notes !== undefined) patch.notes = safeString(body.notes);
  if (body.payment_terms !== undefined)
    patch.payment_terms = safeString(body.payment_terms);
  if (body.delivery_estimate !== undefined)
    patch.delivery_estimate = safeString(body.delivery_estimate);

  if (
    (body as any).payment_method !== undefined ||
    (body as any).paymentMethod !== undefined
  ) {
    patch.payment_method = normalizeMediaPaymentMethod(
      (body as any).payment_method ?? (body as any).paymentMethod,
    );
  }

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("media_quotes")
    .update(patch)
    .eq("id", quoteId)
    .select("id")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "media.quote.update",
    entity_type: "media_quotes",
    entity_id: quoteId,
    metadata: { before, after: patch, actor: getAdminSessionSubAny(req) },
  });

  const quote = await getMediaQuoteWithItems({
    supabase,
    quoteId: (data as any).id,
  });
  return res.json({ ok: true, quote });
};

export const addAdminMediaQuoteItem: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const body = req.body as MediaAddQuoteItemInput;

  const quantityRaw = safeInt(body.quantity);
  const quantity = Math.max(1, quantityRaw || 1);

  const supabase = getAdminSupabase();

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select("id,status,client_type")
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const quoteStatus = String((quote as any).status ?? "")
    .trim()
    .toLowerCase();
  if (quoteStatus !== "draft")
    return res.status(409).json({ error: "quote_not_editable" });

  const catalogItemId =
    typeof body.catalog_item_id === "string" ? body.catalog_item_id.trim() : "";

  // Catalog-linked line
  if (catalogItemId) {
    const { data: offer, error: offerErr } = await supabase
      .from("visibility_offers")
      .select(
        "id,title,description,type,category,currency,price_cents,tax_rate_bps,tax_rate,active,is_quotable,is_external_allowed,deleted_at",
      )
      .eq("id", catalogItemId)
      .maybeSingle();

    if (offerErr) return res.status(500).json({ error: offerErr.message });
    if (!offer)
      return res.status(404).json({ error: "catalog_item_not_found" });

    const isActive =
      Boolean((offer as any).active) && !(offer as any).deleted_at;
    const isQuotable = (offer as any).is_quotable !== false;
    const externalAllowed = (offer as any).is_external_allowed !== false;

    if (!isActive || !isQuotable)
      return res.status(400).json({ error: "catalog_item_not_quotable" });
    if ((quote as any).client_type === "external" && !externalAllowed)
      return res
        .status(400)
        .json({ error: "catalog_item_not_allowed_for_external" });

    const title = safeString((offer as any).title) ?? "";
    const itemType = safeString((offer as any).type) ?? "service";
    const category = safeString((offer as any).category);

    const unitPrice = roundMoney(
      (safeInt((offer as any).price_cents) || 0) / 100,
    );

    const taxRate = (() => {
      const n = Number((offer as any).tax_rate);
      if (Number.isFinite(n)) return normalizePercent(n);
      const bps = safeInt((offer as any).tax_rate_bps);
      return normalizePercent(bps / 100);
    })();

    const line = computeMediaLine({ unitPrice, quantity, taxRate });

    const payload: Record<string, unknown> = {
      quote_id: quoteId,
      catalog_item_id: catalogItemId,
      item_type: itemType,
      name_snapshot: title,
      description_snapshot: safeString((offer as any).description),
      category_snapshot: category,
      unit_price_snapshot: unitPrice,
      quantity,
      tax_rate_snapshot: taxRate,
      ...line,
    };

    const { error } = await supabase.from("media_quote_items").insert(payload);
    if (error) return res.status(500).json({ error: error.message });

    await recomputeMediaQuoteTotals({ supabase, quoteId });

    const next = await getMediaQuoteWithItems({ supabase, quoteId });
    return res.json({ ok: true, quote: next });
  }

  // Free line (superadmin only)
  if (!requireSuperadmin(req, res)) return;

  const itemType = safeString(body.item_type) ?? "service";
  const name = safeString(body.name);
  if (!name)
    return res.status(400).json({ error: "name is required for free line" });

  const unitPrice = roundMoney(safeMoneyNumber(body.unit_price));
  const taxRate = normalizePercent(body.tax_rate);

  const line = computeMediaLine({ unitPrice, quantity, taxRate });

  const payload: Record<string, unknown> = {
    quote_id: quoteId,
    catalog_item_id: null,
    item_type: itemType,
    name_snapshot: name,
    description_snapshot: safeString(body.description),
    category_snapshot: safeString(body.category),
    unit_price_snapshot: unitPrice,
    quantity,
    tax_rate_snapshot: taxRate,
    ...line,
  };

  const { error } = await supabase.from("media_quote_items").insert(payload);
  if (error) return res.status(500).json({ error: error.message });

  await recomputeMediaQuoteTotals({ supabase, quoteId });

  const next = await getMediaQuoteWithItems({ supabase, quoteId });
  return res.json({ ok: true, quote: next });
};

export const updateAdminMediaQuoteItem: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";

  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });
  if (!itemId) return res.status(400).json({ error: "Identifiant d'article requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const body = req.body as MediaUpdateQuoteItemInput;

  const supabase = getAdminSupabase();

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select("id,status")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const quoteStatus = String((quote as any).status ?? "")
    .trim()
    .toLowerCase();
  if (quoteStatus !== "draft")
    return res.status(409).json({ error: "quote_not_editable" });

  const { data: before, error: beforeErr } = await supabase
    .from("media_quote_items")
    .select("*")
    .eq("id", itemId)
    .eq("quote_id", quoteId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!before) return res.status(404).json({ error: "item_not_found" });

  const patch: Record<string, unknown> = {};

  if (body.quantity !== undefined) {
    const q = safeInt(body.quantity);
    patch.quantity = Math.max(1, q || 1);
  }

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const nextQuantity =
    typeof patch.quantity === "number"
      ? (patch.quantity as number)
      : safeInt((before as any).quantity) || 1;

  const unitPrice = Number((before as any).unit_price_snapshot ?? 0);
  const taxRate = Number((before as any).tax_rate_snapshot ?? 0);

  const line = computeMediaLine({
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    quantity: nextQuantity,
    taxRate: Number.isFinite(taxRate) ? taxRate : 0,
  });

  const fullPatch = { ...patch, ...line };

  const { error } = await supabase
    .from("media_quote_items")
    .update(fullPatch)
    .eq("id", itemId)
    .eq("quote_id", quoteId);

  if (error) return res.status(500).json({ error: error.message });

  await recomputeMediaQuoteTotals({ supabase, quoteId });

  await supabase.from("admin_audit_log").insert({
    action: "media.quote_item.update",
    entity_type: "media_quote_items",
    entity_id: itemId,
    metadata: { before, after: fullPatch, actor: getAdminSessionSubAny(req) },
  });

  const next = await getMediaQuoteWithItems({ supabase, quoteId });
  return res.json({ ok: true, quote: next });
};

export const deleteAdminMediaQuoteItem: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";

  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });
  if (!itemId) return res.status(400).json({ error: "Identifiant d'article requis" });

  const supabase = getAdminSupabase();

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select("id,status")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const quoteStatus = String((quote as any).status ?? "")
    .trim()
    .toLowerCase();
  if (quoteStatus !== "draft")
    return res.status(409).json({ error: "quote_not_editable" });

  const { data: before, error: beforeErr } = await supabase
    .from("media_quote_items")
    .select("*")
    .eq("id", itemId)
    .eq("quote_id", quoteId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!before) return res.status(404).json({ error: "item_not_found" });

  const { error } = await supabase
    .from("media_quote_items")
    .delete()
    .eq("id", itemId)
    .eq("quote_id", quoteId);
  if (error) return res.status(500).json({ error: error.message });

  await recomputeMediaQuoteTotals({ supabase, quoteId });

  await supabase.from("admin_audit_log").insert({
    action: "media.quote_item.delete",
    entity_type: "media_quote_items",
    entity_id: itemId,
    metadata: { before, actor: getAdminSessionSubAny(req) },
  });

  const next = await getMediaQuoteWithItems({ supabase, quoteId });
  return res.json({ ok: true, quote: next });
};

export const createAdminMediaQuotePublicLink: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select("id")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const baseUrl = getRequestBaseUrl(req);
  if (!baseUrl) return res.status(500).json({ error: "missing_base_url" });

  try {
    const link = await ensureMediaQuotePublicLink({
      supabase,
      quoteId,
      baseUrl,
    });

    await supabase.from("admin_audit_log").insert({
      action: "media.quote.public_link.create",
      entity_type: "media_quote_public_links",
      entity_id: quoteId,
      metadata: {
        expires_at: link.expiresAt,
        actor: getAdminSessionSubAny(req),
      },
    });

    return res.json({
      ok: true,
      public_link: link.publicUrl,
      expires_at: link.expiresAt,
      token: link.token,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const downloadAdminMediaQuotePdf: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  try {
    const quote = await getMediaQuoteWithItems({ supabase, quoteId });
    if (!quote) return res.status(404).json({ error: "quote_not_found" });

    const company = await getBillingCompanyProfile();
    const items = (quote.items ?? []).map((it: any) => ({
      name_snapshot: String(it.name_snapshot ?? ""),
      description_snapshot: it.description_snapshot ?? null,
      quantity: Number(it.quantity ?? 0),
      unit_price_snapshot: Number(it.unit_price_snapshot ?? 0),
      tax_rate_snapshot: Number(it.tax_rate_snapshot ?? 0),
      line_total: Number(it.line_total ?? 0),
    }));

    const pdf = await generateMediaQuotePdfBuffer({
      company,
      quote: quote as any,
      items,
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
};

export const downloadAdminMediaInvoicePdf: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const invoiceId = typeof req.params.id === "string" ? req.params.id : "";
  if (!invoiceId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  try {
    const invoice = await getMediaInvoiceWithItems({ supabase, invoiceId });
    if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

    const company = await getBillingCompanyProfile();
    const items = (invoice.items ?? []).map((it: any) => ({
      name_snapshot: String(it.name_snapshot ?? ""),
      description_snapshot: it.description_snapshot ?? null,
      quantity: Number(it.quantity ?? 0),
      unit_price_snapshot: Number(it.unit_price_snapshot ?? 0),
      tax_rate_snapshot: Number(it.tax_rate_snapshot ?? 0),
      line_total: Number(it.line_total ?? 0),
    }));

    const pdf = await generateMediaInvoicePdfBuffer({
      company,
      invoice: invoice as any,
      items,
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
};

export const createAdminMediaInvoicePublicLink: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const invoiceId = typeof req.params.id === "string" ? req.params.id : "";
  if (!invoiceId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: invoice, error: invErr } = await supabase
    .from("media_invoices")
    .select("id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

  const baseUrl = getRequestBaseUrl(req);
  if (!baseUrl) return res.status(500).json({ error: "missing_base_url" });

  try {
    const link = await ensureMediaInvoicePublicLink({
      supabase,
      invoiceId,
      baseUrl,
    });

    await supabase.from("admin_audit_log").insert({
      action: "media.invoice.public_link.create",
      entity_type: "media_invoice_public_links",
      entity_id: invoiceId,
      metadata: {
        expires_at: link.expiresAt,
        actor: getAdminSessionSubAny(req),
      },
    });

    return res.json({
      ok: true,
      public_link: link.publicUrl,
      expires_at: link.expiresAt,
      token: link.token,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const sendAdminMediaQuoteEmail: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const body = isRecord(req.body)
    ? (req.body as MediaSendQuoteEmailInput)
    : ({} as MediaSendQuoteEmailInput);
  const lang = normalizeLang(body.lang);

  const supabase = getAdminSupabase();

  try {
    const quote = await getMediaQuoteWithItems({ supabase, quoteId });
    if (!quote) return res.status(404).json({ error: "quote_not_found" });

    if (
      !quote.items ||
      !Array.isArray(quote.items) ||
      quote.items.length === 0
    ) {
      return res.status(400).json({ error: "quote_has_no_items" });
    }

    const baseUrl = getRequestBaseUrl(req);
    if (!baseUrl) return res.status(500).json({ error: "missing_base_url" });

    const link = await ensureMediaQuotePublicLink({
      supabase,
      quoteId,
      baseUrl,
    });

    const pro = isRecord((quote as any).pro_profiles)
      ? ((quote as any).pro_profiles as any)
      : null;
    if (!pro) return res.status(500).json({ error: "missing_pro_profile" });

    const establishment = isRecord((quote as any).establishments)
      ? ((quote as any).establishments as any)
      : null;

    const proClientType = String(pro.client_type ?? "").toUpperCase();
    const isTypeA = proClientType === "A";

    const toEmail =
      parseEmail((body as any).to_email) || parseEmail(pro.email) || null;
    if (!toEmail)
      return res.status(400).json({ error: "Adresse email destinataire requise" });

    const contactName =
      safeString(pro.contact_name) || safeString(pro.company_name) || "";

    const companyName =
      safeString(pro.company_name) || safeString(establishment?.name) || "Pro";
    const establishmentName = safeString(establishment?.name) || "";

    const totalAmount = roundMoney(Number(quote.total_amount ?? 0));
    const dueDate = quote.valid_until
      ? new Date(String(quote.valid_until)).toLocaleDateString(
          lang === "en" ? "en-GB" : "fr-FR",
        )
      : "";

    const greeting = contactName
      ? lang === "en"
        ? `Hello ${contactName},`
        : `Bonjour ${contactName},`
      : lang === "en"
        ? "Hello,"
        : "Bonjour,";

    const issuerContactPhone =
      safeString(process.env.ISSUER_CONTACT_PHONE) || "";

    const subject =
      lang === "en"
        ? `Your quote — ${quote.quote_number}`
        : isTypeA
          ? `Votre devis SAM Media — ${quote.quote_number}`
          : `Votre devis — ${quote.quote_number}`;

    const bodyText =
      lang === "en"
        ? `${greeting}\n\nPlease find attached your quote ${quote.quote_number}.\n\nTotal: ${totalAmount} ${quote.currency}\nValid until: ${dueDate}\n\nView / accept the quote: ${link.publicUrl}\n\nBest regards,\nSAM Media`
        : isTypeA
          ? [
              greeting,
              ...(establishmentName
                ? [`Suite à nos échanges concernant ${establishmentName},`]
                : ["Suite à nos échanges, "]),
              `veuillez trouver ci-joint votre devis ${quote.quote_number}.`,
              "Récapitulatif",
              ...(establishmentName
                ? [`Établissement : ${establishmentName}`]
                : []),
              `Montant total : ${totalAmount} ${quote.currency}`,
              `Validité : jusqu’au ${dueDate}`.trim(),
              `👉 Consulter / accepter le devis : ${link.publicUrl}`,
              "Ce devis concerne des prestations de visibilité et de communication proposées par SAM Media.",
              "Cordialement,",
              "L’équipe SAM Media",
              ...(issuerContactPhone ? [issuerContactPhone] : []),
            ].join("\n\n")
          : [
              greeting,
              `Veuillez trouver ci-joint votre devis ${quote.quote_number} concernant nos services de visibilité et médias.`,
              "Récapitulatif",
              `Société : ${companyName}`,
              `Montant total : ${totalAmount} ${quote.currency}`,
              `Validité : jusqu’au ${dueDate}`.trim(),
              `👉 Consulter / accepter le devis : ${link.publicUrl}`,
              "Nous restons à votre disposition pour toute question.",
              "Cordialement,",
              "L’équipe SAM Media",
            ].join("\n\n");

    const emailId = randomBytes(16).toString("hex");

    const company = await getBillingCompanyProfile();
    const quotePdf = await generateMediaQuotePdfBuffer({
      company,
      quote: quote as any,
      items: (quote.items ?? []).map((it: any) => ({
        name_snapshot: String(it.name_snapshot ?? ""),
        description_snapshot: it.description_snapshot ?? null,
        quantity: Number(it.quantity ?? 0),
        unit_price_snapshot: Number(it.unit_price_snapshot ?? 0),
        tax_rate_snapshot: Number(it.tax_rate_snapshot ?? 0),
        line_total: Number(it.line_total ?? 0),
      })),
    });

    const sent = await sendLoggedEmail({
      emailId,
      fromKey: "hello",
      to: [toEmail],
      subject,
      bodyText,
      ctaLabel: lang === "en" ? "View quote" : "Consulter le devis",
      ctaUrl: link.publicUrl,
      attachments: [
        {
          filename: `${quote.quote_number}.pdf`,
          content: quotePdf,
          contentType: "application/pdf",
        },
      ],
      variables: {
        quote_number: String(quote.quote_number ?? ""),
        total_amount: String(totalAmount),
        currency: String(quote.currency ?? ""),
        due_date: dueDate,
        public_link: link.publicUrl,
        contact_name: contactName,
        company_name: companyName,
        establishment_name: establishmentName,
        pro_client_type: proClientType,
        issuer_contact_phone: issuerContactPhone,
      },
      meta: {
        kind: "media_quote",
        quote_id: quoteId,
        pro_user_id: safeString((quote as any).pro_user_id) || null,
        pro_client_type: proClientType,
      },
    });

    if (sent.ok !== true) return res.status(500).json({ error: sent.error });

    const patch: Record<string, unknown> = {
      status: "sent",
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: updErr } = await supabase
      .from("media_quotes")
      .update(patch)
      .eq("id", quoteId);
    if (updErr) return res.status(500).json({ error: updErr.message });

    await supabase.from("admin_audit_log").insert({
      action: "media.quote.send_email",
      entity_type: "media_quotes",
      entity_id: quoteId,
      metadata: {
        to: toEmail,
        lang,
        email_id: sent.emailId,
        pro_user_id: safeString((quote as any).pro_user_id) || null,
        pro_client_type: proClientType,
        actor: getAdminSessionSubAny(req),
      },
    });

    const next = await getMediaQuoteWithItems({ supabase, quoteId });
    return res.json({
      ok: true,
      quote: next,
      email_id: sent.emailId,
      public_link: link.publicUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const markAdminMediaQuoteAccepted: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: before, error: beforeErr } = await supabase
    .from("media_quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!before) return res.status(404).json({ error: "quote_not_found" });

  const patch = {
    status: "accepted",
    accepted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("media_quotes")
    .update(patch)
    .eq("id", quoteId);
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "media.quote.mark_accepted",
    entity_type: "media_quotes",
    entity_id: quoteId,
    metadata: { before, after: patch, actor: getAdminSessionSubAny(req) },
  });

  const next = await getMediaQuoteWithItems({ supabase, quoteId });
  return res.json({ ok: true, quote: next });
};

export const markAdminMediaQuoteRejected: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: before, error: beforeErr } = await supabase
    .from("media_quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!before) return res.status(404).json({ error: "quote_not_found" });

  const patch = {
    status: "rejected",
    rejected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("media_quotes")
    .update(patch)
    .eq("id", quoteId);
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "media.quote.mark_rejected",
    entity_type: "media_quotes",
    entity_id: quoteId,
    metadata: { before, after: patch, actor: getAdminSessionSubAny(req) },
  });

  const next = await getMediaQuoteWithItems({ supabase, quoteId });
  return res.json({ ok: true, quote: next });
};

export const convertAdminMediaQuoteToInvoice: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const body = isRecord(req.body)
    ? (req.body as MediaConvertQuoteToInvoiceInput)
    : ({} as MediaConvertQuoteToInvoiceInput);

  const supabase = getAdminSupabase();

  try {
    const quote = await getMediaQuoteWithItems({ supabase, quoteId });
    if (!quote) return res.status(404).json({ error: "quote_not_found" });

    const status = String(quote.status ?? "")
      .trim()
      .toLowerCase();
    if (status !== "accepted")
      return res.status(409).json({ error: "quote_not_accepted" });

    const { data: existing, error: existingErr } = await supabase
      .from("media_invoices")
      .select("id,invoice_number")
      .eq("source_quote_id", quoteId)
      .limit(1)
      .maybeSingle();

    if (existingErr)
      return res.status(500).json({ error: existingErr.message });
    if (existing)
      return res.status(409).json({
        error: "invoice_already_exists",
        invoice_id: (existing as any).id,
      });

    const invoiceNumber = await nextMediaInvoiceNumber(supabase);
    const dueAt = safeIsoOrNull(body.due_at);

    const payment_method = normalizeMediaPaymentMethod(
      (body as any).payment_method ??
        (body as any).paymentMethod ??
        (quote as any).payment_method,
    );

    const payload: Record<string, unknown> = {
      invoice_number: invoiceNumber,
      status: "issued",
      source_quote_id: quoteId,
      client_type: "pro",
      pro_user_id: (quote as any).pro_user_id,
      establishment_id: (quote as any).establishment_id ?? null,
      issued_at: new Date().toISOString(),
      due_at: dueAt,
      currency: quote.currency,
      payment_method,
      notes: safeString(body.notes) ?? safeString(quote.notes),
      subtotal_amount: roundMoney(Number(quote.subtotal_amount ?? 0)),
      tax_amount: roundMoney(Number(quote.tax_amount ?? 0)),
      total_amount: roundMoney(Number(quote.total_amount ?? 0)),
      paid_amount: 0,
      created_by_admin_id: (() => {
        const actor = getAdminSessionSubAny(req);
        return actor && isUuid(actor) ? actor : null;
      })(),
    };

    const { data: created, error: createErr } = await supabase
      .from("media_invoices")
      .insert(payload)
      .select("id")
      .single();
    if (createErr) return res.status(500).json({ error: createErr.message });

    const invoiceId = (created as any).id as string;

    const itemsPayload = (quote.items ?? []).map((it: any) => ({
      invoice_id: invoiceId,
      catalog_item_id: it.catalog_item_id ?? null,
      item_type: it.item_type,
      name_snapshot: it.name_snapshot,
      description_snapshot: it.description_snapshot ?? null,
      category_snapshot: it.category_snapshot ?? null,
      unit_price_snapshot: it.unit_price_snapshot,
      quantity: it.quantity,
      tax_rate_snapshot: it.tax_rate_snapshot,
      line_subtotal: it.line_subtotal,
      line_tax: it.line_tax,
      line_total: it.line_total,
    }));

    if (itemsPayload.length) {
      const { error: itemsErr } = await supabase
        .from("media_invoice_items")
        .insert(itemsPayload);
      if (itemsErr) return res.status(500).json({ error: itemsErr.message });
    }

    await recomputeMediaInvoiceTotals({ supabase, invoiceId });

    await supabase.from("admin_audit_log").insert({
      action: "media.quote.convert_to_invoice",
      entity_type: "media_invoices",
      entity_id: invoiceId,
      metadata: {
        quote_id: quoteId,
        invoice_number: invoiceNumber,
        actor: getAdminSessionSubAny(req),
      },
    });

    const invoice = await getMediaInvoiceWithItems({ supabase, invoiceId });
    return res.json({ ok: true, invoice });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const listAdminMediaInvoices: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "";

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const supabase = getAdminSupabase();

  let q = supabase
    .from("media_invoices")
    .select(
      "id,invoice_number,status,source_quote_id,client_type,pro_user_id,establishment_id,issued_at,due_at,currency,subtotal_amount,tax_amount,total_amount,paid_amount,created_at,updated_at,pro_profiles(user_id,client_type,company_name,contact_name,email,city,ice),establishments(id,name,city),media_quotes(quote_number)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, invoices: data ?? [] });
};

export const getAdminMediaInvoice: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const invoiceId = typeof req.params.id === "string" ? req.params.id : "";
  if (!invoiceId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  try {
    const invoice = await getMediaInvoiceWithItems({ supabase, invoiceId });
    if (!invoice) return res.status(404).json({ error: "invoice_not_found" });
    return res.json({ ok: true, invoice });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const sendAdminMediaInvoiceEmail: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const invoiceId = typeof req.params.id === "string" ? req.params.id : "";
  if (!invoiceId) return res.status(400).json({ error: "Identifiant requis" });

  const body = isRecord(req.body)
    ? (req.body as MediaSendInvoiceEmailInput)
    : ({} as MediaSendInvoiceEmailInput);
  const lang = normalizeLang(body.lang);

  const supabase = getAdminSupabase();

  try {
    const invoice = await getMediaInvoiceWithItems({ supabase, invoiceId });
    if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

    const pro = isRecord((invoice as any).pro_profiles)
      ? ((invoice as any).pro_profiles as any)
      : null;
    if (!pro) return res.status(500).json({ error: "missing_pro_profile" });

    const establishment = isRecord((invoice as any).establishments)
      ? ((invoice as any).establishments as any)
      : null;

    const proClientType = String(pro.client_type ?? "").toUpperCase();
    const isTypeA = proClientType === "A";

    const toEmail =
      parseEmail((body as any).to_email) || parseEmail(pro.email) || null;
    if (!toEmail)
      return res.status(400).json({ error: "Adresse email destinataire requise" });

    const contactName =
      safeString(pro.contact_name) || safeString(pro.company_name) || "";

    const greeting = contactName
      ? lang === "en"
        ? `Hello ${contactName},`
        : `Bonjour ${contactName},`
      : lang === "en"
        ? "Hello,"
        : "Bonjour,";

    const companyName = safeString(pro.company_name) || "Pro";
    const establishmentName = safeString(establishment?.name) || "";

    const quoteNumber =
      safeString((invoice as any).media_quotes?.quote_number) || "";

    const totalAmount = roundMoney(Number(invoice.total_amount ?? 0));
    const dueDate = invoice.due_at
      ? new Date(String(invoice.due_at)).toLocaleDateString(
          lang === "en" ? "en-GB" : "fr-FR",
        )
      : "";

    const paymentLink = (() => {
      const raw = safeString((body as any).payment_link);
      if (!raw) return null;
      if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
      return null;
    })();

    const subject =
      lang === "en"
        ? `Your invoice — ${invoice.invoice_number}`
        : isTypeA
          ? `Facture ${invoice.invoice_number}${establishmentName ? ` — ${establishmentName}` : ""}`
          : `Facture ${invoice.invoice_number}`;

    const bodyText =
      lang === "en"
        ? `${greeting}\n\nPlease find attached your invoice ${invoice.invoice_number}${quoteNumber ? ` (quote: ${quoteNumber})` : ""}.\n\nTotal: ${totalAmount} ${invoice.currency}\nDue date: ${dueDate}\n\nBest regards,\nSAM Media`
        : isTypeA
          ? [
              greeting,
              `Veuillez trouver ci-joint votre facture ${invoice.invoice_number},`,
              ...(establishmentName
                ? [
                    `relative aux prestations réalisées pour ${establishmentName}.`,
                  ]
                : ["relative aux prestations réalisées."]),
              `Montant TTC : ${totalAmount} ${invoice.currency}`,
              `Échéance : ${dueDate}`.trim(),
              ...(paymentLink ? [`👉 Payer en ligne : ${paymentLink}`] : []),
              "Merci pour votre confiance,",
              "SAM Media",
            ].join("\n\n")
          : [
              greeting,
              `Veuillez trouver ci-joint votre facture ${invoice.invoice_number} concernant les services de visibilité fournis.`,
              `Société : ${companyName}`,
              `Montant TTC : ${totalAmount} ${invoice.currency}`,
              `Échéance : ${dueDate}`.trim(),
              ...(paymentLink ? [`👉 Payer en ligne : ${paymentLink}`] : []),
              "Cordialement,",
              "L’équipe SAM Media",
            ].join("\n\n");

    const emailId = randomBytes(16).toString("hex");

    const company = await getBillingCompanyProfile();
    const invoicePdf = await generateMediaInvoicePdfBuffer({
      company,
      invoice: invoice as any,
      items: (invoice.items ?? []).map((it: any) => ({
        name_snapshot: String(it.name_snapshot ?? ""),
        description_snapshot: it.description_snapshot ?? null,
        quantity: Number(it.quantity ?? 0),
        unit_price_snapshot: Number(it.unit_price_snapshot ?? 0),
        tax_rate_snapshot: Number(it.tax_rate_snapshot ?? 0),
        line_total: Number(it.line_total ?? 0),
      })),
    });

    const sent = await sendLoggedEmail({
      emailId,
      fromKey: "finance",
      to: [toEmail],
      subject,
      bodyText,
      attachments: [
        {
          filename: `${invoice.invoice_number}.pdf`,
          content: invoicePdf,
          contentType: "application/pdf",
        },
      ],
      variables: {
        invoice_number: String(invoice.invoice_number ?? ""),
        quote_number: quoteNumber,
        total_amount: String(totalAmount),
        currency: String(invoice.currency ?? ""),
        due_date: dueDate,
        contact_name: contactName,
        company_name: companyName,
        establishment_name: establishmentName,
        payment_link: paymentLink,
        pro_client_type: proClientType,
      },
      meta: {
        kind: "media_invoice",
        invoice_id: invoiceId,
        pro_user_id: safeString((invoice as any).pro_user_id) || null,
        pro_client_type: proClientType,
      },
    });

    if (sent.ok !== true) return res.status(500).json({ error: sent.error });

    await supabase.from("admin_audit_log").insert({
      action: "media.invoice.send_email",
      entity_type: "media_invoices",
      entity_id: invoiceId,
      metadata: {
        to: toEmail,
        lang,
        email_id: sent.emailId,
        pro_user_id: safeString((invoice as any).pro_user_id) || null,
        pro_client_type: proClientType,
        actor: getAdminSessionSubAny(req),
      },
    });

    return res.json({ ok: true, email_id: sent.emailId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const markAdminMediaInvoicePaid: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const invoiceId = typeof req.params.id === "string" ? req.params.id : "";
  if (!invoiceId) return res.status(400).json({ error: "Identifiant requis" });

  const body = isRecord(req.body)
    ? (req.body as MediaMarkInvoicePaidInput)
    : ({} as MediaMarkInvoicePaidInput);

  const amount = roundMoney(safeMoneyNumber(body.amount));
  if (!amount || amount <= 0)
    return res.status(400).json({ error: "amount must be > 0" });

  const methodRaw =
    typeof body.method === "string" ? body.method.trim().toLowerCase() : "";
  const method =
    methodRaw === "card" ||
    methodRaw === "bank_transfer" ||
    methodRaw === "cash" ||
    methodRaw === "other"
      ? methodRaw
      : "other";

  const paidAt = safeIsoOrNull(body.paid_at) ?? new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: invoice, error: invErr } = await supabase
    .from("media_invoices")
    .select("id,total_amount,paid_amount,status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

  const total = Number((invoice as any).total_amount ?? 0);
  const prevPaid = Number((invoice as any).paid_amount ?? 0);
  const nextPaid = roundMoney(prevPaid + amount);

  const nextStatus = nextPaid >= total ? "paid" : "partial";

  const { error: payErr } = await supabase
    .from("media_invoice_payments")
    .insert({
      invoice_id: invoiceId,
      method,
      amount,
      reference: safeString(body.reference),
      paid_at: paidAt,
    });
  if (payErr) return res.status(500).json({ error: payErr.message });

  const { error: updErr } = await supabase
    .from("media_invoices")
    .update({
      paid_amount: nextPaid,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  if (updErr) return res.status(500).json({ error: updErr.message });

  await supabase.from("admin_audit_log").insert({
    action: "media.invoice.mark_paid",
    entity_type: "media_invoices",
    entity_id: invoiceId,
    metadata: {
      amount,
      method,
      reference: safeString(body.reference),
      paid_at: paidAt,
      actor: getAdminSessionSubAny(req),
    },
  });

  const next = await getMediaInvoiceWithItems({ supabase, invoiceId });
  return res.json({ ok: true, invoice: next });
};

export const listAdminEstablishmentConversations: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_conversations")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as ProConversationRow[] });
};

export const listAdminEstablishmentConversationMessages: RequestHandler =
  async (req, res) => {
    if (!requireAdminKey(req, res)) return;

    const establishmentId =
      typeof req.params.id === "string" ? req.params.id : "";
    const conversationId =
      typeof req.params.conversationId === "string"
        ? req.params.conversationId
        : "";
    if (!establishmentId)
      return res.status(400).json({ error: "Identifiant requis" });
    if (!conversationId)
      return res.status(400).json({ error: "Identifiant de conversation requis" });

    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("pro_messages")
      .select("*")
      .eq("establishment_id", establishmentId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ items: (data ?? []) as ProMessageRow[] });
  };

type SupportTicketRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  priority: string;
  establishment_id: string | null;
  created_by_user_id: string | null;
  created_by_role: string | null;
  subject: string;
  body: string;
  assignee_user_id: string | null;
};

type SupportTicketMessageRow = {
  id: string;
  ticket_id: string;
  created_at: string;
  from_role: string;
  author_user_id: string | null;
  body: string;
  is_internal: boolean;
  meta: unknown;
};

export const listAdminSupportTickets: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "open";
  const priority =
    typeof req.query.priority === "string"
      ? req.query.priority.trim().toLowerCase()
      : "all";
  const role =
    typeof req.query.role === "string"
      ? req.query.role.trim().toLowerCase()
      : "all";

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const safeLimit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const supabase = getAdminSupabase();

  let q = supabase
    .from("support_tickets")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(safeLimit);
  if (status && status !== "all") q = q.eq("status", status);
  if (priority && priority !== "all") q = q.eq("priority", priority);
  if (role && role !== "all") q = q.eq("created_by_role", role);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as SupportTicketRow[] });
};

export const getAdminSupportTicket: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json({ item: data as SupportTicketRow });
};

export const listAdminSupportTicketMessages: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const ticketId = typeof req.params.id === "string" ? req.params.id : "";
  if (!ticketId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("support_ticket_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .limit(1000);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as SupportTicketMessageRow[] });
};

export const postAdminSupportTicketMessage: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const ticketId = typeof req.params.id === "string" ? req.params.id : "";
  if (!ticketId) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const body = asString(req.body.body);
  const isInternal =
    typeof req.body.is_internal === "boolean" ? req.body.is_internal : false;

  if (!body) return res.status(400).json({ error: "Contenu requis" });

  const supabase = getAdminSupabase();
  const createdAt = new Date().toISOString();

  const { data: inserted, error: insertErr } = await supabase
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticketId,
      from_role: "admin",
      author_user_id: null,
      body,
      is_internal: isInternal,
      created_at: createdAt,
    })
    .select("*")
    .single();

  if (insertErr) return res.status(500).json({ error: insertErr.message });

  const { error: touchErr } = await supabase
    .from("support_tickets")
    .update({ updated_at: createdAt })
    .eq("id", ticketId);

  if (touchErr) return res.status(500).json({ error: touchErr.message });

  await supabase.from("admin_audit_log").insert({
    action: "support.ticket.message",
    entity_type: "support_tickets",
    entity_id: ticketId,
    metadata: { is_internal: isInternal },
  });

  res.json({ ok: true, item: inserted as SupportTicketMessageRow });
};

export const updateAdminSupportTicket: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const ticketId = typeof req.params.id === "string" ? req.params.id : "";
  if (!ticketId) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const status = asString(req.body.status);
  const priority = asString(req.body.priority);
  const assigneeUserId = asString(req.body.assignee_user_id);

  const patch: Record<string, unknown> = {};
  if (status !== undefined) patch.status = status || null;
  if (priority !== undefined) patch.priority = priority || null;
  if (assigneeUserId !== undefined)
    patch.assignee_user_id = assigneeUserId || null;
  patch.updated_at = new Date().toISOString();

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("support_tickets")
    .update(patch)
    .eq("id", ticketId)
    .select("*");

  if (error) return res.status(500).json({ error: error.message });
  if (!data || !Array.isArray(data) || !data.length)
    return res.status(404).json({ error: "Introuvable" });

  await supabase.from("admin_audit_log").insert({
    action: "support.ticket.update",
    entity_type: "support_tickets",
    entity_id: ticketId,
    metadata: { patch },
  });

  res.json({ ok: true });
};

type ContentPageRow = {
  id: string;

  // Stable internal key + public slugs
  page_key: string;
  slug: string;
  slug_fr: string;
  slug_en: string;

  // status
  status: "draft" | "published" | string;
  is_published: boolean;

  // legacy/compat
  title: string;
  body_markdown: string;

  created_at: string;
  updated_at: string;

  // UI
  title_fr: string;
  title_en: string;
  page_subtitle_fr: string;
  page_subtitle_en: string;

  // legacy html (still supported)
  body_html_fr: string;
  body_html_en: string;

  // SEO (preferred)
  seo_title_fr: string;
  seo_title_en: string;
  seo_description_fr: string;
  seo_description_en: string;

  // SEO legacy (compat)
  meta_title_fr: string;
  meta_title_en: string;
  meta_description_fr: string;
  meta_description_en: string;

  // OG
  og_title_fr: string;
  og_title_en: string;
  og_description_fr: string;
  og_description_en: string;
  og_image_url: string | null;

  canonical_url_fr: string;
  canonical_url_en: string;
  robots: string;

  show_toc: boolean;
  related_links: unknown;

  schema_jsonld_fr: unknown;
  schema_jsonld_en: unknown;
};

type FaqArticleRow = {
  id: string;
  created_at: string;
  updated_at: string;
  is_published: boolean;
  category: string | null;
  display_order: number;
  title: string;
  body: string;
  question_fr: string;
  question_en: string;
  answer_html_fr: string;
  answer_html_en: string;
  tags: string[] | null;
};

export const listAdminContentPages: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("content_pages")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as ContentPageRow[] });
};

export const createAdminContentPage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const slug = asString(req.body.slug);

  // New: stable key + locale slugs
  const pageKey = asString(req.body.page_key) ?? null;
  const slugFr = asString(req.body.slug_fr) ?? slug ?? null;
  const slugEn = asString(req.body.slug_en) ?? slug ?? null;

  // status
  const isPublished =
    typeof req.body.is_published === "boolean" ? req.body.is_published : false;
  const statusRaw = asString(req.body.status);
  const status =
    statusRaw === "published" || statusRaw === "draft"
      ? statusRaw
      : isPublished
        ? "published"
        : "draft";

  if (!slug) return res.status(400).json({ error: "Slug requis" });
  if (!slugFr) return res.status(400).json({ error: "Slug français requis" });
  if (!slugEn) return res.status(400).json({ error: "Slug anglais requis" });

  // Legacy fields (kept for backward compatibility)
  const legacyTitle = asString(req.body.title);
  const legacyBodyMarkdown = asString(req.body.body_markdown) ?? "";

  // New bilingual fields
  const titleFr = asString(req.body.title_fr) ?? "";
  const titleEn = asString(req.body.title_en) ?? "";
  const subtitleFr = asString(req.body.page_subtitle_fr) ?? "";
  const subtitleEn = asString(req.body.page_subtitle_en) ?? "";

  const bodyHtmlFr = asString(req.body.body_html_fr) ?? "";
  const bodyHtmlEn = asString(req.body.body_html_en) ?? "";

  // SEO (preferred)
  const seoTitleFr = asString(req.body.seo_title_fr) ?? "";
  const seoTitleEn = asString(req.body.seo_title_en) ?? "";
  const seoDescriptionFr = asString(req.body.seo_description_fr) ?? "";
  const seoDescriptionEn = asString(req.body.seo_description_en) ?? "";

  // SEO legacy (compat)
  const metaTitleFr = asString(req.body.meta_title_fr) ?? "";
  const metaTitleEn = asString(req.body.meta_title_en) ?? "";
  const metaDescriptionFr = asString(req.body.meta_description_fr) ?? "";
  const metaDescriptionEn = asString(req.body.meta_description_en) ?? "";

  // OG
  const ogTitleFr = asString(req.body.og_title_fr) ?? "";
  const ogTitleEn = asString(req.body.og_title_en) ?? "";
  const ogDescriptionFr = asString(req.body.og_description_fr) ?? "";
  const ogDescriptionEn = asString(req.body.og_description_en) ?? "";
  const ogImageUrl = asString(req.body.og_image_url);

  const canonicalUrlFr = asString(req.body.canonical_url_fr) ?? "";
  const canonicalUrlEn = asString(req.body.canonical_url_en) ?? "";
  const robots = asString(req.body.robots) ?? "";

  const showToc =
    typeof req.body.show_toc === "boolean" ? req.body.show_toc : false;
  const relatedLinks = req.body.related_links ?? [];
  const schemaJsonLdFr = req.body.schema_jsonld_fr ?? null;
  const schemaJsonLdEn = req.body.schema_jsonld_en ?? null;

  const title = (titleFr || titleEn || legacyTitle || "").trim();
  if (!title)
    return res.status(400).json({ error: "Titre requis (title_fr ou title)" });

  const now = new Date().toISOString();
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("content_pages")
    .insert({
      // Keep legacy slug aligned with FR slug for backward compatibility.
      slug: slugFr,
      page_key: pageKey ?? slugFr,
      slug_fr: slugFr,
      slug_en: slugEn,
      status,
      title,
      body_markdown: legacyBodyMarkdown,
      is_published: isPublished,
      title_fr: titleFr,
      title_en: titleEn,
      page_subtitle_fr: subtitleFr,
      page_subtitle_en: subtitleEn,
      body_html_fr: bodyHtmlFr,
      body_html_en: bodyHtmlEn,
      seo_title_fr: seoTitleFr,
      seo_title_en: seoTitleEn,
      seo_description_fr: seoDescriptionFr,
      seo_description_en: seoDescriptionEn,
      meta_title_fr: metaTitleFr,
      meta_title_en: metaTitleEn,
      meta_description_fr: metaDescriptionFr,
      meta_description_en: metaDescriptionEn,
      og_title_fr: ogTitleFr,
      og_title_en: ogTitleEn,
      og_description_fr: ogDescriptionFr,
      og_description_en: ogDescriptionEn,
      og_image_url: ogImageUrl ?? null,
      canonical_url_fr: canonicalUrlFr,
      canonical_url_en: canonicalUrlEn,
      robots,
      show_toc: showToc,
      related_links: relatedLinks,
      schema_jsonld_fr: schemaJsonLdFr,
      schema_jsonld_en: schemaJsonLdEn,
      updated_at: now,
      created_at: now,
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "content.page.create",
    entity_type: "content_pages",
    entity_id: (data as any)?.id ?? null,
    metadata: { slug, is_published: isPublished },
  });

  res.json({ item: data as ContentPageRow });
};

export const updateAdminContentPage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const slug = asString(req.body.slug); // legacy
  const pageKey = asString(req.body.page_key);
  const slugFr = asString(req.body.slug_fr);
  const slugEn = asString(req.body.slug_en);
  const statusRaw = asString(req.body.status);
  const status =
    statusRaw === "published" || statusRaw === "draft" ? statusRaw : undefined;

  // Legacy
  const legacyTitle = asString(req.body.title);
  const legacyBodyMarkdown = asString(req.body.body_markdown);

  // New bilingual fields
  const titleFr = asString(req.body.title_fr);
  const titleEn = asString(req.body.title_en);
  const subtitleFr = asString(req.body.page_subtitle_fr);
  const subtitleEn = asString(req.body.page_subtitle_en);

  const bodyHtmlFr = asString(req.body.body_html_fr);
  const bodyHtmlEn = asString(req.body.body_html_en);

  const seoTitleFr = asString(req.body.seo_title_fr);
  const seoTitleEn = asString(req.body.seo_title_en);
  const seoDescriptionFr = asString(req.body.seo_description_fr);
  const seoDescriptionEn = asString(req.body.seo_description_en);

  const metaTitleFr = asString(req.body.meta_title_fr);
  const metaTitleEn = asString(req.body.meta_title_en);
  const metaDescriptionFr = asString(req.body.meta_description_fr);
  const metaDescriptionEn = asString(req.body.meta_description_en);

  const ogTitleFr = asString(req.body.og_title_fr);
  const ogTitleEn = asString(req.body.og_title_en);
  const ogDescriptionFr = asString(req.body.og_description_fr);
  const ogDescriptionEn = asString(req.body.og_description_en);
  const ogImageUrl = asString(req.body.og_image_url);

  const canonicalUrlFr = asString(req.body.canonical_url_fr);
  const canonicalUrlEn = asString(req.body.canonical_url_en);
  const robots = asString(req.body.robots);

  const showToc =
    typeof req.body.show_toc === "boolean" ? req.body.show_toc : undefined;
  const relatedLinks = req.body.related_links;
  const schemaJsonLdFr = req.body.schema_jsonld_fr;
  const schemaJsonLdEn = req.body.schema_jsonld_en;

  const isPublished =
    typeof req.body.is_published === "boolean"
      ? req.body.is_published
      : undefined;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (pageKey !== undefined) patch.page_key = pageKey;

  // Legacy slug support (keep), but prefer slug_fr as the public slug.
  if (slugFr !== undefined) {
    patch.slug_fr = slugFr;
    patch.slug = slugFr;
  } else if (slug !== undefined) {
    patch.slug = slug;
  }

  if (slugEn !== undefined) patch.slug_en = slugEn;
  if (status !== undefined) patch.status = status;

  if (legacyTitle !== undefined) patch.title = legacyTitle;
  if (legacyBodyMarkdown !== undefined)
    patch.body_markdown = legacyBodyMarkdown;

  if (titleFr !== undefined) patch.title_fr = titleFr;
  if (titleEn !== undefined) patch.title_en = titleEn;
  if (subtitleFr !== undefined) patch.page_subtitle_fr = subtitleFr;
  if (subtitleEn !== undefined) patch.page_subtitle_en = subtitleEn;

  if (bodyHtmlFr !== undefined) patch.body_html_fr = bodyHtmlFr;
  if (bodyHtmlEn !== undefined) patch.body_html_en = bodyHtmlEn;

  if (seoTitleFr !== undefined) patch.seo_title_fr = seoTitleFr;
  if (seoTitleEn !== undefined) patch.seo_title_en = seoTitleEn;
  if (seoDescriptionFr !== undefined)
    patch.seo_description_fr = seoDescriptionFr;
  if (seoDescriptionEn !== undefined)
    patch.seo_description_en = seoDescriptionEn;

  if (metaTitleFr !== undefined) patch.meta_title_fr = metaTitleFr;
  if (metaTitleEn !== undefined) patch.meta_title_en = metaTitleEn;
  if (metaDescriptionFr !== undefined)
    patch.meta_description_fr = metaDescriptionFr;
  if (metaDescriptionEn !== undefined)
    patch.meta_description_en = metaDescriptionEn;

  if (ogTitleFr !== undefined) patch.og_title_fr = ogTitleFr;
  if (ogTitleEn !== undefined) patch.og_title_en = ogTitleEn;
  if (ogDescriptionFr !== undefined) patch.og_description_fr = ogDescriptionFr;
  if (ogDescriptionEn !== undefined) patch.og_description_en = ogDescriptionEn;
  if (ogImageUrl !== undefined) patch.og_image_url = ogImageUrl || null;

  if (canonicalUrlFr !== undefined) patch.canonical_url_fr = canonicalUrlFr;
  if (canonicalUrlEn !== undefined) patch.canonical_url_en = canonicalUrlEn;
  if (robots !== undefined) patch.robots = robots;

  if (showToc !== undefined) patch.show_toc = showToc;
  if (relatedLinks !== undefined) patch.related_links = relatedLinks;
  if (schemaJsonLdFr !== undefined) patch.schema_jsonld_fr = schemaJsonLdFr;
  if (schemaJsonLdEn !== undefined) patch.schema_jsonld_en = schemaJsonLdEn;

  if (isPublished !== undefined) patch.is_published = isPublished;

  // Keep legacy title in sync if bilingual title changes but legacy title wasn't explicitly sent.
  const shouldSyncLegacyTitle =
    legacyTitle === undefined &&
    (titleFr !== undefined || titleEn !== undefined);
  if (shouldSyncLegacyTitle) {
    patch.title = (titleFr ?? "").trim() || (titleEn ?? "").trim() || "";
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("content_pages")
    .update(patch)
    .eq("id", id)
    .select("*");
  if (error) return res.status(500).json({ error: error.message });
  if (!data || !Array.isArray(data) || !data.length)
    return res.status(404).json({ error: "Introuvable" });

  await supabase.from("admin_audit_log").insert({
    action: "content.page.update",
    entity_type: "content_pages",
    entity_id: id,
    metadata: { patch },
  });

  res.json({ ok: true });
};

type ContentPageBlockRow = {
  id: string;
  page_id: string;
  sort_order: number;
  type: string;
  is_enabled: boolean;
  data: unknown;
  data_fr: unknown;
  data_en: unknown;
  created_at: string;
  updated_at: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function mergeBlockData(shared: unknown, localized: unknown): unknown {
  if (isPlainObject(shared) && isPlainObject(localized))
    return { ...shared, ...localized };
  if (localized !== undefined && localized !== null) return localized;
  return shared;
}

export const listAdminContentPageBlocks: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const pageId = typeof req.params.id === "string" ? req.params.id : "";
  if (!pageId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("content_page_blocks")
    .select("*")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as ContentPageBlockRow[] });
};

export const replaceAdminContentPageBlocks: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const pageId = typeof req.params.id === "string" ? req.params.id : "";
  if (!pageId) return res.status(400).json({ error: "Identifiant requis" });

  const body = req.body;
  const blocksRaw = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.blocks)
      ? body.blocks
      : null;
  if (!blocksRaw)
    return res.status(400).json({ error: "Tableau de blocs requis" });

  const now = new Date().toISOString();
  const blocks = blocksRaw
    .map((b) => (isRecord(b) ? b : null))
    .filter((b): b is Record<string, unknown> => !!b)
    .map((b, idx) => {
      const type = asString(b.type) ?? "";
      const isEnabled = typeof b.is_enabled === "boolean" ? b.is_enabled : true;
      const data = b.data !== undefined ? b.data : {};
      const dataFr = b.data_fr !== undefined ? b.data_fr : {};
      const dataEn = b.data_en !== undefined ? b.data_en : {};

      return {
        page_id: pageId,
        sort_order: idx,
        type,
        is_enabled: isEnabled,
        data,
        data_fr: dataFr,
        data_en: dataEn,
        created_at: now,
        updated_at: now,
      };
    })
    .filter((b) => b.type);

  const supabase = getAdminSupabase();

  const { error: deleteErr } = await supabase
    .from("content_page_blocks")
    .delete()
    .eq("page_id", pageId);
  if (deleteErr) return res.status(500).json({ error: deleteErr.message });

  if (blocks.length) {
    const { error: insertErr } = await supabase
      .from("content_page_blocks")
      .insert(blocks);
    if (insertErr) return res.status(500).json({ error: insertErr.message });
  }

  await supabase.from("admin_audit_log").insert({
    action: "content.page.blocks.replace",
    entity_type: "content_pages",
    entity_id: pageId,
    metadata: { count: blocks.length },
  });

  res.json({ ok: true });
};

export const listAdminFaqArticles: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("faq_articles")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as FaqArticleRow[] });
};

export const createAdminFaqArticle: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  // Legacy
  const legacyTitle = asString(req.body.title);
  const legacyBody = asString(req.body.body) ?? "";

  // New bilingual
  const questionFr = asString(req.body.question_fr) ?? "";
  const questionEn = asString(req.body.question_en) ?? "";
  const answerHtmlFr = asString(req.body.answer_html_fr) ?? "";
  const answerHtmlEn = asString(req.body.answer_html_en) ?? "";

  const category = asString(req.body.category) ?? "reservations";
  const displayOrder =
    typeof req.body.display_order === "number" &&
    Number.isFinite(req.body.display_order)
      ? req.body.display_order
      : 0;
  const isPublished =
    typeof req.body.is_published === "boolean" ? req.body.is_published : false;
  const tags = Array.isArray(req.body.tags)
    ? req.body.tags.filter((t) => typeof t === "string")
    : [];

  const title = (questionFr || questionEn || legacyTitle || "").trim();
  if (!title)
    return res.status(400).json({ error: "Question requise (question_fr ou title)" });

  const body = (answerHtmlFr || legacyBody || "").trim();

  const now = new Date().toISOString();
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("faq_articles")
    .insert({
      title,
      body,
      category,
      display_order: displayOrder,
      question_fr: questionFr,
      question_en: questionEn,
      answer_html_fr: answerHtmlFr,
      answer_html_en: answerHtmlEn,
      is_published: isPublished,
      tags,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "content.faq.create",
    entity_type: "faq_articles",
    entity_id: (data as any)?.id ?? null,
    metadata: { is_published: isPublished },
  });

  res.json({ item: data as FaqArticleRow });
};

export const updateAdminFaqArticle: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  // Legacy
  const legacyTitle = asString(req.body.title);
  const legacyBody = asString(req.body.body);

  // New bilingual
  const questionFr = asString(req.body.question_fr);
  const questionEn = asString(req.body.question_en);
  const answerHtmlFr = asString(req.body.answer_html_fr);
  const answerHtmlEn = asString(req.body.answer_html_en);

  const category = asString(req.body.category);
  const displayOrder =
    typeof req.body.display_order === "number" &&
    Number.isFinite(req.body.display_order)
      ? req.body.display_order
      : undefined;
  const isPublished =
    typeof req.body.is_published === "boolean"
      ? req.body.is_published
      : undefined;
  const tags = Array.isArray(req.body.tags)
    ? req.body.tags.filter((t) => typeof t === "string")
    : undefined;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (legacyTitle !== undefined) patch.title = legacyTitle;
  if (legacyBody !== undefined) patch.body = legacyBody;

  if (questionFr !== undefined) patch.question_fr = questionFr;
  if (questionEn !== undefined) patch.question_en = questionEn;
  if (answerHtmlFr !== undefined) patch.answer_html_fr = answerHtmlFr;
  if (answerHtmlEn !== undefined) patch.answer_html_en = answerHtmlEn;

  if (category !== undefined) patch.category = category;
  if (displayOrder !== undefined) patch.display_order = displayOrder;
  if (isPublished !== undefined) patch.is_published = isPublished;
  if (tags !== undefined) patch.tags = tags;

  const shouldSyncLegacyTitle =
    legacyTitle === undefined &&
    (questionFr !== undefined || questionEn !== undefined);
  if (shouldSyncLegacyTitle) {
    patch.title = (questionFr ?? "").trim() || (questionEn ?? "").trim() || "";
  }

  const shouldSyncLegacyBody =
    legacyBody === undefined && answerHtmlFr !== undefined;
  if (shouldSyncLegacyBody) {
    patch.body = answerHtmlFr;
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("faq_articles")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) return res.status(500).json({ error: error.message });
  if (!data || !Array.isArray(data) || !data.length)
    return res.status(404).json({ error: "Introuvable" });

  await supabase.from("admin_audit_log").insert({
    action: "content.faq.update",
    entity_type: "faq_articles",
    entity_id: id,
    metadata: { patch },
  });

  res.json({ ok: true });
};

type BlogArticleRow = {
  id: string;
  slug: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  // legacy/compat
  title: string;
  description_google: string;
  short: string;
  content: string;
  img: string;
  miniature: string;
  // bilingual + SEO
  title_fr: string;
  title_en: string;
  excerpt_fr: string;
  excerpt_en: string;
  body_html_fr: string;
  body_html_en: string;
  meta_title_fr: string;
  meta_title_en: string;
  meta_description_fr: string;
  meta_description_en: string;
  // metadata (compat + phase 1)
  author_name: string;
  category: string;

  author_id: string | null;
  primary_category_id: string | null;
  secondary_category_ids: string[];

  show_read_count: boolean;
  read_count: number;
};

type BlogArticleBlockRow = {
  id: string;
  article_id: string;
  sort_order: number;
  type: string;
  is_enabled: boolean;
  data: unknown;
  data_fr: unknown;
  data_en: unknown;
  created_at: string;
  updated_at: string;
};

function normalizeSlug(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function isSafeUrlForRichText(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  if (v.startsWith("/")) return true;
  if (v.startsWith("#")) return true;
  if (v.startsWith("mailto:")) return true;
  if (v.startsWith("tel:")) return true;

  try {
    const url = new URL(v);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function sanitizeHtmlForStorage(html: string): string {
  const raw = String(html ?? "");
  if (!raw) return "";

  // Best-effort, dependency-free sanitizer.
  // Client-side sanitization already enforces a strict allowlist.
  // This server-side pass is defense-in-depth against script injection.
  let out = raw;

  // Remove script/style/iframe/object/embed blocks entirely.
  out = out.replace(
    /<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
    "",
  );
  out = out.replace(
    /<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/\s*>/gi,
    "",
  );

  // Remove inline event handlers and inline styles.
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Neutralize javascript: and other unsafe href/src.
  out = out.replace(
    /\s(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (_m, attr, full, v1, v2, v3) => {
      const value = String(v1 ?? v2 ?? v3 ?? "").trim();
      if (!isSafeUrlForRichText(value)) {
        const quote = full.startsWith('"')
          ? '"'
          : full.startsWith("'")
            ? "'"
            : '"';
        return ` ${String(attr).toLowerCase()}=${quote}${quote}`;
      }
      return ` ${String(attr).toLowerCase()}=${full}`;
    },
  );

  return out;
}

const BLOG_TEXT_STYLE_TOKENS = new Set([
  "default",
  "primary",
  "secondary",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
]);

type BlogVideoProvider = "youtube" | "vimeo";

function buildBlogVideoEmbedUrl(
  provider: BlogVideoProvider,
  videoId: string,
): string {
  if (provider === "youtube")
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  return `https://player.vimeo.com/video/${videoId}`;
}

function buildBlogVideoThumbnailUrl(
  provider: BlogVideoProvider,
  videoId: string,
): string {
  if (provider === "youtube")
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return `https://vumbnail.com/${videoId}.jpg`;
}

function parseBlogVideoUrlAllowlist(
  input: string,
): { provider: BlogVideoProvider; videoId: string } | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = url.pathname.split("/").filter(Boolean);

  const youtubeIdRegex = /^[a-zA-Z0-9_-]{11}$/;
  const vimeoIdRegex = /^\d+$/;

  if (host === "youtu.be") {
    const id = pathParts[0] ?? "";
    return youtubeIdRegex.test(id)
      ? { provider: "youtube", videoId: id }
      : null;
  }

  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com"
  ) {
    const first = pathParts[0] ?? "";

    const idFromWatch = url.searchParams.get("v") ?? "";
    if (first === "watch" && youtubeIdRegex.test(idFromWatch))
      return { provider: "youtube", videoId: idFromWatch };

    if (
      (first === "embed" || first === "shorts" || first === "live") &&
      youtubeIdRegex.test(pathParts[1] ?? "")
    ) {
      const id = pathParts[1] ?? "";
      return { provider: "youtube", videoId: id };
    }

    return null;
  }

  if (host === "vimeo.com") {
    const id = pathParts[0] ?? "";
    return vimeoIdRegex.test(id) ? { provider: "vimeo", videoId: id } : null;
  }

  if (host === "player.vimeo.com") {
    if ((pathParts[0] ?? "") !== "video") return null;
    const id = pathParts[1] ?? "";
    return vimeoIdRegex.test(id) ? { provider: "vimeo", videoId: id } : null;
  }

  return null;
}

function sanitizeBlogBlockData(type: string, data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;

  const rec = data as Record<string, unknown>;
  let next: Record<string, unknown> | null = null;

  // Blocks that contain HTML: keep a defense-in-depth pass server-side.
  if (type === "rich_text" || type === "accented_text") {
    const html = typeof rec.html === "string" ? rec.html : null;
    if (html != null) {
      next = { ...(next ?? rec), html: sanitizeHtmlForStorage(html) };
    }
  }

  // Tokenized text style (never store arbitrary colors)
  if (type === "accented_text") {
    const raw = typeof rec.textStyle === "string" ? rec.textStyle : null;
    if (raw != null) {
      const token = raw.trim().toLowerCase();
      next = {
        ...(next ?? rec),
        textStyle: BLOG_TEXT_STYLE_TOKENS.has(token) ? token : "default",
      };
    }
  }

  if (type === "image") {
    const rawSrc = typeof rec.src === "string" ? rec.src : null;
    if (rawSrc != null) {
      const trimmed = rawSrc.trim();
      next = {
        ...(next ?? rec),
        src: trimmed && isSafeUrlForRichText(trimmed) ? trimmed : "",
      };
    }

    const ratioRaw = typeof rec.ratio === "string" ? rec.ratio : null;
    if (ratioRaw != null) {
      const r = ratioRaw.trim();
      const allowed =
        r === "auto" || r === "16:9" || r === "4:3" || r === "1:1";
      next = { ...(next ?? rec), ratio: allowed ? r : "auto" };
    }

    const altRaw = typeof rec.alt === "string" ? rec.alt : null;
    if (altRaw != null) {
      next = { ...(next ?? rec), alt: altRaw.trim() };
    }

    const captionRaw = typeof rec.caption === "string" ? rec.caption : null;
    if (captionRaw != null) {
      next = { ...(next ?? rec), caption: captionRaw.trim() };
    }
  }

  if (type === "document") {
    const urlRaw = typeof rec.url === "string" ? rec.url : null;
    if (urlRaw != null) {
      const trimmed = urlRaw.trim();
      next = {
        ...(next ?? rec),
        url: trimmed && isSafeUrlForRichText(trimmed) ? trimmed : "",
      };
    }

    const fileNameRaw =
      typeof rec.file_name === "string" ? rec.file_name : null;
    if (fileNameRaw != null) {
      const cleaned = fileNameRaw.trim().slice(0, 200);
      next = { ...(next ?? rec), file_name: cleaned };
    }

    const sizeRaw = rec.size_bytes;
    if (typeof sizeRaw === "number" && Number.isFinite(sizeRaw)) {
      next = { ...(next ?? rec), size_bytes: Math.max(0, Math.floor(sizeRaw)) };
    }

    const titleRaw = typeof rec.title === "string" ? rec.title : null;
    if (titleRaw != null) {
      next = { ...(next ?? rec), title: titleRaw.trim() };
    }

    const ctaRaw = typeof rec.cta_label === "string" ? rec.cta_label : null;
    if (ctaRaw != null) {
      next = { ...(next ?? rec), cta_label: ctaRaw.trim() };
    }
  }

  if (type === "video") {
    const urlRaw = typeof rec.url === "string" ? rec.url : null;
    const providerRaw = typeof rec.provider === "string" ? rec.provider : null;
    const videoIdRaw = typeof rec.video_id === "string" ? rec.video_id : null;

    const captionRaw = typeof rec.caption === "string" ? rec.caption : null;

    // Only apply provider/url sanitization if this record is the shared data object.
    if (urlRaw != null || providerRaw != null || videoIdRaw != null) {
      const trimmedUrl = urlRaw ? urlRaw.trim() : "";

      let provider: BlogVideoProvider | null = null;
      let videoId: string | null = null;

      if (trimmedUrl) {
        const parsed = parseBlogVideoUrlAllowlist(trimmedUrl);
        if (parsed) {
          provider = parsed.provider;
          videoId = parsed.videoId;
        }
      }

      // Fallback: accept provider + id only when strictly validated.
      if (!provider || !videoId) {
        const p = (providerRaw ?? "").trim().toLowerCase();
        const id = (videoIdRaw ?? "").trim();
        const youtubeIdRegex = /^[a-zA-Z0-9_-]{11}$/;
        const vimeoIdRegex = /^\d+$/;

        if (p === "youtube" && youtubeIdRegex.test(id)) {
          provider = "youtube";
          videoId = id;
        } else if (p === "vimeo" && vimeoIdRegex.test(id)) {
          provider = "vimeo";
          videoId = id;
        }
      }

      next = {
        ...(next ?? rec),
        url: provider && videoId ? trimmedUrl : "",
        provider: provider ?? "",
        video_id: videoId ?? "",
        embed_url:
          provider && videoId ? buildBlogVideoEmbedUrl(provider, videoId) : "",
        thumbnail_url:
          provider && videoId
            ? buildBlogVideoThumbnailUrl(provider, videoId)
            : "",
      };
    }

    // Localized fields
    if (captionRaw != null) {
      next = { ...(next ?? rec), caption: captionRaw.trim() };
    }
  }

  if (type === "poll") {
    const pollIdRaw = typeof rec.poll_id === "string" ? rec.poll_id : null;
    if (pollIdRaw != null) {
      const trimmed = pollIdRaw.trim();
      next = {
        ...(next ?? rec),
        poll_id: trimmed && isUuid(trimmed) ? trimmed : "",
      };
    }

    const questionRaw = typeof rec.question === "string" ? rec.question : null;
    if (questionRaw != null) {
      next = { ...(next ?? rec), question: questionRaw.trim().slice(0, 240) };
    }

    const optionsRaw = rec.options;
    if (Array.isArray(optionsRaw)) {
      const cleaned = optionsRaw
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean)
        .slice(0, 12);
      next = { ...(next ?? rec), options: cleaned };
    }
  }

  return next ?? data;
}

export const listAdminCmsBlogArticles: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("blog_articles")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as BlogArticleRow[] });
};

export const createAdminCmsBlogArticle: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const slug = normalizeSlug(asString(req.body.slug));
  if (!slug || !isValidSlug(slug))
    return res.status(400).json({ error: "Slug requis" });

  // Legacy fields (kept for compatibility with Mode A UI)
  const legacyTitle = asString(req.body.title) ?? "";
  const legacyDescription = asString(req.body.description_google) ?? "";
  const legacyShort = asString(req.body.short) ?? "";
  const legacyContent = asString(req.body.content) ?? "";
  const img = asString(req.body.img) ?? "";
  const miniature = asString(req.body.miniature) ?? "";

  // Bilingual
  const titleFr = asString(req.body.title_fr) ?? "";
  const titleEn = asString(req.body.title_en) ?? "";
  const excerptFr = asString(req.body.excerpt_fr) ?? "";
  const excerptEn = asString(req.body.excerpt_en) ?? "";
  const bodyHtmlFr = sanitizeHtmlForStorage(
    asString(req.body.body_html_fr) ?? "",
  );
  const bodyHtmlEn = sanitizeHtmlForStorage(
    asString(req.body.body_html_en) ?? "",
  );

  // SEO
  const metaTitleFr = asString(req.body.meta_title_fr) ?? "";
  const metaTitleEn = asString(req.body.meta_title_en) ?? "";
  const metaDescriptionFr = asString(req.body.meta_description_fr) ?? "";
  const metaDescriptionEn = asString(req.body.meta_description_en) ?? "";

  const supabase = getAdminSupabase();

  const authorNameInput = asString(req.body.author_name) ?? "";
  const authorIdRaw = asString(req.body.author_id);
  const authorId = authorIdRaw && isUuid(authorIdRaw) ? authorIdRaw : null;

  const primaryCategoryIdRaw = asString(req.body.primary_category_id);
  const primaryCategoryId =
    primaryCategoryIdRaw && isUuid(primaryCategoryIdRaw)
      ? primaryCategoryIdRaw
      : null;

  const secondaryCategoryIds = Array.isArray(req.body.secondary_category_ids)
    ? req.body.secondary_category_ids
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter((v): v is string => Boolean(v && isUuid(v)))
    : [];

  const showReadCount =
    typeof req.body.show_read_count === "boolean"
      ? req.body.show_read_count
      : false;

  const publishedAtRaw = asString(req.body.published_at);
  const publishedAtOverride =
    publishedAtRaw && Number.isFinite(Date.parse(publishedAtRaw))
      ? new Date(publishedAtRaw).toISOString()
      : null;

  let authorName = authorNameInput;
  if (authorId) {
    const { data: authorData } = await supabase
      .from("blog_authors")
      .select("display_name")
      .eq("id", authorId)
      .limit(1);
    const row = Array.isArray(authorData) ? (authorData[0] as any) : null;
    if (row?.display_name) authorName = String(row.display_name);
  }

  let category = asString(req.body.category) ?? "";
  if (primaryCategoryId) {
    const { data: categoryData } = await supabase
      .from("blog_categories")
      .select("slug")
      .eq("id", primaryCategoryId)
      .limit(1);
    const row = Array.isArray(categoryData) ? (categoryData[0] as any) : null;
    if (row?.slug) category = String(row.slug);
  }

  const isPublished =
    typeof req.body.is_published === "boolean" ? req.body.is_published : false;

  const title = (titleFr || titleEn || legacyTitle).trim();
  if (!title)
    return res.status(400).json({ error: "Titre requis (title_fr ou title)" });

  const now = new Date().toISOString();
  const publishedAt = isPublished ? (publishedAtOverride ?? now) : null;

  const { data, error } = await supabase
    .from("blog_articles")
    .insert({
      slug,
      is_published: isPublished,
      published_at: publishedAt,
      created_at: now,
      updated_at: now,

      title,
      description_google: legacyDescription,
      short: legacyShort,
      content: legacyContent,
      img,
      miniature,

      title_fr: titleFr,
      title_en: titleEn,
      excerpt_fr: excerptFr,
      excerpt_en: excerptEn,
      body_html_fr: bodyHtmlFr,
      body_html_en: bodyHtmlEn,
      meta_title_fr: metaTitleFr,
      meta_title_en: metaTitleEn,
      meta_description_fr: metaDescriptionFr,
      meta_description_en: metaDescriptionEn,

      author_name: authorName,
      category,

      author_id: authorId,
      primary_category_id: primaryCategoryId,
      secondary_category_ids: secondaryCategoryIds,
      show_read_count: showReadCount,
      read_count: 0,
    })
    .select("*")
    .single();

  if (error) {
    const msg = error.message ?? "";
    if (
      msg.toLowerCase().includes("duplicate") ||
      msg.toLowerCase().includes("unique")
    ) {
      return res.status(409).json({ error: "Ce slug existe déjà" });
    }
    return res.status(500).json({ error: msg });
  }

  await supabase.from("admin_audit_log").insert({
    action: "content.blog.create",
    entity_type: "blog_articles",
    entity_id: (data as any)?.id ?? null,
    metadata: { slug, is_published: isPublished },
  });

  res.json({ item: data as BlogArticleRow });
};

export const updateAdminCmsBlogArticle: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const slugRaw = asString(req.body.slug);
  const slug = slugRaw !== undefined ? normalizeSlug(slugRaw) : undefined;
  if (slug !== undefined && (!slug || !isValidSlug(slug)))
    return res.status(400).json({ error: "Slug invalide" });

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (slug !== undefined) patch.slug = slug;

  const supabase = getAdminSupabase();

  const publishedAtRaw = asString(req.body.published_at);
  const publishedAtOverride =
    publishedAtRaw && Number.isFinite(Date.parse(publishedAtRaw))
      ? new Date(publishedAtRaw).toISOString()
      : null;

  if (typeof req.body.is_published === "boolean") {
    patch.is_published = req.body.is_published;
    patch.published_at = req.body.is_published
      ? (publishedAtOverride ?? new Date().toISOString())
      : null;
  } else if (publishedAtOverride) {
    const { data: currentData, error: currentErr } = await supabase
      .from("blog_articles")
      .select("is_published")
      .eq("id", id)
      .limit(1);

    if (!currentErr) {
      const current = Array.isArray(currentData)
        ? (currentData[0] as any)
        : null;
      if (current?.is_published) {
        patch.published_at = publishedAtOverride;
      }
    }
  }

  // legacy
  const legacyTitle = asString(req.body.title);
  const legacyDescription = asString(req.body.description_google);
  const legacyShort = asString(req.body.short);
  const legacyContent = asString(req.body.content);
  const img = asString(req.body.img);
  const miniature = asString(req.body.miniature);

  if (legacyTitle !== undefined) patch.title = legacyTitle;
  if (legacyDescription !== undefined)
    patch.description_google = legacyDescription;
  if (legacyShort !== undefined) patch.short = legacyShort;
  if (legacyContent !== undefined) patch.content = legacyContent;
  if (img !== undefined) patch.img = img;
  if (miniature !== undefined) patch.miniature = miniature;

  // bilingual
  const titleFr = asString(req.body.title_fr);
  const titleEn = asString(req.body.title_en);
  const excerptFr = asString(req.body.excerpt_fr);
  const excerptEn = asString(req.body.excerpt_en);
  const bodyHtmlFr = asString(req.body.body_html_fr);
  const bodyHtmlEn = asString(req.body.body_html_en);

  if (titleFr !== undefined) patch.title_fr = titleFr;
  if (titleEn !== undefined) patch.title_en = titleEn;
  if (excerptFr !== undefined) patch.excerpt_fr = excerptFr;
  if (excerptEn !== undefined) patch.excerpt_en = excerptEn;
  if (bodyHtmlFr !== undefined)
    patch.body_html_fr = sanitizeHtmlForStorage(bodyHtmlFr);
  if (bodyHtmlEn !== undefined)
    patch.body_html_en = sanitizeHtmlForStorage(bodyHtmlEn);

  // SEO
  const metaTitleFr = asString(req.body.meta_title_fr);
  const metaTitleEn = asString(req.body.meta_title_en);
  const metaDescriptionFr = asString(req.body.meta_description_fr);
  const metaDescriptionEn = asString(req.body.meta_description_en);

  if (metaTitleFr !== undefined) patch.meta_title_fr = metaTitleFr;
  if (metaTitleEn !== undefined) patch.meta_title_en = metaTitleEn;
  if (metaDescriptionFr !== undefined)
    patch.meta_description_fr = metaDescriptionFr;
  if (metaDescriptionEn !== undefined)
    patch.meta_description_en = metaDescriptionEn;

  const authorIdRaw = asString(req.body.author_id);
  if (authorIdRaw !== undefined) {
    const authorId = authorIdRaw && isUuid(authorIdRaw) ? authorIdRaw : null;
    patch.author_id = authorId;

    if (authorId) {
      const { data: authorData } = await supabase
        .from("blog_authors")
        .select("display_name")
        .eq("id", authorId)
        .limit(1);
      const row = Array.isArray(authorData) ? (authorData[0] as any) : null;
      patch.author_name = row?.display_name ? String(row.display_name) : "";
    } else {
      patch.author_name = "";
    }
  }

  const primaryCategoryIdRaw = asString(req.body.primary_category_id);
  if (primaryCategoryIdRaw !== undefined) {
    const primaryCategoryId =
      primaryCategoryIdRaw && isUuid(primaryCategoryIdRaw)
        ? primaryCategoryIdRaw
        : null;
    patch.primary_category_id = primaryCategoryId;

    if (primaryCategoryId) {
      const { data: categoryData } = await supabase
        .from("blog_categories")
        .select("slug")
        .eq("id", primaryCategoryId)
        .limit(1);
      const row = Array.isArray(categoryData) ? (categoryData[0] as any) : null;
      patch.category = row?.slug ? String(row.slug) : "";
    } else {
      patch.category = "";
    }
  }

  if (Array.isArray(req.body.secondary_category_ids)) {
    patch.secondary_category_ids = req.body.secondary_category_ids
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v): v is string => Boolean(v && isUuid(v)));
  }

  if (typeof req.body.show_read_count === "boolean")
    patch.show_read_count = req.body.show_read_count;

  // Moderation handling for blogger articles
  const moderationStatus = asString(req.body.moderation_status);
  if (moderationStatus && ["draft", "pending", "approved", "rejected"].includes(moderationStatus)) {
    patch.moderation_status = moderationStatus;
    if (moderationStatus === "approved") {
      patch.moderation_reviewed_at = new Date().toISOString();
      patch.moderation_note = null;
    } else if (moderationStatus === "rejected") {
      patch.moderation_reviewed_at = new Date().toISOString();
      const moderationNote = asString(req.body.moderation_note);
      if (moderationNote) patch.moderation_note = moderationNote;
    }
  }

  const authorName = asString(req.body.author_name);
  const category = asString(req.body.category);
  if (authorIdRaw === undefined && authorName !== undefined)
    patch.author_name = authorName;
  if (primaryCategoryIdRaw === undefined && category !== undefined)
    patch.category = category;

  const shouldSyncLegacyTitle =
    legacyTitle === undefined &&
    (titleFr !== undefined || titleEn !== undefined);
  if (shouldSyncLegacyTitle) {
    patch.title = (titleFr ?? "").trim() || (titleEn ?? "").trim() || "";
  }

  const { data, error } = await supabase
    .from("blog_articles")
    .update(patch)
    .eq("id", id)
    .select("id");

  if (error) {
    const msg = error.message ?? "";
    if (
      msg.toLowerCase().includes("duplicate") ||
      msg.toLowerCase().includes("unique")
    ) {
      return res.status(409).json({ error: "Ce slug existe déjà" });
    }
    return res.status(500).json({ error: msg });
  }

  if (!data || !Array.isArray(data) || !data.length)
    return res.status(404).json({ error: "Introuvable" });

  await supabase.from("admin_audit_log").insert({
    action: "content.blog.update",
    entity_type: "blog_articles",
    entity_id: id,
    metadata: { patch },
  });

  res.json({ ok: true });
};

export const deleteAdminCmsBlogArticle: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: existingData, error: existingErr } = await supabase
    .from("blog_articles")
    .select("id,slug")
    .eq("id", id)
    .limit(1);

  if (existingErr) return res.status(500).json({ error: existingErr.message });

  const existing = Array.isArray(existingData)
    ? (existingData[0] as any)
    : null;
  if (!existing?.id) return res.status(404).json({ error: "Introuvable" });

  const slug = typeof existing.slug === "string" ? existing.slug : null;

  const { error: blocksErr } = await supabase
    .from("blog_article_blocks")
    .delete()
    .eq("article_id", id);
  if (blocksErr) return res.status(500).json({ error: blocksErr.message });

  const { error: votesErr } = await supabase
    .from("blog_poll_votes")
    .delete()
    .eq("article_id", id);
  if (votesErr) return res.status(500).json({ error: votesErr.message });

  const { data: deletedData, error: deletedErr } = await supabase
    .from("blog_articles")
    .delete()
    .eq("id", id)
    .select("id");

  if (deletedErr) return res.status(500).json({ error: deletedErr.message });
  if (!deletedData || !Array.isArray(deletedData) || !deletedData.length)
    return res.status(404).json({ error: "Introuvable" });

  await supabase.from("admin_audit_log").insert({
    action: "content.blog.delete",
    entity_type: "blog_articles",
    entity_id: id,
    metadata: { slug },
  });

  res.json({ ok: true });
};

type BlogAuthorRow = {
  id: string;
  slug: string;
  display_name: string;
  bio_short: string;
  avatar_url: string | null;
  role: string;
  profile_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type BlogCategoryRow = {
  id: string;
  slug: string;
  title: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export const listAdminCmsBlogAuthors: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("blog_authors")
    .select(
      "id,slug,display_name,bio_short,avatar_url,role,profile_url,is_active,created_at,updated_at",
    )
    .order("display_name", { ascending: true })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as BlogAuthorRow[] });
};

export const createAdminCmsBlogAuthor: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const displayName = (asString(req.body.display_name) ?? "").trim();
  if (!displayName)
    return res.status(400).json({ error: "Nom d'affichage requis" });

  const bioShort = (asString(req.body.bio_short) ?? "").trim();
  const avatarUrl = asString(req.body.avatar_url);
  const profileUrl = asString(req.body.profile_url);

  const roleRaw = (asString(req.body.role) ?? "editor").trim().toLowerCase();
  const role =
    roleRaw === "sam" ||
    roleRaw === "guest" ||
    roleRaw === "team" ||
    roleRaw === "editor"
      ? roleRaw
      : "editor";

  const isActive =
    typeof req.body.is_active === "boolean" ? req.body.is_active : true;

  const now = new Date().toISOString();
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("blog_authors")
    .insert({
      display_name: displayName,
      bio_short: bioShort,
      avatar_url: avatarUrl ?? null,
      role,
      profile_url: profileUrl ?? null,
      is_active: isActive,
      created_at: now,
      updated_at: now,
    })
    .select(
      "id,slug,display_name,bio_short,avatar_url,role,profile_url,is_active,created_at,updated_at",
    )
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "content.blog_author.create",
    entity_type: "blog_authors",
    entity_id: (data as any)?.id ?? null,
    metadata: { display_name: displayName },
  });

  res.json({ item: data as BlogAuthorRow });
};

export const updateAdminCmsBlogAuthor: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id || !isUuid(id))
    return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (req.body.display_name !== undefined) {
    patch.display_name = (asString(req.body.display_name) ?? "").trim();
  }
  if (req.body.bio_short !== undefined) {
    patch.bio_short = (asString(req.body.bio_short) ?? "").trim();
  }
  if (req.body.avatar_url !== undefined) {
    patch.avatar_url = asString(req.body.avatar_url) ?? null;
  }
  if (req.body.profile_url !== undefined) {
    patch.profile_url = asString(req.body.profile_url) ?? null;
  }
  if (req.body.role !== undefined) {
    const roleRaw = (asString(req.body.role) ?? "editor").trim().toLowerCase();
    patch.role =
      roleRaw === "sam" ||
      roleRaw === "guest" ||
      roleRaw === "team" ||
      roleRaw === "editor"
        ? roleRaw
        : "editor";
  }
  if (typeof req.body.is_active === "boolean") {
    patch.is_active = req.body.is_active;
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("blog_authors")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) return res.status(500).json({ error: error.message });
  if (!data || !Array.isArray(data) || !data.length)
    return res.status(404).json({ error: "Introuvable" });

  await supabase.from("admin_audit_log").insert({
    action: "content.blog_author.update",
    entity_type: "blog_authors",
    entity_id: id,
    metadata: { patch },
  });

  res.json({ ok: true });
};

export const listAdminCmsBlogCategories: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("blog_categories")
    .select("id,slug,title,is_active,display_order,created_at,updated_at")
    .order("display_order", { ascending: true })
    .order("title", { ascending: true })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as BlogCategoryRow[] });
};

export const listAdminCmsBlogArticleBlocks: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const articleId = typeof req.params.id === "string" ? req.params.id : "";
  if (!articleId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("blog_article_blocks")
    .select("*")
    .eq("article_id", articleId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as BlogArticleBlockRow[] });
};

export const replaceAdminCmsBlogArticleBlocks: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const articleId = typeof req.params.id === "string" ? req.params.id : "";
  if (!articleId) return res.status(400).json({ error: "Identifiant requis" });

  const body = req.body;
  const blocksRaw = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.blocks)
      ? body.blocks
      : null;
  if (!blocksRaw)
    return res.status(400).json({ error: "Tableau de blocs requis" });

  const now = new Date().toISOString();
  const blocks = blocksRaw
    .map((b) => (isRecord(b) ? b : null))
    .filter((b): b is Record<string, unknown> => !!b)
    .map((b, idx) => {
      const type = asString(b.type) ?? "";
      const isEnabled = typeof b.is_enabled === "boolean" ? b.is_enabled : true;

      const data = sanitizeBlogBlockData(
        type,
        b.data !== undefined ? b.data : {},
      );
      const dataFr = sanitizeBlogBlockData(
        type,
        b.data_fr !== undefined ? b.data_fr : {},
      );
      const dataEn = sanitizeBlogBlockData(
        type,
        b.data_en !== undefined ? b.data_en : {},
      );

      return {
        article_id: articleId,
        sort_order: idx,
        type,
        is_enabled: isEnabled,
        data,
        data_fr: dataFr,
        data_en: dataEn,
        created_at: now,
        updated_at: now,
      };
    })
    .filter((b) => b.type);

  const supabase = getAdminSupabase();

  const { error: deleteErr } = await supabase
    .from("blog_article_blocks")
    .delete()
    .eq("article_id", articleId);
  if (deleteErr) return res.status(500).json({ error: deleteErr.message });

  if (blocks.length) {
    const { error: insertErr } = await supabase
      .from("blog_article_blocks")
      .insert(blocks);
    if (insertErr) return res.status(500).json({ error: insertErr.message });
  }

  await supabase.from("admin_audit_log").insert({
    action: "content.blog.blocks.replace",
    entity_type: "blog_articles",
    entity_id: articleId,
    metadata: { count: blocks.length },
  });

  res.json({ ok: true });
};

export const getAdminCmsBlogPollStats: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const articleId = typeof req.params.id === "string" ? req.params.id : "";
  if (!articleId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: blocksData, error: blocksErr } = await supabase
    .from("blog_article_blocks")
    .select("id,type,is_enabled,data,data_fr,data_en")
    .eq("article_id", articleId)
    .eq("type", "poll")
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);

  if (blocksErr) return res.status(500).json({ error: blocksErr.message });

  const pollBlocks = Array.isArray(blocksData) ? blocksData : [];

  const polls = pollBlocks
    .map((b: any) => {
      const shared = isRecord(b.data)
        ? (b.data as Record<string, unknown>)
        : {};
      const pollId =
        typeof shared.poll_id === "string" ? shared.poll_id.trim() : "";
      if (!pollId || !isUuid(pollId)) return null;

      const fr = isRecord(b.data_fr)
        ? (b.data_fr as Record<string, unknown>)
        : {};
      const en = isRecord(b.data_en)
        ? (b.data_en as Record<string, unknown>)
        : {};

      const questionFr =
        typeof fr.question === "string" ? fr.question.trim() : "";
      const questionEn =
        typeof en.question === "string" ? en.question.trim() : "";

      const optionsFr = Array.isArray(fr.options)
        ? fr.options.map((v) => String(v ?? "").trim()).filter(Boolean)
        : [];
      const optionsEn = Array.isArray(en.options)
        ? en.options.map((v) => String(v ?? "").trim()).filter(Boolean)
        : [];
      const optionsCount = Math.max(optionsFr.length, optionsEn.length);
      if (optionsCount < 2) return null;

      return {
        block_id: String(b.id ?? ""),
        poll_id: pollId,
        question_fr: questionFr,
        question_en: questionEn,
        options_fr: optionsFr,
        options_en: optionsEn,
        options_count: optionsCount,
      };
    })
    .filter((v): v is any => !!v);

  if (!polls.length) return res.json({ items: [] });

  const { data: votesData, error: votesErr } = await supabase
    .from("blog_poll_votes")
    .select("id,poll_id,option_index,user_id,session_id")
    .eq("article_id", articleId)
    .limit(100000);

  if (votesErr) return res.status(500).json({ error: votesErr.message });

  const votes = Array.isArray(votesData) ? votesData : [];
  const byPoll = new Map<string, Map<number, number>>();
  const totals = new Map<string, number>();
  const totalsAuth = new Map<string, number>();
  const totalsLegacy = new Map<string, number>();
  const seenByPoll = new Map<string, Set<string>>();

  for (const v of votes) {
    const pollId =
      typeof (v as any).poll_id === "string" ? (v as any).poll_id.trim() : "";
    const option = (v as any).option_index;
    const userId =
      typeof (v as any).user_id === "string" ? (v as any).user_id.trim() : "";
    const sessionId =
      typeof (v as any).session_id === "string"
        ? (v as any).session_id.trim()
        : "";
    const rowId = typeof (v as any).id === "string" ? (v as any).id.trim() : "";

    if (!pollId) continue;
    if (typeof option !== "number" || !Number.isFinite(option)) continue;

    const voterKey = userId
      ? `u:${userId}`
      : sessionId
        ? `s:${sessionId}`
        : rowId
          ? `r:${rowId}`
          : "";
    if (!voterKey) continue;

    const seen = seenByPoll.get(pollId) ?? new Set<string>();
    if (seen.has(voterKey)) continue;
    seen.add(voterKey);
    seenByPoll.set(pollId, seen);

    const idx = Math.max(0, Math.floor(option));
    totals.set(pollId, (totals.get(pollId) ?? 0) + 1);

    if (userId) totalsAuth.set(pollId, (totalsAuth.get(pollId) ?? 0) + 1);
    else totalsLegacy.set(pollId, (totalsLegacy.get(pollId) ?? 0) + 1);

    const pollMap = byPoll.get(pollId) ?? new Map<number, number>();
    pollMap.set(idx, (pollMap.get(idx) ?? 0) + 1);
    byPoll.set(pollId, pollMap);
  }

  const items = polls.map((p: any) => {
    const total = totals.get(p.poll_id) ?? 0;
    const totalAuth = totalsAuth.get(p.poll_id) ?? 0;
    const totalLegacy = totalsLegacy.get(p.poll_id) ?? 0;
    const counts = byPoll.get(p.poll_id) ?? new Map<number, number>();

    const outCounts = Array.from({ length: p.options_count }).map((_, idx) => {
      const count = counts.get(idx) ?? 0;
      return {
        option_index: idx,
        count,
        percent: total ? Math.round((count / total) * 100) : 0,
      };
    });

    return {
      poll_id: p.poll_id,
      block_id: p.block_id,
      total_votes: total,
      total_votes_auth: totalAuth,
      total_votes_legacy: totalLegacy,
      counts: outCounts,
      question_fr: p.question_fr,
      question_en: p.question_en,
      options_fr: p.options_fr,
      options_en: p.options_en,
    };
  });

  return res.json({ items });
};

// ---------------------------------------------------------------------------
// CMS Media: Blog images (admin upload)
// ---------------------------------------------------------------------------

type CmsUploadedImage = {
  bucket: string;
  path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
};

const CMS_BLOG_IMAGES_BUCKET = "cms-blog-images";
const MAX_CMS_BLOG_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

function looksLikeJpeg(buffer: Buffer): boolean {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

function looksLikePng(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

function looksLikeWebp(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function imageExtensionFromMime(mime: string): "jpg" | "png" | "webp" | null {
  const m = mime.toLowerCase();
  if (m.includes("image/jpeg")) return "jpg";
  if (m.includes("image/png")) return "png";
  if (m.includes("image/webp")) return "webp";
  return null;
}

function sanitizeImageFileName(input: string, ext: string): string {
  const v = String(input || "").trim();
  const base = v.replace(/[^a-zA-Z0-9._\- ]+/g, "").trim() || `image.${ext}`;
  const normalized = base.toLowerCase();
  // ensure extension
  if (normalized.endsWith(`.${ext}`)) return normalized;
  // strip any existing extension
  const noExt = normalized.replace(/\.[a-z0-9]+$/i, "");
  return `${noExt}.${ext}`;
}

export const uploadAdminCmsBlogImage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const contentType = (req.header("content-type") ?? "").toLowerCase();
  const ext = imageExtensionFromMime(contentType);
  if (!ext) return res.status(400).json({ error: "unsupported_image_type" });

  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0)
    return res.status(400).json({ error: "missing_image_body" });
  if (body.length > MAX_CMS_BLOG_IMAGE_BYTES)
    return res.status(413).json({ error: "image_too_large" });

  // Signature checks.
  const signatureOk =
    (ext === "jpg" && looksLikeJpeg(body)) ||
    (ext === "png" && looksLikePng(body)) ||
    (ext === "webp" && looksLikeWebp(body));
  if (!signatureOk)
    return res.status(400).json({ error: "invalid_image_signature" });

  const actor = getAdminSessionSubAny(req);
  const fileNameHeader = req.header("x-file-name") ?? "";
  const fileName = sanitizeImageFileName(fileNameHeader, ext);

  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = randomBytes(12).toString("hex");
  const storagePath = `${y}/${m}/${id}.${ext}`;

  const supabase = getAdminSupabase();
  const up = await supabase.storage
    .from(CMS_BLOG_IMAGES_BUCKET)
    .upload(storagePath, body, {
      contentType,
      upsert: false,
    });

  if (up.error) return res.status(500).json({ error: up.error.message });

  const publicUrl =
    supabase.storage.from(CMS_BLOG_IMAGES_BUCKET).getPublicUrl(storagePath)
      ?.data?.publicUrl ?? "";

  await supabase.from("admin_audit_log").insert({
    action: "content.blog.media.upload",
    entity_type: "storage",
    entity_id: storagePath,
    metadata: {
      bucket: CMS_BLOG_IMAGES_BUCKET,
      file_name: fileName,
      mime_type: contentType,
      size_bytes: body.length,
      actor,
    },
  });

  const item: CmsUploadedImage = {
    bucket: CMS_BLOG_IMAGES_BUCKET,
    path: storagePath,
    public_url: publicUrl,
    mime_type: contentType,
    size_bytes: body.length,
    width: null,
    height: null,
  };

  res.json({ ok: true, item });
};

// ---------------------------------------------------------------------------
// CMS Media: Blog documents (PDF upload)
// ---------------------------------------------------------------------------

type CmsUploadedDocument = {
  bucket: string;
  path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  file_name: string;
};

const CMS_BLOG_DOCUMENTS_BUCKET = "cms-blog-documents";
const MAX_CMS_BLOG_PDF_BYTES = 10 * 1024 * 1024; // 10MB

async function ensurePublicStorageBucket(
  supabase: ReturnType<typeof getAdminSupabase>,
  bucket: string,
): Promise<void> {
  try {
    const exists = await supabase.storage.getBucket(bucket);
    if (!exists.error) return;

    const msg = String(exists.error.message ?? "").toLowerCase();
    const status =
      (exists.error as any)?.statusCode ??
      (exists.error as any)?.status ??
      null;

    // If the bucket doesn't exist, attempt to create it.
    if (
      status === 404 ||
      msg.includes("not found") ||
      msg.includes("does not exist")
    ) {
      const created = await supabase.storage.createBucket(bucket, {
        public: true,
      });
      const cmsg = String(created.error?.message ?? "").toLowerCase();
      if (
        created.error &&
        !cmsg.includes("exists") &&
        !cmsg.includes("duplicate")
      ) {
        throw created.error;
      }
    }
  } catch {
    // Best-effort only: if we cannot create the bucket, upload will fail and return a clear error.
  }
}

export const uploadAdminCmsBlogDocument: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const contentType = (req.header("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/pdf")) {
    return res
      .status(400)
      .json({ error: "content_type_must_be_application_pdf" });
  }

  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ error: "pdf_body_required" });
  }

  if (body.length > MAX_CMS_BLOG_PDF_BYTES) {
    return res
      .status(413)
      .json({ error: "pdf_too_large", max_bytes: MAX_CMS_BLOG_PDF_BYTES });
  }

  if (!looksLikePdf(body)) {
    return res.status(400).json({ error: "invalid_pdf_signature" });
  }

  const actor = getAdminSessionSubAny(req);
  const fileNameHeader = req.header("x-file-name") ?? "";
  const fileName = sanitizeFileName(fileNameHeader);

  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = randomBytes(12).toString("hex");
  const storagePath = `${y}/${m}/${id}.pdf`;

  const supabase = getAdminSupabase();
  await ensurePublicStorageBucket(supabase, CMS_BLOG_DOCUMENTS_BUCKET);

  const up = await supabase.storage
    .from(CMS_BLOG_DOCUMENTS_BUCKET)
    .upload(storagePath, body, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (up.error) return res.status(500).json({ error: up.error.message });

  const publicUrl =
    supabase.storage.from(CMS_BLOG_DOCUMENTS_BUCKET).getPublicUrl(storagePath)
      ?.data?.publicUrl ?? "";

  await supabase.from("admin_audit_log").insert({
    action: "content.blog.documents.upload",
    entity_type: "storage",
    entity_id: storagePath,
    metadata: {
      bucket: CMS_BLOG_DOCUMENTS_BUCKET,
      file_name: fileName,
      mime_type: "application/pdf",
      size_bytes: body.length,
      actor,
    },
  });

  const item: CmsUploadedDocument = {
    bucket: CMS_BLOG_DOCUMENTS_BUCKET,
    path: storagePath,
    public_url: publicUrl,
    mime_type: "application/pdf",
    size_bytes: body.length,
    file_name: fileName,
  };

  res.json({ ok: true, item });
};

export const getPublicContentPage: RequestHandler = async (req, res) => {
  const slug =
    typeof req.params.slug === "string" ? req.params.slug.trim() : "";
  if (!slug) return res.status(400).json({ error: "Slug requis" });

  const langRaw =
    typeof req.query.lang === "string"
      ? req.query.lang.trim().toLowerCase()
      : "";
  const lang = langRaw === "en" ? "en" : "fr";

  const supabase = getAdminSupabase();
  const slugColumn = lang === "en" ? "slug_en" : "slug_fr";

  const { data, error } = await supabase
    .from("content_pages")
    .select(
      "id,page_key,slug,slug_fr,slug_en,status,is_published,title,body_markdown,updated_at,title_fr,title_en,page_subtitle_fr,page_subtitle_en,body_html_fr,body_html_en,seo_title_fr,seo_title_en,seo_description_fr,seo_description_en,meta_title_fr,meta_title_en,meta_description_fr,meta_description_en,og_title_fr,og_title_en,og_description_fr,og_description_en,og_image_url,canonical_url_fr,canonical_url_en,robots,show_toc,related_links,schema_jsonld_fr,schema_jsonld_en",
    )
    .eq(slugColumn, slug)
    .eq("status", "published")
    .single();

  if (error) return res.status(404).json({ error: error.message });

  const row = data as any;
  const pageId = String(row.id ?? "");

  const { data: blocksData, error: blocksErr } = pageId
    ? await supabase
        .from("content_page_blocks")
        .select(
          "id,sort_order,type,is_enabled,data,data_fr,data_en,updated_at,created_at",
        )
        .eq("page_id", pageId)
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500)
    : { data: [], error: null };

  if (blocksErr) return res.status(500).json({ error: blocksErr.message });

  const blocks = (blocksData ?? []).map((b: any) => {
    const shared = b.data ?? {};
    const localized = lang === "en" ? (b.data_en ?? {}) : (b.data_fr ?? {});

    return {
      id: String(b.id ?? ""),
      sort_order: typeof b.sort_order === "number" ? b.sort_order : 0,
      type: String(b.type ?? ""),
      data: shared,
      data_fr: b.data_fr ?? {},
      data_en: b.data_en ?? {},
      resolved: {
        lang,
        data: mergeBlockData(shared, localized),
      },
    };
  });

  const item = {
    page_key: String(row.page_key ?? ""),
    slug: String(row.slug ?? ""),
    slug_fr: String(row.slug_fr ?? ""),
    slug_en: String(row.slug_en ?? ""),
    status: String(row.status ?? ""),
    is_published: Boolean(row.is_published),
    updated_at: row.updated_at,

    // legacy
    title: String(row.title ?? ""),
    body_markdown: String(row.body_markdown ?? ""),

    // bilingual
    title_fr: String(row.title_fr ?? ""),
    title_en: String(row.title_en ?? ""),
    page_subtitle_fr: String(row.page_subtitle_fr ?? ""),
    page_subtitle_en: String(row.page_subtitle_en ?? ""),
    body_html_fr: String(row.body_html_fr ?? ""),
    body_html_en: String(row.body_html_en ?? ""),

    // SEO (preferred)
    seo_title_fr: String(row.seo_title_fr ?? ""),
    seo_title_en: String(row.seo_title_en ?? ""),
    seo_description_fr: String(row.seo_description_fr ?? ""),
    seo_description_en: String(row.seo_description_en ?? ""),

    // SEO legacy (compat)
    meta_title_fr: String(row.meta_title_fr ?? ""),
    meta_title_en: String(row.meta_title_en ?? ""),
    meta_description_fr: String(row.meta_description_fr ?? ""),
    meta_description_en: String(row.meta_description_en ?? ""),

    // OG
    og_title_fr: String(row.og_title_fr ?? ""),
    og_title_en: String(row.og_title_en ?? ""),
    og_description_fr: String(row.og_description_fr ?? ""),
    og_description_en: String(row.og_description_en ?? ""),
    og_image_url: row.og_image_url ?? null,

    canonical_url_fr: String(row.canonical_url_fr ?? ""),
    canonical_url_en: String(row.canonical_url_en ?? ""),
    robots: String(row.robots ?? ""),

    show_toc: Boolean(row.show_toc),
    related_links: row.related_links ?? [],

    schema_jsonld_fr: row.schema_jsonld_fr ?? null,
    schema_jsonld_en: row.schema_jsonld_en ?? null,

    blocks,

    // resolved for lang
    resolved: {
      lang,
      // Strict: do not fall back to FR/legacy when EN is selected (and vice versa).
      title: String(
        lang === "en" ? (row.title_en ?? "") : (row.title_fr ?? ""),
      ),
      page_subtitle: String(
        lang === "en"
          ? (row.page_subtitle_en ?? "")
          : (row.page_subtitle_fr ?? ""),
      ),
      body_html: String(
        lang === "en" ? (row.body_html_en ?? "") : (row.body_html_fr ?? ""),
      ),

      seo_title: String(
        (lang === "en" ? (row.seo_title_en ?? "") : (row.seo_title_fr ?? "")) ||
          (lang === "en"
            ? (row.meta_title_en ?? "")
            : (row.meta_title_fr ?? "")),
      ),
      seo_description: String(
        (lang === "en"
          ? (row.seo_description_en ?? "")
          : (row.seo_description_fr ?? "")) ||
          (lang === "en"
            ? (row.meta_description_en ?? "")
            : (row.meta_description_fr ?? "")),
      ),

      meta_title: String(
        lang === "en" ? (row.meta_title_en ?? "") : (row.meta_title_fr ?? ""),
      ),
      meta_description: String(
        lang === "en"
          ? (row.meta_description_en ?? "")
          : (row.meta_description_fr ?? ""),
      ),

      og_title: String(
        lang === "en" ? (row.og_title_en ?? "") : (row.og_title_fr ?? ""),
      ),
      og_description: String(
        lang === "en"
          ? (row.og_description_en ?? "")
          : (row.og_description_fr ?? ""),
      ),
      og_image_url: row.og_image_url ?? null,

      canonical_url: String(
        lang === "en"
          ? (row.canonical_url_en ?? "")
          : (row.canonical_url_fr ?? ""),
      ),
      robots: String(row.robots ?? ""),

      related_links: row.related_links ?? [],
      schema_jsonld:
        lang === "en"
          ? (row.schema_jsonld_en ?? null)
          : (row.schema_jsonld_fr ?? null),

      blocks: blocks.map((b: any) => ({
        id: b.id,
        sort_order: b.sort_order,
        type: b.type,
        data: b.resolved.data,
      })),
    },
  };

  res.json({ item });
};

export const listPublicFaqArticles: RequestHandler = async (req, res) => {
  const langRaw =
    typeof req.query.lang === "string"
      ? req.query.lang.trim().toLowerCase()
      : "";
  const lang = langRaw === "en" ? "en" : "fr";

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("faq_articles")
    .select(
      "id,category,display_order,title,body,question_fr,question_en,answer_html_fr,answer_html_en,tags,updated_at",
    )
    .eq("is_published", true)
    .order("category", { ascending: true })
    .order("display_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });

  const items = (data ?? []).map((row: any) => {
    const question = String(
      lang === "en" ? (row.question_en ?? "") : (row.question_fr ?? ""),
    );
    const answerHtml = String(
      lang === "en" ? (row.answer_html_en ?? "") : (row.answer_html_fr ?? ""),
    );

    return {
      id: String(row.id ?? ""),
      category: row.category ?? null,
      display_order:
        typeof row.display_order === "number" ? row.display_order : 0,
      tags: Array.isArray(row.tags) ? row.tags : [],
      updated_at: row.updated_at,
      // legacy
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      // bilingual
      question_fr: String(row.question_fr ?? ""),
      question_en: String(row.question_en ?? ""),
      answer_html_fr: String(row.answer_html_fr ?? ""),
      answer_html_en: String(row.answer_html_en ?? ""),
      // resolved
      resolved: {
        lang,
        question,
        answer_html: answerHtml,
      },
    };
  });

  res.json({ items });
};

export const listEstablishments: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const supabase = getAdminSupabase();

  let q = supabase
    .from("establishments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: data ?? [] });
};

export const createEstablishment: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const payload = isRecord(req.body) ? req.body : {};

  const name = asString(payload.name);
  const city = asString(payload.city);
  const universe = asString(payload.universe);

  const ownerEmailRaw = asString(payload.owner_email);
  const ownerEmail = ownerEmailRaw ? normalizeEmail(ownerEmailRaw) : "";

  if (!name) return res.status(400).json({ error: "Nom requis" });
  if (!city) return res.status(400).json({ error: "Ville requise" });
  if (!ownerEmail || !ownerEmail.includes("@"))
    return res.status(400).json({ error: "Email du propriétaire requis" });

  const supabase = getAdminSupabase();

  const provisionalPassword = generateProvisionalPassword();

  const { data: createdUser, error: createUserErr } =
    await supabase.auth.admin.createUser({
      email: ownerEmail,
      password: provisionalPassword,
      email_confirm: true,
    });

  if (createUserErr || !createdUser.user) {
    return res.status(400).json({
      error: translateErrorMessage(createUserErr?.message) ?? "Impossible de créer l'utilisateur",
    });
  }

  const ownerUserId = createdUser.user.id;

  const extra = (() => {
    const base = asJsonObject(payload.extra);
    const contactName = asString(payload.contact_name);
    const contactPhone = asString(payload.contact_phone);
    const merged: Record<string, unknown> = { ...(base ?? {}) };
    if (contactName) merged.contact_name = contactName;
    if (contactPhone) merged.contact_phone = contactPhone;
    merged.admin_created = true;
    merged.owner_email = ownerEmail;
    return Object.keys(merged).length ? merged : undefined;
  })();

  const insertPayload: Record<string, unknown> = {
    name,
    city,
    universe: universe ?? null,
    subcategory: (universe ?? null) as any,
    status: "pending",
    verified: false,
    created_by: ownerUserId,
  };

  if (extra) insertPayload.extra = extra;

  const { data: createdEst, error: createEstErr } = await supabase
    .from("establishments")
    .insert(insertPayload)
    .select("*")
    .single();

  if (createEstErr || !createdEst) {
    await supabase.auth.admin.deleteUser(ownerUserId);
    return res.status(500).json({
      error: createEstErr?.message ?? "Impossible de créer l’établissement",
    });
  }

  const establishmentId = (createdEst as any)?.id as string | undefined;

  const { error: membershipErr } = await supabase
    .from("pro_establishment_memberships")
    .insert({
      establishment_id: establishmentId,
      user_id: ownerUserId,
      role: "owner",
    });

  if (membershipErr) {
    await supabase.from("establishments").delete().eq("id", establishmentId);
    await supabase.auth.admin.deleteUser(ownerUserId);
    return res.status(500).json({ error: membershipErr.message });
  }

  await supabase.from("admin_audit_log").insert({
    action: "establishment.create",
    entity_type: "establishment",
    entity_id: establishmentId ?? null,
    metadata: {
      name,
      city,
      universe: universe ?? null,
      status: "pending",
      owner_email: ownerEmail,
      owner_user_id: ownerUserId,
    },
  });

  res.json({
    item: createdEst,
    owner: {
      email: ownerEmail,
      user_id: ownerUserId,
      temporary_password: provisionalPassword,
    },
  });
};

export const updateEstablishmentStatus: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = req.params.id;
  const status = typeof req.body?.status === "string" ? req.body.status : null;

  if (!status) return res.status(400).json({ error: "Statut requis" });

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("establishments")
    .update({ status })
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "establishment.status",
    entity_type: "establishment",
    entity_id: id,
    metadata: { status },
  });

  res.json({ ok: true });
};

export const updateEstablishmentFlags: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = req.params.id;
  const body = req.body ?? {};

  // Extract boolean flags
  const updates: Record<string, boolean> = {};
  if (typeof body.verified === "boolean") updates.verified = body.verified;
  if (typeof body.premium === "boolean") updates.premium = body.premium;
  if (typeof body.curated === "boolean") updates.curated = body.curated;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Aucun flag à mettre à jour" });
  }

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("establishments")
    .update(updates)
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "establishment.flags",
    entity_type: "establishment",
    entity_id: id,
    metadata: updates,
  });

  res.json({ ok: true });
};

export const listAdminWaitlist: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const isUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );

  const establishmentIdRaw =
    typeof req.query.establishment_id === "string"
      ? req.query.establishment_id.trim()
      : "";
  const establishmentId =
    establishmentIdRaw && isUuid(establishmentIdRaw) ? establishmentIdRaw : "";

  const statusRaw =
    typeof req.query.status === "string" ? req.query.status.trim() : "";
  const statusList = statusRaw
    ? statusRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const fromRaw =
    typeof req.query.from === "string" ? req.query.from.trim() : "";
  const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";

  const parseDateBoundary = (raw: string, endOfDay: boolean): string | null => {
    if (!raw) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const iso = endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`;
      const ts = Date.parse(iso);
      return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
    }

    const ts = Date.parse(raw);
    return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
  };

  const fromIso = parseDateBoundary(fromRaw, false);
  const toIso = parseDateBoundary(toRaw, true);

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const supabase = getAdminSupabase();

  let q = supabase
    .from("waitlist_entries")
    .select(
      "id,reservation_id,slot_id,user_id,status,position,offer_sent_at,offer_expires_at,created_at,updated_at,reservations!inner(id,booking_reference,establishment_id,starts_at,party_size,status,created_at,meta,establishments(id,name,city,universe))",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (establishmentId)
    q = q.eq("reservations.establishment_id", establishmentId);
  if (statusList.length) q = q.in("status", statusList);
  if (fromIso) q = q.gte("created_at", fromIso);
  if (toIso) q = q.lte("created_at", toIso);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

function startOfWeekUtcIso(inputIso: string): string {
  const d = new Date(inputIso);
  if (!Number.isFinite(d.getTime())) return inputIso;

  const day = d.getUTCDay(); // 0..6, Sunday=0
  const diffToMonday = (day + 6) % 7; // Monday=0
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

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

type ImpactMetricBlock = {
  eligible: number;
  no_shows: number;
  honored: number;
  protected: number;
  no_show_rate: number;
  honored_rate: number;
  protected_share: number;
};

type ImpactUniverseRow = ImpactMetricBlock & { universe: string };

type ImpactSeriesRow = {
  week_start: string;
  universe: string;
  eligible: number;
  no_shows: number;
  protected: number;
  no_show_rate: number;
  protected_share: number;
};

function computeRates(
  b: Omit<
    ImpactMetricBlock,
    "no_show_rate" | "honored_rate" | "protected_share"
  >,
): ImpactMetricBlock {
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

function normalizeUniverse(kindRaw: unknown): string {
  const k = String(kindRaw ?? "")
    .trim()
    .toLowerCase();
  if (!k) return "unknown";
  if (k.includes("restaurant")) return "restaurant";
  if (k.includes("hotel")) return "hotel";
  if (k.includes("wellness") || k.includes("spa")) return "wellness";
  if (k.includes("loisir") || k.includes("sport") || k.includes("culture"))
    return "loisir";
  return k;
}

function isProtectedReservation(row: {
  amount_deposit?: unknown;
  meta?: unknown;
}): boolean {
  const deposit =
    typeof row.amount_deposit === "number" &&
    Number.isFinite(row.amount_deposit)
      ? Math.max(0, Math.round(row.amount_deposit))
      : 0;
  if (deposit > 0) return true;

  const meta = row.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return (meta as Record<string, unknown>).guarantee_required === true;
  }

  return false;
}

export const getAdminImpactReport: RequestHandler = async (req, res) => {
  // Phase 6: measurement-only endpoint.
  // No business rules are modified here — read-only analytics computed from existing reservation fields.
  if (!requireAdminKey(req, res)) return;

  const now = new Date();
  const nowIso = now.toISOString();

  const afterEndIso =
    parseDateBoundary(String(req.query.after_end ?? ""), true) ?? nowIso;
  const afterStartIso =
    parseDateBoundary(String(req.query.after_start ?? ""), false) ??
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const beforeEndIso =
    parseDateBoundary(String(req.query.before_end ?? ""), true) ??
    afterStartIso;
  const beforeStartIso =
    parseDateBoundary(String(req.query.before_start ?? ""), false) ??
    new Date(
      new Date(beforeEndIso).getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

  const seriesWeeks = clampInt(
    typeof req.query.series_weeks === "string"
      ? Number(req.query.series_weeks)
      : 12,
    4,
    26,
  );
  const seriesFromIso = new Date(
    now.getTime() - seriesWeeks * 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const fetchFromIso =
    [beforeStartIso, afterStartIso, seriesFromIso]
      .filter(Boolean)
      .map((x) => String(x))
      .sort()[0] ?? seriesFromIso;

  const supabase = getAdminSupabase();

  const batchSize = 10000;
  const maxRows = 50000;
  const rows: Array<{
    id: string;
    kind: unknown;
    status: unknown;
    starts_at: string;
    checked_in_at: unknown;
    amount_deposit: unknown;
    meta: unknown;
  }> = [];

  for (let offset = 0; offset < maxRows; offset += batchSize) {
    const { data, error } = await supabase
      .from("reservations")
      .select("id,kind,status,starts_at,checked_in_at,amount_deposit,meta")
      .gte("starts_at", fetchFromIso)
      .lte("starts_at", nowIso)
      .order("starts_at", { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (error) return res.status(500).json({ error: error.message });

    const page = (data ?? []) as any[];
    for (const item of page) {
      const startsAt =
        typeof item?.starts_at === "string" ? String(item.starts_at) : "";
      if (!startsAt) continue;
      rows.push({
        id: String(item.id ?? ""),
        kind: item.kind,
        status: item.status,
        starts_at: startsAt,
        checked_in_at: item.checked_in_at,
        amount_deposit: item.amount_deposit,
        meta: item.meta,
      });
    }

    if (page.length < batchSize) break;
  }

  const initBlock = (): Omit<
    ImpactMetricBlock,
    "no_show_rate" | "honored_rate" | "protected_share"
  > => ({
    eligible: 0,
    no_shows: 0,
    honored: 0,
    protected: 0,
  });

  const globalBefore = initBlock();
  const globalAfter = initBlock();

  const byUniverseBefore = new Map<string, ReturnType<typeof initBlock>>();
  const byUniverseAfter = new Map<string, ReturnType<typeof initBlock>>();

  const afterProtected = initBlock();
  const afterNonProtected = initBlock();

  const series = new Map<
    string,
    { week_start: string; universe: string } & ReturnType<typeof initBlock>
  >();

  const inRange = (iso: string, from: string, to: string) =>
    iso >= from && iso <= to;

  for (const r of rows) {
    const startsAtIso = r.starts_at;
    const status = String(r.status ?? "").toLowerCase();

    if (!isEligibleReservationStatus(status)) continue;

    const universe = normalizeUniverse(r.kind);
    const protectedFlag = isProtectedReservation(r);

    const isNoShow = status === "noshow";
    const isHonored = !!(
      typeof r.checked_in_at === "string" && r.checked_in_at.trim()
    );

    // BEFORE
    if (inRange(startsAtIso, beforeStartIso, beforeEndIso)) {
      globalBefore.eligible += 1;
      if (isNoShow) globalBefore.no_shows += 1;
      if (isHonored) globalBefore.honored += 1;
      if (protectedFlag) globalBefore.protected += 1;

      const b = byUniverseBefore.get(universe) ?? initBlock();
      b.eligible += 1;
      if (isNoShow) b.no_shows += 1;
      if (isHonored) b.honored += 1;
      if (protectedFlag) b.protected += 1;
      byUniverseBefore.set(universe, b);
    }

    // AFTER
    if (inRange(startsAtIso, afterStartIso, afterEndIso)) {
      globalAfter.eligible += 1;
      if (isNoShow) globalAfter.no_shows += 1;
      if (isHonored) globalAfter.honored += 1;
      if (protectedFlag) globalAfter.protected += 1;

      const a = byUniverseAfter.get(universe) ?? initBlock();
      a.eligible += 1;
      if (isNoShow) a.no_shows += 1;
      if (isHonored) a.honored += 1;
      if (protectedFlag) a.protected += 1;
      byUniverseAfter.set(universe, a);

      const group = protectedFlag ? afterProtected : afterNonProtected;
      group.eligible += 1;
      if (isNoShow) group.no_shows += 1;
      if (isHonored) group.honored += 1;
      if (protectedFlag) group.protected += 1;
    }

    // SERIES
    if (inRange(startsAtIso, seriesFromIso, nowIso)) {
      const weekStart = startOfWeekUtcIso(startsAtIso);
      const key = `${weekStart}::${universe}`;
      const bucket = series.get(key) ?? {
        week_start: weekStart,
        universe,
        ...initBlock(),
      };
      bucket.eligible += 1;
      if (isNoShow) bucket.no_shows += 1;
      if (protectedFlag) bucket.protected += 1;
      series.set(key, bucket);
    }
  }

  const uniBefore: ImpactUniverseRow[] = Array.from(byUniverseBefore.entries())
    .map(([universe, block]) => ({ universe, ...computeRates(block) }))
    .sort((a, b) => a.universe.localeCompare(b.universe));

  const uniAfter: ImpactUniverseRow[] = Array.from(byUniverseAfter.entries())
    .map(([universe, block]) => ({ universe, ...computeRates(block) }))
    .sort((a, b) => a.universe.localeCompare(b.universe));

  const seriesRows: ImpactSeriesRow[] = Array.from(series.values())
    .map((b) => ({
      week_start: b.week_start,
      universe: b.universe,
      eligible: b.eligible,
      no_shows: b.no_shows,
      protected: b.protected,
      no_show_rate: b.eligible > 0 ? b.no_shows / b.eligible : 0,
      protected_share: b.eligible > 0 ? b.protected / b.eligible : 0,
    }))
    .sort((a, b) => {
      if (a.week_start !== b.week_start)
        return a.week_start.localeCompare(b.week_start);
      return a.universe.localeCompare(b.universe);
    });

  return res.json({
    ok: true,
    generated_at: nowIso,
    periods: {
      before: { start: beforeStartIso, end: beforeEndIso },
      after: { start: afterStartIso, end: afterEndIso },
      series: { start: seriesFromIso, end: nowIso, weeks: seriesWeeks },
    },
    kpi: {
      before: computeRates(globalBefore),
      after: computeRates(globalAfter),
      after_protected: computeRates(afterProtected),
      after_non_protected: computeRates(afterNonProtected),
      by_universe_before: uniBefore,
      by_universe_after: uniAfter,
      series: seriesRows,
      assumptions: {
        eligible_status_excluded: [
          "refused",
          "waitlist",
          "requested",
          "pending_pro_validation",
          "cancelled*",
        ],
        honored_definition: "checked_in_at != null",
        no_show_definition: "status = noshow",
        protected_definition:
          "amount_deposit > 0 OR meta.guarantee_required=true",
      },
    },
  });
};

export const adminHealth: RequestHandler = async (req, res) => {
  const enabled = assertAdminApiEnabled();
  if (enabled.ok === false)
    return res.status(503).json({ ok: false, error: enabled.message });

  const session = getAdminSessionToken(req);
  const authedBySession = session && verifyAdminSessionToken(session.token) !== null;
  const header = req.header("x-admin-key") ?? undefined;
  const authedByKey = checkAdminKey(header);

  if (!authedBySession && !authedByKey)
    return res.status(401).json({ ok: false, error: "Non autorisé" });

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("admin_audit_log")
    .select("id")
    .limit(1);
  if (error) return res.status(500).json({ ok: false, error: error.message });

  // Return the session token so frontend can decode user info
  res.json({ ok: true, session_token: session?.token ?? undefined });
};

type ProductionCheckItem = {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
};

type ProductionCheckResponse = {
  ok: true;
  at: string;
  env: {
    node_env: string;
    allow_demo_routes: boolean;
  };
  checks: ProductionCheckItem[];
};

async function runSupabaseTableCheck(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  table: string;
  label: string;
  select?: string;
}): Promise<ProductionCheckItem> {
  try {
    const select = args.select ?? "id";
    const { error } = await args.supabase
      .from(args.table as any)
      .select(select)
      .limit(1);
    if (error)
      return {
        key: `table:${args.table}`,
        label: args.label,
        ok: false,
        detail: error.message,
      };
    return { key: `table:${args.table}`, label: args.label, ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return {
      key: `table:${args.table}`,
      label: args.label,
      ok: false,
      detail: msg,
    };
  }
}

async function runSupabaseSchemaTableCheck(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  schema: string;
  table: string;
  label: string;
}): Promise<ProductionCheckItem> {
  try {
    const { error } = await args.supabase
      .schema(args.schema as any)
      .from(args.table as any)
      .select("id")
      .limit(1);
    const key = `table:${args.schema}.${args.table}`;
    if (error)
      return { key, label: args.label, ok: false, detail: error.message };
    return { key, label: args.label, ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return {
      key: `table:${args.schema}.${args.table}`,
      label: args.label,
      ok: false,
      detail: msg,
    };
  }
}

export const adminProductionCheck: RequestHandler = async (req, res) => {
  // Admin-only endpoint: read-only health + schema sanity checks.
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  const nodeEnv = String(process.env.NODE_ENV ?? "");
  const allowDemoRoutes =
    nodeEnv !== "production" &&
    String(process.env.ALLOW_DEMO_ROUTES ?? "").toLowerCase() === "true";

  const checks: ProductionCheckItem[] = [];

  checks.push({
    key: "env:demo_routes_disabled",
    label: "Routes démo désactivées (server)",
    ok: !allowDemoRoutes,
    ...(allowDemoRoutes ? { detail: "ALLOW_DEMO_ROUTES=true" } : {}),
  });

  checks.push({
    key: "env:node_env_prod",
    label: "NODE_ENV=production (recommandé)",
    ok: nodeEnv === "production",
    ...(nodeEnv !== "production"
      ? { detail: `NODE_ENV=${nodeEnv || "(unset)"}` }
      : {}),
  });

  // Database/schema presence checks (fail-fast signals).
  const tableChecks = await Promise.all([
    runSupabaseTableCheck({
      supabase,
      table: "admin_audit_log",
      label: "Table admin_audit_log",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "system_logs",
      label: "Table system_logs",
    }),

    // Core booking data
    runSupabaseTableCheck({
      supabase,
      table: "establishments",
      label: "Table establishments",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "pro_slots",
      label: "Table pro_slots",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "reservations",
      label: "Table reservations",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "waitlist_entries",
      label: "Table waitlist_entries",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "waitlist_events",
      label: "Table waitlist_events",
    }),

    // Packs
    runSupabaseTableCheck({ supabase, table: "packs", label: "Table packs" }),
    runSupabaseTableCheck({
      supabase,
      table: "pack_purchases",
      label: "Table pack_purchases",
    }),

    // Notifications (consumer / pro)
    runSupabaseTableCheck({
      supabase,
      table: "consumer_user_events",
      label: "Table consumer_user_events",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "pro_notifications",
      label: "Table pro_notifications",
    }),

    // Content/CMS
    runSupabaseTableCheck({
      supabase,
      table: "content_pages",
      label: "Table content_pages",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "blog_articles",
      label: "Table blog_articles",
    }),

    // Home / moderation
    runSupabaseTableCheck({
      supabase,
      table: "home_curation_items",
      label: "Table home_curation_items",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "moderation_queue",
      label: "Table moderation_queue",
    }),

    // Finance / Payout system
    runSupabaseSchemaTableCheck({
      supabase,
      schema: "finance",
      table: "payouts",
      label: "Table finance.payouts",
    }),
    runSupabaseSchemaTableCheck({
      supabase,
      schema: "finance",
      table: "payout_requests",
      label: "Table finance.payout_requests",
    }),
    runSupabaseSchemaTableCheck({
      supabase,
      schema: "finance",
      table: "pro_terms_acceptances",
      label: "Table finance.pro_terms_acceptances",
    }),
  ]);

  checks.push(...tableChecks);

  const payload: ProductionCheckResponse = {
    ok: true,
    at: new Date().toISOString(),
    env: {
      node_env: nodeEnv,
      allow_demo_routes: allowDemoRoutes,
    },
    checks,
  };

  res.json(payload);
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

type HomeCurationKind =
  | "best_deals"
  | "selected_for_you"
  | "near_you"
  | "most_booked";

function normalizeHomeCurationKind(raw: unknown): HomeCurationKind | null {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "best_deals") return "best_deals";
  if (v === "selected_for_you") return "selected_for_you";
  if (v === "near_you") return "near_you";
  if (v === "most_booked") return "most_booked";
  return null;
}

export const listAdminHomeCurationItems: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const universe = asString(req.query.universe);
  const city = asString(req.query.city);
  const kind = normalizeHomeCurationKind(req.query.kind);

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const supabase = getAdminSupabase();

  let q = supabase
    .from("home_curation_items")
    .select(
      "id,universe,city,kind,establishment_id,starts_at,ends_at,weight,note,created_at,updated_at,establishments(id,name,city,universe,subcategory,cover_url,status)",
    )
    .order("weight", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (universe) q = q.eq("universe", universe);
  if (city) q = q.ilike("city", city);
  if (kind) q = q.eq("kind", kind);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

export const createAdminHomeCurationItem: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const universe = asString(req.body.universe);
  const kind = normalizeHomeCurationKind(req.body.kind);
  const city = asString(req.body.city);
  const establishmentId = asString(req.body.establishment_id);

  if (!universe) return res.status(400).json({ error: "Univers requis" });
  if (!kind) return res.status(400).json({ error: "Type requis" });
  if (!establishmentId || !isUuid(establishmentId))
    return res.status(400).json({ error: "Identifiant d'établissement requis" });

  const startsAt = asString(req.body.starts_at);
  const endsAt = asString(req.body.ends_at);
  const weight =
    typeof req.body.weight === "number" && Number.isFinite(req.body.weight)
      ? Math.floor(req.body.weight)
      : 100;
  const note = asString(req.body.note);

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("home_curation_items")
    .insert({
      universe,
      city: city ?? null,
      kind,
      establishment_id: establishmentId,
      starts_at: startsAt ?? null,
      ends_at: endsAt ?? null,
      weight,
      note: note ?? null,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "home_curation.create",
    entity_type: "home_curation_items",
    entity_id: (data as any)?.id ?? null,
    metadata: {
      universe,
      city: city ?? null,
      kind,
      establishment_id: establishmentId,
      weight,
    },
  });

  res.json({ ok: true, id: (data as any)?.id ?? null });
};

export const updateAdminHomeCurationItem: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const patch: Record<string, unknown> = {};

  const universe = asString(req.body.universe);
  if (universe !== undefined) patch.universe = universe;

  const kind = normalizeHomeCurationKind(req.body.kind);
  if (req.body.kind !== undefined) {
    if (!kind) return res.status(400).json({ error: "Type invalide" });
    patch.kind = kind;
  }

  const city = asString(req.body.city);
  if (req.body.city !== undefined) patch.city = city ?? null;

  const startsAt = asString(req.body.starts_at);
  if (req.body.starts_at !== undefined) patch.starts_at = startsAt ?? null;

  const endsAt = asString(req.body.ends_at);
  if (req.body.ends_at !== undefined) patch.ends_at = endsAt ?? null;

  const note = asString(req.body.note);
  if (req.body.note !== undefined) patch.note = note ?? null;

  const weight =
    typeof req.body.weight === "number" && Number.isFinite(req.body.weight)
      ? Math.floor(req.body.weight)
      : undefined;
  if (weight !== undefined) patch.weight = weight;

  const estId = asString(req.body.establishment_id);
  if (req.body.establishment_id !== undefined) {
    if (!estId || !isUuid(estId))
      return res.status(400).json({ error: "Identifiant d'établissement invalide" });
    patch.establishment_id = estId;
  }

  if (Object.keys(patch).length === 0)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("home_curation_items")
    .update(patch)
    .eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "home_curation.update",
    entity_type: "home_curation_items",
    entity_id: id,
    metadata: { patch },
  });

  res.json({ ok: true });
};

export const deleteAdminHomeCurationItem: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("home_curation_items")
    .delete()
    .eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "home_curation.delete",
    entity_type: "home_curation_items",
    entity_id: id,
    metadata: {},
  });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Commission overrides (per-establishment custom commissions)
// ---------------------------------------------------------------------------

type EstablishmentCommissionOverride = {
  establishment_id: string;
  active: boolean;
  commission_percent: number | null;
  commission_amount_cents: bigint | null;
  pack_commission_percent: number | null;
  pack_commission_amount_cents: bigint | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const listAdminCommissionOverrides: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const activeOnly = req.query.active_only === "true";
  const supabase = getAdminSupabase();

  let q = supabase
    .from("establishment_commission_overrides")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (activeOnly) q = q.eq("active", true);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    ok: true,
    items: (data ?? []) as EstablishmentCommissionOverride[],
  });
};

export const createAdminCommissionOverride: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const establishmentId = asString(req.body.establishment_id);
  const active = typeof req.body.active === "boolean" ? req.body.active : true;
  const commissionPct =
    typeof req.body.commission_percent === "number" &&
    Number.isFinite(req.body.commission_percent)
      ? req.body.commission_percent
      : null;
  const commissionAmount =
    typeof req.body.commission_amount_cents === "number" &&
    Number.isFinite(req.body.commission_amount_cents)
      ? Math.max(0, Math.round(req.body.commission_amount_cents))
      : null;
  const packCommissionPct =
    typeof req.body.pack_commission_percent === "number" &&
    Number.isFinite(req.body.pack_commission_percent)
      ? req.body.pack_commission_percent
      : null;
  const packCommissionAmount =
    typeof req.body.pack_commission_amount_cents === "number" &&
    Number.isFinite(req.body.pack_commission_amount_cents)
      ? Math.max(0, Math.round(req.body.pack_commission_amount_cents))
      : null;
  const notes = asString(req.body.notes);

  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant d'établissement requis" });
  // Au moins une commission (réservation OU pack) doit être définie
  const hasReservationCommission = commissionPct != null || commissionAmount != null;
  const hasPackCommission = packCommissionPct != null || packCommissionAmount != null;
  if (!hasReservationCommission && !hasPackCommission)
    return res.status(400).json({
      error: "Au moins une commission (réservation ou pack) est requise",
    });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("establishment_commission_overrides")
    .upsert(
      {
        establishment_id: establishmentId,
        active,
        commission_percent: commissionPct,
        commission_amount_cents: commissionAmount,
        pack_commission_percent: packCommissionPct,
        pack_commission_amount_cents: packCommissionAmount,
        notes: notes ?? null,
      },
      { onConflict: "establishment_id" },
    )
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "commission.override.create",
    entity_type: "establishment_commission_overrides",
    entity_id: establishmentId,
    metadata: { after: data, actor: getAdminSessionSubAny(req) },
  });

  res.json({ ok: true, item: data as EstablishmentCommissionOverride });
};

export const updateAdminCommissionOverride: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant d'établissement requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const supabase = getAdminSupabase();
  const { data: beforeRow } = await supabase
    .from("establishment_commission_overrides")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  const patch: Record<string, unknown> = {};
  if (typeof req.body.active === "boolean") patch.active = req.body.active;
  if (req.body.commission_percent === null) patch.commission_percent = null;
  if (
    typeof req.body.commission_percent === "number" &&
    Number.isFinite(req.body.commission_percent)
  )
    patch.commission_percent = req.body.commission_percent;
  if (req.body.commission_amount_cents === null)
    patch.commission_amount_cents = null;
  if (
    typeof req.body.commission_amount_cents === "number" &&
    Number.isFinite(req.body.commission_amount_cents)
  ) {
    patch.commission_amount_cents = Math.max(
      0,
      Math.round(req.body.commission_amount_cents),
    );
  }
  // Pack commission fields
  if (req.body.pack_commission_percent === null) patch.pack_commission_percent = null;
  if (
    typeof req.body.pack_commission_percent === "number" &&
    Number.isFinite(req.body.pack_commission_percent)
  )
    patch.pack_commission_percent = req.body.pack_commission_percent;
  if (req.body.pack_commission_amount_cents === null)
    patch.pack_commission_amount_cents = null;
  if (
    typeof req.body.pack_commission_amount_cents === "number" &&
    Number.isFinite(req.body.pack_commission_amount_cents)
  ) {
    patch.pack_commission_amount_cents = Math.max(
      0,
      Math.round(req.body.pack_commission_amount_cents),
    );
  }
  if (req.body.notes !== undefined)
    patch.notes = asString(req.body.notes) ?? null;

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const { data, error } = await supabase
    .from("establishment_commission_overrides")
    .update(patch)
    .eq("establishment_id", establishmentId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "commission.override.update",
    entity_type: "establishment_commission_overrides",
    entity_id: establishmentId,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor: getAdminSessionSubAny(req),
    },
  });

  res.json({ ok: true, item: data as EstablishmentCommissionOverride });
};

export const deleteAdminCommissionOverride: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant d'établissement requis" });

  const supabase = getAdminSupabase();
  const { data: beforeRow } = await supabase
    .from("establishment_commission_overrides")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  const { error } = await supabase
    .from("establishment_commission_overrides")
    .delete()
    .eq("establishment_id", establishmentId);
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "commission.override.delete",
    entity_type: "establishment_commission_overrides",
    entity_id: establishmentId,
    metadata: { before: beforeRow ?? null, actor: getAdminSessionSubAny(req) },
  });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Pro Terms (admin-managed legal terms)
// ---------------------------------------------------------------------------

type ProTermsRow = {
  id: number;
  version: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export const getAdminProTerms: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("finance_pro_terms")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, item: data as ProTermsRow });
};

export const updateAdminProTerms: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const version = asString(req.body.version);
  const title = asString(req.body.title);
  const body = asString(req.body.body);

  if (!version) return res.status(400).json({ error: "Version requise" });
  if (!title) return res.status(400).json({ error: "Titre requis" });

  const patch: Record<string, unknown> = {};
  if (version !== undefined) patch.version = version;
  if (title !== undefined) patch.title = title;
  if (body !== undefined) patch.body = body ?? "";

  const supabase = getAdminSupabase();
  const { data: beforeRow } = await supabase
    .from("finance_pro_terms")
    .select("*")
    .eq("id", 1)
    .single();

  const { data, error } = await supabase
    .from("finance_pro_terms")
    .update(patch)
    .eq("id", 1)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "pro_terms.update",
    entity_type: "finance.pro_terms",
    entity_id: null,
    metadata: {
      before: beforeRow,
      after: data,
      actor: getAdminSessionSubAny(req),
      version,
    },
  });

  await broadcastProNotification({
    supabase,
    category: "admin",
    title: "Conditions Pro mises à jour",
    body: "Les conditions Pro ont été mises à jour. Veuillez accepter les nouvelles conditions.",
    data: { kind: "pro_terms_updated", version },
  });

  res.json({ ok: true, item: data as ProTermsRow });
};

// ---------------------------------------------------------------------------
// Payout Requests (Pro reversements workflow)
// ---------------------------------------------------------------------------

type PayoutRequestRow = {
  id: string;
  payout_id: string;
  establishment_id: string;
  status: string;
  created_by_user_id: string | null;
  pro_comment: string | null;
  admin_comment: string | null;
  paid_reference: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export const listAdminPayoutRequests: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "submitted";
  const establishmentId =
    typeof req.query.establishment_id === "string"
      ? req.query.establishment_id.trim()
      : "";

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const supabase = getAdminSupabase();

  let q = supabase
    .from("finance_payout_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && status !== "all") q = q.eq("status", status);
  if (establishmentId) q = q.eq("establishment_id", establishmentId);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: (data ?? []) as PayoutRequestRow[] });
};

export const updateAdminPayoutRequest: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const requestId = typeof req.params.id === "string" ? req.params.id : "";
  if (!requestId) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const nextStatus = asString(req.body.status);
  const adminComment = asString(req.body.admin_comment);
  const paidReference = asString(req.body.paid_reference);

  const allowedStatus = new Set(["submitted", "approved", "rejected", "paid"]);
  if (nextStatus && !allowedStatus.has(nextStatus))
    return res.status(400).json({ error: "invalid status" });

  const patch: Record<string, unknown> = {};
  if (nextStatus) patch.status = nextStatus;
  if (adminComment !== undefined) patch.admin_comment = adminComment ?? null;
  if (paidReference !== undefined) patch.paid_reference = paidReference ?? null;

  if (nextStatus === "approved") patch.approved_at = new Date().toISOString();
  if (nextStatus === "paid") patch.paid_at = new Date().toISOString();

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();
  const { data: beforeRow } = await supabase
    .from("finance_payout_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("finance_payout_requests")
    .update(patch)
    .eq("id", requestId)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "payout_request.update",
    entity_type: "finance.payout_requests",
    entity_id: requestId,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor: getAdminSessionSubAny(req),
      status: nextStatus,
    },
  });

  res.json({ ok: true, item: data as PayoutRequestRow });
};

// ---------------------------------------------------------------------------
// Pro Bank details (RIB) — Superadmin-only write, traceable
// ---------------------------------------------------------------------------

type ProBankDetailsRow = {
  id: string;
  establishment_id: string;
  bank_code: string;
  locality_code: string;
  branch_code: string;
  account_number: string;
  rib_key: string;
  bank_name: string;
  bank_address: string | null;
  holder_name: string;
  holder_address: string | null;
  rib_24: string;
  is_validated: boolean;
  validated_at: string | null;
  validated_by: string | null;
  created_at: string;
  updated_at: string;
};

type ProBankDetailsHistoryRow = {
  id: string;
  pro_bank_id: string;
  changed_by: string | null;
  changed_at: string;
  old_data: unknown;
  new_data: unknown;
};

type ProBankDocumentRow = {
  id: string;
  pro_bank_id: string;
  file_path: string;
  file_name: string | null;
  mime_type: string;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

const Pro_BANK_DOCS_BUCKET = "pro-bank-documents";
const MAX_PRO_BANK_DOC_PDF_BYTES = 10 * 1024 * 1024; // 10MB

function looksLikePdf(buffer: Buffer): boolean {
  // Quick signature check: PDF files start with "%PDF-"
  if (!buffer || buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function sanitizeFileName(input: string): string {
  const v = String(input || "").trim();
  if (!v) return "document.pdf";
  const normalized = v.replace(/[^a-zA-Z0-9._\- ]+/g, "").trim();
  if (!normalized) return "document.pdf";
  return normalized.toLowerCase().endsWith(".pdf")
    ? normalized
    : `${normalized}.pdf`;
}

function parseRibBody(body: Record<string, unknown>):
  | {
      ok: true;
      parts: RibParts;
      rib24: string;
      bankName: string;
      bankAddress: string | null;
      holderName: string;
      holderAddress: string | null;
    }
  | { ok: false; error: string } {
  const bank_code = digitsOnly(asString(body.bank_code) ?? "");
  const locality_code = digitsOnly(asString(body.locality_code) ?? "");
  const branch_code = digitsOnly(asString(body.branch_code) ?? "");
  const account_number = digitsOnly(asString(body.account_number) ?? "");
  const rib_key = digitsOnly(asString(body.rib_key) ?? "");

  const holderName = asString(body.holder_name) ?? "";
  const holderAddress = asString(body.holder_address);
  const bankAddress = asString(body.bank_address);

  if (!holderName.trim())
    return { ok: false, error: "Nom du titulaire requis" };

  const rib24 = buildRib24FromParts({
    bank_code,
    locality_code,
    branch_code,
    account_number,
    rib_key,
  });
  if (!rib24) {
    return {
      ok: false,
      error:
        "RIB invalide : attendu banque/localité/agence=3 chiffres, numéro de compte=12 chiffres, clé RIB=3 chiffres (24 au total)",
    };
  }

  const bankName = detectMoroccanBankName(bank_code) ?? "Banque inconnue";

  return {
    ok: true,
    parts: { bank_code, locality_code, branch_code, account_number, rib_key },
    rib24,
    bankName,
    bankAddress: bankAddress?.trim() ? bankAddress.trim() : null,
    holderName: holderName.trim(),
    holderAddress: holderAddress?.trim() ? holderAddress.trim() : null,
  };
}

export const getAdminEstablishmentBankDetails: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("finance_pro_bank_details")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, item: (data as ProBankDetailsRow | null) ?? null });
};

export const upsertAdminEstablishmentBankDetails: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const parsed = parseRibBody(req.body);
  if (parsed.ok === false) return res.status(400).json({ error: parsed.error });

  const actor = getAdminSessionSubAny(req);
  const supabase = getAdminSupabase();

  const { data: before, error: beforeErr } = await supabase
    .from("finance_pro_bank_details")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });

  const patch: Record<string, unknown> = {
    establishment_id: establishmentId,
    bank_code: parsed.parts.bank_code,
    locality_code: parsed.parts.locality_code,
    branch_code: parsed.parts.branch_code,
    account_number: parsed.parts.account_number,
    rib_key: parsed.parts.rib_key,
    bank_name: parsed.bankName,
    bank_address: parsed.bankAddress,
    holder_name: parsed.holderName,
    holder_address: parsed.holderAddress,
    rib_24: parsed.rib24,

    // Any change resets validation, compta must validate again.
    is_validated: false,
    validated_at: null,
    validated_by: null,
  };

  const { data: after, error: upsertErr } = await supabase
    .from("finance_pro_bank_details")
    .upsert(patch, { onConflict: "establishment_id" })
    .select("*")
    .single();

  if (upsertErr) return res.status(500).json({ error: upsertErr.message });

  // History row
  await supabase.from("finance_pro_bank_details_history").insert({
    pro_bank_id: String((after as any).id ?? ""),
    changed_by: actor,
    old_data: before ?? null,
    new_data: after,
  });

  // Admin audit log (extra)
  await supabase.from("admin_audit_log").insert({
    action: "pro_bank_details.upsert",
    entity_type: "finance.pro_bank_details",
    entity_id: String((after as any).id ?? ""),
    metadata: {
      before: before ?? null,
      after,
      actor,
      establishment_id: establishmentId,
    },
  });

  res.json({ ok: true, item: after as ProBankDetailsRow });
};

export const validateAdminEstablishmentBankDetails: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const actor = getAdminSessionSubAny(req);
  const supabase = getAdminSupabase();

  const { data: before, error: beforeErr } = await supabase
    .from("finance_pro_bank_details")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!before) return res.status(404).json({ error: "bank_details_not_found" });

  const rib24 =
    typeof (before as any)?.rib_24 === "string"
      ? String((before as any).rib_24)
      : "";
  if (!rib24 || digitsOnly(rib24).length !== 24) {
    return res.status(400).json({ error: "invalid_rib_24" });
  }

  const { data: after, error: updErr } = await supabase
    .from("finance_pro_bank_details")
    .update({
      is_validated: true,
      validated_at: new Date().toISOString(),
      validated_by: actor,
    })
    .eq("id", String((before as any).id ?? ""))
    .select("*")
    .single();

  if (updErr) return res.status(500).json({ error: updErr.message });

  await supabase.from("finance_pro_bank_details_history").insert({
    pro_bank_id: String((after as any).id ?? ""),
    changed_by: actor,
    old_data: before,
    new_data: after,
  });

  await supabase.from("admin_audit_log").insert({
    action: "pro_bank_details.validate",
    entity_type: "finance.pro_bank_details",
    entity_id: String((after as any).id ?? ""),
    metadata: { before, after, actor, establishment_id: establishmentId },
  });

  res.json({ ok: true, item: after as ProBankDetailsRow });
};

export const listAdminEstablishmentBankDetailsHistory: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: bankRow, error: bankErr } = await supabase
    .from("finance_pro_bank_details")
    .select("id")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (bankErr) return res.status(500).json({ error: bankErr.message });
  if (!bankRow)
    return res.json({ ok: true, items: [] as ProBankDetailsHistoryRow[] });

  const bankId = String((bankRow as any).id ?? "");

  const { data, error } = await supabase
    .from("finance_pro_bank_details_history")
    .select("*")
    .eq("pro_bank_id", bankId)
    .order("changed_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: (data ?? []) as ProBankDetailsHistoryRow[] });
};

export const uploadAdminEstablishmentBankDocument: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const contentType = (req.header("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/pdf")) {
    return res
      .status(400)
      .json({ error: "content_type_must_be_application_pdf" });
  }

  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ error: "pdf_body_required" });
  }

  if (body.length > MAX_PRO_BANK_DOC_PDF_BYTES) {
    return res
      .status(413)
      .json({ error: "pdf_too_large", max_bytes: MAX_PRO_BANK_DOC_PDF_BYTES });
  }

  if (!looksLikePdf(body)) {
    return res.status(400).json({ error: "invalid_pdf_signature" });
  }

  const actor = getAdminSessionSubAny(req);
  const supabase = getAdminSupabase();

  const { data: bankRow, error: bankErr } = await supabase
    .from("finance_pro_bank_details")
    .select("id")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (bankErr) return res.status(500).json({ error: bankErr.message });
  if (!bankRow)
    return res.status(404).json({ error: "bank_details_not_found" });

  const bankId = String((bankRow as any).id ?? "");

  const fileNameHeader = req.header("x-file-name") ?? "";
  const fileName = sanitizeFileName(fileNameHeader);

  const docId = randomBytes(12).toString("hex");
  const storagePath = `${establishmentId}/${bankId}/${docId}.pdf`;

  const up = await supabase.storage
    .from(PRO_BANK_DOCS_BUCKET)
    .upload(storagePath, body, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (up.error) return res.status(500).json({ error: up.error.message });

  const { data: created, error: insErr } = await supabase
    .from("finance_pro_bank_documents")
    .insert({
      pro_bank_id: bankId,
      file_path: storagePath,
      file_name: fileName,
      mime_type: "application/pdf",
      size_bytes: body.length,
      uploaded_by: actor,
      uploaded_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insErr) return res.status(500).json({ error: insErr.message });

  res.json({ ok: true, item: created as ProBankDocumentRow });
};

export const listAdminEstablishmentBankDocuments: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: bankRow, error: bankErr } = await supabase
    .from("finance_pro_bank_details")
    .select("id")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (bankErr) return res.status(500).json({ error: bankErr.message });
  if (!bankRow) return res.json({ ok: true, items: [] });

  const bankId = String((bankRow as any).id ?? "");

  const { data, error } = await supabase
    .from("finance_pro_bank_documents")
    .select("*")
    .eq("pro_bank_id", bankId)
    .order("uploaded_at", { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });

  // Provide short-lived signed URLs (10 minutes)
  const items = await Promise.all(
    (data ?? []).map(async (d: any) => {
      const path = String(d.file_path ?? "");
      const signed = path
        ? await supabase.storage
            .from(PRO_BANK_DOCS_BUCKET)
            .createSignedUrl(path, 60 * 10)
        : null;

      return {
        ...(d as ProBankDocumentRow),
        signed_url: signed?.data?.signedUrl ?? null,
      };
    }),
  );

  res.json({ ok: true, items });
};

// ─────────────────────────────────────────────────────────────────────────────
// Booking Policy (per-establishment)
// ─────────────────────────────────────────────────────────────────────────────

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
  };
}

export const getAdminEstablishmentBookingPolicy: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("booking_policies")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  // Return null if no custom policy exists (defaults apply)
  res.json({ ok: true, policy: data ?? null });
};

function asBookingPolicyBoolean(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1" || v === 1) return true;
  if (v === "false" || v === "0" || v === 0) return false;
  return undefined;
}

function asBookingPolicyNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export const updateAdminEstablishmentBookingPolicy: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  if (typeof req.body !== "object" || req.body === null)
    return res.status(400).json({ error: "Corps de requête invalide" });

  const patch: Record<string, unknown> = {};

  const cancellation_enabled = asBookingPolicyBoolean(req.body.cancellation_enabled);
  if (cancellation_enabled !== undefined)
    patch.cancellation_enabled = cancellation_enabled;

  const free_cancellation_hours = asBookingPolicyNumber(req.body.free_cancellation_hours);
  if (free_cancellation_hours !== undefined)
    patch.free_cancellation_hours = Math.max(
      0,
      Math.round(free_cancellation_hours),
    );

  const cancellation_penalty_percent = asBookingPolicyNumber(
    req.body.cancellation_penalty_percent,
  );
  if (cancellation_penalty_percent !== undefined)
    patch.cancellation_penalty_percent = Math.min(
      100,
      Math.max(0, Math.round(cancellation_penalty_percent)),
    );

  const no_show_penalty_percent = asBookingPolicyNumber(req.body.no_show_penalty_percent);
  if (no_show_penalty_percent !== undefined)
    patch.no_show_penalty_percent = Math.min(
      100,
      Math.max(0, Math.round(no_show_penalty_percent)),
    );

  const no_show_always_100_guaranteed = asBookingPolicyBoolean(
    req.body.no_show_always_100_guaranteed,
  );
  if (no_show_always_100_guaranteed !== undefined)
    patch.no_show_always_100_guaranteed = no_show_always_100_guaranteed;

  if (typeof req.body.cancellation_text_fr === "string")
    patch.cancellation_text_fr = req.body.cancellation_text_fr;
  if (typeof req.body.cancellation_text_en === "string")
    patch.cancellation_text_en = req.body.cancellation_text_en;

  const modification_enabled = asBookingPolicyBoolean(req.body.modification_enabled);
  if (modification_enabled !== undefined)
    patch.modification_enabled = modification_enabled;

  const modification_deadline_hours = asBookingPolicyNumber(
    req.body.modification_deadline_hours,
  );
  if (modification_deadline_hours !== undefined)
    patch.modification_deadline_hours = Math.max(
      0,
      Math.round(modification_deadline_hours),
    );

  const requireScoreRaw = req.body.require_guarantee_below_score;
  if (requireScoreRaw === null) {
    patch.require_guarantee_below_score = null;
  } else {
    const requireScore = asBookingPolicyNumber(requireScoreRaw);
    if (requireScore !== undefined)
      patch.require_guarantee_below_score = Math.min(
        100,
        Math.max(0, Math.round(requireScore)),
      );
  }

  if (typeof req.body.modification_text_fr === "string")
    patch.modification_text_fr = req.body.modification_text_fr;
  if (typeof req.body.modification_text_en === "string")
    patch.modification_text_en = req.body.modification_text_en;

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  patch.updated_at = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("booking_policies")
    .upsert(
      { establishment_id: establishmentId, ...patch },
      { onConflict: "establishment_id" },
    );

  if (error) return res.status(500).json({ error: error.message });

  const { data, error: getErr } = await supabase
    .from("booking_policies")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (getErr) return res.status(500).json({ error: getErr.message });

  const defaults = defaultBookingPolicy(establishmentId);
  const row = data
    ? ({ ...defaults, ...(data as Record<string, unknown>) } as Record<
        string,
        unknown
      >)
    : (defaults as Record<string, unknown>);

  res.json({ ok: true, policy: row });
};

export const resetAdminEstablishmentBookingPolicy: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("booking_policies")
    .delete()
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, policy: null });
};

// ============================================
// CATEGORY IMAGES MANAGEMENT
// ============================================

export const listAdminCategoryImages: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const universe = typeof req.query.universe === "string" ? req.query.universe : null;

  const supabase = getAdminSupabase();

  let query = supabase
    .from("category_images")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (universe) {
    query = query.eq("universe", universe);
  }

  const { data, error } = await query.limit(500);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

export const createAdminCategoryImage: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const universe = typeof req.body.universe === "string" ? req.body.universe.trim() : "";
  const categoryId = typeof req.body.category_id === "string" ? req.body.category_id.trim() : "";
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const imageUrl = typeof req.body.image_url === "string" ? req.body.image_url.trim() : "";
  const displayOrder = typeof req.body.display_order === "number" ? req.body.display_order : 0;
  const isActive = req.body.is_active !== false;

  if (!universe || !categoryId || !name || !imageUrl) {
    return res.status(400).json({ error: "universe, category_id, name et image_url sont requis" });
  }

  const validUniverses = ["restaurants", "sport", "loisirs", "hebergement", "culture", "shopping"];
  if (!validUniverses.includes(universe)) {
    return res.status(400).json({ error: "Univers invalide" });
  }

  const supabase = getAdminSupabase();

  // Note: category_slug column may not exist if migration wasn't run yet
  const { data, error } = await supabase
    .from("category_images")
    .insert({
      universe,
      category_id: categoryId,
      name,
      image_url: imageUrl,
      display_order: displayOrder,
      is_active: isActive,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, item: data });
};

export const updateAdminCategoryImage: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const patch: Record<string, unknown> = {};

  if (typeof req.body.name === "string") patch.name = req.body.name.trim();
  if (typeof req.body.image_url === "string") patch.image_url = req.body.image_url.trim();
  if (typeof req.body.display_order === "number") patch.display_order = req.body.display_order;
  if (typeof req.body.is_active === "boolean") patch.is_active = req.body.is_active;
  // Note: category_slug column may not exist if migration wasn't run yet

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "Aucune modification" });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("category_images")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, item: data });
};

export const deleteAdminCategoryImage: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("category_images")
    .delete()
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Category Images: Image upload
// ---------------------------------------------------------------------------

const CATEGORY_IMAGES_BUCKET = "category-images";
const MAX_CATEGORY_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

export const uploadAdminCategoryImage: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const contentType = (req.header("content-type") ?? "").toLowerCase();
  const ext = imageExtensionFromMime(contentType);
  if (!ext) return res.status(400).json({ error: "unsupported_image_type" });

  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0)
    return res.status(400).json({ error: "missing_image_body" });
  if (body.length > MAX_CATEGORY_IMAGE_BYTES)
    return res.status(413).json({ error: "image_too_large" });

  // Signature checks.
  const signatureOk =
    (ext === "jpg" && looksLikeJpeg(body)) ||
    (ext === "png" && looksLikePng(body)) ||
    (ext === "webp" && looksLikeWebp(body));
  if (!signatureOk)
    return res.status(400).json({ error: "invalid_image_signature" });

  const actor = getAdminSessionSubAny(req);
  const fileNameHeader = req.header("x-file-name") ?? "";
  const fileName = sanitizeImageFileName(fileNameHeader, ext);

  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = randomBytes(12).toString("hex");
  const storagePath = `${y}/${m}/${id}.${ext}`;

  const supabase = getAdminSupabase();
  const up = await supabase.storage
    .from(CATEGORY_IMAGES_BUCKET)
    .upload(storagePath, body, {
      contentType,
      upsert: false,
    });

  if (up.error) return res.status(500).json({ error: up.error.message });

  const publicUrl =
    supabase.storage.from(CATEGORY_IMAGES_BUCKET).getPublicUrl(storagePath)
      ?.data?.publicUrl ?? "";

  await supabase.from("admin_audit_log").insert({
    action: "category_images.upload",
    entity_type: "storage",
    entity_id: storagePath,
    metadata: {
      bucket: CATEGORY_IMAGES_BUCKET,
      file_name: fileName,
      mime_type: contentType,
      size_bytes: body.length,
      actor,
    },
  });

  const item = {
    bucket: CATEGORY_IMAGES_BUCKET,
    path: storagePath,
    public_url: publicUrl,
    mime_type: contentType,
    size_bytes: body.length,
  };

  res.json({ ok: true, item });
};

// ============================================
// CATEGORIES MANAGEMENT (Level 2 in hierarchy)
// ============================================

export const listAdminCategoriesLevel2: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const universeSlug = typeof req.query.universe === "string" ? req.query.universe : null;
  const includeInactive = req.query.include_inactive === "true";

  const supabase = getAdminSupabase();

  let query = supabase
    .from("categories")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name_fr", { ascending: true });

  if (universeSlug) {
    query = query.eq("universe_slug", universeSlug);
  }

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query.limit(500);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

export const createAdminCategoryLevel2: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const universeSlug = typeof req.body.universe_slug === "string" ? req.body.universe_slug.trim() : "";
  const slug = typeof req.body.slug === "string" ? req.body.slug.trim() : "";
  const nameFr = typeof req.body.name_fr === "string" ? req.body.name_fr.trim() : "";
  const nameEn = typeof req.body.name_en === "string" ? req.body.name_en.trim() : null;
  const descriptionFr = typeof req.body.description_fr === "string" ? req.body.description_fr.trim() : null;
  const descriptionEn = typeof req.body.description_en === "string" ? req.body.description_en.trim() : null;
  const iconName = typeof req.body.icon_name === "string" ? req.body.icon_name.trim() : null;
  const imageUrl = typeof req.body.image_url === "string" ? req.body.image_url.trim() : null;
  const displayOrder = typeof req.body.display_order === "number" ? req.body.display_order : 0;
  const isActive = req.body.is_active !== false;
  const requiresBooking = req.body.requires_booking !== false;
  const supportsPacks = req.body.supports_packs !== false;

  if (!universeSlug || !slug || !nameFr) {
    return res.status(400).json({ error: "universe_slug, slug et name_fr sont requis" });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("categories")
    .insert({
      universe_slug: universeSlug,
      slug,
      name_fr: nameFr,
      name_en: nameEn,
      description_fr: descriptionFr,
      description_en: descriptionEn,
      icon_name: iconName,
      image_url: imageUrl,
      display_order: displayOrder,
      is_active: isActive,
      requires_booking: requiresBooking,
      supports_packs: supportsPacks,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, item: data });
};

export const updateAdminCategoryLevel2: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const patch: Record<string, unknown> = {};

  if (typeof req.body.name_fr === "string") patch.name_fr = req.body.name_fr.trim();
  if (typeof req.body.name_en === "string") patch.name_en = req.body.name_en.trim() || null;
  if (typeof req.body.description_fr === "string") patch.description_fr = req.body.description_fr.trim() || null;
  if (typeof req.body.description_en === "string") patch.description_en = req.body.description_en.trim() || null;
  if (typeof req.body.icon_name === "string") patch.icon_name = req.body.icon_name.trim() || null;
  if (typeof req.body.image_url === "string") patch.image_url = req.body.image_url.trim() || null;
  if (typeof req.body.display_order === "number") patch.display_order = req.body.display_order;
  if (typeof req.body.is_active === "boolean") patch.is_active = req.body.is_active;
  if (typeof req.body.requires_booking === "boolean") patch.requires_booking = req.body.requires_booking;
  if (typeof req.body.supports_packs === "boolean") patch.supports_packs = req.body.supports_packs;

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "Aucune modification" });
  }

  patch.updated_at = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("categories")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, item: data });
};

export const deleteAdminCategoryLevel2: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// UNIVERSES MANAGEMENT
// ---------------------------------------------------------------------------

export const listAdminUniverses: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const includeInactive = req.query.include_inactive === "true";

  const supabase = getAdminSupabase();

  let q = supabase
    .from("universes")
    .select(
      "id,slug,label_fr,label_en,icon_name,color,sort_order,is_active,image_url,created_at,updated_at",
    )
    .order("sort_order", { ascending: true });

  if (!includeInactive) {
    q = q.eq("is_active", true);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

export const createAdminUniverse: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const slug = asString(req.body.slug)?.trim().toLowerCase();
  const labelFr = asString(req.body.label_fr)?.trim();
  const labelEn = asString(req.body.label_en)?.trim();
  const iconName = asString(req.body.icon_name)?.trim() || "Circle";
  const color = asString(req.body.color)?.trim() || "#a3001d";
  const sortOrder =
    typeof req.body.sort_order === "number" ? req.body.sort_order : 0;
  const isActive = req.body.is_active !== false;
  const imageUrl = req.body.image_url !== undefined
    ? (asString(req.body.image_url)?.trim() || null)
    : null;

  if (!slug || !/^[a-z0-9_-]+$/.test(slug))
    return res
      .status(400)
      .json({ error: "Slug invalide (lettres minuscules, chiffres, tirets)" });
  if (!labelFr) return res.status(400).json({ error: "Label FR requis" });
  if (!labelEn) return res.status(400).json({ error: "Label EN requis" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("universes")
    .insert({
      slug,
      label_fr: labelFr,
      label_en: labelEn,
      icon_name: iconName,
      color,
      sort_order: sortOrder,
      is_active: isActive,
      image_url: imageUrl,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "universes.create",
    entity_type: "universes",
    entity_id: (data as any)?.id ?? null,
    metadata: { slug, label_fr: labelFr, label_en: labelEn, icon_name: iconName },
  });

  res.json({ ok: true, id: (data as any)?.id ?? null });
};

export const updateAdminUniverse: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const patch: Record<string, unknown> = {};

  if (req.body.slug !== undefined) {
    const slug = asString(req.body.slug)?.trim().toLowerCase();
    if (!slug || !/^[a-z0-9_-]+$/.test(slug))
      return res.status(400).json({ error: "Slug invalide" });
    patch.slug = slug;
  }
  if (req.body.label_fr !== undefined)
    patch.label_fr = asString(req.body.label_fr)?.trim();
  if (req.body.label_en !== undefined)
    patch.label_en = asString(req.body.label_en)?.trim();
  if (req.body.icon_name !== undefined)
    patch.icon_name = asString(req.body.icon_name)?.trim();
  if (req.body.color !== undefined)
    patch.color = asString(req.body.color)?.trim();
  if (req.body.sort_order !== undefined)
    patch.sort_order = Number(req.body.sort_order) || 0;
  if (req.body.is_active !== undefined)
    patch.is_active = Boolean(req.body.is_active);
  if (req.body.image_url !== undefined)
    patch.image_url = asString(req.body.image_url)?.trim() || null;

  if (Object.keys(patch).length === 0)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("universes").update(patch).eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "universes.update",
    entity_type: "universes",
    entity_id: id,
    metadata: { patch },
  });

  res.json({ ok: true });
};

export const reorderAdminUniverses: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const order = req.body.order;
  if (!Array.isArray(order) || order.length === 0)
    return res.status(400).json({ error: "Liste d'ordre requise" });

  const supabase = getAdminSupabase();

  // Update sort_order for each universe
  const updates = order.map((id: string, index: number) =>
    supabase
      .from("universes")
      .update({ sort_order: index + 1 })
      .eq("id", id),
  );

  const results = await Promise.all(updates);
  const hasError = results.some((r) => r.error);
  if (hasError)
    return res.status(500).json({ error: "Erreur lors de la réorganisation" });

  await supabase.from("admin_audit_log").insert({
    action: "universes.reorder",
    entity_type: "universes",
    entity_id: null,
    metadata: { order },
  });

  res.json({ ok: true });
};

export const deleteAdminUniverse: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  // Get the slug first to check usage in establishments
  const { data: universe } = await supabase
    .from("universes")
    .select("slug")
    .eq("id", id)
    .single();

  if (universe?.slug) {
    // Check if universe is in use by establishments
    const { data: usageCheck } = await supabase
      .from("establishments")
      .select("id")
      .eq("universe", universe.slug)
      .limit(1);

    if (usageCheck && usageCheck.length > 0) {
      return res.status(400).json({
        error:
          "Impossible de supprimer: cet univers est utilisé par des établissements",
      });
    }

    // Check if universe is in use by home_curation_items
    const { data: curationCheck } = await supabase
      .from("home_curation_items")
      .select("id")
      .eq("universe", universe.slug)
      .limit(1);

    if (curationCheck && curationCheck.length > 0) {
      return res.status(400).json({
        error:
          "Impossible de supprimer: cet univers est utilisé dans la curation homepage",
      });
    }
  }

  const { error } = await supabase.from("universes").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "universes.delete",
    entity_type: "universes",
    entity_id: id,
    metadata: {},
  });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Universe Images: Image upload
// ---------------------------------------------------------------------------

const UNIVERSE_IMAGES_BUCKET = "universe-images";
const MAX_UNIVERSE_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

export const uploadAdminUniverseImage: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const contentType = (req.header("content-type") ?? "").toLowerCase();
  const ext = imageExtensionFromMime(contentType);
  if (!ext) return res.status(400).json({ error: "unsupported_image_type" });

  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0)
    return res.status(400).json({ error: "missing_image_body" });
  if (body.length > MAX_UNIVERSE_IMAGE_BYTES)
    return res.status(413).json({ error: "image_too_large" });

  // Signature checks.
  const signatureOk =
    (ext === "jpg" && looksLikeJpeg(body)) ||
    (ext === "png" && looksLikePng(body)) ||
    (ext === "webp" && looksLikeWebp(body));
  if (!signatureOk)
    return res.status(400).json({ error: "invalid_image_signature" });

  const actor = getAdminSessionSubAny(req);
  const fileNameHeader = req.header("x-file-name") ?? "";
  const fileName = sanitizeImageFileName(fileNameHeader, ext);

  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = randomBytes(12).toString("hex");
  const storagePath = `${y}/${m}/${id}.${ext}`;

  const supabase = getAdminSupabase();
  const up = await supabase.storage
    .from(UNIVERSE_IMAGES_BUCKET)
    .upload(storagePath, body, {
      contentType,
      upsert: false,
    });

  if (up.error) return res.status(500).json({ error: up.error.message });

  const publicUrl =
    supabase.storage.from(UNIVERSE_IMAGES_BUCKET).getPublicUrl(storagePath)
      ?.data?.publicUrl ?? "";

  await supabase.from("admin_audit_log").insert({
    action: "universe_images.upload",
    entity_type: "storage",
    entity_id: storagePath,
    metadata: {
      bucket: UNIVERSE_IMAGES_BUCKET,
      file_name: fileName,
      mime_type: contentType,
      size_bytes: body.length,
      actor,
    },
  });

  const item = {
    bucket: UNIVERSE_IMAGES_BUCKET,
    path: storagePath,
    public_url: publicUrl,
    mime_type: contentType,
    size_bytes: body.length,
  };

  res.json({ ok: true, item });
};

// ---------------------------------------------------------------------------
// HOME SETTINGS MANAGEMENT (Hero Background, etc.)
// ---------------------------------------------------------------------------

export const getAdminHomeSettings: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("home_settings")
    .select("key,value,updated_at");

  if (error) {
    // Table might not exist yet, return defaults
    if (error.code === "42P01") {
      return res.json({
        ok: true,
        settings: {
          hero: { background_image_url: null, overlay_opacity: 0.7 },
        },
      });
    }
    return res.status(500).json({ error: error.message });
  }

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  res.json({ ok: true, settings });
};

export const updateAdminHomeSettings: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const key = asString(req.body.key)?.trim();
  const value = req.body.value;

  if (!key) return res.status(400).json({ error: "Clé requise" });
  if (value === undefined)
    return res.status(400).json({ error: "Valeur requise" });

  const supabase = getAdminSupabase();

  const { error } = await supabase.from("home_settings").upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "home_settings.update",
    entity_type: "home_settings",
    entity_id: key,
    metadata: { value },
  });

  res.json({ ok: true });
};

export const uploadAdminHeroImage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const base64Data = asString(req.body.image);
  const mimeType = asString(req.body.mime_type) || "image/jpeg";

  if (!base64Data)
    return res.status(400).json({ error: "Image base64 requise" });

  // Validate mime type
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    return res.status(400).json({ error: "Format d'image non supporté (JPG, PNG, WebP uniquement)" });
  }

  const supabase = getAdminSupabase();

  // Generate unique filename
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const filename = `hero-${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  const path = `home/${filename}`;

  // Decode base64
  const buffer = Buffer.from(base64Data, "base64");

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from("public-assets")
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    // If bucket doesn't exist, try creating it or return helpful error
    return res.status(500).json({ error: `Erreur upload: ${uploadError.message}` });
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("public-assets")
    .getPublicUrl(path);

  const publicUrl = urlData?.publicUrl;

  if (!publicUrl) {
    return res.status(500).json({ error: "Impossible d'obtenir l'URL publique" });
  }

  // Update home_settings with new image URL
  await supabase.from("home_settings").upsert(
    {
      key: "hero",
      value: { background_image_url: publicUrl, overlay_opacity: 0.7 },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  await supabase.from("admin_audit_log").insert({
    action: "home_settings.hero_image_upload",
    entity_type: "home_settings",
    entity_id: "hero",
    metadata: { url: publicUrl },
  });

  res.json({ ok: true, url: publicUrl });
};

export const deleteAdminHeroImage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  // Get current hero settings
  const { data: current } = await supabase
    .from("home_settings")
    .select("value")
    .eq("key", "hero")
    .single();

  const currentUrl = (current?.value as any)?.background_image_url;

  // Delete from storage if exists
  if (currentUrl && currentUrl.includes("/public-assets/")) {
    const pathMatch = currentUrl.match(/\/public-assets\/(.+)$/);
    if (pathMatch?.[1]) {
      await supabase.storage.from("public-assets").remove([pathMatch[1]]);
    }
  }

  // Update settings to remove image
  await supabase.from("home_settings").upsert(
    {
      key: "hero",
      value: { background_image_url: null, overlay_opacity: 0.7 },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  await supabase.from("admin_audit_log").insert({
    action: "home_settings.hero_image_delete",
    entity_type: "home_settings",
    entity_id: "hero",
    metadata: {},
  });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// HOME CITIES MANAGEMENT
// ---------------------------------------------------------------------------

export const listAdminHomeCities: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const includeInactive = req.query.include_inactive === "true";

  const supabase = getAdminSupabase();

  let q = supabase
    .from("home_cities")
    .select("id,name,slug,image_url,sort_order,is_active,created_at,updated_at")
    .order("sort_order", { ascending: true });

  if (!includeInactive) {
    q = q.eq("is_active", true);
  }

  const { data, error } = await q;
  if (error) {
    // Table might not exist yet
    if (error.code === "42P01") {
      return res.json({ ok: true, items: [] });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, items: data ?? [] });
};

export const createAdminHomeCity: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const name = asString(req.body.name)?.trim();
  const slug = asString(req.body.slug)?.trim().toLowerCase();
  const imageUrl = asString(req.body.image_url)?.trim() || null;
  const sortOrder =
    typeof req.body.sort_order === "number" ? req.body.sort_order : 0;
  const isActive = req.body.is_active !== false;

  if (!name) return res.status(400).json({ error: "Nom requis" });
  if (!slug || !/^[a-z0-9-]+$/.test(slug))
    return res
      .status(400)
      .json({ error: "Slug invalide (lettres minuscules, chiffres, tirets)" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("home_cities")
    .insert({
      name,
      slug,
      image_url: imageUrl,
      sort_order: sortOrder,
      is_active: isActive,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "home_cities.create",
    entity_type: "home_cities",
    entity_id: (data as any)?.id ?? null,
    metadata: { name, slug },
  });

  res.json({ ok: true, id: (data as any)?.id ?? null });
};

export const updateAdminHomeCity: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const patch: Record<string, unknown> = {};

  if (req.body.name !== undefined) patch.name = asString(req.body.name)?.trim();
  if (req.body.slug !== undefined) {
    const slug = asString(req.body.slug)?.trim().toLowerCase();
    if (!slug || !/^[a-z0-9-]+$/.test(slug))
      return res.status(400).json({ error: "Slug invalide" });
    patch.slug = slug;
  }
  if (req.body.image_url !== undefined)
    patch.image_url = asString(req.body.image_url)?.trim() || null;
  if (req.body.sort_order !== undefined)
    patch.sort_order = Number(req.body.sort_order) || 0;
  if (req.body.is_active !== undefined)
    patch.is_active = Boolean(req.body.is_active);

  if (Object.keys(patch).length === 0)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("home_cities").update(patch).eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "home_cities.update",
    entity_type: "home_cities",
    entity_id: id,
    metadata: { patch },
  });

  res.json({ ok: true });
};

export const reorderAdminHomeCities: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const order = req.body.order;
  if (!Array.isArray(order) || order.length === 0)
    return res.status(400).json({ error: "Liste d'ordre requise" });

  const supabase = getAdminSupabase();

  const updates = order.map((id: string, index: number) =>
    supabase
      .from("home_cities")
      .update({ sort_order: index + 1 })
      .eq("id", id),
  );

  const results = await Promise.all(updates);
  const hasError = results.some((r) => r.error);
  if (hasError)
    return res.status(500).json({ error: "Erreur lors de la réorganisation" });

  await supabase.from("admin_audit_log").insert({
    action: "home_cities.reorder",
    entity_type: "home_cities",
    entity_id: null,
    metadata: { order },
  });

  res.json({ ok: true });
};

export const deleteAdminHomeCity: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  // Get the city first to clean up storage
  const { data: city } = await supabase
    .from("home_cities")
    .select("image_url")
    .eq("id", id)
    .single();

  // Delete image from storage if exists
  if (city?.image_url && city.image_url.includes("/public-assets/")) {
    const pathMatch = city.image_url.match(/\/public-assets\/(.+)$/);
    if (pathMatch?.[1]) {
      await supabase.storage.from("public-assets").remove([pathMatch[1]]);
    }
  }

  const { error } = await supabase.from("home_cities").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("admin_audit_log").insert({
    action: "home_cities.delete",
    entity_type: "home_cities",
    entity_id: id,
    metadata: {},
  });

  res.json({ ok: true });
};

export const uploadAdminHomeCityImage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const cityId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!cityId) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const base64Data = asString(req.body.image);
  const mimeType = asString(req.body.mime_type) || "image/jpeg";

  if (!base64Data)
    return res.status(400).json({ error: "Aucune image fournie" });

  const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  const actualData = matches ? matches[2] : base64Data;
  const actualMime = matches ? matches[1] : mimeType;

  const buffer = Buffer.from(actualData, "base64");
  if (buffer.length > 5 * 1024 * 1024)
    return res
      .status(400)
      .json({ error: "Image trop volumineuse (max 5 Mo)" });

  const ext =
    actualMime === "image/png"
      ? "png"
      : actualMime === "image/webp"
        ? "webp"
        : "jpg";
  const filename = `home-cities/${cityId}-${Date.now()}.${ext}`;

  const supabase = getAdminSupabase();

  // Get current city to delete old image
  const { data: currentCity } = await supabase
    .from("home_cities")
    .select("image_url")
    .eq("id", cityId)
    .single();

  // Delete old image from storage if exists
  if (currentCity?.image_url && currentCity.image_url.includes("/public-assets/")) {
    const pathMatch = currentCity.image_url.match(/\/public-assets\/(.+)$/);
    if (pathMatch?.[1]) {
      await supabase.storage.from("public-assets").remove([pathMatch[1]]);
    }
  }

  const { error: uploadError } = await supabase.storage
    .from("public-assets")
    .upload(filename, buffer, {
      contentType: actualMime,
      upsert: true,
    });

  if (uploadError)
    return res.status(500).json({ error: uploadError.message });

  const {
    data: { publicUrl },
  } = supabase.storage.from("public-assets").getPublicUrl(filename);

  // Update city with new image URL
  const { error: updateError } = await supabase
    .from("home_cities")
    .update({ image_url: publicUrl })
    .eq("id", cityId);

  if (updateError)
    return res.status(500).json({ error: updateError.message });

  await supabase.from("admin_audit_log").insert({
    action: "home_cities.image_upload",
    entity_type: "home_cities",
    entity_id: cityId,
    metadata: { url: publicUrl },
  });

  res.json({ ok: true, url: publicUrl });
};

// ============================================================================
// PLATFORM SETTINGS (Superadmin only)
// ============================================================================

import {
  listPlatformSettings,
  updatePlatformSetting,
  getPlatformSettingsSnapshot,
  invalidateSettingsCache,
  type PlatformSetting,
} from "../platformSettings";

/**
 * GET /api/admin/settings/platform
 * List all platform settings (Superadmin only)
 */
export const listPlatformSettingsHandler: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  try {
    const settings = await listPlatformSettings();
    res.json({ ok: true, items: settings });
  } catch (error) {
    console.error("[Admin] Platform settings list error:", error);
    res.status(500).json({ error: "Erreur lors de la récupération des paramètres" });
  }
};

/**
 * GET /api/admin/settings/platform/snapshot
 * Get platform settings snapshot (for quick access to feature flags)
 */
export const getPlatformSettingsSnapshotHandler: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  try {
    const snapshot = await getPlatformSettingsSnapshot();
    res.json({ ok: true, snapshot });
  } catch (error) {
    console.error("[Admin] Platform settings snapshot error:", error);
    res.status(500).json({ error: "Erreur lors de la récupération du snapshot" });
  }
};

/**
 * POST /api/admin/settings/platform/:key/update
 * Update a platform setting (Superadmin only)
 */
export const updatePlatformSettingHandler: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const key = typeof req.params.key === "string" ? req.params.key.trim() : "";
  if (!key) return res.status(400).json({ error: "Clé requise" });

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Corps de requête invalide" });
  }

  const { value } = req.body;
  if (typeof value !== "string") {
    return res.status(400).json({ error: "Valeur requise (string)" });
  }

  const updatedBy = getAdminSessionSubAny(req) || "unknown";

  try {
    const updated = await updatePlatformSetting(key, value, updatedBy);

    // Also log to audit
    const supabase = getAdminSupabase();
    await supabase.from("admin_audit_log").insert({
      action: "settings.platform.update",
      entity_type: "platform_settings",
      entity_id: key,
      metadata: {
        key,
        new_value: value,
        actor: updatedBy,
      },
    });

    res.json({ ok: true, item: updated });
  } catch (error) {
    console.error("[Admin] Platform setting update error:", error);
    res.status(500).json({ error: "Erreur lors de la mise à jour" });
  }
};

/**
 * POST /api/admin/settings/platform/set-mode
 * Quick switch for platform mode (test/commercial)
 */
export const setPlatformModeHandler: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Corps de requête invalide" });
  }

  const { mode } = req.body;
  if (mode !== "test" && mode !== "commercial" && mode !== "maintenance") {
    return res.status(400).json({ error: "Mode invalide. Valeurs acceptées: test, commercial, maintenance" });
  }

  const updatedBy = getAdminSessionSubAny(req) || "unknown";

  try {
    // Update mode
    await updatePlatformSetting("PLATFORM_MODE", mode, updatedBy);

    // If switching to test mode, disable payment features
    if (mode === "test") {
      await Promise.all([
        updatePlatformSetting("PAYMENTS_RESERVATIONS_ENABLED", "false", updatedBy),
        updatePlatformSetting("COMMISSIONS_ENABLED", "false", updatedBy),
        updatePlatformSetting("SUBSCRIPTIONS_ENABLED", "false", updatedBy),
        updatePlatformSetting("PACKS_PURCHASES_ENABLED", "false", updatedBy),
        updatePlatformSetting("PAYOUTS_ENABLED", "false", updatedBy),
        updatePlatformSetting("GUARANTEE_DEPOSITS_ENABLED", "false", updatedBy),
        updatePlatformSetting("WALLET_CREDITS_ENABLED", "false", updatedBy),
      ]);
    }

    // If switching to commercial mode, enable payment features
    if (mode === "commercial") {
      await Promise.all([
        updatePlatformSetting("PAYMENTS_RESERVATIONS_ENABLED", "true", updatedBy),
        updatePlatformSetting("COMMISSIONS_ENABLED", "true", updatedBy),
        updatePlatformSetting("PACKS_PURCHASES_ENABLED", "true", updatedBy),
        updatePlatformSetting("PAYOUTS_ENABLED", "true", updatedBy),
        updatePlatformSetting("GUARANTEE_DEPOSITS_ENABLED", "true", updatedBy),
      ]);
    }

    // Log mode change
    const supabase = getAdminSupabase();
    await supabase.from("admin_audit_log").insert({
      action: "settings.platform.mode_change",
      entity_type: "platform_settings",
      entity_id: "PLATFORM_MODE",
      metadata: {
        new_mode: mode,
        actor: updatedBy,
      },
    });

    const snapshot = await getPlatformSettingsSnapshot();
    res.json({ ok: true, mode, snapshot });
  } catch (error) {
    console.error("[Admin] Platform mode change error:", error);
    res.status(500).json({ error: "Erreur lors du changement de mode" });
  }
};

/**
 * POST /api/admin/settings/platform/invalidate-cache
 * Force refresh of platform settings cache
 */
export const invalidatePlatformSettingsCacheHandler: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  invalidateSettingsCache();
  res.json({ ok: true, message: "Cache invalidé" });
};
