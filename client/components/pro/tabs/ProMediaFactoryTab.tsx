import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Calendar,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  MessageCircle,
  Pencil,
  Save,
  Send,
  Video,
} from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

import type { Establishment, ProRole } from "@/lib/pro/types";
import {
  getProMediaJob,
  listProMediaJobs,
  saveProMediaBriefDraft,
  selectProMediaScheduleSlot,
  submitProMediaBrief,
  type ProMediaJobDetails,
  type ProMediaJobListItem,
} from "@/lib/pro/api";

import {
  MediaJobStatusBadge,
  MediaDeliverableStatusBadge,
} from "@/components/mediaFactory/MediaStatusBadges";
import { MediaJobStepper } from "@/components/mediaFactory/MediaJobStepper";
import { BriefFormRenderer } from "@/components/mediaFactory/BriefFormRenderer";
import {
  formatDateTimeShort,
  getBriefTemplateForUniverse,
} from "@/components/mediaFactory/mediaFactoryStatus";
import { Badge } from "@/components/ui/badge";
import { proSupabase } from "@/lib/pro/supabase";

type MediaMessage = {
  id: string;
  body: string;
  author_role: string;
  topic: string;
  is_system: boolean;
  created_at: string;
};

type MediaThread = {
  id: string;
  status: string;
};
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

