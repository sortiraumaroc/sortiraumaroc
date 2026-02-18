import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Crown,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AddEstablishmentLeadForm } from "@/components/marketing/AddEstablishmentLeadForm";

const BRAND = {
  red: "#A3001D",
  gold: "#D4A75C",
  light: "#F5F5F5",
};

function scrollToId(id: string, behavior: ScrollBehavior = "smooth") {
  const el = document.getElementById(id);
  if (!el) return;

  // Compense le header sticky (h-16) + un peu d'air
  const offset = 88;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;

  window.scrollTo({ top: Math.max(0, top), behavior });
}

function SectionTitle(props: { kicker?: string; title: string; subtitle?: string; center?: boolean }) {
  return (
    <div className={cn("space-y-3", props.center ? "text-center" : "text-start")}>
      {props.kicker ? (
        <div className={cn("text-xs font-extrabold tracking-[0.2em] uppercase", props.center ? "justify-center" : "")}
          style={{ color: BRAND.gold }}
        >
          {props.kicker}
        </div>
      ) : null}
      <h2 className={cn("text-2xl md:text-3xl font-extrabold text-slate-950", props.center ? "mx-auto" : "")}>{props.title}</h2>
      {props.subtitle ? <p className={cn("text-sm md:text-base text-slate-600", props.center ? "mx-auto max-w-2xl" : "max-w-2xl")}>{props.subtitle}</p> : null}
    </div>
  );
}

function FloatingWhatsAppButton() {
  const href = useMemo(() => {
    const msg = encodeURIComponent("Bonjour Sortir Au Maroc, je souhaite ajouter mon établissement.");
    // Numéro à ajuster si besoin.
    return `https://wa.me/212600000000?text=${msg}`;
  }, []);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-5 end-5 z-50"
      aria-label="Contacter Sortir Au Maroc sur WhatsApp"
      title="WhatsApp"
    >
      <div
        className="h-12 w-12 rounded-full shadow-lg flex items-center justify-center border border-black/10 bg-white hover:shadow-xl transition"
        style={{ boxShadow: "0 12px 30px rgba(0,0,0,0.18)" }}
      >
        <MessageCircle className="h-6 w-6" style={{ color: BRAND.red }} />
      </div>
    </a>
  );
}

function CTAInline(props: { label?: string; to?: string }) {
  const to = props.to ?? "#form";

  if (to.startsWith("#")) {
    const id = to.slice(1);

    return (
      <Button
        asChild
        className="h-12 rounded-xl bg-primary text-white hover:bg-primary/90 font-extrabold px-5 transition-transform hover:scale-[1.01]"
      >
        <a
          href={to}
          onClick={(e) => {
            e.preventDefault();
            scrollToId(id, "smooth");
            window.history.pushState(
              null,
              "",
              `${window.location.pathname}${window.location.search}#${id}`,
            );
          }}
        >
          {props.label ?? "Ajouter mon établissement maintenant"}
          <ArrowRight className="ms-2 h-4 w-4" />
        </a>
      </Button>
    );
  }

  return (
    <Button
      asChild
      className="h-12 rounded-xl bg-primary text-white hover:bg-primary/90 font-extrabold px-5 transition-transform hover:scale-[1.01]"
    >
      <Link to={to}>
        {props.label ?? "Ajouter mon établissement maintenant"}
        <ArrowRight className="ms-2 h-4 w-4" />
      </Link>
    </Button>
  );
}

