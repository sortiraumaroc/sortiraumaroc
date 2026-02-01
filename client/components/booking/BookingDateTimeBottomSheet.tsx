import * as React from "react";
import { CalendarDays, Clock3, Users, X } from "lucide-react";

import type { BookingType, ServiceType } from "@/hooks/useBooking";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

import { BottomSheetDatePicker } from "@/components/booking/BottomSheetDatePicker";
import { BottomSheetTimePicker, type TimeSlot } from "@/components/booking/BottomSheetTimePicker";
import { BottomSheetPersonsPicker } from "@/components/booking/BottomSheetPersonsPicker";

export type BookingBottomSheetTab = "date" | "time" | "persons";

export type ServiceTimesConfig = {
  service: ServiceType;
  label: string;
  times: string[];
};

export type BookingDateTimeBottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  tab: BookingBottomSheetTab;
  onTabChange: (tab: BookingBottomSheetTab) => void;

  bookingType: BookingType;

  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;

  selectedTime: string | null;
  onSelectTime: (time: string | null) => void;

  partySize: number | null;
  onSelectPartySize: (size: number) => void;

  selectedService: ServiceType | null;
  onSelectService: (service: ServiceType) => void;

  activityTimes: string[];
  serviceTimes: ServiceTimesConfig[];

  closeOnTimeSelect?: boolean;
  closeOnPersonsSelect?: boolean;
};

function titleForTab(tab: BookingBottomSheetTab, t: (key: string, params?: Record<string, any>) => string): string {
  switch (tab) {
    case "date":
      return t("booking.step1.section.date");
    case "time":
      return t("booking.step1.section.time");
    case "persons":
      return t("booking.step1.section.people");
  }
}

function formatDateValue(date: Date | null, intlLocale: string): string {
  if (!date) return "";
  return date.toLocaleDateString(intlLocale, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function BookingDateTimeBottomSheet({
  open,
  onOpenChange,
  tab,
  onTabChange,
  bookingType,
  selectedDate,
  onSelectDate,
  selectedTime,
  onSelectTime,
  partySize,
  onSelectPartySize,
  selectedService,
  onSelectService,
  activityTimes,
  serviceTimes,
  closeOnTimeSelect = true,
  closeOnPersonsSelect = true,
}: BookingDateTimeBottomSheetProps) {
  const { t, intlLocale } = useI18n();
  const sheetTitle = titleForTab(tab, t);
  const timesForTab = React.useMemo((): TimeSlot[] => {
    if (bookingType === "activity") {
      return activityTimes.map((t) => ({ value: t }));
    }

    if (bookingType === "restaurant") {
      const currentService = selectedService ?? serviceTimes[0]?.service;
      const cfg = serviceTimes.find((s) => s.service === currentService);
      const list = cfg?.times ?? [];
      return list.map((t) => ({ value: t }));
    }

    return [];
  }, [activityTimes, bookingType, selectedService, serviceTimes]);

  const serviceOptions = React.useMemo(() => {
    if (bookingType !== "restaurant") return [];
    return serviceTimes.map((s) => ({ value: s.service, label: s.label }));
  }, [bookingType, serviceTimes]);

  const resolvedService = bookingType === "restaurant" ? (selectedService ?? serviceTimes[0]?.service ?? null) : null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} dismissible shouldScaleBackground>
      <DrawerContent
        className="rounded-t-3xl border-none bg-white h-[50vh] overflow-hidden flex flex-col"
        aria-label={sheetTitle}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-colors"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5 text-slate-700" />
          </button>

          <DrawerTitle className="text-lg font-bold text-slate-900 tracking-tight">{sheetTitle}</DrawerTitle>

          <div className="h-9 w-9" aria-hidden="true" />
        </div>

        <Tabs value={tab} onValueChange={(v) => onTabChange(v as BookingBottomSheetTab)} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-4 pb-3 flex-shrink-0">
            <TabsList className="w-full rounded-full bg-slate-50 p-1 border-2 border-primary h-12">
              <TabsTrigger
                value="date"
                className="flex-1 rounded-full h-10 gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-600"
              >
                <CalendarDays className="h-4 w-4" />
                <span className="text-sm font-semibold">{t("booking.bottomsheet.tab.date")}</span>
              </TabsTrigger>
              <TabsTrigger
                value="time"
                className="flex-1 rounded-full h-10 gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-600"
              >
                <Clock3 className="h-4 w-4" />
                <span className="text-sm font-semibold">{t("booking.bottomsheet.tab.time")}</span>
              </TabsTrigger>
              <TabsTrigger
                value="persons"
                className="flex-1 rounded-full h-10 gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-600"
              >
                <Users className="h-4 w-4" />
                <span className="text-sm font-semibold">{t("booking.bottomsheet.tab.persons_short")}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="px-4 pb-[max(20px,env(safe-area-inset-bottom))] overflow-y-auto flex-1">
            <TabsContent value="date" className="mt-0 h-full">
              <BottomSheetDatePicker
                value={selectedDate}
                onChange={(date) => {
                  onSelectDate(date);
                }}
                minDate={new Date()}
              />
            </TabsContent>

            <TabsContent value="time" className="mt-0">
              {bookingType === "restaurant" ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {serviceOptions.map((opt) => {
                      const active = resolvedService === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onSelectService(opt.value);
                            onSelectTime(null);
                          }}
                          className={cn(
                            "flex-1 h-11 rounded-full border text-sm font-semibold transition-colors",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                          )}
                          aria-label={opt.label}
                          aria-pressed={active}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  <BottomSheetTimePicker
                    value={selectedTime}
                    onChange={(t) => {
                      onSelectTime(t);
                      if (closeOnTimeSelect) onOpenChange(false);
                    }}
                    slots={timesForTab}
                    columns={3}
                  />
                </div>
              ) : (
                <BottomSheetTimePicker
                  value={selectedTime}
                  onChange={(t) => {
                    onSelectTime(t);
                    if (closeOnTimeSelect) onOpenChange(false);
                  }}
                  slots={timesForTab}
                  columns={3}
                />
              )}
            </TabsContent>

            <TabsContent value="persons" className="mt-0">
              <BottomSheetPersonsPicker
                value={partySize}
                onChange={(n) => {
                  onSelectPartySize(n);
                  if (closeOnPersonsSelect) onOpenChange(false);
                }}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}
