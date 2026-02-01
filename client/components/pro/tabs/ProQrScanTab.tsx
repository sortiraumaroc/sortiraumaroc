import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  History,
  Loader2,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  StopCircle,
  TrendingUp,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { listProQrScanLogs, listProReservations, scanProQrCode, seedFakeReservations } from "@/lib/pro/api";
import { downloadQrScanLogsCsv, downloadQrScanLogsPdf } from "@/lib/pro/qrScansExport";
import { formatLocalYmd } from "@/lib/pro/reservationsExport";
import { generateReservationPDF } from "@/lib/pdfGenerator";
import { getBookingQRCodeUrl } from "@/lib/qrcode";
import type { Establishment, ProRole, Reservation } from "@/lib/pro/types";
import { isReservationInPast } from "@/components/pro/reservations/reservationHelpers";

import { formatHeureHhHMM, formatTimeHmLabel } from "@shared/datetime";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

type QrScanLogRow = {
  id: string;
  reservation_id: string | null;
  booking_reference: string | null;
  payload: string;
  scanned_by_user_id: string | null;
  scanned_at: string;
  holder_name: string | null;
  result: string;
};

type ScanResultPayload = {
  ok: true;
  result: "accepted" | "rejected";
  reason: string;
  message: string;
  log_id: string;
  reservation?: {
    id: string;
    booking_reference?: string | null;
    starts_at?: string | null;
    status?: string | null;
    payment_status?: string | null;
    amount_deposit?: number | null;
    checked_in_at?: string | null;
  } | null;
};

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

function resultBadge(result: string) {
  if (result === "accepted") return { label: "Accepté", cls: "bg-emerald-500 text-white" };
  if (result === "rejected") return { label: "Refusé", cls: "bg-red-500 text-white" };
  return { label: result, cls: "bg-slate-500 text-white" };
}

// Translation map for rejection reasons
const REASON_TRANSLATIONS: Record<string, string> = {
  ok: "Valide",
  already_used: "Déjà utilisé",
  already_checked_in: "Déjà enregistré",
  unpaid: "Non payé",
  not_confirmed: "Non confirmé",
  cancelled: "Annulée",
  expired: "Expirée",
  not_found: "Introuvable",
  invalid_code: "Code invalide",
  wrong_establishment: "Mauvais établissement",
  too_early: "Trop tôt",
  too_late: "Trop tard",
  no_show: "No-show",
};

function translateReason(reason: string | null): string {
  if (!reason) return "—";
  const key = reason.toLowerCase().trim();
  return REASON_TRANSLATIONS[key] || reason;
}

function parseLocalYmd(ymd: string): { year: number; month: number; day: number } | null {
  const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { year, month, day };
}

function localStartOfDay(ymd: string): Date | null {
  const parsed = parseLocalYmd(ymd);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0);
}

function localEndOfDay(ymd: string): Date | null {
  const parsed = parseLocalYmd(ymd);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day, 23, 59, 59, 999);
}

