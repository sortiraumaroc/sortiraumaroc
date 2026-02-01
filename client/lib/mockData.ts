export type Rng = () => number;

function xfnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): Rng {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: string | number): Rng {
  const s = typeof seed === "number" ? seed >>> 0 : xfnv1a(seed);
  return mulberry32(s);
}

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("pickOne: empty array");
  }
  const idx = Math.floor(rng() * items.length);
  return items[Math.min(items.length - 1, Math.max(0, idx))];
}

export function pickMany<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const safeCount = Math.max(0, Math.min(items.length, Math.floor(count)));
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy.slice(0, safeCount);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function clampRating(rating: number): number {
  if (!Number.isFinite(rating)) return 0;
  return clamp(rating, 0, 5);
}

export function slugify(input: string): string {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return cleaned || "etablissement";
}

export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function nextDaysYmd(count: number): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 0; i < Math.max(0, count); i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(toYmd(d));
  }
  return days;
}

export function makePhoneMa(rng: Rng): string {
  const start = pickOne(rng, ["5", "6", "7"] as const);
  const digits = Array.from({ length: 8 }, () => String(Math.floor(rng() * 10))).join("");
  const raw = `${start}${digits}`;
  return `+212 ${raw.slice(0, 1)} ${raw.slice(1, 3)} ${raw.slice(3, 5)} ${raw.slice(5, 7)} ${raw.slice(7, 9)}`;
}

export function makeWebsiteUrl(name: string): string {
  const slug = slugify(name);
  return `https://example.com/${slug}`;
}

export function makeImageSet(rng: Rng, universe: "restaurant" | "hotel" | "loisir" | "wellness" | "culture" | "shopping"): string[] {
  const pools: Record<typeof universe, string[]> = {
    restaurant: [
      "https://images.unsplash.com/photo-1544025162-d76694265947?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=1600&h=900&fit=crop",
    ],
    hotel: [
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1501117716987-c8e1ecb210b0?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1551887373-6c5bdc8b22aa?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1600&h=900&fit=crop",
    ],
    loisir: [
      "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1523413651479-597eb2da0ad6?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1526779259212-939e64788e3c?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1501556424050-d4816356d7a5?w=1600&h=900&fit=crop",
    ],
    wellness: [
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1535914254981-b5012eebbd15?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1596178060671-7a80dc8059ea?w=1600&h=900&fit=crop",
    ],
    culture: [
      "https://images.unsplash.com/photo-1564399579883-451a5d44be7f?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1523731407965-2430cd12f5e4?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1520975958223-7ba87a1f4ecf?w=1600&h=900&fit=crop",
    ],
    shopping: [
      "https://images.unsplash.com/photo-1521335629791-ce4aec67dd53?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1520975682071-a2b6f71a0083?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1523205771623-e0faa4d2813d?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1521337581100-8ca9a73a5f79?w=1600&h=900&fit=crop",
      "https://images.unsplash.com/photo-1567521464027-f127ff144326?w=1600&h=900&fit=crop",
    ],
  };

  const pool = pools[universe];
  return pickMany(rng, pool, 4);
}
