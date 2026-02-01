import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { BookingRecord, PackPurchase } from "@/lib/userData";
import { Calendar, Heart, LogOut, Settings, User2 } from "lucide-react";

import { useI18n } from "@/lib/i18n";

import { Header } from "@/components/Header";
import { AuthModal } from "@/components/AuthModal";
import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AUTH_CHANGED_EVENT, clearAuthed, isAuthed } from "@/lib/auth";
import {
  USER_DATA_CHANGED_EVENT,
  ensureDemoFavorites,
  ensureDemoPackPurchases,
  getFavorites,
  getPackPurchases,
  getUserProfile,
  removeFavorite,
  removePackPurchase,
} from "@/lib/userData";
import { listMyConsumerReservations, mapConsumerReservationToBookingRecord } from "@/lib/consumerReservationsApi";
import { listMyConsumerWaitlist, type ConsumerWaitlistItem } from "@/lib/consumerWaitlistApi";
import { listMyConsumerPackPurchases, hideMyConsumerPackPurchase } from "@/lib/consumerPacksApi";
import { isDemoModeEnabled } from "@/lib/demoMode";

import { ProfileBookings } from "@/components/profile/ProfileBookings";
import { ProfileWaitlist } from "@/components/profile/ProfileWaitlist";
import { ProfileFavorites } from "@/components/profile/ProfileFavorites";
import { ProfileInfoForm } from "@/components/profile/ProfileInfoForm";
import { ProfilePreferences } from "@/components/profile/ProfilePreferences";
import { ProfileBilling } from "@/components/profile/ProfileBilling";
import { ProfilePacks } from "@/components/profile/ProfilePacks";
import { ProfileNotifications } from "@/components/profile/ProfileNotifications";
import { ProfileAccountPrivacy } from "@/components/profile/ProfileAccountPrivacy";

function getInitials(firstName?: string, lastName?: string): string {
  const a = (firstName ?? "").trim();
  const b = (lastName ?? "").trim();
  const parts = [a, b].filter(Boolean);
  if (!parts.length) return "SA";
  const letters = parts
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase();
  return letters || "SA";
}

