import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS } from "./wizardConstants";

type Props = {
  currentStep: number; // 1-7
  completedSteps: number[]; // array of completed step numbers
};

const STEP_LABELS = [
  "Identité",
  "Localisation",
  "Coordonnées",
  "Descriptions",
  "Médias",
  "Horaires",
  "Tags & extras",
] as const;

const TOTAL_STEPS = STEP_LABELS.length;

const OPTIONAL_STEPS = new Set([6, 7]);

export function WizardProgressBar({ currentStep, completedSteps }: Props) {
  const progressPercent = ((currentStep - 1) / (TOTAL_STEPS - 1)) * 100;

  return (
    <div className="w-full select-none">
      {/* ---- Thin top progress bar ---- */}
      <div className="relative h-[3px] w-full bg-gray-200 overflow-hidden rounded-full">
        <div
          className="absolute inset-y-0 start-0 bg-[#a3001d] transition-all duration-500 ease-in-out rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* ---- Step indicators ---- */}
      <nav aria-label="Wizard progress" className="mt-5 px-2 sm:px-4">
        <ol className="flex items-start justify-between">
          {STEP_LABELS.map((label, idx) => {
            const stepNum = idx + 1;
            const isCompleted = completedSteps.includes(stepNum);
            const isCurrent = currentStep === stepNum;
            const isFuture = !isCompleted && !isCurrent;
            const isOptional = OPTIONAL_STEPS.has(stepNum);

            return (
              <li
                key={stepNum}
                className="relative flex flex-1 flex-col items-center"
              >
                {/* Connector line (skip for the first step) */}
                {idx > 0 && (
                  <div
                    className={cn(
                      "absolute top-3.5 end-1/2 -translate-y-1/2 h-[2px] w-full -z-10 transition-colors duration-300",
                      completedSteps.includes(stepNum) ||
                        (isCurrent && completedSteps.includes(stepNum - 1))
                        ? "bg-[#a3001d]"
                        : "bg-gray-200",
                    )}
                  />
                )}

                {/* Step circle */}
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
                    isFuture &&
                      "border-gray-300 bg-white text-gray-400",
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : (
                    <span>{stepNum}</span>
                  )}
                </button>

                {/* Label (hidden on mobile) */}
                <span
                  className={cn(
                    "mt-1.5 hidden text-[11px] leading-tight text-center sm:block transition-colors duration-300 max-w-[72px]",
                    isCompleted && "text-[#a3001d] font-medium",
                    isCurrent && "text-[#a3001d] font-semibold",
                    isFuture && "text-gray-400",
                  )}
                >
                  {label}
                </span>

                {/* Optional badge */}
                {isOptional && (
                  <span className="mt-0.5 hidden text-[9px] leading-none text-gray-400 italic sm:block">
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
