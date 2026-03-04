/**
 * CriteriaRating V2 — Universe-aware criteria rating components
 *
 * Uses the shared V2 review types and adapts displayed criteria
 * based on the establishment's universe.
 *
 * Exports:
 *  - CriteriaRatingsForm   — Interactive form for submitting ratings
 *  - CriteriaRatingsDisplay — Read-only display of criteria ratings
 *  - makeDefaultCriteriaV2  — Create default ratings for a universe
 *  - computeOverallFromCriteria — Compute overall from criteria values
 *
 * Legacy exports (kept for backward compatibility):
 *  - BookingReviewCriteria, CriteriaKey, CRITERIA_CONFIG
 *  - makeDefaultCriteria, computeCriteriaAverage
 */

import {
  Handshake,
  Sparkles,
  Wallet,
  Sofa,
  ShieldCheck,
  CalendarCheck,
  ConciergeBell,
  MapPin,
} from "lucide-react";

import { StarRating } from "@/components/reviews/StarRating";
import { cn } from "@/lib/utils";
import {
  type ReviewCriterionKey,
  type EstablishmentUniverse,
  getCriteriaForUniverse,
  CRITERIA_LABELS_FR,
  computeOverallRating,
} from "@shared/reviewTypes";

// =============================================================================
// V2 CRITERIA CONFIG (icons + labels per criterion key)
// =============================================================================

const CRITERIA_ICON_MAP: Record<
  ReviewCriterionKey,
  React.ComponentType<{ className?: string }>
> = {
  welcome: Handshake,
  quality: Sparkles,
  value: Wallet,
  ambiance: Sofa,
  hygiene: ShieldCheck,
  organization: CalendarCheck,
};

// =============================================================================
// V2 TYPES
// =============================================================================

/** V2 criteria ratings — all optional except the 4 common criteria */
export interface ReviewCriteriaV2 {
  welcome: number;
  quality: number;
  value: number;
  ambiance: number;
  hygiene?: number | null;
  organization?: number | null;
}

// =============================================================================
// V2 HELPERS
// =============================================================================

/**
 * Create default V2 criteria ratings for a given universe
 */
export function makeDefaultCriteriaV2(
  universe: string = "restaurant",
  defaultValue = 5,
): ReviewCriteriaV2 {
  const v = Math.max(1, Math.min(5, Math.round(Number(defaultValue) || 5)));
  const criteria = getCriteriaForUniverse(universe);

  const result: ReviewCriteriaV2 = {
    welcome: v,
    quality: v,
    value: v,
    ambiance: v,
  };

  if (criteria.includes("hygiene")) result.hygiene = v;
  if (criteria.includes("organization")) result.organization = v;

  return result;
}

/**
 * Compute overall rating from V2 criteria (delegates to shared function)
 */
export function computeOverallFromCriteria(criteria: ReviewCriteriaV2): number {
  return computeOverallRating({
    welcome: criteria.welcome,
    quality: criteria.quality,
    value: criteria.value,
    ambiance: criteria.ambiance,
    hygiene: criteria.hygiene ?? null,
    organization: criteria.organization ?? null,
  });
}

// =============================================================================
// V2 FORM COMPONENT
// =============================================================================

export function CriteriaRatingsForm({
  value,
  onChange,
  universe = "restaurant",
}: {
  value: ReviewCriteriaV2;
  onChange: (next: ReviewCriteriaV2) => void;
  universe?: string;
}) {
  const criteriaKeys = getCriteriaForUniverse(universe);

  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {criteriaKeys.map((key, idx) => {
        const Icon = CRITERIA_ICON_MAP[key];
        const label = CRITERIA_LABELS_FR[key];
        const currentValue =
          key === "hygiene"
            ? value.hygiene ?? 5
            : key === "organization"
              ? value.organization ?? 5
              : value[key as keyof Pick<ReviewCriteriaV2, "welcome" | "quality" | "value" | "ambiance">];

        return (
          <div
            key={key}
            className={cn(
              "flex items-center gap-3 p-3",
              idx === 0 ? "rounded-t-lg" : undefined,
            )}
          >
            <div className="h-9 w-9 rounded-md bg-primary/5 border border-primary/15 flex items-center justify-center text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">
                {label}
              </div>
            </div>
            <StarRating
              value={currentValue}
              onChange={(next) => onChange({ ...value, [key]: next })}
              ariaLabel={label}
            />
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// V2 DISPLAY COMPONENT
// =============================================================================

export function CriteriaRatingsDisplay({
  criteria,
  universe,
  compact = false,
}: {
  criteria: ReviewCriteriaV2 | Record<string, number>;
  universe?: string;
  compact?: boolean;
}) {
  // Determine which criteria to show
  const criteriaKeys = universe
    ? getCriteriaForUniverse(universe)
    : (Object.keys(criteria).filter((k) =>
        ["welcome", "quality", "value", "ambiance", "hygiene", "organization"].includes(k),
      ) as ReviewCriterionKey[]);

  if (compact) {
    // Compact pill-style display
    return (
      <div className="flex flex-wrap gap-2">
        {criteriaKeys.map((key) => {
          const val = (criteria as Record<string, number>)[key];
          if (val == null) return null;
          return (
            <span
              key={key}
              className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded"
            >
              {CRITERIA_LABELS_FR[key]}: {val}/5
            </span>
          );
        })}
      </div>
    );
  }

  // Full display with icons
  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {criteriaKeys.map((key, idx) => {
        const Icon = CRITERIA_ICON_MAP[key];
        const label = CRITERIA_LABELS_FR[key];
        const val = (criteria as Record<string, number>)[key];
        if (val == null) return null;

        return (
          <div
            key={key}
            className={cn(
              "flex items-center gap-3 p-3",
              idx === 0 ? "rounded-t-lg" : undefined,
            )}
          >
            <div className="h-9 w-9 rounded-md bg-primary/5 border border-primary/15 flex items-center justify-center text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">
                {label}
              </div>
            </div>
            <StarRating value={val} readonly ariaLabel={label} />
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// LEGACY EXPORTS (backward compatibility with v1 consumers)
// =============================================================================

export type BookingReviewCriteria = {
  accueil: number;
  cadre_ambiance: number;
  service: number;
  qualite_prestation: number;
  prix: number;
  emplacement: number;
};

export type CriteriaKey = keyof BookingReviewCriteria;

export const CRITERIA_CONFIG: Array<{
  key: CriteriaKey;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "accueil", label: "Accueil", Icon: Handshake },
  { key: "cadre_ambiance", label: "Cadre et Ambiance", Icon: Sofa },
  { key: "service", label: "Service", Icon: ConciergeBell },
  { key: "qualite_prestation", label: "Qualité de la prestation", Icon: Sparkles },
  { key: "prix", label: "Prix", Icon: Wallet },
  { key: "emplacement", label: "Emplacement", Icon: MapPin },
];

export function makeDefaultCriteria(value = 5): BookingReviewCriteria {
  const v = Math.max(1, Math.min(5, Math.round(Number(value) || 5)));
  return {
    accueil: v,
    cadre_ambiance: v,
    service: v,
    qualite_prestation: v,
    prix: v,
    emplacement: v,
  };
}

export function computeCriteriaAverage(criteria: BookingReviewCriteria): number {
  const values = CRITERIA_CONFIG.map((c) => Number(criteria[c.key]));
  const nums = values.filter((v) => Number.isFinite(v) && v >= 1 && v <= 5);
  if (!nums.length) return 0;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.round(avg * 10) / 10;
}
