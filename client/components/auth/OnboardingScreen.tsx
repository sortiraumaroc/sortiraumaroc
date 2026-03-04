import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown, Search, User, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { COUNTRIES } from "@/lib/countriesData";
import { saveUserProfile } from "@/lib/userData";
import { updateMyConsumerMe, setPhoneUserEmailPassword } from "@/lib/consumerMeApi";
import { getConsumerAccessToken } from "@/lib/auth";
import { VerifyCodeInput, CountdownTimer } from "./VerifyCodeInput";

interface OnboardingScreenProps {
  onComplete: () => void;
  authMethod?: "phone" | "email" | null;
  prefillFirstName?: string;
  prefillLastName?: string;
}

// Generate 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

type OnboardingStep = "profile" | "email" | "password";

export function OnboardingScreen({ onComplete, authMethod, prefillFirstName, prefillLastName }: OnboardingScreenProps) {
  const isPhoneAuth = authMethod === "phone";
  const totalSteps = isPhoneAuth ? 3 : 1;

  // Current step
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("profile");

  // ─── Step 1: Profile fields ───
  const [firstName, setFirstName] = useState(prefillFirstName ?? "");
  const [lastName, setLastName] = useState(prefillLastName ?? "");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [selectedCountryCode, setSelectedCountryCode] = useState("MA");
  const [city, setCity] = useState("");

  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState("");
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState("");

  // ─── Step 2: Email fields ───
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [expectedCode, setExpectedCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  // ─── Step 3: Password fields ───
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ─── Shared state ───
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const verifyingRef = useRef(false);

  // ─── Step number ───
  const stepNumber = currentStep === "profile" ? 1 : currentStep === "email" ? 2 : 3;

  // ─── Country/City data ───
  const selectedCountry = COUNTRIES.find((c) => c.code === selectedCountryCode);

  const filteredCountries = useMemo(() => {
    if (!countrySearchQuery.trim()) return COUNTRIES;
    const query = countrySearchQuery.toLowerCase();
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.code.toLowerCase().includes(query)
    );
  }, [countrySearchQuery]);

  const filteredCities = useMemo(() => {
    if (!selectedCountry) return [];
    const cities = selectedCountry.cities || [];
    if (!citySearchQuery.trim()) return cities;
    const query = citySearchQuery.toLowerCase();
    return cities.filter((c) => c.toLowerCase().includes(query));
  }, [selectedCountry, citySearchQuery]);

  const handleCountryChange = (code: string) => {
    setSelectedCountryCode(code);
    setCity("");
    setCountryPopoverOpen(false);
    setCountrySearchQuery("");
  };

  // ─── Validation ───
  const isProfileValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    dateOfBirth.length > 0 &&
    city.length > 0;

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const isPasswordValid =
    password.length >= 8 &&
    confirmPassword === password;

  // ─── Step 1: Submit profile ───
  const handleProfileSubmit = async () => {
    setLocalError(null);

    if (!firstName.trim()) { setLocalError("Le prénom est requis"); return; }
    if (!lastName.trim()) { setLocalError("Le nom est requis"); return; }
    if (!dateOfBirth) { setLocalError("La date de naissance est requise"); return; }
    if (!city) { setLocalError("La ville est requise"); return; }

    setSaving(true);
    try {
      saveUserProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        date_of_birth: dateOfBirth,
        city,
      });

      await updateMyConsumerMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dateOfBirth,
        city,
      });

      if (isPhoneAuth) {
        setCurrentStep("email");
        setLocalError(null);
      } else {
        onComplete();
      }
    } catch {
      setLocalError("Échec de la sauvegarde. Réessayez.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Step 2: Send email verification code ───
  const handleSendEmailCode = async () => {
    setLocalError(null);

    if (!isEmailValid) {
      setLocalError("Adresse email invalide");
      return;
    }

    if (email.trim().toLowerCase().endsWith("@phone.sortiraumaroc.ma")) {
      setLocalError("Veuillez utiliser une adresse email réelle");
      return;
    }

    setSaving(true);
    try {
      const code = generateVerificationCode();
      const accessToken = await getConsumerAccessToken();

      const res = await fetch("/api/consumer/verify-email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code,
        }),
      });

      if (!res.ok) {
        const result = await res.json().catch(() => ({}));

        if (res.status === 409 || result.code === "EMAIL_ALREADY_EXISTS") {
          setLocalError("Cet email est déjà associé à un autre compte. Utilisez une autre adresse.");
          return;
        }
        if (res.status === 429) {
          setLocalError("Trop de tentatives. Réessayez dans une heure.");
          return;
        }

        throw new Error(result.error || "Échec de l'envoi");
      }

      setExpectedCode(code);
      setEmailSent(true);
      setEmailCode("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Échec de l'envoi du code";
      if (!localError) setLocalError(msg);
    } finally {
      setSaving(false);
    }
  };

  // ─── Step 2: Verify email code ───
  const handleVerifyEmailCode = async (code: string) => {
    // Guard against double invocation (onComplete + button click)
    if (verifyingRef.current) return;
    verifyingRef.current = true;

    setLocalError(null);

    if (code !== expectedCode) {
      setLocalError("Code incorrect");
      verifyingRef.current = false;
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/consumer/verify-email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code,
        }),
      });

      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        setLocalError(result.error || "Code incorrect ou expiré");
        return;
      }

      setEmailVerified(true);
      setTimeout(() => {
        setCurrentStep("password");
        setLocalError(null);
      }, 500);
    } catch {
      setLocalError("Échec de la vérification");
    } finally {
      setSaving(false);
      verifyingRef.current = false;
    }
  };

  // ─── Step 2: Resend email code ───
  const handleResendEmailCode = async () => {
    setEmailCode("");
    setLocalError(null);
    await handleSendEmailCode();
  };

  // ─── Step 3: Submit email + password ───
  const handlePasswordSubmit = async () => {
    setLocalError(null);

    if (password.length < 8) {
      setLocalError("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError("Les mots de passe ne correspondent pas");
      return;
    }

    setSaving(true);
    try {
      await setPhoneUserEmailPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      onComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";

      if (msg.includes("non vérifié") || msg.includes("expirée")) {
        setLocalError("La vérification de l'email a expiré. Veuillez recommencer.");
        setCurrentStep("email");
        setEmailVerified(false);
        setEmailSent(false);
        setEmailCode("");
        return;
      }
      if (msg.includes("déjà associé") || msg.includes("EMAIL_ALREADY_EXISTS")) {
        setLocalError("Cet email est déjà associé à un autre compte");
        setCurrentStep("email");
        setEmailVerified(false);
        setEmailSent(false);
        setEmailCode("");
        return;
      }
      if (msg.includes("trop faible") || msg.includes("weak")) {
        setLocalError("Mot de passe trop faible. Ajoutez des lettres, chiffres et caractères spéciaux.");
        return;
      }
      if (msg.includes("déjà un email")) {
        onComplete();
        return;
      }

      setLocalError("Échec de la sauvegarde. Réessayez.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Step Indicator ───
  const renderStepIndicator = () => {
    if (totalSteps === 1) return null;
    return (
      <div className="flex items-center justify-center gap-1.5 mb-2">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i + 1 === stepNumber
                ? "w-6 bg-primary"
                : i + 1 < stepNumber
                  ? "w-1.5 bg-primary/50"
                  : "w-1.5 bg-slate-200"
            }`}
          />
        ))}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: PROFILE
  // ═══════════════════════════════════════════════════════════════════════════
  if (currentStep === "profile") {
    return (
      <div className="space-y-4">
        {renderStepIndicator()}
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
            <User className="w-6 h-6 text-primary" />
          </div>
          <h2
            className="text-lg sm:text-xl font-bold text-slate-900"
            style={{ fontFamily: "Circular Std, sans-serif" }}
          >
            Complétez votre profil
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            {isPhoneAuth
              ? "Étape 1/3 — Informations personnelles"
              : "Ces informations améliorent votre expérience"}
          </p>
        </div>

        {localError && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {localError}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="onboard-firstname" className="text-sm font-medium text-slate-900">
                Prénom
              </Label>
              <Input
                id="onboard-firstname"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Votre prénom"
                disabled={saving}
                className="h-10 rounded-lg text-sm"
                maxLength={60}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboard-lastname" className="text-sm font-medium text-slate-900">
                Nom
              </Label>
              <Input
                id="onboard-lastname"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Votre nom"
                disabled={saving}
                className="h-10 rounded-lg text-sm"
                maxLength={60}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onboard-dob" className="text-sm font-medium text-slate-900">
              Date de naissance
            </Label>
            <Input
              id="onboard-dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              disabled={saving}
              className="h-10 rounded-lg text-sm"
              max={new Date().toISOString().split("T")[0]}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-900">Pays</Label>
            <Popover
              open={countryPopoverOpen}
              onOpenChange={(open) => {
                setCountryPopoverOpen(open);
                if (!open) setCountrySearchQuery("");
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between h-10 rounded-lg text-sm font-normal"
                  disabled={saving}
                >
                  <span className="flex items-center gap-2 truncate">
                    {selectedCountry ? (
                      <>
                        <span>{selectedCountry.flag}</span>
                        <span>{selectedCountry.name}</span>
                      </>
                    ) : (
                      <span className="text-slate-500">Sélectionnez un pays</span>
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
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
                <div className="max-h-[200px] overflow-y-auto p-1">
                  {filteredCountries.length === 0 ? (
                    <div className="py-4 text-center text-sm text-slate-500">Aucun pays trouvé</div>
                  ) : (
                    filteredCountries.map((country) => (
                      <button
                        key={country.code}
                        type="button"
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-slate-100 transition-colors ${
                          selectedCountryCode === country.code ? "bg-slate-100 font-medium" : ""
                        }`}
                        onClick={() => handleCountryChange(country.code)}
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

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-900">Ville</Label>
            {selectedCountry ? (
              <Popover
                open={cityPopoverOpen}
                onOpenChange={(open) => {
                  setCityPopoverOpen(open);
                  if (!open) setCitySearchQuery("");
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between h-10 rounded-lg text-sm font-normal"
                    disabled={saving}
                  >
                    <span className="truncate">
                      {city || <span className="text-slate-500">Sélectionnez votre ville</span>}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0" align="start">
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
                  <div className="max-h-[200px] overflow-y-auto p-1">
                    {filteredCities.length === 0 ? (
                      <div className="py-4 text-center text-sm text-slate-500">Aucune ville trouvée</div>
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
                className="w-full justify-start h-10 rounded-lg text-sm font-normal"
                disabled
              >
                <span className="text-slate-500">Sélectionnez d'abord un pays</span>
              </Button>
            )}
          </div>

          <Button
            type="button"
            onClick={handleProfileSubmit}
            disabled={saving || !isProfileValid}
            className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Enregistrement...
              </span>
            ) : (
              "Continuer"
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: EMAIL VERIFICATION (phone users only)
  // ═══════════════════════════════════════════════════════════════════════════
  if (currentStep === "email") {
    return (
      <div className="space-y-4">
        {renderStepIndicator()}
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <h2
            className="text-lg sm:text-xl font-bold text-slate-900"
            style={{ fontFamily: "Circular Std, sans-serif" }}
          >
            Ajoutez votre email
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Étape 2/3 — Pour vos réservations et communications
          </p>
        </div>

        {localError && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {localError}
          </div>
        )}

        {emailVerified && (
          <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 text-center">
            Email vérifié avec succès !
          </div>
        )}

        {!emailVerified && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="onboard-email" className="text-sm font-medium text-slate-900">
                Adresse email
              </Label>
              <Input
                id="onboard-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailSent) {
                    setEmailSent(false);
                    setEmailCode("");
                    setExpectedCode("");
                  }
                }}
                placeholder="votre@email.com"
                disabled={saving || emailSent}
                className="h-10 rounded-lg text-sm"
                autoFocus
              />
            </div>

            {!emailSent && (
              <Button
                type="button"
                onClick={handleSendEmailCode}
                disabled={saving || !isEmailValid}
                className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span>
                    Envoi en cours...
                  </span>
                ) : (
                  "Envoyer le code de vérification"
                )}
              </Button>
            )}

            {emailSent && !emailVerified && (
              <div className="space-y-3">
                <div className="text-center">
                  <p className="text-xs text-slate-600">Code envoyé à</p>
                  <p className="text-sm font-semibold text-slate-900">{email}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailSent(false);
                      setEmailCode("");
                      setExpectedCode("");
                      setLocalError(null);
                    }}
                    className="text-xs text-primary hover:underline mt-1"
                  >
                    Changer l'email
                  </button>
                </div>

                <VerifyCodeInput
                  length={6}
                  value={emailCode}
                  onChange={setEmailCode}
                  onComplete={handleVerifyEmailCode}
                  disabled={saving}
                />

                <div className="text-center">
                  <CountdownTimer
                    seconds={60}
                    onComplete={() => {}}
                    onResend={handleResendEmailCode}
                    resendLabel="Renvoyer le code"
                    waitingLabel="Renvoyer dans"
                  />
                </div>

                <Button
                  type="button"
                  onClick={() => handleVerifyEmailCode(emailCode)}
                  disabled={saving || emailCode.length !== 6}
                  className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⏳</span>
                      Vérification...
                    </span>
                  ) : (
                    "Vérifier"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: PASSWORD (phone users only)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">
      {renderStepIndicator()}
      <div className="text-center">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
          <Lock className="w-6 h-6 text-primary" />
        </div>
        <h2
          className="text-lg sm:text-xl font-bold text-slate-900"
          style={{ fontFamily: "Circular Std, sans-serif" }}
        >
          Créez votre mot de passe
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          Étape 3/3 — Pour sécuriser votre compte
        </p>
      </div>

      {localError && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {localError}
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="onboard-password" className="text-sm font-medium text-slate-900">
            Mot de passe
          </Label>
          <div className="relative">
            <Input
              id="onboard-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
              disabled={saving}
              className="h-10 rounded-lg text-sm pe-10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password.length > 0 && (
            <div className="flex gap-1 mt-1">
              <div className={`h-1 flex-1 rounded-full ${password.length >= 8 ? "bg-green-500" : "bg-slate-200"}`} />
              <div className={`h-1 flex-1 rounded-full ${/[A-Za-z]/.test(password) && /\d/.test(password) ? "bg-green-500" : "bg-slate-200"}`} />
              <div className={`h-1 flex-1 rounded-full ${/[^A-Za-z0-9]/.test(password) ? "bg-green-500" : "bg-slate-200"}`} />
            </div>
          )}
          <p className="text-xs text-slate-500">Minimum 8 caractères</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="onboard-confirm" className="text-sm font-medium text-slate-900">
            Confirmer le mot de passe
          </Label>
          <div className="relative">
            <Input
              id="onboard-confirm"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Retapez votre mot de passe"
              disabled={saving}
              className="h-10 rounded-lg text-sm pe-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirmPassword.length > 0 && password !== confirmPassword && (
            <p className="text-xs text-red-500">Les mots de passe ne correspondent pas</p>
          )}
        </div>

        <Button
          type="button"
          onClick={handlePasswordSubmit}
          disabled={saving || !isPasswordValid}
          className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              Finalisation...
            </span>
          ) : (
            "Terminer"
          )}
        </Button>
      </div>
    </div>
  );
}
