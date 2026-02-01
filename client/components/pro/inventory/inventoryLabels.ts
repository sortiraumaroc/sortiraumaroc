export type InventoryLabel = {
  id: string;
  emoji: string;
  title: string;
  badgeClassName: string;
};

export const INVENTORY_LABELS: InventoryLabel[] = [
  { id: "specialite", emoji: "⭐", title: "Spécialité", badgeClassName: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "best_seller", emoji: "🔥", title: "Best seller", badgeClassName: "bg-red-50 text-red-700 border-red-200" },
  { id: "coup_de_coeur", emoji: "❤️", title: "Coup de cœur", badgeClassName: "bg-pink-50 text-pink-700 border-pink-200" },
  { id: "suggestion_chef", emoji: "👨‍🍳", title: "Suggestion du chef", badgeClassName: "bg-slate-50 text-slate-700 border-slate-200" },
  { id: "vegetarien", emoji: "🌿", title: "Végétarien", badgeClassName: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "epice", emoji: "🌶", title: "Épicé", badgeClassName: "bg-orange-50 text-orange-700 border-orange-200" },
  { id: "fruits_de_mer", emoji: "🐟", title: "Fruits de mer", badgeClassName: "bg-sky-50 text-sky-700 border-sky-200" },
  { id: "healthy", emoji: "🥗", title: "Healthy", badgeClassName: "bg-lime-50 text-lime-800 border-lime-200" },
  { id: "traditionnel", emoji: "🇲🇦", title: "Traditionnel", badgeClassName: "bg-teal-50 text-teal-700 border-teal-200" },
  { id: "signature", emoji: "🇲🇦", title: "Signature", badgeClassName: "bg-purple-50 text-purple-700 border-purple-200" },
  { id: "nouveaute", emoji: "🆕", title: "Nouveauté", badgeClassName: "bg-indigo-50 text-indigo-700 border-indigo-200" },
];

export function labelById(id: string): InventoryLabel | null {
  const key = String(id ?? "").trim().toLowerCase();
  if (!key) return null;
  return INVENTORY_LABELS.find((l) => l.id === key) ?? null;
}

export function normalizeLabels(labels: string[]): string[] {
  const allowed = new Set(INVENTORY_LABELS.map((x) => x.id));
  const out: string[] = [];
  for (const raw of labels) {
    const v = String(raw ?? "").trim().toLowerCase();
    if (!v) continue;
    if (!allowed.has(v)) continue;
    out.push(v);
  }
  return Array.from(new Set(out));
}
