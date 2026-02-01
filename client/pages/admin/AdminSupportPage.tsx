import { useCallback, useEffect, useMemo, useState } from "react";
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
  type SupportTicketAdmin,
  type SupportTicketMessageAdmin,
} from "@/lib/adminApi";

import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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

    const cached = rawById[id];
    setSelectedTicket(cached ?? null);

    setMessagesLoading(true);
    try {
      const ticketRes = await getAdminSupportTicket(undefined, id);
      setSelectedTicket(ticketRes.item);

      const msgRes = await listAdminSupportTicketMessages(undefined, id);
      const mapped = (msgRes.items ?? []).map(mapMessage);

      // Afficher le message initial du ticket en tête si aucune "thread" n'existe encore.
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

  const columns = useMemo<ColumnDef<TicketRow>[]>(() => {
    return [
      { accessorKey: "updatedAt", header: "MAJ" },
      { accessorKey: "status", header: "Statut" },
      { accessorKey: "priority", header: "Priorité" },
      { accessorKey: "role", header: "Source" },
      { accessorKey: "subject", header: "Sujet" },
      { accessorKey: "establishmentId", header: "Établissement" },
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

  // Temporairement désactivé (réactivable plus tard)
  const ENABLE_INTERNAL_HELP = false;

  const cannedReplies = [
    {
      title: "Pourquoi un dépôt / acompte est demandé ?",
      body:
        "Bonjour,\n\nPour confirmer certaines réservations, un dépôt peut être demandé. L’objectif est de protéger les créneaux et d’éviter les réservations non honorées.\n\nCe n’est pas une sanction : c’est une mesure de protection appliquée automatiquement.\n\nEn savoir plus : /content/politique-anti-no-show",
    },
    {
      title: "Pourquoi moi ?",
      body:
        "Je comprends la question. La plateforme peut appliquer une confirmation renforcée sur certaines réservations, selon l’historique et le contexte.\n\nNous ne communiquons pas d’indicateur chiffré : l’important est l’impact (dépôt requis ou non) au moment de la réservation.",
    },
    {
      title: "Comment éviter qu’un dépôt soit demandé ?",
      body:
        "Honorer vos réservations (ou annuler dès que possible en cas d’imprévu) aide à garder des conditions de réservation plus simples.\n\nAvec le temps, la plateforme applique généralement moins souvent une confirmation renforcée.",
    },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Support"
        description="Inbox tickets : demandes des pros et des utilisateurs."
        actions={
          <RefreshIconButton className="h-9 w-9" loading={loading} label="Rafraîchir" onClick={() => void refresh()} />
        }
      />

      {ENABLE_INTERNAL_HELP ? (
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
                    <Button size="sm" variant="outline" onClick={() => void copyToClipboard(item.body)}>
                      Copier
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-slate-600 whitespace-pre-wrap">{item.body}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-500">
              Rappel : rester non technique, non moralisateur, et ne jamais mentionner de score ou de mécanisme interne.
            </div>
          </CardContent>
        </Card>
      ) : null}

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
        searchPlaceholder="Rechercher (sujet, établissement, id)…"
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ticket support</DialogTitle>
          </DialogHeader>

          {!selectedId ? (
            <div className="text-sm text-slate-600">Aucun ticket sélectionné.</div>
          ) : (
            <div className="space-y-4">
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
                        } catch (e) {
                          // silent, error already visible in list
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

                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-500">Établissement</div>
                  <div className="mt-1 text-sm text-slate-900 break-all">{selectedTicket?.establishment_id ?? "—"}</div>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-3">
                <div className="text-xs font-semibold text-slate-500">Conversation</div>
                <div className="mt-3 space-y-2 max-h-[360px] overflow-auto pr-2">
                  {messagesLoading ? (
                    <div className="text-sm text-slate-600">Chargement…</div>
                  ) : messages.length ? (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={
                          m.fromRole === "admin"
                            ? "rounded-lg border border-primary/20 bg-primary/5 p-3"
                            : "rounded-lg border border-slate-200 bg-white p-3"
                        }
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold text-slate-700">
                            {m.fromRole === "admin" ? "Admin" : m.fromRole}
                            {m.isInternal ? <span className="ml-2 text-[11px] text-amber-700">(note interne)</span> : null}
                          </div>
                          <div className="text-[11px] text-slate-500">{m.createdAt}</div>
                        </div>
                        <div className="mt-2 text-sm text-slate-900 whitespace-pre-wrap">{m.body}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-600">Aucun message.</div>
                  )}
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
                  className="min-h-[120px]"
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
                          await openTicket(selectedId);
                          await refresh();
                        } finally {
                          setSaving(false);
                        }
                      })();
                    }}
                  >
                    Envoyer
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
