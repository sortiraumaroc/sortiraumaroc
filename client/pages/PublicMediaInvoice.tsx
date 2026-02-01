import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getBillingCompanyProfile,
  type BillingCompanyProfile,
} from "@/lib/publicApi";

type PublicInvoiceItem = {
  id: string;
  item_type: string;
  name_snapshot: string;
  description_snapshot: string | null;
  category_snapshot: string | null;
  unit_price_snapshot: number;
  quantity: number;
  tax_rate_snapshot: number;
  line_subtotal: number;
  line_tax: number;
  line_total: number;
};

type PublicInvoice = {
  id: string;
  invoice_number: string;
  status: string;
  client_type: string;
  currency: string;
  payment_method?: string | null;
  issued_at: string | null;
  due_at: string | null;
  notes: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  pro_profiles?: {
    company_name?: string | null;
    contact_name?: string | null;
  } | null;
  establishments?: { name?: string | null; city?: string | null } | null;
  media_quotes?: { quote_number?: string | null } | null;
  items: PublicInvoiceItem[];
};

function formatMoneyAmount(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  const n =
    typeof amount === "number" && Number.isFinite(amount)
      ? amount
      : Number(amount ?? 0);
  const c = String(currency ?? "MAD") || "MAD";

  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: c,
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${c}`;
  }
}

function invoiceStatusLabel(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "draft")
    return {
      label: "Brouillon",
      cls: "bg-slate-50 text-slate-700 border-slate-200",
    };
  if (s === "issued")
    return {
      label: "Émise",
      cls: "bg-indigo-50 text-indigo-700 border-indigo-200",
    };
  if (s === "partial")
    return {
      label: "Partiellement payée",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    };
  if (s === "paid")
    return {
      label: "Payée",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  if (s === "overdue")
    return {
      label: "En retard",
      cls: "bg-rose-50 text-rose-700 border-rose-200",
    };
  if (s === "cancelled")
    return {
      label: "Annulée",
      cls: "bg-slate-100 text-slate-700 border-slate-200",
    };
  return { label: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
}

export default function PublicMediaInvoice() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);

  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const [companyProfile, setCompanyProfile] =
    useState<BillingCompanyProfile | null>(null);

  const safeToken = String(token ?? "").trim();

  const clientLabel = useMemo(() => {
    if (!invoice) return "";
    const pro = invoice.pro_profiles;
    const proName = pro?.company_name || pro?.contact_name || null;
    const est = invoice.establishments?.name || null;
    const city = invoice.establishments?.city || null;

    const name = proName || est || "Client";
    return city && est ? `${name} (${city})` : name;
  }, [invoice]);

  const remainingAmount = useMemo(() => {
    const total =
      typeof invoice?.total_amount === "number" ? invoice.total_amount : 0;
    const paid =
      typeof invoice?.paid_amount === "number" ? invoice.paid_amount : 0;
    return Math.max(0, Math.round((total - paid) * 100) / 100);
  }, [invoice]);

  const load = async () => {
    if (!safeToken) {
      setError("Lien invalide");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/public/media/invoices/${encodeURIComponent(safeToken)}`,
        { method: "GET" },
      );
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          (payload && typeof payload.error === "string" && payload.error) ||
          `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const inv = payload?.invoice as PublicInvoice | null;
      if (!inv) throw new Error("invoice_not_found");
      setInvoice(inv);
    } catch (e) {
      setInvoice(null);
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeToken]);

  const status = invoiceStatusLabel(String(invoice?.status ?? ""));

  const downloadPdfUrl = safeToken
    ? `/api/public/media/invoices/${encodeURIComponent(safeToken)}/pdf`
    : "";

  const payOnline = async () => {
    if (!safeToken || paying) return;
    const pm = String(invoice?.payment_method ?? "")
      .trim()
      .toLowerCase();
    if (pm && pm !== "card") return;

    setPayError(null);
    setPaying(true);

    try {
      const res = await fetch(
        `/api/public/media/invoices/${encodeURIComponent(safeToken)}/pay`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          (payload && typeof payload.error === "string" && payload.error) ||
          `HTTP ${res.status}`;
        throw new Error(msg);
      }

      if (payload?.already_paid === true) {
        await load();
        return;
      }

      const checkoutUrl =
        typeof payload?.checkout_url === "string" ? payload.checkout_url : "";
      if (!checkoutUrl) throw new Error("missing_checkout_url");

      const opened = window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        window.location.assign(checkoutUrl);
      }
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setPaying(false);
    }
  };

  useEffect(() => {
    if (!invoice) {
      setCompanyProfile(null);
      return;
    }

    const pm = String(invoice.payment_method ?? "")
      .trim()
      .toLowerCase();
    if (pm && pm !== "card") {
      getBillingCompanyProfile()
        .then((p) => setCompanyProfile(p))
        .catch(() => setCompanyProfile(null));
    } else {
      setCompanyProfile(null);
    }
  }, [invoice]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-600">SAM Media</div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Facture {invoice?.invoice_number ?? ""}
            </h1>
            {clientLabel ? (
              <div className="text-sm text-slate-700 mt-1">{clientLabel}</div>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="outline" className={status.cls}>
              {status.label}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              Retour
            </Button>
          </div>
        </div>

        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>{error}</div>
            </CardContent>
          </Card>
        ) : null}

        {loading || !invoice ? (
          <div className="text-sm text-slate-600 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="font-semibold">Détails</div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={downloadPdfUrl} target="_blank" rel="noreferrer">
                        Télécharger PDF
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2 text-sm">
                  <div>
                    <div className="text-slate-500">Date d’émission</div>
                    <div className="font-semibold">
                      {invoice.issued_at
                        ? new Date(invoice.issued_at).toLocaleDateString(
                            "fr-FR",
                          )
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Échéance</div>
                    <div className="font-semibold">
                      {invoice.due_at
                        ? new Date(invoice.due_at).toLocaleDateString("fr-FR")
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Devis</div>
                    <div className="font-semibold">
                      {invoice.media_quotes?.quote_number || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Notes</div>
                    <div className="font-semibold">{invoice.notes || "—"}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="font-semibold">Lignes</div>
                {invoice.items.length ? (
                  <div className="space-y-2">
                    {invoice.items.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-start justify-between gap-3 rounded-md border p-3 bg-white"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {it.name_snapshot}
                          </div>
                          {it.description_snapshot ? (
                            <div className="text-xs text-slate-600 mt-1">
                              {it.description_snapshot}
                            </div>
                          ) : null}
                          <div className="text-xs text-slate-500 mt-2">
                            {formatMoneyAmount(
                              it.unit_price_snapshot,
                              invoice.currency,
                            )}{" "}
                            × {it.quantity} · TVA {it.tax_rate_snapshot}%
                          </div>
                        </div>
                        <div className="font-semibold tabular-nums">
                          {formatMoneyAmount(it.line_total, invoice.currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Aucune ligne.</div>
                )}

                <div className="flex items-center justify-between pt-3 mt-3 border-t flex-wrap gap-2">
                  <div className="text-sm text-slate-600">
                    Sous-total:{" "}
                    <span className="font-semibold">
                      {formatMoneyAmount(
                        invoice.subtotal_amount,
                        invoice.currency,
                      )}
                    </span>{" "}
                    · TVA:{" "}
                    <span className="font-semibold">
                      {formatMoneyAmount(invoice.tax_amount, invoice.currency)}
                    </span>
                  </div>
                  <div className="text-lg font-extrabold tabular-nums">
                    {formatMoneyAmount(invoice.total_amount, invoice.currency)}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm text-slate-700">
                  <div>
                    Déjà payé:{" "}
                    <span className="font-semibold">
                      {formatMoneyAmount(invoice.paid_amount, invoice.currency)}
                    </span>
                  </div>
                  <div>
                    Reste à payer:{" "}
                    <span className="font-semibold">
                      {formatMoneyAmount(remainingAmount, invoice.currency)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="font-semibold">Paiement</div>

                {payError ? (
                  <div className="text-sm text-red-700">{payError}</div>
                ) : null}

                {remainingAmount <= 0 ? (
                  <div className="text-sm text-emerald-700 font-semibold">
                    Cette facture est réglée.
                  </div>
                ) : String(invoice.payment_method ?? "")
                    .trim()
                    .toLowerCase() === "card" ? (
                  <>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-sm text-slate-600">
                        Montant à payer:{" "}
                        <span className="font-semibold">
                          {formatMoneyAmount(remainingAmount, invoice.currency)}
                        </span>
                      </div>
                      <Button
                        onClick={() => void payOnline()}
                        disabled={paying}
                        className="gap-2"
                      >
                        {paying ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Payer en ligne
                      </Button>
                    </div>

                    <div className="text-xs text-slate-500">
                      Le paiement s’ouvre dans un nouvel onglet. Une fois le
                      paiement effectué, vous pourrez rafraîchir cette page pour
                      voir le statut mis à jour.
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-slate-700">
                      Mode de paiement:{" "}
                      <span className="font-semibold">Virement bancaire</span>
                    </div>
                    <div className="text-sm text-slate-700">
                      Montant à payer:{" "}
                      <span className="font-semibold">
                        {formatMoneyAmount(remainingAmount, invoice.currency)}
                      </span>
                    </div>

                    {companyProfile ? (
                      <div className="rounded-md border bg-white p-3 text-sm text-slate-700 space-y-1">
                        {companyProfile.bank_account_holder ? (
                          <div>
                            <span className="text-slate-500">Titulaire:</span>{" "}
                            {companyProfile.bank_account_holder}
                          </div>
                        ) : null}
                        {companyProfile.bank_name ? (
                          <div>
                            <span className="text-slate-500">Banque:</span>{" "}
                            {companyProfile.bank_name}
                          </div>
                        ) : null}
                        {companyProfile.rib ? (
                          <div>
                            <span className="text-slate-500">RIB:</span>{" "}
                            {companyProfile.rib}
                          </div>
                        ) : null}
                        {companyProfile.iban ? (
                          <div>
                            <span className="text-slate-500">IBAN:</span>{" "}
                            {companyProfile.iban}
                          </div>
                        ) : null}
                        {companyProfile.swift ? (
                          <div>
                            <span className="text-slate-500">SWIFT:</span>{" "}
                            {companyProfile.swift}
                          </div>
                        ) : null}
                        {companyProfile.bank_instructions ? (
                          <div className="pt-2 text-xs text-slate-500">
                            {companyProfile.bank_instructions}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">
                        Coordonnées bancaires indisponibles pour le moment.
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void load()}
                    disabled={loading}
                  >
                    Rafraîchir
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
