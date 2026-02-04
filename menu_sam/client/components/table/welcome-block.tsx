import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";

type Props = {
  onViewMenu: () => void;
  className?: string;
};

export const WelcomeBlock = React.memo(function WelcomeBlockComponent(
  { onViewMenu, className }: Props,
) {
  return (
    <section className={cn("px-4 pt-5", className)} aria-label="Bienvenue">
      <div className="w-full rounded-3xl bg-sam-gray-50 p-4 sm:p-5 lg:p-6">
        <p className="text-lg font-semibold text-foreground">Bienvenue 👋</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Commandez en quelques clics. Simple, rapide et pensé pour le mobile.
        </p>

        <Button
          type="button"
          onClick={onViewMenu}
          className={cn(
            "relative mt-4 h-12 w-full rounded-2xl bg-sam-red text-primary-foreground",
            "text-[15px] font-semibold",
          )}
        >
          <span className="absolute left-6 top-1/2 -translate-y-1/2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-foreground/15">
              <Menu className="h-4 w-4" />
            </span>
          </span>
          <span className="mx-auto">Accéder au menu</span>
        </Button>
      </div>
    </section>
  );
});
