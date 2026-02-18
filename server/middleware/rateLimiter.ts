/**
 * Rate Limiter Middleware - SAM
 *
 * Implémentation simple de rate limiting sans dépendance externe.
 * Pour la production avec plusieurs instances, utiliser Redis.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { errors } from "../lib/apiResponse";

// ============================================
// TYPES
// ============================================

interface RateLimitConfig {
  /** Fenêtre de temps en millisecondes */
  windowMs: number;
  /** Nombre maximum de requêtes par fenêtre */
  maxRequests: number;
  /** Message d'erreur personnalisé */
  message?: string;
  /** Fonction pour extraire la clé d'identification (par défaut: IP) */
  keyGenerator?: (req: Request) => string;
  /** Skip rate limiting pour certaines requêtes */
  skip?: (req: Request) => boolean;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ============================================
// STORAGE EN MÉMOIRE
// ============================================

const stores = new Map<string, Map<string, RateLimitEntry>>();

/**
 * Nettoie les entrées expirées
 */
function cleanupStore(store: Map<string, RateLimitEntry>): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

/**
 * Planifie un nettoyage périodique du store
 */
function scheduleCleanup(storeName: string, store: Map<string, RateLimitEntry>, intervalMs: number): void {
  setInterval(() => {
    cleanupStore(store);
  }, intervalMs);
}

// ============================================
// FACTORY DE RATE LIMITER
// ============================================

/**
 * Crée un middleware de rate limiting
 */
export function createRateLimiter(name: string, config: RateLimitConfig): RequestHandler {
  const {
    windowMs,
    maxRequests,
    message = "Trop de requêtes. Veuillez patienter.",
    keyGenerator = getClientIp,
    skip,
  } = config;

  // Créer ou récupérer le store pour ce limiter
  if (!stores.has(name)) {
    const store = new Map<string, RateLimitEntry>();
    stores.set(name, store);
    // Nettoyer toutes les 5 minutes
    scheduleCleanup(name, store, 5 * 60 * 1000);
  }

  const store = stores.get(name)!;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip si configuré
    if (skip && skip(req)) {
      next();
      return;
    }

    const key = keyGenerator(req);
    const now = Date.now();

    // Récupérer ou créer l'entrée
    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      // Nouvelle fenêtre
      entry = {
        count: 1,
        resetAt: now + windowMs,
      };
      store.set(key, entry);
    } else {
      // Incrémenter le compteur
      entry.count++;
    }

    // Ajouter les headers de rate limit
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader("X-RateLimit-Limit", maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", resetSeconds.toString());

    // Vérifier si la limite est dépassée
    if (entry.count > maxRequests) {
      res.setHeader("Retry-After", resetSeconds.toString());
      errors.rateLimited(res, message);
      return;
    }

    next();
  };
}

// ============================================
// UTILITAIRES
// ============================================

/**
 * Extrait l'IP du client (gère les proxys)
 */
