import { useState, useEffect, useCallback } from "react";
import { MessageCircle, Loader2, Info } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { toast } from "@/hooks/use-toast";
import {
  MediaMessagesPanel,
  type MediaThread,
  type MediaMessage,
  type ThreadParticipant,
  type CommunicationLog,
  type MessageTopic,
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
import type { Establishment, ProRole } from "@/lib/pro/types";
import { proSupabase } from "@/lib/pro/supabase";

async function getAccessToken(): Promise<string> {
  const { data, error } = await proSupabase.auth.getSession();
  if (error || !data.session) throw new Error("Non authentifié");
  return data.session.access_token;
}

type Props = {
  establishment: Establishment;
  role: ProRole;
};

export function ProMediaMessagesTab({ establishment }: Props) {
  const [threads, setThreads] = useState<MediaThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MediaMessage[]>([]);
  const [participants, setParticipants] = useState<ThreadParticipant[]>([]);
  const [communicationLogs, setCommunicationLogs] = useState<
    CommunicationLog[]
  >([]);
  const [selectedThread, setSelectedThread] = useState<MediaThread | null>(
    null,
  );

  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // Load threads for this establishment
  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `/api/pro/establishments/${establishment.id}/media/messages/threads`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error("Erreur de chargement");
      const data = await res.json();
      setThreads(data.items ?? []);
    } catch {
      toast({ title: "Erreur de chargement", variant: "destructive" });
    } finally {
      setLoadingThreads(false);
    }
  }, [establishment.id]);

  // Load messages for selected thread
  const loadMessages = useCallback(
    async (threadId: string) => {
      setLoadingMessages(true);
      try {
        const token = await getAccessToken();
        const res = await fetch(
          `/api/pro/establishments/${establishment.id}/media/messages/threads/${threadId}`,
          { headers: { authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error("Erreur de chargement");
        const data = await res.json();
        setMessages(data.messages ?? []);
        setParticipants(data.participants ?? []);
        setCommunicationLogs(data.communication_logs ?? []);
        setSelectedThread(data.thread ?? null);

        // Mark thread as read explicitly
        await fetch(
          `/api/pro/establishments/${establishment.id}/media/messages/threads/${threadId}/read`,
          { method: "POST", headers: { authorization: `Bearer ${token}` } },
        ).catch(() => {}); // Best effort, ignore errors
      } catch {
        toast({ title: "Erreur de chargement", variant: "destructive" });
      } finally {
        setLoadingMessages(false);
      }
    },
    [establishment.id],
  );

  // Send message (PRO → RC only)
  const handleSendMessage = async (
    body: string,
    topic: MessageTopic,
    _isInternal?: boolean,
    _recipientRole?: unknown,
    attachments?: AttachmentInput[],
  ) => {
    if (!selectedThreadId) return;

    setSending(true);
    try {
      const token = await getAccessToken();

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
          `/api/pro/establishments/${establishment.id}/media/messages/threads/${selectedThreadId}/with-attachments`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              body,
              topic,
              attachments: attachmentPayloads,
            }),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erreur d'envoi");
        }
      } else {
        const res = await fetch(
          `/api/pro/establishments/${establishment.id}/media/messages/threads/${selectedThreadId}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ body, topic }),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erreur d'envoi");
        }
      }
      // Reload messages
      await loadMessages(selectedThreadId);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible d'envoyer",
        variant: "destructive",
      });
      throw e;
    } finally {
      setSending(false);
    }
  };

  // Select thread
  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    loadMessages(threadId);
  };

  // Initial load
  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <SectionHeader
            title="Messages Media Factory"
            description="Échangez avec votre Responsable Client pour le suivi de vos productions vidéo"
            icon={MessageCircle}
          />
        </CardHeader>
        <CardContent>
          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 mb-4 flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <strong>Communication contrôlée :</strong> Tous vos messages sont
              envoyés au Responsable Client de la mission. Vous ne communiquez
              pas directement avec les prestataires (caméraman, monteur, etc.).
            </div>
          </div>

          {threads.length === 0 && !loadingThreads ? (
            <div className="text-center py-12 text-slate-500">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Aucune conversation active</p>
              <p className="text-sm mt-1">
                Dès qu'une mission Media Factory est créée, vous pourrez
                échanger avec votre Responsable Client ici.
              </p>
            </div>
          ) : (
            <MediaMessagesPanel
              userRole="pro"
              threads={threads}
              selectedThreadId={selectedThreadId ?? undefined}
              messages={messages}
              participants={participants}
              communicationLogs={communicationLogs}
              loading={loadingThreads || loadingMessages}
              sending={sending}
              onSelectThread={handleSelectThread}
              onSendMessage={handleSendMessage}
              onRefresh={loadThreads}
              selectedThread={selectedThread ?? undefined}
              showInfoPanel={true}
              compact={false}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ProMediaMessagesTab;
