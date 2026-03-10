// =============================================================================
// PROFILE AMBASSADOR TAB - Mes programmes ambassadeur (Consumer)
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import {
  Gift, Trophy, Clock, CheckCircle2, XCircle, Loader2, ChevronRight, Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { isAuthed } from "@/lib/auth";
import {
  getMyAmbassadorPrograms,
  getMyAmbassadorRewards,
  type MyAmbassadorProgram,
  type MyAmbassadorReward,
} from "@/lib/ambassadorConsumerApi";
import { AmbassadorRewardQRDialog } from "./AmbassadorRewardQRDialog";

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProfileAmbassadorTab() {
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [programs, setPrograms] = useState<MyAmbassadorProgram[]>([]);
  const [rewards, setRewards] = useState<MyAmbassadorReward[]>([]);

  // QR dialog state
  const [qrReward, setQrReward] = useState<MyAmbassadorReward | null>(null);

  const loadData = useCallback(async () => {
    if (!isAuthed()) return;
    setLoading(true);
    setError(null);

    try {
      const [programsRes, rewardsRes] = await Promise.all([
        getMyAmbassadorPrograms(),
        getMyAmbassadorRewards(),
      ]);

      setPrograms(programsRes.programs);
      setRewards(rewardsRes.rewards);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ---- Derived data ----
  const acceptedPrograms = programs.filter((p) => p.application_status === "accepted");
  const pendingPrograms = programs.filter((p) => p.application_status === "pending");
  const activeRewards = rewards.filter((r) => r.status === "active");
  const historyRewards = rewards.filter((r) => r.status === "claimed" || r.status === "expired");

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[#b30013]" />
        <span className="ms-2 text-slate-600">Chargement...</span>
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={loadData} variant="outline">
          Réessayer
        </Button>
      </div>
    );
  }

  // ---- Empty state ----
  const hasNothing =
    programs.length === 0 && rewards.length === 0;

  if (hasNothing) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Gift className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800 mb-2">
          Aucun programme ambassadeur
        </h3>
        <p className="text-sm text-slate-500 max-w-xs">
          Vous n'avez pas encore rejoint de programme ambassadeur.
        </p>
      </div>
    );
  }

  // ---- Main content ----
  return (
    <div className="space-y-6">
      {/* Summary banner */}
      <div className="bg-gradient-to-r from-[#b30013]/5 to-[#b30013]/10 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Trophy className="w-6 h-6 text-[#b30013]" />
          <div>
            <p className="font-semibold text-slate-800">
              {acceptedPrograms.length} en cours
              {" · "}
              {activeRewards.length} débloquée{activeRewards.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Section: Programmes en cours                                      */}
      {/* ================================================================= */}
      {acceptedPrograms.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Star className="w-4 h-4 text-[#b30013]" />
            Programmes en cours
          </h3>

          {acceptedPrograms.map((prog) => {
            const pct =
              prog.conversions_required > 0
                ? Math.min(
                    100,
                    Math.round(
                      (prog.conversions_confirmed / prog.conversions_required) * 100,
                    ),
                  )
                : 0;

            return (
              <div
                key={`${prog.program.id}-${prog.establishment_id}`}
                className="bg-white rounded-xl border border-slate-200 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-900">
                    {prog.establishment_name}
                  </p>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>

                <p className="text-sm text-slate-600">{prog.reward_description}</p>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#b30013] rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {prog.conversions_confirmed}/{prog.conversions_required} réservations
                    confirmées
                  </p>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* ================================================================= */}
      {/* Section: Candidatures en attente                                  */}
      {/* ================================================================= */}
      {pendingPrograms.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Candidatures en attente
          </h3>

          {pendingPrograms.map((prog) => (
            <div
              key={`${prog.program.id}-${prog.establishment_id}`}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between"
            >
              <div>
                <p className="font-semibold text-slate-800 text-sm">
                  {prog.establishment_name}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Candidature du{" "}
                  {new Date(prog.applied_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                <Clock className="w-3 h-3" />
                En attente de validation
              </span>
            </div>
          ))}
        </section>
      )}

      {/* ================================================================= */}
      {/* Section: Récompenses débloquées                                   */}
      {/* ================================================================= */}
      {activeRewards.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Gift className="w-4 h-4 text-emerald-600" />
            Récompenses débloquées
          </h3>

          {activeRewards.map((reward) => (
            <div
              key={reward.id}
              className="bg-white rounded-xl border border-slate-200 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="font-bold text-slate-900">
                  {reward.establishment_name}
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  Active
                </span>
              </div>

              <p className="text-sm text-slate-600">{reward.reward_description}</p>

              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Expire le{" "}
                {new Date(reward.expires_at).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>

              {/* Claim code */}
              <div className="bg-slate-100 px-3 py-1 rounded-lg inline-block">
                <span className="font-mono text-sm text-slate-800">
                  {reward.claim_code}
                </span>
              </div>

              <Button
                className="w-full gap-2 bg-[#b30013] hover:bg-[#8a0010]"
                onClick={() => setQrReward(reward)}
              >
                <Gift className="w-4 h-4" />
                Voir mon QR code
              </Button>
            </div>
          ))}
        </section>
      )}

      {/* ================================================================= */}
      {/* Section: Historique récompenses                                   */}
      {/* ================================================================= */}
      {historyRewards.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-slate-400" />
            Historique récompenses
          </h3>

          {historyRewards.map((reward) => {
            const isClaimed = reward.status === "claimed";

            return (
              <div
                key={reward.id}
                className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between opacity-70"
              >
                <div>
                  <p className="font-semibold text-slate-800 text-sm">
                    {reward.establishment_name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {reward.reward_description}
                  </p>
                </div>

                {isClaimed ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Utilisée
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
                    <XCircle className="w-3 h-3" />
                    Expirée
                  </span>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* ================================================================= */}
      {/* QR Dialog                                                         */}
      {/* ================================================================= */}
      {qrReward && (
        <AmbassadorRewardQRDialog
          open={!!qrReward}
          onClose={() => setQrReward(null)}
          reward={{
            claim_code: qrReward.claim_code,
            qr_reward_token: qrReward.qr_reward_token,
            establishment_name: qrReward.establishment_name,
            reward_description: qrReward.reward_description,
            expires_at: qrReward.expires_at,
            status: qrReward.status,
          }}
        />
      )}
    </div>
  );
}
