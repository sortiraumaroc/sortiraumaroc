/**
 * Banner Logic — CRUD, eligibility resolution, tracking, stats
 *
 * Supports 6 banner types: image_simple, image_text, video, form, carousel, countdown.
 * 4 display formats: modal, bottom_sheet, top_banner, floating.
 * Audience targeting via shared audienceSegmentService.
 *
 * Key rules:
 *   - Max 1 banner per session (priority-based)
 *   - Frequency: once / daily / weekly / every_session
 *   - Close button always visible (max 3s delay)
 *   - XSS prevention on all content
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { getAudienceUserIds } from "./audienceSegmentService";
import { emitAdminNotification } from "./adminNotifications";
import type {
  Banner,
  BannerType,
  BannerDisplayFormat,
  BannerAnimation,
  BannerCloseBehavior,
  BannerAppearDelayType,
  BannerTrigger,
  BannerFrequency,
  BannerPlatform,
  BannerStatus,
  BannerAction,
  BannerCtaTarget,
  AudienceFilters,
  BannerFormField,
  CarouselSlide,
} from "../shared/notificationsBannersWheelTypes";
import { LIMITS } from "../shared/notificationsBannersWheelTypes";

// =============================================================================
// Types
// =============================================================================

export interface CreateBannerInput {
  internal_name: string;
  type: BannerType;
  title?: string;
  subtitle?: string;
  media_url?: string;
  media_type?: "image" | "video";
  cta_text: string;
  cta_url: string;
  cta_target?: BannerCtaTarget;
  secondary_cta_text?: string;
  secondary_cta_url?: string;
  carousel_slides?: CarouselSlide[];
  countdown_target?: string;
  form_fields?: BannerFormField[];
  form_confirmation_message?: string;
  form_notify_email?: string;
  display_format: BannerDisplayFormat;
  animation?: BannerAnimation;
  overlay_color?: string;
  overlay_opacity?: number;
  close_behavior?: BannerCloseBehavior;
  close_delay_seconds?: number;
  appear_delay_type?: BannerAppearDelayType;
  appear_delay_value?: number;
  audience_type: "all" | "segment";
  audience_filters?: AudienceFilters;
  trigger: BannerTrigger;
  trigger_page?: string;
  frequency: BannerFrequency;
  start_date: string;
  end_date: string;
  priority?: number;
  platform?: BannerPlatform;
  created_by?: string;
}

export interface UpdateBannerInput {
  internal_name?: string;
  type?: BannerType;
  title?: string | null;
  subtitle?: string | null;
  media_url?: string | null;
  media_type?: "image" | "video" | null;
  cta_text?: string;
  cta_url?: string;
  cta_target?: BannerCtaTarget;
  secondary_cta_text?: string | null;
  secondary_cta_url?: string | null;
  carousel_slides?: CarouselSlide[] | null;
  countdown_target?: string | null;
  form_fields?: BannerFormField[] | null;
  form_confirmation_message?: string | null;
  form_notify_email?: string | null;
  display_format?: BannerDisplayFormat;
  animation?: BannerAnimation;
  overlay_color?: string;
  overlay_opacity?: number;
  close_behavior?: BannerCloseBehavior;
  close_delay_seconds?: number;
  appear_delay_type?: BannerAppearDelayType;
  appear_delay_value?: number;
  audience_type?: "all" | "segment";
  audience_filters?: AudienceFilters;
  trigger?: BannerTrigger;
  trigger_page?: string | null;
  frequency?: BannerFrequency;
  start_date?: string;
  end_date?: string;
  priority?: number;
  platform?: BannerPlatform;
}

export interface BannerEligibilityContext {
  userId?: string;
  sessionId: string;
  platform: "web" | "mobile";
  trigger: BannerTrigger;
  page?: string;
}

export interface BannerStats {
  impressions: number;
  clicks: number;
  closes: number;
  form_submissions: number;
  ctr: number; // click-through rate
  close_rate: number;
}

// =============================================================================
// CRUD
// =============================================================================

/**
 * Create a new banner (draft status).
 */
