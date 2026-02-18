/**
 * Prompt 14 — Contextual Boosting Engine
 *
 * Adjusts search result scoring based on time-of-day, day-of-week, season,
 * and configurable event rules (Ramadan, Saint-Valentin, etc.).
 *
 * The boost is INVISIBLE to users — it only affects result ordering.
 * Pipeline: base_score × personalization × contextual_multiplier
 */

import { cachedQuery } from "../cache";
import { getAdminSupabase } from "../../supabaseAdmin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BoostCondition {
  /** Days of week (0=Sunday … 6=Saturday). Undefined = matches all. */
  days?: number[];
  /** Hour range [from, to). Handles wrapping past midnight (e.g. 22→2). */
  hours?: { from: number; to: number };
  /** Months (1=Jan … 12=Dec). Undefined = matches all. */
  months?: number[];
  /** Explicit date range (inclusive, ISO YYYY-MM-DD). For event rules. */
  dateRange?: { from: string; to: string };
}

export interface BoostEffect {
  ambiance_tags?: Record<string, number>;
  cuisine_types?: Record<string, number>;
  amenities?: Record<string, number>;
  tags?: Record<string, number>;
  price_range?: Record<string, number>;
  /** Flat bonus for establishments currently online/open. */
  open_now_bonus?: number;
}

export interface BoostRule {
  id: string;
  name: string;
  condition: BoostCondition;
  effect: BoostEffect;
  priority: number;
  source: "hardcoded" | "event";
}

export interface EventRule {
  id: string;
  name: string;
  date_from: string;
  date_to: string;
  boost_config: BoostEffect;
  is_active: boolean;
  priority: number;
}

export interface ContextualBoosts {
  ambiance_tags: Record<string, number>;
  cuisine_types: Record<string, number>;
  amenities: Record<string, number>;
  tags: Record<string, number>;
  price_range: Record<string, number>;
  open_now_bonus: number;
  active_rules: string[];
}

