// SAM Taxonomy: Activity definitions with conditional metadata
export type ActivityCategory = "restaurants" | "sport" | "loisirs" | "hebergement" | "culture" | "shopping" | "rentacar";

export interface Activity {
  id: string;
  name: string;
  category: ActivityCategory;
  requires_time: boolean;
  requires_group: boolean;
  min_people?: number;
  max_people?: number;
  default_people?: number;
}

export interface CategoryConfig {
  category: ActivityCategory;
  label: string;
  icon: string;
  fields: {
    city: boolean;
    activity_type: boolean;
    date: boolean;
    time: boolean;
    checkin_date: boolean;
    checkout_date: boolean;
    num_people: boolean;
    culinary_type: boolean;
    store_type: boolean;
  };
  conditional_num_people: boolean; // Only show num_people for certain activities
}

// ============================================
// RESTAURANT ACTIVITIES
// ============================================
export const RESTAURANT_ACTIVITIES: Activity[] = [
  { id: "italian", name: "Italien", category: "restaurants", requires_time: true, requires_group: false },
  { id: "moroccan", name: "Marocain", category: "restaurants", requires_time: true, requires_group: false },
  { id: "japanese", name: "Japonais", category: "restaurants", requires_time: true, requires_group: false },
  {
    id: "steakhouse",
    name: "Steakhouse / Grillades",
    category: "restaurants",
    requires_time: true,
    requires_group: false,
  },
  { id: "brunch", name: "Brunch", category: "restaurants", requires_time: true, requires_group: false },
  { id: "cafe", name: "Café", category: "restaurants", requires_time: true, requires_group: false },
];

// ============================================
// SPORT & BIEN-ÊTRE ACTIVITIES
// ============================================
export const SPORT_ACTIVITIES: Activity[] = [
  { id: "hammam", name: "Hammam", category: "sport", requires_time: true, requires_group: false, default_people: 1 },
  { id: "spa", name: "Spa", category: "sport", requires_time: true, requires_group: false, default_people: 1 },
  { id: "massage", name: "Massage", category: "sport", requires_time: true, requires_group: false, default_people: 1 },
  {
    id: "institut_beaute",
    name: "Institut beauté",
    category: "sport",
    requires_time: true,
    requires_group: false,
    default_people: 1,
  },
  {
    id: "barber",
    name: "Coiffeur / Barber",
    category: "sport",
    requires_time: true,
    requires_group: false,
    default_people: 1,
  },
  {
    id: "yoga_pilates",
    name: "Yoga / Pilates",
    category: "sport",
    requires_time: true,
    requires_group: false,
    default_people: 1,
  },
  {
    id: "salle_sport",
    name: "Salle de sport",
    category: "sport",
    requires_time: true,
    requires_group: false,
    default_people: 1,
  },
  {
    id: "coach_perso",
    name: "Coach personnel",
    category: "sport",
    requires_time: true,
    requires_group: false,
    default_people: 1,
  },
  {
    id: "padel",
    name: "Padel",
    category: "sport",
    requires_time: true,
    requires_group: true,
    min_people: 4,
    max_people: 4,
    default_people: 4,
  },
  {
    id: "tennis",
    name: "Tennis",
    category: "sport",
    requires_time: true,
    requires_group: true,
    min_people: 2,
    max_people: 4,
    default_people: 2,
  },
  {
    id: "foot5",
    name: "Foot 5",
    category: "sport",
    requires_time: true,
    requires_group: true,
    min_people: 10,
    max_people: 10,
    default_people: 10,
  },
  { id: "crossfit", name: "Crossfit", category: "sport", requires_time: true, requires_group: false, default_people: 1 },
  { id: "piscine", name: "Piscine", category: "sport", requires_time: true, requires_group: false, default_people: 1 },
  {
    id: "arts_martiaux",
    name: "Arts martiaux",
    category: "sport",
    requires_time: true,
    requires_group: false,
    default_people: 1,
  },
  { id: "autres", name: "Autres", category: "sport", requires_time: true, requires_group: false },
];

