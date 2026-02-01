import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminReservationsNav } from "./reservations/AdminReservationsNav";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";

import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  listAdminWaitlist,
  listEstablishments,
  type AdminWaitlistEntry,
  type Establishment,
} from "@/lib/adminApi";

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

type WaitlistRow = {
  id: string;
  createdAt: string;
  createdAtIso: string;
  status: string;
  position: string;
  offerExpiresAt: string;
  bookingReference: string;
  startsAt: string;
  partySize: string;
  establishment: string;
  establishmentId: string;
};

function mapEntryToRow(entry: AdminWaitlistEntry): WaitlistRow {
  const reservation = entry.reservations ?? null;
  const est = reservation?.establishments ?? null;

  const createdAtIso = String(entry.created_at ?? "");
  const startsAtIso = String(reservation?.starts_at ?? "");
  const offerExpiresIso = String(entry.offer_expires_at ?? "");

  const bookingRef = String(reservation?.booking_reference ?? "").trim();

  return {
    id: String(entry.id ?? ""),
    createdAt: formatLocal(createdAtIso),
    createdAtIso,
    status: String(entry.status ?? "—"),
    position: typeof entry.position === "number" && Number.isFinite(entry.position) ? String(entry.position) : "—",
    offerExpiresAt: offerExpiresIso ? formatLocal(offerExpiresIso) : "—",
    bookingReference: bookingRef || "—",
    startsAt: startsAtIso ? formatLocal(startsAtIso) : "—",
    partySize:
      typeof reservation?.party_size === "number" && Number.isFinite(reservation.party_size)
        ? String(Math.max(1, Math.round(reservation.party_size)))
        : "—",
    establishment: String(est?.name ?? est?.city ?? reservation?.establishment_id ?? "—"),
    establishmentId: String(reservation?.establishment_id ?? ""),
  };
}

function buildStatusCsvPreset(preset: string): string {
  if (preset === "active") return "waiting,queued,offer_sent";
  if (preset === "offers") return "offer_sent";
  if (preset === "ended") return "expired,cancelled,declined,removed,offer_timeout,offer_gone,offer_expired,offer_refused,slot_gone";
  return "";
}

export function AdminWaitlistPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [loadingEstablishments, setLoadingEstablishments] = useState(false);

  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<string>(
    () => getQueryParam(location.search, "establishment_id") ?? "",
  );
  const [statusPreset, setStatusPreset] = useState<string>(() => getQueryParam(location.search, "preset") ?? "active");
  const [statusCsv, setStatusCsv] = useState<string>(() => getQueryParam(location.search, "status") ?? buildStatusCsvPreset(statusPreset));
  const [from, setFrom] = useState<string>(() => getQueryParam(location.search, "from") ?? "");
  const [to, setTo] = useState<string>(() => getQueryParam(location.search, "to") ?? "");

  const [entries, setEntries] = useState<AdminWaitlistEntry[]>([]);
  const [rows, setRows] = useState<WaitlistRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams();

    if (selectedEstablishmentId) sp.set("establishment_id", selectedEstablishmentId);
    if (statusPreset) sp.set("preset", statusPreset);
    if (statusCsv) sp.set("status", statusCsv);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);

    const out = sp.toString();
    const nextSearch = out ? `?${out}` : "";

    if (nextSearch !== location.search) {
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: true });
    }
  }, [from, location.pathname, location.search, navigate, selectedEstablishmentId, statusCsv, statusPreset, to]);

  const loadEstablishments = async () => {
    setLoadingEstablishments(true);
    try {
      const res = await listEstablishments(undefined);
      setEstablishments((res.items ?? []) as Establishment[]);
    } catch {
      setEstablishments([]);
    } finally {
      setLoadingEstablishments(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listAdminWaitlist(undefined, {
        establishment_id: selectedEstablishmentId || undefined,
        status: statusCsv || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: 500,
      });

      const items = (res.items ?? []) as AdminWaitlistEntry[];
      setEntries(items);
      setRows(items.map(mapEntryToRow));
    } catch (e) {
      setEntries([]);
      setRows([]);
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEstablishments();
  }, []);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = useMemo<ColumnDef<WaitlistRow>[]>(() => {
    return [
      { accessorKey: "createdAt", header: "Créé" },
      { accessorKey: "status", header: "Statut" },
      { accessorKey: "position", header: "Pos." },
      { accessorKey: "offerExpiresAt", header: "Expire" },
      { accessorKey: "bookingReference", header: "Réf." },
      { accessorKey: "startsAt", header: "Créneau" },
      { accessorKey: "partySize", header: "Pers." },
      { accessorKey: "establishment", header: "Établissement" },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const r = row.original;
          const ref = r.bookingReference;

          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const qs = new URLSearchParams();
                  if (r.establishmentId) qs.set("establishment_id", r.establishmentId);
                  if (ref && ref !== "—") qs.set("search", ref);
                  navigate(`/admin/reservations?${qs.toString()}`);
                }}
              >
                Ouvrir
              </Button>
            </div>
          );
        },
      },
    ];
  }, [navigate]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Liste d'attente"
        description="Vue globale des demandes waitlist (tous établissements)."
        actions={
          <RefreshIconButton className="h-9 w-9" loading={loading} label="Rafraîchir" onClick={() => void refresh()} />
        }
      />

      <AdminReservationsNav />

      <Card className="border-slate-200">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Filtres</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Établissement</Label>
              <Select
                value={selectedEstablishmentId || "__all__"}
                onValueChange={(v) => {
                  setSelectedEstablishmentId(v === "__all__" ? "" : v);
                }}
                disabled={loadingEstablishments}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingEstablishments ? "Chargement…" : "Tous"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous</SelectItem>
                  {establishments.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {String(e.name ?? e.city ?? e.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Statut (preset)</Label>
              <Select
                value={statusPreset}
                onValueChange={(v) => {
                  setStatusPreset(v);
                  setStatusCsv(buildStatusCsvPreset(v));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Actives</SelectItem>
                  <SelectItem value="offers">Offres envoyées</SelectItem>
                  <SelectItem value="ended">Terminées</SelectItem>
                  <SelectItem value="custom">Personnalisé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-600">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-600">À</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="mt-3 space-y-1">
            <Label className="text-xs text-slate-600">Statuts (CSV)</Label>
            <Input
              value={statusCsv}
              onChange={(e) => {
                setStatusPreset("custom");
                setStatusCsv(e.target.value);
              }}
              placeholder="Ex: waiting,queued,offer_sent"
            />
            <div className="text-xs text-slate-500">
              Astuce: laissez vide pour afficher tous les statuts.
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              Appliquer
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedEstablishmentId("");
                setStatusPreset("active");
                setStatusCsv(buildStatusCsvPreset("active"));
                setFrom("");
                setTo("");
                void refresh();
              }}
              disabled={loading}
            >
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <AdminDataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Rechercher (référence, établissement, statut…)"
      />

      <div className="text-xs text-slate-500">{entries.length ? `${entries.length} entrée(s) chargée(s).` : ""}</div>
    </div>
  );
}
