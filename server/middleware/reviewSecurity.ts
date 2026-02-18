/**
 * Review Security Middleware
 *
 * Anti-fraud and content sanitization utilities for the reviews system.
 *
 * Exports:
 *  - sanitizeReviewContent()  — Strip HTML/scripts, normalize whitespace
 *  - detectSpamPatterns()     — Detect spammy review content
 *  - checkReviewCooldown()    — Ensure minimum time between reviews per user
 *  - checkVoteBurst()         — Detect vote-bombing behaviour
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { getClientIp } from "./rateLimiter";

// =============================================================================
// CONTENT SANITIZATION
// =============================================================================

/**
 * Strip dangerous content from text (HTML tags, scripts, encoded entities)
 */
export function sanitizeText(input: string): string {
  let text = input;

  // Strip HTML tags
  text = text.replace(/<[^>]*>/g, "");

  // Strip common HTML entities that could indicate injection
  text = text.replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/");

  // Re-strip any tags produced by entity decode
  text = text.replace(/<[^>]*>/g, "");

  // Strip null bytes
  text = text.replace(/\0/g, "");

  // Normalize excessive whitespace / newlines (keep max 2 consecutive newlines)
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]{3,}/g, "  ");

  return text.trim();
}

/**
 * Express middleware that sanitizes text fields in req.body
 * Fields: comment, message, reason, content
 */
export const sanitizeReviewBody: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body && typeof req.body === "object") {
    const textFields = ["comment", "message", "reason", "content"];
    for (const field of textFields) {
      if (typeof req.body[field] === "string") {
        req.body[field] = sanitizeText(req.body[field]);
      }
    }
  }
  next();
};

// =============================================================================
// SPAM DETECTION
// =============================================================================

/** Common spam patterns in reviews (case-insensitive) */
const SPAM_PATTERNS: RegExp[] = [
  // URLs (non-brand links in reviews are suspicious)
  /https?:\/\/[^\s]{20,}/gi,
  // Excessive punctuation
  /[!?]{5,}/g,
  // ALL CAPS sentences (more than 30 consecutive uppercase chars)
  /[A-Z\s]{30,}/g,
  // Repeated words (same word 5+ times)
  /\b(\w{3,})\b(?:\s+\1\b){4,}/gi,
  // Common spam phrases (FR)
  /gagnez de l'argent/gi,
  /cliquez ici/gi,
  /offre exceptionnelle/gi,
  /promotion exclusive/gi,
  // Common spam phrases (EN)
  /click here/gi,
  /buy now/gi,
  /make money/gi,
  /free trial/gi,
  // Excessive emojis (more than 10)
  /(?:[\u{1F600}-\u{1F64F}][\s]*){10,}/u,
  // Phone number patterns (likely advertising)
  /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,6}/g,
  // Email addresses in review body
  /[\w.+-]+@[\w-]+\.[\w.]+/g,
];

export interface SpamCheckResult {
  isSpam: boolean;
  score: number; // 0-1, higher = more likely spam
  reasons: string[];
}

/**
 * Analyze text for spam patterns.
 * Returns a score (0 = clean, 1 = definitely spam).
 * Score >= 0.6 is flagged as spam.
 */
export function detectSpamPatterns(text: string): SpamCheckResult {
  const reasons: string[] = [];
  let score = 0;

  // Check for very short text (after trimming)
  const trimmed = text.trim();
  if (trimmed.length < 50) {
    // This should be caught by validation, but double-check
    reasons.push("text_too_short");
    score += 0.3;
  }

  // Check each spam pattern
  for (const pattern of SPAM_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    const matches = trimmed.match(pattern);
    if (matches && matches.length > 0) {
      reasons.push(`pattern:${pattern.source.substring(0, 30)}`);
      score += 0.15 * matches.length;
    }
  }

  // Repetition of the same character more than 5 times
  if (/(.)\1{5,}/g.test(trimmed)) {
    reasons.push("char_repetition");
    score += 0.2;
  }

  // Extremely uniform word length (all 3-letter words → likely gibberish)
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  if (words.length > 10) {
    const lengths = words.map((w) => w.length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + (b - avgLen) ** 2, 0) / lengths.length;
    if (variance < 0.5) {
      reasons.push("low_word_variance");
      score += 0.25;
    }
  }

  // Cap at 1
  score = Math.min(1, score);

  return {
    isSpam: score >= 0.6,
    score: Math.round(score * 100) / 100,
    reasons,
  };
}

