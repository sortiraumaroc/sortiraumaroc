import { Dumbbell } from "lucide-react";

import { AnchoredSelect } from "@/components/AnchoredSelect";
import { useI18n } from "@/lib/i18n";
import { getActivitiesByCategory } from "@/lib/taxonomy";

interface PrestationInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Override trigger button styles for special layouts */
  triggerClassName?: string;
}

export function PrestationInput({ value, onChange, className = "", triggerClassName }: PrestationInputProps) {
  const { t } = useI18n();
  const options = getActivitiesByCategory("sport").map((a) => ({ value: a.id, label: a.name }));

  return (
    <div className={`w-full ${className}`}>
      <AnchoredSelect
        icon={Dumbbell}
        value={value}
        onChange={onChange}
        placeholder={t("search.placeholder.prestation_type")}
        title={t("search.title.choose_prestation_type")}
        options={options}
        maxHeightClassName="max-h-72"
        triggerClassName={triggerClassName}
      />
    </div>
  );
}
