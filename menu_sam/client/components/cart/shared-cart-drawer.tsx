import * as React from "react";

import { toast } from "sonner";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDh } from "@/lib/currency";
import { Minus, Plus, Trash2, Banknote, CreditCard } from "lucide-react";
import { UpsellRecommendationSheet } from "./upsell-recommendation-sheet";
import { useVisualViewportVars } from "@/hooks/use-visual-viewport-vars";
import type { QrTableCartLine } from "@/hooks/use-qr-table-cart";
import type { TablePreCartLine } from "@/hooks/use-qr-table-pre-cart";
import type { MenuProduct, MenuCategory } from "@/lib/menu-data";
import { menuProducts } from "@/lib/menu-data";

type DbMenuItem = {
  menuItemId: number;
  menuCategoryId: number;
  img?: string;
  title: string;
  note?: string;
  description?: string;
  price: string | number;
  priority: number;
  type?: string;
  disponibleProduct?: string;
  votes?: number;
  label?: string;
};

type DbMenuCategory = {
  menuCategoryId: number;
  placeId: number;
  title: string;
  priority: number;
  disponibleCat?: string;
  showAsButton?: string;
  parentId?: number;
  iconScan?: string;
};

type CartLine = QrTableCartLine | TablePreCartLine;
type PaymentMethod = "cash" | "card";
type Step = "cart" | "upsell" | "payment";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableNumber: number;
  partySize: number;
  locked: boolean;
  lines: CartLine[];
  totalDh: number;
  itemCount: number;
  onSetQuantity: (args: { itemId: number | string; quantity: number }) => void | Promise<boolean>;
  onSetNote: (args: { itemId: number | string; note: string }) => void | Promise<boolean>;
  onClearMine: () => boolean | Promise<boolean>;
  onLockOrder?: () => boolean | Promise<boolean>;
  onReopenOrder?: () => boolean | Promise<boolean>;
  onSubmit?: (paymentMethod?: PaymentMethod, tipAmount?: number) => void | Promise<void>;
  onEditCustomer?: () => void;
  onAddProduct?: (product: MenuProduct) => void | Promise<void>;
  availableCategories?: MenuCategory[];
  placeId?: number;
  className?: string;
};

type PersonGroup = {
  name: string;
  lines: QrTableCartLine[];
  subtotalDh: number;
  mine: boolean;
};

function groupByPerson(lines: QrTableCartLine[]): PersonGroup[] {
  const by = new Map<string, QrTableCartLine[]>();
  for (const line of lines) {
    const key = line.addedByFirstName || "Client";
    const list = by.get(key) ?? [];
    list.push(line);
    by.set(key, list);
  }

  const groups: PersonGroup[] = [];
  for (const [name, groupLines] of by.entries()) {
    const subtotalDh = groupLines.reduce((sum, l) => sum + l.unitPriceDh * l.quantity, 0);
    const mine = groupLines.some((l) => l.ownedByMe);
    groups.push({ name, lines: groupLines, subtotalDh, mine });
  }

  // Mine first, then by name
  groups.sort((a, b) => {
    if (a.mine !== b.mine) return a.mine ? -1 : 1;
    return a.name.localeCompare(b.name, "fr");
  });

  return groups;
}

function convertDbMenuItemToMenuProduct(item: DbMenuItem): MenuProduct {
  return {
    id: String(item.menuItemId),
    title: item.title,
    description: item.description || "",
    imageSrc: item.img || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3C/svg%3E",
    priceDh: typeof item.price === "string" ? parseFloat(item.price) : item.price,
    categoryId: String(item.menuCategoryId),
  };
}

function findCategoryByNameMatch(
  categories: DbMenuCategory[] | undefined,
  searchTerm: string
): DbMenuCategory | undefined {
  if (!categories) return undefined;
  return categories.find((cat) =>
    cat.title.toLowerCase().includes(searchTerm.toLowerCase())
  );
}

