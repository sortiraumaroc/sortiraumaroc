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
type PhoneLoginStep = "identifier" | "otp" | "forgot_channel" | "forgot_code" | "forgot_newpw";

// ─── Component ───

interface LoginScreenProps {
  onBack: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onPhoneLoginSuccess?: (result: { actionLink?: string; isNewUser?: boolean; userId?: string }) => void;
  onForgotPassword: () => void;
  onSignupClick: () => void;
  onOAuthClick: (provider: "google" | "apple") => void;
  loading?: boolean;
  oauthLoading?: boolean;
  oauthLoadingProvider?: "google" | "apple" | null;
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
  const [phoneHasPassword, setPhoneHasPassword] = useState(false);
  const [phoneE164, setPhoneE164] = useState("");
  const [detectedCountry] = useState(() => detectCountryFromBrowser());
  const [phonePasswordLoading, setPhonePasswordLoading] = useState(false);

  // Forgot password state (phone)
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [resetVerifying, setResetVerifying] = useState(false);

  // OTP step state
  const [phoneStep, setPhoneStep] = useState<PhoneLoginStep>("identifier");
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  // Trusted device state
  const [trustedDeviceChecking, setTrustedDeviceChecking] = useState(false);
  const trustedDeviceCheckedRef = useRef<string>("");

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
        setPhoneHasPassword(false);
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
          setPhoneHasPassword(!!data.hasPassword);
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