export async function createBanner(input: CreateBannerInput): Promise<{ ok: boolean; banner?: Banner; error?: string }> {
  const supabase = getAdminSupabase();

  // Validate
  const validation = validateBannerInput(input);
  if (!validation.ok) return { ok: false, error: validation.error };

  // Enforce close_delay_seconds max 3s
  const closeDelay = Math.min(input.close_delay_seconds ?? 0, 3);

  const { data, error } = await supabase
    .from("banners")
    .insert({
      internal_name: input.internal_name,
      type: input.type,
      title: input.title ?? null,
      subtitle: input.subtitle ?? null,
      media_url: input.media_url ?? null,
      media_type: input.media_type ?? null,
      cta_text: input.cta_text,
      cta_url: input.cta_url,
      cta_target: input.cta_target ?? "same_tab",
      secondary_cta_text: input.secondary_cta_text ?? null,
      secondary_cta_url: input.secondary_cta_url ?? null,
      carousel_slides: input.carousel_slides ?? null,
      countdown_target: input.countdown_target ?? null,
      form_fields: input.form_fields ?? null,
      form_confirmation_message: input.form_confirmation_message ?? null,
      form_notify_email: input.form_notify_email ?? null,
      display_format: input.display_format,
      animation: input.animation ?? "fade",
      overlay_color: input.overlay_color ?? "#000000",
      overlay_opacity: input.overlay_opacity ?? 50,
      close_behavior: input.close_behavior ?? "always_visible",
      close_delay_seconds: closeDelay,
      appear_delay_type: input.appear_delay_type ?? "immediate",
      appear_delay_value: input.appear_delay_value ?? 0,
      audience_type: input.audience_type,
      audience_filters: input.audience_type === "segment" ? (input.audience_filters ?? {}) : {},
      trigger: input.trigger,
      trigger_page: input.trigger_page ?? null,
      frequency: input.frequency,
      start_date: input.start_date,
      end_date: input.end_date,
      priority: Math.max(LIMITS.BANNER_PRIORITY_MIN, Math.min(input.priority ?? 5, LIMITS.BANNER_PRIORITY_MAX)),
      platform: input.platform ?? "both",
      status: "draft" as BannerStatus,
      created_by: input.created_by ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[Banner] createBanner error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, banner: data as Banner };
}

/**
 * Update a banner (draft or paused only).
 */
export async function updateBanner(
  bannerId: string,
  input: UpdateBannerInput,
): Promise<{ ok: boolean; banner?: Banner; error?: string }> {
  const supabase = getAdminSupabase();

  const { data: existing, error: fetchErr } = await supabase
    .from("banners")
    .select("status")
    .eq("id", bannerId)
    .single();

  if (fetchErr || !existing) return { ok: false, error: "Bannière introuvable" };
  if (existing.status !== "draft" && existing.status !== "paused") {
    return { ok: false, error: "Seules les bannières brouillon ou en pause peuvent être modifiées" };
  }

  // Build update payload (only defined fields)
  const updatePayload: Record<string, unknown> = {};
  const fields = [
    "internal_name", "type", "title", "subtitle", "media_url", "media_type",
    "cta_text", "cta_url", "cta_target", "secondary_cta_text", "secondary_cta_url",
    "carousel_slides", "countdown_target", "form_fields", "form_confirmation_message",
    "form_notify_email", "display_format", "animation", "overlay_color", "overlay_opacity",
    "close_behavior", "close_delay_seconds", "appear_delay_type", "appear_delay_value",
    "audience_type", "audience_filters", "trigger", "trigger_page", "frequency",
    "start_date", "end_date", "priority", "platform",
  ];

  for (const field of fields) {
    if ((input as Record<string, unknown>)[field] !== undefined) {
      updatePayload[field] = (input as Record<string, unknown>)[field];
    }
  }

  // Enforce max 3s close delay
  if (updatePayload.close_delay_seconds !== undefined) {
    updatePayload.close_delay_seconds = Math.min(updatePayload.close_delay_seconds as number, 3);
  }

  // Enforce priority bounds
  if (updatePayload.priority !== undefined) {
    updatePayload.priority = Math.max(LIMITS.BANNER_PRIORITY_MIN, Math.min(updatePayload.priority as number, LIMITS.BANNER_PRIORITY_MAX));
  }

  updatePayload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("banners")
    .update(updatePayload)
    .eq("id", bannerId)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, banner: data as Banner };
}

