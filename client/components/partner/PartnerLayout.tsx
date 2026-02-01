import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  FileText,
  User as UserIcon,
  CreditCard,
  LogOut,
  RefreshCw,
  Menu,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Pause,
  MessageCircle,
  Bell,
  Megaphone,
  BookOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPartnerMe } from "@/lib/pro/api";
import {
  usePartnerUnreadCount,
  usePartnerNotifications,
} from "@/lib/mediaFactory/unreadHook";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type PartnerProfile = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  display_name: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  billing_status: string | null;
  legal_type: string | null;
  company_name: string | null;
  rib_iban: string | null;
  created_at: string;
};

type Props = {
  user: User;
  onSignOut: () => Promise<void>;
};

const ROLE_LABELS: Record<string, string> = {
  camera: "CAMÉRAMAN",
  editor: "MONTEUR",
  voice: "VOIX OFF",
  blogger: "BLOGUEUR",
  photographer: "PHOTOGRAPHE",
};

// Lowercase version for display in profile section
const ROLE_LABELS_LOWER: Record<string, string> = {
  camera: "Caméraman",
  editor: "Monteur",
  voice: "Voix off",
  blogger: "Blogueur",
  photographer: "Photographe",
};

const STATUS_LABELS: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  pending: { label: "EN ATTENTE", variant: "outline" },
  active: { label: "ACTIF", variant: "default" },
  paused: { label: "PAUSE", variant: "secondary" },
  disabled: { label: "DÉSACTIVÉ", variant: "destructive" },
};

const BILLING_STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  validated: {
    label: "RIB VALIDÉ",
    icon: CheckCircle2,
    className: "text-emerald-600",
  },
  pending: {
    label: "RIB EN ATTENTE",
    icon: AlertTriangle,
    className: "text-amber-600",
  },
  rejected: { label: "RIB REJETÉ", icon: XCircle, className: "text-red-600" },
};

const NAV_ITEMS_BASE = [
  {
    path: "/partners/dashboard",
    label: "Tableau de bord",
    icon: LayoutDashboard,
    roles: ["camera", "editor", "voice", "blogger", "photographer"],
  },
  {
    path: "/partners/articles",
    label: "Mes articles",
    icon: BookOpen,
    roles: ["blogger"],
  },
  { path: "/partners/profile", label: "Mon profil", icon: UserIcon, roles: [] },
  { path: "/partners/billing", label: "Facturation", icon: CreditCard, roles: [] },
  { path: "/partners/messages", label: "Messages", icon: MessageCircle, roles: [] },
];

// Filter nav items based on role (empty roles array = show to all)
function getNavItems(role: string | null | undefined) {
  return NAV_ITEMS_BASE.filter((item) => {
    if (item.roles.length === 0) return true;
    return item.roles.includes(role ?? "");
  });
}

