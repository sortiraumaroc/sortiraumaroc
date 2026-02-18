import { useState } from "react";
import { Copy } from "lucide-react";
import type { ProWizardData } from "../../../../lib/pro/types";
import { DAYS, type DaySchedule } from "../proWizardConstants";

type Props = {
  data: Partial<ProWizardData>;
  onChange: (patch: Partial<ProWizardData>) => void;
};

const DEFAULT_RANGE = { from: "09:00", to: "23:00" };

export function ProWizardStepHours({ data, onChange }: Props) {
  const hours = (data.hours ?? {}) as Record<string, DaySchedule>;
  const [copySource, setCopySource] = useState<string | null>(null);

  const updateDay = (dayKey: string, patch: Partial<DaySchedule>) => {
    const current = hours[dayKey] ?? {
      open: false,
      mode: "continu" as const,
      ranges: [{ ...DEFAULT_RANGE }],
    };
    onChange({
      hours: {
        ...hours,
        [dayKey]: { ...current, ...patch },
      },
    });
  };

  const copyToAll = (sourceDayKey: string) => {
    const source = hours[sourceDayKey];
    if (!source) return;
    const newHours: Record<string, DaySchedule> = {};
    for (const day of DAYS) {
      newHours[day.key] = { ...source };
    }
    onChange({ hours: newHours });
    setCopySource(sourceDayKey);
    setTimeout(() => setCopySource(null), 1500);
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          Horaires d'ouverture
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Indiquez vos horaires pour chaque jour de la semaine.
        </p>
      </div>

      <div className="space-y-3">
        {DAYS.map((day) => {
          const dayData = hours[day.key] ?? {
            open: false,
            mode: "continu" as const,
            ranges: [{ ...DEFAULT_RANGE }],
          };
          const isOpen = dayData.open;
          const mode = dayData.mode ?? "continu";
          const ranges = dayData.ranges ?? [{ ...DEFAULT_RANGE }];

          return (
            <div
              key={day.key}
              className="rounded-lg border border-gray-200 p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => updateDay(day.key, { open: !isOpen })}
                    className={`relative h-5 w-9 rounded-full transition-colors ${isOpen ? "bg-[#a3001d]" : "bg-gray-300"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isOpen ? "start-[18px]" : "start-0.5"}`}
                    />
                  </button>
                  <span className="w-20 text-sm font-medium text-gray-700">
                    {day.label}
                  </span>
                </div>

                {isOpen && (
                  <div className="flex items-center gap-2">
                    {/* Mode toggle */}
                    <select
                      value={mode}
                      onChange={(e) =>
                        updateDay(day.key, {
                          mode: e.target.value as "continu" | "coupure",
                          ranges:
                            e.target.value === "coupure"
                              ? [
                                  { from: "09:00", to: "14:00" },
                                  { from: "18:00", to: "23:00" },
                                ]
                              : [{ ...DEFAULT_RANGE }],
                        })
                      }
                      className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600"
                    >
                      <option value="continu">Continu</option>
                      <option value="coupure">Avec coupure</option>
                    </select>

                    {/* Copy to all */}
                    <button
                      type="button"
                      onClick={() => copyToAll(day.key)}
                      title="Copier ces horaires à tous les jours"
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-[#a3001d]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {copySource === day.key && (
                      <span className="text-[10px] text-green-600">
                        Copié !
                      </span>
                    )}
                  </div>
                )}
              </div>

              {isOpen && (
                <div className="mt-2 space-y-2">
                  {ranges.map((range, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {mode === "coupure" && (
                        <span className="w-16 text-xs text-gray-400">
                          {idx === 0 ? "Matin" : "Soir"}
                        </span>
                      )}
                      <input
                        type="time"
                        value={range.from}
                        onChange={(e) => {
                          const newRanges = [...ranges];
                          newRanges[idx] = { ...newRanges[idx], from: e.target.value };
                          updateDay(day.key, { ranges: newRanges });
                        }}
                        className="rounded border border-gray-200 px-2 py-1.5 text-sm"
                      />
                      <span className="text-xs text-gray-400">à</span>
                      <input
                        type="time"
                        value={range.to}
                        onChange={(e) => {
                          const newRanges = [...ranges];
                          newRanges[idx] = { ...newRanges[idx], to: e.target.value };
                          updateDay(day.key, { ranges: newRanges });
                        }}
                        className="rounded border border-gray-200 px-2 py-1.5 text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              {!isOpen && (
                <p className="mt-1 text-xs text-gray-400">Fermé</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
