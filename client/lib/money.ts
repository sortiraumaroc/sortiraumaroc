/**
 * Centralized money formatting utilities.
 * Replaces duplicate formatMoney functions across Pro tabs.
 */

type SupportedCurrency = "MAD" | "EUR" | "USD" | string;
type SupportedLocale = "fr-MA" | "fr-FR" | "en-US" | string;

/**
 * Format amount (in cents) as currency string.
 * @param amountCents - Amount in cents (e.g., 100 MAD = 10000 cents)
 * @param currency - ISO currency code (default: "MAD")
 * @param locale - Locale for formatting (default: "fr-MA")
 * @returns Formatted string (e.g., "100,00 MAD")
 */
export function formatMoney(
  amountCents: number | null | undefined,
  currency: SupportedCurrency = "MAD",
  locale: SupportedLocale = "fr-MA",
): string {
  if (!Number.isFinite(amountCents)) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(0);
  }

  const normalizedAmount = (amountCents as number) / 100;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalizedAmount);
}

/**
 * Format amount without currency symbol (for display in lists/tables).
 * @param amountCents - Amount in cents
 * @param currency - ISO currency code
 * @param locale - Locale for formatting
 * @returns Formatted number string with currency suffix (e.g., "100,00 MAD")
 */
export function formatMoneyWithCurrency(
  amountCents: number | null | undefined,
  currency: SupportedCurrency = "MAD",
): string {
  if (!Number.isFinite(amountCents)) {
    return `0,00 ${currency}`;
  }

  const normalizedAmount = (amountCents as number) / 100;
  const formatted = normalizedAmount.toFixed(2).replace(".", ",");
  return `${formatted} ${currency}`;
}

/**
 * Format amount as number only (e.g., for calculations).
 * @param amountCents - Amount in cents
 * @returns Amount in base units (e.g., MAD)
 */
export function centsToUnits(amountCents: number | null | undefined): number {
  if (!Number.isFinite(amountCents)) return 0;
  return (amountCents as number) / 100;
}

/**
 * Convert base units to cents (e.g., for API calls).
 * @param amount - Amount in base units
 * @returns Amount in cents
 */
export function unitsToCents(amount: number | null | undefined): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount as number) * 100);
}

/**
 * Parse a string number (supporting both . and , as decimal separator).
 * @param value - String value to parse
 * @returns Number or 0 if invalid
 */
export function parseMoneyString(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".");
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}