// ============================================
// LOISIRS ACTIVITIES
// ============================================
export const LOISIRS_ACTIVITIES: Activity[] = [
  {
    id: "escape_game",
    name: "Escape game",
    category: "loisirs",
    requires_time: true,
    requires_group: true,
    min_people: 2,
    max_people: 8,
    default_people: 4,
  },
  {
    id: "karting",
    name: "Karting",
    category: "loisirs",
    requires_time: true,
    requires_group: true,
    min_people: 1,
    max_people: 20,
    default_people: 2,
  },
  {
    id: "quad_buggy",
    name: "Quad / Buggy",
    category: "loisirs",
    requires_time: true,
    requires_group: true,
    min_people: 1,
    max_people: 10,
    default_people: 2,
  },
  {
    id: "jet_ski_paddle",
    name: "Jet ski / Paddle",
    category: "loisirs",
    requires_time: true,
    requires_group: true,
    min_people: 1,
    max_people: 10,
    default_people: 2,
  },
  {
    id: "parachute_parapente",
    name: "Parachute / Parapente",
    category: "loisirs",
    requires_time: true,
    requires_group: false,
    default_people: 1,
  },
  {
    id: "golf",
    name: "Golf",
    category: "loisirs",
    requires_time: true,
    requires_group: true,
    min_people: 1,
    max_people: 4,
    default_people: 2,
  },
  {
    id: "foot5",
    name: "Foot 5",
    category: "loisirs",
    requires_time: true,
    requires_group: true,
    min_people: 10,
    max_people: 10,
    default_people: 10,
  },
  {
    id: "balades",
    name: "Balades (cheval / chameau)",
    category: "loisirs",
    requires_time: true,
    requires_group: true,
    min_people: 1,
    max_people: 10,
    default_people: 2,
  },
  {
    id: "aquapark",
    name: "Aquapark",
    category: "loisirs",
    requires_time: true,
    requires_group: true,
    min_people: 1,
    max_people: 20,
    default_people: 2,
  },
  {
    id: "bowling",
    name: "Bowling",
    category: "loisirs",
    requires_time: true,
    requires_group: true,
    min_people: 1,
    max_people: 8,
    default_people: 2,
  },
  {
    id: "laser_game",
    name: "Laser game",
    category: "loisirs",
    requires_time: true,
    requires_group: true,
    min_people: 2,
    max_people: 20,
    default_people: 4,
  },
  {
    id: "surf_kite",
    name: "Surf / Kite",
    category: "loisirs",
    requires_time: true,
    requires_group: true,
    min_people: 1,
    max_people: 10,
    default_people: 2,
  },
  { id: "autres", name: "Autres", category: "loisirs", requires_time: true, requires_group: false },
];

// ============================================
// HÉBERGEMENT ACTIVITIES
// ============================================
export const HEBERGEMENT_ACTIVITIES: Activity[] = [
  {
    id: "hotel",
    name: "Hôtel",
    category: "hebergement",
    requires_time: false,
    requires_group: true,
    min_people: 1,
    max_people: 20,
    default_people: 2,
  },
  {
    id: "riad",
    name: "Riad",
    category: "hebergement",
    requires_time: false,
    requires_group: true,
    min_people: 1,
    max_people: 20,
    default_people: 2,
  },
  {
    id: "maison_hotes",
    name: "Maison d'hôtes",
    category: "hebergement",
    requires_time: false,
    requires_group: true,
    min_people: 1,
    max_people: 15,
    default_people: 2,
  },
  {
    id: "appartement",
    name: "Appartement",
    category: "hebergement",
    requires_time: false,
    requires_group: true,
    min_people: 1,
    max_people: 15,
    default_people: 2,
  },
  {
    id: "villa",
    name: "Villa",
    category: "hebergement",
    requires_time: false,
    requires_group: true,
    min_people: 1,
    max_people: 30,
    default_people: 4,
  },
  {
    id: "auberge",
    name: "Auberge",
    category: "hebergement",
    requires_time: false,
    requires_group: true,
    min_people: 1,
    max_people: 20,
    default_people: 2,
  },
  {
    id: "resort",
    name: "Resort",
    category: "hebergement",
    requires_time: false,
    requires_group: true,
    min_people: 1,
    max_people: 30,
    default_people: 2,
  },
];

// ============================================
// CULTURE ACTIVITIES
// ============================================
export const CULTURE_ACTIVITIES: Activity[] = [
  {
    id: "visite_guidee",
    name: "Visite guidée",
    category: "culture",
    requires_time: true,
    requires_group: true,
    min_people: 2,
    max_people: 50,
    default_people: 2,
  },
  {
    id: "musee_monument",
    name: "Musée / Monument",
    category: "culture",
    requires_time: true,
    requires_group: false,
    default_people: 2,
  },
  { id: "theatre", name: "Théâtre", category: "culture", requires_time: true, requires_group: false, default_people: 2 },
  {
    id: "salle_spectacle",
    name: "Salle spectacle",
    category: "culture",
    requires_time: true,
    requires_group: false,
    default_people: 2,
  },
  { id: "concert", name: "Concert", category: "culture", requires_time: true, requires_group: false, default_people: 2 },
  { id: "expo", name: "Expo", category: "culture", requires_time: true, requires_group: false, default_people: 2 },
  {
    id: "evenement",
    name: "Événement",
    category: "culture",
    requires_time: true,
    requires_group: false,
    default_people: 2,
  },
  {
    id: "atelier",
    name: "Atelier",
    category: "culture",
    requires_time: true,
    requires_group: true,
    min_people: 2,
    max_people: 20,
    default_people: 4,
  },
  { id: "autres", name: "Autres", category: "culture", requires_time: true, requires_group: false, default_people: 2 },
];

