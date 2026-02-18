/**
 * Admin User Management & Marketing Routes
 * - Delete demo/test accounts
 * - Secure sensitive actions with password
 * - Marketing prospects management
 */

import { Router, type RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { getAdminSupabase } from "../supabaseAdmin";
import { getAuditActorInfo } from "./admin";

// ============================================================================
// Helpers
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v) => typeof v === "string");
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

// Require admin key
function requireAdminKey(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1]
): boolean {
  const adminKey = req.headers["x-admin-key"];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    res.status(401).json({ error: "Non autorisé" });
    return false;
  }
  return true;
}

// Require superadmin (SAM team only)
function requireSuperadmin(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1]
): boolean {
  if (!requireAdminKey(req, res)) return false;
  const role = req.headers["x-admin-role"];
  if (role !== "superadmin" && role !== "admin") {
    res.status(403).json({ error: "Accès superadmin requis" });
    return false;
  }
  return true;
}

// ============================================================================
// Security Password Management
// ============================================================================

const SECURITY_PASSWORD_KEY = "sensitive_actions_password";
const SALT_ROUNDS = 12;

/**
 * Check if security password is configured
 */
export const checkSecurityPasswordConfigured: RequestHandler = async (
  req,
  res
) => {
  if (!requireSuperadmin(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_security_settings")
    .select("key")
    .eq("key", SECURITY_PASSWORD_KEY)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ configured: !!data });
};

/**
 * Set or update the security password for sensitive actions
 */
