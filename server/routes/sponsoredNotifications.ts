/**
 * Sponsored Notifications Routes
 *
 * PRO endpoints:
 * - POST /api/pro/establishments/:id/ads/push-notifications - Créer une notification
 * - GET /api/pro/establishments/:id/ads/push-notifications - Lister les notifications
 * - PATCH /api/pro/establishments/:id/ads/push-notifications/:notifId - Modifier
 * - POST /api/pro/establishments/:id/ads/push-notifications/:notifId/submit - Soumettre
 * - DELETE /api/pro/establishments/:id/ads/push-notifications/:notifId - Supprimer
 *
 * ADMIN endpoints:
 * - GET /api/admin/ads/push-notifications/queue - File de modération
 * - POST /api/admin/ads/push-notifications/:notifId/moderate - Approuver/Rejeter
 * - POST /api/admin/ads/push-notifications/:notifId/send - Envoyer manuellement
 *
 * CONSUMER endpoints:
 * - GET /api/consumer/notifications/sponsored - Notifications sponsorisées
 * - POST /api/consumer/notifications/sponsored/:id/read - Marquer comme lu
 * - POST /api/consumer/notifications/sponsored/:id/click - Enregistrer un clic
 */

import type { RequestHandler, Router } from "express";
import { randomUUID } from "node:crypto";
import { getAdminSupabase } from "../supabaseAdmin";
import { sendPushToConsumerUser } from "../pushNotifications";

// =============================================================================
// AUTH HELPERS
// =============================================================================

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

type UserResult =
  | { ok: true; user: { id: string; email?: string | null } }
  | { ok: false; status: number; error: string };

async function getUserFromBearerToken(token: string): Promise<UserResult> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }
  return { ok: true, user: { id: data.user.id, email: data.user.email } };
}

type ConsumerUserResult =
  | { ok: true; user: { id: string; email?: string | null } }
  | { ok: false; status: number; error: string };

async function getConsumerUser(req: Parameters<RequestHandler>[0]): Promise<ConsumerUserResult> {
  const header = req.header("authorization");
  const token = parseBearerToken(header ?? undefined);
  if (!token) return { ok: false, status: 401, error: "Missing bearer token" };

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }
  return { ok: true, user: { id: data.user.id, email: data.user.email } };
}

// =============================================================================
// HELPERS
// =============================================================================

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Types de notifications avec leurs icônes
const NOTIFICATION_TYPES = {
  promo: { label: "Promo", emoji: "🏷️" },
  nouveau: { label: "Nouveau", emoji: "✨" },
  flash: { label: "Flash", emoji: "⚡" },
  evenement: { label: "Événement", emoji: "🎉" },
  rappel: { label: "Rappel", emoji: "⏰" },
};

// =============================================================================
// PRO ENDPOINTS
// =============================================================================

/**
 * POST /api/pro/establishments/:id/ads/push-notifications
 * Créer une nouvelle notification sponsorisée
 */
