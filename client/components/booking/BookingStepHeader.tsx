import * as React from "react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function BookingStepHeader(props: {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const progress = props.totalSteps > 0 ? Math.min(100, Math.max(0, Math.round((props.step / props.totalSteps) * 100))) : 0;

  return (
    <div className={cn("space-y-3", props.className)}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm shrink-0">
          {props.step}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-primary font-bold tracking-wider" style={{ fontFamily: "Intra, sans-serif" }}>
            {t("booking.step_header.label", { step: props.step, total: props.totalSteps })}
          </p>
          <h2 className="mt-0.5 text-lg md:text-xl font-bold text-foreground">{props.title}</h2>
          {props.subtitle ? <p className="mt-1 text-sm text-slate-600">{props.subtitle}</p> : null}
        </div>
      </div>

      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
