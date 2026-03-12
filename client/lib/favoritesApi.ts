import { getConsumerAccessToken } from "./auth";

const API_BASE = "/api/consumer";

async function authFetch<T>(url: string, opts?: RequestInit): Promise<T | null> {
  const token = await getConsumerAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(url, {
      ...opts,
      headers: { ...opts?.headers, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

/** Toggle favorite on server. Returns new favorited state or null on failure. */
export async function toggleFavoriteServer(
  establishmentId: string,
): Promise<boolean | null> {
  const data = await authFetch<{ favorited: boolean }>(
    `${API_BASE}/establishments/${establishmentId}/favorite`,
    { method: "POST" },
  );
  return data?.favorited ?? null;
}

/** Fetch all favorite IDs from server (for sync). */
export async function getFavoriteIdsFromServer(): Promise<string[] | null> {
  const data = await authFetch<{ ids: string[] }>(
    `${API_BASE}/me/favorite-ids`,
  );
  return data?.ids ?? null;
}

/** Check if a specific establishment is favorited on server. */
export async function isFavoriteOnServer(
  establishmentId: string,
): Promise<boolean | null> {
  const data = await authFetch<{ favorited: boolean }>(
    `${API_BASE}/establishments/${establishmentId}/is-favorite`,
  );
  return data?.favorited ?? null;
}
