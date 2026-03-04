/**
 * useIdleTimeout — Hook React pour la déconnexion automatique après inactivité.
 *
 * Connecte le timer d'inactivité (idleTimeout.ts) aux fonctions de logout
 * existantes pour Admin, Consumer et Pro.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createIdleTimeout, type IdleTimeoutHandle } from "@/lib/idleTimeout";
import { getActiveSessions } from "@/lib/sessionConflict";
import { clearAuthed } from "@/lib/auth";
import { resetProAuth } from "@/lib/pro/api";
import { adminLogout, clearAdminSessionToken } from "@/lib/adminApi";

export type IdleTimeoutState = {
  showWarning: boolean;
  remainingSeconds: number;
};

export function useIdleTimeout(): IdleTimeoutState {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(120);
  const handleRef = useRef<IdleTimeoutHandle | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  /** Déconnecte toutes les sessions actives puis redirige vers / */
  const performLogout = useCallback(async () => {
    const sessions = await getActiveSessions();
    if (sessions.length === 0) return;

    for (const session of sessions) {
      switch (session.type) {
        case "consumer":
          clearAuthed();
          break;
        case "pro":
          try { await resetProAuth(); } catch { /* ignore */ }
          break;
        case "admin":
          try { await adminLogout(); } catch { /* ignore */ }
          clearAdminSessionToken();
          break;
      }
    }

    window.location.href = "/";
  }, []);

  /** Ferme le warning et reset le timer */
  const dismissWarning = useCallback(() => {
    setShowWarning(false);
    clearCountdown();
    handleRef.current?.reset();
  }, [clearCountdown]);

  useEffect(() => {
    const handle = createIdleTimeout({
      onWarning(remainingMs) {
        // Vérifier qu'il y a une session active avant d'afficher le warning
        void getActiveSessions().then((sessions) => {
          if (sessions.length === 0) return;

          setRemainingSeconds(Math.ceil(remainingMs / 1000));
          setShowWarning(true);

          // Countdown chaque seconde
          countdownRef.current = setInterval(() => {
            setRemainingSeconds((prev) => {
              if (prev <= 1) {
                clearCountdown();
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        });
      },

      onTimeout() {
        setShowWarning(false);
        clearCountdown();
        void performLogout();
      },

      onActivityAfterWarning() {
        // L'utilisateur a bougé/cliqué pendant le warning → annuler
        dismissWarning();
      },
    });

    handleRef.current = handle;
    handle.start();

    return () => {
      handle.stop();
      clearCountdown();
    };
  }, [performLogout, dismissWarning, clearCountdown]);

  return { showWarning, remainingSeconds };
}
