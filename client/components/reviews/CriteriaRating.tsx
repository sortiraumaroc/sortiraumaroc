import { ConciergeBell, Handshake, MapPin, Sofa, Sparkles, Wallet } from "lucide-react";

import { StarRating } from "@/components/reviews/StarRating";
import { cn } from "@/lib/utils";

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

export function CriteriaRatingsForm({
  value,
  onChange,
}: {
  value: BookingReviewCriteria;
  onChange: (next: BookingReviewCriteria) => void;
}) {
  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {CRITERIA_CONFIG.map(({ key, label, Icon }, idx) => (
        <div
          key={key}
          className={cn("flex items-center gap-3 p-3", idx === 0 ? "rounded-t-lg" : undefined)}
        >
          <div className="h-9 w-9 rounded-md bg-primary/5 border border-primary/15 flex items-center justify-center text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">{label}</div>
          </div>
          <StarRating
            value={value[key]}
            onChange={(next) => onChange({ ...value, [key]: next })}
            ariaLabel={label}
          />
        </div>
      ))}
    </div>
  );
}

export function CriteriaRatingsDisplay({ criteria }: { criteria: BookingReviewCriteria }) {
  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {CRITERIA_CONFIG.map(({ key, label, Icon }, idx) => (
        <div key={key} className={cn("flex items-center gap-3 p-3", idx === 0 ? "rounded-t-lg" : undefined)}>
          <div className="h-9 w-9 rounded-md bg-primary/5 border border-primary/15 flex items-center justify-center text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">{label}</div>
          </div>
          <StarRating value={criteria[key]} readonly ariaLabel={label} />
        </div>
      ))}
    </div>
  );
}
