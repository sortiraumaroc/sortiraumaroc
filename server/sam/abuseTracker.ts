/**
 * Sam AI — Tracking d'abus et blocage progressif (F11)
 *
 * Stocke l'état d'abus dans sam_conversations.metadata.abuse_state
 * pour éviter une migration SQL.
 *
 * Seuils progressifs :
 *   1-2 off-topic  → réponse canned normale
 *   3              → avertissement dans la réponse
 *   5+             → délai artificiel 3s
 *   8              → blocage 1 heure
 *   15+            → blocage 24 heures
 */

import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("samAbuse");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AbuseState {
  off_topic_count: number;
  warned: boolean;
  blocked_until: string | null; // ISO timestamp
}

export interface AbuseCheckResult {
  allowed: boolean;
  /** Message à afficher si bloqué */
  message?: string;
  /** Avertissement à ajouter à la réponse (non bloquant) */
  warning?: string;
  /** Délai artificiel en ms avant de répondre */
  delayMs?: number;
}

// ---------------------------------------------------------------------------
// Seuils
// ---------------------------------------------------------------------------

const WARN_THRESHOLD = 3;
const DELAY_THRESHOLD = 5;
const DELAY_MS = 3000;
const TEMP_BAN_THRESHOLD = 8;
const TEMP_BAN_HOURS = 1;
const LONG_BAN_THRESHOLD = 15;
const LONG_BAN_HOURS = 24;

// ---------------------------------------------------------------------------
// Cache mémoire (session_id → AbuseState) pour éviter un appel DB à chaque message
// ---------------------------------------------------------------------------

const abuseCache = new Map<string, { state: AbuseState; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(sessionId: string): AbuseState | null {
  const entry = abuseCache.get(sessionId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    abuseCache.delete(sessionId);
    return null;
  }
  return entry.state;
}

function setCache(sessionId: string, state: AbuseState): void {
  abuseCache.set(sessionId, { state, expiresAt: Date.now() + CACHE_TTL_MS });

  // Nettoyage périodique (max 1000 entrées)
  if (abuseCache.size > 1000) {
    const now = Date.now();
    for (const [key, val] of abuseCache) {
      if (now > val.expiresAt) abuseCache.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Vérifie si la session est autorisée à envoyer un message.
 * Retourne aussi un éventuel avertissement ou délai à appliquer.
 */
export async function checkAbuse(sessionId: string): Promise<AbuseCheckResult> {
  try {
    const state = await getAbuseState(sessionId);
    if (!state) return { allowed: true };

    // Vérifier si actuellement bloqué
    if (state.blocked_until) {
      const blockedUntil = new Date(state.blocked_until);
      if (blockedUntil > new Date()) {
        const remaining = Math.ceil((blockedUntil.getTime() - Date.now()) / 60000);
        return {
          allowed: false,
          message: remaining > 60
            ? `Sam est temporairement indisponible pour cette session. Réessaye dans ${Math.ceil(remaining / 60)} heure(s).`
            : `Sam est temporairement indisponible pour cette session. Réessaye dans ${remaining} minute(s).`,
        };
      }
      // Ban expiré — reset le bloc
      state.blocked_until = null;
    }

    // Délai artificiel
    if (state.off_topic_count >= DELAY_THRESHOLD && state.off_topic_count < TEMP_BAN_THRESHOLD) {
      return { allowed: true, delayMs: DELAY_MS };
    }

    // Avertissement
    if (state.off_topic_count >= WARN_THRESHOLD && state.off_topic_count < DELAY_THRESHOLD) {
      return {
        allowed: true,
        warning: "Je suis là pour t'aider à trouver les meilleures adresses au Maroc. Si tu continues à poser des questions hors sujet, je ne pourrai plus t'aider pendant un moment.",
      };
    }

    return { allowed: true };
  } catch (err) {
    log.warn({ err }, "Abuse check failed — allowing by default");
    return { allowed: true };
  }
}

/**
 * Enregistre un comportement abusif (off-topic, rapid-fire).
 * Met à jour l'état et applique les seuils de blocage.
 */
export async function recordAbuse(
  sessionId: string,
  abuseType: "off_topic" | "rapid_fire",
  messagePreview: string,
): Promise<void> {
  try {
    const state = await getAbuseState(sessionId) ?? {
      off_topic_count: 0,
      warned: false,
      blocked_until: null,
    };

    if (abuseType === "off_topic") {
      state.off_topic_count++;
    }

    // Appliquer les seuils de blocage
    if (state.off_topic_count >= LONG_BAN_THRESHOLD) {
      state.blocked_until = new Date(Date.now() + LONG_BAN_HOURS * 3600000).toISOString();
      log.warn({ sessionId, count: state.off_topic_count }, "Long ban applied (24h)");
    } else if (state.off_topic_count >= TEMP_BAN_THRESHOLD) {
      state.blocked_until = new Date(Date.now() + TEMP_BAN_HOURS * 3600000).toISOString();
      log.warn({ sessionId, count: state.off_topic_count }, "Temp ban applied (1h)");
    }

    if (state.off_topic_count >= WARN_THRESHOLD) {
      state.warned = true;
    }

    // Persister dans le cache mémoire
    setCache(sessionId, state);

    // Persister en DB (fire-and-forget) — stocké dans la conversation la plus récente
    void persistAbuseState(sessionId, state);
  } catch (err) {
    log.warn({ err }, "recordAbuse failed");
  }
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

async function getAbuseState(sessionId: string): Promise<AbuseState | null> {
  // Cache first
  const cached = getCached(sessionId);
  if (cached) return cached;

  try {
    const supabase = getAdminSupabase();
    const { data } = await supabase
      .from("sam_conversations")
      .select("metadata")
      .eq("session_id", sessionId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const metadata = (data?.metadata as Record<string, unknown>) ?? {};
    const abuseState = metadata.abuse_state as AbuseState | undefined;

    if (abuseState) {
      setCache(sessionId, abuseState);
    }

    return abuseState ?? null;
  } catch (err) {
    log.warn({ err }, "getAbuseState DB read failed");
    return null;
  }
}

async function persistAbuseState(sessionId: string, state: AbuseState): Promise<void> {
  try {
    const supabase = getAdminSupabase();

    // Trouver la conversation la plus récente pour cette session
    const { data: conv } = await supabase
      .from("sam_conversations")
      .select("id, metadata")
      .eq("session_id", sessionId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv) return;

    const existingMetadata = ((conv as any).metadata as Record<string, unknown>) ?? {};

    await supabase
      .from("sam_conversations")
      .update({
        metadata: { ...existingMetadata, abuse_state: state },
      })
      .eq("id", (conv as any).id);
  } catch (err) {
    log.warn({ err }, "persistAbuseState failed");
  }
}
