import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  Globe,
  MapPin,
  Phone,
  Share2,
  Shield,
  Star,
  Timer,
} from "lucide-react";
import { getSocialIcon } from "@/components/ui/SocialIcons";

import { Header } from "@/components/Header";
import type { DateSlots } from "@/components/booking/StickyBottomBookingActionBar";
import { ReservationBanner } from "@/components/booking/ReservationBanner";
import { HotelGallery } from "@/components/hotel/HotelGallery";
import { OpeningHoursBlock } from "@/components/restaurant/OpeningHoursBlock";
import { Button } from "@/components/ui/button";
import { LoisirTreatmentsTab, type LoisirTreatment } from "@/components/loisir/LoisirTreatmentsTab";
import { cn } from "@/lib/utils";
import { EstablishmentTabs } from "@/components/establishment/EstablishmentTabs";
import { CeAdvantageSection } from "@/components/ce/CeAdvantageSection";
import { createRng, makeImageSet, makePhoneMa, makeWebsiteUrl, nextDaysYmd, pickMany, pickOne } from "@/lib/mockData";
import { makeLegacyHoursPreset } from "@/lib/openingHoursPresets";
import { GOOGLE_MAPS_LOGO_URL, WAZE_LOGO_URL } from "@/lib/mapAppLogos";
import { useGeocodedQuery } from "@/hooks/useGeocodedQuery";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useTrackEstablishmentVisit } from "@/hooks/useTrackEstablishmentVisit";
import { formatDistanceBetweenCoords } from "@/lib/geo";
import { getPublicEstablishment } from "@/lib/publicApi";
import { isAuthed, openAuthModal } from "@/lib/auth";
import { ReportEstablishmentDialog } from "@/components/ReportEstablishmentDialog";
import { applySeo, clearJsonLd, setJsonLd, generateLocalBusinessSchema, generateBreadcrumbSchema, hoursToOpeningHoursSpecification, buildI18nSeoFields } from "@/lib/seo";
import { useI18n } from "@/lib/i18n";

type TabId = "info" | "treatments" | "slots" | "reviews" | "horaires" | "map";

type Review = {
  id: string;
  author: string;
  rating: number;
  date: string;
  text: string;
};

type Slot = { label: string; times: string[]; durationLabel: string; fromMad: number };

type SocialMediaPlatform = "instagram" | "facebook" | "tiktok" | "youtube" | "twitter";

type SocialMediaLink = {
  platform: SocialMediaPlatform;
  url: string;
};

type LoisirData = {
  id: string;
  name: string;
  category: string;
  city: string;
  neighborhood: string;
  address: string;
  phone: string;
  website: string;
  rating: number;
  reviewCount: number;
  description: string;
  highlights: string[];
  images: string[];
  meetingPoint: string;
  safety: string[];
  treatments: LoisirTreatment[];
  slots: Slot[];
  hours: Record<string, { lunch?: string; dinner?: string; closed?: boolean }>;
  policies: string[];
  reviews: Review[];
  socialMedia: SocialMediaLink[];
  mapQuery: string;
};

function buildMapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildMapsEmbedUrl(query: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function buildWazeUrl(query: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clampRating(r: number): number {
  if (!Number.isFinite(r)) return 0;
  return Math.max(0, Math.min(5, r));
}

function slugFromName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  return slug || "sortiraumaroc";
}

function sanitizeUrl(url: string): string {
  const value = url.trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("//")) return `https:${value}`;
  return `https://${value}`;
}

function normalizeSocialPlatform(value: string): SocialMediaPlatform | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === "instagram" || v === "ig" || v === "insta") return "instagram";
  if (v === "facebook" || v === "fb") return "facebook";
  if (v === "tiktok" || v === "tt" || v === "tik-tok" || v === "tik tok") return "tiktok";
  if (v === "youtube" || v === "yt") return "youtube";
  if (v === "twitter" || v === "x") return "twitter";
  return null;
}

function platformLabel(platform: SocialMediaPlatform): string {
  switch (platform) {
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "tiktok":
      return "TikTok";
    case "youtube":
      return "YouTube";
    case "twitter":
      return "X";
  }
}

