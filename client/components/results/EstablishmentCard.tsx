import { useState, useRef, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MapPin, ChevronLeft, ChevronRight, BadgeCheck, Crown, Sparkles, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { isAuthed, openAuthModal } from "@/lib/auth";

export interface EstablishmentCardProps {
  id: string;
  name: string;
  image: string;
  images?: string[];
  neighborhood?: string;
  category?: string;
  rating?: number;
  reviews?: number;
  avgPrice?: string;
  distanceText?: string | null;

  // Booking & availability
  bookingEnabled?: boolean;
  nextSlot?: string | null;
  slotDiscount?: number | null;

  // Promotions
  promoPercent?: number;
  promoBadge?: string | null;

  // Badges
  isVerified?: boolean;
  isPremium?: boolean;
  isCurated?: boolean;

  // Review highlight
  highlightReview?: string | null;

  // Time slots to display
  availableSlots?: Array<{
    time: string;
    discount?: number;
  }>;

  // State
  isFavorite?: boolean;
  isSelected?: boolean;
  isHighlighted?: boolean;

  // Callbacks
  onFavoriteToggle?: () => void;
  onSelect?: () => void;
  onHover?: (hovering: boolean) => void;

  // Navigation
  detailsHref: string;

  // Labels
  actionLabel?: string;

  // Universe type for styling
  universe?: string;

  // Hide the fallback action button (e.g. on results page for visual consistency)
  hideActionButton?: boolean;
}

export const EstablishmentCard = memo(function EstablishmentCard({
  id,
  name,
  image,
  images = [],
  neighborhood,
  category,
  rating,
  reviews,
  avgPrice,
  distanceText,
  bookingEnabled,
  nextSlot,
  slotDiscount,
  promoPercent = 0,
  promoBadge,
  isVerified,
  isPremium,
  isCurated,
  highlightReview,
  availableSlots = [],
  isFavorite = false,
  isSelected = false,
  isHighlighted = false,
  onFavoriteToggle,
  onSelect,
  onHover,
  detailsHref,
  actionLabel,
  universe,
  hideActionButton = false,
}: EstablishmentCardProps) {
  const navigate = useNavigate();
  const { t } = useI18n();

  // Carousel state
  const allImages = [image, ...images].filter(Boolean);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const handlePrevImage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  }, [allImages.length]);

  const handleNextImage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  }, [allImages.length]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        setCurrentImageIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
      } else {
        setCurrentImageIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
      }
    }
    touchStartX.current = null;
  }, [allImages.length]);

  const handleFavoriteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthed()) {
      openAuthModal();
      return;
    }
    onFavoriteToggle?.();
  }, [onFavoriteToggle]);

  const handleCardClick = useCallback(() => {
    onSelect?.();
  }, [onSelect]);

  const handleNavigate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(detailsHref);
  }, [navigate, detailsHref]);

  // Determine which badge to show (priority: premium > verified > curated)
  const getBadge = () => {
    if (isPremium) return { icon: Crown, label: "Premium", bgClass: "bg-gradient-to-r from-amber-500 to-amber-600" };
    if (isVerified) return { icon: BadgeCheck, label: "Vérifié", bgClass: "bg-emerald-500" };
    if (isCurated) return { icon: Sparkles, label: "Sélection", bgClass: "bg-violet-500" };
    return null;
  };

  const badge = getBadge();

  return (
    <article
      className={cn(
        "group bg-white rounded-2xl overflow-hidden transition-all duration-300",
        "shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)]",
        "hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)]",
        "border",
        isSelected || isHighlighted
          ? "border-primary ring-2 ring-primary/30 scale-[1.02] shadow-[0_8px_30px_rgba(163,0,29,0.15)]"
          : "border-slate-100/80 hover:border-slate-200",
        "cursor-pointer"
      )}
      onClick={handleCardClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      {/* Image Section */}
      <div
        className="relative aspect-[16/10] overflow-hidden bg-slate-100"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Skeleton loader */}
        {!isImageLoaded && (
          <div
            className="absolute inset-0 animate-shimmer"
            style={{
              backgroundImage: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
              backgroundSize: "200% 100%",
            }}
          />
        )}

        {/* Image */}
        <img
          src={allImages[currentImageIndex] || "/placeholder.svg"}
          alt={name}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-all duration-500",
            "group-hover:scale-105",
            isImageLoaded ? "opacity-100" : "opacity-0"
          )}
          onClick={handleNavigate}
          onLoad={() => setIsImageLoaded(true)}
          loading="lazy"
        />

        {/* Subtle vignette gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10 pointer-events-none" />

        {/* Top-left badges */}
        <div className="absolute top-3 start-3 flex flex-col gap-2">
          {/* Premium/Verified/Curated badge */}
          {badge && (
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white text-xs font-semibold shadow-lg backdrop-blur-sm",
              badge.bgClass
            )}>
              <badge.icon className="w-3.5 h-3.5" />
              <span>{badge.label}</span>
            </div>
          )}

          {/* Promo badge */}
          {promoPercent > 0 && (
            <div className="bg-slate-900/90 backdrop-blur-sm text-white px-2.5 py-1.5 rounded-lg text-xs font-bold shadow-lg">
              Jusqu'à -{promoPercent} %
            </div>
          )}
        </div>

        {/* Favorite button */}
        <button
          onClick={handleFavoriteClick}
          className={cn(
            "absolute top-3 end-3 z-20",
            "w-9 h-9 rounded-full flex items-center justify-center",
            "bg-white/95 backdrop-blur-sm shadow-lg",
            "hover:bg-white hover:scale-110",
            "transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-primary/50"
          )}
          aria-label={isFavorite ? t("results.favorite.remove") : t("results.favorite.add")}
        >
          <Heart
            className={cn(
              "w-5 h-5 transition-all duration-200",
              isFavorite
                ? "text-primary fill-primary scale-110"
                : "text-slate-500 group-hover:text-slate-700"
            )}
          />
        </button>

        {/* Image carousel navigation (if multiple images) */}
        {allImages.length > 1 && (
          <>
            {/* Navigation arrows */}
            <button
              onClick={handlePrevImage}
              className={cn(
                "absolute start-3 top-1/2 -translate-y-1/2",
                "w-8 h-8 bg-white/95 backdrop-blur-sm rounded-full",
                "flex items-center justify-center",
                "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                "shadow-lg hover:scale-110",
                "focus:outline-none focus:opacity-100"
              )}
              aria-label="Image précédente"
            >
              <ChevronLeft className="w-5 h-5 text-slate-700" />
            </button>
            <button
              onClick={handleNextImage}
              className={cn(
                "absolute end-3 top-1/2 -translate-y-1/2",
                "w-8 h-8 bg-white/95 backdrop-blur-sm rounded-full",
                "flex items-center justify-center",
                "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                "shadow-lg hover:scale-110",
                "focus:outline-none focus:opacity-100"
              )}
              aria-label="Image suivante"
            >
              <ChevronRight className="w-5 h-5 text-slate-700" />
            </button>

            {/* Dots indicator */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {allImages.slice(0, 5).map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImageIndex(idx);
                  }}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-200",
                    idx === currentImageIndex
                      ? "bg-white w-4 shadow-sm"
                      : "bg-white/60 w-1.5 hover:bg-white/80"
                  )}
                  aria-label={`Image ${idx + 1}`}
                />
              ))}
              {allImages.length > 5 && (
                <span className="text-white/80 text-[10px] ms-1">+{allImages.length - 5}</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Content Section */}
      <div className="p-4">
        {/* Header: Name & Rating */}
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h3
            className={cn(
              "text-[17px] font-bold text-slate-900 leading-tight flex-1 min-w-0",
              "line-clamp-1 hover:text-primary transition-colors cursor-pointer"
            )}
            onClick={handleNavigate}
            style={{ fontFamily: "Circular Std, sans-serif" }}
          >
            {name}
          </h3>

          {/* Rating - Google style with star */}
          {typeof rating === "number" && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="text-sm font-bold text-slate-800 leading-none">
                {rating.toFixed(1)}
              </span>
              {typeof reviews === "number" && (
                <span className="text-xs text-slate-400">
                  ({reviews.toLocaleString()} avis)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 text-sm text-slate-600 mb-1">
          <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="truncate">{neighborhood}</span>
          {distanceText && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500 whitespace-nowrap font-medium">{distanceText}</span>
            </>
          )}
        </div>

        {/* Category & Price */}
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-sm text-slate-600 mb-3">
          {category && <span className="text-slate-700">{category}</span>}
          {category && avgPrice && <span className="text-slate-300">·</span>}
          {avgPrice && <span className="font-medium text-slate-700">{avgPrice}</span>}
        </div>

        {/* Review highlight - styled like TheFork */}
        {highlightReview && (
          <p className="text-sm text-slate-600 mb-3 italic line-clamp-1">
            "<span className="font-semibold text-slate-800">{highlightReview.split(" ")[0]}</span>{" "}
            {highlightReview.split(" ").slice(1).join(" ")}"
          </p>
        )}

        {/* Available time slots */}
        {bookingEnabled && (availableSlots.length > 0 || nextSlot) && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
            {availableSlots.length > 0 ? (
              availableSlots.slice(0, 4).map((slot, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`${detailsHref}?time=${encodeURIComponent(slot.time)}`);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center",
                    "px-4 py-2 min-w-[72px] rounded-xl",
                    "bg-slate-900 hover:bg-slate-800 text-white",
                    "transition-all duration-200 hover:scale-105",
                    "shadow-sm"
                  )}
                >
                  <span className="text-sm font-bold">{slot.time}</span>
                  {slot.discount && (
                    <span className="text-[11px] text-emerald-400 font-semibold">-{slot.discount}%</span>
                  )}
                </button>
              ))
            ) : nextSlot && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(detailsHref);
                }}
                className={cn(
                  "flex flex-col items-center justify-center",
                  "px-4 py-2 min-w-[72px] rounded-xl",
                  "bg-slate-900 hover:bg-slate-800 text-white",
                  "transition-all duration-200 hover:scale-105",
                  "shadow-sm"
                )}
              >
                <span className="text-sm font-bold">
                  {nextSlot.match(/(\d{1,2}[h:]\d{2}|\d{1,2}:\d{2})/)?.[0]?.replace("h", ":") || nextSlot}
                </span>
                {slotDiscount && (
                  <span className="text-[11px] text-emerald-400 font-semibold">-{slotDiscount}%</span>
                )}
              </button>
            )}
          </div>
        )}

        {/* Action button - when no slots available (hidden on results page for consistency) */}
        {!bookingEnabled && !hideActionButton && (
          <Button
            onClick={handleNavigate}
            className="w-full mt-3 h-11 text-sm font-semibold rounded-xl"
            variant="default"
          >
            {actionLabel || t("results.action.book")}
          </Button>
        )}
      </div>
    </article>
  );
});
