import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export interface FormField {
  label: string;
  type: string; // "text" | "email" | "phone" | "select" | "textarea" | "checkbox"
  required: boolean;
  options?: string[]; // for select type
}

interface BannerFormFieldsProps {
  fields: FormField[];
  onSubmit: (data: Record<string, unknown>) => void;
  confirmationMessage?: string | null;
  isSubmitting?: boolean;
}

function validateEmail(value: string): boolean {
  return value.includes("@") && value.includes(".");
}

export function BannerFormFields({
  fields,
  onSubmit,
  confirmationMessage = null,
  isSubmitting = false,
}: BannerFormFieldsProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const field of fields) {
      initial[field.label] = field.type === "checkbox" ? false : "";
    }
    return initial;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  function setValue(label: string, value: unknown) {
    setValues((prev) => ({ ...prev, [label]: value }));
    // Clear error on change
    if (errors[label]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[label];
        return next;
      });
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    for (const field of fields) {
      const val = values[field.label];

      if (field.required) {
        if (field.type === "checkbox") {
          if (!val) newErrors[field.label] = "Ce champ est requis";
        } else if (!val || (typeof val === "string" && val.trim() === "")) {
          newErrors[field.label] = "Ce champ est requis";
        }
      }

      if (
        field.type === "email" &&
        typeof val === "string" &&
        val.trim() !== "" &&
        !validateEmail(val)
      ) {
        newErrors[field.label] = "Adresse email invalide";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(values);
    setSubmitted(true);
  }

  if (submitted && confirmationMessage) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        {confirmationMessage}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((field) => {
        const error = errors[field.label];
        const id = `banner-field-${field.label.replace(/\s+/g, "-").toLowerCase()}`;

        if (field.type === "checkbox") {
          return (
            <div key={field.label} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={!!values[field.label]}
                  onCheckedChange={(checked) =>
                    setValue(field.label, !!checked)
                  }
                />
                <Label htmlFor={id} className="cursor-pointer">
                  {field.label}
                  {field.required && <span className="ms-0.5 text-red-500">*</span>}
                </Label>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          );
        }

        if (field.type === "select") {
          return (
            <div key={field.label} className="flex flex-col gap-1.5">
              <Label htmlFor={id}>
                {field.label}
                {field.required && <span className="ms-0.5 text-red-500">*</span>}
              </Label>
              <Select
                value={(values[field.label] as string) || ""}
                onValueChange={(v) => setValue(field.label, v)}
              >
                <SelectTrigger id={id}>
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          );
        }

        if (field.type === "textarea") {
          return (
            <div key={field.label} className="flex flex-col gap-1.5">
              <Label htmlFor={id}>
                {field.label}
                {field.required && <span className="ms-0.5 text-red-500">*</span>}
              </Label>
              <Textarea
                id={id}
                value={(values[field.label] as string) || ""}
                onChange={(e) => setValue(field.label, e.target.value)}
                rows={4}
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          );
        }

        // text, email, phone
        const inputType =
          field.type === "email"
            ? "email"
            : field.type === "phone"
              ? "tel"
              : "text";

        return (
          <div key={field.label} className="flex flex-col gap-1.5">
            <Label htmlFor={id}>
              {field.label}
              {field.required && <span className="ms-0.5 text-red-500">*</span>}
            </Label>
            <Input
              id={id}
              type={inputType}
              value={(values[field.label] as string) || ""}
              onChange={(e) => setValue(field.label, e.target.value)}
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        );
      })}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        {isSubmitting ? "Envoi en cours..." : "Envoyer"}
      </Button>
    </form>
  );
}