  // Attempt trusted device login when phone lookup finds an existing user
  useEffect(() => {
    if (!phoneLookupDone || !phoneExists || !phoneE164) return;
    if (trustedDeviceCheckedRef.current === phoneE164) return; // already checked this number
    trustedDeviceCheckedRef.current = phoneE164;

    const attemptTrustedLogin = async () => {
      setTrustedDeviceChecking(true);
      try {
        const res = await fetch("/api/consumer/auth/phone/trusted-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include", // CRITICAL: send cookies
          body: JSON.stringify({ phoneNumber: phoneE164 }),
        });
        const data = await res.json();
        if (data.trusted && data.success && data.actionLink) {
          // Device is trusted — skip OTP, redirect directly
          if (onPhoneLoginSuccess) {
            onPhoneLoginSuccess(data);
          } else {
            window.location.assign(data.actionLink);
          }
          return;
        }
        // Not trusted — fall through to normal flow
      } catch {
        // Silently fail — fall through to normal flow
      } finally {
        setTrustedDeviceChecking(false);
      }
    };

    attemptTrustedLogin();
  }, [phoneLookupDone, phoneExists, phoneE164, onPhoneLoginSuccess]);

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
        credentials: "include", // Allow trust cookie to be set
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

  // Send forgot password code via SMS or WhatsApp
  const handleForgotSendCode = useCallback(async (channel: "sms" | "whatsapp") => {
    if (!phoneE164) return;
    setResetSending(true);
    setLocalError(null);

    try {
      const res = await fetch("/api/consumer/auth/phone/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneE164, method: channel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLocalError(data.error || "Erreur lors de l'envoi du code");
        return;
      }
      setPhoneStep("forgot_code");
    } catch {
      setLocalError("Erreur lors de l'envoi du code");
    } finally {
      setResetSending(false);
    }
  }, [phoneE164]);

  // Reset password with code + new password
  const handleResetPassword = useCallback(async () => {
    if (!phoneE164 || !resetCode || !resetNewPassword) return;
    if (resetNewPassword.length < 8) {
      setLocalError("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setLocalError("Les mots de passe ne correspondent pas");
      return;
    }
    setResetVerifying(true);
    setLocalError(null);

    try {
      const res = await fetch("/api/consumer/auth/phone/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneE164, code: resetCode, newPassword: resetNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLocalError(data.error || "Code invalide");
        return;
      }
      // Success — go back to login
      setPhoneStep("identifier");
      setPassword("");
      setResetCode("");
      setResetNewPassword("");
      setResetConfirmPassword("");
      setLocalError(null);
    } catch {
      setLocalError("Erreur lors de la réinitialisation");
    } finally {
      setResetVerifying(false);
    }
  }, [phoneE164, resetCode, resetNewPassword, resetConfirmPassword]);

  // Phone password login
  const handlePhonePasswordLogin = useCallback(async () => {
    if (!phoneE164 || !password) return;
    setPhonePasswordLoading(true);
    setLocalError(null);

    try {
      const res = await fetch("/api/consumer/auth/phone/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Allow trust cookie to be set
        body: JSON.stringify({ phoneNumber: phoneE164, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLocalError(data.error || "Mot de passe incorrect");
        return;
      }
      // Success — redirect via actionLink (same as OTP login)
      if (onPhoneLoginSuccess) {
        onPhoneLoginSuccess(data);
      } else if (data.actionLink) {
        window.location.assign(data.actionLink);
      }
    } catch {
      setLocalError("Erreur de connexion");
    } finally {
      setPhonePasswordLoading(false);
    }
  }, [phoneE164, password, onPhoneLoginSuccess]);

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
      if (phoneHasPassword && phoneStep === "identifier") {
        // Phone user with password — login with password
        if (!phoneExists) {
          setLocalError("Aucun compte trouvé avec ce numéro");
          return;
        }
        if (!password) {
          setLocalError("Veuillez entrer votre mot de passe");
          return;
        }
        await handlePhonePasswordLogin();
      } else if (phoneStep === "identifier") {
        // Phone user without password — OTP flow
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
  const isPhoneForgotStep = isPhone && (phoneStep === "forgot_channel" || phoneStep === "forgot_code" || phoneStep === "forgot_newpw");

  // Password strength (for reset)
  const resetPasswordStrength = (() => {
    let bars = 0;
    if (resetNewPassword.length >= 8) bars++;
    if (/[a-zA-Z]/.test(resetNewPassword) && /\d/.test(resetNewPassword)) bars++;
    if (/[^a-zA-Z0-9]/.test(resetNewPassword)) bars++;
    return bars;
  })();

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (phoneStep === "forgot_newpw") {
              setPhoneStep("forgot_code");
              setLocalError(null);
            } else if (phoneStep === "forgot_code") {
              setPhoneStep("forgot_channel");
              setResetCode("");
              setLocalError(null);
            } else if (phoneStep === "forgot_channel") {
              setPhoneStep("identifier");
              setLocalError(null);
            } else if (isPhoneOtpStep) {
              setPhoneStep("identifier");
              setOtpCode("");
              setLocalError(null);
            } else {
              onBack();
            }
          }}
          className="p-1.5 -ms-1.5 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Retour"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div>
          <h2
            className="text-lg sm:text-xl font-bold text-slate-900"
            style={{ fontFamily: "Circular Std, sans-serif" }}
          >
            {isPhoneForgotStep ? "Mot de passe oublié" : "Se connecter"}
          </h2>
          <p className="text-xs text-slate-600">
            {phoneStep === "forgot_channel"
              ? "Choisissez comment recevoir le code"
              : phoneStep === "forgot_code"
              ? "Entrez le code de réinitialisation"
              : phoneStep === "forgot_newpw"
              ? "Définissez votre nouveau mot de passe"
              : isPhoneOtpStep
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
        {isPhoneForgotStep ? (
          /* ─── Forgot password steps for phone users ─── */
          phoneStep === "forgot_channel" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Nous allons envoyer un code de réinitialisation au <span className="font-medium">{identifier}</span>
              </p>
              <Button
                type="button"
                onClick={() => handleForgotSendCode("sms")}
                disabled={resetSending}
                className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
              >
                {resetSending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Envoi...
                  </span>
                ) : (
                  "Recevoir par SMS"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleForgotSendCode("whatsapp")}
                disabled={resetSending}
                className="w-full h-10 text-sm font-semibold rounded-lg"
              >
                {resetSending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Envoi...
                  </span>
                ) : (
                  "Recevoir par WhatsApp"
                )}
              </Button>
            </div>
          ) : phoneStep === "forgot_code" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="reset-code" className="text-sm font-medium text-slate-900">
                  Code de vérification
                </Label>
                <Input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  value={resetCode}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setResetCode(v);
                    setLocalError(null);
                  }}
                  placeholder="000000"
                  autoFocus
                  autoComplete="one-time-code"
                  className="h-10 rounded-lg text-sm text-center tracking-[0.3em] font-mono"
                />
                <p className="text-xs text-slate-500">
                  Code envoyé au {identifier}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => {
                  if (resetCode.length === 6) {
                    setPhoneStep("forgot_newpw");
                    setLocalError(null);
                  }
                }}
                disabled={resetCode.length < 6}
                className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
              >
                Continuer
              </Button>
            </div>
          ) : (
            /* forgot_newpw step */
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="reset-new-password" className="text-sm font-medium text-slate-900">
                  Nouveau mot de passe
                </Label>
                <div className="relative">
                  <Input
                    id="reset-new-password"
                    type={showResetPassword ? "text" : "password"}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Min. 8 caractères"
                    autoFocus
                    autoComplete="new-password"
                    className="h-10 rounded-lg text-sm pe-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Strength indicator */}
                <div className="flex gap-1">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1 flex-1 rounded-full transition-colors",
                        resetPasswordStrength >= i ? "bg-green-500" : "bg-slate-200"
                      )}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reset-confirm-password" className="text-sm font-medium text-slate-900">
                  Confirmer le mot de passe
                </Label>
                <div className="relative">
                  <Input
                    id="reset-confirm-password"
                    type={showResetConfirmPassword ? "text" : "password"}
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className={cn(
                      "h-10 rounded-lg text-sm pe-10",
                      resetConfirmPassword && resetNewPassword !== resetConfirmPassword && "border-red-300"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetConfirmPassword(!showResetConfirmPassword)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showResetConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {resetConfirmPassword && resetNewPassword !== resetConfirmPassword && (
                  <p className="text-xs text-red-500">Les mots de passe ne correspondent pas</p>
                )}
              </div>
              <Button
                type="button"
                onClick={handleResetPassword}
                disabled={
                  resetVerifying ||
                  resetNewPassword.length < 8 ||
                  resetNewPassword !== resetConfirmPassword
                }
                className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
              >
                {resetVerifying ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Réinitialisation...
                  </span>
                ) : (
                  "Réinitialiser le mot de passe"
                )}
              </Button>
            </div>
          )
        ) : !isPhoneOtpStep ? (
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
                    isPhone && "pe-20",
                    displayError && "border-red-300"
                  )}
                />
                {isPhone && (
                  <div className="absolute end-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
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

            {/* Password — for email login OR phone users with password */}
            {(!isPhone || (isPhone && phoneLookupDone && phoneExists && phoneHasPassword)) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password" className="text-sm font-medium text-slate-900">
                    Mot de passe
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      if (isPhone && phoneHasPassword) {
                        // Phone user → forgot via SMS/WhatsApp
                        setPhoneStep("forgot_channel");
                        setLocalError(null);
                      } else {
                        // Email user → existing forgot flow
                        onForgotPassword();
                      }
                    }}
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
                    disabled={loading || phonePasswordLoading}
                    autoComplete="current-password"
                    className={cn(
                      "h-10 rounded-lg text-sm pe-10",
                      displayError && "border-red-300"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
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

        {/* Submit button — hidden during forgot steps (they have their own buttons) */}
        {!isPhoneForgotStep && (
          <Button
            type="submit"
            disabled={
              trustedDeviceChecking
                ? true
                : isPhoneOtpStep
                  ? otpVerifying || otpCode.length < 6
                  : isPhone
                    ? phoneHasPassword
                      ? phonePasswordLoading || !identifier || !password || !phoneLookupDone || !phoneExists
                      : loading || !identifier || !phoneLookupDone || !phoneExists || phoneLookupLoading || otpSending
                    : loading || !identifier || !password
            }
            className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
          >
            {trustedDeviceChecking ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Connexion automatique...
              </span>
            ) : (loading || otpSending || otpVerifying || phonePasswordLoading) ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {otpVerifying ? "Vérification..." : otpSending ? "Envoi du code..." : "Connexion..."}
              </span>
            ) : isPhoneOtpStep ? (
              "Vérifier"
            ) : isPhone && phoneLookupDone && phoneExists && !phoneHasPassword ? (
              "Recevoir un code SMS"
            ) : (
              "Se connecter"
            )}
          </Button>
        )}
      </form>

      {/* OAuth divider — hide during OTP & forgot steps */}
      {!isPhoneOtpStep && !isPhoneForgotStep && (
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
          </div>
        </>
      )}

      {/* Signup link — hide during OTP & forgot steps */}
      {!isPhoneOtpStep && !isPhoneForgotStep && (
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
      )}
    </div>
  );
}
