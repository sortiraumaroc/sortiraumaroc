/**
 * ClaimEstablishmentDialog
 *
 * Dialog for business owners to claim their establishment listing.
 * Includes a form with contact details and a captcha for spam prevention.
 */

import { useState, useEffect } from "react";
import { Building2, Calendar, Loader2, Mail, Phone, User } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishmentId: string;
  establishmentName: string;
};

type FormData = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  preferredDay: string;
  preferredTime: string;
};

// Generate a simple captcha (letters and numbers)
function generateCaptcha(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const PREFERRED_DAYS = [
  { value: "lundi", label: "Lundi" },
  { value: "mardi", label: "Mardi" },
  { value: "mercredi", label: "Mercredi" },
  { value: "jeudi", label: "Jeudi" },
  { value: "vendredi", label: "Vendredi" },
  { value: "samedi", label: "Samedi" },
];

const TIME_SLOTS = [
  { value: "9h-11h", label: "9h00 - 11h00" },
  { value: "11h-13h", label: "11h00 - 13h00" },
  { value: "14h-16h", label: "14h00 - 16h00" },
  { value: "16h-18h", label: "16h00 - 18h00" },
];

export function ClaimEstablishmentDialog({
  open,
  onOpenChange,
  establishmentId,
  establishmentName,
}: Props) {
  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    preferredDay: "",
    preferredTime: "",
  });
  const [captchaCode, setCaptchaCode] = useState(() => generateCaptcha());
  const [captchaInput, setCaptchaInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setFormData({
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        preferredDay: "",
        preferredTime: "",
      });
      setCaptchaCode(generateCaptcha());
      setCaptchaInput("");
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  const isFormValid =
    formData.firstName.trim().length >= 2 &&
    formData.lastName.trim().length >= 2 &&
    formData.phone.trim().length >= 10 &&
    formData.email.includes("@") &&
    formData.preferredDay &&
    formData.preferredTime &&
    captchaInput.length === 6;

  const handleSubmit = async () => {
    // Verify captcha
    if (captchaInput.toUpperCase() !== captchaCode) {
      setError("Le code de sécurité est incorrect.");
      setCaptchaCode(generateCaptcha());
      setCaptchaInput("");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/public/claim-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          establishmentName,
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim().toLowerCase(),
          preferredDay: formData.preferredDay,
          preferredTime: formData.preferredTime,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Une erreur est survenue");
      }

      setSuccess(true);
      toast({
        title: "Demande envoyée",
        description: "Nous vous contacterons dans les plus brefs délais.",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue");
      setCaptchaCode(generateCaptcha());
      setCaptchaInput("");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <Building2 className="h-5 w-5" />
              Demande envoyée
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <Building2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-lg">Merci pour votre demande !</p>
              <p className="text-muted-foreground mt-2">
                Notre équipe vous contactera le{" "}
                <span className="font-medium">{formData.preferredDay}</span> entre{" "}
                <span className="font-medium">
                  {TIME_SLOTS.find((t) => t.value === formData.preferredTime)?.label}
                </span>{" "}
                pour finaliser la prise en charge de votre établissement.
              </p>
            </div>
            <Button onClick={() => onOpenChange(false)} className="mt-4">
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto px-4 sm:px-6 mx-3 sm:mx-auto rounded-xl">
        <DialogHeader className="text-center">
          <DialogTitle className="flex items-center justify-center gap-2 text-lg uppercase tracking-wide text-primary">
            <Building2 className="h-5 w-5" />
            C'EST VOTRE ENTREPRISE ?
          </DialogTitle>
          <DialogDescription className="text-center">
            Vous êtes le propriétaire ou le gérant de{" "}
            <span className="font-semibold text-foreground">{establishmentName}</span> ?
            Remplissez ce formulaire et notre équipe vous contactera pour activer votre espace professionnel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4 px-1">
          {/* Name fields - aligned on same row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="claim-firstName" className="flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4 text-muted-foreground" />
                Prénom
              </Label>
              <Input
                id="claim-firstName"
                value={formData.firstName}
                onChange={(e) => setFormData((p) => ({ ...p, firstName: e.target.value }))}
                placeholder="Votre prénom"
                autoComplete="given-name"
                className="h-10 rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-lastName" className="text-sm font-medium">Nom</Label>
              <Input
                id="claim-lastName"
                value={formData.lastName}
                onChange={(e) => setFormData((p) => ({ ...p, lastName: e.target.value }))}
                placeholder="Votre nom"
                autoComplete="family-name"
                className="h-10 rounded-lg"
              />
            </div>
          </div>

          {/* Contact fields */}
          <div className="space-y-1.5">
            <Label htmlFor="claim-phone" className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Téléphone
            </Label>
            <Input
              id="claim-phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
              placeholder="06 00 00 00 00"
              autoComplete="tel"
              className="h-10 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="claim-email" className="flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email professionnel
            </Label>
            <Input
              id="claim-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
              placeholder="contact@votre-etablissement.ma"
              autoComplete="email"
              className="h-10 rounded-lg"
            />
          </div>

          {/* Availability - aligned on same row */}
          <div className="pt-3 border-t border-slate-200">
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Quand pouvons-nous vous appeler ?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="claim-day" className="text-sm font-medium">Jour préféré</Label>
                <Select
                  value={formData.preferredDay}
                  onValueChange={(v) => setFormData((p) => ({ ...p, preferredDay: v }))}
                >
                  <SelectTrigger id="claim-day" className="h-10 rounded-lg">
                    <SelectValue placeholder="Choisir un jour" />
                  </SelectTrigger>
                  <SelectContent>
                    {PREFERRED_DAYS.map((day) => (
                      <SelectItem key={day.value} value={day.value}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="claim-time" className="text-sm font-medium">
                  Créneau horaire
                </Label>
                <Select
                  value={formData.preferredTime}
                  onValueChange={(v) => setFormData((p) => ({ ...p, preferredTime: v }))}
                >
                  <SelectTrigger id="claim-time" className="h-10 rounded-lg">
                    <SelectValue placeholder="Choisir un créneau" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map((slot) => (
                      <SelectItem key={slot.value} value={slot.value}>
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Captcha - better aligned */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <Label htmlFor="claim-captcha" className="text-sm font-medium">Code de sécurité</Label>
            <div className="flex items-center gap-3">
              <div
                className="flex-shrink-0 px-4 py-2.5 bg-slate-100 border border-slate-300 rounded-lg font-mono text-lg tracking-widest select-none"
                style={{
                  fontFamily: "monospace",
                  letterSpacing: "0.25em",
                  background: "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
                  textDecoration: "line-through",
                  textDecorationColor: "rgba(0,0,0,0.1)",
                }}
              >
                {captchaCode}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => {
                  setCaptchaCode(generateCaptcha());
                  setCaptchaInput("");
                }}
              >
                Nouveau code
              </Button>
            </div>
            <Input
              id="claim-captcha"
              type="text"
              value={captchaInput}
              onChange={(e) => setCaptchaInput(e.target.value.toUpperCase())}
              placeholder="RECOPIEZ LE CODE CI-DESSUS"
              autoComplete="off"
              className="h-10 rounded-lg font-mono tracking-wide uppercase"
              maxLength={6}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="rounded-lg">
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!isFormValid || submitting} className="rounded-lg">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
                Envoi en cours...
              </>
            ) : (
              "Envoyer ma demande"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
