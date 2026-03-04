/**
 * EstablishmentReviewsSection V2
 *
 * Displays published reviews for an establishment on the public listing page.
 * Uses V2 API with per-criteria display, photos, votes, gesture mentions,
 * pro responses, and review summary stats.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  MessageSquare,
  Star,
  ThumbsUp,
  ThumbsDown,
  User,
  Camera,
  Gift,
  ChevronDown,
  ChevronUp,
  Flag,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/reviews/StarRating";
import { CriteriaRatingsDisplay } from "@/components/reviews/CriteriaRating";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CRITERIA_LABELS_FR } from "@shared/reviewTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublicReviewV2 {
  id: string;
  user_name: string | null;
  rating_welcome: number;
  rating_quality: number;
  rating_value: number;
  rating_ambiance: number;
  rating_hygiene: number | null;
  rating_organization: number | null;
  rating_overall: number;
  comment: string | null;
  would_recommend: boolean | null;
  photos: string[];
  gesture_mention: boolean;
  published_at: string | null;
  created_at: string;
  pro_response: {
    content: string;
    published_at: string | null;
  } | null;
  votes: {
    useful_count: number;
    not_useful_count: number;
  };
}

interface ReviewSummary {
  total_reviews: number;
  avg_overall: number;
  avg_welcome: number;
  avg_quality: number;
  avg_value: number;
  avg_ambiance: number;
  avg_hygiene: number | null;
  avg_organization: number | null;
  stars_distribution: Record<string, number>;
  recommendation_rate: number | null;
  reviews_with_photos: number;
}

interface EstablishmentReviewsSectionProps {
  establishmentId: string;
  universe?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getRatingLabel(rating: number): string {
  if (rating >= 4.5) return "Excellent";
  if (rating >= 4) return "Très bien";
  if (rating >= 3.5) return "Bien";
  if (rating >= 3) return "Correct";
  if (rating >= 2) return "Moyen";
  return "Décevant";
}

function getRatingColor(rating: number): string {
  if (rating >= 4) return "text-emerald-600";
  if (rating >= 3) return "text-amber-600";
  return "text-red-600";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StarsDistribution({
  distribution,
  total,
}: {
  distribution: Record<string, number>;
  total: number;
}) {
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution[String(star)] ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-sm">
            <span className="w-3 text-end text-slate-500">{star}</span>
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 text-end text-xs text-slate-500">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function VoteButtons({
  reviewId,
  votes,
}: {
  reviewId: string;
  votes: { useful_count: number; not_useful_count: number };
}) {
  const [voted, setVoted] = useState<"useful" | "not_useful" | null>(null);
  const [counts, setCounts] = useState(votes);

  const handleVote = async (vote: "useful" | "not_useful") => {
    try {
      const res = await fetch("/api/consumer/v2/reviews/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_id: reviewId, vote }),
      });
      const data = await res.json();
      if (data.ok) {
        if (voted === vote) {
          // Toggle off
          setVoted(null);
          setCounts((prev) => ({
            ...prev,
            [`${vote}_count`]: Math.max(0, prev[`${vote}_count`] - 1),
          }));
        } else {
          // If switching vote, decrement old and increment new
          if (voted) {
            setCounts((prev) => ({
              ...prev,
              [`${voted}_count`]: Math.max(0, prev[`${voted}_count`] - 1),
              [`${vote}_count`]: prev[`${vote}_count`] + 1,
            }));
          } else {
            setCounts((prev) => ({
              ...prev,
              [`${vote}_count`]: prev[`${vote}_count`] + 1,
            }));
          }
          setVoted(vote);
        }
      }
    } catch {
      // Silently fail
    }
  };

  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <span>Cet avis vous a été utile ?</span>
      <button
        type="button"
        onClick={() => handleVote("useful")}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 transition-colors",
          voted === "useful" && "text-emerald-600 bg-emerald-50",
        )}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
        <span>{counts.useful_count}</span>
      </button>
      <button
        type="button"
        onClick={() => handleVote("not_useful")}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 transition-colors",
          voted === "not_useful" && "text-red-600 bg-red-50",
        )}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
        <span>{counts.not_useful_count}</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function EstablishmentReviewsSection({
  establishmentId,
  universe,
  className = "",
}: EstablishmentReviewsSectionProps) {
  const { t } = useI18n();

  const [reviews, setReviews] = useState<PublicReviewV2[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load reviews + summary
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const ref = encodeURIComponent(establishmentId);

        const [reviewsRes, summaryRes] = await Promise.all([
          fetch(`/api/public/v2/establishments/${ref}/reviews?limit=20`),
          fetch(`/api/public/v2/establishments/${ref}/reviews/summary`),
        ]);

        const [reviewsData, summaryData] = await Promise.all([
          reviewsRes.json(),
          summaryRes.json(),
        ]);

        if (reviewsData.ok) {
          setReviews(reviewsData.items ?? []);
        }
        if (summaryData.ok && summaryData.summary) {
          setSummary(summaryData.summary);
        }
      } catch {
        setError("Erreur de chargement");
      } finally {
        setLoading(false);
      }
    };

    if (establishmentId) {
      load();
    }
  }, [establishmentId]);

  // ---------------------------------------------------------------------------
  // Don't render if no reviews
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className={`py-8 text-center ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
      </div>
    );
  }

  if (error || (reviews.length === 0 && !summary)) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // Compute display
  // ---------------------------------------------------------------------------

  const totalReviews = summary?.total_reviews ?? reviews.length;
  const avgRating = summary?.avg_overall ?? 0;
  const displayedReviews = showAll ? reviews : reviews.slice(0, 3);

  return (
    <div className={className}>
      {/* Section header + summary */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">
            Avis clients ({totalReviews})
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              <span className="font-bold text-lg">{avgRating.toFixed(1)}</span>
            </div>
            <span className={cn("text-sm font-medium", getRatingColor(avgRating))}>
              {getRatingLabel(avgRating)}
            </span>
          </div>
        </div>

        {/* Summary stats */}
        {summary && totalReviews > 0 && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Stars distribution */}
                <StarsDistribution
                  distribution={summary.stars_distribution}
                  total={totalReviews}
                />

                {/* Criteria averages */}
                <div className="space-y-2">
                  {[
                    { key: "welcome", val: summary.avg_welcome },
                    { key: "quality", val: summary.avg_quality },
                    { key: "value", val: summary.avg_value },
                    { key: "ambiance", val: summary.avg_ambiance },
                    ...(summary.avg_hygiene != null
                      ? [{ key: "hygiene", val: summary.avg_hygiene }]
                      : []),
                    ...(summary.avg_organization != null
                      ? [{ key: "organization", val: summary.avg_organization }]
                      : []),
                  ].map(({ key, val }) => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className="w-28 text-slate-600 truncate">
                        {CRITERIA_LABELS_FR[key as keyof typeof CRITERIA_LABELS_FR]}
                      </span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(val / 5) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-end text-xs font-medium text-slate-700">
                        {val.toFixed(1)}
                      </span>
                    </div>
                  ))}

                  {/* Recommendation rate */}
                  {summary.recommendation_rate != null && (
                    <div className="pt-2 mt-2 border-t border-slate-100 flex items-center gap-2 text-sm">
                      <ThumbsUp className="h-4 w-4 text-emerald-500" />
                      <span className="text-slate-600">
                        {Math.round(summary.recommendation_rate)}% recommandent
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Reviews list */}
      <div className="space-y-4">
        {displayedReviews.map((review) => {
          const isExpanded = expandedReview === review.id;

          return (
            <Card key={review.id} className="overflow-hidden">
              <CardContent className="p-4">
                {/* Review header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <User className="h-5 w-5 text-slate-400" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">
                        {review.user_name || "Client"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatDate(
                          review.published_at || review.created_at,
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {review.would_recommend === true && (
                      <Badge
                        variant="outline"
                        className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs"
                      >
                        <ThumbsUp className="h-3 w-3 me-1" />
                        Recommande
                      </Badge>
                    )}
                    <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-bold text-sm">
                        {review.rating_overall.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Comment */}
                {review.comment && (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap mb-3">
                    {review.comment}
                  </p>
                )}

                {/* Photos */}
                {review.photos && review.photos.length > 0 && (
                  <div className="flex gap-2 mb-3">
                    {review.photos.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPhotoModal(url)}
                        className="relative overflow-hidden rounded-lg border border-slate-200"
                      >
                        <img
                          src={url}
                          alt={`Photo ${idx + 1}`}
                          className="w-20 h-20 object-cover hover:opacity-80 transition-opacity"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* Gesture mention */}
                {review.gesture_mention && (
                  <div className="flex items-center gap-2 mb-3 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1.5">
                    <Gift className="h-3.5 w-3.5" />
                    <span>
                      Un geste commercial a été proposé suite à cet avis
                    </span>
                  </div>
                )}

                {/* Criteria expand toggle */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedReview(isExpanded ? null : review.id)
                  }
                  className="flex items-center gap-1 text-xs text-primary hover:underline mb-3"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      Masquer les notes détaillées
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Voir les notes détaillées
                    </>
                  )}
                </button>

                {isExpanded && (
                  <div className="mb-3">
                    <CriteriaRatingsDisplay
                      criteria={{
                        welcome: review.rating_welcome,
                        quality: review.rating_quality,
                        value: review.rating_value,
                        ambiance: review.rating_ambiance,
                        ...(review.rating_hygiene != null
                          ? { hygiene: review.rating_hygiene }
                          : {}),
                        ...(review.rating_organization != null
                          ? { organization: review.rating_organization }
                          : {}),
                      }}
                      universe={universe}
                      compact
                    />
                  </div>
                )}

                {/* Pro response */}
                {review.pro_response && (
                  <div className="bg-primary/5 rounded-lg p-3 border-s-4 border-primary mt-3 mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-primary">
                        Réponse de l'établissement
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">
                      {review.pro_response.content}
                    </p>
                  </div>
                )}

                {/* Vote buttons */}
                <div className="pt-2 border-t border-slate-100">
                  <VoteButtons reviewId={review.id} votes={review.votes} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Show more / less */}
      {reviews.length > 3 && !showAll && (
        <div className="text-center mt-4">
          <Button variant="outline" onClick={() => setShowAll(true)}>
            Voir tous les avis ({reviews.length - 3} de plus)
          </Button>
        </div>
      )}

      {showAll && reviews.length > 3 && (
        <div className="text-center mt-4">
          <Button variant="ghost" onClick={() => setShowAll(false)}>
            Voir moins
          </Button>
        </div>
      )}

      {/* Photo modal */}
      {photoModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPhotoModal(null)}
        >
          <img
            src={photoModal}
            alt="Photo agrandie"
            className="max-w-full max-h-[90vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default EstablishmentReviewsSection;

/**
 * Hook pour vérifier si un établissement a des avis publiés.
 * Utile pour conditionner l'affichage de l'onglet "avis" dans EstablishmentTabs.
 */
export function useHasReviews(establishmentId: string | null): boolean {
  const [hasReviews, setHasReviews] = useState(false);

  useEffect(() => {
    if (!establishmentId) return;
    let cancelled = false;

    (async () => {
      try {
        const ref = encodeURIComponent(establishmentId);
        const res = await fetch(`/api/public/v2/establishments/${ref}/reviews/summary`);
        const data = await res.json();
        if (!cancelled && data.ok && data.summary && data.summary.total_reviews > 0) {
          setHasReviews(true);
        }
      } catch {
        // silent
      }
    })();

    return () => { cancelled = true; };
  }, [establishmentId]);

  return hasReviews;
}
