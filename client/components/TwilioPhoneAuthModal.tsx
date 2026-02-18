/**
 * TwilioPhoneAuthModal
 *
 * Mobile-optimized phone authentication using Twilio SMS.
 * Provides SMS-based login/signup for mobile users.
 *
 * Flow:
 * 1. User enters Moroccan phone number (+212)
 * 2. Server sends 6-digit OTP via Twilio SMS
 * 3. User enters code
 * 4. Server verifies code and creates/logs in user
 */

import React, { useState, useEffect, useRef } from "react";
import { Phone, ArrowLeft, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { markAuthed } from "@/lib/auth";
import { consumerSupabase } from "@/lib/supabase";
import {
  sendVerificationCode,
  verifyCode,
  formatPhoneNumber,
  formatPhoneForDisplay,
  isValidPhoneNumber,
  isTwilioAuthAvailable,
} from "@/lib/twilioAuth";

interface TwilioPhoneAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthed?: () => void;
  onSwitchToEmail?: () => void;
  referralCode?: string;
}

type AuthStep = "phone" | "code" | "success" | "error";

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

export function TwilioPhoneAuthModal({
  isOpen,
  onClose,
  onAuthed,
  onSwitchToEmail,
  referralCode,
}: TwilioPhoneAuthModalProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<AuthStep>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [retryAfter, setRetryAfter] = useState(0);
  const [twilioAvailable, setTwilioAvailable] = useState<boolean | null>(null);

  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Check Twilio availability on mount
  useEffect(() => {
    if (isOpen && twilioAvailable === null) {
      isTwilioAuthAvailable().then(setTwilioAvailable);
    }
  }, [isOpen, twilioAvailable]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep("phone");
      setPhoneNumber("");
      setVerificationCode("");
      setError(null);
      setCountdown(0);
      setRetryAfter(0);
    }
  }, [isOpen]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Retry after countdown (rate limiting)
  useEffect(() => {
    if (retryAfter > 0) {
      const timer = setTimeout(() => setRetryAfter(retryAfter - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [retryAfter]);

  // Focus first code input when switching to code step
  useEffect(() => {
    if (step === "code" && codeInputRefs.current[0]) {
      setTimeout(() => codeInputRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  const handleSendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!isValidPhoneNumber(phoneNumber)) {
      setError(t("auth.phone.error.invalid_number"));
      return;
    }

    if (retryAfter > 0) {
      setError(`Veuillez attendre ${retryAfter} secondes avant de réessayer`);
      return;
    }

    setBusy(true);

    try {
      const result = await sendVerificationCode(phoneNumber);

      if (!result.success) {
        setError(result.error || t("auth.phone.error.send_failed"));
        if (result.retryAfter) {
          setRetryAfter(result.retryAfter);
        }
        return;
      }

      setStep("code");
      setCountdown(60); // 60 seconds before allowing resend
    } catch (err) {
      console.error("[TwilioPhoneAuth] Error sending code:", err);
      setError(t("auth.phone.error.send_failed"));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async (code: string) => {
    if (code.length !== 6) return;

    setError(null);
    setBusy(true);

    try {
      const result = await verifyCode(phoneNumber, code, referralCode);

      if (!result.success) {
        setError(result.error || t("auth.phone.error.invalid_code"));
        setVerificationCode("");
        setBusy(false);
        return;
      }

      // If we got an actionLink (magic link), follow it
      if (result.actionLink) {
        try {
          // Parse the magic link URL
          const url = new URL(result.actionLink);
          const accessToken = url.hash?.match(/access_token=([^&]+)/)?.[1];
          const refreshToken = url.hash?.match(/refresh_token=([^&]+)/)?.[1];

          if (accessToken && refreshToken) {
            // Set the session directly
            const { error: sessionError } = await consumerSupabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) {
              console.error("[TwilioPhoneAuth] Session error:", sessionError);
            }
          } else {
            // Try to extract token from query params (older format)
            const token = url.searchParams.get("token");
            if (token) {
              await consumerSupabase.auth.verifyOtp({
                token_hash: token,
                type: "magiclink",
              });
            }
          }
        } catch (linkError) {
          console.warn("[TwilioPhoneAuth] Could not parse magic link, continuing anyway:", linkError);
        }
      }

      // Show success state
      setStep("success");

      // Complete auth after brief success animation
      setTimeout(() => {
        markAuthed();
        onAuthed?.();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("[TwilioPhoneAuth] Error verifying code:", err);
      setError(t("auth.phone.error.verify_failed"));
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

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pastedData.length > 0) {
      setVerificationCode(pastedData);
      if (pastedData.length === 6) {
        handleVerifyCode(pastedData);
      } else {
        codeInputRefs.current[pastedData.length]?.focus();
      }
    }
  };

  const handleResendCode = () => {
    if (countdown > 0 || retryAfter > 0) return;
    setVerificationCode("");
    setError(null);
    handleSendCode();
  };

  if (!isOpen) return null;

  // Check if Twilio is available
  if (twilioAvailable === false) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-amber-600" />
          </div>
          <p className="text-slate-600 mb-4">
            {t("auth.phone.error.not_configured")}
          </p>
          {onSwitchToEmail && (
            <button
              onClick={onSwitchToEmail}
              className="text-primary font-semibold hover:underline"
            >
              {t("auth.phone.use_email_instead")}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Loading state while checking availability
  if (twilioAvailable === null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
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
                <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent transition-all">
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
                      setError(null);
                    }}
                    className="flex-1 bg-transparent outline-none text-slate-900 placeholder:text-slate-400"
                    autoFocus
                    disabled={busy}
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

              {/* Rate limit warning */}
              {retryAfter > 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-sm text-amber-700">
                    Veuillez attendre {retryAfter}s avant de réessayer
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={busy || phoneNumber.length < 12 || retryAfter > 0}
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
            </form>
          )}

          {/* Code Verification Step */}
          {step === "code" && (
            <div>
              <p className="text-sm text-slate-600 mb-2 text-center">
                {t("auth.phone.code_sent_to")}
              </p>
              <p className="text-base font-semibold text-slate-900 mb-6 text-center">
                {formatPhoneForDisplay(phoneNumber)}
              </p>

              {/* Code Input */}
              <div className="flex justify-center gap-2 mb-6" onPaste={handleCodePaste}>
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
                    disabled={busy || retryAfter > 0}
                    className="text-sm text-primary font-semibold hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {retryAfter > 0
                      ? `Attendre ${retryAfter}s...`
                      : t("auth.phone.resend_code")}
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

export default TwilioPhoneAuthModal;
