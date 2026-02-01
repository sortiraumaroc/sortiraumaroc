import { useEffect, useState, useCallback } from "react";
import {
  useParams,
  useNavigate,
  useOutletContext,
  Link,
} from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Clock,
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  MessageSquare,
  MessageCircle,
  ExternalLink,
  Loader2,
  FileUp,
  History,
  Banknote,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  getPartnerMission,
  uploadPartnerDeliverableFile,
  requestPartnerInvoice,
  type PartnerMissionDetails as MissionDetailsType,
} from "@/lib/pro/api";
import type { PartnerProfile } from "@/components/partner/PartnerLayout";

type OutletContext = {
  profile: PartnerProfile;
  refreshProfile: () => void;
};

const DELIVERABLE_STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  expected: {
    label: "À déposer",
    icon: Upload,
    className: "bg-amber-100 text-amber-800",
  },
  submitted: {
    label: "Soumis",
    icon: Clock,
    className: "bg-blue-100 text-blue-800",
  },
  in_review: {
    label: "En validation",
    icon: Clock,
    className: "bg-purple-100 text-purple-800",
  },
  approved: {
    label: "Validé",
    icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-800",
  },
  rejected: {
    label: "Rejeté",
    icon: XCircle,
    className: "bg-red-100 text-red-800",
  },
};

