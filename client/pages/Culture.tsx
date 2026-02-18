import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  Clock,
  Globe,
  MapPin,
  Phone,
  Share2,
  Star,
  Tag,
  Timer,
} from "lucide-react";
import { getSocialIcon } from "@/components/ui/SocialIcons";

import { useGeocodedQuery } from "@/hooks/useGeocodedQuery";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useTrackEstablishmentVisit } from "@/hooks/useTrackEstablishmentVisit";
import { formatDistanceBetweenCoords } from "@/lib/geo";
import { getPublicEstablishment } from "@/lib/publicApi";

import { Header } from "@/components/Header";
import { HotelGallery } from "@/components/hotel/HotelGallery";
import { RestaurantMap } from "@/components/restaurant/RestaurantMap";
import { Button } from "@/components/ui/button";
import type { DateSlots } from "@/components/booking/StickyBottomBookingActionBar";
import { ReservationBanner } from "@/components/booking/ReservationBanner";
import { EstablishmentTabs } from "@/components/establishment/EstablishmentTabs";
import { CeAdvantageSection } from "@/components/ce/CeAdvantageSection";
import { GOOGLE_MAPS_LOGO_URL, WAZE_LOGO_URL } from "@/lib/mapAppLogos";
import { createRng, makeImageSet, makePhoneMa, makeWebsiteUrl, nextDaysYmd, pickMany, pickOne, slugify } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { isAuthed, openAuthModal } from "@/lib/auth";
import { ReportEstablishmentDialog } from "@/components/ReportEstablishmentDialog";
import { applySeo, clearJsonLd, setJsonLd, generateLocalBusinessSchema, generateBreadcrumbSchema, buildI18nSeoFields } from "@/lib/seo";
import { useI18n } from "@/lib/i18n";

type Review = {
  id: string;
  author: string;
  rating: number;
  date: string;
  text: string;
};

type SocialMediaLink = {
  platform: string;
  url: string;
};

type Slot = { label: string; times: string[]; priceFromMad: number };

type CultureData = {
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
  ticketInfo: {
    openDays: string;
    duration: string;
    bestTime: string;
    included: string[];
  };
  slots: Slot[];
  policies: string[];
  socialMedia: SocialMediaLink[];
  reviews: Review[];
  mapQuery: string;
};

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

