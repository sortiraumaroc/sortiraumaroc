/**
 * Liste des 14 allergènes majeurs (réglementation européenne)
 * + quelques allergènes additionnels courants
 */

export type Allergen = {
  id: string;
  emoji: string;
  title: string;
  titleAr?: string;
  description?: string;
};

// Les 14 allergènes majeurs (obligation légale UE)
export const MAJOR_ALLERGENS: Allergen[] = [
  { id: "gluten", emoji: "🌾", title: "Gluten", description: "Blé, orge, seigle, avoine, épeautre..." },
  { id: "crustaces", emoji: "🦐", title: "Crustacés", description: "Crevettes, crabes, homard, langoustines..." },
  { id: "oeufs", emoji: "🥚", title: "Œufs", description: "Œufs et produits à base d'œufs" },
  { id: "poisson", emoji: "🐟", title: "Poisson", description: "Poissons et produits à base de poisson" },
  { id: "arachides", emoji: "🥜", title: "Arachides", description: "Cacahuètes et produits dérivés" },
  { id: "soja", emoji: "🫘", title: "Soja", description: "Soja et produits à base de soja" },
  { id: "lait", emoji: "🥛", title: "Lait", description: "Lait et produits laitiers (lactose inclus)" },
  { id: "fruits_coques", emoji: "🌰", title: "Fruits à coque", description: "Amandes, noisettes, noix, pistaches..." },
  { id: "celeri", emoji: "🥬", title: "Céleri", description: "Céleri et produits à base de céleri" },
  { id: "moutarde", emoji: "🟡", title: "Moutarde", description: "Moutarde et produits dérivés" },
  { id: "sesame", emoji: "⚪", title: "Sésame", description: "Graines de sésame et produits dérivés" },
  { id: "sulfites", emoji: "🍷", title: "Sulfites", description: "Anhydride sulfureux et sulfites (> 10mg/kg)" },
  { id: "lupin", emoji: "🌸", title: "Lupin", description: "Lupin et produits à base de lupin" },
  { id: "mollusques", emoji: "🦪", title: "Mollusques", description: "Huîtres, moules, escargots, calamars..." },
];

// Allergènes additionnels courants (non obligatoires mais utiles)
export const ADDITIONAL_ALLERGENS: Allergen[] = [
  { id: "alcool", emoji: "🍺", title: "Alcool", description: "Contient de l'alcool" },
  { id: "porc", emoji: "🐷", title: "Porc", description: "Contient du porc ou dérivés" },
  { id: "boeuf", emoji: "🐄", title: "Bœuf", description: "Contient du bœuf" },
];

// Tous les allergènes
export const ALL_ALLERGENS: Allergen[] = [...MAJOR_ALLERGENS, ...ADDITIONAL_ALLERGENS];

// Map pour accès rapide par ID
const allergensMap = new Map(ALL_ALLERGENS.map((a) => [a.id, a]));

export function allergenById(id: string): Allergen | undefined {
  return allergensMap.get(id);
}

// Normaliser une liste d'allergènes (filtrer les invalides)
export function normalizeAllergens(ids: string[]): string[] {
  return ids.filter((id) => allergensMap.has(id));
}

/**
 * Régimes alimentaires / préférences
 */
export type DietaryPreference = {
  id: string;
  emoji: string;
  title: string;
  description?: string;
};

export const DIETARY_PREFERENCES: DietaryPreference[] = [
  { id: "vegetarien", emoji: "🥬", title: "Végétarien", description: "Sans viande ni poisson" },
  { id: "vegan", emoji: "🌱", title: "Végan", description: "Sans produit d'origine animale" },
  { id: "halal", emoji: "☪️", title: "Halal", description: "Conforme aux prescriptions islamiques" },
  { id: "casher", emoji: "✡️", title: "Casher", description: "Conforme aux prescriptions juives" },
  { id: "sans_gluten", emoji: "🚫🌾", title: "Sans gluten", description: "Convient aux intolérants au gluten" },
  { id: "sans_lactose", emoji: "🚫🥛", title: "Sans lactose", description: "Convient aux intolérants au lactose" },
  { id: "bio", emoji: "🌿", title: "Bio", description: "Ingrédients issus de l'agriculture biologique" },
  { id: "local", emoji: "📍", title: "Local", description: "Produit avec des ingrédients locaux" },
];

