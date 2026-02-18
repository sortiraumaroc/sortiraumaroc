/**
 * AdminFinancesDashboard — 5.9: Dashboard Admin Finances
 *
 * File de factures, virements, contestations, commissions, modules,
 * réconciliation, revenus, codes promo, remboursements, alertes.
 */

import { useCallback, useEffect, useState } from "react";
import {
  FileText, CreditCard, AlertTriangle, Settings, BarChart3,
  Tag, Shield, CheckCircle, XCircle, RefreshCw, Download,
  TrendingUp, Wallet, Receipt, Layers, ToggleLeft, ToggleRight,
  DollarSign, Percent,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AdminPacksNav } from "@/pages/admin/packs/AdminPacksNav";
import {
  // Billing
  listAdminInvoices, validateInvoice, contestInvoice,
  listPayments, executePayment, batchExecutePayments,
  listAdminDisputes, respondToDispute,
  getReconciliation,
  // Commissions
  listCommissions, updateCommission,
  // Modules
  listModules, toggleGlobalModule,
  // Promos
  listPlatformPromos, deletePlatformPromo,
  // Stats
  getPacksStats, getBillingStats, getRevenueBySource,
  // Refunds
  listRefunds, approveRefund, rejectRefund,
  // Types
  type CommissionsConfig, type ReconciliationSummary,
  type PacksGlobalStats, type BillingGlobalStats, type RevenueBySource,
  type ModuleInfo,
} from "@/lib/packsV2AdminApi";
import type { BillingPeriod, BillingDispute, PackPromoCode, PackRefund, PlatformModule } from "../../../shared/packsBillingTypes";

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

// =============================================================================
// Sub-tabs
// =============================================================================

type AdminFinanceTab = "invoices" | "payments" | "disputes" | "commissions" | "modules" | "stats" | "promos" | "refunds";

// =============================================================================
// Invoices section
// =============================================================================

