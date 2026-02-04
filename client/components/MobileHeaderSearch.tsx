import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { MapPin, Search, ChevronDown, Navigation, Loader2, X, TrendingUp, Building2, ChefHat, Utensils, Hash, Globe } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { MOROCCAN_CITIES } from "@/hooks/useSuggestions";
import { searchAutocomplete, getPopularSearches, getPublicHomeCities, getPublicCountries, type AutocompleteSuggestion, type PublicCountry } from "@/lib/publicApi";
import { useDebounce } from "@/hooks/useDebounce";

interface MobileHeaderSearchProps {
  universe?: string;
  className?: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  establishment: <Building2 className="w-5 h-5" />,
  cuisine: <ChefHat className="w-5 h-5" />,
  dish: <Utensils className="w-5 h-5" />,
  tag: <Hash className="w-5 h-5" />,
  city: <MapPin className="w-5 h-5" />,
  activity: <Hash className="w-5 h-5" />,
  accommodation: <Building2 className="w-5 h-5" />,
  hashtag: <Hash className="w-5 h-5" />,
};

/**
 * Mobile header search bar with city + search fields + submit button
 * Opens full-screen modals when clicking on fields (like TheFork)
 */
export function MobileHeaderSearch({ universe, className }: MobileHeaderSearchProps) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [city, setCity] = useState("");
  const [query, setQuery] = useState("");

  // Modal states
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Search suggestions
  const [searchInput, setSearchInput] = useState("");
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [popularSearches, setPopularSearches] = useState<Array<{
    term: string;
    category: string;
    displayLabel: string;
  }>>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);

  // Dynamic cities and countries
  const [dynamicCities, setDynamicCities] = useState<Array<{ id: string; name: string }>>([]);
  const [countries, setCountries] = useState<PublicCountry[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [isLoadingCities, setIsLoadingCities] = useState(true);

  const debouncedSearchInput = useDebounce(searchInput, 300);

  // Load countries and cities
  useEffect(() => {
    const loadData = async () => {
      setIsLoadingCities(true);
      try {
        // Load countries
        const countriesRes = await getPublicCountries();
        if (countriesRes.ok && countriesRes.countries.length > 0) {
          setCountries(countriesRes.countries);
          // Set default country
          const defaultCountry = countriesRes.countries.find(c => c.is_default);
          const countryCode = defaultCountry?.code || countriesRes.countries[0]?.code || "MA";
          setSelectedCountry(countryCode);

          // Load cities for this country
          const citiesRes = await getPublicHomeCities({ country: countryCode });
          if (citiesRes.ok && citiesRes.cities.length > 0) {
            setDynamicCities(citiesRes.cities.map(c => ({ id: c.slug || c.id, name: c.name })));
          } else {
            // Fallback to all cities
            const allCities = await getPublicHomeCities();
            if (allCities.ok) {
              setDynamicCities(allCities.cities.map(c => ({ id: c.slug || c.id, name: c.name })));
            } else {
              setDynamicCities(MOROCCAN_CITIES);
            }
          }
        } else {
          // No countries configured, use fallback
          setDynamicCities(MOROCCAN_CITIES);
        }
      } catch {
        // Fallback to hardcoded cities
        setDynamicCities(MOROCCAN_CITIES);
      } finally {
        setIsLoadingCities(false);
      }
    };

    void loadData();
  }, []);

  // Reload cities when country changes
  const handleSelectCountry = useCallback(async (countryCode: string) => {
    setSelectedCountry(countryCode);
    setIsLoadingCities(true);
    try {
      const citiesRes = await getPublicHomeCities({ country: countryCode });
      if (citiesRes.ok && citiesRes.cities.length > 0) {
        setDynamicCities(citiesRes.cities.map(c => ({ id: c.slug || c.id, name: c.name })));
      }
    } catch {
      // Keep existing cities
    } finally {
      setIsLoadingCities(false);
    }
  }, []);

  // Use dynamic cities or fallback
  const citiesToDisplay = dynamicCities.length > 0 ? dynamicCities : MOROCCAN_CITIES;

  // Fetch suggestions
  useEffect(() => {
    if (!debouncedSearchInput || debouncedSearchInput.length < 2) {
      setSuggestions([]);
      return;
    }

    let active = true;
    setIsLoadingSuggestions(true);

    searchAutocomplete({
      q: debouncedSearchInput,
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
        if (active) setIsLoadingSuggestions(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedSearchInput, universe]);

  // Track the universe for which we loaded popular searches
  const [loadedForUniverse, setLoadedForUniverse] = useState<string | null | undefined>(undefined);

  // Fetch popular searches when search modal opens or universe changes
  useEffect(() => {
    // Reload if modal is open AND (no data yet OR universe changed)
    const shouldLoad = isSearchModalOpen && (popularSearches.length === 0 || loadedForUniverse !== universe);

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
  }, [isSearchModalOpen, universe, popularSearches.length, loadedForUniverse]);

  // Reset popular searches when universe changes (to force reload)
  useEffect(() => {
    if (loadedForUniverse !== undefined && loadedForUniverse !== universe) {
      setPopularSearches([]);
    }
  }, [universe, loadedForUniverse]);

  // Prevent body scroll when modal is open and keep scroll position
  useEffect(() => {
    if (isCityModalOpen || isSearchModalOpen) {
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
  }, [isCityModalOpen, isSearchModalOpen]);

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
      setCity(t("suggestions.my_position") || "Autour de moi");
    } finally {
      setIsRequestingLocation(false);
      setIsCityModalOpen(false);
    }
  }, [t]);

  const handleSelectCity = (selectedCity: string) => {
    setCity(selectedCity);
    setIsCityModalOpen(false);
  };

  const handleSelectSuggestion = (suggestion: AutocompleteSuggestion) => {
    if (suggestion.category === "establishment" && suggestion.extra?.establishmentId) {
      const universePrefix = suggestion.universe ?? "restaurant";
      navigate(`/${universePrefix}/${suggestion.extra.establishmentId}`);
      setIsSearchModalOpen(false);
      return;
    }

    setQuery(suggestion.displayLabel);
    setIsSearchModalOpen(false);

    // Navigate to results
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    params.set("q", suggestion.term);
    if (universe && universe !== "restaurants") {
      params.set("universe", universe);
    }
    navigate(`/results?${params.toString()}`);
  };

  const handleSelectPopular = (search: { term: string; displayLabel: string }) => {
    setQuery(search.displayLabel);
    setIsSearchModalOpen(false);

    const params = new URLSearchParams();
    if (city) params.set("city", city);
    params.set("q", search.term);
    if (universe && universe !== "restaurants") {
      params.set("universe", universe);
    }
    navigate(`/results?${params.toString()}`);
  };

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (query) params.set("q", query);
    if (universe && universe !== "restaurants") {
      params.set("universe", universe);
    }
    navigate(`/results?${params.toString()}`);
  };

  const displayCity = city || "Ville";
  const displayQuery = query || "Rechercher";

  return (
    <>
      {/* Compact header bar */}
      <div className={cn("flex items-center gap-1.5 flex-1", className)}>
        {/* City Field - clickable to open modal */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsCityModalOpen(true);
          }}
          className="flex items-center gap-1 h-8 px-2 bg-white rounded-md text-xs min-w-0 flex-shrink-0"
        >
          <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="truncate text-slate-700 font-medium max-w-[50px]">
            {displayCity}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
        </button>

        {/* Search Field - clickable to open modal */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsSearchModalOpen(true);
          }}
          className="flex-1 flex items-center gap-1.5 h-8 px-2 bg-white rounded-md text-xs min-w-0"
        >
          <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span className={cn(
            "truncate",
            query ? "text-slate-700 font-medium" : "text-slate-400"
          )}>
            {displayQuery}
          </span>
        </button>

        {/* Search Button */}
        <button
          type="button"
          onClick={handleSearch}
          className="h-8 px-3 bg-white text-primary font-bold rounded-md text-xs hover:bg-slate-50 transition flex-shrink-0"
        >
          OK
        </button>
      </div>

      {/* City Modal - rendered via portal */}
      {isCityModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">
              Où allez-vous ?
            </h2>
            <button
              type="button"
              onClick={() => setIsCityModalOpen(false)}
              className="p-2 hover:bg-slate-100 rounded-full"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          {/* Content - scrollable */}
          <div className="flex-1 overflow-y-auto">
            {/* Near me option */}
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
                  <p className="text-base font-semibold text-slate-800">
                    Autour de moi
                  </p>
                  <p className="text-sm text-slate-500">
                    Utiliser ma position
                  </p>
                </div>
              </button>
            </div>

            {/* Country selector (if multiple countries) */}
            {countries.length > 1 && (
              <div className="px-4 py-2">
                <p className="text-sm font-bold text-slate-900 mb-2">
                  Pays
                </p>
                <div className="flex flex-wrap gap-2">
                  {countries.map((country) => (
                    <button
                      key={country.id}
                      onClick={() => handleSelectCountry(country.code)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition",
                        selectedCountry === country.code
                          ? "bg-primary text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      )}
                    >
                      <span>{country.flag_emoji}</span>
                      <span>{country.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Section title */}
            <div className="px-4 py-2">
              <p className="text-sm font-bold text-slate-900">
                {countries.length > 1 ? "Villes" : "Suggestions"}
              </p>
            </div>

            {/* Cities list */}
            <div className="px-4 pb-8">
              {isLoadingCities ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : citiesToDisplay.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Aucune ville disponible</p>
                </div>
              ) : (
                citiesToDisplay.map((cityItem) => (
                  <button
                    key={cityItem.id}
                    onClick={() => handleSelectCity(cityItem.name)}
                    className={cn(
                      "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition text-left mb-1",
                      city === cityItem.name ? "bg-primary/5" : "hover:bg-slate-50"
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-slate-400" />
                    </div>
                    <span className="text-base font-medium text-slate-700">{cityItem.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Search Modal - rendered via portal */}
      {isSearchModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-900">
                Que recherchez-vous ?
              </h2>
              <button
                type="button"
                onClick={() => setIsSearchModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            {/* Search input */}
            <div className="flex items-center gap-3 h-12 px-4 bg-slate-100 rounded-xl">
              <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cuisine, nom de lieu, plat..."
                className="flex-1 bg-transparent border-none outline-none text-base text-slate-700 placeholder:text-slate-400"
                autoFocus
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="p-1 hover:bg-slate-200 rounded-full"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              )}
              {isLoadingSuggestions && (
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
              )}
            </div>
          </div>

          {/* Content - scrollable */}
          <div className="flex-1 overflow-y-auto">
            {/* Show suggestions if searching */}
            {searchInput.length >= 2 && suggestions.length > 0 && (
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
                        <img
                          src={suggestion.extra.coverUrl}
                          alt=""
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        CATEGORY_ICONS[suggestion.category] || <Hash className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-medium text-slate-900 truncate">
                        {suggestion.displayLabel}
                      </p>
                      <p className="text-sm text-slate-500 truncate">
                        {suggestion.extra?.city || suggestion.category}
                      </p>
                    </div>
                    {suggestion.category === "establishment" && (
                      <span className="text-sm text-primary font-medium">Voir →</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Show popular searches when not searching */}
            {searchInput.length < 2 && popularSearches.length > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-slate-500" />
                  <p className="text-sm font-bold text-slate-900">
                    Recherches populaires
                  </p>
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
                    <span className="text-base font-medium text-slate-700">
                      {search.displayLabel}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* No results */}
            {searchInput.length >= 2 && suggestions.length === 0 && !isLoadingSuggestions && (
              <div className="px-4 py-8 text-center">
                <p className="text-slate-500">
                  Aucun résultat trouvé
                </p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
