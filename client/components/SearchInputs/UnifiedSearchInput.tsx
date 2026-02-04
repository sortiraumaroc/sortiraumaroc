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
} from "lucide-react";

import {
  searchAutocomplete,
  getPopularSearches,
  type AutocompleteSuggestion,
} from "@/lib/publicApi";
import { useDebounce } from "@/hooks/useDebounce";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { MOROCCAN_CITIES, NEIGHBORHOODS_BY_CITY } from "@/hooks/useSuggestions";

type UnifiedSearchInputProps = {
  city: string;
  onCityChange: (city: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  universe?: string | null;
  onSearch: (params: { city: string; query: string; category?: string }) => void;
  placeholder?: string;
  className?: string;
  compact?: boolean;
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  establishment: <Building2 className="w-5 h-5" />,
  cuisine: <ChefHat className="w-5 h-5" />,
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
      className="absolute bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden top-full left-0 mt-2 w-[440px]"
      style={{ zIndex: 9999 }}
    >
      <div className="flex">
        <div className="w-[220px] border-r border-slate-100 overflow-y-auto max-h-[350px]">
          <button
            onClick={handleNearMe}
            disabled={isRequestingLocation}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/5 active:bg-primary/10 transition text-left border-b border-slate-100"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              {isRequestingLocation ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : (
                <Navigation className="w-4 h-4 text-primary" />
              )}
            </div>
            <p className="text-sm font-medium text-slate-800">Autour de moi</p>
            <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 ml-auto" />
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
                  "w-full flex items-center justify-between px-4 py-3 transition text-left",
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
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/5 active:bg-primary/10 transition text-left"
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
  const { t } = useI18n();
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
  const [popularSearches, setPopularSearches] = useState<Array<{
    term: string;
    category: string;
    displayLabel: string;
    iconName: string | null;
  }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

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

  // Handle geolocation
  const handleSelectNearMe = useCallback(async () => {
    setIsRequestingLocation(true);
    try {
      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(),
            () => resolve(),
            { enableHighAccuracy: true, timeout: 10000 }
          );
        });
      }
      const label = "Autour de moi";
      setCityInputValue(label);
      onCityChange(label);
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
      limit: 8,
    })
      .then((res) => {
        if (active && res.ok) {
          setSuggestions(res.suggestions);
        }
      })
      .catch(() => {
        if (active) setSuggestions([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [debouncedQuery, universe]);

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
      limit: 10,
    })
      .then((res) => {
        if (active && res.ok) {
          setSuggestions(res.suggestions);
        }
      })
      .catch(() => {
        if (active) setSuggestions([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [debouncedMobileQuery, universe]);

  // Track the universe for which we loaded popular searches
  const [loadedForUniverse, setLoadedForUniverse] = useState<string | null | undefined>(undefined);

  // Fetch popular searches for mobile modal
  useEffect(() => {
    // Reload if modal is open AND (no data yet OR universe changed)
    const shouldLoad = isMobileSearchModalOpen && (popularSearches.length === 0 || loadedForUniverse !== universe);

    if (shouldLoad) {
      getPopularSearches({ universe: universe ?? undefined, limit: 8 })
        .then((res) => {
          if (res.ok) {
            setPopularSearches(res.searches);
            setLoadedForUniverse(universe);
          }
        })
        .catch(() => {});
    }
  }, [isMobileSearchModalOpen, universe, popularSearches.length, loadedForUniverse]);

  // Also load popular searches for desktop on mount and when universe changes
  useEffect(() => {
    getPopularSearches({ universe: universe ?? undefined, limit: 6 })
      .then((res) => {
        if (res.ok) {
          setPopularSearches(res.searches);
          setLoadedForUniverse(universe);
        }
      })
      .catch(() => {});
  }, [universe]);

  // Reset popular searches when universe changes (to force reload)
  useEffect(() => {
    if (loadedForUniverse !== undefined && loadedForUniverse !== universe) {
      setPopularSearches([]);
    }
  }, [universe, loadedForUniverse]);

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

  const handleSubmit = () => {
    onQueryChange(inputValue);
    onSearch({ city: cityInputValue, query: inputValue });
    setIsDesktopSearchOpen(false);
  };

  const handleMobileSubmit = () => {
    onQueryChange(inputValue);
    onSearch({ city: cityInputValue, query: inputValue });
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

  const showDesktopPopular = isDesktopSearchOpen && inputValue.length < 2 && popularSearches.length > 0;
  const showDesktopSuggestions = isDesktopSearchOpen && suggestions.length > 0;
  const showDesktopDropdown = showDesktopPopular || showDesktopSuggestions;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Mobile Layout - Clickable fields that open modals */}
      <div className="md:hidden flex flex-col gap-3">
        {/* City Field - Opens modal on click */}
        <button
          type="button"
          onClick={() => setIsMobileCityModalOpen(true)}
          className="flex items-center bg-white rounded-lg border border-slate-200 h-14 px-4 text-left"
        >
          <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
          <span className={cn(
            "flex-1 ml-3 text-base",
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
            className="flex-1 flex items-center bg-white rounded-lg border border-slate-200 h-14 px-4 text-left"
          >
            <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <span className={cn(
              "flex-1 ml-3 text-base",
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
                className="w-full flex items-center gap-4 px-4 py-4 bg-primary/5 hover:bg-primary/10 rounded-xl transition text-left"
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
                    "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition text-left mb-1",
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
            {/* Suggestions */}
            {mobileSearchInput.length >= 2 && suggestions.length > 0 && (
              <div className="px-4 py-3">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-slate-50 transition text-left mb-1"
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
                    className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-slate-50 transition text-left mb-1"
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      {CATEGORY_ICONS[search.category] || <Hash className="w-5 h-5 text-slate-400" />}
                    </div>
                    <span className="text-base font-medium text-slate-700">{search.displayLabel}</span>
                  </button>
                ))}
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
        <div className="flex items-center pl-5 pr-4 border-r border-slate-200 h-full">
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
              "bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400 ml-3",
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
              "flex-1 bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400 ml-3",
              compact ? "text-sm" : "text-base"
            )}
          />
          {isLoading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
          {inputValue && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:bg-slate-100 rounded-full ml-2"
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
            compact ? "px-5 text-sm rounded-r-lg" : "px-8 text-base rounded-r-xl"
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
                    {CATEGORY_ICONS_SMALL[search.category] || <Hash className="w-3 h-3" />}
                    {search.displayLabel}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showDesktopSuggestions && (
            <div className="py-2 max-h-80 overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
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
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
