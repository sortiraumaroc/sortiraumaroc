import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle, Loader2, AlertCircle, ChevronDown, Star } from "lucide-react";
import { Helmet } from "react-helmet-async";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type FormField = {
  id: string;
  field_type: string;
  label: string;
  placeholder: string | null;
  helper_text: string | null;
  options: { value: string; label: string }[] | null;
  is_required: boolean;
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  pattern: string | null;
  default_country_code: string | null;
  allowed_country_codes: string[] | null;
  allowed_file_types: string[] | null;
  max_file_size_mb: number | null;
  width: "full" | "half" | "third";
  conditional_field_id: string | null;
  conditional_value: string | null;
};

type PublicForm = {
  id: string;
  name: string;
  slug: string;
  hero_image_url: string | null;
  hero_title: string;
  hero_subtitle: string | null;
  hero_background_color: string;
  hero_text_color: string;
  show_hero: boolean;
  logo_url: string | null;
  logo_title: string | null;
  logo_description: string | null;
  show_logo: boolean;
  form_title: string | null;
  submit_button_text: string;
  submit_button_color: string;
  success_message: string;
  success_redirect_url: string | null;
  layout: "split" | "centered" | "full-width";
  meta_title: string | null;
  meta_description: string | null;
  fields: FormField[];
};

