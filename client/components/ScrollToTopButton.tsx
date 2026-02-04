import * as React from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Floating "scroll to top" button - visible only on mobile when scrolled down
 */
export function ScrollToTopButton() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      // Show button when scrolled more than 400px
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      setVisible(scrollY > 400);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Remonter en haut de la page"
      className={cn(
        // Base styles
        "fixed z-40 flex items-center justify-center",
        "w-12 h-12 rounded-full",
        "bg-primary text-white shadow-lg",
        "transition-all duration-300 ease-in-out",
        "hover:bg-primary/90 active:scale-95",
        // Position: bottom right, above the sticky booking bar
        "bottom-36 right-4",
        // Only show on mobile (hidden on md and up)
        "md:hidden",
        // Visibility based on scroll
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-4 pointer-events-none"
      )}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
