import { useEffect, useMemo, useState } from "react";

import {
  AlertCircle,
  Loader2,
  Pencil,
  Plus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AdminApiError,
  loadAdminSessionToken,
  createAdminMediaQuote,
  getAdminMediaQuote,
  updateAdminMediaQuote,
  addAdminMediaQuoteItem,
  updateAdminMediaQuoteItem,
  deleteAdminMediaQuoteItem,
  createAdminMediaQuotePublicLink,
  sendAdminMediaQuoteEmail,
  markAdminMediaQuoteAccepted,
  markAdminMediaQuoteRejected,
  convertAdminMediaQuoteToInvoice,
  getAdminMediaInvoice,
  createAdminMediaInvoicePublicLink,
  sendAdminMediaInvoiceEmail,
  markAdminMediaInvoicePaid,
  listAdminProProfiles,
  getAdminProProfile,
  updateAdminProProfile,
  type AdminProProfile,
  type AdminProProfileInput,
  type AdminVisibilityOffer,
  type AdminMediaQuote,
  type AdminMediaQuoteItem,
  type AdminMediaInvoice,
} from "@/lib/adminApi";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export function formatLocalYmdHm(iso: string): string {
  const v = String(iso || "");
  return v ? formatLeJjMmAaAHeure(v) : "—";
}

