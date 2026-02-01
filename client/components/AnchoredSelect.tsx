import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

export interface AnchoredSelectOption {
  value: string;
  label: string;
}

interface AnchoredSelectProps {
  icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: AnchoredSelectOption[];
  className?: string;
  title?: string;
  maxHeightClassName?: string;
  /** Fully override trigger button styles (for special layouts like mobile hero) */
  triggerClassName?: string;
}

export function AnchoredSelect({
  icon: Icon,
  value,
  onChange,
  placeholder,
  options,
  className = "",
  title,
  maxHeightClassName = "max-h-64",
  triggerClassName,
}: AnchoredSelectProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    return options.find((o) => o.value === value)?.label;
  }, [options, value]);

  const isPlaceholder = !selectedLabel;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const defaultTriggerClass = `w-full pl-10 pr-4 py-2 h-10 md:h-11 bg-slate-100 border border-slate-200 rounded-md text-left text-sm flex items-center justify-between transition-colors hover:bg-slate-100 hover:border-slate-300 focus-visible:border-primary/50 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${className}`;

  const trigger = (
    <button
      type="button"
      onClick={isMobile ? () => setOpen(true) : undefined}
      className={triggerClassName ?? defaultTriggerClass}
      style={{ fontFamily: "Circular Std, sans-serif" }}
      aria-haspopup={isMobile ? "dialog" : "menu"}
      aria-expanded={open}
    >
      <span
        className={`min-w-0 flex-1 truncate font-normal ${
          isPlaceholder ? "italic text-slate-500" : "not-italic text-slate-900"
        }`}
      >
        {selectedLabel || placeholder}
      </span>
      {!isMobile && <ChevronDown className="w-4 h-4 flex-shrink-0" />}
    </button>
  );

  const optionsList = (
    <div className={`overflow-y-auto ${maxHeightClassName} p-1`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => {
            onChange(o.value);
            setOpen(false);
          }}
          className={`w-full text-left rounded-lg px-3 py-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:bg-slate-100 ${
            o.value === value ? "bg-primary/5 text-primary font-semibold" : "text-slate-800 font-normal hover:bg-slate-50"
          }`}
          style={{ fontFamily: "Circular Std, sans-serif" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative w-full group">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary w-5 h-5 pointer-events-none transition-colors" />

      {isMobile ? (
        <>
          {trigger}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent
              side="bottom"
              className="p-0 rounded-t-2xl max-h-[80vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden"
              style={{ fontFamily: "Circular Std, sans-serif" }}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{title || placeholder}</SheetTitle>
              </SheetHeader>
              <div className="p-4 border-b border-slate-200">
                <div className="text-base font-semibold">{title || placeholder}</div>
              </div>
              {optionsList}
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={8}
            className="p-0 w-[var(--radix-popover-trigger-width)] rounded-xl border border-slate-200 bg-white shadow-xl shadow-black/10 overflow-hidden"
            style={{ fontFamily: "Circular Std, sans-serif" }}
          >
            {optionsList}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
