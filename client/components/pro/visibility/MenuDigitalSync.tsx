/**
 * MenuDigitalSync Component
 *
 * Displays the active menu digital subscription status,
 * allows sync and provides a link to the QR code menu.
 * Only shown when the user has an active subscription.
 */

import { useState, useEffect } from "react";
import {
  QrCode,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Copy,
  Crown,
  Calendar,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

import { proApiFetch } from "@/lib/pro/api";

type MenuDigitalStatus = {
  enabled: boolean;
  plan: "silver" | "premium" | null;
  expiresAt: string | null;
  isExpired: boolean;
  lastSync: string | null;
  slug: string | null;
  username: string | null;
  menuUrl: string | null;
  stats: {
    categories: number;
    items: number;
  };
};

type Props = {
  establishmentId: string;
  establishmentName: string;
};

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  silver: { label: "Silver", color: "bg-slate-400" },
  premium: { label: "Premium", color: "bg-amber-500" },
};

const SILVER_FEATURES = [
  "Menu digital consultatif",
  "QR Code par table",
  "Bouton « Appel serveur »",
  "Bouton « Demande d'addition »",
  "Avis express clients",
];

const PREMIUM_FEATURES = [
  "Tout ce qui est inclus dans Silver",
  "Menu digital interactif",
  "Commande à table",
  "Suivi des commandes en temps réel",
  "Paiements & encaissements",
  "Reporting et statistiques",
  "Chat avec SAM",
  "Support prioritaire",
];

async function getMenuDigitalStatus(establishmentId: string): Promise<MenuDigitalStatus> {
  const res = await proApiFetch(`/api/pro/establishments/${establishmentId}/menu-digital/status`);
  if (!res || !res.ok) throw new Error("Impossible de charger le statut");
  return res.status;
}

async function syncMenuDigital(establishmentId: string): Promise<{ stats: { categoriesSynced: number; itemsSynced: number } }> {
  const res = await proApiFetch(`/api/pro/establishments/${establishmentId}/menu-digital/sync`, {
    method: "POST",
  });
  if (!res || !res.ok) throw new Error(res?.error || "Erreur lors de la synchronisation");
  return { stats: res.stats };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getDaysRemaining(expiresAt: string): number {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffTime = expiry.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function MenuDigitalSync({ establishmentId, establishmentName }: Props) {
  const { toast } = useToast();

  const [status, setStatus] = useState<MenuDigitalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMenuDigitalStatus(establishmentId);
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, [establishmentId]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncMenuDigital(establishmentId);
      toast({
        title: "Synchronisation terminée",
        description: `${result.stats.categoriesSynced} catégories et ${result.stats.itemsSynced} articles synchronisés.`,
      });
      await loadStatus();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur lors de la synchronisation",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const copyMenuUrl = () => {
    if (status?.menuUrl) {
      navigator.clipboard.writeText(status.menuUrl);
      toast({
        title: "Lien copié",
        description: "Le lien du menu a été copié dans le presse-papiers.",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Chargement...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-red-600">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status?.enabled) {
    return null;
  }

  const planInfo = status.plan ? PLAN_LABELS[status.plan] : null;
  const features = status.plan === "premium" ? PREMIUM_FEATURES : SILVER_FEATURES;
  const daysRemaining = status.expiresAt ? getDaysRemaining(status.expiresAt) : null;
  const isExpiringSoon = daysRemaining !== null && daysRemaining <= 30 && daysRemaining > 0;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <QrCode className="w-4 h-4 text-primary" />
            Menu Digital QR Code
          </CardTitle>
          <div className="flex items-center gap-2">
            {planInfo && (
              <Badge className={`${planInfo.color} text-white`}>
                <Crown className="w-3 h-3 mr-1" />
                {planInfo.label}
              </Badge>
            )}
            <Badge variant="default" className="bg-emerald-500">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Activé
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Expiration warning */}
        {status.isExpired && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-700">
              <strong>Abonnement expiré.</strong> Votre menu n'est plus accessible. Renouvelez votre abonnement pour le réactiver.
            </div>
          </div>
        )}

        {isExpiringSoon && !status.isExpired && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-700">
              <strong>Attention :</strong> Votre abonnement expire dans {daysRemaining} jour{daysRemaining > 1 ? "s" : ""}.
              Pensez à le renouveler pour éviter toute interruption de service.
            </div>
          </div>
        )}

        {/* Subscription info */}
        {status.expiresAt && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="w-4 h-4" />
            <span>
              {status.isExpired ? "Expiré le" : "Valide jusqu'au"}{" "}
              <strong>{formatDate(status.expiresAt)}</strong>
            </span>
          </div>
        )}

        {/* Menu URL */}
        {status.menuUrl && !status.isExpired && (
          <div className="bg-primary/5 rounded-lg p-4 space-y-3">
            <div className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Lien du menu
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-white px-3 py-2 rounded border truncate">
                {status.menuUrl}
              </code>
              <Button size="icon" variant="outline" onClick={copyMenuUrl}>
                <Copy className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="outline" asChild>
                <a href={status.menuUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-primary">
              {status.stats.categories}
            </div>
            <div className="text-xs text-slate-600">Catégories</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-primary">
              {status.stats.items}
            </div>
            <div className="text-xs text-slate-600">Articles</div>
          </div>
        </div>

        {/* Features included */}
        <div className="bg-slate-50 rounded-lg p-4 space-y-2">
          <div className="font-medium text-sm">
            Fonctionnalités incluses ({planInfo?.label || "Plan"}) :
          </div>
          <ul className="text-xs text-slate-600 space-y-1">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Last sync */}
        {status.lastSync && (
          <div className="text-xs text-slate-500 text-center">
            Dernière synchronisation :{" "}
            {new Date(status.lastSync).toLocaleString("fr-FR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </div>
        )}

        {/* Actions */}
        {!status.isExpired && (
          <Button
            variant="outline"
            className="w-full"
            disabled={syncing}
            onClick={handleSync}
          >
            {syncing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Synchronisation...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Synchroniser le menu
              </>
            )}
          </Button>
        )}

        <div className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded p-2">
          <strong>Conseil :</strong> Modifiez votre menu dans l'onglet{" "}
          <strong>Inventaire</strong> puis cliquez sur "Synchroniser" pour
          mettre à jour le menu digital.
        </div>
      </CardContent>
    </Card>
  );
}
