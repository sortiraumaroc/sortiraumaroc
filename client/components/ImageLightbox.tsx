import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { createPortal } from "react-dom";

type ImageLightboxProps = {
  images: string[];
  initialIndex: number;
  alt?: string;
  onClose: () => void;
};

export function ImageLightbox({ images, initialIndex, alt, onClose }: ImageLightboxProps) {
  const [index, setIndex] = React.useState(initialIndex);
  const [touchStartX, setTouchStartX] = React.useState(0);
  const [touchStartY, setTouchStartY] = React.useState(0);
  const [dragOffsetX, setDragOffsetX] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);

  const count = images.length;

  const goNext = React.useCallback(() => {
    setIndex((i) => (i >= count - 1 ? 0 : i + 1));
  }, [count]);

  const goPrev = React.useCallback(() => {
    setIndex((i) => (i <= 0 ? count - 1 : i - 1));
  }, [count]);

  // Keyboard navigation
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, goNext, goPrev]);

  // Lock body scroll
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Touch handlers (swipe)
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
    setDragOffsetX(0);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = Math.abs(e.touches[0].clientY - touchStartY);
    // Only track horizontal swipe (not vertical scroll)
    if (dy < Math.abs(dx) * 1.5) {
      setDragOffsetX(dx);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    const threshold = 60;
    if (dragOffsetX < -threshold) goNext();
    else if (dragOffsetX > threshold) goPrev();
    setDragOffsetX(0);
  };

  // Mouse drag handlers (desktop)
  const [mouseStartX, setMouseStartX] = React.useState(0);
  const [isMouseDragging, setIsMouseDragging] = React.useState(false);
  const [mouseDragOffset, setMouseDragOffset] = React.useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start drag if clicking on nav buttons
    if ((e.target as HTMLElement).closest("button")) return;
    setIsMouseDragging(true);
    setMouseStartX(e.clientX);
    setMouseDragOffset(0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDragging) return;
    setMouseDragOffset(e.clientX - mouseStartX);
  };

  const handleMouseUp = () => {
    if (!isMouseDragging) return;
    setIsMouseDragging(false);
    const threshold = 60;
    if (mouseDragOffset < -threshold) goNext();
    else if (mouseDragOffset > threshold) goPrev();
    setMouseDragOffset(0);
  };

  const activeOffset = isDragging ? dragOffsetX : isMouseDragging ? mouseDragOffset : 0;

  // Close on backdrop click (not on image or buttons)
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const content = (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center select-none"
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { setIsMouseDragging(false); setMouseDragOffset(0); }}
      style={{ cursor: isMouseDragging ? "grabbing" : "grab" }}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 end-4 z-10 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
        aria-label="Fermer"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Counter */}
      {count > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-black/50 text-white px-4 py-1.5 rounded-full text-sm font-medium">
          {index + 1} / {count}
        </div>
      )}

      {/* Prev arrow (desktop) */}
      {count > 1 && (
        <button
          type="button"
          onClick={goPrev}
          className="absolute start-3 md:start-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          aria-label="Image précédente"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}

      {/* Next arrow (desktop) */}
      {count > 1 && (
        <button
          type="button"
          onClick={goNext}
          className="absolute end-3 md:end-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          aria-label="Image suivante"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}

      {/* Image with swipe offset — cropped square 800x800 */}
      <div
        className="w-full h-full flex items-center justify-center px-4 md:px-20"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="w-[min(800px,90vw)] h-[min(800px,90vw)] max-h-[85vh] rounded-lg overflow-hidden flex-shrink-0"
          style={{
            transform: activeOffset ? `translateX(${activeOffset}px)` : undefined,
            transition: activeOffset ? "none" : "transform 0.2s ease-out",
          }}
        >
          <img
            src={images[index]}
            alt={alt || ""}
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        </div>
      </div>

      {/* Thumbnail strip */}
      {count > 1 && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4 overflow-x-auto">
          {images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setIndex(idx)}
              className={`h-12 w-12 md:h-14 md:w-14 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${
                idx === index
                  ? "border-white opacity-100 scale-110"
                  : "border-transparent opacity-50 hover:opacity-80"
              }`}
              aria-label={`Image ${idx + 1}`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
