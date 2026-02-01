import React, { Fragment, useEffect, useMemo, useState } from "react";
import { Pencil, CheckCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { isAuthed } from "@/lib/auth";
import { updateMyConsumerMe } from "@/lib/consumerMeApi";
import type { SocioProfessionalStatus, UserProfile } from "@/lib/userData";
import { saveUserProfile } from "@/lib/userData";

function formatUpdatedAt(updatedAtIso: string | undefined, intlLocale: string): string | null {
  if (!updatedAtIso) return null;
  const ts = Date.parse(updatedAtIso);
  if (!Number.isFinite(ts)) return null;

  try {
    return new Date(ts).toLocaleString(intlLocale, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return null;
  }
}

type CspGroup = {
  groupKey: string;
  items: Array<{ value: SocioProfessionalStatus; labelKey: string }>;
};

const CSP_OPTIONS: CspGroup[] = [
  {
    groupKey: "profile.info.csp.group.education",
    items: [
      { value: "student", labelKey: "profile.info.csp.student" },
      { value: "intern", labelKey: "profile.info.csp.intern" },
    ],
  },
  {
    groupKey: "profile.info.csp.group.unemployed",
    items: [
      { value: "unemployed", labelKey: "profile.info.csp.unemployed" },
      { value: "job_seeker", labelKey: "profile.info.csp.job_seeker" },
      { value: "retraining", labelKey: "profile.info.csp.retraining" },
    ],
  },
  {
    groupKey: "profile.info.csp.group.employed",
    items: [
      { value: "employee", labelKey: "profile.info.csp.employee" },
      { value: "technician", labelKey: "profile.info.csp.technician" },
      { value: "supervisor", labelKey: "profile.info.csp.supervisor" },
      { value: "manager", labelKey: "profile.info.csp.manager" },
      { value: "executive", labelKey: "profile.info.csp.executive" },
    ],
  },
  {
    groupKey: "profile.info.csp.group.self_employed",
    items: [
      { value: "freelance", labelKey: "profile.info.csp.freelance" },
      { value: "entrepreneur", labelKey: "profile.info.csp.entrepreneur" },
      { value: "liberal_profession", labelKey: "profile.info.csp.liberal_profession" },
    ],
  },
  {
    groupKey: "profile.info.csp.group.public",
    items: [{ value: "public_servant", labelKey: "profile.info.csp.public_servant" }],
  },
  {
    groupKey: "profile.info.csp.group.commerce",
    items: [
      { value: "merchant", labelKey: "profile.info.csp.merchant" },
      { value: "artisan", labelKey: "profile.info.csp.artisan" },
    ],
  },
  {
    groupKey: "profile.info.csp.group.manual",
    items: [
      { value: "worker", labelKey: "profile.info.csp.worker" },
      { value: "service_employee", labelKey: "profile.info.csp.service_employee" },
    ],
  },
  {
    groupKey: "profile.info.csp.group.other",
    items: [
      { value: "retired", labelKey: "profile.info.csp.retired" },
      { value: "stay_at_home", labelKey: "profile.info.csp.stay_at_home" },
      { value: "other", labelKey: "profile.info.csp.other" },
    ],
  },
];

export function ProfileInfoForm({ profile }: { profile: UserProfile }) {
  const { t, intlLocale } = useI18n();

  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [contact, setContact] = useState(profile.contact ?? "");
  const [socioProfessionalStatus, setSocioProfessionalStatus] = useState<SocioProfessionalStatus | "">(
    profile.socio_professional_status ?? "",
  );
  const [dateOfBirth, setDateOfBirth] = useState(profile.date_of_birth ?? "");
  const [city, setCity] = useState(profile.city ?? "");

  const [error, setError] = useState<string | null>(null);
  const [remoteSyncError, setRemoteSyncError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAtIso, setSavedAtIso] = useState<string | null>(null);

  // Mode edition: les champs sont grisés après enregistrement
  // Si le profil a déjà été mis à jour (updatedAtIso existe), on commence en mode lecture
  const [isEditing, setIsEditing] = useState(!profile.updatedAtIso);

  // Vérification du téléphone (pour empêcher la modification après vérification)
  const isPhoneVerified = profile.phoneVerified ?? false;

  useEffect(() => {
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setContact(profile.contact ?? "");
    setSocioProfessionalStatus(profile.socio_professional_status ?? "");
    setDateOfBirth(profile.date_of_birth ?? "");
    setCity(profile.city ?? "");
    setSavedAtIso(null);
    setError(null);
    setRemoteSyncError(null);
    // Si le profil a été mis à jour, on passe en mode lecture
    if (profile.updatedAtIso) {
      setIsEditing(false);
    }
  }, [
    profile.contact,
    profile.socio_professional_status,
    profile.date_of_birth,
    profile.city,
    profile.firstName,
    profile.lastName,
    profile.updatedAtIso,
    profile.phoneVerified,
  ]);

  const updatedAtLabel = useMemo(() => formatUpdatedAt(profile.updatedAtIso, intlLocale), [intlLocale, profile.updatedAtIso]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    setRemoteSyncError(null);
    setSavedAtIso(null);

    try {
      const res = saveUserProfile({
        firstName,
        lastName,
        contact,
        socio_professional_status: socioProfessionalStatus === "" ? undefined : socioProfessionalStatus,
        date_of_birth: dateOfBirth.trim() ? dateOfBirth.trim() : undefined,
        city,
        preferences: profile.preferences,
      });

      if (res.ok === false) {
        setError(res.message);
        return;
      }

      // Sync to the official source used by booking prefill.
      // Important: we await this so the next booking screen sees the updated profile.
      if (isAuthed()) {
        try {
          await updateMyConsumerMe({
            first_name: firstName.trim() ? firstName.trim() : null,
            last_name: lastName.trim() ? lastName.trim() : null,
            phone: contact.trim() ? contact.trim() : null,
          });
        } catch {
          setRemoteSyncError("Impossible de synchroniser vos infos pour le pré-remplissage. Vous pouvez quand même réserver.");
        }
      }

      setSavedAtIso(new Date().toISOString());
      // Passer en mode lecture après enregistrement
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleEnableEditing = () => {
    setIsEditing(true);
    setSavedAtIso(null);
  };

  // Styles pour les champs désactivés (mode lecture)
  const disabledInputClass = "bg-slate-100 text-slate-500 cursor-not-allowed";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-foreground">{t("profile.info.title")}</div>
          <div className="mt-1 text-xs text-slate-600">{t("profile.info.subtitle")}</div>
        </div>

        {/* Bouton Modifier - affiché uniquement en mode lecture */}
        {!isEditing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleEnableEditing}
            className="flex items-center gap-2"
          >
            <Pencil className="w-4 h-4" />
            {t("profile.info.edit")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Prénom - toujours éditable (pas grisé après enregistrement) */}
        <div className="space-y-2">
          <Label htmlFor="profile-first-name">{t("profile.info.first_name.label")}</Label>
          <Input
            id="profile-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t("profile.info.first_name.placeholder")}
          />
        </div>

        {/* Nom - toujours éditable (pas grisé après enregistrement) */}
        <div className="space-y-2">
          <Label htmlFor="profile-last-name">{t("profile.info.last_name.label")}</Label>
          <Input
            id="profile-last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder={t("profile.info.last_name.placeholder")}
          />
        </div>

        {/* Téléphone - grisé si vérifié ou en mode lecture */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="profile-contact">{t("profile.info.phone.label")}</Label>
            {isPhoneVerified && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                {t("profile.info.phone.verified")}
              </span>
            )}
          </div>
          <Input
            id="profile-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            inputMode="tel"
            placeholder={t("profile.info.phone.placeholder")}
            disabled={isPhoneVerified || !isEditing}
            className={isPhoneVerified || !isEditing ? disabledInputClass : ""}
          />
          <div className="text-xs text-slate-600">
            {isPhoneVerified
              ? t("profile.info.phone.verified_help")
              : t("profile.info.phone.help")
            }
          </div>
        </div>

        {/* Situation professionnelle - grisé en mode lecture */}
        <div className="space-y-2">
          <Label>{t("profile.info.csp.label")}</Label>
          <Select
            value={socioProfessionalStatus || undefined}
            onValueChange={(v) => setSocioProfessionalStatus(v as SocioProfessionalStatus)}
            disabled={!isEditing}
          >
            <SelectTrigger className={!isEditing ? disabledInputClass : ""}>
              <SelectValue placeholder={t("profile.info.csp.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {CSP_OPTIONS.map((g, idx) => (
                <Fragment key={g.groupKey}>
                  <SelectGroup>
                    <SelectLabel>{t(g.groupKey)}</SelectLabel>
                    {g.items.map((it) => (
                      <SelectItem key={it.value} value={it.value}>
                        {t(it.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  {idx < CSP_OPTIONS.length - 1 ? <SelectSeparator /> : null}
                </Fragment>
              ))}
            </SelectContent>
          </Select>
          <div className="text-xs text-slate-600">{t("profile.info.csp.help")}</div>
        </div>

        {/* Date de naissance - grisé en mode lecture */}
        <div className="space-y-2">
          <Label htmlFor="profile-dob">{t("profile.info.dob.label")}</Label>
          <Input
            id="profile-dob"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            placeholder={t("profile.info.dob.placeholder")}
            disabled={!isEditing}
            className={!isEditing ? disabledInputClass : ""}
          />
          <div className="text-xs text-slate-600">{t("profile.info.dob.help")}</div>
        </div>

        {/* Ville - grisé en mode lecture */}
        <div className="space-y-2">
          <Label htmlFor="profile-city">{t("profile.info.city.label")}</Label>
          <Input
            id="profile-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t("profile.info.city.placeholder")}
            disabled={!isEditing}
            className={!isEditing ? disabledInputClass : ""}
          />
        </div>
      </div>

      {error ? <div className="text-sm font-medium text-red-600">{error}</div> : null}
      {remoteSyncError ? <div className="text-xs text-slate-600">{remoteSyncError}</div> : null}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Bouton Enregistrer - visible uniquement en mode édition */}
        {isEditing && (
          <Button type="submit" className="bg-primary hover:bg-primary/90 text-white font-bold" disabled={saving}>
            {saving ? "Enregistrement…" : t("profile.info.save")}
          </Button>
        )}

        {savedAtIso ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 font-semibold">
            <CheckCircle className="w-4 h-4" />
            {t("profile.info.saved")}
          </div>
        ) : null}

        {updatedAtLabel && !savedAtIso ? (
          <div className="text-xs text-slate-600 sm:ml-auto">{t("profile.info.last_updated", { value: updatedAtLabel })}</div>
        ) : null}
      </div>
    </form>
  );
}
