import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  MessageCircle,
  Send,
  User,
  Building2,
  Clock,
  ChevronRight,
  FileText,
  Phone,
  Mail,
  Video,
  Users,
  Lock,
  X,
  Plus,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  CheckCheck,
  Paperclip,
  Image as ImageIcon,
  File,
  Download,
  Trash2,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

// Types
export type MessageRole = "pro" | "partner" | "rc" | "admin";
export type MessageTopic =
  | "general"
  | "scheduling"
  | "deliverables"
  | "billing";

export interface MediaThread {
  id: string;
  job_id: string;
  status: "open" | "closed" | "archived";
  created_at: string;
  unread_count?: number;
  message_count?: number;
  media_jobs?: {
    id: string;
    title: string;
    status: string;
    responsible_admin_id?: string;
    establishments?: {
      id?: string;
      name: string;
      city?: string;
    };
  };
}

export interface ReadReceipt {
  user_id: string;
  read_at: string;
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  bucket: string;
  path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  width?: number;
  height?: number;
  url?: string;
}

export interface MediaMessage {
  id: string;
  thread_id: string;
  sender_type: string;
  sender_user_id?: string;
  sender_admin_id?: string;
  author_role: MessageRole;
  recipient_role?: string;
  body: string;
  topic: MessageTopic;
  is_internal: boolean;
  is_system: boolean;
  attachments?: MessageAttachment[];
  created_at: string;
  read_receipts?: ReadReceipt[];
}

export interface ThreadParticipant {
  user_id: string;
  role: MessageRole;
  can_write?: boolean;
  partner_profiles?: {
    display_name?: string;
    avatar_url?: string;
    primary_role?: string;
  };
}

export interface CommunicationLog {
  id: string;
  job_id: string;
  channel: string;
  summary: string;
  next_action?: string;
  participants: string[];
  log_date: string;
  created_at: string;
}

// Attachment input for upload
export interface AttachmentInput {
  file: File;
  previewUrl?: string;
}

// Quick reply template
export interface QuickReplyTemplate {
  id: string;
  code: string;
  label: string;
  body: string;
  category: MessageTopic;
  variables?: string[];
  is_active: boolean;
}

// Props
interface MediaMessagesPanelProps {
  userRole: MessageRole;
  threads: MediaThread[];
  selectedThreadId?: string;
  messages: MediaMessage[];
  participants: ThreadParticipant[];
  communicationLogs?: CommunicationLog[];
  quickReplies?: QuickReplyTemplate[];
  loading?: boolean;
  sending?: boolean;
  onSelectThread: (threadId: string) => void;
  onSendMessage: (
    body: string,
    topic: MessageTopic,
    isInternal?: boolean,
    recipientRole?: MessageRole,
    attachments?: AttachmentInput[],
  ) => Promise<void>;
  onRefresh?: () => void;
  onCloseThread?: (threadId: string) => void;
  onReopenThread?: (threadId: string) => void;
  onAddCommunicationLog?: (data: {
    channel: string;
    summary: string;
    next_action?: string;
    participants: string[];
  }) => Promise<void>;
  selectedThread?: MediaThread;
  showInfoPanel?: boolean;
  compact?: boolean;
}

const ROLE_LABELS: Record<MessageRole, string> = {
  pro: "Client Pro",
  partner: "Partenaire",
  rc: "Responsable Client",
  admin: "SuperAdmin",
};

const ROLE_COLORS: Record<MessageRole, string> = {
  pro: "bg-blue-100 text-blue-800",
  partner: "bg-emerald-100 text-emerald-800",
  rc: "bg-[#a3001d] text-white",
  admin: "bg-slate-800 text-white",
};

const TOPIC_LABELS: Record<MessageTopic, string> = {
  general: "Général",
  scheduling: "Planification",
  deliverables: "Livrables",
  billing: "Facturation",
};

const CHANNEL_ICONS: Record<string, typeof Phone> = {
  phone: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: Users,
  other: FileText,
};

