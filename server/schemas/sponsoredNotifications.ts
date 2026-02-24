/**
 * Zod Schemas for Sponsored Notifications Routes
 */
import { z } from "zod";
import { zUuid } from "../lib/validate";

// ── Route Params ────────────────────────────────────────────────────────────

/** :id (establishment id for pro routes, OR consumer notification entry id) */
export const SponsoredNotifIdParams = z.object({ id: zUuid });

/** :id + :notifId (pro: establishment id + notification id) */
export const SponsoredNotifIdNotifIdParams = z.object({ id: zUuid, notifId: zUuid });

/** :notifId (admin: notification id only) */
export const SponsoredNotifNotifIdParams = z.object({ notifId: zUuid });

// ── Pro: create / update notification ────────────────────────────────────────

export const CreateSponsoredNotificationSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  link_url: z.string().optional(),
  image_url: z.string().optional(),
  notification_type: z.string().optional(),
  targeting: z.any().optional(),
  scheduled_at: z.string().nullable().optional(),
});

export const UpdateSponsoredNotificationSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  link_url: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  notification_type: z.string().optional(),
  targeting: z.any().optional(),
  scheduled_at: z.string().nullable().optional(),
});

// ── Admin: moderate ──────────────────────────────────────────────────────────

export const ModerateSponsoredNotificationSchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejection_reason: z.string().optional(),
});
