import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (tableNumber: number) => Promise<void> | void;
};

export function TableCreateDialog({ open, onOpenChange, onCreate }: Props) {
  const [rawNumber, setRawNumber] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setRawNumber("");
      setSaving(false);
    }
  }, [open]);

  const parsedNumber = React.useMemo(() => {
    const n = Number.parseInt(rawNumber.trim(), 10);
    if (!Number.isFinite(n)) return null;
    const t = Math.trunc(n);
    if (t <= 0) return null;
    return t;
  }, [rawNumber]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-[420px] rounded-3xl border-white/10 bg-black/90 p-5 text-white">
        <DialogHeader className="text-left">
          <DialogTitle className="text-lg">Créer une table</DialogTitle>
          <DialogDescription className="text-sm text-white/60">
            Saisissez le numéro de table (ex : 14).
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <label className="text-xs font-medium text-white/70">Numéro</label>
          <Input
            value={rawNumber}
            onChange={(e) => setRawNumber(e.target.value)}
            placeholder="Ex : 14"
            inputMode="numeric"
            className="mt-1 h-11 rounded-xl border-white/10 bg-black/30 text-white placeholder:text-white/40"
          />
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-11 rounded-2xl"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button
            type="button"
            className="h-11 rounded-2xl bg-sam-red text-white hover:bg-sam-red/90"
            disabled={saving || parsedNumber === null}
            onClick={async () => {
              if (saving) return;
              if (parsedNumber === null) return;

              setSaving(true);
              try {
                await Promise.resolve(onCreate(parsedNumber));
                onOpenChange(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
