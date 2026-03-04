import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCcw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";

// =============================================================================
// Formatters & helpers (unchanged from original)
// =============================================================================

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

/** Extract a readable filename from a Supabase storage URL */
function filenameFromUrl(url: string): string {
  try {
    const parts = url.split("/");
    const last = parts[parts.length - 1];
    return decodeURIComponent(last || url);
  } catch {
    return url;
  }
}

/** Check if a string looks like a Supabase storage URL */
function isStorageUrl(v: unknown): v is string {
  return typeof v === "string" && (v.includes("supabase.co/storage/") || (v.startsWith("https://") && v.includes("/object/public/")));
}

/** Day labels in French */
const DAY_LABELS: Record<string, string> = {
  monday: "Lundi", tuesday: "Mardi", wednesday: "Mercredi", thursday: "Jeudi",
  friday: "Vendredi", saturday: "Samedi", sunday: "Dimanche",
};
const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function formatHoursPreview(hours: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const day of DAY_ORDER) {
    const dayData = hours[day];
    if (!dayData || typeof dayData !== "object") continue;
    const d = dayData as Record<string, unknown>;
    const label = DAY_LABELS[day] ?? day;
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
    if (isStorageUrl(value)) return filenameFromUrl(value);
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((v) => isStorageUrl(v))) {
      return value.map((v) => filenameFromUrl(v as string)).join(", ");
    }
    if (value.length > 0 && value.every((v) => typeof v === "string")) {
      return (value as string[]).join(", ");
    }
    return `${value.length} élément(s)`;
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (field === "hours") return formatHoursPreview(obj);
    if (field === "social_links") return formatSocialLinks(obj);
    const entries = Object.entries(obj).filter(([, v]) => v != null && v !== "");
    if (entries.length === 0) return "(vide)";
    return entries.map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
  }
  return String(value);
}

const FIELD_LABELS: Record<string, string> = {
  name: "Nom", universe: "Univers", category: "Catégorie", subcategory: "Sous-catégorie",
  specialties: "Spécialités", city: "Ville", postal_code: "Code postal", region: "Région",
  country: "Pays", address: "Adresse", lat: "Latitude", lng: "Longitude",
  description_short: "Description courte", description_long: "Description longue",
  phone: "Téléphone", whatsapp: "WhatsApp", email: "Email", website: "Site web",
  social_links: "Réseaux sociaux", hours: "Horaires", tags: "Tags", amenities: "Équipements",
  logo_url: "Logo", cover_url: "Photo de couverture", gallery_urls: "Photos (galerie)",
  ambiance_tags: "Ambiances", extra: "Infos complémentaires", mix_experience: "Points forts",
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
        : s === "partial" || s === "partially_accepted"
          ? "bg-blue-100 text-blue-800 border-blue-300"
          : "bg-amber-100 text-amber-800 border-amber-300";
  const label =
    s === "approved" ? "Acceptée"
    : s === "rejected" ? "Refusée"
    : s === "partial" || s === "partially_accepted" ? "Partiellement traitée"
    : "En attente";
  return <Badge className={cls}>{label}</Badge>;
}

// =============================================================================
// Editing helpers for the review dialog
// =============================================================================

type FieldEditMode = "input" | "textarea" | "json" | "csv" | "readonly" | "number";

function getFieldEditMode(field: string): FieldEditMode {
  if (["logo_url", "cover_url", "gallery_urls"].includes(field)) return "readonly";
  if (["lat", "lng"].includes(field)) return "number";
  if (["description_short", "description_long"].includes(field)) return "textarea";
  if (["hours", "social_links", "extra"].includes(field)) return "json";
  if (["specialties", "tags", "amenities", "ambiance_tags", "mix_experience"].includes(field)) return "csv";
  return "input";
}

