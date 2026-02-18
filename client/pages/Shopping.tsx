import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  Globe,
  MapPin,
  Phone,
  Share2,
  Star,
  Tag,
} from "lucide-react";
import { getSocialIcon } from "@/components/ui/SocialIcons";

import { useGeocodedQuery } from "@/hooks/useGeocodedQuery";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useTrackEstablishmentVisit } from "@/hooks/useTrackEstablishmentVisit";
import { Header } from "@/components/Header";
import { EstablishmentTabs } from "@/components/establishment/EstablishmentTabs";
import { CeAdvantageSection } from "@/components/ce/CeAdvantageSection";
import { HotelGallery } from "@/components/hotel/HotelGallery";
import { OpeningHoursBlock } from "@/components/restaurant/OpeningHoursBlock";
import { RestaurantMap } from "@/components/restaurant/RestaurantMap";
import { Button } from "@/components/ui/button";
import { formatDistanceBetweenCoords } from "@/lib/geo";
import { makeLegacyHoursPreset } from "@/lib/openingHoursPresets";
import { GOOGLE_MAPS_LOGO_URL, WAZE_LOGO_URL } from "@/lib/mapAppLogos";
import { createRng, makeImageSet, makePhoneMa, makeWebsiteUrl, nextDaysYmd, pickMany, pickOne, slugify } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { isAuthed, openAuthModal } from "@/lib/auth";
import { ReportEstablishmentDialog } from "@/components/ReportEstablishmentDialog";
import { applySeo, clearJsonLd, setJsonLd, generateLocalBusinessSchema, generateBreadcrumbSchema, hoursToOpeningHoursSpecification, buildI18nSeoFields } from "@/lib/seo";
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

type ShoppingData = {
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
  hours: Record<string, { lunch?: string; dinner?: string; closed?: boolean }>;
  socialMedia: SocialMediaLink[];
  reviews: Review[];
  mapQuery: string;
};

function clampRating(r: number): number {
  if (!Number.isFinite(r)) return 0;
  return Math.max(0, Math.min(5, r));
}

const SHOPPING_DETAILS: Record<string, ShoppingData> = {
  "501": {
    id: "501",
    name: "Concept Store Medina",
    category: "Concept store",
    city: "Marrakech",
    neighborhood: "Médina",
    address: "Souk Semmarine, Marrakech 40000",
    phone: "+212 6 12 34 56 78",
    website: "https://example.com/concept-store-medina",
    rating: 4.7,
    reviewCount: 289,
    description: "Un concept-store sélectionné pour une expérience shopping fluide: artisanat premium, déco, parfums, accessoires et cadeaux.",
    highlights: [
      "Sélection premium (artisanat + déco)",
      "Service cadeau (emballage + message)",
      "Paiement rapide en caisse",
      "Conseils personnalisés",
      "Offres saisonnières",
      "Marques locales",
    ],
    images: [
      "https://images.unsplash.com/photo-1521335629791-ce4aec67dd53?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1520975682071-a2b6f71a0083?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1523205771623-e0faa4d2813d?w=1200&h=800&fit=crop",
    ],
    tags: ["Mode", "Déco", "Cadeaux", "Artisanat"],
    hours: makeLegacyHoursPreset("shopping"),
    socialMedia: [
      { platform: "instagram", url: "https://instagram.com/conceptstoremedina" },
      { platform: "facebook", url: "https://facebook.com/conceptstoremedina" },
      { platform: "website", url: "https://example.com/concept-store-medina" },
    ],
    reviews: [
      {
        id: "s1",
        author: "Kenza",
        rating: 5,
        date: "2025-11-15",
        text: "Très belle sélection, accueil chaleureux. Le service cadeau est top et rapide.",
      },
      {
        id: "s2",
        author: "Othmane",
        rating: 5,
        date: "2025-10-05",
        text: "Très pratique pour trouver des idées cadeaux, je recommande.",
      },
      {
        id: "s3",
        author: "Amina",
        rating: 4,
        date: "2025-08-22",
        text: "Beaucoup de choix. Un peu de monde en fin de journée, privilégiez le matin.",
      },
    ],
    mapQuery: "Souk Semmarine Marrakech",
  },
};

