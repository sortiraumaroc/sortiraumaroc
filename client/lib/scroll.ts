type ScrollBehaviorSetting = ScrollBehavior;

function getDefaultScrollBehavior(): ScrollBehaviorSetting {
  if (typeof window === "undefined") return "auto";
  const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (media?.matches) return "auto";
  return "smooth";
}

export function scrollElementIntoCenterX(
  container: HTMLElement,
  element: HTMLElement,
  options?: {
    behavior?: ScrollBehaviorSetting;
    padding?: number;
  },
) {
  const behavior = options?.behavior ?? getDefaultScrollBehavior();
  const padding = options?.padding ?? 8;

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const currentLeft = container.scrollLeft;
  const elementLeftInContainer = elementRect.left - containerRect.left + currentLeft;

  const targetLeft =
    elementLeftInContainer - (containerRect.width / 2 - elementRect.width / 2) - padding;

  const maxLeft = container.scrollWidth - containerRect.width;
  const nextLeft = Math.max(0, Math.min(maxLeft, targetLeft));

  container.scrollTo({ left: nextLeft, behavior });
}
