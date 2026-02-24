import type { ProSlot, Reservation } from "@/lib/pro/types";

import { getPaymentStatusBadgeClass, getPaymentStatusLabel, getReservationStatusLabel, isPastByIso } from "@/lib/reservationStatus";

type GuestInfo = {
  displayName: string;
  phone: string | null;
  email: string | null;
  comment: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

export function getGuestInfo(r: Reservation): GuestInfo {
  const meta = r.meta;
  if (!isRecord(meta)) {
    return { displayName: r.user_id ? "Client" : "—", phone: null, email: null, comment: null };
  }

  const first = asString(meta.guest_first_name);
  const last = asString(meta.guest_last_name);
  const phone = asString(meta.guest_phone);
  const email = asString(meta.guest_email);
  const comment = asString(meta.guest_comment);

  const name = [first, last].filter(Boolean).join(" ");

  return {
    displayName: name || (r.user_id ? "Client" : "—"),
    phone,
    email,
    comment,
  };
}

export type RiskLevel = "reliable" | "medium" | "sensitive";

export function clampRiskScore(score: number): number {
  const n = Number.isFinite(score) ? Math.round(score) : 90;
  return Math.max(0, Math.min(100, n));
}

export function getClientRiskScore(r: Reservation): number {
  const meta = r.meta;
  if (!isRecord(meta)) return 90;

  const raw = asNumber(meta.client_risk_score);
  if (raw == null) return 90;
  return clampRiskScore(raw);
}

export function getNoShowCount(r: Reservation): number {
  const meta = r.meta;
  if (!isRecord(meta)) return 0;
  const raw = asNumber(meta.no_show_count);
  if (raw == null) return 0;
  return Math.max(0, Math.round(raw));
}

export type EstablishmentNoShow = {
  date: string;
  time: string;
  party_size: number;
};

export function getEstablishmentNoShows(r: Reservation): EstablishmentNoShow[] {
  const meta = r.meta;
  if (!isRecord(meta)) return [];
  const raw = meta.establishment_no_shows;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is EstablishmentNoShow =>
      isRecord(item) &&
      typeof item.date === "string" &&
      typeof item.time === "string" &&
      typeof item.party_size === "number",
  );
}

export function hasEstablishmentNoShow(r: Reservation): boolean {
  const meta = r.meta;
  if (!isRecord(meta)) return false;
  if (meta.has_establishment_no_show === true) return true;
  return getEstablishmentNoShows(r).length > 0;
}

export function getRiskLevel(score: number): RiskLevel {
  if (score < 65) return "sensitive";
  if (score < 85) return "medium";
  return "reliable";
}

export function getRiskBadge(score: number): { label: string; cls: string } {
  const lvl = getRiskLevel(score);
  if (lvl === "reliable") return { label: `${score}/100`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (lvl === "medium") return { label: `${score}/100`, cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: `${score}/100`, cls: "bg-red-50 text-red-700 border-red-200" };
}

export function isGuaranteedReservation(r: Reservation): boolean {
  if (r.guarantee_type === "no_guarantee") return false;
  if (r.guarantee_type === "prepaid") return true;
  const deposit = typeof r.amount_deposit === "number" ? r.amount_deposit : 0;
  return r.payment_status === "paid" && deposit > 0;
}

// Phase 7 credibility signal — matches Phase 6 definition:
// protected = amount_deposit > 0 OR meta.guarantee_required=true
function isProtectedReservation(r: Reservation): boolean {
  const deposit = typeof r.amount_deposit === "number" && Number.isFinite(r.amount_deposit) ? Math.max(0, Math.round(r.amount_deposit)) : 0;
  if (deposit > 0) return true;

  const meta = r.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return (meta as Record<string, unknown>).guarantee_required === true;
  }

  return false;
}

export type ComputedReservationKind =
  | "confirmed_guaranteed"
  | "confirmed_not_guaranteed"
  | "pending_pro"
  | "waitlist"
  | "modification_pending"
  | "refused"
  | "cancelled"
  | "noshow"
  | "other";

export function isModificationPending(r: Reservation): boolean {
  const meta = r.meta;
  if (!isRecord(meta)) return false;
  if (meta.modification_requested === true) return true;
  if (isRecord(meta.requested_change)) return true;
  return false;
}

export function hasProposedChange(r: Reservation): boolean {
  const meta = r.meta;
  if (!isRecord(meta)) return false;
  return isRecord(meta.proposed_change);
}

export function getComputedReservationKind(r: Reservation): ComputedReservationKind {
  if (isModificationPending(r)) return "modification_pending";

  if (r.status === "confirmed") return isGuaranteedReservation(r) ? "confirmed_guaranteed" : "confirmed_not_guaranteed";
  if (r.status === "pending_pro_validation" || r.status === "requested") return "pending_pro";
  if (r.status === "waitlist") return "waitlist";
  if (r.status === "refused") return "refused";
  if (r.status === "noshow") return "noshow";
  if (r.status === "cancelled" || r.status === "cancelled_user" || r.status === "cancelled_pro") return "cancelled";
  return "other";
}

