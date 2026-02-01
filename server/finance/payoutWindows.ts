import { DEFAULT_TIME_ZONE, getTimeZoneParts } from "../../shared/datetime";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month1Based: number): number {
  // Date.UTC month is 0-based; day 0 gives last day of previous month.
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export type PayoutWindow = {
  windowStartYmd: string;
  windowEndYmd: string;
  eligibleAtYmd: string;
  isFirstHalf: boolean;
};

export function computePayoutWindow(now: Date = new Date()): PayoutWindow {
  const parts = getTimeZoneParts(now, { timeZone: DEFAULT_TIME_ZONE, locale: "en-US", includeSeconds: false });

  const isFirstHalf = parts.day <= 15;
  const endDay = isFirstHalf ? 15 : lastDayOfMonth(parts.year, parts.month);
  const startDay = isFirstHalf ? 1 : 16;

  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
  const eligibleDay = isFirstHalf ? 5 : 22;

  return {
    windowStartYmd: ymd(parts.year, parts.month, startDay),
    windowEndYmd: ymd(parts.year, parts.month, endDay),
    eligibleAtYmd: ymd(nextYear, nextMonth, eligibleDay),
    isFirstHalf,
  };
}

export function buildPayoutBatchIdempotencyKey(args: { establishmentId: string; currency: string; now?: Date }): string {
  const currency = String(args.currency ?? "MAD").trim().toUpperCase() || "MAD";
  const w = computePayoutWindow(args.now);
  return `payout_window:${args.establishmentId}:${currency}:${w.windowStartYmd}:${w.windowEndYmd}`;
}
