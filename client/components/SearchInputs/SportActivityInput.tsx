import { useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import { SelectModal } from "@/components/SelectModal";
import { useIsMobile } from "@/hooks/use-mobile";
import { useI18n } from "@/lib/i18n";

interface SportActivityInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const SPORT_ACTIVITIES = [
  "Yoga",
  "Hammam",
  "Spa",
  "Massage",
  "Fitness",
  "Natation",
  "Tennis",
  "Golf",
  "Équitation",
  "Ski",
  "Surf",
  "Rock Climbing",
  "Vélo",
  "Jogging",
  "Pilates",
  "Boxe",
];

export function SportActivityInput({ value, onChange, className = "" }: SportActivityInputProps) {
  const { t } = useI18n();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isMobile = useIsMobile();

  const activityOptions = SPORT_ACTIVITIES.map((activity) => ({
    id: activity,
    label: activity,
  }));

  return (
    <div className={`w-full ${className}`}>
      <div className="relative h-10 md:h-11">
        <Activity className="absolute start-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="w-full ps-10 pe-4 py-2 h-full bg-slate-100 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary italic text-gray-700 text-start text-sm flex items-center justify-between [font-family:Circular_Std,_sans-serif]"
        >
          <span className={value ? "text-gray-700 italic font-normal" : "text-gray-700 italic font-normal"}>
            {value || t("search.placeholder.sport_activity_type")}
          </span>
          {!isMobile && <ChevronDown className="w-4 h-4 flex-shrink-0" />}
        </button>
      </div>
      <SelectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t("search.title.choose_sport_activity_type")}
        options={activityOptions}
        value={value}
        onChange={onChange}
        isMobile={isMobile}
      />
    </div>
  );
}
