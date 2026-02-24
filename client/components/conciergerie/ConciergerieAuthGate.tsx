import { useEffect, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { Eye, EyeOff, Loader2 } from "lucide-react";

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

import { conciergerieSupabase } from "@/lib/conciergerie/supabase";
import type { ConciergeProfile } from "@shared/conciergerieTypes";
import { getMyProfile } from "@/lib/conciergerie/api";

type Props = {
  children: (args: {
    user: User;
    concierge: ConciergeProfile;
    signOut: () => Promise<void>;
  }) => React.ReactNode;
};

// ============================================================================
// ConciergerieAuthGate
// Sign-in only (accounts are created by admin via SQL)
// ============================================================================

export function ConciergerieAuthGate({ children }: Props) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [concierge, setConcierge] = useState<ConciergeProfile | null>(null);

  const [mode, setMode] = useState<"signin" | "forgot-password">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [peekPassword, setPeekPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);

  // Load session on mount
  useEffect(() => {
    conciergerieSupabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);

      if (sessionUser) {
        try {
          const profile = await getMyProfile();
          setConcierge(profile);
        } catch (e) {
          console.error("[conciergerie] Failed to load profile:", e);
          // If profile fails, sign out (user may not be a concierge)
          await conciergerieSupabase.auth.signOut();
          setUser(null);
          setError("Votre compte n'est pas associé à une conciergerie.");
        }
      }

      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = conciergerieSupabase.auth.onAuthStateChange(
      async (_event, session) => {
        const newUser = session?.user ?? null;
        setUser(newUser);
        if (!newUser) {
          setConcierge(null);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleSignIn = useCallback(async () => {
    setError(null);
    setSubmitting(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedEmail) {
        setError("Veuillez saisir votre adresse email.");
        setSubmitting(false);
        return;
      }
      if (!password) {
        setError("Veuillez saisir votre mot de passe.");
        setSubmitting(false);
        return;
      }

      const { data, error: authError } = await conciergerieSupabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (authError) {
        setError(authError.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : authError.message);
        setSubmitting(false);
        return;
      }

      if (data.user) {
        setUser(data.user);
        try {
          const profile = await getMyProfile();
          setConcierge(profile);
        } catch {
          setError("Votre compte n'est pas associé à une conciergerie active.");
          await conciergerieSupabase.auth.signOut();
          setUser(null);
          setSubmitting(false);
          return;
        }
      }
    } catch (e: any) {
      setError(e.message ?? "Erreur de connexion");
    }
    setSubmitting(false);
  }, [email, password]);

  const handleForgotPassword = useCallback(async () => {
    setError(null);
    setSubmitting(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedEmail) {
        setError("Veuillez saisir votre adresse email.");
        setSubmitting(false);
        return;
      }

      const { error: resetError } = await conciergerieSupabase.auth.resetPasswordForEmail(
        trimmedEmail,
        { redirectTo: `${window.location.origin}/conciergerie?mode=reset-password` },
      );

      if (resetError) {
        setError(resetError.message);
        setSubmitting(false);
        return;
      }

      setForgotPasswordSuccess(true);
    } catch (e: any) {
      setError(e.message ?? "Erreur");
    }
    setSubmitting(false);
  }, [email]);

  const signOut = useCallback(async () => {
    await conciergerieSupabase.auth.signOut();
    setUser(null);
    setConcierge(null);
  }, []);

  // Reset state on mode change
  useEffect(() => {
    setError(null);
    setSubmitting(false);
    setForgotPasswordSuccess(false);
  }, [mode]);

  // ------ Loading ------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ------ Authenticated ------
  if (user && concierge) {
    return <>{children({ user, concierge, signOut })}</>;
  }

  // ------ Sign In / Forgot Password ------
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            🏨 Espace Conciergerie
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Sortir Au Maroc — Conciergerie
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {mode === "signin" ? "Connexion" : "Mot de passe oublié"}
            </CardTitle>
            <CardDescription>
              {mode === "signin"
                ? "Connectez-vous à votre espace conciergerie."
                : "Saisissez votre email pour réinitialiser votre mot de passe."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
                {error}
              </div>
            )}

            {mode === "signin" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSignIn();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="votre@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={peekPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      onClick={() => setPeekPassword((p) => !p)}
                      tabIndex={-1}
                    >
                      {peekPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Se connecter
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setMode("forgot-password")}
                    className="text-sm text-primary hover:underline"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
              </form>
            )}

            {mode === "forgot-password" && !forgotPasswordSuccess && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleForgotPassword();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="email-reset">Email</Label>
                  <Input
                    id="email-reset"
                    type="email"
                    placeholder="votre@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={submitting}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Envoyer le lien
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className="text-sm text-primary hover:underline"
                  >
                    Retour à la connexion
                  </button>
                </div>
              </form>
            )}

            {mode === "forgot-password" && forgotPasswordSuccess && (
              <div className="text-center space-y-4">
                <div className="text-green-600 text-sm">
                  Un email de réinitialisation a été envoyé à <strong>{email}</strong>.
                  Vérifiez votre boîte de réception (et vos spams).
                </div>
                <Button
                  variant="outline"
                  onClick={() => setMode("signin")}
                  className="w-full"
                >
                  Retour à la connexion
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
