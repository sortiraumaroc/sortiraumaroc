// =============================================================================
// PROFILE LOYALTY TAB - Mes cartes de fidélité (Consumer)
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Award, Calendar, ChevronRight, Clock, CreditCard, ExternalLink, Gift,
  History, Loader2, MapPin, QrCode, Sparkles, Star, X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { LoyaltyCardVisual, LoyaltyCardMini } from "@/components/loyalty/LoyaltyCardVisual";
import {
  getMyLoyaltyCards,
  getMyLoyaltyCardDetails,
  getMyLoyaltyRewards,
  type MyLoyaltyCardsResponse,
  type MyLoyaltyRewardsResponse,
} from "@/lib/loyalty/api";
import type { LoyaltyCardFull, LoyaltyReward, LoyaltyStamp } from "@/lib/loyalty/types";
import { cn } from "@/lib/utils";

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProfileLoyaltyTab() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cardsData, setCardsData] = useState<MyLoyaltyCardsResponse | null>(null);
  const [rewardsData, setRewardsData] = useState<MyLoyaltyRewardsResponse | null>(null);

  // Card detail dialog
  const [selectedCard, setSelectedCard] = useState<LoyaltyCardFull | null>(null);
  const [cardDetailLoading, setCardDetailLoading] = useState(false);
  const [cardDetail, setCardDetail] = useState<LoyaltyCardFull | null>(null);

  // Reward detail dialog
  const [selectedReward, setSelectedReward] = useState<LoyaltyReward | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [cards, rewards] = await Promise.all([
        getMyLoyaltyCards(),
        getMyLoyaltyRewards(),
      ]);

      setCardsData(cards);
      setRewardsData(rewards);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCardDetail = async (card: LoyaltyCardFull) => {
    setSelectedCard(card);
    setCardDetailLoading(true);

    try {
      const detail = await getMyLoyaltyCardDetails(card.id);
      setCardDetail(detail);
    } catch (e) {
      console.error("Error loading card details:", e);
      setCardDetail(card); // Fallback to basic card data
    } finally {
      setCardDetailLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-slate-600">Chargement de vos cartes...</span>
      </div>
    );
  }

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

  const activeCards = cardsData?.active_cards ?? [];
  const completedCards = cardsData?.completed_cards ?? [];
  const pendingRewards = cardsData?.pending_rewards ?? [];
  const usedRewards = rewardsData?.used ?? [];

  const hasAnyCards = activeCards.length > 0 || completedCards.length > 0;
  const hasAnyRewards = pendingRewards.length > 0 || usedRewards.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Award className="w-6 h-6 text-primary" />
            Mes Cartes de Fidélité
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Accumulez des tampons et gagnez des récompenses
          </p>
        </div>

        {pendingRewards.length > 0 && (
          <Badge className="bg-amber-100 text-amber-700 border-0 gap-1">
            <Gift className="w-3 h-3" />
            {pendingRewards.length} récompense{pendingRewards.length > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Récompenses en attente (highlight) */}
      {pendingRewards.length > 0 && (
        <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-amber-700">
              <Gift className="w-5 h-5" />
              Récompenses à utiliser
            </CardTitle>
            <CardDescription>
              Présentez votre QR code pour profiter de vos cadeaux
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingRewards.map((reward) => (
                <div
                  key={reward.id}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-200 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedReward(reward)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                      <Gift className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{reward.reward_description}</p>
                      <p className="text-xs text-slate-500">
                        {reward.establishment?.name ?? "Établissement"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-amber-600 font-medium">
                      Expire le {new Date(reward.expires_at).toLocaleDateString("fr-FR")}
                    </p>
                    <ChevronRight className="w-4 h-4 text-slate-400 ml-auto mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contenu principal */}
      {!hasAnyCards && !hasAnyRewards ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Aucune carte de fidélité</h3>
            <p className="text-slate-500 mb-4 max-w-md mx-auto">
              Scannez votre QR code chez un établissement participant pour démarrer
              votre première carte de fidélité.
            </p>
            <Button onClick={() => navigate("/profile?tab=qrcode")} className="gap-2">
              <QrCode className="w-4 h-4" />
              Voir mon QR Code
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="active" className="space-y-4">
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              <CreditCard className="w-4 h-4" />
              En cours ({activeCards.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2">
              <History className="w-4 h-4" />
              Historique ({completedCards.length + usedRewards.length})
            </TabsTrigger>
          </TabsList>

          {/* Cartes actives */}
          <TabsContent value="active" className="space-y-4">
            {activeCards.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-slate-500">
                    Aucune carte en cours. Scannez votre QR code pour en créer une !
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {activeCards.map((card) => (
                  <div
                    key={card.id}
                    className="cursor-pointer"
                    onClick={() => openCardDetail(card)}
                  >
                    <LoyaltyCardVisual
                      card={card}
                      size="md"
                      className="shadow-lg hover:shadow-xl transition-shadow"
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Historique */}
          <TabsContent value="completed" className="space-y-4">
            {completedCards.length === 0 && usedRewards.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-slate-500">
                    Aucune carte complétée pour le moment
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {/* Récompenses utilisées */}
                {usedRewards.map((reward) => (
                  <Card key={reward.id} className="opacity-60">
                    <CardContent className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{reward.reward_description}</p>
                          <p className="text-xs text-slate-500">
                            {reward.establishment?.name} • Utilisé le{" "}
                            {reward.used_at
                              ? new Date(reward.used_at).toLocaleDateString("fr-FR")
                              : "?"}
                          </p>
                        </div>
                        <Badge variant="secondary" className="gap-1">
                          <Sparkles className="w-3 h-3" />
                          Utilisé
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Cartes complétées */}
                {completedCards.map((card) => (
                  <div key={card.id} className="opacity-60">
                    <LoyaltyCardMini
                      card={card}
                      onClick={() => openCardDetail(card)}
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Card Detail Dialog */}
      <Dialog open={!!selectedCard} onOpenChange={() => setSelectedCard(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Détail de la carte
            </DialogTitle>
          </DialogHeader>

          {cardDetailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : cardDetail ? (
            <div className="space-y-6">
              {/* Carte visuelle */}
              <LoyaltyCardVisual card={cardDetail} size="lg" />

              {/* Infos établissement */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{cardDetail.establishment?.name}</p>
                  <p className="text-sm text-slate-500">
                    {cardDetail.establishment?.city}
                  </p>
                </div>
                {cardDetail.establishment?.slug && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/etablissement/${cardDetail.establishment?.slug}`)}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {/* Programme info */}
              <div className="p-3 border rounded-lg">
                <h4 className="font-medium mb-2">{cardDetail.program?.name}</h4>
                <p className="text-sm text-slate-600">
                  <Gift className="w-4 h-4 inline mr-1 text-amber-500" />
                  {cardDetail.program?.reward_description}
                </p>
                {cardDetail.program?.conditions && (
                  <p className="text-xs text-slate-500 mt-2">
                    Conditions: {cardDetail.program.conditions}
                  </p>
                )}
              </div>

              {/* Récompense active */}
              {cardDetail.active_reward && (
                <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="w-5 h-5 text-amber-600" />
                    <span className="font-semibold text-amber-700">Récompense disponible !</span>
                  </div>
                  <p className="text-sm">{cardDetail.active_reward.reward_description}</p>
                  <p className="text-xs text-amber-600 mt-2">
                    Code: <span className="font-mono font-bold">{cardDetail.active_reward.reward_code}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Valide jusqu'au {new Date(cardDetail.active_reward.expires_at).toLocaleDateString("fr-FR")}
                  </p>
                  <Button
                    className="w-full mt-3 gap-2"
                    onClick={() => {
                      setSelectedCard(null);
                      setSelectedReward(cardDetail.active_reward!);
                    }}
                  >
                    <QrCode className="w-4 h-4" />
                    Utiliser ma récompense
                  </Button>
                </div>
              )}

              {/* Historique des tampons */}
              {cardDetail.stamps && cardDetail.stamps.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <History className="w-4 h-4" />
                    Historique des passages
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {(cardDetail.stamps as LoyaltyStamp[])
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((stamp) => (
                        <div
                          key={stamp.id}
                          className="flex items-center justify-between text-sm py-2 border-b last:border-0"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                              {stamp.stamp_number}
                            </div>
                            <span>Tampon #{stamp.stamp_number}</span>
                            {stamp.stamp_type !== "regular" && (
                              <Badge variant="secondary" className="text-xs">
                                {stamp.stamp_type === "bonus" && "Bonus"}
                                {stamp.stamp_type === "birthday" && "Anniversaire"}
                                {stamp.stamp_type === "retroactive" && "Rétroactif"}
                              </Badge>
                            )}
                          </div>
                          <span className="text-slate-500 text-xs">
                            {new Date(stamp.created_at).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Reward Detail Dialog */}
      <Dialog open={!!selectedReward} onOpenChange={() => setSelectedReward(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <Gift className="w-5 h-5" />
              Votre récompense
            </DialogTitle>
            <DialogDescription>
              Présentez ce bon à l'établissement pour en profiter
            </DialogDescription>
          </DialogHeader>

          {selectedReward && (
            <div className="space-y-6">
              {/* Bon visuel */}
              <div className="p-6 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl text-white text-center">
                <Sparkles className="w-12 h-12 mx-auto mb-3 animate-pulse" />
                <h3 className="text-xl font-bold mb-2">
                  {selectedReward.reward_description}
                </h3>
                <p className="text-white/80 text-sm">
                  {selectedReward.establishment?.name}
                </p>
              </div>

              {/* Code */}
              <div className="p-4 bg-slate-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Code du bon</p>
                <p className="text-2xl font-mono font-bold text-primary">
                  {selectedReward.reward_code}
                </p>
              </div>

              {/* QR Code link */}
              <Button
                className="w-full gap-2"
                onClick={() => navigate("/profile?tab=qrcode")}
              >
                <QrCode className="w-4 h-4" />
                Afficher mon QR Code
              </Button>

              {/* Infos */}
              <div className="text-sm text-slate-600 space-y-2">
                {selectedReward.conditions && (
                  <p>
                    <span className="font-medium">Conditions:</span>{" "}
                    {selectedReward.conditions}
                  </p>
                )}
                <p className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Valide jusqu'au{" "}
                  <span className="font-medium">
                    {new Date(selectedReward.expires_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </p>
              </div>

              {/* Instructions */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <p className="font-medium mb-1">Comment utiliser ?</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Rendez-vous chez {selectedReward.establishment?.name}</li>
                  <li>Présentez votre QR Code au personnel</li>
                  <li>Profitez de votre récompense !</li>
                </ol>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
