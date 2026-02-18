import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  FileDown,
  FileText,
  Globe,
  Loader2,
  MessageCircle,
  Plus,
  QrCode,
  Save,
  UserCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Input } from "@/components/ui/input";
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
  approveAdminMediaBrief,
  createAdminMediaCheckinToken,
  createAdminMediaScheduleSlot,
  getAdminMediaFactoryJob,
  loadAdminApiKey,
  loadAdminSessionToken,
  reviewAdminDeliverable,
  updateAdminMediaFactoryJob,
  type AdminMediaFactoryJobDetails,
} from "@/lib/adminApi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { MediaJobStepper } from "@/components/mediaFactory/MediaJobStepper";
import {
  MediaDeliverableStatusBadge,
  MediaJobStatusBadge,
} from "@/components/mediaFactory/MediaStatusBadges";
import { formatDateTimeShort } from "@/components/mediaFactory/mediaFactoryStatus";
import {
  MediaMessagesPanel,
  type MediaThread,
  type MediaMessage,
  type ThreadParticipant,
  type CommunicationLog,
  type MessageTopic,
  type MessageRole,
  type AttachmentInput,
} from "@/components/mediaFactory/MediaMessagesPanel";

// Helper to convert File to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Get image dimensions
async function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return "(payload illisible)";
  }
}

