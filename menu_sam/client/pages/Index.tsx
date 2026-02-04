import * as React from "react";

import { toast } from "sonner";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useGeoFence } from "@/hooks/use-geo-fence";
import { useCustomerProfile } from "@/hooks/use-customer-profile";
import { useEstablishmentBySlug } from "@/hooks/use-establishment-by-slug";
import { useMySQLMenu } from "@/hooks/use-mysql-menu";
import { getMenuItemImageUrl, getLogoUrl, getBannerImageUrl } from "@/lib/image-urls";

import { FirstVisitAdDialog } from "@/components/ads/first-visit-ad-dialog";
import { CustomerSetupGate } from "@/components/customer/customer-setup-gate";
import { GeoGate } from "@/components/geo/geo-gate";
import { VenueHeader } from "@/components/menu/venue-header";
import { CommunityBlock } from "@/components/table/community-block";
import { InfoPratique } from "@/components/table/info-pratique";
import { TableServices } from "@/components/table/table-services";
import { WelcomeBlock } from "@/components/table/welcome-block";
import { ChatDrawer } from "@/components/chat/chat-drawer";
import { DraggableChatButton } from "@/components/chat/draggable-chat-button";
import { ReviewSubmissionDialog } from "@/components/review/review-submission-dialog";
import { Button } from "@/components/ui/button";
import { venueProfile } from "@/lib/menu-data";
import { useLiveMenuData } from "@/hooks/use-live-menu-data";
import { cn } from "@/lib/utils";
import { useCart } from "@/state/cart-store";
import { updateFavicon } from "@/lib/favicon";

import { AlertCircle } from "lucide-react";

