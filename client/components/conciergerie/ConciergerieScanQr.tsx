/**
 * ConciergerieScanQr — Dynamic Conciergerie QR Code component
 *
 * Shows a QR code for a step_request with TOTP rotation (SAM:CONC:v1:...)
 * The concierge/client shows this to the PRO to validate the visit.
 * One-shot: once scanned, the QR becomes invalid.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Timer,
  X,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getScanQrData, generateScanQr } from "@/lib/conciergerie/api";

interface ConciergerieScanQrProps {
  stepRequestId: string;
  size?: number;
  showTimer?: boolean;
  allowFullscreen?: boolean;
  className?: string;
}

export function ConciergerieScanQr({
  stepRequestId,
  size = 240,
  showTimer = true,
  allowFullscreen = true,
  className,
}: ConciergerieScanQrProps) {
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const mountedRef = useRef(true);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (refreshRef.current) clearInterval(refreshRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const fetchQr = useCallback(async () => {
    try {
      const data = await getScanQrData(stepRequestId);
      if (!mountedRef.current) return;

      const url = await QRCode.toDataURL(data.payload, {
        width: size * 2,
        margin: 2,
        color: { dark: "#0d6e6e", light: "#FFFFFF" },
        errorCorrectionLevel: "M",
      });

      if (mountedRef.current) {
        setQrImageUrl(url);
        setSecondsRemaining(data.expiresIn);
        setError(null);
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      const msg = err.message ?? "Erreur";
      if (msg.includes("déjà été utilisé")) {
        setUsed(true);
      } else {
        setError(msg);
      }
    }
  }, [stepRequestId, size]);

  const initQr = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Ensure secret is generated
      await generateScanQr(stepRequestId);
      await fetchQr();
    } catch (err: any) {
      if (mountedRef.current) setError(err.message ?? "Erreur");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [stepRequestId, fetchQr]);

  useEffect(() => {
    void initQr();
  }, [initQr]);

  // Auto-refresh QR every 25s (TOTP period is 30s, refresh a bit early)
  useEffect(() => {
    if (used || error) return;
    if (refreshRef.current) clearInterval(refreshRef.current);
    refreshRef.current = setInterval(() => {
      if (mountedRef.current && !used) void fetchQr();
    }, 25_000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [fetchQr, used, error]);

  // Countdown
  useEffect(() => {
    if (used || error) return;
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          void fetchQr();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [fetchQr, used, error]);

  // --- Fullscreen ---
  if (isFullscreen && qrImageUrl && !used) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white"
        onClick={() => setIsFullscreen(false)}
      >
        <button
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200"
          onClick={() => setIsFullscreen(false)}
        >
          <X className="h-6 w-6" />
        </button>
        <div className="mb-4 flex items-center gap-2 text-teal-700">
          <Briefcase className="h-6 w-6" />
          <span className="text-lg font-bold">Visite Conciergerie</span>
        </div>
        <img
          src={qrImageUrl}
          alt="QR Conciergerie"
          className="rounded-2xl shadow-xl"
          style={{
            width: Math.min(size * 1.5, 400),
            height: Math.min(size * 1.5, 400),
          }}
        />
        {showTimer && (
          <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
            <Timer className="h-4 w-4" />
            <span>Expire dans {secondsRemaining}s</span>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Présentez ce QR code au professionnel
        </p>
      </div>
    );
  }

  // --- Used state ---
  if (used) {
    return (
      <div className={cn("flex flex-col items-center gap-3 p-6", className)}>
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <p className="text-sm font-medium text-emerald-700">
          Ce QR a déjà été utilisé
        </p>
        <p className="text-xs text-slate-500">
          Le scan conciergerie est à usage unique.
        </p>
      </div>
    );
  }

  // --- Loading ---
  if (loading) {
    return (
      <div className={cn("flex flex-col items-center gap-3 p-6", className)}>
        <Loader2 className="h-10 w-10 animate-spin text-teal-500" />
        <p className="text-sm text-slate-500">Génération du QR code...</p>
      </div>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <div className={cn("flex flex-col items-center gap-3 p-6", className)}>
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="text-sm text-red-600">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void initQr()}>
          <RefreshCw className="h-4 w-4 me-2" />
          Réessayer
        </Button>
      </div>
    );
  }

  // --- QR Display ---
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative">
        {qrImageUrl && (
          <img
            src={qrImageUrl}
            alt="QR Conciergerie"
            className="rounded-xl shadow-md"
            style={{ width: size, height: size }}
          />
        )}
        {allowFullscreen && qrImageUrl && (
          <button
            className="absolute top-2 right-2 p-1.5 rounded-full bg-white/80 hover:bg-white shadow-sm"
            onClick={() => setIsFullscreen(true)}
          >
            <Maximize2 className="h-4 w-4 text-slate-600" />
          </button>
        )}
      </div>

      {showTimer && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Timer className="h-4 w-4" />
          <span>Expire dans {secondsRemaining}s</span>
          <div
            className="h-1.5 w-20 bg-slate-200 rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-1000"
              style={{ width: `${(secondsRemaining / 30) * 100}%` }}
            />
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 text-center">
        Présentez ce QR code au professionnel lors de votre visite
      </p>
    </div>
  );
}
