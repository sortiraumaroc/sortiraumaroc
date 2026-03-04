/**
 * Conciergerie Pro Inbox Routes — Espace Pro
 *
 * GET    /api/pro/conciergerie/requests           — demandes en attente
 * GET    /api/pro/conciergerie/requests/:id       — détail d'une demande
 * POST   /api/pro/conciergerie/requests/:id/accept — accepter
 * POST   /api/pro/conciergerie/requests/:id/refuse  — refuser
 *
 * "Premier qui accepte" — verrouillage optimiste via version column
 */

import type { Express, Request, Response } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { sendTemplateEmail } from "../emailService";
import { generateConciergerieScanSecret, validateConciergerieScan } from "../conciergerieScanLogic";
import { createModuleLogger } from "../lib/logger";
import { zBody, zParams } from "../lib/validate";
import { AcceptRequestSchema, RefuseRequestSchema, ConciergerieScanSchema, ConciergerieRequestIdParams } from "../schemas/conciergerieProInbox";

const log = createModuleLogger("conciergerieProInbox");

// ============================================================================
// Auth Helper (Pro user + establishment membership check)
// ============================================================================

type ProAuth = {
  ok: true;
  userId: string;
  email: string | null;
  establishmentIds: string[];
};

type ProAuthError = {
  ok: false;
  status: number;
  error: string;
};

async function ensureProUser(req: Request): Promise<ProAuth | ProAuthError> {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return { ok: false, status: 401, error: "Missing token" };

  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401, error: "Invalid token" };

    const userId = data.user.id;

    // Get pro establishment memberships
    const { data: memberships } = await sb
      .from("pro_establishment_memberships")
      .select("establishment_id")
      .eq("user_id", userId);

    if (!memberships || memberships.length === 0) {
      return { ok: false, status: 403, error: "Vous n'êtes pas membre d'un établissement." };
    }

    return {
      ok: true,
      userId,
      email: data.user.email ?? null,
      establishmentIds: memberships.map((m: any) => m.establishment_id),
    };
  } catch (err) {
    log.error({ err }, "Pro auth verification error");
    return { ok: false, status: 500, error: "Erreur d'authentification" };
  }
}

const supabase = () => getAdminSupabase();

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ============================================================================
// Routes
// ============================================================================

