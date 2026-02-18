import type { RequestHandler, Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { parseCookies, getSessionCookieName, verifyAdminSessionToken, type AdminSessionPayload } from "../adminSession";
import { getAdminSupabase } from "../supabaseAdmin";
import { getAuditActorInfo } from "./admin";
import { transformWizardHoursToOpeningHours, openingHoursToWizardFormat } from "../lib/transformHours";

// Image compression settings
const IMAGE_COMPRESSION_CONFIG = {
  logo: {
    maxWidth: 512,
    maxHeight: 512,
    quality: 85,
    targetSizeKb: 80,
  },
  cover: {
    maxWidth: 1200,
    maxHeight: 800,
    quality: 80,
    targetSizeKb: 150,
  },
  gallery: {
    maxWidth: 1400,
    maxHeight: 1050,
    quality: 80,
    targetSizeKb: 200,
  },
};

// Compress image with sharp - target specific file size
async function compressImage(
  buffer: Buffer,
  mimetype: string,
  config: { maxWidth: number; maxHeight: number; quality: number; targetSizeKb: number }
): Promise<{ buffer: Buffer; width: number; height: number; originalSize: number; compressedSize: number }> {
  const originalSize = buffer.length;

  let sharpInstance = sharp(buffer);
  const metadata = await sharpInstance.metadata();

  // Resize if needed
  const width = metadata.width || 1200;
  const height = metadata.height || 800;

  if (width > config.maxWidth || height > config.maxHeight) {
    sharpInstance = sharpInstance.resize(config.maxWidth, config.maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Convert to WebP for best compression, or JPEG as fallback
  let quality = config.quality;
  let compressedBuffer: Buffer;
  let finalWidth = Math.min(width, config.maxWidth);
  let finalHeight = Math.min(height, config.maxHeight);

  // Get actual dimensions after resize
  const resizedMeta = await sharpInstance.clone().metadata();
  if (resizedMeta.width) finalWidth = resizedMeta.width;
  if (resizedMeta.height) finalHeight = resizedMeta.height;

  // Try WebP first (best compression)
  compressedBuffer = await sharpInstance
    .clone()
    .webp({ quality, effort: 6 })
    .toBuffer();

  // If still too large, progressively reduce quality
  while (compressedBuffer.length > config.targetSizeKb * 1024 && quality > 30) {
    quality -= 10;
    compressedBuffer = await sharpInstance
      .clone()
      .webp({ quality, effort: 6 })
      .toBuffer();
  }

  // If WebP is still too large, try more aggressive resize
  if (compressedBuffer.length > config.targetSizeKb * 1024) {
    const scaleFactor = Math.sqrt((config.targetSizeKb * 1024) / compressedBuffer.length);
    const newWidth = Math.floor(finalWidth * scaleFactor);
    const newHeight = Math.floor(finalHeight * scaleFactor);

    compressedBuffer = await sharp(buffer)
      .resize(newWidth, newHeight, { fit: "inside" })
      .webp({ quality: 75, effort: 6 })
      .toBuffer();

    finalWidth = newWidth;
    finalHeight = newHeight;
  }

  console.log(`[Image Compression] Original: ${(originalSize / 1024).toFixed(1)}KB -> Compressed: ${(compressedBuffer.length / 1024).toFixed(1)}KB (${finalWidth}x${finalHeight}, quality: ${quality})`);

  return {
    buffer: compressedBuffer,
    width: finalWidth,
    height: finalHeight,
    originalSize,
    compressedSize: compressedBuffer.length,
  };
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.ms-excel",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Type de fichier non supporté"));
    }
  },
});

// Separate multer for gallery/image uploads — accepts all image types sharp can process
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedImageMimes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "image/avif",
      "image/gif",
      "image/bmp",
      "image/tiff",
    ];
    if (allowedImageMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Type de fichier non supporté. Formats acceptés: JPEG, PNG, WebP, HEIC, AVIF, GIF"));
    }
  },
});

function getAdminSessionToken(req: Parameters<RequestHandler>[0]): string | null {
  const cookies = parseCookies(req.header("cookie") ?? undefined);
  const cookieToken = cookies[getSessionCookieName()];
  if (cookieToken) return cookieToken;

  const headerToken = req.header("x-admin-session") ?? undefined;
  if (headerToken && headerToken.trim()) return headerToken.trim();

  const authHeader = req.header("authorization") ?? undefined;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  return null;
}

function requireAdminSession(req: Parameters<RequestHandler>[0]): AdminSessionPayload | null {
  const token = getAdminSessionToken(req);
  if (!token) return null;

  const session = verifyAdminSessionToken(token);
  if (!session) return null;

  return session;
}

function isSuperAdmin(session: AdminSessionPayload): boolean {
  return session.role === "superadmin";
}

/** Roles allowed to manage establishment media (gallery, contact-info, tags-services) */
function canManageEstablishments(session: AdminSessionPayload): boolean {
  return session.role === "superadmin" || session.role === "admin" || session.role === "marketing";
}

const AI_EXTRACTION_SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction de données de menus et catalogues pour Sortir Au Maroc.

Ta mission est d'analyser le contenu fourni (texte ou image) et d'en extraire :
1. Les catégories (entrées, plats, desserts, boissons, etc.)
2. Les produits/services avec leurs détails (nom, description, prix)

IMPORTANT: Adapte ton analyse au type d'établissement:
- Restaurant: Catégories de plats (Entrées, Plats, Desserts, Boissons, etc.)
- Hôtel/Hébergement: Types de chambres (Simple, Double, Suite, etc.)
- Sport/Bien-être: Types de prestations (Cours, Abonnements, Soins, etc.)
- Location: Types de véhicules (Citadine, SUV, Berline, etc.)
- Loisirs: Types d'activités (Adultes, Enfants, Famille, etc.)

Règles d'extraction:
1. Extrait TOUS les éléments visibles
2. Pour les prix, convertis toujours en nombre (sans "DH", "MAD", etc.)
3. Si un prix contient une fourchette (ex: "50-80 DH"), utilise le prix le plus bas
4. Les descriptions doivent être concises (max 200 caractères)
5. Déduis les catégories logiques si elles ne sont pas explicites
6. Si tu détectes des labels courants (végétarien, épicé, nouveau, etc.), ajoute-les

Réponds UNIQUEMENT avec un objet JSON valide de la forme:
{
  "categories": [
    { "title": "Nom catégorie", "description": "Description optionnelle" }
  ],
  "items": [
    {
      "title": "Nom du produit",
      "description": "Description optionnelle",
      "price": 99.00,
      "category": "Nom de la catégorie",
      "labels": ["label1", "label2"]
    }
  ],
  "confidence": 0.95
}

