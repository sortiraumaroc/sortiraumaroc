/**
 * PhoneVerificationModal
 *
 * Modal pour vérifier le numéro de téléphone via Firebase SMS.
 * Utilisé dans le profil utilisateur pour confirmer le numéro de téléphone.
 */

import React, { useState, useEffect, useRef } from "react";
import { Phone, ArrowLeft, X, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { markPhoneAsVerified } from "@/lib/userData";
import {
  isFirebaseConfigured,
  sendPhoneVerificationCode,
  verifyPhoneCode,
  formatPhoneNumber,
  isValidPhoneNumber,
  clearRecaptchaVerifier,
  type ConfirmationResult,
} from "@/lib/firebase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PhoneVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified?: (phone: string) => void;
  initialPhone?: string;
}

type VerificationStep = "phone" | "code" | "success";

// Moroccan flag SVG
function MoroccanFlag() {
  return (
    <svg className="w-6 h-4 rounded-sm" viewBox="0 0 900 600">
      <rect width="900" height="600" fill="#c1272d" />
      <path
        d="M450 175l40.45 124.55h130.9l-105.9 76.9 40.45 124.55-105.9-76.9-105.9 76.9 40.45-124.55-105.9-76.9h130.9z"
        fill="none"
        stroke="#006233"
        strokeWidth="20"
      />
    </svg>
  );
}

