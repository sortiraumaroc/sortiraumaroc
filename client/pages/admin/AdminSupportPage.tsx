import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";

import { toast } from "@/hooks/use-toast";

import {
  AdminApiError,
  getAdminSupportTicket,
  listAdminSupportTicketMessages,
  listAdminSupportTickets,
  postAdminSupportTicketMessage,
  updateAdminSupportTicket,
  getAdminSupportClientProfile,
  getAdminSupportEstablishmentProfile,
  updateAdminTicketInternalNotes,
  toggleAdminAgentStatus,
  type SupportTicketAdmin,
  type SupportTicketMessageAdmin,
  type SupportClientProfile,
  type SupportEstablishmentProfile,
} from "@/lib/adminApi";

import { consumerSupabase } from "@/lib/supabase";

import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Copy,
  Headset,
  Loader2,
  StickyNote,
  User,
} from "lucide-react";

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function copyToClipboard(text: string): Promise<void> {
  const value = String(text ?? "").trim();
  if (!value) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }

    toast({ title: "Copié", description: "Réponse copiée dans le presse-papiers." });
  } catch {
    toast({ title: "Impossible", description: "Copie non autorisée sur ce navigateur.", variant: "destructive" });
  }
}

type TicketRow = {
  id: string;
  ticketNumber: string;
  updatedAt: string;
  updatedAtIso: string;
  status: string;
  priority: string;
  role: string;
  subject: string;
  establishmentId: string;
};

function mapTicket(t: SupportTicketAdmin): TicketRow {
  const updatedIso = String(t.updated_at ?? t.created_at ?? "");
  return {
    id: String(t.id ?? ""),
    ticketNumber: String((t as any).ticket_number ?? ""),
    updatedAt: formatLocal(updatedIso),
    updatedAtIso: updatedIso,
    status: String(t.status ?? "—"),
    priority: String(t.priority ?? "—"),
    role: String(t.created_by_role ?? "—"),
    subject: String(t.subject ?? "—"),
    establishmentId: String(t.establishment_id ?? "—"),
  };
}

type DisplayMessage = {
  id: string;
  createdAt: string;
  fromRole: string;
  body: string;
  isInternal?: boolean;
};

function mapMessage(m: SupportTicketMessageAdmin): DisplayMessage {
  return {
    id: String(m.id ?? ""),
    createdAt: formatLocal(m.created_at),
    fromRole: String(m.from_role ?? "—"),
    body: String(m.body ?? ""),
    isInternal: Boolean(m.is_internal),
  };
}

// =============================================================================
// Client Profile Panel (inline in dialog)
// =============================================================================

