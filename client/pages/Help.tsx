import { useEffect, useMemo, useState } from "react";
import { HelpCircle, LogIn, Phone } from "lucide-react";

import { Header } from "@/components/Header";
import { AuthModalV2 } from "@/components/AuthModalV2";
import { FaqSection } from "@/components/support/FaqSection";
import { SupportChatPanel } from "@/components/support/SupportChatPanel";
import { SupportTicketsPanel } from "@/components/support/SupportTicketsPanel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import { AUTH_CHANGED_EVENT, isAuthed } from "@/lib/auth";

export default function Help() {
  const { t } = useI18n();
  const [authOpen, setAuthOpen] = useState(false);
  const [authed, setAuthed] = useState(isAuthed());

  useEffect(() => {
    const sync = () => setAuthed(isAuthed());
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const tabs = useMemo(() => {
    return authed ? ("tickets" as const) : ("faq" as const);
  }, [authed]);

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-lg border-2 border-slate-200 bg-white overflow-hidden">
            <div className="p-6 md:p-8 bg-primary/5 border-b border-slate-200">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-6 h-6 text-primary" />
                    <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">{t("help.title")}</h1>
                  </div>
                  <div className="mt-2 text-slate-700">
                    {t("help.subtitle")}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button variant="outline" className="gap-2" asChild>
                    <a href="tel:+212520123456">
                      <Phone className="w-4 h-4" />
                      05 20 12 34 56
                    </a>
                  </Button>
                  {!authed ? (
                    <Button className="gap-2" onClick={() => setAuthOpen(true)}>
                      <LogIn className="w-4 h-4" />
                      {t("header.login")}
                    </Button>
                  ) : null}
                </div>
              </div>

              {!authed ? (
                <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
                  {t("help.login_required")}
                </div>
              ) : null}
            </div>

            <div className="p-6 md:p-8">
              <Tabs defaultValue={tabs}>
                <TabsList className="w-full justify-start bg-slate-100 flex-nowrap overflow-x-auto md:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <TabsTrigger value="faq" className="font-bold whitespace-nowrap">{t("help.tab.faq")}</TabsTrigger>
                  <TabsTrigger value="tickets" className="font-bold whitespace-nowrap" disabled={!authed}>
                    {t("help.tab.tickets")}
                  </TabsTrigger>
                  <TabsTrigger value="chat" className="font-bold whitespace-nowrap" disabled={!authed}>
                    {t("help.tab.chat")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="faq" className="mt-6">
                  <FaqSection />
                </TabsContent>

                <TabsContent value="tickets" className="mt-6">
                  {authed ? <SupportTicketsPanel /> : <FaqSection compact />}
                </TabsContent>

                <TabsContent value="chat" className="mt-6">
                  <SupportChatPanel enabled={authed} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </main>


      <AuthModalV2
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthed={() => {
          setAuthed(true);
          setAuthOpen(false);
        }}
      />
    </div>
  );
}
