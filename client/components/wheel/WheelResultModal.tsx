import { useEffect, useState, useCallback } from "react";
import type { WheelPrizeType } from "../../../shared/notificationsBannersWheelTypes";
import { Copy, Check, ExternalLink, Clock } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WheelResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: "won" | "lost";
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
  } | null;
  giftDistributionId?: string | null;
  nextSpinAt?: string | null;
  deviceId?: string;
  /** Called when user clicks "Réserver maintenant" for ftour prizes */
  onReserve?: () => void;
}

function isFtourPrize(prize: WheelResultModalProps["prize"]): boolean {
  return !!(prize && prize.type === "free_service" && prize.establishment_id);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMAD(cents: number): string {
  return `${(cents / 100).toFixed(0)} MAD`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function useCountdown(targetIso: string | null | undefined) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    if (!targetIso) return;

    function tick() {
      const diff = new Date(targetIso!).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Vous pouvez rejouer !");
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      );
    }

    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [targetIso]);

  return remaining;
}

// ---------------------------------------------------------------------------
// Prize type checks
// ---------------------------------------------------------------------------

const DISCOUNT_TYPES: WheelPrizeType[] = [
  "percentage_discount",
  "fixed_discount",
  "free_service",
];

function isDiscountLike(type: string): boolean {
  return DISCOUNT_TYPES.includes(type as WheelPrizeType);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WheelResultModal({
  isOpen,
  onClose,
  result,
  prize,
  giftDistributionId,
  nextSpinAt,
  deviceId,
  onReserve,
}: WheelResultModalProps) {
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown(result === "lost" ? nextSpinAt : null);

  // Reset copied state when modal reopens
  useEffect(() => {
    if (isOpen) setCopied(false);
  }, [isOpen]);

  const handleCopy = useCallback(async () => {
    if (!prize?.external_code) return;
    try {
      await navigator.clipboard.writeText(prize.external_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may not be available */
    }
  }, [prize?.external_code]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const won = result === "won";

  return (
    <>
      {/* ---------- keyframes ---------- */}
      <style>{`
        @keyframes wrm-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes wrm-modalPop {
          from { transform: scale(0.75); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes wrm-iconPulse {
          0%, 100% { box-shadow: 0 0 30px rgba(251,191,36,0.35); }
          50% { box-shadow: 0 0 50px rgba(251,191,36,0.55); }
        }
      `}</style>

      {/* ---------- Overlay ---------- */}
      <div
        className="fixed inset-0 flex items-center justify-center px-4"
        style={{
          zIndex: 200,
          background: won
            ? "radial-gradient(ellipse at center, rgba(251,191,36,0.15) 0%, rgba(0,0,0,0.88) 70%)"
            : "rgba(0,0,0,0.82)",
          animation: "wrm-fadeIn 0.3s ease",
        }}
        onClick={onClose}
      >
        {/* ---------- Card ---------- */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: won
              ? "linear-gradient(155deg, #1a1a1a 0%, #2a1800 40%, #1a1a1a 100%)"
              : "linear-gradient(155deg, #1a1a1a, #222)",
            border: won ? "2px solid #fbbf24" : "1px solid #444",
            borderRadius: 24,
            padding: "44px 36px 36px",
            textAlign: "center",
            maxWidth: 380,
            width: "100%",
            boxShadow: won
              ? "0 0 80px rgba(251,191,36,0.2), 0 0 30px rgba(251,191,36,0.15), 0 24px 60px rgba(0,0,0,0.6)"
              : "0 24px 60px rgba(0,0,0,0.5)",
            animation:
              "wrm-modalPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
            position: "relative",
          }}
        >
          {/* Top gold line (won only) */}
          {won && (
            <div
              style={{
                position: "absolute",
                top: -1,
                left: "50%",
                transform: "translateX(-50%)",
                width: "60%",
                height: 2,
                background:
                  "linear-gradient(90deg, transparent, #fbbf24, transparent)",
                borderRadius: 2,
              }}
            />
          )}

          {/* Body */}
          {won ? (
            <WonContent
              prize={prize}
              giftDistributionId={giftDistributionId}
              onCopy={handleCopy}
              copied={copied}
              deviceId={deviceId}
            />
          ) : (
            <LostContent countdown={countdown} nextSpinAt={nextSpinAt} />
          )}

          {/* Close / CTA button */}
          {won && isFtourPrize(prize) && onReserve ? (
            <button
              onClick={onReserve}
              style={{
                marginTop: 28,
                padding: "14px 32px",
                borderRadius: 50,
                border: "none",
                background: "linear-gradient(135deg, #16a34a, #15803d)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                fontFamily: "'Poppins', sans-serif",
                cursor: "pointer",
                letterSpacing: 1,
                textTransform: "uppercase",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
                boxShadow: "0 4px 20px rgba(22,163,74,0.3)",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.transform = "scale(1.04)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.transform = "scale(1)";
              }}
            >
              {`Réserver chez ${prize?.establishment_name || "le restaurant"}`}
            </button>
          ) : (
            <button
              onClick={onClose}
              style={{
                marginTop: 28,
                padding: "14px 44px",
                borderRadius: 50,
                border: "none",
                background: won
                  ? "linear-gradient(135deg, #fbbf24, #f59e0b)"
                  : "linear-gradient(135deg, #444, #555)",
                color: won ? "#1a1a1a" : "#ddd",
                fontWeight: 700,
                fontSize: 15,
                fontFamily: "'Poppins', sans-serif",
                cursor: "pointer",
                letterSpacing: 1.5,
                textTransform: "uppercase",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
                boxShadow: won
                  ? "0 4px 20px rgba(251,191,36,0.3)"
                  : "none",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.transform = "scale(1.04)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.transform = "scale(1)";
              }}
            >
              {won ? "Voir mes cadeaux" : "Fermer"}
            </button>
          )}

          {/* Sam.ma branding */}
          <div
            style={{
              marginTop: 20,
              opacity: 0.4,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <span
                style={{
                  fontFamily: "'Poppins', sans-serif",
                  fontWeight: 800,
                  fontSize: 14,
                  color: "#a3001d",
                  letterSpacing: -0.5,
                  lineHeight: 1,
                }}
              >
                Sam
              </span>
              <span
                style={{
                  fontFamily: "'Poppins', sans-serif",
                  fontWeight: 800,
                  fontSize: 14,
                  color: "#fbbf24",
                  letterSpacing: -0.5,
                  lineHeight: 1,
                }}
              >
                .ma
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Won sub-component
// ---------------------------------------------------------------------------

function WonContent({
  prize,
  giftDistributionId,
  onCopy,
  copied,
  deviceId,
}: {
  prize: WheelResultModalProps["prize"];
  giftDistributionId?: string | null;
  onCopy: () => void;
  copied: boolean;
  deviceId?: string;
}) {
  return (
    <>
      {/* Gold star icon */}
      <div
        style={{
          width: 72,
          height: 72,
          margin: "0 auto 20px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 40% 35%, #ffd700, #f59e0b, #b8860b)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 30px rgba(251,191,36,0.35)",
          animation: "wrm-iconPulse 1.5s ease-in-out infinite",
        }}
      >
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
      </div>

      {/* Title */}
      <h2
        style={{
          fontFamily: "'Poppins', sans-serif",
          fontSize: 30,
          fontWeight: 800,
          background:
            "linear-gradient(to right, #fbbf24, #ffd700, #f59e0b)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: 6,
          letterSpacing: 1,
        }}
      >
        FÉLICITATIONS
      </h2>

      {prize && (
        <div style={{ marginTop: 16 }}>
          <p
            style={{
              color: "#fbbf24",
              fontSize: 22,
              fontWeight: 700,
              fontFamily: "'Poppins', sans-serif",
              marginBottom: 6,
            }}
          >
            {prize.name}
          </p>

          {prize.description && (
            <p style={{ color: "#999", fontSize: 14, marginBottom: 8 }}>
              {prize.description}
            </p>
          )}

          {prize.establishment_name && !isFtourPrize(prize) && (
            <p style={{ color: "#777", fontSize: 13, marginBottom: 8 }}>
              Chez{" "}
              <span style={{ color: "#bbb", fontWeight: 500 }}>
                {prize.establishment_name}
              </span>
            </p>
          )}

          {/* Ftour reassurance block */}
          {isFtourPrize(prize) && (
            <div
              style={{
                marginTop: 14,
                marginBottom: 14,
                borderRadius: 14,
                background: "rgba(22,163,74,0.1)",
                border: "1px solid rgba(22,163,74,0.3)",
                padding: "16px 18px",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>🍽️</span>
                  <p style={{ color: "#ccc", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                    Ce repas est offert pour{" "}
                    <span style={{ color: "#4ade80", fontWeight: 700 }}>1 personne</span>{" "}
                    dans le cadre d'un partenariat SAM.ma
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>📅</span>
                  <p style={{ color: "#ccc", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                    Valable jusqu'à{" "}
                    <span style={{ color: "#fbbf24", fontWeight: 600 }}>
                      fin Ramadan{prize.expires_at ? ` (${formatDate(prize.expires_at)})` : ""}
                    </span>
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>📍</span>
                  <p style={{ color: "#ccc", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                    Réservez votre place chez{" "}
                    <span style={{ color: "#fbbf24", fontWeight: 600 }}>
                      {prize.establishment_name}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Discount / free service value */}
          {isDiscountLike(prize.type) && prize.value != null && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                borderRadius: 50,
                background: "rgba(251,191,36,0.15)",
                border: "1px solid rgba(251,191,36,0.3)",
                padding: "8px 20px",
                color: "#fbbf24",
                fontWeight: 700,
                fontSize: 15,
                marginBottom: 8,
              }}
            >
              {prize.type === "percentage_discount"
                ? `${prize.value}%`
                : formatMAD(prize.value)}
            </div>
          )}

          {/* External code */}
          {prize.type === "external_code" && prize.external_code && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  border: "1px dashed rgba(251,191,36,0.4)",
                  borderRadius: 12,
                  background: "rgba(0,0,0,0.3)",
                  padding: "14px 20px",
                }}
              >
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: 2,
                    color: "#fff",
                  }}
                >
                  {prize.external_code}
                </span>
                <button
                  onClick={onCopy}
                  style={{
                    flexShrink: 0,
                    borderRadius: 6,
                    padding: 6,
                    color: copied ? "#4ade80" : "#999",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    transition: "color 0.2s",
                  }}
                  aria-label="Copier le code"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>

              {prize.partner_name && (
                <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                  Offert par{" "}
                  {prize.partner_url ? (
                    <a
                      href={prize.partner_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#fbbf24",
                        fontWeight: 500,
                        textDecoration: "none",
                      }}
                    >
                      {prize.partner_name}{" "}
                      <ExternalLink
                        size={10}
                        style={{ display: "inline", verticalAlign: "middle" }}
                      />
                    </a>
                  ) : (
                    <span style={{ fontWeight: 500, color: "#999" }}>
                      {prize.partner_name}
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Physical gift — QR prompt */}
          {prize.type === "physical_gift" && giftDistributionId && (
            <div
              style={{
                borderRadius: 12,
                background: "rgba(251,191,36,0.08)",
                border: "1px solid rgba(251,191,36,0.25)",
                padding: "14px 16px",
                marginTop: 12,
              }}
            >
              <p
                style={{
                  fontWeight: 600,
                  marginBottom: 6,
                  color: "#fbbf24",
                  fontSize: 13,
                }}
              >
                Présentez ce QR à l'établissement
              </p>
              <p
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "#b8860b",
                  wordBreak: "break-all",
                }}
              >
                {giftDistributionId}
              </p>
            </div>
          )}

          {/* Expiry (not shown for ftour — already in reassurance block) */}
          {prize.expires_at && !isFtourPrize(prize) && (
            <p
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                fontSize: 12,
                color: "#555",
                marginTop: 12,
              }}
            >
              <Clock size={12} />
              Valable jusqu'au {formatDate(prize.expires_at)}
            </p>
          )}
        </div>
      )}

      {/* Subtitle */}
      <p
        style={{
          color: "#888",
          fontSize: 13,
          fontFamily: "'Poppins', sans-serif",
          marginTop: 8,
        }}
      >
        {isFtourPrize(prize) ? "Réservez pour profiter de votre ftour" : "Votre cadeau vous attend"}
      </p>

      {/* Device reference */}
      {deviceId && (
        <p
          style={{
            color: "#444",
            fontSize: 10,
            fontFamily: "monospace",
            marginTop: 8,
          }}
        >
          Réf: {deviceId}-{Date.now().toString(36).toUpperCase()}
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Lost sub-component
// ---------------------------------------------------------------------------

function LostContent({
  countdown,
  nextSpinAt,
}: {
  countdown: string;
  nextSpinAt?: string | null;
}) {
  return (
    <>
      {/* Sad face icon */}
      <div
        style={{
          width: 64,
          height: 64,
          margin: "0 auto 20px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, #333, #444)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#888"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M8 15s1.5-2 4-2 4 2 4 2" />
          <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" />
          <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" />
        </svg>
      </div>

      <h2
        style={{
          fontFamily: "'Poppins', sans-serif",
          fontSize: 24,
          fontWeight: 700,
          color: "#bbb",
          marginBottom: 8,
        }}
      >
        Pas cette fois
      </h2>
      <p
        style={{
          color: "#666",
          fontSize: 14,
          fontFamily: "'Poppins', sans-serif",
        }}
      >
        La chance vous sourira bientôt !
      </p>

      {nextSpinAt && countdown && (
        <div
          style={{
            marginTop: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontSize: 14,
            color: "#888",
          }}
        >
          <Clock size={16} style={{ color: "#666" }} />
          <span>Prochain essai dans</span>
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 700,
              color: "#fbbf24",
            }}
          >
            {countdown}
          </span>
        </div>
      )}
    </>
  );
}
