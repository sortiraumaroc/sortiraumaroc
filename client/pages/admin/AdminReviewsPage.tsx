/**
 * AdminReviewsPage V2
 *
 * Moderation of customer reviews, pro responses, and review reports.
 * Uses V2 API with new workflow: moderation → gesture → publication.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Star,
  Clock,
  AlertTriangle,
  Check,
  X,
  Flag,
  MessageSquare,
  Gift,
  Eye,
  Edit3,
  Search,
  RefreshCw,
} from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import {
  listAdminReviewsV2,
  getAdminReviewV2,
  moderateAdminReviewV2,
  getAdminReviewStatsV2,
  listAdminReviewReportsV2,
  resolveAdminReviewReportV2,
  listAdminPendingResponsesV2,
  moderateAdminResponseV2,
  type AdminReviewV2,
  type AdminReviewStatusV2,
  type AdminReviewStatsV2,
  type AdminReviewReportV2,
  type AdminPendingResponseV2,
} from "@/lib/adminApi";

import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/reviews/StarRating";
import { CriteriaRatingsDisplay } from "@/components/reviews/CriteriaRating";
import { CRITERIA_LABELS_FR } from "@shared/reviewTypes";

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------

const REVIEW_STATUS_CONFIG: Record<
  AdminReviewStatusV2,
  { className: string; label: string }
> = {
  pending_moderation: {
    className: "bg-amber-50 text-amber-700 border-amber-200",
    label: "À modérer",
  },
  approved: {
    className: "bg-blue-50 text-blue-700 border-blue-200",
    label: "Approuvé",
  },
  rejected: {
    className: "bg-red-50 text-red-700 border-red-200",
    label: "Rejeté",
  },
  modification_requested: {
    className: "bg-orange-50 text-orange-700 border-orange-200",
    label: "Modification demandée",
  },
  pending_commercial_gesture: {
    className: "bg-purple-50 text-purple-700 border-purple-200",
    label: "En attente geste commercial",
  },
  resolved: {
    className: "bg-slate-100 text-slate-700 border-slate-200",
    label: "Résolu",
  },
  published: {
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    label: "Publié",
  },
};

function reviewStatusBadge(status: AdminReviewStatusV2) {
  const c = REVIEW_STATUS_CONFIG[status] || {
    className: "bg-slate-100 text-slate-700",
    label: status,
  };
  return <Badge className={c.className}>{c.label}</Badge>;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
// Main component
// ---------------------------------------------------------------------------

export function AdminReviewsPage() {
  const { toast } = useToast();

  // Tab state
  const [activeTab, setActiveTab] = useState<
    "reviews" | "responses" | "reports"
  >("reviews");

  // Stats
  const [stats, setStats] = useState<AdminReviewStatsV2 | null>(null);

  // Reviews state
  const [reviews, setReviews] = useState<AdminReviewV2[]>([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<
    AdminReviewStatusV2 | "all"
  >("pending_moderation");
  const [reviewPage, setReviewPage] = useState(1);

  // Review detail dialog
  const [selectedReview, setSelectedReview] = useState<AdminReviewV2 | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [moderationNote, setModerationNote] = useState("");
  const [moderating, setModerating] = useState(false);

  // Responses state
  const [responses, setResponses] = useState<AdminPendingResponseV2[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [selectedResponse, setSelectedResponse] =
    useState<AdminPendingResponseV2 | null>(null);
  const [responseNote, setResponseNote] = useState("");

  // Reports state
  const [reports, setReports] = useState<AdminReviewReportV2[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [selectedReport, setSelectedReport] =
    useState<AdminReviewReportV2 | null>(null);
  const [reportNote, setReportNote] = useState("");

  // ---------------------------------------------------------------------------
  // Load stats
  // ---------------------------------------------------------------------------

  const loadStats = useCallback(async () => {
    try {
      const res = await getAdminReviewStatsV2(undefined);
      if (res.ok) setStats(res.stats);
    } catch {
      // Non-critical
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Load reviews
  // ---------------------------------------------------------------------------

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const res = await listAdminReviewsV2(undefined, {
        status: reviewStatusFilter,
        page: reviewPage,
        limit: 20,
        sort_by: "created_at",
        sort_order: "desc",
      });
      if (res.ok) {
        setReviews(res.items);
        setReviewsTotal(res.total);
      }
    } catch (e: unknown) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur de chargement",
        variant: "destructive",
      });
    } finally {
      setReviewsLoading(false);
    }
  }, [reviewStatusFilter, reviewPage, toast]);

  // ---------------------------------------------------------------------------
  // Load responses
  // ---------------------------------------------------------------------------

  const loadResponses = useCallback(async () => {
    setResponsesLoading(true);
    try {
      const res = await listAdminPendingResponsesV2(undefined);
      if (res.ok) setResponses(res.items);
    } catch {
      // Non-critical
    } finally {
      setResponsesLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Load reports
  // ---------------------------------------------------------------------------

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const res = await listAdminReviewReportsV2(undefined, {
        status: "pending",
      });
      if (res.ok) setReports(res.items);
    } catch {
      // Non-critical
    } finally {
      setReportsLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    if (activeTab === "responses") void loadResponses();
    if (activeTab === "reports") void loadReports();
  }, [activeTab, loadResponses, loadReports]);

  // ---------------------------------------------------------------------------
  // Review detail
  // ---------------------------------------------------------------------------

  const openReviewDetail = async (review: AdminReviewV2) => {
    setSelectedReview(review);
    setModerationNote("");
    setDetailLoading(true);
    try {
      const res = await getAdminReviewV2(undefined, review.id);
      if (res.ok) setSelectedReview(res.review);
    } catch {
      // Use the already-loaded partial data
    } finally {
      setDetailLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Moderate review
  // ---------------------------------------------------------------------------

  const handleModerate = async (
    action: "approve" | "reject" | "request_modification",
  ) => {
    if (!selectedReview) return;
    setModerating(true);
    try {
      const res = await moderateAdminReviewV2(undefined, selectedReview.id, {
        action,
        moderation_note: moderationNote.trim() || undefined,
      });
      if (res.ok) {
        toast({
          title: "Succès",
          description:
            action === "approve"
              ? "Avis approuvé"
              : action === "reject"
                ? "Avis rejeté"
                : "Modification demandée",
        });
        setSelectedReview(null);
        void loadReviews();
        void loadStats();
      }
    } catch (e: unknown) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur de modération",
        variant: "destructive",
      });
    } finally {
      setModerating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Moderate response
  // ---------------------------------------------------------------------------

  const handleModerateResponse = async (action: "approve" | "reject") => {
    if (!selectedResponse) return;
    try {
      const res = await moderateAdminResponseV2(
        undefined,
        selectedResponse.id,
        {
          action,
          moderation_note: responseNote.trim() || undefined,
        },
      );
      if (res.ok) {
        toast({
          title: "Succès",
          description:
            action === "approve"
              ? "Réponse approuvée"
              : "Réponse rejetée",
        });
        setSelectedResponse(null);
        void loadResponses();
        void loadStats();
      }
    } catch (e: unknown) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Resolve report
  // ---------------------------------------------------------------------------

  const handleResolveReport = async (action: "reviewed" | "dismissed") => {
    if (!selectedReport) return;
    try {
      const res = await resolveAdminReviewReportV2(
        undefined,
        selectedReport.id,
        {
          action,
          review_note: reportNote.trim() || undefined,
        },
      );
      if (res.ok) {
        toast({
          title: "Succès",
          description:
            action === "reviewed"
              ? "Signalement traité"
              : "Signalement rejeté",
        });
        setSelectedReport(null);
        void loadReports();
        void loadStats();
      }
    } catch (e: unknown) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Modération des avis"
        description="Gérez les avis clients, réponses pro et signalements"
      />

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-600">
                {stats.pending_moderation}
              </div>
              <div className="text-sm text-slate-500">À modérer</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-purple-600">
                {stats.pending_commercial_gesture}
              </div>
              <div className="text-sm text-slate-500">Gestes en attente</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">
                {stats.pending_responses}
              </div>
              <div className="text-sm text-slate-500">Réponses pro</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600">
                {stats.pending_reports}
              </div>
              <div className="text-sm text-slate-500">Signalements</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      >
        <TabsList>
          <TabsTrigger value="reviews">
            Avis
            {stats && stats.pending_moderation > 0 && (
              <Badge className="ms-2 bg-amber-100 text-amber-700 text-xs">
                {stats.pending_moderation}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="responses">
            Réponses pro
            {stats && stats.pending_responses > 0 && (
              <Badge className="ms-2 bg-blue-100 text-blue-700 text-xs">
                {stats.pending_responses}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reports">
            Signalements
            {stats && stats.pending_reports > 0 && (
              <Badge className="ms-2 bg-red-100 text-red-700 text-xs">
                {stats.pending_reports}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ================================================================= */}
        {/* REVIEWS TAB */}
        {/* ================================================================= */}

        <TabsContent value="reviews" className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <Select
              value={reviewStatusFilter}
              onValueChange={(v) => {
                setReviewStatusFilter(v as AdminReviewStatusV2 | "all");
                setReviewPage(1);
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="pending_moderation">À modérer</SelectItem>
                <SelectItem value="approved">Approuvés</SelectItem>
                <SelectItem value="rejected">Rejetés</SelectItem>
                <SelectItem value="modification_requested">
                  Modification demandée
                </SelectItem>
                <SelectItem value="pending_commercial_gesture">
                  Geste commercial
                </SelectItem>
                <SelectItem value="resolved">Résolus</SelectItem>
                <SelectItem value="published">Publiés</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => loadReviews()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-500 ms-auto">
              {reviewsTotal} avis au total
            </span>
          </div>

          {/* Reviews list */}
          {reviewsLoading ? (
            <div className="py-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            </div>
          ) : reviews.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              Aucun avis trouvé
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <Card
                  key={review.id}
                  className="cursor-pointer hover:border-primary/30 transition-colors"
                  onClick={() => openReviewDetail(review)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Rating */}
                      <div className="flex flex-col items-center gap-1 min-w-[50px]">
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span className="font-bold">
                            {review.rating_overall.toFixed(1)}
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {reviewStatusBadge(review.status)}
                          {review.commercial_gesture_status !== "none" && (
                            <Badge
                              variant="outline"
                              className="text-purple-600 border-purple-200"
                            >
                              <Gift className="h-3 w-3 me-1" />
                              Geste
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-700 line-clamp-2">
                          {review.comment}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                          <span>{review.user_name || review.user_email || "Client"}</span>
                          <span>•</span>
                          <span>
                            {review.establishment_name || "Établissement"}
                          </span>
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
                        </div>
                      </div>

                      {/* Action hint */}
                      <Eye className="h-4 w-4 text-slate-400 shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {reviewsTotal > 20 && (
            <div className="flex justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={reviewPage <= 1}
                onClick={() => setReviewPage((p) => p - 1)}
              >
                Précédent
              </Button>
              <span className="text-sm text-slate-500 self-center px-3">
                Page {reviewPage} / {Math.ceil(reviewsTotal / 20)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={reviewPage >= Math.ceil(reviewsTotal / 20)}
                onClick={() => setReviewPage((p) => p + 1)}
              >
                Suivant
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ================================================================= */}
        {/* RESPONSES TAB */}
        {/* ================================================================= */}

        <TabsContent value="responses" className="space-y-4">
          {responsesLoading ? (
            <div className="py-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            </div>
          ) : responses.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              Aucune réponse pro en attente
            </div>
          ) : (
            <div className="space-y-3">
              {responses.map((resp) => (
                <Card
                  key={resp.id}
                  className="cursor-pointer hover:border-primary/30 transition-colors"
                  onClick={() => {
                    setSelectedResponse(resp);
                    setResponseNote("");
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <MessageSquare className="h-5 w-5 text-blue-500 shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 mb-1">
                          {resp.establishment_name || "Établissement"}
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-2">
                          {resp.content}
                        </p>
                        <div className="text-xs text-slate-400 mt-1">
                          En réponse à un avis noté{" "}
                          {resp.review_rating?.toFixed(1)}/5
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ================================================================= */}
        {/* REPORTS TAB */}
        {/* ================================================================= */}

        <TabsContent value="reports" className="space-y-4">
          {reportsLoading ? (
            <div className="py-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            </div>
          ) : reports.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              Aucun signalement en attente
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <Card
                  key={report.id}
                  className="cursor-pointer hover:border-primary/30 transition-colors"
                  onClick={() => {
                    setSelectedReport(report);
                    setReportNote("");
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <Flag className="h-5 w-5 text-red-500 shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 mb-1">
                          {report.establishment_name || "Établissement"} — Avis
                          noté {report.review_rating?.toFixed(1)}/5
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-2">
                          {report.reason}
                        </p>
                        <div className="text-xs text-slate-400 mt-1">
                          Signalé le {formatDate(report.created_at)} par{" "}
                          {report.reporter_type}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
                <DialogTitle className="flex items-center gap-2">
                  Détail de l'avis
                  {reviewStatusBadge(selectedReview.status)}
                </DialogTitle>
                <DialogDescription>
                  {selectedReview.establishment_name || "Établissement"} —{" "}
                  {formatDate(selectedReview.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Author */}
                <div className="text-sm text-slate-600">
                  <strong>Auteur :</strong>{" "}
                  {selectedReview.user_name || selectedReview.user_email || "Client anonyme"}
                </div>

                {/* Overall rating */}
                <div className="flex items-center gap-3">
                  <StarRating
                    value={selectedReview.rating_overall}
                    size={20}
                    readonly
                  />
                  <span className="text-lg font-bold">
                    {selectedReview.rating_overall.toFixed(1)}/5
                  </span>
                  {selectedReview.would_recommend != null && (
                    <Badge
                      variant="outline"
                      className={
                        selectedReview.would_recommend
                          ? "text-emerald-600 border-emerald-200"
                          : "text-red-600 border-red-200"
                      }
                    >
                      {selectedReview.would_recommend
                        ? "Recommande"
                        : "Ne recommande pas"}
                    </Badge>
                  )}
                </div>

                {/* Per-criteria ratings */}
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
                  universe={selectedReview.establishment_universe}
                />

                {/* Comment */}
                <div>
                  <Label className="text-xs text-slate-500">Commentaire</Label>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1 p-3 bg-slate-50 rounded-lg">
                    {selectedReview.comment}
                  </p>
                </div>

                {/* Photos */}
                {selectedReview.photos && selectedReview.photos.length > 0 && (
                  <div>
                    <Label className="text-xs text-slate-500">Photos</Label>
                    <div className="flex gap-2 mt-1">
                      {selectedReview.photos.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt={`Photo ${idx + 1}`}
                          className="w-20 h-20 rounded-lg object-cover border"
                        />
                      ))}
                    </div>
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
                        Réponse pro — {selectedReview.pro_response.status}
                      </span>
                    </div>
                    <p className="text-sm text-blue-600">
                      {selectedReview.pro_response.content}
                    </p>
                  </div>
                )}

                {/* Previous moderation note */}
                {selectedReview.moderation_note && (
                  <div className="bg-slate-50 border rounded-lg p-3">
                    <Label className="text-xs text-slate-500">
                      Note de modération précédente
                    </Label>
                    <p className="text-sm text-slate-600 mt-1">
                      {selectedReview.moderation_note}
                    </p>
                  </div>
                )}

                {/* Moderation actions — only for pending reviews */}
                {selectedReview.status === "pending_moderation" && (
                  <div className="space-y-3 pt-2 border-t">
                    <Label htmlFor="mod-note">
                      Note de modération (optionnel)
                    </Label>
                    <Textarea
                      id="mod-note"
                      value={moderationNote}
                      onChange={(e) => setModerationNote(e.target.value)}
                      placeholder="Raison de la décision..."
                      rows={2}
                    />
                  </div>
                )}
              </div>

              {selectedReview.status === "pending_moderation" && (
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleModerate("reject")}
                    disabled={moderating}
                    className="text-red-600"
                  >
                    <X className="h-4 w-4 me-1" />
                    Rejeter
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleModerate("request_modification")}
                    disabled={moderating}
                    className="text-orange-600"
                  >
                    <Edit3 className="h-4 w-4 me-1" />
                    Demander modif
                  </Button>
                  <Button
                    onClick={() => handleModerate("approve")}
                    disabled={moderating}
                  >
                    {moderating ? (
                      <Loader2 className="h-4 w-4 me-1 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 me-1" />
                    )}
                    Approuver
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* RESPONSE MODERATION DIALOG */}
      {/* ================================================================= */}

      <Dialog
        open={!!selectedResponse}
        onOpenChange={(open) => !open && setSelectedResponse(null)}
      >
        <DialogContent className="max-w-lg">
          {selectedResponse && (
            <>
              <DialogHeader>
                <DialogTitle>Modérer la réponse pro</DialogTitle>
                <DialogDescription>
                  {selectedResponse.establishment_name || "Établissement"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {selectedResponse.review_comment && (
                  <div>
                    <Label className="text-xs text-slate-500">
                      Avis original
                    </Label>
                    <p className="text-sm text-slate-600 mt-1 p-2 bg-slate-50 rounded line-clamp-3">
                      {selectedResponse.review_comment}
                    </p>
                  </div>
                )}

                <div>
                  <Label className="text-xs text-slate-500">
                    Réponse du pro
                  </Label>
                  <p className="text-sm text-slate-700 mt-1 p-3 bg-blue-50 rounded-lg whitespace-pre-wrap">
                    {selectedResponse.content}
                  </p>
                </div>

                <div>
                  <Label htmlFor="resp-note">
                    Note de modération (optionnel)
                  </Label>
                  <Textarea
                    id="resp-note"
                    value={responseNote}
                    onChange={(e) => setResponseNote(e.target.value)}
                    placeholder="Raison..."
                    rows={2}
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  className="text-red-600"
                  onClick={() => handleModerateResponse("reject")}
                >
                  <X className="h-4 w-4 me-1" />
                  Rejeter
                </Button>
                <Button onClick={() => handleModerateResponse("approve")}>
                  <Check className="h-4 w-4 me-1" />
                  Approuver
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* REPORT RESOLUTION DIALOG */}
      {/* ================================================================= */}

      <Dialog
        open={!!selectedReport}
        onOpenChange={(open) => !open && setSelectedReport(null)}
      >
        <DialogContent className="max-w-lg">
          {selectedReport && (
            <>
              <DialogHeader>
                <DialogTitle>Traiter le signalement</DialogTitle>
                <DialogDescription>
                  {selectedReport.establishment_name || "Établissement"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div>
                  <Label className="text-xs text-slate-500">
                    Raison du signalement
                  </Label>
                  <p className="text-sm text-slate-700 mt-1 p-3 bg-red-50 rounded-lg">
                    {selectedReport.reason}
                  </p>
                </div>

                {selectedReport.review_comment && (
                  <div>
                    <Label className="text-xs text-slate-500">
                      Avis signalé ({selectedReport.review_rating?.toFixed(1)}
                      /5)
                    </Label>
                    <p className="text-sm text-slate-600 mt-1 p-2 bg-slate-50 rounded line-clamp-4">
                      {selectedReport.review_comment}
                    </p>
                  </div>
                )}

                <div>
                  <Label htmlFor="report-note">
                    Note de résolution (optionnel)
                  </Label>
                  <Textarea
                    id="report-note"
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    placeholder="Action prise..."
                    rows={2}
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleResolveReport("dismissed")}
                >
                  Rejeter
                </Button>
                <Button onClick={() => handleResolveReport("reviewed")}>
                  <Check className="h-4 w-4 me-1" />
                  Traité
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminReviewsPage;
