import type { SupabaseClient } from "@supabase/supabase-js";

export type ConsumerReliabilityLevel = "excellent" | "good" | "medium" | "fragile";

export const RELIABILITY_WINDOW_DAYS = 90;

function clampInt(n: number, min: number, max: number): number {
  const v = Number.isFinite(n) ? Math.round(n) : min;
  return Math.max(min, Math.min(max, v));
}

export function scoreToReliabilityLevel(score: number): ConsumerReliabilityLevel {
  const s = clampInt(score, 0, 100);
  if (s >= 85) return "excellent";
  if (s >= 70) return "good";
  if (s >= 50) return "medium";
  return "fragile";
}

export function computeReliabilityScoreV1(args: { checkedInCount: number; noShowsCount: number }): number {
  const checkedIn = Math.max(0, Math.round(args.checkedInCount || 0));
  const noShows = Math.max(0, Math.round(args.noShowsCount || 0));

  // v1 is intentionally simple and non-punitive-by-default.
  // - Start from a good baseline.
  // - Each no-show significantly reduces the score (so 1 no-show can move to "fragile").
  // - Honored reservations slightly improve the score (capped).
  const base = 85;
  const bonus = Math.min(15, checkedIn * 3);
  const penalty = noShows * 40;

  return clampInt(base + bonus - penalty, 0, 100);
}

function subtractDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() - days);
  return out;
}

export async function recomputeConsumerUserStatsV1(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<{ reliabilityScore: number; reliabilityLevel: ConsumerReliabilityLevel; reservationsCount: number; noShowsCount: number }> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) {
    return {
      reliabilityScore: 80,
      reliabilityLevel: scoreToReliabilityLevel(80),
      reservationsCount: 0,
      noShowsCount: 0,
    };
  }

  const now = new Date();
  const fromIso = subtractDays(now, RELIABILITY_WINDOW_DAYS).toISOString();
  const nowIso = now.toISOString();

  // We use starts_at as the reference date (multi-activity neutral) and only
  // include reservations whose starts_at is in the past.
  const { data, error } = await args.supabase
    .from("reservations")
    .select("status,checked_in_at,starts_at")
    .eq("user_id", userId)
    .gte("starts_at", fromIso)
    .lte("starts_at", nowIso)
    .limit(5000);

  if (error) {
    // Best-effort: do not block business flows.
    const fallbackScore = 80;
    return {
      reliabilityScore: fallbackScore,
      reliabilityLevel: scoreToReliabilityLevel(fallbackScore),
      reservationsCount: 0,
      noShowsCount: 0,
    };
  }

  const rows = (data ?? []) as Array<{ status?: unknown; checked_in_at?: unknown }>;

  let reservationsCount = 0;
  let noShowsCount = 0;
  let checkedInCount = 0;

  for (const row of rows) {
    const status = String(row?.status ?? "").toLowerCase();
    const checkedInAt = row?.checked_in_at ? String(row.checked_in_at) : "";

    // Only count reservations that can meaningfully influence reliability.
    // (Exclude refused / waitlist: user did not get a chance to attend.)
    if (status === "refused" || status === "waitlist") continue;

    reservationsCount += 1;

    if (status === "noshow") noShowsCount += 1;
    if (checkedInAt) checkedInCount += 1;
  }

  const reliabilityScore = computeReliabilityScoreV1({ checkedInCount, noShowsCount });
  const reliabilityLevel = scoreToReliabilityLevel(reliabilityScore);

  await args.supabase
    .from("consumer_user_stats")
    .upsert(
      {
        user_id: userId,
        reliability_score: reliabilityScore,
        reservations_count: reservationsCount,
        no_shows_count: noShowsCount,
        last_activity_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "user_id" },
    );

  return { reliabilityScore, reliabilityLevel, reservationsCount, noShowsCount };
}
