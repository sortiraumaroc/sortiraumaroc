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