// ============================================
// SHOPPING ACTIVITIES
// ============================================
export const SHOPPING_ACTIVITIES: Activity[] = [
  { id: "mode", name: "Mode", category: "shopping", requires_time: false, requires_group: false },
  { id: "chaussures", name: "Chaussures", category: "shopping", requires_time: false, requires_group: false },
  { id: "beaute_parfumerie", name: "Beauté / Parfumerie", category: "shopping", requires_time: false, requires_group: false },
  { id: "optique", name: "Optique", category: "shopping", requires_time: false, requires_group: false },
  { id: "bijoux", name: "Bijoux", category: "shopping", requires_time: false, requires_group: false },
  { id: "maison_deco", name: "Maison / Déco", category: "shopping", requires_time: false, requires_group: false },
  { id: "epicerie_fine", name: "Épicerie fine", category: "shopping", requires_time: false, requires_group: false },
  { id: "artisanat", name: "Artisanat", category: "shopping", requires_time: false, requires_group: false },
  { id: "concept_store", name: "Concept store", category: "shopping", requires_time: false, requires_group: false },
  { id: "autres", name: "Autres", category: "shopping", requires_time: false, requires_group: false },
];

// ============================================
// ACTIVITY LOOKUP
// ============================================
export function getActivitiesByCategory(category: ActivityCategory): Activity[] {
  switch (category) {
    case "restaurants":
      return RESTAURANT_ACTIVITIES;
    case "sport":
      return SPORT_ACTIVITIES;
    case "loisirs":
      return LOISIRS_ACTIVITIES;
    case "hebergement":
      return HEBERGEMENT_ACTIVITIES;
    case "culture":
      return CULTURE_ACTIVITIES;
    case "shopping":
      return SHOPPING_ACTIVITIES;
    default:
      return [];
  }
}

export function getActivityById(activity_id: string): Activity | undefined {
  const allActivities = [
    ...RESTAURANT_ACTIVITIES,
    ...SPORT_ACTIVITIES,
    ...LOISIRS_ACTIVITIES,
    ...HEBERGEMENT_ACTIVITIES,
    ...CULTURE_ACTIVITIES,
    ...SHOPPING_ACTIVITIES,
  ];
  return allActivities.find((a) => a.id === activity_id);
}

// ============================================
// CATEGORY CONFIGURATIONS
// ============================================
export const CATEGORY_CONFIGS: Record<ActivityCategory, CategoryConfig> = {
  restaurants: {
    category: "restaurants",
    label: "Manger & Boire",
    icon: "UtensilsCrossed",
    fields: {
      city: true,
      activity_type: false,
      date: true,
      time: true,
      checkin_date: false,
      checkout_date: false,
      num_people: true,
      culinary_type: true,
      store_type: false,
    },
    conditional_num_people: false,
  },
  sport: {
    category: "sport",
    label: "Sport & Bien-être",
    icon: "Dumbbell",
    fields: {
      city: true,
      activity_type: true,
      date: true,
      time: true,
      checkin_date: false,
      checkout_date: false,
      num_people: true,
      culinary_type: false,
      store_type: false,
    },
    conditional_num_people: false,
  },
  loisirs: {
    category: "loisirs",
    label: "Loisirs",
    icon: "Zap",
    fields: {
      city: true,
      activity_type: true,
      date: true,
      time: true,
      checkin_date: false,
      checkout_date: false,
      num_people: true,
      culinary_type: false,
      store_type: false,
    },
    conditional_num_people: false,
  },
  hebergement: {
    category: "hebergement",
    label: "Hébergement",
    icon: "Building2",
    fields: {
      city: true,
      activity_type: true,
      date: false,
      time: false,
      checkin_date: true,
      checkout_date: true,
      num_people: true,
      culinary_type: false,
      store_type: false,
    },
    conditional_num_people: false,
  },
  culture: {
    category: "culture",
    label: "Culture",
    icon: "Landmark",
    fields: {
      city: true,
      activity_type: true,
      date: true,
      time: true,
      checkin_date: false,
      checkout_date: false,
      num_people: true,
      culinary_type: false,
      store_type: false,
    },
    conditional_num_people: false,
  },
  shopping: {
    category: "shopping",
    label: "Shopping",
    icon: "ShoppingBag",
    fields: {
      city: true,
      activity_type: false,
      date: false,
      time: false,
      checkin_date: false,
      checkout_date: false,
      num_people: false,
      culinary_type: false,
      store_type: true,
    },
    conditional_num_people: false,
  },
  rentacar: {
    category: "rentacar",
    label: "Se déplacer",
    icon: "Car",
    fields: {
      city: true,
      activity_type: true,
      date: false,
      time: false,
      checkin_date: true,
      checkout_date: true,
      num_people: false,
      culinary_type: false,
      store_type: false,
    },
    conditional_num_people: false,
  },
};

