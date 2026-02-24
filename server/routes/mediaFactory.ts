import { createHash, randomBytes } from "node:crypto";

import express from "express";
import type { Express, RequestHandler } from "express";
import multer from "multer";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import { requireAdminKey } from "./admin";
import { zBody, zQuery, zParams, zIdParam } from "../lib/validate";
import {
  UpdateAdminMediaFactoryJobSchema,
  ApproveAdminMediaBriefSchema,
  CreateAdminMediaScheduleSlotSchema,
  AssignAdminDeliverablePartnerSchema,
  ReviewAdminDeliverableSchema,
  SaveProMediaBriefDraftSchema,
  SubmitProMediaBriefSchema,
  SelectProMediaScheduleSlotSchema,
  ConfirmProMediaCheckinSchema,
  UpdatePartnerProfileSchema,
  RequestPartnerInvoiceSchema,
  UpdateAdminInvoiceRequestSchema,
  PublicMediaCheckinSchema,
  CreateAdminPartnerSchema,
  UpdateAdminPartnerSchema,
  UpdateAdminPartnerBillingSchema,
  SendProMessageSchema,
  SendPartnerMessageSchema,
  SendAdminMessageSchema,
  AdminSendMessageWithAttachmentsSchema,
  ProSendMessageWithAttachmentsSchema,
  PartnerSendMessageWithAttachmentsSchema,
  CreateAdminCommunicationLogSchema,
  CreateQuickReplyTemplateSchema,
  UpdateQuickReplyTemplateSchema,
  CreatePartnerBloggerArticleSchema,
  UpdatePartnerBloggerArticleSchema,
  ListAdminMediaJobsQuery,
  ListAdminInvoiceRequestsQuery,
  AdminMediaBriefPdfQuery,
  ListProMediaThreadsQuery,
  ListAdminMediaThreadsQuery,
  ListAdminCommunicationLogsQuery,
  ListQuickReplyTemplatesQuery,
  JobIdParams,
  DeliverableIdParams,
  ThreadIdParams,
  MediaIdParams,
  MediaCheckinTokenParams,
  MessageIdParams,
  MediaEstablishmentIdParams,
  EstablishmentIdJobIdParams,
  EstablishmentIdThreadIdParams,
} from "../schemas/mediaFactory";

const log = createModuleLogger("mediaFactory");
import {
  notifyBriefSubmitted,
  notifyBriefApproved,
  notifyAppointmentConfirmed,
  notifyDeliverableUploaded,
  notifyDeliverableReviewed,
  notifyInvoiceRequested,
  notifyJobDelivered,
} from "../mediaFactoryNotifications";

type ProUser = { id: string; email?: string | null };

type PartnerRole = "camera" | "editor" | "voice" | "blogger" | "photographer";

type MediaJobStatus =
  | "paid_created"
  | "brief_pending"
  | "brief_submitted"
  | "brief_approved"
  | "scheduling"
  | "shoot_confirmed"
  | "checkin_pending"
  | "deliverables_expected"
  | "deliverables_submitted"
  | "deliverables_approved"
  | "editing"
  | "ready_delivery"
  | "scheduled_publish"
  | "delivered"
  | "closed";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asOptionalString(v: unknown): string | null {
  const s = asString(v);
  return s ? s : null;
}

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token && token.trim() ? token.trim() : null;
}

async function getUserFromBearerToken(
  req: Parameters<RequestHandler>[0],
): Promise<ProUser | null> {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return null;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  if (!data.user?.id) return null;
  return { id: data.user.id, email: data.user.email };
}

type MembershipCheck =
  | { ok: true; role: string }
  | { ok: false; status: number; error: string };

async function ensureProMembership(args: {
  userId: string;
  establishmentId: string;
  allowedRoles?: string[];
}): Promise<MembershipCheck> {
  const { userId, establishmentId, allowedRoles } = args;
  if (!userId || !establishmentId)
    return { ok: false as const, status: 400, error: "missing_params" };

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false as const, status: 500, error: error.message };
  const role =
    typeof (data as any)?.role === "string" ? String((data as any).role) : "";
  if (!role) return { ok: false as const, status: 403, error: "not_member" };

  if (allowedRoles && !allowedRoles.includes(role))
    return { ok: false as const, status: 403, error: "insufficient_role" };
  return { ok: true as const, role };
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function newToken(prefix: string): { token: string; token_hash: string } {
  const token = `${prefix}_${randomBytes(24).toString("hex")}`;
  return { token, token_hash: sha256Hex(token) };
}

function getUniverseLabel(universe: unknown): string {
  const u = typeof universe === "string" ? universe.toLowerCase().trim() : "";
  const labels: Record<string, string> = {
    restaurant: "Restaurant",
    restaurants: "Restaurant",
    hebergement: "Hôtel / Hébergement",
    hotel: "Hôtel / Hébergement",
    wellness: "Wellness / Spa",
    spa: "Wellness / Spa",
    hammam: "Wellness / Spa",
    loisir: "Loisirs / Activités",
    loisirs: "Loisirs / Activités",
    sport_bien_etre: "Sport & Bien-être",
    sport: "Sport & Bien-être",
    culture: "Culture / Musée",
    musee: "Culture / Musée",
    shopping: "Shopping / Commerce",
    boutique: "Shopping / Commerce",
  };
  return labels[u] ?? "Établissement";
}

async function insertMediaAudit(args: {
  job_id: string;
  action: string;
  actor_type: "pro" | "partner" | "admin" | "system";
  actor_user_id?: string | null;
  actor_admin_id?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getAdminSupabase();
  await supabase.from("media_audit_logs").insert({
    job_id: args.job_id,
    action: args.action,
    actor_type: args.actor_type,
    actor_user_id: args.actor_user_id ?? null,
    actor_admin_id: args.actor_admin_id ?? null,
    metadata: args.metadata ?? {},
  });
}

function normalizePartnerRole(v: unknown): PartnerRole | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (
    s === "camera" ||
    s === "editor" ||
    s === "voice" ||
    s === "blogger" ||
    s === "photographer"
  )
    return s;
  return null;
}

function normalizeJobStatus(v: unknown): MediaJobStatus | null {
  const s = typeof v === "string" ? v.trim() : "";
  const allowed: MediaJobStatus[] = [
    "paid_created",
    "brief_pending",
    "brief_submitted",
    "brief_approved",
    "scheduling",
    "shoot_confirmed",
    "checkin_pending",
    "deliverables_expected",
    "deliverables_submitted",
    "deliverables_approved",
    "editing",
    "ready_delivery",
    "scheduled_publish",
    "delivered",
    "closed",
  ];
  return (allowed as string[]).includes(s) ? (s as MediaJobStatus) : null;
}

function bucketForDeliverable(role: PartnerRole): string {
  if (role === "camera") return "media-rushs";
  if (role === "editor") return "media-edits";
  if (role === "voice") return "media-voice";
  if (role === "blogger") return "media-blog";
  return "media-photos";
}

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------

export const listAdminMediaFactoryJobs: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status =
    typeof req.query.status === "string" ? req.query.status.trim() : "";
  const establishmentId =
    typeof req.query.establishment_id === "string"
      ? req.query.establishment_id.trim()
      : "";

  const supabase = getAdminSupabase();

  let q = supabase
    .from("media_jobs")
    .select(
      "id,establishment_id,order_id,order_item_id,title,status,responsible_admin_id,created_at,updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (status) q = q.eq("status", status);
  if (establishmentId) q = q.eq("establishment_id", establishmentId);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

export const getAdminMediaFactoryJob: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const jobId = typeof req.params.id === "string" ? req.params.id : "";
  if (!jobId) return res.status(400).json({ error: "missing_job_id" });

  const supabase = getAdminSupabase();

  const [
    jobRes,
    briefRes,
    slotsRes,
    apptRes,
    deliverablesRes,
    threadRes,
    invoiceReqRes,
    commRes,
  ] = await Promise.all([
    supabase.from("media_jobs").select("*").eq("id", jobId).single(),
    supabase.from("media_briefs").select("*").eq("job_id", jobId).maybeSingle(),
    supabase
      .from("media_schedule_slots")
      .select("*")
      .eq("job_id", jobId)
      .order("starts_at", { ascending: true })
      .limit(100),
    supabase
      .from("media_appointments")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle(),
    supabase
      .from("media_deliverables")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("media_threads")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle(),
    supabase
      .from("partner_invoice_requests")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("media_communication_logs")
      .select("*")
      .eq("job_id", jobId)
      .order("occurred_at", { ascending: false })
      .limit(100),
  ]);

  if (jobRes.error)
    return res.status(500).json({ error: jobRes.error.message });
  if (briefRes.error)
    return res.status(500).json({ error: briefRes.error.message });
  if (slotsRes.error)
    return res.status(500).json({ error: slotsRes.error.message });
  if (apptRes.error)
    return res.status(500).json({ error: apptRes.error.message });
  if (deliverablesRes.error)
    return res.status(500).json({ error: deliverablesRes.error.message });
  if (threadRes.error)
    return res.status(500).json({ error: threadRes.error.message });
  if (invoiceReqRes.error)
    return res.status(500).json({ error: invoiceReqRes.error.message });
  if (commRes.error)
    return res.status(500).json({ error: commRes.error.message });

  let messages: any[] = [];
  if (threadRes.data?.id) {
    const msgRes = await supabase
      .from("media_messages")
      .select("*")
      .eq("thread_id", threadRes.data.id)
      .order("created_at", { ascending: true })
      .limit(400);
    if (msgRes.error)
      return res.status(500).json({ error: msgRes.error.message });
    messages = msgRes.data ?? [];
  }

  res.json({
    ok: true,
    job: jobRes.data,
    brief: briefRes.data ?? null,
    schedule_slots: slotsRes.data ?? [],
    appointment: apptRes.data ?? null,
    deliverables: deliverablesRes.data ?? [],
    thread: threadRes.data ?? null,
    messages,
    invoice_requests: invoiceReqRes.data ?? [],
    communication_logs: commRes.data ?? [],
  });
};

export const updateAdminMediaFactoryJob: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const jobId = typeof req.params.id === "string" ? req.params.id : "";
  if (!jobId) return res.status(400).json({ error: "missing_job_id" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const status = normalizeJobStatus((req.body as any).status);
  const responsible_admin_id = asOptionalString(
    (req.body as any).responsible_admin_id,
  );
  const scheduled_publish_at = asOptionalString(
    (req.body as any).scheduled_publish_at,
  );
  const published_links = isRecord((req.body as any).published_links)
    ? (req.body as any).published_links
    : undefined;

  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if ((req.body as any).responsible_admin_id !== undefined)
    patch.responsible_admin_id = responsible_admin_id;
  if ((req.body as any).scheduled_publish_at !== undefined)
    patch.scheduled_publish_at = scheduled_publish_at;
  if (published_links !== undefined) patch.published_links = published_links;

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "no_changes" });

  const supabase = getAdminSupabase();
  const { data: beforeRow } = await supabase
    .from("media_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("media_jobs")
    .update(patch)
    .eq("id", jobId)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await insertMediaAudit({
    job_id: jobId,
    action: "admin.job.update",
    actor_type: "admin",
    actor_admin_id: "admin",
    metadata: { before: beforeRow ?? null, after: data },
  });

  res.json({ ok: true, job: data });
};