function ClientProfilePanel({
  userId,
  establishmentId,
}: {
  userId: string | null;
  establishmentId: string | null;
}) {
  const [clientProfile, setClientProfile] = useState<SupportClientProfile | null>(null);
  const [estProfile, setEstProfile] = useState<SupportEstablishmentProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId && !establishmentId) return;
    let cancelled = false;
    setLoading(true);

    const tasks: Promise<void>[] = [];

    if (userId) {
      tasks.push(
        getAdminSupportClientProfile(undefined, userId)
          .then((res) => { if (!cancelled) setClientProfile(res); })
          .catch(() => {})
      );
    }

    if (establishmentId && establishmentId !== "—") {
      tasks.push(
        getAdminSupportEstablishmentProfile(undefined, establishmentId)
          .then((res) => { if (!cancelled) setEstProfile(res); })
          .catch(() => {})
      );
    }

    void Promise.all(tasks).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [userId, establishmentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!clientProfile && !estProfile) {
    return <div className="text-xs text-slate-500 py-4 text-center">Aucune fiche disponible</div>;
  }

  return (
    <div className="space-y-3">
      {clientProfile && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-1">
            <User className="h-3 w-3" /> Client
          </div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div className="text-slate-500">Nom</div>
            <div className="font-medium text-slate-900">{clientProfile.user.full_name || "—"}</div>
            <div className="text-slate-500">Email</div>
            <div className="font-medium text-slate-900 truncate">{clientProfile.user.email || "—"}</div>
            <div className="text-slate-500">Téléphone</div>
            <div className="font-medium text-slate-900">{clientProfile.user.phone || "—"}</div>
            <div className="text-slate-500">Ville</div>
            <div className="font-medium text-slate-900">{clientProfile.user.city || "—"}</div>
            <div className="text-slate-500">Inscrit le</div>
            <div className="font-medium text-slate-900">{formatLocal(clientProfile.user.created_at)}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="rounded border border-slate-200 p-2 text-center">
              <div className="text-lg font-bold text-slate-900">{clientProfile.stats.total_reservations}</div>
              <div className="text-[10px] text-slate-500">Réservations</div>
            </div>
            <div className="rounded border border-slate-200 p-2 text-center">
              <div className="text-lg font-bold text-emerald-600">{clientProfile.stats.honored}</div>
              <div className="text-[10px] text-slate-500">Honorées</div>
            </div>
            <div className="rounded border border-slate-200 p-2 text-center">
              <div className="text-lg font-bold text-red-600">{clientProfile.stats.no_show}</div>
              <div className="text-[10px] text-slate-500">No-show</div>
            </div>
          </div>
          {clientProfile.previous_tickets.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-slate-500 mt-2 mb-1">Tickets précédents</div>
              {clientProfile.previous_tickets.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-slate-600 truncate max-w-[150px]">
                    {t.ticket_number || t.id.slice(0, 8)} — {t.subject}
                  </span>
                  <span className="text-[10px] text-slate-400">{t.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {estProfile && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <div className="text-xs font-bold text-slate-700">Établissement</div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div className="text-slate-500">Nom</div>
            <div className="font-medium text-slate-900">{estProfile.establishment.name}</div>
            <div className="text-slate-500">Ville</div>
            <div className="font-medium text-slate-900">{estProfile.establishment.city || "—"}</div>
            <div className="text-slate-500">Note</div>
            <div className="font-medium text-slate-900">
              {estProfile.establishment.avg_rating != null
                ? `${estProfile.establishment.avg_rating.toFixed(1)} (${estProfile.establishment.total_reviews} avis)`
                : "—"}
            </div>
          </div>
          {estProfile.owner && (
            <div className="text-xs text-slate-500">
              Propriétaire : {estProfile.owner.full_name} ({estProfile.owner.email})
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export function AdminSupportPage() {
  const [items, setItems] = useState<TicketRow[]>([]);
  const [rawById, setRawById] = useState<Record<string, SupportTicketAdmin>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketAdmin | null>(null);

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [replyBody, setReplyBody] = useState<string>("");
  const [replyInternal, setReplyInternal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Agent online toggle
  const [agentOnline, setAgentOnline] = useState(false);
  const [agentToggling, setAgentToggling] = useState(false);

  // Side panels
  const [showProfile, setShowProfile] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Internal notes
  const [internalNotes, setInternalNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listAdminSupportTickets(undefined, {
        status: statusFilter,
        priority: priorityFilter,
        role: roleFilter,
        limit: 500,
      });

      const byId: Record<string, SupportTicketAdmin> = {};
      const mapped = (res.items ?? [])
        .map((t) => {
          byId[String(t.id ?? "")] = t;
          return mapTicket(t);
        })
        .filter((t) => t.id);

      setRawById(byId);
      setItems(mapped);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [priorityFilter, roleFilter, statusFilter]);

  const openTicket = useCallback(async (id: string) => {
    setSelectedId(id);
    setDialogOpen(true);
    setMessages([]);
    setMessagesError(null);
    setReplyBody("");
    setReplyInternal(false);
    setShowProfile(false);
    setShowNotes(false);

    const cached = rawById[id];
    setSelectedTicket(cached ?? null);
    setInternalNotes(String((cached as any)?.internal_notes ?? ""));

    setMessagesLoading(true);
    try {
      const ticketRes = await getAdminSupportTicket(undefined, id);
      setSelectedTicket(ticketRes.item);
      setInternalNotes(String((ticketRes.item as any)?.internal_notes ?? ""));

      const msgRes = await listAdminSupportTicketMessages(undefined, id);
      const mapped = (msgRes.items ?? []).map(mapMessage);

      const initialBody = String(ticketRes.item.body ?? "").trim();
      const initialSubject = String(ticketRes.item.subject ?? "").trim();
      const initialRole = String(ticketRes.item.created_by_role ?? "user").trim() || "user";
      const initialCreatedAt = String(ticketRes.item.created_at ?? "");

      const initialMsg: DisplayMessage | null = initialBody
        ? {
            id: `ticket:${id}`,
            createdAt: formatLocal(initialCreatedAt),
            fromRole: initialRole,
            body: initialSubject && initialSubject !== "—" ? `${initialSubject}\n\n${initialBody}` : initialBody,
          }
        : null;

      const finalMessages = initialMsg ? [initialMsg, ...mapped] : mapped;
      setMessages(finalMessages);
    } catch (e) {
      if (e instanceof AdminApiError) setMessagesError(e.message);
      else setMessagesError("Erreur inattendue");
    } finally {
      setMessagesLoading(false);
    }
  }, [rawById]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Supabase Realtime for ticket messages (when dialog is open)
  useEffect(() => {
    if (!selectedId || !dialogOpen) return;

    const channelName = `admin-ticket-msgs:${selectedId}`;
    const channel = consumerSupabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_ticket_messages",
          filter: `ticket_id=eq.${selectedId}`,
        },
        (payload) => {
          const raw = payload.new as SupportTicketMessageAdmin;
          if (!raw?.id) return;
          const newMsg = mapMessage(raw);
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        },
      )
      .subscribe();

    return () => {
      void consumerSupabase.removeChannel(channel);
    };
  }, [selectedId, dialogOpen]);

  // Toggle agent online status
  const handleToggleAgent = async () => {
    setAgentToggling(true);
    try {
      await toggleAdminAgentStatus(undefined, !agentOnline);
      setAgentOnline(!agentOnline);
      toast({ title: !agentOnline ? "En ligne" : "Hors ligne", description: "Statut agent mis à jour." });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally {
      setAgentToggling(false);
    }
  };

  // Save internal notes
  const handleSaveNotes = async () => {
    if (!selectedId) return;
    setNotesSaving(true);
    try {
      await updateAdminTicketInternalNotes(undefined, selectedId, internalNotes);
      toast({ title: "Notes sauvegardées" });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally {
      setNotesSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<TicketRow>[]>(() => {
    return [
      {
        accessorKey: "ticketNumber",
        header: "N°",
        cell: ({ row }) => (
          <span className="text-xs font-mono text-slate-500">
            {row.original.ticketNumber || row.original.id.slice(0, 8)}
          </span>
        ),
      },
      { accessorKey: "updatedAt", header: "MAJ" },
      { accessorKey: "status", header: "Statut" },
      { accessorKey: "priority", header: "Priorité" },
      { accessorKey: "role", header: "Source" },
      { accessorKey: "subject", header: "Sujet" },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                void openTicket(row.original.id);
              }}
            >
              Ouvrir
            </Button>
          </div>
        ),
      },
    ];
  }, [openTicket]);

  const cannedReplies = [
    {
      title: "Pourquoi un dépôt / acompte est demandé ?",
      body:
        "Bonjour,\n\nPour confirmer certaines réservations, un dépôt peut être demandé. L'objectif est de protéger les créneaux et d'éviter les réservations non honorées.\n\nCe n'est pas une sanction : c'est une mesure de protection appliquée automatiquement.\n\nEn savoir plus : /content/politique-anti-no-show",
    },
    {
      title: "Pourquoi moi ?",
      body:
        "Je comprends la question. La plateforme peut appliquer une confirmation renforcée sur certaines réservations, selon l'historique et le contexte.\n\nNous ne communiquons pas d'indicateur chiffré : l'important est l'impact (dépôt requis ou non) au moment de la réservation.",
    },
    {
      title: "Comment éviter qu'un dépôt soit demandé ?",
      body:
        "Honorer vos réservations (ou annuler dès que possible en cas d'imprévu) aide à garder des conditions de réservation plus simples.\n\nAvec le temps, la plateforme applique généralement moins souvent une confirmation renforcée.",
    },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Support"
        description="Inbox tickets : demandes des pros et des utilisateurs."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={agentOnline ? "default" : "outline"}
              className="gap-1.5"
              onClick={handleToggleAgent}
              disabled={agentToggling}
            >
              <Headset className="h-4 w-4" />
              {agentOnline ? "En ligne" : "Hors ligne"}
            </Button>
            <RefreshIconButton className="h-9 w-9" loading={loading} label="Rafraîchir" onClick={() => void refresh()} />
          </div>
        }
      />

      {/* Canned Replies */}
      <Card className="border-slate-200">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Aide interne — dépôts & no-show</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {cannedReplies.map((item) => (
              <div key={item.title} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-700">{item.title}</div>
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => void copyToClipboard(item.body)}>
                    <Copy className="h-3 w-3" /> Copier
                  </Button>
                </div>
                <div className="mt-2 text-xs text-slate-600 whitespace-pre-wrap line-clamp-3">{item.body}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-slate-500">
            Rappel : rester non technique, non moralisateur, et ne jamais mentionner de score ou de mécanisme interne.
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Filtres</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Statut</div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Ouvert</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="closed">Fermé</SelectItem>
                  <SelectItem value="all">Tous</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Priorité</div>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Priorité" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  <SelectItem value="low">Basse</SelectItem>
                  <SelectItem value="normal">Normale</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Source</div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  <SelectItem value="user">Utilisateur</SelectItem>
                  <SelectItem value="pro">Professionnel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setStatusFilter("open");
                setPriorityFilter("all");
                setRoleFilter("all");
              }}
            >
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <AdminDataTable
        data={items}
        columns={columns}
        searchPlaceholder="Rechercher (sujet, n° ticket, id)…"
        onRowClick={(row) => void openTicket(row.id)}
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedId(null);
            setSelectedTicket(null);
            setMessages([]);
            setMessagesError(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Ticket support
              {selectedTicket && (selectedTicket as any).ticket_number && (
                <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  {(selectedTicket as any).ticket_number}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {!selectedId ? (
            <div className="text-sm text-slate-600">Aucun ticket sélectionné.</div>
          ) : (
            <div className="flex gap-4 overflow-hidden" style={{ maxHeight: "calc(90vh - 100px)" }}>
              {/* Main content */}
              <div className="flex-1 space-y-4 overflow-auto pe-2">
                {messagesError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{messagesError}</div>
                ) : null}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold text-slate-500">Statut</div>
                    <Select
                      value={String(selectedTicket?.status ?? "open")}
                      onValueChange={(v) => {
                        if (!selectedId) return;
                        setSelectedTicket((prev) => (prev ? { ...prev, status: v } : prev));
                        void (async () => {
                          setSaving(true);
                          try {
                            await updateAdminSupportTicket(undefined, { ticketId: selectedId, status: v });
                            await refresh();
                          } catch {
                            // silent
                          } finally {
                            setSaving(false);
                          }
                        })();
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Ouvert</SelectItem>
                        <SelectItem value="pending">En attente</SelectItem>
                        <SelectItem value="in_progress">En cours</SelectItem>
                        <SelectItem value="closed">Fermé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold text-slate-500">Priorité</div>
                    <Select
                      value={String(selectedTicket?.priority ?? "normal")}
                      onValueChange={(v) => {
                        if (!selectedId) return;
                        setSelectedTicket((prev) => (prev ? { ...prev, priority: v } : prev));
                        void (async () => {
                          setSaving(true);
                          try {
                            await updateAdminSupportTicket(undefined, { ticketId: selectedId, priority: v });
                            await refresh();
                          } catch {
                            // ignore
                          } finally {
                            setSaving(false);
                          }
                        })();
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Basse</SelectItem>
                        <SelectItem value="normal">Normale</SelectItem>
                        <SelectItem value="high">Haute</SelectItem>
                        <SelectItem value="urgent">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant={showProfile ? "default" : "outline"}
                      size="sm"
                      className="gap-1 flex-1"
                      onClick={() => { setShowProfile((v) => !v); setShowNotes(false); }}
                    >
                      <User className="h-3.5 w-3.5" /> Fiche
                    </Button>
                    <Button
                      variant={showNotes ? "default" : "outline"}
                      size="sm"
                      className="gap-1 flex-1"
                      onClick={() => { setShowNotes((v) => !v); setShowProfile(false); }}
                    >
                      <StickyNote className="h-3.5 w-3.5" /> Notes
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-500">Conversation</div>
                  <div className="mt-3 space-y-2 max-h-[360px] overflow-auto pe-2">
                    {messagesLoading ? (
                      <div className="text-sm text-slate-600">Chargement…</div>
                    ) : messages.length ? (
                      messages.map((m) => (
                        <div
                          key={m.id}
                          className={
                            m.fromRole === "admin"
                              ? "rounded-lg border border-primary/20 bg-primary/5 p-3"
                              : m.isInternal
                                ? "rounded-lg border border-amber-200 bg-amber-50 p-3"
                                : "rounded-lg border border-slate-200 bg-white p-3"
                          }
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold text-slate-700">
                              {m.fromRole === "admin" ? "Admin" : m.fromRole}
                              {m.isInternal ? <span className="ms-2 text-[11px] text-amber-700">(note interne)</span> : null}
                            </div>
                            <div className="text-[11px] text-slate-500">{m.createdAt}</div>
                          </div>
                          <div className="mt-2 text-sm text-slate-900 whitespace-pre-wrap">{m.body}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-600">Aucun message.</div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-slate-700">Répondre</div>
                    <label className="text-xs text-slate-600 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={replyInternal}
                        onChange={(e) => setReplyInternal(e.target.checked)}
                      />
                      Note interne
                    </label>
                  </div>
                  <Textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Écrire une réponse…"
                    className="min-h-[100px]"
                  />
                  <div className="flex justify-end">
                    <Button
                      disabled={saving || !replyBody.trim() || !selectedId}
                      onClick={() => {
                        if (!selectedId) return;
                        void (async () => {
                          setSaving(true);
                          try {
                            await postAdminSupportTicketMessage(undefined, {
                              ticketId: selectedId,
                              body: replyBody.trim(),
                              is_internal: replyInternal,
                            });
                            setReplyBody("");
                            setReplyInternal(false);
                            // Realtime will add the message; also refresh list
                            await openTicket(selectedId);
                            await refresh();
                          } finally {
                            setSaving(false);
                          }
                        })();
                      }}
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                      Envoyer
                    </Button>
                  </div>
                </div>
              </div>

              {/* Side panel: Client profile or Notes */}
              {(showProfile || showNotes) && (
                <div className="w-72 shrink-0 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {showProfile && (
                    <ClientProfilePanel
                      userId={selectedTicket?.created_by_user_id ?? null}
                      establishmentId={selectedTicket?.establishment_id ?? null}
                    />
                  )}
                  {showNotes && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <StickyNote className="h-3 w-3" /> Notes internes
                      </div>
                      <Textarea
                        value={internalNotes}
                        onChange={(e) => setInternalNotes(e.target.value)}
                        placeholder="Notes internes (non visibles par le client)…"
                        className="min-h-[200px] text-xs"
                      />
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={handleSaveNotes}
                        disabled={notesSaving}
                      >
                        {notesSaving && <Loader2 className="h-3 w-3 animate-spin me-1" />}
                        Sauvegarder
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