/**
 * Duplicate a banner (creates a new draft copy).
 */
export async function duplicateBanner(bannerId: string): Promise<{ ok: boolean; banner?: Banner; error?: string }> {
  const supabase = getAdminSupabase();

  const { data: original, error: fetchErr } = await supabase
    .from("banners")
    .select("*")
    .eq("id", bannerId)
    .single();

  if (fetchErr || !original) return { ok: false, error: "Bannière introuvable" };

  const orig = original as Banner;

  // Create copy with reset stats and status
  const { data, error } = await supabase
    .from("banners")
    .insert({
      internal_name: `${orig.internal_name} (copie)`,
      type: orig.type,
      title: orig.title,
      subtitle: orig.subtitle,
      media_url: orig.media_url,
      media_type: orig.media_type,
      cta_text: orig.cta_text,
      cta_url: orig.cta_url,
      cta_target: orig.cta_target,
      secondary_cta_text: orig.secondary_cta_text,
      secondary_cta_url: orig.secondary_cta_url,
      carousel_slides: orig.carousel_slides,
      countdown_target: orig.countdown_target,
      form_fields: orig.form_fields,
      form_confirmation_message: orig.form_confirmation_message,
      form_notify_email: orig.form_notify_email,
      display_format: orig.display_format,
      animation: orig.animation,
      overlay_color: orig.overlay_color,
      overlay_opacity: orig.overlay_opacity,
      close_behavior: orig.close_behavior,
      close_delay_seconds: orig.close_delay_seconds,
      appear_delay_type: orig.appear_delay_type,
      appear_delay_value: orig.appear_delay_value,
      audience_type: orig.audience_type,
      audience_filters: orig.audience_filters,
      trigger: orig.trigger,
      trigger_page: orig.trigger_page,
      frequency: orig.frequency,
      start_date: orig.start_date,
      end_date: orig.end_date,
      priority: orig.priority,
      platform: orig.platform,
      status: "draft",
      created_by: orig.created_by,
      stats_impressions: 0,
      stats_clicks: 0,
      stats_closes: 0,
      stats_form_submissions: 0,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, banner: data as Banner };
}

// =============================================================================
// Status transitions
// =============================================================================

export async function activateBanner(bannerId: string): Promise<{ ok: boolean; error?: string }> {
  return updateBannerStatus(bannerId, "active", ["draft", "paused"]);
}

export async function pauseBanner(bannerId: string): Promise<{ ok: boolean; error?: string }> {
  return updateBannerStatus(bannerId, "paused", ["active"]);
}

export async function disableBanner(bannerId: string): Promise<{ ok: boolean; error?: string }> {
  return updateBannerStatus(bannerId, "disabled", ["draft", "active", "paused"]);
}

async function updateBannerStatus(
  bannerId: string,
  newStatus: BannerStatus,
  allowedFrom: BannerStatus[],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  const { data: existing, error: fetchErr } = await supabase
    .from("banners")
    .select("status")
    .eq("id", bannerId)
    .single();

  if (fetchErr || !existing) return { ok: false, error: "Bannière introuvable" };
  if (!allowedFrom.includes(existing.status as BannerStatus)) {
    return { ok: false, error: `Transition de ${existing.status} vers ${newStatus} non autorisée` };
  }

  const { error } = await supabase
    .from("banners")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", bannerId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// =============================================================================
// Eligibility resolution
// =============================================================================

/**
 * Get the single most eligible banner for a user/session.
 *
 * Resolution flow:
 *   1. Filter: status=active, within date range
 *   2. Filter: platform match
 *   3. Filter: trigger match
 *   4. Filter: audience (all or segment via audienceSegmentService)
 *   5. Filter: frequency (check banner_views for this user)
 *   6. Sort: priority DESC
 *   7. Return top 1
 */
export async function getEligibleBanner(
  context: BannerEligibilityContext,
): Promise<{ ok: boolean; banner?: Banner }> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  // 1. Get active banners within date range
  let query = supabase
    .from("banners")
    .select("*")
    .eq("status", "active")
    .lte("start_date", now)
    .gte("end_date", now);

  // 2. Platform filter
  query = query.in("platform", [context.platform, "both"]);

  // 3. Trigger filter
  query = query.eq("trigger", context.trigger);
  if (context.trigger === "on_page" && context.page) {
    query = query.eq("trigger_page", context.page);
  }

  // Sort by priority DESC
  query = query.order("priority", { ascending: false }).limit(20);

  const { data: banners, error } = await query;
  if (error || !banners || banners.length === 0) return { ok: true };

  const candidates = banners as Banner[];

  // 4. Audience filter
  let eligible: Banner[] = [];
  for (const banner of candidates) {
    if (banner.audience_type === "all") {
      eligible.push(banner);
      continue;
    }

    // Segment check
    if (context.userId) {
      const filters = banner.audience_filters as AudienceFilters;
      const matchingIds = await getAudienceUserIds(filters, { limit: 1 });
      // Check if this specific user matches
      const allMatchingIds = await getAudienceUserIds(filters, { limit: 50000 });
      if (allMatchingIds.includes(context.userId)) {
        eligible.push(banner);
      }
    }
    // Anonymous users only see "all" banners
  }

  if (eligible.length === 0) return { ok: true };

  // 5. Frequency filter
  const finalCandidates: Banner[] = [];
  for (const banner of eligible) {
    const allowed = await checkFrequency(banner, context.userId, context.sessionId);
    if (allowed) {
      finalCandidates.push(banner);
    }
  }

  if (finalCandidates.length === 0) return { ok: true };

  // 6. Return highest priority
  return { ok: true, banner: finalCandidates[0] };
}

/**
 * Check if banner can be shown based on frequency rules.
 */
async function checkFrequency(
  banner: Banner,
  userId: string | undefined,
  sessionId: string,
): Promise<boolean> {
  if (banner.frequency === "every_session") return true;

  const supabase = getAdminSupabase();
  const identifier = userId ?? sessionId;
  const identifierCol = userId ? "user_id" : "session_id";

  if (banner.frequency === "once") {
    // Check if user/session has ever seen this banner
    const { count } = await supabase
      .from("banner_views")
      .select("id", { count: "exact", head: true })
      .eq("banner_id", banner.id)
      .eq(identifierCol, identifier)
      .eq("action", "view");

    return (count ?? 0) === 0;
  }

  if (banner.frequency === "daily") {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("banner_views")
      .select("id", { count: "exact", head: true })
      .eq("banner_id", banner.id)
      .eq(identifierCol, identifier)
      .eq("action", "view")
      .gte("created_at", todayStart.toISOString());

    return (count ?? 0) === 0;
  }

  if (banner.frequency === "weekly") {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { count } = await supabase
      .from("banner_views")
      .select("id", { count: "exact", head: true })
      .eq("banner_id", banner.id)
      .eq(identifierCol, identifier)
      .eq("action", "view")
      .gte("created_at", weekAgo.toISOString());

    return (count ?? 0) === 0;
  }

  return true;
}

// =============================================================================
// Tracking
// =============================================================================

/**
 * Track a banner action (view, click, close, form_submit).
 */
export async function trackBannerAction(
  bannerId: string,
  userId: string | null,
  sessionId: string,
  action: BannerAction,
): Promise<{ ok: boolean }> {
  const supabase = getAdminSupabase();

  // Insert view record
  const { error: viewErr } = await supabase.from("banner_views").insert({
    banner_id: bannerId,
    user_id: userId,
    session_id: sessionId,
    action,
  });

  if (viewErr) {
    console.error("[Banner] trackBannerAction insert error:", viewErr.message);
    return { ok: false };
  }

  // Increment stats counter on banner
  const statColumn = getStatColumn(action);
  if (statColumn) {
    void incrementBannerStat(bannerId, statColumn);
  }

  return { ok: true };
}

function getStatColumn(action: BannerAction): string | null {
  switch (action) {
    case "view": return "stats_impressions";
    case "click": return "stats_clicks";
    case "close": return "stats_closes";
    case "form_submit": return "stats_form_submissions";
    default: return null;
  }
}

async function incrementBannerStat(bannerId: string, column: string): Promise<void> {
  const supabase = getAdminSupabase();

  const { data } = await supabase
    .from("banners")
    .select(column)
    .eq("id", bannerId)
    .single();

  if (!data) return;

  const row = data as unknown as Record<string, unknown>;
  const currentVal = typeof row[column] === "number" ? (row[column] as number) : 0;

  await supabase
    .from("banners")
    .update({ [column]: currentVal + 1 })
    .eq("id", bannerId);
}

// =============================================================================
// Stats
// =============================================================================

/**
 * Get banner stats.
 */
export async function getBannerStats(bannerId: string): Promise<{ ok: boolean; stats?: BannerStats; error?: string }> {
  const supabase = getAdminSupabase();

  const { data: banner, error } = await supabase
    .from("banners")
    .select("stats_impressions, stats_clicks, stats_closes, stats_form_submissions")
    .eq("id", bannerId)
    .single();

  if (error || !banner) return { ok: false, error: "Bannière introuvable" };

  const b = banner as { stats_impressions: number; stats_clicks: number; stats_closes: number; stats_form_submissions: number };

  return {
    ok: true,
    stats: {
      impressions: b.stats_impressions,
      clicks: b.stats_clicks,
      closes: b.stats_closes,
      form_submissions: b.stats_form_submissions,
      ctr: b.stats_impressions > 0 ? Math.round((b.stats_clicks / b.stats_impressions) * 10000) / 100 : 0,
      close_rate: b.stats_impressions > 0 ? Math.round((b.stats_closes / b.stats_impressions) * 10000) / 100 : 0,
    },
  };
}

// =============================================================================
// Cron: Expire old banners
// =============================================================================

/**
 * Mark active banners as expired if end_date has passed.
 * Called by cron daily.
 */
export async function expireOldBanners(): Promise<{ expired: number }> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("banners")
    .update({ status: "expired" as BannerStatus, updated_at: now })
    .eq("status", "active")
    .lt("end_date", now)
    .select("id");

  if (error) {
    console.error("[Banner] expireOldBanners error:", error.message);
    return { expired: 0 };
  }

  const count = data?.length ?? 0;
  if (count > 0) {
    console.log(`[Banner] Expired ${count} banners`);
  }

  return { expired: count };
}

