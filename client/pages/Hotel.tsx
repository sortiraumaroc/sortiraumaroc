import { useEffect, useMemo, useState } from "react";

import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  Share2,
  Star,
  Tag,
} from "lucide-react";
import { getSocialIcon } from "@/components/ui/SocialIcons";

import { Header } from "@/components/Header";
import { ReservationBanner } from "@/components/booking/ReservationBanner";
import { AuthModalV2 } from "@/components/AuthModalV2";
import { Button } from "@/components/ui/button";
import { isAuthed, openAuthModal } from "@/lib/auth";
import { HotelGallery } from "@/components/hotel/HotelGallery";
import { EstablishmentTabs } from "@/components/establishment/EstablishmentTabs";
import { CeAdvantageSection } from "@/components/ce/CeAdvantageSection";
import { AmenitiesGrid, RatingStars, RoomsList, hotelAmenityPresets, type HotelAmenity } from "@/components/hotel/HotelSections";
import { getHotelById, type HotelData } from "@/lib/hotels";
import { getPublicEstablishment, type PublicEstablishment } from "@/lib/publicApi";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";
import { GOOGLE_MAPS_LOGO_URL, WAZE_LOGO_URL } from "@/lib/mapAppLogos";
import { applySeo, clearJsonLd, setJsonLd, generateLocalBusinessSchema, generateBreadcrumbSchema, buildI18nSeoFields } from "@/lib/seo";
import { useGeocodedQuery } from "@/hooks/useGeocodedQuery";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useTrackEstablishmentVisit } from "@/hooks/useTrackEstablishmentVisit";
import { formatDistanceBetweenCoords } from "@/lib/geo";
import { createRng, makeImageSet, makePhoneMa, makeWebsiteUrl, nextDaysYmd, pickMany, pickOne } from "@/lib/mockData";
import { useI18n } from "@/lib/i18n";
import { ReportEstablishmentDialog } from "@/components/ReportEstablishmentDialog";
import { EstablishmentReviewsSection } from "@/components/EstablishmentReviewsSection";
import { isUuid } from "@/lib/pro/visits";

type HotelReview = {
  id: string;
  author: string;
  rating: number;
  date: string;
  text: string;
  helpful: number;
};

const SOCIAL_ICON_CLASS = "w-6 h-6 text-primary hover:text-primary/70 transition";

function buildMapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildMapsEmbedUrl(query: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function buildWazeUrl(addressOrName: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(addressOrName)}`;
}

function ReviewSummary({ pros, cons }: { pros: string[]; cons: string[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="text-xs font-semibold text-emerald-800 tracking-wider">POINTS POSITIFS (RÉSUMÉ)</div>
        <ul className="mt-3 space-y-2 text-sm text-emerald-950">
          {pros.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <span className="mt-0.5 text-emerald-700">•</span>
              <span className="min-w-0">{p}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="text-xs font-semibold text-amber-800 tracking-wider">POINTS À SURVEILLER (RÉSUMÉ)</div>
        <ul className="mt-3 space-y-2 text-sm text-amber-950">
          {cons.map((c) => (
            <li key={c} className="flex items-start gap-2">
              <span className="mt-0.5 text-amber-700">•</span>
              <span className="min-w-0">{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RatingCard({ value, count, source }: { value: number; count: number; source: string }) {
  const rounded = Math.round(value * 2) / 2;
  const fullStars = Math.floor(rounded);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-500 tracking-wider">NOTE</div>
          <div className="mt-2 flex items-center gap-2">
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">{value.toFixed(1)}</div>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className={`w-4 h-4 ${i < fullStars ? "fill-yellow-400 text-yellow-400" : "text-slate-300"}`} />
              ))}
            </div>
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {count} avis · <span className="font-semibold">{source}</span>
          </div>
        </div>

        <div className="hidden sm:block">
          <div className="text-xs font-semibold text-slate-500 tracking-wider">INDICATIF</div>
          <div className="mt-2 text-sm text-slate-700 leading-relaxed max-w-[220px]">Les notes peuvent varier selon la plateforme.</div>
        </div>
      </div>
    </div>
  );
}

function buildFallbackHotel(args: { id: string; name?: string; city?: string; neighborhood?: string }): HotelData {
  const rng = createRng(`hotel-${args.id}-${args.name ?? ""}`);

  const name = args.name ?? `Hôtel ${args.id}`;
  const city = args.city ?? pickOne(rng, ["Marrakech", "Casablanca", "Rabat", "Tanger", "Agadir", "Fès"] as const);
  const neighborhood = args.neighborhood ?? pickOne(rng, ["Centre-ville", "Médina", "Guéliz", "Palmeraie", "Corniche"] as const);

  const stars = pickOne(rng, [3, 4, 5] as const);
  const ratingValue = Math.round((3.7 + rng() * 1.2) * 10) / 10;
  const ratingSource = pickOne(rng, ["Google", "Tripadvisor", "Booking", "Expedia", "Autre"] as const);
  const reviewCount = Math.floor(120 + rng() * 1600);

  const address = `${Math.floor(1 + rng() * 260)} ${pickOne(rng, ["Avenue", "Boulevard", "Rue"] as const)} ${pickOne(
    rng,
    ["Mohamed VI", "Al Massira", "Hassan II", "Majorelle", "Corniche"] as const,
  )}, ${city}`;

  const phone = makePhoneMa(rng);
  const website = makeWebsiteUrl(name);

  const amenities = pickMany(rng, Object.values(hotelAmenityPresets), 11);
  const images = makeImageSet(rng, "hotel");

  const rooms: HotelData["rooms"] = [
    {
      name: "Chambre Standard",
      occupancy: "Jusqu’à 2 personnes",
      highlights: ["Wi‑Fi", "Climatisation", "Salle de bain privée"],
      priceFromMad: Math.floor(450 + rng() * 2200),
    },
    {
      name: "Chambre Supérieure",
      occupancy: "Jusqu’à 3 personnes",
      highlights: ["Vue (selon disponibilité)", "Wi‑Fi", "Climatisation"],
      priceFromMad: Math.floor(650 + rng() * 2600),
    },
    {
      name: "Suite",
      occupancy: "Jusqu’à 4 personnes",
      highlights: ["Espace salon", "Vue (selon disponibilité)", "Wi‑Fi"],
      priceFromMad: Math.floor(950 + rng() * 4200),
    },
  ];

  return {
    id: args.id,
    name,
    city,
    neighborhood,
    stars,
    rating: { value: ratingValue, source: ratingSource as HotelData["rating"]["source"], reviewCount },
    address,
    phone,
    email: `contact-${args.id}@example.com`,
    website,
    checkIn: "À partir de 14:00",
    checkOut: "Jusqu’à 12:00",
    description:
      "Un hôtel sélectionné pour une expérience simple: chambres confortables, emplacement pratique et services essentiels. Cette fiche est un contenu de démonstration.",
    highlights: pickMany(
      rng,
      [
        "Emplacement pratique",
        "Petit-déjeuner disponible",
        "Wi‑Fi gratuit",
        "Réception 24/7",
        "Chambres climatisées",
        "Services et équipements variés",
        "Idéal en séjour business ou loisirs",
      ] as const,
      6,
    ),
    images,
    amenities,
    rooms,
    mapQuery: `${name} ${city}`,
    reviewUrl: `https://www.google.com/search?q=${encodeURIComponent(name + " avis")}`,
    reviewSummary: {
      pros: pickMany(rng, ["Emplacement apprécié", "Personnel accueillant", "Bon confort des chambres", "Petit-déjeuner correct"] as const, 3),
      cons: pickMany(rng, ["Expérience variable selon la saison", "Disponibilités limitées en période de pointe"] as const, 2),
    },
    socialMedia: [
      { platform: "instagram", url: "https://instagram.com/" },
      { platform: "website", url: website },
    ],
  };
}

