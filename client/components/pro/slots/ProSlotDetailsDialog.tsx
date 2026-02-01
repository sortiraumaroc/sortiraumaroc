import { Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import type { ProSlot } from "@/lib/pro/types";

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function copyToClipboard(text: string): Promise<void> {
  const value = String(text ?? "").trim();
  if (!value) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }

    toast({ title: "Copié", description: value });
  } catch {
    toast({ title: "Impossible", description: "Copie non autorisée sur ce navigateur." });
  }
}

function InfoRow(props: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-1 sm:gap-3 py-2 border-b border-slate-100 last:border-b-0">
      <div className="text-xs font-semibold text-slate-500">{props.label}</div>
      <div className={props.mono ? "font-mono text-sm text-slate-900 break-all" : "text-sm text-slate-900 break-words"}>{props.value}</div>
    </div>
  );
}

export function ProSlotDetailsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: ProSlot | null;
  waitlistCount: number;
}) {
  const slot = props.slot;
  const remaining = slot ? (slot as unknown as { remaining_capacity?: number | null }).remaining_capacity : null;
  const used = slot && typeof remaining === "number" ? Math.max(0, slot.capacity - remaining) : null;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle>Détail créneau</DialogTitle>
              <DialogDescription>Capacité, restant et indicateurs WL (liste d’attente).</DialogDescription>
            </div>

            {slot ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  void copyToClipboard(slot.id);
                }}
              >
                <Copy className="h-4 w-4" />
                Copier l’ID
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        {!slot ? (
          <div className="text-sm text-slate-600">Aucun créneau sélectionné.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-500">ID</div>
              <div className="font-mono text-sm text-slate-900 break-all">{slot.id}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className="bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">WL</Badge>
                <div className="text-sm text-slate-900">{props.waitlistCount} en attente</div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Créneau</div>
              <div className="px-4">
                <InfoRow label="Début" value={formatLocal(slot.starts_at)} />
                <InfoRow label="Fin" value={formatLocal(slot.ends_at)} />
                <InfoRow label="Service" value={slot.service_label || "Auto"} />
                <InfoRow label="Capacité" value={slot.capacity} />
                <InfoRow label="Occupé" value={used == null ? "—" : used} />
                <InfoRow label="Restant" value={typeof remaining === "number" ? remaining : "—"} />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
