import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Video,
} from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AdminApiError,
  loadAdminSessionToken,
  createAdminVisibilityOffer,
  deleteAdminVisibilityOffer,
  listAdminVisibilityOffers,
  listAdminVisibilityOrders,
  updateAdminVisibilityOffer,
  updateAdminVisibilityOrderItemMeta,
  updateAdminVisibilityOrderStatus,
  listAdminMediaQuotes,
  getAdminMediaQuote,
  createAdminMediaQuote,
  updateAdminMediaQuote,
  addAdminMediaQuoteItem,
  updateAdminMediaQuoteItem,
  deleteAdminMediaQuoteItem,
  createAdminMediaQuotePublicLink,
  sendAdminMediaQuoteEmail,
  markAdminMediaQuoteAccepted,
  markAdminMediaQuoteRejected,
  convertAdminMediaQuoteToInvoice,
  listAdminMediaInvoices,
  getAdminMediaInvoice,
  createAdminMediaInvoicePublicLink,
  sendAdminMediaInvoiceEmail,
  markAdminMediaInvoicePaid,
  listAdminProProfiles,
  getAdminProProfile,
  updateAdminProProfile,
  type AdminProProfile,
  type AdminProProfileInput,
  type AdminVisibilityOffer,
  type AdminVisibilityOfferType,
  type AdminVisibilityOrder,
  type AdminVisibilityOrderItem,
  type AdminMediaQuote,
  type AdminMediaQuoteItem,
  type AdminMediaInvoice,
} from "@/lib/adminApi";
import { formatMoney } from "@/lib/money";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function formatLocalYmdHm(iso: string): string {
  const v = String(iso || "");
  return v ? formatLeJjMmAaAHeure(v) : "—";
}

