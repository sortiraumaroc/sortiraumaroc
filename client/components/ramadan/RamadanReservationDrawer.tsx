/**
 * RamadanReservationDrawer — Drawer de réservation Ramadan
 *
 * Permet de sélectionner un créneau, le nombre de personnes, et réserver.
 * Si >= 15 personnes → message devis.
 */

import { useState } from "react";
import { Moon, Users, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  RAMADAN_OFFER_TYPE_LABELS,
  RAMADAN_DEVIS_THRESHOLD,
} from "../../../shared/ramadanTypes";
import type { RamadanOfferRow, RamadanOfferTimeSlot } from "../../../shared/ramadanTypes";

// =============================================================================
// Types
// =============================================================================

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: RamadanOfferRow | null;
  establishmentName?: string;
  onConfirm?: (params: {
    offerId: string;
    timeSlot: RamadanOfferTimeSlot;
    partySize: number;
    date: string;
  }) => void;
};

// =============================================================================
// Helpers
// =============================================================================

function formatPrice(centimes: number): string {
  return `${(centimes / 100).toFixed(0)} MAD`;
}

function getNextValidDates(validFrom: string, validTo: string, count: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = new Date(validFrom);
  const to = new Date(validTo);
  const start = today > from ? today : from;

  const current = new Date(start);
  while (dates.length < count && current <= to) {
    dates.push(current.toISOString().split("T")[0]!);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function formatDateFr(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

// =============================================================================
// Component
// =============================================================================

export function RamadanReservationDrawer({
  open,
  onOpenChange,
  offer,
  establishmentName,
  onConfirm,
}: Props) {
  const [selectedSlot, setSelectedSlot] = useState<RamadanOfferTimeSlot | null>(null);
  const [partySize, setPartySize] = useState(2);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  if (!offer) return null;

  const isDevis = partySize >= RAMADAN_DEVIS_THRESHOLD;
  const dates = getNextValidDates(offer.valid_from, offer.valid_to, 14);

  const handleConfirm = async () => {
    if (!selectedSlot || !selectedDate || !onConfirm) return;

    setSubmitting(true);
    try {
      await onConfirm({
        offerId: offer.id,
        timeSlot: selectedSlot,
        partySize,
        date: selectedDate,
      });
      onOpenChange(false);
    } catch {
      // handled by parent
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-left">
            <Moon className="h-5 w-5 text-amber-500" />
            Réserver — {offer.title}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5 pb-6 overflow-y-auto max-h-[60vh]">
          {/* Info offre */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
            {offer.cover_url ? (
              <img
                src={offer.cover_url}
                alt={offer.title}
                className="w-16 h-16 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-amber-100 flex items-center justify-center text-2xl shrink-0">
                🌙
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">{offer.title}</div>
              <div className="text-xs text-slate-500">
                {RAMADAN_OFFER_TYPE_LABELS[offer.type]}
                {establishmentName ? ` · ${establishmentName}` : ""}
              </div>
              <div className="text-sm font-bold text-primary mt-0.5">
                {formatPrice(offer.price)}/pers
              </div>
            </div>
          </div>

          {/* Choix de la date */}
          <div>
            <Label className="text-sm font-semibold text-slate-700 mb-2 block">
              Date
            </Label>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {dates.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    "shrink-0 px-3 py-2 rounded-lg text-xs font-semibold border transition",
                    selectedDate === d
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-slate-700 border-slate-200 hover:border-primary/50",
                  )}
                >
                  {formatDateFr(d)}
                </button>
              ))}
            </div>
          </div>

          {/* Choix du créneau */}
          {offer.time_slots.length > 0 ? (
            <div>
              <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                <Clock className="h-3.5 w-3.5 inline mr-1" />
                Créneau
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {offer.time_slots.map((slot, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={cn(
                      "p-3 rounded-lg border text-left transition",
                      selectedSlot === slot
                        ? "bg-primary/5 border-primary text-primary"
                        : "bg-white border-slate-200 hover:border-primary/50",
                    )}
                  >
                    <div className="text-sm font-bold">{slot.label}</div>
                    <div className="text-xs text-slate-500">
                      {slot.start} – {slot.end}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Nombre de personnes */}
          <div>
            <Label className="text-sm font-semibold text-slate-700 mb-2 block">
              <Users className="h-3.5 w-3.5 inline mr-1" />
              Nombre de personnes
            </Label>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={partySize <= 1}
                onClick={() => setPartySize((v) => Math.max(1, v - 1))}
              >
                -
              </Button>
              <Input
                type="number"
                min={1}
                max={100}
                value={partySize}
                onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-20 text-center font-bold"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPartySize((v) => Math.min(100, v + 1))}
              >
                +
              </Button>
            </div>
          </div>

          {/* Alerte devis */}
          {isDevis ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-700">
                Pour {partySize} personnes, votre demande sera envoyée comme{" "}
                <strong>demande de devis</strong>. L'établissement vous répondra
                dans les meilleurs délais.
              </div>
            </div>
          ) : null}

          {/* Résumé prix */}
          {!isDevis && partySize > 0 ? (
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border">
              <span className="text-sm text-slate-600">
                Total estimé ({partySize} pers.)
              </span>
              <span className="text-lg font-extrabold text-primary">
                {formatPrice(offer.price * partySize)}
              </span>
            </div>
          ) : null}

          {/* CTA */}
          <Button
            className="w-full"
            size="lg"
            disabled={!selectedDate || (offer.time_slots.length > 0 && !selectedSlot) || submitting}
            onClick={handleConfirm}
          >
            {submitting
              ? "En cours..."
              : isDevis
                ? "Demander un devis"
                : "Confirmer la réservation"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
