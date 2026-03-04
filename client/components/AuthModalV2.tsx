import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { markAuthed } from "@/lib/auth";
import { markEmailAsVerified, markPhoneAsVerified } from "@/lib/userData";
import { consumerSupabase } from "@/lib/supabase";
import { isFirebaseConfigured } from "@/lib/firebase";
import { completeAuthentication } from "@/lib/twilioAuth";
import { validateReferralCode as apiValidateReferralCode } from "@/lib/referral/api";
import { getDemoConsumerCredentials, isDemoModeEnabled } from "@/lib/demoMode";
import { useSessionConflict } from "@/hooks/useSessionConflict";
import { SessionConflictDialog } from "@/components/SessionConflictDialog";
import { checkAlreadyLoggedIn, clearSession, type ActiveSession } from "@/lib/sessionConflict";
import { LogOut, UserCheck } from "lucide-react";

import {
  AuthChoiceScreen,
  LoginScreen,
  SignupChoiceScreen,
  SignupEmailScreen,
  SignupPhoneScreen,
  VerifyEmailScreen,
  ForgotPasswordScreen,
  SuccessScreen,
  OnboardingScreen,
} from "./auth";

// Demo mode config
const DEMO_CONSUMER_CREDENTIALS = getDemoConsumerCredentials();
const DEMO_ENABLED = isDemoModeEnabled() && !!DEMO_CONSUMER_CREDENTIALS;

// Auth flow steps
type AuthStep =
  | "choice" // Initial choice: login or signup
  | "login" // Login form
  | "forgot" // Forgot password
  | "signup_choice" // Choose signup method
  | "signup_email" // Email signup form
  | "signup_phone" // Phone signup form
  | "verify_email" // Email verification code
  | "onboarding" // Profile completion (new users only)
  | "success"; // Success screen

interface AuthModalV2Props {
  isOpen: boolean;
  onClose: () => void;
  onAuthed?: () => void;
  initialStep?: "login" | "signup" | "onboarding";
  contextTitle?: string;
  contextSubtitle?: string;
  /** Pre-fill data for OAuth onboarding (Google/Apple first sign-in) */
  oauthOnboardingPrefill?: { firstName?: string; lastName?: string; email?: string };
}

