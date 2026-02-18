import { useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Info, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBooking, type ReservationMode } from "@/hooks/useBooking";

export default function Step2HotelMode() {
  const {
    partySize,
    checkInDate,
    checkOutDate,
    hotelRoomSelection,
    reservationMode,
    setReservationMode,
    setCurrentStep,
    canProceed,
  } = useBooking();

  const [showInfo, setShowInfo] = useState(false);

  const handleSelectMode = (mode: ReservationMode) => {
    setReservationMode(mode);
  };

  const handleBack = () => setCurrentStep(1);

  const handleContinue = () => {
    if (canProceed(2)) setCurrentStep(3);
  };

  return (
    <div className="space-y-6" style={{ fontFamily: "Circular Std, sans-serif" }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">2</div>
        <div>
          <p className="text-xs text-primary font-bold tracking-wider">ÉTAPE 2 SUR 4</p>
          <h2 className="text-lg md:text-xl font-bold text-foreground">Conditions de réservation</h2>
        </div>
      </div>

      <div className="bg-primary/5 p-4 rounded-lg border-2 border-primary/20">
        <p className="text-xs text-slate-600 mb-3 font-semibold tracking-wider">RÉCAPITULATIF</p>
        <div className="space-y-2">
          <p className="text-lg font-bold text-foreground">{partySize ?? "—"} voyageur{partySize && partySize > 1 ? "s" : ""}</p>
          <p className="text-sm text-foreground">
            {checkInDate?.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} → {checkOutDate?.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <p className="text-sm text-foreground">{hotelRoomSelection?.roomsCount ?? "—"} chambre · {hotelRoomSelection?.roomType ?? "—"}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-bold text-foreground">Choisissez une option</h3>
          <button type="button" onClick={() => setShowInfo((v) => !v)} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <Info className="h-4 w-4" />
            Détails
          </button>
        </div>

        {showInfo ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-semibold">Comment ça marche ?</div>
            <div className="mt-1">Cette option permet de simuler deux types de réservation (flexible ou garantie). Les conditions exactes peuvent varier selon l’hôtel.</div>
          </div>
        ) : null}

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleSelectMode("non-guaranteed")}
            className={cn(
              "w-full p-4 rounded-lg border-2 transition-all text-start",
              reservationMode === "non-guaranteed" ? "border-primary bg-primary/5" : "border-slate-300 bg-white hover:border-primary/50",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                  reservationMode === "non-guaranteed" ? "border-primary bg-primary" : "border-slate-300",
                )}
              >
                {reservationMode === "non-guaranteed" ? <div className="w-2.5 h-2.5 bg-white rounded-full" /> : null}
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground mb-1">Flexible</h4>
                <p className="text-sm text-slate-600">Paiement sur place (selon disponibilité). Option idéale si vos plans peuvent changer.</p>
              </div>
              <Clock className="w-5 h-5 text-slate-400 flex-shrink-0" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelectMode("guaranteed")}
            className={cn(
              "w-full p-4 rounded-lg border-2 transition-all text-start",
              reservationMode === "guaranteed" ? "border-primary bg-primary/5" : "border-slate-300 bg-white hover:border-primary/50",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                  reservationMode === "guaranteed" ? "border-primary bg-primary" : "border-slate-300",
                )}
              >
                {reservationMode === "guaranteed" ? <div className="w-2.5 h-2.5 bg-white rounded-full" /> : null}
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground mb-1">Réservation garantie</h4>
                <p className="text-sm text-slate-600">Garantissez votre séjour (carte/pré-autorisation selon conditions) pour sécuriser la chambre.</p>
              </div>
              <Lock className="w-5 h-5 text-slate-400 flex-shrink-0" />
            </div>
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1 h-11 gap-2" onClick={handleBack}>
          <ChevronLeft className="h-5 w-5" />
          Retour
        </Button>
        <Button type="button" className="flex-1 h-11 bg-primary hover:bg-primary/90 text-white gap-2" onClick={handleContinue} disabled={!canProceed(2)}>
          Continuer
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
