import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { NotificationBody } from "@/components/NotificationBody";
import {
  Award,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarCheck,
  Car,
  Handshake,
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
  Moon,
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
import { ProGlobalSearch } from "@/components/pro/ProGlobalSearch";

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

import {
  getProProfileAvatar,
  subscribeToProProfileAvatarChanges,
} from "@/lib/pro/profile";
import { ProForcePasswordChangeDialog } from "@/components/pro/ProForcePasswordChangeDialog";
import { checkMustChangePassword, getOnboardingWizardProgress } from "@/lib/pro/api";
import type { OnboardingWizardProgress } from "@/lib/pro/types";
import { ProLiveNotifications } from "@/components/pro/ProLiveNotifications";
import { ProNotificationsSheet } from "@/components/pro/ProNotificationsSheet";
import { ProOnlineToggle } from "@/components/pro/ProOnlineToggle";
import { usePermissions } from "@/hooks/usePermissions";
import type { PermissionKey } from "../../../shared/permissionTypes";
import { useProUnreadCount } from "@/lib/mediaFactory/unreadHook";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";
import { universeSidebarLabel } from "@/components/pro/inventory/ProInventoryManager";
import { ProOnboardingTip } from "@/components/pro/ProOnboardingTip";

// ---------------------------------------------------------------------------
// Lazy-loaded tabs – each tab becomes its own chunk
// ---------------------------------------------------------------------------
const ProDashboardTab = lazy(() => import("@/components/pro/tabs/ProDashboardTab").then(m => ({ default: m.ProDashboardTab })));
const ProImpactTab = lazy(() => import("@/components/pro/tabs/ProImpactTab").then(m => ({ default: m.ProImpactTab })));
const ProEstablishmentTab = lazy(() => import("@/components/pro/tabs/ProEstablishmentTab").then(m => ({ default: m.ProEstablishmentTab })));
const ProReservationsTab = lazy(() => import("@/components/pro/tabs/ProReservationsTab").then(m => ({ default: m.ProReservationsTab })));
const ProWaitlistTab = lazy(() => import("@/components/pro/tabs/ProWaitlistTab").then(m => ({ default: m.ProWaitlistTab })));
const ProOffersTab = lazy(() => import("@/components/pro/tabs/ProOffersTab").then(m => ({ default: m.ProOffersTab })));
const ProSettingsTab = lazy(() => import("@/components/pro/tabs/ProSettingsTab").then(m => ({ default: m.ProSettingsTab })));
const ProMyAccountTab = lazy(() => import("@/components/pro/tabs/ProMyAccountTab").then(m => ({ default: m.ProMyAccountTab })));
const ProPacksAndPromotionsTab = lazy(() => import("@/components/pro/tabs/ProPacksAndPromotionsTab").then(m => ({ default: m.ProPacksAndPromotionsTab })));
const ProBillingTab = lazy(() => import("@/components/pro/tabs/ProBillingTab").then(m => ({ default: m.ProBillingTab })));
const ProVisibilityTab = lazy(() => import("@/components/pro/tabs/ProVisibilityTab").then(m => ({ default: m.ProVisibilityTab })));
const ProMediaFactoryTab = lazy(() => import("@/components/pro/tabs/ProMediaFactoryTab").then(m => ({ default: m.ProMediaFactoryTab })));
const ProNotificationsTab = lazy(() => import("@/components/pro/tabs/ProNotificationsTab").then(m => ({ default: m.ProNotificationsTab })));
const ProTeamTab = lazy(() => import("@/components/pro/tabs/ProTeamTab").then(m => ({ default: m.ProTeamTab })));
const ProAssistanceTab = lazy(() => import("@/components/pro/tabs/ProAssistanceTab").then(m => ({ default: m.ProAssistanceTab })));
const ProUnifiedScannerTab = lazy(() => import("@/components/pro/tabs/ProUnifiedScannerTab").then(m => ({ default: m.ProUnifiedScannerTab })));
const ProMessagesTab = lazy(() => import("@/components/pro/tabs/ProMessagesTab").then(m => ({ default: m.ProMessagesTab })));
const ProPrestatairesTab = lazy(() => import("@/components/pro/tabs/ProPrestatairesTab").then(m => ({ default: m.ProPrestatairesTab })));
const ProReviewsTab = lazy(() => import("@/components/pro/tabs/ProReviewsTab").then(m => ({ default: m.ProReviewsTab })));
const ProAdsTab = lazy(() => import("@/components/pro/ads/ProAdsTab").then(m => ({ default: m.ProAdsTab })));
const ProLoyaltyTab = lazy(() => import("@/components/pro/tabs/ProLoyaltyTab").then(m => ({ default: m.ProLoyaltyTab })));
const ProRentalTab = lazy(() => import("@/components/pro/tabs/ProRentalTab").then(m => ({ default: m.ProRentalTab })));
const ProRamadanTab = lazy(() => import("@/components/pro/tabs/ProRamadanTab"));
const ProConciergerieInboxTab = lazy(() => import("@/components/pro/tabs/ProConciergerieInboxTab"));
const ProPartnershipTab = lazy(() => import("@/components/pro/tabs/ProPartnershipTab").then(m => ({ default: m.ProPartnershipTab })));

// V2 lazy-loaded components
const ProReservationsV2Dashboard = lazy(() => import("@/components/reservationV2/ProReservationsV2Dashboard").then(m => ({ default: m.ProReservationsV2Dashboard })));
const ProLoyaltyV2Dashboard = lazy(() => import("@/components/loyaltyV2/ProLoyaltyV2Dashboard").then(m => ({ default: m.ProLoyaltyV2Dashboard })));
const ProPacksDashboard = lazy(() => import("@/components/packs/ProPacksDashboard").then(m => ({ default: m.ProPacksDashboard })));
const ProFinancesDashboard = lazy(() => import("@/components/packs/ProFinancesDashboard").then(m => ({ default: m.ProFinancesDashboard })));
const ProOnboardingWizard = lazy(() => import("@/components/pro/wizard/ProOnboardingWizard").then(m => ({ default: m.ProOnboardingWizard })));

const TabFallback = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

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
        "member-scan",
        "slots",
        "settings",
        "billing",
        "visibility",
        "ads",
        "media",
        "prestataires",
        "loyalty",
        "notifications",
        "team",
        "messages",
        "assistance",
        "account",
        "rental",
        "partnership",
      ]),
    [],
  );

  // State for forcing password change on first login
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [passwordCheckDone, setPasswordCheckDone] = useState(false);

  // Onboarding wizard state
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [wizardProgress, setWizardProgress] = useState<OnboardingWizardProgress | null>(null);
  const [wizardProgressLoaded, setWizardProgressLoaded] = useState(false);
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

  const { can, matrix: permissionMatrix, refetch: refetchPermissions } = usePermissions(selected?.id ?? null, role);

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
    // Load wizard progress
    void getOnboardingWizardProgress()
      .then(({ progress }) => {
        setWizardProgress(progress);
        setWizardProgressLoaded(true);
      })
      .catch(() => {
        setWizardProgressLoaded(true);
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

  // Sync tab with URL param only when establishment changes or on initial load.
  // navigateToTab already handles setActiveTab + setSearchParams together,
  // so we do NOT need to react to tabParam changes (doing so causes a race
  // condition where a click triggers navigateToTab → setSearchParams → tabParam
  // change → this effect re-fires, sometimes resetting to "dashboard" and
  // requiring a double-click).
  const prevSelectedId = useRef(selected?.id);
  useEffect(() => {
    if (prevSelectedId.current !== selected?.id) {
      prevSelectedId.current = selected?.id;
      const next = tabParam && allowedTabs.has(tabParam) ? tabParam : "dashboard";
      setActiveTab(next);
    }
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

        // Surface the issue sparingly so it's not "silently empty".
        const now = Date.now();
        if (now - lastNotificationsErrorAtRef.current > 60_000) {
          lastNotificationsErrorAtRef.current = now;
          const rawMsg =
            e instanceof Error
              ? e.message
              : "Impossible de charger les notifications";
          const msg = rawMsg === "Failed to fetch"
            ? "Connexion au serveur impossible — vérifiez votre connexion"
            : rawMsg;
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
              {/* Toggle En ligne / Hors ligne */}
              <ProOnlineToggle establishmentId={selected?.id ?? null} />

              <ProGlobalSearch onNavigateToTab={navigateToTab} />

              <Link
                to="/"
                className="h-10 w-10 rounded-full border border-white/30 bg-white/10 hover:bg-white/20 transition overflow-hidden flex items-center justify-center"
                aria-label="Aller à l'accueil Sortir Au Maroc"
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

              <button
                type="button"
                onClick={() => navigateToTab("scanner")}
                className="md:hidden h-10 w-10 rounded-full border border-white/30 bg-white/10 hover:bg-white/20 transition flex items-center justify-center"
                aria-label="Scanner QR"
                title="Scanner QR"
              >
                <QrCode className="w-5 h-5" />
              </button>

              <ProNotificationsSheet
                open={notificationsOpen}
                onOpenChange={setNotificationsOpen}
                establishment={selected}
                user={user}
                role={role}
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
                  <Card className="md:max-h-[calc(100vh-3rem)] md:overflow-auto h-fit">
                    <CardContent className="p-2 space-y-2">
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

                      <TabsList className="w-full bg-transparent p-0 h-auto flex md:flex-col flex-row md:gap-0.5 gap-2 md:items-stretch items-center justify-start overflow-x-auto md:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <TabsTrigger
                          value="dashboard"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <LayoutDashboard className="w-4 h-4" />
                          Tableau de bord
                        </TabsTrigger>
                        {/* Hidden for now - Protection anti no-show tab
                        <TabsTrigger
                          value="impact"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <BarChart3 className="w-4 h-4" />
                          Protection anti no-show
                        </TabsTrigger>
                        */}
                        {can("manage_profile") && (
                          <TabsTrigger
                            value="establishment"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <Store className="w-4 h-4" />
                            Fiche
                          </TabsTrigger>
                        )}
                        {can("manage_inventory") && (
                          <TabsTrigger
                            value="offers"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <Tags className="w-4 h-4" />
                            {universeSidebarLabel(selected)}
                          </TabsTrigger>
                        )}

                        {can("manage_offers") && (
                          <TabsTrigger
                            value="promotion"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <Megaphone className="w-4 h-4" />
                            {selected?.universe === "rentacar" ? "Offres & Promos" : "Packs & Promotions"}
                          </TabsTrigger>
                        )}
                        {can("manage_offers") && (
                          <TabsTrigger
                            value="ramadan"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <Moon className="w-4 h-4" />
                            🌙 Ramadan
                          </TabsTrigger>
                        )}
                        {can("manage_reservations") && (
                          <TabsTrigger
                            value="reservations"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <CalendarCheck className="w-4 h-4" />
                            {selected?.universe === "rentacar" ? "Locations" : "Réservations"}
                          </TabsTrigger>
                        )}
                        {selected?.universe === "rentacar" && (
                          <TabsTrigger
                            value="rental"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <Car className="w-4 h-4" />
                            Location
                          </TabsTrigger>
                        )}
                        {can("manage_reservations") && (
                          <TabsTrigger
                            value="waitlist"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <ListPlus className="w-4 h-4" />
                            Liste d'attente
                          </TabsTrigger>
                        )}
                        {can("manage_profile") && (
                          <TabsTrigger
                            value="reviews"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <Star className="w-4 h-4" />
                            Avis
                          </TabsTrigger>
                        )}
                        {can("manage_reservations") && (
                          <TabsTrigger
                            value="scanner"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <QrCode className="w-4 h-4" />
                            Scanner QR
                          </TabsTrigger>
                        )}
                        {can("manage_offers") && (
                          <TabsTrigger
                            value="loyalty"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <Award className="w-4 h-4" />
                            Fidélité
                          </TabsTrigger>
                        )}
                        {can("manage_profile") && (
                          <TabsTrigger
                            value="settings"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <SlidersHorizontal className="w-4 h-4" />
                            Paramètres
                          </TabsTrigger>
                        )}
                        {showBillingTab && can("view_billing") && (
                          <TabsTrigger
                            value="billing"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <CreditCard className="w-4 h-4" />
                            Facturation
                          </TabsTrigger>
                        )}
                        {can("manage_offers") && (
                          <TabsTrigger
                            value="visibility"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <Eye className="w-4 h-4" />
                            Visibilité
                          </TabsTrigger>
                        )}
                        {can("manage_offers") && (
                          <TabsTrigger
                            value="ads"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <Sparkles className="w-4 h-4" />
                            Publicités
                          </TabsTrigger>
                        )}

                        {can("manage_offers") && (
                          <TabsTrigger
                            value="media"
                            className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <Video className="w-4 h-4" />
                            Media Factory
                          </TabsTrigger>
                        )}
{/* Hidden - Prestataires tab removed
                        <TabsTrigger
                          value="prestataires"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Briefcase className="w-4 h-4" />
                          Prestataires
                        </TabsTrigger>
                        */}
                        <TabsTrigger
                          value="conciergerie"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Building2 className="w-4 h-4" />
                          Conciergerie
                        </TabsTrigger>
                        <TabsTrigger
                          value="partnership"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Handshake className="w-4 h-4" />
                          Partenariat
                        </TabsTrigger>
                        <TabsTrigger
                          value="notifications"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Bell className="w-4 h-4" />
                          Notifications
                        </TabsTrigger>
                        <TabsTrigger
                          value="team"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <Users className="w-4 h-4" />
                          Équipe
                        </TabsTrigger>
                        <TabsTrigger
                          value="messages"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Messages
                          {mediaUnreadCount > 0 ? (
                            <span className="ms-auto min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-extrabold flex items-center justify-center">
                              {mediaUnreadCount > 99 ? "99+" : mediaUnreadCount}
                            </span>
                          ) : null}
                        </TabsTrigger>

                        <div className="hidden md:block my-1 h-px w-full bg-slate-200" />

                        <TabsTrigger
                          value="assistance"
                          className="w-auto md:w-full shrink-0 justify-start font-bold gap-2 rounded-md px-3 py-1.5 text-slate-700 hover:bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <LifeBuoy className="w-4 h-4" />
                          Assistance
                        </TabsTrigger>
                      </TabsList>
                    </CardContent>
                  </Card>
                </aside>

                <section className="flex-1 min-w-0">
                  <Suspense fallback={<TabFallback />}>
                  <TabsContent value="dashboard" className="mt-0">
                    <ProOnboardingTip
                      tipKey="dashboard"
                      title="Bienvenue sur votre tableau de bord !"
                      message="Retrouvez ici un apercu de votre activité : réservations récentes, statistiques clés et notifications importantes. C'est votre point de départ pour gérer votre établissement."
                    />
                    {/* Resume wizard banner */}
                    {wizardProgressLoaded && wizardProgress && !wizardProgress.completed && !showOnboardingWizard && (
                      <div className="mb-4 flex items-center justify-between rounded-lg border border-[#a3001d]/20 bg-[#a3001d]/5 p-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            Votre fiche est incomplète
                          </p>
                          <p className="text-xs text-gray-500">
                            Reprenez le wizard pour compléter votre fiche d'établissement.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowOnboardingWizard(true)}
                          className="shrink-0 rounded-lg bg-[#a3001d] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#8a0018]"
                        >
                          Reprendre
                        </button>
                      </div>
                    )}
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
                    <ProOnboardingTip
                      tipKey="establishment"
                      title="Votre fiche établissement"
                      message="Complétez votre fiche avec soin : photos, description, horaires et coordonnées. Une fiche complète et attractive attire plus de clients et améliore votre visibilité sur la plateforme."
                    />
                    <ProEstablishmentTab
                      establishment={selected}
                      role={role}
                      onUpdated={refresh}
                      userId={user.id}
                      userEmail={user.email ?? null}
                    />
                  </TabsContent>

                  <TabsContent value="offers" className="mt-0">
                    <ProOnboardingTip
                      tipKey="offers"
                      title={selected?.universe === "rentacar" ? "Votre flotte de véhicules" : "Votre carte / menu"}
                      message={selected?.universe === "rentacar"
                        ? "Ajoutez ici vos véhicules avec photos, caractéristiques et tarifs. Ils seront affichés sur votre fiche publique pour que vos clients puissent découvrir votre offre de location."
                        : "Ajoutez ici vos offres, plats ou prestations avec photos et prix. Ces éléments seront affichés sur votre fiche publique et permettront à vos clients de découvrir ce que vous proposez."}
                    />
                    <ProOffersTab
                      establishment={selected}
                      role={role}
                      onNavigateToTab={navigateToTab}
                    />
                  </TabsContent>

                  <TabsContent value="promotion" className="mt-0">
                    <ProOnboardingTip
                      tipKey="promotion"
                      title={selected?.universe === "rentacar" ? "Offres & Promotions" : "Packs & Promotions"}
                      message={selected?.universe === "rentacar"
                        ? "Créez des offres spéciales (tarifs week-end, packs longue durée, promotions saisonnières) et des codes promo pour attirer plus de clients et booster vos locations."
                        : "Créez des packs attractifs (menus, offres spéciales, coffrets cadeaux) et des codes promo pour fidéliser vos clients et booster vos ventes. Les packs apparaissent directement sur votre fiche."}
                    />
                    <ProPacksDashboard
                      establishmentId={selected.id}
                    />
                  </TabsContent>

                  <TabsContent value="ramadan" className="mt-0">
                    <Suspense fallback={<div className="py-8 text-center text-slate-400">Chargement...</div>}>
                      <ProRamadanTab establishmentId={selected.id} />
                    </Suspense>
                  </TabsContent>

                  <TabsContent value="reservations" className="mt-0">
                    <ProOnboardingTip
                      tipKey="reservations"
                      title={selected?.universe === "rentacar" ? "Réservations de véhicules" : "Réservations & Créneaux"}
                      message={selected?.universe === "rentacar"
                        ? "Gérez les réservations de vos véhicules. Configurez les disponibilités et les créneaux de retrait/retour pour que vos clients puissent réserver en ligne."
                        : "Commencez par créer des créneaux (horaires disponibles) pour que vos clients puissent réserver. Sans créneaux configurés, aucune réservation ne pourra être effectuée. Vous pouvez créer des créneaux en masse sur plusieurs jours en un seul clic !"}
                    />
                    <ProReservationsV2Dashboard establishmentId={selected.id} establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="reviews" className="mt-0">
                    <ProOnboardingTip
                      tipKey="reviews"
                      title={selected?.universe === "rentacar" ? "Avis locataires" : "Avis clients"}
                      message={selected?.universe === "rentacar"
                        ? "Consultez et gérez les avis laissés par vos locataires. De bons avis améliorent votre classement et rassurent les futurs clients. Répondez aux avis pour montrer votre engagement."
                        : "Consultez et gérez les avis laissés par vos clients. De bons avis améliorent votre classement et rassurent les futurs visiteurs. Répondez aux avis pour montrer votre engagement."}
                    />
                    <ProReviewsTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="waitlist" className="mt-0">
                    <ProOnboardingTip
                      tipKey="waitlist"
                      title="Liste d'attente"
                      message="Lorsqu'un créneau est complet, vos clients peuvent s'inscrire en liste d'attente. Vous serez notifié et pourrez les contacter si une place se libère."
                    />
                    <ProWaitlistTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="scanner" className="mt-0">
                    <ProOnboardingTip
                      tipKey="scanner"
                      title="Scanner QR"
                      message="Utilisez le scanner pour valider la présence de vos clients à leur arrivée. Scannez le QR code de leur réservation depuis votre téléphone ou tablette pour confirmer leur venue."
                    />
                    <ProUnifiedScannerTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="loyalty" className="mt-0">
                    <ProOnboardingTip
                      tipKey="loyalty"
                      title={selected?.universe === "rentacar" ? "Fidélisation locataires" : "Programme de fidélité"}
                      message={selected?.universe === "rentacar"
                        ? "Récompensez vos locataires réguliers avec un programme de fidélité. Définissez des paliers et des avantages pour encourager les locations répétées et fidéliser votre clientèle."
                        : "Récompensez vos clients réguliers avec un programme de fidélité. Définissez des paliers et des récompenses pour encourager les visites répétées et créer une communauté fidèle."}
                    />
                    <ProLoyaltyV2Dashboard
                      establishmentId={selected.id}
                      establishmentName={selected.name ?? ""}
                      role={role}
                    />
                  </TabsContent>

                  <TabsContent value="settings" className="mt-0">
                    <ProOnboardingTip
                      tipKey="settings"
                      title="Paramètres"
                      message="Configurez ici les paramètres avancés de votre établissement : politique d'annulation, délais de réservation, notifications automatiques et préférences de gestion."
                    />
                    <ProSettingsTab establishment={selected} role={role} />
                  </TabsContent>

                  {showBillingTab && (
                    <TabsContent value="billing" className="mt-0">
                      <ProOnboardingTip
                        tipKey="billing"
                        title="Facturation"
                        message="Suivez vos revenus, commissions et factures. Consultez vos périodes de facturation, soumettez vos appels à facture et suivez vos paiements en toute transparence."
                      />
                      <ProFinancesDashboard establishmentId={selected.id} />
                    </TabsContent>
                  )}

                  <TabsContent value="visibility" className="mt-0">
                    <ProOnboardingTip
                      tipKey="visibility"
                      title="Visibilité"
                      message="Boostez votre visibilité sur la plateforme grâce à des options de mise en avant : position premium dans les résultats, badges spéciaux et mise en avant sur la page d'accueil."
                    />
                    <ProVisibilityTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="ads" className="mt-0">
                    <ProOnboardingTip
                      tipKey="ads"
                      title="Publicités"
                      message="Lancez des campagnes publicitaires ciblées pour toucher de nouveaux clients. Définissez votre budget, votre audience et suivez les performances de vos annonces en temps réel."
                    />
                    <ProAdsTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="media" className="mt-0">
                    <ProOnboardingTip
                      tipKey="media"
                      title="Media Factory"
                      message="Créez et gérez du contenu média professionnel pour votre établissement : photos, vidéos et supports visuels qui seront utilisés sur votre fiche et vos publicités."
                    />
                    <ProMediaFactoryTab establishment={selected} role={role} />
                  </TabsContent>

{/* Hidden - Prestataires tab removed
                  <TabsContent value="prestataires" className="mt-0">
                    <ProPrestatairesTab establishment={selected} role={role} />
                  </TabsContent>
                  */}

                  <TabsContent value="notifications" className="mt-0">
                    <ProOnboardingTip
                      tipKey="notifications"
                      title="Notifications"
                      message={selected?.universe === "rentacar"
                        ? "Retrouvez ici toutes vos notifications : nouvelles locations, avis locataires, alertes système et messages importants. Activez les notifications push pour ne rien manquer."
                        : "Retrouvez ici toutes vos notifications : nouvelles réservations, avis clients, alertes système et messages importants. Activez les notifications push pour ne rien manquer."}
                    />
                    <ProNotificationsTab
                      establishment={selected}
                      user={user}
                      onNavigateToTab={navigateToTab}
                    />
                  </TabsContent>

                  <TabsContent value="team" className="mt-0">
                    <ProOnboardingTip
                      tipKey="team"
                      title="Gestion d'équipe"
                      message="Invitez les membres de votre équipe et attribuez-leur des rôles (manager, marketing, staff). Chaque rôle a des permissions spécifiques pour gérer l'établissement en toute sécurité."
                    />
                    <ProTeamTab
                      establishment={selected}
                      role={role}
                      user={user}
                      can={can}
                      permissionMatrix={permissionMatrix}
                      refetchPermissions={refetchPermissions}
                    />
                  </TabsContent>

                  <TabsContent value="messages" className="mt-0">
                    <ProOnboardingTip
                      tipKey="messages"
                      title="Messages"
                      message="Échangez directement avec vos clients et l'équipe SAM. Répondez rapidement aux demandes pour offrir une expérience client exceptionnelle."
                    />
                    <ProMessagesTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="assistance" className="mt-0">
                    <ProOnboardingTip
                      tipKey="assistance"
                      title="Besoin d'aide ?"
                      message="Notre équipe est là pour vous accompagner. Consultez les guides d'utilisation, la FAQ ou contactez directement le support SAM pour toute question."
                    />
                    <ProAssistanceTab establishment={selected} role={role} />
                  </TabsContent>

                  <TabsContent value="rental" className="mt-0">
                    {selected && <ProRentalTab establishment={selected} />}
                  </TabsContent>

                  <TabsContent value="conciergerie" className="mt-0">
                    <ProConciergerieInboxTab establishmentId={selected?.id} />
                  </TabsContent>

                  <TabsContent value="partnership" className="mt-0">
                    {selected && <ProPartnershipTab establishmentId={selected.id} />}
                  </TabsContent>

                  <TabsContent value="account" className="mt-0">
                    <ProMyAccountTab user={user} />
                  </TabsContent>
                  </Suspense>
                </section>
              </div>
            </Tabs>
          </div>
        ) : null}
      </div>

      {/* Force password change dialog for first login */}
      <ProForcePasswordChangeDialog
        open={passwordCheckDone && mustChangePassword}
        onPasswordChanged={() => {
          setMustChangePassword(false);
          // After password change, show wizard if not already completed
          if (wizardProgressLoaded && (!wizardProgress || !wizardProgress.completed)) {
            setShowOnboardingWizard(true);
          }
        }}
      />

      {/* Onboarding wizard (full screen overlay) */}
      {showOnboardingWizard && selected && (
        <Suspense fallback={<TabFallback />}>
          <ProOnboardingWizard
            establishment={selected as unknown as Record<string, unknown>}
            initialProgress={wizardProgress}
            onClose={() => setShowOnboardingWizard(false)}
            onCompleted={() => {
              setShowOnboardingWizard(false);
              setWizardProgress((prev) =>
                prev ? { ...prev, completed: true } : null,
              );
              void refresh();
            }}
          />
        </Suspense>
      )}
    </main>
  );
}