export function getCategoryConfig(category: ActivityCategory): CategoryConfig {
  return CATEGORY_CONFIGS[category];
}

// ============================================
// CATEGORY IMAGES FOR HOMEPAGE DISPLAY
// ============================================
export interface CategoryDisplayItem {
  id: string;
  name: string;
  imageUrl: string;
}

export const RESTAURANT_CUISINE_CATEGORIES: CategoryDisplayItem[] = [
  { id: "french", name: "Français", imageUrl: "/images/categories/french.jpg" },
  { id: "asian", name: "Asiatique", imageUrl: "/images/categories/asian.jpg" },
  { id: "italian", name: "Italien", imageUrl: "/images/categories/italian.jpg" },
  { id: "moroccan", name: "Cuisine traditionnelle", imageUrl: "/images/categories/moroccan.jpg" },
  { id: "japanese", name: "Japonais", imageUrl: "/images/categories/japanese.jpg" },
  { id: "oriental", name: "Oriental", imageUrl: "/images/categories/oriental.jpg" },
  { id: "steakhouse", name: "Steakhouse", imageUrl: "/images/categories/steakhouse.jpg" },
  { id: "brunch", name: "Brunch", imageUrl: "/images/categories/brunch.jpg" },
  { id: "cafe", name: "Café", imageUrl: "/images/categories/cafe.jpg" },
];

export const SPORT_DISPLAY_CATEGORIES: CategoryDisplayItem[] = [
  { id: "hammam", name: "Hammam", imageUrl: "/images/categories/hammam.jpg" },
  { id: "spa", name: "Spa", imageUrl: "/images/categories/spa.jpg" },
  { id: "massage", name: "Massage", imageUrl: "/images/categories/massage.jpg" },
  { id: "institut_beaute", name: "Institut beauté", imageUrl: "/images/categories/beauty.jpg" },
  { id: "barber", name: "Coiffeur / Barber", imageUrl: "/images/categories/barber.jpg" },
  { id: "yoga_pilates", name: "Yoga / Pilates", imageUrl: "/images/categories/yoga.jpg" },
  { id: "salle_sport", name: "Salle de sport", imageUrl: "/images/categories/gym.jpg" },
  { id: "padel", name: "Padel", imageUrl: "/images/categories/padel.jpg" },
  { id: "tennis", name: "Tennis", imageUrl: "/images/categories/tennis.jpg" },
];

export const LOISIRS_DISPLAY_CATEGORIES: CategoryDisplayItem[] = [
  { id: "escape_game", name: "Escape game", imageUrl: "/images/categories/escape.jpg" },
  { id: "karting", name: "Karting", imageUrl: "/images/categories/karting.jpg" },
  { id: "quad_buggy", name: "Quad / Buggy", imageUrl: "/images/categories/quad.jpg" },
  { id: "jet_ski_paddle", name: "Jet ski / Paddle", imageUrl: "/images/categories/jetski.jpg" },
  { id: "parachute_parapente", name: "Parachute / Parapente", imageUrl: "/images/categories/parachute.jpg" },
  { id: "golf", name: "Golf", imageUrl: "/images/categories/golf.jpg" },
  { id: "bowling", name: "Bowling", imageUrl: "/images/categories/bowling.jpg" },
  { id: "aquapark", name: "Aquapark", imageUrl: "/images/categories/aquapark.jpg" },
];

export const HEBERGEMENT_DISPLAY_CATEGORIES: CategoryDisplayItem[] = [
  { id: "hotel", name: "Hôtel", imageUrl: "/images/categories/hotel.jpg" },
  { id: "riad", name: "Riad", imageUrl: "/images/categories/riad.jpg" },
  { id: "maison_hotes", name: "Maison d'hôtes", imageUrl: "/images/categories/guesthouse.jpg" },
  { id: "appartement", name: "Appartement", imageUrl: "/images/categories/apartment.jpg" },
  { id: "villa", name: "Villa", imageUrl: "/images/categories/villa.jpg" },
  { id: "resort", name: "Resort", imageUrl: "/images/categories/resort.jpg" },
];

export const CULTURE_DISPLAY_CATEGORIES: CategoryDisplayItem[] = [
  { id: "visite_guidee", name: "Visite guidée", imageUrl: "/images/categories/tour.jpg" },
  { id: "musee_monument", name: "Musée / Monument", imageUrl: "/images/categories/museum.jpg" },
  { id: "theatre", name: "Théâtre", imageUrl: "/images/categories/theatre.jpg" },
  { id: "concert", name: "Concert", imageUrl: "/images/categories/concert.jpg" },
  { id: "expo", name: "Expo", imageUrl: "/images/categories/expo.jpg" },
  { id: "atelier", name: "Atelier", imageUrl: "/images/categories/workshop.jpg" },
];

