"use client";

import React, { useCallback } from "react";
import { Clock, Copy } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { DAYS, type DaySchedule, type WizardData } from "../wizardConstants";

type Props = {
  data: WizardData;
  onChange: (updates: Partial<WizardData>) => void;
};

type ServiceMode = "continu" | "coupure";

export default function WizardStepHours({ data, onChange }: Props) {
  const schedule = data.hours ?? {};

  // Helper: get day schedule or default
  const getDaySchedule = useCallback(
    (dayKey: string): DaySchedule => {
      return (
        schedule[dayKey] ?? {
          open: false,
          mode: "continu" as ServiceMode,
          ranges: [{ from: "09:00", to: "18:00" }],
        }
      );
    },
    [schedule],
  );

  // Update a specific day
  const updateDay = useCallback(
    (dayKey: string, updates: Partial<DaySchedule>) => {
      const current = getDaySchedule(dayKey);
      const next = { ...current, ...updates };
      onChange({
        hours: {
          ...schedule,
          [dayKey]: next,
        },
      });
    },
    [schedule, getDaySchedule, onChange],
  );

  // Toggle day open/closed
  const toggleDay = useCallback(
    (dayKey: string, checked: boolean) => {
      const current = getDaySchedule(dayKey);
      updateDay(dayKey, {
        open: checked,
        mode: current.mode || "continu",
        ranges: current.ranges?.length
          ? current.ranges
          : [{ from: "09:00", to: "18:00" }],
      });
    },
    [getDaySchedule, updateDay],
  );

  // Change service mode
  const changeMode = useCallback(
    (dayKey: string, mode: ServiceMode) => {
      const current = getDaySchedule(dayKey);
      const ranges =
        mode === "coupure"
          ? [
              { from: current.ranges?.[0]?.from || "09:00", to: current.ranges?.[0]?.to || "12:00" },
              { from: "14:00", to: "18:00" },
            ]
          : [{ from: current.ranges?.[0]?.from || "09:00", to: current.ranges?.[0]?.to || "18:00" }];
      updateDay(dayKey, { mode, ranges });
    },
    [getDaySchedule, updateDay],
  );

  // Update a time value for a specific range
  const updateTime = useCallback(
    (dayKey: string, rangeIdx: number, field: "from" | "to", value: string) => {
      const current = getDaySchedule(dayKey);
      const ranges = [...(current.ranges || [])];
      ranges[rangeIdx] = { ...ranges[rangeIdx], [field]: value };
      updateDay(dayKey, { ranges });
    },
    [getDaySchedule, updateDay],
  );

  // Apply first open day's schedule to all days
  const applyToAll = useCallback(() => {
    const firstOpen = DAYS.find((d) => getDaySchedule(d.key).open);
    if (!firstOpen) return;
    const source = getDaySchedule(firstOpen.key);

    const newSchedule: Record<string, DaySchedule> = {};
    DAYS.forEach((d) => {
      newSchedule[d.key] = {
        open: true,
        mode: source.mode,
        ranges: source.ranges?.map((r) => ({ ...r })) ?? [
          { from: "09:00", to: "18:00" },
        ],
      };
    });
    onChange({ hours: newSchedule });
  }, [getDaySchedule, onChange]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Horaires d&rsquo;ouverture
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Informez vos clients de vos horaires d&rsquo;ouverture
        </p>
      </div>

      {/* Days */}
      <div className="space-y-3">
        {DAYS.map((day, dayIndex) => {
          const daySchedule = getDaySchedule(day.key);
          const isOpen = daySchedule.open;
          const mode: ServiceMode = daySchedule.mode || "continu";
          const ranges = daySchedule.ranges || [{ from: "09:00", to: "18:00" }];
          // Show "Appliquer à tous" on the first open day
          const isFirstOpenDay =
            isOpen && DAYS.findIndex((d) => getDaySchedule(d.key).open) === dayIndex;

          return (
            <div
              key={day.key}
              className={`rounded-lg border transition-colors ${
                isOpen
                  ? "border-s-[3px] border-s-green-400 border-t border-e border-b border-slate-200 bg-white"
                  : "border-slate-200 bg-slate-50/60"
              }`}
            >
              <div className="flex flex-wrap items-center gap-4 px-4 py-3">
                {/* Checkbox + label */}
                <div className="flex items-center gap-3 min-w-[140px]">
                  <Checkbox
                    id={`day-${day.key}`}
                    checked={isOpen}
                    onCheckedChange={(checked) =>
                      toggleDay(day.key, checked === true)
                    }
                    className="data-[state=checked]:bg-[#a3001d] data-[state=checked]:border-[#a3001d]"
                  />
                  <Label
                    htmlFor={`day-${day.key}`}
                    className={`text-sm font-medium ${
                      isOpen ? "text-slate-800" : "text-slate-400"
                    }`}
                  >
                    {day.label}
                  </Label>
                </div>

                {!isOpen ? (
                  <Badge
                    variant="secondary"
                    className="bg-slate-100 text-slate-400 font-normal"
                  >
                    Ferm&eacute;
                  </Badge>
                ) : (
                  <div className="flex flex-1 flex-wrap items-center gap-3">
                    {/* Service mode selector */}
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <Select
                        value={mode}
                        onValueChange={(v) =>
                          changeMode(day.key, v as ServiceMode)
                        }
                      >
                        <SelectTrigger className="h-8 w-[140px] rounded-md text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="continu">Continu</SelectItem>
                          <SelectItem value="coupure">
                            Avec coupure
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Time ranges */}
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Range 1 */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500">De</span>
                        <Input
                          type="time"
                          value={ranges[0]?.from || "09:00"}
                          onChange={(e) =>
                            updateTime(day.key, 0, "from", e.target.value)
                          }
                          className="h-8 w-[110px] rounded-md text-xs"
                        />
                        <span className="text-xs text-slate-500">
                          &Agrave;
                        </span>
                        <Input
                          type="time"
                          value={ranges[0]?.to || "18:00"}
                          onChange={(e) =>
                            updateTime(day.key, 0, "to", e.target.value)
                          }
                          className="h-8 w-[110px] rounded-md text-xs"
                        />
                      </div>

                      {/* Range 2 (only if mode = coupure) */}
                      {mode === "coupure" && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-slate-400">
                            |
                          </span>
                          <span className="text-xs text-slate-500">De</span>
                          <Input
                            type="time"
                            value={ranges[1]?.from || "14:00"}
                            onChange={(e) =>
                              updateTime(day.key, 1, "from", e.target.value)
                            }
                            className="h-8 w-[110px] rounded-md text-xs"
                          />
                          <span className="text-xs text-slate-500">
                            &Agrave;
                          </span>
                          <Input
                            type="time"
                            value={ranges[1]?.to || "18:00"}
                            onChange={(e) =>
                              updateTime(day.key, 1, "to", e.target.value)
                            }
                            className="h-8 w-[110px] rounded-md text-xs"
                          />
                        </div>
                      )}
                    </div>

                    {/* "Appliquer à tous" button on the first open day */}
                    {isFirstOpenDay && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="ms-auto shrink-0 gap-1.5 text-xs"
                        onClick={applyToAll}
                      >
                        <Copy className="h-3 w-3" />
                        Appliquer &agrave; tous
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