// =============================================================================
// Validation
// =============================================================================

function validateBannerInput(input: CreateBannerInput): { ok: boolean; error?: string } {
  if (!input.internal_name || input.internal_name.length > LIMITS.BANNER_INTERNAL_NAME_MAX) {
    return { ok: false, error: `Le nom interne doit faire entre 1 et ${LIMITS.BANNER_INTERNAL_NAME_MAX} caractères` };
  }

  if (input.title && input.title.length > LIMITS.BANNER_TITLE_MAX) {
    return { ok: false, error: `Le titre ne peut pas dépasser ${LIMITS.BANNER_TITLE_MAX} caractères` };
  }

  if (input.subtitle && input.subtitle.length > LIMITS.BANNER_SUBTITLE_MAX) {
    return { ok: false, error: `Le sous-titre ne peut pas dépasser ${LIMITS.BANNER_SUBTITLE_MAX} caractères` };
  }

  if (!input.cta_text || input.cta_text.length > LIMITS.BANNER_CTA_TEXT_MAX) {
    return { ok: false, error: `Le texte CTA doit faire entre 1 et ${LIMITS.BANNER_CTA_TEXT_MAX} caractères` };
  }

  if (!input.cta_url) {
    return { ok: false, error: "L'URL CTA est obligatoire" };
  }

  if (!input.start_date || !input.end_date) {
    return { ok: false, error: "Les dates de début et fin sont obligatoires" };
  }

  if (new Date(input.start_date) >= new Date(input.end_date)) {
    return { ok: false, error: "La date de début doit être avant la date de fin" };
  }

  // Type-specific validation
  if (input.type === "carousel" && (!input.carousel_slides || input.carousel_slides.length < 2)) {
    return { ok: false, error: "Un carrousel doit avoir au moins 2 slides" };
  }

  if (input.type === "countdown" && !input.countdown_target) {
    return { ok: false, error: "Un compte à rebours doit avoir une date cible" };
  }

  if (input.type === "form" && (!input.form_fields || input.form_fields.length === 0)) {
    return { ok: false, error: "Un formulaire doit avoir au moins un champ" };
  }

  return { ok: true };
}
