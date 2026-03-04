import * as React from "react";

import { cn } from "@/lib/utils";
import { scrollElementIntoCenterX } from "@/lib/scroll";
import { useI18n } from "@/lib/i18n";

export type EstablishmentUniverse =
  | "restaurant"
  | "hotel"
  | "loisir"
  | "sport"
  | "wellness"
  | "culture"
  | "shopping"
  | "rentacar"
  | "default";

export type TabConfigItem = {
  id: string;
  labelKey: string;
  sectionId: string;
  /** If provided, the tab label will be rendered as-is (not via t()) */
  rawLabel?: string;
  /** Custom icon (React node) rendered before the label */
  icon?: React.ReactNode;
  /** Custom class name overrides for this specific tab */
  activeClassName?: string;
  inactiveClassName?: string;
};

const UNIVERSE_TABS: Record<EstablishmentUniverse, TabConfigItem[]> = {
  restaurant: [
    { id: "menu", labelKey: "establishment.tabs.menu", sectionId: "section-menu" },
    { id: "avis", labelKey: "establishment.tabs.reviews", sectionId: "section-avis" },
    { id: "infos", labelKey: "establishment.tabs.info", sectionId: "section-infos" },
    { id: "horaires", labelKey: "establishment.tabs.hours", sectionId: "section-horaires" },
    { id: "carte", labelKey: "establishment.tabs.map", sectionId: "section-carte" },
  ],
  hotel: [
    { id: "chambres", labelKey: "establishment.tabs.rooms", sectionId: "section-chambres" },
    { id: "avis", labelKey: "establishment.tabs.reviews", sectionId: "section-avis" },
    { id: "infos", labelKey: "establishment.tabs.info", sectionId: "section-infos" },
    { id: "services", labelKey: "establishment.tabs.services", sectionId: "section-services" },
    { id: "carte", labelKey: "establishment.tabs.map", sectionId: "section-carte" },
  ],
  loisir: [
    { id: "prestations", labelKey: "establishment.tabs.pricing", sectionId: "section-prestations" },
    { id: "avis", labelKey: "establishment.tabs.reviews", sectionId: "section-avis" },
    { id: "infos", labelKey: "establishment.tabs.info", sectionId: "section-infos" },
    { id: "horaires", labelKey: "establishment.tabs.hours", sectionId: "section-horaires" },
    { id: "carte", labelKey: "establishment.tabs.map", sectionId: "section-carte" },
  ],
  sport: [
    { id: "prestations", labelKey: "establishment.tabs.pricing", sectionId: "section-prestations" },
    { id: "avis", labelKey: "establishment.tabs.reviews", sectionId: "section-avis" },
    { id: "infos", labelKey: "establishment.tabs.info", sectionId: "section-infos" },
    { id: "horaires", labelKey: "establishment.tabs.hours", sectionId: "section-horaires" },
    { id: "carte", labelKey: "establishment.tabs.map", sectionId: "section-carte" },
  ],
  wellness: [
    { id: "prestations", labelKey: "establishment.tabs.pricing", sectionId: "section-prestations" },
    { id: "avis", labelKey: "establishment.tabs.reviews", sectionId: "section-avis" },
    { id: "infos", labelKey: "establishment.tabs.info", sectionId: "section-infos" },
    { id: "horaires", labelKey: "establishment.tabs.hours", sectionId: "section-horaires" },
    { id: "carte", labelKey: "establishment.tabs.map", sectionId: "section-carte" },
  ],
  culture: [
    { id: "prestations", labelKey: "establishment.tabs.pricing", sectionId: "section-prestations" },
    { id: "avis", labelKey: "establishment.tabs.reviews", sectionId: "section-avis" },
    { id: "infos", labelKey: "establishment.tabs.info", sectionId: "section-infos" },
    { id: "horaires", labelKey: "establishment.tabs.hours", sectionId: "section-horaires" },
    { id: "carte", labelKey: "establishment.tabs.map", sectionId: "section-carte" },
  ],
  shopping: [
    { id: "infos", labelKey: "establishment.tabs.info", sectionId: "section-infos" },
    { id: "horaires", labelKey: "establishment.tabs.hours", sectionId: "section-horaires" },
    { id: "avis", labelKey: "establishment.tabs.reviews", sectionId: "section-avis" },
    { id: "carte", labelKey: "establishment.tabs.map", sectionId: "section-carte" },
  ],
  rentacar: [
    { id: "menu", labelKey: "establishment.tabs.vehicles", sectionId: "section-menu" },
    { id: "avis", labelKey: "establishment.tabs.reviews", sectionId: "section-avis" },
    { id: "infos", labelKey: "establishment.tabs.info", sectionId: "section-infos" },
    { id: "carte", labelKey: "establishment.tabs.map", sectionId: "section-carte" },
  ],
  default: [
    { id: "prestations", labelKey: "establishment.tabs.pricing", sectionId: "section-prestations" },
    { id: "avis", labelKey: "establishment.tabs.reviews", sectionId: "section-avis" },
    { id: "infos", labelKey: "establishment.tabs.info", sectionId: "section-infos" },
    { id: "horaires", labelKey: "establishment.tabs.hours", sectionId: "section-horaires" },
    { id: "carte", labelKey: "establishment.tabs.map", sectionId: "section-carte" },
  ],
};

function getTabsForUniverse(universe: EstablishmentUniverse, override?: TabConfigItem[]) {
  const tabs = override?.length ? override : UNIVERSE_TABS[universe] ?? UNIVERSE_TABS.default;
  return tabs.length ? tabs : UNIVERSE_TABS.default;
}

