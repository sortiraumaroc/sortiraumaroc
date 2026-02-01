/**
 * EmailVerificationModal
 *
 * Modal pour vérifier l'adresse email avec CAPTCHA et code à 8 chiffres.
 * Utilisé lors de la création de compte pour confirmer l'adresse email.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mail, ArrowLeft, X, Loader2, ShieldCheck, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { markEmailAsVerified } from "@/lib/userData";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EmailVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified?: (email: string) => void;
  initialEmail?: string;
}

type VerificationStep = "captcha" | "code" | "success";

// Simple CAPTCHA generation (addition de deux nombres)
function generateCaptcha(): { question: string; answer: number } {
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  return {
    question: `${a} + ${b} = ?`,
    answer: a + b,
  };
}

// Generate 8-digit verification code
function generateVerificationCode(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

export function EmailVerificationModal({
  isOpen,
  onClose,
  onVerified,
  initialEmail = "",
}: EmailVerificationModalProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<VerificationStep>("captcha");
  const [email, setEmail] = useState(initialEmail);
  const [captcha, setCaptcha] = useState(generateCaptcha());
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [expectedCode, setExpectedCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep("captcha");
      setEmail(initialEmail);
      setCaptcha(generateCaptcha());
      setCaptchaAnswer("");
      setVerificationCode("");
      setExpectedCode("");
      setError(null);
      setCountdown(0);
    }
  }, [isOpen, initialEmail]);

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

  const isValidEmail = (email: string) => /.+@.+\..+/.test(email.trim());

  const refreshCaptcha = () => {
    setCaptcha(generateCaptcha());
    setCaptchaAnswer("");
    setError(null);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate email
    if (!isValidEmail(email)) {
      setError(t("profile.email_verification.error.invalid_email"));
      return;
    }

    // Validate captcha
    const userAnswer = parseInt(captchaAnswer, 10);
    if (isNaN(userAnswer) || userAnswer !== captcha.answer) {
      setError(t("profile.email_verification.error.captcha_required"));
      refreshCaptcha();
      return;
    }

    setBusy(true);

    try {
      // Generate a verification code
      const code = generateVerificationCode();
      setExpectedCode(code);

      // Send verification email via API
      const response = await fetch("/api/consumer/verify-email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send verification email");
      }

      setStep("code");
      setCountdown(120); // 2 minutes before resend
    } catch (err) {
      console.error("[EmailVerification] Error sending code:", err);
      setError(t("profile.email_verification.error.send_failed"));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async (code: string) => {
    if (code.length !== 8) return;

    setError(null);
    setBusy(true);

    try {
      // Verify the code matches
      if (code !== expectedCode) {
        setError(t("profile.email_verification.error.invalid_code"));
        setVerificationCode("");
        return;
      }

      // Check if code has expired (2 minutes)
      if (countdown <= 0) {
        setError(t("profile.email_verification.error.code_expired"));
        setVerificationCode("");
        return;
      }

      // Mark email as verified in local profile
      const result = markEmailAsVerified(email.trim().toLowerCase());

      if (result.ok === false) {
        setError(result.message);
        return;
      }

      setStep("success");
      setTimeout(() => {
        onVerified?.(email.trim().toLowerCase());
        onClose();
      }, 1500);
    } catch (err) {
      console.error("[EmailVerification] Error verifying code:", err);
      setError(t("profile.email_verification.error.invalid_code"));
      setVerificationCode("");
    } finally {
      setBusy(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = verificationCode.split("");
    newCode[index] = value;
    const updatedCode = newCode.join("").slice(0, 8);
    setVerificationCode(updatedCode);

    // Auto-focus next input
    if (value && index < 7) {
      codeInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (updatedCode.length === 8) {
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
    setStep("captcha");
    refreshCaptcha();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            {step === "code" ? (
              <button
                onClick={() => {
                  setStep("captcha");
                  setVerificationCode("");
                  setError(null);
                  refreshCaptcha();
                }}
                className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
            ) : (
              <div className="w-9" />
            )}

            <DialogTitle className="text-lg font-semibold text-slate-900">
              {step === "captcha" && t("profile.email_verification.title")}
              {step === "code" && t("profile.email_verification.enter_code")}
              {step === "success" && t("profile.email_verification.success")}
            </DialogTitle>

            <button
              onClick={onClose}
              className="p-2 -mr-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </DialogHeader>

        <div className="p-6">
          {/* Captcha + Email Step */}
          {step === "captcha" && (
            <form onSubmit={handleSendCode}>
              <p className="text-sm text-slate-600 mb-6 text-center">
                {t("profile.email_verification.subtitle")}
              </p>

              {/* Email Input */}
              <div className="mb-4">
                <Label htmlFor="verification-email" className="text-sm font-medium text-slate-700">
                  Email
                </Label>
                <div className="mt-1.5 relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="verification-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    className="pl-10"
                    autoFocus
                  />
                </div>
              </div>

              {/* CAPTCHA */}
              <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-700">CAPTCHA</span>
                  <button
                    type="button"
                    onClick={refreshCaptcha}
                    className="p-1.5 hover:bg-slate-200 rounded-md transition-colors"
                    title="Nouveau captcha"
                  >
                    <RefreshCw className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-center py-3 bg-white rounded-lg border border-slate-200 font-mono text-lg font-semibold text-slate-800">
                    {captcha.question}
                  </div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    placeholder="?"
                    className="w-20 text-center font-mono text-lg"
                    maxLength={3}
                  />
                </div>
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
                disabled={busy || !email.trim() || !captchaAnswer}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-white"
              >
                {busy ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Mail className="w-5 h-5 mr-2" />
                    {t("profile.email_verification.send_code")}
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Code Verification Step */}
          {step === "code" && (
            <div>
              <p className="text-sm text-slate-600 mb-2 text-center">
                {t("profile.email_verification.code_sent_to")}
              </p>
              <p className="text-base font-semibold text-slate-900 mb-6 text-center">
                {email}
              </p>

              {/* Code Input - 8 digits */}
              <div className="flex justify-center gap-1.5 mb-6">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
                  <input
                    key={index}
                    ref={(el) => (codeInputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={verificationCode[index] || ""}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(index, e)}
                    className="w-10 h-12 text-center text-lg font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
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

              {/* Countdown / Resend */}
              <div className="text-center">
                {countdown > 0 ? (
                  <p className="text-sm text-slate-500">
                    Code valide pendant {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={busy}
                    className="text-sm text-primary font-semibold hover:underline disabled:opacity-50"
                  >
                    Renvoyer le code
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
                {t("profile.email_verification.success")}
              </h3>
              <p className="text-sm text-slate-600">
                {t("profile.email_verification.success_description")}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default EmailVerificationModal;
