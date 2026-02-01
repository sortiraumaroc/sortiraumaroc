import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminReservationsNav } from "./reservations/AdminReservationsNav";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { AdminReservationDetailsDialog } from "@/components/admin/establishment/AdminReservationDetailsDialog";

import {
  AdminApiError,
  listAdminEstablishmentReservations,
  listEstablishments,
  updateAdminEstablishmentReservation,
  type Establishment,
  type ReservationAdmin,
} from "@/lib/adminApi";

import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { isPastByIso } from "@/lib/reservationStatus";

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
  const cur = String(currency ?? "").trim();
  return `${(amountCents / 100).toFixed(2)} ${cur}`.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasRequestedChange(meta: unknown): boolean {
  if (!isRecord(meta)) return false;
  return meta.modification_requested === true || (isRecord(meta.requested_change) && Object.keys(meta.requested_change).length > 0);
}

function hasProposedChange(meta: unknown): boolean {
  if (!isRecord(meta)) return false;
  return isRecord(meta.proposed_change) && Object.keys(meta.proposed_change).length > 0;
}

type ReservationRow = {
  id: string;
  startsAt: string;
  startsAtIso: string;
  endsAtIso: string;
  bookingReference: string;
  status: string;
  paymentStatus: string;
  deposit: string;
  checkedInAt: string;
  checkedInAtIso: string;
  meta: unknown;
};

function mapReservationToRow(r: ReservationAdmin): ReservationRow {
  const startsAtIso = String(r.starts_at ?? "");
  const checkedInIso = String(r.checked_in_at ?? "");

  return {
    id: String(r.id ?? ""),
    startsAt: formatLocal(startsAtIso),
    startsAtIso,
    endsAtIso: String(r.ends_at ?? ""),
    bookingReference: String(r.booking_reference ?? "—"),
    status: String(r.status ?? "—"),
    paymentStatus: String(r.payment_status ?? "—"),
    deposit: formatMoneyCents(r.amount_deposit ?? null, r.currency ?? null),
    checkedInAt: formatLocal(checkedInIso),
    checkedInAtIso: checkedInIso,
    meta: (r as unknown as Record<string, unknown>).meta,
  };
}

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

