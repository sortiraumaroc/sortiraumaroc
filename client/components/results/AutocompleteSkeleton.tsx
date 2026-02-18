import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton for autocomplete suggestion items (desktop & mobile dropdown).
 * Mirrors the real suggestion item layout: icon + label + sub-text.
 */
export function AutocompleteSuggestionsSkeleton() {
  return (
    <div className="py-2">
      {[0.75, 0.6, 0.85, 0.5].map((widthFraction, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          {/* Icon placeholder */}
          <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
          {/* Text content */}
          <div className="flex-1 min-w-0">
            <Skeleton className="h-4 rounded" style={{ width: `${widthFraction * 100}%` }} />
            <Skeleton className="h-3 w-1/2 mt-1.5 rounded" />
          </div>
          {/* "Voir →" link placeholder */}
          <Skeleton className="h-3 w-8 rounded flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton for the popular searches pills section.
 * Mirrors the real popular searches layout: title + pill buttons.
 */
export function AutocompletePopularSkeleton() {
  return (
    <div className="p-3">
      {/* Section title */}
      <Skeleton className="h-3 w-36 mb-3" />
      {/* Pills */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
    </div>
  );
}
