import * as React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEstablishmentBySlug } from "@/hooks/use-establishment-by-slug";
import { SatisfactionSheet } from "@/components/table/satisfaction-sheet";
import { getMenuItemImageUrl, getLogoUrl } from "@/lib/image-urls";
import {
  AlertCircle,
  MapPin,
  Clock,
  Users,
  ChefHat,
  DollarSign,
  ArrowLeft,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface OrderDetails {
  id: number;
  placeId: number;
  total: number;
  pourboire: number;
  dateCreation: string;
  status: string;
  kitchenStatus: string;
  serviceType: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  tableNumber: number | null;
  comment: string | null;
  nbrTable: number;
  commandeProducts: Array<{
    id: number;
    menuId: number;
    prix: number;
    quantite: number;
    nameUser: string | null;
    comment: string | null;
    menuItem: {
      menuItemId: number;
      title: string;
      img: string | null;
      price: number;
    } | null;
  }>;
}

const STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  open: { label: "Ouvert", color: "bg-blue-50 text-blue-700 ring-blue-200", dot: "bg-blue-500" },
  locked: { label: "Verrouillé", color: "bg-yellow-50 text-yellow-800 ring-yellow-200", dot: "bg-yellow-500" },
  sent: { label: "Envoyé", color: "bg-green-50 text-green-700 ring-green-200", dot: "bg-green-500" },
  cancelled: { label: "Annulé", color: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
};

const KITCHEN_STATUS_LABELS: Record<string, { label: string; icon: string; color: string; dot: string }> = {
  new: {
    label: "Envoyée",
    icon: "🆕",
    color: "bg-slate-50 text-slate-700 ring-slate-200",
    dot: "bg-slate-500",
  },
  accepted: {
    label: "Acceptée",
    icon: "✅",
    color: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
  },
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  sur_place: "Sur place",
  livraison: "Livraison",
  emporter: "À emporter",
};

const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  pending: { label: "En attente", color: "bg-yellow-50 text-yellow-800 ring-yellow-200", dot: "bg-yellow-500" },
  completed: { label: "Complété", color: "bg-green-50 text-green-700 ring-green-200", dot: "bg-green-500" },
  failed: { label: "Échoué", color: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
  refunded: { label: "Remboursé", color: "bg-blue-50 text-blue-700 ring-blue-200", dot: "bg-blue-500" },
};

function Pill({
  label,
  className,
  dot,
  leftIcon,
}: {
  label: string;
  className: string;
  dot?: string;
  leftIcon?: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1", className)}>
      {dot ? <span className={cn("h-2 w-2 rounded-full", dot)} /> : null}
      {leftIcon ? <span className="text-sm leading-none">{leftIcon}</span> : null}
      {label}
    </span>
  );
}

function StatCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-600">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200/70">
          {icon}
        </span>
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function OrderConfirmation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { slug, orderId } = useParams<{ slug?: string; orderId?: string }>();
  const { establishment, error: establishmentError } = useEstablishmentBySlug(slug);

  const tableNumber = searchParams.get("table");



  const [order, setOrder] = React.useState<OrderDetails | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Auto-refresh order status
  React.useEffect(() => {
    if (!order) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/mysql/orders/${order.placeId}/${order.id}`);
        if (response.ok) {
          const updated = await response.json();
          setOrder(updated);
        }
      } catch (err) {
        console.error("Failed to refresh order status:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [order]);
  const handleBackToMenu = React.useCallback(() => {
    const path = `/${slug}`;
    if (order.tableNumber) {
      navigate(`${path}?table=${order.tableNumber}`);
    } else {
      navigate(path);
    }
  }, [slug, order, navigate]);
  React.useEffect(() => {
    const fetchOrder = async () => {
      if (!establishment || !orderId) {
        setLoading(false);
        setError("Paramètres invalides");
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/mysql/orders/${establishment.placeId}/${orderId}`);
        if (!response.ok) throw new Error("Commande non trouvée");

        const data = await response.json();
        setOrder(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de la récupération de la commande");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [establishment, orderId]);

  // Slug missing
  if (!slug) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <div className="font-semibold text-red-900">Établissement non spécifié</div>
                <div className="mt-1 text-sm text-red-700">
                  Un slug d'établissement est requis pour accéder à cette page.
                </div>
                <button onClick={() => navigate("/")} className="mt-3 text-sm font-semibold text-red-700 hover:underline">
                  Retour à l'accueil →
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Establishment error
  if (establishmentError) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <div className="font-semibold text-red-900">Établissement non trouvé</div>
                <div className="mt-1 text-sm text-red-700">{establishmentError}</div>
                <button onClick={() => navigate("/")} className="mt-3 text-sm font-semibold text-red-700 hover:underline">
                  Retour à l'accueil →
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Loading
  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
              <div>
                <div className="text-sm font-semibold text-slate-900">Chargement…</div>
                <div className="text-sm text-slate-600">Récupération des détails de la commande.</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Error / missing order
  if (error || !order) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <div className="font-semibold text-red-900">Erreur</div>
                <div className="mt-1 text-sm text-red-700">{error || "Commande non trouvée"}</div>
                <button
                  onClick={handleBackToMenu}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-red-700 hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Retour au menu →
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.open;
  const kitchenStatusInfo = KITCHEN_STATUS_LABELS[order.kitchenStatus] || KITCHEN_STATUS_LABELS.new;
  const paymentStatusInfo = order.paymentStatus ? PAYMENT_STATUS_LABELS[order.paymentStatus] : null;

  const estName = establishment?.name ?? "Établissement";
  const logo = establishment?.logo ? getLogoUrl(establishment.slug, establishment.logo) : null;

  const total = (typeof order.total === "number" ? order.total : Number(order.total)) || 0;

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <button
            onClick={handleBackToMenu}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au menu
          </button>

          <div className="flex items-center gap-3">
            {logo ? (
              <div className="h-9 w-9 overflow-hidden rounded-[10px] ring-1 ring-slate-200">
                <img src={logo} alt={estName} className="h-full w-full object-cover" loading="lazy" decoding="async" />
              </div>
            ) : (
              <div className="h-9 w-9 rounded-[10px] bg-slate-100 ring-1 ring-slate-200" />
            )}
            <div className="hidden text-sm font-semibold text-slate-900 sm:block">{estName}</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Hero */}
        <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-green-50 text-green-700 ring-1 ring-green-200">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Commande confirmée</h1>
                  <p className="text-sm text-slate-600">Commande #{order.id}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Pill label={`Statut: ${kitchenStatusInfo.label}`} className={statusInfo.color} dot={statusInfo.dot} />

                {paymentStatusInfo ? (
                  <Pill
                    label={`Paiement: ${paymentStatusInfo.label}`}
                    className={paymentStatusInfo.color}
                    dot={paymentStatusInfo.dot}
                  />
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
              <div className="text-xs font-semibold uppercase text-slate-600">Total</div>
              <div className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-slate-900">
                <DollarSign className="h-5 w-5 text-green-600" />
                {total.toFixed(2)} <span className="text-base font-bold text-slate-700">DH</span>
              </div>
              {order.pourboire > 0 && (
                <div className="mt-2 flex items-center gap-2 text-lg font-bold text-red-600">
                  <span>Pourboire: {order.pourboire.toFixed(2)} DH</span>
                </div>
              )}
              <div className="mt-1 text-xs text-slate-600">Mise à jour en temps réel (≈ 3s)</div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Type de service" icon={<MapPin className="h-4 w-4" />}>
            <div className="text-lg font-bold text-slate-900">{SERVICE_TYPE_LABELS[order.serviceType] || "—"}</div>
          </StatCard>

          <StatCard title="Heure" icon={<Clock className="h-4 w-4" />}>
            <div className="text-lg font-bold text-slate-900">
              {formatDistanceToNow(new Date(order.dateCreation), { addSuffix: true, locale: fr })}
            </div>
          </StatCard>

          <StatCard title="Table" icon={<Users className="h-4 w-4" />}>
            <div className="text-lg font-bold text-slate-900">
              {order.tableNumber ? `Table ${order.tableNumber}` : "—"}
            </div>
            <div className="mt-1 text-xs text-slate-600">Commande sur place</div>
          </StatCard>

          <StatCard title="Paiement" icon={<Receipt className="h-4 w-4" />}>
            <div className="text-sm font-semibold text-slate-900">{order.paymentMethod || "—"}</div>
            <div className="mt-1 text-xs text-slate-600">{paymentStatusInfo?.label || "Non renseigné"}</div>
          </StatCard>
        </div>

        {/* Items */}
        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200/70 bg-slate-50 px-6 py-4">
            <div className="flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-slate-700" />
              <h3 className="text-base font-bold text-slate-900">Articles</h3>
            </div>
            <div className="text-sm font-semibold text-slate-700">
              {order.commandeProducts.length} article{order.commandeProducts.length > 1 ? "s" : ""}
            </div>
          </div>

          <div className="divide-y divide-slate-200/70">
            {order.commandeProducts.map((product) => {
              const unit = (typeof product.prix === "number" ? product.prix : parseFloat(String(product.prix))) || 0;
              const qty = product.quantite || 0;
              const lineTotal = unit * qty;
              const menuItemTitle = product.menuItem?.title || "Article supprimé";

              return (
                <div key={product.id} className="px-6 py-4">
                  <div className="flex gap-4">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200/70">
                      {product.menuItem?.img ? (
                        <img
                          src={getMenuItemImageUrl(product.menuItem.img)}
                          alt={menuItemTitle}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900">{menuItemTitle}</div>
                          {product.nameUser ? (
                            <div className="mt-0.5 text-xs text-slate-600">Ajouté par : {product.nameUser}</div>
                          ) : null}
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="text-sm font-bold text-slate-900">{lineTotal.toFixed(2)} DH</div>
                          <div className="text-xs text-slate-600">
                            {qty} × {unit.toFixed(2)} DH
                          </div>
                        </div>
                      </div>

                      {product.comment ? (
                        <div className="mt-2 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200/70">
                          <span className="font-semibold">Remarque :</span> {product.comment}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Comment */}
        {order.comment ? (
          <div className="mt-6 rounded-3xl border border-blue-200/70 bg-blue-50 p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase text-blue-700">Remarque spéciale</div>
            <div className="mt-2 text-sm text-blue-900">{order.comment}</div>
          </div>
        ) : null}

        {/* Actions */}
        <div className="mt-8 flex flex-col gap-3">
          <SatisfactionSheet placeId={establishment?.placeId} reviewGoogleId={establishment?.reviewGoogleId}
            tripadvisorLink={establishment?.tripadvisorLink} />
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button variant="outline" onClick={handleBackToMenu} className="rounded-2xl">
              Retour au menu
            </Button>
            <Button onClick={() => window.print()} className="rounded-2xl">
              Imprimer la commande
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
