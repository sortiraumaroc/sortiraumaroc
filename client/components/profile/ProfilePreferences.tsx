import { Bell, Mail, MessageCircle } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import type { UserProfile } from "@/lib/userData";
import { saveUserProfile } from "@/lib/userData";

function PrefRow({
  title,
  subtitle,
  icon,
  checked,
  onCheckedChange,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
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
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function ProfilePreferences({ profile }: { profile: UserProfile }) {
  const prefs = profile.preferences;

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

  return (
    <div className="space-y-3">
      <PrefRow
        title="Newsletter"
        subtitle="Recevoir les nouveautés, bons plans et sélections."
        icon={<Mail className="w-5 h-5" />}
        checked={prefs.newsletter}
        onCheckedChange={(checked) => update({ newsletter: checked })}
      />
      <PrefRow
        title="Rappels de réservation"
        subtitle="Recevoir un rappel avant vos sorties."
        icon={<Bell className="w-5 h-5" />}
        checked={prefs.reminders}
        onCheckedChange={(checked) => update({ reminders: checked })}
      />
      <PrefRow
        title="WhatsApp"
        subtitle="Autoriser les confirmations et messages via WhatsApp."
        icon={<MessageCircle className="w-5 h-5" />}
        checked={prefs.whatsapp}
        onCheckedChange={(checked) => update({ whatsapp: checked })}
      />
    </div>
  );
}
