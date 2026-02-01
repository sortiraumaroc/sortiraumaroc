import * as React from "react";
import { Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Predefined color palette coherent with the brand
export const UNIVERSE_COLORS = [
  { value: "#a3001d", label: "Rouge primaire" },
  { value: "#1e3a5f", label: "Bleu marine" },
  { value: "#2d5a3d", label: "Vert forêt" },
  { value: "#8b4513", label: "Marron" },
  { value: "#4a4a4a", label: "Gris foncé" },
  { value: "#6b4c9a", label: "Violet" },
  { value: "#c4721a", label: "Orange" },
  { value: "#1a7a7a", label: "Turquoise" },
] as const;

type ColorPaletteProps = {
  value: string;
  onChange: (color: string) => void;
  className?: string;
};

export function ColorPalette({ value, onChange, className }: ColorPaletteProps) {
  const [open, setOpen] = React.useState(false);

  const selectedColor = UNIVERSE_COLORS.find((c) => c.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-start gap-2", className)}
        >
          <div
            className="w-5 h-5 rounded-full border border-slate-300"
            style={{ backgroundColor: value }}
          />
          <span className="truncate">
            {selectedColor?.label || value || "Sélectionner une couleur"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3" align="start">
        <div className="grid grid-cols-4 gap-2">
          {UNIVERSE_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => {
                onChange(color.value);
                setOpen(false);
              }}
              className={cn(
                "relative w-12 h-12 rounded-lg border-2 transition-all",
                value === color.value
                  ? "border-slate-900 scale-110"
                  : "border-transparent hover:scale-105",
              )}
              style={{ backgroundColor: color.value }}
              title={color.label}
            >
              {value === color.value && (
                <Check className="absolute inset-0 m-auto w-5 h-5 text-white drop-shadow-md" />
              )}
            </button>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t">
          <div className="text-xs text-slate-500 text-center">
            {selectedColor?.label || "Sélectionnez une couleur"}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
