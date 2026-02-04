/**
 * ProVisibilityOrders Component
 *
 * Displays the list of visibility orders for a Pro establishment
 * with their status (pending, in_progress, delivered, cancelled, refunded)
 */

import { useState, useEffect } from "react";
import {
  Package,
  Clock,
  Truck,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  Loader2,
  AlertCircle,
  Receipt,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Banknote,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { listProVisibilityOrders, type VisibilityOrder } from "@/lib/pro/api";
import { formatMoney } from "@/lib/money";

type Props = {
  establishmentId: string;
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: {
    label: "En attente",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    icon: Clock,
  },
  in_progress: {
    label: "En cours",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    icon: Truck,
  },
  delivered: {
    label: "Livré",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "Annulé",
    color: "bg-slate-100 text-slate-800 border-slate-200",
    icon: XCircle,
  },
  refunded: {
    label: "Remboursé",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    icon: RefreshCcw,
  },
};

const PAYMENT_STATUS_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  pending: {
    label: "En attente de paiement",
    color: "bg-amber-50 text-amber-700 border-amber-200",
  },
  paid: {
    label: "Payé",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  failed: {
    label: "Échec du paiement",
    color: "bg-red-50 text-red-700 border-red-200",
  },
  refunded: {
    label: "Remboursé",
    color: "bg-purple-50 text-purple-700 border-purple-200",
  },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getItemTypeBadge(type: string): { label: string; color: string } {
  switch (type) {
    case "menu_digital":
      return { label: "Menu Digital", color: "bg-primary/10 text-primary border-primary/20" };
    case "media_video":
      return { label: "Vidéo", color: "bg-violet-100 text-violet-700 border-violet-200" };
    case "pack":
      return { label: "Pack", color: "bg-blue-100 text-blue-700 border-blue-200" };
    case "username_subscription":
      return { label: "Lien Perso", color: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    default:
      return { label: "Visibilité", color: "bg-slate-100 text-slate-700 border-slate-200" };
  }
}

function OrderCard({ order }: { order: VisibilityOrder }) {
  const [isOpen, setIsOpen] = useState(false);

  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const paymentConfig = PAYMENT_STATUS_CONFIG[order.payment_status] || PAYMENT_STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg bg-white overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full p-4 text-left hover:bg-slate-50 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm text-slate-600">
                    #{order.id.slice(0, 8)}
                  </span>
                  <Badge variant="outline" className={statusConfig.color}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {statusConfig.label}
                  </Badge>
                </div>
                <div className="text-sm text-slate-500">
                  {formatDate(order.created_at)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold">
                    {formatMoney(order.total_cents, order.currency)}
                  </div>
                  <Badge variant="outline" className={`text-xs ${paymentConfig.color}`}>
                    {order.payment_status === "paid" ? (
                      <CreditCard className="w-3 h-3 mr-1" />
                    ) : (
                      <Banknote className="w-3 h-3 mr-1" />
                    )}
                    {paymentConfig.label}
                  </Badge>
                </div>
                {isOpen ? (
                  <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 border-t">
            {/* Status explanation */}
            <div className="mt-3 mb-4 p-3 rounded-lg bg-slate-50">
              <div className="flex items-start gap-2">
                <StatusIcon className="w-4 h-4 mt-0.5 text-slate-600" />
                <div className="text-sm text-slate-600">
                  {order.status === "pending" && (
                    <>
                      <strong>En attente</strong> — Votre commande est en attente de traitement.
                      {order.payment_status === "pending" && " En attente de réception du paiement (virement bancaire)."}
                    </>
                  )}
                  {order.status === "in_progress" && (
                    <>
                      <strong>En cours</strong> — Votre commande est en cours de préparation par notre équipe.
                    </>
                  )}
                  {order.status === "delivered" && (
                    <>
                      <strong>Livré</strong> — Votre service est actif et disponible dans votre espace Pro.
                    </>
                  )}
                  {order.status === "cancelled" && (
                    <>
                      <strong>Annulé</strong> — Cette commande a été annulée.
                    </>
                  )}
                  {order.status === "refunded" && (
                    <>
                      <strong>Remboursé</strong> — Le montant de cette commande a été remboursé sur votre compte.
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase">Articles</div>
              {order.items.map((item, idx) => {
                const typeBadge = getItemTypeBadge(item.type);
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded bg-white border"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className={`text-xs ${typeBadge.color}`}>
                        {typeBadge.label}
                      </Badge>
                      <span className="text-sm truncate">{item.title}</span>
                      {item.quantity > 1 && (
                        <span className="text-xs text-slate-500">×{item.quantity}</span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-slate-700">
                      {formatMoney(item.total_price_cents, order.currency)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total */}
            <div className="mt-3 pt-3 border-t flex items-center justify-between">
              <span className="text-sm text-slate-600">Total TTC</span>
              <span className="font-semibold">
                {formatMoney(order.total_cents, order.currency)}
              </span>
            </div>

            {/* Invoice */}
            {order.invoice_number && (
              <div className="mt-3 pt-3 border-t">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Receipt className="w-4 h-4" />
                  <span>Facture: <strong>{order.invoice_number}</strong></span>
                  {order.invoice_issued_at && (
                    <span className="text-slate-400">
                      — {formatDate(order.invoice_issued_at)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Paid date */}
            {order.paid_at && (
              <div className="mt-2 text-xs text-slate-500">
                Payé le {formatDate(order.paid_at)}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function ProVisibilityOrders({ establishmentId }: Props) {
  const [orders, setOrders] = useState<VisibilityOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listProVisibilityOrders(establishmentId, 50);
      setOrders(res.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, [establishmentId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Chargement des commandes...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
            <Button variant="outline" size="sm" onClick={loadOrders}>
              Réessayer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (orders.length === 0) {
    return null; // Don't show anything if no orders
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            Mes commandes
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={loadOrders}>
            <RefreshCcw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </CardContent>
    </Card>
  );
}
