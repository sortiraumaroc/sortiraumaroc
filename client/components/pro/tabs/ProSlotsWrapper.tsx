/**
 * ProSlotsWrapper — Wrapper around ProSlotsTab + Remises
 *
 * Unifies all supply-side (slot configuration) features into a single view
 * with sub-tabs: Mes créneaux | Remises
 *
 * Note: Capacité (répartition des places) est intégrée directement
 * dans le formulaire de création de créneau dans ProSlotsTab.
 */

import { useState, lazy, Suspense } from "react";
import { Clock, Tag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Establishment, ProRole } from "@/lib/pro/types";

const ProSlotsTab = lazy(() =>
  import("@/components/pro/tabs/ProSlotsTab").then((m) => ({
    default: m.ProSlotsTab,
  }))
);

const DiscountsTabLazy = lazy(() =>
  import("@/components/reservationV2/ProReservationsV2Dashboard").then((m) => ({
    default: m.DiscountsTab,
  }))
);

type SubTab = "slots" | "discounts";

const SUB_TABS: Array<{ id: SubTab; label: string; icon: typeof Clock }> = [
  { id: "slots", label: "Mes créneaux", icon: Clock },
  { id: "discounts", label: "Remises", icon: Tag },
];

const TabFallback = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
  </div>
);

export function ProSlotsWrapper({
  establishment,
  role,
}: {
  establishment: Establishment;
  role: ProRole;
}) {
  const [tab, setTab] = useState<SubTab>("slots");

  return (
    <div className="space-y-4">
      {/* Sub-tabs — pill style */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 h-9 rounded-full px-4 text-sm font-semibold border transition flex items-center gap-1.5",
                tab === t.id
                  ? "bg-[#a3001d] text-white border-[#a3001d]"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <Suspense fallback={<TabFallback />}>
        {tab === "slots" && (
          <ProSlotsTab establishment={establishment} role={role} />
        )}
        {tab === "discounts" && (
          <DiscountsTabLazy estId={establishment.id} />
        )}
      </Suspense>
    </div>
  );
}
