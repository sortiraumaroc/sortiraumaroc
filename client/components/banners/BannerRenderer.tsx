/**
 * BannerRenderer — Main banner rendering component
 *
 * Supports 6 banner types (image_simple, image_text, video, form, carousel, countdown)
 * and 4 display formats (modal, bottom_sheet, top_banner, floating).
 * Handles entrance animations, close delay, overlay, CTA buttons, and view tracking.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  BannerType,
  BannerDisplayFormat,
  BannerAnimation,
  CarouselSlide,
  BannerFormField,
} from "../../../shared/notificationsBannersWheelTypes";
import { BannerFormFields } from "./BannerFormFields";

// =============================================================================
// Types
// =============================================================================

export interface BannerRendererProps {
  banner: {
    id: string;
    type: string;
    title?: string | null;
    subtitle?: string | null;
    media_url?: string | null;
    media_type?: string | null;
    cta_text?: string;
    cta_url?: string;
    cta_target?: string;
    secondary_cta_text?: string | null;
    secondary_cta_url?: string | null;
    carousel_slides?: CarouselSlide[] | null;
    countdown_target?: string | null;
    form_fields?: BannerFormField[] | null;
    form_confirmation_message?: string | null;
    display_format: string;
    animation: string;
    overlay_color?: string;
    overlay_opacity?: number;
    close_behavior?: string;
    close_delay_seconds?: number;
    appear_delay_type?: string;
    appear_delay_value?: number;
  };
  onClose: () => void;
  onCtaClick: () => void;
  onFormSubmit?: (data: Record<string, unknown>) => void;
  sessionId: string;
}

// =============================================================================
// Helpers
// =============================================================================

function getAnimationClasses(animation: BannerAnimation, entered: boolean): string {
  const base = "transition-all duration-500 ease-out";
  switch (animation) {
    case "fade":
      return cn(base, entered ? "opacity-100" : "opacity-0");
    case "slide_up":
      return cn(base, entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8");
    case "slide_down":
      return cn(base, entered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-8");
    case "zoom":
      return cn(base, entered ? "opacity-100 scale-100" : "opacity-0 scale-90");
    case "none":
    default:
      return "";
  }
}

function formatCountdown(diff: number): { days: number; hours: number; minutes: number; seconds: number } {
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { days, hours, minutes, seconds };
}

function padZero(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// =============================================================================
// Sub-components
// =============================================================================

/** Close button with optional delay lock */
function CloseButton({
  onClose,
  closeDelaySeconds,
}: {
  onClose: () => void;
  closeDelaySeconds: number;
}) {
  const [remaining, setRemaining] = useState(closeDelaySeconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  const disabled = remaining > 0;

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClose}
      disabled={disabled}
      className={cn(
        "absolute top-3 end-3 z-50 h-8 w-8 rounded-full flex items-center justify-center transition-all",
        disabled
          ? "bg-black/20 text-white/40 cursor-not-allowed"
          : "bg-black/40 text-white hover:bg-black/60 cursor-pointer"
      )}
      aria-label="Fermer"
    >
      {disabled ? (
        <span className="text-xs font-bold">{remaining}</span>
      ) : (
        <X className="h-4 w-4" />
      )}
    </button>
  );
}

