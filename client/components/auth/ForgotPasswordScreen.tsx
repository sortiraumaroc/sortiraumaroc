import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { useState } from "react";

interface ForgotPasswordScreenProps {
  onBack: () => void;
  onSubmit: (email: string) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export function ForgotPasswordScreen({
  onBack,
  onSubmit,
  loading = false,
  error = null,
}: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const displayError = error || localError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setLocalError("Veuillez entrer votre email");
      return;
    }

    if (!/.+@.+\..+/.test(trimmedEmail)) {
      setLocalError("Email invalide");
      return;
    }

    try {
      await onSubmit(trimmedEmail);
      setSent(true);
    } catch {
      // Error handled by parent
    }
  };

  // Success state
  if (sent) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 -ml-1.5 rounded-full hover:bg-slate-100 transition-colors"
            aria-label="Retour"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </button>
          <h2
            className="text-lg sm:text-xl font-bold text-slate-900"
            style={{ fontFamily: "Circular Std, sans-serif" }}
          >
            Mot de passe oublié
          </h2>
        </div>

        <div className="text-center py-6">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-7 h-7 text-green-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-2">
            Email envoyé !
          </h3>
          <p className="text-sm text-slate-600 mb-3">
            Si un compte existe avec cet email, vous recevrez un lien pour réinitialiser votre mot de passe.
          </p>
          <p className="text-xs text-slate-500">
            Email envoyé à <strong>{email}</strong>
          </p>
        </div>

        <Button
          type="button"
          onClick={onBack}
          variant="outline"
          className="w-full h-10 text-sm font-semibold rounded-lg"
        >
          Retour à la connexion
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 -ml-1.5 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Retour"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div>
          <h2
            className="text-lg sm:text-xl font-bold text-slate-900"
            style={{ fontFamily: "Circular Std, sans-serif" }}
          >
            Mot de passe oublié
          </h2>
          <p className="text-xs text-slate-600">
            Réinitialisez votre mot de passe
          </p>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-slate-50 rounded-lg p-3 flex items-start gap-3">
        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
          <Mail className="w-4 h-4 text-primary" />
        </div>
        <p className="text-xs text-slate-600">
          Entrez l'adresse email associée à votre compte. Nous vous enverrons un lien pour réinitialiser votre mot de passe.
        </p>
      </div>

      {/* Error message */}
      {displayError && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {displayError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="forgot-email" className="text-sm font-medium text-slate-900">
            Adresse email
          </Label>
          <Input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="votre@email.com"
            disabled={loading}
            autoComplete="email"
            className="h-10 rounded-lg text-sm"
          />
        </div>

        <Button
          type="submit"
          disabled={loading || !email}
          className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              Envoi...
            </span>
          ) : (
            "Envoyer le lien"
          )}
        </Button>
      </form>

      {/* Back to login link */}
      <p className="text-center text-xs text-slate-600">
        Vous vous souvenez de votre mot de passe ?{" "}
        <button
          type="button"
          onClick={onBack}
          className="text-primary hover:text-primary/80 font-semibold"
        >
          Se connecter
        </button>
      </p>
    </div>
  );
}