const CHANNEL_LABELS: Record<string, string> = {
  phone: "Appel téléphonique",
  whatsapp: "WhatsApp",
  email: "Email",
  meeting: "Réunion",
  other: "Autre",
};

// Attachment validation constants (matching server-side)
const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];
const ALLOWED_EXTENSIONS = ".jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.pdf";

function getInitials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Read Receipt Indicator Component
function ReadReceiptIndicator({ receipts }: { receipts?: ReadReceipt[] }) {
  if (!receipts || receipts.length === 0) {
    // Not read yet - single check
    return (
      <span
        className="text-[10px] text-slate-300 flex items-center gap-0.5"
        title="Envoyé"
      >
        <CheckCircle2 className="w-3 h-3" />
      </span>
    );
  }

  // Find the most recent read
  const sortedReceipts = [...receipts].sort(
    (a, b) => new Date(b.read_at).getTime() - new Date(a.read_at).getTime(),
  );
  const lastRead = sortedReceipts[0];

  if (!lastRead) {
    return null;
  }

  const readAt = new Date(lastRead.read_at);
  const timeStr = format(readAt, "HH:mm", { locale: fr });
  const dateStr = format(readAt, "dd/MM", { locale: fr });

  // Format: "Vu • DD/MM • HH:mm"
  const displayTime = `Vu • ${dateStr} • ${timeStr}`;

  return (
    <span
      className="text-[10px] text-slate-400 flex items-center gap-0.5"
      title={`Vu par ${receipts.length} personne(s)`}
    >
      <CheckCheck className="w-3 h-3" />
      {displayTime}
    </span>
  );
}

