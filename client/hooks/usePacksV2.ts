/**
 * usePacksV2 — Custom hooks for Packs V2 system.
 *
 * Provides:
 *  - usePacksList: public listing with filters
 *  - usePackDetail: single pack detail
 *  - useEstablishmentPacks: packs for a specific establishment
 *  - usePurchasePack: purchase flow (promo validation + purchase)
 *  - useMyPacks: consumer purchased packs
 *  - useMyPackTransactions: consumer transaction history
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { PackV2, PackPurchaseV2, Transaction } from "../../shared/packsBillingTypes";
import {
  listActivePacks,
  getPackDetail,
  getEstablishmentPacks,
  purchasePack,
  validatePromoCode,
  getMyPacks,
  getMyPackDetail,
  requestPackRefund,
  getMyTransactions,
  getMyReceipts,
  type PackListFilters,
  type PacksListResponse,
  type PurchasePackInput,
  type PurchaseResult,
  type PromoValidationResult,
} from "@/lib/packsV2Api";

// =============================================================================
// usePacksList — public listing with filters, pagination, and sort
// =============================================================================

export function usePacksList(initialFilters?: PackListFilters) {
  const [packs, setPacks] = useState<PackV2[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialFilters?.page ?? 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PackListFilters>(initialFilters ?? {});

  const fetch_ = useCallback(
    async (overrideFilters?: PackListFilters) => {
      setLoading(true);
      setError(null);
      try {
        const f = overrideFilters ?? { ...filters, page };
        const res = await listActivePacks(f);
        setPacks(res.packs);
        setTotal(res.total);
        setPage(res.page);
      } catch (e: any) {
        setError(e.message ?? "Erreur de chargement des packs");
      } finally {
        setLoading(false);
      }
    },
    [filters, page],
  );

  const updateFilters = useCallback((newFilters: Partial<PackListFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
    setPage(1);
  }, []);

  const goToPage = useCallback((p: number) => {
    setPage(p);
  }, []);

  return {
    packs,
    total,
    page,
    loading,
    error,
    filters,
    fetch: fetch_,
    updateFilters,
    goToPage,
  };
}

// =============================================================================
// usePackDetail — single pack fetch
// =============================================================================

export function usePackDetail(packId: string | null) {
  const [pack, setPack] = useState<PackV2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!packId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getPackDetail(packId);
      setPack(res.pack);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [packId]);

  useEffect(() => {
    if (packId) fetch_();
  }, [packId, fetch_]);

  return { pack, loading, error, refetch: fetch_ };
}

// =============================================================================
// useEstablishmentPacks — packs for an establishment fiche
// =============================================================================

export function useEstablishmentPacks(establishmentId: string | null) {
  const [packs, setPacks] = useState<PackV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!establishmentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getEstablishmentPacks(establishmentId);
      setPacks(res.packs);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    if (establishmentId) fetch_();
  }, [establishmentId, fetch_]);

  return { packs, loading, error, refetch: fetch_ };
}

// =============================================================================
// usePurchasePack — purchase flow with promo code validation
// =============================================================================

export function usePurchasePack() {
  const [promoResult, setPromoResult] = useState<PromoValidationResult | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkPromo = useCallback(
    async (packId: string, code: string, packPrice?: number, establishmentId?: string) => {
      setPromoLoading(true);
      setPromoResult(null);
      try {
        const res = await validatePromoCode(packId, code, packPrice, establishmentId);
        setPromoResult(res);
        return res;
      } catch (e: any) {
        const failed: PromoValidationResult = { valid: false, error: e.message ?? "Erreur" };
        setPromoResult(failed);
        return failed;
      } finally {
        setPromoLoading(false);
      }
    },
    [],
  );

  const clearPromo = useCallback(() => {
    setPromoResult(null);
  }, []);

  const purchase = useCallback(
    async (packId: string, input?: PurchasePackInput) => {
      setPurchasing(true);
      setError(null);
      try {
        const res = await purchasePack(packId, input);
        setResult(res);
        return res;
      } catch (e: any) {
        setError(e.message ?? "Erreur lors de l'achat");
        return null;
      } finally {
        setPurchasing(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setPromoResult(null);
    setResult(null);
    setError(null);
  }, []);

  return {
    promoResult,
    promoLoading,
    purchasing,
    result,
    error,
    checkPromo,
    clearPromo,
    purchase,
    reset,
  };
}

// =============================================================================
// useMyPacks — consumer purchased packs with actions
// =============================================================================

export function useMyPacks() {
  const [purchases, setPurchases] = useState<PackPurchaseV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async (status?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyPacks(status);
      setPurchases(res.purchases);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (purchaseId: string) => {
    return getMyPackDetail(purchaseId);
  }, []);

  const refund = useCallback(
    async (purchaseId: string, reason: string, preferCredit?: boolean) => {
      return requestPackRefund(purchaseId, reason, preferCredit);
    },
    [],
  );

  return { purchases, loading, error, fetch: fetch_, fetchDetail, refund };
}

// =============================================================================
// useMyPackTransactions — consumer transaction history
// =============================================================================

export function useMyPackTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(
    async (opts?: { page?: number; perPage?: number; type?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getMyTransactions(opts?.page, opts?.perPage, opts?.type);
        setTransactions(res.transactions);
        setTotal(res.total);
        setPage(res.page);
      } catch (e: any) {
        setError(e.message ?? "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { transactions, total, page, loading, error, fetch: fetch_ };
}

// =============================================================================
// useMyReceipts — consumer receipts list
// =============================================================================

export function useMyReceipts() {
  const [receipts, setReceipts] = useState<
    Array<{
      id: string;
      type: string;
      reference_type: string;
      reference_id: string;
      gross_amount: number;
      receipt_id: string;
      created_at: string;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyReceipts();
      setReceipts(res.receipts);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  return { receipts, loading, error, fetch: fetch_ };
}
