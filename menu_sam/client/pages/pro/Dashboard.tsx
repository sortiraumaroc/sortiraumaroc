import * as React from "react";
import { toast } from "sonner";

import { HelpTooltip } from "@/components/pro/help-tooltip";
import { ProShell } from "@/components/pro/pro-shell";
import { useProSession } from "@/components/pro/use-pro-session";
import { useProPlace } from "@/contexts/pro-place-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  Bell,
  Check,
  Filter,
  RefreshCw,
  UtensilsCrossed,
  CheckCircle2,
} from "lucide-react";

type ServiceType = "sur_place" | "emporter" | "livraison";
type KitchenStatus = "new" | "accepted" | "delayed" | "cancelled" | "served";

type OrderProductRow = {
  id: string;
  quantite: number;
  prix: number;
  comment: string | null;
  addedByName?: string | null;
  menuItem?: { id: string; title: string; price: number };
};

type QrOrderRow = {
  id: string;
  establishment_id: string;
  table_number: number;
  join_code: string;
  status: string;
  payment_status: string;
  payment_method: string;
  discount_amount: number;
  pourboire: number;
  service_type: ServiceType;
  kitchen_status: KitchenStatus;
  delayed_until: string | null;
  kitchen_note: string;
  kitchen_updated_at: string;
  created_at: string;
  total: number;
  products: OrderProductRow[];
};

let sharedAudioContext: AudioContext | null = null;
let sharedAudioContextInit: Promise<AudioContext | null> | null = null;

function getSharedAudioContext(): Promise<AudioContext | null> {
  if (sharedAudioContext) return Promise.resolve(sharedAudioContext);
  if (sharedAudioContextInit) return sharedAudioContextInit;

  sharedAudioContextInit = (async () => {
    try {
      const AudioContextImpl = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextImpl) return null;
      sharedAudioContext = new AudioContextImpl();
      return sharedAudioContext;
    } catch {
      return null;
    }
  })();

  return sharedAudioContextInit;
}

async function unlockAudioContext(): Promise<void> {
  try {
    const ctx = await getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();
  } catch { }
}

async function playNewOrderSound(): Promise<void> {
  try {
    const ctx = await getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      await unlockAudioContext();
      if (ctx.state === "suspended") return;
    }

    const gain = ctx.createGain();
    const osc = ctx.createOscillator();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(880, ctx.currentTime);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
  } catch { }
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: KitchenStatus) {
  if (status === "new") return "Nouvelle";
  if (status === "accepted") return "Acceptée";
  if (status === "delayed") return "Retardée";
  if (status === "served") return "Servie";
  return "Annulée";
}

function statusPillClass(status: KitchenStatus) {
  // ✅ light theme pills (pro on white)
  if (status === "new") return "bg-sam-red/10 text-sam-red border-sam-red/20";
  if (status === "accepted") return "bg-black/5 text-black border-black/10";
  if (status === "delayed") return "bg-sam-yellow/15 text-black border-sam-yellow/25";
  if (status === "served") return "bg-sam-success/12 text-sam-success border-sam-success/20";
  return "bg-black/3 text-black/50 border-black/10";
}

function serviceLabel(type: ServiceType) {
  if (type === "sur_place") return "Sur place";
  if (type === "emporter") return "Emporter";
  return "Livraison";
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/5 text-black">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-black/60">{label}</div>
          <div className="text-base font-bold text-black leading-5">{value}</div>
        </div>
      </div>
    </div>
  );
}

