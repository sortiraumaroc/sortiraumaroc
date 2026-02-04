import * as React from "react";
import { toast } from "sonner";

import { HelpTooltip } from "@/components/pro/help-tooltip";
import { ProShell } from "@/components/pro/pro-shell";
import { MenuCreateCategoryDialog } from "@/components/pro/menu-create-category-dialog";
import { MenuEditItemDialog } from "@/components/pro/menu-edit-item-dialog";
import { MenuItemCard } from "@/components/pro/menu-item-card";
import { useProSession } from "@/components/pro/use-pro-session";
import { useProPlace } from "@/contexts/pro-place-context";
import { useAuthToken } from "@/hooks/use-auth";
import { getMenuItemImageUrl } from "@/lib/image-urls";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { Plus, RefreshCw, Trash2 } from "lucide-react";

type ProCategoryRow = {
  id: number;
  placeId: number;
  title: string;
  description: string | null;
  priority: number;
};

type ProItemRow = {
  id: number;
  menuCategoryId: number;
  title: string;
  description: string | null;
  base_price: number | null;
  currency: string;
  is_active: boolean;
  disponibleProduct: "oui" | "non";
  image_src?: string | null; // URL for preview
  image_ancien_src?: string | null; // filename in DB
  label?: string | null;
};

export default function ProMenu() {
  const { state, signOut } = useProSession();
  const { selectedPlaceId } = useProPlace();
  const accessToken = useAuthToken("client");

  const [categories, setCategories] = React.useState<ProCategoryRow[]>([]);
  const [items, setItems] = React.useState<ProItemRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [selectedCategoryId, setSelectedCategoryId] = React.useState<number | null>(null);

  const [createCategoryOpen, setCreateCategoryOpen] = React.useState(false);
  const [editingItemId, setEditingItemId] = React.useState<number | null>(null);

  const [newItemTitle, setNewItemTitle] = React.useState("");
  const [newItemPrice, setNewItemPrice] = React.useState<number | "">("");

  const [deleteTarget, setDeleteTarget] = React.useState<
    | null
    | { kind: "item"; item: ProItemRow }
    | { kind: "category"; category: ProCategoryRow }
  >(null);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!selectedPlaceId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/mysql/menu/${selectedPlaceId}`);
      if (!response.ok) {
        toast.error("Impossible de charger la carte");
        setCategories([]);
        setItems([]);
        return;
      }

      const data = await response.json();
      const rawCats = (data.categories ?? []) as any[];
      const rawItems = (data.items ?? []) as any[];

      const transformedCats: ProCategoryRow[] = rawCats.map((c) => ({
        id: Number(c.menuCategoryId),
        placeId: Number(c.placeId),
        title: c.title,
        description: c.description || null,
        priority: c.priority || 0,
      }));

      const transformedItems: ProItemRow[] = rawItems.map((i) => ({
        id: Number(i.menuItemId),
        menuCategoryId: Number(i.menuCategoryId),
        title: i.title,
        description: i.description || null,
        base_price: parseFloat(String(i.price)) || null,
        currency: "Dhs",
        is_active: i.disponibleProduct === "oui",
        disponibleProduct: i.disponibleProduct || "oui",
        image_src: getMenuItemImageUrl(i.img) || null,
        image_ancien_src: i.img || null,
        label: i.label || null,
      }));

      setCategories(transformedCats);
      setItems(transformedItems);

      const firstId = transformedCats[0]?.id ?? null;
      setSelectedCategoryId((prev) => {
        if (prev && transformedCats.some((c) => c.id === prev)) return prev;
        return firstId;
      });
    } catch (error) {
      console.error("Error loading menu:", error);
      toast.error("Erreur lors du chargement de la carte");
    } finally {
      setLoading(false);
    }
  }, [selectedPlaceId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selectedCategory = React.useMemo(
    () => (selectedCategoryId ? categories.find((c) => c.id === selectedCategoryId) ?? null : null),
    [categories, selectedCategoryId],
  );

  const filteredItems = React.useMemo(() => {
    if (!selectedCategoryId) return [];
    return items.filter((i) => i.menuCategoryId === selectedCategoryId);
  }, [items, selectedCategoryId]);

  const editingItem = React.useMemo(
    () => (editingItemId ? items.find((i) => i.id === editingItemId) ?? null : null),
    [editingItemId, items],
  );

  const itemCountByCategoryId = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (const i of items) counts.set(i.menuCategoryId, (counts.get(i.menuCategoryId) ?? 0) + 1);
    return counts;
  }, [items]);

  const createCategory = React.useCallback(
    async (values: { title: string }) => {
      if (!accessToken || !selectedPlaceId) return toast.error("Non authentifié");
      try {
        const res = await fetch("/api/mysql/menu-categories", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ placeId: selectedPlaceId, title: values.title }),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          toast.error(error.error || "Création impossible");
          return;
        }

        toast.success("Catégorie créée");
        void load();
      } catch (e) {
        console.error(e);
        toast.error("Création impossible");
      }
    },
    [accessToken, selectedPlaceId, load],
  );

  const createItem = React.useCallback(async () => {
    if (!selectedCategoryId) return toast.message("Créez d'abord une catégorie.");
    if (!accessToken) return toast.error("Non authentifié");

    const title = newItemTitle.trim();
    if (!title) return;

    const price =
      typeof newItemPrice === "number" && Number.isFinite(newItemPrice)
        ? Math.max(0, newItemPrice)
        : null;

    try {
      const res = await fetch("/api/mysql/menu-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ menuCategoryId: selectedCategoryId, title, price }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        toast.error(error.error || "Création impossible");
        return;
      }

      setNewItemTitle("");
      setNewItemPrice("");
      toast.success("Plat créé");
      void load();
    } catch (e) {
      console.error(e);
      toast.error("Création impossible");
    }
  }, [selectedCategoryId, newItemPrice, newItemTitle, accessToken, load]);

  const deleteCount = React.useMemo(() => {
    if (!deleteTarget || deleteTarget.kind !== "category") return 0;
    return itemCountByCategoryId.get(deleteTarget.category.id) ?? 0;
  }, [deleteTarget, itemCountByCategoryId]);

  const confirmDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    if (!accessToken) return toast.error("Non authentifié");

    setDeleting(true);
    try {
      if (deleteTarget.kind === "item") {
        const res = await fetch(`/api/mysql/menu-items/${deleteTarget.item.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return toast.error("Impossible de supprimer ce plat");

        setItems((prev) => prev.filter((i) => i.id !== deleteTarget.item.id));
        if (editingItemId === deleteTarget.item.id) setEditingItemId(null);
        toast.success("Plat supprimé");
        return;
      }

      const cat = deleteTarget.category;
      const res = await fetch(`/api/mysql/menu-categories/${cat.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return toast.error("Impossible de supprimer cette catégorie");

      toast.success("Catégorie supprimée");
      void load();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, accessToken, editingItemId, load]);

  const toggleItemAvailability = React.useCallback(
    async (itemId: number) => {
      if (!accessToken) return toast.error("Non authentifié");

      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      const newStatus = item.disponibleProduct === "oui" ? "non" : "oui";

      try {
        const res = await fetch(`/api/mysql/menu-items/${itemId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ disponibleProduct: newStatus }),
        });

        if (!res.ok) {
          toast.error("Impossible de modifier le statut");
          return;
        }

        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId ? { ...i, disponibleProduct: newStatus, is_active: newStatus === "oui" } : i,
          ),
        );

        toast.success(newStatus === "oui" ? "Plat activé" : "Plat désactivé", { duration: 1400 });
      } catch (error) {
        console.error("Error toggling item availability:", error);
        toast.error("Erreur lors de la modification");
      }
    },
    [accessToken, items],
  );

  const email = state.status === "signedIn" ? state.email : null;

  return (
    <ProShell title="Gestion de la carte" subtitle={email ? `Connecté : ${email}` : undefined} onSignOut={() => void signOut()}>
      <MenuCreateCategoryDialog
        open={createCategoryOpen}
        onOpenChange={setCreateCategoryOpen}
        onCreate={createCategory}
      />

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        {/* ✅ Light theme */}
        <AlertDialogContent className="w-[92vw] max-w-[460px] rounded-3xl border border-black/10 bg-white p-5 text-black shadow-xl">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle className="text-base">Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-snug text-black/60">
              {deleteTarget?.kind === "item"
                ? "Ce plat sera supprimé définitivement."
                : deleteTarget
                  ? deleteCount > 0
                    ? `Cette catégorie et ses ${deleteCount} plats seront supprimés définitivement.`
                    : "Cette catégorie sera supprimée définitivement."
                  : null}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="mt-3 gap-2 sm:gap-2">
            <AlertDialogCancel asChild>
              <Button type="button" variant="secondary" className="h-10 rounded-2xl" disabled={deleting}>
                Annuler
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="button"
                className="h-10 rounded-2xl bg-sam-red text-white hover:bg-sam-red/90"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                Supprimer
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      {editingItem ? (
        <MenuEditItemDialog
          open
          onOpenChange={(open) => setEditingItemId(open ? editingItemId : null)}
          item={{ ...editingItem, image_src: editingItem.image_ancien_src ?? null } as any}
          onSave={async (values) => {
            if (!accessToken) return toast.error("Non authentifié");

            const payload: any = {
              title: values.title,
              description: values.description || null,
              price: values.base_price,
              label: values.label || null,
            };

            const currentImg = (editingItem.image_ancien_src ?? "").trim();
            const nextImg = (values.image_src ?? "").trim();
            payload.image_src = nextImg ? nextImg : currentImg;

            try {
              const res = await fetch(`/api/mysql/menu-items/${editingItem.id}`, {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(payload),
              });

              if (!res.ok) return toast.error("Sauvegarde impossible");

              toast.success("Plat mis à jour");
              void load();
            } catch (e) {
              console.error(e);
              toast.error("Sauvegarde impossible");
            }
          }}
        />
      ) : null}

      <div className="space-y-4">
        {/* ✅ Light sticky toolbar */}
        <div className="sticky top-0 z-10 -mx-2 px-2 pt-1 pb-3 backdrop-blur bg-white/70">
          <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-black">Catégories & plats</div>
                <HelpTooltip label="Aide">
                  Gestion rapide : catégories, ajout de plat, édition, suppression.
                </HelpTooltip>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => setCreateCategoryOpen(true)}
                  className="h-9 rounded-xl bg-sam-red px-3 text-white hover:bg-sam-red/90"
                >
                  <Plus className="h-4 w-4" />
                  <span className="ml-2 hidden sm:inline">Catégorie</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void load()}
                  className="h-9 rounded-xl border-black/10 bg-white px-3 text-black hover:bg-black/5"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="ml-2 hidden sm:inline">Rafraîchir</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Categories */}
        <section className="rounded-2xl border border-black/10 bg-white p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-black">Catégories</div>
              <span className="text-xs text-black/50">{loading ? "…" : `${categories.length} catégorie(s)`}</span>
            </div>
          </div>

          {loading ? (
            <div className="mt-3 text-sm text-black/60">Chargement…</div>
          ) : categories.length === 0 ? (
            <div className="mt-3 text-sm text-black/60">
              Aucune catégorie. Cliquez sur “Catégorie” pour en créer une.
            </div>
          ) : (
            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-2 snap-x snap-mandatory">
              {categories.map((c) => {
                const active = c.id === selectedCategoryId;
                const count = itemCountByCategoryId.get(c.id) ?? 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(c.id)}
                    className={cn(
                      "snap-start shrink-0 rounded-full px-4 py-2 text-sm font-medium transition border",
                      active
                        ? "bg-sam-red text-white border-sam-red/40"
                        : "bg-white text-black border-black/10 hover:bg-black/5",
                    )}
                    title={c.title}
                  >
                    <span className="max-w-[180px] truncate inline-block align-middle">{c.title}</span>
                    <span
                      className={cn(
                        "ml-2 inline-flex rounded-full px-2 py-0.5 text-xs align-middle",
                        active ? "bg-black/15 text-white" : "bg-black/5 text-black/70",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Items */}
        <section className="rounded-2xl border border-black/10 bg-white p-3 sm:p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-black">Plats</div>
                <span className="text-xs text-black/50">{loading ? "…" : `${filteredItems.length} plat(s)`}</span>

                {selectedCategory ? (
                  <div className="inline-flex items-center gap-1 rounded-full bg-black/5 px-3 py-1 text-xs text-black/70 border border-black/10">
                    <span className="max-w-[180px] truncate">{selectedCategory.title}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setDeleteTarget({ kind: "category", category: selectedCategory })}
                      className="h-6 w-6 rounded-full p-0 text-black/60 hover:bg-black/5 hover:text-black"
                      aria-label="Supprimer la catégorie"
                      title="Supprimer la catégorie"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Create item */}
          {selectedCategoryId && (
            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_160px_44px]">
              <Input
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                placeholder="Nom du plat"
                className="h-10 rounded-xl border-black/10 bg-white text-black placeholder:text-black/40"
              />
              <Input
                value={newItemPrice}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!raw) return setNewItemPrice("");
                  const num = Number.parseInt(raw, 10);
                  setNewItemPrice(Number.isFinite(num) ? num : "");
                }}
                placeholder="Prix (Dhs)"
                inputMode="numeric"
                className="h-10 rounded-xl border-black/10 bg-white text-black placeholder:text-black/40"
              />
              <Button
                type="button"
                onClick={() => void createItem()}
                disabled={!newItemTitle.trim()}
                className="h-10 rounded-xl bg-sam-red px-0 text-white hover:bg-sam-red/90"
                aria-label="Créer"
                title="Créer"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Items grid */}
          <div className="mt-4">
            {loading ? (
              <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/60 shadow-sm">
                Chargement…
              </div>
            ) : categories.length === 0 ? (
              <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/60 shadow-sm">
                Créez une catégorie pour commencer.
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/60 shadow-sm">
                Aucun plat dans cette catégorie.
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredItems.map((i) => {
                  const itemCategory = categories.find((c) => c.id === i.menuCategoryId);
                  return (
                    <div key={i.id} className="space-y-1.5">
                      <MenuItemCard
                        item={i as any}
                        onOpenEdit={() => setEditingItemId(i.id)}
                        onToggleActive={() => void toggleItemAvailability(i.id)}
                        onRequestDelete={() => setDeleteTarget({ kind: "item", item: i })}
                      />
                      {itemCategory ? (
                        <div className="px-2 text-xs text-black/50">
                          Catégorie : <span className="text-black/70">{itemCategory.title}</span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </ProShell>
  );
}
