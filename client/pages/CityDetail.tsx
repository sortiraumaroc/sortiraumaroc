import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ChevronUp, ChevronDown, X, MapPin } from "lucide-react";

import { Header } from "@/components/Header";
import { getPublicHomeCities, getPublicUniverses, type PublicHomeCity, type PublicUniverse } from "@/lib/publicApi";
import { useI18n } from "@/lib/i18n";
import { applySeo, buildI18nSeoFields } from "@/lib/seo";
import {
  CUISINE_TYPES,
  SPORT_ACTIVITIES,
  LOISIRS_ACTIVITIES,
  HEBERGEMENT_ACTIVITIES,
  CULTURE_ACTIVITIES,
  SHOPPING_ACTIVITIES,
  VEHICLE_TYPES,
} from "@/lib/taxonomy";

// Moroccan cities - hardcoded list based on establishments data
const MOROCCAN_CITIES = [
  "Casablanca",
  "Rabat",
  "Marrakech",
  "Fès",
  "Tanger",
  "Agadir",
  "Meknès",
  "Oujda",
  "Kenitra",
  "Tétouan",
  "Salé",
  "Nador",
  "Mohammedia",
  "El Jadida",
  "Beni Mellal",
  "Khénifra",
  "Khouribga",
  "Settat",
  "Essaouira",
  "Ouarzazate",
];

type CitySection = {
  id: string;
  name: string;
  slug: string;
  isExpanded: boolean;
  universes: PublicUniverse[];
};

// Get taxonomy items for each universe
function getTaxonomyForUniverse(universeSlug: string): { label: string; filterKey: string; filterValue: string }[] {
  switch (universeSlug) {
    case "restaurants":
      // Return a sample of cuisine types (most popular ones)
      return CUISINE_TYPES.slice(0, 15).map((cuisine) => ({
        label: cuisine,
        filterKey: "cuisine",
        filterValue: cuisine,
      }));
    case "sport":
      return SPORT_ACTIVITIES.map((activity) => ({
        label: activity.name,
        filterKey: "activity",
        filterValue: activity.id,
      }));
    case "loisirs":
      return LOISIRS_ACTIVITIES.map((activity) => ({
        label: activity.name,
        filterKey: "activity",
        filterValue: activity.id,
      }));
    case "hebergement":
      return HEBERGEMENT_ACTIVITIES.map((activity) => ({
        label: activity.name,
        filterKey: "type",
        filterValue: activity.id,
      }));
    case "culture":
      return CULTURE_ACTIVITIES.map((activity) => ({
        label: activity.name,
        filterKey: "activity",
        filterValue: activity.id,
      }));
    case "shopping":
      return SHOPPING_ACTIVITIES.map((activity) => ({
        label: activity.name,
        filterKey: "type",
        filterValue: activity.id,
      }));
    case "rentacar":
      // Return a sample of vehicle types
      return VEHICLE_TYPES.slice(0, 12).map((type) => ({
        label: type,
        filterKey: "vehicleType",
        filterValue: type,
      }));
    default:
      return [];
  }
}

