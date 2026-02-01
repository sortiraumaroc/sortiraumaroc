export type CmsImageCrop = {
  /** crop center in normalized [0..1] coordinates relative to the source image */
  centerX: number;
  centerY: number;
  /** zoom >= 1 (higher = tighter crop) */
  zoom: number;
};

export type CmsProcessedImage = {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
};

const DEFAULT_TARGET_WIDTH = 1200;
const DEFAULT_TARGET_HEIGHT = 675;
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_INPUT_BYTES = 12 * 1024 * 1024;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

async function loadImageBitmap(file: File): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  const anyWin = window as unknown as { createImageBitmap?: (blob: Blob) => Promise<ImageBitmap> };
  if (typeof anyWin.createImageBitmap === "function") {
    const bmp = await anyWin.createImageBitmap(file);
    return { bitmap: bmp, width: bmp.width, height: bmp.height };
  }

  // Fallback: decode via Image + canvas.
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  ctx.drawImage(img, 0, 0);

  const bmp = await createImageBitmap(canvas);
  return { bitmap: bmp, width: bmp.width, height: bmp.height };
}

function computeMaxCropRect16by9(srcW: number, srcH: number): { w: number; h: number } {
  const aspect = 16 / 9;
  const srcAspect = srcW / srcH;
  if (srcAspect >= aspect) {
    // wider than 16:9 => height limited
    const h = srcH;
    const w = Math.round(h * aspect);
    return { w, h };
  }
  // taller than 16:9 => width limited
  const w = srcW;
  const h = Math.round(w / aspect);
  return { w, h };
}

async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mime, quality);
    } catch {
      resolve(null);
    }
  });
}

async function encodeWithinLimit(args: {
  canvas: HTMLCanvasElement;
  maxBytes: number;
}): Promise<{ blob: Blob; mimeType: string } | null> {
  const { canvas, maxBytes } = args;

  const attempts: Array<{ mime: string; qualities: number[] }> = [
    { mime: "image/webp", qualities: [0.9, 0.85, 0.8, 0.75, 0.7] },
    { mime: "image/jpeg", qualities: [0.9, 0.85, 0.8, 0.75, 0.7, 0.65] },
  ];

  for (const { mime, qualities } of attempts) {
    for (const q of qualities) {
      const blob = await canvasToBlob(canvas, mime, q);
      if (!blob) continue;
      if (blob.size <= maxBytes) return { blob, mimeType: mime };
    }
  }

  // Last resort: PNG (might be large but avoids total failure)
  const png = await canvasToBlob(canvas, "image/png", 1);
  if (png && png.size <= maxBytes) return { blob: png, mimeType: "image/png" };

  return null;
}

export function defaultCropForImage(): CmsImageCrop {
  return { centerX: 0.5, centerY: 0.5, zoom: 1 };
}

export function isSupportedImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export async function processCmsBlogImage(args: {
  file: File;
  crop: CmsImageCrop;
  targetWidth?: number;
  targetHeight?: number;
  maxOutputBytes?: number;
  maxInputBytes?: number;
}): Promise<{ ok: true; image: CmsProcessedImage } | { ok: false; message: string }> {
  const targetWidth = args.targetWidth ?? DEFAULT_TARGET_WIDTH;
  const targetHeight = args.targetHeight ?? DEFAULT_TARGET_HEIGHT;
  const maxOutputBytes = args.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const maxInputBytes = args.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;

  if (!isSupportedImageFile(args.file)) return { ok: false, message: "Fichier non supporté" };
  if (args.file.size > maxInputBytes) return { ok: false, message: "Image trop lourde" };

  try {
    const { bitmap, width: srcW, height: srcH } = await loadImageBitmap(args.file);

    const crop = args.crop;
    const centerX = clamp01(crop.centerX);
    const centerY = clamp01(crop.centerY);
    const zoom = clamp(crop.zoom, 1, 4);

    const maxCrop = computeMaxCropRect16by9(srcW, srcH);
    const cropW = Math.max(1, Math.round(maxCrop.w / zoom));
    const cropH = Math.max(1, Math.round(maxCrop.h / zoom));

    const centerPxX = centerX * srcW;
    const centerPxY = centerY * srcH;

    const halfW = cropW / 2;
    const halfH = cropH / 2;

    const sx = Math.round(clamp(centerPxX - halfW, 0, srcW - cropW));
    const sy = Math.round(clamp(centerPxY - halfH, 0, srcH - cropH));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { ok: false, message: "Impossible de traiter l'image" };
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(bitmap, sx, sy, cropW, cropH, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const encoded = await encodeWithinLimit({ canvas, maxBytes: maxOutputBytes });
    if (!encoded) return { ok: false, message: "Image trop lourde après compression" };

    return {
      ok: true,
      image: {
        blob: encoded.blob,
        mimeType: encoded.mimeType,
        width: targetWidth,
        height: targetHeight,
        sizeBytes: encoded.blob.size,
      },
    };
  } catch {
    return { ok: false, message: "Impossible de lire l'image" };
  }
}
