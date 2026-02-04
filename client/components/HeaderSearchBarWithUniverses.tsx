import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { UnifiedSearchInput } from "@/components/SearchInputs/UnifiedSearchInput";
import { cn } from "@/lib/utils";

interface HeaderSearchBarWithUniversesProps {
  className?: string;
}

export function HeaderSearchBarWithUniverses({ className }: HeaderSearchBarWithUniversesProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const currentUniverse = searchParams.get("universe") || "restaurants";

  // Search state
  const [searchCity, setSearchCity] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const handleUnifiedSearch = useCallback(
    (params: { city: string; query: string; category?: string }) => {
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
      navigate(`/results?${qs.toString()}`);
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
