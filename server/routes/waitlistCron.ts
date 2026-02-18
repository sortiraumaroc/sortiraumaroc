/**
 * Waitlist Cron Jobs
 *
 * Endpoints called by cron scheduler for:
 * 1. Auto-expiring waitlist offers past their deadline
 * 2. Auto-promoting the next person in queue
 * 3. Sending notifications (email + push) for promotions
 */

import type { Request, Response } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { emitAdminNotification } from "../adminNotifications";
import { sendTemplateEmail } from "../emailService";
import { sendPushNotification, sendPushToConsumerUser } from "../pushNotifications";
import { formatLeJjMmAaAHeure } from "../../shared/datetime";

const supabase = getAdminSupabase();

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

// ---------------------------------------------------------------------------
// POST /api/admin/cron/waitlist-expire-promote
// Expire offers and auto-promote next in queue
// Called every 5 minutes by cron
// ---------------------------------------------------------------------------

export async function cronWaitlistExpireAndPromote(req: Request, res: Response) {
  try {
    // Verify cron secret
    const cronSecret = req.headers["x-cron-secret"];
    if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
      return res.status(401).json({ ok: false, error: "Invalid cron secret" });
    }

    // Step 1: Find expired offers that need processing
    const { data: expiredEntries, error: fetchError } = await supabase
      .from("waitlist_entries")
      .select(`
        id,
        slot_id,
        reservation_id,
        user_id,
        position,
        slot:availability_slots!inner(
          id,
          establishment_id,
          starts_at,
          establishment:establishments!inner(id, name)
        )
      `)
      .eq("status", "offer_sent")
      .lt("offer_expires_at", new Date().toISOString());

    if (fetchError) {
      console.error("[cronWaitlistExpire] Error fetching expired entries:", fetchError);
      return res.status(500).json({ ok: false, error: "Database error" });
    }

    const expiredCount = expiredEntries?.length ?? 0;
    let promotedCount = 0;
    const notifications: Array<{ type: string; userId: string; success: boolean }> = [];

    if (expiredCount === 0) {
      return res.json({
        ok: true,
        message: "No expired offers to process",
        expired: 0,
        promoted: 0,
      });
    }

    // Process each expired entry
    for (const entry of expiredEntries ?? []) {
      const slotData = entry.slot as any;
      const establishmentId = slotData?.establishment_id ?? slotData?.establishment?.id ?? "";
      const establishmentName = slotData?.establishment?.name ?? "";
      const startsAt = slotData?.starts_at ?? "";
      const slotId = entry.slot_id;

      // Step 2: Mark entry as expired
      await supabase
        .from("waitlist_entries")
        .update({
          status: "offer_expired",
          offer_token: null,
          offer_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entry.id);

      // Step 3: Cancel the associated reservation
      await supabase
        .from("reservations")
        .update({
          status: "cancelled_waitlist_expired",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", entry.reservation_id)
        .in("status", ["pending_waitlist", "pending_pro_validation", "requested"]);

      // Step 4: Notify the user whose offer expired (best-effort)
      try {
        const { data: expiredUser } = await supabase
          .from("consumer_users")
          .select("email, full_name")
          .eq("id", entry.user_id)
          .maybeSingle();

        if (expiredUser?.email) {
          const dateLabel = startsAt ? formatLeJjMmAaAHeure(startsAt) : "";
          const baseUrl = process.env.PUBLIC_BASE_URL || "https://sam.ma";

          await sendTemplateEmail({
            templateKey: "user_waitlist_offer_expired",
            lang: "fr",
            fromKey: "noreply",
            to: [expiredUser.email],
            variables: {
              user_name: expiredUser.full_name ?? "",
              establishment: establishmentName,
              date: dateLabel,
              cta_url: `${baseUrl}/e/${encodeURIComponent(establishmentId)}`,
            },
            ctaUrl: `${baseUrl}/e/${encodeURIComponent(establishmentId)}`,
          });
        }

        // Also send push notification
        await sendPushToConsumerUser({
          userId: entry.user_id,
          title: "Offre expirée",
          body: `Votre offre pour ${establishmentName} a expiré.`,
          data: {
            type: "waitlist_offer_expired",
            establishmentId,
            reservationId: entry.reservation_id,
          },
        });
      } catch {
        // ignore notification errors
      }

      // Step 5: Find and promote the next person in queue
      const { data: nextInQueue } = await supabase
        .from("waitlist_entries")
        .select(`
          id,
          reservation_id,
          user_id,
          position
        `)
        .eq("slot_id", slotId)
        .in("status", ["waiting", "queued"])
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextInQueue) {
        // Generate new offer
        const newToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
        const newExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

        // Update entry to offer_sent
        await supabase
          .from("waitlist_entries")
          .update({
            status: "offer_sent",
            offer_token: newToken,
            offer_expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", nextInQueue.id);

        // Update reservation status
        await supabase
          .from("reservations")
          .update({
            status: "pending_waitlist",
            updated_at: new Date().toISOString(),
          })
          .eq("id", nextInQueue.reservation_id);

        promotedCount++;

        // Notify the promoted user
        try {
          const { data: promotedUser } = await supabase
            .from("consumer_users")
            .select("email, full_name")
            .eq("id", nextInQueue.user_id)
            .maybeSingle();

          if (promotedUser?.email) {
            const dateLabel = startsAt ? formatLeJjMmAaAHeure(startsAt) : "";
            const baseUrl = process.env.PUBLIC_BASE_URL || "https://sam.ma";
            const ctaUrl = `${baseUrl}/profile/bookings/${encodeURIComponent(nextInQueue.reservation_id)}`;

            await sendTemplateEmail({
              templateKey: "user_waitlist_auto_promoted",
              lang: "fr",
              fromKey: "noreply",
              to: [promotedUser.email],
              variables: {
                user_name: promotedUser.full_name ?? "",
                establishment: establishmentName,
                date: dateLabel,
                cta_url: ctaUrl,
              },
              ctaUrl,
            });

            notifications.push({ type: "email", userId: nextInQueue.user_id, success: true });
          }

          // Send push notification
          const pushResult = await sendPushToConsumerUser({
            userId: nextInQueue.user_id,
            title: "🎉 Une place s'est libérée !",
            body: `Confirmez vite votre réservation pour ${establishmentName} (expire dans 15 min)`,
            data: {
              type: "waitlist_offer_received",
              establishmentId,
              reservationId: nextInQueue.reservation_id,
              expiresAt: newExpiresAt,
            },
          });

          notifications.push({ type: "push", userId: nextInQueue.user_id, success: pushResult.ok });
        } catch {
          // ignore notification errors
        }

        // Log consumer event
        await supabase.from("consumer_user_events").insert({
          user_id: nextInQueue.user_id,
          event_type: "waitlist.auto_promoted",
          occurred_at: new Date().toISOString(),
          metadata: {
            waitlist_entry_id: nextInQueue.id,
            reservation_id: nextInQueue.reservation_id,
            establishment_id: establishmentId,
            slot_id: slotId,
            position: nextInQueue.position,
            offer_expires_at: newExpiresAt,
            reason: "previous_offer_expired",
          },
        });
      }

      // Notify PROs about the expiration
      try {
        const { data: memberships } = await supabase
          .from("pro_establishment_memberships")
          .select("user_id")
          .eq("establishment_id", establishmentId)
          .limit(100);

        const proNotifications = (memberships ?? []).map((m: any) => ({
          user_id: m.user_id,
          establishment_id: establishmentId,
          category: "booking",
          title: "Liste d'attente : offre expirée",
          body: nextInQueue
            ? `L'offre #${entry.position} a expiré. Le client #${nextInQueue.position} a été automatiquement notifié.`
            : `L'offre #${entry.position} a expiré. Plus personne en file d'attente.`,
          data: {
            action: "waitlist_offer_expired",
            slotId,
            expiredEntryId: entry.id,
            promotedEntryId: nextInQueue?.id ?? null,
          },
        }));

        if (proNotifications.length > 0) {
          await supabase.from("pro_notifications").insert(proNotifications);
        }
      } catch {
        // ignore
      }
    }

    // Admin notification summary
    if (expiredCount > 0) {
      void emitAdminNotification({
        type: "waitlist_cron_completed",
        title: "Cron waitlist exécuté",
        body: `${expiredCount} offre(s) expirée(s), ${promotedCount} promotion(s) automatique(s).`,
        data: {
          expired: expiredCount,
          promoted: promotedCount,
        },
      });
    }

    console.log(`[cronWaitlistExpire] Processed ${expiredCount} expired, ${promotedCount} promoted`);

    return res.json({
      ok: true,
      expired: expiredCount,
      promoted: promotedCount,
      notifications,
    });
  } catch (err) {
    console.error("[cronWaitlistExpire] Unexpected error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
