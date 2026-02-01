import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Image,
  Loader2,
  MessageSquare,
  Paperclip,
  PlusCircle,
  RefreshCw,
  Send,
  Ticket,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  listSupportTickets,
  createSupportTicket,
  getSupportTicket,
  addSupportTicketMessage,
  updateSupportTicketStatus,
  formatTicketReference,
  getTicketCategoryLabel,
  type SupportTicket,
  type SupportTicketMessage,
  type TicketCategory,
  type TicketPriority,
  type TicketAttachment,
} from "@/lib/supportApi";

function formatDate(iso: string, intlLocale: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;

  try {
    return d.toLocaleString(intlLocale, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === "closed") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Résolu
      </Badge>
    );
  }
  if (status === "in_progress") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        En cours
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1">
      <Clock className="w-3 h-3" />
      En attente
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority?: string }) {
  if (priority === "urgent" || priority === "high") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
        <AlertCircle className="w-3 h-3" />
        Urgent
      </Badge>
    );
  }
  return null;
}

type Props = {
  className?: string;
  establishmentId?: string;
};

export function SupportTicketsPanel({ className, establishmentId }: Props) {
  const { t, intlLocale } = useI18n();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<TicketCategory>("reservations");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const categoryOptions: Array<{ value: TicketCategory; label: string }> = useMemo(
    () => [
      { value: "reservations", label: t("support.ticket.category.reservations") },
      { value: "annulation", label: t("support.ticket.category.cancellation") },
      { value: "paiement_facturation", label: t("support.ticket.category.billing") },
      { value: "compte", label: t("support.ticket.category.account") },
      { value: "technique", label: t("support.ticket.category.technical") },
      { value: "partenaires", label: t("support.ticket.category.partners") },
      { value: "autre", label: t("support.ticket.category.other") },
    ],
    [t],
  );

  const priorityOptions: Array<{ value: TicketPriority; label: string }> = [
    { value: "normal", label: "Normal" },
    { value: "urgent", label: "Urgent" },
  ];

  // Load tickets
  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listSupportTickets();
      setTickets(res.tickets);
      // Select first ticket if none selected
      if (!selectedId && res.tickets.length > 0) {
        setSelectedId(res.tickets[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du chargement");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  // Load messages for selected ticket
  const loadMessages = useCallback(async (ticketId: string) => {
    setLoadingMessages(true);
    try {
      const res = await getSupportTicket(ticketId);
      setSelectedTicket(res.ticket);
      setMessages(res.messages);
    } catch (e) {
      console.error("Error loading messages:", e);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  // Load messages when selection changes
  useEffect(() => {
    if (selectedId) {
      void loadMessages(selectedId);
    } else {
      setSelectedTicket(null);
      setMessages([]);
    }
  }, [selectedId, loadMessages]);

  // Count open tickets
  const openCount = useMemo(() => tickets.filter((t) => t.status === "open" || t.status === "pending").length, [tickets]);

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      // Max 5MB
      if (file.size > 5 * 1024 * 1024) {
        continue;
      }

      // Read file as data URL
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const attachment: TicketAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl,
        };
        setAttachments((prev) => [...prev, attachment]);
      };
      reader.readAsDataURL(file);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Create new ticket
  const handleCreateTicket = async () => {
    if (!subject.trim() || !message.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await createSupportTicket({
        subject: subject.trim(),
        message: message.trim(),
        category,
        priority,
        establishment_id: establishmentId,
        attachments,
      });

      // Reset form
      setSubject("");
      setMessage("");
      setCategory("reservations");
      setPriority("normal");
      setAttachments([]);
      setCreating(false);

      // Reload and select new ticket
      await loadTickets();
      setSelectedId(res.ticket.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la création");
    } finally {
      setSubmitting(false);
    }
  };

  // Send reply
  const handleSendReply = async () => {
    if (!selectedId || !reply.trim()) return;

    setSendingReply(true);
    try {
      await addSupportTicketMessage({
        ticketId: selectedId,
        body: reply.trim(),
      });
      setReply("");
      await loadMessages(selectedId);
      await loadTickets(); // Refresh to update timestamps
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    } finally {
      setSendingReply(false);
    }
  };

  // Toggle ticket status
  const handleToggleStatus = async (status: "open" | "closed") => {
    if (!selectedId) return;
    try {
      await updateSupportTicketStatus(selectedId, status);
      await loadMessages(selectedId);
      await loadTickets();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <Image className="w-4 h-4 text-blue-500" />;
    return <FileText className="w-4 h-4 text-slate-500" />;
  };

  return (
    <div className={cn("rounded-lg border-2 border-slate-200 bg-white p-4 md:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Ticket className="w-5 h-5 text-primary" />
          <div>
            <div className="font-bold text-foreground flex items-center gap-2">
              {t("support.tickets.title")}
              {openCount > 0 && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                  {openCount} en attente
                </Badge>
              )}
            </div>
            <div className="text-sm text-slate-600">{t("support.tickets.subtitle")}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void loadTickets()}
            disabled={loading}
            title="Actualiser"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
          <Button
            type="button"
            variant={creating ? "outline" : "default"}
            className="gap-2"
            onClick={() => setCreating((v) => !v)}
          >
            {creating ? <X className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
            {creating ? "Annuler" : t("support.tickets.new")}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {creating && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-sm font-bold text-slate-700 mb-1">{t("support.ticket.form.subject")}</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex : Problème de réservation"
                disabled={submitting}
              />
            </div>
            <div>
              <Label className="text-sm font-bold text-slate-700 mb-1">{t("support.ticket.form.category")}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder={t("support.ticket.form.category.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-bold text-slate-700 mb-1">Priorité</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className={cn(p.value === "urgent" && "text-red-600 font-medium")}>
                        {p.value === "urgent" && "🔴 "}
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3">
            <Label className="text-sm font-bold text-slate-700 mb-1">{t("support.ticket.form.message")}</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Décrivez votre demande en détail..."
              className="min-h-[100px]"
              disabled={submitting}
            />
          </div>

          {/* Attachments section */}
          <div className="mt-3">
            <Label className="text-sm font-bold text-slate-700 mb-1">Pièces jointes (optionnel)</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-sm"
                >
                  {getFileIcon(att.type)}
                  <span className="truncate max-w-[120px]">{att.name}</span>
                  <span className="text-xs text-slate-400">({(att.size / 1024).toFixed(0)} Ko)</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="p-0.5 hover:bg-slate-100 rounded"
                    disabled={submitting}
                  >
                    <X className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-sm text-slate-600 hover:bg-slate-100 transition"
                disabled={submitting}
              >
                <Paperclip className="w-4 h-4" />
                Ajouter
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">Max 5 Mo par fichier. Images, PDF, documents Word.</p>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreating(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button
              type="button"
              className="gap-2"
              onClick={handleCreateTicket}
              disabled={submitting || !subject.trim() || !message.trim()}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t("support.ticket.form.submit")}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* Tickets list */}
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-sm font-bold text-slate-700">{t("support.tickets.my_tickets")}</div>
            <span className="text-xs text-slate-500">({tickets.length})</span>
          </div>
          {loading ? (
            <div className="p-6 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
              <div className="text-sm text-slate-500 mt-2">Chargement...</div>
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-6 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <Ticket className="w-6 h-6 text-slate-300" />
              </div>
              <div className="text-sm font-medium text-slate-700">Aucun ticket</div>
              <div className="text-xs text-slate-500 mt-1">
                Créez votre premier ticket pour contacter le support.
              </div>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              {tickets.map((ticket) => {
                const active = ticket.id === selectedId;
                const hasUnread = (ticket.unread_count ?? 0) > 0;

                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedId(ticket.id)}
                    className={cn(
                      "w-full text-left px-3 py-3 border-b border-slate-100 hover:bg-slate-50 transition",
                      active ? "bg-primary/5" : "bg-white",
                      hasUnread && "bg-blue-50/50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formatTicketReference(ticket.id)}
                          </span>
                          <PriorityBadge priority={ticket.priority} />
                          {hasUnread && (
                            <Badge className="bg-red-500 text-white border-red-500 text-[10px] px-1.5 py-0">
                              {ticket.unread_count}
                            </Badge>
                          )}
                        </div>
                        <div className="font-bold text-slate-900 truncate mt-0.5">{ticket.subject}</div>
                        <div className="text-xs text-slate-600">{getTicketCategoryLabel(ticket.category, t)}</div>
                      </div>
                      <div className="flex-shrink-0">
                        <StatusBadge status={ticket.status} />
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {t("support.ticket.updated_at", { date: formatDate(ticket.updated_at, intlLocale) })}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Ticket detail */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          {!selectedTicket ? (
            <div className="text-center py-8">
              <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <MessageSquare className="w-6 h-6 text-slate-300" />
              </div>
              <div className="text-sm font-medium text-slate-700">Sélectionnez un ticket</div>
              <div className="text-xs text-slate-500 mt-1">
                Cliquez sur un ticket pour voir les détails et l'historique.
              </div>
            </div>
          ) : loadingMessages ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
              <div className="text-sm text-slate-500 mt-2">Chargement...</div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                      {formatTicketReference(selectedTicket.id)}
                    </span>
                    <StatusBadge status={selectedTicket.status} />
                    <PriorityBadge priority={selectedTicket.priority} />
                  </div>
                  <div className="font-bold text-slate-900">{selectedTicket.subject}</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {getTicketCategoryLabel(selectedTicket.category, t)} · Créé le{" "}
                    {formatDate(selectedTicket.created_at, intlLocale)}
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedTicket.status !== "closed" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleToggleStatus("closed")}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Marquer résolu
                    </Button>
                  )}
                  {selectedTicket.status === "closed" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleToggleStatus("open")}
                    >
                      <MessageSquare className="w-4 h-4" />
                      Rouvrir
                    </Button>
                  )}
                </div>
              </div>

              {/* Attachments preview */}
              {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
                <div className="mt-3 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-xs font-medium text-slate-600 mb-1.5">
                    Pièces jointes ({selectedTicket.attachments.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedTicket.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={att.dataUrl || att.url}
                        download={att.name}
                        className="flex items-center gap-1.5 px-2 py-1 rounded border border-slate-200 bg-white text-xs hover:bg-slate-50 transition"
                      >
                        {getFileIcon(att.type)}
                        <span className="truncate max-w-[100px]">{att.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="mt-4 flex-1 min-h-[220px] max-h-[360px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                {messages.map((m) => (
                  <div key={m.id} className={cn("flex", m.from_role === "user" || m.from_role === "pro" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        m.from_role === "user" || m.from_role === "pro"
                          ? "bg-primary text-white"
                          : "bg-white border border-slate-200 text-slate-800",
                      )}
                    >
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      <div
                        className={cn(
                          "mt-1 text-[11px]",
                          m.from_role === "user" || m.from_role === "pro" ? "text-white/80" : "text-slate-500",
                        )}
                      >
                        {m.from_role === "user" || m.from_role === "pro" ? "Vous" : "Support"} ·{" "}
                        {formatDate(m.created_at, intlLocale)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply */}
              <div className="mt-3">
                <div className="text-xs font-bold text-slate-700 mb-1">{t("support.ticket.reply")}</div>
                <div className="flex gap-2">
                  <Input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && reply.trim() && selectedTicket.status !== "closed") {
                        e.preventDefault();
                        void handleSendReply();
                      }
                    }}
                    placeholder={
                      selectedTicket.status === "closed"
                        ? t("support.ticket.reply.placeholder_closed")
                        : t("support.ticket.reply.placeholder")
                    }
                    disabled={selectedTicket.status === "closed" || sendingReply}
                  />
                  <Button
                    type="button"
                    className="gap-2"
                    onClick={handleSendReply}
                    disabled={selectedTicket.status === "closed" || !reply.trim() || sendingReply}
                  >
                    {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {t("support.ticket.reply.send")}
                  </Button>
                </div>
                {selectedTicket.status === "closed" ? (
                  <div className="mt-2 text-xs text-slate-500">{t("support.ticket.closed_note")}</div>
                ) : (
                  <div className="mt-2 text-xs text-slate-500">
                    Temps de réponse estimé : <span className="font-medium">24h</span> (2h pour les tickets urgents)
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
