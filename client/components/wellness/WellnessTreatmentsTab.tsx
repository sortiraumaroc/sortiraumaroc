import * as React from "react";
import { Gift } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export type WellnessTreatment = {
  title: string;
  duration: string;
  priceMad: number;
  note?: string;
  category?: string;
};

type WellnessTreatmentsTabProps = {
  treatments: WellnessTreatment[];
  onGoToSlots?: () => void;
  className?: string;
};

type CategoryId = "packs" | "hammam" | "massage" | "cils" | "onglerie" | "coiffure" | "autres";

type CategoryDefinition = {
  id: CategoryId;
  labelKey: string;
};

type CategoryWithItems = {
  id: CategoryId;
  label: string;
  items: WellnessTreatment[];
};

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  { id: "packs", labelKey: "treatments.category.packs" },
  { id: "hammam", labelKey: "treatments.category.hammam" },
  { id: "massage", labelKey: "treatments.category.massage" },
  { id: "cils", labelKey: "treatments.category.cils" },
  { id: "onglerie", labelKey: "treatments.category.onglerie" },
  { id: "coiffure", labelKey: "treatments.category.coiffure" },
];

function formatMad(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("fr-MA").format(Math.round(value))} MAD`;
}

function normalized(value: string | undefined | null): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function guessCategoryFromLabel(label?: string): CategoryId | null {
  const v = normalized(label);
  if (!v) return null;

  if (v.includes("pack")) return "packs";
  if (v.includes("hammam")) return "hammam";
  if (v.includes("massage")) return "massage";
  if (v.includes("cils") || v.includes("sourcil")) return "cils";

  if (v.includes("manuc") || v.includes("pedic") || v.includes("ongl")) return "onglerie";
  if (v.includes("coiff") || v.includes("brushing") || v.includes("capillaire")) return "coiffure";

  return null;
}

function guessCategory(treatment: WellnessTreatment): CategoryId {
  const byCategory = guessCategoryFromLabel(treatment.category);
  if (byCategory) return byCategory;

  const title = normalized(treatment.title);
  const note = normalized(treatment.note);

  const byTitle = guessCategoryFromLabel(title);
  if (byTitle) return byTitle;

  if (title.includes("gommage")) return "hammam";
  if (title.includes("deep") || title.includes("tissue") || title.includes("pierre")) return "massage";
  if (title.includes("brow")) return "cils";
  if (note.includes("pack")) return "packs";

  return "autres";
}

function sortTreatments(items: WellnessTreatment[]): WellnessTreatment[] {
  return [...items].sort((a, b) => {
    const ap = Number.isFinite(a.priceMad) ? a.priceMad : Number.POSITIVE_INFINITY;
    const bp = Number.isFinite(b.priceMad) ? b.priceMad : Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
  });
}

function groupByCategory(treatments: WellnessTreatment[]) {
  const map: Record<CategoryId, WellnessTreatment[]> = {
    packs: [],
    hammam: [],
    massage: [],
    cils: [],
    onglerie: [],
    coiffure: [],
    autres: [],
  };

  for (const t of treatments) {
    if (!t || !t.title) continue;
    map[guessCategory(t)].push(t);
  }

  for (const key of Object.keys(map) as CategoryId[]) {
    map[key] = sortTreatments(map[key]);
  }

  return map;
}

function isPackLimited(pack: WellnessTreatment): boolean {
  const note = normalized(pack.note);
  const title = normalized(pack.title);
  return note.includes("limite") || note.includes("limite") || title.includes("limite");
}

function PackCard({ pack, onReserve }: { pack: WellnessTreatment; onReserve?: () => void }) {
  const note = (pack.note ?? "").trim();
  const limited = isPackLimited(pack);

  return (
    <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            <div className="text-base sm:text-lg font-semibold text-slate-900">🎁 {pack.title}</div>
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-700">⏱ {pack.duration}</div>
        </div>

        {limited ? (
          <span className="shrink-0 inline-flex items-center rounded-full bg-orange-100 text-orange-800 px-3 py-1 text-xs font-semibold">
            Offre limitée
          </span>
        ) : note ? (
          <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
            {note}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="text-sm text-slate-700">💰 {formatMad(pack.priceMad)} / personne</div>
      </div>

      {onReserve ? (
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="brand" onClick={onReserve} className="w-full sm:w-auto sm:px-8 h-10 text-sm font-semibold rounded-xl">
            Réserver ce pack
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TreatmentRow({ treatment }: { treatment: WellnessTreatment }) {
  const note = (treatment.note ?? "").trim();

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="min-w-0">
        <div className="text-sm sm:text-base font-semibold text-slate-900 leading-snug">{treatment.title}</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {treatment.duration ? (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              ⏱ {treatment.duration}
            </span>
          ) : null}
          {note ? (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {note}
            </span>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-sm sm:text-base font-bold text-primary tabular-nums whitespace-nowrap">{formatMad(treatment.priceMad)}</div>
      </div>
    </div>
  );
}

function CategoryNavButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full text-left px-4 py-3 rounded-xl border text-sm font-semibold transition",
        active ? "bg-primary text-white border-primary" : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50",
        disabled ? "opacity-50 cursor-not-allowed hover:bg-white" : "",
      )}
    >
      {label}
    </button>
  );
}

export function WellnessTreatmentsTab({ treatments, onGoToSlots, className }: WellnessTreatmentsTabProps) {
  const { t } = useI18n();
  const items = React.useMemo(() => (Array.isArray(treatments) ? treatments : []), [treatments]);
  const grouped = React.useMemo(() => groupByCategory(items), [items]);

  const categories: CategoryWithItems[] = React.useMemo(() => {
    const base = CATEGORY_DEFINITIONS.map((c) => ({ id: c.id, label: t(c.labelKey), items: grouped[c.id] }));
    return grouped.autres.length ? [...base, { id: "autres", label: t("treatments.category.other"), items: grouped.autres }] : base;
  }, [grouped, t]);

  const firstWithItems = React.useMemo(() => categories.find((c) => c.items.length > 0)?.id ?? categories[0]?.id ?? "packs", [categories]);
  const [activeCategory, setActiveCategory] = React.useState<CategoryId>(firstWithItems);

  React.useEffect(() => {
    if (!categories.length) return;
    if (categories.some((c) => c.id === activeCategory)) return;
    setActiveCategory(firstWithItems);
  }, [activeCategory, categories, firstWithItems]);

  React.useEffect(() => {
    if (activeCategory === firstWithItems) return;
    if (items.length === 0) return;
    if (categories.find((c) => c.id === activeCategory)?.items.length) return;
    if (categories.find((c) => c.id === firstWithItems)?.items.length) setActiveCategory(firstWithItems);
  }, [activeCategory, categories, firstWithItems, items.length]);

  const hasAny = items.length > 0;
  const selected = categories.find((c) => c.id === activeCategory) ?? categories[0];

  return (
    <div className={cn("space-y-6", className)}>

      {!hasAny ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-sm font-semibold text-slate-900">{t("treatments.empty.title")}</div>
          <div className="mt-1 text-sm text-slate-600">{t("treatments.empty.subtitle")}</div>
        </div>
      ) : (
        <div className="md:grid md:grid-cols-[240px,1fr] md:gap-5">
          <div className="md:hidden sticky top-[7.25rem] z-20 -mx-4 px-4 py-2 mt-1 bg-white/95 backdrop-blur border-b border-slate-200">
            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((c) => {
                const disabled = c.items.length === 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setActiveCategory(c.id)}
                    className={cn(
                      "shrink-0 px-4 py-2 rounded-full border text-sm font-semibold",
                      activeCategory === c.id
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-slate-800 border-slate-200",
                      disabled ? "opacity-50 cursor-not-allowed" : "",
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="hidden md:block md:sticky md:top-36 md:self-start md:mt-4">
            <div className="flex flex-col gap-2">
              {categories.map((c) => (
                <CategoryNavButton
                  key={c.id}
                  label={c.label}
                  active={activeCategory === c.id}
                  disabled={c.items.length === 0}
                  onClick={() => setActiveCategory(c.id)}
                />
              ))}
            </div>
          </aside>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900">{selected?.label}</h3>
            </div>

            {selected?.items?.length ? (
              selected.id === "packs" ? (
                <div className="grid grid-cols-1 gap-4">
                  {selected.items.map((pack) => (
                    <PackCard key={`${selected.id}-${pack.title}-${pack.duration}-${pack.priceMad}`} pack={pack} onReserve={onGoToSlots} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {selected.items.map((t) => (
                    <TreatmentRow key={`${selected.id}-${t.title}-${t.duration}-${t.priceMad}`} treatment={t} />
                  ))}
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-semibold text-slate-900">{t("treatments.category_empty.title")}</div>
                <div className="mt-1 text-sm text-slate-600">{t("treatments.category_empty.subtitle")}</div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
