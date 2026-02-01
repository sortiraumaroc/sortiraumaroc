import { getConsumerAccessToken } from "@/lib/auth";
import type { PackPurchase } from "@/lib/userData";

type ListConsumerPackPurchasesResponse = { ok: true; items: PackPurchase[] };

type CheckoutConsumerPackResponse = {
  ok: true;
  purchase_id: string | null;
  payment?: {
    provider?: string;
    status?: "paid" | "pending" | "refunded" | string;
    confirm_endpoint?: string;
  };
};

export class ConsumerPacksApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ConsumerPacksApiError";
    this.status = status;
    this.payload = payload;
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const maybe = payload as Record<string, unknown>;
  const msg = typeof maybe.error === "string" ? maybe.error : null;
  return msg && msg.trim() ? msg : null;
}

async function requestAuthedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getConsumerAccessToken();
  if (!token) throw new ConsumerPacksApiError("Not authenticated", 401);

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch (e) {
    throw new ConsumerPacksApiError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.", 0, e);
  }

  let payload: unknown = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else {
    payload = await res.text().catch(() => null);
  }

  if (!res.ok) {
    const msg = extractErrorMessage(payload) || `HTTP ${res.status}`;
    throw new ConsumerPacksApiError(msg, res.status, payload);
  }

  return payload as T;
}

export async function listMyConsumerPackPurchases(): Promise<PackPurchase[]> {
  const res = await requestAuthedJson<ListConsumerPackPurchasesResponse>("/api/consumer/packs/purchases", { method: "GET" });
  return (res.items ?? []) as PackPurchase[];
}

type FinanceInvoiceSummary = {
  id: string;
  invoice_number: string;
  issued_at: string;
  amount_cents: number;
  currency: string;
  reference_type: string;
  reference_id: string;
};

type GetConsumerPackPurchaseInvoiceResponse = { ok: true; invoice: FinanceInvoiceSummary };

export async function getMyConsumerPackPurchaseInvoice(purchaseId: string): Promise<FinanceInvoiceSummary> {
  const id = String(purchaseId ?? "").trim();
  if (!id) throw new ConsumerPacksApiError("missing_purchase_id", 400);

  const res = await requestAuthedJson<GetConsumerPackPurchaseInvoiceResponse>(
    `/api/consumer/packs/purchases/${encodeURIComponent(id)}/invoice`,
    { method: "GET" },
  );

  return res.invoice;
}

export async function checkoutConsumerPack(args: {
  pack_id: string;
  quantity?: number;
  promo_code?: string;
  buyer_name?: string;
  buyer_email?: string;
  contact?: { full_name?: string; name?: string; email?: string };
}): Promise<CheckoutConsumerPackResponse> {
  return await requestAuthedJson<CheckoutConsumerPackResponse>("/api/consumer/packs/checkout", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function confirmMyConsumerPackPurchase(purchaseId: string): Promise<{ ok: true; already_paid?: boolean } & Record<string, unknown>> {
  return await requestAuthedJson<{ ok: true; already_paid?: boolean } & Record<string, unknown>>(
    `/api/consumer/packs/purchases/${encodeURIComponent(purchaseId)}/confirm`,
    {
      method: "POST",
    },
  );
}

export async function hideMyConsumerPackPurchase(purchaseId: string): Promise<{ ok: true } & Record<string, unknown>> {
  return await requestAuthedJson<{ ok: true } & Record<string, unknown>>(
    `/api/consumer/packs/purchases/${encodeURIComponent(purchaseId)}/hide`,
    {
      method: "POST",
    },
  );
}
