import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/browser-actions";
import { cn } from "@/lib/utils";
import { AlertTriangle, Copy, Wifi } from "lucide-react";
import { toast } from "sonner";
import type { EstablishmentData } from "@/hooks/use-establishment-by-slug";

type Props = {
  className?: string;
  establishment?: EstablishmentData | null;
};

// Fallback WiFi credentials when no establishment data
const WIFI_SSID = "LPBKECH";
const WIFI_PASSWORD = "2025@2026";

async function copyValue(value: string) {
  const ok = await copyToClipboard(value);
  if (ok) {
    toast.success("Copié");
  } else {
    toast.message("Copie impossible — sélectionnez et copiez manuellement.");
  }
}

export const InfoPratique = React.memo(function InfoPratiqueComponent(
  { className, establishment }: Props,
) {
  // Use establishment WiFi data if available, otherwise use fallback
  const wifiNetwork = establishment?.nomReseauWifi || WIFI_SSID;
  const wifiPassword = establishment?.codeWifi || WIFI_PASSWORD;
  const hasWifi = establishment?.nomReseauWifi || establishment?.codeWifi;

  return (
    <section
      className={cn("px-4 pt-4", className)}
      aria-label="Informations pratiques"
    >
      <div className="w-full rounded-3xl bg-sam-gray-50 p-3 sm:p-4 lg:p-5">
        <p className="text-[13px] font-semibold text-foreground">Informations pratiques</p>

        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1">
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-10 w-full justify-between rounded-2xl bg-white px-4",
                    "hover:bg-white/90",
                  )}
                >
                  <span className="flex items-center gap-2 text-[13px] font-semibold">
                    <AlertTriangle className="h-4 w-4 text-sam-red" />
                    Allergènes
                  </span>
                  <span className="text-xs text-muted-foreground">Voir</span>
                </Button>
              </DialogTrigger>

              <DialogContent
                className={cn(
                  "w-[90vw] max-w-[380px]",
                  "rounded-2xl border border-sam-red/40",
                  "gap-3 p-4",
                )}
              >
                <DialogHeader className="space-y-0">
                  <DialogTitle className="text-base">Allergènes</DialogTitle>
                  <DialogDescription className="text-sm">
                    Certains plats peuvent contenir des allergènes
                    <br />
                    (gluten, œufs, lait, fruits à coque, etc.).
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <p className="text-sm text-foreground">
                    Pour votre sécurité, signalez toute allergie au personnel avant de commander.
                  </p>
                  <div className="rounded-xl border border-border bg-sam-gray-50 p-3">
                    <p className="text-xs font-medium text-foreground">Astuce</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Utilisez le bouton "Serveur" pour demander un conseil rapidement.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {hasWifi && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-10 w-10 rounded-2xl bg-white px-0",
                    "hover:bg-white/90",
                  )}
                  aria-label="Wi‑Fi"
                  title="Wi‑Fi"
                >
                  <Wifi className="h-4 w-4 text-sam-red" />
                </Button>
              </DialogTrigger>

              <DialogContent
                className={cn(
                  "w-[90vw] max-w-[340px]",
                  "rounded-2xl border border-sam-red/40",
                  "gap-3 p-4",
                )}
              >
                <DialogHeader className="space-y-0">
                  <DialogTitle className="text-base">Wi‑Fi</DialogTitle>
                </DialogHeader>

                <div className="mt-2">
                  <div className="space-y-2">
                    <div
                      className={cn(
                        "rounded-2xl border border-border p-2.5",
                        "bg-white",
                      )}
                    >
                      {establishment?.nomReseauWifi && (
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-muted-foreground">Réseau</p>
                            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                              {wifiNetwork}
                            </p>
                          </div>
                        </div>
                      )}

                      {establishment?.codeWifi && (
                        <div className={establishment?.nomReseauWifi ? "mt-2.5" : ""}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium text-muted-foreground">Code Wi‑Fi</p>
                              <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                                {wifiPassword}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-8 w-8 rounded-full px-0"
                              onClick={() => void copyValue(wifiPassword)}
                              aria-label="Copier le code Wi‑Fi"
                              title="Copier"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </section>
  );
});
