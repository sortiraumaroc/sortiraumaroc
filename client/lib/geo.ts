export type LatLng = { lat: number; lng: number };

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const x = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

  return R * c;
}

export function formatDistanceBetweenCoords(a: LatLng, b: LatLng): string {
  const km = haversineDistanceKm(a, b);
  if (!Number.isFinite(km) || km < 0) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function parseNominatimCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export async function geocodeNominatim(query: string, signal: AbortSignal): Promise<LatLng | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = `/api/public/geocode?q=${encodeURIComponent(trimmed)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });

    if (!res.ok) return null;

    const data: unknown = await res.json();
    if (!data || typeof data !== "object") return null;

    const coords = (data as { coords?: unknown }).coords;
    if (!coords || typeof coords !== "object") return null;

    const lat = parseNominatimCoord((coords as { lat?: unknown }).lat);
    const lng = parseNominatimCoord((coords as { lng?: unknown }).lng);
    if (lat == null || lng == null) return null;

    return { lat, lng };
  } catch (err: unknown) {
    // Aborted requests are expected during fast typing/unmount.
    if (signal.aborted) return null;
    if (err instanceof DOMException && err.name === "AbortError") return null;
    if (typeof err === "object" && err && "name" in err && (err as { name?: unknown }).name === "AbortError") return null;

    throw err;
  }
}

const geocodeCache = new Map<string, LatLng>();

export async function geocodeNominatimCached(query: string, signal: AbortSignal): Promise<LatLng | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const cached = geocodeCache.get(trimmed);
  if (cached) return cached;

  const coords = await geocodeNominatim(trimmed, signal);
  if (coords) geocodeCache.set(trimmed, coords);
  return coords;
}
