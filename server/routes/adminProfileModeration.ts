/**
 * Admin Profile Moderation Routes — Establishment profile updates & moderation queue.
 *
 * Extracted from the monolithic admin.ts.
 * Handles establishment profile draft review (accept/reject per field or all),
 * moderation queue listing, and moderation item approval/rejection.
 */

import type { RequestHandler } from "express";
import {
  requireAdminKey,
  isRecord,
  asString,
  asNumber,
  asStringArray,
  asJsonObject,
  getAdminSupabase,
  getAdminSessionSub,
  getAuditActorInfo,
  type EstablishmentRow,
} from "./adminHelpers";
import { createModuleLogger } from "../lib/logger";
import { transformWizardHoursToOpeningHours } from "../lib/transformHours";

const log = createModuleLogger("adminProfileModeration");

// =============================================================================
// Local types
// =============================================================================

type ModerationQueueRow = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  payload: unknown;
};

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

// =============================================================================
// Constants
// =============================================================================

const PROFILE_UPDATE_FIELD_LABELS: Record<string, string> = {
  name: "Nom",
  universe: "Univers",
  category: "Catégorie",
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
  email: "Email",
  website: "Site web",
  social_links: "Réseaux sociaux",
  hours: "Horaires",
  tags: "Tags",
  amenities: "Équipements",
  logo_url: "Logo",
  cover_url: "Photo de couverture",
  gallery_urls: "Photos (galerie)",
  ambiance_tags: "Ambiances",
  extra: "Infos complémentaires",
  mix_experience: "Points forts",
};

const PROFILE_UPDATE_FIELDS = new Set(Object.keys(PROFILE_UPDATE_FIELD_LABELS));

// =============================================================================
// Local helpers
// =============================================================================

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
      body: "Vos modifications ont été validées par l'équipe Sortir Au Maroc et sont désormais visibles sur votre fiche.",
    };
  }
  if (s === "partially_accepted") {
    return {
      title: "Modifications partiellement validées",
      body: "Certaines de vos modifications ont été acceptées, d'autres refusées. Consultez le détail pour voir ce qui a été ajusté.",
    };
  }
  return {
    title: "Modifications refusées",
    body: "Vos modifications n'ont pas pu être acceptées. Merci de vérifier les informations ou de contacter le support.",
  };
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

  const email = asString(data.email);
  if (email !== undefined) update.email = email;

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

  const serviceTypes = asStringArray(data.service_types);
  if (serviceTypes !== undefined) update.service_types = serviceTypes;

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
        "service_types",
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

async function finalizeDraftIfComplete(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  establishmentId: string;
  draftId: string;
  decidedAtIso: string;
  adminSub: string | null;
  req: Parameters<RequestHandler>[0];
}): Promise<
  | { ok: true; finalized: false }
  | {
      ok: true;
      finalized: true;
      status: "approved" | "rejected" | "partially_accepted";
    }
  | { ok: false; status?: number; error: string }
