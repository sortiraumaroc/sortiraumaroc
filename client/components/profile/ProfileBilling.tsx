import { useEffect, useMemo, useState } from "react";
import { CreditCard, Download, FileText, PlusCircle, Receipt, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoneyMad, getBookingPreReservationBreakdown } from "@/lib/billing";
import {
  BILLING_DATA_CHANGED_EVENT,
  addCard,
  detectCardBrand,
  ensureDemoCard,
  getCardLabel,
  listCards,
  removeCard,
  setDefaultCard,
  type PaymentCard,
} from "@/lib/paymentMethods";
import { isDemoModeEnabled } from "@/lib/demoMode";
import { generateInvoicePDF } from "@/lib/invoicePdf";
import { generatePackInvoicePDF } from "@/lib/packInvoicePdf";
import { isBookingInPast } from "@/lib/reservationStatus";
import { getMyConsumerReservationInvoice } from "@/lib/consumerReservationsApi";
import { getMyConsumerPackPurchaseInvoice } from "@/lib/consumerPacksApi";
import type { BookingRecord, PackPurchase } from "@/lib/userData";

function formatShortDate(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function makeInvoiceNumber(bookingId: string, issuedAtIso: string): string {
  const y = new Date(issuedAtIso).getFullYear();
  const suffix = bookingId.replace(/[^A-Z0-9]/gi, "").slice(-6).toUpperCase();
  return `SAM-${y}-${suffix}`;
}

export function ProfileBilling({
  bookings,
  packPurchases,
}: {
  bookings: BookingRecord[];
  packPurchases: PackPurchase[];
}) {
  const [cards, setCards] = useState<PaymentCard[]>(() => listCards());

  const [holderName, setHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addCardDialogOpen, setAddCardDialogOpen] = useState(false);

  useEffect(() => {
    if (isDemoModeEnabled()) ensureDemoCard();
    setCards(listCards());

    const sync = () => setCards(listCards());
    window.addEventListener(BILLING_DATA_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(BILLING_DATA_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const defaultCard = useMemo(() => cards.find((c) => c.isDefault) ?? cards[0] ?? null, [cards]);

  const payments = useMemo(() => {
    const bookingRows = bookings
      .filter((b) => b.payment && b.payment.status === "paid" && b.payment.currency.toUpperCase() === "MAD")
      .map((b) => {
        const breakdown = getBookingPreReservationBreakdown(b);
        const total = breakdown.totalMad ?? 0;
        return {
          kind: "booking" as const,
          id: b.id,
          title: b.title,
          dateIso: b.dateIso,
          booking: b,
          unitMad: breakdown.unitMad ?? 0,
          quantity: breakdown.partySize ?? 1,
          totalMad: total,
          paidAtIso: b.payment?.paidAtIso ?? b.createdAtIso,
          methodLabel: b.payment?.methodLabel ?? (defaultCard ? getCardLabel(defaultCard) : "Paiement sécurisé"),
        };
      });

    const packRows = (packPurchases ?? [])
      .filter((p) => p.payment && p.payment.status === "paid" && p.payment.currency.toUpperCase() === "MAD")
      .map((p) => {
        const qty = Math.max(1, Math.round(Number(p.quantity) || 1));
        const unit = Math.round(Number(p.unitMad) || Math.round(Number(p.payment?.depositAmount) || 0));
        const total = Math.round(Number(p.payment?.totalAmount) || unit * qty);

        return {
          kind: "pack" as const,
          id: p.id,
          title: p.title,
          dateIso: p.createdAtIso,
          pack: p,
          unitMad: unit,
          quantity: qty,
          totalMad: total,
          paidAtIso: p.payment?.paidAtIso ?? p.createdAtIso,
          methodLabel: p.payment?.methodLabel ?? (defaultCard ? getCardLabel(defaultCard) : "Paiement sécurisé"),
        };
      });

    return [...bookingRows, ...packRows].sort((a, b) => (a.paidAtIso < b.paidAtIso ? 1 : a.paidAtIso > b.paidAtIso ? -1 : 0));
  }, [bookings, defaultCard, packPurchases]);

  const totalPaid = useMemo(() => payments.reduce((acc, p) => acc + (p.totalMad || 0), 0), [payments]);

  const resetAddForm = () => {
    setHolderName("");
    setCardNumber("");
    setExpMonth("");
    setExpYear("");
    setAddError(null);
  };


  const onAddCard = () => {
    setAddError(null);
    const res = addCard({
      holderName,
      cardNumber,
      expMonth: Number(expMonth),
      expYear: Number(expYear),
    });
    if (res.ok === false) {
      setAddError(res.message);
      return;
    }
    resetAddForm();
    setAddCardDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-600">Paiements (MAD)</div>
          <div className="text-xl font-extrabold text-foreground tabular-nums">{payments.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-600">Total payé</div>
          <div className="text-xl font-extrabold text-foreground tabular-nums">{formatMoneyMad(totalPaid)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-600">Carte par défaut</div>
          <div className="mt-1 font-bold text-foreground truncate">{defaultCard ? getCardLabel(defaultCard) : "—"}</div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            <div>
              <div className="font-bold text-foreground">Cartes enregistrées</div>
              <div className="text-sm text-slate-600">Stockage démo : nous ne conservons jamais le numéro complet.</div>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="gap-2 w-full sm:w-auto"
            onClick={() => setAddCardDialogOpen(true)}
          >
            <PlusCircle className="w-4 h-4" />
            Ajouter une carte
          </Button>
        </div>

        <div className="mt-4">
          {cards.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Aucune carte enregistrée.</div>
          ) : (
            <div className="space-y-3">
              {cards.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "rounded-lg border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3",
                    c.isDefault ? "bg-primary/5" : "bg-white",
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-bold text-foreground truncate">{getCardLabel(c)}</div>
                    <div className="mt-1 text-xs text-slate-600">Titulaire: {c.holderName}</div>
                    <div className="text-xs text-slate-600">
                      Expire: {String(c.expMonth).padStart(2, "0")}/{String(c.expYear).slice(-2)}
                    </div>
                  </div>
                  <div className="flex flex-row flex-wrap items-center justify-start sm:justify-end gap-2">
                    {!c.isDefault ? (
                      <Button type="button" variant="outline" onClick={() => setDefaultCard(c.id)}>
                        Par défaut
                      </Button>
                    ) : (
                      <div className="inline-flex items-center gap-2 text-xs font-bold text-primary px-2 py-1 rounded-full bg-white border border-slate-200">
                        <Star className="w-3.5 h-3.5" />
                        Défaut
                      </div>
                    )}
                    <Button type="button" variant="outline" onClick={() => removeCard(c.id)}>
                      Retirer
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Dialog
          open={addCardDialogOpen}
          onOpenChange={(v) => {
            setAddCardDialogOpen(v);
            if (!v) resetAddForm();
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Ajouter une carte</DialogTitle>
              <DialogDescription>
                Le type de carte (Visa/Mastercard) est détecté automatiquement. Données enregistrées en mode démo.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <div className="text-xs font-bold text-slate-700 mb-1">Titulaire</div>
                <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Nom complet" />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-xs font-bold text-slate-700">Numéro</div>
                  {(() => {
                    const brand = detectCardBrand(cardNumber);
                    const label = brand === "visa" ? "Visa" : brand === "mastercard" ? "Mastercard" : null;
                    if (!label) return null;
                    return (
                      <div className="text-[11px] font-bold text-slate-700 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                        {label}
                      </div>
                    );
                  })()}
                </div>
                <Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="0000 0000 0000 0000" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-700 mb-1">Mois</div>
                  <Input value={expMonth} onChange={(e) => setExpMonth(e.target.value)} placeholder="MM" inputMode="numeric" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-700 mb-1">Année</div>
                  <Input value={expYear} onChange={(e) => setExpYear(e.target.value)} placeholder="YYYY" inputMode="numeric" />
                </div>
              </div>

              {addError ? <div className="text-xs font-semibold text-rose-700">{addError}</div> : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddCardDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="button" className="gap-2" onClick={onAddCard}>
                <PlusCircle className="w-4 h-4" />
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            <div>
              <div className="font-bold text-foreground">Paiements & factures</div>
              <div className="text-sm text-slate-600">Téléchargez vos factures (réservations et packs).</div>
            </div>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Aucun paiement enregistré.</div>
        ) : (
          <div className="mt-4 space-y-6">
            {(() => {
              const nowMs = Date.now();
              const bookingPayments = payments.filter((p) => p.kind === "booking");
              const packPayments = payments.filter((p) => p.kind === "pack");

              const bookingCurrent = bookingPayments.filter((p) => {
                const b = (p as any).booking as BookingRecord | undefined;
                return b ? !isBookingInPast(b, nowMs) : true;
              });

              const bookingExpired = bookingPayments.filter((p) => {
                const b = (p as any).booking as BookingRecord | undefined;
                return b ? isBookingInPast(b, nowMs) : false;
              });

              const renderPayment = (p: any) => {
                const fallbackInvoiceNumber = makeInvoiceNumber(p.id, p.paidAtIso);
                const isPack = p.kind === "pack";

                return (
                  <div key={`${p.kind}:${p.id}`} className="rounded-lg border border-slate-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        <div className="font-bold text-foreground truncate">{isPack ? `Pack · ${p.title}` : p.title}</div>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">Réf. {p.id}</div>
                      <div className="mt-2">
                        <div className="flex items-start justify-between gap-4 rounded-md bg-slate-50 px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-600">{isPack ? "Pack" : "Pré-réservation"}</div>
                            <div className="text-xs text-slate-500">
                              {formatMoneyMad(p.unitMad)} × {p.quantity}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] text-slate-500">Montant payé</div>
                            <div className="text-sm font-extrabold text-foreground tabular-nums">{formatMoneyMad(p.totalMad)}</div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">Payé le {formatShortDate(p.paidAtIso)}</div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => {
                          void (async () => {
                            let invoiceNumber = fallbackInvoiceNumber;
                            let issuedAtIso = p.paidAtIso;

                            try {
                              if (isPack) {
                                const inv = await getMyConsumerPackPurchaseInvoice(p.id);
                                invoiceNumber = inv.invoice_number;
                                issuedAtIso = inv.issued_at;
                              } else {
                                const inv = await getMyConsumerReservationInvoice(p.id);
                                invoiceNumber = inv.invoice_number;
                                issuedAtIso = inv.issued_at;
                              }
                            } catch {
                              // Fallback to legacy client-side identifier if the server invoice can't be fetched.
                            }

                            if (isPack) {
                              const pack = (p as unknown as { pack: PackPurchase }).pack;
                              await generatePackInvoicePDF({
                                invoiceNumber,
                                issuedAtIso,
                                purchaseId: p.id,
                                packTitle: p.title,
                                establishmentName: pack.establishmentName,
                                quantity: p.quantity,
                                unitMad: p.unitMad,
                                totalMad: p.totalMad,
                                paymentMethodLabel: p.methodLabel,
                              });
                              return;
                            }

                            await generateInvoicePDF({
                              invoiceNumber,
                              issuedAtIso,
                              bookingReference: p.id,
                              establishmentName: p.title,
                              reservationDateIso: p.dateIso,
                              partySize: p.quantity,
                              unitMad: p.unitMad,
                              totalMad: p.totalMad,
                              paymentMethodLabel: p.methodLabel,
                            });
                          })();
                        }}
                      >
                        <Download className="w-4 h-4" />
                        Facture
                      </Button>
                    </div>
                  </div>
                );
              };

              const section = (title: string, items: any[], emptyText: string) => {
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-extrabold text-slate-900">{title}</div>
                      <div className="text-xs text-slate-500 tabular-nums">{items.length}</div>
                    </div>
                    {items.length ? <div className="space-y-3">{items.map(renderPayment)}</div> : <div className="text-sm text-slate-600">{emptyText}</div>}
                  </div>
                );
              };

              return (
                <>
                  {section("Réservations payées (à venir)", bookingCurrent, "Aucune réservation payée à venir.")}
                  {section("Réservations payées (expirées)", bookingExpired, "Aucune réservation payée expirée.")}
                  {section("Packs payés", packPayments, "Aucun pack payé.")}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
