import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

const DEFAULT_FEATURES: Record<MenuTier, string[]> = {
  silver: [
    "Menu digital consultatif (sans commande)",
    "QR Code par table",
    "Bouton « Appel serveur »",
    "Bouton « Demande d’addition »",
    "Avis express clients",
    "Gestion des avis depuis l’Espace Pro",
    "Accès à l’Espace Pro",
    "Mise en place rapide",
    "Codes promo & remises",
    "Support standard",
  ],
  premium: [
    "Tout ce qui est inclus dans l’offre SILVER",
    "Menu digital interactif",
    "Commande à table",
    "Suivi des commandes en temps réel",
    "Gestion avancée des tables et QR codes",
    "Paiements & suivi des encaissements",
    "Reporting et statistiques (ventes, périodes, performances)",
    "Historique des commandes",
    "Paramétrage avancé de l’établissement",
    "Accès prioritaire aux nouvelles fonctionnalités",
    "Chat avec SAM (assistant intelligent côté client)",
    "Support prioritaire",
  ],
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

function PlanCard({ tier, offer, billingCycle, onAddToCart }: { tier: MenuTier; offer: VisibilityOffer | null; billingCycle: BillingCycle; onAddToCart: (offerId: string) => void }) {
  const isSilver = tier === "silver";
  const title = isSilver ? "OFFRE SILVER — Menu digital consultatif" : "OFFRE PREMIUM — Menu digital interactif & pilotage";

  const features = DEFAULT_FEATURES[tier] ?? [];
  const durationLabel = billingCycle === "annual" ? "1 an" : "1 mois";
  const labelBilling = billingCycle === "annual" ? "Paiement annuel (-17%)" : "Paiement mensuel";
  const displayPriceCents = getDisplayPriceCents(offer, tier, billingCycle);

  const isActive = Boolean(offer?.is_active);

  return (
    <Card className="border-slate-200 flex flex-col h-full">
      <CardHeader className="pb-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-5">{title}</div>
            <div className="text-xs text-slate-600">Abonnement Menu Digital · {labelBilling}</div>
          </div>
        </div>
        <div className="text-xs text-slate-600">Durée : {durationLabel}</div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        <ul className="text-xs text-slate-700 list-disc pl-4 space-y-1 flex-1">
          {features.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>

        <div className="pt-1">
          {displayPriceCents != null ? (
            <div className="text-lg font-extrabold tabular-nums">
              {formatMoney(displayPriceCents, offer?.currency ?? "MAD")} <span className="text-xs font-semibold text-slate-600">HT</span>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Non disponible</div>
          )}
        </div>

        <Button
          size="sm"
          className="w-full bg-primary text-white hover:bg-primary/90 mt-auto"
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
    <div className="space-y-3">
      <div className="-mx-6 px-6 py-3 rounded-md bg-rose-50 border border-rose-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-semibold">Menu Digital (abonnements)</div>
          <div className="text-xs text-slate-600">Consultatif (Silver) vs Interactif (Premium) · Prix HT</div>
        </div>

        <div className="flex items-center justify-start md:justify-end">
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
              <span className="text-emerald-700 hidden sm:inline">Économisez 17 %</span>
              <span className="text-emerald-700 sm:hidden">-17%</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="monthly"
              className="rounded-full px-3 sm:px-4 whitespace-nowrap data-[state=on]:bg-white data-[state=on]:shadow-sm data-[state=on]:text-slate-900"
            >
              Mensuel
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlanCard tier="silver" offer={silver} billingCycle={billingCycle} onAddToCart={onAddToCart} />
        <PlanCard tier="premium" offer={premium} billingCycle={billingCycle} onAddToCart={onAddToCart} />
      </div>

      <div className="text-xs text-slate-500">
        Les prix affichés sont HT. Pour l’annuel, les montants sont arrondis à 2 000 MAD (Silver) et 5 000 MAD (Premium).
      </div>
    </div>
  );
}