export default function Profile() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const allowedTabs = useMemo(() => new Set(["infos", "bookings", "waitlist", "notifications", "billing", "packs", "favorites", "prefs", "privacy"]), []);
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(() => (tabParam && allowedTabs.has(tabParam) ? tabParam : "infos"));

  const [authed, setAuthed] = useState(isAuthed());
  const [authOpen, setAuthOpen] = useState(false);

  const [profile, setProfile] = useState(getUserProfile());
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  const [waitlistItems, setWaitlistItems] = useState<ConsumerWaitlistItem[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState(getFavorites());
  const [packPurchases, setPackPurchases] = useState<PackPurchase[]>([]);
  const [packPurchasesLoading, setPackPurchasesLoading] = useState(false);
  const [packPurchasesError, setPackPurchasesError] = useState<string | null>(null);

  useEffect(() => {
    const onAuth = () => setAuthed(isAuthed());
    const onData = () => {
      setProfile(getUserProfile());
      setFavorites(getFavorites());

      // Packs are API-backed when authenticated; only refresh from localStorage in demo mode.
      if (isDemoModeEnabled()) {
        setPackPurchases(getPackPurchases());
      }
    };

    window.addEventListener(AUTH_CHANGED_EVENT, onAuth);
    window.addEventListener(USER_DATA_CHANGED_EVENT, onData);
    window.addEventListener("storage", onData);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuth);
      window.removeEventListener(USER_DATA_CHANGED_EVENT, onData);
      window.removeEventListener("storage", onData);
    };
  }, []);

  useEffect(() => {
    if (!authed) setAuthOpen(false);
  }, [authed]);

  useEffect(() => {
    const tab = tabParam && allowedTabs.has(tabParam) ? tabParam : "infos";
    setActiveTab(tab);
  }, [allowedTabs, tabParam]);

  const reloadBookings = async () => {
    if (!authed) return;

    setBookingsLoading(true);
    setBookingsError(null);
    try {
      const rows = await listMyConsumerReservations();
      setBookings(rows.map(mapConsumerReservationToBookingRecord));
    } catch (e) {
      setBookings([]);
      setBookingsError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBookingsLoading(false);
    }
  };

  const reloadWaitlist = async () => {
    if (!authed) return;

    setWaitlistLoading(true);
    setWaitlistError(null);
    try {
      const rows = await listMyConsumerWaitlist("all");
      setWaitlistItems(rows);
    } catch (e) {
      setWaitlistItems([]);
      setWaitlistError(e instanceof Error ? e.message : t("common.error.generic"));
    } finally {
      setWaitlistLoading(false);
    }
  };

  const reloadPackPurchases = async () => {
    if (!authed) return;

    setPackPurchasesLoading(true);
    setPackPurchasesError(null);

    if (isDemoModeEnabled()) {
      const packNext = ensureDemoPackPurchases(9);
      setPackPurchases(packNext);
      setPackPurchasesLoading(false);
      return;
    }

    try {
      const items = await listMyConsumerPackPurchases();
      setPackPurchases(items);
    } catch (e) {
      setPackPurchases([]);
      setPackPurchasesError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setPackPurchasesLoading(false);
    }
  };

  useEffect(() => {
    if (!authed) return;

    if (isDemoModeEnabled()) {
      const next = ensureDemoFavorites(8);
      if (next.length) setFavorites(next);

      const packNext = ensureDemoPackPurchases(9);
      if (packNext.length) setPackPurchases(packNext);
    }

    void reloadBookings();
    void reloadWaitlist();
    void reloadPackPurchases();
  }, [authed]);

  const displayName = useMemo(() => {
    const a = profile.firstName?.trim() || "";
    const b = profile.lastName?.trim() || "";
    const full = `${a} ${b}`.trim();
    return full || t("profile.user.fallback_name");
  }, [profile.firstName, profile.lastName, t]);

  const initials = useMemo(() => getInitials(profile.firstName, profile.lastName), [profile.firstName, profile.lastName]);

  const prefsSummary = useMemo(() => {
    const prefs = profile.preferences;
    const total = Object.keys(prefs).length;
    const enabled = Object.values(prefs).filter(Boolean).length;
    return { enabled, total };
  }, [profile.preferences]);

  const handleLogout = () => {
    clearAuthed();
    setAuthed(false);
    navigate("/");
  };

  const gate = (
    <div className="container mx-auto px-4 py-10 md:py-14">
      <div className="max-w-2xl mx-auto rounded-lg border-2 border-slate-200 bg-white p-6 md:p-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">{t("profile.gate.title")}</h1>
            <div className="text-sm text-slate-600">{t("profile.gate.subtitle")}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <Calendar className="w-4 h-4 text-primary" />
              {t("profile.gate.card.bookings.title")}
            </div>
            <div className="mt-1 text-sm text-slate-600">{t("profile.gate.card.bookings.subtitle")}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <Heart className="w-4 h-4 text-primary" />
              {t("profile.gate.card.favorites.title")}
            </div>
            <div className="mt-1 text-sm text-slate-600">{t("profile.gate.card.favorites.subtitle")}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <Settings className="w-4 h-4 text-primary" />
              {t("profile.gate.card.preferences.title")}
            </div>
            <div className="mt-1 text-sm text-slate-600">{t("profile.gate.card.preferences.subtitle")}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Button className="bg-primary hover:bg-primary/90 text-white font-bold" onClick={() => setAuthOpen(true)}>
            {t("header.login")}
          </Button>
          <Button variant="outline" onClick={() => navigate("/results")}>{t("profile.gate.cta.explore")}</Button>
        </div>
      </div>

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthed={() => {
          setAuthed(true);
          setAuthOpen(false);
        }}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {!authed ? (
        gate
      ) : (
        <main className="container mx-auto px-4 py-8 md:py-12">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-lg border-2 border-slate-200 bg-white">
              <div className="p-6 md:p-8 bg-primary/5 border-b border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <ProfileAvatarEditor initials={initials} avatarDataUrl={profile.avatarDataUrl} />
                    <div>
                      <h1 className="text-xl md:text-2xl font-bold text-foreground">{displayName}</h1>
                      <div className="mt-1 text-sm text-slate-600">
                        {profile.contact ? profile.contact : t("profile.contact.placeholder")}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" className="gap-2" onClick={handleLogout}>
                      <LogOut className="w-4 h-4" />
                      {t("header.profile.logout")}
                    </Button>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-600">{t("profile.stats.bookings")}</div>
                    <div className="text-xl font-extrabold text-foreground tabular-nums">{bookings.length}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-600">{t("profile.stats.favorites")}</div>
                    <div className="text-xl font-extrabold text-foreground tabular-nums">{favorites.length}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4 col-span-2 sm:col-span-1">
                    <div className="text-xs text-slate-600">{t("profile.stats.preferences")}</div>
                    <div className="mt-1 text-sm font-bold text-foreground tabular-nums leading-tight">
                      <span className="sm:hidden">{t("profile.stats.preferences.short", { enabled: prefsSummary.enabled, total: prefsSummary.total })}</span>
                      <span className="hidden sm:inline">{t("profile.stats.preferences.long", { enabled: prefsSummary.enabled, total: prefsSummary.total })}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 sm:hidden">{t("profile.stats.preferences.examples")}</div>
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-8">
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => {
                    setActiveTab(v);
                    setSearchParams((prev) => {
                      const p = new URLSearchParams(prev);
                      if (v === "infos") p.delete("tab");
                      else p.set("tab", v);
                      return p;
                    });
                  }}
                >
                  <TabsList className="w-full justify-start bg-slate-100 flex-nowrap overflow-x-auto md:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <TabsTrigger value="infos" className="font-bold whitespace-nowrap">{t("profile.tabs.info")}</TabsTrigger>
                    <TabsTrigger value="bookings" className="font-bold whitespace-nowrap">{t("profile.tabs.bookings")}</TabsTrigger>
                    <TabsTrigger value="waitlist" className="font-bold whitespace-nowrap">{t("profile.tabs.waitlist")}</TabsTrigger>
                    <TabsTrigger value="packs" className="font-bold whitespace-nowrap">{t("profile.tabs.packs")}</TabsTrigger>
                    <TabsTrigger value="notifications" className="font-bold whitespace-nowrap">Notifications</TabsTrigger>
                    <TabsTrigger value="billing" className="font-bold whitespace-nowrap">{t("profile.tabs.billing")}</TabsTrigger>
                    <TabsTrigger value="favorites" className="font-bold whitespace-nowrap">{t("profile.tabs.favorites")}</TabsTrigger>
                    <TabsTrigger value="prefs" className="font-bold whitespace-nowrap">{t("profile.tabs.preferences")}</TabsTrigger>
                    <TabsTrigger value="privacy" className="font-bold whitespace-nowrap">{t("profile.tabs.privacy_account")}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="infos" className="mt-6">
                    <ProfileInfoForm profile={profile} />
                  </TabsContent>

                  <TabsContent value="bookings" className="mt-6">
                    {bookingsError ? <div className="mb-3 text-sm text-red-600">{bookingsError}</div> : null}
                    {bookingsLoading ? <div className="mb-3 text-sm text-slate-600">{t("profile.bookings.loading")}</div> : null}
                    <ProfileBookings bookings={bookings} />
                    <div className="mt-4">
                      <Button variant="outline" onClick={() => void reloadBookings()} disabled={bookingsLoading}>
                        {t("common.refresh")}
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="waitlist" className="mt-6">
                    <ProfileWaitlist items={waitlistItems} loading={waitlistLoading} error={waitlistError} onReload={() => void reloadWaitlist()} />
                  </TabsContent>

                  <TabsContent value="packs" className="mt-6">
                    {packPurchasesError ? <div className="mb-3 text-sm text-red-600">{packPurchasesError}</div> : null}
                    {packPurchasesLoading ? <div className="mb-3 text-sm text-slate-600">Chargement…</div> : null}

                    <ProfilePacks
                      packs={packPurchases}
                      onRemove={(id) => {
                        if (isDemoModeEnabled()) {
                          removePackPurchase(id);
                          setPackPurchases(getPackPurchases());
                          return;
                        }

                        void (async () => {
                          try {
                            await hideMyConsumerPackPurchase(id);
                          } finally {
                            await reloadPackPurchases();
                          }
                        })();
                      }}
                    />

                    <div className="mt-4">
                      <Button variant="outline" onClick={() => void reloadPackPurchases()} disabled={packPurchasesLoading}>
                        {t("common.refresh")}
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="notifications" className="mt-6">
                    <ProfileNotifications bookings={bookings} packPurchases={packPurchases} />
                  </TabsContent>

                  <TabsContent value="billing" className="mt-6">
                    <ProfileBilling bookings={bookings} packPurchases={packPurchases} />
                  </TabsContent>

                  <TabsContent value="favorites" className="mt-6">
                    <ProfileFavorites
                      favorites={favorites}
                      onRemove={(item) => {
                        removeFavorite({ kind: item.kind, id: item.id });
                        setFavorites(getFavorites());
                      }}
                    />
                  </TabsContent>

                  <TabsContent value="prefs" className="mt-6">
                    <ProfilePreferences profile={profile} />
                  </TabsContent>

                  <TabsContent value="privacy" className="mt-6">
                    <ProfileAccountPrivacy />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </main>
      )}

    </div>
  );
}
