import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Loader2, PackageCheck, DollarSign, AlertCircle, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { cn } from "@/lib/utils";
import { buildConsumedByPurchase, getPackPurchaseConsumption } from "@/lib/packConsumption";
import { getBillingCompanyProfile, type BillingCompanyProfile } from "@/lib/publicApi";

import { getProInvoiceFinanceInvoice, listProInvoices, listProOffers, listProPackBilling, listProPayoutWindows, createProPayoutRequest, listProPayoutRequests, listProVisibilityOrders, getProVisibilityOrderInvoice, getProBankDetails, type PayoutWindow, type PayoutRequestWithPayout, type VisibilityOrder, type ProBankDetails } from "@/lib/pro/api";
import { formatMoney } from "@/lib/money";
import { isDemoModeEnabled } from "@/lib/demoMode";
import type { Establishment, ProInvoice, ProRole } from "@/lib/pro/types";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

type PackPurchaseRow = {
  id: string;
  establishment_id: string;
  pack_id: string;
  buyer_name: string | null;
  buyer_email: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  currency: string;
  payment_status: string;
  status: string;
  valid_until: string | null;
  created_at: string;
};

type PackRedemptionRow = {
  id: string;
  purchase_id: string;
  establishment_id: string;
  redeemed_at: string;
  redeemed_by_user_id: string | null;
  notes: string | null;
};

type PackMetaRow = {
  id: string;
  title: string | null;
  label: string | null;
};

