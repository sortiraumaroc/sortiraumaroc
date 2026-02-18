import type { RequestHandler } from "express";
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

import { getAdminSupabase, checkAdminKey } from "../supabaseAdmin";
import { requireAdminKey } from "./admin";

const scryptAsync = promisify(scrypt);

// Password hashing using scrypt
const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const storedKey = Buffer.from(keyHex, "hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

  return timingSafeEqual(storedKey, derivedKey);
}

// Helper functions
function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

type CollaboratorRow = {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  function: string | null;
  joined_at: string | null;
  avatar_url: string | null;
  role_id: string;
  status: "active" | "suspended";
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type RoleRow = {
  id: string;
  name: string;
  permissions: Record<string, Record<string, boolean>>;
  created_at: string;
  updated_at: string;
};

// =============================================================================
// COLLABORATORS CRUD
// =============================================================================

export const listCollaborators: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  // Check if current user is superadmin
  const headerKey = req.header("x-admin-key") ?? undefined;
  const isSuperadmin = checkAdminKey(headerKey) || (req as any).adminSession?.role === "superadmin";

  const supabase = getAdminSupabase();

  let query = supabase
    .from("admin_collaborators")
    .select("id, email, first_name, last_name, display_name, function, joined_at, avatar_url, role_id, status, last_login_at, created_at, updated_at")
    .order("created_at", { ascending: false });

  // If not superadmin, filter out superadmin accounts
  if (!isSuperadmin) {
    query = query.neq("role_id", "superadmin");
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  const items = (data ?? []).map((row: any) => ({
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    function: row.function,
    joinedAt: row.joined_at,
    avatarUrl: row.avatar_url,
    roleId: row.role_id,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  res.json({ ok: true, items, collaborators: items });
};

export const createCollaborator: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  // Check if current user is superadmin
  const headerKey = req.header("x-admin-key") ?? undefined;
  const isSuperadmin = checkAdminKey(headerKey) || (req as any).adminSession?.role === "superadmin";

  const body = req.body;
  if (!isRecord(body)) return res.status(400).json({ error: "Invalid body" });

  const email = asString(body.email)?.toLowerCase();
  const firstName = asString(body.firstName);
  const lastName = asString(body.lastName);
  const password = asString(body.password);
  const displayName = asString(body.displayName) ?? null;
  const func = asString(body.function) ?? null;
  const joinedAt = asString(body.joinedAt) ?? null;
  const avatarUrl = asString(body.avatarUrl) ?? null;
  const roleId = asString(body.roleId) ?? "ops";

  // Non-superadmins cannot create superadmin accounts
  if (roleId === "superadmin" && !isSuperadmin) {
    return res.status(403).json({ error: "Seul un superadmin peut créer des comptes superadmin" });
  }

  if (!email) return res.status(400).json({ error: "L'email est requis" });
  if (!firstName) return res.status(400).json({ error: "Le prénom est requis" });
  if (!lastName) return res.status(400).json({ error: "Le nom est requis" });
  if (!password) return res.status(400).json({ error: "Le mot de passe est requis" });
  if (password.length < 6) return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });

  const supabase = getAdminSupabase();

  // Check if email already exists
  const { data: existing } = await supabase
    .from("admin_collaborators")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return res.status(400).json({ error: "Cet email est déjà utilisé par un autre collaborateur" });
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  const { data, error } = await supabase
    .from("admin_collaborators")
    .insert({
      email,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      function: func,
      joined_at: joinedAt,
      avatar_url: avatarUrl,
      role_id: roleId,
      status: "active",
    })
    .select("id, email, first_name, last_name, display_name, function, joined_at, avatar_url, role_id, status, last_login_at, created_at, updated_at")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const row = data as any;
  res.json({
    ok: true,
    item: {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      function: row.function,
      joinedAt: row.joined_at,
      avatarUrl: row.avatar_url,
      roleId: row.role_id,
      status: row.status,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
};

export const updateCollaborator: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  // Check current user's role
  const headerKey = req.header("x-admin-key") ?? undefined;
  const currentUserRole = (req as any).adminSession?.role;
  const isSuperadmin = checkAdminKey(headerKey) || currentUserRole === "superadmin";

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "id is required" });

  const supabase = getAdminSupabase();

  // Check target collaborator's role
  const { data: target } = await supabase
    .from("admin_collaborators")
    .select("role_id")
    .eq("id", id)
    .maybeSingle();

  // Non-superadmins cannot modify superadmin accounts
  if (target?.role_id === "superadmin" && !isSuperadmin) {
    return res.status(403).json({ error: "Vous ne pouvez pas modifier un compte superadmin" });
  }

  // Admins cannot modify other admins (only superadmin can)
  if (target?.role_id === "admin" && currentUserRole === "admin") {
    return res.status(403).json({ error: "Un admin ne peut pas modifier un autre admin" });
  }

  const body = req.body;
  if (!isRecord(body)) return res.status(400).json({ error: "Invalid body" });

  const update: Record<string, unknown> = {};

  const firstName = asString(body.firstName);
  if (firstName !== undefined) update.first_name = firstName;

  const lastName = asString(body.lastName);
  if (lastName !== undefined) update.last_name = lastName;

  const displayName = asString(body.displayName);
  if (displayName !== undefined) update.display_name = displayName || null;

  const func = asString(body.function);
  if (func !== undefined) update.function = func || null;

  const joinedAt = asString(body.joinedAt);
  if (joinedAt !== undefined) update.joined_at = joinedAt || null;

  const avatarUrl = asString(body.avatarUrl);
  if (avatarUrl !== undefined) update.avatar_url = avatarUrl || null;

  const roleId = asString(body.roleId);
  if (roleId !== undefined) {
    // Non-superadmins cannot promote to superadmin
    if (roleId === "superadmin" && !isSuperadmin) {
      return res.status(403).json({ error: "Seul un superadmin peut attribuer le rôle superadmin" });
    }
    update.role_id = roleId;
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: "Aucune modification fournie" });
  }

  const { data, error } = await supabase
    .from("admin_collaborators")
    .update(update)
    .eq("id", id)
    .select("id, email, first_name, last_name, display_name, function, joined_at, avatar_url, role_id, status, last_login_at, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") return res.status(404).json({ error: "Collaborateur non trouvé" });
    return res.status(500).json({ error: error.message });
  }

  const row = data as any;
  res.json({
    ok: true,
    item: {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      function: row.function,
      joinedAt: row.joined_at,
      avatarUrl: row.avatar_url,
      roleId: row.role_id,
      status: row.status,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
};

export const deleteCollaborator: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  // Check current user's role
  const headerKey = req.header("x-admin-key") ?? undefined;
  const currentUserRole = (req as any).adminSession?.role;
  const isSuperadmin = checkAdminKey(headerKey) || currentUserRole === "superadmin";

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "id is required" });

  const supabase = getAdminSupabase();

  // Check target collaborator's role
  const { data: target } = await supabase
    .from("admin_collaborators")
    .select("role_id")
    .eq("id", id)
    .maybeSingle();

  // Non-superadmins cannot delete superadmin accounts
  if (target?.role_id === "superadmin" && !isSuperadmin) {
    return res.status(403).json({ error: "Vous ne pouvez pas supprimer un compte superadmin" });
  }

  // Admins cannot delete other admins (only superadmin can)
  if (target?.role_id === "admin" && currentUserRole === "admin") {
    return res.status(403).json({ error: "Un admin ne peut pas supprimer un autre admin" });
  }

  const { error } = await supabase.from("admin_collaborators").delete().eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

