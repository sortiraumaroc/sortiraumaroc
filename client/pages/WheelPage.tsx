/**
 * Page /wheel — Wheel of Fortune game
 *
 * Fetches the active wheel config and renders the spinning wheel.
 * Handles spin API calls, displays results, and links to "Mes Cadeaux".
 *
 * Design: immersive dark casino theme with twinkling stars.
 * Anti-fraud: device fingerprint sent to server on each spin.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Gift, Frown, Shield, ChevronDown } from "lucide-react";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import WheelOfFortune from "@/components/wheel/WheelOfFortune";
import WheelResultModal from "@/components/wheel/WheelResultModal";
import { getConsumerAccessToken } from "@/lib/auth";
import {
  generateDeviceFingerprint,
  getShortDeviceId,
} from "@/lib/deviceFingerprint";

// =============================================================================
// Types — aligned with API responses
// =============================================================================

interface WheelPrize {
  id: string;
  label?: string;
  name: string;
  color?: string;
  segment_color?: string;
  icon?: string;
  segment_icon?: string;
  type: string;
}

interface ActiveWheelResponse {
  ok: boolean;
  wheel: {
    id: string;
    name: string;
    welcome_message?: string;
    visual_config?: {
      background_image?: string;
      primary_color?: string;
      secondary_color?: string;
    };
  } | null;
  canSpin: { canSpin: boolean; reason?: string; nextSpinAt?: string } | false;
  prizes?: WheelPrize[];
}

interface SpinApiResponse {
  ok: boolean;
  result: "won" | "lost";
  segment_index: number;
  prize?: {
    name: string;
    type: string;
    description: string | null;
    establishment_id?: string;
    establishment_name?: string;
    value?: number;
    expires_at?: string;
    external_code?: string;
    partner_name?: string;
    partner_url?: string;
  };
  gift_distribution_id?: string;
  next_spin_at?: string;
  error?: string;
}

// =============================================================================
// API helpers
// =============================================================================

async function fetchActiveWheel(): Promise<ActiveWheelResponse> {
  const token = await getConsumerAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch("/api/wheel/active", { headers });
  if (!res.ok) throw new Error("Impossible de charger la roue");
  return res.json();
}

async function callSpinWheel(deviceId?: string): Promise<SpinApiResponse> {
  const token = await getConsumerAccessToken();
  if (!token) throw new Error("Vous devez être connecté pour jouer");

  const res = await fetch("/api/wheel/spin", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ device_id: deviceId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || "Erreur lors du tirage");
  }
  return res.json();
}

// =============================================================================
// Stars Background — twinkling stars + subtle colored glows
// =============================================================================

const STARS = Array.from({ length: 60 }).map(() => ({
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  size: 1 + Math.random() * 2,
  delay: Math.random() * 5,
  duration: 2.5 + Math.random() * 3.5,
  isGold: Math.random() > 0.7,
}));

function StarsBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {STARS.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            background: s.isGold ? "#fbbf24" : "#ffffff",
            opacity: 0.2,
            animation: `twinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
          }}
        />
      ))}
      {/* Subtle red glow */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "10%",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(163,0,29,0.06) 0%, transparent 70%)",
        }}
      />
      {/* Subtle gold glow */}
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          right: "10%",
          width: 250,
          height: 250,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(251,191,36,0.04) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}

// =============================================================================
// Terms & Conditions Panel
// =============================================================================

