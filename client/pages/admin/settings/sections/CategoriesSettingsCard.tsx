import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  AdminApiError,
  applyAdminUniverseCommission,
  createAdminCategory,
  deleteAdminCategory,
  updateAdminCategory,
  type AdminCategory,
} from "@/lib/adminApi";

import { normalizeText, safeNumber } from "../utils";
import type { SettingsReportPatch, ToastInput } from "../../AdminSettingsPage";

const UNIVERSE_PRESETS = [
  { key: "restaurant", label: "Restaurant" },
  { key: "spa", label: "Spa" },
  { key: "hammam", label: "Hammam" },
  { key: "activites", label: "Activités" },
  { key: "beauty", label: "Beauty" },
  { key: "hebergement", label: "Hôtel" },
];

function universeLabel(universe: string): string {
  const found = UNIVERSE_PRESETS.find((u) => u.key === universe);
  return found?.label ?? universe;
}

function categoryLabel(c: AdminCategory): string {
  return c.name || "(sans nom)";
}

type CategoryDraft = {
  id?: string;
  universe: string;
  name: string;
  icon: string;
  parent_id: string | null;
  commission_percent: string;
  sort_order: string;
  active: boolean;
};

function emptyDraft(): CategoryDraft {
  return {
    universe: UNIVERSE_PRESETS[0]?.key ?? "restaurant",
    name: "",
    icon: "",
    parent_id: null,
    commission_percent: "",
    sort_order: "0",
    active: true,
  };
}

