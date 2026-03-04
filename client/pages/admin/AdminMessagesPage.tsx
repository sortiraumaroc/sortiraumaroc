import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageCircle, Loader2, RefreshCw, Filter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminVisibilityNav } from "@/pages/admin/visibility/AdminVisibilityNav";
import {
  MediaMessagesPanel,
  type MediaThread,
  type MediaMessage,
  type ThreadParticipant,
  type CommunicationLog,
  type MessageTopic,
  type MessageRole,
  type AttachmentInput,
  type QuickReplyTemplate,
} from "@/components/mediaFactory/MediaMessagesPanel";

// Helper to convert File to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/png;base64,")
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
import { loadAdminApiKey, loadAdminSessionToken } from "@/lib/adminApi";

async function fetchAdmin(path: string, options?: RequestInit) {
  const adminKey = loadAdminApiKey();
  const sessionToken = loadAdminSessionToken();

  const res = await fetch(path, {
    ...options,
    credentials: "omit",
    headers: {
      ...options?.headers,
      ...(adminKey ? { "x-admin-key": adminKey } : {}),
      ...(sessionToken ? { "x-admin-session": sessionToken } : {}),
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function AdminMessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [threads, setThreads] = useState<MediaThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    searchParams.get("thread") || null,
  );
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
  const [quickReplies, setQuickReplies] = useState<QuickReplyTemplate[]>([]);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Load quick reply templates
  const loadQuickReplies = useCallback(async () => {
    try {
      const data = await fetchAdmin("/api/admin/production/quick-replies");
      setQuickReplies(data.items ?? []);
    } catch {
      // Silent fail - quick replies are optional
    }
  }, []);

  // Load threads
  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus && filterStatus !== "all") {
        params.set("status", filterStatus);
      }
      const url = `/api/admin/production/messages/threads${params.toString() ? `?${params}` : ""}`;
      const data = await fetchAdmin(url);
      setThreads(data.items ?? []);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setLoadingThreads(false);
    }
  }, [filterStatus]);

  // Load messages for selected thread
  const loadMessages = useCallback(async (threadId: string) => {
    setLoadingMessages(true);
    try {
      const data = await fetchAdmin(
        `/api/admin/production/messages/threads/${threadId}`,
      );
      setMessages(data.messages ?? []);
      setParticipants(data.participants ?? []);
      setCommunicationLogs(data.communication_logs ?? []);
      setSelectedThread(data.thread ?? null);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Send message (Admin/RC can send to anyone)
  const handleSendMessage = async (
    body: string,
    topic: MessageTopic,
    isInternal?: boolean,
    recipientRole?: MessageRole,
    attachments?: AttachmentInput[],
  ) => {
    if (!selectedThreadId) return;

    setSending(true);
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

        await fetchAdmin(
          `/api/admin/production/messages/threads/${selectedThreadId}/with-attachments`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              body,
              topic,
              is_internal: isInternal ?? false,
              recipient_role: recipientRole ?? "all",
              attachments: attachmentPayloads,
            }),
          },
        );
      } else {
        await fetchAdmin(
          `/api/admin/production/messages/threads/${selectedThreadId}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              body,
              topic,
              is_internal: isInternal ?? false,
              recipient_role: recipientRole ?? "all",
              author_role: "rc", // Admin messages appear as RC
            }),
          },
        );
      }
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

  // Close thread
  const handleCloseThread = async (threadId: string) => {
    try {
      await fetchAdmin(
        `/api/admin/production/messages/threads/${threadId}/close`,
        {
          method: "POST",
        },
      );
      toast({ title: "Conversation clôturée" });
      loadThreads();
      if (selectedThreadId === threadId) {
        loadMessages(threadId);
      }
    } catch (e) {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  // Reopen thread
  const handleReopenThread = async (threadId: string) => {
    try {
      await fetchAdmin(
        `/api/admin/production/messages/threads/${threadId}/reopen`,
        {
          method: "POST",
        },
      );
      toast({ title: "Conversation rouverte" });
      loadThreads();
      if (selectedThreadId === threadId) {
        loadMessages(threadId);
      }
    } catch (e) {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  // Add communication log
  const handleAddCommunicationLog = async (data: {
    channel: string;
    summary: string;
    next_action?: string;
    participants: string[];
  }) => {
    if (!selectedThread?.job_id) return;

    try {
      await fetchAdmin(
        `/api/admin/production/jobs/${selectedThread.job_id}/communication-logs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      // Reload messages to see the system message
      if (selectedThreadId) {
        await loadMessages(selectedThreadId);
      }
    } catch (e) {
      toast({ title: "Erreur", variant: "destructive" });
      throw e;
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
    loadQuickReplies();
  }, [loadThreads, loadQuickReplies]);

  // Load messages if thread is in URL
  useEffect(() => {
    const threadId = searchParams.get("thread");
    if (threadId && threads.length > 0) {
      const exists = threads.find((t) => t.id === threadId);
      if (exists) {
        setSelectedThreadId(threadId);
        loadMessages(threadId);
      }
    }
  }, [searchParams, threads, loadMessages]);

  // Filter threads by search
  const filteredThreads = threads.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const estName = t.media_jobs?.establishments?.name?.toLowerCase() ?? "";
    const jobTitle = t.media_jobs?.title?.toLowerCase() ?? "";
    return estName.includes(q) || jobTitle.includes(q);
  });

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Media Factory"
        description="Messages - Conversations des productions vidéo"
      />

      <AdminVisibilityNav />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Filtres :</span>
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="open">Ouverts</SelectItem>
            <SelectItem value="closed">Fermés</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher..."
            className="h-8 w-48 text-xs ps-3 pe-8"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => loadThreads()}
          disabled={loadingThreads}
          className="h-8 text-xs"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 me-1.5 ${loadingThreads ? "animate-spin" : ""}`}
          />
          Actualiser
        </Button>

        <div className="ms-auto flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {filteredThreads.length} conversation
            {filteredThreads.length > 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-slate-600">
            {threads.filter((t) => t.status === "open").length} ouvertes
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          <span className="text-slate-600">
            {threads.filter((t) => t.status === "closed").length} fermées
          </span>
        </div>
      </div>

      {/* Messages Panel */}
      <div className="h-[calc(100vh-280px)] min-h-[500px]">
        <MediaMessagesPanel
          userRole="admin"
          threads={filteredThreads}
          selectedThreadId={selectedThreadId ?? undefined}
          messages={messages}
          participants={participants}
          communicationLogs={communicationLogs}
          quickReplies={quickReplies}
          loading={loadingThreads || loadingMessages}
          sending={sending}
          onSelectThread={handleSelectThread}
          onSendMessage={handleSendMessage}
          onRefresh={loadThreads}
          onCloseThread={handleCloseThread}
          onReopenThread={handleReopenThread}
          onAddCommunicationLog={handleAddCommunicationLog}
          selectedThread={selectedThread ?? undefined}
          showInfoPanel={true}
        />
      </div>
    </div>
  );
}

export default AdminMessagesPage;
