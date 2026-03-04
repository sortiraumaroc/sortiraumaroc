import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { UnifiedSearchInput } from "@/components/SearchInputs/UnifiedSearchInput";
import { cn } from "@/lib/utils";
import { readSearchState } from "@/lib/searchState";
import type { ActivityCategory } from "@/lib/taxonomy";

interface HeaderSearchBarWithUniversesProps {
  className?: string;
}

export function HeaderSearchBarWithUniverses({ className }: HeaderSearchBarWithUniversesProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const currentUniverse = searchParams.get("universe") || "restaurants";

  // Search state — initialize from URL params, then localStorage fallback
  const [searchCity, setSearchCity] = useState(() => {
    const urlCity = searchParams.get("city") || "";
    return urlCity || readSearchState(currentUniverse as ActivityCategory).city || "";
  });
  const [searchQuery, setSearchQuery] = useState(() => {
    const urlQuery = searchParams.get("q") || "";
    return urlQuery || readSearchState(currentUniverse as ActivityCategory).query || "";
  });

  const handleUnifiedSearch = useCallback(
    (params: { city: string; query: string; category?: string; date?: string; timeFrom?: string; timeTo?: string; persons?: number }) => {
      const qs = new URLSearchParams();
      if (params.city) qs.set("city", params.city);
      if (params.query) qs.set("q", params.query);
      if (currentUniverse && currentUniverse !== "restaurants") {
        qs.set("universe", currentUniverse);
      }
      // Pass category for filtered search (cuisine, dish, tag, etc.)
      if (params.category && params.category !== "establishment") {
        qs.set("category", params.category);
      }
      if (params.date) qs.set("date", params.date);
      if (params.timeFrom) qs.set("time_from", params.timeFrom);
      if (params.timeTo) qs.set("time_to", params.timeTo);
      if (params.persons) qs.set("persons", String(params.persons));
      navigate(`/results?${qs.toString()}`, { state: { fromSearch: true } });
    },
    [navigate, currentUniverse]
  );

  return (
    <div className={cn("w-full max-w-2xl", className)}>
      <UnifiedSearchInput
        city={searchCity}
        onCityChange={setSearchCity}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        universe={currentUniverse}
        onSearch={handleUnifiedSearch}
        placeholder={
          currentUniverse === "restaurants"
            ? "Cuisine, restaurant, plat..."
            : currentUniverse === "hebergement"
            ? "Hôtel, type, équipement..."
            : "Activité, lieu..."
        }
        compact={true}
      />
    </div>
  );
}
