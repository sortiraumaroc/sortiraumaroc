import { Router, type Request, type Response, type NextFunction } from "express";

import { getServerSupabaseClient, hasServerSupabaseServiceRole } from "../lib/supabase";

export const superadminRouter = Router();

// ============================================================================
// Auth middleware — check SUPERADMIN role from Bearer token
// ============================================================================

async function requireSuperadmin(req: Request, res: Response, next: NextFunction) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) { res.status(401).json({ error: "Missing token" }); return; }

  try {
    const sb = getServerSupabaseClient();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) { res.status(401).json({ error: "Invalid token" }); return; }

    const role = (data.user.user_metadata as any)?.role;
    if (role !== "SUPERADMIN") { res.status(403).json({ error: "Forbidden" }); return; }

    (req as any)._superadminUserId = data.user.id;
    next();
  } catch {
    res.status(500).json({ error: "Auth error" });
  }
}

type BootstrapResponse = { ok: boolean };

type PostgrestErrorLike = { message?: string } | null;

type AuthErrorLike = { message?: string; status?: number } | null;

function isAlreadyRegistered(error: AuthErrorLike | PostgrestErrorLike) {
  const msg = (error as any)?.message ?? "";
  return typeof msg === "string" && msg.toLowerCase().includes("already") && msg.toLowerCase().includes("registered");
}

superadminRouter.post("/bootstrap", async (_req, res) => {
  const email = process.env.SUPERADMIN_BOOTSTRAP_EMAIL ?? "";
  const password = process.env.SUPERADMIN_BOOTSTRAP_PASSWORD ?? "";

  // If not configured, don't block the UI.
  if (!email || !password) {
    const payload: BootstrapResponse = { ok: false };
    res.status(200).json(payload);
    return;
  }

  const supabase = getServerSupabaseClient();

  if (hasServerSupabaseServiceRole()) {
    const admin = supabase.auth.admin;
    const normalizedEmail = email.trim().toLowerCase();

    const userMeta = {
      role: "SUPERADMIN",
      must_change_password: true,
    };

    const listRes = await admin.listUsers({ page: 1, perPage: 200 });
    const users = ((listRes as any)?.data?.users ?? []) as any[];
    const existing = users.find((u) => (u?.email ?? "").toLowerCase() === normalizedEmail) ?? null;

    if (existing) {
      await admin.updateUserById(existing.id, {
        password,
        user_metadata: { ...(existing.user_metadata as any), ...userMeta },
        email_confirm: true,
      });

      const payload: BootstrapResponse = { ok: true };
      res.status(200).json(payload);
      return;
    }

    const createRes = await admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: userMeta,
    });

    if (createRes.error && !isAlreadyRegistered(createRes.error)) {
      const payload: BootstrapResponse = { ok: false };
      res.status(200).json(payload);
      return;
    }

    const payload: BootstrapResponse = { ok: true };
    res.status(200).json(payload);
    return;
  }

  // Fallback (no service role): user will require email confirmation depending on Supabase settings.
  const signUpRes = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: "SUPERADMIN",
        must_change_password: true,
      },
    },
  });

  if (signUpRes.error && !isAlreadyRegistered(signUpRes.error)) {
    const payload: BootstrapResponse = { ok: false };
    res.status(200).json(payload);
    return;
  }

  const payload: BootstrapResponse = { ok: true };
  res.status(200).json(payload);
});

// ============================================================================
// Conciergerie CRUD
// ============================================================================

const CONCIERGE_STATUSES = ["pending", "active", "suspended"] as const;
const USER_ROLES = ["admin", "operator"] as const;

// Map universe → concierge type
function universeToConciergeType(universe: string | null): string {
  if (!universe) return "other";
  const u = universe.toLowerCase();
  if (u === "hebergement") return "hotel";
  return "other";
}

