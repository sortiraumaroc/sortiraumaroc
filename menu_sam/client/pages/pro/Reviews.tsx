import * as React from "react";
import { toast } from "sonner";

import { HelpTooltip } from "@/components/pro/help-tooltip";
import { ProShell } from "@/components/pro/pro-shell";
import { useProSession } from "@/components/pro/use-pro-session";
import { useProPlace } from "@/contexts/pro-place-context";
import { useAuthToken } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { Trash2, Star, Calendar, MessageSquare, Loader2 } from "lucide-react";

type Review = {
  id: number;
  placeId: number;
  comment: string;
  note: number;
  dateCreation: string;
};

type ReviewStats = {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
};

function formatDate(dateString: string) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "Hier";
    if (diffDays < 7) return `Il y a ${diffDays} j`;
    return date.toLocaleDateString("fr-FR");
  } catch {
    return "—";
  }
}

function RatingStars({ rating }: { rating: number }) {
  const safe = Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("h-4 w-4", i < safe ? "fill-yellow-400 text-yellow-400" : "text-gray-300")}
        />
      ))}
    </div>
  );
}

function RatingBar({ label, count, total }: { label: string; count: number; total: number }) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-right text-sm font-medium text-black/70">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-black/10">
        <div className="h-2 bg-yellow-400 transition-all duration-300" style={{ width: `${percentage}%` }} />
      </div>
      <span className="w-12 text-right text-sm text-black/60">{count}</span>
    </div>
  );
}

export function ReviewsPage() {
  const { state, signOut } = useProSession();
  const { selectedPlaceId } = useProPlace();
  const authToken = useAuthToken("client");

  const [reviews, setReviews] = React.useState<Review[]>([]);
  const [stats, setStats] = React.useState<ReviewStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [deleting, setDeleting] = React.useState<number | null>(null);

  const fetchReviews = React.useCallback(async () => {
    if (!selectedPlaceId) return;

    setLoading(true);
    try {
      const [reviewsRes, statsRes] = await Promise.all([
        fetch(`/api/mysql/reviews/${selectedPlaceId}`),
        fetch(`/api/mysql/reviews/${selectedPlaceId}/stats`),
      ]);

      if (!reviewsRes.ok) {
        const err = await reviewsRes.text().catch(() => "");
        console.error("Reviews API error:", reviewsRes.status, err);
        toast.error("API avis: erreur");
        setReviews([]);
      } else {
        const data = await reviewsRes.json().catch(() => null);
        const list: Review[] = Array.isArray(data) ? data : (data?.reviews ?? []);
        setReviews(Array.isArray(list) ? list : []);
      }

      if (!statsRes.ok) {
        const err = await statsRes.text().catch(() => "");
        console.error("Stats API error:", statsRes.status, err);
        setStats(null);
      } else {
        const data = await statsRes.json().catch(() => null);
        setStats(data ?? null);
      }
    } catch (error) {
      console.error("Error fetching reviews:", error);
      toast.error("Erreur lors du chargement des avis");
    } finally {
      setLoading(false);
    }
  }, [selectedPlaceId]);

  React.useEffect(() => {
    if (state.status === "signedIn") {
      void fetchReviews();
    }
  }, [state.status, fetchReviews]);

  const handleRefresh = React.useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetchReviews();
    } finally {
      setRefreshing(false);
    }
  }, [fetchReviews, refreshing]);

  const handleDeleteReview = React.useCallback(
    async (reviewId: number) => {
      if (deleting === reviewId || !authToken) return;

      setDeleting(reviewId);
      try {
        const res = await fetch(`/api/mysql/reviews/${reviewId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${authToken}` },
        });

        if (!res.ok) {
          const err = await res.text().catch(() => "");
          console.error("Delete review error:", res.status, err);
          toast.error("Erreur lors de la suppression");
          return;
        }

        toast.success("Avis supprimé", { duration: 1400 });
        await fetchReviews();
      } catch (error) {
        console.error("Error deleting review:", error);
        toast.error("Erreur lors de la suppression");
      } finally {
        setDeleting(null);
      }
    },
    [authToken, deleting, fetchReviews],
  );

  const email = state.status === "signedIn" ? state.email : undefined;

  return (
    <ProShell
      title="Avis Express"
      subtitle={email ? `Connecté : ${email}` : "Gérez les avis clients"}
      onSignOut={() => void signOut()}
    >
      <div className="space-y-6">
        {stats && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Average */}
            <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <div className="text-sm text-black/60">Note moyenne</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <div className="text-4xl font-bold text-black">{stats.averageRating.toFixed(1)}</div>
                      <span className="text-black/50">/5</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-black/60">Avis reçus</div>
                    <div className="mt-1 text-2xl font-semibold text-black">{stats.totalReviews}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <RatingStars rating={stats.averageRating} />
                  <div className="text-xs text-black/50">Basé sur {stats.totalReviews} avis</div>
                </div>
              </div>
            </div>

            {/* Distribution */}
            <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
              <div className="space-y-4">
                <div className="text-sm font-semibold text-black">Distribution des notes</div>
                <div className="space-y-2">
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <RatingBar
                      key={rating}
                      label={`${rating}★`}
                      count={stats.ratingDistribution[rating as 1 | 2 | 3 | 4 | 5]}
                      total={stats.totalReviews}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-black">Tous les avis</div>
              <HelpTooltip label="Aide avis">Liste des avis reçus sur votre menu.</HelpTooltip>

              <Button
                type="button"
                variant="outline"
                className="ml-auto h-9 rounded-xl border-black/10 bg-white text-black hover:bg-black/5"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
              >
                {refreshing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Rafraîchissement…
                  </>
                ) : (
                  "Rafraîchir"
                )}
              </Button>
            </div>

            <div className="mt-1 text-xs text-black/60">
              {loading ? "Chargement..." : `${reviews.length} avis`}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-black/60">Chargement des avis...</div>
            </div>
          ) : reviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="mb-2 h-8 w-8 text-black/20" />
              <div className="text-sm text-black/60">Aucun avis pour le moment</div>
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className={cn(
                    "flex gap-4 rounded-xl border border-black/10 bg-white p-4",
                    "transition-colors hover:bg-black/[0.02]",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <RatingStars rating={review.note} />
                      </div>

                      <div className="flex shrink-0 items-center gap-2 text-xs text-black/60">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(review.dateCreation)}</span>
                      </div>
                    </div>

                    {review.comment && (
                      <div className="mt-2 text-sm text-black/80 leading-relaxed">
                        {review.comment}
                      </div>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleDeleteReview(review.id)}
                    disabled={deleting === review.id}
                    className="shrink-0 text-black/50 hover:bg-red-500/10 hover:text-red-600"
                    aria-label="Supprimer l'avis"
                    title="Supprimer l'avis"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProShell>
  );
}

export default ReviewsPage;
