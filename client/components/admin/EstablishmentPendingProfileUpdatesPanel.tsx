import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, RefreshCcw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  acceptAdminEstablishmentProfileChange,
  acceptAllAdminEstablishmentProfileUpdates,
  AdminApiError,
  listAdminEstablishmentPendingProfileUpdates,
  rejectAdminEstablishmentProfileChange,
  rejectAllAdminEstablishmentProfileUpdates,
  type EstablishmentPendingProfileUpdateAdmin,
  type EstablishmentProfileDraftChangeAdmin,
} from "@/lib/adminApi";

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function valuePreview(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.trim() ? value.trim() : "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} élément(s)`;
  if (typeof value === "object") return "(objet)";
  return String(value);
}

function truncate(text: string, max = 80): string {
  const t = (text ?? "").trim();
  if (!t) return "—";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Nom",
  universe: "Univers",
  subcategory: "Sous-catégorie",
  specialties: "Spécialités",
  city: "Ville",
  postal_code: "Code postal",
  region: "Région",
  country: "Pays",
  address: "Adresse",
  lat: "Latitude",
  lng: "Longitude",
  description_short: "Description courte",
  description_long: "Description longue",
  phone: "Téléphone",
  whatsapp: "WhatsApp",
  website: "Site web",
  social_links: "Réseaux sociaux",
  hours: "Horaires",
  tags: "Tags",
  amenities: "Équipements",
  cover_url: "Photo de couverture",
  gallery_urls: "Photos (galerie)",
  ambiance_tags: "Ambiances",
  extra: "Infos complémentaires",
  mix_experience: "Points forts",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function changeStatusBadge(status: string): JSX.Element {
  const s = (status ?? "").toLowerCase();
  const cls =
    s === "accepted"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "rejected"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-amber-50 text-amber-800 border-amber-200";
  const label = s === "accepted" ? "accepté" : s === "rejected" ? "refusé" : "pending";
  return <Badge className={cls}>{label}</Badge>;
}

type RejectDialogState =
  | { open: false }
  | {
      open: true;
      mode: "single" | "all";
      draftId: string;
      change?: EstablishmentProfileDraftChangeAdmin;
      reason: string;
      saving: boolean;
    };

export function EstablishmentPendingProfileUpdatesPanel(props: {
  adminKey?: string;
  establishmentId: string;
  onAfterDecision?: () => void;
}) {
  const [items, setItems] = useState<EstablishmentPendingProfileUpdateAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reject, setReject] = useState<RejectDialogState>({ open: false });

  const refresh = useCallback(async () => {
    if (!props.establishmentId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await listAdminEstablishmentPendingProfileUpdates(props.adminKey, props.establishmentId);
      setItems(res.items ?? []);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [props.adminKey, props.establishmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pendingDraft = items.length ? items[0] : null;

  const counts = useMemo(() => {
    if (!pendingDraft) return { total: 0, pending: 0 };
    const total = pendingDraft.changes.length;
    const pending = pendingDraft.changes.filter((c) => String(c.status).toLowerCase() === "pending").length;
    return { total, pending };
  }, [pendingDraft]);

  const doAcceptOne = async (draftId: string, changeId: string) => {
    setError(null);
    try {
      await acceptAdminEstablishmentProfileChange(props.adminKey, props.establishmentId, draftId, changeId);
      await refresh();
      props.onAfterDecision?.();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    }
  };

  const doAcceptAll = async (draftId: string) => {
    setError(null);
    try {
      await acceptAllAdminEstablishmentProfileUpdates(props.adminKey, props.establishmentId, draftId);
      await refresh();
      props.onAfterDecision?.();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    }
  };

  const confirmReject = async () => {
    if (reject.open === false) return;
    setError(null);
    setReject({ ...reject, saving: true });

    try {
      if (reject.mode === "single" && reject.change) {
        await rejectAdminEstablishmentProfileChange(
          props.adminKey,
          props.establishmentId,
          reject.draftId,
          reject.change.id,
          reject.reason.trim() || undefined,
        );
      } else {
        await rejectAllAdminEstablishmentProfileUpdates(
          props.adminKey,
          props.establishmentId,
          reject.draftId,
          reject.reason.trim() || undefined,
        );
      }

      setReject({ open: false });
      await refresh();
      props.onAfterDecision?.();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
      setReject({ ...reject, saving: false });
    }
  };

  const headerRight = pendingDraft ? (
    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
      <Button variant="outline" className="gap-2" onClick={() => void refresh()} disabled={loading}>
        <RefreshCcw className={loading ? "animate-spin" : ""} />
        Rafraîchir
      </Button>
      <Button
        variant="outline"
        className="gap-2"
        onClick={() => void doAcceptAll(pendingDraft.draft.id)}
        disabled={loading || counts.pending === 0}
      >
        <CheckCircle2 className="h-4 w-4" />
        Tout accepter
      </Button>
      <Button
        variant="destructive"
        className="gap-2"
        onClick={() =>
          setReject({ open: true, mode: "all", draftId: pendingDraft.draft.id, reason: "", saving: false })
        }
        disabled={loading || counts.pending === 0}
      >
        <XCircle className="h-4 w-4" />
        Tout refuser
      </Button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Button variant="outline" className="gap-2" onClick={() => void refresh()} disabled={loading}>
        <RefreshCcw className={loading ? "animate-spin" : ""} />
        Rafraîchir
      </Button>
    </div>
  );

  return (
    <Card className="border-slate-200">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-bold flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate">Modifications en attente</div>
            {pendingDraft ? (
              <div className="mt-1 text-xs font-normal text-slate-600">
                Demande du {formatLocal(pendingDraft.draft.created_at)} · Auteur :{" "}
                <span className="font-semibold">{pendingDraft.author.email ?? pendingDraft.author.user_id}</span>
                {counts.total ? ` · ${counts.pending}/${counts.total} à décider` : null}
              </div>
            ) : (
              <div className="mt-1 text-xs font-normal text-slate-600">Aucune modification en attente.</div>
            )}
          </div>

          <div className="shrink-0">{headerRight}</div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 pt-3">
        {error ? <div className="mb-3 text-sm text-destructive">{error}</div> : null}

        {pendingDraft ? (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Champ</TableHead>
                    <TableHead>Ancienne valeur</TableHead>
                    <TableHead>Nouvelle valeur</TableHead>
                    <TableHead>Demande</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingDraft.changes.map((c) => {
                    const status = String(c.status ?? "").toLowerCase();
                    const isPending = status === "pending";
                    const before = truncate(valuePreview(c.before), 90);
                    const after = truncate(valuePreview(c.after), 90);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-semibold">{fieldLabel(c.field)}</TableCell>
                        <TableCell className="text-sm text-slate-700" title={safeJson(c.before)}>
                          {before}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700" title={safeJson(c.after)}>
                          {after}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{formatLocal(c.created_at)}</TableCell>
                        <TableCell>{changeStatusBadge(status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void doAcceptOne(pendingDraft.draft.id, c.id)}
                              disabled={!isPending || loading}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Accepter
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-2"
                              onClick={() =>
                                setReject({ open: true, mode: "single", draftId: pendingDraft.draft.id, change: c, reason: "", saving: false })
                              }
                              disabled={!isPending || loading}
                            >
                              <XCircle className="h-4 w-4" />
                              Refuser
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile accordion */}
            <div className="md:hidden space-y-2">
              {pendingDraft.changes.map((c) => {
                const status = String(c.status ?? "").toLowerCase();
                const isPending = status === "pending";
                return (
                  <Collapsible key={c.id} className="rounded-md border border-slate-200">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="w-full p-3 flex items-center justify-between gap-3 text-left"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{fieldLabel(c.field)}</div>
                          <div className="text-xs text-slate-600 truncate">Demande du {formatLocal(c.created_at)}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {changeStatusBadge(status)}
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-3 pb-3 space-y-3">
                        <div className="grid grid-cols-1 gap-2">
                          <div>
                            <div className="text-xs font-semibold text-slate-500">Ancienne valeur</div>
                            <pre className="mt-1 whitespace-pre-wrap text-xs rounded-md bg-slate-50 border border-slate-200 p-2">
                              {safeJson(c.before)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-500">Nouvelle valeur</div>
                            <pre className="mt-1 whitespace-pre-wrap text-xs rounded-md bg-slate-50 border border-slate-200 p-2">
                              {safeJson(c.after)}
                            </pre>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            className="gap-2"
                            onClick={() => void doAcceptOne(pendingDraft.draft.id, c.id)}
                            disabled={!isPending || loading}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Accepter
                          </Button>
                          <Button
                            variant="destructive"
                            className="gap-2"
                            onClick={() =>
                              setReject({ open: true, mode: "single", draftId: pendingDraft.draft.id, change: c, reason: "", saving: false })
                            }
                            disabled={!isPending || loading}
                          >
                            <XCircle className="h-4 w-4" />
                            Refuser
                          </Button>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </>
        ) : null}

        <Dialog open={reject.open} onOpenChange={(open) => (!open ? setReject({ open: false }) : null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Refuser</DialogTitle>
              <DialogDescription>
                {reject.open && reject.mode === "single" && reject.change
                  ? `Refuser la modification “${fieldLabel(reject.change.field)}” ?`
                  : "Refuser toutes les modifications en attente ?"}
                <span className="block mt-1">Commentaire (optionnel)</span>
              </DialogDescription>
            </DialogHeader>

            {reject.open ? (
              <Textarea
                value={reject.reason}
                onChange={(e) => setReject({ ...reject, reason: e.target.value })}
                placeholder="Ex: photo non conforme, description trop longue…"
              />
            ) : null}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setReject({ open: false })} disabled={reject.open ? reject.saving : false}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={() => void confirmReject()} disabled={reject.open ? reject.saving : false}>
                {reject.open && reject.saving ? "Enregistrement…" : "Confirmer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