export const suspendCollaborator: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  // Check current user's role
  const headerKey = req.header("x-admin-key") ?? undefined;
  const currentUserRole = (req as any).adminSession?.role;
  const isSuperadmin = checkAdminKey(headerKey) || currentUserRole === "superadmin";

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "id is required" });

  const supabase = getAdminSupabase();

  // Check target collaborator's role
  const { data: target } = await supabase
    .from("admin_collaborators")
    .select("role_id")
    .eq("id", id)
    .maybeSingle();

  // Non-superadmins cannot suspend superadmin accounts
  if (target?.role_id === "superadmin" && !isSuperadmin) {
    return res.status(403).json({ error: "Vous ne pouvez pas suspendre un compte superadmin" });
  }

  // Admins cannot suspend other admins (only superadmin can)
  if (target?.role_id === "admin" && currentUserRole === "admin") {
    return res.status(403).json({ error: "Un admin ne peut pas suspendre un autre admin" });
  }

  const { data, error } = await supabase
    .from("admin_collaborators")
    .update({ status: "suspended" })
    .eq("id", id)
    .select("id, email, first_name, last_name, display_name, function, joined_at, avatar_url, role_id, status, last_login_at, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") return res.status(404).json({ error: "Collaborateur non trouvé" });
    return res.status(500).json({ error: error.message });
  }

  const row = data as any;
  res.json({
    ok: true,
    item: {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      function: row.function,
      joinedAt: row.joined_at,
      avatarUrl: row.avatar_url,
      roleId: row.role_id,
      status: row.status,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
};

export const reactivateCollaborator: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  // Check current user's role
  const headerKey = req.header("x-admin-key") ?? undefined;
  const currentUserRole = (req as any).adminSession?.role;
  const isSuperadmin = checkAdminKey(headerKey) || currentUserRole === "superadmin";

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "id is required" });

  const supabase = getAdminSupabase();

  // Check target collaborator's role
  const { data: target } = await supabase
    .from("admin_collaborators")
    .select("role_id")
    .eq("id", id)
    .maybeSingle();

  // Non-superadmins cannot reactivate superadmin accounts
  if (target?.role_id === "superadmin" && !isSuperadmin) {
    return res.status(403).json({ error: "Vous ne pouvez pas réactiver un compte superadmin" });
  }

  // Admins cannot reactivate other admins (only superadmin can)
  if (target?.role_id === "admin" && currentUserRole === "admin") {
    return res.status(403).json({ error: "Un admin ne peut pas réactiver un autre admin" });
  }

  const { data, error } = await supabase
    .from("admin_collaborators")
    .update({ status: "active" })
    .eq("id", id)
    .select("id, email, first_name, last_name, display_name, function, joined_at, avatar_url, role_id, status, last_login_at, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") return res.status(404).json({ error: "Collaborateur non trouvé" });
    return res.status(500).json({ error: error.message });
  }

  const row = data as any;
  res.json({
    ok: true,
    item: {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      function: row.function,
      joinedAt: row.joined_at,
      avatarUrl: row.avatar_url,
      roleId: row.role_id,
      status: row.status,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
};

export const resetCollaboratorPassword: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  // Check current user's role
  const headerKey = req.header("x-admin-key") ?? undefined;
  const currentUserRole = (req as any).adminSession?.role;
  const isSuperadmin = checkAdminKey(headerKey) || currentUserRole === "superadmin";

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "id is required" });

  const supabase = getAdminSupabase();

  // Check target collaborator's role
  const { data: target } = await supabase
    .from("admin_collaborators")
    .select("role_id")
    .eq("id", id)
    .maybeSingle();

  // Non-superadmins cannot reset password for superadmin accounts
  if (target?.role_id === "superadmin" && !isSuperadmin) {
    return res.status(403).json({ error: "Vous ne pouvez pas réinitialiser le mot de passe d'un compte superadmin" });
  }

  // Admins cannot reset password for other admins (only superadmin can)
  if (target?.role_id === "admin" && currentUserRole === "admin") {
    return res.status(403).json({ error: "Un admin ne peut pas réinitialiser le mot de passe d'un autre admin" });
  }

  const body = req.body;
  if (!isRecord(body)) return res.status(400).json({ error: "Invalid body" });

  const newPassword = asString(body.password);
  if (!newPassword) return res.status(400).json({ error: "Le nouveau mot de passe est requis" });
  if (newPassword.length < 6) return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });

  const passwordHash = await hashPassword(newPassword);

  const { error } = await supabase
    .from("admin_collaborators")
    .update({ password_hash: passwordHash })
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// =============================================================================
// ROLES CRUD
// =============================================================================