/** Item shape expected by the boosting engine. */
interface BoostableItem {
  tags?: string[] | null;
  subcategory?: string | null;
  is_online?: boolean;
  _price_range?: number | null;
  _amenities?: string[] | null;
  total_score?: number;
  best_score?: number;
  _personalized_score?: number;
  _contextual_score?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum contextual boost: +50% */
const MAX_CONTEXTUAL_BOOST = 0.50;

/** Dimension weights for the final multiplier calculation. */
const CTX_WEIGHT = {
  cuisine: 0.20,
  ambiance: 0.10,
  generic_tag: 0.05,
  amenities: 0.05,
  price_range: 0.05,
} as const;

// ---------------------------------------------------------------------------
// Hardcoded Boost Rules
// ---------------------------------------------------------------------------

const BOOST_RULES: BoostRule[] = [
  // ── HOURLY ────────────────────────────────────────────────────────────

  {
    id: "hourly_breakfast",
    name: "Petit-déjeuner (7h-10h)",
    condition: { hours: { from: 7, to: 10 } },
    effect: {
      cuisine_types: { brunch: 0.70, "petit-déjeuner": 0.90, café: 0.80, pâtisserie: 0.60, boulangerie: 0.70 },
      tags: { brunch: 0.70, breakfast: 0.70, "petit-déjeuner": 0.90, café: 0.60 },
      price_range: { "1": 0.30, "2": 0.20 },
      open_now_bonus: 0.10,
    },
    priority: 10,
    source: "hardcoded",
  },
  {
    id: "hourly_lunch",
    name: "Déjeuner (11h-14h)",
    condition: { hours: { from: 11, to: 14 } },
    effect: {
      cuisine_types: { marocain: 0.50, français: 0.40, italien: 0.40, japonais: 0.30, "fruits de mer": 0.30, burger: 0.30 },
      ambiance_tags: { "business-friendly": 0.30, terrasse: 0.30 },
      tags: { "menu midi": 0.80, "plat du jour": 0.70, "formule déjeuner": 0.80, rapide: 0.40 },
      price_range: { "1": 0.20, "2": 0.40, "3": 0.20 },
      open_now_bonus: 0.10,
    },
    priority: 10,
    source: "hardcoded",
  },
  {
    id: "hourly_gouter",
    name: "Goûter (15h-17h)",
    condition: { hours: { from: 15, to: 17 } },
    effect: {
      cuisine_types: { pâtisserie: 0.90, café: 0.80, "salon de thé": 0.90, glacier: 0.60 },
      ambiance_tags: { cosy: 0.50, familial: 0.40 },
      tags: { pâtisserie: 0.80, "salon de thé": 0.90, goûter: 0.70, dessert: 0.60, thé: 0.70 },
      price_range: { "1": 0.30, "2": 0.30 },
      open_now_bonus: 0.05,
    },
    priority: 10,
    source: "hardcoded",
  },
  {
    id: "hourly_apero",
    name: "Apéritif (17h-20h)",
    condition: { hours: { from: 17, to: 20 } },
    effect: {
      cuisine_types: { tapas: 0.80, bar: 0.70, lounge: 0.70, cocktail: 0.80 },
      ambiance_tags: { rooftop: 0.70, terrasse: 0.60, festif: 0.50, chic: 0.40 },
      tags: { apéro: 0.90, tapas: 0.80, cocktail: 0.80, "happy hour": 0.90, bar: 0.70, rooftop: 0.60 },
      price_range: { "2": 0.30, "3": 0.40 },
      open_now_bonus: 0.08,
    },
    priority: 10,
    source: "hardcoded",
  },
  {
    id: "hourly_dinner",
    name: "Dîner (19h-23h)",
    condition: { hours: { from: 19, to: 23 } },
    effect: {
      cuisine_types: {
        marocain: 0.50, français: 0.50, italien: 0.50, japonais: 0.50,
        "fruits de mer": 0.50, gastronomique: 0.70, chinois: 0.40,
        indien: 0.40, thaïlandais: 0.40, mexicain: 0.40,
      },
      ambiance_tags: { romantique: 0.60, chic: 0.50, "vue mer": 0.50, rooftop: 0.40 },
      tags: { dîner: 0.80, gastronomique: 0.60, "fine dining": 0.70 },
      price_range: { "2": 0.20, "3": 0.40, "4": 0.30 },
      open_now_bonus: 0.10,
    },
    priority: 10,
    source: "hardcoded",
  },
  {
    id: "hourly_late_night",
    name: "Late Night (22h-2h)",
    condition: { hours: { from: 22, to: 2 } },
    effect: {
      cuisine_types: { bar: 0.80, lounge: 0.80, "night club": 0.90, chicha: 0.70 },
      ambiance_tags: { festif: 0.80, rooftop: 0.50, "ambiance DJ": 0.90 },
      tags: { soirée: 0.90, "late night": 0.80, bar: 0.70, discothèque: 0.90, chicha: 0.70 },
      open_now_bonus: 0.12,
    },
    priority: 10,
    source: "hardcoded",
  },

  // ── DAILY ─────────────────────────────────────────────────────────────

  {
    id: "daily_friday",
    name: "Vendredi",
    condition: { days: [5] },
    effect: {
      cuisine_types: { marocain: 0.40, couscous: 0.60, "fruits de mer": 0.30 },
      ambiance_tags: { festif: 0.50, rooftop: 0.30, chic: 0.30 },
      tags: { couscous: 0.70, "spécial vendredi": 0.80 },
      price_range: { "2": 0.20, "3": 0.30 },
    },
    priority: 5,
    source: "hardcoded",
  },
  {
    id: "daily_saturday",
    name: "Samedi",
    condition: { days: [6] },
    effect: {
      cuisine_types: { brunch: 0.50, gastronomique: 0.30, "fruits de mer": 0.30 },
      ambiance_tags: { festif: 0.50, familial: 0.40, rooftop: 0.40, terrasse: 0.30 },
      tags: { brunch: 0.50, "week-end": 0.50, terrasse: 0.40 },
    },
    priority: 5,
    source: "hardcoded",
  },
  {
    id: "daily_sunday",
    name: "Dimanche",
    condition: { days: [0] },
    effect: {
      cuisine_types: { brunch: 0.80, café: 0.50, pâtisserie: 0.40 },
      ambiance_tags: { familial: 0.70, cosy: 0.50, terrasse: 0.40 },
      tags: { brunch: 0.80, "dimanche en famille": 0.70, "menu enfant": 0.50, traditionnel: 0.30 },
      price_range: { "1": 0.20, "2": 0.40 },
    },
    priority: 5,
    source: "hardcoded",
  },
  {
    id: "daily_weekday",
    name: "Semaine (Lun-Jeu)",
    condition: { days: [1, 2, 3, 4] },
    effect: {
      cuisine_types: { "fast casual": 0.30, café: 0.30 },
      ambiance_tags: { "business-friendly": 0.40 },
      tags: { "menu midi": 0.50, "formule déjeuner": 0.50, "plat du jour": 0.40, rapide: 0.30, livraison: 0.25 },
      price_range: { "1": 0.30, "2": 0.30 },
    },
    priority: 3,
    source: "hardcoded",
  },

  // ── SEASONAL ──────────────────────────────────────────────────────────

  {
    id: "seasonal_summer",
    name: "Été (Juin-Août)",
    condition: { months: [6, 7, 8] },
    effect: {
      cuisine_types: { glacier: 0.70, "fruits de mer": 0.50, piscine: 0.60 },
      ambiance_tags: { terrasse: 0.60, "vue mer": 0.70, rooftop: 0.60, piscine: 0.70 },
      amenities: { piscine: 0.70, terrasse: 0.50, "vue mer": 0.60 },
      tags: { plage: 0.60, terrasse: 0.50, glaces: 0.50, piscine: 0.70 },
    },
    priority: 2,
    source: "hardcoded",
  },
  {
    id: "seasonal_winter",
    name: "Hiver (Déc-Fév)",
    condition: { months: [12, 1, 2] },
    effect: {
      cuisine_types: { marocain: 0.30, soupe: 0.50, raclette: 0.40, fondue: 0.40 },
      ambiance_tags: { cosy: 0.60, cheminée: 0.70, chaleureux: 0.50 },
      amenities: { cheminée: 0.70 },
      tags: { cosy: 0.50, "soupe harira": 0.60, cheminée: 0.70 },
    },
    priority: 2,
    source: "hardcoded",
  },
  {
    id: "seasonal_spring",
    name: "Printemps (Mars-Mai)",
    condition: { months: [3, 4, 5] },
    effect: {
      ambiance_tags: { terrasse: 0.50, jardin: 0.50 },
      amenities: { terrasse: 0.50, jardin: 0.50 },
      tags: { terrasse: 0.50, jardin: 0.50, "en plein air": 0.40, brunch: 0.30 },
    },
    priority: 2,
    source: "hardcoded",
  },
  {
    id: "seasonal_autumn",
    name: "Automne (Sept-Nov)",
    condition: { months: [9, 10, 11] },
    effect: {
      cuisine_types: { marocain: 0.20, "comfort food": 0.40 },
      ambiance_tags: { cosy: 0.40, chaleureux: 0.30 },
      tags: { cosy: 0.40, "comfort food": 0.40, "cuisine de saison": 0.50, gastronomique: 0.25 },
    },
    priority: 2,
    source: "hardcoded",
  },
];

// ---------------------------------------------------------------------------
// Condition Matching
// ---------------------------------------------------------------------------

function matchesCondition(condition: BoostCondition, now: Date): boolean {
  const day = now.getDay();
  const hour = now.getHours();
  const month = now.getMonth() + 1;

  // Day check
  if (condition.days && condition.days.length > 0) {
    if (!condition.days.includes(day)) return false;
  }

  // Hour check — handles wrapping past midnight (e.g. 22→2)
  if (condition.hours) {
    const { from, to } = condition.hours;
    if (from < to) {
      if (hour < from || hour >= to) return false;
    } else {
      // Wrapping: e.g. from=22, to=2 means 22,23,0,1
      if (hour < from && hour >= to) return false;
    }
  }

  // Month check
  if (condition.months && condition.months.length > 0) {
    if (!condition.months.includes(month)) return false;
  }

  // Date range check (for event rules)
  if (condition.dateRange) {
    const today = now.toISOString().slice(0, 10);
    if (today < condition.dateRange.from || today > condition.dateRange.to) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Effect Merging (additive accumulation, capped per dimension)
// ---------------------------------------------------------------------------

function mergeEffects(base: BoostEffect, addition: BoostEffect): BoostEffect {
  const result: BoostEffect = { ...base };

  const mapDims = ["ambiance_tags", "cuisine_types", "amenities", "tags", "price_range"] as const;
  for (const dim of mapDims) {
    if (addition[dim]) {
      result[dim] = result[dim] ? { ...result[dim] } : {};
      for (const [key, val] of Object.entries(addition[dim]!)) {
        (result[dim] as Record<string, number>)[key] =
          ((result[dim] as Record<string, number>)[key] ?? 0) + val;
      }
    }
  }

  // open_now_bonus: take the maximum
  if (addition.open_now_bonus != null) {
    result.open_now_bonus = Math.max(result.open_now_bonus ?? 0, addition.open_now_bonus);
  }

  return result;
}

/** Cap all values in a Record to a maximum of 1.0 */
function capMap(m: Record<string, number> | undefined): Record<string, number> {
  if (!m) return {};
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) {
    result[k] = Math.min(v, 1.0);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Core: Compute active boosts for a given moment
// ---------------------------------------------------------------------------

export function computeContextualBoosts(
  now: Date,
  eventRules?: EventRule[],
): ContextualBoosts {
  // 1. Collect matching hardcoded rules
  const matchingRules: BoostRule[] = [];
  for (const rule of BOOST_RULES) {
    if (matchesCondition(rule.condition, now)) {
      matchingRules.push(rule);
    }
  }

  // 2. Collect matching event rules
  if (eventRules) {
    for (const er of eventRules) {
      if (!er.is_active) continue;
      const condition: BoostCondition = {
        dateRange: { from: er.date_from, to: er.date_to },
      };
      if (matchesCondition(condition, now)) {
        matchingRules.push({
          id: er.id,
          name: er.name,
          condition,
          effect: er.boost_config,
          priority: er.priority,
          source: "event",
        });
      }
    }
  }

  // 3. Sort by priority (lower first, higher priority accumulates later)
  matchingRules.sort((a, b) => a.priority - b.priority);

  // 4. Merge all effects (additive)
  let mergedEffect: BoostEffect = {};
  for (const rule of matchingRules) {
    mergedEffect = mergeEffects(mergedEffect, rule.effect);
  }

  // 5. Cap each dimension value at 1.0 and open_now_bonus at 0.15
  return {
    ambiance_tags: capMap(mergedEffect.ambiance_tags),
    cuisine_types: capMap(mergedEffect.cuisine_types),
    amenities: capMap(mergedEffect.amenities),
    tags: capMap(mergedEffect.tags),
    price_range: capMap(mergedEffect.price_range),
    open_now_bonus: Math.min(mergedEffect.open_now_bonus ?? 0, 0.15),
    active_rules: matchingRules.map((r) => r.name),
  };
}

// ---------------------------------------------------------------------------
// Per-Establishment Multiplier
// ---------------------------------------------------------------------------

export function getContextualMultiplier(
  item: BoostableItem,
  boosts: ContextualBoosts,
): number {
  let bonus = 0;

  const tags = (item.tags ?? []).map((t) => t.toLowerCase().trim());
  const subcategory = item.subcategory?.toLowerCase().trim() ?? "";

  // 1. Cuisine type matching (tags + subcategory)
  let maxCuisine = 0;
  for (const tag of tags) {
    if (boosts.cuisine_types[tag]) maxCuisine = Math.max(maxCuisine, boosts.cuisine_types[tag]);
  }
  if (subcategory && boosts.cuisine_types[subcategory]) {
    maxCuisine = Math.max(maxCuisine, boosts.cuisine_types[subcategory]);
  }
  bonus += maxCuisine * CTX_WEIGHT.cuisine;

  // 2. Ambiance tag matching
  let maxAmbiance = 0;
  for (const tag of tags) {
    if (boosts.ambiance_tags[tag]) maxAmbiance = Math.max(maxAmbiance, boosts.ambiance_tags[tag]);
  }
  bonus += maxAmbiance * CTX_WEIGHT.ambiance;

  // 3. Generic tag matching
  let maxTag = 0;
  for (const tag of tags) {
    if (boosts.tags[tag]) maxTag = Math.max(maxTag, boosts.tags[tag]);
  }
  bonus += maxTag * CTX_WEIGHT.generic_tag;

  // 4. Amenities matching
  if (item._amenities && item._amenities.length > 0) {
    let maxAmenity = 0;
    for (const amenity of item._amenities) {
      const key = amenity.toLowerCase().trim();
      if (boosts.amenities[key]) maxAmenity = Math.max(maxAmenity, boosts.amenities[key]);
    }
    bonus += maxAmenity * CTX_WEIGHT.amenities;
  }

  // 5. Price range matching
  if (item._price_range != null && item._price_range >= 1 && item._price_range <= 4) {
    const prScore = boosts.price_range[String(item._price_range)];
    if (prScore) bonus += prScore * CTX_WEIGHT.price_range;
  }

  // 6. Open now bonus (direct, not weighted)
  if (item.is_online && boosts.open_now_bonus > 0) {
    bonus += boosts.open_now_bonus;
  }

  return 1 + Math.min(bonus, MAX_CONTEXTUAL_BOOST);
}

// ---------------------------------------------------------------------------
// Apply Contextual Boosting to a list of items (in-place mutation + re-sort)
// ---------------------------------------------------------------------------

export function applyContextualBoosting(
  items: BoostableItem[],
  boosts: ContextualBoosts,
): void {
  if (items.length <= 1) return;

  // Quick bail-out if no boost dimensions have values
  const hasBoosts =
    Object.keys(boosts.ambiance_tags).length > 0 ||
    Object.keys(boosts.cuisine_types).length > 0 ||
    Object.keys(boosts.amenities).length > 0 ||
    Object.keys(boosts.tags).length > 0 ||
    Object.keys(boosts.price_range).length > 0 ||
    boosts.open_now_bonus > 0;

  if (!hasBoosts) return;

  for (const item of items) {
    const multiplier = getContextualMultiplier(item, boosts);

    // Use the best available score:
    // _personalized_score (if personalization ran) > total_score > best_score > 1
    const baseScore =
      item._personalized_score ??
      item.total_score ??
      item.best_score ??
      1;

    item._contextual_score = baseScore * multiplier;
  }

  // Re-sort by contextual score (descending)
  items.sort((a, b) => (b._contextual_score ?? 0) - (a._contextual_score ?? 0));
}

// ---------------------------------------------------------------------------
// DB: Fetch active event rules (cached 30 min)
// ---------------------------------------------------------------------------

async function getActiveEventRules(): Promise<EventRule[]> {
  return cachedQuery<EventRule[]>(
    "contextual_boost_event_rules",
    1800,
    async () => {
      const supabase = getAdminSupabase();
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("search_boost_events")
        .select("id,name,date_from,date_to,boost_config,is_active,priority")
        .eq("is_active", true)
        .lte("date_from", today)
        .gte("date_to", today);

      if (error) {
        console.warn("[contextual-boost] Failed to load event rules:", error.message);
        return [];
      }
      return (data ?? []) as EventRule[];
    },
  );
}

// ---------------------------------------------------------------------------
// Main entry point: boosts for the current moment (cached 30 min)
// ---------------------------------------------------------------------------

export async function getContextualBoostsForNow(): Promise<ContextualBoosts> {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const month = now.getMonth() + 1;
  const today = now.toISOString().slice(0, 10);

  const cacheKey = `contextual_boosts:${hour}:${day}:${month}:${today}`;

  return cachedQuery<ContextualBoosts>(
    cacheKey,
    1800,
    async () => {
      const eventRules = await getActiveEventRules();
      return computeContextualBoosts(now, eventRules);
    },
  );
}

// ---------------------------------------------------------------------------
// Admin helpers
// ---------------------------------------------------------------------------

/** Returns all hardcoded boost rules (read-only, for admin display). */
export function getAllHardcodedRules(): BoostRule[] {
  return [...BOOST_RULES];
}

/** Simulate boosts at a specific date/time (no cache, fresh event rules fetch). */
export async function simulateBoostsAtDate(dateStr: string): Promise<ContextualBoosts> {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }

  const supabase = getAdminSupabase();
  const dayStr = dateStr.slice(0, 10);
  const { data } = await supabase
    .from("search_boost_events")
    .select("id,name,date_from,date_to,boost_config,is_active,priority")
    .eq("is_active", true)
    .lte("date_from", dayStr)
    .gte("date_to", dayStr);

  return computeContextualBoosts(date, (data ?? []) as EventRule[]);
}
