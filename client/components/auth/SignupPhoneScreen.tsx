import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { PhoneInput, toE164, isValidMoroccanMobile } from "./PhoneInput";
import { VerifyCodeInput, CountdownTimer } from "./VerifyCodeInput";

type Step = "phone" | "code" | "linking";

interface SignupPhoneScreenProps {
  onBack: () => void;
  onSuccess: (data: { actionLink?: string; isNewUser?: boolean; userId?: string }, referralCode?: string) => Promise<void>;
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
  loading = false,
  error = null,
  validateReferralCode,
}: SignupPhoneScreenProps) {

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
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

  // ─── Step 1: Send code via Twilio (WhatsApp or SMS) ───
  const handleSendCode = async () => {
    setLocalError(null);

    if (!isValidMoroccanMobile(phone)) {
      setLocalError("Numéro de téléphone invalide");
      return;
    }

    const e164Phone = toE164(phone);
    if (!e164Phone) {
      setLocalError("Numéro de téléphone invalide");
      return;
    }

    setLocalLoading(true);
    try {
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

    const e164Phone = toE164(phone);
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
    <div className="space-y-5">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={step === "phone" ? onBack : () => setStep("phone")}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Retour"
          disabled={isLoading}
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h2
            className="text-xl sm:text-2xl font-bold text-slate-900"
            style={{ fontFamily: "Circular Std, sans-serif" }}
          >
            {step === "phone" && "Inscription par téléphone"}
            {step === "code" && "Vérification"}
            {step === "linking" && "Création du compte"}
          </h2>
          <p className="text-sm text-slate-600">
            {step === "phone" && "Recevez un code par SMS"}
            {step === "code" && "Entrez le code reçu par SMS"}
            {step === "linking" && "Veuillez patienter..."}
          </p>
        </div>
      </div>

      {/* Error message */}
      {displayError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {displayError}
        </div>
      )}

      {/* Step: Phone input */}
      {step === "phone" && (
        <div className="space-y-4">
          {/* Phone number input */}
          <PhoneInput
            value={phone}
            onChange={setPhone}
            disabled={isLoading}
            label="Numéro de téléphone"
          />

          {/* Referral code (optional) */}
          <div className="space-y-2">
            <Label htmlFor="signup-phone-referral" className="text-sm font-medium text-slate-700">
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
                  "h-12 rounded-xl text-base uppercase",
                  referralStatus.valid === true && "border-green-500 pr-10",
                  referralStatus.valid === false && "border-red-500 pr-10"
                )}
                maxLength={20}
              />
              {referralStatus.checking && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin">⏳</span>
              )}
              {!referralStatus.checking && referralStatus.valid === true && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
              )}
              {!referralStatus.checking && referralStatus.valid === false && (
                <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
              )}
            </div>
            {referralStatus.valid && referralStatus.partnerName && (
              <p className="text-sm text-green-600">
                Parrainé par {referralStatus.partnerName}
              </p>
            )}
          </div>

          {/* Submit button */}
          <Button
            type="button"
            onClick={handleSendCode}
            disabled={isLoading || !isValidMoroccanMobile(phone)}
            className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 rounded-xl"
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
        <div className="space-y-6">
          {/* Display phone number */}
          <div className="text-center">
            <p className="text-sm text-slate-600">
              Code envoyé au
            </p>
            <p className="text-lg font-semibold text-slate-900">+212 {phone.slice(0, 3)} {phone.slice(3, 6)} {phone.slice(6)}</p>
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
            className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 rounded-xl"
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
        <div className="text-center py-8">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-slate-600">
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
