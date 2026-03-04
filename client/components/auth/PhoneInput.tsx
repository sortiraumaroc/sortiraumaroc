import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { forwardRef, useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

// ─── Supported countries ───
export interface Country {
  code: string;   // ISO 3166-1 alpha-2
  name: string;
  dial: string;   // e.g. "+212"
  flag: string;   // emoji
  maxDigits: number;
  minDigits: number;
}

export const COUNTRIES: Country[] = [
  { code: "MA", name: "Maroc",          dial: "+212", flag: "🇲🇦", minDigits: 9, maxDigits: 9 },
  { code: "FR", name: "France",         dial: "+33",  flag: "🇫🇷", minDigits: 9, maxDigits: 9 },
  { code: "BE", name: "Belgique",       dial: "+32",  flag: "🇧🇪", minDigits: 8, maxDigits: 9 },
  { code: "US", name: "États-Unis",     dial: "+1",   flag: "🇺🇸", minDigits: 10, maxDigits: 10 },
  { code: "CA", name: "Canada",         dial: "+1",   flag: "🇨🇦", minDigits: 10, maxDigits: 10 },
  { code: "IT", name: "Italie",         dial: "+39",  flag: "🇮🇹", minDigits: 9, maxDigits: 10 },
  { code: "ES", name: "Espagne",        dial: "+34",  flag: "🇪🇸", minDigits: 9, maxDigits: 9 },
  { code: "DE", name: "Allemagne",      dial: "+49",  flag: "🇩🇪", minDigits: 10, maxDigits: 11 },
  { code: "GB", name: "Royaume-Uni",    dial: "+44",  flag: "🇬🇧", minDigits: 10, maxDigits: 10 },
  { code: "NL", name: "Pays-Bas",       dial: "+31",  flag: "🇳🇱", minDigits: 9, maxDigits: 9 },
  { code: "CH", name: "Suisse",         dial: "+41",  flag: "🇨🇭", minDigits: 9, maxDigits: 9 },
  { code: "LU", name: "Luxembourg",     dial: "+352", flag: "🇱🇺", minDigits: 8, maxDigits: 9 },
  { code: "AE", name: "Émirats arabes", dial: "+971", flag: "🇦🇪", minDigits: 9, maxDigits: 9 },
  { code: "DZ", name: "Algérie",        dial: "+213", flag: "🇩🇿", minDigits: 9, maxDigits: 9 },
  { code: "TN", name: "Tunisie",        dial: "+216", flag: "🇹🇳", minDigits: 8, maxDigits: 8 },
];

function getCountry(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];
}

// ─── PhoneInput component ───
interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  countryCode?: string;
  onCountryChange?: (code: string) => void;
  error?: string;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      value,
      onChange,
      countryCode = "MA",
      onCountryChange,
      error,
      disabled = false,
      label = "Numéro de téléphone",
      placeholder,
      className,
    },
    ref
  ) => {
    const [focused, setFocused] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const country = getCountry(countryCode);

    // Close dropdown on outside click
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setDropdownOpen(false);
        }
      };
      if (dropdownOpen) {
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
      }
    }, [dropdownOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      let digits = inputValue.replace(/\D/g, "");
      // Auto-strip leading 0 (users often type 06... instead of 6...)
      if (digits.startsWith("0") && digits.length > 1) {
        digits = digits.slice(1);
      }
      digits = digits.slice(0, country.maxDigits);
      onChange(digits);
    };

    const handleCountrySelect = (c: Country) => {
      onCountryChange?.(c.code);
      onChange(""); // Reset phone when switching country
      setDropdownOpen(false);
    };

    const displayPlaceholder = placeholder || "Numéro de téléphone";
    const isComplete = value.length >= country.minDigits && value.length <= country.maxDigits;

    return (
      <div className={cn("space-y-1.5", className)}>
        {label && (
          <Label className="text-sm font-medium text-slate-900">{label}</Label>
        )}
        <div className="relative">
          <div
            className={cn(
              "flex items-center rounded-lg border bg-white transition-all",
              focused && !error && "ring-2 ring-primary/20 border-primary",
              error && "border-red-500 ring-2 ring-red-500/20",
              !focused && !error && "border-slate-200 hover:border-slate-300"
            )}
          >
            {/* Country selector */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => !disabled && setDropdownOpen(!dropdownOpen)}
                disabled={disabled}
                className="flex items-center gap-1 ps-2.5 pe-1.5 py-2 border-e border-slate-200 bg-slate-50 rounded-s-lg whitespace-nowrap shrink-0 hover:bg-slate-100 transition-colors"
              >
                <span className="text-sm leading-none">{country.flag}</span>
                <span className="text-xs font-medium text-slate-700">{country.dial}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {/* Dropdown */}
              {dropdownOpen && (
                <div className="absolute top-full start-0 mt-1 w-56 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                  {COUNTRIES.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => handleCountrySelect(c)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-start hover:bg-slate-50 transition-colors text-sm",
                        c.code === countryCode && "bg-primary/5 font-medium"
                      )}
                    >
                      <span className="text-sm">{c.flag}</span>
                      <span className="flex-1 truncate text-slate-700">{c.name}</span>
                      <span className="text-xs text-slate-400">{c.dial}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Phone input */}
            <Input
              ref={ref}
              type="tel"
              inputMode="numeric"
              value={value}
              onChange={handleChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              disabled={disabled}
              placeholder={displayPlaceholder}
              className={cn(
                "border-0 focus-visible:ring-0 focus-visible:ring-offset-0",
                "text-sm font-medium tracking-wide",
                "h-10 ps-3"
              )}
              autoComplete="tel-national"
            />

            {/* Validation indicator */}
            {value.length >= country.minDigits && (
              <div className="pe-3">
                {isComplete ? (
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

/**
 * Convert a local number + country code to E.164 format
 */
export function toE164(localNumber: string, countryCode: string = "MA"): string {
  const digits = localNumber.replace(/\D/g, "");
  const country = getCountry(countryCode);
  if (digits.length >= country.minDigits && digits.length <= country.maxDigits) {
    return `${country.dial}${digits}`;
  }
  return "";
}

/**
 * Validate if a phone number is valid for the given country
 */
export function isValidPhone(value: string, countryCode: string = "MA"): boolean {
  const digits = value.replace(/\D/g, "");
  const country = getCountry(countryCode);
  return digits.length >= country.minDigits && digits.length <= country.maxDigits;
}

/**
 * @deprecated Use isValidPhone(value, countryCode) instead
 */
export function isValidMoroccanMobile(value: string): boolean {
  return isValidPhone(value, "MA");
}