export const setSecurityPassword: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const body = isRecord(req.body) ? req.body : {};
  const password = asString(body.password);
  const currentPassword = asString(body.current_password);

  if (!password || password.length < 6) {
    return res.status(400).json({
      error: "Le mot de passe doit contenir au moins 6 caractères",
    });
  }

  const supabase = getAdminSupabase();

  // Check if password already exists
  const { data: existing } = await supabase
    .from("admin_security_settings")
    .select("value_hash")
    .eq("key", SECURITY_PASSWORD_KEY)
    .maybeSingle();

  // If exists, verify current password
  if (existing) {
    if (!currentPassword) {
      return res.status(400).json({
        error: "Mot de passe actuel requis pour le modifier",
      });
    }
    const isValid = await bcrypt.compare(currentPassword, existing.value_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Mot de passe actuel incorrect" });
    }
  }

  // Hash and store
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  const { error } = await supabase.from("admin_security_settings").upsert(
    {
      key: SECURITY_PASSWORD_KEY,
      value_hash: hash,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Audit log
  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    action: existing
      ? "security.password.updated"
      : "security.password.created",
    entity_type: "admin_security_settings",
    entity_id: SECURITY_PASSWORD_KEY,
    actor_id: actor.actor_id,
    metadata: { actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({
    success: true,
    message: existing
      ? "Mot de passe de sécurité mis à jour"
      : "Mot de passe de sécurité configuré",
  });
};

/**
 * Verify security password for sensitive actions
 */
export const verifySecurityPassword: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const body = isRecord(req.body) ? req.body : {};
  const password = asString(body.password);
  const action = asString(body.action) ?? "unknown";

  if (!password) {
    return res.status(400).json({ error: "Mot de passe requis" });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("admin_security_settings")
    .select("value_hash")
    .eq("key", SECURITY_PASSWORD_KEY)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    return res.status(400).json({
      error: "Mot de passe de sécurité non configuré",
      not_configured: true,
    });
  }

  const isValid = await bcrypt.compare(password, data.value_hash);

  // Audit log attempt
  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    action: isValid
      ? "security.password.verified"
      : "security.password.failed",
    entity_type: "sensitive_action",
    entity_id: action,
    actor_id: actor.actor_id,
    metadata: { success: isValid, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  if (!isValid) {
    return res.status(401).json({ error: "Mot de passe incorrect" });
  }

  res.json({ valid: true });
};

// ============================================================================
// Demo Account Cleanup
// ============================================================================

// Email to keep (protected account)
const PROTECTED_EMAIL = "demo-user@sortiaumaroc.com";

/**
 * Preview demo accounts that would be deleted
 * If mode=all, returns ALL accounts except the protected one
 */
export const previewDemoAccounts: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const mode = req.query.mode === "all" ? "all" : "demo";
  const supabase = getAdminSupabase();

  if (mode === "all") {
    // Return ALL consumer accounts except the protected one
    const { data: allUsers, error } = await supabase
      .from("consumer_users")
      .select("id, email, full_name, created_at")
      .neq("email", PROTECTED_EMAIL)
      .limit(5000);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const accounts = (allUsers ?? []).map((acc) => ({
      id: acc.id,
      email: acc.email,
      name: acc.full_name ?? "",
      created_at: acc.created_at,
      reason: "Suppression complète",
    })).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return res.json({
      total: accounts.length,
      accounts,
      protected_email: PROTECTED_EMAIL,
    });
  }

  // Original mode: only demo/test accounts
  // Find @example.invalid accounts
  const { data: invalidEmails, error: err1 } = await supabase
    .from("consumer_users")
    .select("id, email, full_name, created_at")
    .ilike("email", "%@example.invalid")
    .neq("email", PROTECTED_EMAIL)
    .limit(1000);

  if (err1) {
    return res.status(500).json({ error: err1.message });
  }

  // Find accounts with test-like emails and no bookings (created > 7 days ago)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: testAccounts, error: err2 } = await supabase
    .from("admin_consumer_users")
    .select("id, email, display_name, created_at, reservations_count")
    .lt("created_at", sevenDaysAgo)
    .eq("reservations_count", 0)
    .neq("email", PROTECTED_EMAIL)
    .or("email.ilike.test%@%,email.ilike.demo%@%,email.ilike.fake%@%")
    .limit(1000);

  if (err2) {
    return res.status(500).json({ error: err2.message });
  }

  // Deduplicate by id
  const allAccounts = new Map<
    string,
    { id: string; email: string; name: string; created_at: string; reason: string }
  >();

  for (const acc of invalidEmails ?? []) {
    allAccounts.set(acc.id, {
      id: acc.id,
      email: acc.email,
      name: acc.full_name ?? "",
      created_at: acc.created_at,
      reason: "Email @example.invalid",
    });
  }

  for (const acc of testAccounts ?? []) {
    if (!allAccounts.has(acc.id)) {
      allAccounts.set(acc.id, {
        id: acc.id,
        email: acc.email,
        name: acc.display_name ?? "",
        created_at: acc.created_at,
        reason: "Email test/démo sans réservation",
      });
    }
  }

  const accounts = Array.from(allAccounts.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  res.json({
    total: accounts.length,
    accounts,
    protected_email: PROTECTED_EMAIL,
  });
};

/**
 * Delete demo/test accounts
 */
export const deleteDemoAccounts: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const body = isRecord(req.body) ? req.body : {};
  const securityPassword = asString(body.security_password);
  const accountIds = asStringArray(body.account_ids);

  if (!securityPassword) {
    return res.status(400).json({ error: "Mot de passe de sécurité requis" });
  }

  if (!accountIds || accountIds.length === 0) {
    return res.status(400).json({ error: "Aucun compte sélectionné" });
  }

  const supabase = getAdminSupabase();

  // Verify security password
  const { data: securityData } = await supabase
    .from("admin_security_settings")
    .select("value_hash")
    .eq("key", SECURITY_PASSWORD_KEY)
    .maybeSingle();

  if (!securityData) {
    return res.status(400).json({
      error: "Mot de passe de sécurité non configuré",
      not_configured: true,
    });
  }

  const isValid = await bcrypt.compare(securityPassword, securityData.value_hash);
  if (!isValid) {
    return res.status(401).json({ error: "Mot de passe de sécurité incorrect" });
  }

  // Get account details before deletion
  const { data: accountsToDelete } = await supabase
    .from("consumer_users")
    .select("id, email")
    .in("id", accountIds);

  if (!accountsToDelete || accountsToDelete.length === 0) {
    return res.status(404).json({ error: "Comptes non trouvés" });
  }

  const deleted: { id: string; email: string }[] = [];
  const errors: { id: string; email: string; error: string }[] = [];

  for (const account of accountsToDelete) {
    try {
      // Soft delete: anonymize email and mark as deleted
      const anonEmail = `deleted+${account.id}@example.invalid`;

      const { error: updateErr } = await supabase
        .from("consumer_users")
        .update({
          email: anonEmail,
          full_name: "[Compte supprimé]",
          status: "suspended",
          account_status: "deleted",
          deleted_at: new Date().toISOString(),
        })
        .eq("id", account.id);

      if (updateErr) {
        errors.push({ id: account.id, email: account.email, error: updateErr.message });
        continue;
      }

      // Delete from auth.users
      const { error: authErr } = await supabase.auth.admin.deleteUser(account.id);

      if (authErr) {
        // Log but don't fail - the consumer_users record is already anonymized
        console.error(`Auth deletion failed for ${account.id}:`, authErr);
      }

      deleted.push({ id: account.id, email: account.email });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      errors.push({ id: account.id, email: account.email, error: msg });
    }
  }

  // Audit log
  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    action: "users.demo.cleanup",
    entity_type: "consumer_users",
    entity_id: "batch",
    actor_id: actor.actor_id,
    metadata: {
      deleted_count: deleted.length,
      error_count: errors.length,
      deleted_emails: deleted.map((d) => d.email),
      actor_email: actor.actor_email,
      actor_name: actor.actor_name,
      actor_role: actor.actor_role,
    },
  });

  res.json({
    success: true,
    deleted_count: deleted.length,
    error_count: errors.length,
    deleted,
    errors,
  });
};

