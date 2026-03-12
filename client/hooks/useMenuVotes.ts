/**
 * useMenuVotes — React hook for menu item like/dislike
 *
 * Fetches vote stats (public) and user's own votes (if authenticated).
 * Provides toggleVote with optimistic updates.
 */

import * as React from "react";
import { isAuthed } from "@/lib/auth";
import {
  getEstablishmentMenuVotes,
  getMyMenuVotes,
  voteMenuItem,
  type VoteStats,
} from "@/lib/menuVotesApi";

export interface UseMenuVotesReturn {
  /** Vote stats per item id: { likes, dislikes, isFavorite } */
  votesMap: Record<string, VoteStats>;
  /** Current user's votes per item id: "like" | "dislike" */
  myVotesMap: Record<string, "like" | "dislike">;
  /** Loading state */
  loading: boolean;
  /** Toggle a vote (optimistic). Returns true if successful. */
  toggleVote: (itemId: string, vote: "like" | "dislike") => Promise<boolean>;
}

const FAVORITE_MIN_VOTES = 5;
const FAVORITE_MIN_LIKE_RATIO = 0.7;

function computeIsFavorite(likes: number, dislikes: number): boolean {
  const total = likes + dislikes;
  if (total < FAVORITE_MIN_VOTES) return false;
  return likes / total >= FAVORITE_MIN_LIKE_RATIO;
}

export function useMenuVotes(establishmentId: string | undefined): UseMenuVotesReturn {
  const [votesMap, setVotesMap] = React.useState<Record<string, VoteStats>>({});
  const [myVotesMap, setMyVotesMap] = React.useState<Record<string, "like" | "dislike">>({});
  const [loading, setLoading] = React.useState(false);

  // Fetch on mount / when establishmentId changes
  React.useEffect(() => {
    if (!establishmentId) return;

    let cancelled = false;
    setLoading(true);

    const fetchAll = async () => {
      try {
        const promises: Promise<void>[] = [];

        // Always fetch public stats
        promises.push(
          getEstablishmentMenuVotes(establishmentId).then((votes) => {
            if (!cancelled) setVotesMap(votes);
          }),
        );

        // Fetch user votes only if authenticated
        if (isAuthed()) {
          promises.push(
            getMyMenuVotes(establishmentId)
              .then((votes) => {
                if (!cancelled) setMyVotesMap(votes);
              })
              .catch(() => {
                // Silently fail — user might have stale session
              }),
          );
        }

        await Promise.allSettled(promises);
      } catch {
        // Silently fail — votes are non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [establishmentId]);

  // Toggle vote with optimistic update
  const toggleVote = React.useCallback(
    async (itemId: string, vote: "like" | "dislike"): Promise<boolean> => {
      const prevStats = votesMap[itemId] ?? { likes: 0, dislikes: 0, isFavorite: false };
      const prevMyVote = myVotesMap[itemId] ?? null;

      // Compute optimistic state
      let newLikes = prevStats.likes;
      let newDislikes = prevStats.dislikes;
      let newMyVote: "like" | "dislike" | null;

      if (prevMyVote === vote) {
        // Toggle off
        if (vote === "like") newLikes = Math.max(0, newLikes - 1);
        else newDislikes = Math.max(0, newDislikes - 1);
        newMyVote = null;
      } else {
        // Remove previous vote if any
        if (prevMyVote === "like") newLikes = Math.max(0, newLikes - 1);
        if (prevMyVote === "dislike") newDislikes = Math.max(0, newDislikes - 1);
        // Add new vote
        if (vote === "like") newLikes++;
        else newDislikes++;
        newMyVote = vote;
      }

      const newStats: VoteStats = {
        likes: newLikes,
        dislikes: newDislikes,
        isFavorite: computeIsFavorite(newLikes, newDislikes),
      };

      // Apply optimistic update
      setVotesMap((prev) => ({ ...prev, [itemId]: newStats }));
      if (newMyVote) {
        setMyVotesMap((prev) => ({ ...prev, [itemId]: newMyVote! }));
      } else {
        setMyVotesMap((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      }

      // Send to server
      try {
        await voteMenuItem(itemId, vote);
        return true;
      } catch {
        // Revert optimistic update on error
        setVotesMap((prev) => ({ ...prev, [itemId]: prevStats }));
        if (prevMyVote) {
          setMyVotesMap((prev) => ({ ...prev, [itemId]: prevMyVote! }));
        } else {
          setMyVotesMap((prev) => {
            const next = { ...prev };
            delete next[itemId];
            return next;
          });
        }
        return false;
      }
    },
    [votesMap, myVotesMap],
  );

  return { votesMap, myVotesMap, loading, toggleVote };
}