const dietaryMap = new Map(DIETARY_PREFERENCES.map((d) => [d.id, d]));

export function dietaryById(id: string): DietaryPreference | undefined {
  return dietaryMap.get(id);
}

export function normalizeDietary(ids: string[]): string[] {
  return ids.filter((id) => dietaryMap.has(id));
}

/**
 * Niveaux d'épice
 */
export const SPICY_LEVELS = [
  { id: "none", emoji: "", title: "Non épicé", level: 0 },
  { id: "mild", emoji: "🌶️", title: "Légèrement épicé", level: 1 },
  { id: "medium", emoji: "🌶️🌶️", title: "Moyennement épicé", level: 2 },
  { id: "hot", emoji: "🌶️🌶️🌶️", title: "Épicé", level: 3 },
  { id: "very_hot", emoji: "🌶️🌶️🌶️🌶️", title: "Très épicé", level: 4 },
] as const;

export type SpicyLevel = (typeof SPICY_LEVELS)[number]["id"];

// ============================================================================
// MÉTADONNÉES PAR UNIVERS
// ============================================================================

export type MetaOption = {
  id: string;
  emoji: string;
  title: string;
  description?: string;
};

// --- HÉBERGEMENT ---
export const ROOM_AMENITIES: MetaOption[] = [
  { id: "wifi", emoji: "📶", title: "WiFi", description: "Connexion WiFi gratuite" },
  { id: "climatisation", emoji: "❄️", title: "Climatisation", description: "Climatisation réversible" },
  { id: "tv", emoji: "📺", title: "TV", description: "Télévision écran plat" },
  { id: "minibar", emoji: "🍾", title: "Minibar", description: "Minibar approvisionné" },
  { id: "coffre_fort", emoji: "🔐", title: "Coffre-fort", description: "Coffre-fort dans la chambre" },
  { id: "balcon", emoji: "🌅", title: "Balcon/Terrasse", description: "Balcon ou terrasse privée" },
  { id: "baignoire", emoji: "🛁", title: "Baignoire", description: "Salle de bain avec baignoire" },
  { id: "douche", emoji: "🚿", title: "Douche", description: "Douche à l'italienne" },
  { id: "jacuzzi", emoji: "🌊", title: "Jacuzzi", description: "Jacuzzi privatif" },
  { id: "piscine_privee", emoji: "🏊", title: "Piscine privée", description: "Piscine privée" },
  { id: "cuisine", emoji: "🍳", title: "Cuisine/Kitchenette", description: "Espace cuisine équipé" },
  { id: "machine_cafe", emoji: "☕", title: "Machine à café", description: "Machine à café Nespresso" },
  { id: "seche_cheveux", emoji: "💇", title: "Sèche-cheveux", description: "Sèche-cheveux fourni" },
  { id: "fer_repasser", emoji: "👔", title: "Fer à repasser", description: "Fer et planche à repasser" },
  { id: "peignoir", emoji: "🥋", title: "Peignoir", description: "Peignoirs et chaussons" },
  { id: "insonorisation", emoji: "🔇", title: "Insonorisé", description: "Chambre insonorisée" },
  { id: "vue_mer", emoji: "🌊", title: "Vue mer", description: "Vue sur la mer" },
  { id: "vue_piscine", emoji: "🏊", title: "Vue piscine", description: "Vue sur la piscine" },
  { id: "vue_jardin", emoji: "🌳", title: "Vue jardin", description: "Vue sur le jardin" },
  { id: "animaux", emoji: "🐕", title: "Animaux acceptés", description: "Les animaux sont acceptés" },
];

export const ROOM_BED_TYPES: MetaOption[] = [
  { id: "lit_simple", emoji: "🛏️", title: "Lit simple", description: "1 lit simple (90cm)" },
  { id: "lit_double", emoji: "🛏️", title: "Lit double", description: "1 lit double (140cm)" },
  { id: "lit_queen", emoji: "🛏️", title: "Lit Queen", description: "1 lit Queen Size (160cm)" },
  { id: "lit_king", emoji: "👑", title: "Lit King", description: "1 lit King Size (180cm)" },
  { id: "lits_jumeaux", emoji: "🛏️🛏️", title: "Lits jumeaux", description: "2 lits simples séparés" },
  { id: "canape_lit", emoji: "🛋️", title: "Canapé-lit", description: "Canapé convertible" },
  { id: "lit_superpose", emoji: "🛏️", title: "Lits superposés", description: "Lits superposés" },
];

