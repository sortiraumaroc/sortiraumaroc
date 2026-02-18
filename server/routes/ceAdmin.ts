/**
 * CE Admin Routes — Back Office
 *
 * CRUD for companies, advantages, employees, scans, dashboard, CSV exports.
 * All endpoints require admin session.
 */

import type { Express, RequestHandler } from "express";
import { parseCookies, getSessionCookieName, verifyAdminSessionToken, type AdminSessionPayload } from "../adminSession";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  generateRegistrationCode,
  generateCompanySlug,
  formatEmployeeName,
  syncEstablishmentCeFlag,
} from "../ceLogic";
import {
  createCompanySchema,
  updateCompanySchema,
  createAdvantageSchema,
  updateAdvantageSchema,
  ceListQuerySchema,
  ceScansQuerySchema,
} from "../schemas/ce";

// ============================================================================
// Admin Session Helper (same pattern as adminInventory.ts)
// ============================================================================

function getAdminSessionToken(req: Parameters<RequestHandler>[0]): string | null {
  const cookies = parseCookies(req.header("cookie") ?? undefined);
  const cookieToken = cookies[getSessionCookieName()];
  if (cookieToken) return cookieToken;
  const headerToken = req.header("x-admin-session") ?? undefined;
  if (headerToken) return headerToken;
  const apiKey = req.header("x-api-key") ?? undefined;
  if (apiKey && apiKey === process.env.ADMIN_API_KEY) return apiKey;
  return null;
}

