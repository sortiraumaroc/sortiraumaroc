import { X } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function LanguageSuggestionBanner() {
  const { shouldShowLanguageSuggestion, dismissLanguageSuggestion, setLocale, t } = useI18n();

  if (!shouldShowLanguageSuggestion) return null;

  return (
    <div className="border-b border-slate-200 bg-slate-50">
      <div className="container mx-auto px-4 py-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{t("language.suggestion.title")}</div>
            <div className="text-xs text-slate-600">{t("language.suggestion.subtitle")}</div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => setLocale("fr", { persist: true })}
            >
              {t("language.french")} (FR)
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => setLocale("en", { persist: true })}
            >
              {t("language.english")} (EN)
            </Button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              onClick={dismissLanguageSuggestion}
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