// ============================================================================
// Marketing Prospects
// ============================================================================

type MarketingProspect = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  tags: string[];
  source: string | null;
  subscribed: boolean;
  emails_sent_count: number;
  emails_opened_count: number;
  emails_clicked_count: number;
  created_at: string;
};

/**
 * List marketing prospects
 */
export const listMarketingProspects: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const offset = Number(req.query.offset) || 0;
  const search = asString(req.query.search);
  const tag = asString(req.query.tag);
  const city = asString(req.query.city);
  const subscribedOnly = asBoolean(req.query.subscribed) ?? true;

  const supabase = getAdminSupabase();

  let query = supabase
    .from("marketing_prospects")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (subscribedOnly) {
    query = query.eq("subscribed", true);
  }

  if (search) {
    query = query.or(
      `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
    );
  }

  if (tag) {
    query = query.contains("tags", [tag]);
  }

  if (city) {
    query = query.ilike("city", city);
  }

  const { data, error, count } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    items: data as MarketingProspect[],
    total: count ?? 0,
    limit,
    offset,
  });
};

/**
 * Get marketing prospect stats
 */
export const getMarketingProspectsStats: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const supabase = getAdminSupabase();

  // Total count
  const { count: total } = await supabase
    .from("marketing_prospects")
    .select("*", { count: "exact", head: true });

  // Subscribed count
  const { count: subscribed } = await supabase
    .from("marketing_prospects")
    .select("*", { count: "exact", head: true })
    .eq("subscribed", true);

  // Top tags
  const { data: tagData } = await supabase
    .from("marketing_prospects")
    .select("tags")
    .eq("subscribed", true);

  const tagCounts = new Map<string, number>();
  for (const row of tagData ?? []) {
    const tags = row.tags as string[] | null;
    if (tags) {
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
  }

  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  // Top cities
  const { data: cityData } = await supabase
    .from("marketing_prospects")
    .select("city")
    .eq("subscribed", true)
    .not("city", "is", null);

  const cityCounts = new Map<string, number>();
  for (const row of cityData ?? []) {
    const city = (row.city as string | null)?.toLowerCase().trim();
    if (city) {
      cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
    }
  }

  const topCities = Array.from(cityCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([city, count]) => ({ city, count }));

  res.json({
    total: total ?? 0,
    subscribed: subscribed ?? 0,
    unsubscribed: (total ?? 0) - (subscribed ?? 0),
    top_tags: topTags,
    top_cities: topCities,
  });
};

/**
 * Import marketing prospects from CSV
 */
export const importMarketingProspects: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const body = isRecord(req.body) ? req.body : {};
  const prospects = body.prospects as unknown;
  const tags = asStringArray(body.tags) ?? [];
  const source = asString(body.source) ?? "import_csv";

  if (!Array.isArray(prospects)) {
    return res.status(400).json({ error: "Liste de prospects requise" });
  }

  const supabase = getAdminSupabase();

  const toInsert: Array<{
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    city: string | null;
    tags: string[];
    source: string;
  }> = [];

  const skipped: Array<{ email: string; reason: string }> = [];

  for (const p of prospects) {
    if (!isRecord(p)) continue;

    const email = asString(p.email)?.toLowerCase().trim();
    if (!email || !email.includes("@")) {
      skipped.push({ email: email ?? "invalide", reason: "Email invalide" });
      continue;
    }

    toInsert.push({
      email,
      first_name: asString(p.first_name) ?? asString(p.prenom) ?? null,
      last_name: asString(p.last_name) ?? asString(p.nom) ?? null,
      phone: asString(p.phone) ?? asString(p.telephone) ?? null,
      city: asString(p.city) ?? asString(p.ville) ?? null,
      tags,
      source,
    });
  }

  if (toInsert.length === 0) {
    return res.status(400).json({ error: "Aucun prospect valide à importer" });
  }

  // Upsert prospects (update existing, insert new)
  const { data: inserted, error } = await supabase
    .from("marketing_prospects")
    .upsert(toInsert, {
      onConflict: "email",
      ignoreDuplicates: false,
    })
    .select("id, email");

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Audit log
  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    action: "marketing.prospects.import",
    entity_type: "marketing_prospects",
    entity_id: "batch",
    actor_id: actor.actor_id,
    metadata: {
      imported_count: inserted?.length ?? 0,
      skipped_count: skipped.length,
      tags,
      source,
      actor_email: actor.actor_email,
      actor_name: actor.actor_name,
      actor_role: actor.actor_role,
    },
  });

  res.json({
    success: true,
    imported_count: inserted?.length ?? 0,
    skipped_count: skipped.length,
    skipped,
  });
};

/**
 * Add a single marketing prospect
 */
export const addMarketingProspect: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const body = isRecord(req.body) ? req.body : {};
  const email = asString(body.email)?.toLowerCase().trim();
  const firstName = asString(body.first_name);
  const lastName = asString(body.last_name);
  const phone = asString(body.phone);
  const city = asString(body.city);
  const tags = asStringArray(body.tags) ?? [];
  const source = asString(body.source) ?? "manual";

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Email invalide" });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("marketing_prospects")
    .upsert(
      {
        email,
        first_name: firstName,
        last_name: lastName,
        phone,
        city,
        tags,
        source,
      },
      { onConflict: "email" }
    )
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, prospect: data });
};

/**
 * Update marketing prospect
 */
export const updateMarketingProspect: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const body = isRecord(req.body) ? req.body : {};
  const updates: Record<string, unknown> = {};

  if (body.first_name !== undefined) updates.first_name = asString(body.first_name);
  if (body.last_name !== undefined) updates.last_name = asString(body.last_name);
  if (body.phone !== undefined) updates.phone = asString(body.phone);
  if (body.city !== undefined) updates.city = asString(body.city);
  if (body.tags !== undefined) updates.tags = asStringArray(body.tags);
  if (body.subscribed !== undefined) {
    updates.subscribed = asBoolean(body.subscribed);
    if (!updates.subscribed) {
      updates.unsubscribed_at = new Date().toISOString();
      updates.unsubscribe_reason = asString(body.unsubscribe_reason) ?? "manual";
    }
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("marketing_prospects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, prospect: data });
};

/**
 * Delete marketing prospect
 */
export const deleteMarketingProspect: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const supabase = getAdminSupabase();

  const { error } = await supabase.from("marketing_prospects").delete().eq("id", id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
};

/**
 * Bulk delete marketing prospects
 */
export const bulkDeleteMarketingProspects: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const body = isRecord(req.body) ? req.body : {};
  const ids = asStringArray(body.ids);
  const securityPassword = asString(body.security_password);

  if (!ids || ids.length === 0) {
    return res.status(400).json({ error: "Aucun ID fourni" });
  }

  if (!securityPassword) {
    return res.status(400).json({ error: "Mot de passe de sécurité requis" });
  }

  const supabase = getAdminSupabase();

  // Verify security password
  const { data: securityData } = await supabase
    .from("admin_security_settings")
    .select("value_hash")
    .eq("key", SECURITY_PASSWORD_KEY)
    .maybeSingle();

  if (!securityData) {
    return res.status(400).json({
      error: "Mot de passe de sécurité non configuré",
      not_configured: true,
    });
  }

  const isValid = await bcrypt.compare(securityPassword, securityData.value_hash);
  if (!isValid) {
    return res.status(401).json({ error: "Mot de passe de sécurité incorrect" });
  }

  const { error, count } = await supabase
    .from("marketing_prospects")
    .delete()
    .in("id", ids);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Audit log
  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    action: "marketing.prospects.bulk_delete",
    entity_type: "marketing_prospects",
    entity_id: "batch",
    actor_id: actor.actor_id,
    metadata: { deleted_count: count, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ success: true, deleted_count: count });
};

/**
 * Export marketing prospects as CSV
 */
export const exportMarketingProspects: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const body = isRecord(req.body) ? req.body : {};
  const securityPassword = asString(body.security_password);
  const tag = asString(body.tag);
  const city = asString(body.city);
  const subscribedOnly = asBoolean(body.subscribed) ?? true;

  if (!securityPassword) {
    return res.status(400).json({ error: "Mot de passe de sécurité requis" });
  }

  const supabase = getAdminSupabase();

  // Verify security password
  const { data: securityData } = await supabase
    .from("admin_security_settings")
    .select("value_hash")
    .eq("key", SECURITY_PASSWORD_KEY)
    .maybeSingle();

  if (!securityData) {
    return res.status(400).json({
      error: "Mot de passe de sécurité non configuré",
      not_configured: true,
    });
  }

  const isValid = await bcrypt.compare(securityPassword, securityData.value_hash);
  if (!isValid) {
    return res.status(401).json({ error: "Mot de passe de sécurité incorrect" });
  }

  // Fetch prospects
  let query = supabase
    .from("marketing_prospects")
    .select("email, first_name, last_name, phone, city, country, tags, subscribed, created_at")
    .order("created_at", { ascending: false });

  if (subscribedOnly) {
    query = query.eq("subscribed", true);
  }

  if (tag) {
    query = query.contains("tags", [tag]);
  }

  if (city) {
    query = query.ilike("city", city);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Generate CSV
  const headers = [
    "Email",
    "Prénom",
    "Nom",
    "Téléphone",
    "Ville",
    "Pays",
    "Tags",
    "Abonné",
    "Date d'ajout",
  ];

  const rows = (data ?? []).map((p) => [
    p.email,
    p.first_name ?? "",
    p.last_name ?? "",
    p.phone ?? "",
    p.city ?? "",
    p.country ?? "",
    (p.tags as string[])?.join(", ") ?? "",
    p.subscribed ? "Oui" : "Non",
    p.created_at ? new Date(p.created_at).toLocaleDateString("fr-FR") : "",
  ]);

  const csv =
    [headers.join(";"), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))].join(
      "\n"
    );

  // Audit log
  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    action: "marketing.prospects.export",
    entity_type: "marketing_prospects",
    entity_id: "batch",
    actor_id: actor.actor_id,
    metadata: { exported_count: data?.length ?? 0, filters: { tag, city, subscribedOnly }, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="prospects_${new Date().toISOString().split("T")[0]}.csv"`
  );
  res.send("\uFEFF" + csv); // BOM for Excel
};

