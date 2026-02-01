import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Sliders,
  Tag,
  Dumbbell,
  Zap,
  Building2,
  Landmark,
  Search,
  MapPin,
  Calendar,
  Clock,
  Users,
  ChevronRight
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ActivityCategory } from "@/lib/taxonomy";
import { getCategoryConfig, getActivitiesByCategory } from "@/lib/taxonomy";
import { readSearchState, patchSearchState } from "@/lib/searchState";
import { NEIGHBORHOODS_BY_CITY, MOROCCAN_CITIES } from "@/hooks/useSuggestions";
import { DatePickerInput } from "@/components/DatePickerInput";
import { TimePickerInput } from "@/components/TimePickerInput";
import { AnchoredSelect } from "@/components/AnchoredSelect";
import { PersonsSelector, type PersonsByAge } from "@/components/PersonsSelector";
import { FiltersPanel, type FilterState } from "@/components/FiltersPanel";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// City dropdown component with neighborhoods on hover
function CityDropdownContent({
  onSelectCity,
}: {
  city: string;
  onSelectCity: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);

  const handleGeolocation = () => {
    const myPositionLabel = t("suggestions.my_position");
    if (!navigator.geolocation) {
      onSelectCity(myPositionLabel);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => onSelectCity(myPositionLabel),
      () => onSelectCity(myPositionLabel),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const neighborhoods = hoveredCity ? NEIGHBORHOODS_BY_CITY[hoveredCity] || [] : [];
  const hoveredCityData = MOROCCAN_CITIES.find((c) => c.id === hoveredCity);

  return (
    <div className="flex">
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
        {MOROCCAN_CITIES.map((cityItem) => (
          <button
            key={cityItem.id}
            onClick={() => onSelectCity(cityItem.name)}
            onMouseEnter={() => setHoveredCity(cityItem.id)}
            className={cn(
              "w-full flex items-center justify-between px-4 py-3 transition text-left",
              hoveredCity === cityItem.id ? "bg-pink-50" : "hover:bg-pink-50"
            )}
          >
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-slate-400" />
              <span className="text-sm font-medium text-gray-700">{cityItem.name}</span>
            </div>
            {NEIGHBORHOODS_BY_CITY[cityItem.id] && NEIGHBORHOODS_BY_CITY[cityItem.id].length > 0 && (
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
              onClick={() => onSelectCity(`${neighborhood.name}, ${hoveredCityData?.name || ""}`)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-pink-50 active:bg-pink-100 transition text-left"
            >
              <MapPin className="w-4 h-4 text-slate-300" />
              <span className="text-sm text-gray-700">{neighborhood.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface HeaderSearchBarWithUniversesProps {
  className?: string;
}

const RESTAURANT_CATEGORIES = [
  { value: "gastronomique", labelKey: "search.restaurant_type.gastronomique" },
  { value: "rooftop", labelKey: "search.restaurant_type.rooftop" },
  { value: "plage", labelKey: "search.restaurant_type.plage" },
  { value: "brunch", labelKey: "search.restaurant_type.brunch" },
  { value: "cafe", labelKey: "search.restaurant_type.cafe" },
  { value: "fast_food", labelKey: "search.restaurant_type.fast_food" },
];

function makePersonsByAge(adults: number): PersonsByAge {
  return { age0_2: 0, age3_6: 0, age6_12: 0, age12_17: 0, age18_plus: Math.max(0, adults) };
}

function getTotalPeople(counts: PersonsByAge) {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

export function HeaderSearchBarWithUniverses({ className }: HeaderSearchBarWithUniversesProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const currentUniverse = (searchParams.get("universe") || "restaurants") as ActivityCategory;
  const config = getCategoryConfig(currentUniverse);

  // State from search state
  const [city, setCity] = useState(() => readSearchState(currentUniverse).city ?? "");
  const [typeValue, setTypeValue] = useState(() => readSearchState(currentUniverse).typeValue ?? "");
  const [restaurantCategory, setRestaurantCategory] = useState(() => readSearchState(currentUniverse).restaurantCategory ?? "");
  const [date, setDate] = useState(() => readSearchState(currentUniverse).date ?? "");
  const [time, setTime] = useState(() => readSearchState(currentUniverse).time ?? "");
  const [personsByAge, setPersonsByAge] = useState<PersonsByAge>(() => {
    const n = Number(readSearchState(currentUniverse).numPeople ?? 2);
    return makePersonsByAge(Number.isFinite(n) && n > 0 ? n : 2);
  });

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({ priceRange: [0, 1000], rating: 0, promotionsOnly: false });


  // Popover states
  const [cityOpen, setCityOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  const peopleTotal = useMemo(() => getTotalPeople(personsByAge), [personsByAge]);

  // Sync state when universe changes
  useEffect(() => {
    const stored = readSearchState(currentUniverse);
    setCity(stored.city ?? "");
    setTypeValue(stored.typeValue ?? "");
    setRestaurantCategory(stored.restaurantCategory ?? "");
    setDate(stored.date ?? "");
    setTime(stored.time ?? "");
    const n = Number(stored.numPeople ?? 2);
    setPersonsByAge(makePersonsByAge(Number.isFinite(n) && n > 0 ? n : 2));
  }, [currentUniverse]);

  // Persist changes
  useEffect(() => {
    patchSearchState(currentUniverse, {
      city,
      typeValue,
      restaurantCategory,
      date,
      time,
      numPeople: String(peopleTotal),
    });
  }, [currentUniverse, city, typeValue, restaurantCategory, date, time, peopleTotal]);

  const restaurantCategoryOptions = RESTAURANT_CATEGORIES.map((opt) => ({
    value: opt.value,
    label: t(opt.labelKey),
  }));

  const activities = getActivitiesByCategory(currentUniverse);
  const typeOptions = useMemo(() => {
    return activities.map((a) => ({ value: a.id, label: a.name }));
  }, [activities]);

  const handleSearch = () => {
    const params = new URLSearchParams();
    params.set("universe", currentUniverse);
    if (filters.promotionsOnly) params.set("promo", "1");
    navigate(`/results?${params.toString()}`);
  };

  // Get icon for current universe type selector
  const getUniverseIcon = () => {
    switch (currentUniverse) {
      case "sport": return Dumbbell;
      case "loisirs": return Zap;
      case "hebergement": return Building2;
      case "culture": return Landmark;
      default: return Tag;
    }
  };

  const UniverseIcon = getUniverseIcon();

  const iconButtonClass = "h-10 flex-1 p-0 rounded-lg border border-white/20 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center transition-all";
  const activeIconButtonClass = "h-10 flex-1 p-0 rounded-lg border-2 border-white bg-white text-primary hover:bg-slate-50 flex items-center justify-center transition-all";

  return (
    <div className={cn("flex items-center justify-center gap-2 w-full", className)}>
      {/* City - using Popover for proper positioning */}
      <Popover open={cityOpen} onOpenChange={setCityOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(city ? activeIconButtonClass : iconButtonClass)}
          >
            <MapPin className="w-5 h-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 max-h-[400px] overflow-hidden"
          align="start"
          sideOffset={8}
        >
          <CityDropdownContent
            city={city}
            onSelectCity={(value) => {
              setCity(value);
              setCityOpen(false);
            }}
            onClose={() => setCityOpen(false)}
          />
        </PopoverContent>
      </Popover>

      {/* Type/Category based on universe */}
      <Popover open={typeOpen} onOpenChange={setTypeOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={(restaurantCategory || typeValue) ? activeIconButtonClass : iconButtonClass}>
            <UniverseIcon className="w-5 h-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-2" align="start">
          {currentUniverse === "restaurants" ? (
            <AnchoredSelect
              icon={Tag}
              value={restaurantCategory}
              onChange={(val) => {
                setRestaurantCategory(val);
                setTypeOpen(false);
              }}
              placeholder={t("search.placeholder.restaurant_type")}
              title={t("search.title.choose_restaurant_type")}
              options={restaurantCategoryOptions}
              maxHeightClassName="max-h-60"
              triggerClassName="h-10 text-sm rounded-md border border-slate-200 w-full px-3 flex items-center justify-between bg-white"
            />
          ) : (
            <AnchoredSelect
              icon={UniverseIcon}
              value={typeValue}
              onChange={(val) => {
                setTypeValue(val);
                setTypeOpen(false);
              }}
              placeholder={t("search.placeholder.activity_type")}
              title={t("search.title.choose_activity")}
              options={typeOptions}
              maxHeightClassName="max-h-60"
              triggerClassName="h-10 text-sm rounded-md border border-slate-200 w-full px-3 flex items-center justify-between bg-white"
            />
          )}
        </PopoverContent>
      </Popover>

      {/* Date */}
      {config.fields.date && (
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={date ? activeIconButtonClass : iconButtonClass}>
              <Calendar className="w-5 h-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <DatePickerInput
              value={date}
              onChange={(val) => {
                setDate(val);
                setDateOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Time */}
      {config.fields.time && (
        <Popover open={timeOpen} onOpenChange={setTimeOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={time ? activeIconButtonClass : iconButtonClass}>
              <Clock className="w-5 h-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <TimePickerInput
              value={time}
              onChange={(val) => {
                setTime(val);
                setTimeOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      )}

      {/* People */}
      {config.fields.num_people && (
        <Popover open={peopleOpen} onOpenChange={setPeopleOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={peopleTotal > 0 ? activeIconButtonClass : iconButtonClass}>
              <Users className="w-5 h-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-2" align="start">
            <PersonsSelector
              value={personsByAge}
              onChange={(next) => setPersonsByAge(next)}
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Filters button */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsFilterOpen(true)}
        className={iconButtonClass}
      >
        <Sliders className="w-5 h-5" />
      </Button>

      {/* Search button */}
      <Button
        type="button"
        onClick={handleSearch}
        className="h-10 flex-1 p-0 rounded-lg bg-white text-primary hover:bg-slate-50 flex items-center justify-center transition-all"
      >
        <Search className="w-5 h-5" />
      </Button>

      {/* Filters Panel */}
      <FiltersPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        category={currentUniverse}
        onApplyFilters={(newFilters) => {
          setFilters(newFilters);
          setIsFilterOpen(false);
        }}
        initialFilters={filters}
      />
    </div>
  );
}
