import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { ReCaptchaV2, ReCaptchaV2Ref, isRecaptchaConfigured } from "./ReCaptchaV2";

interface SignupEmailScreenProps {
  onBack: () => void;
  onSubmit: (data: {
    email: string;
    password: string;
    referralCode?: string;
    recaptchaToken: string;
  }) => Promise<void>;
  loading?: boolean;
  error?: string | null;
  validateReferralCode?: (code: string) => Promise<{ valid: boolean; partnerName?: string }>;
}

export function SignupEmailScreen({
  onBack,
  onSubmit,
  loading = false,
  error = null,
  validateReferralCode,
}: SignupEmailScreenProps) {
  const recaptchaRef = useRef<ReCaptchaV2Ref>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Referral code validation state
  const [referralStatus, setReferralStatus] = useState<{
    checking: boolean;
    valid: boolean | null;
    partnerName?: string;
  }>({ checking: false, valid: null });

  const displayError = error || localError;
  const hasRecaptcha = isRecaptchaConfigured();

  // Password strength check
  const passwordStrength = {
    minLength: password.length >= 8,
    hasNumber: /\d/.test(password),
    hasLetter: /[a-zA-Z]/.test(password),
  };
  const isPasswordStrong = passwordStrength.minLength && passwordStrength.hasNumber && passwordStrength.hasLetter;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const handleReferralCodeChange = async (value: string) => {
    const code = value.toUpperCase().trim();
    setReferralCode(code);

    if (!code) {
      setReferralStatus({ checking: false, valid: null });
      return;
    }

    if (code.length >= 3 && validateReferralCode) {
      setReferralStatus({ checking: true, valid: null });
      try {
        const result = await validateReferralCode(code);
        setReferralStatus({
          checking: false,
          valid: result.valid,
          partnerName: result.partnerName,
        });
      } catch {
        setReferralStatus({ checking: false, valid: false });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    // Validation
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setLocalError("Veuillez entrer votre email");
      return;
    }

    if (!/.+@.+\..+/.test(trimmedEmail)) {
      setLocalError("Email invalide");
      return;
    }

    if (!password) {
      setLocalError("Veuillez entrer un mot de passe");
      return;
    }

    if (!isPasswordStrong) {
      setLocalError(
        "Le mot de passe doit contenir au moins 8 caractères, une lettre et un chiffre"
      );
      return;
    }

    if (password !== confirmPassword) {
      setLocalError("Les mots de passe ne correspondent pas");
      return;
    }

    if (hasRecaptcha && !recaptchaToken) {
      setLocalError("Veuillez compléter le reCAPTCHA");
      return;
    }

    try {
      await onSubmit({
        email: trimmedEmail,
        password,
        referralCode: referralCode || undefined,
        recaptchaToken: recaptchaToken || "",
      });
    } catch {
      // Reset reCAPTCHA on error
      recaptchaRef.current?.reset();
      setRecaptchaToken(null);
    }
  };

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
            Inscription par email
          </h2>
          <p className="text-xs text-slate-600">
            Créez votre compte avec votre adresse email
          </p>
        </div>
      </div>

      {/* Error message */}
      {displayError && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {displayError}
        </div>
      )}

      {/* Signup form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="signup-email" className="text-sm font-medium text-slate-900">
            Adresse email
          </Label>
          <Input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="votre@email.com"
            disabled={loading}
            autoComplete="email"
            className="h-10 rounded-lg text-sm"
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <Label htmlFor="signup-password" className="text-sm font-medium text-slate-900">
            Mot de passe
          </Label>
          <div className="relative">
            <Input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              autoComplete="new-password"
              className="h-10 rounded-lg text-sm pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Password strength indicators */}
          {password && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={cn("flex items-center gap-1", passwordStrength.minLength ? "text-green-600" : "text-slate-400")}>
                {passwordStrength.minLength ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                8+ caractères
              </span>
              <span className={cn("flex items-center gap-1", passwordStrength.hasLetter ? "text-green-600" : "text-slate-400")}>
                {passwordStrength.hasLetter ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                Une lettre
              </span>
              <span className={cn("flex items-center gap-1", passwordStrength.hasNumber ? "text-green-600" : "text-slate-400")}>
                {passwordStrength.hasNumber ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                Un chiffre
              </span>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <Label htmlFor="signup-confirm-password" className="text-sm font-medium text-slate-900">
            Confirmer mot de passe
          </Label>
          <div className="relative">
            <Input
              id="signup-confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              autoComplete="new-password"
              className={cn(
                "h-10 rounded-lg text-sm pr-10",
                confirmPassword && !passwordsMatch && "border-red-400",
                passwordsMatch && "border-green-500"
              )}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirmPassword && !passwordsMatch && (
            <p className="text-xs text-red-500">Les mots de passe ne correspondent pas</p>
          )}
        </div>

        {/* Referral code (optional) */}
        <div className="space-y-1.5">
          <Label htmlFor="signup-referral" className="text-sm font-medium text-slate-900">
            Code parrain
            <span className="text-slate-400 font-normal ml-1">
              (optionnel)
            </span>
          </Label>
          <div className="relative">
            <Input
              id="signup-referral"
              type="text"
              value={referralCode}
              onChange={(e) => handleReferralCodeChange(e.target.value)}
              placeholder="SAMXXX"
              disabled={loading}
              className={cn(
                "h-10 rounded-lg text-sm uppercase",
                referralStatus.valid === true && "border-green-500 pr-10",
                referralStatus.valid === false && "border-red-500 pr-10"
              )}
              maxLength={20}
            />
            {referralStatus.checking && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin">⏳</span>
            )}
            {!referralStatus.checking && referralStatus.valid === true && (
              <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
            )}
            {!referralStatus.checking && referralStatus.valid === false && (
              <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
            )}
          </div>
          {referralStatus.valid && referralStatus.partnerName && (
            <p className="text-xs text-green-600">
              Parrainé par {referralStatus.partnerName}
            </p>
          )}
          {referralStatus.valid === false && referralCode && (
            <p className="text-xs text-red-500">
              Code parrain invalide
            </p>
          )}
        </div>

        {/* reCAPTCHA */}
        {hasRecaptcha && (
          <div className="pt-1">
            <ReCaptchaV2
              ref={recaptchaRef}
              onVerify={(token) => setRecaptchaToken(token)}
              onExpired={() => setRecaptchaToken(null)}
            />
          </div>
        )}

        {/* Submit button */}
        <Button
          type="submit"
          disabled={loading || !email || !isPasswordStrong || !passwordsMatch || (hasRecaptcha && !recaptchaToken)}
          className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              Inscription...
            </span>
          ) : (
            <>Continuer</>
          )}
        </Button>
      </form>

      {/* Terms */}
      <p className="text-xs text-center text-slate-500">
        En vous inscrivant, vous acceptez nos Conditions d'utilisation et notre Politique de confidentialité
      </p>
    </div>
  );
}
