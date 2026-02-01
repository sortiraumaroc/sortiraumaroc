/**
 * AdminReviewsPage
 * Moderation of customer reviews and establishment reports
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Star, Clock, AlertTriangle, Send, Check, X, Flag } from "lucide-react";

import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import {
  AdminApiError,
  listAdminReviews,
  listAdminReports,
  approveAdminReview,
  rejectAdminReview,
  sendAdminReviewToPro,
  resolveAdminReport,
  getAdminReviewStats,
  type AdminReview,
  type AdminReport,
  type AdminReviewStatus,
  type AdminReportStatus,
} from "@/lib/adminApi";

import { useToast } from "@/hooks/use-toast";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

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

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------

function reviewStatusBadge(status: AdminReviewStatus) {
  const config: Record<AdminReviewStatus, { className: string; label: string }> = {
    pending_moderation: {
      className: "bg-amber-50 text-amber-700 border-amber-200",
      label: "À modérer",
    },
    sent_to_pro: {
      className: "bg-blue-50 text-blue-700 border-blue-200",
      label: "Envoyé au pro",
    },
    pro_responded_hidden: {
      className: "bg-slate-100 text-slate-700 border-slate-200",
      label: "Masqué (promo)",
    },
    approved: {
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      label: "Publié",
    },
    rejected: {
      className: "bg-red-50 text-red-700 border-red-200",
      label: "Rejeté",
    },
    auto_published: {
      className: "bg-purple-50 text-purple-700 border-purple-200",
      label: "Auto-publié",
    },
  };

  const c = config[status] || { className: "bg-slate-100 text-slate-700", label: status };
  return <Badge className={c.className}>{c.label}</Badge>;
}

function reportStatusBadge(status: AdminReportStatus) {
  const config: Record<AdminReportStatus, { className: string; label: string }> = {
    pending: {
      className: "bg-amber-50 text-amber-700 border-amber-200",
      label: "À traiter",
    },
    investigating: {
      className: "bg-blue-50 text-blue-700 border-blue-200",
      label: "En cours",
    },
    resolved: {
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      label: "Résolu",
    },
    dismissed: {
      className: "bg-slate-100 text-slate-700 border-slate-200",
      label: "Rejeté",
    },
  };

  const c = config[status] || { className: "bg-slate-100 text-slate-700", label: status };
  return <Badge className={c.className}>{c.label}</Badge>;
}

function ratingStars(rating: number) {
  return (
    <div className="flex items-center gap-1">
      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
      <span className="font-semibold">{rating.toFixed(1)}</span>
    </div>
  );
}

const REPORT_REASON_LABELS: Record<string, string> = {
  inappropriate_content: "Contenu inapproprié",
  false_information: "Fausses informations",
  closed_permanently: "Fermé définitivement",
  duplicate_listing: "Doublon",
  spam_or_scam: "Spam / Arnaque",
  safety_concern: "Problème de sécurité",
  harassment: "Harcèlement",
  other: "Autre",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdminReviewsPage() {
  const { toast } = useToast();

  // Tab state
  const [activeTab, setActiveTab] = useState<"reviews" | "reports">("reviews");

  // Reviews state
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<AdminReviewStatus | "all">("all");

  // Reports state
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportStatusFilter, setReportStatusFilter] = useState<AdminReportStatus | "all">("all");

  // Search
  const [search, setSearch] = useState("");

  // Stats
  const [stats, setStats] = useState<{
    reviews: Record<string, number>;
    reports: Record<string, number>;
    expiring_soon: number;
  } | null>(null);

  // Dialogs
  const [selectedReview, setSelectedReview] = useState<AdminReview | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<AdminReport | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolveAction, setResolveAction] = useState<string>("none");

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const res = await listAdminReviews(undefined, {
        status: reviewStatusFilter === "all" ? undefined : reviewStatusFilter,
        limit: 100,
      });
      setReviews(res.items || []);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur de chargement";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setReviewsLoading(false);
    }
  }, [reviewStatusFilter, toast]);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const res = await listAdminReports(undefined, {
        status: reportStatusFilter === "all" ? undefined : reportStatusFilter,
        limit: 100,
      });
      setReports(res.items || []);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur de chargement";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setReportsLoading(false);
    }
  }, [reportStatusFilter, toast]);

  const loadStats = useCallback(async () => {
    try {
      const res = await getAdminReviewStats(undefined);
      setStats({
        reviews: res.reviews,
        reports: res.reports,
        expiring_soon: res.expiring_soon,
      });
    } catch {
      // Ignore stats errors
    }
  }, []);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // ---------------------------------------------------------------------------
  // Review actions
  // ---------------------------------------------------------------------------

  const handleApproveReview = async () => {
    if (!selectedReview) return;
    setActionLoading(true);
    try {
      await approveAdminReview(undefined, selectedReview.id);
      toast({ title: "Avis approuvé", description: "L'avis a été publié." });
      setReviewDialogOpen(false);
      setSelectedReview(null);
      void loadReviews();
      void loadStats();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectReview = async () => {
    if (!selectedReview || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await rejectAdminReview(undefined, selectedReview.id, rejectReason.trim());
      toast({ title: "Avis rejeté", description: "L'avis a été rejeté." });
      setRejectDialogOpen(false);
      setReviewDialogOpen(false);
      setSelectedReview(null);
      setRejectReason("");
      void loadReviews();
      void loadStats();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendToPro = async () => {
    if (!selectedReview) return;
    setActionLoading(true);
    try {
      const res = await sendAdminReviewToPro(undefined, selectedReview.id);
      toast({
        title: "Envoyé au Pro",
        description: `Le pro a jusqu'au ${formatLeJjMmAaAHeure(res.deadline)} pour répondre.`,
      });
      setReviewDialogOpen(false);
      setSelectedReview(null);
      void loadReviews();
      void loadStats();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Report actions
  // ---------------------------------------------------------------------------

  const handleResolveReport = async (status: "resolved" | "dismissed") => {
    if (!selectedReport) return;
    setActionLoading(true);
    try {
      await resolveAdminReport(undefined, selectedReport.id, {
        status,
        notes: resolveNotes.trim() || undefined,
        action_taken: status === "resolved" ? resolveAction : undefined,
      });
      toast({
        title: status === "resolved" ? "Signalement résolu" : "Signalement rejeté",
        description: "Le signalement a été traité.",
      });
      setReportDialogOpen(false);
      setSelectedReport(null);
      setResolveNotes("");
      setResolveAction("none");
      void loadReports();
      void loadStats();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Filtered data
  // ---------------------------------------------------------------------------

  const filteredReviews = useMemo(() => {
    if (!search.trim()) return reviews;
    const q = search.toLowerCase();
    return reviews.filter((r) => {
      const hay = [
        r.establishments?.name,
        r.establishments?.title,
        r.establishments?.city,
        r.user_email,
        r.comment,
        r.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [reviews, search]);

  const filteredReports = useMemo(() => {
    if (!search.trim()) return reports;
    const q = search.toLowerCase();
    return reports.filter((r) => {
      const hay = [
        r.establishments?.name,
        r.establishments?.title,
        r.reporter_email,
        r.reason_text,
        REPORT_REASON_LABELS[r.reason_code],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [reports, search]);

  // ---------------------------------------------------------------------------
  // Table columns
  // ---------------------------------------------------------------------------

  const reviewColumns = useMemo<ColumnDef<AdminReview>[]>(
    () => [
      {
        accessorKey: "overall_rating",
        header: "Note",
        cell: ({ row }) => ratingStars(row.original.overall_rating),
      },
      {
        accessorKey: "establishments.name",
        header: "Établissement",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.establishments?.name || row.original.establishments?.title || "—"}
            </div>
            <div className="text-xs text-slate-500">
              {row.original.establishments?.city}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "user_email",
        header: "Auteur",
        cell: ({ row }) =>
          row.original.anonymous ? (
            <span className="text-slate-400 italic">Anonyme</span>
          ) : (
            row.original.user_email || "—"
          ),
      },
      {
        accessorKey: "comment",
        header: "Commentaire",
        cell: ({ row }) => (
          <div className="max-w-[200px] truncate text-sm text-slate-600">
            {row.original.comment || <span className="italic text-slate-400">Pas de commentaire</span>}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => reviewStatusBadge(row.original.status),
      },
      {
        accessorKey: "pro_response_deadline",
        header: "Deadline",
        cell: ({ row }) => {
          if (row.original.status !== "sent_to_pro" || !row.original.pro_response_deadline) {
            return "—";
          }
          const deadline = new Date(row.original.pro_response_deadline);
          const now = new Date();
          const hoursLeft = Math.max(0, (deadline.getTime() - now.getTime()) / (1000 * 60 * 60));
          const isUrgent = hoursLeft < 6;
          return (
            <div className={`flex items-center gap-1 ${isUrgent ? "text-red-600" : "text-slate-600"}`}>
              <Clock className="h-3 w-3" />
              <span className="text-xs tabular-nums">
                {hoursLeft < 1 ? "< 1h" : `${Math.floor(hoursLeft)}h`}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{formatLeJjMmAaAHeure(row.original.created_at)}</span>
        ),
      },
    ],
    []
  );

  const reportColumns = useMemo<ColumnDef<AdminReport>[]>(
    () => [
      {
        accessorKey: "reason_code",
        header: "Motif",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-red-500" />
            <span>{REPORT_REASON_LABELS[row.original.reason_code] || row.original.reason_code}</span>
          </div>
        ),
      },
      {
        accessorKey: "establishments.name",
        header: "Établissement",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.establishments?.name || row.original.establishments?.title || "—"}
            </div>
            <div className="text-xs text-slate-500">
              {row.original.establishments?.city}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "reporter_email",
        header: "Signalé par",
        cell: ({ row }) => row.original.reporter_email || <span className="text-slate-400">Anonyme</span>,
      },
      {
        accessorKey: "reason_text",
        header: "Détails",
        cell: ({ row }) => (
          <div className="max-w-[200px] truncate text-sm text-slate-600">
            {row.original.reason_text || "—"}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => reportStatusBadge(row.original.status),
      },
      {
        accessorKey: "created_at",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{formatLeJjMmAaAHeure(row.original.created_at)}</span>
        ),
      },
    ],
    []
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Avis & signalements"
        description="Modération des avis clients et des signalements d'établissements."
        actions={
          <Button variant="outline" onClick={() => { void loadReviews(); void loadReports(); void loadStats(); }}>
            Rafraîchir
          </Button>
        }
      />

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-600">
                {stats.reviews.pending_moderation || 0}
              </div>
              <div className="text-xs text-slate-500">Avis à modérer</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">
                {stats.reviews.sent_to_pro || 0}
              </div>
              <div className="text-xs text-slate-500">Envoyés au pro</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600">
                {stats.expiring_soon || 0}
              </div>
              <div className="text-xs text-slate-500">Deadline {"<"} 6h</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-600">
                {stats.reports.pending || 0}
              </div>
              <div className="text-xs text-slate-500">Signalements à traiter</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "reviews" | "reports")}>
        <TabsList>
          <TabsTrigger value="reviews" className="gap-2">
            <Star className="h-4 w-4" />
            Avis ({reviews.length})
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <Flag className="h-4 w-4" />
            Signalements ({reports.length})
          </TabsTrigger>
        </TabsList>

        {/* Reviews Tab */}
        <TabsContent value="reviews" className="space-y-4">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm">Filtres</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Recherche</Label>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="établissement, email, commentaire…"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Statut</Label>
                  <Select
                    value={reviewStatusFilter}
                    onValueChange={(v) => setReviewStatusFilter(v as AdminReviewStatus | "all")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="pending_moderation">À modérer</SelectItem>
                      <SelectItem value="sent_to_pro">Envoyé au pro</SelectItem>
                      <SelectItem value="approved">Publié</SelectItem>
                      <SelectItem value="auto_published">Auto-publié</SelectItem>
                      <SelectItem value="rejected">Rejeté</SelectItem>
                      <SelectItem value="pro_responded_hidden">Masqué (promo)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setReviewStatusFilter("all");
                    }}
                  >
                    Réinitialiser
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {reviewsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : filteredReviews.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
              Aucun avis à afficher.
            </div>
          ) : (
            <AdminDataTable
              data={filteredReviews}
              columns={reviewColumns}
              searchPlaceholder="Rechercher…"
              onRowClick={(row) => {
                setSelectedReview(row);
                setReviewDialogOpen(true);
              }}
            />
          )}
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm">Filtres</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Recherche</Label>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="établissement, email, motif…"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Statut</Label>
                  <Select
                    value={reportStatusFilter}
                    onValueChange={(v) => setReportStatusFilter(v as AdminReportStatus | "all")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="pending">À traiter</SelectItem>
                      <SelectItem value="investigating">En cours</SelectItem>
                      <SelectItem value="resolved">Résolu</SelectItem>
                      <SelectItem value="dismissed">Rejeté</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setReportStatusFilter("all");
                    }}
                  >
                    Réinitialiser
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {reportsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
              Aucun signalement à afficher.
            </div>
          ) : (
            <AdminDataTable
              data={filteredReports}
              columns={reportColumns}
              searchPlaceholder="Rechercher…"
              onRowClick={(row) => {
                setSelectedReport(row);
                setReportDialogOpen(true);
              }}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Review Detail Dialog */}
      <Dialog
        open={reviewDialogOpen}
        onOpenChange={(open) => {
          setReviewDialogOpen(open);
          if (!open) setSelectedReview(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détail de l'avis</DialogTitle>
            <DialogDescription>
              Modération de l'avis client
            </DialogDescription>
          </DialogHeader>

          {selectedReview && (
            <div className="space-y-4">
              {/* Rating and status */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium text-slate-500">Note</div>
                  <div className="mt-1 flex items-center gap-2">
                    {ratingStars(selectedReview.overall_rating)}
                    <span className="text-sm text-slate-500">/ 5</span>
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium text-slate-500">Statut</div>
                  <div className="mt-2">{reviewStatusBadge(selectedReview.status)}</div>
                </div>
              </div>

              {/* Establishment and author */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium text-slate-500">Établissement</div>
                  <div className="mt-1 font-semibold">
                    {selectedReview.establishments?.name || selectedReview.establishments?.title}
                  </div>
                  <div className="text-xs text-slate-500">
                    {selectedReview.establishments?.city} • {selectedReview.establishments?.universe}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium text-slate-500">Auteur</div>
                  <div className="mt-1 font-semibold">
                    {selectedReview.anonymous ? (
                      <span className="italic text-slate-400">Anonyme</span>
                    ) : (
                      selectedReview.user_email
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatLeJjMmAaAHeure(selectedReview.created_at)}
                  </div>
                </div>
              </div>

              {/* Comment */}
              <div className="rounded-lg border p-3">
                <div className="text-xs font-medium text-slate-500">Commentaire</div>
                {selectedReview.title && (
                  <div className="mt-1 font-semibold">{selectedReview.title}</div>
                )}
                <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                  {selectedReview.comment || <span className="italic text-slate-400">Pas de commentaire</span>}
                </div>
              </div>

              {/* Criteria ratings */}
              {selectedReview.criteria_ratings && Object.keys(selectedReview.criteria_ratings).length > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium text-slate-500 mb-2">Notes détaillées</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(selectedReview.criteria_ratings).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 capitalize">{key.replace(/_/g, " ")}</span>
                        <span className="font-medium">{(value as number).toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pro deadline warning */}
              {selectedReview.status === "sent_to_pro" && selectedReview.pro_response_deadline && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-amber-700">
                    <Clock className="h-4 w-4" />
                    <span className="font-medium">
                      Deadline pro : {formatLeJjMmAaAHeure(selectedReview.pro_response_deadline)}
                    </span>
                  </div>
                </div>
              )}

              {/* Rejection reason */}
              {selectedReview.status === "rejected" && selectedReview.rejection_reason && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="text-xs font-medium text-red-700">Raison du rejet</div>
                  <div className="mt-1 text-sm text-red-600">{selectedReview.rejection_reason}</div>
                </div>
              )}

              {/* Actions */}
              {selectedReview.status === "pending_moderation" && (
                <DialogFooter className="gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => setRejectDialogOpen(true)}
                    disabled={actionLoading}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Rejeter
                  </Button>
                  {selectedReview.overall_rating < 3.5 && (
                    <Button
                      variant="outline"
                      onClick={handleSendToPro}
                      disabled={actionLoading}
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      {actionLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Envoyer au Pro (24h)
                    </Button>
                  )}
                  <Button onClick={handleApproveReview} disabled={actionLoading}>
                    {actionLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Approuver & Publier
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter l'avis</DialogTitle>
            <DialogDescription>
              Indiquez la raison du rejet. L'avis ne sera pas publié.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Raison du rejet</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ex: Contenu inapproprié, langage offensant, fausses informations…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectReview}
              disabled={actionLoading || !rejectReason.trim()}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Detail Dialog */}
      <Dialog
        open={reportDialogOpen}
        onOpenChange={(open) => {
          setReportDialogOpen(open);
          if (!open) {
            setSelectedReport(null);
            setResolveNotes("");
            setResolveAction("none");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détail du signalement</DialogTitle>
            <DialogDescription>
              Traitement du signalement d'établissement
            </DialogDescription>
          </DialogHeader>

          {selectedReport && (
            <div className="space-y-4">
              {/* Reason and status */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium text-slate-500">Motif</div>
                  <div className="mt-1 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="font-medium">
                      {REPORT_REASON_LABELS[selectedReport.reason_code] || selectedReport.reason_code}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium text-slate-500">Statut</div>
                  <div className="mt-2">{reportStatusBadge(selectedReport.status)}</div>
                </div>
              </div>

              {/* Establishment and reporter */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium text-slate-500">Établissement signalé</div>
                  <div className="mt-1 font-semibold">
                    {selectedReport.establishments?.name || selectedReport.establishments?.title}
                  </div>
                  <div className="text-xs text-slate-500">
                    {selectedReport.establishments?.city} • {selectedReport.establishments?.universe}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium text-slate-500">Signalé par</div>
                  <div className="mt-1 font-semibold">
                    {selectedReport.reporter_email || <span className="italic text-slate-400">Anonyme</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatLeJjMmAaAHeure(selectedReport.created_at)}
                  </div>
                </div>
              </div>

              {/* Details */}
              {selectedReport.reason_text && (
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium text-slate-500">Détails</div>
                  <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                    {selectedReport.reason_text}
                  </div>
                </div>
              )}

              {/* Resolution notes (if already resolved) */}
              {selectedReport.resolved_at && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-xs font-medium text-emerald-700">Résolution</div>
                  <div className="mt-1 text-sm text-emerald-600">
                    {selectedReport.resolution_notes || "Aucune note"}
                  </div>
                  {selectedReport.action_taken && (
                    <div className="mt-2 text-xs text-emerald-500">
                      Action : {selectedReport.action_taken}
                    </div>
                  )}
                </div>
              )}

              {/* Resolution form (if pending) */}
              {selectedReport.status === "pending" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="resolve-notes">Notes de résolution</Label>
                    <Textarea
                      id="resolve-notes"
                      value={resolveNotes}
                      onChange={(e) => setResolveNotes(e.target.value)}
                      placeholder="Notes sur la résolution du signalement…"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Action prise</Label>
                    <Select value={resolveAction} onValueChange={setResolveAction}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucune action</SelectItem>
                        <SelectItem value="warning_sent">Avertissement envoyé</SelectItem>
                        <SelectItem value="content_removed">Contenu supprimé</SelectItem>
                        <SelectItem value="listing_suspended">Listing suspendu</SelectItem>
                        <SelectItem value="listing_removed">Listing supprimé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <DialogFooter className="gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleResolveReport("dismissed")}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Rejeter le signalement
                    </Button>
                    <Button
                      onClick={() => handleResolveReport("resolved")}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Marquer comme résolu
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
