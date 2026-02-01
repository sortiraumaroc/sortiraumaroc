import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Heart, UtensilsCrossed, Dumbbell, Zap, Building2, Landmark, ShoppingBag, BadgePercent, Award, Star, CalendarCheck, BookOpen, Calendar, ArrowRight } from "lucide-react";
import * as LucideIcons from "lucide-react";

import { Header } from "@/components/Header";
import { AdaptiveSearchForm } from "@/components/SearchInputs/AdaptiveSearchForm";
import { CategorySelector } from "@/components/home/CategorySelector";
import { CitiesSection } from "@/components/home/CitiesSection";
import { IconButton } from "@/components/ui/icon-button";
import { applySeo, clearJsonLd, setJsonLd } from "@/lib/seo";
import { getPublicHomeFeed, getPublicUniverses, getPublicHomeSettings, type PublicHomeFeedItem, type PublicUniverse, type PublicHomeSettings } from "@/lib/publicApi";
import { listPublicBlogArticles, isPublicBlogListItemV2, type PublicBlogListItem } from "@/lib/blog";
import { useI18n } from "@/lib/i18n";
import type { ActivityCategory } from "@/lib/taxonomy";
import { readSearchState } from "@/lib/searchState";
import { getVisitSessionId } from "@/lib/pro/visits";
import { isAuthed, openAuthModal } from "@/lib/auth";
import { useScrollContext } from "@/lib/scrollContext";

// Fallback universes in case API fails
const FALLBACK_UNIVERSES = [
  { id: "restaurants", labelKey: "home.universe.restaurants", icon: UtensilsCrossed },
  { id: "sport", labelKey: "home.universe.sport", icon: Dumbbell },
  { id: "loisirs", labelKey: "home.universe.leisure", icon: Zap },
  { id: "hebergement", labelKey: "home.universe.accommodation", icon: Building2 },
  { id: "culture", labelKey: "home.universe.culture", icon: Landmark },
  { id: "shopping", labelKey: "home.universe.shopping", icon: ShoppingBag },
] as const satisfies ReadonlyArray<{ id: ActivityCategory; labelKey: string; icon: any }>;

// Helper to get Lucide icon by name
function getLucideIcon(iconName: string): React.FC<{ className?: string }> {
  const Icon = (LucideIcons as Record<string, React.FC<{ className?: string }>>)[iconName];
  return Icon ?? LucideIcons.Circle;
}

// Type for dynamic universe display
type UniverseDisplay = {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  imageUrl?: string | null;
};

// Keep UNIVERSES for backward compatibility
const UNIVERSES = FALLBACK_UNIVERSES;

function parseUniverseParam(value: string | null, universes: UniverseDisplay[]): string | null {
  if (!value) return null;
  return universes.some((u) => u.id === value) ? value : null;
}

