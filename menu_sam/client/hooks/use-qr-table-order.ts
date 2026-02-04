import * as React from "react";
import { toast } from "sonner";
import { useSessionId } from "@/hooks/use-session-id";

type QrOrderStatus = "open" | "locked" | "sent" | "cancelled";

type OrderRecord = {
  id: number;
  joinCode: string;
  status: QrOrderStatus;
  tableNumber: number;
  createdAt: string;
};

type StoredSession = {
  establishmentId: string;
  tableNumber: number;
  orderId: number;
  joinCode: string;
};

type UseQrTableOrderArgs = {
  enabled: boolean;
  firstName: string | null;
  tableNumber: number;
  placeId: string | null;
};

type UseQrTableOrderState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "needs_join"; existing: OrderRecord }
  | { status: "ready"; order: OrderRecord }
  | { status: "error"; message: string };

const STORAGE_KEY = "sam_qr_table_order_session_v1";

function safeParseStored(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed || typeof parsed !== "object") return null;

    if (typeof parsed.establishmentId !== "string") return null;
    if (typeof parsed.tableNumber !== "number") return null;
    if (typeof parsed.orderId !== "number") return null;
    if (typeof parsed.joinCode !== "string") return null;

    const tableNumber = Math.trunc(parsed.tableNumber);
    if (!Number.isFinite(tableNumber) || tableNumber <= 0) return null;

    return {
      establishmentId: parsed.establishmentId,
      tableNumber,
      orderId: parsed.orderId,
      joinCode: parsed.joinCode,
    };
  } catch {
    return null;
  }
}

function writeStored(next: StoredSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (!next) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

async function createOrderWithParticipant({
  establishmentId,
  tableNumber,
  sessionId,
  firstName,
}: {
  establishmentId: string;
  tableNumber: number;
  sessionId: string;
  firstName: string;
}): Promise<OrderRecord | null> {
  try {
    const createRes = await fetch("/api/mysql/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        establishmentId,
        tableNumber,
        serviceType: "sur_place",
      }),
    });

    if (!createRes.ok) {
      console.error("Failed to create order:", await createRes.text());
      return null;
    }

    const order = await createRes.json();

    // Add participant
    try {
      await fetch("/api/mysql/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandeId: order.id,
          sessionId,
          firstName,
        }),
      });
    } catch (error) {
      console.error("Error adding participant:", error);
    }

    const result: OrderRecord = {
      id: order.id,
      joinCode: order.joinCode || "",
      status: order.status || "open",
      tableNumber: order.tableNumber || tableNumber,
      createdAt: order.createdAt,
    };

    return result;
  } catch (error) {
    console.error("Error creating order:", error);
    return null;
  }
}

