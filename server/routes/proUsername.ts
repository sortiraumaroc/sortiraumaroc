/**
 * Routes API PRO - Username Management
 *
 * Extracted from the monolithic pro.ts.
 *
 * Endpoints for:
 * - Username availability check
 * - Username retrieval for an establishment
 * - Username request submission & cancellation
 * - Username subscription management (get, start trial, cancel)
 */

import type { RequestHandler } from "express";

import { getAdminSupabase } from "../supabaseAdmin";
import { emitAdminNotification } from "../adminNotifications";
import { createModuleLogger } from "../lib/logger";
import {
  parseBearerToken,
  asString,
} from "./proHelpers";

const log = createModuleLogger("proUsername");

// =============================================================================
// Local constants & helpers
// =============================================================================

const USERNAME_COOLDOWN_DAYS = 180;

function validateUsernameFormat(username: string): { valid: boolean; error?: string } {
  const normalized = username.toLowerCase().trim();

  if (normalized.length < 3) {
    return { valid: false, error: "Le nom d'utilisateur doit contenir au moins 3 caractères" };
  }

  if (normalized.length > 30) {
    return { valid: false, error: "Le nom d'utilisateur ne peut pas dépasser 30 caractères" };
  }

  // Must start with a letter
  if (!/^[a-z]/.test(normalized)) {
    return { valid: false, error: "Le nom d'utilisateur doit commencer par une lettre" };
  }

  // Only lowercase letters, numbers, underscores, and dots
  if (!/^[a-z][a-z0-9._]*$/.test(normalized)) {
    return { valid: false, error: "Seuls les lettres minuscules, chiffres, points et underscores sont autorisés" };
  }

  // Cannot end with underscore or dot
  if (/[._]$/.test(normalized)) {
    return { valid: false, error: "Le nom d'utilisateur ne peut pas se terminer par un point ou underscore" };
  }

  // No consecutive dots or underscores
  if (/\.\./.test(normalized) || /__/.test(normalized) || /\._/.test(normalized) || /_\./.test(normalized)) {
    return { valid: false, error: "Pas de points ou underscores consécutifs" };
  }

  // Reserved usernames
  const reserved = [
    "admin", "administrator", "support", "help", "contact", "info",
    "sortiraumaroc", "sam", "booking", "reservations", "pro", "api",
    "www", "mail", "email", "account", "accounts", "user", "users",
    "settings", "config", "login", "logout", "signup", "signin",
    "register", "password", "reset", "dashboard", "profile", "profiles",
    "establishment", "establishments", "restaurant", "restaurants",
    "hotel", "hotels", "spa", "spas", "activity", "activities",
    "event", "events", "test", "demo", "example", "null", "undefined",
  ];

  if (reserved.includes(normalized)) {
    return { valid: false, error: "Ce nom d'utilisateur est réservé" };
  }

  return { valid: true };
}

import {
  getSubscriptionWithDetails,
  isUsernameAccessAllowed,
  startTrial,
  cancelSubscription,
} from "../subscriptions/usernameSubscription";

// =============================================================================
// Handlers
// =============================================================================

export const checkUsernameAvailability: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const username = asString(req.query.username);
  if (!username) {
    return res.status(400).json({ error: "username is required", available: false });
  }

  const normalized = username.toLowerCase().trim();

  // Validate format
  const validation = validateUsernameFormat(normalized);
  if (!validation.valid) {
    return res.json({ available: false, error: validation.error });
  }

  // Check if already taken by an establishment
  const { data: existingEstablishment } = await supabase
    .from("establishments")
    .select("id")
    .ilike("username", normalized)
    .maybeSingle();

  if (existingEstablishment) {
    return res.json({ available: false, error: "Ce nom d'utilisateur est déjà pris" });
  }

  // Check if pending in moderation queue
  const { data: pendingRequest } = await supabase
    .from("establishment_username_requests")
    .select("id")
    .ilike("requested_username", normalized)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingRequest) {
    return res.json({ available: false, error: "Ce nom d'utilisateur est en cours de validation" });
  }

  return res.json({ available: true });
};