export function getClientIp(req: Request): string {
  // X-Forwarded-For peut contenir plusieurs IPs (client, proxy1, proxy2...)
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  // X-Real-IP (utilisé par certains proxys comme Nginx)
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  // Fallback sur l'IP de la connexion
  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Génère une clé basée sur IP + route
 */
export function ipAndRouteKey(req: Request): string {
  const ip = getClientIp(req);
  const route = req.path;
  return `${ip}:${route}`;
}

/**
 * Génère une clé basée sur IP + méthode + route
 */
export function ipMethodRouteKey(req: Request): string {
  const ip = getClientIp(req);
  const method = req.method;
  const route = req.path;
  return `${ip}:${method}:${route}`;
}

// ============================================
// PRESETS DE RATE LIMITERS
// ============================================

/**
 * Rate limiter pour les formulaires de contact/leads
 * 5 requêtes par 15 minutes
 */
export const leadsRateLimiter = createRateLimiter("leads", {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: "Vous avez envoyé trop de demandes. Veuillez patienter 15 minutes.",
  keyGenerator: ipAndRouteKey,
});

/**
 * Rate limiter pour les endpoints de paiement
 * 10 requêtes par minute
 */
export const paymentRateLimiter = createRateLimiter("payment", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: "Trop de tentatives de paiement. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour les endpoints d'authentification
 * 10 requêtes par 5 minutes
 */
export const authRateLimiter = createRateLimiter("auth", {
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10,
  message: "Trop de tentatives de connexion. Veuillez patienter 5 minutes.",
  keyGenerator: ipAndRouteKey,
});

/**
 * Rate limiter général pour l'API
 * 100 requêtes par minute
 */
export const apiRateLimiter = createRateLimiter("api", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  message: "Trop de requêtes. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter strict pour les opérations sensibles
 * 3 requêtes par heure
 */
export const strictRateLimiter = createRateLimiter("strict", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 3,
  message: "Limite atteinte pour cette opération. Veuillez patienter.",
  keyGenerator: ipAndRouteKey,
});

// ============================================
// PRESETS — CONTACT FORMS
// ============================================

/**
 * Rate limiter pour la soumission de formulaires de contact publics
 * 5 soumissions par 15 minutes par IP (anti-spam)
 */
export const contactFormSubmitRateLimiter = createRateLimiter("contact-form-submit", {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: "Vous avez envoyé trop de messages. Veuillez patienter 15 minutes avant de réessayer.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour la lecture de formulaires publics
 * 30 lectures par minute par IP
 */
export const contactFormReadRateLimiter = createRateLimiter("contact-form-read", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  message: "Trop de requêtes. Veuillez patienter.",
  keyGenerator: getClientIp,
});

// ============================================
// PRESETS — REVIEWS SYSTEM
// ============================================

/**
 * Rate limiter pour la soumission d'avis
 * 3 avis par heure (anti-spam sévère)
 */
export const reviewSubmitRateLimiter = createRateLimiter("review-submit", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 3,
  message: "Vous avez soumis trop d'avis récemment. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour les votes sur les avis
 * 30 votes par 15 minutes (anti vote-bombing)
 */
export const reviewVoteRateLimiter = createRateLimiter("review-vote", {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 30,
  message: "Vous avez voté trop souvent. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour les signalements d'avis
 * 5 signalements par heure
 */
export const reviewReportRateLimiter = createRateLimiter("review-report", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 5,
  message: "Vous avez fait trop de signalements. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour les pages publiques de reviews
 * 60 requêtes par minute (anti-scraping)
 */
export const reviewPublicReadRateLimiter = createRateLimiter("review-public-read", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  message: "Trop de requêtes. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour la proposition de geste commercial (pro)
 * 10 par heure par IP
 */
export const gestureProposalRateLimiter = createRateLimiter("gesture-proposal", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 10,
  message: "Vous avez proposé trop de gestes commerciaux. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour la réponse pro publique
 * 10 par heure par IP
 */
export const proResponseRateLimiter = createRateLimiter("pro-response", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 10,
  message: "Vous avez soumis trop de réponses. Veuillez patienter.",
  keyGenerator: getClientIp,
});

// ============================================
// PRESETS — RESERVATION V2 SYSTEM
// ============================================

/**
 * Rate limiter pour la création de réservation
 * 10 réservations par 15 minutes par IP (anti-spam sévère)
 */
export const reservationCreateRateLimiter = createRateLimiter("reservation-create", {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  message: "Trop de réservations. Veuillez patienter 15 minutes.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour l'annulation de réservation
 * 5 annulations par heure par IP
 */
export const reservationCancelRateLimiter = createRateLimiter("reservation-cancel", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 5,
  message: "Trop d'annulations. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour les actions pro (accept/refuse/hold)
 * 60 actions par minute (gestion quotidienne)
 */
export const proActionRateLimiter = createRateLimiter("pro-action-v2", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  message: "Trop d'actions. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour le scan QR
 * 30 scans par minute (flux d'entrée normal)
 */
export const qrScanRateLimiter = createRateLimiter("qr-scan", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  message: "Trop de scans QR. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour les demandes de devis
 * 3 devis par heure par IP (anti-spam)
 */
export const quoteRequestRateLimiter = createRateLimiter("quote-request", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 3,
  message: "Trop de demandes de devis. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour la réponse à un litige no-show
 * 5 réponses par heure par IP
 */
export const disputeResponseRateLimiter = createRateLimiter("dispute-response", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 5,
  message: "Trop de réponses aux litiges. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour la consultation de disponibilité
 * 120 requêtes par minute par IP (anti-scraping)
 */
export const availabilityReadRateLimiter = createRateLimiter("availability-read", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 120,
  message: "Trop de requêtes. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour l'upgrade free-to-paid
 * 10 par heure par IP
 */
export const upgradeRateLimiter = createRateLimiter("reservation-upgrade", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 10,
  message: "Trop de tentatives d'upgrade. Veuillez patienter.",
  keyGenerator: getClientIp,
});

// ============================================
// PRESETS — PACKS & BILLING SYSTEM
// ============================================

/**
 * Rate limiter pour l'achat de Packs
 * 10 achats par 15 minutes par IP (anti-spam sévère)
 */
export const packPurchaseRateLimiter = createRateLimiter("pack-purchase", {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  message: "Trop de tentatives d'achat. Veuillez patienter 15 minutes.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour la validation de codes promo
 * 20 validations par 15 minutes par IP (anti-bruteforce)
 */
export const packPromoValidateRateLimiter = createRateLimiter("pack-promo-validate", {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 20,
  message: "Trop de tentatives de validation de code promo. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour les demandes de remboursement
 * 5 demandes par heure par IP
 */
export const packRefundRateLimiter = createRateLimiter("pack-refund", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 5,
  message: "Trop de demandes de remboursement. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour la lecture de packs (anti-scraping)
 * 120 requêtes par minute par IP
 */
export const packReadRateLimiter = createRateLimiter("pack-read", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 120,
  message: "Trop de requêtes. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour le scan QR de consommation Pack
 * 30 scans par minute par IP (flux d'entrée normal)
 */
export const packScanRateLimiter = createRateLimiter("pack-scan", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  message: "Trop de scans. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour les actions pro sur les Packs
 * 60 actions par minute par IP (gestion quotidienne)
 */
export const packProActionRateLimiter = createRateLimiter("pack-pro-action", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  message: "Trop d'actions. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour les appels à facture
 * 5 soumissions par heure par IP
 */
export const billingCallToInvoiceRateLimiter = createRateLimiter("billing-call-to-invoice", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 5,
  message: "Trop de soumissions de factures. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour la création de contestations billing
 * 3 contestations par heure par IP
 */
export const billingDisputeRateLimiter = createRateLimiter("billing-dispute", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 3,
  message: "Trop de contestations. Veuillez patienter.",
  keyGenerator: getClientIp,
});

// ============================================
// PRESETS — LOYALTY V2 SYSTEM
// ============================================

/**
 * Rate limiter pour la lecture fidélité client (anti-scraping)
 * 120 requêtes par minute par IP
 */
export const loyaltyReadRateLimiter = createRateLimiter("loyalty-read", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 120,
  message: "Trop de requêtes. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour le claim de cadeau sam.ma
 * 10 claims par 15 minutes par IP (anti-abus)
 */
export const loyaltyGiftClaimRateLimiter = createRateLimiter("loyalty-gift-claim", {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  message: "Trop de tentatives de récupération de cadeau. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour le scan QR fidélité (pro)
 * 30 scans par minute par IP (flux d'entrée normal)
 */
export const loyaltyScanRateLimiter = createRateLimiter("loyalty-scan", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  message: "Trop de scans fidélité. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour les actions pro fidélité (create/update/activate/deactivate)
 * 30 actions par minute par IP
 */
export const loyaltyProActionRateLimiter = createRateLimiter("loyalty-pro-action", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  message: "Trop d'actions fidélité. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour le tampon conditionnel (pro)
 * 30 validations par minute par IP (flux normal)
 */
export const loyaltyStampRateLimiter = createRateLimiter("loyalty-stamp", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  message: "Trop de validations de tampon. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour la consommation récompense/cadeau (pro)
 * 30 consommations par minute par IP
 */
export const loyaltyConsumeRateLimiter = createRateLimiter("loyalty-consume", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  message: "Trop de consommations. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour l'offre de cadeaux sam.ma (pro)
 * 10 offres par heure par IP
 */
export const loyaltyGiftOfferRateLimiter = createRateLimiter("loyalty-gift-offer", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 10,
  message: "Trop d'offres de cadeaux. Veuillez patienter.",
  keyGenerator: getClientIp,
});

// =============================================================================
// Notifications, Banners, Wheel V2 rate limiters
// =============================================================================

export const notificationPrefsRateLimiter = createRateLimiter("notification-prefs", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: "Trop de modifications de préférences. Veuillez patienter.",
  keyGenerator: getClientIp,
});

export const pushCampaignAdminRateLimiter = createRateLimiter("push-campaign-admin", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  message: "Trop de requêtes campagnes. Veuillez patienter.",
  keyGenerator: getClientIp,
});

export const bannerTrackingRateLimiter = createRateLimiter("banner-tracking", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: "Trop de requêtes de tracking bannière.",
  keyGenerator: getClientIp,
});

export const bannerFormRateLimiter = createRateLimiter("banner-form", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5,
  message: "Trop de soumissions de formulaire.",
  keyGenerator: getClientIp,
});

export const bannerAdminRateLimiter = createRateLimiter("banner-admin", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  message: "Trop de requêtes bannières admin.",
  keyGenerator: getClientIp,
});

export const wheelSpinRateLimiter = createRateLimiter("wheel-spin-global", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5,
  message: "Trop de tentatives de spin. Veuillez patienter.",
  keyGenerator: getClientIp,
});

export const wheelAdminRateLimiter = createRateLimiter("wheel-admin", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  message: "Trop de requêtes roue admin.",
  keyGenerator: getClientIp,
});

// ---------------------------------------------------------------------------
// PRESETS — ADS SYSTEM
// ---------------------------------------------------------------------------

/** Public: GET sponsored / featured — 60 req/min per IP */
export const adReadRateLimiter = createRateLimiter("ad-read", {
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: "Trop de requêtes publicitaires.",
  keyGenerator: getClientIp,
});

/** Public: POST impression — 120 req/min per IP */
export const adImpressionRateLimiter = createRateLimiter("ad-impression", {
  windowMs: 60 * 1000,
  maxRequests: 120,
  message: "Trop d'impressions enregistrées.",
  keyGenerator: getClientIp,
});

/** Public: POST click — 30 req/min per IP */
export const adClickRateLimiter = createRateLimiter("ad-click", {
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: "Trop de clics enregistrés.",
  keyGenerator: getClientIp,
});

/** Pro: campaign create/update/submit — 20 req/15min */
export const adProActionRateLimiter = createRateLimiter("ad-pro-action", {
  windowMs: 15 * 60 * 1000,
  maxRequests: 20,
  message: "Trop d'actions sur les campagnes.",
  keyGenerator: getClientIp,
});

/** Pro: wallet recharge — 5 req/1h */
export const adWalletRechargeRateLimiter = createRateLimiter("ad-wallet-recharge", {
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  message: "Trop de tentatives de recharge.",
  keyGenerator: getClientIp,
});

// ============================================
// PRESETS — MESSAGING SYSTEM
// ============================================

/**
 * Rate limiter pour l'envoi de messages (pro et client)
 * 30 messages par minute (conversation active)
 */
export const messageSendRateLimiter = createRateLimiter("message-send", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  message: "Trop de messages envoyés. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour la lecture de conversations/messages
 * 120 requêtes par minute (inclut le realtime polling)
 */
export const messageReadRateLimiter = createRateLimiter("message-read", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 120,
  message: "Trop de requêtes. Veuillez patienter.",
  keyGenerator: getClientIp,
});

/**
 * Rate limiter pour l'upload de pièces jointes
 * 10 uploads par 15 minutes
 */
export const messageAttachmentRateLimiter = createRateLimiter("message-attachment", {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  message: "Trop de fichiers envoyés. Veuillez patienter.",
  keyGenerator: getClientIp,
});

// ============================================
// SAM AI ASSISTANT
// ============================================

export const samChatRateLimiter = createRateLimiter("sam-chat", {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxRequests: 30,
  message: "Sam est très sollicité ! Réessaye dans quelques minutes.",
  keyGenerator: getClientIp,
});

// ============================================
// SEARCH HISTORY
// ============================================

/** Save search history — max 30 per minute per IP */
export const searchHistorySaveRateLimiter = createRateLimiter("search-history-save", {
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: "Trop de requêtes d'historique.",
  keyGenerator: getClientIp,
});

/** Read/delete search history — max 60 per minute per IP */
export const searchHistoryReadRateLimiter = createRateLimiter("search-history-read", {
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: "Trop de requêtes d'historique.",
  keyGenerator: getClientIp,
});
