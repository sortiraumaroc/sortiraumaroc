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
