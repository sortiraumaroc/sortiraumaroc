import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Eye, ExternalLink, RefreshCcw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  AdminApiError,
  type ModerationQueueItem,
  type ModerationQueueStatus,
  approveModeration,
  listModerationQueue,
  rejectModeration,
} from "@/lib/adminApi";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function statusBadgeVariant(status: ModerationQueueStatus): "default" | "secondary" | "destructive" | "outline" {
  const v = (status || "").toString().toLowerCase();
  if (v === "approved") return "default";
  if (v === "rejected") return "destructive";
  if (v === "pending") return "secondary";
  return "outline";
}

type RejectDialogState =
  | { open: false }
  | { open: true; item: ModerationQueueItem; reason: string; saving: boolean };

type DetailsDialogState = { open: false } | { open: true; item: ModerationQueueItem };

function safePrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function canGoToEstablishment(item: ModerationQueueItem): boolean {
  return (item.entity_type ?? "").toString().toLowerCase() === "establishment" && !!item.entity_id;
}

function shouldDisableApprove(item: ModerationQueueItem): boolean {
  return (item.status ?? "").toString() === "approved";
}

function shouldDisableReject(item: ModerationQueueItem): boolean {
  return (item.status ?? "").toString() === "rejected";
}

export function ModerationQueuePanel(props: { adminKey?: string }) {
  const [status, setStatus] = useState<ModerationQueueStatus>("pending");
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reject, setReject] = useState<RejectDialogState>({ open: false });
  const [details, setDetails] = useState<DetailsDialogState>({ open: false });

  const header = useMemo(() => {
    const s = status.toString();
    if (s === "pending") return "En attente";
    if (s === "approved") return "Approuvés";
    if (s === "rejected") return "Rejetés";
    return s;
  }, [status]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listModerationQueue(props.adminKey, status);
      setItems(res.items);
    } catch (e) {
      if (e instanceof AdminApiError) {
        setError(e.message);
      } else {
        setError("Erreur inattendue");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, props.adminKey]);

  const doApprove = async (id: string) => {
    setError(null);
    try {
      await approveModeration(props.adminKey, id);
      await refresh();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    }
  };

  const doReject = async () => {
    if (reject.open === false) return;
    const reason = reject.reason.trim();
    if (!reason) {
      setError("Le motif est requis");
      return;
    }

    setReject({ ...reject, saving: true });
    setError(null);

    try {
      await rejectModeration(props.adminKey, reject.item.id, reason);
      setReject({ open: false });
      await refresh();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
      setReject({ ...reject, saving: false });
    }
  };

  return (
    <div className="rounded-lg border-2 border-slate-200 bg-white">
      <div className="p-4 md:p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Modération</h2>
          <div className="text-sm text-slate-600">{header}</div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Select value={status.toString()} onValueChange={(v) => setStatus(v)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" className="gap-2" onClick={() => void refresh()} disabled={loading}>
            <RefreshCcw className={loading ? "animate-spin" : ""} />
            Rafraîchir
          </Button>
        </div>
      </div>

      {error && <div className="px-4 md:px-6 py-3 text-sm text-destructive">{error}</div>}

      <div className="p-4 md:p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Créé</TableHead>
              <TableHead>Décidé</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Motif</TableHead>
              <TableHead className="text-end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const st = item.status ?? "";
              const reason = (item.reason ?? "").toString();
              const canSeeEst = canGoToEstablishment(item);
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-semibold">{item.entity_type}</TableCell>
                  <TableCell className="text-sm text-slate-700">{(item.action ?? "").toString() || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{item.entity_id}</TableCell>
                  <TableCell className="text-sm text-slate-600">{formatDate(item.created_at)}</TableCell>
                  <TableCell className="text-sm text-slate-600">{formatDate(item.decided_at)}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(st)}>{st.toString()}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {reason ? <span title={reason}>{reason.length > 48 ? `${reason.slice(0, 48)}…` : reason}</span> : "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex flex-col sm:flex-row gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => setDetails({ open: true, item })}
                      >
                        <Eye className="h-4 w-4" />
                        Détails
                      </Button>

                      {canSeeEst ? (
                        <Button size="sm" variant="outline" asChild className="gap-2">
                          <Link to={`/admin/establishments/${encodeURIComponent(item.entity_id ?? "")}`}>
                            <ExternalLink className="h-4 w-4" />
                            Établissement
                          </Link>
                        </Button>
                      ) : null}

                      <Button
                        size="sm"
                        className="gap-2"
                        onClick={() => void doApprove(item.id)}
                        disabled={loading || shouldDisableApprove(item)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approuver
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-2"
                        onClick={() => setReject({ open: true, item, reason: "", saving: false })}
                        disabled={loading || shouldDisableReject(item)}
                      >
                        <XCircle className="h-4 w-4" />
                        Rejeter
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

            {!items.length && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-slate-600">
                  Aucun élément.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={reject.open}
        onOpenChange={(open) => {
          if (!open) setReject({ open: false });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter</DialogTitle>
            <DialogDescription>Indiquez le motif de rejet (obligatoire).</DialogDescription>
          </DialogHeader>

          {reject.open && (
            <Textarea
              value={reject.reason}
              onChange={(e) => setReject({ ...reject, reason: e.target.value })}
              placeholder="Motif de rejet"
            />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReject({ open: false })} disabled={reject.open && reject.saving}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={() => void doReject()} disabled={reject.open === false || reject.saving}>
              {reject.open && reject.saving ? "En cours..." : "Rejeter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={details.open}
        onOpenChange={(open) => {
          if (!open) setDetails({ open: false });
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détail de modération</DialogTitle>
            <DialogDescription>{details.open ? `ID: ${details.item.id}` : ""}</DialogDescription>
          </DialogHeader>

          {details.open ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs font-semibold text-slate-500">Type</div>
                  <div className="font-medium text-slate-900">{details.item.entity_type}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Action</div>
                  <div className="font-medium text-slate-900">{(details.item.action ?? "").toString() || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Entity ID</div>
                  <div className="font-mono text-xs text-slate-900">{details.item.entity_id ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Statut</div>
                  <div>
                    <Badge variant={statusBadgeVariant(details.item.status ?? "")}>{(details.item.status ?? "").toString()}</Badge>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-500 mb-2">Payload</div>
                <pre className="max-h-[420px] overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900">
                  {safePrettyJson(details.item.payload)}
                </pre>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetails({ open: false })}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
