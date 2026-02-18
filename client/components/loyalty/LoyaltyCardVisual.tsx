// =============================================================================
// SAM LOYALTY CARD - Visual Component
// Carte de fidélité visuelle avec tampons
// =============================================================================

import { useMemo } from "react";
import {
  Coffee, Pizza, Utensils, Wine, Beer, Cake, IceCream, Cookie,
  Scissors, Sparkles, Star, Heart, Crown, Gem, Gift, Award,
  Zap, Flame, Sun, Moon, Music, Gamepad2, Dumbbell, Bike,
  Car, Plane, Palmtree, Flower2, Leaf, PawPrint, Baby, Shirt,
  Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CardDesign, LoyaltyCardFull, LoyaltyProgram } from "@/lib/loyalty/types";

// =============================================================================
// ICON MAPPING
// =============================================================================

const ICON_MAP: Record<string, LucideIcon> = {
  coffee: Coffee,
  pizza: Pizza,
  utensils: Utensils,
  wine: Wine,
  beer: Beer,
  cake: Cake,
  "ice-cream": IceCream,
  cookie: Cookie,
  scissors: Scissors,
  sparkles: Sparkles,
  star: Star,
  heart: Heart,
  crown: Crown,
  gem: Gem,
  gift: Gift,
  award: Award,
  zap: Zap,
  flame: Flame,
  sun: Sun,
  moon: Moon,
  music: Music,
  "gamepad-2": Gamepad2,
  dumbbell: Dumbbell,
  bike: Bike,
  car: Car,
  plane: Plane,
  palmtree: Palmtree,
  flower: Flower2,
  leaf: Leaf,
  "paw-print": PawPrint,
  baby: Baby,
  shirt: Shirt,
};

function getStampIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? Star;
}

// =============================================================================
// STYLE HELPERS
// =============================================================================

function getCardStyles(design: CardDesign): {
  background: string;
  stampActive: string;
  stampInactive: string;
  text: string;
  subtext: string;
} {
  const { style, primary_color, secondary_color } = design;

  switch (style) {
    case "gradient":
      return {
        background: `linear-gradient(135deg, ${primary_color} 0%, ${secondary_color ?? primary_color} 100%)`,
        stampActive: "bg-white/90 text-emerald-600 shadow-lg",
        stampInactive: "bg-white/20 text-white/40",
        text: "text-white",
        subtext: "text-white/70",
      };

    case "pastel":
      return {
        background: `linear-gradient(135deg, ${primary_color}40 0%, ${secondary_color ?? primary_color}60 100%)`,
        stampActive: "bg-white shadow-md text-emerald-600",
        stampInactive: "bg-white/50 text-slate-300",
        text: "text-slate-800",
        subtext: "text-slate-600",
      };

    case "neon":
      return {
        background: `linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)`,
        stampActive: "bg-current text-white shadow-lg",
        stampInactive: "bg-slate-800 text-slate-600 border border-slate-700",
        text: "text-white",
        subtext: "text-slate-400",
      };

    case "solid":
    default:
      const isLight = isLightColor(primary_color);
      return {
        background: primary_color,
        stampActive: isLight ? "bg-emerald-500 text-white shadow-md" : "bg-white text-emerald-600 shadow-md",
        stampInactive: isLight ? "bg-black/10 text-black/20" : "bg-white/20 text-white/30",
        text: isLight ? "text-slate-900" : "text-white",
        subtext: isLight ? "text-slate-600" : "text-white/70",
      };
  }
}

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

// =============================================================================
// STAMP GRID
// =============================================================================

