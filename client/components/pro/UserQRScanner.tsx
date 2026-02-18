/**
 * UserQRScanner Component
 * Scanner for consumer user QR codes (TOTP-based member identification)
 * Used by Pro establishments to identify and check-in SAM members
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  QrCode,
  RefreshCw,
  ScanLine,
  Shield,
  StopCircle,
  User,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
  Star,
  Calendar,
  Clock,
  AlertCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Establishment, ProRole } from "@/lib/pro/types";

// ============================================================================
// Types
// ============================================================================

interface UserQRScannerProps {
  establishment: Establishment;
  role: ProRole;
}

interface ConsumerUserInfo {
  userId: string;
  userName: string;
  reliabilityLevel: string;
  reliabilityScore: number;
  totalReservations: number;
  noShowCount: number;
  lastActivityAt: string | null;
  memberSince: string;
}

interface ValidationResult {
  ok: boolean;
  valid: boolean;
  reason: string;
  message: string;
  userId?: string;
  userInfo?: ConsumerUserInfo | null;
}

interface ScanHistoryItem {
  id: string;
  userId: string;
  userName: string | null;
  result: "accepted" | "rejected";
  reason: string;
  scannedAt: string;
  reliabilityLevel?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function canScan(role: ProRole): boolean {
  return role === "owner" || role === "manager" || role === "reception";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("fr-MA", { dateStyle: "short", timeStyle: "short" });
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Jamais";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} semaines`;
  if (diffDays < 365) return `Il y a ${Math.floor(diffDays / 30)} mois`;
  return `Il y a ${Math.floor(diffDays / 365)} ans`;
}

function getReliabilityBadge(level: string) {
  const levelLower = level?.toLowerCase() || "";
  if (levelLower === "excellent" || levelLower === "fiable") {
    return { label: "Excellent", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  }
  if (levelLower === "good" || levelLower === "bon") {
    return { label: "Bon", className: "bg-blue-100 text-blue-700 border-blue-200" };
  }
  if (levelLower === "medium" || levelLower === "moyen") {
    return { label: "Moyen", className: "bg-amber-100 text-amber-700 border-amber-200" };
  }
  if (levelLower === "fragile" || levelLower === "faible") {
    return { label: "Fragile", className: "bg-red-100 text-red-700 border-red-200" };
  }
  return { label: level || "Nouveau", className: "bg-slate-100 text-slate-700 border-slate-200" };
}

function formatCameraError(e: unknown): string {
  const isSecure = typeof window !== "undefined" ? window.isSecureContext : true;
  const name = (e as { name?: unknown } | null)?.name;

  const secureHint = !isSecure ? "La caméra nécessite HTTPS." : null;

  if (name === "NotAllowedError" || name === "SecurityError") {
    return secureHint ?? "Accès caméra refusé. Autorisez la caméra dans les paramètres.";
  }
  if (name === "NotFoundError") {
    return "Aucune caméra détectée.";
  }
  if (name === "NotReadableError") {
    return "Caméra indisponible (utilisée ailleurs).";
  }
  if (name === "OverconstrainedError") {
    return "Caméra non compatible.";
  }

  const message = e instanceof Error ? e.message : "";
  if (!isSecure && message) return `${secureHint} ${message}`;
  return message || secureHint || "Impossible d'activer la caméra";
}

// ============================================================================
// Sound Feedback
// ============================================================================

function playSuccessSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);

    setTimeout(() => {
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.frequency.value = 1000;
      osc2.type = "sine";
      gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 0.2);
    }, 150);
  } catch {
    // Audio not supported
  }
}

function playErrorSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 300;
    oscillator.type = "square";
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch {
    // Audio not supported
  }
}

function vibrate(pattern: number | number[]) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

// ============================================================================
// API Functions
// ============================================================================

function isCeQrPayload(payload: string): boolean {
  return payload.startsWith("SAM:CE:v1:");
}

async function validateUserQRCode(
  establishmentId: string,
  qrPayload: string
): Promise<ValidationResult> {
  const response = await fetch("/api/consumer/totp/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      establishmentId,
      qrPayload,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Erreur de validation");
  }

  return response.json();
}

async function validateCeQRCode(
  establishmentId: string,
  qrPayload: string,
): Promise<ValidationResult> {
  const { getConsumerAccessToken } = await import("@/lib/auth");
  const token = await getConsumerAccessToken();
  const response = await fetch("/api/pro/ce/scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      qr_payload: qrPayload,
      establishment_id: establishmentId,
    }),
  });

  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Erreur de validation CE");

  const d = json.data;
  return {
    ok: true,
    valid: d?.valid ?? false,
    reason: d?.refusal_reason ?? (d?.valid ? "CE validé" : "CE refusé"),
    message: d?.valid
      ? `Avantage CE : ${d.advantage?.description || d.advantage?.type || "Validé"} — ${d.employee_name || "Salarié"} (${d.company_name || "Entreprise"})`
      : d?.refusal_reason || "Scan CE refusé",
    userId: undefined,
    userInfo: null,
  };
}

async function fetchUserInfo(userId: string): Promise<ConsumerUserInfo | null> {
  try {
    const response = await fetch(`/api/consumer/totp/user-info/${userId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.ok ? data : null;
  } catch {
    return null;
  }
}

// ============================================================================
// User Info Card Component
// ============================================================================

function UserInfoCard({ userInfo, onClose }: { userInfo: ConsumerUserInfo; onClose: () => void }) {
  const reliability = getReliabilityBadge(userInfo.reliabilityLevel);

  return (
    <Card className="border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <User className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-lg">{userInfo.userName}</h3>
              <Badge className={cn("mt-1", reliability.className)}>
                <Star className="h-3 w-3 me-1" />
                {reliability.label}
              </Badge>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <XCircle className="h-5 w-5" />
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-lg p-3 border">
            <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
              <Calendar className="h-3.5 w-3.5" />
              Réservations
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {userInfo.totalReservations}
            </div>
          </div>

          <div className="bg-white rounded-lg p-3 border">
            <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
              <AlertCircle className="h-3.5 w-3.5" />
              No-shows
            </div>
            <div className={cn(
              "text-2xl font-bold",
              userInfo.noShowCount > 0 ? "text-red-600" : "text-emerald-600"
            )}>
              {userInfo.noShowCount}
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-slate-500 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Dernier passage
            </span>
            <span className="font-medium">
              {formatRelativeTime(userInfo.lastActivityAt)}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-slate-500 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Membre depuis
            </span>
            <span className="font-medium">
              {formatRelativeTime(userInfo.memberSince)}
            </span>
          </div>
        </div>

        {/* Verified badge */}
        <div className="flex items-center gap-2 p-3 bg-emerald-100 rounded-lg text-emerald-700 text-sm">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">Membre vérifié Sortir Au Maroc</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Scan Result Overlay
