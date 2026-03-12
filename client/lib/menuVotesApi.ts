/**
 * Menu Item Votes — Client API helpers
 *
 * Like/dislike system for menu items.
 */

import { getConsumerAccessToken } from "@/lib/auth";

// =============================================================================
// Types
// =============================================================================

export interface VoteStats {
  likes: number;
  dislikes: number;
  isFavorite: boolean;
}

export interface VoteResult {
  ok: true;
  action: "created" | "updated" | "removed";
  vote: "like" | "dislike" | null;
}

// =============================================================================
// Error class
// =============================================================================

export class MenuVotesApiError extends Error {
  status: number;
  payload: unknown;
  constructor(msg: string, status: number, payload?: unknown) {
    super(msg);
    this.name = "MenuVotesApiError";
    this.status = status;
    this.payload = payload;
  }
}

// =============================================================================
// Internal fetch helpers
// =============================================================================

async function publicJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (typeof payload?.error === "string" ? payload.error : null) ??
      `HTTP ${res.status}`;
    throw new MenuVotesApiError(msg, res.status, payload);
  }
  return payload as T;
}

async function authedJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getConsumerAccessToken();
  if (!token) {
    throw new MenuVotesApiError("Non authentifié", 401);
  }

  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (typeof payload?.error === "string" ? payload.error : null) ??
      `HTTP ${res.status}`;
    throw new MenuVotesApiError(msg, res.status, payload);
  }
  return payload as T;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Vote (like/dislike) on a menu item. Toggle behavior: same vote = remove.
 */
export async function voteMenuItem(
  itemId: string,
  vote: "like" | "dislike",
): Promise<VoteResult> {
  return authedJson<VoteResult>(
    `/api/consumer/menu-items/${itemId}/vote`,
    {
      method: "POST",
      body: JSON.stringify({ vote }),
    },
  );
}

/**
 * Get vote stats for ALL items of an establishment (batch).
 */
export async function getEstablishmentMenuVotes(
  estId: string,
): Promise<Record<string, VoteStats>> {
  const res = await publicJson<{ ok: true; votes: Record<string, VoteStats> }>(
    `/api/public/establishments/${estId}/menu-votes`,
  );
  return res.votes;
}

/**
 * Get the current user's votes for all items of an establishment (batch).
 */
export async function getMyMenuVotes(
  estId: string,
): Promise<Record<string, "like" | "dislike">> {
  const res = await authedJson<{
    ok: true;
    votes: Record<string, "like" | "dislike">;
  }>(`/api/consumer/establishments/${estId}/my-menu-votes`);
  return res.votes;
}
