export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function centsFromMad(mad: number): number {
  return Math.max(0, Math.round(mad * 100));
}

export function madFromCents(cents: number): number {
  return Math.round((Number.isFinite(cents) ? cents : 0) / 100 * 100) / 100;
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}
