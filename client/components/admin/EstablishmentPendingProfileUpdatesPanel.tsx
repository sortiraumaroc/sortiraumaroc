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

/** Extract a readable filename from a Supabase storage URL */
function filenameFromUrl(url: string): string {
  try {
    const parts = url.split("/");
    const last = parts[parts.length - 1];
    // Decode URL-encoded chars
    return decodeURIComponent(last || url);
  } catch {
    return url;
  }
}

/** Check if a string looks like a Supabase storage URL */
function isStorageUrl(v: unknown): v is string {
  return typeof v === "string" && (v.includes("supabase.co/storage/") || v.startsWith("https://") && v.includes("/object/public/"));
}

/** Day labels in French */
const DAY_LABELS: Record<string, string> = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche",
};

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Format hours object into a readable string */
function formatHoursPreview(hours: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const day of DAY_ORDER) {
    const dayData = hours[day];
    if (!dayData || typeof dayData !== "object") continue;
    const d = dayData as Record<string, unknown>;
    const label = DAY_LABELS[day] ?? day;

    // Check if "open" is defined
    const isOpen = d.open !== false;
    const ranges = Array.isArray(d.ranges) ? d.ranges : [];

    if (!isOpen || ranges.length === 0) {
      lines.push(`${label}: Fermé`);
    } else {
      const slots = ranges
        .map((r: unknown) => {
          if (typeof r === "object" && r !== null) {
            const rr = r as Record<string, unknown>;
            return `${rr.from ?? "?"}–${rr.to ?? "?"}`;
          }
          return "?";
        })
        .join(", ");
      lines.push(`${label}: ${slots}`);
    }
  }
  return lines.join("\n") || "(vide)";
}

/** Format social links into readable string */
function formatSocialLinks(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === "string" && val.trim()) {
      lines.push(`${key}: ${val.trim()}`);
    }
  }
  return lines.join("\n") || "(vide)";
}

function valuePreview(value: unknown, field?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    if (!value.trim()) return "—";
    // URLs → filename only
    if (isStorageUrl(value)) return filenameFromUrl(value);
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    // Gallery URLs → filenames
    if (value.length > 0 && value.every((v) => isStorageUrl(v))) {
      return value.map((v) => filenameFromUrl(v as string)).join(", ");
    }
    // String arrays (specialties, tags, etc.)
    if (value.length > 0 && value.every((v) => typeof v === "string")) {
      return (value as string[]).join(", ");
    }
    return `${value.length} élément(s)`;
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    // Hours object
    if (field === "hours") return formatHoursPreview(obj);
    // Social links
    if (field === "social_links") return formatSocialLinks(obj);
    // Extra / mix_experience → key: value
    const entries = Object.entries(obj).filter(([, v]) => v != null && v !== "");
    if (entries.length === 0) return "(vide)";
    return entries.map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
  }
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
  category: "Catégorie",
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
  email: "Email",
  website: "Site web",
  social_links: "Réseaux sociaux",
  hours: "Horaires",
  tags: "Tags",
  amenities: "Équipements",
  logo_url: "Logo",
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
    s === "accepted" || s === "approved"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "rejected"
        ? "bg-red-50 text-red-700 border-red-200"
        : s === "partial"
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-amber-50 text-amber-800 border-amber-200";
  const label =
    s === "accepted" || s === "approved" ? "Accepté"
    : s === "rejected" ? "Refusé"
    : s === "partial" ? "Partiel"
    : "En attente";
  return <Badge className={cls}>{label}</Badge>;
}

