/**
 * Sam AI Assistant — Hook React principal
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  streamSamChat,
  getSamSessionId,
  type SamEstablishmentItem,
} from "../lib/samApi";
import { isAuthed, openAuthModal } from "../lib/auth";
import { detectSamMood, type SamMood } from "../lib/samMood";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SamMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  establishments?: SamEstablishmentItem[];
  isLoading?: boolean;
  isError?: boolean;
  mood?: SamMood;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSam(universe?: string | null) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<SamMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messageIdCounter = useRef(0);
  const universeRef = useRef(universe);
  universeRef.current = universe;
  /** Message en attente de connexion pour reprendre le flow réservation */
  const pendingAuthRetry = useRef<boolean>(false);
  const wasAuthed = useRef(isAuthed());

  // Nettoyer l'AbortController au démontage
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Reprise post-auth : surveiller le changement d'état d'authentification
  useEffect(() => {
    const interval = setInterval(() => {
      const nowAuthed = isAuthed();
      if (!wasAuthed.current && nowAuthed && pendingAuthRetry.current) {
        // L'utilisateur vient de se connecter après un auth_required
        pendingAuthRetry.current = false;
        // Envoyer un message pour que Sam reprenne le flow
        sendMessage("C'est bon, je suis connecté ! On reprend ?");
      }
      wasAuthed.current = nowAuthed;
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nextId = useCallback(() => {
    messageIdCounter.current++;
    return `msg-${messageIdCounter.current}-${Date.now()}`;
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      // Ajouter le message utilisateur
      const userMsg: SamMessage = {
        id: nextId(),
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };

      // Ajouter un message assistant en cours de chargement
      const assistantMsgId = nextId();
      const assistantMsg: SamMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        isLoading: true,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      // Annuler le stream précédent si encore actif
      abortRef.current?.abort();

      const sessionId = getSamSessionId();

      const controller = streamSamChat({
        message: trimmed,
        conversationId: conversationId ?? undefined,
        sessionId,
        universe: universeRef.current ?? undefined,

        onTextDelta: (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content + delta, isLoading: false }
                : m,
            ),
          );
        },

        onEstablishments: (items) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantMsgId) return m;
              const existing = m.establishments ?? [];
              const existingIds = new Set(existing.map((e) => e.id));
              const newItems = items.filter((e) => !existingIds.has(e.id));
              if (!newItems.length) return m;
              return {
                ...m,
                establishments: [...existing, ...newItems],
              };
            }),
          );
        },

        onToolCall: (_name, _args) => {
          // Optionnel : montrer un indicateur "Sam cherche..."
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId && !m.content
                ? { ...m, isLoading: true }
                : m,
            ),
          );
        },

        onAuthRequired: () => {
          pendingAuthRetry.current = true;
          openAuthModal();
        },

        onDone: (meta) => {
          setConversationId(meta.conversationId);
          setIsLoading(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    isLoading: false,
                    mood: detectSamMood(
                      m.content,
                      (m.establishments?.length ?? 0) > 0,
                      false,
                    ),
                  }
                : m,
            ),
          );
        },

        onError: (errorMsg) => {
          setIsLoading(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: errorMsg,
                    isLoading: false,
                    isError: true,
                    mood: "triste" as SamMood,
                  }
                : m,
            ),
          );
        },
      });

      abortRef.current = controller;
    },
    [isLoading, conversationId, nextId],
  );

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setIsLoading(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    isOpen,
    setIsOpen,
    toggle,
    messages,
    isLoading,
    sendMessage,
    clearMessages,
    conversationId,
    isAuthenticated: isAuthed(),
    universe,
  };
}
