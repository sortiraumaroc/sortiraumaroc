import type { RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { sendSAMEmail } from "../email";

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
      console.error("[submitBugReport] Error:", error);
      res.status(500).json({ error: "Erreur lors de l'envoi du rapport" });
      return;
    }

    // Send email notification to developer team (fire-and-forget)
    sendSAMEmail({
      emailId: `bug-report-${data.id}`,
      fromKey: "noreply",
      to: ["developer@sortiraumaroc.ma"],
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
      console.error("[submitBugReport] Email notification failed:", err);
    });

    res.json({ ok: true, id: data.id });
  } catch (e) {
    console.error("[submitBugReport] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};