export const listRoles: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  // Check if current user is superadmin
  const headerKey = req.header("x-admin-key") ?? undefined;
  const isSuperadmin = checkAdminKey(headerKey) || (req as any).adminSession?.role === "superadmin";

  const supabase = getAdminSupabase();

  let query = supabase
    .from("admin_roles")
    .select("*")
    .order("name", { ascending: true });

  // If not superadmin, filter out superadmin role
  if (!isSuperadmin) {
    query = query.neq("id", "superadmin");
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  const items = (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    permissions: row.permissions ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  res.json({ ok: true, items, roles: items });
};

export const createRole: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const body = req.body;
  if (!isRecord(body)) return res.status(400).json({ error: "Invalid body" });

  const id = asString(body.id);
  const name = asString(body.name);
  const permissions = body.permissions;

  if (!id) return res.status(400).json({ error: "L'identifiant du rôle est requis" });
  if (!name) return res.status(400).json({ error: "Le nom du rôle est requis" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("admin_roles")
    .insert({
      id,
      name,
      permissions: permissions ?? {},
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return res.status(400).json({ error: "Un rôle avec cet identifiant existe déjà" });
    return res.status(500).json({ error: error.message });
  }

  const row = data as any;
  const role = {
    id: row.id,
    name: row.name,
    permissions: row.permissions ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  res.json({ ok: true, role });
};

export const updateRole: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "id is required" });

  // Prevent modifying superadmin role
  if (id === "superadmin") {
    return res.status(403).json({ error: "Le rôle Super-administrateur ne peut pas être modifié" });
  }

  const body = req.body;
  if (!isRecord(body)) return res.status(400).json({ error: "Invalid body" });

  const update: Record<string, unknown> = {};

  const name = asString(body.name);
  if (name !== undefined) update.name = name;

  if (body.permissions !== undefined) {
    update.permissions = body.permissions;
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: "Aucune modification fournie" });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("admin_roles")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST116") return res.status(404).json({ error: "Rôle non trouvé" });
    return res.status(500).json({ error: error.message });
  }

  const row = data as any;
  const role = {
    id: row.id,
    name: row.name,
    permissions: row.permissions ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  res.json({ ok: true, role });
};

