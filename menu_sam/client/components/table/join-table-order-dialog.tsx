import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  tableNumber: number;
  onJoin: () => void;
  onCreateNew: () => void;
  onOpenChange: (open: boolean) => void;
  className?: string;
};

export function JoinTableOrderDialog({
  open,
  tableNumber,
  onJoin,
  onCreateNew,
  onOpenChange,
  className,
}: Props) {
  return (
    <Dialog open={open}>
      <DialogContent className={cn("w-[92vw] max-w-[360px] rounded-3xl p-5", className)}>
        <DialogHeader className="text-left">
          <DialogTitle className="text-lg">Rejoindre la commande de table ?</DialogTitle>
          <DialogDescription className="text-sm">
            Une commande est déjà en cours pour la table <span className="font-semibold">{tableNumber}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5 space-y-3">
          <Button
            className="h-12 w-full rounded-2xl bg-sam-red text-primary-foreground hover:bg-sam-red/90"
            onClick={onJoin}
          >
            Oui, je rejoins
          </Button>
          <Button
            variant="secondary"
            className="h-12 w-full rounded-2xl"
            onClick={onCreateNew}
          >
            Non, nouvelle commande
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Astuce : en rejoignant, chaque plat sera marqué avec votre prénom et le restaurant recevra une seule commande groupée.
        </p>
      </DialogContent>
    </Dialog>
  );
}
