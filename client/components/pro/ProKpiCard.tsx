import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const kpiVariants = cva("overflow-hidden", {
  variants: {
    tone: {
      emerald: "",
      rose: "",
      amber: "",
      sky: "",
      violet: "",
      slate: "",
    },
  },
  defaultVariants: {
    tone: "slate",
  },
});

const toneStyles: Record<NonNullable<VariantProps<typeof kpiVariants>["tone"]>, { panel: string; iconWrap: string; icon: string }> = {
  emerald: {
    panel: "bg-emerald-50",
    iconWrap: "bg-emerald-100",
    icon: "text-emerald-700",
  },
  rose: {
    panel: "bg-rose-50",
    iconWrap: "bg-rose-100",
    icon: "text-rose-700",
  },
  amber: {
    panel: "bg-amber-50",
    iconWrap: "bg-amber-100",
    icon: "text-amber-700",
  },
  sky: {
    panel: "bg-sky-50",
    iconWrap: "bg-sky-100",
    icon: "text-sky-700",
  },
  violet: {
    panel: "bg-violet-50",
    iconWrap: "bg-violet-100",
    icon: "text-violet-700",
  },
  slate: {
    panel: "bg-slate-50",
    iconWrap: "bg-slate-100",
    icon: "text-slate-700",
  },
};

export type ProKpiCardProps = {
  title: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: NonNullable<VariantProps<typeof kpiVariants>["tone"]>;
  meta?: React.ReactNode;
  metaPosition?: "inline" | "below";
  footnote?: string;
  valueClassName?: string;
  className?: string;
};

export function ProKpiCard({
  title,
  value,
  icon: Icon,
  tone = "slate",
  meta,
  metaPosition = "inline",
  footnote,
  valueClassName,
  className,
}: ProKpiCardProps) {
  const styles = toneStyles[tone];

  return (
    <Card className={cn(kpiVariants({ tone }), "h-full", className)}>
      <div className="flex h-full min-h-[92px]">
        <div className={cn("flex w-16 shrink-0 items-center justify-center sm:w-20", styles.panel)}>
          <div className={cn("flex size-10 items-center justify-center rounded-full", styles.iconWrap)}>
            <Icon className={cn("size-5", styles.icon)} />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-4">
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <div
                className={cn(
                  "min-w-0 whitespace-nowrap text-[1.4rem] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums sm:text-[1.75rem] md:text-3xl",
                  valueClassName,
                )}
              >
                {value}
              </div>
              {meta && metaPosition === "inline" ? <div className="shrink-0">{meta}</div> : null}
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-600">{title}</div>
            {meta && metaPosition === "below" ? <div className="mt-2">{meta}</div> : null}
          </div>

          {footnote ? <div className="mt-2 text-xs text-slate-500">{footnote}</div> : null}
        </div>
      </div>
    </Card>
  );
}
