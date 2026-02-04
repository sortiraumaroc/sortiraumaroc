/**
 * Champ de saisie de code parrainage avec validation en temps réel
 */

import { useState, useEffect, useCallback } from "react";
import { Check, X, Loader2, Gift } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateReferralCode } from "@/lib/referral/api";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onValidChange?: (isValid: boolean, partnerName?: string) => void;
  className?: string;
  disabled?: boolean;
};

export function ReferralCodeInput({
  value,
  onChange,
  onValidChange,
  className,
  disabled,
}: Props) {
  const [checking, setChecking] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Debounced validation
  const validateCode = useCallback(async (code: string) => {
    if (!code || code.length < 3) {
      setIsValid(null);
      setPartnerName(null);
      setErrorMessage(null);
      onValidChange?.(false);
      return;
    }

    setChecking(true);
    setErrorMessage(null);

    try {
      const result = await validateReferralCode(code);

      if (result.valid) {
        setIsValid(true);
        setPartnerName(result.partner_name || null);
        setErrorMessage(null);
        onValidChange?.(true, result.partner_name);
      } else {
        setIsValid(false);
        setPartnerName(null);
        setErrorMessage(result.error || "Code invalide");
        onValidChange?.(false);
      }
    } catch {
      setIsValid(false);
      setPartnerName(null);
      setErrorMessage("Erreur de vérification");
      onValidChange?.(false);
    } finally {
      setChecking(false);
    }
  }, [onValidChange]);

  // Debounce the validation
  useEffect(() => {
    const timer = setTimeout(() => {
      validateCode(value);
    }, 500);

    return () => clearTimeout(timer);
  }, [value, validateCode]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    onChange(newValue);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor="referral-code" className="flex items-center gap-2">
        <Gift className="h-4 w-4 text-primary" />
        Code de parrainage (optionnel)
      </Label>
      <div className="relative">
        <Input
          id="referral-code"
          placeholder="Ex: YASSINE24"
          value={value}
          onChange={handleChange}
          disabled={disabled}
          maxLength={20}
          className={cn(
            "pr-10",
            isValid === true && "border-green-500 focus-visible:ring-green-500",
            isValid === false && "border-red-500 focus-visible:ring-red-500"
          )}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {checking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!checking && isValid === true && <Check className="h-4 w-4 text-green-500" />}
          {!checking && isValid === false && <X className="h-4 w-4 text-red-500" />}
        </div>
      </div>

      {/* Success message */}
      {isValid && partnerName && (
        <p className="text-sm text-green-600">
          Parrainé par : {partnerName}
        </p>
      )}

      {/* Error message */}
      {!checking && isValid === false && errorMessage && (
        <p className="text-sm text-red-500">{errorMessage}</p>
      )}

      {/* Helper text */}
      {!value && (
        <p className="text-xs text-muted-foreground">
          Si vous avez un code de parrainage, entrez-le ici
        </p>
      )}
    </div>
  );
}

/**
 * Hook pour récupérer le code parrainage depuis l'URL
 */
export function useReferralCodeFromUrl(): string | null {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref") || params.get("referral") || params.get("code");
    if (refCode) {
      setCode(refCode.toUpperCase());
    }
  }, []);

  return code;
}
