import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { NotificationBody } from "@/components/NotificationBody";
import {
  BarChart3,
  Bell,
  Briefcase,
  CalendarCheck,
  CreditCard,
  Eye,
  KeyRound,
  ListPlus,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  QrCode,
  LogOut,
  Megaphone,
  MessageSquare,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Tags,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  getProNotificationPreferences,
  subscribeToProNotificationPreferencesChanges,
} from "@/lib/pro/notificationPreferences";
import { playProNotificationSound } from "@/lib/pro/notificationSound";

import { writeSelectedEstablishmentId } from "@/lib/pro/establishmentSelection";

import {
  activateOwnerMembership,
  listMyEstablishments,
  listMyMemberships,
  listProNotifications,
  markAllProNotificationsRead,
} from "@/lib/pro/api";
import type {
  Establishment,
  ProMembership,
  ProNotification,
  ProRole,
} from "@/lib/pro/types";

import { ProDashboardTab } from "@/components/pro/tabs/ProDashboardTab";
import { ProImpactTab } from "@/components/pro/tabs/ProImpactTab";
import { ProEstablishmentTab } from "@/components/pro/tabs/ProEstablishmentTab";
import {
  getProProfileAvatar,
  subscribeToProProfileAvatarChanges,
} from "@/lib/pro/profile";
import { ProReservationsTab } from "@/components/pro/tabs/ProReservationsTab";
import { ProWaitlistTab } from "@/components/pro/tabs/ProWaitlistTab";
import { ProOffersTab } from "@/components/pro/tabs/ProOffersTab";
import { ProSlotsTab } from "@/components/pro/tabs/ProSlotsTab";
import { ProSettingsTab } from "@/components/pro/tabs/ProSettingsTab";
import { ProMyAccountTab } from "@/components/pro/tabs/ProMyAccountTab";
import { ProForcePasswordChangeDialog } from "@/components/pro/ProForcePasswordChangeDialog";
import { checkMustChangePassword } from "@/lib/pro/api";
import { ProPacksAndPromotionsTab } from "@/components/pro/tabs/ProPacksAndPromotionsTab";
import { ProBillingTab } from "@/components/pro/tabs/ProBillingTab";
import { ProVisibilityTab } from "@/components/pro/tabs/ProVisibilityTab";
import { ProMediaFactoryTab } from "@/components/pro/tabs/ProMediaFactoryTab";
import { ProNotificationsTab } from "@/components/pro/tabs/ProNotificationsTab";
import { ProTeamTab } from "@/components/pro/tabs/ProTeamTab";
import { ProAssistanceTab } from "@/components/pro/tabs/ProAssistanceTab";
import { ProQrScanTab } from "@/components/pro/tabs/ProQrScanTab";
import { ProMessagesTab } from "@/components/pro/tabs/ProMessagesTab";
import { ProPrestatairesTab } from "@/components/pro/tabs/ProPrestatairesTab";
import { ProReviewsTab } from "@/components/pro/tabs/ProReviewsTab";
import { ProAdsTab } from "@/components/pro/ads/ProAdsTab";
import { ProLiveNotifications } from "@/components/pro/ProLiveNotifications";
import { ProNotificationsSheet } from "@/components/pro/ProNotificationsSheet";
import { useProUnreadCount } from "@/lib/mediaFactory/unreadHook";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";

type Props = {
  user: User;
  onSignOut: () => Promise<void>;
};

function editStatusVariant(
  status: string | null | undefined,
): { label: string; className: string } | null {
  if (!status || status === "none") return null;
  if (status === "pending_modification") {
    return {
      label: "Modification en attente",
      className: "bg-amber-50 text-amber-700 border-amber-200",
    };
  }
  return {
    label: status,
    className: "bg-slate-100 text-slate-700 border-slate-200",
  };
}

function proInitials(user: User): string {
  const email = (user.email ?? "").trim();
  const base = email.includes("@") ? (email.split("@", 1)[0] ?? "") : email;
  const cleaned = base.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);

  const two = (() => {
    if (parts.length >= 2) return (parts[0][0] ?? "") + (parts[1][0] ?? "");
    const p = parts[0] ?? "";
    if (p.length >= 2) return p.slice(0, 2);
    if (p.length === 1) return p + "P";
    return "PR";
  })();

  return two.toUpperCase();
}

