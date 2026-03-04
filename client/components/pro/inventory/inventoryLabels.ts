export type InventoryLabel = {
  id: string;
  emoji: string;
  title: string;
  badgeClassName: string;
};

// Labels communs à tous les univers
const COMMON_LABELS: InventoryLabel[] = [
  { id: "specialite", emoji: "⭐", title: "Spécialité", badgeClassName: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "best_seller", emoji: "🔥", title: "Best seller", badgeClassName: "bg-red-50 text-red-700 border-red-200" },
  { id: "coup_de_coeur", emoji: "❤️", title: "Coup de cœur", badgeClassName: "bg-pink-50 text-pink-700 border-pink-200" },
  { id: "nouveaute", emoji: "🆕", title: "Nouveauté", badgeClassName: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { id: "signature", emoji: "✨", title: "Signature", badgeClassName: "bg-purple-50 text-purple-700 border-purple-200" },
];

// Labels spécifiques Restaurant / Food & Drink
const RESTAURANT_LABELS: InventoryLabel[] = [
  ...COMMON_LABELS,
  { id: "suggestion_chef", emoji: "👨‍🍳", title: "Suggestion du chef", badgeClassName: "bg-slate-50 text-slate-700 border-slate-200" },
  { id: "vegetarien", emoji: "🌿", title: "Végétarien", badgeClassName: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "epice", emoji: "🌶", title: "Épicé", badgeClassName: "bg-orange-50 text-orange-700 border-orange-200" },
  { id: "fruits_de_mer", emoji: "🐟", title: "Fruits de mer", badgeClassName: "bg-sky-50 text-sky-700 border-sky-200" },
  { id: "healthy", emoji: "🥗", title: "Healthy", badgeClassName: "bg-lime-50 text-lime-800 border-lime-200" },
  { id: "traditionnel", emoji: "🇲🇦", title: "Traditionnel", badgeClassName: "bg-teal-50 text-teal-700 border-teal-200" },
];

// Labels spécifiques Hébergement
const HEBERGEMENT_LABELS: InventoryLabel[] = [
  ...COMMON_LABELS,
  { id: "vue_mer", emoji: "🌊", title: "Vue mer", badgeClassName: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "vue_piscine", emoji: "🏊", title: "Vue piscine", badgeClassName: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  { id: "vue_montagne", emoji: "🏔️", title: "Vue montagne", badgeClassName: "bg-slate-50 text-slate-700 border-slate-200" },
  { id: "suite", emoji: "👑", title: "Suite", badgeClassName: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "familiale", emoji: "👨‍👩‍👧‍👦", title: "Familiale", badgeClassName: "bg-green-50 text-green-700 border-green-200" },
  { id: "romantique", emoji: "💕", title: "Romantique", badgeClassName: "bg-pink-50 text-pink-700 border-pink-200" },
  { id: "accessible", emoji: "♿", title: "Accessible PMR", badgeClassName: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { id: "petit_dejeuner", emoji: "🥐", title: "Petit-déj inclus", badgeClassName: "bg-orange-50 text-orange-700 border-orange-200" },
];

// Labels spécifiques Sport & Bien-être
const SPORT_LABELS: InventoryLabel[] = [
  ...COMMON_LABELS,
  { id: "debutant", emoji: "🌱", title: "Débutant", badgeClassName: "bg-green-50 text-green-700 border-green-200" },
  { id: "intermediaire", emoji: "📈", title: "Intermédiaire", badgeClassName: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  { id: "avance", emoji: "🏆", title: "Avancé", badgeClassName: "bg-orange-50 text-orange-700 border-orange-200" },
  { id: "solo", emoji: "🧘", title: "Solo", badgeClassName: "bg-purple-50 text-purple-700 border-purple-200" },
  { id: "duo", emoji: "👫", title: "Duo", badgeClassName: "bg-pink-50 text-pink-700 border-pink-200" },
  { id: "groupe", emoji: "👥", title: "Groupe", badgeClassName: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "relaxation", emoji: "🧘‍♀️", title: "Relaxation", badgeClassName: "bg-teal-50 text-teal-700 border-teal-200" },
  { id: "intensif", emoji: "💪", title: "Intensif", badgeClassName: "bg-red-50 text-red-700 border-red-200" },
];

// Labels spécifiques Loisirs
const LOISIRS_LABELS: InventoryLabel[] = [
  ...COMMON_LABELS,
  { id: "famille", emoji: "👨‍👩‍👧‍👦", title: "Famille", badgeClassName: "bg-green-50 text-green-700 border-green-200" },
  { id: "enfants", emoji: "🧒", title: "Enfants", badgeClassName: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  { id: "adultes", emoji: "🧑", title: "Adultes uniquement", badgeClassName: "bg-slate-50 text-slate-700 border-slate-200" },
  { id: "aventure", emoji: "🏄", title: "Aventure", badgeClassName: "bg-orange-50 text-orange-700 border-orange-200" },
  { id: "romantique", emoji: "💕", title: "Romantique", badgeClassName: "bg-pink-50 text-pink-700 border-pink-200" },
  { id: "vip", emoji: "💎", title: "VIP", badgeClassName: "bg-purple-50 text-purple-700 border-purple-200" },
  { id: "groupe", emoji: "👥", title: "Groupe", badgeClassName: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "exterieur", emoji: "🌳", title: "En extérieur", badgeClassName: "bg-emerald-50 text-emerald-700 border-emerald-200" },
];

// Labels spécifiques Location de véhicules
const LOCATION_LABELS: InventoryLabel[] = [
  ...COMMON_LABELS,
  { id: "suv", emoji: "🚙", title: "SUV", badgeClassName: "bg-slate-50 text-slate-700 border-slate-200" },
  { id: "4x4", emoji: "🚗", title: "4x4", badgeClassName: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "citadine", emoji: "🚘", title: "Citadine", badgeClassName: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "berline", emoji: "🚖", title: "Berline", badgeClassName: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { id: "luxe", emoji: "💎", title: "Luxe", badgeClassName: "bg-purple-50 text-purple-700 border-purple-200" },
  { id: "buggy", emoji: "🏎️", title: "Buggy", badgeClassName: "bg-orange-50 text-orange-700 border-orange-200" },
  { id: "quad", emoji: "🏍️", title: "Quad", badgeClassName: "bg-red-50 text-red-700 border-red-200" },
  { id: "avec_chauffeur", emoji: "👨‍✈️", title: "Avec chauffeur", badgeClassName: "bg-teal-50 text-teal-700 border-teal-200" },
  { id: "km_illimite", emoji: "🛣️", title: "Km illimité", badgeClassName: "bg-green-50 text-green-700 border-green-200" },
];

// Labels spécifiques Culture
const CULTURE_LABELS: InventoryLabel[] = [
  ...COMMON_LABELS,
  { id: "visite_guidee", emoji: "🎙️", title: "Visite guidée", badgeClassName: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "audio_guide", emoji: "🎧", title: "Audio-guide", badgeClassName: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { id: "groupe_scolaire", emoji: "🎒", title: "Groupe scolaire", badgeClassName: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  { id: "nocturne", emoji: "🌙", title: "Nocturne", badgeClassName: "bg-slate-50 text-slate-700 border-slate-200" },
  { id: "exposition", emoji: "🖼️", title: "Exposition", badgeClassName: "bg-purple-50 text-purple-700 border-purple-200" },
  { id: "atelier", emoji: "🎨", title: "Atelier", badgeClassName: "bg-pink-50 text-pink-700 border-pink-200" },
  { id: "accessible", emoji: "♿", title: "Accessible PMR", badgeClassName: "bg-teal-50 text-teal-700 border-teal-200" },
];

// Labels spécifiques Shopping
const SHOPPING_LABELS: InventoryLabel[] = [
  ...COMMON_LABELS,
  { id: "artisanat", emoji: "🧵", title: "Artisanat", badgeClassName: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "fait_main", emoji: "✋", title: "Fait main", badgeClassName: "bg-orange-50 text-orange-700 border-orange-200" },
  { id: "local", emoji: "📍", title: "Produit local", badgeClassName: "bg-green-50 text-green-700 border-green-200" },
  { id: "bio", emoji: "🌿", title: "Bio", badgeClassName: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "luxe", emoji: "💎", title: "Luxe", badgeClassName: "bg-purple-50 text-purple-700 border-purple-200" },
  { id: "souvenir", emoji: "🎁", title: "Souvenir", badgeClassName: "bg-pink-50 text-pink-700 border-pink-200" },
  { id: "promo", emoji: "🏷️", title: "Promo", badgeClassName: "bg-red-50 text-red-700 border-red-200" },
];

// Type d'univers
export type UniverseType = "restaurants" | "hebergement" | "sport" | "loisirs" | "culture" | "shopping" | "location" | string;

// Map des labels par univers
const LABELS_BY_UNIVERSE: Record<string, InventoryLabel[]> = {
  restaurants: RESTAURANT_LABELS,
  restaurant: RESTAURANT_LABELS,
  hebergement: HEBERGEMENT_LABELS,
  hébergement: HEBERGEMENT_LABELS,
  sport: SPORT_LABELS,
  loisirs: LOISIRS_LABELS,
  loisir: LOISIRS_LABELS,
  culture: CULTURE_LABELS,
  shopping: SHOPPING_LABELS,
  location: LOCATION_LABELS,
  rentacar: LOCATION_LABELS,
};

/**
 * Récupère les labels appropriés pour un univers donné
 */
export function getLabelsForUniverse(universe: string | null | undefined): InventoryLabel[] {
  const u = (universe ?? "").toLowerCase().trim();
  return LABELS_BY_UNIVERSE[u] ?? RESTAURANT_LABELS; // Default to restaurant
}

// Pour la rétrocompatibilité
export const INVENTORY_LABELS: InventoryLabel[] = RESTAURANT_LABELS;

// Tous les labels (pour la recherche / normalisation globale)
const ALL_LABELS_MAP = new Map<string, InventoryLabel>();
for (const labels of Object.values(LABELS_BY_UNIVERSE)) {
  for (const l of labels) {
    ALL_LABELS_MAP.set(l.id, l);
  }
}

export function labelById(id: string): InventoryLabel | null {
  const key = String(id ?? "").trim().toLowerCase();
  if (!key) return null;
  return ALL_LABELS_MAP.get(key) ?? null;
}

export function normalizeLabels(labels: string[], universe?: string | null): string[] {
  // Accepter tous les labels valides (de n'importe quel univers) pour éviter la perte de données
  const out: string[] = [];
  for (const raw of labels) {
    const v = String(raw ?? "").trim().toLowerCase();
    if (!v) continue;
    if (!ALL_LABELS_MAP.has(v)) continue;
    out.push(v);
  }
  return Array.from(new Set(out));
}