/** CTA buttons (primary + optional secondary) */
function CtaButtons({
  banner,
  onCtaClick,
  className,
}: {
  banner: BannerRendererProps["banner"];
  onCtaClick: () => void;
  className?: string;
}) {
  const handlePrimary = useCallback(() => {
    onCtaClick();
    if (banner.cta_url) {
      if (banner.cta_target === "new_tab" || banner.cta_target === "external") {
        window.open(banner.cta_url, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = banner.cta_url;
      }
    }
  }, [banner.cta_url, banner.cta_target, onCtaClick]);

  const handleSecondary = useCallback(() => {
    if (banner.secondary_cta_url) {
      window.open(banner.secondary_cta_url, "_blank", "noopener,noreferrer");
    }
  }, [banner.secondary_cta_url]);

  if (!banner.cta_text && !banner.secondary_cta_text) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {banner.cta_text && (
        <button
          type="button"
          onClick={handlePrimary}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#a3001d] text-white text-sm font-semibold rounded-full hover:bg-[#a3001d]/90 transition-colors shadow-lg"
        >
          {banner.cta_text}
          {(banner.cta_target === "new_tab" || banner.cta_target === "external") && (
            <ExternalLink className="h-3.5 w-3.5" />
          )}
        </button>
      )}
      {banner.secondary_cta_text && banner.secondary_cta_url && (
        <button
          type="button"
          onClick={handleSecondary}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-white/20 backdrop-blur text-white text-sm font-semibold rounded-full border border-white/30 hover:bg-white/30 transition-colors"
        >
          {banner.secondary_cta_text}
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Banner type renderers
// =============================================================================

/** image_simple: Just an image with CTA overlay */
function ImageSimpleBanner({
  banner,
  onCtaClick,
}: {
  banner: BannerRendererProps["banner"];
  onCtaClick: () => void;
}) {
  return (
    <div className="relative w-full">
      {banner.media_url && (
        <img
          src={banner.media_url}
          alt={banner.title ?? "Banner"}
          className="w-full h-auto max-h-[70vh] object-cover rounded-lg"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
        <CtaButtons banner={banner} onCtaClick={onCtaClick} />
      </div>
    </div>
  );
}

/** image_text: Image + title + subtitle + CTA */
function ImageTextBanner({
  banner,
  onCtaClick,
}: {
  banner: BannerRendererProps["banner"];
  onCtaClick: () => void;
}) {
  return (
    <div className="relative w-full">
      {banner.media_url && (
        <img
          src={banner.media_url}
          alt={banner.title ?? "Banner"}
          className="w-full h-auto max-h-[60vh] object-cover rounded-lg"
        />
      )}
      <div className="absolute inset-0 flex flex-col justify-end p-6 bg-gradient-to-t from-black/70 via-black/30 to-transparent rounded-lg">
        {banner.title && (
          <h3 className="text-xl sm:text-2xl font-bold text-white mb-1 drop-shadow-lg">
            {banner.title}
          </h3>
        )}
        {banner.subtitle && (
          <p className="text-sm sm:text-base text-white/90 mb-4 max-w-lg drop-shadow">
            {banner.subtitle}
          </p>
        )}
        <CtaButtons banner={banner} onCtaClick={onCtaClick} />
      </div>
    </div>
  );
}

/** video: Auto-playing muted video + CTA */
function VideoBanner({
  banner,
  onCtaClick,
}: {
  banner: BannerRendererProps["banner"];
  onCtaClick: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.play().catch(() => {
        // Autoplay may be blocked
      });
    }
  }, []);

  return (
    <div className="relative w-full">
      {banner.media_url && (
        <video
          ref={videoRef}
          src={banner.media_url}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-auto max-h-[70vh] object-cover rounded-lg"
        />
      )}
      <div className="absolute inset-0 flex flex-col justify-end p-6 bg-gradient-to-t from-black/60 to-transparent rounded-lg">
        {banner.title && (
          <h3 className="text-xl font-bold text-white mb-1 drop-shadow-lg">{banner.title}</h3>
        )}
        {banner.subtitle && (
          <p className="text-sm text-white/90 mb-4 drop-shadow">{banner.subtitle}</p>
        )}
        <CtaButtons banner={banner} onCtaClick={onCtaClick} />
      </div>
    </div>
  );
}

/** form: Title + dynamic form fields */
function FormBanner({
  banner,
  onFormSubmit,
}: {
  banner: BannerRendererProps["banner"];
  onFormSubmit?: (data: Record<string, unknown>) => void;
}) {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(
    (data: Record<string, unknown>) => {
      onFormSubmit?.(data);
      setSubmitted(true);
    },
    [onFormSubmit]
  );

  if (submitted) {
    return (
      <div className="p-6 text-center space-y-3">
        <div className="h-12 w-12 mx-auto bg-green-100 rounded-full flex items-center justify-center">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-base font-semibold text-slate-900">
          {banner.form_confirmation_message || "Merci pour votre soumission !"}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {banner.title && (
        <h3 className="text-lg font-bold text-slate-900">{banner.title}</h3>
      )}
      {banner.subtitle && (
        <p className="text-sm text-slate-500">{banner.subtitle}</p>
      )}
      {banner.form_fields && banner.form_fields.length > 0 && (
        <BannerFormFields fields={banner.form_fields} onSubmit={handleSubmit} />
      )}
    </div>
  );
}

/** carousel: Horizontal slides with dots navigation */
function CarouselBanner({
  banner,
  onCtaClick,
}: {
  banner: BannerRendererProps["banner"];
  onCtaClick: () => void;
}) {
  const slides = banner.carousel_slides ?? [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const total = slides.length;

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? total - 1 : prev - 1));
  }, [total]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === total - 1 ? 0 : prev + 1));
  }, [total]);

  if (total === 0) return null;

  const slide = slides[currentIndex];

  return (
    <div className="relative w-full">
      {/* Slide image */}
      <div className="relative overflow-hidden rounded-lg">
        <img
          src={slide.image_url}
          alt={slide.title ?? `Slide ${currentIndex + 1}`}
          className="w-full h-auto max-h-[60vh] object-cover transition-opacity duration-300"
        />
        {(slide.title || slide.subtitle) && (
          <div className="absolute inset-0 flex flex-col justify-end p-6 bg-gradient-to-t from-black/60 to-transparent">
            {slide.title && (
              <h3 className="text-lg font-bold text-white mb-1 drop-shadow-lg">{slide.title}</h3>
            )}
            {slide.subtitle && (
              <p className="text-sm text-white/90 drop-shadow">{slide.subtitle}</p>
            )}
          </div>
        )}
      </div>

      {/* Navigation arrows */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="absolute start-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="absolute end-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      {/* Dots */}
      {total > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentIndex(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === currentIndex ? "w-6 bg-[#a3001d]" : "w-2 bg-slate-300 hover:bg-slate-400"
              )}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-4 px-2">
        <CtaButtons banner={banner} onCtaClick={onCtaClick} />
      </div>
    </div>
  );
}

