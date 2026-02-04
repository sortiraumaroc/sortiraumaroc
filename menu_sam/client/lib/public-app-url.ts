function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    // Keep only origin; QR paths are appended elsewhere.
    return url.origin;
  } catch {
    return null;
  }
}

export function getPublicAppOrigin(): { origin: string; usedFallback: boolean } {
  const configured = normalizeOrigin(String(import.meta.env.VITE_PUBLIC_APP_URL ?? ""));
  if (configured) return { origin: configured, usedFallback: false };

  if (typeof window !== "undefined" && window.location?.origin) {
    return { origin: window.location.origin, usedFallback: true };
  }

  // SSR / non-browser fallback
  return { origin: "", usedFallback: true };
}