function UniverseSelector({
  value,
  onChange,
  universes,
  showImages,
}: {
  value: string;
  onChange: (universe: string) => void;
  universes: UniverseDisplay[];
  showImages: boolean;
}) {
  const baseClassName =
    "rounded-xl border transition flex flex-col items-center justify-center gap-2 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#6a000f]";

  const activeClassName = "bg-white border-white text-[#a3001d]";

  const renderButton = (args: {
    universe: UniverseDisplay;
    className: string;
    iconClassName: string;
    imageClassName: string;
    labelClassName: string;
  }) => {
    const IconComponent = args.universe.icon;
    const isActive = value === args.universe.id;
    const useImage = showImages && args.universe.imageUrl;

    return (
      <button
        key={args.universe.id}
        type="button"
        onClick={() => onChange(args.universe.id)}
        className={`${args.className} ${baseClassName} ${isActive ? activeClassName : "bg-white/5 border-white/25 text-white/90"}`}
        aria-pressed={isActive}
        aria-label={args.universe.label}
      >
        {useImage ? (
          <img
            src={args.universe.imageUrl!}
            alt=""
            className={args.imageClassName}
          />
        ) : (
          <IconComponent className={args.iconClassName} />
        )}
        <span className={args.labelClassName}>{args.universe.label}</span>
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="hidden md:flex items-center justify-center gap-3">
        {universes.map((universe) =>
          renderButton({
            universe,
            className: "w-[140px] h-[92px] hover:bg-white hover:border-white hover:text-[#a3001d]",
            iconClassName: "w-7 h-7",
            imageClassName: "w-10 h-10 rounded-full object-cover",
            labelClassName: "text-sm font-semibold text-center leading-tight",
          }),
        )}
      </div>

      <div className="md:hidden overflow-x-auto pb-3">
        <div className="flex gap-3 min-w-max px-1">
          {universes.map((universe) =>
            renderButton({
              universe,
              className: "w-[118px] h-[86px]",
              iconClassName: "w-6 h-6",
              imageClassName: "w-8 h-8 rounded-full object-cover",
              labelClassName: "text-xs font-semibold text-center leading-tight",
            }),
          )}
        </div>
      </div>
    </div>
  );
}

const SELECTED_FOR_YOU_TITLE_KEYS: Record<ActivityCategory, string> = {
  restaurants: "home.sections.selected_for_you.title",
  loisirs: "home.sections.selected_for_you.activities.title",
  sport: "home.sections.selected_for_you.sport.title",
  hebergement: "home.sections.selected_for_you.accommodation.title",
  culture: "home.sections.selected_for_you.culture.title",
  shopping: "home.sections.selected_for_you.shopping.title",
  rentacar: "home.sections.selected_for_you.rentacar.title",
};

type HomeCard = {
  id: string;
  name: string;
  universe: string;
  category?: string;
  neighborhood?: string;
  image: string;
  nextAvailability?: string;
  promoPercent: number;
  reservations30d: number;
  bookingEnabled: boolean;
  distanceKm?: number | null;
  curated?: boolean;
};

function formatNextSlotLabel(startsAtIso: string | null): string | null {
  if (!startsAtIso) return null;
  const dt = new Date(startsAtIso);
  if (!Number.isFinite(dt.getTime())) return null;

  const now = new Date();
  const isToday =
    dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() && dt.getDate() === now.getDate();

  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(dt);

  if (isToday) return timeLabel;

  const dayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
  }).format(dt);

  return `${dayLabel} ${timeLabel}`;
}

function buildResultsHref(args: { universe: ActivityCategory; promo?: boolean; city?: string | null }): string {
  const qs = new URLSearchParams();
  qs.set("universe", args.universe);
  if (args.promo) qs.set("promo", "1");
  if (args.city) qs.set("city", args.city);
  return `/results?${qs.toString()}`;
}

function buildDetailsHref(args: {
  id: string;
  name: string;
  universe: string;
  category?: string;
  location?: string;
  city?: string | null;
}): string {
  const base =
    args.universe === "loisirs"
      ? "/loisir"
      : args.universe === "sport"
        ? "/wellness"
        : args.universe === "hebergement"
          ? "/hotel"
          : args.universe === "culture"
            ? "/culture"
            : args.universe === "shopping"
              ? "/shopping"
              : "/restaurant";

  const qs = new URLSearchParams();
  qs.set("title", args.name);
  if (args.category) qs.set("category", args.category);
  if (args.location) qs.set("location", args.location);
  if (args.city) qs.set("city", args.city);

  const query = qs.toString();
  return query ? `${base}/${args.id}?${query}` : `${base}/${args.id}`;
}

