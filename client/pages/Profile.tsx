import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { BookingRecord, PackPurchase } from "@/lib/userData";
import {
  Award,
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Heart,
  Info,
  ListChecks,
  LogOut,
  Menu,
  Package,
  QrCode,
  Settings,
  Shield,
  Sliders,
  User2,
  X,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";

import { Header } from "@/components/Header";
import { AuthModalV2 } from "@/components/AuthModalV2";
import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
import { ProfileQRCodeTab } from "@/components/profile/ProfileQRCodeTab";
import { ProfileLoyaltyTab } from "@/components/profile/ProfileLoyaltyTab";

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

  const allowedTabs = useMemo(() => new Set(["qrcode", "infos", "bookings", "waitlist", "loyalty", "notifications", "billing", "packs", "favorites", "prefs", "privacy"]), []);
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(() => (tabParam && allowedTabs.has(tabParam) ? tabParam : "qrcode"));

  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Desktop sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    const tab = tabParam && allowedTabs.has(tabParam) ? tabParam : "qrcode";
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

  // Menu items configuration
  const menuItems = useMemo(() => [
    { id: "qrcode", label: "Mon QR", icon: QrCode },
    { id: "infos", label: t("profile.tabs.info"), icon: Info },
    { id: "bookings", label: t("profile.tabs.bookings"), icon: Calendar },
    { id: "waitlist", label: t("profile.tabs.waitlist"), icon: ListChecks },
    { id: "loyalty", label: "Fidélité", icon: Award },
    { id: "packs", label: t("profile.tabs.packs"), icon: Package },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "billing", label: t("profile.tabs.billing"), icon: CreditCard },
    { id: "favorites", label: t("profile.tabs.favorites"), icon: Heart },
    { id: "prefs", label: t("profile.tabs.preferences"), icon: Sliders },
    { id: "privacy", label: t("profile.tabs.privacy_account"), icon: Shield },
  ], [t]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (tabId === "qrcode") p.delete("tab");
      else p.set("tab", tabId);
      return p;
    });
    // Close mobile menu when selecting a tab
    setMobileMenuOpen(false);
  };

  // Get current tab info
  const currentTab = menuItems.find((item) => item.id === activeTab);

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

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {!authed ? (
        gate
      ) : (
        <main className="min-h-[calc(100vh-64px)]">
          {/* Mobile Menu Overlay */}
          {mobileMenuOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          <div className="flex">
            {/* Sidebar - Desktop */}
            <aside
              className={cn(
                "hidden md:flex flex-col bg-white border-r border-slate-200 transition-all duration-300 sticky top-0 h-screen",
                sidebarCollapsed ? "w-20" : "w-64"
              )}
            >
              {/* User Info - Desktop */}
              <div className={cn(
                "p-4 border-b border-slate-200 bg-primary/5",
                sidebarCollapsed && "flex justify-center"
              )}>
                {sidebarCollapsed ? (
                  <ProfileAvatarEditor initials={initials} avatarDataUrl={profile.avatarDataUrl} size="sm" />
                ) : (
                  <div className="flex items-center gap-3">
                    <ProfileAvatarEditor initials={initials} avatarDataUrl={profile.avatarDataUrl} size="sm" />
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold text-foreground truncate">{displayName}</h2>
                      <p className="text-xs text-slate-500 truncate">
                        {profile.contact || t("profile.contact.placeholder")}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Menu Items - Desktop */}
              <nav className="flex-1 overflow-y-auto py-4">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary border-r-4 border-primary"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                        sidebarCollapsed && "justify-center px-2"
                      )}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <Icon className={cn("w-5 h-5 flex-shrink-0", isActive && "text-primary")} />
                      {!sidebarCollapsed && (
                        <span className="font-medium truncate">{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Collapse Button & Logout - Desktop */}
              <div className="border-t border-slate-200 p-4 space-y-2">
                <button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors",
                    sidebarCollapsed && "justify-center px-2"
                  )}
                >
                  {sidebarCollapsed ? (
                    <ChevronRight className="w-5 h-5" />
                  ) : (
                    <>
                      <ChevronLeft className="w-5 h-5" />
                      <span className="text-sm">Réduire</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleLogout}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors",
                    sidebarCollapsed && "justify-center px-2"
                  )}
                  title={sidebarCollapsed ? t("header.profile.logout") : undefined}
                >
                  <LogOut className="w-5 h-5" />
                  {!sidebarCollapsed && <span className="text-sm font-medium">{t("header.profile.logout")}</span>}
                </button>
              </div>
            </aside>

            {/* Sidebar - Mobile (Slide-in) */}
            <aside
              className={cn(
                "fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl transform transition-transform duration-300 ease-in-out md:hidden",
                mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
              )}
            >
              {/* Close button */}
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>

              {/* User Info - Mobile */}
              <div className="p-6 pt-4 border-b border-slate-200 bg-primary/5">
                <div className="flex items-center gap-4">
                  <ProfileAvatarEditor initials={initials} avatarDataUrl={profile.avatarDataUrl} />
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-lg text-foreground truncate">{displayName}</h2>
                    <p className="text-sm text-slate-500 truncate">
                      {profile.contact || t("profile.contact.placeholder")}
                    </p>
                  </div>
                </div>

                {/* Stats - Mobile */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="bg-white rounded-lg p-2 text-center border border-slate-200">
                    <div className="text-lg font-bold text-foreground">{bookings.length}</div>
                    <div className="text-[10px] text-slate-500">{t("profile.stats.bookings")}</div>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center border border-slate-200">
                    <div className="text-lg font-bold text-foreground">{favorites.length}</div>
                    <div className="text-[10px] text-slate-500">{t("profile.stats.favorites")}</div>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center border border-slate-200">
                    <div className="text-lg font-bold text-foreground">{prefsSummary.enabled}</div>
                    <div className="text-[10px] text-slate-500">Préfs</div>
                  </div>
                </div>
              </div>

              {/* Menu Items - Mobile */}
              <nav className="flex-1 overflow-y-auto py-2">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={cn(
                        "w-full flex items-center gap-4 px-6 py-4 text-left transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary border-r-4 border-primary"
                          : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <Icon className={cn("w-5 h-5", isActive && "text-primary")} />
                      <span className="font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Logout - Mobile */}
              <div className="border-t border-slate-200 p-4">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-4 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">{t("header.profile.logout")}</span>
                </button>
              </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
              {/* Mobile Header with Menu Toggle */}
              <div className="md:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setMobileMenuOpen(true)}
                    className="p-2 -ml-2 rounded-lg hover:bg-slate-100"
                  >
                    <Menu className="w-6 h-6" />
                  </button>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {currentTab && (
                      <>
                        <currentTab.icon className="w-5 h-5 text-primary flex-shrink-0" />
                        <h1 className="font-bold text-lg truncate">{currentTab.label}</h1>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Desktop Header */}
              <div className="hidden md:block border-b border-slate-200 bg-primary/5 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {currentTab && (
                      <>
                        <currentTab.icon className="w-6 h-6 text-primary" />
                        <h1 className="text-xl font-bold text-foreground">{currentTab.label}</h1>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-4 text-sm">
                      <div className="text-center">
                        <div className="font-bold text-foreground">{bookings.length}</div>
                        <div className="text-xs text-slate-500">{t("profile.stats.bookings")}</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-foreground">{favorites.length}</div>
                        <div className="text-xs text-slate-500">{t("profile.stats.favorites")}</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-foreground">{prefsSummary.enabled}/{prefsSummary.total}</div>
                        <div className="text-xs text-slate-500">Préférences</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tab Content */}
              <div className="p-4 md:p-6 lg:p-8">
                {activeTab === "qrcode" && <ProfileQRCodeTab />}

                {activeTab === "infos" && <ProfileInfoForm profile={profile} />}

                {activeTab === "bookings" && (
                  <>
                    {bookingsError ? <div className="mb-3 text-sm text-red-600">{bookingsError}</div> : null}
                    {bookingsLoading ? <div className="mb-3 text-sm text-slate-600">{t("profile.bookings.loading")}</div> : null}
                    <ProfileBookings bookings={bookings} />
                    <div className="mt-4">
                      <Button variant="outline" onClick={() => void reloadBookings()} disabled={bookingsLoading}>
                        {t("common.refresh")}
                      </Button>
                    </div>
                  </>
                )}

                {activeTab === "waitlist" && (
                  <ProfileWaitlist items={waitlistItems} loading={waitlistLoading} error={waitlistError} onReload={() => void reloadWaitlist()} />
                )}

                {activeTab === "loyalty" && <ProfileLoyaltyTab />}

                {activeTab === "packs" && (
                  <>
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
                  </>
                )}

                {activeTab === "notifications" && (
                  <ProfileNotifications bookings={bookings} packPurchases={packPurchases} />
                )}

                {activeTab === "billing" && (
                  <ProfileBilling bookings={bookings} packPurchases={packPurchases} />
                )}

                {activeTab === "favorites" && (
                  <ProfileFavorites
                    favorites={favorites}
                    onRemove={(item) => {
                      removeFavorite({ kind: item.kind, id: item.id });
                      setFavorites(getFavorites());
                    }}
                  />
                )}

                {activeTab === "prefs" && <ProfilePreferences profile={profile} />}

                {activeTab === "privacy" && <ProfileAccountPrivacy />}
              </div>
            </div>
          </div>
        </main>
      )}

    </div>
  );
}
