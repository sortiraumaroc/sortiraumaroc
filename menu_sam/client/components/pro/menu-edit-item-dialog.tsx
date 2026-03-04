import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const AVAILABLE_BADGES = [
  { value: "specialite", label: "Spécialité" },
  { value: "nouveau", label: "Nouveau" },
  { value: "best-seller", label: "Best-seller" },
  { value: "coup-de-coeur", label: "Coup de cœur" },
  { value: "suggestion-chef", label: "Suggestion du chef" },
  { value: "vegetarien", label: "Végétarien" },
  { value: "epice", label: "Épicé" },
  { value: "fruits-mer", label: "Fruits de mer" },
  { value: "healthy", label: "Healthy" },
  { value: "traditionnel", label: "Traditionnel" },
  { value: "signature", label: "Signature" },
];

type ItemLike = {
  id: string;
  title: string;
  description: string | null;
  base_price: number | null;
  currency: string;
  image_src?: string | null;
  label?: string | null;
};

type SaveValues = {
  title: string;
  description: string;
  base_price: number | null;
  image_src: string | null;
  label?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemLike;
  onSave: (values: SaveValues) => Promise<void> | void;
  ciBaseUrl?: string;
};

function isImage(file: File) {
  return file.type?.startsWith("image/");
}

function toNumberOrNull(v: string): number | null {
  const raw = v.trim();
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}

export function MenuEditItemDialog({
  open,
  onOpenChange,
  item,
  onSave,
  ciBaseUrl = "https://www.sam.ma",
}: Props) {
  const [title, setTitle] = React.useState(item.title);
  const [description, setDescription] = React.useState(item.description ?? "");
  const [price, setPrice] = React.useState<string>(() =>
    typeof item.base_price === "number" ? String(item.base_price) : "",
  );
  const [label, setLabel] = React.useState(item.label ?? "");

  const [imageSrc, setImageSrc] = React.useState(item.image_src ?? "");
  const [imageFile, setImageFile] = React.useState<File | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  const preview = React.useMemo(() => {
    if (imageFile) return URL.createObjectURL(imageFile);

    const saved = imageSrc.trim();
    if (!saved) return "/placeholder.svg";

    const looksLikeUrl = /^https?:\/\//i.test(saved);
    if (looksLikeUrl) return saved;

    return `${ciBaseUrl}/assets/uploads/menu/${saved}`;
  }, [imageFile, imageSrc, ciBaseUrl]);

  React.useEffect(() => {
    if (!imageFile) return;
    return () => {
      try {
        URL.revokeObjectURL(preview);
      } catch { }
    };
  }, [imageFile, preview]);

  React.useEffect(() => {
    if (!open) return;
    setTitle(item.title);
    setDescription(item.description ?? "");
    setPrice(typeof item.base_price === "number" ? String(item.base_price) : "");
    setLabel(item.label ?? "");
    setImageSrc(item.image_src ?? "");
    setImageFile(null);
    setSaving(false);
    setUploading(false);
  }, [item, open]);

  async function uploadToCI(file: File): Promise<string> {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);

      const res = await fetch(`${ciBaseUrl}/api/upload_digital/menu`, {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.status) {
        const msg = data?.error_message || data?.error || "Upload impossible";
        throw new Error(msg);
      }

      const fileName = data?.fileName;
      if (!fileName || typeof fileName !== "string") {
        throw new Error("Upload OK mais fileName manquant");
      }

      return fileName;
    } finally {
      setUploading(false);
    }
  }

  const busy = saving || uploading;
  const canSubmit = !busy && !!title.trim();

  // ✅ CSS ONLY: light, clean, professional
  const inputBase =
    "mt-1 h-11 rounded-xl border border-slate-200 bg-white text-slate-900 " +
    "placeholder:text-slate-400 shadow-sm " +
    "focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-0";
  const labelBase = "text-xs font-medium text-slate-600";
  const helperText = "text-[11px] leading-snug text-slate-500";

  const badgeBase =
    "rounded-xl px-3 py-2 text-left text-sm border transition " +
    "active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";
  const badgeActive = "bg-sam-red text-white  shadow-sm";
  const badgeIdle =
    "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-[92vw] max-w-[600px] p-0 overflow-hidden",
          "rounded-2xl border border-slate-200",
          "bg-white text-slate-900",
          "shadow-xl shadow-black/10",
          "max-h-[85vh]",
        )}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-200">
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-base font-semibold tracking-tight text-slate-900">
              Modifier le plat
            </DialogTitle>
            <DialogDescription className="text-sm leading-snug text-slate-500">
              Mettez à jour la photo, le nom, la description, le prix et le badge.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 overflow-y-auto max-h-[calc(85vh-150px)]">
          <div className="space-y-6 pt-4">
            {/* Image + fields */}
            <div className="grid grid-cols-[96px_1fr] gap-4 sm:grid-cols-[140px_1fr]">
