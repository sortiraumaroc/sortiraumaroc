import { Check, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RentalOption } from "../../../shared/rentalTypes";

// =============================================================================
// Types
// =============================================================================

interface RentalOptionItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  price_type: string;
  is_mandatory: boolean;
}

interface RentalStep1OptionsProps {
  options: RentalOptionItem[];
  selectedOptions: string[];
  onToggleOption: (id: string) => void;
  onNext: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function RentalStep1Options({
  options,
  selectedOptions,
  onToggleOption,
  onNext,
}: RentalStep1OptionsProps) {
  const sortedOptions = [...options].sort((a, b) => {
    // Mandatory first, then by name
    if (a.is_mandatory && !b.is_mandatory) return -1;
    if (!a.is_mandatory && b.is_mandatory) return 1;
    return a.name.localeCompare(b.name, "fr");
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Settings className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Options supplementaires</h2>
        </div>
        <p className="text-sm text-slate-600">
          Personnalisez votre location avec des options supplementaires.
        </p>
      </div>

      {/* Options list */}
      {sortedOptions.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          Aucune option disponible pour ce vehicule.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedOptions.map((option) => {
            const isSelected = selectedOptions.includes(option.id);
            const isMandatory = option.is_mandatory;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onToggleOption(option.id)}
                disabled={isMandatory}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-4 transition-all",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-slate-200 hover:border-slate-300 bg-white",
                  isMandatory && "cursor-not-allowed opacity-80",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm">
                        {option.name}
                      </span>
                      {isMandatory && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary uppercase tracking-wide">
                          Obligatoire
                        </span>
                      )}
                    </div>
                    {option.description && (
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {option.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="font-bold text-foreground text-sm">
                        {option.price} MAD
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        {option.price_type === "per_day" ? "/ jour" : "fixe"}
                      </span>
                    </div>

                    {/* Checkbox indicator */}
                    <div
                      className={cn(
                        "w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                        isSelected
                          ? "bg-primary border-primary text-white"
                          : "border-slate-300 bg-white",
                      )}
                    >
                      {isSelected && <Check className="w-4 h-4" />}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Next button */}
      <div className="pt-4">
        <Button
          onClick={onNext}
          className="w-full h-12 text-base font-bold"
          size="lg"
        >
          Suivant
        </Button>
      </div>
    </div>
  );
}
