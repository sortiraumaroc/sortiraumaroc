/**
 * Admin Users Routes — Consumer and Pro user management.
 *
 * Extracted from the monolithic admin.ts.
 * Handles listing, creating, updating, deleting, and managing consumer
 * and pro users, including memberships, reliability, events, and purchases.
 */

import type { RequestHandler } from "express";
import {
  requireAdminKey,
  requireSuperadmin,
  isRecord,
  asString,
  asStringArray,
  normalizeEmail,
  generateProvisionalPassword,
  getAdminSupabase,
  getAdminSessionSub,
  getAuditActorInfo,
  translateErrorMessage,
} from "./adminHelpers";
import { createModuleLogger } from "../lib/logger";
import { recomputeConsumerUserStatsV1 } from "../consumerReliability";
import { sendTemplateEmail } from "../emailService";

const log = createModuleLogger("adminUsers");

// =============================================================================
// Local types
// =============================================================================

type ConsumerUserAdminRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  city: string;
  country: string;
  reliability_score: number | null;
  reservations_count: number | null;
  no_shows_count: number | null;
  created_at: string;
  last_activity_at: string;
};

type ConsumerUserEventRow = {
  id: string;
  user_id: string;
  event_type: string;
  occurred_at: string;
  metadata: unknown;
};

type ConsumerPurchaseRow = {
  id: string;
  user_id: string;
  currency: string;
  total_amount: number;
  status: string;
  purchased_at: string;
  items: unknown;
  metadata: unknown;
};

type ConsumerAccountActionAdminRow = {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  action_type: string;
  occurred_at: string;
  reason_code: string | null;
  reason_text: string | null;
  ip: string | null;
  user_agent: string | null;
};

type ProMembershipRow = {
  establishment_id: string;
  user_id: string;
  role: string;
};

type AuthUserRow = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

type ProUserAdminRow = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  establishments_count: number;
  establishment_ids: string[];
  roles: Record<string, number>;
};

type ProMembershipAdminRow = {
  establishment_id: string;
  role: string;
  establishment: {
    id: string;
    name: string | null;
    title: string | null;
    city: string | null;
    status: string | null;
    universe: string | null;
    subcategory: string | null;
    created_at: string | null;
  } | null;
};

// =============================================================================
// Local helpers
// =============================================================================

async function fetchAuthUsersByIds(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  userIds: string[];
}): Promise<Map<string, AuthUserRow>> {
  const out = new Map<string, AuthUserRow>();
  const wanted = new Set(args.userIds.filter(Boolean));
  if (!wanted.size) return out;

  const perPage = 1000;
  const maxPages = 50;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await args.supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;

    const users = (data as any)?.users as
      | Array<Record<string, unknown>>
      | undefined;
    if (!users?.length) break;

    for (const u of users) {
      const id = typeof u.id === "string" ? u.id : "";
      if (!id || !wanted.has(id)) continue;

      out.set(id, {
        id,
        email: typeof u.email === "string" ? u.email : null,
        created_at: typeof u.created_at === "string" ? u.created_at : null,
        last_sign_in_at:
          typeof u.last_sign_in_at === "string" ? u.last_sign_in_at : null,
      });
    }

    if (out.size >= wanted.size) break;
    if (users.length < perPage) break;
  }

  return out;
}

// =============================================================================
// Consumer user handlers
// =============================================================================

export const listConsumerUsers: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_consumer_users")
    .select("*")
    .neq("account_status", "deleted")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    items: (data ?? []) as ConsumerUserAdminRow[],
  });
};

export const getConsumerUser: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_consumer_users")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return res.status(404).json({ error: error.message });

  res.json({ item: data as ConsumerUserAdminRow });
};

