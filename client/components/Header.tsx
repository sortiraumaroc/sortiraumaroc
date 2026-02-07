import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LogOut, User } from "lucide-react";

import { UserNotificationsBell } from "@/components/UserNotificationsBell";
import { HeaderSearchBarWithUniverses } from "@/components/HeaderSearchBarWithUniverses";
import { MobileHeaderSearch } from "@/components/MobileHeaderSearch";

import { Button } from "@/components/ui/button";

import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";
import { addLocalePrefix, stripLocalePrefix } from "@/lib/i18n/types";
import { useScrollContext } from "@/lib/scrollContext";
import { cn } from "@/lib/utils";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { readSelectedEstablishmentId, writeSelectedEstablishmentId } from "@/lib/pro/establishmentSelection";
import { getProSession, listMyEstablishments } from "@/lib/pro/api";
import { proSupabase } from "@/lib/pro/supabase";

import { AuthModalV2 } from "@/components/AuthModalV2";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AUTH_CHANGED_EVENT, AUTH_MODAL_OPEN_EVENT, clearAuthed, isAuthed } from "@/lib/auth";
import { USER_DATA_CHANGED_EVENT, getUserProfile } from "@/lib/userData";

function initialsFromProfile(profile: ReturnType<typeof getUserProfile>, fallback: string): string {
  const first = (profile.firstName ?? "").trim();
  const last = (profile.lastName ?? "").trim();
  const fromContact = (profile.contact ?? "").trim();

  const parts = [first, last].filter(Boolean);
  if (!parts.length && fromContact) {
    return fromContact.slice(0, 2).toUpperCase();
  }

  const letters = parts
    .slice(0, 2)
    .map((p) => p[0])
    .filter(Boolean)
    .join("");

  return letters.toUpperCase() || fallback;
}

