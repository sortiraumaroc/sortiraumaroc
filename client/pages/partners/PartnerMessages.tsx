import { useState, useEffect, useCallback } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { MessageCircle, Loader2, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  MediaMessagesPanel,
  type MediaThread,
  type MediaMessage,
  type ThreadParticipant,
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
import type { PartnerProfile } from "@/components/partner/PartnerLayout";

type OutletContext = {
  profile: PartnerProfile;
  refreshProfile: () => void;
};

async function getAccessToken(): Promise<string> {
  const { proSupabase } = await import("@/lib/pro/supabase");
  const { data, error } = await proSupabase.auth.getSession();
  if (error || !data.session) throw new Error("Non authentifié");
  return data.session.access_token;
}

export function PartnerMessages() {
  const { profile } = useOutletContext<OutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [threads, setThreads] = useState<MediaThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    searchParams.get("thread") || null,
  );
  const [messages, setMessages] = useState<MediaMessage[]>([]);
  const [participants, setParticipants] = useState<ThreadParticipant[]>([]);
  const [selectedThread, setSelectedThread] = useState<MediaThread | null>(
    null,
  );

  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // Load threads
  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/partners/messages/threads", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setThreads(data.items ?? []);
    } catch {
      toast({ title: "Erreur de chargement", variant: "destructive" });
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  // Load messages for selected thread
  const loadMessages = useCallback(async (threadId: string) => {
    setLoadingMessages(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/partners/messages/threads/${threadId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages(data.messages ?? []);
      setParticipants(data.participants ?? []);
      setSelectedThread(data.thread ?? null);

      // Mark thread as read explicitly
      await fetch(`/api/partners/messages/threads/${threadId}/read`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => {}); // Best effort, ignore errors
    } catch {
      toast({ title: "Erreur de chargement", variant: "destructive" });
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Send message
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
          `/api/partners/messages/threads/${selectedThreadId}/with-attachments`,
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
          throw new Error(data.error || "Erreur");
        }
      } else {
        const res = await fetch(
          `/api/partners/messages/threads/${selectedThreadId}`,
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
          throw new Error(data.error || "Erreur");
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
    setSearchParams({ thread: threadId });
    loadMessages(threadId);
  };

  // Initial load
  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Load messages if thread or job is in URL
  useEffect(() => {
    if (threads.length === 0) return;

    const threadId = searchParams.get("thread");
    const jobId = searchParams.get("job");

    // First priority: direct thread ID
    if (threadId) {
      const exists = threads.find((t) => t.id === threadId);
      if (exists) {
        setSelectedThreadId(threadId);
        loadMessages(threadId);
        return;
      }
    }

    // Second priority: find thread for the job
    if (jobId) {
      const jobThread = threads.find((t) => t.job_id === jobId);
      if (jobThread) {
        setSelectedThreadId(jobThread.id);
        setSearchParams({ thread: jobThread.id });
        loadMessages(jobThread.id);
        return;
      }
    }

    // Default: select first thread if none selected
    if (!selectedThreadId && threads.length > 0) {
      const firstThread = threads[0];
      setSelectedThreadId(firstThread.id);
      loadMessages(firstThread.id);
    }
  }, [searchParams, threads, loadMessages, selectedThreadId, setSearchParams]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#a3001d]/10 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-[#a3001d]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Messages</h1>
            <p className="text-sm text-slate-500">
              Échangez avec le Responsable Client
            </p>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        <strong>Important :</strong> Tous vos messages sont envoyés au
        Responsable Client de la mission. Vous ne pouvez pas contacter
        directement le client PRO.
      </div>

      {/* Messages Panel */}
      <MediaMessagesPanel
        userRole="partner"
        threads={threads}
        selectedThreadId={selectedThreadId ?? undefined}
        messages={messages}
        participants={participants}
        loading={loadingThreads || loadingMessages}
        sending={sending}
        onSelectThread={handleSelectThread}
        onSendMessage={handleSendMessage}
        onRefresh={loadThreads}
        selectedThread={selectedThread ?? undefined}
        showInfoPanel={true}
      />
    </div>
  );
}

export default PartnerMessages;
