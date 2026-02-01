import { forwardRef, useMemo, useState } from "react";
import { Minus, Plus, Users } from "lucide-react";

type TriggerButtonProps = {
  summary: string;
  isPlaceholder?: boolean;
  inputClassName?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className">;

const TriggerButton = forwardRef<HTMLButtonElement, TriggerButtonProps>(
  ({ summary, isPlaceholder = false, inputClassName = "", ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={`w-full pl-10 pr-4 py-2 h-10 md:h-11 bg-slate-100 border border-slate-200 rounded-md text-left text-sm flex items-center justify-between transition-colors hover:bg-slate-100 hover:border-slate-300 focus-visible:border-primary/50 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${inputClassName}`}
      style={{ fontFamily: "Circular Std, sans-serif" }}
      {...props}
    >
      <span className={`font-normal ${isPlaceholder ? "italic text-slate-600" : "not-italic text-slate-900"}`}>{summary}</span>
      <span className="text-slate-400">▾</span>
    </button>
  ),
);
TriggerButton.displayName = "TriggerButton";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useI18n } from "@/lib/i18n";

export type AgeGroupKey = "age0_2" | "age3_6" | "age6_12" | "age12_17" | "age18_plus";

export type PersonsByAge = Record<AgeGroupKey, number>;

const AGE_GROUPS: Array<{ key: AgeGroupKey; labelKey: string }> = [
  { key: "age0_2", labelKey: "persons.age_group.age0_2" },
  { key: "age3_6", labelKey: "persons.age_group.age3_6" },
  { key: "age6_12", labelKey: "persons.age_group.age6_12" },
  { key: "age12_17", labelKey: "persons.age_group.age12_17" },
  { key: "age18_plus", labelKey: "persons.age_group.age18_plus" },
];

function clampNonNegative(n: number) {
  return n < 0 ? 0 : n;
}

function getTotal(counts: PersonsByAge) {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

function defaultCounts(): PersonsByAge {
  return {
    age0_2: 0,
    age3_6: 0,
    age6_12: 0,
    age12_17: 0,
    age18_plus: 2,
  };
}

export function PersonsSelector({
  value,
  onChange,
  maxTotal,
  className = "",
}: {
  value?: PersonsByAge;
  onChange: (value: PersonsByAge) => void;
  maxTotal?: number;
  className?: string;
}) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const [draft, setDraft] = useState<PersonsByAge>(value || defaultCounts());

  const total = useMemo(() => getTotal(value || defaultCounts()), [value]);
  const draftTotal = useMemo(() => getTotal(draft), [draft]);
  const unit = total === 1 ? t("common.person.one") : t("common.person.other");
  const isPlaceholder = total <= 0;
  const summary = total > 0 ? `${total} ${unit}` : t("persons.title");

  const panel = (
    <div className="flex flex-col h-full" style={{ fontFamily: "Circular Std, sans-serif" }}>
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-4 border-b border-slate-200">
        <div className="text-lg font-semibold">{t("persons.title")}</div>
      </div>

      <div className="px-4 py-4 space-y-3 overflow-y-auto">
        {AGE_GROUPS.map(({ key, labelKey }) => {
          const label = t(labelKey);
          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="text-sm italic text-gray-700">{label}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, [key]: clampNonNegative(p[key] - 1) }))}
                  className="h-9 w-9 rounded-md border border-slate-200 bg-white transition-colors hover:bg-slate-50 hover:border-slate-300 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  aria-label={t("persons.action.remove", { label })}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <div className="w-10 text-center text-sm italic text-gray-700">{draft[key]}</div>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof maxTotal === "number" && draftTotal >= maxTotal) return;
                    setDraft((p) => ({ ...p, [key]: p[key] + 1 }));
                  }}
                  className="h-9 w-9 rounded-md border border-slate-200 bg-white transition-colors hover:bg-slate-50 hover:border-slate-300 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  aria-label={t("persons.action.add", { label })}
                  disabled={typeof maxTotal === "number" && draftTotal >= maxTotal}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-4">
        <Button
          type="button"
          onClick={() => {
            onChange(draft);
            setOpen(false);
          }}
          className="w-full h-11 bg-[#a3001d] hover:bg-[#a3001d]/90 text-white"
          style={{ fontFamily: "Circular Std, sans-serif" }}
        >
          {t("persons.button.confirm")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="relative w-full group">
      <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary w-5 h-5 pointer-events-none transition-colors" />

      {isMobile ? (
        <>
          <TriggerButton
            summary={summary}
            isPlaceholder={isPlaceholder}
            inputClassName={className}
            onClick={() => {
              setDraft(value || defaultCounts());
              setOpen(true);
            }}
          />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent
              side="bottom"
              className="p-0 rounded-t-2xl max-h-[90vh] h-[90vh] border border-slate-200 shadow-2xl overflow-hidden"
              hideCloseButton
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{t("persons.title")}</SheetTitle>
              </SheetHeader>
              {panel}
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (next) setDraft(value || defaultCounts());
            setOpen(next);
          }}
        >
          <PopoverTrigger asChild>
            <TriggerButton summary={summary} isPlaceholder={isPlaceholder} inputClassName={className} />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={8}
            className="p-0 w-[min(420px,calc(100vw-32px))] rounded-xl border border-slate-200 bg-white shadow-xl shadow-black/10 overflow-hidden"
            style={{ fontFamily: "Circular Std, sans-serif" }}
          >
            {panel}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
