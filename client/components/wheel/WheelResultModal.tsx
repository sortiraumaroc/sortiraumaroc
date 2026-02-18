import { useEffect, useState, useCallback } from "react";
import type { WheelPrizeType } from "../../../shared/notificationsBannersWheelTypes";
import { X, Gift, Copy, Check, ExternalLink, Clock } from "lucide-react";

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
    establishment_name?: string;
    value?: number;
    expires_at?: string;
    external_code?: string;
    partner_name?: string;
    partner_url?: string;
  } | null;
  giftDistributionId?: string | null;
  nextSpinAt?: string | null;
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
      {/* ---------- keyframes (injected once via style tag) ---------- */}
      <style>{`
        @keyframes wrm-slide-up {
          from { opacity: 0; transform: translateY(40px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes wrm-confetti {
          0%   { opacity: 1; transform: translateY(0) rotate(0deg); }
          100% { opacity: 0; transform: translateY(420px) rotate(720deg); }
        }
      `}</style>

      {/* ---------- Overlay ---------- */}
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
        onClick={onClose}
      >
        {/* ---------- Card ---------- */}
        <div
          className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden"
          style={{ animation: "wrm-slide-up 0.35s ease-out forwards" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Confetti layer (won only) */}
          {won && <ConfettiLayer />}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 end-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-gray-500 hover:text-gray-800 transition-colors"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>

          {/* Body */}
          <div className="px-6 pt-10 pb-6 text-center">
            {won ? (
              <WonContent
                prize={prize}
                giftDistributionId={giftDistributionId}
                onCopy={handleCopy}
                copied={copied}
              />
            ) : (
              <LostContent countdown={countdown} nextSpinAt={nextSpinAt} />
            )}
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
}: {
  prize: WheelResultModalProps["prize"];
  giftDistributionId?: string | null;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <>
      <p className="text-4xl mb-2">{"🎉"}</p>
      <h2 className="text-xl font-bold text-gray-900">Félicitations !</h2>

      {prize && (
        <div className="mt-4 space-y-3">
          <p className="text-lg font-semibold text-[hsl(354,100%,32%)]">
            {prize.name}
          </p>

          {prize.description && (
            <p className="text-sm text-gray-600">{prize.description}</p>
          )}

          {prize.establishment_name && (
            <p className="text-sm text-gray-500">
              Chez{" "}
              <span className="font-medium text-gray-700">
                {prize.establishment_name}
              </span>
            </p>
          )}

          {/* Discount / free service value */}
          {isDiscountLike(prize.type) && prize.value != null && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-4 py-1.5 text-green-700 font-semibold text-sm">
              <Gift size={16} />
              {prize.type === "percentage_discount"
                ? `${prize.value}%`
                : formatMAD(prize.value)}
            </div>
          )}

          {/* External code */}
          {prize.type === "external_code" && prize.external_code && (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3">
                <span className="font-mono text-base font-semibold tracking-wider text-gray-800">
                  {prize.external_code}
                </span>
                <button
                  onClick={onCopy}
                  className="flex-shrink-0 rounded p-1 text-gray-400 hover:text-gray-700 transition-colors"
                  aria-label="Copier le code"
                >
                  {copied ? (
                    <Check size={16} className="text-green-500" />
                  ) : (
                    <Copy size={16} />
                  )}
                </button>
              </div>

              {prize.partner_name && (
                <p className="text-xs text-gray-500">
                  Offert par{" "}
                  {prize.partner_url ? (
                    <a
                      href={prize.partner_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 font-medium text-[hsl(354,100%,32%)] hover:underline"
                    >
                      {prize.partner_name}
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span className="font-medium">{prize.partner_name}</span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Physical gift — QR prompt */}
          {prize.type === "physical_gift" && giftDistributionId && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium mb-1">
                Présentez ce QR à l'établissement
              </p>
              <p className="font-mono text-xs text-amber-600 break-all">
                {giftDistributionId}
              </p>
            </div>
          )}

          {/* Expiry */}
          {prize.expires_at && (
            <p className="flex items-center justify-center gap-1 text-xs text-gray-400">
              <Clock size={12} />
              Valable jusqu'au {formatDate(prize.expires_at)}
            </p>
          )}
        </div>
      )}

      {/* CTA */}
      <a
        href="/profile?tab=gifts"
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[hsl(354,100%,32%)] px-6 py-2.5 text-sm font-semibold text-white shadow hover:opacity-90 transition-opacity"
      >
        <Gift size={16} />
        Voir mes cadeaux
      </a>
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
      <p className="text-4xl mb-2">{"🍀"}</p>
      <h2 className="text-xl font-bold text-gray-900">
        Pas de chance cette fois !
      </h2>
      <p className="mt-2 text-sm text-gray-500">
        Retentez votre chance demain
      </p>

      {nextSpinAt && countdown && (
        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-gray-600">
          <Clock size={16} className="text-gray-400" />
          <span>Prochain essai dans</span>
          <span className="font-mono font-semibold text-[hsl(354,100%,32%)]">
            {countdown}
          </span>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Confetti (pure CSS)
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = [
  "#a3001d",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
];

function ConfettiLayer() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden">
      {Array.from({ length: 28 }).map((_, i) => {
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const left = `${(i / 28) * 100 + Math.random() * 3}%`;
        const delay = `${(Math.random() * 1.2).toFixed(2)}s`;
        const duration = `${(1.8 + Math.random() * 1.2).toFixed(2)}s`;
        const size = 6 + Math.round(Math.random() * 4);

        return (
          <span
            key={i}
            className="absolute top-0 rounded-sm"
            style={{
              left,
              width: size,
              height: size,
              backgroundColor: color,
              animation: `wrm-confetti ${duration} ${delay} ease-in forwards`,
              opacity: 0.9,
            }}
          />
        );
      })}
    </div>
  );
}