export const getEstablishmentUsername: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this establishment" });
  }

  // Get establishment username info
  const { data: establishment } = await supabase
    .from("establishments")
    .select("username, username_changed_at")
    .eq("id", establishmentId)
    .single();

  if (!establishment) {
    return res.status(404).json({ error: "Establishment not found" });
  }

  // Get pending request if any
  const { data: pendingRequest } = await supabase
    .from("establishment_username_requests")
    .select("id, requested_username, status, created_at, rejection_reason")
    .eq("establishment_id", establishmentId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .maybeSingle();

  // Calculate if can change
  let canChange = true;
  let nextChangeDate: string | null = null;

  if (establishment.username_changed_at) {
    const changedAt = new Date(establishment.username_changed_at);
    const cooldownEnd = new Date(changedAt.getTime() + USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();

    if (now < cooldownEnd) {
      canChange = false;
      nextChangeDate = cooldownEnd.toISOString();
    }
  }

  // If there's a pending request, cannot submit another
  if (pendingRequest) {
    canChange = false;
  }

  // Get subscription status (gracefully handle if table doesn't exist)
  let subscription = null;
  let canUseUsername = false;
  try {
    subscription = await getSubscriptionWithDetails(establishmentId);
    canUseUsername = subscription?.can_use_username ?? false;
  } catch (e) {
    log.warn({ err: e }, "getEstablishmentUsername error fetching subscription");
    // Continue without subscription info
  }

  // Cannot change username without active subscription
  if (!canUseUsername) {
    canChange = false;
  }

  return res.json({
    username: establishment.username,
    usernameChangedAt: establishment.username_changed_at,
    pendingRequest,
    canChange,
    nextChangeDate,
    cooldownDays: USERNAME_COOLDOWN_DAYS,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          is_trial: subscription.is_trial,
          trial_ends_at: subscription.trial_ends_at,
          starts_at: subscription.starts_at,
          expires_at: subscription.expires_at,
          grace_period_ends_at: subscription.grace_period_ends_at,
          cancelled_at: subscription.cancelled_at,
          days_remaining: subscription.days_remaining,
          can_use_username: subscription.can_use_username,
        }
      : null,
    canUseUsername,
  });
};