function SocialIcon({ platform, className }: { platform: SocialMediaPlatform; className?: string }) {
  return getSocialIcon(platform, cn("h-6 w-6", className));
}

const LOISIR_DETAILS: Record<string, LoisirData> = {
  "201": {
    id: "201",
    name: "Quad à Agafay — Sunset Ride",
    category: "Aventure",
    city: "Marrakech",
    neighborhood: "Désert d’Agafay",
    address: "Agafay Desert Camp Area, Marrakech",
    phone: "+212 5 24 00 11 22",
    website: "https://example.com/quad-agafay",
    rating: 4.9,
    reviewCount: 312,
    description:
      "Une expérience quad encadrée dans le désert d’Agafay, idéale en fin d’après-midi pour profiter du coucher du soleil. Briefing sécurité, équipement et guide inclus. Parcours adapté aux débutants avec sections plus sportives pour les confirmés.",
    highlights: [
      "Départ garanti et guide francophone",
      "Casque + lunettes fournis",
      "Parcours panoramique + arrêt photo",
      "Option thé marocain au camp",
      "Convient aux débutants",
      "Réservation rapide (créneaux)"
    ],
    images: [
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F6c79d7ff2ad6489d8149ebb4fedfb7bd?format=webp&width=1200",
      "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1523413651479-597eb2da0ad6?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&h=800&fit=crop",
    ],
    meetingPoint: "Parking Agafay Experience (coordonnées envoyées après réservation)",
    safety: [
      "Briefing obligatoire avant départ",
      "Casque et lunettes fournis",
      "Permis non requis — conduite encadrée",
      "Déconseillé aux femmes enceintes",
      "Chaussures fermées recommandées",
    ],
    treatments: [
      { category: "Packs", title: "Pack Buggy + Quad (combo)", duration: "2h", priceMad: 1190, note: "Best-seller" },
      { category: "Packs", title: "Pack Quad sunset + thé au camp", duration: "1h30", priceMad: 990, note: "Coucher du soleil" },
      { category: "Packs", title: "Pack Famille (quad enfant + chameau)", duration: "1h", priceMad: 690, note: "Famille" },

      { category: "Buggy", title: "Buggy 2 places — découverte", duration: "1h", priceMad: 750, note: "2 places" },
      { category: "Buggy", title: "Buggy 2 places — aventure", duration: "2h", priceMad: 1190, note: "2 places" },
      { category: "Buggy", title: "Buggy 4 places — aventure", duration: "2h", priceMad: 1590, note: "4 places" },

      { category: "Quad", title: "Quad — initiation", duration: "1h", priceMad: 390, note: "Débutants" },
      { category: "Quad", title: "Quad — aventure", duration: "1h30", priceMad: 490 },
      { category: "Quad", title: "Quad — circuit extrême", duration: "2h", priceMad: 690, note: "Confirmés" },

      { category: "Motocross", title: "Motocross — initiation", duration: "30 min", priceMad: 350, note: "Dès 16 ans" },
      { category: "Motocross", title: "Motocross — session", duration: "60 min", priceMad: 590, note: "Confirmés" },

      { category: "Enfants", title: "Quad enfant", duration: "15 min", priceMad: 150, note: "6-12 ans" },
      { category: "Enfants", title: "Quad enfant", duration: "30 min", priceMad: 250, note: "6-12 ans" },

      { category: "Balades", title: "Balade à cheval", duration: "1h", priceMad: 450, note: "Sunset" },
      { category: "Balades", title: "Balade à chameau", duration: "45 min", priceMad: 350 },

      { category: "Options", title: "Transfert A/R Marrakech", duration: "Selon zone", priceMad: 150, note: "Sur demande" },
      { category: "Options", title: "Photos/vidéo (GoPro)", duration: "Pendant l’activité", priceMad: 120 },
    ],
    slots: [
      { label: "Aujourd’hui", times: ["14:00", "15:00", "16:00", "17:00"], durationLabel: "1h30", fromMad: 490 },
      { label: "Demain", times: ["10:00", "11:00", "14:00", "16:00"], durationLabel: "1h30", fromMad: 490 },
    ],
    hours: makeLegacyHoursPreset("daytime"),
    policies: [
      "Annulation gratuite jusqu’à 24h avant.",
      "Pièce d’identité requise au départ.",
      "En cas de météo extrême, report prioritaire proposé.",
    ],
    reviews: [
      { id: "l1", author: "Hamza", rating: 5, date: "2025-11-02", text: "Super organisation, guide pro, paysages magnifiques. À faire au coucher du soleil !" },
      { id: "l2", author: "Meriem", rating: 5, date: "2025-10-15", text: "Très fun, sécurisé, et l’arrêt photo est top. On a pris l’option thé au camp." },
      { id: "l3", author: "Bilal", rating: 4, date: "2025-09-28", text: "Expérience géniale, un peu poussiéreux (normal). Prévoyez un foulard !" },
    ],
    socialMedia: [
      { platform: "instagram", url: "https://instagram.com/quadagafay" },
      { platform: "facebook", url: "https://facebook.com/quadagafay" },
    ],
    mapQuery: "Agafay Desert Marrakech",
  },
};