export function PartnerLayout({ user, onSignOut }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Unread counts
  const { unreadCount: messagesUnread } = usePartnerUnreadCount();
  const {
    notifications,
    unreadCount: notificationsUnread,
    markAsRead,
    markAllAsRead,
  } = usePartnerNotifications();

  const loadProfile = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await getPartnerMe();
      setProfile(res.profile ?? null);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, [user.id]);

  // Redirect to dashboard if at /partners root
  useEffect(() => {
    if (
      location.pathname === "/partners" ||
      location.pathname === "/partners/"
    ) {
      navigate("/partners/dashboard", { replace: true });
    }
  }, [location.pathname, navigate]);

  const roleLabel = profile?.role
    ? ROLE_LABELS[profile.role] || profile.role.toUpperCase()
    : "—";
  const statusConfig = profile?.status
    ? STATUS_LABELS[profile.status] || {
        label: profile.status.toUpperCase(),
        variant: "secondary" as const,
      }
    : null;
  const billingConfig = profile?.billing_status
    ? BILLING_STATUS_CONFIG[profile.billing_status]
    : BILLING_STATUS_CONFIG.pending;
  const BillingIcon = billingConfig?.icon || AlertTriangle;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo + Title */}
            <div className="flex items-center gap-3">
              <Link
                to="/partners/dashboard"
                className="flex items-center gap-2"
              >
                <img
                  src="/logo-mediafactory.png"
                  alt="Media Factory"
                  className="w-8 h-8 rounded object-cover"
                />
                <div>
                  <div className="text-sm font-bold text-slate-900 leading-none">
                    MEDIA FACTORY
                  </div>
                  <div className="text-[10px] text-slate-500 leading-none mt-0.5">
                    Portail Partenaires
                  </div>
                </div>
              </Link>

              {/* Role + Status badges - desktop */}
              <div className="hidden md:flex items-center gap-2 ml-4">
                <Badge
                  variant="outline"
                  className="text-[10px] font-semibold border-[#a3001d] text-[#a3001d]"
                >
                  {roleLabel}
                </Badge>
                {statusConfig && (
                  <Badge variant={statusConfig.variant} className="text-[10px]">
                    {statusConfig.label}
                  </Badge>
                )}
                {billingConfig && (
                  <div
                    className={cn(
                      "flex items-center gap-1 text-[10px] font-medium",
                      billingConfig.className,
                    )}
                  >
                    <BillingIcon className="w-3 h-3" />
                    {billingConfig.label}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Notification Bell */}
              <DropdownMenu onOpenChange={(open) => {
                if (open && notificationsUnread > 0) {
                  void markAllAsRead();
                }
              }}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="relative p-2 rounded-full hover:bg-slate-100 transition hidden sm:flex"
                    aria-label={
                      notificationsUnread
                        ? `Notifications (${notificationsUnread} non lues)`
                        : "Notifications"
                    }
                  >
                    <Bell className="w-5 h-5 text-slate-600" />
                    {notificationsUnread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {notificationsUnread > 9 ? "9+" : notificationsUnread}
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-80 max-h-96 overflow-auto"
                >
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Notifications</span>
                    {notificationsUnread > 0 && (
                      <button
                        type="button"
                        className="text-xs text-[#a3001d] hover:underline"
                        onClick={() => void markAllAsRead()}
                      >
                        Tout marquer lu
                      </button>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 ? (
                    <div className="py-4 px-3 text-center text-sm text-slate-500">
                      Aucune notification
                    </div>
                  ) : (
                    notifications.slice(0, 10).map((n: any) => (
                      <DropdownMenuItem
                        key={n.id}
                        className={cn(
                          "flex flex-col items-start gap-0.5 py-2 cursor-pointer",
                          !n.read_at && "bg-red-50",
                        )}
                        onClick={() => {
                          void markAsRead(n.id);
                          if (n.job_id)
                            navigate(`/partners/dashboard?job=${n.job_id}`);
                        }}
                      >
                        <span className="text-sm font-medium">{n.title}</span>
                        {n.body && (
                          <span className="text-xs text-slate-500 line-clamp-2">
                            {n.body}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">
                          {new Date(n.created_at).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => void loadProfile(true)}
                disabled={refreshing}
                className="hidden sm:flex"
              >
                <RefreshCw
                  className={cn("h-4 w-4 mr-1", refreshing && "animate-spin")}
                />
                Rafraîchir
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void onSignOut()}
                className="hidden sm:flex gap-1"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden lg:inline">Déconnexion</span>
              </Button>

              {/* Mobile menu toggle */}
              <Button
                size="sm"
                variant="ghost"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 -mb-px">
            {getNavItems(profile?.role).map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              const Icon = item.icon;
              const isMessages = item.path === "/partners/messages";
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors relative",
                    isActive
                      ? "border-[#a3001d] text-[#a3001d]"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                  {isMessages && messagesUnread > 0 && (
                    <span className="ml-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {messagesUnread > 99 ? "99+" : messagesUnread}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            {/* Mobile badges */}
            <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b border-slate-100">
              <Badge
                variant="outline"
                className="text-[10px] font-semibold border-[#a3001d] text-[#a3001d]"
              >
                {roleLabel}
              </Badge>
              {statusConfig && (
                <Badge variant={statusConfig.variant} className="text-[10px]">
                  {statusConfig.label}
                </Badge>
              )}
              {billingConfig && (
                <div
                  className={cn(
                    "flex items-center gap-1 text-[10px] font-medium",
                    billingConfig.className,
                  )}
                >
                  <BillingIcon className="w-3 h-3" />
                  {billingConfig.label}
                </div>
              )}
            </div>

            {/* Mobile nav links */}
            <nav className="p-2">
              {getNavItems(profile?.role).map((item) => {
                const isActive = location.pathname.startsWith(item.path);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium",
                      isActive
                        ? "bg-red-50 text-[#a3001d]"
                        : "text-slate-700 hover:bg-slate-100",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                    {item.path === "/partners/messages" &&
                      messagesUnread > 0 && (
                        <span className="ml-auto min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {messagesUnread > 99 ? "99+" : messagesUnread}
                        </span>
                      )}
                  </Link>
                );
              })}

              <div className="border-t border-slate-100 mt-2 pt-2 space-y-1">
                <button
                  onClick={() => void loadProfile(true)}
                  disabled={refreshing}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 w-full"
                >
                  <RefreshCw
                    className={cn("w-4 h-4", refreshing && "animate-spin")}
                  />
                  Rafraîchir
                </button>
                <button
                  onClick={() => void onSignOut()}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 w-full"
                >
                  <LogOut className="w-4 h-4" />
                  Déconnexion
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-4 lg:py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : !profile ? (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
            <div className="text-slate-500 mb-4">
              Aucun profil partenaire associé à ce compte.
            </div>
            <p className="text-sm text-slate-400">
              Contactez l'administrateur pour configurer votre accès.
            </p>
          </div>
        ) : (
          <Outlet
            context={{ profile, refreshProfile: () => loadProfile(true) }}
          />
        )}
      </main>
    </div>
  );
}

export default PartnerLayout;
