export type AvatarDataUrlResult =
  | { ok: true; dataUrl: string }
  | { ok: false; message: string };

const DEFAULT_MAX_DIM = 256;
const DEFAULT_MAX_INPUT_BYTES = 6 * 1024 * 1024;

function isImageType(type: string): boolean {
  return type.toLowerCase().startsWith("image/");
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });

  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("invalid_data_url");
  }

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = dataUrl;
  });
  return img;
}

async function loadDrawable(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D) => void }> {
  const anyWin = window as unknown as { createImageBitmap?: (blob: Blob) => Promise<ImageBitmap> };

  if (typeof anyWin.createImageBitmap === "function") {
    try {
      const bmp = await anyWin.createImageBitmap(file);
      return {
        width: bmp.width,
        height: bmp.height,
        draw: (ctx) => {
          ctx.drawImage(bmp, 0, 0);
          bmp.close();
        },
      };
    } catch {
      // fallback below
    }
  }

  const img = await loadImageFromFile(file);
  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    draw: (ctx) => ctx.drawImage(img, 0, 0),
  };
}

function clampPositiveInt(v: number, fallback: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function scaleToFit(w: number, h: number, maxDim: number): { w: number; h: number } {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { w: maxDim, h: maxDim };
  const scale = Math.min(1, maxDim / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function tryEncode(canvas: HTMLCanvasElement, mime: string, quality?: number): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (canvas as any).toDataURL(mime, quality);
  } catch {
    return canvas.toDataURL();
  }
}

function pickBestDataUrl(canvas: HTMLCanvasElement): string {
  const webp = tryEncode(canvas, "image/webp", 0.85);
  if (webp.startsWith("data:image/webp")) return webp;

  const jpegHigh = tryEncode(canvas, "image/jpeg", 0.85);
  if (jpegHigh.startsWith("data:image/jpeg")) return jpegHigh;

  return canvas.toDataURL();
}

export async function fileToAvatarDataUrl(
  file: File,
  opts?: { maxDim?: number; maxInputBytes?: number; maxOutputChars?: number },
): Promise<AvatarDataUrlResult> {
  const maxDim = clampPositiveInt(opts?.maxDim ?? DEFAULT_MAX_DIM, DEFAULT_MAX_DIM);
  const maxInputBytes = clampPositiveInt(opts?.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES, DEFAULT_MAX_INPUT_BYTES);
  const maxOutputChars = clampPositiveInt(opts?.maxOutputChars ?? 750_000, 750_000);

  if (!isImageType(file.type)) return { ok: false, message: "Fichier non supporté" };
  if (file.size > maxInputBytes) return { ok: false, message: "Image trop lourde" };

  try {
    const drawable = await loadDrawable(file);

    const attempts = [maxDim, Math.round(maxDim * 0.85), Math.round(maxDim * 0.7)].map((d) => Math.max(96, d));

    for (const dim of attempts) {
      const target = scaleToFit(drawable.width, drawable.height, dim);

      const canvas = document.createElement("canvas");
      canvas.width = target.w;
      canvas.height = target.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return { ok: false, message: "Impossible de traiter l'image" };

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      ctx.save();
      ctx.scale(target.w / drawable.width, target.h / drawable.height);
      drawable.draw(ctx);
      ctx.restore();

      const dataUrl = pickBestDataUrl(canvas);
      if (dataUrl.length <= maxOutputChars) return { ok: true, dataUrl };

      const jpegLow = tryEncode(canvas, "image/jpeg", 0.7);
      if (jpegLow.startsWith("data:image/jpeg") && jpegLow.length <= maxOutputChars) return { ok: true, dataUrl: jpegLow };

      const jpegLower = tryEncode(canvas, "image/jpeg", 0.6);
      if (jpegLower.startsWith("data:image/jpeg") && jpegLower.length <= maxOutputChars) return { ok: true, dataUrl: jpegLower };
    }

    return { ok: false, message: "Image trop lourde après compression" };
  } catch {
    return { ok: false, message: "Impossible de lire l'image" };
  }
}