function buildFallbackLoisir(args: { id: string; name: string; category?: string; location?: string; city?: string }): LoisirData {
  const rng = createRng(`loisir-${args.id}-${args.name}`);
  const city = args.city ?? "Marrakech";
  const neighborhood = args.location ?? pickOne(rng, ["Médina", "Agafay", "Imlil", "Essaouira", "Taghazout", "Saidia"] as const);
  const category = args.category ?? pickOne(rng, ["Aventure", "Nautique", "Nature", "Extrême", "Découverte"] as const);

  const rating = clampRating(4.2 + rng() * 0.7);
  const reviewCount = Math.floor(70 + rng() * 700);
  const phone = makePhoneMa(rng);
  const website = makeWebsiteUrl(args.name);

  const images = makeImageSet(rng, "loisir");

  const highlights = pickMany(
    rng,
    [
      "Guide professionnel et briefing sécurité",
      "Arrêts photo panoramiques",
      "Matériel inclus selon l’activité",
      "Petits groupes pour plus de confort",
      "Idéal en couple ou entre amis",
      "Confirmation rapide après réservation",
      "Option transfert disponible (selon zone)",
      "Accessible aux débutants",
      "Expérience authentique",
    ] as const,
    6,
  );

  const safety = pickMany(
    rng,
    [
      "Briefing obligatoire avant départ",
      "Équipement fourni",
      "Respect des consignes du guide",
      "Chaussures fermées recommandées",
      "Déconseillé en cas de condition médicale spécifique",
    ] as const,
    5,
  );

  const policies = [
    "Annulation gratuite jusqu’à 24h avant.",
    "Arrivez 10 minutes avant l’horaire.",
    "En cas de météo extrême, un report est proposé.",
  ];

  const slots: Slot[] = [
    { label: "Aujourd’hui", times: ["10:00", "11:00", "14:00", "16:00"], durationLabel: pickOne(rng, ["1h", "1h30", "2h"] as const), fromMad: Math.floor(250 + rng() * 900) },
    { label: "Demain", times: ["09:30", "11:30", "15:00", "17:00"], durationLabel: pickOne(rng, ["1h", "1h30", "2h"] as const), fromMad: Math.floor(250 + rng() * 900) },
  ];

  const slotBasePrice = (() => {
    const prices = slots.map((s) => s.fromMad).filter((p) => Number.isFinite(p) && p > 0);
    return prices.length ? Math.min(...prices) : 300;
  })();

  const treatments: LoisirTreatment[] = [
    {
      category: "Packs",
      title: "Pack Buggy + Quad (combo)",
      duration: "2h",
      priceMad: Math.round(slotBasePrice * 2.6),
      note: "Best-seller",
    },
    {
      category: "Packs",
      title: "Pack Quad sunset + thé au camp",
      duration: "1h30",
      priceMad: Math.round(slotBasePrice * 2.2),
      note: "Coucher du soleil",
    },
    {
      category: "Packs",
      title: "Pack Famille (quad enfant + chameau)",
      duration: "1h",
      priceMad: Math.round(slotBasePrice * 1.7),
      note: "Famille",
    },

    {
      category: "Buggy",
      title: "Buggy 2 places — découverte",
      duration: "1h",
      priceMad: Math.round(slotBasePrice * 1.55),
      note: "2 places",
    },
    {
      category: "Buggy",
      title: "Buggy 2 places — aventure",
      duration: "2h",
      priceMad: Math.round(slotBasePrice * 2.45),
      note: "2 places",
    },
    {
      category: "Buggy",
      title: "Buggy 4 places — aventure",
      duration: "2h",
      priceMad: Math.round(slotBasePrice * 3.2),
      note: "4 places",
    },

    {
      category: "Quad",
      title: "Quad — initiation",
      duration: "1h",
      priceMad: Math.round(slotBasePrice * 0.85),
      note: "Débutants",
    },
    {
      category: "Quad",
      title: "Quad — aventure",
      duration: "1h30",
      priceMad: slotBasePrice,
    },
    {
      category: "Quad",
      title: "Quad — circuit extrême",
      duration: "2h",
      priceMad: Math.round(slotBasePrice * 1.35),
      note: "Confirmés",
    },

    {
      category: "Motocross",
      title: "Motocross — initiation",
      duration: "30 min",
      priceMad: Math.round(slotBasePrice * 0.75),
      note: "Dès 16 ans",
    },
    {
      category: "Motocross",
      title: "Motocross — session",
      duration: "60 min",
      priceMad: Math.round(slotBasePrice * 1.15),
      note: "Confirmés",
    },

    {
      category: "Enfants",
      title: "Quad enfant",
      duration: "15 min",
      priceMad: Math.max(120, Math.round(slotBasePrice * 0.32)),
      note: "6-12 ans",
    },
    {
      category: "Enfants",
      title: "Quad enfant",
      duration: "30 min",
      priceMad: Math.max(200, Math.round(slotBasePrice * 0.5)),
      note: "6-12 ans",
    },

    {
      category: "Balades",
      title: "Balade à cheval",
      duration: "1h",
      priceMad: Math.round(slotBasePrice * 0.95),
      note: rng() > 0.5 ? "Sunset" : "Matin",
    },
    {
      category: "Balades",
      title: "Balade à chameau",
      duration: "45 min",
      priceMad: Math.round(slotBasePrice * 0.8),
    },

    {
      category: "Options",
      title: "Transfert A/R Marrakech",
      duration: "Selon zone",
      priceMad: Math.floor(120 + rng() * 180),
      note: "Sur demande",
    },
    {
      category: "Options",
      title: "Photos/vidéo (GoPro)",
      duration: "Pendant l’activité",
      priceMad: Math.floor(80 + rng() * 120),
    },
  ];

  const reviewerNames = ["Salma", "Yassine", "Nadia", "Hamza", "Meriem", "Bilal", "Othmane"] as const;
  const reviewTexts = [
    "Super organisation, très bon guide, on a adoré.",
    "Expérience au top, paysages magnifiques.",
    "Réservation facile, timing respecté.",
    "Très fun, je recommande pour une sortie entre amis.",
    "Bonne expérience, prévoir une tenue adaptée.",
  ] as const;

  const reviews: Review[] = Array.from({ length: 4 }, (_, i) => ({
    id: `l-${args.id}-${i}`,
    author: pickOne(rng, reviewerNames),
    rating: Math.max(3, Math.round((3.6 + rng() * 1.4) * 2) / 2),
    date: nextDaysYmd(30)[Math.floor(rng() * 30)] ?? "2025-01-01",
    text: pickOne(rng, reviewTexts),
  }));

  const handle = slugFromName(args.name);
  const socialMedia: SocialMediaLink[] = [{ platform: "instagram", url: `https://instagram.com/${handle}` }];
  if (rng() > 0.5) socialMedia.push({ platform: "facebook", url: `https://facebook.com/${handle}` });
  if (rng() > 0.75) socialMedia.push({ platform: "tiktok", url: `https://tiktok.com/@${handle}` });

  return {
    id: args.id,
    name: args.name,
    category,
    city,
    neighborhood,
    address: `${pickOne(rng, ["Parking principal", "Point de rendez-vous", "Accueil"] as const)} — ${neighborhood}, ${city}`,
    phone,
    website,
    rating,
    reviewCount,
    description: `Une activité ${category.toLowerCase()} pensée pour profiter du Maroc autrement. Parcours encadré, organisation simple et réservation rapide.`,
    highlights,
    images,
    meetingPoint: `Point de rendez-vous: ${neighborhood} (détails envoyés après réservation)`,
    safety,
    treatments,
    slots,
    hours: makeLegacyHoursPreset("daytime"),
    policies,
    reviews,
    socialMedia,
    mapQuery: `${args.name} ${city}`,
  };
}

