/**
 * PhoneAuthModal
 *
 * Mobile-optimized phone authentication using Firebase.
 * Provides SMS-based login/signup for mobile users.
 */

import React, { useState, useEffect, useRef } from "react";
import { Phone, ArrowLeft, X, Loader2, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { markAuthed } from "@/lib/auth";
import { consumerSupabase } from "@/lib/supabase";
import {
  isFirebaseConfigured,
  sendPhoneVerificationCode,
  verifyPhoneCode,
  formatPhoneNumber,
  isValidPhoneNumber,
  clearRecaptchaVerifier,
  type ConfirmationResult,
} from "@/lib/firebase";

interface PhoneAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthed?: () => void;
  onSwitchToEmail?: () => void;
  referralCode?: string; // Code de parrainage optionnel
}

type AuthStep = "phone" | "code" | "success";

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

export function PhoneAuthModal({
  isOpen,
  onClose,
  onAuthed,
  onSwitchToEmail,
  referralCode,
}: PhoneAuthModalProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<AuthStep>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
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
      setPhoneNumber("");
      setVerificationCode("");
      setConfirmationResult(null);
      setError(null);
      setCountdown(0);
      clearRecaptchaVerifier();
    }
  }, [isOpen]);

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
        "recaptcha-container-phone"
      );
      setConfirmationResult(result);
      setStep("code");
      setCountdown(60); // 60 seconds before resend
    } catch (err) {
      console.error("[PhoneAuth] Error sending code:", err);
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
      const credential = await verifyPhoneCode(confirmationResult, code);
      const firebaseUser = credential.user;

      // Get the Firebase ID token
      const idToken = await firebaseUser.getIdToken();

      // Link with Supabase or create a new account
      // We'll use a custom endpoint to verify the Firebase token and create/login the user
      const response = await fetch("/api/consumer/auth/firebase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idToken,
          phoneNumber: formatPhoneNumber(phoneNumber),
          referral_code: referralCode || undefined, // Code de parrainage
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Authentication failed");
      }

      const { supabaseToken, user } = await response.json();

      // Sign in to Supabase with the custom token
      if (supabaseToken) {
        // Set the session manually if using custom tokens
        // This depends on your Supabase setup
        const { error: supabaseError } = await consumerSupabase.auth.setSession({
          access_token: supabaseToken.access_token,
          refresh_token: supabaseToken.refresh_token,
        });

        if (supabaseError) {
          console.error("[PhoneAuth] Supabase session error:", supabaseError);
        }
      }

      setStep("success");
      setTimeout(() => {
        markAuthed();
        onAuthed?.();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("[PhoneAuth] Error verifying code:", err);
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

  if (!isOpen) return null;

  // Check if Firebase is configured
  if (!isFirebaseConfigured()) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full text-center">
          <p className="text-slate-600 mb-4">
            {t("auth.phone.error.not_configured")}
          </p>
          <button
            onClick={onSwitchToEmail}
            className="text-primary font-semibold"
          >
            {t("auth.phone.use_email_instead")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md md:w-full md:rounded-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white px-4 py-4 border-b border-slate-100 flex items-center justify-between">
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

          <h2 className="text-lg font-semibold text-slate-900">
            {step === "phone" && t("auth.phone.title")}
            {step === "code" && t("auth.phone.verify_title")}
            {step === "success" && t("auth.phone.success_title")}
          </h2>

          <button
            onClick={onClose}
            className="p-2 -me-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Phone Input Step */}
          {step === "phone" && (
            <form onSubmit={handleSendCode}>
              <p className="text-sm text-slate-600 mb-6 text-center">
                {t("auth.phone.subtitle")}
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
              <button
                type="submit"
                disabled={busy || phoneNumber.length < 12}
                className="w-full py-3.5 bg-primary text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                {busy ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Phone className="w-5 h-5" />
                    {t("auth.phone.send_code")}
                  </>
                )}
              </button>

              {/* Switch to email */}
              {onSwitchToEmail && (
                <button
                  type="button"
                  onClick={onSwitchToEmail}
                  className="w-full mt-4 py-3 text-sm text-slate-600 hover:text-slate-900 transition-colors"
                >
                  {t("auth.phone.use_email_instead")}
                </button>
              )}

              {/* reCAPTCHA container */}
              <div id="recaptcha-container-phone" ref={recaptchaRef} />
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
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {t("auth.phone.success_message")}
              </h3>
              <p className="text-sm text-slate-600">
                {t("auth.phone.redirecting")}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default PhoneAuthModal;
