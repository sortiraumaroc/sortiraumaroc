/**
 * Routes API PRO - Team Management
 *
 * Extracted from the monolithic pro.ts.
 *
 * Endpoints for:
 * - Creating team members
 * - Listing team members
 * - Updating member role / email
 * - Deleting team members
 * - Toggling member active/inactive (ban/unban)
 * - Resetting member password
 */

import type { RequestHandler } from "express";
import { randomBytes } from "node:crypto";

import { getAdminSupabase } from "../supabaseAdmin";
import { sendTemplateEmail } from "../emailService";
import { createModuleLogger } from "../lib/logger";
import {
  parseBearerToken,
  getUserFromBearerToken,
  ensureRole,
  ensureCanCreateTeamMember,
  isRecord,
  asString,
  asBoolean,
  normalizeEmail,
  type ProRole,
} from "./proHelpers";

const log = createModuleLogger("proTeam");

// =============================================================================
// createProTeamUser
// =============================================================================

export const createProTeamUser: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const emailRaw = asString(req.body.email);
  const password = asString(req.body.password);
  const roleRaw = asString(req.body.role);

  const email = emailRaw ? normalizeEmail(emailRaw) : "";

  if (!email || !email.includes("@")) return res.status(400).json({ error: "Email invalide" });
  if (!password || password.length < 6) return res.status(400).json({ error: "Mot de passe invalide" });

  const allowedRoles = new Set<ProRole>(["manager", "reception", "accounting", "marketing"]);
  const targetRole: ProRole = roleRaw && allowedRoles.has(roleRaw) ? roleRaw : "manager";

  const supabase = getAdminSupabase();

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created.user) {
    return res.status(400).json({ error: createErr?.message ?? "Impossible de créer l'utilisateur" });
  }

  const { error: membershipErr } = await supabase.from("pro_establishment_memberships").insert({
    establishment_id: establishmentId,
    user_id: created.user.id,
    role: targetRole,
  });

  if (membershipErr) return res.status(500).json({ error: membershipErr.message });

  // Create pro_profiles entry with must_change_password flag
  const { error: profileErr } = await supabase.from("pro_profiles").upsert(
    {
      id: created.user.id,
      must_change_password: true,
    },
    { onConflict: "id" }
  );

  if (profileErr) {
    log.error({ err: profileErr.message }, "Failed to create pro_profiles");
  }

  // Send welcome email with provisional password
  try {
    // Get establishment name for the email
    const { data: establishment } = await supabase
      .from("establishments")
      .select("name")
      .eq("id", establishmentId)
      .maybeSingle();

    const establishmentName = establishment?.name ?? "l'établissement";
    const baseUrl = (process.env.PUBLIC_URL ?? "https://sortiraumaroc.com").replace(/\/+$/, "");
    const loginUrl = `${baseUrl}/pro`;

    await sendTemplateEmail({
      templateKey: "pro_welcome_password",
      lang: "fr",
      fromKey: "pro",
      to: [email],
      variables: {
        email,
        password,
        establishment_name: establishmentName,
        login_url: loginUrl,
      },
    });
  } catch (emailErr) {
    log.error({ err: emailErr }, "Failed to send welcome email");
    // Don't fail the request, user was created successfully
  }

  res.json({ ok: true, user_id: created.user.id });
};

// =============================================================================
// listProTeamMembers
// =============================================================================

export const listProTeamMembers: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("pro_establishment_memberships")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // Fetch emails and ban status for all members using auth.admin.getUserById
  const members = data ?? [];
  const userDataMap = new Map<string, { email: string; is_banned: boolean }>();

  for (const m of members as Array<{ user_id?: string }>) {
    const userId = m.user_id;
    if (!userId) continue;

    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId);
    if (userErr) {
      log.error({ userId, err: userErr.message }, "Failed to get user");
      continue;
    }
    if (userData?.user) {
      const user = userData.user;
      const isBanned = !!((user as any).banned_until && new Date((user as any).banned_until) > new Date());
      userDataMap.set(userId, {
        email: user.email ?? "",
        is_banned: isBanned,
      });
    }
  }

  // Enrich members with email and is_banned
  const enrichedMembers = members.map((m: { user_id?: string }) => {
    const userData = m.user_id ? userDataMap.get(m.user_id) : null;
    return {
      ...m,
      email: userData?.email ?? null,
      is_banned: userData?.is_banned ?? false,
    };
  });

  log.info({ userCount: userDataMap.size, memberCount: members.length }, "Listed team members");

  return res.json({ ok: true, members: enrichedMembers });
};

// =============================================================================
// updateProTeamMemberRole
// =============================================================================

export const updateProTeamMemberRole: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const membershipId = typeof req.params.membershipId === "string" ? req.params.membershipId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!membershipId) return res.status(400).json({ error: "membershipId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const roleRaw = asString(req.body.role);
  const allowedRoles = new Set<ProRole>(["manager", "reception", "accounting", "marketing"]);
  const nextRole: ProRole = roleRaw && allowedRoles.has(roleRaw) ? roleRaw : "";
  if (!nextRole) return res.status(400).json({ error: "Role invalide" });

  const supabase = getAdminSupabase();

  const { data: existing, error: existingErr } = await supabase
    .from("pro_establishment_memberships")
    .select("id,role")
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (!existing) return res.status(404).json({ error: "membership_not_found" });

  const currentRole = (existing as { role?: unknown } | null)?.role;
  if (typeof currentRole === "string" && currentRole === "owner") {
    return res.status(400).json({ error: "Cannot change owner role" });
  }

  const { error } = await supabase
    .from("pro_establishment_memberships")
    .update({ role: nextRole })
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true });
};

