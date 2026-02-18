import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Search,
  MapPin,
  Building2,
  Utensils,
  Hash,
  X,
  Loader2,
  TrendingUp,
  ChefHat,
  Sparkles,
  Home,
  Dumbbell,
  Gamepad2,
  Landmark,
  Navigation,
  ChevronRight,
  Clock,
  Flame,
  Star,
} from "lucide-react";

import {
  searchAutocomplete,
  getPopularSearches,
  fetchSearchHistory,
  deleteSearchHistoryEntry,
  type AutocompleteSuggestion,
  type SearchHistoryEntry,
} from "@/lib/publicApi";
import { toast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { MOROCCAN_CITIES, NEIGHBORHOODS_BY_CITY } from "@/hooks/useSuggestions";
import { AutocompleteSuggestionsSkeleton } from "@/components/results/AutocompleteSkeleton";
import { parseTemporalIntent, getTemporalSuggestions, type TemporalSuggestion } from "@/lib/search/temporalParser";

type UnifiedSearchInputProps = {
  city: string;
  onCityChange: (city: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  universe?: string | null;
  onSearch: (params: { city: string; query: string; category?: string; date?: string; timeFrom?: string; timeTo?: string; persons?: number }) => void;
  placeholder?: string;
  className?: string;
  compact?: boolean;
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  establishment: <Building2 className="w-5 h-5" />,
  cuisine: <ChefHat className="w-5 h-5" />,
  specialty: <Star className="w-5 h-5" />,
  dish: <Utensils className="w-5 h-5" />,
  tag: <Hash className="w-5 h-5" />,
  city: <MapPin className="w-5 h-5" />,
  activity: <Sparkles className="w-5 h-5" />,
  accommodation: <Home className="w-5 h-5" />,
  hashtag: <Hash className="w-5 h-5" />,
};

const CATEGORY_ICONS_SMALL: Record<string, React.ReactNode> = {
  establishment: <Building2 className="w-4 h-4" />,
  cuisine: <ChefHat className="w-4 h-4" />,
  specialty: <Star className="w-4 h-4" />,
  dish: <Utensils className="w-4 h-4" />,
  tag: <Hash className="w-4 h-4" />,
  city: <MapPin className="w-4 h-4" />,
  activity: <Sparkles className="w-4 h-4" />,
  accommodation: <Home className="w-4 h-4" />,
  hashtag: <Hash className="w-4 h-4" />,
};

const UNIVERSE_ICONS: Record<string, React.ReactNode> = {
  restaurant: <Utensils className="w-4 h-4" />,
  hebergement: <Home className="w-4 h-4" />,
  wellness: <Dumbbell className="w-4 h-4" />,
  loisir: <Gamepad2 className="w-4 h-4" />,
  culture: <Landmark className="w-4 h-4" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  establishment: "Lieu",
  cuisine: "Cuisine",
  specialty: "Spécialité",
  dish: "Plat",
  tag: "Tag",
  city: "Ville",
  activity: "Activité",
  accommodation: "Hébergement",
  hashtag: "Hashtag",
};

// Desktop City Dropdown Component
function CityDropdownDesktop({
  isOpen,
  onClose,
  onSelectCity,
  onSelectNearMe,
  cityInputValue,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectCity: (city: string) => void;
  onSelectNearMe: () => void;
  cityInputValue: string;
}) {
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);

  const filteredCities = cityInputValue.length > 0
    ? MOROCCAN_CITIES.filter(c =>
        c.name.toLowerCase().includes(cityInputValue.toLowerCase())
      )
    : MOROCCAN_CITIES;

  const neighborhoods = hoveredCity ? NEIGHBORHOODS_BY_CITY[hoveredCity] || [] : [];
  const hoveredCityData = MOROCCAN_CITIES.find((c) => c.id === hoveredCity);

  const handleNearMe = async () => {
    setIsRequestingLocation(true);
    try {
      await onSelectNearMe();
    } finally {
      setIsRequestingLocation(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="absolute bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden top-full start-0 mt-2 w-[440px]"
      style={{ zIndex: 9999 }}
    >
      <div className="flex">
        <div className="w-[220px] border-e border-slate-100 overflow-y-auto max-h-[350px]">
          <button
            onClick={handleNearMe}
            disabled={isRequestingLocation}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/5 active:bg-primary/10 transition text-start border-b border-slate-100"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              {isRequestingLocation ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : (
                <Navigation className="w-4 h-4 text-primary" />
              )}
            </div>
            <p className="text-sm font-medium text-slate-800">Autour de moi</p>
            <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 ms-auto" />
          </button>

          <div className="px-4 py-2 bg-slate-50 sticky top-0 z-10">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Villes
            </p>
          </div>

          {filteredCities.map((cityItem) => {
            const hasNeighborhoods = NEIGHBORHOODS_BY_CITY[cityItem.id]?.length > 0;
            return (
              <button
                key={cityItem.id}
                onClick={() => {
                  onSelectCity(cityItem.name);
                  onClose();
                }}
                onMouseEnter={() => setHoveredCity(cityItem.id)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 transition text-start",
                  hoveredCity === cityItem.id ? "bg-primary/5" : "hover:bg-slate-50"
                )}
              >
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">{cityItem.name}</span>
                </div>
                {hasNeighborhoods && <ChevronRight className="w-4 h-4 text-slate-300" />}
              </button>
            );
          })}
        </div>

        {hoveredCity && neighborhoods.length > 0 && (
          <div className="w-[220px] overflow-y-auto max-h-[350px]">
            <div className="px-4 py-2 bg-slate-50 sticky top-0 z-10">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Quartiers - {hoveredCityData?.name}
              </p>
            </div>
            {neighborhoods.map((neighborhood) => (
              <button
                key={neighborhood.id}
                onClick={() => {
                  onSelectCity(`${neighborhood.name}, ${hoveredCityData?.name || ""}`);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/5 active:bg-primary/10 transition text-start"
              >
                <MapPin className="w-4 h-4 text-slate-300" />
                <span className="text-sm text-slate-700">{neighborhood.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function UnifiedSearchInput({
  city,
  onCityChange,
  query,
  onQueryChange,
  universe,
  onSearch,
  placeholder,
  className,
  compact = false,
}: UnifiedSearchInputProps) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Desktop dropdown states
  const [isDesktopSearchOpen, setIsDesktopSearchOpen] = useState(false);
  const [isDesktopCityOpen, setIsDesktopCityOpen] = useState(false);

  // Mobile modal states
  const [isMobileCityModalOpen, setIsMobileCityModalOpen] = useState(false);
  const [isMobileSearchModalOpen, setIsMobileSearchModalOpen] = useState(false);

  // Form values
  const [cityInputValue, setCityInputValue] = useState(city);
  const [inputValue, setInputValue] = useState(query);
  const [mobileSearchInput, setMobileSearchInput] = useState("");

  // Suggestions
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [noEstablishmentsMsg, setNoEstablishmentsMsg] = useState<string | null>(null);
  const [popularSearches, setPopularSearches] = useState<Array<{
    term: string;
    category: string;
    displayLabel: string;
    iconName: string | null;
    searchCount?: number;
  }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Search history (server-side)
  const [recentSearches, setRecentSearches] = useState<SearchHistoryEntry[]>([]);
  const [recentSearchesLoaded, setRecentSearchesLoaded] = useState(false);

  // Temporal suggestions (NLP)
  const [temporalSuggestions, setTemporalSuggestions] = useState<TemporalSuggestion[]>([]);

  const debouncedQuery = useDebounce(inputValue, 300);
  const debouncedMobileQuery = useDebounce(mobileSearchInput, 300);

  // Sync city input with prop
  useEffect(() => {
    setCityInputValue(city);
  }, [city]);

  // Prevent body scroll when mobile modal is open and keep scroll position
  useEffect(() => {
    if (isMobileCityModalOpen || isMobileSearchModalOpen) {
      // Store current scroll position
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
    } else {
      // Restore scroll position
      const scrollY = document.body.style.top;
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || "0") * -1);
      }
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
    };
  }, [isMobileCityModalOpen, isMobileSearchModalOpen]);

  // Handle geolocation — capture coords and pass geo:lat,lng format
  const handleSelectNearMe = useCallback(async () => {
    setIsRequestingLocation(true);
    try {
      if (!navigator.geolocation) {
        toast({ title: "Géolocalisation non disponible", description: "Votre navigateur ne supporte pas la géolocalisation.", variant: "destructive" });
        return;
      }
      const coords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
      if (coords) {
        const label = "Autour de moi";
        setCityInputValue(label);
        // Pass geo:lat,lng so parent can extract coordinates
        onCityChange(`geo:${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`);
      } else {
        toast({ title: "Géolocalisation refusée", description: "Activez la géolocalisation dans les paramètres de votre navigateur pour utiliser cette fonctionnalité.", variant: "destructive" });
      }
    } finally {
      setIsRequestingLocation(false);
      setIsMobileCityModalOpen(false);
    }
  }, [onCityChange]);

  // Fetch autocomplete suggestions (desktop)
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    let active = true;
    setIsLoading(true);

    searchAutocomplete({
      q: debouncedQuery,
      universe: universe ?? undefined,
      city: cityInputValue || undefined,
      limit: 8,
      lang: locale,
    })
      .then((res) => {
        if (active && res.ok) {
          setSuggestions(res.suggestions);
          setNoEstablishmentsMsg(res.noEstablishmentsMessage ?? null);
        }
      })
      .catch(() => {
        if (active) { setSuggestions([]); setNoEstablishmentsMsg(null); }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [debouncedQuery, universe, locale, cityInputValue]);

  // Fetch autocomplete suggestions (mobile)
  useEffect(() => {
    if (!debouncedMobileQuery || debouncedMobileQuery.length < 2) {
      return;
    }

    let active = true;
    setIsLoading(true);

    searchAutocomplete({
      q: debouncedMobileQuery,
      universe: universe ?? undefined,
      city: cityInputValue || undefined,
      limit: 10,
      lang: locale,
    })
      .then((res) => {
        if (active && res.ok) {
          setSuggestions(res.suggestions);
          setNoEstablishmentsMsg(res.noEstablishmentsMessage ?? null);
        }
      })
      .catch(() => {
        if (active) { setSuggestions([]); setNoEstablishmentsMsg(null); }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [debouncedMobileQuery, universe, cityInputValue]);

  // Compute temporal suggestions as user types (synchronous, no debounce needed)
  useEffect(() => {
    const value = isMobileSearchModalOpen ? mobileSearchInput : inputValue;
    if (value && value.length >= 2) {
      setTemporalSuggestions(getTemporalSuggestions(value, locale));
    } else {
      setTemporalSuggestions([]);
    }
  }, [inputValue, mobileSearchInput, locale, isMobileSearchModalOpen]);

  // Track the universe for which we loaded popular searches
  const [loadedForUniverse, setLoadedForUniverse] = useState<string | null | undefined>(undefined);

  // Fetch popular searches for mobile modal
  useEffect(() => {
    // Reload if modal is open AND (no data yet OR universe changed)
    const shouldLoad = isMobileSearchModalOpen && (popularSearches.length === 0 || loadedForUniverse !== universe);

    if (shouldLoad) {
      getPopularSearches({ universe: universe ?? undefined, limit: 8, lang: locale })
        .then((res) => {
          if (res.ok) {
            setPopularSearches(res.searches);
            setLoadedForUniverse(universe);
          }
        })
        .catch(() => {});
    }
  }, [isMobileSearchModalOpen, universe, popularSearches.length, loadedForUniverse, locale]);

  // Also load popular searches for desktop on mount and when universe changes
  useEffect(() => {
    getPopularSearches({ universe: universe ?? undefined, limit: 6, lang: locale })
      .then((res) => {
        if (res.ok) {
          setPopularSearches(res.searches);
          setLoadedForUniverse(universe);
        }
      })
      .catch(() => {});
  }, [universe, locale]);

  // Reset popular searches when universe changes (to force reload)
  useEffect(() => {
    if (loadedForUniverse !== undefined && loadedForUniverse !== universe) {
      setPopularSearches([]);
    }
  }, [universe, loadedForUniverse]);

  // Fetch recent search history on mount
  useEffect(() => {
    fetchSearchHistory({ universe: universe ?? undefined, limit: 5 })
      .then((res) => {
        if (res.ok) setRecentSearches(res.history);
      })
      .catch(() => {})
      .finally(() => setRecentSearchesLoaded(true));
  }, [universe]);

  // Handle deleting a recent search entry
  const handleDeleteRecentSearch = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setRecentSearches((prev) => prev.filter((s) => s.id !== id));
    void deleteSearchHistoryEntry({ id });
  }, []);

  // Handle clearing all recent searches
  const handleClearAllRecentSearches = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setRecentSearches([]);
    void deleteSearchHistoryEntry();
  }, []);

  // Handle selecting a recent search
  const handleSelectRecentSearch = useCallback((entry: SearchHistoryEntry) => {
    if (entry.city) {
      setCityInputValue(entry.city);
      onCityChange(entry.city);
    }
    setInputValue(entry.query);
    onQueryChange(entry.query);
    onSearch({ city: entry.city ?? cityInputValue, query: entry.query });
    setIsDesktopSearchOpen(false);
    setIsMobileSearchModalOpen(false);
  }, [onSearch, onCityChange, onQueryChange, cityInputValue]);

  // Close desktop dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDesktopSearchOpen(false);
        setIsDesktopCityOpen(false);
      }
    }

    if (isDesktopSearchOpen || isDesktopCityOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isDesktopSearchOpen, isDesktopCityOpen]);

  // Handle keyboard navigation (desktop)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const items = suggestions.length > 0 ? suggestions : popularSearches;
      const maxIndex = items.length - 1;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex <= maxIndex) {
            const item = items[activeIndex];
            if ("id" in item) {
              handleSelectSuggestion(item as AutocompleteSuggestion);
            } else {
              handleSelectPopular(item);
            }
          } else {
            handleSubmit();
          }
          break;
        case "Escape":
          setIsDesktopSearchOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [suggestions, popularSearches, activeIndex]
  );

  const handleSelectSuggestion = (suggestion: AutocompleteSuggestion) => {
    if (suggestion.category === "establishment" && suggestion.extra?.establishmentId) {
      const universePrefix = suggestion.universe ?? "restaurant";
      navigate(`/${universePrefix}/${suggestion.extra.establishmentId}`);
      setIsDesktopSearchOpen(false);
      setIsMobileSearchModalOpen(false);
      return;
    }

    if (suggestion.category === "city") {
      setCityInputValue(suggestion.displayLabel);
      onCityChange(suggestion.displayLabel);
      setInputValue("");
      setIsDesktopSearchOpen(false);
      setIsMobileSearchModalOpen(false);
      return;
    }

    setInputValue(suggestion.displayLabel);
    onQueryChange(suggestion.displayLabel);
    onSearch({ city: cityInputValue, query: suggestion.term, category: suggestion.category });
    setIsDesktopSearchOpen(false);
    setIsMobileSearchModalOpen(false);
  };

  const handleSelectPopular = (search: { term: string; displayLabel: string; category: string }) => {
    setInputValue(search.displayLabel);
    onQueryChange(search.term);
    onSearch({ city: cityInputValue, query: search.term, category: search.category });
    setIsDesktopSearchOpen(false);
    setIsMobileSearchModalOpen(false);
  };

  const buildTemporalParams = (query: string) => {
    const intent = parseTemporalIntent(query, locale);
    return {
      query: intent.cleanQuery,
      ...(intent.date && { date: intent.date.toISOString().split("T")[0] }),
      ...(intent.timeRange && { timeFrom: intent.timeRange.from, timeTo: intent.timeRange.to }),
      ...(intent.persons && { persons: intent.persons }),
    };
  };

  const handleSubmit = () => {
    const tp = buildTemporalParams(inputValue);
    onQueryChange(tp.query);
    onSearch({ city: cityInputValue, ...tp });
    setIsDesktopSearchOpen(false);
  };

  const handleMobileSubmit = () => {
    const tp = buildTemporalParams(inputValue);
    onQueryChange(tp.query);
    onSearch({ city: cityInputValue, ...tp });
  };

  const handleSelectTemporalSuggestion = (suggestion: TemporalSuggestion) => {
    const { intent } = suggestion;
    setInputValue(intent.cleanQuery);
    onQueryChange(intent.cleanQuery);
    onSearch({
      city: cityInputValue,
      query: intent.cleanQuery,
      ...(intent.date && { date: intent.date.toISOString().split("T")[0] }),
      ...(intent.timeRange && { timeFrom: intent.timeRange.from, timeTo: intent.timeRange.to }),
      ...(intent.persons && { persons: intent.persons }),
    });
    setIsDesktopSearchOpen(false);
    setIsMobileSearchModalOpen(false);
  };

  const handleClear = () => {
    setInputValue("");
    onQueryChange("");
    inputRef.current?.focus();
  };

  const handleSelectCity = (selectedCity: string) => {
    setCityInputValue(selectedCity);
    onCityChange(selectedCity);
    setIsMobileCityModalOpen(false);
  };

  const showDesktopRecent = isDesktopSearchOpen && inputValue.length < 2 && recentSearches.length > 0;
  const showDesktopPopular = isDesktopSearchOpen && inputValue.length < 2 && popularSearches.length > 0;
  const showDesktopSuggestions = isDesktopSearchOpen && suggestions.length > 0;
  const showDesktopNoResults = isDesktopSearchOpen && !isLoading && suggestions.length === 0 && inputValue.length >= 2 && !!noEstablishmentsMsg;
  const showDesktopLoading = isDesktopSearchOpen && isLoading && suggestions.length === 0 && inputValue.length >= 2;
  const showDesktopTemporal = isDesktopSearchOpen && temporalSuggestions.length > 0 && inputValue.length >= 2;
  const showDesktopDropdown = showDesktopRecent || showDesktopPopular || showDesktopSuggestions || showDesktopNoResults || showDesktopLoading || showDesktopTemporal;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Mobile Layout - Clickable fields that open modals */}
      <div className="md:hidden flex flex-col gap-3">
        {/* City Field - Opens modal on click */}
        <button
          type="button"
          onClick={() => setIsMobileCityModalOpen(true)}
          className="flex items-center bg-white rounded-lg border border-slate-200 h-14 px-4 text-start"
        >
          <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
          <span className={cn(
            "flex-1 ms-3 text-base",
            cityInputValue ? "text-slate-700" : "text-slate-400"
          )}>
            {cityInputValue || "Ville ou quartier"}
          </span>
        </button>

        {/* Search Field + OK Button - Same row */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsMobileSearchModalOpen(true)}
            className="flex-1 flex items-center bg-white rounded-lg border border-slate-200 h-14 px-4 text-start"
          >
            <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <span className={cn(
              "flex-1 ms-3 text-base",
              inputValue ? "text-slate-700" : "text-slate-400"
            )}>
              {inputValue || placeholder || "Activité, lieu..."}
            </span>
          </button>

          {/* OK Button - Compact square */}
          <button
            type="button"
            onClick={handleMobileSubmit}
            className="w-14 h-14 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg transition-colors flex-shrink-0 flex items-center justify-center"
          >
            OK
          </button>
        </div>
      </div>

      {/* Mobile City Modal */}
      {isMobileCityModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
          <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Où allez-vous ?</h2>
            <button
              type="button"
              onClick={() => setIsMobileCityModalOpen(false)}
              className="p-2 hover:bg-slate-100 rounded-full"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-3">
              <button
                onClick={handleSelectNearMe}
                disabled={isRequestingLocation}
                className="w-full flex items-center gap-4 px-4 py-4 bg-primary/5 hover:bg-primary/10 rounded-xl transition text-start"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {isRequestingLocation ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                    <Navigation className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-base font-semibold text-slate-800">Autour de moi</p>
                  <p className="text-sm text-slate-500">Utiliser ma position</p>
                </div>
              </button>
            </div>

            <div className="px-4 py-2">
              <p className="text-sm font-bold text-slate-900">Villes</p>
            </div>

            <div className="px-4 pb-8">
              {MOROCCAN_CITIES.map((cityItem) => (
                <button
                  key={cityItem.id}
                  onClick={() => handleSelectCity(cityItem.name)}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition text-start mb-1",
                    cityInputValue === cityItem.name ? "bg-primary/5" : "hover:bg-slate-50"
                  )}
                >
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-slate-400" />
                  </div>
                  <span className="text-base font-medium text-slate-700">{cityItem.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Mobile Search Modal */}
      {isMobileSearchModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
          <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-900">Que recherchez-vous ?</h2>
              <button
                type="button"
                onClick={() => setIsMobileSearchModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="flex items-center gap-3 h-12 px-4 bg-slate-100 rounded-xl">
              <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <input
                type="text"
                value={mobileSearchInput}
                onChange={(e) => setMobileSearchInput(e.target.value)}
                placeholder="Cuisine, nom de lieu, plat..."
                className="flex-1 bg-transparent border-none outline-none text-base text-slate-700 placeholder:text-slate-400"
                autoFocus
              />
              {mobileSearchInput && (
                <button
                  type="button"
                  onClick={() => setMobileSearchInput("")}
                  className="p-1 hover:bg-slate-200 rounded-full"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              )}
              {isLoading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Temporal suggestions (NLP) */}
            {temporalSuggestions.length > 0 && mobileSearchInput.length >= 2 && (
              <div className="px-4 pt-3 pb-1">
                {temporalSuggestions.map((ts) => (
                  <button
                    key={ts.label}
                    onClick={() => handleSelectTemporalSuggestion(ts)}
                    className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-amber-50 transition text-start mb-1 border border-amber-200 bg-amber-50/50"
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-100 text-amber-700">
                      <Clock className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium text-amber-800">{ts.label}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Suggestions */}
            {mobileSearchInput.length >= 2 && suggestions.length > 0 && (
              <div className="px-4 py-3">
                {/* Discrete message when city filter yields 0 establishments */}
                {noEstablishmentsMsg && (
                  <div className="px-4 py-2 text-xs text-slate-400 italic mb-2">
                    {noEstablishmentsMsg}
                  </div>
                )}
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-slate-50 transition text-start mb-1"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                      suggestion.category === "establishment" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"
                    )}>
                      {suggestion.extra?.coverUrl ? (
                        <img src={suggestion.extra.coverUrl} alt="" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        CATEGORY_ICONS[suggestion.category] || <Hash className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-medium text-slate-900 truncate">{suggestion.displayLabel}</p>
                      <p className="text-sm text-slate-500 truncate">
                        {suggestion.category === "hashtag" && suggestion.extra?.usageCount
                          ? `${suggestion.extra.usageCount} utilisation${suggestion.extra.usageCount > 1 ? "s" : ""}`
                          : (suggestion.extra?.city || CATEGORY_LABELS[suggestion.category])}
                      </p>
                    </div>
                    {suggestion.category === "establishment" && (
                      <span className="text-sm text-primary font-medium">Voir →</span>
                    )}
                    {suggestion.category !== "establishment" && typeof suggestion.extra?.resultCount === "number" && suggestion.extra.resultCount > 0 && (
                      <span className="flex-shrink-0 text-xs font-medium tabular-nums text-primary/70">
                        {suggestion.extra.resultCount} résultat{suggestion.extra.resultCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Recent searches (mobile) */}
            {mobileSearchInput.length < 2 && recentSearches.length > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <p className="text-sm font-bold text-slate-900">Recherches récentes</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearAllRecentSearches}
                    className="text-xs text-slate-400 hover:text-primary transition-colors"
                  >
                    Effacer tout
                  </button>
                </div>
                {recentSearches.slice(0, 5).map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => handleSelectRecentSearch(entry)}
                    className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-slate-50 transition text-start mb-1 group/recent"
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-medium text-slate-700 truncate">{entry.query}</p>
                      {typeof entry.results_count === "number" && (
                        <p className="text-sm text-slate-400">{entry.results_count} résultat{entry.results_count !== 1 ? "s" : ""}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteRecentSearch(entry.id, e)}
                      className="p-1.5 rounded-full hover:bg-slate-200 transition-all flex-shrink-0"
                      aria-label="Supprimer"
                    >
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  </button>
                ))}
              </div>
            )}

            {/* Popular searches */}
            {mobileSearchInput.length < 2 && popularSearches.length > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-slate-500" />
                  <p className="text-sm font-bold text-slate-900">Recherches populaires</p>
                </div>
                {popularSearches.map((search, index) => (
                  <button
                    key={`${search.term}-${index}`}
                    onClick={() => handleSelectPopular(search)}
                    className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-slate-50 transition text-start mb-1"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                      (search.searchCount ?? 0) > 100 ? "bg-orange-50" : "bg-slate-100"
                    )}>
                      {(search.searchCount ?? 0) > 100 ? (
                        <Flame className="w-5 h-5 text-orange-500" />
                      ) : (
                        CATEGORY_ICONS[search.category] || <Hash className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-medium text-slate-700">{search.displayLabel}</span>
                      {(search.searchCount ?? 0) > 100 && (
                        <span className="text-xs font-semibold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full">Tendance</span>
                      )}
                      {(search.searchCount ?? 0) > 50 && (search.searchCount ?? 0) <= 100 && (
                        <span className="text-xs font-semibold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-full">Populaire</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Loading skeleton */}
            {mobileSearchInput.length >= 2 && isLoading && suggestions.length === 0 && (
              <div className="px-4">
                <AutocompleteSuggestionsSkeleton />
              </div>
            )}

            {/* No results */}
            {mobileSearchInput.length >= 2 && suggestions.length === 0 && !isLoading && (
              <div className="px-4 py-8 text-center">
                <p className="text-slate-500">Aucun résultat trouvé</p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Desktop Layout */}
      <div
        className={cn(
          "hidden md:flex items-center bg-white border border-slate-200 shadow-sm transition-all",
          (isDesktopSearchOpen || isDesktopCityOpen) && "ring-2 ring-primary/20 border-primary",
          compact ? "h-10 rounded-lg" : "h-14 rounded-xl"
        )}
      >
        {/* City Section */}
        <div className="flex items-center ps-5 pe-4 border-e border-slate-200 h-full">
          <MapPin className={cn("text-primary flex-shrink-0", compact ? "w-4 h-4" : "w-5 h-5")} />
          <input
            type="text"
            value={cityInputValue}
            onChange={(e) => {
              setCityInputValue(e.target.value);
              onCityChange(e.target.value);
            }}
            onFocus={() => {
              setIsDesktopCityOpen(true);
              setIsDesktopSearchOpen(false);
            }}
            placeholder="Ville"
            className={cn(
              "bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400 ms-3",
              compact ? "w-24 text-sm" : "w-36 text-base"
            )}
          />
          {cityInputValue && (
            <button
              type="button"
              onClick={() => {
                setCityInputValue("");
                onCityChange("");
              }}
              className="p-1 hover:bg-slate-100 rounded-full"
            >
              <X className="w-3 h-3 text-slate-400" />
            </button>
          )}
        </div>

        {/* Search Section */}
        <div className="flex-1 flex items-center px-4 h-full">
          <Search className={cn("text-slate-400 flex-shrink-0", compact ? "w-4 h-4" : "w-5 h-5")} />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setActiveIndex(-1);
            }}
            onFocus={() => {
              setIsDesktopSearchOpen(true);
              setIsDesktopCityOpen(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? "Cuisine, restaurant, plat..."}
            className={cn(
              "flex-1 bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400 ms-3",
              compact ? "text-sm" : "text-base"
            )}
          />
          {isLoading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
          {inputValue && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:bg-slate-100 rounded-full ms-2"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>

        {/* Search Button */}
        <button
          type="button"
          onClick={handleSubmit}
          className={cn(
            "bg-primary hover:bg-primary/90 text-white font-semibold transition-colors h-full",
            compact ? "px-5 text-sm rounded-e-lg" : "px-8 text-base rounded-e-xl"
          )}
        >
          {compact ? <Search className="w-4 h-4" /> : "Rechercher"}
        </button>
      </div>

      {/* Desktop City Dropdown */}
      <div className="hidden md:block">
        <CityDropdownDesktop
          isOpen={isDesktopCityOpen}
          onClose={() => setIsDesktopCityOpen(false)}
          onSelectCity={(selectedCity) => {
            setCityInputValue(selectedCity);
            onCityChange(selectedCity);
          }}
          onSelectNearMe={handleSelectNearMe}
          cityInputValue={cityInputValue}
        />
      </div>

      {/* Desktop Search Dropdown */}
      {showDesktopDropdown && (
        <div className="hidden md:block absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          {/* Recent searches — above popular */}
          {showDesktopRecent && (
            <div className="p-3 border-b border-slate-100">
              <div className="flex items-center justify-between mb-2 px-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <Clock className="w-3 h-3" />
                  Recherches récentes
                </div>
                <button
                  type="button"
                  onClick={handleClearAllRecentSearches}
                  className="text-xs text-slate-400 hover:text-primary transition-colors"
                >
                  Effacer tout
                </button>
              </div>
              <div className="space-y-0.5">
                {recentSearches.slice(0, 5).map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => handleSelectRecentSearch(entry)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-start hover:bg-slate-50 transition-colors group/recent"
                  >
                    <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-slate-800 truncate block">{entry.query}</span>
                    </div>
                    {typeof entry.results_count === "number" && (
                      <span className="text-xs text-slate-400 flex-shrink-0">
                        {entry.results_count} résultat{entry.results_count !== 1 ? "s" : ""}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteRecentSearch(entry.id, e)}
                      className="p-1 rounded-full opacity-0 group-hover/recent:opacity-100 hover:bg-slate-200 transition-all flex-shrink-0"
                      aria-label="Supprimer"
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}

          {showDesktopPopular && (
            <div className="p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
                <TrendingUp className="w-3 h-3" />
                Recherches populaires
              </div>
              <div className="flex flex-wrap gap-2">
                {popularSearches.map((search, index) => (
                  <button
                    key={`${search.term}-${index}`}
                    onClick={() => handleSelectPopular(search)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors",
                      activeIndex === index
                        ? "bg-primary text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    )}
                  >
                    {(search.searchCount ?? 0) > 100 ? (
                      <Flame className="w-3 h-3 text-orange-500" />
                    ) : (
                      CATEGORY_ICONS_SMALL[search.category] || <Hash className="w-3 h-3" />
                    )}
                    {search.displayLabel}
                    {(search.searchCount ?? 0) > 100 && (
                      <span className="text-[10px] font-semibold text-orange-500">Tendance</span>
                    )}
                    {(search.searchCount ?? 0) > 50 && (search.searchCount ?? 0) <= 100 && (
                      <span className="text-[10px] font-semibold text-slate-400">Populaire</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showDesktopLoading && (
            <AutocompleteSuggestionsSkeleton />
          )}

          {/* Temporal suggestions (NLP) — desktop */}
          {temporalSuggestions.length > 0 && isDesktopSearchOpen && inputValue.length >= 2 && (
            <div className="py-1 border-b border-amber-100">
              {temporalSuggestions.map((ts) => (
                <button
                  key={ts.label}
                  onClick={() => handleSelectTemporalSuggestion(ts)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50 text-start transition-colors"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-amber-100 text-amber-700">
                    <Clock className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-medium text-amber-800">{ts.label}</span>
                </button>
              ))}
            </div>
          )}

          {showDesktopSuggestions && (
            <div className="py-2 max-h-80 overflow-y-auto">
              {/* Discrete message when city filter yields 0 establishments */}
              {noEstablishmentsMsg && (
                <div className="px-4 py-2 text-xs text-slate-400 italic border-b border-slate-100">
                  {noEstablishmentsMsg}
                </div>
              )}
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-start transition-colors",
                    activeIndex === index ? "bg-primary/10" : "hover:bg-slate-50"
                  )}
                >
                  <div
                    className={cn(
                      "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                      suggestion.category === "establishment"
                        ? "bg-primary/10 text-primary"
                        : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {suggestion.extra?.coverUrl ? (
                      <img src={suggestion.extra.coverUrl} alt="" className="w-full h-full object-cover rounded-lg" />
                    ) : suggestion.universe ? (
                      UNIVERSE_ICONS[suggestion.universe] || CATEGORY_ICONS_SMALL[suggestion.category]
                    ) : (
                      CATEGORY_ICONS_SMALL[suggestion.category]
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">{suggestion.displayLabel}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="capitalize">{CATEGORY_LABELS[suggestion.category] || suggestion.category}</span>
                      {suggestion.extra?.city && (
                        <>
                          <span>•</span>
                          <span>{suggestion.extra.city}</span>
                        </>
                      )}
                      {suggestion.category === "hashtag" && suggestion.extra?.usageCount && (
                        <>
                          <span>•</span>
                          <span>{suggestion.extra.usageCount} utilisation{suggestion.extra.usageCount > 1 ? "s" : ""}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {suggestion.category === "establishment" && (
                    <span className="flex-shrink-0 text-xs text-primary font-medium">Voir →</span>
                  )}
                  {suggestion.category !== "establishment" && typeof suggestion.extra?.resultCount === "number" && suggestion.extra.resultCount > 0 && (
                    <span className="flex-shrink-0 text-xs font-medium tabular-nums text-primary/70">
                      {suggestion.extra.resultCount} résultat{suggestion.extra.resultCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* No results at all for the city — show the message alone */}
          {showDesktopNoResults && !showDesktopSuggestions && (
            <div className="px-4 py-4 text-sm text-slate-400 italic text-center">
              {noEstablishmentsMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