export function Header() {
  const { t, locale } = useI18n();
  const { isScrolledPastSearch } = useScrollContext();

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authed, setAuthed] = useState(isAuthed());
  const [profileTick, setProfileTick] = useState(0);

  const [proSignedIn, setProSignedIn] = useState(false);
  const [proConflictOpen, setProConflictOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const canonicalPathname = stripLocalePrefix(location.pathname);
  const isProRoute = canonicalPathname.startsWith("/pro");

  // Determine if we should show the scrolled state (red header with search bar)
  // Only on home page and results page
  const isSearchPage = canonicalPathname === "/" || canonicalPathname === "" || canonicalPathname.startsWith("/results");
  const showScrolledHeader = isScrolledPastSearch && isSearchPage;
  const selectedEstablishmentId = searchParams.get("eid");
  const [storedEstablishmentId, setStoredEstablishmentId] = useState<string | null>(() => readSelectedEstablishmentId());
  const [selectedEstablishmentName, setSelectedEstablishmentName] = useState<string | null>(null);

  const establishmentIdForLabel = selectedEstablishmentId ?? storedEstablishmentId;

  useEffect(() => {
    const syncAuth = () => setAuthed(isAuthed());
    const syncProfile = () => setProfileTick((v) => v + 1);
    const handleOpenAuthModal = () => setAuthModalOpen(true);

    window.addEventListener(AUTH_CHANGED_EVENT, syncAuth);
    window.addEventListener(USER_DATA_CHANGED_EVENT, syncProfile);
    window.addEventListener("storage", syncAuth);
    window.addEventListener(AUTH_MODAL_OPEN_EVENT, handleOpenAuthModal);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncAuth);
      window.removeEventListener(USER_DATA_CHANGED_EVENT, syncProfile);
      window.removeEventListener("storage", syncAuth);
      window.removeEventListener(AUTH_MODAL_OPEN_EVENT, handleOpenAuthModal);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const { data } = await getProSession();
      if (cancelled) return;
      setProSignedIn(!!data.session);
    };

    void sync();

    const { data: sub } = proSupabase.auth.onAuthStateChange(() => {
      void sync();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!selectedEstablishmentId) return;
    writeSelectedEstablishmentId(selectedEstablishmentId);
    setStoredEstablishmentId(selectedEstablishmentId);
  }, [selectedEstablishmentId]);

  useEffect(() => {
    let cancelled = false;

    const loadName = async () => {
      if (!establishmentIdForLabel) {
        setSelectedEstablishmentName(null);
        return;
      }

      try {
        if (!proSignedIn) {
          setSelectedEstablishmentName(null);
          return;
        }

        const establishments = await listMyEstablishments();
        if (cancelled) return;

        const found = establishments.find((e) => e.id === establishmentIdForLabel) ?? null;
        const name = found?.name ?? null;
        setSelectedEstablishmentName(name && name.trim() ? name.trim() : null);
      } catch {
        if (cancelled) return;
        setSelectedEstablishmentName(null);
      }
    };

    void loadName();

    return () => {
      cancelled = true;
    };
  }, [establishmentIdForLabel, proSignedIn]);

  const profile = useMemo(() => getUserProfile(), [profileTick, authed]);
  const avatarSrc = useMemo(() => {
    if (profile.avatarDataUrl) return profile.avatarDataUrl;

    const anyProfile = profile as unknown as Record<string, unknown>;
    const v = anyProfile.avatarUrl ?? anyProfile.avatar_url;
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  }, [profile]);

  const logout = () => {
    clearAuthed();
    setAuthed(false);
    if (canonicalPathname.startsWith("/profile")) navigate(addLocalePrefix("/", locale));
  };

  const openUserLogin = () => {
    if (proSignedIn && !authed) {
      setProConflictOpen(true);
      return;
    }
    setAuthModalOpen(true);
  };

  const brandInitials = useMemo(() => {
    const label = t("header.brand");
    const parts = String(label ?? "")
      .split(/\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const letters = parts
      .slice(0, 2)
      .map((p) => p[0])
      .filter(Boolean)
      .join("");
    return (letters || "SA").toUpperCase();
  }, [t]);

  const initials = useMemo(() => initialsFromProfile(profile, brandInitials), [brandInitials, profile]);

  const headerLabel = useMemo(() => {
    if (selectedEstablishmentName) return selectedEstablishmentName;
    if (isProRoute) return t("header.pro_space");
    return t("header.brand");
  }, [isProRoute, selectedEstablishmentName, t]);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 transition-all duration-300",
          showScrolledHeader
            ? "bg-primary border-b border-primary/80"
            : "border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80"
        )}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo - changes to megaphone + text when scrolled */}
            <Link to={addLocalePrefix("/", locale)} className="flex items-center gap-2 flex-shrink-0">
              {showScrolledHeader ? (
                <img
                  src="/Logo_SAM_N.png"
                  alt={t("header.logo_alt")}
                  className="h-16 sm:h-20 w-auto transition-all duration-300"
                />
              ) : (
                <img
                  src="/Logo_SAM_Officiel.png"
                  alt={t("header.logo_alt")}
                  className="h-16 sm:h-20 w-auto transition-all duration-300"
                />
              )}
            </Link>

            {/* Mobile: Full search bar when scrolled (city + search + button) */}
            {showScrolledHeader && (
              <div className="lg:hidden flex-1 ml-3">
                <MobileHeaderSearch
                  universe={searchParams.get("universe") || "restaurants"}
                />
              </div>
            )}

            {/* Desktop: Full search form appears in header when scrolled */}
            {showScrolledHeader && (
              <div className="hidden lg:block flex-1 mx-4 overflow-visible">
                <HeaderSearchBarWithUniverses />
              </div>
            )}

            {/* Actions - hidden on mobile when scrolled */}
            <div className={cn(
              "flex items-center gap-2 sm:gap-3",
              showScrolledHeader && "hidden lg:flex"
            )}>
              <Link to={addLocalePrefix("/ajouter-mon-etablissement", locale)} className="inline-flex">
                <Button
                  className={cn(
                    "h-10 rounded-md font-bold px-4 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                    showScrolledHeader
                      ? "bg-white text-primary hover:bg-white/90 focus-visible:ring-white"
                      : "bg-primary text-white hover:bg-primary/90 focus-visible:ring-primary"
                  )}
                >
                  <span className="hidden md:inline">{t("header.add_establishment.full")}</span>
                  <span className="md:hidden">{t("header.add_establishment.short")}</span>
                </Button>
              </Link>

              <LanguageSwitcher variant={showScrolledHeader ? "header-inverted" : "header"} />

              {authed ? <UserNotificationsBell enabled={authed} inverted={showScrolledHeader} /> : null}

              {authed ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "rounded-full border-2 transition overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                        showScrolledHeader
                          ? "border-white/50 hover:border-white focus-visible:ring-white"
                          : "border-primary/30 hover:border-primary/60 focus-visible:ring-primary"
                      )}
                      aria-label={t("header.profile.menu")}
                    >
                      <Avatar className="h-9 w-9">
                        {avatarSrc ? <AvatarImage src={avatarSrc} alt={t("header.profile.photo_alt")} /> : null}
                        <AvatarFallback
                          className={cn(
                            "font-extrabold transition-colors",
                            showScrolledHeader ? "bg-white text-primary" : "bg-primary text-white"
                          )}
                        >
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="truncate">
                      {[profile.firstName, profile.lastName].filter(Boolean).join(" ") || t("header.profile.my_account")}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => navigate(addLocalePrefix("/profile", locale))} className="gap-2">
                      <User className="h-4 w-4" />
                      {t("header.profile.my_profile")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        logout();
                      }}
                      className="gap-2"
                    >
                      <LogOut className="h-4 w-4" />
                      {t("header.profile.logout")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <button
                  type="button"
                  onClick={openUserLogin}
                  aria-label={t("header.login")}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 h-10 w-10 sm:w-auto px-2 sm:px-4 rounded-full sm:rounded-md border-2 transition-all duration-300",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                    showScrolledHeader
                      ? "border-white text-white hover:bg-white/15 focus-visible:ring-white"
                      : "border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 focus-visible:ring-primary"
                  )}
                >
                  <User className="w-5 h-5" strokeWidth={1.5} />
                  <span className="hidden sm:inline font-medium">{t("header.login")}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <AlertDialog open={proConflictOpen} onOpenChange={setProConflictOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("header.pro_conflict.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("header.pro_conflict.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:flex-col-reverse sm:items-stretch sm:justify-start sm:space-x-0">
            <AlertDialogCancel className="mt-0 w-full h-12 rounded-xl border border-primary/30 text-primary hover:bg-primary/5">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full h-12 rounded-xl bg-white text-primary border border-primary hover:bg-primary/10"
              onClick={() => {
                setProConflictOpen(false);
                setAuthModalOpen(false);
                navigate(addLocalePrefix("/pro", locale));
              }}
            >
              {t("header.pro_conflict.go_to_pro")}
            </AlertDialogAction>
            <AlertDialogAction
              className="w-full h-12 rounded-xl"
              onClick={async () => {
                await proSupabase.auth.signOut();
                setProSignedIn(false);
                setProConflictOpen(false);
                setAuthModalOpen(true);
              }}
            >
              {t("header.pro_conflict.logout_pro")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AuthModalV2
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthed={() => {
          setAuthed(true);
          setAuthModalOpen(false);
        }}
      />
    </>
  );
}
