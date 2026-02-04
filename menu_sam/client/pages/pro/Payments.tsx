import * as React from "react";
import { toast } from "sonner";

import { ProShell } from "@/components/pro/pro-shell";
import { useProPlace } from "@/contexts/pro-place-context";
import { useProSession } from "@/components/pro/use-pro-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  CalendarDays,
  CreditCard,
  HandCoins,
  Receipt,
  Tag,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";

type RangeKey = "7" | "30" | "90" | "custom";

type OrderRow = {
  id: number;
  dateCreation: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  discountAmount: number;
  total: number;
};

function startDateForRange(range: Exclude<RangeKey, "custom">) {
  const days = Number.parseInt(range, 10);
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function toDateInputValue(date: Date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function paymentStatusLabel(status: string | null | undefined) {
  const raw = (status ?? "pending").toString();
  const s = raw.toLowerCase();

  if (s === "paid")
    return {
      label: "Payée",
      className: "bg-sam-success/15 text-sam-success border-sam-success/25",
    };
  if (s === "pending")
    return {
      label: "En attente",
      className: "bg-black/5 text-black/70 border-black/10",
    };
  if (s === "failed")
    return {
      label: "Échec",
      className: "bg-sam-red/15 text-sam-red border-sam-red/25",
    };

  return {
    label: raw,
    className: "bg-black/5 text-black/70 border-black/10",
  };
}

function paymentMethodLabel(method: string | null | undefined) {
  const raw = (method ?? "cash").toString();
  const m = raw.toLowerCase();

  if (m === "cash") return { label: "Cash", icon: <HandCoins className="h-4 w-4" /> };
  if (m === "card") return { label: "CB", icon: <CreditCard className="h-4 w-4" /> };
  return { label: raw, icon: <Receipt className="h-4 w-4" /> };
}

type MetricCardProps = {
  label: string;
  value: number | string;
  icon: React.ReactNode;
};

function MetricCard({ label, value, icon }: MetricCardProps) {
  return (
    <div className="shrink-0 rounded-2xl border border-black/10 bg-white p-4 shadow-sm sm:shrink">
      <div className="flex items-center gap-2 text-xs text-black/60">
        <span className="shrink-0">{icon}</span>
        <span className="whitespace-nowrap">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-black">{value}</div>
    </div>
  );
}

function useOnClickOutside(ref: React.RefObject<HTMLElement>, onOutside: () => void) {
  React.useEffect(() => {
    function handler(e: MouseEvent | TouchEvent) {
      const el = ref.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      onOutside();
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [ref, onOutside]);
}

export default function ProPayments() {
  const { state, signOut } = useProSession();
  const { selectedPlaceId } = useProPlace();

  const [range, setRange] = React.useState<RangeKey>("7");
  const [customStart, setCustomStart] = React.useState(() => toDateInputValue(startDateForRange("7")));
  const [customEnd, setCustomEnd] = React.useState(() => toDateInputValue(new Date()));

  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<OrderRow[]>([]);
  const [updatingOrderId, setUpdatingOrderId] = React.useState<number | null>(null);

  // ✅ single dropdown at a time
  const [statusDropdownOpen, setStatusDropdownOpen] = React.useState<number | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  useOnClickOutside(dropdownRef, () => setStatusDropdownOpen(null));

  const load = React.useCallback(async () => {
    if (state.status !== "signedIn" || !selectedPlaceId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let startDate = startDateForRange("7");
      let endDate = new Date();

      if (range === "custom") {
        if (customStart) startDate = new Date(`${customStart}T00:00:00`);
        if (customEnd) endDate = new Date(`${customEnd}T23:59:59`);
      } else {
        startDate = startDateForRange(range);
      }

      const response = await fetch(`/api/mysql/orders/place/${selectedPlaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
      });

      if (!response.ok) {
        toast.error("Impossible de charger les paiements");
        setRows([]);
        return;
      }

      const orders = await response.json();

      const transformedRows: OrderRow[] = (orders ?? []).map((order: any) => ({
        id: Number(order.id),
        dateCreation: String(order.dateCreation),
        paymentStatus: order.paymentStatus ?? null,
        paymentMethod: order.paymentMethod ?? null,
        discountAmount:
          typeof order.discountAmount === "string"
            ? parseFloat(order.discountAmount)
            : (order.discountAmount ?? 0),
        total: typeof order.total === "string" ? parseFloat(order.total) : (order.total ?? 0),
      }));

      setRows(transformedRows);
    } catch (error) {
      console.error("Error loading payments:", error);
      toast.error("Erreur lors du chargement des paiements");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [customEnd, customStart, range, state.status, selectedPlaceId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const totals = React.useMemo(() => {
    const paid = rows.filter((r) => (r.paymentStatus ?? "").toLowerCase() === "paid");
    const cashCount = rows.filter((r) => (r.paymentMethod ?? "").toLowerCase() === "cash").length;
    const cardCount = rows.filter((r) => (r.paymentMethod ?? "").toLowerCase() === "card").length;

    const discountDh = paid.reduce(
      (sum, r) => sum + (Number.isFinite(r.discountAmount) ? r.discountAmount : 0),
      0,
    );

    return { ordersPaid: paid.length, cashCount, cardCount, discountDh };
  }, [rows]);

  const updatePaymentStatus = React.useCallback(async (orderId: number, newStatus: string) => {
    setUpdatingOrderId(orderId);
    try {
      const response = await fetch(`/api/mysql/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: newStatus }),
      });

      if (!response.ok) {
        toast.error("Impossible de mettre à jour le statut de paiement");
        return;
      }

      setRows((prev) => prev.map((r) => (r.id === orderId ? { ...r, paymentStatus: newStatus } : r)));
      toast.success("Statut mis à jour", { duration: 1800 });
      setStatusDropdownOpen(null);
    } catch (error) {
      console.error("Error updating payment status:", error);
      toast.error("Erreur lors de la mise à jour du statut");
    } finally {
      setUpdatingOrderId(null);
    }
  }, []);

  const email = state.status === "signedIn" ? state.email : null;

  return (
    <ProShell
      title="Paiements & reporting"
      subtitle={email ? `Connecté : ${email}` : undefined}
      onSignOut={() => void signOut()}
    >
      <div className="flex flex-col gap-4">
        {/* ✅ Light header card */}
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-black">Vue rapide</div>
              <div className="mt-1 text-sm text-black/60">
                Basée sur : <span className="font-mono">payment_method</span>,{" "}
                <span className="font-mono">payment_status</span>,{" "}
                <span className="font-mono">discount_amount</span>.
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void load()}
              className="h-10 rounded-xl border-black/10 bg-white text-black hover:bg-black/5"
            >
              Rafraîchir
            </Button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[220px_1fr] sm:items-end">
            <div>
              <div className="text-xs font-medium text-black/70">Période</div>
              <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                <SelectTrigger className="mt-1 h-10 rounded-xl border-black/10 bg-white text-black">
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 jours</SelectItem>
                  <SelectItem value="30">30 jours</SelectItem>
                  <SelectItem value="90">90 jours</SelectItem>
                  <SelectItem value="custom">Personnalisée</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {range === "custom" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium text-black/70">Du</div>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="mt-1 h-10 rounded-xl border-black/10 bg-white text-black"
                  />
                </div>
                <div>
                  <div className="text-xs font-medium text-black/70">Au</div>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="mt-1 h-10 rounded-xl border-black/10 bg-white text-black"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-black/5 p-3 text-xs text-black/60 border border-black/10">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  <span className="whitespace-nowrap">
                    Du {startDateForRange(range).toLocaleDateString("fr-FR")} au{" "}
                    {new Date().toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Metrics */}
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible md:grid-cols-4">
          <MetricCard label="Commandes payées" value={loading ? "…" : totals.ordersPaid} icon={<Receipt className="h-4 w-4" />} />
          <MetricCard label="Cash" value={loading ? "…" : totals.cashCount} icon={<HandCoins className="h-4 w-4" />} />
          <MetricCard label="CB" value={loading ? "…" : totals.cardCount} icon={<CreditCard className="h-4 w-4" />} />
          <MetricCard label="Remises (Dhs)" value={loading ? "…" : totals.discountDh} icon={<Tag className="h-4 w-4" />} />
        </div>

        {/* Mobile list */}
        <div className="grid gap-3 sm:hidden">
          {loading ? (
            <div className="rounded-2xl border border-black/10 bg-white p-5 text-sm text-black/60 shadow-sm">
              Chargement…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-black/10 bg-white p-5 text-sm text-black/60 shadow-sm">
              Aucun paiement sur cette période.
            </div>
          ) : (
            rows.slice(0, 50).map((r) => {
              const status = paymentStatusLabel(r.paymentStatus);
              const method = paymentMethodLabel(r.paymentMethod);
              const discount = Number.isFinite(r.discountAmount) ? r.discountAmount : 0;

              return (
                <div key={r.id} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-black">
                        {method.icon}
                        <span className="whitespace-nowrap">{method.label}</span>
                      </div>
                      <div className="mt-1 text-xs text-black/60 whitespace-nowrap">
                        {new Date(r.dateCreation).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>

                    <div className="relative flex flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={() => setStatusDropdownOpen(statusDropdownOpen === r.id ? null : r.id)}
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-1 text-xs whitespace-nowrap cursor-pointer hover:opacity-80 transition",
                          status.className,
                        )}
                      >
                        {status.label}
                      </button>

                      {statusDropdownOpen === r.id && (
                        <div className="absolute right-0 top-full mt-2 w-[190px] overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg z-50">
                          <button
                            type="button"
                            onClick={() => void updatePaymentStatus(r.id, "pending")}
                            disabled={updatingOrderId === r.id}
                            className="block w-full px-3 py-2 text-left text-xs text-black hover:bg-black/5 disabled:opacity-50"
                          >
                            <span className="flex items-center gap-2">
                              <Clock className="h-3 w-3" />
                              En attente
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void updatePaymentStatus(r.id, "paid")}
                            disabled={updatingOrderId === r.id}
                            className="block w-full px-3 py-2 text-left text-xs text-sam-success hover:bg-black/5 disabled:opacity-50"
                          >
                            <span className="flex items-center gap-2">
                              <CheckCircle2 className="h-3 w-3" />
                              Payée
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void updatePaymentStatus(r.id, "failed")}
                            disabled={updatingOrderId === r.id}
                            className="block w-full px-3 py-2 text-left text-xs text-sam-red hover:bg-black/5 disabled:opacity-50"
                          >
                            <span className="flex items-center gap-2">
                              <XCircle className="h-3 w-3" />
                              Échec
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-black/5 p-3 border border-black/10">
                      <div className="text-[11px] text-black/60">Remise</div>
                      <div className="mt-1 text-sm font-semibold text-black whitespace-nowrap">{discount} Dhs</div>
                    </div>
                    <div className="rounded-xl bg-black/5 p-3 border border-black/10">
                      <div className="text-[11px] text-black/60">Total</div>
                      <div className="mt-1 text-sm font-semibold text-black whitespace-nowrap">{Number(r.total || 0).toFixed(2)} Dhs</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm sm:block">
          <table className="min-w-[840px] w-full text-left text-sm">
            <thead className="bg-black/5 text-xs text-black/60">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">Date</th>
                <th className="px-4 py-3 whitespace-nowrap">Statut</th>
                <th className="px-4 py-3 whitespace-nowrap">Méthode</th>
                <th className="px-4 py-3 whitespace-nowrap">Total</th>
                <th className="px-4 py-3 whitespace-nowrap">Remise</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-black/10">
              {loading ? (
                <tr>
                  <td className="px-4 py-4 text-black/60" colSpan={5}>
                    Chargement…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-black/60" colSpan={5}>
                    Aucun paiement sur cette période.
                  </td>
                </tr>
              ) : (
                rows.slice(0, 100).map((r) => {
                  const status = paymentStatusLabel(r.paymentStatus);
                  const method = paymentMethodLabel(r.paymentMethod);
                  const discount = Number.isFinite(r.discountAmount) ? r.discountAmount : 0;

                  return (
                    <tr key={r.id} className="relative">
                      <td className="px-4 py-4 text-black/80 whitespace-nowrap">
                        {new Date(r.dateCreation).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>

                      <td className="px-4 py-4">
                        <div className="relative inline-block" ref={statusDropdownOpen === r.id ? dropdownRef : undefined}>
                          <button
                            type="button"
                            onClick={() => setStatusDropdownOpen(statusDropdownOpen === r.id ? null : r.id)}
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-1 text-xs whitespace-nowrap cursor-pointer hover:opacity-80 transition",
                              status.className,
                            )}
                          >
                            {status.label}
                          </button>

                          {statusDropdownOpen === r.id && (
                            <div className="absolute top-full left-0 mt-2 w-[190px] overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg z-50">
                              <button
                                type="button"
                                onClick={() => void updatePaymentStatus(r.id, "pending")}
                                disabled={updatingOrderId === r.id}
                                className="block w-full px-3 py-2 text-left text-xs text-black hover:bg-black/5 disabled:opacity-50 whitespace-nowrap"
                              >
                                <span className="flex items-center gap-2">
                                  <Clock className="h-3 w-3" />
                                  En attente
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void updatePaymentStatus(r.id, "paid")}
                                disabled={updatingOrderId === r.id}
                                className="block w-full px-3 py-2 text-left text-xs text-sam-success hover:bg-black/5 disabled:opacity-50 whitespace-nowrap"
                              >
                                <span className="flex items-center gap-2">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Payée
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void updatePaymentStatus(r.id, "failed")}
                                disabled={updatingOrderId === r.id}
                                className="block w-full px-3 py-2 text-left text-xs text-sam-red hover:bg-black/5 disabled:opacity-50 whitespace-nowrap"
                              >
                                <span className="flex items-center gap-2">
                                  <XCircle className="h-3 w-3" />
                                  Échec
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-black/80 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          {method.icon}
                          {method.label}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-black whitespace-nowrap font-semibold">
                        {Number(r.total || 0).toFixed(2)} Dhs
                      </td>

                      <td className="px-4 py-4 text-black/80 whitespace-nowrap">{discount} Dhs</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ProShell>
  );
}
