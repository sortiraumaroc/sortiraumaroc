import { useState, useEffect } from "react";
import { X, Lightbulb } from "lucide-react";

const STORAGE_PREFIX = "sam_pro_onboarding_dismissed_";

type Props = {
  /** Unique key for this tip — once dismissed, never shown again */
  tipKey: string;
  /** The tip message to display */
  message: string;
  /** Optional: title displayed before the message */
  title?: string;
};

/**
 * One-time onboarding tip for Pro dashboard.
 * Shows a dismissible info banner. Once the user clicks the X (dismiss),
 * it's stored in localStorage and never displayed again.
 */
export function ProOnboardingTip({ tipKey, message, title }: Props) {
  const storageKey = `${STORAGE_PREFIX}${tipKey}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if not previously dismissed
    try {
      if (!localStorage.getItem(storageKey)) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable — don't show
    }
  }, [storageKey]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // ignore
    }
  };

  if (!visible) return null;

  return (
    <div className="relative bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-200 rounded-xl px-4 py-3 pe-10 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex gap-3">
        <div className="shrink-0 mt-0.5">
          <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center">
            <Lightbulb className="h-4 w-4 text-blue-600" />
          </div>
        </div>
        <div className="space-y-0.5">
          {title && <div className="text-sm font-semibold text-blue-900">{title}</div>}
          <p className="text-sm text-blue-800 leading-relaxed">{message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-2.5 end-2.5 h-6 w-6 rounded-full flex items-center justify-center text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition"
        aria-label="Fermer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
