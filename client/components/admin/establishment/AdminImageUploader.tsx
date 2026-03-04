/**
 * AdminImageUploader
 *
 * Version admin de l'ImageUploader pour l'inventaire.
 * Utilise l'API admin au lieu de l'API Pro.
 */
import { useCallback, useState } from "react";
import { ImagePlus, Loader2, Trash2, X, AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import { loadAdminSessionToken } from "@/lib/adminApi";

type Props = {
  establishmentId: string;
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  disabled?: boolean;
  maxPhotos?: number;
};

type UploadingFile = {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
  previewUrl?: string;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Admin API upload function
async function adminUploadInventoryImage(args: {
  establishmentId: string;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<{ url: string }> {
  const sessionToken = loadAdminSessionToken();

  const formData = new FormData();
  formData.append("image", args.file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && args.onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        args.onProgress(percent);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const payload = JSON.parse(xhr.responseText);
          resolve(payload as { url: string });
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      } else {
        try {
          const payload = JSON.parse(xhr.responseText);
          reject(new Error(payload?.error || payload?.message || `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error"));
    });

    xhr.open(
      "POST",
      `/api/admin/establishments/${encodeURIComponent(args.establishmentId)}/inventory/images`
    );

    if (sessionToken) {
      xhr.setRequestHeader("x-admin-session", sessionToken);
    }

    xhr.send(formData);
  });
}

// Admin API delete function
async function adminDeleteInventoryImage(args: {
  establishmentId: string;
  url: string;
}): Promise<{ ok: true }> {
  const sessionToken = loadAdminSessionToken();

  const res = await fetch(
    `/api/admin/establishments/${encodeURIComponent(args.establishmentId)}/inventory/images`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { "x-admin-session": sessionToken } : {}),
      },
      body: JSON.stringify({ url: args.url }),
    }
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = payload?.error || payload?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return { ok: true };
}

export function AdminImageUploader({
  establishmentId,
  photos,
  onPhotosChange,
  disabled = false,
  maxPhotos = 12,
}: Props) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  const canAddMore = photos.length + uploadingFiles.filter((f) => f.status === "uploading").length < maxPhotos;

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `Format non accepté. Formats autorisés: JPG, PNG, WebP, GIF`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `Fichier trop volumineux (${formatFileSize(file.size)}). Maximum: 5 MB`;
    }
    return null;
  };

  const uploadFile = useCallback(
    async (file: File) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Create preview
      const previewUrl = URL.createObjectURL(file);

      // Add to uploading list
      setUploadingFiles((prev) => [
        ...prev,
        { id, file, progress: 0, status: "uploading", previewUrl },
      ]);

      try {
        const result = await adminUploadInventoryImage({
          establishmentId,
          file,
          onProgress: (percent) => {
            setUploadingFiles((prev) =>
              prev.map((f) => (f.id === id ? { ...f, progress: percent } : f))
            );
          },
        });

        // Success - add URL to photos
        onPhotosChange([...photos, result.url]);

        // Mark as success briefly, then remove
        setUploadingFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, status: "success", progress: 100 } : f))
        );

        // Remove from uploading list after delay
        setTimeout(() => {
          setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
          URL.revokeObjectURL(previewUrl);
        }, 1500);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur lors de l'upload";
        setUploadingFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, status: "error", error: message } : f))
        );
      }
    },
    [establishmentId, photos, onPhotosChange]
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const availableSlots = maxPhotos - photos.length - uploadingFiles.filter((f) => f.status === "uploading").length;

      fileArray.slice(0, availableSlots).forEach((file) => {
        const error = validateFile(file);
        if (error) {
          const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          setUploadingFiles((prev) => [
            ...prev,
            { id, file, progress: 0, status: "error", error },
          ]);
        } else {
          uploadFile(file);
        }
      });
    },
    [maxPhotos, photos.length, uploadingFiles, uploadFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
      e.target.value = ""; // Reset input
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    if (disabled || !canAddMore) return;

    const files = e.dataTransfer.files;
    if (files.length) {
      handleFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && canAddMore) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const removeUploadingFile = (id: string) => {
    setUploadingFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const removePhoto = async (url: string) => {
    if (disabled) return;

    setDeletingUrl(url);

    try {
      // Try to delete from storage (will fail silently if URL is external)
      await adminDeleteInventoryImage({ establishmentId, url }).catch(() => {
        // Ignore errors for external URLs
      });

      // Remove from list
      onPhotosChange(photos.filter((p) => p !== url));
    } finally {
      setDeletingUrl(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Info banner */}
      <div className="text-xs text-slate-500 bg-slate-50 rounded-md p-2 space-y-1">
        <div className="font-medium">Formats acceptés :</div>
        <div>JPG, PNG, WebP, GIF - Max 5 MB par image - Résolution recommandée : 800x600 minimum</div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${dragOver ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50"}
          ${disabled || !canAddMore ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50"}
        `}
      >
        <input
          type="file"
          accept={ALLOWED_EXTENSIONS.join(",")}
          multiple
          disabled={disabled || !canAddMore}
          onChange={handleInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />

        <div className="flex flex-col items-center gap-2">
          <div className={`p-3 rounded-full ${dragOver ? "bg-primary/10" : "bg-slate-100"}`}>
            <ImagePlus className={`w-6 h-6 ${dragOver ? "text-primary" : "text-slate-400"}`} />
          </div>
          <div className="text-sm font-medium text-slate-700">
            {dragOver ? "Déposez vos images ici" : "Glissez-déposez vos images"}
          </div>
          <div className="text-xs text-slate-500">
            ou cliquez pour parcourir
          </div>
          {!canAddMore && (
            <div className="text-xs text-amber-600 mt-1">
              Maximum {maxPhotos} photos atteint
            </div>
          )}
        </div>
      </div>

      {/* Uploading files */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((upload) => (
            <div
              key={upload.id}
              className={`
                flex items-center gap-3 p-2 rounded-md border
                ${upload.status === "error" ? "bg-red-50 border-red-200" : ""}
                ${upload.status === "success" ? "bg-green-50 border-green-200" : ""}
                ${upload.status === "uploading" ? "bg-white border-slate-200" : ""}
              `}
            >
              {/* Preview */}
              {upload.previewUrl && (
                <img
                  src={upload.previewUrl}
                  alt=""
                  className="w-10 h-10 object-cover rounded"
                />
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{upload.file.name}</div>
                <div className="text-xs text-slate-500">
                  {formatFileSize(upload.file.size)}
                </div>

                {/* Progress bar */}
                {upload.status === "uploading" && (
                  <Progress value={upload.progress} className="h-1 mt-1" />
                )}

                {/* Error message */}
                {upload.status === "error" && upload.error && (
                  <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {upload.error}
                  </div>
                )}
              </div>

              {/* Status icon / Remove button */}
              {upload.status === "uploading" && (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              )}
              {upload.status === "success" && (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              )}
              {upload.status === "error" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeUploadingFile(upload.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Existing photos grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              className="relative group aspect-square rounded-md overflow-hidden bg-slate-100 border border-slate-200"
            >
              <img
                src={url}
                alt={`Photo ${idx + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Show placeholder on error
                  (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23f1f5f9' width='100' height='100'/%3E%3Ctext x='50' y='50' font-family='sans-serif' font-size='12' fill='%2394a3b8' text-anchor='middle' dy='.3em'%3EErreur%3C/text%3E%3C/svg%3E";
                }}
              />

              {/* Delete button overlay */}
              {!disabled && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={deletingUrl === url}
                    onClick={() => removePhoto(url)}
                    className="gap-1"
                  >
                    {deletingUrl === url ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              )}

              {/* Index badge */}
              <div className="absolute top-1 start-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                {idx + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photos count */}
      <div className="text-xs text-slate-500 text-end">
        {photos.length} / {maxPhotos} photos
      </div>
    </div>
  );
}
