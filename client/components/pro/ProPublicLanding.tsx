import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";


export type ProPublicSection = "pricing" | "features" | "demo";

function SectionTabs({ section }: { section: ProPublicSection }) {
  const items: { key: ProPublicSection; label: string }[] = [
    { key: "pricing", label: "Tarifs & offres" },
    { key: "features", label: "Fonctionnalités" },
    { key: "demo", label: "Demander une démo" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const active = it.key === section;
        return (
          <Link
            key={it.key}
            to={`/pro?section=${encodeURIComponent(it.key)}`}
            className={
              active
                ? "px-3 py-2 rounded-full bg-primary text-white text-sm font-bold"
                : "px-3 py-2 rounded-full bg-slate-100 text-slate-800 text-sm font-semibold hover:bg-slate-200"
            }
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}

function FeatureItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5">
        <CheckCircle2 className="w-5 h-5 text-primary" />
      </div>
      <div>
        <div className="font-bold text-slate-900">{title}</div>
        <div className="text-sm text-slate-600">{description}</div>
      </div>
    </div>
  );
}

function PricingCards() {
  const cards = [
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((c) => (
        <Card key={c.title} className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">{c.title}</CardTitle>
            <CardDescription>{c.desc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {c.bullets.map((b) => (
              <div key={b} className="flex items-center gap-2 text-sm text-slate-700">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                {b}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FeaturesList() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Réservations & no-show</CardTitle>
          <CardDescription>Gérez les confirmations, annulations et no-show en un clic.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FeatureItem title="Tableau de réservations" description="Liste claire avec statut, paiement, check-in." />
          <FeatureItem title="Acompte" description="Encaissez un acompte sur les réservations importantes." />
          <FeatureItem title="Anti no-show" description="Réduisez les absences grâce aux rappels et au dépôt." />
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Packs & deals</CardTitle>
          <CardDescription>Créez des offres et des créneaux pour maximiser le remplissage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FeatureItem title="Créneaux" description="Capacité, prix, promo par créneau." />
          <FeatureItem title="Packs" description="Offres packagées pour attirer plus de clients." />
          <FeatureItem title="Suivi" description="Mesurez les ventes, acomptes et performance." />
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Statistiques</CardTitle>
          <CardDescription>Suivez vos performances et votre chiffre généré.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FeatureItem title="Visites de fiche" description="Comprenez l’intérêt pour votre établissement." />
          <FeatureItem title="Réservations" description="Aujourd’hui / semaine / mois." />
          <FeatureItem title="CA & commissions" description="Gardez un œil sur les montants générés." />
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Gestion d’équipe</CardTitle>
          <CardDescription>Donnez l’accès à votre équipe avec des rôles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FeatureItem title="Comptes éditeur" description="Créez des accès pour l’édition de la fiche et les opérations." />
          <FeatureItem title="Rôles" description="Owner, Manager, Réception, Comptable, Marketing." />
          <FeatureItem title="Sécurité" description="Permissions adaptées selon le rôle." />
        </CardContent>
      </Card>
    </div>
  );
}

type DemoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function DemoRequestDialog({ open, onOpenChange }: DemoDialogProps) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    company: "",
    city: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = useMemo(() => {
    const emailOk = form.email.trim().includes("@");
    const nameOk = form.fullName.trim().length >= 2;
    const companyOk = form.company.trim().length >= 2;
    return emailOk && nameOk && companyOk && !submitting;
  }, [form, submitting]);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/leads/pro-demo", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          full_name: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          company: form.company.trim(),
          city: form.city.trim() || null,
          message: form.message.trim() || null,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = payload && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      setDone(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Une erreur est survenue";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setDone(false);
          setError(null);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Demander une démo</DialogTitle>
          <DialogDescription>Donnez-nous vos informations, on vous recontacte rapidement.</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <div className="font-bold">Merci !</div>
            <div className="text-sm">Votre demande a bien été envoyée. Un membre de l’équipe vous contactera.</div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom complet</Label>
                <Input value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Établissement / enseigne</Label>
                <Input value={form.company} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ville</Label>
              <Input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Message (optionnel)</Label>
              <Textarea value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} className="min-h-[120px]" />
            </div>

            {error ? <div className="text-sm text-red-600">{error}</div> : null}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={() => onOpenChange(false)} className="bg-primary text-white hover:bg-primary/90 font-bold">
              Fermer
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={!canSubmit}
              className="bg-primary text-white hover:bg-primary/90 font-bold"
            >
              {submitting ? "Envoi…" : "Envoyer"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProPublicLanding({ section }: { section: ProPublicSection }) {
  const [demoOpen, setDemoOpen] = useState(section === "demo");

  useEffect(() => {
    setDemoOpen(section === "demo");
  }, [section]);

  return (
    <main className="container mx-auto px-4 py-10 md:py-14">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col gap-4">
          <div className="inline-flex items-center gap-2 text-primary font-bold">
            <Sparkles className="w-4 h-4" />
            Professionnels
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900">Gérez votre établissement, vos réservations et votre facturation</h1>
          <p className="text-slate-600 max-w-2xl">
            Un tableau de bord pro pensé pour gagner du temps: fiche, réservations, acomptes, packs et statistiques.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link to="/pro?mode=signup">
              <Button className="bg-primary text-white hover:bg-primary/90 font-bold gap-2">
                Créer un compte pro <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/pro?mode=signin">
              <Button variant="outline" className="font-bold">
                Connexion
              </Button>
            </Link>
          </div>
        </div>

        <SectionTabs section={section} />

        {section === "pricing" ? <PricingCards /> : null}
        {section === "features" ? <FeaturesList /> : null}

        {section === "demo" ? (
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base">Une démo adaptée à votre établissement</CardTitle>
              <CardDescription>On vous montre les fonctionnalités utiles à votre activité.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600">
                Durée: 15–20 min · Réservations, no-show, acomptes, packs, stats.
              </div>
              <Button className="bg-primary text-white hover:bg-primary/90 font-bold" onClick={() => setDemoOpen(true)}>
                Ouvrir le formulaire
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Déjà client ?</CardTitle>
            <CardDescription>Accédez à votre tableau de bord PRO.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/pro?mode=signin">
              <Button variant="outline" className="font-bold">
                Connexion au tableau de bord
              </Button>
            </Link>
          </CardContent>
        </Card>

        <DemoRequestDialog open={demoOpen} onOpenChange={setDemoOpen} />
      </div>
    </main>
  );
}
