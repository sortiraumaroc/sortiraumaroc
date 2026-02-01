const STORAGE_KEY = "sam_visit_session_id_v1";

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function getSessionId(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && isUuid(existing)) return existing;

    const next = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : fallbackUuid();
    window.localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : fallbackUuid();
  }
}

export function getVisitSessionId(): string {
  return getSessionId();
}

function fallbackUuid(): string {
  const hex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

export async function trackEstablishmentVisit(args: { establishmentId: string; path?: string }) {
  if (!args.establishmentId || !isUuid(args.establishmentId)) return;

  const sessionId = getSessionId();

  try {
    await fetch(`/api/public/establishments/${encodeURIComponent(args.establishmentId)}/visit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionId,
        path: (args.path ?? window.location.pathname).slice(0, 500),
      }),
    });
  } catch {
    return;
  }
}
