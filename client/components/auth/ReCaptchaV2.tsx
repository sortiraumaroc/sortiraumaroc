import ReCAPTCHA from "react-google-recaptcha";
import { forwardRef, useImperativeHandle, useRef, useEffect } from "react";

export interface ReCaptchaV2Ref {
  reset: () => void;
  execute: () => void;
}

interface ReCaptchaV2Props {
  onVerify: (token: string | null) => void;
  onExpired?: () => void;
  onError?: () => void;
  size?: "normal" | "compact";
  theme?: "light" | "dark";
}

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

export const ReCaptchaV2 = forwardRef<ReCaptchaV2Ref, ReCaptchaV2Props>(
  ({ onVerify, onExpired, onError, size = "normal", theme = "light" }, ref) => {
    const recaptchaRef = useRef<ReCAPTCHA>(null);

    useImperativeHandle(ref, () => ({
      reset: () => {
        recaptchaRef.current?.reset();
      },
      execute: () => {
        recaptchaRef.current?.execute();
      },
    }));

    // Fix: Google injects the reCAPTCHA challenge iframe wrapper directly into <body>.
    // When used inside a Radix Dialog (z-50 overlay), clicks on challenge images are blocked.
    // This observer detects the challenge wrapper and boosts its z-index above the dialog.
    useEffect(() => {
      const observer = new MutationObserver(() => {
        // Google adds divs directly to body that contain recaptcha iframes
        document.querySelectorAll<HTMLDivElement>("body > div").forEach((div) => {
          const style = div.getAttribute("style") || "";
          if (
            style.includes("z-index") &&
            div.querySelector('iframe[src*="recaptcha"], iframe[title*="recaptcha"]')
          ) {
            div.style.zIndex = "2147483647";
            div.style.pointerEvents = "auto";
          }
        });
      });

      observer.observe(document.body, { childList: true, subtree: false });

      return () => observer.disconnect();
    }, []);

    if (!RECAPTCHA_SITE_KEY || isLocalhost) {
      return null;
    }

    return (
      <div className="flex justify-center">
        <ReCAPTCHA
          ref={recaptchaRef}
          sitekey={RECAPTCHA_SITE_KEY}
          onChange={onVerify}
          onExpired={() => {
            onVerify(null);
            onExpired?.();
          }}
          onErrored={() => {
            onVerify(null);
            onError?.();
          }}
          size={size}
          theme={theme}
          hl="fr"
        />
      </div>
    );
  }
);

ReCaptchaV2.displayName = "ReCaptchaV2";

export function isRecaptchaConfigured(): boolean {
  if (isLocalhost) return false;
  return Boolean(RECAPTCHA_SITE_KEY);
}
