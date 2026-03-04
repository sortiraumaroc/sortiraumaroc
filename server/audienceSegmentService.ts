/**
 * Audience Segment Service — Shared segmentation for Push, Banners & Wheel
 *
 * Resolves audience filters into user IDs by querying consumer_users,
 * consumer_user_stats, and related tables.
 *
 * All criteria are combinable in AND (intersection).
 * Used by: Push Marketing, Banners, Wheel of Fortune eligibility.
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { createModuleLogger } from "./lib/logger";
import type { AudienceFilters } from "../shared/notificationsBannersWheelTypes";

const log = createModuleLogger("audienceSegment");
import {
  AUDIENCE_SENIORITY_DAYS,
  AUDIENCE_ACTIVITY_DAYS,
  AUDIENCE_RELIABILITY_SCORE,
} from "../shared/notificationsBannersWheelTypes";

// =============================================================================
// Types
// =============================================================================

export interface AudienceResult {
  user_ids: string[];
  total_count: number;
}

// =============================================================================
// Main API
// =============================================================================

/**
 * Count the number of users matching the given audience filters.
 * Used for real-time audience size preview in admin dashboard.
 */
export async function countAudienceSize(
  filters: AudienceFilters,
  opts?: { requirePushMarketing?: boolean },
): Promise<number> {
  const sql = buildAudienceQuery(filters, { countOnly: true, requirePushMarketing: opts?.requirePushMarketing });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.rpc("execute_audience_count", { query_text: sql });

  if (error) {
    // Fallback: do a simpler count
    log.error({ err: error.message }, "countAudienceSize RPC error, using fallback");
    return await countAudienceFallback(filters, opts?.requirePushMarketing);
  }

  return typeof data === "number" ? data : 0;
}

/**
 * Get user IDs matching the given audience filters.
 */
export async function getAudienceUserIds(
  filters: AudienceFilters,
  opts?: { limit?: number; requirePushMarketing?: boolean },
): Promise<string[]> {
  const supabase = getAdminSupabase();

  // Build query using Supabase query builder for better compatibility
  return await resolveAudienceWithQueryBuilder(supabase, filters, opts);
}

// =============================================================================
// Query builder approach (more compatible with Supabase)
// =============================================================================

async function resolveAudienceWithQueryBuilder(
  supabase: ReturnType<typeof getAdminSupabase>,
  filters: AudienceFilters,
  opts?: { limit?: number; requirePushMarketing?: boolean },
): Promise<string[]> {
  const now = new Date();

  // Start with consumer_users base query
  let query = supabase
    .from("consumer_users")
    .select("id")
    .eq("status", "active");

  // Push marketing opt-in filter
  if (opts?.requirePushMarketing) {
    query = query.eq("push_marketing_enabled", true);
  }

  // City filter
  if (filters.cities && filters.cities.length > 0) {
    query = query.in("city", filters.cities);
  }

  // Seniority filter (based on created_at)
  if (filters.seniority) {
    const range = AUDIENCE_SENIORITY_DAYS[filters.seniority];
    const maxDate = new Date(now.getTime() - range.min * 24 * 60 * 60 * 1000).toISOString();
    query = query.lte("created_at", maxDate);

    if (range.max !== Infinity) {
      const minDate = new Date(now.getTime() - range.max * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", minDate);
    }
  }

  // Limit
  if (opts?.limit) {
    query = query.limit(opts.limit);
  } else {
    query = query.limit(50000); // Safety limit
  }

  const { data: baseUsers, error: baseError } = await query;
  if (baseError || !baseUsers) {
    log.error({ err: baseError?.message }, "Base query error");
    return [];
  }

  let userIds = (baseUsers as { id: string }[]).map((u) => u.id);
  if (userIds.length === 0) return [];

  // Apply stats-based filters
  if (
    filters.recent_activity ||
    filters.min_reservations != null ||
    filters.max_reservations != null ||
    filters.reliability_tier
  ) {
    userIds = await filterByStats(supabase, userIds, filters, now);
  }

  // Filter by loyalty card existence
  if (filters.has_loyalty_card != null) {
    userIds = await filterByLoyaltyCard(supabase, userIds, filters.has_loyalty_card);
  }

  // Filter by pack purchase
  if (filters.has_purchased_pack != null) {
    userIds = await filterByPackPurchase(supabase, userIds, filters.has_purchased_pack);
  }

  // Activity interests filter (requires join with newsletter_subscribers)
  if (filters.activity_interests && filters.activity_interests.length > 0) {
    userIds = await filterByInterests(supabase, userIds, filters.activity_interests);
  }

  return userIds;
}

// =============================================================================
// Sub-filters
// =============================================================================

async function filterByStats(
  supabase: ReturnType<typeof getAdminSupabase>,
  userIds: string[],
  filters: AudienceFilters,
  now: Date,
): Promise<string[]> {
  // Process in batches of 1000
  const result: string[] = [];
  const batchSize = 1000;

  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);

    let query = supabase
      .from("consumer_user_stats")
      .select("user_id")
      .in("user_id", batch);

    // Recent activity
    if (filters.recent_activity) {
      const range = AUDIENCE_ACTIVITY_DAYS[filters.recent_activity];
      const maxDate = new Date(now.getTime() - range.min * 24 * 60 * 60 * 1000).toISOString();
      query = query.lte("last_activity_at", maxDate);

      if (range.max !== Infinity) {
        const minDate = new Date(now.getTime() - range.max * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("last_activity_at", minDate);
      }
    }

    // Reservations count
    if (filters.min_reservations != null) {
      query = query.gte("reservations_count", filters.min_reservations);
    }
    if (filters.max_reservations != null) {
      query = query.lte("reservations_count", filters.max_reservations);
    }

    // Reliability score
    if (filters.reliability_tier) {
      const range = AUDIENCE_RELIABILITY_SCORE[filters.reliability_tier];
      query = query.gte("reliability_score", range.min).lte("reliability_score", range.max);
    }

    const { data, error } = await query;
    if (!error && data) {
      result.push(...(data as { user_id: string }[]).map((r) => r.user_id));
    }
  }

  return result;
}

