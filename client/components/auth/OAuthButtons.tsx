import { Button } from "@/components/ui/button";

interface OAuthButtonsProps {
  onGoogleClick: () => void;
  onAppleClick: () => void;
  loading?: boolean;
  loadingProvider?: "google" | "apple" | null;
}

export function OAuthButtons({
  onGoogleClick,
  onAppleClick,
  loading = false,
  loadingProvider = null,
}: OAuthButtonsProps) {

  return (
    <div className="space-y-3">
      {/* Google */}
      <Button
        type="button"
        variant="outline"
        className="w-full h-12 text-base font-medium flex items-center justify-start px-4"
        onClick={onGoogleClick}
        disabled={loading}
      >
        <span className="w-8 flex items-center justify-center me-3">
          {loadingProvider === "google" ? (
            <span className="animate-spin">⏳</span>
          ) : (
            <img src="/google.png" alt="Google" className="w-6 h-6" />
          )}
        </span>
        Continuer avec Google
      </Button>

      {/* Apple */}
      <Button
        type="button"
        variant="outline"
        className="w-full h-12 text-base font-medium flex items-center justify-start px-4"
        onClick={onAppleClick}
        disabled={loading}
      >
        <span className="w-8 flex items-center justify-center me-3">
          {loadingProvider === "apple" ? (
            <span className="animate-spin">⏳</span>
          ) : (
            <img src="/logo-apple.png" alt="Apple" className="w-6 h-6" />
          )}
        </span>
        Continuer avec Apple
      </Button>
    </div>
  );
}

export function OAuthDivider() {

  return (
    <div className="relative my-3">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-slate-200" />
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="bg-white px-4 text-slate-500">
          Ou continuer avec
        </span>
      </div>
    </div>
  );
}
