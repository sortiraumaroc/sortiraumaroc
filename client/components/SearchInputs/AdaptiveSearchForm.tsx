import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bed, Landmark, ShoppingBag, Sliders, Tag, Car, Clock, ChevronDown, User } from "lucide-react";

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
  const [pickupTime, setPickupTime] = useState(() => readSearchState(selectedUniverse).pickupTime ?? "10:00");
  const [dropoffTime, setDropoffTime] = useState(() => readSearchState(selectedUniverse).dropoffTime ?? "10:00");
  const [vehicleType, setVehicleType] = useState(() => readSearchState(selectedUniverse).vehicleType ?? "");
  const [driverAge, setDriverAge] = useState(() => readSearchState(selectedUniverse).driverAge ?? "");
  const [isYoungOrSenior, setIsYoungOrSenior] = useState(false);
  const [promoCode, setPromoCode] = useState(() => readSearchState(selectedUniverse).promoCode ?? "");
  const [showPromoInput, setShowPromoInput] = useState(false);

  // Coordinate rentacar date pickers: only one open at a time
  // Single state: null = none open, "checkin" or "checkout"
  const [openPicker, setOpenPicker] = useState<"checkin" | "checkout" | null>(null);

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

    // Restore rentacar fields
    setPickupLocation(stored.pickupLocation ?? "");
    setDropoffLocation(stored.dropoffLocation ?? "");
    setPickupTime(stored.pickupTime ?? "10:00");
    setDropoffTime(stored.dropoffTime ?? "10:00");
    setVehicleType(stored.vehicleType ?? "");
    setDriverAge(stored.driverAge ?? "");
    setPromoCode(stored.promoCode ?? "");

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
      // Rentacar fields
      pickupLocation,
      dropoffLocation,
      pickupTime,
      dropoffTime,
      vehicleType,
      driverAge,
      promoCode,
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
    pickupLocation,
    dropoffLocation,
    pickupTime,
    dropoffTime,
    vehicleType,
    driverAge,
    promoCode,
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
      // For rentacar, render the full comparator-style form as a single block
      if (selectedUniverse === "rentacar") {
        inputs.push(
          <div key="rentacar-form" className={mobile ? "col-span-2 space-y-3" : "w-full space-y-3"}>
            {/* Row 1: Main search fields */}
            {mobile ? (
              <div className="space-y-2">
                {/* Prise en charge */}
                <CityInput
                  value={pickupLocation || selectedCity}
                  onChange={(value, cityId) => {
                    setPickupLocation(value);
                    setSelectedCity(value);
                    setSelectedCityId(cityId);
                  }}
                  placeholder="Prise en charge"
                />
                {/* Restitution */}
                <CityInput
                  value={dropoffLocation}
                  onChange={(value) => { setDropoffLocation(value); }}
                  placeholder="Même ville"
                />
                {/* Dates — side by side with labels */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 mb-1 block ps-1">Départ</label>
                    <DatePickerInput
                      key={`m-checkin-${openPicker === "checkout" ? "closed" : "open"}`}
                      value={selectedCheckInDate}
                      onChange={(d) => {
                        setSelectedCheckInDate(d);
                        if (d) setTimeout(() => setOpenPicker("checkout"), 150);
                      }}
                      onOpenChange={(v) => setOpenPicker(v ? "checkin" : null)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 mb-1 block ps-1">Retour</label>
                    <DatePickerInput
                      key={`m-checkout-${openPicker === "checkin" ? "closed" : "open"}`}
                      value={selectedCheckOutDate}
                      onChange={(d) => { setSelectedCheckOutDate(d); setOpenPicker(null); }}
                      onOpenChange={(v) => setOpenPicker(v ? "checkout" : null)}
                    />
                  </div>
                </div>
                {/* Times */}
                <div className="relative">
                  <span className="absolute left-3 top-0 text-[10px] text-slate-400 leading-none pt-1 pointer-events-none">Prise en charge</span>
                  <select value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className="w-full h-10 ps-3 pe-7 pt-3 text-sm border border-slate-200 rounded-lg bg-white appearance-none cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {GENERIC_TIME_SLOTS.map((time) => (<option key={time} value={time}>{time.replace(":", " h ")}</option>))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-0 text-[10px] text-slate-400 leading-none pt-1 pointer-events-none">Restitution</span>
                  <select value={dropoffTime} onChange={(e) => setDropoffTime(e.target.value)} className="w-full h-10 ps-3 pe-7 pt-3 text-sm border border-slate-200 rounded-lg bg-white appearance-none cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {GENERIC_TIME_SLOTS.map((time) => (<option key={time} value={time}>{time.replace(":", " h ")}</option>))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                {/* Champs centrés dans l'espace disponible */}
                <div className="flex-1 flex justify-center">
                  <div className="flex gap-2 items-end">
                    {/* Prise en charge */}
                    <div className="min-w-[150px] max-w-[180px] flex-1">
                      <CityInput
                        value={pickupLocation || selectedCity}
                        onChange={(value, cityId) => {
                          setPickupLocation(value);
                          setSelectedCity(value);
                          setSelectedCityId(cityId);
                        }}
                        placeholder="Prise en charge"
                      />
                    </div>
                    {/* Restitution */}
                    <div className="min-w-[150px] max-w-[180px] flex-1">
                      <CityInput
                        value={dropoffLocation}
                        onChange={(value) => { setDropoffLocation(value); }}
                        placeholder="Même ville"
                      />
                    </div>
                    {/* Dates — key forces unmount/remount to guarantee only one popover open */}
                    <div className="flex-none w-[135px]">
                      <DatePickerInput
                        key={`checkin-${openPicker === "checkout" ? "closed" : "open"}`}
                        value={selectedCheckInDate}
                        onChange={(d) => {
                          setSelectedCheckInDate(d);
                          if (d) setTimeout(() => setOpenPicker("checkout"), 150);
                        }}
                        onOpenChange={(v) => setOpenPicker(v ? "checkin" : null)}
                      />
                    </div>
                    <div className="flex-none w-[135px]">
                      <DatePickerInput
                        key={`checkout-${openPicker === "checkin" ? "closed" : "open"}`}
                        value={selectedCheckOutDate}
                        onChange={(d) => {
                          setSelectedCheckOutDate(d);
                          setOpenPicker(null);
                        }}
                        onOpenChange={(v) => setOpenPicker(v ? "checkout" : null)}
                      />
                    </div>
                    {/* Prise en charge time */}
                    <div className="flex-none w-[125px]">
                      <div className="relative">
                        <span className="absolute left-3 top-0 text-[10px] text-slate-400 leading-none pt-1 pointer-events-none">Prise en charge</span>
                        <select value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className="w-full h-10 md:h-11 ps-3 pe-7 pt-3 text-sm border border-slate-200 rounded-lg bg-white appearance-none cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20">
                          {GENERIC_TIME_SLOTS.map((time) => (<option key={time} value={time}>{time.replace(":", " h ")}</option>))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    {/* Restitution time */}
                    <div className="flex-none w-[125px]">
                      <div className="relative">
                        <span className="absolute left-3 top-0 text-[10px] text-slate-400 leading-none pt-1 pointer-events-none">Restitution</span>
                        <select value={dropoffTime} onChange={(e) => setDropoffTime(e.target.value)} className="w-full h-10 md:h-11 ps-3 pe-7 pt-3 text-sm border border-slate-200 rounded-lg bg-white appearance-none cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20">
                          {GENERIC_TIME_SLOTS.map((time) => (<option key={time} value={time}>{time.replace(":", " h ")}</option>))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>
                {/* Boutons à droite */}
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsFilterOpen(true)}
                    className="h-10 md:h-11 px-4 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 whitespace-nowrap [font-family:Circular_Std,_sans-serif]"
                  >
                    <Sliders className="w-4 h-4" />
                    <span>{t("results.filters")}</span>
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
            )}

            {/* Row 2: Driver age + Promo code */}
            <div className={mobile ? "space-y-2" : "flex gap-4 items-center"}>
              {/* Âge du conducteur */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-slate-700">Âge du conducteur</span>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer hover:text-slate-800">
                  <input
                    type="checkbox"
                    checked={isYoungOrSenior}
                    onChange={(e) => setIsYoungOrSenior(e.target.checked)}
                    className="w-3.5 h-3.5 text-primary border-slate-300 rounded focus:ring-primary"
                  />
                  <span>Conducteur de moins de 30 ans ou de plus de 70 ans</span>
                </label>
                {isYoungOrSenior && (
                  <div className="relative">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="number"
                      min={18}
                      max={99}
                      value={driverAge}
                      onChange={(e) => setDriverAge(e.target.value)}
                      placeholder="Âge"
                      className="w-20 h-9 ps-8 pe-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                )}
                {isYoungOrSenior && (
                  <span className="text-xs text-slate-400">Les jeunes conducteurs et les conducteurs séniors peuvent devoir payer des frais supplémentaires.</span>
                )}
              </div>

              <div className="flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPromoInput(!showPromoInput)}
                  className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg px-3 h-9"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Codes de réduction</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPromoInput ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>

            {/* Promo code input (collapsible) */}
            {showPromoInput && (
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="Entrez votre code de réduction"
                  className="w-64 h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {promoCode && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setPromoCode("")}>
                    Effacer
                  </Button>
                )}
              </div>
            )}
          </div>,
        );
        return inputs;
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

    if (config.fields.checkin_date && selectedUniverse !== "rentacar") {
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

    if (config.fields.checkout_date && selectedUniverse !== "rentacar") {
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

    // Pass rental-specific params in URL for Results page
    if (selectedUniverse === "rentacar") {
      if (pickupLocation) params.set("pickup_city", pickupLocation);
      // If dropoff city is empty, it defaults to the pickup city
      params.set("dropoff_city", dropoffLocation || pickupLocation);
      if (selectedCheckInDate) params.set("pickup_date", selectedCheckInDate);
      if (selectedCheckOutDate) params.set("dropoff_date", selectedCheckOutDate);
      if (pickupTime) params.set("pickup_time", pickupTime);
      if (dropoffTime) params.set("dropoff_time", dropoffTime);
      if (vehicleType) params.set("category", vehicleType);
      if (driverAge) params.set("driver_age", driverAge);
      if (promoCode) params.set("promo_code", promoCode);
    }

    navigate(`/results?${params.toString()}`, { state: { fromSearch: true } });
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
            inputClassName="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 placeholder:text-slate-500 placeholder:font-normal border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
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
              triggerClassName="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 text-start flex items-center justify-between border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
            />
          )}

          {selectedUniverse === "sport" && (
            <PrestationInput
              value={selectedTypeValue}
              onChange={setSelectedTypeValue}
              triggerClassName="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 text-start flex items-center justify-between border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
            />
          )}

          {selectedUniverse === "loisirs" && (
            <ActivityTypeInput
              value={selectedTypeValue}
              onChange={setSelectedTypeValue}
              triggerClassName="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 text-start flex items-center justify-between border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
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
              triggerClassName="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 text-start flex items-center justify-between border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
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
              triggerClassName="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 text-start flex items-center justify-between border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
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
              triggerClassName="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 text-start flex items-center justify-between border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
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
                  setSelectedCity(value);
                }}
                placeholder="Prise en charge"
                inputClassName="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 placeholder:text-slate-500 placeholder:font-normal border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
              />

              {/* Dropoff Location */}
              <CityInput
                value={dropoffLocation}
                onChange={(value) => {
                  setDropoffLocation(value);
                }}
                placeholder="Même ville"
                inputClassName="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 placeholder:text-slate-500 placeholder:font-normal border-0 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 [font-family:Circular_Std,_sans-serif]"
              />

              {/* Dates (Check-in / Check-out) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-white/60 mb-1 block ps-1">Départ</label>
                  <DatePickerInput
                    key={`stacked-checkin-${openPicker === "checkout" ? "closed" : "open"}`}
                    value={selectedCheckInDate}
                    onChange={(d) => {
                      setSelectedCheckInDate(d);
                      if (d) setTimeout(() => setOpenPicker("checkout"), 150);
                    }}
                    onOpenChange={(v) => setOpenPicker(v ? "checkin" : null)}
                    className="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 placeholder:text-slate-500 border-0 shadow-sm [font-family:Circular_Std,_sans-serif]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-white/60 mb-1 block ps-1">Retour</label>
                  <DatePickerInput
                    key={`stacked-checkout-${openPicker === "checkin" ? "closed" : "open"}`}
                    value={selectedCheckOutDate}
                    onChange={(d) => {
                      setSelectedCheckOutDate(d);
                      setOpenPicker(null);
                    }}
                    onOpenChange={(v) => setOpenPicker(v ? "checkout" : null)}
                    className="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 placeholder:text-slate-500 border-0 shadow-sm [font-family:Circular_Std,_sans-serif]"
                  />
                </div>
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <Clock className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none z-10" />
                  <select
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    className="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 border-0 shadow-sm appearance-none cursor-pointer [font-family:Circular_Std,_sans-serif]"
                  >
                    {GENERIC_TIME_SLOTS.map((time) => (
                      <option key={`p${time}`} value={time}>{time.replace(":", " h ")}</option>
                    ))}
                  </select>
                </div>
                <div className="relative">
                  <Clock className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none z-10" />
                  <select
                    value={dropoffTime}
                    onChange={(e) => setDropoffTime(e.target.value)}
                    className="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 border-0 shadow-sm appearance-none cursor-pointer [font-family:Circular_Std,_sans-serif]"
                  >
                    {GENERIC_TIME_SLOTS.map((time) => (
                      <option key={`d${time}`} value={time}>{time.replace(":", " h ")}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Driver age */}
              <label className="flex items-center gap-2 text-sm text-white/90">
                <input
                  type="checkbox"
                  checked={isYoungOrSenior}
                  onChange={(e) => setIsYoungOrSenior(e.target.checked)}
                  className="rounded border-white/30"
                />
                Moins de 30 ans ou plus de 70 ans
              </label>
              {isYoungOrSenior && (
                <input
                  type="number"
                  min={18}
                  max={99}
                  value={driverAge}
                  onChange={(e) => setDriverAge(e.target.value)}
                  placeholder="Âge"
                  className="w-full ps-10 pe-4 py-3 h-12 rounded-lg bg-white text-base text-slate-900 placeholder:text-slate-500 border-0 shadow-sm [font-family:Circular_Std,_sans-serif]"
                />
              )}
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
    <div className="bg-white/95 rounded-2xl shadow-xl shadow-black/10 ring-1 ring-white/20 max-w-7xl mx-auto pt-[14px] px-8 pb-4 transition-shadow focus-within:shadow-2xl focus-within:shadow-black/10">
      <div className="hidden sm:block w-full">
        {selectedUniverse === "rentacar" ? (
          /* Rentacar: formulaire pleine largeur, boutons intégrés dans Row 1 */
          <div className="w-full">{renderSearchInputs({ mobile: false })}</div>
        ) : (
          /* Autres univers: inputs + boutons côte à côte */
          <div className="flex items-center gap-2 md:gap-3 w-full">
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
        )}
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
