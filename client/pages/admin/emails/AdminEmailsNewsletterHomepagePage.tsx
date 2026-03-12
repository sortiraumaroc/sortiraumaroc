import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminEmailsNav } from "./AdminEmailsNav";
import { NewsletterTab } from "../import-export/NewsletterTab";

export function AdminEmailsNewsletterHomepagePage() {
  return (
    <div className="space-y-4">
      <AdminEmailsNav />
      <AdminPageHeader
        title="Emailing"
        description="Gérez vos campagnes d'emailing et vos contacts"
      />

      <NewsletterTab />
    </div>
  );
}

export default AdminEmailsNewsletterHomepagePage;
