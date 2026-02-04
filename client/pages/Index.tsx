import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Heart, UtensilsCrossed, Dumbbell, Zap, Building2, Landmark, ShoppingBag, BadgePercent, Award, Star, CalendarCheck, BookOpen, Calendar, ArrowRight, Sparkles } from "lucide-react";
import * as LucideIcons from "lucide-react";

import { Header } from "@/components/Header";
import { AdaptiveSearchForm } from "@/components/SearchInputs/AdaptiveSearchForm";
import { UnifiedSearchInput } from "@/components/SearchInputs/UnifiedSearchInput";
import { CategorySelector } from "@/components/home/CategorySelector";
import { CitiesSection } from "@/components/home/CitiesSection";
import { HomeVideosSection } from "@/components/home/HomeVideosSection";
import { HomeTakeoverBanner } from "@/components/home/HomeTakeoverBanner";
import { IconButton } from "@/components/ui/icon-button";
import { applySeo, clearJsonLd, setJsonLd } from "@/lib/seo";
import { getPublicHomeFeed, getPublicUniverses, getPublicHomeSettings, getFeaturedPack, trackAdImpression, trackAdClick, type PublicHomeFeedItem, type PublicUniverse, type PublicHomeSettings, type FeaturedPackItem } from "@/lib/publicApi";
import { listPublicBlogArticles, isPublicBlogListItemV2, type PublicBlogListItem } from "@/lib/blog";
import { useI18n } from "@/lib/i18n";
import type { ActivityCategory } from "@/lib/taxonomy";
import { readSearchState } from "@/lib/searchState";
import { getVisitSessionId } from "@/lib/pro/visits";
import { isAuthed, openAuthModal } from "@/lib/auth";
import { useScrollContext } from "@/lib/scrollContext";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";
import { getFavorites, addFavorite, removeFavorite, type FavoriteItem } from "@/lib/userData";

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
}: {
  value: string;
  onChange: (universe: string) => void;
  universes: UniverseDisplay[];
}) {
  const baseClassName =
    "rounded-xl border transition flex flex-col items-center justify-center gap-2 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#6a000f]";

  const activeClassName = "bg-white border-white text-[#a3001d]";

  const renderButton = (args: {
    universe: UniverseDisplay;
    className: string;
    iconClassName: string;
    labelClassName: string;
  }) => {
    const IconComponent = args.universe.icon;
    const isActive = value === args.universe.id;

    return (
      <button
        key={args.universe.id}
        type="button"
        onClick={() => onChange(args.universe.id)}
        className={`${args.className} ${baseClassName} ${isActive ? activeClassName : "bg-white/5 border-white/25 text-white/90"}`}
        aria-pressed={isActive}
        aria-label={args.universe.label}
      >
        <IconComponent className={args.iconClassName} />
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
  slug?: string | null;
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
  slug?: string | null;
  name: string;
  universe: string;
  category?: string;
  location?: string;
  city?: string | null;
}): string {
  // Use buildEstablishmentUrl for slug-based URLs
  const basePath = buildEstablishmentUrl({
    id: args.id,
    slug: args.slug,
    name: args.name,
    universe: args.universe,
  });

  const qs = new URLSearchParams();
  qs.set("title", args.name);
  if (args.category) qs.set("category", args.category);
  if (args.location) qs.set("location", args.location);
  if (args.city) qs.set("city", args.city);

  const query = qs.toString();
  return query ? `${basePath}?${query}` : basePath;
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

// Featured Pack Card (Sponsored card in sections)
function FeaturedPackCard({
  item,
  href,
  onAdClick,
}: {
  item: FeaturedPackItem;
  href: string;
  onAdClick: () => void;
}) {
  return (
    <div className="flex-shrink-0 w-56 md:w-60 rounded-xl overflow-hidden hover:shadow-lg transition flex flex-col bg-white relative">
      {/* Sponsored badge */}
      <div className="absolute top-2 left-2 z-20">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
          <Sparkles className="w-3 h-3" />
          <em className="not-italic">Sponsorisé</em>
        </span>
      </div>

      {/* Image container */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl group">
        <img
          src={item.establishment.cover_url || "/placeholder.svg"}
          alt={item.establishment.name}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
        />
        <Link
          to={href}
          onClick={onAdClick}
          className="absolute inset-0 z-10"
          aria-label={item.establishment.name}
        />
      </div>

      {/* Content */}
      <div className="py-3 px-1 flex flex-col flex-grow">
        <h3 className="font-semibold text-sm text-slate-900 leading-tight line-clamp-2 mb-1">
          <Link to={href} onClick={onAdClick} className="hover:text-primary transition">
            {item.establishment.name}
          </Link>
        </h3>
        <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-1">
          {item.establishment.subcategory && <span>{item.establishment.subcategory}</span>}
          {item.establishment.subcategory && item.establishment.city && <span>·</span>}
          {item.establishment.city && <span className="truncate">{item.establishment.city}</span>}
        </div>
        {item.establishment.avg_rating && (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>{item.establishment.avg_rating.toFixed(1)}</span>
            {item.establishment.review_count && (
              <span className="text-slate-400">({item.establishment.review_count})</span>
            )}
          </div>
        )}
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
      className="flex-shrink-0 w-[240px] md:w-80 group"
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
    <section className="relative bg-gradient-to-r from-primary to-[#6a000f] -mx-4 px-4 py-6 md:py-10">
      <div className="container mx-auto relative">
        {/* Header avec contrôles en haut à droite */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl md:text-2xl font-bold text-white">Blog</h2>
          <div className="flex items-center gap-1.5 -mr-1">
            <Link
              to="/blog"
              className="text-white/90 text-xs font-medium hover:text-white transition mr-1"
            >
              {locale === "en" ? "See more" : "Voir plus"}
            </Link>
            <button
              type="button"
              onClick={onScrollLeft}
              className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition"
              aria-label="Previous"
            >
              <ChevronLeft className="w-3 h-3 md:w-3.5 md:h-3.5 text-white" />
            </button>
            <button
              type="button"
              onClick={onScrollRight}
              className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition"
              aria-label="Next"
            >
              <ChevronRight className="w-3 h-3 md:w-3.5 md:h-3.5 text-white" />
            </button>
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
  featuredPack,
  onFeaturedClick,
}: {
  title: string;
  viewAllHref: string;
  items: HomeCard[];
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string, name: string, universe: string) => void;
  scrollRef: RefObject<HTMLDivElement>;
  onScrollLeft: () => void;
  onScrollRight: () => void;
  selectedCity: string | null;
  showDistance: boolean;
  tMonthLabel: string;
  featuredPack?: FeaturedPackItem | null;
  onFeaturedClick?: (campaignId: string, destinationUrl: string) => void;
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
          {/* Featured Pack (Sponsored) card at the beginning */}
          {featuredPack && (
            <FeaturedPackCard
              item={featuredPack}
              href={buildDetailsHref({
                id: featuredPack.establishment.id,
                slug: featuredPack.establishment.slug,
                name: featuredPack.establishment.name,
                universe: featuredPack.establishment.universe ?? "restaurants",
                category: featuredPack.establishment.subcategory ?? undefined,
                location: featuredPack.establishment.city ?? undefined,
                city: selectedCity,
              })}
              onAdClick={() =>
                onFeaturedClick?.(
                  featuredPack.campaign_id,
                  buildDetailsHref({
                    id: featuredPack.establishment.id,
                    slug: featuredPack.establishment.slug,
                    name: featuredPack.establishment.name,
                    universe: featuredPack.establishment.universe ?? "restaurants",
                  })
                )
              }
            />
          )}

          {items.map((card) => {
            const href = buildDetailsHref({
              id: card.id,
              slug: card.slug,
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
                onToggleFavorite={() => onToggleFavorite(card.id, card.name, card.universe)}
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

  // Only show universe selector/tabs if more than one universe is active
  const showUniverseSelector = displayUniverses.length > 1;

  // Determine the default universe: if only one exists, use it; otherwise prefer "restaurants" or first one
  const defaultUniverse = useMemo(() => {
    if (displayUniverses.length === 1) return displayUniverses[0].id;
    const fromParam = parseUniverseParam(universeParam, displayUniverses);
    if (fromParam) return fromParam;
    // Prefer "restaurants" if available, otherwise use first universe
    const hasRestaurants = displayUniverses.some((u) => u.id === "restaurants");
    return hasRestaurants ? "restaurants" : displayUniverses[0]?.id ?? "restaurants";
  }, [displayUniverses, universeParam]);

  const [selectedUniverse, setSelectedUniverse] = useState<string>(() => defaultUniverse);

  useEffect(() => {
    // When universes change or param changes, update selection
    if (selectedUniverse !== defaultUniverse) {
      setSelectedUniverse(defaultUniverse);
    }
  }, [defaultUniverse, selectedUniverse]);

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

  // Initialize favorites from localStorage
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    const stored = getFavorites();
    return new Set(stored.map((f) => f.id));
  });

  // Helper to determine favorite kind from universe
  const getKindFromUniverse = (universe: string): FavoriteItem["kind"] => {
    return universe === "hebergement" ? "hotel" : "restaurant";
  };

  const toggleFavorite = useCallback((establishmentId: string, name: string, universe: string) => {
    // Check if user is authenticated before adding to favorites
    if (!isAuthed()) {
      openAuthModal();
      return;
    }

    const kind = getKindFromUniverse(universe);
    const isFav = favorites.has(establishmentId);

    if (isFav) {
      // Remove from localStorage
      removeFavorite({ kind, id: establishmentId });
    } else {
      // Add to localStorage
      addFavorite({
        kind,
        id: establishmentId,
        title: name,
        createdAtIso: new Date().toISOString(),
      });
    }

    // Update local state
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(establishmentId)) next.delete(establishmentId);
      else next.add(establishmentId);
      return next;
    });
  }, [favorites]);

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

  // Unified search state
  const [searchCity, setSearchCity] = useState(() => selectedCity ?? "");
  const [searchQuery, setSearchQuery] = useState("");

  const handleUnifiedSearch = useCallback(
    (params: { city: string; query: string; category?: string }) => {
      const qs = new URLSearchParams();
      if (params.city) qs.set("city", params.city);
      if (params.query) qs.set("q", params.query);
      if (selectedUniverse && selectedUniverse !== "restaurants") {
        qs.set("universe", selectedUniverse);
      }
      // Pass category for filtered search (cuisine, dish, tag, etc.)
      if (params.category && params.category !== "establishment") {
        qs.set("category", params.category);
      }
      navigate(`/results?${qs.toString()}`);
    },
    [navigate, selectedUniverse]
  );

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
          slug: item.slug,
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

  // Featured Pack (Sponsored) state - one per section
  const [featuredPacks, setFeaturedPacks] = useState<{
    best_offers: FeaturedPackItem | null;
    selected_for_you: FeaturedPackItem | null;
    nearby: FeaturedPackItem | null;
    most_booked: FeaturedPackItem | null;
  }>({
    best_offers: null,
    selected_for_you: null,
    nearby: null,
    most_booked: null,
  });
  const [featuredImpressionIds, setFeaturedImpressionIds] = useState<Map<string, string>>(new Map());

  // Load featured packs for each section
  useEffect(() => {
    let cancelled = false;
    const excludeIds: string[] = [];

    const loadFeaturedPacks = async () => {
      const sections = ["best_offers", "selected_for_you", "nearby", "most_booked"] as const;
      const packs: Record<string, FeaturedPackItem | null> = {};
      const impressionMap = new Map<string, string>();

      for (const section of sections) {
        try {
          const response = await getFeaturedPack({
            section,
            universe: selectedUniverse,
            exclude: excludeIds,
          });

          if (cancelled) return;

          if (response.featured) {
            packs[section] = response.featured;
            excludeIds.push(response.featured.establishment.id);

            // Track impression
            try {
              const impResult = await trackAdImpression({
                campaign_id: response.featured.campaign_id,
                position: 1,
                search_query: section,
              });
              impressionMap.set(response.featured.campaign_id, impResult.impression_id);
            } catch (e) {
              console.error("[FeaturedPack] Failed to track impression:", e);
            }
          } else {
            packs[section] = null;
          }
        } catch (e) {
          console.error(`[FeaturedPack] Failed to load for ${section}:`, e);
          packs[section] = null;
        }
      }

      if (!cancelled) {
        setFeaturedPacks({
          best_offers: packs.best_offers ?? null,
          selected_for_you: packs.selected_for_you ?? null,
          nearby: packs.nearby ?? null,
          most_booked: packs.most_booked ?? null,
        });
        setFeaturedImpressionIds(impressionMap);
      }
    };

    loadFeaturedPacks();

    return () => {
      cancelled = true;
    };
  }, [selectedUniverse]);

  // Handle click on featured pack
  const handleFeaturedPackClick = useCallback(
    async (campaignId: string, destinationUrl: string) => {
      const impressionId = featuredImpressionIds.get(campaignId);
      try {
        await trackAdClick({
          campaign_id: campaignId,
          impression_id: impressionId,
          destination_url: destinationUrl,
        });
      } catch (e) {
        console.error("[FeaturedPack] Failed to track click:", e);
      }
    },
    [featuredImpressionIds]
  );

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

      {/* Home Takeover Banner (if active today) */}
      <HomeTakeoverBanner />

      {/* Mobile Hero - TheFork style */}
      <section className="md:hidden relative text-white bg-gradient-to-b from-primary to-[#6a000f]">
        {/* Hero Image - centered dish/establishment visual */}
        <div className="pt-4 pb-3 flex justify-center">
          {(() => {
            const currentUniverse = displayUniverses.find(u => u.id === selectedUniverse);
            const universeImageUrl = currentUniverse?.imageUrl;
            const IconComponent = currentUniverse?.icon ?? UtensilsCrossed;

            // Priority: 1) Universe image, 2) Hero background image, 3) Icon fallback
            if (universeImageUrl) {
              return (
                <img
                  src={universeImageUrl}
                  alt={currentUniverse?.label || ""}
                  className="w-32 h-32 object-cover rounded-full shadow-xl border-4 border-white/20"
                />
              );
            }

            if (homeSettings?.hero.background_image_url) {
              return (
                <img
                  src={homeSettings.hero.background_image_url}
                  alt=""
                  className="w-32 h-32 object-cover rounded-full shadow-xl border-4 border-white/20"
                />
              );
            }

            return (
              <div className="w-32 h-32 rounded-full bg-white/10 flex items-center justify-center shadow-xl border-4 border-white/20">
                <IconComponent className="w-12 h-12 text-white/60" />
              </div>
            );
          })()}
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

        {/* Universe Pills - horizontal scroll (only show if more than 1 universe) */}
        {showUniverseSelector && (
          <div className="px-4 pb-4">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {displayUniverses.map((universe) => {
                const isActive = selectedUniverse === universe.id;
                const IconComponent = universe.icon;

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
                    <IconComponent className="w-4 h-4" />
                    <span>{universe.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search Form - unified search like TheFork */}
        <div ref={mobileSearchFormRef} className="px-4 pb-8">
          <UnifiedSearchInput
            city={searchCity}
            onCityChange={setSearchCity}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            universe={selectedUniverse}
            onSearch={handleUnifiedSearch}
            placeholder={
              selectedUniverse === "restaurants"
                ? "Cuisine, restaurant, plat..."
                : selectedUniverse === "hebergement"
                ? "Hôtel, type, équipement..."
                : "Activité, lieu..."
            }
            compact={false}
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
        <div className="container mx-auto px-4 relative z-50">
          <div className="text-center mb-9 md:mb-10">
            <h1 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">
              {homeSettings?.hero.title || t("home.hero.title")}
            </h1>
            <p className="text-lg text-white/90 max-w-2xl mx-auto">
              {homeSettings?.hero.subtitle || t("home.hero.subtitle")}
            </p>
          </div>

          {/* Universe selector - only show if more than 1 universe */}
          {showUniverseSelector && (
            <div className="mb-8">
              <UniverseSelector value={selectedUniverse} onChange={handleUniverseChange} universes={displayUniverses} />
            </div>
          )}

          {/* Search bar - aligned with universe selector width */}
          <div ref={desktopSearchFormRef} className="mx-auto max-w-5xl">
            <UnifiedSearchInput
              city={searchCity}
              onCityChange={setSearchCity}
              query={searchQuery}
              onQueryChange={setSearchQuery}
              universe={selectedUniverse}
              onSearch={handleUnifiedSearch}
              placeholder={
                selectedUniverse === "restaurants"
                  ? "Cuisine, nom de restaurant, plat..."
                  : selectedUniverse === "hebergement"
                  ? "Nom d'hôtel, type, équipement..."
                  : "Activité, lieu, type..."
              }
            />
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 pt-0 pb-[2px]">
        {homeError ? <div className="mt-6 text-sm text-red-600">{homeError}</div> : null}

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
          featuredPack={featuredPacks.best_offers}
          onFeaturedClick={handleFeaturedPackClick}
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
          featuredPack={featuredPacks.selected_for_you}
          onFeaturedClick={handleFeaturedPackClick}
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
          featuredPack={featuredPacks.nearby}
          onFeaturedClick={handleFeaturedPackClick}
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
          featuredPack={featuredPacks.most_booked}
          onFeaturedClick={handleFeaturedPackClick}
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

        {/* Videos Section */}
        <HomeVideosSection className="pt-8 pb-4" />

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
