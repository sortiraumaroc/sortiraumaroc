import * as React from "react";

import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

const SortirAuMarocLogo = React.memo(function SortirAuMarocLogoComponent(
  { className }: { className?: string },
) {
  return (
    <img
      src="/logo_sam.webp"
      alt="Sortir Au Maroc"
      loading="lazy"
      decoding="async"
      className={cn("h-6 w-6 rounded-sm object-contain", className)}
      width={24}
      height={24}
    />
  );
});

export const SiteFooter = React.memo(function SiteFooterComponent(
  { className }: { className?: string },
) {
  return (
    <footer
      className={cn(
        "mt-6 border-t border-white/10 bg-black",
        "px-4 py-4",
        className,
      )}
    >
      <div className="w-full">
        <div className="flex items-center justify-center gap-2">
          <span className="text-[11px] font-medium text-white/70">Propulsé par</span>
          <span className="text-[13px] font-semibold tracking-tight text-white">Sortir Au Maroc</span>
        </div>


      </div>
    </footer>
  );
});
