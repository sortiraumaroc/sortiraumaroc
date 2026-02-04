import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GeoFenceState } from "@/hooks/use-geo-fence";
import { MapPin, RefreshCcw, ShieldAlert } from "lucide-react";

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function GeoGate({
  state,
  radiusMeters,
  onRetry,
  className,
}: {
  state: GeoFenceState;
  radiusMeters: number;
  onRetry: () => void;
  className?: string;
}) {
  const title =
    state.status === "requesting"
      ? "Localisation en cours…"
      : "Accès au menu";

  const description = (() => {
    switch (state.status) {
      case "idle":
        return "Nous vérifions votre position pour sécuriser l’accès au menu.";
      case "requesting":
        return "Veuillez autoriser la localisation. Cela garantit que le menu est utilisé sur place.";
      case "denied":
        return "Localisation refusée. Pour afficher le menu, autorisez la localisation dans votre navigateur.";
      case "unsupported":
        return "Votre navigateur ne supporte pas la géolocalisation.";
      case "error":
        return state.message;
      case "ready": {
        if (state.inside) return "Localisation validée.";

        const accuracy = state.coords.accuracy;
        if (accuracy && accuracy > 0) {
          const bestCaseDistance = Math.max(0, state.distanceMeters - accuracy);
          return `Vous êtes à environ ${formatDistance(bestCaseDistance)} du restaurant (précision GPS ±${Math.round(
            accuracy,
          )} m). Le menu est accessible à moins de ${radiusMeters} m.`;
        }

        return `Vous êtes à ${formatDistance(state.distanceMeters)} du restaurant. Le menu est accessible à moins de ${radiusMeters} m.`;
      }
    }
  })();

  return (
    <div
      className={cn(
        "px-4 py-16",
        "min-h-[70vh] flex items-center justify-center",
        className,
      )}
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-background p-5 shadow-lg shadow-black/10">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary">
            {state.status === "ready" && state.inside ? (
              <MapPin className="h-5 w-5 text-primary" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        {(state.status === "denied" ||
          state.status === "unsupported" ||
          state.status === "error" ||
          (state.status === "ready" && !state.inside)) && (
          <Button
            onClick={onRetry}
            className="mt-5 h-11 w-full rounded-2xl"
          >
            <RefreshCcw className="h-4 w-4" />
            Réessayer
          </Button>
        )}

        {state.status === "requesting" && (
          <div className="mt-5">
            <Button
              onClick={onRetry}
              variant="secondary"
              className="h-11 w-full rounded-2xl"
            >
              <RefreshCcw className="h-4 w-4" />
              Relancer la localisation
            </Button>
          </div>
        )}

        {state.status === "ready" && state.inside && (
          <div className="mt-5 rounded-2xl bg-secondary p-3">
            <p className="text-xs font-medium text-muted-foreground">Statut</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              Sur place — accès autorisé
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
