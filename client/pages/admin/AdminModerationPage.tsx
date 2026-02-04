import { AtSign, FileEdit } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { ModerationQueuePanel } from "@/components/admin/ModerationQueuePanel";
import { UsernameRequestsPanel } from "@/components/admin/UsernameRequestsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AdminModerationPage() {
  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Modération"
        description="Validation/rejet des modifications d'établissement et des noms d'utilisateur."
      />
      <Tabs defaultValue="profiles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profiles" className="gap-2">
            <FileEdit className="w-4 h-4" />
            Fiches établissements
          </TabsTrigger>
          <TabsTrigger value="usernames" className="gap-2">
            <AtSign className="w-4 h-4" />
            Noms d'utilisateur
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profiles">
          <ModerationQueuePanel adminKey={undefined} />
        </TabsContent>
        <TabsContent value="usernames">
          <UsernameRequestsPanel adminKey={undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