function requireAdminSession(req: Parameters<RequestHandler>[0]): AdminSessionPayload | null {
  const token = getAdminSessionToken(req);
  if (!token) return null;
  const session = verifyAdminSessionToken(token);
  if (!session) return null;
  return session;
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

export function registerCeAdminRoutes(app: Express): void {
  // --------------------------------------------------
  // Companies CRUD
  // --------------------------------------------------

  app.get("/api/admin/ce/companies", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const parsed = ceListQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
    const { page, limit, search, status, order } = parsed.data;
    const offset = (page - 1) * limit;

    const sb = supabase();
    let query = sb
      .from("companies")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: order === "asc" })
      .range(offset, offset + limit - 1);

    if (search) query = query.or(`name.ilike.%${search}%,contact_email.ilike.%${search}%,slug.ilike.%${search}%`);
    if (status) query = query.eq("status", status);

    const { data, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Enrich with employee counts
    const companies = data ?? [];
    const enriched = await Promise.all(
      companies.map(async (c: any) => {
        const { count: total } = await sb.from("company_employees").select("id", { count: "exact", head: true }).eq("company_id", c.id).is("deleted_at", null);
        const { count: active } = await sb.from("company_employees").select("id", { count: "exact", head: true }).eq("company_id", c.id).eq("status", "active").is("deleted_at", null);
        const { count: pending } = await sb.from("company_employees").select("id", { count: "exact", head: true }).eq("company_id", c.id).eq("status", "pending").is("deleted_at", null);
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count: scans } = await sb.from("ce_scans").select("id", { count: "exact", head: true }).eq("company_id", c.id).gte("scan_datetime", monthAgo);
        return {
          ...c,
          employees_count: total ?? 0,
          active_employees_count: active ?? 0,
          pending_employees_count: pending ?? 0,
          scans_this_month: scans ?? 0,
        };
      }),
    );

    res.json({ ok: true, data: enriched, total: count ?? 0, page, limit });
  });

  app.post("/api/admin/ce/companies", async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const parsed = createCompanySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.issues });

      const slug = await generateCompanySlug(parsed.data.name);
      const registrationCode = generateRegistrationCode();

      const sb = supabase();
      const { data, error } = await sb
        .from("companies")
        .insert({ ...parsed.data, slug, registration_code: registrationCode })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true, data });
    } catch (err: any) {
      console.error("[CE] Error creating company:", err);
      res.status(500).json({ error: err.message || "Erreur serveur" });
    }
  });

  app.get("/api/admin/ce/companies/:id", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const sb = supabase();
    const { data, error } = await sb
      .from("companies")
      .select("*")
      .eq("id", req.params.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Entreprise introuvable" });
    res.json({ ok: true, data });
  });

  app.put("/api/admin/ce/companies/:id", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const parsed = updateCompanySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.issues });

    const sb = supabase();
    const { data, error } = await sb
      .from("companies")
      .update(parsed.data)
      .eq("id", req.params.id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, data });
  });

  app.delete("/api/admin/ce/companies/:id", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const sb = supabase();
    const { error } = await sb
      .from("companies")
      .update({ deleted_at: new Date().toISOString(), status: "expired" })
      .eq("id", req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  app.post("/api/admin/ce/companies/:id/regenerate-link", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const newCode = generateRegistrationCode();
    const sb = supabase();
    const { data, error } = await sb
      .from("companies")
      .update({ registration_code: newCode })
      .eq("id", req.params.id)
      .is("deleted_at", null)
      .select("id, registration_code, slug")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, data });
  });

  // --------------------------------------------------
  // Company Employees
  // --------------------------------------------------

  app.get("/api/admin/ce/companies/:id/employees", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const parsed = ceListQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });
    const { page, limit, search, status, order } = parsed.data;
    const offset = (page - 1) * limit;

    const sb = supabase();
    let query = sb
      .from("company_employees")
      .select("*", { count: "exact" })
      .eq("company_id", req.params.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: order === "asc" })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);

    const { data: employees, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Enrich with user info
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
          const { data: est } = await sb
            .from("establishments")
            .select("name")
            .eq("id", lastScan.establishment_id)
            .maybeSingle();
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

  // --------------------------------------------------
  // Company Scans
  // --------------------------------------------------

  app.get("/api/admin/ce/companies/:id/scans", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const parsed = ceScansQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });
    const { page, limit, status, from, to } = parsed.data;
    const offset = (page - 1) * limit;

    const sb = supabase();
    let query = sb
      .from("ce_scans")
      .select("*", { count: "exact" })
      .eq("company_id", req.params.id)
      .order("scan_datetime", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (from) query = query.gte("scan_datetime", from);
    if (to) query = query.lte("scan_datetime", to);

    const { data: scans, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Enrich scans
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
          establishment_slug: est?.slug ?? null,
          advantage_description: adv?.description ?? null,
          advantage_type: adv?.advantage_type ?? null,
          advantage_value: adv?.advantage_value ?? null,
        };
      }),
    );

    res.json({ ok: true, data: enriched, total: count ?? 0, page, limit });
  });

  // --------------------------------------------------
  // Dashboard
  // --------------------------------------------------

  app.get("/api/admin/ce/dashboard", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const sb = supabase();
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [companies, activeCompanies, employees, activeEmps, pendingEmps, advantages, activeAdvantages, scansToday, scansWeek, scansMonth] = await Promise.all([
      sb.from("companies").select("id", { count: "exact", head: true }).is("deleted_at", null),
      sb.from("companies").select("id", { count: "exact", head: true }).eq("status", "active").is("deleted_at", null),
      sb.from("company_employees").select("id", { count: "exact", head: true }).is("deleted_at", null),
      sb.from("company_employees").select("id", { count: "exact", head: true }).eq("status", "active").is("deleted_at", null),
      sb.from("company_employees").select("id", { count: "exact", head: true }).eq("status", "pending").is("deleted_at", null),
      sb.from("pro_ce_advantages").select("id", { count: "exact", head: true }).is("deleted_at", null),
      sb.from("pro_ce_advantages").select("id", { count: "exact", head: true }).eq("is_active", true).is("deleted_at", null),
      sb.from("ce_scans").select("id", { count: "exact", head: true }).gte("scan_datetime", todayStr),
      sb.from("ce_scans").select("id", { count: "exact", head: true }).gte("scan_datetime", weekAgo),
      sb.from("ce_scans").select("id", { count: "exact", head: true }).gte("scan_datetime", monthAgo),
    ]);

    // Top establishments by scans this month
    const { data: topScans } = await sb
      .from("ce_scans")
      .select("establishment_id")
      .gte("scan_datetime", monthAgo)
      .eq("status", "validated");

    const estCounts: Record<string, number> = {};
    for (const s of topScans ?? []) {
      estCounts[s.establishment_id] = (estCounts[s.establishment_id] ?? 0) + 1;
    }
    const topEntries = Object.entries(estCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const topEstablishments = await Promise.all(
      topEntries.map(async ([estId, count]) => {
        const { data: est } = await sb.from("establishments").select("name").eq("id", estId).maybeSingle();
        return { establishment_id: estId, establishment_name: est?.name ?? "Inconnu", scans_count: count };
      }),
    );

    res.json({
      ok: true,
      data: {
        total_companies: companies.count ?? 0,
        active_companies: activeCompanies.count ?? 0,
        total_employees: employees.count ?? 0,
        active_employees: activeEmps.count ?? 0,
        pending_employees: pendingEmps.count ?? 0,
        total_advantages: advantages.count ?? 0,
        active_advantages: activeAdvantages.count ?? 0,
        scans_today: scansToday.count ?? 0,
        scans_this_week: scansWeek.count ?? 0,
        scans_this_month: scansMonth.count ?? 0,
        top_establishments: topEstablishments,
      },
    });
  });

  // --------------------------------------------------
  // Advantages CRUD
  // --------------------------------------------------

  app.get("/api/admin/ce/advantages", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const parsed = ceListQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });
    const { page, limit, search, order } = parsed.data;
    const offset = (page - 1) * limit;

    const sb = supabase();
    let query = sb
      .from("pro_ce_advantages")
      .select("*, establishments!inner(id, name, slug, city, universe, category, cover_url)", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: order === "asc" })
      .range(offset, offset + limit - 1);

    if (search) query = query.or(`description.ilike.%${search}%,establishments.name.ilike.%${search}%`);

    const { data, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, data: data ?? [], total: count ?? 0, page, limit });
  });

  app.post("/api/admin/ce/establishments/:id/advantages", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const parsed = createAdvantageSchema.safeParse({ ...req.body, establishment_id: req.params.id });
    if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.issues });

    const sb = supabase();
    const { data, error } = await sb
      .from("pro_ce_advantages")
      .insert({ ...parsed.data, created_by: session.sub })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await syncEstablishmentCeFlag(req.params.id);
    res.json({ ok: true, data });
  });

  app.put("/api/admin/ce/advantages/:id", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const parsed = updateAdvantageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.issues });

    const sb = supabase();

    // Get establishment_id before update for flag sync
    const { data: existing } = await sb.from("pro_ce_advantages").select("establishment_id").eq("id", req.params.id).maybeSingle();

    const { data, error } = await sb
      .from("pro_ce_advantages")
      .update(parsed.data)
      .eq("id", req.params.id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    if (existing?.establishment_id) {
      await syncEstablishmentCeFlag(existing.establishment_id);
    }

    res.json({ ok: true, data });
  });

  app.delete("/api/admin/ce/advantages/:id", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const sb = supabase();
    const { data: existing } = await sb.from("pro_ce_advantages").select("establishment_id").eq("id", req.params.id).maybeSingle();

    const { error } = await sb
      .from("pro_ce_advantages")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", req.params.id);

    if (error) return res.status(500).json({ error: error.message });

    if (existing?.establishment_id) {
      await syncEstablishmentCeFlag(existing.establishment_id);
    }

    res.json({ ok: true });
  });

  // --------------------------------------------------
  // CSV Exports
  // --------------------------------------------------

  app.get("/api/admin/ce/export/companies", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const sb = supabase();
    const { data } = await sb.from("companies").select("*").is("deleted_at", null).order("name");

    const rows = (data ?? []).map((c: any) => ({
      id: c.id,
      nom: c.name,
      ice_siret: c.ice_siret ?? "",
      adresse: c.address ?? "",
      secteur: c.sector ?? "",
      contact_nom: c.contact_name ?? "",
      contact_email: c.contact_email ?? "",
      contact_telephone: c.contact_phone ?? "",
      statut: c.status,
      debut_contrat: c.contract_start_date ?? "",
      fin_contrat: c.contract_end_date ?? "",
      slug: c.slug,
      created_at: c.created_at,
    }));

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=entreprises-ce.csv");
    res.send("\uFEFF" + toCSV(rows));
  });

  app.get("/api/admin/ce/export/employees/:companyId", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const sb = supabase();
    const { data: employees } = await sb
      .from("company_employees")
      .select("*")
      .eq("company_id", req.params.companyId)
      .is("deleted_at", null)
      .order("created_at");

    const rows = await Promise.all(
      (employees ?? []).map(async (emp: any) => {
        const { data: user } = await sb.from("consumer_users").select("full_name, email, phone").eq("id", emp.user_id).maybeSingle();
        return {
          id: emp.id,
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

  app.get("/api/admin/ce/export/scans", async (req, res) => {
    const session = requireAdminSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const sb = supabase();
    const { data: scans } = await sb
      .from("ce_scans")
      .select("*")
      .order("scan_datetime", { ascending: false })
      .limit(5000);

    const rows = await Promise.all(
      (scans ?? []).map(async (scan: any) => {
        const { data: emp } = await sb.from("company_employees").select("user_id").eq("id", scan.employee_id).maybeSingle();
        const { data: user } = emp ? await sb.from("consumer_users").select("full_name").eq("id", emp.user_id).maybeSingle() : { data: null };
        const { data: company } = await sb.from("companies").select("name").eq("id", scan.company_id).maybeSingle();
        const { data: est } = await sb.from("establishments").select("name").eq("id", scan.establishment_id).maybeSingle();
        const { data: adv } = await sb.from("pro_ce_advantages").select("description, advantage_type").eq("id", scan.advantage_id).maybeSingle();
        return {
          date: scan.scan_datetime,
          salarie: formatEmployeeName(user?.full_name ?? null),
          entreprise: company?.name ?? "",
          etablissement: est?.name ?? "",
          avantage: adv?.description ?? "",
          type: adv?.advantage_type ?? "",
          statut: scan.status,
          motif_refus: scan.refusal_reason ?? "",
        };
      }),
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=scans-ce.csv");
    res.send("\uFEFF" + toCSV(rows));
  });
}