function HomeCardTile({
  item,
  href,
  isFavorite,
  onToggleFavorite,
  showDistance,
  i18nMonthLabel,
}: {
  item: HomeCard;
  href: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  showDistance: boolean;
  i18nMonthLabel: string;
}) {
  const { t } = useI18n();

  return (
    <div className="flex-shrink-0 w-56 md:w-60 rounded-xl overflow-hidden hover:shadow-lg transition flex flex-col bg-white">
      {/* Image container - aspect ratio like TheFork */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl group">
        <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />

        <Link to={href} className="absolute inset-0 z-10" aria-label={item.name} />

        {/* Favorite button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white transition"
          aria-label={isFavorite ? t("results.favorite.remove") : t("results.favorite.add")}
        >
          <Heart className={`w-4 h-4 transition ${isFavorite ? "fill-red-500 text-red-500" : "text-slate-400"}`} />
        </button>

        {/* Promo badge */}
        {item.promoPercent > 0 ? (
          <div className="absolute top-2 left-2 z-20">
            <span className="bg-primary text-white px-2 py-0.5 rounded text-[11px] font-bold shadow-sm">
              -{item.promoPercent}%
            </span>
          </div>
        ) : null}

        {/* Curated badge */}
        {item.curated ? (
          <div className="absolute bottom-2 left-2 z-20">
            <span className="bg-black/70 text-white px-2 py-0.5 rounded text-[10px] font-medium">
              {t("home.cards.curated_badge")}
            </span>
          </div>
        ) : null}
      </div>

      {/* Content */}
      <div className="py-3 px-1 flex flex-col flex-grow">
        <h3 className="font-semibold text-sm text-slate-900 leading-tight line-clamp-2 mb-1">
          <Link to={href} className="hover:text-primary transition">
            {item.name}
          </Link>
        </h3>

        <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-1">
          {item.category ? <span>{item.category}</span> : null}
          {item.category && item.neighborhood ? <span>·</span> : null}
          {item.neighborhood ? <span className="truncate">{item.neighborhood}</span> : null}
        </div>

        {showDistance && typeof item.distanceKm === "number" && Number.isFinite(item.distanceKm) ? (
          <p className="text-xs text-slate-400">{item.distanceKm.toFixed(1)} km</p>
        ) : null}

        <p className="text-xs text-slate-400 mt-auto">{`${i18nMonthLabel}: ${item.reservations30d}`}</p>
      </div>
    </div>
  );
}

function formatBlogDate(dateStr: string | null | undefined, locale: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function BlogArticleCard({ item, locale }: { item: PublicBlogListItem; locale: string }) {
  const title = isPublicBlogListItemV2(item) ? String(item.resolved.title || "").trim() : String(item.title || "").trim();
  const excerpt = isPublicBlogListItemV2(item)
    ? String(item.resolved.excerpt || "").trim()
    : String((item as any).short || (item as any).description_google || "").trim();

  const image = (() => {
    const mini = isPublicBlogListItemV2(item) ? String(item.miniature || "").trim() : String((item as any).miniature || "").trim();
    const img = isPublicBlogListItemV2(item) ? String(item.img || "").trim() : String((item as any).img || "").trim();
    return mini || img || null;
  })();

  const category = isPublicBlogListItemV2(item) ? String(item.category || "").trim() : "";
  const date = isPublicBlogListItemV2(item) ? item.published_at : null;

  return (
    <Link
      to={`/blog/${item.slug}`}
      className="flex-shrink-0 w-72 md:w-80 group"
    >
      <div className="rounded-xl overflow-hidden bg-white shadow-md hover:shadow-lg transition-all h-full flex flex-col">
        <div className="aspect-[16/9] bg-slate-100 overflow-hidden relative">
          {image ? (
            <img
              src={image}
              alt=""
              className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
              <BookOpen className="h-10 w-10 text-primary/30" />
            </div>
          )}
          {category && (
            <span className="absolute top-3 left-3 bg-primary text-white text-xs font-medium px-2 py-1 rounded">
              {category}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          <h3 className="font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {title || item.slug}
          </h3>

          {excerpt && (
            <p className="mt-2 text-sm text-slate-600 line-clamp-2 flex-1">{excerpt}</p>
          )}

          <div className="mt-3 flex items-center justify-between text-xs">
            {date && (
              <span className="flex items-center gap-1 text-slate-500">
                <Calendar className="h-3.5 w-3.5" />
                {formatBlogDate(date, locale)}
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-semibold text-primary group-hover:gap-1.5 transition-all">
              {locale === "en" ? "Read" : "Lire"}
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function BlogCarouselSection({
  items,
  locale,
  scrollRef,
  onScrollLeft,
  onScrollRight,
}: {
  items: PublicBlogListItem[];
  locale: string;
  scrollRef: RefObject<HTMLDivElement>;
  onScrollLeft: () => void;
  onScrollRight: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="relative bg-gradient-to-r from-primary to-[#6a000f] -mx-4 px-4 py-8 md:py-10">
      <div className="container mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl md:text-2xl font-bold text-white">Blog</h2>
          <div className="flex items-center gap-3">
            <Link
              to="/blog"
              className="text-white/90 text-sm font-medium hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-md px-1 transition"
            >
              {locale === "en" ? "See more" : "Voir plus"}
            </Link>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onScrollLeft}
                className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition"
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4 text-white" />
              </button>
              <button
                type="button"
                onClick={onScrollRight}
                className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition"
                aria-label="Next"
              >
                <ChevronRight className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>

        <div className="relative group/carousel">
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto pb-2 scroll-smooth scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {items.map((item) => (
              <BlogArticleCard key={item.slug} item={item} locale={locale} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeCarouselSection({
  title,
  viewAllHref,
  items,
  favoriteIds,
  onToggleFavorite,
  scrollRef,
  onScrollLeft,
  onScrollRight,
  selectedCity,
  showDistance,
  tMonthLabel,
}: {
  title: string;
  viewAllHref: string;
  items: HomeCard[];
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  scrollRef: RefObject<HTMLDivElement>;
  onScrollLeft: () => void;
  onScrollRight: () => void;
  selectedCity: string | null;
  showDistance: boolean;
  tMonthLabel: string;
}) {
  const { t } = useI18n();
  return (
    <section className="mb-8 md:mb-10">
      <div className="flex items-center justify-between mb-4 md:mb-5">
        <h2 className="text-xl md:text-2xl font-bold text-foreground">{title}</h2>
        <Link
          to={viewAllHref}
          className="text-primary text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md px-1"
        >
          <span className="hidden md:inline">{t("home.sections.view_all")} </span>→
        </Link>
      </div>

      <div className="relative group/carousel">
        <div
          ref={scrollRef}
          className="flex gap-3 md:gap-4 overflow-x-auto pb-2 scroll-smooth scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map((card) => {
            const href = buildDetailsHref({
              id: card.id,
              name: card.name,
              universe: card.universe,
              category: card.category,
              location: card.neighborhood,
              city: selectedCity,
            });

            return (
              <HomeCardTile
                key={card.id}
                item={card}
                href={href}
                isFavorite={favoriteIds.has(card.id)}
                onToggleFavorite={() => onToggleFavorite(card.id)}
                showDistance={showDistance}
                i18nMonthLabel={tMonthLabel}
              />
            );
          })}
        </div>

        {/* Navigation arrows - hidden on mobile, visible on hover on desktop */}
        <button
          type="button"
          onClick={onScrollLeft}
          className="hidden md:flex absolute left-0 top-1/3 -translate-x-3 z-10 w-10 h-10 rounded-full bg-white shadow-md border border-slate-200 items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity hover:bg-slate-50"
          aria-label={t("common.prev")}
        >
          <ChevronLeft className="w-5 h-5 text-slate-700" />
        </button>
        <button
          type="button"
          onClick={onScrollRight}
          className="hidden md:flex absolute right-0 top-1/3 translate-x-3 z-10 w-10 h-10 rounded-full bg-white shadow-md border border-slate-200 items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity hover:bg-slate-50"
          aria-label={t("common.next")}
        >
          <ChevronRight className="w-5 h-5 text-slate-700" />
        </button>
      </div>
    </section>
  );
}

export default function Home() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const universeParam = searchParams.get("universe");
  const { registerSearchFormRef } = useScrollContext();
  const mobileSearchFormRef = useRef<HTMLDivElement>(null);
  const desktopSearchFormRef = useRef<HTMLDivElement>(null);

  // Register the search form ref for scroll detection (use whichever is visible)
  useEffect(() => {
    const checkAndRegister = () => {
      // Check which one is visible based on display style
      if (mobileSearchFormRef.current && window.innerWidth < 768) {
        registerSearchFormRef(mobileSearchFormRef.current);
      } else if (desktopSearchFormRef.current) {
        registerSearchFormRef(desktopSearchFormRef.current);
      }
    };

    checkAndRegister();
    window.addEventListener("resize", checkAndRegister);

    return () => {
      window.removeEventListener("resize", checkAndRegister);
      registerSearchFormRef(null);
    };
  }, [registerSearchFormRef]);

  // Load universes dynamically from API
  const [dynamicUniverses, setDynamicUniverses] = useState<UniverseDisplay[]>([]);
  const [universesLoaded, setUniversesLoaded] = useState(false);

  // Load home settings (hero background)
  const [homeSettings, setHomeSettings] = useState<PublicHomeSettings | null>(null);

  useEffect(() => {
    getPublicUniverses()
      .then(({ universes }) => {
        const mapped: UniverseDisplay[] = universes.map((u) => ({
          id: u.slug,
          label: locale === "en" ? u.label_en : u.label_fr,
          icon: getLucideIcon(u.icon_name),
          color: u.color,
          imageUrl: u.image_url ?? null,
        }));
        setDynamicUniverses(mapped);
        setUniversesLoaded(true);
      })
      .catch(() => {
        // Fallback to static universes
        const fallback: UniverseDisplay[] = FALLBACK_UNIVERSES.map((u) => ({
          id: u.id,
          label: t(u.labelKey),
          icon: u.icon,
          color: "#a3001d",
        }));
        setDynamicUniverses(fallback);
        setUniversesLoaded(true);
      });

    // Load home settings
    getPublicHomeSettings()
      .then(({ settings }) => {
        setHomeSettings(settings);
      })
      .catch(() => {
        // Use defaults
        setHomeSettings({ hero: { background_image_url: null, overlay_opacity: 0.7 } });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]); // Only re-fetch when locale changes, t is derived from locale

  // Use dynamic universes or fallback
  const displayUniverses = useMemo(() => {
    if (dynamicUniverses.length > 0) return dynamicUniverses;
    // While loading, use fallback
    return FALLBACK_UNIVERSES.map((u) => ({
      id: u.id,
      label: t(u.labelKey),
      icon: u.icon,
      color: "#a3001d",
      imageUrl: null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicUniverses]); // t is stable once locale is set

  // Rule: show images only if ALL universes have an image, otherwise show icons for all
  const allUniversesHaveImages = useMemo(() => {
    if (displayUniverses.length === 0) return false;
    return displayUniverses.every((u) => u.imageUrl && u.imageUrl.trim() !== "");
  }, [displayUniverses]);

  const [selectedUniverse, setSelectedUniverse] = useState<string>(() =>
    parseUniverseParam(universeParam, displayUniverses) ?? "restaurants"
  );

  useEffect(() => {
    const next = parseUniverseParam(universeParam, displayUniverses) ?? "restaurants";
    if (next !== selectedUniverse) setSelectedUniverse(next);
  }, [selectedUniverse, universeParam, displayUniverses]);

  useEffect(() => {
    const title = t("seo.home.title");
    const description = t("seo.home.description");

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const hreflangs: Record<string, string> = {};
    if (baseUrl) {
      hreflangs.fr = baseUrl + "/";
      hreflangs.en = baseUrl + "/en/";
      hreflangs["x-default"] = baseUrl + "/";
    }

    applySeo({
      title,
      description,
      ogType: "website",
      keywords: t("seo.home.keywords"),
      hreflangs: Object.keys(hreflangs).length > 0 ? hreflangs : undefined,
    });

    setJsonLd("home", {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Sortir Au Maroc",
      alternateName: "SAM",
      url: baseUrl || undefined,
      description,
    });

    return () => clearJsonLd("home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount - SEO tags don't need to change

  const handleUniverseChange = (universe: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("universe", universe);
    navigate({ pathname: "/", search: `?${params.toString()}` });
    setSelectedUniverse(universe);
  };

  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const toggleFavorite = useCallback((establishmentId: string) => {
    // Check if user is authenticated before adding to favorites
    if (!isAuthed()) {
      openAuthModal();
      return;
    }
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(establishmentId)) next.delete(establishmentId);
      else next.add(establishmentId);
      return next;
    });
  }, []);

  const selectedCity = useMemo(() => {
    const stored = readSearchState(selectedUniverse);
    return stored.city ? stored.city : null;
  }, [selectedUniverse]);

  const visitSessionId = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return getVisitSessionId();
    } catch {
      return null;
    }
  }, []);

  const favoritesKey = useMemo(() => Array.from(favorites).sort().slice(0, 50).join(","), [favorites]);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [lists, setLists] = useState<null | {
    best_deals: PublicHomeFeedItem[];
    selected_for_you: PublicHomeFeedItem[];
    near_you: PublicHomeFeedItem[];
    most_booked: PublicHomeFeedItem[];
  }>(null);

  const requestUserLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setUserLocation(null);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  // Request geolocation on initial page load
  useEffect(() => {
    if (!navigator.geolocation) return;
    // Check if we already have permission or prompt for it
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        // User denied or error - silently ignore
        setUserLocation(null);
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    setHomeLoading(true);
    setHomeError(null);

    getPublicHomeFeed({
      universe: selectedUniverse,
      city: selectedCity,
      lat: userLocation?.lat,
      lng: userLocation?.lng,
      sessionId: visitSessionId,
      favorites: favoritesKey ? favoritesKey.split(",") : [],
    })
      .then((payload) => {
        if (cancelled) return;
        setLists(payload.lists);
      })
      .catch(() => {
        if (cancelled) return;
        setHomeError(t("common.error.load_failed"));
        setLists({ best_deals: [], selected_for_you: [], near_you: [], most_booked: [] });
      })
      .finally(() => {
        if (cancelled) return;
        setHomeLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoritesKey, selectedCity, selectedUniverse, userLocation?.lat, userLocation?.lng, visitSessionId]); // t is stable once locale is set

  const mapToCards = useCallback(
    (items: PublicHomeFeedItem[], universeFallback: string): HomeCard[] => {
      return (items ?? []).map((item) => {
        const fallbackName = t("establishment.fallback_name");
        const name = (item.name ?? fallbackName).trim() || fallbackName;
        return {
          id: item.id,
          name,
          universe: (item.universe ?? universeFallback).toString(),
          category: item.subcategory ?? undefined,
          neighborhood: item.address ?? item.city ?? undefined,
          image: item.cover_url ?? "/placeholder.svg",
          nextAvailability: formatNextSlotLabel(item.next_slot_at ?? null) ?? undefined,
          promoPercent: typeof item.promo_percent === "number" ? item.promo_percent : 0,
          bookingEnabled: item.booking_enabled === true,
          reservations30d: typeof item.reservations_30d === "number" ? item.reservations_30d : 0,
          distanceKm: typeof item.distance_km === "number" ? item.distance_km : null,
          curated: item.curated === true,
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // t is stable once locale is set
  );

  const bestDealsCards = useMemo(() => mapToCards(lists?.best_deals ?? [], selectedUniverse), [lists?.best_deals, mapToCards, selectedUniverse]);
  const selectedForYouCards = useMemo(
    () => mapToCards(lists?.selected_for_you ?? [], selectedUniverse),
    [lists?.selected_for_you, mapToCards, selectedUniverse],
  );
  const nearYouCards = useMemo(() => mapToCards(lists?.near_you ?? [], selectedUniverse), [lists?.near_you, mapToCards, selectedUniverse]);
  const mostBookedCards = useMemo(
    () => mapToCards(lists?.most_booked ?? [], selectedUniverse),
    [lists?.most_booked, mapToCards, selectedUniverse],
  );

  const offersCarouselRef = useRef<HTMLDivElement>(null);
  const selectedCarouselRef = useRef<HTMLDivElement>(null);
  const nearbyCarouselRef = useRef<HTMLDivElement>(null);
  const mostBookedCarouselRef = useRef<HTMLDivElement>(null);
  const blogCarouselRef = useRef<HTMLDivElement>(null);

  // Blog articles state
  const [blogArticles, setBlogArticles] = useState<PublicBlogListItem[]>([]);

  // Load blog articles
  useEffect(() => {
    listPublicBlogArticles({ locale, limit: 6 })
      .then((items) => {
        const published = items.filter((it) =>
          isPublicBlogListItemV2(it) ? Boolean(it.is_published) : (it as any).active === 1
        );
        setBlogArticles(published);
      })
      .catch(() => {
        setBlogArticles([]);
      });
  }, [locale]);

  const scrollCarousel = (direction: "left" | "right", ref: RefObject<HTMLDivElement>) => {
    if (!ref.current) return;
    // Scroll by approximately 2-3 cards width (cards are now w-56/w-60 = 224px/240px + gap)
    const scrollAmount = 500;
    ref.current.scrollBy({ left: direction === "left" ? -scrollAmount : scrollAmount, behavior: "smooth" });
  };

  const viewAllOffersHref = buildResultsHref({ universe: selectedUniverse, promo: true, city: selectedCity });
  const viewAllUniverseHref = buildResultsHref({ universe: selectedUniverse, city: selectedCity });

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* Mobile Hero - TheFork style */}
      <section className="md:hidden relative text-white bg-gradient-to-b from-primary to-[#6a000f]">
        {/* Hero Image - centered dish/establishment visual */}
        <div className="pt-6 pb-3 flex justify-center">
          {homeSettings?.hero.background_image_url ? (
            <img
              src={homeSettings.hero.background_image_url}
              alt=""
              className="w-40 h-40 object-cover rounded-full shadow-2xl border-4 border-white/20"
            />
          ) : (
            <div className="w-40 h-40 rounded-full bg-white/10 flex items-center justify-center shadow-2xl border-4 border-white/20">
              {(() => {
                const currentUniverse = displayUniverses.find(u => u.id === selectedUniverse);
                const IconComponent = currentUniverse?.icon ?? UtensilsCrossed;
                return <IconComponent className="w-16 h-16 text-white/60" />;
              })()}
            </div>
          )}
        </div>

        {/* Title */}
        <div className="text-center px-6 pb-4">
          <h1 className="text-xl font-bold mb-1 tracking-tight">
            {homeSettings?.hero.title || t("home.hero.title")}
          </h1>
          <p className="text-xs text-white/80">
            {homeSettings?.hero.subtitle || t("home.hero.subtitle")}
          </p>
        </div>

        {/* Universe Pills - horizontal scroll */}
        <div className="px-4 pb-4">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {displayUniverses.map((universe) => {
              const isActive = selectedUniverse === universe.id;
              const IconComponent = universe.icon;
              const showImage = allUniversesHaveImages && universe.imageUrl;

              return (
                <button
                  key={universe.id}
                  type="button"
                  onClick={() => handleUniverseChange(universe.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition ${
                    isActive
                      ? "bg-white text-primary"
                      : "bg-white/15 text-white/90 hover:bg-white/25"
                  }`}
                >
                  {showImage ? (
                    <img
                      src={universe.imageUrl!}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <IconComponent className="w-4 h-4" />
                  )}
                  <span>{universe.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Form - stacked inputs like TheFork */}
        <div ref={mobileSearchFormRef} className="px-4 pb-8 space-y-3">
          <AdaptiveSearchForm
            selectedUniverse={selectedUniverse as ActivityCategory}
            onUniverseChange={handleUniverseChange as (universe: ActivityCategory) => void}
            onSearch={() => {}}
            mobileStackedLayout={true}
          />
        </div>
      </section>

      {/* Desktop Hero - existing style */}
      <section className="hidden md:block relative text-white py-10 md:py-16">
        {/* Background: Image or Gradient */}
        {homeSettings?.hero.background_image_url ? (
          <>
            <img
              src={homeSettings.hero.background_image_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 bg-gradient-to-r from-primary to-[#6a000f]"
              style={{ opacity: homeSettings.hero.overlay_opacity ?? 0.7 }}
              aria-hidden="true"
            />
          </>
        ) : (
          <div
            className="absolute inset-0 bg-gradient-to-r from-primary to-[#6a000f]"
            aria-hidden="true"
          />
        )}

        {/* Content */}
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-9 md:mb-10">
            <h1 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">
              {homeSettings?.hero.title || t("home.hero.title")}
            </h1>
            <p className="text-lg text-white/90 max-w-2xl mx-auto">
              {homeSettings?.hero.subtitle || t("home.hero.subtitle")}
            </p>
          </div>

          <div className="mb-8">
            <UniverseSelector value={selectedUniverse} onChange={handleUniverseChange} universes={displayUniverses} showImages={allUniversesHaveImages} />
          </div>

          <div ref={desktopSearchFormRef}>
            <AdaptiveSearchForm
              selectedUniverse={selectedUniverse as ActivityCategory}
              onUniverseChange={handleUniverseChange as (universe: ActivityCategory) => void}
              onSearch={() => {
                // Search handler lives in the Results page. We keep the form UX identical.
              }}
            />
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 pt-0 pb-[2px]">
        {homeError ? <div className="mt-6 text-sm text-red-600">{homeError}</div> : null}

        {selectedUniverse !== "restaurants" ? (
          <div className="mt-4">
            <button
              type="button"
              className="text-xs underline underline-offset-4 text-slate-600"
              onClick={requestUserLocation}
            >
              {t("home.enable_geolocation_nearby")}
            </button>
          </div>
        ) : null}

        <HomeCarouselSection
          title={t("home.sections.best_offers.title")}
          viewAllHref={viewAllOffersHref}
          items={bestDealsCards}
          favoriteIds={favorites}
          onToggleFavorite={toggleFavorite}
          scrollRef={offersCarouselRef}
          onScrollLeft={() => scrollCarousel("left", offersCarouselRef)}
          onScrollRight={() => scrollCarousel("right", offersCarouselRef)}
          selectedCity={selectedCity}
          showDistance={false}
          tMonthLabel={t("chart.label.reservations_30d")}
        />

        <HomeCarouselSection
          title={t(SELECTED_FOR_YOU_TITLE_KEYS[selectedUniverse])}
          viewAllHref={viewAllUniverseHref}
          items={selectedForYouCards}
          favoriteIds={favorites}
          onToggleFavorite={toggleFavorite}
          scrollRef={selectedCarouselRef}
          onScrollLeft={() => scrollCarousel("left", selectedCarouselRef)}
          onScrollRight={() => scrollCarousel("right", selectedCarouselRef)}
          selectedCity={selectedCity}
          showDistance={false}
          tMonthLabel={t("chart.label.reservations_30d")}
        />

        <HomeCarouselSection
          title={t("home.sections.nearby.title")}
          viewAllHref={viewAllUniverseHref}
          items={nearYouCards}
          favoriteIds={favorites}
          onToggleFavorite={toggleFavorite}
          scrollRef={nearbyCarouselRef}
          onScrollLeft={() => scrollCarousel("left", nearbyCarouselRef)}
          onScrollRight={() => scrollCarousel("right", nearbyCarouselRef)}
          selectedCity={selectedCity}
          showDistance={userLocation != null}
          tMonthLabel={t("chart.label.reservations_30d")}
        />

        <HomeCarouselSection
          title={t("home.sections.most_booked.title")}
          viewAllHref={viewAllUniverseHref}
          items={mostBookedCards}
          favoriteIds={favorites}
          onToggleFavorite={toggleFavorite}
          scrollRef={mostBookedCarouselRef}
          onScrollLeft={() => scrollCarousel("left", mostBookedCarouselRef)}
          onScrollRight={() => scrollCarousel("right", mostBookedCarouselRef)}
          selectedCity={selectedCity}
          showDistance={false}
          tMonthLabel={t("chart.label.reservations_30d")}
        />

        {/* Blog Section */}
        {blogArticles.length > 0 && (
          <BlogCarouselSection
            items={blogArticles}
            locale={locale}
            scrollRef={blogCarouselRef}
            onScrollLeft={() => scrollCarousel("left", blogCarouselRef)}
            onScrollRight={() => scrollCarousel("right", blogCarouselRef)}
          />
        )}

        {/* Cities Section */}
        <CitiesSection className="pt-8 pb-4" />

        {/* How SAM Works Section */}
        {(() => {
          // Default items if not customized in admin
          const defaultHowItWorks = {
            title: "Comment ça marche ?",
            items: [
              { icon: "BadgePercent", title: "Offres exclusives", description: "Profitez de réductions et avantages uniques chez nos établissements partenaires au Maroc." },
              { icon: "Award", title: "Le meilleur choix", description: "Une sélection rigoureuse d'établissements pour toutes vos envies : restaurants, loisirs, bien-être..." },
              { icon: "Star", title: "Avis vérifiés", description: "Des recommandations authentiques de notre communauté pour vous guider dans vos choix." },
              { icon: "CalendarCheck", title: "Réservation facile", description: "Réservez instantanément, gratuitement, partout et à tout moment. 24h/24, 7j/7." },
            ],
          };
          const howItWorks = homeSettings?.how_it_works?.items?.length
            ? homeSettings.how_it_works
            : defaultHowItWorks;

          return (
            <section className="pt-6 pb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8">{howItWorks.title}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {howItWorks.items.map((item, idx) => {
                  const IconComponent = getLucideIcon(item.icon);
                  return (
                    <div key={idx} className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                        <IconComponent className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="font-bold text-lg text-foreground mb-2">{item.title}</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}

        <CategorySelector universe={selectedUniverse} city={selectedCity} />

        {homeLoading ? <div className="py-6 text-sm text-slate-500">{t("common.loading")}</div> : null}
      </main>
    </div>
  );
}
