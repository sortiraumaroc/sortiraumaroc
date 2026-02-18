import * as React from "react";
import { useState, useCallback, useEffect } from "react";
import { X, Calendar, Clock, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

// Types
export type FilterTab = "date" | "time" | "persons";

export interface ResultsFilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;

  // Date
  selectedDate: Date | null;
  onDateChange: (date: Date) => void;
  minDate?: Date;
  disabledDates?: (date: Date) => boolean;

  // Time
  selectedTime: string | null;
  onTimeChange: (time: string) => void;
  availableTimeSlots?: string[];

  // Persons
  selectedPersons: number;
  onPersonsChange: (persons: number) => void;
  maxPersons?: number;
}

// Generate default time slots (30 minute intervals from 09:00 to 23:30)
const DEFAULT_TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30",
  "21:00", "21:30", "22:00", "22:30", "23:00", "23:30",
];

// Calendar component for date selection — exported for desktop popover reuse
export function CalendarGrid({
  selectedDate,
  onDateChange,
  minDate,
  disabledDates,
}: {
  selectedDate: Date | null;
  onDateChange: (date: Date) => void;
  minDate?: Date;
  disabledDates?: (date: Date) => boolean;
}) {
  const { t } = useI18n();
  const [viewMonth, setViewMonth] = useState(() => selectedDate || new Date());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const effectiveMinDate = minDate || today;

  // Get month details
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();

  // Get the day of week for the first day (0 = Sunday, adjust to Monday start)
  const startDay = (firstDayOfMonth.getDay() + 6) % 7;

  // Generate days array
  const days: (Date | null)[] = [];
  // Add empty slots for days before the first day
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  // Add all days of the month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }

  const weekDays = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

  const monthNames = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];

  const canGoPrev = new Date(year, month - 1, 1) >= new Date(effectiveMinDate.getFullYear(), effectiveMinDate.getMonth(), 1);

  const isDateSame = (d1: Date | null, d2: Date | null) => {
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const isDisabled = (date: Date | null) => {
    if (!date) return true;
    if (date < effectiveMinDate) return true;
    if (disabledDates?.(date)) return true;
    return false;
  };

  return (
    <div className="px-2">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => setViewMonth(new Date(year, month - 1, 1))}
          disabled={!canGoPrev}
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded-full transition-colors",
            canGoPrev ? "hover:bg-slate-100 text-slate-700" : "text-slate-300 cursor-not-allowed"
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold text-slate-900">
          {monthNames[month]} {year}
        </h3>
        <button
          type="button"
          onClick={() => setViewMonth(new Date(year, month + 1, 1))}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-700 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div
            key={day}
            className="h-10 flex items-center justify-center text-sm font-medium text-slate-500"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, idx) => {
          if (!date) {
            return <div key={`empty-${idx}`} className="h-10" />;
          }

          const disabled = isDisabled(date);
          const selected = isDateSame(date, selectedDate);
          const isToday = isDateSame(date, today);

          return (
            <button
              key={date.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => onDateChange(date)}
              className={cn(
                "h-10 w-full rounded-full text-sm font-medium transition-all",
                disabled && "text-slate-300 cursor-not-allowed",
                !disabled && !selected && "text-slate-700 hover:bg-slate-100",
                !disabled && selected && "bg-primary text-white",
                !disabled && !selected && isToday && "ring-2 ring-primary/30 ring-inset"
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Time slots grid — exported for desktop popover reuse
export function TimeGrid({
  selectedTime,
  onTimeChange,
  availableSlots,
}: {
  selectedTime: string | null;
  onTimeChange: (time: string) => void;
  availableSlots?: string[];
}) {
  const slots = availableSlots?.length ? availableSlots : DEFAULT_TIME_SLOTS;

  return (
    <div className="grid grid-cols-3 gap-3 px-2">
      {slots.map((time) => {
        const selected = selectedTime === time;
        return (
          <button
            key={time}
            type="button"
            onClick={() => onTimeChange(time)}
            className={cn(
              "h-12 rounded-xl border text-sm font-semibold transition-all",
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            {time}
          </button>
        );
      })}
    </div>
  );
}

// Persons grid — exported for desktop popover reuse
export function PersonsGrid({
  selectedPersons,
  onPersonsChange,
  maxPersons = 20,
}: {
  selectedPersons: number;
  onPersonsChange: (persons: number) => void;
  maxPersons?: number;
}) {
  const { t } = useI18n();
  const displayCount = Math.min(maxPersons, 15);

  return (
    <div className="px-2">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: displayCount }, (_, i) => i + 1).map((n) => {
          const selected = selectedPersons === n;
          const label = n === 1 ? "1 pers." : `${n} pers.`;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onPersonsChange(n)}
              className={cn(
                "h-12 rounded-xl border text-sm font-semibold transition-all",
                selected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {maxPersons > displayCount && (
        <p className="text-center text-sm text-slate-500 mt-4">
          Pour plus de {displayCount} personnes, contactez directement l'établissement
        </p>
      )}
    </div>
  );
}

export function ResultsFilterBottomSheet({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  selectedDate,
  onDateChange,
  minDate,
  disabledDates,
  selectedTime,
  onTimeChange,
  availableTimeSlots,
  selectedPersons,
  onPersonsChange,
  maxPersons = 20,
}: ResultsFilterBottomSheetProps) {
  const { t } = useI18n();

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Get title based on active tab
  const getTitle = () => {
    switch (activeTab) {
      case "date":
        return "Sélectionnez une date";
      case "time":
        return "Sélectionnez une heure";
      case "persons":
        return "Sélectionnez un nombre de personnes";
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Bottom Sheet - Fixed height for consistency */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50",
          "bg-white rounded-t-3xl shadow-2xl",
          "h-[70vh] flex flex-col",
          "animate-in slide-in-from-bottom duration-300"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
          <h2 className="text-base font-bold text-slate-900">
            {getTitle()}
          </h2>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>

        {/* Tabs - TheFork style */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center p-1 bg-slate-100 rounded-full">
            <button
              onClick={() => onTabChange("date")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-full text-sm font-semibold transition-all",
                activeTab === "date"
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Calendar className="w-4 h-4" />
              <span>Date</span>
            </button>
            <button
              onClick={() => onTabChange("time")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-full text-sm font-semibold transition-all",
                activeTab === "time"
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Clock className="w-4 h-4" />
              <span>Heure</span>
            </button>
            <button
              onClick={() => onTabChange("persons")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-full text-sm font-semibold transition-all",
                activeTab === "persons"
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Users className="w-4 h-4" />
              <span>Pers.</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4">
          {activeTab === "date" && (
            <CalendarGrid
              selectedDate={selectedDate}
              onDateChange={(date) => {
                onDateChange(date);
                // Auto-advance to time tab
                onTabChange("time");
              }}
              minDate={minDate}
              disabledDates={disabledDates}
            />
          )}

          {activeTab === "time" && (
            <TimeGrid
              selectedTime={selectedTime}
              onTimeChange={(time) => {
                onTimeChange(time);
                // Auto-advance to persons tab
                onTabChange("persons");
              }}
              availableSlots={availableTimeSlots}
            />
          )}

          {activeTab === "persons" && (
            <PersonsGrid
              selectedPersons={selectedPersons}
              onPersonsChange={(persons) => {
                onPersonsChange(persons);
                // Close after selecting persons
                onClose();
              }}
              maxPersons={maxPersons}
            />
          )}
        </div>

        {/* Footer with current selection summary */}
        <div className="px-4 py-4 border-t border-slate-100 bg-white safe-area-inset-bottom">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 text-sm text-slate-600">
              {selectedDate && (
                <span className="inline-flex items-center gap-1 me-3">
                  <Calendar className="w-4 h-4" />
                  {selectedDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
              )}
              {selectedTime && (
                <span className="inline-flex items-center gap-1 me-3">
                  <Clock className="w-4 h-4" />
                  {selectedTime}
                </span>
              )}
              {selectedPersons > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {selectedPersons} pers.
                </span>
              )}
            </div>
            <Button
              onClick={onClose}
              className="px-6"
            >
              Appliquer
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