export default function Loisir() {
  const { locale } = useI18n();
  const params = useParams();

  const [searchParams] = useSearchParams();

  const id = params.id ?? "201";
  const preset = LOISIR_DETAILS[id];

  const data =
    preset ??
    buildFallbackLoisir({
      id,
      name: searchParams.get("title") ?? `Activité ${id}`,
      category: searchParams.get("category") ?? undefined,
      location: searchParams.get("location") ?? searchParams.get("neighborhood") ?? undefined,
      city: searchParams.get("city") ?? undefined,
    });

  const [publicPayload, setPublicPayload] = useState<Awaited<ReturnType<typeof getPublicEstablishment>> | null>(null);
  const title = searchParams.get("title") ?? data.name;

  useTrackEstablishmentVisit(publicPayload?.establishment?.id ?? undefined);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const payload = await getPublicEstablishment({ ref: id, title });
        if (!active) return;
        setPublicPayload(payload);
      } catch {
        if (!active) return;
        setPublicPayload(null);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [id, title]);

  // ── SEO ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const name = data?.name?.trim();
    if (!name) return;

    const est = publicPayload?.establishment;
    const city = (est?.city ?? data.city ?? "").trim();
    const seoTitle = city ? `${name} à ${city} — Sortir Au Maroc` : `${name} — Sortir Au Maroc`;
    const description = (data.description ?? "").trim() || undefined;
    const ogImageUrl = data.images?.[0] ? String(data.images[0]) : undefined;

    applySeo({
      title: seoTitle,
      description,
      ogType: "place",
      ogImageUrl,
      canonicalStripQuery: true,
      ...buildI18nSeoFields(locale),
    });

    if (est?.id) {
      const canonicalUrl = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const openingHoursSpecification = hoursToOpeningHoursSpecification(data.hours);
      const schema = generateLocalBusinessSchema({
        name: est.name || name,
        url: canonicalUrl,
        telephone: est.phone || undefined,
        address: {
          streetAddress: est.address || data.address || undefined,
          addressLocality: est.city || data.city || undefined,
          addressRegion: est.region || undefined,
          postalCode: est.postal_code || undefined,
          addressCountry: est.country || "MA",
        },
        images: (data.images ?? []).slice(0, 8),
        description: data.description || undefined,
        openingHoursSpecification,
        aggregateRating: { ratingValue: data.rating, reviewCount: data.reviewCount },
        geo:
          typeof est.lat === "number" && typeof est.lng === "number"
            ? { latitude: est.lat, longitude: est.lng }
            : undefined,
      });
      (schema as any)["@type"] = "SportsActivityLocation";
      setJsonLd("loisir", schema);

      setJsonLd(
        "breadcrumb",
        generateBreadcrumbSchema([
          { name: "Accueil", url: `${baseUrl}/` },
          { name: "Loisirs", url: `${baseUrl}/results?universe=loisirs` },
          { name: est.name || name, url: canonicalUrl },
        ]),
      );
    }

    return () => {
      clearJsonLd("loisir");
      clearJsonLd("breadcrumb");
    };
  }, [data.name, data.description, data.images?.[0], publicPayload?.establishment?.id, publicPayload?.establishment?.city]);

  const bookingEstablishmentId = publicPayload?.establishment?.id ?? data.id;
  // Booking is only enabled if the establishment has an email address registered
  const hasEstablishmentEmail = Boolean(publicPayload?.establishment?.email);

  // Override category from DB subcategory when available
  const dbCategory = useMemo(() => {
    const est = publicPayload?.establishment as Record<string, unknown> | null | undefined;
    if (!est) return null;
    const sub = est.subcategory;
    if (typeof sub === "string" && sub.length > 0 && sub !== "general") {
      const parts = sub.split("/");
      return parts[parts.length - 1].trim();
    }
    const cat = est.category;
    return typeof cat === "string" && cat.length > 0 ? cat : null;
  }, [publicPayload?.establishment]);

  const effectiveCategory = dbCategory ?? data.category;

  const [bookingOpen, setBookingOpen] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);


  const rating = clampRating(data?.rating ?? 0);

  const { status: geoStatus, location: userLocation, request: requestUserLocation } = useUserLocation();
  const geocode = useGeocodedQuery(`${data.name} ${data.address}`);
  const distanceText =
    userLocation && geocode.status === "success"
      ? formatDistanceBetweenCoords(userLocation, geocode.coords)
      : null;

  const priceRangeLabel = useMemo(() => {
    const treatments = data?.treatments ?? [];
    const slots = data?.slots ?? [];
    const values = [
      ...treatments.map((t) => t.priceMad),
      ...slots.map((s) => s.fromMad),
    ].filter((p) => Number.isFinite(p) && p > 0);

    if (!values.length) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? `${min} MAD` : `${min}-${max} MAD`;
  }, [data?.slots, data?.treatments]);

  const startingPrice = useMemo(() => {
    const treatments = data?.treatments ?? [];
    const treatmentPrices = treatments.map((t) => t.priceMad).filter((p) => Number.isFinite(p) && p > 0);
    if (treatmentPrices.length) return Math.min(...treatmentPrices);

    const slots = data?.slots ?? [];
    const slotPrices = slots.map((s) => s.fromMad).filter((p) => Number.isFinite(p) && p > 0);
    if (!slotPrices.length) return null;
    return Math.min(...slotPrices);
  }, [data?.slots, data?.treatments]);

  const barSlots = useMemo<DateSlots[]>(() => {
    const slots = data?.slots ?? [];
    if (!Array.isArray(slots) || slots.length === 0) return [];

    const today = new Date();
    const isYmd = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

    const labelToYmd = (label: string, index: number) => {
      const raw = (label ?? "").trim();
      if (isYmd(raw)) return raw;
      const l = raw.toLowerCase();
      const offset = l.includes("demain") ? 1 : l.includes("aujourd") ? 0 : index;
      const d = new Date(today);
      d.setDate(today.getDate() + offset);
      return formatYmd(d);
    };

    return slots.map((s, index) => ({
      date: labelToYmd(s.label, index),
      services: [{ service: "créneau", times: s.times }],
    }));
  }, [data?.slots]);

  const barAvgPriceLabel = useMemo(() => {
    if (startingPrice == null) return undefined;
    return `${new Intl.NumberFormat("fr-MA").format(startingPrice)} MAD`;
  }, [startingPrice]);

  const onViewMoreDates = () => {
    setBookingOpen(true);
  };

  const socialLinks = useMemo(() => {
    const raw = data?.socialMedia ?? [];
    return raw.flatMap((s) => {
      const platform = normalizeSocialPlatform(String(s.platform));
      const url = sanitizeUrl(String(s.url));
      if (!platform || !url) return [] as { platform: SocialMediaPlatform; url: string }[];
      return [{ platform, url }];
    });
  }, [data?.socialMedia]);

  const effectiveSocialLinks = useMemo(() => {
    if (socialLinks.length) return socialLinks;
    const handle = slugFromName(data?.name ?? "");
    if (!handle) return [] as { platform: SocialMediaPlatform; url: string }[];
    return [
      { platform: "instagram" as const, url: `https://instagram.com/${handle}` },
      { platform: "facebook" as const, url: `https://facebook.com/${handle}` },
    ];
  }, [data?.name, socialLinks]);

  if (!data) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <main className="container mx-auto px-4 py-10">
          <h1 className="text-2xl font-bold text-slate-900">Activité introuvable</h1>
          <p className="mt-2 text-slate-600">Ce lien n’est plus valide ou l’activité n’existe pas.</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Button asChild className="bg-primary hover:bg-primary/90 text-white">
              <Link to="/results?universe=loisirs">Retour aux résultats</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Retour à l’accueil</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <HotelGallery
        name={data.name}
        images={data.images}
        onReport={() => {
          if (!isAuthed()) {
            openAuthModal();
            return;
          }
          setShowReportDialog(true);
        }}
      />

      {/* Report Dialog */}
      <ReportEstablishmentDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        establishmentId={id}
        establishmentName={data.name}
      />

      <div className="bg-white px-4 py-2 md:px-6 md:py-3 border-b border-slate-200">
        <div className="container mx-auto">
          <div className="md:grid md:grid-cols-[1fr,380px] md:items-start md:gap-8">
            <div className="min-w-0">
              <Link to="/results?universe=loisirs" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                <ChevronLeft className="h-4 w-4" />
                Retour
              </Link>

              <h1 className="mt-2 text-2xl md:text-3xl font-bold text-foreground truncate">{data.name}</h1>

              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "w-4 h-4",
                        i < Math.floor(rating) ? "fill-yellow-400 text-yellow-400" : "text-slate-300",
                      )}
                    />
                  ))}
                </div>
                <span className="font-bold text-sm">{rating.toFixed(1)}</span>
                <span className="text-xs text-slate-500">({data.reviewCount} avis)</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
                <span className="px-3 py-1 bg-slate-100 rounded">{effectiveCategory}</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {data.neighborhood}
                </span>
                {distanceText ? (
                  <span className="flex items-center gap-1">
                    <span className="font-semibold">{distanceText}</span>
                  </span>
                ) : null}
                {priceRangeLabel ? (
                  <span className="flex items-center gap-1">
                    <span className="font-semibold text-primary">{priceRangeLabel}</span>
                  </span>
                ) : null}
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
              stickyClassName="shadow-2xl"
              establishmentId={bookingEstablishmentId}
              universe="loisirs"
              availableSlots={(publicPayload?.offers?.availableSlots as unknown as DateSlots[] | undefined) ?? barSlots}
              avgPriceLabel={barAvgPriceLabel}
              open={bookingOpen}
              onOpenChange={setBookingOpen}
              onViewMoreDates={onViewMoreDates}
              extraBookingQuery={{ title: data.name }}
              bookingEnabled={hasEstablishmentEmail}
            />
          </div>
        </div>
      </div>

      <EstablishmentTabs universe="loisir" />

      <main className="container mx-auto px-4 pt-6 pb-8 space-y-10">
        <CeAdvantageSection establishmentId={bookingEstablishmentId} />

        <section id="section-prestations" data-tab="prestations" className="scroll-mt-28 space-y-6">
          <div>
            <h2 className="text-xl font-bold mb-2">Prestations & tarifs</h2>
            <p className="text-sm text-slate-500 italic">Sélectionnez une prestation et choisissez un créneau en quelques secondes.</p>
          </div>

          <LoisirTreatmentsTab treatments={data.treatments} onGoToSlots={() => setBookingOpen(true)} />
        </section>

        <section id="section-avis" data-tab="avis" className="scroll-mt-28 space-y-6">
          <div>
            <h2 className="text-xl font-bold mb-2">Avis clients</h2>
            <p className="text-sm text-slate-500 italic">Seuls les clients ayant réservé peuvent déposer un avis.</p>
          </div>

          <div className="space-y-4">
            {data.reviews.map((r) => {
              const value = clampRating(r.rating);
              return (
                <div key={r.id} className="border-b pb-4 last:border-b-0">
                  <div className="flex items-start justify-between mb-2 gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{r.author}</p>
                      <p className="text-xs text-slate-500">{new Date(r.date).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={cn("w-4 h-4", i < Math.floor(value) ? "fill-yellow-400 text-yellow-400" : "text-slate-300")}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-slate-700">{r.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section id="section-infos" data-tab="infos" className="scroll-mt-28">
          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-bold mb-4">À propos</h2>
              <p className="text-slate-700 leading-relaxed">{data.description}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-4">Points forts</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {data.highlights.map((h) => (
                  <div key={h} className="px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-sm font-medium text-foreground">{h}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-4">Point de rendez-vous</h2>
              <p className="text-slate-700 leading-relaxed">{data.meetingPoint}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-4">Informations pratiques</h2>
              <div className="space-y-4">
                <div className="flex gap-4 items-start pb-4 border-b">
                  <Phone className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-sm text-slate-600">Téléphone</p>
                    <a href={`tel:${data.phone.replace(/\s+/g, "")}`} className="font-medium text-primary hover:text-primary/70 transition">
                      {data.phone}
                    </a>
                  </div>
                </div>

                <div className="flex gap-4 items-start pb-4 border-b">
                  <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-sm text-slate-600">Adresse</p>
                    <a href={buildMapsUrl(data.mapQuery)} target="_blank" rel="noreferrer" className="font-medium text-primary hover:text-primary/70 transition">
                      {data.address}
                    </a>
                  </div>
                </div>

                <div className="flex gap-4 items-start pb-4 border-b">
                  <Globe className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-sm text-slate-600">Site web</p>
                    <a href={data.website} target="_blank" rel="noreferrer" className="font-medium text-primary hover:text-primary/70 transition">
                      {data.website.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                </div>

                <div className="flex gap-4 items-start pb-4 border-b">
                  <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                  <div className="w-full">
                    <p className="text-sm text-slate-600 mb-2">Sécurité</p>
                    <ul className="space-y-1.5 text-sm text-slate-700">
                      {data.safety.map((x) => (
                        <li key={x} className="flex items-start gap-2">
                          <span className="mt-0.5 text-primary">•</span>
                          <span className="min-w-0">{x}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="flex gap-4 items-start pb-4 border-b">
                  <Timer className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                  <div className="w-full">
                    <p className="text-sm text-slate-600 mb-2">Politique</p>
                    <ul className="space-y-1.5 text-sm text-slate-700">
                      {data.policies.map((p) => (
                        <li key={p} className="flex items-start gap-2">
                          <span className="mt-0.5 text-primary">•</span>
                          <span className="min-w-0">{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {effectiveSocialLinks.length ? (
                  <div className="flex gap-4 items-start">
                    <Share2 className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                    <div className="w-full">
                      <p className="text-sm text-slate-600 mb-3">Réseaux sociaux</p>
                      <div className="flex gap-4 flex-wrap">
                        {effectiveSocialLinks.map((social) => (
                          <a
                            key={`${social.platform}-${social.url}`}
                            href={social.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-slate-100 rounded-lg transition text-primary hover:text-primary/70"
                            title={platformLabel(social.platform)}
                            aria-label={platformLabel(social.platform)}
                          >
                            <SocialIcon platform={social.platform} />
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </section>

        <section id="section-horaires" data-tab="horaires" className="scroll-mt-28 space-y-6">
          <h2 className="text-xl font-bold">Horaires</h2>
          <OpeningHoursBlock legacyHours={data.hours} />
        </section>

        <section id="section-carte" data-tab="carte" className="scroll-mt-28 space-y-4">
          <h2 className="text-xl font-bold mb-4">Localisation</h2>

          <div className="flex gap-3 flex-wrap">
            <a
              href={(publicPayload?.establishment?.social_links as Record<string, string> | null)?.waze || buildWazeUrl(data.mapQuery)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-32 px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-semibold hover:bg-slate-50 transition text-center flex items-center justify-center gap-2"
            >
              <img src={WAZE_LOGO_URL} alt="Waze" className="h-8 w-auto" />
            </a>
            <a
              href={buildMapsUrl(data.mapQuery)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-32 px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-semibold hover:bg-slate-50 transition text-center flex items-center justify-center gap-2"
            >
              <img src={GOOGLE_MAPS_LOGO_URL} alt="Google Maps" className="h-8 w-auto" />
            </a>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <iframe
              title="Map"
              src={buildMapsEmbedUrl(data.mapQuery)}
              className="w-full h-[380px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </section>
      </main>

    </div>
  );
}
