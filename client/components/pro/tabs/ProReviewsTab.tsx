/**
 * ProReviewsTab
 *
 * Tab for pro users to manage reviews (pending responses and published reviews)
 * Includes stats dashboard, filters, search, and quick response templates
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Clock,
  Download,
  Filter,
  Gift,
  Loader2,
  MessageSquare,
  Minus,
  Search,
  Send,
  Star,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { toast } from "@/hooks/use-toast";

import type { Establishment, ProRole } from "@/lib/pro/types";
import {
  listProPendingReviews,
  listProPublishedReviews,
  respondToProReview,
  addProPublicResponse,
  type ProPendingReview,
  type ProPublishedReview,
} from "@/lib/pro/api";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { formatLeJjMmAaAHeure } from "@shared/datetime";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  establishment: Establishment;
  role: ProRole;
};

// Quick response templates
const QUICK_RESPONSE_TEMPLATES = [
  {
    label: "Remerciement",
    body: "Merci beaucoup pour votre avis ! Nous sommes ravis que votre expérience vous ait plu. Au plaisir de vous revoir bientôt !",
  },
  {
    label: "Excuse et amélioration",
    body: "Nous vous remercions pour votre retour. Nous sommes sincèrement désolés que votre expérience n'ait pas été à la hauteur de vos attentes. Vos remarques sont précieuses et nous aideront à nous améliorer.",
  },
  {
    label: "Invitation à revenir",
    body: "Merci pour votre avis ! Nous espérons avoir le plaisir de vous accueillir à nouveau très prochainement.",
  },
  {
    label: "Réponse neutre",
    body: "Merci d'avoir pris le temps de partager votre expérience. Vos commentaires nous aident à améliorer nos services.",
  },
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function canManageReviews(role: ProRole): boolean {
  return role === "owner" || role === "manager";
}

function getTimeRemaining(deadline: string | null): { text: string; isUrgent: boolean; isExpired: boolean } {
  if (!deadline) return { text: "—", isUrgent: false, isExpired: false };

  const deadlineDate = new Date(deadline);
  const now = new Date();
  const diff = deadlineDate.getTime() - now.getTime();

  if (diff <= 0) {
    return { text: "Expiré", isUrgent: true, isExpired: true };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return { text: `${days}j restants`, isUrgent: false, isExpired: false };
  }

  if (hours > 0) {
    return { text: `${hours}h ${minutes}min`, isUrgent: hours < 6, isExpired: false };
  }

  return { text: `${minutes}min`, isUrgent: true, isExpired: false };
}

function getRatingBadgeColor(rating: number): string {
  if (rating >= 4) return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (rating >= 3) return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-red-50 text-red-800 border-red-200";
}

function calculateStats(reviews: ProPublishedReview[]) {
  if (reviews.length === 0) {
    return {
      averageRating: 0,
      totalCount: 0,
      distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      recentTrend: 0,
      responseRate: 0,
    };
  }

  // Average rating
  const sum = reviews.reduce((acc, r) => acc + r.overall_rating, 0);
  const averageRating = sum / reviews.length;

  // Distribution
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    const rounded = Math.round(r.overall_rating) as 1 | 2 | 3 | 4 | 5;
    if (rounded >= 1 && rounded <= 5) {
      distribution[rounded]++;
    }
  });

  // Recent trend (compare last 30 days vs previous 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const recentReviews = reviews.filter((r) => new Date(r.published_at || r.created_at) >= thirtyDaysAgo);
  const previousReviews = reviews.filter((r) => {
    const date = new Date(r.published_at || r.created_at);
    return date >= sixtyDaysAgo && date < thirtyDaysAgo;
  });

  let recentTrend = 0;
  if (previousReviews.length > 0 && recentReviews.length > 0) {
    const recentAvg = recentReviews.reduce((acc, r) => acc + r.overall_rating, 0) / recentReviews.length;
    const previousAvg = previousReviews.reduce((acc, r) => acc + r.overall_rating, 0) / previousReviews.length;
    recentTrend = recentAvg - previousAvg;
  }

  // Response rate
  const withResponse = reviews.filter((r) => r.pro_public_response).length;
  const responseRate = (withResponse / reviews.length) * 100;

  return {
    averageRating,
    totalCount: reviews.length,
    distribution,
    recentTrend,
    responseRate,
  };
}

// ---------------------------------------------------------------------------
// Stats Dashboard Component
// ---------------------------------------------------------------------------

function ReviewStatsDashboard({ reviews }: { reviews: ProPublishedReview[] }) {
  const stats = useMemo(() => calculateStats(reviews), [reviews]);

  if (reviews.length === 0) {
    return null;
  }

  const maxDistribution = Math.max(...Object.values(stats.distribution), 1);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* Average Rating */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Star className="h-3.5 w-3.5" />
            Note moyenne
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {stats.averageRating.toFixed(1)}
            </span>
            <span className="text-slate-400 text-sm">/5</span>
          </div>
          {stats.recentTrend !== 0 && (
            <div className={`flex items-center gap-1 text-xs mt-1 ${stats.recentTrend > 0 ? "text-emerald-600" : "text-red-600"}`}>
              {stats.recentTrend > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {stats.recentTrend > 0 ? "+" : ""}{stats.recentTrend.toFixed(1)} vs mois dernier
            </div>
          )}
        </CardContent>
      </Card>

      {/* Total Reviews */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <MessageSquare className="h-3.5 w-3.5" />
            Total avis
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {stats.totalCount}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            avis publiés
          </div>
        </CardContent>
      </Card>

      {/* Response Rate */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Check className="h-3.5 w-3.5" />
            Taux de réponse
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {stats.responseRate.toFixed(0)}%
          </div>
          <div className="text-xs text-slate-400 mt-1">
            avis avec réponse
          </div>
        </CardContent>
      </Card>

      {/* Distribution */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-2">
            <BarChart3 className="h-3.5 w-3.5" />
            Répartition
          </div>
          <div className="space-y-1">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = stats.distribution[rating as 1 | 2 | 3 | 4 | 5];
              const percentage = (count / maxDistribution) * 100;
              return (
                <div key={rating} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-3">{rating}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${rating >= 4 ? "bg-emerald-500" : rating >= 3 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-5 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProReviewsTab({ establishment, role }: Props) {
  const [activeTab, setActiveTab] = useState<"pending" | "published">("pending");

  // Pending reviews
  const [pendingReviews, setPendingReviews] = useState<ProPendingReview[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [errorPending, setErrorPending] = useState<string | null>(null);

  // Published reviews
  const [publishedReviews, setPublishedReviews] = useState<ProPublishedReview[]>([]);
  const [loadingPublished, setLoadingPublished] = useState(false);
  const [errorPublished, setErrorPublished] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState<"all" | "positive" | "neutral" | "negative">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");

  // Response dialog
  const [respondingTo, setRespondingTo] = useState<ProPendingReview | null>(null);
  const [responseType, setResponseType] = useState<"promo" | "publish">("publish");
  const [alsoPublish, setAlsoPublish] = useState(false);
  const [submittingResponse, setSubmittingResponse] = useState(false);

  // Public response dialog
  const [addingPublicResponse, setAddingPublicResponse] = useState<ProPublishedReview | null>(null);
  const [publicResponse, setPublicResponse] = useState("");
  const [submittingPublicResponse, setSubmittingPublicResponse] = useState(false);

  // ---------------------------------------------------------------------------
  // Load pending reviews
  // ---------------------------------------------------------------------------

  const loadPendingReviews = async () => {
    setLoadingPending(true);
    setErrorPending(null);

    try {
      const result = await listProPendingReviews();
      // Filter for current establishment
      const filtered = result.reviews.filter(
        (r) => r.establishment_id === establishment.id
      );
      setPendingReviews(filtered);
    } catch (err) {
      console.error("[ProReviewsTab] Error loading pending reviews:", err);
      setErrorPending(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoadingPending(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Load published reviews
  // ---------------------------------------------------------------------------

  const loadPublishedReviews = async () => {
    setLoadingPublished(true);
    setErrorPublished(null);

    try {
      const result = await listProPublishedReviews();
      // Filter for current establishment
      const filtered = result.reviews.filter(
        (r) => r.establishment_id === establishment.id
      );
      setPublishedReviews(filtered);
    } catch (err) {
      console.error("[ProReviewsTab] Error loading published reviews:", err);
      setErrorPublished(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoadingPublished(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Filtered and sorted reviews
  // ---------------------------------------------------------------------------

  const filteredPublishedReviews = useMemo(() => {
    let filtered = [...publishedReviews];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((r) =>
        (r.comment?.toLowerCase().includes(query)) ||
        (r.title?.toLowerCase().includes(query)) ||
        (r.user_name?.toLowerCase().includes(query))
      );
    }

    // Rating filter
    if (ratingFilter !== "all") {
      filtered = filtered.filter((r) => {
        if (ratingFilter === "positive") return r.overall_rating >= 4;
        if (ratingFilter === "neutral") return r.overall_rating >= 3 && r.overall_rating < 4;
        if (ratingFilter === "negative") return r.overall_rating < 3;
        return true;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortOrder) {
        case "newest":
          return new Date(b.published_at || b.created_at).getTime() - new Date(a.published_at || a.created_at).getTime();
        case "oldest":
          return new Date(a.published_at || a.created_at).getTime() - new Date(b.published_at || b.created_at).getTime();
        case "highest":
          return b.overall_rating - a.overall_rating;
        case "lowest":
          return a.overall_rating - b.overall_rating;
        default:
          return 0;
      }
    });

    return filtered;
  }, [publishedReviews, searchQuery, ratingFilter, sortOrder]);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    loadPendingReviews();
  }, [establishment.id]);

  useEffect(() => {
    if (activeTab === "published" && publishedReviews.length === 0 && !loadingPublished) {
      loadPublishedReviews();
    }
  }, [activeTab]);

  // ---------------------------------------------------------------------------
  // Handle respond to review
  // ---------------------------------------------------------------------------

  const handleRespond = async () => {
    if (!respondingTo) return;

    setSubmittingResponse(true);

    try {
      await respondToProReview({
        reviewId: respondingTo.id,
        responseType,
        publish: responseType === "promo" ? alsoPublish : undefined,
      });

      toast({
        title: "Réponse envoyée",
        description: responseType === "publish"
          ? "L'avis a été publié."
          : (alsoPublish ? "Geste commercial envoyé et avis publié." : "Geste commercial envoyé."),
      });

      setRespondingTo(null);
      setResponseType("publish");
      setAlsoPublish(false);

      // Refresh lists
      loadPendingReviews();
      loadPublishedReviews();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur lors de la réponse",
        variant: "destructive",
      });
    } finally {
      setSubmittingResponse(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Handle add public response
  // ---------------------------------------------------------------------------

  const handleAddPublicResponse = async () => {
    if (!addingPublicResponse || !publicResponse.trim()) return;

    setSubmittingPublicResponse(true);

    try {
      await addProPublicResponse({
        reviewId: addingPublicResponse.id,
        response: publicResponse.trim(),
      });

      toast({
        title: "Réponse publiée",
        description: "Votre réponse a été ajoutée à l'avis.",
      });

      setAddingPublicResponse(null);
      setPublicResponse("");

      // Refresh published reviews
      loadPublishedReviews();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur lors de l'ajout de la réponse",
        variant: "destructive",
      });
    } finally {
      setSubmittingPublicResponse(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Export reviews
  // ---------------------------------------------------------------------------

  const handleExportReviews = () => {
    if (publishedReviews.length === 0) {
      toast({
        title: "Aucun avis à exporter",
        description: "Il n'y a pas d'avis publiés à exporter.",
        variant: "destructive",
      });
      return;
    }

    const csvContent = [
      ["Date", "Note", "Client", "Titre", "Commentaire", "Réponse"].join(";"),
      ...filteredPublishedReviews.map((r) => [
        new Date(r.published_at || r.created_at).toLocaleDateString("fr-FR"),
        r.overall_rating.toFixed(1),
        r.anonymous ? "Anonyme" : (r.user_name || "Client"),
        `"${(r.title || "").replace(/"/g, '""')}"`,
        `"${(r.comment || "").replace(/"/g, '""')}"`,
        `"${(r.pro_public_response || "").replace(/"/g, '""')}"`,
      ].join(";"))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `avis-${establishment.name || "etablissement"}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export réussi",
      description: `${filteredPublishedReviews.length} avis exportés.`,
    });
  };

  // ---------------------------------------------------------------------------
  // Permission check
  // ---------------------------------------------------------------------------

  if (!canManageReviews(role)) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-12 w-12 text-red-300 mx-auto mb-4" />
          <p className="text-red-600 font-medium mb-2">Non autorisé</p>
          <p className="text-slate-600 text-sm">
            Seuls les propriétaires et managers peuvent gérer les avis clients.
          </p>
          <p className="text-slate-400 text-xs mt-2">
            Votre rôle actuel : <span className="font-medium">{role}</span>
          </p>
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Avis clients</h2>
          <p className="text-sm text-slate-600 mt-1">
            Gérez les avis de vos clients et répondez à leurs retours.
          </p>
        </div>
        {publishedReviews.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleExportReviews} className="gap-2">
            <Download className="h-4 w-4" />
            Exporter
          </Button>
        )}
      </div>

      {/* Stats Dashboard (only for published reviews) */}
      {activeTab === "published" && !loadingPublished && (
        <ReviewStatsDashboard reviews={publishedReviews} />
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "pending" | "published")}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            En attente
            {pendingReviews.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5">
                {pendingReviews.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="published" className="flex items-center gap-2">
            <Check className="h-4 w-4" />
            Publiés
            {publishedReviews.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5">
                {publishedReviews.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Pending reviews tab */}
        <TabsContent value="pending" className="mt-4">
          {loadingPending ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="text-slate-600 mt-2">Chargement...</p>
              </CardContent>
            </Card>
          ) : errorPending ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                <p className="text-red-600">{errorPending}</p>
                <Button onClick={loadPendingReviews} variant="outline" className="mt-4">
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : pendingReviews.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ThumbsUp className="h-12 w-12 text-emerald-300 mx-auto mb-4" />
                <p className="text-slate-600">Aucun avis en attente de réponse.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingReviews.map((review) => {
                const timeRemaining = getTimeRemaining(review.pro_response_deadline);

                return (
                  <Card key={review.id} className={timeRemaining.isUrgent ? "border-red-200" : ""}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge className={getRatingBadgeColor(review.overall_rating)}>
                              <Star className="h-3 w-3 mr-1 fill-current" />
                              {review.overall_rating.toFixed(1)}
                            </Badge>
                            <span className="text-sm text-slate-500">
                              {review.anonymous ? "Client anonyme" : review.user_name || "Client"}
                            </span>
                          </div>
                          {review.title && (
                            <CardTitle className="text-base mt-2">{review.title}</CardTitle>
                          )}
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-medium ${timeRemaining.isUrgent ? "text-red-600" : "text-slate-600"}`}>
                            <Clock className="h-4 w-4 inline mr-1" />
                            {timeRemaining.text}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            Reçu le {formatLeJjMmAaAHeure(review.created_at)}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {review.comment && (
                        <p className="text-sm text-slate-700 whitespace-pre-wrap mb-4">
                          {review.comment}
                        </p>
                      )}

                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRespondingTo(review);
                            setResponseType("promo");
                          }}
                          disabled={timeRemaining.isExpired}
                        >
                          <Gift className="h-4 w-4 mr-1" />
                          Geste commercial
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setRespondingTo(review);
                            setResponseType("publish");
                          }}
                          disabled={timeRemaining.isExpired}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Publier
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Published reviews tab */}
        <TabsContent value="published" className="mt-4">
          {/* Filters */}
          {publishedReviews.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Rechercher dans les avis..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Rating filter */}
              <Select value={ratingFilter} onValueChange={(v) => setRatingFilter(v as typeof ratingFilter)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2 text-slate-400" />
                  <SelectValue placeholder="Filtrer par note" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les avis</SelectItem>
                  <SelectItem value="positive">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Positifs (4-5)
                    </span>
                  </SelectItem>
                  <SelectItem value="neutral">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Neutres (3-4)
                    </span>
                  </SelectItem>
                  <SelectItem value="negative">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      Négatifs (&lt;3)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Sort */}
              <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Trier par" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Plus récents</SelectItem>
                  <SelectItem value="oldest">Plus anciens</SelectItem>
                  <SelectItem value="highest">Meilleure note</SelectItem>
                  <SelectItem value="lowest">Moins bonne note</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {loadingPublished ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="text-slate-600 mt-2">Chargement...</p>
              </CardContent>
            </Card>
          ) : errorPublished ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                <p className="text-red-600">{errorPublished}</p>
                <Button onClick={loadPublishedReviews} variant="outline" className="mt-4">
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : publishedReviews.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Star className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">Aucun avis publié pour le moment.</p>
              </CardContent>
            </Card>
          ) : filteredPublishedReviews.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Search className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">Aucun avis ne correspond à vos critères.</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setSearchQuery("");
                    setRatingFilter("all");
                  }}
                >
                  Réinitialiser les filtres
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Results count */}
              {(searchQuery || ratingFilter !== "all") && (
                <div className="text-sm text-slate-500">
                  {filteredPublishedReviews.length} avis trouvé{filteredPublishedReviews.length > 1 ? "s" : ""}
                </div>
              )}

              {filteredPublishedReviews.map((review) => (
                <Card key={review.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className={getRatingBadgeColor(review.overall_rating)}>
                            <Star className="h-3 w-3 mr-1 fill-current" />
                            {review.overall_rating.toFixed(1)}
                          </Badge>
                          <span className="text-sm text-slate-500">
                            {review.anonymous ? "Client anonyme" : review.user_name || "Client"}
                          </span>
                        </div>
                        {review.title && (
                          <CardTitle className="text-base mt-2">{review.title}</CardTitle>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        Publié le {formatLeJjMmAaAHeure(review.published_at || review.created_at)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {review.comment && (
                      <p className="text-sm text-slate-700 whitespace-pre-wrap mb-4">
                        {review.comment}
                      </p>
                    )}

                    {/* Pro public response */}
                    {review.pro_public_response ? (
                      <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                        <div className="text-xs font-medium text-primary mb-1">Votre réponse :</div>
                        <p className="text-sm text-slate-700">{review.pro_public_response}</p>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAddingPublicResponse(review);
                          setPublicResponse("");
                        }}
                      >
                        <MessageSquare className="h-4 w-4 mr-1" />
                        Ajouter une réponse
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Response dialog */}
      <Dialog open={!!respondingTo} onOpenChange={(open) => !open && setRespondingTo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {responseType === "promo" ? "Faire un geste commercial" : "Publier l'avis"}
            </DialogTitle>
            <DialogDescription>
              {responseType === "promo"
                ? "Envoyez un code promo au client pour compenser son expérience."
                : "Cet avis sera visible publiquement sur votre fiche établissement."}
            </DialogDescription>
          </DialogHeader>

          {respondingTo && (
            <div className="py-4">
              {/* Review preview */}
              <div className="bg-slate-50 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={getRatingBadgeColor(respondingTo.overall_rating)}>
                    <Star className="h-3 w-3 mr-1 fill-current" />
                    {respondingTo.overall_rating.toFixed(1)}
                  </Badge>
                  <span className="text-sm text-slate-500">
                    {respondingTo.anonymous ? "Client anonyme" : respondingTo.user_name || "Client"}
                  </span>
                </div>
                {respondingTo.title && (
                  <div className="font-medium text-sm mb-1">{respondingTo.title}</div>
                )}
                {respondingTo.comment && (
                  <p className="text-sm text-slate-600 line-clamp-3">{respondingTo.comment}</p>
                )}
              </div>

              {responseType === "promo" && (
                <div className="space-y-4">
                  <div className="text-sm text-slate-600">
                    <p>
                      La fonctionnalité de création de code promo sera bientôt disponible.
                      En attendant, vous pouvez publier l'avis directement.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="also-publish"
                      checked={alsoPublish}
                      onCheckedChange={(checked) => setAlsoPublish(checked === true)}
                    />
                    <Label htmlFor="also-publish" className="text-sm cursor-pointer">
                      Publier également l'avis
                    </Label>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRespondingTo(null)}
              disabled={submittingResponse}
            >
              Annuler
            </Button>
            <Button onClick={handleRespond} disabled={submittingResponse}>
              {submittingResponse ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Envoi...
                </>
              ) : responseType === "promo" ? (
                "Envoyer le geste"
              ) : (
                "Publier"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Public response dialog */}
      <Dialog open={!!addingPublicResponse} onOpenChange={(open) => !open && setAddingPublicResponse(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Répondre à l'avis</DialogTitle>
            <DialogDescription>
              Votre réponse sera visible publiquement sous l'avis du client.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Quick response templates */}
            <div>
              <Label className="text-xs text-slate-500 mb-2 block">Messages rapides</Label>
              <div className="flex flex-wrap gap-2">
                {QUICK_RESPONSE_TEMPLATES.map((template) => (
                  <Button
                    key={template.label}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setPublicResponse(template.body)}
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="public-response">Votre réponse</Label>
              <Textarea
                id="public-response"
                value={publicResponse}
                onChange={(e) => setPublicResponse(e.target.value)}
                placeholder="Merci pour votre retour..."
                rows={4}
                maxLength={2000}
              />
              <div className="text-xs text-slate-400 text-right mt-1">
                {publicResponse.length}/2000
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddingPublicResponse(null)}
              disabled={submittingPublicResponse}
            >
              Annuler
            </Button>
            <Button
              onClick={handleAddPublicResponse}
              disabled={submittingPublicResponse || !publicResponse.trim()}
            >
              {submittingPublicResponse ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Envoi...
                </>
              ) : (
                "Publier la réponse"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ProReviewsTab;
