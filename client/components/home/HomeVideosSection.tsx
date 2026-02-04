import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, X, MapPin } from "lucide-react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { getPublicHomeVideos, type PublicHomeVideo } from "@/lib/publicApi";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

type HomeVideosSectionProps = {
  className?: string;
};

// Extract YouTube video ID from various URL formats
function getYoutubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&?\s]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

// Get YouTube thumbnail URL
function getYoutubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

type VideoPlayerModalProps = {
  videoId: string;
  title: string;
  onClose: () => void;
  isFullscreen?: boolean;
};

function VideoPlayerModal({ videoId, title, onClose, isFullscreen = false }: VideoPlayerModalProps) {
  const [showFullscreen, setShowFullscreen] = useState(isFullscreen);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showFullscreen) {
          setShowFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, showFullscreen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const content = (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        showFullscreen ? "bg-black" : "bg-black/80 p-4"
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget && !showFullscreen) {
          onClose();
        }
      }}
    >
      <div
        ref={containerRef}
        className={cn(
          "relative bg-black rounded-lg overflow-hidden",
          showFullscreen ? "w-full h-full" : "w-full max-w-3xl aspect-video"
        )}
      >
        {/* Close button - red circle with white X on mobile fullscreen, normal button otherwise */}
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "absolute z-10 flex items-center justify-center transition-opacity hover:opacity-80",
            showFullscreen
              ? "top-4 right-4 w-12 h-12 bg-red-600 rounded-full shadow-lg"
              : "top-2 right-2 w-8 h-8 bg-black/50 rounded-full"
          )}
          aria-label="Fermer"
        >
          <X className={cn("text-white", showFullscreen ? "w-6 h-6" : "w-5 h-5")} />
        </button>

        {/* Fullscreen toggle button (only on non-fullscreen modal on desktop) */}
        {!showFullscreen && (
          <button
            type="button"
            onClick={() => setShowFullscreen(true)}
            className="absolute top-2 left-2 z-10 px-3 py-1.5 bg-black/50 rounded text-white text-sm hover:bg-black/70 transition hidden md:block"
          >
            Plein ecran
          </button>
        )}

        {/* YouTube iframe */}
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          title={title}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

type VideoCardProps = {
  video: PublicHomeVideo;
  onClick: () => void;
};

function VideoCard({ video, onClick }: VideoCardProps) {
  const videoId = getYoutubeVideoId(video.youtube_url);
  const [isHovering, setIsHovering] = useState(false);

  if (!videoId) return null;

  // Use custom thumbnail if available, otherwise YouTube thumbnail
  const thumbnailUrl = video.thumbnail_url || getYoutubeThumbnail(videoId);

  // Build establishment URL using slug if available, or generate from name
  const establishmentUrl = video.establishment_id
    ? buildEstablishmentUrl({
        id: video.establishment_id,
        slug: video.establishment_slug,
        name: video.establishment_name,
        universe: video.establishment_universe,
      })
    : null;

  return (
    <div className="flex-shrink-0 w-64 sm:w-72 md:w-80">
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        className="group relative w-full aspect-video rounded-xl overflow-hidden bg-slate-900 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        {/* Thumbnail */}
        <img
          src={thumbnailUrl}
          alt={video.title}
          className={cn(
            "w-full h-full object-cover transition-transform duration-300",
            isHovering && "scale-105"
          )}
        />

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Play button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "w-16 h-16 rounded-full bg-red-600 flex items-center justify-center transition-transform duration-200 shadow-lg",
              isHovering && "scale-110"
            )}
          >
            <Play className="w-7 h-7 text-white fill-white ml-1" />
          </div>
        </div>

        {/* Title overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-white font-semibold text-sm md:text-base line-clamp-2 text-left drop-shadow-lg">
            {video.title}
          </h3>
          {video.description && (
            <p className="text-white/80 text-xs mt-1 line-clamp-1 text-left">
              {video.description}
            </p>
          )}
        </div>
      </button>

      {/* Establishment link - shown below the video card */}
      {establishmentUrl && video.establishment_name && (
        <Link
          to={establishmentUrl}
          className="flex items-center gap-2 mt-2 px-1 py-1.5 text-sm text-primary hover:text-primary/80 transition-colors group/link"
          onClick={(e) => e.stopPropagation()}
        >
          <MapPin className="w-4 h-4 flex-shrink-0" />
          <span className="truncate group-hover/link:underline">{video.establishment_name}</span>
        </Link>
      )}
    </div>
  );
}

export function HomeVideosSection({ className }: HomeVideosSectionProps) {
  const [videos, setVideos] = useState<PublicHomeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<PublicHomeVideo | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch videos
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await getPublicHomeVideos();
        if (!cancelled) {
          setVideos(res.videos ?? []);
        }
      } catch {
        // Silently fail - section just won't show
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  // Check scroll state
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", updateScrollState);
      window.addEventListener("resize", updateScrollState);
      return () => {
        el.removeEventListener("scroll", updateScrollState);
        window.removeEventListener("resize", updateScrollState);
      };
    }
  }, [videos, updateScrollState]);

  const scroll = useCallback((direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = 320; // approximate card width + gap
    const scrollAmount = cardWidth * 2;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  }, []);

  const handleVideoClick = useCallback((video: PublicHomeVideo) => {
    setSelectedVideo(video);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedVideo(null);
  }, []);

  // Don't render if no videos or loading
  if (loading || videos.length === 0) {
    return null;
  }

  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground">
          Vidéos
        </h2>
        <div className="flex items-center gap-2">
          <IconButton
            variant="floating"
            size="sm"
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className="hidden sm:flex"
          >
            <ChevronLeft className="w-4 h-4" />
          </IconButton>
          <IconButton
            variant="floating"
            size="sm"
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className="hidden sm:flex"
          >
            <ChevronRight className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {videos.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            onClick={() => handleVideoClick(video)}
          />
        ))}
      </div>

      {/* Video player modal */}
      {selectedVideo && getYoutubeVideoId(selectedVideo.youtube_url) && (
        <VideoPlayerModal
          videoId={getYoutubeVideoId(selectedVideo.youtube_url)!}
          title={selectedVideo.title}
          onClose={handleCloseModal}
          isFullscreen={isMobile}
        />
      )}
    </section>
  );
}
