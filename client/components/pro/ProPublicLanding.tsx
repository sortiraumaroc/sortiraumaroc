import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { DemoRequestDialog } from "@/components/DemoRequestDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProPublicSection = "pricing" | "features" | "demo";

type BillingPeriod = "quarterly" | "annual";

type PlanFeature = {
  label: string;
  included: boolean;
  detail?: string;
};

type Plan = {
  id: string;
  name: string;
  badge?: string;
  highlighted?: boolean;
  pricing: {
    quarterly: { amount: number; label: string };
    annual: { amount: number; label: string };
  };
  features: PlanFeature[];
  cta: string;
  ctaHref: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCENT = "#F5A623";
const ACCENT_HOVER = "#e8944f";

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    pricing: {
      quarterly: { amount: 0, label: "0 DH / trimestre" },
      annual: { amount: 0, label: "0 DH / an" },
    },
    features: [
      { label: "Gestion Multi-store", included: true },
      { label: "Présence", included: true },
      { label: "Photos", included: true, detail: "4" },
      { label: "Accès gestionnaire", included: true },
      { label: "Messagerie privée", included: true },
      { label: "Réservation", included: false },
      { label: "Menu digital", included: false },
      { label: "QR offert", included: false },
      { label: "Commande à table", included: false },
      { label: "Fidélité", included: false },
      { label: "Mini-site web", included: false },
      { label: "Marque blanche", included: false },
      { label: "Support", included: true, detail: "Email" },
    ],
    cta: "Démarrer gratuitement",
    ctaHref: "/pro?mode=signup",
  },
  {
    id: "premium",
    name: "Premium",
    badge: "Le plus populaire",
    highlighted: true,
    pricing: {
      quarterly: { amount: 1200, label: "1 200 DH / trimestre" },
      annual: { amount: 3840, label: "3 840 DH / an" },
    },
    features: [
      { label: "Gestion Multi-store", included: true },
      { label: "Présence", included: true },
      { label: "Photos", included: true, detail: "12" },
      { label: "Accès gestionnaire", included: true },
      { label: "Messagerie privée", included: true },
      { label: "Réservation", included: true },
      { label: "Menu digital", included: true },
      { label: "QR offert", included: true },
      { label: "Commande à table", included: true },
      { label: "Fidélité", included: true },
      { label: "Mini-site web", included: true },
      { label: "Marque blanche", included: false },
      { label: "Support", included: true, detail: "WhatsApp & téléphone" },
    ],
    cta: "Choisir Premium",
    ctaHref: "/pro?mode=signup&plan=premium",
  },
  {
    id: "platine",
    name: "Platine",
    pricing: {
      quarterly: { amount: 1800, label: "1 800 DH / trimestre" },
      annual: { amount: 5760, label: "5 760 DH / an" },
    },
    features: [
      { label: "Gestion Multi-store", included: true, detail: "Illimité" },
      { label: "Présence", included: true },
      { label: "Photos", included: true, detail: "Illimitées" },
      { label: "Accès gestionnaire", included: true },
      { label: "Messagerie privée", included: true },
      { label: "Réservation", included: true },
      { label: "Menu digital", included: true },
      { label: "QR offert", included: true },
      { label: "Commande à table", included: true },
      { label: "Fidélité", included: true },
      { label: "Mini-site web", included: true },
      { label: "Marque blanche", included: true },
      { label: "Promotion réseaux", included: true, detail: "Tarif préférentiel" },
      { label: "Support", included: true, detail: "Commercial attitré" },
    ],
    cta: "Choisir Platine",
    ctaHref: "/pro?mode=signup&plan=platine",
  },
];

const FAQ_ITEMS = [
  {
    question: "Comment fonctionne la facturation ?",
    answer:
      "La facturation se fait au trimestre ou à l'année, selon votre choix. Vous recevez une facture par email et pouvez payer par virement ou carte bancaire. L'abonnement annuel vous permet d'économiser 20 % par rapport au trimestriel.",
  },
  {
    question: "La commission sur les réservations est-elle vraiment fixe ?",
    answer:
      "Oui. La commission appliquée sur les réservations est fixe et transparente. Pas de frais cachés ni de pourcentage variable selon le montant.",
  },
  {
    question: "Puis-je passer à l'offre supérieure facilement ?",
    answer:
      "Absolument. Vous pouvez upgrader à tout moment depuis votre tableau de bord. La différence de tarif est calculée au prorata de la période restante.",
  },
  {
    question: "Y a-t-il un engagement minimum ?",
    answer:
      "Non. Vous pouvez résilier à tout moment. Les abonnements sont renouvelés automatiquement mais peuvent être annulés avant la date de renouvellement.",
  },
  {
    question: "Qu'en est-il de la sécurité de mes données ?",
    answer:
      "Vos données sont hébergées sur des serveurs sécurisés. Nous utilisons le chiffrement SSL, des sauvegardes quotidiennes et respectons les normes de protection des données.",
  },
];

