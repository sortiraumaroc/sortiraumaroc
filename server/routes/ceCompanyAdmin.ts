/**
 * CE Company Admin Routes — Espace Entreprise
 *
 * Endpoints for company managers to manage employees, view scans, etc.
 * Auth: consumer Supabase token → verified as company_admin
 */

import type { Express, Request, Response } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  validateEmployee,
  suspendEmployee,
  reactivateEmployee,
  softDeleteEmployee,
  formatEmployeeName,
} from "../ceLogic";
import {
  ceListQuerySchema,
  ceScansQuerySchema,
  updateCompanySettingsSchema,
} from "../schemas/ce";

// ============================================================================
// Auth Helper
// ============================================================================

async function ensureCeAdmin(req: Request): Promise<
  | { ok: true; userId: string; companyId: string; adminId: string; role: string }
  | { ok: false; status: number; error: string }
> {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return { ok: false, status: 401, error: "Missing token" };

  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401, error: "Invalid token" };

    const userId = data.user.id;

    // Check company_admins membership
    const { data: admin } = await sb
      .from("company_admins")
      .select("id, company_id, role")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!admin) return { ok: false, status: 403, error: "Vous n'êtes pas gestionnaire CE." };

    // Check company active
    const { data: company } = await sb
      .from("companies")
      .select("id, status")
      .eq("id", admin.company_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!company || company.status !== "active") {
      return { ok: false, status: 403, error: "L'entreprise n'est pas active." };
    }

    return { ok: true, userId, companyId: admin.company_id, adminId: admin.id, role: admin.role };
  } catch {
    return { ok: false, status: 500, error: "Erreur d'authentification" };
  }
}

const supabase = () => getAdminSupabase();

