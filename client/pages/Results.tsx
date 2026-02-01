import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Map as MapIcon, List, SlidersHorizontal, Star, Heart, Users, Search, Utensils, Clock, Sparkles, CalendarDays, ChevronDown, Wine, X, Filter, MapPin, Car, Gamepad2, Dumbbell, Building2 } from "lucide-react";
import { Header } from "@/components/Header";
import { CityInput } from "@/components/SearchInputs/CityInput";
import { DatePickerInput } from "@/components/DatePickerInput";
import { TimePickerInput } from "@/components/TimePickerInput";
import { PrestationInput } from "@/components/SearchInputs/PrestationInput";
import { ActivityTypeInput } from "@/components/SearchInputs/ActivityTypeInput";
import { LieuInput } from "@/components/SearchInputs/LieuInput";
import { FiltersPanel, FilterState } from "@/components/FiltersPanel";
import { ResultsMap } from "@/components/results/ResultsMap";
import { EstablishmentCard } from "@/components/results/EstablishmentCard";
import { VehicleCard } from "@/components/results/VehicleCard";
import { ResultsFilterBottomSheet, type FilterTab } from "@/components/results/ResultsFilterBottomSheet";
import { QuickFilterBottomSheet, type QuickFilterType } from "@/components/results/QuickFilterBottomSheet";
import { CityBottomSheet } from "@/components/results/CityBottomSheet";
import {
  CUISINE_TYPES,
  AMBIANCE_TYPES,
  SPORT_SPECIALTIES,
  LOISIRS_SPECIALTIES,
  HEBERGEMENT_TYPES,
  CULTURE_TYPES,
  SHOPPING_TYPES,
} from "@/lib/filterTaxonomy";
import { cn } from "@/lib/utils";
import type { ActivityCategory } from "@/lib/taxonomy";
import { patchSearchState, readSearchState } from "@/lib/searchState";
import { useI18n } from "@/lib/i18n";
import { applySeo } from "@/lib/seo";
import {
  listPublicEstablishments,
  type PublicEstablishmentListItem,
  getSponsoredResults,
  trackAdImpression,
  trackAdClick,
  type SponsoredResultItem,
} from "@/lib/publicApi";
import { isAuthed, openAuthModal } from "@/lib/auth";
import { useScrollContext } from "@/lib/scrollContext";
import { saveNavigationState, buildNavigationDescription } from "@/lib/navigationState";
import { useDebounce } from "@/hooks/useDebounce";

const parseSlotLabel = (
  label: string,
  intlLocale: string,
): {
  isToday: boolean;
  timeLabel: string;
} => {
  const normalized = label.replace("Aujourd’hui", "Aujourd'hui");
  const isToday = normalized.includes("Today") || normalized.includes("Aujourd'hui");

  const timePart = normalized.includes("at ")
    ? normalized.split("at ").pop()
    : normalized.includes("à ")
      ? normalized.split("à ").pop()
      : null;

  if (!timePart) return { isToday, timeLabel: label };

  const rawTime = timePart.trim();
  const hasAmPm = /\b(AM|PM)\b/i.test(rawTime);

  let hour = 0;
  let minute = 0;

  if (hasAmPm) {
    const [timeStr, periodRaw] = rawTime.split(/\s+/);
    const period = periodRaw?.toUpperCase();
    const [h, m] = timeStr.split(":").map((x) => Number(x));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return { isToday, timeLabel: label };

    hour = h;
    minute = m;

    const isPM = period === "PM";
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
  } else {
    const [h, m] = rawTime.split(":").map((x) => Number(x));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return { isToday, timeLabel: label };
    hour = h;
    minute = m;
  }

  const d = new Date();
  d.setHours(hour, minute, 0, 0);

  const timeLabel = new Intl.DateTimeFormat(intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);

  return { isToday, timeLabel };
};

const hasPromotion = (item: any): boolean => {
  if (!item) return false;
  if (item.promoActive === true) return true;
  if (Array.isArray(item.promotions) && item.promotions.length > 0) return true;
  if (typeof item.slotDiscount === "number" && item.slotDiscount > 0) return true;
  if (item.dealActive && typeof item.discount === "number" && item.discount > 0) return true;
  return false;
};

// Highlight element is computed inside <Results /> (needs i18n).

const getPromotionPercent = (item: any): number => {
  if (!item) return 0;

  const percents: number[] = [];

  if (typeof item.slotDiscount === "number" && item.slotDiscount > 0) percents.push(item.slotDiscount);
  if (item.dealActive && typeof item.discount === "number" && item.discount > 0) percents.push(item.discount);

  if (Array.isArray(item.promotions)) {
    for (const promo of item.promotions) {
      const p = typeof promo === "number" ? promo : typeof promo?.percent === "number" ? promo.percent : 0;
      if (p > 0) percents.push(p);
    }
  }

  return percents.length ? Math.max(...percents) : 0;
};

const getPromotionBadge = (item: any): string | null => {
  const p = getPromotionPercent(item);
  if (!p) return null;
  return `-${p}%`;
};

