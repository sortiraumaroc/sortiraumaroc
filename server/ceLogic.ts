/**
 * CE (Comité d'Entreprise) — Business Logic
 *
 * Core functions for company management, employee registration/validation,
 * QR code generation, scan validation, and data queries.
 */

import crypto from "crypto";
import { getAdminSupabase } from "./supabaseAdmin";
import { generateSecret, generateTOTP, validateTOTP } from "./lib/totp";
import type {
  AdvantageType,
  CeScanValidationResult,
  EmployeeStatus,
} from "../shared/ceTypes";

// ============================================================================
// Helpers
// ============================================================================

const supabase = () => getAdminSupabase();

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Generate a random alphanumeric code (8 chars) */
export function generateRegistrationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/** Generate a unique slug for a company */
export async function generateCompanySlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base || "company";
  let counter = 0;
  const sb = supabase();

  while (true) {
    const slug = counter === 0 ? candidate : `${candidate}-${counter}`;
    const { data } = await sb
      .from("companies")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
    counter++;
    if (counter > 100) return `${candidate}-${Date.now()}`;
  }
}

/** Format employee name for GDPR (Prénom N.) */
export function formatEmployeeName(fullName: string | null): string {
  if (!fullName) return "Salarié";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() ?? "";
  return `${firstName} ${lastInitial}.`;
}

// ============================================================================
// Employee Registration
// ============================================================================

