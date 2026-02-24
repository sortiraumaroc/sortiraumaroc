import { lazy, Suspense, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useSearchParams } from "react-router-dom";
import {
  LayoutDashboard,
  Route,
  PlusCircle,
  Settings,
  LogOut,
  Loader2,
  Building2,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { ConciergeProfile } from "@shared/conciergerieTypes";

// Lazy-load tabs
const ConciergerieDashboardTab = lazy(
  () => import("./tabs/ConciergerieDashboardTab"),
);
const ConciergerieJourneysTab = lazy(
  () => import("./tabs/ConciergerieJourneysTab"),
);
const ConciergerieJourneyBuilder = lazy(
  () => import("./tabs/ConciergerieJourneyBuilder"),
);
const ConciergerieSettingsTab = lazy(
  () => import("./tabs/ConciergerieSettingsTab"),
);

type Props = {
  user: User;
  concierge: ConciergeProfile;
  onSignOut: () => Promise<void>;
};

const TAB_TRIGGER_CLASS =
  "w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none";

const VALID_TABS = ["dashboard", "journeys", "new-journey", "settings"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function ConciergerieShell({ user, concierge, onSignOut }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [signingOut, setSigningOut] = useState(false);

  const activeTab = useMemo(() => {
    const param = searchParams.get("tab") ?? "dashboard";
    return VALID_TABS.includes(param as TabValue)
      ? (param as TabValue)
      : "dashboard";
  }, [searchParams]);

  const navigateToTab = (tab: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", tab);
      return p;
    });
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await onSignOut();
  };

  const conciergeName = concierge.concierge.name;
  const userName = [concierge.user.first_name, concierge.user.last_name]
    .filter(Boolean)
    .join(" ") || user.email || "Utilisateur";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="bg-white border-b px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {concierge.concierge.logo_url ? (
              <img
                src={concierge.concierge.logo_url}
                alt={conciergeName}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
            )}
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">
                {conciergeName}
              </h1>
              <p className="text-xs text-slate-500">{userName}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-slate-500 hover:text-red-600"
          >
            {signingOut ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            <span className="hidden sm:inline ml-1">Déconnexion</span>
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={navigateToTab} className="w-full">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Sidebar */}
            <aside className="md:w-64 md:flex-shrink-0 md:sticky md:top-6 md:self-start">
              <Card className="md:max-h-[calc(100vh-3rem)] md:overflow-auto h-fit">
                <CardContent className="p-2 space-y-2">
                  <div className="text-xs font-semibold text-slate-500 px-2 pt-1">
                    Navigation
                  </div>

                  <TabsList className="w-full bg-transparent p-0 h-auto flex md:flex-col flex-row md:gap-0.5 gap-2 md:items-stretch items-center justify-start overflow-x-auto md:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <TabsTrigger value="dashboard" className={TAB_TRIGGER_CLASS}>
                      <LayoutDashboard className="w-4 h-4" />
                      Tableau de bord
                    </TabsTrigger>
                    <TabsTrigger value="journeys" className={TAB_TRIGGER_CLASS}>
                      <Route className="w-4 h-4" />
                      Mes parcours
                    </TabsTrigger>
                    <TabsTrigger value="new-journey" className={TAB_TRIGGER_CLASS}>
                      <PlusCircle className="w-4 h-4" />
                      Nouveau parcours
                    </TabsTrigger>
                    <TabsTrigger value="settings" className={TAB_TRIGGER_CLASS}>
                      <Settings className="w-4 h-4" />
                      Paramètres
                    </TabsTrigger>
                  </TabsList>
                </CardContent>
              </Card>
            </aside>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                }
              >
                <TabsContent value="dashboard" className="mt-0">
                  <ConciergerieDashboardTab concierge={concierge} />
                </TabsContent>

                <TabsContent value="journeys" className="mt-0">
                  <ConciergerieJourneysTab
                    concierge={concierge}
                    onViewJourney={(id) => {
                      setSearchParams((prev) => {
                        const p = new URLSearchParams(prev);
                        p.set("tab", "journeys");
                        p.set("journey", id);
                        return p;
                      });
                    }}
                    onNewJourney={() => navigateToTab("new-journey")}
                  />
                </TabsContent>

                <TabsContent value="new-journey" className="mt-0">
                  <ConciergerieJourneyBuilder
                    concierge={concierge}
                    onCreated={(id) => {
                      setSearchParams((prev) => {
                        const p = new URLSearchParams(prev);
                        p.set("tab", "journeys");
                        p.set("journey", id);
                        return p;
                      });
                    }}
                  />
                </TabsContent>

                <TabsContent value="settings" className="mt-0">
                  <ConciergerieSettingsTab concierge={concierge} />
                </TabsContent>
              </Suspense>
            </div>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
