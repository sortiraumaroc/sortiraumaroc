/**
 * NavigationResumeToast
 *
 * Shows a toast/banner prompting the user to resume their previous navigation
 * when they return to the app.
 */

import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { X, ArrowRight, RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { isAuthed, AUTH_CHANGED_EVENT } from "@/lib/auth";
import {
  getSavedNavigationState,
  clearNavigationState,
  isResumePromptDismissed,
  dismissResumePrompt,
  NAV_STATE_RESUME_EVENT,
  NavigationState,
} from "@/lib/navigationState";

export function NavigationResumeToast() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [savedState, setSavedState] = useState<NavigationState | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Check for saved navigation state on mount and when auth changes
  useEffect(() => {
    const checkForSavedState = () => {
      // Only show for authenticated users
      if (!isAuthed()) {
        setIsVisible(false);
        return;
      }

      const state = getSavedNavigationState();

      // Don't show if:
      // - No saved state
      // - Already on the saved URL
      // - Prompt was dismissed
      if (
        !state ||
        location.pathname + location.search === state.url ||
        isResumePromptDismissed()
      ) {
        setIsVisible(false);
        return;
      }

      // Only show on homepage or simple pages (not on results/listing pages)
      const isOnSimplePage =
        location.pathname === "/" ||
        location.pathname === "/account" ||
        location.pathname === "/favorites";

      if (isOnSimplePage) {
        setSavedState(state);
        setIsVisible(true);
      }
    };

    // Check on mount
    checkForSavedState();

    // Listen for auth changes
    window.addEventListener(AUTH_CHANGED_EVENT, checkForSavedState);

    // Listen for manual trigger
    window.addEventListener(NAV_STATE_RESUME_EVENT, checkForSavedState);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, checkForSavedState);
      window.removeEventListener(NAV_STATE_RESUME_EVENT, checkForSavedState);
    };
  }, [location.pathname, location.search]);

  const handleResume = () => {
    if (savedState) {
      clearNavigationState();
      navigate(savedState.url);
      setIsExiting(true);
      setTimeout(() => setIsVisible(false), 300);
    }
  };

  const handleDismiss = () => {
    dismissResumePrompt();
    setIsExiting(true);
    setTimeout(() => setIsVisible(false), 300);
  };

  if (!isVisible || !savedState) return null;

  // Format saved time
  const savedDate = new Date(savedState.savedAt);
  const timeAgo = getTimeAgo(savedDate, t);

  return (
    <div
      className={`fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-md z-50 transition-all duration-300 ${
        isExiting ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
      }`}
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-primary/5 px-4 py-3 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2 text-primary">
            <RotateCcw className="w-4 h-4" />
            <span className="text-sm font-semibold">
              {t("navigation.resume.title")}
            </span>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-slate-100 rounded-full transition-colors"
            aria-label={t("common.close")}
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-slate-600 mb-1">
            {t("navigation.resume.description")}
          </p>

          {/* Saved state info */}
          <div className="bg-slate-50 rounded-xl p-3 mb-4">
            <p className="text-sm font-medium text-slate-900 truncate">
              {savedState.description || t("navigation.resume.search")}
            </p>
            <p className="text-xs text-slate-500 mt-1">{timeAgo}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleDismiss}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              {t("navigation.resume.new_search")}
            </button>
            <button
              onClick={handleResume}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors"
            >
              {t("navigation.resume.continue")}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Get a human-readable time ago string
 */
function getTimeAgo(date: Date, t: (key: string) => string): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 1) {
    return t("navigation.resume.just_now");
  } else if (diffMins < 60) {
    return t("navigation.resume.minutes_ago").replace("{n}", String(diffMins));
  } else if (diffHours < 24) {
    return t("navigation.resume.hours_ago").replace("{n}", String(diffHours));
  } else {
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

export default NavigationResumeToast;