export async function registerEmployee(
  userId: string,
  registrationCode: string,
): Promise<{ ok: true; employeeId: string; status: EmployeeStatus } | { ok: false; error: string }> {
  const sb = supabase();

  // Find the company by registration code
  const { data: company, error: companyErr } = await sb
    .from("companies")
    .select("id, name, status, auto_validate_employees, auto_validate_domain")
    .eq("registration_code", registrationCode)
    .is("deleted_at", null)
    .maybeSingle();

  if (companyErr || !company) {
    return { ok: false, error: "Code d'inscription invalide." };
  }
  if (company.status !== "active") {
    return { ok: false, error: "Cette entreprise n'est plus active." };
  }

  // Check if already registered
  const { data: existing } = await sb
    .from("company_employees")
    .select("id, status")
    .eq("company_id", company.id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: "Vous êtes déjà inscrit à cette entreprise." };
  }

  // Check auto-validation
  let autoValidate = company.auto_validate_employees;
  if (autoValidate && company.auto_validate_domain) {
    const { data: user } = await sb
      .from("consumer_users")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    if (user?.email) {
      autoValidate = user.email.endsWith(company.auto_validate_domain);
    } else {
      autoValidate = false;
    }
  }

  const status: EmployeeStatus = autoValidate ? "active" : "pending";
  const profileComplete = await checkEmployeeProfileComplete(userId);

  const { data: employee, error: insertErr } = await sb
    .from("company_employees")
    .insert({
      company_id: company.id,
      user_id: userId,
      status,
      profile_complete: profileComplete,
      validated_at: autoValidate ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (insertErr) {
    return { ok: false, error: "Erreur lors de l'inscription." };
  }

  // If auto-validated and profile complete, generate TOTP secret
  if (autoValidate && profileComplete) {
    await generateCeTotpSecret(employee.id);
  }

  // Sync CE flags on consumer_users
  await syncCeFlags(userId, company.id);

  return { ok: true, employeeId: employee.id, status };
}

// ============================================================================
// Employee Management
// ============================================================================

export async function validateEmployee(
  employeeId: string,
  adminId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabase();

  const { data: emp } = await sb
    .from("company_employees")
    .select("id, user_id, company_id, status, profile_complete")
    .eq("id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!emp) return { ok: false, error: "Salarié introuvable." };
  if (emp.status === "active") return { ok: false, error: "Salarié déjà actif." };

  const { error } = await sb
    .from("company_employees")
    .update({
      status: "active",
      validated_at: new Date().toISOString(),
      validated_by: adminId,
    })
    .eq("id", employeeId);

  if (error) return { ok: false, error: "Erreur lors de la validation." };

  // Generate TOTP secret if profile complete
  if (emp.profile_complete) {
    await generateCeTotpSecret(employeeId);
  }

  await syncCeFlags(emp.user_id, emp.company_id);

  return { ok: true };
}

export async function suspendEmployee(
  employeeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabase();

  const { data: emp } = await sb
    .from("company_employees")
    .select("id, user_id, company_id, status")
    .eq("id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!emp) return { ok: false, error: "Salarié introuvable." };
  if (emp.status !== "active") return { ok: false, error: "Le salarié n'est pas actif." };

  // Deactivate TOTP
  await sb.from("ce_totp_secrets").update({ is_active: false }).eq("employee_id", employeeId);

  const { error } = await sb
    .from("company_employees")
    .update({ status: "suspended" })
    .eq("id", employeeId);

  if (error) return { ok: false, error: "Erreur lors de la suspension." };

  await syncCeFlags(emp.user_id, emp.company_id);

  return { ok: true };
}

export async function reactivateEmployee(
  employeeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabase();

  const { data: emp } = await sb
    .from("company_employees")
    .select("id, user_id, company_id, status, profile_complete")
    .eq("id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!emp) return { ok: false, error: "Salarié introuvable." };
  if (emp.status !== "suspended") return { ok: false, error: "Le salarié n'est pas suspendu." };

  const { error } = await sb
    .from("company_employees")
    .update({ status: "active" })
    .eq("id", employeeId);

  if (error) return { ok: false, error: "Erreur lors de la réactivation." };

  // Re-activate TOTP if profile complete
  if (emp.profile_complete) {
    await sb.from("ce_totp_secrets").update({ is_active: true }).eq("employee_id", employeeId);
  }

  await syncCeFlags(emp.user_id, emp.company_id);

  return { ok: true };
}

export async function softDeleteEmployee(
  employeeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabase();

  const { data: emp } = await sb
    .from("company_employees")
    .select("id, user_id, company_id")
    .eq("id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!emp) return { ok: false, error: "Salarié introuvable." };

  await sb.from("ce_totp_secrets").update({ is_active: false }).eq("employee_id", employeeId);

  const { error } = await sb
    .from("company_employees")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", employeeId);

  if (error) return { ok: false, error: "Erreur lors de la suppression." };

  // Clear CE flags on consumer
  await sb
    .from("consumer_users")
    .update({ is_ce_employee: false, ce_company_id: null })
    .eq("id", emp.user_id);

  return { ok: true };
}

// ============================================================================
// Profile Completeness
// ============================================================================

export async function checkEmployeeProfileComplete(userId: string): Promise<boolean> {
  const sb = supabase();
  const { data: user } = await sb
    .from("consumer_users")
    .select("full_name, email, phone")
    .eq("id", userId)
    .maybeSingle();

  if (!user) return false;
  return !!(user.full_name?.trim() && user.email?.trim() && user.phone?.trim());
}

// ============================================================================
// TOTP / QR Code
// ============================================================================

async function generateCeTotpSecret(employeeId: string): Promise<string> {
  const sb = supabase();
  const secret = generateSecret(20);

  await sb
    .from("ce_totp_secrets")
    .upsert(
      {
        employee_id: employeeId,
        secret,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        is_active: true,
        validation_count: 0,
      },
      { onConflict: "employee_id" },
    );

  return secret;
}

export async function getCeTotpSecret(employeeId: string): Promise<{
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
} | null> {
  const sb = supabase();
  const { data } = await sb
    .from("ce_totp_secrets")
    .select("secret, algorithm, digits, period, is_active")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return null;
  return { secret: data.secret, algorithm: data.algorithm, digits: data.digits, period: data.period };
}

export async function regenerateCeTotpSecret(employeeId: string): Promise<string> {
  return generateCeTotpSecret(employeeId);
}

/**
 * Encode CE QR payload
 * Format: SAM:CE:v1:{employeeId}:{totpCode}:{timestamp}
 */
export function encodeCeQrPayload(employeeId: string, code: string): string {
  const ts = Math.floor(Date.now() / 1000);
  return `SAM:CE:v1:${employeeId}:${code}:${ts}`;
}

/**
 * Decode CE QR payload
 */
export function decodeCeQrPayload(
  qrString: string,
): { employeeId: string; code: string; ts: number } | null {
  const trimmed = qrString.trim();
  if (!trimmed.startsWith("SAM:CE:v")) return null;

  const parts = trimmed.split(":");
  if (parts.length < 6) return null;

  return {
    employeeId: parts[3],
    code: parts[4],
    ts: parseInt(parts[5], 10) || 0,
  };
}

// ============================================================================
// Scan Validation
// ============================================================================

export async function validateCeScan(
  qrPayload: string,
  establishmentId: string,
  scannedBy: string,
): Promise<CeScanValidationResult & { scanId?: string }> {
  const sb = supabase();

  // 1. Decode QR
  const decoded = decodeCeQrPayload(qrPayload);
  if (!decoded) {
    return { valid: false, employee_name: null, company_name: null, advantage: null, refusal_reason: "QR Code CE invalide." };
  }

  // 2. Check timestamp freshness (90 seconds max)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - decoded.ts) > 90) {
    return { valid: false, employee_name: null, company_name: null, advantage: null, refusal_reason: "QR Code expiré. Le salarié doit rafraîchir son QR." };
  }

  // 3. Get employee + company
  const { data: emp } = await sb
    .from("company_employees")
    .select("id, company_id, user_id, status, profile_complete")
    .eq("id", decoded.employeeId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!emp) {
    return { valid: false, employee_name: null, company_name: null, advantage: null, refusal_reason: "Salarié CE introuvable." };
  }
  if (emp.status !== "active") {
    return { valid: false, employee_name: null, company_name: null, advantage: null, refusal_reason: `Salarié ${emp.status === "pending" ? "en attente de validation" : "suspendu"}.` };
  }
  if (!emp.profile_complete) {
    return { valid: false, employee_name: null, company_name: null, advantage: null, refusal_reason: "Le profil du salarié est incomplet." };
  }

  // 4. Check company active
  const { data: company } = await sb
    .from("companies")
    .select("id, name, status")
    .eq("id", emp.company_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!company || company.status !== "active") {
    return { valid: false, employee_name: null, company_name: company?.name ?? null, advantage: null, refusal_reason: "L'entreprise n'est plus active." };
  }

  // 5. Validate TOTP
  const { data: totpSecret } = await sb
    .from("ce_totp_secrets")
    .select("secret, algorithm, digits, period")
    .eq("employee_id", decoded.employeeId)
    .eq("is_active", true)
    .maybeSingle();

  if (!totpSecret) {
    return { valid: false, employee_name: null, company_name: company.name, advantage: null, refusal_reason: "QR Code CE non activé." };
  }

  const totpResult = validateTOTP(decoded.code, {
    secret: totpSecret.secret,
    algorithm: totpSecret.algorithm as "SHA1",
    digits: totpSecret.digits,
    period: totpSecret.period,
    window: 1,
  });

  if (!totpResult.valid) {
    return { valid: false, employee_name: null, company_name: company.name, advantage: null, refusal_reason: "Code QR invalide ou expiré." };
  }

  // 6. Find active advantage for this establishment
  const { data: advantage } = await sb
    .from("pro_ce_advantages")
    .select("id, advantage_type, advantage_value, description, conditions, start_date, end_date, max_uses_per_employee, max_uses_total, target_companies")
    .eq("establishment_id", establishmentId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!advantage) {
    return { valid: false, employee_name: null, company_name: company.name, advantage: null, refusal_reason: "Aucun avantage CE actif pour cet établissement." };
  }

  // 7. Check date validity
  const today = new Date().toISOString().split("T")[0];
  if (advantage.start_date && today < advantage.start_date) {
    return { valid: false, employee_name: null, company_name: company.name, advantage: null, refusal_reason: "L'avantage CE n'est pas encore actif." };
  }
  if (advantage.end_date && today > advantage.end_date) {
    return { valid: false, employee_name: null, company_name: company.name, advantage: null, refusal_reason: "L'avantage CE a expiré." };
  }

  // 8. Check company targeting
  const targets = advantage.target_companies;
  if (targets !== "all" && Array.isArray(targets) && !targets.includes(emp.company_id)) {
    return { valid: false, employee_name: null, company_name: company.name, advantage: null, refusal_reason: "Cet avantage n'est pas disponible pour votre entreprise." };
  }

  // 9. Check quotas
  if (advantage.max_uses_per_employee > 0) {
    const { count } = await sb
      .from("ce_scans")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", decoded.employeeId)
      .eq("advantage_id", advantage.id)
      .eq("status", "validated");

    if ((count ?? 0) >= advantage.max_uses_per_employee) {
      return { valid: false, employee_name: null, company_name: company.name, advantage: null, refusal_reason: "Quota d'utilisations atteint pour ce salarié." };
    }
  }

  if (advantage.max_uses_total > 0) {
    const { count } = await sb
      .from("ce_scans")
      .select("id", { count: "exact", head: true })
      .eq("advantage_id", advantage.id)
      .eq("status", "validated");

    if ((count ?? 0) >= advantage.max_uses_total) {
      return { valid: false, employee_name: null, company_name: company.name, advantage: null, refusal_reason: "Quota total d'utilisations atteint pour cet avantage." };
    }
  }

  // 10. Get employee name
  const { data: user } = await sb
    .from("consumer_users")
    .select("full_name")
    .eq("id", emp.user_id)
    .maybeSingle();

  const employeeName = formatEmployeeName(user?.full_name ?? null);

  // 11. Record scan
  const { data: scan } = await sb
    .from("ce_scans")
    .insert({
      employee_id: decoded.employeeId,
      company_id: emp.company_id,
      establishment_id: establishmentId,
      advantage_id: advantage.id,
      status: "validated",
      scanned_by: scannedBy,
    })
    .select("id")
    .single();

  // 12. Update TOTP stats
  await sb
    .from("ce_totp_secrets")
    .update({ last_used_at: new Date().toISOString(), validation_count: totpSecret ? undefined : 0 })
    .eq("employee_id", decoded.employeeId);

  // Increment validation_count with raw SQL approach
  await sb.rpc("increment_counter", { row_id: decoded.employeeId }).catch(() => {
    // Fallback: ignore if RPC doesn't exist
  });

  return {
    valid: true,
    employee_name: employeeName,
    company_name: company.name,
    advantage: {
      description: advantage.description,
      type: advantage.advantage_type as AdvantageType,
      value: advantage.advantage_value,
      conditions: advantage.conditions,
    },
    refusal_reason: null,
    scanId: scan?.id,
  };
}

// ============================================================================
// CE Flags Sync
// ============================================================================

export async function syncCeFlags(userId: string, companyId: string): Promise<void> {
  const sb = supabase();

  // Check if user has any active CE membership
  const { data: activeEmp } = await sb
    .from("company_employees")
    .select("id, company_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  await sb
    .from("consumer_users")
    .update({
      is_ce_employee: !!activeEmp,
      ce_company_id: activeEmp?.company_id ?? null,
    })
    .eq("id", userId);
}

export async function syncEstablishmentCeFlag(establishmentId: string): Promise<void> {
  const sb = supabase();

  const { count } = await sb
    .from("pro_ce_advantages")
    .select("id", { count: "exact", head: true })
    .eq("establishment_id", establishmentId)
    .eq("is_active", true)
    .is("deleted_at", null);

  await sb
    .from("establishments")
    .update({ has_ce_advantages: (count ?? 0) > 0 })
    .eq("id", establishmentId);
}

// ============================================================================
// Queries
// ============================================================================

export async function getEmployeeAdvantages(
  employeeId: string,
  companyId: string,
  options: {
    search?: string;
    category?: string;
    universe?: string;
    city?: string;
    lat?: number;
    lng?: number;
    page?: number;
    limit?: number;
  } = {},
) {
  const sb = supabase();
  const page = options.page ?? 1;
  const limit = options.limit ?? 20;
  const offset = (page - 1) * limit;

  // Get advantages targeted at this company or "all"
  let query = sb
    .from("pro_ce_advantages")
    .select(`
      id, establishment_id, advantage_type, advantage_value, description, conditions,
      start_date, end_date, max_uses_per_employee, max_uses_total, target_companies,
      establishments!inner (
        id, name, slug, cover_url, city, universe, category,
        lat, lng, status
      )
    `)
    .eq("is_active", true)
    .is("deleted_at", null)
    .eq("establishments.status", "active");

  // Date filtering
  const today = new Date().toISOString().split("T")[0];
  query = query.or(`start_date.is.null,start_date.lte.${today}`);
  query = query.or(`end_date.is.null,end_date.gte.${today}`);

  if (options.universe) {
    query = query.eq("establishments.universe", options.universe);
  }
  if (options.city) {
    query = query.ilike("establishments.city", `%${options.city}%`);
  }
  if (options.search) {
    query = query.or(
      `description.ilike.%${options.search}%,establishments.name.ilike.%${options.search}%`,
    );
  }

  query = query.range(offset, offset + limit - 1);

  const { data: advantages, error } = await query;

  if (error || !advantages) return { data: [], total: 0 };

  // Filter by target_companies
  const filtered = advantages.filter((a: any) => {
    const targets = a.target_companies;
    if (targets === "all" || targets === '"all"') return true;
    if (Array.isArray(targets)) return targets.includes(companyId);
    return true;
  });

  return { data: filtered, total: filtered.length };
}

export async function getCeHomeFeed(
  employeeId: string,
  companyId: string,
  limit = 12,
) {
  const sb = supabase();
  const today = new Date().toISOString().split("T")[0];

  const { data } = await sb
    .from("pro_ce_advantages")
    .select(`
      id, advantage_type, advantage_value, description,
      establishments!inner (
        id, name, slug, cover_url, city, universe, category, lat, lng
      )
    `)
    .eq("is_active", true)
    .is("deleted_at", null)
    .eq("establishments.status", "active")
    .or(`start_date.is.null,start_date.lte.${today}`)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .limit(limit * 2); // Fetch more and filter

  if (!data) return [];

  // Filter by target, shuffle, and limit
  const filtered = data.filter((a: any) => {
    const targets = a.target_companies;
    if (targets === "all" || targets === '"all"') return true;
    if (Array.isArray(targets)) return targets.includes(companyId);
    return true;
  });

  // Shuffle
  for (let i = filtered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
  }

  return filtered.slice(0, limit);
}
