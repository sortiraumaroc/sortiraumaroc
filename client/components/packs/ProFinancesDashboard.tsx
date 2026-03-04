/**
 * ProFinancesDashboard — 5.7: Dashboard Pro section Finances
 *
 * Vue d'ensemble, relevé en cours, historique des périodes,
 * appel à facture, factures, contestations, wallet, reçus, stats.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Wallet, FileText, AlertTriangle, BarChart3, Download,
  Send, Clock, CheckCircle, XCircle, RefreshCw, ChevronDown,
  ChevronUp, Receipt, CreditCard, TrendingUp, Calendar,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  getCurrentBillingPeriod, listBillingPeriods, getBillingPeriodDetail,
  callToInvoice, listProInvoices, getInvoiceDownloadUrl,
  createBillingDispute, listProBillingDisputes,
  getProBillingStats, getProWallet, getProReceipts,
  type ProBillingStats, type WalletInfo,
} from "@/lib/packsV2ProApi";
import type { BillingPeriod, BillingDispute, Transaction } from "../../../shared/packsBillingTypes";

// =============================================================================
// Helpers
// =============================================================================

function formatCurrency(cents: number): string {
  return `${Math.round(cents / 100)} Dhs`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function periodStatusBadge(status: string): { text: string; className: string } {
  switch (status) {
    case "open": return { text: "En cours", className: "bg-blue-100 text-blue-700" };
    case "closed": return { text: "Fermé", className: "bg-amber-100 text-amber-700" };
    case "invoice_submitted": return { text: "Facturé", className: "bg-indigo-100 text-indigo-700" };
    case "invoice_validated": return { text: "Validé", className: "bg-emerald-100 text-emerald-700" };
    case "paid": return { text: "Payé", className: "bg-emerald-200 text-emerald-800" };
    case "contested": return { text: "Contesté", className: "bg-red-100 text-red-700" };
    default: return { text: status, className: "bg-slate-100 text-slate-600" };
  }
}

// =============================================================================
// Sub-tabs
// =============================================================================

type FinanceTab = "overview" | "periods" | "invoices" | "wallet" | "stats";

// =============================================================================
// Overview card
// =============================================================================

function OverviewSection({
  establishmentId,
  onCallToInvoice,
}: {
  establishmentId: string;
  onCallToInvoice: (periodId: string) => void;
}) {
  const [period, setPeriod] = useState<BillingPeriod | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getCurrentBillingPeriod(establishmentId);
        setPeriod(res.period);
        setTransactions(res.transactions);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [establishmentId]);

  if (loading) return <div className="py-6 text-center text-sm text-slate-500">Chargement...</div>;
  if (!period) return <div className="py-6 text-center text-sm text-slate-500">Aucune période en cours</div>;

  const badge = periodStatusBadge(period.status);
  const canCallToInvoice = period.status === "closed";

  return (
    <div className="space-y-4">
      {/* Period header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-slate-500">Période en cours</div>
            <div className="text-lg font-bold text-slate-900">{period.period_code}</div>
          </div>
          <span className={cn("px-3 py-1 rounded-full text-xs font-bold", badge.className)}>{badge.text}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">CA brut</div>
            <div className="font-bold text-slate-900">{formatCurrency(period.total_gross ?? 0)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Commission</div>
            <div className="font-bold text-red-600">{formatCurrency(period.total_commission ?? 0)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Net à recevoir</div>
            <div className="font-bold text-emerald-600">{formatCurrency(period.total_net ?? 0)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Remboursements</div>
            <div className="font-bold text-slate-600">{formatCurrency(period.total_refunds ?? 0)}</div>
          </div>
        </div>

        {canCallToInvoice && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <Button
              onClick={() => onCallToInvoice(period.id)}
              className="h-10 px-5 bg-[#a3001d] text-white font-semibold rounded-xl text-sm"
            >
              <FileText className="h-4 w-4 me-1.5" />
              Appel à facture
            </Button>
          </div>
        )}
      </div>

      {/* Recent transactions */}
      {transactions.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Transactions récentes</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {transactions.slice(0, 10).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                <div>
                  <span className="font-medium text-slate-700">{tx.type}</span>
                  <span className="ms-2 text-xs text-slate-400">{formatDate(tx.created_at)}</span>
                </div>
                <span className="font-bold text-slate-900">{formatCurrency(tx.gross_amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Periods history
// =============================================================================

function PeriodsSection({ establishmentId }: { establishmentId: string }) {
  const [periods, setPeriods] = useState<BillingPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await listBillingPeriods(establishmentId);
        setPeriods(res.periods);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [establishmentId]);

  if (loading) return <div className="py-6 text-center text-sm text-slate-500">Chargement...</div>;
  if (!periods.length) return <div className="py-6 text-center text-sm text-slate-500">Aucune période</div>;

  return (
    <div className="space-y-2">
      {periods.map((p) => {
        const badge = periodStatusBadge(p.status);
        return (
          <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">{p.period_code}</div>
              <div className="text-xs text-slate-500">
                {formatDate(p.start_date)} — {formatDate(p.end_date)}
              </div>
            </div>
            <div className="text-end flex items-center gap-3">
              <span className="text-sm font-bold text-slate-900">{formatCurrency(p.total_net ?? 0)}</span>
              <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-bold", badge.className)}>{badge.text}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Invoices section
// =============================================================================

function InvoicesSection() {
  const [invoices, setInvoices] = useState<BillingPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await listProInvoices();
        setInvoices(res.invoices);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="py-6 text-center text-sm text-slate-500">Chargement...</div>;
  if (!invoices.length) return <div className="py-6 text-center text-sm text-slate-500">Aucune facture</div>;

  return (
    <div className="space-y-2">
      {invoices.map((inv) => {
        const badge = periodStatusBadge(inv.status);
        return (
          <div key={inv.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">{inv.period_code}</div>
              <div className="text-xs text-slate-500">{formatDate(inv.invoice_validated_at)}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">{formatCurrency(inv.total_commission ?? 0)}</span>
              <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-bold", badge.className)}>{badge.text}</span>
              {inv.vosfactures_invoice_id && (
                <a
                  href={getInvoiceDownloadUrl(inv.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"
                  title="Télécharger PDF"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Wallet section
// =============================================================================

function WalletSection({ establishmentId }: { establishmentId: string }) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getProWallet(establishmentId);
        setWallet(res);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [establishmentId]);

  if (loading) return <div className="py-6 text-center text-sm text-slate-500">Chargement...</div>;
  if (!wallet) return <div className="py-6 text-center text-sm text-slate-500">Wallet indisponible</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
        <Wallet className="h-8 w-8 text-[#a3001d] mx-auto mb-2" />
        <div className="text-2xl font-bold text-slate-900">{formatCurrency(wallet.balance)}</div>
        <div className="text-xs text-slate-500">Solde actuel</div>
      </div>

      {wallet.transactions.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Historique</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {wallet.transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                <div>
                  <span className="font-medium text-slate-700">{tx.type}</span>
                  <span className="ms-2 text-xs text-slate-400">{formatDate(tx.created_at)}</span>
                </div>
                <span className={cn("font-bold", tx.amount > 0 ? "text-emerald-600" : "text-red-600")}>
                  {tx.amount > 0 ? "+" : ""}{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Stats section
// =============================================================================

function StatsSection({ establishmentId }: { establishmentId: string }) {
  const [stats, setStats] = useState<ProBillingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getProBillingStats(establishmentId);
        setStats(res);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [establishmentId]);

  if (loading) return <div className="py-6 text-center text-sm text-slate-500">Chargement...</div>;
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
        <TrendingUp className="h-5 w-5 text-[#a3001d] mx-auto mb-1" />
        <div className="text-xl font-bold text-slate-900">{formatCurrency(stats.totalGross)}</div>
        <div className="text-xs text-slate-500">CA brut total</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
        <Receipt className="h-5 w-5 text-red-500 mx-auto mb-1" />
        <div className="text-xl font-bold text-red-600">{formatCurrency(stats.totalCommission)}</div>
        <div className="text-xs text-slate-500">Commission totale</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
        <CreditCard className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
        <div className="text-xl font-bold text-emerald-600">{formatCurrency(stats.totalNet)}</div>
        <div className="text-xs text-slate-500">Net total</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
        <BarChart3 className="h-5 w-5 text-blue-500 mx-auto mb-1" />
        <div className="text-xl font-bold text-slate-900">{stats.packSalesCount}</div>
        <div className="text-xs text-slate-500">Packs vendus</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
        <FileText className="h-5 w-5 text-slate-400 mx-auto mb-1" />
        <div className="text-xl font-bold text-slate-900">{stats.transactionCount}</div>
        <div className="text-xs text-slate-500">Transactions</div>
      </div>
    </div>
  );
}

// =============================================================================
// ProFinancesDashboard — main export
// =============================================================================

export function ProFinancesDashboard({
  establishmentId,
  className,
}: {
  establishmentId: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<FinanceTab>("overview");
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleCallToInvoice = useCallback(async (periodId: string) => {
    setActionMsg(null);
    try {
      await callToInvoice(periodId);
      setActionMsg({ type: "success", text: "Appel à facture envoyé !" });
    } catch (e: any) {
      setActionMsg({ type: "error", text: e.message ?? "Erreur" });
    }
  }, []);

  const tabs: Array<{ id: FinanceTab; label: string; icon: typeof Wallet }> = [
    { id: "overview", label: "Vue d'ensemble", icon: BarChart3 },
    { id: "periods", label: "Périodes", icon: Calendar },
    { id: "invoices", label: "Factures", icon: FileText },
    { id: "wallet", label: "Wallet", icon: Wallet },
    { id: "stats", label: "Statistiques", icon: TrendingUp },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Sub-tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => {
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

      {/* Action message */}
      {actionMsg && (
        <div className={cn(
          "text-sm px-4 py-2.5 rounded-xl flex items-center gap-2",
          actionMsg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
        )}>
          {actionMsg.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {actionMsg.text}
        </div>
      )}

      {/* Content */}
      {tab === "overview" && <OverviewSection establishmentId={establishmentId} onCallToInvoice={handleCallToInvoice} />}
      {tab === "periods" && <PeriodsSection establishmentId={establishmentId} />}
      {tab === "invoices" && <InvoicesSection />}
      {tab === "wallet" && <WalletSection establishmentId={establishmentId} />}
      {tab === "stats" && <StatsSection establishmentId={establishmentId} />}
    </div>
  );
}
