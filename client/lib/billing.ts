import type { BookingRecord } from "@/lib/userData";

export type RestaurantPriceTier = "standard" | "premium" | "signature";

function clampInt(n: number, min: number, max: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export function getRestaurantTierFromCategory(category?: string | null): RestaurantPriceTier {
  const c = String(category ?? "").trim().toLowerCase();
  if (!c) return "standard";

  if (/(gastronom|fine|signature|lux|chef)/.test(c)) return "signature";
  if (/(rooftop|premium|lounge|fusion|international|steak)/.test(c)) return "premium";
  return "standard";
}

export function getFallbackTierFromRestaurantId(id?: string | null): RestaurantPriceTier {
  const v = String(id ?? "").trim();
  if (!v) return "standard";
  if (v === "1" || v === "4") return "signature";
  if (v === "2" || v === "3") return "premium";
  return "standard";
}

export function getUnitPreReservationMad(args: { restaurantCategory?: string | null; fallbackTier?: RestaurantPriceTier }): number {
  const tier = args.restaurantCategory ? getRestaurantTierFromCategory(args.restaurantCategory) : args.fallbackTier ?? "standard";

  const map: Record<RestaurantPriceTier, number> = {
    standard: 60,
    premium: 80,
    signature: 100,
  };

  return clampInt(map[tier] ?? 75, 50, 100);
}

export function computePreReservationTotalMad(args: { unitMad: number; partySize?: number | null }): number {
  const size = typeof args.partySize === "number" && Number.isFinite(args.partySize) ? Math.max(1, Math.round(args.partySize)) : 1;
  return clampInt(args.unitMad * size, 0, 999999);
}

export function formatMoneyMad(amount: number): string {
  const v = Math.round(Number(amount));
  if (!Number.isFinite(v)) return "—";
  return `${v} Dhs`;
}

export function getBookingPreReservationBreakdown(booking: BookingRecord): {
  unitMad: number | null;
  partySize: number | null;
  totalMad: number | null;
} {
  const payment = booking.payment;
  const partySize = typeof booking.partySize === "number" && Number.isFinite(booking.partySize) ? Math.max(1, Math.round(booking.partySize)) : null;

  if (!payment || payment.currency.toUpperCase() !== "MAD") {
    return { unitMad: null, partySize, totalMad: null };
  }

  const unit = Number(payment.depositAmount);
  if (!Number.isFinite(unit) || unit <= 0) return { unitMad: null, partySize, totalMad: null };

  const total = typeof payment.totalAmount === "number" && Number.isFinite(payment.totalAmount) ? payment.totalAmount : partySize ? unit * partySize : null;

  return {
    unitMad: Math.round(unit),
    partySize,
    totalMad: total == null ? null : Math.round(total),
  };
}
