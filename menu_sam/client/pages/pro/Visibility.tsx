import * as React from "react";
import { Link } from "react-router-dom";

import { ProShell } from "@/components/pro/pro-shell";
import { useProSession } from "@/components/pro/use-pro-session";
import { useProPlace } from "@/contexts/pro-place-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  Check,
  X,
  Loader2,
  Phone,
  Mail,
  ArrowRight,
  Star,
  Shield,
  Zap,
  CalendarCheck,
  CreditCard,
  BarChart3,
  UtensilsCrossed,
  QrCode,
  MessageCircle,
  Bell,
  Tags,
  Receipt,
  Settings,
  HelpCircle,
} from "lucide-react";

/* ───── types ───── */

type PlanFeature = {
  label: string;
  silver: boolean;
  premium: boolean;
};

/* ───── static data ───── */

const FEATURES: PlanFeature[] = [
  { label: "Menu digital illimité", silver: true, premium: true },
  { label: "QR codes par table", silver: true, premium: true },
  { label: "Appels serveur & addition", silver: true, premium: true },
  { label: "Avis Express (collecte d'avis)", silver: true, premium: true },
  { label: "Commande à table", silver: false, premium: true },
  { label: "Gestion des paiements", silver: false, premium: true },
  { label: "Codes promo", silver: false, premium: true },
  { label: "Fonctionnalités avancées", silver: false, premium: true },
];

const FAQ_ITEMS = [
  {
    q: "Puis-je changer de plan à tout moment ?",
    a: "Oui. Vous pouvez passer du plan Silver au Premium à tout moment. La différence est calculée au prorata de la période restante.",
  },
  {
    q: "Que se passe-t-il à la fin de mon abonnement ?",
    a: "Votre menu reste visible en lecture seule. Vous conservez l'accès aux avis, mais vous ne pouvez plus modifier la carte ni gérer les commandes.",
  },
  {
    q: "Y a-t-il un engagement ?",
    a: "Non. Les abonnements sont annuels sans engagement. Vous n'êtes pas renouvelé automatiquement.",
  },
  {
    q: "Comment fonctionne le lien book.sam.ma ?",
    a: "Avec l'option Nom d'utilisateur, vous obtenez un lien personnalisé book.sam.ma/@votrenom pour recevoir des réservations sans commission. L'essai gratuit de 14 jours est inclus.",
  },
];

/* ───── component ───── */

