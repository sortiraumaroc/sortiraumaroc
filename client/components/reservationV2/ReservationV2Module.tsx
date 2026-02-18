/**
 * 4.1 — Module de réservation V2 (client)
 *
 * Full booking flow:
 *  Step 1: Calendar + time slot + party size
 *  Step 2: Promo code (optional) + summary recap
 *  Step 3: Confirmation screen
 *
 * If partySize > 15 → redirects to quote request form.
 */

import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Users, Clock, CalendarDays, Tag, CheckCircle2, AlertCircle, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { isAuthed, openAuthModal } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useBookReservationV2,
  useAvailability,
} from "@/hooks/useReservationV2";
import { scoreToStars } from "@/lib/reservationV2Api";
import type { SlotAvailability, EstablishmentSlotDiscountRow } from "../../../shared/reservationTypesV2";

// =============================================================================
// Types
// =============================================================================

export interface ReservationV2ModuleProps {
  establishmentId: string;
  establishmentName: string;
  className?: string;
  /** Called when the user wants to request a group quote (partySize > 15) */
  onRequestQuote?: (partySize: number) => void;
  /** Called after successful reservation */
  onReservationCreated?: (reservation: any) => void;
  /** User score (optional, fetched externally) */
  userScore?: number | null;
}

type Step = "select" | "recap" | "confirmed";

// =============================================================================
// Helpers
// =============================================================================

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getAvailabilityColor(rate: number): string {
  if (rate >= 90) return "text-red-500";
  if (rate >= 70) return "text-orange-500";
  if (rate >= 50) return "text-yellow-600";
  return "text-green-600";
}

function getAvailabilityLabel(rate: number): string {
  if (rate >= 90) return "Quasi complet";
  if (rate >= 70) return "Places limitées";
  if (rate >= 50) return "Bonne disponibilité";
  return "Très disponible";
}

// =============================================================================
// Sub-components
// =============================================================================

