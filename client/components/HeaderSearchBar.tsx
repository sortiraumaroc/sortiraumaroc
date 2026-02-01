import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, MapPin, Calendar, Clock, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { readSearchState } from "@/lib/searchState";
import { cn } from "@/lib/utils";

interface HeaderSearchBarProps {
  className?: string;
}

export function HeaderSearchBar({ className }: HeaderSearchBarProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);

  // Get current search state for display
  const searchState = readSearchState();

  // Build display parts with icons
  const buildDisplayParts = () => {
    const parts: { icon: React.ReactNode; text: string }[] = [];

    // City
    if (searchState.city && searchState.city.trim()) {
      parts.push({
        icon: <MapPin className="w-3.5 h-3.5" />,
        text: searchState.city,
      });
    }

    // Date
    if (searchState.date) {
      try {
        const date = new Date(searchState.date);
        parts.push({
          icon: <Calendar className="w-3.5 h-3.5" />,
          text: date.toLocaleDateString("fr", { day: "numeric", month: "short" }),
        });
      } catch {
        // ignore
      }
    }

    // Time
    if (searchState.time) {
      parts.push({
        icon: <Clock className="w-3.5 h-3.5" />,
        text: searchState.time,
      });
    }

    // Guests
    if (searchState.guests && searchState.guests > 0) {
      parts.push({
        icon: <Users className="w-3.5 h-3.5" />,
        text: `${searchState.guests}`,
      });
    }

    return parts;
  };

  const parts = buildDisplayParts();
  const hasContent = parts.length > 0;

  const handleClick = () => {
    // If on results page, scroll to search bar
    if (location.pathname.includes("/results")) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Navigate to home page to use the full search form
    navigate("/");
    // Scroll to top after a small delay
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Compact Search Bar */}
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex items-center gap-3 h-10 px-4 rounded-full transition-all",
          "bg-white/15 hover:bg-white/25 border border-white/30",
          "text-white text-sm font-medium",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        )}
      >
        <Search className="w-4 h-4 flex-shrink-0 text-white" />

        {hasContent ? (
          <div className="flex items-center gap-3">
            {parts.map((part, index) => (
              <span key={index} className="flex items-center gap-1.5 text-white">
                {part.icon}
                <span className="truncate max-w-[80px]">{part.text}</span>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-white/80">{t("search.field.city.placeholder")}</span>
        )}
      </button>
    </div>
  );
}