const TERMS = [
  "Un seul compte par personne est autorisé. Toute tentative de création de comptes multiples entraîne l'annulation immédiate et définitive de l'ensemble des gains associés.",
  "Chaque appareil est identifié de manière unique. Les tentatives de contournement (navigation privée, VPN, appareils multiples) sont détectées et peuvent mener au blocage du compte.",
  "Les lots gagnés doivent être réclamés sous 48h avec présentation d'une pièce d'identité valide (CIN/Passeport) correspondant au nom du compte.",
  "Sam.ma se réserve le droit de vérifier l'identité du gagnant et d'annuler tout gain en cas de fraude avérée, sans préavis ni compensation.",
  "Un maximum de 1 tour par jour est accordé par utilisateur. Les tours non utilisés ne sont pas reportables.",
  "Les lots ne sont ni échangeables, ni remboursables, ni cumulables avec d'autres offres en cours.",
  "En participant, vous acceptez que vos données soient traitées conformément à notre politique de confidentialité pour la prévention de la fraude.",
];

function TermsPanel() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="w-full max-w-[420px] relative z-[1]"
      style={{ marginTop: 28 }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 transition-all duration-200"
        style={{
          padding: "12px 20px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: expanded ? "12px 12px 0 0" : 12,
          color: "#666",
          fontSize: 12,
          fontFamily: "'Poppins', sans-serif",
          fontWeight: 600,
          cursor: "pointer",
          letterSpacing: 0.5,
        }}
      >
        <span className="flex items-center gap-2">
          <Shield size={14} />
          Conditions de participation
        </span>
        <ChevronDown
          size={12}
          style={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.25s ease",
          }}
        />
      </button>

      {expanded && (
        <div
          style={{
            padding: "16px 20px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderTop: "none",
            borderRadius: "0 0 12px 12px",
            animation: "fadeIn 0.25s ease",
          }}
        >
          <ol
            style={{
              margin: 0,
              padding: "0 0 0 20px",
              listStyleType: "decimal",
            }}
          >
            {TERMS.map((term, i) => (
              <li
                key={i}
                style={{
                  color: i === 0 ? "#a3001d" : "#555",
                  fontSize: 11,
                  lineHeight: 1.7,
                  marginBottom: 8,
                  fontFamily: "'Poppins', sans-serif",
                  fontWeight: i === 0 ? 600 : 400,
                }}
              >
                {term}
              </li>
            ))}
          </ol>
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(163,0,29,0.08)",
              borderRadius: 8,
              border: "1px solid rgba(163,0,29,0.15)",
            }}
          >
            <p
              style={{
                color: "#a3001d",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "'Poppins', sans-serif",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              Toute tentative de fraude (multi-comptes, fausses identités,
              manipulation technique) entraîne le blocage permanent et la
              suppression de tous les gains.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export default function WheelPage() {
  const navigate = useNavigate();
  const [wheelData, setWheelData] = useState<ActiveWheelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spinResult, setSpinResult] = useState<SpinApiResponse | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Generate device fingerprint on mount
  useEffect(() => {
    generateDeviceFingerprint()
      .then((fp) => setDeviceId(fp))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchActiveWheel()
      .then((data) => setWheelData(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const wheel = wheelData?.wheel ?? null;
  const canSpinInfo = wheelData?.canSpin;
  const userCanSpin =
    typeof canSpinInfo === "object" ? canSpinInfo.canSpin : false;
  const nextSpinAt =
    typeof canSpinInfo === "object" ? canSpinInfo.nextSpinAt ?? null : null;

  const segments =
    (wheelData?.prizes ?? (wheel as any)?.prizes ?? []).map(
      (p: WheelPrize) => ({
        id: p.id,
        label: p.label || p.name,
        color: p.color || p.segment_color || "#E5E7EB",
        icon: p.icon || p.segment_icon,
        type: p.type,
      }),
    ) || [];

  const handleSpin = useCallback(async () => {
    const result = await callSpinWheel(deviceId || undefined);
    setSpinResult(result);
    setShowResultModal(true);
    // Refresh wheel state after spin
    fetchActiveWheel()
      .then((data) => setWheelData(data))
      .catch(() => {});
    return result;
  }, [deviceId]);

  const shortDeviceId = deviceId ? getShortDeviceId(deviceId) : "--------";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="flex min-h-screen flex-col relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, #080808 0%, #160808 35%, #0e0505 65%, #080808 100%)",
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      {/* Poppins font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap"
        rel="stylesheet"
      />

      {/* Global keyframes */}
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.6; }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      <StarsBackground />

      {/* Confetti canvas — full-screen, above everything except modals */}
      <canvas
        ref={confettiCanvasRef}
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 99,
        }}
      />

      <Header />

      <main className="flex flex-1 flex-col items-center px-4 py-8 sm:px-6 lg:px-8 relative z-[1]">
        <div className="w-full max-w-lg">
          {loading && (
            <div className="flex items-center justify-center py-24">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#fbbf24] border-t-transparent" />
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-900/30 border border-red-500/30 p-6 text-center text-red-300">
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && !wheel && (
            <div className="flex flex-col items-center gap-4 py-24 text-center text-gray-400">
              <Frown className="h-16 w-16 text-gray-600" />
              <p className="text-lg font-medium text-gray-300">
                Aucune roue active pour le moment
              </p>
              <p className="text-sm text-gray-500">
                Revenez bientôt, de nouvelles surprises arrivent !
              </p>
            </div>
          )}

          {!loading && !error && wheel && (
            <div className="flex flex-col items-center gap-6">
              {/* Golden shimmer title */}
              <h1
                style={{
                  fontSize: "clamp(22px, 5vw, 36px)",
                  fontWeight: 900,
                  textAlign: "center",
                  marginBottom: 0,
                  background:
                    "linear-gradient(100deg, #fbbf24 0%, #ffd700 25%, #fff8dc 50%, #ffd700 75%, #fbbf24 100%)",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  animation: "shimmer 4s linear infinite",
                  letterSpacing: 3,
                  textTransform: "uppercase",
                }}
              >
                Roue de la Fortune
              </h1>

              {wheel.welcome_message && (
                <p className="text-center text-base text-white/70 sm:text-lg">
                  {wheel.welcome_message}
                </p>
              )}

              {/* Device ID — subtle */}
              {deviceId && (
                <span
                  style={{
                    color: "#2a2a2a",
                    fontSize: 9,
                    fontFamily: "monospace",
                    letterSpacing: 1,
                  }}
                >
                  Device: {shortDeviceId}
                </span>
              )}

              <WheelOfFortune
                segments={segments}
                onSpin={handleSpin}
                canSpin={userCanSpin}
                theme={wheel.visual_config}
                nextSpinAt={nextSpinAt}
                confettiCanvasRef={confettiCanvasRef}
              />

              {!userCanSpin && (
                <p className="rounded-lg bg-amber-900/30 border border-amber-500/30 px-4 py-3 text-center text-sm text-amber-300">
                  Vous avez déjà joué. Revenez demain pour un nouveau tour !
                </p>
              )}

              <Link
                to="/profile?tab=gifts"
                className="inline-flex items-center gap-2 text-sm font-medium text-[#fbbf24] hover:text-[#ffd700] transition-colors"
              >
                <Gift className="h-4 w-4" />
                Voir mes cadeaux
              </Link>

              {/* Terms & Conditions */}
              <TermsPanel />
            </div>
          )}
        </div>
      </main>

      <Footer />

      {spinResult && (
        <WheelResultModal
          isOpen={showResultModal}
          onClose={() => setShowResultModal(false)}
          result={spinResult.result}
          prize={spinResult.prize}
          giftDistributionId={spinResult.gift_distribution_id}
          nextSpinAt={spinResult.next_spin_at}
          deviceId={shortDeviceId}
          onReserve={
            spinResult.prize?.establishment_id
              ? () => {
                  setShowResultModal(false);
                  navigate(`/restaurant/${spinResult.prize!.establishment_id}`, {
                    state: {
                      ftourGift: {
                        giftDistributionId: spinResult.gift_distribution_id,
                        prizeName: spinResult.prize!.name,
                      },
                    },
                  });
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