function getMissingCategoryRecommendations(
  lines: CartLine[],
  categories?: DbMenuCategory[],
  items?: DbMenuItem[]
): { drinks: MenuProduct[]; desserts: MenuProduct[] } {
  if (!categories?.length || !items?.length) {
    return { drinks: [], desserts: [] };
  }

  // Find categories by name
  const drinksCategory = findCategoryByNameMatch(categories, "boisson");
  const dessertCategory = findCategoryByNameMatch(categories, "dessert");

  // If none exist, don't show upsell
  if (!drinksCategory && !dessertCategory) {
    return { drinks: [], desserts: [] };
  }

  const drinksCategoryId = drinksCategory ? String(drinksCategory.menuCategoryId) : null;
  const dessertCategoryId = dessertCategory ? String(dessertCategory.menuCategoryId) : null;

  // Check if items from these categories already exist in the cart
  const hasDrinksInCart = drinksCategoryId
    ? lines.some((line) => String(line.categoryId) === drinksCategoryId)
    : false;

  const hasDessertInCart = dessertCategoryId
    ? lines.some((line) => String(line.categoryId) === dessertCategoryId)
    : false;

  // Only return recommendations for missing categories (only if the category exists)
  const drinks =
    drinksCategoryId && !hasDrinksInCart
      ? items
        .filter(
          (item) =>
            String(item.menuCategoryId) === drinksCategoryId &&
            item.disponibleProduct === "oui"
        )
        .slice(0, 3)
        .map(convertDbMenuItemToMenuProduct)
      : [];

  const desserts =
    dessertCategoryId && !hasDessertInCart
      ? items
        .filter(
          (item) =>
            String(item.menuCategoryId) === dessertCategoryId &&
            item.disponibleProduct === "oui"
        )
        .slice(0, 3)
        .map(convertDbMenuItemToMenuProduct)
      : [];

  return { drinks, desserts };
}