export function MediaMessagesPanel({
  userRole,
  threads,
  selectedThreadId,
  messages,
  participants,
  communicationLogs = [],
  quickReplies = [],
  loading = false,
  sending = false,
  onSelectThread,
  onSendMessage,
  onRefresh,
  onCloseThread,
  onReopenThread,
  onAddCommunicationLog,
  selectedThread,
  showInfoPanel = true,
  compact = false,
}: MediaMessagesPanelProps) {
  const [messageBody, setMessageBody] = useState("");
  const [messageTopic, setMessageTopic] = useState<MessageTopic>("general");
  const [isInternal, setIsInternal] = useState(false);
  const [recipientRole, setRecipientRole] = useState<MessageRole | "all">(
    "all",
  );
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [logForm, setLogForm] = useState({
    channel: "phone",
    summary: "",
    next_action: "",
    participants: "",
  });
  const [logSaving, setLogSaving] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    AttachmentInput[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const hasContent = messageBody.trim() || pendingAttachments.length > 0;
    if (!hasContent || sending) return;

    try {
      await onSendMessage(
        messageBody.trim(),
        messageTopic,
        isInternal,
        recipientRole === "all" ? undefined : recipientRole,
        pendingAttachments.length > 0 ? pendingAttachments : undefined,
      );
      setMessageBody("");
      setMessageTopic("general");
      setIsInternal(false);
      // Clear attachments and their preview URLs
      pendingAttachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
      setPendingAttachments([]);
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible d'envoyer le message",
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const errors: string[] = [];
    const newAttachments: AttachmentInput[] = [];

    // Check max files limit
    const totalCount = pendingAttachments.length + files.length;
    if (totalCount > MAX_ATTACHMENTS_PER_MESSAGE) {
      toast({
        title: "Limite atteinte",
        description: `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} fichiers par message`,
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate mime type
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        errors.push(
          `${file.name}: Type non autorisé (images et PDF uniquement)`,
        );
        continue;
      }

      // Validate file size
      if (file.size > MAX_ATTACHMENT_SIZE) {
        errors.push(`${file.name}: Taille > 15 MB`);
        continue;
      }

      // Create preview URL for images
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;
      newAttachments.push({ file, previewUrl });
    }

    if (errors.length > 0) {
      toast({
        title: "Fichiers ignorés",
        description: errors.join("\n"),
        variant: "destructive",
      });
    }

    if (newAttachments.length > 0) {
      setPendingAttachments((prev) => [...prev, ...newAttachments]);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments((prev) => {
      const att = prev[index];
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return ImageIcon;
    if (mimeType.startsWith("video/")) return Video;
    return File;
  };

  const handleAddLog = async () => {
    if (!logForm.summary.trim() || !onAddCommunicationLog) return;

    setLogSaving(true);
    try {
      await onAddCommunicationLog({
        channel: logForm.channel,
        summary: logForm.summary.trim(),
        next_action: logForm.next_action.trim() || undefined,
        participants: logForm.participants
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      });
      setShowLogDialog(false);
      setLogForm({
        channel: "phone",
        summary: "",
        next_action: "",
        participants: "",
      });
      toast({ title: "Journal ajouté" });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally {
      setLogSaving(false);
    }
  };

  const canSendInternal = userRole === "rc" || userRole === "admin";
  const canSelectRecipient = userRole === "rc" || userRole === "admin";
  const canManageThread = userRole === "admin";
  const canUseQuickReplies =
    (userRole === "rc" || userRole === "admin") && quickReplies.length > 0;

  // Group quick replies by category
  const quickRepliesByCategory = useMemo(() => {
    const grouped: Record<string, QuickReplyTemplate[]> = {};
    for (const qr of quickReplies.filter((q) => q.is_active)) {
      const cat = qr.category || "general";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(qr);
    }
    return grouped;
  }, [quickReplies]);

  // Find the last message sent by the current user (for read receipt display)
  const lastOwnMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.is_system) continue;
      const isOwn =
        (userRole === "admin" && msg.sender_type === "admin") ||
        (userRole === "rc" && msg.author_role === "rc") ||
        (userRole === "pro" && msg.author_role === "pro") ||
        (userRole === "partner" && msg.author_role === "partner");
      if (isOwn) return msg.id;
    }
    return null;
  }, [messages, userRole]);

  const handleQuickReplySelect = (template: QuickReplyTemplate) => {
    // Insert template body into message input
    setMessageBody(template.body);
    setMessageTopic(template.category);
    setShowQuickReplies(false);
  };

  return (
    <div
      className={cn(
        "flex h-full bg-white rounded-lg border border-slate-200 overflow-hidden",
        compact ? "min-h-[400px]" : "min-h-[600px]",
      )}
    >
      {/* LEFT: Thread List */}
      <div className="w-72 border-e border-slate-200 flex flex-col">
        <div className="p-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Conversations
          </h3>
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1">
          {loading && threads.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Chargement...
            </div>
          ) : threads.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              Aucune conversation.
              <br />
              <span className="text-xs text-slate-400">
                Dès qu'une mission est active, une conversation est disponible
                ici.
              </span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {threads.map((thread) => {
                const job = thread.media_jobs;
                const est = job?.establishments;
                const isSelected = thread.id === selectedThreadId;
                const hasUnread = (thread.unread_count ?? 0) > 0;

                return (
                  <button
                    key={thread.id}
                    onClick={() => onSelectThread(thread.id)}
                    className={cn(
                      "w-full p-3 text-start hover:bg-slate-50 transition-colors",
                      isSelected && "bg-slate-100",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 truncate">
                            {est?.name ?? "Sans établissement"}
                          </span>
                          {hasUnread && (
                            <span className="flex-shrink-0 min-w-5 h-5 px-1 rounded-full bg-[#a3001d] text-white text-[10px] font-bold flex items-center justify-center">
                              {(thread.unread_count ?? 0) > 99
                                ? "99+"
                                : thread.unread_count}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {job?.title ?? "Mission"}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0",
                              thread.status === "open"
                                ? "border-emerald-300 text-emerald-700"
                                : "border-slate-300 text-slate-500",
                            )}
                          >
                            {thread.status === "open" ? "Ouvert" : "Fermé"}
                          </Badge>
                          {(thread.message_count ?? 0) > 0 && (
                            <span className="text-[10px] text-slate-400">
                              {thread.message_count} msg
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* CENTER: Conversation */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedThreadId ? (
          <>
            {/* Thread Header */}
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-slate-600" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-slate-900 truncate">
                    {selectedThread?.media_jobs?.establishments?.name ??
                      "Conversation"}
                  </h4>
                  <p className="text-xs text-slate-500 truncate">
                    {selectedThread?.media_jobs?.title ?? ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canManageThread &&
                  selectedThread?.status === "open" &&
                  onCloseThread && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onCloseThread(selectedThreadId)}
                      className="text-xs h-7"
                    >
                      <Lock className="w-3 h-3 me-1" />
                      Clôturer
                    </Button>
                  )}
                {canManageThread &&
                  selectedThread?.status === "closed" &&
                  onReopenThread && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onReopenThread(selectedThreadId)}
                      className="text-xs h-7"
                    >
                      Rouvrir
                    </Button>
                  )}
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg) => {
                  const isOwnMessage =
                    (userRole === "admin" && msg.sender_type === "admin") ||
                    (userRole === "rc" && msg.author_role === "rc") ||
                    (userRole === "pro" && msg.author_role === "pro") ||
                    (userRole === "partner" && msg.author_role === "partner");

                  if (msg.is_system) {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <div className="bg-slate-100 text-slate-600 text-xs px-3 py-1.5 rounded-full max-w-md text-center">
                          {msg.body}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-3",
                        isOwnMessage && "flex-row-reverse",
                      )}
                    >
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarFallback
                          className={ROLE_COLORS[msg.author_role]}
                        >
                          {msg.author_role === "pro"
                            ? "P"
                            : msg.author_role === "partner"
                              ? "PT"
                              : msg.author_role === "rc"
                                ? "RC"
                                : "A"}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={cn(
                          "max-w-[70%] space-y-1",
                          isOwnMessage && "items-end",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-700">
                            {ROLE_LABELS[msg.author_role]}
                          </span>
                          {msg.is_internal && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1 py-0 border-amber-300 text-amber-700"
                            >
                              Interne
                            </Badge>
                          )}
                          {msg.topic !== "general" && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1 py-0"
                            >
                              {TOPIC_LABELS[msg.topic]}
                            </Badge>
                          )}
                        </div>
                        <div
                          className={cn(
                            "rounded-lg px-3 py-2 text-sm",
                            isOwnMessage
                              ? "bg-[#a3001d] text-white"
                              : "bg-slate-100 text-slate-900",
                          )}
                        >
                          {msg.body}
                        </div>
                        {/* Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {msg.attachments.map((att) => {
                              const isImage =
                                att.mime_type.startsWith("image/");
                              const FileIcon = getFileIcon(att.mime_type);

                              return (
                                <div key={att.id} className="relative group">
                                  {isImage && att.url ? (
                                    <a
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block"
                                    >
                                      <img
                                        src={att.url}
                                        alt={att.original_name}
                                        className="max-w-[200px] max-h-[150px] rounded-md border border-slate-200 object-cover hover:opacity-90 transition-opacity"
                                      />
                                    </a>
                                  ) : (
                                    <a
                                      href={att.url ?? "#"}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        "flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs",
                                        isOwnMessage
                                          ? "border-white/30 text-white/90 hover:bg-white/10"
                                          : "border-slate-200 text-slate-700 bg-white hover:bg-slate-50",
                                      )}
                                    >
                                      <FileIcon className="w-4 h-4 flex-shrink-0" />
                                      <span className="truncate max-w-[150px]">
                                        {att.original_name}
                                      </span>
                                      <span className="text-[10px] opacity-70">
                                        {formatFileSize(att.size_bytes)}
                                      </span>
                                      <Download className="w-3 h-3 ms-1" />
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">
                            {format(new Date(msg.created_at), "d MMM à HH:mm", {
                              locale: fr,
                            })}
                          </span>
                          {/* Read receipts - only for the LAST message sent by current user */}
                          {isOwnMessage && msg.id === lastOwnMessageId && (
                            <ReadReceiptIndicator
                              receipts={msg.read_receipts}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            {selectedThread?.status === "open" && (
              <div className="p-3 border-t border-slate-200 space-y-2">
                {/* Options row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Select
                    value={messageTopic}
                    onValueChange={(v) => setMessageTopic(v as MessageTopic)}
                  >
                    <SelectTrigger className="h-7 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TOPIC_LABELS).map(([value, label]) => (
                        <SelectItem
                          key={value}
                          value={value}
                          className="text-xs"
                        >
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {canSelectRecipient && (
                    <Select
                      value={recipientRole}
                      onValueChange={(v) =>
                        setRecipientRole(v as MessageRole | "all")
                      }
                    >
                      <SelectTrigger className="h-7 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">
                          Tous
                        </SelectItem>
                        <SelectItem value="pro" className="text-xs">
                          Client Pro
                        </SelectItem>
                        <SelectItem value="partner" className="text-xs">
                          Partenaire
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {canSendInternal && (
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-300"
                      />
                      Message interne
                    </label>
                  )}

                  {canUseQuickReplies && (
                    <div className="relative">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowQuickReplies(!showQuickReplies)}
                        className="h-7 text-xs gap-1"
                      >
                        <Zap className="w-3 h-3" />
                        Réponses rapides
                      </Button>
                      {showQuickReplies && (
                        <div className="absolute top-full start-0 mt-1 w-64 max-h-64 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                          {Object.entries(quickRepliesByCategory).map(
                            ([category, templates]) => (
                              <div key={category}>
                                <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                                  {TOPIC_LABELS[category as MessageTopic] ??
                                    category}
                                </div>
                                {templates.map((qr) => (
                                  <button
                                    key={qr.id}
                                    type="button"
                                    onClick={() => handleQuickReplySelect(qr)}
                                    className="w-full text-start px-3 py-2 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                                  >
                                    <div className="font-medium text-slate-900">
                                      {qr.label}
                                    </div>
                                    <div className="text-slate-500 truncate">
                                      {qr.body.slice(0, 50)}...
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ),
                          )}
                          {Object.keys(quickRepliesByCategory).length === 0 && (
                            <div className="px-3 py-4 text-xs text-center text-slate-500">
                              Aucun modèle disponible
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {onAddCommunicationLog &&
                    (userRole === "rc" || userRole === "admin") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowLogDialog(true)}
                        className="h-7 text-xs ms-auto"
                      >
                        <Plus className="w-3 h-3 me-1" />
                        Journal externe
                      </Button>
                    )}
                </div>

                {/* Pending attachments preview */}
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-md border border-slate-200">
                    {pendingAttachments.map((att, idx) => {
                      const isImage = att.file.type.startsWith("image/");
                      const FileIcon = getFileIcon(att.file.type);

                      return (
                        <div
                          key={idx}
                          className="relative group bg-white rounded-md border border-slate-200 overflow-hidden"
                        >
                          {isImage && att.previewUrl ? (
                            <img
                              src={att.previewUrl}
                              alt={att.file.name}
                              className="w-16 h-16 object-cover"
                            />
                          ) : (
                            <div className="w-16 h-16 flex flex-col items-center justify-center p-1">
                              <FileIcon className="w-6 h-6 text-slate-400" />
                              <span className="text-[9px] text-slate-500 truncate w-full text-center mt-1">
                                {att.file.name.slice(0, 8)}...
                              </span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            className="absolute -top-1 -end-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Message input */}
                <div className="flex gap-2">
                  <div className="flex-1 flex flex-col gap-2">
                    <Textarea
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Votre message..."
                      className="min-h-[60px] max-h-[120px] resize-none text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1 self-end">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={ALLOWED_EXTENSIONS}
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-9 w-9"
                      title="Joindre un fichier"
                    >
                      <Paperclip className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={handleSend}
                      disabled={
                        (!messageBody.trim() &&
                          pendingAttachments.length === 0) ||
                        sending
                      }
                      className="bg-[#a3001d] hover:bg-[#8a0019] h-9 w-9"
                      size="icon"
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {selectedThread?.status === "closed" && (
              <div className="p-3 border-t border-slate-200 bg-slate-50 text-center">
                <p className="text-sm text-slate-500 flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4" />
                  Cette conversation est clôturée.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div>
              <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">
                Sélectionnez une conversation pour afficher les messages
              </p>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Info Panel */}
      {showInfoPanel && selectedThreadId && selectedThread && (
        <div className="w-64 border-s border-slate-200 flex flex-col">
          <div className="p-3 border-b border-slate-200">
            <h4 className="text-sm font-semibold text-slate-900">
              Informations
            </h4>
          </div>

          <ScrollArea className="flex-1 p-3">
            <div className="space-y-4">
              {/* Job Info */}
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-slate-500 uppercase">
                  Mission
                </h5>
                <div className="bg-slate-50 rounded-lg p-2 space-y-1">
                  <p className="text-sm font-medium text-slate-900">
                    {selectedThread.media_jobs?.title ?? "Sans titre"}
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {selectedThread.media_jobs?.status ?? "—"}
                  </Badge>
                </div>
              </div>

              {/* Participants */}
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-slate-500 uppercase">
                  Participants
                </h5>
                <div className="space-y-2">
                  {participants.map((p) => (
                    <div key={p.user_id} className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage
                          src={p.partner_profiles?.avatar_url ?? undefined}
                        />
                        <AvatarFallback
                          className={cn("text-[10px]", ROLE_COLORS[p.role])}
                        >
                          {getInitials(p.partner_profiles?.display_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-700 truncate">
                          {p.partner_profiles?.display_name ??
                            ROLE_LABELS[p.role]}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {ROLE_LABELS[p.role]}
                        </p>
                      </div>
                    </div>
                  ))}
                  {participants.length === 0 && (
                    <p className="text-xs text-slate-400">Aucun participant</p>
                  )}
                </div>
              </div>

              {/* Communication Logs */}
              {communicationLogs.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-slate-500 uppercase">
                    Journal externe
                  </h5>
                  <div className="space-y-2">
                    {communicationLogs.slice(0, 5).map((log) => {
                      const Icon = CHANNEL_ICONS[log.channel] ?? FileText;
                      return (
                        <div
                          key={log.id}
                          className="bg-slate-50 rounded-lg p-2 space-y-1"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="w-3 h-3 text-slate-500" />
                            <span className="text-xs font-medium text-slate-700">
                              {CHANNEL_LABELS[log.channel] ?? log.channel}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2">
                            {log.summary}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {format(new Date(log.log_date), "d MMM à HH:mm", {
                              locale: fr,
                            })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-slate-500 uppercase">
                  Raccourcis
                </h5>
                <div className="space-y-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-xs h-8"
                  >
                    <ExternalLink className="w-3 h-3 me-2" />
                    Ouvrir la mission
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-xs h-8"
                  >
                    <FileText className="w-3 h-3 me-2" />
                    Voir les livrables
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Add Communication Log Dialog */}
      <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un journal externe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Canal</Label>
              <Select
                value={logForm.channel}
                onValueChange={(v) => setLogForm((f) => ({ ...f, channel: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Résumé *</Label>
              <Textarea
                value={logForm.summary}
                onChange={(e) =>
                  setLogForm((f) => ({ ...f, summary: e.target.value }))
                }
                placeholder="Résumé de l'échange..."
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Prochaine action</Label>
              <Input
                value={logForm.next_action}
                onChange={(e) =>
                  setLogForm((f) => ({ ...f, next_action: e.target.value }))
                }
                placeholder="Action à faire..."
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">
                Participants (séparés par virgule)
              </Label>
              <Input
                value={logForm.participants}
                onChange={(e) =>
                  setLogForm((f) => ({ ...f, participants: e.target.value }))
                }
                placeholder="Jean Dupont, Marie Martin..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleAddLog}
              disabled={!logForm.summary.trim() || logSaving}
              className="bg-[#a3001d] hover:bg-[#8a0019]"
            >
              {logSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Ajouter"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MediaMessagesPanel;
