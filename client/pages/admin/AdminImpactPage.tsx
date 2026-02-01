import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Input } from "@/components/ui/input";
import { AdminApiError, getAdminImpactReport, isAdminSuperadmin, type AdminImpactReport, type ImpactMetricBlock } from "@/lib/adminApi";
import { ChevronDown, Download } from "lucide-react";

function pad2(v: number): string {
  return String(v).padStart(2, "0");
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYmd(ymd: string): Date | null {
  const v = String(ymd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const ts = Date.parse(`${v}T00:00:00.000Z`);
  return Number.isFinite(ts) ? new Date(ts) : null;
}

function addDaysYmd(ymd: string, days: number): string | null {
  const d = parseYmd(ymd);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return toYmd(d);
}

function formatPercent(rate: number): string {
  const v = Number.isFinite(rate) ? rate : 0;
  return `${(v * 100).toFixed(1)}%`;
}

function formatDeltaPct(afterRate: number, beforeRate: number): string {
  const a = Number.isFinite(afterRate) ? afterRate : 0;
  const b = Number.isFinite(beforeRate) ? beforeRate : 0;
  const deltaPts = (a - b) * 100;
  const sign = deltaPts > 0 ? "+" : "";
  return `${sign}${deltaPts.toFixed(1)} pts`;
}

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (s.includes("\"")) return `"${s.replace(/\"/g, "\"\"")}"`;
  if (/[;\n\r]/.test(s)) return `"${s}"`;
  return s;
}

function downloadCsv(args: { filename: string; headers: string[]; rows: Array<Array<string | number | null>> }): void {
  const sep = ";";
  const lines: string[] = [];
  lines.push(`sep=${sep}`);
  lines.push(args.headers.map(csvEscape).join(sep));

  for (const row of args.rows) {
    lines.push(row.map(csvEscape).join(sep));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = args.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function toSafeMetricBlock(v: ImpactMetricBlock | null | undefined): ImpactMetricBlock {
  return (
    v ?? {
      eligible: 0,
      no_shows: 0,
      honored: 0,
      protected: 0,
      no_show_rate: 0,
      honored_rate: 0,
      protected_share: 0,
    }
  );
}

export function AdminImpactPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AdminImpactReport | null>(null);

  const todayYmd = useMemo(() => toYmd(new Date()), []);

  const [afterStartYmd, setAfterStartYmd] = useState<string>(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return toYmd(d);
  });

  const [afterEndYmd, setAfterEndYmd] = useState<string>(() => todayYmd);

  const beforeStartYmd = useMemo(() => addDaysYmd(afterStartYmd, -30), [afterStartYmd]);
  const beforeEndYmd = useMemo(() => afterStartYmd, [afterStartYmd]);

  const refresh = useCallback(async () => {
    if (!afterStartYmd || !afterEndYmd || !beforeStartYmd || !beforeEndYmd) {
      setError("Périodes invalides.");
      setReport(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await getAdminImpactReport(undefined, {
        after_start: afterStartYmd,
        after_end: afterEndYmd,
        before_start: beforeStartYmd,
        before_end: beforeEndYmd,
        series_weeks: 12,
      });

      setReport(res);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [afterEndYmd, afterStartYmd, beforeEndYmd, beforeStartYmd]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const before = toSafeMetricBlock(report?.kpi.before);
  const after = toSafeMetricBlock(report?.kpi.after);
  const afterProtected = toSafeMetricBlock(report?.kpi.after_protected);
  const afterNonProtected = toSafeMetricBlock(report?.kpi.after_non_protected);

  const universeRows = useMemo(() => {
    const beforeBy = new Map((report?.kpi.by_universe_before ?? []).map((r) => [r.universe, r] as const));
    const afterBy = new Map((report?.kpi.by_universe_after ?? []).map((r) => [r.universe, r] as const));

    const all = new Set<string>();
    for (const k of beforeBy.keys()) all.add(k);
    for (const k of afterBy.keys()) all.add(k);

    const items = Array.from(all)
      .map((universe) => ({
        universe,
        before: beforeBy.get(universe) ?? null,
        after: afterBy.get(universe) ?? null,
      }))
      .sort((a, b) => a.universe.localeCompare(b.universe));

    return items;
  }, [report?.kpi.by_universe_after, report?.kpi.by_universe_before]);

  const canExport = !!report;

  const handleExportBeforeAfter = () => {
    if (!report) return;

    const rows: Array<Array<string | number | null>> = [];

    rows.push(["GLOBAL", "Avant", before.eligible, before.no_shows, formatPercent(before.no_show_rate), before.honored, formatPercent(before.honored_rate), before.protected, formatPercent(before.protected_share)]);
    rows.push(["GLOBAL", "Après", after.eligible, after.no_shows, formatPercent(after.no_show_rate), after.honored, formatPercent(after.honored_rate), after.protected, formatPercent(after.protected_share)]);

    rows.push(["", "", "", "", "", "", "", "", ""]);

    for (const r of universeRows) {
      const b = toSafeMetricBlock(r.before ?? undefined);
      const a = toSafeMetricBlock(r.after ?? undefined);
      rows.push([r.universe, "Avant", b.eligible, b.no_shows, formatPercent(b.no_show_rate), b.honored, formatPercent(b.honored_rate), b.protected, formatPercent(b.protected_share)]);
      rows.push([r.universe, "Après", a.eligible, a.no_shows, formatPercent(a.no_show_rate), a.honored, formatPercent(a.honored_rate), a.protected, formatPercent(a.protected_share)]);
      rows.push(["", "", "", "", "", "", "", "", ""]);
    }

    downloadCsv({
      filename: `impact_avant_apres_${beforeStartYmd}_${afterEndYmd}.csv`,
      headers: [
        "Segment",
        "Période",
        "Réservations éligibles",
        "No-show",
        "Taux no-show",
        "Honorées",
        "Taux honorées",
        "Protégées",
        "Part protégées",
      ],
      rows,
    });
  };

  const handleExportProtected = () => {
    if (!report) return;

    downloadCsv({
      filename: `impact_protege_vs_non_${afterStartYmd}_${afterEndYmd}.csv`,
      headers: ["Segment", "Réservations éligibles", "No-show", "Taux no-show", "Honorées", "Taux honorées"],
      rows: [
        ["Protégées (dépôt requis)", afterProtected.eligible, afterProtected.no_shows, formatPercent(afterProtected.no_show_rate), afterProtected.honored, formatPercent(afterProtected.honored_rate)],
        ["Non protégées", afterNonProtected.eligible, afterNonProtected.no_shows, formatPercent(afterNonProtected.no_show_rate), afterNonProtected.honored, formatPercent(afterNonProtected.honored_rate)],
      ],
    });
  };

  const handleExportSeries = () => {
    if (!report) return;

    downloadCsv({
      filename: `impact_series_12_semaines_${report.periods.series.start.slice(0, 10)}_${report.periods.series.end.slice(0, 10)}.csv`,
      headers: ["Semaine (début)", "Activité", "Éligibles", "No-show", "Taux no-show", "Protégées", "Part protégées"],
      rows: (report.kpi.series ?? []).map((r) => [
        r.week_start.slice(0, 10),
        r.universe,
        r.eligible,
        r.no_shows,
        formatPercent(r.no_show_rate),
        r.protected,
        formatPercent(r.protected_share),
      ]),
    });
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Impact — preuve de valeur"
        description="Mesure simple Avant/Après : no-show, réservations honorées, créneaux protégés, segmentation par activité."
        actions={
          <div className="flex items-center gap-2">
            <RefreshIconButton
              size="icon"
              className="h-9 w-9"
              loading={loading}
              label="Rafraîchir"
              onClick={() => void refresh()}
            />

            {isAdminSuperadmin() && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={!canExport} className="gap-2">
                    <Download className="h-4 w-4" />
                    Exports
                    <ChevronDown className="h-4 w-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[260px]">
                  <DropdownMenuItem onSelect={handleExportBeforeAfter} disabled={!canExport}>
                    Export Avant/Après (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleExportProtected} disabled={!canExport}>
                    Export Protégé vs Non (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleExportSeries} disabled={!canExport}>
                    Export Série 12 semaines (CSV)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <SectionHeader
            title="Périmètre de comparaison"
            description="Avant = 30 jours avant la période Après (comparaison lisible, sans modèle complexe)."
          />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Après — début</div>
              <Input type="date" value={afterStartYmd} onChange={(e) => setAfterStartYmd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Après — fin</div>
              <Input type="date" value={afterEndYmd} onChange={(e) => setAfterEndYmd(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Avant — début</div>
              <Input type="date" value={beforeStartYmd ?? ""} disabled />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Avant — fin</div>
              <Input type="date" value={beforeEndYmd ?? ""} disabled />
            </div>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Définitions : no-show = statut <span className="font-mono">noshow</span> • honorée = <span className="font-mono">checked_in_at</span> présent • protégée = dépôt requis (montant dépôt &gt; 0 ou flag garantie).
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">No-show (Après)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-extrabold tabular-nums">{formatPercent(after.no_show_rate)}</div>
            <div className="text-xs text-slate-600">{after.no_shows} / {after.eligible} réservations éligibles</div>
            <Badge variant="outline">Δ vs Avant : {formatDeltaPct(after.no_show_rate, before.no_show_rate)}</Badge>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Réservations honorées (Après)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-extrabold tabular-nums">{formatPercent(after.honored_rate)}</div>
            <div className="text-xs text-slate-600">{after.honored} / {after.eligible} réservations éligibles</div>
            <Badge variant="outline">Δ vs Avant : {formatDeltaPct(after.honored_rate, before.honored_rate)}</Badge>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Créneaux protégés (Après)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-extrabold tabular-nums">{after.protected}</div>
            <div className="text-xs text-slate-600">Part : {formatPercent(after.protected_share)} (sur {after.eligible} éligibles)</div>
            <div className="text-xs text-slate-500">Wording preuve : “{after.protected} créneaux protégés sur la période”</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <SectionHeader
            title="Protégées vs non protégées (Après)"
            description="Comparaison simple pour objectiver l'effet de la protection."
          />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Protégées (dépôt requis)</div>
                <Badge variant="outline">No-show {formatPercent(afterProtected.no_show_rate)}</Badge>
              </div>
              <div className="mt-2 text-xs text-slate-600">{afterProtected.no_shows} / {afterProtected.eligible} éligibles</div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Non protégées</div>
                <Badge variant="outline">No-show {formatPercent(afterNonProtected.no_show_rate)}</Badge>
              </div>
              <div className="mt-2 text-xs text-slate-600">{afterNonProtected.no_shows} / {afterNonProtected.eligible} éligibles</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <SectionHeader
            title="Par activité (Avant vs Après)"
            description="Segmentation simple : restaurant / loisir / wellness / hôtel."
          />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b">
                  <th className="py-2 pr-4">Activité</th>
                  <th className="py-2 pr-4">No-show (Avant)</th>
                  <th className="py-2 pr-4">No-show (Après)</th>
                  <th className="py-2 pr-4">Δ</th>
                  <th className="py-2 pr-4">Protégées (Après)</th>
                </tr>
              </thead>
              <tbody>
                {universeRows.length ? (
                  universeRows.map((r) => {
                    const b = toSafeMetricBlock(r.before ?? undefined);
                    const a = toSafeMetricBlock(r.after ?? undefined);
                    return (
                      <tr key={r.universe} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 font-semibold text-slate-900">{r.universe}</td>
                        <td className="py-2 pr-4 tabular-nums">{formatPercent(b.no_show_rate)} <span className="text-xs text-slate-500">({b.no_shows}/{b.eligible})</span></td>
                        <td className="py-2 pr-4 tabular-nums">{formatPercent(a.no_show_rate)} <span className="text-xs text-slate-500">({a.no_shows}/{a.eligible})</span></td>
                        <td className="py-2 pr-4 tabular-nums">{formatDeltaPct(a.no_show_rate, b.no_show_rate)}</td>
                        <td className="py-2 pr-4 tabular-nums">{a.protected} <span className="text-xs text-slate-500">({formatPercent(a.protected_share)})</span></td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-4 text-sm text-slate-600">Aucune donnée sur la période.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {report?.kpi.assumptions ? (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <SectionHeader
              title="Hypothèses (transparence contrôlée)"
              description="Documente les définitions utilisées, sans exposer de mécanisme de fiabilité utilisateur."
            />
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-600 space-y-1">
            <div><span className="font-semibold">Statuts exclus (éligibilité) :</span> {(report.kpi.assumptions.eligible_status_excluded ?? []).join(", ")}</div>
            <div><span className="font-semibold">Honorée :</span> {report.kpi.assumptions.honored_definition}</div>
            <div><span className="font-semibold">No-show :</span> {report.kpi.assumptions.no_show_definition}</div>
            <div><span className="font-semibold">Protégée :</span> {report.kpi.assumptions.protected_definition}</div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