export const updateConsumerUserStatus: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  const status =
    typeof req.body?.status === "string" ? req.body.status.trim() : "";

  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (status !== "active" && status !== "suspended") {
    return res
      .status(400)
      .json({ error: "status must be active or suspended" });
  }

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("consumer_users")
    .update({ status })
    .eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "consumer_user.status",
    entity_type: "consumer_user",
    entity_id: null,
    metadata: { user_id: id, status, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

// ───────────────────── Delete consumer users (soft-delete + auth removal) ─────
export const deleteConsumerUsers: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const body = req.body ?? {};
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((v: unknown) => typeof v === "string" && v.trim()) : [];

  if (ids.length === 0) {
    return res.status(400).json({ error: "Aucun utilisateur sélectionné" });
  }

  if (ids.length > 50) {
    return res.status(400).json({ error: "Maximum 50 utilisateurs à la fois" });
  }

  const supabase = getAdminSupabase();

  // Fetch accounts to delete
  const { data: accounts } = await supabase
    .from("consumer_users")
    .select("id, email, full_name")
    .in("id", ids);

  if (!accounts || accounts.length === 0) {
    return res.status(404).json({ error: "Utilisateurs non trouvés" });
  }

  const deleted: { id: string; email: string }[] = [];
  const errors: { id: string; error: string }[] = [];

  for (const account of accounts) {
    try {
      // Soft delete: anonymize + mark as deleted
      // Note: status check constraint only allows "active" | "suspended"
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
        errors.push({ id: account.id, error: updateErr.message });
        continue;
      }

      // Delete from auth.users
      const { error: authErr } = await supabase.auth.admin.deleteUser(account.id);
      if (authErr) {
        log.error({ err: authErr, userId: account.id }, "Auth deletion failed");
      }

      deleted.push({ id: account.id, email: account.email ?? "" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      errors.push({ id: account.id, error: msg });
    }
  }

  // Audit log
  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "consumer_users.delete",
    entity_type: "consumer_users",
    entity_id: "batch",
    metadata: {
      deleted_count: deleted.length,
      error_count: errors.length,
      deleted_ids: deleted.map((d) => d.id),
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  log.info({ deletedCount: deleted.length, errorCount: errors.length }, "Bulk delete users completed");

  res.json({
    ok: true,
    deleted_count: deleted.length,
    error_count: errors.length,
    deleted,
    errors,
  });
};

export const listConsumerUserEvents: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const limit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const safeLimit = Number.isFinite(limit)
    ? Math.min(500, Math.max(1, Math.floor(limit)))
    : 200;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_consumer_user_events")
    .select("*")
    .eq("user_id", id)
    .order("occurred_at", { ascending: false })
    .limit(safeLimit);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as ConsumerUserEventRow[] });
};

export const updateConsumerUserEvent: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  const eventId =
    typeof req.params.eventId === "string" ? req.params.eventId : "";

  if (!userId) return res.status(400).json({ error: "Identifiant requis" });
  if (!eventId) return res.status(400).json({ error: "Identifiant d'événement requis" });

  const eventType =
    typeof req.body?.event_type === "string"
      ? req.body.event_type.trim()
      : undefined;
  const occurredAt =
    typeof req.body?.occurred_at === "string"
      ? req.body.occurred_at.trim()
      : undefined;
  const metadata = req.body?.metadata as unknown;

  const patch: Record<string, unknown> = {};
  if (eventType) patch.event_type = eventType;
  if (typeof occurredAt === "string") patch.occurred_at = occurredAt;
  if (req.body && "metadata" in req.body) patch.metadata = metadata ?? {};

  if (!Object.keys(patch).length) return res.json({ ok: true });

  const supabase = getAdminSupabase();
  const { data: existing, error: readErr } = await supabase
    .from("consumer_user_events")
    .select("id,user_id")
    .eq("id", eventId)
    .eq("user_id", userId)
    .single();

  if (readErr || !existing)
    return res.status(404).json({ error: "Événement introuvable" });

  const { error: updateErr } = await supabase
    .from("consumer_user_events")
    .update(patch)
    .eq("id", eventId)
    .eq("user_id", userId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "consumer_user_event.update",
    entity_type: "consumer_user_event",
    entity_id: eventId as any,
    metadata: { user_id: userId, patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

export const recomputeConsumerUserReliability: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const computed = await recomputeConsumerUserStatsV1({ supabase, userId: id });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "consumer.reliability.recompute",
    entity_type: "consumer_user",
    entity_id: id,
    metadata: {
      reliability_score: computed.reliabilityScore,
      reliability_level: computed.reliabilityLevel,
      reservations_count: computed.reservationsCount,
      no_shows_count: computed.noShowsCount,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({
    ok: true,
    reliability_score: computed.reliabilityScore,
    reliability_level: computed.reliabilityLevel,
    reservations_count: computed.reservationsCount,
    no_shows_count: computed.noShowsCount,
  });
};

export const listConsumerAccountActions: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const actionType =
    typeof req.query.type === "string" ? req.query.type.trim() : "";
  const userId =
    typeof req.query.user_id === "string" ? req.query.user_id.trim() : "";

  const limit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 500;
  const safeLimit = Number.isFinite(limit)
    ? Math.min(2000, Math.max(1, Math.floor(limit)))
    : 500;

  const supabase = getAdminSupabase();
  let query = supabase
    .from("admin_consumer_account_actions")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(safeLimit);

  if (actionType) query = query.eq("action_type", actionType);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as ConsumerAccountActionAdminRow[] });
};

