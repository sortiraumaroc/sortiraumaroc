import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ArrowLeft, Loader2, Send } from "lucide-react";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

import {
  listMyReservationMessages,
  sendMyReservationMessage,
  type ConsumerConversationMessage,
} from "@/lib/consumerReservationMessagesApi";
import { listMyConsumerNotifications } from "@/lib/consumerNotificationsApi";
import { getUserNotificationReadIds, markAllUserNotificationsRead } from "@/lib/userNotifications";

function bubbleClass(fromRole: string) {
  const mine = fromRole === "user";
  return cn(
    "max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words",
    mine ? "bg-primary text-white rounded-br-md" : "bg-slate-100 text-slate-900 rounded-bl-md",
  );
}

function alignClass(fromRole: string) {
  return fromRole === "user" ? "justify-end" : "justify-start";
}

function roleLabel(fromRole: string) {
  if (fromRole === "user") return "Vous";
  if (fromRole === "pro") return "Établissement";
  return "Message";
}

export default function ProfileMessages() {
  const { reservationId } = useParams();
  const rid = String(reservationId ?? "");

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState<string>("Messages");
  const [messages, setMessages] = useState<ConsumerConversationMessage[]>([]);
  const [draft, setDraft] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => !!draft.trim() && !sending, [draft, sending]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  };

  const markRelatedMessageNotificationsRead = async () => {
    if (!rid) return;

    try {
      const events = await listMyConsumerNotifications(300);
      const readIds = getUserNotificationReadIds();

      const idsToMark: string[] = [];
      for (const ev of events) {
        if (ev.event_type !== "message_received") continue;
        const meta = ev.metadata && typeof ev.metadata === "object" && !Array.isArray(ev.metadata) ? (ev.metadata as Record<string, unknown>) : {};
        const evRid = typeof meta.reservationId === "string" ? meta.reservationId : null;
        if (!evRid || evRid !== rid) continue;

        const id = `event:${ev.id}`;
        if (!readIds.has(id)) idsToMark.push(id);
      }

      if (idsToMark.length) markAllUserNotificationsRead(idsToMark);
    } catch {
      // Best-effort
    }
  };

  const load = async () => {
    if (!rid) return;
    setLoading(true);
    setError(null);

    try {
      const res = await listMyReservationMessages(rid, 300);
      setSubject(res.conversation?.subject || "Messages");
      setMessages((res.messages ?? []) as ConsumerConversationMessage[]);
    } catch (e) {
      setSubject("Messages");
      setMessages([]);
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  useEffect(() => {
    void load();
    void markRelatedMessageNotificationsRead();

    const interval = window.setInterval(() => {
      void load();
    }, 12_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [rid]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !rid) return;

    setSending(true);
    setError(null);

    try {
      const res = await sendMyReservationMessage(rid, text);
      setDraft("");
      setMessages((prev) => [...prev, res.message]);
      scrollToBottom();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l’envoi");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="container mx-auto px-4 py-8 md:py-10">
        <div className="max-w-4xl mx-auto">
          <div className="mb-4">
            <Link to={`/profile?tab=notifications`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900">
              <ArrowLeft className="w-4 h-4" />
              Retour
            </Link>
          </div>

          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base md:text-lg">{subject}</CardTitle>
              <div className="text-xs text-slate-500">Réservation: {rid}</div>
            </CardHeader>

            <CardContent className="space-y-4">
              {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

              {loading ? (
                <div className="text-sm text-slate-600 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement…
                </div>
              ) : (
                <div className="h-[52vh] md:h-[58vh] overflow-auto rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                  {!messages.length ? <div className="text-sm text-slate-600">Aucun message pour le moment.</div> : null}

                  {messages.map((m) => (
                    <div key={m.id} className={cn("flex", alignClass(m.from_role))}>
                      <div className="space-y-1">
                        <div className="text-[11px] text-slate-500">
                          <span className="font-semibold">{roleLabel(m.from_role)}</span>
                          <span className="mx-2" aria-hidden="true">·</span>
                          <span className="tabular-nums">{formatLeJjMmAaAHeure(m.created_at)}</span>
                        </div>
                        <div className={bubbleClass(m.from_role)}>{m.body}</div>
                      </div>
                    </div>
                  ))}

                  <div ref={bottomRef} />
                </div>
              )}

              <div className="space-y-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Écrire un message…"
                  className="min-h-[84px]"
                  disabled={sending}
                />
                <div className="flex items-center justify-end">
                  <Button className="gap-2" disabled={!canSend} onClick={() => void send()}>
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Envoyer
                  </Button>
                </div>
              </div>

              <div className="text-xs text-slate-500">Le fil se met à jour automatiquement.</div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