// ============================================================================

function ScanResultOverlay({
  result,
  userInfo,
  onDismiss,
}: {
  result: ValidationResult | null;
  userInfo: ConsumerUserInfo | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (result && !userInfo) {
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [result, userInfo, onDismiss]);

  if (!result) return null;

  const isValid = result.valid;

  // If valid and we have user info, show the user card instead
  if (isValid && userInfo) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="w-full max-w-md animate-in zoom-in-95 duration-200">
          <UserInfoCard userInfo={userInfo} onClose={onDismiss} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-pointer"
      style={{ backgroundColor: isValid ? "rgb(16, 185, 129)" : "rgb(239, 68, 68)" }}
      onClick={onDismiss}
    >
      <div className="text-center text-white animate-in zoom-in-95 duration-200">
        <div className="flex justify-center mb-6">
          {isValid ? (
            <CheckCircle2 className="h-32 w-32 drop-shadow-lg" strokeWidth={1.5} />
          ) : (
            <XCircle className="h-32 w-32 drop-shadow-lg" strokeWidth={1.5} />
          )}
        </div>
        <div className="text-5xl font-black mb-4 drop-shadow-lg">
          {isValid ? "VALIDE" : "INVALIDE"}
        </div>
        <div className="text-xl opacity-90 mb-6">{result.message}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function UserQRScanner({ establishment, role }: UserQRScannerProps) {
  const [code, setCode] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [continuousMode, setContinuousMode] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<ValidationResult | null>(null);
  const [lastUserInfo, setLastUserInfo] = useState<ConsumerUserInfo | null>(null);
  const [showResultOverlay, setShowResultOverlay] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  // Load scan history from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`user_scan_history_${establishment.id}`);
    if (stored) {
      try {
        setScanHistory(JSON.parse(stored));
      } catch {
        // Ignore
      }
    }
  }, [establishment.id]);

  // Save scan history to localStorage
  const addToHistory = (item: ScanHistoryItem) => {
    setScanHistory((prev) => {
      const updated = [item, ...prev].slice(0, 50); // Keep last 50
      localStorage.setItem(`user_scan_history_${establishment.id}`, JSON.stringify(updated));
      return updated;
    });
  };

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }

    const v = videoRef.current;
    if (v) v.srcObject = null;

    setScanning(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const submit = async (rawCode: string, keepScanning = false) => {
    if (!canScan(role)) return;

    const trimmed = rawCode.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);

    try {
      // Route CE QR codes to the CE scan endpoint
      const result = isCeQrPayload(trimmed)
        ? await validateCeQRCode(establishment.id, trimmed)
        : await validateUserQRCode(establishment.id, trimmed);

      setLastResult(result);
      setShowResultOverlay(true);

      // If valid, fetch full user info (not applicable for CE scans)
      let userInfo: ConsumerUserInfo | null = null;
      if (result.valid && result.userId) {
        userInfo = await fetchUserInfo(result.userId);
        setLastUserInfo(userInfo);
      } else {
        setLastUserInfo(null);
      }

      // Add to history
      addToHistory({
        id: `${Date.now()}`,
        userId: result.userId || "unknown",
        userName: userInfo?.userName || null,
        result: result.valid ? "accepted" : "rejected",
        reason: result.reason,
        scannedAt: new Date().toISOString(),
        reliabilityLevel: userInfo?.reliabilityLevel,
      });

      if (soundEnabled) {
        if (result.valid) {
          playSuccessSound();
          vibrate(200);
        } else {
          playErrorSound();
          vibrate([100, 50, 100]);
        }
      }

      // Auto-restart camera in continuous mode (if rejected or after viewing user info)
      if (keepScanning && continuousMode && !result.valid) {
        setTimeout(() => {
          setShowResultOverlay(false);
          void startCamera();
        }, 2000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      if (soundEnabled) {
        playErrorSound();
        vibrate([100, 50, 100, 50, 100]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Caméra non disponible");
      return;
    }

    if (scanning) return;

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err) {
        const name = (err as { name?: unknown } | null)?.name;
        const shouldRetry = name === "OverconstrainedError" || name === "NotFoundError";
        if (!shouldRetry) throw err;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;
      setScanning(true);

      const v = videoRef.current;
      if (!v) throw new Error("Video element missing");

      v.srcObject = stream;

      const ensureReady = async () => {
        if (v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) return;
        await new Promise<void>((resolve) => {
          const done = () => {
            v.removeEventListener("loadedmetadata", done);
            v.removeEventListener("canplay", done);
            resolve();
          };
          v.addEventListener("loadedmetadata", done);
          v.addEventListener("canplay", done);
        });
      };

      await v.play();
      await ensureReady();

      const DetectorCtor = (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
      const detector = typeof DetectorCtor === "function" ? new (DetectorCtor as any)({ formats: ["qr_code"] }) : null;

      let jsQR: any = null;
      if (!detector) {
        const mod = await import("jsqr");
        jsQR = mod.default;
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (!detector && (!jsQR || !ctx)) {
        throw new Error("Scanner non supporté");
      }

      const loop = async () => {
        if (!streamRef.current || !videoRef.current) return;

        try {
          if (detector) {
            const codes = await detector.detect(videoRef.current);
            const rawValue = codes?.[0]?.rawValue;
            if (rawValue) {
              stopCamera();
              setCode(rawValue);
              await submit(rawValue, true);
              return;
            }
          } else if (jsQR && ctx) {
            const vw = videoRef.current.videoWidth;
            const vh = videoRef.current.videoHeight;
            if (vw > 0 && vh > 0) {
              const maxW = 520;
              const scale = Math.min(1, maxW / vw);
              const w = Math.max(1, Math.round(vw * scale));
              const h = Math.max(1, Math.round(vh * scale));

              if (canvas.width !== w) canvas.width = w;
              if (canvas.height !== h) canvas.height = h;

              ctx.drawImage(videoRef.current, 0, 0, w, h);
              const imageData = ctx.getImageData(0, 0, w, h);
              const res = jsQR(imageData.data, w, h);
              const rawValue = res?.data;
              if (rawValue) {
                stopCamera();
                setCode(rawValue);
                await submit(rawValue, true);
                return;
              }
            }
          }
        } catch {
          // Ignore scan errors
        }

        rafRef.current = requestAnimationFrame(() => {
          void loop();
        });
      };

      rafRef.current = requestAnimationFrame(() => {
        void loop();
      });
    } catch (e) {
      stopCamera();
      setCameraError(formatCameraError(e));
    }
  };

  // Auto-start camera on mount for mobile experience
  useEffect(() => {
    if (canScan(role) && !scanning && !cameraError) {
      const timer = setTimeout(() => {
        void startCamera();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismissOverlay = () => {
    setShowResultOverlay(false);
    setLastUserInfo(null);
    if (continuousMode) {
      void startCamera();
    }
  };

  const todayScans = scanHistory.filter((s) => {
    const d = new Date(s.scannedAt);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });

  return (
    <div className="space-y-4">
      {/* Result overlay */}
      <ScanResultOverlay
        result={showResultOverlay ? lastResult : null}
        userInfo={lastUserInfo}
        onDismiss={handleDismissOverlay}
      />

      {/* Main Scanner Card */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[#a3001d]/10 rounded-lg">
                <User className="h-5 w-5 text-[#a3001d]" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Scanner Membre</h2>
                <p className="text-xs text-slate-500">Identification client SAM</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="h-9 w-9"
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-slate-400" />}
              </Button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl">
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-900">{todayScans.length}</div>
              <div className="text-xs text-slate-500">Scans aujourd'hui</div>
            </div>
            <div className="text-center border-s border-slate-200">
              <div className="text-2xl font-bold text-emerald-600">
                {todayScans.filter((s) => s.result === "accepted").length}
              </div>
              <div className="text-xs text-slate-500">Validés</div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-4">
          {/* Error messages */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {cameraError && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <CameraOff className="h-4 w-4 flex-shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}

          {!canScan(role) && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>Votre rôle ne permet pas de scanner.</span>
            </div>
          )}

          {/* Camera Preview */}
          <div className="relative aspect-square max-h-[60vh] w-full bg-black rounded-2xl overflow-hidden">
            <video
              ref={videoRef}
              className={cn("absolute inset-0 w-full h-full object-cover", scanning ? "block" : "hidden")}
              muted
              playsInline
            />

            {/* Scan overlay when camera is active */}
            {scanning && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30" />

                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-64 h-64 relative">
                    <div className="absolute top-0 start-0 w-12 h-12 border-t-4 border-s-4 border-[#a3001d] rounded-tl-xl" />
                    <div className="absolute top-0 end-0 w-12 h-12 border-t-4 border-e-4 border-[#a3001d] rounded-tr-xl" />
                    <div className="absolute bottom-0 start-0 w-12 h-12 border-b-4 border-s-4 border-[#a3001d] rounded-bl-xl" />
                    <div className="absolute bottom-0 end-0 w-12 h-12 border-b-4 border-e-4 border-[#a3001d] rounded-br-xl" />

                    <div className="absolute left-4 right-4 h-1 bg-gradient-to-r from-transparent via-[#a3001d] to-transparent animate-pulse top-1/2 -translate-y-1/2 rounded-full" />
                  </div>
                </div>

                <div className="absolute bottom-6 left-0 right-0 text-center">
                  <div className="inline-flex items-center gap-2 bg-black/70 text-white text-sm px-4 py-2 rounded-full backdrop-blur-sm">
                    <User className="h-4 w-4" />
                    Scannez la carte membre SAM
                  </div>
                </div>
              </div>
            )}

            {/* Placeholder when camera is off */}
            {!scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white">
                <Camera className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">Caméra inactive</p>
                <p className="text-sm opacity-70 mb-6">Appuyez pour activer le scanner</p>
                <Button
                  onClick={() => void startCamera()}
                  disabled={!canScan(role) || submitting}
                  size="lg"
                  className="gap-2 bg-[#a3001d] hover:bg-[#8a0019]"
                >
                  <Camera className="h-5 w-5" />
                  Activer la caméra
                </Button>
              </div>
            )}
          </div>

          {/* Camera controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="continuous-mode-user"
                  checked={continuousMode}
                  onCheckedChange={(v) => setContinuousMode(v === true)}
                />
                <Label htmlFor="continuous-mode-user" className="text-sm flex items-center gap-1.5 cursor-pointer">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  Continu
                </Label>
              </div>
            </div>

            {scanning ? (
              <Button variant="destructive" size="sm" onClick={stopCamera} className="gap-2">
                <StopCircle className="h-4 w-4" />
                Arrêter
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void startCamera()}
                disabled={!canScan(role)}
                className="gap-2"
              >
                <Camera className="h-4 w-4" />
                Scanner
              </Button>
            )}
          </div>

          {/* Manual input toggle */}
          <button
            type="button"
            onClick={() => setShowManualInput(!showManualInput)}
            className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <span>Saisie manuelle du code</span>
            {showManualInput ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {/* Manual input form */}
          {showManualInput && (
            <div className="space-y-3 p-4 bg-slate-50 rounded-lg animate-in slide-in-from-top-2 duration-200">
              <div>
                <Label className="text-xs">Code QR (format: SAM:USER:v1:... ou SAM:CE:v1:...)</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Collez le contenu du QR code..."
                  className="mt-1"
                />
              </div>
              <Button
                onClick={() => submit(code)}
                disabled={!canScan(role) || submitting || !code.trim()}
                className="w-full gap-2 bg-[#a3001d] hover:bg-[#8a0019]"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                Valider
              </Button>
            </div>
          )}

          {/* Last result (compact) */}
          {lastResult && !showResultOverlay && (
            <div
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg cursor-pointer",
                lastResult.valid ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"
              )}
              onClick={() => {
                if (lastResult.valid && lastUserInfo) {
                  setShowResultOverlay(true);
                }
              }}
            >
              {lastResult.valid ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-600 flex-shrink-0" />
              ) : (
                <XCircle className="h-8 w-8 text-red-600 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">
                  {lastResult.valid ? "Membre vérifié" : "Invalide"}
                </div>
                <div className="text-xs text-slate-600 truncate">{lastResult.message}</div>
              </div>
              {lastUserInfo && (
                <Badge className={getReliabilityBadge(lastUserInfo.reliabilityLevel).className}>
                  {lastUserInfo.reliabilityLevel}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History Section */}
      <Card>
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between p-4 text-start hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <History className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h3 className="font-semibold">Historique</h3>
              <p className="text-xs text-slate-500">{scanHistory.length} scans</p>
            </div>
          </div>
          {showHistory ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
        </button>

        {showHistory && (
          <CardContent className="pt-0 space-y-2 animate-in slide-in-from-top-2 duration-200">
            {scanHistory.length > 0 ? (
              scanHistory.slice(0, 20).map((item) => {
                const isAccepted = item.result === "accepted";
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border",
                      isAccepted ? "bg-emerald-50/50 border-emerald-100" : "bg-red-50/50 border-red-100"
                    )}
                  >
                    {isAccepted ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{item.userName || "Utilisateur"}</span>
                        {item.reliabilityLevel && (
                          <Badge className={cn("text-xs", getReliabilityBadge(item.reliabilityLevel).className)}>
                            {item.reliabilityLevel}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{formatDate(item.scannedAt)}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8">
                <History className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Aucun scan effectué</p>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
