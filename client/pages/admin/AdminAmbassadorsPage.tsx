import { AdminAmbassadorsDashboard } from "@/components/admin/ambassadors/AdminAmbassadorsDashboard";

export function AdminAmbassadorsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Programme Ambassadeurs</h1>
        <p className="text-muted-foreground">
          Vue globale des programmes ambassadeurs, conversions et detection de fraude
        </p>
      </div>
      <AdminAmbassadorsDashboard />
    </div>
  );
}
