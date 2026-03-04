import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";
import { VerifyCodeInput, CountdownTimer } from "./VerifyCodeInput";

interface VerifyEmailScreenProps {
  email: string;
  onBack: () => void;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onLoginClick?: () => void;
  loading?: boolean;
  error?: string | null;
}

export function VerifyEmailScreen({
  email,
  onBack,
  onVerify,
  onResend,
  onLoginClick,
  loading = false,
  error = null,
}: VerifyEmailScreenProps) {
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const displayError = error || localError;

  const handleVerify = async (verificationCode: string) => {
    setLocalError(null);

    if (verificationCode.length !== 6) {
      setLocalError("Veuillez entrer le code complet");
      return;
    }

    try {
      await onVerify(verificationCode);
    } catch {
      setCode("");
    }
  };

  const handleResend = async () => {
    setLocalError(null);
    setResending(true);
    try {
      await onResend();
    } catch {
      setLocalError("Échec du renvoi. Réessayez.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 -ms-1.5 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Retour"
          disabled={loading}
        >
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div>
          <h2
            className="text-lg sm:text-xl font-bold text-slate-900"
            style={{ fontFamily: "Circular Std, sans-serif" }}
          >
            Vérifiez votre email
          </h2>
          <p className="text-xs text-slate-600">
            Entrez le code de vérification
          </p>
        </div>
      </div>

      {/* Email display */}
      <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
          <Mail className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-xs text-slate-600">
            Code envoyé à
          </p>
          <p className="text-sm font-medium text-slate-900">{email}</p>
        </div>
      </div>

      {/* Error message */}
      {displayError && !displayError.includes("existe déjà") && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {displayError}
        </div>
      )}

      {/* Email already exists — redirect to login */}
      {displayError && displayError.includes("existe déjà") && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 text-center">
          <p className="font-medium">Cet email est déjà associé à un compte.</p>
          <p className="mt-1 text-xs">
            Connectez-vous avec votre compte existant.
          </p>
          {onLoginClick && (
            <button
              type="button"
              onClick={onLoginClick}
              className="mt-2 w-full text-center text-sm font-semibold text-primary hover:underline"
            >
              J'ai déjà un compte →
            </button>
          )}
        </div>
      )}

      {/* Code input */}
      <div className="pt-1">
        <VerifyCodeInput
          length={6}
          value={code}
          onChange={setCode}
          onComplete={handleVerify}
          disabled={loading}
        />
      </div>

      {/* Resend timer */}
      <div className="text-center">
        {resending ? (
          <span className="text-slate-500 text-xs flex items-center justify-center gap-2">
            <span className="animate-spin">⏳</span>
            Renvoi en cours...
          </span>
        ) : (
          <CountdownTimer
            seconds={120}
            onComplete={() => {}}
            onResend={handleResend}
            resendLabel="Renvoyer le code"
            waitingLabel="Renvoyer dans"
          />
        )}
      </div>

      {/* Verify button */}
      <Button
        type="button"
        onClick={() => handleVerify(code)}
        disabled={loading || code.length !== 6}
        className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin">⏳</span>
            Vérification...
          </span>
        ) : (
          "Vérifier"
        )}
      </Button>

      {/* Help text */}
      <p className="text-xs text-center text-slate-500">
        Vous n'avez pas reçu l'email ? Vérifiez vos spams ou demandez un nouveau code.
      </p>
    </div>
  );
}