// Countries list for phone field
const COUNTRIES = [
  { code: "MA", name: "Maroc", dialCode: "+212", flag: "🇲🇦" },
  { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
  { code: "BE", name: "Belgique", dialCode: "+32", flag: "🇧🇪" },
  { code: "CH", name: "Suisse", dialCode: "+41", flag: "🇨🇭" },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  { code: "US", name: "États-Unis", dialCode: "+1", flag: "🇺🇸" },
  { code: "GB", name: "Royaume-Uni", dialCode: "+44", flag: "🇬🇧" },
  { code: "DE", name: "Allemagne", dialCode: "+49", flag: "🇩🇪" },
  { code: "ES", name: "Espagne", dialCode: "+34", flag: "🇪🇸" },
  { code: "IT", name: "Italie", dialCode: "+39", flag: "🇮🇹" },
  { code: "PT", name: "Portugal", dialCode: "+351", flag: "🇵🇹" },
  { code: "NL", name: "Pays-Bas", dialCode: "+31", flag: "🇳🇱" },
  { code: "DZ", name: "Algérie", dialCode: "+213", flag: "🇩🇿" },
  { code: "TN", name: "Tunisie", dialCode: "+216", flag: "🇹🇳" },
  { code: "SN", name: "Sénégal", dialCode: "+221", flag: "🇸🇳" },
  { code: "CI", name: "Côte d'Ivoire", dialCode: "+225", flag: "🇨🇮" },
];

export default function ContactFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState<PublicForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const loadForm = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/form/${slug}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Formulaire introuvable");
        } else {
          setError("Une erreur est survenue");
        }
        return;
      }
      const { form: data } = await res.json();
      setForm(data);

      // Initialize form data with defaults
      const initialData: Record<string, unknown> = {};
      data.fields.forEach((field: FormField) => {
        if (field.field_type === "phone" && field.default_country_code) {
          initialData[`${field.id}_code`] = field.default_country_code;
        }
        if (field.field_type === "checkbox") {
          initialData[field.id] = [];
        }
      });
      setFormData(initialData);
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  const updateField = (fieldId: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    // Clear error when user types
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || submitting) return;

    // Client-side validation
    const newErrors: Record<string, string> = {};
    form.fields.forEach((field) => {
      const value = formData[field.id];
      if (field.is_required) {
        if (!value || (typeof value === "string" && !value.trim())) {
          newErrors[field.id] = "Ce champ est requis";
        }
        if (Array.isArray(value) && value.length === 0) {
          newErrors[field.id] = "Sélectionnez au moins une option";
        }
      }
      if (field.field_type === "email" && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(value))) {
          newErrors[field.id] = "Adresse email invalide";
        }
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    // Prepare data (combine phone code with number)
    const submitData = { ...formData };
    form.fields.forEach((field) => {
      if (field.field_type === "phone") {
        const code = formData[`${field.id}_code`] || "+212";
        const number = formData[field.id] || "";
        submitData[field.id] = number ? `${code} ${number}` : "";
        delete submitData[`${field.id}_code`];
      }
    });

    try {
      const res = await fetch(`/api/form/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: submitData,
          utm_source: searchParams.get("utm_source"),
          utm_medium: searchParams.get("utm_medium"),
          utm_campaign: searchParams.get("utm_campaign"),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        if (result.errors) {
          setErrors(result.errors);
        } else {
          setErrors({ _form: result.error || "Une erreur est survenue" });
        }
        return;
      }

      // Success
      if (result.redirect_url) {
        window.location.href = result.redirect_url;
      } else {
        setSubmitted(true);
      }
    } catch (err) {
      console.error(err);
      setErrors({ _form: "Une erreur est survenue. Veuillez réessayer." });
    } finally {
      setSubmitting(false);
    }
  };

  // Check if field should be visible (conditional logic)
  const isFieldVisible = (field: FormField): boolean => {
    if (!field.conditional_field_id) return true;
    const conditionValue = formData[field.conditional_field_id];
    return conditionValue === field.conditional_value;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">{error || "Formulaire introuvable"}</h1>
          <p className="text-muted-foreground">
            Ce formulaire n'existe pas ou n'est plus disponible.
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (submitted) {
    return (
      <>
        <Helmet>
          <title>{form.meta_title || form.name}</title>
        </Helmet>
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="text-center max-w-md">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ backgroundColor: form.submit_button_color }}
            >
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-4">Merci !</h1>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {form.success_message}
            </p>
          </div>
        </div>
      </>
    );
  }

  const isSplit = form.layout === "split";
  const isCentered = form.layout === "centered";
  const isFullWidth = form.layout === "full-width";

  return (
    <>
      <Helmet>
        <title>{form.meta_title || form.name}</title>
        {form.meta_description && (
          <meta name="description" content={form.meta_description} />
        )}
      </Helmet>

      <div className="min-h-screen bg-slate-50">
        {/* Split layout */}
        {isSplit && (
          <div className="min-h-screen flex flex-col lg:flex-row">
            {/* Hero section */}
            {form.show_hero && (
              <div
                className="lg:w-1/2 p-8 lg:p-12 flex flex-col justify-center"
                style={{
                  backgroundColor: form.hero_background_color,
                  color: form.hero_text_color,
                }}
              >
                <div className="max-w-lg mx-auto lg:mx-0">
                  {form.show_logo && form.logo_url && (
                    <img
                      src={form.logo_url}
                      alt=""
                      className="h-12 mb-8"
                    />
                  )}
                  <h1 className="text-3xl lg:text-4xl font-bold mb-4">
                    {form.hero_title}
                  </h1>
                  {form.hero_subtitle && (
                    <p className="text-lg opacity-90">
                      {form.hero_subtitle}
                    </p>
                  )}
                  {form.hero_image_url && (
                    <img
                      src={form.hero_image_url}
                      alt=""
                      className="mt-8 rounded-lg max-w-full"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Form section */}
            <div className="lg:w-1/2 p-8 lg:p-12 flex items-center justify-center bg-white">
              <FormContent
                form={form}
                formData={formData}
                errors={errors}
                submitting={submitting}
                onSubmit={handleSubmit}
                updateField={updateField}
                isFieldVisible={isFieldVisible}
              />
            </div>
          </div>
        )}

        {/* Centered layout */}
        {isCentered && (
          <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-xl">
              {form.show_hero && (
                <div
                  className="rounded-t-2xl p-8 text-center"
                  style={{
                    backgroundColor: form.hero_background_color,
                    color: form.hero_text_color,
                  }}
                >
                  {form.show_logo && form.logo_url && (
                    <img
                      src={form.logo_url}
                      alt=""
                      className="h-10 mx-auto mb-6"
                    />
                  )}
                  <h1 className="text-2xl font-bold mb-2">{form.hero_title}</h1>
                  {form.hero_subtitle && (
                    <p className="opacity-90">{form.hero_subtitle}</p>
                  )}
                </div>
              )}
              <div
                className={cn(
                  "bg-white p-8",
                  form.show_hero ? "rounded-b-2xl" : "rounded-2xl"
                )}
              >
                <FormContent
                  form={form}
                  formData={formData}
                  errors={errors}
                  submitting={submitting}
                  onSubmit={handleSubmit}
                  updateField={updateField}
                  isFieldVisible={isFieldVisible}
                />
              </div>
            </div>
          </div>
        )}

        {/* Full-width layout */}
        {isFullWidth && (
          <div>
            {form.show_hero && (
              <div
                className="py-16 px-4"
                style={{
                  backgroundColor: form.hero_background_color,
                  color: form.hero_text_color,
                }}
              >
                <div className="max-w-2xl mx-auto text-center">
                  {form.show_logo && form.logo_url && (
                    <img
                      src={form.logo_url}
                      alt=""
                      className="h-12 mx-auto mb-8"
                    />
                  )}
                  <h1 className="text-3xl lg:text-4xl font-bold mb-4">
                    {form.hero_title}
                  </h1>
                  {form.hero_subtitle && (
                    <p className="text-lg opacity-90">
                      {form.hero_subtitle}
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="py-12 px-4">
              <div className="max-w-xl mx-auto bg-white rounded-2xl p-8 shadow-sm">
                <FormContent
                  form={form}
                  formData={formData}
                  errors={errors}
                  submitting={submitting}
                  onSubmit={handleSubmit}
                  updateField={updateField}
                  isFieldVisible={isFieldVisible}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Form content component
function FormContent({
  form,
  formData,
  errors,
  submitting,
  onSubmit,
  updateField,
  isFieldVisible,
}: {
  form: PublicForm;
  formData: Record<string, unknown>;
  errors: Record<string, string>;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  updateField: (fieldId: string, value: unknown) => void;
  isFieldVisible: (field: FormField) => boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="w-full max-w-lg space-y-6">
      {form.form_title && (
        <h2 className="text-xl font-semibold">{form.form_title}</h2>
      )}

      {errors._form && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm">
          {errors._form}
        </div>
      )}

      <div className="grid grid-cols-6 gap-4">
        {form.fields.map((field) => {
          if (!isFieldVisible(field)) return null;

          const colSpan =
            field.width === "full"
              ? "col-span-6"
              : field.width === "half"
              ? "col-span-6 sm:col-span-3"
              : "col-span-6 sm:col-span-2";

          return (
            <div key={field.id} className={colSpan}>
              <FieldRenderer
                field={field}
                value={formData[field.id]}
                onChange={(v) => updateField(field.id, v)}
                error={errors[field.id]}
                formData={formData}
                updateField={updateField}
              />
            </div>
          );
        })}
      </div>

      <Button
        type="submit"
        className="w-full h-12 text-base font-semibold"
        style={{ backgroundColor: form.submit_button_color }}
        disabled={submitting}
      >
        {submitting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          form.submit_button_text
        )}
      </Button>
    </form>
  );
}

// Field renderer
function FieldRenderer({
  field,
  value,
  onChange,
  error,
  formData,
  updateField,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  formData: Record<string, unknown>;
  updateField: (fieldId: string, value: unknown) => void;
}) {
  const inputClass = cn(
    "w-full px-4 py-3 rounded-xl border bg-white transition-colors",
    error
      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
      : "border-slate-200 focus:border-primary focus:ring-primary"
  );

  switch (field.field_type) {
    case "text":
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <Input
            type="text"
            placeholder={field.placeholder || ""}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
            minLength={field.min_length ?? undefined}
            maxLength={field.max_length ?? undefined}
          />
          {field.helper_text && (
            <p className="text-xs text-muted-foreground">{field.helper_text}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );

    case "textarea":
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <Textarea
            placeholder={field.placeholder || ""}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={cn(inputClass, "min-h-[120px]")}
            minLength={field.min_length ?? undefined}
            maxLength={field.max_length ?? undefined}
          />
          {field.helper_text && (
            <p className="text-xs text-muted-foreground">{field.helper_text}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );

    case "email":
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <Input
            type="email"
            placeholder={field.placeholder || "email@exemple.com"}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
          {field.helper_text && (
            <p className="text-xs text-muted-foreground">{field.helper_text}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );

    case "phone":
      const phoneCode = formData[`${field.id}_code`] || field.default_country_code || "+212";
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <div className="flex gap-2">
            <Select
              value={String(phoneCode)}
              onValueChange={(v) => updateField(`${field.id}_code`, v)}
            >
              <SelectTrigger className="w-[100px] rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((country) => (
                  <SelectItem key={country.code} value={country.dialCode}>
                    {country.flag} {country.dialCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="tel"
              placeholder={field.placeholder || "0612345678"}
              value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
              className={cn(inputClass, "flex-1")}
            />
          </div>
          {field.helper_text && (
            <p className="text-xs text-muted-foreground">{field.helper_text}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );

    case "number":
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <Input
            type="number"
            placeholder={field.placeholder || ""}
            value={(value as string | number) ?? ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
            className={inputClass}
            min={field.min_value ?? undefined}
            max={field.max_value ?? undefined}
          />
          {field.helper_text && (
            <p className="text-xs text-muted-foreground">{field.helper_text}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );

    case "select":
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <Select value={String(value ?? "")} onValueChange={onChange}>
            <SelectTrigger className={inputClass}>
              <SelectValue placeholder={field.placeholder || "Sélectionnez..."} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.helper_text && (
            <p className="text-xs text-muted-foreground">{field.helper_text}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );

    case "radio":
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <RadioGroup value={String(value ?? "")} onValueChange={onChange}>
            {field.options?.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <RadioGroupItem value={opt.value} id={`${field.id}-${opt.value}`} />
                <Label htmlFor={`${field.id}-${opt.value}`} className="font-normal cursor-pointer">
                  {opt.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {field.helper_text && (
            <p className="text-xs text-muted-foreground">{field.helper_text}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );

    case "checkbox":
      const checkedValues = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <div className="space-y-2">
            {field.options?.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <Checkbox
                  id={`${field.id}-${opt.value}`}
                  checked={checkedValues.includes(opt.value)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange([...checkedValues, opt.value]);
                    } else {
                      onChange(checkedValues.filter((v: string) => v !== opt.value));
                    }
                  }}
                />
                <Label htmlFor={`${field.id}-${opt.value}`} className="font-normal cursor-pointer">
                  {opt.label}
                </Label>
              </div>
            ))}
          </div>
          {field.helper_text && (
            <p className="text-xs text-muted-foreground">{field.helper_text}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );

    case "date":
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <Input
            type="date"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
          {field.helper_text && (
            <p className="text-xs text-muted-foreground">{field.helper_text}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );

    case "time":
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <Input
            type="time"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
          {field.helper_text && (
            <p className="text-xs text-muted-foreground">{field.helper_text}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );

    case "datetime":
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <Input
            type="datetime-local"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
          {field.helper_text && (
            <p className="text-xs text-muted-foreground">{field.helper_text}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );

    case "country":
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <Select value={String(value ?? "")} onValueChange={onChange}>
            <SelectTrigger className={inputClass}>
              <SelectValue placeholder={field.placeholder || "Sélectionnez un pays..."} />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {country.flag} {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.helper_text && (
            <p className="text-xs text-muted-foreground">{field.helper_text}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );

    case "rating":
      const ratingValue = Number(value) || 0;
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => onChange(star)}
                className="p-1"
              >
                <Star
                  className={cn(
                    "w-8 h-8 transition-colors",
                    star <= ratingValue
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-slate-300"
                  )}
                />
              </button>
            ))}
          </div>
          {field.helper_text && (
            <p className="text-xs text-muted-foreground">{field.helper_text}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );

    case "hidden":
      return (
        <input
          type="hidden"
          value={String(value ?? field.placeholder ?? "")}
        />
      );

    case "heading":
      return (
        <div className="pt-4 pb-2">
          <h3 className="text-lg font-semibold text-slate-900">{field.label}</h3>
          {field.helper_text && (
            <p className="text-sm text-muted-foreground mt-1">{field.helper_text}</p>
          )}
        </div>
      );

    case "paragraph":
      return (
        <div className="py-2">
          <p className="text-sm text-slate-600 leading-relaxed">{field.label}</p>
          {field.helper_text && (
            <p className="text-xs text-muted-foreground mt-1 italic">{field.helper_text}</p>
          )}
        </div>
      );

    default:
      return (
        <div className="space-y-1.5">
          <Label>
            {field.label}
            {field.is_required && <span className="text-red-500 ms-1">*</span>}
          </Label>
          <Input
            type="text"
            placeholder={field.placeholder || ""}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );
  }
}