> {
  const { supabase, establishmentId, draftId, decidedAtIso, adminSub, req } = args;

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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "establishment.profile_update.finalize",
    entity_type: "establishment",
    entity_id: establishmentId,
    metadata: { draft_id: draftId, decision: overall, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
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

  // Get all recent drafts (pending, approved, rejected, partial)
  // We show pending ones first, then recently decided ones
  const { data: drafts, error: draftsError } = await supabase
    .from("establishment_profile_drafts")
    .select(
      "id, establishment_id, created_by, created_at, moderation_id, status, decided_at, reason",
    )
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (draftsError) return { ok: false, error: draftsError.message };

  const list = (drafts ?? []) as any[];
  log.info({ count: list.length, establishmentId }, "Profile updates drafts found");
  if (!list.length) return { ok: true, items: [] };

  const draftIds = list.map((d) => String(d.id)).filter(Boolean);
  log.info({ draftIds }, "Profile updates draft IDs");
  const authorIds = Array.from(
    new Set(list.map((d) => String(d.created_by)).filter(Boolean)),
  );

  const [changesRes, authorsProRes, authorsAuthRes] = await Promise.all([
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
    // Also fetch from auth.users as fallback
    authorIds.length
      ? supabase.auth.admin.listUsers()
      : Promise.resolve({ data: { users: [] }, error: null } as any),
  ]);

  if (changesRes.error) {
    log.error({ err: changesRes.error }, "Profile updates changes fetch error");
    return { ok: false, error: changesRes.error.message };
  }
  if (authorsProRes.error) return { ok: false, error: authorsProRes.error.message };

  log.info({ count: changesRes.data?.length ?? 0, draftIds }, "Profile updates changes found");

  const byDraft: Record<string, DraftChangeRow[]> = {};
  for (const c of (changesRes.data ?? []) as any[]) {
    const did = String(c.draft_id ?? "");
    if (!did) continue;
    if (!byDraft[did]) byDraft[did] = [];
    byDraft[did].push(c as DraftChangeRow);
  }

  const authorEmailById = new Map<string, string | null>();

  // First, populate from users_pro
  for (const a of (authorsProRes.data ?? []) as any[]) {
    const id = String(a.user_id ?? "");
    if (!id) continue;
    authorEmailById.set(id, typeof a.email === "string" ? a.email : null);
  }

  // Then, fill missing emails from auth.users
  const authUsers = authorsAuthRes?.data?.users ?? [];
  for (const uid of authorIds) {
    if (!authorEmailById.has(uid) || !authorEmailById.get(uid)) {
      const authUser = authUsers.find((u: any) => u.id === uid);
      if (authUser?.email) {
        authorEmailById.set(uid, authUser.email);
      }
    }
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

  // Normalize hours to array-of-intervals format so the DB is always consistent,
  // regardless of whether the pro submitted v1, v2, or array format.
  let normalizedValue = value;
  if (field === "hours" && value && typeof value === "object" && !Array.isArray(value)) {
    normalizedValue = transformWizardHoursToOpeningHours(value as Record<string, unknown>);
  }

  const { error: updateError } = await supabase
    .from("establishments")
    .update({ [field]: normalizedValue, updated_at: decidedAtIso })
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

// =============================================================================
// Exported handlers
// =============================================================================

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
  const hasCorrectedValue = req.body != null && typeof req.body === "object" && "correctedValue" in req.body;
  const value = hasCorrectedValue ? req.body.correctedValue : (change as any).after;

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
      ...(hasCorrectedValue ? { after: value } : {}),
    })
    .eq("id", changeId);

  if (updateError) return res.status(500).json({ error: updateError.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "establishment.profile_update.accept",
    entity_type: "establishment",
    entity_id: establishmentId,
    metadata: {
      draft_id: draftId,
      change_id: changeId,
      field,
      field_label: prettyFieldLabel(field),
      corrected: hasCorrectedValue,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  const finalizeRes = await finalizeDraftIfComplete({
    supabase,
    establishmentId,
    draftId,
    decidedAtIso: decidedAt,
    adminSub,
    req,
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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "establishment.profile_update.reject",
    entity_type: "establishment",
    entity_id: establishmentId,
    metadata: {
      draft_id: draftId,
      change_id: changeId,
      field,
      field_label: prettyFieldLabel(field),
      reason: reason || null,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  const finalizeRes = await finalizeDraftIfComplete({
    supabase,
    establishmentId,
    draftId,
    decidedAtIso: decidedAt,
    adminSub,
    req,
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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "establishment.profile_update.accept_all",
    entity_type: "establishment",
    entity_id: establishmentId,
    metadata: { draft_id: draftId, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  const finalizeRes = await finalizeDraftIfComplete({
    supabase,
    establishmentId,
    draftId,
    decidedAtIso: decidedAt,
    adminSub,
    req,
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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "establishment.profile_update.reject_all",
    entity_type: "establishment",
    entity_id: establishmentId,
    metadata: { draft_id: draftId, reason: reason || null, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  const finalizeRes = await finalizeDraftIfComplete({
    supabase,
    establishmentId,
    draftId,
    decidedAtIso: decidedAt,
    adminSub,
    req,
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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "moderation.approve",
    entity_type: moderation.entity_type,
    entity_id: moderation.entity_id,
    metadata: { moderation_id: id, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "moderation.reject",
    entity_type: moderation.entity_type,
    entity_id: moderation.entity_id,
    metadata: { moderation_id: id, reason, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};
