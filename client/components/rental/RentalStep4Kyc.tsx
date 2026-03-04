import { useState, useRef, useCallback } from "react";
import { Camera, FileCheck, AlertCircle, X, CheckCircle2, CreditCard, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface RentalStep4KycProps {
  reservationId?: string;
  onNext: () => void;
  onBack: () => void;
  reusableKyc?: boolean;
}

type IdDocumentType = "cin" | "passport";

type DocumentSlot = {
  key: string;
  label: string;
  documentType: "permit" | "cin" | "passport";
  side: "front" | "back";
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// =============================================================================
// Upload zone sub-component
// =============================================================================

function UploadZone({
  slotKey,
  label,
  preview,
  error,
  onFileChange,
  onRemove,
  inputRef,
}: {
  slotKey: string;
  label: string;
  preview?: string;
  error?: string;
  onFileChange: (key: string, file: File | null) => void;
  onRemove: (key: string) => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-foreground">{label}</label>

      {preview ? (
        <div className="relative rounded-lg border-2 border-green-300 bg-green-50 overflow-hidden">
          <img src={preview} alt={label} className="w-full h-24 object-cover" />
          <button
            type="button"
            onClick={() => onRemove(slotKey)}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
            aria-label="Supprimer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-green-600/90 text-white text-[10px] font-medium py-0.5 px-2 text-center">
            Photo ajoutée
          </div>
        </div>
      ) : (
        <label
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border-2 border-dashed h-24 cursor-pointer transition-all",
            error
              ? "border-red-300 bg-red-50 hover:border-red-400"
              : "border-slate-300 bg-slate-50 hover:border-primary hover:bg-primary/5",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              onFileChange(slotKey, file);
            }}
          />
          <Camera className={cn("w-6 h-6 mb-1", error ? "text-red-400" : "text-slate-400")} />
          <span className={cn("text-[11px] font-medium", error ? "text-red-600" : "text-slate-500")}>
            Appuyez pour capturer
          </span>
          <span className="text-[10px] text-slate-400">JPG, PNG - Max 5 Mo</span>
        </label>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-red-600">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <p className="text-[11px]">{error}</p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function RentalStep4Kyc({
  reservationId,
  onNext,
  onBack,
  reusableKyc = false,
}: RentalStep4KycProps) {
  const [idDocType, setIdDocType] = useState<IdDocumentType | null>(null);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Derive document slots based on selection
  const idSlots: DocumentSlot[] =
    idDocType === "cin"
      ? [
          { key: "cin_front", label: "CIN (recto)", documentType: "cin", side: "front" },
          { key: "cin_back", label: "CIN (verso)", documentType: "cin", side: "back" },
        ]
      : idDocType === "passport"
        ? [
            { key: "passport_front", label: "Passeport (page principale)", documentType: "passport", side: "front" },
          ]
        : [];

  const permitSlots: DocumentSlot[] = [
    { key: "permit_front", label: "Permis de conduire (recto)", documentType: "permit", side: "front" },
    { key: "permit_back", label: "Permis de conduire (verso)", documentType: "permit", side: "back" },
  ];

  // Check if ID step is complete
  const idComplete = idSlots.length > 0 && idSlots.every((s) => files[s.key]);
  // Check if permit step is complete
  const permitComplete = permitSlots.every((s) => files[s.key]);
  const allComplete = reusableKyc || (idComplete && permitComplete);
  const hasErrors = Object.keys(errors).length > 0;

  const handleFileChange = useCallback(
    (slotKey: string, file: File | null) => {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[slotKey];
        return next;
      });

      if (!file) {
        setFiles((prev) => ({ ...prev, [slotKey]: null }));
        setPreviews((prev) => {
          const next = { ...prev };
          if (next[slotKey]) URL.revokeObjectURL(next[slotKey]);
          delete next[slotKey];
          return next;
        });
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setErrors((prev) => ({ ...prev, [slotKey]: "Fichier trop volumineux (max 5 Mo)" }));
        return;
      }

      if (!file.type.startsWith("image/")) {
        setErrors((prev) => ({ ...prev, [slotKey]: "Seuls les fichiers image sont acceptés" }));
        return;
      }

      setFiles((prev) => ({ ...prev, [slotKey]: file }));
      setPreviews((prev) => {
        if (prev[slotKey]) URL.revokeObjectURL(prev[slotKey]);
        return { ...prev, [slotKey]: URL.createObjectURL(file) };
      });
    },
    [],
  );

  const handleRemoveFile = useCallback(
    (slotKey: string) => {
      handleFileChange(slotKey, null);
      const input = inputRefs.current[slotKey];
      if (input) input.value = "";
    },
    [handleFileChange],
  );

  // Reset files when changing ID doc type
  const handleIdDocTypeChange = (type: IdDocumentType) => {
    // Clear old ID files
    const oldKeys = idDocType === "cin" ? ["cin_front", "cin_back"] : idDocType === "passport" ? ["passport_front"] : [];
    for (const key of oldKeys) {
      if (previews[key]) URL.revokeObjectURL(previews[key]);
    }
    setFiles((prev) => {
      const next = { ...prev };
      for (const key of oldKeys) delete next[key];
      return next;
    });
    setPreviews((prev) => {
      const next = { ...prev };
      for (const key of oldKeys) delete next[key];
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of oldKeys) delete next[key];
      return next;
    });
    setIdDocType(type);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FileCheck className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Vérification d'identité</h2>
        </div>
        <p className="text-sm text-slate-600">
          Pour confirmer votre réservation, nous avons besoin de vérifier votre identité.
        </p>
      </div>

      {/* Reusable KYC */}
      {reusableKyc && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Documents précédents réutilisés</p>
              <p className="text-xs text-green-700 mt-1 leading-relaxed">
                Vos documents d'une réservation précédente ont été automatiquement associés.
              </p>
            </div>
          </div>
        </div>
      )}

      {!reusableKyc && (
        <>
          {/* ─── ÉTAPE 1 : Choisir le type de pièce d'identité ─── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold">1</div>
              <h3 className="text-sm font-bold text-foreground">Pièce d'identité</h3>
            </div>

            {/* Type selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleIdDocTypeChange("cin")}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border-2 p-3 transition-all text-left",
                  idDocType === "cin"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                <CreditCard className={cn("w-5 h-5 shrink-0", idDocType === "cin" ? "text-primary" : "text-slate-400")} />
                <div>
                  <div className={cn("text-sm font-semibold", idDocType === "cin" ? "text-primary" : "text-slate-700")}>CIN</div>
                  <div className="text-[10px] text-slate-500">Carte d'identité nationale</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleIdDocTypeChange("passport")}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border-2 p-3 transition-all text-left",
                  idDocType === "passport"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                <CreditCard className={cn("w-5 h-5 shrink-0", idDocType === "passport" ? "text-primary" : "text-slate-400")} />
                <div>
                  <div className={cn("text-sm font-semibold", idDocType === "passport" ? "text-primary" : "text-slate-700")}>Passeport</div>
                  <div className="text-[10px] text-slate-500">Document international</div>
                </div>
              </button>
            </div>

            {/* Upload zones for ID */}
            {idDocType && (
              <div className={cn("grid gap-3", idDocType === "cin" ? "grid-cols-2" : "grid-cols-1 max-w-[50%]")}>
                {idSlots.map((slot) => (
                  <UploadZone
                    key={slot.key}
                    slotKey={slot.key}
                    label={slot.label}
                    preview={previews[slot.key]}
                    error={errors[slot.key]}
                    onFileChange={handleFileChange}
                    onRemove={handleRemoveFile}
                    inputRef={(el) => { inputRefs.current[slot.key] = el; }}
                  />
                ))}
              </div>
            )}

            {/* ID complete indicator */}
            {idComplete && (
              <div className="flex items-center gap-1.5 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-medium">Pièce d'identité ajoutée</span>
              </div>
            )}
          </div>

          {/* ─── ÉTAPE 2 : Permis de conduire (visible quand ID est complété) ─── */}
          <div className={cn("space-y-3 transition-all", idComplete ? "opacity-100" : "opacity-40 pointer-events-none")}>
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                idComplete ? "bg-primary text-white" : "bg-slate-200 text-slate-500",
              )}>2</div>
              <h3 className="text-sm font-bold text-foreground">Permis de conduire</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {permitSlots.map((slot) => (
                <UploadZone
                  key={slot.key}
                  slotKey={slot.key}
                  label={slot.label}
                  preview={previews[slot.key]}
                  error={errors[slot.key]}
                  onFileChange={handleFileChange}
                  onRemove={handleRemoveFile}
                  inputRef={(el) => { inputRefs.current[slot.key] = el; }}
                />
              ))}
            </div>

            {/* Permit complete indicator */}
            {permitComplete && (
              <div className="flex items-center gap-1.5 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-medium">Permis de conduire ajouté</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Info text */}
      {!reusableKyc && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-600 leading-relaxed">
              Vos documents sont traités de manière sécurisée et ne seront utilisés
              que pour la vérification de votre identité. Ils seront supprimés après
              la fin de votre location.
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-11 font-bold">
          Retour
        </Button>
        <Button
          onClick={onNext}
          className="flex-1 h-11 text-base font-bold"
          size="lg"
          disabled={!allComplete || hasErrors}
        >
          Suivant
        </Button>
      </div>
    </div>
  );
}
