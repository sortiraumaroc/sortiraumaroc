import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Calendar,
  Globe,
  Mail,
  Megaphone,
  Smartphone,
  Star,
} from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { getConsumerAccessToken } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationPreferences {
  email_transactional: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  reservation_reminders: boolean;
  loyalty_reminders: boolean;
  marketing_push: boolean;
  preferred_lang: "fr" | "ar";
}

const DEFAULT_PREFS: NotificationPreferences = {
  email_transactional: true,
  sms_enabled: false,
  push_enabled: true,
  reservation_reminders: true,
  loyalty_reminders: true,
  marketing_push: false,
  preferred_lang: "fr",
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchPreferences(): Promise<NotificationPreferences> {
  const token = await getConsumerAccessToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch("/api/me/notification-preferences", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load preferences");
  const data = await res.json();
  return { ...DEFAULT_PREFS, ...data };
}

async function savePreferences(
  prefs: Partial<NotificationPreferences>,
): Promise<void> {
  const token = await getConsumerAccessToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch("/api/me/notification-preferences", {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error("Failed to save preferences");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToggleRow({
  icon,
  title,
  subtitle,
  checked,
  onCheckedChange,
  disabled,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 text-primary">{icon}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">{title}</span>
            {badge && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                {badge}
              </span>
            )}
          </div>
          <div className="text-sm text-slate-600">{subtitle}</div>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 animate-pulse">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 h-5 w-5 rounded bg-slate-200" />
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="h-3 w-48 rounded bg-slate-200" />
        </div>
      </div>
      <div className="h-6 w-11 rounded-full bg-slate-200" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NotificationPreferencesPanel() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  // Fetch on mount
  useEffect(() => {
    let cancelled = false;
    fetchPreferences()
      .then((data) => {
        if (!cancelled) setPrefs(data);
      })
      .catch(() => {
        if (!cancelled) setPrefs(DEFAULT_PREFS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = useCallback(() => {
    setToast(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 2000);
  }, []);

  const update = useCallback(
    (partial: Partial<NotificationPreferences>) => {
      if (!prefs) return;
      const next = { ...prefs, ...partial };
      setPrefs(next);
      savePreferences(partial)
        .then(showToast)
        .catch(() => {
          /* revert silently on error */
          setPrefs(prefs);
        });
    },
    [prefs, showToast],
  );

  // ----- Loading skeleton -----
  if (loading || !prefs) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      {/* Toast */}
      <div
        className={`pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ${
          toast
            ? "translate-y-0 opacity-100"
            : "translate-y-4 opacity-0"
        }`}
      >
        <div className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          Preferences mises a jour
        </div>
      </div>

      {/* Notification toggles */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Canaux de notification
        </h3>
        <div className="space-y-3">
          <ToggleRow
            icon={<Mail className="h-5 w-5" />}
            title="Email transactionnel"
            subtitle="Confirmations, recus et notifications de compte"
            checked={prefs.email_transactional}
            onCheckedChange={() => {}}
            disabled
            badge="Obligatoire"
          />
          <ToggleRow
            icon={<Smartphone className="h-5 w-5" />}
            title="SMS"
            subtitle="Recevoir des notifications par SMS"
            checked={prefs.sms_enabled}
            onCheckedChange={(v) => update({ sms_enabled: v })}
          />
          <ToggleRow
            icon={<Bell className="h-5 w-5" />}
            title="Notifications push"
            subtitle="Notifications sur votre appareil mobile"
            checked={prefs.push_enabled}
            onCheckedChange={(v) => update({ push_enabled: v })}
          />
        </div>
      </div>

      {/* Category toggles */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Categories
        </h3>
        <div className="space-y-3">
          <ToggleRow
            icon={<Calendar className="h-5 w-5" />}
            title="Rappels reservation"
            subtitle="Rappels avant vos reservations a venir"
            checked={prefs.reservation_reminders}
            onCheckedChange={(v) => update({ reservation_reminders: v })}
          />
          <ToggleRow
            icon={<Star className="h-5 w-5" />}
            title="Rappels fidelite"
            subtitle="Points de fidelite, recompenses et offres"
            checked={prefs.loyalty_reminders}
            onCheckedChange={(v) => update({ loyalty_reminders: v })}
          />
          <ToggleRow
            icon={<Megaphone className="h-5 w-5" />}
            title="Marketing"
            subtitle="Promotions, nouveautes et evenements"
            checked={prefs.marketing_push}
            onCheckedChange={(v) => update({ marketing_push: v })}
          />
        </div>
      </div>

      {/* Language selector */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Langue des notifications
        </h3>
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mt-0.5 text-primary">
            <Globe className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-foreground mb-2">
              Langue preferee
            </div>
            <div className="flex gap-2">
              {(["fr", "ar"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => update({ preferred_lang: lang })}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    prefs.preferred_lang === lang
                      ? "bg-primary text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {lang === "fr" ? "Francais" : "Arabe"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
