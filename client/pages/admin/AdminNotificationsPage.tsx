import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminNotificationsPanel } from "@/components/admin/notifications/AdminNotificationsPanel";

export function AdminNotificationsPage() {
  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Notifications"
        description="Historique global (réservations, paiements, modération, finance…)."
      />

      <AdminNotificationsPanel />
    </div>
  );
}
