import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type SettingsSyncReportValue = {
  created: number;
  modified: number;
  noop: number;
  updatedAt: string;
  message: string;
};

function formatLocal(iso: string): string {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "—";
  return dt.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SettingsSyncReport({ value }: { value: SettingsSyncReportValue }) {
  return (
    <Card className="border-emerald-200 bg-emerald-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-emerald-900">Rapport</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-emerald-900 space-y-2">
        <div className="whitespace-pre-line">{value.message}</div>
        <div className="text-xs text-emerald-800">Dernière synchronisation : {formatLocal(value.updatedAt)}</div>
      </CardContent>
    </Card>
  );
}