export const SHOPPING_DISPLAY_CATEGORIES: CategoryDisplayItem[] = [
  { id: "mode", name: "Mode", imageUrl: "/images/categories/fashion.jpg" },
  { id: "chaussures", name: "Chaussures", imageUrl: "/images/categories/shoes.jpg" },
  { id: "beaute_parfumerie", name: "Beauté / Parfumerie", imageUrl: "/images/categories/perfume.jpg" },
  { id: "bijoux", name: "Bijoux", imageUrl: "/images/categories/jewelry.jpg" },
  { id: "maison_deco", name: "Maison / Déco", imageUrl: "/images/categories/deco.jpg" },
  { id: "artisanat", name: "Artisanat", imageUrl: "/images/categories/crafts.jpg" },
];

export function getCategoryDisplayItems(category: ActivityCategory): CategoryDisplayItem[] {
  switch (category) {
    case "restaurants":
      return RESTAURANT_CUISINE_CATEGORIES;
    case "sport":
      return SPORT_DISPLAY_CATEGORIES;
    case "loisirs":
      return LOISIRS_DISPLAY_CATEGORIES;
    case "hebergement":
      return HEBERGEMENT_DISPLAY_CATEGORIES;
    case "culture":
      return CULTURE_DISPLAY_CATEGORIES;
    case "shopping":
      return SHOPPING_DISPLAY_CATEGORIES;
    default:
      return [];
  }
}

// ============================================
// FILTER OPTIONS - Used for search/filter functionality
// ============================================

/**
 * Complete list of cuisine types for restaurants
 * These are used in the filter UI on the results page
 */
export const CUISINE_TYPES = [
  "Afghan",
  "Africain",
  "Afternoon Tea",
  "Algérien",
  "Allemand",
  "Alsacien",
  "Américain",
  "Anglais",
  "Argentin",
  "Asiatique",
  "Auvergnat",
  "Basque",
  "Bouchon lyonnais",
  "Brésilien",
  "Cambodgien",
  "Canadien",
  "Chinois",
  "Colombien",
  "Coréen",
  "Corse",
  "Créole",
  "Crêperie",
  "Cubain",
  "Cuisine des îles",
  "Cuisine du monde",
  "Cuisine suisse",
  "Cuisine traditionnelle",
  "Égyptien",
  "Espagnol",
  "Éthiopien",
  "Europe de l'Est",
  "Français",
  "Franco-belge",
  "Fruits de mer",
  "Fusion",
  "Grec",
  "Hawaïen",
  "Indien",
  "Iranien",
  "Israélien",
  "Italien",
  "Japonais",
  "Latino",
  "Libanais",
  "Marocain",
  "Méditerranéen",
  "Mexicain",
  "Oriental",
  "Pakistanais",
  "Péruvien",
  "Portugais",
  "Provençal",
  "Russe",
  "Savoyard",
  "Scandinave",
  "Steakhouse",
  "Sud-Ouest",
  "Syrien",
  "Thaïlandais",
  "Tunisien",
  "Turc",
  "Vegan",
  "Végétarien",
  "Vénézuélien",
  "Vietnamien",
] as const;

export type CuisineType = typeof CUISINE_TYPES[number];

/**
 * Ambiance types for restaurants and other establishments
 */
export const AMBIANCE_TYPES = [
  "Romantique",
  "Décontracté",
  "Familial",
  "Branché",
  "Cosy",
  "Terrasse",
  "Rooftop",
  "Vue panoramique",
  "Design",
  "Traditionnel",
  "Festif",
  "Intimiste",
  "Business",
  "Gastronomique",
  "Lounge",
  "Live music",
  "En plein air",
  "Bord de mer",
  "Piscine",
  "Jardin",
] as const;

export type AmbianceType = typeof AMBIANCE_TYPES[number];

/**
 * Price range options
 */
export const PRICE_RANGES = [
  { id: "budget", label: "€", description: "Moins de 20€", min: 0, max: 20 },
  { id: "moderate", label: "€€", description: "20€ - 40€", min: 20, max: 40 },
  { id: "upscale", label: "€€€", description: "40€ - 80€", min: 40, max: 80 },
  { id: "luxury", label: "€€€€", description: "Plus de 80€", min: 80, max: 999 },
] as const;

export type PriceRange = typeof PRICE_RANGES[number]["id"];

// ============================================
// SPORT & BIEN-ÊTRE FILTER OPTIONS
// ============================================

