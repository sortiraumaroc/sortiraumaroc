import * as React from "react";

import { toast } from "sonner";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useGeoFence } from "@/hooks/use-geo-fence";
import { useCustomerProfile } from "@/hooks/use-customer-profile";
import { useEstablishmentGeoFence } from "@/hooks/use-establishment-geo-fence";
import { useEstablishmentBySlug } from "@/hooks/use-establishment-by-slug";
import { useMySQLMenu } from "@/hooks/use-mysql-menu";
import { getMenuItemImageUrl, getLogoUrl, getBannerImageUrl } from "@/lib/image-urls";
import { useQrTableOrder } from "@/hooks/use-qr-table-order";
import { useQrTablePreCart } from "@/hooks/use-qr-table-pre-cart";

import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartExpirationAlert } from "@/components/cart/cart-expiration-alert";
import { FloatingCartBar } from "@/components/cart/floating-cart-bar";
import { SharedCartDrawer } from "@/components/cart/shared-cart-drawer";
import { Button } from "@/components/ui/button";
import { CustomerSetupGate } from "@/components/customer/customer-setup-gate";
import { GeoGate } from "@/components/geo/geo-gate";
import { JoinTableOrderDialog } from "@/components/table/join-table-order-dialog";
import { ReviewSubmissionDialog } from "@/components/review/review-submission-dialog";
import { CategoryNav } from "@/components/menu/category-nav";
import { BadgeFilterSheet } from "@/components/menu/badge-filter-sheet";
import { ProductCard } from "@/components/menu/product-card";
import { ProductDetailModal } from "@/components/menu/product-detail-modal";
import { SortMenu, type SortOption } from "@/components/menu/sort-menu";
import { VenueHeader } from "@/components/menu/venue-header";
import { ChatDrawer } from "@/components/chat/chat-drawer";

import type { MenuBadge, MenuProduct } from "@/lib/menu-data";
import { venueProfile } from "@/lib/menu-data";
import { useLiveMenuData } from "@/hooks/use-live-menu-data";
import { useScrollSpy } from "@/hooks/use-scroll-spy";
import { cn } from "@/lib/utils";
import { useCart } from "@/state/cart-store";
import { updateFavicon } from "@/lib/favicon";

import { Home, MessageCircle, AlertCircle, Star } from "lucide-react";

const ALL_CATEGORY_ID = "all";

const BADGE_FILTERS: MenuBadge[] = [
  "specialite",
  "bestSeller",
  "coupDeCoeur",
  "chef",
  "vegetarien",
  "epice",
  "fruitsDeMer",
  "healthy",
  "traditionnel",
  "signature",
  "nouveau",
];

