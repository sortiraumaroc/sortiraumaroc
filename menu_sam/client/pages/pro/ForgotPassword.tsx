import * as React from "react";

import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function ProForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const handleSendReset = React.useCallback(async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.error("Entrez votre email");
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      if (res.ok) {
        setSent(true);
        toast.success("Email de réinitialisation envoyé!");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Impossible d'envoyer l'email");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors de l'envoi de l'email");
    } finally {
      setIsSending(false);
    }
  }, [email]);

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
                <div className="text-lg font-semibold tracking-tight">Réinitialiser le mot de passe</div>

                <div className="mt-1 text-sm text-slate-500">
                  {sent
                    ? "Vérifiez votre email pour le lien de réinitialisation"
                    : "Entrez votre email pour recevoir un lien de réinitialisation"}
                </div>

              </div>
            </div>



            {/* Divider */}
            <div className="mt-5 h-px w-full bg-slate-200/70" />

            {/* Form */}
            <div className="mt-5">
              {!sent ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Email</label>
                    <Input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ex: contact@restaurant.ma"
                      autoComplete="email"
                      inputMode="email"
                      disabled={isSending}
                      className="mt-1 h-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:ring-2 focus-visible:ring-[#A3001D]/25 focus-visible:border-[#A3001D]/40"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleSendReset();
                      }}
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={() => void handleSendReset()}
                    disabled={isSending || !email.trim()}
                    className="h-11 w-full rounded-xl bg-[#A3001D] text-white hover:bg-[#8C0019] shadow-sm disabled:opacity-60"
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="ml-2">Envoi en cours...</span>
                      </>
                    ) : (
                      "Envoyer le lien"
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-sm text-emerald-900 font-medium">✓ Email envoyé avec succès!</div>
                  <p className="text-sm text-emerald-800">
                    Vérifiez votre boîte mail (et le dossier spam) pour le lien de réinitialisation.
                  </p>
                </div>
              )}

              {/* Back to login */}
              <button
                type="button"
                onClick={() => navigate("/pro/login")}
                className="mt-6 w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-900 underline-offset-4 hover:underline"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour à la connexion
              </button>
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
