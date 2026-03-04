import {
  Car,
  CalendarDays,
  MapPin,
  Clock,
  Shield,
  Settings,
  Landmark,
  CreditCard,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RentalInsurancePlan, RentalPriceQuote, RentalSelectedOption } from "../../../shared/rentalTypes";

// =============================================================================
// Types
// =============================================================================

interface RentalStep5PaymentProps {
  vehicle: any;
  quote: RentalPriceQuote | null;
  selectedOptions: RentalSelectedOption[];
  insurancePlan: RentalInsurancePlan | null;
  pickupCity: string;
  dropoffCity: string;
  pickupDate: string;
  dropoffDate: string;
  pickupTime: string;
  dropoffTime: string;
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function formatDateFr(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// =============================================================================
// Component
// =============================================================================

export function RentalStep5Payment({
  vehicle,
  quote,
  selectedOptions,
  insurancePlan,
  pickupCity,
  dropoffCity,
  pickupDate,
  dropoffDate,
  pickupTime,
  dropoffTime,
  onConfirm,
  onBack,
  submitting,
}: RentalStep5PaymentProps) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const rentalDays = quote?.rental_days ?? 1;
  const basePrice = quote?.base_price ?? 0;
  const optionsTotal = quote?.options_total ?? 0;
  const insuranceTotal = quote?.insurance_total ?? 0;
  const depositAmount = quote?.deposit_amount ?? 0;
  const totalPrice = quote?.total_price ?? 0;
  const pricePerDay = quote?.price_per_day ?? 0;

  const vehiclePhoto = vehicle?.photos?.[0] ?? null;
  const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : "Vehicule";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Recapitulatif et paiement</h2>
        </div>
        <p className="text-sm text-slate-600">
          Verifiez les details de votre reservation avant de confirmer.
        </p>
      </div>

      {/* Vehicle recap card */}
      <div className="rounded-xl border-2 border-slate-200 overflow-hidden">
        {/* Vehicle header */}
        <div className="flex items-center gap-4 p-4 bg-slate-50 border-b border-slate-200">
          {vehiclePhoto && (
            <img
              src={vehiclePhoto}
              alt={vehicleName}
              className="w-20 h-14 object-cover rounded-lg shrink-0"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-primary shrink-0" />
              <h3 className="font-bold text-foreground text-sm truncate">{vehicleName}</h3>
            </div>
            {vehicle?.year && (
              <p className="text-[11px] text-slate-500 mt-0.5">{vehicle.year}</p>
            )}
          </div>
        </div>

        {/* Dates and locations */}
        <div className="p-4 space-y-3">
          {/* Pickup */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Prise en charge</p>
              <p className="text-sm font-semibold text-foreground">{pickupCity || "-"}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <CalendarDays className="w-3 h-3 text-slate-400" />
                <span className="text-xs text-slate-600">{formatDateFr(pickupDate)}</span>
                <Clock className="w-3 h-3 text-slate-400 ml-1" />
                <span className="text-xs text-slate-600">{pickupTime}</span>
              </div>
            </div>
          </div>

          {/* Dropoff */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Restitution</p>
              <p className="text-sm font-semibold text-foreground">{dropoffCity || "-"}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <CalendarDays className="w-3 h-3 text-slate-400" />
                <span className="text-xs text-slate-600">{formatDateFr(dropoffDate)}</span>
                <Clock className="w-3 h-3 text-slate-400 ml-1" />
                <span className="text-xs text-slate-600">{dropoffTime}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Options summary */}
      {selectedOptions.length > 0 && (
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Options</h3>
          </div>
          <div className="space-y-2">
            {selectedOptions.map((opt) => (
              <div key={opt.option_id} className="flex items-center justify-between text-xs">
                <span className="text-slate-700">{opt.name}</span>
                <span className="font-semibold text-foreground">
                  {opt.price} MAD{opt.price_type === "per_day" ? "/jour" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insurance summary */}
      {insurancePlan && (
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Assurance</h3>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-700">{insurancePlan.name}</span>
            <span className="font-semibold text-foreground">
              {insurancePlan.price_per_day} MAD/jour
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Franchise : {insurancePlan.franchise.toLocaleString("fr-FR")} MAD
          </p>
        </div>
      )}

      {/* Deposit */}
      {depositAmount > 0 && (
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Landmark className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Caution</h3>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-700">Retenue a la prise en charge</span>
            <span className="font-semibold text-foreground">
              {depositAmount.toLocaleString("fr-FR")} MAD
            </span>
          </div>
        </div>
      )}

      {/* Price breakdown */}
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5">
        <button
          type="button"
          onClick={() => setBreakdownOpen((v) => !v)}
          className="flex items-center justify-between w-full"
        >
          <span className="text-sm font-bold text-foreground">Detail du prix</span>
          {breakdownOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {breakdownOpen && (
          <div className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">
                Location ({pricePerDay} MAD/jour x {rentalDays} jour{rentalDays > 1 ? "s" : ""})
              </span>
              <span className="font-semibold">{basePrice.toLocaleString("fr-FR")} MAD</span>
            </div>

            {/* Breakdown details */}
            {quote?.breakdown && (
              <div className="pl-4 space-y-1 text-[11px] text-slate-500">
                {quote.breakdown.standard_days > 0 && (
                  <div className="flex justify-between">
                    <span>{quote.breakdown.standard_days} jour{quote.breakdown.standard_days > 1 ? "s" : ""} standard</span>
                    <span>{(quote.breakdown.standard_days * quote.breakdown.standard_rate).toLocaleString("fr-FR")} MAD</span>
                  </div>
                )}
                {quote.breakdown.weekend_days > 0 && (
                  <div className="flex justify-between">
                    <span>{quote.breakdown.weekend_days} jour{quote.breakdown.weekend_days > 1 ? "s" : ""} weekend</span>
                    <span>{(quote.breakdown.weekend_days * quote.breakdown.weekend_rate).toLocaleString("fr-FR")} MAD</span>
                  </div>
                )}
                {quote.breakdown.high_season_days > 0 && (
                  <div className="flex justify-between">
                    <span>{quote.breakdown.high_season_days} jour{quote.breakdown.high_season_days > 1 ? "s" : ""} haute saison</span>
                    <span>{(quote.breakdown.high_season_days * quote.breakdown.high_season_rate).toLocaleString("fr-FR")} MAD</span>
                  </div>
                )}
                {quote.breakdown.long_duration_discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Remise longue duree</span>
                    <span>-{quote.breakdown.long_duration_discount.toLocaleString("fr-FR")} MAD</span>
                  </div>
                )}
              </div>
            )}

            {optionsTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">Options</span>
                <span className="font-semibold">{optionsTotal.toLocaleString("fr-FR")} MAD</span>
              </div>
            )}

            {insuranceTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">Assurance</span>
                <span className="font-semibold">{insuranceTotal.toLocaleString("fr-FR")} MAD</span>
              </div>
            )}

            <div className="border-t border-primary/20 my-2" />
          </div>
        )}

        {/* Total */}
        <div className={cn("flex items-center justify-between", breakdownOpen ? "mt-0" : "mt-3")}>
          <span className="text-base font-bold text-foreground">Total</span>
          <span className="text-2xl font-bold text-primary">
            {totalPrice.toLocaleString("fr-FR")} <span className="text-sm">MAD</span>
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12 font-bold" disabled={submitting}>
          Retour
        </Button>
        <Button
          onClick={onConfirm}
          className="flex-1 h-12 text-base font-bold"
          size="lg"
          disabled={submitting || !quote}
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Traitement...
            </>
          ) : (
            "Confirmer et payer"
          )}
        </Button>
      </div>

      {/* Legal text */}
      <p className="text-[10px] text-center text-slate-500 leading-relaxed">
        En confirmant, vous acceptez les conditions generales de location
        et la politique d'annulation du prestataire.
      </p>
    </div>
  );
}
