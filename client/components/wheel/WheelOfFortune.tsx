import { useState, useRef, useCallback, useEffect, useMemo } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WheelSegment {
  id: string;
  label: string;
  color: string;
  icon?: string | null;
  type: string;
}

interface WheelOfFortuneProps {
  segments: WheelSegment[];
  onSpin: () => Promise<{
    ok: boolean;
    segment_index: number;
    result: string;
    prize?: any;
    error?: string;
  }>;
  canSpin: boolean;
  theme?: {
    background_image?: string;
    primary_color?: string;
    secondary_color?: string;
  };
  nextSpinAt?: string | null;
}

type WheelState = "idle" | "spinning" | "result";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the conic-gradient CSS for the wheel segments. */
function buildConicGradient(segments: WheelSegment[]): string {
  const count = segments.length;
  if (count === 0) return "conic-gradient(#ccc 0deg 360deg)";
  const sliceAngle = 360 / count;
  const stops = segments.map((seg, i) => {
    const start = (sliceAngle * i).toFixed(2);
    const end = (sliceAngle * (i + 1)).toFixed(2);
    return `${seg.color} ${start}deg ${end}deg`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

/** Return the center angle (in degrees from 12-o-clock) for a segment index. */
function segmentCenterAngle(index: number, total: number): number {
  const sliceAngle = 360 / total;
  return sliceAngle * index + sliceAngle / 2;
}

/**
 * Calculate the remaining time from now until `targetIso`.
 * Returns { hours, minutes, seconds } or null if already past.
 */
function getTimeRemaining(targetIso: string): {
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
} | null {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    total: diff,
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

/** Pad a number to 2 digits. */
function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/** Fixed arrow/pointer at the top of the wheel. */
function WheelPointer({ color }: { color: string }) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-20"
      style={{ top: -12 }}
    >
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: "14px solid transparent",
          borderRight: "14px solid transparent",
          borderTop: `26px solid ${color}`,
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))",
        }}
      />
    </div>
  );
}