export function registerConciergerieProInboxRoutes(app: Express) {
  // -----------------------------------------------------------------------
  // GET /api/pro/conciergerie/requests — Demandes en attente pour mes établissements
  // -----------------------------------------------------------------------
  app.get("/api/pro/conciergerie/requests", async (req: Request, res: Response) => {
    try {
      const auth = await ensureProUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const statusFilter = (req.query.status as string) ?? "pending";
      const establishmentId = req.query.establishment_id as string | undefined;

      const sb = supabase();

      // Filter by specific establishment or all user's establishments
      const targetEstIds = establishmentId && auth.establishmentIds.includes(establishmentId)
        ? [establishmentId]
        : auth.establishmentIds;

      const { data: requests, error } = await sb
        .from("step_requests")
        .select(`
          *,
          journey_steps!inner(
            id, journey_id, step_order, universe, category, description, budget_min, budget_max, status,
            experience_journeys!inner(
              id, title, client_name, party_size, desired_date, desired_time_start, desired_time_end, city, concierge_id
            )
          )
        `)
        .in("establishment_id", targetEstIds)
        .eq("status", statusFilter)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Enrich with concierge names
      const conciergeIds = [...new Set((requests ?? []).map((r: any) => r.journey_steps?.experience_journeys?.concierge_id).filter(Boolean))];
      let conciergeMap: Record<string, string> = {};
      if (conciergeIds.length > 0) {
        const { data: concierges } = await sb
          .from("concierges")
          .select("id, name")
          .in("id", conciergeIds);
        for (const c of concierges ?? []) conciergeMap[c.id] = c.name;
      }

      const result = (requests ?? []).map((r: any) => {
        const stepData = r.journey_steps;
        const journeyData = stepData?.experience_journeys;
        return {
          id: r.id,
          step_id: r.step_id,
          establishment_id: r.establishment_id,
          message: r.message,
          party_size: r.party_size,
          desired_date: r.desired_date,
          desired_time: r.desired_time,
          budget_hint: r.budget_hint,
          status: r.status,
          response_note: r.response_note,
          proposed_price: r.proposed_price,
          responded_at: r.responded_at,
          responded_by: r.responded_by,
          version: r.version,
          expires_at: r.expires_at,
          created_at: r.created_at,
          updated_at: r.updated_at,
          step: {
            id: stepData?.id,
            journey_id: stepData?.journey_id,
            step_order: stepData?.step_order,
            universe: stepData?.universe,
            category: stepData?.category,
            description: stepData?.description,
            budget_min: stepData?.budget_min,
            budget_max: stepData?.budget_max,
            status: stepData?.status,
            journey: {
              id: journeyData?.id,
              title: journeyData?.title,
              client_name: journeyData?.client_name,
              party_size: journeyData?.party_size,
              desired_date: journeyData?.desired_date,
              desired_time_start: journeyData?.desired_time_start,
              desired_time_end: journeyData?.desired_time_end,
              city: journeyData?.city,
            },
          },
          concierge_name: conciergeMap[journeyData?.concierge_id] ?? "Inconnu",
        };
      });

      return res.json({ requests: result });
    } catch (e: any) {
      log.error({ err: e }, "GET /requests error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/pro/conciergerie/requests/:id — Détail d'une demande
  // -----------------------------------------------------------------------
  app.get("/api/pro/conciergerie/requests/:id", zParams(ConciergerieRequestIdParams), async (req: Request, res: Response) => {
    try {
      const auth = await ensureProUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const requestId = req.params.id;
      if (!isValidUUID(requestId)) return res.status(400).json({ error: "Invalid request ID" });

      const sb = supabase();

      const { data: request } = await sb
        .from("step_requests")
        .select(`
          *,
          journey_steps!inner(
            id, journey_id, step_order, universe, category, description, budget_min, budget_max, status,
            experience_journeys!inner(
              id, title, client_name, party_size, desired_date, desired_time_start, desired_time_end, city, concierge_id
            )
          )
        `)
        .eq("id", requestId)
        .in("establishment_id", auth.establishmentIds)
        .single();

      if (!request) return res.status(404).json({ error: "Demande non trouvée" });

      // Get concierge name
      const conciergeId = (request as any).journey_steps?.experience_journeys?.concierge_id;
      let conciergeName = "Inconnu";
      if (conciergeId) {
        const { data: concierge } = await sb
          .from("concierges")
          .select("name")
          .eq("id", conciergeId)
          .single();
        if (concierge) conciergeName = concierge.name;
      }

      const stepData = (request as any).journey_steps;
      const journeyData = stepData?.experience_journeys;

      return res.json({
        ...request,
        journey_steps: undefined,
        step: {
          id: stepData?.id,
          journey_id: stepData?.journey_id,
          step_order: stepData?.step_order,
          universe: stepData?.universe,
          category: stepData?.category,
          description: stepData?.description,
          budget_min: stepData?.budget_min,
          budget_max: stepData?.budget_max,
          status: stepData?.status,
          journey: {
            id: journeyData?.id,
            title: journeyData?.title,
            client_name: journeyData?.client_name,
            party_size: journeyData?.party_size,
            desired_date: journeyData?.desired_date,
            desired_time_start: journeyData?.desired_time_start,
            desired_time_end: journeyData?.desired_time_end,
            city: journeyData?.city,
          },
        },
        concierge_name: conciergeName,
      });
    } catch (e: any) {
      log.error({ err: e }, "GET /requests/:id error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/pro/conciergerie/requests/:id/accept — Accepter
  // "Premier qui accepte" with optimistic locking
  // -----------------------------------------------------------------------
  app.post("/api/pro/conciergerie/requests/:id/accept", zParams(ConciergerieRequestIdParams), zBody(AcceptRequestSchema), async (req: Request, res: Response) => {
    try {
      const auth = await ensureProUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const requestId = req.params.id;
      if (!isValidUUID(requestId)) return res.status(400).json({ error: "Invalid request ID" });

      const sb = supabase();

      // 1. Fetch the request with its current version
      const { data: request } = await sb
        .from("step_requests")
        .select("id, step_id, establishment_id, status, version")
        .eq("id", requestId)
        .in("establishment_id", auth.establishmentIds)
        .single();

      if (!request) return res.status(404).json({ error: "Demande non trouvée" });
      if (request.status !== "pending") {
        return res.status(409).json({ error: "Cette demande a déjà été traitée" });
      }

      const body = req.body ?? {};
      const proposedPrice = body.proposed_price != null ? Number(body.proposed_price) : null;
      const responseNote = body.response_note?.trim() ?? null;

      // 2. Optimistic locking: UPDATE WHERE id=X AND version=V
      const { data: updated, error: updateErr } = await sb
        .from("step_requests")
        .update({
          status: "accepted",
          proposed_price: proposedPrice,
          response_note: responseNote,
          responded_at: new Date().toISOString(),
          responded_by: auth.userId,
          version: request.version + 1,
        })
        .eq("id", requestId)
        .eq("version", request.version)
        .select("id")
        .maybeSingle();

      if (updateErr) throw updateErr;

      // 3. If no row updated → another pro accepted first
      if (!updated) {
        return res.status(409).json({ error: "Un autre établissement a déjà accepté cette demande." });
      }

      // 4. Mark other requests for this step as "superseded"
      await sb
        .from("step_requests")
        .update({ status: "superseded", updated_at: new Date().toISOString() })
        .eq("step_id", request.step_id)
        .neq("id", requestId)
        .eq("status", "pending");

      // 5. Update step: status = accepted, accepted_establishment_id, confirmed_price
      await sb
        .from("journey_steps")
        .update({
          status: "accepted",
          accepted_establishment_id: request.establishment_id,
          accepted_at: new Date().toISOString(),
          confirmed_price: proposedPrice,
        })
        .eq("id", request.step_id);

      // 6. Check if ALL steps of the journey are accepted → update journey to "confirmed"
      const { data: step } = await sb
        .from("journey_steps")
        .select("journey_id")
        .eq("id", request.step_id)
        .single();

      if (step) {
        const { data: allSteps } = await sb
          .from("journey_steps")
          .select("id, status")
          .eq("journey_id", step.journey_id)
          .is("deleted_at", null);

        const allAccepted = (allSteps ?? []).every((s: any) => s.status === "accepted");
        const someAccepted = (allSteps ?? []).some((s: any) => s.status === "accepted");

        const newJourneyStatus = allAccepted ? "confirmed" : someAccepted ? "partially_accepted" : "requesting";

        await sb
          .from("experience_journeys")
          .update({ status: newJourneyStatus })
          .eq("id", step.journey_id);

        // 7. Send email to conciergerie user
        const { data: journey } = await sb
          .from("experience_journeys")
          .select("id, concierge_id, title, desired_date, created_by")
          .eq("id", step.journey_id)
          .single();

        if (journey) {
          // Get concierge user email
          const { data: conciergeUsers } = await sb
            .from("concierge_users")
            .select("user_id, first_name, last_name")
            .eq("concierge_id", journey.concierge_id)
            .is("deleted_at", null)
            .eq("status", "active");

          const userIds = (conciergeUsers ?? []).map((u: any) => u.user_id);
          const emails: string[] = [];
          for (const uid of userIds) {
            const { data: userData } = await sb.auth.admin.getUserById(uid);
            if (userData?.user?.email) emails.push(userData.user.email);
          }

          if (emails.length > 0) {
            // Get establishment name
            const { data: est } = await sb
              .from("establishments")
              .select("name")
              .eq("id", request.establishment_id)
              .single();

            // Get step description
            const { data: stepDetail } = await sb
              .from("journey_steps")
              .select("description")
              .eq("id", request.step_id)
              .single();

            const firstName = conciergeUsers?.[0]?.first_name ?? "";
            const lastName = conciergeUsers?.[0]?.last_name ?? "";

            sendTemplateEmail({
              templateKey: "conciergerie_request_accepted",
              lang: "fr",
              fromKey: "noreply",
              to: emails,
              variables: {
                concierge_user_name: [firstName, lastName].filter(Boolean).join(" ") || "Cher utilisateur",
                journey_title: journey.title ?? `Parcours du ${journey.desired_date}`,
                step_description: stepDetail?.description ?? "",
                establishment_name: est?.name ?? "",
                proposed_price: proposedPrice != null ? String(proposedPrice) : "À convenir",
                response_note: responseNote ?? "",
              },
              ctaUrl: `https://sam.ma/conciergerie`,
              ctaLabel: "Voir le parcours",
            }).catch((err) => log.error({ err }, "Email send error"));
          }
        }
      }

      // 8. Auto-generate TOTP secret for scan QR
      generateConciergerieScanSecret(requestId).catch((err) =>
        log.error({ err }, "Auto-generate scan secret error"),
      );

      return res.json({ ok: true });
    } catch (e: any) {
      log.error({ err: e }, "POST /requests/:id/accept error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/pro/conciergerie/scan — Valider un scan QR conciergerie
  // -----------------------------------------------------------------------
  app.post("/api/pro/conciergerie/scan", zBody(ConciergerieScanSchema), async (req: Request, res: Response) => {
    try {
      const auth = await ensureProUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const { payload, establishment_id } = req.body ?? {};
      if (!payload || typeof payload !== "string") {
        return res.status(400).json({ error: "Payload QR manquant" });
      }
      if (!establishment_id || !auth.establishmentIds.includes(establishment_id)) {
        return res.status(403).json({ error: "Établissement non autorisé" });
      }

      const result = await validateConciergerieScan(payload, establishment_id, auth.userId);
      return res.json(result);
    } catch (e: any) {
      log.error({ err: e }, "POST /scan error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/pro/conciergerie/scans — Historique des scans conciergerie
  // -----------------------------------------------------------------------
  app.get("/api/pro/conciergerie/scans", async (req: Request, res: Response) => {
    try {
      const auth = await ensureProUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const establishmentId = req.query.establishment_id as string | undefined;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const offset = (page - 1) * limit;

      const targetEstIds = establishmentId && auth.establishmentIds.includes(establishmentId)
        ? [establishmentId]
        : auth.establishmentIds;

      const sb = supabase();
      const { data: scans, count, error } = await sb
        .from("b2b_scans")
        .select("*", { count: "exact" })
        .eq("scan_type", "conciergerie")
        .in("establishment_id", targetEstIds)
        .order("scan_datetime", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return res.json({ scans: scans ?? [], total: count ?? 0, page, limit });
    } catch (e: any) {
      log.error({ err: e }, "GET /scans error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/pro/conciergerie/requests/:id/refuse — Refuser
  // -----------------------------------------------------------------------
  app.post("/api/pro/conciergerie/requests/:id/refuse", zParams(ConciergerieRequestIdParams), zBody(RefuseRequestSchema), async (req: Request, res: Response) => {
    try {
      const auth = await ensureProUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const requestId = req.params.id;
      if (!isValidUUID(requestId)) return res.status(400).json({ error: "Invalid request ID" });

      const sb = supabase();

      // Fetch request
      const { data: request } = await sb
        .from("step_requests")
        .select("id, step_id, status")
        .eq("id", requestId)
        .in("establishment_id", auth.establishmentIds)
        .single();

      if (!request) return res.status(404).json({ error: "Demande non trouvée" });
      if (request.status !== "pending") {
        return res.status(409).json({ error: "Cette demande a déjà été traitée" });
      }

      const body = req.body ?? {};
      const responseNote = body.response_note?.trim() ?? null;

      // Update request
      await sb
        .from("step_requests")
        .update({
          status: "refused",
          response_note: responseNote,
          responded_at: new Date().toISOString(),
          responded_by: auth.userId,
          version: request.status === "pending" ? 2 : undefined,
        })
        .eq("id", requestId);

      // Check if ALL requests for this step are refused → step = refused_all
      const { data: siblingReqs } = await sb
        .from("step_requests")
        .select("id, status")
        .eq("step_id", request.step_id);

      const allRefused = (siblingReqs ?? []).every(
        (r: any) => r.status === "refused" || r.status === "expired",
      );

      if (allRefused) {
        await sb
          .from("journey_steps")
          .update({ status: "refused_all" })
          .eq("id", request.step_id);
      }

      return res.json({ ok: true });
    } catch (e: any) {
      log.error({ err: e }, "POST /requests/:id/refuse error");
      return res.status(500).json({ error: "Internal error" });
    }
  });
}
