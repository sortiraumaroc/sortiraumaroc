import * as React from "react";

import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

export default function ProLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth("client");

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const isLoading = auth.state.status === "loading";

  const handleLogin = React.useCallback(async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) return;

    setIsSubmitting(true);
    try {
      const success = await auth.signIn(trimmedEmail, password);

      if (success) {
        const from = (location.state as any)?.from as string | undefined;
        navigate(from && typeof from === "string" ? from : "/pro/dashboard", {
          replace: true,
        });
      } else {
        toast.error("Email ou mot de passe incorrect.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Impossible de se connecter pour le moment.");
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, auth, navigate, location]);

  const handleForgotPassword = React.useCallback(() => {
    navigate("/pro/forgot-password");
  }, [navigate]);

  const disabled = isSubmitting || isLoading;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen w-full items-center justify-center px-4 sm:px-6 lg:px-8">
        {/* Frame rouge */}
        <div className="w-full max-w-md rounded-[22px] bg-[#A3001D] p-[2px] shadow-[0_18px_60px_-30px_rgba(0,0,0,0.35)]">
          {/* Card */}
          <div className="rounded-[20px] bg-white p-6 sm:p-7">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                <img
                  src="/logo_white.webp"
                  alt="Sortir Au Maroc Logo"
                  className="h-9 w-9"
                />
              </div>

              <div className="min-w-0">
                <div className="text-lg font-semibold tracking-tight">Espace PRO</div>

              </div>
            </div>

            {/* Divider */}
            <div className="mt-5 h-px w-full bg-slate-200/70" />

            {/* Form */}
            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600">Email</label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ex: contact@restaurant.ma"
                  autoComplete="email"
                  inputMode="email"
                  className="mt-1 h-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:ring-2 focus-visible:ring-[#A3001D]/25 focus-visible:border-[#A3001D]/40"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Mot de passe</label>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mot de passe"
                  type="password"
                  autoComplete="current-password"
                  className="mt-1 h-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:ring-2 focus-visible:ring-[#A3001D]/25 focus-visible:border-[#A3001D]/40"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleLogin();
                  }}
                />
              </div>

              <Button
                type="button"
                onClick={handleLogin}
                disabled={disabled || !email.trim() || !password}
                className="h-11 w-full rounded-xl bg-[#A3001D] text-white hover:bg-[#8C0019] shadow-sm disabled:opacity-60"
              >
                {isSubmitting ? "Connexion..." : "Se connecter"}
              </Button>

              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                disabled={disabled}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-900 underline-offset-4 hover:underline disabled:opacity-60"
              >
                Mot de passe oublié ?
              </button>

              {/* Mini note (optionnel, style only) */}
              <div className="pt-2 text-center text-xs text-slate-400">
                © Sortir Au Maroc — Espace professionnel
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