async function filterByLoyaltyCard(
  supabase: ReturnType<typeof getAdminSupabase>,
  userIds: string[],
  hasCard: boolean,
): Promise<string[]> {
  if (userIds.length === 0) return [];

  // Get users who have at least one active loyalty card
  const { data, error } = await supabase
    .from("loyalty_cards")
    .select("user_id")
    .in("user_id", userIds.slice(0, 5000))
    .eq("status", "active");

  if (error) return userIds; // On error, don't filter

  const usersWithCards = new Set((data as { user_id: string }[]).map((r) => r.user_id));

  if (hasCard) {
    return userIds.filter((id) => usersWithCards.has(id));
  } else {
    return userIds.filter((id) => !usersWithCards.has(id));
  }
}

async function filterByPackPurchase(
  supabase: ReturnType<typeof getAdminSupabase>,
  userIds: string[],
  hasPurchased: boolean,
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from("pack_purchases")
    .select("buyer_email")
    .in("buyer_email", userIds.slice(0, 5000))
    .eq("payment_status", "completed");

  if (error) return userIds;

  // pack_purchases uses buyer_email, but we need to match against user IDs
  // Since we can't directly join, check if user_id column exists
  // Fallback: match by user_id if column exists
  const { data: data2 } = await supabase
    .from("pack_purchases")
    .select("user_id")
    .in("user_id", userIds.slice(0, 5000))
    .not("user_id", "is", null);

  const usersWithPacks = new Set<string>();
  if (data2) {
    for (const row of data2 as { user_id: string | null }[]) {
      if (row.user_id) usersWithPacks.add(row.user_id);
    }
  }

  if (hasPurchased) {
    return userIds.filter((id) => usersWithPacks.has(id));
  } else {
    return userIds.filter((id) => !usersWithPacks.has(id));
  }
}

async function filterByInterests(
  supabase: ReturnType<typeof getAdminSupabase>,
  userIds: string[],
  interests: string[],
): Promise<string[]> {
  if (userIds.length === 0 || interests.length === 0) return userIds;

  // newsletter_subscribers has interests array and email
  // We need to match against consumer_users by email
  // For now, use a simpler approach: match by city overlap or skip
  // This is a known limitation — full interest matching requires a join

  // Try to match subscribers by email → user
  const { data: subscribers } = await supabase
    .from("newsletter_subscribers")
    .select("email, interests")
    .eq("status", "active")
    .overlaps("interests", interests);

  if (!subscribers || subscribers.length === 0) return userIds;

  const matchingEmails = new Set(
    (subscribers as { email: string }[]).map((s) => s.email.toLowerCase()),
  );

  // Get emails for our user IDs
  const { data: users } = await supabase
    .from("consumer_users")
    .select("id, email")
    .in("id", userIds.slice(0, 5000));

  if (!users) return userIds;

  return (users as { id: string; email: string }[])
    .filter((u) => u.email && matchingEmails.has(u.email.toLowerCase()))
    .map((u) => u.id);
}

