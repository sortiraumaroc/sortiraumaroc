import * as React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  children: React.ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
};

export function HelpTooltip({ label, children, triggerClassName, contentClassName }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "grid h-6 w-6 place-items-center rounded-full border border-white/40 bg-white/5 text-xs font-semibold text-white hover:bg-white/10",
            triggerClassName,
          )}
          aria-label={label}
          title={label}
        >
          ?
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        className={cn(
          "max-w-[280px] rounded-xl border-white/15 bg-black/90 px-3 py-2 text-xs leading-snug text-white/80",
          contentClassName,
        )}
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
