import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  tagline: string;
  logoImageSrc?: string;
  logoAlt?: string;
  heroImageSrc?: string;
  heroAlt?: string;
  bannerRight?: React.ReactNode;
  className?: string;
};

export const VenueHeader = React.memo(function VenueHeaderComponent({
  name,
  tagline,
  logoImageSrc,
  logoAlt,
  heroImageSrc,
  heroAlt,
  bannerRight,
  className,
}: Props) {
  return (
    <header className={cn("relative", className)}>
      {bannerRight ? (
        <div className="sticky top-0 z-50 bg-sam-red text-primary-foreground">
          <div className="flex h-11 items-center justify-center px-4">
            {bannerRight}
          </div>
        </div>
      ) : null}

      <div className="relative overflow-hidden">
        <div className="relative h-44 w-full">
          {heroImageSrc ? (
            <>
              <img
                src={heroImageSrc}
                alt={heroAlt ?? ""}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-sam-red/5 via-background to-sam-yellow/5" />
          )}
        </div>

        <div className="relative -mt-8 px-4 pb-5">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white ring-1 ring-black/5">
              {logoImageSrc ? (
                <img
                  src={logoImageSrc}
                  alt={logoAlt ?? "Logo"}
                  className="h-8 w-auto max-w-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="text-xs font-semibold text-gray-700">{name}</span>
              )}
            </div>



            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-foreground">
                {name}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {tagline}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
});
