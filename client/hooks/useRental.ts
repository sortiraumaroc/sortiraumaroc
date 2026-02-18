/**
 * useRental — Custom hooks for Rental module
 *
 * Provides:
 *  - useRentalSearch: search vehicles with filters
 *  - useRentalVehicle: single vehicle detail
 *  - useRentalCities: cities with rental establishments
 *  - useInsurancePlans: active insurance plans
 *  - useRentalPriceQuote: dynamic price calculation
 *  - useMyRentalReservations: consumer's reservations
 *  - useRentalReservation: single reservation detail
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type {
  RentalVehicle,
  RentalInsurancePlan,
  RentalReservation,
  RentalKycDocument,
  RentalPriceQuote,
  RentalSearchParams,
} from "../../shared/rentalTypes";
import {
  searchRentalVehicles,
  getRentalVehicle,
  getRentalCities,
  getInsurancePlans,
  getRentalPriceQuote,
  getMyRentalReservations,
  getRentalReservation,
  type RentalSearchResponse,
  type RentalVehicleDetailResponse,
} from "@/lib/rentalApi";

// =============================================================================
// useRentalSearch — search vehicles with filters, pagination
// =============================================================================

export function useRentalSearch(initialParams?: RentalSearchParams) {
  const [vehicles, setVehicles] = useState<RentalVehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialParams?.page ?? 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<RentalSearchParams>(initialParams ?? {});

  const fetch_ = useCallback(
    async (overrideParams?: RentalSearchParams) => {
      setLoading(true);
      setError(null);
      try {
        const p = overrideParams ?? { ...params, page };
        const res = await searchRentalVehicles(p);
        setVehicles(res.vehicles);
        setTotal(res.total);
        setPage(res.page);
      } catch (e: any) {
        setError(e.message ?? "Erreur de recherche");
      } finally {
        setLoading(false);
      }
    },
    [params, page],
  );

  const updateParams = useCallback((newParams: Partial<RentalSearchParams>) => {
    setParams((prev) => ({ ...prev, ...newParams, page: 1 }));
    setPage(1);
  }, []);

  const goToPage = useCallback((p: number) => {
    setPage(p);
  }, []);

  return {
    vehicles,
    total,
    page,
    loading,
    error,
    params,
    fetch: fetch_,
    updateParams,
    goToPage,
  };
}

// =============================================================================
// useRentalVehicle — single vehicle detail
// =============================================================================

export function useRentalVehicle(vehicleId: string | null | undefined) {
  const [vehicle, setVehicle] = useState<RentalVehicleDetailResponse["vehicle"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getRentalVehicle(vehicleId);
      setVehicle(res.vehicle);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement du véhicule");
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    if (vehicleId) fetch_();
  }, [vehicleId, fetch_]);

  return { vehicle, loading, error, refetch: fetch_ };
}

// =============================================================================
// useRentalCities — cities with active rental establishments
// =============================================================================

export function useRentalCities() {
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRentalCities();
      setCities(res.cities);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement des villes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      fetch_();
    }
  }, [fetch_]);

  return { cities, loading, error, refetch: fetch_ };
}

// =============================================================================
// useInsurancePlans — active insurance plans
// =============================================================================

export function useInsurancePlans() {
  const [plans, setPlans] = useState<RentalInsurancePlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getInsurancePlans();
      setPlans(res.plans);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement des assurances");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      fetch_();
    }
  }, [fetch_]);

  return { plans, loading, error, refetch: fetch_ };
}

// =============================================================================
// useRentalPriceQuote — dynamic price calculation
// =============================================================================

export function useRentalPriceQuote() {
  const [quote, setQuote] = useState<RentalPriceQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = useCallback(
    async (input: {
      vehicle_id: string;
      pickup_date: string;
      dropoff_date: string;
      selected_options?: string[];
      insurance_plan_id?: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getRentalPriceQuote(input);
        setQuote(res);
        return res;
      } catch (e: any) {
        setError(e.message ?? "Erreur de calcul du prix");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { quote, loading, error, calculate };
}

// =============================================================================
// useMyRentalReservations — consumer's reservations
// =============================================================================

export function useMyRentalReservations(statusFilter?: string) {
  const [reservations, setReservations] = useState<RentalReservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyRentalReservations(statusFilter);
      setReservations(res.reservations);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement des réservations");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { reservations, loading, error, refetch: fetch_ };
}

// =============================================================================
// useRentalReservation — single reservation detail
// =============================================================================

export function useRentalReservation(reservationId: string | null | undefined) {
  const [reservation, setReservation] = useState<RentalReservation | null>(null);
  const [kycDocuments, setKycDocuments] = useState<RentalKycDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!reservationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getRentalReservation(reservationId);
      setReservation(res.reservation);
      setKycDocuments(res.kyc_documents ?? []);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement de la réservation");
    } finally {
      setLoading(false);
    }
  }, [reservationId]);

  useEffect(() => {
    if (reservationId) fetch_();
  }, [reservationId, fetch_]);

  return { reservation, kycDocuments, loading, error, refetch: fetch_ };
}
