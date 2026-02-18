/**
 * useConsumerQR Hook
 * Manages user personal QR code with TOTP rotation every 30 seconds
 *
 * Usage:
 * const { qrData, loading, error, secondsRemaining, refresh, regenerate } = useConsumerQR();
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchConsumerTOTPSecret,
  fetchConsumerTOTPCode,
  regenerateConsumerTOTPSecret,
  type TOTPSecretResponse,
  type TOTPCodeResponse,
} from "@/lib/consumerTotpApi";
import { generateTOTP, getSecondsUntilNextPeriod } from "@/lib/totp";

// ============================================================================
// Types
// ============================================================================

export interface ConsumerQRData {
  userId: string;
  userName: string | null;
  code: string;
  qrString: string;
  expiresIn: number;
  period: number;
}

export interface UseConsumerQRReturn {
  /** Current QR data (null if loading or error) */
  qrData: ConsumerQRData | null;
  /** TOTP secret info */
  secret: TOTPSecretResponse | null;
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Seconds until QR code changes (0-30) */
  secondsRemaining: number;
  /** Manually refresh the QR code */
  refresh: () => Promise<void>;
  /** Regenerate the secret (use if compromised) */
  regenerate: () => Promise<void>;
  /** Whether currently regenerating */
  regenerating: boolean;
}

// ============================================================================
// Helper: Encode user QR payload
// ============================================================================

function encodeUserQRPayload(userId: string, code: string): string {
  const ts = Math.floor(Date.now() / 1000);
  return `SAM:USER:v1:${userId}:${code}:${ts}`;
}

// ============================================================================
// Hook
// ============================================================================

export function useConsumerQR(): UseConsumerQRReturn {
  const [secret, setSecret] = useState<TOTPSecretResponse | null>(null);
  const [qrData, setQrData] = useState<ConsumerQRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  const [regenerating, setRegenerating] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Cleanup intervals on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Generate QR code from secret (client-side)
  const generateQRFromSecret = useCallback(
    async (secretData: TOTPSecretResponse) => {
      try {
        const code = await generateTOTP({
          secret: secretData.secret,
          algorithm: secretData.algorithm as "SHA1" | "SHA256" | "SHA512",
          digits: secretData.digits,
          period: secretData.period,
        });

        const qrString = encodeUserQRPayload(secretData.userId, code);
        const expiresIn = getSecondsUntilNextPeriod(secretData.period);

        if (mountedRef.current) {
          setQrData({
            userId: secretData.userId,
            userName: secretData.userName,
            code,
            qrString,
            expiresIn,
            period: secretData.period,
          });
          setSecondsRemaining(expiresIn);
        }
      } catch (err) {
        console.error("[useConsumerQR] Error generating QR:", err);
        // Fallback to server-side generation
        try {
          const serverCode = await fetchConsumerTOTPCode();
          if (mountedRef.current && serverCode.ok) {
            setQrData({
              userId: serverCode.userId,
              userName: serverCode.userName,
              code: serverCode.code,
              qrString: serverCode.qrString,
              expiresIn: serverCode.expiresIn,
              period: serverCode.period,
            });
            setSecondsRemaining(serverCode.expiresIn);
          }
        } catch (serverErr) {
          console.error("[useConsumerQR] Server fallback failed:", serverErr);
          if (mountedRef.current) {
            setError("Impossible de générer le QR code");
          }
        }
      }
    },
    []
  );

  // Load secret and generate initial QR
  const loadSecret = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const secretData = await fetchConsumerTOTPSecret();

      if (!mountedRef.current) return;

      if (!secretData.ok) {
        setError("Impossible de charger le QR code");
        return;
      }

      setSecret(secretData);
      await generateQRFromSecret(secretData);
    } catch (err: unknown) {
      console.error("[useConsumerQR] Error loading secret:", err);
      if (mountedRef.current) {
        let message = "Erreur de chargement";
        if (err && typeof err === "object" && "status" in err) {
          const apiErr = err as { status: number; message: string };
          if (apiErr.status === 401) {
            message = "Session expirée. Veuillez vous reconnecter.";
          } else if (apiErr.status === 404) {
            message = "Profil utilisateur introuvable. Veuillez compléter votre inscription.";
          } else if (apiErr.status === 403) {
            message = "Compte non actif. Contactez le support.";
          } else if (apiErr.status === 0) {
            message = "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.";
          } else {
            message = apiErr.message || `Erreur serveur (${apiErr.status})`;
          }
        } else if (err instanceof Error) {
          message = err.message;
        }
        setError(message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [generateQRFromSecret]);

  // Regenerate secret (if compromised)
  const regenerate = useCallback(async () => {
    try {
      setRegenerating(true);
      setError(null);

      const newSecret = await regenerateConsumerTOTPSecret();

      if (!mountedRef.current) return;

      if (!newSecret.ok) {
        setError("Impossible de régénérer le QR code");
        return;
      }

      // Update secret with new data
      const secretData: TOTPSecretResponse = {
        ok: true,
        userId: secret?.userId ?? newSecret.userId ?? "",
        userName: secret?.userName ?? null,
        secret: newSecret.secret,
        algorithm: "SHA1",
        digits: newSecret.digits,
        period: newSecret.period,
        secondsRemaining: getSecondsUntilNextPeriod(newSecret.period),
      };

      setSecret(secretData);
      await generateQRFromSecret(secretData);
    } catch (err) {
      console.error("[useConsumerQR] Error regenerating:", err);
      if (mountedRef.current) {
        const message =
          err instanceof Error ? err.message : "Erreur de régénération";
        setError(message);
      }
    } finally {
      if (mountedRef.current) {
        setRegenerating(false);
      }
    }
  }, [secret, generateQRFromSecret]);

  // Refresh QR manually
  const refresh = useCallback(async () => {
    if (secret) {
      await generateQRFromSecret(secret);
    } else {
      await loadSecret();
    }
  }, [secret, generateQRFromSecret, loadSecret]);

  // Initial load
  useEffect(() => {
    void loadSecret();
  }, [loadSecret]);

  // Auto-refresh QR every period (30 seconds)
  useEffect(() => {
    if (!secret) return;

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up refresh interval
    intervalRef.current = setInterval(() => {
      if (mountedRef.current && secret) {
        void generateQRFromSecret(secret);
      }
    }, secret.period * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [secret, generateQRFromSecret]);

  // Countdown timer (updates every second)
  useEffect(() => {
    if (!secret) return;

    // Clear existing countdown
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }

    // Set up countdown
    countdownRef.current = setInterval(() => {
      if (mountedRef.current) {
        const remaining = getSecondsUntilNextPeriod(secret.period);
        setSecondsRemaining(remaining);

        // Regenerate QR when countdown hits 0
        if (remaining <= 1) {
          void generateQRFromSecret(secret);
        }
      }
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [secret, generateQRFromSecret]);

  return {
    qrData,
    secret,
    loading,
    error,
    secondsRemaining,
    refresh,
    regenerate,
    regenerating,
  };
}
