import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { OAuthDivider } from "./OAuthButtons";
import { COUNTRIES } from "./PhoneInput";

// ─── Country detection via browser signals ───

function detectCountryFromBrowser(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const tzLower = tz.toLowerCase();

  const timezoneCountryMap: Record<string, string> = {
    "africa/casablanca": "MA",
    "africa/el_aaiun": "MA",
    "europe/paris": "FR",
    "europe/brussels": "BE",
    "america/new_york": "US",
    "america/chicago": "US",
    "america/denver": "US",
    "america/los_angeles": "US",
    "america/toronto": "CA",
    "america/vancouver": "CA",
    "america/montreal": "CA",
    "europe/rome": "IT",
    "europe/madrid": "ES",
    "europe/berlin": "DE",
    "europe/london": "GB",
    "europe/amsterdam": "NL",
    "europe/zurich": "CH",
    "europe/luxembourg": "LU",
    "asia/dubai": "AE",
    "africa/algiers": "DZ",
    "africa/tunis": "TN",
  };

  for (const [tzKey, country] of Object.entries(timezoneCountryMap)) {
    if (tzLower === tzKey) return country;
  }

  const lang = navigator.language || "";
  const parts = lang.split("-");
  if (parts.length >= 2) {
    const regionCode = parts[parts.length - 1].toUpperCase();
    if (COUNTRIES.find((c) => c.code === regionCode)) {
      return regionCode;
    }
  }

  return "MA";
}

function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[+0-9]/.test(trimmed) && !trimmed.includes("@");
}

function normalizePhone(localNumber: string, countryCode: string): string {
  const digits = localNumber.replace(/\D/g, "");
  const country = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];
  const cleaned = digits.startsWith("0") ? digits.slice(1) : digits;

  if (cleaned.length >= country.minDigits && cleaned.length <= country.maxDigits) {
    return `${country.dial}${cleaned}`;
  }
  return "";
}

// ─── Login step for phone ───
type PhoneLoginStep = "identifier" | "otp";

// ─── Component ───

interface LoginScreenProps {
  onBack: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onPhoneLoginSuccess?: (result: { actionLink?: string; isNewUser?: boolean; userId?: string }) => void;
  onForgotPassword: () => void;
  onSignupClick: () => void;
  onOAuthClick: (provider: "google" | "apple" | "facebook") => void;
  loading?: boolean;
  oauthLoading?: boolean;
  oauthLoadingProvider?: "google" | "apple" | "facebook" | null;
  error?: string | null;
}