/**
 * Convert a PublicEstablishment from the API into a HotelData object
 */
function buildHotelFromApi(establishment: PublicEstablishment): HotelData {
  const rng = createRng(`hotel-api-${establishment.id}`);

  const name = establishment.name ?? `Hôtel ${establishment.id}`;
  const city = establishment.city ?? "";
  const neighborhood = establishment.address ?? "";

  // Extract stars from amenities or extra data
  const extra = establishment.extra as Record<string, unknown> | null;
  const stars = (typeof extra?.stars === "number" ? extra.stars : 4) as 3 | 4 | 5;

  // Rating from extra or fallback
  const ratingValue = typeof extra?.rating === "number" ? extra.rating : Math.round((3.7 + rng() * 1.2) * 10) / 10;
  const ratingSource = (typeof extra?.ratingSource === "string" ? extra.ratingSource : "Google") as HotelData["rating"]["source"];
  const reviewCount = typeof extra?.reviewCount === "number" ? extra.reviewCount : Math.floor(120 + rng() * 1600);

  // Parse amenities
  const amenitiesArr = Array.isArray(establishment.amenities) ? establishment.amenities : [];
  const amenities: HotelAmenity[] = amenitiesArr.map((a) => {
    if (typeof a === "string") {
      const preset = hotelAmenityPresets[a as keyof typeof hotelAmenityPresets];
      return preset ?? { label: a, icon: null as any };
    }
    return a as HotelAmenity;
  });

  // Images (using snake_case from API)
  const images: string[] = [];
  if (establishment.cover_url) images.push(establishment.cover_url);
  if (Array.isArray(establishment.gallery_urls)) {
    images.push(...establishment.gallery_urls.filter((u): u is string => typeof u === "string"));
  }
  if (images.length === 0) {
    images.push(...makeImageSet(rng, "hotel"));
  }

  // Rooms from extra or fallback
  const roomsFromExtra = Array.isArray(extra?.rooms) ? extra.rooms : null;
  const rooms: HotelData["rooms"] = roomsFromExtra
    ? (roomsFromExtra as HotelData["rooms"])
    : [
        {
          name: "Chambre Standard",
          occupancy: "Jusqu'à 2 personnes",
          highlights: ["Wi‑Fi", "Climatisation", "Salle de bain privée"],
          priceFromMad: Math.floor(450 + rng() * 2200),
        },
        {
          name: "Chambre Supérieure",
          occupancy: "Jusqu'à 3 personnes",
          highlights: ["Vue (selon disponibilité)", "Wi‑Fi", "Climatisation"],
          priceFromMad: Math.floor(650 + rng() * 2600),
        },
        {
          name: "Suite",
          occupancy: "Jusqu'à 4 personnes",
          highlights: ["Espace salon", "Vue (selon disponibilité)", "Wi‑Fi"],
          priceFromMad: Math.floor(950 + rng() * 4200),
        },
      ];

  // Social media (using snake_case from API)
  const socialLinks = establishment.social_links as Record<string, string> | null;
  const socialMedia: HotelData["socialMedia"] = [];
  if (socialLinks) {
    for (const [platform, url] of Object.entries(socialLinks)) {
      if (url) socialMedia.push({ platform, url });
    }
  }
  if (establishment.website) {
    socialMedia.push({ platform: "website", url: establishment.website });
  }

  return {
    id: establishment.id,
    name,
    city,
    neighborhood,
    stars,
    rating: { value: ratingValue, source: ratingSource, reviewCount },
    address: establishment.address ?? "",
    phone: establishment.phone ?? "",
    email: `contact@${name.toLowerCase().replace(/\s+/g, "-")}.ma`,
    website: establishment.website ?? "",
    checkIn: typeof extra?.checkIn === "string" ? extra.checkIn : "À partir de 14:00",
    checkOut: typeof extra?.checkOut === "string" ? extra.checkOut : "Jusqu'à 12:00",
    description: establishment.description_long ?? establishment.description_short ?? "",
    highlights: Array.isArray(establishment.tags) ? establishment.tags.slice(0, 6) : [],
    images,
    amenities: amenities.length > 0 ? amenities : pickMany(rng, Object.values(hotelAmenityPresets), 11),
    rooms,
    mapQuery: `${name} ${city}`,
    reviewUrl: `https://www.google.com/search?q=${encodeURIComponent(name + " avis")}`,
    reviewSummary: {
      pros: pickMany(rng, ["Emplacement apprécié", "Personnel accueillant", "Bon confort des chambres", "Petit-déjeuner correct"] as const, 3),
      cons: pickMany(rng, ["Expérience variable selon la saison", "Disponibilités limitées en période de pointe"] as const, 2),
    },
    socialMedia: socialMedia.length > 0 ? socialMedia : [{ platform: "website", url: establishment.website ?? "" }],
  };
}

