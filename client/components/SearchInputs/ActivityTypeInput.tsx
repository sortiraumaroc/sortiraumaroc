import { Zap } from "lucide-react";

import { AnchoredSelect } from "@/components/AnchoredSelect";
import { useI18n } from "@/lib/i18n";
import { getActivitiesByCategory } from "@/lib/taxonomy";

interface ActivityTypeInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Override trigger button styles for special layouts */
  triggerClassName?: string;
}

export function ActivityTypeInput({ value, onChange, className = "", triggerClassName }: ActivityTypeInputProps) {
  const { t } = useI18n();
  const options = getActivitiesByCategory("loisirs").map((a) => ({ value: a.id, label: a.name }));

  return (
    <div className={`w-full ${className}`}>
      <AnchoredSelect
        icon={Zap}
        value={value}
        onChange={onChange}
        placeholder={t("search.placeholder.sport_activity_type")}
        title={t("search.title.choose_sport_activity_type")}
        options={options}
        maxHeightClassName="max-h-72"
        triggerClassName={triggerClassName}
      />
    </div>
  );
}
