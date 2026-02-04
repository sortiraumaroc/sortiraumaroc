/**
 * AdminGalleryManager - Version compacte avec SEO & GEO
 *
 * Fonctionnalités:
 * - Compression automatique des images (8MB -> ~200KB)
 * - Photo de couverture (format 16:9)
 * - Galerie avec réorganisation drag & drop
 * - SEO: Alt text, meta descriptions, score
 * - GEO: Géolocalisation des photos, Google Maps
 */
import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  Loader2,
  GripVertical,
  Eye,
  Edit2,
  Star,
  AlertCircle,
  CheckCircle2,
  RefreshCcw,
  X,
  Sparkles,
  Camera,
  Plus,
  MapPin,
  Globe,
  Zap,
  FileImage,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useToast } from "@/hooks/use-toast";
import { loadAdminSessionToken } from "@/lib/adminApi";

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB (server will compress)
const MAX_GALLERY_PHOTOS = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

type Props = {
  establishmentId: string;
  establishmentName: string;
  establishmentLat?: number;
  establishmentLng?: number;
  establishmentCity?: string;
};

type PhotoMeta = {
  alt?: string;
  caption?: string;
  geo?: {
    lat?: number;
    lng?: number;
    location?: string;
  };
  keywords?: string[];
};

type GalleryPhoto = {
  url: string;
  meta?: PhotoMeta;
};

type UploadingFile = {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "compressing" | "success" | "error";
  error?: string;
  previewUrl?: string;
  compression?: {
    originalSize: number;
    compressedSize: number;
    savings: number;
  };
};

// Admin API helper
async function adminApiFetch(
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const sessionToken = loadAdminSessionToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (sessionToken) {
    headers["x-admin-session"] = sessionToken;
  }

  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers,
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      payload && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : payload?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return payload;
}

