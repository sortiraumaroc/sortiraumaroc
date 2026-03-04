/**
 * useLoyaltyV2 — Custom hooks for Loyalty V2 system.
 *
 * Provides:
 *  - useMyLoyalty: consumer's loyalty cards & rewards
 *  - useMyLoyaltyCard: single card detail
 *  - useMyGifts: consumer's platform gifts
 *  - useEstablishmentLoyalty: public loyalty info for an establishment
 *  - useAvailableGifts: public available platform gifts
 *  - useClaimGift: claim a public gift
 */

import { useState, useCallback, useEffect } from "react";
import {
  getMyLoyalty,
  getMyLoyaltyCard,
  getMyLoyaltyRewards,
  getMyGifts,
  getEstablishmentLoyalty,
  getAvailableGifts,
  claimGift,
  type MyLoyaltyResponse,
  type MyLoyaltyCardResponse,
  type MyRewardsResponse,
  type MyGiftsResponse,
  type EstablishmentLoyaltyResponse,
  type AvailableGiftsResponse,
} from "@/lib/loyaltyV2Api";

// =============================================================================
// useMyLoyalty — Consumer's loyalty cards & rewards
// =============================================================================

export function useMyLoyalty() {
  const [data, setData] = useState<MyLoyaltyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyLoyalty();
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch_();
  }, [fetch_]);

  return { data, loading, error, refresh: fetch_ };
}

// =============================================================================
// useMyLoyaltyCard — Single card detail
// =============================================================================

export function useMyLoyaltyCard(cardId: string | null) {
  const [data, setData] = useState<MyLoyaltyCardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!cardId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getMyLoyaltyCard(cardId);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    void fetch_();
  }, [fetch_]);

  return { data, loading, error, refresh: fetch_ };
}

// =============================================================================
// useMyLoyaltyRewards — Consumer rewards
// =============================================================================

export function useMyLoyaltyRewards() {
  const [data, setData] = useState<MyRewardsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyLoyaltyRewards();
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch_();
  }, [fetch_]);

  return { data, loading, error, refresh: fetch_ };
}

// =============================================================================
// useMyGifts — Consumer's platform gifts
// =============================================================================

export function useMyGifts() {
  const [data, setData] = useState<MyGiftsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyGifts();
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch_();
  }, [fetch_]);

  return { data, loading, error, refresh: fetch_ };
}

// =============================================================================
// useEstablishmentLoyalty — Public loyalty info for an establishment
// =============================================================================

export function useEstablishmentLoyalty(establishmentId: string | null) {
  const [data, setData] = useState<EstablishmentLoyaltyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!establishmentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getEstablishmentLoyalty(establishmentId);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    void fetch_();
  }, [fetch_]);

  return { data, loading, error, refresh: fetch_ };
}

// =============================================================================
// useAvailableGifts — Public available platform gifts
// =============================================================================

export function useAvailableGifts() {
  const [data, setData] = useState<AvailableGiftsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAvailableGifts();
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch_();
  }, [fetch_]);

  return { data, loading, error, refresh: fetch_ };
}

// =============================================================================
// useClaimGift — Claim a public gift
// =============================================================================

export function useClaimGift() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const claim = useCallback(async (giftId: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await claimGift(giftId);
      setResult(res);
      return res;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setError(msg);
      return { ok: false, message: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  return { claim, loading, error, result };
}