function OrderRow({
  order,
  onUpdate,
}: {
  order: QrOrderRow;
  onUpdate: (id: string, patch: Partial<QrOrderRow>) => void;
}) {
  const updateOrder = React.useCallback(
    async (patch: Partial<QrOrderRow>) => {
      try {
        const updateData: any = {};
        if (patch.kitchen_status !== undefined) updateData.kitchenStatus = patch.kitchen_status;
        if (patch.status !== undefined) updateData.status = patch.status;

        const response = await fetch(`/api/mysql/orders/${order.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateData),
        });

        if (!response.ok) {
          toast.error("Action impossible");
          return;
        }

        onUpdate(order.id, patch);
      } catch (error) {
        console.error("Error updating order:", error);
        toast.error("Action impossible");
      }
    },
    [onUpdate, order.id],
  );

  const accept = React.useCallback(async () => {
    await updateOrder({ kitchen_status: "accepted" });
  }, [updateOrder]);

  const acceptDisabled =
    order.kitchen_status === "accepted" ||
    order.kitchen_status === "served" ||
    order.kitchen_status === "cancelled";

  return (
    <div className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-black">Table {order.table_number}</div>

              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  statusPillClass(order.kitchen_status),
                )}
              >
                {statusLabel(order.kitchen_status)}
              </span>

              <span className="inline-flex items-center rounded-full border border-black/10 bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-black/70">
                {serviceLabel(order.service_type)}
              </span>

              <span className="inline-flex items-center rounded-full border border-black/10 bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-black/70">
                {order.products.length} item(s)
              </span>
            </div>

            <div className="mt-1 text-[11px] text-black/50">
              Créée : {formatTime(order.created_at)} · Maj : {formatTime(order.kitchen_updated_at)}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-[11px] text-black/50">Total</div>
            <div className="text-sm font-bold text-black">
              {Number(order.total || 0).toFixed(2)} Dhs
            </div>
            {order.pourboire > 0 && (
              <div className="mt-1 text-[11px] text-sam-red font-semibold">
                Pourboire: {Number(order.pourboire || 0).toFixed(2)} Dhs
              </div>
            )}
          </div>
        </div>

        {order.products.length > 0 ? (
          <div className="mt-2 rounded-xl border border-black/10 bg-black/[0.02] p-2">
            <div className="space-y-1.5">
              {order.products.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-black/10 bg-white px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-black">
                      {p.menuItem?.title || "Article"}
                    </div>
                    {p.addedByName ? (
                      <div className="text-[10px] text-sam-red/80">par {p.addedByName}</div>
                    ) : null}
                    {p.comment ? (
                      <div className="text-[10px] text-black/50">Note : {p.comment}</div>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-xs font-bold text-black">x{p.quantite}</div>
                    <div className="text-[10px] text-black/50">
                      {Number(p.prix || 0).toFixed(1)} Dhs
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-2 rounded-xl border border-black/10 bg-black/[0.02] p-2 text-xs text-black/50">
            Aucun article
          </div>
        )}

        <div className="mt-2">

          <Button
            type="button"
            onClick={() => void accept()}
            disabled={acceptDisabled}
            className={cn(
              "h-9 w-full justify-center rounded-xl px-3 gap-2",
              acceptDisabled
                ? "bg-green-600 text-white opacity-100 cursor-default"
                : "bg-sam-red text-white hover:bg-black/90",
            )}
          >
            <Check className="h-4 w-4" />
            <span className="ml-2">
              {acceptDisabled ? "Acceptée" : "Accepter"}
            </span>
          </Button>


        </div>
      </div>
    </div>
  );
}

export default function ProDashboard() {
  const { state, signOut } = useProSession();
  const { selectedPlaceId } = useProPlace();

  const [orders, setOrders] = React.useState<QrOrderRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [tableFilter, setTableFilter] = React.useState("");
  const [serviceFilter, setServiceFilter] = React.useState<ServiceType | "all">("all");
  const [dateFilter, setDateFilter] = React.useState<"today" | "yesterday" | "custom">("today");
  const [customDate, setCustomDate] = React.useState<string>(() => new Date().toISOString().split("T")[0]);

  const [soundEnabled, setSoundEnabled] = React.useState(true);

  React.useEffect(() => {
    if (!soundEnabled) return;

    let unlocked = false;
    const handleUnlock = () => {
      if (unlocked) return;
      unlocked = true;
      void unlockAudioContext();
      window.removeEventListener("pointerdown", handleUnlock);
      window.removeEventListener("keydown", handleUnlock);
    };

    window.addEventListener("pointerdown", handleUnlock);
    window.addEventListener("keydown", handleUnlock);

    return () => {
      unlocked = true;
      window.removeEventListener("pointerdown", handleUnlock);
      window.removeEventListener("keydown", handleUnlock);
    };
  }, [soundEnabled]);

  const loadOrders = React.useCallback(async () => {
    if (!selectedPlaceId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/mysql/orders/${selectedPlaceId}`);
      if (!response.ok) {
        toast.error("Impossible de charger les commandes");
        return;
      }

      const data = await response.json();

      const transformed: QrOrderRow[] = (Array.isArray(data) ? data : []).map((order: any) => ({
        id: String(order.id),
        establishment_id: String(order.placeId),
        table_number: order.tableNumber || order.nbrTable || 0,
        join_code: order.joinCode || "",
        status: order.status || "open",
        payment_status: order.paymentStatus || "",
        payment_method: order.paymentMethod || "",
        discount_amount: order.discountAmount || 0,
        pourboire: order.pourboire || 0,
        service_type: (order.serviceType || "sur_place") as ServiceType,
        kitchen_status: (order.kitchenStatus || "new") as KitchenStatus,
        delayed_until: null,
        kitchen_note: order.comment || "",
        kitchen_updated_at: order.updatedAt?.toString() || new Date().toISOString(),
        created_at: order.dateCreation?.toString() || new Date().toISOString(),
        total: order.total || 0,
        products: (order.commandeProducts || []).map((p: any) => ({
          id: String(p.id),
          quantite: p.quantite || 1,
          prix: p.prix || 0,
          comment: p.comment || null,
          addedByName: p.addedByName || null,
          menuItem: p.menuItem
            ? { id: String(p.menuItem.id), title: p.menuItem.title || "Unknown", price: p.menuItem.price || 0 }
            : undefined,
        })),
      }));

      setOrders(transformed);
    } catch (error) {
      console.error("Error loading orders:", error);
      toast.error("Erreur lors du chargement des commandes");
    } finally {
      setLoading(false);
    }
  }, [selectedPlaceId]);

  React.useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  // polling + new order detection
  const seenIdsRef = React.useRef<Set<string>>(new Set());
  const didInitRef = React.useRef(false);

  React.useEffect(() => {
    if (!selectedPlaceId) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/mysql/orders/${selectedPlaceId}`);
        if (!response.ok) return;

        const data = await response.json();

        const nextOrders: QrOrderRow[] = (Array.isArray(data) ? data : []).map((order: any) => ({
          id: String(order.id),
          establishment_id: String(order.placeId),
          table_number: order.tableNumber || order.nbrTable || 0,
          join_code: order.joinCode || "",
          status: order.status || "open",
          payment_status: order.paymentStatus || "",
          payment_method: order.paymentMethod || "",
          discount_amount: order.discountAmount || 0,
          pourboire: order.pourboire || 0,
          service_type: (order.serviceType || "sur_place") as ServiceType,
          kitchen_status: (order.kitchenStatus || "new") as KitchenStatus,
          delayed_until: null,
          kitchen_note: order.comment || "",
          kitchen_updated_at: order.updatedAt?.toString() || new Date().toISOString(),
          created_at: order.dateCreation?.toString() || new Date().toISOString(),
          total: order.total || 0,
          products: (order.commandeProducts || []).map((p: any) => ({
            id: String(p.id),
            quantite: p.quantite || 1,
            prix: p.prix || 0,
            comment: p.comment || null,
            addedByName: p.addedByName || null,
            menuItem: p.menuItem
              ? { id: String(p.menuItem.id), title: p.menuItem.title || "Unknown", price: p.menuItem.price || 0 }
              : undefined,
          })),
        }));

        const seen = seenIdsRef.current;
        if (didInitRef.current) {
          const newOnes = nextOrders.filter((o) => !seen.has(o.id));
          if (newOnes.length > 0) {
            if (soundEnabled) void playNewOrderSound();
            const first = newOnes[0];
            toast.success(`Nouvelle commande — Table ${first.table_number || "?"}`, {
              duration: 3200,
              className: "border-sam-red/30 bg-sam-red text-white",
            });
          }
        }

        for (const o of nextOrders) seen.add(o.id);
        didInitRef.current = true;

        setOrders(nextOrders);
      } catch (error) {
        console.error("Error in polling:", error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [soundEnabled, selectedPlaceId]);

  const getFilterDate = React.useCallback(() => {
    if (dateFilter === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (dateFilter === "yesterday") {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (dateFilter === "custom" && customDate) return new Date(customDate);
    return new Date();
  }, [dateFilter, customDate]);

  const isOrderFromDate = React.useCallback((order: QrOrderRow, targetDate: Date) => {
    const orderDate = new Date(order.created_at);
    orderDate.setHours(0, 0, 0, 0);
    const t = new Date(targetDate);
    t.setHours(0, 0, 0, 0);
    return orderDate.getTime() === t.getTime();
  }, []);

  const filteredOrders = React.useMemo(() => {
    let list = orders;

    const filterDate = getFilterDate();
    list = list.filter((o) => isOrderFromDate(o, filterDate));

    const t = tableFilter.trim();
    if (t) {
      const n = Number.parseInt(t, 10);
      if (Number.isFinite(n)) list = list.filter((o) => o.table_number === n);
    }

    if (serviceFilter !== "all") list = list.filter((o) => o.service_type === serviceFilter);

    return list;
  }, [orders, tableFilter, serviceFilter, getFilterDate, isOrderFromDate]);

  const updateLocal = React.useCallback((id: string, patch: Partial<QrOrderRow>) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? ({ ...o, ...patch } as QrOrderRow) : o)));
  }, []);

  const kpi = React.useMemo(() => {
    const total = filteredOrders.length;
    const news = filteredOrders.filter((o) => o.kitchen_status === "new").length;
    const preparing = filteredOrders.filter(
      (o) => o.kitchen_status === "accepted" || o.kitchen_status === "delayed",
    ).length;
    const served = filteredOrders.filter((o) => o.kitchen_status === "served").length;
    return { total, news, preparing, served };
  }, [filteredOrders]);

  const email = state.status === "signedIn" ? state.email : null;

  return (
    <ProShell title="Commandes" subtitle={email ? `Connecté : ${email}` : undefined} onSignOut={() => void signOut()}>
      <div className="flex flex-col gap-3">
        {/* KPI */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kpi icon={<UtensilsCrossed className="h-4 w-4" />} label="Commandes" value={String(kpi.total)} />
          <Kpi icon={<Bell className="h-4 w-4" />} label="Nouvelles" value={String(kpi.news)} />
          <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="En cours" value={String(kpi.preparing)} />
          <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Servies" value={String(kpi.served)} />
        </div>

        {/* Controls */}
        <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-black">Vue d’ensemble</div>
              <HelpTooltip label="Aide">Commandes en temps réel + action Accepter.</HelpTooltip>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSoundEnabled((prev) => {
                    const next = !prev;
                    if (next) {
                      void unlockAudioContext();
                      void playNewOrderSound();
                    }
                    return next;
                  });
                }}
                className={cn(
                  "h-9 rounded-xl border-black/10 bg-white px-3 text-black hover:bg-black/5",
                  soundEnabled && "border-sam-red/30 bg-sam-red/10 text-sam-red",
                )}
              >
                <Bell className="h-4 w-4" />
                <span className="ml-2 hidden sm:inline">{soundEnabled ? "Son" : "Son off"}</span>
              </Button>

              <Button
                type="button"
                onClick={() => void loadOrders()}
                variant="outline"
                className="h-9 rounded-xl border-black/10 bg-white px-3 text-black hover:bg-black/5"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="ml-2 hidden sm:inline">Rafraîchir</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-black/60" />
              <div className="text-sm font-semibold text-black">Filtres</div>
            </div>
            <div className="text-sm text-black/60">
              {loading ? "Chargement…" : `${filteredOrders.length} commande(s)`}
            </div>
          </div>

          <div className="mt-2 grid gap-2 md:grid-cols-[200px_1fr]">
            <Input
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              placeholder="Table (ex: 5)"
              inputMode="numeric"
              className="h-9 rounded-xl border-black/10 bg-white text-black placeholder:text-black/40"
            />

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:flex-wrap md:overflow-visible md:pb-0">
              {([
                { key: "all", label: "Tout" },
                { key: "sur_place", label: "Sur place" },
                { key: "emporter", label: "Emporter" },
                // { key: "livraison", label: "Livraison" },
              ] as const).map((opt) => (
                <Button
                  key={opt.key}
                  type="button"
                  variant="outline"
                  onClick={() => setServiceFilter(opt.key)}
                  className={cn(
                    "h-9 rounded-xl border-black/10 bg-white px-3 text-black hover:bg-black/5",
                    serviceFilter === opt.key && "border-sam-red/30 bg-sam-red/10 text-sam-red",
                  )}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:flex-wrap md:overflow-visible md:pb-0">
            {([
              { key: "today", label: "Aujourd’hui" },
              { key: "yesterday", label: "Hier" },
              { key: "custom", label: "Date" },
            ] as const).map((opt) => (
              <Button
                key={opt.key}
                type="button"
                variant="outline"
                onClick={() => {
                  setDateFilter(opt.key);
                  if (opt.key === "custom") setCustomDate(new Date().toISOString().split("T")[0]);
                }}
                className={cn(
                  "h-9 rounded-xl border-black/10 bg-white px-3 text-black hover:bg-black/5",
                  dateFilter === opt.key && "border-sam-red/30 bg-sam-red/10 text-sam-red",
                )}
              >
                {opt.label}
              </Button>
            ))}

            {dateFilter === "custom" && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="h-9 rounded-xl border border-black/10 bg-white px-3 text-black text-sm"
              />
            )}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/60 shadow-sm">
            Chargement…
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/60 shadow-sm">
            Aucune commande.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map((o) => (
              <OrderRow key={o.id} order={o} onUpdate={updateLocal} />
            ))}
          </div>
        )}
      </div>
    </ProShell>
  );
}
