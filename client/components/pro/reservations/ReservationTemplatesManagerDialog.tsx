import { useEffect, useMemo, useState } from "react";

import { HelpCircle, Loader2, Lock, Pencil, Plus, Save } from "lucide-react";

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { ReservationMessageTemplate } from "@/components/pro/reservations/ReservationDecisionDialog";

type EditableTemplate = ReservationMessageTemplate & {
  can_edit: boolean;
};

function sortKey(t: ReservationMessageTemplate): string {
  // Pro templates first (modifiable), then global
  const owner = t.owner_type === "pro" ? "0" : "1";
  return `${owner}:${(t.label ?? "").toLowerCase()}:${(t.code ?? "").toLowerCase()}`;
}

// Generate a slug from a label (for auto-generating codes)
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 30);
}

export function ReservationTemplatesManagerDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: ReservationMessageTemplate[];
  onCreate: (data: { code: string; label: string; body: string; is_active: boolean }) => Promise<void>;
  onUpdate: (args: { templateId: string; patch: { code?: string; label?: string; body?: string; is_active?: boolean } }) => Promise<void>;
}) {
  const { open, onOpenChange, templates, onCreate, onUpdate } = props;

  const items: EditableTemplate[] = useMemo(() => {
    const list = (templates ?? []).filter(Boolean) as ReservationMessageTemplate[];
    return [...list]
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b), "fr"))
      .map((t) => ({ ...t, can_edit: t.owner_type === "pro" }));
  }, [templates]);

  const [selectedId, setSelectedId] = useState<string>("");
  const selected = useMemo(() => items.find((t) => t.id === selectedId) ?? null, [items, selectedId]);

  const [mode, setMode] = useState<"edit" | "create">("edit");

  const [form, setForm] = useState({
    code: "",
    label: "",
    body: "",
    is_active: true,
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaving(false);

    const firstPro = items.find((t) => t.owner_type === "pro") ?? items[0] ?? null;
    setSelectedId(firstPro?.id ?? "");
    setMode("edit");
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    if (mode !== "edit") return;
    if (!selected) return;

    setForm({
      code: selected.code ?? "",
      label: selected.label ?? "",
      body: selected.body ?? "",
      is_active: selected.is_active !== false,
    });
  }, [open, mode, selected?.id]);

  const startCreate = () => {
    setMode("create");
    setSelectedId("");
    setForm({
      code: "",
      label: "",
      body: "",
      is_active: true,
    });
  };

  const startEdit = (id: string) => {
    setMode("edit");
    setSelectedId(id);
  };

  const submit = async () => {
    const code = form.code.trim();
    const label = form.label.trim();
    const body = form.body.trim();

    if (!code || !label || !body) return;

    setSaving(true);
    try {
      if (mode === "create") {
        await onCreate({ code, label, body, is_active: form.is_active });
      } else if (selected?.id) {
        await onUpdate({
          templateId: selected.id,
          patch: { code, label, body, is_active: form.is_active },
        });
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = form.code.trim() && form.label.trim() && form.body.trim();
  const readOnly = mode === "edit" && !!selected && !selected.can_edit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Messages rapides</DialogTitle>
          <DialogDescription>
            Réponses pré-écrites pour communiquer rapidement avec vos clients.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-semibold text-slate-700">Vos messages</div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[200px] text-xs">
                        <span className="flex items-center gap-1"><Pencil className="w-3 h-3" /> = modifiable</span>
                        <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> = par défaut</span>
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Button type="button" size="sm" variant="default" className="gap-1.5" onClick={startCreate}>
                <Plus className="w-4 h-4" />
                Ajouter
              </Button>
            </div>

            <TooltipProvider>
              <div className="max-h-[380px] overflow-auto rounded-md border">
                {items.length ? (
                  <div className="divide-y">
                    {items.map((t) => {
                      const isGlobal = t.owner_type === "global";
                      const isActive = t.is_active !== false;

                      return (
                        <button
                          type="button"
                          key={t.id}
                          onClick={() => startEdit(t.id)}
                          className={
                            "w-full px-3 py-2.5 text-start hover:bg-slate-50 transition-colors " +
                            (t.id === selectedId && mode === "edit" ? "bg-primary/5 border-s-2 border-s-primary" : "")
                          }
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-800 line-clamp-2">{t.label}</div>
                              {!isActive && (
                                <span className="text-xs text-slate-400">Désactivé</span>
                              )}
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex-shrink-0 mt-0.5">
                                  {isGlobal ? (
                                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                                  ) : (
                                    <Pencil className="w-3.5 h-3.5 text-primary" />
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                {isGlobal ? "Modèle par défaut (non modifiable)" : "Votre modèle personnalisé"}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 text-sm text-slate-600">Aucun modèle.</div>
                )}
              </div>
            </TooltipProvider>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-700">
                {mode === "create" ? "Nouveau message" : selected ? "Modifier le message" : "Sélectionnez un message"}
              </div>
              {mode === "edit" && selected && !readOnly ? (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                    disabled={saving}
                    className="rounded"
                  />
                  <span className="text-slate-600">Actif</span>
                </label>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label className="text-slate-600">Titre du message</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[200px] text-xs">Nom court pour identifier ce message dans la liste</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                value={form.label}
                onChange={(e) => {
                  const newLabel = e.target.value;
                  setForm((p) => ({
                    ...p,
                    label: newLabel,
                    // Auto-generate code from label for new templates
                    code: mode === "create" ? slugify(newLabel) : p.code,
                  }));
                }}
                placeholder="Ex: Nous sommes complets"
                disabled={saving || readOnly}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label className="text-slate-600">Contenu du message</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[200px] text-xs">Le texte qui sera envoyé au client</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Textarea
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                placeholder="Écrivez le message qui sera envoyé au client…"
                disabled={saving || readOnly}
                rows={4}
                className="resize-none"
              />
            </div>

            {readOnly ? (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <Lock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-slate-600">
                    Ce message par défaut ne peut pas être modifié.
                    <br />
                    <span className="text-primary font-medium">Cliquez sur "+ Ajouter"</span> pour créer votre propre version.
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Fermer
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !canSubmit || readOnly} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
