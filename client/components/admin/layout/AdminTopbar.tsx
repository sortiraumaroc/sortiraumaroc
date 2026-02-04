import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { LogOut, Menu, User, ChevronDown } from "lucide-react";

import { NotificationBody } from "@/components/NotificationBody";
import { AdminNotificationsSheet } from "@/components/admin/notifications/AdminNotificationsSheet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MyProfileDialog } from "@/components/admin/MyProfileDialog";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import {
  getAdminNotificationPreferences,
  subscribeToAdminNotificationPreferencesChanges,
  type AdminNotificationPreferences,
} from "@/lib/adminNotificationPreferences";
import { playAdminNotificationSound } from "@/lib/adminNotificationSound";
import { decodeAdminSessionToken, getAdminMyProfile, getAdminNotificationsUnreadCount, listAdminNotifications, type AdminNotification, type AdminMyProfile } from "@/lib/adminApi";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { AdminSidebar } from "@/components/admin/layout/AdminSidebar";
import { AdminBreadcrumbs } from "@/components/admin/layout/AdminBreadcrumbs";
import { AdminGlobalSearch } from "@/components/admin/layout/AdminGlobalSearch";

import { normalizeNotificationEventType } from "@shared/notifications";

function getMaxCreatedAt(items: AdminNotification[]): string | null {
  let max: string | null = null;
  for (const item of items) {
    const raw = typeof item.created_at === "string" ? item.created_at : "";
    if (!raw) continue;
    const dt = new Date(raw);
    if (!Number.isFinite(dt.getTime())) continue;
    const iso = dt.toISOString();
    if (!max || iso > max) max = iso;
  }
  return max;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super-administrateur",
  admin: "Administrateur",
  ops: "Opérations",
  marketing: "Marketing",
  support: "Support Client",
  accounting: "Comptabilité",
  comptabilite: "Comptabilité",
  moderateur: "Modérateur",
};

function getRoleLabel(roleId: string | null | undefined): string {
  if (!roleId) return "Collaborateur";
  return ROLE_LABELS[roleId] ?? roleId;
}

