import { useEffect, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import {
  Banknote,
  FileText,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { listPartnerMissions } from "@/lib/pro/api";
import type { PartnerProfile } from "@/components/partner/PartnerLayout";

type OutletContext = {
  profile: PartnerProfile;
  refreshProfile: () => void;
};

type InvoiceRequest = {
  id: string;
  job_id: string;
  role: string;
  status: string;
  amount_cents: number | null;
  currency: string;
  created_at: string;
  paid_at: string | null;
  job_title?: string;
  establishment_name?: string;
};

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof Clock; className: string }
> = {
  requested: {
    label: "Demandée",
    icon: Clock,
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  accounting_review: {
    label: "En revue compta",
    icon: Clock,
    className: "bg-purple-100 text-purple-800 border-purple-200",
  },
  approved: {
    label: "Approuvée",
    icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  paid: {
    label: "Payée",
    icon: CheckCircle2,
    className: "bg-green-100 text-green-800 border-green-200",
  },
  rejected: {
    label: "Rejetée",
    icon: XCircle,
    className: "bg-red-100 text-red-800 border-red-200",
  },
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatAmount(
  cents: number | null | undefined,
  currency = "MAD",
): string {
  if (!cents || cents <= 0) return "—";
  return new Intl.NumberFormat("fr-MA", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export function PartnerBilling() {
  const { profile } = useOutletContext<OutletContext>();

  const [loading, setLoading] = useState(true);
  const [invoiceRequests, setInvoiceRequests] = useState<InvoiceRequest[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load all missions to get invoice requests
      const res = await listPartnerMissions();
      const requests: InvoiceRequest[] = [];

      // Extract invoice requests from all missions
      for (const item of res.items ?? []) {
        const job = (item as any).media_jobs ?? {};
        const establishment = job.establishments ?? {};
        const jobRequests = (item as any).invoice_requests ?? [];

        for (const req of jobRequests) {
          if (!requests.find((r) => r.id === req.id)) {
            requests.push({
              id: req.id,
              job_id: String((item as any).job_id ?? ""),
              role: String(req.role ?? ""),
              status: String(req.status ?? ""),
              amount_cents: req.amount_cents ?? null,
              currency: req.currency ?? "MAD",
              created_at: req.created_at ?? "",
              paid_at: req.paid_at ?? null,
              job_title: String(job.title ?? ""),
              establishment_name: String(establishment.name ?? ""),
            });
          }
        }
      }

      // Sort by date descending
      requests.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setInvoiceRequests(requests);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Calculate totals
  const totals = {
    pending: invoiceRequests.filter(
      (r) => r.status === "requested" || r.status === "accounting_review",
    ).length,
    approved: invoiceRequests.filter((r) => r.status === "approved").length,
    paid: invoiceRequests.filter((r) => r.status === "paid").length,
    totalPaidAmount: invoiceRequests
      .filter((r) => r.status === "paid")
      .reduce((sum, r) => sum + (r.amount_cents ?? 0), 0),
  };

  const isBillingValidated = profile.billing_status === "validated";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">
          Facturation & Paiements
        </h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadData()}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          Actualiser
        </Button>
      </div>

      {/* Billing status warning */}
      {!isBillingValidated && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium text-amber-800">
              RIB non validé
            </div>
            <div className="text-xs text-amber-700 mt-0.5">
              Votre RIB doit être validé par la comptabilité avant de recevoir
              des paiements.
            </div>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link to="/partners/profile">Voir mon profil</Link>
          </Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryCard
          icon={Clock}
          label="En attente"
          value={totals.pending}
          className="border-blue-200"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Approuvées"
          value={totals.approved}
          className="border-emerald-200"
        />
        <SummaryCard
          icon={Banknote}
          label="Payées"
          value={totals.paid}
          className="border-green-200"
        />
        <SummaryCard
          icon={Banknote}
          label="Total reçu"
          value={formatAmount(totals.totalPaidAmount)}
          isAmount
          className="border-[#a3001d]"
        />
      </div>

      {/* Invoice requests table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">
            Historique des demandes
          </h2>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
            <div className="text-sm text-slate-500 mt-2">Chargement...</div>
          </div>
        ) : invoiceRequests.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <div className="text-sm text-slate-600">
              Aucune demande de facture.
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Vos demandes de facturation apparaîtront ici.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-start px-3 py-2 text-xs font-medium text-slate-600">
                    Mission
                  </th>
                  <th className="text-start px-3 py-2 text-xs font-medium text-slate-600">
                    Rôle
                  </th>
                  <th className="text-start px-3 py-2 text-xs font-medium text-slate-600">
                    Date demande
                  </th>
                  <th className="text-start px-3 py-2 text-xs font-medium text-slate-600">
                    Montant
                  </th>
                  <th className="text-start px-3 py-2 text-xs font-medium text-slate-600">
                    Statut
                  </th>
                  <th className="text-start px-3 py-2 text-xs font-medium text-slate-600">
                    Date paiement
                  </th>
                  <th className="text-end px-3 py-2 text-xs font-medium text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoiceRequests.map((req) => {
                  const cfg =
                    STATUS_CONFIG[req.status] || STATUS_CONFIG.requested;
                  const Icon = cfg.icon;

                  return (
                    <tr key={req.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900 truncate max-w-[200px]">
                          {req.establishment_name || req.job_title || "Mission"}
                        </div>
                        <Link
                          to={`/partners/missions/${req.job_id}`}
                          className="text-xs text-[#a3001d] hover:underline inline-flex items-center gap-0.5"
                        >
                          Voir mission
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-semibold uppercase"
                        >
                          {req.role}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {formatDate(req.created_at)}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {formatAmount(req.amount_cents, req.currency)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border",
                            cfg.className,
                          )}
                        >
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {formatDate(req.paid_at)}
                      </td>
                      <td className="px-3 py-2 text-end">
                        {req.status === "paid" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            disabled
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Help section */}
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
        <h3 className="text-xs font-semibold text-slate-700 uppercase mb-2">
          Comment ça fonctionne
        </h3>
        <div className="text-xs text-slate-600 space-y-1">
          <p>
            1. Livrez vos fichiers et attendez la validation par le Responsable
            Client.
          </p>
          <p>
            2. Une fois validé, demandez votre facture depuis la page mission.
          </p>
          <p>3. La comptabilité vérifie et approuve votre demande.</p>
          <p>
            4. Le paiement est effectué sur le RIB enregistré dans votre profil.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  isAmount = false,
  className,
}: {
  icon: typeof Clock;
  label: string;
  value: number | string;
  isAmount?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-white rounded-lg border p-3 flex items-center gap-3",
        className,
      )}
    >
      <Icon className="w-5 h-5 text-slate-400 flex-shrink-0" />
      <div className="min-w-0">
        <div
          className={cn(
            "font-bold leading-none",
            isAmount ? "text-base text-[#a3001d]" : "text-lg text-slate-900",
          )}
        >
          {value}
        </div>
        <div className="text-[10px] text-slate-500 truncate">{label}</div>
      </div>
    </div>
  );
}

export default PartnerBilling;
