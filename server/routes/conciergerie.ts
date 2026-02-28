/**
 * Conciergerie Routes — Espace Conciergerie
 *
 * GET    /api/conciergerie/me                     — profil conciergerie
 * GET    /api/conciergerie/journeys               — liste parcours
 * POST   /api/conciergerie/journeys               — créer parcours + étapes
 * GET    /api/conciergerie/journeys/:id           — détail parcours
 * PUT    /api/conciergerie/journeys/:id           — modifier (draft only)
 * DELETE /api/conciergerie/journeys/:id           — supprimer (draft only)
 * POST   /api/conciergerie/journeys/:id/send      — envoyer demandes aux pros
 * POST   /api/conciergerie/steps/:stepId/requests  — envoyer demandes pour une étape
 * GET    /api/conciergerie/search/establishments   — recherche établissements
 */

import type { Express, Request, Response } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { sendTemplateEmail } from "../emailService";
import { generateConciergerieScanSecret, getConciergerieQrData } from "../conciergerieScanLogic";
import type {
  CreateJourneyPayload,
  SendStepRequestsPayload,
  ConciergeProfile,
  JourneyWithSteps,
  JourneyListItem,
  ConciergeUsage,
} from "../../shared/conciergerieTypes";
import { TIER_CONFIG } from "../../shared/conciergerieTypes";
import { createModuleLogger } from "../lib/logger";
import { zBody, zParams } from "../lib/validate";
import { CreateJourneySchema, UpdateJourneySchema, SendStepRequestsSchema, JourneyIdParams, StepIdParams, StepRequestIdParams } from "../schemas/conciergerieRoutes";

const log = createModuleLogger("conciergerie");

// ============================================================================
// Auth Helper
// ============================================================================

type ConciergeAuth = {
  ok: true;
  userId: string;
  conciergeId: string;
  conciergeUserId: string;
  role: string;
  concierge: { id: string; name: string; status: string; commission_rate: number };
};

type ConciergeAuthError = {
  ok: false;
  status: number;
  error: string;
};

async function ensureConciergeUser(req: Request): Promise<ConciergeAuth | ConciergeAuthError> {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return { ok: false, status: 401, error: "Missing token" };

  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401, error: "Invalid token" };

    const userId = data.user.id;

    // Check concierge_users membership
    const { data: cu } = await sb
      .from("concierge_users")
      .select("id, concierge_id, role")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .eq("status", "active")
      .maybeSingle();

    if (!cu) return { ok: false, status: 403, error: "Vous n'êtes pas membre d'une conciergerie." };

    // Check concierge active
    const { data: concierge } = await sb
      .from("concierges")
      .select("id, name, status, commission_rate")
      .eq("id", cu.concierge_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!concierge || concierge.status !== "active") {
      return { ok: false, status: 403, error: "La conciergerie n'est pas active." };
    }

    return {
      ok: true,
      userId,
      conciergeId: cu.concierge_id,
      conciergeUserId: cu.id,
      role: cu.role,
      concierge,
    };
  } catch (err) {
    log.error({ err }, "Conciergerie auth verification error");
    return { ok: false, status: 500, error: "Erreur d'authentification" };
  }
}

const supabase = () => getAdminSupabase();

// ============================================================================
// Helpers
// ============================================================================

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ============================================================================
// Routes
// ============================================================================

