export type ContentHistoryKind = "page" | "faq";

export type ContentHistoryEntry = {
  at: string; // ISO
  summary: string;
  snapshot: Record<string, unknown>;
};

function getKey(kind: ContentHistoryKind, id: string) {
  return `sam_admin_content_history_${kind}_${id}`;
}

export function loadContentHistory(kind: ContentHistoryKind, id: string): ContentHistoryEntry[] {
  try {
    const raw = localStorage.getItem(getKey(kind, id));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e && typeof e === "object") as ContentHistoryEntry[];
  } catch {
    return [];
  }
}

export function pushContentHistory(kind: ContentHistoryKind, id: string, entry: ContentHistoryEntry) {
  try {
    const current = loadContentHistory(kind, id);
    const next = [entry, ...current].slice(0, 25);
    localStorage.setItem(getKey(kind, id), JSON.stringify(next));
  } catch {
    // ignore
  }
}
