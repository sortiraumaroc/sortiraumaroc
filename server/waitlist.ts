// NEW: auto-promotion waitlist logic

import { emitAdminNotification } from "./adminNotifications";
import { sendTemplateEmail } from "./emailService";
import { NotificationEventType } from "../shared/notifications";
import { formatLeJjMmAaAHeure } from "../shared/datetime";

type SupabaseLike = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asIso(v: unknown): string | null {
  const s = asString(v).trim();
  if (!s) return null;
  const ts = Date.parse(s);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

type WaitlistProcessSlotResult =
  | { ok: true; action: "offer_sent"; entry_id: string; reservation_id: string; user_id: string; position: number; offer_expires_at: string; establishment_id: string; starts_at?: string | null; party_size?: number | null; amount_deposit_cents?: number | null; currency?: string | null; service_label?: string | null; remaining?: number }
  | { ok: true; action: string; remaining?: number }
  | { ok: false; error: string };

async function notifyProMembers(args: {
  supabase: SupabaseLike;
  establishmentId: string;
  category: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const { data: memberships } = await args.supabase
    .from("pro_establishment_memberships")
    .select("user_id")
    .eq("establishment_id", args.establishmentId)
    .limit(5000);

  const userIds = new Set<string>();
  for (const row of (memberships ?? []) as Array<{ user_id?: unknown }>) {
    const id = asString((row as any)?.user_id).trim();
    if (id) userIds.add(id);
  }

  const out = Array.from(userIds).map((user_id) => ({
    user_id,
    establishment_id: args.establishmentId,
    category: args.category,
    title: args.title,
    body: args.body,
    data: args.data ?? {},
  }));

  if (!out.length) return;

  // Best-effort: ignore notification errors.
  await args.supabase.from("pro_notifications").insert(out);
}

export async function triggerWaitlistPromotionForSlot(args: {
  supabase: SupabaseLike;
  slotId: string;
  actorRole: string;
  actorUserId: string | null;
  reason: string;
}): Promise<WaitlistProcessSlotResult> {
  const { data, error } = await args.supabase.rpc("waitlist_process_slot", {
    p_slot_id: args.slotId,
    p_actor_role: args.actorRole,
    p_actor_user_id: args.actorUserId,
  });

  if (error) {
    return { ok: false, error: asString(error?.message || error) || "waitlist_process_slot_failed" };
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const action = asString(payload.action);

  if (action !== "offer_sent") {
    return { ok: true, action: action || "noop", remaining: asNumber(payload.remaining) ?? undefined };
  }

  const establishmentId = asString(payload.establishment_id);
  const entryId = asString(payload.entry_id);
  const reservationId = asString(payload.reservation_id);
  const expiresAtIso = asIso(payload.offer_expires_at) || new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const position = Math.max(1, Math.round(asNumber(payload.position) ?? 1));

  // Audit trail (best-effort)
  try {
    if (entryId && reservationId) {
      await args.supabase.from("system_logs").insert({
        actor_user_id: args.actorUserId ?? null,
        actor_role: args.actorRole,
        action: "waitlist.offer_sent",
        entity_type: "waitlist_entry",
        entity_id: entryId,
        payload: {
          reservation_id: reservationId,
          establishment_id: establishmentId,
          slot_id: args.slotId,
          position,
          offer_expires_at: expiresAtIso,
          reason: args.reason,
        },
      });
    }
  } catch {
    // ignore
  }

  // Inform PROs (visibility only; no manual action required)
  if (establishmentId) {
    try {
      await notifyProMembers({
        supabase: args.supabase,
        establishmentId,
        category: "booking",
        title: "Liste d’attente : offre envoyée",
        body: `Une place s’est libérée. Offre envoyée au client #${position} (expire à ${expiresAtIso}).`,
        data: {
          action: "waitlist_offer_sent",
          reason: args.reason,
          slotId: args.slotId,
          reservationId,
          waitlistEntryId: entryId,
          offerExpiresAt: expiresAtIso,
        },
      });
    } catch {
      // ignore
    }
  }

  // Inform admins (best-effort)
  void emitAdminNotification({
    type: "waitlist_offer_sent",
    title: "Liste d’attente : offre envoyée",
    body: `Offre envoyée au client #${position} (expire à ${expiresAtIso}).`,
    data: {
      reason: args.reason,
      slotId: args.slotId,
      reservationId,
      waitlistEntryId: entryId,
      establishmentId,
      offerExpiresAt: expiresAtIso,
    },
  });

  // Inform consumer (best-effort)
  try {
    const consumerUserId = asString(payload.user_id).trim();
    if (consumerUserId) {
      await args.supabase.from("consumer_user_events").insert({
        user_id: consumerUserId,
        event_type: NotificationEventType.waitlist_offer_sent,
        occurred_at: new Date().toISOString(),
        metadata: {
          reservationId,
          waitlistEntryId: entryId,
          establishmentId,
          slotId: args.slotId,
          position,
          offerExpiresAt: expiresAtIso,
          reason: args.reason,
        },
      });
    }
  } catch {
    // ignore
  }

  // Email consumer (best-effort)
  void (async () => {
    try {
      const consumerUserId = asString(payload.user_id).trim();
      if (!consumerUserId) return;

      const { data: consumerRow } = await args.supabase
        .from("consumer_users")
        .select("email,full_name")
        .eq("id", consumerUserId)
        .maybeSingle();

      const consumerEmail = typeof (consumerRow as any)?.email === "string" ? String((consumerRow as any).email).trim() : "";
      const consumerName = typeof (consumerRow as any)?.full_name === "string" ? String((consumerRow as any).full_name).trim() : "";

      if (!consumerEmail) return;

      const { data: estRow } = establishmentId
        ? await args.supabase.from("establishments").select("name").eq("id", establishmentId).maybeSingle()
        : ({ data: null } as any);

      const establishmentName = typeof (estRow as any)?.name === "string" ? String((estRow as any).name) : "";

      const startsAtIso = asIso(payload.starts_at);
      const dateLabel = startsAtIso ? formatLeJjMmAaAHeure(startsAtIso) : "";

      const baseUrl = asString(process.env.PUBLIC_BASE_URL) || "https://sortiraumaroc.ma";
      const ctaUrl = `${baseUrl}/profile/bookings/${encodeURIComponent(reservationId || "")}`;

      await sendTemplateEmail({
        templateKey: "user_waitlist_offer",
        lang: "fr",
        fromKey: "no-reply",
        to: [consumerEmail],
        variables: {
          user_name: consumerName,
          establishment: establishmentName,
          date: dateLabel,
          cta_url: ctaUrl,
        },
        ctaUrl,
        meta: {
          source: "waitlist.offer_sent",
          establishment_id: establishmentId,
          slot_id: args.slotId,
          reservation_id: reservationId,
          waitlist_entry_id: entryId,
          offer_expires_at: expiresAtIso,
          position,
        },
      });
    } catch {
      // ignore
    }
  })();

  return {
    ok: true,
    action: "offer_sent",
    entry_id: entryId,
    reservation_id: reservationId,
    user_id: asString(payload.user_id),
    position,
    offer_expires_at: expiresAtIso,
    establishment_id: establishmentId,
    starts_at: asIso(payload.starts_at),
    party_size: asNumber(payload.party_size),
    amount_deposit_cents: asNumber(payload.amount_deposit_cents),
    currency: asString(payload.currency) || null,
    service_label: asString(payload.service_label) || null,
    remaining: asNumber(payload.remaining) ?? undefined,
  };
}

export async function expireAndPromoteAllWaitlistOffers(args: { supabase: SupabaseLike }): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const { data, error } = await args.supabase.rpc("waitlist_expire_and_promote_all", {});
  if (error) return { ok: false, error: asString(error?.message || error) || "waitlist_expire_and_promote_failed" };
  return { ok: true, result: data };
}
