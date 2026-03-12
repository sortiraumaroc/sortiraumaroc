import type { RequestHandler } from "express";
import express from "express";
import type { Express } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { sendSAMEmail } from "../email";
import { createModuleLogger } from "../lib/logger";
import { createRateLimiter } from "../middleware/rateLimiter";
import { zBody } from "../lib/validate";
import { SubmitBugReportSchema } from "../schemas/bugReports";

const log = createModuleLogger("bugReports");

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeString(v: unknown, maxLen = 10000): string {
  if (typeof v !== "string") return "";
  return v.slice(0, maxLen).trim();
}

/**
 * Submit a bug report (public - no auth required)
 * POST /api/bug-reports
 */
export const submitBugReport: RequestHandler = async (req, res) => {
  try {
    const body = isRecord(req.body) ? req.body : {};

    const url = safeString(body.url, 2000);
    const message = safeString(body.message, 5000);
    const userAgent = safeString(body.userAgent, 500);
    const screenWidth = typeof body.screenWidth === "number" ? body.screenWidth : null;
    const screenHeight = typeof body.screenHeight === "number" ? body.screenHeight : null;
    const timestamp = safeString(body.timestamp, 50);

    // Screenshot can be large (base64 PNG) - limit to 5MB
    const screenshot = safeString(body.screenshot, 5 * 1024 * 1024);

    if (!message) {
      res.status(400).json({ error: "Message requis" });
      return;
    }

    if (!url) {
      res.status(400).json({ error: "URL requis" });
      return;
    }

    // Try to get user ID from auth header if present (optional)
    let userId: string | null = null;
    const authHeader = req.header("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const supabase = getAdminSupabase();
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user) {
        userId = userData.user.id;
      }
    }

    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("bug_reports")
      .insert({
        url,
        message,
        screenshot: screenshot || null,
        user_agent: userAgent || null,
        screen_width: screenWidth,
        screen_height: screenHeight,
        reported_by_user_id: userId,
        reported_at: timestamp || new Date().toISOString(),
        status: "new",
      })
      .select("id")
      .single();

    if (error) {
      log.error({ err: error }, "submitBugReport error");
      res.status(500).json({ error: "Erreur lors de l'envoi du rapport" });
      return;
    }

    // Send email notification to developer team (fire-and-forget)
    sendSAMEmail({
      emailId: `bug-report-${data.id}`,
      fromKey: "noreply",
      to: ["developer@sam.ma"],
      subject: `🐛 Nouveau bug report — ${url}`,
      bodyText: [
        `Un nouveau bug a été signalé sur le site.`,
        ``,
        `**Page :** ${url}`,
        `**Message :** ${message}`,
        ``,
        `**Navigateur :** ${userAgent || "Non renseigné"}`,
        `**Écran :** ${screenWidth ?? "?"}x${screenHeight ?? "?"}`,
        `**Utilisateur :** ${userId ?? "Anonyme"}`,
        `**Date :** ${timestamp || new Date().toISOString()}`,
        ``,
        screenshot ? `📸 Un screenshot a été joint au rapport.` : `Pas de screenshot.`,
      ].join("\n"),
      ctaLabel: "Voir dans l'admin",
      ctaUrl: `https://sam.ma/admin/support`,
    }).catch((err) => {
      log.error({ err }, "Email notification failed");
    });

    res.json({ ok: true, id: data.id });
  } catch (e) {
    log.error({ err: e }, "submitBugReport exception");
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

// ---------------------------------------------------------------------------
// Admin Support Request
// POST /api/admin/support-request
// ---------------------------------------------------------------------------

export const submitAdminSupportRequest: RequestHandler = async (req, res) => {
  try {
    const body = isRecord(req.body) ? req.body : {};

    const page = safeString(body.page, 500);
    const url = safeString(body.url, 2000);
    const message = safeString(body.message, 5000);
    const userAgent = safeString(body.userAgent, 500);
    const screenWidth = typeof body.screenWidth === "number" ? body.screenWidth : null;
    const screenHeight = typeof body.screenHeight === "number" ? body.screenHeight : null;
    const timestamp = safeString(body.timestamp, 50);
    const screenshot = safeString(body.screenshot, 5 * 1024 * 1024);

    if (!message) {
      res.status(400).json({ error: "Message requis" });
      return;
    }

    // Try to get admin identity from session header
    const adminSession = req.header("x-admin-session") || "";
    let adminEmail = "Admin inconnu";
    if (adminSession) {
      try {
        const parsed = JSON.parse(atob(adminSession.split(".")[1] || "{}"));
        adminEmail = parsed?.email || parsed?.sub || "Admin";
      } catch {
        // Ignore parse errors — best-effort
      }
    }

    const supabase = getAdminSupabase();

    // Save to bug_reports table (reuse existing table with [ADMIN SUPPORT] prefix)
    const { data, error } = await supabase
      .from("bug_reports")
      .insert({
        url: url || page,
        message: `[ADMIN SUPPORT] ${message}`,
        screenshot: screenshot || null,
        user_agent: userAgent || null,
        screen_width: screenWidth,
        screen_height: screenHeight,
        reported_at: timestamp || new Date().toISOString(),
        status: "new",
      })
      .select("id")
      .single();

    if (error) {
      log.error({ err: error }, "submitAdminSupportRequest error");
      res.status(500).json({ error: "Erreur lors de l'envoi" });
      return;
    }

    // Send email notification (fire-and-forget)
    sendSAMEmail({
      emailId: `admin-support-${data.id}`,
      fromKey: "noreply",
      to: ["developer@sam.ma"],
      subject: `🔧 Support Admin — ${page || url}`,
      bodyText: [
        `Demande de support du back-office.`,
        ``,
        `**Admin :** ${adminEmail}`,
        `**Page :** ${page || url}`,
        `**Message :** ${message}`,
        ``,
        `**Navigateur :** ${userAgent || "Non renseigné"}`,
        `**Écran :** ${screenWidth ?? "?"}x${screenHeight ?? "?"}`,
        `**Date :** ${timestamp || new Date().toISOString()}`,
        ``,
        screenshot ? `📸 Un screenshot a été joint.` : `Pas de screenshot.`,
      ].join("\n"),
      ctaLabel: "Voir dans l'admin",
      ctaUrl: `https://sam.ma/admin/support`,
    }).catch((err) => {
      log.error({ err }, "Admin support email notification failed");
    });

    // Emit admin notification (non-blocking)
    import("../adminNotifications")
      .then(({ emitAdminNotification }) =>
        emitAdminNotification({
          type: "support_request",
          title: "Demande de support technique",
          body: `${adminEmail} : ${message.slice(0, 200)}`,
          data: { page, reportId: data.id },
        }),
      )
      .catch(() => {});

    res.json({ ok: true, id: data.id });
  } catch (e) {
    log.error({ err: e }, "submitAdminSupportRequest exception");
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerBugReportRoutes(app: Express) {
  app.post("/api/bug-reports", createRateLimiter("bug-reports", { windowMs: 15 * 60 * 1000, maxRequests: 5 }), zBody(SubmitBugReportSchema), submitBugReport);
  // Support request accepts base64 screenshots — higher body limit (5 MB)
  const bigJson = express.json({ limit: "5mb" });
  app.post("/api/admin/support-request", bigJson, createRateLimiter("admin-support", { windowMs: 15 * 60 * 1000, maxRequests: 10 }), submitAdminSupportRequest);
}
