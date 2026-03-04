/**
 * CeAdvantageSection — Shows CE advantage on establishment pages
 *
 * Renders only if the user is an active CE employee AND the establishment
 * has a valid CE advantage for their company.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Percent,
  Tag,
  Gift,
  Package,
  BadgePercent,
  QrCode,
  ChevronRight,
  Info,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCeStatus } from "@/hooks/useCeStatus";
import { getConsumerAccessToken } from "@/lib/auth";
import type { AdvantageType } from "../../../shared/ceTypes";

const ADVANTAGE_ICONS: Record<AdvantageType, React.ReactNode> = {
  percentage: <Percent className="h-5 w-5" />,
  fixed: <Tag className="h-5 w-5" />,
  special_offer: <BadgePercent className="h-5 w-5" />,
  gift: <Gift className="h-5 w-5" />,
  pack: <Package className="h-5 w-5" />,
};

function formatAdvantageValue(type: AdvantageType, value: number | null): string {
  if (type === "percentage" && value) return `-${value}%`;
  if (type === "fixed" && value) return `-${value} DH`;
  return { special_offer: "Offre spéciale", gift: "Cadeau", pack: "Pack" }[type] ?? "";
}

interface CeAdvantageData {
  id: string;
  advantage_type: AdvantageType;
  advantage_value: number | null;
  description: string | null;
  conditions: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}

export function CeAdvantageSection({ establishmentId }: { establishmentId: string }) {
  const { isCeActive, company, loading: ceLoading } = useCeStatus();
  const navigate = useNavigate();
  const [advantage, setAdvantage] = useState<CeAdvantageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (ceLoading || !isCeActive || fetched) return;

    setLoading(true);
    (async () => {
      try {
        const token = await getConsumerAccessToken();
        if (!token) return;
        const res = await fetch(`/api/ce/advantages/${establishmentId}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (res.ok && json.data) {
          setAdvantage(json.data);
        }
      } catch {
        // Not a CE-participating establishment — ignore silently
      } finally {
        setLoading(false);
        setFetched(true);
      }
    })();
  }, [ceLoading, isCeActive, establishmentId, fetched]);

  // Don't render anything if not CE employee or no advantage
  if (ceLoading || !isCeActive || loading || !advantage || !advantage.is_active) return null;

  const icon = ADVANTAGE_ICONS[advantage.advantage_type] ?? <BadgePercent className="h-5 w-5" />;
  const valueText = formatAdvantageValue(advantage.advantage_type, advantage.advantage_value);

  return (
    <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 via-white to-blue-50 p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-blue-100 p-2 text-blue-700 shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-blue-800">Avantage CE</span>
            {company && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                <Building2 className="h-3 w-3" /> {company.name}
              </span>
            )}
          </div>

          {/* Value */}
          {valueText && (
            <p className="text-2xl font-black text-blue-700 mt-1">{valueText}</p>
          )}

          {/* Description */}
          {advantage.description && (
            <p className="text-sm text-slate-700 mt-1">{advantage.description}</p>
          )}

          {/* Conditions */}
          {advantage.conditions && (
            <p className="text-xs text-slate-500 mt-1.5 flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{advantage.conditions}</span>
            </p>
          )}

          {/* Date range */}
          {(advantage.start_date || advantage.end_date) && (
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {advantage.start_date && `Du ${new Date(advantage.start_date).toLocaleDateString("fr-FR")}`}
              {advantage.end_date && ` au ${new Date(advantage.end_date).toLocaleDateString("fr-FR")}`}
            </p>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 gap-1.5"
          onClick={() => navigate("/mon-qr")}
        >
          <QrCode className="h-3.5 w-3.5" />
          Afficher mon QR Code CE
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-blue-600 gap-1"
          onClick={() => navigate("/ce/avantages")}
        >
          Tous les avantages <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
