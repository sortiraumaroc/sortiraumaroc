import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { ModerationQueuePanel } from "@/components/admin/ModerationQueuePanel";

export function AdminModerationPage() {
  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Modération"
        description="Validation/rejet des modifications d’établissement, avec historique et actions."
      />
      <ModerationQueuePanel adminKey={undefined} />
    </div>
  );
}
