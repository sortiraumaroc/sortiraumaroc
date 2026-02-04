/**
 * DirectBookingHeader
 *
 * Mobile-optimized minimal header for the direct booking page (book.sam.ma/:username).
 * Shows SAM logo and establishment name with safe area support.
 */

import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type Props = {
  establishmentName: string | null;
  establishmentUsername: string | null;
};

export function DirectBookingHeader({ establishmentName, establishmentUsername }: Props) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50",
        "bg-white/95 backdrop-blur-sm border-b border-slate-200",
        "pt-[env(safe-area-inset-top)]" // iOS safe area for notch
      )}
    >
      <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
        {/* SAM Logo - Touch optimized */}
        <Link
          to="/"
          className={cn(
            "flex items-center gap-2 text-[#a3001d]",
            "min-h-[44px] min-w-[44px]", // iOS tap target
            "hover:opacity-80 transition-opacity touch-manipulation"
          )}
          title="Sortir Au Maroc"
        >
          <svg
            viewBox="0 0 40 40"
            className="h-9 w-9"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="20" cy="20" r="18" fill="currentColor" />
            <text
              x="20"
              y="26"
              textAnchor="middle"
              fill="white"
              fontSize="14"
              fontWeight="bold"
              fontFamily="system-ui, sans-serif"
            >
              SAM
            </text>
          </svg>
          <span className="hidden sm:inline text-sm font-medium text-slate-700">
            Sortir Au Maroc
          </span>
        </Link>

        {/* Establishment Name */}
        <div className="flex items-center gap-2 text-right max-w-[60%]">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {establishmentName || "Etablissement"}
            </div>
            {establishmentUsername && (
              <div className="text-xs text-slate-500 truncate">
                @{establishmentUsername}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
