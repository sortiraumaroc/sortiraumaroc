/**
 * Skeleton de carte d'établissement — affiché pendant que Sam cherche
 *
 * Reproduit la structure de SamEstablishmentCard avec des blocs animés pulse.
 * 2 skeletons affichés par défaut pour indiquer qu'une recherche est en cours.
 */

export function SamEstablishmentCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm animate-pulse">
      {/* Cover photo skeleton */}
      <div className="h-[160px] w-full bg-slate-200" />

      {/* Info section skeleton */}
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        {/* Nom */}
        <div className="h-4 w-3/4 rounded bg-slate-200" />

        {/* Subcategory · Ville */}
        <div className="h-3 w-1/2 rounded bg-slate-100" />

        {/* Rating line 1 */}
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded-full bg-slate-200 flex-shrink-0" />
          <div className="h-3 w-20 rounded bg-slate-200" />
        </div>

        {/* Rating line 2 */}
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded-full bg-slate-100 flex-shrink-0" />
          <div className="h-3 w-16 rounded bg-slate-100" />
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-slate-200 flex-shrink-0" />
          <div className="h-3 w-24 rounded bg-slate-100" />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* CTA Button */}
        <div className="h-8 w-full rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}

/** Groupe de 2 skeletons empilés */
export function SamEstablishmentSkeletons() {
  return (
    <div className="grid grid-cols-1 gap-3 w-full">
      <SamEstablishmentCardSkeleton />
      <SamEstablishmentCardSkeleton />
    </div>
  );
}
