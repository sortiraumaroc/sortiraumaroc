import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { defaultCropForImage, type CmsImageCrop } from "@/lib/cmsImage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  value?: CmsImageCrop;
  onConfirm: (crop: CmsImageCrop) => void;
};

type LoadedImage = {
  objectUrl: string;
  bitmap: ImageBitmap;
  width: number;
  height: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function computeMaxCropRect16by9(srcW: number, srcH: number): { w: number; h: number } {
  const aspect = 16 / 9;
  const srcAspect = srcW / srcH;
  if (srcAspect >= aspect) {
    const h = srcH;
    const w = Math.round(h * aspect);
    return { w, h };
  }
  const w = srcW;
  const h = Math.round(w / aspect);
  return { w, h };
}

export function ImageCropDialog({ open, onOpenChange, file, value, onConfirm }: Props) {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [crop, setCrop] = useState<CmsImageCrop>(() => value ?? defaultCropForImage());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<null | {
    startX: number;
    startY: number;
    startCrop: CmsImageCrop;
  }>(null);

  const previewSize = useMemo(() => ({ w: 720, h: 405 }), []); // 16:9

  useEffect(() => {
    if (!open) return;
    setCrop(value ?? defaultCropForImage());
  }, [open, value]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!open || !file) {
        setLoaded(null);
        return;
      }

      const url = URL.createObjectURL(file);
      try {
        const bmp = await createImageBitmap(file);
        if (cancelled) {
          bmp.close();
          URL.revokeObjectURL(url);
          return;
        }
        setLoaded({ objectUrl: url, bitmap: bmp, width: bmp.width, height: bmp.height });
      } catch {
        URL.revokeObjectURL(url);
        setLoaded(null);
      }
    }

    void run();

    return () => {
      cancelled = true;
      setLoaded((prev) => {
        if (prev) {
          try {
            prev.bitmap.close();
          } catch {
            // ignore
          }
          URL.revokeObjectURL(prev.objectUrl);
        }
        return null;
      });
    };
  }, [open, file]);

  const renderPreview = useCallback(() => {
    const img = loaded;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const srcW = img.width;
    const srcH = img.height;
    const centerX = clamp01(crop.centerX);
    const centerY = clamp01(crop.centerY);
    const zoom = clamp(crop.zoom, 1, 4);

    const maxCrop = computeMaxCropRect16by9(srcW, srcH);
    const cropW = Math.max(1, Math.round(maxCrop.w / zoom));
    const cropH = Math.max(1, Math.round(maxCrop.h / zoom));

    const centerPxX = centerX * srcW;
    const centerPxY = centerY * srcH;

    const sx = Math.round(clamp(centerPxX - cropW / 2, 0, srcW - cropW));
    const sy = Math.round(clamp(centerPxY - cropH / 2, 0, srcH - cropH));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.bitmap, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);

    // Overlay guide
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    // rule of thirds
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    const x1 = canvas.width / 3;
    const x2 = (canvas.width * 2) / 3;
    const y1 = canvas.height / 3;
    const y2 = (canvas.height * 2) / 3;
    ctx.beginPath();
    ctx.moveTo(x1, 0);
    ctx.lineTo(x1, canvas.height);
    ctx.moveTo(x2, 0);
    ctx.lineTo(x2, canvas.height);
    ctx.moveTo(0, y1);
    ctx.lineTo(canvas.width, y1);
    ctx.moveTo(0, y2);
    ctx.lineTo(canvas.width, y2);
    ctx.stroke();
    ctx.restore();
  }, [crop, loaded]);

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!loaded) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startCrop: crop,
    };
  }, [crop, loaded]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      const img = loaded;
      if (!drag || !img) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      const maxCrop = computeMaxCropRect16by9(img.width, img.height);
      const cropW = Math.max(1, Math.round(maxCrop.w / clamp(drag.startCrop.zoom, 1, 4)));
      const cropH = Math.max(1, Math.round(maxCrop.h / clamp(drag.startCrop.zoom, 1, 4)));

      // Drag moves the image. That means crop center moves in the opposite direction.
      const deltaCenterX = (-dx * (cropW / previewSize.w)) / img.width;
      const deltaCenterY = (-dy * (cropH / previewSize.h)) / img.height;

      setCrop({
        centerX: clamp01(drag.startCrop.centerX + deltaCenterX),
        centerY: clamp01(drag.startCrop.centerY + deltaCenterY),
        zoom: drag.startCrop.zoom,
      });
    },
    [loaded, previewSize.h, previewSize.w],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const canConfirm = Boolean(loaded && file);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Recadrage image (16:9)</DialogTitle>
          <DialogDescription>
            Glissez pour cadrer. Le rendu final est normalisé en 1200×675 (16:9) et compressé sous 2Mo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Aperçu</Label>
            <div
              className={cn(
                "relative overflow-hidden rounded-lg border border-slate-200 bg-slate-950",
                "select-none touch-none",
              )}
            >
              <canvas
                ref={canvasRef}
                width={previewSize.w}
                height={previewSize.h}
                className="block w-full h-auto"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={onPointerUp}
              />
            </div>
            <div className="text-xs text-slate-600">Astuce : zoom + déplacement = cadrage propre (titre, visage, point clé).</div>
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Réglages</div>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Zoom</Label>
                  <Slider
                    value={[crop.zoom]}
                    min={1}
                    max={3}
                    step={0.05}
                    onValueChange={(v) => setCrop((prev) => ({ ...prev, zoom: v[0] ?? 1 }))}
                  />
                  <div className="text-xs text-slate-600">{Math.round(crop.zoom * 100)}%</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setCrop(defaultCropForImage())}>
                    Recentrer
                  </Button>
                </div>
              </div>
            </div>

            {file ? (
              <div className="text-xs text-slate-600">
                Fichier : <span className="font-semibold text-slate-800">{file.name}</span>
              </div>
            ) : null}

            {!loaded && file ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Impossible de charger l'image.
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              onConfirm({
                centerX: clamp01(crop.centerX),
                centerY: clamp01(crop.centerY),
                zoom: clamp(crop.zoom, 1, 4),
              });
              onOpenChange(false);
            }}
          >
            Valider le cadrage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
