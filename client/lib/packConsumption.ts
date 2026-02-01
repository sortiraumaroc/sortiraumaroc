export type PackPurchaseQuantity = {
  id: string;
  quantity: number;
};

export type PackRedemptionLike = {
  purchase_id?: unknown;
  purchaseId?: unknown;
  count?: unknown;
};

function asString(v: unknown): string {
  return String(v ?? "").trim();
}

function asCount(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return 0;
}

export function buildConsumedByPurchase(redemptions: PackRedemptionLike[]): Map<string, number> {
  const consumedByPurchase = new Map<string, number>();

  for (const r of redemptions ?? []) {
    const purchaseId = asString((r as any).purchase_id ?? (r as any).purchaseId);
    if (!purchaseId) continue;

    const rawCount = (r as any).count;
    const increment = rawCount == null ? 1 : asCount(rawCount) || 1;

    consumedByPurchase.set(purchaseId, (consumedByPurchase.get(purchaseId) ?? 0) + increment);
  }

  return consumedByPurchase;
}

export function getPackPurchaseConsumption(
  purchase: PackPurchaseQuantity,
  consumedByPurchase: Map<string, number>,
): { consumed: number; remaining: number; fullyConsumed: boolean } {
  const qty = typeof purchase.quantity === "number" && Number.isFinite(purchase.quantity) ? Math.max(0, Math.floor(purchase.quantity)) : 0;
  const consumedRaw = consumedByPurchase.get(purchase.id) ?? 0;
  const consumed = Math.max(0, Math.min(qty, Math.floor(consumedRaw)));
  const remaining = Math.max(0, qty - consumed);
  return { consumed, remaining, fullyConsumed: qty > 0 && remaining === 0 };
}