function shortId(id: string): string {
  if (!id) return "";
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function AdminMediaFactoryJobDetailsPage() {
  const params = useParams();
  const navigate = useNavigate();

  const jobId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminMediaFactoryJobDetails | null>(null);

  const [briefReviewNote, setBriefReviewNote] = useState<string>("");
  const [approving, setApproving] = useState(false);
  const [creatingCheckin, setCreatingCheckin] = useState(false);
  const [lastCheckinToken, setLastCheckinToken] = useState<string | null>(null);

  // Create slot dialog
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [slotForm, setSlotForm] = useState({
    starts_at: "",
    ends_at: "",
    location_text: "",
  });
  const [creatingSlot, setCreatingSlot] = useState(false);

  // Review deliverable dialog
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{
    id: string;
    role: string;
  } | null>(null);
  const [reviewStatus, setReviewStatus] = useState<
    "in_review" | "approved" | "rejected"
  >("approved");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewing, setReviewing] = useState(false);

  // Change job status
  const [changingStatus, setChangingStatus] = useState(false);

  // Messages state
  const [thread, setThread] = useState<MediaThread | null>(null);
  const [messages, setMessages] = useState<MediaMessage[]>([]);
  const [participants, setParticipants] = useState<ThreadParticipant[]>([]);
  const [communicationLogs, setCommunicationLogs] = useState<
    CommunicationLog[]
  >([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);

  const refresh = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const res = await getAdminMediaFactoryJob(undefined, jobId);
      setData(res);
      setBriefReviewNote((res.brief?.review_note ?? "") as string);

      // Also load messages
      await loadThreadMessages();
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

  const loadThreadMessages = useCallback(async () => {
    if (!jobId) return;
    setLoadingMessages(true);
    try {
      // Get threads for this job
      const threadsRes = await fetch(
        `/api/admin/production/messages/threads?job_id=${jobId}`,
        {
          credentials: "omit",
          headers: getAdminHeaders(),
        },
      );
      const threadsData = await threadsRes.json();
      const jobThread = (threadsData.items ?? [])[0] as MediaThread | undefined;

      if (jobThread) {
        setThread(jobThread);

        // Load messages for this thread
        const msgRes = await fetch(
          `/api/admin/production/messages/threads/${jobThread.id}`,
          {
            credentials: "omit",
            headers: getAdminHeaders(),
          },
        );
        const msgData = await msgRes.json();
        setMessages(msgData.messages ?? []);
        setParticipants(msgData.participants ?? []);
        setCommunicationLogs(msgData.communication_logs ?? []);
      } else {
        // No thread yet
        setThread(null);
        setMessages([]);
        setParticipants([]);
        setCommunicationLogs([]);
      }
    } catch (e) {
      console.error("Failed to load thread messages:", e);
    } finally {
      setLoadingMessages(false);
    }
  }, [jobId]);

  const handleSendMessage = async (
    body: string,
    topic: MessageTopic,
    isInternal?: boolean,
    recipientRole?: MessageRole,
    attachments?: AttachmentInput[],
  ) => {
    if (!thread?.id) {
      toast({
        title: "Erreur",
        description: "Aucune conversation pour ce job",
        variant: "destructive",
      });
      return;
    }

    setSendingMessage(true);
    try {
      // If there are attachments, use the with-attachments endpoint
      if (attachments && attachments.length > 0) {
        const attachmentPayloads = await Promise.all(
          attachments.map(async (att) => {
            const base64Data = await fileToBase64(att.file);
            const dimensions = await getImageDimensions(att.file);
            return {
              base64Data,
              mimeType: att.file.type,
              originalName: att.file.name,
              width: dimensions?.width,
              height: dimensions?.height,
            };
          }),
        );

        const res = await fetch(
          `/api/admin/production/messages/threads/${thread.id}/with-attachments`,
          {
            method: "POST",
            credentials: "omit",
            headers: {
              "content-type": "application/json",
              ...getAdminHeaders(),
            },
            body: JSON.stringify({
              body,
              topic,
              is_internal: isInternal ?? false,
              recipient_role: recipientRole ?? "all",
              attachments: attachmentPayloads,
            }),
          },
        );
        if (!res.ok) throw new Error("Failed to send message");
      } else {
        const res = await fetch(
          `/api/admin/production/messages/threads/${thread.id}`,
          {
            method: "POST",
            credentials: "omit",
            headers: {
              "content-type": "application/json",
              ...getAdminHeaders(),
            },
            body: JSON.stringify({
              body,
              topic,
              is_internal: isInternal ?? false,
              recipient_role: recipientRole ?? "all",
              author_role: "rc",
            }),
          },
        );
        if (!res.ok) throw new Error("Failed to send message");
      }
      await loadThreadMessages();
    } catch (e) {
      toast({
        title: "Erreur",
        description: "Impossible d'envoyer le message",
        variant: "destructive",
      });
      throw e;
    } finally {
      setSendingMessage(false);
    }
  };

  const handleCloseThread = async (threadId: string) => {
    try {
      await fetch(`/api/admin/production/messages/threads/${threadId}/close`, {
        method: "POST",
        credentials: "omit",
        headers: getAdminHeaders(),
      });
      toast({ title: "Conversation clôturée" });
      await loadThreadMessages();
    } catch (e) {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleReopenThread = async (threadId: string) => {
    try {
      await fetch(`/api/admin/production/messages/threads/${threadId}/reopen`, {
        method: "POST",
        credentials: "omit",
        headers: getAdminHeaders(),
      });
      toast({ title: "Conversation rouverte" });
      await loadThreadMessages();
    } catch (e) {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleAddCommunicationLog = async (data: {
    channel: string;
    summary: string;
    next_action?: string;
    participants: string[];
  }) => {
    if (!jobId) return;

    try {
      const res = await fetch(
        `/api/admin/production/jobs/${jobId}/communication-logs`,
        {
          method: "POST",
          credentials: "omit",
          headers: {
            "content-type": "application/json",
            ...getAdminHeaders(),
          },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) throw new Error("Failed to add log");
      await loadThreadMessages();
    } catch (e) {
      toast({ title: "Erreur", variant: "destructive" });
      throw e;
    }
  };

  function getAdminHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const adminKey = loadAdminApiKey();
    const sessionToken = loadAdminSessionToken();
    if (adminKey) headers["x-admin-key"] = adminKey;
    if (sessionToken) headers["x-admin-session"] = sessionToken;
    return headers;
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const job = data?.job ?? null;
  const brief = data?.brief ?? null;

  const title = (job?.title as string | null) ?? "Job";

  const canApproveBrief = useMemo(() => {
    const bStatus = String((brief as any)?.status ?? "");
    return bStatus === "submitted";
  }, [brief]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/admin/production-media")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="text-xs text-slate-500">MEDIA FACTORY / Job</div>
            <div className="text-lg font-extrabold text-slate-900 truncate">
              {title}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <MediaJobStatusBadge status={(job as any)?.status ?? null} />
              <span className="text-xs text-slate-500 font-mono">
                {shortId(jobId)}
              </span>
              {job?.establishment_id ? (
                <span className="text-xs text-slate-500 font-mono">
                  eid: {shortId(String(job.establishment_id))}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
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
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={async () => {
              if (!jobId) return;
              setCreatingCheckin(true);
              try {
                const res = await createAdminMediaCheckinToken(
                  undefined,
                  jobId,
                );
                setLastCheckinToken(res.token);
                toast({
                  title: "QR Check-in",
                  description: "Token généré (copiez-le pour tester).",
                });
              } catch (e) {
                const msg = e instanceof Error ? e.message : "Erreur";
                toast({
                  title: "QR Check-in",
                  description: msg,
                  variant: "destructive",
                });
              } finally {
                setCreatingCheckin(false);
              }
            }}
            disabled={creatingCheckin}
          >
            <QrCode
              className={creatingCheckin ? "h-4 w-4 animate-pulse" : "h-4 w-4"}
            />
            Générer token
          </Button>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <a
              href={`/api/admin/production/jobs/${encodeURIComponent(jobId)}/brief.pdf?new_token=1`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileDown className="h-4 w-4" />
              PDF Brief
            </a>
          </Button>
        </div>
      </div>

      <MediaJobStepper status={(job as any)?.status ?? null} />

      {lastCheckinToken ? (
        <Card className="border-primary/20">
          <CardHeader className="py-3">
            <CardTitle className="text-sm text-primary">
              Token check-in (debug)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="text-xs text-slate-600">
              Token:{" "}
              <span className="font-mono text-slate-900">
                {lastCheckinToken}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              (Le QR/PDF public sera branché dans l'étape "PDF Brief + QR".)
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Brief</CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-3">
            {loading ? (
              <div className="text-sm text-slate-600">Chargement…</div>
            ) : null}

            {!loading && !brief ? (
              <div className="text-sm text-slate-600">Aucun brief.</div>
            ) : null}

            {brief ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs text-slate-600">Statut:</div>
                  <div className="text-xs font-semibold text-slate-900">
                    {String((brief as any).status ?? "—")}
                  </div>
                  <div className="text-xs text-slate-600">Soumis:</div>
                  <div className="text-xs text-slate-900">
                    {formatDateTimeShort((brief as any).submitted_at ?? null)}
                  </div>
                  <div className="text-xs text-slate-600">Validé:</div>
                  <div className="text-xs text-slate-900">
                    {formatDateTimeShort((brief as any).approved_at ?? null)}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="md:col-span-2">
                    <div className="text-xs font-semibold text-slate-700 mb-1">
                      Payload
                    </div>
                    <pre className="text-[11px] leading-4 bg-slate-50 border border-slate-200 rounded-md p-2 overflow-auto max-h-[260px]">
                      {prettyJson((brief as any).payload)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-700 mb-1">
                      Note RC
                    </div>
                    <Input
                      value={briefReviewNote}
                      onChange={(e) => setBriefReviewNote(e.target.value)}
                      placeholder="Commentaire (optionnel)"
                      className="h-9"
                    />
                    <Button
                      size="sm"
                      className="mt-2 w-full gap-2"
                      onClick={async () => {
                        if (!jobId) return;
                        setApproving(true);
                        try {
                          await approveAdminMediaBrief(undefined, jobId, {
                            review_note: briefReviewNote || null,
                          });
                          toast({
                            title: "Brief validé",
                            description: "Le job est passé en brief_approved.",
                          });
                          await refresh();
                        } catch (e) {
                          const msg = e instanceof Error ? e.message : "Erreur";
                          toast({
                            title: "Validation brief",
                            description: msg,
                            variant: "destructive",
                          });
                        } finally {
                          setApproving(false);
                        }
                      }}
                      disabled={!canApproveBrief || approving}
                    >
                      {approving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Valider le brief
                    </Button>
                    {!canApproveBrief ? (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Le brief doit être au statut{" "}
                        <span className="font-mono">submitted</span>.
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Résumé & Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            <div className="text-xs text-slate-600">
              Créé:{" "}
              <span className="text-slate-900">
                {formatDateTimeShort((job as any)?.created_at ?? null)}
              </span>
            </div>
            <div className="text-xs text-slate-600">
              Maj:{" "}
              <span className="text-slate-900">
                {formatDateTimeShort((job as any)?.updated_at ?? null)}
              </span>
            </div>
            {job?.order_id ? (
              <div className="text-xs text-slate-600">
                Order:{" "}
                <span className="font-mono text-slate-900">
                  {shortId(String(job.order_id))}
                </span>
              </div>
            ) : null}
            {job?.order_item_id ? (
              <div className="text-xs text-slate-600">
                Item:{" "}
                <span className="font-mono text-slate-900">
                  {shortId(String(job.order_item_id))}
                </span>
              </div>
            ) : null}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="text-[11px] text-slate-500">
                Changer statut job:
              </div>
              <Select
                value={String((job as any)?.status ?? "")}
                onValueChange={async (v) => {
                  if (!v || !jobId) return;
                  setChangingStatus(true);
                  try {
                    await updateAdminMediaFactoryJob(undefined, jobId, {
                      status: v,
                    });
                    toast({
                      title: "Statut mis à jour",
                      description: `Nouveau statut: ${v}`,
                    });
                    await refresh();
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : "Erreur";
                    toast({
                      title: "Statut",
                      description: msg,
                      variant: "destructive",
                    });
                  } finally {
                    setChangingStatus(false);
                  }
                }}
                disabled={changingStatus}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "paid_created",
                    "brief_pending",
                    "brief_submitted",
                    "brief_approved",
                    "scheduling",
                    "shoot_confirmed",
                    "checkin_pending",
                    "deliverables_expected",
                    "deliverables_submitted",
                    "deliverables_approved",
                    "editing",
                    "ready_delivery",
                    "scheduled_publish",
                    "delivered",
                    "closed",
                  ].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2">
                <Link
                  to="/admin/production-media"
                  className="text-xs text-primary font-semibold hover:underline"
                >
                  Revenir à la liste
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Créneaux proposés</CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 h-7 text-xs"
              onClick={() => setSlotDialogOpen(true)}
            >
              <Plus className="h-3 w-3" /> Ajouter
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Début</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Lieu</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.schedule_slots ?? []).length ? (
                  (data?.schedule_slots ?? []).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">
                        {formatDateTimeShort(s.starts_at)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDateTimeShort(s.ends_at)}
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {s.location_text ?? s.address ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {String(s.status ?? "—")}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-sm text-slate-600 py-6 text-center"
                    >
                      Aucun créneau.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

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
                  <TableHead className="text-end">V</TableHead>
                  <TableHead className="text-end">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.deliverables ?? []).length ? (
                  (data?.deliverables ?? []).map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs font-semibold">
                        {String(d.role ?? "—")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {String(d.deliverable_type ?? "—")}
                      </TableCell>
                      <TableCell className="text-xs">
                        <MediaDeliverableStatusBadge
                          status={String(d.status ?? "")}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-end font-mono">
                        {String(d.current_version ?? "0")}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs gap-1"
                          onClick={() => {
                            setReviewTarget({
                              id: d.id,
                              role: String(d.role ?? ""),
                            });
                            setReviewStatus("approved");
                            setReviewComment("");
                            setReviewDialogOpen(true);
                          }}
                        >
                          <UserCheck className="h-3 w-3" /> Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-sm text-slate-600 py-6 text-center"
                    >
                      Aucun livrable.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Publishing Section */}
      <PublishingSection job={job} jobId={jobId} onRefresh={refresh} />

      {/* Messages & Communication Section */}
      <Card>
        <CardHeader className="py-3">
          <SectionHeader
            title="Messages & Communication"
            description="Échangez avec le Pro et les partenaires assignés"
            icon={MessageCircle}
            titleClassName="text-sm"
          />
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="messages" className="w-full">
            <TabsList className="w-full justify-start rounded-none border-b px-3">
              <TabsTrigger value="messages" className="text-xs gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" />
                Messages ({messages.length})
              </TabsTrigger>
              <TabsTrigger value="logs" className="text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Journal ({communicationLogs.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="messages" className="m-0">
              {thread ? (
                <div className="h-[400px]">
                  <MediaMessagesPanel
                    userRole="admin"
                    threads={[thread]}
                    selectedThreadId={thread.id}
                    messages={messages}
                    participants={participants}
                    communicationLogs={communicationLogs}
                    loading={loadingMessages}
                    sending={sendingMessage}
                    onSelectThread={() => {}}
                    onSendMessage={handleSendMessage}
                    onRefresh={loadThreadMessages}
                    onCloseThread={handleCloseThread}
                    onReopenThread={handleReopenThread}
                    onAddCommunicationLog={handleAddCommunicationLog}
                    selectedThread={thread}
                    showInfoPanel={false}
                    compact={true}
                  />
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-slate-500">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Chargement...
                    </div>
                  ) : (
                    <>
                      <MessageCircle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p>Aucune conversation pour ce job.</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Une conversation sera créée automatiquement lors du
                        premier message.
                      </p>
                    </>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="logs" className="m-0">
              <div className="p-3 space-y-2 max-h-[400px] overflow-auto">
                {communicationLogs.length > 0 ? (
                  communicationLogs.map((log) => (
                    <div
                      key={log.id}
                      className="text-xs border border-slate-200 rounded-md px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px]">
                          {log.channel}
                        </Badge>
                        <span className="text-slate-500">
                          {formatDateTimeShort(log.log_date)}
                        </span>
                      </div>
                      <p className="text-slate-900">{log.summary}</p>
                      {log.next_action && (
                        <p className="text-slate-600 mt-1">
                          <span className="font-medium">Prochaine action:</span>{" "}
                          {log.next_action}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-slate-500">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p>Aucun log de communication.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Utilisez le panneau Messages pour ajouter un journal.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Create Slot Dialog */}
      <Dialog open={slotDialogOpen} onOpenChange={setSlotDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Créer un créneau</DialogTitle>
            <DialogDescription>
              Proposer une date/heure pour le shooting ou rendez-vous.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Début (ISO)</Label>
              <Input
                value={slotForm.starts_at}
                onChange={(e) =>
                  setSlotForm((p) => ({ ...p, starts_at: e.target.value }))
                }
                placeholder="2025-03-01T10:00"
              />
            </div>
            <div className="space-y-1">
              <Label>Fin (ISO)</Label>
              <Input
                value={slotForm.ends_at}
                onChange={(e) =>
                  setSlotForm((p) => ({ ...p, ends_at: e.target.value }))
                }
                placeholder="2025-03-01T12:00"
              />
            </div>
            <div className="space-y-1">
              <Label>Lieu</Label>
              <Input
                value={slotForm.location_text}
                onChange={(e) =>
                  setSlotForm((p) => ({ ...p, location_text: e.target.value }))
                }
                placeholder="Adresse / Nom du lieu"
              />
            </div>
            <Button
              className="w-full gap-2"
              onClick={async () => {
                if (!jobId || !slotForm.starts_at || !slotForm.ends_at) {
                  toast({
                    title: "Slot",
                    description: "Début et fin requis",
                    variant: "destructive",
                  });
                  return;
                }
                setCreatingSlot(true);
                try {
                  await createAdminMediaScheduleSlot(undefined, jobId, {
                    starts_at: slotForm.starts_at,
                    ends_at: slotForm.ends_at,
                    location_text: slotForm.location_text || null,
                  });
                  toast({ title: "Créneau créé" });
                  setSlotDialogOpen(false);
                  setSlotForm({
                    starts_at: "",
                    ends_at: "",
                    location_text: "",
                  });
                  await refresh();
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "Erreur";
                  toast({
                    title: "Slot",
                    description: msg,
                    variant: "destructive",
                  });
                } finally {
                  setCreatingSlot(false);
                }
              }}
              disabled={creatingSlot}
            >
              {creatingSlot ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4" />
              )}
              Créer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Deliverable Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review livrable</DialogTitle>
            <DialogDescription>
              Approuver ou rejeter le livrable {reviewTarget?.role}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Décision</Label>
              <Select
                value={reviewStatus}
                onValueChange={(v) => setReviewStatus(v as any)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approuvé</SelectItem>
                  <SelectItem value="rejected">Rejeté</SelectItem>
                  <SelectItem value="in_review">En revue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Commentaire (optionnel)</Label>
              <Input
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Remarques..."
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="flex-1 gap-2"
                variant={
                  reviewStatus === "rejected" ? "destructive" : "default"
                }
                onClick={async () => {
                  if (!reviewTarget) return;
                  setReviewing(true);
                  try {
                    await reviewAdminDeliverable(undefined, reviewTarget.id, {
                      status: reviewStatus,
                      review_comment: reviewComment || null,
                    });
                    toast({
                      title: "Livrable review",
                      description: `Statut: ${reviewStatus}`,
                    });
                    setReviewDialogOpen(false);
                    await refresh();
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : "Erreur";
                    toast({
                      title: "Review",
                      description: msg,
                      variant: "destructive",
                    });
                  } finally {
                    setReviewing(false);
                  }
                }}
                disabled={reviewing}
              >
                {reviewing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : reviewStatus === "approved" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Valider
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Publishing Section Component
function PublishingSection(props: {
  job: any;
  jobId: string;
  onRefresh: () => Promise<void>;
}) {
  const { job, jobId, onRefresh } = props;
  const [saving, setSaving] = useState(false);

  const [publishDate, setPublishDate] = useState("");
  const [publishTime, setPublishTime] = useState("");
  const [links, setLinks] = useState({
    instagram: "",
    facebook: "",
    tiktok: "",
    youtube: "",
    snapchat: "",
    caption: "",
    hashtags: "",
    cta: "",
  });

  // Initialize from job data
  useEffect(() => {
    if (job?.scheduled_publish_at) {
      const dt = new Date(job.scheduled_publish_at);
      setPublishDate(dt.toISOString().split("T")[0]);
      setPublishTime(dt.toTimeString().slice(0, 5));
    }
    if (job?.published_links && typeof job.published_links === "object") {
      const pl = job.published_links as Record<string, string>;
      setLinks({
        instagram: pl.instagram ?? "",
        facebook: pl.facebook ?? "",
        tiktok: pl.tiktok ?? "",
        youtube: pl.youtube ?? "",
        snapchat: pl.snapchat ?? "",
        caption: pl.caption ?? "",
        hashtags: pl.hashtags ?? "",
        cta: pl.cta ?? "",
      });
    }
  }, [job]);

  const handleSave = async () => {
    if (!jobId) return;
    setSaving(true);
    try {
      const scheduled_publish_at =
        publishDate && publishTime
          ? new Date(`${publishDate}T${publishTime}`).toISOString()
          : publishDate
            ? new Date(`${publishDate}T12:00`).toISOString()
            : null;

      const published_links = {
        instagram: links.instagram || null,
        facebook: links.facebook || null,
        tiktok: links.tiktok || null,
        youtube: links.youtube || null,
        snapchat: links.snapchat || null,
        caption: links.caption || null,
        hashtags: links.hashtags || null,
        cta: links.cta || null,
      };

      await updateAdminMediaFactoryJob(undefined, jobId, {
        scheduled_publish_at,
        published_links,
      } as any);

      toast({
        title: "Publication",
        description: "Informations de publication sauvegardées.",
      });
      await onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({ title: "Publication", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isPublishReady = [
    "ready_delivery",
    "scheduled_publish",
    "delivered",
    "closed",
  ].includes(String(job?.status ?? ""));

  return (
    <Card>
      <CardHeader className="py-3">
        <SectionHeader
          title="Publication & Réseaux sociaux"
          description="Planifiez la date de publication et archivez les liens vers les posts publiés."
          icon={Globe}
          titleClassName="text-sm"
        />
      </CardHeader>
      <CardContent className="p-3 space-y-4">
        {!isPublishReady ? (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600">
            Cette section sera activée quand le job atteindra le statut{" "}
            <span className="font-mono">ready_delivery</span>.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date de publication</Label>
                <Input
                  type="date"
                  value={publishDate}
                  onChange={(e) => setPublishDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Heure</Label>
                <Input
                  type="time"
                  value={publishTime}
                  onChange={(e) => setPublishTime(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="flex items-end">
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Sauvegarder
                </Button>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">
                Liens des publications
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Instagram</Label>
                  <Input
                    value={links.instagram}
                    onChange={(e) =>
                      setLinks((p) => ({ ...p, instagram: e.target.value }))
                    }
                    placeholder="https://instagram.com/p/..."
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Facebook</Label>
                  <Input
                    value={links.facebook}
                    onChange={(e) =>
                      setLinks((p) => ({ ...p, facebook: e.target.value }))
                    }
                    placeholder="https://facebook.com/..."
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">TikTok</Label>
                  <Input
                    value={links.tiktok}
                    onChange={(e) =>
                      setLinks((p) => ({ ...p, tiktok: e.target.value }))
                    }
                    placeholder="https://tiktok.com/@.../video/..."
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">YouTube</Label>
                  <Input
                    value={links.youtube}
                    onChange={(e) =>
                      setLinks((p) => ({ ...p, youtube: e.target.value }))
                    }
                    placeholder="https://youtube.com/watch?v=..."
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Snapchat</Label>
                  <Input
                    value={links.snapchat}
                    onChange={(e) =>
                      setLinks((p) => ({ ...p, snapchat: e.target.value }))
                    }
                    placeholder="https://snapchat.com/..."
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">
                Contenu
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Caption</Label>
                  <Input
                    value={links.caption}
                    onChange={(e) =>
                      setLinks((p) => ({ ...p, caption: e.target.value }))
                    }
                    placeholder="Découvrez ce lieu incroyable..."
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Hashtags</Label>
                    <Input
                      value={links.hashtags}
                      onChange={(e) =>
                        setLinks((p) => ({ ...p, hashtags: e.target.value }))
                      }
                      placeholder="#maroc #restaurant #sortiraumaroc"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">CTA</Label>
                    <Input
                      value={links.cta}
                      onChange={(e) =>
                        setLinks((p) => ({ ...p, cta: e.target.value }))
                      }
                      placeholder="Réservez maintenant sur sam.ma"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