export function formatMoneyAmount(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  const n =
    typeof amount === "number" && Number.isFinite(amount)
      ? amount
      : Number(amount ?? 0);
  const c = String(currency ?? "MAD") || "MAD";

  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: c,
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${c}`;
  }
}

export async function downloadAdminPdf(path: string, filename: string): Promise<void> {
  const sessionToken = loadAdminSessionToken();
  if (!sessionToken)
    throw new Error("Session admin manquante. Merci de vous reconnecter.");

  const res = await fetch(path, {
    method: "GET",
    credentials: "omit",
    headers: {
      "x-admin-session": sessionToken,
    },
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const payload = (await res.json()) as any;
        if (
          payload &&
          typeof payload.error === "string" &&
          payload.error.trim()
        )
          msg = payload.error;
      } catch {
        // ignore
      }
    } else {
      try {
        const text = await res.text();
        if (text && text.trim()) msg = text;
      } catch {
        // ignore
      }
    }

    throw new Error(msg);
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);
  }
}

export function quoteStatusBadge(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "draft")
    return {
      label: "Brouillon",
      cls: "bg-slate-50 text-slate-700 border-slate-200",
    };
  if (s === "sent")
    return {
      label: "Envoyé",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    };
  if (s === "accepted")
    return {
      label: "Accepté",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  if (s === "rejected")
    return { label: "Refusé", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  if (s === "expired")
    return {
      label: "Expiré",
      cls: "bg-slate-100 text-slate-700 border-slate-200",
    };
  if (s === "cancelled")
    return {
      label: "Annulé",
      cls: "bg-slate-100 text-slate-700 border-slate-200",
    };
  return { label: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
}

export function invoiceStatusBadge(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "issued")
    return {
      label: "Émise",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    };
  if (s === "paid")
    return {
      label: "Payée",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  if (s === "partial")
    return {
      label: "Partielle",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    };
  if (s === "overdue")
    return {
      label: "En retard",
      cls: "bg-rose-50 text-rose-700 border-rose-200",
    };
  if (s === "cancelled")
    return {
      label: "Annulée",
      cls: "bg-slate-100 text-slate-700 border-slate-200",
    };
  if (s === "draft")
    return {
      label: "Brouillon",
      cls: "bg-slate-50 text-slate-700 border-slate-200",
    };
  return { label: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
}

export function dateInputToIsoEndOfDay(dateYmd: string): string | null {
  const v = String(dateYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return `${v}T23:59:59.999Z`;
}

// ---------------------------------------------------------------------------
// Edit Pro Profile Dialog
// ---------------------------------------------------------------------------

export type EditProProfileDialogProps = {
  open: boolean;
  profile: AdminProProfile | null;
  onClose: () => void;
  onSaved: (updated: AdminProProfile) => void;
};

export function EditProProfileDialog({
  open,
  profile,
  onClose,
  onSaved,
}: EditProProfileDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Maroc");
  const [ice, setIce] = useState("");
  const [rc, setRc] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !profile) return;
    setCompanyName(profile.company_name ?? "");
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setContactName(profile.contact_name ?? "");
    setEmail(profile.email ?? "");
    setPhone(profile.phone ?? "");
    setAddress(profile.address ?? "");
    setPostalCode(profile.postal_code ?? "");
    setCity(profile.city ?? "");
    setCountry(profile.country ?? "Maroc");
    setIce(profile.ice ?? "");
    setRc(profile.rc ?? "");
    setNotes(profile.notes ?? "");
  }, [open, profile]);

  const handleSave = async () => {
    if (!profile || saving) return;

    setSaving(true);
    try {
      const input: AdminProProfileInput = {
        company_name: companyName.trim() || null,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        contact_name: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        postal_code: postalCode.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        ice: ice.trim() || null,
        rc: rc.trim() || null,
        notes: notes.trim() || null,
      };

      await updateAdminProProfile(undefined, profile.user_id, input);

      // Fetch updated profile
      const { profile: updated } = await getAdminProProfile(undefined, profile.user_id);

      toast({ title: "Profil Pro mis à jour" });
      onSaved(updated);
      onClose();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le profil Pro</DialogTitle>
          <DialogDescription>
            Informations de l'entreprise pour la facturation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Raison sociale / Nom entreprise</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ex: SARL Mon Entreprise"
              />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@entreprise.ma"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Prénom du contact</Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Prénom"
              />
            </div>

            <div className="space-y-2">
              <Label>Nom du contact</Label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Nom"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nom du contact (ancien champ)</Label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Nom complet"
              />
              <p className="text-xs text-slate-500">Utilisé si prénom/nom non renseignés</p>
            </div>

            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+212 6XX XXX XXX"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Adresse</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Adresse complète"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Code postal</Label>
              <Input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="20000"
              />
            </div>

            <div className="space-y-2">
              <Label>Ville</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Casablanca"
              />
            </div>

            <div className="space-y-2">
              <Label>Pays</Label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Maroc"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>ICE</Label>
              <Input
                value={ice}
                onChange={(e) => setIce(e.target.value)}
                placeholder="Identifiant Commun de l'Entreprise"
              />
            </div>

            <div className="space-y-2">
              <Label>RC</Label>
              <Input
                value={rc}
                onChange={(e) => setRc(e.target.value)}
                placeholder="Registre du Commerce"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes internes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes visibles uniquement par l'équipe"
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Pro Info Card (displayed when a Pro is selected)
// ---------------------------------------------------------------------------

function ProInfoCard({
  pro,
  onEdit,
  onClear,
}: {
  pro: AdminProProfile;
  onEdit: () => void;
  onClear: () => void;
}) {
  const displayName =
    pro.company_name ||
    (pro.first_name && pro.last_name
      ? `${pro.first_name} ${pro.last_name}`
      : pro.contact_name) ||
    pro.email ||
    pro.user_id;

  const contactDisplay =
    pro.first_name || pro.last_name
      ? `${pro.first_name ?? ""} ${pro.last_name ?? ""}`.trim()
      : pro.contact_name;

  const hasAddress = pro.address || pro.postal_code || pro.city || pro.country;
  const hasLegalInfo = pro.ice || pro.rc;

  // Check if profile is incomplete (missing key info for invoicing)
  const isIncomplete = !pro.company_name && !pro.ice;

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{displayName}</div>
          {contactDisplay && contactDisplay !== displayName ? (
            <div className="text-sm text-slate-600">Contact: {contactDisplay}</div>
          ) : null}
          {pro.email ? (
            <div className="text-sm text-slate-600">{pro.email}</div>
          ) : null}
          {pro.phone ? (
            <div className="text-sm text-slate-600">{pro.phone}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            title="Modifier les informations"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            Changer
          </Button>
        </div>
      </div>

      {hasAddress ? (
        <div className="text-sm text-slate-600 border-t pt-2">
          <div className="font-medium text-slate-700 mb-1">Adresse</div>
          {pro.address ? <div>{pro.address}</div> : null}
          <div>
            {[pro.postal_code, pro.city, pro.country].filter(Boolean).join(", ")}
          </div>
        </div>
      ) : null}

      {hasLegalInfo ? (
        <div className="text-sm text-slate-600 border-t pt-2">
          <div className="font-medium text-slate-700 mb-1">Infos légales</div>
          {pro.ice ? <div>ICE: {pro.ice}</div> : null}
          {pro.rc ? <div>RC: {pro.rc}</div> : null}
        </div>
      ) : null}

      {isIncomplete ? (
        <div className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 border border-amber-200">
          ⚠️ Profil incomplet — Cliquez sur le crayon pour compléter les informations
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Quote Dialog
// ---------------------------------------------------------------------------

export type CreateQuoteDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (quote: AdminMediaQuote) => void;
};

export function CreateQuoteDialog({
  open,
  onClose,
  onCreated,
}: CreateQuoteDialogProps) {
  const { toast } = useToast();

  // Radix SelectItem value cannot be an empty string. We use a sentinel for "no establishment".
  const NO_ESTABLISHMENT = "__none__";

  const [saving, setSaving] = useState(false);

  const [proQuery, setProQuery] = useState("");
  const [prosLoading, setProsLoading] = useState(false);
  const [proResults, setProResults] = useState<AdminProProfile[]>([]);
  const [selectedPro, setSelectedPro] = useState<AdminProProfile | null>(null);
  const [editProDialogOpen, setEditProDialogOpen] = useState(false);

  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<
    string | null
  >(null);

  const [validUntilYmd, setValidUntilYmd] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank_transfer">(
    "bank_transfer",
  );

  const [notes, setNotes] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryEstimate, setDeliveryEstimate] = useState("");

  useEffect(() => {
    if (!open) return;

    setSaving(false);

    setProQuery("");
    setProsLoading(false);
    setProResults([]);
    setSelectedPro(null);
    setSelectedEstablishmentId(null);

    setValidUntilYmd("");
    setPaymentMethod("bank_transfer");
    setNotes("");
    setPaymentTerms("");
    setDeliveryEstimate("");
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const q = proQuery.trim();

    // Ne pas afficher toute la liste par défaut: on ne recherche que si l'utilisateur tape quelque chose.
    if (!q) {
      setProsLoading(false);
      setProResults([]);
      return;
    }

    const handle = window.setTimeout(() => {
      setProsLoading(true);
      listAdminProProfiles(undefined, { q, limit: 20 })
        .then((res) => setProResults(res.items ?? []))
        .catch((e) => {
          const msg =
            e instanceof AdminApiError
              ? e.message
              : e instanceof Error
                ? e.message
                : "Erreur";
          toast({ title: "Erreur", description: msg, variant: "destructive" });
          setProResults([]);
        })
        .finally(() => setProsLoading(false));
    }, 250);

    return () => window.clearTimeout(handle);
  }, [proQuery, open, toast]);

  const hasProQuery = !!proQuery.trim();
  const showNoResults = hasProQuery && !prosLoading && proResults.length === 0;

  useEffect(() => {
    if (!open) return;

    if (!selectedPro) {
      setSelectedEstablishmentId(null);
      return;
    }

    const type = String(selectedPro.client_type ?? "").toUpperCase();
    const preferred = selectedPro.establishments?.[0]?.id ?? "";

    if (type === "A" && preferred && selectedEstablishmentId == null) {
      setSelectedEstablishmentId(preferred);
    }

    if (type !== "A") {
      setSelectedEstablishmentId(NO_ESTABLISHMENT);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPro?.user_id, open]);

  const proBadgeLabel = (pro: AdminProProfile): string => {
    const t = String(pro.client_type ?? "").toUpperCase();
    if (t === "A") return "Type A (avec établissement)";
    if (t === "B") return "Type B (sans établissement)";
    return t || "Pro";
  };

  const createQuote = async () => {
    if (!selectedPro || saving) return;

    setSaving(true);
    try {
      const validUntil = validUntilYmd
        ? dateInputToIsoEndOfDay(validUntilYmd)
        : null;

      const establishmentId =
        selectedEstablishmentId && selectedEstablishmentId !== NO_ESTABLISHMENT
          ? selectedEstablishmentId.trim()
          : null;

      const res = await createAdminMediaQuote(undefined, {
        pro_user_id: selectedPro.user_id,
        establishment_id: establishmentId,
        valid_until: validUntil,
        payment_method: paymentMethod,
        notes: notes.trim() || null,
        payment_terms: paymentTerms.trim() || null,
        delivery_estimate: deliveryEstimate.trim() || null,
      });

      toast({ title: "Devis créé", description: res.quote.quote_number });
      onCreated(res.quote);
      onClose();
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const canSave = !saving && !!selectedPro;

  const selectedEstablishmentOptions = selectedPro?.establishments ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Créer un devis</DialogTitle>
          <DialogDescription>
            Le client est toujours un Pro (Type A ou B). Les établissements sont
            optionnels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Client (Pro)</Label>
              {selectedPro ? (
                <div className="space-y-2">
                  <ProInfoCard
                    pro={selectedPro}
                    onEdit={() => setEditProDialogOpen(true)}
                    onClear={() => {
                      setSelectedPro(null);
                      setProQuery("");
                      setProResults([]);
                      setSelectedEstablishmentId(null);
                    }}
                  />

                  <div className="space-y-2">
                    <Label>Établissement (optionnel)</Label>
                    <Select
                      value={selectedEstablishmentId ?? undefined}
                      onValueChange={setSelectedEstablishmentId}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            selectedEstablishmentOptions.length
                              ? "Choisir…"
                              : "Aucun établissement"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value={NO_ESTABLISHMENT}>
                          Ignorer pour l'instant
                        </SelectItem>
                        {selectedEstablishmentOptions.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name ?? e.id}
                            {e.city ? ` (${e.city})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!selectedEstablishmentOptions.length ? (
                      <div className="text-xs text-slate-500">
                        Ce Pro n'a aucun établissement (Type B ou Type A sans
                        établissement).
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={proQuery}
                    onChange={(e) => setProQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        if (proResults.length) setSelectedPro(proResults[0]);
                      }
                    }}
                    placeholder="Rechercher (nom, email, ville, ID…)"
                  />

                  {prosLoading ? (
                    <div className="text-sm text-slate-600 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Recherche…
                    </div>
                  ) : null}

                  {!hasProQuery ? (
                    <div className="text-xs text-slate-500">
                      Commencez à taper pour afficher des résultats.
                    </div>
                  ) : null}

                  {showNoResults ? (
                    <div className="text-xs text-slate-500">
                      Aucun Pro ne correspond à cette recherche.
                    </div>
                  ) : null}

                  {!prosLoading && proResults.length ? (
                    <div className="max-h-56 overflow-y-auto rounded-md border">
                      {proResults.map((p) => (
                        <div
                          key={p.user_id}
                          role="button"
                          tabIndex={0}
                          className="w-full cursor-pointer select-none text-start px-3 py-2 hover:bg-slate-50 border-b last:border-b-0 focus:outline-none focus:bg-slate-50"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedPro(p);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedPro(p);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold truncate">
                                {p.company_name ||
                                  p.contact_name ||
                                  p.email ||
                                  p.user_id}
                              </div>
                              <div className="text-xs text-slate-600 mt-1 truncate">
                                {proBadgeLabel(p)}
                                {p.city ? ` · ${p.city}` : ""}
                                {p.email ? ` · ${p.email}` : ""}
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {String(p.client_type ?? "").toUpperCase() ||
                                "Pro"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="text-xs text-slate-500">
                    Besoin d'ajouter un nouveau client ? Créez un nouveau Pro
                    via le flux Pro (pas de client séparé).
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Validité (optionnel)</Label>
                <Input
                  type="date"
                  value={validUntilYmd}
                  onChange={(e) => setValidUntilYmd(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Mode de paiement</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">Carte bancaire (lien)</SelectItem>
                    <SelectItem value="bank_transfer">
                      Virement bancaire
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Conditions de paiement</Label>
              <Textarea
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="ex: \u201c50% à la commande…\u201d"
              />
            </div>
            <div className="space-y-2">
              <Label>Délai de livraison</Label>
              <Textarea
                value={deliveryEstimate}
                onChange={(e) => setDeliveryEstimate(e.target.value)}
                placeholder="ex: 7 jours ouvrés"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={() => void createQuote()}
              disabled={!canSave}
              className="gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Créer le devis
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Dialog pour éditer le profil Pro */}
      <EditProProfileDialog
        open={editProDialogOpen}
        profile={selectedPro}
        onClose={() => setEditProDialogOpen(false)}
        onSaved={(updated) => setSelectedPro(updated)}
      />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Quote Dialog
// ---------------------------------------------------------------------------

export type QuoteDialogProps = {
  open: boolean;
  quoteId: string;
  offers: AdminVisibilityOffer[];
  onClose: () => void;
  onQuoteUpdated: (quote: AdminMediaQuote) => void;
  onInvoiceCreated: (invoice: AdminMediaInvoice) => void;
};

export function QuoteDialog({
  open,
  quoteId,
  offers,
  onClose,
  onQuoteUpdated,
  onInvoiceCreated,
}: QuoteDialogProps) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<AdminMediaQuote | null>(null);

  const [offerToAddId, setOfferToAddId] = useState<string>("");
  const [offerQty, setOfferQty] = useState("1");

  const [publicLink, setPublicLink] = useState<string | null>(null);

  const [emailTo, setEmailTo] = useState("");
  const [emailLang, setEmailLang] = useState<"fr" | "en">("fr");

  const [editValidUntilYmd, setEditValidUntilYmd] = useState<string>("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<
    "card" | "bank_transfer"
  >("bank_transfer");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editPaymentTerms, setEditPaymentTerms] = useState<string>("");
  const [editDeliveryEstimate, setEditDeliveryEstimate] = useState<string>("");

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminMediaQuote(undefined, quoteId);
      setQuote(res.quote);
      onQuoteUpdated(res.quote);

      const toEmail = (res.quote as any).pro_profiles?.email ?? "";
      setEmailTo(typeof toEmail === "string" ? toEmail : "");

      const validUntil = res.quote.valid_until
        ? String(res.quote.valid_until).slice(0, 10)
        : "";
      setEditValidUntilYmd(validUntil);

      const pm = String((res.quote as any).payment_method ?? "")
        .trim()
        .toLowerCase();
      setEditPaymentMethod(pm === "card" ? "card" : "bank_transfer");

      setEditNotes(res.quote.notes ?? "");
      setEditPaymentTerms(res.quote.payment_terms ?? "");
      setEditDeliveryEstimate(res.quote.delivery_estimate ?? "");
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      setError(msg);
      setQuote(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPublicLink(null);
    setOfferToAddId("");
    setOfferQty("1");
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quoteId]);

  const isDraft = String(quote?.status ?? "").toLowerCase() === "draft";

  const allowedOffers = useMemo(() => {
    return offers
      .filter((o) => o.deleted_at == null)
      .filter((o) => o.active)
      .filter((o) => o.is_quotable !== false)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  }, [offers]);

  const addItem = async () => {
    if (!quote) return;
    if (!offerToAddId) return;

    const qty = Math.max(1, Math.floor(Number(offerQty || "1")));

    try {
      const res = await addAdminMediaQuoteItem(undefined, quote.id, {
        catalog_item_id: offerToAddId,
        quantity: qty,
      });
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
      toast({ title: "Ligne ajoutée" });
      setOfferQty("1");
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const updateQty = async (item: AdminMediaQuoteItem, nextQty: number) => {
    if (!quote) return;
    try {
      const res = await updateAdminMediaQuoteItem(
        undefined,
        quote.id,
        item.id,
        { quantity: nextQty },
      );
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const deleteItem = async (item: AdminMediaQuoteItem) => {
    if (!quote) return;
    const ok = window.confirm(`Supprimer la ligne "${item.name_snapshot}" ?`);
    if (!ok) return;

    try {
      const res = await deleteAdminMediaQuoteItem(undefined, quote.id, item.id);
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
      toast({ title: "Ligne supprimée" });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const saveMeta = async () => {
    if (!quote) return;

    try {
      const validUntil = editValidUntilYmd
        ? dateInputToIsoEndOfDay(editValidUntilYmd)
        : null;
      const res = await updateAdminMediaQuote(undefined, quote.id, {
        valid_until: validUntil,
        payment_method: editPaymentMethod,
        notes: editNotes.trim() || null,
        payment_terms: editPaymentTerms.trim() || null,
        delivery_estimate: editDeliveryEstimate.trim() || null,
      });
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
      toast({ title: "Devis mis à jour" });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const generateLink = async () => {
    if (!quote) return;

    try {
      const res = await createAdminMediaQuotePublicLink(undefined, quote.id);
      setPublicLink(res.public_link);
      await navigator.clipboard.writeText(res.public_link).catch(() => null);
      toast({
        title: "Lien public créé",
        description: "Lien copié dans le presse-papier (si autorisé).",
      });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const sendEmail = async () => {
    if (!quote) return;

    try {
      const res = await sendAdminMediaQuoteEmail(undefined, quote.id, {
        lang: emailLang,
        to_email: emailTo.trim() || undefined,
      });
      setPublicLink(res.public_link);
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
      toast({
        title: "Email envoyé",
        description: `email_id: ${res.email_id}`,
      });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const markAccepted = async () => {
    if (!quote) return;
    try {
      const res = await markAdminMediaQuoteAccepted(undefined, quote.id);
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
      toast({ title: "Devis accepté" });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const markRejected = async () => {
    if (!quote) return;
    try {
      const res = await markAdminMediaQuoteRejected(undefined, quote.id);
      setQuote(res.quote);
      onQuoteUpdated(res.quote);
      toast({ title: "Devis refusé" });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const convertToInvoice = async () => {
    if (!quote) return;
    try {
      const res = await convertAdminMediaQuoteToInvoice(undefined, quote.id, {
        payment_method: editPaymentMethod,
      });
      toast({
        title: "Facture créée",
        description: res.invoice.invoice_number,
      });
      onInvoiceCreated(res.invoice);
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const clientLabel = (() => {
    if (!quote) return "";
    return (
      quote.pro_profiles?.company_name ||
      quote.pro_profiles?.contact_name ||
      quote.establishments?.name ||
      (quote.pro_user_id
        ? `Pro ${String(quote.pro_user_id).slice(0, 8)}`
        : "Pro")
    );
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <div className="min-w-0 truncate">
              Devis {quote?.quote_number ?? ""}
            </div>
            <div className="flex items-center gap-2">
              {quote ? (
                <Badge variant="outline">
                  {String(quote.status ?? "").toUpperCase()}
                </Badge>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refresh()}
                disabled={loading}
              >
                Rafraîchir
              </Button>
            </div>
          </DialogTitle>
          <DialogDescription>
            {clientLabel ? (
              <span className="font-semibold">{clientLabel}</span>
            ) : null}
            {quote?.issued_at ? (
              <span className="ms-2">
                · {formatLocalYmdHm(quote.issued_at)}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>{error}</div>
            </CardContent>
          </Card>
        ) : null}

        {loading || !quote ? (
          <div className="text-sm text-slate-600 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Validité</Label>
                <Input
                  type="date"
                  value={editValidUntilYmd}
                  onChange={(e) => setEditValidUntilYmd(e.target.value)}
                  disabled={!isDraft}
                />
              </div>
              <div className="space-y-2">
                <Label>Monnaie</Label>
                <Input value={quote.currency} disabled />
              </div>

              <div className="space-y-2">
                <Label>Mode de paiement</Label>
                <Select
                  value={editPaymentMethod}
                  onValueChange={(v) => setEditPaymentMethod(v as any)}
                  disabled={!isDraft}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">Carte bancaire (lien)</SelectItem>
                    <SelectItem value="bank_transfer">
                      Virement bancaire
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Conditions de paiement</Label>
                <Textarea
                  value={editPaymentTerms}
                  onChange={(e) => setEditPaymentTerms(e.target.value)}
                  disabled={!isDraft}
                />
              </div>
              <div className="space-y-2">
                <Label>Délai de livraison</Label>
                <Textarea
                  value={editDeliveryEstimate}
                  onChange={(e) => setEditDeliveryEstimate(e.target.value)}
                  disabled={!isDraft}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  disabled={!isDraft}
                />
              </div>
              <div className="md:col-span-2 flex items-center justify-end">
                <Button
                  variant="outline"
                  onClick={() => void saveMeta()}
                  disabled={!isDraft}
                >
                  Enregistrer
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">Lignes</div>
                  <div className="text-sm text-slate-500">
                    {(quote.items ?? []).length} ligne(s)
                  </div>
                </div>

                {(quote.items ?? []).length ? (
                  <div className="space-y-2">
                    {(quote.items ?? []).map((it) => (
                      <div
                        key={it.id}
                        className="flex items-start justify-between gap-3 rounded-md border p-3"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {it.name_snapshot}
                          </div>
                          {it.description_snapshot ? (
                            <div className="text-xs text-slate-600 mt-1">
                              {it.description_snapshot}
                            </div>
                          ) : null}
                          <div className="text-xs text-slate-500 mt-2">
                            {formatMoneyAmount(
                              it.unit_price_snapshot,
                              quote.currency,
                            )}{" "}
                            × {it.quantity} · TVA {it.tax_rate_snapshot}%
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="font-semibold tabular-nums">
                            {formatMoneyAmount(it.line_total, quote.currency)}
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              className="w-20"
                              value={String(it.quantity)}
                              disabled={!isDraft}
                              onChange={(e) => {
                                const next = Math.max(
                                  1,
                                  Math.floor(Number(e.target.value || "1")),
                                );
                                void updateQty(it, next);
                              }}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-700"
                              onClick={() => void deleteItem(it)}
                              disabled={!isDraft}
                            >
                              Suppr.
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Aucune ligne.</div>
                )}

                <div className="border-t pt-3 mt-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Ajouter depuis le catalogue</Label>
                      <Select
                        value={offerToAddId}
                        onValueChange={setOfferToAddId}
                        disabled={!isDraft}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir une offre…" />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedOffers.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Quantité</Label>
                      <Input
                        value={offerQty}
                        onChange={(e) => setOfferQty(e.target.value)}
                        disabled={!isDraft}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end mt-3">
                    <Button
                      onClick={() => void addItem()}
                      disabled={!isDraft || !offerToAddId}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Ajouter
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 mt-3 border-t">
                  <div className="text-sm text-slate-600">
                    Sous-total:{" "}
                    <span className="font-semibold">
                      {formatMoneyAmount(quote.subtotal_amount, quote.currency)}
                    </span>{" "}
                    · TVA:{" "}
                    <span className="font-semibold">
                      {formatMoneyAmount(quote.tax_amount, quote.currency)}
                    </span>
                  </div>
                  <div className="text-lg font-extrabold tabular-nums">
                    {formatMoneyAmount(quote.total_amount, quote.currency)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="font-semibold">Actions</div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Lien public</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={publicLink ?? ""}
                        readOnly
                        placeholder="(générer un lien)"
                      />
                      <Button
                        variant="outline"
                        onClick={() => void generateLink()}
                      >
                        Générer
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          quote
                            ? void downloadAdminPdf(
                                `/api/admin/media/quotes/${encodeURIComponent(quote.id)}/pdf`,
                                `devis-${quote.quote_number || quote.id}.pdf`,
                              ).catch((e) =>
                                toast({
                                  title: "Erreur",
                                  description:
                                    e instanceof Error
                                      ? e.message
                                      : "Impossible de télécharger le PDF",
                                  variant: "destructive",
                                }),
                              )
                            : null
                        }
                      >
                        PDF
                      </Button>
                    </div>
                    <div className="text-xs text-slate-500">
                      Ce lien permettra au client de consulter/valider le devis.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Email</Label>
                    <div className="grid gap-2 md:grid-cols-3">
                      <Select
                        value={emailLang}
                        onValueChange={(v) =>
                          setEmailLang(v === "en" ? "en" : "fr")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fr">FR</SelectItem>
                          <SelectItem value="en">EN</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="md:col-span-2"
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                        placeholder="email@client.com"
                      />
                    </div>
                    <div className="flex items-center justify-end">
                      <Button
                        onClick={() => void sendEmail()}
                        disabled={!emailTo.trim()}
                      >
                        Envoyer le devis
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void markAccepted()}
                    >
                      Marquer accepté
                    </Button>
                    <Button
                      variant="outline"
                      className="text-red-700"
                      onClick={() => void markRejected()}
                    >
                      Marquer refusé
                    </Button>
                  </div>

                  <div className="flex items-center justify-end">
                    <Button
                      onClick={() => void convertToInvoice()}
                      disabled={
                        String(quote.status ?? "").toLowerCase() !== "accepted"
                      }
                    >
                      Convertir en facture
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Invoice Dialog
// ---------------------------------------------------------------------------

export type InvoiceDialogProps = {
  open: boolean;
  invoiceId: string;
  onClose: () => void;
  onInvoiceUpdated: (invoice: AdminMediaInvoice) => void;
};

export function InvoiceDialog({
  open,
  invoiceId,
  onClose,
  onInvoiceUpdated,
}: InvoiceDialogProps) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<AdminMediaInvoice | null>(null);

  const [publicLink, setPublicLink] = useState<string | null>(null);

  const [emailTo, setEmailTo] = useState("");
  const [emailLang, setEmailLang] = useState<"fr" | "en">("fr");

  const [paidAmount, setPaidAmount] = useState("");
  const [paidMethod, setPaidMethod] = useState<
    "card" | "bank_transfer" | "cash" | "other"
  >("bank_transfer");
  const [paidRef, setPaidRef] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getAdminMediaInvoice(undefined, invoiceId);
      setInvoice(res.invoice);
      onInvoiceUpdated(res.invoice);
      const toEmail = (res.invoice as any).pro_profiles?.email ?? "";
      setEmailTo(typeof toEmail === "string" ? toEmail : "");
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      setError(msg);
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPublicLink(null);
    setPaidAmount("");
    setPaidRef("");
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  const generateLink = async () => {
    if (!invoice) return;

    try {
      const res = await createAdminMediaInvoicePublicLink(
        undefined,
        invoice.id,
      );
      setPublicLink(res.public_link);
      await navigator.clipboard.writeText(res.public_link).catch(() => null);
      toast({
        title: "Lien public créé",
        description: "Lien copié dans le presse-papier (si autorisé).",
      });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const sendEmail = async () => {
    if (!invoice) return;

    try {
      const res = await sendAdminMediaInvoiceEmail(undefined, invoice.id, {
        lang: emailLang,
        to_email: emailTo.trim() || undefined,
      });
      toast({
        title: "Email envoyé",
        description: `email_id: ${res.email_id}`,
      });
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const markPaid = async () => {
    if (!invoice) return;

    const amount = Number(paidAmount || "0");
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "Erreur",
        description: "Montant invalide",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await markAdminMediaInvoicePaid(undefined, invoice.id, {
        amount,
        method: paidMethod,
        reference: paidRef.trim() || undefined,
      });
      setInvoice(res.invoice);
      onInvoiceUpdated(res.invoice);
      toast({ title: "Paiement enregistré" });
      setPaidAmount("");
      setPaidRef("");
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const clientLabel = (() => {
    if (!invoice) return "";
    return (
      invoice.pro_profiles?.company_name ||
      invoice.pro_profiles?.contact_name ||
      invoice.establishments?.name ||
      (invoice.pro_user_id
        ? `Pro ${String(invoice.pro_user_id).slice(0, 8)}`
        : "Pro")
    );
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Facture {invoice?.invoice_number ?? ""}</DialogTitle>
          <DialogDescription>
            {clientLabel ? (
              <span className="font-semibold">{clientLabel}</span>
            ) : null}
            {invoice?.issued_at ? (
              <span className="ms-2">
                · {formatLocalYmdHm(invoice.issued_at)}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>{error}</div>
            </CardContent>
          </Card>
        ) : null}

        {loading || !invoice ? (
          <div className="text-sm text-slate-600 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {String(invoice.status ?? "").toUpperCase()}
              </Badge>
              <div className="text-sm text-slate-600">
                Total:{" "}
                <span className="font-semibold">
                  {formatMoneyAmount(invoice.total_amount, invoice.currency)}
                </span>{" "}
                · Payé:{" "}
                <span className="font-semibold">
                  {formatMoneyAmount(invoice.paid_amount, invoice.currency)}
                </span>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="font-semibold">Lignes</div>
                {(invoice.items ?? []).length ? (
                  <div className="space-y-2">
                    {(invoice.items ?? []).map((it) => (
                      <div
                        key={it.id}
                        className="flex items-start justify-between gap-3 rounded-md border p-3"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {it.name_snapshot}
                          </div>
                          {it.description_snapshot ? (
                            <div className="text-xs text-slate-600 mt-1">
                              {it.description_snapshot}
                            </div>
                          ) : null}
                          <div className="text-xs text-slate-500 mt-2">
                            {formatMoneyAmount(
                              it.unit_price_snapshot,
                              invoice.currency,
                            )}{" "}
                            × {it.quantity} · TVA {it.tax_rate_snapshot}%
                          </div>
                        </div>
                        <div className="font-semibold tabular-nums">
                          {formatMoneyAmount(it.line_total, invoice.currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Aucune ligne.</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="font-semibold">Actions</div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Lien public</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={publicLink ?? ""}
                        readOnly
                        placeholder="(générer un lien)"
                      />
                      <Button
                        variant="outline"
                        onClick={() => void generateLink()}
                      >
                        Générer
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          invoice
                            ? void downloadAdminPdf(
                                `/api/admin/media/invoices/${encodeURIComponent(invoice.id)}/pdf`,
                                `facture-${invoice.invoice_number || invoice.id}.pdf`,
                              ).catch((e) =>
                                toast({
                                  title: "Erreur",
                                  description:
                                    e instanceof Error
                                      ? e.message
                                      : "Impossible de télécharger le PDF",
                                  variant: "destructive",
                                }),
                              )
                            : null
                        }
                      >
                        PDF
                      </Button>
                    </div>
                    <div className="text-xs text-slate-500">
                      Ce lien permettra au client de consulter la facture et
                      payer en ligne.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Email</Label>
                    <div className="grid gap-2 md:grid-cols-3">
                      <Select
                        value={emailLang}
                        onValueChange={(v) =>
                          setEmailLang(v === "en" ? "en" : "fr")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fr">FR</SelectItem>
                          <SelectItem value="en">EN</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="md:col-span-2"
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                        placeholder="email@client.com"
                      />
                    </div>
                    <div className="flex items-center justify-end">
                      <Button
                        onClick={() => void sendEmail()}
                        disabled={!emailTo.trim()}
                      >
                        Envoyer la facture
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Enregistrer un paiement</Label>
                    <div className="grid gap-2 md:grid-cols-3">
                      <Input
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        placeholder="Montant"
                      />
                      <Select
                        value={paidMethod}
                        onValueChange={(v) =>
                          setPaidMethod((v as any) ?? "other")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bank_transfer">
                            Virement bancaire
                          </SelectItem>
                          <SelectItem value="card">Carte</SelectItem>
                          <SelectItem value="cash">Espèces</SelectItem>
                          <SelectItem value="other">Autre</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={paidRef}
                        onChange={(e) => setPaidRef(e.target.value)}
                        placeholder="Référence"
                      />
                    </div>
                    <div className="flex items-center justify-end">
                      <Button
                        onClick={() => void markPaid()}
                        disabled={!paidAmount.trim()}
                      >
                        Marquer payé
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