function formatMoneyAmount(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  const n =
    typeof amount === "number" && Number.isFinite(amount)
      ? amount
      : Number(amount ?? 0);
  const c = String(currency ?? "MAD") || "MAD";

  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: c,
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${c}`;
  }
}

async function downloadAdminPdf(path: string, filename: string): Promise<void> {
  const sessionToken = loadAdminSessionToken();
  if (!sessionToken)
    throw new Error("Session admin manquante. Merci de vous reconnecter.");

  const res = await fetch(path, {
    method: "GET",
    credentials: "omit",
    headers: {
      "x-admin-session": sessionToken,
    },
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const payload = (await res.json()) as any;
        if (
          payload &&
          typeof payload.error === "string" &&
          payload.error.trim()
        )
          msg = payload.error;
      } catch {
        // ignore
      }
    } else {
      try {
        const text = await res.text();
        if (text && text.trim()) msg = text;
      } catch {
        // ignore
      }
    }

    throw new Error(msg);
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);
  }
}

function offerTypeBadge(type: AdminVisibilityOfferType) {
  const t = String(type ?? "").toLowerCase();
  if (t === "menu_digital")
    return {
      label: "Menu Digital",
      cls: "bg-indigo-50 text-indigo-700 border-indigo-200",
    };
  if (t === "media_video")
    return {
      label: "Média vidéo",
      cls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
    };
  if (t === "pack")
    return {
      label: "Pack",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  if (t === "option")
    return {
      label: "Option",
      cls: "bg-slate-50 text-slate-700 border-slate-200",
    };
  if (t === "article_sponsorise")
    return {
      label: "Article sponsorisé",
      cls: "bg-amber-50 text-amber-800 border-amber-200",
    };
  if (t === "newsletter")
    return {
      label: "Newsletter",
      cls: "bg-sky-50 text-sky-800 border-sky-200",
    };
  return { label: type, cls: "bg-slate-50 text-slate-700 border-slate-200" };
}

function orderStatusBadge(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "pending")
    return {
      label: "En attente",
      cls: "bg-slate-50 text-slate-700 border-slate-200",
    };
  if (s === "in_progress")
    return {
      label: "En cours",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    };
  if (s === "delivered")
    return {
      label: "Livré",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  if (s === "cancelled")
    return {
      label: "Annulé",
      cls: "bg-slate-100 text-slate-700 border-slate-200",
    };
  if (s === "refunded")
    return {
      label: "Remboursé",
      cls: "bg-rose-50 text-rose-700 border-rose-200",
    };
  return { label: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
}

function paymentStatusBadge(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "paid")
    return {
      label: "Payé",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  if (s === "pending")
    return {
      label: "En attente",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    };
  if (s === "failed")
    return { label: "Échec", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  if (s === "refunded")
    return {
      label: "Remboursé",
      cls: "bg-slate-100 text-slate-700 border-slate-200",
    };
  return { label: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
}

function quoteStatusBadge(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "draft")
    return {
      label: "Brouillon",
      cls: "bg-slate-50 text-slate-700 border-slate-200",
    };
  if (s === "sent")
    return {
      label: "Envoyé",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    };
  if (s === "accepted")
    return {
      label: "Accepté",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  if (s === "rejected")
    return { label: "Refusé", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  if (s === "expired")
    return {
      label: "Expiré",
      cls: "bg-slate-100 text-slate-700 border-slate-200",
    };
  if (s === "cancelled")
    return {
      label: "Annulé",
      cls: "bg-slate-100 text-slate-700 border-slate-200",
    };
  return { label: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
}

function invoiceStatusBadge(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "issued")
    return {
      label: "Émise",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    };
  if (s === "paid")
    return {
      label: "Payée",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  if (s === "partial")
    return {
      label: "Partielle",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    };
  if (s === "overdue")
    return {
      label: "En retard",
      cls: "bg-rose-50 text-rose-700 border-rose-200",
    };
  if (s === "cancelled")
    return {
      label: "Annulée",
      cls: "bg-slate-100 text-slate-700 border-slate-200",
    };
  if (s === "draft")
    return {
      label: "Brouillon",
      cls: "bg-slate-50 text-slate-700 border-slate-200",
    };
  return { label: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
}

type OfferEditorProps = {
  open: boolean;
  offer: AdminVisibilityOffer | null;
  onClose: () => void;
  onSaved: () => void;
};

function OfferEditorDialog({
  open,
  offer,
  onClose,
  onSaved,
}: OfferEditorProps) {
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState(offer?.title ?? "");
  const [description, setDescription] = useState(offer?.description ?? "");
  const [type, setType] = useState<AdminVisibilityOfferType>(
    (offer?.type as AdminVisibilityOfferType) ?? "pack",
  );
  const [durationDays, setDurationDays] = useState(
    offer?.duration_days != null ? String(offer.duration_days) : "",
  );
  const [priceMad, setPriceMad] = useState(
    offer?.price_cents != null
      ? String((offer.price_cents / 100).toFixed(2))
      : "",
  );
  const [currency, setCurrency] = useState(offer?.currency ?? "MAD");
  const [active, setActive] = useState<boolean>(offer?.active ?? false);
  const [allowQuantity, setAllowQuantity] = useState<boolean>(
    offer?.allow_quantity ?? false,
  );
  const [taxRateBps, setTaxRateBps] = useState(
    offer?.tax_rate_bps != null ? String(offer.tax_rate_bps) : "0",
  );
  const [taxLabel, setTaxLabel] = useState(offer?.tax_label ?? "TVA");
  const [displayOrder, setDisplayOrder] = useState(
    offer?.display_order != null ? String(offer.display_order) : "0",
  );
  const [deliverablesText, setDeliverablesText] = useState(
    Array.isArray(offer?.deliverables) ? offer!.deliverables.join("\n") : "",
  );

  useEffect(() => {
    if (!open) return;
    setTitle(offer?.title ?? "");
    setDescription(offer?.description ?? "");
    setType((offer?.type as AdminVisibilityOfferType) ?? "pack");
    setDurationDays(
      offer?.duration_days != null ? String(offer.duration_days) : "",
    );
    setPriceMad(
      offer?.price_cents != null
        ? String((offer.price_cents / 100).toFixed(2))
        : "",
    );
    setCurrency(offer?.currency ?? "MAD");
    setActive(offer?.active ?? false);
    setAllowQuantity(offer?.allow_quantity ?? false);
    setTaxRateBps(
      offer?.tax_rate_bps != null ? String(offer.tax_rate_bps) : "0",
    );
    setTaxLabel(offer?.tax_label ?? "TVA");
    setDisplayOrder(
      offer?.display_order != null ? String(offer.display_order) : "0",
    );
    setDeliverablesText(
      Array.isArray(offer?.deliverables) ? offer!.deliverables.join("\n") : "",
    );
  }, [open, offer]);

  const save = async () => {
    const safeTitle = title.trim();
    if (!safeTitle) {
      toast({
        title: "Erreur",
        description: "Le titre est requis.",
        variant: "destructive",
      });
      return;
    }

    const durationDaysNumRaw = durationDays.trim()
      ? Number(durationDays)
      : null;
    const durationDaysNum =
      durationDaysNumRaw != null &&
      Number.isFinite(durationDaysNumRaw) &&
      durationDaysNumRaw > 0
        ? Math.floor(durationDaysNumRaw)
        : null;

    const priceNumRaw = priceMad.trim() ? Number(priceMad) : null;
    const priceCents =
      priceNumRaw != null && Number.isFinite(priceNumRaw) && priceNumRaw >= 0
        ? Math.round(priceNumRaw * 100)
        : null;

    const deliverables = deliverablesText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const payload = {
      title: safeTitle,
      description: description.trim() ? description.trim() : null,
      type,
      duration_days: durationDaysNum,
      price_cents: priceCents,
      currency: currency.trim() ? currency.trim().toUpperCase() : "MAD",
      active,
      allow_quantity: allowQuantity,
      tax_rate_bps: Math.max(0, Math.floor(Number(taxRateBps) || 0)),
      tax_label: taxLabel.trim() ? taxLabel.trim() : "TVA",
      display_order: Math.floor(Number(displayOrder) || 0),
      deliverables,
    };

    setSaving(true);
    try {
      if (offer?.id) {
        await updateAdminVisibilityOffer(undefined, offer.id, payload);
      } else {
        await createAdminVisibilityOffer(undefined, payload);
      }
      toast({ title: "Enregistré", description: "Offre mise à jour." });
      onSaved();
      onClose();
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {offer ? "Modifier l’offre" : "Nouvelle offre"}
          </DialogTitle>
          <DialogDescription>
            Gérez les offres Visibilité (Menu Digital, packs, options, média
            vidéo).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto pe-1">
          <div className="space-y-2 md:col-span-2">
            <Label>Titre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-20"
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={String(type)}
              onValueChange={(v) => setType(v as AdminVisibilityOfferType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="menu_digital">Menu Digital</SelectItem>
                <SelectItem value="media_video">Média vidéo</SelectItem>
                <SelectItem value="pack">Pack</SelectItem>
                <SelectItem value="option">Option</SelectItem>
                <SelectItem value="article_sponsorise">
                  Article sponsorisé
                </SelectItem>
                <SelectItem value="newsletter">Newsletter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Durée (jours)</Label>
            <Input
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              placeholder="Ex: 30, 365"
            />
          </div>

          <div className="space-y-2">
            <Label>Prix (MAD)</Label>
            <Input
              value={priceMad}
              onChange={(e) => setPriceMad(e.target.value)}
              placeholder="Ex: 200"
            />
          </div>

          <div className="space-y-2">
            <Label>Devise</Label>
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="MAD"
            />
          </div>

          <div className="space-y-2">
            <Label>Ordre d’affichage</Label>
            <Input
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label>TVA (bps)</Label>
            <Input
              value={taxRateBps}
              onChange={(e) => setTaxRateBps(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label>Label taxe</Label>
            <Input
              value={taxLabel}
              onChange={(e) => setTaxLabel(e.target.value)}
              placeholder="TVA"
            />
          </div>

          <div className="space-y-2">
            <Label>Options</Label>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Active
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowQuantity}
                  onChange={(e) => setAllowQuantity(e.target.checked)}
                />
                Quantité modifiable
              </label>
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Deliverables (1 par ligne)</Label>
            <Textarea
              value={deliverablesText}
              onChange={(e) => setDeliverablesText(e.target.value)}
              className="min-h-28"
              placeholder="Ex:\nMenu via QR\nLien partageable\nSupport…"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function defaultWorkflowSteps(deliverables: string[]): string[] {
  const cleaned = deliverables
    .map((d) => String(d ?? "").trim())
    .filter(Boolean);
  if (cleaned.length) return cleaned;
  return [
    "Rendez-vous pris",
    "Tournage effectué",
    "Montage en cours",
    "Voix off",
    "Validation",
    "Sous-titrage",
    "Publication",
    "Diffusion",
  ];
}

function getWorkflowCurrentStep(meta: unknown): number {
  if (!isRecord(meta)) return 1;
  const wf = (meta.video_workflow ?? meta.media_video_workflow) as unknown;
  if (!isRecord(wf)) return 1;
  const step = (wf.current_step ?? wf.step) as unknown;
  if (typeof step === "number" && Number.isFinite(step) && step >= 1)
    return Math.floor(step);
  if (typeof step === "string" && step.trim()) {
    const n = Number(step);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }
  return 1;
}

function setWorkflowCurrentStep(
  meta: unknown,
  step: number,
): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(meta) ? { ...meta } : {};
  const existing = next.video_workflow;
  const wf = isRecord(existing) ? { ...existing } : {};

  wf.current_step = Math.max(1, Math.min(99, Math.floor(step)));
  wf.updated_at = new Date().toISOString();

  next.video_workflow = wf;
  return next;
}

type OrderDialogProps = {
  order: AdminVisibilityOrder;
  open: boolean;
  onClose: () => void;
  onOrderUpdated: (next: AdminVisibilityOrder) => void;
};

function OrderDialog({
  order,
  open,
  onClose,
  onOrderUpdated,
}: OrderDialogProps) {
  const { toast } = useToast();
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [status, setStatus] = useState(order.status);

  useEffect(() => {
    if (!open) return;
    setStatus(order.status);
  }, [open, order.status]);

  const updateStatus = async (next: string) => {
    setStatus(next);
    setUpdatingStatus(true);
    try {
      const res = await updateAdminVisibilityOrderStatus(undefined, order.id, {
        status: next,
      });
      onOrderUpdated(res.order);
      toast({
        title: "Statut mis à jour",
        description: `Commande ${order.id.slice(0, 8)} → ${next}`,
      });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const updateMediaVideoStep = async (
    item: AdminVisibilityOrderItem,
    nextStep: number,
    maxStep: number,
  ) => {
    const nextMeta = setWorkflowCurrentStep(item.meta, nextStep);

    try {
      await updateAdminVisibilityOrderItemMeta(undefined, {
        orderId: order.id,
        itemId: item.id,
        meta: nextMeta,
      });

      const nextItems = order.items.map((it) =>
        it.id === item.id ? { ...it, meta: nextMeta } : it,
      );
      onOrderUpdated({ ...order, items: nextItems });

      // Nice default: keep order delivery status aligned with progression.
      if (nextStep > 1 && order.status === "pending") {
        void updateStatus("in_progress");
      }
      if (nextStep >= maxStep && order.status !== "delivered") {
        void updateStatus("delivered");
      }

      toast({
        title: "Workflow mis à jour",
        description: `Étape ${nextStep}/${maxStep}`,
      });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const estLabel = order.establishments?.name
    ? `${order.establishments.name}`
    : order.establishment_id.slice(0, 8);
  const createdAt = order.created_at ? formatLocalYmdHm(order.created_at) : "";
  const paidAt = order.paid_at ? formatLocalYmdHm(order.paid_at) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>Commande visibilité · {order.id.slice(0, 8)}</span>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={paymentStatusBadge(order.payment_status).cls}
              >
                {paymentStatusBadge(order.payment_status).label}
              </Badge>
              <Badge
                variant="outline"
                className={orderStatusBadge(order.status).cls}
              >
                {orderStatusBadge(order.status).label}
              </Badge>
            </div>
          </DialogTitle>
          <DialogDescription>
            {estLabel}
            {order.establishments?.city
              ? ` · ${order.establishments.city}`
              : ""}{" "}
            · {createdAt}
            {paidAt ? ` · Payé: ${paidAt}` : ""}
            {order.finance_invoice?.invoice_number
              ? ` · Facture: ${order.finance_invoice.invoice_number}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-slate-700">
              Statut livraison :
            </div>
            <Select value={status} onValueChange={(v) => void updateStatus(v)}>
              <SelectTrigger className="w-56" disabled={updatingStatus}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="in_progress">En cours</SelectItem>
                <SelectItem value="delivered">Livré</SelectItem>
                <SelectItem value="cancelled">Annulé</SelectItem>
                <SelectItem value="refunded">Remboursé</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-sm font-semibold mb-2">Articles</div>
            <div className="space-y-3">
              {order.items.map((it) => {
                const badge = offerTypeBadge(it.type);
                const isVideo = String(it.type).toLowerCase() === "media_video";
                const steps = defaultWorkflowSteps(
                  Array.isArray(it.deliverables) ? it.deliverables : [],
                );
                const maxStep = steps.length;
                const currentStep = Math.min(
                  Math.max(getWorkflowCurrentStep(it.meta), 1),
                  maxStep,
                );
                const progress = Math.round((currentStep / maxStep) * 100);

                return (
                  <div
                    key={it.id}
                    className="rounded-md border border-slate-200 p-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {it.title}
                        </div>
                        <div className="text-xs text-slate-600">
                          {formatMoney(it.total_price_cents, it.currency)} ·{" "}
                          {it.quantity} ×{" "}
                          {formatMoney(it.unit_price_cents, it.currency)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={badge.cls}>
                          {badge.label}
                        </Badge>
                        {isVideo ? (
                          <Badge variant="secondary" className="gap-1">
                            <Video className="h-3 w-3" />
                            Workflow
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    {isVideo ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <div>
                            Étape:{" "}
                            <span className="font-semibold">{currentStep}</span>
                            /{maxStep}
                          </div>
                          <div className="tabular-nums">{progress}%</div>
                        </div>
                        <Progress value={progress} />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {steps.map((label, idx) => {
                            const stepIndex = idx + 1;
                            const done = stepIndex <= currentStep;
                            return (
                              <button
                                key={`${it.id}-step-${stepIndex}`}
                                className={
                                  "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-start text-sm transition " +
                                  (done
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                                }
                                onClick={() =>
                                  void updateMediaVideoStep(
                                    it,
                                    stepIndex,
                                    maxStep,
                                  )
                                }
                              >
                                <span className="min-w-0 truncate">
                                  {stepIndex}. {label}
                                </span>
                                {done ? (
                                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-200">
              <div className="text-sm font-semibold">Total</div>
              <div className="text-lg font-extrabold tabular-nums">
                {formatMoney(order.total_cents, order.currency)}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type CreateQuoteDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (quote: AdminMediaQuote) => void;
};

function dateInputToIsoEndOfDay(dateYmd: string): string | null {
  const v = String(dateYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return `${v}T23:59:59.999Z`;
}

// ---------------------------------------------------------------------------
// Edit Pro Profile Dialog
// ---------------------------------------------------------------------------

type EditProProfileDialogProps = {
  open: boolean;
  profile: AdminProProfile | null;
  onClose: () => void;
  onSaved: (updated: AdminProProfile) => void;
};

function EditProProfileDialog({
  open,
  profile,
  onClose,
  onSaved,
}: EditProProfileDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Maroc");
  const [ice, setIce] = useState("");
  const [rc, setRc] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !profile) return;
    setCompanyName(profile.company_name ?? "");
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setContactName(profile.contact_name ?? "");
    setEmail(profile.email ?? "");
    setPhone(profile.phone ?? "");
    setAddress(profile.address ?? "");
    setPostalCode(profile.postal_code ?? "");
    setCity(profile.city ?? "");
    setCountry(profile.country ?? "Maroc");
    setIce(profile.ice ?? "");
    setRc(profile.rc ?? "");
    setNotes(profile.notes ?? "");
  }, [open, profile]);

  const handleSave = async () => {
    if (!profile || saving) return;

    setSaving(true);
    try {
      const input: AdminProProfileInput = {
        company_name: companyName.trim() || null,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        contact_name: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        postal_code: postalCode.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        ice: ice.trim() || null,
        rc: rc.trim() || null,
        notes: notes.trim() || null,
      };

      await updateAdminProProfile(undefined, profile.user_id, input);

      // Fetch updated profile
      const { profile: updated } = await getAdminProProfile(undefined, profile.user_id);

      toast({ title: "Profil Pro mis à jour" });
      onSaved(updated);
      onClose();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le profil Pro</DialogTitle>
          <DialogDescription>
            Informations de l'entreprise pour la facturation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Raison sociale / Nom entreprise</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ex: SARL Mon Entreprise"
              />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@entreprise.ma"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Prénom du contact</Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Prénom"
              />
            </div>

            <div className="space-y-2">
              <Label>Nom du contact</Label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Nom"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nom du contact (ancien champ)</Label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Nom complet"
              />
              <p className="text-xs text-slate-500">Utilisé si prénom/nom non renseignés</p>
            </div>

            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+212 6XX XXX XXX"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Adresse</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Adresse complète"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Code postal</Label>
              <Input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="20000"
              />
            </div>

            <div className="space-y-2">
              <Label>Ville</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Casablanca"
              />
            </div>

            <div className="space-y-2">
              <Label>Pays</Label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Maroc"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>ICE</Label>
              <Input
                value={ice}
                onChange={(e) => setIce(e.target.value)}
                placeholder="Identifiant Commun de l'Entreprise"
              />
            </div>

            <div className="space-y-2">
              <Label>RC</Label>
              <Input
                value={rc}
                onChange={(e) => setRc(e.target.value)}
                placeholder="Registre du Commerce"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes internes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes visibles uniquement par l'équipe"
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Pro Info Card (displayed when a Pro is selected)
// ---------------------------------------------------------------------------

function ProInfoCard({
  pro,
  onEdit,
  onClear,
}: {
  pro: AdminProProfile;
  onEdit: () => void;
  onClear: () => void;
}) {
  const displayName =
    pro.company_name ||
    (pro.first_name && pro.last_name
      ? `${pro.first_name} ${pro.last_name}`
      : pro.contact_name) ||
    pro.email ||
    pro.user_id;

  const contactDisplay =
    pro.first_name || pro.last_name
      ? `${pro.first_name ?? ""} ${pro.last_name ?? ""}`.trim()
      : pro.contact_name;

  const hasAddress = pro.address || pro.postal_code || pro.city || pro.country;
  const hasLegalInfo = pro.ice || pro.rc;

  // Check if profile is incomplete (missing key info for invoicing)
  const isIncomplete = !pro.company_name && !pro.ice;

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{displayName}</div>
          {contactDisplay && contactDisplay !== displayName ? (
            <div className="text-sm text-slate-600">Contact: {contactDisplay}</div>
          ) : null}
          {pro.email ? (
            <div className="text-sm text-slate-600">{pro.email}</div>
          ) : null}
          {pro.phone ? (
            <div className="text-sm text-slate-600">{pro.phone}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            title="Modifier les informations"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            Changer
          </Button>
        </div>
      </div>

      {hasAddress ? (
        <div className="text-sm text-slate-600 border-t pt-2">
          <div className="font-medium text-slate-700 mb-1">Adresse</div>
          {pro.address ? <div>{pro.address}</div> : null}
          <div>
            {[pro.postal_code, pro.city, pro.country].filter(Boolean).join(", ")}
          </div>
        </div>
      ) : null}

      {hasLegalInfo ? (
        <div className="text-sm text-slate-600 border-t pt-2">
          <div className="font-medium text-slate-700 mb-1">Infos légales</div>
          {pro.ice ? <div>ICE: {pro.ice}</div> : null}
          {pro.rc ? <div>RC: {pro.rc}</div> : null}
        </div>
      ) : null}

      {isIncomplete ? (
        <div className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 border border-amber-200">
          ⚠️ Profil incomplet — Cliquez sur le crayon pour compléter les informations
        </div>
      ) : null}
    </div>
  );
}

function CreateQuoteDialog({
  open,
  onClose,
  onCreated,
}: CreateQuoteDialogProps) {
  const { toast } = useToast();

  // Radix SelectItem value cannot be an empty string. We use a sentinel for “no establishment”.
  const NO_ESTABLISHMENT = "__none__";

  const [saving, setSaving] = useState(false);

  const [proQuery, setProQuery] = useState("");
  const [prosLoading, setProsLoading] = useState(false);
  const [proResults, setProResults] = useState<AdminProProfile[]>([]);
  const [selectedPro, setSelectedPro] = useState<AdminProProfile | null>(null);
  const [editProDialogOpen, setEditProDialogOpen] = useState(false);

  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<
    string | null
  >(null);

  const [validUntilYmd, setValidUntilYmd] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank_transfer">(
    "bank_transfer",
  );

  const [notes, setNotes] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryEstimate, setDeliveryEstimate] = useState("");

  useEffect(() => {
    if (!open) return;

    setSaving(false);

    setProQuery("");
    setProsLoading(false);
    setProResults([]);
    setSelectedPro(null);
    setSelectedEstablishmentId(null);

    setValidUntilYmd("");
    setPaymentMethod("bank_transfer");
    setNotes("");
    setPaymentTerms("");
    setDeliveryEstimate("");
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const q = proQuery.trim();

    // Ne pas afficher toute la liste par défaut: on ne recherche que si l'utilisateur tape quelque chose.
    if (!q) {
      setProsLoading(false);
      setProResults([]);
      return;
    }

    const handle = window.setTimeout(() => {
      setProsLoading(true);
      listAdminProProfiles(undefined, { q, limit: 20 })
        .then((res) => setProResults(res.items ?? []))
        .catch((e) => {
          const msg =
            e instanceof AdminApiError
              ? e.message
              : e instanceof Error
                ? e.message
                : "Erreur";
          toast({ title: "Erreur", description: msg, variant: "destructive" });
          setProResults([]);
        })
        .finally(() => setProsLoading(false));
    }, 250);

    return () => window.clearTimeout(handle);
  }, [proQuery, open, toast]);

  const hasProQuery = !!proQuery.trim();
  const showNoResults = hasProQuery && !prosLoading && proResults.length === 0;

  useEffect(() => {
    if (!open) return;

    if (!selectedPro) {
      setSelectedEstablishmentId(null);
      return;
    }

    const type = String(selectedPro.client_type ?? "").toUpperCase();
    const preferred = selectedPro.establishments?.[0]?.id ?? "";

    if (type === "A" && preferred && selectedEstablishmentId == null) {
      setSelectedEstablishmentId(preferred);
    }

    if (type !== "A") {
      setSelectedEstablishmentId(NO_ESTABLISHMENT);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPro?.user_id, open]);

  const proBadgeLabel = (pro: AdminProProfile): string => {
    const t = String(pro.client_type ?? "").toUpperCase();
    if (t === "A") return "Type A (avec établissement)";
    if (t === "B") return "Type B (sans établissement)";
    return t || "Pro";
  };

  const createQuote = async () => {
    if (!selectedPro || saving) return;

    setSaving(true);
    try {
      const validUntil = validUntilYmd
        ? dateInputToIsoEndOfDay(validUntilYmd)
        : null;

      const establishmentId =
        selectedEstablishmentId && selectedEstablishmentId !== NO_ESTABLISHMENT
          ? selectedEstablishmentId.trim()
          : null;

      const res = await createAdminMediaQuote(undefined, {
        pro_user_id: selectedPro.user_id,
        establishment_id: establishmentId,
        valid_until: validUntil,
        payment_method: paymentMethod,
        notes: notes.trim() || null,
        payment_terms: paymentTerms.trim() || null,
        delivery_estimate: deliveryEstimate.trim() || null,
      });

      toast({ title: "Devis créé", description: res.quote.quote_number });
      onCreated(res.quote);
      onClose();
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const canSave = !saving && !!selectedPro;

  const selectedEstablishmentOptions = selectedPro?.establishments ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Créer un devis</DialogTitle>
          <DialogDescription>
            Le client est toujours un Pro (Type A ou B). Les établissements sont
            optionnels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Client (Pro)</Label>
              {selectedPro ? (
                <div className="space-y-2">
                  <ProInfoCard
                    pro={selectedPro}
                    onEdit={() => setEditProDialogOpen(true)}
                    onClear={() => {
                      setSelectedPro(null);
                      setProQuery("");
                      setProResults([]);
                      setSelectedEstablishmentId(null);
                    }}
                  />

                  <div className="space-y-2">
                    <Label>Établissement (optionnel)</Label>
                    <Select
                      value={selectedEstablishmentId ?? undefined}
                      onValueChange={setSelectedEstablishmentId}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            selectedEstablishmentOptions.length
                              ? "Choisir…"
                              : "Aucun établissement"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value={NO_ESTABLISHMENT}>
                          Ignorer pour l'instant
                        </SelectItem>
                        {selectedEstablishmentOptions.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name ?? e.id}
                            {e.city ? ` (${e.city})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!selectedEstablishmentOptions.length ? (
                      <div className="text-xs text-slate-500">
                        Ce Pro n'a aucun établissement (Type B ou Type A sans
                        établissement).
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={proQuery}
                    onChange={(e) => setProQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        if (proResults.length) setSelectedPro(proResults[0]);
                      }
                    }}
                    placeholder="Rechercher (nom, email, ville, ID…)"
                  />

                  {prosLoading ? (
                    <div className="text-sm text-slate-600 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Recherche…
                    </div>
                  ) : null}

                  {!hasProQuery ? (
                    <div className="text-xs text-slate-500">
                      Commencez à taper pour afficher des résultats.
                    </div>
                  ) : null}

                  {showNoResults ? (
                    <div className="text-xs text-slate-500">
                      Aucun Pro ne correspond à cette recherche.
                    </div>
                  ) : null}

                  {!prosLoading && proResults.length ? (
                    <div className="max-h-56 overflow-y-auto rounded-md border">
                      {proResults.map((p) => (
                        <div
                          key={p.user_id}
                          role="button"
                          tabIndex={0}
                          className="w-full cursor-pointer select-none text-start px-3 py-2 hover:bg-slate-50 border-b last:border-b-0 focus:outline-none focus:bg-slate-50"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedPro(p);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedPro(p);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold truncate">
                                {p.company_name ||
                                  p.contact_name ||
                                  p.email ||
                                  p.user_id}
                              </div>
                              <div className="text-xs text-slate-600 mt-1 truncate">
                                {proBadgeLabel(p)}
                                {p.city ? ` · ${p.city}` : ""}
                                {p.email ? ` · ${p.email}` : ""}
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {String(p.client_type ?? "").toUpperCase() ||
                                "Pro"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="text-xs text-slate-500">
                    Besoin d’ajouter un nouveau client ? Créez un nouveau Pro
                    via le flux Pro (pas de client séparé).
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Validité (optionnel)</Label>
                <Input
                  type="date"
                  value={validUntilYmd}
                  onChange={(e) => setValidUntilYmd(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Mode de paiement</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">Carte bancaire (lien)</SelectItem>
                    <SelectItem value="bank_transfer">
                      Virement bancaire
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Conditions de paiement</Label>
              <Textarea
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="ex: “50% à la commande…”"
              />
            </div>
            <div className="space-y-2">
              <Label>Délai de livraison</Label>
              <Textarea
                value={deliveryEstimate}
                onChange={(e) => setDeliveryEstimate(e.target.value)}
                placeholder="ex: 7 jours ouvrés"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={() => void createQuote()}
              disabled={!canSave}
              className="gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Créer le devis
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Dialog pour éditer le profil Pro */}
      <EditProProfileDialog
        open={editProDialogOpen}
        profile={selectedPro}
        onClose={() => setEditProDialogOpen(false)}
        onSaved={(updated) => setSelectedPro(updated)}
      />
    </Dialog>
  );
}

type QuoteDialogProps = {
  open: boolean;
  quoteId: string;
  offers: AdminVisibilityOffer[];
  onClose: () => void;
  onQuoteUpdated: (quote: AdminMediaQuote) => void;
  onInvoiceCreated: (invoice: AdminMediaInvoice) => void;
};

function QuoteDialog({
  open,
  quoteId,
  offers,
  onClose,
  onQuoteUpdated,
  onInvoiceCreated,
}: QuoteDialogProps) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<AdminMediaQuote | null>(null);

  const [offerToAddId, setOfferToAddId] = useState<string>("");
  const [offerQty, setOfferQty] = useState("1");

  const [publicLink, setPublicLink] = useState<string | null>(null);

  const [emailTo, setEmailTo] = useState("");
  const [emailLang, setEmailLang] = useState<"fr" | "en">("fr");

  const [editValidUntilYmd, setEditValidUntilYmd] = useState<string>("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<
    "card" | "bank_transfer"
  >("bank_transfer");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editPaymentTerms, setEditPaymentTerms] = useState<string>("");
  const [editDeliveryEstimate, setEditDeliveryEstimate] = useState<string>("");

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminMediaQuote(undefined, quoteId);
      setQuote(res.quote);
      onQuoteUpdated(res.quote);

      const toEmail = (res.quote as any).pro_profiles?.email ?? "";
      setEmailTo(typeof toEmail === "string" ? toEmail : "");

      const validUntil = res.quote.valid_until
        ? String(res.quote.valid_until).slice(0, 10)
        : "";
      setEditValidUntilYmd(validUntil);

      const pm = String((res.quote as any).payment_method ?? "")
        .trim()
        .toLowerCase();
      setEditPaymentMethod(pm === "card" ? "card" : "bank_transfer");

      setEditNotes(res.quote.notes ?? "");
      setEditPaymentTerms(res.quote.payment_terms ?? "");
      setEditDeliveryEstimate(res.quote.delivery_estimate ?? "");
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      setError(msg);
      setQuote(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPublicLink(null);
    setOfferToAddId("");
    setOfferQty("1");
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quoteId]);

  const isDraft = String(quote?.status ?? "").toLowerCase() === "draft";

  const allowedOffers = useMemo(() => {
    return offers
      .filter((o) => o.deleted_at == null)
      .filter((o) => o.active)
      .filter((o) => o.is_quotable !== false)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  }, [offers]);

  const addItem = async () => {
    if (!quote) return;
    if (!offerToAddId) return;

    const qty = Math.max(1, Math.floor(Number(offerQty || "1")));

    try {
      const res = await addAdminMediaQuoteItem(undefined, quote.id, {
        catalog_item_id: offerToAddId,
        quantity: qty,
      });
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
      toast({ title: "Ligne ajoutée" });
      setOfferQty("1");
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const updateQty = async (item: AdminMediaQuoteItem, nextQty: number) => {
    if (!quote) return;
    try {
      const res = await updateAdminMediaQuoteItem(
        undefined,
        quote.id,
        item.id,
        { quantity: nextQty },
      );
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const deleteItem = async (item: AdminMediaQuoteItem) => {
    if (!quote) return;
    const ok = window.confirm(`Supprimer la ligne "${item.name_snapshot}" ?`);
    if (!ok) return;

    try {
      const res = await deleteAdminMediaQuoteItem(undefined, quote.id, item.id);
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
      toast({ title: "Ligne supprimée" });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const saveMeta = async () => {
    if (!quote) return;

    try {
      const validUntil = editValidUntilYmd
        ? dateInputToIsoEndOfDay(editValidUntilYmd)
        : null;
      const res = await updateAdminMediaQuote(undefined, quote.id, {
        valid_until: validUntil,
        payment_method: editPaymentMethod,
        notes: editNotes.trim() || null,
        payment_terms: editPaymentTerms.trim() || null,
        delivery_estimate: editDeliveryEstimate.trim() || null,
      });
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
      toast({ title: "Devis mis à jour" });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const generateLink = async () => {
    if (!quote) return;

    try {
      const res = await createAdminMediaQuotePublicLink(undefined, quote.id);
      setPublicLink(res.public_link);
      await navigator.clipboard.writeText(res.public_link).catch(() => null);
      toast({
        title: "Lien public créé",
        description: "Lien copié dans le presse-papier (si autorisé).",
      });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const sendEmail = async () => {
    if (!quote) return;

    try {
      const res = await sendAdminMediaQuoteEmail(undefined, quote.id, {
        lang: emailLang,
        to_email: emailTo.trim() || undefined,
      });
      setPublicLink(res.public_link);
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
      toast({
        title: "Email envoyé",
        description: `email_id: ${res.email_id}`,
      });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const markAccepted = async () => {
    if (!quote) return;
    try {
      const res = await markAdminMediaQuoteAccepted(undefined, quote.id);
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
      toast({ title: "Devis accepté" });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const markRejected = async () => {
    if (!quote) return;
    try {
      const res = await markAdminMediaQuoteRejected(undefined, quote.id);
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
      toast({ title: "Devis refusé" });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const convertToInvoice = async () => {
    if (!quote) return;
    try {
      const res = await convertAdminMediaQuoteToInvoice(undefined, quote.id, {
        payment_method: editPaymentMethod,
      });
      toast({
        title: "Facture créée",
        description: res.invoice.invoice_number,
      });
      onInvoiceCreated(res.invoice);
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const clientLabel = (() => {
    if (!quote) return "";
    return (
      quote.pro_profiles?.company_name ||
      quote.pro_profiles?.contact_name ||
      quote.establishments?.name ||
      (quote.pro_user_id
        ? `Pro ${String(quote.pro_user_id).slice(0, 8)}`
        : "Pro")
    );
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <div className="min-w-0 truncate">
              Devis {quote?.quote_number ?? ""}
            </div>
            <div className="flex items-center gap-2">
              {quote ? (
                <Badge variant="outline">
                  {String(quote.status ?? "").toUpperCase()}
                </Badge>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refresh()}
                disabled={loading}
              >
                Rafraîchir
              </Button>
            </div>
          </DialogTitle>
          <DialogDescription>
            {clientLabel ? (
              <span className="font-semibold">{clientLabel}</span>
            ) : null}
            {quote?.issued_at ? (
              <span className="ms-2">
                · {formatLocalYmdHm(quote.issued_at)}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>{error}</div>
            </CardContent>
          </Card>
        ) : null}

        {loading || !quote ? (
          <div className="text-sm text-slate-600 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Validité</Label>
                <Input
                  type="date"
                  value={editValidUntilYmd}
                  onChange={(e) => setEditValidUntilYmd(e.target.value)}
                  disabled={!isDraft}
                />
              </div>
              <div className="space-y-2">
                <Label>Monnaie</Label>
                <Input value={quote.currency} disabled />
              </div>

              <div className="space-y-2">
                <Label>Mode de paiement</Label>
                <Select
                  value={editPaymentMethod}
                  onValueChange={(v) => setEditPaymentMethod(v as any)}
                  disabled={!isDraft}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">Carte bancaire (lien)</SelectItem>
                    <SelectItem value="bank_transfer">
                      Virement bancaire
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Conditions de paiement</Label>
                <Textarea
                  value={editPaymentTerms}
                  onChange={(e) => setEditPaymentTerms(e.target.value)}
                  disabled={!isDraft}
                />
              </div>
              <div className="space-y-2">
                <Label>Délai de livraison</Label>
                <Textarea
                  value={editDeliveryEstimate}
                  onChange={(e) => setEditDeliveryEstimate(e.target.value)}
                  disabled={!isDraft}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  disabled={!isDraft}
                />
              </div>
              <div className="md:col-span-2 flex items-center justify-end">
                <Button
                  variant="outline"
                  onClick={() => void saveMeta()}
                  disabled={!isDraft}
                >
                  Enregistrer
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">Lignes</div>
                  <div className="text-sm text-slate-500">
                    {(quote.items ?? []).length} ligne(s)
                  </div>
                </div>

                {(quote.items ?? []).length ? (
                  <div className="space-y-2">
                    {(quote.items ?? []).map((it) => (
                      <div
                        key={it.id}
                        className="flex items-start justify-between gap-3 rounded-md border p-3"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {it.name_snapshot}
                          </div>
                          {it.description_snapshot ? (
                            <div className="text-xs text-slate-600 mt-1">
                              {it.description_snapshot}
                            </div>
                          ) : null}
                          <div className="text-xs text-slate-500 mt-2">
                            {formatMoneyAmount(
                              it.unit_price_snapshot,
                              quote.currency,
                            )}{" "}
                            × {it.quantity} · TVA {it.tax_rate_snapshot}%
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="font-semibold tabular-nums">
                            {formatMoneyAmount(it.line_total, quote.currency)}
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              className="w-20"
                              value={String(it.quantity)}
                              disabled={!isDraft}
                              onChange={(e) => {
                                const next = Math.max(
                                  1,
                                  Math.floor(Number(e.target.value || "1")),
                                );
                                void updateQty(it, next);
                              }}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-700"
                              onClick={() => void deleteItem(it)}
                              disabled={!isDraft}
                            >
                              Suppr.
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Aucune ligne.</div>
                )}

                <div className="border-t pt-3 mt-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Ajouter depuis le catalogue</Label>
                      <Select
                        value={offerToAddId}
                        onValueChange={setOfferToAddId}
                        disabled={!isDraft}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir une offre…" />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedOffers.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Quantité</Label>
                      <Input
                        value={offerQty}
                        onChange={(e) => setOfferQty(e.target.value)}
                        disabled={!isDraft}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end mt-3">
                    <Button
                      onClick={() => void addItem()}
                      disabled={!isDraft || !offerToAddId}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Ajouter
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 mt-3 border-t">
                  <div className="text-sm text-slate-600">
                    Sous-total:{" "}
                    <span className="font-semibold">
                      {formatMoneyAmount(quote.subtotal_amount, quote.currency)}
                    </span>{" "}
                    · TVA:{" "}
                    <span className="font-semibold">
                      {formatMoneyAmount(quote.tax_amount, quote.currency)}
                    </span>
                  </div>
                  <div className="text-lg font-extrabold tabular-nums">
                    {formatMoneyAmount(quote.total_amount, quote.currency)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="font-semibold">Actions</div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Lien public</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={publicLink ?? ""}
                        readOnly
                        placeholder="(générer un lien)"
                      />
                      <Button
                        variant="outline"
                        onClick={() => void generateLink()}
                      >
                        Générer
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          quote
                            ? void downloadAdminPdf(
                                `/api/admin/media/quotes/${encodeURIComponent(quote.id)}/pdf`,
                                `devis-${quote.quote_number || quote.id}.pdf`,
                              ).catch((e) =>
                                toast({
                                  title: "Erreur",
                                  description:
                                    e instanceof Error
                                      ? e.message
                                      : "Impossible de télécharger le PDF",
                                  variant: "destructive",
                                }),
                              )
                            : null
                        }
                      >
                        PDF
                      </Button>
                    </div>
                    <div className="text-xs text-slate-500">
                      Ce lien permettra au client de consulter/valider le devis.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Email</Label>
                    <div className="grid gap-2 md:grid-cols-3">
                      <Select
                        value={emailLang}
                        onValueChange={(v) =>
                          setEmailLang(v === "en" ? "en" : "fr")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fr">FR</SelectItem>
                          <SelectItem value="en">EN</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="md:col-span-2"
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                        placeholder="email@client.com"
                      />
                    </div>
                    <div className="flex items-center justify-end">
                      <Button
                        onClick={() => void sendEmail()}
                        disabled={!emailTo.trim()}
                      >
                        Envoyer le devis
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void markAccepted()}
                    >
                      Marquer accepté
                    </Button>
                    <Button
                      variant="outline"
                      className="text-red-700"
                      onClick={() => void markRejected()}
                    >
                      Marquer refusé
                    </Button>
                  </div>

                  <div className="flex items-center justify-end">
                    <Button
                      onClick={() => void convertToInvoice()}
                      disabled={
                        String(quote.status ?? "").toLowerCase() !== "accepted"
                      }
                    >
                      Convertir en facture
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type InvoiceDialogProps = {
  open: boolean;
  invoiceId: string;
  onClose: () => void;
  onInvoiceUpdated: (invoice: AdminMediaInvoice) => void;
};

function InvoiceDialog({
  open,
  invoiceId,
  onClose,
  onInvoiceUpdated,
}: InvoiceDialogProps) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<AdminMediaInvoice | null>(null);

  const [publicLink, setPublicLink] = useState<string | null>(null);

  const [emailTo, setEmailTo] = useState("");
  const [emailLang, setEmailLang] = useState<"fr" | "en">("fr");

  const [paidAmount, setPaidAmount] = useState("");
  const [paidMethod, setPaidMethod] = useState<
    "card" | "bank_transfer" | "cash" | "other"
  >("bank_transfer");
  const [paidRef, setPaidRef] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getAdminMediaInvoice(undefined, invoiceId);
      setInvoice(res.invoice);
      onInvoiceUpdated(res.invoice);
      const toEmail = (res.invoice as any).pro_profiles?.email ?? "";
      setEmailTo(typeof toEmail === "string" ? toEmail : "");
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      setError(msg);
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPublicLink(null);
    setPaidAmount("");
    setPaidRef("");
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  const generateLink = async () => {
    if (!invoice) return;

    try {
      const res = await createAdminMediaInvoicePublicLink(
        undefined,
        invoice.id,
      );
      setPublicLink(res.public_link);
      await navigator.clipboard.writeText(res.public_link).catch(() => null);
      toast({
        title: "Lien public créé",
        description: "Lien copié dans le presse-papier (si autorisé).",
      });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const sendEmail = async () => {
    if (!invoice) return;

    try {
      const res = await sendAdminMediaInvoiceEmail(undefined, invoice.id, {
        lang: emailLang,
        to_email: emailTo.trim() || undefined,
      });
      toast({
        title: "Email envoyé",
        description: `email_id: ${res.email_id}`,
      });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const markPaid = async () => {
    if (!invoice) return;

    const amount = Number(paidAmount || "0");
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "Erreur",
        description: "Montant invalide",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await markAdminMediaInvoicePaid(undefined, invoice.id, {
        amount,
        method: paidMethod,
        reference: paidRef.trim() || undefined,
      });
      setInvoice(res.invoice);
      onInvoiceUpdated(res.invoice);
      toast({ title: "Paiement enregistré" });
      setPaidAmount("");
      setPaidRef("");
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const clientLabel = (() => {
    if (!invoice) return "";
    return (
      invoice.pro_profiles?.company_name ||
      invoice.pro_profiles?.contact_name ||
      invoice.establishments?.name ||
      (invoice.pro_user_id
        ? `Pro ${String(invoice.pro_user_id).slice(0, 8)}`
        : "Pro")
    );
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Facture {invoice?.invoice_number ?? ""}</DialogTitle>
          <DialogDescription>
            {clientLabel ? (
              <span className="font-semibold">{clientLabel}</span>
            ) : null}
            {invoice?.issued_at ? (
              <span className="ms-2">
                · {formatLocalYmdHm(invoice.issued_at)}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>{error}</div>
            </CardContent>
          </Card>
        ) : null}

        {loading || !invoice ? (
          <div className="text-sm text-slate-600 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {String(invoice.status ?? "").toUpperCase()}
              </Badge>
              <div className="text-sm text-slate-600">
                Total:{" "}
                <span className="font-semibold">
                  {formatMoneyAmount(invoice.total_amount, invoice.currency)}
                </span>{" "}
                · Payé:{" "}
                <span className="font-semibold">
                  {formatMoneyAmount(invoice.paid_amount, invoice.currency)}
                </span>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="font-semibold">Lignes</div>
                {(invoice.items ?? []).length ? (
                  <div className="space-y-2">
                    {(invoice.items ?? []).map((it) => (
                      <div
                        key={it.id}
                        className="flex items-start justify-between gap-3 rounded-md border p-3"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {it.name_snapshot}
                          </div>
                          {it.description_snapshot ? (
                            <div className="text-xs text-slate-600 mt-1">
                              {it.description_snapshot}
                            </div>
                          ) : null}
                          <div className="text-xs text-slate-500 mt-2">
                            {formatMoneyAmount(
                              it.unit_price_snapshot,
                              invoice.currency,
                            )}{" "}
                            × {it.quantity} · TVA {it.tax_rate_snapshot}%
                          </div>
                        </div>
                        <div className="font-semibold tabular-nums">
                          {formatMoneyAmount(it.line_total, invoice.currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Aucune ligne.</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="font-semibold">Actions</div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Lien public</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={publicLink ?? ""}
                        readOnly
                        placeholder="(générer un lien)"
                      />
                      <Button
                        variant="outline"
                        onClick={() => void generateLink()}
                      >
                        Générer
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          invoice
                            ? void downloadAdminPdf(
                                `/api/admin/media/invoices/${encodeURIComponent(invoice.id)}/pdf`,
                                `facture-${invoice.invoice_number || invoice.id}.pdf`,
                              ).catch((e) =>
                                toast({
                                  title: "Erreur",
                                  description:
                                    e instanceof Error
                                      ? e.message
                                      : "Impossible de télécharger le PDF",
                                  variant: "destructive",
                                }),
                              )
                            : null
                        }
                      >
                        PDF
                      </Button>
                    </div>
                    <div className="text-xs text-slate-500">
                      Ce lien permettra au client de consulter la facture et
                      payer en ligne.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Email</Label>
                    <div className="grid gap-2 md:grid-cols-3">
                      <Select
                        value={emailLang}
                        onValueChange={(v) =>
                          setEmailLang(v === "en" ? "en" : "fr")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fr">FR</SelectItem>
                          <SelectItem value="en">EN</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="md:col-span-2"
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                        placeholder="email@client.com"
                      />
                    </div>
                    <div className="flex items-center justify-end">
                      <Button
                        onClick={() => void sendEmail()}
                        disabled={!emailTo.trim()}
                      >
                        Envoyer la facture
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Enregistrer un paiement</Label>
                    <div className="grid gap-2 md:grid-cols-3">
                      <Input
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        placeholder="Montant"
                      />
                      <Select
                        value={paidMethod}
                        onValueChange={(v) =>
                          setPaidMethod((v as any) ?? "other")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bank_transfer">
                            Virement bancaire
                          </SelectItem>
                          <SelectItem value="card">Carte</SelectItem>
                          <SelectItem value="cash">Espèces</SelectItem>
                          <SelectItem value="other">Autre</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={paidRef}
                        onChange={(e) => setPaidRef(e.target.value)}
                        placeholder="Référence"
                      />
                    </div>
                    <div className="flex items-center justify-end">
                      <Button
                        onClick={() => void markPaid()}
                        disabled={!paidAmount.trim()}
                      >
                        Marquer payé
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AdminVisibilityPage() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Read tab from URL params - reacts to URL changes
  const urlTab = searchParams.get("tab");
  const [tab, setTab] = useState(() => {
    if (urlTab && ["offers", "orders", "quotes", "invoices"].includes(urlTab)) {
      return urlTab;
    }
    return "offers";
  });

  // Sync tab with URL when URL changes (e.g., navigation from notifications)
  useEffect(() => {
    if (urlTab && ["offers", "orders", "quotes", "invoices"].includes(urlTab)) {
      setTab(urlTab);
    }
  }, [urlTab]);

  // Offers
  const [offers, setOffers] = useState<AdminVisibilityOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState<string | null>(null);

  const [editingOffer, setEditingOffer] = useState<AdminVisibilityOffer | null>(
    null,
  );
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);

  // Orders
  const [orders, setOrders] = useState<AdminVisibilityOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [paymentFilter, setPaymentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  // Quotes
  const [quotes, setQuotes] = useState<AdminMediaQuote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [createQuoteOpen, setCreateQuoteOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);

  // Invoices
  const [invoices, setInvoices] = useState<AdminMediaInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );

  const selectedQuote = useMemo(
    () => quotes.find((q) => q.id === selectedQuoteId) ?? null,
    [quotes, selectedQuoteId],
  );
  const selectedInvoice = useMemo(
    () => invoices.find((inv) => inv.id === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId],
  );

  const loadOffers = async () => {
    setOffersLoading(true);
    setOffersError(null);

    try {
      const res = await listAdminVisibilityOffers(undefined);
      setOffers(res.offers ?? []);
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      setOffersError(msg);
      setOffers([]);
    } finally {
      setOffersLoading(false);
    }
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    setOrdersError(null);

    try {
      const res = await listAdminVisibilityOrders(undefined, {
        limit: 200,
        payment_status: paymentFilter === "all" ? undefined : paymentFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setOrders(res.orders ?? []);
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      setOrdersError(msg);
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadQuotes = async () => {
    setQuotesLoading(true);
    setQuotesError(null);

    try {
      const res = await listAdminMediaQuotes(undefined, { limit: 200 });
      setQuotes(res.quotes ?? []);
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      setQuotesError(msg);
      setQuotes([]);
    } finally {
      setQuotesLoading(false);
    }
  };

  const loadInvoices = async () => {
    setInvoicesLoading(true);
    setInvoicesError(null);

    try {
      const res = await listAdminMediaInvoices(undefined, { limit: 200 });
      setInvoices(res.invoices ?? []);
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      setInvoicesError(msg);
      setInvoices([]);
    } finally {
      setInvoicesLoading(false);
    }
  };

  useEffect(() => {
    void loadOffers();
    void loadQuotes();
    void loadInvoices();
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [paymentFilter, statusFilter]);

  const openCreateOffer = () => {
    setEditingOffer(null);
    setOfferDialogOpen(true);
  };

  const openEditOffer = (offer: AdminVisibilityOffer) => {
    setEditingOffer(offer);
    setOfferDialogOpen(true);
  };

  const deleteOffer = async (offer: AdminVisibilityOffer) => {
    const ok = window.confirm(`Supprimer l’offre "${offer.title}" ?`);
    if (!ok) return;

    try {
      await deleteAdminVisibilityOffer(undefined, offer.id);
      toast({ title: "Offre supprimée" });
      await loadOffers();
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const toggleOfferActive = async (offer: AdminVisibilityOffer) => {
    try {
      await updateAdminVisibilityOffer(undefined, offer.id, {
        active: !offer.active,
      });
      await loadOffers();
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const offersColumns = useMemo(() => {
    return [
      {
        header: "Offre",
        accessorKey: "title",
        cell: ({ row }: any) => {
          const o = row.original as AdminVisibilityOffer;
          const badge = offerTypeBadge(o.type);
          return (
            <div className="space-y-1 min-w-[280px]">
              <div className="flex items-center gap-2">
                <div className="font-semibold">{o.title}</div>
                <Badge variant="outline" className={badge.cls}>
                  {badge.label}
                </Badge>
                {!o.active ? (
                  <Badge variant="secondary">Inactive</Badge>
                ) : (
                  <Badge className="bg-emerald-600">Active</Badge>
                )}
              </div>
              {o.description ? (
                <div className="text-xs text-slate-600">{o.description}</div>
              ) : null}
            </div>
          );
        },
      },
      {
        header: "Prix",
        accessorKey: "price_cents",
        cell: ({ row }: any) => {
          const o = row.original as AdminVisibilityOffer;
          if (o.price_cents == null)
            return <span className="text-slate-500">—</span>;
          return (
            <div className="font-semibold tabular-nums">
              {formatMoney(o.price_cents, o.currency)}
            </div>
          );
        },
      },
      {
        header: "Durée",
        accessorKey: "duration_days",
        cell: ({ row }: any) => {
          const o = row.original as AdminVisibilityOffer;
          return o.duration_days ? (
            <span className="tabular-nums">{o.duration_days}j</span>
          ) : (
            <span className="text-slate-500">—</span>
          );
        },
      },
      {
        header: "Ordre",
        accessorKey: "display_order",
        cell: ({ row }: any) => (
          <span className="tabular-nums">
            {(row.original as AdminVisibilityOffer).display_order}
          </span>
        ),
      },
      {
        header: "Actions",
        id: "actions",
        cell: ({ row }: any) => {
          const o = row.original as AdminVisibilityOffer;
          return (
            <div className="flex items-center justify-end gap-2 min-w-[220px]">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => openEditOffer(o)}
              >
                <Pencil className="h-4 w-4" />
                Modifier
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void toggleOfferActive(o)}
              >
                {o.active ? "Désactiver" : "Activer"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-red-700"
                onClick={() => void deleteOffer(o)}
              >
                <Trash2 className="h-4 w-4" />
                Suppr.
              </Button>
            </div>
          );
        },
      },
    ];
  }, [offers]);

  const ordersRows = useMemo(() => {
    return orders.map((o) => {
      const estName = o.establishments?.name ?? null;
      const estCity = o.establishments?.city ?? null;
      return {
        ...o,
        _display_est: estName
          ? `${estName}${estCity ? ` (${estCity})` : ""}`
          : o.establishment_id,
        _display_created: o.created_at ? formatLocalYmdHm(o.created_at) : "",
      };
    });
  }, [orders]);

  const ordersColumns = useMemo(() => {
    return [
      {
        header: "Commande",
        accessorKey: "id",
        cell: ({ row }: any) => {
          const o = row.original as AdminVisibilityOrder;
          const st = orderStatusBadge(o.status);
          const pay = paymentStatusBadge(o.payment_status);
          return (
            <div className="space-y-1 min-w-[280px]">
              <div className="font-semibold">#{o.id.slice(0, 8)}</div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={pay.cls}>
                  {pay.label}
                </Badge>
                <Badge variant="outline" className={st.cls}>
                  {st.label}
                </Badge>
                {o.items.some(
                  (it) => String(it.type).toLowerCase() === "media_video",
                ) ? (
                  <Badge variant="secondary" className="gap-1">
                    <Video className="h-3 w-3" />
                    Vidéo
                  </Badge>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        header: "Établissement",
        accessorKey: "_display_est",
        cell: ({ row }: any) => {
          const o = row.original as any;
          return <div className="text-sm">{o._display_est}</div>;
        },
      },
      {
        header: "Total",
        accessorKey: "total_cents",
        cell: ({ row }: any) => {
          const o = row.original as AdminVisibilityOrder;
          return (
            <div className="font-semibold tabular-nums">
              {formatMoney(o.total_cents, o.currency)}
            </div>
          );
        },
      },
      {
        header: "Créée",
        accessorKey: "_display_created",
        cell: ({ row }: any) => (
          <div className="text-sm tabular-nums">
            {(row.original as any)._display_created}
          </div>
        ),
      },
      {
        header: "Facture",
        accessorKey: "finance_invoice",
        cell: ({ row }: any) => {
          const o = row.original as AdminVisibilityOrder;
          const inv = o.finance_invoice?.invoice_number ?? null;
          return inv ? (
            <div className="text-sm font-semibold">{inv}</div>
          ) : (
            <div className="text-sm text-slate-500">—</div>
          );
        },
      },
    ];
  }, []);

  const quotesRows = useMemo(() => {
    return quotes.map((q) => {
      const clientName =
        q.pro_profiles?.company_name ??
        q.pro_profiles?.contact_name ??
        q.establishments?.name ??
        "—";

      return {
        ...q,
        _display_client: clientName,
        _display_created: q.created_at ? formatLocalYmdHm(q.created_at) : "",
      };
    });
  }, [quotes]);

  const quotesColumns = useMemo(() => {
    return [
      {
        header: "Devis",
        accessorKey: "quote_number",
        cell: ({ row }: any) => {
          const q = row.original as AdminMediaQuote;
          const st = quoteStatusBadge(String(q.status ?? ""));
          return (
            <div className="space-y-1 min-w-[220px]">
              <div className="font-semibold">{q.quote_number}</div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={st.cls}>
                  {st.label}
                </Badge>
              </div>
            </div>
          );
        },
      },
      {
        header: "Client",
        accessorKey: "_display_client",
        cell: ({ row }: any) => (
          <div className="text-sm">{(row.original as any)._display_client}</div>
        ),
      },
      {
        header: "Total",
        accessorKey: "total_amount",
        cell: ({ row }: any) => {
          const q = row.original as AdminMediaQuote;
          return (
            <div className="font-semibold tabular-nums">
              {formatMoneyAmount(q.total_amount, q.currency)}
            </div>
          );
        },
      },
      {
        header: "Créé",
        accessorKey: "_display_created",
        cell: ({ row }: any) => (
          <div className="text-sm tabular-nums">
            {(row.original as any)._display_created}
          </div>
        ),
      },
    ];
  }, []);

  const invoicesRows = useMemo(() => {
    return invoices.map((inv) => {
      const clientName =
        inv.pro_profiles?.company_name ??
        inv.pro_profiles?.contact_name ??
        inv.establishments?.name ??
        "—";

      return {
        ...inv,
        _display_client: clientName,
        _display_created: inv.created_at
          ? formatLocalYmdHm(inv.created_at)
          : "",
      };
    });
  }, [invoices]);

  const invoicesColumns = useMemo(() => {
    return [
      {
        header: "Facture",
        accessorKey: "invoice_number",
        cell: ({ row }: any) => {
          const inv = row.original as AdminMediaInvoice;
          const st = invoiceStatusBadge(String(inv.status ?? ""));
          return (
            <div className="space-y-1 min-w-[220px]">
              <div className="font-semibold">{inv.invoice_number}</div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={st.cls}>
                  {st.label}
                </Badge>
                {inv.media_quotes?.quote_number ? (
                  <Badge variant="secondary">
                    {inv.media_quotes.quote_number}
                  </Badge>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        header: "Client",
        accessorKey: "_display_client",
        cell: ({ row }: any) => (
          <div className="text-sm">{(row.original as any)._display_client}</div>
        ),
      },
      {
        header: "Total",
        accessorKey: "total_amount",
        cell: ({ row }: any) => {
          const inv = row.original as AdminMediaInvoice;
          return (
            <div className="font-semibold tabular-nums">
              {formatMoneyAmount(inv.total_amount, inv.currency)}
            </div>
          );
        },
      },
      {
        header: "Payé",
        accessorKey: "paid_amount",
        cell: ({ row }: any) => {
          const inv = row.original as AdminMediaInvoice;
          return (
            <div className="text-sm tabular-nums">
              {formatMoneyAmount(inv.paid_amount, inv.currency)}
            </div>
          );
        },
      },
      {
        header: "Créé",
        accessorKey: "_display_created",
        cell: ({ row }: any) => (
          <div className="text-sm tabular-nums">
            {(row.original as any)._display_created}
          </div>
        ),
      },
    ];
  }, []);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Visibilité (SAM Media)"
        description="Catalogue unique (offres) + devis + factures + commandes (workflow vidéo)."
        actions={
          <div className="flex items-center gap-2">
            <RefreshIconButton
              className="h-9 w-9"
              label="Rafraîchir"
              onClick={() => {
                if (tab === "offers") void loadOffers();
                else if (tab === "orders") void loadOrders();
                else if (tab === "quotes") void loadQuotes();
                else if (tab === "invoices") void loadInvoices();
              }}
            />
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="offers">Offres</TabsTrigger>
          <TabsTrigger value="quotes">Devis</TabsTrigger>
          <TabsTrigger value="invoices">Factures</TabsTrigger>
          <TabsTrigger value="orders">Commandes</TabsTrigger>
        </TabsList>

        <TabsContent value="offers" className="space-y-4">
          {offersError ? (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>{offersError}</div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              {offers.length} offre(s)
            </div>
            <Button className="gap-2" onClick={openCreateOffer}>
              <Plus className="h-4 w-4" />
              Nouvelle offre
            </Button>
          </div>

          {offersLoading ? (
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : (
            <AdminDataTable<AdminVisibilityOffer>
              data={offers}
              columns={offersColumns as any}
              isLoading={offersLoading}
              searchPlaceholder="Rechercher une offre…"
              onRowClick={(row) => openEditOffer(row)}
            />
          )}

          <OfferEditorDialog
            open={offerDialogOpen}
            offer={editingOffer}
            onClose={() => setOfferDialogOpen(false)}
            onSaved={() => void loadOffers()}
          />
        </TabsContent>

        <TabsContent value="quotes" className="space-y-4">
          {quotesError ? (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>{quotesError}</div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-600">{quotes.length} devis</div>
            <Button
              type="button"
              className="gap-2"
              onClick={() => setCreateQuoteOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Créer un devis
            </Button>
          </div>

          {quotesLoading ? (
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : (
            <AdminDataTable<any>
              data={quotesRows as any}
              columns={quotesColumns as any}
              isLoading={quotesLoading}
              searchPlaceholder="Rechercher un devis…"
              onRowClick={(row) =>
                setSelectedQuoteId((row as AdminMediaQuote).id)
              }
            />
          )}

          <CreateQuoteDialog
            open={createQuoteOpen}
            onClose={() => setCreateQuoteOpen(false)}
            onCreated={(q) => {
              setQuotes((prev) => [q, ...prev.filter((x) => x.id !== q.id)]);
              setSelectedQuoteId(q.id);
            }}
          />

          {selectedQuoteId ? (
            <QuoteDialog
              open={!!selectedQuoteId}
              quoteId={selectedQuoteId}
              offers={offers}
              onClose={() => setSelectedQuoteId(null)}
              onQuoteUpdated={(q) => {
                setQuotes((prev) =>
                  prev.map((x) => (x.id === q.id ? { ...x, ...q } : x)),
                );
              }}
              onInvoiceCreated={(inv) => {
                setInvoices((prev) => [
                  inv,
                  ...prev.filter((x) => x.id !== inv.id),
                ]);
                setSelectedInvoiceId(inv.id);
                setTab("invoices");
              }}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          {invoicesError ? (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>{invoicesError}</div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              {invoices.length} facture(s)
            </div>
            <Button variant="outline" onClick={() => void loadInvoices()}>
              Rafraîchir
            </Button>
          </div>

          {invoicesLoading ? (
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : (
            <AdminDataTable<any>
              data={invoicesRows as any}
              columns={invoicesColumns as any}
              isLoading={invoicesLoading}
              searchPlaceholder="Rechercher une facture…"
              onRowClick={(row) =>
                setSelectedInvoiceId((row as AdminMediaInvoice).id)
              }
            />
          )}

          {selectedInvoiceId ? (
            <InvoiceDialog
              open={!!selectedInvoiceId}
              invoiceId={selectedInvoiceId}
              onClose={() => setSelectedInvoiceId(null)}
              onInvoiceUpdated={(inv) => {
                setInvoices((prev) =>
                  prev.map((x) => (x.id === inv.id ? { ...x, ...inv } : x)),
                );
              }}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          {ordersError ? (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>{ordersError}</div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">
                Paiement :
              </span>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="paid">Payé</SelectItem>
                  <SelectItem value="failed">Échoué</SelectItem>
                  <SelectItem value="refunded">Remboursé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">
                Livraison :
              </span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="in_progress">En cours</SelectItem>
                  <SelectItem value="delivered">Livré</SelectItem>
                  <SelectItem value="cancelled">Annulé</SelectItem>
                  <SelectItem value="refunded">Remboursé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {ordersLoading ? (
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : (
            <AdminDataTable<any>
              data={ordersRows as any}
              columns={ordersColumns as any}
              isLoading={ordersLoading}
              searchPlaceholder="Rechercher une commande…"
              onRowClick={(row) =>
                setSelectedOrderId((row as AdminVisibilityOrder).id)
              }
            />
          )}

          {selectedOrder ? (
            <OrderDialog
              open={!!selectedOrderId}
              order={selectedOrder}
              onClose={() => setSelectedOrderId(null)}
              onOrderUpdated={(next) => {
                setOrders((prev) =>
                  prev.map((o) => (o.id === next.id ? next : o)),
                );
              }}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
