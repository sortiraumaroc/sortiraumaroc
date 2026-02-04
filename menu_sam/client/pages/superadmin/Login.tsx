import * as React from "react";

import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

export default function SuperadminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth("admin");

  const [email, setEmail] = React.useState("admin@example.com");
  const [password, setPassword] = React.useState("admin123");
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
        navigate(from && typeof from === "string" ? from : "/superadmin/dashboard", {
          replace: true,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, auth, navigate, location]);

  const disabled = isSubmitting || isLoading;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-xl font-semibold">SUPERADMIN</div>
          <div className="mt-1 text-sm text-white/60">Accès réservé</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-white/70">Email</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                className="mt-1 h-11 rounded-xl border-white/10 bg-black/30 text-white placeholder:text-white/40"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-white/70">Mot de passe</label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                type="password"
                autoComplete="current-password"
                className="mt-1 h-11 rounded-xl border-white/10 bg-black/30 text-white placeholder:text-white/40"
              />
            </div>

            <Button
              type="button"
              onClick={handleLogin}
              disabled={disabled || !email.trim() || !password}
              className="h-11 w-full rounded-xl bg-sam-red text-white hover:bg-sam-red/90"
            >
              {isSubmitting ? "Connexion..." : "Se connecter"}
            </Button>

            <div className="text-xs text-white/50">Accès réservé aux administrateurs système.</div>
          </div>
        </div>
      </div>
    </main>
  );
}
