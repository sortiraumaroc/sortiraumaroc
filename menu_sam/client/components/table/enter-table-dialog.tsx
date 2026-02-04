import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (tableIdentifier: string) => void;
  className?: string;
  title?: string;
  description?: string;
  placeholder?: string;
};

export function EnterTableDialog({
  open,
  onOpenChange,
  onSubmit,
  className,
  title = "Identifiant de table",
  description = "Entrez le numéro de table ou l'identifiant de salle fourni par le restaurant.",
  placeholder = "Ex : 5, A12, Room 203…",
}: Props) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState("");

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Veuillez entrer un identifiant.");
      return;
    }
    setError("");
    onSubmit(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("w-[92vw] max-w-[360px] rounded-3xl p-5", className)}>
        <DialogHeader className="text-left">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="text-sm">{description}</DialogDescription>
        </DialogHeader>

        <div className="mt-5 space-y-3">
          <div>
            <Input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={cn(
                "h-12 rounded-2xl border text-[16px] sm:text-sm",
                error ? "border-red-500 bg-red-50" : "border-border"
              )}
              autoFocus
            />
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>

          <Button
            className="h-12 w-full rounded-2xl bg-sam-red text-primary-foreground hover:bg-sam-red/90"
            onClick={handleSubmit}
            disabled={!value.trim()}
          >
            Confirmer
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Vous pouvez partager cet identifiant avec d'autres clients à votre table pour qu'ils rejoignent votre commande.
        </p>
      </DialogContent>
    </Dialog>
  );
}