export const listConsumerUserPurchases: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_consumer_purchases")
    .select("*")
    .eq("user_id", id)
    .order("purchased_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as ConsumerPurchaseRow[] });
};

export const updateConsumerUserPurchase: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  const purchaseId =
    typeof req.params.purchaseId === "string" ? req.params.purchaseId : "";

  if (!userId) return res.status(400).json({ error: "Identifiant requis" });
  if (!purchaseId)
    return res.status(400).json({ error: "Identifiant d'achat requis" });

  const patch: Record<string, unknown> = {};

  const status =
    typeof req.body?.status === "string" ? req.body.status.trim() : undefined;
  const currency =
    typeof req.body?.currency === "string"
      ? req.body.currency.trim()
      : undefined;
  const totalAmount =
    typeof req.body?.total_amount === "number"
      ? req.body.total_amount
      : undefined;
  const purchasedAt =
    typeof req.body?.purchased_at === "string"
      ? req.body.purchased_at.trim()
      : undefined;

  if (status) patch.status = status;
  if (currency) patch.currency = currency;
  if (typeof totalAmount === "number" && Number.isFinite(totalAmount))
    patch.total_amount = Math.max(0, Math.floor(totalAmount));
  if (typeof purchasedAt === "string") patch.purchased_at = purchasedAt;
  if (req.body && "items" in req.body)
    patch.items = (req.body as any).items ?? [];
  if (req.body && "metadata" in req.body)
    patch.metadata = (req.body as any).metadata ?? {};

  if (!Object.keys(patch).length) return res.json({ ok: true });

  const supabase = getAdminSupabase();

  const { data: existing, error: readErr } = await supabase
    .from("consumer_purchases")
    .select("id,user_id")
    .eq("id", purchaseId)
    .eq("user_id", userId)
    .single();

  if (readErr || !existing)
    return res.status(404).json({ error: "Achat introuvable" });

  const { error: updateErr } = await supabase
    .from("consumer_purchases")
    .update(patch)
    .eq("id", purchaseId)
    .eq("user_id", userId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "consumer_purchase.update",
    entity_type: "consumer_purchase",
    entity_id: purchaseId as any,
    metadata: { user_id: userId, patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

// =============================================================================
// Pro user handlers
// =============================================================================

export const listProUsers: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  // 1. Fetch PROs with establishments
  const { data: memberships, error: memErr } = await supabase
    .from("pro_establishment_memberships")
    .select("user_id,establishment_id,role")
    .limit(5000);

  if (memErr) return res.status(500).json({ error: memErr.message });

  const rows = (memberships ?? []) as ProMembershipRow[];

  const byUser = new Map<
    string,
    { establishments: Set<string>; roles: Record<string, number> }
  >();
  for (const m of rows) {
    const userId = typeof m.user_id === "string" ? m.user_id : "";
    const estId =
      typeof m.establishment_id === "string" ? m.establishment_id : "";
    const role =
      typeof m.role === "string" && m.role.trim() ? m.role.trim() : "unknown";
    if (!userId || !estId) continue;

    const existing = byUser.get(userId) ?? {
      establishments: new Set<string>(),
      roles: {},
    };
    existing.establishments.add(estId);
    existing.roles[role] = (existing.roles[role] ?? 0) + 1;
    byUser.set(userId, existing);
  }

  // 2. Fetch PROs from pro_profiles (even without establishment)
  const { data: proProfiles } = await supabase
    .from("pro_profiles")
    .select("user_id")
    .limit(5000);

  const proUserIdsFromProfiles = (proProfiles ?? [])
    .map((p: any) => (typeof p.user_id === "string" ? p.user_id : ""))
    .filter(Boolean);

  // 3. Fetch PROs created via admin (even without establishment or profile)
  const { data: auditLogs } = await supabase
    .from("admin_audit_log")
    .select("entity_id")
    .eq("action", "pro.user.create")
    .eq("entity_type", "pro_user")
    .limit(5000);

  const proUserIdsFromAudit = (auditLogs ?? [])
    .map((logEntry: any) => (typeof logEntry.entity_id === "string" ? logEntry.entity_id : ""))
    .filter(Boolean);

  // 4. Fetch deleted PROs to exclude them
  const { data: deletedLogs } = await supabase
    .from("admin_audit_log")
    .select("entity_id")
    .eq("action", "pro.user.deleted")
    .eq("entity_type", "pro_user")
    .limit(5000);

  const deletedProUserIds = new Set(
    (deletedLogs ?? [])
      .map((logEntry: any) => (typeof logEntry.entity_id === "string" ? logEntry.entity_id : ""))
      .filter(Boolean)
  );

  // Add PROs without establishment to the map
  const allProUserIds = new Set([...proUserIdsFromProfiles, ...proUserIdsFromAudit]);
  for (const userId of allProUserIds) {
    if (!byUser.has(userId)) {
      byUser.set(userId, {
        establishments: new Set<string>(),
        roles: {},
      });
    }
  }

  // Exclude already-deleted PROs
  for (const deletedId of deletedProUserIds) {
    byUser.delete(deletedId);
  }

  const userIds = Array.from(byUser.keys());

  let authById: Map<string, AuthUserRow>;
  try {
    authById = await fetchAuthUsersByIds({ supabase, userIds });
  } catch (e) {
    const msg = (e as any)?.message
      ? String((e as any).message)
      : "Auth lookup failed";
    return res.status(500).json({ error: msg });
  }

  const items: ProUserAdminRow[] = userIds.map((id) => {
    const agg = byUser.get(id);
    const au = authById.get(id) ?? null;
    return {
      id,
      email: au?.email ?? null,
      created_at: au?.created_at ?? null,
      last_sign_in_at: au?.last_sign_in_at ?? null,
      establishments_count: agg ? agg.establishments.size : 0,
      establishment_ids: agg ? Array.from(agg.establishments).sort() : [],
      roles: agg ? agg.roles : {},
    };
  });

  items.sort((a, b) => b.establishments_count - a.establishments_count);

  res.json({ items });
};

export const createProUser: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const payload = isRecord(req.body) ? req.body : {};
  const emailRaw = asString(payload.email);
  const email = emailRaw ? normalizeEmail(emailRaw) : "";
  const establishmentIds = asStringArray(payload.establishment_ids) ?? [];
  const role = asString(payload.role) ?? "owner";

  if (!email || !email.includes("@"))
    return res.status(400).json({ error: "Email requis" });

  const supabase = getAdminSupabase();
  const provisionalPassword = generateProvisionalPassword();

  const { data: createdUser, error: createUserErr } =
    await supabase.auth.admin.createUser({
      email,
      password: provisionalPassword,
      email_confirm: true,
    });

  if (createUserErr || !createdUser.user) {
    return res.status(400).json({
      error: translateErrorMessage(createUserErr?.message) ?? "Impossible de créer l'utilisateur",
    });
  }

  const userId = createdUser.user.id;

  // Create pro_profiles entry so the Pro appears in lists
  // Set must_change_password to force password change on first login
  const { error: profileErr } = await supabase
    .from("pro_profiles")
    .upsert(
      {
        user_id: userId,
        email,
        client_type: "A",
        must_change_password: true,
      },
      { onConflict: "user_id" }
    );

  if (profileErr) {
    log.error({ err: profileErr }, "Erreur creation pro_profiles");
    // Continue even if this fails - the Pro is created
  }

  if (establishmentIds.length) {
    const membershipRows = establishmentIds.map((establishmentId) => ({
      establishment_id: establishmentId,
      user_id: userId,
      role,
    }));

    const { error: membershipErr } = await supabase
      .from("pro_establishment_memberships")
      .insert(membershipRows);
    if (membershipErr) {
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: membershipErr.message });
    }
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "pro.user.create",
    entity_type: "pro_user",
    entity_id: userId,
    metadata: { email, establishment_ids: establishmentIds, role, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  // Send welcome email with provisional password
  const baseUrl = (process.env.PUBLIC_URL ?? "https://sortiraumaroc.com").replace(/\/+$/, "");
  const loginUrl = `${baseUrl}/pro`;

  // Get establishment name(s) for the welcome email
  let establishmentName = "votre établissement";
  if (establishmentIds.length) {
    const { data: estNames } = await supabase
      .from("establishments")
      .select("name")
      .in("id", establishmentIds)
      .limit(3);
    if (estNames && estNames.length > 0) {
      const names = estNames.map((e) => e.name).filter(Boolean);
      establishmentName = names.length > 1 ? names.join(", ") : (names[0] ?? "votre établissement");
    }
  }

  try {
    await sendTemplateEmail({
      templateKey: "pro_welcome_password",
      lang: "fr",
      fromKey: "pro",
      to: [email],
      variables: {
        email,
        password: provisionalPassword,
        establishment_name: establishmentName,
        login_url: loginUrl,
      },
    });
  } catch (emailErr) {
    log.error({ err: emailErr }, "createProUser failed to send welcome email");
    // Continue even if email fails - we'll return the password anyway
  }

  res.json({
    owner: {
      email,
      user_id: userId,
      temporary_password: provisionalPassword,
    },
  });
};

