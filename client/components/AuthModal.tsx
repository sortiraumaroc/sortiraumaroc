import { useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, EyeOff, X, Phone, RefreshCw, Loader2, ShieldCheck, Gift, CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PhoneAuthModal } from "@/components/PhoneAuthModal";
import { markAuthed } from "@/lib/auth";
import { markEmailAsVerified } from "@/lib/userData";
import { getDemoConsumerCredentials, isDemoModeEnabled } from "@/lib/demoMode";
import { useI18n } from "@/lib/i18n";
import { consumerSupabase } from "@/lib/supabase";
import { isFirebaseConfigured } from "@/lib/firebase";
import { useIsMobile } from "@/hooks/use-mobile";
import { validateReferralCode } from "@/lib/referral/api";

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

const DEMO_CONSUMER_CREDENTIALS = getDemoConsumerCredentials();
const DEMO_ENABLED = isDemoModeEnabled() && !!DEMO_CONSUMER_CREDENTIALS;

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthed?: () => void;
  contextTitle?: string;
  contextSubtitle?: string;
}

type AuthStep = "login" | "forgot" | "signup" | "signup_captcha" | "signup_verify" | "signup_success";

function Separator({ label }: { label: string }) {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <div className="w-full border-t border-slate-200" />
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="px-3 bg-white text-slate-500" style={{ fontFamily: "Circular Std, sans-serif" }}>
          {label}
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-foreground" style={{ fontFamily: "Circular Std, sans-serif" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.27 1.53 7.7 2.8l5.25-5.25C33.73 4.3 29.2 2.5 24 2.5 14.63 2.5 6.68 7.88 3.02 15.72l6.1 4.73C11.04 14.3 17.04 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46 24.5c0-1.57-.16-2.7-.51-3.88H24v7.26h12.76c-.26 2.04-1.68 5.1-4.82 7.16l-.04.25 6.38 4.95.44.04C43.25 36.38 46 31.06 46 24.5z"
      />
      <path
        fill="#FBBC05"
        d="M9.12 28.55c-.48-1.43-.76-2.96-.76-4.55s.28-3.12.75-4.55l-.01-.3-6.12-4.8-.2.1C1.28 17.36.5 20.6.5 24s.78 6.64 2.2 9.55l6.42-5z"
      />
      <path
        fill="#34A853"
        d="M24 45.5c5.2 0 9.57-1.7 12.76-4.62l-6.08-4.72c-1.63 1.13-3.82 1.92-6.68 1.92-6.95 0-12.95-4.8-14.86-11.4l-.23.02-6.33 4.9-.08.22C6.13 39.62 14.33 45.5 24 45.5z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="w-5 h-5 scale-110" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#111827"
        d="M16.365 1.43c0 1.14-.416 2.23-1.215 3.115-.86.95-2.276 1.68-3.49 1.58-.14-1.09.31-2.24 1.12-3.12.82-.9 2.26-1.56 3.585-1.575z"
      />
      <path
        fill="#111827"
        d="M20.45 17.51c-.53 1.22-.78 1.76-1.47 2.84-.96 1.51-2.32 3.4-4.01 3.42-1.5.02-1.89-.98-3.93-.97-2.04.01-2.47.99-3.97.96-1.69-.03-2.99-1.74-3.95-3.24-2.76-4.29-3.05-9.33-1.35-11.96 1.21-1.86 3.12-2.95 4.91-2.95 1.82 0 2.97.99 4.48.99 1.47 0 2.37-1 4.47-1 1.6 0 3.3.87 4.5 2.37-3.97 2.17-3.33 7.83.32 9.54z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg className="w-5 h-5 scale-110" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#1877F2"
        d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.88v-6.99H7.898V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.99C18.343 21.128 22 16.99 22 12c0-5.523-4.477-10-10-10z"
      />
    </svg>
  );
}

function SocialButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full h-12 px-5 rounded-full border border-slate-200 bg-white shadow-sm hover:shadow-md hover:bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60 disabled:hover:shadow-sm disabled:cursor-not-allowed"
      style={{ fontFamily: "Circular Std, sans-serif" }}
    >
      <span className="grid w-full grid-cols-[24px_1fr_24px] items-center">
        <span className="flex items-center justify-center">{icon}</span>
        <span className="text-[15px] font-semibold text-slate-900 text-center">{label}</span>
        <span aria-hidden />
      </span>
    </button>
  );
}