export default function Index() {
  const location = useLocation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const cart = useCart();
  const { profile: customerProfile, setProfile: setCustomerProfile } = useCustomerProfile();

  // Fetch establishment by slug if provided, otherwise use default
  const { establishment, loading: establishmentLoading, error: establishmentError } = useEstablishmentBySlug(slug);

  // Fetch menu from MySQL by placeId
  const currentPlaceId = establishment?.placeId || parseInt(import.meta.env.VITE_SAM_ESTABLISHMENT_ID || "0");
  const { categories: mysqlCategories, items: mysqlItems, loading: menuLoading } = useMySQLMenu(currentPlaceId);

  // Fallback to live menu data if MySQL menu not available
  const liveMenu = useLiveMenuData();

  // Transform MySQL data to match MenuCategory and MenuProduct format
  const menu = React.useMemo(() => {
    // If MySQL menu has data, use it; otherwise fall back to live menu
    if (mysqlCategories.length > 0 && mysqlItems.length > 0) {
      return {
        status: menuLoading ? "loading" : "ready",
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
    // Fall back to live menu data
    return { ...liveMenu, status: liveMenu.status };
  }, [mysqlCategories, mysqlItems, menuLoading, liveMenu]);

  const [setupOpen, setSetupOpen] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);

  const menuHref = React.useMemo(() => {
    const sp = new URLSearchParams(location.search);
    const raw = sp.get("t") ?? sp.get("table");
    const basePath = slug ? `/${slug}/menu` : "/menu";
    if (!raw) return basePath;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return basePath;
    return `${basePath}?table=${parsed}`;
  }, [location.search, slug]);

  // Use establishment data (dynamic or fallback to default)
  const currentVenue = establishment
    ? {
        name: establishment.name,
        tagline: establishment.tagline || establishment.name,
        logoImageSrc: getLogoUrl(establishment.slug, establishment.logo),
        logoAlt: establishment.name,
        heroImageSrc: getBannerImageUrl(establishment.banniereImg || establishment.img),
        heroAlt: establishment.name,
        geoFence: venueProfile.geoFence,
        placeId: establishment.placeId,
      }
    : { ...venueProfile, placeId: currentPlaceId };

  // Update favicon when establishment logo loads
  React.useEffect(() => {
    const logoUrl = currentVenue.logoImageSrc || currentVenue.logo;
    if (logoUrl) {
      updateFavicon(logoUrl);
    }
  }, [currentVenue.logoImageSrc, currentVenue.logo]);

  // Build geoFenceConfig from establishment data when available, otherwise use fallback
  const geoFenceConfig = React.useMemo(() => {
    if (establishment && establishment.latitude !== undefined && establishment.langitude !== undefined) {
      return {
        enabled: establishment.geoFenceEnabled,
        latitude: establishment.latitude,
        longitude: establishment.langitude, // Note: database field is "langitude" (typo), map to "longitude"
        radiusMeters: establishment.geoFenceRadiusMeters ?? 0,
      };
    }
    return currentVenue.geoFence || venueProfile.geoFence;
  }, [establishment]);

  const { state: geoState, request: requestGeo } = useGeoFence(geoFenceConfig);

  const handleAccessMenu = React.useCallback(() => {
    if (customerProfile) {
      navigate(menuHref);
      return;
    }
    setSetupOpen(true);
  }, [customerProfile, menuHref, navigate]);


  const handleTableServiceAction = React.useCallback(
    async (id: "server" | "bill") => {
      const labelById: Record<typeof id, string> = {
        server: "Votre demande est transmise instantanément à l’équipe.",
        bill: "Votre demande est transmise instantanément à l’équipe.",
      };

      const typeById: Record<typeof id, string> = {
        server: "serveur",
        bill: "addition",
      };

      toast.success(labelById[id], {
        duration: 2200,
        className: "border-sam-success/30 bg-sam-success text-white",
      });

      // Extract table number from URL
      const sp = new URLSearchParams(location.search);
      const tableParam = sp.get("t") ?? sp.get("table");
      const tableNumber = tableParam ? Number.parseInt(tableParam, 10) : 0;

      // Send notification to Pro dashboard
      try {
        await fetch("/api/mysql/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            placeId: currentVenue.placeId,
            tableNumber: tableNumber || 0,
            type: typeById[id],
            message: labelById[id],
            priority: "normal",
          }),
        });
      } catch (error) {
        console.error("Error sending notification:", error);
      }
    },
    [location.search, currentVenue.placeId],
  );

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

  // Show error if establishment not found with slug
  if (establishmentError) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-red-900">Établissement non trouvé</h2>
              <p className="text-sm text-red-700 mt-1">{establishmentError}</p>
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

  const isInsideVenue = geoState.status === "ready" ? geoState.inside : false;

  // Block page with slug if geo_fence is enabled and user is outside
  const shouldBlockByGeoFence =
    slug && // Only if slug is provided (establishment-specific page)
    establishment?.geoFenceEnabled &&
    geoState.status === "ready" &&
    !geoState.inside;

  if (shouldBlockByGeoFence) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-red-900">Accès non autorisé</h2>
              <p className="text-sm text-red-700 mt-1">
                Vous devez être à proximité de l'établissement pour accéder à cette page.
              </p>
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

  if (!isInsideVenue) {
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
      <FirstVisitAdDialog href={menuHref} />
      <CustomerSetupGate
        open={setupOpen}
        initial={customerProfile}
        onComplete={(profile) => {
          setCustomerProfile(profile);
          setSetupOpen(false);
          navigate(menuHref);
        }}
      />

      <VenueHeader
        name={currentVenue.name}
        tagline={currentVenue.tagline}
        logoImageSrc={currentVenue.logoImageSrc || currentVenue.logo}
        logoAlt={currentVenue.logoAlt}
        heroImageSrc={currentVenue.heroImageSrc || currentVenue.img}
        heroAlt={currentVenue.heroAlt}
      />

      <WelcomeBlock onViewMenu={handleAccessMenu} />
      <TableServices onAction={handleTableServiceAction} />
      <InfoPratique establishment={establishment} />
      <CommunityBlock
        placeId={currentPlaceId}
        placeContacts={establishment?.place_contacts}
        reviewGoogleId={establishment?.reviewGoogleId}
        tripadvisorLink={establishment?.tripadvisorLink}
        onReviewSubmission={() => setReviewOpen(true)}
      />

      <DraggableChatButton open={chatOpen} onClick={() => setChatOpen(true)} />

      <ChatDrawer
        open={chatOpen}
        onOpenChange={setChatOpen}
        context={{ categories: menu.categories, products: menu.products }}
        placeName={establishment?.name}
        placeId={currentPlaceId}
        useOpenAi={true}
        onAddToCart={(productId) => {
          const product = menu.products.find((p) => p.id === productId);
          if (!product) return;
          cart.add(product);
        }}
        getCartSnapshot={() => ({
          lines: cart.lines.map((l) => ({
            title: l.product.title,
            quantity: l.quantity,
            unitPriceDh: l.product.priceDh,
          })),
          totalDh: cart.totalDh,
        })}
      />

      <ReviewSubmissionDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        placeId={currentPlaceId}
      />

    </main>
  );
}
