import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminEmailsNav } from "./AdminEmailsNav";
import { AudiencesTab } from "../import-export/AudiencesTab";

export function AdminEmailsAudiencesPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Emailing"
        description="Gérez vos campagnes d'emailing et vos contacts"
      />

      <AdminEmailsNav />

      <AudiencesTab />
    </div>
  );
}

export default AdminEmailsAudiencesPage;
