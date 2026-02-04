import { Check, UtensilsCrossed, Crown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/money";
import type { VisibilityOffer } from "@/lib/pro/api";

type BillingCycle = "monthly" | "annual";
type MenuTier = "silver" | "premium";

type Props = {
  offers: VisibilityOffer[];
  billingCycle: BillingCycle;
  onBillingCycleChange: (next: BillingCycle) => void;
  onAddToCart: (offerId: string) => void;
};

const TIER_CONFIG: Record<MenuTier, {
  icon: typeof UtensilsCrossed;
  title: string;
  description: string;
  badgeText: string;
  badgeClass: string;
  cardClass: string;
  features: string[];
}> = {
  silver: {
    icon: UtensilsCrossed,
    title: "Menu Digital Silver",
    description: "Menu consultatif pour digitaliser votre carte",
    badgeText: "Consultatif",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    cardClass: "border-slate-200 bg-gradient-to-br from-white to-slate-50",
    features: [
      "Menu digital consultatif (sans commande)",
      "QR Code par table",
      "Bouton « Appel serveur »",
      "Bouton « Demande d'addition »",
      "Avis express clients",
      "Gestion des avis depuis l'Espace Pro",
      "Codes promo & remises",
      "Support standard",
    ],
  },
  premium: {
    icon: Crown,
    title: "Menu Digital Premium",
    description: "Menu interactif avec commande et pilotage complet",
    badgeText: "Interactif",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    cardClass: "border-amber-200 bg-gradient-to-br from-white to-amber-50/50",
    features: [
      "Tout ce qui est inclus dans l'offre Silver",
      "Menu digital interactif avec commande",
      "Suivi des commandes en temps réel",
      "Gestion avancée des tables et QR codes",
      "Paiements & suivi des encaissements",
      "Reporting et statistiques détaillées",
      "Historique des commandes",
      "Chat avec SAM (assistant intelligent)",
      "Support prioritaire",
    ],
  },
};

function normalize(str: string | null | undefined) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function parseTier(offer: VisibilityOffer): MenuTier | null {
  const s = `${offer.title ?? ""} ${offer.description ?? ""}`;
  const n = normalize(s);
  if (n.includes("silver")) return "silver";
  if (n.includes("premium")) return "premium";
  return null;
}

function parseBillingCycle(offer: VisibilityOffer): BillingCycle {
  const days = offer.duration_days ?? null;
  if (days && days >= 365) return "annual";
  return "monthly";
}

function getMenuDigitalOffer(offers: VisibilityOffer[], tier: MenuTier, cycle: BillingCycle): VisibilityOffer | null {
  for (const o of offers) {
    if (parseTier(o) !== tier) continue;
    if (parseBillingCycle(o) !== cycle) continue;
    return o;
  }
  return null;
}

function getDisplayPriceCents(offer: VisibilityOffer | null, tier: MenuTier, cycle: BillingCycle) {
  if (!offer) return null;

  // Business requirement: annual prices are rounded for display.
  if (cycle === "annual") {
    if (tier === "silver") return 200000;
    if (tier === "premium") return 500000;
  }

  return offer.price_cents;
}

function PlanCard({
  tier,
  offer,
  billingCycle,
  onAddToCart,
}: {
  tier: MenuTier;
  offer: VisibilityOffer | null;
  billingCycle: BillingCycle;
  onAddToCart: (offerId: string) => void;
}) {
  const config = TIER_CONFIG[tier];
  const Icon = config.icon;
  const displayPriceCents = getDisplayPriceCents(offer, tier, billingCycle);
  const isActive = Boolean(offer?.is_active);

  // Calculate TTC (with 20% VAT)
  const taxRateBps = offer?.tax_rate_bps ?? 2000;
  const taxAmount = displayPriceCents ? Math.round((displayPriceCents * taxRateBps) / 10000) : 0;
  const priceTTC = displayPriceCents ? displayPriceCents + taxAmount : null;

  // Monthly equivalent for annual
  const monthlyEquivalent = displayPriceCents && billingCycle === "annual"
    ? Math.round(displayPriceCents / 12)
    : null;

  return (
    <Card className={`flex flex-col h-full ${config.cardClass}`}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Icon className={`w-5 h-5 ${tier === "premium" ? "text-amber-600" : "text-slate-600"}`} />
              <CardTitle className="text-lg">{config.title}</CardTitle>
            </div>
            <CardDescription>{config.description}</CardDescription>
          </div>
          <Badge className={config.badgeClass}>
            {config.badgeText}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 flex flex-col">
        {/* Features list */}
        <div className="space-y-2 flex-1">
          <div className="text-sm font-medium text-slate-700">Inclus :</div>
          <ul className="space-y-1.5">
            {config.features.map((feature, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${tier === "premium" ? "text-amber-600" : "text-green-600"}`} />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <Separator />

        {/* Pricing */}
        <div className="flex items-end justify-between">
          <div>
            {displayPriceCents != null ? (
              <>
                <div className="text-2xl font-bold text-slate-900">
                  {formatMoney(displayPriceCents, offer?.currency ?? "MAD")}
                  <span className="text-sm font-normal text-slate-500"> HT/{billingCycle === "annual" ? "an" : "mois"}</span>
                </div>
                {priceTTC && (
                  <div className="text-sm text-slate-500">
                    {formatMoney(priceTTC, offer?.currency ?? "MAD")} TTC (TVA 20%)
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-slate-500">Non disponible</div>
            )}
          </div>
          {monthlyEquivalent && (
            <div className="text-sm text-slate-500">
              soit {formatMoney(monthlyEquivalent, offer?.currency ?? "MAD")}/mois
            </div>
          )}
        </div>

        {/* Action button */}
        <Button
          size="lg"
          className={`w-full ${tier === "premium" ? "bg-amber-600 hover:bg-amber-700" : ""}`}
          disabled={!offer || !isActive}
          onClick={() => offer && onAddToCart(offer.id)}
        >
          Ajouter au panier
        </Button>
      </CardContent>
    </Card>
  );
}

export function MenuDigitalPlans({ offers, billingCycle, onBillingCycleChange, onAddToCart }: Props) {
  const silver = getMenuDigitalOffer(offers, "silver", billingCycle);
  const premium = getMenuDigitalOffer(offers, "premium", billingCycle);

  return (
    <div className="space-y-4">
      {/* Header with billing toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Menu Digital</h3>
          <p className="text-sm text-slate-600">Digitalisez votre carte et améliorez l'expérience client</p>
        </div>

        <ToggleGroup
          type="single"
          value={billingCycle}
          onValueChange={(v) => {
            if (v === "monthly" || v === "annual") onBillingCycleChange(v);
          }}
          className="rounded-full border border-slate-200 bg-slate-50 p-1 gap-1"
        >
          <ToggleGroupItem
            value="annual"
            className="rounded-full px-3 sm:px-4 whitespace-nowrap data-[state=on]:bg-white data-[state=on]:shadow-sm data-[state=on]:text-slate-900"
          >
            <span className="mr-2">Annuel</span>
            <span className="text-emerald-700 text-xs">-17%</span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="monthly"
            className="rounded-full px-3 sm:px-4 whitespace-nowrap data-[state=on]:bg-white data-[state=on]:shadow-sm data-[state=on]:text-slate-900"
          >
            Mensuel
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlanCard tier="silver" offer={silver} billingCycle={billingCycle} onAddToCart={onAddToCart} />
        <PlanCard tier="premium" offer={premium} billingCycle={billingCycle} onAddToCart={onAddToCart} />
      </div>

      <p className="text-xs text-slate-500">
        Les prix affichés sont HT. Pour l'abonnement annuel, économisez 17% par rapport au mensuel.
      </p>
    </div>
  );
}