export function isReservationInPast(r: Reservation, nowMs: number = Date.now()): boolean {
  const endIso = r.ends_at ?? r.starts_at;
  return isPastByIso(endIso, nowMs);
}

export function isPastGracePeriod(r: Reservation, nowMs: number = Date.now(), hours: number = 3): boolean {
  const startMs = new Date(r.starts_at).getTime();
  if (!Number.isFinite(startMs)) return false;
  const thresholdMs = startMs + hours * 60 * 60 * 1000;
  return nowMs > thresholdMs;
}

export function getStatusBadges(r: Reservation): Array<{ label: string; cls: string; title?: string }> {
  const kind = getComputedReservationKind(r);

  const addProtectedBadge = (badges: Array<{ label: string; cls: string; title?: string }>) => {
    if (!isProtectedReservation(r)) return badges;
    if (badges.some((b) => b.label === "Protégé")) return badges;
    return [
      ...badges,
      {
        label: "Protégé",
        cls: "bg-amber-50 text-amber-800 border-amber-200",
        title: "Créneau protégé par Sortir Au Maroc (garantie requise)",
      },
    ];
  };

  const addProposalBadge = (badges: Array<{ label: string; cls: string; title?: string }>) => {
    if (!hasProposedChange(r)) return badges;
    return [...badges, { label: "Proposition", cls: "bg-blue-50 text-blue-700 border-blue-200" }];
  };

  if (kind === "confirmed_guaranteed") {
    return addProposalBadge(
      addProtectedBadge([
        { label: "Confirmée", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
        { label: "Payée", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
      ]),
    );
  }

  if (kind === "confirmed_not_guaranteed") {
    return addProposalBadge(
      addProtectedBadge([
        { label: "Confirmée", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
        { label: "Non garantie", cls: "bg-slate-50 text-slate-700 border-slate-200" },
      ]),
    );
  }

  if (kind === "pending_pro") {
    return addProposalBadge(addProtectedBadge([{ label: "En attente de validation", cls: "bg-amber-100 text-amber-700 border-amber-200" }]));
  }
  if (kind === "waitlist") {
    return addProposalBadge(addProtectedBadge([{ label: "Liste d’attente", cls: "bg-blue-50 text-blue-700 border-blue-200" }]));
  }

  if (kind === "modification_pending") {
    return addProposalBadge(addProtectedBadge([{ label: "Modification en attente", cls: "bg-purple-50 text-purple-700 border-purple-200" }]));
  }

  if (kind === "refused") {
    const title = r.refusal_reason_custom || r.refusal_reason_code || undefined;
    return addProposalBadge(
      addProtectedBadge([
        {
          label: "Refusée",
          cls: "bg-red-50 text-red-700 border-red-200",
          title,
        },
      ]),
    );
  }

  if (kind === "cancelled") return addProposalBadge(addProtectedBadge([{ label: "Annulée", cls: "bg-slate-200 text-slate-700 border-slate-300" }]));
  if (kind === "noshow") return addProposalBadge(addProtectedBadge([{ label: "No-show", cls: "bg-red-100 text-red-700 border-red-200" }]));

  return addProposalBadge(addProtectedBadge([{ label: getReservationStatusLabel(r.status), cls: "bg-slate-100 text-slate-700 border-slate-200" }]));
}

export function getPaymentBadge(status: string): { label: string; cls: string } {
  return { label: getPaymentStatusLabel(status), cls: getPaymentStatusBadgeClass(status) };
}

export function getSuggestedSlots(args: {
  reservation: Reservation;
  slots: ProSlot[];
  max?: number;
}): ProSlot[] {
  const { reservation, slots } = args;
  const max = Math.max(0, Math.min(10, args.max ?? 3));
  if (!max) return [];

  const targetTime = new Date(reservation.starts_at).getTime();
  if (!Number.isFinite(targetTime)) return [];

  const sameDay = slots.filter((s) => {
    if (!s?.starts_at) return false;
    const d = new Date(s.starts_at);
    if (!Number.isFinite(d.getTime())) return false;
    const rD = new Date(reservation.starts_at);
    return (
      d.getFullYear() === rD.getFullYear() &&
      d.getMonth() === rD.getMonth() &&
      d.getDate() === rD.getDate()
    );
  });

  const eligible = sameDay
    .filter((s) => {
      const remaining = (s as unknown as { remaining_capacity?: unknown }).remaining_capacity;
      if (typeof remaining !== "number") return true;
      return remaining > 0;
    })
    .sort((a, b) => {
      const da = Math.abs(new Date(a.starts_at).getTime() - targetTime);
      const db = Math.abs(new Date(b.starts_at).getTime() - targetTime);
      return da - db;
    });

  return eligible.slice(0, max);
}
