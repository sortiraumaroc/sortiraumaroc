import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CreditCard, Hand } from "lucide-react";

type ServiceActionId = "server" | "bill";

type ServiceAction = {
  id: ServiceActionId;
  label: string;
  icon: React.ReactNode;
};

const ACTIONS: ServiceAction[] = [
  { id: "server", label: "Serveur", icon: <Hand className="h-5 w-5" /> },
  { id: "bill", label: "Addition", icon: <CreditCard className="h-5 w-5" /> },
];

type Props = {
  onAction: (id: ServiceActionId) => void;
  className?: string;
};

export const TableServices = React.memo(function TableServicesComponent(
  { onAction, className }: Props,
) {
  return (
    <section className={cn("px-4 pt-5", className)} aria-label="Services à table">
      <div className="w-full">
        <p className="text-sm font-semibold text-foreground">Services à table</p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {ACTIONS.map((action) => (
            <Button
              key={action.id}
              type="button"
              variant="outline"
              onClick={() => onAction(action.id)}
              className={cn(
                "h-14 justify-start gap-3 rounded-2xl px-4",
                "border-border bg-white text-foreground",
                "hover:bg-sam-gray-50",
                "active:scale-[0.99] active:bg-sam-gray-50",
              )}
            >
              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-sam-red/10 text-sam-red ring-1 ring-sam-red/15">
                {action.icon}
              </span>
              <span className="text-[13px] font-semibold">{action.label}</span>
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
});
