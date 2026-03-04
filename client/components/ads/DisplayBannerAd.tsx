/**
 * DisplayBannerAd — Bannière publicitaire IAB Leaderboard
 *
 * - Fetch l'ad éligible au mount via fetchDisplayBanner()
 * - Retourne null si aucune campagne (zéro espace vide)
 * - Responsive : desktop 728×90 (Leaderboard) / mobile 320×50 (Mobile Banner)
 * - Tracking impression via IntersectionObserver (50% visible pendant 1s)
 * - Tracking click → trackAdClick() + ouvre cta_url
 * - Label "Publicité" discret
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchDisplayBanner,
  trackAdImpression,
  trackAdClick,
  type DisplayBannerAd as BannerData,
} from "../../lib/displayBannerApi";

// =============================================================================
// PROPS
// =============================================================================

interface DisplayBannerAdProps {
  placement: string;
  city?: string | null;
  country?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function DisplayBannerAd({ placement, city, country }: DisplayBannerAdProps) {
  const [banner, setBanner] = useState<BannerData | null>(null);
  const [impressionId, setImpressionId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const impressionTracked = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Detect device type ──────────────────────────────────────────────────
  const getDeviceType = useCallback((): "mobile" | "desktop" | "tablet" => {
    if (typeof window === "undefined") return "desktop";
    const w = window.innerWidth;
    if (w < 768) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  }, []);

  // ── Fetch banner ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    fetchDisplayBanner({
      placement,
      city: city ?? undefined,
      country,
      deviceType: getDeviceType(),
    }).then((data) => {
      if (!cancelled) setBanner(data);
    });

    return () => {
      cancelled = true;
    };
  }, [placement, city, country, getDeviceType]);

  // ── Impression tracking (50% visible for 1s) ───────────────────────────
  useEffect(() => {
    if (!banner || impressionTracked.current) return;

    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Start 1s timer
          timerRef.current = setTimeout(async () => {
            if (impressionTracked.current) return;
            impressionTracked.current = true;
            const id = await trackAdImpression(banner.campaign_id, placement);
            setImpressionId(id);
          }, 1000);
        } else {
          // Cancel timer if scrolled away
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [banner, placement]);

  // ── Click handler ───────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    if (!banner) return;

    // Fire & forget click tracking
    trackAdClick(banner.campaign_id, impressionId, banner.cta_url ?? undefined);

    // Open destination
    if (banner.cta_url) {
      window.open(banner.cta_url, "_blank", "noopener,noreferrer");
    }
  }, [banner, impressionId]);

  // ── Render nothing if no banner ─────────────────────────────────────────
  if (!banner) return null;

  // Au moins une image doit exister
  if (!banner.desktop_url && !banner.mobile_url) return null;

  return (
    <div ref={containerRef} className="my-6 flex flex-col items-center">
      {/* Label "Publicité" */}
      <span className="mb-1 text-[10px] uppercase tracking-wider text-gray-400">
        Publicité
      </span>

      <button
        type="button"
        onClick={handleClick}
        className="cursor-pointer overflow-hidden rounded-lg border border-gray-100 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2"
        aria-label={banner.cta_text ?? "Publicité"}
      >
        {/* Desktop : Leaderboard 728×90 (hidden on mobile) */}
        {banner.desktop_url && (
          <img
            src={banner.desktop_url}
            alt={banner.alt_text ?? "Publicité"}
            width={728}
            height={90}
            className="hidden md:block"
            loading="lazy"
          />
        )}

        {/* Mobile : Mobile Banner 320×50 (hidden on desktop) */}
        {banner.mobile_url && (
          <img
            src={banner.mobile_url}
            alt={banner.alt_text ?? "Publicité"}
            width={320}
            height={50}
            className="block md:hidden"
            loading="lazy"
          />
        )}

        {/* Fallback : si une seule image fournie, l'afficher partout */}
        {!banner.desktop_url && banner.mobile_url && (
          <img
            src={banner.mobile_url}
            alt={banner.alt_text ?? "Publicité"}
            width={320}
            height={50}
            className="hidden md:block"
            loading="lazy"
          />
        )}
        {banner.desktop_url && !banner.mobile_url && (
          <img
            src={banner.desktop_url}
            alt={banner.alt_text ?? "Publicité"}
            width={728}
            height={90}
            className="block md:hidden"
            loading="lazy"
          />
        )}
      </button>
    </div>
  );
}
