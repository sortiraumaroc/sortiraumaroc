import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminEmailsNav } from "./AdminEmailsNav";
import { NewsletterTab } from "../import-export/NewsletterTab";

export function AdminEmailsNewsletterHomepagePage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Emailing"
        description="Gérez vos campagnes d'emailing et vos contacts"
      />

      <AdminEmailsNav />

      <NewsletterTab />
    </div>
  );
}

export default AdminEmailsNewsletterHomepagePage;
