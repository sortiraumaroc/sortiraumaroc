import * as React from "react";

/**
 * Hook to track which section is currently visible in the viewport
 * @param sectionIds - Array of section IDs to observe
 * @param options - IntersectionObserver options (threshold, rootMargin, etc.)
 * @returns The ID of the currently visible section
 */
export function useScrollSpy(
  sectionIds: string[],
  options: IntersectionObserverInit = {}
): string | null {
  const [visibleId, setVisibleId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (sectionIds.length === 0) return;

    const defaultOptions: IntersectionObserverInit = {
      root: null,
      rootMargin: "-50% 0px -50% 0px", // Trigger when section is in middle of viewport
      threshold: 0,
      ...options,
    };

    const observer = new IntersectionObserver((entries) => {
      // Find the first visible entry
      const visibleEntry = entries.find((entry) => entry.isIntersecting);
      if (visibleEntry) {
        setVisibleId(visibleEntry.target.id);
      }
    }, defaultOptions);

    // Observe all sections
    sectionIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [sectionIds, options]);

  return visibleId;
}
