/**
 * Routes API PRO - Account Management
 *
 * Extracted from the monolithic pro.ts.
 *
 * Endpoints for:
 * - Listing memberships / establishments
 * - Password management (check, reset, change)
 * - Onboarding wizard
 * - Establishment creation
 * - Profile draft updates
 */

import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { getAdminSupabase } from "../supabaseAdmin";
import { emitAdminNotification } from "../adminNotifications";
import { sendLoggedEmail } from "../emailService";
import { createModuleLogger } from "../lib/logger";
import {
  parseBearerToken,
  getUserFromBearerToken,
  ensureRole,
  ensureCanSubmitProfileUpdate,
  isRecord,
  asString,
  asNumber,
  asBoolean,
  asStringArray,
  asJsonObject,
  normalizeEmail,
  listInternalVisibilityOrderEmails,
  type ProUser,
  type ProRole,
} from "./proHelpers";

const log = createModuleLogger("proAccount");

// =============================================================================
// Local helpers
// =============================================================================

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

  const logoUrl = asString(data.logo_url);
  if (logoUrl !== undefined) out.logo_url = logoUrl;

  const coverUrl = asString(data.cover_url);
  if (coverUrl !== undefined) out.cover_url = coverUrl;

  const galleryUrls = asStringArray(data.gallery_urls);
  if (galleryUrls !== undefined) out.gallery_urls = galleryUrls;

  const ambianceTags = asStringArray(data.ambiance_tags);
  if (ambianceTags !== undefined) out.ambiance_tags = ambianceTags;

  const serviceTypes = asStringArray(data.service_types);
  if (serviceTypes !== undefined) out.service_types = serviceTypes;

  const mixExperience = asJsonObject(data.mix_experience);
  if (mixExperience !== undefined) out.mix_experience = mixExperience;

  const extra = asJsonObject(data.extra);
  if (extra !== undefined) out.extra = extra;

  return out;
}

// =============================================================================
// Handlers
// =============================================================================

export const listMyMemberships: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id, user_id, role")
    .eq("user_id", userResult.user.id);

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
    .select("establishment_id, user_id, role")
    .eq("user_id", userResult.user.id);

  if (membershipsError) return res.status(500).json({ error: membershipsError.message });

  const ids = (memberships ?? []).map((m: { establishment_id: string }) => m.establishment_id);
  if (!ids.length) return res.json({ ok: true, establishments: [] });

  const { data: establishments, error: estError } = await supabase
    .from("establishments")
    .select("*")
    .in("id", ids);

  if (estError) return res.status(500).json({ error: estError.message });

  const roleMap = new Map<string, string>();
  for (const m of memberships ?? []) {
    roleMap.set(m.establishment_id, (m as { role: string }).role);
  }

  const enriched = (establishments ?? []).map((e: Record<string, unknown>) => ({
    ...e,
    pro_role: roleMap.get(e.id as string) ?? null,
  }));

  res.json({ ok: true, establishments: enriched });
};

export const checkPasswordStatus: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userResult.user.id);
  if (userError || !userData?.user) return res.status(500).json({ error: "Impossible de vérifier le statut du mot de passe" });

  const identities = userData.user.identities ?? [];
  const hasEmailIdentity = identities.some((id) => id.provider === "email");

  const lastPasswordChange = (userData.user as any)?.last_sign_in_at ?? null;

  const userMeta = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
  const needsPasswordChange = userMeta.needs_password_change === true;
  const isTemporaryPassword = userMeta.is_temporary_password === true;

  res.json({
    ok: true,
    hasPassword: hasEmailIdentity,
    needsPasswordChange,
    isTemporaryPassword,
    lastPasswordChange,
  });
};

export const requestPasswordReset: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  if (!userResult.user.email) return res.status(400).json({ error: "No email found for this user" });

  const supabase = getAdminSupabase();

  const redirectTo = typeof req.body?.redirect_to === "string" ? req.body.redirect_to.trim() : undefined;

  const { error } = await supabase.auth.resetPasswordForEmail(userResult.user.email, {
    redirectTo: redirectTo || undefined,
  });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, message: "Un email de réinitialisation a été envoyé" });
};

export const changePassword: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const newPassword = asString(req.body.new_password);
  const currentPassword = asString(req.body.current_password);

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 8 caractères" });
  }

  const supabase = getAdminSupabase();

  const userMeta = ((await supabase.auth.admin.getUserById(userResult.user.id)).data?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const isTemporaryPassword = userMeta.is_temporary_password === true;
  const needsPasswordChange = userMeta.needs_password_change === true;

  if (!isTemporaryPassword && !needsPasswordChange && currentPassword) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

    if (supabaseUrl && supabaseAnonKey && userResult.user.email) {
      const anonClient = createClient(supabaseUrl, supabaseAnonKey);
      const { error: signInError } = await anonClient.auth.signInWithPassword({
        email: userResult.user.email,
        password: currentPassword,
      });

      if (signInError) {
        return res.status(400).json({ error: "Le mot de passe actuel est incorrect" });
      }
    }
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(userResult.user.id, {
    password: newPassword,
    user_metadata: {
      ...userMeta,
      needs_password_change: false,
      is_temporary_password: false,
    },
  });

  if (updateError) return res.status(500).json({ error: updateError.message });

  res.json({ ok: true, message: "Mot de passe mis à jour avec succès" });
};

