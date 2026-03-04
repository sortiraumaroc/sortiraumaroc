import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link, useOutletContext } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Send,
  Eye,
  EyeOff,
  DollarSign,
  ExternalLink,
  FileText,
  Clock,
  XCircle,
  ImageIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  body_html_fr: string;
  body_html_en: string;
  meta_title_fr: string;
  meta_title_en: string;
  meta_description_fr: string;
  meta_description_en: string;
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

type PaymentStatus = {
  is_published: boolean;
  moderation_status: string;
  has_valid_rib: boolean;
  can_request_payment: boolean;
  existing_request: {
    id: string;
    status: string;
    amount_ht: number;
    created_at: string;
  } | null;
};

type LayoutContext = {
  profile: PartnerProfile;
  refreshProfile: () => void;
};

const MODERATION_STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof Clock; className: string }
> = {
  draft: { label: "Brouillon", icon: FileText, className: "bg-slate-100 text-slate-700" },
  pending: { label: "En modération", icon: Clock, className: "bg-amber-100 text-amber-800" },
  approved: { label: "Approuvé", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Refusé", icon: XCircle, className: "bg-red-100 text-red-800" },
};

async function fetchArticle(id: string): Promise<BloggerArticle> {
  const token = getPartnerToken();
  const res = await fetch(`/api/partner/blogger/articles/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch article");
  const data = await res.json();
  return data.article;
}

async function createArticle(article: Partial<BloggerArticle>): Promise<BloggerArticle> {
  const token = getPartnerToken();
  const res = await fetch("/api/partner/blogger/articles", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(article),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create article");
  }
  const data = await res.json();
  return data.article;
}

async function updateArticle(id: string, article: Partial<BloggerArticle>): Promise<BloggerArticle> {
  const token = getPartnerToken();
  const res = await fetch(`/api/partner/blogger/articles/${id}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(article),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update article");
  }
  const data = await res.json();
  return data.article;
}

async function submitForModeration(id: string): Promise<BloggerArticle> {
  const token = getPartnerToken();
  const res = await fetch(`/api/partner/blogger/articles/${id}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to submit");
  }
  const data = await res.json();
  return data.article;
}

async function fetchPaymentStatus(id: string): Promise<PaymentStatus> {
  const token = getPartnerToken();
  const res = await fetch(`/api/partner/blogger/articles/${id}/payment-status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch payment status");
  return await res.json();
}

async function requestPayment(id: string): Promise<void> {
  const token = getPartnerToken();
  const res = await fetch(`/api/partner/blogger/articles/${id}/request-payment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to request payment");
  }
}

export default function PartnerBloggerArticleEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useOutletContext<LayoutContext>();
  const isNew = id === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [article, setArticle] = useState<Partial<BloggerArticle>>({
    title_fr: "",
    title_en: "",
    excerpt_fr: "",
    excerpt_en: "",
    body_html_fr: "",
    body_html_en: "",
    meta_title_fr: "",
    meta_title_en: "",
    meta_description_fr: "",
    meta_description_en: "",
    img: "",
    miniature: "",
    category: "",
    moderation_status: "draft",
  });

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [requestingPayment, setRequestingPayment] = useState(false);

  const loadArticle = useCallback(async () => {
    if (isNew || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [articleData, paymentData] = await Promise.all([
        fetchArticle(id),
        fetchPaymentStatus(id).catch(() => null),
      ]);
      setArticle(articleData);
      setPaymentStatus(paymentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    void loadArticle();
  }, [loadArticle]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (isNew) {
        const created = await createArticle(article);
        setSuccess("Article créé avec succès");
        navigate(`/partners/articles/${created.id}`, { replace: true });
      } else if (id) {
        const updated = await updateArticle(id, article);
        setArticle(updated);
        setSuccess("Article enregistré");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!id || isNew) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setShowSubmitDialog(false);

    try {
      const updated = await submitForModeration(id);
      setArticle(updated);
      setSuccess("Article soumis à la modération");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la soumission");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestPayment = async () => {
    if (!id || isNew) return;
    setRequestingPayment(true);
    setError(null);
    setSuccess(null);
    setShowPaymentDialog(false);

    try {
      await requestPayment(id);
      const newPaymentStatus = await fetchPaymentStatus(id);
      setPaymentStatus(newPaymentStatus);
      setSuccess("Demande de paiement envoyée");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la demande de paiement");
    } finally {
      setRequestingPayment(false);
    }
  };

  const updateField = (field: keyof BloggerArticle, value: string) => {
    setArticle((prev) => ({ ...prev, [field]: value }));
  };

  const canSubmit =
    !isNew &&
    article.id &&
    ["draft", "rejected"].includes(article.moderation_status || "draft") &&
    !article.is_published;

  const canRequestPayment =
    paymentStatus?.can_request_payment && article.is_published;

  const moderationConfig =
    MODERATION_STATUS_CONFIG[article.moderation_status || "draft"] ||
    MODERATION_STATUS_CONFIG.draft;
  const StatusIcon = moderationConfig.icon;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/partners/articles">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 me-1" />
              Retour
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {isNew ? "Nouvel article" : "Modifier l'article"}
            </h1>
            {!isNew && (
              <div className="flex items-center gap-2 mt-1">
                <Badge className={cn("text-xs", moderationConfig.className)}>
                  <StatusIcon className="h-3 w-3 me-1" />
                  {moderationConfig.label}
                </Badge>
                {article.is_published && (
                  <Badge className="text-xs bg-emerald-600 text-white">
                    <Eye className="h-3 w-3 me-1" />
                    Publié
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canRequestPayment && (
            <Button
              variant="outline"
              className="gap-2 text-amber-600 border-amber-300 hover:bg-amber-50"
              onClick={() => setShowPaymentDialog(true)}
            >
              <DollarSign className="h-4 w-4" />
              Réclamer paiement
            </Button>
          )}
          {canSubmit && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowSubmitDialog(true)}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Soumettre
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || article.is_published} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Enregistrer
          </Button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Succès</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {article.moderation_note && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Motif de refus</AlertTitle>
          <AlertDescription>{article.moderation_note}</AlertDescription>
        </Alert>
      )}

      {article.is_published && (
        <Alert className="border-blue-200 bg-blue-50 text-blue-800">
          <Eye className="h-4 w-4" />
          <AlertTitle>Article publié</AlertTitle>
          <AlertDescription>
            Cet article est publié et ne peut plus être modifié.
            <a
              href={`/blog/${article.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ms-2 underline inline-flex items-center gap-1"
            >
              Voir l'article <ExternalLink className="h-3 w-3" />
            </a>
          </AlertDescription>
        </Alert>
      )}

      {/* Payment Status */}
      {paymentStatus?.existing_request && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <DollarSign className="h-4 w-4" />
          <AlertTitle>Demande de paiement</AlertTitle>
          <AlertDescription>
            Statut: <strong>{paymentStatus.existing_request.status}</strong> —
            Montant: <strong>{paymentStatus.existing_request.amount_ht} MAD</strong>
          </AlertDescription>
        </Alert>
      )}

      {/* Editor Tabs */}
      <Tabs defaultValue="content-fr" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="content-fr">Contenu FR</TabsTrigger>
          <TabsTrigger value="content-en">Contenu EN</TabsTrigger>
          <TabsTrigger value="media">Médias</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>

        {/* French Content */}
        <TabsContent value="content-fr">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contenu français</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title_fr">Titre *</Label>
                <Input
                  id="title_fr"
                  value={article.title_fr || ""}
                  onChange={(e) => updateField("title_fr", e.target.value)}
                  placeholder="Titre de l'article en français"
                  disabled={article.is_published}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="excerpt_fr">Extrait</Label>
                <Textarea
                  id="excerpt_fr"
                  value={article.excerpt_fr || ""}
                  onChange={(e) => updateField("excerpt_fr", e.target.value)}
                  placeholder="Court résumé de l'article"
                  rows={3}
                  disabled={article.is_published}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="body_html_fr">Contenu *</Label>
                <Textarea
                  id="body_html_fr"
                  value={article.body_html_fr || ""}
                  onChange={(e) => updateField("body_html_fr", e.target.value)}
                  placeholder="Contenu complet de l'article (HTML autorisé)"
                  rows={15}
                  className="font-mono text-sm"
                  disabled={article.is_published}
                />
                <p className="text-xs text-slate-500">
                  Vous pouvez utiliser des balises HTML pour la mise en forme.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* English Content */}
        <TabsContent value="content-en">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contenu anglais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title_en">Title</Label>
                <Input
                  id="title_en"
                  value={article.title_en || ""}
                  onChange={(e) => updateField("title_en", e.target.value)}
                  placeholder="Article title in English"
                  disabled={article.is_published}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="excerpt_en">Excerpt</Label>
                <Textarea
                  id="excerpt_en"
                  value={article.excerpt_en || ""}
                  onChange={(e) => updateField("excerpt_en", e.target.value)}
                  placeholder="Short summary of the article"
                  rows={3}
                  disabled={article.is_published}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="body_html_en">Content</Label>
                <Textarea
                  id="body_html_en"
                  value={article.body_html_en || ""}
                  onChange={(e) => updateField("body_html_en", e.target.value)}
                  placeholder="Full article content (HTML allowed)"
                  rows={15}
                  className="font-mono text-sm"
                  disabled={article.is_published}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Media */}
        <TabsContent value="media">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Images</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="img">Image principale (URL)</Label>
                <Input
                  id="img"
                  value={article.img || ""}
                  onChange={(e) => updateField("img", e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  disabled={article.is_published}
                />
                {article.img && (
                  <img
                    src={article.img}
                    alt="Preview"
                    className="mt-2 max-h-48 rounded object-cover"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="miniature">Miniature (URL)</Label>
                <Input
                  id="miniature"
                  value={article.miniature || ""}
                  onChange={(e) => updateField("miniature", e.target.value)}
                  placeholder="https://example.com/thumbnail.jpg"
                  disabled={article.is_published}
                />
                {article.miniature && (
                  <img
                    src={article.miniature}
                    alt="Thumbnail preview"
                    className="mt-2 max-h-24 rounded object-cover"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Catégorie</Label>
                <Input
                  id="category"
                  value={article.category || ""}
                  onChange={(e) => updateField("category", e.target.value)}
                  placeholder="Ex: Gastronomie, Voyage, Culture..."
                  disabled={article.is_published}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEO */}
        <TabsContent value="seo">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">SEO Français</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="meta_title_fr">Meta Title</Label>
                  <Input
                    id="meta_title_fr"
                    value={article.meta_title_fr || ""}
                    onChange={(e) => updateField("meta_title_fr", e.target.value)}
                    placeholder="Titre pour les moteurs de recherche"
                    disabled={article.is_published}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meta_description_fr">Meta Description</Label>
                  <Textarea
                    id="meta_description_fr"
                    value={article.meta_description_fr || ""}
                    onChange={(e) => updateField("meta_description_fr", e.target.value)}
                    placeholder="Description pour les moteurs de recherche"
                    rows={3}
                    disabled={article.is_published}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">SEO English</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="meta_title_en">Meta Title</Label>
                  <Input
                    id="meta_title_en"
                    value={article.meta_title_en || ""}
                    onChange={(e) => updateField("meta_title_en", e.target.value)}
                    placeholder="Title for search engines"
                    disabled={article.is_published}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meta_description_en">Meta Description</Label>
                  <Textarea
                    id="meta_description_en"
                    value={article.meta_description_en || ""}
                    onChange={(e) => updateField("meta_description_en", e.target.value)}
                    placeholder="Description for search engines"
                    rows={3}
                    disabled={article.is_published}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Submit Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Soumettre pour modération</DialogTitle>
            <DialogDescription>
              Votre article sera examiné par notre équipe avant publication.
              Vous ne pourrez plus le modifier une fois soumis.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              Soumettre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demander le paiement</DialogTitle>
            <DialogDescription>
              Vous allez demander le paiement pour cet article publié.
              Le montant sera crédité sur votre compte après validation.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-600">500 MAD</div>
              <div className="text-sm text-slate-500">Montant par article</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleRequestPayment}
              disabled={requestingPayment}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {requestingPayment && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              Confirmer la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