/**
 * Get unique tags from prospects
 */
export const getProspectTags: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const supabase = getAdminSupabase();

  const { data } = await supabase.from("marketing_prospects").select("tags");

  const tagSet = new Set<string>();
  for (const row of data ?? []) {
    const tags = row.tags as string[] | null;
    if (tags) {
      for (const tag of tags) {
        tagSet.add(tag);
      }
    }
  }

  res.json({ tags: Array.from(tagSet).sort() });
};

// ============================================================================
// Register Routes
// ============================================================================

export function registerAdminUserManagementRoutes(router: Router): void {
  // Security password
  router.get("/api/admin/security/password/check", checkSecurityPasswordConfigured);
  router.post("/api/admin/security/password", setSecurityPassword);
  router.post("/api/admin/security/password/verify", verifySecurityPassword);

  // Demo account cleanup
  router.get("/api/admin/users/demo/preview", previewDemoAccounts);
  router.post("/api/admin/users/demo/delete", deleteDemoAccounts);

  // Marketing prospects
  router.get("/api/admin/marketing/prospects", listMarketingProspects);
  router.get("/api/admin/marketing/prospects/stats", getMarketingProspectsStats);
  router.get("/api/admin/marketing/prospects/tags", getProspectTags);
  router.post("/api/admin/marketing/prospects/import", importMarketingProspects);
  router.post("/api/admin/marketing/prospects/export", exportMarketingProspects);
  router.post("/api/admin/marketing/prospects", addMarketingProspect);
  router.put("/api/admin/marketing/prospects/:id", updateMarketingProspect);
  router.delete("/api/admin/marketing/prospects/:id", deleteMarketingProspect);
  router.post("/api/admin/marketing/prospects/bulk-delete", bulkDeleteMarketingProspects);
}
