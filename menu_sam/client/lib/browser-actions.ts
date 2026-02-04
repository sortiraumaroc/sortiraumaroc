export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined") return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall back below
  }

  try {
    if (typeof document === "undefined") return false;
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    el.style.top = "0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function downloadDataUrl(filename: string, dataUrl: string): boolean {
  try {
    if (typeof document === "undefined") return false;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
    return true;
  } catch {
    return false;
  }
}