/** Countdown display when the user cannot spin yet. */
function SpinCountdown({ nextSpinAt }: { nextSpinAt: string }) {
  const [remaining, setRemaining] = useState(getTimeRemaining(nextSpinAt));

  useEffect(() => {
    const id = setInterval(() => {
      const r = getTimeRemaining(nextSpinAt);
      setRemaining(r);
      if (!r) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [nextSpinAt]);

  if (!remaining) {
    return (
      <p className="text-sm text-white/80 mt-3 text-center">
        Vous pouvez tourner la roue !
      </p>
    );
  }

  return (
    <div className="mt-4 text-center">
      <p className="text-sm text-white/70 mb-2">Prochain tour dans</p>
      <div className="flex items-center justify-center gap-2">
        {[
          { value: remaining.hours, label: "h" },
          { value: remaining.minutes, label: "m" },
          { value: remaining.seconds, label: "s" },
        ].map((unit) => (
          <div
            key={unit.label}
            className="flex flex-col items-center bg-black/30 rounded-lg px-3 py-2 min-w-[52px]"
          >
            <span className="text-2xl font-bold text-white tabular-nums">
              {pad2(unit.value)}
            </span>
            <span className="text-[10px] text-white/60 uppercase tracking-wider">
              {unit.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WheelOfFortune({
  segments,
  onSpin,
  canSpin,
  theme,
  nextSpinAt,
}: WheelOfFortuneProps) {
  const count = segments.length;
  const sliceAngle = count > 0 ? 360 / count : 360;

  // State
  const [wheelState, setWheelState] = useState<WheelState>("idle");
  const [rotation, setRotation] = useState(0);
  const [resultText, setResultText] = useState<string | null>(null);
  const [resultPrize, setResultPrize] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const wheelRef = useRef<HTMLDivElement>(null);
  const currentBaseRotation = useRef(0);

  // Theme colors
  const primaryColor = theme?.primary_color || "#a3001d";
  const secondaryColor = theme?.secondary_color || "#fbbf24";

  // Conic gradient
  const conicGradient = useMemo(() => buildConicGradient(segments), [segments]);

  // ------------------------------------------------------------------
  // Spin handler
  // ------------------------------------------------------------------
  const handleSpin = useCallback(async () => {
    if (!canSpin || wheelState !== "idle" || count === 0) return;

    setWheelState("spinning");
    setError(null);
    setResultText(null);
    setResultPrize(null);

    try {
      const response = await onSpin();

      if (!response.ok) {
        setError(response.error || "Erreur lors du tirage.");
        setWheelState("idle");
        return;
      }

      const targetIndex = response.segment_index;

      // Calculate the angle where the target segment center is,
      // measured clockwise from the top (0deg).
      // The conic-gradient starts at the top (12-o-clock) and goes clockwise.
      // We want the pointer (at top) to land on the target segment center.
      // The segment center is at: sliceAngle * targetIndex + sliceAngle / 2
      // We need to rotate the wheel so that this center aligns with the top.
      // That means rotating by -(center angle) or equivalently (360 - center).
      const centerAngle = segmentCenterAngle(targetIndex, count);
      const landingOffset = 360 - centerAngle;

      // Add 5 full rotations for spectacle
      const fullSpins = 360 * 5;
      const finalAngle = currentBaseRotation.current + fullSpins + landingOffset;

      // To avoid ever-growing rotation values, we keep track of the base
      setRotation(finalAngle);

      // After animation completes (4s), show result
      setTimeout(() => {
        currentBaseRotation.current = finalAngle % 360;

        setResultText(response.result);
        setResultPrize(response.prize || null);
        setWheelState("result");

        // Auto-dismiss result after 3.5s
        setTimeout(() => {
          setWheelState("idle");
        }, 3500);
      }, 4200);
    } catch {
      setError("Erreur de connexion. Veuillez reessayer.");
      setWheelState("idle");
    }
  }, [canSpin, wheelState, count, onSpin, sliceAngle]);

  // ------------------------------------------------------------------
  // Determine whether the central button should be interactive
  // ------------------------------------------------------------------
  const buttonEnabled = canSpin && wheelState === "idle" && count > 0;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="flex flex-col items-center w-full select-none">
      {/* ---- Wheel container ---- */}
      <div
        className="relative mx-auto"
        style={{
          width: "min(85vw, 500px)",
          height: "min(85vw, 500px)",
          minWidth: 280,
          minHeight: 280,
        }}
      >
        {/* Pointer */}
        <WheelPointer color={primaryColor} />

        {/* Outer ring / border */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
            padding: 10,
          }}
        >
          {/* Wheel disc */}
          <div
            ref={wheelRef}
            className="w-full h-full rounded-full relative overflow-hidden"
            style={{
              background: conicGradient,
              transform: `rotate(${rotation}deg)`,
              transition:
                wheelState === "spinning"
                  ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
                  : "none",
              willChange: wheelState === "spinning" ? "transform" : "auto",
            }}
          >
            {/* Segment labels */}
            {segments.map((seg, i) => {
              const angle = segmentCenterAngle(i, count);
              // Label distance from center (~38% of radius for readability)
              const labelRadius = 38;
              return (
                <div
                  key={seg.id}
                  className="absolute"
                  style={{
                    top: "50%",
                    left: "50%",
                    width: 0,
                    height: 0,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      transform: `rotate(${angle}deg) translateY(-${labelRadius}%) rotate(0deg)`,
                      transformOrigin: "0 0",
                    }}
                  >
                    <span
                      className="block text-center font-semibold whitespace-nowrap"
                      style={{
                        transform: `translateX(-50%) translateY(-140%) rotate(${angle}deg)`,
                        fontSize: count > 10 ? "0.6rem" : count > 6 ? "0.7rem" : "0.8rem",
                        color: "#fff",
                        textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                        maxWidth: 90,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {seg.icon ? `${seg.icon} ` : ""}
                      {seg.label}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Segment dividers — thin white lines */}
            {segments.map((_, i) => {
              const angle = sliceAngle * i;
              return (
                <div
                  key={`div-${i}`}
                  className="absolute top-0 left-1/2"
                  style={{
                    width: 2,
                    height: "50%",
                    background: "rgba(255,255,255,0.35)",
                    transformOrigin: "bottom center",
                    transform: `rotate(${angle}deg)`,
                  }}
                />
              );
            })}

            {/* Tick marks on outer edge */}
            {Array.from({ length: count * 2 }).map((_, i) => {
              const angle = (360 / (count * 2)) * i;
              return (
                <div
                  key={`tick-${i}`}
                  className="absolute top-0 left-1/2"
                  style={{
                    width: 1,
                    height: i % 2 === 0 ? "6%" : "3%",
                    background: "rgba(255,255,255,0.5)",
                    transformOrigin: "bottom center",
                    transform: `translateX(-50%) rotate(${angle}deg)`,
                    transformBox: "fill-box",
                    top: 0,
                    left: "50%",
                    position: "absolute",
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* ---- Central button ---- */}
        <button
          type="button"
          disabled={!buttonEnabled}
          onClick={handleSpin}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30
                     rounded-full flex items-center justify-center
                     transition-transform active:scale-95"
          style={{
            width: "min(22%, 100px)",
            height: "min(22%, 100px)",
            minWidth: 64,
            minHeight: 64,
            background: buttonEnabled
              ? `radial-gradient(circle, ${secondaryColor}, ${primaryColor})`
              : "#6b7280",
            boxShadow: buttonEnabled
              ? `0 0 20px ${primaryColor}80, 0 4px 12px rgba(0,0,0,0.4)`
              : "0 2px 6px rgba(0,0,0,0.3)",
            cursor: buttonEnabled ? "pointer" : "not-allowed",
            border: "3px solid rgba(255,255,255,0.5)",
            animation:
              buttonEnabled && wheelState === "idle"
                ? "wheel-pulse 1.8s ease-in-out infinite"
                : "none",
          }}
        >
          <span
            className="font-bold text-white uppercase tracking-wide text-center leading-tight"
            style={{
              fontSize: "clamp(0.6rem, 2.5vw, 0.9rem)",
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
            }}
          >
            {wheelState === "spinning" ? "..." : "TOURNER"}
          </span>
        </button>
      </div>

      {/* ---- Error message ---- */}
      {error && (
        <div className="mt-4 px-4 py-2 bg-red-500/20 border border-red-400/40 rounded-lg text-red-200 text-sm text-center max-w-xs">
          {error}
        </div>
      )}

      {/* ---- Result overlay ---- */}
      {wheelState === "result" && resultText && (
        <ResultOverlay
          result={resultText}
          prize={resultPrize}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
        />
      )}

      {/* ---- Countdown ---- */}
      {!canSpin && nextSpinAt && wheelState === "idle" && (
        <SpinCountdown nextSpinAt={nextSpinAt} />
      )}

      {/* ---- Pulse keyframes (injected once) ---- */}
      <PulseStyle />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result overlay
// ---------------------------------------------------------------------------

function ResultOverlay({
  result,
  prize,
  primaryColor,
  secondaryColor,
}: {
  result: string;
  prize: any;
  primaryColor: string;
  secondaryColor: string;
}) {
  const isWin = result === "won";

  return (
    <div
      className="mt-6 w-full max-w-sm mx-auto rounded-2xl p-5 text-center animate-in fade-in slide-in-from-bottom-4 duration-500"
      style={{
        background: isWin
          ? `linear-gradient(135deg, ${primaryColor}dd, ${secondaryColor}dd)`
          : "rgba(55, 65, 81, 0.85)",
        backdropFilter: "blur(8px)",
        border: isWin
          ? `2px solid ${secondaryColor}`
          : "2px solid rgba(255,255,255,0.15)",
      }}
    >
      {/* Icon */}
      <div className="text-4xl mb-2">{isWin ? "\uD83C\uDF89" : "\uD83D\uDE14"}</div>

      {/* Title */}
      <h3
        className="text-xl font-bold mb-1"
        style={{ color: isWin ? secondaryColor : "#d1d5db" }}
      >
        {isWin ? "Felicitations !" : "Pas de chance"}
      </h3>

      {/* Prize details */}
      {isWin && prize ? (
        <div className="space-y-1">
          <p className="text-white font-semibold text-lg">{prize.name}</p>
          {prize.description && (
            <p className="text-white/70 text-sm">{prize.description}</p>
          )}
          {prize.establishment_name && (
            <p className="text-white/60 text-xs">
              Chez {prize.establishment_name}
            </p>
          )}
          {prize.value != null && prize.type === "percentage_discount" && (
            <p className="text-white font-bold text-2xl mt-1">
              -{prize.value}%
            </p>
          )}
          {prize.value != null && prize.type === "fixed_discount" && (
            <p className="text-white font-bold text-2xl mt-1">
              -{(prize.value / 100).toFixed(0)} MAD
            </p>
          )}
          {prize.external_code && (
            <div className="mt-2 bg-black/30 rounded-lg px-3 py-2">
              <p className="text-white/60 text-xs mb-1">Votre code</p>
              <p className="text-white font-mono font-bold text-lg tracking-wider">
                {prize.external_code}
              </p>
              {prize.partner_name && (
                <p className="text-white/50 text-xs mt-1">
                  {prize.partner_name}
                </p>
              )}
            </div>
          )}
          {prize.expires_at && (
            <p className="text-white/50 text-xs mt-2">
              Valable jusqu'au{" "}
              {new Date(prize.expires_at).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
        </div>
      ) : !isWin ? (
        <p className="text-white/60 text-sm">
          Tentez votre chance la prochaine fois !
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pulse animation style (injected via <style>)
// ---------------------------------------------------------------------------

let pulseStyleInjected = false;

function PulseStyle() {
  useEffect(() => {
    if (pulseStyleInjected) return;
    pulseStyleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      @keyframes wheel-pulse {
        0%, 100% { transform: translate(-50%, -50%) scale(1); }
        50% { transform: translate(-50%, -50%) scale(1.08); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      // We intentionally keep the style in the DOM since multiple
      // instances could share it. The flag prevents duplicates.
    };
  }, []);
  return null;
}
