import React, { useState, useMemo } from "react";
import { MapPin, Zap, X, Search, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { NEIGHBORHOODS_BY_CITY, MOROCCAN_CITIES } from "@/hooks/useSuggestions";

interface CityBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCity: string;
  onSelectCity: (city: string, cityId?: string) => void;
}

export function CityBottomSheet({
  isOpen,
  onClose,
  selectedCity,
  onSelectCity,
}: CityBottomSheetProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCity, setExpandedCity] = useState<string | null>(null);

  // Filter cities based on search
  const filteredCities = useMemo(() => {
    if (!searchQuery.trim()) return MOROCCAN_CITIES;
    const query = searchQuery.toLowerCase();
    return MOROCCAN_CITIES.filter((city) =>
      city.name.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const handleSelectCity = (cityName: string, cityId: string) => {
    onSelectCity(cityName, cityId);
    onClose();
    setSearchQuery("");
    setExpandedCity(null);
  };

  const handleSelectNeighborhood = (neighborhoodName: string, neighborhoodId: string, cityName: string) => {
    const fullValue = `${neighborhoodName}, ${cityName}`;
    onSelectCity(fullValue, neighborhoodId);
    onClose();
    setSearchQuery("");
    setExpandedCity(null);
  };

  const handleGeolocation = () => {
    const myPositionLabel = t("suggestions.my_position");

    if (!navigator.geolocation) {
      onSelectCity(myPositionLabel, "geo:unavailable");
      onClose();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        onSelectCity(myPositionLabel, `geo:${lat.toFixed(6)},${lng.toFixed(6)}`);
        onClose();
      },
      () => {
        onSelectCity(myPositionLabel, "geo:denied");
        onClose();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("search.field.city.placeholder")}
          </h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Search Input */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder={t("search.city.search_placeholder") || "Rechercher une ville..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Ma position */}
          <button
            onClick={handleGeolocation}
            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-slate-50 active:bg-slate-100 transition text-left border-b border-slate-100"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{t("suggestions.my_position")}</p>
              <p className="text-xs text-slate-500">{t("suggestions.use_my_location")}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300" />
          </button>

          {/* Section title */}
          <div className="px-4 py-2 bg-slate-50 sticky top-0 z-10">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t("suggestions.section.cities")}
            </p>
          </div>

          {/* Cities list */}
          {filteredCities.map((city) => {
            const neighborhoods = NEIGHBORHOODS_BY_CITY[city.id] || [];
            const hasNeighborhoods = neighborhoods.length > 0;
            const isExpanded = expandedCity === city.id;

            return (
              <div key={city.id}>
                <button
                  onClick={() => {
                    if (hasNeighborhoods) {
                      setExpandedCity(isExpanded ? null : city.id);
                    } else {
                      handleSelectCity(city.name, city.id);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition text-left ${
                    selectedCity === city.name ? "bg-primary/5" : ""
                  }`}
                >
                  <MapPin className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-sm font-medium text-slate-900">{city.name}</span>
                  {hasNeighborhoods && (
                    <ChevronRight
                      className={`w-5 h-5 text-slate-300 transition-transform ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                  )}
                </button>

                {/* Neighborhoods expandable list */}
                {isExpanded && hasNeighborhoods && (
                  <div className="bg-slate-50 border-y border-slate-100">
                    <div className="px-4 py-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {t("suggestions.section.neighborhoods")} - {city.name}
                      </p>
                    </div>
                    {neighborhoods.map((neighborhood) => (
                      <button
                        key={neighborhood.id}
                        onClick={() => handleSelectNeighborhood(neighborhood.name, neighborhood.id, city.name)}
                        className="w-full flex items-center gap-3 pl-8 pr-4 py-3 hover:bg-slate-100 active:bg-slate-200 transition text-left"
                      >
                        <MapPin className="w-4 h-4 text-slate-300 flex-shrink-0" />
                        <span className="text-sm text-slate-700">{neighborhood.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* No results */}
          {filteredCities.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-slate-500">{t("search.no_cities_found") || "Aucune ville trouvée"}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
