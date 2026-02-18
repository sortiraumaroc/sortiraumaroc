import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Loader2, LogOut, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

import {
  getPartnerMission,
  getPartnerMe,
  listPartnerMissions,
  requestPartnerInvoice,
  uploadPartnerDeliverableFile,
  type PartnerMissionListItem,
  type PartnerMissionDetails,
} from "@/lib/pro/api";

import {
  MediaDeliverableStatusBadge,
  MediaJobStatusBadge,
} from "@/components/mediaFactory/MediaStatusBadges";
import { formatDateTimeShort } from "@/components/mediaFactory/mediaFactoryStatus";

type Props = {
  user: User;
  onSignOut: () => Promise<void>;
};

function shortId(id: string): string {
  if (!id) return "";
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function PartnerShell(props: Props) {
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  const [profile, setProfile] = useState<any>(null);
  const [missions, setMissions] = useState<PartnerMissionListItem[]>([]);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<PartnerMissionDetails | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await listPartnerMissions();
      setMissions(res.items ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({ title: "Partner", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      setProfileLoading(true);
      try {
        const me = await getPartnerMe();
        setProfile(me.profile ?? null);
      } catch {
        setProfile(null);
      } finally {
        setProfileLoading(false);
      }
      await refresh();
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.user.id]);

  const openJob = async (jobId: string) => {
    setSelectedJobId(jobId);
    setDetailsLoading(true);
    try {
      const res = await getPartnerMission({ jobId });
      setDetails(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({ title: "Mission", description: msg, variant: "destructive" });
      setSelectedJobId(null);
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const groupedByJob = useMemo(() => {
    const map = new Map<string, PartnerMissionListItem[]>();
    for (const row of missions) {
      const jobId = String((row as any).job_id ?? "");
      if (!jobId) continue;
      const arr = map.get(jobId) ?? [];
      arr.push(row);
      map.set(jobId, arr);
    }
    return [...map.entries()].map(([jobId, deliverables]) => ({
      jobId,
      deliverables,
    }));
  }, [missions]);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">Portail PARTNER</div>
            <div className="text-lg font-extrabold text-slate-900">
              MEDIA FACTORY
            </div>
            <div className="text-[11px] text-slate-500">
              Connecté:{" "}
              <span className="font-mono">
                {props.user.email ?? shortId(props.user.id)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Rafraîchir"
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={async () => {
                await props.onSignOut();
              }}
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <SectionHeader
              title="Profil partenaire"
              description="Raccourci pour vérifier que votre profil est bien activé côté back-office."
              titleClassName="text-sm"
            />
          </CardHeader>
          <CardContent className="p-3">
            {profileLoading ? (
              <div className="text-sm text-slate-600">
                <Loader2 className="inline h-4 w-4 animate-spin me-2" />
                Chargement…
              </div>
            ) : profile ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <div className="text-[11px] text-slate-500">Rôle</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {String(profile.role ?? "—")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Statut</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {String(profile.status ?? "—")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Ville</div>
                  <div className="text-sm text-slate-900">
                    {String(profile.city ?? "—")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Nom affiché</div>
                  <div className="text-sm text-slate-900">
                    {String(profile.display_name ?? "—")}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-600">
                Aucun profil partenaire. (Il doit être créé côté admin.)
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <SectionHeader
              title="Missions"
              description="Une mission existe dès qu'un livrable vous est assigné."
              titleClassName="text-sm"
            />
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Titre</TableHead>
                  <TableHead>Statut job</TableHead>
                  <TableHead>Livrables assignés</TableHead>
                  <TableHead className="text-end">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-slate-600"
                    >
                      <Loader2 className="inline h-4 w-4 animate-spin me-2" />
                      Chargement…
                    </TableCell>
                  </TableRow>
                ) : groupedByJob.length ? (
                  groupedByJob.map(({ jobId, deliverables }) => {
                    const job = (deliverables[0] as any)?.media_jobs;
                    return (
                      <TableRow key={jobId}>
                        <TableCell className="text-xs font-mono">
                          {shortId(jobId)}
                        </TableCell>
                        <TableCell className="text-sm font-semibold text-slate-900">
                          {String(job?.title ?? "(sans titre)")}
                        </TableCell>
                        <TableCell className="text-sm">
                          <MediaJobStatusBadge
                            status={String(job?.status ?? "")}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">
                          {deliverables.length}
                        </TableCell>
                        <TableCell className="text-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openJob(jobId)}
                          >
                            Ouvrir
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-slate-600"
                    >
                      Aucune mission.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog
          open={!!selectedJobId}
          onOpenChange={(v) => {
            if (!v) {
              setSelectedJobId(null);
              setDetails(null);
            }
          }}
        >
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>Mission</DialogTitle>
              <DialogDescription>
                {selectedJobId ? `Job ${shortId(selectedJobId)}` : ""}
              </DialogDescription>
            </DialogHeader>

            {detailsLoading ? (
              <div className="py-10 text-center text-sm text-slate-600">
                <Loader2 className="inline h-4 w-4 animate-spin me-2" />
                Chargement…
              </div>
            ) : details ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Livrables</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rôle</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Version</TableHead>
                          <TableHead className="text-end">Upload</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(details.deliverables ?? []).map((d: any) => (
                          <PartnerDeliverableRow
                            key={d.id}
                            deliverable={d}
                            onUploaded={async () => {
                              if (!selectedJobId) return;
                              const res = await getPartnerMission({
                                jobId: selectedJobId,
                              });
                              setDetails(res);
                            }}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <PartnerInvoiceSection
                  details={details}
                  selectedJobId={selectedJobId}
                  onRefresh={async () => {
                    if (!selectedJobId) return;
                    const res = await getPartnerMission({
                      jobId: selectedJobId,
                    });
                    setDetails(res);
                  }}
                />

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">
                      Historique fichiers
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Deliverable</TableHead>
                          <TableHead>Version</TableHead>
                          <TableHead>Taille</TableHead>
                          <TableHead>Upload</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(details.files ?? []).length ? (
                          (details.files ?? []).map((f: any) => (
                            <TableRow key={f.id}>
                              <TableCell className="text-xs font-mono">
                                {shortId(String(f.deliverable_id ?? ""))}
                              </TableCell>
                              <TableCell className="text-xs font-mono">
                                v{String(f.version ?? "?")}
                              </TableCell>
                              <TableCell className="text-xs text-slate-700">
                                {typeof f.size_bytes === "number"
                                  ? `${Math.round(f.size_bytes / 1024)} KB`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-slate-700">
                                {formatDateTimeShort(f.uploaded_at ?? null)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="py-8 text-center text-sm text-slate-600"
                            >
                              Aucun fichier.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function PartnerDeliverableRow(props: {
  deliverable: any;
  onUploaded: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);

  return (
    <TableRow>
      <TableCell className="text-xs font-semibold">
        {String(props.deliverable.role ?? "—")}
      </TableCell>
      <TableCell className="text-xs">
        {String(props.deliverable.deliverable_type ?? "—")}
      </TableCell>
      <TableCell className="text-xs">
        <MediaDeliverableStatusBadge
          status={String(props.deliverable.status ?? "")}
        />
      </TableCell>
      <TableCell className="text-xs font-mono">
        v{String(props.deliverable.current_version ?? 0)}
      </TableCell>
      <TableCell className="text-end">
        <label className="inline-flex items-center gap-2">
          <input
            type="file"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                await uploadPartnerDeliverableFile({
                  deliverableId: String(props.deliverable.id),
                  file,
                });
                toast({ title: "Upload", description: "Fichier envoyé." });
                await props.onUploaded();
              } catch (err) {
                const msg = err instanceof Error ? err.message : "Erreur";
                toast({
                  title: "Upload",
                  description: msg,
                  variant: "destructive",
                });
              } finally {
                setUploading(false);
                e.target.value = "";
              }
            }}
            disabled={uploading}
          />
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Envoyer
          </Button>
        </label>
      </TableCell>
    </TableRow>
  );
}

function PartnerInvoiceSection(props: {
  details: PartnerMissionDetails;
  selectedJobId: string | null;
  onRefresh: () => Promise<void>;
}) {
  const { details, selectedJobId } = props;
  const [requesting, setRequesting] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");

  // BUSINESS GUARDS for invoice button visibility
  const billingStatus = String((details.billing_profile as any)?.status ?? "");
  const isBillingValidated = billingStatus === "validated";

  // Check if partner has any approved deliverables
  const approvedDeliverables = (details.deliverables ?? []).filter(
    (d: any) => d.status === "approved",
  );
  const hasApprovedDeliverable = approvedDeliverables.length > 0;

  // Get unique roles from approved deliverables
  const approvedRoles = [
    ...new Set(approvedDeliverables.map((d: any) => String(d.role ?? ""))),
  ].filter(Boolean);

  // Can request invoice only if billing is validated AND has at least one approved deliverable
  const canRequestInvoice = isBillingValidated && hasApprovedDeliverable;

  // Build explanation for why button is disabled
  const getBlockReason = (): string | null => {
    if (!isBillingValidated && !hasApprovedDeliverable) {
      return "Profil de facturation non validé ET aucun livrable approuvé.";
    }
    if (!isBillingValidated) {
      return "Votre profil de facturation (RIB) doit être validé par la comptabilité.";
    }
    if (!hasApprovedDeliverable) {
      return "Au moins un de vos livrables doit être approuvé par le RC.";
    }
    return null;
  };

  const blockReason = getBlockReason();

  return (
    <Card>
      <CardHeader className="py-3">
        <SectionHeader
          title="Facturation partenaire"
          description="Demande possible uniquement si un livrable est validé ET votre profil RIB est vérifié."
          titleClassName="text-sm"
        />
      </CardHeader>
      <CardContent className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-[11px] text-slate-500">Statut RIB</div>
            <div
              className={`text-sm font-semibold ${isBillingValidated ? "text-green-700" : "text-amber-700"}`}
            >
              {billingStatus || "Non soumis"}
              {isBillingValidated ? " ✓" : ""}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">
              Livrables approuvés
            </div>
            <div
              className={`text-sm font-semibold ${hasApprovedDeliverable ? "text-green-700" : "text-amber-700"}`}
            >
              {approvedDeliverables.length} /{" "}
              {(details.deliverables ?? []).length}
              {hasApprovedDeliverable ? " ✓" : ""}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Demandes en cours</div>
            <div className="text-xs text-slate-700">
              {(details.invoice_requests ?? []).length
                ? (details.invoice_requests ?? [])
                    .slice(-3)
                    .map((x: any) => `${x.role}:${x.status}`)
                    .join(" · ")
                : "Aucune"}
            </div>
          </div>
        </div>

        {canRequestInvoice ? (
          <div className="mt-4 flex items-center gap-2">
            <select
              className="h-9 px-3 rounded-md border border-slate-200 text-sm"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              <option value="">Choisir un rôle...</option>
              {approvedRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              className="gap-2"
              disabled={!selectedRole || requesting}
              onClick={async () => {
                if (!selectedJobId || !selectedRole) return;
                setRequesting(true);
                try {
                  await requestPartnerInvoice({
                    jobId: selectedJobId,
                    role: selectedRole,
                  });
                  toast({
                    title: "Demande envoyée",
                    description: "Votre demande de facture a été enregistrée.",
                  });
                  await props.onRefresh();
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "Erreur";
                  toast({
                    title: "Facturation",
                    description: msg,
                    variant: "destructive",
                  });
                } finally {
                  setRequesting(false);
                }
              }}
            >
              {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Demander facture
            </Button>
          </div>
        ) : (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <div className="text-sm font-semibold text-amber-800">
              Demande non disponible
            </div>
            <div className="text-xs text-amber-700 mt-1">{blockReason}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
