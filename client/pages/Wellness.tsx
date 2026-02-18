import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  Globe,
  MapPin,
  Phone,
  Share2,
  Star,
  Tag,
  Timer,
} from "lucide-react";
import { getSocialIcon } from "@/components/ui/SocialIcons";

import { Header } from "@/components/Header";
import type { DateSlots } from "@/components/booking/StickyBottomBookingActionBar";
import { ReservationBanner } from "@/components/booking/ReservationBanner";
import { HotelGallery } from "@/components/hotel/HotelGallery";
import { OpeningHoursBlock } from "@/components/restaurant/OpeningHoursBlock";
import { Button } from "@/components/ui/button";
import { WellnessTreatmentsTab } from "@/components/wellness/WellnessTreatmentsTab";
import { EstablishmentTabs } from "@/components/establishment/EstablishmentTabs";
import { CeAdvantageSection } from "@/components/ce/CeAdvantageSection";
import { cn } from "@/lib/utils";
import { createRng, makeImageSet, makePhoneMa, makeWebsiteUrl, nextDaysYmd, pickMany, pickOne } from "@/lib/mockData";
import { makeLegacyHoursPreset } from "@/lib/openingHoursPresets";
import { GOOGLE_MAPS_LOGO_URL, WAZE_LOGO_URL } from "@/lib/mapAppLogos";
import { useGeocodedQuery } from "@/hooks/useGeocodedQuery";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useTrackEstablishmentVisit } from "@/hooks/useTrackEstablishmentVisit";
import { formatDistanceBetweenCoords } from "@/lib/geo";
import { getPublicEstablishment } from "@/lib/publicApi";
import { useI18n } from "@/lib/i18n";
import { isAuthed, openAuthModal } from "@/lib/auth";
import { ReportEstablishmentDialog } from "@/components/ReportEstablishmentDialog";
import { applySeo, clearJsonLd, setJsonLd, generateLocalBusinessSchema, generateBreadcrumbSchema, hoursToOpeningHoursSpecification, buildI18nSeoFields } from "@/lib/seo";

type Review = {
  id: string;
  author: string;
  rating: number;
  date: string;
  text: string;
};

type Slot = { label: string; times: string[] };

type Treatment = {
  title: string;
  duration: string;
  priceMad: number;
  note?: string;
  category?: string;
};

type SocialMediaPlatform = "instagram" | "facebook" | "tiktok" | "youtube" | "twitter";

type SocialMediaLink = {
  platform: SocialMediaPlatform;
  url: string;
};

type WellnessData = {
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
  tags: string[];
  treatments: Treatment[];
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
  return getSocialIcon(platform, cn("h-4 w-4", className));
}

function buildWazeUrl(query: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
}