// =============================================================================
// REVIEW COOLDOWN CHECK
// =============================================================================

/**
 * Minimum hours between reviews from same user
 * (even across different establishments / reservations)
 */
const MIN_REVIEW_INTERVAL_HOURS = 1;

/**
 * Maximum reviews per user per 24h
 */
const MAX_REVIEWS_PER_DAY = 5;

/**
 * Check if the user has submitted reviews too fast.
 * Returns null if OK, or an error string if blocked.
 */
export async function checkReviewCooldown(userId: string): Promise<string | null> {
  const supabase = getAdminSupabase();

  try {
    // Check last review timestamp
    const { data: lastReview } = await supabase
      .from("reviews")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (lastReview) {
      const lastTime = new Date(lastReview.created_at).getTime();
      const minInterval = MIN_REVIEW_INTERVAL_HOURS * 60 * 60 * 1000;
      if (Date.now() - lastTime < minInterval) {
        return "Veuillez patienter avant de soumettre un nouvel avis.";
      }
    }

    // Check daily limit
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneDayAgo);

    if ((count ?? 0) >= MAX_REVIEWS_PER_DAY) {
      return "Vous avez atteint la limite quotidienne d'avis. Réessayez demain.";
    }

    return null; // No issues
  } catch {
    // On error, allow the review (don't block on failed checks)
    return null;
  }
}

// =============================================================================
// VOTE BURST DETECTION
// =============================================================================

/**
 * In-memory tracker for vote bursts per IP.
 * Detects patterns like voting on many reviews of the same establishment
 * in a short time (potential coordinated voting).
 */
const voteTracker = new Map<string, { reviewIds: Set<string>; establishmentVotes: Map<string, number>; resetAt: number }>();

// Cleanup every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of voteTracker.entries()) {
    if (entry.resetAt <= now) voteTracker.delete(key);
  }
}, 10 * 60 * 1000);

/**
 * Max votes on the same establishment's reviews in a 30-min window
 */
const MAX_VOTES_PER_ESTABLISHMENT_WINDOW = 10;

/**
 * Track a vote and detect vote-bombing.
 * Returns null if OK, or an error string if blocked.
 */
export function checkVoteBurst(
  ip: string,
  reviewId: string,
  establishmentId: string,
): string | null {
  const now = Date.now();
  const windowMs = 30 * 60 * 1000; // 30 minutes

  let entry = voteTracker.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { reviewIds: new Set(), establishmentVotes: new Map(), resetAt: now + windowMs };
    voteTracker.set(ip, entry);
  }

  entry.reviewIds.add(reviewId);

  const estCount = (entry.establishmentVotes.get(establishmentId) ?? 0) + 1;
  entry.establishmentVotes.set(establishmentId, estCount);

  if (estCount > MAX_VOTES_PER_ESTABLISHMENT_WINDOW) {
    return "Vous avez voté trop souvent sur les avis de cet établissement. Veuillez patienter.";
  }

  return null;
}

// =============================================================================
// DUPLICATE CONTENT DETECTION
// =============================================================================

/**
 * Generate a simple hash of text for duplicate detection.
 * Normalizes text before hashing (lowercase, strip punctuation, collapse whitespace).
 */
export function textFingerprint(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Simple string hash (djb2)
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) & 0xffffffff;
  }
  return hash.toString(36);
}

/**
 * Check if a very similar review has already been submitted by this user.
 * Returns null if OK, or an error string if duplicate detected.
 */
export async function checkDuplicateContent(
  userId: string,
  comment: string,
): Promise<string | null> {
  const supabase = getAdminSupabase();
  const fingerprint = textFingerprint(comment);

  try {
    // Get user's recent reviews (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentReviews } = await supabase
      .from("reviews")
      .select("comment")
      .eq("user_id", userId)
      .gte("created_at", thirtyDaysAgo)
      .limit(20);

    if (!recentReviews || recentReviews.length === 0) return null;

    for (const review of recentReviews) {
      if (textFingerprint(review.comment) === fingerprint) {
        return "Ce commentaire est très similaire à un avis que vous avez déjà soumis.";
      }
    }

    return null;
  } catch {
    return null; // Don't block on errors
  }
}