function isWithinLocalRange(iso: string, startYmd: string, endYmd: string): boolean {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;

  const start = startYmd.trim() ? localStartOfDay(startYmd) : null;
  const end = endYmd.trim() ? localEndOfDay(endYmd) : null;

  const t = d.getTime();
  if (start && t < start.getTime()) return false;
  if (end && t > end.getTime()) return false;
  return true;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function demoScanLogs(): QrScanLogRow[] {
  const now = Date.now();
  const mk = (idx: number, args: { holder_name: string; result: string; reason: string; booking_reference?: string; reservation_id?: string }) => {
    const scannedAt = new Date(now - idx * 36 * 60 * 1000).toISOString();
    const bookingRef = args.booking_reference ?? `SAM-${String(1000 + idx)}`;

    return {
      id: `demo-${idx}`,
      reservation_id: args.reservation_id ?? null,
      booking_reference: bookingRef,
      payload: JSON.stringify({ code: bookingRef, reason: args.reason }),
      scanned_by_user_id: null,
      scanned_at: scannedAt,
      holder_name: args.holder_name,
      result: args.result,
    };
  };

  return [
    mk(1, { holder_name: "Youssef El Amrani", result: "accepted", reason: "ok" }),
    mk(2, { holder_name: "Fatima Zahra El Idrissi", result: "rejected", reason: "already_used" }),
    mk(3, { holder_name: "Ahmed Al Fassi", result: "accepted", reason: "ok" }),
    mk(4, { holder_name: "Khadija Benali", result: "rejected", reason: "unpaid" }),
    mk(5, { holder_name: "Omar Berrada", result: "rejected", reason: "not_confirmed" }),
    mk(6, { holder_name: "Salma Aït Lahcen", result: "accepted", reason: "ok" }),
  ];
}

function extractReason(payload: string): string | null {
  const raw = String(payload ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const reason = (parsed as { reason?: unknown } | null)?.reason;
      return typeof reason === "string" && reason.trim() ? reason.trim() : null;
    } catch {
      return null;
    }
  }
  return null;
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
// Stats
// ============================================================================

type ScanStats = {
  totalToday: number;
  acceptedToday: number;
  rejectedToday: number;
  acceptanceRate: number;
};

function calculateStats(logs: QrScanLogRow[]): ScanStats {
  const todayLogs = logs.filter((l) => isToday(l.scanned_at));
  const accepted = todayLogs.filter((l) => l.result === "accepted");
  const rejected = todayLogs.filter((l) => l.result === "rejected");

  return {
    totalToday: todayLogs.length,
    acceptedToday: accepted.length,
    rejectedToday: rejected.length,
    acceptanceRate: todayLogs.length > 0 ? (accepted.length / todayLogs.length) * 100 : 0,
  };
}

// ============================================================================
// Mobile Stats Bar
// ============================================================================

function MobileStatsBar(props: { stats: ScanStats }) {
  const { stats } = props;

  return (
    <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl">
      <div className="text-center">
        <div className="text-2xl font-bold text-slate-900">{stats.totalToday}</div>
        <div className="text-xs text-slate-500">Scans</div>
      </div>
      <div className="text-center border-x border-slate-200">
        <div className="text-2xl font-bold text-emerald-600">{stats.acceptedToday}</div>
        <div className="text-xs text-slate-500">Acceptés</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-red-600">{stats.rejectedToday}</div>
        <div className="text-xs text-slate-500">Refusés</div>
      </div>
    </div>
  );
}

// ============================================================================
// Scan Result Overlay (Full Screen for Mobile)
// ============================================================================

function ScanResultOverlay(props: { result: ScanResultPayload | null; onDismiss: () => void }) {
  const { result, onDismiss } = props;

  useEffect(() => {
    if (result) {
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [result, onDismiss]);

  if (!result) return null;

  const isAccepted = result.result === "accepted";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-pointer"
      style={{ backgroundColor: isAccepted ? "rgb(16, 185, 129)" : "rgb(239, 68, 68)" }}
      onClick={onDismiss}
    >
      <div className="text-center text-white animate-in zoom-in-95 duration-200">
        <div className="flex justify-center mb-6">
          {isAccepted ? (
            <CheckCircle2 className="h-32 w-32 drop-shadow-lg" strokeWidth={1.5} />
          ) : (
            <XCircle className="h-32 w-32 drop-shadow-lg" strokeWidth={1.5} />
          )}
        </div>
        <div className="text-5xl font-black mb-4 drop-shadow-lg">{isAccepted ? "ACCEPTÉ" : "REFUSÉ"}</div>
        <div className="text-xl opacity-90 mb-6">{result.message}</div>
        {result.reservation?.booking_reference ? (
          <div className="text-lg opacity-80 font-mono bg-white/20 inline-block px-4 py-2 rounded-full">
            {result.reservation.booking_reference}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ProQrScanTab({ establishment, role }: Props) {
  const [code, setCode] = useState("");
  const [holderName, setHolderName] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);

  const [logs, setLogs] = useState<QrScanLogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [showAll, setShowAll] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<"all" | "accepted" | "rejected">("all");
  const [range, setRange] = useState(() => {
    const today = formatLocalYmd(new Date());
    return { start: today, end: today };
  });

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [continuousMode, setContinuousMode] = useState(true);

  const baseLogs = useMemo(() => (logs.length ? logs : demoScanLogs()), [logs]);

  const visibleLogs = useMemo(() => {
    let filtered = baseLogs;

    if (!showAll) {
      const start = range.start.trim();
      const end = range.end.trim();
      filtered = filtered.filter((l) => isWithinLocalRange(l.scanned_at || l.id, start, end));
    }

    if (resultFilter !== "all") {
      filtered = filtered.filter((l) => l.result === resultFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((l) => {
        const ref = (l.booking_reference || "").toLowerCase();
        const holder = (l.holder_name || "").toLowerCase();
        const reason = (extractReason(l.payload) || "").toLowerCase();
        return ref.includes(q) || holder.includes(q) || reason.includes(q);
      });
    }

    return filtered;
  }, [baseLogs, range.end, range.start, showAll, searchQuery, resultFilter]);

  const stats = useMemo(() => calculateStats(baseLogs), [baseLogs]);

  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResultPayload | null>(null);
  const [showResultOverlay, setShowResultOverlay] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [demoPdfLoading, setDemoPdfLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const loadLogs = async () => {
    setLoadingLogs(true);
    setError(null);
    try {
      const res = await listProQrScanLogs(establishment.id);
      setLogs((res.logs ?? []) as QrScanLogRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, [establishment.id]);

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
      const res = (await scanProQrCode({
        establishmentId: establishment.id,
        code: trimmed,
        holder_name: holderName.trim() ? holderName.trim() : null,
      })) as ScanResultPayload;

      setLastResult(res);
      setShowResultOverlay(true);

      if (soundEnabled) {
        if (res.result === "accepted") {
          playSuccessSound();
          vibrate(200);
        } else {
          playErrorSound();
          vibrate([100, 50, 100]);
        }
      }

      await loadLogs();

      if (keepScanning && continuousMode) {
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

  const downloadDemoPdf = async () => {
    setDemoPdfLoading(true);
    setError(null);

    try {
      let res = await listProReservations(establishment.id);
      let reservations = (res.reservations ?? []) as Reservation[];

      if (!reservations.length) {
        await seedFakeReservations({ establishmentId: establishment.id, countPerStatus: 1 });
        res = await listProReservations(establishment.id);
        reservations = (res.reservations ?? []) as Reservation[];
      }

      const nowMs = Date.now();
      const nonPast = reservations.filter((x) => !isReservationInPast(x, nowMs));
      const pool = nonPast.length ? nonPast : reservations;
      const r = pool.find((x) => x.booking_reference) ?? pool[0];
      if (!r) throw new Error("Aucune réservation disponible");

      const bookingReference = r.booking_reference ?? r.id;
      const qrCodeUrl = getBookingQRCodeUrl(bookingReference, {
        partySize: r.party_size ?? undefined,
      });

      const startsAt = new Date(r.starts_at);
      const validStart = Number.isFinite(startsAt.getTime());
      const dateIso = validStart ? startsAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const timeLabel = validStart ? formatHeureHhHMM(startsAt) : formatTimeHmLabel("20:00");

      const depositTotalCents =
        typeof r.amount_deposit === "number" && Number.isFinite(r.amount_deposit) ? Math.round(r.amount_deposit) : 0;
      const depositTotalMad = depositTotalCents / 100;

      const party = typeof r.party_size === "number" && Number.isFinite(r.party_size) && r.party_size > 0 ? r.party_size : 2;

      await generateReservationPDF({
        bookingReference,
        restaurantName: establishment.name ?? "Établissement",
        address: establishment.address ?? ([establishment.city, establishment.country].filter(Boolean).join(", ") || "—"),
        phone: establishment.phone ?? "—",
        date: dateIso,
        time: timeLabel,
        service: "Service",
        partySize: party,
        guestName: "Client Démo",
        guestPhone: "+212 6 00 00 00 00",
        reservationMode: depositTotalCents > 0 ? "guaranteed" : "non-guaranteed",
        qrCodeUrl,
        unitPrepayMad: depositTotalCents > 0 ? depositTotalMad / party : undefined,
        totalPrepayMad: depositTotalCents > 0 ? depositTotalMad : undefined,
        message: "PDF démo pour tester le scan QR.",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDemoPdfLoading(false);
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
      // Small delay to ensure component is mounted
      const timer = setTimeout(() => {
        void startCamera();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Result overlay */}
      <ScanResultOverlay result={showResultOverlay ? lastResult : null} onDismiss={() => setShowResultOverlay(false)} />

      {/* Main Scanner Card - Mobile First Design */}
      <Card className="overflow-hidden">
        {/* Header with stats */}
        <CardHeader className="pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <QrCode className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Scanner QR</h2>
                <p className="text-xs text-slate-500">Validation des réservations</p>
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void loadLogs()}
                disabled={loadingLogs}
                className="h-9 w-9"
              >
                <RefreshCw className={cn("h-4 w-4", loadingLogs && "animate-spin")} />
              </Button>
            </div>
          </div>

          {/* Stats Bar */}
          {!loadingLogs && <MobileStatsBar stats={stats} />}
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

          {/* Camera Preview - Main Focus */}
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
                {/* Dark corners */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30" />

                {/* Scan frame */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-64 h-64 relative">
                    {/* Corner brackets */}
                    <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-white rounded-tl-xl" />
                    <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-white rounded-tr-xl" />
                    <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-white rounded-bl-xl" />
                    <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-white rounded-br-xl" />

                    {/* Animated scan line */}
                    <div className="absolute left-4 right-4 h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse top-1/2 -translate-y-1/2 rounded-full" />
                  </div>
                </div>

                {/* Bottom instruction */}
                <div className="absolute bottom-6 left-0 right-0 text-center">
                  <div className="inline-flex items-center gap-2 bg-black/70 text-white text-sm px-4 py-2 rounded-full backdrop-blur-sm">
                    <ScanLine className="h-4 w-4" />
                    Placez le QR code dans le cadre
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
                  className="gap-2"
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
                  id="continuous-mode"
                  checked={continuousMode}
                  onCheckedChange={(v) => setContinuousMode(v === true)}
                />
                <Label htmlFor="continuous-mode" className="text-sm flex items-center gap-1.5 cursor-pointer">
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
              <Button variant="outline" size="sm" onClick={() => void startCamera()} disabled={!canScan(role)} className="gap-2">
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
                <Label className="text-xs">Code QR</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Collez ou saisissez le code..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Nom du porteur (optionnel)</Label>
                <Input
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  placeholder="Ex: Ahmed B."
                  className="mt-1"
                />
              </div>
              <Button
                onClick={() => submit(code)}
                disabled={!canScan(role) || submitting || !code.trim()}
                className="w-full gap-2"
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
                "flex items-center gap-3 p-3 rounded-lg",
                lastResult.result === "accepted" ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"
              )}
            >
              {lastResult.result === "accepted" ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-600 flex-shrink-0" />
              ) : (
                <XCircle className="h-8 w-8 text-red-600 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">
                  {lastResult.result === "accepted" ? "Accepté" : "Refusé"}
                </div>
                <div className="text-xs text-slate-600 truncate">{lastResult.message}</div>
              </div>
              {lastResult.reservation?.booking_reference && (
                <div className="text-xs font-mono bg-white/50 px-2 py-1 rounded">
                  {lastResult.reservation.booking_reference}
                </div>
              )}
            </div>
          )}

          {/* PDF Demo button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void downloadDemoPdf()}
            disabled={demoPdfLoading}
            className="w-full gap-2"
          >
            {demoPdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Télécharger un PDF démo
          </Button>
        </CardContent>
      </Card>

      {/* History Section - Collapsible */}
      <Card>
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <History className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h3 className="font-semibold">Historique</h3>
              <p className="text-xs text-slate-500">{visibleLogs.length} scans</p>
            </div>
          </div>
          {showHistory ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
        </button>

        {showHistory && (
          <CardContent className="pt-0 space-y-4 animate-in slide-in-from-top-2 duration-200">
            {/* Filters */}
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex gap-2">
                <Select value={resultFilter} onValueChange={(v) => setResultFilter(v as typeof resultFilter)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Filtre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="accepted">Acceptés</SelectItem>
                    <SelectItem value="rejected">Refusés</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2 px-3 border rounded-md">
                  <Checkbox
                    id="show-all"
                    checked={showAll}
                    onCheckedChange={(v) => setShowAll(v === true)}
                  />
                  <Label htmlFor="show-all" className="text-sm whitespace-nowrap">Tout</Label>
                </div>
              </div>

              {!showAll && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Du</Label>
                    <Input
                      type="date"
                      value={range.start}
                      onChange={(e) => setRange((p) => ({ ...p, start: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Au</Label>
                    <Input
                      type="date"
                      value={range.end}
                      onChange={(e) => setRange((p) => ({ ...p, end: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Export buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                disabled={!visibleLogs.length}
                onClick={() => {
                  downloadQrScanLogsCsv({
                    logs: visibleLogs,
                    period: showAll ? undefined : { startYmd: range.start, endYmd: range.end },
                    establishmentName: establishment.name,
                  });
                }}
              >
                <Download className="h-4 w-4" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                disabled={!visibleLogs.length}
                onClick={() => {
                  downloadQrScanLogsPdf({
                    logs: visibleLogs,
                    period: showAll ? undefined : { startYmd: range.start, endYmd: range.end },
                    establishmentName: establishment.name,
                  });
                }}
              >
                <Download className="h-4 w-4" />
                PDF
              </Button>
            </div>

            {/* Scan list - Mobile optimized */}
            {loadingLogs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : visibleLogs.length > 0 ? (
              <div className="space-y-2">
                {visibleLogs.slice(0, 20).map((log) => {
                  const reason = extractReason(log.payload);
                  const isAccepted = log.result === "accepted";
                  return (
                    <div
                      key={log.id}
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
                          <span className="font-mono text-xs">{log.booking_reference || "—"}</span>
                          <span className="text-xs text-slate-400">{log.holder_name || ""}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>{formatDate(log.scanned_at)}</span>
                          <span>•</span>
                          <span className={isAccepted ? "text-emerald-600" : "text-red-600"}>
                            {translateReason(reason)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {visibleLogs.length > 20 && (
                  <p className="text-center text-sm text-slate-500 py-2">
                    +{visibleLogs.length - 20} autres scans
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <History className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Aucun scan trouvé</p>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