export const listProUserMemberships: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  if (!userId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: memberships, error: memErr } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id,role")
    .eq("user_id", userId)
    .order("establishment_id", { ascending: true })
    .limit(500);

  if (memErr) return res.status(500).json({ error: memErr.message });

  const memRows = (memberships ?? []) as Array<{
    establishment_id: string;
    role: string;
  }>;
  const establishmentIds = memRows
    .map((m) =>
      typeof m.establishment_id === "string" ? m.establishment_id : "",
    )
    .filter(Boolean);

  let establishments: any[] = [];
  if (establishmentIds.length) {
    const { data: estData, error: estErr } = await supabase
      .from("establishments")
      .select("id,name,city,status,universe,subcategory,created_at")
      .in("id", establishmentIds)
      .limit(500);

    if (estErr) return res.status(500).json({ error: estErr.message });
    establishments = estData ?? [];
  }

  const estById = new Map<string, any>();
  for (const e of establishments) {
    if (e && typeof e.id === "string") estById.set(e.id, e);
  }

  const items: ProMembershipAdminRow[] = memRows.map((m) => ({
    establishment_id: m.establishment_id,
    role: m.role,
    establishment: estById.get(m.establishment_id) ?? null,
  }));

  res.json({ items });
};

export const setProUserMemberships: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  if (!userId) return res.status(400).json({ error: "Identifiant requis" });

  const payload = isRecord(req.body) ? req.body : {};
  const role = asString(payload.role) ?? "owner";
  const establishmentIdsRaw = asStringArray(payload.establishment_ids) ?? [];
  const establishmentIds = Array.from(
    new Set(establishmentIdsRaw.filter(Boolean)),
  );

  if (!establishmentIds.length) {
    return res.status(400).json({ error: "Identifiants d'établissements requis" });
  }

  const supabase = getAdminSupabase();

  const { data: existing, error: existingErr } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id")
    .eq("user_id", userId)
    .limit(2000);

  if (existingErr) return res.status(500).json({ error: existingErr.message });

  const existingIds = (existing ?? [])
    .map((r) =>
      r && typeof (r as any).establishment_id === "string"
        ? String((r as any).establishment_id)
        : "",
    )
    .filter(Boolean);

  const toRemove = existingIds.filter((id) => !establishmentIds.includes(id));

  const membershipRows = establishmentIds.map((establishmentId) => ({
    establishment_id: establishmentId,
    user_id: userId,
    role,
  }));

  const { error: upsertErr } = await supabase
    .from("pro_establishment_memberships")
    .upsert(membershipRows, { onConflict: "establishment_id,user_id" });

  if (upsertErr) return res.status(500).json({ error: upsertErr.message });

  if (toRemove.length) {
    const { error: delErr } = await supabase
      .from("pro_establishment_memberships")
      .delete()
      .eq("user_id", userId)
      .in("establishment_id", toRemove);

    if (delErr) return res.status(500).json({ error: delErr.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "pro.memberships.set",
    entity_type: "pro_user",
    entity_id: userId,
    metadata: {
      role,
      establishment_ids: establishmentIds,
      removed_ids: toRemove,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({
    ok: true,
    establishment_ids: establishmentIds,
    removed_ids: toRemove,
  });
};

/**
 * Suspend or reactivate a Pro user account
 * - Suspends: sets status to 'suspended', disables auth user
 * - Reactivates: sets status to 'active', re-enables auth user
 */
export const suspendProUser: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  if (!userId) return res.status(400).json({ error: "Identifiant utilisateur requis" });

  const payload = isRecord(req.body) ? req.body : {};
  const suspend = payload.suspend === true;
  const reason = asString(payload.reason) ?? null;
  const adminUserId = asString(payload.admin_user_id) ?? null;

  const supabase = getAdminSupabase();

  // Check if user exists
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
  if (authError || !authData.user) {
    return res.status(404).json({ error: "Utilisateur non trouvé" });
  }

  const email = authData.user.email ?? "";

  // Update pro_profiles status
  const profileUpdate: Record<string, unknown> = {
    status: suspend ? "suspended" : "active",
    updated_at: new Date().toISOString(),
  };

  if (suspend) {
    profileUpdate.suspended_at = new Date().toISOString();
    profileUpdate.suspended_by = adminUserId;
    profileUpdate.suspension_reason = reason;
  } else {
    profileUpdate.suspended_at = null;
    profileUpdate.suspended_by = null;
    profileUpdate.suspension_reason = null;
  }

  // Upsert pro_profile (create if doesn't exist)
  const { error: profileError } = await supabase
    .from("pro_profiles")
    .upsert(
      {
        user_id: userId,
        ...profileUpdate,
      },
      { onConflict: "user_id" }
    );

  if (profileError) {
    log.error({ err: profileError }, "suspendProUser profile update error");
    return res.status(500).json({ error: profileError.message });
  }

  // Ban/unban the user in Supabase Auth
  // This prevents them from logging in
  const { error: banError } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: suspend ? "876000h" : "0h", // 100 years if suspended, 0 to unban
  });

  if (banError) {
    log.error({ err: banError }, "suspendProUser auth ban error");
    // Don't fail - profile status was already updated
  }

  // Audit log
  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: suspend ? "pro.user.suspended" : "pro.user.reactivated",
    entity_type: "pro_user",
    entity_id: userId,
    metadata: {
      email,
      reason,
      by: adminUserId,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({
    ok: true,
    status: suspend ? "suspended" : "active",
    email,
  });
};

/**
 * Check dependencies for a Pro user before deletion.
 * Returns counts of linked data (quotes, invoices, memberships, etc.)
 */
export const getProUserDependencies: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const userId = req.params.id;
  if (!userId) {
    res.status(400).json({ error: "ID utilisateur requis" });
    return;
  }

  try {
    const supabase = getAdminSupabase();

    const [quotesRes, invoicesRes, membershipsRes] = await Promise.all([
      supabase.from("media_quotes").select("id", { count: "exact", head: true }).eq("pro_user_id", userId),
      supabase.from("media_invoices").select("id", { count: "exact", head: true }).eq("pro_user_id", userId),
      supabase.from("pro_establishment_memberships").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);

    const deps = {
      media_quotes: quotesRes.count ?? 0,
      media_invoices: invoicesRes.count ?? 0,
      establishment_memberships: membershipsRes.count ?? 0,
    };

    const total = deps.media_quotes + deps.media_invoices + deps.establishment_memberships;

    res.json({ ok: true, userId, deps, total });
  } catch (e) {
    log.error({ err: e }, "getProUserDependencies error");
    res.status(500).json({ error: "Erreur lors de la vérification des dépendances" });
  }
};

/**
 * Bulk delete Pro users permanently
 * - Deletes from pro_establishment_memberships
 * - Deletes from pro_profiles
 * - Deletes from Supabase Auth
 * - Logs to audit trail
 */
export const bulkDeleteProUsers: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const payload = isRecord(req.body) ? req.body : {};
  const ids = Array.isArray(payload.ids) ? payload.ids.filter((id): id is string => typeof id === "string") : [];
  const adminUserId = asString(payload.admin_user_id) ?? null;

  if (ids.length === 0) {
    return res.status(400).json({ error: "Aucun utilisateur sélectionné" });
  }

  if (ids.length > 50) {
    return res.status(400).json({ error: "Maximum 50 utilisateurs à la fois" });
  }

  const supabase = getAdminSupabase();
  const actor = getAuditActorInfo(req);
  const results: { id: string; email: string | null; success: boolean; error?: string }[] = [];

  for (const userId of ids) {
    try {
      // Get user info first (may not exist in auth.users for orphaned pro_profiles)
      const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
      const email = authData?.user?.email ?? null;
      const authUserExists = !authError && !!authData?.user;

      // 1. Delete from pro_establishment_memberships
      const { error: membershipError } = await supabase
        .from("pro_establishment_memberships")
        .delete()
        .eq("user_id", userId);

      if (membershipError) {
        log.error({ err: membershipError, userId }, "bulkDeleteProUsers membership delete error");
      }

      // 1b. Delete from tables with FK to pro_profiles (SET NULL + NOT NULL = conflict)
      for (const proDepTable of ["media_quotes", "media_invoices"]) {
        const { error: proDepErr } = await supabase
          .from(proDepTable)
          .delete()
          .eq("pro_user_id", userId);

        if (proDepErr) {
          log.warn({ table: proDepTable, userId, detail: proDepErr.message }, "bulkDeleteProUsers dependency delete warning");
        }
      }

      // 2. Delete from pro_profiles
      const { error: profileError } = await supabase
        .from("pro_profiles")
        .delete()
        .eq("user_id", userId);

      if (profileError) {
        log.error({ err: profileError, userId }, "bulkDeleteProUsers profile delete error");
      }

      // 3. Clean up all public tables that may have FK constraints to auth.users
      //    to prevent "Database error deleting user" from Supabase Auth

      // 3a. Tables with NO ACTION FK to auth.users -- nullify the FK column
      const nullifyTables: { table: string; column: string }[] = [
        { table: "editor_users", column: "created_by_superadmin" },
        { table: "establishment_profile_change_log", column: "actor_id" },
        { table: "establishment_profile_draft_changes", column: "decided_by" },
        { table: "media_threads", column: "closed_by" },
      ];

      for (const dep of nullifyTables) {
        const { error: nullErr } = await supabase
          .from(dep.table)
          .update({ [dep.column]: null } as any)
          .eq(dep.column, userId);

        if (nullErr && !nullErr.message.includes("schema cache")) {
          log.warn({ table: dep.table, column: dep.column, userId, detail: nullErr.message }, "bulkDeleteProUsers nullify warning");
        }
      }

      // 3b. Tables where the entire row should be deleted
      const dependentTables: { table: string; column: string }[] = [
        { table: "consumer_user_stats", column: "user_id" },
        { table: "consumer_password_reset_tokens", column: "user_id" },
        { table: "consumer_user_totp_secrets", column: "user_id" },
        { table: "consumer_users", column: "id" },
        { table: "fcm_tokens", column: "user_id" },
        { table: "reservations", column: "user_id" },
      ];

      for (const dep of dependentTables) {
        const { error: depError } = await supabase
          .from(dep.table)
          .delete()
          .eq(dep.column, userId);

        if (depError && !depError.message.includes("schema cache")) {
          log.warn({ table: dep.table, userId, detail: depError.message }, "bulkDeleteProUsers cleanup warning");
        }
      }

      // 4. Delete from Supabase Auth (only if the user exists there)
      if (authUserExists) {
        // First attempt: standard delete
        let authDeleteError: Error | null = null;
        const result1 = await supabase.auth.admin.deleteUser(userId);
        authDeleteError = result1.error;

        // If still failing due to FK constraints, try with SQL RPC to force-clean remaining deps
        if (authDeleteError?.message?.includes("Database error")) {
          log.warn({ userId }, "bulkDeleteProUsers standard delete failed, trying force cleanup via SQL");

          // Use rpc to run a cleanup function - delete from all remaining dependent tables
          const { error: rpcError } = await supabase.rpc("admin_force_delete_user_deps", {
            target_user_id: userId,
          });

          if (rpcError) {
            log.warn({ userId }, "bulkDeleteProUsers RPC cleanup not available, proceeding with direct auth delete");
          }

          // Retry the auth delete
          const result2 = await supabase.auth.admin.deleteUser(userId);
          authDeleteError = result2.error;
        }

        if (authDeleteError) {
          log.error({ err: authDeleteError, userId }, "bulkDeleteProUsers auth delete error");
          results.push({ id: userId, email, success: false, error: authDeleteError.message });
          continue;
        }
      }

      // 4. Audit log
      await supabase.from("admin_audit_log").insert({
        actor_id: actor.actor_id,
        action: "pro.user.deleted",
        entity_type: "pro_user",
        entity_id: userId,
        metadata: {
          email,
          by: adminUserId,
          permanent: true,
          auth_user_existed: authUserExists,
          actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
        },
      });

      results.push({ id: userId, email, success: true });
    } catch (err) {
      log.error({ err, userId }, "bulkDeleteProUsers unexpected error");
      results.push({ id: userId, email: null, success: false, error: "Erreur inattendue" });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  res.json({
    ok: true,
    deleted: successCount,
    failed: failureCount,
    results,
  });
};

/**
 * Regenerate password for a Pro user
 * - Generate a new provisional password
 * - Update the user in Supabase Auth
 * - Set must_change_password flag
 * - Send email with new password
 */
export const regenerateProUserPassword: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = typeof req.params.id === "string" ? req.params.id : "";
  if (!userId) return res.status(400).json({ error: "Identifiant utilisateur requis" });

  const supabase = getAdminSupabase();

  // Get user info first
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
  if (authError || !authData.user) {
    return res.status(404).json({ error: "Utilisateur non trouvé" });
  }

  const email = authData.user.email;
  if (!email) {
    return res.status(400).json({ error: "L'utilisateur n'a pas d'adresse email" });
  }

  // Generate new password
  const newPassword = generateProvisionalPassword();

  // Update password in Supabase Auth
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (updateError) {
    return res.status(500).json({ error: `Erreur lors de la mise à jour du mot de passe: ${updateError.message}` });
  }

  // Set must_change_password flag
  const { error: profileError } = await supabase
    .from("pro_profiles")
    .upsert(
      {
        user_id: userId,
        must_change_password: true,
      },
      { onConflict: "user_id" }
    );

  if (profileError) {
    log.error({ err: profileError }, "regenerateProUserPassword failed to set must_change_password");
  }

  // Get establishment names for the email
  const { data: memberships } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id")
    .eq("user_id", userId)
    .limit(3);

  let establishmentName = "votre établissement";
  if (memberships && memberships.length > 0) {
    const estIds = memberships.map((m) => m.establishment_id);
    const { data: estNames } = await supabase
      .from("establishments")
      .select("name")
      .in("id", estIds)
      .limit(3);
    if (estNames && estNames.length > 0) {
      const names = estNames.map((e) => e.name).filter(Boolean);
      establishmentName = names.length > 1 ? names.join(", ") : (names[0] ?? "votre établissement");
    }
  }

  // Send email with new password
  const baseUrl = (process.env.PUBLIC_URL ?? "https://sortiraumaroc.com").replace(/\/+$/, "");
  const loginUrl = `${baseUrl}/pro`;

  try {
    await sendTemplateEmail({
      templateKey: "pro_password_regenerated",
      lang: "fr",
      fromKey: "pro",
      to: [email],
      variables: {
        email,
        password: newPassword,
        establishment_name: establishmentName,
        login_url: loginUrl,
      },
    });
  } catch (emailErr) {
    log.error({ err: emailErr }, "regenerateProUserPassword failed to send email");
    // Continue - password was updated successfully
  }

  // Log the action
  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "pro.user.password_regenerated",
    entity_type: "pro_user",
    entity_id: userId,
    metadata: { email, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  // Always return the credentials so admin can show them in a popup
  res.json({
    ok: true,
    message: "Nouveau mot de passe généré et envoyé par email",
    credentials: {
      email,
      password: newPassword,
    },
  });
};

/**
 * Remove a Pro user from an establishment
 * - Only removes the membership link (does NOT delete the Pro user)
 * - Requires admin/superadmin permission
 * - Logs the action to audit trail
 */
export const removeProFromEstablishment: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const proUserId = typeof req.params.proUserId === "string" ? req.params.proUserId : "";

  if (!establishmentId) return res.status(400).json({ error: "Identifiant établissement requis" });
  if (!proUserId) return res.status(400).json({ error: "Identifiant Pro requis" });

  const supabase = getAdminSupabase();

  // Get Pro user info for audit
  const { data: authData } = await supabase.auth.admin.getUserById(proUserId);
  const proEmail = authData?.user?.email ?? null;

  // Get establishment info for audit
  const { data: estData } = await supabase
    .from("establishments")
    .select("name")
    .eq("id", establishmentId)
    .single();
  const establishmentName = estData?.name ?? null;

  // Delete the membership
  const { error: deleteErr, count } = await supabase
    .from("pro_establishment_memberships")
    .delete({ count: "exact" })
    .eq("user_id", proUserId)
    .eq("establishment_id", establishmentId);

  if (deleteErr) {
    return res.status(500).json({ error: `Erreur lors de la suppression: ${deleteErr.message}` });
  }

  if (!count || count === 0) {
    return res.status(404).json({ error: "Ce Pro n'est pas rattaché à cet établissement" });
  }

  // Audit log
  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "pro.membership.removed",
    entity_type: "establishment",
    entity_id: establishmentId,
    metadata: {
      pro_user_id: proUserId,
      pro_email: proEmail,
      establishment_name: establishmentName,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({
    ok: true,
    message: "Pro détaché de l'établissement avec succès",
    pro_email: proEmail,
    establishment_name: establishmentName,
  });
};
