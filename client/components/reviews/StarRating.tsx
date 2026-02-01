import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

export function StarRating({
  value,
  onChange,
  size = 18,
  readonly = false,
  ariaLabel,
}: {
  value: number;
  onChange?: (next: number) => void;
  size?: number;
  readonly?: boolean;
  ariaLabel?: string;
}) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : 0;
  const filled = Math.round(safe);

  return (
    <div className="flex items-center gap-1" role={readonly ? "img" : "radiogroup"} aria-label={ariaLabel}>
      {[1, 2, 3, 4, 5].map((i) => {
        const isFilled = i <= filled;

        const cls = cn(
          "transition-colors",
          isFilled ? "text-yellow-500 fill-yellow-500" : "text-slate-300",
          readonly ? "cursor-default" : "cursor-pointer hover:text-yellow-500 hover:fill-yellow-500",
        );

        const common = {
          className: cls,
          style: { width: size, height: size },
        } as const;

        if (readonly || !onChange) {
          return <Star key={i} {...common} />;
        }

        return (
          <button
            key={i}
            type="button"
            className="p-0.5"
            onClick={() => onChange(i)}
            aria-label={`${i} sur 5`}
            role="radio"
            aria-checked={i === filled}
          >
            <Star {...common} />
          </button>
        );
      })}
    </div>
  );
}
