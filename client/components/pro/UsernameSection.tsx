import { useCallback, useEffect, useState } from "react";
import { Check, Clock, Copy, Download, ExternalLink, Loader2, QrCode, Send, Share2, X, AlertTriangle, Sparkles, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import {
  checkUsernameAvailability,
  getEstablishmentUsername,
  submitUsernameRequest,
  cancelUsernameRequest,
  startUsernameTrial,
  type UsernameInfo,
  type UsernameSubscription,
} from "@/lib/pro/api";

type Props = {
  establishmentId: string;
  canEdit: boolean;
};

const DEBOUNCE_MS = 400;

export function UsernameSection({ establishmentId, canEdit }: Props) {
  const [loading, setLoading] = useState(true);
  const [usernameInfo, setUsernameInfo] = useState<UsernameInfo | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ available: boolean; error?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [startingTrial, setStartingTrial] = useState(false);

  // Subscription helpers
  const subscription = usernameInfo?.subscription;
  const canUseUsername = usernameInfo?.canUseUsername ?? false;
  const isTrialActive = subscription?.status === "trial" && subscription.can_use_username;
  const isSubscriptionActive = subscription?.status === "active" && subscription.can_use_username;
  const isGracePeriod = subscription?.status === "grace_period";
  const isExpired = !subscription || subscription.status === "expired" || (!subscription.can_use_username && subscription.status !== "grace_period");

  // Check if can start trial (no previous trial)
  const canStartTrial = !subscription && !usernameInfo?.username;

  // Load username info
  const loadUsernameInfo = useCallback(async () => {
    try {
      setLoading(true);
      const info = await getEstablishmentUsername(establishmentId);
      setUsernameInfo(info);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    loadUsernameInfo();
  }, [loadUsernameInfo]);

  // Debounced username availability check
  useEffect(() => {
    if (!inputValue || inputValue.length < 3) {
      setCheckResult(null);
      return;
    }

    const normalized = inputValue.toLowerCase().trim();
    const timeoutId = setTimeout(async () => {
      setChecking(true);
      try {
        const result = await checkUsernameAvailability(normalized);
        setCheckResult(result);
      } catch {
        setCheckResult({ available: false, error: "Erreur de vérification" });
      } finally {
        setChecking(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [inputValue]);

  const handleSubmit = async () => {
    if (!inputValue || !checkResult?.available) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await submitUsernameRequest({
        establishmentId,
        username: inputValue.toLowerCase().trim(),
      });
      setSuccess(result.message);
      setInputValue("");
      setCheckResult(null);
      await loadUsernameInfo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!usernameInfo?.pendingRequest) return;

    setCancelling(true);
    setError(null);

    try {
      await cancelUsernameRequest({
        establishmentId,
        requestId: usernameInfo.pendingRequest.id,
      });
      await loadUsernameInfo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'annulation");
    } finally {
      setCancelling(false);
    }
  };

  const handleStartTrial = async () => {
    setStartingTrial(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await startUsernameTrial(establishmentId);
      setSuccess(result.message);
      await loadUsernameInfo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'activation de l'essai");
    } finally {
      setStartingTrial(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const { toast } = useToast();
  // Use book.sam.ma for direct booking (no commission)
  const bookingBaseUrl = "book.sam.ma/";
  // Also keep sam.ma for the profile link
  const profileBaseUrl = "sam.ma/@";
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);

  // Generate QR code when username is available
  useEffect(() => {
    if (usernameInfo?.username) {
      const bookingUrl = `https://${bookingBaseUrl}${usernameInfo.username}`;
      QRCode.toDataURL(bookingUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then(setQrCodeUrl)
        .catch(() => setQrCodeUrl(null));
    }
  }, [usernameInfo?.username]);

  const downloadQrCode = async () => {
    if (!qrCodeUrl || !usernameInfo?.username) return;

    const link = document.createElement("a");
    link.download = `qr-code-${usernameInfo.username}.png`;
    link.href = qrCodeUrl;
    link.click();

    toast({
      title: "QR Code telecharge",
      description: "Le QR code a ete enregistre dans vos telechargements.",
    });
  };

  if (loading) {
    return (
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <SectionHeader
            title="Nom d'utilisateur"
            description="Chargement..."
            titleClassName="text-sm"
          />
        </CardHeader>
        <CardContent className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <SectionHeader
          title="Nom d'utilisateur"
          description="Un lien court et mémorable pour votre établissement."
          titleClassName="text-sm"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Subscription status banner */}
        {subscription && (
          <div className="mb-4">
            {isTrialActive && subscription.days_remaining !== undefined && (
              <Alert className="border-blue-200 bg-blue-50">
                <AlertTitle className="text-blue-800">Essai gratuit actif</AlertTitle>
                <AlertDescription className="text-blue-700">
                  <span className="font-medium">{subscription.days_remaining} jours restants</span> - Jusqu'au{" "}
                  {subscription.trial_ends_at && new Date(subscription.trial_ends_at).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                  }).replace(/\//g, "/") + "."}
                  <Link to="/pro/visibility" className="ml-2 underline hover:no-underline">
                    Passer a l'abonnement annuel
                  </Link>
                </AlertDescription>
              </Alert>
            )}

            {isSubscriptionActive && subscription.days_remaining !== undefined && subscription.days_remaining <= 30 && (
              <Alert className="border-amber-200 bg-amber-50">
                <Calendar className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">Abonnement bientot expire</AlertTitle>
                <AlertDescription className="text-amber-700">
                  <span className="font-medium">{subscription.days_remaining} jours restants</span> - Expire le{" "}
                  {subscription.expires_at && new Date(subscription.expires_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                  })}
                  <Link to="/pro/visibility" className="ml-2 underline hover:no-underline">
                    Renouveler
                  </Link>
                </AlertDescription>
              </Alert>
            )}

            {isGracePeriod && (
              <Alert variant="destructive" className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Abonnement expire</AlertTitle>
                <AlertDescription>
                  Votre lien est desactive mais votre @username est reserve jusqu'au{" "}
                  {subscription.grace_period_ends_at && new Date(subscription.grace_period_ends_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                  })}
                  <Link to="/pro/visibility" className="ml-2 underline hover:no-underline text-red-100">
                    Renouveler maintenant
                  </Link>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* No subscription - show trial CTA */}
        {!subscription && canEdit && (
          <div className="rounded-xl border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 via-white to-primary/10 p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 rounded-lg p-2 shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <h4 className="font-semibold text-slate-900 text-sm leading-tight">
                Lien booking personnalisé
              </h4>
            </div>

            {/* Description */}
            <p className="text-sm text-slate-600">
              Obtenez <span className="font-mono text-primary font-medium">book.sam.ma/@votrenom</span> et recevez des reservations <strong className="text-slate-800">sans commission</strong>.
            </p>

            {/* Buttons */}
            <div className="flex flex-col gap-2">
              <Button
                className="w-full gap-2 shadow-sm"
                onClick={handleStartTrial}
                disabled={startingTrial}
              >
                {startingTrial ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Essai gratuit 14 jours
              </Button>
              <Button variant="outline" asChild className="w-full bg-white/80 hover:bg-white">
                <Link to="/pro/visibility">
                  Voir les offres
                </Link>
              </Button>
            </div>

            {/* Price info */}
            <p className="text-xs text-slate-500 text-center">
              2 400 DH HT/an apres l'essai • Sans engagement
            </p>
          </div>
        )}

        {/* Current username display - only show if subscription is active */}
        {usernameInfo?.username && canUseUsername && (
          <div className="space-y-3">
            {/* Direct booking link (no commission) */}
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Lien de reservation directe
              <Badge variant="outline" className="ml-2 text-green-700 border-green-200 bg-green-50 text-[10px]">
                Sans commission
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 font-mono text-sm text-emerald-800">
                {bookingBaseUrl}
                <span className="font-bold">{usernameInfo.username}</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        window.open(`https://${bookingBaseUrl}${usernameInfo.username}`, "_blank");
                      }}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ouvrir le lien</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Share section */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-3">
              <p className="text-sm text-slate-700">
                Partagez ce lien avec vos clients ! Les reservations via ce lien sont <strong>sans commission</strong>.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={async () => {
                    const shareUrl = `https://${bookingBaseUrl}${usernameInfo.username}`;
                    const shareData = {
                      title: "Reservez chez nous",
                      text: "Reservez directement via notre lien personnalise",
                      url: shareUrl,
                    };

                    // Try Web Share API first (native sharing on mobile/desktop)
                    if (navigator.share && navigator.canShare?.(shareData)) {
                      try {
                        await navigator.share(shareData);
                        return;
                      } catch (err) {
                        // User cancelled or share failed, fall through to clipboard
                        if ((err as Error).name === "AbortError") return;
                      }
                    }

                    // Fallback: copy to clipboard
                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      toast({
                        title: "Lien copie !",
                        description: "Le lien a ete copie dans le presse-papier.",
                      });
                    } catch {
                      toast({
                        title: "Erreur",
                        description: "Impossible de copier le lien.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <Share2 className="w-4 h-4" />
                  Partager
                </Button>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={async () => {
                          const shareUrl = `https://${bookingBaseUrl}${usernameInfo.username}`;
                          try {
                            await navigator.clipboard.writeText(shareUrl);
                            toast({
                              title: "Lien copie !",
                              description: "Le lien a ete copie dans le presse-papier.",
                            });
                          } catch {
                            toast({
                              title: "Erreur",
                              description: "Impossible de copier le lien.",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copier le lien</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {/* QR Code button */}
                <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="icon">
                      <QrCode className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>QR Code de reservation</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-4 py-4">
                      {qrCodeUrl ? (
                        <>
                          <img
                            src={qrCodeUrl}
                            alt={`QR Code pour ${usernameInfo.username}`}
                            className="w-64 h-64 border border-slate-200 rounded-lg"
                          />
                          <p className="text-sm text-slate-600 text-center">
                            Scannez ce QR code pour acceder a la page de reservation
                          </p>
                          <div className="font-mono text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded">
                            {bookingBaseUrl}{usernameInfo.username}
                          </div>
                          <Button onClick={downloadQrCode} className="gap-2">
                            <Download className="w-4 h-4" />
                            Telecharger le QR Code
                          </Button>
                        </>
                      ) : (
                        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {usernameInfo.usernameChangedAt && (
              <div className="text-xs text-slate-500">
                Défini le {formatDate(usernameInfo.usernameChangedAt)}
              </div>
            )}
          </div>
        )}

        {/* Username display during grace period (disabled) */}
        {usernameInfo?.username && isGracePeriod && (
          <div className="space-y-3 opacity-60">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Lien de reservation (desactive)
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm text-slate-500 line-through">
                {bookingBaseUrl}
                <span className="font-bold">{usernameInfo.username}</span>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Votre @username est reserve. Renouvelez votre abonnement pour reactiver le lien.
            </p>
          </div>
        )}

        {/* Pending request */}
        {usernameInfo?.pendingRequest && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                <Clock className="w-3 h-3 mr-1" />
                En attente de validation
              </Badge>
            </div>
            <div className="text-sm text-amber-900">
              Demande pour <span className="font-mono font-bold">{bookingBaseUrl}{usernameInfo.pendingRequest.requested_username}</span>
            </div>
            <div className="text-xs text-amber-700">
              Demandé le {formatDate(usernameInfo.pendingRequest.created_at)}
            </div>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={cancelling}
                className="mt-2"
              >
                {cancelling ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <X className="w-4 h-4 mr-2" />
                )}
                Annuler la demande
              </Button>
            )}
          </div>
        )}

        {/* Cooldown notice */}
        {!usernameInfo?.canChange && usernameInfo?.nextChangeDate && !usernameInfo.pendingRequest && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4" />
              <span className="font-medium">Modification verrouillée</span>
            </div>
            <div className="text-xs text-slate-600">
              Vous pourrez modifier votre nom d'utilisateur à partir du {formatDate(usernameInfo.nextChangeDate)}.
              Le nom d'utilisateur ne peut être modifié que tous les {usernameInfo.cooldownDays} jours.
            </div>
          </div>
        )}

        {/* Input form (only if can edit, can change, and has active subscription) */}
        {canEdit && usernameInfo?.canChange && !usernameInfo.pendingRequest && canUseUsername && (
          <div className="space-y-3">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              {usernameInfo.username ? "Changer le nom d'utilisateur" : "Choisir un nom d'utilisateur"}
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <span className="text-sm text-slate-700 font-mono">{bookingBaseUrl}<span className="text-primary">votre_nom</span></span>
              </div>
              <Input
                type="text"
                placeholder=""
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""))}
                className="pl-[10.5rem] font-mono text-primary"
                maxLength={30}
              />
              {checking && (
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                </div>
              )}
              {!checking && checkResult && inputValue.length >= 3 && (
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  {checkResult.available ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <X className="w-4 h-4 text-red-500" />
                  )}
                </div>
              )}
            </div>

            {/* Availability feedback */}
            {inputValue.length >= 3 && checkResult && (
              <div className={`text-xs ${checkResult.available ? "text-emerald-600" : "text-red-600"}`}>
                {checkResult.available ? (
                  <span className="flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    {bookingBaseUrl}{inputValue} est disponible
                  </span>
                ) : (
                  checkResult.error || "Non disponible"
                )}
              </div>
            )}

            {inputValue.length > 0 && inputValue.length < 3 && (
              <div className="text-xs text-slate-500">
                Minimum 3 caractères
              </div>
            )}

            {/* Rules reminder */}
            <div className="text-xs text-slate-500 space-y-1">
              <div>• Lettres minuscules, chiffres, points et underscores uniquement</div>
              <div>• Commence par une lettre</div>
              <div>• Non modifiable pendant {usernameInfo?.cooldownDays || 180} jours après validation</div>
            </div>

            <Button
              className="bg-primary text-white hover:bg-primary/90 font-bold gap-2 w-full"
              disabled={!inputValue || inputValue.length < 3 || !checkResult?.available || submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Soumettre en modération
            </Button>
          </div>
        )}

        {/* Error / Success messages */}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
            {error}
          </div>
        )}
        {success && (
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
            {success}
          </div>
        )}

        {!canEdit && (
          <div className="text-sm text-slate-600">
            Votre rôle ne permet pas de modifier le nom d'utilisateur.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
