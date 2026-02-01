import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  Bot,
  Calendar,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  Filter,
  History,
  Image,
  Loader2,
  Mail,
  MailOpen,
  MessageCircle,
  MessageSquare,
  MoreVertical,
  Palmtree,
  Paperclip,
  PlusCircle,
  Search,
  Send,
  Settings,
  Sparkles,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  getOrCreateProConversationForReservation,
  listProConversationMessages,
  listProConversations,
  listProReservations,
  sendProConversationMessage,
  markProMessagesRead,
  getProMessageReadReceipts,
  listProClientHistory,
  getProAutoReplySettings,
  updateProAutoReplySettings,
  type ProAutoReplySettings,
  type ProClientHistory,
  type ProMessageReadReceipt,
} from "@/lib/pro/api";
import type { Establishment, ProRole } from "@/lib/pro/types";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

type Reservation = {
  id: string;
  user_id?: string;
  customer_name?: string;
  customer_email?: string;
  date?: string;
  time?: string;
  party_size?: number;
  status?: string;
  created_at?: string;
};

type Conversation = {
  id: string;
  establishment_id: string;
  reservation_id: string | null;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  unread_count?: number;
  last_message_from?: string;
};

type Message = {
  id: string;
  conversation_id: string;
  establishment_id: string;
  from_role: string;
  body: string;
  created_at: string;
  sender_user_id: string | null;
  read_by_pro_at?: string | null;
  read_by_client_at?: string | null;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("fr-MA", { dateStyle: "medium", timeStyle: "short" });
}

function formatShortDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function formatTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateGroup(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDate.getTime() === today.getTime()) return "Aujourd'hui";
  if (msgDate.getTime() === yesterday.getTime()) return "Hier";

  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function getMessageDateKey(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function statusBadge(status: string) {
  if (status === "open") return { label: "Ouvert", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (status === "closed") return { label: "Fermé", cls: "bg-slate-200 text-slate-700 border-slate-300" };
  return { label: status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
}

const DAYS_OF_WEEK = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" },
];

type DemoData = {
  conversations: (Conversation & { unread_count: number })[];
  messagesByConversationId: Record<string, Message[]>;
  reservations: Reservation[];
};

function safeLower(s: string) {
  return s.toLowerCase();
}

function generateDemoAiReply(conversation: Conversation, messages: Message[]) {
  const lastClient = [...messages].reverse().find((m) => m.from_role !== "pro")?.body ?? "";
  const subject = conversation.subject ?? "";
  const lower = safeLower(`${subject}\n${lastClient}`);

  if (lower.includes("terrasse")) {
    return "Avec plaisir ! Nous pouvons vous préparer une table en terrasse. Souhaitez-vous une zone non-fumeur ?";
  }

  if (lower.includes("confirme") || lower.includes("confirmation")) {
    return "Merci pour votre confirmation. C'est bien noté, nous vous attendons avec plaisir !";
  }

  if (lower.includes("annul")) {
    return "Bien reçu. Souhaitez-vous reprogrammer la réservation à une autre date ou un autre horaire ?";
  }

  if (lower.includes("allerg") || lower.includes("intol")) {
    return "Merci pour l'info. Pouvez-vous me préciser l'allergie / intolérance afin que nous adaptions le menu ?";
  }

  if (lower.includes("heure") || lower.includes("horaire") || lower.includes("retard")) {
    return "Pas de souci. Pouvez-vous me confirmer l'heure d'arrivée estimée afin que nous gardions la table ?";
  }

  return "Merci pour votre message. Je m'en occupe et je reviens vers vous au plus vite.";
}

function buildDemoData(establishmentId: string): DemoData {
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString();

  const reservations: Reservation[] = [
    {
      id: "6f1c2a6c-3c53-4b7f-9dc5-0f5b6e2c1a11",
      user_id: "demo-user-1",
      customer_name: "Ahmed Benani",
      customer_email: "ahmed.benani@gmail.com",
      date: iso(now + 1000 * 60 * 60 * 24 * 2),
      time: "21:00",
      party_size: 4,
      status: "confirmed",
    },
    {
      id: "1b2c3d4e-5f67-4a89-9abc-def012345678",
      user_id: "demo-user-2",
      customer_name: "Fatima Alaoui",
      customer_email: "f.alaoui@outlook.com",
      date: iso(now + 1000 * 60 * 60 * 24),
      time: "20:00",
      party_size: 2,
      status: "confirmed",
    },
    {
      id: "9a8b7c6d-5e4f-3a2b-1c0d-ef9876543210",
      user_id: "demo-user-3",
      customer_name: "Youssef Chraibi",
      customer_email: "youssef.c@gmail.com",
      date: iso(now + 1000 * 60 * 60 * 48),
      time: "19:30",
      party_size: 6,
      status: "pending",
    },
  ];

  const conversations: (Conversation & { unread_count: number })[] = [
    {
      id: "demo-conv-1",
      establishment_id: establishmentId,
      reservation_id: "6f1c2a6c-3c53-4b7f-9dc5-0f5b6e2c1a11",
      subject: "Ahmed Benani — Demande spéciale",
      status: "open",
      created_at: iso(now - 1000 * 60 * 60 * 24),
      updated_at: iso(now - 1000 * 60 * 15),
      unread_count: 2,
      last_message_from: "client",
    },
    {
      id: "demo-conv-2",
      establishment_id: establishmentId,
      reservation_id: "1b2c3d4e-5f67-4a89-9abc-def012345678",
      subject: "Fatima Alaoui — Confirmation",
      status: "closed",
      created_at: iso(now - 1000 * 60 * 60 * 24 * 7),
      updated_at: iso(now - 1000 * 60 * 60 * 24 * 6),
      unread_count: 0,
      last_message_from: "pro",
    },
  ];

  const messagesByConversationId: Record<string, Message[]> = {
    "demo-conv-1": [
      {
        id: "demo-msg-1",
        conversation_id: "demo-conv-1",
        establishment_id: establishmentId,
        from_role: "client",
        body: "Bonjour, est-ce possible d'avoir une table en terrasse vers 21h ?",
        created_at: iso(now - 1000 * 60 * 35),
        sender_user_id: null,
        read_by_pro_at: iso(now - 1000 * 60 * 30),
        read_by_client_at: null,
      },
      {
        id: "demo-msg-2",
        conversation_id: "demo-conv-1",
        establishment_id: establishmentId,
        from_role: "pro",
        body: "Bonjour ! Oui, c'est possible. Avez-vous une préférence (chauffage / zone fumeur) ?",
        created_at: iso(now - 1000 * 60 * 28),
        sender_user_id: null,
        read_by_pro_at: null,
        read_by_client_at: iso(now - 1000 * 60 * 25),
      },
      {
        id: "demo-msg-3",
        conversation_id: "demo-conv-1",
        establishment_id: establishmentId,
        from_role: "client",
        body: "Zone non-fumeur si possible. Merci !",
        created_at: iso(now - 1000 * 60 * 20),
        sender_user_id: null,
        read_by_pro_at: null,
        read_by_client_at: null,
      },
    ],
    "demo-conv-2": [
      {
        id: "demo-msg-4",
        conversation_id: "demo-conv-2",
        establishment_id: establishmentId,
        from_role: "client",
        body: "Bonsoir, je confirme la réservation pour demain 20h (2 personnes).",
        created_at: iso(now - 1000 * 60 * 60 * 24 * 6 + 1000 * 60 * 10),
        sender_user_id: null,
        read_by_pro_at: iso(now - 1000 * 60 * 60 * 24 * 6 + 1000 * 60 * 12),
        read_by_client_at: null,
      },
      {
        id: "demo-msg-5",
        conversation_id: "demo-conv-2",
        establishment_id: establishmentId,
        from_role: "pro",
        body: "Merci ! C'est confirmé. À demain 🙂",
        created_at: iso(now - 1000 * 60 * 60 * 24 * 6 + 1000 * 60 * 18),
        sender_user_id: null,
        read_by_pro_at: null,
        read_by_client_at: iso(now - 1000 * 60 * 60 * 24 * 6 + 1000 * 60 * 20),
      },
    ],
  };

  return { conversations, messagesByConversationId, reservations };
}

// Component for read status indicator
function ReadStatusIndicator({ message, readReceipts }: { message: Message; readReceipts: Map<string, ProMessageReadReceipt> }) {
  const receipt = readReceipts.get(message.id);

  if (message.from_role !== "pro") {
    // Client message - show if pro read it
    return null;
  }

  // Pro message - show if client read it
  const readAt = receipt?.read_by_client_at ?? message.read_by_client_at;

  if (readAt) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-400" title={`Lu le ${formatDate(readAt)}`}>
        <CheckCheck className="w-3 h-3" />
        Lu
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-white/60" title="Envoyé">
      <Check className="w-3 h-3" />
    </span>
  );
}

// Auto-reply settings dialog
function AutoReplySettingsDialog({
  open,
  onOpenChange,
  settings,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ProAutoReplySettings;
  onSave: (settings: Partial<ProAutoReplySettings>) => Promise<void>;
  saving: boolean;
}) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [activeTab, setActiveTab] = useState<"absence" | "vacation">("absence");

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const toggleDay = (day: number) => {
    const days = localSettings.days_of_week ?? [];
    if (days.includes(day)) {
      setLocalSettings({ ...localSettings, days_of_week: days.filter((d) => d !== day) });
    } else {
      setLocalSettings({ ...localSettings, days_of_week: [...days, day] });
    }
  };

  const handleSave = async () => {
    await onSave(localSettings);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Réponse automatique
          </DialogTitle>
          <DialogDescription>
            Configurez un message automatique pour répondre aux clients en votre absence.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "absence" | "vacation")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="absence" className="gap-2">
              <Clock className="w-4 h-4" />
              Horaires
            </TabsTrigger>
            <TabsTrigger value="vacation" className="gap-2">
              <Palmtree className="w-4 h-4" />
              Vacances
            </TabsTrigger>
          </TabsList>

          <TabsContent value="absence" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Activer la réponse automatique</Label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Répondre automatiquement en dehors des horaires définis
                </p>
              </div>
              <Switch
                checked={localSettings.enabled}
                onCheckedChange={(enabled) => setLocalSettings({ ...localSettings, enabled })}
              />
            </div>

            <div className="space-y-3">
              <Label>Jours d'absence</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
                      (localSettings.days_of_week ?? []).includes(day.value)
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Heure de début</Label>
                <Input
                  type="time"
                  value={localSettings.start_time ?? ""}
                  onChange={(e) => setLocalSettings({ ...localSettings, start_time: e.target.value || null })}
                  placeholder="18:00"
                />
              </div>
              <div>
                <Label>Heure de fin</Label>
                <Input
                  type="time"
                  value={localSettings.end_time ?? ""}
                  onChange={(e) => setLocalSettings({ ...localSettings, end_time: e.target.value || null })}
                  placeholder="09:00"
                />
              </div>
            </div>

            <div>
              <Label>Message automatique</Label>
              <Textarea
                value={localSettings.message}
                onChange={(e) => setLocalSettings({ ...localSettings, message: e.target.value })}
                placeholder="Bonjour, merci pour votre message..."
                className="min-h-[100px] mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">
                Ce message sera envoyé automatiquement aux clients pendant les heures d'absence.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="vacation" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Mode vacances</Label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Activer pendant vos congés pour prévenir les clients
                </p>
              </div>
              <Switch
                checked={localSettings.is_on_vacation}
                onCheckedChange={(is_on_vacation) => setLocalSettings({ ...localSettings, is_on_vacation })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date de début</Label>
                <Input
                  type="date"
                  value={localSettings.vacation_start?.split("T")[0] ?? ""}
                  onChange={(e) => setLocalSettings({ ...localSettings, vacation_start: e.target.value ? `${e.target.value}T00:00:00Z` : null })}
                />
              </div>
              <div>
                <Label>Date de fin</Label>
                <Input
                  type="date"
                  value={localSettings.vacation_end?.split("T")[0] ?? ""}
                  onChange={(e) => setLocalSettings({ ...localSettings, vacation_end: e.target.value ? `${e.target.value}T23:59:59Z` : null })}
                />
              </div>
            </div>

            <div>
              <Label>Message de vacances</Label>
              <Textarea
                value={localSettings.vacation_message}
                onChange={(e) => setLocalSettings({ ...localSettings, vacation_message: e.target.value })}
                placeholder="Nous sommes actuellement en congés..."
                className="min-h-[100px] mt-1"
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Client history dialog
function ClientHistoryDialog({
  open,
  onOpenChange,
  history,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: ProClientHistory | null;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Historique du client
          </DialogTitle>
          <DialogDescription>
            Tous les échanges passés avec ce client
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : history?.client ? (
          <div className="flex-1 overflow-auto space-y-4">
            {/* Client info */}
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-bold text-slate-900">{history.client.name || "Client"}</div>
                  <div className="text-sm text-slate-500">{history.client.email || "Email non disponible"}</div>
                </div>
                <Badge className="ml-auto bg-slate-100 text-slate-700 border-slate-200">
                  {history.client.total_reservations} réservation{history.client.total_reservations > 1 ? "s" : ""}
                </Badge>
              </div>
            </div>

            {/* Reservations */}
            <div>
              <h4 className="font-bold text-sm text-slate-900 mb-2">Réservations</h4>
              <div className="space-y-2">
                {history.reservations.map((res) => (
                  <div key={res.id} className="rounded-lg border border-slate-200 p-3 bg-white text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{res.booking_reference || res.id.slice(0, 8)}</span>
                      <Badge className={cn(
                        res.status === "confirmed" ? "bg-emerald-100 text-emerald-700" :
                        res.status === "pending" ? "bg-amber-100 text-amber-700" :
                        res.status === "cancelled" ? "bg-red-100 text-red-700" :
                        "bg-slate-100 text-slate-700"
                      )}>
                        {res.status}
                      </Badge>
                    </div>
                    <div className="text-slate-500 mt-1">
                      {formatDate(res.starts_at)} · {res.party_size} personne{(res.party_size ?? 0) > 1 ? "s" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* All messages grouped by conversation */}
            <div>
              <h4 className="font-bold text-sm text-slate-900 mb-2">Messages ({history.messages.length})</h4>
              {history.conversations.map((conv) => {
                const convMessages = history.messages.filter((m) => m.conversation_id === conv.id);
                if (convMessages.length === 0) return null;

                return (
                  <div key={conv.id} className="mb-4">
                    <div className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-2">
                      <MessageSquare className="w-3 h-3" />
                      {conv.subject}
                    </div>
                    <div className="space-y-2 pl-2 border-l-2 border-slate-200">
                      {convMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "rounded-lg px-3 py-2 text-sm",
                            msg.from_role === "pro"
                              ? "bg-primary/10 text-slate-800 ml-4"
                              : "bg-slate-100 text-slate-800 mr-4"
                          )}
                        >
                          <div className="text-[11px] text-slate-500 mb-1">
                            {msg.from_role === "pro" ? "Vous" : "Client"} · {formatDate(msg.created_at)}
                          </div>
                          <div className="whitespace-pre-wrap">{msg.body}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">
            Aucun historique disponible pour ce client.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProMessagesTab({ establishment, role }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [readReceipts, setReadReceipts] = useState<Map<string, ProMessageReadReceipt>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingReservations, setLoadingReservations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedReservationId, setSelectedReservationId] = useState<string>("");
  const [createSubject, setCreateSubject] = useState("");
  const [creating, setCreating] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [previewMode, setPreviewMode] = useState(false);
  const [previewConversations, setPreviewConversations] = useState<Conversation[]>([]);
  const [previewMessagesById, setPreviewMessagesById] = useState<Record<string, Message[]>>({});
  const [previewReservations, setPreviewReservations] = useState<Reservation[]>([]);

  // Auto-reply settings
  const [autoReplySettings, setAutoReplySettings] = useState<ProAutoReplySettings | null>(null);
  const [autoReplyDialogOpen, setAutoReplyDialogOpen] = useState(false);
  const [savingAutoReply, setSavingAutoReply] = useState(false);

  // Client history
  const [clientHistoryDialogOpen, setClientHistoryDialogOpen] = useState(false);
  const [clientHistory, setClientHistory] = useState<ProClientHistory | null>(null);
  const [loadingClientHistory, setLoadingClientHistory] = useState(false);

  // Search and filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");

  // Quick replies
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);

  // Attachment
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const demo = useMemo(() => buildDemoData(establishment.id), [establishment.id]);

  // Quick reply templates
  const quickReplyTemplates = [
    { id: "confirm", label: "Confirmation", text: "Bonjour ! Votre réservation est bien confirmée. Nous avons hâte de vous accueillir !" },
    { id: "reminder", label: "Rappel", text: "Bonjour ! Nous vous rappelons votre réservation prévue demain. À très bientôt !" },
    { id: "thanks", label: "Remerciement", text: "Merci pour votre visite ! Nous espérons que vous avez passé un agréable moment. À bientôt !" },
    { id: "delay", label: "Retard", text: "Pas de souci pour le retard. Nous gardons votre table. Prévenez-nous si besoin !" },
    { id: "special", label: "Demande spéciale", text: "Bien reçu ! Nous avons noté votre demande et ferons le nécessaire." },
    { id: "cancel", label: "Annulation", text: "Votre annulation a bien été prise en compte. N'hésitez pas à réserver à nouveau !" },
  ];

  // Calculate total unread messages
  const totalUnread = useMemo(() => {
    const convs = previewMode ? previewConversations : conversations;
    return convs.reduce((sum, c) => sum + ((c as any).unread_count ?? 0), 0);
  }, [conversations, previewConversations, previewMode]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const loadAutoReplySettings = async () => {
    try {
      const res = await getProAutoReplySettings(establishment.id);
      setAutoReplySettings(res.settings);
    } catch {
      // Ignore - use defaults
    }
  };

  const loadReservations = async () => {
    setLoadingReservations(true);
    try {
      const res = await listProReservations(establishment.id);
      const list = (res.reservations ?? []) as Reservation[];
      setReservations(list.slice(0, 50));
    } catch {
      setReservations([]);
    } finally {
      setLoadingReservations(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listProConversations(establishment.id);
      const list = (res.conversations ?? []) as Conversation[];
      setConversations(list);
      setSelectedId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setConversations([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    setLoadingMessages(true);
    setError(null);

    try {
      const res = await listProConversationMessages({ establishmentId: establishment.id, conversationId });
      setMessages((res.messages ?? []) as Message[]);

      // Mark messages as read
      void markProMessagesRead({ establishmentId: establishment.id, conversationId }).catch(() => {});

      // Load read receipts
      try {
        const receiptsRes = await getProMessageReadReceipts({ establishmentId: establishment.id, conversationId });
        const receiptsMap = new Map<string, ProMessageReadReceipt>();
        for (const r of receiptsRes.messages) {
          receiptsMap.set(r.id, r);
        }
        setReadReceipts(receiptsMap);
      } catch {
        setReadReceipts(new Map());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadClientHistory = async (clientUserId: string) => {
    setLoadingClientHistory(true);
    setClientHistoryDialogOpen(true);
    try {
      const history = await listProClientHistory(establishment.id, clientUserId);
      setClientHistory(history);
    } catch {
      setClientHistory(null);
    } finally {
      setLoadingClientHistory(false);
    }
  };

  useEffect(() => {
    if (previewMode) return;
    void load();
    void loadReservations();
    void loadAutoReplySettings();
  }, [establishment.id, previewMode]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setReadReceipts(new Map());
      return;
    }

    if (previewMode) {
      setMessages(previewMessagesById[selectedId] ?? []);
      return;
    }

    void loadMessages(selectedId);
  }, [selectedId, establishment.id, previewMode, previewMessagesById]);

  const activeConversationsRaw = previewMode ? previewConversations : conversations;
  const activeReservations = previewMode ? previewReservations : reservations;

  // Filter conversations by search and status
  const activeConversations = useMemo(() => {
    let filtered = activeConversationsRaw;

    // Filter by status
    if (statusFilter !== "all") {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((c) => c.subject.toLowerCase().includes(query));
    }

    return filtered;
  }, [activeConversationsRaw, statusFilter, searchQuery]);

  const selected = useMemo(
    () => activeConversationsRaw.find((c) => c.id === selectedId) ?? null,
    [activeConversationsRaw, selectedId],
  );

  // Get client user ID from selected conversation's reservation
  const selectedClientUserId = useMemo(() => {
    if (!selected?.reservation_id) return null;
    const res = activeReservations.find((r) => r.id === selected.reservation_id);
    return res?.user_id ?? null;
  }, [selected, activeReservations]);

  // Reservations without a conversation yet
  const availableReservations = useMemo(() => {
    const existingReservationIds = new Set(activeConversationsRaw.map((c) => c.reservation_id).filter(Boolean));
    return activeReservations.filter((r) => !existingReservationIds.has(r.id));
  }, [activeConversationsRaw, activeReservations]);

  // Mark conversation as unread
  const markAsUnread = async (conversationId: string) => {
    if (previewMode) {
      setPreviewConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, unread_count: 1 } : c
        )
      );
      return;
    }

    // In real mode, we'd call an API endpoint
    // For now, just update local state
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, unread_count: 1 } : c
      )
    );
  };

  // Insert quick reply
  const insertQuickReply = (text: string) => {
    setDraft(text);
    setQuickRepliesOpen(false);
  };

  // Handle file attachment
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError("Le fichier est trop volumineux (max 5 Mo)");
        return;
      }
      setAttachmentFile(file);
    }
  };

  const removeAttachment = () => {
    setAttachmentFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const enterPreview = () => {
    setError(null);
    setPreviewMode(true);
    setPreviewConversations(demo.conversations);
    setPreviewMessagesById(demo.messagesByConversationId);
    setPreviewReservations(demo.reservations);
    setSelectedId(demo.conversations[0]?.id ?? null);
    setDraft("");
    setSelectedReservationId("");
  };

  const exitPreview = () => {
    setPreviewMode(false);
    setDraft("");
    setPreviewConversations([]);
    setPreviewMessagesById({});
    setPreviewReservations([]);
    setSelectedReservationId("");
    void load();
    void loadReservations();
  };

  const createOrOpen = async () => {
    if (!selectedReservationId) return;

    setCreating(true);
    setError(null);

    try {
      const res = await getOrCreateProConversationForReservation({
        establishmentId: establishment.id,
        reservationId: selectedReservationId,
        subject: createSubject.trim() || undefined,
      });
      const id = (res.conversation as { id: string }).id;
      setSelectedReservationId("");
      setCreateSubject("");
      await load();
      setSelectedId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCreating(false);
    }
  };

  const appendPreviewMessage = (conversationId: string, next: Message) => {
    setPreviewMessagesById((prev) => {
      const list = [...(prev[conversationId] ?? []), next];
      return { ...prev, [conversationId]: list };
    });

    setPreviewConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              status: "open",
              updated_at: new Date().toISOString(),
              unread_count: 0,
            }
          : c,
      ),
    );
  };

  const send = async () => {
    if (!selected) return;

    if (previewMode) {
      setSending(true);
      setError(null);

      const body = draft.trim() || generateDemoAiReply(selected, messages);

      window.setTimeout(() => {
        const next: Message = {
          id: `demo-msg-${Date.now()}`,
          conversation_id: selected.id,
          establishment_id: establishment.id,
          from_role: "pro",
          body,
          created_at: new Date().toISOString(),
          sender_user_id: null,
          read_by_client_at: null,
        };

        appendPreviewMessage(selected.id, next);
        setMessages((prev) => [...prev, next]);
        setDraft("");
        setSending(false);
      }, 550);

      return;
    }

    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setError(null);

    try {
      await sendProConversationMessage({ establishmentId: establishment.id, conversationId: selected.id, body });
      setDraft("");
      await loadMessages(selected.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSending(false);
    }
  };

  const handleSaveAutoReply = async (settings: Partial<ProAutoReplySettings>) => {
    setSavingAutoReply(true);
    try {
      const res = await updateProAutoReplySettings(establishment.id, settings);
      setAutoReplySettings(res.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingAutoReply(false);
    }
  };

  const getReservationLabel = (r: Reservation) => {
    const name = r.customer_name || r.customer_email || "Client";
    const date = formatShortDate(r.date);
    const time = r.time || "";
    const size = r.party_size ? `${r.party_size} pers.` : "";
    return `${name} — ${date} ${time} ${size}`.trim();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <SectionHeader
              title="Messages"
              description="Échangez avec vos clients avant et après leur réservation."
              icon={MessageSquare}
            />
            <div className="flex items-center gap-2 flex-wrap">
              {totalUnread > 0 && (
                <Badge className="bg-red-500 text-white border-red-500 text-sm px-2.5 py-1">
                  <Mail className="w-3.5 h-3.5 mr-1.5" />
                  {totalUnread} non lu{totalUnread > 1 ? "s" : ""}
                </Badge>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAutoReplyDialogOpen(true)}
                className="gap-2"
              >
                {autoReplySettings?.enabled || autoReplySettings?.is_on_vacation ? (
                  <Bell className="w-4 h-4 text-emerald-600" />
                ) : (
                  <BellOff className="w-4 h-4 text-slate-400" />
                )}
                Réponse auto
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          {/* Auto-reply status banner */}
          {(autoReplySettings?.enabled || autoReplySettings?.is_on_vacation) && (
            <div className={cn(
              "rounded-lg border p-3 flex items-center gap-3",
              autoReplySettings.is_on_vacation
                ? "bg-amber-50 border-amber-200"
                : "bg-emerald-50 border-emerald-200"
            )}>
              {autoReplySettings.is_on_vacation ? (
                <>
                  <Palmtree className="w-5 h-5 text-amber-600 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium text-amber-900">Mode vacances activé</div>
                    <div className="text-xs text-amber-700">
                      {autoReplySettings.vacation_start && autoReplySettings.vacation_end
                        ? `Du ${formatShortDate(autoReplySettings.vacation_start)} au ${formatShortDate(autoReplySettings.vacation_end)}`
                        : "Les clients recevront votre message de vacances automatiquement."}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Clock className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium text-emerald-900">Réponse automatique activée</div>
                    <div className="text-xs text-emerald-700">
                      {autoReplySettings.start_time && autoReplySettings.end_time
                        ? `De ${autoReplySettings.start_time} à ${autoReplySettings.end_time}`
                        : "Les clients recevront une réponse automatique en votre absence."}
                    </div>
                  </div>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAutoReplyDialogOpen(true)}
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <PlusCircle className="w-4 h-4 text-primary" />
              Démarrer une conversation
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Sélectionner une réservation</Label>
                {loadingReservations && !previewMode ? (
                  <div className="h-10 flex items-center text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Chargement...
                  </div>
                ) : availableReservations.length > 0 ? (
                  <Select
                    value={selectedReservationId}
                    onValueChange={setSelectedReservationId}
                    disabled={previewMode && !previewReservations.length}
                  >
                    <SelectTrigger className="w-full bg-white">
                      <SelectValue placeholder="Choisir une réservation..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableReservations.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>{getReservationLabel(r)}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="h-10 flex items-center text-sm text-slate-500">
                    Toutes les réservations ont une conversation
                  </div>
                )}
              </div>
              <div>
                <Label>Sujet (optionnel)</Label>
                <Input
                  value={createSubject}
                  onChange={(e) => setCreateSubject(e.target.value)}
                  placeholder="Ex: Demande spéciale, Confirmation..."
                  disabled={previewMode}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                className="gap-2"
                onClick={() => void createOrOpen()}
                disabled={previewMode || creating || !selectedReservationId}
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                Démarrer la conversation
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                Conversations
                <span className="text-slate-400 font-normal">({activeConversationsRaw.length})</span>
                {totalUnread > 0 && (
                  <Badge className="bg-red-500 text-white border-red-500 text-xs">
                    {totalUnread}
                  </Badge>
                )}
              </CardTitle>
              {previewMode ? (
                <Button type="button" variant="outline" size="sm" onClick={exitPreview}>
                  Quitter l'aperçu
                </Button>
              ) : null}
            </div>

            {/* Search and filters */}
            <div className="mt-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant={statusFilter === "all" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={() => setStatusFilter("all")}
                >
                  Tous
                </Button>
                <Button
                  type="button"
                  variant={statusFilter === "open" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs flex-1 gap-1"
                  onClick={() => setStatusFilter("open")}
                >
                  <Eye className="w-3 h-3" />
                  Ouverts
                </Button>
                <Button
                  type="button"
                  variant={statusFilter === "closed" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs flex-1 gap-1"
                  onClick={() => setStatusFilter("closed")}
                >
                  <EyeOff className="w-3 h-3" />
                  Fermés
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-slate-600 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement…
              </div>
            ) : activeConversations.length ? (
              <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
                {activeConversations.map((c) => {
                  const active = c.id === selectedId;
                  const st = statusBadge(c.status);
                  const unread = (c as any).unread_count ?? 0;
                  const hasUnread = unread > 0;

                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "relative group",
                        active ? "bg-primary/5" : "bg-white",
                        hasUnread ? "bg-blue-50/50" : "",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className="w-full text-left px-3 py-3 pr-10 border-b border-slate-100 hover:bg-slate-50 transition"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  "font-bold truncate",
                                  hasUnread ? "text-blue-900" : "text-slate-900"
                                )}
                                title={c.subject}
                              >
                                {c.subject}
                              </div>
                            {hasUnread && (
                              <Badge className="bg-red-500 text-white border-red-500 text-[10px] px-1.5 py-0 shrink-0">
                                {unread}
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            {formatDate(c.updated_at)}
                          </div>
                        </div>
                        <Badge className={cn(st.cls, "shrink-0 whitespace-nowrap min-w-[58px] justify-center text-[10px]")}>
                          {st.label}
                        </Badge>
                      </div>
                    </button>

                    {/* Context menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="w-4 h-4 text-slate-500" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            void markAsUnread(c.id);
                          }}
                          className="gap-2"
                        >
                          <MailOpen className="w-4 h-4" />
                          Marquer comme non lu
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                  <MessageSquare className="w-8 h-8 text-slate-300" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-700">
                    {searchQuery || statusFilter !== "all"
                      ? "Aucun résultat"
                      : "Aucune conversation"}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {searchQuery || statusFilter !== "all"
                      ? "Essayez de modifier vos critères de recherche."
                      : "Sélectionnez une réservation ci-dessus pour démarrer une conversation."}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Messages</CardTitle>
                <CardDescription className="mt-1">
                  {selected ? selected.subject : "Visualisez et répondez aux messages de vos clients"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {previewMode ? <Badge className="bg-slate-100 text-slate-700 border-slate-200">Aperçu</Badge> : null}
                {selected && selectedClientUserId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (previewMode) {
                        // Show demo history
                        setClientHistory({
                          ok: true,
                          client: {
                            user_id: selectedClientUserId,
                            name: demo.reservations.find((r) => r.user_id === selectedClientUserId)?.customer_name || "Client",
                            email: demo.reservations.find((r) => r.user_id === selectedClientUserId)?.customer_email || null,
                            total_reservations: 3,
                          },
                          reservations: demo.reservations.filter((r) => r.user_id === selectedClientUserId).map((r) => ({
                            id: r.id,
                            booking_reference: r.id.slice(0, 8),
                            starts_at: r.date || new Date().toISOString(),
                            party_size: r.party_size || 2,
                            status: r.status || "confirmed",
                          })),
                          conversations: demo.conversations.filter((c) => {
                            const res = demo.reservations.find((r) => r.id === c.reservation_id);
                            return res?.user_id === selectedClientUserId;
                          }),
                          messages: Object.values(demo.messagesByConversationId).flat().filter((m) => {
                            const conv = demo.conversations.find((c) => c.id === m.conversation_id);
                            const res = demo.reservations.find((r) => r.id === conv?.reservation_id);
                            return res?.user_id === selectedClientUserId;
                          }),
                        });
                        setClientHistoryDialogOpen(true);
                      } else {
                        void loadClientHistory(selectedClientUserId);
                      }
                    }}
                    className="gap-2"
                  >
                    <History className="w-4 h-4" />
                    Historique
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingMessages ? (
              <div className="text-sm text-slate-600 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement…
              </div>
            ) : selected ? (
              <>
                <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                  {messages.length === 0 ? (
                    <div className="text-sm text-slate-600 text-center py-8">
                      <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      Aucun message. Commencez la conversation !
                    </div>
                  ) : (
                    <>
                      {messages.map((m, idx) => {
                        const currentDateKey = getMessageDateKey(m.created_at);
                        const prevDateKey = idx > 0 ? getMessageDateKey(messages[idx - 1].created_at) : null;
                        const showDateSeparator = currentDateKey !== prevDateKey;

                        return (
                          <div key={m.id}>
                            {showDateSeparator && (
                              <div className="flex items-center gap-3 my-4">
                                <div className="flex-1 h-px bg-slate-200" />
                                <span className="text-[11px] text-slate-500 font-medium px-2">
                                  {formatDateGroup(m.created_at)}
                                </span>
                                <div className="flex-1 h-px bg-slate-200" />
                              </div>
                            )}
                            <div className={cn("flex", m.from_role === "pro" ? "justify-end" : "justify-start")}>
                              <div
                                className={cn(
                                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                                  m.from_role === "pro" ? "bg-primary text-white" : "bg-white border border-slate-200 text-slate-800",
                                )}
                              >
                                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                                <div className={cn("mt-1 flex items-center justify-end gap-1.5", m.from_role === "pro" ? "text-white/80" : "text-slate-500")}>
                                  <span className="text-[11px]">{formatTime(m.created_at)}</span>
                                  {m.from_role === "pro" && (
                                    <ReadStatusIndicator message={m} readReceipts={readReceipts} />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-xs font-bold text-slate-700">Répondre</div>
                    <div className="flex items-center gap-2">
                      {previewMode ? (
                        <Badge className="bg-slate-100 text-slate-700 border-slate-200 inline-flex items-center gap-1">
                          <Bot className="w-3.5 h-3.5" />
                          IA (démo)
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {/* Attachment preview */}
                    {attachmentFile && (
                      <div className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50">
                        <Image className="w-4 h-4 text-slate-500" />
                        <span className="text-sm text-slate-700 truncate flex-1">
                          {attachmentFile.name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {(attachmentFile.size / 1024).toFixed(1)} Ko
                        </span>
                        <button
                          type="button"
                          onClick={removeAttachment}
                          className="p-1 hover:bg-slate-200 rounded"
                        >
                          <X className="w-4 h-4 text-slate-500" />
                        </button>
                      </div>
                    )}

                    <div className="relative">
                      <Textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onFocus={() => {
                          if (!previewMode) return;
                          if (draft.trim()) return;
                          if (!selected) return;
                          const body = generateDemoAiReply(selected, messages);
                          setDraft(body);
                        }}
                        onKeyDown={(e) => {
                          // Entrée pour envoyer, Shift+Entrée pour nouvelle ligne
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (selected && (previewMode || draft.trim() || attachmentFile)) {
                              void send();
                            }
                          }
                        }}
                        placeholder={previewMode ? "Réponse IA (démo)…" : "Votre message…"}
                        className="min-h-[88px] pr-20"
                        disabled={sending}
                      />

                      {/* Quick actions inside textarea */}
                      <div className="absolute bottom-2 right-2 flex items-center gap-1">
                        {/* Quick replies */}
                        <Popover open={quickRepliesOpen} onOpenChange={setQuickRepliesOpen}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                              title="Réponses rapides"
                            >
                              <Zap className="w-4 h-4" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-72 p-2">
                            <div className="text-xs font-bold text-slate-700 mb-2 px-2">
                              Réponses rapides
                            </div>
                            <div className="space-y-1">
                              {quickReplyTemplates.map((template) => (
                                <button
                                  key={template.id}
                                  type="button"
                                  onClick={() => insertQuickReply(template.text)}
                                  className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 transition"
                                >
                                  <div className="font-medium text-sm text-slate-900">
                                    {template.label}
                                  </div>
                                  <div className="text-xs text-slate-500 truncate">
                                    {template.text}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* Attachment */}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                          title="Joindre un fichier"
                          disabled={previewMode}
                        >
                          <Paperclip className="w-4 h-4" />
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,.pdf,.doc,.docx"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                      <div className="text-xs text-slate-500">
                        {attachmentFile ? (
                          <span className="text-emerald-600">1 pièce jointe</span>
                        ) : previewMode ? (
                          "Mode démo : la réponse est générée automatiquement."
                        ) : (
                          <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-100 border border-slate-200 rounded font-mono">Entrée</kbd>
                            <span>pour envoyer</span>
                            <span className="text-slate-400 mx-1">·</span>
                            <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-100 border border-slate-200 rounded font-mono">Shift+Entrée</kbd>
                            <span>nouvelle ligne</span>
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {previewMode ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="gap-2"
                            onClick={() => {
                              if (!selected) return;
                              const body = generateDemoAiReply(selected, messages);
                              setDraft(body);
                            }}
                            disabled={sending || !selected}
                          >
                            <Sparkles className="w-4 h-4" />
                            Réponse IA
                          </Button>
                        ) : null}

                        <Button
                          type="button"
                          className="gap-2"
                          onClick={() => void send()}
                          disabled={sending || !selected || (!previewMode && !draft.trim() && !attachmentFile)}
                        >
                          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          {previewMode ? "Envoyer (IA)" : "Envoyer"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-600 text-center py-8">
                <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                Sélectionnez une conversation pour voir les messages.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Auto-reply settings dialog */}
      {autoReplySettings && (
        <AutoReplySettingsDialog
          open={autoReplyDialogOpen}
          onOpenChange={setAutoReplyDialogOpen}
          settings={autoReplySettings}
          onSave={handleSaveAutoReply}
          saving={savingAutoReply}
        />
      )}

      {/* Client history dialog */}
      <ClientHistoryDialog
        open={clientHistoryDialogOpen}
        onOpenChange={setClientHistoryDialogOpen}
        history={clientHistory}
        loading={loadingClientHistory}
      />
    </div>
  );
}