function InvoicesSection() {
  const [invoices, setInvoices] = useState<BillingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminInvoices();
      setInvoices(res.invoices);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleValidate = async (id: string) => {
    try {
      await validateInvoice(id);
      setActionMsg("Facture validée");
      fetch_();
    } catch (e: any) { setActionMsg(e.message); }
  };

  if (loading) return <div className="py-6 text-center text-sm text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-3">
      {actionMsg && <div className="text-sm text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl">{actionMsg}</div>}
      {invoices.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500">Aucune facture en attente</div>
      ) : invoices.map((inv) => (
        <div key={inv.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-900">{inv.period_code}</div>
            <div className="text-xs text-slate-500">
              Commission: {formatCurrency(inv.total_commission ?? 0)} · Net: {formatCurrency(inv.total_net ?? 0)}
            </div>
          </div>
          <div className="flex gap-2">
            {inv.status === "invoice_submitted" && (
              <Button onClick={() => handleValidate(inv.id)} className="h-8 px-3 bg-emerald-600 text-white text-xs font-semibold rounded-lg">
                <CheckCircle className="h-3 w-3 me-1" /> Valider
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Payments section
// =============================================================================

function PaymentsSection() {
  const [payments, setPayments] = useState<BillingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPayments();
      setPayments(res.payments);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleExecute = async (id: string) => {
    try {
      await executePayment(id);
      setMsg("Virement exécuté");
      fetch_();
    } catch (e: any) { setMsg(e.message); }
  };

  const handleBatchExecute = async () => {
    const ids = payments.filter(p => p.status === "invoice_validated").map(p => p.id);
    if (!ids.length) return;
    try {
      const res = await batchExecutePayments(ids);
      setMsg(`${res.succeeded}/${res.total} virements exécutés`);
      fetch_();
    } catch (e: any) { setMsg(e.message); }
  };

  if (loading) return <div className="py-6 text-center text-sm text-slate-500">Chargement...</div>;

  const validatedCount = payments.filter(p => p.status === "invoice_validated").length;

  return (
    <div className="space-y-3">
      {msg && <div className="text-sm text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl">{msg}</div>}
      {validatedCount > 1 && (
        <Button onClick={handleBatchExecute} className="h-9 px-4 bg-[#a3001d] text-white text-sm font-semibold rounded-lg">
          <CreditCard className="h-3.5 w-3.5 me-1" /> Exécuter {validatedCount} virements
        </Button>
      )}
      {payments.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500">Aucun virement en attente</div>
      ) : payments.map((p) => (
        <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-900">{p.period_code}</div>
            <div className="text-xs text-slate-500">Net: {formatCurrency(p.total_net ?? 0)}</div>
          </div>
          {p.status === "invoice_validated" && (
            <Button onClick={() => handleExecute(p.id)} className="h-8 px-3 bg-emerald-600 text-white text-xs font-semibold rounded-lg">
              Exécuter
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Disputes section
// =============================================================================

function DisputesSection() {
  const [disputes, setDisputes] = useState<BillingDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminDisputes();
      setDisputes(res.disputes);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleRespond = async (id: string, accepted: boolean) => {
    try {
      await respondToDispute(id, accepted, accepted ? "Contestation acceptée" : "Contestation rejetée");
      setMsg(accepted ? "Contestation acceptée" : "Contestation rejetée");
      fetch_();
    } catch (e: any) { setMsg(e.message); }
  };

  if (loading) return <div className="py-6 text-center text-sm text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-3">
      {msg && <div className="text-sm text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl">{msg}</div>}
      {disputes.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500">Aucune contestation</div>
      ) : disputes.map((d) => (
        <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-bold text-slate-900 mb-1">Contestation #{d.id.slice(0, 8)}</div>
          <div className="text-xs text-slate-500 mb-2">{d.reason}</div>
          <div className="flex gap-2">
            <Button onClick={() => handleRespond(d.id, true)} className="h-8 px-3 bg-emerald-600 text-white text-xs font-semibold rounded-lg">
              Accepter
            </Button>
            <Button onClick={() => handleRespond(d.id, false)} variant="outline" className="h-8 px-3 border-red-200 text-red-600 text-xs font-semibold rounded-lg">
              Rejeter
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Commissions section
// =============================================================================

function CommissionsSection() {
  const [config, setConfig] = useState<CommissionsConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await listCommissions();
        setConfig(res);
      } catch { /* silent */ } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="py-6 text-center text-sm text-slate-500">Chargement...</div>;
  if (!config) return null;

  return (
    <div className="space-y-4">
      {/* Defaults */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-[#a3001d]" /> Taux par défaut
        </h4>
        <div className="space-y-2">
          {config.defaults.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
              <span className="text-slate-700 font-medium">{d.type}</span>
              <span className="font-bold text-[#a3001d]">{d.rate}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom */}
      {config.custom.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4 text-slate-400" /> Taux personnalisés
          </h4>
          <div className="space-y-2">
            {config.custom.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-slate-700">{c.establishments?.name ?? c.establishment_id}</span>
                <span className="font-bold text-[#a3001d]">{c.rate}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Modules section
// =============================================================================

function ModulesSection() {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listModules();
      setModules(res.modules);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleToggle = async (moduleName: PlatformModule, activate: boolean) => {
    try {
      await toggleGlobalModule(moduleName, activate);
      fetch_();
    } catch { /* silent */ }
  };

  if (loading) return <div className="py-6 text-center text-sm text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-2">
      {modules.map((m) => (
        <div key={m.module} className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-900 capitalize">{m.module.replace(/_/g, " ")}</div>
            <div className="text-xs text-slate-500">
              {m.isGloballyActive ? "Actif globalement" : "Désactivé globalement"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleToggle(m.module, !m.isGloballyActive)}
            className={cn(
              "flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-lg border transition",
              m.isGloballyActive
                ? "text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                : "text-slate-500 border-slate-200 bg-slate-50 hover:bg-slate-100",
            )}
          >
            {m.isGloballyActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
            {m.isGloballyActive ? "ON" : "OFF"}
          </button>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Stats section
// =============================================================================

function StatsSection() {
  const [packsStats, setPacksStats] = useState<PacksGlobalStats | null>(null);
  const [billingStats, setBillingStats] = useState<BillingGlobalStats | null>(null);
  const [revenue, setRevenue] = useState<RevenueBySource | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [ps, bs, rv] = await Promise.all([getPacksStats(), getBillingStats(), getRevenueBySource()]);
        setPacksStats(ps);
        setBillingStats(bs);
        setRevenue(rv);
      } catch { /* silent */ } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="py-6 text-center text-sm text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-4">
      {/* Pack stats */}
      {packsStats && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Packs</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><div className="text-xs text-slate-500">Actifs</div><div className="font-bold text-lg">{packsStats.activePacks}</div></div>
            <div><div className="text-xs text-slate-500">Vendus</div><div className="font-bold text-lg">{packsStats.totalSold}</div></div>
            <div><div className="text-xs text-slate-500">Consommés</div><div className="font-bold text-lg">{packsStats.totalConsumed}</div></div>
            <div><div className="text-xs text-slate-500">CA total</div><div className="font-bold text-lg text-[#a3001d]">{formatCurrency(packsStats.totalRevenue)}</div></div>
          </div>
        </div>
      )}

      {/* Billing stats */}
      {billingStats && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Facturation</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><div className="text-xs text-slate-500">Périodes</div><div className="font-bold text-lg">{billingStats.totalPeriods}</div></div>
            <div><div className="text-xs text-slate-500">CA brut</div><div className="font-bold text-lg">{formatCurrency(billingStats.totalGross)}</div></div>
            <div><div className="text-xs text-slate-500">Commission</div><div className="font-bold text-lg text-red-600">{formatCurrency(billingStats.totalCommission)}</div></div>
            <div><div className="text-xs text-slate-500">Net</div><div className="font-bold text-lg text-emerald-600">{formatCurrency(billingStats.totalNet)}</div></div>
          </div>
        </div>
      )}

      {/* Revenue by source */}
      {revenue && revenue.revenueBySource && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Revenus par source</h4>
          <div className="space-y-2">
            {Object.entries(revenue.revenueBySource).map(([source, data]) => (
              <div key={source} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-slate-700 font-medium capitalize">{source.replace(/_/g, " ")}</span>
                <div className="text-end">
                  <span className="font-bold text-slate-900">{formatCurrency(data.gross)}</span>
                  <span className="text-xs text-slate-500 ms-2">({data.count} tx)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Refunds section
// =============================================================================

function RefundsSection() {
  const [refunds, setRefunds] = useState<PackRefund[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listRefunds("pending");
      setRefunds(res.refunds);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleApprove = async (id: string) => {
    try {
      await approveRefund(id);
      setMsg("Remboursement approuvé");
      fetch_();
    } catch (e: any) { setMsg(e.message); }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectRefund(id, "Rejeté par l'admin");
      setMsg("Remboursement rejeté");
      fetch_();
    } catch (e: any) { setMsg(e.message); }
  };

  if (loading) return <div className="py-6 text-center text-sm text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-3">
      {msg && <div className="text-sm text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl">{msg}</div>}
      {refunds.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500">Aucun remboursement en attente</div>
      ) : refunds.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold text-slate-900">{formatCurrency(r.refund_amount)}</div>
            <div className="text-xs text-slate-500">{formatDate(r.requested_at)}</div>
          </div>
          {r.reason && <p className="text-xs text-slate-600 mb-2">{r.reason}</p>}
          <div className="flex gap-2">
            <Button onClick={() => handleApprove(r.id)} className="h-8 px-3 bg-emerald-600 text-white text-xs font-semibold rounded-lg">
              Approuver
            </Button>
            <Button onClick={() => handleReject(r.id)} variant="outline" className="h-8 px-3 border-red-200 text-red-600 text-xs font-semibold rounded-lg">
              Rejeter
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Platform promos section
// =============================================================================

function PromosSection() {
  const [promos, setPromos] = useState<PackPromoCode[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPlatformPromos();
      setPromos(res.promos);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleDelete = async (id: string) => {
    try {
      await deletePlatformPromo(id);
      fetch_();
    } catch { /* silent */ }
  };

  if (loading) return <div className="py-6 text-center text-sm text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-2">
      {promos.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500">Aucun code promo plateforme</div>
      ) : promos.map((p) => (
        <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between gap-3">
          <div>
            <span className="font-mono font-bold text-sm text-[#a3001d]">{p.code}</span>
            <div className="text-xs text-slate-500">
              {p.discount_type === "percentage" ? `${p.discount_value}%` : formatCurrency(p.discount_value)}
              {p.max_total_uses ? ` · ${p.current_uses ?? 0}/${p.max_total_uses}` : ""}
              {!p.is_active && " · Inactif"}
            </div>
          </div>
          <Button onClick={() => handleDelete(p.id)} variant="outline" className="h-8 w-8 p-0 border-red-200 text-red-500 rounded-lg">
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// AdminFinancesDashboard — main export
// =============================================================================

export function AdminFinancesDashboard({ className }: { className?: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<AdminFinanceTab>("invoices");

  const tabs: Array<{ id: AdminFinanceTab; label: string; icon: typeof FileText }> = [
    { id: "invoices", label: "Factures", icon: FileText },
    { id: "payments", label: "Virements", icon: CreditCard },
    { id: "disputes", label: "Litiges", icon: AlertTriangle },
    { id: "commissions", label: "Commissions", icon: Percent },
    { id: "modules", label: "Modules", icon: Layers },
    { id: "stats", label: "Statistiques", icon: BarChart3 },
    { id: "promos", label: "Promos", icon: Tag },
    { id: "refunds", label: "Remboursements", icon: Receipt },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Packs sub-navigation */}
      <AdminPacksNav />

      {/* Header */}
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-[#a3001d]" />
        <h2 className="text-lg font-bold text-slate-900">Finances</h2>
      </div>

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
                "shrink-0 h-8 rounded-full px-3.5 text-xs font-semibold border transition flex items-center gap-1.5",
                tab === t.id
                  ? "bg-[#a3001d] text-white border-[#a3001d]"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}
            >
              <Icon className="h-3 w-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === "invoices" && <InvoicesSection />}
      {tab === "payments" && <PaymentsSection />}
      {tab === "disputes" && <DisputesSection />}
      {tab === "commissions" && <CommissionsSection />}
      {tab === "modules" && <ModulesSection />}
      {tab === "stats" && <StatsSection />}
      {tab === "promos" && <PromosSection />}
      {tab === "refunds" && <RefundsSection />}
    </div>
  );
}