function buildFallbackShopping(args: {
  id: string;
  name: string;
  category?: string;
  neighborhood?: string;
  city?: string;
}): ShoppingData {
  const rng = createRng(`shopping-${args.id}-${args.name}`);

  const city = args.city ?? "Marrakech";
  const neighborhood = args.neighborhood ?? pickOne(rng, ["Médina", "Guéliz", "Menara", "Centre-ville"] as const);
  const category = args.category ?? pickOne(rng, ["Centre commercial", "Artisanat", "Mode", "Concept store", "Souk"] as const);

  const rating = clampRating(4.0 + rng() * 0.9);
  const reviewCount = Math.floor(90 + rng() * 700);

  const phone = makePhoneMa(rng);
  const website = makeWebsiteUrl(args.name);
  const images = makeImageSet(rng, "shopping");

  const highlights = pickMany(
    rng,
    [
      "Sélection premium (artisanat + déco)",
      "Service cadeau (emballage + message)",
      "Conseils personnalisés",
      "Offres saisonnières",
      "Paiement rapide en caisse",
      "Marques locales",
      "Cadeaux corporate",
      "Retours et échanges facilités",
    ] as const,
    6,
  );

  const tags = pickMany(rng, ["Mode", "Déco", "Cadeaux", "Artisanat", "Souk"] as const, 5);

  const reviewerNames = ["Othmane", "Amina", "Nadia", "Yassine", "Salma"] as const;
  const reviewTexts = [
    "Boutique top, beaucoup de choix et accueil agréable.",
    "Très pratique pour les cadeaux, service rapide.",
    "Qualité au rendez-vous, je recommande.",
    "Un peu de monde en fin de journée, privilégiez le matin.",
  ] as const;

  const reviews: Review[] = Array.from({ length: 4 }, (_, i) => ({
    id: `s-${args.id}-${i}`,
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
    address: `${pickOne(rng, ["Souk", "Avenue", "Boulevard"] as const)} ${pickOne(rng, ["Semmarine", "Mohamed V", "Guéliz"] as const)}, ${city}`,
    phone,
    website,
    rating,
    reviewCount,
    description: `Un lieu shopping ${category.toLowerCase()} à ${city}, pensé pour une expérience fluide: sélection claire, service cadeau et conseils.`,
    highlights,
    images,
    tags,
    hours: makeLegacyHoursPreset("shopping"),
    socialMedia: [
      { platform: "instagram", url: `https://instagram.com/${slugify(args.name)}` },
      { platform: "facebook", url: `https://facebook.com/${slugify(args.name)}` },
      { platform: "website", url: website },
    ],
    reviews,
    mapQuery: `${args.name} ${city}`,
  };
}

export default function Shopping() {
  const { locale } = useI18n();
  const params = useParams();
  useTrackEstablishmentVisit(params.id);

  const [searchParams] = useSearchParams();

  const id = params.id ?? "501";
  const preset = SHOPPING_DETAILS[id];

  const data =
    preset ??
    buildFallbackShopping({
      id,
      name: searchParams.get("title") ?? `Boutique ${id}`,
      category: searchParams.get("category") ?? undefined,
      neighborhood: searchParams.get("neighborhood") ?? searchParams.get("location") ?? undefined,
      city: searchParams.get("city") ?? undefined,
    });


  const rating = clampRating(data?.rating ?? 0);
  const [showReportDialog, setShowReportDialog] = useState(false);

  // ── SEO ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const name = data?.name?.trim();
    if (!name) return;

    const city = (data.city ?? "").trim();
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

    const canonicalUrl = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const openingHoursSpecification = hoursToOpeningHoursSpecification(data.hours);
    const schema = generateLocalBusinessSchema({
      name,
      url: canonicalUrl,
      telephone: data.phone || undefined,
      address: {
        streetAddress: data.address || undefined,
        addressLocality: data.city || undefined,
        addressCountry: "MA",
      },
      images: (data.images ?? []).slice(0, 8),
      description: data.description || undefined,
      openingHoursSpecification,
      aggregateRating: { ratingValue: data.rating, reviewCount: data.reviewCount },
    });
    (schema as any)["@type"] = "Store";
    setJsonLd("shopping", schema);

    setJsonLd(
      "breadcrumb",
      generateBreadcrumbSchema([
        { name: "Accueil", url: `${baseUrl}/` },
        { name: "Shopping", url: `${baseUrl}/results?universe=shopping` },
        { name, url: canonicalUrl },
      ]),
    );

    return () => {
      clearJsonLd("shopping");
      clearJsonLd("breadcrumb");
    };
  }, [data.name, data.description, data.images?.[0], data.city]);

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
          <h1 className="text-2xl font-bold text-slate-900">Boutique introuvable</h1>
          <p className="mt-2 text-slate-600">Ce lien n’est plus valide ou la boutique n’existe pas.</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Button asChild className="bg-primary hover:bg-primary/90 text-white">
              <Link to="/results?universe=shopping">Retour aux résultats</Link>
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
          <div className="min-w-0">
            <Link to="/results?universe=shopping" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
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
              <span className="px-3 py-1 bg-slate-100 rounded">{data.category}</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {data.neighborhood}
              </span>
              {distanceText ? (
                <span className="flex items-center gap-1">
                  <span className="font-semibold">{distanceText}</span>
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
        </div>
      </div>

      <EstablishmentTabs universe="shopping" />

      <main className="container mx-auto px-4 pt-6 pb-8 space-y-10">
        <CeAdvantageSection establishmentId={id} />

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
                      href={`https://waze.com/ul?q=${encodeURIComponent(data.address)}`}
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
                      <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">{data.category}</span>
                      {data.tags.map((t) => (
                        <span key={t} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                          {t}
                        </span>
                      ))}
                    </div>
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

        <section id="section-horaires" data-tab="horaires" className="scroll-mt-28 space-y-6">
          <OpeningHoursBlock legacyHours={data.hours} />
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

        <section id="section-carte" data-tab="carte" className="scroll-mt-28 space-y-4">
          <h2 className="text-xl font-bold mb-4">Localisation</h2>

          <div className="flex gap-3 flex-wrap">
            <a
              href={`https://waze.com/ul?q=${encodeURIComponent(data.address)}`}
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
        </section>
      </main>
    </div>
  );
}
