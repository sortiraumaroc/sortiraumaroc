import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bed, Landmark, ShoppingBag, Sliders, Tag, Car, MapPin, Clock } from "lucide-react";

import { CityInput } from "./CityInput";
import { CityInputWithHistory } from "./CityInputWithHistory";
import { ActivityTypeInput } from "./ActivityTypeInput";
import { PrestationInput } from "./PrestationInput";

import { DatePickerInput } from "@/components/DatePickerInput";
import { TimePickerInput } from "@/components/TimePickerInput";
import { FiltersPanel, FilterState } from "@/components/FiltersPanel";
import { PersonsSelector, type PersonsByAge } from "@/components/PersonsSelector";
import { AnchoredSelect } from "@/components/AnchoredSelect";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { ActivityCategory, getActivitiesByCategory, getActivityById, getCategoryConfig } from "@/lib/taxonomy";
import { patchSearchState, readSearchState } from "@/lib/searchState";
import { saveSearchToHistory, type SearchHistoryItem } from "@/lib/searchHistory";
import { BookingDateTimeBottomSheet, type BookingBottomSheetTab, type ServiceTimesConfig } from "@/components/booking/BookingDateTimeBottomSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ServiceType } from "@/hooks/useBooking";

interface AdaptiveSearchFormProps {
  selectedUniverse: ActivityCategory;
  onUniverseChange: (universe: ActivityCategory) => void;
  onSearch: () => void;
  /** When true, renders stacked inputs for mobile hero like TheFork */
  mobileStackedLayout?: boolean;
}

const GENERIC_TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

const RESTAURANT_ESTABLISHMENT_CATEGORIES: Array<{ value: string; labelKey: string }> = [
  { value: "gastronomique", labelKey: "search.restaurant_type.gastronomique" },
  { value: "rooftop", labelKey: "search.restaurant_type.rooftop" },
  { value: "plage", labelKey: "search.restaurant_type.plage" },
  { value: "brunch", labelKey: "search.restaurant_type.brunch" },
  { value: "cafe", labelKey: "search.restaurant_type.cafe" },
  { value: "fast_food", labelKey: "search.restaurant_type.fast_food" },
  { value: "bistronomie", labelKey: "search.restaurant_type.bistronomie" },
  { value: "familial", labelKey: "search.restaurant_type.familial" },
];

const SHOPPING_STORE_TYPES: Array<{ value: string; labelKey: string }> = [
  { value: "mode", labelKey: "search.shopping_type.mode" },
  { value: "chaussures", labelKey: "search.shopping_type.chaussures" },
  { value: "beaute_parfumerie", labelKey: "search.shopping_type.beaute_parfumerie" },
  { value: "optique", labelKey: "search.shopping_type.optique" },
  { value: "bijoux", labelKey: "search.shopping_type.bijoux" },
  { value: "maison_deco", labelKey: "search.shopping_type.maison_deco" },
  { value: "epicerie_fine", labelKey: "search.shopping_type.epicerie_fine" },
  { value: "artisanat", labelKey: "search.shopping_type.artisanat" },
  { value: "concept_store", labelKey: "search.shopping_type.concept_store" },
  { value: "autres", labelKey: "search.shopping_type.autres" },
];

const RENTACAR_VEHICLE_TYPES: Array<{ value: string; label: string }> = [
  { value: "citadine", label: "Citadine" },
  { value: "compacte", label: "Compacte" },
  { value: "berline", label: "Berline" },
  { value: "suv", label: "SUV" },
  { value: "4x4", label: "4x4" },
  { value: "monospace", label: "Monospace" },
  { value: "utilitaire", label: "Utilitaire" },
  { value: "luxe", label: "Voiture de luxe" },
  { value: "sport", label: "Voiture de sport" },
  { value: "electrique", label: "Voiture électrique" },
  { value: "moto", label: "Moto / Scooter" },
];

