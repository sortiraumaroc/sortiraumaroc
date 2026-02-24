/**
 * Système anti-fraude pour les clics publicitaires
 *
 * Détecte et bloque les clics frauduleux :
 * - Clics répétés depuis la même IP
 * - Bots et crawlers
 * - Clics trop rapides
 * - Patterns suspects
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("adsAntifraud");

// =============================================================================
// CONFIGURATION
// =============================================================================

const FRAUD_CONFIG = {
  // Nombre maximum de clics par IP par campagne par heure
  MAX_CLICKS_PER_IP_PER_CAMPAIGN_PER_HOUR: 3,

  // Nombre maximum de clics par IP toutes campagnes confondues par heure
  MAX_CLICKS_PER_IP_PER_HOUR: 10,

  // Délai minimum entre deux clics sur la même campagne (en secondes)
  MIN_CLICK_INTERVAL_SECONDS: 5,

  // User agents suspects (bots, crawlers)
  SUSPICIOUS_USER_AGENTS: [
    'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget',
    'python', 'java', 'go-http', 'okhttp', 'httpclient',
    'phantomjs', 'headless', 'puppeteer', 'selenium',
  ],

  // IPs suspectes connues (data centers, VPN, etc.)
  // À compléter avec des listes externes
  BLOCKED_IP_RANGES: [] as string[],
};

// =============================================================================
// TYPES
// =============================================================================

export interface FraudCheckResult {
  is_valid: boolean;
  fraud_reason: string | null;
  confidence: number; // 0-1, 1 = certain que c'est une fraude
}

export interface ClickContext {
  campaign_id: string;
  ip_address: string;
  user_agent: string;
  user_id?: string;
  session_id?: string;
  referrer?: string;
  timestamp?: Date;
}

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * Hash une adresse IP pour stockage anonymisé
 */
export function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(ip + process.env.IP_HASH_SALT || 'sam-ads').digest('hex').substring(0, 32);
}

/**
 * Hash un user agent pour stockage
 */
export function hashUserAgent(ua: string): string {
  return crypto.createHash('sha256').update(ua).digest('hex').substring(0, 32);
}

/**
 * Vérifie si un user agent est suspect
 */
function isSuspiciousUserAgent(ua: string): boolean {
  const uaLower = ua.toLowerCase();
  return FRAUD_CONFIG.SUSPICIOUS_USER_AGENTS.some(pattern => uaLower.includes(pattern));
}

/**
 * Vérifie si une IP est dans une plage bloquée
 */
function isBlockedIP(ip: string): boolean {
  // Implémentation simplifiée - à améliorer avec des vraies vérifications CIDR
  return FRAUD_CONFIG.BLOCKED_IP_RANGES.some(range => ip.startsWith(range));
}

// =============================================================================
// VÉRIFICATION FRAUDE
// =============================================================================

/**
 * Vérifie si un clic est frauduleux.
 *
 * Vérifie :
 * 1. User agent suspect (bot)
 * 2. IP bloquée
 * 3. Trop de clics récents depuis cette IP
 * 4. Clics trop rapides
 */
export async function checkClickFraud(
  supabase: ReturnType<typeof createClient>,
  context: ClickContext
): Promise<FraudCheckResult> {
  const { campaign_id, ip_address, user_agent, session_id } = context;
  const ipHash = hashIP(ip_address);

  // 1. Vérifier le user agent
  if (isSuspiciousUserAgent(user_agent)) {
    return {
      is_valid: false,
      fraud_reason: 'bot_detected',
      confidence: 0.95,
    };
  }

  // 2. Vérifier si IP bloquée
  if (isBlockedIP(ip_address)) {
    return {
      is_valid: false,
      fraud_reason: 'blocked_ip',
      confidence: 1.0,
    };
  }

  // 3. Compter les clics récents depuis cette IP sur cette campagne
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count: clicksOnCampaign, error: error1 } = await supabase
    .from('ad_clicks')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaign_id)
    .eq('ip_hash', ipHash)
    .gte('created_at', oneHourAgo);

  if (error1) {
    log.error({ err: error1 }, "Error checking clicks");
    // En cas d'erreur, on laisse passer mais avec un warning
    return { is_valid: true, fraud_reason: null, confidence: 0 };
  }

  if ((clicksOnCampaign ?? 0) >= FRAUD_CONFIG.MAX_CLICKS_PER_IP_PER_CAMPAIGN_PER_HOUR) {
    return {
      is_valid: false,
      fraud_reason: 'rate_limit_campaign',
      confidence: 0.9,
    };
  }

  // 4. Compter les clics récents depuis cette IP toutes campagnes confondues
  const { count: totalClicks, error: error2 } = await supabase
    .from('ad_clicks')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', oneHourAgo);

  if (!error2 && (totalClicks ?? 0) >= FRAUD_CONFIG.MAX_CLICKS_PER_IP_PER_HOUR) {
    return {
      is_valid: false,
      fraud_reason: 'rate_limit_global',
      confidence: 0.85,
    };
  }

  // 5. Vérifier le délai depuis le dernier clic sur cette campagne
  const minInterval = new Date(Date.now() - FRAUD_CONFIG.MIN_CLICK_INTERVAL_SECONDS * 1000).toISOString();

  const { data: recentClick, error: error3 } = await supabase
    .from('ad_clicks')
    .select('id')
    .eq('campaign_id', campaign_id)
    .eq('ip_hash', ipHash)
    .gte('created_at', minInterval)
    .limit(1)
    .maybeSingle();

  if (!error3 && recentClick) {
    return {
      is_valid: false,
      fraud_reason: 'too_fast',
      confidence: 0.8,
    };
  }

  // 6. Vérifier si même session a déjà cliqué sur cette campagne
  if (session_id) {
    const { data: sessionClick, error: error4 } = await supabase
      .from('ad_clicks')
      .select('id')
      .eq('campaign_id', campaign_id)
      .eq('session_id', session_id)
      .limit(1)
      .maybeSingle();

    if (!error4 && sessionClick) {
      return {
        is_valid: false,
        fraud_reason: 'duplicate_session',
        confidence: 0.7,
      };
    }
  }

  // Tout est OK
  return {
    is_valid: true,
    fraud_reason: null,
    confidence: 0,
  };
}

