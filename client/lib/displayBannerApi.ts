/**
 * Display Banner Ads — API client
 *
 * Fetch & track IAB display banners on establishment detail pages.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface DisplayBannerAd {
  campaign_id: string;
  creative_id: string;
  desktop_url: string | null;
  mobile_url: string | null;
  cta_url: string | null;
  cta_text: string | null;
  alt_text: string | null;
}

export interface FetchDisplayBannerParams {
  placement: string;
  city?: string;
  country?: string;
  deviceType?: "mobile" | "desktop" | "tablet";
}

// =============================================================================
// FETCH DISPLAY BANNER
// =============================================================================

/**
 * Fetch a display banner ad for a given placement.
 * Returns null if no campaign is eligible.
 */
export async function fetchDisplayBanner(
  params: FetchDisplayBannerParams
): Promise<DisplayBannerAd | null> {
  const qs = new URLSearchParams();
  qs.set("placement", params.placement);
  if (params.city) qs.set("city", params.city);
  if (params.country) qs.set("country", params.country);
  if (params.deviceType) qs.set("device_type", params.deviceType);

  try {
    const res = await fetch(`/api/public/ads/display-banner?${qs}`);
    if (!res.ok) return null;

    const payload = await res.json();
    return payload?.banner ?? null;
  } catch {
    return null;
  }
}

// =============================================================================
// TRACKING
// =============================================================================

/**
 * Track an ad impression (called when the banner is 50% visible for 1s).
 */
export async function trackAdImpression(
  campaignId: string,
  placement: string
): Promise<string | null> {
  try {
    const res = await fetch("/api/public/ads/impression", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        placement,
      }),
    });

    if (!res.ok) return null;
    const payload = await res.json();
    return payload?.impression_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Track an ad click.
 */
export async function trackAdClick(
  campaignId: string,
  impressionId: string | null,
  destinationUrl?: string
): Promise<void> {
  try {
    await fetch("/api/public/ads/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        impression_id: impressionId ?? undefined,
        destination_url: destinationUrl,
      }),
    });
  } catch {
    // Silently fail — click tracking should not block navigation
  }
}
