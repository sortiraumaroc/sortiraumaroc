import React from "react";
import { Facebook, Globe, Instagram, Linkedin, Twitter, Youtube } from "lucide-react";
import { GOOGLE_MAPS_LOGO_URL, TRIPADVISOR_LOGO_URL } from "@/lib/mapAppLogos";

/** TikTok official logo as inline SVG */
export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.51a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.18 8.18 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1-.15Z" />
    </svg>
  );
}

/** Snapchat ghost logo as inline SVG (Simple Brands icon) */
export function SnapchatIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 512 512"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M256.42 32c-45.22 0-78.1 20.4-98.23 60.72-14.38 28.82-11.47 81.8-9.5 100.08l.13 1.24c-.46.6-1.42 1.16-2.83 1.16-3.35 0-8.6-2.33-12.4-3.9-3.3-1.37-6.3-2.56-9.27-2.98a17.07 17.07 0 0 0-2.52-.18c-6.46 0-12 3.48-14.87 9.32-3.78 7.72-.84 16.38 7.62 22.42 1.08.78 2.28 1.5 3.54 2.24 5.22 3.1 12.38 7.36 14.2 14.31.7 2.64.14 5.4-1.64 8.18a100.3 100.3 0 0 1-9.35 12.68c-12.6 14.92-29.84 28.02-51.25 38.9-5.6 2.86-8.74 6.69-9.34 11.4-.84 6.5 4.16 12.56 7.48 15.07 5.04 3.82 10.82 6.55 17.18 8.1 1.8.44 3.55.7 5.15 1.26 2.38.82 3.42 2.04 4.1 3.7 1.14 2.8 1.62 5.7 5.32 8.98 4 3.54 9.63 4.77 16.6 4.77 3.56 0 7.36-.34 11.36-.7l1.14-.1c7.08-.62 15.12-1.32 24.3 1.58 4.48 1.42 8.96 4.36 13.94 7.62 13.72 9 32.54 21.32 63.12 21.32.7 0 1.42-.02 2.13-.04.54.02 1.14.04 1.76.04 30.58 0 49.38-12.32 63.1-21.32 4.98-3.26 9.46-6.2 13.94-7.62 9.18-2.9 17.22-2.2 24.3-1.58l1.14.1c4 .36 7.82.7 11.36.7 6.98 0 12.6-1.24 16.6-4.78 3.7-3.28 4.18-6.18 5.32-8.98.68-1.66 1.72-2.88 4.1-3.7 1.6-.54 3.36-.82 5.16-1.26 6.36-1.54 12.14-4.28 17.18-8.1 3.32-2.5 8.32-8.56 7.48-15.06-.6-4.72-3.74-8.55-9.34-11.4-21.42-10.9-38.66-24-51.26-38.92a100.3 100.3 0 0 1-9.34-12.68c-1.78-2.78-2.34-5.54-1.64-8.18 1.82-6.96 8.98-11.22 14.2-14.32 1.26-.74 2.46-1.46 3.54-2.24 5.28-3.78 9.7-9.42 9.46-16.04-.16-4.26-2.5-8.06-6.72-10.96-3.1-2.12-6.64-3.2-10.24-3.2a20.4 20.4 0 0 0-7.44 1.46c-4.24 1.66-8.72 3.74-12.28 3.74-1.14 0-2.04-.28-2.72-.92l.06-.82c1.92-17.76 4.96-71.36-9.46-100.3C334.34 52.36 301.54 32 256.42 32Z" />
    </svg>
  );
}

/**
 * Returns the appropriate social media icon component for a given platform.
 * Use this everywhere instead of duplicating switch statements.
 */
export function getSocialIcon(platform: string, className: string = "w-6 h-6") {
  switch (platform) {
    case "facebook":
      return <Facebook className={className} />;
    case "instagram":
      return <Instagram className={className} />;
    case "x":
    case "twitter":
      return <Twitter className={className} />;
    case "tiktok":
      return <TikTokIcon className={className} />;
    case "snapchat":
      return <SnapchatIcon className={className} />;
    case "youtube":
      return <Youtube className={className} />;
    case "linkedin":
      return <Linkedin className={className} />;
    case "google_maps":
      return <img src={GOOGLE_MAPS_LOGO_URL} alt="Google Maps" className="h-7 w-auto" />;
    case "tripadvisor":
      return <img src={TRIPADVISOR_LOGO_URL} alt="TripAdvisor" className="h-7 w-auto" />;
    case "website":
      return <Globe className={className} />;
    default:
      return null;
  }
}