// =============================================================================
// DÉTECTION PATTERNS SUSPECTS
// =============================================================================

/**
 * Analyse les patterns de clics pour détecter des comportements suspects.
 * À exécuter en batch pour identifier des fraudes plus sophistiquées.
 */
export async function analyzeClickPatterns(
  supabase: ReturnType<typeof createClient>,
  campaignId: string,
  timeRangeHours: number = 24
): Promise<{
  suspicious_ips: string[];
  fraud_rate: number;
  recommendations: string[];
}> {
  const since = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString();

  // Récupérer les clics
  const { data: clicks, error } = await supabase
    .from('ad_clicks')
    .select('ip_hash, session_id, is_valid, fraud_reason, created_at')
    .eq('campaign_id', campaignId)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .returns<any[]>();

  if (error || !clicks) {
    return { suspicious_ips: [], fraud_rate: 0, recommendations: [] };
  }

  // Analyser par IP
  const ipStats: Record<string, { count: number; invalid: number; timestamps: Date[] }> = {};

  for (const click of clicks) {
    const ip = click.ip_hash ?? 'unknown';
    if (!ipStats[ip]) {
      ipStats[ip] = { count: 0, invalid: 0, timestamps: [] };
    }
    ipStats[ip].count++;
    if (!click.is_valid) ipStats[ip].invalid++;
    ipStats[ip].timestamps.push(new Date(click.created_at));
  }

  // Identifier les IPs suspectes
  const suspicious_ips: string[] = [];
  const recommendations: string[] = [];

  for (const [ip, stats] of Object.entries(ipStats)) {
    // Plus de 10 clics depuis une IP = suspect
    if (stats.count > 10) {
      suspicious_ips.push(ip);
    }

    // Pattern temporel suspect : clics réguliers (bot)
    if (stats.timestamps.length >= 3) {
      const intervals = [];
      for (let i = 1; i < stats.timestamps.length; i++) {
        intervals.push(stats.timestamps[i].getTime() - stats.timestamps[i - 1].getTime());
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;

      // Faible variance = clics très réguliers = probable bot
      if (variance < 1000 && stats.count > 5) {
        if (!suspicious_ips.includes(ip)) suspicious_ips.push(ip);
      }
    }
  }

  // Calculer le taux de fraude
  const totalClicks = clicks.length;
  const invalidClicks = clicks.filter(c => !c.is_valid).length;
  const fraud_rate = totalClicks > 0 ? invalidClicks / totalClicks : 0;

  // Recommandations
  if (fraud_rate > 0.2) {
    recommendations.push('Taux de fraude élevé. Envisagez de revoir votre ciblage.');
  }
  if (suspicious_ips.length > 5) {
    recommendations.push('Nombreuses IPs suspectes détectées. Possibles attaques ciblées.');
  }

  return {
    suspicious_ips,
    fraud_rate,
    recommendations,
  };
}

// =============================================================================
// BLOCAGE IP
// =============================================================================

/**
 * Ajoute une IP à la liste noire temporaire (en mémoire).
 * Pour une solution persistante, utiliser Redis ou la DB.
 */
const temporaryBlockedIPs = new Map<string, number>(); // IP hash -> timestamp expiration

export function blockIP(ip: string, durationMinutes: number = 60): void {
  const ipHash = hashIP(ip);
  const expiration = Date.now() + durationMinutes * 60 * 1000;
  temporaryBlockedIPs.set(ipHash, expiration);
}

export function isIPBlocked(ip: string): boolean {
  const ipHash = hashIP(ip);

  // Vérifier blocage permanent
  if (isBlockedIP(ip)) return true;

  // Vérifier blocage temporaire
  const expiration = temporaryBlockedIPs.get(ipHash);
  if (expiration) {
    if (Date.now() < expiration) {
      return true;
    }
    // Expiration passée, nettoyer
    temporaryBlockedIPs.delete(ipHash);
  }

  return false;
}

// Nettoyer les IPs expirées périodiquement
setInterval(() => {
  const now = Date.now();
  for (const [ip, expiration] of temporaryBlockedIPs.entries()) {
    if (now >= expiration) {
      temporaryBlockedIPs.delete(ip);
    }
  }
}, 60 * 1000); // Toutes les minutes