/**
 * Sport & Wellness specialties/types for filtering
 */
export const SPORT_SPECIALTIES = [
  "Hammam traditionnel",
  "Hammam moderne",
  "Spa de luxe",
  "Day spa",
  "Massage relaxant",
  "Massage sportif",
  "Massage thaïlandais",
  "Massage aux pierres chaudes",
  "Réflexologie",
  "Soins du visage",
  "Soins du corps",
  "Gommage",
  "Enveloppement",
  "Manucure",
  "Pédicure",
  "Épilation",
  "Coiffure femme",
  "Coiffure homme",
  "Barbier",
  "Coloration",
  "Yoga Hatha",
  "Yoga Vinyasa",
  "Yoga Kundalini",
  "Pilates",
  "Méditation",
  "Fitness",
  "CrossFit",
  "Musculation",
  "Cardio",
  "HIIT",
  "Zumba",
  "Aquagym",
  "Natation",
  "Arts martiaux",
  "Boxe",
  "MMA",
  "Padel",
  "Tennis",
  "Squash",
  "Badminton",
  "Football",
  "Basketball",
  "Escalade",
] as const;

export type SportSpecialty = typeof SPORT_SPECIALTIES[number];

/**
 * Sport equipment/amenities
 */
export const SPORT_AMENITIES = [
  "Vestiaires",
  "Douches",
  "Sauna",
  "Hammam",
  "Jacuzzi",
  "Piscine",
  "Parking",
  "Wi-Fi",
  "Serviettes fournies",
  "Casiers",
  "Coach disponible",
  "Cours collectifs",
  "Espace détente",
  "Bar à jus",
  "Boutique",
  "Accessible PMR",
] as const;

export type SportAmenity = typeof SPORT_AMENITIES[number];

// ============================================
// LOISIRS FILTER OPTIONS
// ============================================

/**
 * Leisure activity specialties
 */
export const LOISIRS_SPECIALTIES = [
  "Escape game horreur",
  "Escape game aventure",
  "Escape game enquête",
  "Escape game famille",
  "Karting indoor",
  "Karting outdoor",
  "Quad",
  "Buggy",
  "Jet ski",
  "Paddle",
  "Kayak",
  "Canoë",
  "Surf",
  "Kitesurf",
  "Wakeboard",
  "Plongée",
  "Snorkeling",
  "Parachute",
  "Parapente",
  "Saut à l'élastique",
  "Tyrolienne",
  "Accrobranche",
  "Golf 18 trous",
  "Golf 9 trous",
  "Mini-golf",
  "Bowling",
  "Billard",
  "Laser game",
  "Paintball",
  "Airsoft",
  "Réalité virtuelle",
  "Simulateur",
  "Karaoké",
  "Parc d'attractions",
  "Parc aquatique",
  "Zoo",
  "Aquarium",
  "Balade à cheval",
  "Balade en chameau",
  "Randonnée",
  "VTT",
  "Trottinette électrique",
  "Segway",
] as const;

export type LoisirsSpecialty = typeof LOISIRS_SPECIALTIES[number];

/**
 * Leisure target audience
 */
export const LOISIRS_PUBLIC = [
  "Famille",
  "Enfants",
  "Adolescents",
  "Adultes",
  "Couples",
  "Groupes",
  "Team building",
  "EVG/EVJF",
  "Anniversaire",
] as const;

export type LoisirsPublic = typeof LOISIRS_PUBLIC[number];

// ============================================
// HÉBERGEMENT FILTER OPTIONS
// ============================================

/**
 * Accommodation types
 */
export const HEBERGEMENT_TYPES = [
  "Hôtel 5 étoiles",
  "Hôtel 4 étoiles",
  "Hôtel 3 étoiles",
  "Hôtel 2 étoiles",
  "Hôtel boutique",
  "Palace",
  "Resort",
  "Riad traditionnel",
  "Riad de luxe",
  "Maison d'hôtes",
  "Chambre d'hôtes",
  "Villa",
  "Appartement",
  "Studio",
  "Loft",
  "Auberge",
  "Gîte",
  "Chalet",
  "Bungalow",
  "Glamping",
  "Camping",
] as const;

export type HebergementType = typeof HEBERGEMENT_TYPES[number];

/**
 * Hotel/Accommodation amenities
 */
