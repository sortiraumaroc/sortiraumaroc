import { useState } from "react";
import { CalendarIcon, Upload, X, Link as LinkIcon } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type {
  BriefFieldTemplate,
  BriefSectionTemplate,
  UniverseBriefTemplate,
} from "./mediaFactoryStatus";

type Props = {
  template: UniverseBriefTemplate;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
  onFileUpload?: (key: string, files: FileList) => Promise<string[]>;
  uploadedFiles?: Record<string, string[]>;
};

/**
 * Composant de rendu dynamique des formulaires de brief Media Factory
 * Gère les sections accordion et tous les types de champs
 */
export function BriefFormRenderer({
  template,
  values,
  onChange,
  disabled = false,
  onFileUpload,
  uploadedFiles = {},
}: Props) {
  const [openSections, setOpenSections] = useState<string[]>(
    template.sections.slice(0, 2).map((s) => s.key)
  );

  // Grouper les champs par section
  const fieldsBySection: Record<string, BriefFieldTemplate[]> = {};
  for (const field of template.fields) {
    const sectionKey = field.section ?? "general";
    if (!fieldsBySection[sectionKey]) {
      fieldsBySection[sectionKey] = [];
    }
    fieldsBySection[sectionKey].push(field);
  }

  return (
    <div className="space-y-4">
      {/* Universe badge */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
        <span className="text-sm font-semibold text-primary">
          {template.label}
        </span>
        <span className="text-xs text-slate-600">
          {template.description}
        </span>
      </div>

      {/* Sections accordion */}
      <Accordion
        type="multiple"
        value={openSections}
        onValueChange={setOpenSections}
        className="space-y-2"
      >
        {template.sections.map((section) => {
          const sectionFields = fieldsBySection[section.key] ?? [];
          if (sectionFields.length === 0) return null;

          // Compter les champs remplis
          const filledCount = sectionFields.filter(
            (f) => values[f.key]?.trim()
          ).length;
          const requiredCount = sectionFields.filter((f) => f.required).length;
          const requiredFilledCount = sectionFields.filter(
            (f) => f.required && values[f.key]?.trim()
          ).length;

          return (
            <AccordionItem
              key={section.key}
              value={section.key}
              className="border rounded-lg overflow-hidden"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50">
                <div className="flex items-center gap-3 text-start">
                  <span className="text-lg">{section.icon}</span>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{section.title}</div>
                    {section.description && (
                      <div className="text-xs text-slate-500 font-normal">
                        {section.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {requiredCount > 0 && (
                      <Badge
                        variant={
                          requiredFilledCount === requiredCount
                            ? "default"
                            : "secondary"
                        }
                        className={cn(
                          "text-[10px] h-5",
                          requiredFilledCount === requiredCount
                            ? "bg-emerald-500"
                            : ""
                        )}
                      >
                        {requiredFilledCount}/{requiredCount} requis
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] h-5">
                      {filledCount}/{sectionFields.length}
                    </Badge>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sectionFields.map((field) => (
                    <BriefFieldRenderer
                      key={field.key}
                      field={field}
                      value={values[field.key] ?? ""}
                      onChange={(v) => onChange(field.key, v)}
                      disabled={disabled}
                      onFileUpload={onFileUpload}
                      uploadedUrls={uploadedFiles[field.key]}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

/**
 * Rendu d'un champ individuel selon son type
 */
function BriefFieldRenderer({
  field,
  value,
  onChange,
  disabled,
  onFileUpload,
  uploadedUrls,
}: {
  field: BriefFieldTemplate;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onFileUpload?: (key: string, files: FileList) => Promise<string[]>;
  uploadedUrls?: string[];
}) {
  const [uploading, setUploading] = useState(false);

  // Déterminer si le champ prend toute la largeur
  const isWide =
    field.type === "textarea" ||
    field.type === "multiselect" ||
    field.type === "file" ||
    field.key.includes("_autre") ||
    field.key.includes("description") ||
    field.key.includes("details");

  const wrapperClass = cn("space-y-2", isWide && "md:col-span-2");

  // Label avec icône et indicateur requis
  const labelContent = (
    <Label className="flex items-center gap-2 text-sm">
      {field.icon && <span>{field.icon}</span>}
      <span>{field.label}</span>
      {field.required && <span className="text-rose-500">*</span>}
    </Label>
  );

  // Hint/description
  const hintContent = field.hint && (
    <div className="text-[11px] text-slate-500">{field.hint}</div>
  );

  // Rendu selon le type
  switch (field.type) {
    case "textarea":
      return (
        <div className={wrapperClass}>
          {labelContent}
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={field.hint}
            rows={4}
            className="resize-none"
          />
          {hintContent}
        </div>
      );

    case "select":
      return (
        <div className={wrapperClass}>
          {labelContent}
          <Select
            value={value}
            onValueChange={onChange}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={field.hint || "Sélectionner..."} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case "multiselect":
      return (
        <div className={wrapperClass}>
          {labelContent}
          <MultiSelectField
            options={field.options ?? []}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
          {hintContent}
        </div>
      );

    case "date":
      return (
        <div className={wrapperClass}>
          {labelContent}
          <DatePickerField
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
          {hintContent}
        </div>
      );

    case "url":
      return (
        <div className={wrapperClass}>
          {labelContent}
          <div className="relative">
            <LinkIcon className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              placeholder={field.hint || "https://..."}
              className="ps-9"
            />
          </div>
          {hintContent}
        </div>
      );

    case "file":
      return (
        <div className={wrapperClass}>
          {labelContent}
          <FileUploadField
            value={value}
            onChange={onChange}
            disabled={disabled}
            accept={field.accept}
            multiple={field.multiple}
            onUpload={onFileUpload ? (files) => onFileUpload(field.key, files) : undefined}
            uploading={uploading}
            setUploading={setUploading}
            uploadedUrls={uploadedUrls}
          />
          {hintContent}
        </div>
      );

    case "number":
      return (
        <div className={wrapperClass}>
          {labelContent}
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={field.hint}
          />
          {hintContent}
        </div>
      );

    case "checkbox":
      return (
        <div className={wrapperClass}>
          <div className="flex items-center gap-2">
            <Checkbox
              id={field.key}
              checked={value === "true"}
              onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
              disabled={disabled}
            />
            {labelContent}
          </div>
          {hintContent}
        </div>
      );

    default: // text
      return (
        <div className={wrapperClass}>
          {labelContent}
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={field.hint}
          />
          {hintContent}
        </div>
      );
  }
}

/**
 * Champ multiselect avec checkboxes
 */
function MultiSelectField({
  options,
  value,
  onChange,
  disabled,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  // Parse value as array
  const selectedValues: string[] = value
    ? value.split("|||").filter(Boolean)
    : [];

  const toggleOption = (opt: string) => {
    if (disabled) return;
    const newValues = selectedValues.includes(opt)
      ? selectedValues.filter((v) => v !== opt)
      : [...selectedValues, opt];
    onChange(newValues.join("|||"));
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border rounded-lg bg-slate-50/50">
      {options.map((opt) => (
        <label
          key={opt}
          className={cn(
            "flex items-center gap-2 cursor-pointer p-2 rounded-md transition-colors",
            selectedValues.includes(opt)
              ? "bg-primary/10 border border-primary/20"
              : "hover:bg-slate-100",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          <Checkbox
            checked={selectedValues.includes(opt)}
            onCheckedChange={() => toggleOption(opt)}
            disabled={disabled}
          />
          <span className="text-xs">{opt}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Champ date picker
 */
function DatePickerField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const date = value ? new Date(value) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-start font-normal",
            !value && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="me-2 h-4 w-4" />
          {date ? format(date, "PPP", { locale: fr }) : "Sélectionner une date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => onChange(d ? d.toISOString() : "")}
          initialFocus
          locale={fr}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Champ upload de fichiers
 */
function FileUploadField({
  value,
  onChange,
  disabled,
  accept,
  multiple,
  onUpload,
  uploading,
  setUploading,
  uploadedUrls,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  accept?: string;
  multiple?: boolean;
  onUpload?: (files: FileList) => Promise<string[]>;
  uploading: boolean;
  setUploading: (v: boolean) => void;
  uploadedUrls?: string[];
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Parse uploaded URLs from value
  const urls: string[] = uploadedUrls ?? (value ? value.split("|||").filter(Boolean) : []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setSelectedFiles(Array.from(files));

    if (onUpload) {
      setUploading(true);
      try {
        const uploadedUrls = await onUpload(files);
        const currentUrls = value ? value.split("|||").filter(Boolean) : [];
        const newValue = [...currentUrls, ...uploadedUrls].join("|||");
        onChange(newValue);
      } catch (error) {
        console.error("Upload failed:", error);
      } finally {
        setUploading(false);
        setSelectedFiles([]);
      }
    } else {
      // Sans handler d'upload, on stocke juste les noms
      const fileNames = Array.from(files).map((f) => f.name);
      const currentNames = value ? value.split("|||").filter(Boolean) : [];
      const newValue = [...currentNames, ...fileNames].join("|||");
      onChange(newValue);
    }
  };

  const removeUrl = (urlToRemove: string) => {
    if (disabled) return;
    const currentUrls = value ? value.split("|||").filter(Boolean) : [];
    const newUrls = currentUrls.filter((u) => u !== urlToRemove);
    onChange(newUrls.join("|||"));
  };

  return (
    <div className="space-y-2">
      {/* Zone de drop / sélection */}
      <label
        className={cn(
          "flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
          disabled
            ? "bg-slate-100 cursor-not-allowed"
            : "bg-slate-50 hover:bg-slate-100 border-slate-300 hover:border-primary/50"
        )}
      >
        <div className="flex flex-col items-center justify-center pt-2 pb-2">
          {uploading ? (
            <div className="text-sm text-slate-500">Upload en cours...</div>
          ) : (
            <>
              <Upload className="w-6 h-6 mb-1 text-slate-400" />
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-primary">Cliquez</span> ou glissez-déposez
              </p>
              <p className="text-[10px] text-slate-400">
                {accept === "image/*" ? "PNG, JPG (max 10MB)" : "Fichiers acceptés"}
              </p>
            </>
          )}
        </div>
        <input
          type="file"
          className="hidden"
          accept={accept}
          multiple={multiple}
          disabled={disabled || uploading}
          onChange={handleFileSelect}
        />
      </label>

      {/* Liste des fichiers uploadés */}
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {urls.map((url, idx) => {
            const isImage = url.match(/\.(jpg|jpeg|png|gif|webp)$/i) || url.startsWith("data:image");
            const fileName = url.split("/").pop() || `Fichier ${idx + 1}`;

            return (
              <div
                key={url}
                className="relative group flex items-center gap-2 p-2 pe-8 bg-slate-100 rounded-lg text-xs"
              >
                {isImage && (
                  <img
                    src={url}
                    alt=""
                    className="w-10 h-10 object-cover rounded"
                  />
                )}
                <span className="truncate max-w-[120px]">{fileName}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeUrl(url)}
                    className="absolute end-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-slate-200 hover:bg-rose-100 hover:text-rose-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fichiers en attente d'upload */}
      {selectedFiles.length > 0 && uploading && (
        <div className="flex flex-wrap gap-2">
          {selectedFiles.map((file, idx) => (
            <Badge key={idx} variant="secondary" className="animate-pulse">
              {file.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