const RESTAURANTS = [
  {
    id: 1,
    name: "Restaurant Riad Atlas",
    rating: 4.8,
    reviews: 245,
    category: "Gastronomique",
    neighborhood: "Medina",
    avgPrice: "350-500 Dhs",
    nextAvailability: "Today at 7:00 PM",
    image:
      "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Sponsored",
    lat: 31.63,
    lng: -8.01,
    bookingEnabled: true,
    nextSlot: "Today at 7:00 PM",
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
  {
    id: 2,
    name: "Terrasse Moderne",
    rating: 4.6,
    reviews: 189,
    category: "Rooftop",
    neighborhood: "Gueliz",
    avgPrice: "280-400 Dhs",
    nextAvailability: "Today at 7:30 PM",
    image:
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F7652d255680241f0a7ecf4494ebe59df?format=webp&width=800",
    status: "OPEN",
    badge: "Popular",
    lat: 31.62,
    lng: -8.0,
    bookingEnabled: true,
    nextSlot: "Today at 7:30 PM",
    slotDiscount: 30,
    dealActive: false,
    discount: null,
  },
  {
    id: 3,
    name: "Fusion Cuisine",
    rating: 4.5,
    reviews: 156,
    category: "International",
    neighborhood: "Nouvelle Ville",
    avgPrice: "200-350 Dhs",
    nextAvailability: "Today at 8:00 PM",
    image:
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "New",
    lat: 31.64,
    lng: -8.02,
    bookingEnabled: false,
    nextSlot: null,
    slotDiscount: null,
    dealActive: true,
    discount: 50,
  },
  {
    id: 4,
    name: "Casa de Paco",
    rating: 4.7,
    reviews: 312,
    category: "Gastronomique",
    neighborhood: "Medina",
    avgPrice: "400-600 Dhs",
    nextAvailability: "Today at 7:45 PM",
    image:
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F8004152491334d5cbcf40daca382c85d?format=webp&width=800",
    status: "OPEN",
    badge: "Featured",
    lat: 31.61,
    lng: -8.01,
    bookingEnabled: true,
    nextSlot: "Today at 7:45 PM",
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
  {
    id: 5,
    name: "Le Comptoir",
    rating: 4.4,
    reviews: 198,
    category: "Casual",
    neighborhood: "Gueliz",
    avgPrice: "150-250 Dhs",
    nextAvailability: "Today at 8:30 PM",
    image:
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F265e7bdf3b7f42d684f0b809adc7fd46?format=webp&width=800",
    status: "OPEN",
    badge: "Hot Offer",
    lat: 31.63,
    lng: -8.0,
    bookingEnabled: true,
    nextSlot: "Today at 8:30 PM",
    slotDiscount: 15,
    dealActive: false,
    discount: null,
  },
  {
    id: 6,
    name: "Marrakech Sky",
    rating: 4.9,
    reviews: 456,
    category: "Rooftop",
    neighborhood: "Medina",
    avgPrice: "500-750 Dhs",
    nextAvailability: "Today at 6:30 PM",
    image:
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F0ea6ec34947f467cba5cb49454ceecd5?format=webp&width=800",
    status: "OPEN",
    badge: "Premium",
    lat: 31.62,
    lng: -8.01,
    bookingEnabled: true,
    nextSlot: "Today at 6:30 PM",
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
];

const SPORT_WELLNESS = [
  {
    id: 101,
    name: "Centre Yoga & Bien-être",
    rating: 4.9,
    reviews: 187,
    category: "Yoga",
    neighborhood: "Gueliz",
    avgPrice: "150-250 Dhs",
    nextAvailability: "Today at 9:00 AM",
    image:
      "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Featured",
    lat: 31.63,
    lng: -8.01,
    bookingEnabled: true,
    nextSlot: "Today at 9:00 AM",
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
  {
    id: 102,
    name: "Spa Luxe Marrakech",
    rating: 4.8,
    reviews: 234,
    category: "Spa",
    neighborhood: "Medina",
    avgPrice: "300-500 Dhs",
    nextAvailability: "Today at 10:00 AM",
    image:
      "https://images.unsplash.com/photo-1544367567-0d0fcb009e1d?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Popular",
    lat: 31.62,
    lng: -8.0,
    bookingEnabled: true,
    nextSlot: "Today at 10:00 AM",
    slotDiscount: 20,
    dealActive: false,
    discount: null,
  },
  {
    id: 103,
    name: "Hammam Traditionnel",
    rating: 4.7,
    reviews: 156,
    category: "Hammam",
    neighborhood: "Medina",
    avgPrice: "80-150 Dhs",
    nextAvailability: "Today at 11:00 AM",
    image:
      "https://images.unsplash.com/photo-1577720682742-172430c34e5d?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Traditional",
    lat: 31.61,
    lng: -8.01,
    bookingEnabled: true,
    nextSlot: "Today at 11:00 AM",
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
  {
    id: 104,
    name: "Fitness Club Moderne",
    rating: 4.6,
    reviews: 142,
    category: "Fitness",
    neighborhood: "Gueliz",
    avgPrice: "500-800 Dhs/mois",
    nextAvailability: "Today at 6:00 AM",
    image:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Modern",
    lat: 31.64,
    lng: -8.02,
    bookingEnabled: true,
    nextSlot: "Today at 6:00 AM",
    slotDiscount: null,
    dealActive: true,
    discount: 30,
  },
];

const LOISIRS = [
  {
    id: 201,
    name: "Quad à Agafay",
    rating: 4.9,
    reviews: 312,
    category: "Aventure",
    neighborhood: "Agafay",
    avgPrice: "450-650 Dhs",
    nextAvailability: "Today at 2:00 PM",
    image:
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F6c79d7ff2ad6489d8149ebb4fedfb7bd?format=webp&width=800",
    status: "OPEN",
    badge: "Popular",
    lat: 31.5,
    lng: -7.9,
    bookingEnabled: true,
    nextSlot: "Today at 2:00 PM",
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
  {
    id: 202,
    name: "Cheval au bord de la mer",
    rating: 4.7,
    reviews: 278,
    category: "Équitation",
    neighborhood: "Essaouira",
    avgPrice: "350-500 Dhs",
    nextAvailability: "Today at 3:00 PM",
    image:
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F4a9bad36b18e48dcb36dd277581569c0?format=webp&width=800",
    status: "OPEN",
    badge: "Featured",
    lat: 31.5,
    lng: -7.95,
    bookingEnabled: true,
    nextSlot: "Today at 3:00 PM",
    slotDiscount: 15,
    dealActive: false,
    discount: null,
  },
  {
    id: 203,
    name: "Parachute en tandem",
    rating: 4.8,
    reviews: 198,
    category: "Extrême",
    neighborhood: "Région côtière",
    avgPrice: "1500-2000 Dhs",
    nextAvailability: "Today at 4:00 PM",
    image:
      "https://images.unsplash.com/photo-1540261967230-7cdedf4ba11b?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Thrilling",
    lat: 31.55,
    lng: -8.05,
    bookingEnabled: true,
    nextSlot: "Today at 4:00 PM",
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
];

const HEBERGEMENT = [
  {
    id: 301,
    name: "Riad Luxe Marrakech",
    rating: 4.9,
    reviews: 324,
    category: "Riad",
    neighborhood: "Medina",
    avgPrice: "800-1200 Dhs/nuit",
    nextAvailability: "Disponible",
    image:
      "https://images.unsplash.com/photo-1551632786-de41ec6a05ae?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Luxury",
    lat: 31.61,
    lng: -8.01,
    bookingEnabled: true,
    nextSlot: "Disponible",
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
  {
    id: 302,
    name: "Hôtel Boutique Gueliz",
    rating: 4.7,
    reviews: 267,
    category: "Hôtel",
    neighborhood: "Gueliz",
    avgPrice: "500-800 Dhs/nuit",
    nextAvailability: "Disponible",
    image:
      "https://images.unsplash.com/photo-1631049307038-da0ec36d9122?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Modern",
    lat: 31.63,
    lng: -8.0,
    bookingEnabled: true,
    nextSlot: "Disponible",
    slotDiscount: 10,
    dealActive: false,
    discount: null,
  },
  {
    id: 303,
    name: "Maison d'hôtes Palmeraie",
    rating: 4.8,
    reviews: 189,
    category: "Maison d'hôtes",
    neighborhood: "Palmeraie",
    avgPrice: "400-600 Dhs/nuit",
    nextAvailability: "Disponible",
    image:
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Charming",
    lat: 31.64,
    lng: -8.02,
    bookingEnabled: true,
    nextSlot: "Disponible",
    slotDiscount: null,
    dealActive: true,
    discount: 25,
  },
  {
    id: 304,
    name: "Mövenpick Hotel & Casino Malabata Tanger",
    rating: 4.5,
    reviews: 728,
    category: "Hôtel 5★",
    neighborhood: "Malabata",
    avgPrice: "À partir de 3 252 MAD/nuit",
    nextAvailability: "Disponible",
    image:
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fd332c834fb5c4f018505f206e14b6fd1?format=webp&width=800",
    status: "OPEN",
    badge: "Premium",
    lat: 35.7806,
    lng: -5.7804,
    bookingEnabled: true,
    nextSlot: "Disponible",
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
];

const CULTURE = [
  {
    id: 401,
    name: "Musée Yves Saint Laurent",
    rating: 4.9,
    reviews: 456,
    category: "Musée",
    neighborhood: "Gueliz",
    avgPrice: "100-150 Dhs",
    nextAvailability: "Aujourd'hui à 9:00 AM",
    image:
      "https://images.unsplash.com/photo-1564399579883-451a5d44be7f?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Must-see",
    lat: 31.63,
    lng: -8.01,
    bookingEnabled: true,
    nextSlot: "Aujourd'hui à 9:00 AM",
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
  {
    id: 402,
    name: "Palais de la Bahia",
    rating: 4.8,
    reviews: 512,
    category: "Palais Historique",
    neighborhood: "Medina",
    avgPrice: "80-120 Dhs",
    nextAvailability: "Aujourd'hui à 10:00 AM",
    image:
      "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Historic",
    lat: 31.62,
    lng: -8.0,
    bookingEnabled: true,
    nextSlot: "Aujourd'hui à 10:00 AM",
    slotDiscount: 5,
    dealActive: false,
    discount: null,
  },
  {
    id: 403,
    name: "Souk de Marrakech",
    rating: 4.7,
    reviews: 678,
    category: "Marché",
    neighborhood: "Medina",
    avgPrice: "Variable",
    nextAvailability: "Aujourd'hui à 8:00 AM",
    image:
      "https://images.unsplash.com/photo-1584299743941-460bbb150da1?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Authentic",
    lat: 31.61,
    lng: -8.01,
    bookingEnabled: false,
    nextSlot: null,
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
];

const SHOPPING = [
  {
    id: 501,
    name: "Centre Comercial Menara",
    rating: 4.7,
    reviews: 234,
    category: "Centre Commercial",
    neighborhood: "Menara",
    avgPrice: "Variable",
    nextAvailability: "Aujourd'hui à 10:00 AM",
    image:
      "https://images.unsplash.com/photo-1567521464027-f127ff144326?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Modern",
    lat: 31.61,
    lng: -8.02,
    bookingEnabled: false,
    nextSlot: null,
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
  {
    id: 502,
    name: "Boutique Artisanale Medina",
    rating: 4.8,
    reviews: 189,
    category: "Artisanat",
    neighborhood: "Medina",
    avgPrice: "50-500 Dhs",
    nextAvailability: "Aujourd'hui à 9:00 AM",
    image:
      "https://images.unsplash.com/photo-1544909514-2716092651e7?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Authentic",
    lat: 31.63,
    lng: -8.01,
    bookingEnabled: false,
    nextSlot: null,
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
  {
    id: 503,
    name: "Tapis et Textiles",
    rating: 4.6,
    reviews: 145,
    category: "Textiles",
    neighborhood: "Medina",
    avgPrice: "200-2000 Dhs",
    nextAvailability: "Aujourd'hui à 8:30 AM",
    image:
      "https://images.unsplash.com/photo-1562414108-b2ded4de86ca?w=400&h=300&fit=crop",
    status: "OPEN",
    badge: "Traditional",
    lat: 31.62,
    lng: -8.01,
    bookingEnabled: false,
    nextSlot: null,
    slotDiscount: null,
    dealActive: false,
    discount: null,
  },
];

export default function Results() {
  const { t, intlLocale } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const universe = searchParams.get("universe") || "restaurants";
  const promotionsOnly = searchParams.get("promo") === "1";
  const categoryFilter = searchParams.get("category") || "";
  const sortMode = searchParams.get("sort") || "";
  const universeKey = universe as ActivityCategory;

  // Register search bar ref for sticky header transformation
  const { registerSearchFormRef } = useScrollContext();
  const searchBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerSearchFormRef(searchBarRef.current);
    return () => registerSearchFormRef(null);
  }, [registerSearchFormRef]);

  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  const [highlightedRestaurant, setHighlightedRestaurant] = useState<string | null>(null);

  // Bottom sheet state for mobile filters (TheFork style)
  const [showCityBottomSheet, setShowCityBottomSheet] = useState(false);
  const [showFilterBottomSheet, setShowFilterBottomSheet] = useState(false);
  const [filterBottomSheetTab, setFilterBottomSheetTab] = useState<FilterTab>("date");
  const [filterDateValue, setFilterDateValue] = useState<Date | null>(null);
  const [filterTimeValue, setFilterTimeValue] = useState<string | null>(null);
  const [filterPersonsValue, setFilterPersonsValue] = useState(2);

  // Quick filter bottom sheets (cuisine, ambiance)
  const [showQuickFilterSheet, setShowQuickFilterSheet] = useState(false);
  const [quickFilterType, setQuickFilterType] = useState<QuickFilterType>("cuisine");
  const [selectedCuisineTypes, setSelectedCuisineTypes] = useState<string[]>([]);
  const [selectedAmbiances, setSelectedAmbiances] = useState<string[]>([]);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "requesting" | "available" | "denied">("idle");

  const [visibleCount, setVisibleCount] = useState(10);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());

  const listStartRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement | null>());

  const scrollToCard = useCallback((id: string) => {
    const el = cardRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const [filters, setFilters] = useState({
    city: "Marrakech",
    date: "",
    time: "",
    guests: "2",
    priceRange: ["0", "1000"],
    rating: "4",
    categories: ["Gastronomique", "Rooftop", "Casual", "International"],
  });

  const handleApplyFilters = (filterState: FilterState) => {
    const next = new URLSearchParams(searchParams);
    next.set("universe", universe);

    if (filterState.promotionsOnly) {
      next.set("promo", "1");
    } else {
      next.delete("promo");
    }

    navigate(`/results?${next.toString()}`);
  };

  const [selectedCity, setSelectedCity] = useState(() => readSearchState(universeKey).city ?? "Marrakech");
  const [selectedDate, setSelectedDate] = useState(() => readSearchState(universeKey).date ?? "");
  const [selectedTime, setSelectedTime] = useState(() => readSearchState(universeKey).time ?? "");

  // Additional search fields for different universes
  const [selectedPrestation, setSelectedPrestation] = useState(() => readSearchState(universeKey).typeValue ?? "");
  const [selectedActivityType, setSelectedActivityType] = useState("");
  const [selectedLieu, setSelectedLieu] = useState("");
  const [selectedCheckInDate, setSelectedCheckInDate] = useState(() => readSearchState(universeKey).checkInDate ?? "");
  const [selectedCheckOutDate, setSelectedCheckOutDate] = useState(() => readSearchState(universeKey).checkOutDate ?? "");

  // Rentacar specific states
  const [pickupLocation, setPickupLocation] = useState(() => readSearchState(universeKey).pickupLocation ?? "");
  const [dropoffLocation, setDropoffLocation] = useState(() => readSearchState(universeKey).dropoffLocation ?? "");
  const [sameDropoff, setSameDropoff] = useState(true);
  const [pickupTime, setPickupTime] = useState(() => readSearchState(universeKey).pickupTime ?? "10:00");
  const [dropoffTime, setDropoffTime] = useState(() => readSearchState(universeKey).dropoffTime ?? "10:00");

  useEffect(() => {
    const stored = readSearchState(universeKey);
    setSelectedCity(stored.city ?? "Marrakech");
    setSelectedDate(stored.date ?? "");
    setSelectedTime(stored.time ?? "");
    setSelectedPrestation(stored.typeValue ?? "");
    setSelectedCheckInDate(stored.checkInDate ?? "");

    const city = stored.city ?? "";
    const universeLabel = universeKey === "restaurants" ? "Restaurants" : universeKey === "hebergement" ? "Hôtels" : "Activités";
    const title = city ? `${universeLabel} à ${city} — Sortir Au Maroc` : `${universeLabel} — Sortir Au Maroc`;
    const description = city
      ? `Découvrez les meilleurs ${universeLabel.toLowerCase()} à ${city} et réservez en quelques clics.`
      : `Découvrez et réservez les meilleures adresses au Maroc.`;

    applySeo({ title, description, ogType: "website" });
    setSelectedCheckOutDate(stored.checkOutDate ?? "");

    setFilters((prev) => ({
      ...prev,
      city: stored.city ?? prev.city,
      date: stored.date ?? "",
      time: stored.time ?? "",
    }));
  }, [universeKey]);

  useEffect(() => {
    patchSearchState(universeKey, {
      city: selectedCity,
      date: selectedDate,
      time: selectedTime,
      typeValue: selectedPrestation,
      checkInDate: selectedCheckInDate,
      checkOutDate: selectedCheckOutDate,
    });
  }, [universeKey, selectedCity, selectedDate, selectedTime, selectedPrestation, selectedCheckInDate, selectedCheckOutDate]);

  // Save navigation state for authenticated users (to allow resuming later)
  useEffect(() => {
    if (!isAuthed()) return;

    const currentUrl = `/results?${searchParams.toString()}`;
    const description = buildNavigationDescription(
      "/results",
      searchParams,
      t
    );

    saveNavigationState({
      url: currentUrl,
      description,
      universe,
      city: selectedCity,
      filters: {
        promo: promotionsOnly,
        sort: sortMode || undefined,
        date: selectedDate || undefined,
        time: selectedTime || undefined,
        persons: filterPersonsValue,
      },
    });
  }, [searchParams, universe, selectedCity, promotionsOnly, sortMode, selectedDate, selectedTime, filterPersonsValue, t]);

  const requestUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus("denied");
      return;
    }

    setGeoStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGeoStatus("available");
      },
      () => {
        setGeoStatus("denied");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Request geolocation on page load
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGeoStatus("available");
      },
      () => {
        setGeoStatus("denied");
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, []);

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): string => {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    if (distance < 1) {
      return `${Math.round(distance * 1000)} m`;
    }
    return `${distance.toFixed(1)} km`;
  };

  const toggleCategory = (category: string) => {
    setFilters((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  };

  const formatNextSlotLabel = useCallback(
    (startsAtIso: string): string => {
      const dt = new Date(startsAtIso);
      if (!Number.isFinite(dt.getTime())) return "";

      const now = new Date();
      const isToday =
        dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() && dt.getDate() === now.getDate();

      const timeLabel = new Intl.DateTimeFormat(intlLocale, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(dt);

      const isFr = intlLocale.toLowerCase().startsWith("fr");

      if (isToday) {
        return `${isFr ? "Aujourd'hui à" : "Today at"} ${timeLabel}`;
      }

      const dayLabel = new Intl.DateTimeFormat(intlLocale, {
        weekday: "short",
        month: "short",
        day: "2-digit",
      }).format(dt);

      return `${dayLabel} ${isFr ? "à" : "at"} ${timeLabel}`;
    },
    [intlLocale],
  );

  const [apiItems, setApiItems] = useState<PublicEstablishmentListItem[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Sponsored results state
  const [sponsoredItems, setSponsoredItems] = useState<SponsoredResultItem[]>([]);
  const [sponsoredImpressionIds, setSponsoredImpressionIds] = useState<Map<string, string>>(new Map());

  // PERFORMANCE: Debounce search parameters to avoid excessive API calls
  // when user is rapidly changing filters
  const debouncedCity = useDebounce(selectedCity, 300);
  const debouncedCategory = useDebounce(categoryFilter, 200);

  useEffect(() => {
    let cancelled = false;

    setApiLoading(true);
    setApiError(null);

    listPublicEstablishments({
      universe,
      city: debouncedCity,
      category: debouncedCategory || null,
      sort: sortMode === "best" ? "best" : null,
      promoOnly: promotionsOnly,
      limit: 60,
    })
      .then((payload) => {
        if (cancelled) return;
        setApiItems(payload.items ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setApiError(t("common.error.load_failed"));
        setApiItems([]);
      })
      .finally(() => {
        if (cancelled) return;
        setApiLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedCategory, promotionsOnly, debouncedCity, sortMode, universe]);

  // Fetch sponsored results
  useEffect(() => {
    let cancelled = false;

    getSponsoredResults({
      city: debouncedCity,
      universe,
      limit: 3,
    })
      .then(async (payload) => {
        if (cancelled) return;
        setSponsoredItems(payload.sponsored ?? []);

        // Track impressions for sponsored results
        const impressionMap = new Map<string, string>();
        for (const item of payload.sponsored ?? []) {
          try {
            const result = await trackAdImpression({
              campaign_id: item.campaign_id,
              position: item.position,
              search_query: debouncedCity || undefined,
            });
            impressionMap.set(item.campaign_id, result.impression_id);
          } catch (e) {
            console.error("[Ads] Failed to track impression:", e);
          }
        }
        setSponsoredImpressionIds(impressionMap);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[Ads] Failed to fetch sponsored results:", err);
        setSponsoredItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedCity, universe]);

  // Track click handler for sponsored results
  const handleSponsoredClick = useCallback(async (campaignId: string, destinationUrl: string) => {
    const impressionId = sponsoredImpressionIds.get(campaignId);
    try {
      await trackAdClick({
        campaign_id: campaignId,
        impression_id: impressionId,
        destination_url: destinationUrl,
      });
    } catch (e) {
      console.error("[Ads] Failed to track click:", e);
    }
  }, [sponsoredImpressionIds]);

  type UiResultItem = {
    id: string;
    name: string;
    rating?: number;
    reviews?: number;
    category?: string;
    neighborhood?: string;
    avgPrice?: string;
    image: string;
    badge?: string;
    status?: "OPEN" | "CLOSED";
    lat: number;
    lng: number;
    bookingEnabled: boolean;
    nextSlot: string | null;
    slotDiscount: number | null;
    dealActive: boolean;
    discount: number | null;
    reservations30d: number;
    bestScore?: number;
    isVerified?: boolean;
    isPremium?: boolean;
    isCurated?: boolean;
  };

  const resultsData: UiResultItem[] = useMemo(() => {
    return apiItems.map((item) => {
      const name = (item.name ?? "Établissement").trim() || "Établissement";

      return {
        id: item.id,
        name,
        rating: typeof item.avg_rating === "number" ? item.avg_rating : undefined,
        reviews: typeof item.review_count === "number" ? item.review_count : undefined,
        category: item.subcategory ?? undefined,
        neighborhood: item.address ?? item.city ?? undefined,
        image: item.cover_url ?? "/placeholder.svg",
        lat: typeof item.lat === "number" ? item.lat : NaN,
        lng: typeof item.lng === "number" ? item.lng : NaN,
        bookingEnabled: item.booking_enabled === true,
        nextSlot: item.next_slot_at ? formatNextSlotLabel(item.next_slot_at) : null,
        slotDiscount: typeof item.promo_percent === "number" ? item.promo_percent : null,
        dealActive: false,
        discount: null,
        reservations30d: typeof item.reservations_30d === "number" ? item.reservations_30d : 0,
        bestScore: item.best_score,
        isVerified: item.verified === true,
        isPremium: item.premium === true,
        isCurated: item.curated === true,
      };
    });
  }, [apiItems, formatNextSlotLabel]);

  const resultsDataEmptyState = apiLoading ? null : apiError;

  const getDetailsPath = (id: string): string => {
    switch (universe) {
      case "restaurants":
        return `/restaurant/${id}`;
      case "sport":
        return `/wellness/${id}`;
      case "loisirs":
        return `/loisir/${id}`;
      case "hebergement":
        return `/hotel/${id}`;
      case "culture":
        return `/culture/${id}`;
      case "shopping":
        return `/shopping/${id}`;
      default:
        return `/restaurant/${id}`;
    }
  };

  const getDetailsHref = (item: any): string => {
    const path = getDetailsPath(item.id);
    const qs = new URLSearchParams();
    if (item?.name) qs.set("title", String(item.name));
    if (item?.category) qs.set("category", String(item.category));
    if (item?.neighborhood) qs.set("neighborhood", String(item.neighborhood));
    if (selectedCity) qs.set("city", selectedCity);
    const query = qs.toString();
    return query ? `${path}?${query}` : path;
  };

  const getActionLabel = (): string => {
    switch (universe) {
      case "hebergement":
        return t("results.action.view_hotel");
      case "culture":
      case "shopping":
        return t("results.action.view");
      case "restaurants":
      case "sport":
      case "loisirs":
      default:
        return t("results.action.book");
    }
  };


  useEffect(() => {
    setVisibleCount(10);
    setIsLoadingMore(false);
    setSelectedRestaurant(null);
    setHighlightedRestaurant(null);
    setMobileView("list");
    // Reset activity type filters when universe changes (each universe has its own taxonomy)
    setSelectedCuisineTypes([]);
    setSelectedAmbiances([]);
  }, [promotionsOnly, universe]);

  const resultsHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("universe", universe);
    if (promotionsOnly) params.set("promo", "1");
    return `/results?${params.toString()}`;
  }, [promotionsOnly, universe]);

  const panelInitialFilters = useMemo(() => ({ promotionsOnly }), [promotionsOnly]);

  const resultsCountLabel = (() => {
    switch (universe) {
      case "restaurants":
        return t("results.universe.restaurants.count_label");
      case "sport":
        return t("results.universe.sport.count_label");
      case "loisirs":
        return t("results.universe.loisirs.count_label");
      case "hebergement":
        return t("results.universe.hebergement.count_label");
      case "culture":
        return t("results.universe.culture.count_label");
      case "shopping":
        return t("results.universe.shopping.count_label");
      default:
        return t("results.universe.default.count_label");
    }
  })();

  const getHighlightElement = useCallback(
    (item: any): { type: "slot" | "offer" | null; text: string; isToday?: boolean } => {
      if (item?.bookingEnabled && item?.nextSlot) {
        const { isToday, timeLabel } = parseSlotLabel(String(item.nextSlot), intlLocale);
        const discountText = item.slotDiscount ? ` · -${item.slotDiscount}%` : "";
        return { type: "slot", text: `${timeLabel}${discountText}`, isToday };
      }

      if (item?.dealActive && item?.discount) {
        return { type: "offer", text: t("results.offer.up_to", { percent: item.discount }) };
      }

      return { type: null, text: "" };
    },
    [intlLocale, t],
  );


  const sortedResultsData = useMemo(() => {
    // If sorting by "best", use the server-computed bestScore
    if (sortMode === "best") {
      return [...resultsData].sort((a, b) => {
        const scoreDiff = (b.bestScore ?? 0) - (a.bestScore ?? 0);
        if (scoreDiff !== 0) return scoreDiff;

        // Tie-breaker: rating then reviews
        const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
        if (ratingDiff !== 0) return ratingDiff;

        const reviewsDiff = (b.reviews ?? 0) - (a.reviews ?? 0);
        if (reviewsDiff !== 0) return reviewsDiff;

        return a.name.localeCompare(b.name);
      });
    }

    // Default sorting: promo first, then popularity
    return [...resultsData].sort((a, b) => {
      const promoDiff = getPromotionPercent(b) - getPromotionPercent(a);
      if (promoDiff !== 0) return promoDiff;

      const popularityDiff = (b.reservations30d ?? 0) - (a.reservations30d ?? 0);
      if (popularityDiff !== 0) return popularityDiff;

      return a.name.localeCompare(b.name);
    });
  }, [resultsData, sortMode]);

  const displayedResults = useMemo(
    () => sortedResultsData.slice(0, visibleCount),
    [sortedResultsData, visibleCount],
  );

  const orderedDisplayedResults = useMemo(() => {
    if (selectedRestaurant == null) return displayedResults;
    const selected = displayedResults.find((r) => r.id === selectedRestaurant);
    if (!selected) return displayedResults;
    return [selected, ...displayedResults.filter((r) => r.id !== selectedRestaurant)];
  }, [displayedResults, selectedRestaurant]);

  const mapItems = useMemo(
    () =>
      displayedResults
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
        .map((item) => ({
          id: item.id,
          name: item.name,
          lat: item.lat,
          lng: item.lng,
          rating: item.rating,
          promotionLabel: getPromotionBadge(item),
        })),
    [displayedResults],
  );

  // Helper to render search inputs based on universe (responsive + no empty space on desktop)
  const renderSearchInputs = (layout: "mobile" | "desktop") => {
    const isMobile = layout === "mobile";

    const cityClass = isMobile ? "col-span-2" : "flex-1 min-w-[120px]";
    const dateClass = isMobile ? "" : "flex-none w-[135px]";
    const timeClass = isMobile ? "" : "flex-none w-[105px]";
    const peopleClass = isMobile ? "col-span-2" : "flex-none w-[140px]";
    const extraClass = isMobile ? "col-span-2" : "flex-1 min-w-[130px]";

    const peopleSelect = (
      <div className={peopleClass}>
        <div className="relative">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
          <select
            className="w-full pl-10 pr-4 py-2 h-10 md:h-11 bg-slate-100 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            value={filters.guests}
            onChange={(e) => setFilters((prev) => ({ ...prev, guests: e.target.value }))}
          >
            <option value="1">{t("results.people.option.1")}</option>
            <option value="2">{t("results.people.option.2")}</option>
            <option value="3">{t("results.people.option.3")}</option>
            <option value="4">{t("results.people.option.4")}</option>
            <option value="5+">{t("results.people.option.5_plus")}</option>
          </select>
        </div>
      </div>
    );

    switch (universe) {
      case "restaurants":
        return (
          <>
            <CityInput
              value={selectedCity}
              onChange={(value) => {
                setSelectedCity(value);
                setFilters({ ...filters, city: value });
              }}
              className={cityClass}
            />
            <DatePickerInput
              value={selectedDate}
              onChange={(date) => {
                setSelectedDate(date);
                setFilters({ ...filters, date: date });
              }}
              className={dateClass}
            />
            <TimePickerInput
              value={selectedTime}
              onChange={(time) => {
                setSelectedTime(time);
                setFilters({ ...filters, time: time });
              }}
              className={timeClass}
            />
            {peopleSelect}
          </>
        );

      case "sport":
        return (
          <>
            <CityInput
              value={selectedCity}
              onChange={(value) => {
                setSelectedCity(value);
                setFilters({ ...filters, city: value });
              }}
              className={cityClass}
            />
            <DatePickerInput
              value={selectedDate}
              onChange={(date) => {
                setSelectedDate(date);
                setFilters({ ...filters, date: date });
              }}
              className={dateClass}
            />
            <TimePickerInput
              value={selectedTime}
              onChange={(time) => {
                setSelectedTime(time);
                setFilters({ ...filters, time: time });
              }}
              className={timeClass}
            />
            <PrestationInput value={selectedPrestation} onChange={setSelectedPrestation} className={extraClass} />
          </>
        );

      case "loisirs":
        return (
          <>
            <CityInput
              value={selectedCity}
              onChange={(value) => {
                setSelectedCity(value);
                setFilters({ ...filters, city: value });
              }}
              className={cityClass}
            />
            <DatePickerInput
              value={selectedDate}
              onChange={(date) => {
                setSelectedDate(date);
                setFilters({ ...filters, date: date });
              }}
              className={dateClass}
            />
            <TimePickerInput
              value={selectedTime}
              onChange={(time) => {
                setSelectedTime(time);
                setFilters({ ...filters, time: time });
              }}
              className={timeClass}
            />
            <ActivityTypeInput value={selectedActivityType} onChange={setSelectedActivityType} className={extraClass} />
          </>
        );

      case "hebergement":
        return (
          <>
            <CityInput
              value={selectedCity}
              onChange={(value) => {
                setSelectedCity(value);
                setFilters({ ...filters, city: value });
              }}
              className={cityClass}
            />
            <DatePickerInput value={selectedCheckInDate} onChange={setSelectedCheckInDate} className={dateClass} />
            <TimePickerInput
              value={pickupTime}
              onChange={(time) => setPickupTime(time)}
              className={timeClass}
            />
            <DatePickerInput value={selectedCheckOutDate} onChange={setSelectedCheckOutDate} className={dateClass} />
            <TimePickerInput
              value={dropoffTime}
              onChange={(time) => setDropoffTime(time)}
              className={timeClass}
            />
            {peopleSelect}
          </>
        );

      case "culture":
        return (
          <>
            <CityInput
              value={selectedCity}
              onChange={(value) => {
                setSelectedCity(value);
                setFilters({ ...filters, city: value });
              }}
              className={cityClass}
            />
            <DatePickerInput
              value={selectedDate}
              onChange={(date) => {
                setSelectedDate(date);
                setFilters({ ...filters, date: date });
              }}
              className={dateClass}
            />
            <TimePickerInput
              value={selectedTime}
              onChange={(time) => {
                setSelectedTime(time);
                setFilters({ ...filters, time: time });
              }}
              className={timeClass}
            />
            <LieuInput value={selectedLieu} onChange={setSelectedLieu} className={extraClass} />
          </>
        );

      case "rentacar":
        return (
          <>
            {/* Prise en charge */}
            <div className={isMobile ? "col-span-2" : "flex-1 min-w-[130px] max-w-[160px]"}>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
                <input
                  type="text"
                  value={pickupLocation}
                  onChange={(e) => setPickupLocation(e.target.value)}
                  placeholder={t("search.rentacar.pickup_location")}
                  className="w-full pl-10 pr-4 py-2 h-10 md:h-11 bg-slate-100 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>

            {/* Lieu de restitution */}
            <div className={isMobile ? "col-span-2" : "flex-1 min-w-[130px] max-w-[160px]"}>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
                <input
                  type="text"
                  value={sameDropoff ? pickupLocation : dropoffLocation}
                  onChange={(e) => setDropoffLocation(e.target.value)}
                  placeholder={t("search.rentacar.dropoff_location")}
                  disabled={sameDropoff}
                  className={`w-full pl-10 pr-4 py-2 h-10 md:h-11 border border-slate-200 rounded-md text-sm ${
                    sameDropoff ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary"
                  }`}
                />
              </div>
            </div>

            {/* Checkbox restitution identique */}
            <div className={isMobile ? "col-span-2" : "flex items-center"}>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer hover:text-slate-800 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={sameDropoff}
                  onChange={(e) => setSameDropoff(e.target.checked)}
                  className="w-3.5 h-3.5 text-primary border-slate-300 rounded focus:ring-primary"
                />
                <span>{t("search.rentacar.same_dropoff")}</span>
              </label>
            </div>

            {/* Date prise en charge */}
            <DatePickerInput
              value={selectedCheckInDate}
              onChange={setSelectedCheckInDate}
              className={dateClass}
            />
            {/* Heure prise en charge */}
            <TimePickerInput
              value={pickupTime}
              onChange={(time) => setPickupTime(time)}
              className={timeClass}
            />

            {/* Date restitution */}
            <DatePickerInput
              value={selectedCheckOutDate}
              onChange={setSelectedCheckOutDate}
              className={dateClass}
            />
            {/* Heure restitution */}
            <TimePickerInput
              value={dropoffTime}
              onChange={(time) => setDropoffTime(time)}
              className={timeClass}
            />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col overflow-x-hidden" style={{ fontFamily: "Circular Std, sans-serif" }}>
      <Header />

      {/* Mobile Search Bar - TheFork inspired (non-rentacar) */}
      {universe !== "rentacar" && (
        <div className="md:hidden sticky top-16 z-40 bg-white border-b border-slate-200 shadow-sm">
          {/* City/Location Search */}
          <div className="px-4 pt-3 pb-2">
            <button
              onClick={() => setShowCityBottomSheet(true)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-left"
            >
              <Search className="w-5 h-5 text-slate-400" />
              <span className="text-slate-700 font-medium truncate">{selectedCity || t("results.search_placeholder")}</span>
            </button>
          </div>

          {/* Filter Pills - TheFork style with border */}
          <div className="px-4 pb-3">
            <div className="flex items-center border-2 border-primary rounded-full overflow-hidden">
              {/* Date */}
              <button
                onClick={() => {
                  setFilterBottomSheetTab("date");
                  setShowFilterBottomSheet(true);
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-sm font-medium transition-colors",
                  filterDateValue ? "text-primary" : "text-slate-700"
                )}
              >
                <CalendarDays className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">
                  {filterDateValue
                    ? filterDateValue.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                    : t("results.filter.date")}
                </span>
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
              </button>

              <div className="w-px h-6 bg-slate-300" />

              {/* Time */}
              <button
                onClick={() => {
                  setFilterBottomSheetTab("time");
                  setShowFilterBottomSheet(true);
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-sm font-medium transition-colors",
                  filterTimeValue ? "text-primary" : "text-slate-700"
                )}
              >
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{filterTimeValue || t("results.filter.time")}</span>
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
              </button>

              <div className="w-px h-6 bg-slate-300" />

              {/* Persons */}
              <button
                onClick={() => {
                  setFilterBottomSheetTab("persons");
                  setShowFilterBottomSheet(true);
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-sm font-medium transition-colors",
                  filterPersonsValue > 0 ? "text-primary" : "text-slate-700"
                )}
              >
                <Users className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{filterPersonsValue} {t("results.filter.persons_short")}</span>
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Quick Filters - Fixed filter button + Horizontal scroll */}
          <div className="pb-3 flex items-center">
            {/* Fixed Filters button with badge */}
            <div className="flex-shrink-0 pl-4 pr-2">
              {(() => {
                const activeFilterCount = [
                  promotionsOnly,
                  sortMode === "best",
                  selectedCuisineTypes.length > 0,
                  selectedAmbiances.length > 0,
                ].filter(Boolean).length;

                return (
                  <button
                    onClick={() => setShowFilterPanel(true)}
                    className="relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border bg-white border-slate-200 text-slate-700 hover:border-slate-300 transition-colors"
                  >
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1.5 -left-1.5 min-w-[20px] h-5 flex items-center justify-center px-1.5 rounded-full bg-primary text-white text-xs font-bold">
                        {activeFilterCount}
                      </span>
                    )}
                    <SlidersHorizontal className="w-4 h-4" />
                    {t("results.filters")}
                  </button>
                );
              })()}
            </div>

            {/* Scrollable filters */}
            <div className="flex-1 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div className="flex items-center gap-2 pr-4">
                {/* Promotions filter */}
                <button
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    if (promotionsOnly) {
                      next.delete("promo");
                    } else {
                      next.set("promo", "1");
                    }
                    navigate(`/results?${next.toString()}`);
                  }}
                  className={cn(
                    "flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-colors",
                    promotionsOnly
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                  )}
                >
                  <Sparkles className="w-4 h-4" />
                  {t("results.filter.promotions")}
                </button>

                {/* Sort by best */}
                <button
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    if (sortMode === "best") {
                      next.delete("sort");
                    } else {
                      next.set("sort", "best");
                    }
                    navigate(`/results?${next.toString()}`);
                  }}
                  className={cn(
                    "flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-colors",
                    sortMode === "best"
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                  )}
                >
                  <Star className="w-4 h-4" />
                  {t("results.filter.best_rated")}
                </button>

                {/* Type d'activité - for all universes */}
                <button
                  onClick={() => {
                    setQuickFilterType("cuisine");
                    setShowQuickFilterSheet(true);
                  }}
                  className={cn(
                    "flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-colors",
                    selectedCuisineTypes.length > 0
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                  )}
                >
                  {universe === "restaurants" ? (
                    <Utensils className="w-4 h-4" />
                  ) : universe === "loisirs" ? (
                    <Gamepad2 className="w-4 h-4" />
                  ) : universe === "bien_etre" ? (
                    <Dumbbell className="w-4 h-4" />
                  ) : (
                    <Building2 className="w-4 h-4" />
                  )}
                  {selectedCuisineTypes.length > 0
                    ? `${t("filters.section.activity_type")} (${selectedCuisineTypes.length})`
                    : t("filters.section.activity_type")}
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {/* Ambiance - for restaurants only */}
                {universe === "restaurants" && (
                  <button
                    onClick={() => {
                      setQuickFilterType("ambiance");
                      setShowQuickFilterSheet(true);
                    }}
                    className={cn(
                      "flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-colors",
                      selectedAmbiances.length > 0
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                    )}
                  >
                    <Wine className="w-4 h-4" />
                    {selectedAmbiances.length > 0
                      ? `Ambiance (${selectedAmbiances.length})`
                      : t("results.filter.ambiance")}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* List/Map Toggle */}
          <div className="flex border-t border-slate-200">
            <button
              onClick={() => setMobileView("list")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors",
                mobileView === "list"
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <List className="w-4 h-4" />
              {t("results.view.list")}
            </button>
            <button
              onClick={() => setMobileView("map")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors",
                mobileView === "map"
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <MapIcon className="w-4 h-4" />
              {t("results.view.map")}
            </button>
          </div>
        </div>
      )}

      {/* Mobile Search Bar - Rentacar (Expedia style) */}
      {universe === "rentacar" && (
        <div className="md:hidden sticky top-16 z-40 bg-white border-b border-slate-200 shadow-sm">
          {/* Search Summary Header */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <button
              onClick={() => {
                // TODO: Open search edit modal
              }}
              className="w-full text-left"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    {pickupLocation || selectedCity || t("search.rentacar.pickup_location")}
                  </p>
                  <div className="flex items-center gap-1.5 text-sm text-slate-600 mt-0.5">
                    <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">
                      {selectedCheckInDate && selectedCheckOutDate ? (
                        <>
                          {new Date(selectedCheckInDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          {" "}{t("common.at")} {pickupTime}
                          {" – "}
                          {new Date(selectedCheckOutDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          {" "}{t("common.at")} {dropoffTime}
                        </>
                      ) : (
                        t("search.rentacar.select_dates")
                      )}
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0 mt-2" />
              </div>
            </button>
          </div>

          {/* Results count and filter button */}
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">
                {resultsData.length} {t("results.universe.rentacar.count_label")}
              </span>
            </div>
            <button
              onClick={() => setShowFilterPanel(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {t("results.filter.sort_and_filter")}
            </button>
          </div>

          {/* Quick Filters */}
          <div className="pb-3">
            <div className="flex items-center gap-2 px-4 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {/* Promotions filter */}
              <button
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  if (promotionsOnly) {
                    next.delete("promo");
                  } else {
                    next.set("promo", "1");
                  }
                  navigate(`/results?${next.toString()}`);
                }}
                className={cn(
                  "flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-colors",
                  promotionsOnly
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                )}
              >
                <Sparkles className="w-4 h-4" />
                {t("results.filter.promotions")}
              </button>

              {/* Best rated */}
              <button
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  if (sortMode === "best") {
                    next.delete("sort");
                  } else {
                    next.set("sort", "best");
                  }
                  navigate(`/results?${next.toString()}`);
                }}
                className={cn(
                  "flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-colors",
                  sortMode === "best"
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                )}
              >
                <Star className="w-4 h-4" />
                {t("results.filter.best_rated")}
              </button>
            </div>
          </div>

          {/* List/Map Toggle */}
          <div className="flex border-t border-slate-200">
            <button
              onClick={() => setMobileView("list")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors",
                mobileView === "list"
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <List className="w-4 h-4" />
              {t("results.view.list")}
            </button>
            <button
              onClick={() => setMobileView("map")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors",
                mobileView === "map"
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <MapIcon className="w-4 h-4" />
              {t("results.view.map")}
            </button>
          </div>
        </div>
      )}

      {/* Desktop Search Bar */}
      <div
        ref={searchBarRef}
        className="hidden md:block sticky top-16 z-40 bg-gradient-to-r from-primary to-[#6a000f] py-6 md:py-10"
        style={{ margin: "-2px 0 -3px" }}
      >
        <div className="container mx-auto px-4">
          <div className="bg-white rounded-xl shadow-lg max-w-7xl mx-auto" style={{ padding: "14px 20px 16px" }}>
            <div className="flex flex-wrap gap-2 md:gap-3 items-stretch w-full">
              {renderSearchInputs("desktop")}

              <Link to={resultsHref} className="w-full md:w-[190px] flex-none md:ml-auto">
                <Button
                  className="w-full h-10 md:h-11 text-base md:text-lg font-semibold tracking-[0.2px]"
                  style={{ fontFamily: "Circular Std, sans-serif", letterSpacing: "0.2px" }}
                >
                  {t("results.search")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 container mx-auto px-4 py-4 md:py-6 max-w-7xl">
        {/* Desktop Filters - hidden on mobile since we have the new mobile bar */}
        <div className="hidden md:flex gap-2 mb-6 items-center">
          <Button variant="outline" onClick={() => setShowFilterPanel(!showFilterPanel)} className="flex gap-2 items-center">
            <Filter className="w-4 h-4" />
            {t("results.filters")}
          </Button>
        </div>

        <FiltersPanel
          isOpen={showFilterPanel}
          onClose={() => setShowFilterPanel(false)}
          category={universe as any}
          initialFilters={panelInitialFilters}
          onApplyFilters={handleApplyFilters}
        />

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Listings */}
          <div className={cn("md:col-span-7", mobileView === "map" ? "hidden md:block" : "block")}>
            <div ref={listStartRef} />
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-600">
                  <strong>{resultsData.length}</strong> {t("results.summary.found", { label: resultsCountLabel })} · {t("results.summary.showing")}{" "}
                  <strong>{Math.min(displayedResults.length, resultsData.length)}</strong>
                </p>
              </div>
            </div>

            {resultsData.length === 0 ? (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-white to-rose-50 border border-primary/10 p-8 md:p-12">
                {/* Decorative elements */}
                <div className="absolute top-4 right-4 opacity-10">
                  <Sparkles className="w-24 h-24 text-primary" />
                </div>
                <div className="absolute bottom-4 left-4 opacity-10">
                  <CalendarDays className="w-16 h-16 text-primary" />
                </div>

                <div className="relative z-10 text-center max-w-md mx-auto">
                  {/* Icon group representing couples, friends, families */}
                  <div className="flex justify-center gap-3 mb-6">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <Heart className="w-7 h-7 text-primary" />
                    </div>
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="w-7 h-7 text-primary" />
                    </div>
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <Utensils className="w-7 h-7 text-primary" />
                    </div>
                  </div>

                  <h3 className="text-xl md:text-2xl font-bold text-slate-800 mb-3">
                    {t("results.no_results.title")}
                  </h3>

                  <p className="text-slate-600 mb-2">
                    {t("results.no_results.body")}
                  </p>

                  <p className="text-sm text-slate-500 mb-6">
                    {t("results.no_results.suggestion")}
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      onClick={() => setShowFilterPanel(true)}
                      className="bg-primary hover:bg-primary/90 text-white gap-2"
                    >
                      <Filter className="w-4 h-4" />
                      {t("results.no_results.open_filters")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigate("/")}
                      className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
                    >
                      <Search className="w-4 h-4" />
                      {t("results.no_results.new_search")}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Sponsored Results Section */}
                {sponsoredItems.length > 0 && universe !== "rentacar" && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-medium text-slate-600">
                        {t("results.sponsored.title") || "Résultats sponsorisés"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                      {sponsoredItems.map((sponsored) => {
                        const est = sponsored.establishment;
                        const detailsHref = getDetailsPath(est.id);

                        return (
                          <div
                            key={`sponsored-${sponsored.campaign_id}`}
                            className="relative"
                            onClick={() => void handleSponsoredClick(sponsored.campaign_id, detailsHref)}
                          >
                            {/* Sponsored badge */}
                            <div className="absolute top-2 left-2 z-10">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
                                <Sparkles className="w-3 h-3" />
                                Sponsorisé
                              </span>
                            </div>
                            <EstablishmentCard
                              id={est.id}
                              name={est.name}
                              image={est.cover_url || "/placeholder.svg"}
                              neighborhood={est.address || est.city || undefined}
                              category={est.subcategory || undefined}
                              rating={est.avg_rating ?? undefined}
                              reviews={est.review_count ?? undefined}
                              bookingEnabled={est.booking_enabled}
                              nextSlot={null}
                              slotDiscount={null}
                              promoPercent={0}
                              promoBadge={null}
                              availableSlots={[]}
                              isFavorite={false}
                              isSelected={false}
                              isHighlighted={false}
                              onFavoriteToggle={() => {}}
                              onSelect={() => {}}
                              onHover={() => {}}
                              detailsHref={detailsHref}
                              actionLabel={getActionLabel()}
                              universe={universe}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 border-b border-slate-200" />
                  </div>
                )}

                {/* Grid layout for cards - responsive */}
                <div className={cn(
                  "gap-4 md:gap-5",
                  universe === "rentacar"
                    ? "flex flex-col"
                    : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
                )}>
                  {universe === "rentacar" ? (
                    // Vehicle cards for rentacar universe
                    orderedDisplayedResults.map((item, index) => {
                      // Mock vehicle data based on establishment data for demo
                      const vehicleCategories = ["Économique", "Compacte", "SUV intermédiaire", "Berline", "Monospace", "SUV Premium"];
                      const vehicleModels = [
                        "Peugeot 208 ou similaire",
                        "Renault Clio ou similaire",
                        "Hyundai IX35 ou similaire",
                        "Volkswagen Passat ou similaire",
                        "Dacia Lodgy ou similaire",
                        "Toyota RAV4 ou similaire"
                      ];
                      const fuelTypes = ["Essence", "Diesel", "Électrique", "Hybride"] as const;
                      const transmissions = ["Automatique", "Manuelle"] as const;

                      return (
                        <VehicleCard
                          key={item.id}
                          id={item.id}
                          category={vehicleCategories[index % vehicleCategories.length]}
                          model={vehicleModels[index % vehicleModels.length]}
                          image={item.image || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=300&h=200&fit=crop"}
                          seats={5}
                          transmission={transmissions[index % 2]}
                          fuelType={fuelTypes[index % fuelTypes.length]}
                          unlimitedMileage={index % 3 !== 0}
                          pickupLocation="Comptoir de l'agence et voiture dans le terminal"
                          freeCancellation={index % 2 === 0}
                          basicInsurance={true}
                          onlineCheckIn={index % 3 === 0}
                          supplierName={["Hertz", "Europcar", "Sixt", "Avis", "Budget"][index % 5]}
                          supplierRating={70 + (index % 25)}
                          originalPrice={index % 3 === 0 ? Math.round(200 + index * 15) : undefined}
                          price={Math.round(150 + index * 12)}
                          discount={index % 3 === 0 ? 30 : undefined}
                          priceLabel="total"
                          isSuperOffer={index % 4 === 0}
                          isMemberPrice={index % 3 === 0}
                          cashbackAmount={index % 2 === 0 ? 4.26 : undefined}
                          detailsHref={`/vehicle/${item.id}`}
                          isSelected={item.id === selectedRestaurant}
                          onSelect={() => setSelectedRestaurant(item.id)}
                        />
                      );
                    })
                  ) : (
                    // Standard establishment cards
                    orderedDisplayedResults.map((restaurant) => {
                      const promoBadge = getPromotionBadge(restaurant);
                      const promoPercent = getPromotionPercent(restaurant);
                      const isFavorite = favorites.has(restaurant.id);

                      const distanceText =
                        userLocation &&
                        geoStatus === "available" &&
                        Number.isFinite(restaurant.lat) &&
                        Number.isFinite(restaurant.lng)
                          ? calculateDistance(userLocation.lat, userLocation.lng, restaurant.lat, restaurant.lng)
                          : null;

                      // Parse time from slot for display
                      const parseTimeFromSlot = (slot: string): string => {
                        const match = slot.match(/(\d{1,2}[h:]\d{2}|\d{1,2}:\d{2}\s*(AM|PM)?)/i);
                        return match ? match[0].replace("h", ":") : slot;
                      };

                      // Build available slots array
                      const availableSlots = restaurant.nextSlot
                        ? [{
                            time: parseTimeFromSlot(restaurant.nextSlot),
                            discount: restaurant.slotDiscount || undefined,
                          }]
                        : [];

                      return (
                        <div
                          key={restaurant.id}
                          ref={(el) => {
                            if (el) cardRefs.current.set(restaurant.id, el);
                            else cardRefs.current.delete(restaurant.id);
                          }}
                          id={`result-${restaurant.id}`}
                        >
                          <EstablishmentCard
                            id={restaurant.id}
                            name={restaurant.name}
                            image={restaurant.image}
                            neighborhood={restaurant.neighborhood}
                            category={restaurant.category}
                            rating={restaurant.rating}
                            reviews={restaurant.reviews}
                            avgPrice={restaurant.avgPrice}
                            distanceText={distanceText}
                            bookingEnabled={restaurant.bookingEnabled}
                            nextSlot={restaurant.nextSlot}
                            slotDiscount={restaurant.slotDiscount}
                            promoPercent={promoPercent}
                            promoBadge={promoBadge}
                            availableSlots={availableSlots}
                            isFavorite={isFavorite}
                            isSelected={restaurant.id === selectedRestaurant}
                            isHighlighted={restaurant.id === highlightedRestaurant}
                            isVerified={restaurant.isVerified}
                            isPremium={restaurant.isPremium}
                            isCurated={restaurant.isCurated}
                            onFavoriteToggle={() => {
                              setFavorites((prev) => {
                                const next = new Set(prev);
                                if (next.has(restaurant.id)) next.delete(restaurant.id);
                                else next.add(restaurant.id);
                                return next;
                              });
                            }}
                            onSelect={() => {
                              setSelectedRestaurant(restaurant.id);
                              setHighlightedRestaurant(restaurant.id);
                            }}
                            onHover={(hovering) => setHighlightedRestaurant(hovering ? restaurant.id : null)}
                            detailsHref={getDetailsHref(restaurant)}
                            actionLabel={getActionLabel()}
                            universe={universe}
                          />
                        </div>
                      );
                    })
                  )}

                  {isLoadingMore ? (
                    <>
                      <div className="border border-slate-200 rounded-2xl p-5 animate-pulse bg-white">
                        <div className="h-48 sm:h-28 bg-slate-100 rounded-lg" />
                        <div className="mt-4 h-4 bg-slate-100 rounded w-2/3" />
                        <div className="mt-2 h-3 bg-slate-100 rounded w-1/2" />
                      </div>
                      <div className="border border-slate-200 rounded-2xl p-5 animate-pulse bg-white">
                        <div className="h-48 sm:h-28 bg-slate-100 rounded-lg" />
                        <div className="mt-4 h-4 bg-slate-100 rounded w-2/3" />
                        <div className="mt-2 h-3 bg-slate-100 rounded w-1/2" />
                      </div>
                    </>
                  ) : null}
                </div>

                {displayedResults.length < resultsData.length ? (
                  <div className="mt-6 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 px-6"
                      disabled={isLoadingMore}
                      onClick={() => {
                        setIsLoadingMore(true);
                        window.setTimeout(() => {
                          setVisibleCount((c) => Math.min(c + 10, resultsData.length));
                          setIsLoadingMore(false);
                        }, 600);
                      }}
                    >
                      {t("results.load_more", { count: Math.min(10, resultsData.length - displayedResults.length) })}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* Map */}
          <div
            className={cn(
              "md:col-span-5",
              mobileView === "map" ? "block" : "hidden md:block",
              "h-[calc(100dvh-16rem)] md:h-[calc(100dvh-16rem)] md:sticky md:top-44",
              "relative z-10 overflow-hidden rounded-xl",
            )}
          >
            <ResultsMap
              items={mapItems}
              selectedId={selectedRestaurant}
              highlightedId={highlightedRestaurant}
              userLocation={geoStatus === "available" ? userLocation : null}
              onRequestUserLocation={requestUserLocation}
              onSelect={(id) => setSelectedRestaurant(id)}
              onMarkerNavigateToCard={(id) => {
                setSelectedRestaurant(id);
                setHighlightedRestaurant(id);
                scrollToCard(id);
              }}
              geoStatus={geoStatus}
            />
          </div>
        </div>
      </div>

      {/* Mobile Filter Bottom Sheet - TheFork style */}
      <ResultsFilterBottomSheet
        isOpen={showFilterBottomSheet}
        onClose={() => setShowFilterBottomSheet(false)}
        activeTab={filterBottomSheetTab}
        onTabChange={setFilterBottomSheetTab}
        selectedDate={filterDateValue}
        onDateChange={(date) => {
          setFilterDateValue(date);
          // Sync with the main date state
          setSelectedDate(date.toISOString().split("T")[0]);
        }}
        minDate={new Date()}
        selectedTime={filterTimeValue}
        onTimeChange={(time) => {
          setFilterTimeValue(time);
          // Sync with the main time state
          setSelectedTime(time);
        }}
        selectedPersons={filterPersonsValue}
        onPersonsChange={(persons) => {
          setFilterPersonsValue(persons);
          // Sync with the main filters state
          setFilters((prev) => ({ ...prev, guests: String(persons) }));
        }}
        maxPersons={20}
      />

      {/* Quick Filter Bottom Sheet (Type d'activité, Ambiance) */}
      <QuickFilterBottomSheet
        isOpen={showQuickFilterSheet}
        onClose={() => setShowQuickFilterSheet(false)}
        type={quickFilterType}
        title={quickFilterType === "cuisine"
          ? (universe === "restaurants" ? "Type de cuisine" :
             universe === "sport" ? "Type de prestation" :
             universe === "loisirs" ? "Type d'activité" :
             universe === "hebergement" ? "Type d'hébergement" :
             universe === "culture" ? "Type de lieu" :
             universe === "shopping" ? "Type de boutique" :
             "Type")
          : "Ambiance"}
        options={quickFilterType === "cuisine"
          ? (universe === "restaurants" ? CUISINE_TYPES :
             universe === "sport" ? SPORT_SPECIALTIES :
             universe === "loisirs" ? LOISIRS_SPECIALTIES :
             universe === "hebergement" ? HEBERGEMENT_TYPES :
             universe === "culture" ? CULTURE_TYPES :
             universe === "shopping" ? SHOPPING_TYPES :
             CUISINE_TYPES)
          : AMBIANCE_TYPES}
        selectedOptions={quickFilterType === "cuisine" ? selectedCuisineTypes : selectedAmbiances}
        onSelectionChange={(selected) => {
          if (quickFilterType === "cuisine") {
            setSelectedCuisineTypes(selected);
          } else {
            setSelectedAmbiances(selected);
          }
        }}
        multiSelect={true}
      />

      {/* City Bottom Sheet - Mobile */}
      <CityBottomSheet
        isOpen={showCityBottomSheet}
        onClose={() => setShowCityBottomSheet(false)}
        selectedCity={selectedCity}
        onSelectCity={(city, cityId) => {
          setSelectedCity(city);
          setFilters((prev) => ({ ...prev, city }));
        }}
      />
    </div>
  );
}
