/**
 * Booking Attribution System
 *
 * Gere le tracking de source des reservations via cookie HTTPOnly.
 * Permet de distinguer les reservations "plateforme" (commissionnees)
 * des reservations "lien direct" (non commissionnees).
 *
 * SECURITE:
 * - Cookie HTTPOnly pour eviter manipulation client
 * - Validation serveur obligatoire
 * - Attribution liee a un etablissement specifique
 * - Expiration apres 48 heures
 */

import type { Request, Response } from "express";

// Configuration
const COOKIE_NAME = "sam_ref";
const ATTRIBUTION_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 heures
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || ".sam.ma"; // Partage entre sam.ma et book.sam.ma

export type BookingSource = "platform" | "direct_link";

export type BookingAttribution = {
  slug: string;
  establishmentId: string;
  timestamp: number;
  source: "direct_link";
};

type AttributionCookieData = {
  s: string; // slug (compressed key)
  e: string; // establishmentId (compressed key)
  t: number; // timestamp (compressed key)
};

/**
 * Pose le cookie d'attribution pour un etablissement
 * A appeler quand un utilisateur arrive via book.sam.ma/:username
 */
export function setBookingAttributionCookie(
  res: Response,
  data: {
    slug: string;
    establishmentId: string;
  }
): void {
  const cookieData: AttributionCookieData = {
    s: data.slug,
    e: data.establishmentId,
    t: Date.now(),
  };

  const cookieValue = Buffer.from(JSON.stringify(cookieData)).toString("base64");

  res.cookie(COOKIE_NAME, cookieValue, {
    httpOnly: true, // CRITIQUE: empeche acces JavaScript
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // Permet les redirections cross-site
    maxAge: ATTRIBUTION_WINDOW_MS,
    domain: process.env.NODE_ENV === "production" ? COOKIE_DOMAIN : undefined,
    path: "/",
  });
}

/**
 * Lit et valide le cookie d'attribution
 * Retourne null si:
 * - Pas de cookie
 * - Cookie invalide
 * - Cookie expire (> 48h)
 */
export function getBookingAttribution(req: Request): BookingAttribution | null {
  try {
    const cookieValue = req.cookies?.[COOKIE_NAME];
    if (!cookieValue || typeof cookieValue !== "string") {
      return null;
    }

    const decoded = Buffer.from(cookieValue, "base64").toString("utf-8");
    const data = JSON.parse(decoded) as AttributionCookieData;

    // Validation des champs
    if (
      typeof data.s !== "string" ||
      typeof data.e !== "string" ||
      typeof data.t !== "number"
    ) {
      return null;
    }

    // Verification de l'expiration (48h)
    const now = Date.now();
    if (now - data.t > ATTRIBUTION_WINDOW_MS) {
      return null;
    }

    return {
      slug: data.s,
      establishmentId: data.e,
      timestamp: data.t,
      source: "direct_link",
    };
  } catch { /* intentional: cookie may be malformed or expired */
    return null;
  }
}

/**
 * Supprime le cookie d'attribution
 * A appeler apres une reservation reussie (optionnel)
 */
export function clearBookingAttribution(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    domain: process.env.NODE_ENV === "production" ? COOKIE_DOMAIN : undefined,
    path: "/",
  });
}

/**
 * Verifie si l'attribution est valide pour un etablissement specifique
 * CRITIQUE pour la securite: l'attribution ne doit s'appliquer qu'a l'etablissement
 * pour lequel elle a ete creee
 */
export function isAttributionValidForEstablishment(
  attribution: BookingAttribution | null,
  establishmentId: string
): boolean {
  if (!attribution) return false;

  // L'attribution doit correspondre exactement a l'etablissement
  return attribution.establishmentId === establishmentId;
}

/**
 * Determine la source de reservation en fonction de l'attribution
 * Retourne les donnees a enregistrer sur la reservation
 */
export function determineBookingSource(
  req: Request,
  establishmentId: string
): {
  bookingSource: BookingSource;
  referralSlug: string | null;
  sourceUrl: string | null;
} {
  const attribution = getBookingAttribution(req);
  const sourceUrl = req.headers.referer || null;

  // Verifier si l'attribution est valide pour cet etablissement
  if (isAttributionValidForEstablishment(attribution, establishmentId)) {
    return {
      bookingSource: "direct_link",
      referralSlug: attribution!.slug,
      sourceUrl: sourceUrl as string | null,
    };
  }

  // Par defaut: reservation plateforme (commissionnee)
  return {
    bookingSource: "platform",
    referralSlug: null,
    sourceUrl: sourceUrl as string | null,
  };
}

/**
 * Middleware Express pour parser les cookies
 * A utiliser si cookie-parser n'est pas deja configure
 */
export function ensureCookieParser(
  req: Request,
  _res: Response,
  next: () => void
): void {
  if (!req.cookies) {
    req.cookies = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader && typeof cookieHeader === "string") {
      cookieHeader.split(";").forEach((cookie) => {
        const parts = cookie.split("=");
        const key = parts[0]?.trim();
        const value = parts.slice(1).join("=").trim();
        if (key) {
          req.cookies[key] = decodeURIComponent(value);
        }
      });
    }
  }
  next();
}
