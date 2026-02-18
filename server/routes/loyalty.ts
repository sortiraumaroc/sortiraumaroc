// =============================================================================
// SAM LOYALTY SYSTEM - Backend API Routes
// =============================================================================

import type { RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { randomUUID } from "crypto";

// =============================================================================
// HELPERS
// =============================================================================

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

async function getUserFromBearerToken(token: string): Promise<
  | { ok: true; user: { id: string; email?: string } }
  | { ok: false; status: number; error: string }
> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }
  return { ok: true, user: { id: data.user.id, email: data.user.email } };
}

async function ensureProRole(args: {
  establishmentId: string;
  userId: string;
  requiredRoles?: string[];
}): Promise<
  | { ok: true; role: string }
  | { ok: false; status: number; error: string }
> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", args.establishmentId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 403, error: "Not a member of this establishment" };

  if (args.requiredRoles && !args.requiredRoles.includes(data.role)) {
    return { ok: false, status: 403, error: `Role ${data.role} not authorized` };
  }

  return { ok: true, role: data.role };
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

// Type guard helpers
type AuthResult = Awaited<ReturnType<typeof getUserFromBearerToken>>;
type RoleResult = Awaited<ReturnType<typeof ensureProRole>>;

function authFailed(result: AuthResult): result is { ok: false; status: number; error: string } {
  return !result.ok;
}

function roleFailed(result: RoleResult): result is { ok: false; status: number; error: string } {
  return !result.ok;
}

function asString(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}

function asNumber(val: unknown): number | undefined {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asBoolean(val: unknown): boolean | undefined {
  if (typeof val === "boolean") return val;
  if (val === "true") return true;
  if (val === "false") return false;
  return undefined;
}

// Générer un code de récompense unique
function generateRewardCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SAM-FID-";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  code += "-" + new Date().getFullYear().toString().slice(-2);
  return code;
}

// =============================================================================
// PRO: LIST LOYALTY PROGRAMS
// =============================================================================

