import type { ActivityCategory } from "@/lib/taxonomy";

export type SearchState = {
  city?: string;
  cityId?: string;
  typeValue?: string;
  restaurantCategory?: string;
  shoppingStoreType?: string;
  date?: string;
  checkInDate?: string;
  checkOutDate?: string;
  time?: string;
  numPeople?: string;
  // Rentacar specific fields
  pickupLocation?: string;
  dropoffLocation?: string;
  pickupTime?: string;
  dropoffTime?: string;
  vehicleType?: string;
};

const STORAGE_KEY = "sam_search_state_v1";

function readAll(): Record<string, SearchState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, SearchState>;
  } catch {
    return {};
  }
}

function writeAll(value: Record<string, SearchState>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    return;
  }
}

export function readSearchState(universe: ActivityCategory): SearchState {
  const all = readAll();
  const v = all[universe];
  if (!v || typeof v !== "object") return {};
  return v;
}

export function patchSearchState(universe: ActivityCategory, patch: SearchState): void {
  const all = readAll();
  const prev = readSearchState(universe);
  const next: SearchState = { ...prev, ...patch };
  all[universe] = next;
  writeAll(all);
}
