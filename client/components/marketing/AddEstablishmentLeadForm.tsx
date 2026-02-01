import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { EstablishmentLeadCategory, EstablishmentLeadPayload } from "@/lib/leadsApi";
import { submitEstablishmentLead } from "@/lib/leadsApi";

const CATEGORIES: EstablishmentLeadCategory[] = ["Food", "Loisirs", "Sports", "Bien-être", "Tourisme"];

function normalizePhone(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function AddEstablishmentLeadForm(props: {
  compact?: boolean;
  onSubmitted?: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [establishmentName, setEstablishmentName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<EstablishmentLeadCategory | "">("");

  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    const e = normalizeEmail(email);
    return (
      fullName.trim().length >= 2 &&
      establishmentName.trim().length >= 2 &&
      city.trim().length >= 2 &&
      normalizePhone(phone).length >= 6 &&
      normalizePhone(whatsapp).length >= 6 &&
      isEmail(e) &&
      !!category
    );
  }, [category, city, email, establishmentName, fullName, phone, whatsapp]);

  const submit = async () => {
    if (!canSubmit || submitting) return;

    const payload: EstablishmentLeadPayload = {
      full_name: fullName.trim(),
      establishment_name: establishmentName.trim(),
      city: city.trim(),
      phone: normalizePhone(phone),
      whatsapp: normalizePhone(whatsapp),
      email: normalizeEmail(email),
      category: category as EstablishmentLeadCategory,
    };

    setSubmitting(true);
    const res = await submitEstablishmentLead(payload);
    setSubmitting(false);

    if (res.ok === false) {
      toast({
        title: "Envoi impossible",
        description: res.error,
      });
      return;
    }

    toast({
      title: "Demande envoyée",
      description: "Merci ! Notre équipe vous contacte très vite pour activer Sortir Au Maroc.",
    });

    setFullName("");
    setEstablishmentName("");
    setCity("");
    setPhone("");
    setWhatsapp("");
    setEmail("");
    setCategory("");

    props.onSubmitted?.();
  };

  const baseInputCls = "h-11 rounded-xl";

  return (
    <div className={props.compact ? "space-y-3" : "space-y-4"}>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-slate-700">Nom & prénom</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex : Yassine El Amrani" className={baseInputCls} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-slate-700">Nom de l’établissement</Label>
        <Input value={establishmentName} onChange={(e) => setEstablishmentName(e.target.value)} placeholder="Ex : Atlas Lodge" className={baseInputCls} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-slate-700">Ville</Label>
        <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex : Marrakech" className={baseInputCls} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-700">Téléphone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Ex : +212 6 12 34 56 78" className={baseInputCls} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-700">WhatsApp</Label>
          <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" placeholder="Ex : +212 6 12 34 56 78" className={baseInputCls} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-slate-700">Email</Label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="Ex : contact@mon-etablissement.ma" className={baseInputCls} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-slate-700">Catégorie</Label>
        <Select value={category || undefined} onValueChange={(v) => setCategory(v as EstablishmentLeadCategory)}>
          <SelectTrigger className={baseInputCls}>
            <SelectValue placeholder="Choisir" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        disabled={!canSubmit || submitting}
        onClick={() => void submit()}
        className="w-full h-12 rounded-xl bg-primary text-white hover:bg-primary/90 font-extrabold transition-transform hover:scale-[1.01]"
      >
        {submitting ? "Envoi…" : "Envoyer ma demande"}
      </Button>

      <div className="text-[11px] text-slate-500 leading-relaxed">
        En envoyant, vous acceptez d’être contacté(e) par Sortir Au Maroc pour activer votre établissement. Aucun engagement.
      </div>
    </div>
  );
}
