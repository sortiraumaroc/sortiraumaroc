import * as React from "react";

export function useVisualViewportVars(enabled = true) {
  React.useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const vv = window.visualViewport;
    if (!vv) return;

    const setVars = () => {
      const vvh = vv.height;
      const vvo = vv.offsetTop || 0;

      // iOS keyboard approximation:
      // window.innerHeight = layout viewport
      // vv.height = visible viewport
      // vv.offsetTop sometimes changes when Safari UI collapses/expands
      const keyboard = Math.max(0, window.innerHeight - vvh - vvo);

      document.documentElement.style.setProperty("--vvh", `${vvh}px`);
      document.documentElement.style.setProperty("--vvo", `${vvo}px`);
      document.documentElement.style.setProperty("--vvb", `${keyboard}px`); // 👈 bottom offset
    };

    setVars();
    vv.addEventListener("resize", setVars);
    vv.addEventListener("scroll", setVars);

    window.addEventListener("resize", setVars);
    window.addEventListener("orientationchange", setVars);

    return () => {
      vv.removeEventListener("resize", setVars);
      vv.removeEventListener("scroll", setVars);

      window.removeEventListener("resize", setVars);
      window.removeEventListener("orientationchange", setVars);
    };
  }, [enabled]);
}
