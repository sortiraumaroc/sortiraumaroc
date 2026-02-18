import React, { Fragment, useEffect, useMemo, useState } from "react";
import { Pencil, CheckCircle, ShieldCheck, ChevronDown, Search, Mail, Phone, CircleCheck } from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { isAuthed, getConsumerAuthInfo, type ConsumerAuthInfo } from "@/lib/auth";
import { getMyConsumerMe, updateMyConsumerMe } from "@/lib/consumerMeApi";
import type { SocioProfessionalStatus, UserProfile } from "@/lib/userData";
import { saveUserProfile, getUserProfile } from "@/lib/userData";
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
  const [email, setEmail] = useState(profile.email ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);

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
  const initialCountry = profile.country || findCountryByCity(profile.city ?? "")?.code || "";
  const [selectedCountryCode, setSelectedCountryCode] = useState(initialCountry);
  const [city, setCity] = useState(profile.city ?? "");
  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState("");
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [remoteSyncError, setRemoteSyncError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAtIso, setSavedAtIso] = useState<string | null>(null);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);

  // Mode edition: les champs sont grisés après enregistrement
  // Si le profil a déjà été mis à jour (updatedAtIso existe), on commence en mode lecture
  const [isEditing, setIsEditing] = useState(!profile.updatedAtIso);

  // Vérification du téléphone (pour empêcher la modification après vérification)
  const isPhoneVerified = profile.phoneVerified ?? false;

  // Auth info (email/phone utilisé pour la connexion)
  const [authInfo, setAuthInfo] = useState<ConsumerAuthInfo | null>(null);

  useEffect(() => {
    if (isAuthed()) {
      getConsumerAuthInfo().then((info) => {
        setAuthInfo(info);
        // Pré-remplir l'email du profil depuis l'email d'authentification si vide
        if (info?.email && !email) {
          setEmail(info.email);
        }
        // Pré-remplir le téléphone du profil depuis le téléphone d'authentification si vide
        if (info?.phone && !phoneNumber) {
          const parsed = parsePhoneNumber(info.phone);
          setPhoneDialCode(parsed.dialCode);
          setPhoneNumber(parsed.number);
        }
      }).catch(() => setAuthInfo(null));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrater le profil depuis le serveur pour persister entre navigateurs
  useEffect(() => {
    if (!isAuthed()) return;
    let cancelled = false;

    getMyConsumerMe().then((me) => {
      if (cancelled) return;

      const local = getUserProfile();

      // Merge server data into localStorage (server wins over empty local)
      const merged = {
        firstName: me.first_name || local.firstName || undefined,
        lastName: me.last_name || local.lastName || undefined,
        contact: me.phone || local.contact || undefined,
        email: me.email || local.email || undefined,
        date_of_birth: me.date_of_birth || local.date_of_birth || undefined,
        city: me.city || local.city || undefined,
        country: me.country || local.country || undefined,
        socio_professional_status: (me.socio_professional_status || local.socio_professional_status || undefined) as SocioProfessionalStatus | undefined,
        preferences: local.preferences,
      };

      saveUserProfile(merged);

      // Update form fields with server data
      if (me.first_name) setFirstName(me.first_name);
      if (me.last_name) setLastName(me.last_name);
      if (me.email) setEmail(me.email);
      if (me.phone) {
        const parsed = parsePhoneNumber(me.phone);
        setPhoneDialCode(parsed.dialCode);
        setPhoneNumber(parsed.number);
      }
      if (me.city) setCity(me.city);
      if (me.country) setSelectedCountryCode(me.country);
      if (me.socio_professional_status) setSocioProfessionalStatus(me.socio_professional_status as SocioProfessionalStatus);
      if (me.date_of_birth) setDateOfBirth(me.date_of_birth);

      // If server has data, switch to read mode
      if (me.first_name || me.last_name || me.email || me.phone) {
        setIsEditing(false);
      }
    }).catch(() => {
      // Silently ignore - fallback to localStorage
    });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setEmail(profile.email ?? "");
    setEmailError(null);

    const parsed = parsePhoneNumber(profile.contact ?? "");
    setPhoneDialCode(parsed.dialCode);
    setPhoneNumber(parsed.number);

    setSocioProfessionalStatus(profile.socio_professional_status ?? "");
    setDateOfBirth(profile.date_of_birth ?? "");

    const countryCode = profile.country || findCountryByCity(profile.city ?? "")?.code || "";
    setSelectedCountryCode(countryCode);
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
    profile.email,
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

    // Validation email obligatoire
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setEmailError("L'adresse email est obligatoire.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError("Veuillez entrer une adresse email valide.");
      return;
    }
    setEmailError(null);

    setSaving(true);
    setError(null);
    setRemoteSyncError(null);
    setSavedAtIso(null);

    const fullPhone = getFullPhoneNumber();

    try {
      // Sync to the official source used by booking prefill FIRST.
      // This validates uniqueness of email/phone on the server before saving locally.
      if (isAuthed()) {
        try {
          await updateMyConsumerMe({
            first_name: firstName.trim() ? firstName.trim() : null,
            last_name: lastName.trim() ? lastName.trim() : null,
            phone: fullPhone ? fullPhone : null,
            email: trimmedEmail,
            date_of_birth: dateOfBirth.trim() ? dateOfBirth.trim() : null,
            city: city.trim() ? city.trim() : null,
            country: selectedCountryCode || null,
            socio_professional_status: socioProfessionalStatus || null,
          });
        } catch (syncErr) {
          const msg = syncErr instanceof Error ? syncErr.message : "";
          // Erreurs de validation (email/phone dupliqué) → on bloque la sauvegarde
          if (msg.includes("email") && msg.includes("déjà")) {
            setEmailError(msg);
            return;
          }
          if (msg.includes("téléphone") || msg.includes("phone")) {
            setError(msg);
            return;
          }
          // Erreur réseau/serveur → on sauvegarde quand même en local avec un avertissement
          setRemoteSyncError(msg || "Impossible de synchroniser avec le serveur. Vos infos sont sauvegardées localement.");
        }
      }

      // Save locally (even if server sync failed for non-validation errors)
      const res = saveUserProfile({
        firstName,
        lastName,
        contact: fullPhone,
        email: trimmedEmail,
        socio_professional_status: socioProfessionalStatus === "" ? undefined : socioProfessionalStatus,
        date_of_birth: dateOfBirth.trim() ? dateOfBirth.trim() : undefined,
        city,
        country: selectedCountryCode || undefined,
        preferences: profile.preferences,
      });

      if (res.ok === false) {
        setError(res.message);
        return;
      }

      setSavedAtIso(new Date().toISOString());
      // Passer en mode lecture après enregistrement
      setIsEditing(false);
      // Afficher la boîte de dialogue de confirmation
      setSuccessDialogOpen(true);
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
          <div className="text-xs text-slate-600">{t("profile.info.subtitle")}</div>
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

        {/* Email - obligatoire */}
        <div className="space-y-2">
          <Label htmlFor="profile-email">Email *</Label>
          <Input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
            }}
            placeholder="votre@email.com"
            disabled={!isEditing}
            className={!isEditing ? disabledInputClass : emailError ? "border-red-400 focus-visible:ring-red-400" : ""}
          />
          {emailError ? (
            <div className="text-xs text-red-600 font-medium">{emailError}</div>
          ) : (
            <div className="text-xs text-slate-600">
              Utilisé pour vous contacter si besoin.
            </div>
          )}
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
                    <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Rechercher un pays..."
                      value={phoneSearchQuery}
                      onChange={(e) => setPhoneSearchQuery(e.target.value)}
                      className="ps-8 h-9"
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
                          setError(null);
                        }}
                      >
                        <span className="text-base">{country.flag}</span>
                        <span className="flex-1 text-start truncate">{country.name}</span>
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
              onChange={(e) => {
                let digits = e.target.value.replace(/\D/g, "");
                // Auto-strip leading 0 (users often type 06... instead of 6...)
                if (digits.startsWith("0") && digits.length > 1) {
                  digits = digits.slice(1);
                }
                setPhoneNumber(digits);
                setError(null);
              }}
              inputMode="tel"
              placeholder="6XXXXXXXX (sans le 0)"
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
          <Label>Tu habites dans quel pays ?</Label>
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
                  <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Rechercher un pays..."
                    value={countrySearchQuery}
                    onChange={(e) => setCountrySearchQuery(e.target.value)}
                    className="ps-8 h-9"
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
                      <span className="flex-1 text-start truncate">{country.name}</span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Ville - avec recherche */}
        <div className="space-y-2">
          <Label htmlFor="profile-city">Tu vis dans quelle ville ?</Label>
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
                    <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Rechercher une ville..."
                      value={citySearchQuery}
                      onChange={(e) => setCitySearchQuery(e.target.value)}
                      className="ps-8 h-9"
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
                        <span className="flex-1 text-start">{cityName}</span>
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
      {remoteSyncError ? <div className="text-xs text-amber-600">{remoteSyncError}</div> : null}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Bouton Enregistrer - visible uniquement en mode édition */}
        {isEditing && (
          <Button type="submit" className="bg-primary hover:bg-primary/90 text-white font-bold" disabled={saving || !!error || !!emailError}>
            {saving ? "Enregistrement…" : t("profile.info.save")}
          </Button>
        )}

        {updatedAtLabel && !savedAtIso ? (
          <div className="text-xs text-slate-600 sm:ms-auto">{t("profile.info.last_updated", { value: updatedAtLabel })}</div>
        ) : null}
      </div>

      {/* Boîte de dialogue de confirmation */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent className="sm:max-w-sm" hideCloseButton>
          <DialogHeader className="items-center text-center">
            <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CircleCheck
                className="h-10 w-10 text-emerald-600 animate-[scale-bounce_0.5s_ease-out]"
                strokeWidth={2}
              />
            </div>
            <DialogTitle className="text-lg">Profil mis à jour</DialogTitle>
            <DialogDescription>
              Vos informations ont été enregistrées avec succès.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => setSuccessDialogOpen(false)}
              className="bg-primary hover:bg-primary/90 text-white font-bold min-w-[120px]"
            >
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
