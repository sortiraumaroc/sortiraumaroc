/**
 * Consumer Media Upload — Upload d'images pour posts & stories
 *
 *  POST /api/consumer/media/upload-image — Upload une image vers Supabase Storage
 */

import type { Express, Request, Response, RequestHandler } from "express";
import multer from "multer";
import { randomBytes } from "crypto";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("consumer-media");

// =============================================================================
// Config
// =============================================================================

const STORAGE_BUCKET = "public";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Type de fichier non supporté. Formats acceptés : JPEG, PNG, WebP, HEIC"));
    }
  },
});

// =============================================================================
// Auth helper (même pattern que social.ts)
// =============================================================================

async function getAuthUserId(
  req: { header: (name: string) => string | undefined },
): Promise<string | null> {
  const authHeader = req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// =============================================================================
// POST /api/consumer/media/upload-image
// =============================================================================

const uploadImage: RequestHandler = async (req: Request, res: Response) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Non autorisé" });
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: "Aucun fichier fourni" });
      return;
    }

    const supabase = getAdminSupabase();

    // Build storage path: social/{userId}/{randomHex}.{ext}
    const ext = file.originalname.split(".").pop()?.toLowerCase() || "jpg";
    const safeExt = ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)
      ? ext
      : "jpg";
    const id = randomBytes(12).toString("hex");
    const storagePath = `social/${userId}/${id}.${safeExt}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: "31536000", // 1 an — images immutables
        upsert: false,
      });

    if (uploadError) {
      log.error({ err: uploadError }, "Consumer image upload failed");
      res.status(500).json({ error: "Erreur lors de l'upload de l'image" });
      return;
    }

    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    res.json({
      ok: true,
      url: urlData.publicUrl,
      path: storagePath,
    });

    log.info(
      { userId, path: storagePath, size: file.size, mime: file.mimetype },
      "Consumer image uploaded",
    );
  } catch (err) {
    log.error({ err }, "uploadImage error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// Route registration
// =============================================================================

export function registerConsumerMediaRoutes(app: Express) {
  app.post(
    "/api/consumer/media/upload-image",
    imageUpload.single("image"),
    uploadImage,
  );

  log.info("Consumer media routes registered");
}
