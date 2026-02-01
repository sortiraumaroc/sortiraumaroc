import { useEffect, useMemo, useState } from "react";
import type { HTMLAttributes } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  AdminApiError,
  updateAdminBillingCompanyProfile,
  type AdminBillingCompanyProfilePatch,
  type BillingCompanyProfile,
} from "@/lib/adminApi";

import type { SettingsReportPatch, ToastInput } from "../../AdminSettingsPage";
import { safeNumber } from "../utils";

type Draft = {
  legal_name: string;
  trade_name: string;
  legal_form: string;
  ice: string;
  rc_number: string;
  rc_court: string;
  address_line1: string;
  address_line2: string;
  city: string;
  country: string;
  capital_mad: string;
  default_currency: string;

  bank_account_holder: string;
  bank_name: string;
  rib: string;
  iban: string;
  swift: string;
  bank_instructions: string;
};

function toDraft(p: BillingCompanyProfile): Draft {
  return {
    legal_name: p.legal_name ?? "",
    trade_name: p.trade_name ?? "",
    legal_form: p.legal_form ?? "",
    ice: p.ice ?? "",
    rc_number: p.rc_number ?? "",
    rc_court: p.rc_court ?? "",
    address_line1: p.address_line1 ?? "",
    address_line2: p.address_line2 ?? "",
    city: p.city ?? "",
    country: p.country ?? "",
    capital_mad: String(p.capital_mad ?? 0),
    default_currency: p.default_currency ?? "MAD",

    bank_account_holder: p.bank_account_holder ?? "",
    bank_name: p.bank_name ?? "",
    rib: p.rib ?? "",
    iban: p.iban ?? "",
    swift: p.swift ?? "",
    bank_instructions: p.bank_instructions ?? "",
  };
}

function normalizeRequired(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

function normalizeOptional(v: string): string | null {
  const s = normalizeRequired(v);
  return s ? s : null;
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const { label, value, onChange, placeholder, inputMode } = props;
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    </div>
  );
}

function TextAreaField(props: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const { label, value, onChange, placeholder, rows } = props;
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows ?? 4}
      />
    </div>
  );
}

