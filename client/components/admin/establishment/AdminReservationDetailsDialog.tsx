import { Copy } from "lucide-react";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getPaymentStatusBadgeClass, getPaymentStatusLabel, getReservationStatusBadgeClass, getReservationStatusLabel } from "@/lib/reservationStatus";
import type { ReservationAdmin } from "@/lib/adminApi";

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function pickFirstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function statusBadge(value: string | null | undefined): JSX.Element {
  const cls = getReservationStatusBadgeClass(value);
  return <Badge className={cls}>{getReservationStatusLabel(value)}</Badge>;
}

function paymentBadge(value: string | null | undefined): JSX.Element {
  const cls = getPaymentStatusBadgeClass(value);
  return <Badge className={cls}>{getPaymentStatusLabel(value)}</Badge>;
}

async function copyToClipboard(text: string): Promise<void> {
  const value = String(text ?? "").trim();
  if (!value) return;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const el = document.createElement("textarea");
  el.value = value;
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "-9999px";
  document.body.appendChild(el);
  el.focus();
  el.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(el);
  if (!ok) throw new Error("copy failed");
}

function extractCustomerInfo(reservation: ReservationAdmin): {
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string;
  message: string;
} {
  const r = reservation as unknown as Record<string, unknown>;
  const meta = isRecord(r.meta) ? (r.meta as Record<string, unknown>) : null;

  const firstName =
    pickFirstString(r, ["first_name", "firstname", "given_name", "customer_first_name", "guest_first_name"]) ||
    (meta ? pickFirstString(meta, ["first_name", "firstname", "given_name", "customer_first_name", "guest_first_name"]) : null) ||
    "—";

  const lastName =
    pickFirstString(r, ["last_name", "lastname", "family_name", "customer_last_name", "guest_last_name"]) ||
    (meta ? pickFirstString(meta, ["last_name", "lastname", "family_name", "customer_last_name", "guest_last_name"]) : null) ||
    "—";

  const fullNameRaw =
    pickFirstString(r, ["name", "full_name", "customer_name", "guest_name"]) ||
    (meta ? pickFirstString(meta, ["name", "full_name", "customer_name", "guest_name"]) : null);

  const fullName = fullNameRaw || `${firstName !== "—" ? firstName : ""} ${lastName !== "—" ? lastName : ""}`.trim() || "—";

  const phone =
    pickFirstString(r, ["phone", "phone_number", "customer_phone", "guest_phone", "whatsapp"]) ||
    (meta ? pickFirstString(meta, ["phone", "phone_number", "customer_phone", "guest_phone", "whatsapp"]) : null) ||
    "—";

  const email =
    pickFirstString(r, ["email", "customer_email", "guest_email"]) ||
    (meta ? pickFirstString(meta, ["email", "customer_email", "guest_email"]) : null) ||
    "—";

  const message =
    pickFirstString(r, ["message", "note", "notes", "customer_message", "guest_message"]) ||
    (meta ? pickFirstString(meta, ["message", "note", "notes", "customer_message", "guest_message"]) : null) ||
    "—";

  return { firstName, lastName, fullName, phone, email, message };
}

function formatDateTimeFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function InfoRow(props: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-3 py-2 border-b border-slate-100 last:border-b-0">
      <div className="text-xs font-semibold text-slate-500">{props.label}</div>
      <div className={props.mono ? "font-mono text-sm text-slate-900 break-all" : "text-sm text-slate-900 break-words"}>
        {props.value}
      </div>
    </div>
  );
}

