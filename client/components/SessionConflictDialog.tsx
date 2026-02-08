/**
 * SessionConflictDialog
 *
 * Dialog shown when user tries to login to a different account type
 * while already logged into another one.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LogOut, ArrowRight } from "lucide-react";
import {
  ActiveSession,
  AccountType,
  getAccountTypeLabel,
  getAccountTypeRedirect,
  clearOtherSessions,
} from "@/lib/sessionConflict";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSession: ActiveSession;
  targetType: AccountType;
  onProceed: () => void;
};

export function SessionConflictDialog({
  open,
  onOpenChange,
  currentSession,
  targetType,
  onProceed,
}: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const currentLabel = getAccountTypeLabel(currentSession.type);
  const targetLabel = getAccountTypeLabel(targetType);
  const currentRedirect = getAccountTypeRedirect(currentSession.type);

  const handleStay = () => {
    onOpenChange(false);
    navigate(currentRedirect);
  };

  const handleSwitch = async () => {
    setLoading(true);
    try {
      await clearOtherSessions(targetType);
      onProceed();
    } finally {
      setLoading(false);
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg border-2 border-primary">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl text-left">
            Session active détectée
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-center space-y-2 pt-2">
              <p className="text-foreground">
                Vous êtes actuellement connecté à votre{" "}
                <span className="font-semibold">{currentLabel}</span>
                {currentSession.email && (
                  <span className="text-muted-foreground">
                    {" "}({currentSession.email})
                  </span>
                )}.
              </p>
              <p className="text-foreground">
                Pour accéder à votre{" "}
                <span className="font-semibold">{targetLabel}</span>, vous devez d'abord vous déconnecter.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2 mt-4 sm:justify-center">
          <AlertDialogCancel
            onClick={handleStay}
            className="flex items-center gap-2 border-primary text-primary hover:bg-primary/10"
          >
            <ArrowRight className="h-4 w-4" />
            Rester sur {currentLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSwitch}
            disabled={loading}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90"
          >
            <LogOut className="h-4 w-4" />
            {loading ? "Déconnexion..." : "Me déconnecter"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
