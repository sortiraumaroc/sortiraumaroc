/**
 * CE Public Routes — Employee/Consumer endpoints
 *
 * Registration, status, advantages browsing, QR code, scan history.
 */

import type { Express, Request } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { generateTOTP, getSecondsUntilNextPeriod } from "../lib/totp";
import {
  registerEmployee,
  getCeTotpSecret,
  regenerateCeTotpSecret,
  encodeCeQrPayload,
  getEmployeeAdvantages,
  getCeHomeFeed,
  checkEmployeeProfileComplete,
  syncCeFlags,
} from "../ceLogic";
import {
  registerEmployeeSchema,
  ceAdvantagesQuerySchema,
  ceListQuerySchema,
} from "../schemas/ce";
import { createModuleLogger } from "../lib/logger";
import { zBody, zParams } from "../lib/validate";
import { RegistrationCodeParams, CeEstablishmentIdParams } from "../schemas/cePublicRoutes";

const log = createModuleLogger("cePublic");

// ============================================================================
// Auth Helpers
// ============================================================================

async function getConsumerUserId(req: Request): Promise<string | null> {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return null;

  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch (err) {
    log.warn({ err }, "CE consumer auth token verification failed");
    return null;
  }
}

async function getCeEmployeeInfo(userId: string) {
  const sb = getAdminSupabase();
  const { data: emp } = await sb
    .from("company_employees")
    .select("id, company_id, status, profile_complete")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("status", "active")
    .maybeSingle();

  if (!emp) return null;

  const { data: company } = await sb
    .from("companies")
    .select("id, name, logo_url, status")
    .eq("id", emp.company_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!company || company.status !== "active") return null;

  return { employee: emp, company };
}

const supabase = () => getAdminSupabase();

// ============================================================================
// Route Registration
// ============================================================================

