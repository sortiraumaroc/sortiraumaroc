/**
 * InlineBanner — Fixed horizontal banner embedded in page content (600×200).
 *
 * Used on establishment detail pages between sections.
 * Fetches an eligible banner for the current page context and renders it
 * as a clickable image with optional CTA overlay.
 */

import { useEffect, useState, useCallback } from "react";
import { getConsumerAccessToken } from "@/lib/auth";
import { useDetectedCity } from "@/hooks/useDetectedCity";

interface InlineBannerData {
  id: string;
  title?: string;
  media_url?: string;
  media_url_mobile?: string;
  cta_url?: string;
  cta_target?: string;
  cta_text?: string;
}

interface InlineBannerProps {
  /** Slot identifier (e.g. "establishment_slot_1", "establishment_slot_2") */
  slot: string;
  /** Current page path for targeting */
  page?: string;
  className?: string;
}

async function fetchInlineBanner(page: string, slot: string, city?: string): Promise<InlineBannerData | null> {
  try {
    const token = await getConsumerAccessToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;

    const params = new URLSearchParams({
      platform: "web",
      page,
      trigger: "on_page",
      slot,
    });
    if (city) params.set("city", city);

    const res = await fetch(`/api/banners/eligible?${params.toString()}`, { headers });
    if (!res.ok) return null;

    const json = await res.json();
    return json?.banner ?? null;
  } catch {
    return null;
  }
}

async function trackEvent(bannerId: string, event: "view" | "click"): Promise<void> {
  try {
    const token = await getConsumerAccessToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;

    await fetch(`/api/banners/${bannerId}/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({ event, session_id: sessionStorage.getItem("banner_session_id") || "anonymous" }),
    });
  } catch {
    // best-effort
  }
}

export function InlineBanner({ slot, page, className }: InlineBannerProps) {
  const [banner, setBanner] = useState<InlineBannerData | null>(null);
  const [tracked, setTracked] = useState(false);
  const { city: detectedCity } = useDetectedCity();

  useEffect(() => {
    const currentPage = page || window.location.pathname;
    void fetchInlineBanner(currentPage, slot, detectedCity ?? undefined).then((b) => {
      if (b?.id) setBanner(b);
    });
  }, [page, slot, detectedCity]);

  // Track view on mount
  useEffect(() => {
    if (banner?.id && !tracked) {
      void trackEvent(banner.id, "view");
      setTracked(true);
    }
  }, [banner, tracked]);

  const handleClick = useCallback(() => {
    if (banner?.id) {
      void trackEvent(banner.id, "click");
    }
  }, [banner]);

  if (!banner?.media_url) return null;

  const imageUrl = banner.media_url;

  const content = (
    <div className={`w-full overflow-hidden rounded-xl ${className ?? ""}`}>
      <img
        src={imageUrl}
        alt={banner.title || ""}
        className="w-full h-auto object-cover"
        style={{ aspectRatio: "600 / 200" }}
        loading="lazy"
      />
    </div>
  );

  if (banner.cta_url) {
    return (
      <a
        href={banner.cta_url}
        target={banner.cta_target || "_blank"}
        rel="noopener noreferrer"
        onClick={handleClick}
        className="block"
      >
        {content}
      </a>
    );
  }

  return content;
}