export function AuthModal({ isOpen, onClose, onAuthed, contextTitle, contextSubtitle }: AuthModalProps) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<AuthStep>("login");
  const [showPhoneAuth, setShowPhoneAuth] = useState(false);

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [forgotValue, setForgotValue] = useState("");

  // Referral code states
  const [referralCode, setReferralCode] = useState(() => searchParams.get("ref") || "");
  const [referralCodeValid, setReferralCodeValid] = useState<boolean | null>(null);
  const [referralCodeChecking, setReferralCodeChecking] = useState(false);
  const [referralPartnerName, setReferralPartnerName] = useState<string | null>(null);

  // Lightweight anti-spam: honeypot field + basic throttling (client-side).
  // Note: for strong protection, combine with a server-verified CAPTCHA.
  // We only "arm" the honeypot if it receives focus, to avoid false positives from autofill/password managers.
  const [signupTrap, setSignupTrap] = useState("");
  const signupTrapArmedRef = useRef(false);

  // Email verification states
  const [captcha, setCaptcha] = useState(generateCaptcha());
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [expectedCode, setExpectedCode] = useState("");
  const [codeCountdown, setCodeCountdown] = useState(0);
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Validate referral code when it changes
  useEffect(() => {
    const code = referralCode.trim();
    if (!code || code.length < 3) {
      setReferralCodeValid(null);
      setReferralPartnerName(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setReferralCodeChecking(true);
      try {
        const result = await validateReferralCode(code);
        setReferralCodeValid(result.valid);
        setReferralPartnerName(result.partner_name || null);
      } catch {
        setReferralCodeValid(false);
        setReferralPartnerName(null);
      } finally {
        setReferralCodeChecking(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [referralCode]);

  // Countdown timer for code expiration
  useEffect(() => {
    if (codeCountdown > 0) {
      const timer = setTimeout(() => setCodeCountdown(codeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [codeCountdown]);

  // Focus first code input when switching to verify step
  useEffect(() => {
    if (step === "signup_verify" && codeInputRefs.current[0]) {
      codeInputRefs.current[0].focus();
    }
  }, [step]);

  const baseTitle = useMemo(() => {
    if (step === "forgot") return t("auth.title.forgot");
    if (step === "signup" || step === "signup_captcha") return t("auth.title.signup");
    if (step === "signup_verify") return t("profile.email_verification.enter_code");
    if (step === "signup_success") return t("profile.email_verification.success");
    return t("auth.title.login");
  }, [step, t]);

  const baseSubtitle = useMemo(() => {
    if (step === "login") return t("auth.subtitle.login");
    if (step === "forgot") return t("auth.subtitle.forgot");
    if (step === "signup_captcha") return t("profile.email_verification.subtitle");
    if (step === "signup_verify") return `${t("profile.email_verification.code_sent_to")} ${emailOrPhone}`;
    return t("auth.subtitle.signup");
  }, [step, t, emailOrPhone]);

  const title = step === "login" && contextTitle ? contextTitle : baseTitle;
  const subtitle = step === "login" && contextSubtitle ? contextSubtitle : baseSubtitle;

  const inputBaseClassName =
    "w-full h-11 px-4 bg-slate-100 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm italic text-gray-700 placeholder:text-gray-700 placeholder:italic placeholder:font-normal";

  const handleClose = () => {
    setStep("login");
    setShowPassword(false);
    setBusy(false);
    setError(null);
    setNotice(null);
    setCaptcha(generateCaptcha());
    setCaptchaAnswer("");
    setVerificationCode("");
    setExpectedCode("");
    setCodeCountdown(0);
    onClose();
  };

  const refreshCaptcha = () => {
    setCaptcha(generateCaptcha());
    setCaptchaAnswer("");
    setError(null);
  };

  const finishAuth = () => {
    markAuthed();
    onAuthed?.();
    handleClose();
  };

  const isEmail = (value: string) => /.+@.+\..+/.test(value.trim());

  const getOAuthRedirectTo = () => {
    // Avoid hash fragments. Keep path + query (useful when login is triggered from a specific page).
    return `${window.location.origin}${window.location.pathname}${window.location.search}`;
  };

  const doOAuthSignIn = async (provider: "google" | "apple" | "facebook") => {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const { data, error } = await consumerSupabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getOAuthRedirectTo(),
          // We handle redirect ourselves so UX is consistent.
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      const url = data?.url;
      if (!url) {
        setError(t("auth.error.social_unconfigured", { provider }));
        return;
      }

      handleClose();
      window.location.assign(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      // Supabase error messages vary depending on whether the provider is enabled.
      if (msg.toLowerCase().includes("provider") && msg.toLowerCase().includes("not enabled")) {
        setError(t("auth.error.social_unconfigured", { provider }));
        return;
      }

      setError(t("auth.error.social_login_failed"));
    } finally {
      setBusy(false);
    }
  };

  const doDemoLogin = async () => {
    if (!DEMO_CONSUMER_CREDENTIALS) {
      setError(t("auth.error.demo_login_failed"));
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const demoEmail = DEMO_CONSUMER_CREDENTIALS.email;
    const demoPassword = DEMO_CONSUMER_CREDENTIALS.password;

    setEmailOrPhone(demoEmail);
    setPassword(demoPassword);

    try {
      // Best-effort: create/ensure the demo account exists.
      // Only available when demo mode is enabled server-side.
      try {
        const res = await fetch("/api/consumer/demo/ensure", { method: "POST" });
        await res.json().catch(() => null);
      } catch {
        // ignore
      }

      const { error } = await consumerSupabase.auth.signInWithPassword({
        email: demoEmail,
        password: demoPassword,
      });
      if (error) throw error;

      finishAuth();
    } catch {
      setError(t("auth.error.demo_login_failed"));
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const identifier = emailOrPhone.trim();
    if (!identifier || !password.trim()) return;

    if (!isEmail(identifier)) {
      setError(t("auth.error.phone_login_unavailable"));
      return;
    }

    setBusy(true);
    const { error } = await consumerSupabase.auth.signInWithPassword({
      email: identifier,
      password,
    });
    setBusy(false);

    if (error) {
      setError(t("auth.error.invalid_credentials"));
      return;
    }

    finishAuth();
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const identifier = forgotValue.trim();
    if (!identifier) return;

    if (!isEmail(identifier)) {
      setError(t("auth.error.reset_by_phone_unavailable"));
      return;
    }

    setBusy(true);
    const { error } = await consumerSupabase.auth.resetPasswordForEmail(identifier, {
      redirectTo: window.location.origin,
    });
    setBusy(false);

    if (error) {
      setError(t("auth.error.reset_send_failed"));
      return;
    }

    setNotice(t("auth.notice.reset_link_sent"));
    setStep("login");
  };

  // Step 1: Initial signup form - validate email/password and move to captcha
  const handleSignupInitial = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    // Honeypot: bots tend to fill all fields (including hidden ones).
    if (signupTrap.trim()) {
      setError(t("auth.error.signup_spam_detected"));
      return;
    }

    const identifier = emailOrPhone.trim();
    if (!identifier || !password.trim()) return;

    if (!isEmail(identifier)) {
      setError(t("auth.error.signup_requires_email"));
      return;
    }

    // Move to captcha step
    setCaptcha(generateCaptcha());
    setCaptchaAnswer("");
    setStep("signup_captcha");
  };

  // Step 2: Validate captcha and send verification code
  const handleCaptchaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate captcha
    const userAnswer = parseInt(captchaAnswer, 10);
    if (isNaN(userAnswer) || userAnswer !== captcha.answer) {
      setError(t("profile.email_verification.error.captcha_required"));
      refreshCaptcha();
      return;
    }

    // Throttle: reduce brute-force / accidental rapid retries.
    try {
      const key = "sam_signup_last_attempt_v1";
      const now = Date.now();
      const last = Number(window.sessionStorage.getItem(key) ?? "0");
      if (Number.isFinite(last) && now - last < 10_000) {
        setError(t("auth.error.too_many_attempts"));
        return;
      }
      window.sessionStorage.setItem(key, String(now));
    } catch {
      // ignore (storage disabled)
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
          email: emailOrPhone.trim().toLowerCase(),
          code,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send verification email");
      }

      setStep("signup_verify");
      setCodeCountdown(120); // 2 minutes
    } catch (err) {
      console.error("[Signup] Error sending code:", err);
      setError(t("profile.email_verification.error.send_failed"));
    } finally {
      setBusy(false);
    }
  };

  // Step 3: Verify code and create account
  const handleVerifyCode = async (code: string) => {
    if (code.length !== 8) return;

    setError(null);
    setBusy(true);

    try {
      // Verify the code matches
      if (code !== expectedCode) {
        setError(t("profile.email_verification.error.invalid_code"));
        setVerificationCode("");
        setBusy(false);
        return;
      }

      // Check if code has expired (2 minutes)
      if (codeCountdown <= 0) {
        setError(t("profile.email_verification.error.code_expired"));
        setVerificationCode("");
        setBusy(false);
        return;
      }

      // Create the account with Supabase
      const { data, error: signupError } = await consumerSupabase.auth.signUp({
        email: emailOrPhone.trim().toLowerCase(),
        password,
      });

      if (signupError) {
        setError(t("auth.error.signup_failed"));
        setBusy(false);
        return;
      }

      // Mark email as verified in local profile
      markEmailAsVerified(emailOrPhone.trim().toLowerCase());

      // If there's a valid referral code, create the referral link
      if (referralCodeValid && referralCode.trim() && data.user) {
        try {
          await fetch("/api/public/referral/link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              referral_code: referralCode.trim(),
              referree_user_id: data.user.id,
              source: "registration",
            }),
          });
        } catch (refErr) {
          // Log but don't block signup if referral link creation fails
          console.error("[Signup] Error creating referral link:", refErr);
        }
      }

      // Show success step
      setStep("signup_success");

      // After 1.5s, finish auth
      setTimeout(() => {
        if (data.session) {
          finishAuth();
        } else {
          setNotice(t("auth.notice.account_created"));
          setStep("login");
        }
      }, 1500);
    } catch (err) {
      console.error("[Signup] Error creating account:", err);
      setError(t("auth.error.signup_failed"));
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
    if (codeCountdown > 0) return;
    setVerificationCode("");
    setError(null);
    setStep("signup_captcha");
    refreshCaptcha();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? handleClose() : undefined)}>
      <DialogContent
        hideCloseButton
        className="w-[min(520px,calc(100vw-32px))] p-0 overflow-hidden"
        style={{ fontFamily: "Circular Std, sans-serif" }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 text-left">
          {/* Logo et tagline */}
          <div className="flex flex-col items-center mb-4">
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fc4b847e82d5c43669264291d1a767312?format=webp&width=800"
              alt="Sortir Au Maroc"
              className="h-14 w-auto"
              loading="lazy"
            />
            <p className="mt-1.5 text-sm text-black font-bold" style={{ fontFamily: "Poppins, sans-serif" }}>
              La plateforme de réservation en ligne
            </p>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-xl sm:text-2xl font-semibold leading-tight" style={{ fontFamily: "Circular Std, sans-serif" }}>
                {title}
              </DialogTitle>
              <div className="mt-2 text-sm text-slate-600" style={{ fontFamily: "Circular Std, sans-serif" }}>
                {subtitle}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label={t("common.close")}
              className="p-2 rounded-md hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6">
          {error ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {notice}
            </div>
          ) : null}

          {step === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <Field label={t("auth.field.email_or_phone.label")}>
                <input
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  placeholder={t("auth.field.email_or_phone.placeholder")}
                  className={inputBaseClassName}
                  style={{ fontFamily: "Circular Std, sans-serif" }}
                  autoComplete="username"
                  required
                />
              </Field>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground" style={{ fontFamily: "Circular Std, sans-serif" }}>
                    {t("auth.field.password.label")}
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep("forgot")}
                    className="text-sm text-primary hover:underline"
                    style={{ fontFamily: "Circular Std, sans-serif" }}
                  >
                    {t("auth.link.forgot_password")}
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputBaseClassName} pr-12`}
                    style={{ fontFamily: "Circular Std, sans-serif" }}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? t("auth.password.hide") : t("auth.password.show")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-slate-200/60 transition"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setShowPassword(true);
                    }}
                    onPointerUp={() => setShowPassword(false)}
                    onPointerCancel={() => setShowPassword(false)}
                    onPointerLeave={() => setShowPassword(false)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        setShowPassword(true);
                      }
                    }}
                    onKeyUp={() => setShowPassword(false)}
                    onBlur={() => setShowPassword(false)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4 text-slate-500" /> : <Eye className="w-4 h-4 text-slate-500" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="w-full h-11 bg-[#a3001d] hover:bg-[#a3001d]/90 text-white disabled:opacity-60"
                style={{ fontFamily: "Circular Std, sans-serif" }}
              >
                {busy ? t("auth.button.login_busy") : t("auth.button.login")}
              </Button>

              {DEMO_ENABLED ? (
                <Button
                  type="button"
                  disabled={busy}
                  variant="outline"
                  className="w-full h-11 border-slate-200"
                  style={{ fontFamily: "Circular Std, sans-serif" }}
                  onClick={doDemoLogin}
                >
                  {t("auth.button.demo_login")}
                </Button>
              ) : null}

              <Separator label={t("auth.or_continue_with")} />

              <div className="space-y-3">
                <SocialButton
                  label={t("auth.button.continue_with_google")}
                  onClick={() => void doOAuthSignIn("google")}
                  disabled={busy}
                  icon={<GoogleIcon />}
                />
                <SocialButton
                  label={t("auth.button.continue_with_apple")}
                  onClick={() => void doOAuthSignIn("apple")}
                  disabled={busy}
                  icon={<AppleIcon />}
                />
                <SocialButton
                  label={t("auth.button.continue_with_facebook")}
                  onClick={() => void doOAuthSignIn("facebook")}
                  disabled={busy}
                  icon={<FacebookIcon />}
                />

                {/* Phone Auth Button - Mobile only */}
                {isMobile && isFirebaseConfigured() && (
                  <SocialButton
                    label={t("auth.phone.use_phone_instead")}
                    onClick={() => setShowPhoneAuth(true)}
                    disabled={busy}
                    icon={<Phone className="w-5 h-5 text-primary" />}
                  />
                )}
              </div>

              <div className="mt-6 text-sm text-slate-600" style={{ fontFamily: "Circular Std, sans-serif" }}>
                {t("auth.note.no_account")} {" "}
                <button type="button" className="text-primary hover:underline font-medium" onClick={() => setStep("signup")}>
                  {t("auth.link.create_account")}
                </button>
              </div>
            </form>
          )}

          {step === "forgot" && (
            <form onSubmit={handleForgot} className="space-y-4">
              <Field label={t("auth.field.email_or_phone.label")}>
                <input
                  value={forgotValue}
                  onChange={(e) => setForgotValue(e.target.value)}
                  placeholder={t("auth.field.email_or_phone.placeholder")}
                  className={inputBaseClassName}
                  style={{ fontFamily: "Circular Std, sans-serif" }}
                  required
                />
              </Field>

              <Button
                type="submit"
                disabled={busy}
                className="w-full h-11 bg-[#a3001d] hover:bg-[#a3001d]/90 text-white disabled:opacity-60"
                style={{ fontFamily: "Circular Std, sans-serif" }}
              >
                {busy ? t("auth.button.send_reset_busy") : t("auth.button.send_reset")}
              </Button>

              <button type="button" className="text-sm text-slate-600 hover:underline" onClick={() => setStep("login")}>
                {t("common.back")}
              </button>
            </form>
          )}

          {/* Step 1: Initial signup form - email & password */}
          {step === "signup" && (
            <form onSubmit={handleSignupInitial} className="space-y-4">
              {/* Honeypot field: hidden from users, catches naive bots. */}
              <div className="absolute -left-[10000px] top-auto w-px h-px overflow-hidden" aria-hidden="true">
                <input
                  id="signup_website"
                  name="website"
                  value={signupTrap}
                  onFocus={() => {
                    signupTrapArmedRef.current = true;
                  }}
                  onChange={(e) => {
                    if (!signupTrapArmedRef.current) return;
                    setSignupTrap(e.target.value);
                  }}
                  tabIndex={-1}
                  autoComplete="new-password"
                  inputMode="none"
                />
              </div>

              <Field label={t("auth.field.email_or_phone.label")}>
                <input
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  placeholder={t("auth.field.email_or_phone.placeholder")}
                  className={inputBaseClassName}
                  style={{ fontFamily: "Circular Std, sans-serif" }}
                  autoComplete="username"
                  required
                />
              </Field>

              <Field label={t("auth.field.password.label")}>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputBaseClassName} pr-12`}
                    style={{ fontFamily: "Circular Std, sans-serif" }}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? t("auth.password.hide") : t("auth.password.show")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-slate-200/60 transition"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setShowPassword(true);
                    }}
                    onPointerUp={() => setShowPassword(false)}
                    onPointerCancel={() => setShowPassword(false)}
                    onPointerLeave={() => setShowPassword(false)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        setShowPassword(true);
                      }
                    }}
                    onKeyUp={() => setShowPassword(false)}
                    onBlur={() => setShowPassword(false)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4 text-slate-500" /> : <Eye className="w-4 h-4 text-slate-500" />}
                  </button>
                </div>
              </Field>

              {/* Referral Code Field (optional) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground" style={{ fontFamily: "Circular Std, sans-serif" }}>
                  <Gift className="w-4 h-4 text-primary" />
                  <span>Code de parrainage</span>
                  <span className="text-slate-400 font-normal">(optionnel)</span>
                </div>
                <div className="relative">
                  <input
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20))}
                    placeholder="Ex: SAMIRA123"
                    className={`${inputBaseClassName} pr-10`}
                    style={{ fontFamily: "Circular Std, sans-serif" }}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {referralCodeChecking ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    ) : referralCodeValid === true ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : referralCodeValid === false ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : null}
                  </div>
                </div>
                {referralCodeValid === true && referralPartnerName && (
                  <p className="text-xs text-green-600">
                    Parrainé par {referralPartnerName}
                  </p>
                )}
                {referralCodeValid === false && referralCode.length >= 3 && (
                  <p className="text-xs text-red-600">
                    Code de parrainage invalide
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="w-full h-11 bg-[#a3001d] hover:bg-[#a3001d]/90 text-white disabled:opacity-60"
                style={{ fontFamily: "Circular Std, sans-serif" }}
              >
                {t("common.continue")}
              </Button>

              <div className="mt-4 text-sm text-slate-600" style={{ fontFamily: "Circular Std, sans-serif" }}>
                {t("auth.note.have_account")} {" "}
                <button type="button" className="text-primary hover:underline font-medium" onClick={() => setStep("login")}>
                  {t("auth.link.login")}
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Captcha verification */}
          {step === "signup_captcha" && (
            <form onSubmit={handleCaptchaSubmit} className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-sm text-slate-600">{emailOrPhone}</p>
              </div>

              {/* CAPTCHA */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
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
                  <input
                    type="text"
                    inputMode="numeric"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    placeholder="?"
                    className="w-20 h-12 text-center font-mono text-lg bg-slate-100 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    maxLength={3}
                    autoFocus
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={busy || !captchaAnswer}
                className="w-full h-11 bg-[#a3001d] hover:bg-[#a3001d]/90 text-white disabled:opacity-60"
                style={{ fontFamily: "Circular Std, sans-serif" }}
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : t("profile.email_verification.send_code")}
              </Button>

              <button
                type="button"
                className="w-full text-sm text-slate-600 hover:underline"
                onClick={() => setStep("signup")}
              >
                {t("common.back")}
              </button>
            </form>
          )}

          {/* Step 3: Code verification */}
          {step === "signup_verify" && (
            <div className="space-y-4">
              {/* Code Input - 8 digits */}
              <div className="flex justify-center gap-1.5 mb-4">
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

              {/* Loading indicator */}
              {busy && (
                <div className="flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}

              {/* Countdown / Resend */}
              <div className="text-center">
                {codeCountdown > 0 ? (
                  <p className="text-sm text-slate-500">
                    Code valide pendant {Math.floor(codeCountdown / 60)}:{String(codeCountdown % 60).padStart(2, "0")}
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

              <button
                type="button"
                className="w-full text-sm text-slate-600 hover:underline"
                onClick={() => setStep("signup")}
              >
                {t("common.back")}
              </button>
            </div>
          )}

          {/* Step 4: Success */}
          {step === "signup_success" && (
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

      {/* Phone Auth Modal for Mobile */}
      <PhoneAuthModal
        isOpen={showPhoneAuth}
        onClose={() => setShowPhoneAuth(false)}
        onAuthed={() => {
          setShowPhoneAuth(false);
          finishAuth();
        }}
        onSwitchToEmail={() => setShowPhoneAuth(false)}
        referralCode={referralCodeValid ? referralCode : undefined}
      />
    </Dialog>
  );
}
