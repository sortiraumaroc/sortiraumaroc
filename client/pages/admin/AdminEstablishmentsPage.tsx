import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { EstablishmentsPanel } from "@/components/admin/EstablishmentsPanel";

export function AdminEstablishmentsPage() {
  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Établissements"
        description="Liste, statut, et actions de modération sur les fiches." 
      />
      <EstablishmentsPanel adminKey={undefined} />
    </div>
  );
}