// =============================================================================
// Fallback count (simpler, no RPC)
// =============================================================================

async function countAudienceFallback(
  filters: AudienceFilters,
  requirePushMarketing?: boolean,
): Promise<number> {
  const userIds = await getAudienceUserIds(filters, {
    limit: 100000,
    requirePushMarketing,
  });
  return userIds.length;
}

// =============================================================================
// SQL query builder (for RPC-based count — optional)
// =============================================================================

function buildAudienceQuery(
  filters: AudienceFilters,
  opts: { countOnly?: boolean; requirePushMarketing?: boolean },
): string {
  const conditions: string[] = ["cu.status = 'active'"];
  const joins: string[] = [];

  if (opts.requirePushMarketing) {
    conditions.push("cu.push_marketing_enabled = true");
  }

  if (filters.cities && filters.cities.length > 0) {
    const escaped = filters.cities.map((c) => `'${c.replace(/'/g, "''")}'`).join(",");
    conditions.push(`cu.city IN (${escaped})`);
  }

  if (filters.seniority) {
    const range = AUDIENCE_SENIORITY_DAYS[filters.seniority];
    conditions.push(`cu.created_at <= now() - interval '${range.min} days'`);
    if (range.max !== Infinity) {
      conditions.push(`cu.created_at >= now() - interval '${range.max} days'`);
    }
  }

  if (filters.recent_activity || filters.min_reservations != null || filters.max_reservations != null || filters.reliability_tier) {
    joins.push("LEFT JOIN consumer_user_stats cus ON cus.user_id = cu.id");

    if (filters.recent_activity) {
      const range = AUDIENCE_ACTIVITY_DAYS[filters.recent_activity];
      conditions.push(`cus.last_activity_at >= now() - interval '${range.max === Infinity ? 99999 : range.max} days'`);
      conditions.push(`cus.last_activity_at <= now() - interval '${range.min} days'`);
    }

    if (filters.min_reservations != null) {
      conditions.push(`COALESCE(cus.reservations_count, 0) >= ${Number(filters.min_reservations)}`);
    }
    if (filters.max_reservations != null) {
      conditions.push(`COALESCE(cus.reservations_count, 0) <= ${Number(filters.max_reservations)}`);
    }

    if (filters.reliability_tier) {
      const range = AUDIENCE_RELIABILITY_SCORE[filters.reliability_tier];
      conditions.push(`COALESCE(cus.reliability_score, 80) >= ${range.min}`);
      conditions.push(`COALESCE(cus.reliability_score, 80) <= ${range.max}`);
    }
  }

  const selectClause = opts.countOnly ? "COUNT(DISTINCT cu.id)" : "cu.id";
  const joinClause = joins.length > 0 ? joins.join(" ") : "";
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return `SELECT ${selectClause} FROM consumer_users cu ${joinClause} ${whereClause}`;
}

/**
 * Validate audience filters (check for empty/invalid values).
 */
export function validateAudienceFilters(filters: AudienceFilters): { ok: boolean; error?: string } {
  if (filters.seniority && !["new", "regular", "old"].includes(filters.seniority)) {
    return { ok: false, error: "Invalid seniority tier" };
  }
  if (filters.recent_activity && !["active", "dormant", "inactive"].includes(filters.recent_activity)) {
    return { ok: false, error: "Invalid activity tier" };
  }
  if (filters.reliability_tier && !["high", "medium", "low"].includes(filters.reliability_tier)) {
    return { ok: false, error: "Invalid reliability tier" };
  }
  if (filters.min_reservations != null && (filters.min_reservations < 0 || filters.min_reservations > 100000)) {
    return { ok: false, error: "Invalid min_reservations" };
  }
  if (filters.max_reservations != null && (filters.max_reservations < 0 || filters.max_reservations > 100000)) {
    return { ok: false, error: "Invalid max_reservations" };
  }
  return { ok: true };
}
