/**
 * Admin Conciergerie Partners — CRUD partenariats conciergerie ↔ établissement.
 *
 * Chaque partenariat a sa propre commission et split admin/conciergerie.
 * Auth via requireAdminKey (session admin).
 */

import type { RequestHandler } from "express";
import {
  requireAdminKey,
  getAdminSupabase,
} from "./adminHelpers";
import { PARTNER_STATUSES } from "../../shared/conciergerieTypes";

// =============================================================================
// GET /api/admin/conciergeries/:id/partners — List partners
// =============================================================================

export const listAdminConciergeriePartners: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const conciergeId = req.params.id;

    const { data: partners, error } = await supabase
      .from("concierge_partners")
      .select("*")
      .eq("concierge_id", conciergeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Fetch establishment names
    const estIds = (partners ?? [])
      .map((p: any) => p.establishment_id)
      .filter(Boolean);
    let estMap: Record<string, { name: string; city: string | null }> = {};

    if (estIds.length > 0) {
      const { data: establishments } = await supabase
        .from("establishments")
        .select("id,name,city")
        .in("id", estIds);

      for (const e of establishments ?? []) {
        estMap[(e as any).id] = {
          name: (e as any).name,
          city: (e as any).city,
        };
      }
    }

    const enriched = (partners ?? []).map((p: any) => ({
      ...p,
      establishment_name: estMap[p.establishment_id]?.name ?? null,
      establishment_city: estMap[p.establishment_id]?.city ?? null,
    }));

    res.json({ ok: true, partners: enriched });
  } catch (err: any) {
    console.error("[admin] listAdminConciergeriePartners error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// POST /api/admin/conciergeries/:id/partners — Add partner
// =============================================================================

export const createAdminConciergeriePartner: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const conciergeId = req.params.id;
    const { establishment_id, commission_rate, admin_share, concierge_share, notes } =
      req.body ?? {};

    if (!establishment_id) {
      return res.status(400).json({ error: "Veuillez sélectionner un établissement" });
    }

    // Validate split
    const adminPct = Number(admin_share ?? 30);
    const conciergePct = Number(concierge_share ?? 70);
    if (Math.abs(adminPct + conciergePct - 100) > 0.01) {
      return res.status(400).json({
        error: "La somme des parts admin et conciergerie doit être égale à 100%",
      });
    }

    // Check concierge exists
    const { data: concierge } = await supabase
      .from("concierges")
      .select("id")
      .eq("id", conciergeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!concierge) {
      return res.status(404).json({ error: "Conciergerie introuvable" });
    }

    // Check establishment exists
    const { data: est } = await supabase
      .from("establishments")
      .select("id,name,city")
      .eq("id", establishment_id)
      .maybeSingle();

    if (!est) {
      return res.status(404).json({ error: "Établissement introuvable" });
    }

    // Insert (unique constraint will catch duplicates)
    const { data, error } = await supabase
      .from("concierge_partners")
      .insert({
        concierge_id: conciergeId,
        establishment_id,
        commission_rate: typeof commission_rate === "number" ? commission_rate : 10,
        admin_share: adminPct,
        concierge_share: conciergePct,
        status: "active",
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res
          .status(400)
          .json({ error: "Cet établissement est déjà partenaire de cette conciergerie" });
      }
      return res.status(500).json({ error: error.message });
    }

    res.json({
      ok: true,
      partner: {
        ...data,
        establishment_name: (est as any).name,
        establishment_city: (est as any).city,
      },
    });
  } catch (err: any) {
    console.error("[admin] createAdminConciergeriePartner error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// PUT /api/admin/conciergeries/:id/partners/:partnerId — Update partner
// =============================================================================

export const updateAdminConciergeriePartner: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const partnerId = req.params.partnerId;
    const { commission_rate, admin_share, concierge_share, status, notes } =
      req.body ?? {};

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (commission_rate !== undefined) {
      updates.commission_rate = Number(commission_rate);
    }
    if (admin_share !== undefined || concierge_share !== undefined) {
      const adminPct = Number(admin_share ?? 30);
      const conciergePct = Number(concierge_share ?? 70);
      if (Math.abs(adminPct + conciergePct - 100) > 0.01) {
        return res.status(400).json({
          error: "La somme des parts admin et conciergerie doit être égale à 100%",
        });
      }
      updates.admin_share = adminPct;
      updates.concierge_share = conciergePct;
    }
    if (status !== undefined) {
      if (!PARTNER_STATUSES.includes(status as any)) {
        return res.status(400).json({ error: "Statut invalide" });
      }
      updates.status = status;
    }
    if (notes !== undefined) {
      updates.notes = notes || null;
    }

    const { data, error } = await supabase
      .from("concierge_partners")
      .update(updates)
      .eq("id", partnerId)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true, partner: data });
  } catch (err: any) {
    console.error("[admin] updateAdminConciergeriePartner error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// DELETE /api/admin/conciergeries/:id/partners/:partnerId — Soft-delete
// =============================================================================

export const deleteAdminConciergeriePartner: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const partnerId = req.params.partnerId;

    if (!partnerId) {
      return res.status(400).json({ error: "partnerId requis" });
    }

    const { error } = await supabase
      .from("concierge_partners")
      .update({ deleted_at: new Date().toISOString(), status: "suspended" })
      .eq("id", partnerId)
      .is("deleted_at", null);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[admin] deleteAdminConciergeriePartner error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};
