import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ClientRiskGuardDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
  score: number;
  onRequestGuarantee: () => Promise<void>;
}) {
  const { open, onOpenChange, loading, score, onRequestGuarantee } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Garantie requise</DialogTitle>
          <DialogDescription>
            Score client actuel : <span className="font-semibold">{score}/100</span>.<br />
            En raison d’un historique de réservations non honorées, une garantie est nécessaire pour confirmer le créneau.
            Merci pour votre compréhension.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!!loading}>
            Fermer
          </Button>
          <Button
            className="gap-2"
            onClick={() => void onRequestGuarantee()}
            disabled={!!loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Demander une garantie
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
