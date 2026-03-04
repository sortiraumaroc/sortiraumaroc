import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminEstablishmentsNav } from "./establishments/AdminEstablishmentsNav";
import { EstablishmentsPanel } from "@/components/admin/EstablishmentsPanel";

export function AdminEstablishmentsPage() {
  return (
    <div className="space-y-4">
      <AdminEstablishmentsNav />
      <AdminPageHeader
        title="Établissements"
        description="Liste, statut, et actions de modération sur les fiches." 
      />
      <EstablishmentsPanel adminKey={undefined} />
    </div>
  );
}