export default function CityDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t, locale } = useI18n();

  const [city, setCity] = useState<PublicHomeCity | null>(null);
  const [universes, setUniverses] = useState<PublicUniverse[]>([]);
  const [allCities, setAllCities] = useState<PublicHomeCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [citiesRes, universesRes] = await Promise.all([
          getPublicHomeCities(),
          getPublicUniverses(),
        ]);

        if (cancelled) return;

        const cities = citiesRes.cities ?? [];
        setAllCities(cities);
        setUniverses(universesRes.universes ?? []);

        // Find the current city by slug
        const currentCity = cities.find((c) => c.slug === slug);
        if (currentCity) {
          setCity(currentCity);
          // Expand the current city section by default
          setExpandedSection(currentCity.slug);
        } else {
          // City not found - redirect to home
          navigate("/", { replace: true });
        }
      } catch (err) {
        console.error("Failed to load city detail:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [slug, navigate]);

  // Apply SEO
  useEffect(() => {
    if (city) {
      applySeo({
        title: `${city.name} - Sortir Au Maroc`,
        description: `Découvrez les meilleurs établissements à ${city.name} : restaurants, hôtels, loisirs et plus encore. Réservez facilement sur Sortir Au Maroc.`,
        ...buildI18nSeoFields(locale),
      });
    }
  }, [city]);

  const toggleSection = (sectionSlug: string) => {
    // If clicking on the already expanded section, close it; otherwise open the new one
    setExpandedSection((prev) => (prev === sectionSlug ? null : sectionSlug));
  };

  const buildResultsUrl = (cityName: string, universeSlug: string, filterKey?: string, filterValue?: string) => {
    const params = new URLSearchParams();
    params.set("city", cityName);
    params.set("universe", universeSlug);
    params.set("sort", "best");
    if (filterKey && filterValue) {
      params.set(filterKey, filterValue);
    }
    return `/results?${params.toString()}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-slate-200 rounded w-1/3" />
            <div className="h-64 bg-slate-200 rounded" />
          </div>
        </main>
      </div>
    );
  }

  if (!city) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with city title */}
      <div className="bg-primary text-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Choisissez une ville</h1>
          <Link
            to="/"
            className="p-2 hover:bg-white/10 rounded-lg transition"
            title="Fermer"
          >
            <X className="w-6 h-6" />
          </Link>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Current city section - expanded by default */}
        <div className="mb-8">
          <button
            onClick={() => toggleSection(city.slug)}
            className="w-full flex items-center justify-between py-4 text-start"
          >
            <h2 className="text-2xl font-bold text-slate-900">{city.name}</h2>
            {expandedSection === city.slug ? (
              <ChevronUp className="w-6 h-6 text-slate-400" />
            ) : (
              <ChevronDown className="w-6 h-6 text-slate-400" />
            )}
          </button>

          {expandedSection === city.slug && (
            <div className="space-y-6">
              {/* Taxonomy by universe */}
              {universes.map((universe) => {
                const taxonomy = getTaxonomyForUniverse(universe.slug);
                if (taxonomy.length === 0) return null;

                return (
                  <div key={universe.slug}>
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                      {locale === "fr" ? universe.label_fr : universe.label_en} À {city.name.toUpperCase()}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {taxonomy.map((item) => (
                        <Link
                          key={`${universe.slug}-${item.filterValue}`}
                          to={buildResultsUrl(city.name, universe.slug, item.filterKey, item.filterValue)}
                          className="text-primary hover:text-primary/80 hover:underline font-medium text-sm"
                        >
                          {item.label} {city.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* All cities section */}
              <div>
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  TOUTES LES VILLES
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {MOROCCAN_CITIES.filter((c) => c !== city.name).map((cityName) => (
                    <Link
                      key={cityName}
                      to={`/villes/${cityName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-")}`}
                      className="text-primary hover:text-primary/80 hover:underline font-medium text-sm"
                    >
                      {cityName}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Other cities sections */}
        {allCities
          .filter((c) => c.slug !== city.slug)
          .map((otherCity) => (
            <div key={otherCity.id} className="border-t border-slate-200">
              <button
                onClick={() => toggleSection(otherCity.slug)}
                className="w-full flex items-center justify-between py-4 text-start"
              >
                <h2 className="text-xl font-semibold text-slate-900">
                  {otherCity.name}
                </h2>
                {expandedSection === otherCity.slug ? (
                  <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {expandedSection === otherCity.slug && (
                <div className="pb-4 space-y-4">
                  {/* Taxonomy by universe for other cities */}
                  {universes.map((universe) => {
                    const taxonomy = getTaxonomyForUniverse(universe.slug);
                    if (taxonomy.length === 0) return null;

                    return (
                      <div key={universe.slug}>
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                          {locale === "fr" ? universe.label_fr : universe.label_en} À {otherCity.name.toUpperCase()}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {taxonomy.map((item) => (
                            <Link
                              key={`${universe.slug}-${item.filterValue}`}
                              to={buildResultsUrl(otherCity.name, universe.slug, item.filterKey, item.filterValue)}
                              className="text-primary hover:text-primary/80 hover:underline font-medium text-sm"
                            >
                              {item.label} {otherCity.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
      </main>
    </div>
  );
}