export function registerConciergerieRoutes(app: Express) {
  // -----------------------------------------------------------------------
  // GET /api/conciergerie/me — Profil conciergerie
  // -----------------------------------------------------------------------
  app.get("/api/conciergerie/me", async (req: Request, res: Response) => {
    try {
      const auth = await ensureConciergeUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const sb = supabase();

      // Get concierge_user details + concierge details in parallel
      const [{ data: cu }, { data: concierge }] = await Promise.all([
        sb.from("concierge_users").select("*").eq("id", auth.conciergeUserId).single(),
        sb.from("concierges").select("*").eq("id", auth.conciergeId).single(),
      ]);

      // Compute monthly usage: count accepted step_requests this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: journeyIds } = await sb
        .from("experience_journeys")
        .select("id")
        .eq("concierge_id", auth.conciergeId)
        .is("deleted_at", null);

      let monthReservations = 0;
      const jIds = (journeyIds ?? []).map((j: any) => j.id);

      if (jIds.length > 0) {
        const { data: stepIds } = await sb
          .from("journey_steps")
          .select("id")
          .in("journey_id", jIds)
          .is("deleted_at", null);

        const sIds = (stepIds ?? []).map((s: any) => s.id);

        if (sIds.length > 0) {
          const { count } = await sb
            .from("step_requests")
            .select("id", { count: "exact", head: true })
            .in("step_id", sIds)
            .eq("status", "accepted")
            .gte("responded_at", startOfMonth.toISOString());

          monthReservations = count ?? 0;
        }
      }

      // Determine tier
      let tierKey: "free" | "standard" | "premium" = "free";
      if (monthReservations > TIER_CONFIG.standard.maxReservations) tierKey = "premium";
      else if (monthReservations > TIER_CONFIG.free.maxReservations) tierKey = "standard";

      const tier = TIER_CONFIG[tierKey];
      const usage: ConciergeUsage = {
        month_reservations: monthReservations,
        tier: tierKey,
        tier_label: tier.label,
        tier_price: tier.price,
        limit: tier.maxReservations,
      };

      const profile: ConciergeProfile & { usage: ConciergeUsage } = {
        concierge: concierge as any,
        user: cu as any,
        usage,
      };

      return res.json(profile);
    } catch (e: any) {
      log.error({ err: e }, "GET /me error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/conciergerie/journeys — Liste parcours
  // -----------------------------------------------------------------------
  app.get("/api/conciergerie/journeys", async (req: Request, res: Response) => {
    try {
      const auth = await ensureConciergeUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const status = req.query.status as string | undefined;
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
      const perPage = Math.min(50, Math.max(1, parseInt(String(req.query.per_page ?? "20"), 10)));
      const offset = (page - 1) * perPage;

      const sb = supabase();
      let query = sb
        .from("experience_journeys")
        .select("*, journey_steps(id, status)", { count: "exact" })
        .eq("concierge_id", auth.conciergeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + perPage - 1);

      if (status) query = query.eq("status", status);

      const { data: rows, count, error } = await query;
      if (error) throw error;

      const journeys: JourneyListItem[] = (rows ?? []).map((r: any) => {
        const steps = r.journey_steps ?? [];
        return {
          ...r,
          journey_steps: undefined,
          steps_count: steps.length,
          accepted_steps_count: steps.filter((s: any) => s.status === "accepted").length,
        };
      });

      return res.json({ journeys, total: count ?? 0 });
    } catch (e: any) {
      log.error({ err: e }, "GET /journeys error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/conciergerie/journeys — Créer parcours + étapes
  // -----------------------------------------------------------------------
  app.post("/api/conciergerie/journeys", zBody(CreateJourneySchema), async (req: Request, res: Response) => {
    try {
      const auth = await ensureConciergeUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const body = req.body as CreateJourneyPayload;

      // Validation
      if (!body.client_name?.trim()) return res.status(400).json({ error: "client_name is required" });
      if (!body.desired_date) return res.status(400).json({ error: "desired_date is required" });
      if (!body.party_size || body.party_size < 1) return res.status(400).json({ error: "party_size must be >= 1" });
      if (!body.steps || body.steps.length === 0) return res.status(400).json({ error: "At least one step is required" });

      const sb = supabase();

      // Create journey
      const { data: journey, error: journeyErr } = await sb
        .from("experience_journeys")
        .insert({
          concierge_id: auth.conciergeId,
          created_by: auth.userId,
          client_name: body.client_name.trim(),
          client_phone: body.client_phone?.trim() || null,
          client_email: body.client_email?.trim() || null,
          client_notes: body.client_notes?.trim() || null,
          party_size: body.party_size,
          title: body.title?.trim() || null,
          desired_date: body.desired_date,
          desired_time_start: body.desired_time_start || null,
          desired_time_end: body.desired_time_end || null,
          city: body.city?.trim() || null,
          status: "draft",
        })
        .select()
        .single();

      if (journeyErr || !journey) throw journeyErr;

      // Create steps
      const stepsToInsert = body.steps.map((s, i) => ({
        journey_id: journey.id,
        step_order: s.step_order ?? i + 1,
        universe: s.universe || null,
        category: s.category?.trim() || null,
        description: s.description?.trim() || null,
        budget_min: s.budget_min ?? null,
        budget_max: s.budget_max ?? null,
        status: "pending",
      }));

      const { data: steps, error: stepsErr } = await sb
        .from("journey_steps")
        .insert(stepsToInsert)
        .select();

      if (stepsErr) throw stepsErr;

      const result: JourneyWithSteps = {
        ...journey,
        steps: (steps ?? []).map((s: any) => ({ ...s, requests: [] })),
      };

      return res.status(201).json(result);
    } catch (e: any) {
      log.error({ err: e }, "POST /journeys error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/conciergerie/journeys/:id — Détail parcours
  // -----------------------------------------------------------------------
  app.get("/api/conciergerie/journeys/:id", zParams(JourneyIdParams), async (req: Request, res: Response) => {
    try {
      const auth = await ensureConciergeUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const journeyId = req.params.id;
      if (!isValidUUID(journeyId)) return res.status(400).json({ error: "Invalid journey ID" });

      const sb = supabase();

      const { data: journey, error } = await sb
        .from("experience_journeys")
        .select("*")
        .eq("id", journeyId)
        .eq("concierge_id", auth.conciergeId)
        .is("deleted_at", null)
        .single();

      if (error || !journey) return res.status(404).json({ error: "Parcours non trouvé" });

      // Get steps with requests
      const { data: steps } = await sb
        .from("journey_steps")
        .select("*")
        .eq("journey_id", journeyId)
        .is("deleted_at", null)
        .order("step_order", { ascending: true });

      const stepIds = (steps ?? []).map((s: any) => s.id);

      let requests: any[] = [];
      if (stepIds.length > 0) {
        const { data: reqs } = await sb
          .from("step_requests")
          .select("*")
          .in("step_id", stepIds);
        requests = reqs ?? [];
      }

      // Enrich requests with establishment names
      const estIds = [...new Set(requests.map((r: any) => r.establishment_id))];
      let estMap: Record<string, any> = {};
      if (estIds.length > 0) {
        const { data: ests } = await sb
          .from("establishments")
          .select("id, name, slug, cover_url")
          .in("id", estIds);
        for (const e of ests ?? []) {
          estMap[e.id] = e;
        }
      }

      const result: JourneyWithSteps = {
        ...journey,
        steps: (steps ?? []).map((s: any) => ({
          ...s,
          requests: requests
            .filter((r: any) => r.step_id === s.id)
            .map((r: any) => ({
              ...r,
              establishment_name: estMap[r.establishment_id]?.name ?? null,
              establishment_slug: estMap[r.establishment_id]?.slug ?? null,
              establishment_cover_url: estMap[r.establishment_id]?.cover_url ?? null,
            })),
        })),
      };

      return res.json(result);
    } catch (e: any) {
      log.error({ err: e }, "GET /journeys/:id error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // PUT /api/conciergerie/journeys/:id — Modifier (draft only)
  // -----------------------------------------------------------------------
  app.put("/api/conciergerie/journeys/:id", zParams(JourneyIdParams), zBody(UpdateJourneySchema), async (req: Request, res: Response) => {
    try {
      const auth = await ensureConciergeUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const journeyId = req.params.id;
      if (!isValidUUID(journeyId)) return res.status(400).json({ error: "Invalid journey ID" });

      const sb = supabase();

      // Check ownership + draft
      const { data: existing } = await sb
        .from("experience_journeys")
        .select("id, status")
        .eq("id", journeyId)
        .eq("concierge_id", auth.conciergeId)
        .is("deleted_at", null)
        .single();

      if (!existing) return res.status(404).json({ error: "Parcours non trouvé" });
      if (existing.status !== "draft") return res.status(400).json({ error: "Seuls les brouillons peuvent être modifiés" });

      const body = req.body;
      const updates: Record<string, any> = {};

      if (body.client_name !== undefined) updates.client_name = body.client_name?.trim() || null;
      if (body.client_phone !== undefined) updates.client_phone = body.client_phone?.trim() || null;
      if (body.client_email !== undefined) updates.client_email = body.client_email?.trim() || null;
      if (body.client_notes !== undefined) updates.client_notes = body.client_notes?.trim() || null;
      if (body.party_size !== undefined) updates.party_size = body.party_size;
      if (body.title !== undefined) updates.title = body.title?.trim() || null;
      if (body.desired_date !== undefined) updates.desired_date = body.desired_date;
      if (body.desired_time_start !== undefined) updates.desired_time_start = body.desired_time_start || null;
      if (body.desired_time_end !== undefined) updates.desired_time_end = body.desired_time_end || null;
      if (body.city !== undefined) updates.city = body.city?.trim() || null;

      if (Object.keys(updates).length > 0) {
        await sb.from("experience_journeys").update(updates).eq("id", journeyId);
      }

      // If steps array provided, replace them
      if (Array.isArray(body.steps)) {
        // Delete existing steps
        await sb.from("journey_steps").delete().eq("journey_id", journeyId);

        // Insert new steps
        const stepsToInsert = body.steps.map((s: any, i: number) => ({
          journey_id: journeyId,
          step_order: s.step_order ?? i + 1,
          universe: s.universe || null,
          category: s.category?.trim() || null,
          description: s.description?.trim() || null,
          budget_min: s.budget_min ?? null,
          budget_max: s.budget_max ?? null,
          status: "pending",
        }));

        if (stepsToInsert.length > 0) {
          await sb.from("journey_steps").insert(stepsToInsert);
        }
      }

      // Return updated journey
      return res.json({ ok: true });
    } catch (e: any) {
      log.error({ err: e }, "PUT /journeys/:id error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // DELETE /api/conciergerie/journeys/:id — Supprimer (draft only)
  // -----------------------------------------------------------------------
  app.delete("/api/conciergerie/journeys/:id", zParams(JourneyIdParams), async (req: Request, res: Response) => {
    try {
      const auth = await ensureConciergeUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const journeyId = req.params.id;
      if (!isValidUUID(journeyId)) return res.status(400).json({ error: "Invalid journey ID" });

      const sb = supabase();

      const { data: existing } = await sb
        .from("experience_journeys")
        .select("id, status")
        .eq("id", journeyId)
        .eq("concierge_id", auth.conciergeId)
        .is("deleted_at", null)
        .single();

      if (!existing) return res.status(404).json({ error: "Parcours non trouvé" });
      if (existing.status !== "draft") return res.status(400).json({ error: "Seuls les brouillons peuvent être supprimés" });

      // Soft delete
      await sb.from("experience_journeys").update({ deleted_at: new Date().toISOString() }).eq("id", journeyId);

      return res.json({ ok: true });
    } catch (e: any) {
      log.error({ err: e }, "DELETE /journeys/:id error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/conciergerie/journeys/:id/send — Envoyer les demandes
  // -----------------------------------------------------------------------
  app.post("/api/conciergerie/journeys/:id/send", zParams(JourneyIdParams), async (req: Request, res: Response) => {
    try {
      const auth = await ensureConciergeUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const journeyId = req.params.id;
      if (!isValidUUID(journeyId)) return res.status(400).json({ error: "Invalid journey ID" });

      const sb = supabase();

      const { data: journey } = await sb
        .from("experience_journeys")
        .select("*")
        .eq("id", journeyId)
        .eq("concierge_id", auth.conciergeId)
        .is("deleted_at", null)
        .single();

      if (!journey) return res.status(404).json({ error: "Parcours non trouvé" });
      if (journey.status !== "draft") return res.status(400).json({ error: "Le parcours a déjà été envoyé" });

      // Get steps
      const { data: steps } = await sb
        .from("journey_steps")
        .select("*")
        .eq("journey_id", journeyId)
        .is("deleted_at", null)
        .order("step_order", { ascending: true });

      if (!steps || steps.length === 0) return res.status(400).json({ error: "Le parcours n'a aucune étape" });

      // Check all steps have requests
      const stepIds = steps.map((s: any) => s.id);
      const { data: allReqs } = await sb
        .from("step_requests")
        .select("step_id")
        .in("step_id", stepIds);

      const stepsWithRequests = new Set((allReqs ?? []).map((r: any) => r.step_id));
      const stepsWithoutRequests = steps.filter((s: any) => !stepsWithRequests.has(s.id));

      if (stepsWithoutRequests.length > 0) {
        return res.status(400).json({
          error: `Les étapes suivantes n'ont pas de demandes: ${stepsWithoutRequests.map((s: any) => s.step_order).join(", ")}`,
        });
      }

      // Update journey status
      await sb.from("experience_journeys").update({ status: "requesting" }).eq("id", journeyId);

      // Update all steps to "requesting"
      await sb.from("journey_steps").update({ status: "requesting" }).in("id", stepIds);

      // Send emails to each establishment with pending requests
      const { data: pendingReqs } = await sb
        .from("step_requests")
        .select("id, step_id, establishment_id, message, party_size, desired_date, desired_time, budget_hint")
        .in("step_id", stepIds)
        .eq("status", "pending");

      // Get unique establishment IDs
      const estIds = [...new Set((pendingReqs ?? []).map((r: any) => r.establishment_id))];

      if (estIds.length > 0) {
        // Get establishment emails (via pro_establishment_memberships → auth.users)
        const { data: memberships } = await sb
          .from("pro_establishment_memberships")
          .select("establishment_id, user_id")
          .in("establishment_id", estIds);

        const { data: establishments } = await sb
          .from("establishments")
          .select("id, name")
          .in("id", estIds);

        const estNameMap: Record<string, string> = {};
        for (const e of establishments ?? []) estNameMap[e.id] = e.name;

        // Get user emails
        const userIds = [...new Set((memberships ?? []).map((m: any) => m.user_id))];
        const userEmailMap: Record<string, string> = {};

        for (const uid of userIds) {
          const { data: userData } = await sb.auth.admin.getUserById(uid);
          if (userData?.user?.email) {
            userEmailMap[uid] = userData.user.email;
          }
        }

        // Group: estId → emails
        const estEmailMap: Record<string, string[]> = {};
        for (const m of memberships ?? []) {
          const email = userEmailMap[m.user_id];
          if (email) {
            if (!estEmailMap[m.establishment_id]) estEmailMap[m.establishment_id] = [];
            if (!estEmailMap[m.establishment_id].includes(email)) {
              estEmailMap[m.establishment_id].push(email);
            }
          }
        }

        // Send emails (fire-and-forget)
        for (const estId of estIds) {
          const emails = estEmailMap[estId] ?? [];
          if (emails.length === 0) continue;

          const reqsForEst = (pendingReqs ?? []).filter((r: any) => r.establishment_id === estId);
          const firstReq = reqsForEst[0];
          if (!firstReq) continue;

          // Find step description
          const step = steps.find((s: any) => s.id === firstReq.step_id);

          sendTemplateEmail({
            templateKey: "conciergerie_request_to_pro",
            lang: "fr",
            fromKey: "noreply",
            to: emails,
            variables: {
              concierge_name: auth.concierge.name,
              client_name: journey.client_name,
              party_size: String(journey.party_size),
              desired_date: journey.desired_date,
              desired_time: [journey.desired_time_start, journey.desired_time_end].filter(Boolean).join(" - "),
              step_description: step?.description ?? "",
              budget_hint: firstReq.budget_hint ?? "",
              message: firstReq.message ?? "",
              journey_title: journey.title ?? `Parcours du ${journey.desired_date}`,
            },
            ctaUrl: `https://sam.ma/pro?tab=conciergerie`,
            ctaLabel: "Répondre à la demande",
          }).catch((err) => log.error({ err }, "email error"));
        }
      }

      return res.json({ ok: true, status: "requesting" });
    } catch (e: any) {
      log.error({ err: e }, "POST /journeys/:id/send error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/conciergerie/steps/:stepId/requests — Envoyer demandes pour une étape
  // -----------------------------------------------------------------------
  app.post("/api/conciergerie/steps/:stepId/requests", zParams(StepIdParams), zBody(SendStepRequestsSchema), async (req: Request, res: Response) => {
    try {
      const auth = await ensureConciergeUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const stepId = req.params.stepId;
      if (!isValidUUID(stepId)) return res.status(400).json({ error: "Invalid step ID" });

      const body = req.body as SendStepRequestsPayload;
      if (!body.establishment_ids || body.establishment_ids.length === 0) {
        return res.status(400).json({ error: "At least one establishment_id is required" });
      }
      if (body.establishment_ids.length > 5) {
        return res.status(400).json({ error: "Maximum 5 establishments per step" });
      }

      const sb = supabase();

      // Verify step belongs to this concierge
      const { data: step } = await sb
        .from("journey_steps")
        .select("id, journey_id, description, budget_min, budget_max")
        .eq("id", stepId)
        .is("deleted_at", null)
        .single();

      if (!step) return res.status(404).json({ error: "Étape non trouvée" });

      const { data: journey } = await sb
        .from("experience_journeys")
        .select("id, concierge_id, client_name, party_size, desired_date, desired_time_start, desired_time_end")
        .eq("id", step.journey_id)
        .eq("concierge_id", auth.conciergeId)
        .single();

      if (!journey) return res.status(403).json({ error: "Accès refusé" });

      // Verify establishments exist
      const { data: ests } = await sb
        .from("establishments")
        .select("id, name")
        .in("id", body.establishment_ids);

      if (!ests || ests.length === 0) return res.status(400).json({ error: "Aucun établissement trouvé" });

      // Build budget hint
      const budgetParts: string[] = [];
      if (step.budget_min) budgetParts.push(`${step.budget_min} MAD`);
      if (step.budget_max) budgetParts.push(`${step.budget_max} MAD`);
      const budgetHint = budgetParts.length === 2
        ? `${budgetParts[0]} - ${budgetParts[1]}`
        : budgetParts[0] ?? null;

      // Create step_requests
      const requestsToInsert = ests.map((e: any) => ({
        step_id: stepId,
        establishment_id: e.id,
        message: body.message?.trim() || null,
        party_size: journey.party_size,
        desired_date: journey.desired_date,
        desired_time: [journey.desired_time_start, journey.desired_time_end].filter(Boolean).join(" - ") || null,
        budget_hint: budgetHint,
        status: "pending",
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48h expiry
      }));

      const { error: insertErr } = await sb.from("step_requests").insert(requestsToInsert);
      if (insertErr) throw insertErr;

      return res.status(201).json({ ok: true });
    } catch (e: any) {
      log.error({ err: e }, "POST /steps/:stepId/requests error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/conciergerie/search/establishments — Recherche
  // -----------------------------------------------------------------------
  app.get("/api/conciergerie/search/establishments", async (req: Request, res: Response) => {
    try {
      const auth = await ensureConciergeUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const q = (req.query.q as string)?.trim();
      const city = (req.query.city as string)?.trim();
      const universe = (req.query.universe as string)?.trim();
      const category = (req.query.category as string)?.trim();
      const limit = Math.min(30, Math.max(1, parseInt(String(req.query.limit ?? "15"), 10)));

      const sb = supabase();

      // Build list of allowed cities (concierge city + extra cities from admin)
      const [{ data: conciergeRow }, { data: extraCities }] = await Promise.all([
        sb.from("concierges").select("city").eq("id", auth.conciergeId).maybeSingle(),
        sb.from("concierge_allowed_cities").select("city").eq("concierge_id", auth.conciergeId),
      ]);

      const allowedCities: string[] = [];
      if (conciergeRow?.city) allowedCities.push(conciergeRow.city);
      for (const row of extraCities ?? []) {
        if ((row as any).city && !allowedCities.includes((row as any).city)) {
          allowedCities.push((row as any).city);
        }
      }

      let query = sb
        .from("establishments")
        .select("id, name, slug, cover_url, city, universe, category, rating_average")
        .eq("status", "active")
        .is("deleted_at", null)
        .limit(limit);

      if (q) query = query.ilike("name", `%${q}%`);

      // If explicit city filter, use it; otherwise restrict to allowed cities
      if (city) {
        query = query.ilike("city", `%${city}%`);
      } else if (allowedCities.length > 0) {
        // Filter by allowed cities (case-insensitive via or)
        const cityFilters = allowedCities.map((c) => `city.ilike.%${c}%`).join(",");
        query = query.or(cityFilters);
      }

      if (universe) query = query.eq("universe", universe);
      if (category) query = query.eq("category", category);

      const { data, error } = await query.order("rating_average", { ascending: false, nullsFirst: false });
      if (error) throw error;

      // Check which results are partners (for badge display)
      const resultIds = (data ?? []).map((e: any) => e.id);
      let partnerMap: Record<string, number> = {};
      if (resultIds.length > 0) {
        const { data: partnerRows } = await sb
          .from("concierge_partners")
          .select("establishment_id, commission_rate")
          .eq("concierge_id", auth.conciergeId)
          .in("establishment_id", resultIds)
          .is("deleted_at", null);

        for (const p of partnerRows ?? []) {
          partnerMap[(p as any).establishment_id] = (p as any).commission_rate;
        }
      }

      const results = (data ?? []).map((e: any) => ({
        id: e.id,
        name: e.name,
        slug: e.slug,
        cover_url: e.cover_url,
        city: e.city,
        universe: e.universe,
        category: e.category,
        rating: e.rating_average,
        is_partner: e.id in partnerMap,
        partner_commission: partnerMap[e.id] ?? null,
      }));

      return res.json({ results, allowed_cities: allowedCities });
    } catch (e: any) {
      log.error({ err: e }, "GET /search/establishments error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/conciergerie/scan-qr/:stepRequestId/generate — Générer le secret TOTP
  // -----------------------------------------------------------------------
  app.post("/api/conciergerie/scan-qr/:stepRequestId/generate", zParams(StepRequestIdParams), async (req: Request, res: Response) => {
    try {
      const auth = await ensureConciergeUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const { stepRequestId } = req.params;
      if (!stepRequestId || !/^[0-9a-f-]{36}$/i.test(stepRequestId)) {
        return res.status(400).json({ error: "Invalid step request ID" });
      }

      // Verify this step_request belongs to a journey of this concierge
      const sb = getAdminSupabase();
      const { data: stepReq } = await sb
        .from("step_requests")
        .select("id, step_id, status")
        .eq("id", stepRequestId)
        .maybeSingle();

      if (!stepReq) return res.status(404).json({ error: "Demande introuvable" });
      if (stepReq.status !== "accepted") {
        return res.status(400).json({ error: "La demande n'est pas encore acceptée." });
      }

      // Check ownership via step → journey → concierge_id
      const { data: step } = await sb
        .from("journey_steps")
        .select("journey_id")
        .eq("id", stepReq.step_id)
        .maybeSingle();

      if (!step) return res.status(404).json({ error: "Étape introuvable" });

      const { data: journey } = await sb
        .from("experience_journeys")
        .select("concierge_id")
        .eq("id", step.journey_id)
        .maybeSingle();

      if (!journey || journey.concierge_id !== auth.conciergeId) {
        return res.status(403).json({ error: "Accès non autorisé" });
      }

      const result = await generateConciergerieScanSecret(stepRequestId);
      if (!result.ok) return res.status(400).json({ error: result.error });

      return res.json({ ok: true });
    } catch (e: any) {
      log.error({ err: e }, "POST /scan-qr/:id/generate error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/conciergerie/scan-qr/:stepRequestId — Obtenir le QR data
  // -----------------------------------------------------------------------
  app.get("/api/conciergerie/scan-qr/:stepRequestId", zParams(StepRequestIdParams), async (req: Request, res: Response) => {
    try {
      const auth = await ensureConciergeUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const { stepRequestId } = req.params;
      if (!stepRequestId || !/^[0-9a-f-]{36}$/i.test(stepRequestId)) {
        return res.status(400).json({ error: "Invalid step request ID" });
      }

      // Verify ownership
      const sb = getAdminSupabase();
      const { data: stepReq } = await sb
        .from("step_requests")
        .select("id, step_id")
        .eq("id", stepRequestId)
        .maybeSingle();

      if (!stepReq) return res.status(404).json({ error: "Demande introuvable" });

      const { data: step } = await sb
        .from("journey_steps")
        .select("journey_id")
        .eq("id", stepReq.step_id)
        .maybeSingle();

      if (!step) return res.status(404).json({ error: "Étape introuvable" });

      const { data: journey } = await sb
        .from("experience_journeys")
        .select("concierge_id")
        .eq("id", step.journey_id)
        .maybeSingle();

      if (!journey || journey.concierge_id !== auth.conciergeId) {
        return res.status(403).json({ error: "Accès non autorisé" });
      }

      const result = await getConciergerieQrData(stepRequestId);
      if (!result.ok) return res.status(400).json({ error: result.error });

      return res.json({ payload: result.payload, expiresIn: result.expiresIn });
    } catch (e: any) {
      log.error({ err: e }, "GET /scan-qr/:id error");
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/conciergerie/partners — Partenaires avec stats & scoring
  // -----------------------------------------------------------------------
  app.get("/api/conciergerie/partners", async (req: Request, res: Response) => {
    try {
      const auth = await ensureConciergeUser(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const db = supabase();
      const conciergeId = auth.conciergeId;

      // 1. Fetch active partners
      const { data: partners, error: pErr } = await db
        .from("concierge_partners")
        .select("*")
        .eq("concierge_id", conciergeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (pErr) return res.status(500).json({ error: pErr.message });
      if (!partners || partners.length === 0) {
        return res.json({ partners: [], activity: [] });
      }

      const estIds = partners.map((p: any) => p.establishment_id);

      // 2. Fetch establishment info
      const { data: establishments } = await db
        .from("establishments")
        .select("id,name,city,cover_url,universe")
        .in("id", estIds);

      const estMap: Record<string, any> = {};
      for (const e of establishments ?? []) {
        estMap[e.id] = e;
      }

      // 3. Fetch all journey IDs for this concierge
      const { data: journeys } = await db
        .from("experience_journeys")
        .select("id")
        .eq("concierge_id", conciergeId)
        .is("deleted_at", null);

      const journeyIds = (journeys ?? []).map((j: any) => j.id);

      // 4. If no journeys, return partners with zero stats
      if (journeyIds.length === 0) {
        const result = partners.map((p: any, idx: number) => ({
          ...p,
          establishment_name: estMap[p.establishment_id]?.name ?? "—",
          establishment_city: estMap[p.establishment_id]?.city ?? null,
          establishment_cover_url: estMap[p.establishment_id]?.cover_url ?? null,
          establishment_universe: estMap[p.establishment_id]?.universe ?? null,
          total_requests: 0,
          accepted_requests: 0,
          acceptance_rate: 0,
          avg_response_time_hours: null,
          total_confirmed_bookings: 0,
          total_revenue: 0,
          score: 0,
          rank: idx + 1,
          badge: "none" as const,
        }));
        return res.json({ partners: result, activity: [] });
      }

      // 5. Fetch all steps for these journeys
      const { data: steps } = await db
        .from("journey_steps")
        .select("id,accepted_establishment_id,confirmed_price,status")
        .in("journey_id", journeyIds)
        .is("deleted_at", null);

      const stepIds = (steps ?? []).map((s: any) => s.id);

      // 6. Fetch all step_requests for these steps + partner establishments
      let allRequests: any[] = [];
      if (stepIds.length > 0) {
        const { data: reqs } = await db
          .from("step_requests")
          .select("id,step_id,establishment_id,status,proposed_price,created_at,responded_at")
          .in("step_id", stepIds)
          .in("establishment_id", estIds);

        allRequests = reqs ?? [];
      }

      // 7. Aggregate stats per establishment
      type EstStats = {
        total_requests: number;
        accepted_requests: number;
        response_times: number[]; // hours
        total_confirmed_bookings: number;
        total_revenue: number;
      };

      const statsMap: Record<string, EstStats> = {};
      for (const eid of estIds) {
        statsMap[eid] = {
          total_requests: 0,
          accepted_requests: 0,
          response_times: [],
          total_confirmed_bookings: 0,
          total_revenue: 0,
        };
      }

      // Count requests
      for (const r of allRequests) {
        const s = statsMap[r.establishment_id];
        if (!s) continue;
        s.total_requests++;
        if (r.status === "accepted") {
          s.accepted_requests++;
        }
        if (r.responded_at && r.created_at) {
          const hours =
            (new Date(r.responded_at).getTime() - new Date(r.created_at).getTime()) /
            (1000 * 60 * 60);
          if (hours >= 0) s.response_times.push(hours);
        }
      }

      // Count confirmed bookings + revenue from steps
      for (const step of steps ?? []) {
        const eid = (step as any).accepted_establishment_id;
        if (eid && statsMap[eid]) {
          statsMap[eid].total_confirmed_bookings++;
          statsMap[eid].total_revenue += (step as any).confirmed_price ?? 0;
        }
      }

      // 8. Calculate scores
      const maxBookings = Math.max(
        1,
        ...Object.values(statsMap).map((s) => s.total_confirmed_bookings),
      );
      const maxRevenue = Math.max(
        1,
        ...Object.values(statsMap).map((s) => s.total_revenue),
      );

      type ScoredPartner = any & { score: number };
      const scored: ScoredPartner[] = partners.map((p: any) => {
        const s = statsMap[p.establishment_id] ?? {
          total_requests: 0,
          accepted_requests: 0,
          response_times: [],
          total_confirmed_bookings: 0,
          total_revenue: 0,
        };

        const acceptanceRate =
          s.total_requests > 0 ? (s.accepted_requests / s.total_requests) * 100 : 0;

        const avgResponseHours =
          s.response_times.length > 0
            ? s.response_times.reduce((a: number, b: number) => a + b, 0) /
              s.response_times.length
            : null;

        // Speed score: < 1h = 1.0, > 24h = 0
        let speedScore = 0;
        if (avgResponseHours !== null) {
          speedScore = Math.max(0, Math.min(1, (24 - avgResponseHours) / 24));
        }

        const volumeScore = Math.min(s.total_confirmed_bookings / maxBookings, 1);
        const revenueScore = Math.min(s.total_revenue / maxRevenue, 1);

        const score = Math.round(
          (acceptanceRate / 100) * 40 +
            speedScore * 25 +
            volumeScore * 20 +
            revenueScore * 15,
        );

        return {
          ...p,
          establishment_name: estMap[p.establishment_id]?.name ?? "—",
          establishment_city: estMap[p.establishment_id]?.city ?? null,
          establishment_cover_url: estMap[p.establishment_id]?.cover_url ?? null,
          establishment_universe: estMap[p.establishment_id]?.universe ?? null,
          total_requests: s.total_requests,
          accepted_requests: s.accepted_requests,
          acceptance_rate: Math.round(acceptanceRate),
          avg_response_time_hours: avgResponseHours !== null ? Math.round(avgResponseHours * 10) / 10 : null,
          total_confirmed_bookings: s.total_confirmed_bookings,
          total_revenue: s.total_revenue,
          score,
        };
      });

      // 9. Sort by score desc, assign rank & badge
      scored.sort((a: ScoredPartner, b: ScoredPartner) => b.score - a.score);
      const total = scored.length;
      scored.forEach((p: ScoredPartner, idx: number) => {
        p.rank = idx + 1;
        if (p.score >= 80 || (total >= 5 && idx < Math.ceil(total * 0.1))) {
          p.badge = "gold";
        } else if (p.score >= 60 || (total >= 5 && idx < Math.ceil(total * 0.3))) {
          p.badge = "silver";
        } else if (p.score >= 40 || (total >= 5 && idx < Math.ceil(total * 0.5))) {
          p.badge = "bronze";
        } else {
          p.badge = "none";
        }
      });

      // 10. Build activity feed (last 10 events)
      const activity: any[] = [];

      // Recent partner additions
      for (const p of partners) {
        activity.push({
          type: "partner_added",
          establishment_name: estMap[(p as any).establishment_id]?.name ?? "—",
          date: (p as any).created_at,
        });
      }

      // Recent acceptations
      const recentAccepted = allRequests
        .filter((r: any) => r.status === "accepted" && r.responded_at)
        .sort(
          (a: any, b: any) =>
            new Date(b.responded_at).getTime() - new Date(a.responded_at).getTime(),
        )
        .slice(0, 10);

      for (const r of recentAccepted) {
        activity.push({
          type: "request_accepted",
          establishment_name: estMap[r.establishment_id]?.name ?? "—",
          date: r.responded_at,
          details: r.proposed_price
            ? `${(r.proposed_price / 100).toFixed(0)} DH`
            : undefined,
        });
      }

      // Recent refusals
      const recentRefused = allRequests
        .filter((r: any) => r.status === "refused" && r.responded_at)
        .sort(
          (a: any, b: any) =>
            new Date(b.responded_at).getTime() - new Date(a.responded_at).getTime(),
        )
        .slice(0, 5);

      for (const r of recentRefused) {
        activity.push({
          type: "request_refused",
          establishment_name: estMap[r.establishment_id]?.name ?? "—",
          date: r.responded_at,
        });
      }

      // Sort activity by date desc, limit to 10
      activity.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      return res.json({
        partners: scored,
        activity: activity.slice(0, 10),
      });
    } catch (e: any) {
      log.error({ err: e }, "GET /conciergerie/partners error");
      return res.status(500).json({ error: "Internal error" });
    }
  });
}
