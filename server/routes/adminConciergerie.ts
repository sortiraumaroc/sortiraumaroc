/**
 * Admin Conciergerie Routes — CRUD conciergeries + gestion utilisateurs.
 *
 * Migré depuis menu_sam/server/routes/superadmin.ts (section Conciergerie).
 * Auth via requireAdminKey (session admin), pas Bearer token superadmin.
 */

import type { RequestHandler } from "express";
import {
  requireAdminKey,
  getAdminSupabase,
} from "./adminHelpers";
import {
  CONCIERGE_STATUSES,
  CONCIERGE_TYPES,
  CONCIERGE_USER_ROLES,
} from "../../shared/conciergerieTypes";

// Helper: map establishment universe → concierge type
function universeToConciergeType(universe: string | null): string {
  if (!universe) return "other";
  const u = universe.toLowerCase();
  if (u === "hebergement") return "hotel";
  return "other";
}

// =============================================================================
// GET /api/admin/conciergeries — List all conciergeries
// =============================================================================

export const listAdminConciergeries: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();

    const { data: concierges, error } = await supabase
      .from("concierges")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const ids = (concierges ?? []).map((c: any) => c.id);
    let userCounts: Record<string, number> = {};
    let journeyCounts: Record<string, number> = {};

    if (ids.length > 0) {
      const { data: users } = await supabase
        .from("concierge_users")
        .select("concierge_id")
        .in("concierge_id", ids)
        .is("deleted_at", null);

      for (const u of users ?? []) {
        const cid = (u as any).concierge_id;
        userCounts[cid] = (userCounts[cid] ?? 0) + 1;
      }

      const { data: journeys } = await supabase
        .from("experience_journeys")
        .select("concierge_id")
        .in("concierge_id", ids)
        .is("deleted_at", null);

      for (const j of journeys ?? []) {
        const cid = (j as any).concierge_id;
        journeyCounts[cid] = (journeyCounts[cid] ?? 0) + 1;
      }
    }

    // Fetch establishment names
    const estIds = (concierges ?? [])
      .map((c: any) => c.establishment_id)
      .filter(Boolean);
    let estMap: Record<string, string> = {};
    if (estIds.length > 0) {
      const { data: establishments } = await supabase
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
    console.error("[admin] listAdminConciergeries error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// GET /api/admin/conciergeries/:id — Get one conciergerie + users
// =============================================================================

export const getAdminConciergerie: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const id = req.params.id;

    const { data: concierge, error } = await supabase
      .from("concierges")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!concierge) return res.status(404).json({ error: "Conciergerie introuvable" });

    const [{ data: users }, { data: citiesRows }] = await Promise.all([
      supabase
        .from("concierge_users")
        .select("*")
        .eq("concierge_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("concierge_allowed_cities")
        .select("city")
        .eq("concierge_id", id)
        .order("city", { ascending: true }),
    ]);

    const allowed_cities = (citiesRows ?? []).map((r: any) => r.city as string);

    res.json({ ok: true, concierge, users: users ?? [], allowed_cities });
  } catch (err: any) {
    console.error("[admin] getAdminConciergerie error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// POST /api/admin/conciergeries — Create from establishment
// =============================================================================

export const createAdminConciergerie: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const { establishment_id, commission_rate } = req.body ?? {};

    if (!establishment_id) {
      return res.status(400).json({ error: "Veuillez sélectionner un établissement" });
    }

    // Check not already linked
    const { data: existing } = await supabase
      .from("concierges")
      .select("id")
      .eq("establishment_id", establishment_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: "Cet établissement a déjà une conciergerie" });
    }

    // Fetch establishment data
    const { data: est, error: estError } = await supabase
      .from("establishments")
      .select("id,name,city,address,phone,email,universe,cover_url")
      .eq("id", establishment_id)
      .maybeSingle();

    if (estError || !est) {
      return res.status(404).json({ error: "Établissement introuvable" });
    }

    // Create concierge
    const { data, error } = await supabase
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
    const { data: memberships } = await supabase
      .from("pro_establishment_memberships")
      .select("user_id,role")
      .eq("establishment_id", establishment_id);

    const linkedUsers: any[] = [];
    for (const m of memberships ?? []) {
      const { data: profile } = await supabase
        .from("pro_profiles")
        .select("email")
        .eq("user_id", (m as any).user_id)
        .maybeSingle();

      const { error: cuError } = await supabase
        .from("concierge_users")
        .insert({
          concierge_id: data.id,
          user_id: (m as any).user_id,
          role: (m as any).role === "owner" ? "admin" : "operator",
          email: (profile as any)?.email ?? null,
          status: "active",
        });

      if (!cuError) {
        linkedUsers.push({
          user_id: (m as any).user_id,
          email: (profile as any)?.email,
        });
      }
    }

    res.json({ ok: true, concierge: data, linked_users: linkedUsers });
  } catch (err: any) {
    console.error("[admin] createAdminConciergerie error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// PUT /api/admin/conciergeries/:id — Update conciergerie
// =============================================================================

export const updateAdminConciergerie: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const id = req.params.id;
    const { name, type, city, address, phone, email, commission_rate, status } =
      req.body ?? {};

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updates.name = String(name).trim();
    if (type !== undefined) {
      if (!CONCIERGE_TYPES.includes(type as any))
        return res.status(400).json({ error: "Type invalide" });
      updates.type = type;
    }
    if (city !== undefined) updates.city = city || null;
    if (address !== undefined) updates.address = address || null;
    if (phone !== undefined) updates.phone = phone || null;
    if (email !== undefined) updates.email = email || null;
    if (commission_rate !== undefined)
      updates.commission_rate = Number(commission_rate);
    if (status !== undefined) {
      if (!CONCIERGE_STATUSES.includes(status as any))
        return res.status(400).json({ error: "Status invalide" });
      updates.status = status;
    }

    const { data, error } = await supabase
      .from("concierges")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true, concierge: data });
  } catch (err: any) {
    console.error("[admin] updateAdminConciergerie error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// PUT /api/admin/conciergeries/:id/cities — Replace allowed cities
// =============================================================================

export const updateAdminConciergerieCities: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const id = req.params.id;
    const { cities } = req.body ?? {};

    if (!Array.isArray(cities)) {
      return res.status(400).json({ error: "cities doit être un tableau" });
    }

    // Verify concierge exists
    const { data: concierge } = await supabase
      .from("concierges")
      .select("id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!concierge) return res.status(404).json({ error: "Conciergerie introuvable" });

    // Delete all existing allowed cities
    await supabase
      .from("concierge_allowed_cities")
      .delete()
      .eq("concierge_id", id);

    // Insert new ones (deduplicated, trimmed)
    const cleanCities = [...new Set(
      cities.map((c: string) => String(c).trim()).filter(Boolean),
    )];

    if (cleanCities.length > 0) {
      const { error } = await supabase
        .from("concierge_allowed_cities")
        .insert(cleanCities.map((city: string) => ({
          concierge_id: id,
          city,
        })));

      if (error) return res.status(500).json({ error: error.message });
    }

    res.json({ ok: true, allowed_cities: cleanCities });
  } catch (err: any) {
    console.error("[admin] updateAdminConciergerieCities error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// POST /api/admin/conciergeries/:id/users — Add user
// =============================================================================

export const addAdminConciergerieUser: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const conciergeId = req.params.id;
    const { email, password, first_name, last_name, role } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }
    if (role && !CONCIERGE_USER_ROLES.includes(role as any)) {
      return res
        .status(400)
        .json({ error: "Rôle invalide (admin ou operator)" });
    }

    // Verify concierge exists
    const { data: concierge } = await supabase
      .from("concierges")
      .select("id")
      .eq("id", conciergeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!concierge)
      return res.status(404).json({ error: "Conciergerie introuvable" });

    // Create auth user (service-role via getAdminSupabase)
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
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
    const { data: cuData, error: cuError } = await supabase
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
      // Rollback: delete auth user if insert fails
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
      return res.status(500).json({ error: cuError.message });
    }

    res.json({ ok: true, user: cuData });
  } catch (err: any) {
    console.error("[admin] addAdminConciergerieUser error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// DELETE /api/admin/conciergeries/:id — Soft-delete conciergerie
// =============================================================================

export const deleteAdminConciergerie: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const id = req.params.id;

    // Soft-delete the conciergerie
    const { error } = await supabase
      .from("concierges")
      .update({ deleted_at: new Date().toISOString(), status: "suspended" })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) return res.status(500).json({ error: error.message });

    // Also soft-delete all associated users
    await supabase
      .from("concierge_users")
      .update({ deleted_at: new Date().toISOString(), status: "suspended" })
      .eq("concierge_id", id)
      .is("deleted_at", null);

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[admin] deleteAdminConciergerie error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// DELETE /api/admin/conciergeries/:id/users/:userId — Remove user (soft-delete)
// =============================================================================

export const removeAdminConciergerieUser: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ error: "userId requis" });
    }

    const { error } = await supabase
      .from("concierge_users")
      .update({ deleted_at: new Date().toISOString(), status: "suspended" })
      .eq("id", userId)
      .is("deleted_at", null);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[admin] removeAdminConciergerieUser error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};