export function ProShell({ user, onSignOut }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Platform settings to hide features in test mode
  const { isTestMode, isFeatureEnabled } = usePlatformSettings();
  const showBillingTab = !isTestMode() || isFeatureEnabled("commissions_enabled");

  const allowedTabs = useMemo(
    () =>
      new Set([
        "dashboard",
        "impact",
        "establishment",
        "offers",
        "promotion",
        "reservations",
        "reviews",
        "waitlist",
        "qr",
        "slots",
        "settings",
        "billing",
        "visibility",
        "ads",
        "media",
        "prestataires",
        "notifications",
        "team",
        "messages",
        "assistance",
        "account",
      ]),
    [],
  );

  // State for forcing password change on first login
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [passwordCheckDone, setPasswordCheckDone] = useState(false);
  const tabParam = searchParams.get("tab");

  const [loading, setLoading] = useState(true);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [memberships, setMemberships] = useState<ProMembership[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(() =>
    getProProfileAvatar(user.id),
  );
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState(() =>
    getProNotificationPreferences(),
  );

  const selectedId = searchParams.get("eid");

  const selected = useMemo(
    () => establishments.find((e) => e.id === selectedId) ?? null,
    [establishments, selectedId],
  );

  const role = useMemo<ProRole | null>(() => {
    if (!selected) return null;
    const m = memberships.find((x) => x.establishment_id === selected.id);
    return m?.role ?? null;
  }, [memberships, selected]);

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const [ests, mems] = await Promise.all([
        listMyEstablishments(),
        listMyMemberships(),
      ]);
      setEstablishments(ests);
      setMemberships(mems);

      const nextSelected =
        selectedId && ests.some((e) => e.id === selectedId)
          ? selectedId
          : ests[0]?.id;
      if (nextSelected && nextSelected !== selectedId) {
        writeSelectedEstablishmentId(nextSelected);
        setSearchParams((prev) => {
          const p = new URLSearchParams(prev);
          p.set("eid", nextSelected);
          return p;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // Check if user must change password on first login
    void checkMustChangePassword()
      .then(({ mustChange }) => {
        setMustChangePassword(mustChange);
        setPasswordCheckDone(true);
      })
      .catch(() => {
        setPasswordCheckDone(true);
      });
  }, []);

  const editStatus = editStatusVariant(selected?.edit_status ?? null);

  const [activeTab, setActiveTab] = useState<string>(() =>
    tabParam && allowedTabs.has(tabParam) ? tabParam : "dashboard",
  );
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);

  const navigateToTab = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        if (tab === "dashboard") p.delete("tab");
        else p.set("tab", tab);
        return p;
      });

      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    },
    [setSearchParams],
  );

  const openReservationFromToast = useCallback(
    (reservationId: string) => {
      setActiveTab("reservations");
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        if (selected?.id) p.set("eid", selected.id);
        p.set("tab", "reservations");
        p.set("rid", reservationId);
        p.delete("pid");
        p.delete("billingTab");
        return p;
      });
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    },
    [selected?.id, setSearchParams],
  );

  const openPackPurchaseFromToast = useCallback(
    (purchaseId: string) => {
      setActiveTab("billing");
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        if (selected?.id) p.set("eid", selected.id);
        p.set("tab", "billing");
        p.set("pid", purchaseId);
        p.set("billingTab", "packs");
        p.delete("rid");
        return p;
      });
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    },
    [selected?.id, setSearchParams],
  );

  const lastNotificationsPollIsoRef = useRef<string>(new Date().toISOString());
  const lastNotificationsErrorAtRef = useRef<number>(0);

  useEffect(() => {
    const next = tabParam && allowedTabs.has(tabParam) ? tabParam : "dashboard";
    setActiveTab(next);
  }, [allowedTabs, selected?.id, tabParam]);

  useEffect(() => {
    if (!role || !selected) {
      setUnreadNotifications(0);
      return;
    }

    let cancelled = false;
    lastNotificationsPollIsoRef.current = new Date().toISOString();

    const poll = async () => {
      try {
        const now = new Date();
        const start = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );
        const end = new Date(start);
        end.setDate(start.getDate() + 1);

        const res = await listProNotifications({
          establishmentId: selected.id,
          from: start.toISOString(),
          to: end.toISOString(),
          limit: 50,
        });

        if (cancelled) return;

        setUnreadNotifications(
          typeof res.unreadCount === "number" ? res.unreadCount : 0,
        );

        const notifications = (res.notifications ?? []) as ProNotification[];
        const lastIso = lastNotificationsPollIsoRef.current;

        const fresh = notifications
          .filter(
            (n) =>
              !!n?.id &&
              typeof n.created_at === "string" &&
              n.created_at > lastIso,
          )
          .slice(0, 5)
          .reverse();

        if (notificationPreferences.popupsEnabled && fresh.length) {
          if (notificationPreferences.soundEnabled) playProNotificationSound();

          for (const n of fresh) {
            const data = n.data ?? {};
            const reservationId =
              typeof (data as any).reservationId === "string"
                ? (data as any).reservationId
                : null;
            const purchaseId =
              typeof (data as any).purchaseId === "string"
                ? (data as any).purchaseId
                : null;

            const action = (() => {
              if (reservationId) {
                return (
                  <ToastAction
                    altText="Voir"
                    onClick={() => openReservationFromToast(reservationId)}
                  >
                    Voir
                  </ToastAction>
                );
              }

              if (purchaseId) {
                return (
                  <ToastAction
                    altText="Voir"
                    onClick={() => openPackPurchaseFromToast(purchaseId)}
                  >
                    Voir
                  </ToastAction>
                );
              }

              return (
                <ToastAction
                  altText="Ouvrir"
                  onClick={() => setNotificationsOpen(true)}
                >
                  Ouvrir
                </ToastAction>
              );
            })();

            toast({
              title: n.title || "Notification",
              description: (
                <NotificationBody
                  body={n.body}
                  className="text-sm text-slate-700"
                  dateClassName="text-[0.75rem]"
                />
              ),
              action,
            });
          }
        }

        lastNotificationsPollIsoRef.current = new Date().toISOString();
      } catch (e) {
        // Best-effort: keep the UI usable even if notifications fail.
        if (!cancelled) setUnreadNotifications(0);

        // But surface the issue so it's not "silently empty".
        const now = Date.now();
        if (now - lastNotificationsErrorAtRef.current > 30_000) {
          lastNotificationsErrorAtRef.current = now;
          const msg =
            e instanceof Error
              ? e.message
              : "Impossible de charger les notifications";
          toast({
            title: "Notifications",
            description: msg,
          });
        }
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    notificationPreferences.popupsEnabled,
    notificationPreferences.soundEnabled,
    openPackPurchaseFromToast,
    openReservationFromToast,
    role,
    selected,
  ]);

  useEffect(() => {
    setProfileAvatarUrl(getProProfileAvatar(user.id));
    return subscribeToProProfileAvatarChanges((args) => {
      if (!args.userId || args.userId === user.id) {
        setProfileAvatarUrl(getProProfileAvatar(user.id));
      }
    });
  }, [user.id]);

  useEffect(() => {
    return subscribeToProNotificationPreferencesChanges(() => {
      setNotificationPreferences(getProNotificationPreferences());
    });
  }, []);

  // Media Factory unread messages count
  const { unreadCount: mediaUnreadCount } = useProUnreadCount(
    selected?.id ?? null,
  );

  if (loading) {
    return (
      <main className="container mx-auto px-4 py-10 md:py-14">
        <div className="max-w-6xl mx-auto flex items-center justify-center text-slate-600 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement…
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container mx-auto px-4 py-10 md:py-14">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Espace Pro</CardTitle>
              <CardDescription>
                Impossible de charger vos données.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-red-600">{error}</div>
              <Button
                onClick={refresh}
                className="bg-primary text-white hover:bg-primary/90 font-bold"
              >
                Réessayer
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!establishments.length) {
    return (
      <main className="container mx-auto px-4 py-10 md:py-14">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Aucun établissement</CardTitle>
              <CardDescription>
                Votre compte n’est pas encore rattaché à un établissement.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-slate-600">
                Si vous venez de créer un établissement, l’accès peut être
                activé après validation.
              </div>
              <Button
                variant="outline"
                onClick={() => onSignOut()}
                className="gap-2 w-fit"
              >
                <LogOut className="w-4 h-4" />
                Se déconnecter
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-6 md:py-10">
      <div className="max-w-7xl mx-auto">
        <div className="rounded-xl bg-primary text-white border border-primary/30 p-4 md:p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl md:text-2xl font-extrabold tracking-wide truncate max-w-full sm:max-w-[420px]">
                    {selected?.name ?? "ESPACE Pro"}
                  </h1>
                  <Badge className="bg-white/15 text-white border-white/20">
                    ESPACE PRO
                  </Badge>
                  {editStatus ? (
                    <Badge
                      className="bg-white/15 text-white border-white/20 cursor-pointer hover:bg-white/25 transition-colors"
                      onClick={() => setActiveTab("establishment")}
                    >
                      {editStatus.label}
                    </Badge>
                  ) : null}
                </div>
                <div className="text-sm text-white/90">
                  Bienvenue dans votre espace pro
                </div>
                <div className="text-xs text-white/80 truncate">
                  Connecté en tant que{" "}
                  <span className="font-semibold">{user.email ?? user.id}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 justify-between md:justify-end">
              <Link
                to="/"
                className="h-10 w-10 rounded-full border border-white/30 bg-white/10 hover:bg-white/20 transition overflow-hidden flex items-center justify-center"
                aria-label="Aller à l’accueil Sortir Au Maroc"
                title="Accueil"
              >
                <img
                  src="https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F04286a394799412ea4b29b3b10648388?format=webp&width=128"
                  alt="Sortir Au Maroc"
                  className="h-10 w-10 object-cover"
                />
              </Link>

              {selected?.id ? (
                <Link
                  to={buildEstablishmentUrl(selected)}
                  target="_blank"
                  rel="noreferrer"
                  className="h-10 w-10 rounded-full border border-white/30 bg-white/10 hover:bg-white/20 transition flex items-center justify-center"
                  aria-label="Aperçu public (voir en tant que)"
                  title="Aperçu"
                >
                  <Eye className="w-5 h-5" />
                </Link>
              ) : null}

              <ProNotificationsSheet
                open={notificationsOpen}
                onOpenChange={setNotificationsOpen}
                establishment={selected}
                user={user}
                role={role}
                unreadCount={unreadNotifications}
                onUnreadCountChange={setUnreadNotifications}
                onNavigateToTab={(tab) => {
                  setNotificationsOpen(false);
                  navigateToTab(tab);
                }}
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full border-2 transition overflow-hidden border-white/30 hover:bg-white/10 hover:border-white/60"
                    aria-label="Menu du profil"
                  >
                    <Avatar className="h-9 w-9">
                      {profileAvatarUrl ? (
                        <AvatarImage
                          src={profileAvatarUrl}
                          alt="Photo de profil"
                        />
                      ) : null}
                      <AvatarFallback className="bg-white text-primary font-extrabold">
                        {proInitials(user)}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">
                    {user.email ?? "Mon compte"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => navigateToTab("dashboard")}
                    className="gap-2"
                  >
                    <UserRound className="h-4 w-4" />
                    Mon espace pro
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => navigateToTab("account")}
                    className="gap-2"
                  >
                    <KeyRound className="h-4 w-4" />
                    Mon identifiant
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      void onSignOut();
                    }}
                    className="gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    Déconnexion
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Beta Version Banner - discrète sous les icônes */}
          {isTestMode() && (
            <div className="mt-3 text-center">
              <span className="text-xs text-white/60 font-medium">
                Version Bêta Test 1.0 Free
              </span>
            </div>
          )}
        </div>

        {selected && !role ? (
          <>
            <div className="mt-4">
              <Card className="border-slate-200">
                <CardContent className="p-3 space-y-2">
                  <div className="text-xs font-semibold text-slate-500">
                    Établissement
                  </div>
                  <Select
                    value={selected?.id ?? undefined}
                    onValueChange={(val) => {
                      writeSelectedEstablishmentId(val);
                      setSearchParams((prev) => {
                        const p = new URLSearchParams(prev);
                        p.set("eid", val);
                        return p;
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choisir un établissement" />
                    </SelectTrigger>
                    <SelectContent>
                      {establishments.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name || e.city || e.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Activer l’accès Pro</CardTitle>
                  <CardDescription>
                    Pour gérer vos réservations et vos packs, votre compte doit
                    être rattaché à cet établissement.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <Button
                    className="bg-primary text-white hover:bg-primary/90 font-bold"
                    disabled={
                      activating ||
                      !selected.created_by ||
                      selected.created_by !== user.id
                    }
                    onClick={async () => {
                      if (!selected) return;
                      setActivating(true);
                      try {
                        await activateOwnerMembership({
                          establishmentId: selected.id,
                        });
                        await refresh();
                      } finally {
                        setActivating(false);
                      }
                    }}
                  >
                    {activating ? "Activation…" : "Je suis le propriétaire"}
                  </Button>
                  <div className="text-sm text-slate-600">
                    Si le bouton est désactivé, contactez l’équipe SAM pour
                    associer votre compte.
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}

        {selected && role ? (
          <div className="mt-6">
            <ProLiveNotifications
              userId={user.id}
              establishment={selected}
              onOpenReservation={openReservationFromToast}
              onOpenPackPurchase={openPackPurchaseFromToast}
            />
            <Tabs
              value={activeTab}
              onValueChange={navigateToTab}
              className="w-full"
            >
              <div className="flex flex-col md:flex-row gap-6">
                <aside className="md:w-64 md:flex-shrink-0 md:sticky md:top-6 md:self-start">
                  <Card className="md:max-h-[calc(100vh-3rem)] md:overflow-auto">
                    <CardContent className="p-2 space-y-3">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-500 px-2">
                          Établissement
                        </div>
                        <Select
                          value={selected?.id ?? undefined}
                          onValueChange={(val) => {
                            writeSelectedEstablishmentId(val);
                            setSearchParams((prev) => {
                              const p = new URLSearchParams(prev);
                              p.set("eid", val);
                              return p;
                            });
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choisir un établissement" />
                          </SelectTrigger>
                          <SelectContent>
                            {establishments.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.name || e.city || e.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <TabsList className="w-full bg-transparent p-0 h-auto flex md:flex-col flex-row md:gap-1 gap-2 md:items-stretch items-center justify-start overflow-x-auto md:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <TabsTrigger
                          value="dashboard"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <LayoutDashboard className="w-4 h-4" />
                          Tableau de bord
                        </TabsTrigger>
                        {/* Hidden for now - Protection anti no-show tab
                        <TabsTrigger
                          value="impact"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <BarChart3 className="w-4 h-4" />
                          Protection anti no-show
                        </TabsTrigger>
                        */}
                        <TabsTrigger
                          value="establishment"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Store className="w-4 h-4" />
                          Fiche
                        </TabsTrigger>
                        <TabsTrigger
                          value="offers"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Tags className="w-4 h-4" />
                          Offres
                        </TabsTrigger>

                        <TabsTrigger
                          value="promotion"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Megaphone className="w-4 h-4" />
                          Packs & Promotions
                        </TabsTrigger>
                        <TabsTrigger
                          value="reservations"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <CalendarCheck className="w-4 h-4" />
                          Réservations
                        </TabsTrigger>
                        <TabsTrigger
                          value="reviews"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Star className="w-4 h-4" />
                          Avis
                        </TabsTrigger>
                        <TabsTrigger
                          value="waitlist"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <ListPlus className="w-4 h-4" />
                          Liste d’attente
                        </TabsTrigger>
                        <TabsTrigger
                          value="qr"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <QrCode className="w-4 h-4" />
                          Scan QR
                        </TabsTrigger>
                        <TabsTrigger
                          value="slots"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Settings className="w-4 h-4" />
                          Créneaux
                        </TabsTrigger>

                        <TabsTrigger
                          value="settings"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <SlidersHorizontal className="w-4 h-4" />
                          Paramètres
                        </TabsTrigger>
                        {showBillingTab && (
                          <TabsTrigger
                            value="billing"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <CreditCard className="w-4 h-4" />
                            Facturation
                          </TabsTrigger>
                        )}
                        <TabsTrigger
                          value="visibility"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Eye className="w-4 h-4" />
                          Visibilité
                        </TabsTrigger>
                        <TabsTrigger
                          value="ads"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Sparkles className="w-4 h-4" />
                          Publicités
                        </TabsTrigger>

                        <TabsTrigger
                          value="media"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Video className="w-4 h-4" />
                          Media Factory
                        </TabsTrigger>
{/* Hidden - Prestataires tab removed
                        <TabsTrigger
                          value="prestataires"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Briefcase className="w-4 h-4" />
                          Prestataires
                        </TabsTrigger>
                        */}
                        <TabsTrigger
                          value="notifications"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Bell className="w-4 h-4" />
                          Notifications
                        </TabsTrigger>
                        <TabsTrigger
                          value="team"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Users className="w-4 h-4" />
                          Équipe
                        </TabsTrigger>
                        <TabsTrigger
                          value="messages"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Messages
                          {mediaUnreadCount > 0 ? (
                            <span className="ml-auto min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-extrabold flex items-center justify-center">
                              {mediaUnreadCount > 99 ? "99+" : mediaUnreadCount}
                            </span>
                          ) : null}
                        </TabsTrigger>

                        <div className="hidden md:block my-2 h-px w-full bg-slate-200" />

                        <TabsTrigger
                          value="assistance"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <LifeBuoy className="w-4 h-4" />
                          Assistance
                        </TabsTrigger>
                      </TabsList>
                    </CardContent>
                  </Card>
                </aside>

                <section className="flex-1 min-w-0">
                  <TabsContent value="dashboard" className="mt-0">
                    <ProDashboardTab
                      establishment={selected}
                      role={role}
                      user={user}
                      onNavigateToTab={navigateToTab}
                    />
                  </TabsContent>

                  <TabsContent value="impact" className="mt-0">
                    <ProImpactTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="establishment" className="mt-0">
                    <ProEstablishmentTab
                      establishment={selected}
                      role={role}
                      onUpdated={refresh}
                      userId={user.id}
                      userEmail={user.email ?? null}
                    />
                  </TabsContent>

                  <TabsContent value="offers" className="mt-0">
                    <ProOffersTab
                      establishment={selected}
                      role={role}
                      onNavigateToTab={navigateToTab}
                    />
                  </TabsContent>

                  <TabsContent value="promotion" className="mt-0">
                    <ProPacksAndPromotionsTab
                      establishment={selected}
                      role={role}
                    />
                  </TabsContent>

                  <TabsContent value="reservations" className="mt-0">
                    <ProReservationsTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="reviews" className="mt-0">
                    <ProReviewsTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="waitlist" className="mt-0">
                    <ProWaitlistTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="qr" className="mt-0">
                    <ProQrScanTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="slots" className="mt-0">
                    <ProSlotsTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="settings" className="mt-0">
                    <ProSettingsTab establishment={selected} role={role} />
                  </TabsContent>

                  {showBillingTab && (
                    <TabsContent value="billing" className="mt-0">
                      <ProBillingTab establishment={selected} role={role} />
                    </TabsContent>
                  )}

                  <TabsContent value="visibility" className="mt-0">
                    <ProVisibilityTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="ads" className="mt-0">
                    <ProAdsTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="media" className="mt-0">
                    <ProMediaFactoryTab establishment={selected} role={role} />
                  </TabsContent>

{/* Hidden - Prestataires tab removed
                  <TabsContent value="prestataires" className="mt-0">
                    <ProPrestatairesTab establishment={selected} role={role} />
                  </TabsContent>
                  */}

                  <TabsContent value="notifications" className="mt-0">
                    <ProNotificationsTab
                      establishment={selected}
                      user={user}
                      onNavigateToTab={navigateToTab}
                    />
                  </TabsContent>

                  <TabsContent value="team" className="mt-0">
                    <ProTeamTab
                      establishment={selected}
                      role={role}
                      user={user}
                    />
                  </TabsContent>

                  <TabsContent value="messages" className="mt-0">
                    <ProMessagesTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="assistance" className="mt-0">
                    <ProAssistanceTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="account" className="mt-0">
                    <ProMyAccountTab user={user} />
                  </TabsContent>
                </section>
              </div>
            </Tabs>
          </div>
        ) : null}
      </div>

      {/* Force password change dialog for first login */}
      <ProForcePasswordChangeDialog
        open={passwordCheckDone && mustChangePassword}
        onPasswordChanged={() => setMustChangePassword(false)}
      />
    </main>
  );
}