export function useQrTableOrder({ enabled, firstName, tableNumber, placeId }: UseQrTableOrderArgs) {
  const sessionId = useSessionId();
  const [state, setState] = React.useState<UseQrTableOrderState>({ status: "idle" });
  const pollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const hasLoadedRef = React.useRef(false);

  const establishmentId = placeId;

  const startPolling = React.useCallback(
    (orderId: number) => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      const poll = async () => {
        try {
          const res = await fetch(`/api/mysql/orders/${establishmentId}/${orderId}`);
          if (!res.ok) return;

          const order = await res.json();

          if (order) {
            setState((prev) => {
              if (prev.status !== "ready") return prev;
              if (prev.order.id !== orderId) return prev;

              return {
                status: "ready",
                order: {
                  id: order.id,
                  joinCode: order.joinCode,
                  status: order.status,
                  tableNumber: order.tableNumber,
                  createdAt: order.createdAt,
                },
              };
            });
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      };

      // Poll every 2 seconds
      pollIntervalRef.current = setInterval(poll, 2000);
    },
    [establishmentId],
  );

  React.useEffect(() => {
    if (!enabled || !firstName || !establishmentId) {
      if (!establishmentId) {
        setState({ status: "error", message: "Établissement non configuré." });
      }
      return;
    }

    // Only load once per mount
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const load = async () => {
      setState({ status: "loading" });

      const stored = typeof window === "undefined" ? null : safeParseStored(window.localStorage.getItem(STORAGE_KEY));
      if (stored && stored.establishmentId === establishmentId && stored.tableNumber === tableNumber) {
        try {
          const res = await fetch(`/api/mysql/orders/${establishmentId}/${stored.orderId}`);
          if (!res.ok) throw new Error("Failed to fetch order");

          const data = await res.json();

          if (data && data.status === "open") {
            const orderRecord: OrderRecord = {
              id: data.id,
              joinCode: data.joinCode,
              status: data.status,
              tableNumber: data.tableNumber,
              createdAt: data.createdAt,
            };
            setState({ status: "ready", order: orderRecord });
            startPolling(data.id);
            return;
          } else {
            writeStored(null);
          }
        } catch (error) {
          console.error("Error loading stored order:", error);
          writeStored(null);
        }
      }

      let existing = null;
      try {
        const res = await fetch(`/api/mysql/orders/${establishmentId}`);
        if (res.ok) {
          const allOrders = await res.json();
          existing = allOrders.find(
            (o: any) => o.tableNumber === tableNumber && o.status === "open",
          );
        }
      } catch (error) {
        console.error("Error checking existing orders:", error);
        // Continue anyway - we'll create a new order if needed
      }

      // If an existing open order is found, check if it has active items
      // Only prompt to join if there are items being actively ordered (within 15 minutes)
      if (existing) {
        let hasActiveItems = false;
        try {
          const cartsRes = await fetch(`/api/mysql/table-carts/${establishmentId}/${tableNumber}/active`);
          if (cartsRes.ok) {
            const cartsData = await cartsRes.json();
            hasActiveItems = cartsData.hasActive;
          }
        } catch (error) {
          console.error("Error checking active items for existing order:", error);
        }

        // Only show join dialog if there are active items
        if (hasActiveItems) {
          const orderRecord: OrderRecord = {
            id: existing.id,
            joinCode: existing.joinCode,
            status: existing.status,
            tableNumber: existing.tableNumber,
            createdAt: existing.createdAt,
          };
          setState({ status: "needs_join", existing: orderRecord });
          return;
        }
        // If order exists but has no active items, ignore it and create a new order
      }

      // Check if table has active pre-carts (items added within 15 minutes)
      // If yes, someone is actively ordering - show join dialog
      let hasActiveCarts = false;
      try {
        const cartsRes = await fetch(`/api/mysql/table-carts/${establishmentId}/${tableNumber}/active`);
        if (cartsRes.ok) {
          const cartsData = await cartsRes.json();
          hasActiveCarts = cartsData.hasActive;

          if (hasActiveCarts) {
            // Someone is actively pre-ordering at this table
            // Prompt this person to join the shared session
            // Create a temporary order record for the join prompt
            const tempOrder: OrderRecord = {
              id: -1, // Placeholder
              joinCode: "shared-pre-cart",
              status: "open",
              tableNumber,
              createdAt: new Date().toISOString(),
            };
            setState({ status: "needs_join", existing: tempOrder });
            return;
          }
        }
      } catch (error) {
        console.error("Error checking active carts:", error);
        // Continue anyway - will create new order if needed
      }

      const created = await createOrderWithParticipant({
        establishmentId,
        tableNumber,
        sessionId,
        firstName,
      });

      if (!created) {
        setState({ status: "error", message: "Impossible de créer la commande de table." });
        return;
      }

      writeStored({
        establishmentId,
        tableNumber,
        orderId: created.id,
        joinCode: created.joinCode,
      });

      setState({ status: "ready", order: created });
      startPolling(created.id);
    };

    void load();
  }, [enabled, establishmentId, firstName, sessionId, tableNumber]);

  React.useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const joinExisting = React.useCallback(
    async (existing: OrderRecord): Promise<boolean> => {
      if (!firstName) return false;

      // If joining a pre-cart session (temporary order), create a real order instead
      if (existing.id === -1 && existing.joinCode === "shared-pre-cart") {
        const created = await createOrderWithParticipant({
          establishmentId: establishmentId ?? "",
          tableNumber,
          sessionId,
          firstName,
        });

        if (!created) {
          console.error("Failed to create order for pre-cart join");
          return false;
        }

        writeStored({
          establishmentId: establishmentId ?? "",
          tableNumber,
          orderId: created.id,
          joinCode: created.joinCode,
        });

        setState({ status: "ready", order: created });
        startPolling(created.id);
        return true;
      }

      // Otherwise, join the existing order
      try {
        await fetch("/api/mysql/participants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commandeId: existing.id,
            sessionId,
            firstName,
          }),
        });
      } catch (error) {
        console.error("Error joining:", error);
      }

      writeStored({
        establishmentId: establishmentId ?? "",
        tableNumber,
        orderId: existing.id,
        joinCode: existing.joinCode,
      });

      setState({ status: "ready", order: existing });
      startPolling(existing.id);
      return true;
    },
    [establishmentId, firstName, sessionId, tableNumber, startPolling],
  );

  const createNew = React.useCallback(async (): Promise<boolean> => {
    if (!firstName) return false;
    if (!establishmentId) return false;

    const created = await createOrderWithParticipant({
      establishmentId,
      tableNumber,
      sessionId,
      firstName,
    });

    if (!created) {
      toast.message("Impossible de créer une nouvelle commande.", { duration: 2200 });
      return false;
    }

    writeStored({
      establishmentId,
      tableNumber,
      orderId: created.id,
      joinCode: created.joinCode,
    });

    setState({ status: "ready", order: created });
    startPolling(created.id);
    return true;
  }, [establishmentId, firstName, sessionId, tableNumber, startPolling]);

  const currentOrderId = state.status === "ready" ? state.order.id : null;

  const setOrderStatus = React.useCallback(
    async (nextStatus: QrOrderStatus): Promise<boolean> => {
      if (!currentOrderId) return false;

      try {
        const res = await fetch(`/api/mysql/orders/${currentOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });

        if (!res.ok) {
          toast.message("Impossible de modifier la commande. Réessayez.", { duration: 2200 });
          return false;
        }

        setState((prev) =>
          prev.status === "ready" && prev.order.id === currentOrderId
            ? { status: "ready", order: { ...prev.order, status: nextStatus } }
            : prev,
        );

        return true;
      } catch (error) {
        console.error("Error updating order status:", error);
        toast.message("Impossible de modifier la commande. Réessayez.", { duration: 2200 });
        return false;
      }
    },
    [currentOrderId],
  );

  const lockOrder = React.useCallback(async (): Promise<boolean> => {
    return setOrderStatus("locked");
  }, [setOrderStatus]);

  const reopenOrder = React.useCallback(async (): Promise<boolean> => {
    return setOrderStatus("open");
  }, [setOrderStatus]);

  return {
    state,
    tableNumber,
    joinExisting,
    createNew,
    lockOrder,
    reopenOrder,
  };
}
