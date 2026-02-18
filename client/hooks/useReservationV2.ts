/**
 * useReservationV2 — Custom hook for V2 reservation state + API calls.
 *
 * Provides:
 *  - availability fetching
 *  - reservation booking state machine
 *  - promo code validation
 *  - score retrieval
 *  - waitlist management
 *  - quote management
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { PaymentType, EventType, SlotAvailability } from "../../shared/reservationTypesV2";
import {
  getEstablishmentAvailability,
  getEstablishmentDateAvailability,
  createReservationV2,
  modifyReservationV2,
  cancelReservationV2,
  upgradeReservationV2,
  getReservationQrCode,
  validatePromoCode,
  getMyReservationsV2,
  getMyScoreV2,
  joinWaitlistV2,
  confirmWaitlistOfferV2,
  submitQuoteRequestV2,
  getMyQuotesV2,
  getQuoteDetailV2,
  sendQuoteMessageV2,
  acceptQuoteV2,
  respondToNoShowDisputeV2,
  type ReservationV2Row,
  type ScoreResult,
  type PromoValidationResult,
  type CreateReservationInput,
  type SubmitQuoteInput,
  type ReservationV2ApiError,
} from "@/lib/reservationV2Api";

// =============================================================================
// Async state helper
// =============================================================================

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useAsyncState<T>(initial: T | null = null): [
  AsyncState<T>,
  {
    setLoading: () => void;
    setData: (data: T) => void;
    setError: (error: string) => void;
    reset: () => void;
  },
] {
  const [state, setState] = useState<AsyncState<T>>({
    data: initial,
    loading: false,
    error: null,
  });

  return [
    state,
    {
      setLoading: () => setState({ data: state.data, loading: true, error: null }),
      setData: (data: T) => setState({ data, loading: false, error: null }),
      setError: (error: string) => setState({ data: null, loading: false, error }),
      reset: () => setState({ data: null, loading: false, error: null }),
    },
  ];
}

// =============================================================================
// useAvailability — fetch slot availability for a given date
// =============================================================================

export function useAvailability(establishmentId: string | null) {
  const [availability, avail] = useAsyncState<SlotAvailability[] | Record<string, SlotAvailability>>();
  const [discounts, setDiscounts] = useState<any[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAvailability = useCallback(
    async (date: string) => {
      if (!establishmentId || !date) return;
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      avail.setLoading();
      try {
        const res = await getEstablishmentAvailability(establishmentId, date);
        avail.setData(res.availability);
        setDiscounts(res.discounts ?? []);
      } catch (e: any) {
        avail.setError(e.message ?? "Erreur de chargement");
      }
    },
    [establishmentId],
  );

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { availability, discounts, fetchAvailability };
}

// =============================================================================
// useBookReservationV2 — booking flow state
// =============================================================================

export interface BookingV2State {
  establishmentId: string;
  selectedDate: string | null;
  selectedTime: string | null;
  partySize: number;
  paymentType: PaymentType;
  promoCode: string;
  promoResult: PromoValidationResult | null;
  promoLoading: boolean;
  slotId: string | null;
  meta: Record<string, unknown>;
}

export function useBookReservationV2(establishmentId: string) {
  const [state, setState] = useState<BookingV2State>({
    establishmentId,
    selectedDate: null,
    selectedTime: null,
    partySize: 2,
    paymentType: "free",
    promoCode: "",
    promoResult: null,
    promoLoading: false,
    slotId: null,
    meta: {},
  });

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ReservationV2Row | null>(null);
  const [waitlisted, setWaitlisted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDate = useCallback((date: string | null) => {
    setState((s) => ({ ...s, selectedDate: date, selectedTime: null }));
  }, []);

  const setTime = useCallback((time: string | null) => {
    setState((s) => ({ ...s, selectedTime: time }));
  }, []);

  const setPartySize = useCallback((size: number) => {
    setState((s) => ({ ...s, partySize: Math.max(1, Math.min(15, size)) }));
  }, []);

  const setPaymentType = useCallback((pt: PaymentType) => {
    setState((s) => ({ ...s, paymentType: pt }));
  }, []);

  const setSlotId = useCallback((id: string | null) => {
    setState((s) => ({ ...s, slotId: id }));
  }, []);

  // Promo code validation
  const checkPromo = useCallback(
    async (code: string) => {
      setState((s) => ({ ...s, promoCode: code, promoLoading: true, promoResult: null }));
      try {
        const res = await validatePromoCode(code, establishmentId, state.selectedDate ?? undefined);
        setState((s) => ({ ...s, promoResult: res, promoLoading: false }));
      } catch {
        setState((s) => ({
          ...s,
          promoResult: { ok: false, valid: false, error: "Erreur de validation" },
          promoLoading: false,
        }));
      }
    },
    [establishmentId, state.selectedDate],
  );

  const clearPromo = useCallback(() => {
    setState((s) => ({ ...s, promoCode: "", promoResult: null }));
  }, []);

  // Submit reservation
  const submit = useCallback(async () => {
    if (!state.selectedDate || !state.selectedTime) {
      setError("Sélectionnez une date et un créneau");
      return null;
    }

    setSubmitting(true);
    setError(null);
    try {
      const input: CreateReservationInput = {
        establishment_id: establishmentId,
        starts_at: `${state.selectedDate}T${state.selectedTime}`,
        party_size: state.partySize,
        payment_type: state.paymentType,
        slot_id: state.slotId ?? undefined,
        promo_code_id: state.promoResult?.valid && state.promoResult?.discount
          ? state.promoResult.discount.id
          : undefined,
        meta: state.meta,
      };
      const res = await createReservationV2(input);
      setResult(res.reservation);
      setWaitlisted(res.waitlisted ?? false);
      return res;
    } catch (e: any) {
      setError(e.message ?? "Erreur lors de la réservation");
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [establishmentId, state]);

  const reset = useCallback(() => {
    setState({
      establishmentId,
      selectedDate: null,
      selectedTime: null,
      partySize: 2,
      paymentType: "free",
      promoCode: "",
      promoResult: null,
      promoLoading: false,
      slotId: null,
      meta: {},
    });
    setResult(null);
    setWaitlisted(false);
    setError(null);
  }, [establishmentId]);

  return {
    state,
    setDate,
    setTime,
    setPartySize,
    setPaymentType,
    setSlotId,
    checkPromo,
    clearPromo,
    submit,
    submitting,
    result,
    waitlisted,
    error,
    reset,
  };
}

// =============================================================================
// useMyReservationsV2 — fetch user's V2 reservations
// =============================================================================

export function useMyReservationsV2() {
  const [reservations, setReservations] = useState<ReservationV2Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(
    async (opts?: { status?: string; upcoming?: boolean; limit?: number; offset?: number }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getMyReservationsV2(opts);
        setReservations(res.reservations);
      } catch (e: any) {
        setError(e.message ?? "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const cancel = useCallback(async (id: string, reason?: string) => {
    return cancelReservationV2(id, reason);
  }, []);

  const upgrade = useCallback(async (id: string) => {
    return upgradeReservationV2(id);
  }, []);

  const modify = useCallback(
    async (id: string, patch: { starts_at?: string; party_size?: number; slot_id?: string }) => {
      return modifyReservationV2(id, patch);
    },
    [],
  );

  const fetchQr = useCallback(async (id: string) => {
    return getReservationQrCode(id);
  }, []);

  return {
    reservations,
    loading,
    error,
    fetch: fetch_,
    cancel,
    upgrade,
    modify,
    fetchQr,
  };
}

// =============================================================================
// useMyScoreV2 — fetch user reliability score
// =============================================================================

export function useMyScoreV2() {
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyScoreV2();
      setScore(res);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  return { score, loading, error, fetch: fetch_ };
}

// =============================================================================
// useWaitlistV2
// =============================================================================

export function useWaitlistV2() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = useCallback(
    async (input: { establishment_id: string; starts_at: string; party_size: number; slot_id?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await joinWaitlistV2(input);
        return res;
      } catch (e: any) {
        setError(e.message ?? "Erreur");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const confirmOffer = useCallback(async (entryId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await confirmWaitlistOfferV2(entryId);
      return res;
    } catch (e: any) {
      setError(e.message ?? "Erreur");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, join, confirmOffer };
}

// =============================================================================
// useQuotesV2
// =============================================================================

export function useQuotesV2() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyQuotesV2();
      setQuotes(res.quotes ?? []);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  const submitQuote = useCallback(async (input: SubmitQuoteInput) => {
    setLoading(true);
    setError(null);
    try {
      const res = await submitQuoteRequestV2(input);
      return res;
    } catch (e: any) {
      setError(e.message ?? "Erreur");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getDetail = useCallback(async (quoteId: string) => {
    return getQuoteDetailV2(quoteId);
  }, []);

  const sendMessage = useCallback(async (quoteId: string, content: string, attachments?: any[]) => {
    return sendQuoteMessageV2(quoteId, content, attachments);
  }, []);

  const accept = useCallback(async (quoteId: string) => {
    return acceptQuoteV2(quoteId);
  }, []);

  return { quotes, loading, error, fetchQuotes, submitQuote, getDetail, sendMessage, accept };
}

// =============================================================================
// useNoShowDisputeV2
// =============================================================================

export function useNoShowDisputeV2() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ newStatus: string } | null>(null);

  const respond = useCallback(
    async (
      disputeId: string,
      response: "confirms_absence" | "disputes",
      evidence?: Array<{ url: string; type: string; description?: string }>,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const res = await respondToNoShowDisputeV2(disputeId, response, evidence);
        setResult(res);
        return res;
      } catch (e: any) {
        setError(e.message ?? "Erreur");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, result, respond };
}
