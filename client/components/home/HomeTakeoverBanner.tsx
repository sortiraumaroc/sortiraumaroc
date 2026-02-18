import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, X } from "lucide-react";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";

// Type for Home Takeover data from API
export type HomeTakeoverData = {
  id: string;
  date: string;
  campaign_id: string | null;
  establishment_id: string | null;
  establishment_name: string | null;
  establishment_slug: string | null;
  establishment_cover_url: string | null;
  banner_desktop_url: string | null;
  banner_mobile_url: string | null;
  logo_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  headline: string | null;
  subheadline: string | null;
  background_color: string | null;
  text_color: string | null;
};

type Props = {
  className?: string;
};

// Fetch today's home takeover from public API
async function fetchTodayHomeTakeover(): Promise<HomeTakeoverData | null> {
  try {
    const res = await fetch("/api/public/home-takeover");
    if (!res.ok) return null;
    const data = await res.json();
    return data.takeover || null;
  } catch {
    return null;
  }
}

export function HomeTakeoverBanner({ className = "" }: Props) {
  const [takeover, setTakeover] = useState<HomeTakeoverData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if already dismissed today
    const dismissedKey = `home_takeover_dismissed_${new Date().toISOString().slice(0, 10)}`;
    if (sessionStorage.getItem(dismissedKey)) {
      setDismissed(true);
      setLoading(false);
      return;
    }

    fetchTodayHomeTakeover()
      .then((data) => {
        setTakeover(data);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleDismiss = () => {
    const dismissedKey = `home_takeover_dismissed_${new Date().toISOString().slice(0, 10)}`;
    sessionStorage.setItem(dismissedKey, "1");
    setDismissed(true);
  };

  // Track impression when banner is shown
  useEffect(() => {
    if (!takeover || dismissed) return;

    // Track impression via API
    if (takeover.campaign_id) {
      fetch("/api/public/ads/impression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: takeover.campaign_id,
          position: 0,
          search_query: "home_takeover",
        }),
      }).catch(() => {
        // Ignore errors
      });
    }
  }, [takeover, dismissed]);

  // Don't render anything while loading or if no takeover or if dismissed
  if (loading || !takeover || dismissed) {
    return null;
  }

  // Determine the CTA link
  const ctaUrl = takeover.cta_url || (
    takeover.establishment_id && takeover.establishment_name
      ? buildEstablishmentUrl({
          id: takeover.establishment_id,
          slug: takeover.establishment_slug,
          name: takeover.establishment_name,
          universe: "restaurants", // Default, could be enhanced
        })
      : null
  );

  const handleCtaClick = () => {
    // Track click
    if (takeover.campaign_id) {
      fetch("/api/public/ads/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: takeover.campaign_id,
          destination_url: ctaUrl || "",
        }),
      }).catch(() => {
        // Ignore errors
      });
    }
  };

  const bgColor = takeover.background_color || "#000000";
  const textColor = takeover.text_color || "#FFFFFF";
  const ctaText = takeover.cta_text || "Découvrir";

  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{ backgroundColor: bgColor }}
    >
      {/* Dismiss button */}
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-3 end-3 z-20 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition"
        aria-label="Fermer"
      >
        <X className="w-4 h-4" style={{ color: textColor }} />
      </button>

      {/* Desktop Banner */}
      <div className="hidden md:block relative">
        {takeover.banner_desktop_url ? (
          <img
            src={takeover.banner_desktop_url}
            alt={takeover.headline || "Home Takeover"}
            className="w-full h-auto max-h-[400px] object-cover"
          />
        ) : (
          <div className="w-full h-[300px]" />
        )}

        {/* Overlay content */}
        <div className="absolute inset-0 flex items-center">
          <div className="container mx-auto px-4 flex items-center justify-between">
            {/* Left side: Logo + Text */}
            <div className="flex items-center gap-6 max-w-2xl">
              {takeover.logo_url && (
                <img
                  src={takeover.logo_url}
                  alt={takeover.establishment_name || ""}
                  className="w-20 h-20 md:w-24 md:h-24 rounded-xl object-contain bg-white/10 p-2 flex-shrink-0"
                />
              )}
              <div>
                {takeover.headline && (
                  <h2
                    className="text-2xl md:text-3xl font-bold mb-2"
                    style={{ color: textColor }}
                  >
                    {takeover.headline}
                  </h2>
                )}
                {takeover.subheadline && (
                  <p
                    className="text-base md:text-lg opacity-90"
                    style={{ color: textColor }}
                  >
                    {takeover.subheadline}
                  </p>
                )}
              </div>
            </div>

            {/* Right side: CTA Button */}
            {ctaUrl && (
              <Link
                to={ctaUrl}
                onClick={handleCtaClick}
                className="flex-shrink-0 flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition hover:opacity-90"
                style={{
                  backgroundColor: textColor,
                  color: bgColor,
                }}
              >
                {ctaText}
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Banner */}
      <div className="md:hidden relative">
        {takeover.banner_mobile_url ? (
          <img
            src={takeover.banner_mobile_url}
            alt={takeover.headline || "Home Takeover"}
            className="w-full h-auto max-h-[300px] object-cover"
          />
        ) : takeover.banner_desktop_url ? (
          <img
            src={takeover.banner_desktop_url}
            alt={takeover.headline || "Home Takeover"}
            className="w-full h-auto max-h-[200px] object-cover"
          />
        ) : (
          <div className="w-full h-[150px]" />
        )}

        {/* Mobile overlay content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          {takeover.logo_url && (
            <img
              src={takeover.logo_url}
              alt={takeover.establishment_name || ""}
              className="w-14 h-14 rounded-lg object-contain bg-white/10 p-1.5 mb-3"
            />
          )}
          {takeover.headline && (
            <h2
              className="text-lg font-bold mb-1"
              style={{ color: textColor }}
            >
              {takeover.headline}
            </h2>
          )}
          {takeover.subheadline && (
            <p
              className="text-sm opacity-90 mb-3"
              style={{ color: textColor }}
            >
              {takeover.subheadline}
            </p>
          )}
          {ctaUrl && (
            <Link
              to={ctaUrl}
              onClick={handleCtaClick}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition hover:opacity-90"
              style={{
                backgroundColor: textColor,
                color: bgColor,
              }}
            >
              {ctaText}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* "Sponsorisé" label */}
      <div
        className="absolute bottom-2 start-2 px-2 py-0.5 rounded text-[10px] font-medium bg-black/30"
        style={{ color: textColor }}
      >
        Sponsorisé
      </div>
    </div>
  );
}
