function hasAnyOpenRadixDialog(): boolean {
  if (typeof document === "undefined") return false;
  // Radix Dialog/AlertDialog/Sheet contents render a DismissableLayer with role="dialog" and data-state.
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

function removeOrphanedOverlays(): void {
  if (typeof document === "undefined") return;

  // Find all Radix dialog overlays that don't have an open dialog sibling
  const overlays = document.querySelectorAll('[data-radix-dialog-overlay], [data-state="open"].fixed.inset-0.z-50.bg-black\\/80');

  overlays.forEach((overlay) => {
    // Check if there's a corresponding open dialog content
    const parent = overlay.parentElement;
    if (parent) {
      const hasOpenDialog = parent.querySelector('[role="dialog"][data-state="open"]');
      if (!hasOpenDialog) {
        overlay.remove();
      }
    }
  });

  // Also remove any orphaned portals with only overlays
  const portals = document.querySelectorAll('[data-radix-portal]');
  portals.forEach((portal) => {
    const hasOpenDialog = portal.querySelector('[role="dialog"][data-state="open"]');
    if (!hasOpenDialog && portal.children.length <= 1) {
      // Only an overlay or empty - remove it
      portal.remove();
    }
  });
}

export function cleanupStaleRadixScrollLock(): void {
  if (typeof document === "undefined") return;

  // First, try to remove orphaned overlays
  removeOrphanedOverlays();

  if (hasAnyOpenRadixDialog()) return;

  const body = document.body;
  const html = document.documentElement;

  // react-remove-scroll / remove-scroll-bar markers
  body.classList.remove("remove-scroll-bar");
  html.classList.remove("remove-scroll-bar");

  body.removeAttribute("data-scroll-locked");
  html.removeAttribute("data-scroll-locked");

  body.style.removeProperty("--removed-body-scroll-bar-size");
  html.style.removeProperty("--removed-body-scroll-bar-size");

  // Common stuck styles that prevent scrolling / interactions
  body.style.overflow = "";
  body.style.paddingRight = "";
  body.style.marginRight = "";
  body.style.pointerEvents = "";

  html.style.overflow = "";
  html.style.paddingRight = "";
  html.style.marginRight = "";
  html.style.pointerEvents = "";
}

export function scheduleRadixScrollLockCleanup(): void {
  if (typeof window === "undefined") return;

  // Run after Radix updates open state / unmounts and after any exit animations.
  window.setTimeout(() => cleanupStaleRadixScrollLock(), 0);
  window.requestAnimationFrame(() => cleanupStaleRadixScrollLock());
}