function makePersonsByAge(adults: number): PersonsByAge {
  return {
    age0_2: 0,
    age3_6: 0,
    age6_12: 0,
    age12_17: 0,
    age18_plus: Math.max(0, adults),
  };
}

function getTotalPeople(counts: PersonsByAge) {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

export function AdaptiveSearchForm({ selectedUniverse, onUniverseChange, onSearch, mobileStackedLayout }: AdaptiveSearchFormProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const config = getCategoryConfig(selectedUniverse);
  const activities = getActivitiesByCategory(selectedUniverse);

  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSheetTab, setMobileSheetTab] = useState<BookingBottomSheetTab>("date");

  const [selectedCity, setSelectedCity] = useState(() => readSearchState(selectedUniverse).city ?? "");
  const [selectedCityId, setSelectedCityId] = useState<string | undefined>(() => readSearchState(selectedUniverse).cityId ?? undefined);

  const [selectedTypeValue, setSelectedTypeValue] = useState(() => readSearchState(selectedUniverse).typeValue ?? "");
  const [restaurantEstablishmentCategory, setRestaurantEstablishmentCategory] = useState(() => readSearchState(selectedUniverse).restaurantCategory ?? "");
  const [shoppingStoreType, setShoppingStoreType] = useState(() => readSearchState(selectedUniverse).shoppingStoreType ?? "");

  // Rentacar specific states
  const [pickupLocation, setPickupLocation] = useState(() => readSearchState(selectedUniverse).pickupLocation ?? "");
  const [dropoffLocation, setDropoffLocation] = useState(() => readSearchState(selectedUniverse).dropoffLocation ?? "");
  const [sameDropoff, setSameDropoff] = useState(true);
  const [pickupTime, setPickupTime] = useState(() => readSearchState(selectedUniverse).pickupTime ?? "10:00");
  const [dropoffTime, setDropoffTime] = useState(() => readSearchState(selectedUniverse).dropoffTime ?? "10:00");
  const [vehicleType, setVehicleType] = useState(() => readSearchState(selectedUniverse).vehicleType ?? "");

  const [selectedDate, setSelectedDate] = useState(() => readSearchState(selectedUniverse).date ?? "");
  const [selectedCheckInDate, setSelectedCheckInDate] = useState(() => readSearchState(selectedUniverse).checkInDate ?? "");
  const [selectedCheckOutDate, setSelectedCheckOutDate] = useState(() => readSearchState(selectedUniverse).checkOutDate ?? "");
  const [selectedTime, setSelectedTime] = useState(() => readSearchState(selectedUniverse).time ?? "");

  const [numPeople, setNumPeople] = useState(() => readSearchState(selectedUniverse).numPeople ?? "2");
  const [personsByAge, setPersonsByAge] = useState<PersonsByAge>(() => {
    const n = Number(readSearchState(selectedUniverse).numPeople ?? 2);
    return makePersonsByAge(Number.isFinite(n) && n > 0 ? n : 2);
  });

  const [selectedService, setSelectedService] = useState<ServiceType | null>(null);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({ priceRange: [0, 1000], rating: 0, promotionsOnly: false });

  const selectedActivity = selectedTypeValue ? getActivityById(selectedTypeValue) : null;

  const shouldShowNumPeople =
    config.fields.num_people && (!config.conditional_num_people || !!selectedActivity?.requires_group);

  const shouldShowShoppingAppointmentFields =
    selectedUniverse === "shopping" && (filters.shoppingServices || []).includes("RDV showroom");

  const effectiveShouldShowDate =
    (config.fields.date && !config.fields.checkin_date) ||
    (selectedUniverse === "shopping" && shouldShowShoppingAppointmentFields);

  const effectiveShouldShowTime =
    config.fields.time || (selectedUniverse === "shopping" && shouldShowShoppingAppointmentFields);

  const peopleTotal = useMemo(() => getTotalPeople(personsByAge), [personsByAge]);
  const minParticipants = useMemo(() => {
    if (!shouldShowNumPeople) return 0;
    return selectedActivity?.min_people ?? 1;
  }, [selectedActivity?.min_people, shouldShowNumPeople]);

  const maxParticipants = useMemo(() => {
    if (!shouldShowNumPeople) return undefined;
    const max = selectedActivity?.max_people;
    return typeof max === "number" && max > 0 ? max : undefined;
  }, [selectedActivity?.max_people, shouldShowNumPeople]);

  const minParticipantsMessage =
    shouldShowNumPeople && minParticipants > 1 && peopleTotal < minParticipants
      ? t("search.validation.minimum_people", { count: minParticipants })
      : null;

  const canSearch = !minParticipantsMessage;

  const didHydrateRef = useRef(false);

  useEffect(() => {
    const stored = readSearchState(selectedUniverse);

    setSelectedCity(stored.city ?? "");
    setSelectedCityId(stored.cityId ?? undefined);
    setSelectedTypeValue(stored.typeValue ?? "");
    setRestaurantEstablishmentCategory(stored.restaurantCategory ?? "");
    setShoppingStoreType(stored.shoppingStoreType ?? "");
    setSelectedDate(stored.date ?? "");
    setSelectedCheckInDate(stored.checkInDate ?? "");
    setSelectedCheckOutDate(stored.checkOutDate ?? "");
    setSelectedTime(stored.time ?? "");

    const n = Number(stored.numPeople ?? 2);
    const normalized = Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "2";
    setNumPeople(normalized);
    setPersonsByAge(makePersonsByAge(Number(normalized)));

    didHydrateRef.current = true;
  }, [selectedUniverse]);

  useEffect(() => {
    if (!didHydrateRef.current) return;
    patchSearchState(selectedUniverse, {
      city: selectedCity,
      cityId: selectedCityId,
      typeValue: selectedTypeValue,
      restaurantCategory: restaurantEstablishmentCategory,
      shoppingStoreType,
      date: selectedDate,
      checkInDate: selectedCheckInDate,
      checkOutDate: selectedCheckOutDate,
      time: selectedTime,
      numPeople,
    });
  }, [
    selectedUniverse,
    selectedCity,
    selectedCityId,
    selectedTypeValue,
    restaurantEstablishmentCategory,
    shoppingStoreType,
    selectedDate,
    selectedCheckInDate,
    selectedCheckOutDate,
    selectedTime,
    numPeople,
  ]);

  useEffect(() => {
    if (!selectedActivity?.default_people) return;
    const next = makePersonsByAge(selectedActivity.default_people);
    setPersonsByAge(next);
    setNumPeople(String(getTotalPeople(next)));
  }, [selectedActivity?.default_people, selectedActivity?.id]);

  const cultureOptions = useMemo(() => {
    if (selectedUniverse !== "culture") return [];
    return activities.map((a) => ({ value: a.id, label: a.name }));
  }, [activities, selectedUniverse]);

  const hebergementOptions = useMemo(() => {
    if (selectedUniverse !== "hebergement") return [];
    return activities.map((a) => ({ value: a.id, label: a.name }));
  }, [activities, selectedUniverse]);

  const handleMobileSheetOpen = (tab: BookingBottomSheetTab) => {
    setMobileSheetTab(tab);
    setMobileSheetOpen(true);
  };

  const renderSearchInputs = ({ mobile }: { mobile: boolean }) => {
    const wrap = (key: string, desktopClassName: string, mobileClassName: string, node: React.ReactNode) => (
      <div key={key} className={mobile ? mobileClassName : desktopClassName}>
        {node}
      </div>
    );

    const inputs: React.ReactNode[] = [];

    if (config.fields.city) {
      // For rentacar, use "Prise en charge" and "Lieu de restitution"
      if (selectedUniverse === "rentacar") {
        // Prise en charge
        inputs.push(
          wrap(
            "pickup-location",
            "flex-1 min-w-[130px] max-w-[160px]",
            "col-span-2",
            <CityInput
              value={pickupLocation || selectedCity}
              onChange={(value, cityId) => {
                setPickupLocation(value);
                setSelectedCity(value);
                setSelectedCityId(cityId);
                if (sameDropoff) setDropoffLocation(value);
              }}
              placeholder={t("search.rentacar.pickup_location")}
            />,
          ),
        );
        // Lieu de restitution
        inputs.push(
          wrap(
            "dropoff-location",
            "flex-1 min-w-[130px] max-w-[160px]",
            "col-span-2",
            <CityInput
              value={sameDropoff ? pickupLocation : dropoffLocation}
              onChange={(value) => {
                setDropoffLocation(value);
              }}
              placeholder={t("search.rentacar.dropoff_location")}
              disabled={sameDropoff}
            />,
          ),
        );
        // Checkbox restitution identique
        inputs.push(
          wrap(
            "same-dropoff",
            "flex items-center",
            "col-span-2",
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer hover:text-slate-800 whitespace-nowrap">
              <input
                type="checkbox"
                checked={sameDropoff}
                onChange={(e) => setSameDropoff(e.target.checked)}
                className="w-3.5 h-3.5 text-primary border-slate-300 rounded focus:ring-primary"
              />
              <span>{t("search.rentacar.same_dropoff")}</span>
            </label>,
          ),
        );
      } else {
        inputs.push(
          wrap(
            "city",
            "flex-1 min-w-[120px]",
            "col-span-2",
            <CityInputWithHistory
              value={selectedCity}
              onChange={(value, cityId) => {
                setSelectedCity(value);
                setSelectedCityId(cityId);
              }}
              universe={selectedUniverse}
              onHistorySelect={handleHistorySelect}
            />,
          ),
        );
      }
    }

    const restaurantCategoryOptions = RESTAURANT_ESTABLISHMENT_CATEGORIES.map((opt) => ({
      value: opt.value,
      label: t(opt.labelKey),
    }));

    const shoppingStoreTypeOptions = SHOPPING_STORE_TYPES.map((opt) => ({
      value: opt.value,
      label: t(opt.labelKey),
    }));

    if (selectedUniverse === "restaurants") {
      inputs.push(
        wrap(
          "restaurant-category",
          "flex-1 min-w-[140px]",
          "col-span-2",
          <AnchoredSelect
            icon={Tag}
            value={restaurantEstablishmentCategory}
            onChange={setRestaurantEstablishmentCategory}
            placeholder={t("search.placeholder.restaurant_type")}
            title={t("search.title.choose_restaurant_type")}
            options={restaurantCategoryOptions}
            maxHeightClassName="max-h-72"
          />,
        ),
      );
    }

    if (selectedUniverse === "sport") {
      inputs.push(
        wrap(
          "prestation",
          "flex-1 min-w-[140px]",
          "col-span-2",
          <PrestationInput value={selectedTypeValue} onChange={setSelectedTypeValue} />,
        ),
      );
    }

    if (selectedUniverse === "loisirs") {
      inputs.push(
        wrap(
          "loisirs-type",
          "flex-1 min-w-[140px]",
          "col-span-2",
          <ActivityTypeInput value={selectedTypeValue} onChange={setSelectedTypeValue} />,
        ),
      );
    }

    if (selectedUniverse === "hebergement") {
      inputs.push(
        wrap(
          "hebergement-type",
          "flex-1 min-w-[140px]",
          "col-span-2",
          <AnchoredSelect
            icon={Bed}
            value={selectedTypeValue}
            onChange={setSelectedTypeValue}
            placeholder={t("search.placeholder.accommodation_type")}
            title={t("search.title.choose_accommodation_type")}
            options={hebergementOptions}
            maxHeightClassName="max-h-72"
          />,
        ),
      );
    }

    if (selectedUniverse === "culture") {
      inputs.push(
        wrap(
          "culture-type",
          "flex-1 min-w-[140px]",
          "col-span-2",
          <AnchoredSelect
            icon={Landmark}
            value={selectedTypeValue}
            onChange={setSelectedTypeValue}
            placeholder={t("search.placeholder.culture_type")}
            title={t("search.title.choose_culture_type")}
            options={cultureOptions}
            maxHeightClassName="max-h-72"
          />,
        ),
      );
    }

    if (selectedUniverse === "shopping") {
      inputs.push(
        wrap(
          "shopping-type",
          "flex-1 min-w-[140px]",
          "col-span-2",
          <AnchoredSelect
            icon={ShoppingBag}
            value={shoppingStoreType}
            onChange={setShoppingStoreType}
            placeholder={t("search.placeholder.shopping_type")}
            title={t("search.title.choose_shopping_type")}
            options={shoppingStoreTypeOptions}
            maxHeightClassName="max-h-72"
          />,
        ),
      );
    }

    if (config.fields.checkin_date) {
      inputs.push(
        wrap(
          "checkin",
          "flex-none w-[135px]",
          "col-span-1",
          <DatePickerInput value={selectedCheckInDate} onChange={setSelectedCheckInDate} />,
        ),
      );
      // Add time picker after check-in date
      inputs.push(
        wrap(
          "checkin-time",
          "flex-none w-[105px]",
          "col-span-1",
          <TimePickerInput
            value={selectedTime}
            onChange={setSelectedTime}
            onMobileClick={mobile ? () => handleMobileSheetOpen("time") : undefined}
          />,
        ),
      );
    }

    if (config.fields.checkout_date) {
      inputs.push(
        wrap(
          "checkout",
          "flex-none w-[135px]",
          "col-span-1",
          <DatePickerInput value={selectedCheckOutDate} onChange={setSelectedCheckOutDate} />,
        ),
      );
      // Add time picker after check-out date
      inputs.push(
        wrap(
          "checkout-time",
          "flex-none w-[105px]",
          "col-span-1",
          <TimePickerInput
            value={selectedTime}
            onChange={setSelectedTime}
            onMobileClick={mobile ? () => handleMobileSheetOpen("time") : undefined}
          />,
        ),
      );
    }

    if (effectiveShouldShowDate) {
      inputs.push(
        wrap(
          "date",
          "flex-none w-[135px]",
          "col-span-1",
          <DatePickerInput
            value={selectedDate}
            onChange={setSelectedDate}
          />,
        ),
      );
      // Add time picker after date for all universes with date field
      inputs.push(
        wrap(
          "time",
          "flex-none w-[105px]",
          "col-span-1",
          <TimePickerInput
            value={selectedTime}
            onChange={setSelectedTime}
            onMobileClick={mobile ? () => handleMobileSheetOpen("time") : undefined}
          />,
        ),
      );
    }

    if (shouldShowNumPeople) {
      inputs.push(
        wrap(
          "people",
          "flex-1 min-w-[140px]",
          "col-span-2",
          <PersonsSelector
            value={personsByAge}
            maxTotal={maxParticipants}
            onChange={(next) => {
              setPersonsByAge(next);
              setNumPeople(String(getTotalPeople(next)));
            }}
          />,
        ),
      );
    }

    return inputs;
  };

  const GENERIC_SERVICE_TIMES: ServiceTimesConfig[] = [
    { service: "déjeuner", label: t("booking.service.lunch"), times: GENERIC_TIME_SLOTS.slice(24, 30) },
    { service: "dîner", label: t("booking.service.dinner"), times: GENERIC_TIME_SLOTS.slice(38, 46) },
  ];

  const handleApplyFilters = (newFilters: FilterState) => {
    setFilters(newFilters);
  };

  const handleSearch = () => {
    if (!canSearch) return;

    // Save search to history
    saveSearchToHistory({
      universe: selectedUniverse,
      city: selectedCity,
      date: selectedDate || undefined,
      time: selectedTime || undefined,
      guests: peopleTotal > 0 ? peopleTotal : undefined,
      prestation: selectedTypeValue || undefined,
      activityType: selectedTypeValue || undefined,
      checkInDate: selectedCheckInDate || undefined,
      checkOutDate: selectedCheckOutDate || undefined,
      pickupLocation: pickupLocation || undefined,
      dropoffLocation: dropoffLocation || undefined,
      pickupTime: pickupTime || undefined,
      dropoffTime: dropoffTime || undefined,
    });

    onSearch();
    const params = new URLSearchParams();
    params.set("universe", selectedUniverse);
    if (filters.promotionsOnly) params.set("promo", "1");
    navigate(`/results?${params.toString()}`);
  };

  // Handle history item selection - fill all fields from history
  const handleHistorySelect = (item: SearchHistoryItem) => {
    setSelectedCity(item.city);

    if (item.date) setSelectedDate(item.date);
    if (item.time) setSelectedTime(item.time);
    if (item.guests) {
      setPersonsByAge(makePersonsByAge(item.guests));
      setNumPeople(String(item.guests));
    }
    if (item.prestation) setSelectedTypeValue(item.prestation);
    if (item.activityType) setSelectedTypeValue(item.activityType);
    if (item.checkInDate) setSelectedCheckInDate(item.checkInDate);
    if (item.checkOutDate) setSelectedCheckOutDate(item.checkOutDate);
    if (item.pickupLocation) setPickupLocation(item.pickupLocation);
    if (item.dropoffLocation) setDropoffLocation(item.dropoffLocation);
    if (item.pickupTime) setPickupTime(item.pickupTime);
    if (item.dropoffTime) setDropoffTime(item.dropoffTime);
  };

  // Mobile stacked layout (TheFork style) for hero section
  if (mobileStackedLayout) {
    return (
      <>
        <div className="space-y-3">
          {/* City Input with History - full width with white background */}
          <CityInputWithHistory
            value={selectedCity}
            onChange={(value, cityId) => {
              setSelectedCity(value);
              setSelectedCityId(cityId);
            }}
            universe={selectedUniverse}
            onHistorySelect={handleHistorySelect}
            inputClassName="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 placeholder:text-slate-500 placeholder:font-normal border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
          />

          {/* Type/Category Input - full width with white background */}
          {selectedUniverse === "restaurants" && (
            <AnchoredSelect
              icon={Tag}
              value={restaurantEstablishmentCategory}
              onChange={setRestaurantEstablishmentCategory}
              placeholder={t("search.placeholder.restaurant_type")}
              title={t("search.title.choose_restaurant_type")}
              options={RESTAURANT_ESTABLISHMENT_CATEGORIES.map((opt) => ({
                value: opt.value,
                label: t(opt.labelKey),
              }))}
              maxHeightClassName="max-h-72"
              triggerClassName="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 text-left flex items-center justify-between border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
            />
          )}

          {selectedUniverse === "sport" && (
            <PrestationInput
              value={selectedTypeValue}
              onChange={setSelectedTypeValue}
              triggerClassName="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 text-left flex items-center justify-between border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
            />
          )}

          {selectedUniverse === "loisirs" && (
            <ActivityTypeInput
              value={selectedTypeValue}
              onChange={setSelectedTypeValue}
              triggerClassName="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 text-left flex items-center justify-between border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
            />
          )}

          {selectedUniverse === "hebergement" && (
            <AnchoredSelect
              icon={Bed}
              value={selectedTypeValue}
              onChange={setSelectedTypeValue}
              placeholder={t("search.placeholder.accommodation_type")}
              title={t("search.title.choose_accommodation_type")}
              options={hebergementOptions}
              maxHeightClassName="max-h-72"
              triggerClassName="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 text-left flex items-center justify-between border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
            />
          )}

          {selectedUniverse === "culture" && (
            <AnchoredSelect
              icon={Landmark}
              value={selectedTypeValue}
              onChange={setSelectedTypeValue}
              placeholder={t("search.placeholder.culture_type")}
              title={t("search.title.choose_culture_type")}
              options={cultureOptions}
              maxHeightClassName="max-h-72"
              triggerClassName="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 text-left flex items-center justify-between border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
            />
          )}

          {selectedUniverse === "shopping" && (
            <AnchoredSelect
              icon={ShoppingBag}
              value={shoppingStoreType}
              onChange={setShoppingStoreType}
              placeholder={t("search.placeholder.shopping_type")}
              title={t("search.title.choose_shopping_type")}
              options={SHOPPING_STORE_TYPES.map((opt) => ({
                value: opt.value,
                label: t(opt.labelKey),
              }))}
              maxHeightClassName="max-h-72"
              triggerClassName="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 text-left flex items-center justify-between border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
            />
          )}

          {/* Rentacar specific fields */}
          {selectedUniverse === "rentacar" && (
            <>
              {/* Pickup Location */}
              <CityInput
                value={pickupLocation}
                onChange={(value) => {
                  setPickupLocation(value);
                  if (sameDropoff) setDropoffLocation(value);
                }}
                placeholder={t("search.rentacar.pickup_location")}
                inputClassName="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 placeholder:text-slate-500 placeholder:font-normal border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
              />

              {/* Dropoff Location */}
              <div className="relative">
                <CityInput
                  value={sameDropoff ? pickupLocation : dropoffLocation}
                  onChange={(value) => {
                    setDropoffLocation(value);
                    setSameDropoff(false);
                  }}
                  placeholder={sameDropoff ? t("search.rentacar.same_dropoff") : t("search.rentacar.dropoff_location")}
                  inputClassName="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 placeholder:text-slate-500 placeholder:font-normal border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
                  disabled={sameDropoff}
                />
                <label className="flex items-center gap-2 mt-2 text-sm text-white/90">
                  <input
                    type="checkbox"
                    checked={sameDropoff}
                    onChange={(e) => setSameDropoff(e.target.checked)}
                    className="rounded border-white/30"
                  />
                  {t("search.rentacar.same_dropoff_checkbox")}
                </label>
              </div>

              {/* Dates (Check-in / Check-out) */}
              <div className="grid grid-cols-2 gap-2">
                <DatePickerInput
                  value={selectedCheckInDate}
                  onChange={setSelectedCheckInDate}
                  placeholder={t("search.rentacar.pickup_date")}
                  inputClassName="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 placeholder:text-slate-500 border-0 shadow-sm [font-family:Circular_Std,_sans-serif]"
                />
                <DatePickerInput
                  value={selectedCheckOutDate}
                  onChange={setSelectedCheckOutDate}
                  placeholder={t("search.rentacar.dropoff_date")}
                  inputClassName="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 placeholder:text-slate-500 border-0 shadow-sm [font-family:Circular_Std,_sans-serif]"
                />
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none z-10" />
                  <select
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 border-0 shadow-sm appearance-none cursor-pointer [font-family:Circular_Std,_sans-serif]"
                  >
                    {GENERIC_TIME_SLOTS.map((time) => (
                      <option key={time} value={time}>{time.replace(":", " h ")}</option>
                    ))}
                  </select>
                </div>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none z-10" />
                  <select
                    value={dropoffTime}
                    onChange={(e) => setDropoffTime(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 border-0 shadow-sm appearance-none cursor-pointer [font-family:Circular_Std,_sans-serif]"
                  >
                    {GENERIC_TIME_SLOTS.map((time) => (
                      <option key={time} value={time}>{time.replace(":", " h ")}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Vehicle Type */}
              <AnchoredSelect
                icon={Car}
                value={vehicleType}
                onChange={setVehicleType}
                placeholder={t("search.placeholder.vehicle_type")}
                title={t("search.title.choose_vehicle_type")}
                options={RENTACAR_VEHICLE_TYPES}
                maxHeightClassName="max-h-72"
                triggerClassName="w-full pl-10 pr-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 text-left flex items-center justify-between border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
              />
            </>
          )}

          {/* Search Button - TheFork teal style but with SAM primary color */}
          <Button
            onClick={handleSearch}
            disabled={!canSearch}
            className="w-full h-12 text-white text-base font-bold tracking-wide uppercase rounded-lg shadow-md disabled:opacity-40 disabled:cursor-not-allowed [font-family:Circular_Std,_sans-serif]"
            type="button"
          >
            {t("results.search")}
          </Button>
        </div>

        <FiltersPanel
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          category={selectedUniverse}
          initialFilters={filters}
          onApplyFilters={handleApplyFilters}
        />
      </>
    );
  }

  return (
    <div className="bg-white/95 rounded-2xl shadow-xl shadow-black/10 ring-1 ring-white/20 max-w-7xl mx-auto pt-[14px] px-5 pb-4 transition-shadow focus-within:shadow-2xl focus-within:shadow-black/10">
      <div className="hidden sm:flex gap-2 md:gap-3 w-full">
        <div className="flex gap-2 md:gap-3 flex-1 flex-wrap">{renderSearchInputs({ mobile: false })}</div>

        <div className="flex gap-2 md:gap-3 flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsFilterOpen(true)}
            className="h-10 md:h-11 px-4 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 whitespace-nowrap [font-family:Circular_Std,_sans-serif]"
          >
            <Sliders className="w-4 h-4" />
            <span className="hidden sm:inline">{t("results.filters")}</span>
          </Button>

          <Button
            onClick={handleSearch}
            disabled={!canSearch}
            className="h-10 md:h-11 px-6 text-white text-sm md:text-base font-semibold tracking-[0.2px] whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed [font-family:Circular_Std,_sans-serif]"
            type="button"
          >
            {t("results.search")}
          </Button>
        </div>
      </div>

      <div className="sm:hidden space-y-2">
        <div className="grid grid-cols-2 gap-2">{renderSearchInputs({ mobile: true })}</div>

        <div className="grid grid-cols-5 gap-2 w-full">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsFilterOpen(true)}
            className="col-span-2 h-10 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 [font-family:Circular_Std,_sans-serif]"
          >
            <Sliders className="w-4 h-4" />
            <span>{t("results.filters")}</span>
          </Button>

          <Button
            onClick={handleSearch}
            disabled={!canSearch}
            className="col-span-3 h-10 text-white text-sm font-semibold tracking-[0.2px] disabled:opacity-40 disabled:cursor-not-allowed [font-family:Circular_Std,_sans-serif]"
            type="button"
          >
            {t("results.search")}
          </Button>
        </div>
      </div>

      {minParticipantsMessage && (
        <div className="mt-2 text-sm italic text-[#a3001d] [font-family:Circular_Std,_sans-serif]">
          {minParticipantsMessage}
        </div>
      )}

      <FiltersPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        category={selectedUniverse}
        initialFilters={filters}
        onApplyFilters={handleApplyFilters}
      />

      <BookingDateTimeBottomSheet
        open={mobileSheetOpen}
        onOpenChange={setMobileSheetOpen}
        tab={mobileSheetTab}
        onTabChange={setMobileSheetTab}
        bookingType={selectedUniverse === "restaurants" ? "restaurant" : "activity"}
        selectedDate={selectedDate ? new Date(selectedDate) : null}
        onSelectDate={(date) => {
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, "0");
          const d = String(date.getDate()).padStart(2, "0");
          setSelectedDate(`${y}-${m}-${d}`);
        }}
        selectedTime={selectedTime || null}
        onSelectTime={(t) => setSelectedTime(t || "")}
        partySize={Number(numPeople)}
        onSelectPartySize={(n) => {
          const next = makePersonsByAge(n);
          setPersonsByAge(next);
          setNumPeople(String(n));
        }}
        selectedService={selectedService}
        onSelectService={setSelectedService}
        activityTimes={GENERIC_TIME_SLOTS}
        serviceTimes={GENERIC_SERVICE_TIMES}
      />
    </div>
  );
}
