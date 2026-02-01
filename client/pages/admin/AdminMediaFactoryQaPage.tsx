import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TestStatus = "pass" | "warn" | "fail" | "pending";

type TestItem = {
  id: string;
  category: string;
  feature: string;
  status: TestStatus;
  notes: string;
};

const qaChecklist: TestItem[] = [
  // DATABASE & MIGRATIONS
  {
    id: "db-1",
    category: "Database",
    feature: "media_jobs table",
    status: "pass",
    notes: "Créée avec migration 20260606",
  },
  {
    id: "db-2",
    category: "Database",
    feature: "media_briefs table",
    status: "pass",
    notes: "Payload JSONB + status enum",
  },
  {
    id: "db-3",
    category: "Database",
    feature: "media_schedule_slots table",
    status: "pass",
    notes: "Créneaux proposés par RC",
  },
  {
    id: "db-4",
    category: "Database",
    feature: "media_appointments table",
    status: "pass",
    notes: "RDV confirmé (Pro sélection)",
  },
  {
    id: "db-5",
    category: "Database",
    feature: "media_deliverables table",
    status: "pass",
    notes: "Livrables par rôle + versioning",
  },
  {
    id: "db-6",
    category: "Database",
    feature: "media_deliverable_files table",
    status: "pass",
    notes: "Historique fichiers uploadés",
  },
  {
    id: "db-7",
    category: "Database",
    feature: "media_checkins table",
    status: "pass",
    notes: "Token hash + confirmation",
  },
  {
    id: "db-8",
    category: "Database",
    feature: "media_threads / messages",
    status: "pass",
    notes: "Chat par job",
  },
  {
    id: "db-9",
    category: "Database",
    feature: "media_audit_logs table",
    status: "pass",
    notes: "Traçabilité actions",
  },
  {
    id: "db-10",
    category: "Database",
    feature: "partner_profiles table",
    status: "pass",
    notes: "Profils créatifs",
  },
  {
    id: "db-11",
    category: "Database",
    feature: "partner_billing_profiles table",
    status: "pass",
    notes: "RIB/IBAN partenaires",
  },
  {
    id: "db-12",
    category: "Database",
    feature: "partner_invoice_requests table",
    status: "pass",
    notes: "Demandes de facturation",
  },
  {
    id: "db-13",
    category: "Database",
    feature: "media_cost_settings / overrides",
    status: "pass",
    notes: "Tarifs par rôle",
  },
  {
    id: "db-14",
    category: "Database",
    feature: "RLS policies (skeleton)",
    status: "warn",
    notes: "Skeleton minimal, à renforcer",
  },

  // API ADMIN
  {
    id: "api-admin-1",
    category: "API Admin",
    feature: "GET /api/admin/production/jobs",
    status: "pass",
    notes: "Liste jobs avec filtres",
  },
  {
    id: "api-admin-2",
    category: "API Admin",
    feature: "GET /api/admin/production/jobs/:id",
    status: "pass",
    notes: "Détails job + brief + slots + deliverables",
  },
  {
    id: "api-admin-3",
    category: "API Admin",
    feature: "POST /api/admin/production/jobs/:id/update",
    status: "pass",
    notes: "Changement statut manuel",
  },
  {
    id: "api-admin-4",
    category: "API Admin",
    feature: "POST /api/admin/production/jobs/:id/brief/approve",
    status: "pass",
    notes: "Validation brief RC",
  },
  {
    id: "api-admin-5",
    category: "API Admin",
    feature: "POST /api/admin/production/jobs/:id/schedule-slots",
    status: "pass",
    notes: "Création créneaux",
  },
  {
    id: "api-admin-6",
    category: "API Admin",
    feature: "POST /api/admin/production/deliverables/:id/review",
    status: "pass",
    notes: "Approve/reject livrable",
  },
  {
    id: "api-admin-7",
    category: "API Admin",
    feature: "POST /api/admin/production/jobs/:id/checkin-token",
    status: "pass",
    notes: "Génération token QR",
  },
  {
    id: "api-admin-8",
    category: "API Admin",
    feature: "GET /api/admin/production/jobs/:id/brief.pdf",
    status: "pass",
    notes: "PDF Brief + QR",
  },

  // API Pro
  {
    id: "api-pro-1",
    category: "API Pro",
    feature: "GET /api/pro/.../media/jobs",
    status: "pass",
    notes: "Liste jobs établissement",
  },
  {
    id: "api-pro-2",
    category: "API Pro",
    feature: "GET /api/pro/.../media/jobs/:jobId",
    status: "pass",
    notes: "Détails job pour Pro",
  },
  {
    id: "api-pro-3",
    category: "API Pro",
    feature: "POST /api/pro/.../brief/save",
    status: "pass",
    notes: "Sauvegarde brouillon",
  },
  {
    id: "api-pro-4",
    category: "API Pro",
    feature: "POST /api/pro/.../brief/submit",
    status: "pass",
    notes: "Soumission brief",
  },
  {
    id: "api-pro-5",
    category: "API Pro",
    feature: "POST /api/pro/.../schedule/select",
    status: "pass",
    notes: "Sélection créneau",
  },
  {
    id: "api-pro-6",
    category: "API Pro",
    feature: "POST /api/pro/media/checkin/confirm",
    status: "pass",
    notes: "Confirmation check-in (auth)",
  },

  // API PARTNER
  {
    id: "api-partner-1",
    category: "API Partner",
    feature: "GET /api/partners/me",
    status: "pass",
    notes: "Profil partenaire",
  },
  {
    id: "api-partner-2",
    category: "API Partner",
    feature: "GET /api/partners/missions",
    status: "pass",
    notes: "Liste missions assignées",
  },
  {
    id: "api-partner-3",
    category: "API Partner",
    feature: "GET /api/partners/missions/:jobId",
    status: "pass",
    notes: "Détails mission",
  },
  {
    id: "api-partner-4",
    category: "API Partner",
    feature: "POST /api/partners/deliverables/:id/upload",
    status: "pass",
    notes: "Upload fichier (server proxy)",
  },
  {
    id: "api-partner-5",
    category: "API Partner",
    feature: "POST /api/partners/missions/:jobId/invoice-request",
    status: "pass",
    notes: "Demande facturation",
  },

  // API PUBLIC
  {
    id: "api-public-1",
    category: "API Public",
    feature: "GET /api/media/checkin/:token",
    status: "pass",
    notes: "Info check-in (no auth)",
  },
  {
    id: "api-public-2",
    category: "API Public",
    feature: "POST /api/media/checkin",
    status: "pass",
    notes: "Confirmer check-in (no auth)",
  },

  // UI ADMIN
  {
    id: "ui-admin-1",
    category: "UI Admin",
    feature: "/admin/production-media",
    status: "pass",
    notes: "Liste jobs avec badges",
  },
  {
    id: "ui-admin-2",
    category: "UI Admin",
    feature: "/admin/production-media/:id",
    status: "pass",
    notes: "Détails + stepper + actions",
  },
  {
    id: "ui-admin-3",
    category: "UI Admin",
    feature: "Brief approval card",
    status: "pass",
    notes: "Bouton valider + note",
  },
  {
    id: "ui-admin-4",
    category: "UI Admin",
    feature: "Schedule slots creation",
    status: "pass",
    notes: "Dialog création créneau",
  },
  {
    id: "ui-admin-5",
    category: "UI Admin",
    feature: "Deliverables review",
    status: "pass",
    notes: "Approve/reject dialog",
  },
  {
    id: "ui-admin-6",
    category: "UI Admin",
    feature: "QR token generation",
    status: "pass",
    notes: "Bouton + affichage token",
  },
  {
    id: "ui-admin-7",
    category: "UI Admin",
    feature: "PDF Brief download",
    status: "warn",
    notes: "Lien à ajouter dans UI",
  },
  {
    id: "ui-admin-8",
    category: "UI Admin",
    feature: "Status manual change",
    status: "pass",
    notes: "Select dropdown",
  },

  // UI Pro
  {
    id: "ui-pro-1",
    category: "UI Pro",
    feature: "Tab MEDIA FACTORY",
    status: "pass",
    notes: "ProMediaFactoryTab",
  },
  {
    id: "ui-pro-2",
    category: "UI Pro",
    feature: "Jobs list",
    status: "pass",
    notes: "Table avec badges",
  },
  {
    id: "ui-pro-3",
    category: "UI Pro",
    feature: "Brief form (edit/submit)",
    status: "pass",
    notes: "5 champs + boutons",
  },
  {
    id: "ui-pro-4",
    category: "UI Pro",
    feature: "Schedule slot selection",
    status: "pass",
    notes: "Table + bouton Choisir",
  },
  {
    id: "ui-pro-5",
    category: "UI Pro",
    feature: "Deliverables view",
    status: "pass",
    notes: "Table read-only",
  },
  {
    id: "ui-pro-6",
    category: "UI Pro",
    feature: "Messages thread",
    status: "pass",
    notes: "MediaThreadPanel",
  },

  // UI PARTNER
  {
    id: "ui-partner-1",
    category: "UI Partner",
    feature: "/partner",
    status: "pass",
    notes: "PartnerShell",
  },
  {
    id: "ui-partner-2",
    category: "UI Partner",
    feature: "Profile display",
    status: "pass",
    notes: "Card profil partenaire",
  },
  {
    id: "ui-partner-3",
    category: "UI Partner",
    feature: "Missions list",
    status: "pass",
    notes: "Grouped by job",
  },
  {
    id: "ui-partner-4",
    category: "UI Partner",
    feature: "File upload",
    status: "pass",
    notes: "Input + version bump",
  },
  {
    id: "ui-partner-5",
    category: "UI Partner",
    feature: "Invoice request",
    status: "pass",
    notes: "Bouton + guard",
  },
  {
    id: "ui-partner-6",
    category: "UI Partner",
    feature: "Files history",
    status: "pass",
    notes: "Table fichiers",
  },

  // UI PUBLIC
  {
    id: "ui-public-1",
    category: "UI Public",
    feature: "/media/checkin",
    status: "pass",
    notes: "Page QR check-in",
  },

  // COMPONENTS
  {
    id: "comp-1",
    category: "Components",
    feature: "MediaJobStepper",
    status: "pass",
    notes: "15 étapes visualisées",
  },
  {
    id: "comp-2",
    category: "Components",
    feature: "MediaJobStatusBadge",
    status: "pass",
    notes: "Couleurs par statut",
  },
  {
    id: "comp-3",
    category: "Components",
    feature: "MediaDeliverableStatusBadge",
    status: "pass",
    notes: "Statuts livrables",
  },
  {
    id: "comp-4",
    category: "Components",
    feature: "MediaThreadPanel",
    status: "pass",
    notes: "Affichage messages",
  },
  {
    id: "comp-5",
    category: "Components",
    feature: "formatDateTimeShort",
    status: "pass",
    notes: "Helper date",
  },

  // WORKFLOW GUARDS
  {
    id: "wf-1",
    category: "Workflow",
    feature: "Brief edit guard",
    status: "pass",
    notes: "Verrouillé après validation",
  },
  {
    id: "wf-2",
    category: "Workflow",
    feature: "Slot selection guard",
    status: "pass",
    notes: "Seulement en 'scheduling'",
  },
  {
    id: "wf-3",
    category: "Workflow",
    feature: "Deliverable upload versioning",
    status: "pass",
    notes: "Version auto-incrémentée",
  },
  {
    id: "wf-4",
    category: "Workflow",
    feature: "Invoice request eligibility",
    status: "pass",
    notes: "Livrable approved requis",
  },
  {
    id: "wf-5",
    category: "Workflow",
    feature: "Check-in status advance",
    status: "pass",
    notes: "checkin_pending -> deliverables_expected",
  },

  // NOTIFICATIONS
  {
    id: "notif-1",
    category: "Notifications",
    feature: "Brief submitted → RC",
    status: "pass",
    notes: "notifyBriefSubmitted()",
  },
  {
    id: "notif-2",
    category: "Notifications",
    feature: "Brief approved → Pro",
    status: "pass",
    notes: "notifyBriefApproved()",
  },
  {
    id: "notif-3",
    category: "Notifications",
    feature: "Appointment confirmed → All",
    status: "pass",
    notes: "notifyAppointmentConfirmed()",
  },
  {
    id: "notif-4",
    category: "Notifications",
    feature: "Deliverable uploaded → Admin",
    status: "pass",
    notes: "notifyDeliverableUploaded()",
  },
  {
    id: "notif-5",
    category: "Notifications",
    feature: "Deliverable reviewed → Partner",
    status: "pass",
    notes: "notifyDeliverableReviewed()",
  },
  {
    id: "notif-6",
    category: "Notifications",
    feature: "Invoice requested → Compta",
    status: "pass",
    notes: "notifyInvoiceRequested()",
  },

  // STORAGE
  {
    id: "storage-1",
    category: "Storage",
    feature: "media-rushs bucket",
    status: "pass",
    notes: "1GB, video/*",
  },
  {
    id: "storage-2",
    category: "Storage",
    feature: "media-edits bucket",
    status: "pass",
    notes: "1GB, video/image",
  },
  {
    id: "storage-3",
    category: "Storage",
    feature: "media-voice bucket",
    status: "pass",
    notes: "100MB, audio/*",
  },
  {
    id: "storage-4",
    category: "Storage",
    feature: "media-blog bucket",
    status: "pass",
    notes: "50MB, text/image",
  },
  {
    id: "storage-5",
    category: "Storage",
    feature: "media-photos bucket",
    status: "pass",
    notes: "100MB, image/*",
  },

  // COMPTA
  {
    id: "compta-1",
    category: "Compta",
    feature: "/admin/production-media/compta",
    status: "pass",
    notes: "Écran dédié",
  },
  {
    id: "compta-2",
    category: "Compta",
    feature: "List invoice requests",
    status: "pass",
    notes: "API + UI table",
  },
  {
    id: "compta-3",
    category: "Compta",
    feature: "Approve/Pay/Reject",
    status: "pass",
    notes: "Dialog actions",
  },
  {
    id: "compta-4",
    category: "Compta",
    feature: "Payment reference",
    status: "pass",
    notes: "Champ optionnel",
  },
  {
    id: "compta-5",
    category: "Compta",
    feature: "Summary cards",
    status: "pass",
    notes: "KPI en attente/payé/montant",
  },

  // BUSINESS GUARDS
  {
    id: "guard-1",
    category: "Business Guards",
    feature: "Scheduling blocked until brief approved",
    status: "pass",
    notes: "Server-side check",
  },
  {
    id: "guard-2",
    category: "Business Guards",
    feature: "Payment blocked without QR check-in",
    status: "pass",
    notes: "updateAdminInvoiceRequest guard",
  },
  {
    id: "guard-3",
    category: "Business Guards",
    feature: "Invoice button hidden until conditions",
    status: "pass",
    notes: "Partner UI gating",
  },
  {
    id: "guard-4",
    category: "Business Guards",
    feature: "Auto-transition to ready_delivery",
    status: "pass",
    notes: "After all deliverables approved",
  },

  // PUBLISHING
  {
    id: "publish-1",
    category: "Publishing",
    feature: "scheduled_publish_at field",
    status: "pass",
    notes: "DB column + API",
  },
  {
    id: "publish-2",
    category: "Publishing",
    feature: "published_links JSON",
    status: "pass",
    notes: "IG/FB/TikTok/YT/Snap/Caption/CTA",
  },
  {
    id: "publish-3",
    category: "Publishing",
    feature: "Publishing section UI",
    status: "pass",
    notes: "Admin job details",
  },
  {
    id: "publish-4",
    category: "Publishing",
    feature: "Date/time selection",
    status: "pass",
    notes: "Date + time inputs",
  },

  // PENDING / TODO
  {
    id: "todo-1",
    category: "TODO",
    feature: "Smart brief adapted to universe",
    status: "warn",
    notes: "Brief JSON flexible, pas d'adaptation auto",
  },
  {
    id: "todo-2",
    category: "TODO",
    feature: "RLS policies hardening",
    status: "warn",
    notes: "Skeleton minimal, à renforcer",
  },
];

