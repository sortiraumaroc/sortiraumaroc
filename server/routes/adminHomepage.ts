/**
 * Admin Homepage Routes — Home curation, settings, hero images, cities, videos, countries.
 *
 * Extracted from the monolithic admin.ts.
 * Handles home curation items, home settings (hero images), home cities,
 * home videos, and countries management.
 */

import type { RequestHandler } from "express";
import { randomBytes } from "crypto";

import {
  requireAdminKey,
  requireSuperadmin,
  isRecord,
  asString,
  getAdminSupabase,
  getAuditActorInfo,
} from "./adminHelpers";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("adminHomepage");

// =============================================================================
// Local types & helpers
// =============================================================================

type HomeCurationKind =
  | "best_deals"
  | "selected_for_you"
  | "near_you"
  | "most_booked"
  | "open_now"
  | "trending"
  | "new_establishments"
  | "top_rated"
  | "deals"
  | "themed"
  | "by_service_buffet"
  | "by_service_table"
  | "by_service_carte";

const VALID_CURATION_KINDS = new Set<string>([
  "best_deals", "selected_for_you", "near_you", "most_booked",
  "open_now", "trending", "new_establishments", "top_rated",
  "deals", "themed", "by_service_buffet", "by_service_table", "by_service_carte",
]);

function normalizeHomeCurationKind(raw: unknown): HomeCurationKind | null {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (VALID_CURATION_KINDS.has(v)) return v as HomeCurationKind;
  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export type CountryAdmin = {
  id: string;
  name: string;
  name_en: string | null;
  code: string;
  flag_emoji: string | null;
  currency_code: string | null;
  phone_prefix: string | null;
  default_locale: string | null;
  timezone: string | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// =============================================================================
// HOME CURATION
// =============================================================================

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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_curation.create",
    entity_type: "home_curation_items",
    entity_id: (data as any)?.id ?? null,
    metadata: {
      universe,
      city: city ?? null,
      kind,
      establishment_id: establishmentId,
      weight,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_curation.update",
    entity_type: "home_curation_items",
    entity_id: id,
    metadata: { patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_curation.delete",
    entity_type: "home_curation_items",
    entity_id: id,
    metadata: { actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

// =============================================================================
// HOME SETTINGS (Hero Background, etc.)
// =============================================================================

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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_settings.update",
    entity_type: "home_settings",
    entity_id: key,
    metadata: { value, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
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

  // Read current hero settings to preserve mobile fields
  const { data: currentHero } = await supabase
    .from("home_settings")
    .select("value")
    .eq("key", "hero")
    .single();

  const currentHeroValue = (currentHero?.value as Record<string, unknown>) ?? {};

  // Update home_settings with new image URL, preserving existing fields
  await supabase.from("home_settings").upsert(
    {
      key: "hero",
      value: {
        ...currentHeroValue,
        background_image_url: publicUrl,
        overlay_opacity: (currentHeroValue.overlay_opacity as number) ?? 0.7,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_settings.hero_image_upload",
    entity_type: "home_settings",
    entity_id: "hero",
    metadata: { url: publicUrl, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
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

  // Update settings to remove desktop image, preserving existing mobile fields
  const currentValue = (current?.value as Record<string, unknown>) ?? {};
  await supabase.from("home_settings").upsert(
    {
      key: "hero",
      value: {
        ...currentValue,
        background_image_url: null,
        overlay_opacity: 0.7,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_settings.hero_image_delete",
    entity_type: "home_settings",
    entity_id: "hero",
    metadata: { actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// MOBILE HERO IMAGE
// ---------------------------------------------------------------------------

export const uploadAdminMobileHeroImage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const base64Data = asString(req.body.image);
  const mimeType = asString(req.body.mime_type) || "image/jpeg";

  if (!base64Data)
    return res.status(400).json({ error: "Image base64 requise" });

  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    return res.status(400).json({ error: "Format d'image non supporté (JPG, PNG, WebP uniquement)" });
  }

  const supabase = getAdminSupabase();

  // Read current hero settings to preserve existing fields
  const { data: current } = await supabase
    .from("home_settings")
    .select("value")
    .eq("key", "hero")
    .single();

  const currentValue = (current?.value as Record<string, unknown>) ?? {};

  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const filename = `hero-mobile-${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  const path = `home/${filename}`;

  const buffer = Buffer.from(base64Data, "base64");

  const { error: uploadError } = await supabase.storage
    .from("public-assets")
    .upload(path, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    return res.status(500).json({ error: `Erreur upload: ${uploadError.message}` });
  }

  const { data: urlData } = supabase.storage.from("public-assets").getPublicUrl(path);
  const publicUrl = urlData?.publicUrl;

  if (!publicUrl) {
    return res.status(500).json({ error: "Impossible d'obtenir l'URL publique" });
  }

  // Delete old mobile image from storage if exists
  const oldMobileUrl = currentValue.mobile_background_image_url as string | undefined;
  if (oldMobileUrl && typeof oldMobileUrl === "string" && oldMobileUrl.includes("/public-assets/")) {
    const pathMatch = oldMobileUrl.match(/\/public-assets\/(.+)$/);
    if (pathMatch?.[1]) {
      await supabase.storage.from("public-assets").remove([pathMatch[1]]);
    }
  }

  await supabase.from("home_settings").upsert(
    {
      key: "hero",
      value: {
        ...currentValue,
        mobile_background_image_url: publicUrl,
        mobile_overlay_opacity: (currentValue.mobile_overlay_opacity as number) ?? 0.7,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_settings.mobile_hero_image_upload",
    entity_type: "home_settings",
    entity_id: "hero",
    metadata: { url: publicUrl, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true, url: publicUrl });
};

export const deleteAdminMobileHeroImage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  // Read current hero settings to preserve existing fields
  const { data: current } = await supabase
    .from("home_settings")
    .select("value")
    .eq("key", "hero")
    .single();

  const currentValue = (current?.value as Record<string, unknown>) ?? {};
  const currentUrl = currentValue.mobile_background_image_url as string | undefined;

  // Delete from storage if exists
  if (currentUrl && typeof currentUrl === "string" && currentUrl.includes("/public-assets/")) {
    const pathMatch = currentUrl.match(/\/public-assets\/(.+)$/);
    if (pathMatch?.[1]) {
      await supabase.storage.from("public-assets").remove([pathMatch[1]]);
    }
  }

  await supabase.from("home_settings").upsert(
    {
      key: "hero",
      value: {
        ...currentValue,
        mobile_background_image_url: null,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_settings.mobile_hero_image_delete",
    entity_type: "home_settings",
    entity_id: "hero",
    metadata: { actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

// =============================================================================
// HOME CITIES MANAGEMENT
// =============================================================================

export const listAdminHomeCities: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const includeInactive = req.query.include_inactive === "true";

  const supabase = getAdminSupabase();

  let q = supabase
    .from("home_cities")
    .select("id,name,slug,image_url,sort_order,is_active,country_code,created_at,updated_at")
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
  const countryCode = asString(req.body.country_code)?.toUpperCase() || "MA";

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
      country_code: countryCode,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_cities.create",
    entity_type: "home_cities",
    entity_id: (data as any)?.id ?? null,
    metadata: { name, slug, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
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
  if (req.body.country_code !== undefined)
    patch.country_code = asString(req.body.country_code)?.toUpperCase() || "MA";

  if (Object.keys(patch).length === 0)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("home_cities").update(patch).eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_cities.update",
    entity_type: "home_cities",
    entity_id: id,
    metadata: { patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_cities.reorder",
    entity_type: "home_cities",
    entity_id: null,
    metadata: { order, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_cities.delete",
    entity_type: "home_cities",
    entity_id: id,
    metadata: { actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_cities.image_upload",
    entity_type: "home_cities",
    entity_id: cityId,
    metadata: { url: publicUrl, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true, url: publicUrl });
};

// Update home city to include country_code
export const updateAdminHomeCityCountry: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const countryCode = asString(req.body.country_code);
  if (!countryCode) return res.status(400).json({ error: "Code pays requis" });

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("home_cities")
    .update({ country_code: countryCode.toUpperCase() })
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// =============================================================================
// HOME VIDEOS MANAGEMENT
// =============================================================================

export const listAdminHomeVideos: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const includeInactive = req.query.include_inactive === "true";

  const supabase = getAdminSupabase();

  let q = supabase
    .from("home_videos")
    .select("id,youtube_url,title,description,thumbnail_url,establishment_id,sort_order,is_active,created_at,updated_at")
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

  // Fetch establishment names for videos that have establishment_id
  const items = data ?? [];
  const establishmentIds = items
    .filter((v: any) => v.establishment_id)
    .map((v: any) => v.establishment_id);

  let establishmentMap: Record<string, { name: string; universe: string }> = {};
  if (establishmentIds.length > 0) {
    const { data: establishments } = await supabase
      .from("establishments")
      .select("id,name,universe")
      .in("id", establishmentIds);

    if (establishments) {
      for (const e of establishments) {
        establishmentMap[e.id] = { name: e.name, universe: e.universe };
      }
    }
  }

  const enrichedItems = items.map((v: any) => ({
    ...v,
    establishment_name: v.establishment_id ? establishmentMap[v.establishment_id]?.name ?? null : null,
    establishment_universe: v.establishment_id ? establishmentMap[v.establishment_id]?.universe ?? null : null,
  }));

  res.json({ ok: true, items: enrichedItems });
};

export const createAdminHomeVideo: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const youtubeUrl = asString(req.body.youtube_url)?.trim();
  const title = asString(req.body.title)?.trim();
  const description = asString(req.body.description)?.trim() || null;
  const thumbnailUrl = asString(req.body.thumbnail_url)?.trim() || null;
  const establishmentId = asString(req.body.establishment_id)?.trim() || null;
  const sortOrder =
    typeof req.body.sort_order === "number" ? req.body.sort_order : 0;
  const isActive = req.body.is_active !== false;

  if (!youtubeUrl) return res.status(400).json({ error: "URL YouTube requise" });
  if (!title) return res.status(400).json({ error: "Titre requis" });

  // Validate YouTube URL format
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]+/;
  if (!youtubeRegex.test(youtubeUrl))
    return res.status(400).json({ error: "URL YouTube invalide" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("home_videos")
    .insert({
      youtube_url: youtubeUrl,
      title,
      description,
      thumbnail_url: thumbnailUrl,
      establishment_id: establishmentId,
      sort_order: sortOrder,
      is_active: isActive,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_videos.create",
    entity_type: "home_videos",
    entity_id: (data as any)?.id ?? null,
    metadata: { youtube_url: youtubeUrl, title, thumbnail_url: thumbnailUrl, establishment_id: establishmentId, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true, id: (data as any)?.id ?? null });
};

export const updateAdminHomeVideo: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const patch: Record<string, unknown> = {};

  if (req.body.youtube_url !== undefined) {
    const youtubeUrl = asString(req.body.youtube_url)?.trim();
    if (!youtubeUrl) return res.status(400).json({ error: "URL YouTube requise" });
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]+/;
    if (!youtubeRegex.test(youtubeUrl))
      return res.status(400).json({ error: "URL YouTube invalide" });
    patch.youtube_url = youtubeUrl;
  }
  if (req.body.title !== undefined) patch.title = asString(req.body.title)?.trim();
  if (req.body.description !== undefined)
    patch.description = asString(req.body.description)?.trim() || null;
  if (req.body.thumbnail_url !== undefined)
    patch.thumbnail_url = asString(req.body.thumbnail_url)?.trim() || null;
  if (req.body.establishment_id !== undefined)
    patch.establishment_id = asString(req.body.establishment_id)?.trim() || null;
  if (req.body.sort_order !== undefined)
    patch.sort_order = Number(req.body.sort_order) || 0;
  if (req.body.is_active !== undefined)
    patch.is_active = Boolean(req.body.is_active);

  if (Object.keys(patch).length === 0)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("home_videos").update(patch).eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_videos.update",
    entity_type: "home_videos",
    entity_id: id,
    metadata: { patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

export const reorderAdminHomeVideos: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const order = req.body.order;
  if (!Array.isArray(order) || order.length === 0)
    return res.status(400).json({ error: "Liste d'ordre requise" });

  const supabase = getAdminSupabase();

  const updates = order.map((id: string, index: number) =>
    supabase
      .from("home_videos")
      .update({ sort_order: index + 1 })
      .eq("id", id),
  );

  const results = await Promise.all(updates);
  const hasError = results.some((r) => r.error);
  if (hasError)
    return res.status(500).json({ error: "Erreur lors de la réorganisation" });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_videos.reorder",
    entity_type: "home_videos",
    entity_id: null,
    metadata: { order, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

export const deleteAdminHomeVideo: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { error } = await supabase.from("home_videos").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "home_videos.delete",
    entity_type: "home_videos",
    entity_id: id,
    metadata: { actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

export const uploadAdminVideoThumbnail: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const fileName = req.headers["x-file-name"];
  if (typeof fileName !== "string" || !fileName.trim()) {
    return res.status(400).json({ error: "Nom de fichier requis" });
  }

  const contentType = req.headers["content-type"] || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return res.status(400).json({ error: "Le fichier doit être une image" });
  }

  // Max 500KB
  const maxSize = 512000;
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  if (contentLength > maxSize) {
    return res.status(400).json({ error: "L'image ne doit pas dépasser 500KB" });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const fileBuffer = Buffer.concat(chunks);

  if (fileBuffer.length > maxSize) {
    return res.status(400).json({ error: "L'image ne doit pas dépasser 500KB" });
  }

  const ext = fileName.split(".").pop()?.toLowerCase() || "jpg";
  const uniqueName = `video-thumb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const supabase = getAdminSupabase();

  const { data, error } = await supabase.storage
    .from("video-thumbnails")
    .upload(uniqueName, fileBuffer, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const { data: publicUrlData } = supabase.storage
    .from("video-thumbnails")
    .getPublicUrl(data.path);

  res.json({
    ok: true,
    item: {
      bucket: "video-thumbnails",
      path: data.path,
      public_url: publicUrlData.publicUrl,
      mime_type: contentType,
      size_bytes: fileBuffer.length,
    },
  });
};

// =============================================================================
// COUNTRIES MANAGEMENT
// =============================================================================

export const listAdminCountries: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const includeInactive = req.query.include_inactive === "true";
  const supabase = getAdminSupabase();

  let query = supabase
    .from("countries")
    .select("*")
    .order("sort_order", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as CountryAdmin[] });
};

export const createAdminCountry: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const name = asString(req.body.name);
  const code = asString(req.body.code)?.toUpperCase();

  if (!name || !code)
    return res.status(400).json({ error: "Nom et code pays requis" });

  const supabase = getAdminSupabase();

  // Get max sort_order
  const { data: maxRow } = await supabase
    .from("countries")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const sortOrder =
    typeof req.body.sort_order === "number"
      ? req.body.sort_order
      : (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("countries")
    .insert({
      name,
      name_en: asString(req.body.name_en) || null,
      code,
      flag_emoji: asString(req.body.flag_emoji) || null,
      currency_code: asString(req.body.currency_code) || "MAD",
      phone_prefix: asString(req.body.phone_prefix) || null,
      default_locale: asString(req.body.default_locale) || "fr",
      timezone: asString(req.body.timezone) || "Africa/Casablanca",
      is_active: req.body.is_active !== false,
      is_default: req.body.is_default === true,
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "countries.create",
    entity_type: "countries",
    entity_id: data.id,
    metadata: { name, code, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ id: data.id });
};

export const updateAdminCountry: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const patch: Record<string, unknown> = {};

  const name = asString(req.body.name);
  if (name !== undefined) patch.name = name;

  const nameEn = asString(req.body.name_en);
  if (nameEn !== undefined) patch.name_en = nameEn || null;

  const code = asString(req.body.code);
  if (code !== undefined) patch.code = code.toUpperCase();

  const flagEmoji = asString(req.body.flag_emoji);
  if (flagEmoji !== undefined) patch.flag_emoji = flagEmoji || null;

  const currencyCode = asString(req.body.currency_code);
  if (currencyCode !== undefined) patch.currency_code = currencyCode || null;

  const phonePrefix = asString(req.body.phone_prefix);
  if (phonePrefix !== undefined) patch.phone_prefix = phonePrefix || null;

  const defaultLocale = asString(req.body.default_locale);
  if (defaultLocale !== undefined) patch.default_locale = defaultLocale || "fr";

  const timezone = asString(req.body.timezone);
  if (timezone !== undefined) patch.timezone = timezone || null;

  if (typeof req.body.is_active === "boolean") patch.is_active = req.body.is_active;
  if (typeof req.body.is_default === "boolean") patch.is_default = req.body.is_default;
  if (typeof req.body.sort_order === "number") patch.sort_order = Math.floor(req.body.sort_order);

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const { data: beforeRow } = await supabase
    .from("countries")
    .select("*")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("countries")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "countries.update",
    entity_type: "countries",
    entity_id: id,
    metadata: { before: beforeRow, after: data, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

export const deleteAdminCountry: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  // Check if country is default - cannot delete default
  const { data: country } = await supabase
    .from("countries")
    .select("is_default, code, name")
    .eq("id", id)
    .single();

  if (country?.is_default) {
    return res.status(400).json({ error: "Impossible de supprimer le pays par défaut" });
  }

  // Check if there are cities associated with this country
  const { count } = await supabase
    .from("home_cities")
    .select("id", { count: "exact", head: true })
    .eq("country_code", country?.code);

  if (count && count > 0) {
    return res.status(400).json({
      error: `Ce pays contient ${count} ville(s). Veuillez les supprimer ou les réassigner d'abord.`
    });
  }

  const { error } = await supabase.from("countries").delete().eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "countries.delete",
    entity_type: "countries",
    entity_id: id,
    metadata: { name: country?.name, code: country?.code, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

export const reorderAdminCountries: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const order = req.body.order;
  if (!Array.isArray(order) || !order.every((id) => typeof id === "string"))
    return res.status(400).json({ error: "Ordre invalide" });

  const supabase = getAdminSupabase();

  for (let i = 0; i < order.length; i++) {
    await supabase.from("countries").update({ sort_order: i }).eq("id", order[i]);
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "countries.reorder",
    entity_type: "countries",
    entity_id: null,
    metadata: { order, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};