export const deleteRole: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "id is required" });

  // Prevent deleting built-in roles
  const protectedRoles = ["superadmin", "ops", "support", "marketing", "accounting"];
  if (protectedRoles.includes(id)) {
    return res.status(403).json({ error: "Ce rôle système ne peut pas être supprimé" });
  }

  const supabase = getAdminSupabase();

  // Check if any collaborators use this role
  const { data: collaborators } = await supabase
    .from("admin_collaborators")
    .select("id")
    .eq("role_id", id)
    .limit(1);

  if (collaborators && collaborators.length > 0) {
    return res.status(400).json({ error: "Ce rôle est utilisé par des collaborateurs et ne peut pas être supprimé" });
  }

  const { error } = await supabase.from("admin_roles").delete().eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// =============================================================================
// COLLABORATOR LOGIN (separate from main admin login)
// =============================================================================

// =============================================================================
// CURRENT USER PROFILE (self-service)
// =============================================================================

export const getMyProfile: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  // Get collaborator_id from session token
  let collaboratorId = (req as any).adminSession?.collaborator_id;
  const sessionPayload = (req as any).adminSession;
  const supabase = getAdminSupabase();

  // If no collaborator_id in token, try to find by email (for legacy sessions)
  if (!collaboratorId && sessionPayload?.sub) {
    const { data: existingCollab } = await supabase
      .from("admin_collaborators")
      .select("id")
      .eq("email", sessionPayload.sub)
      .maybeSingle();

    if (existingCollab) {
      collaboratorId = existingCollab.id;
    }
  }

  // For superadmin role without collaborator, auto-create one
  if (!collaboratorId && sessionPayload?.role === "superadmin") {
    const adminEmail = sessionPayload?.sub || "admin@sortiraumaroc.ma";
    const adminName = sessionPayload?.name || "Admin";

    const { data: newCollab, error: createErr } = await supabase
      .from("admin_collaborators")
      .insert({
        email: adminEmail,
        first_name: adminName,
        last_name: "",
        display_name: adminName,
        role_id: "superadmin",
        status: "active",
        password_hash: "legacy_auth_no_password",
      })
      .select("id")
      .single();

    if (!createErr && newCollab) {
      collaboratorId = newCollab.id;
    }
  }

  if (!collaboratorId) {
    // For legacy/superadmin sessions without collaborator, return minimal info
    return res.json({
      ok: true,
      profile: {
        id: null,
        email: sessionPayload?.sub || "admin",
        firstName: sessionPayload?.name || "Admin",
        lastName: "",
        displayName: sessionPayload?.name || "Admin",
        function: null,
        avatarUrl: null,
        roleId: sessionPayload?.role || "superadmin",
        isLegacySession: true,
      },
    });
  }

  const { data, error } = await supabase
    .from("admin_collaborators")
    .select("id, email, first_name, last_name, display_name, function, joined_at, avatar_url, role_id, status, created_at")
    .eq("id", collaboratorId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return res.status(404).json({ error: "Profil non trouvé" });
    return res.status(500).json({ error: error.message });
  }

  const row = data as any;
  res.json({
    ok: true,
    profile: {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      function: row.function,
      joinedAt: row.joined_at,
      avatarUrl: row.avatar_url,
      roleId: row.role_id,
      status: row.status,
      createdAt: row.created_at,
      isLegacySession: false,
    },
  });
};

