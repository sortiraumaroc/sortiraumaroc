import type { ReactNode } from "react";

import { HelpCircle } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AdminPageHeader(props: {
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 lg:flex-1 lg:pe-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold text-slate-900">{props.title}</h1>
          {props.description ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors"
                    aria-label="Plus d'informations"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-sm">{props.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
      </div>

      {props.actions ? (
        <div className="w-full lg:w-auto">
          <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:max-w-[620px]">
            {props.actions}
          </div>
        </div>
      ) : null}
    </div>
  );
}
