/**
 * Ambassador Program — Consumer Routes
 *
 * 6 endpoints for authenticated consumers:
 * - GET  /api/consumer/ambassador/programs/:establishmentId — Get establishment's program
 * - POST /api/consumer/ambassador/programs/:programId/apply — Apply to program
 * - GET  /api/consumer/ambassador/my-programs              — My ambassador programs
 * - GET  /api/consumer/ambassador/my-conversions            — My conversions
 * - GET  /api/consumer/ambassador/my-rewards                — My rewards
 * - POST /api/consumer/ambassador/track-click               — Track click on ambassador post
 */

import type { Router, Request, Response } from "express";
import { z } from "zod";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import { zBody, zParams, zUuid } from "../lib/validate";
import {
  ApplyAmbassadorProgramSchema,
  TrackPostClickSchema,
  AmbassadorEstablishmentIdParams,
} from "../schemas/ambassadorProgram";
import { isValidUUID } from "../sanitizeV2";
import { getClientIp } from "../middleware/rateLimiter";

const log = createModuleLogger("ambassadorConsumer");

// =============================================================================
// Auth helper (same pattern as loyaltyV2Public.ts)
// =============================================================================

type ConsumerAuthOk = { ok: true; userId: string };
type ConsumerAuthErr = { ok: false; status: number; error: string };
type ConsumerAuthResult = ConsumerAuthOk | ConsumerAuthErr;

async function getConsumerUserId(req: Request): Promise<ConsumerAuthResult> {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "missing_token" };

  const supabase = getAdminSupabase();
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401, error: "unauthorized" };
    return { ok: true, userId: data.user.id };
  } catch (err) {
    log.warn({ err }, "Consumer auth token verification failed");
    return { ok: false, status: 401, error: "unauthorized" };
  }
}

function requireAuth(
  authResult: ConsumerAuthResult,
  res: Response,
): authResult is ConsumerAuthOk {
  if (authResult.ok === false) {
    res.status(authResult.status).json({ error: authResult.error });
    return false;
  }
  return true;
}

// =============================================================================
// 1. GET /api/consumer/ambassador/programs/:establishmentId
//    Get establishment's active program + optional user application status
// =============================================================================