<div className="h-[96px] sm:h-[140px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
  <img
    src={preview}
    alt={title || "Aperçu"}
    className="h-full w-full object-cover block"
  />
</div>


              <div className="space-y-4">
                <div>
                  <label className={labelBase}>Photo (fichier)</label>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (!f) return;
                      if (!isImage(f)) {
                        toast.error("Veuillez choisir une image.");
                        return;
                      }
                      setImageFile(f);
                    }}
                    className={cn(
                      inputBase,
                      "file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-700 hover:file:bg-slate-200",
                    )}
                  />

                  <div className="mt-2 flex items-center justify-between gap-2">
                    {imageFile ? (
                      <>
                        <span className={cn(helperText, "line-clamp-1")}>
                          {imageFile.name}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 rounded-xl px-3 text-xs bg-slate-100 hover:bg-slate-200 text-slate-900"
                          onClick={() => setImageFile(null)}
                          disabled={busy}
                        >
                          Retirer
                        </Button>
                      </>
                    ) : (
                      <span className={cn(helperText, "line-clamp-1")}>
                        {imageSrc?.trim()
                          ? `Image actuelle: ${imageSrc.trim()}`
                          : "Aucune image"}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className={labelBase}>Nom</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={busy}
                    className={inputBase}
                  />
                </div>
              </div>
            </div>

            {/* Price + helper */}
            <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
              <div>
                <label className={labelBase}>Prix (Dhs)</label>
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="Ex : 45"
                  disabled={busy}
                  className={inputBase}
                />
                <div className={cn("mt-2 sm:hidden", helperText)}>
                  Devise : <span className="text-slate-700">{item.currency}</span>{" "}
                  — laissez vide pour masquer le prix.
                </div>
              </div>

              <div className="hidden sm:block rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm text-slate-600">
                  Devise :{" "}
                  <span className="font-semibold text-slate-900">
                    {item.currency}
                  </span>
                </div>
                <div className={cn("mt-1", helperText)}>
                  Astuce : laissez vide pour masquer le prix.
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className={labelBase}>Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex : Sauce maison, frites, salade..."
                disabled={busy}
                className={cn(
                  "mt-1 min-h-[110px] rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm",
                  "focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-0",
                )}
              />
            </div>

            {/* Badges */}
            <div>
              <label className={cn(labelBase, "block mb-2")}>Badge (Label)</label>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setLabel("")}
                  disabled={busy}
                  className={cn(badgeBase, !label ? badgeActive : badgeIdle)}
                >
                  Aucun
                </button>

                {AVAILABLE_BADGES.map((b) => {
                  const active = label === b.value;
                  return (
                    <button
                      key={b.value}
                      type="button"
                      onClick={() => setLabel(active ? "" : b.value)}
                      disabled={busy}
                      className={cn(badgeBase, active ? badgeActive : badgeIdle)}
                    >
                      {b.label}
                    </button>
                  );
                })}
              </div>

              <div className={cn("mt-2", helperText)}>
                Astuce : cliquez sur un badge actif pour le désélectionner.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="sticky bottom-0 border-t border-slate-200 bg-white px-6 py-4 gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Annuler
          </Button>

          <Button
            type="button"
            className="h-11 rounded-xl bg-slate-900 text-white bg-sam-red hover:bg-slate-800 shadow-sm"
            disabled={!canSubmit}
            onClick={async () => {
              if (!canSubmit) return;

              const trimmedTitle = title.trim();
              const nextPrice = toNumberOrNull(price);

              setSaving(true);
              try {
                let nextImageSrc: string | null = imageSrc.trim()
                  ? imageSrc.trim()
                  : null;

                if (imageFile) {
                  const fileName = await uploadToCI(imageFile);
                  nextImageSrc = fileName;
                }

                await Promise.resolve(
                  onSave({
                    title: trimmedTitle,
                    description: description.trim(),
                    base_price: nextPrice,
                    image_src: nextImageSrc,
                    label: label || null,
                  }),
                );

                onOpenChange(false);
              } catch (e: any) {
                console.error(e);
                toast.error(e?.message || "Sauvegarde impossible");
              } finally {
                setSaving(false);
              }
            }}
          >
            {uploading ? "Upload..." : saving ? "Sauvegarde..." : "Valider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
