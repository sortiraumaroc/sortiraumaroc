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
import { Textarea } from "@/components/ui/textarea";

type CreateCategoryValues = {
  title: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: CreateCategoryValues) => Promise<void> | void;
};

export function MenuCreateCategoryDialog({ open, onOpenChange, onCreate }: Props) {
  const [title, setTitle] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setTitle("");
      setSaving(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-[460px] rounded-3xl border-white/10 bg-black/90 p-5 text-white">
        <DialogHeader className="text-left">
          <DialogTitle className="text-lg">Créer une catégorie</DialogTitle>
          <DialogDescription className="text-sm text-white/60">
            Exemples : Entrées, Plats, Desserts, Boissons.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          <div>
            <label className="text-xs font-medium text-white/70">Nom</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Plats"
              className="mt-1 h-11 rounded-xl border-white/10 bg-black/30 text-white placeholder:text-white/40"
            />
          </div>
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
            disabled={saving || !title.trim()}
            onClick={async () => {
              if (saving) return;
              const t = title.trim();
              if (!t) return;

              setSaving(true);
              try {
                await Promise.resolve(onCreate({ title: t }));
                onOpenChange(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