// --- SPORT & BIEN-ÊTRE ---
export const SPORT_DIFFICULTY: MetaOption[] = [
  { id: "debutant", emoji: "🌱", title: "Débutant", description: "Aucune expérience requise" },
  { id: "intermediaire", emoji: "📈", title: "Intermédiaire", description: "Connaissance de base requise" },
  { id: "avance", emoji: "🏆", title: "Avancé", description: "Bonne maîtrise requise" },
  { id: "expert", emoji: "⭐", title: "Expert", description: "Niveau professionnel" },
  { id: "tous_niveaux", emoji: "👥", title: "Tous niveaux", description: "Adapté à tous les niveaux" },
];

export const SPORT_EQUIPMENT: MetaOption[] = [
  { id: "equipement_fourni", emoji: "✅", title: "Équipement fourni", description: "Tout le matériel est fourni" },
  { id: "tenue_requise", emoji: "👟", title: "Tenue adaptée requise", description: "Prévoir une tenue de sport" },
  { id: "serviette_fournie", emoji: "🧺", title: "Serviette fournie", description: "Serviettes à disposition" },
  { id: "casier", emoji: "🔒", title: "Casiers", description: "Casiers disponibles" },
  { id: "douche", emoji: "🚿", title: "Douches", description: "Vestiaires avec douches" },
  { id: "parking", emoji: "🅿️", title: "Parking", description: "Parking gratuit" },
];

// --- LOISIRS ---
export const LOISIRS_AGE: MetaOption[] = [
  { id: "tous_ages", emoji: "👨‍👩‍👧‍👦", title: "Tous âges", description: "Convient à tous les âges" },
  { id: "enfants_3plus", emoji: "🧒", title: "3 ans et +", description: "À partir de 3 ans" },
  { id: "enfants_6plus", emoji: "👦", title: "6 ans et +", description: "À partir de 6 ans" },
  { id: "enfants_12plus", emoji: "🧑", title: "12 ans et +", description: "À partir de 12 ans" },
  { id: "adultes_16plus", emoji: "🧑", title: "16 ans et +", description: "À partir de 16 ans" },
  { id: "adultes_18plus", emoji: "🔞", title: "18 ans et +", description: "Réservé aux adultes" },
];

export const LOISIRS_DURATION: MetaOption[] = [
  { id: "30min", emoji: "⏱️", title: "30 min", description: "Environ 30 minutes" },
  { id: "1h", emoji: "⏱️", title: "1 heure", description: "Environ 1 heure" },
  { id: "2h", emoji: "⏱️", title: "2 heures", description: "Environ 2 heures" },
  { id: "demi_journee", emoji: "🌤️", title: "Demi-journée", description: "3-4 heures" },
  { id: "journee", emoji: "☀️", title: "Journée", description: "6-8 heures" },
  { id: "multi_jours", emoji: "📅", title: "Multi-jours", description: "Plusieurs jours" },
];

// --- LOCATION VÉHICULES ---
export const VEHICLE_TYPE: MetaOption[] = [
  { id: "citadine", emoji: "🚗", title: "Citadine", description: "Petite voiture urbaine" },
  { id: "compacte", emoji: "🚙", title: "Compacte", description: "Voiture compacte" },
  { id: "berline", emoji: "🚘", title: "Berline", description: "Berline confortable" },
  { id: "suv", emoji: "🚙", title: "SUV", description: "SUV / Crossover" },
  { id: "4x4", emoji: "🚗", title: "4x4", description: "Véhicule tout-terrain" },
  { id: "monospace", emoji: "🚐", title: "Monospace", description: "Monospace / Van" },
  { id: "utilitaire", emoji: "🚚", title: "Utilitaire", description: "Véhicule utilitaire" },
  { id: "luxe", emoji: "💎", title: "Luxe", description: "Voiture de luxe" },
  { id: "sportive", emoji: "🏎️", title: "Sportive", description: "Voiture sportive" },
  { id: "cabriolet", emoji: "🚗", title: "Cabriolet", description: "Décapotable" },
  { id: "moto", emoji: "🏍️", title: "Moto", description: "Moto" },
  { id: "scooter", emoji: "🛵", title: "Scooter", description: "Scooter" },
  { id: "quad", emoji: "🏍️", title: "Quad", description: "Quad / ATV" },
  { id: "buggy", emoji: "🏎️", title: "Buggy", description: "Buggy des sables" },
];

