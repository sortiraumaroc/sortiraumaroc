import { useState, useCallback } from "react";
import { Check, ExternalLink, Loader2, QrCode, Sparkles, Calendar, AlertTriangle, Download, Lock } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/money";
import { useToast } from "@/hooks/use-toast";
import { generateQRCode } from "@/lib/qrcode";

import {
  startUsernameTrial,
  type VisibilityOffer,
  type UsernameSubscription,
  type UsernameInfo,
} from "@/lib/pro/api";

type Props = {
  offer: VisibilityOffer | null;
  usernameInfo: UsernameInfo | null;
  establishmentId: string;
  onAddToCart: (offerId: string) => void;
  onRefresh: () => void;
};

const FEATURES = [
  "Lien personnalise book.sam.ma/@votrenom",
  "QR Code unique pour vos supports",
  "Reservations sans commission SAM",
  "Suivi des statistiques de reservation",
  "Changement de nom tous les 180 jours",
];

export function UsernameSubscriptionSection({
  offer,
  usernameInfo,
  establishmentId,
  onAddToCart,
  onRefresh,
}: Props) {
  const { toast } = useToast();
  const [startingTrial, setStartingTrial] = useState(false);

  const subscription = usernameInfo?.subscription;
  const username = usernameInfo?.username;

  // Determine subscription state
  const isTrialActive = subscription?.status === "trial" && subscription.can_use_username;
  const isSubscriptionActive = subscription?.status === "active" && subscription.can_use_username;
  const isGracePeriod = subscription?.status === "grace_period";
  const hasNoSubscription = !subscription;
  const canStartTrial = hasNoSubscription && !username;

  // Format expiration date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const handleStartTrial = async () => {
    setStartingTrial(true);
    try {
      const result = await startUsernameTrial(establishmentId);
      toast({
        title: "Essai gratuit active !",
        description: result.message,
      });
      onRefresh();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible d'activer l'essai",
        variant: "destructive",
      });
    } finally {
      setStartingTrial(false);
    }
  };

  const handleAddToCart = () => {
    if (offer?.id) {
      onAddToCart(offer.id);
    }
  };

  // QR Code URL - uses a placeholder username for preview or actual username
  const previewUsername = username || "votrenom";
  const bookingUrl = `https://book.sam.ma/@${previewUsername}`;
  const qrCodeUrl = generateQRCode(bookingUrl);

  // Can download QR code only if subscription is active (trial or paid)
  const canDownloadQr = isTrialActive || isSubscriptionActive;

  // Download QR code as image
  const handleDownloadQr = useCallback(async () => {
    if (!canDownloadQr || !username) return;

    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `qrcode-${username}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast({
        title: "QR Code telecharge",
        description: "Le QR code a ete telecharge avec succes.",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de telecharger le QR code.",
        variant: "destructive",
      });
    }
  }, [canDownloadQr, username, qrCodeUrl, toast]);

  // Price display
  const priceCents = offer?.price_cents ?? 240000;
  const taxRateBps = offer?.tax_rate_bps ?? 2000;
  const priceHT = priceCents;
  const taxAmount = Math.round((priceCents * taxRateBps) / 10000);
  const priceTTC = priceCents + taxAmount;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-white to-primary/5">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Lien booking personnalisé</CardTitle>
              {canStartTrial && (
                <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                  14 jours d'essai gratuit
                </Badge>
              )}
            </div>
            <CardDescription>
              Votre propre adresse de reservation sans commission
            </CardDescription>
          </div>
          {isSubscriptionActive && (
            <Badge className="bg-green-100 text-green-700 border-green-200">
              <Check className="w-3 h-3 mr-1" />
              Actif
            </Badge>
          )}
          {isTrialActive && (
            <Badge className="bg-blue-100 text-blue-700 border-blue-200">
              <Sparkles className="w-3 h-3 mr-1" />
              Essai
            </Badge>
          )}
          {isGracePeriod && (
            <Badge variant="destructive">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Expire
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status alerts */}
        {isTrialActive && subscription && (
          <Alert className="border-blue-200 bg-blue-50">
            <AlertTitle className="text-blue-800">Essai gratuit actif</AlertTitle>
            <AlertDescription className="text-blue-700">
              <span className="font-medium">{subscription.days_remaining} jours restants</span>
              {subscription.trial_ends_at && (
                <> - Expire le {formatDate(subscription.trial_ends_at)}</>
              )}
            </AlertDescription>
          </Alert>
        )}

        {isSubscriptionActive && subscription && subscription.days_remaining !== undefined && subscription.days_remaining <= 60 && (
          <Alert className="border-amber-200 bg-amber-50">
            <Calendar className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">
              {subscription.days_remaining <= 7 ? "Renouvellement urgent" : "Pensez a renouveler"}
            </AlertTitle>
            <AlertDescription className="text-amber-700">
              <span className="font-medium">{subscription.days_remaining} jours restants</span>
              {subscription.expires_at && (
                <> - Expire le {formatDate(subscription.expires_at)}</>
              )}
            </AlertDescription>
          </Alert>
        )}

        {isGracePeriod && subscription && (
          <Alert variant="destructive" className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Abonnement expire</AlertTitle>
            <AlertDescription>
              Votre lien est desactive. Votre @username est reserve jusqu'au{" "}
              {formatDate(subscription.grace_period_ends_at)}. Renouvelez pour le reactiver.
            </AlertDescription>
          </Alert>
        )}

        {/* Main content: Features + QR Code side by side */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left side: Features and pricing */}
          <div className="flex-1 space-y-4">
            {/* Current username display */}
            {username && (
              <div className="rounded-lg bg-white border border-slate-200 p-3">
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                  Votre lien
                </div>
                <div className={`font-mono text-lg ${isGracePeriod ? "text-slate-400 line-through" : "text-primary"}`}>
                  book.sam.ma/<span className="font-bold">@{username}</span>
                </div>
              </div>
            )}

            <Separator />

            {/* Features list */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-700">Inclus dans l'abonnement :</div>
              <ul className="space-y-1.5">
                {FEATURES.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <Separator />

            {/* Pricing */}
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold text-slate-900">
                  {formatMoney(priceHT, "MAD")}
                  <span className="text-sm font-normal text-slate-500"> HT/an</span>
                </div>
                <div className="text-sm text-slate-500">
                  {formatMoney(priceTTC, "MAD")} TTC (TVA 20%)
                </div>
              </div>
              <div className="text-sm text-slate-500">
                soit {formatMoney(Math.round(priceHT / 12), "MAD")}/mois
              </div>
            </div>
          </div>

          {/* Right side: QR Code preview */}
          <div className="flex flex-col items-center gap-3 lg:w-48">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Apercu QR Code
            </div>
            <div className={`relative rounded-xl border-2 ${canDownloadQr ? "border-primary/30 bg-white" : "border-slate-200 bg-slate-50"} p-3`}>
              <img
                src={qrCodeUrl}
                alt="QR Code preview"
                className={`w-32 h-32 ${!canDownloadQr ? "opacity-40 blur-[2px]" : ""}`}
              />
              {/* Lock overlay when not subscribed */}
              {!canDownloadQr && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 rounded-xl">
                  <Lock className="w-8 h-8 text-slate-400 mb-1" />
                  <span className="text-xs text-slate-500 font-medium text-center px-2">
                    Activez l'essai
                  </span>
                </div>
              )}
            </div>
            <div className="text-center">
              <div className="font-mono text-xs text-slate-500 truncate max-w-[180px]">
                book.sam.ma/@{previewUsername}
              </div>
            </div>
            {/* Download button - only visible when subscription active */}
            {canDownloadQr && username && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={handleDownloadQr}
              >
                <Download className="w-4 h-4" />
                Telecharger
              </Button>
            )}
            {!canDownloadQr && (
              <div className="text-[10px] text-slate-400 text-center">
                Telechargement disponible apres activation
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 pt-2 border-t">
          {canStartTrial && (
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={handleStartTrial}
              disabled={startingTrial}
            >
              {startingTrial ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Demarrer l'essai gratuit (14 jours)
            </Button>
          )}

          {(isTrialActive || hasNoSubscription) && offer && (
            <Button
              variant={canStartTrial ? "outline" : "default"}
              size="lg"
              className="w-full gap-2"
              onClick={handleAddToCart}
            >
              {isTrialActive ? "Passer a l'abonnement annuel" : "Souscrire maintenant"}
            </Button>
          )}

          {(isSubscriptionActive || isGracePeriod) && offer && (
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={handleAddToCart}
            >
              {isGracePeriod ? "Reactiver mon abonnement" : "Renouveler"}
            </Button>
          )}

          {username && (isSubscriptionActive || isTrialActive) && (
            <Button variant="outline" size="sm" asChild className="w-full gap-2">
              <Link to={`/pro/establishments/${establishmentId}`}>
                <ExternalLink className="w-4 h-4" />
                Gerer mon lien et QR code
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
