import * as React from "react";

import { cn } from "@/lib/utils";

export function EstablishmentSectionHeading(props: {
  title: string;
  subtitle?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", props.className)}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex items-center gap-3">
          <span aria-hidden className="h-6 w-1.5 shrink-0 rounded-full bg-primary" />
          <h2 className="min-w-0 truncate text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
            {props.title}
          </h2>
        </div>
      </div>
      {props.subtitle ? <p className="text-sm text-slate-600">{props.subtitle}</p> : null}
      <div aria-hidden className="h-px w-full bg-slate-200" />
    </div>
  );
}
