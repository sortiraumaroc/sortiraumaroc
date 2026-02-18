/**
 * CeQrCode — Dynamic CE QR Code component with TOTP rotation
 *
 * Shows a QR code with prefix SAM:CE:v1:{employeeId}:{totpCode}:{timestamp}
 * Rotates every 30 seconds, distinct from the regular user QR code.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";
import {
  AlertTriangle,
  Building2,
  Loader2,
  RefreshCw,
  Shield,
  Timer,
  X,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getConsumerAccessToken } from "@/lib/auth";
import { generateTOTP, getSecondsUntilNextPeriod } from "@/lib/totp";

// ============================================================================
// Types
// ============================================================================

interface CeQrCodeProps {
  /** QR size in pixels */
  size?: number;
  /** Show countdown timer */
  showTimer?: boolean;
  /** Allow fullscreen mode */
  allowFullscreen?: boolean;
  /** Custom class */
  className?: string;
}

interface CeSecretData {
  employeeId: string;
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
}

// ============================================================================
// API Fetch
// ============================================================================

async function fetchCeSecret(): Promise<CeSecretData> {
  const token = await getConsumerAccessToken();
  if (!token) throw new Error("Non authentifié");
  const res = await fetch("/api/ce/qr/secret", {
    headers: { authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Erreur");
  return data.data ?? data;
}

// ============================================================================
// Payload Encoder
// ============================================================================

function encodeCeQrPayload(employeeId: string, code: string): string {
  const ts = Math.floor(Date.now() / 1000);
  return `SAM:CE:v1:${employeeId}:${code}:${ts}`;
}

// ============================================================================
// Component
// ============================================================================

export function CeQrCode({
  size = 240,
  showTimer = true,
  allowFullscreen = true,
  className,
}: CeQrCodeProps) {
  const [secretData, setSecretData] = useState<CeSecretData | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const generateQR = useCallback(async (sd: CeSecretData) => {
    try {
      const code = await generateTOTP({
        secret: sd.secret,
        algorithm: sd.algorithm as "SHA1" | "SHA256" | "SHA512",
        digits: sd.digits,
        period: sd.period,
      });

      const payload = encodeCeQrPayload(sd.employeeId, code);
      const url = await QRCode.toDataURL(payload, {
        width: size * 2,
        margin: 2,
        color: { dark: "#1a365d", light: "#FFFFFF" },
        errorCorrectionLevel: "M",
      });

      if (mountedRef.current) {
        setQrImageUrl(url);
        setSecondsRemaining(getSecondsUntilNextPeriod(sd.period));
      }
    } catch (err) {
      console.error("[CeQrCode] generation error:", err);
      if (mountedRef.current) setError("Impossible de générer le QR code CE");
    }
  }, [size]);

  const loadSecret = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const sd = await fetchCeSecret();
      if (!mountedRef.current) return;
      setSecretData(sd);
      await generateQR(sd);
    } catch (err: any) {
      if (mountedRef.current) setError(err.message ?? "Erreur");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [generateQR]);

  useEffect(() => { void loadSecret(); }, [loadSecret]);

  // Auto-refresh every period
  useEffect(() => {
    if (!secretData) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (mountedRef.current && secretData) void generateQR(secretData);
    }, secretData.period * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [secretData, generateQR]);

  // Countdown
  useEffect(() => {
    if (!secretData) return;
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      const rem = getSecondsUntilNextPeriod(secretData.period);
      setSecondsRemaining(rem);
      if (rem <= 1) void generateQR(secretData);
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [secretData, generateQR]);

  // --- Fullscreen Overlay ---
  if (isFullscreen && qrImageUrl) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white" onClick={() => setIsFullscreen(false)}>
        <button className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200" onClick={() => setIsFullscreen(false)}>
          <X className="h-6 w-6" />
        </button>
        <div className="mb-4 flex items-center gap-2 text-blue-800">
          <Building2 className="h-6 w-6" />
          <span className="text-lg font-bold">Avantage CE</span>
        </div>
        <img src={qrImageUrl} alt="QR CE" className="rounded-2xl shadow-xl" style={{ width: Math.min(size * 1.5, 400), height: Math.min(size * 1.5, 400) }} />
        {showTimer && (
          <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
            <Timer className="h-4 w-4" />
            <span>Expire dans {secondsRemaining}s</span>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">Présentez ce QR code CE au personnel</p>
      </div>
    );
  }

  // --- Main card ---
  return (
    <div className={cn("rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4", className)}>
      {/* Badge header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-blue-100 p-1.5">
            <Building2 className="h-4 w-4 text-blue-700" />
          </div>
          <span className="text-sm font-semibold text-blue-800">Avantage CE</span>
        </div>
        <div className="flex items-center gap-1">
          <Shield className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-xs text-blue-500">Sécurisé</span>
        </div>
      </div>

      {/* QR Display */}
      <div className="flex flex-col items-center">
        {loading ? (
          <div className="flex items-center justify-center" style={{ width: size, height: size }}>
            <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <p className="text-sm text-slate-600">{error}</p>
            <Button variant="outline" size="sm" onClick={loadSecret}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Réessayer
            </Button>
          </div>
        ) : qrImageUrl ? (
          <div className="relative group cursor-pointer" onClick={() => allowFullscreen && setIsFullscreen(true)}>
            <img src={qrImageUrl} alt="QR CE" className="rounded-xl" style={{ width: size, height: size }} />
            {allowFullscreen && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 group-hover:bg-black/10 transition-colors">
                <Maximize2 className="h-6 w-6 text-white opacity-0 group-hover:opacity-70 transition-opacity drop-shadow" />
              </div>
            )}
          </div>
        ) : null}

        {/* Timer */}
        {showTimer && !loading && !error && (
          <div className="mt-3 flex items-center gap-2">
            <div className="relative h-6 w-6">
              <svg className="h-6 w-6 -rotate-90" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="#e2e8f0" strokeWidth="2" />
                <circle
                  cx="12" cy="12" r="10" fill="none" stroke="#3b82f6" strokeWidth="2"
                  strokeDasharray={`${(secondsRemaining / 30) * 62.83} 62.83`}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-blue-600">
                {secondsRemaining}
              </span>
            </div>
            <span className="text-xs text-slate-500">Actualisation auto</span>
          </div>
        )}
      </div>
    </div>
  );
}
