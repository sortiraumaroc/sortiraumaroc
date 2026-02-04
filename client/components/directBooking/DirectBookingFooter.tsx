/**
 * DirectBookingFooter
 *
 * Mobile-optimized minimal footer for the direct booking page (book.sam.ma/:username).
 * Compact design with trust badges and link to main platform.
 */

import { ExternalLink, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function DirectBookingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-slate-200 py-4">
      <div className="max-w-lg mx-auto px-4">
        {/* Trust badges - Compact for mobile */}
        <div className="flex items-center justify-center gap-4 text-xs text-slate-600 mb-3">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-green-600" />
            Paiement securise
          </span>
          <span className="text-slate-300">|</span>
          <span className="flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-green-600" />
            Confirmation instantanee
          </span>
        </div>

        {/* Powered by SAM */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
          <span>Propulse par</span>
          <a
            href="https://sam.ma"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-1 font-semibold text-[#a3001d]",
              "min-h-[44px] px-2 -mx-2", // Touch target
              "hover:underline touch-manipulation"
            )}
          >
            Sortir Au Maroc
            <ExternalLink className="w-3 h-3" />
          </a>
          <span className="text-slate-300 mx-1">·</span>
          <span>{currentYear}</span>
        </div>
      </div>
    </footer>
  );
}