const CULTURE_DETAILS: Record<string, CultureData> = {
  "401": {
    id: "401",
    name: "Musée Yves Saint Laurent Marrakech",
    category: "Musée",
    city: "Marrakech",
    neighborhood: "Guéliz",
    address: "Rue Yves Saint Laurent, Marrakech 40000",
    phone: "+212 5 24 29 89 86",
    website: "https://museeyslmarrakech.com",
    rating: 4.9,
    reviewCount: 456,
    description:
      "Un musée contemporain dédié à l’œuvre d’Yves Saint Laurent et à l’histoire du vêtement. Un parcours immersif, une scénographie soignée et des expositions temporaires qui renouvellent l’expérience à chaque visite.",
    highlights: [
      "Billets horodatés pour éviter l’attente",
      "Exposition permanente + expositions temporaires",
      "Audioguide disponible",
      "Boutique & librairie sur place",
      "Accès facile depuis le Jardin Majorelle",
      "Photos autorisées (hors zones signalées)",
    ],
    images: [
      "https://images.unsplash.com/photo-1564399579883-451a5d44be7f?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1520975958223-7ba87a1f4ecf?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1523731407965-2430cd12f5e4?w=1200&h=800&fit=crop",
    ],
    ticketInfo: {
      openDays: "Tous les jours sauf mercredi",
      duration: "60–90 min",
      bestTime: "Matin (10h–12h) pour une visite plus fluide",
      included: [
        "Accès exposition permanente",
        "Accès exposition temporaire (selon calendrier)",
        "Accès boutique & librairie",
      ],
    },
    slots: [
      { label: "Aujourd’hui", times: ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00"], priceFromMad: 120 },
      { label: "Demain", times: ["10:00", "11:00", "12:00", "13:00", "15:00", "16:00"], priceFromMad: 120 },
    ],
    policies: [
      "Billets non remboursables après validation.",
      "Pièce d’identité requise pour les tarifs réduits.",
      "Arrivez 10 minutes avant l’horaire.",
    ],
    socialMedia: [
      { platform: "instagram", url: "https://instagram.com/museeyslmarrakech" },
      { platform: "facebook", url: "https://facebook.com/museeyslmarrakech" },
      { platform: "website", url: "https://museeyslmarrakech.com" },
    ],
    reviews: [
      {
        id: "r1",
        author: "Nadia",
        rating: 5,
        date: "2025-10-12",
        text: "Visite superbe, scénographie incroyable. On comprend vraiment l'univers du créateur."
      },
      {
        id: "r2",
        author: "Youssef",
        rating: 5,
        date: "2025-09-03",
        text: "Très bien organisé, billets horodatés efficaces. La boutique vaut le détour."
      },
      {
        id: "r3",
        author: "Sarah",
        rating: 4,
        date: "2025-08-18",
        text: "Magnifique musée. Un peu de monde en après-midi, privilégiez le matin."
      },
    ],
    mapQuery: "Musée Yves Saint Laurent Marrakech",
  },
};

function buildFallbackCulture(args: {
  id: string;
  name: string;
  category?: string;
  neighborhood?: string;
  city?: string;
}): CultureData {
  const rng = createRng(`culture-${args.id}-${args.name}`);

  const city = args.city ?? "Marrakech";
  const neighborhood = args.neighborhood ?? pickOne(rng, ["Médina", "Guéliz", "Centre historique", "Kasbah"] as const);
  const category = args.category ?? pickOne(rng, ["Musée", "Monument", "Palais", "Site historique", "Marché"] as const);

  const rating = clampRating(4.2 + rng() * 0.7);
  const reviewCount = Math.floor(120 + rng() * 900);
  const phone = makePhoneMa(rng);
  const website = makeWebsiteUrl(args.name);

  const images = makeImageSet(rng, "culture");

  const highlights = pickMany(
    rng,
    [
      "Billets horodatés pour limiter l’attente",
      "Parcours conseillé 60–90 min",
      "Zones photo (hors zones signalées)",
      "Accès facile en taxi",
      "Boutique et souvenirs sur place",
      "Idéal le matin pour une visite plus fluide",
      "Panneaux explicatifs et histoire du lieu",
      "Expérience immersive",
    ] as const,
    6,
  );

  const ticketIncluded = pickMany(
    rng,
    [
      "Accès au site",
      "Accès exposition permanente",
      "Accès exposition temporaire (selon calendrier)",
      "Accès boutique",
      "Audioguide (selon option)",
    ] as const,
    3,
  );

  const ticketInfo: CultureData["ticketInfo"] = {
    openDays: pickOne(rng, ["Tous les jours", "Tous les jours sauf lundi", "Tous les jours sauf mercredi"] as const),
    duration: pickOne(rng, ["45–60 min", "60–90 min", "90–120 min"] as const),
    bestTime: pickOne(rng, ["Matin (10h–12h)", "Fin d’après-midi (16h–18h)"] as const),
    included: ticketIncluded,
  };

  const basePrice = Math.floor(60 + rng() * 120);
  const slots: Slot[] = [
    { label: "Aujourd’hui", times: ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00"], priceFromMad: basePrice },
    { label: "Demain", times: ["10:00", "11:00", "12:00", "13:00", "15:00", "16:00"], priceFromMad: basePrice },
  ];

  const policies = [
    "Arrivez 10 minutes avant l’horaire.",
    "Billets non remboursables après validation.",
    "Pièce d’identité requise pour les tarifs réduits.",
  ];

  const reviewerNames = ["Nadia", "Youssef", "Sarah", "Mehdi", "Salma"] as const;
  const reviewTexts = [
    "Visite superbe, très bien organisée.",
    "Lieu incontournable, on apprend beaucoup.",
    "Billets horodatés pratiques, flux fluide.",
    "Très beau site, prévoir un peu d’ombre en été.",
    "Bonne expérience, boutique sympa.",
  ] as const;

  const reviews: Review[] = Array.from({ length: 4 }, (_, i) => ({
    id: `c-${args.id}-${i}`,
    author: pickOne(rng, reviewerNames),
    rating: Math.max(3, Math.round((3.7 + rng() * 1.3) * 2) / 2),
    date: nextDaysYmd(30)[Math.floor(rng() * 30)] ?? "2025-01-01",
    text: pickOne(rng, reviewTexts),
  }));

  return {
    id: args.id,
    name: args.name,
    category,
    city,
    neighborhood,
    address: `${Math.floor(1 + rng() * 250)} ${pickOne(rng, ["Rue", "Avenue", "Place"] as const)} ${pickOne(rng, ["Bab", "Kasbah", "Majorelle", "Bahia"] as const)}, ${city}`,
    phone,
    website,
    rating,
    reviewCount,
    description: `Une sortie ${category.toLowerCase()} à ${city}: visite accessible, points forts clairs et créneaux simples à réserver.`,
    highlights,
    images,
    ticketInfo,
    slots,
    policies,
    socialMedia: [
      { platform: "instagram", url: `https://instagram.com/${slugify(args.name)}` },
      { platform: "facebook", url: `https://facebook.com/${slugify(args.name)}` },
      { platform: "website", url: website },
    ],
    reviews,
    mapQuery: `${args.name} ${city}`,
  };
}

export default function Culture() {
  const { locale } = useI18n();
  const params = useParams();

  const [searchParams] = useSearchParams();

  const id = params.id ?? "401";
  const preset = CULTURE_DETAILS[id];

  const data =
    preset ??
    buildFallbackCulture({
      id,
      name: searchParams.get("title") ?? `Sortie ${id}`,
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
        aggregateRating: { ratingValue: data.rating, reviewCount: data.reviewCount },
        geo:
          typeof est.lat === "number" && typeof est.lng === "number"
            ? { latitude: est.lat, longitude: est.lng }
            : undefined,
      });
      (schema as any)["@type"] = "EntertainmentBusiness";
      setJsonLd("culture", schema);

      setJsonLd(
        "breadcrumb",
        generateBreadcrumbSchema([
          { name: "Accueil", url: `${baseUrl}/` },
          { name: "Culture", url: `${baseUrl}/results?universe=culture` },
          { name: est.name || name, url: canonicalUrl },
        ]),
      );
    }

    return () => {
      clearJsonLd("culture");
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

  const ticketPriceFrom = useMemo(() => {
    const values = data.slots.map((s) => s.priceFromMad).filter((v) => Number.isFinite(v));
    if (values.length === 0) return null;
    return Math.min(...values);
  }, [data.slots]);

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
      services: [{ service: "entrée", times: s.times }],
    }));
  }, [data?.slots]);

  const onViewMoreDates = () => {
    setBookingOpen(true);
  };

  const { status: geoStatus, location: userLocation, request: requestUserLocation } = useUserLocation();
  const geocode = useGeocodedQuery(`${data.name} ${data.address}`);
  const distanceText =
    userLocation && geocode.status === "success"
      ? formatDistanceBetweenCoords(userLocation, geocode.coords)
      : null;

  if (!data) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <main className="container mx-auto px-4 py-10">
          <h1 className="text-2xl font-bold text-slate-900">Sortie introuvable</h1>
          <p className="mt-2 text-slate-600">Ce lien n’est plus valide ou l’activité n’existe pas.</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Button asChild className="bg-primary hover:bg-primary/90 text-white">
              <Link to="/results?universe=culture">Retour aux résultats</Link>
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
              <Link to="/results?universe=culture" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                <ChevronLeft className="h-4 w-4" />
                Retour
              </Link>
              <h1 className="mt-2 text-2xl md:text-3xl font-extrabold text-foreground truncate">{data.name}</h1>
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
                {ticketPriceFrom != null ? (
                  <span className="flex items-center gap-1">
                    <span className="font-semibold text-primary">Dès {ticketPriceFrom} MAD</span>
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
              universe="culture"
              availableSlots={(publicPayload?.offers?.availableSlots as unknown as DateSlots[] | undefined) ?? barSlots}
              avgPriceLabel={ticketPriceFrom != null ? `Dès ${ticketPriceFrom} MAD` : undefined}
              open={bookingOpen}
              onOpenChange={setBookingOpen}
              onViewMoreDates={onViewMoreDates}
              extraBookingQuery={{ title: data.name }}
              bookingEnabled={hasEstablishmentEmail}
            />
          </div>
        </div>

      </div>

      <EstablishmentTabs universe="culture" />

      <main className="container mx-auto px-4 pt-6 pb-8 space-y-10">
        <CeAdvantageSection establishmentId={bookingEstablishmentId} />

        <section id="section-prestations" data-tab="prestations" className="scroll-mt-28">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">Prestations & tarifs</h2>
              <p className="text-sm text-slate-600">Billets horodatés, entrée rapide et informations claires avant de réserver.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-500 tracking-wider">TARIF</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-900">
                    {ticketPriceFrom != null ? `Dès ${ticketPriceFrom} MAD` : "Tarifs sur place"}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">Billet horodaté — entrée rapide</div>
                </div>

                <div className="sm:text-end">
                  <div className="text-xs font-semibold text-slate-500 tracking-wider">INCLUS</div>
                  <div className="mt-2 text-sm text-slate-700">Sélection d’inclusions et accès selon le billet.</div>
                </div>
              </div>

              <div className="mt-5">
                <ul className="space-y-2 text-sm text-slate-700">
                  {data.ticketInfo.included.map((x) => (
                    <li key={x} className="flex items-start gap-2">
                      <span className="mt-0.5 text-primary">•</span>
                      <span className="min-w-0">{x}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

          </div>
        </section>

        <section id="section-avis" data-tab="avis" className="scroll-mt-28">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">Avis clients</h2>
              <p className="text-sm text-slate-500 italic">Seuls les clients ayant visité l'établissement peuvent déposer un avis</p>
            </div>

            <div className="space-y-4">
              {data.reviews.map((review) => (
                <div key={review.id} className="border-b pb-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-foreground">{review.author}</p>
                      <p className="text-xs text-slate-500">{new Date(review.date).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < Math.floor(clampRating(review.rating)) ? "fill-yellow-400 text-yellow-400" : "text-slate-300"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-slate-700 mb-2">{review.text}</p>
                </div>
              ))}
            </div>
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
                {data.highlights.map((highlight) => (
                  <div key={highlight} className="px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-sm font-medium text-foreground">{highlight}</p>
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
                    <a
                      href={(publicPayload?.establishment?.social_links as Record<string, string> | null)?.waze || `https://waze.com/ul?q=${encodeURIComponent(data.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:text-primary/70 transition"
                    >
                      {data.address}
                    </a>
                  </div>
                </div>

                <div className="flex gap-4 items-start pb-4 border-b">
                  <Globe className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-sm text-slate-600">Site web</p>
                    <a href={data.website} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:text-primary/70 transition">
                      {data.website}
                    </a>
                  </div>
                </div>

                <div className="flex gap-4 items-start pb-4 border-b">
                  <Tag className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                  <div className="w-full">
                    <p className="text-sm text-slate-600 mb-3">Tag</p>
                    <div className="flex gap-2 flex-wrap">
                      <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">{effectiveCategory}</span>
                      <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">{data.neighborhood}</span>
                      <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">{data.city}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 items-start pb-4 border-b">
                  <Clock className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
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

                <div className="flex gap-4 items-start">
                  <Share2 className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                  <div className="w-full">
                    <p className="text-sm text-slate-600 mb-3">Réseaux sociaux</p>
                    <div className="flex gap-4 flex-wrap">
                      {(() => {
                        const iconClass = "w-6 h-6 text-primary hover:text-primary/70 transition";

                        const items = data.socialMedia
                          .map((social) => ({ social, icon: getSocialIcon(social.platform, iconClass) }))
                          .filter((x) => x.icon != null);

                        if (items.length === 0) {
                          return <span className="text-sm text-slate-500">Aucun lien disponible</span>;
                        }

                        return items.map(({ social, icon }) => (
                          <a
                            key={`${social.platform}-${social.url}`}
                            href={social.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-slate-100 rounded-lg transition"
                            title={social.platform}
                          >
                            {icon}
                          </a>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section id="section-horaires" data-tab="horaires" className="scroll-mt-28">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">Horaires</h2>
              <p className="text-sm text-slate-600">Jours d’ouverture et conseils pour une visite plus fluide.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-600">Ouverture</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{data.ticketInfo.openDays}</p>
              </div>
              <div className="px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-600">Durée</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{data.ticketInfo.duration}</p>
              </div>
              <div className="px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-600">Meilleur moment</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{data.ticketInfo.bestTime}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="section-carte" data-tab="carte" className="scroll-mt-28">
          <div className="space-y-4">
            <h2 className="text-xl font-bold mb-4">Localisation</h2>

            <div className="flex gap-3 flex-wrap">
              <a
                href={(publicPayload?.establishment?.social_links as Record<string, string> | null)?.waze || `https://waze.com/ul?q=${encodeURIComponent(data.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-32 px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-semibold hover:bg-slate-50 transition text-center flex items-center justify-center gap-2"
              >
                <img src={WAZE_LOGO_URL} alt="Waze" className="h-8 w-auto" />
              </a>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${data.name} ${data.address}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-32 px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-semibold hover:bg-slate-50 transition text-center flex items-center justify-center gap-2"
              >
                <img src={GOOGLE_MAPS_LOGO_URL} alt="Google Maps" className="h-8 w-auto" />
              </a>
            </div>

            <RestaurantMap query={`${data.name} ${data.address}`} name={data.name} />
          </div>
        </section>
      </main>

    </div>
  );
}
