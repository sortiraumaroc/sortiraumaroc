import type { SupabaseClient } from "@supabase/supabase-js";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("proNotifications");

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function notifyProMembers(args: {
  supabase: SupabaseClient;
  establishmentId: string;
  category: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  excludeUserIds?: string[];
}): Promise<void> {
  const establishmentId = asString(args.establishmentId);
  if (!establishmentId) return;

  try {
    const { data: memberships } = await args.supabase
      .from("pro_establishment_memberships")
      .select("user_id")
      .eq("establishment_id", establishmentId)
      .limit(5000);

    const excluded = new Set((args.excludeUserIds ?? []).map((x) => asString(x)).filter(Boolean));

    const userIds = new Set<string>();
    for (const row of (memberships ?? []) as Array<{ user_id?: unknown }>) {
      const id = isRecord(row) ? asString(row.user_id) : asString((row as any)?.user_id);
      if (!id) continue;
      if (excluded.has(id)) continue;
      userIds.add(id);
    }

    const out = Array.from(userIds).map((user_id) => ({
      user_id,
      establishment_id: establishmentId,
      category: args.category,
      title: args.title,
      body: args.body,
      data: args.data ?? {},
    }));

    if (!out.length) return;
    await args.supabase.from("pro_notifications").insert(out);
  } catch (err) {
    log.warn({ err }, "Best-effort: notifyProMembers failed");
  }
}