function serializeForEdit(value: unknown, field: string): string {
  const mode = getFieldEditMode(field);
  if (value === null || value === undefined) return "";
  if (mode === "json") {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  if (mode === "csv" && Array.isArray(value)) return value.join(", ");
  return String(value);
}

function deserializeFromEdit(str: string, field: string): unknown {
  const mode = getFieldEditMode(field);
  if (mode === "json") {
    try { return JSON.parse(str); } catch { return str; }
  }
  if (mode === "csv") return str.split(",").map((s) => s.trim()).filter(Boolean);
  if (mode === "number") {
    const n = parseFloat(str);
    return isNaN(n) ? str : n;
  }
  return str;
}

// =============================================================================
// Types
// =============================================================================

type ReviewDialogState =
  | { open: false }
  | {
      open: true;
      change: EstablishmentProfileDraftChangeAdmin;
      draftId: string;
      editedValueStr: string;
      isEdited: boolean;
      saving: boolean;
      rejectMode: false;
    }
  | {
      open: true;
      change: EstablishmentProfileDraftChangeAdmin;
      draftId: string;
      editedValueStr: string;
      isEdited: boolean;
      saving: boolean;
      rejectMode: true;
      reason: string;
    };

type BulkRejectState =
  | { open: false }
  | { open: true; draftId: string; reason: string; saving: boolean };

// =============================================================================
// Component
// =============================================================================

export function EstablishmentPendingProfileUpdatesPanel(props: {
  adminKey?: string;
  establishmentId: string;
  onAfterDecision?: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<EstablishmentPendingProfileUpdateAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const [review, setReview] = useState<ReviewDialogState>({ open: false });
  const [bulkReject, setBulkReject] = useState<BulkRejectState>({ open: false });
  const [listDialogOpen, setListDialogOpen] = useState(false);

  // ---- Data fetch ----

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

  useEffect(() => { void refresh(); }, [refresh]);

  // ---- Derived state ----

  const sortedItems = useMemo(() => {
    if (!items.length) return [];
    return [...items].sort((a, b) => {
      const aP = a.draft.status?.toLowerCase() === "pending";
      const bP = b.draft.status?.toLowerCase() === "pending";
      if (aP && !bP) return -1;
      if (!aP && bP) return 1;
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

  // ---- Review dialog handlers ----

  const openReviewDialog = useCallback((change: EstablishmentProfileDraftChangeAdmin, draftId: string) => {
    setReview({
      open: true,
      change,
      draftId,
      editedValueStr: serializeForEdit(change.after, change.field),
      isEdited: false,
      saving: false,
      rejectMode: false,
    });
  }, []);

  const doAcceptFromDialog = useCallback(async () => {
    if (!review.open) return;
    setReview({ ...review, saving: true });
    try {
      const correctedValue = review.isEdited
        ? deserializeFromEdit(review.editedValueStr, review.change.field)
        : undefined;
      await acceptAdminEstablishmentProfileChange(
        props.adminKey,
        props.establishmentId,
        review.draftId,
        review.change.id,
        correctedValue,
      );
      toast({ title: "Modification acceptée", description: fieldLabel(review.change.field) });
      setReview({ open: false });
      await refresh();
      props.onAfterDecision?.();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
      setReview({ ...review, saving: false });
    }
  }, [review, props.adminKey, props.establishmentId, refresh, toast, props.onAfterDecision]);

  const doRejectFromDialog = useCallback(async () => {
    if (!review.open || !review.rejectMode) return;
    setReview({ ...review, saving: true });
    try {
      await rejectAdminEstablishmentProfileChange(
        props.adminKey,
        props.establishmentId,
        review.draftId,
        review.change.id,
        review.reason?.trim() || undefined,
      );
      toast({ title: "Modification refusée", description: fieldLabel(review.change.field) });
      setReview({ open: false });
      await refresh();
      props.onAfterDecision?.();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
      setReview({ ...review, saving: false });
    }
  }, [review, props.adminKey, props.establishmentId, refresh, toast, props.onAfterDecision]);

  // ---- Bulk handlers ----

  const doAcceptAll = async (draftId: string) => {
    setError(null);
    setBusyAll(true);
    try {
      await acceptAllAdminEstablishmentProfileUpdates(props.adminKey, props.establishmentId, draftId);
      toast({ title: "Toutes les modifications acceptées" });
      await refresh();
      props.onAfterDecision?.();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setBusyAll(false);
    }
  };

  const confirmBulkReject = async () => {
    if (!bulkReject.open) return;
    setError(null);
    setBulkReject({ ...bulkReject, saving: true });
    try {
      await rejectAllAdminEstablishmentProfileUpdates(
        props.adminKey,
        props.establishmentId,
        bulkReject.draftId,
        bulkReject.reason.trim() || undefined,
      );
      toast({ title: "Toutes les modifications refusées" });
      setBulkReject({ open: false });
      await refresh();
      props.onAfterDecision?.();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
      setBulkReject({ ...bulkReject, saving: false });
    }
  };

  // ---- Render ----

  return (
    <>
    <Card className="border-slate-200">
      {/* ---- Single compact line ---- */}
      <CardContent className="p-3">
        {!currentDraft ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Modifications du profil — aucune en attente</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => void refresh()} disabled={loading}>
              <RefreshCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3 hover:bg-slate-50 rounded-md px-2 py-1.5 -mx-1 transition-colors text-start"
            onClick={() => setListDialogOpen(true)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-slate-900">Modifications du profil</span>
              {draftStatusBadge(currentDraft.draft.status ?? "pending")}
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium">
                {counts.total}
              </Badge>
              {isPending && counts.pending > 0 && (
                <span className="text-xs text-amber-600 font-medium">{counts.pending} en attente</span>
              )}
            </div>
            <span className="text-xs text-slate-400 shrink-0">Cliquer pour voir →</span>
          </button>
        )}
        {error ? <div className="mt-2 text-sm text-destructive">{error}</div> : null}
      </CardContent>
    </Card>

      {/* ---- List Dialog (all changes + actions) ---- */}
      <Dialog open={listDialogOpen} onOpenChange={setListDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Modifications du profil
              {currentDraft && draftStatusBadge(currentDraft.draft.status ?? "pending")}
            </DialogTitle>
            {currentDraft && (
              <DialogDescription>
                Demande du {formatLocal(currentDraft.draft.created_at)} · Auteur :{" "}
                <span className="font-semibold">{currentDraft.author.email ?? currentDraft.author.user_id}</span>
                {isPending && counts.total ? ` · ${counts.pending}/${counts.total} à décider` : null}
                {!isPending && counts.total ? (
                  <span>
                    {" "}· {counts.accepted} accepté{counts.accepted > 1 ? "s" : ""}, {counts.rejected} refusé{counts.rejected > 1 ? "s" : ""}
                  </span>
                ) : null}
              </DialogDescription>
            )}
          </DialogHeader>

          {/* Action buttons */}
          {currentDraft && isPending && counts.pending > 0 && (
            <div className="flex items-center gap-2 pb-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => void doAcceptAll(currentDraft.draft.id)}
                disabled={loading || busyAll}
              >
                {busyAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Tout accepter
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() =>
                  setBulkReject({ open: true, draftId: currentDraft.draft.id, reason: "", saving: false })
                }
                disabled={loading || busyAll}
              >
                <XCircle className="h-3.5 w-3.5" />
                Tout refuser
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs ml-auto" onClick={() => void refresh()} disabled={loading}>
                <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Rafraîchir
              </Button>
            </div>
          )}

          {/* Changes list */}
          {currentDraft ? (
            <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {currentDraft.changes.map((c) => {
                const status = String(c.status ?? "").toLowerCase();
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openReviewDialog(c, currentDraft.draft.id)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-start"
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-3">
                      <span className="font-medium text-sm text-slate-900 truncate">
                        {fieldLabel(c.field)}
                      </span>
                      <span className="text-xs text-slate-400 shrink-0 hidden sm:inline">
                        {formatLocal(c.created_at)}
                      </span>
                    </div>
                    <div className="shrink-0">
                      {changeStatusBadge(status)}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ---- Review Dialog ---- */}
      <Dialog open={review.open} onOpenChange={(open) => { if (!open) setReview({ open: false }); }}>
        {review.open && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{fieldLabel(review.change.field)}</DialogTitle>
                <DialogDescription>
                  Modification demandée le {formatLocal(review.change.created_at)}
                </DialogDescription>
              </DialogHeader>

              {/* Before value */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Ancienne valeur
                </label>
                <pre className="mt-1 whitespace-pre-wrap text-sm rounded-md bg-red-50 border border-red-100 p-3 max-h-48 overflow-y-auto">
                  {valuePreview(review.change.before, review.change.field) || "—"}
                </pre>
              </div>

              {/* After value (editable or readonly) */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                  Nouvelle valeur
                  {review.isEdited && (
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">Modifiée</Badge>
                  )}
                </label>

                {(() => {
                  const changeIsPending = String(review.change.status).toLowerCase() === "pending";
                  const mode = getFieldEditMode(review.change.field);

                  // Read-only fields (URLs) or already decided
                  if (mode === "readonly" || !changeIsPending) {
                    return (
                      <div>
                        <pre className="mt-1 whitespace-pre-wrap text-sm rounded-md bg-emerald-50 border border-emerald-100 p-3 max-h-48 overflow-y-auto">
                          {valuePreview(review.change.after, review.change.field) || "—"}
                        </pre>
                        {/* Image preview for URLs */}
                        {isStorageUrl(review.change.after) && (
                          <img
                            src={String(review.change.after)}
                            className="h-20 rounded-md mt-2 object-cover"
                            alt="Aperçu"
                          />
                        )}
                      </div>
                    );
                  }

                  // Editable fields
                  if (mode === "number") {
                    return (
                      <Input
                        type="number"
                        step="any"
                        className="mt-1"
                        value={review.editedValueStr}
                        onChange={(e) =>
                          setReview({ ...review, editedValueStr: e.target.value, isEdited: true })
                        }
                      />
                    );
                  }

                  if (mode === "input") {
                    return (
                      <Input
                        className="mt-1"
                        value={review.editedValueStr}
                        onChange={(e) =>
                          setReview({ ...review, editedValueStr: e.target.value, isEdited: true })
                        }
                      />
                    );
                  }

                  // textarea, json, csv
                  return (
                    <div>
                      <Textarea
                        className={`mt-1 ${mode === "json" ? "font-mono text-xs" : "text-sm"}`}
                        rows={mode === "json" ? 10 : mode === "csv" ? 3 : 5}
                        value={review.editedValueStr}
                        onChange={(e) =>
                          setReview({ ...review, editedValueStr: e.target.value, isEdited: true })
                        }
                      />
                      {mode === "json" && (
                        <p className="text-xs text-slate-400 mt-1">Format JSON attendu</p>
                      )}
                      {mode === "csv" && (
                        <p className="text-xs text-slate-400 mt-1">Séparez les valeurs par des virgules</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Reject reason sub-section */}
              {review.rejectMode && (
                <div className="border-t pt-3 space-y-2">
                  <label className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                    Motif du refus (optionnel)
                  </label>
                  <Textarea
                    value={review.reason}
                    onChange={(e) => setReview({ ...review, reason: e.target.value })}
                    placeholder="Ex: photo non conforme, description trop longue…"
                    rows={3}
                  />
                </div>
              )}

              {/* Footer actions */}
              {String(review.change.status).toLowerCase() === "pending" ? (
                <DialogFooter className="gap-2 pt-2">
                  {review.rejectMode ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setReview({ ...review, rejectMode: false })}
                        disabled={review.saving}
                      >
                        Annuler
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => void doRejectFromDialog()}
                        disabled={review.saving}
                        className="gap-2"
                      >
                        {review.saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Confirmer le refus
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        className="gap-2 text-red-700 border-red-300 hover:bg-red-50"
                        onClick={() =>
                          setReview({ ...review, rejectMode: true, reason: "" })
                        }
                        disabled={review.saving}
                      >
                        <XCircle className="h-4 w-4" />
                        Refuser
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        onClick={() => void doAcceptFromDialog()}
                        disabled={review.saving}
                      >
                        {review.saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {review.isEdited ? "Accepter (valeur corrigée)" : "Accepter"}
                      </Button>
                    </>
                  )}
                </DialogFooter>
              ) : (
                <DialogFooter className="pt-2">
                  <Button variant="outline" onClick={() => setReview({ open: false })}>
                    Fermer
                  </Button>
                </DialogFooter>
              )}
            </DialogContent>
          )}
        </Dialog>

        {/* ---- Bulk Reject Dialog ---- */}
        <Dialog open={bulkReject.open} onOpenChange={(open) => { if (!open) setBulkReject({ open: false }); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Tout refuser</DialogTitle>
              <DialogDescription>
                Refuser toutes les modifications en attente ?
                <span className="block mt-1">Commentaire (optionnel)</span>
              </DialogDescription>
            </DialogHeader>
            {bulkReject.open && (
              <Textarea
                value={bulkReject.reason}
                onChange={(e) => setBulkReject({ ...bulkReject, reason: e.target.value })}
                placeholder="Ex: photo non conforme, description trop longue…"
              />
            )}
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setBulkReject({ open: false })}
                disabled={bulkReject.open ? bulkReject.saving : false}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={() => void confirmBulkReject()}
                disabled={bulkReject.open ? bulkReject.saving : false}
              >
                {bulkReject.open && bulkReject.saving ? "Enregistrement…" : "Confirmer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </>
  );
}
