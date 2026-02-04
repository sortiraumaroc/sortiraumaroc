import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowDownUp } from "lucide-react";

export type SortOption = "recommended" | "priceAsc" | "priceDesc";

const options: { value: SortOption; label: string }[] = [
  { value: "recommended", label: "Les plus recommandés" },
  { value: "priceAsc", label: "Du moins cher au plus cher" },
  { value: "priceDesc", label: "Du plus cher au moins cher" },
];

export function SortMenu({
  value,
  onChange,
  className,
}: {
  value: SortOption;
  onChange: (value: SortOption) => void;
  className?: string;
}) {
  const validValues = React.useMemo(() => new Set(options.map((o) => o.value)), []);
  const safeValue: SortOption = validValues.has(value) ? value : "recommended";
  const currentLabel =
    options.find((o) => o.value === safeValue)?.label ?? options[0]?.label ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className={cn(
            "h-10 rounded-xl px-3 text-sm font-medium",
            "justify-between gap-2",
            className,
          )}
        >
          <span className="truncate">{currentLabel}</span>
          <ArrowDownUp className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Trier</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={safeValue}
          onValueChange={(v) =>
            onChange(validValues.has(v as SortOption) ? (v as SortOption) : "recommended")
          }
        >
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            onChange("recommended");
          }}
          className="text-muted-foreground"
        >
          Réinitialiser
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
