import type { SupabaseClient } from "@supabase/supabase-js";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("consumerNotifications");

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function ensureConsumerUserExists(args: { supabase: SupabaseClient; userId: string; email?: string | null }) {
  const userId = asString(args.userId);
  if (!userId) return;

  const emailRaw = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
  const email = emailRaw || `unknown+${userId}@example.invalid`;

  // Best-effort: create the consumer shadow record required by FK constraints.
  try {
    const { error } = await args.supabase
      .from("consumer_users")
      .upsert(
        {
          id: userId,
          email,
          full_name: "",
          city: "",
          country: "",
        },
        { onConflict: "id" },
      );

    if (error) {
      // ignore
    }
  } catch (err) {
    log.warn({ err }, "Best-effort: ensureConsumerUserExists upsert failed");
  }

  // Best-effort: ensure stats row exists too.
  try {
    const { error } = await args.supabase.from("consumer_user_stats").upsert({ user_id: userId }, { onConflict: "user_id" });
    if (error) {
      // ignore
    }
  } catch (err) {
    log.warn({ err }, "Best-effort: consumer_user_stats upsert failed");
  }
}

export async function emitConsumerUserEvent(args: {
  supabase: SupabaseClient;
  userId: string;
  eventType: string;
  occurredAtIso?: string;
  metadata?: Record<string, unknown>;
  email?: string | null;
}): Promise<void> {
  const userId = asString(args.userId);
  const eventType = asString(args.eventType);
  if (!userId || !eventType) return;

  const row = {
    user_id: userId,
    event_type: eventType,
    occurred_at: asString(args.occurredAtIso) || new Date().toISOString(),
    metadata: args.metadata ?? {},
  };

  try {
    const first = await args.supabase.from("consumer_user_events").insert(row);
    if (!first.error) return;

    const msg = String(first.error.message ?? "").toLowerCase();
    const isFk = msg.includes("foreign key") || msg.includes("consumer_user_events_user_id_fkey");

    if (isFk) {
      await ensureConsumerUserExists({ supabase: args.supabase, userId, email: args.email ?? null });
      const second = await args.supabase.from("consumer_user_events").insert(row);
      if (!second.error) return;
    }
  } catch (err) {
    log.warn({ err }, "Best-effort: emitConsumerUserEvent failed");
  }
}
