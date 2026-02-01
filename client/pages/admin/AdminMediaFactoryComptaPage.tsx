import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BanknoteIcon,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

import {
  listAdminPartnerInvoiceRequests,
  updateAdminInvoiceRequest,
  type AdminPartnerInvoiceRequest,
} from "@/lib/adminApi";
import { formatDateTimeShort } from "@/components/mediaFactory/mediaFactoryStatus";
import { AdminMediaFactoryNav } from "./media-factory/AdminMediaFactoryNav";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";

function shortId(id: string): string {
  if (!id) return "";
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function formatAmount(cents: number, currency: string): string {
  const value = cents / 100;
  return `${value.toFixed(2)} ${currency}`;
}

type StatusBadgeProps = { status: string };

function InvoiceStatusBadge({ status }: StatusBadgeProps) {
  const colors: Record<string, string> = {
    requested: "bg-amber-100 text-amber-800",
    approved: "bg-blue-100 text-blue-800",
    paid: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };
  const labels: Record<string, string> = {
    requested: "En attente",
    approved: "Approuvé",
    paid: "Payé",
    rejected: "Rejeté",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${colors[status] ?? "bg-gray-100 text-gray-800"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

export function AdminMediaFactoryComptaPage() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AdminPartnerInvoiceRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] =
    useState<AdminPartnerInvoiceRequest | null>(null);
  const [newStatus, setNewStatus] = useState<"approved" | "paid" | "rejected">(
    "approved",
  );
  const [paymentRef, setPaymentRef] = useState("");
  const [updating, setUpdating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await listAdminPartnerInvoiceRequests(undefined, {
        status: statusFilter || undefined,
      });
      setItems(res.items ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({ title: "Compta", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const openAction = (req: AdminPartnerInvoiceRequest) => {
    setSelectedRequest(req);
    setNewStatus(req.status === "requested" ? "approved" : "paid");
    setPaymentRef(req.payment_reference ?? "");
    setDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedRequest) return;
    setUpdating(true);
    try {
      await updateAdminInvoiceRequest(undefined, selectedRequest.id, {
        status: newStatus,
        payment_reference: paymentRef.trim() || null,
      });
      toast({
        title: "Demande mise à jour",
        description: `Statut: ${newStatus}`,
      });
      setDialogOpen(false);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  const summary = useMemo(() => {
    const total = items.length;
    const pending = items.filter((i) => i.status === "requested").length;
    const approved = items.filter((i) => i.status === "approved").length;
    const paid = items.filter((i) => i.status === "paid").length;
    const pendingAmount = items
      .filter((i) => i.status === "requested" || i.status === "approved")
      .reduce((acc, i) => acc + i.amount_cents, 0);
    return { total, pending, approved, paid, pendingAmount };
  }, [items]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <AdminPageHeader
        title="Media Factory"
        description="Comptabilité - Factures Partenaires"
      />

      <AdminMediaFactoryNav />

      <div className="flex items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter || "all"}
            onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
          >
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="requested">En attente</SelectItem>
              <SelectItem value="approved">Approuvé</SelectItem>
              <SelectItem value="paid">Payé</SelectItem>
              <SelectItem value="rejected">Rejeté</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw
              className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            Rafraîchir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <BanknoteIcon className="h-8 w-8 text-amber-600" />
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {summary.pending}
              </div>
              <div className="text-xs text-slate-500">En attente</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-blue-600" />
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {summary.approved}
              </div>
              <div className="text-xs text-slate-500">Approuvés</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {summary.paid}
              </div>
              <div className="text-xs text-slate-500">Payés</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <BanknoteIcon className="h-8 w-8 text-primary" />
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {formatAmount(summary.pendingAmount, "MAD")}
              </div>
              <div className="text-xs text-slate-500">À régler</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="py-3">
          <SectionHeader
            title="Demandes de facturation"
            description="Validez les demandes des partenaires et enregistrez les paiements."
            titleClassName="text-sm"
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partenaire</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Job / Établissement</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Demandé</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-sm text-slate-600"
                  >
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                    Chargement…
                  </TableCell>
                </TableRow>
              ) : items.length ? (
                items.map((req) => {
                  const job = req.media_jobs;
                  const est = job?.establishments;
                  const partner = req.partner_profiles;
                  return (
                    <TableRow key={req.id}>
                      <TableCell className="text-sm font-semibold text-slate-900">
                        {partner?.display_name || shortId(req.partner_user_id)}
                      </TableCell>
                      <TableCell className="text-sm">{req.role}</TableCell>
                      <TableCell className="text-sm">
                        <div>{job?.title || "(sans titre)"}</div>
                        <div className="text-xs text-slate-500">
                          {est?.name} · {est?.city}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono font-semibold">
                        {formatAmount(req.amount_cents, req.currency)}
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={req.status} />
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {formatDateTimeShort(req.requested_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {req.status !== "paid" && req.status !== "rejected" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAction(req)}
                          >
                            {req.status === "requested"
                              ? "Valider"
                              : "Marquer payé"}
                          </Button>
                        ) : req.payment_reference ? (
                          <span className="text-xs text-slate-500">
                            {req.payment_reference}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-sm text-slate-600"
                  >
                    Aucune demande de facturation.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Traiter la demande</DialogTitle>
            <DialogDescription>
              {selectedRequest
                ? `${selectedRequest.partner_profiles?.display_name || shortId(selectedRequest.partner_user_id)} · ${selectedRequest.role} · ${formatAmount(selectedRequest.amount_cents, selectedRequest.currency)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Action</Label>
              <Select
                value={newStatus}
                onValueChange={(v) => setNewStatus(v as any)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approuver</SelectItem>
                  <SelectItem value="paid">Marquer payé</SelectItem>
                  <SelectItem value="rejected">Rejeter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newStatus === "paid" ? (
              <div className="space-y-1">
                <Label>Référence paiement (optionnel)</Label>
                <Input
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Virement #12345"
                />
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <Button
                className="flex-1 gap-2"
                variant={newStatus === "rejected" ? "destructive" : "default"}
                onClick={handleUpdate}
                disabled={updating}
              >
                {updating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : newStatus === "rejected" ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirmer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
