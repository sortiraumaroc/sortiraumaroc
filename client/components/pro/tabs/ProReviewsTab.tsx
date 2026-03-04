/**
 * ProReviewsTab V2
 *
 * Tab for pro users to manage reviews:
 * - View all reviews per establishment (with filters)
 * - Propose commercial gestures for negative reviews
 * - Submit public responses
 * - View stats
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Check,
  Clock,
  Gift,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Star,
  ThumbsUp,
  Eye,
} from "lucide-react";

import { toast } from "@/hooks/use-toast";

import type { Establishment, ProRole } from "@/lib/pro/types";
import {
  listProReviewsV2,
  getProReviewDetailV2,
  proposeGestureV2,
  submitProResponseV2,
  getProReviewStatsV2,
  type ProReviewV2,
  type ProReviewStatsV2,
} from "@/lib/pro/api";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StarRating } from "@/components/reviews/StarRating";
import { CriteriaRatingsDisplay } from "@/components/reviews/CriteriaRating";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  establishment: Establishment;
  role: ProRole;
};

// ---------------------------------------------------------------------------
// Quick response templates
// ---------------------------------------------------------------------------

const QUICK_RESPONSES = [
  {
    label: "Remerciement",
    text: "Merci beaucoup pour votre avis ! Nous sommes ravis que votre expérience ait été agréable. Au plaisir de vous revoir bientôt.",
  },
  {
    label: "Prise en compte",
    text: "Merci pour votre retour. Nous prenons bonne note de vos remarques et travaillons continuellement à améliorer nos services.",
  },
  {
    label: "Excuses",
    text: "Nous sommes désolés que votre expérience n'ait pas été à la hauteur de vos attentes. Nous prenons vos remarques très au sérieux et ferons le nécessaire pour nous améliorer.",
  },
  {
    label: "Invitation",
    text: "Merci pour votre avis. Nous serions ravis de vous accueillir à nouveau pour vous montrer les améliorations que nous avons apportées.",
  },
];

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const REVIEW_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_commercial_gesture: {
    label: "En attente de geste",
    color: "bg-purple-50 text-purple-700 border-purple-200",
  },
  published: {
    label: "Publié",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  resolved: {
    label: "Résolu",
    color: "bg-slate-100 text-slate-700 border-slate-200",
  },
  approved: {
    label: "Approuvé",
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimeRemaining(deadline: string): string {
  const now = Date.now();
  const target = new Date(deadline).getTime();
  const diff = target - now;
  if (diff <= 0) return "Expiré";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProReviewsTab({ establishment, role }: Props) {
  // Reviews
  const [reviews, setReviews] = useState<ProReviewV2[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  // Stats
  const [stats, setStats] = useState<ProReviewStatsV2 | null>(null);

  // Detail dialog
  const [selectedReview, setSelectedReview] = useState<ProReviewV2 | null>(null);

  // Gesture dialog
  const [showGestureDialog, setShowGestureDialog] = useState(false);
  const [gestureReviewId, setGestureReviewId] = useState<string | null>(null);
  const [gestureMessage, setGestureMessage] = useState("");
  const [gestureDiscount, setGestureDiscount] = useState(10);
  const [submittingGesture, setSubmittingGesture] = useState(false);

  // Response dialog
  const [showResponseDialog, setShowResponseDialog] = useState(false);
  const [responseReviewId, setResponseReviewId] = useState<string | null>(null);
  const [responseContent, setResponseContent] = useState("");
  const [submittingResponse, setSubmittingResponse] = useState(false);

  const canManageGestures = role === "owner" || role === "manager";

  // ---------------------------------------------------------------------------
  // Load reviews
  // ---------------------------------------------------------------------------

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listProReviewsV2(establishment.id, {
        status: statusFilter,
        page,
        limit: 20,
        sort_by: "created_at",
        sort_order: "desc",
      });
      if (res.ok) {
        setReviews(res.items);
        setTotal(res.total);
      }
    } catch (err: unknown) {
      toast({
        title: "Erreur",
        description:
          err instanceof Error ? err.message : "Erreur de chargement",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [establishment.id, statusFilter, page]);

  // ---------------------------------------------------------------------------
  // Load stats
  // ---------------------------------------------------------------------------

  const loadStats = useCallback(async () => {
    try {
      const res = await getProReviewStatsV2(establishment.id);
      if (res.ok) setStats(res.stats);
    } catch {
      // Non-critical
    }
  }, [establishment.id]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // ---------------------------------------------------------------------------
  // Propose gesture
  // ---------------------------------------------------------------------------

  const openGestureDialog = (reviewId: string) => {
    setGestureReviewId(reviewId);
    setGestureMessage("");
    setGestureDiscount(10);
    setShowGestureDialog(true);
  };

  const handleProposeGesture = async () => {
    if (!gestureReviewId || !gestureMessage.trim()) return;
    setSubmittingGesture(true);
    try {
      const res = await proposeGestureV2(establishment.id, {
        review_id: gestureReviewId,
        message: gestureMessage.trim(),
        discount_bps: gestureDiscount * 100, // Convert % to basis points
      });
      if (res.ok) {
        toast({
          title: "Geste commercial envoyé",
          description: "Le client a été notifié de votre proposition.",
        });
        setShowGestureDialog(false);
        void loadReviews();
        void loadStats();
      }
    } catch (err: unknown) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setSubmittingGesture(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Submit response
  // ---------------------------------------------------------------------------

  const openResponseDialog = (reviewId: string) => {
    setResponseReviewId(reviewId);
    setResponseContent("");
    setShowResponseDialog(true);
  };

  const handleSubmitResponse = async () => {
    if (!responseReviewId || !responseContent.trim()) return;
    setSubmittingResponse(true);
    try {
      const res = await submitProResponseV2(establishment.id, {
        review_id: responseReviewId,
        content: responseContent.trim(),
      });
      if (res.ok) {
        toast({
          title: "Réponse envoyée",
          description:
            "Votre réponse sera visible après modération par notre équipe.",
        });
        setShowResponseDialog(false);
        void loadReviews();
      }
    } catch (err: unknown) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setSubmittingResponse(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold">{stats.total_reviews}</div>
              <div className="text-xs text-slate-500">Total avis</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="flex items-center justify-center gap-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="text-xl font-bold">
                  {stats.avg_overall.toFixed(1)}
                </span>
              </div>
              <div className="text-xs text-slate-500">Note moyenne</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-purple-600">
                {stats.pending_gesture}
              </div>
              <div className="text-xs text-slate-500">Gestes en attente</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-emerald-600">
                {stats.published}
              </div>
              <div className="text-xs text-slate-500">Publiés</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold">
                {Math.round(stats.response_rate)}%
              </div>
              <div className="text-xs text-slate-500">Taux de réponse</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les avis</SelectItem>
            <SelectItem value="pending_commercial_gesture">
              Geste en attente
            </SelectItem>
            <SelectItem value="published">Publiés</SelectItem>
            <SelectItem value="resolved">Résolus</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => loadReviews()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <span className="text-sm text-slate-500 ms-auto">
          {total} avis
        </span>
      </div>

      {/* Reviews list */}
      {loading ? (
        <div className="py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        </div>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-slate-500">
            <BarChart3 className="h-8 w-8 mx-auto mb-3 text-slate-300" />
            <p>Aucun avis pour le moment</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => {
            const isNegative = review.rating_overall < 4;
            const canGesture =
              canManageGestures &&
              review.status === "pending_commercial_gesture" &&
              review.commercial_gesture_status === "none";
            const canRespond =
              review.status === "published" && !review.pro_response;

            return (
              <Card key={review.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Rating */}
                    <div
                      className={cn(
                        "flex flex-col items-center gap-1 min-w-[50px] p-2 rounded-lg",
                        isNegative ? "bg-red-50" : "bg-emerald-50",
                      )}
                    >
                      <Star
                        className={cn(
                          "h-5 w-5",
                          isNegative
                            ? "fill-red-400 text-red-400"
                            : "fill-yellow-400 text-yellow-400",
                        )}
                      />
                      <span
                        className={cn(
                          "font-bold text-lg",
                          isNegative ? "text-red-600" : "text-emerald-600",
                        )}
                      >
                        {review.rating_overall.toFixed(1)}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {/* Status badge */}
                        {REVIEW_STATUS_LABELS[review.status] && (
                          <Badge
                            className={
                              REVIEW_STATUS_LABELS[review.status].color
                            }
                          >
                            {REVIEW_STATUS_LABELS[review.status].label}
                          </Badge>
                        )}
                        {review.commercial_gesture_status !== "none" && (
                          <Badge
                            variant="outline"
                            className="text-purple-600 border-purple-200"
                          >
                            <Gift className="h-3 w-3 me-1" />
                            {review.commercial_gesture_status === "proposed"
                              ? "Geste proposé"
                              : review.commercial_gesture_status === "accepted"
                                ? "Geste accepté"
                                : review.commercial_gesture_status === "refused"
                                  ? "Geste refusé"
                                  : review.commercial_gesture_status}
                          </Badge>
                        )}
                        {review.pro_response && (
                          <Badge
                            variant="outline"
                            className="text-blue-600 border-blue-200"
                          >
                            <MessageSquare className="h-3 w-3 me-1" />
                            Répondu
                          </Badge>
                        )}
                        {review.would_recommend === true && (
                          <Badge
                            variant="outline"
                            className="text-emerald-600 border-emerald-200"
                          >
                            <ThumbsUp className="h-3 w-3 me-1" />
                            Recommande
                          </Badge>
                        )}
                      </div>

                      {/* Comment */}
                      <p className="text-sm text-slate-700 line-clamp-3 mb-2">
                        {review.comment}
                      </p>

                      {/* Meta */}
                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span>{review.user_name || "Client"}</span>
                        <span>•</span>
                        <span>{formatDate(review.created_at)}</span>
                        {review.gesture_deadline && (
                          <>
                            <span>•</span>
                            <span className="text-amber-600 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTimeRemaining(review.gesture_deadline)}
                            </span>
                          </>
                        )}
                        {review.votes.useful_count > 0 && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <ThumbsUp className="h-3 w-3" />
                              {review.votes.useful_count} utile(s)
                            </span>
                          </>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedReview(review)}
                        >
                          <Eye className="h-3.5 w-3.5 me-1" />
                          Détail
                        </Button>
                        {canGesture && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-purple-600 border-purple-200"
                            onClick={() => openGestureDialog(review.id)}
                          >
                            <Gift className="h-3.5 w-3.5 me-1" />
                            Proposer geste
                          </Button>
                        )}
                        {canRespond && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-blue-600 border-blue-200"
                            onClick={() => openResponseDialog(review.id)}
                          >
                            <MessageSquare className="h-3.5 w-3.5 me-1" />
                            Répondre
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Précédent
          </Button>
          <span className="text-sm text-slate-500 self-center px-3">
            Page {page} / {Math.ceil(total / 20)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(total / 20)}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </Button>
        </div>
      )}

      {/* ================================================================= */}
      {/* REVIEW DETAIL DIALOG */}
      {/* ================================================================= */}

      <Dialog
        open={!!selectedReview}
        onOpenChange={(open) => !open && setSelectedReview(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedReview && (
            <>
              <DialogHeader>
                <DialogTitle>Détail de l'avis</DialogTitle>
                <DialogDescription>
                  Par {selectedReview.user_name || "Client"} —{" "}
                  {formatDate(selectedReview.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Overall */}
                <div className="flex items-center gap-3">
                  <StarRating
                    value={selectedReview.rating_overall}
                    size={20}
                    readonly
                  />
                  <span className="text-lg font-bold">
                    {selectedReview.rating_overall.toFixed(1)}/5
                  </span>
                </div>

                {/* Criteria */}
                <CriteriaRatingsDisplay
                  criteria={{
                    welcome: selectedReview.rating_welcome,
                    quality: selectedReview.rating_quality,
                    value: selectedReview.rating_value,
                    ambiance: selectedReview.rating_ambiance,
                    ...(selectedReview.rating_hygiene != null
                      ? { hygiene: selectedReview.rating_hygiene }
                      : {}),
                    ...(selectedReview.rating_organization != null
                      ? { organization: selectedReview.rating_organization }
                      : {}),
                  }}
                  universe={establishment.universe ?? undefined}
                />

                {/* Comment */}
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {selectedReview.comment}
                  </p>
                </div>

                {/* Photos */}
                {selectedReview.photos && selectedReview.photos.length > 0 && (
                  <div className="flex gap-2">
                    {selectedReview.photos.map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        alt={`Photo ${idx + 1}`}
                        className="w-20 h-20 rounded-lg object-cover border"
                      />
                    ))}
                  </div>
                )}

                {/* Gesture info */}
                {selectedReview.gesture && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Gift className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-700">
                        Geste commercial — {selectedReview.gesture.status}
                      </span>
                    </div>
                    <p className="text-sm text-purple-600">
                      {selectedReview.gesture.message}
                    </p>
                    <div className="text-xs text-purple-500 mt-1">
                      {selectedReview.gesture.discount_percent}% de réduction
                    </div>
                  </div>
                )}

                {/* Pro response */}
                {selectedReview.pro_response && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700">
                        Votre réponse — {selectedReview.pro_response.status}
                      </span>
                    </div>
                    <p className="text-sm text-blue-600">
                      {selectedReview.pro_response.content}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* GESTURE PROPOSAL DIALOG */}
      {/* ================================================================= */}

      <Dialog
        open={showGestureDialog}
        onOpenChange={(open) => !open && setShowGestureDialog(false)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-purple-600" />
              Proposer un geste commercial
            </DialogTitle>
            <DialogDescription>
              Proposez une réduction au client suite à son avis négatif. Il aura
              48h pour accepter ou refuser.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="gesture-discount">Réduction (%)</Label>
              <Input
                id="gesture-discount"
                type="number"
                min={1}
                max={100}
                value={gestureDiscount}
                onChange={(e) =>
                  setGestureDiscount(
                    Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                  )
                }
              />
              <p className="text-xs text-slate-500 mt-1">
                Un code promo sera généré automatiquement
              </p>
            </div>

            <div>
              <Label htmlFor="gesture-message">
                Message au client (min. 10 caractères)
              </Label>
              <Textarea
                id="gesture-message"
                value={gestureMessage}
                onChange={(e) => setGestureMessage(e.target.value)}
                placeholder="Cher client, nous sommes désolés pour votre expérience. Pour nous faire pardonner, nous vous offrons..."
                rows={4}
                maxLength={1000}
              />
              <div className="text-xs text-slate-400 text-end mt-1">
                {gestureMessage.length}/1000
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowGestureDialog(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={handleProposeGesture}
              disabled={
                submittingGesture ||
                gestureMessage.trim().length < 10 ||
                gestureDiscount < 1
              }
            >
              {submittingGesture ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 me-2" />
              )}
              Envoyer la proposition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* PUBLIC RESPONSE DIALOG */}
      {/* ================================================================= */}

      <Dialog
        open={showResponseDialog}
        onOpenChange={(open) => !open && setShowResponseDialog(false)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              Répondre publiquement
            </DialogTitle>
            <DialogDescription>
              Votre réponse sera visible par tous après modération.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Quick response templates */}
            <div>
              <Label className="text-xs text-slate-500">
                Modèles de réponse rapide
              </Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {QUICK_RESPONSES.map((template, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    onClick={() => setResponseContent(template.text)}
                    className="text-xs"
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="response-content">
                Votre réponse (min. 10 caractères)
              </Label>
              <Textarea
                id="response-content"
                value={responseContent}
                onChange={(e) => setResponseContent(e.target.value)}
                placeholder="Votre réponse au client..."
                rows={5}
                maxLength={1500}
              />
              <div className="text-xs text-slate-400 text-end mt-1">
                {responseContent.length}/1500
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResponseDialog(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmitResponse}
              disabled={
                submittingResponse || responseContent.trim().length < 10
              }
            >
              {submittingResponse ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 me-2" />
              )}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ProReviewsTab;
