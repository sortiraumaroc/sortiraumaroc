/**
 * Sam AI Assistant — API helper frontend (SSE streaming)
 */

import { getConsumerAccessToken } from "./auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SamEstablishmentItem {
  id: string;
  slug: string | null;
  name: string;
  universe: string;
  subcategory: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  cover_url: string | null;
  booking_enabled: boolean;
  google_rating: number | null;
  google_review_count: number | null;
  promo_percent: number | null;
  next_slot_at: string | null;
  reservations_30d: number;
  lat: number | null;
  lng: number | null;
}

export interface SamSSEEvent {
  type:
    | "text_delta"
    | "tool_call"
    | "tool_result"
    | "establishments"
    | "done"
    | "error"
    | "auth_required";
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  data?: unknown;
  items?: SamEstablishmentItem[];
  conversation_id?: string;
  tokens?: { input: number; output: number };
  message?: string;
  code?: string;
}

export interface StreamSamChatParams {
  message: string;
  conversationId?: string;
  sessionId: string;
  universe?: string;
  onTextDelta: (text: string) => void;
  onEstablishments: (items: SamEstablishmentItem[]) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => void;
  onAuthRequired: () => void;
  onDone: (meta: { conversationId: string; tokens?: { input: number; output: number } }) => void;
  onError: (message: string) => void;
}

// ---------------------------------------------------------------------------
// SSE streaming
// ---------------------------------------------------------------------------

export function streamSamChat(params: StreamSamChatParams): AbortController {
  const controller = new AbortController();

  void (async () => {
    try {
      const token = await getConsumerAccessToken();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch("/api/sam/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: params.message,
          conversation_id: params.conversationId,
          session_id: params.sessionId,
          universe: params.universe,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "unknown" }));
        params.onError(err.error ?? "Erreur de connexion avec Sam");
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        params.onError("Streaming non supporté");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event: SamSSEEvent = JSON.parse(jsonStr);

            switch (event.type) {
              case "text_delta":
                if (event.content) params.onTextDelta(event.content);
                break;
              case "establishments":
                if (event.items?.length) params.onEstablishments(event.items);
                break;
              case "tool_call":
                if (event.name)
                  params.onToolCall(event.name, event.args ?? {});
                break;
              case "auth_required":
                params.onAuthRequired();
                break;
              case "done":
                params.onDone({
                  conversationId: event.conversation_id ?? "",
                  tokens: event.tokens,
                });
                break;
              case "error":
                params.onError(
                  event.message ?? "Sam a rencontré un problème",
                );
                break;
            }
          } catch {
            // Ligne SSE malformée — ignorer
          }
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      params.onError("Connexion perdue avec Sam");
    }
  })();

  return controller;
}

// ---------------------------------------------------------------------------
// Session ID management
// ---------------------------------------------------------------------------

const SESSION_KEY = "sam_session_id";

export function getSamSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}
