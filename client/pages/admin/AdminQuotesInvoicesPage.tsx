import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Plus, RefreshCw } from "lucide-react";
import { AdminPaymentsNav } from "./payments/AdminPaymentsNav";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AdminApiError,
  listAdminVisibilityOffers,
  listAdminMediaQuotes,
  listAdminMediaInvoices,
  createAdminMediaInvoice,
  listAdminProProfiles,
  type AdminProProfile,
  type AdminVisibilityOffer,
  type AdminMediaQuote,
  type AdminMediaInvoice,
} from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatLocalYmdHm,
  formatMoneyAmount,
  quoteStatusBadge,
  invoiceStatusBadge,
  CreateQuoteDialog,
  QuoteDialog,
  InvoiceDialog,
} from "./payments/QuotesInvoicesDialogs";

// ---------------------------------------------------------------------------
// Create Invoice Dialog (standalone, no quote required)
// ---------------------------------------------------------------------------

function CreateInvoiceDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (invoice: AdminMediaInvoice) => void;
}) {
  const { toast } = useToast();
  const NO_ESTABLISHMENT = "__none__";

  const [saving, setSaving] = useState(false);
  const [proQuery, setProQuery] = useState("");
  const [prosLoading, setProsLoading] = useState(false);
  const [proResults, setProResults] = useState<AdminProProfile[]>([]);
  const [selectedPro, setSelectedPro] = useState<AdminProProfile | null>(null);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank_transfer">("bank_transfer");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setProQuery("");
    setProsLoading(false);
    setProResults([]);
    setSelectedPro(null);
    setSelectedEstablishmentId(null);
    setPaymentMethod("bank_transfer");
    setNotes("");
  }, [open]);

  // Recherche pros
  useEffect(() => {
    if (!open) return;
    const q = proQuery.trim();
    if (!q) { setProsLoading(false); setProResults([]); return; }
    const handle = window.setTimeout(() => {
      setProsLoading(true);
      listAdminProProfiles(undefined, { q, limit: 20 })
        .then((res) => setProResults(res.items ?? []))
        .catch(() => setProResults([]))
        .finally(() => setProsLoading(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [proQuery, open]);

  // Auto-select establishment
  useEffect(() => {
    if (!open || !selectedPro) { setSelectedEstablishmentId(null); return; }
    const type = String(selectedPro.client_type ?? "").toUpperCase();
    const preferred = selectedPro.establishments?.[0]?.id ?? "";
    if (type === "A" && preferred && selectedEstablishmentId == null) setSelectedEstablishmentId(preferred);
    if (type !== "A") setSelectedEstablishmentId(NO_ESTABLISHMENT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPro?.user_id, open]);

  const hasProQuery = !!proQuery.trim();
  const showNoResults = hasProQuery && !prosLoading && proResults.length === 0;

  const handleCreate = async () => {
    if (!selectedPro || saving) return;
    setSaving(true);
    try {
      const establishmentId =
        selectedEstablishmentId && selectedEstablishmentId !== NO_ESTABLISHMENT
          ? selectedEstablishmentId.trim()
          : null;
      const res = await createAdminMediaInvoice(undefined, {
        pro_user_id: selectedPro.user_id,
        establishment_id: establishmentId,
        payment_method: paymentMethod,
        notes: notes.trim() || null,
      });
      toast({ title: "Facture créée", description: res.invoice.invoice_number });
      onCreated(res.invoice);
      onClose();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Créer une facture</DialogTitle>
          <DialogDescription>Facture standalone (sans devis préalable)</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recherche pro */}
          <div>
            <Label>Client professionnel</Label>
            {selectedPro ? (
              <div className="mt-1 flex items-center gap-2 rounded-md border p-2">
                <div className="flex-1 text-sm">
                  <span className="font-semibold">{selectedPro.company_name || selectedPro.contact_name}</span>
                  {selectedPro.email ? <span className="text-slate-500 ml-2">{selectedPro.email}</span> : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedPro(null); setProQuery(""); }}>
                  Changer
                </Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Rechercher par nom, email, ICE…"
                  value={proQuery}
                  onChange={(e) => setProQuery(e.target.value)}
                  className="mt-1"
                />
                {prosLoading && <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Recherche…</p>}
                {showNoResults && <p className="text-xs text-slate-500 mt-1">Aucun résultat</p>}
                {proResults.length > 0 && (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border divide-y">
                    {proResults.map((p) => (
                      <li key={p.user_id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                          onClick={() => { setSelectedPro(p); setProQuery(""); setProResults([]); }}
                        >
                          <span className="font-semibold">{p.company_name || p.contact_name}</span>
                          {p.email ? <span className="text-slate-500 ml-2">{p.email}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* Établissement (si type A) */}
          {selectedPro && String(selectedPro.client_type ?? "").toUpperCase() === "A" && (selectedPro.establishments?.length ?? 0) > 0 && (
            <div>
              <Label>Établissement</Label>
              <Select value={selectedEstablishmentId ?? ""} onValueChange={setSelectedEstablishmentId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ESTABLISHMENT}>— Aucun —</SelectItem>
                  {selectedPro.establishments!.map((est) => (
                    <SelectItem key={est.id} value={est.id}>
                      {est.name ?? est.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Méthode de paiement */}
          <div>
            <Label>Méthode de paiement</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Virement bancaire</SelectItem>
                <SelectItem value="card">Carte bancaire</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes (optionnel)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1"
              placeholder="Notes internes…"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button onClick={handleCreate} disabled={!selectedPro || saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Création…</> : "Créer la facture"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function AdminQuotesInvoicesPage() {
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<AdminMediaQuote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [createQuoteOpen, setCreateQuoteOpen] = useState(false);
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<AdminMediaInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [offers, setOffers] = useState<AdminVisibilityOffer[]>([]);
  const [tab, setTab] = useState("quotes");

  const loadOffers = async () => {
    try {
      const res = await listAdminVisibilityOffers(undefined);
      setOffers(res.offers ?? []);
    } catch { /* silent - offers are supplementary */ }
  };

  const loadQuotes = async () => {
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      const res = await listAdminMediaQuotes(undefined, { limit: 200 });
      setQuotes(res.quotes ?? []);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Erreur";
      setQuotesError(msg);
      setQuotes([]);
    } finally {
      setQuotesLoading(false);
    }
  };

  const loadInvoices = async () => {
    setInvoicesLoading(true);
    setInvoicesError(null);
    try {
      const res = await listAdminMediaInvoices(undefined, { limit: 200 });
      setInvoices(res.invoices ?? []);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Erreur";
      setInvoicesError(msg);
      setInvoices([]);
    } finally {
      setInvoicesLoading(false);
    }
  };

  useEffect(() => {
    void loadOffers();
    void loadQuotes();
    void loadInvoices();
  }, []);

  const quotesRows = useMemo(() => {
    return quotes.map((q) => {
      const clientName = q.pro_profiles?.company_name ?? q.pro_profiles?.contact_name ?? q.establishments?.name ?? "—";
      return { ...q, _display_client: clientName, _display_created: q.created_at ? formatLocalYmdHm(q.created_at) : "" };
    });
  }, [quotes]);

  const quotesColumns = useMemo(() => [
    {
      header: "Devis",
      accessorKey: "quote_number",
      cell: ({ row }: any) => {
        const q = row.original as AdminMediaQuote;
        const st = quoteStatusBadge(String(q.status ?? ""));
        return (
          <div className="space-y-1 min-w-[220px]">
            <div className="font-semibold">{q.quote_number}</div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={st.cls}>{st.label}</Badge>
            </div>
          </div>
        );
      },
    },
    {
      header: "Client",
      accessorKey: "_display_client",
      cell: ({ row }: any) => <div className="text-sm">{(row.original as any)._display_client}</div>,
    },
    {
      header: "Total",
      accessorKey: "total_amount",
      cell: ({ row }: any) => {
        const q = row.original as AdminMediaQuote;
        return <div className="font-semibold tabular-nums">{formatMoneyAmount(q.total_amount, q.currency)}</div>;
      },
    },
    {
      header: "Créé",
      accessorKey: "_display_created",
      cell: ({ row }: any) => <div className="text-sm tabular-nums">{(row.original as any)._display_created}</div>,
    },
  ], []);

  const invoicesRows = useMemo(() => {
    return invoices.map((inv) => {
      const clientName = inv.pro_profiles?.company_name ?? inv.pro_profiles?.contact_name ?? inv.establishments?.name ?? "—";
      return { ...inv, _display_client: clientName, _display_created: inv.created_at ? formatLocalYmdHm(inv.created_at) : "" };
    });
  }, [invoices]);

  const invoicesColumns = useMemo(() => {
    return [
      {
        header: "Facture",
        accessorKey: "invoice_number",
        cell: ({ row }: any) => {
          const inv = row.original as AdminMediaInvoice;
          const st = invoiceStatusBadge(String(inv.status ?? ""));
          return (
            <div className="space-y-1 min-w-[220px]">
              <div className="font-semibold">{inv.invoice_number}</div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={st.cls}>
                  {st.label}
                </Badge>
                {inv.media_quotes?.quote_number ? (
                  <Badge variant="secondary">
                    {inv.media_quotes.quote_number}
                  </Badge>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        header: "Client",
        accessorKey: "_display_client",
        cell: ({ row }: any) => (
          <div className="text-sm">{(row.original as any)._display_client}</div>
        ),
      },
      {
        header: "Total",
        accessorKey: "total_amount",
        cell: ({ row }: any) => {
          const inv = row.original as AdminMediaInvoice;
          return (
            <div className="font-semibold tabular-nums">
              {formatMoneyAmount(inv.total_amount, inv.currency)}
            </div>
          );
        },
      },
      {
        header: "Payé",
        accessorKey: "paid_amount",
        cell: ({ row }: any) => {
          const inv = row.original as AdminMediaInvoice;
          return (
            <div className="text-sm tabular-nums">
              {formatMoneyAmount(inv.paid_amount, inv.currency)}
            </div>
          );
        },
      },
      {
        header: "Créé",
        accessorKey: "_display_created",
        cell: ({ row }: any) => (
          <div className="text-sm tabular-nums">
            {(row.original as any)._display_created}
          </div>
        ),
      },
    ];
  }, []);

  return (
    <div className="space-y-4">
      <AdminPaymentsNav />
      <AdminPageHeader
        title="Devis & Factures"
        description="Gestion des devis et factures SAM Media."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="quotes">Devis</TabsTrigger>
          <TabsTrigger value="invoices">Factures</TabsTrigger>
        </TabsList>

        <TabsContent value="quotes" className="space-y-4">
          {quotesError ? (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>{quotesError}</div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-600">{quotes.length} devis</div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="gap-2"
                onClick={() => setCreateQuoteOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Créer un devis
              </Button>
              <Button variant="outline" size="icon" onClick={() => void loadQuotes()} title="Rafraîchir">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {quotesLoading ? (
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : (
            <AdminDataTable<any>
              data={quotesRows as any}
              columns={quotesColumns as any}
              isLoading={quotesLoading}
              searchPlaceholder="Rechercher un devis…"
              onRowClick={(row) =>
                setSelectedQuoteId((row as AdminMediaQuote).id)
              }
            />
          )}

          <CreateQuoteDialog
            open={createQuoteOpen}
            onClose={() => setCreateQuoteOpen(false)}
            onCreated={(q) => {
              setQuotes((prev) => [q, ...prev.filter((x) => x.id !== q.id)]);
              setSelectedQuoteId(q.id);
            }}
          />

          {selectedQuoteId ? (
            <QuoteDialog
              open={!!selectedQuoteId}
              quoteId={selectedQuoteId}
              offers={offers}
              onClose={() => setSelectedQuoteId(null)}
              onQuoteUpdated={(q) => {
                setQuotes((prev) =>
                  prev.map((x) => (x.id === q.id ? { ...x, ...q } : x)),
                );
              }}
              onInvoiceCreated={(inv) => {
                setInvoices((prev) => [
                  inv,
                  ...prev.filter((x) => x.id !== inv.id),
                ]);
                setSelectedInvoiceId(inv.id);
                setTab("invoices");
              }}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          {invoicesError ? (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>{invoicesError}</div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              {invoices.length} facture(s)
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="gap-2"
                onClick={() => setCreateInvoiceOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Créer une facture
              </Button>
              <Button variant="outline" size="icon" onClick={() => void loadInvoices()} title="Rafraîchir">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {invoicesLoading ? (
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : (
            <AdminDataTable<any>
              data={invoicesRows as any}
              columns={invoicesColumns as any}
              isLoading={invoicesLoading}
              searchPlaceholder="Rechercher une facture…"
              onRowClick={(row) =>
                setSelectedInvoiceId((row as AdminMediaInvoice).id)
              }
            />
          )}

          {selectedInvoiceId ? (
            <InvoiceDialog
              open={!!selectedInvoiceId}
              invoiceId={selectedInvoiceId}
              onClose={() => setSelectedInvoiceId(null)}
              onInvoiceUpdated={(inv) => {
                setInvoices((prev) =>
                  prev.map((x) => (x.id === inv.id ? { ...x, ...inv } : x)),
                );
              }}
            />
          ) : null}

          <CreateInvoiceDialog
            open={createInvoiceOpen}
            onClose={() => setCreateInvoiceOpen(false)}
            onCreated={(inv) => {
              setInvoices((prev) => [inv, ...prev.filter((x) => x.id !== inv.id)]);
              setSelectedInvoiceId(inv.id);
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
