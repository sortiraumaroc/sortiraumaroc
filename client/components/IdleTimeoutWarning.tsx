/**
 * IdleTimeoutWarning — Dialog d'avertissement avant déconnexion automatique.
 *
 * Affiche un countdown de 2 minutes avant la déconnexion pour inactivité.
 * Se ferme automatiquement si l'utilisateur bouge la souris ou clique.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Clock } from "lucide-react";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

export function IdleTimeoutWarning() {
  const { showWarning, remainingSeconds } = useIdleTimeout();

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeDisplay =
    minutes > 0
      ? `${minutes}:${seconds.toString().padStart(2, "0")}`
      : `${seconds}s`;

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-amber-500" />
            Session inactive
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 pt-2">
              <p>
                Votre session sera automatiquement fermée dans{" "}
                <span className="font-bold text-amber-600 tabular-nums">
                  {timeDisplay}
                </span>{" "}
                pour des raisons de sécurité.
              </p>
              <p className="text-sm text-slate-500">
                Cliquez n'importe où ou bougez la souris pour rester connecté.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Rester connecté</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