// Upload image
async function adminUploadGalleryImage(args: {
  establishmentId: string;
  file: File;
  type: "cover" | "gallery";
  onProgress?: (percent: number) => void;
  onCompressing?: () => void;
}): Promise<{ url: string; compression?: { originalSize: number; compressedSize: number; savings: number } }> {
  const sessionToken = loadAdminSessionToken();

  const formData = new FormData();
  formData.append("image", args.file);
  formData.append("type", args.type);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && args.onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        args.onProgress(percent);
        // When upload is at 100%, server is compressing
        if (percent === 100 && args.onCompressing) {
          args.onCompressing();
        }
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const payload = JSON.parse(xhr.responseText);
          resolve(payload);
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      } else {
        try {
          const payload = JSON.parse(xhr.responseText);
          const errorMsg = payload?.details
            ? `${payload.error}: ${payload.details}`
            : payload?.error || payload?.message || `HTTP ${xhr.status}`;
          reject(new Error(errorMsg));
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
      `/api/admin/establishments/${encodeURIComponent(args.establishmentId)}/gallery/upload`
    );

    if (sessionToken) {
      xhr.setRequestHeader("x-admin-session", sessionToken);
    }

    xhr.send(formData);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AdminGalleryManager({
  establishmentId,
  establishmentName,
  establishmentLat,
  establishmentLng,
  establishmentCity,
}: Props) {
  const { toast } = useToast();

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cover photo
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverMeta, setCoverMeta] = useState<PhotoMeta>({});
  const [uploadingCover, setUploadingCover] = useState<UploadingFile | null>(null);

  // Gallery photos
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [uploadingGallery, setUploadingGallery] = useState<UploadingFile[]>([]);

  // Dialogs
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editMetaOpen, setEditMetaOpen] = useState(false);
  const [editingPhotoIndex, setEditingPhotoIndex] = useState<number | null>(null);
  const [editingCover, setEditingCover] = useState(false);
  const [editingMeta, setEditingMeta] = useState<PhotoMeta>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingPhotoIndex, setDeletingPhotoIndex] = useState<number | null>(null);
  const [deletingCover, setDeletingCover] = useState(false);
  const [seoDialogOpen, setSeoDialogOpen] = useState(false);

  // Compression stats
  const [totalSaved, setTotalSaved] = useState(0);

  // Drag and drop
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Load establishment gallery data
  const loadGallery = useCallback(async () => {
    if (!establishmentId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await adminApiFetch(
        `/api/admin/establishments/${encodeURIComponent(establishmentId)}/gallery`
      );

      setCoverUrl(data.cover_url || null);
      setCoverMeta(data.cover_meta || {});
      setGalleryPhotos(
        Array.isArray(data.gallery_urls)
          ? data.gallery_urls.map((url: string, idx: number) => ({
              url,
              meta: data.gallery_meta?.[idx] || {},
            }))
          : []
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  // Upload cover photo
  const handleCoverUpload = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: "Format non accepté", description: "Utilisez JPG, PNG ou WebP", variant: "destructive" });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "Fichier trop volumineux", description: "Maximum 10 MB", variant: "destructive" });
      return;
    }

    const id = `cover-${Date.now()}`;
    const previewUrl = URL.createObjectURL(file);

    setUploadingCover({ id, file, progress: 0, status: "uploading", previewUrl });

    try {
      const result = await adminUploadGalleryImage({
        establishmentId,
        file,
        type: "cover",
        onProgress: (percent) => {
          setUploadingCover((prev) => (prev ? { ...prev, progress: percent } : null));
        },
        onCompressing: () => {
          setUploadingCover((prev) => (prev ? { ...prev, status: "compressing" } : null));
        },
      });

      await adminApiFetch(
        `/api/admin/establishments/${encodeURIComponent(establishmentId)}/gallery`,
        {
          method: "PATCH",
          body: JSON.stringify({ cover_url: result.url }),
        }
      );

      setCoverUrl(result.url);

      // Show compression savings
      if (result.compression) {
        setTotalSaved((prev) => prev + (result.compression!.originalSize - result.compression!.compressedSize));
        toast({
          title: "Photo compressée et uploadée",
          description: `${formatFileSize(result.compression.originalSize)} → ${formatFileSize(result.compression.compressedSize)} (-${result.compression.savings}%)`,
        });
      } else {
        toast({ title: "Photo de couverture mise à jour" });
      }

      setUploadingCover(null);
      URL.revokeObjectURL(previewUrl);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erreur";
      console.error("[Cover Upload Error]", errorMsg);
      toast({
        title: "Erreur d'upload",
        description: errorMsg,
        variant: "destructive",
      });
      setUploadingCover(null);
      URL.revokeObjectURL(previewUrl);
    }
  };

  // Upload gallery photos
  const handleGalleryUpload = async (files: File[]) => {
    const availableSlots = MAX_GALLERY_PHOTOS - galleryPhotos.length;
    if (availableSlots <= 0) {
      toast({
        title: "Limite atteinte",
        description: `Maximum ${MAX_GALLERY_PHOTOS} photos.`,
        variant: "destructive",
      });
      return;
    }

    const filesToUpload = files.slice(0, availableSlots);

    for (const file of filesToUpload) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast({ title: "Format non accepté", description: `${file.name}: Utilisez JPG, PNG ou WebP`, variant: "destructive" });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: "Fichier trop volumineux", description: `${file.name}: Maximum 10 MB`, variant: "destructive" });
        continue;
      }

      const id = `gallery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = URL.createObjectURL(file);

      setUploadingGallery((prev) => [
        ...prev,
        { id, file, progress: 0, status: "uploading", previewUrl },
      ]);

      try {
        const result = await adminUploadGalleryImage({
          establishmentId,
          file,
          type: "gallery",
          onProgress: (percent) => {
            setUploadingGallery((prev) =>
              prev.map((u) => (u.id === id ? { ...u, progress: percent } : u))
            );
          },
          onCompressing: () => {
            setUploadingGallery((prev) =>
              prev.map((u) => (u.id === id ? { ...u, status: "compressing" } : u))
            );
          },
        });

        // Default meta with geo from establishment
        const defaultMeta: PhotoMeta = {};
        if (establishmentLat && establishmentLng) {
          defaultMeta.geo = {
            lat: establishmentLat,
            lng: establishmentLng,
            location: establishmentCity,
          };
        }

        const newPhoto: GalleryPhoto = { url: result.url, meta: defaultMeta };
        const updatedGallery = [...galleryPhotos, newPhoto];

        await adminApiFetch(
          `/api/admin/establishments/${encodeURIComponent(establishmentId)}/gallery`,
          {
            method: "PATCH",
            body: JSON.stringify({
              gallery_urls: updatedGallery.map((p) => p.url),
              gallery_meta: updatedGallery.map((p) => p.meta),
            }),
          }
        );

        setGalleryPhotos(updatedGallery);

        // Track compression savings
        if (result.compression) {
          setTotalSaved((prev) => prev + (result.compression!.originalSize - result.compression!.compressedSize));
        }

        setUploadingGallery((prev) =>
          prev.map((u) => (u.id === id ? {
            ...u,
            status: "success",
            progress: 100,
            compression: result.compression,
          } : u))
        );

        setTimeout(() => {
          setUploadingGallery((prev) => prev.filter((u) => u.id !== id));
          URL.revokeObjectURL(previewUrl);
        }, 2000);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Erreur";
        console.error("[Gallery Upload Error]", errorMsg);
        toast({
          title: "Erreur d'upload",
          description: errorMsg,
          variant: "destructive",
        });
        // Remove failed upload after showing error
        setUploadingGallery((prev) => prev.filter((u) => u.id !== id));
        URL.revokeObjectURL(previewUrl);
      }
    }
  };

  // Delete functions
  const handleDeleteCover = async () => {
    try {
      await adminApiFetch(
        `/api/admin/establishments/${encodeURIComponent(establishmentId)}/gallery`,
        { method: "PATCH", body: JSON.stringify({ cover_url: null }) }
      );
      setCoverUrl(null);
      setCoverMeta({});
      setDeletingCover(false);
      setDeleteConfirmOpen(false);
      toast({ title: "Photo de couverture supprimée" });
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    }
  };

  const handleDeleteGalleryPhoto = async (index: number) => {
    try {
      const newGallery = galleryPhotos.filter((_, i) => i !== index);
      await adminApiFetch(
        `/api/admin/establishments/${encodeURIComponent(establishmentId)}/gallery`,
        { method: "PATCH", body: JSON.stringify({ gallery_urls: newGallery.map((p) => p.url) }) }
      );
      setGalleryPhotos(newGallery);
      setDeletingPhotoIndex(null);
      setDeleteConfirmOpen(false);
      toast({ title: "Photo supprimée" });
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    }
  };

  // Drag and drop
  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) setDragOverIndex(index);
  };
  const handleDragEnd = async () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const newGallery = [...galleryPhotos];
      const [draggedItem] = newGallery.splice(draggedIndex, 1);
      newGallery.splice(dragOverIndex, 0, draggedItem);
      setGalleryPhotos(newGallery);
      try {
        await adminApiFetch(
          `/api/admin/establishments/${encodeURIComponent(establishmentId)}/gallery`,
          { method: "PATCH", body: JSON.stringify({ gallery_urls: newGallery.map((p) => p.url) }) }
        );
      } catch {
        void loadGallery();
      }
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Edit photo metadata (SEO + GEO)
  const openEditMeta = (index: number | "cover") => {
    if (index === "cover") {
      setEditingCover(true);
      setEditingPhotoIndex(null);
      setEditingMeta(coverMeta || {});
    } else {
      setEditingCover(false);
      setEditingPhotoIndex(index);
      setEditingMeta(galleryPhotos[index]?.meta || {});
    }
    setEditMetaOpen(true);
  };

  const savePhotoMeta = async () => {
    try {
      if (editingCover) {
        // Save cover meta
        await adminApiFetch(
          `/api/admin/establishments/${encodeURIComponent(establishmentId)}/gallery`,
          { method: "PATCH", body: JSON.stringify({ cover_meta: editingMeta }) }
        );
        setCoverMeta(editingMeta);
      } else if (editingPhotoIndex !== null) {
        // Save gallery photo meta
        const newGallery = [...galleryPhotos];
        newGallery[editingPhotoIndex] = {
          ...newGallery[editingPhotoIndex],
          meta: editingMeta,
        };
        await adminApiFetch(
          `/api/admin/establishments/${encodeURIComponent(establishmentId)}/gallery`,
          {
            method: "PATCH",
            body: JSON.stringify({
              gallery_urls: newGallery.map((p) => p.url),
              gallery_meta: newGallery.map((p) => p.meta),
            }),
          }
        );
        setGalleryPhotos(newGallery);
      }
      setEditMetaOpen(false);
      toast({ title: "Informations mises à jour" });
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    }
  };

  // Preview
  const openPreview = (url: string) => {
    setPreviewUrl(url);
    setPreviewOpen(true);
  };

  // File inputs
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleCoverInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleCoverUpload(file);
    e.target.value = "";
  };

  const handleGalleryInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) void handleGalleryUpload(files);
    e.target.value = "";
  };

  // SEO score calculation
  const seoScore = useMemo(() => {
    let score = 0;
    const tips: string[] = [];

    // Cover photo (40 points)
    if (coverUrl) {
      score += 25;
      if (coverMeta?.alt && coverMeta.alt.length > 10) {
        score += 15;
      } else {
        tips.push("Ajoutez un texte alt à la photo de couverture");
      }
    } else {
      tips.push("Ajoutez une photo de couverture");
    }

    // Gallery photos (30 points)
    if (galleryPhotos.length >= 5) {
      score += 20;
    } else if (galleryPhotos.length >= 3) {
      score += 15;
      tips.push("Ajoutez plus de photos (idéal: 5-10)");
    } else if (galleryPhotos.length > 0) {
      score += 10;
      tips.push("Ajoutez au moins 5 photos");
    } else {
      tips.push("Ajoutez des photos à la galerie");
    }

    // Alt texts (20 points)
    const photosWithAlt = galleryPhotos.filter((p) => p.meta?.alt && p.meta.alt.length > 10);
    if (photosWithAlt.length === galleryPhotos.length && galleryPhotos.length > 0) {
      score += 20;
    } else if (photosWithAlt.length > 0) {
      score += 10;
      tips.push(`${galleryPhotos.length - photosWithAlt.length} photos sans texte alt`);
    } else if (galleryPhotos.length > 0) {
      tips.push("Ajoutez des textes alt à vos photos");
    }

    // GEO (10 points)
    const photosWithGeo = galleryPhotos.filter((p) => p.meta?.geo?.lat);
    if (photosWithGeo.length === galleryPhotos.length && galleryPhotos.length > 0) {
      score += 10;
    } else if (photosWithGeo.length > 0) {
      score += 5;
    }

    return { score: Math.min(score, 100), tips };
  }, [coverUrl, coverMeta, galleryPhotos]);

  // GEO stats
  const geoStats = useMemo(() => {
    const photosWithGeo = galleryPhotos.filter((p) => p.meta?.geo?.lat).length;
    const coverHasGeo = coverMeta?.geo?.lat ? 1 : 0;
    return {
      total: galleryPhotos.length + (coverUrl ? 1 : 0),
      withGeo: photosWithGeo + coverHasGeo,
    };
  }, [galleryPhotos, coverUrl, coverMeta]);

  const canAddMorePhotos = galleryPhotos.length < MAX_GALLERY_PHOTOS;

  return (
    <Card className="border-slate-200">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            Galerie Photos
          </div>
          <div className="flex items-center gap-1.5">
            {/* Compression savings */}
            {totalSaved > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-medium">
                      <Zap className="w-2.5 h-2.5" />
                      -{formatFileSize(totalSaved)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Espace économisé par compression</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* SEO Score */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setSeoDialogOpen(true)}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium cursor-pointer hover:opacity-80 ${
                      seoScore.score >= 70
                        ? "bg-emerald-100 text-emerald-700"
                        : seoScore.score >= 40
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    <TrendingUp className="w-2.5 h-2.5" />
                    SEO {seoScore.score}%
                  </button>
                </TooltipTrigger>
                <TooltipContent>Cliquez pour optimiser</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* GEO indicator */}
            {geoStats.total > 0 && (
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                geoStats.withGeo === geoStats.total ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
              }`}>
                <MapPin className="w-2.5 h-2.5" />
                {geoStats.withGeo}/{geoStats.total}
              </div>
            )}

            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
              {galleryPhotos.length}/{MAX_GALLERY_PHOTOS}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0"
              onClick={() => void loadGallery()}
              disabled={loading}
            >
              <RefreshCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-3 pt-0">
        {error && (
          <div className="rounded bg-red-50 border border-red-200 p-2 text-xs text-red-700 flex items-center gap-2 mb-2">
            <AlertCircle className="w-3 h-3 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-6 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Chargement...
          </div>
        ) : (
          <div className="flex gap-4">
            {/* LEFT: Cover Photo */}
            <div className="shrink-0">
              <div className="text-[10px] font-medium text-slate-500 mb-1 flex items-center gap-1">
                <Star className="w-2.5 h-2.5 text-amber-500" />
                Couverture
              </div>

              {coverUrl || uploadingCover ? (
                <div className="relative group">
                  {uploadingCover ? (
                    <div className="w-[180px] h-[120px] rounded-lg bg-slate-100 border border-slate-200 flex flex-col items-center justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-primary mb-1" />
                      <span className="text-[9px] text-slate-500">
                        {uploadingCover.status === "compressing" ? "Compression..." : `${uploadingCover.progress}%`}
                      </span>
                      {uploadingCover.status === "error" && (
                        <span className="text-[9px] text-red-600 mt-1">{uploadingCover.error}</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <img
                        src={coverUrl!}
                        alt={coverMeta?.alt || establishmentName}
                        className="w-[180px] h-[120px] object-cover rounded-lg border border-slate-200"
                      />
                      {/* Meta indicators */}
                      <div className="absolute bottom-1 left-1 flex gap-0.5">
                        {coverMeta?.alt && (
                          <div className="bg-emerald-500 text-white text-[7px] px-1 rounded">ALT</div>
                        )}
                        {coverMeta?.geo?.lat && (
                          <div className="bg-blue-500 text-white text-[7px] px-1 rounded">GEO</div>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
                        <Button size="sm" variant="secondary" className="h-6 w-6 p-0" onClick={() => openPreview(coverUrl!)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="secondary" className="h-6 w-6 p-0" onClick={() => openEditMeta("cover")}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="secondary" className="h-6 w-6 p-0" onClick={() => coverInputRef.current?.click()}>
                          <Upload className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="destructive" className="h-6 w-6 p-0" onClick={() => { setDeletingCover(true); setDeleteConfirmOpen(true); }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => coverInputRef.current?.click()}
                  className="w-[180px] h-[120px] rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                >
                  <Upload className="w-4 h-4 text-slate-400 mb-1" />
                  <span className="text-[9px] text-slate-500">Ajouter</span>
                </div>
              )}

              <input ref={coverInputRef} type="file" accept={ALLOWED_EXTENSIONS.join(",")} onChange={handleCoverInputChange} className="hidden" />
              <p className="text-[8px] text-slate-400 mt-1 text-center">Page d'accueil • Auto-compressé</p>
            </div>

            {/* RIGHT: Gallery Grid */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
                  <ImageIcon className="w-2.5 h-2.5 text-primary" />
                  Galerie
                </span>
                {canAddMorePhotos && (
                  <Button size="sm" variant="ghost" className="h-5 text-[9px] px-1.5" onClick={() => galleryInputRef.current?.click()}>
                    <Plus className="w-2.5 h-2.5 mr-0.5" />
                    Ajouter
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {galleryPhotos.map((photo, index) => (
                  <div
                    key={`${photo.url}-${index}`}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`relative group w-[75px] h-[75px] rounded overflow-hidden cursor-move border ${
                      draggedIndex === index ? "opacity-50 border-primary" : "border-slate-200"
                    } ${dragOverIndex === index ? "border-primary border-2" : ""}`}
                  >
                    <img src={photo.url} alt={photo.meta?.alt || `Photo ${index + 1}`} className="w-full h-full object-cover" />

                    {/* Index */}
                    <div className="absolute top-0 left-0 bg-black/60 text-white text-[7px] px-0.5 rounded-br">{index + 1}</div>

                    {/* Meta indicators */}
                    <div className="absolute bottom-0 left-0 flex">
                      {photo.meta?.alt && <div className="bg-emerald-500 w-1 h-1 rounded-tr" />}
                      {photo.meta?.geo?.lat && <div className="bg-blue-500 w-1 h-1 rounded-tr ml-px" />}
                    </div>

                    {/* Actions */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-0.5">
                      <Button size="sm" variant="secondary" className="h-5 w-5 p-0" onClick={() => openPreview(photo.url)}>
                        <Eye className="w-2.5 h-2.5" />
                      </Button>
                      <Button size="sm" variant="secondary" className="h-5 w-5 p-0" onClick={() => openEditMeta(index)}>
                        <Edit2 className="w-2.5 h-2.5" />
                      </Button>
                      <Button size="sm" variant="destructive" className="h-5 w-5 p-0" onClick={() => { setDeletingPhotoIndex(index); setDeleteConfirmOpen(true); }}>
                        <Trash2 className="w-2.5 h-2.5" />
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Uploading */}
                {uploadingGallery.map((upload) => (
                  <div key={upload.id} className="w-[75px] h-[75px] rounded border border-slate-200 bg-slate-100 flex flex-col items-center justify-center">
                    {upload.status === "uploading" && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                    {upload.status === "compressing" && (
                      <>
                        <Zap className="w-3 h-3 text-amber-500 animate-pulse" />
                        <span className="text-[7px] text-slate-500">Compress.</span>
                      </>
                    )}
                    {upload.status === "success" && (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        {upload.compression && (
                          <span className="text-[7px] text-emerald-600">-{upload.compression.savings}%</span>
                        )}
                      </>
                    )}
                    {upload.status === "error" && <AlertCircle className="w-3 h-3 text-red-500" />}
                  </div>
                ))}

                {/* Add button */}
                {canAddMorePhotos && (
                  <div
                    onClick={() => galleryInputRef.current?.click()}
                    className="w-[75px] h-[75px] rounded border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center cursor-pointer hover:border-primary/50"
                  >
                    <Plus className="w-3 h-3 text-slate-400" />
                  </div>
                )}
              </div>

              <input ref={galleryInputRef} type="file" accept={ALLOWED_EXTENSIONS.join(",")} multiple onChange={handleGalleryInputChange} className="hidden" />
              <p className="text-[8px] text-slate-400 mt-1">Glissez pour réorganiser • Jusqu'à 10 MB (auto-compressé)</p>
            </div>
          </div>
        )}
      </CardContent>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <div className="relative">
            <Button variant="ghost" size="sm" className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white" onClick={() => setPreviewOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
            {previewUrl && <img src={previewUrl} alt="Preview" className="w-full h-auto max-h-[80vh] object-contain bg-black" />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Meta Dialog (SEO + GEO) */}
      <Dialog open={editMetaOpen} onOpenChange={setEditMetaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              SEO & Géolocalisation
            </DialogTitle>
            <DialogDescription className="text-xs">
              Optimisez cette photo pour le référencement
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="seo" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-8">
              <TabsTrigger value="seo" className="text-xs">
                <Globe className="w-3 h-3 mr-1" />
                SEO
              </TabsTrigger>
              <TabsTrigger value="geo" className="text-xs">
                <MapPin className="w-3 h-3 mr-1" />
                GEO
              </TabsTrigger>
            </TabsList>

            <TabsContent value="seo" className="space-y-3 mt-3">
              <div>
                <Label className="text-xs">Texte alternatif (alt) *</Label>
                <Input
                  value={editingMeta.alt || ""}
                  onChange={(e) => setEditingMeta({ ...editingMeta, alt: e.target.value })}
                  placeholder={`Ex: Vue de la terrasse de ${establishmentName}`}
                  className="h-8 text-sm mt-1"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">Important pour Google Images et l'accessibilité</p>
              </div>

              <div>
                <Label className="text-xs">Légende / Description</Label>
                <Textarea
                  value={editingMeta.caption || ""}
                  onChange={(e) => setEditingMeta({ ...editingMeta, caption: e.target.value })}
                  placeholder="Description de la photo..."
                  rows={2}
                  className="text-sm resize-none mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Mots-clés (séparés par des virgules)</Label>
                <Input
                  value={editingMeta.keywords?.join(", ") || ""}
                  onChange={(e) => setEditingMeta({
                    ...editingMeta,
                    keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean),
                  })}
                  placeholder="restaurant, terrasse, marrakech"
                  className="h-8 text-sm mt-1"
                />
              </div>
            </TabsContent>

            <TabsContent value="geo" className="space-y-3 mt-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-700">
                <div className="flex items-center gap-1 font-medium mb-1">
                  <MapPin className="w-3 h-3" />
                  Géolocalisation
                </div>
                La géolocalisation améliore le référencement local et permet d'apparaître dans Google Maps / Google Images.
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Latitude</Label>
                  <Input
                    type="number"
                    step="any"
                    value={editingMeta.geo?.lat || ""}
                    onChange={(e) => setEditingMeta({
                      ...editingMeta,
                      geo: { ...editingMeta.geo, lat: parseFloat(e.target.value) || undefined },
                    })}
                    placeholder={establishmentLat?.toString() || "31.6295"}
                    className="h-8 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Longitude</Label>
                  <Input
                    type="number"
                    step="any"
                    value={editingMeta.geo?.lng || ""}
                    onChange={(e) => setEditingMeta({
                      ...editingMeta,
                      geo: { ...editingMeta.geo, lng: parseFloat(e.target.value) || undefined },
                    })}
                    placeholder={establishmentLng?.toString() || "-7.9811"}
                    className="h-8 text-sm mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Lieu</Label>
                <Input
                  value={editingMeta.geo?.location || ""}
                  onChange={(e) => setEditingMeta({
                    ...editingMeta,
                    geo: { ...editingMeta.geo, location: e.target.value },
                  })}
                  placeholder={establishmentCity || "Marrakech, Maroc"}
                  className="h-8 text-sm mt-1"
                />
              </div>

              {establishmentLat && establishmentLng && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setEditingMeta({
                    ...editingMeta,
                    geo: {
                      lat: establishmentLat,
                      lng: establishmentLng,
                      location: establishmentCity,
                    },
                  })}
                >
                  <MapPin className="w-3 h-3 mr-1" />
                  Utiliser la position de l'établissement
                </Button>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditMetaOpen(false)}>Annuler</Button>
            <Button size="sm" onClick={savePhotoMeta}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SEO Dialog */}
      <Dialog open={seoDialogOpen} onOpenChange={setSeoDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Optimisation SEO
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Score */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Progress value={seoScore.score} className="h-3" />
              </div>
              <span className={`text-xl font-bold ${
                seoScore.score >= 70 ? "text-emerald-600" : seoScore.score >= 40 ? "text-amber-600" : "text-red-600"
              }`}>
                {seoScore.score}%
              </span>
            </div>

            {/* Tips */}
            {seoScore.tips.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-700">À améliorer :</p>
                {seoScore.tips.map((tip, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                    <AlertCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Checklist */}
            <div className="bg-slate-50 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-slate-700">Checklist :</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  {coverUrl ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <AlertCircle className="w-3 h-3 text-slate-300" />}
                  <span className={coverUrl ? "" : "text-slate-400"}>Photo de couverture</span>
                </div>
                <div className="flex items-center gap-2">
                  {coverMeta?.alt ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <AlertCircle className="w-3 h-3 text-slate-300" />}
                  <span className={coverMeta?.alt ? "" : "text-slate-400"}>Alt text couverture</span>
                </div>
                <div className="flex items-center gap-2">
                  {galleryPhotos.length >= 5 ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <AlertCircle className="w-3 h-3 text-slate-300" />}
                  <span className={galleryPhotos.length >= 5 ? "" : "text-slate-400"}>5+ photos galerie ({galleryPhotos.length})</span>
                </div>
                <div className="flex items-center gap-2">
                  {galleryPhotos.filter((p) => p.meta?.alt).length === galleryPhotos.length && galleryPhotos.length > 0
                    ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    : <AlertCircle className="w-3 h-3 text-slate-300" />}
                  <span>Textes alt galerie ({galleryPhotos.filter((p) => p.meta?.alt).length}/{galleryPhotos.length})</span>
                </div>
                <div className="flex items-center gap-2">
                  {geoStats.withGeo === geoStats.total && geoStats.total > 0
                    ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    : <AlertCircle className="w-3 h-3 text-slate-300" />}
                  <span>Géolocalisation ({geoStats.withGeo}/{geoStats.total})</span>
                </div>
              </div>
            </div>

            {/* Benefits */}
            <div className="text-[10px] text-slate-500 space-y-1">
              <p className="font-medium">Avantages d'un bon score :</p>
              <p>• Meilleur classement Google Images</p>
              <p>• Visibilité sur Google Maps</p>
              <p>• Partage optimisé sur réseaux sociaux</p>
              <p>• Accessibilité améliorée</p>
            </div>
          </div>

          <DialogFooter>
            <Button size="sm" onClick={() => setSeoDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              {deletingCover ? "Supprimer la couverture ?" : "Supprimer cette photo ?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeletingCover(false); setDeletingPhotoIndex(null); }}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deletingCover) void handleDeleteCover();
                else if (deletingPhotoIndex !== null) void handleDeleteGalleryPhoto(deletingPhotoIndex);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