export const HOTEL_AMENITIES = [
  "Piscine intérieure",
  "Piscine extérieure",
  "Piscine chauffée",
  "Spa",
  "Hammam",
  "Sauna",
  "Jacuzzi",
  "Salle de sport",
  "Restaurant",
  "Bar",
  "Room service",
  "Petit-déjeuner inclus",
  "Demi-pension",
  "Pension complète",
  "All inclusive",
  "Parking gratuit",
  "Parking payant",
  "Wi-Fi gratuit",
  "Climatisation",
  "Chauffage",
  "Terrasse",
  "Balcon",
  "Jardin",
  "Vue sur mer",
  "Vue sur montagne",
  "Vue sur piscine",
  "Animaux acceptés",
  "Accessible PMR",
  "Ascenseur",
  "Conciergerie",
  "Bagagerie",
  "Navette aéroport",
  "Location de voiture",
  "Business center",
  "Salle de réunion",
  "Kids club",
  "Aire de jeux",
  "Plage privée",
  "Golf",
  "Tennis",
  "Cuisine équipée",
  "Lave-linge",
  "Coffre-fort",
  "Minibar",
] as const;

export type HotelAmenity = typeof HOTEL_AMENITIES[number];

/**
 * Room types
 */
export const ROOM_TYPES = [
  "Chambre simple",
  "Chambre double",
  "Chambre twin",
  "Chambre triple",
  "Chambre familiale",
  "Suite",
  "Suite junior",
  "Suite présidentielle",
  "Penthouse",
  "Duplex",
  "Villa privée",
] as const;

export type RoomType = typeof ROOM_TYPES[number];

// ============================================
// CULTURE FILTER OPTIONS
// ============================================

/**
 * Culture activity types
 */
export const CULTURE_TYPES = [
  "Musée d'art",
  "Musée d'histoire",
  "Musée des sciences",
  "Musée ethnographique",
  "Galerie d'art",
  "Exposition temporaire",
  "Exposition permanente",
  "Monument historique",
  "Palais",
  "Château",
  "Médina",
  "Site archéologique",
  "Ruines",
  "Mosquée",
  "Église",
  "Synagogue",
  "Théâtre",
  "Opéra",
  "Salle de concert",
  "Festival",
  "Spectacle",
  "Concert",
  "Ballet",
  "Danse traditionnelle",
  "Visite guidée",
  "Visite audioguidée",
  "Visite nocturne",
  "Atelier créatif",
  "Atelier artisanat",
  "Cours de cuisine",
  "Cours de poterie",
  "Cours de calligraphie",
  "Dégustation",
  "Œnologie",
] as const;

export type CultureType = typeof CULTURE_TYPES[number];

/**
 * Culture target audience
 */
export const CULTURE_PUBLIC = [
  "Tout public",
  "Famille",
  "Enfants",
  "Adultes",
  "Seniors",
  "Scolaires",
  "Groupes",
  "Passionnés",
] as const;

export type CulturePublic = typeof CULTURE_PUBLIC[number];

// ============================================
// SHOPPING FILTER OPTIONS
// ============================================

/**
 * Shopping store types
 */
export const SHOPPING_TYPES = [
  "Mode femme",
  "Mode homme",
  "Mode enfant",
  "Mode bébé",
  "Prêt-à-porter",
  "Haute couture",
  "Créateur",
  "Vintage",
  "Seconde main",
  "Chaussures femme",
  "Chaussures homme",
  "Chaussures enfant",
  "Maroquinerie",
  "Sacs",
  "Accessoires",
  "Bijoux fantaisie",
  "Bijoux précieux",
  "Montres",
  "Lunettes",
  "Parfumerie",
  "Cosmétiques",
  "Soins",
  "Maquillage",
  "Décoration",
  "Mobilier",
  "Luminaires",
  "Art de la table",
  "Linge de maison",
  "Tapis",
  "Artisanat local",
  "Artisanat marocain",
  "Poterie",
  "Céramique",
  "Textile",
  "Cuir",
  "Épicerie fine",
  "Traiteur",
  "Pâtisserie",
  "Chocolaterie",
  "Cave à vin",
  "Thé et café",
  "Produits du terroir",
  "Bio",
  "Concept store",
  "Multimarques",
  "Centre commercial",
  "Souk",
  "Marché",
] as const;

export type ShoppingType = typeof SHOPPING_TYPES[number];

/**
 * Shopping services
 */
export const SHOPPING_SERVICES = [
  "Personal shopper",
  "Retouches",
  "Livraison",
  "Click & collect",
  "Emballage cadeau",
  "Carte cadeau",
  "Programme fidélité",
  "Paiement en plusieurs fois",
  "Détaxe",
] as const;

export type ShoppingService = typeof SHOPPING_SERVICES[number];

// ============================================
// RENTACAR (SE DÉPLACER) FILTER OPTIONS
// ============================================

/**
 * Vehicle types for rental
 */
