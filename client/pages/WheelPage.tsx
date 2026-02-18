/**
 * Page /wheel — Wheel of Fortune game
 *
 * Fetches the active wheel config and renders the spinning wheel.
 * Handles spin API calls, displays results, and links to "Mes Cadeaux".
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, Frown } from "lucide-react";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import WheelOfFortune from "@/components/wheel/WheelOfFortune";
import WheelResultModal from "@/components/wheel/WheelResultModal";
import { getConsumerAccessToken } from "@/lib/auth";

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

async function callSpinWheel(): Promise<SpinApiResponse> {
  const token = await getConsumerAccessToken();
  if (!token) throw new Error("Vous devez être connecté pour jouer");

  const res = await fetch("/api/wheel/spin", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || "Erreur lors du tirage");
  }
  return res.json();
}

// =============================================================================
// Component
// =============================================================================

export default function WheelPage() {
  const [wheelData, setWheelData] = useState<ActiveWheelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spinResult, setSpinResult] = useState<SpinApiResponse | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

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
    const result = await callSpinWheel();
    setSpinResult(result);
    setShowResultModal(true);
    // Refresh wheel state after spin
    fetchActiveWheel()
      .then((data) => setWheelData(data))
      .catch(() => {});
    return result;
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-gray-50 to-white">
      <Header />

      <main className="flex flex-1 flex-col items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full max-w-lg">
          {loading && (
            <div className="flex items-center justify-center py-24">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 p-6 text-center text-red-700">
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && !wheel && (
            <div className="flex flex-col items-center gap-4 py-24 text-center text-gray-500">
              <Frown className="h-16 w-16 text-gray-300" />
              <p className="text-lg font-medium">
                Aucune roue active pour le moment
              </p>
              <p className="text-sm">
                Revenez bientôt, de nouvelles surprises arrivent !
              </p>
            </div>
          )}

          {!loading && !error && wheel && (
            <div className="flex flex-col items-center gap-6">
              {wheel.welcome_message && (
                <p className="text-center text-base text-gray-700 sm:text-lg">
                  {wheel.welcome_message}
                </p>
              )}

              <WheelOfFortune
                segments={segments}
                onSpin={handleSpin}
                canSpin={userCanSpin}
                theme={wheel.visual_config}
                nextSpinAt={nextSpinAt}
              />

              {!userCanSpin && (
                <p className="rounded-lg bg-amber-50 px-4 py-3 text-center text-sm text-amber-700">
                  Vous avez déjà joué. Revenez demain pour un nouveau tour !
                </p>
              )}

              <Link
                to="/profile?tab=gifts"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <Gift className="h-4 w-4" />
                Voir mes cadeaux
              </Link>
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
        />
      )}
    </div>
  );
}
