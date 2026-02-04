import * as React from "react";

import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Loader2 } from "lucide-react";

export default function ProResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Validate code on mount
  React.useEffect(() => {
    if (!code) {
      setError("Code de réinitialisation manquant. Vérifiez votre lien.");
    }
  }, [code]);

  const handleReset = React.useCallback(async () => {
    if (!code) {
      toast.error("Code de réinitialisation manquant");
      return;
    }

    const pass = password.trim();
    const conf = confirm.trim();

    if (!pass || !conf) {
      toast.error("Remplissez tous les champs");
      return;
    }

    if (pass.length < 10) {
      toast.error("Le mot de passe doit contenir au moins 10 caractères");
      return;
    }

    if (pass !== conf) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          newPassword: pass,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success("Mot de passe réinitialisé avec succès!");
        navigate("/pro/login", { replace: true });
      } else {
        setError(data.error || "Impossible de réinitialiser le mot de passe");
        toast.error(data.error || "Erreur");
      }
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la réinitialisation");
      toast.error("Erreur réseau");
    } finally {
      setIsSubmitting(false);
    }
  }, [code, password, confirm, navigate]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen w-full items-center justify-center px-4 sm:px-6 lg:px-8">
        {/* Frame rouge */}
        <div className="w-full max-w-md rounded-[22px] bg-[#A3001D] p-[2px] shadow-[0_18px_60px_-30px_rgba(0,0,0,0.35)]">
          {/* Card */}
          <div className="rounded-[20px] bg-white p-6 sm:p-7">
            {/* Header */}
            <div className="min-w-0">
              <div className="text-lg font-semibold tracking-tight">Nouveau mot de passe</div>
              <div className="mt-1 text-sm text-slate-500">Entrez votre nouveau mot de passe</div>
            </div>

            {/* Divider */}
            <div className="mt-5 h-px w-full bg-slate-200/70" />

            {/* Form */}
            <div className="mt-5 space-y-4">
              {error && (
                <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900">{error}</p>
                  </div>
                </div>
              )}

              {!error && (
                <>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Nouveau mot de passe</label>
                    <Input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type="password"
                      placeholder="Au moins 10 caractères"
                      autoComplete="new-password"
                      disabled={isSubmitting}
                      className="mt-1 h-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:ring-2 focus-visible:ring-[#A3001D]/25 focus-visible:border-[#A3001D]/40"
                    />
                    <div className="mt-1 text-xs text-slate-500">10 caractères minimum</div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600">Confirmer le mot de passe</label>
                    <Input
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      type="password"
                      placeholder="Confirmez votre mot de passe"
                      autoComplete="new-password"
                      disabled={isSubmitting}
                      className="mt-1 h-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:ring-2 focus-visible:ring-[#A3001D]/25 focus-visible:border-[#A3001D]/40"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleReset();
                      }}
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={() => void handleReset()}
                    disabled={isSubmitting || !password || !confirm}
                    className="h-11 w-full rounded-xl bg-[#A3001D] text-white hover:bg-[#8C0019] shadow-sm disabled:opacity-60 mt-6"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="ml-2">Réinitialisation...</span>
                      </>
                    ) : (
                      "Réinitialiser le mot de passe"
                    )}
                  </Button>
                </>
              )}

              {error && (
                <Button
                  type="button"
                  onClick={() => navigate("/pro/login")}
                  className="h-11 w-full rounded-xl bg-[#A3001D] text-white hover:bg-[#8C0019] shadow-sm"
                >
                  Retour à la connexion
                </Button>
              )}
            </div>

            {/* Mini note */}
            <div className="pt-4 text-center text-xs text-slate-400">
              © Sortir Au Maroc — Espace professionnel
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
