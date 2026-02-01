import { useEffect, useMemo, useRef } from "react";

import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { listProOffers, listProPackBilling, listProReservations } from "@/lib/pro/api";
import type { Establishment, Reservation } from "@/lib/pro/types";
import { playProNotificationSound } from "@/lib/pro/notificationSound";
import { getGuestInfo, isReservationInPast } from "@/components/pro/reservations/reservationHelpers";

import { formatLeJjMmAaAHeure } from "@shared/datetime";

type PackPurchaseRow = {
  id: string;
  establishment_id: string;
  pack_id: string;
  buyer_name: string | null;
  buyer_email: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  currency: string;
  payment_status: string;
  status: string;
  valid_until: string | null;
  created_at: string;
};

function formatDateTimeFr(iso: string | null | undefined): string {
  if (!iso) return "";
  return formatLeJjMmAaAHeure(iso);
}

function safeTitle(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function ProLiveNotifications(props: {
  userId: string;
  establishment: Establishment;
  onOpenReservation: (reservationId: string) => void;
  onOpenPackPurchase: (purchaseId: string) => void;
}) {
  const establishmentId = props.establishment.id;

  const knownReservationIdsRef = useRef<Set<string>>(new Set());
  const knownPackPurchaseIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const pollingKey = useMemo(() => `${props.userId}:${establishmentId}`, [props.userId, establishmentId]);

  const showReservationToast = (r: Reservation) => {
    const guest = getGuestInfo(r);
    const when = formatDateTimeFr(r.starts_at);
    const party = typeof r.party_size === "number" ? `${r.party_size} pers.` : "";

    playProNotificationSound();

    toast({
      title: "Nouvelle réservation",
      description: (
        <div className="text-sm">
          <div className="font-semibold text-slate-900">{guest.displayName || "Client"}</div>
          <div className="text-xs text-slate-600">{[when, party].filter(Boolean).join(" · ")}</div>
        </div>
      ),
      action: (
        <ToastAction altText="Voir" onClick={() => props.onOpenReservation(r.id)}>
          Voir
        </ToastAction>
      ),
    });
  };

  const showPackPurchaseToast = async (p: PackPurchaseRow) => {
    let packLabel = "Pack";
    try {
      const offers = await listProOffers(establishmentId);
      const packs = Array.isArray((offers as any)?.packs) ? ((offers as any).packs as Array<{ id?: string; title?: unknown; label?: unknown }>) : [];
      const match = packs.find((x) => x?.id === p.pack_id);
      const t = safeTitle(match?.title);
      const l = safeTitle(match?.label);
      packLabel = t || l || packLabel;
    } catch {
      // ignore
    }

    const buyer = (p.buyer_name || p.buyer_email || "Client").trim();
    const when = formatDateTimeFr(p.created_at);

    playProNotificationSound();

    toast({
      title: "Nouveau pack acheté",
      description: (
        <div className="text-sm">
          <div className="font-semibold text-slate-900">{buyer}</div>
          <div className="text-xs text-slate-600">
            {packLabel}
            {p.quantity ? ` · ${p.quantity}` : ""}
            {when ? ` · ${when}` : ""}
          </div>
        </div>
      ),
      action: (
        <ToastAction altText="Voir" onClick={() => props.onOpenPackPurchase(p.id)}>
          Voir
        </ToastAction>
      ),
    });
  };

  useEffect(() => {
    initializedRef.current = false;
    knownReservationIdsRef.current = new Set();
    knownPackPurchaseIdsRef.current = new Set();

    let cancelled = false;

    const warmup = async () => {
      try {
        const [resReservations, resPacks] = await Promise.all([
          listProReservations(establishmentId),
          listProPackBilling(establishmentId),
        ]);

        if (cancelled) return;

        const reservations = (resReservations.reservations ?? []) as Reservation[];
        const nowMs = Date.now();
        for (const r of reservations) {
          if (isReservationInPast(r, nowMs)) continue;
          knownReservationIdsRef.current.add(r.id);
        }

        const purchases = (resPacks.purchases ?? []) as PackPurchaseRow[];
        for (const p of purchases) knownPackPurchaseIdsRef.current.add(p.id);

        initializedRef.current = true;
      } catch {
        initializedRef.current = true;
      }
    };

    void warmup();

    return () => {
      cancelled = true;
    };
  }, [pollingKey, establishmentId]);

  useEffect(() => {
    let disposed = false;

    const poll = async () => {
      if (disposed) return;
      if (!initializedRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

      try {
        const res = await listProReservations(establishmentId);
        if (disposed) return;

        const reservations = (res.reservations ?? []) as Reservation[];
        const known = knownReservationIdsRef.current;

        const nowMs = Date.now();

        // find newest first so only the latest toast survives (TOAST_LIMIT=1)
        const newOnes = reservations
          .filter((r) => r?.id && !known.has(r.id) && !isReservationInPast(r, nowMs))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        if (newOnes.length) {
          // add all to known to avoid repeated notifications
          for (const r of newOnes) known.add(r.id);
          showReservationToast(newOnes[0]);
        }
      } catch {
        // ignore
      }

      try {
        const res = await listProPackBilling(establishmentId);
        if (disposed) return;

        const purchases = (res.purchases ?? []) as PackPurchaseRow[];
        const known = knownPackPurchaseIdsRef.current;

        const newOnes = purchases
          .filter((p) => p?.id && !known.has(p.id))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        if (newOnes.length) {
          for (const p of newOnes) known.add(p.id);
          void showPackPurchaseToast(newOnes[0]);
        }
      } catch {
        // ignore
      }
    };

    const t = window.setInterval(() => {
      void poll();
    }, 12_000);

    return () => {
      disposed = true;
      window.clearInterval(t);
    };
  }, [pollingKey, establishmentId]);

  return null;
}
