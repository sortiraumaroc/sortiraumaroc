/**
 * Centralized helper for the public-facing base URL.
 *
 * In production, uses PUBLIC_BASE_URL env var (or falls back to "https://sam.ma").
 * In development, auto-detects localhost:<PORT> so that email links work locally.
 */
export function getPublicBaseUrl(): string {
  const explicit = (process.env.PUBLIC_BASE_URL ?? "").trim();
  if (explicit) return explicit;

  // Auto-detect in development
  if (process.env.NODE_ENV !== "production") {
    const port = process.env.PORT || "8080";
    return `http://localhost:${port}`;
  }

  return "https://sam.ma";
}
