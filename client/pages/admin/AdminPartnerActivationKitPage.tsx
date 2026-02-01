import { useMemo } from "react";

import { Copy, Megaphone } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Textarea } from "@/components/ui/textarea";

import { toast } from "@/hooks/use-toast";

async function copyToClipboard(text: string) {
  const value = String(text ?? "").trim();
  if (!value) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }

    toast({ title: "Copié", description: "Texte copié dans le presse-papiers" });
  } catch {
    toast({ title: "Impossible", description: "Copie non autorisée sur ce navigateur." });
  }
}

function SectionCard(props: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title={props.title} description={props.description} />
      </CardHeader>
      <CardContent className="space-y-3">{props.children}</CardContent>
    </Card>
  );
}

function CopyBlock(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-500">{props.label}</div>
          <div className="mt-1 text-sm text-slate-900 whitespace-pre-wrap">{props.value}</div>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void copyToClipboard(props.value)}>
          <Copy className="h-4 w-4" />
          Copier
        </Button>
      </div>
    </div>
  );
}

export function AdminPartnerActivationKitPage() {
  const pitch30s =
    "Le no-show vous coûte des créneaux et du chiffre. Sortir Au Maroc protège automatiquement les réservations à risque avec un mécanisme de garantie, sans sanction manuelle et sans complexité pour vous. On mesure l’impact : baisse du no-show et davantage de créneaux sécurisés. Résultat : plus de sérénité sur votre planning.";

  const pitch2min = useMemo(() => {
    return [
      "1) Problème : le no-show est imprévisible, il fait perdre des créneaux, du chiffre, et de la sérénité.",
      "2) Solution : Sortir Au Maroc active une protection sur les cas à risque, automatiquement, sans sanction manuelle.",
      "3) Preuve : avant/après, créneaux protégés, comparaison protégés vs non protégés, et tendance 12 semaines.",
      "4) Bénéfice : moins de pertes, plus de confiance, un cadre clair et accepté.",
      "5) Réassurance : pas de ‘punition’ arbitraire, pas de détail technique exposé, pas de note client affichée.",
    ].join("\n");
  }, []);

  const objections = useMemo(
    () =>
      [
        {
          q: "Pourquoi moi ?",
          a: "Parce que la protection s’active quand le risque est plus élevé. L’objectif est de sécuriser vos créneaux, pas de stigmatiser. Vous bénéficiez directement d’une réduction de pertes.",
        },
        {
          q: "C’est punitif pour mes clients.",
          a: "Non. C’est une protection proportionnée : elle ne s’applique pas à tout le monde et elle est expliquée au client avec pédagogie. L’objectif est d’éviter que quelques no-shows pénalisent l’ensemble.",
        },
        {
          q: "Et si mes clients se plaignent ?",
          a: "On garde un texte simple : ‘c’est une garantie de créneau, pas une sanction’. Vous avez une preuve de valeur et le support dispose d’un script aligné.",
        },
        {
          q: "Je ne veux pas de complexité.",
          a: "C’est automatique. Vous voyez simplement les résultats et un résumé mensuel. Aucune action quotidienne requise.",
        },
        {
          q: "Est-ce que vous notez mes clients ?",
          a: "On n’expose aucune note individuelle, ni détail client. On applique une logique de protection et on mesure l’impact global.",
        },
      ],
    [],
  );

  const inAppMessage = useMemo(
    () =>
      [
        "Titre : Nouveau : protection de vos créneaux",
        "Texte : Sortir Au Maroc protège désormais une partie de vos réservations contre les no-shows. Vous pouvez voir l’impact (tendance 12 semaines, avant/après, protégés vs non protégés) dans votre espace Pro.",
      ].join("\n"),
    [],
  );

  const emailSubject = "Vos créneaux sont mieux protégés sur Sortir Au Maroc";
  const emailBody = useMemo(() => {
    return [
      "Bonjour,",
      "",
      "Le no-show peut vous faire perdre des créneaux et du chiffre. Sortir Au Maroc protège désormais une partie des réservations à risque, de manière automatique.",
      "",
      "Ce que cela vous apporte :",
      "- une baisse du no-show (comparaison avant/après)",
      "- des créneaux ‘protégés’ (garantie) pour sécuriser votre planning",
      "- une tendance 12 semaines pour suivre l’évolution",
      "",
      "Vous pouvez consulter votre impact directement dans votre espace Pro.",
      "",
      "Cordialement,",
      "L’équipe Sortir Au Maroc",
    ].join("\n");
  }, []);

  const badgeText = "Créneau protégé par Sortir Au Maroc";

  const badgeMeaning = "Certaines réservations sont sécurisées par une garantie pour limiter les no-shows.";
  const badgeNotMeaning = "Aucune sanction manuelle, pas de pénalisation arbitraire, pas de note client affichée.";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Kit Activation Partenaire"
        description="Éléments de langage prêts à l’emploi (vente & onboarding). Aucun argument de prix."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-primary/10 text-primary border-primary/20">Phase 7</Badge>
        <Badge className="bg-slate-100 text-slate-700 border-slate-200">Sans monétisation</Badge>
        <Badge className="bg-slate-100 text-slate-700 border-slate-200">Sans nouveaux KPI produit</Badge>
        <Badge className="bg-slate-100 text-slate-700 border-slate-200">Sans nouveaux events</Badge>
      </div>

      <SectionCard
        title="Discours commercial"
        description="Scripts structurés : problème → solution → preuve → bénéfice."
      >
        <CopyBlock label="Pitch (30 secondes)" value={pitch30s} />
        <CopyBlock label="Pitch (2 minutes)" value={pitch2min} />
      </SectionCard>

      <SectionCard
        title="Objections & réponses"
        description="Réponses types alignées avec la posture non punitive."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {objections.map((o) => (
            <div key={o.q} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm font-extrabold text-slate-900">{o.q}</div>
              <div className="mt-1 text-sm text-slate-700">{o.a}</div>
              <div className="mt-3">
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void copyToClipboard(`Objection: ${o.q}\nRéponse: ${o.a}`)}>
                  <Copy className="h-4 w-4" />
                  Copier
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Activation partenaires existants"
        description="Messages prêts (in-app + email). À déployer via les canaux existants, sans nouveau tracking."
      >
        <CopyBlock label="Message in-app (copiable)" value={inAppMessage} />

        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-slate-700" />
            <div className="text-sm font-extrabold text-slate-900">Email partenaire (copiable)</div>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-500">Objet</div>
            <div className="flex gap-2">
              <Textarea value={emailSubject} readOnly className="min-h-[48px]" />
              <Button type="button" variant="outline" className="gap-2" onClick={() => void copyToClipboard(emailSubject)}>
                <Copy className="h-4 w-4" />
                Copier
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-500">Corps</div>
            <div className="flex gap-2">
              <Textarea value={emailBody} readOnly className="min-h-[180px]" />
              <Button type="button" variant="outline" className="gap-2" onClick={() => void copyToClipboard(emailBody)}>
                <Copy className="h-4 w-4" />
                Copier
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Signal de crédibilité (badge)"
        description="Mention sobre, non trompeuse."
      >
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Badge</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge className="bg-amber-50 text-amber-800 border-amber-200">{badgeText}</Badge>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void copyToClipboard(badgeText)}>
              <Copy className="h-4 w-4" />
              Copier
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-extrabold text-slate-900">Ce que ça signifie</div>
              <div className="mt-1 text-sm text-slate-700">{badgeMeaning}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-extrabold text-slate-900">Ce que ça ne signifie pas</div>
              <div className="mt-1 text-sm text-slate-700">{badgeNotMeaning}</div>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
