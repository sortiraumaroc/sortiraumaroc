import * as React from "react";

export type ChatRole = "user" | "assistant";

export interface ChatProductItem {
  id: string;
  title: string;
  price: string;
  image: string;
  description?: string;
}

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  products?: ChatProductItem[];
};

const STORAGE_KEY = "sam_chat_v1";

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    (v.role === "user" || v.role === "assistant") &&
    typeof v.content === "string" &&
    typeof v.createdAt === "number"
  );
}

function loadInitial(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed = safeParse(raw);
  if (!Array.isArray(parsed)) return [];
  const messages = parsed.filter(isChatMessage);
  return messages;
}

function save(messages: ChatMessage[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // ignore
  }
}

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

export function useChatHistory() {
  const [messages, setMessages] = React.useState<ChatMessage[]>(() => loadInitial());

  React.useEffect(() => {
    save(messages);
  }, [messages]);

  const clear = React.useCallback(() => {
    setMessages([]);
  }, []);

  const append = React.useCallback((role: ChatRole, content: string, products?: ChatProductItem[]) => {
    const trimmed = content.trim();
    if (trimmed.length === 0) return null;

    const msg: ChatMessage = {
      id: newId(),
      role,
      content: trimmed,
      createdAt: Date.now(),
      ...(products && products.length > 0 && { products }),
    };

    setMessages((prev) => [...prev, msg]);
    return msg.id;
  }, []);

  return { messages, setMessages, append, clear };
}
