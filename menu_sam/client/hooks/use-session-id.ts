import * as React from "react";

const STORAGE_KEY = "sam_session_id_v1";

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `sess_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function useSessionId() {
  const [sessionId] = React.useState(() => {
    if (typeof window === "undefined") return generateId();

    try {
      const existing = window.localStorage.getItem(STORAGE_KEY);
      if (existing) return existing;

      const next = generateId();
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    } catch {
      return generateId();
    }
  });

  return sessionId;
}
