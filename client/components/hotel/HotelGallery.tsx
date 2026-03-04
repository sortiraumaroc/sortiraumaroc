import * as React from "react";
import { ChevronLeft, ChevronRight, Flag, Heart, Share2 } from "lucide-react";

import { ImageLightbox } from "@/components/ImageLightbox";
import { IconButton } from "@/components/ui/icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";

type HotelGalleryProps = {
  name: string;
  images: string[];
  onReport?: () => void;
};

export function HotelGallery({ name, images, onReport }: HotelGalleryProps) {
  const { t } = useI18n();
  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);
  const [isFavorited, setIsFavorited] = React.useState(false);
  const [showShareMenu, setShowShareMenu] = React.useState(false);
  const [touchStartX, setTouchStartX] = React.useState(0);
  const [mouseStartX, setMouseStartX] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const isDraggingRef = React.useRef(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);

  const safeImages = Array.isArray(images) ? images.filter(Boolean) : [];

  const nextImage = React.useCallback(() => {
    if (safeImages.length <= 1) return;
    setCurrentImageIndex((prev) => (prev === safeImages.length - 1 ? 0 : prev + 1));
  }, [safeImages.length]);

  const prevImage = React.useCallback(() => {
    if (safeImages.length <= 1) return;
    setCurrentImageIndex((prev) => (prev === 0 ? safeImages.length - 1 : prev - 1));
  }, [safeImages.length]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setTouchStartX(e.touches[0]?.clientX ?? 0);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const touchEndX = e.changedTouches[0]?.clientX ?? 0;
    const diff = touchStartX - touchEndX;
    const minSwipeDistance = 50;

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0) nextImage();
      else prevImage();
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    isDraggingRef.current = true;
    setMouseStartX(e.clientX);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const diff = mouseStartX - e.clientX;
    const minSwipeDistance = 50;
    const wasDragged = Math.abs(diff) > minSwipeDistance;

    setIsDragging(false);
    isDraggingRef.current = wasDragged;

    if (wasDragged) {
      if (diff > 0) nextImage();
      else prevImage();
      // Reset ref after a tick so the click handler sees the correct value
      requestAnimationFrame(() => { isDraggingRef.current = false; });
    }
  };

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  // Native share for mobile devices
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: name,
          text: `${name} – Sortir Au Maroc`,
          url: pageUrl,
        });
      } catch (err) {
        // User cancelled or error - fallback to menu
        if ((err as Error).name !== "AbortError") {
          setShowShareMenu(true);
        }
      }
    } else {
      setShowShareMenu(true);
    }
  };

  // Handle share button click - use native share if available
  const handleShareButtonClick = () => {
    if (navigator.share) {
      handleNativeShare();
    } else {
      setShowShareMenu((v) => !v);
    }
  };

  const handleShare = (platform: "copy" | "facebook" | "whatsapp" | "x" | "email") => {
    if (!pageUrl) return;

    const text = `${name} – Sortir Au Maroc`;

    switch (platform) {
      case "facebook":
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`, "_blank", "width=600,height=400");
        break;
      case "x":
        window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(text)}`, "_blank", "width=600,height=400");
        break;
      case "whatsapp":
        window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + pageUrl)}`, "_blank");
        break;
      case "email":
        window.open(`mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(pageUrl)}`);
        break;
      case "copy":
        navigator.clipboard.writeText(pageUrl);
        break;
    }

    setShowShareMenu(false);
  };

  if (!safeImages.length) {
    return (
      <div className="relative bg-slate-100 h-72 md:h-96 overflow-hidden">
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-slate-600 text-sm">Aucune image disponible</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative bg-black h-80 md:h-96 overflow-hidden cursor-grab active:cursor-grabbing"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { setIsDragging(false); isDraggingRef.current = false; }}
    >
      <img
        src={safeImages[currentImageIndex]}
        alt={name}
        className="w-full h-full object-cover cursor-pointer"
        onClick={() => !isDraggingRef.current && setLightboxOpen(true)}
      />

      {safeImages.length > 1 ? (
        <>
          <IconButton
            onClick={prevImage}
            className="absolute start-4 top-1/2 -translate-y-1/2 z-10"
            aria-label="Image précédente"
          >
            <ChevronLeft className="w-6 h-6" />
          </IconButton>
          <IconButton
            onClick={nextImage}
            className="absolute end-4 top-1/2 -translate-y-1/2 z-10"
            aria-label="Image suivante"
          >
            <ChevronRight className="w-6 h-6" />
          </IconButton>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
            {currentImageIndex + 1} / {safeImages.length}
          </div>

          <div className="absolute bottom-0 left-0 right-0 bg-black/30 p-2 flex gap-2 overflow-x-auto">
            {safeImages.map((img, idx) => (
              <button
                key={img + idx}
                type="button"
                onClick={() => { setCurrentImageIndex(idx); setLightboxOpen(true); }}
                className={`h-12 w-12 rounded overflow-hidden flex-shrink-0 border-2 ${idx === currentImageIndex ? "border-white" : "border-transparent"}`}
                aria-label={`Voir l'image ${idx + 1}`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </>
      ) : null}

      <TooltipProvider>
        <div className="absolute top-4 end-4 flex gap-2 z-20">
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                onClick={() => setIsFavorited((v) => !v)}
                aria-label={isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
              >
                <Heart className={`w-6 h-6 transition ${isFavorited ? "fill-[#a3001d] text-[#a3001d]" : "text-slate-400"}`} />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
            </TooltipContent>
          </Tooltip>

          <div className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  onClick={handleShareButtonClick}
                  aria-label="Partager"
                >
                  <Share2 className="w-6 h-6 text-slate-400" />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Partager
              </TooltipContent>
            </Tooltip>

            {showShareMenu ? (
              <div className="absolute top-full end-0 mt-2 bg-white rounded-lg shadow-lg border border-slate-200 z-50 min-w-52 overflow-hidden">
                <button type="button" onClick={() => handleShare("facebook")} className="w-full text-start px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                  f Facebook
                </button>
                <button type="button" onClick={() => handleShare("x")} className="w-full text-start px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                  𝕏 X
                </button>
                <button type="button" onClick={() => handleShare("whatsapp")} className="w-full text-start px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                  💬 WhatsApp
                </button>
                <button type="button" onClick={() => handleShare("email")} className="w-full text-start px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                  ✉️ Email
                </button>
                <button
                  type="button"
                  onClick={() => handleShare("copy")}
                  className="w-full text-start px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm border-t border-slate-200"
                >
                  🔗 Copier le lien
                </button>
              </div>
            ) : null}
          </div>

          {/* Report button - discreet placement */}
          {onReport && (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  onClick={onReport}
                  aria-label={t("report.button_tooltip")}
                  className="opacity-60 hover:opacity-100"
                >
                  <Flag className="w-5 h-5 text-slate-400" />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Signaler
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>

      {lightboxOpen && (
        <ImageLightbox
          images={safeImages}
          initialIndex={currentImageIndex}
          alt={name}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