export function AdminReservationDetailsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: ReservationAdmin | null;
  onUpdate?: (patch: { status?: string; starts_at?: string; meta_delete_keys?: string[] }) => Promise<void>;
}) {
  const { toast } = useToast();

  const reservation = props.reservation;
  const customer = reservation ? extractCustomerInfo(reservation) : null;
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>Détail réservation</DialogTitle>
            {reservation ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  void (async () => {
                    try {
                      await copyToClipboard(reservation.id);
                      toast({ title: "Copié", description: reservation.id });
                    } catch {
                      toast({ title: "Impossible", description: "Copie non autorisée sur ce navigateur." });
                    }
                  })();
                }}
              >
                <Copy className="h-4 w-4" />
                Copier l’ID
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        {!reservation ? (
          <div className="text-sm text-slate-600">Aucune réservation sélectionnée.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500">Référence</div>
                  <div className="font-mono text-sm text-slate-900 break-all">{reservation.booking_reference ?? "—"}</div>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(reservation.status)}
                  {paymentBadge(reservation.payment_status)}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Client</div>
              <div className="px-4">
                <InfoRow label="Nom complet" value={customer?.fullName ?? "—"} />
                <InfoRow label="Prénom" value={customer?.firstName ?? "—"} />
                <InfoRow label="Nom" value={customer?.lastName ?? "—"} />
                <InfoRow label="Téléphone" value={customer?.phone ?? "—"} />
                <InfoRow label="Email" value={customer?.email ?? "—"} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Réservation</div>
              <div className="px-4">
                <InfoRow label="Date/heure" value={formatLocal(reservation.starts_at)} />
                <InfoRow label="Fin" value={formatLocal(reservation.ends_at)} />
                <InfoRow label="Nb personnes" value={typeof reservation.party_size === "number" ? reservation.party_size : "—"} />
                <InfoRow
                  label="Montant payé"
                  value={
                    typeof reservation.amount_total === "number" ? `${(reservation.amount_total / 100).toFixed(2)} ${reservation.currency ?? ""}`.trim() : "—"
                  }
                />
                <InfoRow
                  label="Acompte"
                  value={
                    typeof reservation.amount_deposit === "number" ? `${(reservation.amount_deposit / 100).toFixed(2)} ${reservation.currency ?? ""}`.trim() : "—"
                  }
                />
                <InfoRow label="Check-in" value={formatLocal(reservation.checked_in_at)} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Message</div>
              <div className="px-4 py-3 text-sm text-slate-900 whitespace-pre-wrap">{customer?.message ?? "—"}</div>
            </div>

            {(() => {
              const meta = isRecord((reservation as unknown as Record<string, unknown>).meta)
                ? ((reservation as unknown as Record<string, unknown>).meta as Record<string, unknown>)
                : null;

              const requested = meta && isRecord(meta.requested_change) ? (meta.requested_change as Record<string, unknown>) : null;
              const proposed = meta && isRecord(meta.proposed_change) ? (meta.proposed_change as Record<string, unknown>) : null;
              const lastMsg = meta && isRecord(meta.last_pro_message) ? (meta.last_pro_message as Record<string, unknown>) : null;
              const modFlag = meta ? meta.modification_requested === true : false;

              const hasBlock = !!requested || !!proposed || !!lastMsg || modFlag;
              if (!hasBlock) return null;

              return (
                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Modifications (meta)</div>
                  <div className="px-4">
                    <InfoRow label="modification_requested" value={modFlag ? "true" : "—"} mono />
                    <InfoRow
                      label="requested_change"
                      value={
                        requested ? (
                          <div className="space-y-1">
                            <div>starts_at: {typeof requested.starts_at === "string" ? formatDateTimeFr(requested.starts_at) : "—"}</div>
                            <div>party_size: {typeof requested.party_size === "number" ? String(requested.party_size) : "—"}</div>
                            <div>at: {typeof requested.at === "string" ? formatDateTimeFr(requested.at) : "—"}</div>
                          </div>
                        ) : (
                          "—"
                        )
                      }
                    />
                    <InfoRow
                      label="proposed_change"
                      value={
                        proposed ? (
                          <div className="space-y-1">
                            <div>starts_at: {typeof proposed.starts_at === "string" ? formatDateTimeFr(proposed.starts_at) : "—"}</div>
                            <div>sent_at: {typeof proposed.sent_at === "string" ? formatDateTimeFr(proposed.sent_at) : "—"}</div>
                          </div>
                        ) : (
                          "—"
                        )
                      }
                    />

                    {props.onUpdate ? (
                      <div className="pb-4">
                        <div className="pt-2 flex flex-col sm:flex-row gap-2 sm:justify-end">
                          {requested || modFlag ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={saving}
                              onClick={() => {
                                void (async () => {
                                  setSaving(true);
                                  try {
                                    await props.onUpdate?.({ meta_delete_keys: ["requested_change", "modification_requested"] });
                                    toast({ title: "OK", description: "Demande client supprimée (meta)" });
                                  } catch (e) {
                                    toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur" });
                                  } finally {
                                    setSaving(false);
                                  }
                                })();
                              }}
                            >
                              Retirer demande client
                            </Button>
                          ) : null}

                          {proposed ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={saving}
                              onClick={() => {
                                void (async () => {
                                  setSaving(true);
                                  try {
                                    await props.onUpdate?.({ meta_delete_keys: ["proposed_change"] });
                                    toast({ title: "OK", description: "Proposition supprimée (meta)" });
                                  } catch (e) {
                                    toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur" });
                                  } finally {
                                    setSaving(false);
                                  }
                                })();
                              }}
                            >
                              Retirer proposition
                            </Button>
                          ) : null}

                          {proposed ? (
                            <Button
                              size="sm"
                              disabled={saving}
                              onClick={() => {
                                const startsAt = (proposed as Record<string, unknown>).starts_at;
                                if (typeof startsAt !== "string" || !startsAt.trim()) return;

                                void (async () => {
                                  setSaving(true);
                                  try {
                                    await props.onUpdate?.({
                                      status: "pending_pro_validation",
                                      starts_at: startsAt,
                                      meta_delete_keys: ["proposed_change", "requested_change", "modification_requested"],
                                    });
                                    toast({ title: "OK", description: "Proposition appliquée (starts_at)" });
                                  } catch (e) {
                                    toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur" });
                                  } finally {
                                    setSaving(false);
                                  }
                                })();
                              }}
                              className="bg-primary hover:bg-primary/90 text-white"
                            >
                              Appliquer la proposition
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <InfoRow
                      label="last_pro_message"
                      value={
                        lastMsg ? (
                          <div className="space-y-1">
                            <div>at: {typeof lastMsg.at === "string" ? formatDateTimeFr(lastMsg.at) : "—"}</div>
                            <div>template_code: {typeof lastMsg.template_code === "string" ? lastMsg.template_code : "—"}</div>
                            <div className="whitespace-pre-wrap">{typeof lastMsg.body === "string" ? lastMsg.body : "—"}</div>
                          </div>
                        ) : (
                          "—"
                        )
                      }
                    />
                  </div>
                </div>
              );
            })()}

            <details className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">Données brutes</summary>
              <pre className="px-4 pb-4 text-xs text-slate-700 overflow-auto">{safeJson(reservation)}</pre>
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
