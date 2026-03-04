/**
 * ProfileCeTab — CE history and status in user profile
 *
 * Shows: CE status, company info, scan history, link to advantages
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CheckCircle2,
  Clock,
  XCircle,
  ScanLine,
  QrCode,
  BadgePercent,
  RefreshCw,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCeStatus } from "@/hooks/useCeStatus";
import { getConsumerAccessToken } from "@/lib/auth";
import type { ScanWithDetails, EmployeeStatus } from "../../../shared/ceTypes";

function StatusBadge({ status }: { status: EmployeeStatus | null }) {
  if (!status) return null;
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Actif", cls: "bg-green-100 text-green-700" },
    pending: { label: "En attente de validation", cls: "bg-yellow-100 text-yellow-700" },
    suspended: { label: "Suspendu", cls: "bg-red-100 text-red-700" },
  };
  const m = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", m.cls)}>{m.label}</span>;
}

function ScanStatusIcon({ status }: { status: string }) {
  if (status === "validated") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "refused") return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-gray-400" />;
}

export function ProfileCeTab() {
  const { isCeEmployee, ceStatus, company, profileComplete, loading: ceLoading } = useCeStatus();
  const [history, setHistory] = useState<ScanWithDetails[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const token = await getConsumerAccessToken();
      if (!token) return;
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      const res = await fetch(`/api/ce/history?${params}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setHistory(json.data ?? []);
        setTotal(json.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (ceLoading || !isCeEmployee) return;
    fetchHistory();
  }, [ceLoading, isCeEmployee, fetchHistory]);

  if (ceLoading) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isCeEmployee) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">
          Vous n'êtes pas inscrit à un programme Comité d'Entreprise.
        </p>
        <p className="text-xs text-muted-foreground">
          Si votre entreprise participe au programme, demandez le lien d'inscription à votre service RH.
        </p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {company?.logo_url ? (
              <img src={company.logo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
            )}
            <div className="flex-1">
              <h3 className="font-semibold">{company?.name ?? "Entreprise"}</h3>
              <StatusBadge status={ceStatus} />
              {ceStatus === "active" && !profileComplete && (
                <p className="text-xs text-amber-600 mt-1">
                  Veuillez compléter votre profil pour utiliser votre QR code CE.
                </p>
              )}
            </div>
          </div>

          {ceStatus === "active" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/mon-qr">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <QrCode className="h-3.5 w-3.5" /> Mon QR Code CE
                </Button>
              </Link>
              <Link to="/ce/avantages">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <BadgePercent className="h-3.5 w-3.5" /> Mes avantages
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scan History */}
      {ceStatus === "active" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ScanLine className="h-4 w-4" /> Historique des scans
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={fetchHistory}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Aucun scan enregistré pour le moment.
              </p>
            ) : (
              <div className="space-y-2">
                {history.map((scan) => (
                  <div key={scan.id} className="flex items-center gap-3 p-2.5 rounded-lg border">
                    <ScanStatusIcon status={scan.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{scan.establishment_name ?? "Établissement"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {scan.advantage_description ?? scan.advantage_type}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {new Date(scan.scan_datetime).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(scan.scan_datetime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Précédent
                    </Button>
                    <span className="text-xs text-muted-foreground">{page}/{totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Suivant
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
