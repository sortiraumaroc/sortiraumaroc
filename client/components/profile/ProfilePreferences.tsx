import { useState } from "react";
import { Bell, BellRing, Calendar, Mail, MessageCircle, Smartphone, Sparkles, Tag } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import type { UserProfile } from "@/lib/userData";
import { saveUserProfile } from "@/lib/userData";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { updatePushPreferences } from "@/lib/pushNotifications";

function PrefRow({
  title,
  subtitle,
  icon,
  checked,
  onCheckedChange,
  disabled,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 text-primary">{icon}</div>
        <div className="min-w-0">
          <div className="font-bold text-foreground">{title}</div>
          <div className="text-sm text-slate-600">{subtitle}</div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

export function ProfilePreferences({ profile }: { profile: UserProfile }) {
  const { t } = useI18n();
  const prefs = profile.preferences;
  const push = usePushNotifications();

  // Prompt 12 — personalization toggle
  const [personalizedSearch, setPersonalizedSearch] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("sam_personalization") !== "off" : true,
  );

  // Push preference states (default to true)
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushBookings, setPushBookings] = useState(true);
  const [pushWaitlist, setPushWaitlist] = useState(true);
  const [pushMarketing, setPushMarketing] = useState(false);

  const update = (next: Partial<UserProfile["preferences"]>) => {
    saveUserProfile({
      firstName: profile.firstName,
      lastName: profile.lastName,
      contact: profile.contact,
      city: profile.city,
      preferences: {
        ...prefs,
        ...next,
      },
    });
  };

  const handlePushToggle = async (key: string, value: boolean) => {
    // Update local state immediately
    switch (key) {
      case "push_notifications_enabled":
        setPushEnabled(value);
        break;
      case "push_bookings_enabled":
        setPushBookings(value);
        break;
      case "push_waitlist_enabled":
        setPushWaitlist(value);
        break;
      case "push_marketing_enabled":
        setPushMarketing(value);
        break;
    }

    // If toggling master switch off, disable push
    if (key === "push_notifications_enabled" && !value) {
      await push.disablePush();
    }

    // If toggling master switch on, request permission
    if (key === "push_notifications_enabled" && value) {
      const success = await push.requestPermission();
      if (!success) {
        setPushEnabled(false);
        return;
      }
    }

    // Update server-side preferences
    await updatePushPreferences({ [key]: value });
  };

  return (
    <div className="space-y-6">
      {/* Communication preferences */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {t("profile.prefs.section_communication")}
        </h3>
        <div className="space-y-3">
          <PrefRow
            title="Newsletter"
            subtitle={t("profile.prefs.newsletter_desc")}
            icon={<Mail className="w-5 h-5" />}
            checked={prefs.newsletter}
            onCheckedChange={(checked) => update({ newsletter: checked })}
          />
          <PrefRow
            title={t("profile.prefs.reminders")}
            subtitle={t("profile.prefs.reminders_desc")}
            icon={<Bell className="w-5 h-5" />}
            checked={prefs.reminders}
            onCheckedChange={(checked) => update({ reminders: checked })}
          />
          <PrefRow
            title="WhatsApp"
            subtitle={t("profile.prefs.whatsapp_desc")}
            icon={<MessageCircle className="w-5 h-5" />}
            checked={prefs.whatsapp}
            onCheckedChange={(checked) => update({ whatsapp: checked })}
          />
        </div>
      </div>

      {/* Prompt 12 — Personalization */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {t("settings.personalization")}
        </h3>
        <div className="space-y-3">
          <PrefRow
            title={t("settings.personalization")}
            subtitle={t("settings.personalization.description")}
            icon={<Sparkles className="w-5 h-5" />}
            checked={personalizedSearch}
            onCheckedChange={(v) => {
              localStorage.setItem("sam_personalization", v ? "on" : "off");
              setPersonalizedSearch(v);
            }}
          />
        </div>
      </div>

      {/* Push notifications section */}
      {push.supported && (
        <div>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {t("profile.prefs.section_push")}
          </h3>

          {push.permission === "denied" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-3">
              <p className="text-sm text-amber-800">
                {t("profile.prefs.push_blocked")}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {/* Master push toggle */}
            <PrefRow
              title={t("profile.prefs.push_enabled")}
              subtitle={t("profile.prefs.push_enabled_desc")}
              icon={<Smartphone className="w-5 h-5" />}
              checked={pushEnabled && push.permission === "granted"}
              onCheckedChange={(v) => handlePushToggle("push_notifications_enabled", v)}
              disabled={push.permission === "denied"}
            />

            {/* Sub-categories — only shown when push is enabled */}
            {pushEnabled && push.permission === "granted" && (
              <>
                <PrefRow
                  title={t("profile.prefs.push_bookings")}
                  subtitle={t("profile.prefs.push_bookings_desc")}
                  icon={<Calendar className="w-5 h-5" />}
                  checked={pushBookings}
                  onCheckedChange={(v) => handlePushToggle("push_bookings_enabled", v)}
                />
                <PrefRow
                  title={t("profile.prefs.push_waitlist")}
                  subtitle={t("profile.prefs.push_waitlist_desc")}
                  icon={<BellRing className="w-5 h-5" />}
                  checked={pushWaitlist}
                  onCheckedChange={(v) => handlePushToggle("push_waitlist_enabled", v)}
                />
                <PrefRow
                  title={t("profile.prefs.push_marketing")}
                  subtitle={t("profile.prefs.push_marketing_desc")}
                  icon={<Tag className="w-5 h-5" />}
                  checked={pushMarketing}
                  onCheckedChange={(v) => handlePushToggle("push_marketing_enabled", v)}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
