import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getOrCreateChatSession,
  sendChatMessage,
  getChatMessages,
  isSupportOnline,
  getSupportHoursLabel,
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
};

export function SupportChatPanel({ className, enabled, establishmentId }: Props) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check online status periodically
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const online = useMemo(() => isSupportOnline(new Date()), [tick]);

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

  // Poll for new messages
  const pollMessages = useCallback(async () => {
    if (!session?.id) return;

    try {
      const lastMessage = messages[messages.length - 1];
      const res = await getChatMessages(session.id, lastMessage?.created_at);

      if (res.messages.length > 0) {
        setMessages((prev) => {
          // Merge new messages, avoiding duplicates
          const existingIds = new Set(prev.map((m) => m.id));
          const newMessages = res.messages.filter((m) => !existingIds.has(m.id));
          return [...prev, ...newMessages];
        });
      }
    } catch (e) {
      console.error("Error polling messages:", e);
    }
  }, [session?.id, messages]);

  // Initial load
  useEffect(() => {
    if (enabled) {
      void initSession();
    }
  }, [enabled, initSession]);

  // Start polling when session is active
  useEffect(() => {
    if (session?.id && session.status === "active" && online) {
      // Poll every 5 seconds
      pollIntervalRef.current = setInterval(() => {
        void pollMessages();
      }, 5000);

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    }
  }, [session?.id, session?.status, online, pollMessages]);

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

      // Add message to local state
      setMessages((prev) => [...prev, res.message]);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  const canChat = enabled && online && session?.status === "active";

  return (
    <div className={cn("rounded-lg border-2 border-slate-200 bg-white p-4 md:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          <div>
            <div className="font-bold text-foreground">Chat</div>
            <div className="text-sm text-slate-600">{getSupportHoursLabel()}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {enabled && session && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void pollMessages()}
              title="Actualiser"
              className="h-8 w-8"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
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

      {!enabled ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Connectez-vous pour accéder au chat.
        </div>
      ) : null}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className={cn("mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3", !canChat ? "opacity-60" : "")}>
          <div className="max-h-[320px] overflow-auto space-y-3">
            {messages.length === 0 ? (
              <div className="text-sm text-slate-600">Aucun message pour le moment.</div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex",
                    m.from_role === "user" || m.from_role === "pro" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      m.from_role === "user" || m.from_role === "pro"
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
                        m.from_role === "user" || m.from_role === "pro" ? "text-white/80" : "text-slate-500"
                      )}
                    >
                      {m.from_role === "user" || m.from_role === "pro"
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

      <div className="mt-3">
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
                  ? "Chat indisponible — revenez entre 9h et 19h"
                  : "Écrivez votre message…"
            }
            disabled={!canChat || sending}
          />
          <Button
            type="button"
            className="gap-2"
            onClick={handleSend}
            disabled={!canChat || !text.trim() || sending}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Envoyer
          </Button>
        </div>
        {!online ? (
          <div className="mt-2 text-xs text-slate-500">Le chat est grisé hors horaires (9h–19h).</div>
        ) : null}
      </div>
    </div>
  );
}