// =============================================================================
// deleteProTeamMember
// =============================================================================

export const deleteProTeamMember: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const membershipId = typeof req.params.membershipId === "string" ? req.params.membershipId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!membershipId) return res.status(400).json({ error: "membershipId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  // Check if the membership exists and is not owner
  const { data: existing, error: existingErr } = await supabase
    .from("pro_establishment_memberships")
    .select("id,role,user_id")
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (!existing) return res.status(404).json({ error: "membership_not_found" });

  const currentRole = (existing as { role?: unknown } | null)?.role;
  if (typeof currentRole === "string" && currentRole === "owner") {
    return res.status(400).json({ error: "Cannot delete owner membership" });
  }

  // Delete the membership
  const { error: deleteErr } = await supabase
    .from("pro_establishment_memberships")
    .delete()
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId);

  if (deleteErr) return res.status(500).json({ error: deleteErr.message });

  return res.json({ ok: true });
};

// =============================================================================
// updateProTeamMemberEmail
// =============================================================================

export const updateProTeamMemberEmail: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const membershipId = typeof req.params.membershipId === "string" ? req.params.membershipId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!membershipId) return res.status(400).json({ error: "membershipId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const emailRaw = asString(req.body.email);
  const newEmail = emailRaw ? normalizeEmail(emailRaw) : "";
  if (!newEmail || !newEmail.includes("@")) return res.status(400).json({ error: "Email invalide" });

  const supabase = getAdminSupabase();

  // Get the membership to find user_id
  const { data: membership, error: membershipErr } = await supabase
    .from("pro_establishment_memberships")
    .select("id,role,user_id")
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (membershipErr) return res.status(500).json({ error: membershipErr.message });
  if (!membership) return res.status(404).json({ error: "membership_not_found" });

  const userId = (membership as { user_id?: string }).user_id;
  if (!userId) return res.status(400).json({ error: "user_id not found" });

  // Update the user's email
  const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  });

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  return res.json({ ok: true, email: newEmail });
};

// =============================================================================
// toggleProTeamMemberActive
// =============================================================================

export const toggleProTeamMemberActive: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const membershipId = typeof req.params.membershipId === "string" ? req.params.membershipId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!membershipId) return res.status(400).json({ error: "membershipId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const active = asBoolean(req.body.active);
  if (typeof active !== "boolean") return res.status(400).json({ error: "active must be a boolean" });

  const supabase = getAdminSupabase();

  // Get the membership to find user_id and check role
  const { data: membership, error: membershipErr } = await supabase
    .from("pro_establishment_memberships")
    .select("id,role,user_id")
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (membershipErr) return res.status(500).json({ error: membershipErr.message });
  if (!membership) return res.status(404).json({ error: "membership_not_found" });

  const currentRole = (membership as { role?: string }).role;
  if (currentRole === "owner") {
    return res.status(400).json({ error: "Cannot deactivate owner" });
  }

  const userId = (membership as { user_id?: string }).user_id;
  if (!userId) return res.status(400).json({ error: "user_id not found" });

  // Ban or unban the user
  if (active) {
    // Unban: set ban_duration to "none"
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: "none",
    });
    if (updateErr) return res.status(500).json({ error: updateErr.message });
  } else {
    // Ban indefinitely
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: "876600h", // ~100 years
    });
    if (updateErr) return res.status(500).json({ error: updateErr.message });
  }

  return res.json({ ok: true, active });
};

// =============================================================================
// resetProTeamMemberPassword
// =============================================================================

export const resetProTeamMemberPassword: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const membershipId = typeof req.params.membershipId === "string" ? req.params.membershipId : "";

  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!membershipId) return res.status(400).json({ error: "membershipId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  // Get the membership to find user_id
  const { data: membership, error: membershipErr } = await supabase
    .from("pro_establishment_memberships")
    .select("id,role,user_id")
    .eq("id", membershipId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (membershipErr) return res.status(500).json({ error: membershipErr.message });
  if (!membership) return res.status(404).json({ error: "membership_not_found" });

  const userId = (membership as { user_id?: string }).user_id;
  if (!userId) return res.status(400).json({ error: "user_id not found" });

  // Get the user's email
  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId);
  if (userErr || !userData?.user?.email) {
    return res.status(500).json({ error: "Could not get user email" });
  }

  const email = userData.user.email;

  // Generate a new temporary password
  const tempPassword = randomBytes(8).toString("hex");

  // Update the user's password
  const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
    password: tempPassword,
  });

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  // Mark that user must change password
  await supabase.from("pro_profiles").upsert(
    { id: userId, must_change_password: true },
    { onConflict: "id" }
  );

  // Send email with new password
  try {
    const { data: establishment } = await supabase
      .from("establishments")
      .select("name")
      .eq("id", establishmentId)
      .maybeSingle();

    const establishmentName = establishment?.name ?? "l'établissement";
    const baseUrl = (process.env.PUBLIC_URL ?? "https://sortiraumaroc.com").replace(/\/+$/, "");
    const loginUrl = `${baseUrl}/pro`;

    await sendTemplateEmail({
      templateKey: "pro_password_regenerated",
      lang: "fr",
      fromKey: "pro",
      to: [email],
      variables: {
        email,
        password: tempPassword,
        establishment_name: establishmentName,
        login_url: loginUrl,
      },
    });
  } catch (emailErr) {
    log.error({ err: emailErr }, "Failed to send password reset email");
    // Don't fail - password was reset successfully
  }

  return res.json({ ok: true });
};
