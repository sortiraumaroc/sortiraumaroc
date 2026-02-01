type ReliabilityScoreStore = Record<string, number>;

const RELIABILITY_SCORE_STORAGE_KEY = "sam_reliability_scores_v1";

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function normalizePhone(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";

  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
}

function stableHashTo0to99(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100;
}

export function getClientReliabilityScore(args: { phone: string; email?: string }): number {
  const phoneNorm = normalizePhone(args.phone);
  const emailNorm = String(args.email ?? "").trim().toLowerCase();
  const key = phoneNorm || emailNorm;
  if (!key) return 80;

  const parsed = readJson(RELIABILITY_SCORE_STORAGE_KEY);
  const store: ReliabilityScoreStore = parsed && typeof parsed === "object" ? (parsed as ReliabilityScoreStore) : {};

  const existing = store[key];
  if (typeof existing === "number" && Number.isFinite(existing)) {
    return Math.max(0, Math.min(100, Math.round(existing)));
  }

  const base = stableHashTo0to99(key);
  const score = Math.max(0, Math.min(100, 20 + Math.round(base * 0.8)));

  store[key] = score;
  writeJson(RELIABILITY_SCORE_STORAGE_KEY, store);

  return score;
}

export function shouldRequireDeposit(args: { score: number; reservationMode: "guaranteed" | "non-guaranteed" | null }): boolean {
  if (args.reservationMode !== "guaranteed") return false;
  return Number(args.score) < 50;
}

export function computeDepositAmountMAD(args: {
  bookingType: "restaurant" | "hotel" | "activity";
  partySize: number | null;
  nights: number | null;
  rooms: number | null;
  restaurantTier?: "standard" | "premium" | "signature";
}): number {
  const size = typeof args.partySize === "number" && Number.isFinite(args.partySize) ? Math.max(1, Math.round(args.partySize)) : 1;

  if (args.bookingType === "restaurant") {
    const tier = args.restaurantTier ?? "standard";
    const perPerson = tier === "signature" ? 100 : tier === "premium" ? 80 : 60;
    return perPerson * size;
  }

  if (args.bookingType === "hotel") {
    const n = typeof args.nights === "number" && Number.isFinite(args.nights) ? Math.max(1, Math.round(args.nights)) : 1;
    const r = typeof args.rooms === "number" && Number.isFinite(args.rooms) ? Math.max(1, Math.round(args.rooms)) : 1;
    return 200 * n * r;
  }

  return 100 * size;
}
