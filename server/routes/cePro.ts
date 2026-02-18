/**
 * CE Pro Routes — PRO/Establishment endpoints
 *
 * Scan validation, advantage management, scan history for PRO.
 */

import type { Express, Request } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  validateCeScan,
  formatEmployeeName,
  syncEstablishmentCeFlag,
} from "../ceLogic";
import {
  validateScanSchema,
  updateAdvantageSchema,
  createAdvantageSchema,
  ceScansQuerySchema,
} from "../schemas/ce";

// ============================================================================
// Auth Helper (PRO)
// ============================================================================

type ProUser = { id: string; email?: string | null };

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token && token.trim() ? token.trim() : null;
}

async function getProUser(req: Request): Promise<ProUser | null> {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return null;

  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email };
  } catch {
    return null;
  }
}

async function ensureProRole(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: string } | { ok: false; status: number; error: string }> {
  const sb = getAdminSupabase();
  const { data: membership } = await sb
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", args.establishmentId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (!membership) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true, role: membership.role };
}

const supabase = () => getAdminSupabase();

// ============================================================================
// Route Registration
// ============================================================================

export function registerCeProRoutes(app: Express): void {
  // --------------------------------------------------
  // Scan CE QR Code
  // --------------------------------------------------

  app.post("/api/pro/ce/scan", async (req, res) => {
    const user = await getProUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const parsed = validateScanSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.issues });

    // Verify user has access to this establishment
    const roleResult = await ensureProRole({ establishmentId: parsed.data.establishment_id, userId: user.id });
    if (!roleResult.ok) return res.status(roleResult.status).json({ error: roleResult.error });

    // Only certain roles can scan
    const allowedScanRoles = ["owner", "manager", "reception"];
    if (!allowedScanRoles.includes(roleResult.role)) {
      return res.status(403).json({ error: "Vous n'avez pas la permission de scanner." });
    }

    const result = await validateCeScan(parsed.data.qr_payload, parsed.data.establishment_id, user.id);
    res.json({ ok: true, data: result });
  });

  // --------------------------------------------------
  // Scan History (for this establishment)
  // --------------------------------------------------

  app.get("/api/pro/ce/scans", async (req, res) => {
    const user = await getProUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const establishmentId = req.query.establishment_id as string;
    if (!establishmentId) return res.status(400).json({ error: "establishment_id required" });

    const roleResult = await ensureProRole({ establishmentId, userId: user.id });
    if (!roleResult.ok) return res.status(roleResult.status).json({ error: roleResult.error });

    const parsed = ceScansQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });
    const { page, limit, status, from, to } = parsed.data;
    const offset = (page - 1) * limit;

    const sb = supabase();
    let query = sb
      .from("ce_scans")
      .select("*", { count: "exact" })
      .eq("establishment_id", establishmentId)
      .order("scan_datetime", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (from) query = query.gte("scan_datetime", from);
    if (to) query = query.lte("scan_datetime", to);

    const { data: scans, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Enrich with GDPR-compliant employee names
    const enriched = await Promise.all(
      (scans ?? []).map(async (scan: any) => {
        const { data: emp } = await sb.from("company_employees").select("user_id").eq("id", scan.employee_id).maybeSingle();
        const { data: userData } = emp ? await sb.from("consumer_users").select("full_name").eq("id", emp.user_id).maybeSingle() : { data: null };
        const { data: company } = await sb.from("companies").select("name").eq("id", scan.company_id).maybeSingle();
        const { data: adv } = await sb.from("pro_ce_advantages").select("description, advantage_type, advantage_value").eq("id", scan.advantage_id).maybeSingle();

        return {
          ...scan,
          employee_display_name: formatEmployeeName(userData?.full_name ?? null),
          company_name: company?.name ?? null,
          advantage_description: adv?.description ?? null,
          advantage_type: adv?.advantage_type ?? null,
          advantage_value: adv?.advantage_value ?? null,
        };
      }),
    );

    res.json({ ok: true, data: enriched, total: count ?? 0, page, limit });
  });

  // --------------------------------------------------
  // Get CE Advantage for this establishment
  // --------------------------------------------------

  app.get("/api/pro/ce/advantage", async (req, res) => {
    const user = await getProUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const establishmentId = req.query.establishment_id as string;
    if (!establishmentId) return res.status(400).json({ error: "establishment_id required" });

    const roleResult = await ensureProRole({ establishmentId, userId: user.id });
    if (!roleResult.ok) return res.status(roleResult.status).json({ error: roleResult.error });

    const sb = supabase();
    const { data } = await sb
      .from("pro_ce_advantages")
      .select("*")
      .eq("establishment_id", establishmentId)
      .is("deleted_at", null)
      .maybeSingle();

    res.json({ ok: true, data: data ?? null });
  });

  // --------------------------------------------------
  // Update CE Advantage (PRO self-management)
  // --------------------------------------------------

  app.put("/api/pro/ce/advantage", async (req, res) => {
    const user = await getProUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const establishmentId = req.body.establishment_id as string;
    if (!establishmentId) return res.status(400).json({ error: "establishment_id required" });

    const roleResult = await ensureProRole({ establishmentId, userId: user.id });
    if (!roleResult.ok) return res.status(roleResult.status).json({ error: roleResult.error });

    // Only owner/manager can manage advantages
    if (!["owner", "manager"].includes(roleResult.role)) {
      return res.status(403).json({ error: "Permission insuffisante" });
    }

    const sb = supabase();

    // Check if advantage exists
    const { data: existing } = await sb
      .from("pro_ce_advantages")
      .select("id")
      .eq("establishment_id", establishmentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      // Update
      const parsed = updateAdvantageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.issues });

      const { data, error } = await sb
        .from("pro_ce_advantages")
        .update(parsed.data)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      await syncEstablishmentCeFlag(establishmentId);
      return res.json({ ok: true, data });
    } else {
      // Create
      const parsed = createAdvantageSchema.safeParse({ ...req.body, establishment_id: establishmentId });
      if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.issues });

      const { data, error } = await sb
        .from("pro_ce_advantages")
        .insert({ ...parsed.data, created_by: user.id })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      await syncEstablishmentCeFlag(establishmentId);
      return res.json({ ok: true, data });
    }
  });

  // --------------------------------------------------
  // CE Stats for this establishment
  // --------------------------------------------------

  app.get("/api/pro/ce/stats", async (req, res) => {
    const user = await getProUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const establishmentId = req.query.establishment_id as string;
    if (!establishmentId) return res.status(400).json({ error: "establishment_id required" });

    const roleResult = await ensureProRole({ establishmentId, userId: user.id });
    if (!roleResult.ok) return res.status(roleResult.status).json({ error: roleResult.error });

    const sb = supabase();
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [today, week, month, total] = await Promise.all([
      sb.from("ce_scans").select("id", { count: "exact", head: true }).eq("establishment_id", establishmentId).gte("scan_datetime", todayStr).eq("status", "validated"),
      sb.from("ce_scans").select("id", { count: "exact", head: true }).eq("establishment_id", establishmentId).gte("scan_datetime", weekAgo).eq("status", "validated"),
      sb.from("ce_scans").select("id", { count: "exact", head: true }).eq("establishment_id", establishmentId).gte("scan_datetime", monthAgo).eq("status", "validated"),
      sb.from("ce_scans").select("id", { count: "exact", head: true }).eq("establishment_id", establishmentId).eq("status", "validated"),
    ]);

    res.json({
      ok: true,
      data: {
        scans_today: today.count ?? 0,
        scans_this_week: week.count ?? 0,
        scans_this_month: month.count ?? 0,
        scans_total: total.count ?? 0,
      },
    });
  });
}
