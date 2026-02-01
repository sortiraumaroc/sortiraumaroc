import * as React from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { SamCalendar } from "@/components/SamCalendar";
import { BottomSheetPersonsPicker } from "@/components/booking/BottomSheetPersonsPicker";

import { getPublicEstablishment, type PublicDateSlots } from "@/lib/publicApi";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-mobile";

function toLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function timeHmFromIso(iso: string | null | undefined): string | null {
  const v = String(iso ?? "").trim();
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function localDateTimeToIso(date: Date, time: string): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hh, mm, 0, 0);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function formatShortFr(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  return new Date(ts).toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SlotChoice = { time: string; remaining: number | null; promo: number | null; slotId: string | null };

type ProvisionalSelection = {
  selectedDate: Date | null;
  selectedTime: string | null;
  partySize: number | null;
};

export function RequestReservationModificationDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  establishmentId?: string | null;
  establishmentName?: string | null;

  initialStartsAtIso?: string | null;
  initialPartySize?: number | null;

  loading?: boolean;
  onSubmit: (data: { startsAtIso: string | null; partySize: number | null }) => Promise<void>;
}) {
  const { t } = useI18n();
  const isMobile = useIsMobile();

  const canInteract = props.open && !props.loading;

  const initialDay = React.useMemo(() => {
    if (!props.initialStartsAtIso) return null;
    const d = new Date(props.initialStartsAtIso);
    if (!Number.isFinite(d.getTime())) return null;
    return toLocalDay(d);
  }, [props.initialStartsAtIso]);

  const initialTime = React.useMemo(() => timeHmFromIso(props.initialStartsAtIso), [props.initialStartsAtIso]);

  const [offersLoading, setOffersLoading] = React.useState(false);
  const [offersError, setOffersError] = React.useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = React.useState<PublicDateSlots[]>([]);

  const [selection, setSelection] = React.useState<ProvisionalSelection>({
    selectedDate: null,
    selectedTime: null,
    partySize: null,
  });

  // Reset each time it opens.
  React.useMemo(() => {
    if (!props.open) return;

    setOffersError(null);

    setSelection({
      selectedDate: initialDay,
      selectedTime: initialTime,
      partySize: typeof props.initialPartySize === "number" && Number.isFinite(props.initialPartySize) ? Math.max(1, Math.round(props.initialPartySize)) : null,
    });
  }, [props.open, initialDay, initialTime, props.initialPartySize]);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!props.open) return;
      if (!props.establishmentId) {
        setAvailableSlots([]);
        return;
      }

      setOffersLoading(true);
      setOffersError(null);

      try {
        const res = await getPublicEstablishment({ ref: props.establishmentId });
        if (cancelled) return;
        setAvailableSlots((res.offers.availableSlots ?? []) as PublicDateSlots[]);
      } catch (e) {
        if (cancelled) return;
        setAvailableSlots([]);
        setOffersError(e instanceof Error ? e.message : "Erreur");
      } finally {
        if (cancelled) return;
        setOffersLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.open, props.establishmentId]);

  const isUsingAvailability = Boolean(props.establishmentId);

  const slotsByDay = React.useMemo(() => {
    const map = new Map<string, Map<string, SlotChoice>>();

    for (const d of availableSlots ?? []) {
      const date = String(d.date ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

      const entries = map.get(date) ?? new Map<string, SlotChoice>();

      const promos = d.promos ?? {};
      const remaining = d.remaining ?? {};
      const slotIds = d.slotIds ?? {};

      for (const svc of d.services ?? []) {
        for (const time of svc.times ?? []) {
          if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) continue;

          const remRaw = remaining[time];
          const rem = typeof remRaw === "number" && Number.isFinite(remRaw) ? Math.max(0, Math.round(remRaw)) : remRaw === null ? null : null;

          const promoRaw = promos[time];
          const promo = typeof promoRaw === "number" && Number.isFinite(promoRaw) ? Math.round(promoRaw) : null;

          const slotIdRaw = slotIds[time];
          const slotId = typeof slotIdRaw === "string" && slotIdRaw.trim() ? slotIdRaw.trim() : null;

          entries.set(time, { time, remaining: rem, promo, slotId });
        }
      }

      map.set(date, entries);
    }

    return map;
  }, [availableSlots]);

  const availableDates = React.useMemo(() => {
    if (!isUsingAvailability) return [];
    const out: Date[] = [];

    for (const [date, byTime] of slotsByDay.entries()) {
      const dt = new Date(`${date}T00:00:00`);
      if (!Number.isFinite(dt.getTime())) continue;

      const hasAny = Array.from(byTime.values()).some((x) => x.remaining == null || x.remaining > 0);
      if (hasAny) out.push(toLocalDay(dt));
    }

    return out.sort((a, b) => a.getTime() - b.getTime());
  }, [isUsingAvailability, slotsByDay]);

  const selectedDayKey = React.useMemo(() => (selection.selectedDate ? ymd(selection.selectedDate) : null), [selection.selectedDate]);

  const selectedDaySlots = React.useMemo(() => {
    if (!selectedDayKey) return [] as SlotChoice[];
    const byTime = slotsByDay.get(selectedDayKey);
    if (!byTime) return [];

    return Array.from(byTime.values()).sort((a, b) => a.time.localeCompare(b.time));
  }, [selectedDayKey, slotsByDay]);

  React.useEffect(() => {
    if (!selection.selectedDate) return;
    if (!selection.selectedTime) return;
    if (!isUsingAvailability) return;

    const byTime = selectedDayKey ? slotsByDay.get(selectedDayKey) : null;
    if (!byTime || !byTime.has(selection.selectedTime)) {
      setSelection((prev) => ({ ...prev, selectedTime: null }));
    }
  }, [isUsingAvailability, selectedDayKey, selection.selectedDate, selection.selectedTime, slotsByDay]);

  const selectedSlot = React.useMemo(() => {
    if (!selection.selectedTime) return null;
    return selectedDaySlots.find((s) => s.time === selection.selectedTime) ?? null;
  }, [selection.selectedTime, selectedDaySlots]);

  const selectedStartsAtIso = React.useMemo(() => {
    if (!selection.selectedDate || !selection.selectedTime) return null;
    return localDateTimeToIso(selection.selectedDate, selection.selectedTime);
  }, [selection.selectedDate, selection.selectedTime]);

  const requestedStartsAtIso = React.useMemo(() => {
    if (!selectedStartsAtIso) return null;
    if (!props.initialStartsAtIso) return selectedStartsAtIso;
    if (props.initialStartsAtIso === selectedStartsAtIso) return null;
    return selectedStartsAtIso;
  }, [props.initialStartsAtIso, selectedStartsAtIso]);

  const requestedPartySize = React.useMemo(() => {
    if (selection.partySize == null) return null;
    const initial = typeof props.initialPartySize === "number" && Number.isFinite(props.initialPartySize) ? Math.max(1, Math.round(props.initialPartySize)) : null;
    if (initial != null && initial === selection.partySize) return null;
    return selection.partySize;
  }, [props.initialPartySize, selection.partySize]);

  const canSubmit = Boolean((requestedStartsAtIso && requestedStartsAtIso.trim()) || typeof requestedPartySize === "number");

  const reservationRecap = React.useMemo(() => {
    const parts = [];
    if (props.initialStartsAtIso) parts.push(formatShortFr(props.initialStartsAtIso));
    if (typeof props.initialPartySize === "number") parts.push(`${Math.max(1, Math.round(props.initialPartySize))} pers.`);
    return parts.filter(Boolean).join(" · ");
  }, [props.initialPartySize, props.initialStartsAtIso]);

  const nextRecap = React.useMemo(() => {
    const parts = [];
    if (selectedStartsAtIso) parts.push(formatShortFr(selectedStartsAtIso));
    if (selection.partySize != null) parts.push(`${selection.partySize} pers.`);
    return parts.filter(Boolean).join(" · ");
  }, [selectedStartsAtIso, selection.partySize]);

  const conditions = React.useMemo(() => {
    const now = Date.now();
    const initial = props.initialStartsAtIso ? new Date(props.initialStartsAtIso) : null;
    if (!initial || !Number.isFinite(initial.getTime())) return null;

    // Default policy (until PRO settings are implemented):
    // - Free modification up to 24h before
    // - Potential penalty after
    const FREE_HOURS = 24;
    const freeUntil = new Date(initial.getTime() - FREE_HOURS * 60 * 60 * 1000);
    const free = now < freeUntil.getTime();

    return {
      free,
      freeUntilIso: freeUntil.toISOString(),
      freeUntilHours: FREE_HOURS,
    };
  }, [props.initialStartsAtIso]);

  const submit = async () => {
    if (!canSubmit) return;

    await props.onSubmit({
      startsAtIso: requestedStartsAtIso,
      partySize: requestedPartySize,
    });

    props.onOpenChange(false);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 overflow-hidden",
          isMobile
            ? "left-0 top-0 translate-x-0 translate-y-0 w-screen h-[100dvh] max-w-none rounded-none"
            : "w-[calc(100%-1.5rem)] max-w-4xl max-h-[90vh]",
        )}
      >
        <div className="h-full flex flex-col">
          <DialogHeader className="p-4 border-b border-slate-200">
            <DialogTitle>Modifier votre réservation</DialogTitle>
            <div className="mt-1 text-sm text-slate-600">
              {props.establishmentName ? <span className="font-semibold text-slate-900">{props.establishmentName}</span> : null}
              {reservationRecap ? <span>{props.establishmentName ? ` · ${reservationRecap}` : reservationRecap}</span> : null}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <div className="p-4">
              {offersError ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{offersError}</div> : null}

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-bold text-foreground">Récapitulatif</div>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-600">Actuel</div>
                    <div className="mt-1 font-semibold text-slate-900">{reservationRecap || "—"}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-600">Nouvelle demande</div>
                    <div className="mt-1 font-semibold text-slate-900">{nextRecap || "Choisissez une nouvelle date/heure"}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-bold text-foreground">Nouvelle date</div>
                    <div className="mt-1 text-xs text-slate-600">Choisissez un jour disponible.</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <SamCalendar
                      value={selection.selectedDate}
                      onChange={(d) =>
                        setSelection((prev) => ({
                          ...prev,
                          selectedDate: d,
                          selectedTime: null,
                        }))
                      }
                      minDate={new Date()}
                      availableDates={isUsingAvailability ? availableDates : undefined}
                      className={offersLoading ? "opacity-70" : undefined}
                    />
                    {offersLoading ? <div className="mt-3 text-xs text-slate-500">Chargement des disponibilités…</div> : null}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-bold text-foreground">Nouvel horaire</div>
                      <div className="mt-1 text-xs text-slate-600">Seuls les créneaux avec capacité restante sont sélectionnables.</div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      {!selection.selectedDate ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Sélectionnez une date.</div>
                      ) : selectedDaySlots.length ? (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3">
                          {selectedDaySlots.map((slot) => {
                            const active = selection.selectedTime === slot.time;
                            const isFull = typeof slot.remaining === "number" && slot.remaining <= 0;

                            if (isFull) {
                              return (
                                <div
                                  key={slot.time}
                                  className={cn(
                                    "h-14 rounded-xl border",
                                    "flex flex-col items-center justify-center",
                                    "bg-slate-100 border-slate-200 text-slate-400",
                                  )}
                                  role="group"
                                  aria-label={`Créneau complet ${slot.time}`}
                                >
                                  <div className="text-base font-semibold tabular-nums text-slate-400">{slot.time}</div>
                                  <div className="mt-1 text-[11px] font-bold bg-slate-300 text-slate-700 px-2 py-0.5 rounded-md leading-none whitespace-nowrap">Complet</div>
                                </div>
                              );
                            }

                            return (
                              <button
                                key={slot.time}
                                type="button"
                                onClick={() => setSelection((prev) => ({ ...prev, selectedTime: slot.time }))}
                                className={cn(
                                  "h-14 rounded-xl border transition-colors",
                                  "flex flex-col items-center justify-center",
                                  "focus:outline-none focus:ring-2 focus:ring-[#A3001D]/25",
                                  "bg-white",
                                  active ? "border-[#A3001D] bg-[#A3001D]/[0.04]" : "border-slate-200 hover:border-[#A3001D]",
                                )}
                                aria-pressed={active}
                                aria-label={`Choisir ${slot.time}`}
                              >
                                <div className="text-base font-semibold tabular-nums text-slate-900">{slot.time}</div>
                                {slot.promo ? (
                                  <div className="mt-1 text-[11px] font-bold bg-black text-white px-2 py-0.5 rounded-md leading-none whitespace-nowrap">
                                    -{slot.promo}%
                                  </div>
                                ) : (
                                  <div className="h-[18px]" aria-hidden="true" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Aucun créneau disponible.</div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-bold text-foreground">Nombre de personnes</div>
                      <div className="mt-1 text-xs text-slate-600">Adaptez le nombre de personnes si besoin.</div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <BottomSheetPersonsPicker
                        value={selection.partySize}
                        onChange={(next) => {
                          const max = typeof selectedSlot?.remaining === "number" ? selectedSlot.remaining : null;
                          if (max != null && next > max) return;
                          setSelection((prev) => ({ ...prev, partySize: next }));
                        }}
                        min={1}
                        max={typeof selectedSlot?.remaining === "number" ? Math.max(1, selectedSlot.remaining) : 50}
                      />
                      {typeof selectedSlot?.remaining === "number" && !selection.partySize ? (
                        <div className="mt-3 text-xs text-slate-500">Places restantes : {selectedSlot.remaining}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-bold text-foreground">Impact & conditions</div>
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  {conditions ? (
                    <>
                      <div>
                        {conditions.free ? (
                          <span>
                            Modification gratuite jusqu’à <span className="font-semibold text-foreground">{conditions.freeUntilHours}h</span> avant.
                          </span>
                        ) : (
                          <span>Modification gratuite jusqu’à {conditions.freeUntilHours}h avant : délai dépassé.</span>
                        )}
                      </div>
                      <div>Au-delà : pénalité potentielle.</div>
                    </>
                  ) : (
                    <>
                      <div>Modification gratuite jusqu’à 24h avant.</div>
                      <div>Au-delà : pénalité potentielle.</div>
                    </>
                  )}
                  <div className="text-xs text-slate-500">Si l’établissement refuse ce changement, votre réservation actuelle reste valable.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white">
            <div className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500">Récapitulatif</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 truncate">{nextRecap || "Choisissez une nouvelle date/heure"}</div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={!canInteract}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    onClick={() => void submit()}
                    disabled={!canInteract || !canSubmit}
                    className="bg-primary hover:bg-primary/90 text-white"
                  >
                    Envoyer la demande de modification
                  </Button>
                </div>
              </div>
              <div className="h-[env(safe-area-inset-bottom)]" />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
