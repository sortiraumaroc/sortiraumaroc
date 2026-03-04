import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";

import { AdminPaymentsNav } from "./payments/AdminPaymentsNav";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import {
  AdminApiError,
  listAdminPayoutRequests,
  updateAdminPayoutRequest,
  type PayoutRequest,
} from "@/lib/adminApi";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

type Row = {
  id: string;
  payoutId: string;
  establishmentId: string;
  status: string;
  proComment: string | null;
  adminComment: string | null;
  paidReference: string | null;
  createdAt: string;
  createdAtIso: string;
  approvedAt: string | null;
  paidAt: string | null;
};

function statusBadge(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "submitted") return { label: "Soumise", cls: "bg-blue-100 text-blue-700 border-blue-200", icon: Clock };
  if (s === "approved") return { label: "Approuvée", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 };
  if (s === "rejected") return { label: "Rejetée", cls: "bg-red-100 text-red-700 border-red-200", icon: XCircle };
  if (s === "processing") return { label: "En cours", cls: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock };
  if (s === "completed") return { label: "Complétée", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 };
  return { label: s, cls: "bg-slate-100 text-slate-700 border-slate-200", icon: AlertCircle };
}

function formatLocalYmdHm(iso: string): string {
  const v = String(iso || "");
  return v ? formatLeJjMmAaAHeure(v) : "—";
}

function mapToRow(item: PayoutRequest): Row {
  return {
    id: item.id,
    payoutId: item.payout_id,
    establishmentId: item.establishment_id,
    status: item.status,
    proComment: item.pro_comment,
    adminComment: item.admin_comment,
    paidReference: item.paid_reference,
    createdAt: formatLocalYmdHm(item.created_at),
    createdAtIso: item.created_at,
    approvedAt: item.approved_at ? formatLocalYmdHm(item.approved_at) : null,
    paidAt: item.paid_at ? formatLocalYmdHm(item.paid_at) : null,
  };
}

export function AdminPayoutRequestsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("submitted");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<string>("");
  const [editComment, setEditComment] = useState<string>("");
  const [editReference, setEditReference] = useState<string>("");
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminPayoutRequests(undefined, {
        status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
        limit: 500,
      });
      setItems(res.items ?? []);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : String(e);
      setError(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleEdit = (row: Row) => {
    const item = items.find((i) => i.id === row.id);
    if (!item) return;
    setEditingId(row.id);
    setEditStatus(item.status);
    setEditComment(item.admin_comment ?? "");
    setEditReference(item.paid_reference ?? "");
  };

  const handleSave = async () => {
    if (!editingId) return;
    setUpdating(true);
    try {
      const res = await updateAdminPayoutRequest(undefined, editingId, {
        status: editStatus,
        admin_comment: editComment || null,
        paid_reference: editReference || null,
      });
      setItems((prev) => prev.map((i) => (i.id === editingId ? res.item : i)));
      setEditingId(null);
      toast({ title: "Demande mise à jour", description: "La demande de payout a été mise à jour." });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : String(e);
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  const rows = useMemo(() => items.map(mapToRow), [items]);

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: "createdAt",
      header: "Date de demande",
      cell: (info) => info.getValue() as string,
    },
    {
      accessorKey: "establishmentId",
      header: "Établissement",
      cell: (info) => {
        const id = info.getValue() as string;
        return <span className="font-mono text-xs">{id.slice(0, 8)}</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Statut",
      cell: (info) => {
        const status = info.getValue() as string;
        const st = statusBadge(status);
        const Icon = st.icon;
        return (
          <Badge className={`${st.cls} gap-1.5`}>
            <Icon className="w-3 h-3" />
            {st.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "payoutId",
      header: "Payout ID",
      cell: (info) => <span className="font-mono text-xs">{(info.getValue() as string).slice(0, 8)}</span>,
    },
    {
      accessorKey: "proComment",
      header: "Commentaire Pro",
      cell: (info) => {
        const text = info.getValue() as string | null;
        if (!text) return <span className="text-slate-500">—</span>;
        return <span className="text-sm truncate max-w-[200px]">{text}</span>;
      },
    },
    {
      accessorKey: "approvedAt",
      header: "Approuvée le",
      cell: (info) => (info.getValue() as string | null) || "—",
    },
    {
      accessorKey: "paidAt",
      header: "Payée le",
      cell: (info) => (info.getValue() as string | null) || "—",
    },
    {
      id: "actions",
      header: "Actions",
      cell: (info) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleEdit(info.row.original)}
        >
          Éditer
        </Button>
      ),
    },
  ];

  const editingItem = items.find((i) => i.id === editingId);

  return (
    <div className="space-y-6">
      <AdminPaymentsNav />
      <AdminPageHeader
        title="Payout"
        description="Gérez et approuvez les demandes de reversement des Pros."
      />

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>{error}</div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-700">Statut :</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="submitted">Soumises</SelectItem>
            <SelectItem value="approved">Approuvées</SelectItem>
            <SelectItem value="rejected">Rejetées</SelectItem>
            <SelectItem value="processing">En cours</SelectItem>
            <SelectItem value="completed">Complétées</SelectItem>
            <SelectItem value="all">Toutes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AdminDataTable<Row> columns={columns} data={rows} isLoading={loading} />

      {editingItem && editingId ? (
        <Dialog open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Éditer la demande de payout</DialogTitle>
              <DialogDescription>
                Demande de {editingItem.establishment_id.slice(0, 8)} • {formatLocalYmdHm(editingItem.created_at)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {editingItem.pro_comment ? (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
                  <div className="font-semibold text-blue-900 mb-1">Commentaire du Pro :</div>
                  <div className="text-blue-800">{editingItem.pro_comment}</div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="edit-status" className="text-sm font-semibold">
                  Statut
                </Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="submitted">Soumise</SelectItem>
                    <SelectItem value="approved">Approuvée</SelectItem>
                    <SelectItem value="rejected">Rejetée</SelectItem>
                    <SelectItem value="processing">En cours</SelectItem>
                    <SelectItem value="completed">Complétée</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-comment" className="text-sm font-semibold">
                  Commentaire admin
                </Label>
                <Textarea
                  id="edit-comment"
                  placeholder="Ex: En attente de la confirmation du paiement..."
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="min-h-24"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-reference" className="text-sm font-semibold">
                  Référence de paiement
                </Label>
                <Input
                  id="edit-reference"
                  placeholder="Ex: VIREMENT-2024-01-15-12345"
                  value={editReference}
                  onChange={(e) => setEditReference(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setEditingId(null)}
                disabled={updating}
              >
                Annuler
              </Button>
              <Button
                onClick={() => void handleSave()}
                disabled={updating}
              >
                {updating ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