export const createProEstablishment: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const name = asString(req.body.name);
  const universe = asString(req.body.universe) ?? "restaurants";
  const city = asString(req.body.city);

  if (!name || !name.trim()) return res.status(400).json({ error: "Nom requis" });

  const supabase = getAdminSupabase();

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const uniqueSlug = `${slug}-${randomUUID().slice(0, 8)}`;

  const { data: created, error: createErr } = await supabase
    .from("establishments")
    .insert({
      name: name.trim(),
      slug: uniqueSlug,
      universe,
      city: city ?? null,
      status: "pending",
      created_by: userResult.user.id,
    })
    .select("id")
    .single();

  if (createErr || !created) return res.status(500).json({ error: createErr?.message ?? "Erreur lors de la création" });

  const establishmentId = (created as { id: string }).id;

  await supabase.from("pro_establishment_memberships").insert({
    establishment_id: establishmentId,
    user_id: userResult.user.id,
    role: "owner",
  });

  void emitAdminNotification({
    type: "new_establishment",
    title: "Nouvel établissement",
    body: `${name.trim()} (${universe}) créé par ${userResult.user.email ?? userResult.user.id}`,
    data: { establishmentId, name: name.trim(), universe, city },
  });

  res.json({ ok: true, establishment_id: establishmentId });
};

export const createProOnboardingRequest: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const name = asString(req.body.name);
  const universe = asString(req.body.universe) ?? "restaurants";
  const city = asString(req.body.city);
  const phone = asString(req.body.phone);
  const notes = asString(req.body.notes);

  if (!name || !name.trim()) return res.status(400).json({ error: "Nom requis" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_onboarding_requests")
    .insert({
      user_id: userResult.user.id,
      email: userResult.user.email,
      name: name.trim(),
      universe,
      city: city ?? null,
      phone: phone ?? null,
      notes: notes ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  void emitAdminNotification({
    type: "pro_onboarding_request",
    title: "Demande d'inscription pro",
    body: `${name.trim()} (${universe}, ${city ?? "?"}) — ${userResult.user.email ?? userResult.user.id}`,
    data: { requestId: (data as { id: string })?.id, name: name.trim(), universe, city, phone },
  });

  res.json({ ok: true, request_id: (data as { id: string })?.id ?? null });
};

// ---------------------------------------------------------------------------
// Onboarding Wizard — progress tracking
// ---------------------------------------------------------------------------

export const getOnboardingWizardProgress: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const { data: profile, error } = await supabase
    .from("pro_profiles")
    .select("onboarding_wizard_progress")
    .eq("user_id", userResult.user.id)
    .maybeSingle();

  if (error) {
    log.error({ err: error }, "getOnboardingWizardProgress error");
    return res.json({ progress: null });
  }

  res.json({ progress: profile?.onboarding_wizard_progress ?? null });
};

export const saveOnboardingWizardProgress: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const body = req.body;
  if (!isRecord(body) || !isRecord(body.progress)) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const progress = body.progress as Record<string, unknown>;
  const establishmentId = asString(progress.establishment_id);

  if (!establishmentId) {
    return res.status(400).json({ error: "Missing establishment_id in progress" });
  }

  // Verify the user has access to this establishment
  const supabase = getAdminSupabase();

  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("id")
    .eq("user_id", userResult.user.id)
    .eq("establishment_id", establishmentId)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this establishment" });
  }

  const { error } = await supabase
    .from("pro_profiles")
    .update({
      onboarding_wizard_progress: progress,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userResult.user.id);

  if (error) {
    log.error({ err: error }, "saveOnboardingWizardProgress error");
    return res.status(500).json({ error: "Failed to save progress" });
  }

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Establishment Profile Update (submit / list drafts / list changes)
// ---------------------------------------------------------------------------

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
        "email",
        "website",
        "social_links",
        "hours",
        "tags",
        "amenities",
        "logo_url",
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

  // Only include fields that actually changed (deep compare)
  const changeRows = Object.entries(update)
    .map(([field, nextValue]) => {
      const prevValue = Object.prototype.hasOwnProperty.call(establishmentRecord, field) ? establishmentRecord[field] : null;
      return {
        draft_id: draft.id,
        establishment_id: establishmentId,
        field,
        before: prevValue ?? null,
        after: nextValue ?? null,
        status: "pending",
      };
    })
    .filter((row) => {
      // Deep compare: skip fields where before === after
      const a = row.before;
      const b = row.after;
      // Both null/undefined → unchanged
      if (a == null && b == null) return false;
      // Primitive equal
      if (a === b) return false;
      // Deep JSON compare for objects/arrays
      try {
        if (JSON.stringify(a) === JSON.stringify(b)) return false;
      } catch { /* intentional: JSON.stringify may fail on circular refs */ }
      return true;
    });

  if (!changeRows.length) {
    // No actual changes — clean up draft + moderation and return
    await supabase.from("moderation_queue").delete().eq("id", moderation.id);
    await supabase.from("establishment_profile_drafts").delete().eq("id", draft.id);
    return res.status(400).json({ error: "Aucune modification détectée" });
  }

  log.info({ count: changeRows.length, draftId: draft.id }, "Pro profile update creating changeRows");
  log.info({ fields: changeRows.map(r => r.field) }, "Pro profile update fields to update");

  const { error: changeError } = await supabase.from("establishment_profile_draft_changes").insert(changeRows);

  if (changeError) {
    log.error({ err: changeError }, "Pro profile update change insert error");
  } else {
    log.info("Pro profile update changes inserted successfully");
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
      .limit(200);

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
  } catch (err) {
    log.warn({ err }, "Best-effort: pro notification for profile update submitted");
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

// ---------------------------------------------------------------------------
// Activate owner membership (for establishment creators)
// ---------------------------------------------------------------------------

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

