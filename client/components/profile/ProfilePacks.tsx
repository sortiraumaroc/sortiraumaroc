import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Download, ExternalLink, Gift, QrCode, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { generatePackVoucherPDF } from "@/lib/packVoucherPdf";
import type { PackPurchase } from "@/lib/userData";
import { cn } from "@/lib/utils";

function universeLabel(u: PackPurchase["universe"]): string {
  if (u === "restaurant") return "Restaurant";
  if (u === "loisir") return "Loisir";
  return "Bien-être";
}

function formatShortDate(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMoneyMad(amount: number): string {
  const v = Math.round(Number(amount));
  if (!Number.isFinite(v)) return "—";
  return `${v} Dhs`;
}

function computeStatus(p: PackPurchase): { label: string; className: string } {
  if (p.status === "refunded") return { label: "Remboursé", className: "bg-slate-100 text-slate-700 border-slate-200" };
  if (p.status === "used") return { label: "Utilisé", className: "bg-slate-100 text-slate-700 border-slate-200" };

  const untilTs = Date.parse(p.validUntilIso);
  if (Number.isFinite(untilTs) && untilTs < Date.now()) {
    return { label: "Expiré", className: "bg-rose-50 text-rose-800 border-rose-200" };
  }

  return { label: "Valable", className: "bg-emerald-50 text-emerald-800 border-emerald-200" };
}

export function ProfilePacks({ packs, onRemove }: { packs: PackPurchase[]; onRemove: (id: string) => void }) {
  const navigate = useNavigate();

  const sorted = useMemo(
    () => packs.slice().sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : a.createdAtIso > b.createdAtIso ? -1 : 0)),
    [packs],
  );

  if (!sorted.length) {
    return (
      <div className="rounded-lg border-2 border-slate-200 bg-white p-6 text-slate-700">
        <div className="font-bold text-foreground">Aucun pack acheté</div>
        <div className="mt-2 text-sm text-slate-600">Vos packs achetés apparaîtront ici, avec un bon PDF + QR code.</div>
      </div>
    );
  }

  const nowMs = Date.now();

  const isPackExpiredByDate = (p: PackPurchase) => {
    const untilTs = Date.parse(p.validUntilIso);
    return Number.isFinite(untilTs) && untilTs < nowMs;
  };

  const isPackNotConsumed = (p: PackPurchase) => {
    if (p.status !== "active") return false;
    if (p.payment?.status === "refunded") return false;
    if (isPackExpiredByDate(p)) return false;
    return true;
  };

  const availablePacks = sorted.filter(isPackNotConsumed);
  const consumedOrUnavailablePacks = sorted.filter((p) => !isPackNotConsumed(p));

  const renderPackCard = (p: PackPurchase) => {
    const status = computeStatus(p);
    const qty = Math.max(1, Math.round(Number(p.quantity) || 1));
    const unit = Math.round(Number(p.unitMad) || 0);
    const totalMad = Math.round(Number(p.payment?.totalAmount) || unit * qty);

    return (
      <div key={p.id} className="rounded-lg border-2 border-slate-200 bg-white overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-4 border-b border-slate-200 bg-primary/5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" />
              <div className="font-bold text-foreground truncate">{p.title}</div>
            </div>
            <div className="mt-1 text-xs text-slate-600">
              {p.establishmentName ? <span className="font-semibold text-slate-700">{p.establishmentName}</span> : null}
              <span className="mx-2">·</span>
              <span>{universeLabel(p.universe)}</span>
            </div>
            <div className="mt-1 text-xs text-slate-600 font-mono">Réf. {p.id}</div>
          </div>
          <div className={cn("shrink-0 px-3 py-1 rounded-full border text-xs font-bold", status.className)}>{status.label}</div>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-slate-600">Validité</div>
                <div className="text-sm font-semibold text-foreground">
                  {formatShortDate(p.validFromIso)} → {formatShortDate(p.validUntilIso)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold text-slate-600">Montant payé</div>
                <div className="text-sm font-extrabold text-foreground tabular-nums">{formatMoneyMad(totalMad)}</div>
                <div className="text-xs text-slate-500">
                  {formatMoneyMad(unit)} × {qty}
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-600">
            Les factures sont disponibles dans l’onglet <span className="font-semibold">Facturation</span>.
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="button" asChild className="bg-primary hover:bg-primary/90 text-white gap-2">
              <Link to="/mon-qr">
                <QrCode className="w-4 h-4" />
                Mon QR Code
              </Link>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() =>
                generatePackVoucherPDF({
                  purchaseId: p.id,
                  packTitle: p.title,
                  establishmentName: p.establishmentName,
                  universeLabel: universeLabel(p.universe),
                  quantity: qty,
                  unitMad: unit,
                  totalMad,
                  purchasedAtIso: p.payment?.paidAtIso ?? p.createdAtIso,
                  validFromIso: p.validFromIso,
                  validUntilIso: p.validUntilIso,
                })
              }
            >
              <Download className="w-4 h-4" />
              Bon PDF
            </Button>

            {p.detailsUrl ? (
              <Button type="button" variant="outline" className="gap-2" onClick={() => navigate(p.detailsUrl!)}>
                <ExternalLink className="w-4 h-4" />
                Ouvrir
              </Button>
            ) : null}

            <Button type="button" variant="outline" className="gap-2" onClick={() => onRemove(p.id)}>
              <Trash2 className="w-4 h-4" />
              Supprimer
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderSection = (args: { title: string; items: PackPurchase[]; emptyText: string }) => {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-extrabold text-slate-900">{args.title}</div>
          <div className="text-xs text-slate-500 tabular-nums">{args.items.length}</div>
        </div>

        {args.items.length ? <div className="space-y-4">{args.items.map(renderPackCard)}</div> : <div className="text-sm text-slate-600">{args.emptyText}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderSection({ title: "Packs non consommés", items: availablePacks, emptyText: "Aucun pack disponible." })}
      {renderSection({ title: "Packs consommés / expirés", items: consumedOrUnavailablePacks, emptyText: "Aucun pack consommé." })}
    </div>
  );
}
