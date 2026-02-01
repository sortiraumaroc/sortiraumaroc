import { AdminNotificationsPanel } from "@/components/admin/notifications/AdminNotificationsPanel";

export function AdminNotificationsPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Notifications</h1>
        <div className="mt-1 text-sm text-slate-600">Historique global (réservations, paiements, modération, finance…).</div>
      </div>

      <AdminNotificationsPanel />
    </div>
  );
}
