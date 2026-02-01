import { useEffect, useMemo, useState } from "react";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { ProSlot, Reservation, ReservationStatus } from "@/lib/pro/types";

export type ReservationMessageTemplate = {
  id: string;
  owner_type: "global" | "pro" | string;
  owner_id: string | null;
  code: string;
  label: string;
  body: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type ReservationDecisionMode = "refuse" | "waitlist";

export type ProReservationPatch = {
  status?: ReservationStatus;
  payment_status?: string;
  checked_in_at?: string | null;
  starts_at?: string;
  party_size?: number;
  slot_id?: string | null;
  refusal_reason_code?: string | null;
  refusal_reason_custom?: string | null;
  is_from_waitlist?: boolean;
  pro_message?: string;
  template_code?: string | null;
  meta_patch?: Record<string, unknown>;
  meta_delete_keys?: string[];
};

function templateSortKey(t: ReservationMessageTemplate): string {
  const owner = t.owner_type === "global" ? "0" : "1";
  return `${owner}:${(t.label ?? "").toLowerCase()}:${(t.code ?? "").toLowerCase()}`;
}

export function ReservationDecisionDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ReservationDecisionMode;
  reservation: Reservation | null;
  templates: ReservationMessageTemplate[];
  suggestedSlots?: ProSlot[];
  loading?: boolean;
  onConfirm: (patch: ProReservationPatch) => Promise<void>;
}) {
  const { open, onOpenChange, mode, reservation, templates, suggestedSlots, loading, onConfirm } = props;

  const activeTemplates = useMemo(() => {
    return [...(templates ?? [])]
      .filter((t) => !!t && typeof t === "object" && t.is_active !== false)
      .sort((a, b) => templateSortKey(a).localeCompare(templateSortKey(b), "fr"));
  }, [templates]);

  const [templateCode, setTemplateCode] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [refusalCode, setRefusalCode] = useState<string>("");
  const [refusalCustom, setRefusalCustom] = useState<string>("");
  const [selectedAlternativeStartAt, setSelectedAlternativeStartAt] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    // Reset on open
    setTemplateCode("");
    setMessage("");
    setRefusalCode("");
    setRefusalCustom("");
    setSelectedAlternativeStartAt("");
    setSubmitting(false);
  }, [open, mode, reservation?.id]);

  const title = mode === "refuse" ? "Refuser la réservation" : "Mettre en liste d’attente";
  const description =
    mode === "refuse"
      ? "Choisissez un message rapide (optionnel), ajustez le message, puis confirmez le refus."
      : "Choisissez un message rapide (optionnel) et informez le client que la demande passe en liste d’attente.";

  const template = useMemo(() => {
    if (!templateCode) return null;
    return activeTemplates.find((t) => t.code === templateCode) ?? null;
  }, [activeTemplates, templateCode]);

  const applyTemplate = (code: string) => {
    setTemplateCode(code);
    const t = activeTemplates.find((x) => x.code === code) ?? null;
    if (!t) return;

    // Only overwrite the message if it's empty or was a previous template.
    setMessage((prev) => {
      const prevTrimmed = prev.trim();
      if (!prevTrimmed) return t.body;
      if (prevTrimmed === (template?.body ?? "").trim()) return t.body;
      return prev;
    });

    if (mode === "refuse") {
      setRefusalCode((prev) => (prev ? prev : t.code));
    }
  };

  const canSubmit = !!reservation && !submitting && !loading;

  const submit = async () => {
    if (!reservation) return;

    const nextTemplateCode = templateCode.trim() ? templateCode.trim() : null;
    const msg = message.trim();

    const patch: ProReservationPatch = {
      status: mode === "refuse" ? "refused" : "waitlist",
      template_code: nextTemplateCode,
    };

    if (msg) patch.pro_message = msg;

    if (selectedAlternativeStartAt) {
      patch.meta_patch = {
        proposed_change: {
          starts_at: selectedAlternativeStartAt,
        },
      };
    }

    if (mode === "refuse") {
      const code = refusalCode.trim();
      patch.refusal_reason_code = code ? code : null;
      patch.refusal_reason_custom = refusalCustom.trim() ? refusalCustom.trim() : null;
    } else {
      patch.refusal_reason_code = null;
      patch.refusal_reason_custom = null;
    }

    setSubmitting(true);
    try {
      await onConfirm(patch);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const applyAlternative = (slot: ProSlot) => {
    const iso = slot?.starts_at ? String(slot.starts_at) : "";
    if (!iso) return;

    setSelectedAlternativeStartAt(iso);

    const fmt = new Date(iso);
    const label = Number.isFinite(fmt.getTime())
      ? fmt.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : iso;

    setMessage((prev) => {
      const base = prev.trim();
      const prefix = base ? `${base}\n\n` : "";
      return `${prefix}Créneau indisponible, voici une autre proposition : ${label}.`;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Message rapide</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={templateCode}
              onChange={(e) => applyTemplate(e.target.value)}
              disabled={submitting || !!loading}
            >
              <option value="">Aucun</option>
              {activeTemplates.map((t) => (
                <option key={t.id} value={t.code}>
                  {t.label} ({t.owner_type === "global" ? "Global" : "Pro"})
                </option>
              ))}
            </select>
            {template ? <div className="text-xs text-slate-600">Code: {template.code}</div> : null}
          </div>

          {mode === "refuse" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Motif (code)</Label>
                <Input
                  value={refusalCode}
                  onChange={(e) => setRefusalCode(e.target.value)}
                  placeholder="ex: full, closed…"
                  disabled={submitting || !!loading}
                />
                <div className="text-xs text-slate-600">Visible côté admin et utile pour la statistique.</div>
              </div>
              <div className="space-y-2">
                <Label>Motif personnalisé</Label>
                <Input
                  value={refusalCustom}
                  onChange={(e) => setRefusalCustom(e.target.value)}
                  placeholder="ex: privatisation exceptionnelle"
                  disabled={submitting || !!loading}
                />
                <div className="text-xs text-slate-600">Visible côté client (si affiché).</div>
              </div>
            </div>
          ) : null}

          {suggestedSlots && suggestedSlots.length ? (
            <div className="space-y-2">
              <Label>Horaires alternatifs</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestedSlots.slice(0, 4).map((s) => {
                  const d = new Date(s.starts_at);
                  const label = Number.isFinite(d.getTime())
                    ? d.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                    : s.starts_at;
                  const remaining = (s as unknown as { remaining_capacity?: unknown }).remaining_capacity;
                  const remainingLabel = typeof remaining === "number" ? `• ${remaining} places` : "";

                  return (
                    <Button
                      key={s.id}
                      type="button"
                      variant={selectedAlternativeStartAt === s.starts_at ? "default" : "outline"}
                      className="justify-start"
                      onClick={() => applyAlternative(s)}
                      disabled={submitting || !!loading}
                    >
                      {label} {remainingLabel}
                    </Button>
                  );
                })}
              </div>
              <div className="text-xs text-slate-600">Cliquer sur un horaire ajoute une proposition au message.</div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Message au client</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                mode === "refuse"
                  ? "Ex: Désolé, nous sommes complets sur ce créneau."
                  : "Ex: Nous sommes complets, mais votre demande est en liste d’attente."
              }
              disabled={submitting || !!loading}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit} className="gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
