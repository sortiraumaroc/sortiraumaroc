/**
 * SupportChatOverlay — Floating panel for quick support access
 *
 * Two views:
 *   1. Tickets list + "New ticket" form
 *   2. Live chat (SupportChatPanel in compact mode)
 *
 * Style mirrors SamChatWindow (fixed bottom-right, z-50, rounded-2xl).
 */

import { useCallback, useEffect, useState } from "react";
import {
  Headset,
  Loader2,
  MessageCircle,
  PlusCircle,
  Send,
  Ticket,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listSupportTickets,
  createSupportTicket,
  checkAgentOnline,
  isSupportOnline,
  getTicketStatusLabel,
  type SupportTicket,
  type TicketCategory,
} from "@/lib/supportApi";
import { SupportChatPanel } from "./SupportChatPanel";

type View = "menu" | "tickets" | "new-ticket" | "chat";

type Props = {
  onClose: () => void;
  enabled: boolean;
  establishmentId?: string;
};

export function SupportChatOverlay({ onClose, enabled, establishmentId }: Props) {
  const [view, setView] = useState<View>("menu");
  const [online, setOnline] = useState(() => isSupportOnline());

  // Tickets
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  // New ticket form
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<TicketCategory>("reservations");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Check agent online
  useEffect(() => {
    let cancelled = false;
    void checkAgentOnline().then((res) => {
      if (!cancelled) setOnline(res);
    });
    return () => { cancelled = true; };
  }, []);

  // Load tickets when switching to tickets view
  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const res = await listSupportTickets();
      setTickets(res.tickets);
    } catch {
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "tickets") void loadTickets();
  }, [view, loadTickets]);

  // Create ticket
  const handleCreateTicket = async () => {
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createSupportTicket({
        subject: subject.trim(),
        message: message.trim(),
        category,
        establishment_id: establishmentId,
      });
      setSubject("");
      setMessage("");
      setCategory("reservations");
      setView("tickets");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  const title = view === "menu"
    ? "Support"
    : view === "tickets"
      ? "Mes tickets"
      : view === "new-ticket"
        ? "Nouveau ticket"
        : "Chat en direct";

  return (
    <div
      className={cn(
        "fixed bottom-24 end-6 z-50",
        "flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl",
        "h-[min(560px,calc(100dvh-120px))] w-[min(380px,calc(100vw-48px))]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b bg-primary px-4 py-3">
        <div className="flex items-center gap-2 text-white">
          <Headset className="h-5 w-5" />
          <span className="text-sm font-bold">{title}</span>
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              online ? "bg-emerald-400" : "bg-slate-400",
            )}
          />
        </div>
        <div className="flex items-center gap-1">
          {view !== "menu" && (
            <button
              type="button"
              onClick={() => setView("menu")}
              className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {/* Menu view */}
        {view === "menu" && (
          <div className="p-4 space-y-3">
            <p className="text-sm text-slate-600">
              Comment pouvons-nous vous aider ?
            </p>

            <button
              type="button"
              onClick={() => setView("chat")}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-start hover:bg-slate-50 transition"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                <MessageCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Chat en direct</div>
                <div className="text-xs text-slate-500">
                  {online ? "Un agent est disponible" : "Laissez un message"}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setView("tickets")}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-start hover:bg-slate-50 transition"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                <Ticket className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Mes tickets</div>
                <div className="text-xs text-slate-500">Suivre mes demandes</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setView("new-ticket")}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-start hover:bg-slate-50 transition"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <PlusCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Nouveau ticket</div>
                <div className="text-xs text-slate-500">Ouvrir une demande</div>
              </div>
            </button>
          </div>
        )}

        {/* Chat view */}
        {view === "chat" && (
          <div className="h-full p-2">
            <SupportChatPanel
              enabled={enabled}
              establishmentId={establishmentId}
              compact
              className="h-full"
            />
          </div>
        )}

        {/* Tickets list */}
        {view === "tickets" && (
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{tickets.length} ticket(s)</span>
              <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => setView("new-ticket")}>
                <PlusCircle className="h-3 w-3" /> Nouveau
              </Button>
            </div>

            {ticketsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Aucun ticket. Créez-en un !
              </div>
            ) : (
              tickets.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-slate-200 bg-white p-3 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900 truncate">{t.subject}</span>
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap",
                      t.status === "closed"
                        ? "bg-emerald-100 text-emerald-700"
                        : t.status === "in_progress"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-700",
                    )}>
                      {getTicketStatusLabel(t.status)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(t.updated_at).toLocaleDateString("fr-FR")}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* New ticket form */}
        {view === "new-ticket" && (
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">Sujet</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex : Problème de réservation"
                disabled={submitting}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">Catégorie</label>
              <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reservations">Réservations</SelectItem>
                  <SelectItem value="annulation">Annulation</SelectItem>
                  <SelectItem value="paiement_facturation">Paiement & facturation</SelectItem>
                  <SelectItem value="compte">Compte</SelectItem>
                  <SelectItem value="technique">Problème technique</SelectItem>
                  <SelectItem value="partenaires">Partenaires</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">Message</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Décrivez votre demande..."
                className="min-h-[80px]"
                disabled={submitting}
              />
            </div>
            {submitError && (
              <div className="text-xs text-red-600">{submitError}</div>
            )}
            <Button
              className="w-full gap-2"
              onClick={handleCreateTicket}
              disabled={submitting || !subject.trim() || !message.trim()}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
