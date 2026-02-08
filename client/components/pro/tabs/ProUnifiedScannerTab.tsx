/**
 * ProUnifiedScannerTab - Scanner QR Unifié
 *
 * Scanner intelligent qui détecte automatiquement le type de QR code :
 * - Réservation (SAM:ref=...) → Validation d'entrée
 * - Membre (SAM:USER:v1:...) → Identification membre
 * - Pack (SAMPACK:...) → Validation pack
 * - Fidélité (SAMLOYALTY:...) → Programme de fidélité
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Gift,
  History,
  Loader2,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  StopCircle,
  User,
  Calendar,
  Clock,
  Shield,
  Star,
  AlertCircle,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
  Ticket,
  Package,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { listProQrScanLogs, scanProQrCode, checkinByUserId } from "@/lib/pro/api";
import { ScannerLoyaltyPanel } from "@/components/loyalty/ScannerLoyaltyPanel";
import { downloadQrScanLogsCsv, downloadQrScanLogsPdf } from "@/lib/pro/qrScansExport";
import type { Establishment, ProRole } from "@/lib/pro/types";

// ============================================================================
// Types
// ============================================================================

type Props = {
  establishment: Establishment;
  role: ProRole;
};

type QRCodeType = "reservation" | "member" | "pack" | "loyalty" | "unknown";

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
    holder_name?: string | null;
  } | null;
};

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

interface MemberReservationInfo {
  id: string;
  bookingReference: string | null;
  status: string | null;
  paymentStatus: string | null;
  startsAt: string | null;
  partySize: number | null;
  checkedInAt: string | null;
  kind: string | null;
}

interface MemberPackInfo {
  id: string;
  packId: string | null;
  title: string | null;
  quantity: number;
  totalPrice: number | null;
  currency: string | null;
  status: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

interface MemberValidationResult {
  ok: boolean;
  valid: boolean;
  reason: string;
  message: string;
  userId?: string;
  userInfo?: ConsumerUserInfo | null;
  reservations?: MemberReservationInfo[];
  packs?: MemberPackInfo[];
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
  return d.toLocaleDateString("fr-MA");
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/**
 * Detect QR code type from payload
 */
function detectQRType(payload: string): QRCodeType {
  const trimmed = payload.trim();

  // Member QR: SAM:USER:v1:{userId}:{code}:{ts}
  if (trimmed.startsWith("SAM:USER:")) {
    return "member";
  }

  // Pack QR: SAMPACK:ref=...
  if (trimmed.startsWith("SAMPACK:")) {
    return "pack";
  }

  // Loyalty QR: SAMLOYALTY:...
  if (trimmed.startsWith("SAMLOYALTY:")) {
    return "loyalty";
  }

  // Reservation QR: SAM:ref=... or just starts with SAM:
  if (trimmed.startsWith("SAM:")) {
    return "reservation";
  }

  return "unknown";
}

function getQRTypeLabel(type: QRCodeType): { label: string; icon: React.ReactNode; color: string } {
  switch (type) {
    case "reservation":
      return { label: "Réservation", icon: <Ticket className="h-4 w-4" />, color: "bg-blue-500" };
    case "member":
      return { label: "Membre", icon: <User className="h-4 w-4" />, color: "bg-emerald-500" };
    case "pack":
      return { label: "Pack", icon: <Package className="h-4 w-4" />, color: "bg-purple-500" };
    case "loyalty":
      return { label: "Fidélité", icon: <Gift className="h-4 w-4" />, color: "bg-amber-500" };
    default:
      return { label: "Inconnu", icon: <AlertTriangle className="h-4 w-4" />, color: "bg-slate-500" };
  }
}

function resultBadge(result: string) {
  if (result === "accepted") return { label: "Accepté", cls: "bg-emerald-500 text-white" };
  if (result === "rejected") return { label: "Refusé", cls: "bg-red-500 text-white" };
  return { label: result, cls: "bg-slate-500 text-white" };
}

