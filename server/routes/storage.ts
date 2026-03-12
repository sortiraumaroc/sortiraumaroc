/**
 * Routes Storage — Upload & transfert de fichiers via SAM Storage
 *
 * Admin routes (require auth):
 *   POST   /api/admin/storage/upload                  — upload un fichier
 *   POST   /api/admin/storage/transfers               — créer un transfert
 *   GET    /api/admin/storage/transfers/all            — lister tous les transferts (superadmin)
 *   GET    /api/admin/storage/transfers                — lister mes transferts
 *   GET    /api/admin/storage/transfers/:id            — détail d'un transfert
 *   POST   /api/admin/storage/transfers/:id/send-email — envoyer un email de transfert
 *   POST   /api/admin/storage/transfers/:id/revoke     — révoquer un transfert
 *   DELETE /api/admin/storage/transfers/:id            — supprimer un transfert (superadmin)
 *   GET    /api/admin/storage/stats                    — statistiques de stockage (superadmin)
 *
 * Public routes (no auth):
 *   GET    /api/storage/t/:code          — métadonnées d'un transfert
 *   POST   /api/storage/t/:code/verify   — vérifier le mot de passe
 *   POST   /api/storage/t/:code/download — obtenir les URLs de téléchargement
 */

import type { Express, RequestHandler } from "express";
import crypto from "crypto";
import multer from "multer";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey, requireSuperadmin, getAuditActorInfo } from "./adminHelpers";
import { isValidUUID } from "../sanitizeV2";
import { sendSAMEmail } from "../email";
import { createModuleLogger } from "../lib/logger";

// ─── Constants ──────────────────────────────────────────────────────────────

const logAdmin = createModuleLogger("storage-admin");
const logPublic = createModuleLogger("storage-public");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB per file
});

const BUCKET = "storage-transfers";

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const CreateTransferSchema = z.object({
  name: z.string().trim().max(200).optional(),
  recipient_email: z.string().email().optional(),
  sender_email: z.string().email().optional(),
  message: z.string().trim().max(1000).optional(),
  password: z.string().min(4).max(64).optional(),
  expiry: z.enum(["6h", "24h", "48h"]),
  files: z
    .array(
      z.object({
        storage_path: z.string().min(1),
        original_name: z.string().min(1),
        mime_type: z.string().optional(),
        size: z.number().int().min(0),
      }),
    )
    .min(1, "Au moins un fichier requis"),
});

const ListTransfersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["active", "expired", "revoked", "deleted", "all"])
    .default("all"),
});

const SendEmailSchema = z.object({
  recipient_email: z.string().email(),
  message: z.string().trim().max(1000).optional(),
  password: z.string().optional(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateTransferCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(5);
  let code = "TRF-";
  for (let i = 0; i < 5; i++) code += chars[bytes[i] % chars.length];
  return code;
}

function generateTemporaryPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(8);
  let pwd = "";
  for (let i = 0; i < 8; i++) pwd += chars[bytes[i] % chars.length];
  return pwd;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 100);
}

function computeExpiresAt(option: "6h" | "24h" | "48h"): Date {
  const hours = option === "6h" ? 6 : option === "24h" ? 24 : 48;
  return new Date(Date.now() + hours * 3600 * 1000);
}

async function ensureBucket(): Promise<void> {
  const supabase = getAdminSupabase();
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
  });
  if (error && !error.message.includes("already exists")) {
    logAdmin.error({ err: error }, "Failed to create storage bucket");
  }
}

// ─── Rate Limiting (public routes) ──────────────────────────────────────────

const rateLimitMap = new Map<
  string,
  { count: number; resetAt: number }
>();

function isRateLimited(
  key: string,
  maxAttempts: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > maxAttempts;
}

// ─── Download Token ─────────────────────────────────────────────────────────

function getSessionSecret(): string {
  const secret =
    process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_API_KEY;
  if (!secret)
    throw new Error("ADMIN_SESSION_SECRET or ADMIN_API_KEY is missing");
  return secret;
}

