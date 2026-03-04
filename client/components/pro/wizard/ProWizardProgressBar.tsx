import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRO_WIZARD_STEPS, TOTAL_PRO_WIZARD_STEPS } from "./proWizardConstants";

type Props = {
  currentStep: number;
  completedSteps: number[];
};

const OPTIONAL_STEPS = new Set(
  PRO_WIZARD_STEPS.filter((s) => !s.required).map((s) => s.id),
);

export function ProWizardProgressBar({ currentStep, completedSteps }: Props) {
  const progressPercent =
    ((currentStep - 1) / (TOTAL_PRO_WIZARD_STEPS - 1)) * 100;

  return (
    <div className="w-full select-none">
      {/* Thin top progress bar */}
      <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="absolute inset-y-0 start-0 rounded-full bg-[#a3001d] transition-all duration-500 ease-in-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Step indicators */}
      <nav aria-label="Progression du wizard" className="mt-5 px-2 sm:px-4">
        <ol className="flex items-start justify-between">
          {PRO_WIZARD_STEPS.map((step, idx) => {
            const isCompleted = completedSteps.includes(step.id);
            const isCurrent = currentStep === step.id;
            const isFuture = !isCompleted && !isCurrent;
            const isOptional = OPTIONAL_STEPS.has(step.id);

            return (
              <li
                key={step.id}
                className="relative flex flex-1 flex-col items-center"
              >
                {idx > 0 && (
                  <div
                    className={cn(
                      "-z-10 absolute top-3.5 end-1/2 h-[2px] w-full -translate-y-1/2 transition-colors duration-300",
                      completedSteps.includes(step.id) ||
                        (isCurrent &&
                          completedSteps.includes(
                            PRO_WIZARD_STEPS[idx - 1].id,
                          ))
                        ? "bg-[#a3001d]"
                        : "bg-gray-200",
                    )}
                  />
                )}

                <button
                  type="button"
                  tabIndex={-1}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-300",
                    isCompleted &&
                      "border-[#a3001d] bg-[#a3001d] text-white",
                    isCurrent &&
                      "border-[#a3001d] bg-white text-[#a3001d] ring-4 ring-[#a3001d]/15",
                    isFuture && "border-gray-300 bg-white text-gray-400",
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : (
                    <span>{step.id}</span>
                  )}
                </button>

                <span
                  className={cn(
                    "mt-1.5 hidden max-w-[72px] text-center text-[11px] leading-tight transition-colors duration-300 sm:block",
                    isCompleted && "font-medium text-[#a3001d]",
                    isCurrent && "font-semibold text-[#a3001d]",
                    isFuture && "text-gray-400",
                  )}
                >
                  {step.label}
                </span>

                {isOptional && (
                  <span className="mt-0.5 hidden text-[9px] italic leading-none text-gray-400 sm:block">
                    optionnel
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