// --- Search establishments (for the selector when creating a conciergerie) ---
superadminRouter.get("/establishments/search", requireSuperadmin, async (req: Request, res: Response) => {
  try {
    const sb = getServerSupabaseClient();
    const q = String(req.query.q ?? "").trim();

    let query = sb
      .from("establishments")
      .select("id,name,city,universe,subcategory,email,phone,address,slug,cover_url,status")
      .eq("status", "active")
      .order("name", { ascending: true })
      .limit(20);

    if (q.length >= 2) {
      query = query.ilike("name", `%${q}%`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true, establishments: data ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Server error" });
  }
});

// --- Get pro users for an establishment (to auto-link as concierge user) ---
superadminRouter.get("/establishments/:id/pro-users", requireSuperadmin, async (req: Request, res: Response) => {
  try {
    const sb = getServerSupabaseClient();
    const estId = req.params.id;

    const { data: memberships, error } = await sb
      .from("pro_establishment_memberships")
      .select("user_id,role")
      .eq("establishment_id", estId);

    if (error) return res.status(500).json({ error: error.message });

    if (!memberships || memberships.length === 0) {
      return res.json({ ok: true, users: [] });
    }

    // Fetch pro_profiles for those user_ids
    const userIds = memberships.map((m: any) => m.user_id);
    const { data: profiles } = await sb
      .from("pro_profiles")
      .select("user_id,email,phone,company_name")
      .in("user_id", userIds);

    const profileMap = new Map<string, any>();
    for (const p of profiles ?? []) {
      profileMap.set(p.user_id, p);
    }

    const users = memberships.map((m: any) => {
      const profile = profileMap.get(m.user_id);
      return {
        user_id: m.user_id,
        role: m.role,
        email: profile?.email ?? null,
        company_name: profile?.company_name ?? null,
      };
    });

    res.json({ ok: true, users });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Server error" });
  }
});

// --- List all conciergeries ---
superadminRouter.get("/conciergeries", requireSuperadmin, async (_req: Request, res: Response) => {
  try {
    const sb = getServerSupabaseClient();

    const { data: concierges, error } = await sb
      .from("concierges")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Fetch user counts per concierge
    const ids = (concierges ?? []).map((c: any) => c.id);
    let userCounts: Record<string, number> = {};
    let journeyCounts: Record<string, number> = {};

    if (ids.length > 0) {
      const { data: users } = await sb
        .from("concierge_users")
        .select("concierge_id")
        .in("concierge_id", ids)
        .is("deleted_at", null);

      for (const u of users ?? []) {
        const cid = (u as any).concierge_id;
        userCounts[cid] = (userCounts[cid] ?? 0) + 1;
      }

      const { data: journeys } = await sb
        .from("experience_journeys")
        .select("concierge_id")
        .in("concierge_id", ids)
        .is("deleted_at", null);

      for (const j of journeys ?? []) {
        const cid = (j as any).concierge_id;
        journeyCounts[cid] = (journeyCounts[cid] ?? 0) + 1;
      }
    }

    // Fetch establishment names for concierges that have establishment_id
    const estIds = (concierges ?? []).map((c: any) => c.establishment_id).filter(Boolean);
    let estMap: Record<string, string> = {};
    if (estIds.length > 0) {
      const { data: establishments } = await sb
        .from("establishments")
        .select("id,name")
        .in("id", estIds);
      for (const e of establishments ?? []) {
        estMap[(e as any).id] = (e as any).name;
      }
    }

    const enriched = (concierges ?? []).map((c: any) => ({
      ...c,
      establishment_name: estMap[c.establishment_id] ?? null,
      user_count: userCounts[c.id] ?? 0,
      journey_count: journeyCounts[c.id] ?? 0,
    }));

    res.json({ ok: true, concierges: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Server error" });
  }
});

// --- Get one conciergerie + users ---
superadminRouter.get("/conciergeries/:id", requireSuperadmin, async (req: Request, res: Response) => {
  try {
    const sb = getServerSupabaseClient();
    const id = req.params.id;

    const { data: concierge, error } = await sb
      .from("concierges")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!concierge) return res.status(404).json({ error: "Conciergerie introuvable" });

    const { data: users } = await sb
      .from("concierge_users")
      .select("*")
      .eq("concierge_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    res.json({ ok: true, concierge, users: users ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Server error" });
  }
});

// --- Create conciergerie from an establishment ---
superadminRouter.post("/conciergeries", requireSuperadmin, async (req: Request, res: Response) => {
  try {
    const sb = getServerSupabaseClient();
    const { establishment_id, commission_rate } = req.body ?? {};

    if (!establishment_id) {
      return res.status(400).json({ error: "Veuillez selectionner un etablissement" });
    }

    // Check not already linked
    const { data: existing } = await sb
      .from("concierges")
      .select("id")
      .eq("establishment_id", establishment_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: "Cet etablissement a deja une conciergerie" });
    }

    // Fetch establishment data to auto-fill
    const { data: est, error: estError } = await sb
      .from("establishments")
      .select("id,name,city,address,phone,email,universe,cover_url")
      .eq("id", establishment_id)
      .maybeSingle();

    if (estError || !est) {
      return res.status(404).json({ error: "Etablissement introuvable" });
    }

    // Create concierge with establishment data
    const { data, error } = await sb
      .from("concierges")
      .insert({
        establishment_id: est.id,
        name: est.name,
        type: universeToConciergeType(est.universe),
        city: est.city || null,
        address: est.address || null,
        phone: est.phone || null,
        email: est.email || null,
        logo_url: est.cover_url || null,
        commission_rate: typeof commission_rate === "number" ? commission_rate : 10,
        status: "active",
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Auto-link pro users as concierge users
    const { data: memberships } = await sb
      .from("pro_establishment_memberships")
      .select("user_id,role")
      .eq("establishment_id", establishment_id);

    const linkedUsers: any[] = [];
    for (const m of memberships ?? []) {
      // Fetch email from pro_profiles or auth
      const { data: profile } = await sb
        .from("pro_profiles")
        .select("email")
        .eq("user_id", (m as any).user_id)
        .maybeSingle();

      const { error: cuError } = await sb
        .from("concierge_users")
        .insert({
          concierge_id: data.id,
          user_id: (m as any).user_id,
          role: (m as any).role === "owner" ? "admin" : "operator",
          email: (profile as any)?.email ?? null,
          status: "active",
        });

      if (!cuError) {
        linkedUsers.push({ user_id: (m as any).user_id, email: (profile as any)?.email });
      }
    }

    res.json({ ok: true, concierge: data, linked_users: linkedUsers });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Server error" });
  }
});

// --- Update conciergerie ---
superadminRouter.put("/conciergeries/:id", requireSuperadmin, async (req: Request, res: Response) => {
  try {
    const sb = getServerSupabaseClient();
    const id = req.params.id;
    const { name, type, city, address, phone, email, commission_rate, status } = req.body ?? {};

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = String(name).trim();
    if (type !== undefined) {
      if (!CONCIERGE_TYPES.includes(type)) return res.status(400).json({ error: "Type invalide" });
      updates.type = type;
    }
    if (city !== undefined) updates.city = city || null;
    if (address !== undefined) updates.address = address || null;
    if (phone !== undefined) updates.phone = phone || null;
    if (email !== undefined) updates.email = email || null;
    if (commission_rate !== undefined) updates.commission_rate = Number(commission_rate);
    if (status !== undefined) {
      if (!CONCIERGE_STATUSES.includes(status)) return res.status(400).json({ error: "Status invalide" });
      updates.status = status;
    }

    const { data, error } = await sb
      .from("concierges")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true, concierge: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Server error" });
  }
});

// --- Add user to conciergerie (create auth user + concierge_users row) ---
superadminRouter.post("/conciergeries/:id/users", requireSuperadmin, async (req: Request, res: Response) => {
  try {
    const sb = getServerSupabaseClient();
    const conciergeId = req.params.id;
    const { email, password, first_name, last_name, role } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }
    if (role && !USER_ROLES.includes(role)) {
      return res.status(400).json({ error: "Rôle invalide (admin ou operator)" });
    }

    // Verify concierge exists
    const { data: concierge } = await sb
      .from("concierges")
      .select("id")
      .eq("id", conciergeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!concierge) return res.status(404).json({ error: "Conciergerie introuvable" });

    // Create auth user (requires service_role)
    if (!hasServerSupabaseServiceRole()) {
      return res.status(500).json({ error: "Service role key required to create users" });
    }

    const { data: authData, error: authError } = await sb.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { role: "CONCIERGE" },
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    const userId = authData.user.id;

    // Insert concierge_users row
    const { data: cuData, error: cuError } = await sb
      .from("concierge_users")
      .insert({
        concierge_id: conciergeId,
        user_id: userId,
        role: role || "admin",
        email: email.trim().toLowerCase(),
        first_name: first_name || null,
        last_name: last_name || null,
        status: "active",
      })
      .select()
      .single();

    if (cuError) {
      // Rollback: delete auth user if concierge_users insert fails
      await sb.auth.admin.deleteUser(userId).catch(() => {});
      return res.status(500).json({ error: cuError.message });
    }

    res.json({ ok: true, user: cuData });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Server error" });
  }
});

// --- Remove user from conciergerie (soft-delete) ---
superadminRouter.delete("/conciergeries/:id/users/:userId", requireSuperadmin, async (req: Request, res: Response) => {
  try {
    const sb = getServerSupabaseClient();
    const { userId } = req.params;

    const { error } = await sb
      .from("concierge_users")
      .update({ deleted_at: new Date().toISOString(), status: "suspended" })
      .eq("id", userId)
      .is("deleted_at", null);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Server error" });
  }
});