export const VEHICLE_TYPES = [
  "Citadine",
  "Compacte",
  "Berline",
  "SUV",
  "4x4",
  "Crossover",
  "Monospace",
  "Break",
  "Coupé",
  "Cabriolet",
  "Pick-up",
  "Utilitaire",
  "Minibus",
  "Van",
  "Camping-car",
  "Moto",
  "Scooter",
  "Quad",
  "Vélo",
  "Vélo électrique",
  "Trottinette électrique",
  "Voiture de luxe",
  "Voiture de sport",
  "Voiture électrique",
  "Voiture hybride",
  "Voiture avec chauffeur",
] as const;

export type VehicleType = typeof VEHICLE_TYPES[number];

/**
 * Vehicle fuel types
 */
export const FUEL_TYPES = [
  "Essence",
  "Diesel",
  "Électrique",
  "Hybride",
  "GPL",
] as const;

export type FuelType = typeof FUEL_TYPES[number];

/**
 * Transmission types
 */
export const TRANSMISSION_TYPES = [
  "Manuelle",
  "Automatique",
] as const;

export type TransmissionType = typeof TRANSMISSION_TYPES[number];

/**
 * Vehicle features/amenities
 */
export const VEHICLE_FEATURES = [
  "Climatisation",
  "GPS",
  "Bluetooth",
  "USB",
  "Caméra de recul",
  "Régulateur de vitesse",
  "Sièges chauffants",
  "Sièges en cuir",
  "Toit ouvrant",
  "Aide au stationnement",
  "Apple CarPlay",
  "Android Auto",
  "Siège bébé disponible",
  "Siège enfant disponible",
  "Galerie de toit",
  "Coffre de toit",
  "Attelage",
  "Chaînes neige",
  "Pneus hiver",
  "Wifi embarqué",
  "Chargeur téléphone",
  "Écran tactile",
] as const;

export type VehicleFeature = typeof VEHICLE_FEATURES[number];

/**
 * Rental services
 */
export const RENTAL_SERVICES = [
  "Kilométrage illimité",
  "Assurance tous risques",
  "Assistance 24h/24",
  "Livraison à l'aéroport",
  "Livraison à domicile",
  "Livraison en ville",
  "Retour flexible",
  "Annulation gratuite",
  "Deuxième conducteur gratuit",
  "Conducteur supplémentaire",
  "Jeune conducteur accepté",
  "Sans franchise",
  "Protection vol",
  "Protection bris de glace",
  "Paiement à la livraison",
  "Réservation instantanée",
] as const;

export type RentalService = typeof RENTAL_SERVICES[number];

/**
 * Vehicle brands (popular in Morocco)
 */
export const VEHICLE_BRANDS = [
  "Audi",
  "BMW",
  "Citroën",
  "Dacia",
  "Fiat",
  "Ford",
  "Honda",
  "Hyundai",
  "Kia",
  "Land Rover",
  "Mazda",
  "Mercedes-Benz",
  "Nissan",
  "Opel",
  "Peugeot",
  "Porsche",
  "Range Rover",
  "Renault",
  "Seat",
  "Skoda",
  "Toyota",
  "Volkswagen",
  "Volvo",
] as const;

export type VehicleBrand = typeof VEHICLE_BRANDS[number];

/**
 * Get filter options for a specific universe
 */
export function getUniverseFilterOptions(universe: ActivityCategory) {
  switch (universe) {
    case "restaurants":
      return {
        cuisineTypes: CUISINE_TYPES,
        ambiances: AMBIANCE_TYPES,
        priceRanges: PRICE_RANGES,
      };
    case "sport":
      return {
        specialties: SPORT_SPECIALTIES,
        amenities: SPORT_AMENITIES,
        ambiances: AMBIANCE_TYPES,
      };
    case "loisirs":
      return {
        specialties: LOISIRS_SPECIALTIES,
        targetPublic: LOISIRS_PUBLIC,
      };
    case "hebergement":
      return {
        types: HEBERGEMENT_TYPES,
        amenities: HOTEL_AMENITIES,
        roomTypes: ROOM_TYPES,
        priceRanges: PRICE_RANGES,
      };
    case "culture":
      return {
        types: CULTURE_TYPES,
        targetPublic: CULTURE_PUBLIC,
      };
    case "shopping":
      return {
        types: SHOPPING_TYPES,
        services: SHOPPING_SERVICES,
      };
    case "rentacar":
      return {
        vehicleTypes: VEHICLE_TYPES,
        fuelTypes: FUEL_TYPES,
        transmissionTypes: TRANSMISSION_TYPES,
        features: VEHICLE_FEATURES,
        services: RENTAL_SERVICES,
        brands: VEHICLE_BRANDS,
      };
    default:
      return {};
  }
}

/**
 * Filter available options based on what exists in establishments
 */
export function filterAvailableOptions<T extends string>(
  allOptions: readonly T[],
  availableInEstablishments: T[]
): T[] {
  const availableSet = new Set(availableInEstablishments);
  return allOptions.filter((opt) => availableSet.has(opt)) as T[];
}
