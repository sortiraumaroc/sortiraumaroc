import * as React from "react";
import { cn } from "@/lib/utils";
import { SiteFooter } from "@/components/site-footer";

export function AppShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col bg-background text-foreground",
        "min-h-screen",
        className,
      )}
    >
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