export function SharedCartDrawer({
  open,
  onOpenChange,
  tableNumber,
  partySize,
  locked,
  lines,
  totalDh,
  itemCount,
  onSetQuantity,
  onSetNote,
  onClearMine,
  onLockOrder,
  onReopenOrder,
  onSubmit,
  onEditCustomer,
  onAddProduct,
  availableCategories,
  placeId,
  className,
}: Props) {
  const [step, setStep] = React.useState<Step>("cart");
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>("cash");
  const [showUpsell, setShowUpsell] = React.useState(false);
  const [categories, setCategories] = React.useState<DbMenuCategory[]>([]);
  const [items, setItems] = React.useState<DbMenuItem[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = React.useState(false);
  const [tipAmount, setTipAmount] = React.useState<number>(0);
  useVisualViewportVars(open);

  // Fetch categories and items from MySQL API
  React.useEffect(() => {
    if (!placeId || !open) return;

    const fetchMenuData = async () => {
      setIsLoadingCategories(true);
      try {
        const response = await fetch(`/api/mysql/menu/${placeId}`);
        if (response.ok) {
          const data = await response.json();
          setCategories(data.categories || []);
          setItems(data.items || []);
        }
      } catch (error) {
        console.error("Error fetching menu categories:", error);
      } finally {
        setIsLoadingCategories(false);
      }
    };

    fetchMenuData();
  }, [placeId, open]);

  const grouped = React.useMemo(() => groupByPerson(lines), [lines]);
  const upsellRecommendations = React.useMemo(
    () => getMissingCategoryRecommendations(lines, categories || undefined, items || undefined),
    [lines, categories, items]
  );

  // Reset state when drawer closes
  React.useEffect(() => {
    if (!open) {
      setStep("cart");
      setPaymentMethod("cash");
      setShowUpsell(false);
    }
  }, [open]);

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground>
        <DrawerContent
          className={cn("flex flex-col h-[100dvh] sm:max-h-[85vh]", className)}
          style={{ height: "var(--vvh, 100dvh)" }}
        >

          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-left text-base font-semibold">
              {step === "cart" ? "Panier partagé" : "Paiement"}
            </DrawerTitle>
          </DrawerHeader>

          <div
            className="flex-1 overflow-auto px-4"
            style={{
              paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
              WebkitOverflowScrolling: "touch",
            }}
          >

            {step === "cart" ? (
              <div className="space-y-4">
                <section className="rounded-2xl border border-border bg-secondary p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">Table {tableNumber}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {partySize} {partySize > 1 ? "personnes" : "personne"} • {itemCount}{" "}
                        {itemCount > 1 ? "plats" : "plat"}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {onEditCustomer ? (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenChange(false);
                            onEditCustomer();
                          }}
                          className="inline-flex h-9 items-center justify-center rounded-full bg-background px-3 text-xs font-semibold text-primary shadow-sm shadow-black/5"
                        >
                          Modifier mes infos
                        </button>
                      ) : null}

                      <Button
                        variant="secondary"
                        className="h-10 rounded-xl bg-sam-gray-50 text-foreground hover:bg-sam-gray-100"
                        onClick={async () => {
                          const ok = await Promise.resolve(onClearMine());
                          if (ok) {
                            toast.success("Vos articles ont été retirés.", { duration: 2000 });
                          }
                        }}
                        disabled={locked || lines.every((l) => !l.ownedByMe)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Mes articles
                      </Button>
                    </div>
                  </div>
                </section>

                {locked ? (
                  <section className="rounded-2xl border border-border bg-sam-gray-50 p-3">
                    <p className="text-sm font-semibold text-foreground">Commande verrouillée</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      La table a validé la commande. Tout le monde est en lecture seule.
                    </p>
                  </section>
                ) : null}

                <section className="space-y-3 rounded-2xl border border-border bg-background p-3">
                  <p className="text-sm font-semibold">Instructions de service (optionnel)</p>
                  <Textarea
                    placeholder="Indiquez vos demandes : ordre des plats, éléments à enlever, service en une fois ou en plusieurs temps."
                    className="min-h-24 rounded-xl  text-[16px] sm:text-sm"
                    disabled={locked}
                  />
                </section>

                <section className="space-y-2 rounded-2xl border border-border bg-background p-3">
                  <p className="text-sm font-semibold">Identifiant</p>
                  <Input
                    value={String(tableNumber)}
                    disabled
                    readOnly
                    className={cn(
                      "h-11 rounded-xl",
                      "bg-sam-gray-50 text-muted-foreground",
                      "disabled:opacity-100 disabled:cursor-not-allowed  text-[16px] sm:text-sm",
                    )}
                  />
                </section>

                <section className="rounded-2xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Commande de la table</p>
                    <p className="text-sm text-muted-foreground">Groupée par personne</p>
                  </div>

                  {lines.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Aucun plat pour le moment.</p>
                  ) : (
                    <div className="mt-3 space-y-4">
                      {grouped.map((group) => (
                        <div key={group.name} className="rounded-2xl border border-border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground">{group.name}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {formatDh(group.subtotalDh)}
                              </p>
                            </div>
                            {group.mine ? (
                              <span className="shrink-0 rounded-full bg-sam-gray-50 px-3 py-1 text-[11px] font-semibold text-foreground">
                                Mes plats
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 space-y-3">
                            {group.lines.map((line) => (
                              <div key={line.id} className="rounded-2xl bg-secondary/40 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground">{line.title}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatDh(line.unitPriceDh)}
                                      {line.note.trim().length > 0 ? ` • ${line.note.trim()}` : ""}
                                    </p>
                                  </div>
                                  <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                                    {formatDh(line.unitPriceDh * line.quantity)}
                                  </p>
                                </div>

                                {line.ownedByMe && !locked ? (
                                  <div className="mt-3 space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-2 rounded-full bg-background p-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onSetQuantity({ itemId: line.id, quantity: line.quantity - 1 })
                                          }
                                          className="grid h-9 w-9 place-items-center rounded-full text-foreground"
                                          aria-label="Diminuer"
                                        >
                                          <Minus className="h-4 w-4" />
                                        </button>
                                        <span className="min-w-6 text-center text-sm font-semibold tabular-nums">
                                          {line.quantity}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onSetQuantity({ itemId: line.id, quantity: line.quantity + 1 })
                                          }
                                          className="grid h-9 w-9 place-items-center rounded-full text-foreground"
                                          aria-label="Augmenter"
                                        >
                                          <Plus className="h-4 w-4" />
                                        </button>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => onSetQuantity({ itemId: line.id, quantity: 0 })}
                                        className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        Supprimer
                                      </button>
                                    </div>

                                    <Input
                                      value={line.note}
                                      onChange={(e) => onSetNote({ itemId: line.id, note: e.target.value })}
                                      placeholder="Ajouter un commentaire"
                                      className="h-11 rounded-xl  text-[16px] sm:text-sm"
                                    />
                                  </div>
                                ) : (
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Ajouté par <span className="font-semibold">{line.addedByFirstName}</span>
                                    {line.ownedByMe && locked ? (
                                      <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                                        Lecture seule
                                      </span>
                                    ) : null}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-secondary p-3">
                  <p className="text-sm font-semibold">Récapitulatif</p>
                  <p className="mt-1 text-sm text-muted-foreground">Total à payer</p>
                  <p className="mt-2 text-2xl font-semibold text-primary tabular-nums">
                    {formatDh(totalDh + tipAmount)}
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold">Pourboire (optionnel)</p>
                    {tipAmount > 0 && (
                      <p className="text-sm font-semibold text-sam-red">+{formatDh(tipAmount)}</p>
                    )}
                  </div>
                  <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-2">
                    {[0, 5, 10, 20, 50, 100].map((amount) => (
                      <Button
                        key={amount}
                        type="button"
                        variant="secondary"
                        className={cn(
                          "h-11 min-w-[80px] shrink-0 rounded-xl text-sm",
                          tipAmount === amount
                            ? "bg-sam-red text-white hover:bg-sam-red/90"
                            : "border border-border bg-sam-gray-50 text-foreground hover:bg-sam-gray-100"
                        )}
                        onClick={() => setTipAmount(amount)}
                      >
                        {amount === 0 ? "0" : `${amount} DH`}
                      </Button>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={tipAmount}
                      onChange={(e) => setTipAmount(Math.max(0, parseInt(e.target.value) || 0))}
                      placeholder="Montant personnalisé"
                      className="h-11 rounded-xl flex-1"
                      disabled={locked}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background p-3">
                  <p className="text-sm font-semibold">Mode de paiement</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choisissez comment vous souhaitez payer.
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className={cn(
                        "h-12 rounded-2xl",
                        paymentMethod === "cash"
                          ? "bg-sam-red text-primary-foreground hover:bg-sam-red/90"
                          : "border border-border bg-sam-gray-50 text-foreground hover:bg-sam-gray-100",
                      )}
                      onClick={() => setPaymentMethod("cash")}
                      disabled={locked}
                    >
                      <Banknote className="h-4 w-4" />
                      Espèces
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      disabled
                      className={cn(
                        "h-12 rounded-2xl opacity-50 cursor-not-allowed",
                        "border border-border bg-sam-gray-50 text-foreground text-[10px]",
                      )}
                      title="Paiement par carte temporairement indisponible"
                    >
                      <CreditCard className="h-4 w-4" />
                      Carte (Bientôt disponible)
                    </Button>
                  </div>
                </div>

                {paymentMethod === "card" ? (
                  <div className="rounded-2xl border border-border bg-background p-3">
                    <p className="text-sm font-semibold">Paiement par carte</p>
                    <p className="mt-1 text-sm text-muted-foreground">Paiement immédiat.</p>

                    <div className="mt-3 space-y-2">
                      <Input placeholder="Numéro de carte" className="h-11 rounded-xl" disabled={locked} />
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="MM/AA" className="h-11 rounded-xl" disabled={locked} />
                        <Input placeholder="CVC" className="h-11 rounded-xl" disabled={locked} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-background p-3">
                    <p className="text-sm font-semibold">Paiement en espèces</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Vous paierez directement au restaurant.
                    </p>
                  </div>
                )}
              </div>
            )}

          </div>
          <div
            className="sticky bottom-0 border-t border-border bg-background p-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >

            {step === "cart" ? (
              <Button
                onClick={() => {
                  const hasUpsellRecommendations =
                    upsellRecommendations.drinks.length > 0 ||
                    upsellRecommendations.desserts.length > 0;

                  if (hasUpsellRecommendations) {
                    setShowUpsell(true);
                  } else {
                    setStep("payment");
                    setPaymentMethod("cash");
                  }
                }}
                className="h-12 w-full rounded-2xl"
                disabled={lines.length === 0 || locked}
              >
                Passer au paiement
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="secondary"
                  className="h-12 rounded-2xl"
                  onClick={() => {
                    setStep("cart");
                    setPaymentMethod("cash");
                  }}
                >
                  Retour
                </Button>

                {locked ? (
                  <Button
                    className="h-12 rounded-2xl bg-sam-red text-primary-foreground hover:bg-sam-red/90"
                    onClick={async () => {
                      const ok = await Promise.resolve(onReopenOrder());
                      if (!ok) return;

                      toast.success("Commande réouverte — vous pouvez rajouter des articles.", {
                        duration: 2200,
                        className: "border-sam-success/30 bg-sam-success text-white",
                      });
                    }}
                  >
                    Rajouter un article
                  </Button>
                ) : (
                  <Button
                    className="h-12 rounded-2xl"
                    onClick={async () => {
                      if (onSubmit) {
                        // New pre-cart submission flow
                        await Promise.resolve(onSubmit(paymentMethod, tipAmount));
                      } else if (onLockOrder) {
                        // Legacy order locking flow
                        const ok = await Promise.resolve(onLockOrder());
                        if (!ok) return;

                        toast.success("Commande envoyée au restaurant.", {
                          duration: 2500,
                          className: "border-sam-success/30 bg-sam-success text-white",
                        });
                      }
                    }}
                  >
                    {paymentMethod === "card" ? "Payer" : "Envoyer"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <UpsellRecommendationSheet
        open={showUpsell}
        onOpenChange={setShowUpsell}
        drinks={upsellRecommendations.drinks}
        desserts={upsellRecommendations.desserts}
        onAddProduct={async (product) => {
          if (onAddProduct) {
            await Promise.resolve(onAddProduct(product));
          }
        }}
        onContinue={() => {
          setShowUpsell(false);
          setStep("payment");
          setPaymentMethod("cash");
        }}
      />
    </>
  );
}
