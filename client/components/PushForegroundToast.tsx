/**
 * PushForegroundToast
 *
 * Listens for push notifications received while the app is in the foreground
 * and displays them as toast messages using the existing toast system.
 */

import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import type { MessagePayload } from "firebase/messaging";

export function PushForegroundToast() {
  const { toast } = useToast();

  useEffect(() => {
    const handler = (event: Event) => {
      const payload = (event as CustomEvent<MessagePayload>).detail;
      if (!payload) return;

      const title = payload.notification?.title || "Sortir Au Maroc";
      const body = payload.notification?.body || "";

      toast({
        title,
        description: body,
        duration: 8000,
      });
    };

    window.addEventListener("sam:push_foreground_message", handler);
    return () =>
      window.removeEventListener("sam:push_foreground_message", handler);
  }, [toast]);

  return null;
}
