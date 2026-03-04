/**
 * Prompt 13 — SearchFallback component
 *
 * Renders contextual suggestions when search yields 0 results.
 * Replaces the static "no results" page with actionable alternatives.
 */

import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, MapPin, Filter, Sparkles, Star, ArrowRight, CalendarDays } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";
import type { SearchFallbackResult } from "@/lib/publicApi";

type SearchFallbackProps = {
  fallback: SearchFallbackResult;
  currentQuery: string;
  currentUniverse: string;
  currentCity: string | null;
};

export function SearchFallback({
  fallback,
  currentQuery,
  currentUniverse,
  currentCity,
}: SearchFallbackProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleSuggestionClick = (queryParams: Record<string, string>) => {
    const next = new URLSearchParams();
    // Preserve universe
    next.set("universe", queryParams.universe ?? currentUniverse);
    // Set new params
    Object.entries(queryParams).forEach(([k, v]) => {
      if (v && k !== "universe") next.set(k, v);
    });
    navigate(`/results?${next.toString()}`);
  };

  const handleResetAllFilters = () => {
    const next = new URLSearchParams();
    next.set("universe", currentUniverse);
    if (currentQuery) next.set("q", currentQuery);
    navigate(`/results?${next.toString()}`);
  };

  const handleNearbyClick = (city: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("city", city);
    navigate(`/results?${next.toString()}`);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-white to-rose-50 border border-primary/10 p-6 md:p-10">
      {/* Decorative elements */}
      <div className="absolute top-4 end-4 opacity-10">
        <Sparkles className="w-24 h-24 text-primary" />
      </div>
      <div className="absolute bottom-4 start-4 opacity-10">
        <CalendarDays className="w-16 h-16 text-primary" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Search className="w-7 h-7 text-primary" />
          </div>
        </div>

        <h3 className="text-xl md:text-2xl font-bold text-slate-800 mb-2 text-center">
          {t("search.no_results").replace("{query}", currentQuery)}
        </h3>

        {/* Primary suggestion section based on fallback type */}
        {(fallback.type === "did_you_mean" || fallback.type === "semantic_expansion") &&
          fallback.suggestions &&
          fallback.suggestions.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-slate-600 mb-3 text-center">
                {fallback.type === "did_you_mean"
                  ? t("search.did_you_mean")
                  : t("search.similar_results")}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {fallback.suggestions.map((s, i) => (
                  <button
                    key={`sug-${i}`}
                    onClick={() => handleSuggestionClick(s.query_params)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-primary/20 text-sm font-medium text-primary hover:bg-primary/5 hover:border-primary/40 transition-colors shadow-sm"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{s.label}</span>
                    <span className="text-xs text-slate-400">
                      ({t("search.did_you_mean.results").replace("{count}", String(s.results_count))})
                    </span>
                    <ArrowRight className="w-3 h-3 text-primary/50" />
                  </button>
                ))}
              </div>
            </div>
          )}

        {/* Relax filters */}
        {fallback.type === "relax_filters" &&
          fallback.relaxed_filters &&
          fallback.relaxed_filters.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-slate-600 mb-3 text-center">
                {t("search.relax_filters")}
              </p>
              <div className="flex flex-col gap-2">
                {fallback.relaxed_filters.map((rf, i) => (
                  <button
                    key={`rf-${i}`}
                    onClick={() => handleSuggestionClick(rf.query_params)}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm hover:border-primary/30 hover:bg-primary/5 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-700">
                        {t("search.relax_filters.without").replace("{filter}", rf.label)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-primary">
                        {t("search.did_you_mean.results").replace("{count}", String(rf.results_count))}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-primary/50" />
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={handleResetAllFilters}
                className="mt-3 w-full text-center text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {t("search.reset_all_filters")}
              </button>
            </div>
          )}

        {/* Nearby cities */}
        {fallback.type === "nearby_cities" &&
          fallback.nearby &&
          fallback.nearby.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-slate-600 mb-3 text-center">
                {t("search.nearby")}
              </p>
              <div className="flex flex-col gap-2">
                {fallback.nearby.map((nc, i) => (
                  <button
                    key={`nc-${i}`}
                    onClick={() => handleNearbyClick(nc.city)}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm hover:border-primary/30 hover:bg-primary/5 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      <span className="text-slate-700">
                        {t("search.nearby.see_results")
                          .replace("{count}", String(nc.results_count))
                          .replace("{city}", nc.city)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400">
                        {t("search.nearby.distance").replace("{km}", String(nc.distance_km))}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-primary/50" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

        {/* Popular fallback — always shown */}
        {fallback.popular && fallback.popular.length > 0 && (
          <div className="mt-8">
            <p className="text-sm font-semibold text-slate-600 mb-3 text-center">
              {t("search.popular_fallback")}
            </p>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              {fallback.popular.map((item) => {
                const href = buildEstablishmentUrl({
                  id: item.id,
                  name: item.name,
                  slug: item.slug,
                });
                return (
                  <a
                    key={item.id}
                    href={href}
                    className="flex-shrink-0 w-40 group"
                  >
                    <div className="aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 mb-2">
                      {item.cover_url ? (
                        <img
                          src={item.cover_url}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Sparkles className="w-8 h-8 text-slate-300" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-800 truncate group-hover:text-primary transition-colors">
                      {item.name}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      {item.avg_rating && (
                        <>
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <span>{item.avg_rating.toFixed(1)}</span>
                          <span className="mx-0.5">·</span>
                        </>
                      )}
                      <span className="truncate">{item.city}</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
