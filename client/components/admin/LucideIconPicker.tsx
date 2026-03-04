import * as React from "react";
import { Search, X, Circle, type LucideIcon } from "lucide-react";
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
  "Ship",
  "MapPin",
  "Compass",
  "Camera",
  "Music",
  "Palette",
  "BookOpen",
  "GraduationCap",
  "Briefcase",
  "Stethoscope",
  "Scissors",
  "Wrench",
  "Gamepad2",
  "Trophy",
  "Medal",
  "Gift",
  "Sparkles",
  "Sun",
  "Moon",
  "TreePine",
  "Flower2",
  "Dog",
  "Cat",
  "Baby",
  "Smile",
  "Headphones",
  "Mic",
  "Video",
  "Tv",
  "Wifi",
  "Globe",
  "Phone",
  "Mail",
  "Clock",
  "CalendarCheck",
  "Users",
  "UserCircle",
  "BadgePercent",
  "CreditCard",
  "Wallet",
  "Receipt",
  "BarChart3",
  "TrendingUp",
  "Shield",
  "Lock",
  "Eye",
  "Bell",
  "MessageSquare",
  "ThumbsUp",
  "Flag",
  "Tag",
  "Bookmark",
  "Link",
  "Download",
  "Upload",
  "Gem",
  "Crown",
  "Bed",
  "Bath",
  "Sofa",
  "Lamp",
] as const;

// Lazy-loaded full icon registry (only loaded when "show all" is clicked)
let allIconsCache: Record<string, LucideIcon> | null = null;
let allIconNamesCache: string[] | null = null;

async function loadAllIcons(): Promise<Record<string, LucideIcon>> {
  if (allIconsCache) return allIconsCache;
  const mod = await import("lucide-react");
  const icons: Record<string, LucideIcon> = {};
  for (const [key, val] of Object.entries(mod)) {
    if (
      key !== "default" &&
      key !== "createLucideIcon" &&
      key !== "icons" &&
      typeof val === "function" &&
      /^[A-Z]/.test(key)
    ) {
      icons[key] = val as LucideIcon;
    }
  }
  allIconsCache = icons;
  allIconNamesCache = Object.keys(icons);
  return icons;
}

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
  const [allIcons, setAllIcons] = React.useState<Record<string, LucideIcon> | null>(allIconsCache);
  const [allIconNames, setAllIconNames] = React.useState<string[]>(allIconNamesCache ?? []);

  // Load all icons when "show all" is clicked
  React.useEffect(() => {
    if (showAll && !allIcons) {
      loadAllIcons().then((icons) => {
        setAllIcons(icons);
        setAllIconNames(Object.keys(icons));
      });
    }
  }, [showAll, allIcons]);

  const IconComponent = allIcons?.[value] ?? Circle;

  const filteredIcons = React.useMemo(() => {
    const baseList = showAll ? allIconNames : [...COMMON_ICONS];
    if (!search.trim()) return baseList;
    const q = search.toLowerCase();
    return baseList.filter((name) => name.toLowerCase().includes(q));
  }, [search, showAll, allIconNames]);

  const renderIcon = (iconName: string) => {
    const Icon = allIcons?.[iconName];
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

  // Preload icons on popover open so the selected icon renders
  React.useEffect(() => {
    if (open && !allIcons) {
      loadAllIcons().then((icons) => {
        setAllIcons(icons);
        setAllIconNames(Object.keys(icons));
      });
    }
  }, [open, allIcons]);

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
              Toutes {allIconNames.length > 0 ? `(${allIconNames.length})` : ""}
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

// Helper to render a dynamic icon by name (lazy-loads the full library on first call)
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
  const [icons, setIcons] = React.useState<Record<string, LucideIcon> | null>(allIconsCache);

  React.useEffect(() => {
    if (!icons) {
      loadAllIcons().then(setIcons);
    }
  }, [icons]);

  const Icon = icons?.[name] ?? icons?.[fallback] ?? Circle;
  return <Icon className={className} style={style} />;
}
