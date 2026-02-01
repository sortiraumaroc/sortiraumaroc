import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminReservationsNav } from "./reservations/AdminReservationsNav";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";

import {
  AdminApiError,
  listAdminEstablishmentOffers,
  listAdminEstablishmentPackBilling,
  listEstablishments,
  type Establishment,
} from "@/lib/adminApi";

import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { buildConsumedByPurchase, getPackPurchaseConsumption } from "@/lib/packConsumption";

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoneyCents(amountCents: number | null | undefined, currency: string | null | undefined): string {
  if (typeof amountCents !== "number" || !Number.isFinite(amountCents)) return "—";
  const unit = String(currency ?? "").trim();
  const num = (amountCents / 100).toFixed(2);
  return unit ? `${num} ${unit}` : num;
}

type SlotRow = {
  startsAt: string;
  basePrice: string;
  status: string;
};

type PackRow = {
  title: string;
  price: string;
  active: string;
};

type PurchaseRow = {
  id: string;
  createdAt: string;
  packId: string;
  paymentStatus: string;
  status: string;
  quantity: number;
  consumed: number;
  remaining: number;
  fullyConsumed: boolean;
  amount: string;
};

type RedemptionRow = {
  redeemedAt: string;
  purchaseId: string;
  reservationId: string;
  count: string;
};

