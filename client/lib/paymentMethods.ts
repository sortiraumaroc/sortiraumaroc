import { z } from "zod";

export const BILLING_DATA_CHANGED_EVENT = "sam-billing-data-changed";

const CARDS_STORAGE_KEY = "sam_payment_cards_v1";

export type CardBrand = "visa" | "mastercard" | "amex" | "unknown";

const cardBrandSchema = z.enum(["visa", "mastercard", "amex", "unknown"]);

const cardSchema = z.object({
  id: z.string().min(1),
  brand: cardBrandSchema,
  last4: z.string().regex(/^\d{4}$/),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(2020).max(2100),
  holderName: z.string().min(1).max(80),
  isDefault: z.boolean().optional(),
  createdAtIso: z.string().min(1),
});

export type PaymentCard = z.infer<typeof cardSchema>;

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
  window.dispatchEvent(new Event(BILLING_DATA_CHANGED_EVENT));
}

function makeId(prefix: string): string {
  const cryptoAny = globalThis.crypto as Crypto | undefined;
  const uuid = typeof cryptoAny?.randomUUID === "function" ? cryptoAny.randomUUID() : null;
  if (uuid) return `${prefix}_${uuid}`;
  const rand = Math.random().toString(36).slice(2);
  const now = Date.now().toString(36);
  return `${prefix}_${now}_${rand}`.toUpperCase();
}

function normalizeLast4(cardNumber: string): string | null {
  const digits = String(cardNumber ?? "").replace(/[^0-9]/g, "");
  if (digits.length < 12) return null;
  return digits.slice(-4);
}

export function detectCardBrand(cardNumber: string): CardBrand {
  const digits = String(cardNumber ?? "").replace(/[^0-9]/g, "");
  if (/^4\d{12,18}$/.test(digits)) return "visa";
  if (/^(5[1-5]\d{14}|2(2[2-9]\d{12}|[3-6]\d{13}|7[01]\d{12}|720\d{12}))$/.test(digits)) return "mastercard";
  if (/^3[47]\d{13}$/.test(digits)) return "amex";
  return "unknown";
}

export function listCards(): PaymentCard[] {
  const raw = readJson(CARDS_STORAGE_KEY);
  const parsed = z.array(cardSchema).safeParse(raw);
  if (!parsed.success) return [];

  const list = parsed.data.slice().sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : a.createdAtIso > b.createdAtIso ? -1 : 0));
  const defaultIdx = list.findIndex((c) => c.isDefault);
  if (defaultIdx > 0) {
    const [d] = list.splice(defaultIdx, 1);
    list.unshift(d!);
  }
  return list;
}

export function ensureDemoCard(): void {
  const list = listCards();
  if (list.length) return;
  const nowIso = new Date().toISOString();
  const card: PaymentCard = {
    id: makeId("CARD"),
    brand: "visa",
    last4: "4242",
    expMonth: 12,
    expYear: new Date().getFullYear() + 2,
    holderName: "Utilisateur",
    isDefault: true,
    createdAtIso: nowIso,
  };
  writeJson(CARDS_STORAGE_KEY, [card]);
}

export function addCard(input: { holderName: string; cardNumber: string; expMonth: number; expYear: number }): { ok: true } | { ok: false; message: string } {
  const holderName = String(input.holderName ?? "").trim();
  if (!holderName) return { ok: false, message: "Nom du titulaire requis" };

  const last4 = normalizeLast4(input.cardNumber);
  if (!last4) return { ok: false, message: "Numéro de carte invalide" };

  const expMonth = Math.round(Number(input.expMonth));
  const expYear = Math.round(Number(input.expYear));
  if (!Number.isFinite(expMonth) || expMonth < 1 || expMonth > 12) return { ok: false, message: "Mois d’expiration invalide" };
  if (!Number.isFinite(expYear) || expYear < 2020 || expYear > 2100) return { ok: false, message: "Année d’expiration invalide" };

  const nowIso = new Date().toISOString();
  const list = listCards();
  const card: PaymentCard = {
    id: makeId("CARD"),
    brand: detectCardBrand(input.cardNumber),
    last4,
    expMonth,
    expYear,
    holderName,
    isDefault: list.length === 0,
    createdAtIso: nowIso,
  };

  writeJson(CARDS_STORAGE_KEY, [card, ...list.map((c) => ({ ...c, isDefault: list.length === 0 ? false : c.isDefault }))]);
  return { ok: true };
}

export function removeCard(cardId: string): void {
  const id = String(cardId ?? "").trim();
  if (!id) return;
  const list = listCards().filter((c) => c.id !== id);
  if (!list.length) {
    writeJson(CARDS_STORAGE_KEY, []);
    return;
  }

  if (!list.some((c) => c.isDefault)) {
    list[0] = { ...list[0]!, isDefault: true };
  }

  writeJson(CARDS_STORAGE_KEY, list);
}

export function setDefaultCard(cardId: string): void {
  const id = String(cardId ?? "").trim();
  if (!id) return;
  const list = listCards();
  if (!list.some((c) => c.id === id)) return;
  const next = list.map((c) => ({ ...c, isDefault: c.id === id }));
  writeJson(CARDS_STORAGE_KEY, next);
}

export function getCardLabel(card: PaymentCard): string {
  const brandLabel =
    card.brand === "visa" ? "Visa" : card.brand === "mastercard" ? "Mastercard" : card.brand === "amex" ? "Amex" : "Carte";
  return `${brandLabel} •••• ${card.last4}`;
}