function createDownloadToken(transferId: string, code: string): string {
  const payload = JSON.stringify({
    transfer_id: transferId,
    code,
    exp: Date.now() + 3600 * 1000, // 1 hour
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${sig}`;
}

function verifyDownloadToken(
  token: string,
): { transfer_id: string; code: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadB64)
    .digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString(),
    );
    if (payload.exp < Date.now()) return null;
    return { transfer_id: payload.transfer_id, code: payload.code };
  } catch {
    return null;
  }
}

function getClientIp(req: Parameters<RequestHandler>[0]): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

const uploadFile: RequestHandler = async (req, res) => {
  try {
    if (!requireAdminKey(req, res)) return;
    const file = req.file;
    if (!file) {
      res.status(400).json({ ok: false, error: "Aucun fichier fourni" });
      return;
    }
    await ensureBucket();
    const sanitizedName = sanitizeFileName(file.originalname);
    const storagePath = `pending/${Date.now()}-${crypto
      .randomBytes(4)
      .toString("hex")}-${sanitizedName}`;
    const supabase = getAdminSupabase();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });
    if (uploadError) {
      logAdmin.error(
        { err: uploadError },
        "File upload to Supabase Storage failed",
      );
      res
        .status(500)
        .json({ ok: false, error: "Erreur lors de l'upload du fichier" });
      return;
    }
    res.json({
      ok: true,
      storage_path: storagePath,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
    });
  } catch (err) {
    logAdmin.error({ err }, "uploadFile error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

const createTransfer: RequestHandler = async (req, res) => {
  try {
    if (!requireAdminKey(req, res)) return;
    const parsed = CreateTransferSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Données invalides",
      });
      return;
    }
    const {
      name,
      recipient_email,
      sender_email,
      message,
      password: customPassword,
      expiry,
      files,
    } = parsed.data;
    const session = (req as any).adminSession;
    let collaboratorId: string | null =
      session?.collaborator_id ?? session?.sub ?? null;
    const supabase = getAdminSupabase();

    // If no collaborator ID from session (e.g. x-admin-key auth),
    // find or create a default admin collaborator
    if (!collaboratorId) {
      const fallbackEmail =
        process.env.ADMIN_DASHBOARD_USERNAME?.trim().toLowerCase() ||
        "admin@sam.ma";
      const { data: collab } = await supabase
        .from("admin_collaborators")
        .select("id")
        .eq("email", fallbackEmail)
        .maybeSingle();
      if (collab) {
        collaboratorId = collab.id;
      } else {
        const { data: newCollab } = await supabase
          .from("admin_collaborators")
          .insert({
            email: fallbackEmail,
            first_name: "Admin",
            last_name: "SAM",
            display_name: "Admin",
            role_id: "superadmin",
            status: "active",
            password_hash: "api_key_auth",
          })
          .select("id")
          .single();
        collaboratorId = newCollab?.id ?? null;
      }
    }

    // Generate unique code
    let code = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      code = generateTransferCode();
      const { data: existing } = await supabase
        .from("storage_transfers")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (!existing) break;
      if (attempt === 2) {
        res.status(500).json({
          ok: false,
          error: "Impossible de générer un code unique",
        });
        return;
      }
    }

    const password = customPassword || generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const expiresAt = computeExpiresAt(expiry);
    const fileCount = files.length;
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    const { data: transfer, error: insertError } = await supabase
      .from("storage_transfers")
      .insert({
        code,
        created_by: collaboratorId,
        name: name ?? null,
        message: message ?? null,
        recipient_email: recipient_email ?? null,
        sender_email: sender_email ?? null,
        password_hash: passwordHash,
        expiry_option: expiry,
        expires_at: expiresAt.toISOString(),
        file_count: fileCount,
        total_size: totalSize,
        status: "active",
        email_sent: false,
      })
      .select("*")
      .single();

    if (insertError || !transfer) {
      logAdmin.error(
        { err: insertError },
        "Failed to insert storage_transfer",
      );
      res.status(500).json({
        ok: false,
        error: "Erreur lors de la création du transfert",
      });
      return;
    }

    const fileRows = files.map((f) => ({
      transfer_id: transfer.id,
      original_name: f.original_name,
      mime_type: f.mime_type ?? "application/octet-stream",
      size: f.size,
      storage_bucket: BUCKET,
      storage_path: f.storage_path,
    }));
    const { error: filesError } = await supabase
      .from("storage_transfer_files")
      .insert(fileRows);

    if (filesError) {
      logAdmin.error(
        { err: filesError },
        "Failed to insert storage_transfer_files",
      );
      // Rollback
      await supabase
        .from("storage_transfers")
        .delete()
        .eq("id", transfer.id);
      res.status(500).json({
        ok: false,
        error: "Erreur lors de l'enregistrement des fichiers",
      });
      return;
    }

    logAdmin.info(
      { transferId: transfer.id, code, fileCount },
      "Transfer created",
    );
    res.status(201).json({
      ok: true,
      transfer: {
        id: transfer.id,
        code: transfer.code,
        name: transfer.name,
        recipient_email: transfer.recipient_email,
        expiry_option: transfer.expiry_option,
        expires_at: transfer.expires_at,
        file_count: transfer.file_count,
        total_size: transfer.total_size,
        status: transfer.status,
        created_at: transfer.created_at,
      },
      password, // Plain text — only returned at creation time
    });
  } catch (err) {
    logAdmin.error({ err }, "createTransfer error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

const listMyTransfers: RequestHandler = async (req, res) => {
  try {
    if (!requireAdminKey(req, res)) return;
    const parsed = ListTransfersQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error:
          parsed.error.issues[0]?.message ?? "Paramètres invalides",
      });
      return;
    }
    const { page, limit, status } = parsed.data;
    const offset = (page - 1) * limit;
    const session = (req as any).adminSession;
    const collaboratorId: string | null =
      session?.collaborator_id ?? null;
    const supabase = getAdminSupabase();

    let query = supabase
      .from("storage_transfers")
      .select("*, storage_transfer_downloads(id)", { count: "exact" })
      .eq("created_by", collaboratorId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;
    if (error) {
      logAdmin.error({ err: error }, "listMyTransfers query error");
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    const transfers = (data ?? []).map((t: any) => ({
      ...t,
      download_count: Array.isArray(t.storage_transfer_downloads)
        ? t.storage_transfer_downloads.length
        : 0,
      storage_transfer_downloads: undefined,
    }));
    res.json({ ok: true, transfers, total: count ?? 0, page, limit });
  } catch (err) {
    logAdmin.error({ err }, "listMyTransfers error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

const listAllTransfers: RequestHandler = async (req, res) => {
  try {
    if (!requireSuperadmin(req, res)) return;
    const parsed = ListTransfersQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error:
          parsed.error.issues[0]?.message ?? "Paramètres invalides",
      });
      return;
    }
    const { page, limit, status } = parsed.data;
    const offset = (page - 1) * limit;
    const supabase = getAdminSupabase();

    let query = supabase
      .from("storage_transfers")
      .select(
        "*, storage_transfer_downloads(id), admin_collaborators!storage_transfers_created_by_fkey(display_name, email)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;
    if (error) {
      logAdmin.error({ err: error }, "listAllTransfers query error");
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    const transfers = (data ?? []).map((t: any) => {
      const creator = t.admin_collaborators;
      return {
        ...t,
        download_count: Array.isArray(t.storage_transfer_downloads)
          ? t.storage_transfer_downloads.length
          : 0,
        creator_name:
          creator?.display_name ?? creator?.email ?? null,
        storage_transfer_downloads: undefined,
        admin_collaborators: undefined,
      };
    });
    res.json({ ok: true, transfers, total: count ?? 0, page, limit });
  } catch (err) {
    logAdmin.error({ err }, "listAllTransfers error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

const getTransferDetail: RequestHandler = async (req, res) => {
  try {
    if (!requireAdminKey(req, res)) return;
    const transferId = req.params.id;
    if (!isValidUUID(transferId)) {
      res
        .status(400)
        .json({ ok: false, error: "ID de transfert invalide" });
      return;
    }
    const supabase = getAdminSupabase();
    const { data: transfer, error } = await supabase
      .from("storage_transfers")
      .select("*")
      .eq("id", transferId)
      .single();
    if (error || !transfer) {
      res
        .status(404)
        .json({ ok: false, error: "Transfert introuvable" });
      return;
    }

    const session = (req as any).adminSession;
    const collaboratorId: string | null =
      session?.collaborator_id ?? null;
    const isSuperadmin = session?.role === "superadmin";
    if (!isSuperadmin && transfer.created_by !== collaboratorId) {
      res.status(403).json({ ok: false, error: "Accès refusé" });
      return;
    }

    const { data: files } = await supabase
      .from("storage_transfer_files")
      .select("*")
      .eq("transfer_id", transferId)
      .order("created_at", { ascending: true });
    const { data: downloads } = await supabase
      .from("storage_transfer_downloads")
      .select("*")
      .eq("transfer_id", transferId)
      .order("downloaded_at", { ascending: false });

    res.json({
      ok: true,
      transfer,
      files: files ?? [],
      downloads: downloads ?? [],
    });
  } catch (err) {
    logAdmin.error({ err }, "getTransferDetail error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

const sendTransferEmailHandler: RequestHandler = async (req, res) => {
  try {
    if (!requireAdminKey(req, res)) return;
    const transferId = req.params.id;
    if (!isValidUUID(transferId)) {
      res
        .status(400)
        .json({ ok: false, error: "ID de transfert invalide" });
      return;
    }
    const parsed = SendEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error:
          parsed.error.issues[0]?.message ?? "Données invalides",
      });
      return;
    }
    const {
      recipient_email,
      message,
      password: transferPassword,
    } = parsed.data;
    const supabase = getAdminSupabase();
    const { data: transfer, error } = await supabase
      .from("storage_transfers")
      .select("*")
      .eq("id", transferId)
      .single();
    if (error || !transfer) {
      res
        .status(404)
        .json({ ok: false, error: "Transfert introuvable" });
      return;
    }

    const session = (req as any).adminSession;
    const collaboratorId: string | null =
      session?.collaborator_id ?? null;
    const isSuperadmin = session?.role === "superadmin";
    if (!isSuperadmin && transfer.created_by !== collaboratorId) {
      res.status(403).json({ ok: false, error: "Accès refusé" });
      return;
    }
    if (transfer.status !== "active") {
      res.status(400).json({
        ok: false,
        error: "Ce transfert n'est plus actif",
      });
      return;
    }

    const actor = getAuditActorInfo(req);
    const senderName =
      actor.actor_name || actor.actor_email || "Un administrateur SAM";
    const baseUrl =
      process.env.PUBLIC_URL || "https://www.sam.ma";
    const accessUrl = `${baseUrl}/storage?t=${transfer.code}`;

    const bodyLines = [
      `${senderName} vous a envoyé des fichiers via SAM Storage.`,
    ];
    if (transfer.name) {
      bodyLines.push(`\nNom du transfert : ${transfer.name}`);
    }
    if (message) {
      bodyLines.push(`\nMessage : ${message}`);
    }
    bodyLines.push(
      `\nNombre de fichiers : ${transfer.file_count}`,
      `\nCliquez sur le bouton ci-dessous pour accéder aux fichiers. Un mot de passe vous sera demandé pour télécharger.`,
    );

    await sendSAMEmail({
      emailId: `storage-transfer-${transferId}-${Date.now()}`,
      fromKey: "noreply",
      to: [recipient_email],
      subject: `${senderName} vous a envoyé des fichiers via SAM Storage`,
      bodyText: bodyLines.join("\n"),
      ctaLabel: "Accéder aux fichiers",
      ctaUrl: accessUrl,
    });

    const { error: updateError } = await supabase
      .from("storage_transfers")
      .update({
        email_sent: true,
        email_sent_at: new Date().toISOString(),
        recipient_email,
      })
      .eq("id", transferId);
    if (updateError) {
      logAdmin.warn(
        { err: updateError, transferId },
        "Email sent but failed to update transfer record",
      );
    }

    // Send sender confirmation email
    if (transfer.sender_email) {
      try {
        const confirmLines = [
          `Vos fichiers ont bien été envoyés à ${recipient_email}.`,
        ];
        if (transfer.name) {
          confirmLines.push(`\nTransfert : ${transfer.name}`);
        }
        confirmLines.push(
          `\nNombre de fichiers : ${transfer.file_count}`,
        );
        confirmLines.push(`\nLien de partage : ${accessUrl}`);
        if (transferPassword) {
          confirmLines.push(`\nMot de passe : ${transferPassword}`);
        }
        confirmLines.push(
          `\nVous recevrez une notification lorsque votre destinataire télécharge les fichiers.`,
        );

        await sendSAMEmail({
          emailId: `storage-sender-confirm-${transferId}-${Date.now()}`,
          fromKey: "noreply",
          to: [transfer.sender_email],
          subject: `Confirmation : vos fichiers ont été envoyés à ${recipient_email}`,
          bodyText: confirmLines.join("\n"),
          ctaLabel: "Voir le transfert",
          ctaUrl: accessUrl,
        });
        logAdmin.info(
          { transferId, sender_email: transfer.sender_email },
          "Sender confirmation email sent",
        );
      } catch (confirmErr) {
        logAdmin.warn(
          { err: confirmErr, transferId },
          "Failed to send sender confirmation email",
        );
      }
    }

    logAdmin.info(
      { transferId, recipient_email },
      "Transfer email sent",
    );
    res.json({ ok: true });
  } catch (err) {
    logAdmin.error({ err }, "sendTransferEmail error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

const revokeTransfer: RequestHandler = async (req, res) => {
  try {
    if (!requireAdminKey(req, res)) return;
    const transferId = req.params.id;
    if (!isValidUUID(transferId)) {
      res
        .status(400)
        .json({ ok: false, error: "ID de transfert invalide" });
      return;
    }
    const supabase = getAdminSupabase();
    const { data: transfer, error } = await supabase
      .from("storage_transfers")
      .select("id, created_by, status, recipient_email, sender_email, name, file_count")
      .eq("id", transferId)
      .single();
    if (error || !transfer) {
      res
        .status(404)
        .json({ ok: false, error: "Transfert introuvable" });
      return;
    }

    const session = (req as any).adminSession;
    const collaboratorId: string | null =
      session?.collaborator_id ?? null;
    const isSuperadmin = session?.role === "superadmin";
    if (!isSuperadmin && transfer.created_by !== collaboratorId) {
      res.status(403).json({ ok: false, error: "Accès refusé" });
      return;
    }
    if (transfer.status === "revoked") {
      res.status(400).json({
        ok: false,
        error: "Ce transfert est déjà révoqué",
      });
      return;
    }

    const { error: updateError } = await supabase
      .from("storage_transfers")
      .update({
        status: "revoked",
        updated_at: new Date().toISOString(),
      })
      .eq("id", transferId);
    if (updateError) {
      logAdmin.error(
        { err: updateError, transferId },
        "Failed to revoke transfer",
      );
      res.status(500).json({
        ok: false,
        error: "Erreur lors de la révocation",
      });
      return;
    }
    logAdmin.info({ transferId }, "Transfer revoked");

    // Notify recipient that the link has been revoked
    if (transfer.recipient_email) {
      const transferName =
        transfer.name ||
        `Transfert (${transfer.file_count} fichier${transfer.file_count > 1 ? "s" : ""})`;
      const senderLabel = transfer.sender_email || "L'expéditeur";
      sendSAMEmail({
        emailId: `storage-revoked-notif-${transferId}-${Date.now()}`,
        fromKey: "noreply",
        to: [transfer.recipient_email],
        subject: `Lien de partage révoqué — ${transferName}`,
        bodyText: [
          `${senderLabel} a révoqué le lien de partage de fichiers.`,
          `\nTransfert : ${transferName}`,
          `\nLe lien n'est plus accessible et les fichiers ne peuvent plus être téléchargés.`,
          `\nSi vous pensez qu'il s'agit d'une erreur, contactez directement l'expéditeur.`,
        ].join("\n"),
      }).catch((emailErr) => {
        logAdmin.warn(
          { err: emailErr, transferId },
          "Failed to send revocation notification to recipient",
        );
      });
    }

    res.json({ ok: true });
  } catch (err) {
    logAdmin.error({ err }, "revokeTransfer error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

const deleteTransfer: RequestHandler = async (req, res) => {
  try {
    if (!requireAdminKey(req, res)) return;
    const transferId = req.params.id;
    if (!isValidUUID(transferId)) {
      res
        .status(400)
        .json({ ok: false, error: "ID de transfert invalide" });
      return;
    }
    const supabase = getAdminSupabase();

    // Delete files from storage
    const { data: files } = await supabase
      .from("storage_transfer_files")
      .select("storage_path")
      .eq("transfer_id", transferId);
    if (files && files.length > 0) {
      const paths = files.map((f: any) => f.storage_path);
      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove(paths);
      if (removeError) {
        logAdmin.warn(
          { err: removeError, transferId },
          "Failed to remove some files from storage",
        );
      }
    }

    // Delete DB records
    await supabase
      .from("storage_transfer_downloads")
      .delete()
      .eq("transfer_id", transferId);
    await supabase
      .from("storage_transfer_files")
      .delete()
      .eq("transfer_id", transferId);
    const { error: deleteError } = await supabase
      .from("storage_transfers")
      .delete()
      .eq("id", transferId);
    if (deleteError) {
      logAdmin.error(
        { err: deleteError, transferId },
        "Failed to delete transfer",
      );
      res.status(500).json({
        ok: false,
        error: "Erreur lors de la suppression",
      });
      return;
    }

    logAdmin.info(
      { transferId },
      "Transfer hard-deleted by superadmin",
    );
    res.json({ ok: true });
  } catch (err) {
    logAdmin.error({ err }, "deleteTransfer error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

const getStorageStats: RequestHandler = async (req, res) => {
  try {
    if (!requireSuperadmin(req, res)) return;
    const supabase = getAdminSupabase();

    const [
      { count: totalTransfers },
      { count: activeTransfers },
      { count: expiredTransfers },
      { count: revokedTransfers },
    ] = await Promise.all([
      supabase
        .from("storage_transfers")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("storage_transfers")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("storage_transfers")
        .select("id", { count: "exact", head: true })
        .eq("status", "expired"),
      supabase
        .from("storage_transfers")
        .select("id", { count: "exact", head: true })
        .eq("status", "revoked"),
    ]);

    // Total & active size
    const { data: allSizeData } = await supabase
      .from("storage_transfers")
      .select("total_size, status");
    const activeSizeData = (allSizeData ?? []).filter(
      (r: any) => r.status === "active",
    );
    const totalSize = (activeSizeData).reduce(
      (sum: number, row: any) => sum + (row.total_size ?? 0),
      0,
    );
    const allTotalSize = (allSizeData ?? []).reduce(
      (sum: number, row: any) => sum + (row.total_size ?? 0),
      0,
    );

    const { count: totalDownloads } = await supabase
      .from("storage_transfer_downloads")
      .select("id", { count: "exact", head: true });

    // ──── Users who have created transfers ────
    const { data: usersData } = await supabase
      .from("storage_transfers")
      .select(
        "created_by, admin_collaborators!storage_transfers_created_by_fkey(id, display_name, email, role_id, status)",
      );
    const usersMap = new Map<
      string,
      { id: string; display_name: string; email: string; role_id: string; status: string; transfer_count: number; total_size: number }
    >();
    for (const row of usersData ?? []) {
      const collab = (row as any).admin_collaborators;
      if (!collab) continue;
      const existing = usersMap.get(collab.id);
      if (existing) {
        existing.transfer_count++;
      } else {
        usersMap.set(collab.id, {
          id: collab.id,
          display_name: collab.display_name || collab.email,
          email: collab.email,
          role_id: collab.role_id,
          status: collab.status,
          transfer_count: 1,
          total_size: 0,
        });
      }
    }
    // Enrich with total_size per user
    const { data: userSizeData } = await supabase
      .from("storage_transfers")
      .select("created_by, total_size");
    for (const row of userSizeData ?? []) {
      const user = usersMap.get(row.created_by);
      if (user) user.total_size += row.total_size ?? 0;
    }
    const users = Array.from(usersMap.values()).sort(
      (a, b) => b.transfer_count - a.transfer_count,
    );

    // ──── Recent activity (last 20 transfers + downloads) ────
    const { data: recentTransfers } = await supabase
      .from("storage_transfers")
      .select(
        "id, code, created_at, status, file_count, total_size, recipient_email, admin_collaborators!storage_transfers_created_by_fkey(display_name)",
      )
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: recentDownloads } = await supabase
      .from("storage_transfer_downloads")
      .select(
        "id, downloaded_at, ip_address, storage_transfers!inner(code, recipient_email)",
      )
      .order("downloaded_at", { ascending: false })
      .limit(20);

    // ──── Transfers per day (last 30 days) ────
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: dailyData } = await supabase
      .from("storage_transfers")
      .select("created_at, total_size")
      .gte("created_at", thirtyDaysAgo.toISOString());
    const dailyMap = new Map<string, { count: number; size: number }>();
    for (const row of dailyData ?? []) {
      const day = (row.created_at as string).substring(0, 10);
      const existing = dailyMap.get(day);
      if (existing) {
        existing.count++;
        existing.size += row.total_size ?? 0;
      } else {
        dailyMap.set(day, { count: 1, size: row.total_size ?? 0 });
      }
    }
    const daily = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ──── File type breakdown ────
    const { data: fileTypesData } = await supabase
      .from("storage_transfer_files")
      .select("mime_type, size");
    const typeMap = new Map<string, { count: number; size: number }>();
    for (const row of fileTypesData ?? []) {
      const type = simplifyMimeType(row.mime_type);
      const existing = typeMap.get(type);
      if (existing) {
        existing.count++;
        existing.size += row.size ?? 0;
      } else {
        typeMap.set(type, { count: 1, size: row.size ?? 0 });
      }
    }
    const fileTypes = Array.from(typeMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.size - a.size);

    res.json({
      ok: true,
      stats: {
        total_transfers: totalTransfers ?? 0,
        active_transfers: activeTransfers ?? 0,
        expired_transfers: expiredTransfers ?? 0,
        revoked_transfers: revokedTransfers ?? 0,
        total_size: totalSize,
        all_total_size: allTotalSize,
        total_downloads: totalDownloads ?? 0,
      },
      users,
      daily,
      fileTypes,
      recentActivity: [
        ...(recentTransfers ?? []).map((t: any) => ({
          type: "transfer" as const,
          date: t.created_at,
          code: t.code,
          status: t.status,
          file_count: t.file_count,
          total_size: t.total_size,
          recipient: t.recipient_email,
          actor: t.admin_collaborators?.display_name,
        })),
        ...(recentDownloads ?? []).map((d: any) => ({
          type: "download" as const,
          date: d.downloaded_at,
          code: d.storage_transfers?.code,
          recipient: d.storage_transfers?.recipient_email,
          ip: d.ip_address,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 30),
    });
  } catch (err) {
    logAdmin.error({ err }, "getStorageStats error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

function simplifyMimeType(mime: string | null): string {
  if (!mime) return "Autre";
  if (mime.startsWith("image/")) return "Images";
  if (mime.startsWith("video/")) return "Vidéos";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime === "application/pdf") return "PDF";
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv"
  )
    return "Tableurs";
  if (
    mime.includes("document") ||
    mime.includes("word") ||
    mime.includes("text/plain")
  )
    return "Documents";
  if (
    mime.includes("zip") ||
    mime.includes("rar") ||
    mime.includes("tar") ||
    mime.includes("gzip")
  )
    return "Archives";
  if (mime.includes("presentation") || mime.includes("powerpoint"))
    return "Présentations";
  return "Autre";
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

const getTransferMetadata: RequestHandler = async (req, res) => {
  try {
    const { code } = req.params;
    if (!code) {
      res.status(400).json({ ok: false, error: "missing_code" });
      return;
    }
    const supabase = getAdminSupabase();
    const { data: transfer, error: fetchError } = await supabase
      .from("storage_transfers")
      .select(
        "id, code, name, message, status, expires_at, link_opened_at, created_by",
      )
      .eq("code", code)
      .single();
    if (fetchError || !transfer) {
      res
        .status(404)
        .json({ ok: false, error: "transfer_not_found" });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(transfer.expires_at);
    if (expiresAt < now && transfer.status === "active") {
      await supabase
        .from("storage_transfers")
        .update({ status: "expired" })
        .eq("id", transfer.id);
      res
        .status(410)
        .json({ ok: false, error: "transfer_expired" });
      return;
    }

    if (transfer.status !== "active") {
      const errorMap: Record<
        string,
        { status: number; error: string }
      > = {
        expired: { status: 410, error: "transfer_expired" },
        revoked: { status: 410, error: "transfer_revoked" },
        deleted: { status: 410, error: "transfer_deleted" },
      };
      const mapped = errorMap[transfer.status] || {
        status: 410,
        error: "transfer_unavailable",
      };
      res
        .status(mapped.status)
        .json({ ok: false, error: mapped.error });
      return;
    }

    const { data: files } = await supabase
      .from("storage_transfer_files")
      .select("size")
      .eq("transfer_id", transfer.id);
    const fileCount = files?.length ?? 0;
    const totalSize =
      files?.reduce((sum, f: any) => sum + (f.size || 0), 0) ?? 0;

    let senderName: string | null = null;
    if (transfer.created_by) {
      const { data: collaborator } = await supabase
        .from("admin_collaborators")
        .select("first_name")
        .eq("id", transfer.created_by)
        .single();
      if (collaborator) {
        senderName = collaborator.first_name;
      }
    }

    if (!transfer.link_opened_at) {
      await supabase
        .from("storage_transfers")
        .update({ link_opened_at: now.toISOString() })
        .eq("id", transfer.id);
    }

    const expiresInSeconds = Math.max(
      0,
      Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
    );

    res.json({
      ok: true,
      transfer: {
        name: transfer.name,
        sender_name: senderName,
        file_count: fileCount,
        total_size: totalSize,
        message: transfer.message,
        expires_in_seconds: expiresInSeconds,
      },
    });
  } catch (err) {
    logPublic.error({ err }, "getTransferMetadata error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

const verifyTransferPasswordHandler: RequestHandler = async (
  req,
  res,
) => {
  try {
    const { code } = req.params;
    if (!code) {
      res.status(400).json({ ok: false, error: "missing_code" });
      return;
    }
    const ip = getClientIp(req);
    const rateLimitKey = `verify:${ip}:${code}`;
    if (isRateLimited(rateLimitKey, 5, 15 * 60 * 1000)) {
      res
        .status(429)
        .json({ ok: false, error: "too_many_attempts" });
      return;
    }

    const { password } = req.body || {};
    if (!password || typeof password !== "string") {
      res
        .status(400)
        .json({ ok: false, error: "missing_password" });
      return;
    }

    const supabase = getAdminSupabase();
    const { data: transfer, error: fetchError } = await supabase
      .from("storage_transfers")
      .select("id, code, password_hash, status, expires_at")
      .eq("code", code)
      .single();
    if (fetchError || !transfer) {
      res
        .status(404)
        .json({ ok: false, error: "transfer_not_found" });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(transfer.expires_at);
    if (expiresAt < now && transfer.status === "active") {
      await supabase
        .from("storage_transfers")
        .update({ status: "expired" })
        .eq("id", transfer.id);
      res
        .status(410)
        .json({ ok: false, error: "transfer_expired" });
      return;
    }
    if (transfer.status !== "active") {
      res
        .status(410)
        .json({ ok: false, error: "transfer_unavailable" });
      return;
    }

    const isValid = await bcrypt.compare(
      password,
      transfer.password_hash,
    );
    if (!isValid) {
      res
        .status(403)
        .json({ ok: false, error: "invalid_password" });
      return;
    }

    const { data: files } = await supabase
      .from("storage_transfer_files")
      .select("id, original_name, mime_type, size")
      .eq("transfer_id", transfer.id);

    const downloadToken = createDownloadToken(transfer.id, code);
    res.json({
      ok: true,
      files: files ?? [],
      download_token: downloadToken,
    });
  } catch (err) {
    logPublic.error({ err }, "verifyTransferPassword error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

const downloadTransferFiles: RequestHandler = async (req, res) => {
  try {
    const { code } = req.params;
    if (!code) {
      res.status(400).json({ ok: false, error: "missing_code" });
      return;
    }
    const { download_token, file_id } = req.body || {};
    if (!download_token || typeof download_token !== "string") {
      res.status(400).json({
        ok: false,
        error: "missing_download_token",
      });
      return;
    }

    const tokenPayload = verifyDownloadToken(download_token);
    if (!tokenPayload) {
      res.status(401).json({
        ok: false,
        error: "invalid_or_expired_token",
      });
      return;
    }
    if (tokenPayload.code !== code) {
      res
        .status(403)
        .json({ ok: false, error: "token_mismatch" });
      return;
    }

    const supabase = getAdminSupabase();
    const transferId = tokenPayload.transfer_id;

    const { data: transfer, error: fetchError } = await supabase
      .from("storage_transfers")
      .select(
        "id, status, expires_at, sender_email, sender_download_notified_at, name, file_count",
      )
      .eq("id", transferId)
      .single();
    if (fetchError || !transfer) {
      res
        .status(404)
        .json({ ok: false, error: "transfer_not_found" });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(transfer.expires_at);
    if (expiresAt < now && transfer.status === "active") {
      await supabase
        .from("storage_transfers")
        .update({ status: "expired" })
        .eq("id", transfer.id);
      res
        .status(410)
        .json({ ok: false, error: "transfer_expired" });
      return;
    }
    if (transfer.status !== "active") {
      res
        .status(410)
        .json({ ok: false, error: "transfer_unavailable" });
      return;
    }

    let filesQuery = supabase
      .from("storage_transfer_files")
      .select("id, original_name, storage_path, size")
      .eq("transfer_id", transferId);
    if (file_id && typeof file_id === "string") {
      filesQuery = filesQuery.eq("id", file_id);
    }

    const { data: files, error: filesError } = await filesQuery;
    if (filesError || !files || files.length === 0) {
      res
        .status(404)
        .json({ ok: false, error: "files_not_found" });
      return;
    }

    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "unknown";
    const downloadType = file_id ? "single" : "all";

    const downloads: Array<{
      file_id: string;
      original_name: string;
      url: string;
      size: number;
    }> = [];

    for (const file of files) {
      const { data: signedData, error: signedError } =
        await supabase.storage
          .from("storage-transfers")
          .createSignedUrl(file.storage_path, 600);
      if (signedError || !signedData?.signedUrl) {
        logPublic.warn(
          { fileId: file.id, error: signedError },
          "Failed to create signed URL",
        );
        continue;
      }
      downloads.push({
        file_id: file.id,
        original_name: file.original_name,
        url: signedData.signedUrl,
        size: file.size,
      });

      // Log download asynchronously
      supabase
        .from("storage_transfer_downloads")
        .insert({
          transfer_id: transferId,
          file_id: file.id,
          ip_address: ip,
          user_agent: userAgent,
          download_type: downloadType,
        })
        .then(({ error: logError }) => {
          if (logError) {
            logPublic.warn(
              { fileId: file.id, error: logError },
              "Failed to log download",
            );
          }
        });
    }

    if (downloads.length === 0) {
      res.status(500).json({
        ok: false,
        error: "signed_url_generation_failed",
      });
      return;
    }

    // Notify sender on first download
    if (
      transfer.sender_email &&
      !transfer.sender_download_notified_at &&
      downloads.length > 0
    ) {
      supabase
        .from("storage_transfers")
        .update({
          sender_download_notified_at: new Date().toISOString(),
        })
        .eq("id", transferId)
        .is("sender_download_notified_at", null)
        .then(({ error: notifUpdateError }) => {
          if (notifUpdateError) {
            logPublic.warn(
              { err: notifUpdateError, transferId },
              "Failed to update sender_download_notified_at",
            );
            return;
          }
          const transferName =
            transfer.name ||
            `Transfert (${transfer.file_count} fichier${transfer.file_count > 1 ? "s" : ""})`;
          sendSAMEmail({
            emailId: `storage-download-notif-${transferId}-${Date.now()}`,
            fromKey: "noreply",
            to: [transfer.sender_email!],
            subject: `Vos fichiers ont été téléchargés — ${transferName}`,
            bodyText: [
              `Bonne nouvelle ! Votre destinataire a téléchargé vos fichiers.`,
              `\nTransfert : ${transferName}`,
              `\nNombre de fichiers : ${transfer.file_count}`,
            ].join("\n"),
          }).catch((emailErr) => {
            logPublic.warn(
              { err: emailErr, transferId },
              "Failed to send download notification to sender",
            );
          });
        });
    }

    res.json({ ok: true, downloads });
  } catch (err) {
    logPublic.error({ err }, "downloadTransferFiles error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

export function registerStorageAdminRoutes(app: Express): void {
  app.post(
    "/api/admin/storage/upload",
    upload.single("file"),
    uploadFile,
  );
  app.post("/api/admin/storage/transfers", createTransfer);
  app.get(
    "/api/admin/storage/transfers/all",
    listAllTransfers,
  );
  app.get("/api/admin/storage/transfers", listMyTransfers);
  app.get(
    "/api/admin/storage/transfers/:id",
    getTransferDetail,
  );
  app.post(
    "/api/admin/storage/transfers/:id/send-email",
    sendTransferEmailHandler,
  );
  app.post(
    "/api/admin/storage/transfers/:id/revoke",
    revokeTransfer,
  );
  app.delete(
    "/api/admin/storage/transfers/:id",
    deleteTransfer,
  );
  app.get("/api/admin/storage/stats", getStorageStats);
}

export function registerStoragePublicRoutes(app: Express): void {
  app.get("/api/storage/t/:code", getTransferMetadata);
  app.post(
    "/api/storage/t/:code/verify",
    verifyTransferPasswordHandler,
  );
  app.post(
    "/api/storage/t/:code/download",
    downloadTransferFiles,
  );
}
