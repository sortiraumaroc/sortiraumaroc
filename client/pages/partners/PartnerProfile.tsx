import { useState, useCallback, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import {
  User,
  MapPin,
  Phone,
  Mail,
  Building2,
  CreditCard,
  Save,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  FileText,
  Upload,
  X,
  Hash,
} from "lucide-react";

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
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { PartnerProfile as PartnerProfileType } from "@/components/partner/PartnerLayout";
import { PartnerAvatarEditor } from "@/components/partner/PartnerAvatarEditor";

// Types de documents requis
type DocumentType = "cin_recto" | "cin_verso" | "rib_doc" | "model_j" | "attestation_fiscale";

interface UploadedDocument {
  type: DocumentType;
  name: string;
  url: string;
  uploadedAt: string;
  expiresAt?: string;
}

interface DocumentConfig {
  label: string;
  maxAgeMonths: number | null;
  description?: string;
}

// Configuration complète des documents
const ALL_DOCUMENT_TYPES: Record<DocumentType, DocumentConfig> = {
  cin_recto: { label: "CIN (Recto)", maxAgeMonths: null, description: "Carte d'identité nationale - face avant" },
  cin_verso: { label: "CIN (Verso)", maxAgeMonths: null, description: "Carte d'identité nationale - face arrière" },
  rib_doc: { label: "RIB bancaire", maxAgeMonths: null, description: "Relevé d'identité bancaire" },
  model_j: { label: "Modèle J", maxAgeMonths: 3, description: "Datant de moins de 3 mois" },
  attestation_fiscale: { label: "Attestation de régularité fiscale", maxAgeMonths: 6, description: "Datant de moins de 6 mois" },
};

// Documents requis par statut juridique
const REQUIRED_DOCUMENTS_BY_STATUS: Record<string, DocumentType[]> = {
  freelance: ["cin_recto", "cin_verso", "rib_doc"],
  auto_entrepreneur: ["cin_recto", "cin_verso", "rib_doc", "model_j", "attestation_fiscale"],
  societe: ["rib_doc", "model_j", "attestation_fiscale"],
};

type OutletContext = {
  profile: PartnerProfileType;
  refreshProfile: () => void;
};

const LEGAL_TYPES = [
  { value: "auto_entrepreneur", label: "Auto-entrepreneur" },
  { value: "freelance", label: "Freelance" },
  { value: "societe", label: "Société (SARL, SAS...)" },
];

const BILLING_STATUS_CONFIG: Record<
  string,
  {
    label: string;
    icon: typeof CheckCircle2;
    className: string;
    bgClass: string;
  }
> = {
  validated: {
    label: "Validé par la comptabilité",
    icon: CheckCircle2,
    className: "text-emerald-700",
    bgClass: "bg-emerald-50 border-emerald-200",
  },
  pending: {
    label: "En attente de validation",
    icon: AlertTriangle,
    className: "text-amber-700",
    bgClass: "bg-amber-50 border-amber-200",
  },
  rejected: {
    label: "Rejeté - veuillez corriger",
    icon: XCircle,
    className: "text-red-700",
    bgClass: "bg-red-50 border-red-200",
  },
};

const ROLE_LABELS: Record<string, string> = {
  camera: "Caméraman",
  editor: "Monteur vidéo",
  voice: "Voix off",
  blogger: "Blogueur",
  photographer: "Photographe",
};

export function PartnerProfile() {
  const { profile, refreshProfile } = useOutletContext<OutletContext>();

  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    profile.avatar_url ?? null,
  );
  const [form, setForm] = useState({
    display_name: profile.display_name ?? "",
    city: profile.city ?? "",
    phone: profile.phone ?? "",
    legal_type: profile.legal_type ?? "",
    company_name: profile.company_name ?? "",
    rib_iban: profile.rib_iban ?? "",
    ice: (profile as Record<string, unknown>).ice as string ?? "",
    rc: (profile as Record<string, unknown>).rc as string ?? "",
  });

  // Documents uploadés
  const [documents, setDocuments] = useState<UploadedDocument[]>(
    ((profile as Record<string, unknown>).documents as UploadedDocument[]) ?? []
  );
  const [uploadingDoc, setUploadingDoc] = useState<DocumentType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocType, setSelectedDocType] = useState<DocumentType | null>(null);

  // Vérifie si le statut juridique nécessite ICE et RC
  const requiresIceRc = form.legal_type === "societe" || form.legal_type === "auto_entrepreneur";

  // Vérifie si le statut juridique nécessite une CIN
  const requiresCin = form.legal_type === "freelance" || form.legal_type === "auto_entrepreneur";

  // Documents requis pour le statut actuel
  const requiredDocuments: DocumentType[] = REQUIRED_DOCUMENTS_BY_STATUS[form.legal_type] ?? [];

  // Vérifie si un document est expiré
  const isDocumentExpired = (doc: UploadedDocument): boolean => {
    const config = ALL_DOCUMENT_TYPES[doc.type];
    if (!config?.maxAgeMonths) return false;

    const uploadDate = new Date(doc.uploadedAt);
    const expiryDate = new Date(uploadDate);
    expiryDate.setMonth(expiryDate.getMonth() + config.maxAgeMonths);

    return new Date() > expiryDate;
  };

  // Vérifie si un document existe et est valide
  const hasValidDocument = (type: DocumentType): boolean => {
    const doc = documents.find(d => d.type === type);
    if (!doc) return false;
    return !isDocumentExpired(doc);
  };

  // Gestion de l'upload de document
  const handleDocumentUpload = async (type: DocumentType, file: File) => {
    setUploadingDoc(type);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const res = await fetch("/api/partners/me/documents", {
        method: "POST",
        headers: {
          authorization: `Bearer ${await getAccessToken()}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      // Ajouter ou remplacer le document
      setDocuments(prev => {
        const filtered = prev.filter(d => d.type !== type);
        return [...filtered, {
          type,
          name: file.name,
          url: data.url,
          uploadedAt: new Date().toISOString(),
        }];
      });

      toast({ title: "Succès", description: `${ALL_DOCUMENT_TYPES[type].label} uploadé.` });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur d'upload",
        variant: "destructive",
      });
    } finally {
      setUploadingDoc(null);
      setSelectedDocType(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedDocType) {
      handleDocumentUpload(selectedDocType, file);
    }
    e.target.value = "";
  };

  const triggerFileUpload = (type: DocumentType) => {
    setSelectedDocType(type);
    fileInputRef.current?.click();
  };

  const removeDocument = (type: DocumentType) => {
    setDocuments(prev => prev.filter(d => d.type !== type));
  };

  const billingStatus = String(profile.billing_status ?? "pending");
  const billingConfig =
    BILLING_STATUS_CONFIG[billingStatus] || BILLING_STATUS_CONFIG.pending;
  const BillingIcon = billingConfig.icon;

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.display_name.trim()) {
      toast({
        title: "Erreur",
        description: "Le nom est requis.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/partners/me/profile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({ ...form, documents }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      toast({ title: "Succès", description: "Profil mis à jour." });
      refreshProfile();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    form.display_name !== (profile.display_name ?? "") ||
    form.city !== (profile.city ?? "") ||
    form.phone !== (profile.phone ?? "") ||
    form.legal_type !== (profile.legal_type ?? "") ||
    form.company_name !== (profile.company_name ?? "") ||
    form.rib_iban !== (profile.rib_iban ?? "") ||
    form.ice !== ((profile as Record<string, unknown>).ice as string ?? "") ||
    form.rc !== ((profile as Record<string, unknown>).rc as string ?? "");

  // Vérifie si tous les documents requis sont présents et valides
  const hasAllRequiredDocuments = requiredDocuments.every(docType => hasValidDocument(docType));

  // Vérifie si les champs ICE/RC sont remplis quand nécessaires
  const hasRequiredIceRc = !requiresIceRc || (form.ice.trim() !== "" && form.rc.trim() !== "");

  const isProfileComplete = form.display_name && form.city && form.rib_iban && hasRequiredIceRc && hasAllRequiredDocuments && form.legal_type;

  // Liste des champs manquants pour l'indicateur
  const missingFields: string[] = [];
  if (!form.display_name) missingFields.push("Nom");
  if (!form.city) missingFields.push("Ville");
  if (!form.rib_iban) missingFields.push("IBAN");
  if (!form.legal_type) missingFields.push("Statut juridique");
  if (requiresIceRc && !form.ice.trim()) missingFields.push("ICE");
  if (requiresIceRc && !form.rc.trim()) missingFields.push("RC");

  // Vérifier les documents manquants
  for (const docType of requiredDocuments) {
    if (!hasValidDocument(docType)) {
      const config = ALL_DOCUMENT_TYPES[docType];
      missingFields.push(config.label);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Mon profil</h1>
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="gap-2"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Enregistrer
        </Button>
      </div>

      {/* Billing status banner */}
      <div
        className={cn(
          "rounded-lg border p-3 flex items-center gap-3",
          billingConfig.bgClass,
        )}
      >
        <BillingIcon
          className={cn("w-5 h-5 flex-shrink-0", billingConfig.className)}
        />
        <div>
          <div className={cn("text-sm font-medium", billingConfig.className)}>
            Statut RIB : {billingConfig.label}
          </div>
          {billingStatus === "rejected" && (
            <div className="text-xs text-red-600 mt-0.5">
              Veuillez vérifier vos informations bancaires et resoumettre.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Personal info */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <User className="w-4 h-4 text-slate-500" />
            Informations personnelles
          </h2>

          {/* Avatar centered */}
          <div className="flex justify-center py-2">
            <PartnerAvatarEditor
              userId={profile.user_id}
              displayName={profile.display_name ?? ""}
              avatarUrl={avatarUrl}
              onUpdated={setAvatarUrl}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="role" className="text-xs text-slate-600">
                Rôle
              </Label>
              <Input
                id="role"
                value={ROLE_LABELS[profile.role] || profile.role}
                disabled
                className="mt-1 bg-slate-50 h-9 text-sm"
              />
            </div>

            <div>
              <Label htmlFor="email" className="text-xs text-slate-600">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  id="email"
                  value={profile.email ?? ""}
                  disabled
                  className="mt-1 ps-8 bg-slate-50 h-9 text-sm"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="display_name" className="text-xs text-slate-600">
                Nom affiché <span className="text-red-500">*</span>
              </Label>
              <Input
                id="display_name"
                value={form.display_name}
                onChange={(e) => handleChange("display_name", e.target.value)}
                placeholder="Votre nom complet"
                className="mt-1 h-9 text-sm"
              />
            </div>

            <div>
              <Label htmlFor="city" className="text-xs text-slate-600">
                Ville <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <MapPin className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => handleChange("city", e.target.value)}
                  placeholder="Votre ville"
                  className="mt-1 ps-8 h-9 text-sm"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="phone" className="text-xs text-slate-600">
                Téléphone
              </Label>
              <div className="relative">
                <Phone className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  placeholder="+212 6..."
                  className="mt-1 ps-8 h-9 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Legal & billing info */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500" />
            Informations légales & bancaires
          </h2>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                className={form.legal_type === "societe" ? "" : "sm:col-span-2"}
              >
                <Label htmlFor="legal_type" className="text-xs text-slate-600">
                  Statut juridique
                </Label>
                <Select
                  value={form.legal_type}
                  onValueChange={(v) => handleChange("legal_type", v)}
                >
                  <SelectTrigger className="mt-1 h-9 text-sm">
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGAL_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.legal_type === "societe" && (
                <div>
                  <Label
                    htmlFor="company_name"
                    className="text-xs text-slate-600"
                  >
                    Raison sociale
                  </Label>
                  <Input
                    id="company_name"
                    value={form.company_name}
                    onChange={(e) =>
                      handleChange("company_name", e.target.value)
                    }
                    placeholder="Nom de la société"
                    className="mt-1 h-9 text-sm"
                  />
                </div>
              )}
            </div>

            {/* Champs ICE et RC - affichés pour Société et Auto-entrepreneur */}
            {requiresIceRc && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <Label htmlFor="ice" className="text-xs text-slate-600">
                    ICE <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Hash className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input
                      id="ice"
                      value={form.ice}
                      onChange={(e) =>
                        handleChange("ice", e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="000000000000000"
                      maxLength={15}
                      className="mt-1 ps-8 font-mono h-9 text-sm"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Identifiant Commun de l'Entreprise (15 chiffres)
                  </p>
                </div>

                <div>
                  <Label htmlFor="rc" className="text-xs text-slate-600">
                    Registre de Commerce <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <FileText className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input
                      id="rc"
                      value={form.rc}
                      onChange={(e) => handleChange("rc", e.target.value.toUpperCase())}
                      placeholder="123456"
                      className="mt-1 ps-8 font-mono h-9 text-sm"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Numéro du Registre de Commerce
                  </p>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="rib_iban" className="text-xs text-slate-600">
                IBAN / RIB <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <CreditCard className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  id="rib_iban"
                  value={form.rib_iban}
                  onChange={(e) =>
                    handleChange("rib_iban", e.target.value.toUpperCase())
                  }
                  placeholder="MA76 0000 0000 0000 0000 0000"
                  className="mt-1 ps-8 font-mono h-9 text-sm"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Votre IBAN sera vérifié par la comptabilité avant tout paiement.
              </p>
            </div>

            {/* Documents obligatoires - adapté selon le statut juridique */}
            {form.legal_type && requiredDocuments.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-600 font-medium">
                    Justificatifs obligatoires <span className="text-red-500">*</span>
                  </Label>
                  <span className="text-[10px] text-slate-400">
                    {documents.filter(d => requiredDocuments.includes(d.type) && !isDocumentExpired(d)).length}/{requiredDocuments.length} documents
                  </span>
                </div>

                {/* Input file caché */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                {/* CIN Section - pour Freelance et Auto-entrepreneur */}
                {requiresCin && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      Carte d'Identité Nationale
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(["cin_recto", "cin_verso"] as DocumentType[]).map((type) => {
                        const config = ALL_DOCUMENT_TYPES[type];
                        const doc = documents.find(d => d.type === type);
                        const isUploading = uploadingDoc === type;

                        return (
                          <div
                            key={type}
                            className={cn(
                              "border rounded-lg p-2.5 transition-colors",
                              doc
                                ? "border-emerald-200 bg-emerald-50"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {doc ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                ) : (
                                  <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-slate-700">
                                    {config.label}
                                  </div>
                                  {doc && (
                                    <div className="text-[10px] text-slate-500 truncate">
                                      {doc.name}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                {doc && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                                    onClick={() => removeDocument(type)}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  variant={doc ? "outline" : "default"}
                                  size="sm"
                                  className="h-6 text-[10px] gap-1 px-2"
                                  onClick={() => triggerFileUpload(type)}
                                  disabled={isUploading}
                                >
                                  {isUploading ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Upload className="w-3 h-3" />
                                  )}
                                  {doc ? "Changer" : "Ajouter"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Documents bancaires et légaux */}
                <div className="space-y-2">
                  {requiredDocuments.filter(t => t !== "cin_recto" && t !== "cin_verso").length > 0 && (
                    <div className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      Documents bancaires & légaux
                    </div>
                  )}
                  {requiredDocuments
                    .filter(type => type !== "cin_recto" && type !== "cin_verso")
                    .map((type) => {
                      const config = ALL_DOCUMENT_TYPES[type];
                      const doc = documents.find(d => d.type === type);
                      const isExpired = doc ? isDocumentExpired(doc) : false;
                      const isUploading = uploadingDoc === type;

                      return (
                        <div
                          key={type}
                          className={cn(
                            "border rounded-lg p-3 transition-colors",
                            doc && !isExpired
                              ? "border-emerald-200 bg-emerald-50"
                              : isExpired
                              ? "border-amber-200 bg-amber-50"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              {doc && !isExpired ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                              ) : isExpired ? (
                                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                              ) : (
                                <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-700 truncate">
                                  {config.label}
                                </div>
                                {doc ? (
                                  <div className="text-[10px] text-slate-500 truncate">
                                    {doc.name}
                                    {isExpired && (
                                      <span className="text-amber-600 ms-1">(expiré - à renouveler)</span>
                                    )}
                                  </div>
                                ) : config.description && (
                                  <div className="text-[10px] text-slate-400">
                                    {config.description}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              {doc && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                                  onClick={() => removeDocument(type)}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant={doc && !isExpired ? "outline" : "default"}
                                size="sm"
                                className="h-6 text-[10px] gap-1 px-2"
                                onClick={() => triggerFileUpload(type)}
                                disabled={isUploading}
                              >
                                {isUploading ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Upload className="w-3 h-3" />
                                )}
                                {doc ? "Changer" : "Ajouter"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                  <p className="text-[10px] text-slate-500">
                    <strong>Formats acceptés :</strong> PDF, JPG, PNG (max 5 Mo).
                    {requiresIceRc && " Le Modèle J doit dater de moins de 3 mois et l'attestation fiscale de moins de 6 mois."}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Ces documents seront vérifiés par notre service comptabilité avant validation de votre compte partenaire.
                  </p>
                </div>
              </div>
            )}

            {/* Message si pas de statut sélectionné */}
            {!form.legal_type && (
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-xs text-slate-500 text-center">
                  Sélectionnez votre statut juridique pour voir les documents requis.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Completeness indicator */}
      <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isProfileComplete ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          )}
          <span className="text-sm text-slate-700">
            {isProfileComplete
              ? "Votre profil est complet"
              : "Complétez les champs obligatoires pour pouvoir demander des factures"}
          </span>
        </div>
        {!isProfileComplete && missingFields.length > 0 && (
          <div className="text-xs text-slate-500 max-w-[200px] truncate">
            {missingFields.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper to get access token
async function getAccessToken(): Promise<string> {
  const { proSupabase } = await import("@/lib/pro/supabase");
  const { data, error } = await proSupabase.auth.getSession();
  if (error || !data.session) throw new Error("Non authentifié");
  return data.session.access_token;
}

export default PartnerProfile;
