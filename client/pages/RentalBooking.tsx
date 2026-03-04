import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Check, Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { AuthModalV2 } from "@/components/AuthModalV2";
import { isAuthed } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useRentalVehicle, useRentalPriceQuote, useInsurancePlans } from "@/hooks/useRental";
import { createRentalReservation, type CreateRentalReservationInput } from "@/lib/rentalApi";
import { readSearchState } from "@/lib/searchState";
import { cn } from "@/lib/utils";
import { RentalStep1Options } from "@/components/rental/RentalStep1Options";
import { RentalStep2Insurance } from "@/components/rental/RentalStep2Insurance";
import { RentalStep3Deposit } from "@/components/rental/RentalStep3Deposit";
import { RentalStep4Kyc } from "@/components/rental/RentalStep4Kyc";
import { RentalStep5Payment } from "@/components/rental/RentalStep5Payment";
import type { RentalInsurancePlan, RentalPriceQuote, RentalSelectedOption } from "../../shared/rentalTypes";

// =============================================================================
// Helpers
// =============================================================================

function diffDays(start: string, end: string): number {
  const a = new Date(start);
  const b = new Date(end);
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// =============================================================================
// Component
// =============================================================================

export default function RentalBooking() {
  const { t } = useI18n();
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();

  // ---- Steps definition ----
  const steps = useMemo(
    () => [
      { number: 1, label: "Options" },
      { number: 2, label: "Assurance" },
      { number: 3, label: "Caution" },
      { number: 4, label: "KYC" },
      { number: 5, label: "Paiement" },
    ],
    [],
  );

  const [currentStep, setCurrentStep] = useState(1);
  const [authOpen, setAuthOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ---- Search state (from previous search page) ----
  const searchState = useMemo(() => readSearchState("rentacar"), []);

  const pickupDate = searchState.date ?? searchState.checkInDate ?? "";
  const dropoffDate = searchState.checkOutDate ?? "";
  const pickupTime = searchState.pickupTime ?? "09:00";
  const dropoffTime = searchState.dropoffTime ?? "09:00";
  const pickupCity = searchState.pickupLocation ?? searchState.city ?? "";
  const dropoffCity = searchState.dropoffLocation ?? pickupCity;

  const rentalDays = useMemo(() => {
    if (!pickupDate || !dropoffDate) return 1;
    return diffDays(pickupDate, dropoffDate);
  }, [pickupDate, dropoffDate]);

  // ---- Vehicle data ----
  const { vehicle, loading: vehicleLoading, error: vehicleError } = useRentalVehicle(vehicleId);

  // ---- Insurance plans ----
  const { plans: insurancePlans } = useInsurancePlans();

  // ---- Selected state ----
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [selectedInsurancePlanId, setSelectedInsurancePlanId] = useState<string | null>(null);

  // Auto-select mandatory options when vehicle loads
  useEffect(() => {
    if (vehicle?.options) {
      const mandatoryIds = vehicle.options
        .filter((o) => o.is_mandatory)
        .map((o) => o.id);
      setSelectedOptionIds((prev) => {
        const set = new Set([...prev, ...mandatoryIds]);
        return Array.from(set);
      });
    }
  }, [vehicle]);

  // ---- Price quote ----
  const { quote, calculate: calculateQuote, loading: quoteLoading } = useRentalPriceQuote();

  // Recalculate price when options/insurance change
  useEffect(() => {
    if (!vehicleId || !pickupDate || !dropoffDate) return;
    calculateQuote({
      vehicle_id: vehicleId,
      pickup_date: pickupDate,
      dropoff_date: dropoffDate,
      selected_options: selectedOptionIds.length > 0 ? selectedOptionIds : undefined,
      insurance_plan_id: selectedInsurancePlanId ?? undefined,
    });
  }, [vehicleId, pickupDate, dropoffDate, selectedOptionIds, selectedInsurancePlanId, calculateQuote]);

  // ---- Derived ----
  const selectedInsurancePlan = useMemo(
    () => insurancePlans.find((p) => p.id === selectedInsurancePlanId) ?? null,
    [insurancePlans, selectedInsurancePlanId],
  );

  const selectedOptions: RentalSelectedOption[] = useMemo(() => {
    if (!vehicle?.options) return [];
    return vehicle.options
      .filter((o) => selectedOptionIds.includes(o.id))
      .map((o) => ({
        option_id: o.id,
        name: o.name,
        price: o.price,
        price_type: o.price_type as "per_day" | "fixed",
        quantity: 1,
      }));
  }, [vehicle, selectedOptionIds]);

  const depositAmount = useMemo(() => {
    return quote?.deposit_amount ?? 0;
  }, [quote]);

  // ---- Scroll to top on step change ----
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [currentStep]);

  // ---- Option toggling ----
  const handleToggleOption = useCallback(
    (optionId: string) => {
      // Prevent untoggling mandatory options
      const opt = vehicle?.options?.find((o) => o.id === optionId);
      if (opt?.is_mandatory) return;

      setSelectedOptionIds((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId],
      );
    },
    [vehicle],
  );

  // ---- Navigation ----
  const goToStep = useCallback(
    (step: number) => {
      // Auth check before step 5
      if (step === 5 && !isAuthed()) {
        setAuthOpen(true);
        return;
      }
      setCurrentStep(step);
    },
    [],
  );

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate(-1);
    }
  }, [currentStep, navigate]);

  // ---- Submit reservation ----
  const handleConfirm = useCallback(async () => {
    if (!vehicleId) return;
    setSubmitting(true);
    try {
      const input: CreateRentalReservationInput = {
        vehicle_id: vehicleId,
        pickup_city: pickupCity,
        pickup_date: pickupDate,
        pickup_time: pickupTime,
        dropoff_city: dropoffCity,
        dropoff_date: dropoffDate,
        dropoff_time: dropoffTime,
        selected_options: selectedOptionIds.map((id) => ({ option_id: id })),
        insurance_plan_id: selectedInsurancePlanId ?? undefined,
      };
      const result = await createRentalReservation(input);
      navigate(`/rental-booking/confirm/${result.reservation.id}`);
    } catch (e: any) {
      console.error("Erreur lors de la reservation:", e);
      alert(e.message ?? "Erreur lors de la reservation. Veuillez reessayer.");
    } finally {
      setSubmitting(false);
    }
  }, [
    vehicleId,
    pickupCity,
    pickupDate,
    pickupTime,
    dropoffCity,
    dropoffDate,
    dropoffTime,
    selectedOptionIds,
    selectedInsurancePlanId,
    navigate,
  ]);

  // ---- Render step content ----
  const renderStep = () => {
    if (vehicleLoading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (vehicleError || !vehicle) {
      return (
        <div className="text-center py-20">
          <p className="text-red-600 font-medium">{vehicleError ?? "Vehicule introuvable"}</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
            Retour
          </Button>
        </div>
      );
    }

    switch (currentStep) {
      case 1:
        return (
          <RentalStep1Options
            options={vehicle.options ?? []}
            selectedOptions={selectedOptionIds}
            onToggleOption={handleToggleOption}
            onNext={() => goToStep(2)}
          />
        );
      case 2:
        return (
          <RentalStep2Insurance
            plans={insurancePlans}
            selectedPlanId={selectedInsurancePlanId}
            onSelectPlan={setSelectedInsurancePlanId}
            onNext={() => goToStep(3)}
            onBack={() => setCurrentStep(1)}
            rentalDays={rentalDays}
          />
        );
      case 3:
        return (
          <RentalStep3Deposit
            depositAmount={depositAmount}
            insuranceName={selectedInsurancePlan?.name ?? null}
            franchise={selectedInsurancePlan?.franchise ?? 0}
            onNext={() => goToStep(4)}
            onBack={() => setCurrentStep(2)}
          />
        );
      case 4:
        return (
          <RentalStep4Kyc
            onNext={() => goToStep(5)}
            onBack={() => setCurrentStep(3)}
          />
        );
      case 5:
        return (
          <RentalStep5Payment
            vehicle={vehicle}
            quote={quote}
            selectedOptions={selectedOptions}
            insurancePlan={selectedInsurancePlan}
            pickupCity={pickupCity}
            dropoffCity={dropoffCity}
            pickupDate={pickupDate}
            dropoffDate={dropoffDate}
            pickupTime={pickupTime}
            dropoffTime={dropoffTime}
            onConfirm={handleConfirm}
            onBack={() => setCurrentStep(4)}
            submitting={submitting}
          />
        );
      default:
        return null;
    }
  };

  const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : "Location de voiture";

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* Sub-header */}
      <header className="sticky top-16 z-40 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-primary/5 rounded-lg transition-colors"
            aria-label="Retour"
          >
            <ChevronLeft className="w-6 h-6 text-primary" />
          </button>
          <h1 className="text-base md:text-lg font-bold text-foreground text-center flex-1 font-['Intra',_sans-serif] truncate px-2">
            {vehicleName}
          </h1>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </header>

      {/* Stepper + Content */}
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        {/* Step indicator */}
        <div className="flex justify-between items-center mb-10 md:mb-12 gap-1">
          {steps.map((step, idx) => (
            <div key={step.number} className="flex-1 flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all",
                  currentStep > step.number
                    ? "bg-primary text-white"
                    : currentStep === step.number
                      ? "bg-primary text-white ring-4 ring-primary/20"
                      : "bg-white border-2 border-slate-300 text-slate-600",
                )}
              >
                {currentStep > step.number ? (
                  <Check className="w-5 h-5" />
                ) : (
                  step.number
                )}
              </div>
              <p
                className={cn(
                  "text-[10px] sm:text-xs mt-2 transition-all text-center font-medium",
                  currentStep >= step.number ? "text-primary" : "text-slate-500",
                )}
              >
                {step.label}
              </p>
              {/* Connector line */}
              {idx < steps.length - 1 && (
                <div
                  className={cn(
                    "hidden sm:block absolute h-0.5 top-5",
                    currentStep > step.number ? "bg-primary" : "bg-slate-200",
                  )}
                  style={{ width: "calc(100% - 3rem)" }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="bg-white rounded-lg border-2 border-slate-200 p-6 md:p-8">
          {renderStep()}
        </div>

        {/* Footer note */}
        <div className="mt-10 text-center">
          <p className="text-xs text-slate-600 font-medium">
            <span className="text-black">
              Vos donnees sont protegees et la transaction est securisee.
            </span>
          </p>
        </div>
      </div>

      {/* Auth modal for step 5 */}
      <AuthModalV2
        isOpen={authOpen}
        contextTitle="Connectez-vous pour reserver"
        contextSubtitle="Un compte est necessaire pour finaliser votre reservation."
        onClose={() => setAuthOpen(false)}
        onAuthed={() => {
          setAuthOpen(false);
          setCurrentStep(5);
        }}
      />
    </div>
  );
}