export default function Hotel() {
  const { t, locale } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // State for API-fetched data
  const [canonicalEstablishmentId, setCanonicalEstablishmentId] = useState<string | null>(null);
  const [publicEstablishment, setPublicEstablishment] = useState<PublicEstablishment | null>(null);
  const [loading, setLoading] = useState(true);

  // Track visits with the resolved canonical ID
  useTrackEstablishmentVisit(canonicalEstablishmentId ?? undefined);

  // Fetch establishment from API
  useEffect(() => {
    let active = true;
    const ref = String(id ?? "304").trim();
    const title = searchParams.get("title") ?? undefined;

    const fetchData = async () => {
      setLoading(true);
      try {
        const payload = await getPublicEstablishment({ ref, title });
        if (!active) return;
        setPublicEstablishment(payload.establishment);
        setCanonicalEstablishmentId(payload.establishment.id);

        // Redirect to slug URL if we have a slug and the current URL uses the ID
        if (payload.establishment.slug && isUuid(ref)) {
          const newUrl = buildEstablishmentUrl({
            id: payload.establishment.id,
            slug: payload.establishment.slug,
            universe: payload.establishment.universe ?? "hotel",
          });
          navigate(newUrl, { replace: true });
        }
      } catch {
        if (!active) return;
        setPublicEstablishment(null);
        setCanonicalEstablishmentId(isUuid(ref) ? ref : null);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();
    return () => {
      active = false;
    };
  }, [id, searchParams, navigate]);

  // Build hotel data: from API first, then static fallback, then generated
  const hotelId = canonicalEstablishmentId ?? id ?? "304";
  // Booking is only enabled if the establishment has an email address registered
  const hasEstablishmentEmail = Boolean(publicEstablishment?.email);
  const hotel = useMemo(() => {
    if (publicEstablishment) {
      return buildHotelFromApi(publicEstablishment);
    }
    const staticHotel = getHotelById(hotelId);
    if (staticHotel) return staticHotel;
    return buildFallbackHotel({
      id: hotelId,
      name: searchParams.get("title") ?? undefined,
      city: searchParams.get("city") ?? undefined,
      neighborhood: searchParams.get("neighborhood") ?? searchParams.get("location") ?? undefined,
    });
  }, [publicEstablishment, hotelId, searchParams]);

  useEffect(() => {
    const name = (hotel?.name ?? "").trim();
    if (!name) return;

    const city = (hotel?.city ?? "").trim();
    const title = city ? `${name} à ${city} — Sortir Au Maroc` : `${name} — Sortir Au Maroc`;
    const description = (hotel?.description ?? "").trim() || undefined;
    const ogImageUrl = Array.isArray(hotel?.images) && hotel.images.length ? String(hotel.images[0]) : undefined;

    applySeo({
      title,
      description,
      ogType: "hotel",
      ogImageUrl,
      canonicalStripQuery: true,
      ...buildI18nSeoFields(locale),
    });

    const canonicalUrlForSchema = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : undefined;
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

    const priceRange = (() => {
      const prices = (hotel?.rooms ?? [])
        .map((r) => (r as any)?.priceFromMad)
        .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0);
      if (!prices.length) return undefined;
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return min === max ? `${min} MAD` : `${min}-${max} MAD`;
    })();

    setJsonLd("hotel", {
      "@context": "https://schema.org",
      "@type": "LodgingBusiness",
      name,
      url: canonicalUrlForSchema,
      telephone: hotel?.phone ?? undefined,
      image: Array.isArray(hotel?.images) ? hotel.images.slice(0, 8) : undefined,
      address: {
        "@type": "PostalAddress",
        streetAddress: hotel?.address ?? undefined,
        addressLocality: hotel?.city ?? undefined,
        addressCountry: "MA",
      },
      ...(priceRange ? { priceRange } : {}),
      ...(hotel?.rating && typeof (hotel as any).rating?.value === "number" && typeof (hotel as any).rating?.reviewCount === "number"
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: (hotel as any).rating.value,
              reviewCount: (hotel as any).rating.reviewCount,
            },
          }
        : {}),
    });

    setJsonLd(
      "breadcrumb",
      generateBreadcrumbSchema([
        { name: "Accueil", url: `${baseUrl}/` },
        { name: "Hébergement", url: `${baseUrl}/results?universe=hebergement` },
        { name, url: canonicalUrlForSchema || "" },
      ]),
    );

    return () => {
      clearJsonLd("hotel");
      clearJsonLd("breadcrumb");
    };
  }, [hotelId, hotel.name]);

  const [authOpen, setAuthOpen] = useState(false);
  const [pendingBookingHotelId, setPendingBookingHotelId] = useState<string | null>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);

  const websiteHost = useMemo(() => {
    try {
      return new URL(hotel?.website ?? "").hostname || (hotel?.website ?? "");
    } catch {
      return hotel?.website ?? "";
    }
  }, [hotel?.website]);

  const categoryTags = useMemo(() => {
    if (!hotel) return [] as string[];
    const base = [`Hôtel ${hotel.stars}★`];
    const amenities = hotel.amenities.map((a) => a.label);
    const unique = [...new Set([...base, ...amenities])];
    return unique.slice(0, 12);
  }, [hotel]);

  const policies = useMemo(() => {
    const fallback = [
      "Arrivez 10 minutes avant l’heure prévue.",
      "Annulation gratuite jusqu’à 6h avant.",
      "Merci de signaler allergies ou besoins spécifiques lors de la réservation.",
    ];
    const list = (hotel as HotelData | null)?.policies;
    return Array.isArray(list) && list.length ? list : fallback;
  }, [hotel]);

  const priceRangeLabel = useMemo(() => {
    const prices = hotel.rooms
      .map((r) => r.priceFromMad)
      .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0);
    if (!prices.length) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `${min} MAD` : `${min}-${max} MAD`;
  }, [hotel.rooms]);

  const startingPrice = useMemo(() => {
    const prices = hotel.rooms
      .map((r) => r.priceFromMad)
      .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0);
    if (!prices.length) return null;
    return Math.min(...prices);
  }, [hotel.rooms]);

  const { status: geoStatus, location: userLocation, request: requestUserLocation } = useUserLocation();
  const geocode = useGeocodedQuery(`${hotel.name} ${hotel.address}`);
  const distanceText =
    userLocation && geocode.status === "success"
      ? formatDistanceBetweenCoords(userLocation, geocode.coords)
      : null;

  const reviewsList = useMemo((): HotelReview[] => {
    const rng = createRng(`hotel-reviews-${hotelId}-${hotel.name}`);

    const reviewerNames = [
      "Sarah M.",
      "Jean D.",
      "Maria L.",
      "Yassine A.",
      "Amina B.",
      "Nadia K.",
      "Omar S.",
      "Imane R.",
    ] as const;

    const reviewTexts = [
      "Séjour impeccable : chambre confortable, service attentionné et emplacement pratique.",
      "Très bon rapport qualité-prix. Petit-déjeuner correct et personnel accueillant.",
      "Belle expérience globale, un peu d’attente à l’accueil mais tout s’est bien passé.",
      "Propreté au top et literie très confortable. Je recommande.",
      "Hôtel agréable, calme, et bonne organisation. Réservation simple.",
      "Très satisfait du séjour. Les équipements sont variés et le service est réactif.",
    ] as const;

    const dates = nextDaysYmd(90);

    return Array.from({ length: 6 }, (_, i) => ({
      id: `h-${hotelId}-${i}`,
      author: pickOne(rng, reviewerNames),
      rating: Math.max(3, Math.min(5, Math.round(3.8 + rng() * 1.2))),
      date: dates[Math.floor(rng() * dates.length)] ?? "2025-01-01",
      text: pickOne(rng, reviewTexts),
      helpful: Math.floor(rng() * 40),
    }));
  }, [hotelId, hotel.name]);


  const startBooking = (nextHotelId: string) => {
    if (!isAuthed()) {
      setPendingBookingHotelId(nextHotelId);
      setAuthOpen(true);
      return;
    }
    navigate(`/hotel-booking/${encodeURIComponent(nextHotelId)}`);
  };

  const onAuthSuccess = () => {
    const nextHotelId = pendingBookingHotelId;
    setAuthOpen(false);
    setPendingBookingHotelId(null);
    if (nextHotelId) navigate(`/hotel-booking/${encodeURIComponent(nextHotelId)}`);
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <HotelGallery
        name={hotel.name}
        images={hotel.images}
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
        establishmentId={hotelId}
        establishmentName={hotel.name}
      />

      <div className="bg-white px-4 py-2 md:px-6 md:py-3 border-b border-slate-200">
        <div className="container mx-auto">
          <div className="md:grid md:grid-cols-[1fr,380px] md:items-start md:gap-8">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link to="/results?universe=hebergement" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                  <ChevronLeft className="h-4 w-4" />
                  Retour
                </Link>
              </div>

              <h1 className="mt-2 text-2xl md:text-3xl font-bold text-foreground truncate">{hotel.name}</h1>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <div className="inline-flex items-center gap-2">
                  <RatingStars rating={hotel.rating.value} />
                  <span className="font-bold text-slate-900">{hotel.rating.value.toFixed(1)}</span>
                  <span className="text-slate-500">({hotel.rating.reviewCount} avis · {hotel.rating.source})</span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
                <span className="px-3 py-1 bg-slate-100 rounded">Hôtel {hotel.stars}★</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {hotel.neighborhood}
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
              establishmentId={hotelId}
              universe="hotels"
              avgPriceLabel={startingPrice != null ? `${new Intl.NumberFormat("fr-MA").format(startingPrice)} MAD` : undefined}
              reserveHref={`/hotel-booking/${encodeURIComponent(hotelId)}`}
              onReserveNow={() => startBooking(hotelId)}
              bookingEnabled={hasEstablishmentEmail}
            />
          </div>
        </div>
      </div>

      <EstablishmentTabs universe="hotel" />

      <main className="container mx-auto px-4 pt-6 pb-8 space-y-10">
        <CeAdvantageSection establishmentId={hotelId} />

        <section id="section-chambres" data-tab="chambres" className="scroll-mt-28 space-y-6">
          <div>
            <h2 className="text-xl font-bold mb-2">Chambres</h2>
            <p className="text-sm text-slate-600">Sélection des catégories principales (les disponibilités varient selon les dates).</p>
          </div>

          <RoomsList rooms={hotel.rooms} />

          <div className="rounded-2xl border border-[#a3001d]/15 bg-[#a3001d]/[0.04] p-5">
            <div className="text-sm text-slate-800">
              Check‑in <span className="font-semibold">{hotel.checkIn}</span> · Check‑out <span className="font-semibold">{hotel.checkOut}</span>
            </div>
            <div className="mt-3 text-sm text-slate-700">Réservez via le bouton en bas de l’écran.</div>
          </div>
        </section>

        <section id="section-avis" data-tab="avis" className="scroll-mt-28 space-y-6">
          {/* Published reviews from the database */}
          <EstablishmentReviewsSection establishmentId={hotelId} />

          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild variant="outline" className="gap-2">
              <a href={hotel.reviewUrl} target="_blank" rel="noreferrer">
                Voir les avis en ligne
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </section>

        <section id="section-infos" data-tab="infos" className="scroll-mt-28 space-y-8">
          <section className="space-y-4">
            <h2 className="text-xl font-bold mb-2">À propos</h2>
            <p className="text-slate-700 leading-relaxed">{hotel.description}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4">Points forts</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {hotel.highlights.map((highlight) => (
                <div key={highlight} className="px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-sm font-medium text-foreground">{highlight}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold mb-2">Infos pratiques</h2>
            <div className="space-y-4">
              <div className="flex gap-4 items-start pb-4 border-b">
                <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <p className="text-sm text-slate-600">Adresse</p>
                  <a href={(publicEstablishment?.social_links as Record<string, string> | null)?.waze || buildWazeUrl(hotel.address)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:text-primary/70 transition">
                    {hotel.address}
                  </a>
                </div>
              </div>

              <div className="flex gap-4 items-start pb-4 border-b">
                <Globe className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <p className="text-sm text-slate-600">Site web</p>
                  <a href={hotel.website} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:text-primary/70 transition inline-flex items-center gap-2">
                    {websiteHost}
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              <div className="flex gap-4 items-start pb-4 border-b">
                <Tag className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                <div className="w-full">
                  <p className="text-sm text-slate-600 mb-3">Tag</p>
                  <div className="flex gap-2 flex-wrap">
                    {categoryTags.map((t) => (
                      <span key={t} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                        {t}
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
                    {hotel.socialMedia.map((social) => (
                      <a
                        key={`${social.platform}-${social.url}`}
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 hover:bg-slate-100 rounded-lg transition"
                        title={social.platform}
                      >
                        {getSocialIcon(social.platform, SOCIAL_ICON_CLASS)}
                      </a>
                    ))}
                    <a
                      href={hotel.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-slate-100 rounded-lg transition"
                      title="Site officiel"
                    >
                      {getSocialIcon("website", SOCIAL_ICON_CLASS)}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </section>

        <section id="section-services" data-tab="services" className="scroll-mt-28 space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-2">Services</h2>
            <p className="text-sm text-slate-600">Équipements et services disponibles sur place.</p>
          </div>

          <AmenitiesGrid amenities={hotel.amenities} />
        </section>

        <section id="section-carte" data-tab="carte" className="scroll-mt-28 space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-2">Carte</h2>
          </div>

          <div className="flex gap-3 flex-wrap">
            <a
              href={(publicEstablishment?.social_links as Record<string, string> | null)?.waze || buildWazeUrl(hotel.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-32 px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-semibold hover:bg-slate-50 transition text-center flex items-center justify-center gap-2"
            >
              <img src={WAZE_LOGO_URL} alt="Waze" className="h-8 w-auto" />
            </a>
            <a
              href={buildMapsUrl(hotel.mapQuery)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-32 px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-semibold hover:bg-slate-50 transition text-center flex items-center justify-center gap-2"
            >
              <img src={GOOGLE_MAPS_LOGO_URL} alt="Google Maps" className="h-8 w-auto" />
            </a>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
            <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
              <iframe
                title={`Carte – ${hotel.name}`}
                src={buildMapsEmbedUrl(hotel.mapQuery)}
                className="absolute inset-0 h-full w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </section>
      </main>


      <AuthModalV2
        isOpen={authOpen}
        onClose={() => {
          setAuthOpen(false);
          setPendingBookingHotelId(null);
        }}
        onAuthed={onAuthSuccess}
      />

    </div>
  );
}