export function CategoriesSettingsCard(props: {
  categories: AdminCategory[];
  onCategoriesChange: (next: AdminCategory[]) => void;
  onReport: (patch: SettingsReportPatch) => void;
  onToast: (toast: ToastInput) => void;
}) {
  const { categories, onCategoriesChange, onReport, onToast } = props;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CategoryDraft>(() => emptyDraft());
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(() => {
    const byUniverse = new Map<string, AdminCategory[]>();
    for (const c of categories) {
      const u = normalizeText(c.universe || "");
      if (!byUniverse.has(u)) byUniverse.set(u, []);
      byUniverse.get(u)!.push(c);
    }

    for (const [u, list] of byUniverse) {
      list.sort((a, b) => {
        const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (so !== 0) return so;
        return categoryLabel(a).localeCompare(categoryLabel(b), "fr");
      });
      byUniverse.set(u, list);
    }

    return Array.from(byUniverse.entries()).sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [categories]);

  const parentsForUniverse = useMemo(() => {
    return categories
      .filter((c) => c.universe === draft.universe && !c.parent_id)
      .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), "fr"));
  }, [categories, draft.universe]);

  const openCreate = () => {
    setDraft(emptyDraft());
    setOpen(true);
  };

  const openEdit = (cat: AdminCategory) => {
    setDraft({
      id: cat.id,
      universe: cat.universe,
      name: cat.name ?? "",
      icon: cat.icon ?? "",
      parent_id: cat.parent_id,
      commission_percent: cat.commission_percent == null ? "" : String(cat.commission_percent),
      sort_order: String(cat.sort_order ?? 0),
      active: !!cat.active,
    });
    setOpen(true);
  };

  const save = async () => {
    const universe = normalizeText(draft.universe);
    const name = normalizeText(draft.name);
    const icon = normalizeText(draft.icon);
    const sortOrder = safeNumber(draft.sort_order);
    const commission = safeNumber(draft.commission_percent);

    if (!universe) {
      onToast({ title: "❌ Erreur", description: "Univers requis", variant: "destructive" });
      return;
    }

    if (!name) {
      onToast({ title: "❌ Erreur", description: "Nom requis", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (!draft.id) {
        const res = await createAdminCategory(undefined, {
          universe,
          name,
          icon: icon || null,
          parent_id: draft.parent_id,
          commission_percent: commission,
          sort_order: sortOrder ?? 0,
          active: draft.active,
        });
        onCategoriesChange([...categories, res.item]);
        onToast({ title: "✔️ Paramètres mis à jour", description: `Catégorie ajoutée : ${name}` });
        onReport({ created: 1 });
      } else {
        const existing = categories.find((c) => c.id === draft.id);
        const same =
          existing &&
          normalizeText(existing.universe) === universe &&
          normalizeText(existing.name) === name &&
          (existing.icon ?? "") === (icon || "") &&
          (existing.parent_id ?? null) === (draft.parent_id ?? null) &&
          Number(existing.sort_order ?? 0) === Number(sortOrder ?? 0) &&
          (existing.commission_percent ?? null) === (commission ?? null) &&
          !!existing.active === !!draft.active;

        if (same) {
          onToast({ title: "⚠️ Rien à faire", description: "Aucun changement." });
          onReport({ noop: 1 });
          setOpen(false);
          return;
        }

        const res = await updateAdminCategory(undefined, {
          id: draft.id,
          universe,
          name,
          icon: icon || null,
          parent_id: draft.parent_id,
          commission_percent: commission,
          sort_order: sortOrder ?? 0,
          active: draft.active,
        });
        onCategoriesChange(categories.map((c) => (c.id === draft.id ? res.item : c)));
        onToast({ title: "✔️ Paramètres mis à jour", description: `Catégorie mise à jour : ${name}` });
        onReport({ modified: 1 });
      }

      setOpen(false);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "❌ Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (cat: AdminCategory) => {
    setSaving(true);
    try {
      await deleteAdminCategory(undefined, cat.id);
      onCategoriesChange(categories.filter((c) => c.id !== cat.id));
      onToast({ title: "✔️ Paramètres mis à jour", description: `Catégorie supprimée : ${categoryLabel(cat)}` });
      onReport({ modified: 1 });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "❌ Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (cat: AdminCategory, nextActive: boolean) => {
    if (!!cat.active === !!nextActive) {
      onToast({ title: "⚠️ Rien à faire", description: "Aucun changement." });
      onReport({ noop: 1 });
      return;
    }

    setSaving(true);
    try {
      const res = await updateAdminCategory(undefined, { id: cat.id, active: nextActive });
      onCategoriesChange(categories.map((c) => (c.id === cat.id ? res.item : c)));
      onToast({ title: "✔️ Paramètres mis à jour", description: `Catégorie ${nextActive ? "activée" : "désactivée"}` });
      onReport({ modified: 1 });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "❌ Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const [applyUniverse, setApplyUniverse] = useState(UNIVERSE_PRESETS[0]?.key ?? "restaurant");
  const [applyCommission, setApplyCommission] = useState<string>("");

  const applyToUniverse = async () => {
    const commission = safeNumber(applyCommission);
    if (!commission || commission < 0) {
      onToast({ title: "❌ Erreur", description: "Commission invalide", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await applyAdminUniverseCommission(undefined, { universe: applyUniverse, commission_percent: commission });
      const next = categories.map((c) => (c.universe === applyUniverse ? { ...c, commission_percent: commission } : c));
      onCategoriesChange(next);
      onToast({ title: "✔️ Paramètres mis à jour", description: `Commission appliquée à ${res.affected} catégories (${universeLabel(applyUniverse)})` });
      onReport({ modified: Math.max(1, res.affected) });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "❌ Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const universeOptions = useMemo(() => {
    const set = new Set<string>(UNIVERSE_PRESETS.map((u) => u.key));
    for (const c of categories) {
      const u = normalizeText(c.universe || "");
      if (u) set.add(u);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [categories]);

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Catégories</CardTitle>
            <InfoTooltip
              content={
                <div className="space-y-1">
                  <div>Catégories & sous-catégories par univers (affichage / filtres / commissions).</div>
                  <div className="text-slate-500">Table : admin_categories</div>
                </div>
              }
            />
          </div>
          <Button onClick={openCreate} disabled={saving}>
            + Ajouter
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Univers</Label>
            <Select value={applyUniverse} onValueChange={setApplyUniverse}>
              <SelectTrigger>
                <SelectValue placeholder="Univers" />
              </SelectTrigger>
              <SelectContent>
                {universeOptions.map((u) => (
                  <SelectItem key={u} value={u}>
                    {universeLabel(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Commission (%)</Label>
            <Input value={applyCommission} onChange={(e) => setApplyCommission(e.target.value)} inputMode="decimal" placeholder="10" />
          </div>

          <div className="flex items-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full" disabled={saving}>
                  Appliquer à un univers
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmer</AlertDialogTitle>
                  <AlertDialogDescription>
                    Appliquer la commission {applyCommission || "?"}% à toutes les catégories de l’univers “{universeLabel(applyUniverse)}” ?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
                  <AlertDialogAction disabled={saving} onClick={() => void applyToUniverse()}>
                    Confirmer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!grouped.length ? <div className="text-sm text-slate-600">Aucune catégorie pour le moment.</div> : null}

        <div className="space-y-4">
          {grouped.map(([universe, items]) => {
            const byParent = new Map<string, AdminCategory[]>();
            const roots: AdminCategory[] = [];

            for (const cat of items) {
              if (!cat.parent_id) roots.push(cat);
              else {
                const key = cat.parent_id;
                if (!byParent.has(key)) byParent.set(key, []);
                byParent.get(key)!.push(cat);
              }
            }

            for (const [pid, list] of byParent) {
              list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || categoryLabel(a).localeCompare(categoryLabel(b), "fr"));
              byParent.set(pid, list);
            }

            roots.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || categoryLabel(a).localeCompare(categoryLabel(b), "fr"));

            return (
              <div key={universe} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900">{universeLabel(universe)}</div>
                  <div className="text-xs text-slate-500">{items.length} éléments</div>
                </div>

                <div className="mt-3 space-y-2">
                  {roots.map((cat) => {
                    const children = byParent.get(cat.id) ?? [];
                    return (
                      <div key={cat.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {(cat.icon ?? "") ? `${cat.icon} ` : ""}
                              {categoryLabel(cat)}
                            </div>
                            <div className="text-xs text-slate-500">
                              Commission : {cat.commission_percent == null ? "—" : `${cat.commission_percent}%`} · {cat.active ? "Actif" : "Inactif"}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch checked={!!cat.active} disabled={saving} onCheckedChange={(v) => void toggleActive(cat, v)} />
                            <Button size="sm" variant="outline" disabled={saving} onClick={() => openEdit(cat)}>
                              Modifier
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline" disabled={saving}>
                                  Supprimer
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Supprimer la catégorie ?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Cette action supprimera aussi les sous-catégories liées.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
                                  <AlertDialogAction disabled={saving} onClick={() => void remove(cat)}>
                                    Supprimer
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>

                        {children.length ? (
                          <div className="mt-3 space-y-2">
                            {children.map((sub) => (
                              <div key={sub.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {(sub.icon ?? "") ? `${sub.icon} ` : ""}
                                    {categoryLabel(sub)}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    Commission : {sub.commission_percent == null ? "—" : `${sub.commission_percent}%`} · {sub.active ? "Actif" : "Inactif"}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" variant="outline" disabled={saving} onClick={() => openEdit(sub)}>
                                    Modifier
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button size="sm" variant="outline" disabled={saving}>
                                        Supprimer
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Supprimer la sous-catégorie ?</AlertDialogTitle>
                                        <AlertDialogDescription>Cette action est définitive.</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
                                        <AlertDialogAction disabled={saving} onClick={() => void remove(sub)}>
                                          Supprimer
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => {
                              setDraft({ ...emptyDraft(), universe: cat.universe, parent_id: cat.id });
                              setOpen(true);
                            }}
                          >
                            + Ajouter sous-catégorie
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <Dialog open={open} onOpenChange={(v) => (!saving ? setOpen(v) : null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{draft.id ? "Modifier" : "Ajouter"} une catégorie</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Univers</Label>
                <Select value={draft.universe} onValueChange={(v) => setDraft((d) => ({ ...d, universe: v, parent_id: null }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Univers" />
                  </SelectTrigger>
                  <SelectContent>
                    {universeOptions.map((u) => (
                      <SelectItem key={u} value={u}>
                        {universeLabel(u)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Parent (optionnel)</Label>
                <Select value={draft.parent_id ?? "none"} onValueChange={(v) => setDraft((d) => ({ ...d, parent_id: v === "none" ? null : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Parent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {parentsForUniverse.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {categoryLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 md:col-span-2">
                <Label>Nom</Label>
                <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Restaurant" />
              </div>

              <div className="space-y-1">
                <Label>Icône (texte/emoji)</Label>
                <Input value={draft.icon} onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))} placeholder="🍽️" />
              </div>

              <div className="space-y-1">
                <Label>Commission (%)</Label>
                <Input value={draft.commission_percent} onChange={(e) => setDraft((d) => ({ ...d, commission_percent: e.target.value }))} inputMode="decimal" placeholder="10" />
              </div>

              <div className="space-y-1">
                <Label>Ordre (0..)</Label>
                <Input value={draft.sort_order} onChange={(e) => setDraft((d) => ({ ...d, sort_order: e.target.value }))} inputMode="numeric" placeholder="0" />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div>
                  <div className="text-sm font-medium">Actif</div>
                  <div className="text-xs text-slate-500">Si OFF → masqué USER/PRO.</div>
                </div>
                <Switch checked={draft.active} onCheckedChange={(v) => setDraft((d) => ({ ...d, active: v }))} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Annuler
              </Button>
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
