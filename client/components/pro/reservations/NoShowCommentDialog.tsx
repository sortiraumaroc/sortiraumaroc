import * as React from "react";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function NoShowCommentDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: (args: { comment: string | null }) => Promise<void>;
}) {
  const { open, onOpenChange, title, description, confirmLabel, loading, onConfirm } = props;

  const [comment, setComment] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setComment("");
    setSubmitting(false);
  }, [open]);

  const submit = async () => {
    if (submitting || loading) return;
    const value = comment.trim();
    setSubmitting(true);
    try {
      await onConfirm({ comment: value ? value : null });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? "Déclarer un no-show"}</DialogTitle>
          <DialogDescription>
            {description ?? "La réservation est dépassée de plus de 3 heures. Vous pouvez ajouter un commentaire (optionnel)."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Commentaire (optionnel)</Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex: client injoignable, table gardée 30min…" disabled={submitting || !!loading} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Retour
          </Button>
          <Button onClick={() => void submit()} disabled={submitting || !!loading} className="gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {confirmLabel ?? "Valider no-show"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