export function BillingCompanyProfileSettingsCard(props: {
  profile: BillingCompanyProfile | null;
  onProfileChange: (next: BillingCompanyProfile | null) => void;
  onReport: (patch: SettingsReportPatch) => void;
  onToast: (toast: ToastInput) => void;
}) {
  const { profile, onProfileChange, onReport, onToast } = props;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) setDraft(toDraft(profile));
  }, [profile]);

  const computed = useMemo(() => {
    if (!profile || !draft) return null;

    const capital = safeNumber(draft.capital_mad);

    const patch: AdminBillingCompanyProfilePatch = {};

    const requiredPairs: Array<
      [keyof AdminBillingCompanyProfilePatch, string, string]
    > = [
      ["legal_name", profile.legal_name, draft.legal_name],
      ["trade_name", profile.trade_name, draft.trade_name],
      ["legal_form", profile.legal_form, draft.legal_form],
      ["ice", profile.ice, draft.ice],
      ["rc_number", profile.rc_number, draft.rc_number],
      ["rc_court", profile.rc_court, draft.rc_court],
      ["address_line1", profile.address_line1, draft.address_line1],
      ["city", profile.city, draft.city],
      ["country", profile.country, draft.country],
      ["default_currency", profile.default_currency, draft.default_currency],
    ];

    for (const [key, prev, next] of requiredPairs) {
      const prevN = normalizeRequired(prev ?? "");
      const nextN = normalizeRequired(next);
      if (prevN !== nextN) (patch as any)[key] = nextN;
    }

    const optionalPairs: Array<
      [keyof AdminBillingCompanyProfilePatch, string | null, string]
    > = [
      ["address_line2", profile.address_line2, draft.address_line2],
      [
        "bank_account_holder",
        profile.bank_account_holder,
        draft.bank_account_holder,
      ],
      ["bank_name", profile.bank_name, draft.bank_name],
      ["rib", profile.rib, draft.rib],
      ["iban", profile.iban, draft.iban],
      ["swift", profile.swift, draft.swift],
      ["bank_instructions", profile.bank_instructions, draft.bank_instructions],
    ];

    for (const [key, prev, next] of optionalPairs) {
      const prevN = prev ? normalizeRequired(prev) : null;
      const nextN = normalizeOptional(next);
      if (prevN !== nextN) (patch as any)[key] = nextN;
    }

    if (capital != null) {
      const cap = Math.max(0, Math.round(capital));
      if (cap !== (profile.capital_mad ?? 0)) patch.capital_mad = cap;
    }

    const same = Object.keys(patch).length === 0;
    return { patch, same, capital };
  }, [draft, profile]);

  const save = async () => {
    if (!profile || !draft || !computed) return;

    if (computed.same) {
      onToast({ title: "⚠️ Rien à faire", description: "Aucun changement." });
      onReport({ noop: 1 });
      return;
    }

    const requiredToValidate: Array<[string, string]> = [
      ["Raison sociale", draft.legal_name],
      ["Nom commercial", draft.trade_name],
      ["Forme juridique", draft.legal_form],
      ["ICE", draft.ice],
      ["RC", draft.rc_number],
      ["Tribunal", draft.rc_court],
      ["Adresse", draft.address_line1],
      ["Ville", draft.city],
      ["Pays", draft.country],
      ["Devise", draft.default_currency],
    ];

    for (const [label, value] of requiredToValidate) {
      if (!normalizeRequired(value)) {
        onToast({
          title: "❌ Champ requis",
          description: `${label} est requis.`,
          variant: "destructive",
        });
        return;
      }
    }

    if (computed.capital == null) {
      onToast({
        title: "❌ Capital invalide",
        description: "Veuillez saisir un nombre.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await updateAdminBillingCompanyProfile(
        undefined,
        computed.patch,
      );
      onProfileChange(res.profile);
      onToast({
        title: "✔️ Profil mis à jour",
        description: "Informations de facturation sauvegardées.",
      });
      onReport({ modified: 1 });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "❌ Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!profile || !draft) {
    return (
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Facturation — Société</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          Profil indisponible (billing_company_profile). Vérifiez les migrations
          et la base de données.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">
            Facturation — Société & virement
          </CardTitle>
          <InfoTooltip
            content={
              <div className="space-y-1">
                <div>
                  Informations affichées sur les devis/factures (PDF) et sur les
                  pages publiques.
                </div>
                <div className="text-slate-500">
                  Table : billing_company_profile (singleton)
                </div>
              </div>
            }
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="text-sm font-semibold">Identité</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField
              label="Raison sociale"
              value={draft.legal_name}
              onChange={(v) =>
                setDraft((d) => (d ? { ...d, legal_name: v } : d))
              }
              placeholder="ex: Sortir Au Maroc SARL"
            />
            <TextField
              label="Nom commercial"
              value={draft.trade_name}
              onChange={(v) =>
                setDraft((d) => (d ? { ...d, trade_name: v } : d))
              }
              placeholder="ex: Sortir Au Maroc"
            />
            <TextField
              label="Forme juridique"
              value={draft.legal_form}
              onChange={(v) =>
                setDraft((d) => (d ? { ...d, legal_form: v } : d))
              }
              placeholder="ex: SARL"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Identifiants légaux</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField
              label="ICE"
              value={draft.ice}
              onChange={(v) => setDraft((d) => (d ? { ...d, ice: v } : d))}
              placeholder="ex: 001234567890123"
            />
            <TextField
              label="RC"
              value={draft.rc_number}
              onChange={(v) =>
                setDraft((d) => (d ? { ...d, rc_number: v } : d))
              }
              placeholder="ex: 123456"
            />
            <TextField
              label="Tribunal"
              value={draft.rc_court}
              onChange={(v) => setDraft((d) => (d ? { ...d, rc_court: v } : d))}
              placeholder="ex: Tribunal de commerce de Casablanca"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Adresse</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <TextField
                label="Adresse (ligne 1)"
                value={draft.address_line1}
                onChange={(v) =>
                  setDraft((d) => (d ? { ...d, address_line1: v } : d))
                }
                placeholder="Rue, numéro…"
              />
            </div>
            <div className="md:col-span-2">
              <TextField
                label="Adresse (ligne 2)"
                value={draft.address_line2}
                onChange={(v) =>
                  setDraft((d) => (d ? { ...d, address_line2: v } : d))
                }
                placeholder="Complément (optionnel)"
              />
            </div>
            <TextField
              label="Ville"
              value={draft.city}
              onChange={(v) => setDraft((d) => (d ? { ...d, city: v } : d))}
              placeholder="ex: Casablanca"
            />
            <TextField
              label="Pays"
              value={draft.country}
              onChange={(v) => setDraft((d) => (d ? { ...d, country: v } : d))}
              placeholder="ex: Maroc"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Facturation</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField
              label="Capital (MAD)"
              value={draft.capital_mad}
              onChange={(v) =>
                setDraft((d) => (d ? { ...d, capital_mad: v } : d))
              }
              placeholder="0"
              inputMode="decimal"
            />
            <TextField
              label="Devise par défaut"
              value={draft.default_currency}
              onChange={(v) =>
                setDraft((d) => (d ? { ...d, default_currency: v } : d))
              }
              placeholder="MAD"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">
            Virement (coordonnées bancaires)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField
              label="Titulaire du compte"
              value={draft.bank_account_holder}
              onChange={(v) =>
                setDraft((d) => (d ? { ...d, bank_account_holder: v } : d))
              }
              placeholder="Nom / Société"
            />
            <TextField
              label="Banque"
              value={draft.bank_name}
              onChange={(v) =>
                setDraft((d) => (d ? { ...d, bank_name: v } : d))
              }
              placeholder="ex: Attijariwafa Bank"
            />
            <TextField
              label="RIB"
              value={draft.rib}
              onChange={(v) => setDraft((d) => (d ? { ...d, rib: v } : d))}
              placeholder="24 chiffres (optionnel)"
              inputMode="numeric"
            />
            <TextField
              label="IBAN"
              value={draft.iban}
              onChange={(v) => setDraft((d) => (d ? { ...d, iban: v } : d))}
              placeholder="Optionnel"
            />
            <TextField
              label="SWIFT"
              value={draft.swift}
              onChange={(v) => setDraft((d) => (d ? { ...d, swift: v } : d))}
              placeholder="Optionnel"
            />
            <div className="md:col-span-2">
              <TextAreaField
                label="Instructions de virement"
                value={draft.bank_instructions}
                onChange={(v) =>
                  setDraft((d) => (d ? { ...d, bank_instructions: v } : d))
                }
                placeholder="ex: Merci d’indiquer le numéro de facture en référence."
                rows={4}
              />
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Ces champs s’affichent uniquement si le mode de paiement est{" "}
            <span className="font-medium">Virement</span>.
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={saving} className="w-full">
              {saving ? "Enregistrement…" : "Enregistrer (confirmation)"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer la mise à jour</AlertDialogTitle>
              <AlertDialogDescription>
                Ces informations seront utilisées sur les devis/factures et pour
                le paiement par virement.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-semibold">Aperçu</div>
              <div className="mt-2 space-y-1">
                <div>
                  <span className="text-slate-500">Société :</span>{" "}
                  {normalizeRequired(draft.trade_name)}
                </div>
                <div>
                  <span className="text-slate-500">Adresse :</span>{" "}
                  {normalizeRequired(draft.address_line1)}
                  {normalizeOptional(draft.address_line2)
                    ? `, ${normalizeRequired(draft.address_line2)}`
                    : ""}
                </div>
                <div>
                  <span className="text-slate-500">Ville :</span>{" "}
                  {normalizeRequired(draft.city)} (
                  {normalizeRequired(draft.country)})
                </div>
                <div>
                  <span className="text-slate-500">Devise :</span>{" "}
                  {normalizeRequired(draft.default_currency)}
                </div>
                {normalizeOptional(draft.rib) ||
                normalizeOptional(draft.iban) ? (
                  <div>
                    <span className="text-slate-500">Virement :</span>{" "}
                    {normalizeOptional(draft.bank_name)
                      ? normalizeRequired(draft.bank_name)
                      : "Banque"}
                  </div>
                ) : null}
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
              <AlertDialogAction disabled={saving} onClick={() => void save()}>
                Confirmer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {computed?.same ? (
          <div className="text-xs text-slate-500">
            Aucun changement en attente.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