function parseTableNumber(search: string): number | null {
  const sp = new URLSearchParams(search);
  const raw = sp.get("t") ?? sp.get("table");
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export default function Menu() {
  const location = useLocation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const cart = useCart();
  const { profile: customerProfile, setProfile: setCustomerProfile } = useCustomerProfile();

  // Fetch establishment by slug if provided
  const { establishment } = useEstablishmentBySlug(slug);
  const currentPlaceId = establishment?.placeId;
  const { categories: mysqlCategories, items: mysqlItems, loading: menuLoading } = useMySQLMenu(currentPlaceId);

  // Live menu data for fallback or default (only when no slug)
  const liveMenu = useLiveMenuData();

  // Use MySQL data if slug is provided and loaded, otherwise use live menu
  const menu = React.useMemo(() => {
    // If slug is provided, ALWAYS use MySQL data (even if loading)
    if (slug) {
      if (mysqlCategories.length > 0 && mysqlItems.length > 0) {
        return {
          status: "ready",
          categories: mysqlCategories.map((cat) => ({
            id: String(cat.menuCategoryId),
            label: cat.title,
          })),
          products: mysqlItems.map((item) => ({
            id: String(item.menuItemId),
            categoryId: String(item.menuCategoryId),
            title: item.title,
            description: item.description || item.note || "",
            priceDh: typeof item.price === "string" ? parseFloat(item.price) : Number(item.price),
            imageSrc: getMenuItemImageUrl(item.img),
            badges: item.label ? [item.label] : [],
            likes: item.votes || 0,
          })),
        };
      }
      // Still loading MySQL data for this slug - show loading state
      return {
        status: menuLoading ? "loading" : "error",
        categories: [],
        products: [],
      };
    }
    // No slug provided - use live menu data
    return liveMenu;
  }, [slug, mysqlCategories, mysqlItems, menuLoading, liveMenu]);

  const [setupOpen, setSetupOpen] = React.useState(() => customerProfile === null);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState<MenuProduct | null>(null);
  const [productDetailOpen, setProductDetailOpen] = React.useState(false);

  const [selectedCategory, setSelectedCategory] = React.useState(ALL_CATEGORY_ID);
  const [highlightedCategory, setHighlightedCategory] = React.useState<string | null>(null);
  const [selectedBadges, setSelectedBadges] = React.useState<MenuBadge[]>([]);
  const [sort, setSort] = React.useState<SortOption>("recommended");
  const [draftNotes, setDraftNotes] = React.useState<Record<string, string>>({});

  const tableNumber = React.useMemo(() => parseTableNumber(location.search), [location.search]);
  // Only enable shared mode if both slug and table number exist
  const isSharedMode = slug !== undefined && tableNumber !== null;

  React.useEffect(() => {
    if (!customerProfile) {
      setSetupOpen(true);
      return;
    }
    setSetupOpen(false);
  }, [customerProfile]);

  // Use establishment data from slug if available, otherwise use default
  const currentVenue = establishment
    ? {
      name: establishment.name,
      tagline: establishment.tagline || establishment.name,
      logoImageSrc: getLogoUrl(establishment.slug, establishment.logo),
      logoAlt: establishment.name,
      heroImageSrc: getBannerImageUrl(establishment.banniereImg || establishment.img),
      heroAlt: establishment.name,
      geoFence: venueProfile.geoFence,
    }
    : venueProfile;

  // Update favicon when establishment logo loads
  React.useEffect(() => {
    const logoUrl = currentVenue.logoImageSrc || currentVenue.logo;
    if (logoUrl) {
      updateFavicon(logoUrl);
    }
  }, [currentVenue.logoImageSrc, currentVenue.logo]);

  const { config: geoFenceConfig } = useEstablishmentGeoFence(currentVenue.geoFence || venueProfile.geoFence);
  const { state: geoState, request: requestGeo } = useGeoFence(geoFenceConfig);
  const isInsideVenue = geoState.status === "ready" ? geoState.inside : false;

  const qrOrder = useQrTableOrder({
    // For shared table orders, don't require geofencing since the table is the security boundary
    enabled: isSharedMode && Boolean(customerProfile) && currentPlaceId !== undefined,
    firstName: customerProfile?.firstName ?? null,
    tableNumber: tableNumber ?? 0,
    placeId: currentPlaceId ?? null,
  });

  // Track if user needs to join an existing table order
  const needsJoin = isSharedMode && qrOrder.state.status === "needs_join";

  const joinCandidate =
    isSharedMode && qrOrder.state.status === "needs_join" ? qrOrder.state.existing : null;

  // Pre-order carts are never locked - users can always add/remove items
  // The order is only locked after submission
  const orderLocked = false;

  // Use pre-cart for table orders (before order submission)
  // This allows real-time sync of items across all users at the table
  const sharedCart = useQrTablePreCart({
    enabled: isSharedMode && Boolean(customerProfile),
    placeId: currentPlaceId ? parseInt(currentPlaceId as string) : null,
    tableNumber: tableNumber ?? 0,
    firstName: customerProfile?.firstName ?? null,
  });

  const categoriesWithAll = React.useMemo(() => {
    return [{ id: ALL_CATEGORY_ID, label: "Tout" }, ...menu.categories];
  }, [menu.categories]);

  const badgeFiltersOrdered = React.useMemo(() => {
    if (selectedBadges.length === 0) return BADGE_FILTERS;

    const selected = BADGE_FILTERS.filter((b) => selectedBadges.includes(b));
    const unselected = BADGE_FILTERS.filter((b) => !selectedBadges.includes(b));
    return [...selected, ...unselected];
  }, [selectedBadges]);

  const filteredProducts = React.useMemo(() => {
    const base = menu.products.filter((p) => {
      if (selectedCategory !== ALL_CATEGORY_ID && p.categoryId !== selectedCategory) return false;

      const badges = p.badges ?? [];
      if (selectedBadges.length > 0) {
        const matchesAnySelectedBadge = selectedBadges.some((b) => badges.includes(b));
        if (!matchesAnySelectedBadge) return false;
      }

      return true;
    });

    return [...base].sort((a, b) => {
      if (sort === "recommended") return b.likes - a.likes;
      if (sort === "priceAsc") return a.priceDh - b.priceDh;
      if (sort === "priceDesc") return b.priceDh - a.priceDh;
      return 0;
    });
  }, [menu.products, selectedBadges, selectedCategory, sort]);

  // Scroll spy: Auto-update highlighted category when user scrolls into a category section
  const categoryIds = React.useMemo(
    () => menu.categories.map((c) => `category-${c.id}`),
    [menu.categories]
  );
  const visibleSectionId = useScrollSpy(categoryIds);

  // Update highlightedCategory when user scrolls into a new section (for visual feedback only)
  React.useEffect(() => {
    if (!visibleSectionId) return;

    // Extract category ID from section ID (e.g., "category-123" -> "123")
    const categoryId = visibleSectionId.replace("category-", "");
    if (categoryId && menu.categories.some((c) => c.id === categoryId)) {
      setHighlightedCategory(categoryId);
    }
  }, [visibleSectionId, menu.categories]);

  const scrollToCategory = React.useCallback((id: string) => {
    setSelectedCategory(id);
    if (id === ALL_CATEGORY_ID) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const el = document.getElementById(`category-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);


  const goHome = React.useCallback(() => {
    if (tableNumber && slug) {
      navigate(`/${slug}?table=${tableNumber}`);
      return;
    }
    if (tableNumber) {
      navigate(`/?table=${tableNumber}`);
      return;
    }
    if (slug) {
      navigate(`/${slug}`);
      return;
    }
    navigate("/");
  }, [navigate, tableNumber, slug]);

  const soloLineByProductId = React.useMemo(() => {
    const m = new Map<string, { quantity: number; note: string }>();
    for (const line of cart.lines) {
      m.set(line.product.id, { quantity: line.quantity, note: line.note });
    }
    return m;
  }, [cart.lines]);

  const handleAddSolo = React.useCallback(
    (productId: string) => {
      if (!customerProfile) {
        setSetupOpen(true);
        return;
      }

      const product = menu.products.find((p) => p.id === productId);
      if (!product) {
        if (menu.status === "loading") {
          toast.message("Le menu est en cours de chargement... patientez", {
            duration: 2000,
            className: "border-amber-500/30 bg-amber-500 text-white",
          });
        } else {
          toast.error("Produit non trouvé", {
            duration: 2000,
            className: "border-sam-red/30 bg-sam-red text-white",
          });
        }
        return;
      }

      const note = (draftNotes[productId] ?? "").trim();
      cart.add(product);
      if (note.length > 0) cart.setNote(productId, note);
      setDraftNotes((prev) => {
        const { [productId]: _, ...rest } = prev;
        return rest;
      });

      toast.success("Ajouté au panier", {
        duration: 2000,
        position: "top-center",
        action: {
          label: "Panier",
          onClick: () => setCartOpen(true),
        },
        className: "border-sam-success/30 bg-sam-success text-white",
      });
    },
    [cart, customerProfile, draftNotes, menu.status, menu.products],
  );

  const handleAddShared = React.useCallback(
    async (productId: string) => {
      if (!customerProfile) {
        setSetupOpen(true);
        return;
      }

      // If they need to join an existing order, show the modal instead of adding
      if (needsJoin) {
        // Modal will be shown automatically from joinCandidate check
        return;
      }

      const product = menu.products.find((p) => p.id === productId);
      if (!product) return;

      const note = (draftNotes[productId] ?? "").trim();
      const ok = await sharedCart.add({ product, note });
      if (!ok) return;

      toast.success(`Ajouté par ${customerProfile.firstName}`, {
        duration: 2000,
        position: "top-center",
        action: {
          label: "Panier table",
          onClick: () => setCartOpen(true),
        },
        className: "border-sam-success/30 bg-sam-success text-white",
      });
    },
    [customerProfile, draftNotes, menu.products, sharedCart, needsJoin],
  );

  const drawerPartySize = customerProfile?.partySize ?? 1;

  const handleSubmitSharedOrder = React.useCallback(async (paymentMethod?: "cash" | "card", tipAmount?: number) => {
    // Validate inputs
    const parsedPlaceId = currentPlaceId ? parseInt(String(currentPlaceId)) : NaN;
    if (Number.isNaN(parsedPlaceId) || !tableNumber || sharedCart.itemCount === 0) {
      if (sharedCart.itemCount === 0) {
        toast.message("Le panier est vide.", { duration: 2200 });
      } else if (Number.isNaN(parsedPlaceId)) {
        toast.message("Erreur : établissement non trouvé.", { duration: 2200 });
      } else {
        toast.message("Erreur de configuration. Veuillez réessayer.", { duration: 2200 });
      }
      return;
    }

    try {
      toast.message("Création de la commande...", { duration: 2200 });

      // 1. Create the order
      const orderRes = await fetch("/api/mysql/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: parsedPlaceId,
          nbrTable: tableNumber,
          tableNumber,
          serviceType: "sur_place",
          paymentMethod: paymentMethod || "cash",
          pourboire: tipAmount || 0,
        }),
      });

      if (!orderRes.ok) {
        const errorData = await orderRes.json().catch(() => ({ error: "Erreur inconnue" }));
        const errorMsg = errorData?.error || "Impossible de créer la commande.";
        toast.message(errorMsg, { duration: 2200 });
        return;
      }

      const order = await orderRes.json();

      // 2. Move items from table_carts to commandes_products
      const cartItemsToMove = sharedCart.lines.filter((l) => l.ownedByMe);
      for (const item of cartItemsToMove) {
        const itemRes = await fetch("/api/mysql/order-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commandeId: order.id,
            menuId: parseInt(String(item.productId)),
            quantite: parseInt(String(item.quantity)),
            prix: parseFloat(String(item.unitPriceDh)),
            comment: item.note || "",
            addedBySessionId: sharedCart.sessionId,
            addedByName: customerProfile?.firstName || null,
          }),
        });

        if (!itemRes.ok) {
          const errorData = await itemRes.json().catch(() => ({ error: "Erreur inconnue" }));
          throw new Error(`Impossible d'ajouter un article: ${errorData?.error || "erreur"}`);
        }
      }

      // 3. Calculate total from items and update order
      const orderTotal = cartItemsToMove.reduce((sum, item) => {
        return sum + item.unitPriceDh * item.quantity;
      }, 0);

      const updateRes = await fetch(`/api/mysql/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total: orderTotal,
        }),
      });

      if (!updateRes.ok) {
        console.error("Warning: Failed to update order total, but items were added");
      }

      // 4. Clear ALL carts from table_carts for this table
      await sharedCart.clearAll();

      toast.success("Commande créée avec succès!", {
        duration: 2000,
        className: "border-sam-success/30 bg-sam-success text-white",
      });

      setCartOpen(false);

      // Redirect to order confirmation page
      if (slug) {
        navigate(`/${slug}/order-confirmation/${order.id}`);
      }
    } catch (error) {
      console.error("Error submitting order:", error);
      toast.message("Erreur lors de la création de la commande.", { duration: 2200 });
    }
  }, [currentPlaceId, tableNumber, sharedCart, customerProfile?.firstName, setCartOpen, slug, navigate]);

  // Show error if slug is empty
  if (!slug) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-red-900">Établissement non spécifié</h2>
              <p className="text-sm text-red-700 mt-1">Un slug d'établissement est requis pour accéder à cette page.</p>
              <button
                onClick={() => navigate("/")}
                className="mt-3 text-sm font-medium text-red-600 hover:text-red-700"
              >
                Retour à l'accueil →
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Geofence check - after all hooks are declared
  if (!isSharedMode && (geoState.status !== "ready" || !geoState.inside)) {
    return (
      <main>
        <VenueHeader
          name={currentVenue.name}
          tagline={currentVenue.tagline}
          logoImageSrc={currentVenue.logoImageSrc || currentVenue.logo}
          logoAlt={currentVenue.logoAlt}
          heroImageSrc={currentVenue.heroImageSrc || currentVenue.img}
          heroAlt={currentVenue.heroAlt}
        />
        <GeoGate
          state={geoState}
          radiusMeters={geoFenceConfig.radiusMeters}
          onRetry={requestGeo}
        />
      </main>
    );
  }

  return (
    <main className="pb-32">
      <CustomerSetupGate
        open={setupOpen}
        initial={customerProfile}
        onComplete={(profile) => {
          setCustomerProfile(profile);
          setSetupOpen(false);
        }}
      />

      {joinCandidate && tableNumber ? (
        <JoinTableOrderDialog
          open
          tableNumber={tableNumber}
          onOpenChange={() => { }}
          onJoin={() => void qrOrder.joinExisting(joinCandidate)}
          onCreateNew={() => void qrOrder.createNew()}
        />
      ) : null}

      <VenueHeader
        name={currentVenue.name}
        tagline={currentVenue.tagline}
        logoImageSrc={currentVenue.logoImageSrc || currentVenue.logo}
        logoAlt={currentVenue.logoAlt}
        heroImageSrc={currentVenue.heroImageSrc || currentVenue.img}
        heroAlt={currentVenue.heroAlt}
      />

      <CategoryNav
        categories={categoriesWithAll}
        selectedId={highlightedCategory || selectedCategory}
        onSelect={(id) => {
          setHighlightedCategory(null); // Clear auto-highlight when user clicks
          scrollToCategory(id);
        }}
        leading={
          <Button
            type="button"
            onClick={goHome}
            className={cn(
              "h-10 w-10 rounded-full px-0",
              "bg-white text-sam-red",
              "border border-border shadow-sm shadow-black/10",
              "hover:bg-sam-gray-50 active:scale-[0.99]",
            )}
            aria-label="Accueil"
            title="Accueil"
          >
            <Home className="h-4 w-4" />
          </Button>
        }
      />

      {/* Join Modal Overlay */}
      {needsJoin && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
      )}

      {needsJoin && (
        <div className="mx-4 mb-4 mt-4 rounded-2xl border border-sam-red/50 bg-sam-red/10 p-4 text-center">
          <p className="text-sm font-semibold text-sam-red">
            Veuillez rejoindre la commande de table avant de commander.
          </p>
        </div>
      )}

      <CartExpirationAlert
        timeRemainingSeconds={isSharedMode ? sharedCart.timeRemainingSeconds : cart.timeRemainingSeconds}
        itemCount={isSharedMode ? sharedCart.itemCount : cart.itemCount}
      />

      <div className="px-4 pt-4" style={{ opacity: needsJoin ? 0.5 : 1, pointerEvents: needsJoin ? "none" : "auto" }}>
        <div className="flex w-full items-center gap-2 py-1">
          <BadgeFilterSheet
            allBadges={badgeFiltersOrdered}
            selectedBadges={selectedBadges}
            onChange={setSelectedBadges}
          />

          <SortMenu
            value={sort}
            onChange={setSort}
            className="h-10 flex-1 min-w-0 rounded-full px-3 text-sm"
          />
        </div>
      </div>

      <div className="mt-3" style={{ opacity: needsJoin ? 0.5 : 1, pointerEvents: needsJoin ? "none" : "auto" }}>
        {menu.categories.map((c) => {
          const sectionProducts = filteredProducts.filter((p) => p.categoryId === c.id);

          // Skip category if no products to show (after badge filtering)
          if (sectionProducts.length === 0) return null;

          return (
            <section key={c.id} id={`category-${c.id}`} className="scroll-mt-28">
              <div className="px-4 pb-2 pt-4">
                <h2 className="text-lg font-semibold text-foreground">{c.label}</h2>
              </div>

              <div className="divide-y divide-border">
                {sectionProducts.map((p) => {
                  const isInCart = isSharedMode
                    ? sharedCart.hasAnyForProduct(parseInt(p.id, 10))
                    : soloLineByProductId.has(p.id);

                  const soloLine = soloLineByProductId.get(p.id) ?? null;

                  const note = isSharedMode
                    ? (draftNotes[p.id] ?? sharedCart.myDraftNoteForProduct(p.id) ?? "")
                    : soloLine
                      ? soloLine.note
                      : (draftNotes[p.id] ?? "");

                  const addDisabled = isSharedMode ? orderLocked : menu.status === "loading";

                  return (
                    <ProductCard
                      key={p.id}
                      product={p}
                      isInCart={isInCart}
                      note={note}
                      onImageClick={() => {
                        setSelectedProduct(p);
                        setProductDetailOpen(true);
                      }}
                      onNoteChange={(next) => {
                        if (!isSharedMode && soloLine) {
                          cart.setNote(p.id, next);
                          return;
                        }
                        setDraftNotes((prev) => ({ ...prev, [p.id]: next }));
                      }}
                      isAddDisabled={addDisabled}
                      onAdd={() => (isSharedMode ? void handleAddShared(p.id) : handleAddSolo(p.id))}
                      placeId={currentPlaceId}
                      categoryId={p.categoryId}
                      onVoteUpdate={(newVotes) => {
                        // Update the local product votes count
                        const updatedMenu = {
                          ...menu,
                          products: menu.products.map((prod) =>
                            prod.id === p.id ? { ...prod, likes: newVotes } : prod
                          ),
                        };
                        // Note: If you need to update global state, handle it here
                      }}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}

        {filteredProducts.length === 0 && (
          <div className="px-4 py-16 text-center">
            <p className="text-sm font-medium text-foreground">Aucun résultat.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Essayez de désactiver un filtre ou de choisir une autre catégorie.
            </p>
          </div>
        )}
      </div>






      <FloatingCartBar
        partySize={drawerPartySize}
        itemCount={isSharedMode ? sharedCart.itemCount : cart.itemCount}
        totalDh={isSharedMode ? sharedCart.totalDh : cart.totalDh}
        onOpenCart={() => !needsJoin && setCartOpen(true)}
        timeRemainingSeconds={isSharedMode ? sharedCart.timeRemainingSeconds : cart.timeRemainingSeconds}
        className={needsJoin ? "opacity-50 pointer-events-none" : undefined}
      />

      {isSharedMode && tableNumber ? (
        <SharedCartDrawer
          open={cartOpen}
          onOpenChange={setCartOpen}
          tableNumber={tableNumber}
          partySize={drawerPartySize}
          locked={orderLocked}
          lines={sharedCart.lines}
          totalDh={sharedCart.totalDh}
          itemCount={sharedCart.itemCount}
          onSetQuantity={sharedCart.setQuantity}
          onSetNote={sharedCart.setNote}
          onClearMine={sharedCart.clearMine}
          onSubmit={handleSubmitSharedOrder}
          onEditCustomer={() => setSetupOpen(true)}
          onAddProduct={async (product) => {
            // Add product from upsell with empty note
            const ok = await sharedCart.add({ product, note: "" });
            if (ok) {
              toast.success(`${product.title} ajouté`, {
                duration: 2000,
                position: "top-center",
                className: "border-sam-success/30 bg-sam-success text-white",
              });
            }
          }}
          availableCategories={mysqlCategories || menu.categories}
          placeId={establishment?.placeId}
        />
      ) : (
        <CartDrawer
          open={cartOpen}
          onOpenChange={setCartOpen}
          customerProfile={customerProfile}
          onEditCustomer={() => setSetupOpen(true)}
          placeId={establishment?.placeId}
          slug={slug}
          availableCategories={mysqlCategories || menu.categories}
        />
      )}


      <ProductDetailModal
        product={selectedProduct}
        open={productDetailOpen}
        onOpenChange={setProductDetailOpen}
        onAddToCart={(note) => {
          if (!selectedProduct) return;
          const existingNote = (draftNotes[selectedProduct.id] ?? "").trim();
          if (note.trim().length > 0) {
            setDraftNotes((prev) => ({ ...prev, [selectedProduct.id]: note }));
          }
          handleAddSolo(selectedProduct.id);
        }}
        isInCart={selectedProduct ? soloLineByProductId.has(selectedProduct.id) : false}
        isAddDisabled={menu.status === "loading"}
      />
    </main>
  );
}