function draftStatusBadge(status: string): JSX.Element {
  const s = (status ?? "").toLowerCase();
  const cls =
    s === "approved"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : s === "rejected"
        ? "bg-red-100 text-red-800 border-red-300"
        : s === "partial"
          ? "bg-blue-100 text-blue-800 border-blue-300"
          : "bg-amber-100 text-amber-800 border-amber-300";
  const label =
    s === "approved" ? "Acceptée"
    : s === "rejected" ? "Refusée"
    : s === "partial" ? "Partiellement traitée"
    : "En attente";
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
  /** Track which individual change IDs have an action in progress */
  const [busyChangeIds, setBusyChangeIds] = useState<Set<string>>(new Set());
  const [busyAll, setBusyAll] = useState(false);

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

  // Get the most recent draft (pending first, then others)
  const sortedItems = useMemo(() => {
    if (!items.length) return [];
    // Sort: pending first, then by date descending
    return [...items].sort((a, b) => {
      const aIsPending = a.draft.status?.toLowerCase() === "pending";
      const bIsPending = b.draft.status?.toLowerCase() === "pending";
      if (aIsPending && !bIsPending) return -1;
      if (!aIsPending && bIsPending) return 1;
      return new Date(b.draft.created_at).getTime() - new Date(a.draft.created_at).getTime();
    });
  }, [items]);

  const currentDraft = sortedItems.length ? sortedItems[0] : null;
  const draftStatus = currentDraft?.draft.status?.toLowerCase() ?? "";
  const isPending = draftStatus === "pending";

  const counts = useMemo(() => {
    if (!currentDraft) return { total: 0, pending: 0, accepted: 0, rejected: 0 };
    const total = currentDraft.changes.length;
    const pending = currentDraft.changes.filter((c) => String(c.status).toLowerCase() === "pending").length;
    const accepted = currentDraft.changes.filter((c) => {
      const s = String(c.status).toLowerCase();
      return s === "accepted" || s === "approved";
    }).length;
    const rejected = currentDraft.changes.filter((c) => String(c.status).toLowerCase() === "rejected").length;
    return { total, pending, accepted, rejected };
  }, [currentDraft]);

  const doAcceptOne = async (draftId: string, changeId: string) => {
    setError(null);
    setBusyChangeIds((prev) => new Set(prev).add(changeId));
    try {
      await acceptAdminEstablishmentProfileChange(props.adminKey, props.establishmentId, draftId, changeId);
      await refresh();
      props.onAfterDecision?.();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setBusyChangeIds((prev) => { const next = new Set(prev); next.delete(changeId); return next; });
    }
  };

  const doAcceptAll = async (draftId: string) => {
    setError(null);
    setBusyAll(true);
    try {
      await acceptAllAdminEstablishmentProfileUpdates(props.adminKey, props.establishmentId, draftId);
      await refresh();
      props.onAfterDecision?.();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setBusyAll(false);
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

  const headerRight = currentDraft ? (
    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
      <Button variant="outline" className="gap-2" onClick={() => void refresh()} disabled={loading}>
        <RefreshCcw className={loading ? "animate-spin" : ""} />
        Rafraîchir
      </Button>
      {isPending && (
        <>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void doAcceptAll(currentDraft.draft.id)}
            disabled={loading || busyAll || counts.pending === 0}
          >
            {busyAll ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {busyAll ? "Traitement…" : "Tout accepter"}
          </Button>
          <Button
            variant="destructive"
            className="gap-2"
            onClick={() =>
              setReject({ open: true, mode: "all", draftId: currentDraft.draft.id, reason: "", saving: false })
            }
            disabled={loading || busyAll || counts.pending === 0}
          >
            <XCircle className="h-4 w-4" />
            Tout refuser
          </Button>
        </>
      )}
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
            <div className="flex items-center gap-2">
              <span className="truncate">Modifications du profil</span>
              {currentDraft && draftStatusBadge(currentDraft.draft.status ?? "pending")}
            </div>
            {currentDraft ? (
              <div className="mt-1 text-xs font-normal text-slate-600">
                Demande du {formatLocal(currentDraft.draft.created_at)} · Auteur :{" "}
                <span className="font-semibold">{currentDraft.author.email ?? currentDraft.author.user_id}</span>
                {isPending && counts.total ? ` · ${counts.pending}/${counts.total} à décider` : null}
                {!isPending && counts.total ? (
                  <span>
                    {" "}· {counts.accepted} accepté{counts.accepted > 1 ? "s" : ""}, {counts.rejected} refusé{counts.rejected > 1 ? "s" : ""}
                  </span>
                ) : null}
                {currentDraft.draft.reason && (
                  <span className="block mt-1 text-red-600">
                    Motif : {currentDraft.draft.reason}
                  </span>
                )}
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

        {currentDraft ? (
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
                    {isPending && <TableHead className="text-end">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentDraft.changes.map((c) => {
                    const status = String(c.status ?? "").toLowerCase();
                    const changeIsPending = status === "pending";
                    const before = truncate(valuePreview(c.before, c.field), 90);
                    const after = truncate(valuePreview(c.after, c.field), 90);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-semibold">{fieldLabel(c.field)}</TableCell>
                        <TableCell className="text-sm text-slate-700 whitespace-pre-line" title={valuePreview(c.before, c.field)}>
                          {before}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 whitespace-pre-line" title={valuePreview(c.after, c.field)}>
                          {after}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{formatLocal(c.created_at)}</TableCell>
                        <TableCell>{changeStatusBadge(status)}</TableCell>
                        {isPending && (
                          <TableCell className="text-end">
                            {busyChangeIds.has(c.id) ? (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                <RefreshCcw className="h-3.5 w-3.5 animate-spin" /> Traitement…
                              </span>
                            ) : (
                              <div className="flex gap-2 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2"
                                  onClick={() => void doAcceptOne(currentDraft.draft.id, c.id)}
                                  disabled={!changeIsPending || loading || busyAll || busyChangeIds.size > 0}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  Accepter
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="gap-2"
                                  onClick={() =>
                                    setReject({ open: true, mode: "single", draftId: currentDraft.draft.id, change: c, reason: "", saving: false })
                                  }
                                  disabled={!changeIsPending || loading || busyAll || busyChangeIds.size > 0}
                                >
                                  <XCircle className="h-4 w-4" />
                                  Refuser
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile accordion */}
            <div className="md:hidden space-y-2">
              {currentDraft.changes.map((c) => {
                const status = String(c.status ?? "").toLowerCase();
                const changeIsPending = status === "pending";
                return (
                  <Collapsible key={c.id} className="rounded-md border border-slate-200">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="w-full p-3 flex items-center justify-between gap-3 text-start"
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
                              {valuePreview(c.before, c.field)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-500">Nouvelle valeur</div>
                            <pre className="mt-1 whitespace-pre-wrap text-xs rounded-md bg-slate-50 border border-slate-200 p-2">
                              {valuePreview(c.after, c.field)}
                            </pre>
                          </div>
                        </div>

                        {isPending && (
                          <div className="flex flex-col gap-2">
                            <Button
                              variant="outline"
                              className="gap-2"
                              onClick={() => void doAcceptOne(currentDraft.draft.id, c.id)}
                              disabled={!changeIsPending || loading}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Accepter
                            </Button>
                            <Button
                              variant="destructive"
                              className="gap-2"
                              onClick={() =>
                                setReject({ open: true, mode: "single", draftId: currentDraft.draft.id, change: c, reason: "", saving: false })
                              }
                              disabled={!changeIsPending || loading}
                            >
                              <XCircle className="h-4 w-4" />
                              Refuser
                            </Button>
                          </div>
                        )}
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