function getReliabilityBadge(level: string) {
  const levels: Record<string, { label: string; className: string }> = {
    trusted: { label: "Client de confiance", className: "bg-emerald-100 text-emerald-700" },
    reliable: { label: "Client fiable", className: "bg-blue-100 text-blue-700" },
    standard: { label: "Client standard", className: "bg-slate-100 text-slate-700" },
    at_risk: { label: "À surveiller", className: "bg-amber-100 text-amber-700" },
    unreliable: { label: "Peu fiable", className: "bg-red-100 text-red-700" },
  };
  return levels[level] || levels.standard;
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

  const message = e instanceof Error ? e.message : "";
  if (!isSecure && message) return `${secureHint} ${message}`;
  return message || secureHint || "Impossible d'activer la caméra";
}

// Audio feedback
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

async function validateMemberQRCode(
  establishmentId: string,
  qrPayload: string
): Promise<MemberValidationResult> {
  const response = await fetch("/api/consumer/totp/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      establishmentId,
      qrString: qrPayload,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Erreur de validation");
  }

  const data = await response.json();

  // Map server response to MemberValidationResult
  return {
    ok: data.ok,
    valid: data.result === "accepted",
    reason: data.reason,
    message: data.message,
    userId: data.user?.id,
    userInfo: data.user
      ? {
          userId: data.user.id,
          userName: data.user.name ?? "Utilisateur",
          reliabilityLevel: data.user.reliabilityLevel ?? "standard",
          reliabilityScore: data.user.reliabilityScore ?? 100,
          totalReservations: data.user.reservationsCount ?? 0,
          noShowCount: data.user.noShowsCount ?? 0,
          lastActivityAt: data.user.lastActivity ?? null,
          memberSince: data.user.memberSince ?? "",
        }
      : null,
    reservations: data.reservations ?? [],
    packs: data.packs ?? [],
  };
}

// ============================================================================
// User Info Card Component
// ============================================================================

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("fr-MA", { hour: "2-digit", minute: "2-digit" });
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("fr-MA", { day: "numeric", month: "short" });
}

function ReservationStatusBadge({ reservation }: { reservation: MemberReservationInfo }) {
  if (reservation.checkedInAt) {
    return <Badge className="bg-slate-100 text-slate-600">Déjà validé</Badge>;
  }
  if (reservation.status === "confirmed") {
    return <Badge className="bg-emerald-100 text-emerald-700">Réservation valide</Badge>;
  }
  if (reservation.status === "cancelled") {
    return <Badge className="bg-red-100 text-red-700">Annulée</Badge>;
  }
  return <Badge className="bg-amber-100 text-amber-700">{reservation.status ?? "En attente"}</Badge>;
}

