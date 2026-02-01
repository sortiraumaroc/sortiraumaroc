import { useEffect, useMemo, useState } from "react";

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
import { Switch } from "@/components/ui/switch";

import { createProInventoryCategory, updateProInventoryCategory } from "@/lib/pro/api";
import type { ProInventoryCategory } from "@/lib/pro/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishmentId: string;
  categories: ProInventoryCategory[];
  category: ProInventoryCategory | null;
  parentId: string | null;
  canWrite: boolean;
  onSaved: () => void;
};

function titleOrEmpty(v: string | null | undefined) {
  return typeof v === "string" ? v : "";
}

export function CategoryEditorDialog({ open, onOpenChange, establishmentId, categories, category, parentId, canWrite, onSaved }: Props) {
  const isEdit = !!category?.id;

  const parentOptions = useMemo(() => {
    const options = categories
      .filter((c) => c.is_active)
      .map((c) => ({ id: c.id, title: c.title, parent_id: c.parent_id }));

    const byId = new Map(options.map((o) => [o.id, o] as const));

    const label = (id: string) => {
      const node = byId.get(id);
      if (!node) return id;
      const chain: string[] = [node.title];
      let cur = node;
      while (cur.parent_id) {
        const p = byId.get(cur.parent_id);
        if (!p) break;
        chain.unshift(p.title);
        cur = p;
      }
      return chain.join(" / ");
    };

    return options.map((o) => ({ id: o.id, label: label(o.id) }));
  }, [categories]);

  const [form, setForm] = useState({ title: "", description: "", sortOrder: "0", parentId: "", isActive: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);

    const currentParent = category?.parent_id ?? parentId;
    setForm({
      title: titleOrEmpty(category?.title),
      description: titleOrEmpty(category?.description),
      sortOrder: String(category?.sort_order ?? 0),
      parentId: currentParent ?? "",
      isActive: category?.is_active ?? true,
    });
  }, [open, category, parentId]);

  const canSubmit = useMemo(() => {
    return canWrite && form.title.trim().length >= 2 && !saving;
  }, [canWrite, form.title, saving]);

  const submit = async () => {
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    const sort = Number(form.sortOrder);
    const sort_order = Number.isFinite(sort) ? Math.round(sort) : 0;

    try {
      if (isEdit && category) {
        await updateProInventoryCategory({
          establishmentId,
          categoryId: category.id,
          patch: {
            title: form.title.trim(),
            description: form.description.trim() || null,
            sort_order,
            is_active: form.isActive,
          },
        });
      } else {
        await createProInventoryCategory({
          establishmentId,
          data: {
            title: form.title.trim(),
            description: form.description.trim() || null,
            parent_id: form.parentId.trim() || null,
            sort_order,
            is_active: form.isActive,
          },
        });
      }

      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier la catégorie" : "Créer une catégorie"}</DialogTitle>
          <DialogDescription>
            Catégories & sous-catégories: parfait pour organiser un menu, des chambres ou des prestations.
          </DialogDescription>
        </DialogHeader>

        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Titre</Label>
            <Input value={form.title} disabled={!canWrite} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Description (optionnel)</Label>
            <Input
              value={form.description}
              disabled={!canWrite}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>

          {!isEdit ? (
            <div className="space-y-2 md:col-span-2">
              <Label>Parent</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.parentId}
                disabled={!canWrite}
                onChange={(e) => setForm((p) => ({ ...p, parentId: e.target.value }))}
              >
                <option value="">Aucun (catégorie principale)</option>
                {parentOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Ordre (tri)</Label>
            <Input
              type="number"
              value={form.sortOrder}
              disabled={!canWrite}
              onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Actif</Label>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} disabled={!canWrite} onCheckedChange={(checked) => setForm((p) => ({ ...p, isActive: checked }))} />
              <div className="text-sm text-slate-600">{form.isActive ? "Visible" : "Masqué"}</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" className="bg-primary text-white hover:bg-primary/90 font-bold" disabled={!canSubmit} onClick={submit}>
            {saving ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