export function AuthModalV2({
  isOpen,
  onClose,
  onAuthed,
  initialStep,
  contextTitle,
  contextSubtitle,
  oauthOnboardingPrefill,
}: AuthModalV2Props) {

  // Session conflict check (cross-type: pro/admin already logged in)
  const { hasConflict, conflictingSession, clearConflict } = useSessionConflict("consumer");
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  // Already logged in check (same-type: consumer already logged in)
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState<ActiveSession | null>(null);
  const [switchingAccount, setSwitchingAccount] = useState(false);

  // Resolve initial step (supports "onboarding" for OAuth first sign-in)
  const resolveInitialStep = (s?: string): AuthStep => {
    if (s === "onboarding") return "onboarding";
    if (s === "signup") return "signup_choice";
    if (s === "login") return "login";
    return "choice";
  };

  // Current step in the auth flow
  const [step, setStep] = useState<AuthStep>(resolveInitialStep(initialStep));

  // Sync step when initialStep changes (e.g. Header opens modal in onboarding mode)
  useEffect(() => {
    if (isOpen && initialStep === "onboarding") {
      setStep("onboarding");
    }
  }, [isOpen, initialStep]);

  // Loading and error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthLoadingProvider, setOauthLoadingProvider] = useState<"google" | "apple" | null>(null);

  // Signup data (persisted across steps)
  const [signupData, setSignupData] = useState<{
    email: string;
    password: string;
    referralCode?: string;
  } | null>(null);

  // Track which auth method was used for signup (to show email/password steps in onboarding)
  const [signupAuthMethod, setSignupAuthMethod] = useState<"phone" | "email" | null>(null);

  // Check for already logged in (same type) when modal opens
  useEffect(() => {
    if (!isOpen) {
      setAlreadyLoggedIn(null);
      setSwitchingAccount(false);
      return;
    }
    void checkAlreadyLoggedIn("consumer").then((session) => {
      if (session) setAlreadyLoggedIn(session);
    });
  }, [isOpen]);

  // Check for session conflicts (cross-type) when modal opens
  useEffect(() => {
    if (isOpen && hasConflict && !alreadyLoggedIn) {
      setShowConflictDialog(true);
    }
  }, [isOpen, hasConflict, alreadyLoggedIn]);

  // Reset state and close modal
  const handleClose = useCallback(() => {
    setStep(initialStep === "signup" ? "signup_choice" : initialStep === "login" ? "login" : "choice");
    setLoading(false);
    setError(null);
    setOauthLoadingProvider(null);
    setSignupData(null);
    setSignupAuthMethod(null);
    onClose();
  }, [onClose, initialStep]);

  // Complete authentication
  const finishAuth = useCallback(() => {
    markAuthed();
    onAuthed?.();
    handleClose();
  }, [onAuthed, handleClose]);

  // Get OAuth redirect URL
  const getOAuthRedirectTo = () => {
    return `${window.location.origin}${window.location.pathname}${window.location.search}`;
  };

  // OAuth sign in — Supabase redirects the browser directly to Google/Apple
  // (no skipBrowserRedirect, no manual window.location.assign → faster)
  const handleOAuthSignIn = async (provider: "google" | "apple") => {
    setOauthLoadingProvider(provider);
    setError(null);

    try {
      const { error } = await consumerSupabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getOAuthRedirectTo(),
          // No skipBrowserRedirect — Supabase redirects the browser directly
          // to the OAuth provider, removing the extra client round-trip.
        },
      });

      if (error) throw error;
      // If no error, the browser is already navigating to Google/Apple.
      // Don't call handleClose() — it would trigger onClose() which in
      // Booking.tsx clears the booking session from sessionStorage.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (msg.toLowerCase().includes("provider") && msg.toLowerCase().includes("not enabled")) {
        setError("Ce fournisseur n'est pas configuré");
        return;
      }
      setError("Échec de la connexion");
      setOauthLoadingProvider(null);
    }
  };

  // Email/password login
  const handleLogin = async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    try {
      const { error } = await consumerSupabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError("Email ou mot de passe incorrect");
        return;
      }

      finishAuth();
    } catch {
      setError("Échec de la connexion");
    } finally {
      setLoading(false);
    }
  };

  // Forgot password — uses server API to send reset link via SMTP
  const handleForgotPassword = async (email: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/public/password/reset-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        throw new Error("Reset failed");
      }
      // Success - the ForgotPasswordScreen handles the success state
    } catch {
      setError("Échec de l'envoi du lien");
      throw new Error("Reset failed");
    } finally {
      setLoading(false);
    }
  };

  // Validate referral code
  const handleValidateReferralCode = async (code: string): Promise<{ valid: boolean; partnerName?: string }> => {
    try {
      const result = await apiValidateReferralCode(code);
      return {
        valid: result.valid,
        partnerName: result.partner_name,
      };
    } catch {
      return { valid: false };
    }
  };

  // Email signup - send verification code
  const handleSignupEmailSubmit = async (data: {
    email: string;
    password: string;
    referralCode?: string;
    recaptchaToken: string;
  }) => {
    setLoading(true);
    setError(null);

    try {
      // Send verification email via backend (code generated server-side)
      const res = await fetch("/api/consumer/verify-email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          recaptchaToken: data.recaptchaToken,
        }),
      });

      if (!res.ok) {
        const result = await res.json().catch(() => ({}));

        // If email already exists, redirect to login with a friendly message
        if (res.status === 409 || result.code === "EMAIL_ALREADY_EXISTS") {
          setError("Un compte existe déjà avec cet email.");
          setStep("login");
          return;
        }

        throw new Error(result.error || "Failed to send verification code");
      }

      // Store signup data for verification step
      setSignupData({
        email: data.email,
        password: data.password,
        referralCode: data.referralCode,
      });

      // Move to verification step
      setStep("verify_email");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Échec de l'envoi";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Verify email code and complete signup
  const handleVerifyEmailCode = async (code: string) => {
    if (!signupData) return;

    setLoading(true);
    setError(null);
    let hasSpecificError = false;

    try {
      // Step 1: Verify code on the server
      const verifyRes = await fetch("/api/consumer/verify-email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signupData.email, code }),
      });

      if (!verifyRes.ok) {
        const verifyData = await verifyRes.json().catch(() => ({}));
        setError(verifyData.error || "Code incorrect");
        hasSpecificError = true;
        return;
      }

      // Step 2: Create account via server endpoint (bypasses Supabase confirmation email)
      const signupRes = await fetch("/api/consumer/auth/email/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Allow trust cookie to be set
        body: JSON.stringify({
          email: signupData.email,
          password: signupData.password,
          referralCode: signupData.referralCode || undefined,
        }),
      });

      const signupResult = await signupRes.json().catch(() => ({}));

      if (!signupRes.ok) {
        if (signupResult.error?.includes("existe déjà")) {
          setError("Un compte existe déjà avec cet email");
        } else {
          setError(signupResult.error || "Échec de l'inscription");
        }
        hasSpecificError = true;
        return;
      }

      // Mark email as verified
      markEmailAsVerified(signupData.email);

      // Step 3: Sign in with the newly created credentials
      const { error: signInError } = await consumerSupabase.auth.signInWithPassword({
        email: signupData.email,
        password: signupData.password,
      });

      if (signInError) {
        // Auto sign-in failed, falling back to actionLink
        // Fallback: use actionLink
        if (signupResult.actionLink) {
          window.location.assign(signupResult.actionLink);
          return;
        }
      }

      // Send welcome email (non-blocking)
      if (signupResult.userId) {
        fetch("/api/public/welcome-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: signupResult.userId,
            email: signupData.email,
            name: signupData.email.split("@")[0],
          }),
        }).catch(() => {
          // Failed to send welcome email (non-blocking)
        });
      }

      // Show onboarding for new users
      setSignupAuthMethod("email");
      setStep("onboarding");
    } catch (err) {
      // Only set generic error if no specific error was already set
      if (!hasSpecificError) {
        setError("Échec de la vérification");
      }
      console.error("[AuthModalV2] Verification error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Resend verification code
  const handleResendVerificationCode = async () => {
    if (!signupData) return;

    setError(null);

    try {
      const res = await fetch("/api/consumer/verify-email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: signupData.email,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to resend code");
      }
    } catch {
      setError("Échec du renvoi");
      throw new Error("Resend failed");
    }
  };

  // Phone signup success (Twilio verification completed, server returned result)
  const handlePhoneSignupSuccess = async (
    result: { actionLink?: string; isNewUser?: boolean; userId?: string; phoneE164?: string },
    _referralCode?: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      // The server already verified the code and created the account via Twilio.
      // The result contains the actionLink to set the Supabase session.
      if (result.actionLink) {
        // For NEW users: establish session client-side so we can show onboarding in-modal
        if (result.isNewUser) {
          const sessionOk = await completeAuthentication(result.actionLink);

          if (sessionOk) {
            markAuthed();
            // Store verified phone number in local profile so Profile page shows it
            if (result.phoneE164) {
              markPhoneAsVerified(result.phoneE164);
            }
            setSignupAuthMethod("phone");
            setStep("onboarding");
            return;
          }

          // Fallback: if client-side session setup fails, redirect as before
          // completeAuthentication failed, falling back to redirect
        }

        // Existing users (or fallback): redirect via magic link
        window.location.assign(result.actionLink);
        return;
      }

      // No actionLink — show onboarding for new users, success for existing
      if (result.isNewUser) {
        setSignupAuthMethod("phone");
        setStep("onboarding");
      } else {
        setStep("success");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Échec de l'authentification";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Phone login success (existing user verified via OTP)
  const handlePhoneLoginSuccess = (
    result: { actionLink?: string; isNewUser?: boolean; userId?: string }
  ) => {
    if (result.actionLink) {
      window.location.assign(result.actionLink);
      return;
    }
    finishAuth();
  };

  // Render current step
  const renderStep = () => {
    switch (step) {
      case "choice":
        return (
          <AuthChoiceScreen
            onLoginClick={() => {
              setError(null);
              setStep("login");
            }}
            onSignupClick={() => {
              setError(null);
              setStep("signup_choice");
            }}
            onOAuthClick={handleOAuthSignIn}
            oauthLoading={!!oauthLoadingProvider}
            oauthLoadingProvider={oauthLoadingProvider}
          />
        );

      case "login":
        return (
          <LoginScreen
            onBack={() => setStep("choice")}
            onLogin={handleLogin}
            onPhoneLoginSuccess={handlePhoneLoginSuccess}
            onForgotPassword={() => {
              setError(null);
              setStep("forgot");
            }}
            onSignupClick={() => {
              setError(null);
              setStep("signup_choice");
            }}
            onOAuthClick={handleOAuthSignIn}
            loading={loading}
            oauthLoading={!!oauthLoadingProvider}
            oauthLoadingProvider={oauthLoadingProvider}
            error={error}
          />
        );

      case "forgot":
        return (
          <ForgotPasswordScreen
            onBack={() => {
              setError(null);
              setStep("login");
            }}
            onSubmit={handleForgotPassword}
            loading={loading}
            error={error}
          />
        );

      case "signup_choice":
        return (
          <SignupChoiceScreen
            onBack={() => setStep("choice")}
            onEmailClick={() => {
              setError(null);
              setStep("signup_email");
            }}
            onPhoneClick={() => {
              setError(null);
              setStep("signup_phone");
            }}
            onLoginClick={() => {
              setError(null);
              setStep("login");
            }}
            onOAuthClick={handleOAuthSignIn}
            oauthLoading={!!oauthLoadingProvider}
            oauthLoadingProvider={oauthLoadingProvider}
            phoneAuthAvailable={isFirebaseConfigured()}
          />
        );

      case "signup_email":
        return (
          <SignupEmailScreen
            onBack={() => {
              setError(null);
              setStep("signup_choice");
            }}
            onSubmit={handleSignupEmailSubmit}
            loading={loading}
            error={error}
            validateReferralCode={handleValidateReferralCode}
          />
        );

      case "signup_phone":
        return (
          <SignupPhoneScreen
            onBack={() => {
              setError(null);
              setStep("signup_choice");
            }}
            onSuccess={handlePhoneSignupSuccess}
            onLoginClick={() => {
              setError(null);
              setStep("login");
            }}
            loading={loading}
            error={error}
            validateReferralCode={handleValidateReferralCode}
          />
        );

      case "verify_email":
        return signupData ? (
          <VerifyEmailScreen
            email={signupData.email}
            onBack={() => {
              setError(null);
              setStep("signup_email");
            }}
            onVerify={handleVerifyEmailCode}
            onResend={handleResendVerificationCode}
            onLoginClick={() => {
              setError(null);
              setStep("login");
            }}
            loading={loading}
            error={error}
          />
        ) : null;

      case "onboarding":
        return (
          <OnboardingScreen
            onComplete={() => setStep("success")}
            authMethod={signupAuthMethod}
            prefillFirstName={oauthOnboardingPrefill?.firstName}
            prefillLastName={oauthOnboardingPrefill?.lastName}
          />
        );

      case "success":
        return (
          <SuccessScreen
            onComplete={finishAuth}
            title="Bienvenue !"
            subtitle="Votre compte a été créé avec succès"
          />
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Session conflict dialog */}
      {conflictingSession && (
        <SessionConflictDialog
          open={showConflictDialog}
          onOpenChange={(open) => {
            setShowConflictDialog(open);
            if (!open) {
              clearConflict();
              handleClose();
            }
          }}
          currentSession={conflictingSession}
          targetType="consumer"
          onProceed={() => {
            clearConflict();
            setShowConflictDialog(false);
          }}
        />
      )}

      <Dialog open={isOpen && !showConflictDialog} onOpenChange={(open) => {
        if (!open && step === "onboarding") return; // Block closing during onboarding
        if (!open) handleClose();
      }}>
        <DialogContent
          className={`sm:max-w-sm max-h-[90vh] !overflow-visible p-5 ${step === "onboarding" ? "[&>button]:hidden" : ""}`}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => { if (step === "onboarding") e.preventDefault(); }}
        >
          <DialogTitle className="sr-only">
            {alreadyLoggedIn && !switchingAccount ? "Déjà connecté" :
             step === "login" ? "Connexion" :
             step === "signup_choice" || step === "signup_email" || step === "signup_phone" ? "Inscription" :
             step === "verify_email" ? "Vérification email" :
             step === "forgot" ? "Mot de passe oublié" :
             step === "onboarding" ? "Profil" :
             "Authentification"}
          </DialogTitle>

          {/* Already logged in screen */}
          {alreadyLoggedIn && !switchingAccount ? (
            <div className="flex flex-col items-center text-center py-4 space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <UserCheck className="w-7 h-7 text-green-600" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-gray-900">Vous êtes déjà connecté(e)</h2>
                {alreadyLoggedIn.email && (
                  <p className="text-sm text-gray-500">{alreadyLoggedIn.email}</p>
                )}
              </div>
              <p className="text-sm text-gray-600 px-2">
                Souhaitez-vous rester sur ce compte ou vous déconnecter pour utiliser un autre compte ?
              </p>
              <div className="flex flex-col w-full gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors"
                >
                  <UserCheck className="w-4 h-4" />
                  Rester connecté
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setSwitchingAccount(true);
                    await clearSession("consumer");
                    setAlreadyLoggedIn(null);
                    setStep("choice");
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Changer de compte
                </button>
              </div>
            </div>
          ) : renderStep()}

        {/* Demo mode button (only on choice/login screens) */}
        {DEMO_ENABLED && (step === "choice" || step === "login") && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={async () => {
                if (!DEMO_CONSUMER_CREDENTIALS) return;
                setLoading(true);
                try {
                  await fetch("/api/consumer/demo/ensure", { method: "POST" }).catch(() => null);
                  await handleLogin(DEMO_CONSUMER_CREDENTIALS.email, DEMO_CONSUMER_CREDENTIALS.password);
                } finally {
                  setLoading(false);
                }
              }}
              className="w-full text-sm text-slate-500 hover:text-slate-700 py-2"
            >
              🎭 Mode démo
            </button>
          </div>
        )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AuthModalV2;
