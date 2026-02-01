import { useEffect, useMemo, useRef, useState } from "react";
import { Edit3, FileSpreadsheet, GripVertical, Leaf, Plus, RefreshCcw, Sparkles, Tag, Trash2, Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
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
  deleteProInventoryCategory,
  deleteProInventoryItem,
  greenThumbProInventoryItem,
  listProInventory,
  seedDemoProInventory,
  reorderProInventoryItems,
} from "@/lib/pro/api";
import { isDemoModeEnabled } from "@/lib/demoMode";
import type { Establishment, ProInventoryCategory, ProInventoryItem, ProRole } from "@/lib/pro/types";

import { CategoryEditorDialog } from "./CategoryEditorDialog";
import { ItemEditorDialog } from "./ItemEditorDialog";
import { InventoryCSVDialog } from "./InventoryCSV";
import { SortableItemList } from "./SortableItemList";
import { CustomLabelsManager } from "./CustomLabelsManager";
import { labelById } from "./inventoryLabels";
import { formatMoney } from "./inventoryUtils";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

function canWrite(role: ProRole): boolean {
  return role === "owner" || role === "manager" || role === "marketing";
}

type CategoryNode = ProInventoryCategory & { children: CategoryNode[] };

function buildCategoryTree(categories: ProInventoryCategory[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  for (const c of categories) {
    map.set(c.id, { ...c, children: [] });
  }
  const roots: CategoryNode[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (arr: CategoryNode[]) => {
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title, "fr"));
    for (const n of arr) sortRec(n.children);
  };
  sortRec(roots);

  return roots;
}

function flattenTree(nodes: CategoryNode[], depth = 0): Array<{ node: CategoryNode; depth: number }> {
  const out: Array<{ node: CategoryNode; depth: number }> = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    out.push(...flattenTree(n.children, depth + 1));
  }
  return out;
}

function universeTitle(est: Establishment): string {
  const u = (est.universe ?? "").toLowerCase();
  if (u === "restaurant") return "Menu";
  if (u === "hebergement") return "Hébergements";
  if (u === "loisir" || u === "sport" || u === "culture") return "Prestations";
  return "Inventaire";
}

function itemPriceLabel(item: ProInventoryItem) {
  const currency = item.currency || "MAD";
  const activeVariants = (item.variants ?? []).filter((v) => !!v.is_active);
  if (activeVariants.length) {
    const min = Math.min(...activeVariants.map((v) => v.price));
    return `À partir de ${formatMoney(min, currency)}`;
  }
  if (typeof item.base_price === "number") return formatMoney(item.base_price, currency);
  return "—";
}