function UserInfoCard({
  userInfo,
  reservations,
  packs,
  establishmentId,
  onClose,
  onCheckinDone,
}: {
  userInfo: ConsumerUserInfo;
  reservations: MemberReservationInfo[];
  packs: MemberPackInfo[];
  establishmentId: string;
  onClose: () => void;
  onCheckinDone?: () => void;
}) {
  const reliability = getReliabilityBadge(userInfo.reliabilityLevel);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set());

  const handleCheckin = async (reservationId: string) => {
    setCheckingIn(reservationId);
    setCheckinError(null);
    try {
      const result = await checkinByUserId({
        establishmentId,
        userId: userInfo.userId,
        reservationId,
      });
      if (result.result === "accepted") {
        setCheckedInIds((prev) => new Set(prev).add(reservationId));
        onCheckinDone?.();
      } else {
        setCheckinError(result.message);
      }
    } catch (err) {
      setCheckinError(err instanceof Error ? err.message : "Erreur de check-in");
    } finally {
      setCheckingIn(null);
    }
  };

  return (
    <Card className="border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
      <CardContent className="p-4 space-y-4">
        {/* User identity */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <User className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-lg">{userInfo.userName}</h3>
              <Badge className={cn("mt-1", reliability.className)}>
                <Star className="h-3 w-3 mr-1" />
                {reliability.label}
              </Badge>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <XCircle className="h-5 w-5" />
          </Button>
        </div>

        {/* Stats grid */}
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

        {/* ── Reservations section ── */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Ticket className="h-4 w-4" />
            Réservation du jour
          </h4>
          {reservations.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Pas de réservation aujourd'hui
            </div>
          ) : (
            reservations.map((r) => {
              const isCheckedIn = r.checkedInAt || checkedInIds.has(r.id);
              const canCheckIn = r.status === "confirmed" && !isCheckedIn;
              return (
                <div key={r.id} className="bg-white border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <span className="font-semibold">{formatTime(r.startsAt)}</span>
                      {r.startsAt && <span className="text-xs text-slate-400">{formatShortDate(r.startsAt)}</span>}
                    </div>
                    <ReservationStatusBadge reservation={isCheckedIn ? { ...r, checkedInAt: "done" } : r} />
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    {r.partySize && (
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {r.partySize} pers.
                      </span>
                    )}
                    {r.bookingReference && (
                      <span className="font-mono text-xs text-slate-400">
                        Réf: {r.bookingReference}
                      </span>
                    )}
                  </div>
                  {canCheckIn && (
                    <Button
                      size="sm"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                      disabled={checkingIn === r.id}
                      onClick={() => handleCheckin(r.id)}
                    >
                      {checkingIn === r.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Validation...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Valider l'entrée
                        </>
                      )}
                    </Button>
                  )}
                  {isCheckedIn && !r.checkedInAt && (
                    <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      Entrée validée
                    </div>
                  )}
                </div>
              );
            })
          )}
          {checkinError && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">
              {checkinError}
            </div>
          )}
        </div>

        {/* ── Packs section ── */}
        {packs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Packs actifs
            </h4>
            {packs.map((p) => (
              <div key={p.id} className="bg-white border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{p.title ?? "Pack"}</span>
                  <Badge className="bg-purple-100 text-purple-700">Actif</Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                  <span>Qté: {p.quantity}</span>
                  {p.totalPrice != null && <span>{p.totalPrice} {p.currency ?? "MAD"}</span>}
                  {p.validUntil && <span>Expire: {formatShortDate(p.validUntil)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Meta info */}
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
  qrType,
  userInfo,
  reservationInfo,
  memberReservations,
  memberPacks,
  establishmentId,
  onDismiss,
}: {
  result: { success: boolean; message: string };
  qrType: QRCodeType;
  userInfo: ConsumerUserInfo | null;
  reservationInfo: ScanResultPayload["reservation"] | null;
  memberReservations: MemberReservationInfo[];
  memberPacks: MemberPackInfo[];
  establishmentId: string;
  onDismiss: () => void;
}) {
  const typeInfo = getQRTypeLabel(qrType);

  // Don't auto-dismiss for member scans (they have actionable content)
  useEffect(() => {
    if (qrType === "member" && result.success) return; // Manual dismiss only
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss, qrType, result.success]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: result.success ? "rgb(16, 185, 129)" : "rgb(239, 68, 68)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div className="w-full max-w-md animate-in fade-in zoom-in duration-200 my-8">
        {result.success ? (
          <div className="space-y-4">
            {/* Success header */}
            <div className="text-center">
              <div className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-full text-white mb-4",
                typeInfo.color
              )}>
                {typeInfo.icon}
                <span className="font-medium">{typeInfo.label}</span>
              </div>
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="h-24 w-24 text-white drop-shadow-lg" strokeWidth={1.5} />
              </div>
              <h2 className="text-4xl font-black text-white mb-2 drop-shadow-lg">ACCEPTÉ</h2>
              <p className="text-lg text-white/90">{result.message}</p>
            </div>

            {/* Info card based on type */}
            {qrType === "member" && userInfo && (
              <UserInfoCard
                userInfo={userInfo}
                reservations={memberReservations}
                packs={memberPacks}
                establishmentId={establishmentId}
                onClose={onDismiss}
              />
            )}
            {qrType === "reservation" && reservationInfo?.booking_reference && (
              <div className="text-center">
                <div className="text-lg text-white/80 font-mono bg-white/20 inline-block px-4 py-2 rounded-full">
                  {reservationInfo.booking_reference}
                </div>
                {reservationInfo.holder_name && (
                  <p className="text-white/70 mt-2">{reservationInfo.holder_name}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-white">
            <div className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-full text-white mb-4 bg-white/20"
            )}>
              {typeInfo.icon}
              <span className="font-medium">{typeInfo.label}</span>
            </div>
            <div className="flex justify-center mb-4">
              <XCircle className="h-32 w-32 drop-shadow-lg" strokeWidth={1.5} />
            </div>
            <h2 className="text-5xl font-black mb-4 drop-shadow-lg">REFUSÉ</h2>
            <p className="text-xl opacity-90">{result.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ProUnifiedScannerTab({ establishment, role }: Props) {
  // Camera state
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [continuousMode, setContinuousMode] = useState(true);

  // Scan result state
  const [lastScanResult, setLastScanResult] = useState<{
    success: boolean;
    message: string;
    qrType: QRCodeType;
    userInfo: ConsumerUserInfo | null;
    reservationInfo: ScanResultPayload["reservation"] | null;
    memberReservations: MemberReservationInfo[];
    memberPacks: MemberPackInfo[];
  } | null>(null);
  const [showResultOverlay, setShowResultOverlay] = useState(false);

  // History state
  const [scanHistory, setScanHistory] = useState<QrScanLogRow[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Loyalty state - for displaying loyalty panel after member scan
  const [scannedMember, setScannedMember] = useState<{ userId: string; userName: string } | null>(null);

  // Manual input
  const [manualCode, setManualCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const allowed = canScan(role);

  // Load scan history
  const loadHistory = useCallback(async () => {
    if (!establishment?.id) return;
    setIsLoadingHistory(true);
    try {
      const res = await listProQrScanLogs(establishment.id);
      setScanHistory((res.logs ?? []) as QrScanLogRow[]);
    } catch (err) {
      console.error("Failed to load scan history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [establishment?.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Stop camera
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

  // Process scanned QR code
  const processQRCode = useCallback(async (payload: string, keepScanning = false) => {
    if (isProcessing) return;
    if (!canScan(role)) return;

    const trimmed = payload.trim();
    if (!trimmed) return;

    setIsProcessing(true);

    const qrType = detectQRType(trimmed);

    try {
      let success = false;
      let message = "";
      let userInfo: ConsumerUserInfo | null = null;
      let reservationInfo: ScanResultPayload["reservation"] | null = null;
      let memberReservations: MemberReservationInfo[] = [];
      let memberPacks: MemberPackInfo[] = [];

      if (qrType === "member") {
        // Validate member QR code
        const res = await validateMemberQRCode(establishment.id, trimmed);
        success = res.valid;
        message = res.message;
        if (res.valid && res.userInfo) {
          userInfo = res.userInfo;
          memberReservations = res.reservations ?? [];
          memberPacks = res.packs ?? [];
          // Store scanned member for loyalty panel
          setScannedMember({
            userId: res.userInfo.userId,
            userName: res.userInfo.userName,
          });
        }
      } else if (qrType === "reservation" || qrType === "pack") {
        // Validate reservation/pack QR code (backward compat for old QR codes)
        const res = (await scanProQrCode({
          establishmentId: establishment.id,
          code: trimmed,
        })) as ScanResultPayload;
        success = res.result === "accepted";
        message = res.message;
        if (res.result === "accepted" && res.reservation) {
          reservationInfo = res.reservation;
        }
      } else {
        success = false;
        message = "Format de QR code non reconnu";
      }

      // Audio/haptic feedback
      if (success) {
        if (soundEnabled) playSuccessSound();
        vibrate(200);
      } else {
        if (soundEnabled) playErrorSound();
        vibrate([100, 50, 100]);
      }

      setLastScanResult({
        success,
        message,
        qrType,
        userInfo,
        reservationInfo,
        memberReservations,
        memberPacks,
      });
      setShowResultOverlay(true);

      // Refresh history
      loadHistory();

      // Continue scanning in continuous mode (skip for member scans — they need manual dismiss)
      if (keepScanning && continuousMode && success && qrType !== "member") {
        setTimeout(() => {
          setShowResultOverlay(false);
          void startCamera();
        }, 2000);
      }
    } catch (err) {
      console.error("Scan processing error:", err);
      if (soundEnabled) playErrorSound();
      vibrate([100, 50, 100, 50, 100]);
      setLastScanResult({
        success: false,
        message: err instanceof Error ? err.message : "Erreur de traitement",
        qrType,
        userInfo: null,
        reservationInfo: null,
        memberReservations: [],
        memberPacks: [],
      });
      setShowResultOverlay(true);
    } finally {
      setIsProcessing(false);
    }
  }, [establishment?.id, isProcessing, soundEnabled, loadHistory, continuousMode, role]);

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraError(null);

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

      // Use native BarcodeDetector if available, otherwise fallback to jsQR
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
              await processQRCode(rawValue, true);
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
                await processQRCode(rawValue, true);
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
  }, [scanning, stopCamera, processQRCode]);

  // Handle manual input
  const handleManualSubmit = useCallback(() => {
    if (manualCode.trim()) {
      processQRCode(manualCode.trim(), false);
      setManualCode("");
    }
  }, [manualCode, processQRCode]);

  // Stats
  const stats = useMemo(() => {
    const todayScans = scanHistory.filter((s) => isToday(s.scanned_at));
    return {
      today: todayScans.length,
      accepted: todayScans.filter((s) => s.result === "accepted").length,
      rejected: todayScans.filter((s) => s.result === "rejected").length,
    };
  }, [scanHistory]);

  if (!allowed) {
    return (
      <Card className="m-4">
        <CardContent className="p-8 text-center">
          <Shield className="h-12 w-12 mx-auto text-slate-400 mb-4" />
          <p className="text-slate-500">
            Vous n'avez pas les permissions pour scanner les QR codes.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Result Overlay */}
      {showResultOverlay && lastScanResult && (
        <ScanResultOverlay
          result={lastScanResult}
          qrType={lastScanResult.qrType}
          userInfo={lastScanResult.userInfo}
          reservationInfo={lastScanResult.reservationInfo}
          memberReservations={lastScanResult.memberReservations}
          memberPacks={lastScanResult.memberPacks}
          establishmentId={establishment.id}
          onDismiss={() => setShowResultOverlay(false)}
        />
      )}

      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Scanner QR
          </h2>
          <p className="text-sm text-slate-500">
            Réservations et membres
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900">{stats.today}</div>
            <div className="text-xs text-slate-500">Aujourd'hui</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-600">{stats.accepted}</div>
            <div className="text-xs text-slate-500">Acceptés</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <div className="text-xs text-slate-500">Refusés</div>
          </div>
        </div>
      </div>

      {/* Scanner */}
      <Card>
        <CardContent className="p-4">
          {/* Camera viewport */}
          <div className="relative aspect-square max-w-md mx-auto bg-slate-900 rounded-lg overflow-hidden">
            {scanning ? (
              <>
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  playsInline
                  muted
                />
                {/* Scan overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-64 h-64 border-2 border-white/50 rounded-lg relative">
                    <ScanLine className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-full w-full text-primary animate-pulse" />
                    {/* Corner markers */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
                  </div>
                </div>
                {/* Processing indicator */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="h-12 w-12 text-white animate-spin" />
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70">
                <Camera className="h-16 w-16 mb-4" />
                <p className="text-center px-4">
                  {cameraError || "Appuyez sur Démarrer pour activer la caméra"}
                </p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {scanning ? (
              <Button onClick={stopCamera} variant="destructive" size="lg">
                <StopCircle className="h-5 w-5 mr-2" />
                Arrêter
              </Button>
            ) : (
              <Button onClick={startCamera} size="lg" className="bg-primary">
                <Camera className="h-5 w-5 mr-2" />
                Démarrer
              </Button>
            )}

            <Button
              variant="outline"
              size="icon"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Désactiver le son" : "Activer le son"}
            >
              {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </Button>

            <div className="flex items-center gap-2">
              <Checkbox
                id="continuousMode"
                checked={continuousMode}
                onCheckedChange={(v) => setContinuousMode(!!v)}
              />
              <Label htmlFor="continuousMode" className="text-sm cursor-pointer">
                <Zap className="h-4 w-4 inline mr-1" />
                Continu
              </Label>
            </div>
          </div>

          {/* Type indicators */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
            <span>Types supportés:</span>
            <Badge variant="outline" className="gap-1">
              <Ticket className="h-3 w-3" />
              Réservation
            </Badge>
            <Badge variant="outline" className="gap-1">
              <User className="h-3 w-3" />
              Membre
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Package className="h-3 w-3" />
              Pack
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Gift className="h-3 w-3" />
              Fidélité
            </Badge>
          </div>

          {/* Manual input */}
          <div className="mt-4 pt-4 border-t">
            <Label className="text-sm text-slate-500 mb-2 block">
              Ou entrez le code manuellement:
            </Label>
            <div className="flex gap-2">
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="SAM:ref=... ou SAM:USER:v1:..."
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              />
              <Button onClick={handleManualSubmit} disabled={!manualCode.trim() || isProcessing}>
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loyalty Panel - appears after scanning a member */}
      {scannedMember && (
        <ScannerLoyaltyPanel
          establishmentId={establishment.id}
          userId={scannedMember.userId}
          userName={scannedMember.userName}
          onStampAdded={(result) => {
            if (result.reward_unlocked) {
              if (soundEnabled) playSuccessSound();
              vibrate([100, 50, 100, 50, 100]);
            } else {
              if (soundEnabled) playSuccessSound();
              vibrate(200);
            }
          }}
          onRewardRedeemed={() => {
            if (soundEnabled) playSuccessSound();
            vibrate([200, 100, 200]);
          }}
        />
      )}

      {/* History */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => setHistoryExpanded(!historyExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5" />
              <span className="font-semibold">Historique des scans</span>
              <Badge variant="secondary">{scanHistory.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  loadHistory();
                }}
              >
                <RefreshCw className={cn("h-4 w-4", isLoadingHistory && "animate-spin")} />
              </Button>
              {historyExpanded ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </div>
          </div>
        </CardHeader>

        {historyExpanded && (
          <CardContent>
            {scanHistory.length === 0 ? (
              <p className="text-center text-slate-500 py-8">
                Aucun scan enregistré
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Référence</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Résultat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scanHistory.slice(0, 20).map((log) => {
                      const badge = resultBadge(log.result);
                      const qrType = detectQRType(log.payload);
                      const typeInfo = getQRTypeLabel(qrType);
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(log.scanned_at)}
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("gap-1", typeInfo.color, "text-white")}>
                              {typeInfo.icon}
                              {typeInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {log.booking_reference || "-"}
                          </TableCell>
                          <TableCell>{log.holder_name || "-"}</TableCell>
                          <TableCell>
                            <Badge className={badge.cls}>{badge.label}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Export buttons */}
            {scanHistory.length > 0 && (
              <div className="mt-4 flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadQrScanLogsCsv({
                    logs: scanHistory as any,
                    establishmentName: establishment.name
                  })}
                >
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadQrScanLogsPdf({
                    logs: scanHistory as any,
                    establishmentName: establishment.name
                  })}
                >
                  <Download className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default ProUnifiedScannerTab;