export const submitUsernameRequest: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);
  const body = req.body as Record<string, unknown>;
  const requestedUsername = asString(body.username);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  if (!requestedUsername) {
    return res.status(400).json({ error: "username is required" });
  }

  const normalized = requestedUsername.toLowerCase().trim();

  // Validate format
  const validation = validateUsernameFormat(normalized);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  // Check membership with edit rights
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || !["owner", "manager"].includes(membership.role)) {
    return res.status(403).json({ error: "Only owners and managers can change username" });
  }

  // Check username subscription is active (gating)
  const hasActiveSubscription = await isUsernameAccessAllowed(establishmentId);
  if (!hasActiveSubscription) {
    return res.status(403).json({
      error: "Un abonnement actif est requis pour utiliser cette fonctionnalite",
      code: "SUBSCRIPTION_REQUIRED",
    });
  }

  // Check establishment exists and cooldown
  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, name, username, username_changed_at")
    .eq("id", establishmentId)
    .single();

  if (!establishment) {
    return res.status(404).json({ error: "Establishment not found" });
  }

  // Check cooldown period
  if (establishment.username_changed_at) {
    const changedAt = new Date(establishment.username_changed_at);
    const cooldownEnd = new Date(changedAt.getTime() + USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();

    if (now < cooldownEnd) {
      const daysRemaining = Math.ceil((cooldownEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      return res.status(400).json({
        error: `Vous devez attendre encore ${daysRemaining} jours avant de pouvoir changer votre nom d'utilisateur`,
      });
    }
  }

  // Check no pending request
  const { data: existingPending } = await supabase
    .from("establishment_username_requests")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPending) {
    return res.status(400).json({ error: "Une demande est déjà en cours de validation" });
  }

  // Check username availability
  const { data: existingUsername } = await supabase
    .from("establishments")
    .select("id")
    .ilike("username", normalized)
    .neq("id", establishmentId)
    .maybeSingle();

  if (existingUsername) {
    return res.status(400).json({ error: "Ce nom d'utilisateur est déjà pris" });
  }

  const { data: pendingUsername } = await supabase
    .from("establishment_username_requests")
    .select("id")
    .ilike("requested_username", normalized)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingUsername) {
    return res.status(400).json({ error: "Ce nom d'utilisateur est en cours de validation par un autre établissement" });
  }

  // Create the request
  const { data: newRequest, error: insertError } = await supabase
    .from("establishment_username_requests")
    .insert({
      establishment_id: establishmentId,
      requested_username: normalized,
      requested_by: userId,
      status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  // Notify admins
  emitAdminNotification({
    type: "username_request",
    title: "Nouvelle demande de nom d'utilisateur",
    body: `${establishment.name || "Un établissement"} demande le nom @${normalized}`,
    data: {
      establishmentId,
      requestId: newRequest.id,
      requestedUsername: normalized,
    },
  });

  return res.json({
    ok: true,
    request: newRequest,
    message: "Votre demande a été envoyée en modération",
  });
};

export const cancelUsernameRequest: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);
  const requestId = asString(req.params.requestId);

  if (!establishmentId || !requestId) {
    return res.status(400).json({ error: "establishmentId and requestId are required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || !["owner", "manager"].includes(membership.role)) {
    return res.status(403).json({ error: "Only owners and managers can cancel requests" });
  }

  // Delete the pending request
  const { error: deleteError } = await supabase
    .from("establishment_username_requests")
    .delete()
    .eq("id", requestId)
    .eq("establishment_id", establishmentId)
    .eq("status", "pending");

  if (deleteError) {
    return res.status(500).json({ error: deleteError.message });
  }

  return res.json({ ok: true, message: "Demande annulée" });
};

// ---------------------------------------------------------------------------
// Username Subscription Management
// ---------------------------------------------------------------------------

export const getUsernameSubscription: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this establishment" });
  }

  const subscription = await getSubscriptionWithDetails(establishmentId);

  // Check if establishment already had a trial
  const { data: previousTrial } = await supabase
    .from("username_subscriptions")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("is_trial", true)
    .limit(1)
    .maybeSingle();

  return res.json({
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          is_trial: subscription.is_trial,
          trial_ends_at: subscription.trial_ends_at,
          starts_at: subscription.starts_at,
          expires_at: subscription.expires_at,
          grace_period_ends_at: subscription.grace_period_ends_at,
          cancelled_at: subscription.cancelled_at,
          price_cents: subscription.price_cents,
          currency: subscription.currency,
          days_remaining: subscription.days_remaining,
          can_use_username: subscription.can_use_username,
        }
      : null,
    can_start_trial: !previousTrial && !subscription,
    has_used_trial: !!previousTrial,
  });
};

export const startUsernameTrialHandler: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  // Check membership with edit rights
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || !["owner", "manager", "marketing"].includes(membership.role)) {
    return res.status(403).json({ error: "Only owners, managers and marketing can start a trial" });
  }

  try {
    const subscription = await startTrial(establishmentId, userId);
    return res.json({
      ok: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        is_trial: subscription.is_trial,
        trial_ends_at: subscription.trial_ends_at,
      },
      message: "Votre essai gratuit de 14 jours est actif !",
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Impossible de demarrer l'essai" });
  }
};

export const cancelUsernameSubscriptionHandler: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  // Check membership with edit rights (owner only for cancel)
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || membership.role !== "owner") {
    return res.status(403).json({ error: "Only owners can cancel subscriptions" });
  }

  try {
    const subscription = await cancelSubscription(establishmentId, userId);
    return res.json({
      ok: true,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            cancelled_at: subscription.cancelled_at,
            expires_at: subscription.expires_at,
          }
        : null,
      message: "L'abonnement reste actif jusqu'a expiration. Vous ne recevrez plus de rappels de renouvellement.",
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Impossible d'annuler l'abonnement" });
  }
};