function itemStatusBadge(item: ProInventoryItem) {
  if (item.is_active) return { label: "Actif", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (item.visible_when_unavailable)
    return { label: "Indisponible (grisé)", className: "bg-amber-50 text-amber-800 border-amber-200" };
  return { label: "Masqué", className: "bg-slate-50 text-slate-700 border-slate-200" };
}

export function ProInventoryManager({ establishment, role }: Props) {
  const [categories, setCategories] = useState<ProInventoryCategory[]>([]);
  const [items, setItems] = useState<ProInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const autoSeededFor = useRef<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<ProInventoryCategory | null>(null);
  const [categoryCreateParentId, setCategoryCreateParentId] = useState<string | null>(null);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<ProInventoryItem | null>(null);

  // New dialogs
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [labelsDialogOpen, setLabelsDialogOpen] = useState(false);
  const [sortMode, setSortMode] = useState(false);

  const canEdit = canWrite(role);
  const canSeedDemo = isDemoModeEnabled() && canEdit && !loading && items.length === 0;

  const load = async (opts?: { allowAutoSeed?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listProInventory(establishment.id);
      setCategories(res.categories ?? []);
      setItems(res.items ?? []);

      const hasDemoName = /demo|démo/i.test(establishment.name ?? "");
      const inventoryIsEmpty = (res.items ?? []).length === 0;

      if (
        isDemoModeEnabled() &&
        opts?.allowAutoSeed &&
        canEdit &&
        hasDemoName &&
        inventoryIsEmpty &&
        autoSeededFor.current !== establishment.id
      ) {
        autoSeededFor.current = establishment.id;
        try {
          const seeded = await seedDemoProInventory(establishment.id);
          if ("inserted" in seeded) {
            setNotice(
              `Démo ajoutée : ${seeded.inserted.items} offres, ${seeded.inserted.categories} catégories, ${seeded.inserted.variants} variantes.`,
            );
          }

          const refreshed = await listProInventory(establishment.id);
          setCategories(refreshed.categories ?? []);
          setItems(refreshed.items ?? []);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erreur");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setCategories([]);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setNotice(null);
    autoSeededFor.current = null;
    void load({ allowAutoSeed: true });
  }, [establishment.id]);

  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const flat = useMemo(() => flattenTree(tree), [tree]);

  const selectedItems = useMemo(() => {
    if (selectedCategory === "all") return items;
    if (selectedCategory === "none") return items.filter((i) => !i.category_id);
    return items.filter((i) => i.category_id === selectedCategory);
  }, [items, selectedCategory]);

  const countsByCategory = useMemo(() => {
    const map = new Map<string, number>();
    let none = 0;
    for (const item of items) {
      if (!item.category_id) {
        none += 1;
        continue;
      }
      map.set(item.category_id, (map.get(item.category_id) ?? 0) + 1);
    }
    return { map, none, total: items.length };
  }, [items]);

  const openCreateCategory = (parentId: string | null) => {
    setCategoryToEdit(null);
    setCategoryCreateParentId(parentId);
    setCategoryDialogOpen(true);
  };

  const openEditCategory = (cat: ProInventoryCategory) => {
    setCategoryToEdit(cat);
    setCategoryCreateParentId(null);
    setCategoryDialogOpen(true);
  };

  const openCreateItem = () => {
    setItemToEdit(null);
    setItemDialogOpen(true);
  };

  const openEditItem = (it: ProInventoryItem) => {
    setItemToEdit(it);
    setItemDialogOpen(true);
  };

  const deleteCategory = async (categoryId: string) => {
    if (!canEdit) return;
    setError(null);
    try {
      await deleteProInventoryCategory({ establishmentId: establishment.id, categoryId });
      if (selectedCategory === categoryId) setSelectedCategory("all");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!canEdit) return;
    setError(null);
    try {
      await deleteProInventoryItem({ establishmentId: establishment.id, itemId });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  };

  const thumbItem = async (itemId: string) => {
    setError(null);
    try {
      await greenThumbProInventoryItem({ establishmentId: establishment.id, itemId });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleReorder = async (itemIds: string[]) => {
    setError(null);
    try {
      await reorderProInventoryItems({ establishmentId: establishment.id, itemIds });
      // Optimistic update - reorder locally
      const newItems = itemIds
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is ProInventoryItem => !!item);
      setItems(newItems);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du réordonnancement");
      await load(); // Reload on error
    }
  };

  const seedDemo = async () => {
    if (!canEdit) return;
    setError(null);
    setNotice(null);
    setSeedingDemo(true);
    try {
      const result = await seedDemoProInventory(establishment.id);
      if ("inserted" in result) {
        setNotice(
          `Démo ajoutée : ${result.inserted.items} offres, ${result.inserted.categories} catégories, ${result.inserted.variants} variantes.`,
        );
      } else {
        setNotice("Des offres existent déjà : la démo n’a pas été ajoutée.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSeedingDemo(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-lg font-extrabold text-slate-900">{universeTitle(establishment)}</div>
          <div className="text-sm text-slate-600">Catégories, produits/services, disponibilité et popularité.</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canSeedDemo ? (
            <Button variant="outline" className="gap-2" onClick={() => void seedDemo()} disabled={seedingDemo}>
              <Sparkles className={"w-4 h-4 " + (seedingDemo ? "animate-pulse" : "")} />
              Offres démo
            </Button>
          ) : null}
          <Button variant="outline" className="gap-2" onClick={() => setCsvDialogOpen(true)} disabled={loading}>
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Import/Export</span>
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setLabelsDialogOpen(true)} disabled={loading}>
            <Tag className="w-4 h-4" />
            <span className="hidden sm:inline">Labels</span>
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => void load()} disabled={loading || seedingDemo}>
            <RefreshCcw className={loading ? "animate-spin" : ""} />
          </Button>
          <Button
            className="gap-2 bg-primary text-white hover:bg-primary/90 font-bold"
            onClick={openCreateItem}
            disabled={!canEdit || seedingDemo}
          >
            <Plus className="w-4 h-4" />
            Ajouter
          </Button>
        </div>
      </div>

      {/* Sort mode toggle */}
      {canEdit && selectedItems.length > 1 && (
        <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-200">
          <GripVertical className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-600">Mode réorganisation</span>
          <Switch checked={sortMode} onCheckedChange={setSortMode} />
          {sortMode && (
            <span className="text-xs text-slate-500">Glissez les produits pour les réordonner</span>
          )}
        </div>
      )}

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {notice ? <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">{notice}</div> : null}

      {!canEdit ? <div className="text-sm text-slate-600">Lecture seule: seuls Owner/Manager/Marketing peuvent modifier.</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-4">
          <CardHeader>
            <SectionHeader
              title="Catégories"
              description="Organisez vos offres (catégories + sous-catégories)"
              icon={Tag}
              actions={
                <Button type="button" variant="outline" className="gap-2" disabled={!canEdit} onClick={() => openCreateCategory(null)}>
                  <Plus className="w-4 h-4" />
                  Catégorie
                </Button>
              }
            />
          </CardHeader>
          <CardContent className="space-y-2">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={
                "w-full rounded-md border px-3 py-2 text-sm font-semibold text-left flex items-center justify-between " +
                (selectedCategory === "all" ? "bg-primary text-white border-primary" : "bg-white border-slate-200 hover:bg-slate-50")
              }
            >
              <span>Toutes</span>
              <span className={"text-xs tabular-nums " + (selectedCategory === "all" ? "text-white/90" : "text-slate-500")}>{countsByCategory.total}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory("none")}
              className={
                "w-full rounded-md border px-3 py-2 text-sm font-semibold text-left flex items-center justify-between " +
                (selectedCategory === "none" ? "bg-primary text-white border-primary" : "bg-white border-slate-200 hover:bg-slate-50")
              }
            >
              <span>Sans catégorie</span>
              <span className={"text-xs tabular-nums " + (selectedCategory === "none" ? "text-white/90" : "text-slate-500")}>{countsByCategory.none}</span>
            </button>

            <div className="pt-2 space-y-1">
              {flat.length ? (
                flat.map(({ node, depth }) => {
                  const count = countsByCategory.map.get(node.id) ?? 0;
                  const isSelected = selectedCategory === node.id;
                  return (
                    <div key={node.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedCategory(node.id)}
                        className={
                          "flex-1 rounded-md border px-3 py-2 text-sm font-semibold text-left flex items-center justify-between " +
                          (isSelected ? "bg-primary text-white border-primary" : "bg-white border-slate-200 hover:bg-slate-50")
                        }
                      >
                        <span className="truncate" style={{ paddingLeft: depth * 14 }}>
                          {node.title}
                        </span>
                        <span className={"text-xs tabular-nums shrink-0 " + (isSelected ? "text-white/90" : "text-slate-500")}>{count}</span>
                      </button>

                      <Button type="button" size="icon" variant="outline" disabled={!canEdit} onClick={() => openEditCategory(node)}>
                        <Edit3 className="w-4 h-4" />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" size="icon" variant="outline" disabled={!canEdit}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer la catégorie ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Les sous-catégories seront supprimées. Les produits/services resteront mais passeront en "Sans catégorie".
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void deleteCategory(node.id)}>Supprimer</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-slate-600">Aucune catégorie.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader>
            <SectionHeader
              title="Produits / Services"
              description="Créez, mettez à jour, rendez visible/grisé, programmez une réactivation."
              actions={
                <Badge variant="secondary" className="font-bold">
                  {selectedItems.length}
                </Badge>
              }
            />
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-slate-600">Chargement…</div>
            ) : selectedItems.length ? (
              sortMode ? (
                // Mode réorganisation avec drag & drop
                <SortableItemList
                  items={selectedItems}
                  canEdit={canEdit}
                  onReorder={handleReorder}
                  onEditItem={openEditItem}
                  onDeleteItem={(id) => void deleteItem(id)}
                  onThumbItem={(id) => void thumbItem(id)}
                />
              ) : (
                // Mode normal
                <div className="space-y-3">
                  {selectedItems.map((it) => {
                    const status = itemStatusBadge(it);
                    const labels = (it.labels ?? []).slice(0, 3);
                    const mainPhoto = (it.photos ?? [])[0] ?? null;

                    return (
                      <div
                        key={it.id}
                        className={
                          "rounded-lg border p-3 transition flex flex-col sm:flex-row sm:items-center gap-3 " +
                          (it.is_active ? "bg-white border-slate-200 hover:bg-slate-50" : "bg-slate-50 border-slate-200")
                        }
                      >
                        {mainPhoto ? (
                          <div className="h-16 w-16 rounded-md overflow-hidden border border-slate-200 bg-white shrink-0">
                            <img src={mainPhoto} alt={it.title} className="h-16 w-16 object-cover" />
                          </div>
                        ) : null}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-extrabold text-slate-900 truncate">{it.title}</div>
                              <div className="text-sm text-slate-600 flex flex-wrap items-center gap-2">
                                <span className="tabular-nums">{itemPriceLabel(it)}</span>
                                <Badge className={status.className}>{status.label}</Badge>
                                {it.scheduled_reactivation_at ? (
                                  <span className="text-xs text-slate-500">
                                    Réactivation: {new Date(it.scheduled_reactivation_at).toLocaleString()}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Button type="button" variant="outline" size="icon" onClick={() => void thumbItem(it.id)} title="Pouce vert">
                                <Leaf className="w-4 h-4 text-emerald-600" />
                              </Button>
                              <div className="text-xs tabular-nums text-slate-600 w-10 text-right">{it.popularity ?? 0}</div>

                              <Button type="button" variant="outline" size="icon" disabled={!canEdit} onClick={() => openEditItem(it)}>
                                <Edit3 className="w-4 h-4" />
                              </Button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button type="button" variant="outline" size="icon" disabled={!canEdit}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Supprimer cette offre ?</AlertDialogTitle>
                                    <AlertDialogDescription>Suppression définitive (variantes incluses).</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => void deleteItem(it.id)}>Supprimer</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>

                          {labels.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {labels.map((id) => {
                                const l = labelById(id);
                                if (!l) return null;
                                return (
                                  <Badge key={id} className={l.badgeClassName}>
                                    {l.emoji} {l.title}
                                  </Badge>
                                );
                              })}
                            </div>
                          ) : null}

                          {it.description ? <div className="mt-2 text-sm text-slate-600 line-clamp-2">{it.description}</div> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="text-sm text-slate-600">Aucun produit/service dans cette catégorie.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <CategoryEditorDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        establishmentId={establishment.id}
        categories={categories}
        category={categoryToEdit}
        parentId={categoryCreateParentId}
        canWrite={canEdit}
        onSaved={() => void load()}
      />

      <ItemEditorDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        establishmentId={establishment.id}
        categories={categories}
        item={itemToEdit}
        canWrite={canEdit}
        onSaved={() => void load()}
      />

      <InventoryCSVDialog
        open={csvDialogOpen}
        onOpenChange={setCsvDialogOpen}
        establishmentId={establishment.id}
        categories={categories}
        items={items}
        canWrite={canEdit}
        onImportComplete={() => void load()}
      />

      <CustomLabelsManager
        open={labelsDialogOpen}
        onOpenChange={setLabelsDialogOpen}
        establishmentId={establishment.id}
        canWrite={canEdit}
        onLabelsChange={() => void load()}
      />
    </div>
  );
}