export const approveAdminMediaBrief: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const jobId = typeof req.params.id === "string" ? req.params.id : "";
  if (!jobId) return res.status(400).json({ error: "missing_job_id" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const note = asOptionalString((req.body as any).review_note);

  const supabase = getAdminSupabase();

  const { data: brief, error: bErr } = await supabase
    .from("media_briefs")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();
  if (bErr) return res.status(500).json({ error: bErr.message });
  if (!brief) return res.status(404).json({ error: "brief_not_found" });

  if (brief.status !== "submitted")
    return res.status(409).json({ error: "brief_not_submitted" });

  const now = new Date().toISOString();

  const { error: upErr } = await supabase
    .from("media_briefs")
    .update({
      status: "approved",
      approved_at: now,
      review_note: note,
      approved_by_admin_id: "admin",
    })
    .eq("id", brief.id);
  if (upErr) return res.status(500).json({ error: upErr.message });

  const { error: jobErr } = await supabase
    .from("media_jobs")
    .update({ status: "brief_approved" })
    .eq("id", jobId);
  if (jobErr) return res.status(500).json({ error: jobErr.message });

  await insertMediaAudit({
    job_id: jobId,
    action: "admin.brief.approve",
    actor_type: "admin",
    actor_admin_id: "admin",
    metadata: { review_note: note },
  });

  // Notify Pro that their brief was approved (best-effort)
  notifyBriefApproved({ jobId }).catch(() => {});

  res.json({ ok: true });
};

export const createAdminMediaScheduleSlot: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  const jobId = typeof req.params.id === "string" ? req.params.id : "";
  if (!jobId) return res.status(400).json({ error: "missing_job_id" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const starts_at = asString((req.body as any).starts_at);
  const ends_at = asString((req.body as any).ends_at);
  if (!starts_at || !ends_at)
    return res.status(400).json({ error: "missing_time" });

  const location_text = asOptionalString((req.body as any).location_text);
  const address = asOptionalString((req.body as any).address);
  const lat =
    typeof (req.body as any).lat === "number" ? (req.body as any).lat : null;
  const lng =
    typeof (req.body as any).lng === "number" ? (req.body as any).lng : null;

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("media_schedule_slots")
    .insert({
      job_id: jobId,
      starts_at,
      ends_at,
      location_text,
      address,
      lat,
      lng,
      status: "proposed",
      created_by_admin_id: "admin",
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await insertMediaAudit({
    job_id: jobId,
    action: "admin.scheduling.slot_create",
    actor_type: "admin",
    actor_admin_id: "admin",
    metadata: { slot_id: data.id, starts_at, ends_at },
  });

  res.json({ ok: true, slot: data });
};

export const assignAdminDeliverablePartner: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  const deliverableId = typeof req.params.id === "string" ? req.params.id : "";
  if (!deliverableId)
    return res.status(400).json({ error: "missing_deliverable_id" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const partner_user_id = asOptionalString((req.body as any).partner_user_id);

  const supabase = getAdminSupabase();
  const { data: beforeRow } = await supabase
    .from("media_deliverables")
    .select("*")
    .eq("id", deliverableId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("media_deliverables")
    .update({ assigned_partner_user_id: partner_user_id })
    .eq("id", deliverableId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await insertMediaAudit({
    job_id: data.job_id,
    action: "admin.deliverable.assign_partner",
    actor_type: "admin",
    actor_admin_id: "admin",
    metadata: { before: beforeRow ?? null, after: data },
  });

  res.json({ ok: true, deliverable: data });
};

export const reviewAdminDeliverable: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const deliverableId = typeof req.params.id === "string" ? req.params.id : "";
  if (!deliverableId)
    return res.status(400).json({ error: "missing_deliverable_id" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const status = asString((req.body as any).status);
  if (!status || !["in_review", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "invalid_status" });
  }
  const review_comment = asOptionalString((req.body as any).review_comment);

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("media_deliverables")
    .update({ status, review_comment })
    .eq("id", deliverableId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await insertMediaAudit({
    job_id: data.job_id,
    action:
      status === "approved"
        ? "admin.deliverable.approve"
        : status === "rejected"
          ? "admin.deliverable.reject"
          : "admin.deliverable.review",
    actor_type: "admin",
    actor_admin_id: "admin",
    metadata: { deliverable_id: deliverableId, review_comment },
  });

  // Notify Partner about the review result (best-effort)
  if (
    (status === "approved" || status === "rejected") &&
    data.assigned_partner_user_id
  ) {
    notifyDeliverableReviewed({
      jobId: data.job_id,
      deliverableId,
      partnerUserId: data.assigned_partner_user_id,
      role: String(data.role ?? ""),
      status: status as "approved" | "rejected",
      comment: review_comment,
    }).catch(() => {});
  }

  // AUTO-TRANSITION: If all deliverables for this job are approved, advance job to ready_delivery
  if (status === "approved") {
    try {
      const { data: allDeliverables } = await supabase
        .from("media_deliverables")
        .select("id, status")
        .eq("job_id", data.job_id);

      const allApproved =
        (allDeliverables ?? []).length > 0 &&
        (allDeliverables ?? []).every((d: any) => d.status === "approved");

      if (allApproved) {
        // Check current job status to avoid overwriting if already past ready_delivery
        const { data: currentJob } = await supabase
          .from("media_jobs")
          .select("status")
          .eq("id", data.job_id)
          .maybeSingle();

        const advanceable = [
          "deliverables_expected",
          "deliverables_submitted",
          "deliverables_approved",
        ];
        if (
          currentJob &&
          advanceable.includes(String((currentJob as any).status))
        ) {
          await supabase
            .from("media_jobs")
            .update({
              status: "ready_delivery",
              updated_at: new Date().toISOString(),
            })
            .eq("id", data.job_id);

          await insertMediaAudit({
            job_id: data.job_id,
            action: "system.job.auto_ready_delivery",
            actor_type: "system",
            metadata: {
              reason: "all_deliverables_approved",
              deliverable_count: (allDeliverables ?? []).length,
            },
          });

          // Notify Pro that job is ready (best-effort)
          notifyJobDelivered({ jobId: data.job_id }).catch(() => {});
        }
      }
    } catch (err) {
      log.warn({ err }, "deliverable auto-transition failed");
    }
  }

  res.json({ ok: true, deliverable: data });
};

export const createAdminMediaCheckinToken: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  const jobId = typeof req.params.id === "string" ? req.params.id : "";
  if (!jobId) return res.status(400).json({ error: "missing_job_id" });

  const supabase = getAdminSupabase();

  const { token, token_hash } = newToken("checkin");
  const { data, error } = await supabase
    .from("media_checkins")
    .insert({ job_id: jobId, token_hash, expires_at: null })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await insertMediaAudit({
    job_id: jobId,
    action: "admin.checkin.create_token",
    actor_type: "admin",
    actor_admin_id: "admin",
    metadata: { checkin_id: data.id },
  });

  res.json({ ok: true, token });
};

// ---------------------------------------------------------------------------
// Pro
// ---------------------------------------------------------------------------

export const listProMediaJobs: RequestHandler = async (req, res) => {
  const pro = await getUserFromBearerToken(req);
  if (!pro) return res.status(401).json({ error: "unauthorized" });

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  const membership = await ensureProMembership({
    userId: pro.id,
    establishmentId,
  });
  if (membership.ok === false) {
    return res.status(membership.status).json({ error: membership.error });
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("media_jobs")
    .select("id,title,status,created_at,updated_at,order_id,order_item_id")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, items: data ?? [] });
};

export const getProMediaJob: RequestHandler = async (req, res) => {
  const pro = await getUserFromBearerToken(req);
  if (!pro) return res.status(401).json({ error: "unauthorized" });

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  const jobId = typeof req.params.jobId === "string" ? req.params.jobId : "";
  if (!establishmentId || !jobId)
    return res.status(400).json({ error: "missing_params" });

  const membership = await ensureProMembership({
    userId: pro.id,
    establishmentId,
  });
  if (membership.ok === false) {
    return res.status(membership.status).json({ error: membership.error });
  }

  const supabase = getAdminSupabase();

  const [jobRes, briefRes, slotsRes, apptRes, deliverablesRes, threadRes] =
    await Promise.all([
      supabase
        .from("media_jobs")
        .select("*")
        .eq("id", jobId)
        .eq("establishment_id", establishmentId)
        .single(),
      supabase
        .from("media_briefs")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle(),
      supabase
        .from("media_schedule_slots")
        .select("*")
        .eq("job_id", jobId)
        .order("starts_at", { ascending: true })
        .limit(100),
      supabase
        .from("media_appointments")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle(),
      supabase
        .from("media_deliverables")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("media_threads")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle(),
    ]);

  if (jobRes.error)
    return res.status(500).json({ error: jobRes.error.message });
  if (briefRes.error)
    return res.status(500).json({ error: briefRes.error.message });
  if (slotsRes.error)
    return res.status(500).json({ error: slotsRes.error.message });
  if (apptRes.error)
    return res.status(500).json({ error: apptRes.error.message });
  if (deliverablesRes.error)
    return res.status(500).json({ error: deliverablesRes.error.message });
  if (threadRes.error)
    return res.status(500).json({ error: threadRes.error.message });

  let messages: any[] = [];
  if (threadRes.data?.id) {
    const msgRes = await supabase
      .from("media_messages")
      .select("*")
      .eq("thread_id", threadRes.data.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (msgRes.error)
      return res.status(500).json({ error: msgRes.error.message });
    messages = msgRes.data ?? [];
  }

  res.json({
    ok: true,
    job: jobRes.data,
    brief: briefRes.data ?? null,
    schedule_slots: slotsRes.data ?? [],
    appointment: apptRes.data ?? null,
    deliverables: deliverablesRes.data ?? [],
    thread: threadRes.data ?? null,
    messages,
  });
};

export const saveProMediaBriefDraft: RequestHandler = async (req, res) => {
  const pro = await getUserFromBearerToken(req);
  if (!pro) return res.status(401).json({ error: "unauthorized" });

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  const jobId = typeof req.params.jobId === "string" ? req.params.jobId : "";
  if (!establishmentId || !jobId)
    return res.status(400).json({ error: "missing_params" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const membership = await ensureProMembership({
    userId: pro.id,
    establishmentId,
  });
  if (membership.ok === false) {
    return res.status(membership.status).json({ error: membership.error });
  }

  const payload = isRecord((req.body as any).payload)
    ? (req.body as any).payload
    : {};

  const supabase = getAdminSupabase();

  const { data: job, error: jErr } = await supabase
    .from("media_jobs")
    .select("status")
    .eq("id", jobId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();
  if (jErr) return res.status(500).json({ error: jErr.message });
  if (!job) return res.status(404).json({ error: "job_not_found" });

  const { data: brief } = await supabase
    .from("media_briefs")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (
    brief &&
    !["draft", "needs_more"].includes(String((brief as any).status))
  ) {
    return res.status(409).json({ error: "brief_locked" });
  }

  const nextBrief = brief
    ? await supabase
        .from("media_briefs")
        .update({ payload })
        .eq("id", (brief as any).id)
        .select("*")
        .single()
    : await supabase
        .from("media_briefs")
        .insert({ job_id: jobId, status: "draft", payload })
        .select("*")
        .single();

  if (nextBrief.error)
    return res.status(500).json({ error: nextBrief.error.message });

  await insertMediaAudit({
    job_id: jobId,
    action: "pro.brief.save_draft",
    actor_type: "pro",
    actor_user_id: pro.id,
    metadata: { job_status: (job as any).status },
  });

  res.json({ ok: true, brief: nextBrief.data });
};

export const submitProMediaBrief: RequestHandler = async (req, res) => {
  const pro = await getUserFromBearerToken(req);
  if (!pro) return res.status(401).json({ error: "unauthorized" });

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  const jobId = typeof req.params.jobId === "string" ? req.params.jobId : "";
  if (!establishmentId || !jobId)
    return res.status(400).json({ error: "missing_params" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const membership = await ensureProMembership({
    userId: pro.id,
    establishmentId,
  });
  if (membership.ok === false) {
    return res.status(membership.status).json({ error: membership.error });
  }

  const payload = isRecord((req.body as any).payload)
    ? (req.body as any).payload
    : {};

  const supabase = getAdminSupabase();

  const { data: job, error: jErr } = await supabase
    .from("media_jobs")
    .select("status")
    .eq("id", jobId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();
  if (jErr) return res.status(500).json({ error: jErr.message });
  if (!job) return res.status(404).json({ error: "job_not_found" });

  if (
    !["brief_pending", "brief_submitted"].includes(String((job as any).status))
  ) {
    return res.status(409).json({ error: "job_not_in_brief" });
  }

  const now = new Date().toISOString();

  const { data: brief } = await supabase
    .from("media_briefs")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (
    brief &&
    !["draft", "needs_more"].includes(String((brief as any).status))
  ) {
    return res.status(409).json({ error: "brief_locked" });
  }

  const up = brief
    ? await supabase
        .from("media_briefs")
        .update({ payload, status: "submitted", submitted_at: now })
        .eq("id", (brief as any).id)
        .select("*")
        .single()
    : await supabase
        .from("media_briefs")
        .insert({
          job_id: jobId,
          payload,
          status: "submitted",
          submitted_at: now,
        })
        .select("*")
        .single();

  if (up.error) return res.status(500).json({ error: up.error.message });

  const { error: jobErr } = await supabase
    .from("media_jobs")
    .update({ status: "brief_submitted" })
    .eq("id", jobId);
  if (jobErr) return res.status(500).json({ error: jobErr.message });

  await insertMediaAudit({
    job_id: jobId,
    action: "pro.brief.submit",
    actor_type: "pro",
    actor_user_id: pro.id,
  });

  // Send notification to RC (best-effort, don't block response)
  notifyBriefSubmitted({ jobId }).catch(() => {});

  res.json({ ok: true, brief: up.data });
};

export const selectProMediaScheduleSlot: RequestHandler = async (req, res) => {
  const pro = await getUserFromBearerToken(req);
  if (!pro) return res.status(401).json({ error: "unauthorized" });

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  const jobId = typeof req.params.jobId === "string" ? req.params.jobId : "";
  if (!establishmentId || !jobId)
    return res.status(400).json({ error: "missing_params" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const membership = await ensureProMembership({
    userId: pro.id,
    establishmentId,
  });
  if (membership.ok === false) {
    return res.status(membership.status).json({ error: membership.error });
  }

  const slotId = asString((req.body as any).slot_id);
  if (!slotId) return res.status(400).json({ error: "missing_slot_id" });

  const supabase = getAdminSupabase();

  const { data: job, error: jErr } = await supabase
    .from("media_jobs")
    .select("status")
    .eq("id", jobId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();
  if (jErr) return res.status(500).json({ error: jErr.message });
  if (!job) return res.status(404).json({ error: "job_not_found" });

  if (!["scheduling", "brief_approved"].includes(String((job as any).status))) {
    return res.status(409).json({ error: "job_not_schedulable" });
  }

  const { data: slot, error: sErr } = await supabase
    .from("media_schedule_slots")
    .select("*")
    .eq("id", slotId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (sErr) return res.status(500).json({ error: sErr.message });
  if (!slot) return res.status(404).json({ error: "slot_not_found" });
  if (String((slot as any).status) !== "proposed")
    return res.status(409).json({ error: "slot_not_proposed" });

  const now = new Date().toISOString();

  const { error: upSlotErr } = await supabase
    .from("media_schedule_slots")
    .update({
      status: "selected",
      selected_by_user_id: pro.id,
      selected_at: now,
    })
    .eq("id", slotId);
  if (upSlotErr) return res.status(500).json({ error: upSlotErr.message });

  const { data: appt, error: apptErr } = await supabase
    .from("media_appointments")
    .upsert(
      {
        job_id: jobId,
        slot_id: slotId,
        status: "pending_partner",
        created_by_admin_id: null,
      },
      { onConflict: "job_id" },
    )
    .select("*")
    .single();
  if (apptErr) return res.status(500).json({ error: apptErr.message });

  const { error: jobErr } = await supabase
    .from("media_jobs")
    .update({ status: "shoot_confirmed" })
    .eq("id", jobId);
  if (jobErr) return res.status(500).json({ error: jobErr.message });

  await insertMediaAudit({
    job_id: jobId,
    action: "pro.scheduling.select_slot",
    actor_type: "pro",
    actor_user_id: pro.id,
    metadata: { slot_id: slotId, appointment_id: appt.id },
  });

  // Notify Admin + Partners about the confirmed appointment (best-effort)
  notifyAppointmentConfirmed({
    jobId,
    slotId,
    startsAt: String((slot as any).starts_at ?? ""),
    endsAt: String((slot as any).ends_at ?? ""),
    location: (slot as any).location_text ?? (slot as any).address ?? null,
  }).catch(() => {});

  res.json({ ok: true, appointment: appt });
};

export const confirmProMediaCheckin: RequestHandler = async (req, res) => {
  const pro = await getUserFromBearerToken(req);
  if (!pro) return res.status(401).json({ error: "unauthorized" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const token = asString((req.body as any).token);
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = sha256Hex(token);
  const note = asOptionalString((req.body as any).note);

  const supabase = getAdminSupabase();
  const { data: checkin, error } = await supabase
    .from("media_checkins")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!checkin) return res.status(404).json({ error: "checkin_not_found" });

  // Ensure Pro is a member of the establishment tied to the job.
  const { data: job, error: jErr } = await supabase
    .from("media_jobs")
    .select("id,establishment_id,status")
    .eq("id", checkin.job_id)
    .maybeSingle();
  if (jErr) return res.status(500).json({ error: jErr.message });
  if (!job) return res.status(404).json({ error: "job_not_found" });

  const membership = await ensureProMembership({
    userId: pro.id,
    establishmentId: String((job as any).establishment_id),
  });
  if (membership.ok === false) {
    return res.status(membership.status).json({ error: membership.error });
  }

  if ((checkin as any).confirmed_at)
    return res.status(409).json({ error: "already_confirmed" });

  const now = new Date().toISOString();

  const { error: upErr } = await supabase
    .from("media_checkins")
    .update({ pro_user_id: pro.id, confirmed_at: now, note })
    .eq("id", (checkin as any).id);
  if (upErr) return res.status(500).json({ error: upErr.message });

  await insertMediaAudit({
    job_id: String((job as any).id),
    action: "pro.checkin.confirm",
    actor_type: "pro",
    actor_user_id: pro.id,
    metadata: { note },
  });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// PARTNERS
// ---------------------------------------------------------------------------

export const getPartnerMe: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const supabase = getAdminSupabase();

  // Get partner profile
  const { data: profile, error: pErr } = await supabase
    .from("partner_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (pErr) return res.status(500).json({ error: pErr.message });

  // Get billing profile for status
  const { data: billing } = await supabase
    .from("partner_billing_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // Normalize column names for frontend
  const merged = profile
    ? {
        id: profile.user_id,
        user_id: profile.user_id,
        role: profile.primary_role ?? null,
        status: profile.status ?? (profile.active ? "active" : "pending"),
        display_name: profile.display_name ?? null,
        city: profile.city ?? null,
        phone: profile.phone ?? null,
        email: profile.email ?? user.email ?? null,
        avatar_url: profile.avatar_url ?? null,
        // Billing profile fields
        billing_status: billing?.status ?? "pending",
        legal_type: billing?.legal_name ?? null, // legal_name in DB
        company_name: billing?.company_name ?? null,
        rib_iban: billing?.iban ?? billing?.rib ?? null, // iban or rib in DB
        bank_name: billing?.bank_name ?? null,
        created_at: profile.created_at ?? null,
      }
    : null;

  res.json({ ok: true, profile: merged });
};

export const updatePartnerProfile: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const supabase = getAdminSupabase();

  // Check if partner profile exists
  const { data: existing, error: eErr } = await supabase
    .from("partner_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (eErr) return res.status(500).json({ error: eErr.message });
  if (!existing) return res.status(404).json({ error: "profile_not_found" });

  // Update partner profile
  const profileUpdate: Record<string, unknown> = {};
  if (typeof (req.body as any).display_name === "string")
    profileUpdate.display_name =
      asString((req.body as any).display_name) || null;
  if (typeof (req.body as any).city === "string")
    profileUpdate.city = asString((req.body as any).city) || null;
  if (typeof (req.body as any).phone === "string")
    profileUpdate.phone = asString((req.body as any).phone) || null;

  if (Object.keys(profileUpdate).length > 0) {
    const { error: upErr } = await supabase
      .from("partner_profiles")
      .update(profileUpdate)
      .eq("user_id", user.id);
    if (upErr) return res.status(500).json({ error: upErr.message });
  }

  // Update or create billing profile
  const billingUpdate: Record<string, unknown> = {};
  if (typeof (req.body as any).legal_type === "string")
    billingUpdate.legal_name = asString((req.body as any).legal_type) || null;
  if (typeof (req.body as any).company_name === "string")
    billingUpdate.company_name =
      asString((req.body as any).company_name) || null;
  if (typeof (req.body as any).rib_iban === "string")
    billingUpdate.iban =
      asString((req.body as any).rib_iban).toUpperCase() || null;

  if (Object.keys(billingUpdate).length > 0) {
    // Check if billing profile exists
    const { data: existingBilling } = await supabase
      .from("partner_billing_profiles")
      .select("user_id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingBilling) {
      // If IBAN changed and was previously validated, reset to pending
      if (billingUpdate.iban && existingBilling.status === "validated") {
        billingUpdate.status = "pending";
      }
      const { error: bErr } = await supabase
        .from("partner_billing_profiles")
        .update(billingUpdate)
        .eq("user_id", user.id);
      if (bErr) return res.status(500).json({ error: bErr.message });
    } else {
      // Create new billing profile
      const { error: bErr } = await supabase
        .from("partner_billing_profiles")
        .insert({
          user_id: user.id,
          ...billingUpdate,
          status: "pending",
        });
      if (bErr) return res.status(500).json({ error: bErr.message });
    }
  }

  res.json({ ok: true });
};

export const uploadPartnerAvatar: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const supabase = getAdminSupabase();

  // Check if partner profile exists
  const { data: existing } = await supabase
    .from("partner_profiles")
    .select("user_id, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) return res.status(404).json({ error: "profile_not_found" });

  // Get uploaded file from multer
  const file = (req as any).file;

  if (!file || !file.buffer) {
    return res.status(400).json({ error: "no_file" });
  }

  const buffer = file.buffer as Buffer;
  const mimeType = (file.mimetype as string) || "image/jpeg";
  const ext = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
      ? "webp"
      : "jpg";

  // Delete old avatar if exists
  if (existing.avatar_url) {
    try {
      const oldPath = existing.avatar_url.split("/partner-avatars/")[1];
      if (oldPath) {
        await supabase.storage.from("partner-avatars").remove([oldPath]);
      }
    } catch (err) {
      log.warn({ err }, "delete old avatar failed");
    }
  }

  // Upload new avatar
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("partner-avatars")
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    return res.status(500).json({ error: uploadError.message });
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("partner-avatars")
    .getPublicUrl(path);
  const avatarUrl = urlData?.publicUrl ?? null;

  // Update profile with new avatar URL
  const { error: updateError } = await supabase
    .from("partner_profiles")
    .update({ avatar_url: avatarUrl })
    .eq("user_id", user.id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  res.json({ ok: true, avatar_url: avatarUrl });
};

export const deletePartnerAvatar: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const supabase = getAdminSupabase();

  // Get current avatar URL
  const { data: existing } = await supabase
    .from("partner_profiles")
    .select("avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) return res.status(404).json({ error: "profile_not_found" });

  // Delete from storage if exists
  if (existing.avatar_url) {
    try {
      const path = existing.avatar_url.split("/partner-avatars/")[1];
      if (path) {
        await supabase.storage.from("partner-avatars").remove([path]);
      }
    } catch (err) {
      log.warn({ err }, "delete avatar from storage failed");
    }
  }

  // Update profile to remove avatar URL
  const { error: updateError } = await supabase
    .from("partner_profiles")
    .update({ avatar_url: null })
    .eq("user_id", user.id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  res.json({ ok: true });
};

export const listPartnerMissions: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const supabase = getAdminSupabase();

  // A mission exists when at least one deliverable is assigned to the partner.
  const { data, error } = await supabase
    .from("media_deliverables")
    .select(
      "id,job_id,role,deliverable_type,status,current_version,review_comment,created_at,updated_at,media_jobs!inner(id,title,status,establishment_id,meta,establishments(id,name,city,address))",
    )
    .eq("assigned_partner_user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(300);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

export const getPartnerMission: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const jobId = typeof req.params.jobId === "string" ? req.params.jobId : "";
  if (!jobId) return res.status(400).json({ error: "missing_job_id" });

  const supabase = getAdminSupabase();

  const [jobRes, deliverablesRes, billingRes, invoiceReqRes] =
    await Promise.all([
      supabase
        .from("media_jobs")
        .select(
          "id, title, status, establishment_id, meta, establishments(id, name, city, address)",
        )
        .eq("id", jobId)
        .single(),
      supabase
        .from("media_deliverables")
        .select("*")
        .eq("job_id", jobId)
        .eq("assigned_partner_user_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("partner_billing_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("partner_invoice_requests")
        .select("*")
        .eq("job_id", jobId)
        .eq("partner_user_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

  if (jobRes.error)
    return res.status(500).json({ error: jobRes.error.message });
  if (deliverablesRes.error)
    return res.status(500).json({ error: deliverablesRes.error.message });
  if (billingRes.error)
    return res.status(500).json({ error: billingRes.error.message });
  if (invoiceReqRes.error)
    return res.status(500).json({ error: invoiceReqRes.error.message });

  // Hard guard: user must have at least one assigned deliverable in this job.
  if (!(deliverablesRes.data ?? []).length)
    return res.status(403).json({ error: "not_assigned" });

  const deliverableIds = (deliverablesRes.data ?? []).map((d: any) => d.id);
  let files: any[] = [];
  if (deliverableIds.length) {
    const filesRes = await supabase
      .from("media_deliverable_files")
      .select("*")
      .in("deliverable_id", deliverableIds)
      .order("uploaded_at", { ascending: false })
      .limit(300);
    if (filesRes.error)
      return res.status(500).json({ error: filesRes.error.message });
    files = filesRes.data ?? [];
  }

  res.json({
    ok: true,
    job: jobRes.data,
    deliverables: deliverablesRes.data ?? [],
    files,
    billing_profile: billingRes.data ?? null,
    invoice_requests: invoiceReqRes.data ?? [],
  });
};

export const uploadPartnerDeliverableFile: RequestHandler = async (
  req,
  res,
) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const deliverableId =
    typeof req.params.deliverableId === "string"
      ? req.params.deliverableId
      : "";
  if (!deliverableId)
    return res.status(400).json({ error: "missing_deliverable_id" });

  const contentType =
    String(req.header("content-type") ?? "application/octet-stream").trim() ||
    "application/octet-stream";
  const fileName =
    String(req.header("x-file-name") ?? "file.bin").trim() || "file.bin";

  const body = req.body as Buffer;
  if (!body || !(body instanceof Buffer) || body.length === 0)
    return res.status(400).json({ error: "empty_body" });

  const supabase = getAdminSupabase();

  const { data: deliverable, error: dErr } = await supabase
    .from("media_deliverables")
    .select("*")
    .eq("id", deliverableId)
    .maybeSingle();

  if (dErr) return res.status(500).json({ error: dErr.message });
  if (!deliverable)
    return res.status(404).json({ error: "deliverable_not_found" });
  if (String((deliverable as any).assigned_partner_user_id) !== user.id)
    return res.status(403).json({ error: "not_assigned" });

  const role = normalizePartnerRole((deliverable as any).role);
  if (!role) return res.status(400).json({ error: "invalid_role" });

  // Version bump
  const nextVersion = Number((deliverable as any).current_version ?? 0) + 1;

  const bucket = bucketForDeliverable(role);
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "bin";
  const storagePath = `deliverables/${deliverableId}/v${nextVersion}.${String(ext ?? "bin").slice(0, 12)}`;

  const uploadRes = await supabase.storage
    .from(bucket)
    .upload(storagePath, body, {
      contentType,
      upsert: false,
    });

  if (uploadRes.error)
    return res.status(500).json({ error: uploadRes.error.message });

  const { data: fileRow, error: fErr } = await supabase
    .from("media_deliverable_files")
    .insert({
      deliverable_id: deliverableId,
      version: nextVersion,
      bucket,
      path: storagePath,
      mime_type: contentType,
      size_bytes: body.length,
      uploaded_by_user_id: user.id,
    })
    .select("*")
    .single();

  if (fErr) return res.status(500).json({ error: fErr.message });

  const { error: upDelErr } = await supabase
    .from("media_deliverables")
    .update({ status: "submitted", current_version: nextVersion })
    .eq("id", deliverableId);

  if (upDelErr) return res.status(500).json({ error: upDelErr.message });

  await insertMediaAudit({
    job_id: String((deliverable as any).job_id),
    action: "partner.deliverable.upload",
    actor_type: "partner",
    actor_user_id: user.id,
    metadata: {
      deliverable_id: deliverableId,
      version: nextVersion,
      bucket,
      path: storagePath,
      size_bytes: body.length,
    },
  });

  // Notify Admin about the uploaded deliverable (best-effort)
  notifyDeliverableUploaded({
    jobId: String((deliverable as any).job_id),
    deliverableId,
    role: role,
    version: nextVersion,
  }).catch(() => {});

  res.json({ ok: true, file: fileRow });
};

async function computePartnerCost(args: {
  partnerUserId: string;
  role: PartnerRole;
}): Promise<{ amount_cents: number; currency: string }> {
  const supabase = getAdminSupabase();

  const { data: override } = await supabase
    .from("media_cost_overrides")
    .select("amount_cents,currency")
    .eq("partner_user_id", args.partnerUserId)
    .eq("role", args.role)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ovAmount = asInt((override as any)?.amount_cents);
  const ovCurrency = asString((override as any)?.currency);
  if (ovAmount != null && ovCurrency)
    return { amount_cents: Math.max(0, ovAmount), currency: ovCurrency };

  const { data: def } = await supabase
    .from("media_cost_settings")
    .select("amount_cents,currency")
    .eq("role", args.role)
    .maybeSingle();

  const defAmount = asInt((def as any)?.amount_cents) ?? 0;
  const defCurrency = asString((def as any)?.currency) || "MAD";
  return { amount_cents: Math.max(0, defAmount), currency: defCurrency };
}

export const requestPartnerInvoice: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  const jobId = typeof req.params.jobId === "string" ? req.params.jobId : "";
  if (!jobId) return res.status(400).json({ error: "missing_job_id" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const role = normalizePartnerRole((req.body as any).role);
  if (!role) return res.status(400).json({ error: "invalid_role" });

  const supabase = getAdminSupabase();

  const { data: billing, error: bErr } = await supabase
    .from("partner_billing_profiles")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (bErr) return res.status(500).json({ error: bErr.message });

  if (String((billing as any)?.status) !== "validated") {
    return res.status(409).json({ error: "billing_not_validated" });
  }

  // Partner must have an approved deliverable for this job & role.
  const { data: deliv, error: dErr } = await supabase
    .from("media_deliverables")
    .select("id,job_id,status,assigned_partner_user_id")
    .eq("job_id", jobId)
    .eq("assigned_partner_user_id", user.id)
    .eq("role", role)
    .limit(50);

  if (dErr) return res.status(500).json({ error: dErr.message });

  const anyApproved = (deliv ?? []).some(
    (d: any) => String(d.status) === "approved",
  );
  if (!anyApproved) return res.status(409).json({ error: "not_eligible" });

  const { amount_cents, currency } = await computePartnerCost({
    partnerUserId: user.id,
    role,
  });

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("partner_invoice_requests")
    .upsert(
      {
        job_id: jobId,
        partner_user_id: user.id,
        role,
        status: "requested",
        amount_cents,
        currency,
        requested_at: now,
      },
      { onConflict: "job_id,partner_user_id,role" },
    )
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await insertMediaAudit({
    job_id: jobId,
    action: "partner.invoice_request.submit",
    actor_type: "partner",
    actor_user_id: user.id,
    metadata: { role, amount_cents, currency },
  });

  // Notify Compta about the invoice request (best-effort)
  notifyInvoiceRequested({
    jobId,
    partnerUserId: user.id,
    role,
    amountCents: amount_cents,
    currency,
  }).catch(() => {});

  res.json({ ok: true, request: data });
};

// ---------------------------------------------------------------------------
// COMPTA (Admin - Invoice management)
// ---------------------------------------------------------------------------

export const listAdminPartnerInvoiceRequests: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const status = typeof req.query.status === "string" ? req.query.status : "";
  const jobId = typeof req.query.job_id === "string" ? req.query.job_id : "";

  const supabase = getAdminSupabase();

  let query = supabase
    .from("partner_invoice_requests")
    .select(
      `
      *,
      media_jobs(id, title, status, establishment_id, establishments(name, city)),
      partner_profiles(display_name, user_id)
    `,
    )
    .order("requested_at", { ascending: false })
    .limit(500);

  if (status) query = query.eq("status", status);
  if (jobId) query = query.eq("job_id", jobId);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

export const updateAdminInvoiceRequest: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const requestId = typeof req.params.id === "string" ? req.params.id : "";
  if (!requestId) return res.status(400).json({ error: "missing_request_id" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const status = asString((req.body as any).status);
  if (
    !status ||
    !["requested", "approved", "paid", "rejected"].includes(status)
  ) {
    return res.status(400).json({ error: "invalid_status" });
  }

  const supabase = getAdminSupabase();

  // BUSINESS GUARD: Payment blocked without QR check-in
  // For "approved" or "paid" status, verify that the job has a confirmed check-in
  if (status === "approved" || status === "paid") {
    const { data: invoiceReq } = await supabase
      .from("partner_invoice_requests")
      .select("job_id")
      .eq("id", requestId)
      .maybeSingle();

    if (invoiceReq?.job_id) {
      const { data: checkin } = await supabase
        .from("media_checkins")
        .select("confirmed_at")
        .eq("job_id", invoiceReq.job_id)
        .not("confirmed_at", "is", null)
        .limit(1)
        .maybeSingle();

      if (!checkin?.confirmed_at) {
        return res.status(409).json({
          error: "checkin_required",
          message:
            "Le paiement partenaire est bloqué tant que le check-in QR n'a pas été confirmé sur le terrain.",
        });
      }
    }
  }

  const paid_at = status === "paid" ? new Date().toISOString() : null;
  const payment_reference = asOptionalString(
    (req.body as any).payment_reference,
  );

  const updatePayload: Record<string, unknown> = { status };
  if (paid_at) updatePayload.paid_at = paid_at;
  if (payment_reference) updatePayload.payment_reference = payment_reference;

  const { data, error } = await supabase
    .from("partner_invoice_requests")
    .update(updatePayload)
    .eq("id", requestId)
    .select("*, media_jobs(id, title)")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await insertMediaAudit({
    job_id: data.job_id,
    action: `admin.invoice_request.${status}`,
    actor_type: "admin",
    actor_admin_id: "admin",
    metadata: { request_id: requestId, status, payment_reference },
  });

  res.json({ ok: true, request: data });
};

// ---------------------------------------------------------------------------
// PUBLIC (QR Check-in validation - no auth required)
// ---------------------------------------------------------------------------

export const publicMediaCheckin: RequestHandler = async (req, res) => {
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const token = asString((req.body as any).token);
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = sha256Hex(token);
  const note = asOptionalString((req.body as any).note);

  const supabase = getAdminSupabase();
  const { data: checkin, error } = await supabase
    .from("media_checkins")
    .select(
      "*, media_jobs(id, title, status, establishment_id, establishments(name, city))",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!checkin) return res.status(404).json({ error: "checkin_not_found" });

  // Check expiry
  const expiresAt = (checkin as any).expires_at;
  if (expiresAt) {
    const exp = Date.parse(expiresAt);
    if (Number.isFinite(exp) && exp < Date.now()) {
      return res.status(410).json({ error: "token_expired" });
    }
  }

  // If already confirmed, return info
  if ((checkin as any).confirmed_at) {
    const job = (checkin as any).media_jobs ?? {};
    const est = (job as any).establishments ?? {};
    return res.json({
      ok: true,
      already_confirmed: true,
      confirmed_at: (checkin as any).confirmed_at,
      job: {
        id: job.id,
        title: job.title,
        status: job.status,
        establishment_name: est.name ?? null,
        establishment_city: est.city ?? null,
      },
    });
  }

  // Confirm the check-in
  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("media_checkins")
    .update({ confirmed_at: now, note })
    .eq("id", (checkin as any).id);

  if (upErr) return res.status(500).json({ error: upErr.message });

  const job = (checkin as any).media_jobs ?? {};
  const est = (job as any).establishments ?? {};

  // Optionally advance job status if it was waiting for check-in
  if ((job as any).status === "checkin_pending") {
    await supabase
      .from("media_jobs")
      .update({ status: "deliverables_expected", updated_at: now })
      .eq("id", (job as any).id);
  }

  await insertMediaAudit({
    job_id: String((job as any).id),
    action: "public.checkin.confirm",
    actor_type: "system",
    metadata: { note, via: "qr_public" },
  });

  res.json({
    ok: true,
    already_confirmed: false,
    confirmed_at: now,
    job: {
      id: job.id,
      title: job.title,
      status: "deliverables_expected",
      establishment_name: est.name ?? null,
      establishment_city: est.city ?? null,
    },
  });
};

// Public route to get check-in info without confirming
export const getPublicMediaCheckinInfo: RequestHandler = async (req, res) => {
  const token = typeof req.params.token === "string" ? req.params.token : "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = sha256Hex(token);

  const supabase = getAdminSupabase();
  const { data: checkin, error } = await supabase
    .from("media_checkins")
    .select(
      "*, media_jobs(id, title, status, establishment_id, establishments(name, city, address))",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!checkin) return res.status(404).json({ error: "checkin_not_found" });

  const expiresAt = (checkin as any).expires_at;
  const expired = expiresAt ? Date.parse(expiresAt) < Date.now() : false;

  const job = (checkin as any).media_jobs ?? {};
  const est = (job as any).establishments ?? {};

  res.json({
    ok: true,
    expired,
    confirmed: !!(checkin as any).confirmed_at,
    confirmed_at: (checkin as any).confirmed_at ?? null,
    job: {
      id: job.id ?? null,
      title: job.title ?? null,
      status: job.status ?? null,
    },
    establishment: {
      name: est.name ?? null,
      city: est.city ?? null,
      address: est.address ?? null,
    },
  });
};

// ---------------------------------------------------------------------------
// PDF BRIEF GENERATION
// ---------------------------------------------------------------------------

function docToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));
    doc.end();
  });
}

export const generateAdminMediaBriefPdf: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const jobId = typeof req.params.id === "string" ? req.params.id : "";
  if (!jobId) return res.status(400).json({ error: "missing_job_id" });

  const supabase = getAdminSupabase();

  const [jobRes, briefRes, checkinRes, estRes] = await Promise.all([
    supabase.from("media_jobs").select("*").eq("id", jobId).maybeSingle(),
    supabase.from("media_briefs").select("*").eq("job_id", jobId).maybeSingle(),
    supabase
      .from("media_checkins")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("media_jobs")
      .select("establishments(name,city,address,universe)")
      .eq("id", jobId)
      .maybeSingle(),
  ]);

  if (jobRes.error)
    return res.status(500).json({ error: jobRes.error.message });
  if (!jobRes.data) return res.status(404).json({ error: "job_not_found" });

  const job = jobRes.data as any;
  const brief = (briefRes.data ?? {}) as any;
  const checkin = checkinRes.data as any | null;
  const est = ((estRes.data as any)?.establishments ?? {}) as any;

  // Generate a check-in token if none exists
  let checkinToken = "";
  if (checkin) {
    // Reconstruct the token from the hash is not possible, so we just show a placeholder
    // In practice, you'd store the token or regenerate it
    checkinToken = `(Token existant - ID: ${String(checkin.id).slice(0, 8)})`;
  }

  // If user wants fresh token, create one
  const createNewToken = req.query.new_token === "1";
  if (createNewToken || !checkin) {
    const { token, token_hash } = newToken("checkin");
    const { data: newCheckin, error: insErr } = await supabase
      .from("media_checkins")
      .insert({ job_id: jobId, token_hash, expires_at: null })
      .select("*")
      .single();

    if (!insErr && newCheckin) {
      checkinToken = token;
      await insertMediaAudit({
        job_id: jobId,
        action: "admin.checkin.create_token_pdf",
        actor_type: "admin",
        actor_admin_id: "admin",
        metadata: { checkin_id: newCheckin.id },
      });
    }
  }

  // Generate QR code as data URL
  let qrDataUrl = "";
  if (checkinToken && !checkinToken.startsWith("(")) {
    const checkinUrl = `${process.env.VITE_SUPABASE_URL ? "https://sam.ma" : "http://localhost:3000"}/media/checkin?token=${encodeURIComponent(checkinToken)}`;
    try {
      qrDataUrl = await QRCode.toDataURL(checkinUrl, { width: 200, margin: 1 });
    } catch (err) {
      log.warn({ err }, "QR code generation failed");
    }
  }

  // Build PDF
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // Header
  doc
    .fontSize(28)
    .font("Helvetica-Bold")
    .fillColor("#a3001d")
    .text("MEDIA FACTORY", { align: "center" });
  doc.moveDown(0.5);
  doc
    .fontSize(14)
    .font("Helvetica")
    .fillColor("#111827")
    .text("Brief de Production", { align: "center" });
  doc.moveDown();

  // Separator
  doc
    .moveTo(50, doc.y)
    .lineTo(doc.page.width - 50, doc.y)
    .strokeColor("#e5e7eb")
    .lineWidth(1)
    .stroke();
  doc.moveDown();

  // Job info
  doc.fontSize(11).font("Helvetica-Bold").text("Établissement:");
  doc.font("Helvetica").text(`${est.name || "—"} · ${est.city || ""}`);
  doc.moveDown(0.5);

  doc.font("Helvetica-Bold").text("Job:");
  doc
    .font("Helvetica")
    .text(`${job.title || "(sans titre)"} — ID: ${String(job.id).slice(0, 8)}`);
  doc.moveDown(0.5);

  doc.font("Helvetica-Bold").text("Statut:");
  doc.font("Helvetica").text(String(job.status ?? "—"));
  doc.moveDown();

  // Separator
  doc
    .moveTo(50, doc.y)
    .lineTo(doc.page.width - 50, doc.y)
    .strokeColor("#e5e7eb")
    .lineWidth(1)
    .stroke();
  doc.moveDown();

  // Brief payload - Dynamic fields with labels
  const universeLabel = getUniverseLabel(est.universe);
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .fillColor("#a3001d")
    .text(`Brief Client — ${universeLabel}`);
  doc.moveDown(0.5);

  const payload = (brief.payload ?? {}) as Record<string, unknown>;

  // Field key to label mapping (supports both base and universe-specific fields)
  const FIELD_LABELS: Record<string, string> = {
    objectifs: "Objectifs",
    format: "Format souhaité",
    tone: "Tonalité / Style",
    contraintes: "Contraintes",
    references: "Références / Liens",
    // Restaurant
    plats_signature: "Plats signatures",
    ambiance: "Ambiance souhaitée",
    horaires_service: "Meilleur moment",
    specialites: "Spécialités cuisine",
    // Hotel
    categories_chambres: "Catégories de chambres",
    espaces_communs: "Espaces communs",
    vue_highlight: "Vue à mettre en valeur",
    services_premium: "Services premium",
    // Wellness
    soins_phares: "Soins phares",
    espaces_zen: "Espaces zen",
    produits_utilises: "Produits utilisés",
    ambiance_zen: "Type d'ambiance",
    // Loisir
    activites_principales: "Activités à filmer",
    public_cible: "Public cible",
    moments_forts: "Moments forts",
    saisonnalite: "Saisonnalité",
    // Sport
    disciplines: "Disciplines proposées",
    equipements: "Équipements à montrer",
    coachs: "Coachs à mettre en avant",
    // Culture
    collections_phares: "Collections / Œuvres phares",
    architecture: "Points architecturaux",
    parcours_visite: "Parcours de visite",
    // Shopping
    produits_phares: "Produits phares",
    ambiance_boutique: "Ambiance boutique",
    experience_client: "Expérience client",
  };

  doc.fontSize(10).fillColor("#111827");

  // Display all non-empty fields from payload
  const payloadEntries = Object.entries(payload).filter(
    ([, v]) => v && String(v).trim(),
  );
  for (const [key, value] of payloadEntries) {
    const label =
      FIELD_LABELS[key] ??
      key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    doc.font("Helvetica-Bold").text(`${label}:`);
    doc.font("Helvetica").text(String(value ?? "—") || "—");
    doc.moveDown(0.3);
  }

  if (payloadEntries.length === 0) {
    doc.font("Helvetica").text("Aucune information renseignée dans le brief.");
  }

  doc.moveDown();

  // Separator
  doc
    .moveTo(50, doc.y)
    .lineTo(doc.page.width - 50, doc.y)
    .strokeColor("#e5e7eb")
    .lineWidth(1)
    .stroke();
  doc.moveDown();

  // QR Check-in section
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .fillColor("#a3001d")
    .text("QR Check-in");
  doc.moveDown(0.5);

  doc.fontSize(10).font("Helvetica").fillColor("#111827");
  if (qrDataUrl) {
    doc.text("Scannez ce QR code à l'arrivée sur le lieu du shooting:");
    doc.moveDown(0.5);

    // Embed QR image
    const qrBuffer = Buffer.from(
      qrDataUrl.replace(/^data:image\/png;base64,/, ""),
      "base64",
    );
    doc.image(qrBuffer, { width: 140, align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(8).text(`Token: ${checkinToken}`, { align: "center" });
  } else {
    doc.text("Aucun token QR généré. Utilisez ?new_token=1 pour en créer un.");
  }

  doc.moveDown();

  // Footer
  const footerY = doc.page.height - 60;
  doc
    .fontSize(8)
    .fillColor("#6b7280")
    .text(
      `SAM MEDIA FACTORY — Généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`,
      50,
      footerY,
      { width: doc.page.width - 100, align: "center" },
    );

  const buffer = await docToBuffer(doc);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="brief-${String(job.id).slice(0, 8)}.pdf"`,
  );
  res.send(buffer);
};

// ---------------------------------------------------------------------------
// ADMIN PARTNER MANAGEMENT
// ---------------------------------------------------------------------------

export const listAdminPartners: RequestHandler = async (req, res) => {
  log.info({ method: req.method, path: req.path }, "listAdminPartners called");
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("partner_profiles")
    .select(
      `
      *,
      partner_billing_profiles(status, legal_name, rib)
    `,
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

export const getAdminPartner: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  if (!userId) return res.status(400).json({ error: "missing_user_id" });

  const supabase = getAdminSupabase();

  const [profileRes, billingRes, deliverablesRes] = await Promise.all([
    supabase
      .from("partner_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("partner_billing_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("media_deliverables")
      .select("id, job_id, role, status, media_jobs(id, title, status)")
      .eq("assigned_partner_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (profileRes.error)
    return res.status(500).json({ error: profileRes.error.message });
  if (!profileRes.data)
    return res.status(404).json({ error: "partner_not_found" });

  res.json({
    ok: true,
    profile: profileRes.data,
    billing: billingRes.data ?? null,
    deliverables: deliverablesRes.data ?? [],
  });
};

export const createAdminPartner: RequestHandler = async (req, res) => {
  log.info({ method: req.method, path: req.path }, "createAdminPartner called");
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body)) {
    log.warn("createAdminPartner invalid_body");
    return res.status(400).json({ error: "invalid_body" });
  }

  const email = asString((req.body as any).email).toLowerCase();
  const password = asString((req.body as any).password);
  const display_name = asString((req.body as any).display_name);
  const primary_role = normalizePartnerRole((req.body as any).primary_role);
  const phone = asOptionalString((req.body as any).phone);
  const city = asOptionalString((req.body as any).city);
  const notes = asOptionalString((req.body as any).notes);

  if (!email || !email.includes("@"))
    return res.status(400).json({ error: "invalid_email" });
  if (!password || password.length < 6)
    return res.status(400).json({ error: "password_too_short" });
  if (!display_name)
    return res.status(400).json({ error: "display_name_required" });
  if (!primary_role) return res.status(400).json({ error: "invalid_role" });

  const supabase = getAdminSupabase();

  // Create Supabase auth user
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) return res.status(400).json({ error: authError.message });
  if (!authData.user?.id)
    return res.status(500).json({ error: "user_creation_failed" });

  const userId = authData.user.id;

  // Create partner profile
  const { data: profile, error: profileError } = await supabase
    .from("partner_profiles")
    .insert({
      user_id: userId,
      email,
      display_name,
      primary_role,
      phone,
      city,
      notes,
      active: true,
    })
    .select("*")
    .single();

  if (profileError) {
    // Rollback: delete auth user if profile creation fails
    await supabase.auth.admin.deleteUser(userId);
    return res.status(500).json({ error: profileError.message });
  }

  // Create empty billing profile
  await supabase.from("partner_billing_profiles").insert({
    user_id: userId,
    status: "pending",
  });

  res.json({ ok: true, profile });
};

export const updateAdminPartner: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  if (!userId) return res.status(400).json({ error: "missing_user_id" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const patch: Record<string, unknown> = {};

  if ((req.body as any).display_name !== undefined) {
    patch.display_name = asString((req.body as any).display_name);
  }
  if ((req.body as any).primary_role !== undefined) {
    const role = normalizePartnerRole((req.body as any).primary_role);
    if (!role) return res.status(400).json({ error: "invalid_role" });
    patch.primary_role = role;
  }
  if ((req.body as any).phone !== undefined)
    patch.phone = asOptionalString((req.body as any).phone);
  if ((req.body as any).city !== undefined)
    patch.city = asOptionalString((req.body as any).city);
  if ((req.body as any).notes !== undefined)
    patch.notes = asOptionalString((req.body as any).notes);

  // Handle status field (pending, active, paused, disabled)
  if ((req.body as any).status !== undefined) {
    const status = asString((req.body as any).status);
    if (!["pending", "active", "paused", "disabled"].includes(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }
    patch.status = status;
    // Keep active in sync for backwards compatibility
    patch.active = status === "active";
  }
  // Legacy support for active boolean
  if (
    (req.body as any).active !== undefined &&
    (req.body as any).status === undefined
  ) {
    patch.active = !!(req.body as any).active;
    patch.status = patch.active ? "active" : "pending";
  }

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "no_changes" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("partner_profiles")
    .update(patch)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, profile: data });
};

export const updateAdminPartnerBilling: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  if (!userId) return res.status(400).json({ error: "missing_user_id" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const status = asString((req.body as any).status);
  if (
    status &&
    !["pending", "submitted", "validated", "rejected"].includes(status)
  ) {
    return res.status(400).json({ error: "invalid_status" });
  }

  const patch: Record<string, unknown> = {};

  if (status) patch.status = status;
  if ((req.body as any).legal_name !== undefined)
    patch.legal_name = asOptionalString((req.body as any).legal_name);
  if ((req.body as any).company_name !== undefined)
    patch.company_name = asOptionalString((req.body as any).company_name);
  if ((req.body as any).ice !== undefined)
    patch.ice = asOptionalString((req.body as any).ice);
  if ((req.body as any).address !== undefined)
    patch.address = asOptionalString((req.body as any).address);
  if ((req.body as any).bank_name !== undefined)
    patch.bank_name = asOptionalString((req.body as any).bank_name);
  if ((req.body as any).rib !== undefined)
    patch.rib = asOptionalString((req.body as any).rib);
  if ((req.body as any).iban !== undefined)
    patch.iban = asOptionalString((req.body as any).iban);
  if ((req.body as any).swift !== undefined)
    patch.swift = asOptionalString((req.body as any).swift);
  if ((req.body as any).account_holder !== undefined)
    patch.account_holder = asOptionalString((req.body as any).account_holder);

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "no_changes" });

  const supabase = getAdminSupabase();

  // Upsert billing profile
  const { data, error } = await supabase
    .from("partner_billing_profiles")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, billing: data });
};

// ---------------------------------------------------------------------------
// MESSAGING SYSTEM
// Controlled messaging: Pro ↔ RC ↔ PARTNER with full admin visibility
// ---------------------------------------------------------------------------

type MessageRole = "pro" | "partner" | "rc" | "admin";

function normalizeMessageRole(v: unknown): MessageRole | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "pro" || s === "partner" || s === "rc" || s === "admin") return s;
  return null;
}

function normalizeMessageTopic(
  v: unknown,
): "general" | "scheduling" | "deliverables" | "billing" {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "scheduling" || s === "deliverables" || s === "billing") return s;
  return "general";
}

// Get user role for a thread
async function getUserThreadRole(
  userId: string,
  threadId: string,
): Promise<MessageRole | null> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("media_thread_participants")
    .select("role")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  return normalizeMessageRole(data?.role);
}

// Ensure thread exists for a job, create if needed
async function ensureThreadForJob(jobId: string): Promise<string | null> {
  const supabase = getAdminSupabase();

  // Check if thread exists
  const { data: existing } = await supabase
    .from("media_threads")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existing?.id) return existing.id;

  // Create thread
  const { data: newThread, error } = await supabase
    .from("media_threads")
    .insert({ job_id: jobId, status: "open" })
    .select("id")
    .single();

  if (error) return null;
  return newThread?.id ?? null;
}

// Add participant to thread
async function ensureThreadParticipant(
  threadId: string,
  userId: string,
  role: MessageRole,
): Promise<void> {
  const supabase = getAdminSupabase();
  await supabase
    .from("media_thread_participants")
    .upsert(
      { thread_id: threadId, user_id: userId, role, can_write: true },
      { onConflict: "thread_id,user_id" },
    );
}

// ---------------------------------------------------------------------------
// Pro MESSAGING
// ---------------------------------------------------------------------------

export const listProMessageThreads: RequestHandler = async (req, res) => {
  const pro = await getUserFromBearerToken(req);
  if (!pro) return res.status(401).json({ error: "unauthorized" });

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  if (!establishmentId)
    return res.status(400).json({ error: "missing_establishment_id" });

  const jobId = typeof req.query.job_id === "string" ? req.query.job_id : "";

  const membership = await ensureProMembership({
    userId: pro.id,
    establishmentId,
  });
  if (membership.ok === false) {
    return res.status(membership.status).json({ error: membership.error });
  }

  const supabase = getAdminSupabase();

  // Get all threads for this establishment's jobs
  let query = supabase
    .from("media_threads")
    .select(
      `
      id,
      job_id,
      status,
      created_at,
      media_jobs!inner(id, title, status, establishment_id)
    `,
    )
    .eq("media_jobs.establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(100);

  // Filter by job_id if provided
  if (jobId) {
    query = query.eq("job_id", jobId);
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  // Get unread counts
  const threadIds = (data ?? []).map((t: any) => t.id);
  let unreadCounts: Record<string, number> = {};

  if (threadIds.length > 0) {
    const { data: messages } = await supabase
      .from("media_messages")
      .select("id, thread_id")
      .in("thread_id", threadIds)
      .eq("is_internal", false);

    const messageIds = (messages ?? []).map((m: any) => m.id);

    if (messageIds.length > 0) {
      const { data: reads } = await supabase
        .from("media_message_reads")
        .select("message_id")
        .in("message_id", messageIds)
        .eq("user_id", pro.id);

      const readIds = new Set((reads ?? []).map((r: any) => r.message_id));

      for (const msg of messages ?? []) {
        if (!readIds.has(msg.id)) {
          unreadCounts[msg.thread_id] = (unreadCounts[msg.thread_id] || 0) + 1;
        }
      }
    }
  }

  // Enrich with unread counts
  const items = (data ?? []).map((t: any) => ({
    ...t,
    unread_count: unreadCounts[t.id] || 0,
  }));

  res.json({ ok: true, items });
};

export const getProThreadMessages: RequestHandler = async (req, res) => {
  const pro = await getUserFromBearerToken(req);
  if (!pro) return res.status(401).json({ error: "unauthorized" });

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";
  if (!establishmentId || !threadId)
    return res.status(400).json({ error: "missing_params" });

  const membership = await ensureProMembership({
    userId: pro.id,
    establishmentId,
  });
  if (membership.ok === false) {
    return res.status(membership.status).json({ error: membership.error });
  }

  const supabase = getAdminSupabase();

  // Verify thread belongs to this establishment
  const { data: thread } = await supabase
    .from("media_threads")
    .select("id, job_id, status, media_jobs!inner(establishment_id)")
    .eq("id", threadId)
    .maybeSingle();

  if (
    !thread ||
    (thread as any).media_jobs?.establishment_id !== establishmentId
  ) {
    return res.status(404).json({ error: "thread_not_found" });
  }

  // Get messages (exclude internal messages)
  const { data: messages, error } = await supabase
    .from("media_messages")
    .select("*")
    .eq("thread_id", threadId)
    .eq("is_internal", false)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });

  // Get attachments for messages
  const messageIds = (messages ?? []).map((m: any) => m.id);
  const attachmentsByMessage = await getAttachmentsForMessages(
    supabase,
    messageIds,
  );

  // Mark messages as read BEFORE getting receipts (so current user's read is included)
  const msgIds = (messages ?? []).map((m: any) => m.id);
  if (msgIds.length > 0) {
    const now = new Date().toISOString();
    await supabase.from("media_message_reads").upsert(
      msgIds.map((id: string) => ({
        message_id: id,
        user_id: pro.id,
        read_at: now,
      })),
      { onConflict: "message_id,user_id" },
    );
  }

  // Get read receipts for all messages (for "Vu" display)
  const readReceiptsByMessage = await getReadReceiptsForMessages(
    supabase,
    messageIds,
  );

  // Merge attachments and read receipts into messages
  const messagesWithAttachments = (messages ?? []).map((m: any) => ({
    ...m,
    attachments: attachmentsByMessage[m.id] ?? [],
    read_receipts: readReceiptsByMessage[m.id] ?? [],
  }));

  // Get participants
  const { data: participants } = await supabase
    .from("media_thread_participants")
    .select("user_id, role, partner_profiles(display_name, avatar_url)")
    .eq("thread_id", threadId);

  // Get communication logs
  const { data: commLogs } = await supabase
    .from("media_communication_logs")
    .select("*")
    .eq("thread_id", threadId)
    .order("log_date", { ascending: true });

  res.json({
    ok: true,
    thread,
    messages: messagesWithAttachments,
    participants: participants ?? [],
    communication_logs: commLogs ?? [],
  });
};

export const sendProMessage: RequestHandler = async (req, res) => {
  const pro = await getUserFromBearerToken(req);
  if (!pro) return res.status(401).json({ error: "unauthorized" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";
  if (!establishmentId || !threadId)
    return res.status(400).json({ error: "missing_params" });

  const membership = await ensureProMembership({
    userId: pro.id,
    establishmentId,
  });
  if (membership.ok === false) {
    return res.status(membership.status).json({ error: membership.error });
  }

  const body = asString((req.body as any).body);
  const topic = normalizeMessageTopic((req.body as any).topic);

  if (!body) return res.status(400).json({ error: "empty_message" });

  const supabase = getAdminSupabase();

  // Verify thread belongs to this establishment
  const { data: thread } = await supabase
    .from("media_threads")
    .select("id, job_id, status, media_jobs!inner(establishment_id)")
    .eq("id", threadId)
    .maybeSingle();

  if (
    !thread ||
    (thread as any).media_jobs?.establishment_id !== establishmentId
  ) {
    return res.status(404).json({ error: "thread_not_found" });
  }

  if (thread.status === "closed") {
    return res.status(409).json({ error: "thread_closed" });
  }

  // Ensure Pro is a participant
  await ensureThreadParticipant(threadId, pro.id, "pro");

  // Pro can ONLY send to RC (controlled messaging)
  const { data: msg, error } = await supabase
    .from("media_messages")
    .insert({
      thread_id: threadId,
      sender_type: "pro",
      sender_user_id: pro.id,
      author_role: "pro",
      recipient_role: "rc", // Pro messages always go to RC
      body,
      topic,
      is_internal: false,
      is_system: false,
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await insertMediaAudit({
    job_id: thread.job_id,
    action: "pro.message.send",
    actor_type: "pro",
    actor_user_id: pro.id,
    metadata: { thread_id: threadId, topic },
  });

  // Create notifications for participants (async, non-blocking)
  notifyThreadParticipantsOnMessage({
    threadId,
    jobId: thread.job_id,
    messageId: msg.id,
    senderUserId: pro.id,
    senderType: "pro",
    isInternal: false,
    messagePreview: body,
  }).catch(() => {}); // Best effort, ignore errors

  res.json({ ok: true, message: msg });
};

// ---------------------------------------------------------------------------
// PARTNER MESSAGING
// ---------------------------------------------------------------------------

export const listPartnerMessageThreads: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const supabase = getAdminSupabase();

  // Get threads where partner has assigned deliverables
  const { data: deliverables } = await supabase
    .from("media_deliverables")
    .select("job_id")
    .eq("assigned_partner_user_id", user.id);

  const jobIds = [...new Set((deliverables ?? []).map((d: any) => d.job_id))];

  if (jobIds.length === 0) {
    return res.json({ ok: true, items: [] });
  }

  const { data, error } = await supabase
    .from("media_threads")
    .select(
      `
      id,
      job_id,
      status,
      created_at,
      media_jobs!inner(id, title, status, meta, establishments(name, city))
    `,
    )
    .in("job_id", jobIds)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  // Get unread counts
  const threadIds = (data ?? []).map((t: any) => t.id);
  let unreadCounts: Record<string, number> = {};

  if (threadIds.length > 0) {
    const { data: messages } = await supabase
      .from("media_messages")
      .select("id, thread_id")
      .in("thread_id", threadIds)
      .eq("is_internal", false);

    const messageIds = (messages ?? []).map((m: any) => m.id);

    if (messageIds.length > 0) {
      const { data: reads } = await supabase
        .from("media_message_reads")
        .select("message_id")
        .in("message_id", messageIds)
        .eq("user_id", user.id);

      const readIds = new Set((reads ?? []).map((r: any) => r.message_id));

      for (const msg of messages ?? []) {
        if (!readIds.has(msg.id)) {
          unreadCounts[msg.thread_id] = (unreadCounts[msg.thread_id] || 0) + 1;
        }
      }
    }
  }

  const items = (data ?? []).map((t: any) => ({
    ...t,
    unread_count: unreadCounts[t.id] || 0,
  }));

  res.json({ ok: true, items });
};

export const getPartnerThreadMessages: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";
  if (!threadId) return res.status(400).json({ error: "missing_thread_id" });

  const supabase = getAdminSupabase();

  // Verify partner has access (has deliverable assigned for this job)
  const { data: thread } = await supabase
    .from("media_threads")
    .select("id, job_id, status")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return res.status(404).json({ error: "thread_not_found" });

  const { data: deliverable } = await supabase
    .from("media_deliverables")
    .select("id")
    .eq("job_id", thread.job_id)
    .eq("assigned_partner_user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!deliverable) return res.status(403).json({ error: "not_assigned" });

  // Get messages (exclude internal messages)
  const { data: messages, error } = await supabase
    .from("media_messages")
    .select("*")
    .eq("thread_id", threadId)
    .eq("is_internal", false)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });

  // Get attachments for messages
  const messageIds = (messages ?? []).map((m: any) => m.id);
  const attachmentsByMessage = await getAttachmentsForMessages(
    supabase,
    messageIds,
  );

  // Mark messages as read BEFORE getting receipts (so current user's read is included)
  const msgIds = (messages ?? []).map((m: any) => m.id);
  if (msgIds.length > 0) {
    const now = new Date().toISOString();
    await supabase.from("media_message_reads").upsert(
      msgIds.map((id: string) => ({
        message_id: id,
        user_id: user.id,
        read_at: now,
      })),
      { onConflict: "message_id,user_id" },
    );
  }

  // Get read receipts for all messages (for "Vu" display)
  const readReceiptsByMessage = await getReadReceiptsForMessages(
    supabase,
    messageIds,
  );

  // Merge attachments and read receipts into messages
  const messagesWithAttachments = (messages ?? []).map((m: any) => ({
    ...m,
    attachments: attachmentsByMessage[m.id] ?? [],
    read_receipts: readReceiptsByMessage[m.id] ?? [],
  }));

  // Get participants
  const { data: participants } = await supabase
    .from("media_thread_participants")
    .select("user_id, role, partner_profiles(display_name, avatar_url)")
    .eq("thread_id", threadId);

  res.json({
    ok: true,
    thread,
    messages: messagesWithAttachments,
    participants: participants ?? [],
  });
};

export const sendPartnerMessage: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";
  if (!threadId) return res.status(400).json({ error: "missing_thread_id" });

  const body = asString((req.body as any).body);
  const topic = normalizeMessageTopic((req.body as any).topic);

  if (!body) return res.status(400).json({ error: "empty_message" });

  const supabase = getAdminSupabase();

  // Verify partner has access
  const { data: thread } = await supabase
    .from("media_threads")
    .select("id, job_id, status")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return res.status(404).json({ error: "thread_not_found" });

  const { data: deliverable } = await supabase
    .from("media_deliverables")
    .select("id")
    .eq("job_id", thread.job_id)
    .eq("assigned_partner_user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!deliverable) return res.status(403).json({ error: "not_assigned" });

  if (thread.status === "closed") {
    return res.status(409).json({ error: "thread_closed" });
  }

  // Ensure partner is a participant
  await ensureThreadParticipant(threadId, user.id, "partner");

  // PARTNER can ONLY send to RC (controlled messaging)
  const { data: msg, error } = await supabase
    .from("media_messages")
    .insert({
      thread_id: threadId,
      sender_type: "partner",
      sender_user_id: user.id,
      author_role: "partner",
      recipient_role: "rc", // Partner messages always go to RC
      body,
      topic,
      is_internal: false,
      is_system: false,
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await insertMediaAudit({
    job_id: thread.job_id,
    action: "partner.message.send",
    actor_type: "partner",
    actor_user_id: user.id,
    metadata: { thread_id: threadId, topic },
  });

  // Create notifications for participants (async, non-blocking)
  notifyThreadParticipantsOnMessage({
    threadId,
    jobId: thread.job_id,
    messageId: msg.id,
    senderUserId: user.id,
    senderType: "partner",
    isInternal: false,
    messagePreview: body,
  }).catch(() => {}); // Best effort, ignore errors

  res.json({ ok: true, message: msg });
};

// ---------------------------------------------------------------------------
// ADMIN MESSAGING (Full access)
// ---------------------------------------------------------------------------

export const listAdminMessageThreads: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const jobId = typeof req.query.job_id === "string" ? req.query.job_id : "";
  const status = typeof req.query.status === "string" ? req.query.status : "";

  const supabase = getAdminSupabase();

  let query = supabase
    .from("media_threads")
    .select(
      `
      id,
      job_id,
      status,
      created_at,
      media_jobs(
        id, title, status, responsible_admin_id,
        establishments(name, city)
      )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (jobId) query = query.eq("job_id", jobId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Get unread counts (for RC/Admin = all messages)
  const threadIds = (data ?? []).map((t: any) => t.id);
  let messageCounts: Record<string, { total: number; unread: number }> = {};

  if (threadIds.length > 0) {
    const { data: messages } = await supabase
      .from("media_messages")
      .select("id, thread_id, created_at")
      .in("thread_id", threadIds);

    for (const msg of messages ?? []) {
      if (!messageCounts[msg.thread_id]) {
        messageCounts[msg.thread_id] = { total: 0, unread: 0 };
      }
      messageCounts[msg.thread_id].total++;
    }
  }

  const items = (data ?? []).map((t: any) => ({
    ...t,
    message_count: messageCounts[t.id]?.total ?? 0,
  }));

  res.json({ ok: true, items });
};

export const getAdminThreadMessages: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";
  if (!threadId) return res.status(400).json({ error: "missing_thread_id" });

  const supabase = getAdminSupabase();

  const { data: thread } = await supabase
    .from("media_threads")
    .select(
      `
      id, job_id, status, created_at, closed_at, closed_by,
      media_jobs(id, title, status, responsible_admin_id, establishments(id, name, city, address))
    `,
    )
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return res.status(404).json({ error: "thread_not_found" });

  // Admin sees ALL messages (including internal)
  const { data: messages, error } = await supabase
    .from("media_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });

  // Get attachments for messages
  const messageIds = (messages ?? []).map((m: any) => m.id);
  const attachmentsByMessage = await getAttachmentsForMessages(
    supabase,
    messageIds,
  );

  // Get read receipts for all messages (for "Vu" display)
  const readReceiptsByMessage = await getReadReceiptsForMessages(
    supabase,
    messageIds,
  );

  // Merge attachments and read receipts into messages
  const messagesWithAttachments = (messages ?? []).map((m: any) => ({
    ...m,
    attachments: attachmentsByMessage[m.id] ?? [],
    read_receipts: readReceiptsByMessage[m.id] ?? [],
  }));

  // Get participants
  const { data: participants } = await supabase
    .from("media_thread_participants")
    .select(
      "user_id, role, can_write, partner_profiles(display_name, avatar_url, primary_role)",
    )
    .eq("thread_id", threadId);

  // Get communication logs
  const { data: commLogs } = await supabase
    .from("media_communication_logs")
    .select("*")
    .eq("job_id", thread.job_id)
    .order("log_date", { ascending: true });

  res.json({
    ok: true,
    thread,
    messages: messagesWithAttachments,
    participants: participants ?? [],
    communication_logs: commLogs ?? [],
  });
};

export const sendAdminMessage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";
  if (!threadId) return res.status(400).json({ error: "missing_thread_id" });

  const body = asString((req.body as any).body);
  const topic = normalizeMessageTopic((req.body as any).topic);
  const recipientRole =
    normalizeMessageRole((req.body as any).recipient_role) ?? "all";
  const isInternal = !!(req.body as any).is_internal;
  const authorRole =
    normalizeMessageRole((req.body as any).author_role) ?? "rc";

  if (!body) return res.status(400).json({ error: "empty_message" });

  const supabase = getAdminSupabase();

  const { data: thread } = await supabase
    .from("media_threads")
    .select("id, job_id, status")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return res.status(404).json({ error: "thread_not_found" });

  // Admin/RC can send to anyone
  const { data: msg, error } = await supabase
    .from("media_messages")
    .insert({
      thread_id: threadId,
      sender_type: "admin",
      sender_admin_id: "admin",
      author_role: authorRole,
      recipient_role: recipientRole,
      body,
      topic,
      is_internal: isInternal,
      is_system: false,
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await insertMediaAudit({
    job_id: thread.job_id,
    action: "admin.message.send",
    actor_type: "admin",
    actor_admin_id: "admin",
    metadata: {
      thread_id: threadId,
      topic,
      recipient_role: recipientRole,
      is_internal: isInternal,
    },
  });

  // Create notifications for participants (async, non-blocking)
  notifyThreadParticipantsOnMessage({
    threadId,
    jobId: thread.job_id,
    messageId: msg.id,
    senderType: "admin",
    isInternal,
    messagePreview: body,
  }).catch(() => {}); // Best effort, ignore errors

  res.json({ ok: true, message: msg });
};

export const closeAdminThread: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";
  if (!threadId) return res.status(400).json({ error: "missing_thread_id" });

  const supabase = getAdminSupabase();

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("media_threads")
    .update({ status: "closed", closed_at: now })
    .eq("id", threadId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await insertMediaAudit({
    job_id: data.job_id,
    action: "admin.thread.close",
    actor_type: "admin",
    actor_admin_id: "admin",
    metadata: { thread_id: threadId },
  });

  res.json({ ok: true, thread: data });
};

export const reopenAdminThread: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";
  if (!threadId) return res.status(400).json({ error: "missing_thread_id" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("media_threads")
    .update({ status: "open", closed_at: null, closed_by: null })
    .eq("id", threadId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await insertMediaAudit({
    job_id: data.job_id,
    action: "admin.thread.reopen",
    actor_type: "admin",
    actor_admin_id: "admin",
    metadata: { thread_id: threadId },
  });

  res.json({ ok: true, thread: data });
};

// ---------------------------------------------------------------------------
// COMMUNICATION LOGS (External journal)
// ---------------------------------------------------------------------------

export const createAdminCommunicationLog: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const jobId = typeof req.params.jobId === "string" ? req.params.jobId : "";
  if (!jobId) return res.status(400).json({ error: "missing_job_id" });

  const channel = asString((req.body as any).channel);
  const summary = asString((req.body as any).summary);
  const nextAction = asOptionalString((req.body as any).next_action);
  const participants = Array.isArray((req.body as any).participants)
    ? (req.body as any).participants
    : [];
  const logDate =
    asOptionalString((req.body as any).log_date) ?? new Date().toISOString();

  if (
    !channel ||
    !["phone", "whatsapp", "email", "meeting", "other"].includes(channel)
  ) {
    return res.status(400).json({ error: "invalid_channel" });
  }
  if (!summary) return res.status(400).json({ error: "summary_required" });

  const supabase = getAdminSupabase();

  // Get thread for this job
  const threadId = await ensureThreadForJob(jobId);

  const { data, error } = await supabase
    .from("media_communication_logs")
    .insert({
      job_id: jobId,
      thread_id: threadId,
      created_by_admin_id: "admin",
      method: channel,
      channel,
      summary,
      next_action: nextAction,
      participants,
      log_date: logDate,
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Insert a system message to make the log visible in the thread
  if (threadId) {
    const channelLabels: Record<string, string> = {
      phone: "Appel téléphonique",
      whatsapp: "WhatsApp",
      email: "Email",
      meeting: "Réunion",
      other: "Autre",
    };

    await supabase.from("media_messages").insert({
      thread_id: threadId,
      sender_type: "system",
      sender_admin_id: "admin",
      author_role: "rc",
      body: `📌 Journal externe ajouté — ${channelLabels[channel] || channel}: ${summary.slice(0, 100)}${summary.length > 100 ? "..." : ""}`,
      topic: "general",
      is_internal: false,
      is_system: true,
    });
  }

  await insertMediaAudit({
    job_id: jobId,
    action: "admin.communication_log.create",
    actor_type: "admin",
    actor_admin_id: "admin",
    metadata: { log_id: data.id, channel, summary: summary.slice(0, 200) },
  });

  res.json({ ok: true, log: data });
};

export const listAdminCommunicationLogs: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const jobId = typeof req.query.job_id === "string" ? req.query.job_id : "";

  const supabase = getAdminSupabase();

  let query = supabase
    .from("media_communication_logs")
    .select("*, media_jobs(id, title, establishments(name))")
    .order("log_date", { ascending: false })
    .limit(200);

  if (jobId) query = query.eq("job_id", jobId);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

// ---------------------------------------------------------------------------
// MARK THREAD AS READ - explicit POST endpoints
// ---------------------------------------------------------------------------

// Pro: Mark thread as read
export const markProThreadRead: RequestHandler = async (req, res) => {
  const pro = await getUserFromBearerToken(req);
  if (!pro) return res.status(401).json({ error: "unauthorized" });

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";

  if (!establishmentId || !threadId) {
    return res.status(400).json({ error: "missing_params" });
  }

  const membership = await ensureProMembership({
    userId: pro.id,
    establishmentId,
  });
  if (membership.ok === false) {
    return res.status(membership.status).json({ error: membership.error });
  }

  const supabase = getAdminSupabase();

  // Verify thread belongs to this establishment
  const { data: thread } = await supabase
    .from("media_threads")
    .select("id, job_id, media_jobs!inner(establishment_id)")
    .eq("id", threadId)
    .maybeSingle();

  if (
    !thread ||
    (thread as any).media_jobs?.establishment_id !== establishmentId
  ) {
    return res.status(404).json({ error: "thread_not_found" });
  }

  // Get all non-internal messages in thread
  const { data: messages } = await supabase
    .from("media_messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("is_internal", false);

  const msgIds = (messages ?? []).map((m: any) => m.id);

  if (msgIds.length > 0) {
    const now = new Date().toISOString();
    await supabase.from("media_message_reads").upsert(
      msgIds.map((id: string) => ({
        message_id: id,
        user_id: pro.id,
        read_at: now,
      })),
      { onConflict: "message_id,user_id" },
    );
  }

  res.json({ ok: true, marked_read: msgIds.length });
};

// Partner: Mark thread as read
export const markPartnerThreadRead: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";
  if (!threadId) return res.status(400).json({ error: "missing_thread_id" });

  const supabase = getAdminSupabase();

  // Verify partner has access
  const { data: thread } = await supabase
    .from("media_threads")
    .select("id, job_id")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return res.status(404).json({ error: "thread_not_found" });

  const { data: deliverable } = await supabase
    .from("media_deliverables")
    .select("id")
    .eq("job_id", thread.job_id)
    .eq("assigned_partner_user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!deliverable) return res.status(403).json({ error: "not_assigned" });

  // Get all non-internal messages in thread
  const { data: messages } = await supabase
    .from("media_messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("is_internal", false);

  const msgIds = (messages ?? []).map((m: any) => m.id);

  if (msgIds.length > 0) {
    const now = new Date().toISOString();
    await supabase.from("media_message_reads").upsert(
      msgIds.map((id: string) => ({
        message_id: id,
        user_id: user.id,
        read_at: now,
      })),
      { onConflict: "message_id,user_id" },
    );
  }

  res.json({ ok: true, marked_read: msgIds.length });
};

// Admin: Mark thread as read (for RC tracking)
export const markAdminThreadRead: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";
  if (!threadId) return res.status(400).json({ error: "missing_thread_id" });

  const supabase = getAdminSupabase();

  // Verify thread exists
  const { data: thread } = await supabase
    .from("media_threads")
    .select("id")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return res.status(404).json({ error: "thread_not_found" });

  // Get all messages in thread (admin sees internal too)
  const { data: messages } = await supabase
    .from("media_messages")
    .select("id")
    .eq("thread_id", threadId);

  const msgIds = (messages ?? []).map((m: any) => m.id);

  if (msgIds.length > 0) {
    const now = new Date().toISOString();
    // For admin, we use a special admin user ID marker
    await supabase.from("media_message_reads").upsert(
      msgIds.map((id: string) => ({
        message_id: id,
        user_id: "admin",
        read_at: now,
      })),
      { onConflict: "message_id,user_id" },
    );
  }

  res.json({ ok: true, marked_read: msgIds.length });
};

// ---------------------------------------------------------------------------
// POLISH PREMIUM - UNREAD COUNT
// Global unread count for badges in navbars
// ---------------------------------------------------------------------------

export const getProUnreadCount: RequestHandler = async (req, res) => {
  const pro = await getUserFromBearerToken(req);
  if (!pro) return res.status(401).json({ error: "unauthorized" });

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  if (!establishmentId)
    return res.status(400).json({ error: "missing_establishment_id" });

  const membership = await ensureProMembership({
    userId: pro.id,
    establishmentId,
  });
  if (membership.ok === false) {
    return res.status(membership.status).json({ error: membership.error });
  }

  const supabase = getAdminSupabase();

  // Get threads for this establishment
  const { data: threads } = await supabase
    .from("media_threads")
    .select("id, media_jobs!inner(establishment_id)")
    .eq("media_jobs.establishment_id", establishmentId);

  const threadIds = (threads ?? []).map((t: any) => t.id);

  if (threadIds.length === 0) {
    return res.json({ ok: true, unread_count: 0, per_thread: {} });
  }

  // Get all non-internal messages
  const { data: messages } = await supabase
    .from("media_messages")
    .select("id, thread_id")
    .in("thread_id", threadIds)
    .eq("is_internal", false);

  const messageIds = (messages ?? []).map((m: any) => m.id);

  if (messageIds.length === 0) {
    return res.json({ ok: true, unread_count: 0, per_thread: {} });
  }

  // Get read messages
  const { data: reads } = await supabase
    .from("media_message_reads")
    .select("message_id")
    .in("message_id", messageIds)
    .eq("user_id", pro.id);

  const readIds = new Set((reads ?? []).map((r: any) => r.message_id));

  let totalUnread = 0;
  const perThread: Record<string, number> = {};

  for (const msg of messages ?? []) {
    if (!readIds.has(msg.id)) {
      totalUnread++;
      perThread[msg.thread_id] = (perThread[msg.thread_id] || 0) + 1;
    }
  }

  res.json({ ok: true, unread_count: totalUnread, per_thread: perThread });
};

export const getPartnerUnreadCount: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const supabase = getAdminSupabase();

  // Get jobs where partner is assigned
  const { data: deliverables } = await supabase
    .from("media_deliverables")
    .select("job_id")
    .eq("assigned_partner_user_id", user.id);

  const jobIds = [...new Set((deliverables ?? []).map((d: any) => d.job_id))];

  if (jobIds.length === 0) {
    return res.json({ ok: true, unread_count: 0, per_thread: {} });
  }

  // Get threads for these jobs
  const { data: threads } = await supabase
    .from("media_threads")
    .select("id")
    .in("job_id", jobIds);

  const threadIds = (threads ?? []).map((t: any) => t.id);

  if (threadIds.length === 0) {
    return res.json({ ok: true, unread_count: 0, per_thread: {} });
  }

  // Get all non-internal messages
  const { data: messages } = await supabase
    .from("media_messages")
    .select("id, thread_id")
    .in("thread_id", threadIds)
    .eq("is_internal", false);

  const messageIds = (messages ?? []).map((m: any) => m.id);

  if (messageIds.length === 0) {
    return res.json({ ok: true, unread_count: 0, per_thread: {} });
  }

  // Get read messages
  const { data: reads } = await supabase
    .from("media_message_reads")
    .select("message_id")
    .in("message_id", messageIds)
    .eq("user_id", user.id);

  const readIds = new Set((reads ?? []).map((r: any) => r.message_id));

  let totalUnread = 0;
  const perThread: Record<string, number> = {};

  for (const msg of messages ?? []) {
    if (!readIds.has(msg.id)) {
      totalUnread++;
      perThread[msg.thread_id] = (perThread[msg.thread_id] || 0) + 1;
    }
  }

  res.json({ ok: true, unread_count: totalUnread, per_thread: perThread });
};

// ---------------------------------------------------------------------------
// POLISH PREMIUM - IN-APP NOTIFICATIONS (Bell icon)
// ---------------------------------------------------------------------------

export const getProNotifications: RequestHandler = async (req, res) => {
  const pro = await getUserFromBearerToken(req);
  if (!pro) return res.status(401).json({ error: "unauthorized" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("media_notifications")
    .select("*")
    .eq("user_id", pro.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });

  const unreadCount = (data ?? []).filter((n: any) => !n.read_at).length;

  res.json({ ok: true, items: data ?? [], unread_count: unreadCount });
};

export const getPartnerNotifications: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("media_notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });

  const unreadCount = (data ?? []).filter((n: any) => !n.read_at).length;

  res.json({ ok: true, items: data ?? [], unread_count: unreadCount });
};

export const markNotificationRead: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const notificationId = typeof req.params.id === "string" ? req.params.id : "";
  if (!notificationId)
    return res.status(400).json({ error: "missing_notification_id" });

  const supabase = getAdminSupabase();

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("media_notifications")
    .update({ read_at: now })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

export const markAllNotificationsRead: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const supabase = getAdminSupabase();

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("media_notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// Suppression d'une notification partner
export const deletePartnerNotification: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const notificationId = typeof req.params.id === "string" ? req.params.id : "";
  if (!notificationId)
    return res.status(400).json({ error: "missing_notification_id" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("media_notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Not found" });

  res.json({ ok: true });
};

// Admin notifications
export const getAdminNotifications: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  // For admin, we check the admin_notifications table (existing)
  const { data, error } = await supabase
    .from("admin_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });

  const unreadCount = (data ?? []).filter((n: any) => !n.read_at).length;

  res.json({ ok: true, items: data ?? [], unread_count: unreadCount });
};

// ---------------------------------------------------------------------------
// POLISH PREMIUM - QUICK REPLY TEMPLATES (Admin/RC only)
// ---------------------------------------------------------------------------

export const listQuickReplyTemplates: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const category =
    typeof req.query.category === "string" ? req.query.category : "";
  const activeOnly = req.query.active_only !== "false";

  const supabase = getAdminSupabase();

  let query = supabase
    .from("media_quick_reply_templates")
    .select("*")
    .order("category", { ascending: true })
    .order("label", { ascending: true });

  if (activeOnly) query = query.eq("is_active", true);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

export const createQuickReplyTemplate: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const code = asString((req.body as any).code);
  const label = asString((req.body as any).label);
  const body = asString((req.body as any).body);
  const category = asString((req.body as any).category) || "general";
  const variables = Array.isArray((req.body as any).variables)
    ? (req.body as any).variables
    : [];

  if (!code) return res.status(400).json({ error: "code_required" });
  if (!label) return res.status(400).json({ error: "label_required" });
  if (!body) return res.status(400).json({ error: "body_required" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("media_quick_reply_templates")
    .insert({
      code,
      label,
      body,
      category,
      variables,
      is_active: true,
      created_by_admin_id: "admin",
    })
    .select("*")
    .single();

  if (error) {
    if (
      error.message.includes("unique") ||
      error.message.includes("duplicate")
    ) {
      return res.status(409).json({ error: "code_exists" });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, template: data });
};

export const updateQuickReplyTemplate: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const templateId = typeof req.params.id === "string" ? req.params.id : "";
  if (!templateId)
    return res.status(400).json({ error: "missing_template_id" });

  const patch: Record<string, unknown> = {};

  if ((req.body as any).code !== undefined)
    patch.code = asString((req.body as any).code);
  if ((req.body as any).label !== undefined)
    patch.label = asString((req.body as any).label);
  if ((req.body as any).body !== undefined)
    patch.body = asString((req.body as any).body);
  if ((req.body as any).category !== undefined)
    patch.category = asString((req.body as any).category);
  if (
    (req.body as any).variables !== undefined &&
    Array.isArray((req.body as any).variables)
  ) {
    patch.variables = (req.body as any).variables;
  }
  if ((req.body as any).is_active !== undefined)
    patch.is_active = !!(req.body as any).is_active;

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "no_changes" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("media_quick_reply_templates")
    .update(patch)
    .eq("id", templateId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, template: data });
};

export const deleteQuickReplyTemplate: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const templateId = typeof req.params.id === "string" ? req.params.id : "";
  if (!templateId)
    return res.status(400).json({ error: "missing_template_id" });

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("media_quick_reply_templates")
    .delete()
    .eq("id", templateId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// POLISH PREMIUM - READ RECEIPTS
// Get read receipts for a message (for "Vu à HH:MM" display)
// ---------------------------------------------------------------------------

export const getMessageReadReceipts: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const messageId =
    typeof req.params.messageId === "string" ? req.params.messageId : "";
  if (!messageId) return res.status(400).json({ error: "missing_message_id" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("media_message_reads")
    .select("user_id, read_at")
    .eq("message_id", messageId)
    .order("read_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, reads: data ?? [] });
};

// Helper to create notification for a user
export async function createMediaNotification(args: {
  userId: string;
  jobId?: string;
  threadId?: string;
  messageId?: string;
  type:
    | "new_message"
    | "mention"
    | "job_update"
    | "deliverable_update"
    | "appointment_update"
    | "system";
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getAdminSupabase();
  await supabase.from("media_notifications").insert({
    user_id: args.userId,
    job_id: args.jobId ?? null,
    thread_id: args.threadId ?? null,
    message_id: args.messageId ?? null,
    type: args.type,
    title: args.title,
    body: args.body ?? null,
    data: args.data ?? {},
  });
}

// Helper to notify thread participants about a new message
// - Excludes sender
// - Excludes Pro/Partner if is_internal=true
async function notifyThreadParticipantsOnMessage(args: {
  threadId: string;
  jobId: string;
  messageId: string;
  senderUserId?: string;
  senderType: "admin" | "pro" | "partner";
  isInternal: boolean;
  messagePreview: string;
}): Promise<void> {
  const {
    threadId,
    jobId,
    messageId,
    senderUserId,
    senderType,
    isInternal,
    messagePreview,
  } = args;
  const supabase = getAdminSupabase();

  // Get job info for title
  const { data: job } = await supabase
    .from("media_jobs")
    .select("title, establishment_id, establishments(name)")
    .eq("id", jobId)
    .maybeSingle();

  const jobTitle = (job as any)?.title ?? "Mission";
  const estName = (job as any)?.establishments?.name ?? "";

  // Get participants
  const { data: participants } = await supabase
    .from("media_thread_participants")
    .select("user_id, role")
    .eq("thread_id", threadId);

  if (!participants || participants.length === 0) return;

  // Determine notification title based on sender
  const senderLabel =
    senderType === "admin"
      ? "Responsable Client"
      : senderType === "pro"
        ? "Client Pro"
        : "Partenaire";

  const title = `Nouveau message de ${senderLabel}`;

  // Create notifications for each eligible participant
  for (const participant of participants) {
    // Skip the sender
    if (
      participant.user_id === senderUserId ||
      (senderType === "admin" && !senderUserId && participant.role === "rc")
    ) {
      continue;
    }

    // If internal, skip Pro and Partner
    if (
      isInternal &&
      (participant.role === "pro" || participant.role === "partner")
    ) {
      continue;
    }

    await createMediaNotification({
      userId: participant.user_id,
      jobId,
      threadId,
      messageId,
      type: "new_message",
      title,
      body:
        messagePreview.length > 100
          ? messagePreview.slice(0, 100) + "…"
          : messagePreview,
      data: { jobTitle, estName },
    });
  }

  // Also get Pro users from establishment for notifications (they're not always in participants)
  if (senderType !== "pro" && !isInternal) {
    const estId = (job as any)?.establishment_id;
    if (estId) {
      const { data: proMembers } = await supabase
        .from("pro_establishment_memberships")
        .select("user_id")
        .eq("establishment_id", estId);

      for (const member of proMembers ?? []) {
        // Check if already a participant (to avoid duplicate notifications)
        const isParticipant = participants.some(
          (p) => p.user_id === member.user_id,
        );
        if (isParticipant) continue;

        await createMediaNotification({
          userId: member.user_id,
          jobId,
          threadId,
          messageId,
          type: "new_message",
          title,
          body:
            messagePreview.length > 100
              ? messagePreview.slice(0, 100) + "…"
              : messagePreview,
          data: { jobTitle, estName },
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// MESSAGE ATTACHMENTS
// ---------------------------------------------------------------------------

// Allowed file types: images + PDF only (per user request)
const ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024; // 15 MB max
const MAX_ATTACHMENTS_PER_MESSAGE = 5; // Max 5 files per message

export interface AttachmentInput {
  base64Data: string;
  mimeType: string;
  originalName: string;
  width?: number;
  height?: number;
}

async function uploadMessageAttachment(
  supabase: ReturnType<typeof getAdminSupabase>,
  messageId: string,
  attachment: AttachmentInput,
  uploadedByUserId?: string,
): Promise<{ ok: true; attachment: any } | { ok: false; error: string }> {
  const { base64Data, mimeType, originalName, width, height } = attachment;

  if (!ALLOWED_ATTACHMENT_TYPES.includes(mimeType)) {
    return { ok: false, error: "invalid_mime_type" };
  }

  // Decode base64
  const buffer = Buffer.from(base64Data, "base64");

  if (buffer.length > MAX_ATTACHMENT_SIZE) {
    return { ok: false, error: "file_too_large" };
  }

  // Generate unique path
  const ext = originalName.split(".").pop() || "bin";
  const uniqueId = randomBytes(16).toString("hex");
  const path = `${messageId}/${uniqueId}.${ext}`;

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from("media-message-attachments")
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    log.error({ err: uploadError }, "uploadMessageAttachment storage error");
    return { ok: false, error: "upload_failed" };
  }

  // Insert attachment record
  const { data: attachmentRecord, error: insertError } = await supabase
    .from("media_message_attachments")
    .insert({
      message_id: messageId,
      bucket: "media-message-attachments",
      path,
      original_name: originalName,
      mime_type: mimeType,
      size_bytes: buffer.length,
      width: width ?? null,
      height: height ?? null,
      uploaded_by_user_id: uploadedByUserId ?? null,
    })
    .select("*")
    .single();

  if (insertError) {
    // Try to clean up uploaded file
    await supabase.storage.from("media-message-attachments").remove([path]);
    log.error({ err: insertError }, "uploadMessageAttachment insert error");
    return { ok: false, error: "db_insert_failed" };
  }

  return { ok: true, attachment: attachmentRecord };
}

// Get signed URL for an attachment
export const getAttachmentUrl: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  // Allow either authenticated user or admin key
  const isAdmin = !user && requireAdminKey(req, res);
  if (!user && !isAdmin) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const attachmentId = typeof req.params.id === "string" ? req.params.id : "";
  if (!attachmentId)
    return res.status(400).json({ error: "missing_attachment_id" });

  const supabase = getAdminSupabase();

  // Get attachment info
  const { data: attachment, error } = await supabase
    .from("media_message_attachments")
    .select("*, media_messages!inner(thread_id)")
    .eq("id", attachmentId)
    .maybeSingle();

  if (error || !attachment) {
    return res.status(404).json({ error: "attachment_not_found" });
  }

  // If user (not admin), verify access
  if (user && !isAdmin) {
    const threadId = (attachment as any).media_messages?.thread_id;
    if (!threadId) {
      return res.status(403).json({ error: "access_denied" });
    }

    // Check Pro access
    const { data: thread } = await supabase
      .from("media_threads")
      .select("job_id, media_jobs!inner(establishment_id)")
      .eq("id", threadId)
      .maybeSingle();

    if (thread) {
      const estId = (thread as any).media_jobs?.establishment_id;
      if (estId) {
        const { data: membership } = await supabase
          .from("pro_establishment_memberships")
          .select("id")
          .eq("user_id", user.id)
          .eq("establishment_id", estId)
          .maybeSingle();

        if (!membership) {
          // Check partner access
          const { data: deliverable } = await supabase
            .from("media_deliverables")
            .select("id")
            .eq("job_id", thread.job_id)
            .eq("assigned_partner_user_id", user.id)
            .maybeSingle();

          if (!deliverable) {
            return res.status(403).json({ error: "access_denied" });
          }
        }
      }
    }
  }

  // Generate signed URL (1 hour expiry)
  const { data: signedUrlData, error: signError } = await supabase.storage
    .from(attachment.bucket)
    .createSignedUrl(attachment.path, 3600);

  if (signError || !signedUrlData?.signedUrl) {
    return res.status(500).json({ error: "failed_to_generate_url" });
  }

  res.json({
    ok: true,
    url: signedUrlData.signedUrl,
    attachment: {
      id: attachment.id,
      original_name: attachment.original_name,
      mime_type: attachment.mime_type,
      size_bytes: attachment.size_bytes,
      width: attachment.width,
      height: attachment.height,
    },
  });
};

// Get attachments for a message
export const getMessageAttachments: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  const isAdmin = !user && requireAdminKey(req, res);
  if (!user && !isAdmin) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const messageId =
    typeof req.params.messageId === "string" ? req.params.messageId : "";
  if (!messageId) return res.status(400).json({ error: "missing_message_id" });

  const supabase = getAdminSupabase();

  // Get message and verify access
  const { data: message } = await supabase
    .from("media_messages")
    .select("id, thread_id")
    .eq("id", messageId)
    .maybeSingle();

  if (!message) {
    return res.status(404).json({ error: "message_not_found" });
  }

  // If user (not admin), verify access to thread
  if (user && !isAdmin) {
    const { data: thread } = await supabase
      .from("media_threads")
      .select("job_id, media_jobs!inner(establishment_id)")
      .eq("id", message.thread_id)
      .maybeSingle();

    if (!thread) {
      return res.status(403).json({ error: "access_denied" });
    }

    const estId = (thread as any).media_jobs?.establishment_id;
    if (estId) {
      const { data: membership } = await supabase
        .from("pro_establishment_memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("establishment_id", estId)
        .maybeSingle();

      if (!membership) {
        const { data: deliverable } = await supabase
          .from("media_deliverables")
          .select("id")
          .eq("job_id", thread.job_id)
          .eq("assigned_partner_user_id", user.id)
          .maybeSingle();

        if (!deliverable) {
          return res.status(403).json({ error: "access_denied" });
        }
      }
    }
  }

  // Get attachments
  const { data: attachments, error } = await supabase
    .from("media_message_attachments")
    .select("*")
    .eq("message_id", messageId)
    .order("uploaded_at", { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Generate signed URLs for all attachments
  const attachmentsWithUrls = await Promise.all(
    (attachments ?? []).map(async (att: any) => {
      const { data: signedUrlData } = await supabase.storage
        .from(att.bucket)
        .createSignedUrl(att.path, 3600);

      return {
        ...att,
        url: signedUrlData?.signedUrl ?? null,
      };
    }),
  );

  res.json({ ok: true, attachments: attachmentsWithUrls });
};

// Admin: Send message with attachments
export const adminSendMessageWithAttachments: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";
  if (!threadId) return res.status(400).json({ error: "missing_thread_id" });

  const body = asString((req.body as any).body);
  const topic = normalizeMessageTopic((req.body as any).topic);
  const isInternal = !!(req.body as any).is_internal;
  const recipientRole = asOptionalString((req.body as any).recipient_role);
  const attachments: AttachmentInput[] = Array.isArray(
    (req.body as any).attachments,
  )
    ? (req.body as any).attachments
    : [];

  // Allow empty body if there are attachments
  if (!body && attachments.length === 0) {
    return res.status(400).json({ error: "message_or_attachment_required" });
  }

  // Validate max attachments
  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return res.status(400).json({
      error: "too_many_attachments",
      message: `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} fichiers par message`,
    });
  }

  const supabase = getAdminSupabase();

  // Verify thread exists and get job info
  const { data: thread } = await supabase
    .from("media_threads")
    .select("id, job_id, status")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return res.status(404).json({ error: "thread_not_found" });
  if (thread.status === "closed")
    return res.status(409).json({ error: "thread_closed" });

  // Insert message
  const { data: msg, error } = await supabase
    .from("media_messages")
    .insert({
      thread_id: threadId,
      sender_type: "admin",
      sender_admin_id: "admin",
      author_role: "rc",
      recipient_role: recipientRole,
      body: body || "(pièce jointe)",
      topic,
      is_internal: isInternal,
      is_system: false,
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Upload attachments
  const uploadedAttachments: any[] = [];
  const failedAttachments: string[] = [];

  for (const att of attachments) {
    const result = await uploadMessageAttachment(supabase, msg.id, att);
    if ('error' in result) {
      failedAttachments.push(`${att.originalName}: ${result.error}`);
    } else {
      uploadedAttachments.push(result.attachment);
    }
  }

  // Generate signed URLs for uploaded attachments
  const attachmentsWithUrls = await Promise.all(
    uploadedAttachments.map(async (att: any) => {
      const { data: signedUrlData } = await supabase.storage
        .from(att.bucket)
        .createSignedUrl(att.path, 3600);

      return {
        ...att,
        url: signedUrlData?.signedUrl ?? null,
      };
    }),
  );

  await insertMediaAudit({
    job_id: thread.job_id,
    action: "admin.message.send",
    actor_type: "admin",
    actor_admin_id: "admin",
    metadata: {
      thread_id: threadId,
      topic,
      is_internal: isInternal,
      attachments_count: uploadedAttachments.length,
    },
  });

  // Create notifications for participants (async, non-blocking)
  notifyThreadParticipantsOnMessage({
    threadId,
    jobId: thread.job_id,
    messageId: msg.id,
    senderType: "admin",
    isInternal,
    messagePreview: body || "(pièce jointe)",
  }).catch(() => {}); // Best effort, ignore errors

  res.json({
    ok: true,
    message: {
      ...msg,
      attachments: attachmentsWithUrls,
    },
    failed_attachments:
      failedAttachments.length > 0 ? failedAttachments : undefined,
  });
};

// Pro: Send message with attachments
export const proSendMessageWithAttachments: RequestHandler = async (
  req,
  res,
) => {
  const pro = await getUserFromBearerToken(req);
  if (!pro) return res.status(401).json({ error: "unauthorized" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";

  if (!establishmentId || !threadId) {
    return res.status(400).json({ error: "missing_params" });
  }

  const check = await ensureProMembership({ userId: pro.id, establishmentId });
  if ('error' in check) return res.status(check.status).json({ error: check.error });

  const body = asString((req.body as any).body);
  const topic = normalizeMessageTopic((req.body as any).topic);
  const attachments: AttachmentInput[] = Array.isArray(
    (req.body as any).attachments,
  )
    ? (req.body as any).attachments
    : [];

  if (!body && attachments.length === 0) {
    return res.status(400).json({ error: "message_or_attachment_required" });
  }

  // Validate max attachments
  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return res.status(400).json({
      error: "too_many_attachments",
      message: `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} fichiers par message`,
    });
  }

  const supabase = getAdminSupabase();

  // Verify thread belongs to this establishment
  const { data: thread } = await supabase
    .from("media_threads")
    .select("id, job_id, status, media_jobs!inner(establishment_id)")
    .eq("id", threadId)
    .maybeSingle();

  if (
    !thread ||
    (thread as any).media_jobs?.establishment_id !== establishmentId
  ) {
    return res.status(404).json({ error: "thread_not_found" });
  }

  if (thread.status === "closed") {
    return res.status(409).json({ error: "thread_closed" });
  }

  // Ensure Pro is a participant
  await ensureThreadParticipant(threadId, pro.id, "pro");

  // Pro can ONLY send to RC
  const { data: msg, error } = await supabase
    .from("media_messages")
    .insert({
      thread_id: threadId,
      sender_type: "pro",
      sender_user_id: pro.id,
      author_role: "pro",
      recipient_role: "rc",
      body: body || "(pièce jointe)",
      topic,
      is_internal: false,
      is_system: false,
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Upload attachments
  const uploadedAttachments: any[] = [];
  const failedAttachments: string[] = [];

  for (const att of attachments) {
    const result = await uploadMessageAttachment(supabase, msg.id, att, pro.id);
    if ('error' in result) {
      failedAttachments.push(`${att.originalName}: ${result.error}`);
    } else {
      uploadedAttachments.push(result.attachment);
    }
  }

  // Generate signed URLs
  const attachmentsWithUrls = await Promise.all(
    uploadedAttachments.map(async (att: any) => {
      const { data: signedUrlData } = await supabase.storage
        .from(att.bucket)
        .createSignedUrl(att.path, 3600);

      return {
        ...att,
        url: signedUrlData?.signedUrl ?? null,
      };
    }),
  );

  await insertMediaAudit({
    job_id: thread.job_id,
    action: "pro.message.send",
    actor_type: "pro",
    actor_user_id: pro.id,
    metadata: {
      thread_id: threadId,
      topic,
      attachments_count: uploadedAttachments.length,
    },
  });

  // Create notifications for participants (async, non-blocking)
  notifyThreadParticipantsOnMessage({
    threadId,
    jobId: thread.job_id,
    messageId: msg.id,
    senderUserId: pro.id,
    senderType: "pro",
    isInternal: false,
    messagePreview: body || "(pièce jointe)",
  }).catch(() => {}); // Best effort, ignore errors

  res.json({
    ok: true,
    message: {
      ...msg,
      attachments: attachmentsWithUrls,
    },
    failed_attachments:
      failedAttachments.length > 0 ? failedAttachments : undefined,
  });
};

// Partner: Send message with attachments
export const partnerSendMessageWithAttachments: RequestHandler = async (
  req,
  res,
) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const threadId =
    typeof req.params.threadId === "string" ? req.params.threadId : "";
  if (!threadId) return res.status(400).json({ error: "missing_thread_id" });

  const body = asString((req.body as any).body);
  const topic = normalizeMessageTopic((req.body as any).topic);
  const attachments: AttachmentInput[] = Array.isArray(
    (req.body as any).attachments,
  )
    ? (req.body as any).attachments
    : [];

  if (!body && attachments.length === 0) {
    return res.status(400).json({ error: "message_or_attachment_required" });
  }

  // Validate max attachments
  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return res.status(400).json({
      error: "too_many_attachments",
      message: `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} fichiers par message`,
    });
  }

  const supabase = getAdminSupabase();

  // Verify partner has access
  const { data: thread } = await supabase
    .from("media_threads")
    .select("id, job_id, status")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return res.status(404).json({ error: "thread_not_found" });

  const { data: deliverable } = await supabase
    .from("media_deliverables")
    .select("id")
    .eq("job_id", thread.job_id)
    .eq("assigned_partner_user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!deliverable) return res.status(403).json({ error: "not_assigned" });

  if (thread.status === "closed") {
    return res.status(409).json({ error: "thread_closed" });
  }

  // Ensure partner is a participant
  await ensureThreadParticipant(threadId, user.id, "partner");

  const { data: msg, error } = await supabase
    .from("media_messages")
    .insert({
      thread_id: threadId,
      sender_type: "partner",
      sender_user_id: user.id,
      author_role: "partner",
      recipient_role: "rc",
      body: body || "(pièce jointe)",
      topic,
      is_internal: false,
      is_system: false,
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Upload attachments
  const uploadedAttachments: any[] = [];
  const failedAttachments: string[] = [];

  for (const att of attachments) {
    const result = await uploadMessageAttachment(
      supabase,
      msg.id,
      att,
      user.id,
    );
    if ('error' in result) {
      failedAttachments.push(`${att.originalName}: ${result.error}`);
    } else {
      uploadedAttachments.push(result.attachment);
    }
  }

  // Generate signed URLs
  const attachmentsWithUrls = await Promise.all(
    uploadedAttachments.map(async (att: any) => {
      const { data: signedUrlData } = await supabase.storage
        .from(att.bucket)
        .createSignedUrl(att.path, 3600);

      return {
        ...att,
        url: signedUrlData?.signedUrl ?? null,
      };
    }),
  );

  await insertMediaAudit({
    job_id: thread.job_id,
    action: "partner.message.send",
    actor_type: "partner",
    actor_user_id: user.id,
    metadata: {
      thread_id: threadId,
      topic,
      attachments_count: uploadedAttachments.length,
    },
  });

  // Create notifications for participants (async, non-blocking)
  notifyThreadParticipantsOnMessage({
    threadId,
    jobId: thread.job_id,
    messageId: msg.id,
    senderUserId: user.id,
    senderType: "partner",
    isInternal: false,
    messagePreview: body || "(pièce jointe)",
  }).catch(() => {}); // Best effort, ignore errors

  res.json({
    ok: true,
    message: {
      ...msg,
      attachments: attachmentsWithUrls,
    },
    failed_attachments:
      failedAttachments.length > 0 ? failedAttachments : undefined,
  });
};

// Helper: get attachments for messages (used when fetching thread messages)
export async function getAttachmentsForMessages(
  supabase: ReturnType<typeof getAdminSupabase>,
  messageIds: string[],
): Promise<Record<string, any[]>> {
  if (messageIds.length === 0) return {};

  const { data: attachments } = await supabase
    .from("media_message_attachments")
    .select("*")
    .in("message_id", messageIds);

  if (!attachments || attachments.length === 0) return {};

  // Generate signed URLs and group by message
  const result: Record<string, any[]> = {};

  for (const att of attachments) {
    const { data: signedUrlData } = await supabase.storage
      .from(att.bucket)
      .createSignedUrl(att.path, 3600);

    const attWithUrl = {
      ...att,
      url: signedUrlData?.signedUrl ?? null,
    };

    if (!result[att.message_id]) {
      result[att.message_id] = [];
    }
    result[att.message_id].push(attWithUrl);
  }

  return result;
}

// Helper: get read receipts for messages (for "Vu à HH:MM" display)
export async function getReadReceiptsForMessages(
  supabase: ReturnType<typeof getAdminSupabase>,
  messageIds: string[],
): Promise<Record<string, { user_id: string; read_at: string }[]>> {
  if (messageIds.length === 0) return {};

  const { data: reads } = await supabase
    .from("media_message_reads")
    .select("message_id, user_id, read_at")
    .in("message_id", messageIds)
    .order("read_at", { ascending: true });

  if (!reads || reads.length === 0) return {};

  const result: Record<string, { user_id: string; read_at: string }[]> = {};

  for (const read of reads) {
    if (!result[read.message_id]) {
      result[read.message_id] = [];
    }
    result[read.message_id].push({
      user_id: read.user_id,
      read_at: read.read_at,
    });
  }

  return result;
}

// =============================================================================
// BLOGGER PORTAL - Article Management
// =============================================================================

/**
 * Helper: Get partner profile for logged-in user
 */
async function getPartnerProfileForUser(
  userId: string,
): Promise<{ id: string; role: string; user_id: string } | null> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("partner_profiles")
    .select("id, primary_role, user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    role: (data as any).primary_role ?? "",
    user_id: data.user_id,
  };
}

/**
 * Helper: Generate a valid slug from title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

/**
 * Partner/Blogger: List their blog articles
 * GET /api/partner/blogger/articles
 */
export const listPartnerBloggerArticles: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const partner = await getPartnerProfileForUser(user.id);
  if (!partner || partner.role !== "blogger") {
    return res.status(403).json({ error: "not_a_blogger" });
  }

  const supabase = getAdminSupabase();

  // Get blog author linked to this partner
  const { data: author } = await supabase
    .from("blog_authors")
    .select("id, slug, display_name")
    .eq("partner_profile_id", partner.id)
    .maybeSingle();

  if (!author) {
    // Create a blog author for this partner
    const { data: partnerProfile } = await supabase
      .from("partner_profiles")
      .select("display_name, avatar_url, user_id")
      .eq("id", partner.id)
      .single();

    const displayName = (partnerProfile as any)?.display_name || "Blogger";
    const slug = generateSlug(displayName) || `blogger-${partner.id.slice(0, 8)}`;

    const { data: newAuthor, error: createError } = await supabase
      .from("blog_authors")
      .insert({
        partner_profile_id: partner.id,
        display_name: displayName,
        slug,
        bio_short: "",
        avatar_url: (partnerProfile as any)?.avatar_url || null,
        role: "guest",
        is_active: true,
      })
      .select("id, slug, display_name")
      .single();

    if (createError) {
      log.error({ err: createError }, "listPartnerBloggerArticles error creating author");
      return res.status(500).json({ error: createError.message });
    }

    // Use the new author
    const authorId = newAuthor.id;
    const { data: articles, error } = await supabase
      .from("blog_articles")
      .select(`
        id,
        slug,
        title_fr,
        title_en,
        excerpt_fr,
        excerpt_en,
        img,
        miniature,
        category,
        is_published,
        moderation_status,
        moderation_note,
        published_at,
        created_at,
        updated_at,
        read_count
      `)
      .eq("author_id", authorId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return res.status(500).json({ error: error.message });

    return res.json({
      ok: true,
      author: newAuthor,
      items: articles ?? [],
    });
  }

  // Get articles for this author
  const { data: articles, error } = await supabase
    .from("blog_articles")
    .select(`
      id,
      slug,
      title_fr,
      title_en,
      excerpt_fr,
      excerpt_en,
      img,
      miniature,
      category,
      is_published,
      moderation_status,
      moderation_note,
      published_at,
      created_at,
      updated_at,
      read_count
    `)
    .eq("author_id", author.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    ok: true,
    author,
    items: articles ?? [],
  });
};

/**
 * Partner/Blogger: Get a single article details
 * GET /api/partner/blogger/articles/:id
 */
export const getPartnerBloggerArticle: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const partner = await getPartnerProfileForUser(user.id);
  if (!partner || partner.role !== "blogger") {
    return res.status(403).json({ error: "not_a_blogger" });
  }

  const articleId = asString(req.params.id);
  if (!articleId) return res.status(400).json({ error: "missing_id" });

  const supabase = getAdminSupabase();

  // Get blog author linked to this partner
  const { data: author } = await supabase
    .from("blog_authors")
    .select("id")
    .eq("partner_profile_id", partner.id)
    .maybeSingle();

  if (!author) {
    return res.status(404).json({ error: "author_not_found" });
  }

  // Get the article
  const { data: article, error } = await supabase
    .from("blog_articles")
    .select("*")
    .eq("id", articleId)
    .eq("author_id", author.id)
    .single();

  if (error) return res.status(404).json({ error: "not_found" });

  // Get article blocks
  const { data: blocks } = await supabase
    .from("blog_article_blocks")
    .select("*")
    .eq("article_id", articleId)
    .order("sort_order", { ascending: true });

  res.json({
    ok: true,
    article,
    blocks: blocks ?? [],
  });
};

/**
 * Partner/Blogger: Create a new article (draft)
 * POST /api/partner/blogger/articles
 */
export const createPartnerBloggerArticle: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const partner = await getPartnerProfileForUser(user.id);
  if (!partner || partner.role !== "blogger") {
    return res.status(403).json({ error: "not_a_blogger" });
  }

  if (!isRecord(req.body)) return res.status(400).json({ error: "invalid_body" });

  const titleFr = asString((req.body as any).title_fr);
  const titleEn = asOptionalString((req.body as any).title_en) ?? "";

  if (!titleFr) return res.status(400).json({ error: "title_fr_required" });

  const supabase = getAdminSupabase();

  // Get or create blog author
  let { data: author } = await supabase
    .from("blog_authors")
    .select("id, display_name")
    .eq("partner_profile_id", partner.id)
    .maybeSingle();

  if (!author) {
    const { data: partnerProfile } = await supabase
      .from("partner_profiles")
      .select("display_name, avatar_url")
      .eq("id", partner.id)
      .single();

    const displayName = (partnerProfile as any)?.display_name || "Blogger";
    const slug = generateSlug(displayName) || `blogger-${partner.id.slice(0, 8)}`;

    const { data: newAuthor, error: createError } = await supabase
      .from("blog_authors")
      .insert({
        partner_profile_id: partner.id,
        display_name: displayName,
        slug,
        bio_short: "",
        avatar_url: (partnerProfile as any)?.avatar_url || null,
        role: "guest",
        is_active: true,
      })
      .select("id, display_name")
      .single();

    if (createError) return res.status(500).json({ error: createError.message });
    author = newAuthor;
  }

  // Generate unique slug
  const baseSlug = generateSlug(titleFr);
  let slug = baseSlug;
  let suffix = 1;

  while (true) {
    const { data: existing } = await supabase
      .from("blog_articles")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!existing) break;
    slug = `${baseSlug}-${suffix}`;
    suffix++;
    if (suffix > 100) {
      slug = `${baseSlug}-${Date.now()}`;
      break;
    }
  }

  // Create the article
  const { data: article, error } = await supabase
    .from("blog_articles")
    .insert({
      slug,
      author_id: author.id,
      author_name: author.display_name,
      title_fr: titleFr,
      title_en: titleEn,
      excerpt_fr: asOptionalString((req.body as any).excerpt_fr) ?? "",
      excerpt_en: asOptionalString((req.body as any).excerpt_en) ?? "",
      body_html_fr: asOptionalString((req.body as any).body_html_fr) ?? "",
      body_html_en: asOptionalString((req.body as any).body_html_en) ?? "",
      meta_title_fr: asOptionalString((req.body as any).meta_title_fr) ?? titleFr,
      meta_title_en: asOptionalString((req.body as any).meta_title_en) ?? titleEn,
      meta_description_fr: asOptionalString((req.body as any).meta_description_fr) ?? "",
      meta_description_en: asOptionalString((req.body as any).meta_description_en) ?? "",
      img: asOptionalString((req.body as any).img) ?? "",
      miniature: asOptionalString((req.body as any).miniature) ?? "",
      category: asOptionalString((req.body as any).category) ?? "",
      is_published: false,
      moderation_status: "draft",
    })
    .select("*")
    .single();

  if (error) {
    log.error({ err: error }, "createPartnerBloggerArticle error");
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, article });
};

/**
 * Partner/Blogger: Update an article
 * POST /api/partner/blogger/articles/:id
 */
export const updatePartnerBloggerArticle: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const partner = await getPartnerProfileForUser(user.id);
  if (!partner || partner.role !== "blogger") {
    return res.status(403).json({ error: "not_a_blogger" });
  }

  const articleId = asString(req.params.id);
  if (!articleId) return res.status(400).json({ error: "missing_id" });
  if (!isRecord(req.body)) return res.status(400).json({ error: "invalid_body" });

  const supabase = getAdminSupabase();

  // Get blog author linked to this partner
  const { data: author } = await supabase
    .from("blog_authors")
    .select("id")
    .eq("partner_profile_id", partner.id)
    .maybeSingle();

  if (!author) return res.status(404).json({ error: "author_not_found" });

  // Get the article and verify ownership
  const { data: existing } = await supabase
    .from("blog_articles")
    .select("id, moderation_status, is_published")
    .eq("id", articleId)
    .eq("author_id", author.id)
    .single();

  if (!existing) return res.status(404).json({ error: "not_found" });

  // Cannot edit published articles
  if (existing.is_published) {
    return res.status(403).json({ error: "cannot_edit_published" });
  }

  // Build update object
  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.title_fr !== undefined) update.title_fr = asString(body.title_fr);
  if (body.title_en !== undefined) update.title_en = asOptionalString(body.title_en) ?? "";
  if (body.excerpt_fr !== undefined) update.excerpt_fr = asOptionalString(body.excerpt_fr) ?? "";
  if (body.excerpt_en !== undefined) update.excerpt_en = asOptionalString(body.excerpt_en) ?? "";
  if (body.body_html_fr !== undefined) update.body_html_fr = asOptionalString(body.body_html_fr) ?? "";
  if (body.body_html_en !== undefined) update.body_html_en = asOptionalString(body.body_html_en) ?? "";
  if (body.meta_title_fr !== undefined) update.meta_title_fr = asOptionalString(body.meta_title_fr) ?? "";
  if (body.meta_title_en !== undefined) update.meta_title_en = asOptionalString(body.meta_title_en) ?? "";
  if (body.meta_description_fr !== undefined) update.meta_description_fr = asOptionalString(body.meta_description_fr) ?? "";
  if (body.meta_description_en !== undefined) update.meta_description_en = asOptionalString(body.meta_description_en) ?? "";
  if (body.img !== undefined) update.img = asOptionalString(body.img) ?? "";
  if (body.miniature !== undefined) update.miniature = asOptionalString(body.miniature) ?? "";
  if (body.category !== undefined) update.category = asOptionalString(body.category) ?? "";

  // If it was rejected, reset to draft on edit
  if (existing.moderation_status === "rejected") {
    update.moderation_status = "draft";
    update.moderation_note = null;
  }

  const { data: article, error } = await supabase
    .from("blog_articles")
    .update(update)
    .eq("id", articleId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, article });
};

/**
 * Partner/Blogger: Submit article for moderation
 * POST /api/partner/blogger/articles/:id/submit
 */
export const submitPartnerBloggerArticleForModeration: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const partner = await getPartnerProfileForUser(user.id);
  if (!partner || partner.role !== "blogger") {
    return res.status(403).json({ error: "not_a_blogger" });
  }

  const articleId = asString(req.params.id);
  if (!articleId) return res.status(400).json({ error: "missing_id" });

  const supabase = getAdminSupabase();

  // Get blog author linked to this partner
  const { data: author } = await supabase
    .from("blog_authors")
    .select("id")
    .eq("partner_profile_id", partner.id)
    .maybeSingle();

  if (!author) return res.status(404).json({ error: "author_not_found" });

  // Get the article and verify ownership
  const { data: existing } = await supabase
    .from("blog_articles")
    .select("id, moderation_status, is_published, title_fr, body_html_fr")
    .eq("id", articleId)
    .eq("author_id", author.id)
    .single();

  if (!existing) return res.status(404).json({ error: "not_found" });

  // Can only submit from draft or rejected status
  if (!["draft", "rejected"].includes(existing.moderation_status || "draft")) {
    return res.status(400).json({ error: "already_submitted" });
  }

  // Basic validation
  if (!existing.title_fr?.trim()) {
    return res.status(400).json({ error: "title_required" });
  }
  if (!existing.body_html_fr?.trim()) {
    return res.status(400).json({ error: "content_required" });
  }

  // Update status to pending
  const { data: article, error } = await supabase
    .from("blog_articles")
    .update({
      moderation_status: "pending",
      moderation_submitted_at: new Date().toISOString(),
      moderation_note: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", articleId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, article });
};

/**
 * Partner/Blogger: Get payment eligibility for an article
 * GET /api/partner/blogger/articles/:id/payment-status
 */
export const getPartnerBloggerArticlePaymentStatus: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const partner = await getPartnerProfileForUser(user.id);
  if (!partner || partner.role !== "blogger") {
    return res.status(403).json({ error: "not_a_blogger" });
  }

  const articleId = asString(req.params.id);
  if (!articleId) return res.status(400).json({ error: "missing_id" });

  const supabase = getAdminSupabase();

  // Get blog author linked to this partner
  const { data: author } = await supabase
    .from("blog_authors")
    .select("id")
    .eq("partner_profile_id", partner.id)
    .maybeSingle();

  if (!author) return res.status(404).json({ error: "author_not_found" });

  // Get the article and verify ownership
  const { data: article } = await supabase
    .from("blog_articles")
    .select("id, is_published, moderation_status, published_at")
    .eq("id", articleId)
    .eq("author_id", author.id)
    .single();

  if (!article) return res.status(404).json({ error: "not_found" });

  // Check if there's already a payment request for this article
  const { data: existingRequest } = await supabase
    .from("partner_invoice_requests")
    .select("id, status, amount_ht, created_at")
    .eq("partner_profile_id", partner.id)
    .eq("reference_type", "blog_article")
    .eq("reference_id", articleId)
    .maybeSingle();

  // Get partner billing profile for RIB status
  const { data: billingProfile } = await supabase
    .from("partner_billing_profiles")
    .select("id, status, iban")
    .eq("partner_profile_id", partner.id)
    .maybeSingle();

  const isPublished = article.is_published === true;
  const hasRib = billingProfile?.status === "validated" && !!billingProfile.iban;
  const canRequestPayment = isPublished && hasRib && !existingRequest;

  res.json({
    ok: true,
    is_published: isPublished,
    moderation_status: article.moderation_status,
    has_valid_rib: hasRib,
    can_request_payment: canRequestPayment,
    existing_request: existingRequest
      ? {
          id: existingRequest.id,
          status: existingRequest.status,
          amount_ht: existingRequest.amount_ht,
          created_at: existingRequest.created_at,
        }
      : null,
  });
};

/**
 * Partner/Blogger: Request payment for a published article
 * POST /api/partner/blogger/articles/:id/request-payment
 */
export const requestPartnerBloggerArticlePayment: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const partner = await getPartnerProfileForUser(user.id);
  if (!partner || partner.role !== "blogger") {
    return res.status(403).json({ error: "not_a_blogger" });
  }

  const articleId = asString(req.params.id);
  if (!articleId) return res.status(400).json({ error: "missing_id" });

  const supabase = getAdminSupabase();

  // Get blog author linked to this partner
  const { data: author } = await supabase
    .from("blog_authors")
    .select("id")
    .eq("partner_profile_id", partner.id)
    .maybeSingle();

  if (!author) return res.status(404).json({ error: "author_not_found" });

  // Get the article and verify ownership
  const { data: article } = await supabase
    .from("blog_articles")
    .select("id, slug, title_fr, is_published, moderation_status")
    .eq("id", articleId)
    .eq("author_id", author.id)
    .single();

  if (!article) return res.status(404).json({ error: "not_found" });

  // Must be published
  if (!article.is_published) {
    return res.status(400).json({ error: "article_not_published" });
  }

  // Check for existing request
  const { data: existingRequest } = await supabase
    .from("partner_invoice_requests")
    .select("id")
    .eq("partner_profile_id", partner.id)
    .eq("reference_type", "blog_article")
    .eq("reference_id", articleId)
    .maybeSingle();

  if (existingRequest) {
    return res.status(400).json({ error: "payment_already_requested" });
  }

  // Check RIB
  const { data: billingProfile } = await supabase
    .from("partner_billing_profiles")
    .select("id, status, iban")
    .eq("partner_profile_id", partner.id)
    .maybeSingle();

  if (!billingProfile || billingProfile.status !== "validated" || !billingProfile.iban) {
    return res.status(400).json({ error: "rib_not_validated" });
  }

  // Get default article rate (could be configurable)
  const articleRate = 500; // 500 MAD per article - can be made configurable

  // Create invoice request
  const { data: invoiceRequest, error } = await supabase
    .from("partner_invoice_requests")
    .insert({
      partner_profile_id: partner.id,
      reference_type: "blog_article",
      reference_id: articleId,
      description: `Article: ${article.title_fr || article.slug}`,
      amount_ht: articleRate,
      status: "requested",
    })
    .select("*")
    .single();

  if (error) {
    log.error({ err: error }, "requestPartnerBloggerArticlePayment error");
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, invoice_request: invoiceRequest });
};

/**
 * Partner/Blogger: Dashboard stats
 * GET /api/partner/blogger/stats
 */
export const getPartnerBloggerStats: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const partner = await getPartnerProfileForUser(user.id);
  if (!partner || partner.role !== "blogger") {
    return res.status(403).json({ error: "not_a_blogger" });
  }

  const supabase = getAdminSupabase();

  // Get blog author linked to this partner
  const { data: author } = await supabase
    .from("blog_authors")
    .select("id")
    .eq("partner_profile_id", partner.id)
    .maybeSingle();

  if (!author) {
    return res.json({
      ok: true,
      stats: {
        total_articles: 0,
        published: 0,
        pending_moderation: 0,
        drafts: 0,
        rejected: 0,
        total_reads: 0,
        pending_payments: 0,
        total_earned: 0,
      },
    });
  }

  // Count articles by status
  const { data: articles } = await supabase
    .from("blog_articles")
    .select("id, is_published, moderation_status, read_count")
    .eq("author_id", author.id);

  const stats = {
    total_articles: articles?.length ?? 0,
    published: articles?.filter((a) => a.is_published).length ?? 0,
    pending_moderation: articles?.filter((a) => a.moderation_status === "pending").length ?? 0,
    drafts: articles?.filter((a) => a.moderation_status === "draft" || !a.moderation_status).length ?? 0,
    rejected: articles?.filter((a) => a.moderation_status === "rejected").length ?? 0,
    total_reads: articles?.reduce((sum, a) => sum + (a.read_count ?? 0), 0) ?? 0,
    pending_payments: 0,
    total_earned: 0,
  };

  // Get payment stats
  const { data: payments } = await supabase
    .from("partner_invoice_requests")
    .select("status, amount_ht")
    .eq("partner_profile_id", partner.id)
    .eq("reference_type", "blog_article");

  if (payments) {
    stats.pending_payments = payments.filter((p) => p.status === "requested").length;
    stats.total_earned = payments
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + (p.amount_ht ?? 0), 0);
  }

  res.json({ ok: true, stats });
};

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerMediaFactoryRoutes(app: Express) {
  const partnerAvatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  // ── Partners Portal ─────────────────────────────────────────────────────
  app.get("/api/partners/me", getPartnerMe);
  app.post("/api/partners/me/profile", zBody(UpdatePartnerProfileSchema), updatePartnerProfile);
  app.post(
    "/api/partners/me/avatar",
    partnerAvatarUpload.single("avatar"),
    uploadPartnerAvatar,
  );
  app.delete("/api/partners/me/avatar", deletePartnerAvatar);
  app.get("/api/partners/missions", listPartnerMissions);
  app.get("/api/partners/missions/:jobId", zParams(JobIdParams), getPartnerMission);
  app.post(
    "/api/partners/deliverables/:deliverableId/upload",
    zParams(DeliverableIdParams),
    express.raw({ type: () => true, limit: "30mb" }),
    uploadPartnerDeliverableFile,
  );
  app.post(
    "/api/partners/missions/:jobId/invoice-request",
    zParams(JobIdParams),
    zBody(RequestPartnerInvoiceSchema),
    requestPartnerInvoice,
  );

  // ── Partner Messaging ───────────────────────────────────────────────────
  app.get("/api/partners/messages/threads", listPartnerMessageThreads);
  app.get(
    "/api/partners/messages/threads/:threadId",
    zParams(ThreadIdParams),
    getPartnerThreadMessages,
  );
  app.post("/api/partners/messages/threads/:threadId", zParams(ThreadIdParams), zBody(SendPartnerMessageSchema), sendPartnerMessage);
  app.post(
    "/api/partners/messages/threads/:threadId/with-attachments",
    zParams(ThreadIdParams),
    zBody(PartnerSendMessageWithAttachmentsSchema),
    partnerSendMessageWithAttachments,
  );
  app.post(
    "/api/partners/messages/threads/:threadId/read",
    zParams(ThreadIdParams),
    markPartnerThreadRead,
  );

  // ── Partner Unread count & Notifications ────────────────────────────────
  app.get("/api/partners/media/messages/unread-count", getPartnerUnreadCount);
  app.get("/api/partners/media/notifications", getPartnerNotifications);
  app.post("/api/partners/media/notifications/:id/read", zParams(zIdParam), markNotificationRead);
  app.post(
    "/api/partners/media/notifications/read-all",
    markAllNotificationsRead,
  );
  app.delete(
    "/api/partners/media/notifications/:id",
    zParams(zIdParam),
    deletePartnerNotification,
  );

  // ── Partner Blogger Portal ──────────────────────────────────────────────
  app.get("/api/partner/blogger/articles", listPartnerBloggerArticles);
  app.get("/api/partner/blogger/articles/:id", zParams(zIdParam), getPartnerBloggerArticle);
  app.post("/api/partner/blogger/articles", zBody(CreatePartnerBloggerArticleSchema), createPartnerBloggerArticle);
  app.post("/api/partner/blogger/articles/:id", zParams(zIdParam), zBody(UpdatePartnerBloggerArticleSchema), updatePartnerBloggerArticle);
  app.post(
    "/api/partner/blogger/articles/:id/submit",
    zParams(zIdParam),
    submitPartnerBloggerArticleForModeration,
  );
  app.get(
    "/api/partner/blogger/articles/:id/payment-status",
    zParams(zIdParam),
    getPartnerBloggerArticlePaymentStatus,
  );
  app.post(
    "/api/partner/blogger/articles/:id/request-payment",
    zParams(zIdParam),
    requestPartnerBloggerArticlePayment,
  );
  app.get("/api/partner/blogger/stats", getPartnerBloggerStats);

  // ── Admin Production (Media Factory) ────────────────────────────────────
  app.get("/api/admin/production/jobs", zQuery(ListAdminMediaJobsQuery), listAdminMediaFactoryJobs);
  app.get("/api/admin/production/jobs/:id", zParams(zIdParam), getAdminMediaFactoryJob);
  app.post(
    "/api/admin/production/jobs/:id/update",
    zParams(zIdParam),
    zBody(UpdateAdminMediaFactoryJobSchema),
    updateAdminMediaFactoryJob,
  );
  app.post(
    "/api/admin/production/jobs/:id/brief/approve",
    zParams(zIdParam),
    zBody(ApproveAdminMediaBriefSchema),
    approveAdminMediaBrief,
  );
  app.post(
    "/api/admin/production/jobs/:id/schedule-slots",
    zParams(zIdParam),
    zBody(CreateAdminMediaScheduleSlotSchema),
    createAdminMediaScheduleSlot,
  );
  app.post(
    "/api/admin/production/deliverables/:id/assign-partner",
    zParams(zIdParam),
    zBody(AssignAdminDeliverablePartnerSchema),
    assignAdminDeliverablePartner,
  );
  app.post(
    "/api/admin/production/deliverables/:id/review",
    zParams(zIdParam),
    zBody(ReviewAdminDeliverableSchema),
    reviewAdminDeliverable,
  );
  app.post(
    "/api/admin/production/jobs/:id/checkin-token",
    zParams(zIdParam),
    createAdminMediaCheckinToken,
  );
  app.get(
    "/api/admin/production/jobs/:id/brief.pdf",
    zParams(zIdParam),
    zQuery(AdminMediaBriefPdfQuery),
    generateAdminMediaBriefPdf,
  );

  // ── Admin Compta (Invoice management) ───────────────────────────────────
  app.get(
    "/api/admin/production/invoice-requests",
    zQuery(ListAdminInvoiceRequestsQuery),
    listAdminPartnerInvoiceRequests,
  );
  app.post(
    "/api/admin/production/invoice-requests/:id",
    zParams(zIdParam),
    zBody(UpdateAdminInvoiceRequestSchema),
    updateAdminInvoiceRequest,
  );

  // ── Admin Partner Management ────────────────────────────────────────────
  app.get("/api/admin/partners", listAdminPartners);
  app.get("/api/admin/partners/:id", zParams(zIdParam), getAdminPartner);
  app.post("/api/admin/partners", zBody(CreateAdminPartnerSchema), createAdminPartner);
  app.post("/api/admin/partners/:id", zParams(zIdParam), zBody(UpdateAdminPartnerSchema), updateAdminPartner);
  app.post("/api/admin/partners/:id/billing", zParams(zIdParam), zBody(UpdateAdminPartnerBillingSchema), updateAdminPartnerBilling);

  // ── Public media check-in (no auth required) ───────────────────────────
  app.get("/api/media/checkin/:token", zParams(MediaCheckinTokenParams), getPublicMediaCheckinInfo);
  app.post("/api/media/checkin", zBody(PublicMediaCheckinSchema), publicMediaCheckin);

  // ── Admin Messaging (Media Factory) ─────────────────────────────────────
  app.get("/api/admin/production/messages/threads", zQuery(ListAdminMediaThreadsQuery), listAdminMessageThreads);
  app.get(
    "/api/admin/production/messages/threads/:threadId",
    zParams(ThreadIdParams),
    getAdminThreadMessages,
  );
  app.post(
    "/api/admin/production/messages/threads/:threadId",
    zParams(ThreadIdParams),
    zBody(SendAdminMessageSchema),
    sendAdminMessage,
  );
  app.post(
    "/api/admin/production/messages/threads/:threadId/read",
    zParams(ThreadIdParams),
    markAdminThreadRead,
  );
  app.post(
    "/api/admin/production/messages/threads/:threadId/close",
    zParams(ThreadIdParams),
    closeAdminThread,
  );
  app.post(
    "/api/admin/production/messages/threads/:threadId/reopen",
    zParams(ThreadIdParams),
    reopenAdminThread,
  );
  app.get(
    "/api/admin/production/communication-logs",
    zQuery(ListAdminCommunicationLogsQuery),
    listAdminCommunicationLogs,
  );
  app.post(
    "/api/admin/production/jobs/:jobId/communication-logs",
    zParams(JobIdParams),
    zBody(CreateAdminCommunicationLogSchema),
    createAdminCommunicationLog,
  );

  // ── Admin Quick Reply Templates ─────────────────────────────────────────
  app.get("/api/admin/production/quick-replies", zQuery(ListQuickReplyTemplatesQuery), listQuickReplyTemplates);
  app.post("/api/admin/production/quick-replies", zBody(CreateQuickReplyTemplateSchema), createQuickReplyTemplate);
  app.post(
    "/api/admin/production/quick-replies/:id",
    zParams(zIdParam),
    zBody(UpdateQuickReplyTemplateSchema),
    updateQuickReplyTemplate,
  );
  app.delete(
    "/api/admin/production/quick-replies/:id",
    zParams(zIdParam),
    deleteQuickReplyTemplate,
  );

  // ── Admin Read receipts ─────────────────────────────────────────────────
  app.get(
    "/api/admin/production/messages/:messageId/reads",
    zParams(MessageIdParams),
    getMessageReadReceipts,
  );

  // ── Admin Attachments ───────────────────────────────────────────────────
  app.get("/api/admin/production/attachments/:id/url", zParams(zIdParam), getAttachmentUrl);
  app.get(
    "/api/admin/production/messages/:messageId/attachments",
    zParams(MessageIdParams),
    getMessageAttachments,
  );
  app.post(
    "/api/admin/production/messages/threads/:threadId/with-attachments",
    zParams(ThreadIdParams),
    zBody(AdminSendMessageWithAttachmentsSchema),
    adminSendMessageWithAttachments,
  );

  // ── Admin Media Notifications ───────────────────────────────────────────
  app.get("/api/admin/production/notifications", getAdminNotifications);

  // ── Pro Media Factory ───────────────────────────────────────────────────
  app.get(
    "/api/pro/establishments/:establishmentId/media/jobs",
    zParams(MediaEstablishmentIdParams),
    listProMediaJobs,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/media/jobs/:jobId",
    zParams(EstablishmentIdJobIdParams),
    getProMediaJob,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/media/jobs/:jobId/brief/save",
    zParams(EstablishmentIdJobIdParams),
    zBody(SaveProMediaBriefDraftSchema),
    saveProMediaBriefDraft,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/media/jobs/:jobId/brief/submit",
    zParams(EstablishmentIdJobIdParams),
    zBody(SubmitProMediaBriefSchema),
    submitProMediaBrief,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/media/jobs/:jobId/schedule/select",
    zParams(EstablishmentIdJobIdParams),
    zBody(SelectProMediaScheduleSlotSchema),
    selectProMediaScheduleSlot,
  );
  app.post("/api/pro/media/checkin/confirm", zBody(ConfirmProMediaCheckinSchema), confirmProMediaCheckin);

  // ── Pro Messaging (Media Factory) ───────────────────────────────────────
  app.get(
    "/api/pro/establishments/:establishmentId/media/messages/threads",
    zParams(MediaEstablishmentIdParams),
    zQuery(ListProMediaThreadsQuery),
    listProMessageThreads,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/media/messages/threads/:threadId",
    zParams(EstablishmentIdThreadIdParams),
    getProThreadMessages,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/media/messages/threads/:threadId",
    zParams(EstablishmentIdThreadIdParams),
    zBody(SendProMessageSchema),
    sendProMessage,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/media/messages/threads/:threadId/with-attachments",
    zParams(EstablishmentIdThreadIdParams),
    zBody(ProSendMessageWithAttachmentsSchema),
    proSendMessageWithAttachments,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/media/messages/threads/:threadId/read",
    zParams(EstablishmentIdThreadIdParams),
    markProThreadRead,
  );

  // ── Pro Unread count & Notifications ────────────────────────────────────
  app.get(
    "/api/pro/establishments/:establishmentId/media/messages/unread-count",
    zParams(MediaEstablishmentIdParams),
    getProUnreadCount,
  );
  app.get("/api/pro/media/notifications", getProNotifications);
  app.post("/api/pro/media/notifications/:id/read", zParams(zIdParam), markNotificationRead);
  app.post("/api/pro/media/notifications/read-all", markAllNotificationsRead);
}
