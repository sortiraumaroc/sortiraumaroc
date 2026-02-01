import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  Aperture,
  ChevronLeft,
  ChevronRight,
  Clock,
  Facebook,
  Flag,
  Globe,
  Heart,
  Instagram,
  MapPin,
  Music,
  Phone,
  Share2,
  Star,
  Tag,
  Twitter,
  Youtube,
} from "lucide-react";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useGeocodedQuery } from "@/hooks/useGeocodedQuery";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useTrackEstablishmentVisit } from "@/hooks/useTrackEstablishmentVisit";
import { formatDistanceBetweenCoords } from "@/lib/geo";
import { getPublicEstablishment, type PublicOfferPack } from "@/lib/publicApi";
import { isAuthed, openAuthModal } from "@/lib/auth";
import { isUuid } from "@/lib/pro/visits";
import { ReservationBanner } from "@/components/booking/ReservationBanner";
import { OpeningHoursBlock } from "@/components/restaurant/OpeningHoursBlock";
import { MenuSection } from "@/components/restaurant/MenuSection";
import { RestaurantMap } from "@/components/restaurant/RestaurantMap";
import type { Pack } from "@/components/restaurant/MenuSection";
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
import { GOOGLE_MAPS_LOGO_URL, WAZE_LOGO_URL } from "@/lib/mapAppLogos";
import { applySeo, clearJsonLd, setJsonLd, generateLocalBusinessSchema, hoursToOpeningHoursSpecification } from "@/lib/seo";
import { useI18n } from "@/lib/i18n";
import { EstablishmentTabs } from "@/components/establishment/EstablishmentTabs";
import { EstablishmentSectionHeading } from "@/components/establishment/EstablishmentSectionHeading";
import { EstablishmentReviewsSection } from "@/components/EstablishmentReviewsSection";
import { ReportEstablishmentDialog } from "@/components/ReportEstablishmentDialog";

interface RestaurantReview {
  id: number;
  author: string;
  rating: number;
  date: string;
  text: string;
  helpful: number;
}

type MenuItemBadge =
  | "Best seller"
  | "New"
  | "Chef selection"
  | "Nouveau"
  | "Spécialité"
  | "Spécialité du Chef";

interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: string;
  badge?: MenuItemBadge;
}

interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

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
      }
    };

    void resolve();

    return () => {
      active = false;
    };
  }, [id, title]);

  const { t } = useI18n();
  const [bookingOpen, setBookingOpen] = React.useState(false);


  const restaurantId = id ?? "1";
  const bookingEstablishmentId = publicPayload?.establishment?.id ?? canonicalEstablishmentId ?? restaurantId;
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

  const dbCover = publicPayload?.establishment?.cover_url ? [publicPayload.establishment.cover_url] : [];
  const dbGallery = Array.isArray(publicPayload?.establishment?.gallery_urls) ? publicPayload!.establishment.gallery_urls : [];
  const dbImages = [...dbCover, ...dbGallery].filter((u): u is string => Boolean(u && typeof u === "string"));

  const restaurant: RestaurantData = {
    ...baseRestaurant,
    name: publicPayload?.establishment?.name ?? baseRestaurant.name,
    address: publicPayload?.establishment?.address ?? baseRestaurant.address,
    phone: publicPayload?.establishment?.phone ?? baseRestaurant.phone,
    website: publicPayload?.establishment?.website ?? baseRestaurant.website,
    description:
      publicPayload?.establishment?.description_short ??
      publicPayload?.establishment?.description_long ??
      baseRestaurant.description,
    images: dbImages.length ? dbImages : baseRestaurant.images,
    availableSlots: (publicPayload?.offers?.availableSlots as unknown as DateSlots[] | undefined) ?? baseRestaurant.availableSlots,
    packs: packsFromDb.length ? packsFromDb : baseRestaurant.packs,
  };

  React.useEffect(() => {
    const name = restaurant?.name?.trim();
    if (!name) return;

    const city = (publicPayload?.establishment?.city ?? "").trim();
    const title = city ? `${name} à ${city} — Sortir Au Maroc` : `${name} — Sortir Au Maroc`;
    const description = (restaurant.description ?? "").trim() || undefined;
    const ogImageUrl = restaurant.images?.[0] ? String(restaurant.images[0]) : undefined;

    const canonicalUrl = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const pathname = typeof window !== "undefined" ? window.location.pathname : "/";

    applySeo({
      title,
      description,
      ogType: "restaurant",
      ogImageUrl,
      canonicalUrl,
      canonicalStripQuery: true,
      hreflangs: baseUrl
        ? {
            fr: `${baseUrl}${pathname}`,
            en: `${baseUrl}/en${pathname}`,
            "x-default": `${baseUrl}${pathname}`,
          }
        : undefined,
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
      const openingHoursSpecification = hoursToOpeningHoursSpecification(restaurant.hours);

      setJsonLd(
        "restaurant",
        generateLocalBusinessSchema({
          name: est.name || name,
          url: canonicalUrl,
          telephone: est.phone || undefined,
          address: {
            streetAddress: est.address || undefined,
            addressLocality: est.city || undefined,
            addressRegion: est.region || undefined,
            postalCode: est.postal_code || undefined,
            addressCountry: est.country || undefined,
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
        }),
      );
    }

    return () => {
      clearJsonLd("restaurant");
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

  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);
  const [isFavorited, setIsFavorited] = React.useState(false);

  const [showShareMenu, setShowShareMenu] = React.useState(false);
  const [showReportDialog, setShowReportDialog] = React.useState(false);
  const [touchStartX, setTouchStartX] = React.useState(0);
  const [mouseStartX, setMouseStartX] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);

  const { status: geoStatus, location: userLocation, request: requestUserLocation } = useUserLocation();
  const geocode = useGeocodedQuery(`${restaurant.name} ${restaurant.address}`);
  const distanceText =
    userLocation && geocode.status === "success"
      ? formatDistanceBetweenCoords(userLocation, geocode.coords)
      : null;

  const normalizedAvailableSlots = React.useMemo(
    () => normalizeRestaurantAvailableSlots(restaurant.availableSlots),
    [restaurant.availableSlots],
  );

  const policies = [
    "Arrivez 10 minutes avant le créneau.",
    "Annulation gratuite jusqu’à 6h avant.",
    "Merci de signaler allergies ou grossesse dans le message.",
  ];

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
    setMouseStartX(e.clientX);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    setIsDragging(false);
    const mouseEndX = e.clientX;
    const diff = mouseStartX - mouseEndX;
    const minSwipeDistance = 50;

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0) {
        nextImage();
      } else {
        prevImage();
      }
    }
  };

  const restaurantUrl = `${window.location.origin}/restaurant/${restaurantId}`;
  const shareText = `${restaurant.name} - ${restaurant.category} à ${restaurant.neighborhood}`;

  // Check if we're on mobile (touch device or small screen)
  const isMobileDevice = () => {
    return (
      typeof navigator !== "undefined" &&
      (navigator.maxTouchPoints > 0 || window.matchMedia("(max-width: 768px)").matches)
    );
  };

  // Native share for mobile devices
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: restaurant.name,
          text: shareText,
          url: restaurantUrl,
        });
      } catch (err) {
        // User cancelled or error - fallback to menu
        if ((err as Error).name !== "AbortError") {
          setShowShareMenu(true);
        }
      }
    } else {
      setShowShareMenu(true);
    }
  };

  // Handle share button click - use native share if available, otherwise show menu
  const handleShareButtonClick = () => {
    // Always try native share first if available (works on mobile Safari, Chrome, etc.)
    if (navigator.share) {
      handleNativeShare();
    } else {
      setShowShareMenu(!showShareMenu);
    }
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
        onMouseLeave={() => setIsDragging(false)}
      >
        <img
          src={restaurant.images[currentImageIndex]}
          alt={restaurant.name}
          className="w-full h-full object-cover"
        />

        <IconButton onClick={prevImage} className="absolute left-4 top-1/2 -translate-y-1/2 z-10" aria-label="Image précédente">
          <ChevronLeft className="w-6 h-6" />
        </IconButton>
        <IconButton onClick={nextImage} className="absolute right-4 top-1/2 -translate-y-1/2 z-10" aria-label="Image suivante">
          <ChevronRight className="w-6 h-6" />
        </IconButton>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
          {currentImageIndex + 1} / {restaurant.images.length}
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-black/30 p-2 flex gap-2 overflow-x-auto">
          {restaurant.images && restaurant.images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentImageIndex(idx)}
              className={`h-12 w-12 rounded overflow-hidden flex-shrink-0 border-2 ${
                idx === currentImageIndex ? "border-white" : "border-transparent"
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>

        {/* Action Buttons Overlay */}
        <div className="absolute top-4 right-4 flex gap-2 z-20">
          <IconButton
            onClick={() => {
              // Check if user is authenticated before adding to favorites
              if (!isAuthed()) {
                openAuthModal();
                return;
              }
              setIsFavorited(!isFavorited);
            }}
            aria-label={isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
          >
            <Heart className={`w-6 h-6 transition ${isFavorited ? "fill-red-500 text-red-500" : "text-slate-400"}`} />
          </IconButton>
          <div className="relative">
            <IconButton
              onClick={handleShareButtonClick}
              aria-label="Partager"
            >
              <Share2 className="w-6 h-6 text-slate-400" />
            </IconButton>

            {/* Share Menu - Desktop only (mobile uses native share) */}
            {showShareMenu && (
              <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-lg border border-slate-200 z-50 min-w-48">
                <button onClick={() => handleShare("facebook")} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                  f Facebook
                </button>
                <button onClick={() => handleShare("twitter")} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                  𝕏 Twitter
                </button>
                <button onClick={() => handleShare("whatsapp")} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                  💬 WhatsApp
                </button>
                <button onClick={() => handleShare("sms")} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                  💬 SMS
                </button>
                <button onClick={() => handleShare("email")} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                  ✉️ Email
                </button>
                <button onClick={() => handleShare("copy")} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm border-t border-slate-200">
                  🔗 Copier le lien
                </button>
              </div>
            )}
          </div>
          {/* Report button - discreet placement */}
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
        </div>
      </div>

      {/* Report Dialog */}
      <ReportEstablishmentDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        establishmentId={establishmentId}
        establishmentName={restaurant.name}
      />

      {/* Key Info Section */}
      <div className="bg-white px-4 py-2 md:px-6 md:py-3 border-b border-slate-100">
        <div className="container mx-auto">
          <div className="md:grid md:grid-cols-[1fr,380px] md:items-start md:gap-8">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{restaurant.name}</h1>
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

              <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
                <span className="px-3 py-1 bg-slate-100 rounded">{restaurant.category}</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {restaurant.neighborhood}
                </span>
                {distanceText ? (
                  <span className="flex items-center gap-1">
                    <span className="font-semibold">{distanceText}</span>
                  </span>
                ) : null}
                <span className="flex items-center gap-1">
                  <span className="font-semibold text-primary">{restaurant.avgPrice}</span>
                </span>
              </div>

              {!distanceText && geoStatus !== "available" ? (
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
              universe="restaurants"
              availableSlots={normalizedAvailableSlots}
              avgPriceLabel={restaurant.avgPrice}
              open={bookingOpen}
              onOpenChange={setBookingOpen}
              onViewMoreDates={() => setBookingOpen(true)}
              extraBookingQuery={{ title: restaurant.name }}
            />
          </div>
        </div>
      </div>

      <EstablishmentTabs universe="restaurant" />

      {/* Content Sections */}
      <main className="container mx-auto px-4 pt-6 pb-8 space-y-10">
        <section id="section-menu" data-tab="menu" className="scroll-mt-28 space-y-4">
          <EstablishmentSectionHeading title="Menu" />
          <MenuSection establishmentId={bookingEstablishmentId} categories={restaurant.menu || []} packs={restaurant.packs} legacyHours={restaurant.hours} />
        </section>

        <section id="section-avis" data-tab="avis" className="scroll-mt-28 space-y-6">
          {/* Published reviews from the database */}
          <EstablishmentReviewsSection establishmentId={establishmentId} />
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
                    href={`tel:${restaurant.phone.replace(/\s+/g, "")}`}
                    className="font-medium text-primary hover:text-primary/70 transition"
                  >
                    {restaurant.phone}
                  </a>
                </div>
              </div>
              <div className="flex gap-4 items-start pb-4 border-b">
                <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <p className="text-sm text-slate-600">Adresse</p>
                  <a
                    href={`https://waze.com/ul?q=${encodeURIComponent(restaurant.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:text-primary/70 transition"
                  >
                    {restaurant.address}
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
              <div className="flex gap-4 items-start pb-4 border-b">
                <Tag className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                <div className="w-full">
                  <p className="text-sm text-slate-600 mb-3">Tag</p>
                  <div className="flex gap-2 flex-wrap">
                    {restaurant.category ? (
                      <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">{restaurant.category}</span>
                    ) : null}
                    {restaurant.taxonomy &&
                      restaurant.taxonomy.map((item, idx) => (
                        <span key={idx} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                          {item}
                        </span>
                      ))}
                  </div>
                </div>
              </div>

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
                      restaurant.socialMedia.map((social) => {
                        const getSocialIcon = (platform: string) => {
                          const iconProps = "w-6 h-6 text-primary hover:text-primary/70 transition";
                          switch (platform) {
                            case "facebook":
                              return <Facebook className={iconProps} />;
                            case "instagram":
                              return <Instagram className={iconProps} />;
                            case "twitter":
                              return <Twitter className={iconProps} />;
                            case "tiktok":
                              return <Music className={iconProps} />;
                            case "snapchat":
                              return <Aperture className={iconProps} />;
                            case "youtube":
                              return <Youtube className={iconProps} />;
                            default:
                              return null;
                          }
                        };

                        return (
                          <a
                            key={social.platform}
                            href={social.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-slate-100 rounded-lg transition"
                            title={social.platform}
                          >
                            {getSocialIcon(social.platform)}
                          </a>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </section>

        <section id="section-horaires" data-tab="horaires" className="scroll-mt-28 space-y-6">
          <EstablishmentSectionHeading title="Horaires" />
          <OpeningHoursBlock legacyHours={restaurant.hours} />
        </section>

        <section id="section-carte" data-tab="carte" className="scroll-mt-28 space-y-4">
          <EstablishmentSectionHeading title="Carte" />

          <div className="flex gap-3 flex-wrap">
            <a
              href={`https://waze.com/ul?q=${encodeURIComponent(restaurant.address)}`}
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

          <RestaurantMap query={`${restaurant.name} ${restaurant.address}`} name={restaurant.name} />
        </section>
      </main>

    </div>
  );
}
