import { Check, Shield, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RentalInsurancePlan } from "../../../shared/rentalTypes";

// =============================================================================
// Types
// =============================================================================

interface RentalStep2InsuranceProps {
  plans: RentalInsurancePlan[];
  selectedPlanId: string | null;
  onSelectPlan: (id: string | null) => void;
  onNext: () => void;
  onBack: () => void;
  rentalDays: number;
}

// =============================================================================
// Component
// =============================================================================

export function RentalStep2Insurance({
  plans,
  selectedPlanId,
  onSelectPlan,
  onNext,
  onBack,
  rentalDays,
}: RentalStep2InsuranceProps) {
  const sortedPlans = [...plans].sort((a, b) => a.sort_order - b.sort_order);
  const declinedInsurance = selectedPlanId === "none";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Choisissez votre assurance</h2>
        </div>
        <p className="text-sm text-slate-600">
          Protegez-vous pendant toute la duree de votre location ({rentalDays} jour{rentalDays > 1 ? "s" : ""}).
        </p>
      </div>

      {/* Insurance plans */}
      <div className="space-y-4">
        {sortedPlans.map((plan) => {
          const isSelected = selectedPlanId === plan.id;
          const totalPrice = plan.price_per_day * rentalDays;

          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelectPlan(plan.id)}
              className={cn(
                "w-full text-left rounded-xl border-2 p-5 transition-all relative",
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-slate-200 hover:border-slate-300 bg-white",
              )}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-4">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold bg-primary text-white shadow-sm">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Plan name */}
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className={cn("w-5 h-5", isSelected ? "text-primary" : "text-slate-400")} />
                    <span className="font-bold text-foreground">{plan.name}</span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                    {plan.description}
                  </p>

                  {/* Coverages */}
                  <ul className="space-y-1.5">
                    {plan.coverages.map((coverage, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                        <Check className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                        <span>{coverage}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Franchise */}
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs text-slate-500">
                      Franchise : <span className="font-semibold text-foreground">{plan.franchise.toLocaleString("fr-FR")} MAD</span>
                    </p>
                  </div>
                </div>

                {/* Price + radio */}
                <div className="flex flex-col items-end gap-3 shrink-0">
                  <div className="text-right">
                    <span className="text-lg font-bold text-foreground">
                      {totalPrice.toLocaleString("fr-FR")} MAD
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {plan.price_per_day} MAD/jour x {rentalDays} jour{rentalDays > 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Radio indicator */}
                  <div
                    className={cn(
                      "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                      isSelected
                        ? "border-primary bg-primary"
                        : "border-slate-300 bg-white",
                    )}
                  >
                    {isSelected && (
                      <div className="w-2.5 h-2.5 rounded-full bg-white" />
                    )}
                  </div>
                </div>
              </div>

              {/* Partner name */}
              {plan.partner_name && (
                <p className="text-[10px] text-slate-400 mt-2">
                  Partenaire : {plan.partner_name}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Decline insurance */}
      <div>
        <button
          type="button"
          onClick={() => onSelectPlan(declinedInsurance ? null : "none")}
          className={cn(
            "w-full text-left rounded-xl border-2 p-4 transition-all",
            declinedInsurance
              ? "border-amber-500 bg-amber-50"
              : "border-slate-200 hover:border-slate-300 bg-white",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className={cn("w-5 h-5", declinedInsurance ? "text-amber-600" : "text-slate-400")} />
              <span className={cn("font-semibold text-sm", declinedInsurance ? "text-amber-800" : "text-slate-600")}>
                Je ne souhaite pas d'assurance
              </span>
            </div>
            <div
              className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                declinedInsurance
                  ? "border-amber-500 bg-amber-500"
                  : "border-slate-300 bg-white",
              )}
            >
              {declinedInsurance && (
                <div className="w-2.5 h-2.5 rounded-full bg-white" />
              )}
            </div>
          </div>
        </button>

        {declinedInsurance && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              Sans assurance, vous serez entierement responsable de tout dommage cause au vehicule.
              La franchise sera a votre charge en cas de sinistre.
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12 font-bold">
          Retour
        </Button>
        <Button
          onClick={onNext}
          className="flex-1 h-12 text-base font-bold"
          size="lg"
          disabled={selectedPlanId === null}
        >
          Suivant
        </Button>
      </div>
    </div>
  );
}