const INVOICE_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  requested: { label: "Demandée", className: "bg-blue-100 text-blue-800" },
  accounting_review: {
    label: "En revue compta",
    className: "bg-purple-100 text-purple-800",
  },
  approved: {
    label: "Approuvée",
    className: "bg-emerald-100 text-emerald-800",
  },
  paid: { label: "Payée", className: "bg-green-100 text-green-800" },
  rejected: { label: "Rejetée", className: "bg-red-100 text-red-800" },
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PartnerMissionDetails() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useOutletContext<OutletContext>();

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<MissionDetailsType | null>(null);
  const [activeTab, setActiveTab] = useState("brief");

  const loadDetails = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const res = await getPartnerMission({ jobId });
      setDetails(res);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
      navigate("/partners/dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetails();
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!details) {
    return (
      <div className="text-center py-10">
        <p className="text-slate-500">Mission introuvable.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate("/partners/dashboard")}
        >
          Retour
        </Button>
      </div>
    );
  }

  const job = (details as any).job ?? {};
  const establishment = job.establishments ?? {};
  const brief = (details as any).brief ?? {};
  const deliverables = details.deliverables ?? [];
  const files = details.files ?? [];
  const invoiceRequests = details.invoice_requests ?? [];
  const billingProfile = details.billing_profile;

  // Check invoice eligibility
  const approvedDeliverables = deliverables.filter(
    (d: any) => d.status === "approved",
  );
  const hasApprovedDeliverable = approvedDeliverables.length > 0;
  const isBillingValidated =
    String(billingProfile?.status ?? "") === "validated";
  const hasProfileComplete = profile.display_name && profile.rib_iban;
  const hasPendingRequest = invoiceRequests.some(
    (r: any) => r.status === "requested" || r.status === "accounting_review",
  );
  const canRequestInvoice =
    hasApprovedDeliverable &&
    isBillingValidated &&
    hasProfileComplete &&
    !hasPendingRequest;

  return (
    <div className="space-y-4">
      {/* Back button + title */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/partners/dashboard")}
          className="h-8 px-2"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-slate-900 truncate">
            {String(establishment.name ?? "Mission")}
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <MapPin className="w-3 h-3" />
            {String(establishment.city ?? "—")}
            {(job.meta as any)?.shoot_date && (
              <>
                <span className="text-slate-300">•</span>
                <Calendar className="w-3 h-3" />
                {formatDate((job.meta as any)?.shoot_date)}
              </>
            )}
          </div>
        </div>
        {/* Contact RC button */}
        <Button
          size="sm"
          className="bg-[#a3001d] hover:bg-[#8a0019] gap-1.5"
          onClick={() => navigate(`/partners/messages?job=${jobId}`)}
        >
          <MessageCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Contacter RC</span>
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-3 h-9">
          <TabsTrigger value="brief" className="text-xs">
            <FileText className="w-3.5 h-3.5 mr-1" />
            Brief
          </TabsTrigger>
          <TabsTrigger value="livrables" className="text-xs">
            <Upload className="w-3.5 h-3.5 mr-1" />
            Livrables
            {deliverables.some((d: any) => d.status === "expected") && (
              <span className="ml-1 w-2 h-2 rounded-full bg-amber-500" />
            )}
          </TabsTrigger>
          <TabsTrigger value="facturation" className="text-xs">
            <Banknote className="w-3.5 h-3.5 mr-1" />
            Facturation
          </TabsTrigger>
        </TabsList>

        {/* Brief Tab */}
        <TabsContent value="brief" className="mt-3 space-y-3">
          <BriefSection establishment={establishment} job={job} brief={brief} />
        </TabsContent>

        {/* Livrables Tab */}
        <TabsContent value="livrables" className="mt-3 space-y-3">
          <DeliverablesSection
            deliverables={deliverables}
            files={files}
            onRefresh={loadDetails}
          />
        </TabsContent>

        {/* Facturation Tab */}
        <TabsContent value="facturation" className="mt-3 space-y-3">
          <InvoiceSection
            jobId={jobId!}
            profile={profile}
            billingProfile={billingProfile}
            approvedDeliverables={approvedDeliverables}
            invoiceRequests={invoiceRequests}
            canRequestInvoice={canRequestInvoice}
            hasPendingRequest={hasPendingRequest}
            onRefresh={loadDetails}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BriefSection({
  establishment,
  job,
  brief,
}: {
  establishment: any;
  job: any;
  brief: any;
}) {
  const address = String(establishment.address ?? "");
  const city = String(establishment.city ?? "");
  const fullAddress = [address, city].filter(Boolean).join(", ");
  const googleMapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  const contactName = String(brief.contact_name ?? job.contact_name ?? "—");
  const shootDate = (job.meta as any)?.shoot_date ?? null;
  const shootTime = (job.meta as any)?.shoot_time ?? null;
  const instructions = String(
    brief.instructions ?? brief.special_instructions ?? "",
  );
  const briefPdfUrl = String(brief.pdf_url ?? "");

  return (
    <div className="space-y-3">
      {/* Establishment info */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <h3 className="text-xs font-semibold text-slate-700 uppercase mb-2">
          Établissement
        </h3>
        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-900">
            {String(establishment.name ?? "—")}
          </div>
          {fullAddress && (
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-sm text-slate-700">{fullAddress}</div>
                {googleMapsUrl && (
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#a3001d] hover:underline inline-flex items-center gap-1 mt-0.5"
                  >
                    Ouvrir dans Google Maps
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Date & Contact */}
      <div className="grid grid-cols-2 gap-3">
        {(shootDate || shootTime) && (
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <h3 className="text-xs font-semibold text-slate-700 uppercase mb-1">
              Date & Heure
            </h3>
            <div className="flex items-center gap-2 text-sm text-slate-900">
              <Calendar className="w-4 h-4 text-slate-400" />
              {formatDate(shootDate)}
              {shootTime && (
                <>
                  <span className="text-slate-300">•</span>
                  <Clock className="w-4 h-4 text-slate-400" />
                  {shootTime}
                </>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <h3 className="text-xs font-semibold text-slate-700 uppercase mb-1">
            Contact RC
          </h3>
          <div className="text-sm text-slate-900">{contactName}</div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs mt-1"
            disabled
          >
            <MessageSquare className="w-3 h-3 mr-1" />
            Message
          </Button>
        </div>
      </div>

      {/* Instructions */}
      {instructions && (
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <h3 className="text-xs font-semibold text-slate-700 uppercase mb-2">
            Consignes
          </h3>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">
            {instructions}
          </p>
        </div>
      )}

      {/* Brief PDF */}
      {briefPdfUrl && (
        <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#a3001d]" />
            <span className="text-sm font-medium text-slate-900">
              Brief de production
            </span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={briefPdfUrl} target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4 mr-1" />
              Télécharger
            </a>
          </Button>
        </div>
      )}

      {/* Check-in notice for camera/photographer */}
      {(job.role === "camera" || job.role === "photographer") && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-blue-800">
              QR Check-in requis
            </div>
            <div className="text-xs text-blue-700">
              Un QR code sera scanné à votre arrivée sur site pour valider votre
              présence.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeliverablesSection({
  deliverables,
  files,
  onRefresh,
}: {
  deliverables: any[];
  files: any[];
  onRefresh: () => Promise<void>;
}) {
  if (deliverables.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <div className="text-sm text-slate-600">Aucun livrable assigné.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {deliverables.map((d: any) => (
        <DeliverableCard
          key={d.id}
          deliverable={d}
          files={files.filter((f: any) => f.deliverable_id === d.id)}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}

function DeliverableCard({
  deliverable,
  files,
  onRefresh,
}: {
  deliverable: any;
  files: any[];
  onRefresh: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const status = String(deliverable.status ?? "expected");
  const config =
    DELIVERABLE_STATUS_CONFIG[status] || DELIVERABLE_STATUS_CONFIG.expected;
  const Icon = config.icon;

  const role = String(deliverable.role ?? "—").toUpperCase();
  const type = String(deliverable.deliverable_type ?? "—");
  const version = Number(deliverable.current_version ?? 0);
  const rejectionComment = String(deliverable.rejection_comment ?? "");

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await uploadPartnerDeliverableFile({
        deliverableId: String(deliverable.id),
        file,
      });
      toast({ title: "Succès", description: "Fichier envoyé avec succès." });
      await onRefresh();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-semibold">
            {role}
          </Badge>
          <span className="text-sm font-medium text-slate-900">{type}</span>
          <span className="text-xs text-slate-500">v{version}</span>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
            config.className,
          )}
        >
          <Icon className="w-3 h-3" />
          {config.label}
        </div>
      </div>

      {/* Rejection comment */}
      {status === "rejected" && rejectionComment && (
        <div className="px-3 pb-3">
          <div className="bg-red-50 border border-red-200 rounded p-2">
            <div className="text-xs font-medium text-red-800 mb-0.5">
              Commentaire de retour
            </div>
            <div className="text-xs text-red-700">{rejectionComment}</div>
          </div>
        </div>
      )}

      {/* Upload section */}
      <div className="px-3 pb-3 flex items-center gap-2">
        <label className="flex-1">
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
              e.target.value = "";
            }}
            disabled={uploading}
          />
          <Button
            variant={
              status === "expected" || status === "rejected"
                ? "default"
                : "outline"
            }
            size="sm"
            className="w-full gap-2"
            disabled={uploading}
            asChild
          >
            <span className="cursor-pointer">
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileUp className="w-4 h-4" />
              )}
              {status === "expected"
                ? "Déposer le fichier"
                : "Nouvelle version"}
            </span>
          </Button>
        </label>

        {files.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowVersions(!showVersions)}
            className="gap-1"
          >
            <History className="w-4 h-4" />
            {files.length}
          </Button>
        )}
      </div>

      {/* Version history */}
      {showVersions && files.length > 0 && (
        <div className="border-t border-slate-100 px-3 py-2">
          <div className="text-xs font-medium text-slate-700 mb-1">
            Historique des versions
          </div>
          <div className="space-y-1">
            {files.map((f: any) => (
              <div
                key={f.id}
                className="flex items-center justify-between text-xs text-slate-600"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono">v{f.version}</span>
                  <span className="text-slate-400">•</span>
                  <span>{formatBytes(f.size_bytes)}</span>
                  <span className="text-slate-400">•</span>
                  <span>{formatDateTime(f.uploaded_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceSection({
  jobId,
  profile,
  billingProfile,
  approvedDeliverables,
  invoiceRequests,
  canRequestInvoice,
  hasPendingRequest,
  onRefresh,
}: {
  jobId: string;
  profile: PartnerProfile;
  billingProfile: any;
  approvedDeliverables: any[];
  invoiceRequests: any[];
  canRequestInvoice: boolean;
  hasPendingRequest: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [requesting, setRequesting] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");

  const billingStatus = String(billingProfile?.status ?? "pending");
  const isBillingValidated = billingStatus === "validated";
  const hasProfileComplete = profile.display_name && profile.rib_iban;
  const hasApproved = approvedDeliverables.length > 0;

  const approvedRoles = [
    ...new Set(approvedDeliverables.map((d: any) => String(d.role ?? ""))),
  ].filter(Boolean);

  const handleRequestInvoice = async () => {
    if (!selectedRole) return;
    setRequesting(true);
    try {
      await requestPartnerInvoice({ jobId, role: selectedRole });
      toast({ title: "Succès", description: "Demande de facture envoyée." });
      await onRefresh();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Eligibility checklist */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <h3 className="text-xs font-semibold text-slate-700 uppercase mb-2">
          Éligibilité facture
        </h3>
        <div className="space-y-1.5">
          <EligibilityItem
            checked={hasApproved}
            label="Livrable(s) validé(s)"
            detail={
              hasApproved
                ? `${approvedDeliverables.length} validé(s)`
                : "Aucun livrable validé"
            }
          />
          <EligibilityItem
            checked={hasProfileComplete}
            label="Profil complété"
            detail={hasProfileComplete ? "OK" : "Nom ou RIB manquant"}
            actionLabel={!hasProfileComplete ? "Compléter" : undefined}
            actionHref="/partners/profile"
          />
          <EligibilityItem
            checked={isBillingValidated}
            label="RIB validé par compta"
            detail={
              billingStatus === "validated"
                ? "Validé"
                : billingStatus === "rejected"
                  ? "Rejeté"
                  : "En attente de validation"
            }
          />
        </div>
      </div>

      {/* Request button or blocked message */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        {canRequestInvoice ? (
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-900">
              Demander une facture
            </div>
            <div className="flex items-center gap-2">
              <select
                className="flex-1 h-9 px-3 rounded-md border border-slate-200 text-sm bg-white"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
              >
                <option value="">Choisir un rôle...</option>
                {approvedRoles.map((role) => (
                  <option key={role} value={role}>
                    {role.toUpperCase()}
                  </option>
                ))}
              </select>
              <Button
                onClick={handleRequestInvoice}
                disabled={!selectedRole || requesting}
                className="gap-2"
              >
                {requesting && <Loader2 className="w-4 h-4 animate-spin" />}
                Appel à facture
              </Button>
            </div>
          </div>
        ) : hasPendingRequest ? (
          <div className="flex items-center gap-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
            <Clock className="w-5 h-5 text-blue-600" />
            <div>
              <div className="text-sm font-medium text-blue-800">
                Demande en cours
              </div>
              <div className="text-xs text-blue-700">
                Une demande de facture est déjà en traitement.
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-200">
            <AlertTriangle className="w-5 h-5 text-slate-400" />
            <div>
              <div className="text-sm font-medium text-slate-700">
                Non disponible
              </div>
              <div className="text-xs text-slate-500">
                Complétez les conditions ci-dessus pour demander une facture.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invoice history */}
      {invoiceRequests.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <h3 className="text-xs font-semibold text-slate-700 uppercase mb-2">
            Historique des demandes
          </h3>
          <div className="space-y-2">
            {invoiceRequests.map((req: any) => {
              const status = String(req.status ?? "");
              const cfg = INVOICE_STATUS_CONFIG[status] || {
                label: status,
                className: "bg-slate-100 text-slate-700",
              };
              return (
                <div
                  key={req.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-slate-700">
                      {String(req.role ?? "—").toUpperCase()}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDateTime(req.created_at)}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium",
                      cfg.className,
                    )}
                  >
                    {cfg.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EligibilityItem({
  checked,
  label,
  detail,
  actionLabel,
  actionHref,
}: {
  checked: boolean;
  label: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {checked ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "text-sm",
            checked ? "text-slate-900" : "text-slate-500",
          )}
        >
          {label}
        </span>
        <span className="text-xs text-slate-400 ml-1">({detail})</span>
      </div>
      {actionLabel && actionHref && (
        <Link
          to={actionHref}
          className="text-xs text-[#a3001d] hover:underline"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export default PartnerMissionDetails;