export function LoginScreen({
  onBack,
  onLogin,
  onPhoneLoginSuccess,
  onForgotPassword,
  onSignupClick,
  onOAuthClick,
  loading = false,
  oauthLoading = false,
  oauthLoadingProvider = null,
  error = null,
}: LoginScreenProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Phone-specific state
  const [isPhone, setIsPhone] = useState(false);
  const [phoneLookupLoading, setPhoneLookupLoading] = useState(false);
  const [phoneLookupDone, setPhoneLookupDone] = useState(false);
  const [phoneExists, setPhoneExists] = useState(false);
  const [phoneE164, setPhoneE164] = useState("");
  const [detectedCountry] = useState(() => detectCountryFromBrowser());

  // OTP step state
  const [phoneStep, setPhoneStep] = useState<PhoneLoginStep>("identifier");
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  const lookupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLookupRef = useRef("");

  const displayError = error || localError;

  // Detect if input is phone & trigger silent lookup
  const handleIdentifierChange = useCallback(
    (value: string) => {
      setIdentifier(value);
      setLocalError(null);

      const phone = looksLikePhone(value);
      setIsPhone(phone);

      if (!phone) {
        setPhoneLookupDone(false);
        setPhoneExists(false);
        setPhoneE164("");
        setPhoneLookupLoading(false);
        setPhoneStep("identifier");
        if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
        return;
      }

      const e164 = normalizePhone(value, detectedCountry);
      if (!e164 || e164 === lastLookupRef.current) return;

      if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
      setPhoneLookupDone(false);
      setPhoneExists(false);

      lookupTimeoutRef.current = setTimeout(async () => {
        lastLookupRef.current = e164;
        setPhoneLookupLoading(true);
        try {
          const res = await fetch("/api/consumer/auth/phone/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phoneNumber: e164 }),
          });
          const data = await res.json();
          setPhoneExists(!!data.exists);
          setPhoneE164(e164);
          setPhoneLookupDone(true);
        } catch {
          setPhoneExists(false);
          setPhoneLookupDone(true);
        } finally {
          setPhoneLookupLoading(false);
        }
      }, 600);
    },
    [detectedCountry]
  );

  useEffect(() => {
    return () => {
      if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
    };
  }, []);

  // Send OTP for phone login
  const handleSendOtp = useCallback(async () => {
    if (!phoneE164) return;
    setOtpSending(true);
    setLocalError(null);

    try {
      const res = await fetch("/api/consumer/auth/phone/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneE164 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLocalError(data.error || "Échec de l'envoi du code");
        return;
      }
      setPhoneStep("otp");
    } catch {
      setLocalError("Échec de l'envoi du code");
    } finally {
      setOtpSending(false);
    }
  }, [phoneE164]);

  // Verify OTP for phone login
  const handleVerifyOtp = useCallback(async () => {
    if (!phoneE164 || !otpCode) return;
    setOtpVerifying(true);
    setLocalError(null);

    try {
      const res = await fetch("/api/consumer/auth/phone/verify-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneE164, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLocalError(data.error || "Code invalide");
        return;
      }
      // Success — redirect via actionLink
      if (onPhoneLoginSuccess) {
        onPhoneLoginSuccess(data);
      } else if (data.actionLink) {
        window.location.assign(data.actionLink);
      }
    } catch {
      setLocalError("Échec de la vérification");
    } finally {
      setOtpVerifying(false);
    }
  }, [phoneE164, otpCode, onPhoneLoginSuccess]);

  // Email form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const trimmed = identifier.trim();
    if (!trimmed) {
      setLocalError("Veuillez entrer votre email ou numéro de téléphone");
      return;
    }

    if (isPhone) {
      // For phone: trigger OTP send
      if (phoneStep === "identifier") {
        if (!phoneExists) {
          setLocalError("Aucun compte trouvé avec ce numéro");
          return;
        }
        await handleSendOtp();
      } else {
        // OTP step: verify
        await handleVerifyOtp();
      }
    } else {
      // Email login
      const trimmedEmail = trimmed.toLowerCase();
      if (!/.+@.+\..+/.test(trimmedEmail)) {
        setLocalError("Email invalide");
        return;
      }
      if (!password) {
        setLocalError("Veuillez entrer votre mot de passe");
        return;
      }
      try {
        await onLogin(trimmedEmail, password);
      } catch {
        // Error handled by parent
      }
    }
  };

  const countryInfo = COUNTRIES.find((c) => c.code === detectedCountry) || COUNTRIES[0];
  const isPhoneOtpStep = isPhone && phoneStep === "otp";

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (isPhoneOtpStep) {
              // Go back to identifier step
              setPhoneStep("identifier");
              setOtpCode("");
              setLocalError(null);
            } else {
              onBack();
            }
          }}
          className="p-1.5 -ml-1.5 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Retour"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div>
          <h2
            className="text-lg sm:text-xl font-bold text-slate-900"
            style={{ fontFamily: "Circular Std, sans-serif" }}
          >
            Se connecter
          </h2>
          <p className="text-xs text-slate-600">
            {isPhoneOtpStep
              ? "Entrez le code reçu par SMS"
              : "Accédez à votre compte"}
          </p>
        </div>
      </div>

      {/* Error message */}
      {displayError && !displayError.includes("existe déjà") && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {displayError}
        </div>
      )}

      {/* Email already exists — friendly amber banner */}
      {displayError && displayError.includes("existe déjà") && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 text-center">
          <p className="font-medium">Cet email est déjà associé à un compte.</p>
          <p className="mt-1 text-xs">
            Connectez-vous avec votre compte existant.
          </p>
        </div>
      )}

      {/* Login form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {!isPhoneOtpStep ? (
          <>
            {/* Email / Phone identifier */}
            <div className="space-y-1.5">
              <Label htmlFor="login-identifier" className="text-sm font-medium text-slate-900">
                Email / Téléphone
              </Label>
              <div className="relative">
                <Input
                  id="login-identifier"
                  type="text"
                  inputMode={isPhone ? "tel" : "email"}
                  value={identifier}
                  onChange={(e) => handleIdentifierChange(e.target.value)}
                  placeholder="Entrez votre numéro ou email"
                  disabled={loading || otpSending}
                  autoComplete="username"
                  className={cn(
                    "h-10 rounded-lg text-sm",
                    isPhone && "pr-20",
                    displayError && "border-red-300"
                  )}
                />
                {isPhone && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {phoneLookupLoading && (
                      <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                    )}
                    {phoneLookupDone && phoneExists && (
                      <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {phoneLookupDone && !phoneExists && (
                      <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    <span className="text-xs text-slate-400">{countryInfo.flag}</span>
                  </div>
                )}
              </div>
              {isPhone && phoneLookupDone && !phoneExists && !displayError && (
                <p className="text-xs text-amber-600">
                  Aucun compte trouvé avec ce numéro
                </p>
              )}
            </div>

            {/* Password — only for email login */}
            {!isPhone && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password" className="text-sm font-medium text-slate-900">
                    Mot de passe
                  </Label>
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-xs text-primary hover:text-primary/80 font-medium"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={loading}
                    autoComplete="current-password"
                    className={cn(
                      "h-10 rounded-lg text-sm pr-10",
                      displayError && "border-red-300"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* OTP code input for phone login */
          <div className="space-y-1.5">
            <Label htmlFor="login-otp" className="text-sm font-medium text-slate-900">
              Code de vérification
            </Label>
            <Input
              id="login-otp"
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setOtpCode(v);
                setLocalError(null);
              }}
              placeholder="000000"
              disabled={otpVerifying}
              autoComplete="one-time-code"
              autoFocus
              className={cn(
                "h-10 rounded-lg text-sm text-center tracking-[0.3em] font-mono",
                displayError && "border-red-300"
              )}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Code envoyé au {identifier}
              </p>
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={otpSending}
                className="text-xs text-primary hover:text-primary/80 font-medium"
              >
                {otpSending ? "Envoi..." : "Renvoyer"}
              </button>
            </div>
          </div>
        )}

        {/* Submit button */}
        <Button
          type="submit"
          disabled={
            isPhoneOtpStep
              ? otpVerifying || otpCode.length < 6
              : isPhone
                ? loading || !identifier || !phoneLookupDone || !phoneExists || phoneLookupLoading || otpSending
                : loading || !identifier || !password
          }
          className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
        >
          {(loading || otpSending || otpVerifying) ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {otpVerifying ? "Vérification..." : otpSending ? "Envoi du code..." : "Connexion..."}
            </span>
          ) : isPhoneOtpStep ? (
            "Vérifier"
          ) : isPhone && phoneLookupDone && phoneExists ? (
            "Recevoir un code SMS"
          ) : (
            "Se connecter"
          )}
        </Button>
      </form>

      {/* OAuth divider — hide during OTP step */}
      {!isPhoneOtpStep && (
        <>
          <OAuthDivider />

          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => onOAuthClick("google")}
              disabled={oauthLoading}
              className="w-12 h-12 flex items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
              aria-label="Google"
            >
              {oauthLoadingProvider === "google" ? (
                <span className="animate-spin text-sm">⏳</span>
              ) : (
                <img src="/google.png" alt="Google" className="w-5 h-5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onOAuthClick("apple")}
              disabled={oauthLoading}
              className="w-12 h-12 flex items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
              aria-label="Apple"
            >
              {oauthLoadingProvider === "apple" ? (
                <span className="animate-spin text-sm">⏳</span>
              ) : (
                <img src="/logo-apple.png" alt="Apple" className="w-5 h-5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onOAuthClick("facebook")}
              disabled={oauthLoading}
              className="w-12 h-12 flex items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
              aria-label="Facebook"
            >
              {oauthLoadingProvider === "facebook" ? (
                <span className="animate-spin text-sm">⏳</span>
              ) : (
                <img src="/facebook.png" alt="Facebook" className="w-5 h-5" />
              )}
            </button>
          </div>
        </>
      )}

      {/* Signup link */}
      <p className="text-center text-xs text-slate-600">
        Pas encore de compte ?{" "}
        <button
          type="button"
          onClick={onSignupClick}
          className="text-primary hover:text-primary/80 font-semibold"
        >
          Créer un compte
        </button>
      </p>
    </div>
  );
}