export function AdminTopbar(props: { onSignOut: () => void }) {
  const navigate = useNavigate();
  const adminKey = undefined;

  // Get logged-in collaborator info from session token
  const sessionPayload = useMemo(() => decodeAdminSessionToken(), []);
  const displayName = sessionPayload?.name || sessionPayload?.sub || "Admin";
  const roleLabel = getRoleLabel(sessionPayload?.role);

  const [unread, setUnread] = useState(0);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<AdminMyProfile | null>(null);

  // Fetch user profile to get avatar
  const fetchUserProfile = useCallback(async () => {
    try {
      const res = await getAdminMyProfile(adminKey);
      setUserProfile(res.profile);
    } catch {
      // Ignore errors, we'll fall back to initials
    }
  }, [adminKey]);

  useEffect(() => {
    void fetchUserProfile();
  }, [fetchUserProfile]);

  // Get avatar URL and display name from profile (or fallback to session token)
  const avatarUrl = userProfile?.avatarUrl ?? null;
  const profileDisplayName = userProfile?.displayName || userProfile?.firstName || displayName;

  const [preferences, setPreferences] = useState<AdminNotificationPreferences>(() => getAdminNotificationPreferences());
  const preferencesRef = useRef(preferences);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  const [lastSeenAt, setLastSeenAt] = useState(() => new Date().toISOString());
  const lastSeenAtRef = useRef(lastSeenAt);

  useEffect(() => {
    lastSeenAtRef.current = lastSeenAt;
  }, [lastSeenAt]);

  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return subscribeToAdminNotificationPreferencesChanges(() => {
      setPreferences(getAdminNotificationPreferences());
    });
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await getAdminNotificationsUnreadCount(adminKey);
      setUnread(res.unread ?? 0);
    } catch {
      setUnread(0);
    }
  }, [adminKey]);

  const openFromToast = useCallback(() => {
    navigate("/admin/notifications");
  }, [navigate]);

  const pollNewNotifications = useCallback(async () => {
    await refreshUnread();

    let res: { items: AdminNotification[] };
    try {
      res = await listAdminNotifications(adminKey, { after: lastSeenAtRef.current, limit: 25 });
    } catch {
      return;
    }

    const raw = (res.items ?? []) as AdminNotification[];
    if (!raw.length) return;

    const nextLastSeen = getMaxCreatedAt(raw) ?? null;
    if (nextLastSeen) setLastSeenAt(nextLastSeen);

    const unseen = raw.filter((n) => {
      if (!n?.id) return false;
      if (seenIdsRef.current.has(n.id)) return false;
      return true;
    });

    if (!unseen.length) return;

    for (const n of unseen) {
      if (n?.id) seenIdsRef.current.add(n.id);
    }

    const pref = preferencesRef.current;
    if (!pref.popupsEnabled) return;

    if (pref.soundEnabled) playAdminNotificationSound();

    const itemsToToast = [...unseen].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const windowMs = 10_000;
    const groups: AdminNotification[][] = [];

    for (const n of itemsToToast) {
      const lastGroup = groups[groups.length - 1];
      const last = lastGroup?.[lastGroup.length - 1];

      const t = new Date(n.created_at).getTime();
      const lastT = last ? new Date(last.created_at).getTime() : NaN;

      const type = normalizeNotificationEventType(n.type) ?? String(n.type ?? "");
      const lastType = last ? normalizeNotificationEventType(last.type) ?? String(last.type ?? "") : "";

      const canAppend =
        !!lastGroup &&
        type &&
        type === lastType &&
        Number.isFinite(t) &&
        Number.isFinite(lastT) &&
        Math.abs(t - lastT) <= windowMs;

      if (canAppend) {
        lastGroup.push(n);
      } else {
        groups.push([n]);
      }
    }

    for (const group of groups) {
      const first = group[0];
      if (!first) continue;

      const count = group.length;
      const baseTitle = first.title || "Notification";
      const title = count >= 3 ? `${baseTitle} (+${count - 1})` : baseTitle;

      const bodies = group.map((x) => String(x.body ?? "").trim()).filter(Boolean);
      const bodyPreview = bodies.slice(0, 3).join("\n");
      const extra = bodies.length > 3 ? `\n… +${bodies.length - 3} autres` : "";

      toast({
        title,
        description: <NotificationBody body={`${bodyPreview}${extra}`} className="text-sm text-slate-700" dateClassName="text-[0.75rem]" />,
        action: (
          <ToastAction altText="Ouvrir" onClick={() => openFromToast()}>
            Ouvrir
          </ToastAction>
        ),
      });
    }
  }, [adminKey, openFromToast, refreshUnread]);

  useEffect(() => {
    void refreshUnread();

    const tick = window.setInterval(() => {
      void pollNewNotifications();
    }, 8000);

    return () => {
      window.clearInterval(tick);
    };
  }, [pollNewNotifications, refreshUnread]);

  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Ouvrir la navigation">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-4">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Navigation</SheetTitle>
                  </SheetHeader>
                  <AdminSidebar />
                </SheetContent>
              </Sheet>
            </div>

          </div>

          <div className="flex items-center gap-2">
            <AdminGlobalSearch />

            <AdminNotificationsSheet
              adminKey={adminKey}
              unreadCount={unread}
              onUnreadCountChange={setUnread}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200 hover:bg-slate-50 rounded-md px-2 py-1 -my-1 transition-colors">
                  <Avatar className="w-8 h-8">
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt={profileDisplayName} /> : null}
                    <AvatarFallback className="bg-[#a3001d]/10 text-[#a3001d] font-bold text-xs">
                      {profileDisplayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:block text-left">
                    <div className="text-sm font-semibold text-slate-900 leading-none">
                      {profileDisplayName}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-none mt-0.5">
                      {roleLabel}
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-400 hidden md:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setProfileDialogOpen(true)} className="gap-2 cursor-pointer">
                  <User className="h-4 w-4" />
                  Mon profil
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={props.onSignOut} className="gap-2 cursor-pointer text-red-600 focus:text-red-600">
                  <LogOut className="h-4 w-4" />
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile logout button */}
            <Button variant="outline" size="icon" onClick={props.onSignOut} aria-label="Déconnexion" title="Déconnexion" className="sm:hidden">
              <LogOut className="h-4 w-4" />
            </Button>

            <MyProfileDialog
              open={profileDialogOpen}
              onOpenChange={setProfileDialogOpen}
              onProfileUpdated={fetchUserProfile}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
