/**
 * ProfileQRCode Component
 * Displays a user's personal QR code with TOTP rotation every 30 seconds
 *
 * Features:
 * - Dynamic QR code that changes every 30 seconds
 * - Visual countdown timer with ring animation
 * - Fullscreen mode for easy scanning
 * - Option to regenerate secret if compromised
 */

import { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import {
  AlertTriangle,
  CheckCircle2,
  Expand,
  Loader2,
  Maximize2,
  QrCode,
  RefreshCw,
  Shield,
  Timer,
  X,
  Smartphone,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useConsumerQR } from "@/hooks/useConsumerQR";

// ============================================================================
// Types
// ============================================================================

interface ProfileQRCodeProps {
  /** Size of the QR code in pixels */
  size?: number;
  /** Show countdown timer */
  showTimer?: boolean;
  /** Enable fullscreen mode button */
  allowFullscreen?: boolean;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ProfileQRCode({
  size = 240,
  showTimer = true,
  allowFullscreen = true,
  className,
}: ProfileQRCodeProps) {
  const {
    qrData,
    loading,
    error,
    secondsRemaining,
    refresh,
    regenerate,
    regenerating,
  } = useConsumerQR();

  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  // Generate QR image when data changes
  const generateQRImage = useCallback(async () => {
    if (!qrData?.qrString) {
      setQrImageUrl(null);
      return;
    }

    setImageLoading(true);
    try {
      const qrDataUrl = await QRCode.toDataURL(qrData.qrString, {
        width: size * 2, // 2x for retina
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        errorCorrectionLevel: "M",
      });
      setQrImageUrl(qrDataUrl);
    } catch (e) {
      console.error("[ProfileQRCode] Error generating QR image:", e);
    } finally {
      setImageLoading(false);
    }
  }, [qrData?.qrString, size]);

  useEffect(() => {
    void generateQRImage();
  }, [generateQRImage]);

  // Calculate progress for timer ring
  const period = qrData?.period ?? 30;
  const progress = (secondsRemaining / period) * 100;
  const isExpiringSoon = secondsRemaining <= 5;

  // Handle regenerate confirmation
  const handleRegenerate = async () => {
    await regenerate();
  };

  // Fullscreen mode
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6">
        {/* Close button */}
        <button
          onClick={() => setIsFullscreen(false)}
          className="absolute top-4 end-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          <X className="h-6 w-6" />
        </button>

        {/* User name */}
        {qrData?.userName && (
          <h2 className="text-2xl font-bold mb-4 text-center">
            {qrData.userName}
          </h2>
        )}

        {/* QR Code */}
        {qrImageUrl && (
          <div className="relative mb-6">
            {/* Timer ring - larger in fullscreen */}
            <svg
              className="absolute -inset-4 w-[calc(100%+32px)] h-[calc(100%+32px)]"
              viewBox="0 0 100 100"
            >
              <circle
                cx="50"
                cy="50"
                r="48"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="2"
              />
              <circle
                cx="50"
                cy="50"
                r="48"
                fill="none"
                stroke={isExpiringSoon ? "#ef4444" : "#a3001d"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={`${progress * 3.01} 301`}
                transform="rotate(-90 50 50)"
                className="transition-all duration-1000"
              />
            </svg>

            <img
              src={qrImageUrl}
              alt="Mon QR Code"
              className="w-72 h-72 rounded-2xl shadow-xl relative z-10"
            />

            {/* Refresh overlay */}
            {isExpiringSoon && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-white/80 rounded-2xl">
                <RefreshCw className="h-12 w-12 text-[#a3001d] animate-spin" />
              </div>
            )}
          </div>
        )}

        {/* Timer */}
        <div
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-full text-lg font-medium",
            isExpiringSoon
              ? "bg-red-100 text-red-700"
              : "bg-slate-100 text-slate-700"
          )}
        >
          <Timer className="h-5 w-5" />
          <span>
            <span className="font-bold tabular-nums text-2xl">
              {secondsRemaining}
            </span>
            s
          </span>
        </div>

        {/* Instructions */}
        <p className="text-slate-500 text-sm mt-8 text-center max-w-xs">
          Présentez ce QR code au personnel de l'établissement pour vous
          identifier
        </p>
      </div>
    );
  }

  // Normal mode
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#a3001d]/10 rounded-lg">
              <QrCode className="h-5 w-5 text-[#a3001d]" />
            </div>
            <div>
              <CardTitle className="text-lg">Mon QR Code</CardTitle>
              <p className="text-sm text-slate-500">
                Carte membre Sortir Au Maroc
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-emerald-600 text-xs">
            <Shield className="h-4 w-4" />
            <span>Sécurisé</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {/* Loading state */}
        {(loading || imageLoading) && !qrImageUrl && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-[#a3001d] mb-4" />
            <p className="text-sm text-slate-500">Génération du QR code...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-8">
            {/* Authentication error - show friendly message */}
            {(error.toLowerCase().includes("auth") ||
              error.toLowerCase().includes("401") ||
              error.toLowerCase().includes("non connecté") ||
              error.toLowerCase().includes("not authenticated")) ? (
              <>
                <div className="p-4 bg-amber-50 rounded-full mb-4">
                  <Smartphone className="h-10 w-10 text-amber-600" />
                </div>
                <h3 className="font-semibold text-lg text-slate-800 mb-2">
                  Connexion requise
                </h3>
                <p className="text-sm text-slate-600 text-center mb-4 max-w-xs">
                  Connectez-vous à votre compte Sortir Au Maroc pour accéder à votre QR code personnel.
                </p>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => window.location.href = "/profile"}
                  className="gap-2 bg-[#a3001d] hover:bg-[#8a0019]"
                >
                  Se connecter
                </Button>
              </>
            ) : (
              /* Generic error */
              <>
                <div className="p-3 bg-red-100 rounded-full mb-4">
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                </div>
                <p className="text-sm text-red-600 text-center mb-4">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refresh()}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Réessayer
                </Button>
              </>
            )}
          </div>
        )}

        {/* QR Code display */}
        {!loading && !error && qrImageUrl && (
          <div className="flex flex-col items-center">
            {/* User name */}
            {qrData?.userName && (
              <p className="font-semibold text-lg mb-4">{qrData.userName}</p>
            )}

            {/* QR Code with timer ring */}
            <div className="relative mb-4">
              {/* Timer ring */}
              <svg
                className="absolute -inset-3 w-[calc(100%+24px)] h-[calc(100%+24px)]"
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="48"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="3"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="48"
                  fill="none"
                  stroke={isExpiringSoon ? "#ef4444" : "#a3001d"}
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
                alt="Mon QR Code"
                width={size}
                height={size}
                className="rounded-xl shadow-lg relative z-10"
              />

              {/* Refresh indicator */}
              {isExpiringSoon && (
                <div className="absolute inset-0 flex items-center justify-center z-20 bg-white/80 rounded-xl">
                  <div className="text-center">
                    <RefreshCw className="h-8 w-8 text-[#a3001d] animate-spin mx-auto mb-2" />
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
                  <span className="font-bold tabular-nums">
                    {secondsRemaining}
                  </span>
                  s
                </span>
              </div>
            )}

            {/* Security badge */}
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg mb-4">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>
                Ce QR code change toutes les 30 secondes pour votre sécurité
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 w-full">
              {allowFullscreen && (
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => setIsFullscreen(true)}
                >
                  <Maximize2 className="h-4 w-4" />
                  Plein écran
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-slate-400 hover:text-slate-600"
                    disabled={regenerating}
                  >
                    {regenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Régénérer le QR code ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action va créer un nouveau QR code et invalider
                      l'ancien. Utilisez cette option uniquement si vous pensez
                      que votre QR code a été compromis.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRegenerate}
                      className="bg-[#a3001d] hover:bg-[#8a0019]"
                    >
                      Régénérer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Compact version for embedding
// ============================================================================

export function ProfileQRCodeCompact({
  size = 150,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const { qrData, loading, error, secondsRemaining } = useConsumerQR();
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!qrData?.qrString) {
      setQrImageUrl(null);
      return;
    }

    QRCode.toDataURL(qrData.qrString, {
      width: size * 2,
      margin: 1,
      color: { dark: "#000000", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    })
      .then(setQrImageUrl)
      .catch(console.error);
  }, [qrData?.qrString, size]);

  const period = qrData?.period ?? 30;
  const isExpiringSoon = secondsRemaining <= 5;

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-slate-100 rounded-lg",
          className
        )}
        style={{ width: size, height: size }}
      >
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !qrImageUrl) {
    const isAuthError =
      error &&
      (error.toLowerCase().includes("auth") ||
        error.toLowerCase().includes("401") ||
        error.toLowerCase().includes("non connecté") ||
        error.toLowerCase().includes("not authenticated"));

    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg",
          isAuthError ? "bg-amber-50" : "bg-red-50",
          className
        )}
        style={{ width: size, height: size }}
      >
        {isAuthError ? (
          <Smartphone className="h-6 w-6 text-amber-500" />
        ) : (
          <AlertTriangle className="h-6 w-6 text-red-400" />
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative inline-block", className)}>
      <img
        src={qrImageUrl}
        alt="Mon QR Code"
        width={size}
        height={size}
        className="rounded-lg"
      />
      <div
        className={cn(
          "absolute -top-1 -end-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
          isExpiringSoon
            ? "bg-red-500 text-white animate-pulse"
            : "bg-[#a3001d] text-white"
        )}
      >
        {secondsRemaining}
      </div>
    </div>
  );
}