export const createSponsoredNotification: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;
  const proUser = userResult.user;

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Corps de requête invalide" });
  }

  // Extraire et valider les données
  const title = asString(req.body.title);
  const description = asString(req.body.description);
  const linkUrl = asString(req.body.link_url);
  const imageUrl = asString(req.body.image_url);
  const notificationType = asString(req.body.notification_type) || "promo";
  const targeting = isRecord(req.body.targeting) ? req.body.targeting : {};
  const scheduledAt = asString(req.body.scheduled_at);

  // Validations
  if (!title || title.length > 50) {
    return res.status(400).json({ error: "Le titre est requis (max 50 caractères)" });
  }
  if (!description || description.length > 150) {
    return res.status(400).json({ error: "La description est requise (max 150 caractères)" });
  }
  if (!Object.keys(NOTIFICATION_TYPES).includes(notificationType)) {
    return res.status(400).json({ error: "Type de notification invalide" });
  }

  try {
    // Vérifier l'accès
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", proUser.id)
      .maybeSingle();

    if (!membership || !["owner", "marketing"].includes(membership.role)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Créer la notification
    const notificationId = randomUUID();
    const { error } = await supabase.from("sponsored_notifications").insert({
      id: notificationId,
      establishment_id: establishmentId,
      title,
      description,
      link_url: linkUrl ?? null,
      image_url: imageUrl ?? null,
      notification_type: notificationType,
      targeting,
      scheduled_at: scheduledAt ?? null,
      status: "draft",
      created_by: proUser.id,
    });

    if (error) {
      console.error("[sponsoredNotif] Error creating notification:", error);
      return res.status(500).json({ error: "Erreur création notification" });
    }

    return res.json({
      ok: true,
      notification_id: notificationId,
      status: "draft",
    });
  } catch (error) {
    console.error("[sponsoredNotif] createSponsoredNotification error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * GET /api/pro/establishments/:id/ads/push-notifications
 * Lister les notifications sponsorisées d'un établissement
 */
export const listSponsoredNotifications: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;

  try {
    const { data: notifications, error } = await supabase
      .from("sponsored_notifications")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[sponsoredNotif] Error listing notifications:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    return res.json({
      ok: true,
      notifications: notifications ?? [],
    });
  } catch (error) {
    console.error("[sponsoredNotif] listSponsoredNotifications error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * PATCH /api/pro/establishments/:id/ads/push-notifications/:notifId
 * Modifier une notification (si en brouillon)
 */
export const updateSponsoredNotification: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const { id: establishmentId, notifId } = req.params;

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Corps de requête invalide" });
  }

  try {
    // Vérifier que la notification existe et est en brouillon
    const { data: existing } = await supabase
      .from("sponsored_notifications")
      .select("id, status, establishment_id")
      .eq("id", notifId)
      .maybeSingle();

    if (!existing || (existing as any).establishment_id !== establishmentId) {
      return res.status(404).json({ error: "Notification introuvable" });
    }

    if (!["draft", "rejected"].includes((existing as any).status)) {
      return res.status(400).json({ error: "Seules les notifications en brouillon peuvent être modifiées" });
    }

    // Construire les updates
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    const title = asString(req.body.title);
    if (title) {
      if (title.length > 50) return res.status(400).json({ error: "Titre trop long (max 50)" });
      updates.title = title;
    }

    const description = asString(req.body.description);
    if (description) {
      if (description.length > 150) return res.status(400).json({ error: "Description trop longue (max 150)" });
      updates.description = description;
    }

    if (req.body.link_url !== undefined) updates.link_url = asString(req.body.link_url) ?? null;
    if (req.body.image_url !== undefined) updates.image_url = asString(req.body.image_url) ?? null;
    if (req.body.notification_type !== undefined) {
      const type = asString(req.body.notification_type);
      if (type && Object.keys(NOTIFICATION_TYPES).includes(type)) {
        updates.notification_type = type;
      }
    }
    if (isRecord(req.body.targeting)) updates.targeting = req.body.targeting;
    if (req.body.scheduled_at !== undefined) updates.scheduled_at = asString(req.body.scheduled_at) ?? null;

    // Reset status to draft if was rejected
    if ((existing as any).status === "rejected") {
      updates.status = "draft";
      updates.rejection_reason = null;
    }

    const { error } = await supabase
      .from("sponsored_notifications")
      .update(updates)
      .eq("id", notifId);

    if (error) {
      console.error("[sponsoredNotif] Error updating notification:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    return res.json({ ok: true, notification_id: notifId });
  } catch (error) {
    console.error("[sponsoredNotif] updateSponsoredNotification error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * POST /api/pro/establishments/:id/ads/push-notifications/:notifId/submit
 * Soumettre une notification pour modération
 */
export const submitSponsoredNotification: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const { id: establishmentId, notifId } = req.params;

  try {
    // Vérifier que la notification existe et est en brouillon
    const { data: existing } = await supabase
      .from("sponsored_notifications")
      .select("id, status, establishment_id")
      .eq("id", notifId)
      .maybeSingle();

    if (!existing || (existing as any).establishment_id !== establishmentId) {
      return res.status(404).json({ error: "Notification introuvable" });
    }

    if (!["draft", "rejected"].includes((existing as any).status)) {
      return res.status(400).json({ error: "Cette notification ne peut pas être soumise" });
    }

    const { error } = await supabase
      .from("sponsored_notifications")
      .update({
        status: "pending_review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", notifId);

    if (error) {
      console.error("[sponsoredNotif] Error submitting notification:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    return res.json({ ok: true, status: "pending_review" });
  } catch (error) {
    console.error("[sponsoredNotif] submitSponsoredNotification error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * DELETE /api/pro/establishments/:id/ads/push-notifications/:notifId
 * Supprimer une notification
 */
export const deleteSponsoredNotification: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const { id: establishmentId, notifId } = req.params;

  try {
    const { data: existing } = await supabase
      .from("sponsored_notifications")
      .select("id, status, establishment_id")
      .eq("id", notifId)
      .maybeSingle();

    if (!existing || (existing as any).establishment_id !== establishmentId) {
      return res.status(404).json({ error: "Notification introuvable" });
    }

    if (!["draft", "rejected", "cancelled"].includes((existing as any).status)) {
      return res.status(400).json({ error: "Impossible de supprimer cette notification" });
    }

    const { error } = await supabase.from("sponsored_notifications").delete().eq("id", notifId);

    if (error) {
      console.error("[sponsoredNotif] Error deleting notification:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("[sponsoredNotif] deleteSponsoredNotification error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

/**
 * GET /api/admin/ads/push-notifications/queue
 * File de modération des notifications
 */
export const getNotificationModerationQueue: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();

  try {
    const { data: notifications, error } = await supabase
      .from("sponsored_notifications")
      .select(`
        *,
        establishment:establishments(id, name, city)
      `)
      .eq("status", "pending_review")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[sponsoredNotif] Error fetching queue:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    return res.json({
      ok: true,
      notifications: notifications ?? [],
      count: notifications?.length ?? 0,
    });
  } catch (error) {
    console.error("[sponsoredNotif] getNotificationModerationQueue error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * POST /api/admin/ads/push-notifications/:notifId/moderate
 * Approuver ou rejeter une notification
 */
export const moderateSponsoredNotification: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();
  const { notifId } = req.params;

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Corps de requête invalide" });
  }

  const action = asString(req.body.action); // 'approve' | 'reject'
  const rejectionReason = asString(req.body.rejection_reason);

  if (!["approve", "reject"].includes(action || "")) {
    return res.status(400).json({ error: "Action invalide (approve ou reject)" });
  }

  try {
    const { data: existing } = await supabase
      .from("sponsored_notifications")
      .select("id, status")
      .eq("id", notifId)
      .maybeSingle();

    if (!existing) {
      return res.status(404).json({ error: "Notification introuvable" });
    }

    if ((existing as any).status !== "pending_review") {
      return res.status(400).json({ error: "Cette notification n'est pas en attente de modération" });
    }

    const updates: Record<string, any> = {
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (action === "approve") {
      updates.status = "approved";
    } else {
      updates.status = "rejected";
      updates.rejection_reason = rejectionReason || "Non spécifié";
    }

    const { error } = await supabase
      .from("sponsored_notifications")
      .update(updates)
      .eq("id", notifId);

    if (error) {
      console.error("[sponsoredNotif] Error moderating notification:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    return res.json({ ok: true, status: updates.status });
  } catch (error) {
    console.error("[sponsoredNotif] moderateSponsoredNotification error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * POST /api/admin/ads/push-notifications/:notifId/send
 * Envoyer une notification approuvée
 */
export const sendSponsoredNotification: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();
  const { notifId } = req.params;

  try {
    // Récupérer la notification
    const { data: notification } = await supabase
      .from("sponsored_notifications")
      .select("*")
      .eq("id", notifId)
      .maybeSingle();

    if (!notification) {
      return res.status(404).json({ error: "Notification introuvable" });
    }

    if ((notification as any).status !== "approved") {
      return res.status(400).json({ error: "La notification doit être approuvée avant envoi" });
    }

    // Marquer comme "sending"
    await supabase
      .from("sponsored_notifications")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", notifId);

    // Récupérer les utilisateurs ciblés
    const targeting = (notification as any).targeting ?? {};
    let usersQuery = supabase.from("consumer_users").select("id");

    // Appliquer le ciblage par ville si spécifié
    if (targeting.cities?.length > 0) {
      usersQuery = usersQuery.in("city", targeting.cities);
    }

    const { data: users } = await usersQuery.limit(10000);

    const userIds = (users ?? []).map((u: any) => u.id);
    let sentCount = 0;
    let deliveredCount = 0;
    const costPerUnit = (notification as any).cost_per_unit_cents ?? 50;

    // Créer les entrées pour chaque utilisateur et envoyer les push
    for (const userId of userIds) {
      // Insérer dans consumer_sponsored_notifications
      await supabase.from("consumer_sponsored_notifications").upsert({
        user_id: userId,
        notification_id: notifId,
        push_sent: false,
      }, { onConflict: "user_id,notification_id" });

      // Envoyer le push
      try {
        const result = await sendPushToConsumerUser({
          userId,
          notification: {
            title: `${NOTIFICATION_TYPES[(notification as any).notification_type]?.emoji || "📢"} ${(notification as any).title}`,
            body: (notification as any).description,
            imageUrl: (notification as any).image_url,
            data: {
              type: "sponsored_notification",
              notification_id: notifId,
              link_url: (notification as any).link_url || "",
            },
          },
        });

        if (result.ok && (result.successCount ?? 0) > 0) {
          deliveredCount++;
          await supabase
            .from("consumer_sponsored_notifications")
            .update({ push_sent: true, push_sent_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("notification_id", notifId);
        }
      } catch (e) {
        console.error(`[sponsoredNotif] Failed to send push to user ${userId}:`, e);
      }

      sentCount++;
    }

    // Mettre à jour les stats et le coût
    const totalCost = sentCount * costPerUnit;

    await supabase
      .from("sponsored_notifications")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_count: sentCount,
        delivered_count: deliveredCount,
        total_cost_cents: totalCost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", notifId);

    // Débiter le wallet de l'établissement
    const establishmentId = (notification as any).establishment_id;
    if (establishmentId && totalCost > 0) {
      await supabase.rpc("debit_ad_wallet", {
        p_establishment_id: establishmentId,
        p_amount: totalCost,
        p_transaction_type: "push_notification_charge",
        p_reference_id: notifId,
        p_description: `Push notification - ${sentCount} envois`,
      });
    }

    return res.json({
      ok: true,
      sent_count: sentCount,
      delivered_count: deliveredCount,
      total_cost_cents: totalCost,
    });
  } catch (error) {
    console.error("[sponsoredNotif] sendSponsoredNotification error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// CONSUMER ENDPOINTS
// =============================================================================

/**
 * GET /api/consumer/notifications/sponsored
 * Récupère les notifications sponsorisées pour l'utilisateur connecté
 */
export const getConsumerSponsoredNotifications: RequestHandler = async (req, res) => {
  const { user, error } = await getConsumerUser(req);
  if (error || !user) {
    return res.status(401).json({ error: error || "Non authentifié" });
  }

  const supabase = getAdminSupabase();

  try {
    const { data: notifications, error: queryError } = await supabase
      .from("consumer_sponsored_notifications")
      .select(`
        id,
        is_read,
        read_at,
        is_clicked,
        clicked_at,
        created_at,
        notification:sponsored_notifications(
          id,
          title,
          description,
          link_url,
          image_url,
          notification_type,
          establishment:establishments(id, name, cover_url)
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (queryError) {
      console.error("[sponsoredNotif] Error fetching consumer notifications:", queryError);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    // Formater les résultats
    const formatted = (notifications ?? []).map((n: any) => ({
      id: n.id,
      is_read: n.is_read,
      read_at: n.read_at,
      is_clicked: n.is_clicked,
      clicked_at: n.clicked_at,
      created_at: n.created_at,
      title: n.notification?.title,
      description: n.notification?.description,
      link_url: n.notification?.link_url,
      image_url: n.notification?.image_url,
      notification_type: n.notification?.notification_type,
      type_emoji: NOTIFICATION_TYPES[n.notification?.notification_type as keyof typeof NOTIFICATION_TYPES]?.emoji ?? "📢",
      establishment: n.notification?.establishment,
      is_sponsored: true, // Toujours true pour les notifications sponsorisées
    }));

    const unreadCount = formatted.filter((n: any) => !n.is_read).length;

    return res.json({
      ok: true,
      notifications: formatted,
      unread_count: unreadCount,
    });
  } catch (error) {
    console.error("[sponsoredNotif] getConsumerSponsoredNotifications error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * POST /api/consumer/notifications/sponsored/:id/read
 * Marquer une notification comme lue
 */
export const markSponsoredNotificationRead: RequestHandler = async (req, res) => {
  const { user, error } = await getConsumerUser(req);
  if (error || !user) {
    return res.status(401).json({ error: error || "Non authentifié" });
  }

  const supabase = getAdminSupabase();
  const notificationEntryId = req.params.id;

  try {
    const { error: updateError } = await supabase
      .from("consumer_sponsored_notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("id", notificationEntryId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[sponsoredNotif] Error marking as read:", updateError);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    // Incrémenter le compteur opened_count
    const { data: entry } = await supabase
      .from("consumer_sponsored_notifications")
      .select("notification_id")
      .eq("id", notificationEntryId)
      .maybeSingle();

    if (entry) {
      await supabase.rpc("increment_sponsored_notification_stat", {
        p_notification_id: (entry as any).notification_id,
        p_field: "opened_count",
      });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("[sponsoredNotif] markSponsoredNotificationRead error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * POST /api/consumer/notifications/sponsored/:id/click
 * Enregistrer un clic sur une notification
 */
export const clickSponsoredNotification: RequestHandler = async (req, res) => {
  const { user, error } = await getConsumerUser(req);
  if (error || !user) {
    return res.status(401).json({ error: error || "Non authentifié" });
  }

  const supabase = getAdminSupabase();
  const notificationEntryId = req.params.id;

  try {
    const { error: updateError } = await supabase
      .from("consumer_sponsored_notifications")
      .update({
        is_clicked: true,
        clicked_at: new Date().toISOString(),
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("id", notificationEntryId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[sponsoredNotif] Error recording click:", updateError);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    // Incrémenter le compteur clicked_count
    const { data: entry } = await supabase
      .from("consumer_sponsored_notifications")
      .select("notification_id")
      .eq("id", notificationEntryId)
      .maybeSingle();

    if (entry) {
      await supabase.rpc("increment_sponsored_notification_stat", {
        p_notification_id: (entry as any).notification_id,
        p_field: "clicked_count",
      });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("[sponsoredNotif] clickSponsoredNotification error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// REGISTER ROUTES
// =============================================================================

export function registerSponsoredNotificationRoutes(app: Router) {
  // PRO endpoints
  app.post("/api/pro/establishments/:id/ads/push-notifications", createSponsoredNotification);
  app.get("/api/pro/establishments/:id/ads/push-notifications", listSponsoredNotifications);
  app.patch("/api/pro/establishments/:id/ads/push-notifications/:notifId", updateSponsoredNotification);
  app.post("/api/pro/establishments/:id/ads/push-notifications/:notifId/submit", submitSponsoredNotification);
  app.delete("/api/pro/establishments/:id/ads/push-notifications/:notifId", deleteSponsoredNotification);

  // Admin endpoints
  app.get("/api/admin/ads/push-notifications/queue", getNotificationModerationQueue);
  app.post("/api/admin/ads/push-notifications/:notifId/moderate", moderateSponsoredNotification);
  app.post("/api/admin/ads/push-notifications/:notifId/send", sendSponsoredNotification);

  // Consumer endpoints
  app.get("/api/consumer/notifications/sponsored", getConsumerSponsoredNotifications);
  app.post("/api/consumer/notifications/sponsored/:id/read", markSponsoredNotificationRead);
  app.post("/api/consumer/notifications/sponsored/:id/click", clickSponsoredNotification);
}