// ============================================================================
// CSV Helper
// ============================================================================

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines: string[] = [headers.join(";")];
  for (const row of rows) {
    const values = headers.map((h) => {
      const val = String((row as any)[h] ?? "");
      if (val.includes(";") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    lines.push(values.join(";"));
  }
  return lines.join("\n");
}

// ============================================================================
// Route Registration
// ============================================================================

export function registerCeCompanyAdminRoutes(app: Express): void {
  // --------------------------------------------------
  // Company Info
  // --------------------------------------------------

  app.get("/api/ce/company/me", async (req, res) => {
    const auth = await ensureCeAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const sb = supabase();
    const { data, error } = await sb
      .from("companies")
      .select("*")
      .eq("id", auth.companyId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, data });
  });

  // --------------------------------------------------
  // Employees
  // --------------------------------------------------

  app.get("/api/ce/company/employees", async (req, res) => {
    const auth = await ensureCeAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const parsed = ceListQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });
    const { page, limit, search, status, order } = parsed.data;
    const offset = (page - 1) * limit;

    const sb = supabase();
    let query = sb
      .from("company_employees")
      .select("*", { count: "exact" })
      .eq("company_id", auth.companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: order === "asc" })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);

    const { data: employees, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const enriched = await Promise.all(
      (employees ?? []).map(async (emp: any) => {
        const { data: user } = await sb
          .from("consumer_users")
          .select("full_name, email, phone, avatar_url")
          .eq("id", emp.user_id)
          .maybeSingle();

        const { data: lastScan } = await sb
          .from("ce_scans")
          .select("scan_datetime, establishment_id")
          .eq("employee_id", emp.id)
          .order("scan_datetime", { ascending: false })
          .limit(1)
          .maybeSingle();

        let lastScanEstablishment = null;
        if (lastScan?.establishment_id) {
          const { data: est } = await sb.from("establishments").select("name").eq("id", lastScan.establishment_id).maybeSingle();
          lastScanEstablishment = est?.name ?? null;
        }

        return {
          ...emp,
          user_name: user?.full_name ?? null,
          user_email: user?.email ?? null,
          user_phone: user?.phone ?? null,
          user_avatar: user?.avatar_url ?? null,
          last_scan_at: lastScan?.scan_datetime ?? null,
          last_scan_establishment: lastScanEstablishment,
        };
      }),
    );

    res.json({ ok: true, data: enriched, total: count ?? 0, page, limit });
  });

  app.put("/api/ce/company/employees/:id/validate", async (req, res) => {
    const auth = await ensureCeAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (auth.role === "viewer") return res.status(403).json({ error: "Accès lecture seule" });

    // Verify employee belongs to this company
    const sb = supabase();
    const { data: emp } = await sb.from("company_employees").select("company_id").eq("id", req.params.id).maybeSingle();
    if (!emp || emp.company_id !== auth.companyId) return res.status(404).json({ error: "Salarié introuvable" });

    const result = await validateEmployee(req.params.id, auth.adminId);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  });

  app.put("/api/ce/company/employees/:id/suspend", async (req, res) => {
    const auth = await ensureCeAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (auth.role === "viewer") return res.status(403).json({ error: "Accès lecture seule" });

    const sb = supabase();
    const { data: emp } = await sb.from("company_employees").select("company_id").eq("id", req.params.id).maybeSingle();
    if (!emp || emp.company_id !== auth.companyId) return res.status(404).json({ error: "Salarié introuvable" });

    const result = await suspendEmployee(req.params.id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  });

  app.put("/api/ce/company/employees/:id/reactivate", async (req, res) => {
    const auth = await ensureCeAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (auth.role === "viewer") return res.status(403).json({ error: "Accès lecture seule" });

    const sb = supabase();
    const { data: emp } = await sb.from("company_employees").select("company_id").eq("id", req.params.id).maybeSingle();
    if (!emp || emp.company_id !== auth.companyId) return res.status(404).json({ error: "Salarié introuvable" });

    const result = await reactivateEmployee(req.params.id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  });

  app.delete("/api/ce/company/employees/:id", async (req, res) => {
    const auth = await ensureCeAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (auth.role === "viewer") return res.status(403).json({ error: "Accès lecture seule" });

    const sb = supabase();
    const { data: emp } = await sb.from("company_employees").select("company_id").eq("id", req.params.id).maybeSingle();
    if (!emp || emp.company_id !== auth.companyId) return res.status(404).json({ error: "Salarié introuvable" });

    const result = await softDeleteEmployee(req.params.id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  });

  // --------------------------------------------------
  // Scans History
  // --------------------------------------------------

  app.get("/api/ce/company/scans", async (req, res) => {
    const auth = await ensureCeAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const parsed = ceScansQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });
    const { page, limit, employee_id, establishment_id, status, from, to } = parsed.data;
    const offset = (page - 1) * limit;

    const sb = supabase();
    let query = sb
      .from("ce_scans")
      .select("*", { count: "exact" })
      .eq("company_id", auth.companyId)
      .order("scan_datetime", { ascending: false })
      .range(offset, offset + limit - 1);

    if (employee_id) query = query.eq("employee_id", employee_id);
    if (establishment_id) query = query.eq("establishment_id", establishment_id);
    if (status) query = query.eq("status", status);
    if (from) query = query.gte("scan_datetime", from);
    if (to) query = query.lte("scan_datetime", to);

    const { data: scans, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const enriched = await Promise.all(
      (scans ?? []).map(async (scan: any) => {
        const { data: emp } = await sb.from("company_employees").select("user_id").eq("id", scan.employee_id).maybeSingle();
        const { data: user } = emp ? await sb.from("consumer_users").select("full_name").eq("id", emp.user_id).maybeSingle() : { data: null };
        const { data: est } = await sb.from("establishments").select("name, slug").eq("id", scan.establishment_id).maybeSingle();
        const { data: adv } = await sb.from("pro_ce_advantages").select("description, advantage_type, advantage_value").eq("id", scan.advantage_id).maybeSingle();

        return {
          ...scan,
          employee_name: user?.full_name ?? null,
          employee_display_name: formatEmployeeName(user?.full_name ?? null),
          establishment_name: est?.name ?? null,
          advantage_description: adv?.description ?? null,
          advantage_type: adv?.advantage_type ?? null,
        };
      }),
    );

    res.json({ ok: true, data: enriched, total: count ?? 0, page, limit });
  });

  // --------------------------------------------------
  // Dashboard
  // --------------------------------------------------

  app.get("/api/ce/company/dashboard", async (req, res) => {
    const auth = await ensureCeAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const sb = supabase();
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const cid = auth.companyId;

    const [total, active, pending, suspended, scansToday, scansWeek, scansMonth] = await Promise.all([
      sb.from("company_employees").select("id", { count: "exact", head: true }).eq("company_id", cid).is("deleted_at", null),
      sb.from("company_employees").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("status", "active").is("deleted_at", null),
      sb.from("company_employees").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("status", "pending").is("deleted_at", null),
      sb.from("company_employees").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("status", "suspended").is("deleted_at", null),
      sb.from("ce_scans").select("id", { count: "exact", head: true }).eq("company_id", cid).gte("scan_datetime", todayStr),
      sb.from("ce_scans").select("id", { count: "exact", head: true }).eq("company_id", cid).gte("scan_datetime", weekAgo),
      sb.from("ce_scans").select("id", { count: "exact", head: true }).eq("company_id", cid).gte("scan_datetime", monthAgo),
    ]);

    // Top 5 establishments
    const { data: topScans } = await sb
      .from("ce_scans")
      .select("establishment_id")
      .eq("company_id", cid)
      .gte("scan_datetime", monthAgo)
      .eq("status", "validated");

    const estCounts: Record<string, number> = {};
    for (const s of topScans ?? []) {
      estCounts[s.establishment_id] = (estCounts[s.establishment_id] ?? 0) + 1;
    }
    const topEntries = Object.entries(estCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topEstablishments = await Promise.all(
      topEntries.map(async ([estId, count]) => {
        const { data: est } = await sb.from("establishments").select("name").eq("id", estId).maybeSingle();
        return { establishment_id: estId, establishment_name: est?.name ?? "Inconnu", scans_count: count };
      }),
    );

    res.json({
      ok: true,
      data: {
        total_employees: total.count ?? 0,
        active_employees: active.count ?? 0,
        pending_employees: pending.count ?? 0,
        suspended_employees: suspended.count ?? 0,
        scans_today: scansToday.count ?? 0,
        scans_this_week: scansWeek.count ?? 0,
        scans_this_month: scansMonth.count ?? 0,
        top_establishments: topEstablishments,
      },
    });
  });

  // --------------------------------------------------
  // Settings
  // --------------------------------------------------

  app.put("/api/ce/company/settings", async (req, res) => {
    const auth = await ensureCeAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (auth.role === "viewer") return res.status(403).json({ error: "Accès lecture seule" });

    const parsed = updateCompanySettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.issues });

    const sb = supabase();
    const { data, error } = await sb
      .from("companies")
      .update(parsed.data)
      .eq("id", auth.companyId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, data });
  });

  // --------------------------------------------------
  // CSV Exports
  // --------------------------------------------------

  app.get("/api/ce/company/export/employees", async (req, res) => {
    const auth = await ensureCeAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const sb = supabase();
    const { data: employees } = await sb
      .from("company_employees")
      .select("*")
      .eq("company_id", auth.companyId)
      .is("deleted_at", null)
      .order("created_at");

    const rows = await Promise.all(
      (employees ?? []).map(async (emp: any) => {
        const { data: user } = await sb.from("consumer_users").select("full_name, email, phone").eq("id", emp.user_id).maybeSingle();
        return {
          nom: user?.full_name ?? "",
          email: user?.email ?? "",
          telephone: user?.phone ?? "",
          matricule: emp.employee_number ?? "",
          statut: emp.status,
          profil_complet: emp.profile_complete ? "Oui" : "Non",
          inscrit_le: emp.created_at,
          valide_le: emp.validated_at ?? "",
        };
      }),
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=salaries-ce.csv");
    res.send("\uFEFF" + toCSV(rows));
  });

  app.get("/api/ce/company/export/scans", async (req, res) => {
    const auth = await ensureCeAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const sb = supabase();
    const { data: scans } = await sb
      .from("ce_scans")
      .select("*")
      .eq("company_id", auth.companyId)
      .order("scan_datetime", { ascending: false })
      .limit(5000);

    const rows = await Promise.all(
      (scans ?? []).map(async (scan: any) => {
        const { data: emp } = await sb.from("company_employees").select("user_id").eq("id", scan.employee_id).maybeSingle();
        const { data: user } = emp ? await sb.from("consumer_users").select("full_name").eq("id", emp.user_id).maybeSingle() : { data: null };
        const { data: est } = await sb.from("establishments").select("name").eq("id", scan.establishment_id).maybeSingle();
        const { data: adv } = await sb.from("pro_ce_advantages").select("description").eq("id", scan.advantage_id).maybeSingle();
        return {
          date: scan.scan_datetime,
          salarie: user?.full_name ?? "",
          etablissement: est?.name ?? "",
          avantage: adv?.description ?? "",
          statut: scan.status,
        };
      }),
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=scans-ce.csv");
    res.send("\uFEFF" + toCSV(rows));
  });
}
