import * as React from "react";

export type BookingBarsVisibilityOptions = {
  /**
   * When provided, offsets the viewport used by the IntersectionObserver.
   * Example: "-64px 0px 0px 0px" to account for a sticky header.
   */
  rootMargin?: string;
  /**
   * Threshold used to mark the element as visible.
   * Use a low value so any visibility hides the bottom bar.
   */
  threshold?: number | number[];
  /**
   * Initial value used before the observer runs.
   * Default: true (safer to avoid showing both CTAs).
   */
  initialVisible?: boolean;
};

export function useBookingBarsVisibility(
  topBookingRef: React.RefObject<Element | null>,
  options: BookingBarsVisibilityOptions = {},
) {
  const { rootMargin, threshold = 0.01, initialVisible = true } = options;
  const [isTopBookingVisible, setIsTopBookingVisible] = React.useState<boolean>(initialVisible);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const el = topBookingRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      // Old browsers: keep the safe default (hide bottom bar).
      setIsTopBookingVisible(initialVisible);
      return;
    }

    let mounted = true;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!mounted) return;
        const entry = entries[0];
        setIsTopBookingVisible(Boolean(entry?.isIntersecting));
      },
      {
        root: null,
        rootMargin,
        threshold,
      },
    );

    observer.observe(el);

    return () => {
      mounted = false;
      observer.disconnect();
    };
  }, [initialVisible, rootMargin, threshold, topBookingRef]);

  return { isTopBookingVisible } as const;
}
