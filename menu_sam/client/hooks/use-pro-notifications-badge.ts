import * as React from "react";

type BadgeData = {
  pendingOrders: number;
  pendingNotifications: number;
  totalPending: number;
};

export function useProNotificationsBadge(selectedPlaceId: number | null) {
  const [badgeData, setBadgeData] = React.useState<BadgeData>({
    pendingOrders: 0,
    pendingNotifications: 0,
    totalPending: 0,
  });

  React.useEffect(() => {
    if (!selectedPlaceId) {
      console.log("[useProNotificationsBadge] selectedPlaceId is null, skipping fetch");
      setBadgeData({
        pendingOrders: 0,
        pendingNotifications: 0,
        totalPending: 0,
      });
      return;
    }

    console.log("[useProNotificationsBadge] Fetching badge data for placeId:", selectedPlaceId);

    const fetchBadgeData = async () => {
      try {
        // Fetch pending orders (new status)
        const ordersRes = await fetch(`/api/mysql/orders/${selectedPlaceId}`);
        const orders = ordersRes.ok ? await ordersRes.json() : [];
        const pendingOrders = Array.isArray(orders)
          ? orders.filter((o: any) => o.kitchenStatus === "new").length
          : 0;

        // Fetch pending notifications
        const notifRes = await fetch(`/api/mysql/notifications/${selectedPlaceId}?status=pending`);
        const notifications = notifRes.ok ? await notifRes.json() : [];
        const pendingNotifications = Array.isArray(notifications)
          ? notifications.filter((n: any) => n.status === "pending").length
          : 0;

        setBadgeData({
          pendingOrders,
          pendingNotifications,
          totalPending: pendingOrders + pendingNotifications,
        });
      } catch (error) {
        console.error("Error fetching badge data:", error);
      }
    };

    // Initial fetch
    void fetchBadgeData();

    // Poll every 3 seconds
    const interval = setInterval(() => {
      void fetchBadgeData();
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedPlaceId]);

  return badgeData;
}