export function registerCePublicRoutes(app: Express): void {
  // --------------------------------------------------
  // Registration Info (public, no auth needed)
  // --------------------------------------------------

  app.get("/api/ce/registration-info/:code", zParams(RegistrationCodeParams), async (req, res) => {
    const sb = supabase();
    const { data: company } = await sb
      .from("companies")
      .select("name, logo_url, welcome_message, status")
      .eq("registration_code", req.params.code)
      .is("deleted_at", null)
      .maybeSingle();

    if (!company) {
      return res.json({ ok: true, data: { company_name: "", company_logo_url: null, welcome_message: null, valid: false, reason: "Code invalide" } });
    }
    if (company.status !== "active") {
      return res.json({ ok: true, data: { company_name: company.name, company_logo_url: company.logo_url, welcome_message: null, valid: false, reason: "Entreprise inactive" } });
    }

    res.json({
      ok: true,
      data: {
        company_name: company.name,
        company_logo_url: company.logo_url,
        welcome_message: company.welcome_message,
        valid: true,
      },
    });
  });

  // --------------------------------------------------
  // Register Employee
  // --------------------------------------------------

  app.post("/api/ce/register", zBody(registerEmployeeSchema), async (req, res) => {
    const userId = await getConsumerUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = registerEmployeeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.issues });

    const result = await registerEmployee(userId, parsed.data.registration_code);
    if (!result.ok) return res.status(400).json({ error: result.error });

    res.json({ ok: true, data: { employeeId: result.employeeId, status: result.status } });
  });

  // --------------------------------------------------
  // CE Status
  // --------------------------------------------------

  app.get("/api/ce/me", async (req, res) => {
    const userId = await getConsumerUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const sb = supabase();
    const { data: emp } = await sb
      .from("company_employees")
      .select("id, company_id, status, profile_complete")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .neq("status", "deleted")
      .maybeSingle();

    if (!emp) {
      return res.json({
        ok: true,
        data: { is_ce_employee: false, status: null, company: null, profile_complete: false, employee_id: null },
      });
    }

    const { data: company } = await sb
      .from("companies")
      .select("id, name, logo_url")
      .eq("id", emp.company_id)
      .maybeSingle();

    // Re-check profile completeness
    const profileComplete = await checkEmployeeProfileComplete(userId);
    if (profileComplete !== emp.profile_complete) {
      await sb.from("company_employees").update({ profile_complete: profileComplete }).eq("id", emp.id);
    }

    res.json({
      ok: true,
      data: {
        is_ce_employee: true,
        status: emp.status,
        company: company ? { id: company.id, name: company.name, logo_url: company.logo_url } : null,
        profile_complete: profileComplete,
        employee_id: emp.id,
      },
    });
  });

  // --------------------------------------------------
  // Advantages Browsing
  // --------------------------------------------------

  app.get("/api/ce/advantages", async (req, res) => {
    const userId = await getConsumerUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const info = await getCeEmployeeInfo(userId);
    if (!info) return res.status(403).json({ error: "Accès réservé aux salariés CE actifs." });

    const parsed = ceAdvantagesQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });

    const result = await getEmployeeAdvantages(info.employee.id, info.employee.company_id, parsed.data);
    res.json({ ok: true, data: result.data, total: result.total });
  });

  app.get("/api/ce/advantages/:establishmentId", zParams(CeEstablishmentIdParams), async (req, res) => {
    const userId = await getConsumerUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const info = await getCeEmployeeInfo(userId);
    if (!info) return res.status(403).json({ error: "Accès réservé aux salariés CE actifs." });

    const sb = supabase();
    const today = new Date().toISOString().split("T")[0];

    const { data: advantage } = await sb
      .from("pro_ce_advantages")
      .select("*")
      .eq("establishment_id", req.params.establishmentId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .or(`start_date.is.null,start_date.lte.${today}`)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .maybeSingle();

    if (!advantage) {
      return res.json({ ok: true, data: null });
    }

    // Check target_companies
    const targets = advantage.target_companies;
    if (targets !== "all" && targets !== '"all"' && Array.isArray(targets) && !targets.includes(info.employee.company_id)) {
      return res.json({ ok: true, data: null });
    }

    // Get usage count for this employee
    let usesCount = 0;
    if (advantage.max_uses_per_employee > 0) {
      const { count } = await sb
        .from("b2b_scans").eq("scan_type", "ce")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", info.employee.id)
        .eq("advantage_id", advantage.id)
        .eq("status", "validated");
      usesCount = count ?? 0;
    }

    res.json({
      ok: true,
      data: {
        ...advantage,
        uses_count: usesCount,
        uses_remaining: advantage.max_uses_per_employee > 0 ? Math.max(0, advantage.max_uses_per_employee - usesCount) : null,
      },
    });
  });

  // --------------------------------------------------
  // QR Code
  // --------------------------------------------------

  app.get("/api/ce/qr/secret", async (req, res) => {
    const userId = await getConsumerUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const info = await getCeEmployeeInfo(userId);
    if (!info) return res.status(403).json({ error: "Accès réservé aux salariés CE actifs." });
    if (!info.employee.profile_complete) return res.status(400).json({ error: "Complétez votre profil pour activer le QR Code CE." });

    let totpConfig = await getCeTotpSecret(info.employee.id);
    if (!totpConfig) {
      await regenerateCeTotpSecret(info.employee.id);
      totpConfig = await getCeTotpSecret(info.employee.id);
    }
    if (!totpConfig) return res.status(500).json({ error: "Erreur lors de la génération du secret." });

    res.json({
      ok: true,
      data: {
        employee_id: info.employee.id,
        ...totpConfig,
        seconds_remaining: getSecondsUntilNextPeriod(totpConfig.period),
      },
    });
  });

  app.get("/api/ce/qr/generate", async (req, res) => {
    const userId = await getConsumerUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const info = await getCeEmployeeInfo(userId);
    if (!info) return res.status(403).json({ error: "Accès réservé aux salariés CE actifs." });
    if (!info.employee.profile_complete) return res.status(400).json({ error: "Profil incomplet." });

    const totpConfig = await getCeTotpSecret(info.employee.id);
    if (!totpConfig) return res.status(400).json({ error: "QR Code CE non activé." });

    const code = generateTOTP(totpConfig);
    const qrPayload = encodeCeQrPayload(info.employee.id, code);

    res.json({
      ok: true,
      data: {
        qr_payload: qrPayload,
        code,
        seconds_remaining: getSecondsUntilNextPeriod(totpConfig.period),
      },
    });
  });

  // --------------------------------------------------
  // Scan History
  // --------------------------------------------------

  app.get("/api/ce/history", async (req, res) => {
    const userId = await getConsumerUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const sb = supabase();
    const { data: emp } = await sb
      .from("company_employees")
      .select("id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .neq("status", "deleted")
      .maybeSingle();

    if (!emp) return res.json({ ok: true, data: [] });

    const parsed = ceListQuerySchema.safeParse(req.query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;
    const offset = (page - 1) * limit;

    const { data: scans, count } = await sb
      .from("b2b_scans").eq("scan_type", "ce")
      .select("*", { count: "exact" })
      .eq("employee_id", emp.id)
      .order("scan_datetime", { ascending: false })
      .range(offset, offset + limit - 1);

    const enriched = await Promise.all(
      (scans ?? []).map(async (scan: any) => {
        const { data: est } = await sb.from("establishments").select("name, slug, cover_url").eq("id", scan.establishment_id).maybeSingle();
        const { data: adv } = await sb.from("pro_ce_advantages").select("description, advantage_type, advantage_value").eq("id", scan.advantage_id).maybeSingle();
        return {
          ...scan,
          establishment_name: est?.name ?? null,
          establishment_slug: est?.slug ?? null,
          establishment_cover: est?.cover_url ?? null,
          advantage_description: adv?.description ?? null,
          advantage_type: adv?.advantage_type ?? null,
          advantage_value: adv?.advantage_value ?? null,
        };
      }),
    );

    res.json({ ok: true, data: enriched, total: count ?? 0, page, limit });
  });

  // --------------------------------------------------
  // Home Feed
  // --------------------------------------------------

  app.get("/api/ce/home-feed", async (req, res) => {
    const userId = await getConsumerUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const info = await getCeEmployeeInfo(userId);
    if (!info) return res.json({ ok: true, data: [] });

    const limit = Math.min(Number(req.query.limit) || 12, 24);
    const data = await getCeHomeFeed(info.employee.id, info.employee.company_id, limit);
    res.json({ ok: true, data });
  });
}
