"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Upload, X, Image, Plus, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { type WizardData } from "../wizardConstants";

type Props = {
  data: WizardData;
  onChange: (updates: Partial<WizardData>) => void;
};

const ACCEPTED_FORMATS = "image/jpeg,image/png,image/webp";
const ACCEPTED_LABEL = "JPG, PNG, WebP";

export default function WizardStepMedia({ data, onChange }: Props) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Local state for file objects (actual upload happens after creation)
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

  // Track whether existing URL images were removed by user
  const [removedLogoUrl, setRemovedLogoUrl] = useState(false);
  const [removedCoverUrl, setRemovedCoverUrl] = useState(false);
  const [removedGalleryUrls, setRemovedGalleryUrls] = useState<Set<number>>(new Set());

  // Computed: effective previews (existing URL if no new file and not removed)
  const effectiveLogoPreview = logoPreview || (!removedLogoUrl && data.logoUrl ? data.logoUrl : null);
  const effectiveCoverPreview = coverPreview || (!removedCoverUrl && data.coverUrl ? data.coverUrl : null);
  const existingGalleryUrls = (data.galleryUrls ?? []).filter((_, i) => !removedGalleryUrls.has(i));

  const MAX_GALLERY = 12;
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      galleryPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Logo handlers ----
  const handleLogoSelect = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_SIZE) return;
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      const url = URL.createObjectURL(file);
      setLogoFile(file);
      setLogoPreview(url);
      onChange({ logoFile: file });
    },
    [logoPreview, onChange],
  );

  const handleLogoInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleLogoSelect(file);
    e.target.value = "";
  };

  const handleRemoveLogo = () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview(null);
    setRemovedLogoUrl(true);
    onChange({ logoFile: undefined, logoUrl: null });
  };

  const handleLogoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleLogoSelect(file);
  };

  // ---- Cover image handlers ----
  const handleCoverSelect = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_SIZE) return;
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      const url = URL.createObjectURL(file);
      setCoverFile(file);
      setCoverPreview(url);
      onChange({ coverFile: file });
    },
    [coverPreview, onChange],
  );

  const handleCoverInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCoverSelect(file);
    e.target.value = "";
  };

  const handleRemoveCover = () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(null);
    setCoverPreview(null);
    setRemovedCoverUrl(true);
    onChange({ coverFile: undefined, coverUrl: null });
  };

  const handleCoverDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleCoverSelect(file);
  };

  // ---- Gallery handlers ----
  const handleGallerySelect = useCallback(
    (files: File[]) => {
      const remaining = MAX_GALLERY - galleryFiles.length;
      const valid = files
        .filter((f) => f.size <= MAX_FILE_SIZE && f.type.startsWith("image/"))
        .slice(0, remaining);

      const newPreviews = valid.map((f) => URL.createObjectURL(f));
      const nextFiles = [...galleryFiles, ...valid];
      const nextPreviews = [...galleryPreviews, ...newPreviews];

      setGalleryFiles(nextFiles);
      setGalleryPreviews(nextPreviews);
      onChange({ galleryFiles: nextFiles });
    },
    [galleryFiles, galleryPreviews, onChange],
  );

  const handleGalleryInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (files && files.length > 0) handleGallerySelect(Array.from(files));
    e.target.value = "";
  };

  const handleRemoveGalleryImage = (index: number) => {
    URL.revokeObjectURL(galleryPreviews[index]);
    const nextFiles = galleryFiles.filter((_, i) => i !== index);
    const nextPreviews = galleryPreviews.filter((_, i) => i !== index);
    setGalleryFiles(nextFiles);
    setGalleryPreviews(nextPreviews);
    onChange({ galleryFiles: nextFiles });
  };

  const handleGalleryDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length > 0) handleGallerySelect(files);
  };

  const preventDefaults = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          M&eacute;dias de l&rsquo;&eacute;tablissement
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Ajoutez le logo, une image de couverture et des photos pour votre galerie.
          Les images sont automatiquement compress&eacute;es en WebP pour un chargement rapide.
        </p>
      </div>

      {/* ---- Logo + Couverture — côte à côte ---- */}
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
        {/* Logo */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-slate-700">
            Logo{" "}
            <span className="font-normal text-slate-400">(recommand&eacute;)</span>
          </Label>

          {!effectiveLogoPreview ? (
            <div
              onDrop={handleLogoDrop}
              onDragOver={preventDefaults}
              onDragEnter={preventDefaults}
              onClick={() => logoInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-4 cursor-pointer transition-colors hover:border-primary/40 hover:bg-slate-50 aspect-square max-h-[200px]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 border border-slate-200">
                <Store className="h-5 w-5 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500">
                  Glissez ou{" "}
                  <span className="font-medium text-primary underline">
                    parcourir
                  </span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Carr&eacute; 200&times;200 px min
                </p>
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept={ACCEPTED_FORMATS}
                className="hidden"
                onChange={handleLogoInputChange}
              />
            </div>
          ) : (
            <div className="relative aspect-square max-h-[200px] rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50 group">
              <img
                src={effectiveLogoPreview}
                alt="Logo"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 hover:bg-white transition-colors"
                  aria-label="Changer le logo"
                >
                  <Upload className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-600 hover:bg-white transition-colors"
                  aria-label="Supprimer le logo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept={ACCEPTED_FORMATS}
                className="hidden"
                onChange={handleLogoInputChange}
              />
            </div>
          )}

          <p className="text-[10px] text-slate-400 leading-tight">
            {ACCEPTED_LABEL} &middot; Max 5 MB
            <br />
            PNG transparent id&eacute;al
          </p>
        </div>

        {/* Couverture */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-slate-700">
            Couverture <span className="text-red-500">*</span>
          </Label>

          {!effectiveCoverPreview ? (
            <div
              onDrop={handleCoverDrop}
              onDragOver={preventDefaults}
              onDragEnter={preventDefaults}
              onClick={() => coverInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-4 cursor-pointer transition-colors hover:border-primary/40 hover:bg-slate-50 aspect-video max-h-[200px]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Upload className="h-5 w-5 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500">
                  Glissez ou{" "}
                  <span className="font-medium text-primary underline">
                    parcourir
                  </span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Format 16:9 recommand&eacute;
                </p>
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept={ACCEPTED_FORMATS}
                className="hidden"
                onChange={handleCoverInputChange}
              />
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border-2 border-slate-200 group aspect-video max-h-[200px]">
              <img
                src={effectiveCoverPreview}
                alt="Couverture"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 hover:bg-white transition-colors"
                  aria-label="Changer la couverture"
                >
                  <Upload className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleRemoveCover}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-600 hover:bg-white transition-colors"
                  aria-label="Supprimer la couverture"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept={ACCEPTED_FORMATS}
                className="hidden"
                onChange={handleCoverInputChange}
              />
            </div>
          )}

          <p className="text-[10px] text-slate-400 leading-tight">
            {ACCEPTED_LABEL} &middot; Max 5 MB
            <br />
            Compress&eacute;e automatiquement en WebP (≈&thinsp;200 Ko)
          </p>
        </div>
      </div>

      {/* ---- Section: Galerie ---- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-slate-700">
            Galerie{" "}
            <span className="font-normal text-slate-400">(optionnel)</span>
          </Label>
          <span className="text-xs text-slate-400">
            {existingGalleryUrls.length + galleryFiles.length}/{MAX_GALLERY} images
          </span>
        </div>

        {existingGalleryUrls.length === 0 && galleryFiles.length === 0 ? (
          <div
            onDrop={handleGalleryDrop}
            onDragOver={preventDefaults}
            onDragEnter={preventDefaults}
            onClick={() => galleryInputRef.current?.click()}
            className="flex items-center justify-center gap-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-5 py-5 cursor-pointer transition-colors hover:border-primary/40 hover:bg-slate-50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100">
              <Image className="h-4 w-4 text-slate-400" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm text-slate-500">
                Glissez des images ici ou{" "}
                <span className="font-medium text-primary underline">
                  parcourir
                </span>
              </p>
              <span className="text-[10px] text-slate-400">
                Jusqu&rsquo;&agrave; {MAX_GALLERY} images &middot; {ACCEPTED_LABEL} &middot; Max 5 MB chacune
                &middot; Compress&eacute;es automatiquement en WebP
              </span>
            </div>
            <input
              ref={galleryInputRef}
              type="file"
              accept={ACCEPTED_FORMATS}
              multiple
              className="hidden"
              onChange={handleGalleryInputChange}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Grid of previews */}
            <div
              onDrop={handleGalleryDrop}
              onDragOver={preventDefaults}
              onDragEnter={preventDefaults}
              className="grid grid-cols-3 gap-3 md:grid-cols-4"
            >
              {/* Existing gallery images from DB */}
              {existingGalleryUrls.map((url, idx) => (
                <div key={`existing-${idx}`} className="group relative aspect-square">
                  <img
                    src={url}
                    alt={`Galerie ${idx + 1}`}
                    className="h-full w-full rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      // Find the original index in data.galleryUrls
                      const originalIdx = (data.galleryUrls ?? []).indexOf(url);
                      if (originalIdx >= 0) {
                        setRemovedGalleryUrls(prev => new Set([...prev, originalIdx]));
                        // Update parent: remove this URL from galleryUrls
                        const updatedUrls = (data.galleryUrls ?? []).filter((_, i) => i !== originalIdx && !removedGalleryUrls.has(i));
                        onChange({ galleryUrls: updatedUrls });
                      }
                    }}
                    className="absolute end-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {/* New gallery images (file uploads) */}
              {galleryPreviews.map((url, idx) => (
                <div key={`new-${idx}`} className="group relative aspect-square">
                  <img
                    src={url}
                    alt={`Galerie ${existingGalleryUrls.length + idx + 1}`}
                    className="h-full w-full rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveGalleryImage(idx)}
                    className="absolute end-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add more button */}
            {(existingGalleryUrls.length + galleryFiles.length) < MAX_GALLERY && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => galleryInputRef.current?.click()}
                >
                  <Plus className="h-4 w-4" />
                  Ajouter des images
                </Button>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept={ACCEPTED_FORMATS}
                  multiple
                  className="hidden"
                  onChange={handleGalleryInputChange}
                />
              </>
            )}

            <p className="text-[10px] text-slate-400">
              {ACCEPTED_LABEL} &middot; Max 5 MB chacune &middot; Compress&eacute;es automatiquement en WebP (≈&thinsp;300 Ko/image)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
