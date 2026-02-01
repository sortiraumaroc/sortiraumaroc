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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { ProReservationPatch, ReservationMessageTemplate } from "@/components/pro/reservations/ReservationDecisionDialog";

function templateSortKey(t: ReservationMessageTemplate): string {
  const owner = t.owner_type === "global" ? "0" : "1";
  return `${owner}:${(t.label ?? "").toLowerCase()}:${(t.code ?? "").toLowerCase()}`;
}

export function ReservationMessageDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  templates: ReservationMessageTemplate[];
  defaultTemplateCode?: string;
  loading?: boolean;
  onConfirm: (patch: ProReservationPatch) => Promise<void>;
}) {
  const { open, onOpenChange, title, description, templates, defaultTemplateCode, loading, onConfirm } = props;

  const activeTemplates = useMemo(() => {
    return [...(templates ?? [])]
      .filter((t) => !!t && typeof t === "object" && t.is_active !== false)
      .sort((a, b) => templateSortKey(a).localeCompare(templateSortKey(b), "fr"));
  }, [templates]);

  const [templateCode, setTemplateCode] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setTemplateCode(defaultTemplateCode ?? "");

    const defaultTemplate = (defaultTemplateCode ? activeTemplates.find((t) => t.code === defaultTemplateCode) : null) ?? null;
    setMessage(defaultTemplate?.body ?? "");
  }, [open, defaultTemplateCode, activeTemplates]);

  const template = useMemo(() => {
    if (!templateCode) return null;
    return activeTemplates.find((t) => t.code === templateCode) ?? null;
  }, [activeTemplates, templateCode]);

  const applyTemplate = (code: string) => {
    setTemplateCode(code);
    const t = activeTemplates.find((x) => x.code === code) ?? null;
    if (!t) return;

    setMessage((prev) => {
      const prevTrimmed = prev.trim();
      if (!prevTrimmed) return t.body;
      if (prevTrimmed === (template?.body ?? "").trim()) return t.body;
      return prev;
    });
  };

  const submit = async () => {
    const nextTemplateCode = templateCode.trim() ? templateCode.trim() : null;
    const msg = message.trim();

    const patch: ProReservationPatch = {
      template_code: nextTemplateCode,
    };

    if (msg) patch.pro_message = msg;

    setSubmitting(true);
    try {
      await onConfirm(patch);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
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
          </div>

          <div className="space-y-2">
            <Label>Message au client</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Écrire un message…"
              disabled={submitting || !!loading}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={submitting || !!loading} className="gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
