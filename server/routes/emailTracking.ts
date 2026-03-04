import { createHmac } from "crypto";
import type { RequestHandler } from "express";
import type { Express } from "express";

import { getAdminSupabase } from "../supabaseAdmin";
import { zQuery } from "../lib/validate";
import {
  TrackEmailOpenQuery,
  TrackEmailClickQuery,
  TrackEmailUnsubscribeQuery,
} from "../schemas/emailTracking";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isSafeRedirectUrl(url: string): boolean {
  const v = url.trim();
  if (!v) return false;
  if (v.startsWith("/")) return true;
  return /^https?:\/\//i.test(v);
}

function signUnsubToken(args: { email: string; campaignId: string }): string {
  const secret = asString(process.env.EMAIL_UNSUB_SECRET) || asString(process.env.ADMIN_API_KEY) || "dev";
  return createHmac("sha256", secret).update(`${args.email}|${args.campaignId}`).digest("hex");
}

const ONE_BY_ONE_GIF = Buffer.from("R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

export const trackEmailOpen: RequestHandler = async (req, res) => {
  const emailId = asString(req.query.email_id);
  const campaignId = asString(req.query.campaign_id);
  const recipientId = asString(req.query.recipient_id);

  if (emailId) {
    const supabase = getAdminSupabase();

    const ip = asString(req.headers["x-forwarded-for"]) || asString(req.socket.remoteAddress);
    const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;

    await supabase.from("email_events").insert({
      email_id: emailId,
      campaign_id: campaignId || null,
      recipient_id: recipientId || null,
      kind: "open",
      url: null,
      user_agent: userAgent,
      ip: ip || null,
    });

    if (recipientId) {
      await supabase
        .from("email_campaign_recipients")
        .update({ opened_at: new Date().toISOString() })
        .eq("id", recipientId)
        .is("opened_at", null);
    }
  }

  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.status(200).end(ONE_BY_ONE_GIF);
};

export const trackEmailClick: RequestHandler = async (req, res) => {
  const emailId = asString(req.query.email_id);
  const campaignId = asString(req.query.campaign_id);
  const recipientId = asString(req.query.recipient_id);
  const url = asString(req.query.url);

  if (!url || !isSafeRedirectUrl(url)) return res.status(400).send("Invalid url");

  if (emailId) {
    const supabase = getAdminSupabase();

    const ip = asString(req.headers["x-forwarded-for"]) || asString(req.socket.remoteAddress);
    const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;

    await supabase.from("email_events").insert({
      email_id: emailId,
      campaign_id: campaignId || null,
      recipient_id: recipientId || null,
      kind: "click",
      url,
      user_agent: userAgent,
      ip: ip || null,
    });

    if (recipientId) {
      await supabase
        .from("email_campaign_recipients")
        .update({ clicked_at: new Date().toISOString() })
        .eq("id", recipientId)
        .is("clicked_at", null);
    }
  }

  res.redirect(302, url);
};

export const trackEmailUnsubscribe: RequestHandler = async (req, res) => {
  const campaignId = asString(req.query.campaign_id);
  const email = asString(req.query.email).toLowerCase();
  const token = asString(req.query.token);

  if (!campaignId || !email || !token) return res.status(400).send("Missing params");

  const expected = signUnsubToken({ email, campaignId });
  if (token !== expected) return res.status(403).send("Invalid token");

  const supabase = getAdminSupabase();

  await supabase.from("email_unsubscribes").upsert({ email, scope: "marketing" }, { onConflict: "email,scope" });

  await supabase.from("email_events").insert({
    email_id: `unsub:${campaignId}:${email}`,
    campaign_id: campaignId,
    recipient_id: null,
    kind: "unsubscribe",
    url: null,
    user_agent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
    ip: asString(req.headers["x-forwarded-for"]) || asString(req.socket.remoteAddress) || null,
  });

  // Best-effort: mark pending recipients of this campaign as unsubscribed.
  await supabase
    .from("email_campaign_recipients")
    .update({ status: "skipped_unsubscribed" })
    .eq("campaign_id", campaignId)
    .eq("email", email)
    .in("status", ["pending", "sent"]);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Désinscription confirmée</title></head><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f6f7;margin:0;padding:24px;"><div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px;"><h1 style="margin:0 0 8px 0;font-size:18px;">Désinscription confirmée</h1><p style="margin:0;font-size:14px;line-height:1.6;color:#111827;">Vous ne recevrez plus nos campagnes marketing sur <strong>${email.replace(/</g, "&lt;")}</strong>.</p><p style="margin:12px 0 0 0;font-size:13px;line-height:1.6;color:#6b7280;">Les emails transactionnels (réservations, paiements, sécurité) peuvent toujours vous être envoyés.</p></div></body></html>`);
};

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerEmailTrackingRoutes(app: Express) {
  app.get("/api/public/email/open", zQuery(TrackEmailOpenQuery), trackEmailOpen);
  app.get("/api/public/email/click", zQuery(TrackEmailClickQuery), trackEmailClick);
  app.get("/api/public/email/unsubscribe", zQuery(TrackEmailUnsubscribeQuery), trackEmailUnsubscribe);
}
