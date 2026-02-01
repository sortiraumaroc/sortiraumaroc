/**
 * Dynamic QR Code Component
 * Displays a QR code that changes every 30 seconds using TOTP
 *
 * Used for secure check-in at establishments
 */

import { useCallback, useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  QrCode,
  RefreshCw,
  Shield,
  Timer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchTOTPSecret,
  generateDynamicQR,
  getSecondsUntilNextPeriod,
  type DynamicQRData,
  type TOTPSecretResponse,
} from "@/lib/totp";

// ============================================================================
// Types
// ============================================================================

interface DynamicQRCodeProps {
  /** Reservation ID */
  reservationId: string;
  /** Booking reference for display */
  bookingReference?: string;
  /** Establishment name for display */
  establishmentName?: string;
  /** Size of the QR code in pixels */
  size?: number;
  /** Show countdown timer */
  showTimer?: boolean;
  /** Compact mode for embedding */
  compact?: boolean;
  /** Callback when QR code is generated */
  onGenerate?: (data: DynamicQRData) => void;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function DynamicQRCode({
  reservationId,
  bookingReference,
  establishmentName,
  size = 200,
  showTimer = true,
  compact = false,
  onGenerate,
  className,
}: DynamicQRCodeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<TOTPSecretResponse | null>(null);
  const [qrData, setQrData] = useState<DynamicQRData | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(30);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch secret on mount
  const loadSecret = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchTOTPSecret(reservationId);

      if (!result || !result.secret) {
        setError("Impossible de charger le QR code sécurisé");
        return;
      }

      setSecret(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [reservationId]);

  useEffect(() => {
    void loadSecret();
  }, [loadSecret]);

  // Generate QR code when secret is available
  const generateQR = useCallback(async () => {
    if (!secret) return;

    try {
      const data = await generateDynamicQR(
        reservationId,
        secret.secret,
        secret.period
      );

      setQrData(data);
      setSecondsRemaining(data.expiresIn);
      onGenerate?.(data);

      // Generate QR image
      const qrDataUrl = await QRCode.toDataURL(data.qrString, {
        width: size,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        errorCorrectionLevel: "M",
      });

      setQrImageUrl(qrDataUrl);
    } catch (e) {
      console.error("[DynamicQR] Error generating:", e);
      setError("Erreur de génération du QR code");
    }
  }, [secret, reservationId, size, onGenerate]);

  // Initial generation
  useEffect(() => {
    if (secret) {
      void generateQR();
    }
  }, [secret, generateQR]);

  // Countdown timer and auto-refresh
  useEffect(() => {
    if (!secret) return;

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Update every second
    intervalRef.current = setInterval(() => {
      const remaining = getSecondsUntilNextPeriod(secret.period);
      setSecondsRemaining(remaining);

      // Regenerate when period expires
      if (remaining === secret.period || remaining <= 1) {
        void generateQR();
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [secret, generateQR]);

  // Calculate progress for timer ring
  const progress = secret ? (secondsRemaining / secret.period) * 100 : 100;
  const isExpiringSoon = secondsRemaining <= 5;

  // Compact mode
  if (compact) {
    return (
      <div className={cn("relative inline-block", className)}>
        {loading ? (
          <div
            className="flex items-center justify-center bg-slate-100 rounded-lg"
            style={{ width: size, height: size }}
          >
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div
            className="flex flex-col items-center justify-center bg-red-50 rounded-lg p-4"
            style={{ width: size, height: size }}
          >
            <AlertTriangle className="h-8 w-8 text-red-500 mb-2" />
            <span className="text-xs text-red-600 text-center">{error}</span>
          </div>
        ) : qrImageUrl ? (
          <div className="relative">
            <img
              src={qrImageUrl}
              alt="QR Code dynamique"
              width={size}
              height={size}
              className="rounded-lg"
            />
            {showTimer && (
              <div
                className={cn(
                  "absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                  isExpiringSoon
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-primary text-white"
                )}
              >
                {secondsRemaining}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  // Full mode
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <QrCode className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg">QR Code sécurisé</h3>
            <p className="text-sm text-slate-500 truncate">
              {establishmentName || bookingReference || "Réservation"}
            </p>
          </div>
          <div className="flex items-center gap-1 text-emerald-600 text-xs">
            <Shield className="h-4 w-4" />
            <span>Dynamique</span>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-sm text-slate-500">Génération du QR code...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="p-3 bg-red-100 rounded-full mb-4">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <p className="text-sm text-red-600 text-center mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void loadSecret()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </Button>
          </div>
        )}

        {/* QR Code display */}
        {!loading && !error && qrImageUrl && (
          <div className="flex flex-col items-center">
            {/* QR Code with timer ring */}
            <div className="relative mb-4">
              {/* Timer ring */}
              <svg
                className="absolute -inset-3 w-[calc(100%+24px)] h-[calc(100%+24px)]"
                viewBox="0 0 100 100"
              >
                {/* Background ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="48"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="3"
                />
                {/* Progress ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="48"
                  fill="none"
                  stroke={isExpiringSoon ? "#ef4444" : "#3b82f6"}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${progress * 3.01} 301`}
                  transform="rotate(-90 50 50)"
                  className="transition-all duration-1000"
                />
              </svg>

              {/* QR Image */}
              <img
                src={qrImageUrl}
                alt="QR Code dynamique"
                width={size}
                height={size}
                className="rounded-xl shadow-lg relative z-10"
              />

              {/* Refresh indicator when about to expire */}
              {isExpiringSoon && (
                <div className="absolute inset-0 flex items-center justify-center z-20 bg-white/80 rounded-xl">
                  <div className="text-center">
                    <RefreshCw className="h-8 w-8 text-primary animate-spin mx-auto mb-2" />
                    <span className="text-sm font-medium">Actualisation...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Timer display */}
            {showTimer && (
              <div
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-4",
                  isExpiringSoon
                    ? "bg-red-100 text-red-700"
                    : "bg-slate-100 text-slate-700"
                )}
              >
                <Timer className="h-4 w-4" />
                <span>
                  Actualisation dans{" "}
                  <span className="font-bold tabular-nums">{secondsRemaining}</span>s
                </span>
              </div>
            )}

            {/* Security badge */}
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Ce QR code change toutes les 30 secondes pour votre sécurité</span>
            </div>

            {/* Booking reference */}
            {bookingReference && (
              <div className="mt-4 text-center">
                <span className="text-xs text-slate-400">Référence</span>
                <div className="font-mono text-lg font-bold">{bookingReference}</div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Export simple hook for custom implementations
// ============================================================================

export function useDynamicQR(reservationId: string) {
  const [secret, setSecret] = useState<TOTPSecretResponse | null>(null);
  const [qrData, setQrData] = useState<DynamicQRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSecret = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTOTPSecret(reservationId);
      if (!result) {
        setError("Impossible de charger le secret");
        return;
      }
      setSecret(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [reservationId]);

  const regenerate = useCallback(async () => {
    if (!secret) return null;
    const data = await generateDynamicQR(reservationId, secret.secret, secret.period);
    setQrData(data);
    return data;
  }, [secret, reservationId]);

  useEffect(() => {
    void loadSecret();
  }, [loadSecret]);

  useEffect(() => {
    if (secret) {
      void regenerate();
      const interval = setInterval(() => {
        void regenerate();
      }, secret.period * 1000);
      return () => clearInterval(interval);
    }
  }, [secret, regenerate]);

  return {
    secret,
    qrData,
    loading,
    error,
    refresh: loadSecret,
    regenerate,
    secondsRemaining: qrData?.expiresIn ?? 30,
  };
}
