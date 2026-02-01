import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { Eye, Loader2, ShieldCheck } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { getDemoProCredentials, isDemoModeEnabled } from "@/lib/demoMode";
import {
  getProSession,
  proSignInWithPassword,
  proSignOut,
  proSignUpWithPassword,
  submitProOnboardingRequest,
} from "@/lib/pro/api";
import { proSupabase } from "@/lib/pro/supabase";

import {
  ProPublicLanding,
  type ProPublicSection,
} from "@/components/pro/ProPublicLanding";

type AuthVariant = "pro" | "partner";

type Props = {
  children: (args: {
    user: User;
    signOut: () => Promise<void>;
  }) => React.ReactNode;
  variant?: AuthVariant;
};

// Generate a simple text captcha (letters and numbers, mixed case)
function generateCaptcha(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const VARIANT_CONFIG: Record<
  AuthVariant,
  { title: string; descriptionSignIn: string; descriptionSignUp: string }
> = {
  pro: {
    title: "Espace Pro",
    descriptionSignIn: "Connectez-vous à votre/vos établissement(s).",
    descriptionSignUp: "Créez votre compte professionnel.",
  },
  partner: {
    title: "Espace Prestataires",
    descriptionSignIn: "Connectez-vous pour accéder à vos missions média.",
    descriptionSignUp: "Créez votre compte prestataire média.",
  },
};

type SignupStep = 1 | 2 | 3;

type SignupForm = {
  contactName: string;
  phone: string;
  establishmentName: string;
  city: string;
  universe: "restaurant" | "loisir" | "sport" | "culture" | "hebergement" | "";
};

const DEMO_CREDENTIALS = getDemoProCredentials();
const DEMO_ENABLED = isDemoModeEnabled() && !!DEMO_CREDENTIALS;

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

export function ProAuthGate({ children, variant = "pro" }: Props) {
  const variantConfig = VARIANT_CONFIG[variant];
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const [mode, setMode] = useState<"signin" | "signup" | "forgot-password">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [peekPassword, setPeekPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Forgot password state
  const [captchaCode, setCaptchaCode] = useState(() => generateCaptcha());
  const [captchaInput, setCaptchaInput] = useState("");
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);

  const [signupStep, setSignupStep] = useState<SignupStep>(1);
  const [signup, setSignup] = useState<SignupForm>({
    contactName: "",
    phone: "",
    establishmentName: "",
    city: "",
    universe: "",
  });

  const sectionParam = (searchParams.get("section") ?? "").trim();
  const publicSection = ((): ProPublicSection | null => {
    if (
      sectionParam === "pricing" ||
      sectionParam === "features" ||
      sectionParam === "demo"
    )
      return sectionParam;
    return null;
  })();

  useEffect(() => {
    const paramMode = searchParams.get("mode");
    if (paramMode === "signup") setMode("signup");
    if (paramMode === "signin") setMode("signin");
  }, [searchParams]);

  useEffect(() => {
    setError(null);
    setSubmitting(false);
    setSignupStep(1);
    setCaptchaInput("");
    setForgotPasswordSuccess(false);
    if (mode === "forgot-password") {
      setCaptchaCode(generateCaptcha());
    }
  }, [mode]);

  useEffect(() => {
    let mounted = true;

    getProSession()
      .then(({ data }) => {
        if (!mounted) return;
        setUser(data.session?.user ?? null);
      })
      .catch(() => {
        if (!mounted) return;
        setUser(null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    const { data: sub } = proSupabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      },
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const canSubmitSignIn = useMemo(() => {
    return normalizeEmail(email).length > 3 && password.length >= 6;
  }, [email, password]);

  const canContinueSignupStep1 = useMemo(() => {
    return normalizeEmail(email).length > 3 && password.length >= 6;
  }, [email, password]);

  const canContinueSignupStep2 = useMemo(() => {
    // Only contact name is required; establishment details are optional
    return signup.contactName.trim().length >= 2;
  }, [signup]);

  const hasEstablishmentDetails = useMemo(() => {
    return (
      signup.establishmentName.trim().length >= 2 &&
      signup.city.trim().length >= 2 &&
      !!signup.universe
    );
  }, [signup]);

  const doSignIn = async () => {
    if (!canSubmitSignIn) return;
    setSubmitting(true);
    setError(null);

    try {
      const { error } = await proSignInWithPassword({
        email: normalizeEmail(email),
        password,
      });
      if (error) throw error;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Une erreur est survenue";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const doForgotPassword = async () => {
    const emailValue = normalizeEmail(email);
    if (!emailValue || !emailValue.includes("@")) {
      setError("Veuillez saisir une adresse email valide.");
      return;
    }

    // Verify captcha
    if (captchaInput !== captchaCode) {
      setError("Le code de sécurité est incorrect.");
      setCaptchaCode(generateCaptcha());
      setCaptchaInput("");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { error } = await proSupabase.auth.resetPasswordForEmail(emailValue, {
        redirectTo: `${window.location.origin}/pro?mode=reset-password`,
      });
      if (error) throw error;
      setForgotPasswordSuccess(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Une erreur est survenue";
      setError(msg);
      setCaptchaCode(generateCaptcha());
      setCaptchaInput("");
    } finally {
      setSubmitting(false);
    }
  };

  const doDemoLogin = async () => {
    if (!DEMO_CREDENTIALS) {
      setError("Mode démo indisponible.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const demoEmail = DEMO_CREDENTIALS.email;
    const demoPassword = DEMO_CREDENTIALS.password;

    setEmail(demoEmail);
    setPassword(demoPassword);

    try {
      const res = await fetch("/api/pro/demo/ensure", { method: "POST" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          payload && typeof payload.error === "string"
            ? payload.error
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const { error } = await proSignInWithPassword({
        email: demoEmail,
        password: demoPassword,
      });
      if (error) throw error;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Une erreur est survenue";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const doSignUp = async () => {
    if (!canContinueSignupStep1 || !canContinueSignupStep2) return;

    setSubmitting(true);
    setError(null);

    try {
      const { data, error } = await proSignUpWithPassword({
        email: normalizeEmail(email),
        password,
      });
      if (error) throw error;

      const createdUserId = data.user?.id;
      if (!createdUserId) throw new Error("Impossible de créer le compte");

      const { error: signInErr } = await proSignInWithPassword({
        email: normalizeEmail(email),
        password,
      });
      if (signInErr) {
        throw new Error(
          "Compte créé. Veuillez confirmer votre email puis reconnectez-vous.",
        );
      }

      const anyEstablishmentField =
        signup.establishmentName.trim() ||
        signup.city.trim() ||
        !!signup.universe;
      if (anyEstablishmentField && !hasEstablishmentDetails) {
        throw new Error(
          "Si vous renseignez un établissement, merci de compléter nom, ville et type. Sinon, cliquez sur ‘Ignorer pour l’instant’.",
        );
      }

      await submitProOnboardingRequest({
        establishmentName: hasEstablishmentDetails
          ? signup.establishmentName.trim()
          : null,
        city: hasEstablishmentDetails ? signup.city.trim() : null,
        universe: hasEstablishmentDetails ? signup.universe : null,
        contactName: signup.contactName.trim() || undefined,
        phone: signup.phone.trim() || undefined,
      });

      setSignupStep(1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Une erreur est survenue";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-10 md:py-14">
        <div className="max-w-md mx-auto flex items-center justify-center text-slate-600 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement…
        </div>
      </div>
    );
  }

  if (!user) {
    if (publicSection && !searchParams.get("mode")) {
      return <ProPublicLanding section={publicSection} />;
    }

    return (
      <div className="relative container mx-auto px-4 pb-10 md:pb-14">
        <div className="absolute right-4 top-4">
          <Link
            to="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-primary px-4 text-sm font-bold text-primary hover:bg-primary hover:text-white active:bg-primary active:text-white"
          >
            Revenir à l’accueil
          </Link>
        </div>

        <div className="max-w-md mx-auto pt-16">
          <div className="flex flex-col items-center mb-5">
            <Link to="/" aria-label="Retour à l'accueil Sortir Au Maroc">
              <img
                src="https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fc4b847e82d5c43669264291d1a767312?format=webp&width=800"
                alt="Sortir Au Maroc"
                className="h-20 w-auto"
                loading="lazy"
              />
            </Link>
            <p className="mt-2 text-sm text-black font-bold" style={{ fontFamily: "Poppins, sans-serif" }}>La plateforme de réservation en ligne</p>
          </div>

          <Card className="border-slate-200">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">
                    {variantConfig.title}
                  </CardTitle>
                  <CardDescription>
                    {mode === "signin"
                      ? variantConfig.descriptionSignIn
                      : mode === "forgot-password"
                        ? "Réinitialisez votre mot de passe."
                        : variantConfig.descriptionSignUp}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {mode === "signup" ? (
                <div className="text-xs text-slate-600">
                  Étape {signupStep}/3
                </div>
              ) : null}

              {mode === "signup" && signupStep === 2 ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nom / responsable</Label>
                    <Input
                      value={signup.contactName}
                      onChange={(e) =>
                        setSignup((p) => ({
                          ...p,
                          contactName: e.target.value,
                        }))
                      }
                      autoComplete="name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Téléphone (optionnel)</Label>
                    <Input
                      value={signup.phone}
                      onChange={(e) =>
                        setSignup((p) => ({ ...p, phone: e.target.value }))
                      }
                      autoComplete="tel"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Nom de l’établissement (optionnel)</Label>
                    <Input
                      value={signup.establishmentName}
                      onChange={(e) =>
                        setSignup((p) => ({
                          ...p,
                          establishmentName: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Ville (optionnel)</Label>
                    <Input
                      value={signup.city}
                      onChange={(e) =>
                        setSignup((p) => ({ ...p, city: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Type (optionnel)</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={signup.universe}
                      onChange={(e) =>
                        setSignup((p) => ({
                          ...p,
                          universe: e.target.value as SignupForm["universe"],
                        }))
                      }
                    >
                      <option value="">Choisir…</option>
                      <option value="restaurant">Restaurant</option>
                      <option value="loisir">Loisir</option>
                      <option value="sport">Sport / Wellness</option>
                      <option value="culture">Culture</option>
                      <option value="hebergement">Hébergement</option>
                    </select>
                  </div>

                  {error ? (
                    <div className="text-sm text-red-600">{error}</div>
                  ) : null}

                  <div className="text-xs text-slate-600">
                    Vous pourrez ajouter votre établissement plus tard depuis
                    l’espace Pro.
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="font-bold"
                      onClick={() => {
                        setSignupStep(1);
                        setError(null);
                      }}
                      disabled={submitting}
                    >
                      Retour
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      className="font-bold"
                      onClick={() => {
                        setSignup((p) => ({
                          ...p,
                          establishmentName: "",
                          city: "",
                          universe: "",
                        }));
                        setSignupStep(3);
                        setError(null);
                      }}
                      disabled={submitting}
                    >
                      Ignorer pour l’instant
                    </Button>

                    <Button
                      type="button"
                      className="flex-1 bg-primary text-white hover:bg-primary/90 font-bold"
                      onClick={() => {
                        if (!canContinueSignupStep2) {
                          setError("Veuillez compléter les champs requis.");
                          return;
                        }

                        const anyEstablishmentField =
                          signup.establishmentName.trim() ||
                          signup.city.trim() ||
                          !!signup.universe;
                        if (anyEstablishmentField && !hasEstablishmentDetails) {
                          setError(
                            "Si vous renseignez un établissement, merci de compléter nom, ville et type. Sinon, cliquez sur ‘Ignorer pour l’instant’.",
                          );
                          return;
                        }

                        setSignupStep(3);
                        setError(null);
                      }}
                      disabled={submitting || !canContinueSignupStep2}
                    >
                      Continuer
                    </Button>
                  </div>
                </div>
              ) : null}

              {mode === "signup" && signupStep === 3 ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-bold text-slate-900">
                      Résumé
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-slate-700">
                      <div>
                        <span className="text-slate-500">Email:</span>{" "}
                        {normalizeEmail(email)}
                      </div>
                      <div>
                        <span className="text-slate-500">Responsable:</span>{" "}
                        {signup.contactName.trim()}
                      </div>
                      <div>
                        <span className="text-slate-500">Établissement:</span>{" "}
                        {signup.establishmentName.trim()
                          ? signup.establishmentName.trim()
                          : "(à compléter plus tard)"}
                      </div>
                      <div>
                        <span className="text-slate-500">Ville:</span>{" "}
                        {signup.city.trim() ? signup.city.trim() : "—"}
                      </div>
                    </div>
                  </div>

                  {error ? (
                    <div className="text-sm text-red-600">{error}</div>
                  ) : null}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      className="font-bold"
                      onClick={() => {
                        setSignupStep(2);
                        setError(null);
                      }}
                      disabled={submitting}
                    >
                      Modifier
                    </Button>
                    <Button
                      className="flex-1 bg-primary text-white hover:bg-primary/90 font-bold"
                      disabled={submitting}
                      onClick={doSignUp}
                    >
                      {submitting ? "Création…" : "Créer mon compte"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {mode === "signin" || (mode === "signup" && signupStep === 1) ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="pro-email">Email</Label>
                    <Input
                      id="pro-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pro-password">Mot de passe</Label>
                    <div className="relative">
                      <Input
                        id="pro-password"
                        type={peekPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={
                          mode === "signin"
                            ? "current-password"
                            : "new-password"
                        }
                        className="pr-11"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-slate-600 hover:text-slate-900"
                        aria-label={
                          peekPassword
                            ? "Masquer le mot de passe"
                            : "Afficher le mot de passe"
                        }
                        title={peekPassword ? "Masquer" : "Afficher"}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          setPeekPassword(true);
                        }}
                        onPointerUp={() => setPeekPassword(false)}
                        onPointerCancel={() => setPeekPassword(false)}
                        onPointerLeave={() => setPeekPassword(false)}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") {
                            e.preventDefault();
                            setPeekPassword(true);
                          }
                        }}
                        onKeyUp={() => setPeekPassword(false)}
                        onBlur={() => setPeekPassword(false)}
                      >
                        <Eye
                          className={
                            peekPassword ? "opacity-100" : "opacity-70"
                          }
                        />
                      </Button>
                    </div>
                    {mode === "signin" && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="text-xs text-primary hover:text-primary/80 hover:underline"
                          onClick={() => {
                            setMode("forgot-password");
                            setError(null);
                          }}
                        >
                          Mot de passe oublié ?
                        </button>
                      </div>
                    )}
                  </div>

                  {error ? (
                    <div className="text-sm text-red-600">{error}</div>
                  ) : null}

                  {mode === "signin" ? (
                    <Button
                      className="w-full bg-primary text-white hover:bg-primary/90 font-bold"
                      disabled={!canSubmitSignIn || submitting}
                      onClick={doSignIn}
                    >
                      {submitting ? "Veuillez patienter…" : "Se connecter"}
                    </Button>
                  ) : (
                    <Button
                      className="w-full bg-primary text-white hover:bg-primary/90 font-bold"
                      disabled={!canContinueSignupStep1 || submitting}
                      onClick={() => {
                        if (!canContinueSignupStep1) {
                          setError(
                            "Email et mot de passe (6+ caractères) requis.",
                          );
                          return;
                        }
                        setSignupStep(2);
                        setError(null);
                      }}
                    >
                      Continuer
                    </Button>
                  )}

                  {mode === "signin" ? (
                    <div className="space-y-3">
                      {DEMO_ENABLED ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="text-sm font-bold text-slate-900">
                            Mode démo
                          </div>
                          <div className="mt-1 text-xs text-slate-600">
                            Accès réservé aux tests (les identifiants ne sont
                            pas affichés dans l’application).
                          </div>
                          <Button
                            variant="outline"
                            className="mt-3 w-full font-bold"
                            disabled={submitting}
                            onClick={() => void doDemoLogin()}
                          >
                            Connexion démo
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-600">
                      <button
                        type="button"
                        className="underline hover:text-slate-900"
                        onClick={() => {
                          setMode("signin");
                          setError(null);
                        }}
                      >
                        J’ai déjà un compte
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Forgot Password Mode */}
              {mode === "forgot-password" ? (
                <div className="space-y-4">
                  {forgotPasswordSuccess ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                        <div className="text-sm font-bold text-green-800">
                          Email envoyé !
                        </div>
                        <div className="mt-1 text-sm text-green-700">
                          Si un compte existe avec l'adresse <span className="font-semibold">{normalizeEmail(email)}</span>, vous recevrez un email avec les instructions pour réinitialiser votre mot de passe.
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full font-bold"
                        onClick={() => {
                          setMode("signin");
                          setForgotPasswordSuccess(false);
                        }}
                      >
                        Retour à la connexion
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="forgot-email">Email</Label>
                        <Input
                          id="forgot-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="votre@email.com"
                          autoComplete="email"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="captcha-input">Code de sécurité</Label>
                        <div className="flex items-center gap-3">
                          <div
                            className="flex-shrink-0 px-4 py-2 bg-slate-100 border border-slate-300 rounded-md font-mono text-lg tracking-widest select-none"
                            style={{
                              fontFamily: "monospace",
                              letterSpacing: "0.25em",
                              background: "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
                              textDecoration: "line-through",
                              textDecorationColor: "rgba(0,0,0,0.1)",
                            }}
                          >
                            {captchaCode}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setCaptchaCode(generateCaptcha());
                              setCaptchaInput("");
                            }}
                            className="text-xs bg-primary hover:bg-primary/90 text-white"
                          >
                            Nouveau code
                          </Button>
                        </div>
                        <Input
                          id="captcha-input"
                          type="text"
                          value={captchaInput}
                          onChange={(e) => setCaptchaInput(e.target.value)}
                          placeholder="Recopiez le code ci-dessus"
                          autoComplete="off"
                          className="font-mono tracking-wide"
                        />
                        <p className="text-xs text-slate-500">
                          Attention aux majuscules et minuscules
                        </p>
                      </div>

                      {error ? (
                        <div className="text-sm text-red-600">{error}</div>
                      ) : null}

                      <Button
                        className="w-full bg-primary text-white hover:bg-primary/90 font-bold"
                        disabled={submitting || !email.includes("@") || captchaInput.length < 6}
                        onClick={doForgotPassword}
                      >
                        {submitting ? "Envoi en cours…" : "Réinitialiser mon mot de passe"}
                      </Button>

                      <div className="text-sm text-slate-600">
                        <button
                          type="button"
                          className="underline hover:text-slate-900"
                          onClick={() => {
                            setMode("signin");
                            setError(null);
                          }}
                        >
                          Retour à la connexion
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <>
      {children({
        user,
        signOut: async () => {
          await proSignOut();
        },
      })}
    </>
  );
}