function packPaymentBadge(status: string) {
  if (status === "paid") return { label: "Payé", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (status === "pending") return { label: "En attente", cls: "bg-amber-100 text-amber-700 border-amber-200" };
  if (status === "failed") return { label: "Échoué", cls: "bg-red-100 text-red-700 border-red-200" };
  return { label: status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
}

function buildDemoPackBilling(establishmentId: string) {
  const now = Date.now();
  const pack1: PackMetaRow = { id: "demo-pack-ftour", title: "Pack Ftour Ramadan", label: "10 ftours" };
  const pack2: PackMetaRow = { id: "demo-pack-spa", title: "Pack Spa", label: "5 séances" };

  const purchases: PackPurchaseRow[] = [
    {
      id: `demo-purchase-${establishmentId}-1`,
      establishment_id: establishmentId,
      pack_id: pack1.id,
      buyer_name: "Fatima Z.",
      buyer_email: "fatima@example.com",
      quantity: 10,
      unit_price: 25000,
      total_price: 250000,
      currency: "MAD",
      payment_status: "paid",
      status: "active",
      valid_until: new Date(now + 15 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: `demo-purchase-${establishmentId}-2`,
      establishment_id: establishmentId,
      pack_id: pack2.id,
      buyer_name: "Youssef A.",
      buyer_email: "youssef@example.com",
      quantity: 5,
      unit_price: 18000,
      total_price: 90000,
      currency: "MAD",
      payment_status: "paid",
      status: "active",
      valid_until: new Date(now + 45 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const redemptions: PackRedemptionRow[] = [
    {
      id: `demo-redeem-${establishmentId}-1`,
      purchase_id: purchases[0]!.id,
      establishment_id: establishmentId,
      redeemed_at: new Date(now - 36 * 60 * 60 * 1000).toISOString(),
      redeemed_by_user_id: null,
      notes: "1 ftour consommé",
    },
    {
      id: `demo-redeem-${establishmentId}-2`,
      purchase_id: purchases[0]!.id,
      establishment_id: establishmentId,
      redeemed_at: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
      redeemed_by_user_id: null,
      notes: "1 ftour consommé",
    },
    {
      id: `demo-redeem-${establishmentId}-3`,
      purchase_id: purchases[1]!.id,
      establishment_id: establishmentId,
      redeemed_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      redeemed_by_user_id: null,
      notes: "1 séance consommée",
    },
  ];

  const packMeta: Record<string, PackMetaRow> = {
    [pack1.id]: pack1,
    [pack2.id]: pack2,
  };

  return { purchases, redemptions, packMeta };
}

function statusBadge(status: string) {
  if (status === "paid") return { label: "Payée", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (status === "due") return { label: "Dû", cls: "bg-amber-100 text-amber-700 border-amber-200" };
  return { label: status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === "\"") return "&quot;";
    return "&#39;";
  });
}

async function openInvoicePrint(invoice: ProInvoice, establishment: Establishment) {
  const w = window.open("", "_blank");
  if (!w) return;

  let issuer: BillingCompanyProfile | null = null;
  try {
    issuer = await getBillingCompanyProfile();
  } catch {
    issuer = null;
  }

  let invoiceNumberOrId = typeof (invoice as any)?.invoice_number === "string" ? String((invoice as any).invoice_number) : "";

  if (!invoiceNumberOrId) {
    try {
      const fin = await getProInvoiceFinanceInvoice({ establishmentId: establishment.id, invoiceId: invoice.id });
      invoiceNumberOrId = fin.invoice.invoice_number;
    } catch {
      // ignore
    }
  }

  if (!invoiceNumberOrId) invoiceNumberOrId = invoice.id;

  const issuerTitle = issuer ? `${issuer.trade_name} (${issuer.legal_name})` : "Sortir Au Maroc";
  const issuerLegal = issuer
    ? `${issuer.legal_form} • ICE ${issuer.ice} • RC ${issuer.rc_number} — ${issuer.rc_court}`
    : "";
  const issuerAddress = issuer
    ? [issuer.address_line1, issuer.address_line2, `${issuer.city}, ${issuer.country}`].filter((v) => v && String(v).trim()).join(" — ")
    : "";

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Facture ${escapeHtml(invoiceNumberOrId)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #a3001d; padding-bottom: 12px; }
          h1 { margin: 0; color: #a3001d; font-size: 20px; }
          .muted { color: #6b7280; font-size: 12px; }
          .block { margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { text-align: left; padding: 10px; border-bottom: 1px solid #e5e7eb; }
          th { background: #f9fafb; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
          .total { font-weight: bold; }
          .issuer { margin-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>${escapeHtml(issuerTitle)} — Facture</h1>
            ${issuerLegal ? `<div class="muted issuer">${escapeHtml(issuerLegal)}</div>` : ""}
            ${issuerAddress ? `<div class="muted issuer">${escapeHtml(issuerAddress)}</div>` : ""}
            <div class="muted" style="margin-top:10px;">Client (Pro): ${(establishment.name ?? establishment.id).replace(/</g, "&lt;")}</div>
            <div class="muted">Période: ${escapeHtml(invoice.period_start)} → ${escapeHtml(invoice.period_end)}</div>
          </div>
          <div class="muted">Facture: ${escapeHtml(invoiceNumberOrId)}</div>
          <div class="muted">ID interne: ${escapeHtml(invoice.id)}</div>
        </div>

        <div class="block">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Commissions sur réservations</td>
                <td>${formatMoney(invoice.commission_total, invoice.currency)}</td>
              </tr>
              <tr>
                <td>Visibilité / campagnes</td>
                <td>${formatMoney(invoice.visibility_total, invoice.currency)}</td>
              </tr>
              <tr class="total">
                <td>Total dû</td>
                <td>${formatMoney(invoice.amount_due, invoice.currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="block muted">Échéance: ${escapeHtml(invoice.due_date)}</div>
      </body>
    </html>
  `;

  w.document.write(html);
  w.document.close();
  w.onload = () => w.print();
}

async function openVisibilityOrderInvoicePrint(order: VisibilityOrder, establishment: Establishment) {
  const w = window.open("", "_blank");
  if (!w) return;

  let issuer: BillingCompanyProfile | null = null;
  try {
    issuer = await getBillingCompanyProfile();
  } catch {
    issuer = null;
  }

  let invoiceNumberOrId = order.id;
  try {
    const fin = await getProVisibilityOrderInvoice(establishment.id, order.id);
    invoiceNumberOrId = fin.invoice.invoice_number;
  } catch {
    // ignore
  }

  const issuerTitle = issuer ? `${issuer.trade_name} (${issuer.legal_name})` : "Sortir Au Maroc";
  const issuerLegal = issuer
    ? `${issuer.legal_form} • ICE ${issuer.ice} • RC ${issuer.rc_number} — ${issuer.rc_court}`
    : "";
  const issuerAddress = issuer
    ? [issuer.address_line1, issuer.address_line2, `${issuer.city}, ${issuer.country}`].filter((v) => v && String(v).trim()).join(" — ")
    : "";

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Facture ${escapeHtml(invoiceNumberOrId)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #a3001d; padding-bottom: 12px; }
          h1 { margin: 0; color: #a3001d; font-size: 20px; }
          .muted { color: #6b7280; font-size: 12px; }
          .block { margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { text-align: left; padding: 10px; border-bottom: 1px solid #e5e7eb; }
          th { background: #f9fafb; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
          .total { font-weight: bold; }
          .issuer { margin-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>${escapeHtml(issuerTitle)} — Facture</h1>
            ${issuerLegal ? `<div class="muted issuer">${escapeHtml(issuerLegal)}</div>` : ""}
            ${issuerAddress ? `<div class="muted issuer">${escapeHtml(issuerAddress)}</div>` : ""}
            <div class="muted" style="margin-top:10px;">Client (Pro): ${(establishment.name ?? establishment.id).replace(/</g, "&lt;")}</div>
            <div class="muted">Date: ${new Date(order.created_at).toLocaleDateString("fr-FR")}</div>
          </div>
          <div class="muted">Facture: ${escapeHtml(invoiceNumberOrId)}</div>
          <div class="muted">Commande: ${escapeHtml(order.id.slice(0, 8))}</div>
        </div>

        <div class="block">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Quantité</th>
                <th>Prix unitaire</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${order.items.map(item => `
                <tr>
                  <td>${escapeHtml(item.title || "Service")}</td>
                  <td>${item.quantity}</td>
                  <td>${formatMoney(item.unit_price_cents, order.currency)}</td>
                  <td>${formatMoney(item.unit_price_cents * item.quantity, order.currency)}</td>
                </tr>
              `).join("")}
              <tr class="total">
                <td colspan="3">Total TTC</td>
                <td>${formatMoney(order.total_cents, order.currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="block muted">
          Statut: ${order.payment_status === "paid" ? "Payée" : "En attente de paiement"}
        </div>
      </body>
    </html>
  `;

  w.document.write(html);
  w.document.close();
  w.onload = () => w.print();
}

export function ProBillingTab({ establishment, role }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusPurchaseId = searchParams.get("pid");
  const focusBillingTab = searchParams.get("billingTab");

  const [mobileTab, setMobileTab] = useState<string>(() => (focusBillingTab === "packs" ? "packs" : focusBillingTab === "reversements" ? "reversements" : focusBillingTab === "visibility" ? "visibility" : "invoices"));
  const [items, setItems] = useState<ProInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [purchases, setPurchases] = useState<PackPurchaseRow[]>([]);
  const [redemptions, setRedemptions] = useState<PackRedemptionRow[]>([]);
  const [packMeta, setPackMeta] = useState<Record<string, PackMetaRow>>({});
  const [loadingPacks, setLoadingPacks] = useState(true);

  const [packConsumptionFilter, setPackConsumptionFilter] = useState<"not_consumed" | "fully_consumed" | "all">("not_consumed");

  const [windows, setWindows] = useState<PayoutWindow[]>([]);
  const [loadingWindows, setLoadingWindows] = useState(true);
  const [windowsError, setWindowsError] = useState<string | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState<string | null>(null);

  const [payoutRequests, setPayoutRequests] = useState<PayoutRequestWithPayout[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const [visibilityOrders, setVisibilityOrders] = useState<VisibilityOrder[]>([]);
  const [loadingVisibilityOrders, setLoadingVisibilityOrders] = useState(true);

  const [bankDetails, setBankDetails] = useState<ProBankDetails | null>(null);
  const [loadingBankDetails, setLoadingBankDetails] = useState(true);
  const [bankDetailsError, setBankDetailsError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listProInvoices({ establishmentId: establishment.id, limit: 50 });
      setItems((res.invoices ?? []) as ProInvoice[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setItems([]);
    }

    setLoading(false);
  };

  const loadPackBilling = async () => {
    setLoadingPacks(true);
    try {
      const res = await listProPackBilling(establishment.id);
      const nextPurchases = (res.purchases ?? []) as PackPurchaseRow[];
      const nextRedemptions = (res.redemptions ?? []) as PackRedemptionRow[];
      setPurchases(nextPurchases);
      setRedemptions(nextRedemptions);

      const packIds = [...new Set(nextPurchases.map((p) => p.pack_id).filter(Boolean))];
      if (!packIds.length) {
        setPackMeta({});
        return;
      }

      const offers = await listProOffers(establishment.id);
      const packs = (offers.packs ?? []) as PackMetaRow[];
      const nextMeta: Record<string, PackMetaRow> = {};

      for (const pack of packs) {
        if (!pack?.id) continue;
        if (!packIds.includes(pack.id)) continue;
        nextMeta[pack.id] = { id: pack.id, title: pack.title ?? null, label: pack.label ?? null };
      }

      setPackMeta(nextMeta);
    } catch (e) {
      setError((prev) => prev ?? (e instanceof Error ? e.message : "Erreur"));
      setPurchases([]);
      setRedemptions([]);
      setPackMeta({});
    } finally {
      setLoadingPacks(false);
    }
  };

  const loadPayoutWindows = async () => {
    setLoadingWindows(true);
    setWindowsError(null);

    try {
      const res = await listProPayoutWindows(establishment.id);
      setWindows((res.windows ?? []) as PayoutWindow[]);
    } catch (e) {
      setWindowsError(e instanceof Error ? e.message : "Erreur");
      setWindows([]);
    } finally {
      setLoadingWindows(false);
    }
  };

  const loadPayoutRequests = async () => {
    setLoadingRequests(true);
    try {
      const res = await listProPayoutRequests(establishment.id);
      setPayoutRequests((res.requests ?? []) as PayoutRequestWithPayout[]);
    } catch (e) {
      setWindowsError((prev) => prev ?? (e instanceof Error ? e.message : "Erreur"));
      setPayoutRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  const loadVisibilityOrders = async () => {
    setLoadingVisibilityOrders(true);
    try {
      const res = await listProVisibilityOrders(establishment.id, 100);
      setVisibilityOrders((res.orders ?? []) as VisibilityOrder[]);
    } catch (e) {
      setError((prev) => prev ?? (e instanceof Error ? e.message : "Erreur"));
      setVisibilityOrders([]);
    } finally {
      setLoadingVisibilityOrders(false);
    }
  };

  const loadBankDetails = async () => {
    setLoadingBankDetails(true);
    setBankDetailsError(null);
    try {
      const res = await getProBankDetails(establishment.id);
      setBankDetails(res.item ?? null);
    } catch (e) {
      setBankDetailsError(e instanceof Error ? e.message : "Erreur");
      setBankDetails(null);
    } finally {
      setLoadingBankDetails(false);
    }
  };

  useEffect(() => {
    void load();
    void loadPackBilling();
    void loadPayoutWindows();
    void loadPayoutRequests();
    void loadVisibilityOrders();
    void loadBankDetails();
  }, [establishment.id]);

  useEffect(() => {
    if (!focusPurchaseId) return;
    if (typeof document === "undefined") return;

    const t = window.setTimeout(() => {
      const el = document.querySelector(`[data-pack-purchase-id="${CSS.escape(focusPurchaseId)}"]`) as HTMLElement | null;
      if (!el) return;

      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-white", "rounded-md");

      window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-white", "rounded-md");
      }, 2500);

      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.delete("pid");
        p.delete("billingTab");
        return p;
      });
    }, 120);

    return () => window.clearTimeout(t);
  }, [focusPurchaseId, setSearchParams]);

  useEffect(() => {
    if (focusBillingTab === "packs") setMobileTab("packs");
    if (focusBillingTab === "invoices") setMobileTab("invoices");
    if (focusBillingTab === "reversements") setMobileTab("reversements");
    if (focusBillingTab === "visibility") setMobileTab("visibility");
  }, [focusBillingTab]);

  const handleSubmitPayoutRequest = async (payoutId: string) => {
    setSubmittingRequest(payoutId);
    try {
      await createProPayoutRequest(establishment.id, { payout_id: payoutId });
      await Promise.all([loadPayoutWindows(), loadPayoutRequests()]);
    } catch (e) {
      setWindowsError(e instanceof Error ? e.message : "Erreur lors de la soumission");
    } finally {
      setSubmittingRequest(null);
    }
  };

  const totals = useMemo(() => {
    let due = 0;
    let paid = 0;
    for (const i of items) {
      if (i.status === "paid") paid += i.amount_due;
      else due += i.amount_due;
    }
    return { due, paid };
  }, [items]);

  const demoPackBilling = useMemo(() => buildDemoPackBilling(establishment.id), [establishment.id]);
  const canShowDemoPackBilling = isDemoModeEnabled();
  const showingDemoPackBilling = canShowDemoPackBilling && !loadingPacks && purchases.length === 0;

  const basePurchases = useMemo(
    () => (purchases.length ? purchases : canShowDemoPackBilling ? demoPackBilling.purchases : []),
    [canShowDemoPackBilling, demoPackBilling.purchases, purchases],
  );

  const baseRedemptions = useMemo(
    () => (redemptions.length ? redemptions : canShowDemoPackBilling ? demoPackBilling.redemptions : []),
    [canShowDemoPackBilling, demoPackBilling.redemptions, redemptions],
  );

  const effectivePackMeta = useMemo(
    () => ({ ...demoPackBilling.packMeta, ...packMeta }),
    [demoPackBilling.packMeta, packMeta],
  );

  const packTotals = useMemo(() => {
    const consumedByPurchase = buildConsumedByPurchase(baseRedemptions);

    let purchasedTotal = 0;
    let consumedValue = 0;
    let remainingValue = 0;

    for (const p of basePurchases) {
      if (p.payment_status !== "paid") continue;
      purchasedTotal += p.total_price;

      const { consumed, remaining } = getPackPurchaseConsumption({ id: p.id, quantity: p.quantity }, consumedByPurchase);
      consumedValue += consumed * p.unit_price;
      remainingValue += remaining * p.unit_price;
    }

    return { purchasedTotal, consumedValue, remainingValue, consumedByPurchase };
  }, [basePurchases, baseRedemptions]);

  const packHistoryRows = useMemo(() => {
    const getPackName = (packId: string) => {
      const meta = effectivePackMeta[packId];
      const title = meta?.title?.trim();
      const label = meta?.label?.trim();
      return title || label || packId.slice(0, 8);
    };

    return basePurchases
      .map((p) => {
        const { consumed, remaining, fullyConsumed } = getPackPurchaseConsumption(
          { id: p.id, quantity: p.quantity },
          packTotals.consumedByPurchase,
        );
        return {
          purchase: p,
          packName: getPackName(p.pack_id),
          consumed,
          remaining,
          fullyConsumed,
        };
      })
      .sort((a, b) => new Date(b.purchase.created_at).getTime() - new Date(a.purchase.created_at).getTime());
  }, [basePurchases, effectivePackMeta, packTotals.consumedByPurchase]);

  const canViewPacks = role === "owner" || role === "manager" || role === "accounting";
  const canViewReversements = role === "owner" || role === "manager" || role === "accounting";

  const visiblePackHistoryRows = useMemo(() => {
    if (packConsumptionFilter === "all") return packHistoryRows;

    if (packConsumptionFilter === "fully_consumed") {
      return packHistoryRows.filter((row) => row.purchase.payment_status === "paid" && row.fullyConsumed);
    }

    return packHistoryRows.filter((row) => {
      if (row.purchase.payment_status !== "paid") return true;
      return row.remaining > 0;
    });
  }, [packConsumptionFilter, packHistoryRows]);

  function statusBadgePayout(status: string) {
    if (status === "submitted") return { label: "Soumise", cls: "bg-blue-100 text-blue-700 border-blue-200" };
    if (status === "approved") return { label: "Approuvée", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    if (status === "rejected") return { label: "Rejetée", cls: "bg-red-100 text-red-700 border-red-200" };
    if (status === "processing") return { label: "En cours", cls: "bg-amber-100 text-amber-700 border-amber-200" };
    if (status === "completed") return { label: "Complétée", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    return { label: status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
  }

  const reversementsCard = (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Reversements · Fenêtres & demandes de payout"
          description="Montants payables par fenêtre (1-15 et 16-31) et historique des demandes."
          icon={DollarSign}
        />
      </CardHeader>
      <CardContent className="space-y-6">
        {!canViewReversements ? (
          <div className="text-sm text-slate-600">Votre rôle ne permet pas de voir ce détail.</div>
        ) : null}

        {canViewReversements ? (
          <>
            {windowsError ? (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{windowsError}</span>
              </div>
            ) : null}

            {bankDetailsError ? (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{bankDetailsError}</span>
              </div>
            ) : null}

            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">RIB (lecture seule)</div>
                  <div className="font-semibold text-sm text-slate-900">Coordonnées bancaires</div>
                </div>
                {bankDetails ? (
                  <Badge
                    className={cn(
                      bankDetails.is_validated
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                        : "bg-amber-100 text-amber-700 border-amber-200",
                    )}
                  >
                    {bankDetails.is_validated ? "Validé" : "En attente"}
                  </Badge>
                ) : (
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200">Non renseigné</Badge>
                )}
              </div>

              {loadingBankDetails ? (
                <div className="mt-3 text-sm text-slate-600 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement du RIB…
                </div>
              ) : bankDetails ? (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">Banque</div>
                    <div className="font-semibold text-slate-900 truncate">{bankDetails.bank_name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Titulaire</div>
                    <div className="font-semibold text-slate-900 truncate">{bankDetails.holder_name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">RIB</div>
                    <div className="font-mono text-xs text-slate-900 break-all">{bankDetails.rib_24 || "—"}</div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-600">
                  RIB non renseigné. Contactez le support ou l’équipe Sortir Au Maroc pour l’ajouter.
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-sm text-slate-900 mb-3">Fenêtres de payout</h3>
              {loadingWindows ? (
                <div className="text-sm text-slate-600 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement des fenêtres de payout…
                </div>
              ) : windows.length ? (
                <>
                  <div className="md:hidden space-y-3">
                  {windows.map((window) => {
                    const isEligible = new Date(window.eligible_at) <= new Date();
                    const isSubmitting = submittingRequest === window.payout_id;
                    return (
                      <div key={window.payout_id} className="rounded-xl border bg-white p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-slate-500">Fenêtre</div>
                            <div className="font-semibold text-sm">
                              {new Date(window.window_start).toLocaleDateString("fr-FR")} → {new Date(window.window_end).toLocaleDateString("fr-FR")}
                            </div>
                          </div>
                          <Badge className={cn(isEligible ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200")}>
                            {isEligible ? "Eligible" : "À venir"}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-slate-500">Montant</div>
                            <div className="font-semibold tabular-nums whitespace-nowrap">{formatMoney(window.amount_cents, window.currency)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-500">Payable le</div>
                            <div className="text-sm text-slate-700 whitespace-nowrap">{new Date(window.eligible_at).toLocaleDateString("fr-FR")}</div>
                          </div>
                        </div>

                        {window.has_request ? (
                          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-700 flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                            Demande de payout déjà soumise
                          </div>
                        ) : isEligible ? (
                          <Button
                            size="sm"
                            className="w-full"
                            disabled={isSubmitting}
                            onClick={() => void handleSubmitPayoutRequest(window.payout_id)}
                          >
                            {isSubmitting ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Soumission…
                              </>
                            ) : (
                              "Demander le payout"
                            )}
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <Table className="min-w-[860px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fenêtre</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead>Payable le</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {windows.map((window) => {
                        const isEligible = new Date(window.eligible_at) <= new Date();
                        const isSubmitting = submittingRequest === window.payout_id;
                        return (
                          <TableRow key={window.payout_id}>
                            <TableCell className="whitespace-nowrap text-sm">
                              {new Date(window.window_start).toLocaleDateString("fr-FR")} →{" "}
                              {new Date(window.window_end).toLocaleDateString("fr-FR")}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{formatMoney(window.amount_cents, window.currency)}</TableCell>
                            <TableCell className="whitespace-nowrap">{new Date(window.eligible_at).toLocaleDateString("fr-FR")}</TableCell>
                            <TableCell>
                              {window.has_request ? (
                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1.5">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Demande soumise
                                </Badge>
                              ) : (
                                <Badge className={cn(isEligible ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200")}>
                                  {isEligible ? "Eligible" : "À venir"}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {!window.has_request && isEligible ? (
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={isSubmitting}
                                  onClick={() => void handleSubmitPayoutRequest(window.payout_id)}
                                >
                                  {isSubmitting ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                      Soumission…
                                    </>
                                  ) : (
                                    "Demander"
                                  )}
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
              ) : (
                <div className="text-sm text-slate-600">Aucune fenêtre de payout pour le moment.</div>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-sm text-slate-900 mb-3">Historique des demandes</h3>
              {loadingRequests ? (
                <div className="text-sm text-slate-600 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement…
                </div>
              ) : payoutRequests.length ? (
                <>
                  <div className="md:hidden space-y-3">
                    {payoutRequests.map((req) => {
                      const st = statusBadgePayout(req.status);
                      return (
                        <div key={req.id} className="rounded-xl border bg-white p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs text-slate-500">Date de demande</div>
                              <div className="font-semibold text-sm">{new Date(req.created_at).toLocaleDateString("fr-FR")}</div>
                            </div>
                            <Badge className={st.cls}>{st.label}</Badge>
                          </div>

                          {req.payout ? (
                            <div className="space-y-2 text-sm">
                              <div>
                                <div className="text-xs text-slate-500">Fenêtre</div>
                                <div className="text-slate-700">
                                  {new Date(req.payout.window_start).toLocaleDateString("fr-FR")} → {new Date(req.payout.window_end).toLocaleDateString("fr-FR")}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-500">Montant</div>
                                <div className="font-semibold tabular-nums">{formatMoney(req.payout.amount_cents, req.payout.currency)}</div>
                              </div>
                            </div>
                          ) : null}

                          {req.pro_comment ? (
                            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-xs text-slate-700">
                              <div className="font-semibold mb-1">Votre commentaire :</div>
                              <div>{req.pro_comment}</div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <Table className="min-w-[860px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date de demande</TableHead>
                          <TableHead>Fenêtre</TableHead>
                          <TableHead>Montant</TableHead>
                          <TableHead>Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payoutRequests.map((req) => {
                          const st = statusBadgePayout(req.status);
                          return (
                            <TableRow key={req.id}>
                              <TableCell className="whitespace-nowrap text-sm">{new Date(req.created_at).toLocaleDateString("fr-FR")}</TableCell>
                              <TableCell className="text-sm">
                                {req.payout ? (
                                  <>
                                    <div className="font-semibold">
                                      {new Date(req.payout.window_start).toLocaleDateString("fr-FR")} → {new Date(req.payout.window_end).toLocaleDateString("fr-FR")}
                                    </div>
                                    {req.pro_comment ? <div className="text-xs text-slate-500 mt-1">{req.pro_comment.slice(0, 50)}{req.pro_comment.length > 50 ? "…" : ""}</div> : null}
                                  </>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{req.payout ? formatMoney(req.payout.amount_cents, req.payout.currency) : "—"}</TableCell>
                              <TableCell>
                                <Badge className={st.cls}>{st.label}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-600">Aucune demande de payout pour le moment.</div>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );

  const invoicesCard = (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Factures & paiements"
          description="Téléchargez vos factures en PDF et suivez l'historique."
        />
      </CardHeader>
      <CardContent>
        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        {loading ? (
          <div className="text-sm text-slate-600 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Chargement…
          </div>
        ) : items.length ? (
          <>
            <div className="md:hidden space-y-3">
              {items.map((i) => {
                const st = statusBadge(i.status);
                return (
                  <div key={i.id} className="rounded-xl border bg-white p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{i.period_start} → {i.period_end}</div>
                        <div className="text-xs text-slate-600">{i.id}</div>
                      </div>
                      <Badge className={st.cls}>{st.label}</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-slate-500">Total</div>
                        <div className="font-semibold tabular-nums whitespace-nowrap">{formatMoney(i.amount_due, i.currency)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Échéance</div>
                        <div className="text-sm text-slate-700 whitespace-nowrap">{i.due_date}</div>
                      </div>
                    </div>

                    <Button variant="outline" size="sm" className="gap-2 w-full justify-center" onClick={() => void openInvoicePrint(i, establishment)}>
                      <Download className="w-4 h-4" />
                      PDF
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Période</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead className="text-right">PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => {
                    const st = statusBadge(i.status);
                    return (
                      <TableRow key={i.id}>
                        <TableCell>
                          <div className="font-semibold">{i.period_start} → {i.period_end}</div>
                          <div className="text-xs text-slate-600">{i.id}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatMoney(i.amount_due, i.currency)}</TableCell>
                        <TableCell>
                          <Badge className={st.cls}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{i.due_date}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" className="gap-2" onClick={() => void openInvoicePrint(i, establishment)}>
                            <Download className="w-4 h-4" />
                            PDF
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-600">Aucune facture pour le moment.</div>
        )}
      </CardContent>
    </Card>
  );

  const packsCard = (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Packs · Historique (achetés / consommés / restants)"
          description="Achats de packs, consommations (redeem) et reste à consommer."
          icon={PackageCheck}
          actions={showingDemoPackBilling ? <Badge className="bg-white/20 text-slate-900 border-slate-200">Démo</Badge> : null}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {!canViewPacks ? <div className="text-sm text-slate-600">Votre rôle ne permet pas de voir ce détail.</div> : null}

        {canViewPacks ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-600">Acheté (payé)</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-extrabold">{formatMoney(packTotals.purchasedTotal, "MAD")}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-600">Consommé</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-extrabold">{formatMoney(packTotals.consumedValue, "MAD")}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-600">Reste à consommer</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-extrabold">{formatMoney(packTotals.remainingValue, "MAD")}</CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">Achats</div>
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold text-slate-600">Consommation</div>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={packConsumptionFilter}
                  onChange={(e) => setPackConsumptionFilter((e.target.value as any) ?? "not_consumed")}
                >
                  <option value="not_consumed">Non consommés</option>
                  <option value="fully_consumed">Consommés</option>
                  <option value="all">Tous</option>
                </select>
              </div>
            </div>

            {loadingPacks ? (
              <div className="text-sm text-slate-600 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement…
              </div>
            ) : visiblePackHistoryRows.length ? (
              <>
                <div className="md:hidden space-y-3">
                  {visiblePackHistoryRows.map(({ purchase: p, consumed, remaining, packName }) => {
                    const pay = packPaymentBadge(p.payment_status);
                    const progress = p.quantity > 0 ? Math.round((consumed / p.quantity) * 100) : 0;
                    return (
                      <div key={p.id} data-pack-purchase-id={p.id} className="rounded-xl border bg-white p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-slate-500">Date</div>
                            <div className="font-semibold whitespace-nowrap">{new Date(p.created_at).toLocaleDateString("fr-FR")}</div>
                          </div>
                          <Badge className={pay.cls}>{pay.label}</Badge>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">Pack</div>
                          <div className="font-semibold truncate">{packName}</div>
                          <div className="text-xs text-slate-600 font-mono">{p.pack_id.slice(0, 8)}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-slate-500">Client</div>
                            <div className="font-semibold truncate">{p.buyer_name || p.buyer_email || "Client"}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-500">Total</div>
                            <div className="font-semibold tabular-nums whitespace-nowrap">{formatMoney(p.total_price, p.currency)}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <div className="text-xs text-slate-500">Acheté</div>
                            <div className="font-semibold tabular-nums">{p.quantity}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Consommé</div>
                            <div className="font-semibold tabular-nums">{consumed}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-500">Restant</div>
                            <div className="font-semibold tabular-nums">{remaining}</div>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">Progression</div>
                          <div className="mt-1 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", p.payment_status === "paid" ? "bg-emerald-500" : "bg-slate-300")}
                              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                            />
                          </div>
                        </div>

                        <div className="text-xs text-slate-600">
                          Validité: {p.valid_until ? new Date(p.valid_until).toLocaleDateString("fr-FR") : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <Table className="min-w-[980px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Pack</TableHead>
                        <TableHead>Paiement</TableHead>
                        <TableHead>Acheté</TableHead>
                        <TableHead>Consommé</TableHead>
                        <TableHead>Restant</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Validité</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visiblePackHistoryRows.map(({ purchase: p, consumed, remaining, packName }) => {
                        const pay = packPaymentBadge(p.payment_status);
                        const progress = p.quantity > 0 ? Math.round((consumed / p.quantity) * 100) : 0;
                        return (
                          <TableRow key={p.id} data-pack-purchase-id={p.id}>
                            <TableCell className="whitespace-nowrap">{new Date(p.created_at).toLocaleDateString("fr-FR")}</TableCell>
                            <TableCell>
                              <div className="font-semibold">{p.buyer_name || p.buyer_email || "Client"}</div>
                              <div className="text-xs text-slate-600 font-mono">{p.id.slice(0, 8)}</div>
                            </TableCell>
                            <TableCell className="min-w-[180px]">
                              <div className="font-semibold truncate max-w-[260px]">{packName}</div>
                              <div className="text-xs text-slate-600 font-mono">{p.pack_id.slice(0, 8)}</div>
                            </TableCell>
                            <TableCell>
                              <Badge className={pay.cls}>{pay.label}</Badge>
                            </TableCell>
                            <TableCell>{p.quantity}</TableCell>
                            <TableCell>
                              <div className="font-semibold">{consumed}</div>
                              <div className="mt-1 h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full", p.payment_status === "paid" ? "bg-emerald-500" : "bg-slate-300")}
                                  style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                                />
                              </div>
                            </TableCell>
                            <TableCell>{remaining}</TableCell>
                            <TableCell>{formatMoney(p.total_price, p.currency)}</TableCell>
                            <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                              {p.valid_until ? new Date(p.valid_until).toLocaleDateString("fr-FR") : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-600">Aucun achat de pack pour le moment.</div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">Total dû</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-extrabold">{formatMoney(totals.due, "MAD")}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">Total payé</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-extrabold">{formatMoney(totals.paid, "MAD")}</CardContent>
        </Card>
      </div>

      <div className="md:hidden">
        <Tabs value={mobileTab} onValueChange={setMobileTab} className="w-full">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="invoices" className="font-bold text-xs">Factures</TabsTrigger>
            <TabsTrigger value="packs" className="font-bold text-xs">Packs</TabsTrigger>
            <TabsTrigger value="reversements" className="font-bold text-xs">Reversements</TabsTrigger>
            <TabsTrigger value="visibility" className="font-bold text-xs">Visibilité</TabsTrigger>
          </TabsList>
          <TabsContent value="invoices" className="mt-4">
            {invoicesCard}
          </TabsContent>
          <TabsContent value="packs" className="mt-4">
            {packsCard}
          </TabsContent>
          <TabsContent value="reversements" className="mt-4">
            {reversementsCard}
          </TabsContent>
          <TabsContent value="visibility" className="mt-4">
            <Card>
              <CardHeader>
                <SectionHeader
                  title="Commandes de visibilité"
                  description="Historique de vos achats de services de visibilité."
                />
              </CardHeader>
              <CardContent>
                {loadingVisibilityOrders ? (
                  <div className="text-sm text-slate-600 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement…
                  </div>
                ) : visibilityOrders.length ? (
                  <div className="space-y-3">
                    {visibilityOrders.map((order) => (
                      <div key={order.id} className="rounded-xl border bg-white p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-slate-500">Date</div>
                            <div className="font-semibold text-sm">{new Date(order.created_at).toLocaleDateString("fr-FR")}</div>
                          </div>
                          <Badge className={order.payment_status === "paid" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}>
                            {order.payment_status === "paid" ? "Payée" : "En attente"}
                          </Badge>
                        </div>

                        <div className="space-y-1 text-sm">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="text-slate-700">
                              {item.title || "Service"} × {item.quantity}
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="font-semibold text-sm">Total :</div>
                          <div className="text-lg font-bold tabular-nums">
                            {formatMoney(order.total_cents, order.currency)}
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2"
                          onClick={() => void openVisibilityOrderInvoicePrint(order, establishment)}
                        >
                          <Download className="w-4 h-4" />
                          Télécharger facture
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">Aucune commande de visibilité pour le moment.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <div className="hidden md:block space-y-6">
        {invoicesCard}
        {packsCard}
        {reversementsCard}

        <Card>
          <CardHeader>
            <SectionHeader
              title="Commandes de visibilité"
              description="Historique de vos achats de services de visibilité."
            />
          </CardHeader>
          <CardContent>
            {loadingVisibilityOrders ? (
              <div className="text-sm text-slate-600 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement…
              </div>
            ) : visibilityOrders.length ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[860px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Services</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibilityOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(order.created_at).toLocaleDateString("fr-FR")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {order.items.map(item => `${item.title || "Service"} (×${item.quantity})`).join(", ")}
                        </TableCell>
                        <TableCell>
                          <Badge className={order.payment_status === "paid" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}>
                            {order.payment_status === "paid" ? "Payée" : "En attente"}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-semibold">
                          {formatMoney(order.total_cents, order.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => void openVisibilityOrderInvoicePrint(order, establishment)}
                          >
                            <Download className="w-4 h-4" />
                            Facture
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-sm text-slate-600">Aucune commande de visibilité pour le moment.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