Labels valides pour restaurants: vegetarien, epice, fruits_de_mer, healthy, traditionnel, specialite, best_seller, nouveaute
Labels valides pour autres: debutant, intermediaire, avance, famille, enfants, adultes, vip, luxe`;

export function registerAdminInventoryRoutes(router: Router): void {
  // List inventory for an establishment
  router.get("/api/admin/establishments/:establishmentId/inventory", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { establishmentId } = req.params;
      if (!establishmentId) {
        return res.status(400).json({ error: "establishmentId is required" });
      }

      const supabase = getAdminSupabase();

      // Get categories
      const { data: categories, error: catError } = await supabase
        .from("pro_inventory_categories")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("sort_order", { ascending: true });

      if (catError) {
        console.error("[Admin Inventory] Categories error:", catError);
        return res.status(500).json({ error: "Erreur lors de la récupération des catégories" });
      }

      // Get items with variants
      const { data: items, error: itemsError } = await supabase
        .from("pro_inventory_items")
        .select("*, variants:pro_inventory_variants(*)")
        .eq("establishment_id", establishmentId)
        .order("sort_order", { ascending: true });

      if (itemsError) {
        console.error("[Admin Inventory] Items error:", itemsError);
        return res.status(500).json({ error: "Erreur lors de la récupération des produits" });
      }

      return res.json({
        ok: true,
        categories: categories ?? [],
        items: items ?? [],
      });
    } catch (error) {
      console.error("[Admin Inventory] List error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Create category
  router.post("/api/admin/establishments/:establishmentId/inventory/categories", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { establishmentId } = req.params;
      const { title, description, parent_id, sort_order } = req.body as {
        title?: string;
        description?: string;
        parent_id?: string | null;
        sort_order?: number;
      };

      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "title is required" });
      }

      const supabase = getAdminSupabase();

      // Get max sort_order if not provided
      let finalSortOrder = sort_order;
      if (typeof finalSortOrder !== "number") {
        const { data: existing } = await supabase
          .from("pro_inventory_categories")
          .select("sort_order")
          .eq("establishment_id", establishmentId)
          .order("sort_order", { ascending: false })
          .limit(1);

        finalSortOrder = (existing?.[0]?.sort_order ?? 0) + 1;
      }

      const { data: category, error } = await supabase
        .from("pro_inventory_categories")
        .insert({
          establishment_id: establishmentId,
          title: title.trim(),
          description: description?.trim() || null,
          parent_id: parent_id || null,
          sort_order: finalSortOrder,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        console.error("[Admin Inventory] Create category error:", error);
        return res.status(500).json({ error: "Erreur lors de la création de la catégorie" });
      }

      return res.json({ ok: true, category });
    } catch (error) {
      console.error("[Admin Inventory] Create category error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Update category
  router.post("/api/admin/establishments/:establishmentId/inventory/categories/:categoryId", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { establishmentId, categoryId } = req.params;
      const patch = req.body as Partial<{
        title: string;
        description: string | null;
        sort_order: number;
        is_active: boolean;
      }>;

      const supabase = getAdminSupabase();

      const updateData: Record<string, unknown> = {};
      if (patch.title !== undefined) updateData.title = patch.title;
      if (patch.description !== undefined) updateData.description = patch.description;
      if (patch.sort_order !== undefined) updateData.sort_order = patch.sort_order;
      if (patch.is_active !== undefined) updateData.is_active = patch.is_active;

      const { data: category, error } = await supabase
        .from("pro_inventory_categories")
        .update(updateData)
        .eq("id", categoryId)
        .eq("establishment_id", establishmentId)
        .select()
        .single();

      if (error) {
        console.error("[Admin Inventory] Update category error:", error);
        return res.status(500).json({ error: "Erreur lors de la mise à jour de la catégorie" });
      }

      return res.json({ ok: true, category });
    } catch (error) {
      console.error("[Admin Inventory] Update category error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Delete category
  router.delete("/api/admin/establishments/:establishmentId/inventory/categories/:categoryId", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { establishmentId, categoryId } = req.params;
      const supabase = getAdminSupabase();

      // First, update items to remove category reference
      await supabase
        .from("pro_inventory_items")
        .update({ category_id: null })
        .eq("establishment_id", establishmentId)
        .eq("category_id", categoryId);

      // Then delete the category
      const { error } = await supabase
        .from("pro_inventory_categories")
        .delete()
        .eq("id", categoryId)
        .eq("establishment_id", establishmentId);

      if (error) {
        console.error("[Admin Inventory] Delete category error:", error);
        return res.status(500).json({ error: "Erreur lors de la suppression de la catégorie" });
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("[Admin Inventory] Delete category error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Create item
  router.post("/api/admin/establishments/:establishmentId/inventory/items", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { establishmentId } = req.params;
      const data = req.body as {
        title?: string;
        description?: string;
        base_price?: number;
        category_id?: string;
        labels?: string[];
      };

      if (!data.title || typeof data.title !== "string" || !data.title.trim()) {
        return res.status(400).json({ error: "title is required" });
      }

      const supabase = getAdminSupabase();

      // Get max sort_order
      const { data: existing } = await supabase
        .from("pro_inventory_items")
        .select("sort_order")
        .eq("establishment_id", establishmentId)
        .order("sort_order", { ascending: false })
        .limit(1);

      const maxOrder = existing?.[0]?.sort_order ?? 0;

      const { data: item, error } = await supabase
        .from("pro_inventory_items")
        .insert({
          establishment_id: establishmentId,
          title: data.title.trim(),
          description: data.description?.trim() || null,
          base_price: typeof data.base_price === "number" ? data.base_price : null,
          category_id: data.category_id || null,
          labels: Array.isArray(data.labels) ? data.labels : [],
          sort_order: maxOrder + 1,
          is_active: true,
          currency: "MAD",
        })
        .select()
        .single();

      if (error) {
        console.error("[Admin Inventory] Create item error:", error);
        return res.status(500).json({ error: "Erreur lors de la création du produit" });
      }

      return res.json({ ok: true, item });
    } catch (error) {
      console.error("[Admin Inventory] Create item error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Update item (full support for all fields like Pro)
  router.post("/api/admin/establishments/:establishmentId/inventory/items/:itemId", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { establishmentId, itemId } = req.params;
      const patch = req.body as Partial<{
        title: string;
        description: string | null;
        base_price: number | null;
        currency: string;
        category_id: string | null;
        labels: string[];
        photos: string[];
        is_active: boolean;
        visible_when_unavailable: boolean;
        scheduled_reactivation_at: string | null;
        meta: Record<string, unknown> | null;
        variants: Array<{
          title?: string | null;
          quantity?: number | null;
          unit?: string | null;
          price: number;
          currency?: string;
          sort_order?: number;
          is_active?: boolean;
        }>;
      }>;

      const supabase = getAdminSupabase();

      const updateData: Record<string, unknown> = {};
      if (patch.title !== undefined) updateData.title = patch.title;
      if (patch.description !== undefined) updateData.description = patch.description;
      if (patch.base_price !== undefined) updateData.base_price = patch.base_price;
      if (patch.currency !== undefined) updateData.currency = patch.currency;
      if (patch.category_id !== undefined) updateData.category_id = patch.category_id;
      if (patch.labels !== undefined) updateData.labels = patch.labels;
      if (patch.photos !== undefined) updateData.photos = patch.photos;
      if (patch.is_active !== undefined) updateData.is_active = patch.is_active;
      if (patch.visible_when_unavailable !== undefined) updateData.visible_when_unavailable = patch.visible_when_unavailable;
      if (patch.scheduled_reactivation_at !== undefined) updateData.scheduled_reactivation_at = patch.scheduled_reactivation_at;
      if (patch.meta !== undefined) updateData.meta = patch.meta;

      const { data: item, error } = await supabase
        .from("pro_inventory_items")
        .update(updateData)
        .eq("id", itemId)
        .eq("establishment_id", establishmentId)
        .select()
        .single();

      if (error) {
        console.error("[Admin Inventory] Update item error:", error);
        return res.status(500).json({ error: "Erreur lors de la mise à jour du produit" });
      }

      // Handle variants if provided
      if (patch.variants !== undefined) {
        // Delete existing variants
        await supabase
          .from("pro_inventory_variants")
          .delete()
          .eq("item_id", itemId);

        // Insert new variants
        if (patch.variants.length > 0) {
          const variantsToInsert = patch.variants.map((v, idx) => ({
            item_id: itemId,
            title: v.title ?? null,
            quantity: v.quantity ?? null,
            unit: v.unit ?? null,
            price: v.price,
            currency: v.currency ?? "MAD",
            sort_order: v.sort_order ?? idx,
            is_active: v.is_active ?? true,
          }));

          const { error: variantsError } = await supabase
            .from("pro_inventory_variants")
            .insert(variantsToInsert);

          if (variantsError) {
            console.error("[Admin Inventory] Update variants error:", variantsError);
            // Non-fatal, continue
          }
        }
      }

      // Fetch updated item with variants
      const { data: updatedItem } = await supabase
        .from("pro_inventory_items")
        .select("*, variants:pro_inventory_variants(*)")
        .eq("id", itemId)
        .single();

      return res.json({ ok: true, item: updatedItem || item });
    } catch (error) {
      console.error("[Admin Inventory] Update item error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Delete item
  router.delete("/api/admin/establishments/:establishmentId/inventory/items/:itemId", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { establishmentId, itemId } = req.params;
      const supabase = getAdminSupabase();

      // Delete variants first
      await supabase
        .from("pro_inventory_variants")
        .delete()
        .eq("item_id", itemId);

      // Then delete the item
      const { error } = await supabase
        .from("pro_inventory_items")
        .delete()
        .eq("id", itemId)
        .eq("establishment_id", establishmentId);

      if (error) {
        console.error("[Admin Inventory] Delete item error:", error);
        return res.status(500).json({ error: "Erreur lors de la suppression du produit" });
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("[Admin Inventory] Delete item error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Reorder items
  router.post("/api/admin/establishments/:establishmentId/inventory/reorder", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { establishmentId } = req.params;
      const { itemIds } = req.body as { itemIds?: string[] };

      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds array is required" });
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

      await Promise.all(updates);

      return res.json({ ok: true });
    } catch (error) {
      console.error("[Admin Inventory] Reorder error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Clear all inventory
  router.post("/api/admin/establishments/:establishmentId/inventory/clear", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { establishmentId } = req.params;
      const supabase = getAdminSupabase();

      // Get item IDs first
      const { data: items } = await supabase
        .from("pro_inventory_items")
        .select("id")
        .eq("establishment_id", establishmentId);

      const itemIds = (items ?? []).map((i) => i.id);

      // Delete variants
      if (itemIds.length > 0) {
        await supabase
          .from("pro_inventory_variants")
          .delete()
          .in("item_id", itemIds);
      }

      // Delete items
      const { count: itemsDeleted } = await (supabase
        .from("pro_inventory_items")
        .delete()
        .eq("establishment_id", establishmentId) as any)
        .select("id", { count: "exact", head: true });

      // Delete categories
      const { count: categoriesDeleted } = await (supabase
        .from("pro_inventory_categories")
        .delete()
        .eq("establishment_id", establishmentId) as any)
        .select("id", { count: "exact", head: true });

      return res.json({
        ok: true,
        deleted: {
          categories: categoriesDeleted ?? 0,
          items: itemsDeleted ?? 0,
        },
      });
    } catch (error) {
      console.error("[Admin Inventory] Clear error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Upload inventory image (admin)
  router.post("/api/admin/establishments/:establishmentId/inventory/images", upload.single("image"), (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { establishmentId } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "image is required" });
      }

      // Validate file type
      if (!file.mimetype.startsWith("image/")) {
        return res.status(400).json({ error: "Le fichier doit être une image" });
      }

      const supabase = getAdminSupabase();

      // Generate unique filename
      const ext = file.originalname.split(".").pop() || "jpg";
      const filename = `${establishmentId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const storagePath = `inventory/${filename}`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from("public")
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("[Admin Inventory] Upload error:", uploadError);
        return res.status(500).json({ error: "Erreur lors de l'upload de l'image" });
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from("public").getPublicUrl(storagePath);

      return res.json({
        ok: true,
        url: urlData.publicUrl,
        path: storagePath,
      });
    } catch (error) {
      console.error("[Admin Inventory] Upload error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Delete inventory image (admin)
  router.delete("/api/admin/establishments/:establishmentId/inventory/images", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { url } = req.body as { url?: string };

      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "url is required" });
      }

      // Try to extract the storage path from the URL
      // URLs look like: https://xxx.supabase.co/storage/v1/object/public/public/inventory/...
      const match = url.match(/\/public\/public\/(inventory\/[^?]+)/);
      if (!match) {
        // URL doesn't match our storage format, might be external - just ignore
        return res.json({ ok: true });
      }

      const storagePath = match[1];
      const supabase = getAdminSupabase();

      const { error: deleteError } = await supabase.storage.from("public").remove([storagePath]);

      if (deleteError) {
        console.error("[Admin Inventory] Delete image error:", deleteError);
        // Don't fail - the image might already be deleted or external
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("[Admin Inventory] Delete image error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // ============================================================================
  // GALLERY MANAGEMENT
  // ============================================================================

  // Get establishment gallery
  router.get("/api/admin/establishments/:establishmentId/gallery", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!canManageEstablishments(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux administrateurs" });
      }

      const { establishmentId } = req.params;
      const supabase = getAdminSupabase();

      console.log("[Admin Gallery] Fetching gallery for establishment:", establishmentId);

      const { data, error } = await supabase
        .from("establishments")
        .select("id, name, logo_url, cover_url, gallery_urls, extra")
        .eq("id", establishmentId)
        .single();

      if (error) {
        console.error("[Admin Gallery] Get error:", error);
        return res.status(500).json({ error: "Erreur lors de la récupération de la galerie" });
      }

      if (!data) {
        console.error("[Admin Gallery] No establishment found for id:", establishmentId);
        return res.status(404).json({ error: "Établissement non trouvé" });
      }

      console.log("[Admin Gallery] Found establishment:", data.name, "logo_url:", data.logo_url ? "YES" : "NO", "cover_url:", data.cover_url ? "YES" : "NO", "gallery_urls:", Array.isArray(data.gallery_urls) ? data.gallery_urls.length : 0);

      // Extract gallery metadata from extra field
      const extra = (data?.extra as Record<string, unknown>) || {};
      const galleryMeta = Array.isArray(extra.gallery_meta) ? extra.gallery_meta : [];
      const coverMeta = typeof extra.cover_meta === "object" ? extra.cover_meta : {};

      return res.json({
        ok: true,
        logo_url: data?.logo_url || null,
        cover_url: data?.cover_url || null,
        cover_meta: coverMeta,
        gallery_urls: Array.isArray(data?.gallery_urls) ? data.gallery_urls : [],
        gallery_meta: galleryMeta,
      });
    } catch (error) {
      console.error("[Admin Gallery] Get error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Update establishment gallery
  router.patch("/api/admin/establishments/:establishmentId/gallery", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!canManageEstablishments(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux administrateurs" });
      }

      const { establishmentId } = req.params;
      const body = req.body as {
        logo_url?: string | null;
        cover_url?: string | null;
        cover_meta?: Record<string, unknown>;
        gallery_urls?: string[];
        gallery_meta?: Array<Record<string, unknown>>;
      };

      const supabase = getAdminSupabase();

      // Build update object
      const updateData: Record<string, unknown> = {};

      if (body.logo_url !== undefined) {
        updateData.logo_url = body.logo_url;
      }

      if (body.cover_url !== undefined) {
        updateData.cover_url = body.cover_url;
      }

      if (body.gallery_urls !== undefined) {
        updateData.gallery_urls = body.gallery_urls;
      }

      // If metadata is being updated, merge it into extra field
      if (body.cover_meta !== undefined || body.gallery_meta !== undefined) {
        // Get current extra field
        const { data: current } = await supabase
          .from("establishments")
          .select("extra")
          .eq("id", establishmentId)
          .single();

        const currentExtra = (current?.extra as Record<string, unknown>) || {};
        const newExtra = { ...currentExtra };

        if (body.cover_meta !== undefined) {
          newExtra.cover_meta = body.cover_meta;
        }

        if (body.gallery_meta !== undefined) {
          newExtra.gallery_meta = body.gallery_meta;
        }

        updateData.extra = newExtra;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No data to update" });
      }

      // Track who made the update
      const actor = getAuditActorInfo(req);
      updateData.admin_updated_by_name = actor.actor_name ?? null;
      updateData.admin_updated_by_id = actor.actor_id ?? null;
      updateData.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from("establishments")
        .update(updateData)
        .eq("id", establishmentId);

      if (error) {
        console.error("[Admin Gallery] Update error:", error);
        return res.status(500).json({ error: "Erreur lors de la mise à jour de la galerie" });
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("[Admin Gallery] Update error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Backfill cover_url from Storage for establishments missing it
  router.post("/api/admin/establishments/backfill-covers", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) return res.status(401).json({ error: "Unauthorized" });
      if (!isSuperAdmin(session)) return res.status(403).json({ error: "Forbidden" });

      const supabase = getAdminSupabase();

      // Get establishments with no cover_url
      const { data: establishments, error: fetchErr } = await supabase
        .from("establishments")
        .select("id, name")
        .or("cover_url.is.null,cover_url.eq.")
        .limit(500);

      if (fetchErr) {
        console.error("[Backfill Covers] Fetch error:", fetchErr);
        return res.status(500).json({ error: fetchErr.message });
      }

      let updated = 0;
      let skipped = 0;
      const details: Array<{ id: string; name: string; cover_url: string }> = [];

      for (const est of establishments ?? []) {
        // List files in the covers folder for this establishment
        const { data: files } = await supabase.storage
          .from("public")
          .list(`establishments/${est.id}/covers`, { limit: 10, sortBy: { column: "created_at", order: "desc" } });

        // Also list gallery files
        const { data: galleryFiles } = await supabase.storage
          .from("public")
          .list(`establishments/${est.id}/gallery`, { limit: 50, sortBy: { column: "created_at", order: "desc" } });

        const updateData: Record<string, unknown> = {};

        if (files && files.length > 0) {
          const storagePath = `establishments/${est.id}/covers/${files[0].name}`;
          const { data: urlData } = supabase.storage.from("public").getPublicUrl(storagePath);
          updateData.cover_url = urlData.publicUrl;
        }

        if (galleryFiles && galleryFiles.length > 0) {
          const galleryUrls = galleryFiles.map((f) => {
            const path = `establishments/${est.id}/gallery/${f.name}`;
            return supabase.storage.from("public").getPublicUrl(path).data.publicUrl;
          });
          updateData.gallery_urls = galleryUrls;
        }

        if (Object.keys(updateData).length > 0) {
          const { error: updateErr } = await supabase
            .from("establishments")
            .update(updateData)
            .eq("id", est.id);

          if (!updateErr) {
            updated++;
            details.push({ id: est.id, name: est.name, cover_url: (updateData.cover_url as string) ?? "" });
          }
        } else {
          skipped++;
        }
      }

      console.log(`[Backfill Covers] Updated ${updated}, skipped ${skipped} (no covers in storage)`);
      return res.json({ ok: true, updated, skipped, total: (establishments ?? []).length, details });
    } catch (error) {
      console.error("[Backfill Covers] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Get contact info for establishment
  router.get("/api/admin/establishments/:establishmentId/contact-info", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { establishmentId } = req.params;
      const supabase = getAdminSupabase();

      // Try to select with email column, fallback to without if it doesn't exist yet
      let data: Record<string, unknown> | null = null;
      let fetchError: Error | null = null;

      // First try with email column
      const result1 = await supabase
        .from("establishments")
        .select("lat, lng, phone, whatsapp, website, email, social_links, hours, extra")
        .eq("id", establishmentId)
        .single();

      if (result1.error && result1.error.message.includes("email")) {
        // Email column doesn't exist yet, try without it
        console.log("[Admin Contact Info] Email column not found, falling back to query without email");
        const result2 = await supabase
          .from("establishments")
          .select("lat, lng, phone, whatsapp, website, social_links, hours, extra")
          .eq("id", establishmentId)
          .single();

        if (result2.error) {
          fetchError = result2.error;
        } else {
          data = result2.data as Record<string, unknown>;
        }
      } else if (result1.error) {
        fetchError = result1.error;
      } else {
        data = result1.data as Record<string, unknown>;
      }

      if (fetchError) {
        console.error("[Admin Contact Info] Fetch error:", fetchError);
        return res.status(500).json({ error: "Erreur lors de la récupération" });
      }

      // Handle null data gracefully
      if (!data) {
        return res.json({
          lat: null,
          lng: null,
          phone: null,
          mobile: null,
          whatsapp: null,
          email: null,
          website: null,
          social_links: {},
          hours: {},
        });
      }

      const extra = (data.extra as Record<string, unknown>) || {};

      return res.json({
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        phone: data.phone ?? null,
        mobile: extra.mobile ?? null,
        whatsapp: data.whatsapp ?? null,
        email: data.email ?? extra.email ?? null,
        website: data.website ?? null,
        social_links: data.social_links || {},
        // Convert openingHours (array intervals) back to DaySchedule for admin form
        hours: data.hours && typeof data.hours === "object"
          ? openingHoursToWizardFormat(data.hours as Record<string, unknown>)
          : {},
      });
    } catch (error) {
      console.error("[Admin Contact Info] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Update contact info for establishment
  router.patch("/api/admin/establishments/:establishmentId/contact-info", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!canManageEstablishments(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux administrateurs" });
      }

      const { establishmentId } = req.params;
      const body = req.body;
      const supabase = getAdminSupabase();

      // Get current extra field to preserve other data
      const { data: current } = await supabase
        .from("establishments")
        .select("extra")
        .eq("id", establishmentId)
        .single();

      const currentExtra = (current?.extra as Record<string, unknown>) || {};

      // Build update object
      const updateData: Record<string, unknown> = {};

      if (body.lat !== undefined) updateData.lat = body.lat;
      if (body.lng !== undefined) updateData.lng = body.lng;
      if (body.phone !== undefined) updateData.phone = body.phone;
      if (body.whatsapp !== undefined) updateData.whatsapp = body.whatsapp;
      if (body.website !== undefined) updateData.website = body.website;
      if (body.social_links !== undefined) updateData.social_links = body.social_links;
      if (body.hours !== undefined) {
        // Transform DaySchedule (wizard/admin form) → openingHours (array of intervals) for public display
        updateData.hours =
          body.hours && typeof body.hours === "object" && !Array.isArray(body.hours)
            ? transformWizardHoursToOpeningHours(body.hours as Record<string, unknown>)
            : body.hours;
      }

      // Store mobile in extra field
      // For email: try direct column first, fallback to extra field if column doesn't exist
      if (body.mobile !== undefined || body.email !== undefined) {
        const extraUpdate: Record<string, unknown> = { ...currentExtra };
        if (body.mobile !== undefined) extraUpdate.mobile = body.mobile;
        // Store email in extra as fallback (in case column doesn't exist)
        if (body.email !== undefined) extraUpdate.email = body.email;
        updateData.extra = extraUpdate;
      }

      // Try to update with email column
      if (body.email !== undefined) {
        updateData.email = body.email;
      }

      let updateError: Error | null = null;
      const result = await supabase
        .from("establishments")
        .update(updateData)
        .eq("id", establishmentId);

      if (result.error) {
        // If email column doesn't exist, retry without it
        if (result.error.message.includes("email")) {
          console.log("[Admin Contact Info] Email column not found, storing in extra field only");
          delete updateData.email;
          const retryResult = await supabase
            .from("establishments")
            .update(updateData)
            .eq("id", establishmentId);
          updateError = retryResult.error;
        } else {
          updateError = result.error;
        }
      }

      if (updateError) {
        console.error("[Admin Contact Info] Update error:", updateError);
        return res.status(500).json({ error: "Erreur lors de la mise à jour" });
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("[Admin Contact Info] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Upload gallery image with automatic compression
  router.post("/api/admin/establishments/:establishmentId/gallery/upload", imageUpload.single("image"), (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!canManageEstablishments(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux administrateurs" });
      }

      const { establishmentId } = req.params;
      const file = req.file;
      const imageType = (req.body.type || "gallery") as "logo" | "cover" | "gallery";

      if (!file) {
        return res.status(400).json({ error: "image is required" });
      }

      // Validate file type
      if (!file.mimetype.startsWith("image/")) {
        return res.status(400).json({ error: "Le fichier doit être une image" });
      }

      // Allow files up to 5 MB — they will be compressed to WebP
      if (file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ error: "L'image est trop volumineuse (max 5 MB)" });
      }

      console.log(`[Admin Gallery] Uploading ${imageType} image for ${establishmentId}, original size: ${(file.size / 1024).toFixed(1)}KB, mimetype: ${file.mimetype}`);

      // Compress the image
      const compressionConfig = IMAGE_COMPRESSION_CONFIG[imageType];
      let compressed;
      try {
        compressed = await compressImage(file.buffer, file.mimetype, compressionConfig);
        console.log(`[Admin Gallery] Compression successful: ${(compressed.originalSize / 1024).toFixed(1)}KB -> ${(compressed.compressedSize / 1024).toFixed(1)}KB`);
      } catch (compressionError) {
        console.error("[Admin Gallery] Compression error:", compressionError);
        return res.status(500).json({
          error: "Erreur de compression",
          details: compressionError instanceof Error ? compressionError.message : "Unknown compression error"
        });
      }

      const supabase = getAdminSupabase();

      // Generate unique filename - always use .webp since we convert to WebP
      const folder = imageType === "logo" ? "logos" : imageType === "cover" ? "covers" : "gallery";
      const filename = `${establishmentId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
      const storagePath = `establishments/${filename}`;

      // Upload compressed image to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from("public")
        .upload(storagePath, compressed.buffer, {
          contentType: "image/webp",
          cacheControl: "31536000", // 1 year cache for images
          upsert: false,
        });

      if (uploadError) {
        console.error("[Admin Gallery] Supabase upload error:", uploadError);
        return res.status(500).json({
          error: "Erreur lors de l'upload de l'image",
          details: uploadError.message || JSON.stringify(uploadError)
        });
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from("public").getPublicUrl(storagePath);

      return res.json({
        ok: true,
        url: urlData.publicUrl,
        path: storagePath,
        compression: {
          originalSize: compressed.originalSize,
          compressedSize: compressed.compressedSize,
          width: compressed.width,
          height: compressed.height,
          savings: Math.round((1 - compressed.compressedSize / compressed.originalSize) * 100),
        },
      });
    } catch (error) {
      console.error("[Admin Gallery] Upload error:", error);
      return res.status(500).json({
        error: "Erreur serveur",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }) as RequestHandler);

  // AI extraction from file
  router.post("/api/admin/ai/extract-menu-file", upload.single("file"), (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      if (!ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: "ai_not_configured", message: "Le service IA n'est pas configuré" });
      }

      const file = req.file;
      const establishmentId = req.body.establishmentId;

      if (!file) {
        return res.status(400).json({ error: "file is required" });
      }

      if (!establishmentId) {
        return res.status(400).json({ error: "establishmentId is required" });
      }

      // Get establishment info
      const supabase = getAdminSupabase();
      const { data: establishment, error: estError } = await supabase
        .from("establishments")
        .select("universe, name, subcategory")
        .eq("id", establishmentId)
        .single();

      if (estError || !establishment) {
        return res.status(404).json({ error: "Établissement non trouvé" });
      }

      // Fetch existing inventory for duplicate detection
      const [existingCategoriesRes, existingItemsRes] = await Promise.all([
        supabase
          .from("pro_inventory_categories")
          .select("id, title")
          .eq("establishment_id", establishmentId)
          .eq("is_active", true),
        supabase
          .from("pro_inventory_items")
          .select("id, title, category_id, base_price")
          .eq("establishment_id", establishmentId)
          .eq("is_active", true),
      ]);

      const existingCategories = (existingCategoriesRes.data ?? []) as { id: string; title: string }[];
      const existingItems = (existingItemsRes.data ?? []) as { id: string; title: string; category_id: string | null; base_price: number | null }[];

      // Create lookup maps for fast duplicate detection (normalize titles to lowercase)
      const existingCategoryTitles = new Map(existingCategories.map((c) => [c.title.toLowerCase().trim(), c]));
      const existingItemTitles = new Map(existingItems.map((i) => [i.title.toLowerCase().trim(), i]));

      const universe = (establishment as any)?.universe ?? "restaurant";
      const establishmentName = (establishment as any)?.name ?? "";

      // Determine how to process the file based on type
      const isImage = file.mimetype.startsWith("image/");

      let messageContent: any[];

      if (isImage) {
        // For images, send to Claude with vision
        const base64 = file.buffer.toString("base64");
        const mediaType = file.mimetype as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

        messageContent = [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: "text",
            text: `Établissement: ${establishmentName}\nUnivers: ${universe}\n\nAnalyse cette image de menu/catalogue et extrait toutes les informations.`,
          },
        ];
      } else {
        // For documents (PDF, Word, Excel), we'll try to extract text
        // For now, return an error for non-image files (would need pdf-parse, mammoth, xlsx libs)
        // In a real implementation, you'd use libraries like:
        // - pdf-parse for PDFs
        // - mammoth for Word documents
        // - xlsx for Excel files

        return res.status(400).json({
          error: "file_type_not_supported_yet",
          message: "Pour l'instant, seules les images sont supportées pour l'extraction IA. Copiez-collez le contenu du document en texte.",
        });
      }

      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          system: AI_EXTRACTION_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: messageContent,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[AI File Extraction] Anthropic API error:", response.status, errorData);
        return res.status(500).json({ error: "ai_error", message: "Erreur du service IA" });
      }

      const data = await response.json();
      const generatedText = data.content?.[0]?.text ?? "";

      // Parse the JSON response
      type ExtractedMenuItem = {
        title: string;
        description?: string;
        price?: number;
        category?: string;
        labels?: string[];
      };

      type ExtractedCategory = {
        title: string;
        description?: string;
      };

      type AIExtractionResult = {
        categories: ExtractedCategory[];
        items: ExtractedMenuItem[];
        confidence: number;
      };

      let extraction: AIExtractionResult;
      try {
        const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }
        extraction = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error("[AI File Extraction] Parse error:", parseError, generatedText);
        return res.status(500).json({
          error: "parse_error",
          message: "Impossible de parser la réponse de l'IA",
          rawResponse: generatedText.slice(0, 500),
        });
      }

      // Validate and clean the extraction
      const rawCategories = Array.isArray(extraction.categories)
        ? extraction.categories.filter((c) => c && typeof c.title === "string" && c.title.trim())
        : [];

      const rawItems = Array.isArray(extraction.items)
        ? extraction.items
            .filter((i) => i && typeof i.title === "string" && i.title.trim())
            .map((item) => ({
              title: item.title.trim(),
              description: typeof item.description === "string" ? item.description.trim().slice(0, 500) : undefined,
              price: typeof item.price === "number" && item.price > 0 ? item.price : undefined,
              category: typeof item.category === "string" ? item.category.trim() : undefined,
              labels: Array.isArray(item.labels) ? item.labels.filter((l) => typeof l === "string") : [],
            }))
        : [];

      // Detect duplicates and separate new vs existing
      const newCategories: typeof rawCategories = [];
      const duplicateCategories: Array<{ extracted: (typeof rawCategories)[0]; existing: { id: string; title: string } }> = [];

      for (const cat of rawCategories) {
        const normalizedTitle = cat.title.toLowerCase().trim();
        const existing = existingCategoryTitles.get(normalizedTitle);
        if (existing) {
          duplicateCategories.push({ extracted: cat, existing });
        } else {
          newCategories.push(cat);
        }
      }

      const newItems: typeof rawItems = [];
      const duplicateItems: Array<{
        extracted: (typeof rawItems)[0];
        existing: { id: string; title: string; base_price: number | null };
        priceDiff: boolean;
      }> = [];

      for (const item of rawItems) {
        const normalizedTitle = item.title.toLowerCase().trim();
        const existing = existingItemTitles.get(normalizedTitle);
        if (existing) {
          // Check if price differs (potential update needed)
          const priceDiff = item.price !== undefined && existing.base_price !== null && Math.abs(item.price - existing.base_price) > 0.01;
          duplicateItems.push({ extracted: item, existing, priceDiff });
        } else {
          newItems.push(item);
        }
      }

      const confidence =
        typeof extraction.confidence === "number" ? Math.min(1, Math.max(0, extraction.confidence)) : 0.5;

      return res.json({
        ok: true,
        extraction: {
          // Only new items to import
          categories: newCategories,
          items: newItems,
          // Duplicates for user information
          duplicates: {
            categories: duplicateCategories.map((d) => ({
              title: d.extracted.title,
              existingId: d.existing.id,
            })),
            items: duplicateItems.map((d) => ({
              title: d.extracted.title,
              existingId: d.existing.id,
              extractedPrice: d.extracted.price,
              existingPrice: d.existing.base_price,
              priceDiff: d.priceDiff,
            })),
          },
          // Stats
          confidence,
          stats: {
            totalExtracted: {
              categories: rawCategories.length,
              items: rawItems.length,
            },
            newToImport: {
              categories: newCategories.length,
              items: newItems.length,
            },
            duplicatesSkipped: {
              categories: duplicateCategories.length,
              items: duplicateItems.length,
            },
            priceUpdatesAvailable: duplicateItems.filter((d) => d.priceDiff).length,
          },
          // Legacy fields for backwards compatibility
          itemCount: newItems.length,
          categoryCount: newCategories.length,
        },
      });
    } catch (error) {
      console.error("[AI File Extraction] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // ============================================================================
  // MODERATION: Pending Inventory Changes
  // ============================================================================

  // List all pending inventory changes (admin dashboard)
  router.get("/api/admin/inventory/pending-changes", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const supabase = getAdminSupabase();

      const statusFilter = (req.query.status as string) || "pending";
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);

      const { data, error } = await supabase
        .from("pro_inventory_pending_changes")
        .select(`
          *,
          establishments:establishment_id (id, name, slug)
        `)
        .eq("status", statusFilter)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        console.error("[Admin Inventory Moderation] List error:", error);
        return res.status(500).json({ error: "Erreur lors de la récupération des demandes" });
      }

      return res.json({ ok: true, pendingChanges: data ?? [] });
    } catch (error) {
      console.error("[Admin Inventory Moderation] List error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // List pending changes for a specific establishment
  router.get("/api/admin/establishments/:establishmentId/inventory/pending-changes", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { establishmentId } = req.params;
      const supabase = getAdminSupabase();

      const statusFilter = (req.query.status as string) || "pending";

      const { data, error } = await supabase
        .from("pro_inventory_pending_changes")
        .select("*")
        .eq("establishment_id", establishmentId)
        .eq("status", statusFilter)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("[Admin Inventory Moderation] List by establishment error:", error);
        return res.status(500).json({ error: "Erreur lors de la récupération des demandes" });
      }

      return res.json({ ok: true, pendingChanges: data ?? [] });
    } catch (error) {
      console.error("[Admin Inventory Moderation] List by establishment error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Approve a pending change
  router.post("/api/admin/inventory/pending-changes/:changeId/approve", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { changeId } = req.params;
      const { notes } = req.body as { notes?: string };

      const supabase = getAdminSupabase();

      // Get the pending change
      const { data: pendingChange, error: fetchError } = await supabase
        .from("pro_inventory_pending_changes")
        .select("*")
        .eq("id", changeId)
        .eq("status", "pending")
        .single();

      if (fetchError || !pendingChange) {
        return res.status(404).json({ error: "Demande non trouvée ou déjà traitée" });
      }

      const change = pendingChange as {
        id: string;
        establishment_id: string;
        change_type: string;
        target_id: string | null;
        payload: Record<string, any>;
        bulk_data: any;
      };

      // Apply the change based on type
      let result: { ok: boolean; error?: string; data?: any } = { ok: true };

      switch (change.change_type) {
        case "create_category": {
          const { data: cat, error: catErr } = await supabase
            .from("pro_inventory_categories")
            .insert({
              establishment_id: change.establishment_id,
              title: change.payload.title,
              description: change.payload.description,
              sort_order: change.payload.sort_order ?? 0,
              is_active: change.payload.is_active ?? true,
            })
            .select()
            .single();
          if (catErr) result = { ok: false, error: catErr.message };
          else result = { ok: true, data: cat };
          break;
        }

        case "update_category": {
          const { data: cat, error: catErr } = await supabase
            .from("pro_inventory_categories")
            .update(change.payload)
            .eq("id", change.target_id)
            .eq("establishment_id", change.establishment_id)
            .select()
            .single();
          if (catErr) result = { ok: false, error: catErr.message };
          else result = { ok: true, data: cat };
          break;
        }

        case "delete_category": {
          // First update items to remove category reference
          await supabase
            .from("pro_inventory_items")
            .update({ category_id: null })
            .eq("category_id", change.target_id);

          const { error: delErr } = await supabase
            .from("pro_inventory_categories")
            .delete()
            .eq("id", change.target_id)
            .eq("establishment_id", change.establishment_id);
          if (delErr) result = { ok: false, error: delErr.message };
          break;
        }

        case "create_item": {
          const { variants, ...itemData } = change.payload;
          const { data: item, error: itemErr } = await supabase
            .from("pro_inventory_items")
            .insert({
              establishment_id: change.establishment_id,
              ...itemData,
            })
            .select()
            .single();

          if (itemErr) {
            result = { ok: false, error: itemErr.message };
          } else if (variants && Array.isArray(variants) && variants.length > 0) {
            const itemId = (item as { id: string }).id;
            const { error: vErr } = await supabase
              .from("pro_inventory_variants")
              .insert(variants.map((v: any) => ({ ...v, item_id: itemId })));
            if (vErr) result = { ok: false, error: vErr.message };
            else result = { ok: true, data: item };
          } else {
            result = { ok: true, data: item };
          }
          break;
        }

        case "update_item": {
          const { variants, ...itemData } = change.payload;

          if (Object.keys(itemData).length > 0) {
            const { data: item, error: itemErr } = await supabase
              .from("pro_inventory_items")
              .update(itemData)
              .eq("id", change.target_id)
              .eq("establishment_id", change.establishment_id)
              .select()
              .single();
            if (itemErr) {
              result = { ok: false, error: itemErr.message };
              break;
            }
            result = { ok: true, data: item };
          }

          if (variants !== undefined) {
            // Delete existing variants and insert new ones
            await supabase
              .from("pro_inventory_variants")
              .delete()
              .eq("item_id", change.target_id);

            if (Array.isArray(variants) && variants.length > 0) {
              const { error: vErr } = await supabase
                .from("pro_inventory_variants")
                .insert(variants.map((v: any) => ({ ...v, item_id: change.target_id })));
              if (vErr) result = { ok: false, error: vErr.message };
            }
          }
          break;
        }

        case "delete_item": {
          // Delete variants first
          await supabase
            .from("pro_inventory_variants")
            .delete()
            .eq("item_id", change.target_id);

          const { error: delErr } = await supabase
            .from("pro_inventory_items")
            .delete()
            .eq("id", change.target_id)
            .eq("establishment_id", change.establishment_id);
          if (delErr) result = { ok: false, error: delErr.message };
          break;
        }

        case "bulk_import": {
          // Handle bulk imports with duplicate detection
          const bulk = change.bulk_data;

          // First, fetch existing categories and items for duplicate detection
          const [existingCatsRes, existingItemsRes] = await Promise.all([
            supabase
              .from("pro_inventory_categories")
              .select("id, title")
              .eq("establishment_id", change.establishment_id)
              .eq("is_active", true),
            supabase
              .from("pro_inventory_items")
              .select("id, title")
              .eq("establishment_id", change.establishment_id)
              .eq("is_active", true),
          ]);

          const existingCatTitles = new Set(
            (existingCatsRes.data ?? []).map((c: { title: string }) => c.title.toLowerCase().trim())
          );
          const existingItemTitles = new Set(
            (existingItemsRes.data ?? []).map((i: { title: string }) => i.title.toLowerCase().trim())
          );

          let categoriesAdded = 0;
          let categoriesSkipped = 0;
          let itemsAdded = 0;
          let itemsSkipped = 0;

          if (bulk?.categories && Array.isArray(bulk.categories)) {
            for (const cat of bulk.categories) {
              const normalizedTitle = (cat.title || "").toLowerCase().trim();
              if (existingCatTitles.has(normalizedTitle)) {
                categoriesSkipped++;
                continue; // Skip duplicate
              }

              const { error: catErr } = await supabase
                .from("pro_inventory_categories")
                .insert({
                  establishment_id: change.establishment_id,
                  title: cat.title,
                  description: cat.description,
                  sort_order: cat.sort_order ?? 0,
                  is_active: true,
                });

              if (!catErr) {
                existingCatTitles.add(normalizedTitle); // Add to set for subsequent checks
                categoriesAdded++;
              }
            }
          }

          if (bulk?.items && Array.isArray(bulk.items)) {
            for (const item of bulk.items) {
              const normalizedTitle = (item.title || "").toLowerCase().trim();
              if (existingItemTitles.has(normalizedTitle)) {
                itemsSkipped++;
                continue; // Skip duplicate
              }

              // Find category ID by name
              let categoryId = null;
              if (item.category) {
                const { data: foundCat } = await supabase
                  .from("pro_inventory_categories")
                  .select("id")
                  .eq("establishment_id", change.establishment_id)
                  .ilike("title", item.category) // Case insensitive match
                  .limit(1)
                  .single();
                categoryId = foundCat?.id ?? null;
              }

              const { error: itemErr } = await supabase
                .from("pro_inventory_items")
                .insert({
                  establishment_id: change.establishment_id,
                  category_id: categoryId,
                  title: item.title,
                  description: item.description,
                  base_price: item.price,
                  labels: item.labels ?? [],
                  currency: "MAD",
                  is_active: true,
                });

              if (!itemErr) {
                existingItemTitles.add(normalizedTitle);
                itemsAdded++;
              }
            }
          }

          result = {
            ok: true,
            data: {
              categoriesAdded,
              categoriesSkipped,
              itemsAdded,
              itemsSkipped,
            },
          };
          break;
        }

        default:
          result = { ok: false, error: "Type de changement non supporté" };
      }

      if (!result.ok) {
        return res.status(500).json({ error: result.error });
      }

      // Mark as approved
      const { error: updateErr } = await supabase
        .from("pro_inventory_pending_changes")
        .update({
          status: "approved",
          reviewed_by: session.sub ?? session.collaborator_id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes ?? null,
        })
        .eq("id", changeId);

      if (updateErr) {
        console.error("[Admin Inventory Moderation] Update status error:", updateErr);
      }

      return res.json({ ok: true, applied: result.data ?? null });
    } catch (error) {
      console.error("[Admin Inventory Moderation] Approve error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Reject a pending change
  router.post("/api/admin/inventory/pending-changes/:changeId/reject", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux super administrateurs" });
      }

      const { changeId } = req.params;
      const { notes } = req.body as { notes?: string };

      const supabase = getAdminSupabase();

      const { data, error } = await supabase
        .from("pro_inventory_pending_changes")
        .update({
          status: "rejected",
          reviewed_by: session.sub ?? session.collaborator_id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes ?? null,
        })
        .eq("id", changeId)
        .eq("status", "pending")
        .select()
        .single();

      if (error) {
        console.error("[Admin Inventory Moderation] Reject error:", error);
        return res.status(500).json({ error: "Erreur lors du rejet de la demande" });
      }

      if (!data) {
        return res.status(404).json({ error: "Demande non trouvée ou déjà traitée" });
      }

      return res.json({ ok: true, pendingChange: data });
    } catch (error) {
      console.error("[Admin Inventory Moderation] Reject error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // ============================================================================
  // ESTABLISHMENT PROFILE (Basic info)
  // ============================================================================

  // Update establishment profile (name, city, universe, subcategory)
  router.patch("/api/admin/establishments/:establishmentId/profile", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check if user has permission (admin, superadmin, or has edit_establishment_profile permission)
      const isAdmin = session.role === "admin" || session.role === "superadmin";
      const hasPermission = isAdmin; // TODO: Add permission check for edit_establishment_profile

      if (!hasPermission) {
        return res.status(403).json({ error: "Forbidden", message: "Vous n'avez pas la permission de modifier la fiche" });
      }

      const { establishmentId } = req.params;
      const body = req.body as {
        name?: string;
        city?: string;
        universe?: string;
        subcategory?: string;
      };

      const supabase = getAdminSupabase();

      // Map UI universe values to valid DB enum values
      const UNIVERSE_TO_DB: Record<string, string> = {
        restaurants: "restaurant",
        restaurant: "restaurant",
        loisirs: "loisir",
        loisir: "loisir",
        sport: "wellness",
        hebergement: "hebergement",
        hotels: "hebergement",
        hotel: "hebergement",
        wellness: "wellness",
        culture: "culture",
        shopping: "loisir",
        rentacar: "loisir",
      };

      // Build update object
      const updateData: Record<string, unknown> = {};

      if (body.name !== undefined) updateData.name = body.name;
      if (body.city !== undefined) updateData.city = body.city;
      if (body.universe !== undefined) {
        updateData.universe = UNIVERSE_TO_DB[body.universe.toLowerCase()] ?? body.universe;
      }
      if (body.subcategory !== undefined) updateData.subcategory = body.subcategory;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "Aucune donnée à mettre à jour" });
      }

      const { error } = await supabase
        .from("establishments")
        .update(updateData)
        .eq("id", establishmentId);

      if (error) {
        console.error("[Admin Profile] Update error:", error);
        return res.status(500).json({ error: "Erreur lors de la mise à jour" });
      }

      // Log the action
      const actor = getAuditActorInfo(req);
      await supabase.from("admin_audit_log").insert({
        action: "establishment.profile_update",
        entity_type: "establishment",
        entity_id: establishmentId,
        actor_id: actor.actor_id,
        metadata: { ...updateData, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
      });

      return res.json({ ok: true });
    } catch (error) {
      console.error("[Admin Profile] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // ============================================================================
  // TAGS & SERVICES
  // ============================================================================

  // Get tags and services for establishment
  router.get("/api/admin/establishments/:establishmentId/tags-services", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { establishmentId } = req.params;
      const supabase = getAdminSupabase();

      const { data, error } = await supabase
        .from("establishments")
        .select("specialties, tags, amenities, ambiance_tags, highlights, booking_enabled, menu_digital_enabled, verified, extra")
        .eq("id", establishmentId)
        .single();

      if (error) {
        console.error("[Admin Tags Services] Fetch error:", error);
        return res.status(500).json({ error: "Erreur lors de la récupération" });
      }

      if (!data) {
        console.log("[Admin Tags Services] No data found for establishment:", establishmentId);
        return res.json({
          specialties: [],
          tags: [],
          amenities: [],
          ambiance_tags: [],
          highlights: [],
          booking_enabled: false,
          menu_digital_enabled: false,
          verified: false,
        });
      }

      console.log("[Admin Tags Services] Data found:", {
        establishmentId,
        specialties: data.specialties,
        tags: data.tags,
        amenities: data.amenities,
        ambiance_tags: data.ambiance_tags,
        highlights: data.highlights,
        booking_enabled: data.booking_enabled,
        menu_digital_enabled: data.menu_digital_enabled,
        verified: data.verified,
      });

      return res.json({
        specialties: Array.isArray(data.specialties) ? data.specialties : [],
        tags: Array.isArray(data.tags) ? data.tags : [],
        amenities: Array.isArray(data.amenities) ? data.amenities : [],
        ambiance_tags: Array.isArray(data.ambiance_tags) ? data.ambiance_tags : [],
        highlights: Array.isArray(data.highlights) ? data.highlights : [],
        booking_enabled: data.booking_enabled ?? false,
        menu_digital_enabled: data.menu_digital_enabled ?? false,
        verified: data.verified ?? false,
      });
    } catch (error) {
      console.error("[Admin Tags Services] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Update tags and services for establishment
  router.patch("/api/admin/establishments/:establishmentId/tags-services", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!canManageEstablishments(session)) {
        return res.status(403).json({ error: "Forbidden", message: "Accès réservé aux administrateurs" });
      }

      const { establishmentId } = req.params;
      const body = req.body;
      const supabase = getAdminSupabase();

      // Build update object
      const updateData: Record<string, unknown> = {};

      if (body.specialties !== undefined) updateData.specialties = body.specialties;
      if (body.tags !== undefined) updateData.tags = body.tags;
      if (body.amenities !== undefined) updateData.amenities = body.amenities;
      if (body.ambiance_tags !== undefined) updateData.ambiance_tags = body.ambiance_tags;
      if (body.highlights !== undefined) updateData.highlights = body.highlights;
      if (body.booking_enabled !== undefined) updateData.booking_enabled = body.booking_enabled;
      if (body.menu_digital_enabled !== undefined) updateData.menu_digital_enabled = body.menu_digital_enabled;
      if (body.verified !== undefined) updateData.verified = body.verified;

      const { error } = await supabase
        .from("establishments")
        .update(updateData)
        .eq("id", establishmentId);

      if (error) {
        console.error("[Admin Tags Services] Update error:", error);
        return res.status(500).json({ error: "Erreur lors de la mise à jour" });
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("[Admin Tags Services] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // Get pending changes count (for notification badge)
  router.get("/api/admin/inventory/pending-changes/count", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const supabase = getAdminSupabase();

      const { count, error } = await supabase
        .from("pro_inventory_pending_changes")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (error) {
        console.error("[Admin Inventory Moderation] Count error:", error);
        return res.status(500).json({ error: "Erreur lors du comptage" });
      }

      return res.json({ ok: true, count: count ?? 0 });
    } catch (error) {
      console.error("[Admin Inventory Moderation] Count error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);
}
