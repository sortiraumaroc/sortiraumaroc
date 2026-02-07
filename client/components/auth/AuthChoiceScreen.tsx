import { Button } from "@/components/ui/button";
import { OAuthDivider } from "./OAuthButtons";

interface AuthChoiceScreenProps {
  onLoginClick: () => void;
  onSignupClick: () => void;
  onOAuthClick: (provider: "google" | "apple" | "facebook") => void;
  oauthLoading?: boolean;
  oauthLoadingProvider?: "google" | "apple" | "facebook" | null;
}

export function AuthChoiceScreen({
  onLoginClick,
  onSignupClick,
  onOAuthClick,
  oauthLoading = false,
  oauthLoadingProvider = null,
}: AuthChoiceScreenProps) {
  return (
    <div className="space-y-4">
      {/* Logo */}
      <div className="flex flex-col items-center mb-1 overflow-hidden">
        <img
          src="https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fc4b847e82d5c43669264291d1a767312?format=webp&width=800"
          alt="Sortir Au Maroc"
          className="h-14 w-auto scale-150"
          loading="lazy"
        />
      </div>

      {/* Title */}
      <div className="text-center space-y-1">
        <h2
          className="text-lg sm:text-xl font-bold text-slate-900"
          style={{ fontFamily: "Circular Std, sans-serif" }}
        >
          Bienvenue
        </h2>
        <p className="text-slate-600 text-xs">
          Connectez-vous ou créez un compte pour continuer
        </p>
      </div>

      {/* Main actions */}
      <div className="space-y-2">
        <Button
          type="button"
          className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
          onClick={onLoginClick}
        >
          J'ai déjà un compte
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full h-10 text-sm font-semibold rounded-lg border"
          onClick={onSignupClick}
        >
          Créer un compte
        </Button>
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
        <button
          type="button"
          onClick={() => onOAuthClick("facebook")}
          disabled={oauthLoading}
          className="w-12 h-12 flex items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
          aria-label="Facebook"
        >
          {oauthLoadingProvider === "facebook" ? (
            <span className="animate-spin text-sm">⏳</span>
          ) : (
            <img src="/facebook.png" alt="Facebook" className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Terms */}
      <p className="text-xs text-center text-slate-500">
        En continuant, vous acceptez nos Conditions d'utilisation et notre Politique de confidentialité
      </p>
    </div>
  );
}
