import * as React from "react";
import * as Icons from "lucide-react";
import { Search, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Curated list of commonly used icons for universes/categories
const COMMON_ICONS = [
  "UtensilsCrossed",
  "Dumbbell",
  "Zap",
  "Building2",
  "Landmark",
  "ShoppingBag",
  "Home",
  "Heart",
  "Star",
  "Coffee",
  "Wine",
  "Pizza",
  "Salad",
  "Bike",
  "Car",
  "Plane",
  "Train",
  "Ship",
  "Tent",
  "Camera",
  "Music",
  "Palette",
  "Book",
  "Gamepad2",
  "Film",
  "Trees",
  "Mountain",
  "Sun",
  "Moon",
  "Umbrella",
  "Waves",
  "Briefcase",
  "GraduationCap",
  "Stethoscope",
  "Scissors",
  "Sparkles",
  "Trophy",
  "Medal",
  "Gift",
  "PartyPopper",
  "MapPin",
  "Globe",
  "Compass",
  "Navigation",
  "Utensils",
  "Soup",
  "IceCream",
  "Croissant",
  "Beer",
  "Martini",
  "Footprints",
  "Flower2",
  "Leaf",
  "TreePine",
  "Sailboat",
  "Volleyball",
  "BadgePercent",
  "Ticket",
  "Theater",
  "Clapperboard",
  "Mic2",
  "Headphones",
  "Shirt",
  "Watch",
  "Gem",
  "Crown",
  "Bed",
  "Bath",
  "Sofa",
  "Lamp",
] as const;

// Get all icon names from lucide-react (filter to LucideIcon components)
const ALL_ICON_NAMES = Object.keys(Icons).filter(
  (key) =>
    key !== "default" &&
    key !== "createLucideIcon" &&
    key !== "icons" &&
    typeof (Icons as Record<string, unknown>)[key] === "function" &&
    /^[A-Z]/.test(key),
);

type LucideIconPickerProps = {
  value: string;
  onChange: (iconName: string) => void;
  className?: string;
};

export function LucideIconPicker({
  value,
  onChange,
  className,
}: LucideIconPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [showAll, setShowAll] = React.useState(false);

  const IconComponent = (
    Icons as unknown as Record<string, React.FC<{ className?: string }>>
  )[value] ?? Icons.Circle;

  const filteredIcons = React.useMemo(() => {
    const baseList = showAll ? ALL_ICON_NAMES : [...COMMON_ICONS];
    if (!search.trim()) return baseList;
    const q = search.toLowerCase();
    return baseList.filter((name) => name.toLowerCase().includes(q));
  }, [search, showAll]);

  const renderIcon = (iconName: string) => {
    const Icon = (Icons as unknown as Record<string, React.FC<{ className?: string }>>)[
      iconName
    ];
    if (!Icon) return null;
    return (
      <button
        key={iconName}
        type="button"
        onClick={() => {
          onChange(iconName);
          setOpen(false);
        }}
        className={cn(
          "flex flex-col items-center justify-center p-2 rounded-lg border transition-colors",
          value === iconName
            ? "border-primary bg-primary/10 text-primary"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
        )}
        title={iconName}
      >
        <Icon className="w-5 h-5" />
        <span className="text-[10px] mt-1 truncate max-w-[60px]">
          {iconName}
        </span>
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between gap-2", className)}
        >
          <IconComponent className="w-4 h-4" />
          <span className="truncate">{value || "Sélectionner une icône"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Rechercher une icône..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute end-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Button
              variant={showAll ? "outline" : "secondary"}
              size="sm"
              onClick={() => setShowAll(false)}
            >
              Icônes courantes
            </Button>
            <Button
              variant={showAll ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowAll(true)}
            >
              Toutes ({ALL_ICON_NAMES.length})
            </Button>
          </div>
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-3 grid grid-cols-5 gap-2">
            {filteredIcons.map(renderIcon)}
          </div>
          {filteredIcons.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500">
              Aucune icône trouvée
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// Helper to render a dynamic icon by name
export function DynamicLucideIcon({
  name,
  className,
  style,
  fallback = "Circle",
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
  fallback?: string;
}) {
  const Icon =
    (Icons as unknown as Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>>)[name] ??
    (Icons as unknown as Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>>)[fallback] ??
    Icons.Circle;
  return <Icon className={className} style={style} />;
}
