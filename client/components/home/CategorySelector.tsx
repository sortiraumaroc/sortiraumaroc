import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { useI18n } from "@/lib/i18n";
import type { ActivityCategory, CategoryDisplayItem } from "@/lib/taxonomy";
import { getCategoryDisplayItems } from "@/lib/taxonomy";
import { getPublicCategoryImages, type PublicCategoryImageItem } from "@/lib/publicApi";

type CategorySelectorProps = {
  universe: ActivityCategory;
  city?: string | null;
};

function buildCategoryResultsHref(args: {
  universe: ActivityCategory;
  categoryId: string;
  city?: string | null;
}): string {
  const qs = new URLSearchParams();
  qs.set("universe", args.universe);
  qs.set("category", args.categoryId);
  qs.set("sort", "best");
  if (args.city) qs.set("city", args.city);
  return `/results?${qs.toString()}`;
}

const CATEGORY_TITLE_KEYS: Record<ActivityCategory, string> = {
  restaurants: "home.categories.restaurants.title",
  sport: "home.categories.sport.title",
  loisirs: "home.categories.loisirs.title",
  hebergement: "home.categories.hebergement.title",
  culture: "home.categories.culture.title",
  shopping: "home.categories.shopping.title",
  rentacar: "home.categories.rentacar.title",
};

export function CategorySelector({ universe, city }: CategorySelectorProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use static categories as fallback
  const staticCategories = getCategoryDisplayItems(universe);

  // State for API-loaded categories
  const [apiCategories, setApiCategories] = useState<CategoryDisplayItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    getPublicCategoryImages({ universe })
      .then((response) => {
        if (cancelled) return;
        if (response.items && response.items.length > 0) {
          setApiCategories(
            response.items.map((item: PublicCategoryImageItem) => ({
              id: item.id,
              name: item.name,
              imageUrl: item.imageUrl,
            }))
          );
        }
      })
      .catch(() => {
        // Silently fall back to static categories
      });

    return () => {
      cancelled = true;
    };
  }, [universe]);

  // Use API categories if available, otherwise fall back to static
  const categories = apiCategories ?? staticCategories;

  if (categories.length === 0) return null;

  const scrollCarousel = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = 200;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const titleKey = CATEGORY_TITLE_KEYS[universe];

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl md:text-2xl font-bold text-foreground">
          {t(titleKey)}
        </h2>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="flex justify-between gap-2 overflow-x-auto pb-4 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              href={buildCategoryResultsHref({ universe, categoryId: category.id, city })}
            />
          ))}
        </div>

        <IconButton
          onClick={() => scrollCarousel("left")}
          className="absolute start-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 hidden md:flex"
          aria-label={t("common.prev")}
        >
          <ChevronLeft className="w-5 h-5 text-primary" />
        </IconButton>
        <IconButton
          onClick={() => scrollCarousel("right")}
          className="absolute end-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 hidden md:flex"
          aria-label={t("common.next")}
        >
          <ChevronRight className="w-5 h-5 text-primary" />
        </IconButton>
      </div>
    </section>
  );
}

function CategoryCard({
  category,
  href,
}: {
  category: CategoryDisplayItem;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="flex-shrink-0 group"
    >
      <div className="flex flex-col items-center gap-2">
        <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden ring-2 ring-transparent group-hover:ring-primary transition-all duration-200 shadow-md group-hover:shadow-lg">
          <img
            src={category.imageUrl}
            alt={category.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            onError={(e) => {
              // Fallback to inline SVG placeholder (no external dependency)
              const letter = encodeURIComponent(category.name.charAt(0));
              (e.target as HTMLImageElement).src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='36' fill='%2364748b'%3E${letter}%3C/text%3E%3C/svg%3E`;
            }}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
        </div>
        <span className="text-xs md:text-sm font-medium text-slate-700 group-hover:text-primary transition-colors text-center max-w-[90px] md:max-w-[100px] leading-tight">
          {category.name}
        </span>
      </div>
    </Link>
  );
}
