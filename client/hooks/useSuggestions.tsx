import { useMemo, useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { MapPin, Utensils, Dumbbell, Gamepad2, Tag, TrendingUp, Building2, Zap } from "lucide-react";
import { SuggestionItem, SuggestionGroup } from "@/components/SearchSuggestionsDropdown";
import { getPublicHomeCities } from "@/lib/publicApi";

// Fallback data - used when API is unavailable
const FALLBACK_MOROCCAN_CITIES = [
  { id: "casablanca", name: "Casablanca" },
  { id: "marrakech", name: "Marrakech" },
  { id: "rabat", name: "Rabat" },
  { id: "fes", name: "Fès" },
  { id: "tangier", name: "Tanger" },
  { id: "agadir", name: "Agadir" },
  { id: "meknes", name: "Meknès" },
];

// Dynamic cities - will be loaded from API
let MOROCCAN_CITIES = [...FALLBACK_MOROCCAN_CITIES];

// Load cities from API on module load
getPublicHomeCities()
  .then((res) => {
    if (res.ok && res.cities.length > 0) {
      MOROCCAN_CITIES = res.cities.map((c) => ({
        id: c.slug || c.id,
        name: c.name,
      }));
    }
  })
  .catch(() => {
    // Keep fallback cities
  });

const NEIGHBORHOODS_BY_CITY: Record<string, Array<{ id: string; name: string }>> = {
  casablanca: [
    { id: "ain-diab", name: "Aïn Diab" },
    { id: "maarif", name: "Maârif" },
    { id: "anfa", name: "Anfa" },
    { id: "gauthier", name: "Gauthier" },
    { id: "bourgogne", name: "Bourgogne" },
    { id: "racine", name: "Racine" },
    { id: "oasis", name: "Oasis" },
    { id: "californie", name: "Californie" },
    { id: "ain-sebaa", name: "Aïn Sebaâ" },
    { id: "hay-mohammadi", name: "Hay Mohammadi" },
    { id: "sidi-belyout", name: "Sidi Belyout" },
    { id: "mers-sultan", name: "Mers Sultan" },
    { id: "derb-sultan", name: "Derb Sultan" },
    { id: "habous", name: "Habous" },
    { id: "ancienne-medina", name: "Ancienne Médina" },
    { id: "bouskoura", name: "Bouskoura" },
    { id: "ain-chock", name: "Aïn Chock" },
    { id: "sidi-maarouf", name: "Sidi Maârouf" },
    { id: "2-mars", name: "2 Mars" },
    { id: "palmier", name: "Palmier" },
  ],
  marrakech: [
    { id: "gueliz", name: "Guéliz" },
    { id: "medina-marrakech", name: "Médina" },
    { id: "hivernage", name: "Hivernage" },
    { id: "palmeraie", name: "Palmeraie" },
    { id: "agdal-marrakech", name: "Agdal" },
    { id: "targa", name: "Targa" },
    { id: "amelkis", name: "Amelkis" },
    { id: "route-ourika", name: "Route de l'Ourika" },
    { id: "route-fes", name: "Route de Fès" },
    { id: "sidi-ghanem", name: "Sidi Ghanem" },
    { id: "mellah", name: "Mellah" },
    { id: "kasbah", name: "Kasbah" },
    { id: "bab-doukkala", name: "Bab Doukkala" },
    { id: "daoudiate", name: "Daoudiate" },
    { id: "massira", name: "Massira" },
  ],
  rabat: [
    { id: "ocean", name: "Océan" },
    { id: "agdal-rabat", name: "Agdal" },
    { id: "medina-rabat", name: "Médina" },
    { id: "hay-riad", name: "Hay Riad" },
    { id: "souissi", name: "Souissi" },
    { id: "les-orangers", name: "Les Orangers" },
    { id: "aviation", name: "Aviation" },
    { id: "hassan", name: "Hassan" },
    { id: "youssoufia", name: "Youssoufia" },
    { id: "akkari", name: "Akkari" },
    { id: "diour-jamaa", name: "Diour Jamaâ" },
    { id: "takaddoum", name: "Takaddoum" },
    { id: "yacoub-el-mansour", name: "Yacoub El Mansour" },
  ],
  fes: [
    { id: "ville-nouvelle-fes", name: "Ville Nouvelle" },
    { id: "fes-el-bali", name: "Fès el-Bali" },
    { id: "fes-jdid", name: "Fès Jdid" },
    { id: "atlas-fes", name: "Atlas" },
    { id: "saiss", name: "Saïss" },
    { id: "narjiss", name: "Narjiss" },
    { id: "mont-fleuri", name: "Mont Fleuri" },
    { id: "ain-kadous", name: "Aïn Kadous" },
    { id: "oued-fes", name: "Oued Fès" },
    { id: "bensouda", name: "Bensouda" },
    { id: "route-immouzer", name: "Route d'Immouzer" },
  ],
  tangier: [
    { id: "medina-tanger", name: "Médina" },
    { id: "ville-nouvelle-tanger", name: "Ville Nouvelle" },
    { id: "malabata", name: "Malabata" },
    { id: "marshan", name: "Marshan" },
    { id: "iberia", name: "Iberia" },
    { id: "california-tanger", name: "California" },
    { id: "boukhalef", name: "Boukhalef" },
    { id: "tanja-balia", name: "Tanja Balia" },
    { id: "mesnana", name: "Mesnana" },
    { id: "gzenaya", name: "Gzenaya" },
    { id: "cap-spartel", name: "Cap Spartel" },
    { id: "vieille-montagne", name: "Vieille Montagne" },
  ],
  agadir: [
    { id: "centre-ville-agadir", name: "Centre Ville" },
    { id: "nouveau-talborjt", name: "Nouveau Talborjt" },
    { id: "talborjt", name: "Talborjt" },
    { id: "charaf", name: "Charaf" },
    { id: "hay-mohammadi-agadir", name: "Hay Mohammadi" },
    { id: "founty", name: "Founty" },
    { id: "sonaba", name: "Sonaba" },
    { id: "cite-suisse", name: "Cité Suisse" },
    { id: "secteur-touristique", name: "Secteur Touristique" },
    { id: "marina-agadir", name: "Marina" },
    { id: "anza", name: "Anza" },
    { id: "tikiouine", name: "Tikiouine" },
  ],
  meknes: [
    { id: "ville-nouvelle-meknes", name: "Ville Nouvelle" },
    { id: "medina-meknes", name: "Médina" },
    { id: "hamria", name: "Hamria" },
    { id: "marjane-meknes", name: "Marjane" },
    { id: "zitoune", name: "Zitoune" },
    { id: "sidi-bouzekri", name: "Sidi Bouzekri" },
    { id: "toulal", name: "Toulal" },
    { id: "bassatine", name: "Bassatine" },
    { id: "ain-slougui", name: "Aïn Slougui" },
    { id: "belle-vue-meknes", name: "Belle Vue" },
  ],
};

// Export for use in other components
export { NEIGHBORHOODS_BY_CITY, MOROCCAN_CITIES };

const ACTIVITIES_AND_ESTABLISHMENTS = [
  // Restaurants
  { id: "rest-1", name: "Le Jardin", type: "establishment", universe: "restaurant" },
  { id: "rest-2", name: "Dar Moha", type: "establishment", universe: "restaurant" },
  { id: "rest-3", name: "Café Arabe", type: "establishment", universe: "restaurant" },
  // Leisure
  { id: "loisir-1", name: "Bowling Marrakech", type: "establishment", universe: "loisir" },
  { id: "loisir-2", name: "Parc Aquatique", type: "establishment", universe: "loisir" },
  // Sport & Wellness
  { id: "sport-1", name: "Gym Fitness", type: "establishment", universe: "sport_bien_etre" },
  { id: "sport-2", name: "Yoga Studio", type: "establishment", universe: "sport_bien_etre" },
];

const CATEGORIES = [
  { id: "cat-italian", name: "Italien", type: "category", universe: "restaurant" },
  { id: "cat-moroccan", name: "Marocain", type: "category", universe: "restaurant" },
  { id: "cat-japanese", name: "Japonais", type: "category", universe: "restaurant" },
  { id: "cat-spa", name: "Spa & massage", type: "category", universe: "sport_bien_etre" },
  { id: "cat-bowling", name: "Bowling", type: "category", universe: "loisir" },
];

const OFFERS = [
  { id: "offer-1", name: "Offres du moment", type: "offer" },
  { id: "offer-2", name: "Jusqu'à -50%", type: "offer" },
  { id: "offer-3", name: "Brunch du weekend", type: "offer" },
];

const TRENDING = [
  { id: "trend-1", name: "Les plus réservés du mois", type: "trending" },
  { id: "trend-2", name: "Top 100", type: "trending" },
  { id: "trend-3", name: "Nouveautés", type: "trending" },
];

const EN_LABELS: Record<string, string> = {
  "Italien": "Italian",
  "Marocain": "Moroccan",
  "Japonais": "Japanese",
  "Spa & massage": "Spa & massage",
  "Bowling": "Bowling",
  "Offres du moment": "Offers of the moment",
  "Jusqu'à -50%": "Up to -50%",
  "Brunch du weekend": "Weekend brunch",
  "Les plus réservés du mois": "Most booked this month",
  "Top 100": "Top 100",
  "Nouveautés": "New",
};

const getIconForCategory = (universe: string): React.ReactNode => {
  switch (universe) {
    case "restaurant":
      return <Utensils className="w-5 h-5" />;
    case "sport_bien_etre":
      return <Dumbbell className="w-5 h-5" />;
    case "loisir":
      return <Gamepad2 className="w-5 h-5" />;
    default:
      return <Building2 className="w-5 h-5" />;
  }
};

export function useCitySuggestions(): SuggestionGroup[] {
  const { t, locale } = useI18n();

  return useMemo<SuggestionGroup[]>(() => {
    const labelFor = (value: string) => (locale === "en" ? EN_LABELS[value] ?? value : value);
    return [
      {
        title: "",
        items: [
          {
            id: "ma-position",
            label: t("suggestions.my_position"),
            type: "city" as const,
            action: "setCity" as const,
            payload: { useGeolocation: true },
            description: t("suggestions.use_my_location"),
            icon: <Zap className="w-5 h-5" />,
          },
        ],
      },
      {
        title: t("suggestions.section.cities"),
        items: MOROCCAN_CITIES.map((city) => ({
          id: city.id,
          label: city.name,
          type: "city" as const,
          action: "setCity" as const,
          payload: { city: city.id },
          icon: <MapPin className="w-5 h-5" />,
        })),
      },
      {
        title: t("suggestions.section.neighborhoods"),
        items: Object.values(NEIGHBORHOODS_BY_CITY)
          .flat()
          .map((neighborhood) => ({
            id: neighborhood.id,
            label: labelFor(neighborhood.name),
            type: "neighborhood" as const,
            action: "setCity" as const,
            payload: { neighborhood: neighborhood.id },
            icon: <MapPin className="w-5 h-5" />,
          })),
      },
    ];
  }, [locale, t]);
}

export function useActivitySuggestions(selectedCity?: string): SuggestionGroup[] {
  const { t, locale } = useI18n();

  return useMemo<SuggestionGroup[]>(() => {
    const labelFor = (value: string) => (locale === "en" ? EN_LABELS[value] ?? value : value);
    return [
      {
        title: t("suggestions.section.establishments"),
        items: ACTIVITIES_AND_ESTABLISHMENTS.slice(0, 3).map((item) => ({
          id: item.id,
          label: item.name,
          type: "establishment" as const,
          universe: item.universe as any,
          action: "goToListing" as const,
          payload: { id: item.id },
          icon: getIconForCategory(item.universe),
        })),
      },
      {
        title: t("suggestions.section.categories"),
        items: CATEGORIES.slice(0, 4).map((cat) => ({
          id: cat.id,
          label: labelFor(cat.name),
          type: "category" as const,
          universe: cat.universe as any,
          action: "applyFilters" as const,
          payload: { category: cat.id, city: selectedCity },
          icon: getIconForCategory(cat.universe),
        })),
      },
      {
        title: t("suggestions.section.offers"),
        items: OFFERS.map((offer) => ({
          id: offer.id,
          label: labelFor(offer.name),
          type: "offer" as const,
          action: "applyFilters" as const,
          payload: { offer: offer.id, city: selectedCity },
          icon: <Tag className="w-5 h-5" />,
        })),
      },
      {
        title: t("suggestions.section.trending"),
        items: TRENDING.map((trend) => ({
          id: trend.id,
          label: labelFor(trend.name),
          type: "trending" as const,
          action: "goToResults" as const,
          payload: { trending: trend.id, city: selectedCity },
          icon: <TrendingUp className="w-5 h-5" />,
        })),
      },
    ];
  }, [locale, selectedCity, t]);
}
