const PRO_AVATAR_EVENT = "sam_pro_avatar_changed_v1";

function storageKey(userId: string): string {
  return `sam_pro_avatar_v1:${userId}`;
}

export function getProProfileAvatar(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const v = String(raw ?? "").trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

export function setProProfileAvatar(userId: string, dataUrl: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(userId);
    if (!dataUrl) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, dataUrl);
    }
  } catch {
  }

  try {
    window.dispatchEvent(new CustomEvent(PRO_AVATAR_EVENT, { detail: { userId } }));
  } catch {
    window.dispatchEvent(new Event(PRO_AVATAR_EVENT));
  }
}

export function subscribeToProProfileAvatarChanges(cb: (args: { userId?: string }) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onEvent = (e: Event) => {
    const anyE = e as CustomEvent<{ userId?: string }>;
    cb({ userId: anyE.detail?.userId });
  };

  const onStorage = (e: StorageEvent) => {
    if (!e.key) return;
    if (!e.key.startsWith("sam_pro_avatar_v1:")) return;
    cb({ userId: e.key.split(":", 2)[1] });
  };

  window.addEventListener(PRO_AVATAR_EVENT, onEvent);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(PRO_AVATAR_EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}
