import { useMemo } from "react";
import { Globe } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { localizePath, LOCALE_NAMES, SUPPORTED_APP_LOCALES, type AppLocale } from "@/lib/i18n/types";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type LanguageSwitcherProps = {
  currentLocale?: AppLocale;
  onLocaleChange?: (locale: AppLocale) => void;
  variant?: "header" | "header-inverted" | "footer" | "inline-booking";
  deviceType?: "mobile" | "desktop";
  className?: string;
};

function localeFlag(locale: AppLocale): string {
  switch (locale) {
    case "en": return "🇬🇧";
    case "es": return "🇪🇸";
    case "it": return "🇮🇹";
    case "ar": return "🇲🇦";
    default: return "🇫🇷";
  }
}

export function LanguageSwitcher({
  currentLocale,
  onLocaleChange,
  variant = "header",
  deviceType,
  className,
}: LanguageSwitcherProps) {
  const isMobile = useIsMobile();
  const { locale: ctxLocale, setLocale: setCtxLocale, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const activeLocale = currentLocale ?? ctxLocale;

  const changeLocale = (next: AppLocale) => {
    if (onLocaleChange) {
      onLocaleChange(next);
      return;
    }

    setCtxLocale(next, { persist: true });

    const nextPathname = localizePath(location.pathname, next);
    const nextUrl = `${nextPathname}${location.search}${location.hash}`;
    const currentUrl = `${location.pathname}${location.search}${location.hash}`;
    if (nextUrl !== currentUrl) {
      navigate(nextUrl, { replace: true });
    }
  };

  const effectiveDevice = deviceType ?? (isMobile ? "mobile" : "desktop");

  const options = useMemo(
    () =>
      SUPPORTED_APP_LOCALES.map((loc) => ({
        locale: loc,
        label: LOCALE_NAMES[loc],
      })),
    [],
  );

  const isInverted = variant === "header-inverted";

  const triggerBase = cn(
    "inline-flex items-center justify-center rounded-md border transition-all duration-300",
    isInverted
      ? "border-white/50 bg-transparent text-white hover:bg-white/10 focus:ring-white"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus:ring-primary",
    "focus:outline-none focus:ring-2",
  );

  const triggerClassName = cn(
    triggerBase,
    variant === "header" || variant === "header-inverted" ? "h-10 w-10 p-0" : "h-9 px-2 gap-2",
    variant === "inline-booking" ? "h-10 w-10 p-0" : "",
    className,
  );

  const showLocaleCode = variant !== "inline-booking" && variant !== "header" && variant !== "header-inverted";
  const showFlag = variant === "header" || variant === "header-inverted" || variant === "inline-booking";

  const dropdownContentClassName = cn("w-48", effectiveDevice === "mobile" ? "me-1" : "");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={triggerClassName} aria-label={t("language.switcher.label")}>
          {showFlag ? (
            <span aria-hidden className="text-lg leading-none">
              {localeFlag(activeLocale)}
            </span>
          ) : (
            <Globe className="h-4 w-4" />
          )}
          {showLocaleCode ? <span className="text-xs font-bold tracking-wide">{activeLocale.toUpperCase()}</span> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={dropdownContentClassName}>
        <DropdownMenuLabel>{t("language.switcher.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={activeLocale} onValueChange={(value) => changeLocale((value as AppLocale) || "fr")}>
          {options.map((opt) => (
            <DropdownMenuRadioItem key={opt.locale} value={opt.locale}>
              <span className="flex items-center gap-2">
                <span aria-hidden className="text-base leading-none">
                  {localeFlag(opt.locale)}
                </span>
                <span>{opt.label}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
