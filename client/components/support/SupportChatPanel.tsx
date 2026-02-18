import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { consumerSupabase } from "@/lib/supabase";
import {
  getOrCreateChatSession,
  sendChatMessage,
  checkAgentOnline,
  getSupportHoursLabel,
  isSupportOnline,
  type ChatSession,
  type ChatMessage,
} from "@/lib/supportApi";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("fr-MA", { timeStyle: "short", dateStyle: "medium" });
}

type Props = {
  className?: string;
  enabled: boolean;
  establishmentId?: string;
  /** Compact mode for overlay widget (smaller padding, no header borders) */
  compact?: boolean;
};

export function SupportChatPanel({ className, enabled, establishmentId, compact }: Props) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => isSupportOnline());

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check agent online status every 60s (dynamic from server)
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const result = await checkAgentOnline();
      if (!cancelled) setOnline(result);
    };
    void check();
    const id = window.setInterval(() => void check(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize or get chat session
  const initSession = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const res = await getOrCreateChatSession({
        establishment_id: establishmentId,
      });
      setSession(res.session);
      setMessages(res.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de connexion au chat");
    } finally {
      setLoading(false);
    }
  }, [enabled, establishmentId]);

  // Initial load
  useEffect(() => {
    if (enabled) {
      void initSession();
    }
  }, [enabled, initSession]);

  // Supabase Realtime subscription (replaces polling)
  useEffect(() => {
    if (!session?.id || session.status !== "active") return;

    const channelName = `support-chat:${session.id}`;
    const channel = consumerSupabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_chat_messages",
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          if (!newMsg?.id) return;

          setMessages((prev) => {
            // Dedup — may already exist from optimistic insert
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        },
      )
      .subscribe();

    return () => {
      void consumerSupabase.removeChannel(channel);
    };
  }, [session?.id, session?.status]);

  // Send message
  const handleSend = async () => {
    const body = text.trim();
    if (!body || !session?.id) return;

    setSending(true);
    setError(null);

    try {
      const res = await sendChatMessage({
        session_id: session.id,
        body,
      });

      // Optimistic add (Realtime will dedup)
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.message.id)) return prev;
        return [...prev, res.message];
      });
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  const canChat = enabled && session?.status === "active";

  return (
    <div className={cn(
      "rounded-lg bg-white",
      !compact && "border-2 border-slate-200 p-4 md:p-6",
      compact && "flex flex-col h-full",
      className,
    )}>
      {!compact && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            <div>
              <div className="font-bold text-foreground">Chat</div>
              <div className="text-sm text-slate-600">{getSupportHoursLabel()}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={cn(
                "text-xs font-bold px-2 py-1 rounded-full",
                online ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
              )}
            >
              {online ? "En ligne" : "Hors ligne"}
            </div>
          </div>
        </div>
      )}

      {!enabled ? (
        <div className={cn("rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700", !compact && "mt-4")}>
          Connectez-vous pour accéder au chat.
        </div>
      ) : null}

      {error && (
        <div className={cn("rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700", !compact && "mt-4")}>
          {error}
        </div>
      )}

      {loading ? (
        <div className={cn("flex items-center justify-center py-8", !compact && "mt-4")}>
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className={cn(
          "rounded-lg border border-slate-200 bg-slate-50 p-3",
          !canChat && "opacity-60",
          !compact && "mt-4",
          compact && "flex-1 overflow-hidden",
        )}>
          <div className={cn(
            "overflow-auto space-y-3",
            compact ? "h-full" : "max-h-[320px]",
          )}>
            {messages.length === 0 ? (
              <div className="text-sm text-slate-600">Aucun message pour le moment.</div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex",
                    m.from_role === "user" || m.from_role === "pro" || m.from_role === "client"
                      ? "justify-end"
                      : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      m.from_role === "user" || m.from_role === "pro" || m.from_role === "client"
                        ? "bg-primary text-white"
                        : m.message_type === "system"
                          ? "bg-slate-200 text-slate-700 italic"
                          : "bg-white border border-slate-200 text-slate-800"
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div
                      className={cn(
                        "mt-1 text-[11px]",
                        m.from_role === "user" || m.from_role === "pro" || m.from_role === "client"
                          ? "text-white/80"
                          : "text-slate-500"
                      )}
                    >
                      {m.from_role === "user" || m.from_role === "pro" || m.from_role === "client"
                        ? "Vous"
                        : m.from_role === "admin"
                          ? "Support"
                          : ""}{" "}
                      · {formatDate(m.created_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      <div className={cn(!compact && "mt-3", compact && "mt-2 px-1 pb-1")}>
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && text.trim() && canChat) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={
              !enabled
                ? "Connectez-vous pour discuter"
                : !online
                  ? "Chat hors ligne — revenez entre 9h et 19h"
                  : "Écrivez votre message…"
            }
            disabled={!canChat || sending}
          />
          <Button
            type="button"
            className="gap-2"
            onClick={handleSend}
            disabled={!canChat || !text.trim() || sending}
            size={compact ? "icon" : "default"}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {!compact && "Envoyer"}
          </Button>
        </div>
        {!online && !compact ? (
          <div className="mt-2 text-xs text-slate-500">Le chat est grisé hors horaires (9h–19h).</div>
        ) : null}
      </div>
    </div>
  );
}