function getQueryParam(search: string, key: string): string | null {
  try {
    const sp = new URLSearchParams(search);
    const v = sp.get(key);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

function setQueryParam(search: string, key: string, value: string | null): string {
  const sp = new URLSearchParams(search);
  if (!value) sp.delete(key);
  else sp.set(key, value);
  const out = sp.toString();
  return out ? `?${out}` : "";
}

export function AdminDealsPage() {
  const location = useLocation();

  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<string>(
    () => getQueryParam(location.search, "establishment_id") ?? "",
  );

  const [offersSlots, setOffersSlots] = useState<SlotRow[]>([]);
  const [offersPacks, setOffersPacks] = useState<PackRow[]>([]);
  const [packPurchases, setPackPurchases] = useState<PurchaseRow[]>([]);
  const [packRedemptions, setPackRedemptions] = useState<RedemptionRow[]>([]);

  const [purchaseConsumptionFilter, setPurchaseConsumptionFilter] = useState<"not_consumed" | "fully_consumed" | "all">("not_consumed");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedEstablishmentLabel = useMemo(() => {
    const found = establishments.find((e) => String(e.id) === selectedEstablishmentId);
    if (!found) return null;
    return String(found.name ?? found.title ?? found.id);
  }, [establishments, selectedEstablishmentId]);

  const loadEstablishments = useCallback(async () => {
    try {
      const res = await listEstablishments(undefined);
      const items = (res.items ?? []) as Establishment[];
      items.sort((a, b) => String(a.name ?? a.title ?? "").localeCompare(String(b.name ?? b.title ?? ""), "fr"));
      setEstablishments(items);
    } catch (e) {
      if (e instanceof AdminApiError) setError(`Chargement des établissements: ${e.message}`);
      else setError("Chargement des établissements: erreur inattendue");
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!selectedEstablishmentId) {
      setOffersSlots([]);
      setOffersPacks([]);
      setPackPurchases([]);
      setPackRedemptions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [offersRes, billingRes] = await Promise.all([
        listAdminEstablishmentOffers(undefined, selectedEstablishmentId),
        listAdminEstablishmentPackBilling(undefined, selectedEstablishmentId),
      ]);

      const slots: SlotRow[] = (offersRes.slots ?? []).map((s: any) => ({
        startsAt: formatLocal(s?.starts_at),
        basePrice: formatMoneyCents(typeof s?.base_price === "number" ? s.base_price : null, s?.currency ?? null),
        status: String(s?.status ?? "—"),
      }));
      setOffersSlots(slots);

      const packs: PackRow[] = (offersRes.packs ?? []).map((p: any) => ({
        title: String(p?.title ?? p?.name ?? p?.id ?? "—"),
        price: formatMoneyCents(typeof p?.price === "number" ? p.price : null, p?.currency ?? null),
        active: typeof p?.active === "boolean" ? (p.active ? "Oui" : "Non") : "—",
      }));
      setOffersPacks(packs);

      const rawRedemptions = (billingRes.redemptions ?? []) as any[];
      const consumedByPurchase = buildConsumedByPurchase(rawRedemptions);

      const rawPurchases = (billingRes.purchases ?? []) as any[];
      const purchases: PurchaseRow[] = rawPurchases.map((p: any) => {
        const id = String(p?.id ?? "");
        const quantity = typeof p?.quantity === "number" && Number.isFinite(p.quantity) ? Math.max(0, Math.floor(p.quantity)) : 0;
        const { consumed, remaining, fullyConsumed } = id ? getPackPurchaseConsumption({ id, quantity }, consumedByPurchase) : { consumed: 0, remaining: quantity, fullyConsumed: false };

        const amountCents = typeof p?.total_price === "number" ? p.total_price : typeof p?.amount === "number" ? p.amount : null;
        const currency = p?.currency ?? null;

        return {
          id,
          createdAt: formatLocal(p?.created_at),
          packId: String(p?.pack_id ?? "—"),
          paymentStatus: String(p?.payment_status ?? "—"),
          status: String(p?.status ?? "—"),
          quantity,
          consumed,
          remaining,
          fullyConsumed,
          amount: formatMoneyCents(amountCents, currency),
        };
      });
      setPackPurchases(purchases);

      const redemptions: RedemptionRow[] = rawRedemptions.map((r: any) => ({
        redeemedAt: formatLocal(r?.redeemed_at),
        purchaseId: String(r?.purchase_id ?? "—"),
        reservationId: String(r?.reservation_id ?? "—"),
        count: typeof r?.count === "number" ? String(r.count) : "—",
      }));
      setPackRedemptions(redemptions);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [selectedEstablishmentId]);

  useEffect(() => {
    void loadEstablishments();
  }, [loadEstablishments]);

  // Synchronise le query param si l'utilisateur change de sélection
  useEffect(() => {
    const wanted = setQueryParam(location.search, "establishment_id", selectedEstablishmentId || null);
    const current = location.search || "";
    if (wanted !== current) {
      window.history.replaceState(null, "", `${location.pathname}${wanted}${location.hash}`);
    }
  }, [location.hash, location.pathname, location.search, selectedEstablishmentId]);

  // Si on arrive avec un query param, prendre la valeur
  useEffect(() => {
    const qp = getQueryParam(location.search, "establishment_id");
    if (qp && qp !== selectedEstablishmentId) setSelectedEstablishmentId(qp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const slotsColumns = useMemo(
    () => [
      { accessorKey: "startsAt", header: "Début" },
      { accessorKey: "basePrice", header: "Prix" },
      { accessorKey: "status", header: "Statut" },
    ],
    [],
  );

  const packsColumns = useMemo(
    () => [
      { accessorKey: "title", header: "Pack" },
      { accessorKey: "price", header: "Prix" },
      { accessorKey: "active", header: "Actif" },
    ],
    [],
  );

  const purchasesColumns = useMemo(
    () => [
      { accessorKey: "createdAt", header: "Date" },
      { accessorKey: "packId", header: "Pack" },
      { accessorKey: "paymentStatus", header: "Paiement" },
      { accessorKey: "quantity", header: "Acheté" },
      { accessorKey: "consumed", header: "Consommé" },
      { accessorKey: "remaining", header: "Restant" },
      { accessorKey: "amount", header: "Montant" },
      { accessorKey: "status", header: "Statut" },
    ],
    [],
  );

  const redemptionsColumns = useMemo(
    () => [
      { accessorKey: "redeemedAt", header: "Date" },
      { accessorKey: "purchaseId", header: "Achat" },
      { accessorKey: "reservationId", header: "Réservation" },
      { accessorKey: "count", header: "Nb" },
    ],
    [],
  );

  const filteredPackPurchases = useMemo(() => {
    if (purchaseConsumptionFilter === "all") return packPurchases;
    if (purchaseConsumptionFilter === "fully_consumed") return packPurchases.filter((p) => p.paymentStatus === "paid" && p.fullyConsumed);
    return packPurchases.filter((p) => {
      if (p.paymentStatus !== "paid") return true;
      return p.remaining > 0;
    });
  }, [packPurchases, purchaseConsumptionFilter]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Offres & packs"
        description="Achats et configuration par établissement (filtrée)."
        actions={
          <RefreshIconButton
            className="h-9 w-9"
            loading={loading}
            disabled={!selectedEstablishmentId}
            label="Rafraîchir"
            onClick={() => void refresh()}
          />
        }
      />

      <AdminReservationsNav />

      <Card className="border-slate-200">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Filtres</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Établissement</div>
              <Select
                value={selectedEstablishmentId}
                onValueChange={(value) => {
                  // Radix Select: Select value can be "" (to show placeholder),
                  // but Select.Item values must NOT be an empty string.
                  setSelectedEstablishmentId(value === "__none__" ? "" : value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un établissement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Choisir…</SelectItem>
                  {establishments.map((e) => (
                    <SelectItem key={String(e.id)} value={String(e.id)}>
                      {String(e.name ?? e.title ?? e.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedEstablishmentLabel ? (
                <div className="text-[11px] text-slate-500 truncate">Sélection: {selectedEstablishmentLabel}</div>
              ) : null}
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Consommation (achats)</div>
              <Select value={purchaseConsumptionFilter} onValueChange={(v) => setPurchaseConsumptionFilter((v as any) ?? "not_consumed")}>
                <SelectTrigger>
                  <SelectValue placeholder="Consommation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_consumed">Non consommés</SelectItem>
                  <SelectItem value="fully_consumed">Consommés</SelectItem>
                  <SelectItem value="all">Tous</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedEstablishmentId ? (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
          Choisissez un établissement pour afficher ses offres, packs et achats.
        </div>
      ) : null}

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900">Offres (slots)</div>
            <div className="text-xs text-slate-500">{offersSlots.length}</div>
          </div>
          <AdminDataTable data={offersSlots} columns={slotsColumns as any} searchPlaceholder="Rechercher…" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900">Offres (packs)</div>
            <div className="text-xs text-slate-500">{offersPacks.length}</div>
          </div>
          <AdminDataTable data={offersPacks} columns={packsColumns as any} searchPlaceholder="Rechercher…" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900">Packs achetés</div>
            <div className="text-xs text-slate-500">{packPurchases.length}</div>
          </div>
          <AdminDataTable data={filteredPackPurchases} columns={purchasesColumns as any} searchPlaceholder="Rechercher…" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900">Packs consommés</div>
            <div className="text-xs text-slate-500">{packRedemptions.length}</div>
          </div>
          <AdminDataTable data={packRedemptions} columns={redemptionsColumns as any} searchPlaceholder="Rechercher…" />
        </div>
      </div>
    </div>
  );
}
