import * as React from "react";
import { useLocation } from "react-router-dom";

function scrollToTopInstant() {
  if (typeof window === "undefined") return;

  // scrollingElement est le plus fiable (gère mieux certains navigateurs mobiles)
  const el = document.scrollingElement ?? document.documentElement;
  el.scrollTo({ top: 0, left: 0, behavior: "auto" });
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

export function ScrollToTop() {
  const { pathname } = useLocation();

  React.useLayoutEffect(() => {
    scrollToTopInstant();
  }, [pathname]);

  return null;
}
