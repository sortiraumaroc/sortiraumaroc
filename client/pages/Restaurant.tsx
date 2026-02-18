import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Globe,
  Heart,
  MapPin,
  Phone,
  Share2,
  Star,
  Tag,
} from "lucide-react";
import { getSocialIcon } from "@/components/ui/SocialIcons";

import { ImageLightbox } from "@/components/ImageLightbox";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGeocodedQuery } from "@/hooks/useGeocodedQuery";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useTrackEstablishmentVisit } from "@/hooks/useTrackEstablishmentVisit";
import { formatDistanceBetweenCoords } from "@/lib/geo";
import { getPublicEstablishment, type PublicOfferPack } from "@/lib/publicApi";
import { isAuthed, openAuthModal } from "@/lib/auth";
import { isUuid } from "@/lib/pro/visits";
import { getFavorites, addFavorite, removeFavorite, type FavoriteItem } from "@/lib/userData";
import { ReservationBanner } from "@/components/booking/ReservationBanner";
import { OpeningHoursBlock } from "@/components/restaurant/OpeningHoursBlock";
import { MenuSection } from "@/components/restaurant/MenuSection";
import { RentacarVehicleSection } from "@/components/establishment/RentacarVehicleSection";
import { RestaurantMap } from "@/components/restaurant/RestaurantMap";
import type { Pack, MenuCategory, MenuItem, MenuBadge } from "@/components/restaurant/MenuSection";
import {
  clampRating,
  createRng,
  makeImageSet,
  makePhoneMa,
  makeWebsiteUrl,
  nextDaysYmd,
  pickMany,
  pickOne,
  slugify,
  toYmd,
} from "@/lib/mockData";
import { GOOGLE_MAPS_LOGO_URL, WAZE_LOGO_URL, TRIPADVISOR_LOGO_URL } from "@/lib/mapAppLogos";
import { applySeo, clearJsonLd, setJsonLd, generateLocalBusinessSchema, generateBreadcrumbSchema, hoursToOpeningHoursSpecification, buildI18nSeoFields } from "@/lib/seo";
import { useI18n } from "@/lib/i18n";
import { EstablishmentTabs } from "@/components/establishment/EstablishmentTabs";
import { EstablishmentSectionHeading } from "@/components/establishment/EstablishmentSectionHeading";
import { EstablishmentReviewsSection } from "@/components/EstablishmentReviewsSection";
import { ReportEstablishmentDialog } from "@/components/ReportEstablishmentDialog";
import { ClaimEstablishmentDialog } from "@/components/ClaimEstablishmentDialog";
import { CeAdvantageSection } from "@/components/ce/CeAdvantageSection";

interface RestaurantReview {
  id: number;
  author: string;
  rating: number;
  date: string;
  text: string;
  helpful: number;
}

// MenuCategory and MenuItem types are imported from MenuSection

interface TimeSlotService {
  service: string;
  times: string[];
}

interface DateSlots {
  date: string;
  services: TimeSlotService[];
}

interface SocialMediaLink {
  platform: string;
  url: string;
}

interface RestaurantData {
  name: string;
  rating: number;
  reviewCount: number;
  category: string;
  neighborhood: string;
  address: string;
  phone: string;
  website: string;
  avgPrice: string;
  description: string;
  images: string[];
  highlights: string[];
  hours: {
    [key: string]: {
      lunch: string;
      dinner: string;
      closed?: boolean;
    };
  };
  availableSlots: DateSlots[];
  menu: MenuCategory[];
  packs?: Pack[];
  reviewsList: RestaurantReview[];
  socialMedia: SocialMediaLink[];
  taxonomy: string[];
}

function normalizeSlotDateToYmd(raw: string): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const lower = v.toLowerCase();

  const base = new Date();
  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());

  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(today.getDate() + n);
    return toYmd(d);
  };

  if (lower === "today" || lower.includes("aujourd")) return addDays(0);
  if (lower === "tomorrow" || lower.includes("demain")) return addDays(1);

  const hasYear = /\b\d{4}\b/.test(v);

  const tryParse = (s: string) => {
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? null : dt;
  };

  const parsed = hasYear ? tryParse(v) : tryParse(`${v} ${today.getFullYear()}`) ?? tryParse(v);
  if (!parsed) return null;

  const normalized = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  if (!hasYear && normalized.getTime() < today.getTime()) {
    normalized.setFullYear(today.getFullYear() + 1);
  }

  return toYmd(normalized);
}

