import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, Smartphone } from "lucide-react";
import { OAuthDivider } from "./OAuthButtons";

interface SignupChoiceScreenProps {
  onBack: () => void;
  onEmailClick: () => void;
  onPhoneClick: () => void;
  onLoginClick: () => void;
  onOAuthClick: (provider: "google" | "apple") => void;
  oauthLoading?: boolean;
  oauthLoadingProvider?: "google" | "apple" | null;
  phoneAuthAvailable?: boolean;
}

export function SignupChoiceScreen({
  onBack,
  onEmailClick,
  onPhoneClick,
  onLoginClick,
  onOAuthClick,
  oauthLoading = false,
  oauthLoadingProvider = null,
  phoneAuthAvailable = true,
}: SignupChoiceScreenProps) {

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
        <h2
          className="text-lg sm:text-xl font-bold text-slate-900"
          style={{ fontFamily: "Circular Std, sans-serif" }}
        >
          Créer un compte
        </h2>
      </div>

      {/* Signup methods */}
      <div className="space-y-2">
        {/* Email signup */}
        <Button
          type="button"
          className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
          onClick={onEmailClick}
        >
          <span className="w-5 shrink-0 flex items-center justify-center"><Mail className="!w-4 !h-4" /></span>
          <span className="ml-2">S'inscrire avec email</span>
        </Button>

        {/* Phone signup */}
        {phoneAuthAvailable && (
          <Button
            type="button"
            variant="outline"
            className="w-full h-10 text-sm font-semibold rounded-lg border"
            onClick={onPhoneClick}
          >
            <span className="w-5 shrink-0 flex items-center justify-center"><Smartphone className="!w-4 !h-4" /></span>
            <span className="ml-2">S'inscrire avec téléphone</span>
          </Button>
        )}
      </div>

      {/* OAuth divider */}
      <OAuthDivider />

      {/* OAuth icon buttons — side by side */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => onOAuthClick("google")}
          disabled={oauthLoading}
          className="w-12 h-12 flex items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
          aria-label="Google"
        >
          {oauthLoadingProvider === "google" ? (
            <span className="animate-spin text-sm">⏳</span>
          ) : (
            <img src="/google.png" alt="Google" className="w-5 h-5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onOAuthClick("apple")}
          disabled={oauthLoading}
          className="w-12 h-12 flex items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
          aria-label="Apple"
        >
          {oauthLoadingProvider === "apple" ? (
            <span className="animate-spin text-sm">⏳</span>
          ) : (
            <img src="/logo-apple.png" alt="Apple" className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Login link */}
      <p className="text-center text-xs text-slate-600">
        Déjà un compte ?{" "}
        <button
          type="button"
          onClick={onLoginClick}
          className="text-primary hover:text-primary/80 font-semibold"
        >
          Se connecter
        </button>
      </p>
    </div>
  );
}
