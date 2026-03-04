import { Skeleton } from "@/components/ui/skeleton";

type EstablishmentCardSkeletonProps = {
  count?: number;
};

function SingleCardSkeleton() {
  return (
    <article
      className="bg-white rounded-2xl overflow-hidden border border-slate-100/80 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)]"
    >
      {/* Image skeleton — matches aspect-[16/10] */}
      <Skeleton className="aspect-[16/10] w-full rounded-none" />

      {/* Content — matches p-4 layout */}
      <div className="p-4">
        {/* Header: Name & Rating */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2 mt-1.5" />
          </div>
          {/* Rating number */}
          <div className="flex flex-col items-end flex-shrink-0">
            <Skeleton className="h-8 w-10 rounded-md" />
            <Skeleton className="h-3 w-8 mt-1" />
          </div>
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 mb-2">
          <Skeleton className="w-4 h-4 rounded-full flex-shrink-0" />
          <Skeleton className="h-4 w-2/5" />
        </div>

        {/* Category & Price */}
        <Skeleton className="h-4 w-1/3 mb-3" />

        {/* Time slots */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
          <Skeleton className="h-10 w-[72px] rounded-xl" />
          <Skeleton className="h-10 w-[72px] rounded-xl" />
          <Skeleton className="h-10 w-[72px] rounded-xl" />
        </div>
      </div>
    </article>
  );
}

export function EstablishmentCardSkeleton({ count = 1 }: EstablishmentCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SingleCardSkeleton key={i} />
      ))}
    </>
  );
}
