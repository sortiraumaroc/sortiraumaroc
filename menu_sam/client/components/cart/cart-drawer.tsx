import * as React from "react";

import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatCountdown } from "@/lib/utils";
import { useCart, submitCartToMySQL } from "@/state/cart-store";
import { formatDh } from "@/lib/currency";
import { Banknote, CreditCard, Minus, Plus, Trash2, AlertCircle } from "lucide-react";
import { UpsellRecommendationSheet } from "./upsell-recommendation-sheet";

import type { CustomerProfile } from "@/hooks/use-customer-profile";
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerProfile: CustomerProfile | null;
  onEditCustomer: () => void;
  placeId?: number;
  slug?: string;
  availableCategories?: MenuCategory[];
  className?: string;
};

type Step = "cart" | "upsell" | "payment";

type PaymentMethod = "cash" | "card";

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
  lines: Array<any>,
  categories?: DbMenuCategory[],
  items?: DbMenuItem[]
): { drinks: MenuProduct[]; desserts: MenuProduct[] } {
  if (!categories?.length || !items?.length) {
    return { drinks: [], desserts: [] };
  }

  // Find categories by name
  const drinksCategory = findCategoryByNameMatch(categories, "boissons");
  const dessertCategory = findCategoryByNameMatch(categories, "desserts");

  // If none exist, don't show upsell
  if (!drinksCategory && !dessertCategory) {
    return { drinks: [], desserts: [] };
  }

  const drinksCategoryId = drinksCategory?.menuCategoryId;
  const dessertCategoryId = dessertCategory?.menuCategoryId;

  // Check if items from these categories already exist in the cart
  const hasDrinksInCart = drinksCategoryId
    ? lines.some((line) => String(line?.product?.categoryId) === String(drinksCategoryId))
    : false;

  const hasDessertInCart = dessertCategoryId
    ? lines.some((line) => String(line?.product?.categoryId) === String(dessertCategoryId))
    : false;

  // Only return recommendations for missing categories (and only if category exists)
  const drinks =
    drinksCategoryId && !hasDrinksInCart
      ? items
        .filter(
          (item) =>
            item.menuCategoryId === drinksCategoryId &&
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
            item.menuCategoryId === dessertCategoryId &&
            item.disponibleProduct === "oui"
        )
        .slice(0, 3)
        .map(convertDbMenuItemToMenuProduct)
      : [];
  return { drinks, desserts };
}


