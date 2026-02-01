function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ensureHttps(url: string): string {
  const u = safeTrim(url);
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u.replace(/^\/+/, "")}`;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function buildPaymaPaymentUrl(args: { amountMad: number; baseUrl?: string }): string {
  const amount = Math.max(0, Math.round(Number(args.amountMad)));

  const envBase = safeTrim((import.meta as any).env?.VITE_PAYMA_BASE_URL);
  const baseUrl = args.baseUrl && safeTrim(args.baseUrl) ? safeTrim(args.baseUrl) : envBase;

  const base = baseUrl || "https://pay.ma/0694101112";
  const normalizedBase = stripTrailingSlash(ensureHttps(base));

  return `${normalizedBase}/${amount}`;
}
