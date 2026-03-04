import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getPublicHomeCities, type PublicHomeCity } from "@/lib/publicApi";
import { IconButton } from "@/components/ui/icon-button";
import { useI18n } from "@/lib/i18n";
import { useRamadanTheme } from "@/components/ramadan/RamadanThemeProvider";

type CitiesSectionProps = {
  className?: string;
};

export function CitiesSection({ className }: CitiesSectionProps) {
  const { t } = useI18n();
  const isRamadan = useRamadanTheme();
  const [cities, setCities] = useState<PublicHomeCity[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await getPublicHomeCities();
        if (!cancelled) {
          setCities(res.cities ?? []);
        }
      } catch {
        // Silently fail - section just won't show
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  // Check scroll state
  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", updateScrollState);
      window.addEventListener("resize", updateScrollState);
      return () => {
        el.removeEventListener("scroll", updateScrollState);
        window.removeEventListener("resize", updateScrollState);
      };
    }
  }, [cities]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = 200; // approximate card width + gap
    const scrollAmount = cardWidth * 3;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  // After loading, don't render if no cities
  if (!loading && cities.length === 0) {
    return null;
  }

  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-6">
        <h2 className={`text-2xl md:text-3xl font-bold ${isRamadan ? "text-ramadan-gold" : "text-foreground"}`}>
          {t("home.cities.title")}
        </h2>
        <div className="flex items-center gap-2">
          <Link
            to="/villes"
            className="text-primary hover:text-primary/80 text-sm font-medium me-2"
          >
            {t("home.cities.see_more")}
          </Link>
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className="hidden sm:flex"
          >
            <ChevronLeft className="w-4 h-4" />
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className="hidden sm:flex"
          >
            <ChevronRight className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {loading ? (
          /* City card skeletons — same dimensions as real cards */
          Array.from({ length: 6 }, (_, i) => (
            <div
              key={`city-skel-${i}`}
              className="flex-shrink-0 w-40 sm:w-48 md:w-52 aspect-[4/3] rounded-xl bg-slate-200 animate-pulse"
            />
          ))
        ) : (
          cities.map((city) => (
            <Link
              key={city.id}
              to={`/villes/${city.slug}`}
              className="group relative flex-shrink-0 w-40 sm:w-48 md:w-52 aspect-[4/3] rounded-xl overflow-hidden bg-slate-100"
            >
              {city.image_url ? (
                <img
                  src={city.image_url}
                  alt={city.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300">
                  <MapPin className="w-8 h-8 text-slate-400" />
                </div>
              )}
              <div className={`absolute inset-0 ${isRamadan ? "bg-gradient-to-t from-ramadan-night/80 via-ramadan-deep/40 to-transparent" : "bg-gradient-to-t from-black/60 via-black/20 to-transparent"}`} />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <span className="text-white font-semibold text-sm md:text-base drop-shadow-lg">
                  {city.name}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