export function AdminReservationsPage() {
  const location = useLocation();

  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<string>(
    () => getQueryParam(location.search, "establishment_id") ?? "",
  );

  const tableSearch = useMemo(() => getQueryParam(location.search, "search") ?? "", [location.search]);

  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [reservationsById, setReservationsById] = useState<Record<string, ReservationAdmin>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reservationStatusFilter, setReservationStatusFilter] = useState<string>("all");
  const [reservationPaymentFilter, setReservationPaymentFilter] = useState<string>("all");
  const [reservationWorkflowFilter, setReservationWorkflowFilter] = useState<string>("all");
  const [reservationTimeFilter, setReservationTimeFilter] = useState<"current" | "expired" | "all">("current");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);

  const selectedReservation = selectedReservationId ? reservationsById[selectedReservationId] ?? null : null;

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
      // Laisser l'UI fonctionner même si la liste n'est pas disponible
      if (e instanceof AdminApiError) setError(`Chargement des établissements: ${e.message}`);
      else setError("Chargement des établissements: erreur inattendue");
    }
  }, []);

  const refreshReservations = useCallback(async () => {
    if (!selectedEstablishmentId) {
      setReservations([]);
      setReservationsById({});
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await listAdminEstablishmentReservations(undefined, selectedEstablishmentId);
      const byId: Record<string, ReservationAdmin> = {};
      const rows = (res.items ?? [])
        .map((r: ReservationAdmin) => {
          byId[String(r.id ?? "")] = r;
          return mapReservationToRow(r);
        })
        .filter((r) => r.id);

      setReservationsById(byId);
      setReservations(rows);
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
    if (!qp && selectedEstablishmentId) {
      // laisser tel quel
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    void refreshReservations();
  }, [refreshReservations]);

  const filteredReservations = useMemo(() => {
    const status = (reservationStatusFilter ?? "all").toLowerCase();
    const payment = (reservationPaymentFilter ?? "all").toLowerCase();
    const workflow = (reservationWorkflowFilter ?? "all").toLowerCase();

    const nowMs = Date.now();

    return reservations.filter((r) => {
      if (status !== "all" && (r.status ?? "").toLowerCase() !== status) return false;
      if (payment !== "all" && (r.paymentStatus ?? "").toLowerCase() !== payment) return false;

      if (workflow === "modif" && !hasRequestedChange(r.meta)) return false;
      if (workflow === "proposition" && !hasProposedChange(r.meta)) return false;

      const endIso = (r.endsAtIso || r.startsAtIso || "").trim();
      const isPast = isPastByIso(endIso, nowMs);
      if (reservationTimeFilter === "current" && isPast) return false;
      if (reservationTimeFilter === "expired" && !isPast) return false;

      return true;
    });
  }, [reservationPaymentFilter, reservationStatusFilter, reservationTimeFilter, reservationWorkflowFilter, reservations]);

  const reservationColumns = useMemo<ColumnDef<ReservationRow>[]>(() => {
    function workflowSearchText(meta: unknown): string {
      const hasRequest = hasRequestedChange(meta);
      const hasProposal = hasProposedChange(meta);
      return [hasRequest ? "modification" : "", hasProposal ? "proposition" : ""].filter(Boolean).join(" ");
    }

    const statusLabels: Record<string, string> = {
      requested: "En attente",
      pending_pro_validation: "Validation pro",
      confirmed: "Confirmée",
      refused: "Refusée",
      waitlist: "Liste d'attente",
      cancelled: "Annulée",
      cancelled_user: "Annulée (client)",
      cancelled_pro: "Annulée (pro)",
      noshow: "No-show",
    };
    const paymentLabels: Record<string, string> = {
      pending: "En attente",
      paid: "Payé",
      refunded: "Remboursé",
      partially_refunded: "Part. remboursé",
      failed: "Échoué",
    };

    return [
      { accessorKey: "startsAt", header: "Date" },
      { accessorKey: "bookingReference", header: "Référence" },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => {
          const s = String(row.original.status ?? "").toLowerCase();
          return statusLabels[s] ?? row.original.status;
        },
      },
      {
        id: "workflow",
        header: "Workflow",
        accessorFn: (row) => workflowSearchText(row.meta),
        cell: ({ row }) => {
          const req = hasRequestedChange(row.original.meta);
          const prop = hasProposedChange(row.original.meta);
          if (!req && !prop) return <span className="text-xs text-slate-400">—</span>;

          return (
            <div className="flex flex-wrap gap-1">
              {req ? <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs bg-purple-50 text-purple-700 border-purple-200">Modif</span> : null}
              {prop ? <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border-blue-200">Proposition</span> : null}
            </div>
          );
        },
      },
      {
        accessorKey: "paymentStatus",
        header: "Paiement",
        cell: ({ row }) => {
          const s = String(row.original.paymentStatus ?? "").toLowerCase();
          return paymentLabels[s] ?? row.original.paymentStatus;
        },
      },
      { accessorKey: "deposit", header: "Acompte" },
      { accessorKey: "checkedInAt", header: "Check-in" },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedReservationId(row.original.id);
                setDialogOpen(true);
              }}
            >
              Détails
            </Button>
          </div>
        ),
      },
    ];
  }, []);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Réservations"
        description="Vue par établissement (filtrée)."
        actions={
          <RefreshIconButton
            className="h-9 w-9"
            loading={loading}
            disabled={!selectedEstablishmentId}
            label="Rafraîchir"
            onClick={() => void refreshReservations()}
          />
        }
      />

      <AdminReservationsNav />

      <Card className="border-slate-200">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Filtres</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
              <div className="text-xs font-semibold text-slate-600">Statut</div>
              <Select value={reservationStatusFilter} onValueChange={setReservationStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="requested">En attente</SelectItem>
                  <SelectItem value="pending_pro_validation">Validation pro</SelectItem>
                  <SelectItem value="confirmed">Confirmée</SelectItem>
                  <SelectItem value="refused">Refusée</SelectItem>
                  <SelectItem value="waitlist">Liste d'attente</SelectItem>
                  <SelectItem value="cancelled">Annulée</SelectItem>
                  <SelectItem value="cancelled_user">Annulée (client)</SelectItem>
                  <SelectItem value="cancelled_pro">Annulée (pro)</SelectItem>
                  <SelectItem value="noshow">No-show</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Paiement</div>
              <Select value={reservationPaymentFilter} onValueChange={setReservationPaymentFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Paiement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="paid">Payé</SelectItem>
                  <SelectItem value="refunded">Remboursé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Workflow</div>
              <Select value={reservationWorkflowFilter} onValueChange={setReservationWorkflowFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Workflow" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="modif">Modif</SelectItem>
                  <SelectItem value="proposition">Proposition</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Période</div>
              <Select value={reservationTimeFilter} onValueChange={(v) => setReservationTimeFilter((v as "current" | "expired" | "all") ?? "current")}>
                <SelectTrigger>
                  <SelectValue placeholder="Période" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Actuelles</SelectItem>
                  <SelectItem value="expired">Expirées</SelectItem>
                  <SelectItem value="all">Toutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setReservationStatusFilter("all");
                setReservationPaymentFilter("all");
                setReservationWorkflowFilter("all");
                setReservationTimeFilter("current");
              }}
            >
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {!selectedEstablishmentId ? (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
          Choisissez un établissement pour afficher ses réservations.
        </div>
      ) : null}

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <AdminDataTable
        data={filteredReservations}
        columns={reservationColumns}
        searchPlaceholder="Rechercher une réservation…"
        initialSearch={tableSearch}
        onRowClick={(row) => {
          setSelectedReservationId(row.id);
          setDialogOpen(true);
        }}
      />

      <AdminReservationDetailsDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setSelectedReservationId(null);
        }}
        reservation={selectedReservation}
        onUpdate={
          selectedReservation && selectedEstablishmentId
            ? async (patch) => {
                await updateAdminEstablishmentReservation(undefined, {
                  establishmentId: selectedEstablishmentId,
                  reservationId: String(selectedReservation.id),
                  status: patch.status,
                  starts_at: patch.starts_at,
                  meta_delete_keys: patch.meta_delete_keys,
                });
                await refreshReservations();
              }
            : undefined
        }
      />
    </div>
  );
}
