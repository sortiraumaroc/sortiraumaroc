import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

interface ScrollContextValue {
  /** Whether we've scrolled past the hero search form */
  isScrolledPastSearch: boolean;
  /** Manually set scroll state (for pages that don't have a search form) */
  setScrolledPastSearch: (value: boolean) => void;
  /** Register a ref to the search form element */
  registerSearchFormRef: (ref: HTMLElement | null) => void;
  /** Current scroll Y position */
  scrollY: number;
  /** Whether the search bar should always be shown in the header (e.g. Results page) */
  alwaysShowSearchBar: boolean;
  /** Set whether search bar should always be shown */
  setAlwaysShowSearchBar: (value: boolean) => void;
}

const ScrollContext = createContext<ScrollContextValue | null>(null);

export function ScrollProvider({ children }: { children: React.ReactNode }) {
  const [isScrolledPastSearch, setIsScrolledPastSearch] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [alwaysShowSearchBar, setAlwaysShowSearchBarState] = useState(false);
  const searchFormRef = useRef<HTMLElement | null>(null);

  const registerSearchFormRef = useCallback((ref: HTMLElement | null) => {
    searchFormRef.current = ref;
  }, []);

  const setScrolledPastSearch = useCallback((value: boolean) => {
    setIsScrolledPastSearch(value);
  }, []);

  const setAlwaysShowSearchBar = useCallback((value: boolean) => {
    setAlwaysShowSearchBarState(value);
  }, []);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          setScrollY(currentScrollY);

          // Check if we've scrolled past the search form
          if (searchFormRef.current) {
            const rect = searchFormRef.current.getBoundingClientRect();
            // Consider "past" when the bottom of the search form is above the header (64px)
            const isPast = rect.bottom < 64;
            setIsScrolledPastSearch(isPast);
          } else {
            // Fallback: use a fixed threshold (e.g., 300px for typical hero height)
            setIsScrolledPastSearch(currentScrollY > 300);
          }

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <ScrollContext.Provider
      value={{
        isScrolledPastSearch,
        setScrolledPastSearch,
        registerSearchFormRef,
        scrollY,
        alwaysShowSearchBar,
        setAlwaysShowSearchBar,
      }}
    >
      {children}
    </ScrollContext.Provider>
  );
}

export function useScrollContext() {
  const context = useContext(ScrollContext);
  if (!context) {
    // Return a default implementation for pages without the provider
    return {
      isScrolledPastSearch: false,
      setScrolledPastSearch: () => {},
      registerSearchFormRef: () => {},
      scrollY: 0,
      alwaysShowSearchBar: false,
      setAlwaysShowSearchBar: () => {},
    };
  }
  return context;
}
