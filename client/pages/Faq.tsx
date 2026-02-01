import { useMemo } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, Phone } from "lucide-react";

import { Header } from "@/components/Header";
import { FaqSection } from "@/components/support/FaqSection";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { isAuthed } from "@/lib/auth";

export default function Faq() {
  const { t } = useI18n();
  const authed = useMemo(() => isAuthed(), []);

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
              <FaqSection />
            </div>
          </div>
        </div>
      </main>

    </div>
  );
}
