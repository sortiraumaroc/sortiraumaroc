/**
 * GestureResponse Page
 *
 * Allows a customer to accept or refuse a commercial gesture
 * proposed by an establishment owner in response to a negative review.
 *
 * Route: /review/gesture/:gestureId
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Gift,
  ThumbsUp,
  ThumbsDown,
  Star,
  Clock,
  Tag,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/reviews/StarRating";
import { PageLoading } from "@/components/PageLoading";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GestureDetails {
  gesture: {
    id: string;
    message: string;
    status: string;
    discount_percent: number;
    promo_code: string | null;
    proposed_at: string;
    expires_at: string | null;
  };
  establishment: {
    name: string | null;
    title: string | null;
    city: string | null;
    cover_url: string | null;
  };
  review: {
    rating_overall: number;
    comment: string;
    created_at: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTimeRemaining(expiresAt: string): string {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - now.getTime();

  if (diffMs <= 0) return "Expiré";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}min restantes`;
  return `${minutes} minutes restantes`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GestureResponse() {
  const { gestureId } = useParams<{ gestureId: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<GestureDetails | null>(null);
  const [result, setResult] = useState<"accepted" | "refused" | null>(null);

  // ---------------------------------------------------------------------------
  // Load gesture details
  // ---------------------------------------------------------------------------

  const loadGesture = useCallback(async () => {
    if (!gestureId) {
      setError("Lien invalide");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/consumer/v2/reviews/gesture/${encodeURIComponent(gestureId)}`,
      );
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Geste commercial introuvable");
        setLoading(false);
        return;
      }

      setDetails(data);
    } catch {
      setError("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [gestureId]);

  useEffect(() => {
    void loadGesture();
  }, [loadGesture]);

  // ---------------------------------------------------------------------------
  // Respond to gesture
  // ---------------------------------------------------------------------------

  const handleRespond = async (action: "accept" | "refuse") => {
    if (!gestureId || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/consumer/v2/reviews/gesture/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gesture_id: gestureId,
          action,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Erreur lors de la réponse");
        setSubmitting(false);
        return;
      }

      setResult(action === "accept" ? "accepted" : "refused");
    } catch {
      setError("Erreur de connexion");
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render: Loading
  // ---------------------------------------------------------------------------

  if (loading) return <PageLoading />;

  // ---------------------------------------------------------------------------
  // Render: Error
  // ---------------------------------------------------------------------------

  if (error && !details) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle>Oops !</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild variant="outline">
              <Link to="/">
                <ArrowLeft className="h-4 w-4 me-2" />
                Retour à l'accueil
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Result (accepted/refused)
  // ---------------------------------------------------------------------------

  if (result) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            {result === "accepted" ? (
              <>
                <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                <CardTitle>Geste commercial accepté !</CardTitle>
                <CardDescription>
                  Merci d'avoir accepté la proposition de l'établissement.
                </CardDescription>
              </>
            ) : (
              <>
                <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                <CardTitle>Geste commercial refusé</CardTitle>
                <CardDescription>
                  Votre avis sera publié normalement avec mention de la
                  proposition de geste commercial.
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent className="text-center space-y-4">
            {result === "accepted" && details?.gesture.promo_code && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="text-xs text-emerald-600 mb-1">
                  Votre code promo
                </div>
                <div className="text-2xl font-bold text-emerald-700 font-mono tracking-wider">
                  {details.gesture.promo_code}
                </div>
                <div className="text-xs text-emerald-600 mt-1">
                  {details.gesture.discount_percent}% de réduction
                </div>
              </div>
            )}
            <p className="text-sm text-slate-600">
              {result === "accepted"
                ? "Vous recevrez un email avec les détails de votre code promo."
                : "Nous apprécions votre retour honnête."}
            </p>
            <Button asChild>
              <Link to="/">Retour à l'accueil</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Already handled
  // ---------------------------------------------------------------------------

  if (
    details?.gesture.status === "accepted" ||
    details?.gesture.status === "refused" ||
    details?.gesture.status === "expired"
  ) {
    const statusMap = {
      accepted: { label: "accepté", color: "text-emerald-600" },
      refused: { label: "refusé", color: "text-red-600" },
      expired: { label: "expiré", color: "text-slate-600" },
    } as const;
    const s = statusMap[details.gesture.status as keyof typeof statusMap];

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Gift className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <CardTitle>Geste commercial {s.label}</CardTitle>
            <CardDescription>
              Ce geste commercial a déjà été traité.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild variant="outline">
              <Link to="/">
                <ArrowLeft className="h-4 w-4 me-2" />
                Retour à l'accueil
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Gesture proposal
  // ---------------------------------------------------------------------------

  const estName =
    details?.establishment.name ||
    details?.establishment.title ||
    "L'établissement";
  const isExpired =
    details?.gesture.expires_at &&
    new Date(details.gesture.expires_at) < new Date();

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <Gift className="h-10 w-10 text-primary mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-slate-900">
            Geste commercial
          </h1>
          <p className="mt-2 text-slate-600">
            <span className="font-semibold">{estName}</span> vous propose un
            geste commercial suite à votre avis
          </p>
        </div>

        {/* Your review summary */}
        {details?.review && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-500">
                Votre avis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <StarRating
                  value={details.review.rating_overall}
                  size={16}
                  readonly
                />
                <span className="text-sm font-medium">
                  {details.review.rating_overall.toFixed(1)}/5
                </span>
              </div>
              <p className="text-sm text-slate-700 line-clamp-3">
                {details.review.comment}
              </p>
              <p className="text-xs text-slate-400">
                Publié le {formatDate(details.review.created_at)}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Gesture proposal */}
        <Card className="border-primary/30 bg-primary/[0.02]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Proposition de l'établissement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Message */}
            <div className="bg-white rounded-lg p-4 border border-slate-200">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {details?.gesture.message}
              </p>
            </div>

            {/* Discount */}
            <div className="flex items-center gap-3 bg-emerald-50 rounded-lg p-3">
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Tag className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="font-bold text-emerald-700 text-lg">
                  {details?.gesture.discount_percent}% de réduction
                </div>
                <div className="text-xs text-emerald-600">
                  Code promo à utiliser lors de votre prochaine visite
                </div>
              </div>
            </div>

            {/* Deadline */}
            {details?.gesture.expires_at && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Clock className="h-4 w-4" />
                {isExpired ? (
                  <span className="text-red-600">
                    Cette offre a expiré
                  </span>
                ) : (
                  <span>{formatTimeRemaining(details.gesture.expires_at)}</span>
                )}
              </div>
            )}

            {/* Info about what happens */}
            <div className="bg-slate-50 rounded-lg p-3 space-y-2 text-xs text-slate-600">
              <p className="font-medium text-slate-700">
                En acceptant ce geste :
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  Vous recevrez un code promo par email
                </li>
                <li>
                  Votre avis ne sera pas publié
                </li>
              </ul>
              <p className="font-medium text-slate-700 pt-1">
                En refusant :
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  Votre avis sera publié avec mention du geste commercial
                  proposé
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        {!isExpired && (
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleRespond("refuse")}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <ThumbsDown className="h-4 w-4 me-2" />
              )}
              Refuser
            </Button>
            <Button
              className="flex-1"
              onClick={() => handleRespond("accept")}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <ThumbsUp className="h-4 w-4 me-2" />
              )}
              Accepter
            </Button>
          </div>
        )}

        {isExpired && (
          <div className="text-center">
            <Badge variant="secondary" className="text-red-600">
              Cette offre a expiré
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}
