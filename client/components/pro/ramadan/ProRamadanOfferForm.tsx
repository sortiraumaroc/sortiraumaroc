/**
 * ProRamadanOfferForm — Formulaire de création/modification d'offre Ramadan
 *
 * Champs : titre, description FR/AR, type, prix, capacité, créneaux, photos,
 * conditions, dates de validité.
 */

import { useCallback, useState } from "react";
import { ArrowLeft, Plus, X, Moon, ImagePlus, Loader2, Trash2, AlertCircle, CheckCircle2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  createRamadanOffer,
  updateRamadanOffer,
} from "@/lib/pro/ramadanApi";
import { uploadProInventoryImage } from "@/lib/pro/api";
import type { RamadanOfferRow, RamadanOfferType, RamadanOfferTimeSlot } from "../../../../shared/ramadanTypes";
import { RAMADAN_OFFER_TYPE_LABELS } from "../../../../shared/ramadanTypes";

// =============================================================================
// Constants
// =============================================================================

const TITLE_MAX_LENGTH = 60;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// =============================================================================
// Types
// =============================================================================

type Props = {
  establishmentId: string;
  existingOffer?: RamadanOfferRow | null;
  onSuccess: () => void;
  onCancel: () => void;
};

type UploadingFile = {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
  previewUrl?: string;
};

const OFFER_TYPES: RamadanOfferType[] = ["ftour", "shour", "traiteur", "pack_famille", "special"];

// =============================================================================
// Component
// =============================================================================