function getScrollMtClass(stickyTopPx: number): string {
  // 1rem = 16px; give a bit of breathing room for section headings.
  const approxRem = Math.round((stickyTopPx + 20) / 16);
  // Tailwind supports scroll-mt-* scale, but we keep it stable using existing class.
  // The pages in this project already use scroll-mt-28 successfully.
  if (approxRem >= 7) return "scroll-mt-28";
  return "scroll-mt-24";
}

export function EstablishmentTabs(props: {
  universe: EstablishmentUniverse;
  /** Optional override list of tabs */
  tabs?: TabConfigItem[];
  /** Tab ids to hide (e.g. ["menu"] when no menu/pack content) */
  hideTabs?: string[];
  /** Extra tabs to append (e.g. Ramadan special tab) */
  extraTabs?: TabConfigItem[];
  /** Sticky top offset in px (defaults to 64px for the header) */
  stickyTopPx?: number;
  /** Use to adjust rootMargin of the IntersectionObserver */
  observerRootMargin?: string;
  className?: string;
  containerClassName?: string;
}) {
  const { t } = useI18n();
  const allTabs = React.useMemo(() => getTabsForUniverse(props.universe, props.tabs), [props.universe, props.tabs]);
  const tabs = React.useMemo(() => {
    let result = allTabs;
    if (props.hideTabs?.length) {
      const hidden = new Set(props.hideTabs);
      result = result.filter((tab) => !hidden.has(tab.id));
    }
    if (props.extraTabs?.length) {
      // Insert extra tabs at the beginning (first position)
      result = [...props.extraTabs, ...result];
    }
    return result;
  }, [allTabs, props.hideTabs, props.extraTabs]);

  const [activeTab, setActiveTab] = React.useState<string>(() => tabs[0]?.id ?? "");
  const tabsNavRef = React.useRef<HTMLDivElement | null>(null);
  const stickyTopPx = props.stickyTopPx ?? 64;

  const manualScrollUntilRef = React.useRef<number>(0);
  const activeTabRef = React.useRef(activeTab);

  React.useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const scrollToTab = React.useCallback(
    (tab: TabConfigItem) => {
      // Avoid active-tab flicker while smooth-scrolling to a section.
      manualScrollUntilRef.current = Date.now() + 800;
      setActiveTab(tab.id);
      document.getElementById(tab.sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [setActiveTab],
  );

  React.useEffect(() => {
    const container = tabsNavRef.current;
    if (!container) return;
    const activeButton = container.querySelector<HTMLElement>(`[data-tab-id="${activeTab}"]`);
    if (!activeButton) return;
    scrollElementIntoCenterX(container, activeButton, { padding: 16 });
  }, [activeTab]);

  React.useEffect(() => {
    const elements = tabs
      .map((t) => document.getElementById(t.sectionId))
      .filter((el): el is HTMLElement => Boolean(el));

    if (!elements.length) return;

    // The "activation line" is just under the sticky header + tabs.
    // Using scroll position is more stable than IntersectionObserver when sections overlap.
    const activationLinePx = stickyTopPx + 12;
    const tolerancePx = 10;

    let raf = 0;

    const computeActiveTab = () => {
      if (Date.now() < manualScrollUntilRef.current) return;

      const items = elements
        .map((el) => {
          const tabId = el.dataset.tab;
          if (!tabId) return null;
          return { tabId, top: el.getBoundingClientRect().top };
        })
        .filter((v): v is { tabId: string; top: number } => Boolean(v));

      if (!items.length) return;

      // Prefer the last section that has crossed the activation line (with a small tolerance).
      const passed = items.filter((it) => it.top <= activationLinePx + tolerancePx);
      const chosen = passed.length
        ? passed.reduce((a, b) => (a.top > b.top ? a : b))
        : items.reduce((a, b) => (a.top < b.top ? a : b));

      if (chosen.tabId !== activeTabRef.current) {
        setActiveTab(chosen.tabId);
      }
    };

    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(computeActiveTab);
    };

    // Initial sync.
    schedule();

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [stickyTopPx, tabs]);

  const scrollMtClass = getScrollMtClass(stickyTopPx);

  return (
    <div
      className={cn(
        "sticky z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm",
        props.className,
      )}
      style={{ top: stickyTopPx }}
      data-scroll-mt-class={scrollMtClass}
    >
      <div className={cn("container mx-auto px-2 sm:px-4", props.containerClassName)}>
        <div
          ref={tabsNavRef}
          role="tablist"
          aria-label={t("establishment.tabs.aria_label")}
          className={cn(
            "flex gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch]",
            "py-1",
            "md:justify-center",
            "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tab-id={tab.id}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls={tab.sectionId}
                onClick={() => scrollToTab(tab)}
                className={cn(
                  "relative shrink-0 h-11 sm:h-12 px-3.5 sm:px-4 text-sm whitespace-nowrap transition-colors rounded-md",
                  "border-b-[3px]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3001d]/30 focus-visible:ring-offset-2",
                  active
                    ? (tab.activeClassName ?? "bg-[#a3001d]/10 text-[#a3001d] border-[#a3001d] font-extrabold")
                    : (tab.inactiveClassName ?? "text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-50 font-semibold"),
                )}
              >
                {tab.icon ? <span className="inline-flex items-center gap-1.5">{tab.icon}{tab.rawLabel ?? t(tab.labelKey)}</span> : (tab.rawLabel ?? t(tab.labelKey))}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
