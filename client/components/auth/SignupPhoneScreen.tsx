import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { PhoneInput, toE164, isValidPhone } from "./PhoneInput";
import { VerifyCodeInput, CountdownTimer } from "./VerifyCodeInput";

type Step = "phone" | "code" | "linking";

interface SignupPhoneScreenProps {
  onBack: () => void;
  onSuccess: (data: { actionLink?: string; isNewUser?: boolean; userId?: string }, referralCode?: string) => Promise<void>;
  onLoginClick?: () => void;
  loading?: boolean;
  error?: string | null;
  validateReferralCode?: (code: string) => Promise<{ valid: boolean; partnerName?: string }>;
}

/**
 * Phone signup screen using Twilio Verify (server-side).
 * No Firebase, no reCAPTCHA needed.
 *
 * Flow:
 * 1. User enters phone number → POST /api/consumer/auth/phone/send-code
 * 2. User enters SMS code → POST /api/consumer/auth/phone/verify-code
 * 3. Server creates Supabase account and returns actionLink
 */
export function SignupPhoneScreen({
  onBack,
  onSuccess,
  onLoginClick,
  loading = false,
  error = null,
  validateReferralCode,
}: SignupPhoneScreenProps) {

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("MA");
  const [code, setCode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [canResend, setCanResend] = useState(false);

  // Referral code validation state
  const [referralStatus, setReferralStatus] = useState<{
    checking: boolean;
    valid: boolean | null;
    partnerName?: string;
  }>({ checking: false, valid: null });

  const displayError = error || localError;
  const isLoading = loading || localLoading;

  const handleReferralCodeChange = async (value: string) => {
    const code = value.toUpperCase().trim();
    setReferralCode(code);

    if (!code) {
      setReferralStatus({ checking: false, valid: null });
      return;
    }

    if (code.length >= 3 && validateReferralCode) {
      setReferralStatus({ checking: true, valid: null });
      try {
        const result = await validateReferralCode(code);
        setReferralStatus({
          checking: false,
          valid: result.valid,
          partnerName: result.partnerName,
        });
      } catch {
        setReferralStatus({ checking: false, valid: false });
      }
    }
  };

  // ─── Step 1: Check if phone exists, then send code via Twilio ───
  const handleSendCode = async () => {
    setLocalError(null);

    if (!isValidPhone(phone, countryCode)) {
      setLocalError("Numéro de téléphone invalide");
      return;
    }

    const e164Phone = toE164(phone, countryCode);
    if (!e164Phone) {
      setLocalError("Numéro de téléphone invalide");
      return;
    }

    setLocalLoading(true);
    try {
      // First, check if the phone number already exists in the database
      const lookupRes = await fetch("/api/consumer/auth/phone/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: e164Phone }),
      });
      const lookupData = await lookupRes.json();

      if (lookupData.exists) {
        // Phone already registered — show the "already exists" error
        setLocalError("PHONE_ALREADY_EXISTS");
        setLocalLoading(false);
        return;
      }

      // Phone is new — proceed to send the verification code
      const res = await fetch("/api/consumer/auth/phone/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: e164Phone }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Échec de l'envoi du code");
      }

      console.log("[SignupPhoneScreen] Code sent successfully:", result.status, "channel:", result.channel);
      setStep("code");
      setCanResend(false);
    } catch (err: unknown) {
      console.error("[SignupPhoneScreen] Send code error:", err);
      const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
      setLocalError(errorMessage);
    } finally {
      setLocalLoading(false);
    }
  };

  // ─── Step 2: Verify code and create account via Twilio ───
  const handleVerifyCode = async (verificationCode: string) => {
    setLocalError(null);
    setLocalLoading(true);
    setStep("linking");

    const e164Phone = toE164(phone, countryCode);
    if (!e164Phone) {
      setLocalError("Numéro de téléphone invalide");
      setStep("code");
      setLocalLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/consumer/auth/phone/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: e164Phone,
          code: verificationCode.trim(),
          referralCode: referralCode || undefined,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        // If phone already exists, show specific error with login redirect
        if (res.status === 409 || result.code === "PHONE_ALREADY_EXISTS") {
          setStep("phone");
          setLocalError("PHONE_ALREADY_EXISTS");
          setCode("");
          setLocalLoading(false);
          return;
        }
        throw new Error(result.error || "Échec de la vérification");
      }

      console.log("[SignupPhoneScreen] Verification successful:", result);

      // Call parent success handler with the result
      await onSuccess(result, referralCode || undefined);
    } catch (err: unknown) {
      console.error("[SignupPhoneScreen] Verify code error:", err);
      const errorMessage = err instanceof Error ? err.message : "";

      setStep("code");

      if (errorMessage.includes("invalide") || errorMessage.includes("expiré")) {
        setLocalError(errorMessage);
      } else {
        setLocalError("Échec de la vérification. Réessayez.");
      }
      setCode("");
    } finally {
      setLocalLoading(false);
    }
  };

  const handleResendCode = async () => {
    setCode("");
    setLocalError(null);
    await handleSendCode();
  };

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={step === "phone" ? onBack : () => setStep("phone")}
          className="p-1.5 -ml-1.5 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Retour"
          disabled={isLoading}
        >
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div>
          <h2
            className="text-lg sm:text-xl font-bold text-slate-900"
            style={{ fontFamily: "Circular Std, sans-serif" }}
          >
            {step === "phone" && "Inscription par téléphone"}
            {step === "code" && "Vérification"}
            {step === "linking" && "Création du compte"}
          </h2>
          <p className="text-xs text-slate-600">
            {step === "phone" && "Recevez un code par SMS"}
            {step === "code" && "Entrez le code reçu par SMS"}
            {step === "linking" && "Veuillez patienter..."}
          </p>
        </div>
      </div>

      {/* Error message */}
      {displayError && displayError !== "PHONE_ALREADY_EXISTS" && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {displayError}
        </div>
      )}

      {/* Phone already exists — redirect to login */}
      {displayError === "PHONE_ALREADY_EXISTS" && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 text-center">
          <p className="font-medium">Ce numéro est déjà associé à un compte.</p>
          <p className="mt-1 text-xs">
            Connectez-vous avec votre compte existant.
          </p>
          {onLoginClick && (
            <button
              type="button"
              onClick={onLoginClick}
              className="mt-2 w-full text-center text-sm font-semibold text-primary hover:underline"
            >
              J'ai déjà un compte →
            </button>
          )}
        </div>
      )}

      {/* Step: Phone input */}
      {step === "phone" && (
        <div className="space-y-3">
          {/* Phone number input */}
          <PhoneInput
            value={phone}
            onChange={setPhone}
            countryCode={countryCode}
            onCountryChange={setCountryCode}
            disabled={isLoading}
            label="Numéro de téléphone"
          />

          {/* Referral code (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="signup-phone-referral" className="text-sm font-medium text-slate-900">
              Code parrain
              <span className="text-slate-400 font-normal ml-1">
                (optionnel)
              </span>
            </Label>
            <div className="relative">
              <Input
                id="signup-phone-referral"
                type="text"
                value={referralCode}
                onChange={(e) => handleReferralCodeChange(e.target.value)}
                placeholder="SAMXXX"
                disabled={isLoading}
                className={cn(
                  "h-10 rounded-lg text-sm uppercase",
                  referralStatus.valid === true && "border-green-500 pr-10",
                  referralStatus.valid === false && "border-red-500 pr-10"
                )}
                maxLength={20}
              />
              {referralStatus.checking && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin">⏳</span>
              )}
              {!referralStatus.checking && referralStatus.valid === true && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
              )}
              {!referralStatus.checking && referralStatus.valid === false && (
                <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
              )}
            </div>
            {referralStatus.valid && referralStatus.partnerName && (
              <p className="text-xs text-green-600">
                Parrainé par {referralStatus.partnerName}
              </p>
            )}
          </div>

          {/* Submit button */}
          <Button
            type="button"
            onClick={handleSendCode}
            disabled={isLoading || !isValidPhone(phone, countryCode)}
            className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Envoi en cours...
              </span>
            ) : (
              "Recevoir le code SMS"
            )}
          </Button>
        </div>
      )}

      {/* Step: Code verification */}
      {step === "code" && (
        <div className="space-y-4">
          {/* Display phone number */}
          <div className="text-center">
            <p className="text-xs text-slate-600">
              Code envoyé au
            </p>
            <p className="text-sm font-semibold text-slate-900">{toE164(phone, countryCode)}</p>
          </div>

          {/* Code input */}
          <VerifyCodeInput
            length={6}
            value={code}
            onChange={setCode}
            onComplete={handleVerifyCode}
            error={displayError ? undefined : undefined}
            disabled={isLoading}
          />

          {/* Resend timer */}
          <div className="text-center">
            <CountdownTimer
              seconds={60}
              onComplete={() => setCanResend(true)}
              onResend={handleResendCode}
              resendLabel="Renvoyer le code"
              waitingLabel="Renvoyer dans"
            />
          </div>

          {/* Verify button (optional, auto-submit on complete) */}
          <Button
            type="button"
            onClick={() => handleVerifyCode(code)}
            disabled={isLoading || code.length !== 6}
            className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
          >
            {isLoading ? (
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

      {/* Step: Linking (loading state) */}
      {step === "linking" && (
        <div className="text-center py-6">
          <div className="animate-spin text-3xl mb-3">⏳</div>
          <p className="text-xs text-slate-600">
            Création de votre compte...
          </p>
        </div>
      )}

      {/* Terms */}
      {step === "phone" && (
        <p className="text-xs text-center text-slate-500">
          En vous inscrivant, vous acceptez nos Conditions d'utilisation et notre Politique de confidentialité
        </p>
      )}
    </div>
  );
}
