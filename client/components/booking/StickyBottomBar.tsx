import * as React from "react";

import { cn } from "@/lib/utils";

type StickyBottomBarProps = {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  /**
   * When false, the fixed bar is not rendered.
   */
  show?: boolean;
};

export function StickyBottomBar({
  children,
  className,
  containerClassName,
  show = true,
}: StickyBottomBarProps) {
  return show ? (
    <div
      data-sticky-bottom-bar
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white",
        className,
      )}
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)",
      }}
    >
      <div className={cn("container mx-auto px-4 pt-3", containerClassName)}>{children}</div>
    </div>
  ) : null;
}