async function getEstablishmentProgram(req: Request, res: Response) {
  try {
    const { establishmentId } = req.params;
    if (!establishmentId || !isValidUUID(establishmentId)) {
      return res.status(400).json({ error: "Invalid establishment ID" });
    }

    const supabase = getAdminSupabase();

    // Fetch active program
    const { data: program, error: progErr } = await supabase
      .from("ambassador_programs")
      .select("id, establishment_id, reward_description, conversions_required, validity_days, confirmation_mode, expires_at, created_at")
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .maybeSingle();

    if (progErr) {
      log.error({ err: progErr, establishmentId }, "Failed to fetch ambassador program");
      return res.status(500).json({ error: "internal_error" });
    }

    // Check user application status if authenticated
    let myApplication: { status: string; applied_at: string } | null = null;
    const auth = await getConsumerUserId(req);
    if (auth.ok && program) {
      const { data: app } = await supabase
        .from("ambassador_applications")
        .select("status, created_at")
        .eq("program_id", program.id)
        .eq("user_id", auth.userId)
        .maybeSingle();

      if (app) {
        myApplication = { status: app.status, applied_at: app.created_at };
      }
    }

    return res.json({ ok: true, program: program ?? null, my_application: myApplication });
  } catch (err) {
    log.error({ err }, "getEstablishmentProgram crashed");
    return res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 2. POST /api/consumer/ambassador/programs/:programId/apply
//    Apply to an ambassador program
// =============================================================================

async function applyToProgram(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const { programId } = req.params;
    const { motivation } = req.body as z.infer<typeof ApplyAmbassadorProgramSchema>;
    const supabase = getAdminSupabase();

    // Verify program exists and is active
    const { data: program, error: progErr } = await supabase
      .from("ambassador_programs")
      .select("id, is_active, establishment_id")
      .eq("id", programId)
      .maybeSingle();

    if (progErr) {
      log.error({ err: progErr, programId }, "Failed to fetch program for application");
      return res.status(500).json({ error: "internal_error" });
    }
    if (!program) {
      return res.status(404).json({ error: "program_not_found" });
    }
    if (!program.is_active) {
      return res.status(400).json({ error: "program_inactive" });
    }

    // Check if user already applied
    const { data: existing } = await supabase
      .from("ambassador_applications")
      .select("id, status")
      .eq("program_id", programId)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        error: "already_applied",
        current_status: existing.status,
      });
    }

    // Insert application
    const { data: application, error: insertErr } = await supabase
      .from("ambassador_applications")
      .insert({
        program_id: programId,
        user_id: auth.userId,
        establishment_id: program.establishment_id,
        status: "pending",
        motivation: motivation ?? null,
      })
      .select("*")
      .single();

    if (insertErr) {
      // Handle unique constraint race condition
      if (insertErr.code === "23505") {
        return res.status(409).json({ error: "already_applied" });
      }
      log.error({ err: insertErr, programId, userId: auth.userId }, "Failed to insert application");
      return res.status(500).json({ error: "internal_error" });
    }

    log.info({ programId, userId: auth.userId }, "Ambassador application submitted");
    return res.json({ ok: true, application });
  } catch (err) {
    log.error({ err }, "applyToProgram crashed");
    return res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 3. GET /api/consumer/ambassador/my-programs
//    My ambassador programs with progress info
// =============================================================================

async function getMyPrograms(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();

    // Fetch all applications with program and establishment info
    const { data: applications, error: appErr } = await supabase
      .from("ambassador_applications")
      .select(`
        id,
        status,
        created_at,
        program_id,
        establishment_id,
        ambassador_programs (
          id,
          reward_description,
          conversions_required,
          validity_days,
          confirmation_mode,
          is_active,
          expires_at
        ),
        establishments (
          id,
          name,
          logo
        )
      `)
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });

    if (appErr) {
      log.error({ err: appErr, userId: auth.userId }, "Failed to fetch my ambassador programs");
      return res.status(500).json({ error: "internal_error" });
    }

    // For each accepted program, count confirmed conversions
    const programs = await Promise.all(
      (applications ?? []).map(async (app: any) => {
        let conversionsConfirmed = 0;

        if (app.status === "accepted") {
          const { count } = await supabase
            .from("post_conversions")
            .select("id", { count: "exact", head: true })
            .eq("ambassador_id", auth.userId)
            .eq("program_id", app.program_id)
            .eq("status", "confirmed");

          conversionsConfirmed = count ?? 0;
        }

        const program = app.ambassador_programs;
        const establishment = app.establishments;

        return {
          program: program
            ? {
                id: program.id,
                reward_description: program.reward_description,
                conversions_required: program.conversions_required,
                validity_days: program.validity_days,
                confirmation_mode: program.confirmation_mode,
                is_active: program.is_active,
                expires_at: program.expires_at,
              }
            : null,
          application_status: app.status,
          applied_at: app.created_at,
          conversions_confirmed: conversionsConfirmed,
          conversions_required: program?.conversions_required ?? 0,
          establishment_name: establishment?.name ?? null,
          establishment_logo: establishment?.logo ?? null,
          establishment_id: app.establishment_id,
        };
      }),
    );

    return res.json({ ok: true, programs });
  } catch (err) {
    log.error({ err }, "getMyPrograms crashed");
    return res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 4. GET /api/consumer/ambassador/my-conversions
//    My conversions across all programs
// =============================================================================

async function getMyConversions(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();

    const { data: conversions, error: convErr } = await supabase
      .from("post_conversions")
      .select(`
        id,
        program_id,
        post_id,
        visitor_id,
        status,
        confirmation_mode,
        created_at,
        confirmed_at,
        ambassador_programs (
          id,
          reward_description,
          conversions_required,
          establishment_id
        ),
        establishments (
          id,
          name,
          logo
        )
      `)
      .eq("ambassador_id", auth.userId)
      .order("created_at", { ascending: false });

    if (convErr) {
      log.error({ err: convErr, userId: auth.userId }, "Failed to fetch my conversions");
      return res.status(500).json({ error: "internal_error" });
    }

    return res.json({ ok: true, conversions: conversions ?? [] });
  } catch (err) {
    log.error({ err }, "getMyConversions crashed");
    return res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 5. GET /api/consumer/ambassador/my-rewards
//    My ambassador rewards
// =============================================================================

async function getMyRewards(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();

    const { data: rewards, error: rewErr } = await supabase
      .from("ambassador_rewards")
      .select(`
        id,
        program_id,
        claim_code,
        qr_reward_token,
        status,
        unlocked_at,
        expires_at,
        claimed_at,
        ambassador_programs (
          id,
          reward_description,
          establishment_id
        ),
        establishments (
          id,
          name,
          logo
        )
      `)
      .eq("ambassador_id", auth.userId)
      .order("unlocked_at", { ascending: false });

    if (rewErr) {
      log.error({ err: rewErr, userId: auth.userId }, "Failed to fetch my rewards");
      return res.status(500).json({ error: "internal_error" });
    }

    return res.json({ ok: true, rewards: rewards ?? [] });
  } catch (err) {
    log.error({ err }, "getMyRewards crashed");
    return res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 6. POST /api/consumer/ambassador/track-click
//    Track click on ambassador post (creates tracking token)
// =============================================================================

async function trackPostClick(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const { post_id, establishment_id } = req.body as z.infer<typeof TrackPostClickSchema>;
    const supabase = getAdminSupabase();

    // Verify the post exists and matches the establishment
    const { data: post, error: postErr } = await supabase
      .from("social_posts")
      .select("id, user_id, establishment_id")
      .eq("id", post_id)
      .maybeSingle();

    if (postErr) {
      log.error({ err: postErr, post_id }, "Failed to fetch social post for tracking");
      return res.status(500).json({ error: "internal_error" });
    }
    if (!post) {
      return res.status(400).json({ error: "post_not_found" });
    }
    if (post.establishment_id !== establishment_id) {
      return res.status(400).json({ error: "establishment_mismatch" });
    }

    // Anti self-referral: if visitor is the post author, return ok silently
    if (auth.userId === post.user_id) {
      return res.json({ ok: true, token_id: null });
    }

    // Rate limit: max 10 tokens per visitor+establishment per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: countErr } = await supabase
      .from("post_tracking_tokens")
      .select("id", { count: "exact", head: true })
      .eq("visitor_id", auth.userId)
      .eq("establishment_id", establishment_id)
      .gte("created_at", oneHourAgo);

    if (countErr) {
      log.error({ err: countErr }, "Failed to check tracking rate limit");
      return res.status(500).json({ error: "internal_error" });
    }
    if ((recentCount ?? 0) >= 10) {
      return res.status(429).json({ error: "rate_limit_exceeded" });
    }

    // Create tracking token
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // +30 days
    const ipAddress = getClientIp(req);

    const { data: token, error: insertErr } = await supabase
      .from("post_tracking_tokens")
      .insert({
        post_id,
        author_id: post.user_id,
        visitor_id: auth.userId,
        establishment_id,
        expires_at: expiresAt,
        ip_address: ipAddress,
      })
      .select("id")
      .single();

    if (insertErr) {
      log.error({ err: insertErr, post_id, userId: auth.userId }, "Failed to create tracking token");
      return res.status(500).json({ error: "internal_error" });
    }

    log.info({ post_id, visitor: auth.userId, author: post.user_id }, "Post click tracked");
    return res.json({ ok: true, token_id: token.id });
  } catch (err) {
    log.error({ err }, "trackPostClick crashed");
    return res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Route registration
// =============================================================================

export function registerAmbassadorConsumerRoutes(app: Router): void {
  app.get(
    "/api/consumer/ambassador/programs/:establishmentId",
    zParams(AmbassadorEstablishmentIdParams),
    getEstablishmentProgram,
  );

  app.post(
    "/api/consumer/ambassador/programs/:programId/apply",
    zParams(z.object({ programId: zUuid })),
    zBody(ApplyAmbassadorProgramSchema),
    applyToProgram,
  );

  app.get("/api/consumer/ambassador/my-programs", getMyPrograms);
  app.get("/api/consumer/ambassador/my-conversions", getMyConversions);
  app.get("/api/consumer/ambassador/my-rewards", getMyRewards);

  app.post(
    "/api/consumer/ambassador/track-click",
    zBody(TrackPostClickSchema),
    trackPostClick,
  );
}