export const VEHICLE_FEATURES: MetaOption[] = [
  { id: "automatique", emoji: "🅰️", title: "Automatique", description: "Boîte automatique" },
  { id: "manuelle", emoji: "⚙️", title: "Manuelle", description: "Boîte manuelle" },
  { id: "diesel", emoji: "⛽", title: "Diesel", description: "Moteur diesel" },
  { id: "essence", emoji: "⛽", title: "Essence", description: "Moteur essence" },
  { id: "electrique", emoji: "⚡", title: "Électrique", description: "Véhicule électrique" },
  { id: "hybride", emoji: "🔋", title: "Hybride", description: "Véhicule hybride" },
  { id: "gps", emoji: "📍", title: "GPS", description: "GPS inclus" },
  { id: "bluetooth", emoji: "📱", title: "Bluetooth", description: "Connexion Bluetooth" },
  { id: "siege_bebe", emoji: "👶", title: "Siège bébé", description: "Siège bébé disponible" },
  { id: "km_illimite", emoji: "🛣️", title: "Km illimité", description: "Kilométrage illimité" },
  { id: "assurance", emoji: "🛡️", title: "Assurance incluse", description: "Assurance tous risques" },
  { id: "chauffeur", emoji: "👨‍✈️", title: "Avec chauffeur", description: "Chauffeur inclus" },
];

// --- CULTURE ---
export const CULTURE_TYPE: MetaOption[] = [
  { id: "visite_libre", emoji: "🚶", title: "Visite libre", description: "Visite en autonomie" },
  { id: "visite_guidee", emoji: "🎙️", title: "Visite guidée", description: "Avec guide professionnel" },
  { id: "audio_guide", emoji: "🎧", title: "Audio-guide", description: "Audio-guide disponible" },
  { id: "atelier", emoji: "🎨", title: "Atelier", description: "Atelier pratique" },
  { id: "spectacle", emoji: "🎭", title: "Spectacle", description: "Spectacle / Performance" },
  { id: "concert", emoji: "🎵", title: "Concert", description: "Concert / Musique live" },
  { id: "exposition", emoji: "🖼️", title: "Exposition", description: "Exposition temporaire" },
  { id: "conference", emoji: "🎤", title: "Conférence", description: "Conférence / Talk" },
];

export const CULTURE_LANGUAGES: MetaOption[] = [
  { id: "francais", emoji: "🇫🇷", title: "Français", description: "Disponible en français" },
  { id: "arabe", emoji: "🇲🇦", title: "Arabe", description: "Disponible en arabe" },
  { id: "anglais", emoji: "🇬🇧", title: "Anglais", description: "Disponible en anglais" },
  { id: "espagnol", emoji: "🇪🇸", title: "Espagnol", description: "Disponible en espagnol" },
  { id: "allemand", emoji: "🇩🇪", title: "Allemand", description: "Disponible en allemand" },
  { id: "italien", emoji: "🇮🇹", title: "Italien", description: "Disponible en italien" },
];

export const ACCESSIBILITY_OPTIONS: MetaOption[] = [
  { id: "pmr", emoji: "♿", title: "Accessible PMR", description: "Accessible aux personnes à mobilité réduite" },
  { id: "ascenseur", emoji: "🛗", title: "Ascenseur", description: "Ascenseur disponible" },
  { id: "parking_pmr", emoji: "🅿️", title: "Parking PMR", description: "Places de parking handicapé" },
  { id: "chien_guide", emoji: "🦮", title: "Chien guide", description: "Chiens guides acceptés" },
  { id: "boucle_magnetique", emoji: "🔊", title: "Boucle magnétique", description: "Équipé pour malentendants" },
];

// ============================================================================
// CONFIGURATION DES MÉTADONNÉES PAR UNIVERS
// ============================================================================

