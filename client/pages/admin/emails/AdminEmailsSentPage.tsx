import type { ColumnDef } from "@tanstack/react-table";

import { Link } from "react-router-dom";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminApiError, listAdminEmailSends, type AdminEmailSendRow } from "@/lib/adminApi";

import { useToast } from "@/hooks/use-toast";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminEmailsNav } from "./AdminEmailsNav";

export function AdminEmailsSentPage() {
  const { toast } = useToast();

  const [items, setItems] = useState<AdminEmailSendRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState<string>("");
  const [status, setStatus] = useState<string>("all");

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const res = await listAdminEmailSends(undefined, {
        q: q.trim() || undefined,
        status: status === "all" ? undefined : status,
        limit: 200,
      });
      setItems(res.items ?? []);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "❌ Chargement échoué", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [q, status, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const columns = useMemo<ColumnDef<AdminEmailSendRow>[]>(() => {
    return [
      {
        accessorKey: "created_at",
        header: "Date",
      },
      {
        accessorKey: "email_campaigns",
        header: "Campagne",
        cell: ({ row }) => {
          const c = row.original.email_campaigns;
          return <div className="text-sm">{c ? c.name : row.original.campaign_id}</div>;
        },
      },
      { accessorKey: "email", header: "Destinataire" },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => {
          const s = String(row.original.status || "");
          const cls = s === "sent" ? "bg-green-600 text-white" : s === "failed" ? "bg-red-600 text-white" : "bg-slate-200";
          const labels: Record<string, string> = {
            sent: "Envoyé",
            failed: "Échoué",
            pending: "En attente",
            skipped_unsubscribed: "Désabonné",
          };
          return <Badge className={cls}>{labels[s] ?? s}</Badge>;
        },
      },
      {
        accessorKey: "opened_at",
        header: "Ouvert",
        cell: ({ row }) => (row.original.opened_at ? <Badge className="bg-primary text-white">Oui</Badge> : <Badge variant="secondary">Non</Badge>),
      },
      {
        accessorKey: "clicked_at",
        header: "Cliqué",
        cell: ({ row }) => (row.original.clicked_at ? <Badge className="bg-primary text-white">Oui</Badge> : <Badge variant="secondary">Non</Badge>),
      },
      { accessorKey: "error", header: "Erreur" },
    ];
  }, []);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Emailing"
        description="Journal des campagnes (statuts + ouvertures/clics)."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? "Chargement…" : "Rafraîchir"}
            </Button>
            <Button asChild variant="outline">
              <Link to={`/admin/logs?action=${encodeURIComponent("email.")}`}>Voir logs transactionnels</Link>
            </Button>
          </div>
        }
      />

      <Card className="border-slate-200">
        <CardContent className="p-4 space-y-3">
          <AdminEmailsNav />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Recherche email</div>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex: user@gmail.com" />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Statut</div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="sent">Envoyé</SelectItem>
                  <SelectItem value="failed">Échoué</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="skipped_unsubscribed">Désabonné (ignoré)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
                Appliquer
              </Button>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Notes: les emails transactionnels (réservations, paiements, etc.) sont visibles dans Journaux → filtre <code>email.</code>
          </div>
        </CardContent>
      </Card>

      <AdminDataTable data={items} columns={columns} isLoading={loading} searchPlaceholder="Filtrer dans le tableau…" />
    </div>
  );
}