export function CartDrawer({
  open,
  onOpenChange,
  customerProfile,
  onEditCustomer,
  placeId,
  slug,
  availableCategories,
  className,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const cart = useCart();
  const [step, setStep] = React.useState<Step>("cart");
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>("cash");
  const [hasChosenPaymentMethod, setHasChosenPaymentMethod] = React.useState(false);
  const [promoInput, setPromoInput] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isApplyingPromo, setIsApplyingPromo] = React.useState(false);
  const [showUpsell, setShowUpsell] = React.useState(false);
  const [categories, setCategories] = React.useState<DbMenuCategory[]>([]);
  const [items, setItems] = React.useState<DbMenuItem[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = React.useState(false);
  const [tipAmount, setTipAmount] = React.useState<number>(0);

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

  const upsellRecommendations = React.useMemo(
    () => getMissingCategoryRecommendations(cart.lines, categories, items),
    [cart.lines, categories, items]
  );

  const customerLabel = React.useMemo(() => {
    if (!customerProfile) return "Client";
    const service = customerProfile.serviceType === "takeaway" ? "À emporter" : "Sur place";
    return `${customerProfile.firstName} — ${service}`;
  }, [customerProfile]);

  const handleSubmitOrder = React.useCallback(
    async (method: PaymentMethod) => {
      setIsSubmitting(true);
      try {
        // If placeId is not available, just clear and close
        if (!placeId) {
          toast.success(
            method === "card"
              ? "Paiement accepté — commande confirmée."
              : "Commande envoyée — paiement sur place.",
            {
              duration: 2500,
              className: "border-sam-success/30 bg-sam-success text-white",
            }
          );
          cart.clear();
          onOpenChange(false);
          return;
        }

        // Submit to MySQL
        const result = await submitCartToMySQL(placeId, cart.lines, cart.totalDh, {
          nbrTable: 1,
          serviceType: customerProfile?.serviceType === "takeaway" ? "emporter" : "sur_place",
          orderByUser: customerProfile?.firstName || "Client",
          paymentMethod: method,
          pourboire: tipAmount,
        });

        if (result.ok && result.order) {
          toast.success(
            method === "card"
              ? "Paiement accepté — commande confirmée."
              : "Commande envoyée — paiement sur place.",
            {
              duration: 2500,
              className: "border-sam-success/30 bg-sam-success text-white",
            }
          );
          cart.clear();
          onOpenChange(false);

          // Redirect to order confirmation page
          if (slug) {
            navigate(`/${slug}/order-confirmation/${result.order.id}`);
          }
        } else {
          toast.error(`Erreur: ${result.error}`, {
            duration: 2500,
            className: "border-sam-red/30 bg-sam-red text-white",
          });
        }
      } catch (error) {
        toast.error("Erreur lors de la soumission de la commande", {
          duration: 2500,
          className: "border-sam-red/30 bg-sam-red text-white",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [placeId, slug, cart, customerProfile, onOpenChange, navigate]
  );

  React.useEffect(() => {
    if (!open) {
      setStep("cart");
      setPaymentMethod("cash");
      setHasChosenPaymentMethod(false);
      setShowUpsell(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setPromoInput(cart.promoCode ?? "");
  }, [cart.promoCode, open]);

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground>
        <DrawerContent
          className={cn(
            "h-[100dvh] sm:h-[85vh]",
            "flex flex-col",
            className,
          )}
          style={{
            // ✅ iOS: height réelle visible quand clavier ouvert
            height: "var(--vvh, 100dvh)",
          }}
        >
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-left text-base font-semibold">
              {step === "cart" ? "Votre panier" : "Paiement"}
            </DrawerTitle>
          </DrawerHeader>

          <div
            className="flex-1 overflow-auto px-4"
            style={{
              // ✅ réserve la place du footer + safe-area (iPhone)
              paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
              WebkitOverflowScrolling: "touch",
            }}
          >

            {step === "cart" ? (
              <div className="space-y-4">
                <section className="rounded-2xl border border-border bg-secondary p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">Type de commande</p>
                      <p className="mt-1 text-sm text-foreground">{customerLabel}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onEditCustomer();
                      }}
                      className="shrink-0 text-sm font-medium text-primary"
                    >
                      Modifier
                    </button>
                  </div>
                </section>


                <section className="rounded-2xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Votre commande</p>
                    {cart.itemCount > 0 && (
                      <button
                        type="button"
                        onClick={cart.clear}
                        className="text-sm font-medium text-muted-foreground"
                      >
                        Vider
                      </button>
                    )}
                  </div>

                  {cart.lines.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Votre panier est vide.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-4">
                      {cart.lines.map((line) => (
                        <div
                          key={line.product.id}
                          className="rounded-2xl border border-border p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground">
                                {line.product.title}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDh(line.product.priceDh)}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => cart.remove(line.product.id)}
                              className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
                              aria-label="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 rounded-full bg-secondary p-1">
                              <button
                                type="button"
                                onClick={() =>
                                  cart.setQuantity(line.product.id, line.quantity - 1)
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
                                  cart.setQuantity(line.product.id, line.quantity + 1)
                                }
                                className="grid h-9 w-9 place-items-center rounded-full text-foreground"
                                aria-label="Augmenter"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>

                            <p className="text-sm font-semibold text-foreground tabular-nums">
                              {formatDh(line.product.priceDh * line.quantity)}
                            </p>
                          </div>

                          <div className="mt-3">
                            <Input
                              value={line.note}
                              onChange={(e) =>
                                cart.setNote(line.product.id, e.target.value)
                              }
                              onFocus={(e) => {
                                setTimeout(() => {
                                  e.currentTarget.scrollIntoView({ behavior: "smooth", block: "center" });
                                }, 50);
                              }}
                              placeholder="Ajouter un commentaire"
                              className="text-[16px]  h-11 rounded-xl"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-3 rounded-2xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Code promo (optionnel)</p>
                    {cart.promoCode ? (
                      <button
                        type="button"
                        onClick={() => {
                          cart.clearPromoCode();
                          setPromoInput("");
                          toast.success("Code promo retiré.", { duration: 1800 });
                        }}

                        className="text-sm font-medium text-primary"
                      >
                        Retirer
                      </button>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      onFocus={(e) => {
                        setTimeout(() => {
                          e.currentTarget.scrollIntoView({ behavior: "smooth", block: "center" });
                        }, 50);
                      }}
                      placeholder="Entrez votre code promo"
                      disabled={Boolean(cart.promoCode)}
                      className={cn(
                        "h-11 rounded-xl",
                        Boolean(cart.promoCode)
                          ? "bg-sam-gray-50 text-muted-foreground disabled:opacity-100"
                          : null,
                      )}
                      style={{ fontSize: '16px' }}
                    />
                    <Button
                      variant="secondary"
                      className="h-11 rounded-xl"
                      disabled={Boolean(cart.promoCode) || isApplyingPromo}
                      onClick={async () => {
                        if (!placeId) {
                          toast.error("Établissement non spécifié", { duration: 2200 });
                          return;
                        }
                        setIsApplyingPromo(true);
                        try {
                          const res = await cart.applyPromoCode(promoInput, placeId, cart.subtotalDh);
                          if (res.ok === false) {
                            toast.error(res.message, { duration: 2200 });
                            return;
                          }
                          setPromoInput("");
                          const displayText = res.discountType === "percent"
                            ? `-${res.percent}%`
                            : `-${res.discountAmount.toFixed(2)} DH`;
                          toast.success(`${res.code} — ${displayText} appliqué`, { duration: 2200 });
                        } catch (error) {
                          console.error("Error applying promo code:", error);
                          toast.error("Une erreur est survenue", { duration: 2200 });
                        } finally {
                          setIsApplyingPromo(false);
                        }
                      }}
                    >
                      {isApplyingPromo ? "Vérification..." : "Appliquer"}
                    </Button>
                  </div>
                </section>

                <section className="space-y-3 rounded-2xl border border-border bg-background p-3">
                  <p className="text-sm font-semibold">
                    Instructions de service (optionnel)
                  </p>
                  <Textarea
                    placeholder="Ex : sans oignons, servir l’entrée en premier, plat bien cuit…"
                    className="min-h-24 rounded-xl"
                  />
                </section>

                {(() => {
                  const sp = new URLSearchParams(location.search);
                  const raw =
                    sp.get("t") ??
                    sp.get("table") ??
                    sp.get("room_id") ??
                    sp.get("room");
                  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
                  const tableNumber = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
                  if (!tableNumber) return null;

                  return (
                    <section className="space-y-2 rounded-2xl border border-border bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">Identifiant</p>
                          <p className="mt-1 text-xs text-muted-foreground">Table</p>
                        </div>
                      </div>
                      <Input
                        value={String(tableNumber)}
                        disabled
                        readOnly
                        className={cn(
                          "h-11 rounded-xl",
                          "bg-sam-gray-50 text-muted-foreground",
                          "disabled:opacity-100 disabled:cursor-not-allowed",
                        )}
                      />
                    </section>
                  );
                })()}

                <section className="rounded-2xl border border-border bg-secondary p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Sous-total</p>
                    <p className="text-sm font-semibold tabular-nums">{formatDh(cart.subtotalDh)}</p>
                  </div>

                  {cart.discountDh > 0 ? (
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Remise {cart.promoCode ? `(${cart.promoCode})` : ""}
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-sam-success">
                        -{formatDh(cart.discountDh)}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-base font-semibold">Total</p>
                    <p className="text-base font-semibold text-primary tabular-nums">
                      {formatDh(cart.totalDh)}
                    </p>
                  </div>
                </section>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-secondary p-3">
                  <p className="text-sm font-semibold">Récapitulatif</p>
                  <p className="mt-1 text-sm text-muted-foreground">Total à payer</p>
                  <p className="mt-2 text-2xl font-semibold text-primary tabular-nums">
                    {formatDh(cart.totalDh + tipAmount)}
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
                      onClick={() => {
                        setPaymentMethod("cash");
                        setHasChosenPaymentMethod(true);
                      }}
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
                        "border border-border bg-sam-gray-50 text-foreground",
                        "text-[10px] gap-1" // 👈 taille du texte
                      )}
                      title="Paiement par carte temporairement indisponible"
                    >
                      <CreditCard className="h-3 w-3" /> {/* icône légèrement réduite */}
                      Carte (Bientôt disponible)
                    </Button>
                  </div>
                </div>

                {paymentMethod === "card" ? (
                  <div className="rounded-2xl border border-border bg-background p-3">
                    <p className="text-sm font-semibold">Paiement par carte</p>
                    <p className="mt-1 text-sm text-muted-foreground">Paiement immédiat.</p>

                    <div className="mt-3 space-y-2">
                      <Input placeholder="Numéro de carte" className="h-11 rounded-xl" />
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="MM/AA" className="h-11 rounded-xl" />
                        <Input placeholder="CVC" className="h-11 rounded-xl" />
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
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            }}
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
                    setHasChosenPaymentMethod(false);
                  }
                }}
                className="h-12 w-full rounded-2xl"
                disabled={cart.itemCount === 0}
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
                    setHasChosenPaymentMethod(false);
                  }}
                >
                  Retour
                </Button>

                {paymentMethod === "card" ? (
                  <Button
                    className="h-12 rounded-2xl"
                    onClick={() => handleSubmitOrder("card")}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Envoi..." : "Payer"}
                  </Button>
                ) : (
                  <Button
                    className="h-12 rounded-2xl"
                    onClick={() => handleSubmitOrder("cash")}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Envoi..." : "Envoyer"}
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
          cart.add(product);
        }}
        onContinue={() => {
          setShowUpsell(false);
          setStep("payment");
          setPaymentMethod("cash");
          setHasChosenPaymentMethod(false);
        }}
      />
    </>
  );
}
