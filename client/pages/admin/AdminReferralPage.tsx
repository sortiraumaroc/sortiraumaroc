import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminReferralDashboard } from "@/components/admin/referral/AdminReferralDashboard";

export function AdminReferralPage() {
  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Programme de parrainage"
        description="Gérez les parrains, commissions et configuration du programme"
      />

      <AdminReferralDashboard />
    </div>
  );
}
