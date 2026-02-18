/**
 * RGPD Cookie Consent Banner
 *
 * This component displays a cookie consent banner in compliance with RGPD/GDPR.
 * Users must explicitly accept or reject non-essential cookies.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Cookie, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const CONSENT_KEY = "sam_cookie_consent";
const CONSENT_VERSION = "1.0"; // Update when policy changes

type ConsentLevel = "none" | "essential" | "analytics" | "all";

interface CookiePreferences {
  essential: boolean; // Always true, required
  analytics: boolean;
  marketing: boolean;
  personalization: boolean;
  version: string;
  timestamp: number;
}

const DEFAULT_PREFERENCES: CookiePreferences = {
  essential: true,
  analytics: false,
  marketing: false,
  personalization: false,
  version: CONSENT_VERSION,
  timestamp: 0,
};

function getStoredConsent(): CookiePreferences | null {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as CookiePreferences;

    // Check if consent is from current version
    if (parsed.version !== CONSENT_VERSION) {
      return null; // Force re-consent for policy changes
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveConsent(preferences: CookiePreferences): void {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore storage errors
  }
}

export function useCookieConsent() {
  const [preferences, setPreferences] = useState<CookiePreferences | null>(null);

  useEffect(() => {
    setPreferences(getStoredConsent());
  }, []);

  const updatePreferences = useCallback((newPrefs: CookiePreferences) => {
    saveConsent(newPrefs);
    setPreferences(newPrefs);
  }, []);

  return {
    preferences,
    hasConsented: preferences !== null,
    canUseAnalytics: preferences?.analytics ?? false,
    canUseMarketing: preferences?.marketing ?? false,
    canUsePersonalization: preferences?.personalization ?? false,
    updatePreferences,
  };
}

interface CookieConsentProps {
  className?: string;
}

export function CookieConsent({ className }: CookieConsentProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setLocalPreferences] = useState<CookiePreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    // Check if user has already given consent
    const stored = getStoredConsent();
    if (!stored) {
      // Small delay to not disturb initial page load
      const timer = setTimeout(() => setShowBanner(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = useCallback(() => {
    const newPrefs: CookiePreferences = {
      essential: true,
      analytics: true,
      marketing: true,
      personalization: true,
      version: CONSENT_VERSION,
      timestamp: Date.now(),
    };
    saveConsent(newPrefs);
    setShowBanner(false);
  }, []);

  const handleAcceptEssential = useCallback(() => {
    const newPrefs: CookiePreferences = {
      ...DEFAULT_PREFERENCES,
      version: CONSENT_VERSION,
      timestamp: Date.now(),
    };
    saveConsent(newPrefs);
    setShowBanner(false);
  }, []);

  const handleSavePreferences = useCallback(() => {
    const newPrefs: CookiePreferences = {
      ...preferences,
      essential: true, // Always required
      version: CONSENT_VERSION,
      timestamp: Date.now(),
    };
    saveConsent(newPrefs);
    setShowBanner(false);
    setShowDetails(false);
  }, [preferences]);

  if (!showBanner) return null;

  return (
    <div
      className={cn(
        "fixed bottom-20 sm:bottom-0 left-0 right-0 z-[60] bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg",
        "animate-in slide-in-from-bottom duration-500",
        className
      )}
      role="dialog"
      aria-label="Gestion des cookies"
      aria-modal="true"
    >
      <div className="container mx-auto px-4 py-4 md:py-6">
        {!showDetails ? (
          // Simple banner view
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Cookie className="h-6 w-6 text-[#a3001d] shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Nous utilisons des cookies pour améliorer votre expérience sur Sortir Au Maroc.
                  Les cookies essentiels sont nécessaires au fonctionnement du site.
                  Vous pouvez choisir d'accepter ou refuser les cookies optionnels.
                </p>
                <button
                  onClick={() => setShowDetails(true)}
                  className="text-sm text-[#a3001d] hover:text-[#8a0018] underline mt-1"
                >
                  En savoir plus et personnaliser
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAcceptEssential}
                className="flex-1 md:flex-none"
              >
                Refuser les optionnels
              </Button>
              <Button
                size="sm"
                onClick={handleAcceptAll}
                className="flex-1 md:flex-none bg-[#a3001d] hover:bg-[#8a0018] text-white"
              >
                Tout accepter
              </Button>
            </div>
          </div>
        ) : (
          // Detailed preferences view
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Paramètres des cookies
              </h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Fermer les détails"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Essential cookies - always on */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Cookies essentiels</span>
                  <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">
                    Requis
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Nécessaires au fonctionnement du site (authentification, panier, etc.)
                </p>
              </div>

              {/* Analytics cookies */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <label htmlFor="analytics" className="font-medium cursor-pointer">
                    Cookies analytiques
                  </label>
                  <input
                    type="checkbox"
                    id="analytics"
                    checked={preferences.analytics}
                    onChange={(e) =>
                      setLocalPreferences((p) => ({ ...p, analytics: e.target.checked }))
                    }
                    className="h-4 w-4 text-[#a3001d] rounded border-gray-300 focus:ring-[#a3001d]"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Nous aident à comprendre comment vous utilisez le site
                </p>
              </div>

              {/* Marketing cookies */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <label htmlFor="marketing" className="font-medium cursor-pointer">
                    Cookies marketing
                  </label>
                  <input
                    type="checkbox"
                    id="marketing"
                    checked={preferences.marketing}
                    onChange={(e) =>
                      setLocalPreferences((p) => ({ ...p, marketing: e.target.checked }))
                    }
                    className="h-4 w-4 text-[#a3001d] rounded border-gray-300 focus:ring-[#a3001d]"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Utilisés pour vous proposer des publicités personnalisées
                </p>
              </div>

              {/* Personalization cookies */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <label htmlFor="personalization" className="font-medium cursor-pointer">
                    Cookies de personnalisation
                  </label>
                  <input
                    type="checkbox"
                    id="personalization"
                    checked={preferences.personalization}
                    onChange={(e) =>
                      setLocalPreferences((p) => ({ ...p, personalization: e.target.checked }))
                    }
                    className="h-4 w-4 text-[#a3001d] rounded border-gray-300 focus:ring-[#a3001d]"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Permettent de personnaliser votre expérience
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAcceptEssential}
              >
                Refuser tous les optionnels
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAcceptAll}
              >
                Tout accepter
              </Button>
              <Button
                size="sm"
                onClick={handleSavePreferences}
                className="bg-[#a3001d] hover:bg-[#8a0018] text-white"
              >
                Enregistrer mes choix
              </Button>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Pour plus d'informations, consultez notre{" "}
              <a href="/content/politique-confidentialite" className="underline hover:text-[#a3001d]">
                Politique de confidentialité
              </a>{" "}
              et notre{" "}
              <a href="/content/politique-cookies" className="underline hover:text-[#a3001d]">
                Politique des cookies
              </a>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default CookieConsent;
