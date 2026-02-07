import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface VerifyCodeInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function VerifyCodeInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  disabled = false,
  autoFocus = true,
}: VerifyCodeInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Initialize refs array
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  // Auto-focus first input
  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  // Check for completion
  useEffect(() => {
    if (value.length === length && onComplete) {
      onComplete(value);
    }
  }, [value, length, onComplete]);

  const handleChange = (index: number, inputValue: string) => {
    // Only allow digits
    const digit = inputValue.replace(/\D/g, "").slice(-1);

    if (digit) {
      // Update value
      const newValue = value.slice(0, index) + digit + value.slice(index + 1);
      onChange(newValue.slice(0, length));

      // Move to next input
      if (index < length - 1 && inputRefs.current[index + 1]) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();

      if (value[index]) {
        // Clear current digit
        const newValue = value.slice(0, index) + value.slice(index + 1);
        onChange(newValue);
      } else if (index > 0) {
        // Move to previous input and clear it
        const newValue = value.slice(0, index - 1) + value.slice(index);
        onChange(newValue);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pastedData) {
      onChange(pastedData);
      // Focus the appropriate input after paste
      const focusIndex = Math.min(pastedData.length, length - 1);
      inputRefs.current[focusIndex]?.focus();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-2 sm:gap-3">
        {Array.from({ length }).map((_, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={value[index] || ""}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex(null)}
            disabled={disabled}
            className={cn(
              "w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold",
              "rounded-xl border-2 transition-all duration-200",
              "focus:outline-none focus:ring-0",
              disabled && "opacity-50 cursor-not-allowed bg-slate-100",
              error
                ? "border-red-500 bg-red-50"
                : focusedIndex === index
                  ? "border-primary bg-primary/5"
                  : value[index]
                    ? "border-slate-300 bg-white"
                    : "border-slate-200 bg-slate-50"
            )}
            aria-label={`Digit ${index + 1}`}
          />
        ))}
      </div>

      {error && (
        <p className="text-center text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}

/**
 * Countdown timer component for resend functionality
 */
interface CountdownTimerProps {
  seconds: number;
  onComplete: () => void;
  onResend: () => void;
  resendLabel?: string;
  waitingLabel?: string;
}

export function CountdownTimer({
  seconds: initialSeconds,
  onComplete,
  onResend,
  resendLabel = "Renvoyer le code",
  waitingLabel = "Renvoyer dans",
}: CountdownTimerProps) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    setSeconds(initialSeconds);
    setCanResend(false);
  }, [initialSeconds]);

  useEffect(() => {
    if (seconds <= 0) {
      setCanResend(true);
      onComplete();
      return;
    }

    const timer = setInterval(() => {
      setSeconds((s) => s - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [seconds, onComplete]);

  const formatTime = (s: number): string => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleResend = () => {
    setSeconds(initialSeconds);
    setCanResend(false);
    onResend();
  };

  if (canResend) {
    return (
      <button
        type="button"
        onClick={handleResend}
        className="text-primary hover:text-primary/80 font-medium text-sm transition-colors"
      >
        {resendLabel}
      </button>
    );
  }

  return (
    <span className="text-slate-500 text-sm">
      {waitingLabel} <span className="font-mono font-medium">{formatTime(seconds)}</span>
    </span>
  );
}
