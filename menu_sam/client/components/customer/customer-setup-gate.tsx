import * as React from "react";

import type { CustomerProfile, ServiceType } from "@/hooks/use-customer-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";

export function CustomerSetupGate({
  open,
  initial,
  onComplete,
  className,
}: {
  open: boolean;
  initial: CustomerProfile | null;
  onComplete: (profile: CustomerProfile) => void;
  className?: string;
}) {
  const [step, setStep] = React.useState<"name" | "service">("name");
  const [firstName, setFirstName] = React.useState(initial?.firstName ?? "");
  const [serviceType, setServiceType] = React.useState<ServiceType | "">(
    initial?.serviceType ?? "",
  );
  const [partySize, setPartySize] = React.useState(() => initial?.partySize ?? 1);

  React.useEffect(() => {
    if (!open) return;
    setStep("name");
    setFirstName(initial?.firstName ?? "");
    setServiceType(initial?.serviceType ?? "");
    setPartySize(initial?.partySize ?? 1);
  }, [open, initial?.firstName, initial?.serviceType, initial?.partySize]);

  const normalizedFirstName = firstName.trim();
  const canGoNext = normalizedFirstName.length > 0;
  const canFinish = canGoNext && serviceType !== "";

  const handleNext = React.useCallback(() => {
    if (!canGoNext) return;
    setStep("service");
  }, [canGoNext]);

  const handleNameKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      handleNext();
    },
    [handleNext],
  );

  const handleBack = React.useCallback(() => {
    setStep("name");
  }, []);

  function handleFinish() {
    if (!canFinish) return;

    onComplete({
      firstName: normalizedFirstName,
      serviceType: serviceType as ServiceType,
      partySize: Math.min(20, Math.max(1, Math.trunc(partySize))),
    });
  }

  const handleServiceKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      handleFinish();
    },
    [handleFinish],
  );

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60]",
        "bg-background/70 backdrop-blur-sm",
        "flex items-end sm:items-center justify-center",
        className,
      )}
    >
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-border bg-background p-5 shadow-2xl shadow-black/20">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">Bienvenue</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Quelques infos rapides pour personnaliser votre commande.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold text-muted-foreground">
              Étape {step === "name" ? "1" : "2"}/2
            </p>
            <div className="mt-2 h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full bg-sam-red transition-all",
                  step === "name" ? "w-1/2" : "w-full",
                )}
              />
            </div>
          </div>
        </div>

        <div className="mt-5">
          {step === "name" ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="customer-firstname">Votre prénom</Label>
                <Input
                  id="customer-firstname"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  placeholder="Ex : Yassine"
                  className="h-11 rounded-xl"
                  autoComplete="given-name"
                  inputMode="text"
                  autoFocus
                />
                <p className="text-[11px] leading-[1.1] tracking-tight text-muted-foreground whitespace-nowrap">
                  Ce prénom sert uniquement à identifier votre partie de la commande.
                </p>
              </div>

              <Button
                className="h-12 w-full rounded-2xl"
                onClick={handleNext}
                disabled={!canGoNext}
              >
                Suivant
              </Button>
            </div>
          ) : (
            <div className="space-y-5" onKeyDown={handleServiceKeyDown}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-fit px-0 text-muted-foreground"
                onClick={handleBack}
              >
                Retour
              </Button>

              <div className="space-y-2">
                <Label>Type de commande</Label>
                <RadioGroup
                  value={serviceType}
                  onValueChange={(v) => setServiceType(v as ServiceType)}
                  className="gap-3"
                >
                  <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 p-3">
                    <RadioGroupItem id="service-dinein-gate" value="dineIn" />
                    <Label htmlFor="service-dinein-gate" className="flex-1 cursor-pointer">
                      <span className="block text-sm font-semibold text-foreground">Sur place</span>
                      <span className="block text-xs text-muted-foreground">
                        Je mange au restaurant
                      </span>
                    </Label>
                  </div>

                  <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 p-3">
                    <RadioGroupItem id="service-takeaway-gate" value="takeaway" />
                    <Label htmlFor="service-takeaway-gate" className="flex-1 cursor-pointer">
                      <span className="block text-sm font-semibold text-foreground">À emporter</span>
                      <span className="block text-xs text-muted-foreground">
                        Je prends ma commande à emporter
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Nombre de personnes</Label>
                <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/40 p-3">
                  <button
                    type="button"
                    onClick={() => setPartySize((prev) => Math.max(1, prev - 1))}
                    className="grid h-10 w-10 place-items-center rounded-full bg-background text-foreground shadow-sm shadow-black/5"
                    aria-label="Diminuer le nombre de personnes"
                  >
                    <Minus className="h-4 w-4" />
                  </button>

                  <div className="text-center">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{partySize}</p>
                    <p className="-mt-0.5 text-xs text-muted-foreground">
                      {partySize > 1 ? "personnes" : "personne"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPartySize((prev) => Math.min(20, prev + 1))}
                    className="grid h-10 w-10 place-items-center rounded-full bg-background text-foreground shadow-sm shadow-black/5"
                    aria-label="Augmenter le nombre de personnes"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Vous pourrez modifier ces infos plus tard (depuis le panier).
                </p>
              </div>

              <Button
                className="h-12 w-full rounded-2xl"
                onClick={handleFinish}
                disabled={!canFinish}
              >
                Accéder au menu
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
