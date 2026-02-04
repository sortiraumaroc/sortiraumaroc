import React, { Fragment, useEffect, useMemo, useState } from "react";
import { Pencil, CheckCircle, ShieldCheck, ChevronDown, Search, Mail, Phone } from "lucide-react";

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { isAuthed, getConsumerAuthInfo, type ConsumerAuthInfo } from "@/lib/auth";
import { updateMyConsumerMe } from "@/lib/consumerMeApi";
import type { SocioProfessionalStatus, UserProfile } from "@/lib/userData";
import { saveUserProfile } from "@/lib/userData";
import { COUNTRIES, findCountryByCity, parsePhoneNumber } from "@/lib/countriesData";

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

  // Téléphone: séparer indicatif et numéro
  const initialPhone = parsePhoneNumber(profile.contact ?? "");
  const [phoneDialCode, setPhoneDialCode] = useState(initialPhone.dialCode);
  const [phoneNumber, setPhoneNumber] = useState(initialPhone.number);
  const [phonePopoverOpen, setPhonePopoverOpen] = useState(false);
  const [phoneSearchQuery, setPhoneSearchQuery] = useState("");

  const [socioProfessionalStatus, setSocioProfessionalStatus] = useState<SocioProfessionalStatus | "">(
    profile.socio_professional_status ?? "",
  );
  const [dateOfBirth, setDateOfBirth] = useState(profile.date_of_birth ?? "");

  // Pays et ville
  const initialCountry = findCountryByCity(profile.city ?? "");
  const [selectedCountryCode, setSelectedCountryCode] = useState(initialCountry?.code ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState("");
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [remoteSyncError, setRemoteSyncError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAtIso, setSavedAtIso] = useState<string | null>(null);

  // Mode edition: les champs sont grisés après enregistrement
  // Si le profil a déjà été mis à jour (updatedAtIso existe), on commence en mode lecture
  const [isEditing, setIsEditing] = useState(!profile.updatedAtIso);

  // Vérification du téléphone (pour empêcher la modification après vérification)
  const isPhoneVerified = profile.phoneVerified ?? false;

  // Auth info (email/phone utilisé pour la connexion)
  const [authInfo, setAuthInfo] = useState<ConsumerAuthInfo | null>(null);

  useEffect(() => {
    if (isAuthed()) {
      getConsumerAuthInfo().then(setAuthInfo).catch(() => setAuthInfo(null));
    }
  }, []);

  // Obtenir le pays sélectionné
  const selectedCountry = COUNTRIES.find(c => c.code === selectedCountryCode);

  // Filtrer les pays pour le sélecteur de téléphone
  const filteredPhoneCountries = useMemo(() => {
    if (!phoneSearchQuery.trim()) return COUNTRIES;
    const query = phoneSearchQuery.toLowerCase();
    return COUNTRIES.filter(
      c => c.name.toLowerCase().includes(query) ||
           c.dialCode.includes(query) ||
           c.code.toLowerCase().includes(query)
    );
  }, [phoneSearchQuery]);

  // Filtrer les pays pour le sélecteur de pays
  const filteredCountries = useMemo(() => {
    if (!countrySearchQuery.trim()) return COUNTRIES;
    const query = countrySearchQuery.toLowerCase();
    return COUNTRIES.filter(
      c => c.name.toLowerCase().includes(query) ||
           c.code.toLowerCase().includes(query)
    );
  }, [countrySearchQuery]);

  // Filtrer les villes du pays sélectionné
  const filteredCities = useMemo(() => {
    if (!selectedCountry) return [];
    if (!citySearchQuery.trim()) return selectedCountry.cities;
    const query = citySearchQuery.toLowerCase();
    return selectedCountry.cities.filter(c => c.toLowerCase().includes(query));
  }, [selectedCountry, citySearchQuery]);

  useEffect(() => {
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");

    const parsed = parsePhoneNumber(profile.contact ?? "");
    setPhoneDialCode(parsed.dialCode);
    setPhoneNumber(parsed.number);

    setSocioProfessionalStatus(profile.socio_professional_status ?? "");
    setDateOfBirth(profile.date_of_birth ?? "");

    const country = findCountryByCity(profile.city ?? "");
    setSelectedCountryCode(country?.code ?? "");
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

  // Combiner indicatif + numéro pour le stockage
  const getFullPhoneNumber = () => {
    if (!phoneNumber.trim()) return "";
    return `${phoneDialCode}${phoneNumber.trim()}`;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    setRemoteSyncError(null);
    setSavedAtIso(null);

    const fullPhone = getFullPhoneNumber();

    try {
      const res = saveUserProfile({
        firstName,
        lastName,
        contact: fullPhone,
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
            phone: fullPhone ? fullPhone : null,
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

  // Quand on change de pays, réinitialiser la ville
  const handleCountryChange = (countryCode: string) => {
    setSelectedCountryCode(countryCode);
    setCity(""); // Reset city when country changes
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

      {/* Identifiants de connexion - affiché si l'utilisateur est connecté */}
      {authInfo && (authInfo.email || authInfo.phone) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-medium text-slate-700 mb-3">{t("profile.info.login_credentials")}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Email de connexion */}
            {authInfo.email && (
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white border border-slate-200">
                  <Mail className="w-4 h-4 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">{t("profile.info.email.label")}</div>
                  <div className="text-sm font-medium text-foreground truncate">{authInfo.email}</div>
                </div>
              </div>
            )}

            {/* Téléphone de connexion (si inscrit via téléphone) */}
            {authInfo.phone && authInfo.authMethod === "phone" && (
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white border border-slate-200">
                  <Phone className="w-4 h-4 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">{t("profile.info.phone.login_label")}</div>
                  <div className="text-sm font-medium text-foreground truncate">{authInfo.phone}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

        {/* Téléphone avec indicatif pays */}
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
          <div className="flex gap-2">
            {/* Sélecteur d'indicatif pays */}
            <Popover open={phonePopoverOpen} onOpenChange={(open) => {
              setPhonePopoverOpen(open);
              if (!open) setPhoneSearchQuery("");
            }}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={`w-[120px] justify-between px-2 ${isPhoneVerified || !isEditing ? disabledInputClass : ""}`}
                  disabled={isPhoneVerified || !isEditing}
                >
                  <span className="flex items-center gap-1 text-sm truncate">
                    {COUNTRIES.find(c => c.dialCode === phoneDialCode)?.flag || "🌍"}
                    <span className="font-medium">{phoneDialCode}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                {/* Barre de recherche */}
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Rechercher un pays..."
                      value={phoneSearchQuery}
                      onChange={(e) => setPhoneSearchQuery(e.target.value)}
                      className="pl-8 h-9"
                    />
                  </div>
                </div>
                {/* Liste des pays */}
                <div className="max-h-[250px] overflow-y-auto p-1">
                  {filteredPhoneCountries.length === 0 ? (
                    <div className="py-4 text-center text-sm text-slate-500">
                      Aucun pays trouvé
                    </div>
                  ) : (
                    filteredPhoneCountries.map((country) => (
                      <button
                        key={country.code}
                        type="button"
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-slate-100 transition-colors ${
                          phoneDialCode === country.dialCode ? "bg-slate-100 font-medium" : ""
                        }`}
                        onClick={() => {
                          setPhoneDialCode(country.dialCode);
                          setPhonePopoverOpen(false);
                          setPhoneSearchQuery("");
                        }}
                      >
                        <span className="text-base">{country.flag}</span>
                        <span className="flex-1 text-left truncate">{country.name}</span>
                        <span className="text-slate-500 text-xs">{country.dialCode}</span>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Numéro de téléphone */}
            <Input
              id="profile-contact"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              inputMode="tel"
              placeholder="6 12 34 56 78"
              disabled={isPhoneVerified || !isEditing}
              className={`flex-1 ${isPhoneVerified || !isEditing ? disabledInputClass : ""}`}
            />
          </div>
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

        {/* Pays - avec recherche */}
        <div className="space-y-2">
          <Label>Pays</Label>
          <Popover open={countryPopoverOpen} onOpenChange={(open) => {
            if (!isEditing) return;
            setCountryPopoverOpen(open);
            if (!open) setCountrySearchQuery("");
          }}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={`w-full justify-between ${!isEditing ? disabledInputClass : ""}`}
                disabled={!isEditing}
              >
                <span className="flex items-center gap-2 truncate">
                  {selectedCountry ? (
                    <>
                      <span>{selectedCountry.flag}</span>
                      <span>{selectedCountry.name}</span>
                    </>
                  ) : (
                    <span className="text-slate-500">Sélectionnez votre pays</span>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              {/* Barre de recherche */}
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Rechercher un pays..."
                    value={countrySearchQuery}
                    onChange={(e) => setCountrySearchQuery(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
              </div>
              {/* Liste des pays */}
              <div className="max-h-[250px] overflow-y-auto p-1">
                {filteredCountries.length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-500">
                    Aucun pays trouvé
                  </div>
                ) : (
                  filteredCountries.map((country) => (
                    <button
                      key={country.code}
                      type="button"
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-slate-100 transition-colors ${
                        selectedCountryCode === country.code ? "bg-slate-100 font-medium" : ""
                      }`}
                      onClick={() => {
                        handleCountryChange(country.code);
                        setCountryPopoverOpen(false);
                        setCountrySearchQuery("");
                      }}
                    >
                      <span className="text-base">{country.flag}</span>
                      <span className="flex-1 text-left truncate">{country.name}</span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Ville - avec recherche */}
        <div className="space-y-2">
          <Label htmlFor="profile-city">{t("profile.info.city.label")}</Label>
          {selectedCountry ? (
            <Popover open={cityPopoverOpen} onOpenChange={(open) => {
              if (!isEditing) return;
              setCityPopoverOpen(open);
              if (!open) setCitySearchQuery("");
            }}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={`w-full justify-between ${!isEditing ? disabledInputClass : ""}`}
                  disabled={!isEditing}
                >
                  <span className="truncate">
                    {city || <span className="text-slate-500">Sélectionnez votre ville</span>}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                {/* Barre de recherche */}
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Rechercher une ville..."
                      value={citySearchQuery}
                      onChange={(e) => setCitySearchQuery(e.target.value)}
                      className="pl-8 h-9"
                    />
                  </div>
                </div>
                {/* Liste des villes */}
                <div className="max-h-[250px] overflow-y-auto p-1">
                  {filteredCities.length === 0 ? (
                    <div className="py-4 text-center text-sm text-slate-500">
                      Aucune ville trouvée
                    </div>
                  ) : (
                    filteredCities.map((cityName) => (
                      <button
                        key={cityName}
                        type="button"
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-slate-100 transition-colors ${
                          city === cityName ? "bg-slate-100 font-medium" : ""
                        }`}
                        onClick={() => {
                          setCity(cityName);
                          setCityPopoverOpen(false);
                          setCitySearchQuery("");
                        }}
                      >
                        <span className="flex-1 text-left">{cityName}</span>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Button
              type="button"
              variant="outline"
              className={`w-full justify-start ${disabledInputClass}`}
              disabled
            >
              <span className="text-slate-500">Sélectionnez d'abord un pays</span>
            </Button>
          )}
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
