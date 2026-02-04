import * as React from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  type: "text" | "products";
  text: string;
  items?: Array<{
    id: string;
    title: string;
    price: string;
    image: string;
    description: string;
  }>;
}

interface UseOpenAiChatOptions {
  placeName: string;
  placeId: number;
  menu: any;
}

export function useOpenAiChat(options: UseOpenAiChatOptions) {
  const { placeName, placeId, menu } = options;

  const getResponse = React.useCallback(
    async (messages: ChatMessage[]): Promise<ChatResponse | null> => {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            placeId,
            placeName,
            menu,
          }),
        });

        if (!response.ok) {
          console.error("Chat API error:", response.status);
          return null;
        }

        const data = (await response.json()) as ChatResponse;
        return data;
      } catch (error) {
        console.error("Error calling chat API:", error);
        return null;
      }
    },
    [placeName, placeId, menu],
  );

  return { getResponse };
}