/** Interactive monthly calendar with availability badges */
function AvailabilityCalendar({
  selectedDate,
  onSelectDate,
  discounts,
}: {
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  discounts: EstablishmentSlotDiscountRow[];
}) {
  const { dateFnsLocale } = useI18n();
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const today = useMemo(() => new Date(), []);

  const discountsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of discounts) {
      if (d.specific_date && d.is_active) {
        map.set(d.specific_date, d.discount_value);
      }
    }
    return map;
  }, [discounts]);

  const monthLabel = useMemo(
    () => capitalizeFirst(format(month, "MMMM yyyy", { locale: dateFnsLocale })),
    [dateFnsLocale, month],
  );

  const grid = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const days: Date[] = [];
    let cur = start;
    while (cur <= end) {
      days.push(cur);
      cur = addDays(cur, 1);
    }
    return days;
  }, [month]);

  const dayHeaders = useMemo(() => {
    const names = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    return names;
  }, []);

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setMonth((m) => startOfMonth(addDays(startOfMonth(m), -1)))}
          className="p-1.5 rounded-full hover:bg-muted transition-colors"
          aria-label="Mois précédent"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-medium text-sm">{monthLabel}</span>
        <button
          onClick={() => setMonth((m) => startOfMonth(addDays(endOfMonth(m), 1)))}
          className="p-1.5 rounded-full hover:bg-muted transition-colors"
          aria-label="Mois suivant"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayHeaders.map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((date, i) => {
          const ymd = toYmd(date);
          const isCurrentMonth = date.getMonth() === month.getMonth();
          const isPast = date < today && !isSameDay(date, today);
          const isSelected = ymd === selectedDate;
          const discount = discountsByDate.get(ymd);
          const disabled = !isCurrentMonth || isPast;

          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => !disabled && onSelectDate(ymd)}
              className={cn(
                "relative h-10 w-full rounded-lg text-sm font-medium transition-all",
                disabled && "text-muted-foreground/30 cursor-not-allowed",
                !disabled && !isSelected && "hover:bg-muted cursor-pointer",
                isSelected && "bg-primary text-primary-foreground shadow-sm",
                isSameDay(date, today) && !isSelected && "ring-1 ring-primary/40",
              )}
            >
              {date.getDate()}
              {discount && !disabled && (
                <span className="absolute -top-1 -end-1 bg-green-500 text-white text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  %
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Time slot picker with real-time availability */
function TimeSlotPicker({
  slots,
  selectedTime,
  onSelectTime,
}: {
  slots: Array<{ time: string; availability: SlotAvailability }>;
  selectedTime: string | null;
  onSelectTime: (time: string) => void;
}) {
  if (!slots.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Aucun créneau disponible pour cette date
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {slots.map(({ time, availability }) => {
        const totalAvail = availability.paid_available + availability.free_available + availability.buffer_available;
        const isFull = totalAvail <= 0;
        const isSelected = time === selectedTime;

        return (
          <button
            key={time}
            disabled={isFull}
            onClick={() => !isFull && onSelectTime(time)}
            className={cn(
              "relative px-3 py-2.5 rounded-lg text-sm font-medium border transition-all",
              isFull && "opacity-40 cursor-not-allowed border-muted bg-muted/30 line-through",
              !isFull && !isSelected && "border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer",
              isSelected && "border-primary bg-primary text-primary-foreground shadow-sm",
            )}
          >
            <span className="block">{time}</span>
            {!isFull && (
              <span className={cn("block text-[10px] mt-0.5", isSelected ? "text-primary-foreground/80" : getAvailabilityColor(availability.occupation_rate))}>
                {getAvailabilityLabel(availability.occupation_rate)}
              </span>
            )}
            {isFull && (
              <span className="block text-[10px] mt-0.5 text-muted-foreground">Complet</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Party size selector 1-15, with pivot to quote at >15 */
function PartySizeSelector({
  value,
  onChange,
  onRequestQuote,
}: {
  value: number;
  onChange: (n: number) => void;
  onRequestQuote?: (n: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium flex items-center gap-2">
        <Users className="h-4 w-4" />
        Nombre de personnes
      </Label>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(1, value - 1))}
          className="h-9 w-9 rounded-full border flex items-center justify-center hover:bg-muted transition-colors font-bold text-lg"
          disabled={value <= 1}
        >
          −
        </button>
        <span className="text-lg font-semibold tabular-nums w-8 text-center">{value}</span>
        <button
          onClick={() => {
            if (value >= 15 && onRequestQuote) {
              onRequestQuote(value + 1);
            } else {
              onChange(Math.min(15, value + 1));
            }
          }}
          className="h-9 w-9 rounded-full border flex items-center justify-center hover:bg-muted transition-colors font-bold text-lg"
        >
          +
        </button>
      </div>
      {value >= 15 && onRequestQuote && (
        <p className="text-xs text-muted-foreground">
          Plus de 15 personnes ?{" "}
          <button onClick={() => onRequestQuote(16)} className="text-primary underline font-medium">
            Demandez un devis
          </button>
        </p>
      )}
    </div>
  );
}

/** Collapsible promo code field */
function PromoCodeField({
  promoCode,
  promoResult,
  promoLoading,
  onCheck,
  onClear,
}: {
  promoCode: string;
  promoResult: any;
  promoLoading: boolean;
  onCheck: (code: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(!!promoCode);
  const [code, setCode] = useState(promoCode);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-primary font-medium flex items-center gap-1.5 hover:underline"
      >
        <Tag className="h-3.5 w-3.5" />
        Ajouter un code promo
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium flex items-center gap-2">
        <Tag className="h-4 w-4" />
        Code promo
      </Label>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CODE PROMO"
          className="flex-1 uppercase text-sm"
          disabled={promoLoading}
        />
        {promoResult?.valid ? (
          <Button size="sm" variant="outline" onClick={onClear}>
            Retirer
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => code.trim() && onCheck(code.trim())}
            disabled={!code.trim() || promoLoading}
          >
            {promoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Appliquer"}
          </Button>
        )}
      </div>

      {promoResult && (
        <div
          className={cn(
            "text-xs font-medium flex items-center gap-1.5 px-2 py-1.5 rounded-md",
            promoResult.valid
              ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
              : "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300",
          )}
        >
          {promoResult.valid ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Réduction de {promoResult.discount?.value}
              {promoResult.discount?.type === "percentage" ? "%" : " MAD"} appliquée
            </>
          ) : (
            <>
              <AlertCircle className="h-3.5 w-3.5" />
              {promoResult.error || "Code invalide"}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Module Component
// =============================================================================

export function ReservationV2Module({
  establishmentId,
  establishmentName,
  className,
  onRequestQuote,
  onReservationCreated,
  userScore,
}: ReservationV2ModuleProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("select");
  const [cgvAccepted, setCgvAccepted] = useState(false);

  // Booking state
  const booking = useBookReservationV2(establishmentId);
  const { availability, discounts, fetchAvailability } = useAvailability(establishmentId);

  // Fetch availability when date changes
  useEffect(() => {
    if (booking.state.selectedDate) {
      fetchAvailability(booking.state.selectedDate);
    }
  }, [booking.state.selectedDate, fetchAvailability]);

  // Parse slots from availability data
  const slots = useMemo(() => {
    const data = availability.data;
    if (!data) return [];
    if (Array.isArray(data)) {
      return data.map((s, i) => ({ time: `${String(Math.floor(i)).padStart(2, "0")}:00`, availability: s }));
    }
    // Record<string, SlotAvailability>
    return Object.entries(data).map(([time, avail]) => ({ time, availability: avail }));
  }, [availability.data]);

  // Can proceed to recap?
  const canRecap = !!(booking.state.selectedDate && booking.state.selectedTime && booking.state.partySize >= 1);

  // Format date for display
  const displayDate = useMemo(() => {
    if (!booking.state.selectedDate) return "";
    try {
      return format(new Date(booking.state.selectedDate + "T00:00:00"), "EEEE d MMMM yyyy");
    } catch {
      return booking.state.selectedDate;
    }
  }, [booking.state.selectedDate]);

  const handleProceedToRecap = useCallback(() => {
    if (!isAuthed()) {
      openAuthModal();
      return;
    }
    setStep("recap");
  }, []);

  const handleSubmit = useCallback(async () => {
    const res = await booking.submit();
    if (res) {
      setStep("confirmed");
      onReservationCreated?.(res.reservation);
    }
  }, [booking, onReservationCreated]);

  const handleReset = useCallback(() => {
    booking.reset();
    setStep("select");
    setCgvAccepted(false);
  }, [booking]);

  // ───────────────────────────────────────────────────────────────────────────
  // Step 1: Selection (calendar + time + party size)
  // ───────────────────────────────────────────────────────────────────────────
  if (step === "select") {
    return (
      <div className={cn("space-y-6", className)}>
        <h3 className="text-lg font-semibold">Réserver une table</h3>

        {/* Calendar */}
        <div className="bg-card rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Date</span>
          </div>
          <AvailabilityCalendar
            selectedDate={booking.state.selectedDate}
            onSelectDate={booking.setDate}
            discounts={discounts}
          />
        </div>

        {/* Time slots */}
        {booking.state.selectedDate && (
          <div className="bg-card rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Créneau</span>
            </div>
            {availability.loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <TimeSlotPicker
                slots={slots}
                selectedTime={booking.state.selectedTime}
                onSelectTime={booking.setTime}
              />
            )}
          </div>
        )}

        {/* Party size */}
        <div className="bg-card rounded-xl border p-4">
          <PartySizeSelector
            value={booking.state.partySize}
            onChange={booking.setPartySize}
            onRequestQuote={onRequestQuote}
          />
        </div>

        {/* Continue button */}
        <Button
          onClick={handleProceedToRecap}
          disabled={!canRecap}
          className="w-full h-12 text-base font-semibold"
          size="lg"
        >
          Continuer
        </Button>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 2: Recap + promo + CGV
  // ───────────────────────────────────────────────────────────────────────────
  if (step === "recap") {
    return (
      <div className={cn("space-y-5", className)}>
        <button onClick={() => setStep("select")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          Modifier
        </button>

        <h3 className="text-lg font-semibold">Récapitulatif</h3>

        <div className="bg-card rounded-xl border divide-y">
          {/* Establishment */}
          <div className="px-4 py-3">
            <span className="text-xs text-muted-foreground">Établissement</span>
            <p className="font-medium">{establishmentName}</p>
          </div>
          {/* Date */}
          <div className="px-4 py-3">
            <span className="text-xs text-muted-foreground">Date</span>
            <p className="font-medium capitalize">{displayDate}</p>
          </div>
          {/* Time */}
          <div className="px-4 py-3">
            <span className="text-xs text-muted-foreground">Créneau</span>
            <p className="font-medium">{booking.state.selectedTime}</p>
          </div>
          {/* Party size */}
          <div className="px-4 py-3">
            <span className="text-xs text-muted-foreground">Nombre de personnes</span>
            <p className="font-medium">{booking.state.partySize} {booking.state.partySize > 1 ? "personnes" : "personne"}</p>
          </div>

          {/* Promo discount */}
          {booking.state.promoResult?.valid && booking.state.promoResult.discount && (
            <div className="px-4 py-3">
              <span className="text-xs text-muted-foreground">Réduction</span>
              <p className="font-medium text-green-600">
                -{booking.state.promoResult.discount.value}
                {booking.state.promoResult.discount.type === "percentage" ? "%" : " MAD"}
                <span className="text-xs ms-1 text-muted-foreground">
                  ({booking.state.promoResult.discount.label})
                </span>
              </p>
            </div>
          )}

          {/* User score */}
          {typeof userScore === "number" && (
            <div className="px-4 py-3">
              <span className="text-xs text-muted-foreground">Votre score de fiabilité</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                <span className="font-semibold">{scoreToStars(userScore).toFixed(1)}</span>
                <span className="text-xs text-muted-foreground">/ 5.0</span>
              </div>
            </div>
          )}

          {/* Beta mode mention */}
          <div className="px-4 py-3 bg-blue-50/50 dark:bg-blue-950/20">
            <Badge variant="secondary" className="text-[10px]">
              Beta
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">
              Réservation gratuite — En attente de confirmation par l'établissement
            </p>
          </div>
        </div>

        {/* Promo code */}
        <div className="bg-card rounded-xl border p-4">
          <PromoCodeField
            promoCode={booking.state.promoCode}
            promoResult={booking.state.promoResult}
            promoLoading={booking.state.promoLoading}
            onCheck={booking.checkPromo}
            onClear={booking.clearPromo}
          />
        </div>

        {/* Cancellation conditions */}
        <div className="bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/50 p-4 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <p className="font-medium">Conditions d'annulation</p>
          <ul className="list-disc ps-4 space-y-0.5 text-amber-800 dark:text-amber-300">
            <li>Annulation gratuite plus de 24h avant</li>
            <li>Annulation tardive (12-24h) : impact sur votre score</li>
            <li>Annulation très tardive (&lt;12h) : impact majeur sur votre score</li>
            <li>Impossible d'annuler moins de 3h avant</li>
          </ul>
        </div>

        {/* CGV acceptance */}
        <div className="flex items-start gap-3">
          <Checkbox
            id="cgv"
            checked={cgvAccepted}
            onCheckedChange={(checked) => setCgvAccepted(checked === true)}
          />
          <label htmlFor="cgv" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
            J'accepte les{" "}
            <a href="/cgv" target="_blank" className="text-primary underline">
              conditions générales de vente
            </a>{" "}
            et la politique d'annulation
          </label>
        </div>

        {/* Error */}
        {booking.error && (
          <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-300 text-sm p-3 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {booking.error}
          </div>
        )}

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={!cgvAccepted || booking.submitting}
          className="w-full h-12 text-base font-semibold"
          size="lg"
        >
          {booking.submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin me-2" />
              Réservation en cours…
            </>
          ) : (
            "Confirmer la réservation"
          )}
        </Button>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 3: Confirmed
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className={cn("space-y-6 text-center", className)}>
      <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>

      <div>
        <h3 className="text-xl font-bold">Réservation envoyée !</h3>
        <p className="text-sm text-muted-foreground mt-2">
          {booking.waitlisted
            ? "Vous êtes sur liste d'attente. Nous vous préviendrons dès qu'une place se libère."
            : "Votre demande est en attente de confirmation par l'établissement. Vous recevrez une notification dès que votre réservation sera confirmée."}
        </p>
      </div>

      {booking.result && (
        <div className="bg-card rounded-xl border divide-y text-start text-sm">
          <div className="px-4 py-2.5">
            <span className="text-xs text-muted-foreground">Référence</span>
            <p className="font-mono font-medium">{booking.result.booking_reference ?? booking.result.id.slice(0, 8)}</p>
          </div>
          <div className="px-4 py-2.5">
            <span className="text-xs text-muted-foreground">Statut</span>
            <Badge variant={booking.waitlisted ? "secondary" : "default"} className="mt-0.5">
              {booking.waitlisted ? "Liste d'attente" : "En attente"}
            </Badge>
          </div>
        </div>
      )}

      <Button onClick={handleReset} variant="outline" className="w-full">
        Nouvelle réservation
      </Button>
    </div>
  );
}