export type UniverseMetaConfig = {
  showAllergens: boolean;
  showDietary: boolean;
  showSpicyLevel: boolean;
  sections: {
    id: string;
    title: string;
    options: MetaOption[];
    multiple: boolean; // true = checkbox multiple, false = radio single
  }[];
};

const RESTAURANT_META_CONFIG: UniverseMetaConfig = {
  showAllergens: true,
  showDietary: true,
  showSpicyLevel: true,
  sections: [],
};

const HEBERGEMENT_META_CONFIG: UniverseMetaConfig = {
  showAllergens: false,
  showDietary: false,
  showSpicyLevel: false,
  sections: [
    { id: "amenities", title: "Équipements de la chambre", options: ROOM_AMENITIES, multiple: true },
    { id: "bed_type", title: "Type de lit", options: ROOM_BED_TYPES, multiple: true },
    { id: "accessibility", title: "Accessibilité", options: ACCESSIBILITY_OPTIONS, multiple: true },
  ],
};

const SPORT_META_CONFIG: UniverseMetaConfig = {
  showAllergens: false,
  showDietary: false,
  showSpicyLevel: false,
  sections: [
    { id: "difficulty", title: "Niveau de difficulté", options: SPORT_DIFFICULTY, multiple: false },
    { id: "equipment", title: "Équipements & Services", options: SPORT_EQUIPMENT, multiple: true },
    { id: "duration", title: "Durée", options: LOISIRS_DURATION, multiple: false },
  ],
};

const LOISIRS_META_CONFIG: UniverseMetaConfig = {
  showAllergens: false,
  showDietary: false,
  showSpicyLevel: false,
  sections: [
    { id: "age", title: "Âge minimum", options: LOISIRS_AGE, multiple: false },
    { id: "duration", title: "Durée", options: LOISIRS_DURATION, multiple: false },
    { id: "accessibility", title: "Accessibilité", options: ACCESSIBILITY_OPTIONS, multiple: true },
  ],
};

const LOCATION_META_CONFIG: UniverseMetaConfig = {
  showAllergens: false,
  showDietary: false,
  showSpicyLevel: false,
  sections: [
    { id: "vehicle_type", title: "Type de véhicule", options: VEHICLE_TYPE, multiple: false },
    { id: "vehicle_features", title: "Caractéristiques", options: VEHICLE_FEATURES, multiple: true },
  ],
};

const CULTURE_META_CONFIG: UniverseMetaConfig = {
  showAllergens: false,
  showDietary: false,
  showSpicyLevel: false,
  sections: [
    { id: "visit_type", title: "Type de visite", options: CULTURE_TYPE, multiple: false },
    { id: "languages", title: "Langues disponibles", options: CULTURE_LANGUAGES, multiple: true },
    { id: "duration", title: "Durée", options: LOISIRS_DURATION, multiple: false },
    { id: "accessibility", title: "Accessibilité", options: ACCESSIBILITY_OPTIONS, multiple: true },
  ],
};

const SHOPPING_META_CONFIG: UniverseMetaConfig = {
  showAllergens: false,
  showDietary: false,
  showSpicyLevel: false,
  sections: [],
};

const META_CONFIG_BY_UNIVERSE: Record<string, UniverseMetaConfig> = {
  restaurants: RESTAURANT_META_CONFIG,
  restaurant: RESTAURANT_META_CONFIG,
  hebergement: HEBERGEMENT_META_CONFIG,
  hébergement: HEBERGEMENT_META_CONFIG,
  sport: SPORT_META_CONFIG,
  loisirs: LOISIRS_META_CONFIG,
  loisir: LOISIRS_META_CONFIG,
  culture: CULTURE_META_CONFIG,
  shopping: SHOPPING_META_CONFIG,
  location: LOCATION_META_CONFIG,
  rentacar: LOCATION_META_CONFIG,
};

/**
 * Récupère la configuration des métadonnées pour un univers donné
 */
export function getMetaConfigForUniverse(universe: string | null | undefined): UniverseMetaConfig {
  const u = (universe ?? "").toLowerCase().trim();
  return META_CONFIG_BY_UNIVERSE[u] ?? RESTAURANT_META_CONFIG;
}
