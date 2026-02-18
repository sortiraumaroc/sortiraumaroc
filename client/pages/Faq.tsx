import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, Phone } from "lucide-react";

import { Header } from "@/components/Header";
import { FaqSection } from "@/components/support/FaqSection";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { isAuthed } from "@/lib/auth";
import { applySeo, setJsonLd, clearJsonLd, generateFaqSchema, generateBreadcrumbSchema, buildI18nSeoFields } from "@/lib/seo";
import { listPublicFaqArticles } from "@/lib/faq";

export default function Faq() {
  const { t, locale } = useI18n();
  const authed = useMemo(() => isAuthed(), []);

  // ── SEO ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

    applySeo({
      title: "FAQ — Sortir Au Maroc",
      description: "Trouvez les réponses à vos questions sur SAM.ma : réservations, annulations, programme de fidélité, paiements et plus.",
      ogType: "website",
      canonicalStripQuery: true,
      ...buildI18nSeoFields(locale),
    });

    setJsonLd(
      "breadcrumb",
      generateBreadcrumbSchema([
        { name: "Accueil", url: `${baseUrl}/` },
        { name: "FAQ", url: `${baseUrl}/faq` },
      ]),
    );

    // Load FAQ items and generate FAQPage schema
    let active = true;
    listPublicFaqArticles(locale === "en" ? "en" : "fr", "consumer")
      .then((items) => {
        if (!active) return;
        const faqs = items
          .filter((it) => it.resolved.question.trim() && it.resolved.answer_html.trim())
          .slice(0, 50)
          .map((it) => ({
            question: it.resolved.question,
            answer: it.resolved.answer_html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
          }));
        if (faqs.length > 0) {
          setJsonLd("faq", generateFaqSchema(faqs));
        }
      })
      .catch(() => {
        // Silently skip FAQ schema on error
      });

    return () => {
      active = false;
      clearJsonLd("faq");
      clearJsonLd("breadcrumb");
    };
  }, [locale]);

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-lg border-2 border-slate-200 bg-white overflow-hidden">
            <div className="p-6 md:p-8 bg-primary/5 border-b border-slate-200">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-6 h-6 text-primary" />
                    <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">{t("faq.title")}</h1>
                  </div>
                  <div className="mt-2 text-slate-700">
                    {t("faq.subtitle")}
                  </div>
                </div>

                {authed ? (
                  <Link to="/aide">
                    <Button className="gap-2">
                      <HelpCircle className="w-4 h-4" />
                      {t("faq.button.access_help")}
                    </Button>
                  </Link>
                ) : null}
              </div>

              <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Phone className="w-4 h-4 text-primary" />
                  {t("faq.phone_support.title")}
                </div>
                <div className="text-sm text-slate-700">
                  <a href="tel:+212520123456" className="font-bold text-primary hover:underline">
                    05 20 12 34 56
                  </a>
                  <span className="text-slate-500">{t("faq.phone_support.hours")}</span>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8">
              <FaqSection audience="consumer" />
            </div>
          </div>
        </div>
      </main>

    </div>
  );
}