export const updateMyProfile: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const sessionPayload = (req as any).adminSession;
  const supabase = getAdminSupabase();

  // Get collaborator_id from session token, or find by email for legacy sessions
  let collaboratorId = sessionPayload?.collaborator_id;

  if (!collaboratorId && sessionPayload?.sub) {
    const { data: existingCollab } = await supabase
      .from("admin_collaborators")
      .select("id")
      .eq("email", sessionPayload.sub)
      .maybeSingle();

    if (existingCollab) {
      collaboratorId = existingCollab.id;
    }
  }

  if (!collaboratorId) {
    return res.status(403).json({ error: "Modification du profil non disponible. Veuillez vous reconnecter." });
  }

  const body = req.body;
  if (!isRecord(body)) return res.status(400).json({ error: "Invalid body" });

  const update: Record<string, unknown> = {};

  // Allow updating firstName, lastName, function
  const firstName = asString(body.firstName);
  if (firstName !== undefined && firstName !== "") update.first_name = firstName;

  const lastName = asString(body.lastName);
  if (lastName !== undefined) update.last_name = lastName;

  const fn = asString(body.function);
  if (fn !== undefined) update.function = fn || null;

  // Allow updating email, displayName, and avatarUrl for self-service
  const email = asString(body.email)?.toLowerCase();
  if (email !== undefined && email !== "") {
    if (!email.includes("@")) {
      return res.status(400).json({ error: "Email invalide" });
    }
    // Check if email is already used by another collaborator
    const { data: existing } = await supabase
      .from("admin_collaborators")
      .select("id")
      .eq("email", email)
      .neq("id", collaboratorId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: "Cet email est déjà utilisé par un autre collaborateur" });
    }
    update.email = email;
  }

  const displayName = asString(body.displayName);
  if (displayName !== undefined) update.display_name = displayName || null;

  const avatarUrl = asString(body.avatarUrl);
  if (avatarUrl !== undefined) update.avatar_url = avatarUrl || null;

  // Password change
  const currentPassword = asString(body.currentPassword);
  const newPassword = asString(body.newPassword);
  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: "Le mot de passe actuel est requis" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caractères" });
    }

    // Verify current password
    const { data: currentCollab } = await supabase
      .from("admin_collaborators")
      .select("password_hash")
      .eq("id", collaboratorId)
      .single();

    if (!currentCollab || currentCollab.password_hash === "legacy_auth_no_password") {
      return res.status(400).json({ error: "Impossible de modifier le mot de passe pour ce compte" });
    }

    const isValid = await verifyPassword(currentPassword, currentCollab.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: "Le mot de passe actuel est incorrect" });
    }

    update.password_hash = await hashPassword(newPassword);
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: "Aucune modification fournie" });
  }

  const { data, error } = await supabase
    .from("admin_collaborators")
    .update(update)
    .eq("id", collaboratorId)
    .select("id, email, first_name, last_name, display_name, function, joined_at, avatar_url, role_id, status, created_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") return res.status(404).json({ error: "Profil non trouvé" });
    return res.status(500).json({ error: error.message });
  }

  const row = data as any;
  res.json({
    ok: true,
    profile: {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      function: row.function,
      joinedAt: row.joined_at,
      avatarUrl: row.avatar_url,
      roleId: row.role_id,
      status: row.status,
      createdAt: row.created_at,
    },
  });
};

// =============================================================================
// COLLABORATOR LOGIN (separate from main admin login)
// =============================================================================

export const collaboratorLogin: RequestHandler = async (req, res) => {
  const body = req.body;
  if (!isRecord(body)) return res.status(400).json({ error: "Invalid body" });

  const email = asString(body.email)?.toLowerCase();
  const password = asString(body.password);

  if (!email) return res.status(400).json({ error: "L'email est requis" });
  if (!password) return res.status(400).json({ error: "Le mot de passe est requis" });

  const supabase = getAdminSupabase();

  const { data: collaborator, error } = await supabase
    .from("admin_collaborators")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!collaborator) return res.status(401).json({ error: "Identifiants invalides" });

  const row = collaborator as CollaboratorRow;

  if (row.status === "suspended") {
    return res.status(403).json({ error: "Votre compte a été suspendu. Contactez un administrateur." });
  }

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return res.status(401).json({ error: "Identifiants invalides" });

  // Update last login
  await supabase
    .from("admin_collaborators")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", row.id);

  // Get role
  const { data: roleData } = await supabase
    .from("admin_roles")
    .select("*")
    .eq("id", row.role_id)
    .maybeSingle();

  const role = roleData as RoleRow | null;

  // Note: In a real implementation, you would create a proper session token here
  // For now, this returns the collaborator info for client-side storage
  res.json({
    ok: true,
    collaborator: {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      function: row.function,
      avatarUrl: row.avatar_url,
      roleId: row.role_id,
      status: row.status,
    },
    role: role
      ? {
          id: role.id,
          name: role.name,
          permissions: role.permissions,
        }
      : null,
  });
};
