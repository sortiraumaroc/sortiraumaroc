import * as React from "react";
import { RefreshCcw } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RefreshIconButtonProps = Omit<ButtonProps, "children"> & {
  loading?: boolean;
  label?: string;
};

export function RefreshIconButton({
  loading = false,
  label = "Rafraîchir",
  className,
  disabled,
  size,
  variant,
  ...props
}: RefreshIconButtonProps) {
  return (
    <Button
      aria-label={label}
      title={label}
      variant={variant ?? "outline"}
      size={size ?? "icon"}
      disabled={disabled || loading}
      className={cn("shrink-0", className)}
      {...props}
    >
      <RefreshCcw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
    </Button>
  );
}