/** countdown: Countdown timer to target date + CTA */
function CountdownBanner({
  banner,
  onCtaClick,
}: {
  banner: BannerRendererProps["banner"];
  onCtaClick: () => void;
}) {
  const targetDate = useMemo(
    () => (banner.countdown_target ? new Date(banner.countdown_target).getTime() : 0),
    [banner.countdown_target]
  );

  const [countdown, setCountdown] = useState(() => formatCountdown(targetDate - Date.now()));

  useEffect(() => {
    if (!targetDate) return;
    const interval = setInterval(() => {
      setCountdown(formatCountdown(targetDate - Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const expired =
    countdown.days === 0 && countdown.hours === 0 && countdown.minutes === 0 && countdown.seconds === 0;

  return (
    <div className="p-6 space-y-5 text-center">
      {banner.media_url && (
        <img
          src={banner.media_url}
          alt={banner.title ?? "Countdown"}
          className="w-full h-auto max-h-40 object-cover rounded-lg mx-auto"
        />
      )}

      {banner.title && (
        <h3 className="text-xl font-bold text-slate-900">{banner.title}</h3>
      )}
      {banner.subtitle && (
        <p className="text-sm text-slate-500">{banner.subtitle}</p>
      )}

      {/* Timer */}
      {!expired ? (
        <div className="flex justify-center gap-3">
          {[
            { value: countdown.days, label: "Jours" },
            { value: countdown.hours, label: "Heures" },
            { value: countdown.minutes, label: "Min" },
            { value: countdown.seconds, label: "Sec" },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center">
              <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl bg-[#a3001d] text-white flex items-center justify-center text-xl sm:text-2xl font-bold shadow-lg">
                {padZero(value)}
              </div>
              <span className="text-[10px] sm:text-xs text-slate-500 mt-1 font-medium">{label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-base font-semibold text-[#a3001d]">L'offre est terminee !</p>
      )}

      <CtaButtons banner={banner} onCtaClick={onCtaClick} className="justify-center" />
    </div>
  );
}

// =============================================================================
// BannerContent — Dispatches to the correct banner type renderer
// =============================================================================

function BannerContent({
  banner,
  onCtaClick,
  onFormSubmit,
}: {
  banner: BannerRendererProps["banner"];
  onCtaClick: () => void;
  onFormSubmit?: (data: Record<string, unknown>) => void;
}) {
  const type = banner.type as BannerType;
  switch (type) {
    case "image_simple":
      return <ImageSimpleBanner banner={banner} onCtaClick={onCtaClick} />;
    case "image_text":
      return <ImageTextBanner banner={banner} onCtaClick={onCtaClick} />;
    case "video":
      return <VideoBanner banner={banner} onCtaClick={onCtaClick} />;
    case "form":
      return <FormBanner banner={banner} onFormSubmit={onFormSubmit} />;
    case "carousel":
      return <CarouselBanner banner={banner} onCtaClick={onCtaClick} />;
    case "countdown":
      return <CountdownBanner banner={banner} onCtaClick={onCtaClick} />;
    default:
      return null;
  }
}

// =============================================================================
// BannerRenderer — Main export
// =============================================================================

export function BannerRenderer({ banner, onClose, onCtaClick, onFormSubmit, sessionId }: BannerRendererProps) {
  const [entered, setEntered] = useState(false);
  const hasTrackedView = useRef(false);
  const format = banner.display_format as BannerDisplayFormat;
  const animation = banner.animation as BannerAnimation;
  const closeDelay = banner.close_delay_seconds ?? 0;
  const overlayColor = banner.overlay_color ?? "#000000";
  const overlayOpacity = banner.overlay_opacity ?? 0.5;

  // Trigger entrance animation after mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setEntered(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Track view on mount (best-effort, fire-and-forget)
  useEffect(() => {
    if (hasTrackedView.current) return;
    hasTrackedView.current = true;
    void fetch("/api/banners/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banner_id: banner.id, action: "view", session_id: sessionId }),
    }).catch(() => {});
  }, [banner.id, sessionId]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Overlay background style
  const overlayStyle = useMemo(
    () => ({
      backgroundColor: overlayColor,
      opacity: overlayOpacity,
    }),
    [overlayColor, overlayOpacity]
  );

  // ----- Display format: MODAL -----
  if (format === "modal") {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        {/* Overlay backdrop */}
        <div className="absolute inset-0" style={overlayStyle} onClick={onClose} />

        {/* Content */}
        <div
          className={cn(
            "relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl",
            getAnimationClasses(animation, entered)
          )}
        >
          <CloseButton onClose={onClose} closeDelaySeconds={closeDelay} />
          <BannerContent banner={banner} onCtaClick={onCtaClick} onFormSubmit={onFormSubmit} />
        </div>
      </div>
    );
  }

  // ----- Display format: BOTTOM_SHEET -----
  if (format === "bottom_sheet") {
    return (
      <div className="fixed inset-0 z-[9999] flex items-end">
        {/* Overlay backdrop */}
        <div className="absolute inset-0" style={overlayStyle} onClick={onClose} />

        {/* Sheet */}
        <div
          className={cn(
            "relative z-10 w-full max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl transition-all duration-500 ease-out",
            entered ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
          )}
        >
          {/* Drag indicator */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-slate-300" />
          </div>
          <CloseButton onClose={onClose} closeDelaySeconds={closeDelay} />
          <BannerContent banner={banner} onCtaClick={onCtaClick} onFormSubmit={onFormSubmit} />
          {/* Bottom safe area */}
          <div className="h-4" />
        </div>
      </div>
    );
  }

  // ----- Display format: TOP_BANNER -----
  if (format === "top_banner") {
    return (
      <div
        className={cn(
          "fixed top-0 inset-x-0 z-[9999] transition-all duration-500 ease-out",
          entered ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
        )}
      >
        <div className="relative bg-white shadow-lg border-b border-slate-200">
          <CloseButton onClose={onClose} closeDelaySeconds={closeDelay} />
          <div className="max-w-5xl mx-auto">
            <BannerContent banner={banner} onCtaClick={onCtaClick} onFormSubmit={onFormSubmit} />
          </div>
        </div>
      </div>
    );
  }

  // ----- Display format: FLOATING -----
  if (format === "floating") {
    return (
      <div
        className={cn(
          "fixed bottom-4 end-4 z-[9999] w-80 max-w-[calc(100vw-2rem)]",
          getAnimationClasses(animation, entered)
        )}
      >
        <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          <CloseButton onClose={onClose} closeDelaySeconds={closeDelay} />
          <BannerContent banner={banner} onCtaClick={onCtaClick} onFormSubmit={onFormSubmit} />
        </div>
      </div>
    );
  }

  // Fallback: render nothing for unknown formats
  return null;
}

export default BannerRenderer;
