/**
 * EstablishmentReviewsSection
 *
 * Displays published reviews for an establishment on the public listing page
 */

import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Star, ThumbsUp, User } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/reviews/StarRating";
import { useI18n } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublicReview {
  id: string;
  overall_rating: number;
  criteria_ratings: Record<string, number>;
  title: string | null;
  comment: string | null;
  anonymous: boolean;
  user_display_name: string | null;
  pro_public_response: string | null;
  published_at: string;
  created_at: string;
}

interface EstablishmentReviewsSectionProps {
  establishmentId: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("fr-FR", {
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EstablishmentReviewsSection({
  establishmentId,
  className = "",
}: EstablishmentReviewsSectionProps) {
  const { t } = useI18n();

  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // ---------------------------------------------------------------------------
  // Load reviews
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const loadReviews = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/public/establishments/${encodeURIComponent(establishmentId)}/reviews`
        );
        const data = await res.json();

        if (!res.ok || !data.ok) {
          setError(data.error || "Erreur de chargement");
          setReviews([]);
        } else {
          setReviews(data.reviews || []);
        }
      } catch (err) {
        setError("Erreur de connexion");
        setReviews([]);
      } finally {
        setLoading(false);
      }
    };

    if (establishmentId) {
      loadReviews();
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

  if (error || reviews.length === 0) {
    return null; // Don't show section if no reviews
  }

  // ---------------------------------------------------------------------------
  // Calculate stats
  // ---------------------------------------------------------------------------

  const avgRating =
    reviews.reduce((sum, r) => sum + r.overall_rating, 0) / reviews.length;
  const displayedReviews = showAll ? reviews : reviews.slice(0, 3);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={className}>
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900">
          Avis clients ({reviews.length})
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            <span className="font-bold text-lg">{avgRating.toFixed(1)}</span>
          </div>
          <span className="text-sm text-slate-500">
            {getRatingLabel(avgRating)}
          </span>
        </div>
      </div>

      {/* Reviews list */}
      <div className="space-y-4">
        {displayedReviews.map((review) => (
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
                      {review.anonymous
                        ? "Client anonyme"
                        : review.user_display_name || "Client"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDate(review.published_at || review.created_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-bold text-sm">
                    {review.overall_rating.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* Review title */}
              {review.title && (
                <h4 className="font-semibold text-slate-900 mb-2">
                  {review.title}
                </h4>
              )}

              {/* Review comment */}
              {review.comment && (
                <p className="text-sm text-slate-700 whitespace-pre-wrap mb-3">
                  {review.comment}
                </p>
              )}

              {/* Criteria ratings (optional display) */}
              {review.criteria_ratings &&
                Object.keys(review.criteria_ratings).length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {Object.entries(review.criteria_ratings).map(
                      ([key, value]) => {
                        const labels: Record<string, string> = {
                          accueil: "Accueil",
                          cadre_ambiance: "Ambiance",
                          service: "Service",
                          qualite_prestation: "Qualité",
                          prix: "Prix",
                          emplacement: "Emplacement",
                        };
                        return (
                          <span
                            key={key}
                            className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded"
                          >
                            {labels[key] || key}: {value}/5
                          </span>
                        );
                      }
                    )}
                  </div>
                )}

              {/* Pro response */}
              {review.pro_public_response && (
                <div className="bg-primary/5 rounded-lg p-3 border-l-4 border-primary mt-3">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-primary">
                      Réponse de l'établissement
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">
                    {review.pro_public_response}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Show more button */}
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
    </div>
  );
}

export default EstablishmentReviewsSection;
