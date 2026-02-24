import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminPaymentsNav } from "./payments/AdminPaymentsNav";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Input } from "@/components/ui/input";
import { AdminApiError, listAdminNotifications, type AdminNotification } from "@/lib/adminApi";
import { PaginationControls } from "@/components/admin/table/PaginationControls";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

function humanAdminError(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Une erreur est survenue.";
}

function isPaymentNotification(n: AdminNotification): boolean {
  const t = String(n.type ?? "").toLowerCase();
  if (t.includes("payment") || t.includes("refund")) return true;

  const title = String(n.title ?? "").toLowerCase();
  const body = String(n.body ?? "").toLowerCase();
  return title.includes("paiement") || title.includes("refund") || body.includes("paiement") || body.includes("refund");
}

function statusBadgeFromType(type: string | null | undefined) {
  const t = String(type ?? "").toLowerCase();
  if (t.includes("refunded") || t.includes("refund")) {
    return <Badge variant="destructive">Remboursé</Badge>;
  }
  if (t.includes("pending")) {
    return <Badge className="bg-amber-50 text-amber-700 border-amber-200">En attente</Badge>;
  }
  if (t.includes("paid") || t.includes("payment")) {
    return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Payé</Badge>;
  }

  return <Badge variant="secondary">Événement</Badge>;
}

export function AdminPaymentsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [search, setSearch] = useState<string>("");
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listAdminNotifications(undefined, { limit: 200 });
      const filtered = (res.items ?? []).filter(isPaymentNotification);
      setItems(filtered);
    } catch (e) {
      setItems([]);
      setError(humanAdminError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((n) => {
      const hay = `${n.id} ${n.type ?? ""} ${n.title ?? ""} ${n.body ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  useEffect(() => { setCurrentPage(0); }, [search]);

  const paginatedVisible = useMemo(() => {
    const start = currentPage * pageSize;
    return visible.slice(start, start + pageSize);
  }, [visible, currentPage, pageSize]);

  return (
    <div className="space-y-4">
      <AdminPaymentsNav />
      <AdminPageHeader
        title="Paiements"
        description="Événements paiements/refunds détectés (webhook + notifications admin)."
        actions={
          <RefreshIconButton className="h-9 w-9" loading={loading} label="Rafraîchir" onClick={() => void refresh()} />
        }
      />

      <Card className="border-slate-200">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Recherche</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (id, type, titre, contenu)…"
          />
          <div className="mt-2 text-xs text-slate-500">{visible.length} événement(s)</div>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="border-slate-200">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Derniers événements</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {loading ? <div className="text-sm text-slate-600">Chargement…</div> : null}

          {!loading && !visible.length ? <div className="text-sm text-slate-600">Aucun événement.</div> : null}

          {!loading && visible.length ? (
            <div className="space-y-2">
              {paginatedVisible.map((n) => (
                <div key={n.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900 truncate">{n.title || "Notification"}</div>
                        {statusBadgeFromType(n.type)}
                        <Badge className={n.read_at ? "bg-slate-100 text-slate-700 border-slate-200" : "bg-primary text-white"}>
                          {n.read_at ? "lu" : "non lu"}
                        </Badge>
                      </div>

                      {n.body ? <div className="mt-1 text-sm text-slate-700">{n.body}</div> : null}

                      <div className="mt-1 text-xs text-slate-500 tabular-nums">
                        {formatLeJjMmAaAHeure(n.created_at)}
                        {n.type ? ` · ${n.type}` : ""}
                        {n.id ? ` · ${n.id}` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {visible.length > 0 && (
            <PaginationControls
              currentPage={currentPage}
              pageSize={pageSize}
              totalItems={visible.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          )}

          <div className="mt-3 text-xs text-slate-500">
            Cette page affiche des événements (notifications) générés par le backend. La liste exhaustive des transactions (réservations + achats de packs)
            sera branchée sur un endpoint dédié dans une passe suivante.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
