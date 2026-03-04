/**
 * ReviewSubmission Page V2
 *
 * Allows customers to submit a review after receiving an invitation.
 * Uses V2 API with universe-aware criteria, photo upload,
 * would_recommend toggle, and 50-char minimum comment.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Star,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Camera,
  X,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CriteriaRatingsForm,
  makeDefaultCriteriaV2,
  computeOverallFromCriteria,
  type ReviewCriteriaV2,
} from "@/components/reviews/CriteriaRating";
import { StarRating } from "@/components/reviews/StarRating";
import { PageLoading } from "@/components/PageLoading";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewInvitationData {
  id: string;
  establishment: {
    id: string;
    name: string | null;
    title: string | null;
    city: string | null;
    universe: string | null;
    cover_url: string | null;
  };
  reservation: {
    id: string;
    date: string | null;
    time: string | null;
    persons: number | null;
  } | null;
  user_id: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_COMMENT_LENGTH = 50;
const MAX_COMMENT_LENGTH = 1500;
const MAX_PHOTOS = 3;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReviewSubmission() {
  const { token } = useParams<{ token: string }>();

  // Loading states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Invitation data
  const [invitation, setInvitation] = useState<ReviewInvitationData | null>(
    null,
  );

  // Form state — V2
  const universe = invitation?.establishment?.universe ?? "restaurant";
  const [criteriaRatings, setCriteriaRatings] = useState<ReviewCriteriaV2>(
    makeDefaultCriteriaV2("restaurant", 5),
  );
  const [comment, setComment] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Computed overall
  const overallRating = useMemo(
    () => computeOverallFromCriteria(criteriaRatings),
    [criteriaRatings],
  );

  // ---------------------------------------------------------------------------
  // Load invitation
  // ---------------------------------------------------------------------------

  const loadInvitation = useCallback(async () => {
    if (!token) {
      setError("Lien invalide");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/consumer/v2/reviews/invitation/${encodeURIComponent(token)}`,
      );
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Invitation introuvable");
        setErrorCode(data.code || null);
        setLoading(false);
        return;
      }

      setInvitation(data.invitation);

      // Initialize criteria for the correct universe
      const uni = data.invitation?.establishment?.universe ?? "restaurant";
      setCriteriaRatings(makeDefaultCriteriaV2(uni, 5));
    } catch {
      setError("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadInvitation();
  }, [loadInvitation]);

  // ---------------------------------------------------------------------------
  // Photo upload
  // ---------------------------------------------------------------------------

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;

    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);

    try {
      for (const file of toUpload) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/consumer/v2/reviews/upload-photo", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (data.ok && data.url) {
          setPhotos((prev) => [...prev, data.url]);
        }
      }
    } catch {
      // Silently fail — photos are optional
    } finally {
      setUploading(false);
      // Reset input value
      e.target.value = "";
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const commentLength = comment.trim().length;
  const isCommentValid = commentLength >= MIN_COMMENT_LENGTH;
  const canSubmit = isCommentValid && !submitting;

  // ---------------------------------------------------------------------------
  // Submit review
  // ---------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!token || !invitation || !canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const body = {
        invitation_token: token,
        rating_welcome: criteriaRatings.welcome,
        rating_quality: criteriaRatings.quality,
        rating_value: criteriaRatings.value,
        rating_ambiance: criteriaRatings.ambiance,
        rating_hygiene: criteriaRatings.hygiene ?? null,
        rating_organization: criteriaRatings.organization ?? null,
        comment: comment.trim(),
        would_recommend: wouldRecommend,
        photos,
      };

      const res = await fetch("/api/consumer/v2/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Erreur lors de l'envoi");
        setSubmitting(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Erreur de connexion");
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render: Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return <PageLoading />;
  }

  // ---------------------------------------------------------------------------
  // Render: Error (no invitation loaded)
  // ---------------------------------------------------------------------------

  if (error && !invitation) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle>Oops !</CardTitle>
            <CardDescription>
              {errorCode === "ALREADY_COMPLETED"
                ? "Vous avez déjà soumis un avis pour cette réservation."
                : errorCode === "EXPIRED"
                  ? "Cette invitation a expiré."
                  : error}
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
  // Render: Success
  // ---------------------------------------------------------------------------

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
            <CardTitle>Merci pour votre avis !</CardTitle>
            <CardDescription>
              Votre avis a été envoyé et sera publié après modération par notre
              équipe.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-slate-600">
              Votre retour est précieux et aide les autres utilisateurs à faire
              leur choix.
            </p>
            <Button asChild>
              <Link to="/">Découvrir d'autres établissements</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Form
  // ---------------------------------------------------------------------------

  const establishment = invitation?.establishment;
  const establishmentName =
    establishment?.name || establishment?.title || "Établissement";

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">
            Donnez votre avis
          </h1>
          <p className="mt-2 text-slate-600">
            Partagez votre expérience chez{" "}
            <span className="font-semibold">{establishmentName}</span>
          </p>
        </div>

        {/* Establishment card */}
        {establishment && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {establishment.cover_url && (
                  <img
                    src={establishment.cover_url}
                    alt={establishmentName}
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                )}
                <div>
                  <div className="font-semibold text-lg">
                    {establishmentName}
                  </div>
                  <div className="text-sm text-slate-500">
                    {establishment.city}
                  </div>
                  {invitation?.reservation?.date && (
                    <div className="text-xs text-slate-400 mt-1">
                      Visite du {invitation.reservation.date}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Overall rating display */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Note globale</CardTitle>
            <CardDescription>
              Évaluez chaque critère, la note globale sera calculée
              automatiquement
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Overall rating computed */}
            <div className="flex flex-col items-center gap-3 py-4 bg-slate-50 rounded-lg">
              <StarRating
                value={overallRating}
                size={28}
                readonly
                ariaLabel="Note globale"
              />
              <div className="text-3xl font-bold text-slate-900">
                {overallRating.toFixed(1)}
                <span className="text-lg text-slate-400">/5</span>
              </div>
              <p className="text-xs text-slate-500">
                Moyenne calculée à partir de vos notes ci-dessous
              </p>
            </div>

            {/* Criteria ratings — V2 universe-aware */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">
                Notes détaillées
              </Label>
              <p className="text-sm text-slate-500 mb-3">
                Évaluez chaque aspect de votre expérience
              </p>
              <CriteriaRatingsForm
                value={criteriaRatings}
                onChange={setCriteriaRatings}
                universe={universe}
              />
            </div>
          </CardContent>
        </Card>

        {/* Comment form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Votre commentaire</CardTitle>
            <CardDescription>
              Décrivez votre expérience en détail (minimum {MIN_COMMENT_LENGTH}{" "}
              caractères)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="comment">Commentaire *</Label>
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Décrivez votre expérience : l'accueil, la qualité, l'ambiance, le rapport qualité-prix..."
                rows={5}
                maxLength={MAX_COMMENT_LENGTH}
                className={cn(
                  commentLength > 0 && !isCommentValid && "border-amber-400",
                )}
              />
              <div className="flex justify-between text-xs">
                <span
                  className={cn(
                    commentLength > 0 && !isCommentValid
                      ? "text-amber-600"
                      : "text-slate-400",
                  )}
                >
                  {commentLength > 0 && !isCommentValid
                    ? `Encore ${MIN_COMMENT_LENGTH - commentLength} caractères minimum`
                    : ""}
                </span>
                <span className="text-slate-400">
                  {commentLength}/{MAX_COMMENT_LENGTH}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Would recommend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Recommanderiez-vous cet établissement ?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setWouldRecommend(wouldRecommend === true ? null : true)
                }
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-lg border-2 p-4 transition-all",
                  wouldRecommend === true
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                <ThumbsUp className="h-5 w-5" />
                <span className="font-medium">Oui</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setWouldRecommend(wouldRecommend === false ? null : false)
                }
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-lg border-2 p-4 transition-all",
                  wouldRecommend === false
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                <ThumbsDown className="h-5 w-5" />
                <span className="font-medium">Non</span>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Photos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Photos (optionnel)</CardTitle>
            <CardDescription>
              Ajoutez jusqu'à {MAX_PHOTOS} photos de votre expérience
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Photo previews */}
              {photos.length > 0 && (
                <div className="flex gap-3 flex-wrap">
                  {photos.map((url, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={url}
                        alt={`Photo ${idx + 1}`}
                        className="w-24 h-24 rounded-lg object-cover border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute -top-2 -end-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload button */}
              {photos.length < MAX_PHOTOS && (
                <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-4 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <Camera className="h-5 w-5 text-slate-400" />
                  )}
                  <span className="text-sm text-slate-600">
                    {uploading
                      ? "Envoi en cours..."
                      : `Ajouter une photo (${photos.length}/${MAX_PHOTOS})`}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Error message */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Submit button */}
        <div className="flex justify-center pt-4">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-8"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
                Envoi en cours...
              </>
            ) : (
              <>
                <Star className="h-4 w-4 me-2" />
                Envoyer mon avis
              </>
            )}
          </Button>
        </div>

        {/* Validation hint */}
        {!isCommentValid && commentLength > 0 && (
          <p className="text-center text-xs text-amber-600">
            Votre commentaire doit contenir au moins {MIN_COMMENT_LENGTH}{" "}
            caractères pour être envoyé.
          </p>
        )}

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400 pb-8">
          Votre avis sera modéré avant publication. Les avis respectueux et
          constructifs aident la communauté à faire de meilleurs choix.
        </p>
      </div>
    </div>
  );
}
