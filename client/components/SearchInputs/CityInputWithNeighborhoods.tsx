import React, { useState, useRef, useEffect } from "react";
import { MapPin, ChevronRight, Zap } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useScrollContext } from "@/lib/scrollContext";
import { NEIGHBORHOODS_BY_CITY, MOROCCAN_CITIES } from "@/hooks/useSuggestions";
import { cn } from "@/lib/utils";

interface CityInputWithNeighborhoodsProps {
  value: string;
  onChange: (value: string, cityId?: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export function CityInputWithNeighborhoods({
  value,
  onChange,
  placeholder,
  className = "",
  inputClassName,
  disabled = false,
}: CityInputWithNeighborhoodsProps) {
  const { t } = useI18n();
  const { isScrolledPastSearch } = useScrollContext();
  const effectivePlaceholder = placeholder ?? t("search.field.city.placeholder");
  const myPositionLabel = t("suggestions.my_position");
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const isEmpty = inputValue.trim() === "";
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close dropdown when header sticky search bar appears
  useEffect(() => {
    if (isScrolledPastSearch && isOpen) {
      setIsOpen(false);
      setHoveredCity(null);
    }
  }, [isScrolledPastSearch, isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHoveredCity(null);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleSelectCity = (cityName: string, cityId: string) => {
    setInputValue(cityName);
    onChange(cityName, cityId);
    setIsOpen(false);
    setHoveredCity(null);
  };

  const handleSelectNeighborhood = (neighborhoodName: string, neighborhoodId: string, cityName: string) => {
    // Format: "Quartier, Ville"
    const fullValue = `${neighborhoodName}, ${cityName}`;
    setInputValue(fullValue);
    onChange(fullValue, neighborhoodId);
    setIsOpen(false);
    setHoveredCity(null);
  };

  const handleGeolocation = () => {
    setInputValue(myPositionLabel);

    if (!navigator.geolocation) {
      onChange(myPositionLabel, "geo:unavailable");
      setIsOpen(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        onChange(myPositionLabel, `geo:${lat.toFixed(6)},${lng.toFixed(6)}`);
        setIsOpen(false);
      },
      () => {
        onChange(myPositionLabel, "geo:denied");
        setIsOpen(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Filter cities based on input
  const filteredCities = inputValue.trim()
    ? MOROCCAN_CITIES.filter((city) =>
        city.name.toLowerCase().includes(inputValue.toLowerCase())
      )
    : MOROCCAN_CITIES;

  // Get neighborhoods for hovered city
  const neighborhoods = hoveredCity ? NEIGHBORHOODS_BY_CITY[hoveredCity] || [] : [];

  // Find city name for hovered city
  const hoveredCityData = MOROCCAN_CITIES.find((c) => c.id === hoveredCity);

  return (
    <div className={cn("relative w-full group", className)} ref={containerRef}>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary w-5 h-5 pointer-events-none transition-colors z-10" />
      <input
        ref={inputRef}
        type="text"
        placeholder={effectivePlaceholder}
        value={inputValue}
        disabled={disabled}
        onChange={(e) => {
          if (disabled) return;
          setInputValue(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => !disabled && setIsOpen(true)}
        className={
          inputClassName ??
          cn(
            "w-full pl-10 pr-4 py-2 h-10 md:h-11 border border-slate-200 rounded-md text-sm text-slate-900 placeholder:text-slate-500 placeholder:font-normal transition-colors [font-family:Circular_Std,_sans-serif]",
            disabled
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : cn(
                  "bg-white hover:border-slate-300 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  isEmpty ? "italic" : "not-italic"
                )
          )
        }
        autoComplete="off"
      />

      {isOpen && !isScrolledPastSearch && (
        <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-lg border border-slate-200 z-40 flex max-h-[400px]">
          {/* Cities column */}
          <div className="w-[220px] border-r border-slate-100 overflow-y-auto">
            {/* Ma position */}
            <button
              onClick={handleGeolocation}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-pink-50 active:bg-pink-100 transition text-left"
            >
              <Zap className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-gray-700">{t("suggestions.my_position")}</p>
                <p className="text-xs text-slate-500">{t("suggestions.use_my_location")}</p>
              </div>
            </button>

            {/* Section title */}
            <div className="px-4 py-2 bg-slate-50 sticky top-0 z-10 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t("suggestions.section.cities")}
              </p>
            </div>

            {/* Cities list */}
            {filteredCities.map((city) => (
              <button
                key={city.id}
                onClick={() => handleSelectCity(city.name, city.id)}
                onMouseEnter={() => setHoveredCity(city.id)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 transition text-left",
                  hoveredCity === city.id ? "bg-pink-50" : "hover:bg-pink-50"
                )}
              >
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-medium text-gray-700">{city.name}</span>
                </div>
                {NEIGHBORHOODS_BY_CITY[city.id] && NEIGHBORHOODS_BY_CITY[city.id].length > 0 && (
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                )}
              </button>
            ))}
          </div>

          {/* Neighborhoods column - only shown when hovering a city with neighborhoods */}
          {hoveredCity && neighborhoods.length > 0 && (
            <div className="w-[220px] overflow-y-auto">
              <div className="px-4 py-2 bg-slate-50 sticky top-0 z-10">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t("suggestions.section.neighborhoods")} - {hoveredCityData?.name}
                </p>
              </div>
              {neighborhoods.map((neighborhood) => (
                <button
                  key={neighborhood.id}
                  onClick={() =>
                    handleSelectNeighborhood(neighborhood.name, neighborhood.id, hoveredCityData?.name || "")
                  }
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-pink-50 active:bg-pink-100 transition text-left"
                >
                  <MapPin className="w-4 h-4 text-slate-300" />
                  <span className="text-sm text-gray-700">{neighborhood.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