export default function AddEstablishment() {
  const location = useLocation();

  useEffect(() => {
    document.title = "Ajouter mon établissement – Sortir Au Maroc";
  }, []);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.replace(/^#/, "");
    if (!id) return;

    // Attendre le rendu avant de scroller (important quand on arrive depuis une autre page)
    requestAnimationFrame(() => {
      scrollToId(id, "smooth");
    });
  }, [location.hash]);

  return (
    <div style={{ fontFamily: "Poppins, Circular Std, Inter, system-ui, sans-serif" }}>
      <Header />
      <FloatingWhatsAppButton />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: `radial-gradient(900px 500px at 15% 25%, rgba(163,0,29,0.12), transparent 60%), radial-gradient(900px 500px at 80% 15%, rgba(212,167,92,0.18), transparent 55%)` }} />
        <div className="container mx-auto px-4 py-10 md:py-14 relative">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-start">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm">
                <Sparkles className="h-4 w-4" style={{ color: BRAND.gold }} />
                Visibilité + réservations toute l’année
              </div>

              <h1 className="text-3xl md:text-5xl font-extrabold leading-tight text-slate-950">
                Comment attirer plus de clients avec Sortir Au Maroc ?
              </h1>
              <p className="text-sm md:text-lg text-slate-600 max-w-2xl">
                Food, loisirs, sports, bien-être, tourisme. Devenez réservable et visible toute l’année.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <CTAInline />
                <Button asChild variant="outline" className="h-12 rounded-xl border-slate-300 font-bold hover:bg-slate-50">
                  <a
                    href="#avantages"
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToId("avantages", "smooth");
                      window.history.pushState(
                        null,
                        "",
                        `${window.location.pathname}${window.location.search}#avantages`,
                      );
                    }}
                  >
                    Découvrir les avantages
                  </a>
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                <Card className="p-4 border-slate-200 bg-white/70">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-5 w-5" style={{ color: BRAND.red }} />
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-slate-900">+ Visibilité</div>
                      <div className="text-xs text-slate-600">App, web, QR</div>
                    </div>
                  </div>
                </Card>
                <Card className="p-4 border-slate-200 bg-white/70">
                  <div className="flex items-center gap-3">
                    <CalendarCheck className="h-5 w-5" style={{ color: BRAND.red }} />
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-slate-900">+ Réservations</div>
                      <div className="text-xs text-slate-600">Confirmation rapide</div>
                    </div>
                  </div>
                </Card>
                <Card className="p-4 border-slate-200 bg-white/70">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5" style={{ color: BRAND.red }} />
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-slate-900">- No-show</div>
                      <div className="text-xs text-slate-600">Garantie & scoring</div>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="pt-2">
                <img
                  src="https://images.pexels.com/photos/3801649/pexels-photo-3801649.jpeg"
                  alt="Réservations et gestion client"
                  className="w-full max-w-2xl rounded-2xl border border-slate-200 shadow-sm object-cover aspect-[16/9]"
                />
              </div>
            </div>

            {/* Form */}
            <div id="form" className="scroll-mt-24 lg:sticky lg:top-24">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 md:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-slate-950">Ajouter mon établissement</div>
                    <div className="text-xs text-slate-600">Réponse rapide · sans engagement</div>
                  </div>
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center border border-slate-200" style={{ background: BRAND.light }}>
                    <QrCode className="h-5 w-5" style={{ color: BRAND.red }} />
                  </div>
                </div>

                <div className="mt-5">
                  <AddEstablishmentLeadForm />
                </div>
              </div>

              <div className="mt-4 rounded-2xl p-4 border border-slate-200 bg-white/70">
                <div className="flex items-center gap-3">
                  <Crown className="h-5 w-5" style={{ color: BRAND.gold }} />
                  <div className="text-xs text-slate-600">
                    Une équipe dédiée vous accompagne (mise en ligne, packs, QR, paramétrage des garanties).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className="border-t border-slate-200" style={{ background: BRAND.light }}>
        <div className="container mx-auto px-4 py-12 md:py-14">
          <SectionTitle
            kicker="Pourquoi Sortir Au Maroc"
            title="Tout pour convertir un visiteur en client"
            subtitle="Une structure simple : visibilité → réservation → confirmation → venue (ou garantie)."
          />

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[{
              title: "Devenez réservable en ligne",
              desc: "Bouton réserver, confirmation, suivi des statuts.",
              icon: CalendarCheck,
            },{
              title: "Visibilité réseaux",
              desc: "Instagram · TikTok · Facebook · Snapchat.",
              icon: Video,
            },{
              title: "QR Menu & recommandations",
              desc: "QR code, menu, upsell intelligent.",
              icon: QrCode,
            },{
              title: "Réduisez les no-show",
              desc: "Garantie, scoring fiabilité, règles automatiques.",
              icon: ShieldCheck,
            }].map((c) => (
              <Card key={c.title} className="p-5 border-slate-200 bg-white flex h-full flex-col">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(163,0,29,0.08)" }}>
                  <c.icon className="h-5 w-5" style={{ color: BRAND.red }} />
                </div>

                <div className="mt-4 flex-1">
                  <div className="min-h-[2.5rem] font-extrabold leading-snug text-slate-950">{c.title}</div>
                  <div className="mt-2 min-h-[2.5rem] text-sm leading-snug text-slate-600">{c.desc}</div>
                </div>

                <div className="mt-4">
                  <CTAInline label="Ajouter" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* AVANTAGES */}
      <section id="avantages" className="scroll-mt-24 border-t border-slate-200 bg-white">
        <div className="container mx-auto px-4 py-12 md:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <SectionTitle
                kicker="Avantages"
                title="Attirer + convertir + fidéliser"
                subtitle="Une présence multi-canal pensée pour l’année : app, WhatsApp, site, QR et confirmations." />

              <div className="space-y-3">
                {[
                  "Présence sur app + WhatsApp + site + QR",
                  "Formulaire → réservation → confirmation",
                  "Assistance & accompagnement",
                  "Tableaux de bord, statuts et relances",
                ].map((t) => (
                  <div key={t} className="flex items-start gap-3">
                    <BadgeCheck className="h-5 w-5 mt-0.5" style={{ color: BRAND.gold }} />
                    <div className="text-sm text-slate-700">{t}</div>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <CTAInline label="Commencer maintenant" />
              </div>
            </div>

            <div className="space-y-4">
              <img
                src="https://images.pexels.com/photos/35392570/pexels-photo-35392570.jpeg"
                alt="QR code et réservation"
                className="w-full rounded-2xl border border-slate-200 shadow-sm object-cover aspect-[16/10]"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="p-5 border-slate-200">
                  <div className="text-xs font-extrabold" style={{ color: BRAND.gold }}>Workflow clair</div>
                  <div className="mt-2 text-sm font-extrabold text-slate-950">Réservation → Confirmation</div>
                  <div className="mt-1 text-xs text-slate-600">Statuts + messages + check-in.</div>
                </Card>
                <Card className="p-5 border-slate-200">
                  <div className="text-xs font-extrabold" style={{ color: BRAND.gold }}>Anti no-show</div>
                  <div className="mt-2 text-sm font-extrabold text-slate-950">Garantie si besoin</div>
                  <div className="mt-1 text-xs text-slate-600">Scoring fiabilité et règles.</div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="border-t border-slate-200" style={{ background: BRAND.light }}>
        <div className="container mx-auto px-4 py-12 md:py-14">
          <SectionTitle
            kicker="Preuve sociale"
            title="Des établissements variés nous font confiance"
            subtitle="Food, loisirs, sports, bien-être, tourisme : une vision annuelle et durable." />

          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {["Food", "Loisirs", "Bien-être", "Sports", "Tourisme", "Expériences"].map((x) => (
              <div key={x} className="rounded-xl border border-slate-200 bg-white p-3 text-center text-xs font-extrabold text-slate-700">
                {x}
              </div>
            ))}
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[{
              name: "Atlas Lodge",
              quote: "On remplit mieux nos créneaux et on limite les annulations de dernière minute.",
              role: "Food & expériences",
            },{
              name: "Zen Spa",
              quote: "Le QR + WhatsApp simplifie tout. Les clients confirment plus vite.",
              role: "Bien-être",
            },{
              name: "City Escape",
              quote: "Une visibilité continue toute l’année, pas seulement pendant les périodes fortes.",
              role: "Loisirs & tourisme",
            }].map((t) => (
              <Card key={t.name} className="p-6 border-slate-200 bg-white">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(212,167,92,0.18)" }}>
                    <Users className="h-5 w-5" style={{ color: BRAND.gold }} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-extrabold text-slate-950">{t.name}</div>
                    <div className="text-xs text-slate-600">{t.role}</div>
                  </div>
                </div>
                <div className="mt-4 text-sm text-slate-700">“{t.quote}”</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-200 bg-white">
        <div className="container mx-auto px-4 py-12 md:py-14">
          <div
            className="rounded-3xl border border-slate-200 p-8 md:p-10 relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, rgba(163,0,29,0.08), rgba(212,167,92,0.10))` }}
          >
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-3xl">
                <div className="text-xs font-extrabold tracking-[0.2em] uppercase" style={{ color: BRAND.gold }}>
                  Sans engagement
                </div>
                <div className="mt-3 text-2xl md:text-3xl font-extrabold text-slate-950">Commencer maintenant – sans engagement</div>
                <div className="mt-2 text-sm md:text-base text-slate-600">Envoyez votre demande et recevez une réponse rapide (mise en ligne, packs, QR, garanties).</div>
              </div>

              <div className="shrink-0">
                <CTAInline label="Commencer maintenant" />
              </div>
            </div>
          </div>
        </div>
      </section>


    </div>
  );
}