function StampGrid({
  stampsCount,
  stampsRequired,
  design,
  styles,
}: {
  stampsCount: number;
  stampsRequired: number;
  design: CardDesign;
  styles: ReturnType<typeof getCardStyles>;
}) {
  const StampIcon = getStampIcon(design.stamp_icon);

  // Calculer la grille optimale
  const cols = stampsRequired <= 5 ? stampsRequired : stampsRequired <= 10 ? 5 : 6;
  const rows = Math.ceil(stampsRequired / cols);

  return (
    <div
      className="grid gap-2 justify-items-center"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {Array.from({ length: stampsRequired }).map((_, idx) => {
        const isStamped = idx < stampsCount;

        return (
          <div
            key={idx}
            className={cn(
              "relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
              isStamped ? styles.stampActive : styles.stampInactive,
              isStamped && "scale-105"
            )}
            style={
              design.style === "neon" && isStamped
                ? {
                    backgroundColor: design.primary_color,
                    boxShadow: `0 0 12px ${design.primary_color}, 0 0 24px ${design.primary_color}40`,
                  }
                : undefined
            }
          >
            {isStamped ? (
              <Check className="w-5 h-5" />
            ) : (
              <StampIcon className="w-5 h-5" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

type LoyaltyCardVisualProps = {
  card?: LoyaltyCardFull;
  program?: LoyaltyProgram;
  stampsCount?: number;
  establishmentName?: string;
  establishmentLogo?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
  showProgress?: boolean;
  onClick?: () => void;
};

export function LoyaltyCardVisual({
  card,
  program: programProp,
  stampsCount: stampsCountProp,
  establishmentName,
  establishmentLogo,
  className,
  size = "md",
  showProgress = true,
  onClick,
}: LoyaltyCardVisualProps) {
  const program = programProp ?? card?.program;
  const stampsCount = stampsCountProp ?? card?.stamps_count ?? 0;
  const stampsRequired = program?.stamps_required ?? 10;

  const design: CardDesign = useMemo(() => {
    const d = program?.card_design;
    if (d && typeof d === "object" && "style" in d) {
      return d as CardDesign;
    }
    return {
      style: "gradient",
      primary_color: "#6366f1",
      secondary_color: "#8b5cf6",
      stamp_icon: "star",
      logo_url: null,
    };
  }, [program?.card_design]);

  const styles = useMemo(() => getCardStyles(design), [design]);

  const isComplete = stampsCount >= stampsRequired;
  const progress = Math.min((stampsCount / stampsRequired) * 100, 100);

  const sizeClasses = {
    sm: "p-3 rounded-xl",
    md: "p-4 rounded-2xl",
    lg: "p-6 rounded-3xl",
  };

  const logoUrl = design.logo_url ?? establishmentLogo ?? card?.establishment?.logo_url ?? card?.establishment?.cover_url;
  const backgroundUrl = design.background_url;
  const estName = establishmentName ?? card?.establishment?.name ?? "Établissement";

  return (
    <div
      className={cn(
        "relative overflow-hidden transition-transform hover:scale-[1.02]",
        sizeClasses[size],
        onClick && "cursor-pointer",
        className
      )}
      style={{ background: styles.background }}
      onClick={onClick}
    >
      {/* Image d'arrière-plan */}
      {backgroundUrl && (
        <>
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/45" />
        </>
      )}

      {/* Contenu (relatif pour passer au-dessus du fond) */}
      <div className="relative">
      {/* Logo / En-tête */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h3 className={cn("font-bold text-sm truncate", backgroundUrl ? "text-white" : styles.text)}>{estName}</h3>
            <p className={cn("text-xs truncate", backgroundUrl ? "text-white/70" : styles.subtext)}>{program?.name ?? "Programme Fidélité"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isComplete && (
            <div className="bg-white/90 text-emerald-600 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
              <Gift className="w-3 h-3" />
              Cadeau !
            </div>
          )}
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={estName}
              className="w-10 h-10 rounded-full object-cover bg-white/20 ring-2 ring-white/30"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center ring-2 ring-white/30">
              <span className={cn("text-lg font-bold", backgroundUrl ? "text-white" : styles.text)}>
                {estName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Grille de tampons */}
      <StampGrid
        stampsCount={stampsCount}
        stampsRequired={stampsRequired}
        design={design}
        styles={styles}
      />

      {/* Progression */}
      {showProgress && (
        <div className="mt-4">
          <div className="flex justify-between items-center mb-1">
            <span className={cn("text-xs font-medium", backgroundUrl ? "text-white/70" : styles.subtext)}>
              {stampsCount} / {stampsRequired} tampons
            </span>
            {!isComplete && (
              <span className={cn("text-xs", backgroundUrl ? "text-white/70" : styles.subtext)}>
                Plus que {stampsRequired - stampsCount} !
              </span>
            )}
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white/90 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Récompense */}
      {program?.reward_description && (
        <div className={cn("mt-3 text-center text-xs", backgroundUrl ? "text-white/70" : styles.subtext)}>
          <Gift className="w-3 h-3 inline me-1" />
          {program.reward_description}
        </div>
      )}
      </div>{/* fin du wrapper relatif */}

      {/* Overlay si carte complète (effet célébration) */}
      {isComplete && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-2 start-2 animate-bounce delay-100">
            <Sparkles className="w-4 h-4 text-yellow-300" />
          </div>
          <div className="absolute top-4 end-4 animate-bounce delay-300">
            <Star className="w-3 h-3 text-yellow-300" />
          </div>
          <div className="absolute bottom-4 start-6 animate-bounce delay-500">
            <Star className="w-3 h-3 text-yellow-300" />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MINI CARD (Pour listes)
// =============================================================================

export function LoyaltyCardMini({
  card,
  onClick,
  className,
}: {
  card: LoyaltyCardFull;
  onClick?: () => void;
  className?: string;
}) {
  const program = card.program;
  const design: CardDesign = useMemo(() => {
    const d = program?.card_design;
    if (d && typeof d === "object" && "style" in d) {
      return d as CardDesign;
    }
    return {
      style: "gradient",
      primary_color: "#6366f1",
      secondary_color: "#8b5cf6",
      stamp_icon: "star",
      logo_url: null,
    };
  }, [program?.card_design]);

  const styles = useMemo(() => getCardStyles(design), [design]);
  const StampIcon = getStampIcon(design.stamp_icon);

  const stampsCount = card.stamps_count ?? 0;
  const stampsRequired = program?.stamps_required ?? 10;
  const progress = Math.min((stampsCount / stampsRequired) * 100, 100);
  const isComplete = stampsCount >= stampsRequired;
  const hasPendingReward = card.status === "reward_pending";

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl transition-all hover:scale-[1.02]",
        onClick && "cursor-pointer",
        card.status === "expired" || card.status === "reward_used" ? "opacity-50" : "",
        className
      )}
      style={{ background: styles.background }}
      onClick={onClick}
    >
      {/* Icône */}
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", styles.stampActive)}>
        {hasPendingReward ? <Gift className="w-5 h-5" /> : <StampIcon className="w-5 h-5" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={cn("font-semibold text-sm truncate", styles.text)}>
          {card.establishment?.name ?? "Établissement"}
        </p>
        <p className={cn("text-xs truncate", styles.subtext)}>
          {program?.name ?? "Programme"}
        </p>
      </div>

      {/* Progression */}
      <div className="text-end">
        <div className={cn("text-sm font-bold", styles.text)}>
          {hasPendingReward ? (
            <span className="flex items-center gap-1">
              <Gift className="w-4 h-4" />
              Cadeau !
            </span>
          ) : (
            `${stampsCount}/${stampsRequired}`
          )}
        </div>
        <div className="w-16 h-1.5 bg-white/20 rounded-full overflow-hidden mt-1">
          <div
            className="h-full bg-white/80 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CARD DESIGN PREVIEW (Pour création programme)
// =============================================================================

export function LoyaltyCardPreview({
  design,
  programName,
  stampsRequired,
  rewardDescription,
  establishmentName,
  establishmentLogo,
  className,
}: {
  design: Partial<CardDesign>;
  programName?: string;
  stampsRequired?: number;
  rewardDescription?: string;
  establishmentName?: string;
  establishmentLogo?: string | null;
  className?: string;
}) {
  const fullDesign: CardDesign = {
    style: design.style ?? "gradient",
    primary_color: design.primary_color ?? "#6366f1",
    secondary_color: design.secondary_color ?? "#8b5cf6",
    stamp_icon: design.stamp_icon ?? "star",
    logo_url: design.logo_url ?? null,
    background_url: design.background_url ?? null,
  };

  const mockProgram: LoyaltyProgram = {
    id: "preview",
    establishment_id: "preview",
    name: programName ?? "Mon Programme",
    description: null,
    stamps_required: stampsRequired ?? 10,
    reward_type: "free_item",
    reward_value: null,
    reward_description: rewardDescription ?? "Récompense à définir",
    reward_validity_days: 30,
    conditions: null,
    card_design: fullDesign,
    bonus_rules: {
      birthday_bonus: false,
      birthday_multiplier: 2,
      happy_hour_bonus: false,
      happy_hour_start: "14:00",
      happy_hour_end: "17:00",
      happy_hour_multiplier: 2,
      sam_booking_bonus: true,
      sam_booking_extra_stamps: 1,
    },
    stamps_expire_after_days: 180,
    warn_expiration_days: 14,
    allow_retroactive_stamps: false,
    retroactive_from_date: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <LoyaltyCardVisual
      program={mockProgram}
      stampsCount={Math.floor((stampsRequired ?? 10) * 0.6)} // 60% rempli pour preview
      establishmentName={establishmentName ?? "Mon Établissement"}
      establishmentLogo={establishmentLogo}
      className={className}
      size="md"
    />
  );
}
