import * as React from "react";

import { SamCalendar } from "@/components/SamCalendar";

export type BottomSheetDatePickerProps = {
  value: Date | null;
  onChange: (date: Date) => void;
  minDate?: Date;
  isDateDisabled?: (date: Date) => boolean;
  className?: string;
};


export function BottomSheetDatePicker({ value, onChange, minDate, isDateDisabled, className }: BottomSheetDatePickerProps) {
  return (
    <SamCalendar
      value={value}
      onChange={onChange}
      minDate={minDate}
      disabledDates={isDateDisabled}
      className={className}
    />
  );
}