function StatusIcon({ status }: { status: TestStatus }) {
  switch (status) {
    case "pass":
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    case "warn":
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case "fail":
      return <XCircle className="h-5 w-5 text-red-600" />;
    case "pending":
      return <div className="h-5 w-5 rounded-full border-2 border-slate-300" />;
  }
}

function statusLabel(status: TestStatus): string {
  switch (status) {
    case "pass":
      return "OK";
    case "warn":
      return "Partiel";
    case "fail":
      return "KO";
    case "pending":
      return "À faire";
  }
}

export function AdminMediaFactoryQaPage() {
  const categories = [...new Set(qaChecklist.map((t) => t.category))];

  const summary = {
    pass: qaChecklist.filter((t) => t.status === "pass").length,
    warn: qaChecklist.filter((t) => t.status === "warn").length,
    fail: qaChecklist.filter((t) => t.status === "fail").length,
    pending: qaChecklist.filter((t) => t.status === "pending").length,
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <div className="text-xs text-slate-500">MEDIA FACTORY</div>
        <div className="text-xl font-extrabold text-slate-900">
          QA Checklist
        </div>
        <div className="mt-1 text-sm text-slate-600">
          État d'implémentation de toutes les fonctionnalités du module de
          production media.
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {summary.pass}
              </div>
              <div className="text-xs text-slate-500">Validés</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {summary.warn}
              </div>
              <div className="text-xs text-slate-500">Partiels</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-8 w-8 text-red-600" />
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {summary.fail}
              </div>
              <div className="text-xs text-slate-500">Échecs</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-slate-300 flex items-center justify-center text-slate-400 text-sm font-bold">
              ?
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {summary.pending}
              </div>
              <div className="text-xs text-slate-500">À faire</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {categories.map((cat) => {
        const items = qaChecklist.filter((t) => t.category === cat);
        return (
          <Card key={cat}>
            <CardHeader className="py-3">
              <SectionHeader
                title={cat}
                description={`${items.filter((t) => t.status === "pass").length}/${items.length} validés`}
                titleClassName="text-sm"
              />
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Statut</TableHead>
                    <TableHead>Fonctionnalité</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusIcon status={item.status} />
                          <span className="text-xs text-slate-500 hidden md:inline">
                            {statusLabel(item.status)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-900">
                        {item.feature}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {item.notes}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