function shortId(id: string): string {
  if (!id) return "";
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function ProMediaFactoryTab(props: Props) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ProMediaJobListItem[]>([]);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobDetails, setJobDetails] = useState<ProMediaJobDetails | null>(null);

  const [brief, setBrief] = useState<Record<string, string>>({});
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectingSlot, setSelectingSlot] = useState<string | null>(null);

  // Messaging state
  const [thread, setThread] = useState<MediaThread | null>(null);
  const [threadMessages, setThreadMessages] = useState<MediaMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [messageTopic, setMessageTopic] = useState("general");

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await listProMediaJobs({
        establishmentId: props.establishment.id,
      });
      setItems(res.items ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({
        title: "MEDIA FACTORY",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.establishment.id]);

  // Load thread messages for the job
  const loadThreadMessages = useCallback(async () => {
    if (!selectedJobId) return;
    setLoadingMessages(true);
    try {
      const { data: session } = await proSupabase.auth.getSession();
      if (!session?.session?.access_token) return;

      const res = await fetch(
        `/api/pro/establishments/${props.establishment.id}/media/messages/threads?job_id=${selectedJobId}`,
        {
          headers: { authorization: `Bearer ${session.session.access_token}` },
        },
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      const threads = data.items ?? [];

      if (threads.length > 0) {
        const threadData = threads[0];
        setThread(threadData);

        // Load messages for this thread
        const msgRes = await fetch(
          `/api/pro/establishments/${props.establishment.id}/media/messages/threads/${threadData.id}`,
          {
            headers: {
              authorization: `Bearer ${session.session.access_token}`,
            },
          },
        );
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          setThreadMessages(msgData.messages ?? []);
        }
      } else {
        setThread(null);
        setThreadMessages([]);
      }
    } catch {
      setThread(null);
      setThreadMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, [selectedJobId, props.establishment.id]);

  // Send message to RC
  const handleSendMessage = async () => {
    if (!thread?.id || !messageBody.trim()) return;

    setSendingMessage(true);
    try {
      const { data: session } = await proSupabase.auth.getSession();
      if (!session?.session?.access_token) throw new Error("Non authentifié");

      const res = await fetch(
        `/api/pro/establishments/${props.establishment.id}/media/messages/threads/${thread.id}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            body: messageBody.trim(),
            topic: messageTopic,
          }),
        },
      );
      if (!res.ok) throw new Error("Erreur d'envoi");

      setMessageBody("");
      await loadThreadMessages();
      toast({
        title: "Message envoyé",
        description: "Votre message a été transmis au Responsable Client.",
      });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible d'envoyer",
        variant: "destructive",
      });
    } finally {
      setSendingMessage(false);
    }
  };

  // Load messages when job is opened
  useEffect(() => {
    if (selectedJobId && jobDetails) {
      loadThreadMessages();
    }
  }, [selectedJobId, jobDetails, loadThreadMessages]);

  const openJob = async (jobId: string) => {
    setSelectedJobId(jobId);
    setJobLoading(true);
    try {
      const res = await getProMediaJob({
        establishmentId: props.establishment.id,
        jobId,
      });
      setJobDetails(res);
      const payload = (res.brief?.payload ?? {}) as Record<string, unknown>;
      // Initialize brief with template fields + any existing data
      const template = getBriefTemplateForUniverse(
        props.establishment.universe,
      );
      const initialBrief: Record<string, string> = {};
      for (const field of template.fields) {
        initialBrief[field.key] = String(payload[field.key] ?? "");
      }
      setBrief(initialBrief);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({
        title: "MEDIA FACTORY",
        description: msg,
        variant: "destructive",
      });
      setSelectedJobId(null);
      setJobDetails(null);
    } finally {
      setJobLoading(false);
    }
  };

  const refreshJobDetails = async () => {
    if (!selectedJobId) return;
    try {
      const res = await getProMediaJob({
        establishmentId: props.establishment.id,
        jobId: selectedJobId,
      });
      setJobDetails(res);
    } catch (e) {
      // Silent refresh error
    }
  };

  const canEditBrief = useMemo(() => {
    const jobStatus = String((jobDetails?.job as any)?.status ?? "");
    return jobStatus === "brief_pending" || jobStatus === "brief_submitted";
  }, [jobDetails]);

  const canSubmitBrief = useMemo(() => {
    const jobStatus = String((jobDetails?.job as any)?.status ?? "");
    const briefStatus = String((jobDetails?.brief as any)?.status ?? "draft");
    return (
      (jobStatus === "brief_pending" || jobStatus === "brief_submitted") &&
      (briefStatus === "draft" ||
        briefStatus === "needs_more" ||
        briefStatus === "")
    );
  }, [jobDetails]);

  // Get universe-specific brief template
  const briefTemplate = useMemo(() => {
    return getBriefTemplateForUniverse(props.establishment.universe);
  }, [props.establishment.universe]);

  const canSelectSlot = useMemo(() => {
    const jobStatus = String((jobDetails?.job as any)?.status ?? "");
    // Allow selection when in scheduling phase and no confirmed appointment yet
    return jobStatus === "scheduling" && !jobDetails?.appointment;
  }, [jobDetails]);

  const proposedSlots = useMemo(() => {
    return (jobDetails?.schedule_slots ?? []).filter(
      (s: any) => s.status === "proposed" || s.status === "available",
    );
  }, [jobDetails]);

  const confirmedAppointment = jobDetails?.appointment;

  const deliverables = jobDetails?.deliverables ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader
            title="MEDIA FACTORY"
            description="Suivi production: brief, planning, check-in, livrables."
            icon={Video}
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Titre</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Créé</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-sm text-slate-600"
                  >
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                    Chargement…
                  </TableCell>
                </TableRow>
              ) : items.length ? (
                items.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="text-xs font-mono">
                      {shortId(j.id)}
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-slate-900">
                      {j.title ?? "(sans titre)"}
                    </TableCell>
                    <TableCell className="text-sm">
                      <MediaJobStatusBadge status={j.status} />
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {formatDateTimeShort(j.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => void openJob(j.id)}
                      >
                        <Pencil className="h-4 w-4" />
                        Ouvrir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-sm text-slate-600"
                  >
                    Aucun job MEDIA FACTORY pour cet établissement.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="p-3 border-t border-slate-200 flex items-center justify-between">
            <div className="text-[11px] text-slate-500">
              {items.length} job(s)
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading}
            >
              Rafraîchir
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!selectedJobId}
        onOpenChange={(v) => {
          if (!v) {
            setSelectedJobId(null);
            setJobDetails(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              MEDIA FACTORY
              {jobDetails?.job?.status ? (
                <MediaJobStatusBadge status={(jobDetails.job as any).status} />
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {jobDetails?.job?.title
                ? String(jobDetails.job.title)
                : selectedJobId
                  ? `Job ${shortId(selectedJobId)}`
                  : ""}
            </DialogDescription>
          </DialogHeader>

          {jobLoading ? (
            <div className="py-10 text-center text-sm text-slate-600">
              <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
              Chargement du job…
            </div>
          ) : jobDetails ? (
            <div className="space-y-4">
              <MediaJobStepper
                status={(jobDetails.job as any).status ?? null}
              />

              {/* Brief Section */}
              <Card>
                <CardHeader className="py-3">
                  <SectionHeader
                    title="Brief (client)"
                    description="Renseignez et soumettez votre brief. La planification est bloquée tant que le brief n'est pas validé."
                  />
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {/* Formulaire de brief avec sections */}
                  <BriefFormRenderer
                    template={briefTemplate}
                    values={brief}
                    onChange={(key, value) =>
                      setBrief((p) => ({ ...p, [key]: value }))
                    }
                    disabled={!canEditBrief}
                  />

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-3 pt-4 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={async () => {
                        if (!selectedJobId) return;
                        setSavingDraft(true);
                        try {
                          await saveProMediaBriefDraft({
                            establishmentId: props.establishment.id,
                            jobId: selectedJobId,
                            payload: brief,
                          });
                          toast({
                            title: "Brief sauvegardé",
                            description: "Brouillon enregistré.",
                          });
                          await refreshJobDetails();
                        } catch (e) {
                          const msg =
                            e instanceof Error ? e.message : "Erreur";
                          toast({
                            title: "Brief",
                            description: msg,
                            variant: "destructive",
                          });
                        } finally {
                          setSavingDraft(false);
                        }
                      }}
                      disabled={!canEditBrief || savingDraft}
                    >
                      {savingDraft ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Sauvegarder le brouillon
                    </Button>

                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={async () => {
                        if (!selectedJobId) return;
                        setSubmitting(true);
                        try {
                          await submitProMediaBrief({
                            establishmentId: props.establishment.id,
                            jobId: selectedJobId,
                            payload: brief,
                          });
                          toast({
                            title: "Brief envoyé",
                            description: "En attente de validation par le Responsable Client.",
                          });
                          await refreshJobDetails();
                          await refresh();
                        } catch (e) {
                          const msg =
                            e instanceof Error ? e.message : "Erreur";
                          toast({
                            title: "Envoi brief",
                            description: msg,
                            variant: "destructive",
                          });
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                      disabled={!canSubmitBrief || submitting}
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Soumettre le brief
                    </Button>

                    {!canSubmitBrief ? (
                      <div className="text-xs text-slate-500">
                        Le brief est verrouillé après validation.
                      </div>
                    ) : null}
                  </div>

                  {/* Statut */}
                  <div className="text-xs text-slate-500 pt-2 border-t">
                    Statut brief:{" "}
                    <Badge variant="outline" className="ml-1">
                      {String((jobDetails.brief as any)?.status ?? "draft")}
                    </Badge>
                    {jobDetails.brief?.submitted_at ? (
                      <span className="ml-2">
                        Soumis le{" "}
                        {formatDateTimeShort(
                          (jobDetails.brief as any).submitted_at,
                        )}
                      </span>
                    ) : null}
                    {(jobDetails.brief as any)?.approved_at ? (
                      <span className="ml-2 text-emerald-600">
                        ✓ Validé le{" "}
                        {formatDateTimeShort(
                          (jobDetails.brief as any).approved_at,
                        )}
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              {/* Dossier info card */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-1">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Dossier</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2">
                    <div className="text-xs text-slate-600">
                      Job:{" "}
                      <span className="font-mono text-slate-900">
                        {shortId(String(jobDetails.job.id))}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      Créé:{" "}
                      <span className="text-slate-900">
                        {formatDateTimeShort(
                          (jobDetails.job as any).created_at ?? null,
                        )}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      Maj:{" "}
                      <span className="text-slate-900">
                        {formatDateTimeShort(
                          (jobDetails.job as any).updated_at ?? null,
                        )}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Scheduling Section */}
              <Card>
                <CardHeader className="py-3">
                  <SectionHeader
                    title="Planning shooting"
                    description={confirmedAppointment
                      ? "Rendez-vous confirmé."
                      : canSelectSlot
                        ? "Sélectionnez un créneau parmi ceux proposés par le RC."
                        : "Le planning sera débloqué après validation du brief."}
                    icon={Calendar}
                  />
                </CardHeader>
                <CardContent className="p-0">
                  {confirmedAppointment ? (
                    <div className="p-4 bg-green-50 border-b border-green-100">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span className="font-semibold text-green-800">
                          Rendez-vous confirmé
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-xs text-slate-600">Début</div>
                          <div className="font-medium text-slate-900">
                            {formatDateTimeShort(
                              (confirmedAppointment as any).starts_at,
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-600">Fin</div>
                          <div className="font-medium text-slate-900">
                            {formatDateTimeShort(
                              (confirmedAppointment as any).ends_at,
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-600">Lieu</div>
                          <div className="font-medium text-slate-900">
                            {(confirmedAppointment as any).address ||
                              (confirmedAppointment as any).location_text ||
                              "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {!confirmedAppointment && proposedSlots.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Début</TableHead>
                          <TableHead>Fin</TableHead>
                          <TableHead>Lieu</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {proposedSlots.map((slot: any) => (
                          <TableRow key={slot.id}>
                            <TableCell className="text-sm">
                              {formatDateTimeShort(slot.starts_at)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatDateTimeShort(slot.ends_at)}
                            </TableCell>
                            <TableCell className="text-sm text-slate-700">
                              {slot.location_text || slot.address || "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="default"
                                className="gap-2"
                                onClick={async () => {
                                  if (!selectedJobId) return;
                                  setSelectingSlot(slot.id);
                                  try {
                                    await selectProMediaScheduleSlot({
                                      establishmentId: props.establishment.id,
                                      jobId: selectedJobId,
                                      slotId: slot.id,
                                    });
                                    toast({
                                      title: "Créneau sélectionné",
                                      description:
                                        "Le rendez-vous est confirmé.",
                                    });
                                    await refreshJobDetails();
                                    await refresh();
                                  } catch (e) {
                                    const msg =
                                      e instanceof Error ? e.message : "Erreur";
                                    toast({
                                      title: "Slot",
                                      description: msg,
                                      variant: "destructive",
                                    });
                                  } finally {
                                    setSelectingSlot(null);
                                  }
                                }}
                                disabled={!canSelectSlot || !!selectingSlot}
                              >
                                {selectingSlot === slot.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                                Choisir
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : null}

                  {!confirmedAppointment && proposedSlots.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-600">
                      {canSelectSlot
                        ? "Aucun créneau proposé pour le moment. Patientez que le RC ajoute des disponibilités."
                        : "Les créneaux seront visibles après validation du brief par le RC."}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {/* Deliverables Section */}
              <Card>
                <CardHeader className="py-3">
                  <SectionHeader
                    title="Livrables"
                    description="Consultez l'avancement des livrables (photos, vidéos, montages). La validation finale est gérée par le RC."
                    icon={Eye}
                  />
                </CardHeader>
                <CardContent className="p-0">
                  {deliverables.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rôle</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Version</TableHead>
                          <TableHead>Commentaire</TableHead>
                          <TableHead className="text-right">Fichier</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deliverables.map((d: any) => (
                          <TableRow key={d.id}>
                            <TableCell className="text-sm font-semibold">
                              {String(d.role ?? "—")}
                            </TableCell>
                            <TableCell className="text-sm">
                              {String(d.deliverable_type ?? "—")}
                            </TableCell>
                            <TableCell className="text-sm">
                              <MediaDeliverableStatusBadge
                                status={String(d.status ?? "")}
                              />
                            </TableCell>
                            <TableCell className="text-sm font-mono text-center">
                              {String(d.current_version ?? "0")}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 max-w-[200px] truncate">
                              {d.review_comment || "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {d.file_url ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2 h-7 text-xs"
                                  asChild
                                >
                                  <a
                                    href={d.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Download className="h-3 w-3" /> Télécharger
                                  </a>
                                </Button>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  —
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-6 text-center text-sm text-slate-600">
                      Aucun livrable pour le moment.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Messages Section */}
              <Card>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-[#a3001d]" />
                      Messages
                    </CardTitle>
                    {thread && (
                      <Badge variant="outline" className="text-[10px]">
                        {thread.status === "open"
                          ? "Conversation ouverte"
                          : "Conversation fermée"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Échangez avec votre Responsable Client. Vous ne communiquez
                    pas directement avec les prestataires.
                  </p>
                </CardHeader>
                <CardContent className="p-3 space-y-3">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    </div>
                  ) : (
                    <>
                      {/* Messages list */}
                      <div className="max-h-[250px] overflow-auto space-y-2 p-2 bg-slate-50 rounded-lg border">
                        {threadMessages.length > 0 ? (
                          threadMessages.map((msg) => {
                            if (msg.is_system) {
                              return (
                                <div key={msg.id} className="text-center">
                                  <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                                    {msg.body}
                                  </span>
                                </div>
                              );
                            }
                            const isOwn = msg.author_role === "pro";
                            return (
                              <div
                                key={msg.id}
                                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                              >
                                <div
                                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${isOwn ? "bg-[#a3001d] text-white" : "bg-white border text-slate-900"}`}
                                >
                                  <div className="flex items-center gap-1 mb-1">
                                    <span className="text-[10px] font-medium opacity-80">
                                      {msg.author_role === "pro"
                                        ? "Vous"
                                        : msg.author_role === "rc"
                                          ? "Responsable Client"
                                          : msg.author_role}
                                    </span>
                                  </div>
                                  <p className="whitespace-pre-wrap">
                                    {msg.body}
                                  </p>
                                  <span
                                    className={`text-[10px] ${isOwn ? "text-white/70" : "text-slate-400"}`}
                                  >
                                    {new Date(
                                      msg.created_at,
                                    ).toLocaleDateString("fr-FR", {
                                      day: "2-digit",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-6 text-slate-500 text-sm">
                            <MessageCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            Aucun message pour cette mission.
                          </div>
                        )}
                      </div>

                      {/* Send message form */}
                      {thread?.status === "open" && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Select
                              value={messageTopic}
                              onValueChange={setMessageTopic}
                            >
                              <SelectTrigger className="h-8 w-32 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="general">Général</SelectItem>
                                <SelectItem value="scheduling">
                                  Planification
                                </SelectItem>
                                <SelectItem value="deliverables">
                                  Livrables
                                </SelectItem>
                                <SelectItem value="billing">
                                  Facturation
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <span className="text-xs text-slate-500">
                              Tous vos messages vont au RC
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Textarea
                              value={messageBody}
                              onChange={(e) => setMessageBody(e.target.value)}
                              placeholder="Votre message au Responsable Client..."
                              className="min-h-[60px] text-sm"
                            />
                            <Button
                              onClick={handleSendMessage}
                              disabled={!messageBody.trim() || sendingMessage}
                              className="self-end bg-[#a3001d] hover:bg-[#8a0019]"
                            >
                              {sendingMessage ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Send className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                      {thread?.status === "closed" && (
                        <div className="text-center py-3 text-sm text-slate-500 bg-slate-50 rounded-lg">
                          Cette conversation est clôturée.
                        </div>
                      )}
                      {!thread && threadMessages.length === 0 && (
                        <div className="text-center py-3 text-xs text-slate-500">
                          La conversation sera disponible une fois la mission
                          démarrée.
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
