import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Play, X, MapPin, LayoutGrid, List, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";

import { getPublicHomeVideos, type PublicHomeVideo } from "@/lib/publicApi";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { applySeo } from "@/lib/seo";

// Default videos hero settings
const DEFAULT_VIDEOS_HERO = {
  title: "Vidéos",
  subtitle: "Découvrez les meilleurs établissements du Maroc à travers nos vidéos exclusives.",
  background_image_url: null as string | null,
  overlay_opacity: 0.7,
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

// Get YouTube thumbnail URL (higher quality for video page)
function getYoutubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

type VideoPlayerModalProps = {
  videoId: string;
  title: string;
  onClose: () => void;
};

function VideoPlayerModal({ videoId, title, onClose }: VideoPlayerModalProps) {
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-lg hover:bg-red-700 transition-colors"
          aria-label="Fermer"
        >
          <X className="w-6 h-6 text-white" />
        </button>

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

// Featured Video Card (large, like blog featured article)
function FeaturedVideoCard({ video, locale, onPlay }: { video: PublicHomeVideo; locale: string; onPlay: () => void }) {
  const videoId = getYoutubeVideoId(video.youtube_url);
  if (!videoId) return null;

  const thumbnailUrl = video.thumbnail_url || getYoutubeThumbnail(videoId);
  const establishmentUrl = video.establishment_id
    ? buildEstablishmentUrl({
        id: video.establishment_id,
        slug: video.establishment_slug,
        name: video.establishment_name,
        universe: video.establishment_universe,
      })
    : null;

  return (
    <div className="group block rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 hover:shadow-lg transition-all">
      <div className="grid md:grid-cols-2 gap-0">
        <button
          type="button"
          onClick={onPlay}
          className="relative aspect-[16/10] md:aspect-auto bg-slate-100 overflow-hidden focus:outline-none"
        >
          <img
            src={thumbnailUrl}
            alt={video.title}
            className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            loading="lazy"
          />
          {/* Play overlay */}
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
            <div className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
              <Play className="w-8 h-8 text-white fill-white ml-1" />
            </div>
          </div>
        </button>

        <div className="flex flex-col p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-extrabold text-foreground leading-tight line-clamp-3 group-hover:text-primary transition-colors">
            {video.title}
          </h2>

          {video.description && (
            <p className="mt-3 text-slate-600 line-clamp-3 flex-1">{video.description}</p>
          )}

          {establishmentUrl && video.establishment_name && (
            <Link
              to={establishmentUrl}
              className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin className="w-4 h-4" />
              <span className="font-medium hover:underline">{video.establishment_name}</span>
            </Link>
          )}

          <button
            type="button"
            onClick={onPlay}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary group-hover:gap-3 transition-all"
          >
            <span>{locale === "en" ? "Watch video" : "Regarder la vidéo"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Video Card Grid (like blog article card)
function VideoCardGrid({ video, locale, onPlay }: { video: PublicHomeVideo; locale: string; onPlay: () => void }) {
  const videoId = getYoutubeVideoId(video.youtube_url);
  if (!videoId) return null;

  const thumbnailUrl = video.thumbnail_url || getYoutubeThumbnail(videoId);
  const establishmentUrl = video.establishment_id
    ? buildEstablishmentUrl({
        id: video.establishment_id,
        slug: video.establishment_slug,
        name: video.establishment_name,
        universe: video.establishment_universe,
      })
    : null;

  return (
    <div className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 hover:shadow-md transition-all">
      <button
        type="button"
        onClick={onPlay}
        className="relative aspect-[16/9] bg-slate-100 overflow-hidden focus:outline-none"
      >
        <img
          src={thumbnailUrl}
          alt={video.title}
          className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          loading="lazy"
        />
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
          <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
            <Play className="w-7 h-7 text-white fill-white ml-1" />
          </div>
        </div>
      </button>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-bold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {video.title}
        </h3>

        {video.description && (
          <p className="mt-2 text-sm text-slate-600 line-clamp-2 flex-1">{video.description}</p>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          {establishmentUrl && video.establishment_name ? (
            <Link
              to={establishmentUrl}
              className="flex items-center gap-1 text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin className="h-3.5 w-3.5" />
              <span className="truncate max-w-[120px]">{video.establishment_name}</span>
            </Link>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onPlay}
            className="inline-flex items-center gap-1 font-semibold text-primary group-hover:gap-1.5 transition-all"
          >
            {locale === "en" ? "Watch" : "Voir"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Video Card List (like blog article list)
function VideoCardList({ video, locale, onPlay }: { video: PublicHomeVideo; locale: string; onPlay: () => void }) {
  const videoId = getYoutubeVideoId(video.youtube_url);
  if (!videoId) return null;

  const thumbnailUrl = video.thumbnail_url || getYoutubeThumbnail(videoId);
  const establishmentUrl = video.establishment_id
    ? buildEstablishmentUrl({
        id: video.establishment_id,
        slug: video.establishment_slug,
        name: video.establishment_name,
        universe: video.establishment_universe,
      })
    : null;

  return (
    <div className="group flex rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 hover:shadow-md transition-all">
      <button
        type="button"
        onClick={onPlay}
        className="relative w-48 md:w-64 flex-shrink-0 bg-slate-100 overflow-hidden focus:outline-none"
      >
        <img
          src={thumbnailUrl}
          alt={video.title}
          className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          loading="lazy"
        />
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
          <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      </button>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-3 mb-2">
          {establishmentUrl && video.establishment_name && (
            <Link
              to={establishmentUrl}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin className="h-3.5 w-3.5" />
              {video.establishment_name}
            </Link>
          )}
        </div>

        <h3 className="font-bold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {video.title}
        </h3>

        {video.description && (
          <p className="mt-2 text-sm text-slate-600 line-clamp-2 flex-1">{video.description}</p>
        )}

        <div className="mt-3 flex items-center justify-end text-xs text-slate-500">
          <button
            type="button"
            onClick={onPlay}
            className="inline-flex items-center gap-1 font-semibold text-primary group-hover:gap-1.5 transition-all"
          >
            {locale === "en" ? "Watch video" : "Regarder la vidéo"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VideosPage() {
  const { t, locale } = useI18n();
  const [videos, setVideos] = useState<PublicHomeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<PublicHomeVideo | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Hero settings
  const [heroSettings, setHeroSettings] = useState(DEFAULT_VIDEOS_HERO);

  // SEO
  useEffect(() => {
    applySeo({
      title: `${heroSettings.title || t("videos.page.title")} — Sortir Au Maroc`,
      description: heroSettings.subtitle || t("videos.page.subtitle"),
      ogType: "website",
    });
  }, [t, locale, heroSettings]);

  // Load videos hero settings from localStorage (set via admin)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("sam_videos_hero");
      if (stored) {
        const parsed = JSON.parse(stored);
        setHeroSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore
    }
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
        // Silently fail
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

  const handlePlayVideo = useCallback((video: PublicHomeVideo) => {
    setSelectedVideo(video);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedVideo(null);
  }, []);

  const featured = videos[0] ?? null;
  const rest = videos.slice(1);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />

      {/* Hero Section - Same style as Blog */}
      <section className="relative text-white py-12 md:py-16">
        {/* Background: Image or Gradient */}
        {heroSettings.background_image_url ? (
          <>
            <img
              src={heroSettings.background_image_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 bg-gradient-to-r from-primary to-[#6a000f]"
              style={{ opacity: heroSettings.overlay_opacity ?? 0.7 }}
              aria-hidden="true"
            />
          </>
        ) : (
          <div
            className="absolute inset-0 bg-gradient-to-r from-primary to-[#6a000f]"
            aria-hidden="true"
          />
        )}

        {/* Content */}
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-left max-w-3xl">
            <h1 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">
              {heroSettings.title || t("videos.page.title")}
            </h1>
            <p className="text-lg text-white/90 max-w-2xl">
              {heroSettings.subtitle || t("videos.page.subtitle")}
            </p>
          </div>
        </div>
      </section>

      <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !videos.length ? (
          <div className="max-w-xl mx-auto">
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 mb-4">
                <Play className="h-8 w-8 text-slate-400" />
              </div>
              <div className="font-bold text-foreground text-lg">{t("videos.page.empty_title")}</div>
              <div className="mt-2 text-slate-600">{t("videos.page.empty_description")}</div>
              <Link to="/" className="inline-block mt-6">
                <Button>{t("blog.index.back_home")}</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Featured Video */}
            {featured && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                    {locale === "en" ? "Featured" : "À la une"}
                  </h2>
                </div>
                <FeaturedVideoCard
                  video={featured}
                  locale={locale}
                  onPlay={() => handlePlayVideo(featured)}
                />
              </section>
            )}

            {/* Rest of Videos */}
            {rest.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                      {locale === "en" ? "All videos" : "Toutes les vidéos"}
                    </h2>
                    <span className="text-sm text-slate-500">
                      {videos.length} vidéo{videos.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={cn(
                        "p-2 rounded-md transition-all",
                        viewMode === "grid"
                          ? "bg-white text-primary shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      )}
                      title={locale === "en" ? "Grid view" : "Vue colonnes"}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={cn(
                        "p-2 rounded-md transition-all",
                        viewMode === "list"
                          ? "bg-white text-primary shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      )}
                      title={locale === "en" ? "List view" : "Vue liste"}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {rest.map((video) => (
                      <VideoCardGrid
                        key={video.id}
                        video={video}
                        locale={locale}
                        onPlay={() => handlePlayVideo(video)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {rest.map((video) => (
                      <VideoCardList
                        key={video.id}
                        video={video}
                        locale={locale}
                        onPlay={() => handlePlayVideo(video)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Back home */}
            <div className="pt-6 border-t border-slate-200">
              <Link to="/" className="inline-flex">
                <Button variant="outline">{t("blog.index.back_home")}</Button>
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Video player modal */}
      {selectedVideo && getYoutubeVideoId(selectedVideo.youtube_url) && (
        <VideoPlayerModal
          videoId={getYoutubeVideoId(selectedVideo.youtube_url)!}
          title={selectedVideo.title}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