export function PhoneVerificationModal({
  isOpen,
  onClose,
  onVerified,
  initialPhone = "",
}: PhoneVerificationModalProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<VerificationStep>("phone");
  const [phoneNumber, setPhoneNumber] = useState(initialPhone);
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const recaptchaRef = useRef<HTMLDivElement>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep("phone");
      setPhoneNumber(initialPhone);
      setVerificationCode("");
      setConfirmationResult(null);
      setError(null);
      setCountdown(0);
      clearRecaptchaVerifier();
    }
  }, [isOpen, initialPhone]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Focus first code input when switching to code step
  useEffect(() => {
    if (step === "code" && codeInputRefs.current[0]) {
      codeInputRefs.current[0].focus();
    }
  }, [step]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValidPhoneNumber(phoneNumber)) {
      setError(t("auth.phone.error.invalid_number"));
      return;
    }

    setBusy(true);

    try {
      const result = await sendPhoneVerificationCode(
        phoneNumber,
        "recaptcha-container-profile-phone"
      );
      setConfirmationResult(result);
      setStep("code");
      setCountdown(60); // 60 seconds before resend
    } catch (err) {
      console.error("[PhoneVerification] Error sending code:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorMessage.includes("too-many-requests")) {
        setError(t("auth.phone.error.too_many_requests"));
      } else if (errorMessage.includes("invalid-phone-number")) {
        setError(t("auth.phone.error.invalid_number"));
      } else {
        setError(t("auth.phone.error.send_failed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async (code: string) => {
    if (!confirmationResult || code.length !== 6) return;

    setError(null);
    setBusy(true);

    try {
      await verifyPhoneCode(confirmationResult, code);

      // Marquer le téléphone comme vérifié dans le profil local
      const formattedPhone = formatPhoneNumber(phoneNumber);
      const result = markPhoneAsVerified(formattedPhone);

      if (result.ok === false) {
        setError(result.message);
        return;
      }

      setStep("success");
      setTimeout(() => {
        onVerified?.(formattedPhone);
        onClose();
      }, 1500);
    } catch (err) {
      console.error("[PhoneVerification] Error verifying code:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorMessage.includes("invalid-verification-code")) {
        setError(t("auth.phone.error.invalid_code"));
      } else if (errorMessage.includes("code-expired")) {
        setError(t("auth.phone.error.code_expired"));
      } else {
        setError(t("auth.phone.error.verify_failed"));
      }
      setVerificationCode("");
    } finally {
      setBusy(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = verificationCode.split("");
    newCode[index] = value;
    const updatedCode = newCode.join("").slice(0, 6);
    setVerificationCode(updatedCode);

    // Auto-focus next input
    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (updatedCode.length === 6) {
      handleVerifyCode(updatedCode);
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !verificationCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleResendCode = () => {
    if (countdown > 0) return;
    setVerificationCode("");
    setError(null);
    clearRecaptchaVerifier();
    // Re-trigger send
    handleSendCode({ preventDefault: () => {} } as React.FormEvent);
  };

  // Check if Firebase is configured
  if (!isFirebaseConfigured()) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("profile.phone_verification.not_available")}</DialogTitle>
          </DialogHeader>
          <div className="text-center py-4">
            <p className="text-sm text-slate-600">
              {t("auth.phone.error.not_configured")}
            </p>
            <Button onClick={onClose} className="mt-4">
              {t("common.close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            {step !== "phone" && step !== "success" ? (
              <button
                onClick={() => {
                  setStep("phone");
                  setVerificationCode("");
                  setError(null);
                }}
                className="p-2 -ms-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
            ) : (
              <div className="w-9" />
            )}

            <DialogTitle className="text-lg font-semibold text-slate-900">
              {step === "phone" && t("profile.phone_verification.title")}
              {step === "code" && t("auth.phone.verify_title")}
              {step === "success" && t("auth.phone.success_title")}
            </DialogTitle>

            <button
              onClick={onClose}
              className="p-2 -me-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </DialogHeader>

        <div className="p-6">
          {/* Phone Input Step */}
          {step === "phone" && (
            <form onSubmit={handleSendCode}>
              <p className="text-sm text-slate-600 mb-6 text-center">
                {t("profile.phone_verification.subtitle")}
              </p>

              {/* Phone Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t("auth.phone.label")}
                </label>
                <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent">
                  <MoroccanFlag />
                  <span className="text-slate-500 font-medium">+212</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="6 XX XX XX XX"
                    value={phoneNumber.replace(/^\+?212/, "")}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "").slice(0, 9);
                      setPhoneNumber("+212" + value);
                    }}
                    className="flex-1 bg-transparent outline-none text-slate-900 placeholder:text-slate-400"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {t("auth.phone.hint")}
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={busy || phoneNumber.length < 12}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-white"
              >
                {busy ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Phone className="w-5 h-5 me-2" />
                    {t("auth.phone.send_code")}
                  </>
                )}
              </Button>

              {/* reCAPTCHA container */}
              <div id="recaptcha-container-profile-phone" ref={recaptchaRef} />
            </form>
          )}

          {/* Code Verification Step */}
          {step === "code" && (
            <div>
              <p className="text-sm text-slate-600 mb-2 text-center">
                {t("auth.phone.code_sent_to")}
              </p>
              <p className="text-base font-semibold text-slate-900 mb-6 text-center">
                {formatPhoneNumber(phoneNumber)}
              </p>

              {/* Code Input */}
              <div className="flex justify-center gap-2 mb-6">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <input
                    key={index}
                    ref={(el) => (codeInputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={verificationCode[index] || ""}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(index, e)}
                    className="w-12 h-14 text-center text-xl font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                    disabled={busy}
                  />
                ))}
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-sm text-red-600 text-center">{error}</p>
                </div>
              )}

              {/* Loading indicator */}
              {busy && (
                <div className="flex justify-center mb-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}

              {/* Resend code */}
              <div className="text-center">
                {countdown > 0 ? (
                  <p className="text-sm text-slate-500">
                    {t("auth.phone.resend_in")} {countdown}s
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={busy}
                    className="text-sm text-primary font-semibold hover:underline disabled:opacity-50"
                  >
                    {t("auth.phone.resend_code")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Success Step */}
          {step === "success" && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {t("profile.phone_verification.success")}
              </h3>
              <p className="text-sm text-slate-600">
                {t("profile.phone_verification.success_description")}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PhoneVerificationModal;
