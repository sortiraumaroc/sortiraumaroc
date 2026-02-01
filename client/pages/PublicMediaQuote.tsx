import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getBillingCompanyProfile,
  type BillingCompanyProfile,
} from "@/lib/publicApi";

type PublicQuoteItem = {
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

type PublicQuote = {
  id: string;
  quote_number: string;
  status: string;
  client_type: string;
  currency: string;
  payment_method?: string | null;
  valid_until: string | null;
  notes: string | null;
  payment_terms: string | null;
  delivery_estimate: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  pro_profiles?: {
    company_name?: string | null;
    contact_name?: string | null;
  } | null;
  establishments?: { name?: string | null; city?: string | null } | null;
  items: PublicQuoteItem[];
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

function quoteStatusLabel(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "draft")
    return {
      label: "Brouillon",
      cls: "bg-slate-50 text-slate-700 border-slate-200",
    };
  if (s === "sent")
    return {
      label: "Envoyé",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    };
  if (s === "accepted")
    return {
      label: "Accepté",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  if (s === "rejected")
    return { label: "Refusé", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  if (s === "expired")
    return {
      label: "Expiré",
      cls: "bg-slate-100 text-slate-700 border-slate-200",
    };
  if (s === "cancelled")
    return {
      label: "Annulé",
      cls: "bg-slate-100 text-slate-700 border-slate-200",
    };
  return { label: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
}

export default function PublicMediaQuote() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [companyProfile, setCompanyProfile] =
    useState<BillingCompanyProfile | null>(null);

  const safeToken = String(token ?? "").trim();

  const clientLabel = useMemo(() => {
    if (!quote) return "";
    const pro = quote.pro_profiles;
    const proName = pro?.company_name || pro?.contact_name || null;
    const est = quote.establishments?.name || null;
    const city = quote.establishments?.city || null;

    const name = proName || est || "Client";
    return city && est ? `${name} (${city})` : name;
  }, [quote]);

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
        `/api/public/media/quotes/${encodeURIComponent(safeToken)}`,
        { method: "GET" },
      );
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          (payload && typeof payload.error === "string" && payload.error) ||
          `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const q = payload?.quote as PublicQuote | null;
      if (!q) throw new Error("quote_not_found");
      setQuote(q);
      setAccepted(String(q.status ?? "").toLowerCase() === "accepted");
    } catch (e) {
      setQuote(null);
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeToken]);

  const accept = async () => {
    if (!safeToken) return;

    setAccepting(true);

    try {
      const res = await fetch(
        `/api/public/media/quotes/${encodeURIComponent(safeToken)}/accept`,
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

      setAccepted(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAccepting(false);
    }
  };

  useEffect(() => {
    if (!quote) {
      setCompanyProfile(null);
      return;
    }

    const pm = String(quote.payment_method ?? "")
      .trim()
      .toLowerCase();
    if (pm && pm !== "card") {
      getBillingCompanyProfile()
        .then((p) => setCompanyProfile(p))
        .catch(() => setCompanyProfile(null));
    } else {
      setCompanyProfile(null);
    }
  }, [quote]);

  const status = quoteStatusLabel(String(quote?.status ?? ""));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-600">SAM Media</div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Devis {quote?.quote_number ?? ""}
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

        {loading || !quote ? (
          <div className="text-sm text-slate-600 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Détails</div>
                  <div className="text-sm text-slate-500">
                    Monnaie: {quote.currency}
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2 text-sm">
                  <div>
                    <div className="text-slate-500">Validité</div>
                    <div className="font-semibold">
                      {quote.valid_until
                        ? new Date(quote.valid_until).toLocaleDateString(
                            "fr-FR",
                          )
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Livraison</div>
                    <div className="font-semibold">
                      {quote.delivery_estimate || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Conditions de paiement</div>
                    <div className="font-semibold">
                      {quote.payment_terms || "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">Mode de paiement</div>
                    <div className="font-semibold">
                      {String(quote.payment_method ?? "")
                        .trim()
                        .toLowerCase() === "card"
                        ? "Carte bancaire"
                        : "Virement bancaire"}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">Notes</div>
                    <div className="font-semibold">{quote.notes || "—"}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="font-semibold">Lignes</div>
                {quote.items.length ? (
                  <div className="space-y-2">
                    {quote.items.map((it) => (
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
                              quote.currency,
                            )}{" "}
                            × {it.quantity} · TVA {it.tax_rate_snapshot}%
                          </div>
                        </div>
                        <div className="font-semibold tabular-nums">
                          {formatMoneyAmount(it.line_total, quote.currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Aucune ligne.</div>
                )}

                <div className="flex items-center justify-between pt-3 mt-3 border-t">
                  <div className="text-sm text-slate-600">
                    Sous-total:{" "}
                    <span className="font-semibold">
                      {formatMoneyAmount(quote.subtotal_amount, quote.currency)}
                    </span>{" "}
                    · TVA:{" "}
                    <span className="font-semibold">
                      {formatMoneyAmount(quote.tax_amount, quote.currency)}
                    </span>
                  </div>
                  <div className="text-lg font-extrabold tabular-nums">
                    {formatMoneyAmount(quote.total_amount, quote.currency)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="font-semibold">Validation</div>

                {accepted ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <CheckCircle2 className="h-5 w-5" />
                      <div className="font-semibold">Devis accepté</div>
                    </div>

                    {String(quote.payment_method ?? "")
                      .trim()
                      .toLowerCase() === "card" ? (
                      <div className="text-xs text-slate-600">
                        Vous recevrez la facture et le lien de paiement par
                        carte bancaire.
                      </div>
                    ) : companyProfile ? (
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
                    ) : null}
                  </div>
                ) : (
                  <div className="flex items-center justify-end">
                    <Button
                      onClick={() => void accept()}
                      disabled={accepting}
                      className="gap-2"
                    >
                      {accepting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      Accepter le devis
                    </Button>
                  </div>
                )}

                <div className="text-xs text-slate-500">
                  En acceptant ce devis, vous confirmez votre accord sur les
                  prestations et montants indiqués.
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