export function ProRamadanOfferForm({
  establishmentId,
  existingOffer,
  onSuccess,
  onCancel,
}: Props) {
  const { toast } = useToast();
  const isEdit = !!existingOffer;

  // Form state
  const [title, setTitle] = useState(existingOffer?.title ?? "");
  const [descriptionFr, setDescriptionFr] = useState(existingOffer?.description_fr ?? "");
  const [descriptionAr, setDescriptionAr] = useState(existingOffer?.description_ar ?? "");
  const [type, setType] = useState<RamadanOfferType>(existingOffer?.type ?? "ftour");
  const [price, setPrice] = useState(existingOffer ? String(existingOffer.price / 100) : "");
  const [originalPrice, setOriginalPrice] = useState(
    existingOffer?.original_price ? String(existingOffer.original_price / 100) : "",
  );
  const [capacityPerSlot, setCapacityPerSlot] = useState(
    String(existingOffer?.capacity_per_slot ?? 20),
  );
  const [timeSlots, setTimeSlots] = useState<RamadanOfferTimeSlot[]>(
    existingOffer?.time_slots ?? [{ start: "18:30", end: "20:00", label: "Ftour" }],
  );
  const [coverUrl, setCoverUrl] = useState(existingOffer?.cover_url ?? "");
  const [conditionsFr, setConditionsFr] = useState(existingOffer?.conditions_fr ?? "");
  const [conditionsAr, setConditionsAr] = useState(existingOffer?.conditions_ar ?? "");
  const [validFrom, setValidFrom] = useState(existingOffer?.valid_from ?? "2026-02-19");
  const [validTo, setValidTo] = useState(existingOffer?.valid_to ?? "2026-03-19");
  const [submitting, setSubmitting] = useState(false);

  // Image upload state
  const [uploadingFile, setUploadingFile] = useState<UploadingFile | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Time slots management
  const addTimeSlot = () => {
    setTimeSlots([...timeSlots, { start: "22:00", end: "23:30", label: "S'hour" }]);
  };

  const removeTimeSlot = (index: number) => {
    setTimeSlots(timeSlots.filter((_, i) => i !== index));
  };

  const updateTimeSlot = (index: number, field: keyof RamadanOfferTimeSlot, value: string) => {
    setTimeSlots(
      timeSlots.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot)),
    );
  };

  // ─── Image upload logic ─────────────────────────────────────────────
  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Format non accepté. Formats autorisés : JPG, PNG, WebP";
    }
    if (file.size > MAX_FILE_SIZE) {
      return `Fichier trop volumineux (${formatFileSize(file.size)}). Maximum : 5 Mo`;
    }
    return null;
  };

  const uploadFile = useCallback(
    async (file: File) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = URL.createObjectURL(file);

      setUploadingFile({ id, file, progress: 0, status: "uploading", previewUrl });

      try {
        const result = await uploadProInventoryImage({
          establishmentId,
          file,
          onProgress: (percent) => {
            setUploadingFile((prev) =>
              prev && prev.id === id ? { ...prev, progress: percent } : prev,
            );
          },
        });

        // Success — set cover URL
        setCoverUrl(result.url);
        setUploadingFile((prev) =>
          prev && prev.id === id ? { ...prev, status: "success", progress: 100 } : prev,
        );

        // Clear uploading state after brief delay
        setTimeout(() => {
          setUploadingFile(null);
          URL.revokeObjectURL(previewUrl);
        }, 1500);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur lors de l'upload";
        setUploadingFile((prev) =>
          prev && prev.id === id ? { ...prev, status: "error", error: message } : prev,
        );
      }
    },
    [establishmentId],
  );

  const handleImageFiles = useCallback(
    (files: FileList | File[]) => {
      const file = Array.from(files)[0];
      if (!file) return;

      const error = validateFile(file);
      if (error) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setUploadingFile({ id, file, progress: 0, status: "error", error });
      } else {
        uploadFile(file);
      }
    },
    [uploadFile],
  );

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleImageFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (uploadingFile?.status === "uploading") return;
    const files = e.dataTransfer.files;
    if (files.length) handleImageFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (uploadingFile?.status !== "uploading") setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const removeCoverImage = () => {
    setCoverUrl("");
    if (uploadingFile?.previewUrl) URL.revokeObjectURL(uploadingFile.previewUrl);
    setUploadingFile(null);
  };

  // ─── Title handler ─────────────────────────────────────────────────
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length <= TITLE_MAX_LENGTH) {
      setTitle(value);
    }
  };

  // ─── Submit ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: "Titre requis", variant: "destructive" });
      return;
    }
    if (!price || parseFloat(price) <= 0) {
      toast({ title: "Prix invalide", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const priceCentimes = Math.round(parseFloat(price) * 100);
      const originalPriceCentimes = originalPrice
        ? Math.round(parseFloat(originalPrice) * 100)
        : undefined;

      if (isEdit && existingOffer) {
        await updateRamadanOffer(existingOffer.id, {
          establishment_id: establishmentId,
          title: title.trim(),
          description_fr: descriptionFr.trim() || undefined,
          description_ar: descriptionAr.trim() || undefined,
          type,
          price: priceCentimes,
          original_price: originalPriceCentimes,
          capacity_per_slot: parseInt(capacityPerSlot, 10) || 20,
          time_slots: timeSlots,
          cover_url: coverUrl.trim() || undefined,
          conditions_fr: conditionsFr.trim() || undefined,
          conditions_ar: conditionsAr.trim() || undefined,
          valid_from: validFrom,
          valid_to: validTo,
        });
        toast({ title: "Offre modifiée avec succès" });
      } else {
        await createRamadanOffer({
          establishment_id: establishmentId,
          title: title.trim(),
          description_fr: descriptionFr.trim() || undefined,
          description_ar: descriptionAr.trim() || undefined,
          type,
          price: priceCentimes,
          original_price: originalPriceCentimes,
          capacity_per_slot: parseInt(capacityPerSlot, 10) || 20,
          time_slots: timeSlots,
          cover_url: coverUrl.trim() || undefined,
          conditions_fr: conditionsFr.trim() || undefined,
          conditions_ar: conditionsAr.trim() || undefined,
          valid_from: validFrom,
          valid_to: validTo,
        });
        toast({ title: "Offre créée en brouillon" });
      }

      onSuccess();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Moon className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-extrabold text-slate-900">
          {isEdit ? "Modifier l'offre" : "Nouvelle offre Ramadan"}
        </h2>
      </div>

      {/* Formulaire */}
      <div className="space-y-5 max-w-2xl">
        {/* Titre avec compteur de caractères */}
        <div>
          <Label htmlFor="title" className="text-sm font-semibold">
            Titre de l'offre *
          </Label>
          <Input
            id="title"
            value={title}
            onChange={handleTitleChange}
            placeholder="ex. Ftour Royal — Menu Complet"
            maxLength={TITLE_MAX_LENGTH}
            className="mt-1"
          />
          <div className="flex items-center justify-between mt-1">
            <div className="text-xs text-slate-500">
              Choisissez un titre court et accrocheur
            </div>
            <div className={`text-xs tabular-nums ${title.length >= TITLE_MAX_LENGTH ? "text-red-500 font-medium" : "text-slate-400"}`}>
              {title.length}/{TITLE_MAX_LENGTH}
            </div>
          </div>
        </div>

        {/* Type */}
        <div>
          <Label className="text-sm font-semibold">Type d'offre *</Label>
          <Select value={type} onValueChange={(v) => setType(v as RamadanOfferType)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OFFER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {RAMADAN_OFFER_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Prix */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="price" className="text-sm font-semibold">
              Prix (MAD) *
            </Label>
            <Input
              id="price"
              type="number"
              min="0"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="150"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="originalPrice" className="text-sm font-semibold">
              Prix barré (MAD)
            </Label>
            <Input
              id="originalPrice"
              type="number"
              min="0"
              step="1"
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              placeholder="200"
              className="mt-1"
            />
          </div>
        </div>

        {/* Capacité */}
        <div>
          <Label htmlFor="capacity" className="text-sm font-semibold">
            Capacité par créneau
          </Label>
          <Input
            id="capacity"
            type="number"
            min="1"
            value={capacityPerSlot}
            onChange={(e) => setCapacityPerSlot(e.target.value)}
            className="mt-1 w-32"
          />
        </div>

        {/* Créneaux horaires */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-semibold">Créneaux horaires</Label>
            <Button variant="outline" size="sm" onClick={addTimeSlot}>
              <Plus className="h-3 w-3 mr-1" />
              Ajouter
            </Button>
          </div>
          <div className="space-y-2">
            {timeSlots.map((slot, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded border bg-slate-50">
                <Input
                  value={slot.label}
                  onChange={(e) => updateTimeSlot(i, "label", e.target.value)}
                  placeholder="Label"
                  className="w-28"
                />
                <Input
                  type="time"
                  value={slot.start}
                  onChange={(e) => updateTimeSlot(i, "start", e.target.value)}
                  className="w-28"
                />
                <span className="text-slate-400">–</span>
                <Input
                  type="time"
                  value={slot.end}
                  onChange={(e) => updateTimeSlot(i, "end", e.target.value)}
                  className="w-28"
                />
                {timeSlots.length > 1 ? (
                  <Button variant="ghost" size="sm" onClick={() => removeTimeSlot(i)}>
                    <X className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Dates de validité */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="validFrom" className="text-sm font-semibold">
              Valide du *
            </Label>
            <Input
              id="validFrom"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="validTo" className="text-sm font-semibold">
              Valide jusqu'au *
            </Label>
            <Input
              id="validTo"
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {/* Description FR */}
        <div>
          <Label htmlFor="descFr" className="text-sm font-semibold">
            Description (Français)
          </Label>
          <Textarea
            id="descFr"
            value={descriptionFr}
            onChange={(e) => setDescriptionFr(e.target.value)}
            placeholder="Décrivez votre offre Ramadan..."
            className="mt-1"
            rows={3}
          />
        </div>

        {/* Description AR */}
        <div>
          <Label htmlFor="descAr" className="text-sm font-semibold">
            Description (Arabe)
          </Label>
          <Textarea
            id="descAr"
            value={descriptionAr}
            onChange={(e) => setDescriptionAr(e.target.value)}
            placeholder="وصف العرض..."
            className="mt-1"
            rows={3}
            dir="rtl"
          />
        </div>

        {/* ─── Image de couverture (Upload) ─────────────────────────────── */}
        <div>
          <Label className="text-sm font-semibold">Image de couverture</Label>

          {/* Specs techniques */}
          <div className="text-xs text-slate-500 bg-slate-50 rounded-md p-2.5 mt-1 space-y-0.5">
            <div className="font-medium text-slate-600">Caractéristiques recommandées :</div>
            <div>Formats : JPG, PNG, WebP</div>
            <div>Résolution : 1200 × 630 px minimum (format paysage 2:1)</div>
            <div>Poids max : 5 Mo</div>
          </div>

          {/* Current cover image preview */}
          {coverUrl && !uploadingFile && (
            <div className="mt-2 relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
              <img
                src={coverUrl}
                alt="Couverture"
                className="w-full h-40 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200'%3E%3Crect fill='%23f1f5f9' width='400' height='200'/%3E%3Ctext x='200' y='100' font-family='sans-serif' font-size='14' fill='%2394a3b8' text-anchor='middle' dy='.3em'%3EImage invalide%3C/text%3E%3C/svg%3E";
                }}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={removeCoverImage}
                  className="gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </Button>
              </div>
            </div>
          )}

          {/* Upload drop zone (only when no cover set) */}
          {!coverUrl && !uploadingFile && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`
                relative mt-2 border-2 border-dashed rounded-lg p-6 text-center transition-colors
                ${dragOver ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50"}
                cursor-pointer hover:border-primary/50
              `}
            >
              <input
                type="file"
                accept={ALLOWED_EXTENSIONS.join(",")}
                onChange={handleImageInputChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-2">
                <div className={`p-3 rounded-full ${dragOver ? "bg-primary/10" : "bg-slate-100"}`}>
                  <Upload className={`w-6 h-6 ${dragOver ? "text-primary" : "text-slate-400"}`} />
                </div>
                <div className="text-sm font-medium text-slate-700">
                  {dragOver ? "Déposez l'image ici" : "Cliquez ou glissez-déposez une image"}
                </div>
                <div className="text-xs text-slate-500">
                  JPG, PNG ou WebP · Max 5 Mo
                </div>
              </div>
            </div>
          )}

          {/* Uploading status */}
          {uploadingFile && (
            <div
              className={`
                mt-2 flex items-center gap-3 p-3 rounded-lg border
                ${uploadingFile.status === "error" ? "bg-red-50 border-red-200" : ""}
                ${uploadingFile.status === "success" ? "bg-green-50 border-green-200" : ""}
                ${uploadingFile.status === "uploading" ? "bg-white border-slate-200" : ""}
              `}
            >
              {uploadingFile.previewUrl && (
                <img src={uploadingFile.previewUrl} alt="" className="w-12 h-12 object-cover rounded" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{uploadingFile.file.name}</div>
                <div className="text-xs text-slate-500">{formatFileSize(uploadingFile.file.size)}</div>
                {uploadingFile.status === "uploading" && (
                  <Progress value={uploadingFile.progress} className="h-1 mt-1" />
                )}
                {uploadingFile.status === "error" && uploadingFile.error && (
                  <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {uploadingFile.error}
                  </div>
                )}
              </div>
              {uploadingFile.status === "uploading" && (
                <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              )}
              {uploadingFile.status === "success" && (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              )}
              {uploadingFile.status === "error" && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setUploadingFile(null)}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}

          {/* Replace button when cover exists */}
          {coverUrl && !uploadingFile && (
            <div className="mt-2 relative">
              <input
                type="file"
                accept={ALLOWED_EXTENSIONS.join(",")}
                onChange={handleImageInputChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Button type="button" variant="outline" size="sm" className="gap-1.5 pointer-events-none">
                <Upload className="w-3.5 h-3.5" />
                Remplacer l'image
              </Button>
            </div>
          )}
        </div>

        {/* Conditions FR */}
        <div>
          <Label htmlFor="condFr" className="text-sm font-semibold">
            Conditions (Français)
          </Label>
          <Textarea
            id="condFr"
            value={conditionsFr}
            onChange={(e) => setConditionsFr(e.target.value)}
            placeholder="Conditions spéciales..."
            className="mt-1"
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? "En cours..."
              : isEdit
                ? "Enregistrer les modifications"
                : "Créer le brouillon"}
          </Button>
        </div>
      </div>
    </div>
  );
}
