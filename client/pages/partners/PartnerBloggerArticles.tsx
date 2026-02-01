import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  Plus,
  FileText,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  BookOpen,
  TrendingUp,
  DollarSign,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getPartnerToken } from "@/lib/pro/api";
import type { PartnerProfile } from "@/components/partner/PartnerLayout";

type BloggerArticle = {
  id: string;
  slug: string;
  title_fr: string;
  title_en: string;
  excerpt_fr: string;
  excerpt_en: string;
  img: string;
  miniature: string;
  category: string;
  is_published: boolean;
  moderation_status: string | null;
  moderation_note: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  read_count: number;
};

type BloggerStats = {
  total_articles: number;
  published: number;
  pending_moderation: number;
  drafts: number;
  rejected: number;
  total_reads: number;
  pending_payments: number;
  total_earned: number;
};

type LayoutContext = {
  profile: PartnerProfile;
  refreshProfile: () => void;
};

const MODERATION_STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  draft: { label: "Brouillon", icon: FileText, variant: "outline" },
  pending: { label: "En modération", icon: Clock, variant: "secondary" },
  approved: { label: "Approuvé", icon: CheckCircle2, variant: "default" },
  rejected: { label: "Refusé", icon: XCircle, variant: "destructive" },
};

async function fetchBloggerArticles(): Promise<{ author: any; items: BloggerArticle[] }> {
  const token = getPartnerToken();
  const res = await fetch("/api/partner/blogger/articles", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch articles");
  const data = await res.json();
  return { author: data.author, items: data.items ?? [] };
}

async function fetchBloggerStats(): Promise<BloggerStats> {
  const token = getPartnerToken();
  const res = await fetch("/api/partner/blogger/stats", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch stats");
  const data = await res.json();
  return data.stats;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function PartnerBloggerArticles() {
  const { profile } = useOutletContext<LayoutContext>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [articles, setArticles] = useState<BloggerArticle[]>([]);
  const [stats, setStats] = useState<BloggerStats | null>(null);
  const [author, setAuthor] = useState<any>(null);

  const loadData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [articlesRes, statsRes] = await Promise.all([
        fetchBloggerArticles(),
        fetchBloggerStats(),
      ]);
      setArticles(articlesRes.items);
      setAuthor(articlesRes.author);
      setStats(statsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-red-400 mb-3" />
        <div className="text-red-800 font-medium">{error}</div>
        <Button variant="outline" onClick={() => void loadData()} className="mt-4">
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mes articles</h1>
          <p className="text-slate-600 text-sm mt-1">
            Gérez vos articles de blog et suivez leur performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-1", refreshing && "animate-spin")} />
            Actualiser
          </Button>
          <Link to="/partners/articles/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nouvel article
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.total_articles}</div>
                  <div className="text-xs text-slate-500">Total articles</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.published}</div>
                  <div className="text-xs text-slate-500">Publiés</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.total_reads.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">Lectures</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                  <DollarSign className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.total_earned.toLocaleString()} MAD</div>
                  <div className="text-xs text-slate-500">Total gagné</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Stats Row */}
      {stats && (stats.pending_moderation > 0 || stats.drafts > 0 || stats.rejected > 0) && (
        <div className="flex flex-wrap gap-3">
          {stats.drafts > 0 && (
            <Badge variant="outline" className="text-slate-600">
              <FileText className="h-3 w-3 mr-1" />
              {stats.drafts} brouillon{stats.drafts > 1 ? "s" : ""}
            </Badge>
          )}
          {stats.pending_moderation > 0 && (
            <Badge variant="secondary">
              <Clock className="h-3 w-3 mr-1" />
              {stats.pending_moderation} en attente
            </Badge>
          )}
          {stats.rejected > 0 && (
            <Badge variant="destructive">
              <XCircle className="h-3 w-3 mr-1" />
              {stats.rejected} refusé{stats.rejected > 1 ? "s" : ""}
            </Badge>
          )}
          {stats.pending_payments > 0 && (
            <Badge className="bg-amber-100 text-amber-800">
              <DollarSign className="h-3 w-3 mr-1" />
              {stats.pending_payments} paiement{stats.pending_payments > 1 ? "s" : ""} en cours
            </Badge>
          )}
        </div>
      )}

      {/* Articles Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Vos articles</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {articles.length === 0 ? (
            <div className="p-8 text-center">
              <BookOpen className="mx-auto h-12 w-12 text-slate-300 mb-4" />
              <div className="text-slate-600 font-medium">Aucun article pour le moment</div>
              <div className="text-sm text-slate-500 mt-1">
                Créez votre premier article pour commencer
              </div>
              <Link to="/partners/articles/new" className="inline-block mt-4">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Créer un article
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Article</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Lectures</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {articles.map((article) => {
                    const moderationStatus = article.moderation_status || "draft";
                    const config = MODERATION_STATUS_CONFIG[moderationStatus] || MODERATION_STATUS_CONFIG.draft;
                    const StatusIcon = config.icon;

                    return (
                      <TableRow key={article.id}>
                        <TableCell>
                          <div className="flex items-start gap-3">
                            {article.miniature || article.img ? (
                              <img
                                src={article.miniature || article.img}
                                alt=""
                                className="h-10 w-14 rounded object-cover bg-slate-100"
                              />
                            ) : (
                              <div className="h-10 w-14 rounded bg-slate-100 flex items-center justify-center">
                                <FileText className="h-4 w-4 text-slate-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 truncate">
                                {article.title_fr || article.slug}
                              </div>
                              {article.category && (
                                <div className="text-xs text-slate-500">{article.category}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant={config.variant} className="w-fit text-xs">
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {config.label}
                            </Badge>
                            {article.is_published && (
                              <Badge variant="default" className="w-fit text-xs bg-emerald-600">
                                <Eye className="h-3 w-3 mr-1" />
                                Publié
                              </Badge>
                            )}
                            {article.moderation_note && (
                              <div className="text-xs text-red-600 max-w-[150px] truncate" title={article.moderation_note}>
                                {article.moderation_note}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1 text-slate-600">
                            <Eye className="h-3.5 w-3.5" />
                            {(article.read_count ?? 0).toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-slate-600">
                            {formatDate(article.published_at || article.created_at)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link to={`/partners/articles/${article.id}`}>
                              <Button variant="outline" size="sm">
                                Modifier
                              </Button>
                            </Link>
                            {article.is_published && (
                              <a
                                href={`/blog/${article.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Button variant="ghost" size="sm">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </a>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