function normalizeRestaurantAvailableSlots(slots: DateSlots[] | undefined | null): DateSlots[] {
  const arr = Array.isArray(slots) ? slots : [];
  const out: DateSlots[] = [];
  const seen = new Set<string>();

  for (const s of arr) {
    const dateYmd = normalizeSlotDateToYmd(s?.date ?? "");
    if (!dateYmd) continue;
    if (seen.has(dateYmd)) continue;
    seen.add(dateYmd);

    out.push({
      date: dateYmd,
      services: Array.isArray(s?.services) ? s.services : [],
    });
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function packItemsToStrings(items: unknown): string[] {
  if (!items) return [];

  if (Array.isArray(items)) {
    return items
      .map((it) => {
        if (typeof it === "string") return it.trim();
        if (it && typeof it === "object") {
          const rec = it as Record<string, unknown>;
          const name = typeof rec.name === "string" ? rec.name : typeof rec.title === "string" ? rec.title : null;
          return name ? name.trim() : "";
        }
        return "";
      })
      .filter(Boolean);
  }

  if (typeof items === "string") {
    return items
      .split(/\n|\r|,/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
}

function mapPublicPacksToMenuPacks(packs: PublicOfferPack[] | undefined | null): Pack[] {
  const arr = Array.isArray(packs) ? packs : [];

  return arr
    .map((p) => {
      const items = packItemsToStrings(p.items);

      const availabilityRaw = String(p.availability ?? "").trim();
      const availability =
        availabilityRaw === "today" || availabilityRaw === "week" || availabilityRaw === "permanent"
          ? (availabilityRaw as Pack["availability"])
          : undefined;

      return {
        id: p.id,
        title: p.title ?? "Pack",
        items,
        // Packs are stored in DB as cents; consumer UI uses MAD.
        price: typeof p.price === "number" && Number.isFinite(p.price) ? Math.round(p.price / 100) : 0,
        original_price:
          typeof p.original_price === "number" && Number.isFinite(p.original_price) ? Math.round(p.original_price / 100) : undefined,
        is_limited: Boolean(p.is_limited),
        availability,
        max_reservations: typeof p.max_reservations === "number" && Number.isFinite(p.max_reservations) ? p.max_reservations : undefined,
      };
    })
    .filter((p) => Boolean(p.id));
}

const RESTAURANT_DETAILS: Record<string, RestaurantData> = {
  "1": {
    name: "Restaurant Riad Atlas",
    rating: 4.8,
    reviewCount: 245,
    category: "Gastronomique",
    neighborhood: "Medina",
    address: "123 Rue de la Kasbah, Marrakech 40000",
    phone: "+212 5 24 38 77 77",
    website: "www.riadatlas.com",
    avgPrice: "350-500 Dhs",
    description:
      "Une expérience culinaire authentique dans un riad traditionnel. Notre équipe de chefs marocains prépare des plats à base d'ingrédients locaux frais.",
    images: [
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fbbd4efb61da74938abbdea8bdd335ab2?format=webp&width=800",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fc43e2727fb28452c8be962b6a369dc53?format=webp&width=800",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F05f6fb8ee65e4fd1889435e7d289c5d9?format=webp&width=800",
      "https://cdn.builder.io/o/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F029f2e7e02b94085ac1b262b064a4cdd?alt=media&token=b566bbf0-0622-4d21-a96e-9898c11d2532&apiKey=9d79e075af8c480ea94841fd41e63e5c",
    ],
    highlights: [
      "Ambiance authentique",
      "Cuisine marocaine tradition",
      "Vue sur la médina",
      "Terrasse panoramique",
      "Service impeccable",
      "Wine pairing disponible",
    ],
    hours: {
      lundi: {
        lunch: "12:00 - 15:00",
        dinner: "19:00 - 23:30",
      },
      mardi: {
        lunch: "12:00 - 15:00",
        dinner: "19:00 - 23:30",
      },
      mercredi: {
        lunch: "12:00 - 15:00",
        dinner: "19:00 - 23:30",
      },
      jeudi: {
        lunch: "12:00 - 15:00",
        dinner: "19:00 - 23:30",
      },
      vendredi: {
        lunch: "Fermé",
        dinner: "19:00 - 23:30",
        closed: true,
      },
      samedi: {
        lunch: "12:00 - 15:00",
        dinner: "19:00 - 23:30",
      },
      dimanche: {
        lunch: "12:00 - 15:00",
        dinner: "19:00 - 23:30",
      },
    },
    availableSlots: [
      {
        date: "Today",
        services: [
          {
            service: "Midi",
            times: ["12:00", "12:30", "13:00", "13:30", "14:00", "14:30"],
          },
          {
            service: "Tea Time",
            times: ["15:00", "15:30", "16:00", "16:30", "17:00"],
          },
          {
            service: "Happy Hour",
            times: ["17:30", "18:00", "18:30", "19:00"],
          },
          {
            service: "Soir",
            times: ["19:30", "20:00", "20:30", "21:00", "21:30", "22:00"],
          },
        ],
      },
      {
        date: "Tomorrow",
        services: [
          {
            service: "Midi",
            times: ["12:00", "12:30", "13:00", "13:30", "14:00", "14:30"],
          },
          {
            service: "Tea Time",
            times: ["15:00", "15:30", "16:00", "16:30", "17:00"],
          },
          {
            service: "Happy Hour",
            times: ["17:30", "18:00", "18:30", "19:00"],
          },
          {
            service: "Soir",
            times: ["19:30", "20:00", "20:30", "21:00", "21:30", "22:00"],
          },
        ],
      },
      {
        date: "2 January",
        services: [
          {
            service: "Midi",
            times: ["12:00", "12:30", "13:00", "13:30", "14:00", "14:30"],
          },
          {
            service: "Tea Time",
            times: ["15:00", "15:30", "16:00", "16:30", "17:00"],
          },
          {
            service: "Happy Hour",
            times: ["17:30", "18:00", "18:30", "19:00"],
          },
          {
            service: "Soir",
            times: ["19:30", "20:00", "20:30", "21:00", "21:30", "22:00"],
          },
        ],
      },
    ],
    packs: [
      {
        id: "pack-decouverte-marocain",
        title: "Pack Découverte Marocain",
        is_limited: true,
        availability: "today",
        max_reservations: 30,
        items: ["Entrée au choix", "Plat principal", "Dessert", "Boisson"],
        price: 180,
        original_price: 230,
      },
      {
        id: "pack-rooftop-soiree",
        title: "Pack Rooftop – Soirée",
        is_limited: true,
        availability: "week",
        max_reservations: 50,
        items: ["Table + vue", "Cocktail signature", "Plat principal", "Dessert"],
        price: 220,
        original_price: 290,
      },
    ],
    menu: [
      {
        id: "starters",
        name: "Entrées",
        items: [
          {
            id: 1,
            name: "Salade Marocaine",
            description: "Tomates, concombre, oignon, persil frais et citron",
            price: "45 Dhs",
            badge: "Nouveau",
          },
          {
            id: 2,
            name: "Cigares aux Fruits de Mer",
            description: "Pâte filo croustillante, crevettes et calamars",
            price: "85 Dhs",
            badge: "Spécialité",
          },
          {
            id: 3,
            name: "Brik à l'Œuf et Anchois",
            description: "Pâte filo dorée, œuf, anchois, persil",
            price: "65 Dhs",
          },
          {
            id: 4,
            name: "Hummus et Salade de Pois Chiches",
            description: "Préparation maison, huile d'argan, pain grillé",
            price: "55 Dhs",
          },
          {
            id: 5,
            name: "Pastilla aux Amandes",
            description: "Feuilletage aérien, amandes concassées, sucre et cannelle",
            price: "75 Dhs",
            badge: "Best seller",
          },
        ],
      },
      {
        id: "main",
        name: "Plats Principaux",
        items: [
          {
            id: 6,
            name: "Tajine de Poulet aux Citrons Confits",
            description: "Poulet fermier, citrons confits maison, olives vertes, ail frais",
            price: "175 Dhs",
            badge: "Spécialité du Chef",
          },
          {
            id: 7,
            name: "Tajine d'Agneau aux Pruneaux",
            description: "Agneau tendre, pruneaux moelleux, épices marocaines, amandes",
            price: "195 Dhs",
          },
          {
            id: 8,
            name: "Couscous Royal",
            description: "Semoule fine, légumes de saison, poulet, merguez, pois chiches",
            price: "185 Dhs",
            badge: "Best seller",
          },
          {
            id: 9,
            name: "Grillades Mixtes",
            description: "Kefta, poulet, agneau grillés, légumes, sauce chermoula",
            price: "210 Dhs",
          },
          {
            id: 10,
            name: "Poisson Grillé du Jour",
            description: "Poisson frais grillé, citron, herbes aromatiques, riz",
            price: "180 Dhs",
          },
          {
            id: 11,
            name: "Tajine de Poisson aux Légumes",
            description: "Poisson blanc, tomates, poivrons, courgettes, safran",
            price: "165 Dhs",
          },
        ],
      },
      {
        id: "desserts",
        name: "Desserts",
        items: [
          {
            id: 12,
            name: "Corne de Gazelle",
            description: "Pâte feuilletée fourrée à la pâte d'amandes, miel",
            price: "45 Dhs",
          },
          {
            id: 13,
            name: "Makrout au Miel",
            description: "Semoule, dattes, imbibé de miel épais",
            price: "35 Dhs",
            badge: "Nouveau",
          },
          {
            id: 14,
            name: "Fruit Frais et Sorbet",
            description: "Sélection de fruits marocains, sorbet artisanal",
            price: "50 Dhs",
          },
          {
            id: 15,
            name: "Amlou à l'Argan",
            description: "Pâte d'amandes, huile d'argan, pain croustillant",
            price: "40 Dhs",
          },
          {
            id: 16,
            name: "Thé à la Menthe et Pâtisseries",
            description: "Thé marocain traditionnel avec assortiment de pâtisseries",
            price: "55 Dhs",
          },
        ],
      },
      {
        id: "cocktails",
        name: "Cocktails",
        items: [
          {
            id: 17,
            name: "Mojito à la Menthe Marocaine",
            description: "Rhum blanc, menthe fraîche marocaine, citron frais, sirop, soda",
            price: "85 Dhs",
            badge: "Nouveau",
          },
          {
            id: 18,
            name: "Marrakech Sunset",
            description: "Vodka, jus de grenade, nectar de rose, glaçons, tranche d'orange",
            price: "95 Dhs",
            badge: "Best seller",
          },
          {
            id: 19,
            name: "Cocktail aux Dattes et Épices",
            description: "Bourbon, purée de dattes, cannelle, cardamome, glaçons",
            price: "100 Dhs",
          },
          {
            id: 20,
            name: "Oasis Fraîche",
            description: "Rhum blanc, jus de fruits exotiques, sirop de coco, glaçons",
            price: "80 Dhs",
          },
          {
            id: 21,
            name: "Argan Dream",
            description: "Amaretto, jus d'abricot frais, miel, cannelle, alcool premium",
            price: "105 Dhs",
          },
        ],
      },
      {
        id: "sodas",
        name: "Sodas & Boissons Froides",
        items: [
          {
            id: 22,
            name: "Jus d'Orange Frais Pressé",
            description: "Oranges fraîches pressées sur place, sans sucre ajouté",
            price: "35 Dhs",
          },
          {
            id: 23,
            name: "Jus de Grenade",
            description: "Grenade fraîche pressée, riche en antioxydants",
            price: "45 Dhs",
          },
          {
            id: 24,
            name: "Jus de Fruits Exotiques",
            description: "Mangue, papaye, ananas, fruits de saison",
            price: "40 Dhs",
          },
          {
            id: 25,
            name: "Lait Frais et Amande",
            description: "Lait frais, poudre d'amande, sucre, vanille",
            price: "30 Dhs",
          },
          {
            id: 26,
            name: "Citron Pressé",
            description: "Citron frais pressé, eau, glaçons, sucre ou miel",
            price: "25 Dhs",
          },
          {
            id: 27,
            name: "Soda Français",
            description: "Coca-Cola, Fanta, Sprite, Perrier au verre",
            price: "20 Dhs",
          },
        ],
      },
      {
        id: "hot_drinks",
        name: "Boissons Chaudes",
        items: [
          {
            id: 28,
            name: "Thé à la Menthe Marocain",
            description: "Thé vert traditionnel, menthe fraîche, sucre, servi à la marocaine",
            price: "25 Dhs",
            badge: "Best seller",
          },
          {
            id: 29,
            name: "Thé aux Épices et Miel",
            description: "Thé noir, cannelle, cardamome, gingembre, miel naturel",
            price: "30 Dhs",
          },
          {
            id: 30,
            name: "Café Marocain Traditionnel",
            description: "Café noir fort, servi avec eau chaude et pains grillés",
            price: "20 Dhs",
          },
          {
            id: 31,
            name: "Café Noisette",
            description: "Café chaud avec lait mousseux et touche de noisette",
            price: "35 Dhs",
          },
          {
            id: 32,
            name: "Chocolat Chaud Riche",
            description: "Chocolat belge premium, lait chaud, crème fouettée, cannelle",
            price: "40 Dhs",
          },
          {
            id: 33,
            name: "Tisane aux Herbes Marocaines",
            description: "Mélange d'herbes séchées du Maroc, verveine, miel naturel",
            price: "28 Dhs",
          },
        ],
      },
    ],
    reviewsList: [
      {
        id: 1,
        author: "Sarah M.",
        rating: 5,
        date: "2024-01-15",
        text: "Absolutely wonderful experience! The food was exquisite and the service was impeccable.",
        helpful: 23,
      },
      {
        id: 2,
        author: "Jean D.",
        rating: 4.5,
        date: "2024-01-10",
        text: "Great food and beautiful setting. A bit pricey but definitely worth it for a special occasion.",
        helpful: 15,
      },
      {
        id: 3,
        author: "Maria L.",
        rating: 5,
        date: "2024-01-05",
        text: "Perfect! We celebrated our anniversary here. They made it very special with complimentary dessert.",
        helpful: 34,
      },
    ],
    socialMedia: [
      { platform: "facebook", url: "https://facebook.com/riadatlas" },
      { platform: "instagram", url: "https://instagram.com/riadatlas" },
      { platform: "twitter", url: "https://twitter.com/riadatlas" },
      { platform: "tiktok", url: "https://tiktok.com/@riadatlas" },
      { platform: "snapchat", url: "https://snapchat.com/add/riadatlas" },
      { platform: "youtube", url: "https://youtube.com/@riadatlas" },
    ],
    taxonomy: [
      "Cuisine marocaine",
      "Paiement par CB",
      "PMR",
      "Ascenseur",
      "Livraison",
      "À emporter",
      "WiFi gratuit",
      "Parking privé",
      "Stationnement dans la rue",
    ],
  },
};

function buildFallbackRestaurant(args: {
  id: string;
  name: string;
  category?: string;
  neighborhood?: string;
  city?: string;
}): RestaurantData {
  const rng = createRng(`restaurant-${args.id}-${args.name}`);

  const city = args.city ?? "Marrakech";
  const neighborhood =
    args.neighborhood ??
    pickOne(rng, ["Médina", "Guéliz", "Hivernage", "Palmeraie", "Kasbah", "Sidi Ghanem"] as const);

  const category =
    args.category ??
    pickOne(rng, ["Marocain", "Rooftop", "Fusion", "Grill", "Café", "Gastronomique", "International"] as const);

  const rating = clampRating(4.1 + rng() * 0.8);
  const reviewCount = Math.floor(80 + rng() * 900);

  const addressNumber = Math.floor(10 + rng() * 240);
  const streetType = pickOne(rng, ["Rue", "Avenue", "Boulevard", "Derb", "Place"] as const);
  const streetName = pickOne(rng, [
    "de la Kasbah",
    "Mohamed VI",
    "Majorelle",
    "Mouassine",
    "Yves Saint Laurent",
    "Al Massira",
    "Jemaa el-Fna",
    "Bab Doukkala",
  ] as const);

  const address = `${addressNumber} ${streetType} ${streetName}, ${city}`;

  const avgPrice = pickOne(rng, ["150-250 Dhs", "200-350 Dhs", "300-500 Dhs", "400-650 Dhs"] as const);
  const website = makeWebsiteUrl(args.name);
  const phone = makePhoneMa(rng);

  const highlights = pickMany(
    rng,
    [
      "Cuisine maison à base de produits locaux",
      "Terrasse agréable (selon météo)",
      "Service rapide et attentionné",
      "Options végétariennes disponibles",
      "Idéal en couple ou en famille",
      "Ambiance musicale en soirée",
      "Réservation conseillée le week-end",
      "Desserts faits maison",
      "Carte de boissons variée",
      "Accès facile en taxi",
    ] as const,
    6,
  );

  const images = makeImageSet(rng, "restaurant");

  const hours: RestaurantData["hours"] = {
    lundi: { lunch: "12:00 - 15:00", dinner: "19:00 - 23:30" },
    mardi: { lunch: "12:00 - 15:00", dinner: "19:00 - 23:30" },
    mercredi: { lunch: "12:00 - 15:00", dinner: "19:00 - 23:30" },
    jeudi: { lunch: "12:00 - 15:00", dinner: "19:00 - 23:30" },
    vendredi: { lunch: "12:00 - 15:00", dinner: "19:00 - 23:30" },
    samedi: { lunch: "12:00 - 15:30", dinner: "19:00 - 00:00" },
    dimanche: { lunch: "12:00 - 15:30", dinner: "19:00 - 23:30" },
  };

  const slotTimesLunch = ["12:00", "12:30", "13:00", "13:30", "14:00", "14:30"];
  const slotTimesDinner = ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"];

  const availableSlots: DateSlots[] = nextDaysYmd(6).map((d) => ({
    date: d,
    services: [
      { service: "Midi", times: slotTimesLunch },
      { service: "Soir", times: slotTimesDinner },
    ],
  }));

  const menu: MenuCategory[] = [
    {
      id: "starters",
      name: "Entrées",
      items: [
        {
          id: 1,
          name: pickOne(rng, ["Salade marocaine", "Zaalouk", "Briouates", "Harira maison"] as const),
          description: "Préparation maison, huile d’olive et herbes fraîches.",
          price: `${Math.floor(35 + rng() * 40)} Dhs`,
          badge: pickOne(rng, ["Nouveau", "Spécialité", "Chef selection"] as const),
        },
        {
          id: 2,
          name: pickOne(rng, ["Cigares croustillants", "Bastilla mini", "Soupe du jour", "Houmous & pain chaud"] as const),
          description: "Servi chaud, texture croustillante, sauce maison.",
          price: `${Math.floor(45 + rng() * 60)} Dhs`,
        },
        {
          id: 3,
          name: pickOne(rng, ["Carpaccio agrumes", "Taktouka", "Salade de pois chiches"] as const),
          description: "Assaisonnement citron, épices douces et persil.",
          price: `${Math.floor(40 + rng() * 55)} Dhs`,
        },
      ],
    },
    {
      id: "mains",
      name: "Plats",
      items: [
        {
          id: 10,
          name: pickOne(rng, ["Tajine poulet citron", "Couscous royal", "Pastilla poulet", "Brochettes grillées"] as const),
          description: "Garniture du marché, cuisson lente, épices équilibrées.",
          price: `${Math.floor(120 + rng() * 140)} Dhs`,
          badge: pickOne(rng, ["Best seller", "Spécialité du Chef", "Chef selection"] as const),
        },
        {
          id: 11,
          name: pickOne(rng, ["Poisson du jour", "Kefta maison", "Pâtes fraîches", "Bowl végétarien"] as const),
          description: "Portion généreuse, sauce maison et accompagnement.",
          price: `${Math.floor(110 + rng() * 160)} Dhs`,
        },
        {
          id: 12,
          name: pickOne(rng, ["Tagine végétarien", "Couscous légumes", "Risotto safrané"] as const),
          description: "Option végétarienne disponible, épices douces.",
          price: `${Math.floor(95 + rng() * 120)} Dhs`,
        },
      ],
    },
    {
      id: "desserts",
      name: "Desserts",
      items: [
        {
          id: 20,
          name: pickOne(rng, ["Pastilla au lait", "Crème brûlée", "Chebakia revisitée", "Gâteau amande"] as const),
          description: "Sucré équilibré, servi avec thé à la menthe.",
          price: `${Math.floor(35 + rng() * 55)} Dhs`,
          badge: pickOne(rng, ["New", "Nouveau"] as const),
        },
        {
          id: 21,
          name: pickOne(rng, ["Assortiment de pâtisseries", "Fruits frais", "Mousse chocolat"] as const),
          description: "Sélection du chef selon saison.",
          price: `${Math.floor(30 + rng() * 45)} Dhs`,
        },
      ],
    },
  ];

  const packs: Pack[] = [
    {
      id: `pack-${args.id}-decouverte`,
      title: "Pack Découverte",
      is_limited: true,
      availability: "week",
      max_reservations: 40,
      items: ["Entrée", "Plat", "Dessert", "Boisson"],
      price: Math.floor(160 + rng() * 120),
      original_price: Math.floor(220 + rng() * 150),
    },
    {
      id: `pack-${args.id}-premium`,
      title: "Pack Premium",
      is_limited: true,
      availability: "today",
      max_reservations: 25,
      items: ["Entrée", "Plat signature", "Dessert", "Thé à la menthe"],
      price: Math.floor(220 + rng() * 160),
      original_price: Math.floor(290 + rng() * 200),
    },
  ];

  const reviewers = ["Nadia", "Youssef", "Imane", "Karim", "Salma", "Hamza", "Omar", "Meriem"] as const;
  const reviewTexts = [
    "Très bonne expérience, service agréable et plats savoureux.",
    "Cadre magnifique, ambiance parfaite pour une soirée.",
    "Réservation simple et rapide, on reviendra.",
    "Bon rapport qualité-prix, portions généreuses.",
    "Petit temps d’attente mais l’accueil rattrape tout.",
    "Les desserts sont excellents, mention spéciale au thé.",
  ] as const;

  const reviewsList: RestaurantReview[] = Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    author: pickOne(rng, reviewers),
    rating: Math.max(3, Math.round((3.5 + rng() * 1.5) * 2) / 2),
    date: nextDaysYmd(30)[Math.floor(rng() * 30)] ?? "2025-01-01",
    text: pickOne(rng, reviewTexts),
    helpful: Math.floor(rng() * 40),
  }));

  const taxonomy = pickMany(
    rng,
    [
      "Réservation en ligne",
      "Climatisation",
      "Wi‑Fi gratuit",
      "Paiement par carte",
      "Terrasse",
      "Parking à proximité",
      "Options végétariennes",
      "Menu enfants",
      "Accessible",
      "À emporter",
    ] as const,
    8,
  );

  return {
    name: args.name,
    rating,
    reviewCount,
    category,
    neighborhood,
    address,
    phone,
    website,
    avgPrice,
    description: `Adresse populaire à ${city} (${neighborhood}) — une expérience ${category.toLowerCase()} pensée pour être simple à réserver et agréable sur place.`,
    images,
    highlights,
    hours,
    availableSlots,
    menu,
    packs,
    reviewsList,
    socialMedia: [
      { platform: "instagram", url: `https://instagram.com/${slugify(args.name)}` },
      { platform: "facebook", url: `https://facebook.com/${slugify(args.name)}` },
      { platform: "website", url: website },
    ],
    taxonomy,
  };
}

export default function Restaurant() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const title = searchParams.get("title");

  const [canonicalEstablishmentId, setCanonicalEstablishmentId] = React.useState<string | null>(null);
  const [publicPayload, setPublicPayload] = React.useState<Awaited<ReturnType<typeof getPublicEstablishment>> | null>(null);
  const [publicLoaded, setPublicLoaded] = React.useState(false);

  useTrackEstablishmentVisit(canonicalEstablishmentId ?? undefined);

  React.useEffect(() => {
    let active = true;

    const resolve = async () => {
      const ref = String(id ?? "1").trim();
      if (!ref) return;

      try {
        const payload = await getPublicEstablishment({ ref, title });
        if (!active) return;
        setPublicPayload(payload);
        setCanonicalEstablishmentId(payload.establishment.id);
      } catch {
        if (!active) return;
        setPublicPayload(null);
        setCanonicalEstablishmentId(isUuid(ref) ? ref : null);
      } finally {
        if (active) setPublicLoaded(true);
      }
    };

    void resolve();

    return () => {
      active = false;
    };
  }, [id, title]);

  const { t, locale } = useI18n();
  const [bookingOpen, setBookingOpen] = React.useState(false);
  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);
  const [isFavorited, setIsFavorited] = React.useState(false);
  const [showShareMenu, setShowShareMenu] = React.useState(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);

  // Initialize favorite state from localStorage when establishment ID is available
  React.useEffect(() => {
    const stored = getFavorites();
    const estId = publicPayload?.establishment?.id ?? id ?? "1";
    const isFav = stored.some((f) => f.id === estId);
    setIsFavorited(isFav);
  }, [publicPayload?.establishment?.id, id]);

  const [showReportDialog, setShowReportDialog] = React.useState(false);
  const [showClaimDialog, setShowClaimDialog] = React.useState(false);
  const [touchStartX, setTouchStartX] = React.useState(0);
  const [mouseStartX, setMouseStartX] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const isDraggingRef = React.useRef(false);

  const { status: geoStatus, location: userLocation, request: requestUserLocation } = useUserLocation();

  const restaurantId = id ?? "1";
  const bookingEstablishmentId = publicPayload?.establishment?.id ?? canonicalEstablishmentId ?? restaurantId;
  const establishmentUniverse = publicPayload?.establishment?.universe ?? null;
  const isRentacar = establishmentUniverse === "rentacar";
  // Booking is only enabled if the establishment has an email address registered
  const hasEstablishmentEmail = Boolean(publicPayload?.establishment?.email);

  // Open booking modal automatically if action=book is in URL
  React.useEffect(() => {
    const action = searchParams.get("action");
    if (action === "book" && hasEstablishmentEmail) {
      setBookingOpen(true);
    }
  }, [searchParams, hasEstablishmentEmail]);
  const preset = id ? RESTAURANT_DETAILS[id] : RESTAURANT_DETAILS["1"];

  const baseRestaurant =
    preset ??
    buildFallbackRestaurant({
      id: restaurantId,
      name: searchParams.get("title") ?? preset?.name ?? `Restaurant ${restaurantId}`,
      category: searchParams.get("category") ?? preset?.category,
      neighborhood: searchParams.get("neighborhood") ?? preset?.neighborhood,
      city: searchParams.get("city") ?? "Marrakech",
    });

  const packsFromDb = mapPublicPacksToMenuPacks(publicPayload?.offers?.packs);

  // Transform menu from API to MenuCategory format
  const menuFromDb: MenuCategory[] = React.useMemo(() => {
    const apiMenu = publicPayload?.menu;
    if (!apiMenu || !Array.isArray(apiMenu) || apiMenu.length === 0) return [];
    return apiMenu.map((cat) => ({
      id: cat.id,
      name: cat.name,
      items: (cat.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description ?? "",
        price: item.price ?? "",
        badges: (item.badges ?? []) as MenuBadge[],
      })),
    }));
  }, [publicPayload?.menu]);

  const dbCover = publicPayload?.establishment?.cover_url ? [publicPayload.establishment.cover_url] : [];
  const dbGallery = Array.isArray(publicPayload?.establishment?.gallery_urls) ? publicPayload!.establishment.gallery_urls : [];
  const dbImages = [...dbCover, ...dbGallery].filter((u): u is string => Boolean(u && typeof u === "string"));

  // Build social media links from DB social_links + google_maps_link
  const dbSocialMedia: SocialMediaLink[] = React.useMemo(() => {
    const links: SocialMediaLink[] = [];
    const sl = publicPayload?.establishment?.social_links as Record<string, string> | null | undefined;
    if (sl) {
      for (const [platform, url] of Object.entries(sl)) {
        if (url) links.push({ platform, url });
      }
    }
    // Also add google_maps_link from the dedicated field if not already present
    const gmLink = (publicPayload?.establishment as Record<string, unknown>)?.google_maps_link as string | undefined;
    if (gmLink && !links.some((l) => l.platform === "google_maps")) {
      links.push({ platform: "google_maps", url: gmLink });
    }
    return links;
  }, [publicPayload?.establishment]);

  // Compute price range from menu items (Fix 8)
  const computedAvgPrice = React.useMemo(() => {
    if (menuFromDb.length === 0) return "";
    const prices: number[] = [];
    for (const cat of menuFromDb) {
      for (const item of cat.items) {
        if (!item.price) continue;
        const raw = String(item.price).replace(/[^\d.,]/g, "").replace(",", ".");
        const n = parseFloat(raw);
        if (Number.isFinite(n) && n > 0) prices.push(n);
      }
    }
    if (prices.length === 0) return "";
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return `${Math.round(min)} Dhs`;
    return `${Math.round(min)}-${Math.round(max)} Dhs`;
  }, [menuFromDb]);

  // --- Build highlights from DB (Fix 12) ---
  const dbHighlights: string[] = React.useMemo(() => {
    const est = publicPayload?.establishment as Record<string, unknown> | null | undefined;
    if (!est) return [];
    // highlights is a separate JSONB column now
    const hl = est.highlights;
    if (Array.isArray(hl)) return hl.filter((h): h is string => typeof h === "string" && h.length > 0);
    return [];
  }, [publicPayload?.establishment]);

  // --- Build neighborhood from DB (Fix 13) ---
  const dbNeighborhood: string | null = React.useMemo(() => {
    const est = publicPayload?.establishment as Record<string, unknown> | null | undefined;
    if (!est) return null;
    const n = est.neighborhood;
    return typeof n === "string" && n.length > 0 ? n : null;
  }, [publicPayload?.establishment]);

  // --- Build category from DB subcategory ---
  const dbCategory: string | null = React.useMemo(() => {
    const est = publicPayload?.establishment as Record<string, unknown> | null | undefined;
    if (!est) return null;
    const sub = est.subcategory;
    if (typeof sub === "string" && sub.length > 0 && sub !== "general") {
      // If subcategory contains "/", take the last part (e.g. "restaurant/méditerranéen" → "méditerranéen")
      const parts = sub.split("/");
      return parts[parts.length - 1].trim();
    }
    // Fallback to category field
    const cat = est.category;
    return typeof cat === "string" && cat.length > 0 ? cat : null;
  }, [publicPayload?.establishment]);

  // --- Build rating/reviewCount from DB (Fix 18) ---
  const dbRating: number = React.useMemo(() => {
    const est = publicPayload?.establishment as Record<string, unknown> | null | undefined;
    if (!est) return 0;
    const r = est.google_rating;
    return typeof r === "number" && Number.isFinite(r) ? r : 0;
  }, [publicPayload?.establishment]);

  const dbReviewCount: number = React.useMemo(() => {
    const est = publicPayload?.establishment as Record<string, unknown> | null | undefined;
    if (!est) return 0;
    const c = est.google_review_count;
    return typeof c === "number" && Number.isFinite(c) ? c : 0;
  }, [publicPayload?.establishment]);

  // --- Extract taxonomy data from DB for the Infos tab ---
  const dbTaxonomy = React.useMemo(() => {
    const est = publicPayload?.establishment as Record<string, unknown> | null | undefined;
    if (!est) return { subcategory: null, specialties: [], cuisineTypes: [], ambianceTags: [], tags: [], amenities: [] };
    const toArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
    return {
      subcategory: typeof est.subcategory === "string" && est.subcategory.length > 0 ? est.subcategory : null,
      specialties: toArr(est.specialties),
      cuisineTypes: toArr(est.cuisine_types),
      ambianceTags: toArr(est.ambiance_tags),
      tags: toArr(est.tags),
      amenities: toArr(est.amenities),
    };
  }, [publicPayload?.establishment]);

  // While the public API hasn't responded yet, use neutral placeholders instead of
  // demo/fallback data to prevent the "flash of demo content" (Fix 21 extended).
  // Once publicLoaded is true we know whether we got a real establishment or not.
  const hasDbData = publicLoaded && !!publicPayload?.establishment;
  const isDemo = publicLoaded && !publicPayload?.establishment;

  const restaurant: RestaurantData = {
    ...baseRestaurant,
    // Category: use subcategory from DB instead of random fallback
    category: hasDbData ? (dbCategory ?? baseRestaurant.category) : (!publicLoaded ? "" : baseRestaurant.category),
    // Name: use the title query-param as a neutral placeholder while loading
    name: hasDbData
      ? (publicPayload.establishment.name ?? baseRestaurant.name)
      : (searchParams.get("title") ?? baseRestaurant.name),
    address: hasDbData ? (publicPayload.establishment.address ?? "") : (!publicLoaded ? "" : baseRestaurant.address),
    phone: hasDbData ? (publicPayload.establishment.phone ?? "") : (!publicLoaded ? "" : baseRestaurant.phone),
    website: hasDbData ? (publicPayload.establishment.website ?? "") : (!publicLoaded ? "" : baseRestaurant.website),
    description: hasDbData
      ? (publicPayload.establishment.description_long ?? publicPayload.establishment.description_short ?? "")
      : (!publicLoaded ? "" : baseRestaurant.description),
    images: !publicLoaded ? [] : dbImages.length > 0 ? dbImages : (isDemo ? baseRestaurant.images : []),
    availableSlots: (publicPayload?.offers?.availableSlots as unknown as DateSlots[] | undefined) ?? (isDemo ? baseRestaurant.availableSlots : []),
    packs: packsFromDb.length ? packsFromDb : (isDemo ? baseRestaurant.packs : []),
    menu: menuFromDb.length > 0 ? menuFromDb : (isDemo ? baseRestaurant.menu : []),
    socialMedia: dbSocialMedia.length > 0 ? dbSocialMedia : (isDemo ? baseRestaurant.socialMedia : []),
    avgPrice: hasDbData ? (computedAvgPrice || "") : (!publicLoaded ? "" : baseRestaurant.avgPrice),
    // Fix 12: highlights from DB
    highlights: dbHighlights.length > 0 ? dbHighlights : (isDemo ? baseRestaurant.highlights : []),
    // Fix 13: neighborhood from DB
    neighborhood: hasDbData ? (dbNeighborhood ?? "") : (!publicLoaded ? "" : baseRestaurant.neighborhood),
    // Fix 18: rating from Google (0 if no data yet — never show demo rating)
    rating: hasDbData ? dbRating : (!publicLoaded ? 0 : baseRestaurant.rating),
    reviewCount: hasDbData ? dbReviewCount : (!publicLoaded ? 0 : baseRestaurant.reviewCount),
  };

  // Distance: use DB lat/lng if available, otherwise fallback to geocoding (Fix 9)
  const dbLat = publicPayload?.establishment?.lat;
  const dbLng = publicPayload?.establishment?.lng;
  const hasDbCoords = typeof dbLat === "number" && typeof dbLng === "number"
    && Number.isFinite(dbLat) && Number.isFinite(dbLng);
  const geocode = useGeocodedQuery(hasDbCoords ? "" : `${restaurant.name} ${restaurant.address}`);
  const restaurantCoords = hasDbCoords
    ? { lat: dbLat!, lng: dbLng! }
    : geocode.status === "success" ? geocode.coords : null;
  const distanceText =
    userLocation && restaurantCoords
      ? formatDistanceBetweenCoords(userLocation, restaurantCoords)
      : null;

  const normalizedAvailableSlots = React.useMemo(
    () => normalizeRestaurantAvailableSlots(restaurant.availableSlots),
    [restaurant.availableSlots],
  );

  React.useEffect(() => {
    const name = restaurant?.name?.trim();
    if (!name) return;

    const city = (publicPayload?.establishment?.city ?? "").trim();
    const title = city ? `${name} à ${city} — Sortir Au Maroc` : `${name} — Sortir Au Maroc`;
    const description = (restaurant.description ?? "").trim() || undefined;
    const ogImageUrl = restaurant.images?.[0] ? String(restaurant.images[0]) : undefined;

    applySeo({
      title,
      description,
      ogType: "restaurant",
      ogImageUrl,
      canonicalStripQuery: true,
      ...buildI18nSeoFields(locale),
    });

    const est = publicPayload?.establishment;
    if (est?.id) {
      const address = {
        "@type": "PostalAddress",
        streetAddress: est.address || undefined,
        addressLocality: est.city || undefined,
        addressRegion: est.region || undefined,
        postalCode: est.postal_code || undefined,
        addressCountry: est.country || undefined,
      };

      const geo =
        typeof est.lat === "number" && typeof est.lng === "number"
          ? { "@type": "GeoCoordinates", latitude: est.lat, longitude: est.lng }
          : undefined;

      const canonicalUrl = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const openingHoursSpecification = hoursToOpeningHoursSpecification(restaurant.hours);

      const schema = generateLocalBusinessSchema({
          name: est.name || name,
          url: canonicalUrl,
          telephone: est.phone || undefined,
          address: {
            streetAddress: est.address || undefined,
            addressLocality: est.city || undefined,
            addressRegion: est.region || undefined,
            postalCode: est.postal_code || undefined,
            addressCountry: est.country || "MA",
          },
          images: (restaurant.images ?? []).slice(0, 8),
          description: restaurant.description || undefined,
          priceRange: restaurant.avgPrice || undefined,
          openingHoursSpecification,
          aggregateRating: {
            ratingValue: restaurant.rating,
            reviewCount: restaurant.reviewCount,
          },
          geo:
            typeof est.lat === "number" && typeof est.lng === "number"
              ? { latitude: est.lat, longitude: est.lng }
              : undefined,
      });
      // Upgrade to Restaurant subtype + add reservation support
      (schema as any)["@type"] = "Restaurant";
      (schema as any).acceptsReservations = true;
      setJsonLd("restaurant", schema);

      setJsonLd(
        "breadcrumb",
        generateBreadcrumbSchema([
          { name: "Accueil", url: `${baseUrl}/` },
          { name: est.universe === "rentacar" ? "Location de voitures" : "Restaurants", url: `${baseUrl}/results?universe=${est.universe === "rentacar" ? "rentacar" : "restaurants"}` },
          { name: est.name || name, url: canonicalUrl },
        ]),
      );
    }

    return () => {
      clearJsonLd("restaurant");
      clearJsonLd("breadcrumb");
    };
  }, [restaurant.name, restaurant.description, restaurant.images?.[0], publicPayload?.establishment?.id, publicPayload?.establishment?.city]);

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <main className="container mx-auto px-4 py-10">
          <h1 className="text-2xl font-bold text-slate-900">{t("entity.establishment_not_found")}</h1>
          <p className="mt-2 text-slate-600">Ce lien n’est plus valide ou l’établissement n’existe pas.</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Button asChild className="bg-primary hover:bg-primary/90 text-white">
              <Link to="/results">Retour aux résultats</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Retour à l’accueil</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // --- Format Moroccan phone number (Fix 14) ---
  const formatMoroccanPhone = (raw: string): string => {
    if (!raw) return "";
    // Strip all non-digit except leading +
    const cleaned = raw.replace(/[^\d+]/g, "");
    let digits = cleaned.replace(/^\+/, "");

    // If starts with 212, keep as-is
    // If starts with 0, remove leading 0 and prepend 212
    // If starts with 5,6,7 (9 digits), prepend 212
    if (digits.startsWith("212")) {
      digits = digits.slice(3);
    } else if (digits.startsWith("0")) {
      digits = digits.slice(1);
    }
    // digits should now be 9 chars like 680481070
    if (digits.length === 9) {
      return `+212 ${digits[0]} ${digits.slice(1, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
    }
    // Fallback: return original with +212 prefix if not already
    if (cleaned.startsWith("+")) return raw;
    return `+212 ${raw}`;
  };

  const formattedPhone = formatMoroccanPhone(restaurant.phone);
  const phoneHref = `tel:+212${restaurant.phone.replace(/[^\d]/g, "").replace(/^(212|0)/, "")}`;

  // --- Full address with postal code + city (Fix 15) ---
  const fullAddress = React.useMemo(() => {
    const est = publicPayload?.establishment as Record<string, unknown> | null | undefined;
    const addr = restaurant.address || "";
    if (!est) return addr;
    const postalCode = typeof est.postal_code === "string" ? est.postal_code.trim() : "";
    const city = typeof est.city === "string" ? est.city.trim() : "";
    const suffix = [postalCode, city].filter(Boolean).join(" ");
    if (!suffix) return addr;
    // Avoid duplicating if address already contains city
    if (addr.toLowerCase().includes(city.toLowerCase()) && city.length > 2) return addr;
    return `${addr}, ${suffix}`;
  }, [restaurant.address, publicPayload?.establishment]);

  // --- Dynamic booking policies (Fix 16) ---
  const policies: string[] = React.useMemo(() => {
    const bp = publicPayload?.booking_policy as Record<string, unknown> | null | undefined;
    if (!bp) {
      // Fallback for establishments without booking policy
      return publicPayload?.establishment
        ? ["Veuillez contacter l'établissement pour les conditions de réservation."]
        : [
            "Arrivez 10 minutes avant le créneau.",
            "Annulation gratuite jusqu'à 6h avant.",
            "Merci de signaler allergies ou grossesse dans le message.",
          ];
    }
    const lines: string[] = [];
    // Cancellation policy
    if (bp.cancellation_enabled) {
      const hours = typeof bp.free_cancellation_hours === "number" ? bp.free_cancellation_hours : 6;
      const customText = typeof bp.cancellation_text_fr === "string" && bp.cancellation_text_fr.length > 0
        ? bp.cancellation_text_fr
        : null;
      lines.push(customText ?? `Annulation gratuite jusqu'à ${hours}h avant.`);
    }
    // Modification policy
    if (bp.modification_enabled) {
      const hours = typeof bp.modification_hours === "number" ? bp.modification_hours : 6;
      lines.push(`Modification possible jusqu'à ${hours}h avant.`);
    }
    // Custom policy text
    const customPolicy = typeof bp.policy_text_fr === "string" && bp.policy_text_fr.length > 0
      ? bp.policy_text_fr
      : null;
    if (customPolicy) lines.push(customPolicy);
    // Arrival time
    const arrivalMinutes = typeof bp.arrival_minutes_before === "number" ? bp.arrival_minutes_before : 10;
    if (arrivalMinutes > 0) {
      lines.push(`Arrivez ${arrivalMinutes} minutes avant le créneau.`);
    }
    // Fallback if no lines were generated
    if (lines.length === 0) {
      lines.push("Veuillez contacter l'établissement pour les conditions de réservation.");
    }
    return lines;
  }, [publicPayload?.booking_policy, publicPayload?.establishment]);

  const nextImage = () => {
    setCurrentImageIndex((prev) =>
      prev === restaurant.images.length - 1 ? 0 : prev + 1
    );
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? restaurant.images.length - 1 : prev - 1
    );
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    const minSwipeDistance = 50;

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0) {
        nextImage();
      } else {
        prevImage();
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    isDraggingRef.current = true;
    setMouseStartX(e.clientX);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const mouseEndX = e.clientX;
    const diff = mouseStartX - mouseEndX;
    const minSwipeDistance = 50;
    const wasDragged = Math.abs(diff) > minSwipeDistance;

    setIsDragging(false);
    isDraggingRef.current = wasDragged;

    if (wasDragged) {
      if (diff > 0) {
        nextImage();
      } else {
        prevImage();
      }
      requestAnimationFrame(() => { isDraggingRef.current = false; });
    }
  };

  const restaurantUrl = `${window.location.origin}/restaurant/${restaurantId}`;
  const shareText = `${restaurant.name} - ${restaurant.category} à ${restaurant.neighborhood}`;

  // Handle share button click - use native share if available (works on both mobile and macOS)
  const handleShareButtonClick = () => {
    // Check if Web Share API is available (mobile browsers + macOS Safari/Chrome)
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      // Call navigator.share immediately (synchronously) to satisfy iOS Safari's user gesture requirement
      navigator.share({
        title: restaurant.name,
        text: shareText,
        url: restaurantUrl,
      }).catch(() => {
        // User cancelled or error - do nothing, native share handles everything
      });
      return; // Always return after attempting native share - never show fallback menu
    }
    // Fallback for browsers without Web Share API (older desktop browsers)
    setShowShareMenu(!showShareMenu);
  };

  const handleShare = (platform: string) => {
    switch (platform) {
      case "facebook":
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(restaurantUrl)}`, "_blank", "width=600,height=400");
        break;
      case "twitter":
        window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(restaurantUrl)}&text=${encodeURIComponent(shareText)}`, "_blank", "width=600,height=400");
        break;
      case "whatsapp":
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText + " " + restaurantUrl)}`, "_blank");
        break;
      case "instagram":
        alert("Partagez manuellement sur Instagram ou utilisez le lien copié dans le presse-papiers.");
        break;
      case "tiktok":
        alert("Partagez manuellement sur TikTok ou utilisez le lien copié dans le presse-papiers.");
        break;
      case "snapchat":
        alert("Partagez manuellement sur Snapchat ou utilisez le lien copié dans le presse-papiers.");
        break;
      case "sms":
        window.open(`sms:?body=${encodeURIComponent(shareText + " " + restaurantUrl)}`);
        break;
      case "email":
        window.open(`mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(restaurantUrl)}`);
        break;
      case "copy":
        navigator.clipboard.writeText(restaurantUrl);
        alert("Lien copié dans le presse-papiers!");
        break;
    }
    setShowShareMenu(false);
  };




  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* Gallery */}
      <div
        className="relative bg-black h-80 md:h-96 overflow-hidden cursor-grab active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setIsDragging(false); isDraggingRef.current = false; }}
      >
        <img
          src={restaurant.images[currentImageIndex]}
          alt={restaurant.name}
          className="w-full h-full object-cover cursor-pointer"
          onClick={() => !isDraggingRef.current && setLightboxOpen(true)}
        />

        <IconButton onClick={prevImage} className="absolute start-4 top-1/2 -translate-y-1/2 z-10" aria-label="Image précédente">
          <ChevronLeft className="w-6 h-6" />
        </IconButton>
        <IconButton onClick={nextImage} className="absolute end-4 top-1/2 -translate-y-1/2 z-10" aria-label="Image suivante">
          <ChevronRight className="w-6 h-6" />
        </IconButton>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
          {currentImageIndex + 1} / {restaurant.images.length}
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-black/30 p-2 flex gap-2 overflow-x-auto">
          {restaurant.images && restaurant.images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => { setCurrentImageIndex(idx); setLightboxOpen(true); }}
              className={`h-12 w-12 rounded overflow-hidden flex-shrink-0 border-2 ${
                idx === currentImageIndex ? "border-white" : "border-transparent"
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>

        {/* Action Buttons Overlay */}
        <TooltipProvider>
          <div className="absolute top-4 end-4 flex gap-2 z-20">
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  onClick={() => {
                    // Check if user is authenticated before adding to favorites
                    if (!isAuthed()) {
                      openAuthModal();
                      return;
                    }

                    const estId = bookingEstablishmentId;
                    const estName = restaurant.name;
                    // Restaurant page is always kind "restaurant" (Hotel.tsx handles hotels)
                    const kind: FavoriteItem["kind"] = "restaurant";

                    if (isFavorited) {
                      removeFavorite({ kind, id: estId });
                    } else {
                      addFavorite({
                        kind,
                        id: estId,
                        title: estName,
                        createdAtIso: new Date().toISOString(),
                      });
                    }

                    setIsFavorited(!isFavorited);
                  }}
                  aria-label={isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
                >
                  <Heart className={`w-6 h-6 transition ${isFavorited ? "fill-red-500 text-red-500" : "text-slate-400"}`} />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
              </TooltipContent>
            </Tooltip>

            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    onClick={handleShareButtonClick}
                    aria-label="Partager"
                  >
                    <Share2 className="w-6 h-6 text-slate-400" />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Partager
                </TooltipContent>
              </Tooltip>

              {/* Share Menu - Desktop only (mobile uses native share) */}
              {showShareMenu && (
                <div className="absolute top-full end-0 mt-2 bg-white rounded-lg shadow-lg border border-slate-200 z-50 min-w-48">
                  <button onClick={() => handleShare("facebook")} className="w-full text-start px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                    f Facebook
                  </button>
                  <button onClick={() => handleShare("twitter")} className="w-full text-start px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                    𝕏 Twitter
                  </button>
                  <button onClick={() => handleShare("whatsapp")} className="w-full text-start px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                    💬 WhatsApp
                  </button>
                  <button onClick={() => handleShare("sms")} className="w-full text-start px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                    💬 SMS
                  </button>
                  <button onClick={() => handleShare("email")} className="w-full text-start px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                    ✉️ Email
                  </button>
                  <button onClick={() => handleShare("copy")} className="w-full text-start px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm border-t border-slate-200">
                    🔗 Copier le lien
                  </button>
                </div>
              )}
            </div>

            {/* Report button - discreet placement */}
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  onClick={() => {
                    if (!isAuthed()) {
                      openAuthModal();
                      return;
                    }
                    setShowReportDialog(true);
                  }}
                  aria-label={t("report.button_tooltip")}
                  className="opacity-60 hover:opacity-100"
                >
                  <Flag className="w-5 h-5 text-slate-400" />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Signaler
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {lightboxOpen && (
        <ImageLightbox
          images={restaurant.images}
          initialIndex={currentImageIndex}
          alt={restaurant.name}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* Report Dialog */}
      <ReportEstablishmentDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        establishmentId={bookingEstablishmentId}
        establishmentName={restaurant.name}
      />

      {/* Claim Establishment Dialog */}
      <ClaimEstablishmentDialog
        open={showClaimDialog}
        onOpenChange={setShowClaimDialog}
        establishmentId={bookingEstablishmentId}
        establishmentName={restaurant.name}
      />

      {/* Key Info Section */}
      <div className="bg-white px-4 py-2 md:px-6 md:py-3 border-b border-slate-100">
        <div className="container mx-auto">
          <div className="md:grid md:grid-cols-[1fr,380px] md:items-start md:gap-8">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{restaurant.name}</h1>
              {/* Rating: only show if we have a real rating (Fix 18) */}
              {restaurant.rating > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${
                          i < Math.floor(restaurant.rating) ? "fill-yellow-400 text-yellow-400" : "text-slate-300"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-bold text-sm">{restaurant.rating.toFixed(1)}</span>
                  <span className="text-xs text-slate-500">({restaurant.reviewCount} avis)</span>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
                <span className="px-3 py-1 bg-slate-100 rounded">{restaurant.category}</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {restaurant.neighborhood}
                </span>
                {distanceText ? (
                  <span className="flex items-center gap-1">
                    <span className="font-semibold">à {distanceText}</span>
                  </span>
                ) : null}
                {restaurant.avgPrice ? (
                  <span className="flex items-center gap-1">
                    <span className="font-semibold text-primary">{restaurant.avgPrice}</span>
                  </span>
                ) : null}
              </div>

              {!distanceText && geoStatus === "idle" ? (
                <button
                  type="button"
                  className="mt-2 text-xs text-slate-500 underline underline-offset-4 hover:text-slate-800"
                  onClick={requestUserLocation}
                >
                  Activer la géolocalisation pour voir la distance
                </button>
              ) : null}
            </div>

            <ReservationBanner
              className="mt-2 md:mt-0"
              establishmentId={bookingEstablishmentId}
              universe={isRentacar ? "rentacar" : "restaurants"}
              availableSlots={normalizedAvailableSlots}
              avgPriceLabel={restaurant.avgPrice || undefined}
              open={bookingOpen}
              onOpenChange={setBookingOpen}
              onViewMoreDates={() => setBookingOpen(true)}
              extraBookingQuery={{ title: restaurant.name }}
              bookingEnabled={hasEstablishmentEmail}
            />
          </div>
        </div>
      </div>

      <EstablishmentTabs universe={isRentacar ? "rentacar" : "restaurant"} />

      {/* Content Sections */}
      <main className="container mx-auto px-4 pt-6 pb-8 space-y-10">
        {/* CE Advantage — visible only to active CE employees */}
        <CeAdvantageSection establishmentId={bookingEstablishmentId} />

        <section id="section-menu" data-tab="menu" className="scroll-mt-28 space-y-4">
          <EstablishmentSectionHeading title={isRentacar ? "Nos véhicules" : "Menu"} />
          {isRentacar ? (
            <RentacarVehicleSection establishmentId={bookingEstablishmentId} />
          ) : (
            <MenuSection establishmentId={bookingEstablishmentId} categories={restaurant.menu || []} packs={restaurant.packs} legacyHours={restaurant.hours} />
          )}
        </section>

        <section id="section-avis" data-tab="avis" className="scroll-mt-28 space-y-6">
          {/* Published reviews from the database */}
          <EstablishmentReviewsSection establishmentId={bookingEstablishmentId} />
        </section>

        <section id="section-infos" data-tab="infos" className="scroll-mt-28 space-y-8">
          <EstablishmentSectionHeading title="Infos" />

          <section>
            <h3 className="text-lg font-extrabold text-foreground mb-3">À propos</h3>
            <p className="text-slate-700 leading-relaxed">{restaurant.description}</p>
          </section>

          <section>
            <h3 className="text-lg font-extrabold text-foreground mb-3">Points forts</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {restaurant.highlights &&
                restaurant.highlights.map((highlight, idx) => (
                  <div key={idx} className="px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-sm font-medium text-foreground">{highlight}</p>
                  </div>
                ))}
            </div>
          </section>

          <section>
            <h3 className="text-lg font-extrabold text-foreground mb-3">Informations pratiques</h3>
            <div className="space-y-4">
              <div className="flex gap-4 items-start pb-4 border-b">
                <Phone className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <p className="text-sm text-slate-600">Téléphone</p>
                  <a
                    href={phoneHref}
                    className="font-medium text-primary hover:text-primary/70 transition"
                  >
                    {formattedPhone}
                  </a>
                </div>
              </div>
              <div className="flex gap-4 items-start pb-4 border-b">
                <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <p className="text-sm text-slate-600">Adresse</p>
                  <a
                    href={(publicPayload?.establishment?.social_links as Record<string, string> | null)?.waze || `https://waze.com/ul?q=${encodeURIComponent(fullAddress)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:text-primary/70 transition"
                  >
                    {fullAddress}
                  </a>
                </div>
              </div>
              <div className="flex gap-4 items-start pb-4 border-b">
                <Globe className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <p className="text-sm text-slate-600">Site web</p>
                  <p className="font-medium text-primary">{restaurant.website}</p>
                </div>
              </div>
              {/* --- Taxonomy tags by category --- */}
              {(() => {
                const sections: { label: string; color: string; items: string[] }[] = [];
                // Catégorie principale (subcategory)
                if (dbTaxonomy.subcategory) {
                  sections.push({ label: "Catégorie", color: "bg-primary/10 text-primary", items: [dbTaxonomy.subcategory] });
                }
                if (dbTaxonomy.cuisineTypes.length > 0) {
                  sections.push({ label: "Type de cuisine", color: "bg-orange-50 text-orange-700", items: dbTaxonomy.cuisineTypes });
                }
                if (dbTaxonomy.specialties.length > 0) {
                  sections.push({ label: "Spécialités", color: "bg-emerald-50 text-emerald-700", items: dbTaxonomy.specialties });
                }
                if (dbTaxonomy.ambianceTags.length > 0) {
                  sections.push({ label: "Ambiance", color: "bg-violet-50 text-violet-700", items: dbTaxonomy.ambianceTags });
                }
                if (dbTaxonomy.tags.length > 0) {
                  sections.push({ label: "Tags", color: "bg-sky-50 text-sky-700", items: dbTaxonomy.tags });
                }
                if (dbTaxonomy.amenities.length > 0) {
                  sections.push({ label: "Équipements", color: "bg-slate-100 text-slate-600", items: dbTaxonomy.amenities });
                }
                // Fallback: si pas de données DB, afficher l'ancien format
                if (sections.length === 0 && (restaurant.category || restaurant.taxonomy?.length)) {
                  return (
                    <div className="flex gap-4 items-start pb-4 border-b">
                      <Tag className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      <div className="w-full">
                        <p className="text-sm text-slate-600 mb-3">Tag</p>
                        <div className="flex gap-2 flex-wrap">
                          {restaurant.category && (
                            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">{restaurant.category}</span>
                          )}
                          {restaurant.taxonomy?.map((item, idx) => (
                            <span key={idx} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">{item}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }
                return sections.length > 0 ? (
                  <div className="flex gap-4 items-start pb-4 border-b">
                    <Tag className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                    <div className="w-full space-y-3">
                      {sections.map((section) => (
                        <div key={section.label}>
                          <p className="text-sm text-slate-500 mb-1.5">{section.label}</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {section.items.map((item) => (
                              <span key={item} className={`px-2.5 py-1 rounded-full text-xs font-medium ${section.color}`}>
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              <div className="flex gap-4 items-start pb-4 border-b">
                <Clock className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                <div className="w-full">
                  <p className="text-sm text-slate-600 mb-2">Politique</p>
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {policies.map((p) => (
                      <li key={p} className="flex items-start gap-2">
                        <span className="mt-0.5 text-primary">•</span>
                        <span className="min-w-0">{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <Share2 className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                <div className="w-full">
                  <p className="text-sm text-slate-600 mb-3">Réseaux sociaux</p>
                  <div className="flex gap-4 flex-wrap">
                    {restaurant.socialMedia &&
                      restaurant.socialMedia
                        .filter((s) => s.platform !== "google_maps" && s.platform !== "tripadvisor" && s.platform !== "waze")
                        .map((social) => {

                        return (
                          <a
                            key={social.platform}
                            href={social.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-slate-100 rounded-lg transition"
                            title={social.platform}
                          >
                            {getSocialIcon(social.platform, "w-6 h-6 text-primary hover:text-primary/70 transition")}
                          </a>
                        );
                      })}
                    {/* Google Maps link from social_links */}
                    {restaurant.socialMedia?.find((s) => s.platform === "google_maps" && s.url) && (
                      <a
                        href={restaurant.socialMedia.find((s) => s.platform === "google_maps")!.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 hover:bg-slate-100 rounded-lg transition"
                        title="Google Maps"
                      >
                        <img src={GOOGLE_MAPS_LOGO_URL} alt="Google Maps" className="h-7 w-auto" />
                      </a>
                    )}
                    {/* TripAdvisor link from social_links */}
                    {restaurant.socialMedia?.find((s) => s.platform === "tripadvisor" && s.url) && (
                      <a
                        href={restaurant.socialMedia.find((s) => s.platform === "tripadvisor")!.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 hover:bg-slate-100 rounded-lg transition"
                        title="TripAdvisor"
                      >
                        <img src={TRIPADVISOR_LOGO_URL} alt="TripAdvisor" className="h-7 w-auto" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Claim Establishment Section */}
          <section className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-semibold text-primary uppercase tracking-wide">C'EST VOTRE ENTREPRISE ?</p>
                <p className="text-sm text-slate-600">Revendiquez cette fiche pour gérer vos informations et accéder à votre espace professionnel.</p>
              </div>
              <Button
                variant="outline"
                className="border-primary text-primary hover:bg-primary/10 whitespace-nowrap rounded-lg"
                onClick={() => setShowClaimDialog(true)}
              >
                Revendiquer cette fiche
              </Button>
            </div>
          </section>
        </section>

        <section id="section-horaires" data-tab="horaires" className="scroll-mt-28 space-y-6">
          <EstablishmentSectionHeading title="Horaires" />
          <OpeningHoursBlock
            openingHours={publicPayload?.establishment?.hours as any}
            legacyHours={!publicPayload?.establishment?.hours ? restaurant.hours : undefined}
          />
        </section>

        <section id="section-carte" data-tab="carte" className="scroll-mt-28 space-y-4">
          <EstablishmentSectionHeading title="Carte" />

          <div className="flex gap-3 flex-wrap">
            <a
              href={(publicPayload?.establishment?.social_links as Record<string, string> | null)?.waze || `https://waze.com/ul?q=${encodeURIComponent(restaurant.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-32 px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-semibold hover:bg-slate-50 transition text-center flex items-center justify-center gap-2"
            >
              <img src={WAZE_LOGO_URL} alt="Waze" className="h-8 w-auto" />
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${restaurant.name} ${restaurant.address}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-32 px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-semibold hover:bg-slate-50 transition text-center flex items-center justify-center gap-2"
            >
              <img src={GOOGLE_MAPS_LOGO_URL} alt="Google Maps" className="h-8 w-auto" />
            </a>
          </div>

          <RestaurantMap
            query={`${restaurant.name} ${restaurant.address}`}
            name={restaurant.name}
            lat={publicPayload?.establishment?.lat}
            lng={publicPayload?.establishment?.lng}
          />
        </section>
      </main>

    </div>
  );
}
