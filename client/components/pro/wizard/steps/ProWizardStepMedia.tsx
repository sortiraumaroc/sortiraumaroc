import { useState, useRef } from "react";
import { Camera, Upload, X, ImageIcon } from "lucide-react";
import type { ProWizardData } from "../../../../lib/pro/types";
import { uploadProInventoryImage } from "../../../../lib/pro/api";

type Props = {
  data: Partial<ProWizardData>;
  onChange: (patch: Partial<ProWizardData>) => void;
  establishmentId: string;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_GALLERY = 12;

export function ProWizardStepMedia({
  data,
  onChange,
  establishmentId,
}: Props) {
  const [uploading, setUploading] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type))
      return "Format non supporté. Utilisez JPG, PNG ou WebP.";
    if (file.size > MAX_FILE_SIZE) return "Fichier trop volumineux (max 5 Mo).";
    return null;
  };

  const handleSingleUpload = async (
    file: File,
    field: "cover_url" | "logo_url",
  ) => {
    const err = validateFile(file);
    if (err) {
      alert(err);
      return;
    }
    setUploading(field);
    try {
      const result = await uploadProInventoryImage({
        establishmentId,
        file,
      });
      onChange({ [field]: result.url });
    } catch {
      alert("Erreur lors de l'upload. Réessayez.");
    } finally {
      setUploading(null);
    }
  };

  const handleGalleryUpload = async (files: FileList) => {
    const current = data.gallery_urls ?? [];
    const remaining = MAX_GALLERY - current.length;
    const toUpload = Array.from(files).slice(0, remaining);

    setUploading("gallery");
    const newUrls: string[] = [];
    for (const file of toUpload) {
      const err = validateFile(file);
      if (err) continue;
      try {
        const result = await uploadProInventoryImage({
          establishmentId,
          file,
        });
        newUrls.push(result.url);
      } catch {
        // skip failed uploads
      }
    }
    onChange({ gallery_urls: [...current, ...newUrls] });
    setUploading(null);
  };

  const removeGalleryImage = (idx: number) => {
    const urls = [...(data.gallery_urls ?? [])];
    urls.splice(idx, 1);
    onChange({ gallery_urls: urls });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Médias</h3>
        <p className="mt-1 text-sm text-gray-500">
          Ajoutez des photos pour mettre en valeur votre établissement.
        </p>
      </div>

      {/* Cover photo */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Photo de couverture
        </label>
        <input
          ref={coverRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleSingleUpload(file, "cover_url");
            e.target.value = "";
          }}
        />
        {data.cover_url ? (
          <div className="relative">
            <img
              src={data.cover_url}
              alt="Couverture"
              className="h-40 w-full rounded-lg object-cover"
            />
            <button
              type="button"
              onClick={() => onChange({ cover_url: "" })}
              className="absolute end-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => coverRef.current?.click()}
            disabled={!!uploading}
            className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400 transition-colors hover:border-[#a3001d] hover:text-[#a3001d]"
          >
            {uploading === "cover_url" ? (
              <span className="text-sm">Upload en cours...</span>
            ) : (
              <>
                <Camera className="h-8 w-8" />
                <span className="text-sm">Ajouter une photo de couverture</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Logo */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Logo
        </label>
        <input
          ref={logoRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleSingleUpload(file, "logo_url");
            e.target.value = "";
          }}
        />
        <div className="flex items-center gap-4">
          {data.logo_url ? (
            <div className="relative">
              <img
                src={data.logo_url}
                alt="Logo"
                className="h-20 w-20 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => onChange({ logo_url: "" })}
                className="absolute -end-1 -top-1 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => logoRef.current?.click()}
              disabled={!!uploading}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400 transition-colors hover:border-[#a3001d] hover:text-[#a3001d]"
            >
              {uploading === "logo_url" ? (
                <span className="text-[10px]">...</span>
              ) : (
                <>
                  <ImageIcon className="h-5 w-5" />
                  <span className="text-[10px]">Logo</span>
                </>
              )}
            </button>
          )}
          <p className="text-xs text-gray-400">
            Format carré recommandé (ex : 400x400px)
          </p>
        </div>
      </div>

      {/* Gallery */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Galerie photos ({(data.gallery_urls ?? []).length}/{MAX_GALLERY})
        </label>
        <input
          ref={galleryRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleGalleryUpload(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {(data.gallery_urls ?? []).map((url, i) => (
            <div key={i} className="relative">
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                className="h-24 w-full rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => removeGalleryImage(i)}
                className="absolute end-1 top-1 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {(data.gallery_urls ?? []).length < MAX_GALLERY && (
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              disabled={!!uploading}
              className="flex h-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400 transition-colors hover:border-[#a3001d] hover:text-[#a3001d]"
            >
              {uploading === "gallery" ? (
                <span className="text-xs">Upload...</span>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span className="text-[10px]">Ajouter</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
