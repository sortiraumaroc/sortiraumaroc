import type { RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { emitAdminNotification } from "../adminNotifications";

/**
 * Submit a claim request for an establishment
 * POST /api/public/claim-request
 */
export const submitClaimRequest: RequestHandler = async (req, res) => {
  try {
    const {
      establishmentId,
      establishmentName,
      firstName,
      lastName,
      phone,
      email,
      preferredDay,
      preferredTime,
    } = req.body;

    // Validate required fields
    if (!establishmentId || !firstName || !lastName || !phone || !email || !preferredDay || !preferredTime) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
    }

    // Validate email format
    if (!email.includes("@")) {
      return res.status(400).json({ error: "Email invalide" });
    }

    // Validate phone format (at least 10 digits)
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      return res.status(400).json({ error: "Numéro de téléphone invalide" });
    }

    const supabase = getAdminSupabase();

    // Check if establishment exists
    const { data: establishment } = await supabase
      .from("establishments")
      .select("id, name")
      .eq("id", establishmentId)
      .single();

    if (!establishment) {
      return res.status(404).json({ error: "Établissement non trouvé" });
    }

    // Check for existing pending claim request from same email
    const { data: existingClaim } = await supabase
      .from("claim_requests")
      .select("id")
      .eq("establishment_id", establishmentId)
      .eq("email", email.toLowerCase())
      .eq("status", "pending")
      .single();

    if (existingClaim) {
      return res.status(400).json({
        error: "Une demande est déjà en cours pour cet établissement avec cette adresse email",
      });
    }

    // Insert claim request
    const { data: claimRequest, error: insertError } = await supabase
      .from("claim_requests")
      .insert({
        establishment_id: establishmentId,
        establishment_name: establishmentName || establishment.name,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        preferred_day: preferredDay,
        preferred_time: preferredTime,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("[ClaimRequest] Insert error:", insertError);
      throw insertError;
    }

    // Emit admin notification
    emitAdminNotification({
      type: "claim_request",
      title: "Nouvelle demande de revendication",
      body: `${firstName} ${lastName} souhaite revendiquer "${establishmentName}"`,
      data: {
        claimRequestId: claimRequest.id,
        establishmentId,
        establishmentName,
        contactName: `${firstName} ${lastName}`,
        email,
        phone,
      },
    });

    return res.json({
      ok: true,
      message: "Demande envoyée avec succès",
      claimRequestId: claimRequest.id,
    });
  } catch (error) {
    console.error("[ClaimRequest] Error:", error);
    return res.status(500).json({ error: "Erreur lors de l'envoi de la demande" });
  }
};
