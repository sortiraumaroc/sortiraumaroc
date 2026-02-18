// =============================================================================
// SCANNER LOYALTY PANEL - Panneau fidélité pour le scanner Pro
// À intégrer dans ProUnifiedScannerTab.tsx
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  Award, Check, ChevronDown, ChevronUp, CreditCard, Gift, History,
  Loader2, Plus, Sparkles, Star, X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { LoyaltyCardVisual } from "@/components/loyalty/LoyaltyCardVisual";
import {
  getUserLoyaltyInfo,
  addLoyaltyStamp,
  redeemLoyaltyReward,
  type UserLoyaltyInfo,
} from "@/lib/loyalty/api";
import type { LoyaltyCardFull, LoyaltyReward } from "@/lib/loyalty/types";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

type Props = {
  establishmentId: string;
  userId: string;
  userName?: string;
  onStampAdded?: (result: { card: LoyaltyCardFull; reward_unlocked: boolean }) => void;
  onRewardRedeemed?: (reward: LoyaltyReward) => void;
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ScannerLoyaltyPanel({
  establishmentId,
  userId,
  userName,
  onStampAdded,
  onRewardRedeemed,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loyaltyInfo, setLoyaltyInfo] = useState<UserLoyaltyInfo | null>(null);

  const [stampingProgram, setStampingProgram] = useState<string | null>(null);
  const [redeemingReward, setRedeemingReward] = useState<string | null>(null);
  const [stampResult, setStampResult] = useState<{
    success: boolean;
    message: string;
    reward_unlocked?: boolean;
  } | null>(null);

  const [isExpanded, setIsExpanded] = useState(true);

  // Charger les infos fidélité du user
  const loadLoyaltyInfo = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const info = await getUserLoyaltyInfo(establishmentId, userId);
      setLoyaltyInfo(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [establishmentId, userId]);

  useEffect(() => {
    void loadLoyaltyInfo();
  }, [loadLoyaltyInfo]);

  // Ajouter un tampon
  const handleStamp = async (programId?: string) => {
    setStampingProgram(programId ?? "all");
    setStampResult(null);

    try {
      const result = await addLoyaltyStamp(establishmentId, {
        user_id: userId,
        program_id: programId,
      });

      setStampResult({
        success: true,
        message: result.message,
        reward_unlocked: result.reward_unlocked,
      });

      // Rafraîchir les données
      await loadLoyaltyInfo();

      if (onStampAdded && result.card) {
        onStampAdded({
          card: result.card as LoyaltyCardFull,
          reward_unlocked: result.reward_unlocked,
        });
      }
    } catch (e) {
      setStampResult({
        success: false,
        message: e instanceof Error ? e.message : "Erreur lors du tamponnage",
      });
    } finally {
      setStampingProgram(null);
    }
  };

  // Valider une récompense
  const handleRedeemReward = async (reward: LoyaltyReward) => {
    if (!window.confirm(`Valider la récompense "${reward.reward_description}" ?`)) {
      return;
    }

    setRedeemingReward(reward.id);

    try {
      const result = await redeemLoyaltyReward(establishmentId, reward.id);

      setStampResult({
        success: true,
        message: result.message,
      });

      // Rafraîchir les données
      await loadLoyaltyInfo();

      if (onRewardRedeemed) {
        onRewardRedeemed(result.reward);
      }
    } catch (e) {
      setStampResult({
        success: false,
        message: e instanceof Error ? e.message : "Erreur lors de la validation",
      });
    } finally {
      setRedeemingReward(null);
    }
  };

  // Si pas de programmes configurés
  if (!loading && (!loyaltyInfo || loyaltyInfo.available_programs.length === 0) && loyaltyInfo?.cards.length === 0) {
    return null; // Masquer le panneau si pas de fidélité
  }

  const hasActiveCards = (loyaltyInfo?.cards.length ?? 0) > 0;
  const hasActiveRewards = (loyaltyInfo?.active_rewards.length ?? 0) > 0;
  const hasAvailablePrograms = (loyaltyInfo?.available_programs.length ?? 0) > 0;

  return (
    <Card className={cn(
      "border-2 transition-colors",
      hasActiveRewards ? "border-amber-300 bg-amber-50/50" : "border-primary/20"
    )}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-slate-50/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                Fidélité
                {hasActiveRewards && (
                  <Badge className="bg-amber-500 text-white border-0 gap-1 ms-2">
                    <Gift className="w-3 h-3" />
                    {loyaltyInfo?.active_rewards.length} récompense(s)
                  </Badge>
                )}
              </CardTitle>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="ms-2 text-sm text-slate-500">Chargement...</span>
              </div>
            ) : error ? (
              <div className="text-sm text-red-600 p-3 bg-red-50 rounded-lg">
                {error}
              </div>
            ) : (
              <>
                {/* Résultat du dernier tampon */}
                {stampResult && (
                  <div
                    className={cn(
                      "p-3 rounded-lg text-sm flex items-center gap-2",
                      stampResult.success
                        ? stampResult.reward_unlocked
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-800"
                    )}
                  >
                    {stampResult.success ? (
                      stampResult.reward_unlocked ? (
                        <Gift className="w-4 h-4" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                    {stampResult.message}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ms-auto h-6 w-6 p-0"
                      onClick={() => setStampResult(null)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                {/* Récompenses en attente (prioritaire) */}
                {hasActiveRewards && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-amber-700 flex items-center gap-2">
                      <Gift className="w-4 h-4" />
                      Récompense(s) à utiliser
                    </h4>
                    {loyaltyInfo!.active_rewards.map((reward) => (
                      <div
                        key={reward.id}
                        className="p-3 bg-white border border-amber-200 rounded-lg"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{reward.reward_description}</p>
                            <p className="text-xs text-slate-500">
                              Code: <span className="font-mono">{reward.reward_code}</span>
                            </p>
                            <p className="text-xs text-amber-600">
                              Expire le {new Date(reward.expires_at).toLocaleDateString("fr-FR")}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            className="gap-1 bg-amber-500 hover:bg-amber-600"
                            disabled={redeemingReward === reward.id}
                            onClick={() => handleRedeemReward(reward)}
                          >
                            {redeemingReward === reward.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                            Valider
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cartes actives */}
                {hasActiveCards && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      Cartes en cours
                    </h4>
                    {loyaltyInfo!.cards.map((card) => (
                      <div key={card.id} className="space-y-2">
                        <LoyaltyCardVisual card={card} size="sm" showProgress />

                        {/* Bouton tamponner */}
                        {card.status === "active" && (
                          <Button
                            className="w-full gap-2"
                            size="sm"
                            disabled={stampingProgram !== null}
                            onClick={() => handleStamp(card.program_id)}
                          >
                            {stampingProgram === card.program_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Plus className="w-4 h-4" />
                            )}
                            Tamponner (+1)
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Programmes disponibles (pas encore inscrits) */}
                {hasAvailablePrograms && !hasActiveCards && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Star className="w-4 h-4" />
                      Programmes disponibles
                    </h4>
                    {loyaltyInfo!.available_programs.map((program) => (
                      <div
                        key={program.id}
                        className="p-3 border rounded-lg space-y-2"
                      >
                        <div>
                          <p className="font-medium text-sm">{program.name}</p>
                          <p className="text-xs text-slate-500">
                            {program.stamps_required} tampons → {program.reward_description}
                          </p>
                        </div>
                        <Button
                          className="w-full gap-2"
                          size="sm"
                          disabled={stampingProgram !== null}
                          onClick={() => handleStamp(program.id)}
                        >
                          {stampingProgram === program.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                          Démarrer la carte (+1 tampon)
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Bouton tamponner global si plusieurs cartes */}
                {hasActiveCards && loyaltyInfo!.cards.length > 1 && (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    disabled={stampingProgram !== null}
                    onClick={() => handleStamp()}
                  >
                    {stampingProgram === "all" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Tamponner toutes les cartes
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// =============================================================================
// MINI VERSION (pour affichage dans résultat scan)
// =============================================================================

export function ScannerLoyaltyBadge({
  loyaltyInfo,
  onExpand,
}: {
  loyaltyInfo: UserLoyaltyInfo | null;
  onExpand?: () => void;
}) {
  if (!loyaltyInfo) return null;

  const hasCards = loyaltyInfo.cards.length > 0;
  const hasRewards = loyaltyInfo.active_rewards.length > 0;

  if (!hasCards && !hasRewards && loyaltyInfo.available_programs.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
        hasRewards
          ? "bg-amber-100 hover:bg-amber-200"
          : "bg-primary/10 hover:bg-primary/20"
      )}
      onClick={onExpand}
    >
      <Award className={cn("w-4 h-4", hasRewards ? "text-amber-600" : "text-primary")} />

      {hasRewards ? (
        <span className="text-sm font-medium text-amber-700">
          <Gift className="w-3 h-3 inline me-1" />
          {loyaltyInfo.active_rewards.length} récompense(s) à utiliser
        </span>
      ) : hasCards ? (
        <span className="text-sm text-primary">
          {loyaltyInfo.cards.map((c) => `${c.stamps_count}/${c.program?.stamps_required ?? 10}`).join(", ")} tampons
        </span>
      ) : (
        <span className="text-sm text-slate-600">
          {loyaltyInfo.available_programs.length} programme(s) disponible(s)
        </span>
      )}

      <ChevronDown className="w-4 h-4 text-slate-400 ms-auto" />
    </div>
  );
}
