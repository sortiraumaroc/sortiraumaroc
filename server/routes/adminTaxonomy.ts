/**
 * Admin Taxonomy Routes — Category images, categories (Level 2), universes.
 *
 * Extracted from the monolithic admin.ts.
 * Handles subcategory images (Level 3), categories management (Level 2),
 * and universes management including image uploads.
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

const log = createModuleLogger("adminTaxonomy");

// =============================================================================
// Image utility helpers (local to this module)
// =============================================================================

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

// =============================================================================
// CATEGORY IMAGES MANAGEMENT (Subcategories - Level 3)
// =============================================================================

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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "category_images.upload",
    entity_type: "storage",
    entity_id: storagePath,
    metadata: {
      bucket: CATEGORY_IMAGES_BUCKET,
      file_name: fileName,
      mime_type: contentType,
      size_bytes: body.length,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
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

// =============================================================================
// CATEGORIES MANAGEMENT (Level 2 in hierarchy)
// =============================================================================

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

// =============================================================================
// UNIVERSES MANAGEMENT
// =============================================================================

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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "universes.create",
    entity_type: "universes",
    entity_id: (data as any)?.id ?? null,
    metadata: { slug, label_fr: labelFr, label_en: labelEn, icon_name: iconName, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "universes.update",
    entity_type: "universes",
    entity_id: id,
    metadata: { patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "universes.reorder",
    entity_type: "universes",
    entity_id: null,
    metadata: { order, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
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

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "universes.delete",
    entity_type: "universes",
    entity_id: id,
    metadata: { actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
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

  const actor = getAuditActorInfo(req);
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
    actor_id: actor.actor_id,
    action: "universe_images.upload",
    entity_type: "storage",
    entity_id: storagePath,
    metadata: {
      bucket: UNIVERSE_IMAGES_BUCKET,
      file_name: fileName,
      mime_type: contentType,
      size_bytes: body.length,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
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