const FEATURE_CARDS = [
  {
    title: "Menu digital",
    desc: "Un menu moderne, facile à partager et toujours à jour.",
    bullets: ["QR code", "Photos & descriptions", "Mise à jour instantanée"],
  },
  {
    title: "Plateforme de réservation",
    desc: "Automatisez les réservations, réduisez les no-show et encaissez des acomptes.",
    bullets: ["Gestion des créneaux", "Acompte / paiement", "Historique & export"],
  },
  {
    title: "Offres médias",
    desc: "Boostez votre visibilité sur Sortir Au Maroc.",
    bullets: ["Mise en avant", "Campagnes", "Deals & packs"],
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionTabs({
  activeSection,
  onDemoOpen,
}: {
  activeSection: ProPublicSection;
  onDemoOpen: () => void;
}) {
  const items: { key: ProPublicSection; label: string; targetId: string }[] = [
    { key: "pricing", label: "Tarifs & offres", targetId: "pricing" },
    { key: "features", label: "Fonctionnalités", targetId: "features" },
    { key: "demo", label: "Demander une démo", targetId: "" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const active = it.key === activeSection;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => {
              if (it.key === "demo") {
                onDemoOpen();
                return;
              }
              window.history.replaceState(null, "", `/pro?section=${it.key}`);
              const el = document.getElementById(it.targetId);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-semibold transition-colors",
              active
                ? `bg-[${ACCENT}] text-white`
                : "bg-slate-100 text-slate-800 hover:bg-slate-200",
            )}
            style={active ? { backgroundColor: ACCENT } : undefined}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function HeroSection({
  section,
  onDemoOpen,
}: {
  section: ProPublicSection;
  onDemoOpen: () => void;
}) {
  return (
    <section>
      <div
        className="inline-flex items-center gap-2 font-bold mb-4"
        style={{ color: ACCENT }}
      >
        <Sparkles className="w-4 h-4" />
        Professionnels
      </div>
      <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#1A1A1A] mb-4 leading-tight">
        Gérez votre établissement, vos réservations et votre facturation
      </h1>
      <p className="text-slate-600 max-w-2xl mb-6 text-base md:text-lg">
        Un tableau de bord pro pensé pour gagner du temps : fiche, réservations,
        acomptes, packs et statistiques.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <Link to="/pro?mode=signup">
          <Button
            className="font-bold gap-2 h-11 px-6 rounded-xl text-white"
            style={{ backgroundColor: ACCENT }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = ACCENT_HOVER)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = ACCENT)
            }
          >
            Créer un compte pro <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
        <Link to="/pro?mode=signin">
          <Button
            variant="outline"
            className="font-bold h-11 px-6 rounded-xl border-slate-300"
          >
            Connexion
          </Button>
        </Link>
      </div>
      <SectionTabs activeSection={section} onDemoOpen={onDemoOpen} />
    </section>
  );
}

function FeatureCardsSection() {
  return (
    <section id="features" className="scroll-mt-24">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {FEATURE_CARDS.map((c) => (
          <Card
            key={c.title}
            className="border-slate-200 rounded-2xl hover:shadow-lg transition-shadow duration-200"
          >
            <CardHeader>
              <CardTitle className="text-base text-[#1A1A1A]">
                {c.title}
              </CardTitle>
              <CardDescription>{c.desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {c.bullets.map((b) => (
                <div
                  key={b}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: ACCENT }}
                  />
                  {b}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function PlanFeatureRow({ feature }: { feature: PlanFeature }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      {feature.included ? (
        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
      ) : (
        <X className="w-4 h-4 text-slate-300 shrink-0" />
      )}
      <span className={feature.included ? "text-slate-700" : "text-slate-400"}>
        {feature.label}
        {feature.detail && (
          <span className="text-slate-500 ml-1">({feature.detail})</span>
        )}
      </span>
    </div>
  );
}

function AnimatedPrice({ amount, label }: { amount: number; label: string }) {
  const [animate, setAnimate] = useState(false);
  const prevRef = useRef(amount);

  useEffect(() => {
    if (prevRef.current !== amount) {
      setAnimate(true);
      prevRef.current = amount;
      const timer = setTimeout(() => setAnimate(false), 300);
      return () => clearTimeout(timer);
    }
  }, [amount]);

  return (
    <div
      className={cn(
        "transition-all duration-300 mt-4",
        animate
          ? "opacity-0 -translate-y-2"
          : "opacity-100 translate-y-0",
      )}
    >
      <span className="text-4xl font-extrabold text-[#1A1A1A]">
        {amount === 0
          ? "Gratuit"
          : `${amount.toLocaleString("fr-MA")} DH`}
      </span>
      {amount > 0 && (
        <span className="text-sm text-slate-500 block mt-1">{label}</span>
      )}
      {amount === 0 && (
        <span className="text-sm text-slate-500 block mt-1">Pour toujours</span>
      )}
    </div>
  );
}

function PlanCard({ plan, period }: { plan: Plan; period: BillingPeriod }) {
  const pricing = plan.pricing[period];

  return (
    <Card
      className={cn(
        "rounded-2xl border transition-all duration-200 hover:shadow-xl relative",
        plan.highlighted
          ? "border-[#F5A623] bg-gradient-to-b from-[#FEF9EE] to-white shadow-lg md:scale-105 z-10 ring-2 ring-[#F5A623] md:ring-0"
          : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
          <Badge
            className="border-0 shadow-sm px-3 py-1 text-xs text-white whitespace-nowrap"
            style={{ backgroundColor: ACCENT }}
          >
            {plan.badge}
          </Badge>
        </div>
      )}
      <CardHeader className="text-center pt-8 pb-4">
        <CardTitle className="text-xl font-bold text-[#1A1A1A]">
          {plan.name}
        </CardTitle>
        <AnimatedPrice amount={pricing.amount} label={pricing.label} />
      </CardHeader>
      <CardContent className="space-y-3 pb-6">
        {plan.features.map((f) => (
          <PlanFeatureRow key={f.label} feature={f} />
        ))}
      </CardContent>
      <div className="p-6 pt-0">
        <Link to={plan.ctaHref} className="block">
          <Button
            className={cn(
              "w-full font-bold h-11 rounded-xl transition-colors",
              plan.highlighted
                ? "text-white"
                : "bg-white text-[#1A1A1A] border border-slate-300 hover:bg-slate-50",
            )}
            style={
              plan.highlighted
                ? { backgroundColor: ACCENT }
                : undefined
            }
            onMouseEnter={(e) => {
              if (plan.highlighted)
                e.currentTarget.style.backgroundColor = ACCENT_HOVER;
            }}
            onMouseLeave={(e) => {
              if (plan.highlighted)
                e.currentTarget.style.backgroundColor = ACCENT;
            }}
          >
            {plan.cta}
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function PricingToggle({
  period,
  onChange,
}: {
  period: BillingPeriod;
  onChange: (p: BillingPeriod) => void;
}) {
  return (
    <div className="inline-flex items-center gap-3">
      <span
        className={cn(
          "text-sm font-semibold transition-colors",
          period === "quarterly" ? "text-[#1A1A1A]" : "text-slate-400",
        )}
      >
        Trimestriel
      </span>
      <Switch
        checked={period === "annual"}
        onCheckedChange={(checked) =>
          onChange(checked ? "annual" : "quarterly")
        }
        className="data-[state=checked]:bg-[#F5A623]"
      />
      <span
        className={cn(
          "text-sm font-semibold transition-colors",
          period === "annual" ? "text-[#1A1A1A]" : "text-slate-400",
        )}
      >
        Annuel
      </span>
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs hover:bg-emerald-100">
        -20%
      </Badge>
    </div>
  );
}

function PricingSection() {
  const [period, setPeriod] = useState<BillingPeriod>("quarterly");

  return (
    <section id="pricing" className="scroll-mt-24">
      <div className="text-center mb-10">
        <h2 className="text-2xl md:text-3xl font-extrabold text-[#1A1A1A] mb-3">
          Tarifs & offres
        </h2>
        <p className="text-slate-600 max-w-xl mx-auto mb-6">
          Des plans adaptés à chaque établissement
        </p>
        <PricingToggle period={period} onChange={setPeriod} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start md:pt-4">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} period={period} />
        ))}
      </div>
    </section>
  );
}

function AlreadyClientSection() {
  return (
    <section>
      <Card className="border-slate-200 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base text-[#1A1A1A]">
            Déjà client ?
          </CardTitle>
          <CardDescription>
            Accédez à votre tableau de bord PRO.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/pro?mode=signin">
            <Button
              variant="outline"
              className="font-bold rounded-xl border-slate-300"
            >
              Connexion au tableau de bord
            </Button>
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}

function FAQSection() {
  return (
    <section id="faq" className="scroll-mt-24">
      <h2 className="text-2xl md:text-3xl font-extrabold text-[#1A1A1A] text-center mb-8">
        Questions fréquentes
      </h2>
      <div className="max-w-2xl mx-auto">
        <Accordion type="single" collapsible>
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem
              key={i}
              value={`faq-${i}`}
              className="border-slate-200"
            >
              <AccordionTrigger className="text-left font-semibold text-[#1A1A1A] hover:no-underline">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-slate-600 leading-relaxed">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}


// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export function ProPublicLanding({ section }: { section: ProPublicSection }) {
  const [demoOpen, setDemoOpen] = useState(section === "demo");

  useEffect(() => {
    if (section === "demo") setDemoOpen(true);
  }, [section]);

  useEffect(() => {
    if (section !== "demo" && section !== "pricing") {
      const el = document.getElementById(section);
      if (el) {
        setTimeout(
          () => el.scrollIntoView({ behavior: "smooth", block: "start" }),
          100,
        );
      }
    }
  }, [section]);

  return (
    <main className="bg-white">
      <div className="container mx-auto px-4 py-10 md:py-14">
        <div className="max-w-5xl mx-auto space-y-16">
          <HeroSection
            section={section}
            onDemoOpen={() => setDemoOpen(true)}
          />
          <FeatureCardsSection />
          <PricingSection />
          <AlreadyClientSection />
          <FAQSection />
        </div>
      </div>
      <DemoRequestDialog open={demoOpen} onOpenChange={setDemoOpen} />
    </main>
  );
}
