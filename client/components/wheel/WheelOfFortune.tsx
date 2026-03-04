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
  /** Full-screen canvas ref for confetti (created by WheelPage) */
  confettiCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

type WheelState = "idle" | "spinning" | "result";

// ---------------------------------------------------------------------------
// SAM Color Palette
// ---------------------------------------------------------------------------

const SAM_COLORS = ["#a3001d", "#1a1a1a", "#ffffff", "#fbbf24"];
const SAM_TEXT = ["#ffffff", "#ffffff", "#1a1a1a", "#1a1a1a"];

// ---------------------------------------------------------------------------
// ConfettiEngine — pure Canvas 2D, zero dependencies
// ---------------------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  shape: "square" | "circle" | "strip";
  rotation: number;
  rotSpeed: number;
  gravity: number;
  opacity: number;
  decay: number;
  wobble: number;
  wobbleSpeed: number;
  wobblePhase: number;
}

class ConfettiEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  particles: Particle[] = [];
  animFrame: number | null = null;
  private _onResize: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  burst({
    x = 0.5,
    y = 0.5,
    count = 100,
    spread = 70,
    startVelocity = 30,
    colors = SAM_COLORS,
    gravity = 1.2,
    shapes = ["square", "circle", "strip"] as const,
  } = {}) {
    const cx = x * this.canvas.width;
    const cy = y * this.canvas.height;
    for (let i = 0; i < count; i++) {
      const angle =
        (Math.random() * spread - spread / 2) * (Math.PI / 180) - Math.PI / 2;
      const vel = startVelocity * (0.6 + Math.random() * 0.8);
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel,
        size: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 15,
        gravity,
        opacity: 1,
        decay: 0.01 + Math.random() * 0.007,
        wobble: Math.random() * 10,
        wobbleSpeed: 0.05 + Math.random() * 0.1,
        wobblePhase: Math.random() * Math.PI * 2,
      });
    }
    if (!this.animFrame) this.animate();
  }

  firework({ x = 0.5, y = 0.3 } = {}) {
    this.burst({
      x,
      y,
      count: 250,
      spread: 360,
      startVelocity: 55,
      gravity: 1.5,
      colors: ["#a3001d", "#fbbf24", "#ffffff", "#ff6b6b", "#ffd700", "#ff4444"],
    });
  }

  private animate = () => {
    const { ctx, canvas, particles } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.vy += p.gravity * 0.15;
      p.vx *= 0.99;
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      p.opacity -= p.decay;
      p.wobblePhase += p.wobbleSpeed;
      p.x += Math.sin(p.wobblePhase) * p.wobble * 0.1;

      if (p.opacity <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;

      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "strip") {
        ctx.fillRect(-p.size / 2, -1.5, p.size, 3);
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
    if (particles.length > 0) {
      this.animFrame = requestAnimationFrame(this.animate);
    } else {
      this.animFrame = null;
    }
  };

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    window.removeEventListener("resize", this._onResize);
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NUM_LEDS = 36;
const WHEEL_SIZE = 360;
const WHEEL_RADIUS = WHEEL_SIZE / 2;
const SPIN_DURATION = 5500; // ms

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function getTimeRemaining(targetIso: string) {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    total: diff,
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

// ---------------------------------------------------------------------------
// LED Ring Component
// ---------------------------------------------------------------------------

function LedRing({
  spinning,
  won,
  count,
}: {
  spinning: boolean;
  won: boolean;
  count: number;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = spinning ? 80 : won ? 120 : 600;
    const id = setInterval(() => setTick((t) => t + 1), interval);
    return () => clearInterval(id);
  }, [spinning, won]);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 2 }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const angle = (360 / count) * i;
        const isLit = won
          ? true
          : spinning
            ? (i + tick) % 3 === 0
            : i % 2 === tick % 2;
        const colorIdx = i % 4;
        const color =
          colorIdx === 0
            ? "#a3001d"
            : colorIdx === 1
              ? "#fbbf24"
              : colorIdx === 2
                ? "#ffffff"
                : "#fbbf24";
        return (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 9,
              height: 9,
              background: isLit ? color : "rgba(60,40,10,0.4)",
              top: "50%",
              left: "50%",
              transform: `rotate(${angle}deg) translateY(-${WHEEL_RADIUS + 16}px) translate(-50%, -50%)`,
              boxShadow: isLit ? `0 0 8px 3px ${color}90` : "none",
              transition: "all 0.12s ease",
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wheel SVG with text along top arc
// ---------------------------------------------------------------------------

function WheelSVG({
  rotation,
  segments,
}: {
  rotation: number;
  segments: WheelSegment[];
}) {
  const count = segments.length;
  if (count === 0) return null;

  const segmentAngle = 360 / count;
  const size = WHEEL_SIZE;
  const center = size / 2;
  const radius = center - 4;

  const sectorElements = segments.map((seg, i) => {
    const startAngleDeg = i * segmentAngle - 90;
    const startAngle = startAngleDeg * (Math.PI / 180);
    const endAngle = ((i + 1) * segmentAngle - 90) * (Math.PI / 180);
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    const largeArc = segmentAngle > 180 ? 1 : 0;
    const sectorPath = `M${center},${center} L${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2} Z`;

    // Use SAM colors cycling, or admin override if color is non-default
    const color =
      seg.color && seg.color !== "#E5E7EB"
        ? seg.color
        : SAM_COLORS[i % SAM_COLORS.length];
    const textColor =
      seg.color && seg.color !== "#E5E7EB"
        ? getContrastText(seg.color)
        : SAM_TEXT[i % SAM_TEXT.length];

    // Arc path for text along outer edge
    const textRadius = radius * 0.8;
    const arcPad = 3;
    const tStartDeg = startAngleDeg + arcPad;
    const tEndDeg = startAngleDeg + segmentAngle - arcPad;
    const tStartRad = tStartDeg * (Math.PI / 180);
    const tEndRad = tEndDeg * (Math.PI / 180);
    const ax1 = center + textRadius * Math.cos(tStartRad);
    const ay1 = center + textRadius * Math.sin(tStartRad);
    const ax2 = center + textRadius * Math.cos(tEndRad);
    const ay2 = center + textRadius * Math.sin(tEndRad);
    const textArcPath = `M${ax1},${ay1} A${textRadius},${textRadius} 0 0 1 ${ax2},${ay2}`;
    const arcId = `arc-${i}`;

    // Highlight winning segments with a subtle gold overlay
    const isWinSeg = seg.type !== "nothing" && seg.type !== "retry";

    return (
      <g key={seg.id}>
        <path
          d={sectorPath}
          fill={color}
          stroke="rgba(255,215,0,0.35)"
          strokeWidth="1.5"
        />
        {isWinSeg && (
          <path d={sectorPath} fill="url(#winHighlight)" opacity="0.12" />
        )}
        <defs>
          <path id={arcId} d={textArcPath} />
        </defs>
        <text
          fill={textColor}
          fontSize={seg.label.length > 10 ? "9.5" : "11.5"}
          fontWeight="700"
          fontFamily="'Poppins', sans-serif"
          letterSpacing="0.8"
        >
          <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
            {seg.label.toUpperCase()}
          </textPath>
        </text>
        <line
          x1={center}
          y1={center}
          x2={x1}
          y2={y1}
          stroke="rgba(255,215,0,0.45)"
          strokeWidth="2"
        />
      </g>
    );
  });

  return (
    <div
      style={{
        width: size,
        height: size,
        transform: `rotate(${rotation}deg)`,
        transition: "none",
        willChange: "transform",
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="wheelOverlay" cx="50%" cy="38%" r="58%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
          </radialGradient>
          <radialGradient id="winHighlight" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd700" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <filter id="wheelShadow">
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="4"
              floodColor="rgba(0,0,0,0.35)"
            />
          </filter>
        </defs>
        <g filter="url(#wheelShadow)">{sectorElements}</g>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="url(#wheelOverlay)"
        />
      </svg>
    </div>
  );
}

/** Simple contrast text color: light colors get dark text, dark colors get white. */
function getContrastText(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1a1a1a" : "#ffffff";
}

// ---------------------------------------------------------------------------
// Pointer
// ---------------------------------------------------------------------------

function Pointer({ bouncing }: { bouncing: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        top: -20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        animation: bouncing ? "pointerBounce 0.4s ease 4" : "none",
        filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))",
      }}
    >
      <svg width="38" height="44" viewBox="0 0 38 44">
        <defs>
          <linearGradient id="pointerGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd700" />
            <stop offset="45%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b8860b" />
          </linearGradient>
        </defs>
        <polygon
          points="19,42 2,4 36,4"
          fill="url(#pointerGrad)"
          stroke="#8B6914"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <polygon
          points="19,36 8,8 30,8"
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spin Countdown
// ---------------------------------------------------------------------------

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
// Keyframes (injected once)
// ---------------------------------------------------------------------------

let stylesInjected = false;

function InjectStyles() {
  useEffect(() => {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      @keyframes pointerBounce {
        0%, 100% { transform: translateX(-50%) translateY(0); }
        50% { transform: translateX(-50%) translateY(7px); }
      }
      @keyframes pulseGlow {
        0%, 100% { box-shadow: 0 0 20px rgba(251,191,36,0.3), inset 0 0 10px rgba(251,191,36,0.1); }
        50% { box-shadow: 0 0 45px rgba(251,191,36,0.5), inset 0 0 20px rgba(251,191,36,0.2); }
      }
    `;
    document.head.appendChild(style);
  }, []);
  return null;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function WheelOfFortune({
  segments,
  onSpin,
  canSpin,
  theme,
  nextSpinAt,
  confettiCanvasRef,
}: WheelOfFortuneProps) {
  const count = segments.length;
  const segmentAngle = count > 0 ? 360 / count : 360;

  // State
  const [wheelState, setWheelState] = useState<WheelState>("idle");
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pointerBounce, setPointerBounce] = useState(false);
  const [showWonLeds, setShowWonLeds] = useState(false);

  // Refs
  const rotRef = useRef(0);
  const animRef = useRef<number | null>(null);
  const confettiRef = useRef<ConfettiEngine | null>(null);

  // Theme colors (fallback to SAM defaults)
  const _primaryColor = theme?.primary_color || "#a3001d";
  const _secondaryColor = theme?.secondary_color || "#fbbf24";

  // Initialize confetti engine when canvas is available
  useEffect(() => {
    if (confettiCanvasRef?.current && !confettiRef.current) {
      confettiRef.current = new ConfettiEngine(confettiCanvasRef.current);
    }
    return () => {
      confettiRef.current?.destroy();
      confettiRef.current = null;
    };
  }, [confettiCanvasRef]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // ------------------------------------------------------------------
  // Spin handler
  // ------------------------------------------------------------------
  const handleSpin = useCallback(async () => {
    if (!canSpin || wheelState !== "idle" || count === 0) return;

    setWheelState("spinning");
    setError(null);
    setPointerBounce(false);
    setShowWonLeds(false);

    try {
      const response = await onSpin();

      if (!response.ok) {
        setError(response.error || "Erreur lors du tirage.");
        setWheelState("idle");
        return;
      }

      const targetIndex = response.segment_index;
      const isWin = response.result === "won";

      // Calculate final rotation to land pointer on target segment
      const segmentCenter = targetIndex * segmentAngle + segmentAngle / 2;
      const targetAngle = 360 - segmentCenter + 270;
      const totalSpins = 5 + Math.random() * 3;
      const finalRotation =
        rotRef.current +
        totalSpins * 360 +
        ((targetAngle - (rotRef.current % 360) + 360) % 360);

      const startRotation = rotRef.current;
      const totalDelta = finalRotation - startRotation;
      const startTime = performance.now();

      function animate(now: number) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / SPIN_DURATION, 1);
        const current = startRotation + totalDelta * easeOutQuart(progress);
        rotRef.current = current;
        setRotation(current);

        if (progress < 1) {
          animRef.current = requestAnimationFrame(animate);
        } else {
          rotRef.current = finalRotation;
          setRotation(finalRotation);
          setPointerBounce(true);

          if (isWin) {
            setShowWonLeds(true);
            // Launch confetti celebration
            if (confettiRef.current) {
              confettiRef.current.burst({
                x: 0.05,
                y: 0.6,
                count: 120,
                spread: 75,
                colors: ["#a3001d", "#fbbf24", "#ffffff", "#1a1a1a"],
              });
              confettiRef.current.burst({
                x: 0.95,
                y: 0.6,
                count: 120,
                spread: 75,
                colors: ["#a3001d", "#fbbf24", "#ffffff", "#1a1a1a"],
              });
              setTimeout(
                () =>
                  confettiRef.current?.firework({ x: 0.5, y: 0.32 }),
                500,
              );
              setTimeout(() => {
                confettiRef.current?.burst({
                  x: 0.25,
                  y: 0.25,
                  count: 90,
                  spread: 110,
                  colors: ["#ffd700", "#a3001d", "#ffffff"],
                });
                confettiRef.current?.burst({
                  x: 0.75,
                  y: 0.25,
                  count: 90,
                  spread: 110,
                  colors: ["#ffd700", "#a3001d", "#ffffff"],
                });
              }, 1200);
              setTimeout(
                () =>
                  confettiRef.current?.firework({
                    x: 0.3 + Math.random() * 0.4,
                    y: 0.2 + Math.random() * 0.2,
                  }),
                1800,
              );
            }
          }

          // Show result state after a delay
          setTimeout(
            () => {
              setWheelState("result");
            },
            isWin ? 900 : 400,
          );
        }
      }

      animRef.current = requestAnimationFrame(animate);
    } catch {
      setError("Erreur de connexion. Veuillez reessayer.");
      setWheelState("idle");
    }
  }, [canSpin, wheelState, count, onSpin, segmentAngle]);

  // ------------------------------------------------------------------
  // Button state
  // ------------------------------------------------------------------
  const buttonEnabled = canSpin && wheelState === "idle" && count > 0;
  const isSpinning = wheelState === "spinning";

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="flex flex-col items-center w-full select-none">
      <InjectStyles />

      {/* Wheel Container */}
      <div
        style={{
          position: "relative",
          width: WHEEL_SIZE + 68,
          height: WHEEL_SIZE + 68,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Gold ring */}
        <div
          style={{
            position: "absolute",
            width: WHEEL_SIZE + 42,
            height: WHEEL_SIZE + 42,
            borderRadius: "50%",
            background:
              "conic-gradient(from 0deg, #8B6914, #ffd700, #daa520, #ffd700, #8B6914, #ffd700, #daa520, #ffd700, #8B6914)",
            boxShadow:
              "0 0 40px rgba(251,191,36,0.2), inset 0 0 25px rgba(0,0,0,0.6), 0 0 80px rgba(163,0,29,0.08)",
            zIndex: 1,
          }}
        />
        {/* Inner ring */}
        <div
          style={{
            position: "absolute",
            width: WHEEL_SIZE + 8,
            height: WHEEL_SIZE + 8,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 45% 40%, #1a1a1a, #0d0d0d)",
            zIndex: 1,
          }}
        />

        {/* LED Ring */}
        <LedRing
          spinning={isSpinning}
          won={showWonLeds}
          count={NUM_LEDS}
        />

        {/* Pointer */}
        <Pointer bouncing={pointerBounce && !isSpinning} />

        {/* Wheel SVG + Center button */}
        <div style={{ position: "relative", zIndex: 3 }}>
          <WheelSVG rotation={rotation} segments={segments} />

          {/* Central button */}
          <button
            type="button"
            disabled={!buttonEnabled}
            onClick={buttonEnabled ? handleSpin : undefined}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 84,
              height: 84,
              borderRadius: "50%",
              border: "3px solid #b8860b",
              background: isSpinning
                ? "radial-gradient(circle at 38% 35%, #666, #444, #2a2a2a)"
                : "radial-gradient(circle at 38% 35%, #ffd700, #f59e0b, #daa520, #8B6914)",
              color: isSpinning ? "#888" : "#1a1a1a",
              fontWeight: 800,
              fontSize: 13,
              fontFamily: "'Poppins', sans-serif",
              letterSpacing: 1,
              textTransform: "uppercase",
              cursor: buttonEnabled ? "pointer" : "not-allowed",
              boxShadow: isSpinning
                ? "0 2px 10px rgba(0,0,0,0.4), inset 0 -2px 4px rgba(0,0,0,0.3)"
                : "0 0 25px rgba(251,191,36,0.3), inset 0 -3px 6px rgba(0,0,0,0.35), inset 0 3px 4px rgba(255,255,255,0.25)",
              textShadow: isSpinning
                ? "none"
                : "0 1px 2px rgba(0,0,0,0.25)",
              animation:
                buttonEnabled
                  ? "pulseGlow 2s ease-in-out infinite"
                  : "none",
              zIndex: 10,
              transition: "background 0.3s ease",
              lineHeight: 1.2,
            }}
          >
            {isSpinning ? "..." : "TOURNER"}
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 px-4 py-2 bg-red-500/20 border border-red-400/40 rounded-lg text-red-200 text-sm text-center max-w-xs">
          {error}
        </div>
      )}

      {/* Countdown */}
      {!canSpin && nextSpinAt && wheelState === "idle" && (
        <SpinCountdown nextSpinAt={nextSpinAt} />
      )}
    </div>
  );
}
