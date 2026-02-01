// Search History Management
// Stores recent searches in localStorage for quick access

import type { ActivityCategory } from "@/lib/taxonomy";

export interface SearchHistoryItem {
  id: string;
  timestamp: number;
  universe: ActivityCategory;
  city: string;
  date?: string;
  time?: string;
  guests?: number;
  prestation?: string;
  activityType?: string;
  checkInDate?: string;
  checkOutDate?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  pickupTime?: string;
  dropoffTime?: string;
}

const STORAGE_KEY = "sam_search_history";
const MAX_HISTORY_ITEMS = 5;

/**
 * Generate a unique ID for a search history item
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all search history items from localStorage
 */
export function getSearchHistory(): SearchHistoryItem[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    // Sort by timestamp (most recent first)
    return parsed.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

/**
 * Get search history filtered by universe
 */
export function getSearchHistoryByUniverse(universe: ActivityCategory): SearchHistoryItem[] {
  return getSearchHistory().filter((item) => item.universe === universe);
}

/**
 * Save a new search to history
 */
export function saveSearchToHistory(search: Omit<SearchHistoryItem, "id" | "timestamp">): void {
  if (typeof window === "undefined") return;
  if (!search.city || search.city.trim() === "") return;

  try {
    const history = getSearchHistory();

    // Check if a similar search already exists (same city & universe)
    const existingIndex = history.findIndex(
      (item) => item.city.toLowerCase() === search.city.toLowerCase() && item.universe === search.universe
    );

    // If exists, remove the old one
    if (existingIndex !== -1) {
      history.splice(existingIndex, 1);
    }

    // Add new search at the beginning
    const newItem: SearchHistoryItem = {
      ...search,
      id: generateId(),
      timestamp: Date.now(),
    };

    history.unshift(newItem);

    // Keep only the last MAX_HISTORY_ITEMS
    const trimmed = history.slice(0, MAX_HISTORY_ITEMS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Silently fail if localStorage is not available
  }
}

/**
 * Remove a specific search from history
 */
export function removeSearchFromHistory(id: string): void {
  if (typeof window === "undefined") return;

  try {
    const history = getSearchHistory();
    const filtered = history.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // Silently fail
  }
}

/**
 * Clear all search history
 */
export function clearSearchHistory(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently fail
  }
}

/**
 * Format a search history item for display
 */
export function formatSearchSummary(item: SearchHistoryItem, locale: string = "fr"): string {
  const parts: string[] = [];

  // City is always present
  parts.push(item.city);

  // Date
  if (item.date) {
    try {
      const date = new Date(item.date);
      parts.push(date.toLocaleDateString(locale, { day: "numeric", month: "short" }));
    } catch {
      parts.push(item.date);
    }
  } else if (item.checkInDate) {
    try {
      const date = new Date(item.checkInDate);
      parts.push(date.toLocaleDateString(locale, { day: "numeric", month: "short" }));
    } catch {
      parts.push(item.checkInDate);
    }
  }

  // Time
  if (item.time) {
    parts.push(item.time);
  } else if (item.pickupTime) {
    parts.push(item.pickupTime);
  }

  // Guests
  if (item.guests && item.guests > 0) {
    parts.push(`${item.guests} pers.`);
  }

  // Activity/Prestation
  if (item.prestation) {
    parts.push(item.prestation);
  } else if (item.activityType) {
    parts.push(item.activityType);
  }

  return parts.join(" · ");
}

/**
 * Get universe label in French
 */
export function getUniverseLabel(universe: ActivityCategory): string {
  const labels: Record<ActivityCategory, string> = {
    restaurants: "Restaurants",
    sport: "Sport & Bien-être",
    loisirs: "Loisirs",
    hebergement: "Hébergement",
    culture: "Culture",
    shopping: "Shopping",
    rentacar: "Location véhicule",
  };
  return labels[universe] || universe;
}

/**
 * Format relative time (e.g., "Il y a 5 min", "Hier")
 */
export function formatRelativeTime(timestamp: number, locale: string = "fr"): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (locale === "fr") {
    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days === 1) return "Hier";
    if (days < 7) return `Il y a ${days} jours`;
    return new Date(timestamp).toLocaleDateString(locale, { day: "numeric", month: "short" });
  }

  // English fallback
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString(locale, { day: "numeric", month: "short" });
}