const WELLNESS_DETAILS: Record<string, WellnessData> = {
  "102": {
    id: "102",
    name: "Spa Luxe Marrakech",
    category: "Spa & massage",
    city: "Marrakech",
    neighborhood: "Médina",
    address: "Derb Sidi Ben Slimane, Marrakech 40000",
    phone: "+212 5 24 55 66 77",
    website: "https://example.com/spa-luxe-marrakech",
    rating: 4.8,
    reviewCount: 234,
    description:
      "Un spa raffiné au cœur de la médina: hammam traditionnel, cabines de massage, soins visage et rituels signature. Réservation par créneaux pour une expérience fluide et sans attente.",
    highlights: [
      "Hammam traditionnel + gommage",
      "Cabines duo disponibles",
      "Produits naturels (argan, ghassoul)",
      "Thé de bienvenue",
      "Annulation simple",
      "Confirmation immédiate",
    ],
    images: [
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1540555700478-22b3bbdf63f7?w=1200&h=800&fit=crop",
    ],
    tags: ["Hammam", "Massage", "Duo", "Argan", "Rituel"],
    treatments: [
      { title: "Hammam traditionnel + gommage", duration: "60 min", priceMad: 280, note: "Idéal première visite" },
      { title: "Massage relaxant aux huiles d’argan", duration: "60 min", priceMad: 420 },
      { title: "Massage deep tissue", duration: "60 min", priceMad: 480, note: "Pression forte" },
      { title: "Soin visage éclat", duration: "45 min", priceMad: 350 },
      { title: "Rituel signature (hammam + massage)", duration: "120 min", priceMad: 690, note: "Expérience complète" },
    ],
    slots: [
      { label: "Aujourd’hui", times: ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"] },
      { label: "Demain", times: ["10:00", "11:00", "13:00", "14:00", "16:00", "17:00"] },
    ],
    hours: makeLegacyHoursPreset("daytime"),
    policies: [
      "Arrivez 10 minutes avant le créneau.",
      "Annulation gratuite jusqu’à 6h avant.",
      "Merci de signaler allergies ou grossesse dans le message.",
    ],
    reviews: [
      { id: "w1", author: "Imane", rating: 5, date: "2025-11-09", text: "Massage parfait, accueil chaleureux, endroit très propre. Je recommande le rituel signature." },
      { id: "w2", author: "Karim", rating: 5, date: "2025-10-21", text: "Hammam + gommage excellent, on ressort détendu. Très bon rapport qualité." },
      { id: "w3", author: "Leila", rating: 4, date: "2025-09-07", text: "Très bien. Un peu d’attente à l’entrée, mais une fois dedans tout est fluide." },
    ],
    socialMedia: [
      { platform: "instagram", url: "https://instagram.com/spaluxemarrakech" },
      { platform: "facebook", url: "https://facebook.com/spaluxemarrakech" },
    ],
    mapQuery: "Spa Marrakech Medina",
  },
};

function buildFallbackWellness(args: {
  id: string;
  name: string;
  category?: string;
  neighborhood?: string;
  city?: string;
}): WellnessData {
  const rng = createRng(`wellness-${args.id}-${args.name}`);

  const city = args.city ?? "Marrakech";
  const neighborhood =
    args.neighborhood ?? pickOne(rng, ["Médina", "Guéliz", "Hivernage", "Centre-ville", "Palmeraie"] as const);

  const category =
    args.category ??
    pickOne(rng, ["Spa & massage", "Hammam", "Yoga", "Fitness", "Beauté", "Cryothérapie"] as const);

  const rating = clampRating(4.1 + rng() * 0.8);
  const reviewCount = Math.floor(60 + rng() * 520);
  const phone = makePhoneMa(rng);
  const website = makeWebsiteUrl(args.name);
  const images = makeImageSet(rng, "wellness");

  const highlights = pickMany(
    rng,
    [
      "Accueil chaleureux et professionnel",
      "Réservation par créneaux pour éviter l’attente",
      "Cabines individuelles et duo",
      "Produits naturels (argan, ghassoul, huiles)",
      "Ambiance calme et relaxante",
      "Hygiène et confort premium",
      "Option carte cadeau disponible",
      "Paiement par carte accepté",
    ] as const,
    6,
  );

  const tags = pickMany(rng, ["Hammam", "Massage", "Duo", "Argan", "Rituel", "Sport", "Relax"] as const, 5);

  const baseTreatments: Treatment[] = [
    { title: "Hammam traditionnel + gommage", duration: "60 min", priceMad: Math.floor(180 + rng() * 220), note: "Idéal première visite" },
    { title: "Massage relaxant aux huiles", duration: "60 min", priceMad: Math.floor(280 + rng() * 260) },
    { title: "Soin visage éclat", duration: "45 min", priceMad: Math.floor(220 + rng() * 220) },
    { title: "Rituel signature (hammam + massage)", duration: "120 min", priceMad: Math.floor(520 + rng() * 420) },
  ];

  let treatments: Treatment[] =
    category.toLowerCase().includes("fitness")
      ? [
          { title: "Accès salle (1 séance)", duration: "60 min", priceMad: Math.floor(60 + rng() * 80), category: "Séances" },
          { title: "Coaching privé", duration: "45 min", priceMad: Math.floor(180 + rng() * 220), note: "Sur réservation", category: "Coaching" },
          { title: "Cours collectif", duration: "50 min", priceMad: Math.floor(80 + rng() * 120), category: "Cours" },
        ]
      : category.toLowerCase().includes("yoga")
        ? [
            { title: "Yoga Vinyasa", duration: "60 min", priceMad: Math.floor(80 + rng() * 120), category: "Cours" },
            { title: "Yoga doux", duration: "60 min", priceMad: Math.floor(80 + rng() * 120), category: "Cours" },
            { title: "Cours privé", duration: "60 min", priceMad: Math.floor(220 + rng() * 260), note: "Débutants bienvenus", category: "Cours" },
          ]
        : baseTreatments;

  const isTopkapi = args.name.toLowerCase().includes("hammam") && args.name.toLowerCase().includes("topkapi");
  if (isTopkapi) {
    treatments = [
      { category: "Pack", title: "Pack Découverte Hammam", duration: "60 min", priceMad: 320, note: "Le + demandé" },
      { category: "Pack", title: "Pack Topkapi Signature (hammam + massage)", duration: "90 min", priceMad: 580, note: "Recommandé" },
      { category: "Pack", title: "Pack Duo (2 personnes)", duration: "120 min", priceMad: 990, note: "Duo" },
      { category: "Pack", title: "Pack Beauté (manucure + pédicure)", duration: "90 min", priceMad: 420 },

      { category: "Coiffure", title: "Brushing", duration: "30 min", priceMad: 120 },
      { category: "Coiffure", title: "Coupe + brushing", duration: "60 min", priceMad: 220 },
      { category: "Coiffure", title: "Soin capillaire à l’argan + brushing", duration: "45 min", priceMad: 180, note: "Argan" },
      { category: "Coiffure", title: "Coiffure événement", duration: "60 min", priceMad: 280, note: "Sur RDV" },

      { category: "Soins manucures", title: "Manucure classique", duration: "30 min", priceMad: 90 },
      { category: "Soins manucures", title: "Pose vernis semi-permanent", duration: "45 min", priceMad: 150 },
      { category: "Soins manucures", title: "Pose gel / capsules", duration: "75 min", priceMad: 240 },
      { category: "Soins manucures", title: "Dépose + soin", duration: "30 min", priceMad: 80 },

      { category: "Soins pédicures", title: "Pédicure classique", duration: "30 min", priceMad: 110 },
      { category: "Soins pédicures", title: "Pédicure spa", duration: "60 min", priceMad: 190, note: "Callosités" },
      { category: "Soins pédicures", title: "Pose vernis semi-permanent (pieds)", duration: "45 min", priceMad: 160 },
      { category: "Soins pédicures", title: "Soin anti-callosités", duration: "30 min", priceMad: 120 },

      { category: "Massage", title: "Massage relaxant", duration: "60 min", priceMad: 380 },
      { category: "Massage", title: "Deep tissue", duration: "60 min", priceMad: 430, note: "Pression forte" },
      { category: "Massage", title: "Massage aux pierres chaudes", duration: "75 min", priceMad: 520 },
      { category: "Massage", title: "Massage duo", duration: "60 min", priceMad: 760, note: "Duo" },

      { category: "Cils et sourcils", title: "Épilation sourcils", duration: "15 min", priceMad: 50 },
      { category: "Cils et sourcils", title: "Teinture sourcils", duration: "20 min", priceMad: 80 },
      { category: "Cils et sourcils", title: "Rehaussement de cils", duration: "60 min", priceMad: 240 },
      { category: "Cils et sourcils", title: "Brow lift", duration: "45 min", priceMad: 220 },
    ];
  }

  const slots: Slot[] = [
    { label: "Aujourd’hui", times: ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"] },
    { label: "Demain", times: ["10:00", "11:00", "13:00", "14:00", "16:00", "17:00"] },
  ];

  const policies = [
    "Arrivez 10 minutes avant le créneau.",
    "Annulation gratuite jusqu’à 6h avant.",
    "Merci de signaler allergies ou grossesse dans le message.",
  ];

  const reviewerNames = ["Imane", "Karim", "Leila", "Yassine", "Amina", "Nadia"] as const;
  const reviewTexts = [
    "Très bon accueil, expérience relaxante.",
    "Lieu propre et bien organisé, je recommande.",
    "Soins de qualité, réservation fluide.",
    "Très bon rapport qualité-prix.",
    "Un peu d’attente mais l’équipe est top.",
  ] as const;

  const reviews: Review[] = Array.from({ length: 4 }, (_, i) => ({
    id: `w-${args.id}-${i}`,
    author: pickOne(rng, reviewerNames),
    rating: Math.max(3, Math.round((3.7 + rng() * 1.3) * 2) / 2),
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
    address: `${Math.floor(10 + rng() * 220)} ${pickOne(rng, ["Rue", "Avenue", "Boulevard"] as const)} ${pickOne(rng, ["Mohamed VI", "Majorelle", "Al Massira"] as const)}, ${city}`,
    phone,
    website,
    rating,
    reviewCount,
    description: `Un espace ${category.toLowerCase()} conçu pour une expérience simple: créneaux clairs, accueil pro et ambiance relaxante.`,
    highlights,
    images,
    tags,
    treatments,
    slots,
    hours: makeLegacyHoursPreset("daytime"),
    policies,
    reviews,
    socialMedia,
    mapQuery: `${args.name} ${city}`,
  };
}

export default function Wellness() {
  const { t, locale } = useI18n();
  const params = useParams();

  const [searchParams] = useSearchParams();

  const id = params.id ?? "102";
  const preset = WELLNESS_DETAILS[id];

  const data =
    preset ??
    buildFallbackWellness({
      id,
      name: searchParams.get("title") ?? `Établissement ${id}`,
      category: searchParams.get("category") ?? undefined,
      neighborhood: searchParams.get("neighborhood") ?? searchParams.get("location") ?? undefined,
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
      (schema as any)["@type"] = "HealthAndBeautyBusiness";
      setJsonLd("wellness", schema);

      setJsonLd(
        "breadcrumb",
        generateBreadcrumbSchema([
          { name: "Accueil", url: `${baseUrl}/` },
          { name: "Wellness", url: `${baseUrl}/results?universe=wellness` },
          { name: est.name || name, url: canonicalUrl },
        ]),
      );
    }

    return () => {
      clearJsonLd("wellness");
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
    const list = data?.treatments ?? [];
    const prices = list.map((t) => t.priceMad).filter((p) => Number.isFinite(p) && p > 0);
    if (!prices.length) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `${min} MAD` : `${min}-${max} MAD`;
  }, [data?.treatments]);

  const startingPrice = useMemo(() => {
    const list = data?.treatments ?? [];
    const prices = list.map((t) => t.priceMad).filter((p) => Number.isFinite(p) && p > 0);
    if (!prices.length) return null;
    return Math.min(...prices);
  }, [data?.treatments]);

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
      services: [{ service: "séance", times: s.times }],
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

  const isTopkapi = (data?.name ?? "").toLowerCase().includes("hammam") && (data?.name ?? "").toLowerCase().includes("topkapi");
  const displayNeighborhood = isTopkapi ? "Guéliz" : data.neighborhood;

  const startBooking = () => {
    setBookingOpen(true);
  };


  if (!data) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <main className="container mx-auto px-4 py-10">
          <h1 className="text-2xl font-bold text-slate-900">{t("entity.establishment_not_found")}</h1>
          <p className="mt-2 text-slate-600">Ce lien n’est plus valide ou l’établissement n’existe pas.</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Button asChild className="bg-primary hover:bg-primary/90 text-white">
              <Link to="/results?universe=sport">Retour aux résultats</Link>
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
              <div className="flex items-start justify-between mb-3 gap-3">
                <div className="min-w-0">
                  <Link
                    to="/results?universe=sport"
                    className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
                  >
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
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                <span className="px-3 py-1 bg-slate-100 rounded">{effectiveCategory}</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {displayNeighborhood}
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
              universe="sport"
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

      <EstablishmentTabs universe="wellness" />

      <main className="container mx-auto px-4 pt-6 pb-8 space-y-10">
        <CeAdvantageSection establishmentId={bookingEstablishmentId} />

        <section id="section-prestations" data-tab="prestations" className="scroll-mt-28 space-y-6">
          <div>
            <h2 className="text-xl font-bold mb-2">Prestations & tarifs</h2>
            <p className="text-sm text-slate-500 italic">Sélectionnez une prestation et choisissez un créneau en quelques secondes.</p>
          </div>

          <WellnessTreatmentsTab treatments={data.treatments} onGoToSlots={() => setBookingOpen(true)} />
        </section>

        <section id="section-avis" data-tab="avis" className="scroll-mt-28 space-y-6">
          <div>
            <h2 className="text-xl font-bold mb-2">Avis clients</h2>
            <p className="text-sm text-slate-500 italic">Seuls les clients ayant réservé peuvent déposer un avis.</p>
          </div>

          <div className="space-y-4">
            {data.reviews.map((r) => (
              <div key={r.id} className="border-b pb-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-foreground">{r.author}</p>
                    <p className="text-xs text-slate-500">{new Date(r.date).toLocaleDateString("fr-FR")}</p>
                  </div>
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={cn("w-4 h-4", i < Math.floor(r.rating) ? "fill-yellow-400 text-yellow-400" : "text-slate-300")} />
                    ))}
                  </div>
                </div>
                <p className="text-slate-700">{r.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="section-infos" data-tab="infos" className="scroll-mt-28 space-y-8">
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
                <Tag className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                <div className="w-full">
                  <p className="text-sm text-slate-600 mb-3">Tags</p>
                  <div className="flex gap-2 flex-wrap">
                    {data.tags.map((t) => (
                      <span key={t} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 items-start pt-4 border-t">
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
                <div className="flex gap-4 items-start pt-4 border-t">
                  <Share2 className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                  <div className="w-full">
                    <p className="text-sm text-slate-600 mb-3">Réseaux sociaux</p>
                    <div className="flex flex-wrap gap-5">
                      {effectiveSocialLinks.map((s) => (
                        <a
                          key={`${s.platform}-${s.url}`}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={platformLabel(s.platform)}
                          title={platformLabel(s.platform)}
                          className={cn(
                            "transition",
                            s.platform === "instagram" ? "text-primary" : "text-slate-500 hover:text-primary",
                          )}
                        >
                          <SocialIcon platform={s.platform} className="h-6 w-6" />
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </section>

        <section id="section-horaires" data-tab="horaires" className="scroll-mt-28 space-y-6">
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
