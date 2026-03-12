import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

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
import { AdminVisibilityNav } from "@/pages/admin/visibility/AdminVisibilityNav";
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
  type AdminVisibilityOffer,
  type AdminVisibilityOfferType,
  type AdminVisibilityOrder,
  type AdminVisibilityOrderItem,
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


// [Quotes/invoices dialog components removed — moved to dedicated page]

export function AdminVisibilityPage() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Read tab from URL params - reacts to URL changes
  const urlTab = searchParams.get("tab");
  const [tab, setTab] = useState(() => {
    if (urlTab && ["offers", "orders"].includes(urlTab)) {
      return urlTab;
    }
    return "offers";
  });

  // Sync tab with URL when URL changes (e.g., navigation from notifications)
  useEffect(() => {
    if (urlTab && ["offers", "orders"].includes(urlTab)) {
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

  useEffect(() => {
    void loadOffers();
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

  return (
    <div className="space-y-4">
      <AdminVisibilityNav />
      <AdminPageHeader
        title="Visibilité (SAM Media)"
        description="Catalogue unique (offres) + commandes (workflow vidéo)."
        actions={
          <div className="flex items-center gap-2">
            <RefreshIconButton
              className="h-9 w-9"
              label="Rafraîchir"
              onClick={() => {
                if (tab === "offers") void loadOffers();
                else if (tab === "orders") void loadOrders();
              }}
            />
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="offers">Offres</TabsTrigger>
          <TabsTrigger value="orders">Commandes</TabsTrigger>
          <Link
            to="/admin/username-subscriptions"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground ring-offset-background transition-all hover:bg-background/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Liens Perso
          </Link>
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