export const listLoyaltyPrograms: RequestHandler = async (req, res) => {
  const establishmentId = asString(req.params.establishmentId);
  if (!establishmentId) return res.status(400).json({ error: "establishmentId required" });

  const token = parseBearerToken(req.header("authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (authFailed(userResult)) return res.status(userResult.status).json({ error: userResult.error });

  const roleResult = await ensureProRole({ establishmentId, userId: userResult.user.id });
  if (roleFailed(roleResult)) return res.status(roleResult.status).json({ error: roleResult.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("loyalty_programs")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, programs: data ?? [] });
};

// =============================================================================
// PRO: CREATE LOYALTY PROGRAM
// =============================================================================

export const createLoyaltyProgram: RequestHandler = async (req, res) => {
  const establishmentId = asString(req.params.establishmentId);
  if (!establishmentId) return res.status(400).json({ error: "establishmentId required" });

  const token = parseBearerToken(req.header("authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (authFailed(userResult)) return res.status(userResult.status).json({ error: userResult.error });

  const roleResult = await ensureProRole({
    establishmentId,
    userId: userResult.user.id,
    requiredRoles: ["owner", "manager", "marketing"],
  });
  if (roleFailed(roleResult)) return res.status(roleResult.status).json({ error: roleResult.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const name = asString(req.body.name);
  const rewardType = asString(req.body.reward_type);
  const rewardDescription = asString(req.body.reward_description);
  const stampsRequired = asNumber(req.body.stamps_required);

  if (!name || !rewardType || !rewardDescription) {
    return res.status(400).json({ error: "name, reward_type, reward_description required" });
  }

  if (!["free_item", "discount_percent", "discount_fixed", "custom"].includes(rewardType)) {
    return res.status(400).json({ error: "Invalid reward_type" });
  }

  const supabase = getAdminSupabase();

  const programData = {
    establishment_id: establishmentId,
    name,
    description: asString(req.body.description) ?? null,
    stamps_required: stampsRequired ?? 10,
    reward_type: rewardType,
    reward_value: asString(req.body.reward_value) ?? null,
    reward_description: rewardDescription,
    reward_validity_days: asNumber(req.body.reward_validity_days) ?? 30,
    conditions: asString(req.body.conditions) ?? null,
    card_design: isRecord(req.body.card_design) ? req.body.card_design : {
      style: "gradient",
      primary_color: "#6366f1",
      secondary_color: "#8b5cf6",
      stamp_icon: "coffee",
      logo_url: null,
    },
    bonus_rules: isRecord(req.body.bonus_rules) ? req.body.bonus_rules : {
      birthday_bonus: false,
      birthday_multiplier: 2,
      happy_hour_bonus: false,
      happy_hour_start: "14:00",
      happy_hour_end: "17:00",
      happy_hour_multiplier: 2,
      sam_booking_bonus: true,
      sam_booking_extra_stamps: 1,
    },
    stamps_expire_after_days: asNumber(req.body.stamps_expire_after_days) ?? 180,
    warn_expiration_days: asNumber(req.body.warn_expiration_days) ?? 14,
    allow_retroactive_stamps: asBoolean(req.body.allow_retroactive_stamps) ?? false,
    retroactive_from_date: asString(req.body.retroactive_from_date) ?? null,
    is_active: true,
  };

  const { data, error } = await supabase
    .from("loyalty_programs")
    .insert(programData)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, program: data });
};

// =============================================================================
// PRO: UPDATE LOYALTY PROGRAM
// =============================================================================

export const updateLoyaltyProgram: RequestHandler = async (req, res) => {
  const establishmentId = asString(req.params.establishmentId);
  const programId = asString(req.params.programId);
  if (!establishmentId || !programId) {
    return res.status(400).json({ error: "establishmentId and programId required" });
  }

  const token = parseBearerToken(req.header("authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (authFailed(userResult)) return res.status(userResult.status).json({ error: userResult.error });

  const roleResult = await ensureProRole({
    establishmentId,
    userId: userResult.user.id,
    requiredRoles: ["owner", "manager", "marketing"],
  });
  if (roleFailed(roleResult)) return res.status(roleResult.status).json({ error: roleResult.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const supabase = getAdminSupabase();

  const updates: Record<string, unknown> = {};

  if (req.body.name !== undefined) updates.name = asString(req.body.name);
  if (req.body.description !== undefined) updates.description = asString(req.body.description) ?? null;
  if (req.body.stamps_required !== undefined) updates.stamps_required = asNumber(req.body.stamps_required);
  if (req.body.reward_type !== undefined) updates.reward_type = asString(req.body.reward_type);
  if (req.body.reward_value !== undefined) updates.reward_value = asString(req.body.reward_value) ?? null;
  if (req.body.reward_description !== undefined) updates.reward_description = asString(req.body.reward_description);
  if (req.body.reward_validity_days !== undefined) updates.reward_validity_days = asNumber(req.body.reward_validity_days);
  if (req.body.conditions !== undefined) updates.conditions = asString(req.body.conditions) ?? null;
  if (isRecord(req.body.card_design)) updates.card_design = req.body.card_design;
  if (isRecord(req.body.bonus_rules)) updates.bonus_rules = req.body.bonus_rules;
  if (req.body.stamps_expire_after_days !== undefined) updates.stamps_expire_after_days = asNumber(req.body.stamps_expire_after_days);
  if (req.body.warn_expiration_days !== undefined) updates.warn_expiration_days = asNumber(req.body.warn_expiration_days);
  if (req.body.allow_retroactive_stamps !== undefined) updates.allow_retroactive_stamps = asBoolean(req.body.allow_retroactive_stamps);
  if (req.body.retroactive_from_date !== undefined) updates.retroactive_from_date = asString(req.body.retroactive_from_date) ?? null;
  if (req.body.is_active !== undefined) updates.is_active = asBoolean(req.body.is_active);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const { data, error } = await supabase
    .from("loyalty_programs")
    .update(updates)
    .eq("id", programId)
    .eq("establishment_id", establishmentId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Program not found" });

  res.json({ ok: true, program: data });
};

// =============================================================================
// PRO: DELETE LOYALTY PROGRAM
// =============================================================================

export const deleteLoyaltyProgram: RequestHandler = async (req, res) => {
  const establishmentId = asString(req.params.establishmentId);
  const programId = asString(req.params.programId);
  if (!establishmentId || !programId) {
    return res.status(400).json({ error: "establishmentId and programId required" });
  }

  const token = parseBearerToken(req.header("authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (authFailed(userResult)) return res.status(userResult.status).json({ error: userResult.error });

  const roleResult = await ensureProRole({
    establishmentId,
    userId: userResult.user.id,
    requiredRoles: ["owner"],
  });
  if (roleFailed(roleResult)) return res.status(roleResult.status).json({ error: roleResult.error });

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("loyalty_programs")
    .delete()
    .eq("id", programId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// =============================================================================
// PRO: GET LOYALTY MEMBERS
// =============================================================================

export const getLoyaltyMembers: RequestHandler = async (req, res) => {
  const establishmentId = asString(req.params.establishmentId);
  if (!establishmentId) return res.status(400).json({ error: "establishmentId required" });

  const token = parseBearerToken(req.header("authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (authFailed(userResult)) return res.status(userResult.status).json({ error: userResult.error });

  const roleResult = await ensureProRole({ establishmentId, userId: userResult.user.id });
  if (roleFailed(roleResult)) return res.status(roleResult.status).json({ error: roleResult.error });

  const page = asNumber(req.query.page) ?? 1;
  const perPage = Math.min(asNumber(req.query.per_page) ?? 50, 100);
  const offset = (page - 1) * perPage;

  const supabase = getAdminSupabase();

  // Get all cards for this establishment with program info (no user join due to no FK)
  const { data: cards, error } = await supabase
    .from("loyalty_cards")
    .select(`
      *,
      program:loyalty_programs(*)
    `)
    .eq("establishment_id", establishmentId)
    .order("last_stamp_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + perPage - 1);

  if (error) return res.status(500).json({ error: error.message });

  // Get unique user IDs
  const userIds = [...new Set((cards ?? []).map((c) => c.user_id))];

  // Fetch user info separately
  const userMap = new Map<string, { id: string; full_name: string; email: string | null; phone: string | null }>();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("consumer_users")
      .select("id, full_name, email, phone")
      .in("id", userIds);

    for (const user of users ?? []) {
      userMap.set(user.id, user);
    }
  }

  // Group by user
  const memberMap = new Map<string, {
    user_id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    cards: Array<{
      program_id: string;
      program_name: string;
      stamps_count: number;
      stamps_required: number;
      status: string;
      last_stamp_at: string | null;
      has_pending_reward: boolean;
    }>;
    total_stamps: number;
    first_visit: string;
    last_visit: string;
  }>();

  for (const card of cards ?? []) {
    const user = userMap.get(card.user_id);
    if (!user) continue;

    let member = memberMap.get(user.id);
    if (!member) {
      member = {
        user_id: user.id,
        full_name: user.full_name || "Utilisateur",
        email: user.email,
        phone: user.phone,
        cards: [],
        total_stamps: 0,
        first_visit: card.created_at,
        last_visit: card.last_stamp_at || card.created_at,
      };
      memberMap.set(user.id, member);
    }

    const program = card.program as { id: string; name: string; stamps_required: number } | null;

    member.cards.push({
      program_id: program?.id ?? "",
      program_name: program?.name ?? "Programme",
      stamps_count: card.stamps_count,
      stamps_required: program?.stamps_required ?? 10,
      status: card.status,
      last_stamp_at: card.last_stamp_at,
      has_pending_reward: card.status === "reward_pending",
    });

    member.total_stamps += card.stamps_count;

    if (card.last_stamp_at && card.last_stamp_at > member.last_visit) {
      member.last_visit = card.last_stamp_at;
    }
    if (card.created_at < member.first_visit) {
      member.first_visit = card.created_at;
    }
  }

  const members = Array.from(memberMap.values());

  // Get total count
  const { count } = await supabase
    .from("loyalty_cards")
    .select("user_id", { count: "exact", head: true })
    .eq("establishment_id", establishmentId);

  res.json({
    ok: true,
    members,
    total: count ?? members.length,
    page,
    per_page: perPage,
  });
};

// =============================================================================
// PRO: GET LOYALTY DASHBOARD STATS
// =============================================================================

export const getLoyaltyDashboardStats: RequestHandler = async (req, res) => {
  const establishmentId = asString(req.params.establishmentId);
  if (!establishmentId) return res.status(400).json({ error: "establishmentId required" });

  const token = parseBearerToken(req.header("authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (authFailed(userResult)) return res.status(userResult.status).json({ error: userResult.error });

  const roleResult = await ensureProRole({ establishmentId, userId: userResult.user.id });
  if (roleFailed(roleResult)) return res.status(roleResult.status).json({ error: roleResult.error });

  const supabase = getAdminSupabase();

  // Get programs with stats
  const { data: programs } = await supabase
    .from("loyalty_programs")
    .select("*")
    .eq("establishment_id", establishmentId)
    .eq("is_active", true);

  // Get card counts
  const { data: cardStats } = await supabase
    .from("loyalty_cards")
    .select("status")
    .eq("establishment_id", establishmentId);

  const activeCards = cardStats?.filter((c) => c.status === "active").length ?? 0;
  const rewardsPending = cardStats?.filter((c) => c.status === "reward_pending").length ?? 0;

  // Get rewards used this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: rewardsUsedThisMonth } = await supabase
    .from("loyalty_rewards")
    .select("*", { count: "exact", head: true })
    .eq("establishment_id", establishmentId)
    .eq("status", "used")
    .gte("used_at", startOfMonth.toISOString());

  // Get recent activity (without user join due to no FK)
  const { data: recentStamps } = await supabase
    .from("loyalty_stamps")
    .select(`
      created_at,
      user_id,
      program:loyalty_programs(name)
    `)
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Fetch user names for recent stamps
  const recentUserIds = [...new Set((recentStamps ?? []).map((s) => s.user_id))];
  const recentUserMap = new Map<string, string>();
  if (recentUserIds.length > 0) {
    const { data: recentUsers } = await supabase
      .from("consumer_users")
      .select("id, full_name")
      .in("id", recentUserIds);
    for (const u of recentUsers ?? []) {
      recentUserMap.set(u.id, u.full_name || "Utilisateur");
    }
  }

  const recentActivity = (recentStamps ?? []).map((s) => ({
    type: "stamp" as const,
    user_name: recentUserMap.get(s.user_id) ?? "Utilisateur",
    program_name: ((s.program as unknown) as { name: string } | null)?.name ?? "Programme",
    timestamp: s.created_at,
  }));

  res.json({
    ok: true,
    stats: {
      programs: programs ?? [],
      total_active_cards: activeCards,
      total_rewards_pending: rewardsPending,
      total_rewards_used_this_month: rewardsUsedThisMonth ?? 0,
      recent_activity: recentActivity,
    },
  });
};

// =============================================================================
// PRO: ADD STAMP (via scanner)
// =============================================================================

export const addLoyaltyStamp: RequestHandler = async (req, res) => {
  const establishmentId = asString(req.params.establishmentId);
  if (!establishmentId) return res.status(400).json({ error: "establishmentId required" });

  const token = parseBearerToken(req.header("authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (authFailed(userResult)) return res.status(userResult.status).json({ error: userResult.error });

  const roleResult = await ensureProRole({ establishmentId, userId: userResult.user.id });
  if (roleFailed(roleResult)) return res.status(roleResult.status).json({ error: roleResult.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const consumerId = asString(req.body.user_id);
  const programId = asString(req.body.program_id);
  const stampType = asString(req.body.stamp_type) ?? "regular";
  const source = asString(req.body.source) ?? "scan";
  const offlineId = asString(req.body.offline_id);
  const notes = asString(req.body.notes);

  if (!consumerId) return res.status(400).json({ error: "user_id required" });

  const supabase = getAdminSupabase();

  // Get the user's name for audit
  const { data: staffUser } = await supabase
    .from("consumer_users")
    .select("full_name")
    .eq("id", userResult.user.id)
    .maybeSingle();

  // If offline_id provided, check if already synced
  if (offlineId) {
    const { data: existing } = await supabase
      .from("loyalty_stamps")
      .select("id")
      .eq("offline_id", offlineId)
      .maybeSingle();

    if (existing) {
      return res.json({ ok: true, already_synced: true, stamp_id: existing.id });
    }
  }

  // Get active programs for this establishment
  let programs: Array<{ id: string; name: string; stamps_required: number; reward_type: string; reward_value: string | null; reward_description: string; reward_validity_days: number; conditions: string | null }>;

  if (programId) {
    const { data } = await supabase
      .from("loyalty_programs")
      .select("id, name, stamps_required, reward_type, reward_value, reward_description, reward_validity_days, conditions")
      .eq("id", programId)
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .maybeSingle();

    if (!data) return res.status(404).json({ error: "Program not found" });
    programs = [data];
  } else {
    const { data } = await supabase
      .from("loyalty_programs")
      .select("id, name, stamps_required, reward_type, reward_value, reward_description, reward_validity_days, conditions")
      .eq("establishment_id", establishmentId)
      .eq("is_active", true);

    programs = data ?? [];
  }

  if (programs.length === 0) {
    return res.status(404).json({ error: "No active loyalty programs" });
  }

  const results: Array<{
    program_id: string;
    program_name: string;
    card: unknown;
    stamp: unknown;
    reward_unlocked: boolean;
    reward?: unknown;
  }> = [];

  for (const program of programs) {
    // Get or create card for this user/program
    let { data: card } = await supabase
      .from("loyalty_cards")
      .select("*")
      .eq("user_id", consumerId)
      .eq("program_id", program.id)
      .eq("status", "active")
      .maybeSingle();

    if (!card) {
      // Get max cycle number for this user/program
      const { data: maxCycle } = await supabase
        .from("loyalty_cards")
        .select("cycle_number")
        .eq("user_id", consumerId)
        .eq("program_id", program.id)
        .order("cycle_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      const cycleNumber = (maxCycle?.cycle_number ?? 0) + 1;

      const { data: newCard, error: createError } = await supabase
        .from("loyalty_cards")
        .insert({
          user_id: consumerId,
          program_id: program.id,
          establishment_id: establishmentId,
          stamps_count: 0,
          status: "active",
          cycle_number: cycleNumber,
        })
        .select("*")
        .single();

      if (createError) {
        console.error("[addLoyaltyStamp] create card error:", createError);
        continue;
      }

      card = newCard;

      // Send welcome notification (async, don't wait)
      void supabase.from("loyalty_notifications").insert({
        user_id: consumerId,
        card_id: card.id,
        notification_type: "welcome",
        channel: "email",
        status: "pending",
      });
    }

    // Add stamp
    const newStampNumber = card.stamps_count + 1;

    const { data: stamp, error: stampError } = await supabase
      .from("loyalty_stamps")
      .insert({
        card_id: card.id,
        user_id: consumerId,
        program_id: program.id,
        establishment_id: establishmentId,
        stamp_number: newStampNumber,
        stamp_type: stampType,
        stamped_by_user_id: userResult.user.id,
        stamped_by_name: staffUser?.full_name ?? null,
        source,
        offline_id: offlineId ?? null,
        synced_at: offlineId ? new Date().toISOString() : null,
        notes,
      })
      .select("*")
      .single();

    if (stampError) {
      console.error("[addLoyaltyStamp] stamp error:", stampError);
      continue;
    }

    // Update card
    const isComplete = newStampNumber >= program.stamps_required;

    const updateData: Record<string, unknown> = {
      stamps_count: newStampNumber,
      last_stamp_at: new Date().toISOString(),
    };

    if (isComplete) {
      updateData.status = "reward_pending";
      updateData.completed_at = new Date().toISOString();
    }

    const { data: updatedCard } = await supabase
      .from("loyalty_cards")
      .update(updateData)
      .eq("id", card.id)
      .select("*")
      .single();

    let reward = null;

    // Create reward if complete
    if (isComplete) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + program.reward_validity_days);

      const { data: newReward } = await supabase
        .from("loyalty_rewards")
        .insert({
          card_id: card.id,
          user_id: consumerId,
          program_id: program.id,
          establishment_id: establishmentId,
          reward_code: generateRewardCode(),
          reward_type: program.reward_type,
          reward_value: program.reward_value,
          reward_description: program.reward_description,
          conditions: program.conditions,
          status: "active",
          expires_at: expiresAt.toISOString(),
        })
        .select("*")
        .single();

      reward = newReward;

      // Send card complete notification
      void supabase.from("loyalty_notifications").insert({
        user_id: consumerId,
        card_id: card.id,
        reward_id: newReward?.id,
        notification_type: "card_complete",
        channel: "email",
        status: "pending",
      });
    } else if (newStampNumber === Math.floor(program.stamps_required / 2)) {
      // Halfway notification
      void supabase.from("loyalty_notifications").insert({
        user_id: consumerId,
        card_id: card.id,
        notification_type: "halfway",
        channel: "push",
        status: "pending",
      });
    } else if (newStampNumber === program.stamps_required - 1) {
      // Almost complete notification
      void supabase.from("loyalty_notifications").insert({
        user_id: consumerId,
        card_id: card.id,
        notification_type: "almost_complete",
        channel: "push",
        status: "pending",
      });
    }

    results.push({
      program_id: program.id,
      program_name: program.name,
      card: updatedCard,
      stamp,
      reward_unlocked: isComplete,
      reward,
    });
  }

  if (results.length === 0) {
    return res.status(500).json({ error: "Failed to add stamps" });
  }

  const primaryResult = results[0];

  res.json({
    ok: true,
    card: primaryResult.card,
    stamp: primaryResult.stamp,
    reward_unlocked: primaryResult.reward_unlocked,
    reward: primaryResult.reward,
    all_programs: results.length > 1 ? results : undefined,
    message: primaryResult.reward_unlocked
      ? `Carte complète ! Récompense débloquée : ${(primaryResult.reward as { reward_description: string } | null)?.reward_description ?? "Cadeau"}`
      : `Tampon ajouté (${(primaryResult.card as { stamps_count: number })?.stamps_count ?? 1}/${programs[0]?.stamps_required ?? 10})`,
  });
};

// =============================================================================
// PRO: REDEEM REWARD
// =============================================================================

export const redeemLoyaltyReward: RequestHandler = async (req, res) => {
  const establishmentId = asString(req.params.establishmentId);
  const rewardId = asString(req.params.rewardId);

  if (!establishmentId || !rewardId) {
    return res.status(400).json({ error: "establishmentId and rewardId required" });
  }

  const token = parseBearerToken(req.header("authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (authFailed(userResult)) return res.status(userResult.status).json({ error: userResult.error });

  const roleResult = await ensureProRole({ establishmentId, userId: userResult.user.id });
  if (roleFailed(roleResult)) return res.status(roleResult.status).json({ error: roleResult.error });

  const supabase = getAdminSupabase();

  // Get staff name
  const { data: staffUser } = await supabase
    .from("consumer_users")
    .select("full_name")
    .eq("id", userResult.user.id)
    .maybeSingle();

  // Get reward
  const { data: reward, error: rewardError } = await supabase
    .from("loyalty_rewards")
    .select("*, card:loyalty_cards(*), program:loyalty_programs(*)")
    .eq("id", rewardId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (rewardError || !reward) {
    return res.status(404).json({ error: "Reward not found" });
  }

  if (reward.status !== "active") {
    return res.status(400).json({ error: `Reward already ${reward.status}` });
  }

  if (new Date(reward.expires_at) < new Date()) {
    // Update to expired
    await supabase
      .from("loyalty_rewards")
      .update({ status: "expired" })
      .eq("id", rewardId);
    return res.status(400).json({ error: "Reward has expired" });
  }

  // Mark reward as used
  const { data: updatedReward, error: updateError } = await supabase
    .from("loyalty_rewards")
    .update({
      status: "used",
      used_at: new Date().toISOString(),
      used_by_pro_user_id: userResult.user.id,
      used_by_pro_name: staffUser?.full_name ?? null,
    })
    .eq("id", rewardId)
    .select("*")
    .single();

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  // Update card status
  await supabase
    .from("loyalty_cards")
    .update({ status: "reward_used" })
    .eq("id", reward.card_id);

  // Create new card for next cycle
  const card = reward.card as { user_id: string; program_id: string; cycle_number: number } | null;
  const program = reward.program as { id: string } | null;

  let newCard = null;
  if (card && program) {
    const { data } = await supabase
      .from("loyalty_cards")
      .insert({
        user_id: card.user_id,
        program_id: program.id,
        establishment_id: establishmentId,
        stamps_count: 0,
        status: "active",
        cycle_number: card.cycle_number + 1,
      })
      .select("*")
      .single();

    newCard = data;
  }

  res.json({
    ok: true,
    reward: updatedReward,
    new_card: newCard,
    message: "Récompense validée avec succès !",
  });
};

// =============================================================================
// PRO: GET USER LOYALTY INFO (for scanner)
// =============================================================================

export const getUserLoyaltyInfo: RequestHandler = async (req, res) => {
  const establishmentId = asString(req.params.establishmentId);
  const consumerId = asString(req.params.userId);

  if (!establishmentId || !consumerId) {
    return res.status(400).json({ error: "establishmentId and userId required" });
  }

  const token = parseBearerToken(req.header("authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (authFailed(userResult)) return res.status(userResult.status).json({ error: userResult.error });

  const roleResult = await ensureProRole({ establishmentId, userId: userResult.user.id });
  if (roleFailed(roleResult)) return res.status(roleResult.status).json({ error: roleResult.error });

  const supabase = getAdminSupabase();

  // Get user's cards for this establishment
  const { data: cards } = await supabase
    .from("loyalty_cards")
    .select(`
      *,
      program:loyalty_programs(*),
      stamps:loyalty_stamps(*)
    `)
    .eq("user_id", consumerId)
    .eq("establishment_id", establishmentId)
    .in("status", ["active", "reward_pending"])
    .order("created_at", { ascending: false });

  // Get active rewards
  const { data: rewards } = await supabase
    .from("loyalty_rewards")
    .select("*")
    .eq("user_id", consumerId)
    .eq("establishment_id", establishmentId)
    .eq("status", "active");

  // Get active programs for enrollment
  const { data: programs } = await supabase
    .from("loyalty_programs")
    .select("id, name, stamps_required, reward_description, card_design")
    .eq("establishment_id", establishmentId)
    .eq("is_active", true);

  // Find programs user is not enrolled in
  const enrolledProgramIds = new Set((cards ?? []).map((c) => c.program_id));
  const availablePrograms = (programs ?? []).filter((p) => !enrolledProgramIds.has(p.id));

  res.json({
    ok: true,
    cards: cards ?? [],
    active_rewards: rewards ?? [],
    available_programs: availablePrograms,
  });
};

// =============================================================================
// CONSUMER: GET MY LOYALTY CARDS
// =============================================================================

export const getMyLoyaltyCards: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (authFailed(userResult)) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  // Get all cards with full details
  const { data: cards, error } = await supabase
    .from("loyalty_cards")
    .select(`
      *,
      program:loyalty_programs(*),
      establishment:establishments(id, name, slug, logo_url, cover_url, city),
      stamps:loyalty_stamps(*)
    `)
    .eq("user_id", userResult.user.id)
    .order("last_stamp_at", { ascending: false, nullsFirst: false });

  if (error) return res.status(500).json({ error: error.message });

  // Get active rewards
  const { data: rewards } = await supabase
    .from("loyalty_rewards")
    .select(`
      *,
      program:loyalty_programs(*),
      establishment:establishments(id, name, slug, city)
    `)
    .eq("user_id", userResult.user.id)
    .eq("status", "active");

  // Separate active vs completed
  const activeCards = (cards ?? []).filter((c) => c.status === "active" || c.status === "reward_pending");
  const completedCards = (cards ?? []).filter((c) => c.status === "reward_used" || c.status === "expired");

  res.json({
    ok: true,
    active_cards: activeCards,
    completed_cards: completedCards,
    pending_rewards: rewards ?? [],
  });
};

// =============================================================================
// CONSUMER: GET CARD DETAILS
// =============================================================================

export const getMyLoyaltyCardDetails: RequestHandler = async (req, res) => {
  const cardId = asString(req.params.cardId);
  if (!cardId) return res.status(400).json({ error: "cardId required" });

  const token = parseBearerToken(req.header("authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (authFailed(userResult)) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const { data: card, error } = await supabase
    .from("loyalty_cards")
    .select(`
      *,
      program:loyalty_programs(*),
      establishment:establishments(id, name, slug, logo_url, cover_url, city, address),
      stamps:loyalty_stamps(*)
    `)
    .eq("id", cardId)
    .eq("user_id", userResult.user.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!card) return res.status(404).json({ error: "Card not found" });

  // Get active reward if any
  const { data: reward } = await supabase
    .from("loyalty_rewards")
    .select("*")
    .eq("card_id", cardId)
    .eq("status", "active")
    .maybeSingle();

  res.json({
    ok: true,
    card: {
      ...card,
      active_reward: reward ?? null,
    },
  });
};

// =============================================================================
// CONSUMER: GET MY REWARDS
// =============================================================================

export const getMyLoyaltyRewards: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (authFailed(userResult)) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const { data: rewards, error } = await supabase
    .from("loyalty_rewards")
    .select(`
      *,
      program:loyalty_programs(*),
      establishment:establishments(id, name, slug, city)
    `)
    .eq("user_id", userResult.user.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const active = (rewards ?? []).filter((r) => r.status === "active");
  const used = (rewards ?? []).filter((r) => r.status === "used");
  const expired = (rewards ?? []).filter((r) => r.status === "expired");

  res.json({
    ok: true,
    active,
    used,
    expired,
  });
};

// =============================================================================
// PUBLIC: GET ESTABLISHMENT LOYALTY PROGRAMS
// =============================================================================

export const getPublicLoyaltyPrograms: RequestHandler = async (req, res) => {
  const establishmentId = asString(req.params.establishmentId);
  if (!establishmentId) return res.status(400).json({ error: "establishmentId required" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("loyalty_programs")
    .select("id, name, description, stamps_required, reward_description, card_design, conditions")
    .eq("establishment_id", establishmentId)
    .eq("is_active", true);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, programs: data ?? [] });
};

// =============================================================================
// PRO: APPLY RETROACTIVE STAMPS
// =============================================================================

export const applyRetroactiveStamps: RequestHandler = async (req, res) => {
  const establishmentId = asString(req.params.establishmentId);
  const programId = asString(req.params.programId);

  if (!establishmentId || !programId) {
    return res.status(400).json({ error: "establishmentId and programId required" });
  }

  const token = parseBearerToken(req.header("authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (authFailed(userResult)) return res.status(userResult.status).json({ error: userResult.error });

  const roleResult = await ensureProRole({
    establishmentId,
    userId: userResult.user.id,
    requiredRoles: ["owner", "manager"],
  });
  if (roleFailed(roleResult)) return res.status(roleResult.status).json({ error: roleResult.error });

  const supabase = getAdminSupabase();

  // Get program
  const { data: program } = await supabase
    .from("loyalty_programs")
    .select("*")
    .eq("id", programId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (!program) return res.status(404).json({ error: "Program not found" });
  if (!program.allow_retroactive_stamps) {
    return res.status(400).json({ error: "Retroactive stamps not enabled for this program" });
  }

  // Get past reservations that were honored
  const fromDate = program.retroactive_from_date || "2020-01-01";

  const { data: reservations } = await supabase
    .from("reservations")
    .select("id, user_id, starts_at")
    .eq("establishment_id", establishmentId)
    .in("status", ["confirmed", "completed"])
    .not("checked_in_at", "is", null)
    .gte("starts_at", fromDate)
    .order("starts_at", { ascending: true });

  if (!reservations || reservations.length === 0) {
    return res.json({ ok: true, stamps_added: 0, message: "No eligible reservations found" });
  }

  // Group by user
  const userReservations = new Map<string, string[]>();
  for (const r of reservations) {
    if (!r.user_id) continue;
    const existing = userReservations.get(r.user_id) ?? [];
    existing.push(r.id);
    userReservations.set(r.user_id, existing);
  }

  let totalStampsAdded = 0;

  for (const [userId, resIds] of userReservations) {
    // Check if user already has a card
    const { data: existingCard } = await supabase
      .from("loyalty_cards")
      .select("id")
      .eq("user_id", userId)
      .eq("program_id", programId)
      .maybeSingle();

    if (existingCard) continue; // Skip users who already have cards

    // Create card with retroactive stamps
    const stampsToAdd = Math.min(resIds.length, program.stamps_required);

    const { data: newCard } = await supabase
      .from("loyalty_cards")
      .insert({
        user_id: userId,
        program_id: programId,
        establishment_id: establishmentId,
        stamps_count: stampsToAdd,
        status: stampsToAdd >= program.stamps_required ? "reward_pending" : "active",
        cycle_number: 1,
        completed_at: stampsToAdd >= program.stamps_required ? new Date().toISOString() : null,
        last_stamp_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (!newCard) continue;

    // Add stamp records
    const stampRecords = resIds.slice(0, stampsToAdd).map((resId, idx) => ({
      card_id: newCard.id,
      user_id: userId,
      program_id: programId,
      establishment_id: establishmentId,
      stamp_number: idx + 1,
      stamp_type: "retroactive",
      source: "retroactive",
      reservation_id: resId,
      stamped_by_user_id: userResult.user.id,
      notes: "Tampon rétroactif",
    }));

    await supabase.from("loyalty_stamps").insert(stampRecords);

    totalStampsAdded += stampsToAdd;

    // Create reward if complete
    if (stampsToAdd >= program.stamps_required) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + program.reward_validity_days);

      await supabase.from("loyalty_rewards").insert({
        card_id: newCard.id,
        user_id: userId,
        program_id: programId,
        establishment_id: establishmentId,
        reward_code: generateRewardCode(),
        reward_type: program.reward_type,
        reward_value: program.reward_value,
        reward_description: program.reward_description,
        conditions: program.conditions,
        status: "active",
        expires_at: expiresAt.toISOString(),
      });
    }
  }

  res.json({
    ok: true,
    stamps_added: totalStampsAdded,
    users_processed: userReservations.size,
    message: `${totalStampsAdded} tampons rétroactifs ajoutés pour ${userReservations.size} clients`,
  });
};