export default function ProVisibility() {
  const { state, signOut } = useProSession();
  const { selectedPlaceId } = useProPlace();
  const email = state.status === "signedIn" ? state.email : null;

  const [subscriptionInfo, setSubscriptionInfo] = React.useState<{
    plan: string | null;
    status: string;
    daysRemaining: number | null;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!selectedPlaceId) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/mysql/subscription/${selectedPlaceId}/status`);
        if (res.ok) {
          const data = await res.json();
          setSubscriptionInfo({
            plan: data.plan ?? null,
            status: data.status ?? "none",
            daysRemaining: data.daysRemaining ?? null,
          });
        }
      } catch {
        // Silently fail — page still useful without subscription info
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedPlaceId]);

  const currentPlan = subscriptionInfo?.plan ?? null;
  const isActive = subscriptionInfo?.status === "active";

  return (
    <ProShell
      title="Offres & Tarifs"
      subtitle={email ? `Connecté : ${email}` : undefined}
      onSignOut={() => void signOut()}
    >
      <div className="w-full space-y-8">
        {/* ── Hero section ── */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-black tracking-tight">
            Choisissez l'offre adaptée à votre établissement
          </h2>
          <p className="text-sm text-black/60 max-w-lg mx-auto">
            Digitalisez votre carte, gérez vos commandes et boostez votre visibilité. Sans engagement.
          </p>
        </div>

        {/* ── Current plan banner ── */}
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-black/40" />
          </div>
        ) : isActive && currentPlan ? (
          <div className="rounded-2xl border border-black/10 bg-gradient-to-r from-black/[0.02] to-transparent p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sam-red/10">
                  <Shield className="h-5 w-5 text-sam-red" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-black">
                    Plan actuel : {currentPlan === "premium" ? "Premium" : "Silver"}
                  </div>
                  {subscriptionInfo?.daysRemaining != null && (
                    <div className="text-xs text-black/60">
                      {subscriptionInfo.daysRemaining} jours restants
                    </div>
                  )}
                </div>
              </div>
              {currentPlan === "silver" && (
                <Badge className="bg-sam-red/10 text-sam-red border-sam-red/20 text-xs">
                  Passez à Premium
                </Badge>
              )}
            </div>
          </div>
        ) : null}

        {/* ── Pricing cards ── */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Silver card */}
          <div
            className={cn(
              "rounded-2xl border bg-white p-5 shadow-sm flex flex-col",
              currentPlan === "silver" && isActive
                ? "border-black/20 ring-1 ring-black/10"
                : "border-black/10",
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-black">Silver</h3>
                <p className="text-xs text-black/60 mt-0.5">L'essentiel pour démarrer</p>
              </div>
              {currentPlan === "silver" && isActive && (
                <Badge variant="outline" className="text-xs border-black/20 text-black/70">
                  Plan actuel
                </Badge>
              )}
            </div>

            <div className="mt-4">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-black">1 200</span>
                <span className="text-sm text-black/60">DH HT/an</span>
              </div>
              <p className="text-xs text-black/50 mt-1">Soit 100 DH HT/mois</p>
            </div>

            <div className="mt-5 h-px bg-black/10" />

            <ul className="mt-5 space-y-3 flex-1">
              {FEATURES.map((f) => (
                <li key={f.label} className="flex items-start gap-2.5">
                  {f.silver ? (
                    <Check className="h-4 w-4 text-sam-red shrink-0 mt-0.5" />
                  ) : (
                    <X className="h-4 w-4 text-black/20 shrink-0 mt-0.5" />
                  )}
                  <span className={cn("text-sm", f.silver ? "text-black" : "text-black/40")}>
                    {f.label}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6">
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl border-black/15 text-black hover:bg-black/5 font-medium"
                disabled={currentPlan === "silver" && isActive}
              >
                {currentPlan === "silver" && isActive ? "Plan actuel" : "Choisir Silver"}
              </Button>
            </div>
          </div>

          {/* Premium card */}
          <div
            className={cn(
              "rounded-2xl border bg-white p-5 shadow-sm flex flex-col relative overflow-hidden",
              currentPlan === "premium" && isActive
                ? "border-sam-red/30 ring-1 ring-sam-red/20"
                : "border-sam-red/20",
            )}
          >
            {/* Popular badge */}
            <div className="absolute top-0 right-0">
              <div className="bg-sam-red text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                POPULAIRE
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-black">Premium</h3>
                <p className="text-xs text-black/60 mt-0.5">Tout inclus, sans limite</p>
              </div>
              {currentPlan === "premium" && isActive && (
                <Badge variant="outline" className="text-xs border-sam-red/20 text-sam-red">
                  Plan actuel
                </Badge>
              )}
            </div>

            <div className="mt-4">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-black">2 400</span>
                <span className="text-sm text-black/60">DH HT/an</span>
              </div>
              <p className="text-xs text-black/50 mt-1">Soit 200 DH HT/mois</p>
            </div>

            <div className="mt-5 h-px bg-black/10" />

            <ul className="mt-5 space-y-3 flex-1">
              {FEATURES.map((f) => (
                <li key={f.label} className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-sam-red shrink-0 mt-0.5" />
                  <span className="text-sm text-black">{f.label}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6">
              <Button
                className="w-full h-11 rounded-xl bg-sam-red text-white hover:bg-sam-red/90 font-medium"
                disabled={currentPlan === "premium" && isActive}
              >
                {currentPlan === "premium" && isActive ? "Plan actuel" : "Choisir Premium"}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Username / Booking add-on ── */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sam-red/10 shrink-0">
              <CalendarCheck className="h-5 w-5 text-sam-red" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-black">
                Lien de réservation personnalisé
              </h3>
              <p className="text-sm text-black/60 mt-1">
                Obtenez <span className="font-mono text-sam-red font-medium">book.sam.ma/@votrenom</span> et recevez des réservations directement, sans commission.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-black">2 400</span>
                  <span className="text-sm text-black/60">DH HT/an</span>
                </div>
                <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                  14 jours d'essai gratuit
                </Badge>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild className="h-10 rounded-xl bg-sam-red text-white hover:bg-sam-red/90 font-medium gap-2">
                  <Link to="/pro/settings">
                    <Settings className="h-4 w-4" />
                    Configurer dans Paramètres
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Feature comparison table ── */}
        <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-black/10">
            <h3 className="text-base font-bold text-black">Comparatif détaillé</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 bg-black/[0.02]">
                  <th className="text-left py-3 px-5 font-medium text-black/60">Fonctionnalité</th>
                  <th className="text-center py-3 px-4 font-medium text-black/60 w-28">Silver</th>
                  <th className="text-center py-3 px-4 font-medium text-sam-red w-28">Premium</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((f, i) => (
                  <tr
                    key={f.label}
                    className={cn(
                      "border-b border-black/5",
                      i % 2 === 0 ? "bg-white" : "bg-black/[0.01]",
                    )}
                  >
                    <td className="py-3 px-5 text-black">{f.label}</td>
                    <td className="py-3 px-4 text-center">
                      {f.silver ? (
                        <Check className="h-4 w-4 text-black/70 mx-auto" />
                      ) : (
                        <X className="h-4 w-4 text-black/20 mx-auto" />
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Check className="h-4 w-4 text-sam-red mx-auto" />
                    </td>
                  </tr>
                ))}
                <tr className="border-b border-black/5 bg-white">
                  <td className="py-3 px-5 text-black">Support prioritaire</td>
                  <td className="py-3 px-4 text-center">
                    <X className="h-4 w-4 text-black/20 mx-auto" />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Check className="h-4 w-4 text-sam-red mx-auto" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Why choose SAM ── */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-black mb-4">Pourquoi choisir SAM ?</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: <Zap className="h-5 w-5" />,
                title: "Mise en place rapide",
                desc: "Votre menu digital est prêt en quelques minutes. Importez votre carte et générez vos QR codes.",
              },
              {
                icon: <CreditCard className="h-5 w-5" />,
                title: "Sans commission",
                desc: "Aucune commission sur les commandes ou réservations. Vous gardez 100% de vos revenus.",
              },
              {
                icon: <Shield className="h-5 w-5" />,
                title: "Sans engagement",
                desc: "Abonnement annuel sans renouvellement automatique. Vous restez libre.",
              },
              {
                icon: <BarChart3 className="h-5 w-5" />,
                title: "Tableau de bord pro",
                desc: "Suivez vos commandes en temps réel, gérez vos tables et analysez votre activité.",
              },
              {
                icon: <MessageCircle className="h-5 w-5" />,
                title: "Avis clients",
                desc: "Collectez les avis de vos clients directement depuis le menu digital.",
              },
              {
                icon: <Star className="h-5 w-5" />,
                title: "Support dédié",
                desc: "Notre équipe vous accompagne dans la mise en place et l'utilisation de la plateforme.",
              },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/5 text-black shrink-0">
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-black">{item.title}</div>
                  <div className="text-xs text-black/60 mt-0.5">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── FAQ ── */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="h-5 w-5 text-black/60" />
            <h3 className="text-base font-bold text-black">Questions fréquentes</h3>
          </div>
          <div className="space-y-4">
            {FAQ_ITEMS.map((item) => (
              <div key={item.q} className="border-b border-black/5 pb-4 last:border-0 last:pb-0">
                <div className="text-sm font-semibold text-black">{item.q}</div>
                <div className="text-sm text-black/60 mt-1">{item.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Contact CTA ── */}
        <div className="rounded-2xl border border-black/10 bg-gradient-to-br from-black/[0.02] to-transparent p-5 shadow-sm text-center space-y-3">
          <h3 className="text-base font-bold text-black">
            Besoin d'aide pour choisir ?
          </h3>
          <p className="text-sm text-black/60 max-w-md mx-auto">
            Notre équipe est disponible pour répondre à toutes vos questions et vous accompagner dans le choix de votre offre.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button
              variant="outline"
              className="h-10 rounded-xl border-black/15 text-black hover:bg-black/5 gap-2"
              asChild
            >
              <a href="tel:+212600000000">
                <Phone className="h-4 w-4" />
                Nous appeler
              </a>
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-xl border-black/15 text-black hover:bg-black/5 gap-2"
              asChild
            >
              <a href="mailto:contact@sam.ma">
                <Mail className="h-4 w-4" />
                Nous écrire
              </a>
            </Button>
          </div>
        </div>
      </div>
    </ProShell>
  );
}
