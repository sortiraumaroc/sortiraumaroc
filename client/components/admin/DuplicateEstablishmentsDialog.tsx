import { useCallback, useEffect, useState } from "react";
import { Trash2, ExternalLink, Loader2, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AdminApiError,
  DuplicateGroup,
  DuplicateItem,
  detectDuplicateEstablishments,
  deleteEstablishment,
} from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  active: "Actif",
  suspended: "Désactivé",
  rejected: "Rejeté",
};

function statusBadgeVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active": return "default";
    case "pending": return "secondary";
    case "rejected": return "destructive";
    default: return "outline";
  }
}

function completenessColor(score: number): string {
  if (score >= 60) return "bg-emerald-500";
  if (score >= 30) return "bg-amber-500";
  return "bg-red-500";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminKey?: string;
  onDeleted?: () => void;
}

export function DuplicateEstablishmentsDialog({ open, onOpenChange, adminKey, onDeleted }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);

  // Track which items are checked for deletion
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await detectDuplicateEstablishments(adminKey);
      setGroups(res.groups);
      setChecked(new Set());
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur lors de la détection des doublons");
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Auto-select duplicates with less data (skip the first/best one in each group) */
  const autoSelectLessComplete = () => {
    const next = new Set<string>();
    for (const group of groups) {
      // items are already sorted richest-first by the server
      for (let i = 1; i < group.items.length; i++) {
        next.add(group.items[i].id);
      }
    }
    setChecked(next);
  };

  const handleDeleteSelected = async () => {
    if (checked.size === 0) return;
    setDeleting(true);
    setError(null);

    let successCount = 0;
    let failCount = 0;

    for (const id of checked) {
      try {
        await deleteEstablishment(adminKey, id);
        successCount++;
      } catch {
        failCount++;
      }
    }

    setDeleting(false);

    if (successCount > 0) {
      toast({
        title: `${successCount} doublon(s) supprimé(s)`,
        description: failCount > 0 ? `${failCount} erreur(s) rencontrée(s)` : undefined,
      });
      onDeleted?.();
      // Reload to refresh the list
      void load();
    } else {
      setError("Aucun doublon n'a pu être supprimé.");
    }
  };

  const totalDuplicates = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Doublons détectés
          </DialogTitle>
          <DialogDescription>
            {loading
              ? "Analyse en cours..."
              : groups.length === 0
                ? "Aucun doublon trouvé."
                : `${groups.length} groupe(s) de doublons trouvé(s) (${totalDuplicates} fiches au total). Cochez celles à supprimer.`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : groups.length > 0 ? (
          <>
            <div className="flex items-center justify-between gap-2 px-1">
              <Button variant="outline" size="sm" onClick={autoSelectLessComplete}>
                Auto-sélectionner les moins complets
              </Button>
              {checked.size > 0 && (
                <span className="text-sm text-slate-600">
                  {checked.size} sélectionné(s)
                </span>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pe-1" style={{ maxHeight: "calc(90vh - 220px)" }}>
              <div className="space-y-6 pb-2">
                {groups.map((group, gi) => (
                  <div key={gi} className="rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-100/60 rounded-t-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-800">{group.name}</span>
                        {group.city && (
                          <Badge variant="outline" className="text-xs">{group.city}</Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">{group.items.length} fiches</Badge>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-200">
                      {group.items.map((item, idx) => {
                        const isBest = idx === 0;
                        const isChecked = checked.has(item.id);

                        return (
                          <div
                            key={item.id}
                            className={`px-4 py-3 flex items-center gap-3 transition ${
                              isChecked ? "bg-red-50/60" : isBest ? "bg-emerald-50/40" : ""
                            }`}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleCheck(item.id)}
                              disabled={deleting}
                            />

                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium truncate">
                                  {item.name ?? item.id}
                                </span>
                                <Badge variant={statusBadgeVariant(item.status)} className="text-[10px]">
                                  {STATUS_LABELS[item.status ?? ""] ?? item.status ?? "—"}
                                </Badge>
                                {isBest && (
                                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                                    Plus complet
                                  </Badge>
                                )}
                              </div>

                              <div className="flex items-center gap-3">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                                        <Progress
                                          value={item.completeness}
                                          className="h-2 flex-1"
                                          style={{
                                            // Override indicator color based on score
                                          }}
                                        />
                                        <span className={`text-xs font-bold ${
                                          item.completeness >= 60 ? "text-emerald-600" :
                                          item.completeness >= 30 ? "text-amber-600" : "text-red-600"
                                        }`}>
                                          {item.completeness}%
                                        </span>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{item.filledFields}/{item.totalFields} champs remplis</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <span className="text-xs text-slate-500">
                                  {item.filledFields}/{item.totalFields} champs
                                </span>
                                <span className="text-xs text-slate-400">
                                  {formatDate(item.created_at)}
                                </span>
                              </div>
                            </div>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={`/admin/establishments/${encodeURIComponent(item.id)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>Voir la fiche</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Fermer
          </Button>
          {groups.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteSelected()}
              disabled={checked.size === 0 || deleting}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {deleting
                ? "Suppression..."
                : `Supprimer (${checked.size})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
