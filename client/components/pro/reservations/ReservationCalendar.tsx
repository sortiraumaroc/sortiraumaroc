import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import type { Reservation } from "@/lib/pro/types";
import { getComputedReservationKind } from "./reservationHelpers";

type Props = {
  reservations: Reservation[];
  onDayClick?: (date: Date, reservations: Reservation[]) => void;
};

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Add padding days from previous month
  const startDow = firstDay.getDay(); // 0 = Sunday
  const mondayStart = startDow === 0 ? 6 : startDow - 1; // Adjust to Monday start
  for (let i = mondayStart - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  // Add days of current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Add padding days from next month
  const endDow = lastDay.getDay();
  const daysToAdd = endDow === 0 ? 0 : 7 - endDow;
  for (let i = 1; i <= daysToAdd; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

type DayStats = {
  total: number;
  confirmed: number;
  pending: number;
  waitlist: number;
  cancelled: number;
};

function getDayStats(reservations: Reservation[]): DayStats {
  const stats: DayStats = { total: 0, confirmed: 0, pending: 0, waitlist: 0, cancelled: 0 };

  for (const r of reservations) {
    stats.total++;
    const kind = getComputedReservationKind(r);

    if (kind.startsWith("confirmed")) {
      stats.confirmed++;
    } else if (kind === "pending_pro" || kind === "modification_pending") {
      stats.pending++;
    } else if (kind === "waitlist") {
      stats.waitlist++;
    } else if (kind === "cancelled") {
      stats.cancelled++;
    }
  }

  return stats;
}

function getStatusColor(stats: DayStats): string {
  if (stats.pending > 0) return "bg-amber-100 border-amber-300 hover:bg-amber-200";
  if (stats.confirmed > 0) return "bg-emerald-50 border-emerald-200 hover:bg-emerald-100";
  if (stats.waitlist > 0) return "bg-blue-50 border-blue-200 hover:bg-blue-100";
  if (stats.cancelled > 0) return "bg-red-50 border-red-200 hover:bg-red-100";
  return "bg-white border-slate-200 hover:bg-slate-50";
}

export function ReservationCalendar({ reservations, onDayClick }: Props) {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const today = new Date();

  // Group reservations by date
  const reservationsByDate = useMemo(() => {
    const map = new Map<string, Reservation[]>();

    for (const r of reservations) {
      const date = new Date(r.starts_at);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(r);
    }

    return map;
  }, [reservations]);

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold text-slate-900 capitalize ms-2">
            {formatMonthYear(currentDate)}
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={goToToday}>
          Aujourd'hui
        </Button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-b border-slate-100 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
          <span className="text-slate-600">Confirmées</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
          <span className="text-slate-600">En attente</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-blue-100 border border-blue-300" />
          <span className="text-slate-600">Liste d'attente</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-100 border border-red-300" />
          <span className="text-slate-600">Annulées</span>
        </div>
      </div>

      {/* Week days header */}
      <div className="grid grid-cols-7 border-b border-slate-200">
        {weekDays.map((day) => (
          <div key={day} className="p-2 text-center text-xs font-medium text-slate-500 bg-slate-50">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const isCurrentMonth = day.getMonth() === month;
          const isToday = isSameDay(day, today);
          const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
          const dayReservations = reservationsByDate.get(key) ?? [];
          const stats = getDayStats(dayReservations);
          const colorClass = stats.total > 0 ? getStatusColor(stats) : "";

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onDayClick?.(day, dayReservations)}
              className={`
                min-h-[80px] p-1 border-b border-e border-slate-100
                text-start transition-colors
                ${isCurrentMonth ? "text-slate-900" : "text-slate-400 bg-slate-50/50"}
                ${isToday ? "ring-2 ring-primary ring-inset" : ""}
                ${colorClass}
                ${onDayClick ? "cursor-pointer" : "cursor-default"}
              `}
            >
              <div className="flex flex-col h-full">
                <div className={`text-sm font-medium ${isToday ? "text-primary font-bold" : ""}`}>
                  {day.getDate()}
                </div>

                {stats.total > 0 && isCurrentMonth && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {stats.confirmed > 0 && (
                      <Badge className="text-[10px] px-1 py-0 bg-emerald-100 text-emerald-700 border-emerald-200">
                        {stats.confirmed}
                      </Badge>
                    )}
                    {stats.pending > 0 && (
                      <Badge className="text-[10px] px-1 py-0 bg-amber-100 text-amber-700 border-amber-200">
                        {stats.pending}
                      </Badge>
                    )}
                    {stats.waitlist > 0 && (
                      <Badge className="text-[10px] px-1 py-0 bg-blue-100 text-blue-700 border-blue-200">
                        {stats.waitlist}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
