import * as React from "react";

export type OrderCountdown = {
  nowMs: number;
  remainingMs: number;
  isExpired: boolean;
  formatted: string;
};

function formatMs(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useOrderCountdown(expiresAtMs: number | null): OrderCountdown | null {
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!expiresAtMs) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAtMs]);

  if (!expiresAtMs) return null;

  const remainingMs = expiresAtMs - nowMs;
  const isExpired = remainingMs <= 0;

  return {
    nowMs,
    remainingMs,
    isExpired,
    formatted: formatMs(remainingMs),
  };
}
