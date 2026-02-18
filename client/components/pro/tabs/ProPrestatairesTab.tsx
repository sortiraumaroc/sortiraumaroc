import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AlertTriangle,
  Archive,
  Ban,
  Briefcase,
  Building,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Edit,
  Eye,
  FileText,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Upload,
  User,
  XCircle,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";

import type { Establishment, ProRole } from "@/lib/pro/types";
import {
  createProPrestataireDemande,
  listProPrestataireDemandes,
  listProPrestataires,
  createProPrestataire,
  getProPrestataire,
  updateProPrestataire,
  submitProPrestataireForValidation,
  uploadProPrestataireDocument,
  deleteProPrestataireDocument,
  listProPrestataireMessages,
  sendProPrestataireMessage,
  type PrestataireDemande,
  type PrestataireListItem,
  type PrestataireDetail,
  type PrestataireDocument,
  type PrestataireType,
  type PrestataireCategorie,
  type ConformityScore,
  type PrestataireMessage,
  type PrestataireMessageTopic,
} from "@/lib/pro/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const STATUT_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; className: string }
> = {
  BROUILLON: {
    label: "Brouillon",
    icon: <Edit className="h-3 w-3" />,
    className: "bg-slate-100 text-slate-700",
  },
  EN_VALIDATION: {
    label: "En validation",
    icon: <Clock className="h-3 w-3" />,
    className: "bg-amber-100 text-amber-800",
  },
  VALIDE: {
    label: "Validé",
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: "bg-emerald-100 text-emerald-800",
  },
  BLOQUE: {
    label: "Bloqué",
    icon: <Ban className="h-3 w-3" />,
    className: "bg-rose-100 text-rose-800",
  },
  REFUSE: {
    label: "Refusé",
    icon: <XCircle className="h-3 w-3" />,
    className: "bg-red-100 text-red-800",
  },
  ARCHIVE: {
    label: "Archivé",
    icon: <Archive className="h-3 w-3" />,
    className: "bg-gray-100 text-gray-600",
  },
};

const DEMANDE_STATUT_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; className: string }
> = {
  NOUVELLE: {
    label: "En attente",
    icon: <Clock className="h-3 w-3" />,
    className: "bg-amber-100 text-amber-800",
  },
  EN_COURS: {
    label: "En traitement",
    icon: <Loader2 className="h-3 w-3" />,
    className: "bg-blue-100 text-blue-800",
  },
  CONVERTIE: {
    label: "Convertie",
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: "bg-green-100 text-green-800",
  },
  REFUSEE: {
    label: "Refusée",
    icon: <XCircle className="h-3 w-3" />,
    className: "bg-red-100 text-red-800",
  },
  ANNULEE: {
    label: "Annulée",
    icon: <Ban className="h-3 w-3" />,
    className: "bg-slate-100 text-slate-800",
  },
};

const TYPE_OPTIONS: { value: PrestataireType; label: string }[] = [
  { value: "auto_entrepreneur", label: "Auto-entrepreneur" },
  { value: "entreprise_individuelle", label: "Entreprise individuelle" },
  { value: "sarl", label: "SARL" },
  { value: "sa", label: "SA" },
  { value: "sas", label: "SAS" },
  { value: "association", label: "Association" },
  { value: "autre", label: "Autre" },
];

const CATEGORIE_OPTIONS: { value: PrestataireCategorie; label: string }[] = [
  { value: "camera", label: "Caméraman" },
  { value: "editor", label: "Monteur" },
  { value: "voice", label: "Voix-off" },
  { value: "blogger", label: "Blogueur" },
  { value: "photographer", label: "Photographe" },
  { value: "designer", label: "Designer" },
  { value: "developer", label: "Développeur" },
  { value: "consultant", label: "Consultant" },
  { value: "autre", label: "Autre" },
];

const DOC_TYPE_OPTIONS: {
  value: PrestataireDocument["type_document"];
  label: string;
  required: boolean;
}[] = [
  { value: "CARTE_AE_OU_RC", label: "Carte AE / RC", required: true },
  { value: "ATTESTATION_ICE_IF", label: "Attestation ICE/IF", required: false },
  { value: "RIB_SCAN", label: "Scan RIB", required: true },
  { value: "AUTRE", label: "Autre document", required: false },
];

const DOC_STATUT_CONFIG: Record<string, { label: string; className: string }> =
  {
    MANQUANT: { label: "Manquant", className: "bg-slate-100 text-slate-600" },
    UPLOADED: { label: "Uploadé", className: "bg-blue-100 text-blue-800" },
    VALIDE: { label: "Validé", className: "bg-emerald-100 text-emerald-800" },
    REFUSE: { label: "Refusé", className: "bg-rose-100 text-rose-800" },
  };

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(d));
  } catch {
    return d;
  }
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export function ProPrestatairesTab({ establishment, role }: Props) {
  const [mainTab, setMainTab] = useState<"annuaire" | "demandes">("annuaire");
  const [loading, setLoading] = useState(true);
  const [demandes, setDemandes] = useState<PrestataireDemande[]>([]);
  const [prestataires, setPrestataires] = useState<PrestataireListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatut, setFilterStatut] = useState<string>("all");

  // Creation wizard
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [wizardForm, setWizardForm] = useState({
    nom_legal: "",
    type_prestataire: "auto_entrepreneur" as PrestataireType,
    ice: "",
    identifiant_fiscal: "",
    registre_commerce: "",
    adresse: "",
    ville: "",
    pays: "Maroc",
    banque_nom: "",
    titulaire_compte: "",
    tva_applicable: false,
    tva_taux: 20,
    email: "",
    telephone: "",
    categorie_prestation: "autre" as PrestataireCategorie,
    zone_intervention: "",
  });

  // Detail dialog (fiche 360)
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedPrestataire, setSelectedPrestataire] =
    useState<PrestataireDetail | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<PrestataireDocument[]>([]);
  const [conformityScore, setConformityScore] =
    useState<ConformityScore | null>(null);
  const [detailTab, setDetailTab] = useState<
    "info" | "banque" | "fiscalite" | "documents" | "messages"
  >("info");
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<PrestataireDetail>>({});

  // Document upload
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDocType, setUploadDocType] =
    useState<PrestataireDocument["type_document"]>("CARTE_AE_OU_RC");

  // Demande dialog
  const [showDemandeDialog, setShowDemandeDialog] = useState(false);
  const [creatingDemande, setCreatingDemande] = useState(false);
  const [demandeForm, setDemandeForm] = useState({
    nom: "",
    contact_email: "",
    contact_telephone: "",
    type_prestation: "",
    ville: "",
    notes: "",
  });

  // Messages state
  const [messages, setMessages] = useState<PrestataireMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [messageTopic, setMessageTopic] =
    useState<PrestataireMessageTopic>("general");
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const canEdit = role === "owner" || role === "manager";

  // ---------------------------------------------------------------------------
  // DATA FETCHING
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [demandesRes, prestatairesRes] = await Promise.all([
        listProPrestataireDemandes(),
        listProPrestataires(establishment.id),
      ]);
      setDemandes(demandesRes.items);
      setPrestataires(prestatairesRes.items);
    } catch (e) {
      toast({
        title: "Erreur de chargement",
        description:
          e instanceof Error ? e.message : "Impossible de charger les données",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [establishment.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadPrestataireDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await getProPrestataire(id);
      setSelectedPrestataire(res.prestataire);
      setSelectedDocs(res.documents);
      setConformityScore(res.conformity_score);
      setEditForm({ ...res.prestataire });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const loadMessages = useCallback(async (prestataireId: string) => {
    setMessagesLoading(true);
    try {
      const res = await listProPrestataireMessages(prestataireId);
      setMessages(res.items);
    } catch (e) {
      toast({
        title: "Erreur",
        description:
          e instanceof Error ? e.message : "Erreur chargement messages",
        variant: "destructive",
      });
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (detailTab === "messages" && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, detailTab]);

  // ---------------------------------------------------------------------------
  // FILTERED DATA
  // ---------------------------------------------------------------------------

  const filteredPrestataires = useMemo(() => {
    let items = prestataires;

    if (filterStatut !== "all") {
      items = items.filter((p) => p.statut === filterStatut);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (p) =>
          p.nom_legal?.toLowerCase().includes(q) ||
          p.ville?.toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q),
      );
    }

    return items;
  }, [prestataires, filterStatut, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: prestataires.length,
      BROUILLON: 0,
      EN_VALIDATION: 0,
      VALIDE: 0,
      BLOQUE: 0,
    };
    for (const p of prestataires) {
      if (p.statut in counts) counts[p.statut]++;
    }
    return counts;
  }, [prestataires]);

  // ---------------------------------------------------------------------------
  // WIZARD HANDLERS
  // ---------------------------------------------------------------------------

  const handleCreatePrestataire = async () => {
    if (!wizardForm.nom_legal.trim()) {
      toast({
        title: "Erreur",
        description: "Le nom légal est obligatoire",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      await createProPrestataire({
        nom_legal: wizardForm.nom_legal,
        type_prestataire: wizardForm.type_prestataire,
        ice: wizardForm.ice || undefined,
        identifiant_fiscal: wizardForm.identifiant_fiscal || undefined,
        registre_commerce: wizardForm.registre_commerce || undefined,
        adresse: wizardForm.adresse || undefined,
        ville: wizardForm.ville || undefined,
        pays: wizardForm.pays || "Maroc",
        banque_nom: wizardForm.banque_nom || undefined,
        titulaire_compte: wizardForm.titulaire_compte || undefined,
        tva_applicable: wizardForm.tva_applicable,
        tva_taux: wizardForm.tva_applicable ? wizardForm.tva_taux : 0,
        email: wizardForm.email || undefined,
        telephone: wizardForm.telephone || undefined,
        categorie_prestation: wizardForm.categorie_prestation,
        zone_intervention: wizardForm.zone_intervention || undefined,
        establishment_id: establishment.id,
      });

      toast({
        title: "Prestataire créé",
        description: `${wizardForm.nom_legal} a été ajouté en brouillon`,
      });
      setShowWizard(false);
      resetWizardForm();
      void loadData();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const resetWizardForm = () => {
    setWizardStep(0);
    setWizardForm({
      nom_legal: "",
      type_prestataire: "auto_entrepreneur",
      ice: "",
      identifiant_fiscal: "",
      registre_commerce: "",
      adresse: "",
      ville: "",
      pays: "Maroc",
      banque_nom: "",
      titulaire_compte: "",
      tva_applicable: false,
      tva_taux: 20,
      email: "",
      telephone: "",
      categorie_prestation: "autre",
      zone_intervention: "",
    });
  };

  // ---------------------------------------------------------------------------
  // DETAIL HANDLERS
  // ---------------------------------------------------------------------------

  const handleOpenDetail = (p: PrestataireListItem) => {
    setShowDetail(true);
    setDetailTab("info");
    setMessages([]);
    void loadPrestataireDetail(p.id);
  };

  // Load messages when switching to messages tab
  useEffect(() => {
    if (
      detailTab === "messages" &&
      selectedPrestataire &&
      messages.length === 0
    ) {
      void loadMessages(selectedPrestataire.id);
    }
  }, [detailTab, selectedPrestataire, messages.length, loadMessages]);

  const handleSaveDetail = async () => {
    if (!selectedPrestataire) return;
    setSaving(true);
    try {
      await updateProPrestataire(selectedPrestataire.id, editForm);
      toast({ title: "Modifications enregistrées" });
      void loadPrestataireDetail(selectedPrestataire.id);
      void loadData();
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

  const handleSubmitForValidation = async () => {
    if (!selectedPrestataire) return;
    setSaving(true);
    try {
      await submitProPrestataireForValidation(selectedPrestataire.id);
      toast({
        title: "Soumis à validation",
        description: "Le prestataire est maintenant en cours de validation",
      });
      void loadPrestataireDetail(selectedPrestataire.id);
      void loadData();
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

  // ---------------------------------------------------------------------------
  // DOCUMENT HANDLERS
  // ---------------------------------------------------------------------------

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPrestataire) return;

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Format non autorisé",
        description: "Seuls PDF, JPG et PNG sont acceptés",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Fichier trop volumineux",
        description: "Taille max: 10 Mo",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      await uploadProPrestataireDocument({
        prestataireId: selectedPrestataire.id,
        type_document: uploadDocType,
        file_name: file.name,
        file_base64: base64,
        mime_type: file.type,
      });
      toast({ title: "Document uploadé" });
      void loadPrestataireDetail(selectedPrestataire.id);
    } catch (e) {
      toast({
        title: "Erreur d'upload",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!selectedPrestataire) return;
    try {
      await deleteProPrestataireDocument(selectedPrestataire.id, docId);
      toast({ title: "Document supprimé" });
      void loadPrestataireDetail(selectedPrestataire.id);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    }
  };

  // ---------------------------------------------------------------------------
  // DEMANDE HANDLERS
  // ---------------------------------------------------------------------------

  const handleCreateDemande = async () => {
    if (!demandeForm.nom.trim()) {
      toast({
        title: "Nom requis",
        description: "Veuillez saisir le nom du prestataire",
        variant: "destructive",
      });
      return;
    }

    setCreatingDemande(true);
    try {
      await createProPrestataireDemande({
        nom: demandeForm.nom.trim(),
        contact_email: demandeForm.contact_email.trim() || null,
        contact_telephone: demandeForm.contact_telephone.trim() || null,
        type_prestation: demandeForm.type_prestation || null,
        ville: demandeForm.ville.trim() || null,
        notes: demandeForm.notes.trim() || null,
        establishment_id: establishment.id,
      });

      toast({
        title: "Demande envoyée",
        description: "Votre demande de prestataire a été soumise",
      });
      setShowDemandeDialog(false);
      setDemandeForm({
        nom: "",
        contact_email: "",
        contact_telephone: "",
        type_prestation: "",
        ville: "",
        notes: "",
      });
      void loadData();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setCreatingDemande(false);
    }
  };

  // ---------------------------------------------------------------------------
  // MESSAGE HANDLERS
  // ---------------------------------------------------------------------------

  const handleSendMessage = async () => {
    if (!selectedPrestataire || !messageBody.trim()) return;

    setSendingMessage(true);
    try {
      await sendProPrestataireMessage({
        prestataireId: selectedPrestataire.id,
        body: messageBody.trim(),
        topic: messageTopic,
      });
      setMessageBody("");
      toast({ title: "Message envoyé" });
      void loadMessages(selectedPrestataire.id);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur envoi message",
        variant: "destructive",
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <SectionHeader
            title="Prestataires"
            description="Gérez vos prestataires et consultez leurs statuts de conformité"
            icon={Briefcase}
            actions={
              canEdit ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowDemandeDialog(true)}
                    className="gap-2"
                  >
                    <Mail className="w-4 h-4" />
                    Demander un prestataire
                  </Button>
                  <Button
                    onClick={() => setShowWizard(true)}
                    className="bg-primary text-white hover:bg-primary/90 gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter
                  </Button>
                </div>
              ) : undefined
            }
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              Chargement...
            </div>
          ) : (
            <Tabs
              value={mainTab}
              onValueChange={(v) => setMainTab(v as "annuaire" | "demandes")}
            >
              <TabsList className="grid w-full max-w-md grid-cols-2 mb-4">
                <TabsTrigger value="annuaire" className="gap-2">
                  <Briefcase className="w-4 h-4" />
                  Annuaire ({prestataires.length})
                </TabsTrigger>
                <TabsTrigger value="demandes" className="gap-2">
                  <Clock className="w-4 h-4" />
                  Demandes ({demandes.length})
                </TabsTrigger>
              </TabsList>

              {/* TAB: Annuaire */}
              <TabsContent value="annuaire" className="mt-0 space-y-4">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Rechercher..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="ps-10"
                    />
                  </div>
                  <Select value={filterStatut} onValueChange={setFilterStatut}>
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        Tous ({statusCounts.all})
                      </SelectItem>
                      <SelectItem value="BROUILLON">
                        Brouillons ({statusCounts.BROUILLON})
                      </SelectItem>
                      <SelectItem value="EN_VALIDATION">
                        En validation ({statusCounts.EN_VALIDATION})
                      </SelectItem>
                      <SelectItem value="VALIDE">
                        Validés ({statusCounts.VALIDE})
                      </SelectItem>
                      <SelectItem value="BLOQUE">
                        Bloqués ({statusCounts.BLOQUE})
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => loadData()}
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                    />
                  </Button>
                </div>

                {/* List */}
                {filteredPrestataires.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Briefcase className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="font-medium">Aucun prestataire</p>
                    <p className="text-sm mt-1">
                      {prestataires.length === 0
                        ? "Créez votre premier prestataire pour commencer"
                        : "Aucun résultat pour ces filtres"}
                    </p>
                    {canEdit && prestataires.length === 0 && (
                      <Button
                        className="mt-4"
                        onClick={() => setShowWizard(true)}
                      >
                        <Plus className="w-4 h-4 me-2" />
                        Ajouter un prestataire
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredPrestataires.map((p) => {
                      const cfg =
                        STATUT_CONFIG[p.statut] ?? STATUT_CONFIG.BROUILLON;
                      return (
                        <div
                          key={p.id}
                          className="border rounded-lg p-4 hover:bg-slate-50 transition cursor-pointer"
                          onClick={() => handleOpenDetail(p)}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h4 className="font-semibold truncate">
                                  {p.nom_legal}
                                </h4>
                                <Badge className={cfg.className}>
                                  {cfg.icon}
                                  <span className="ms-1">{cfg.label}</span>
                                </Badge>
                                {p.categorie_prestation && (
                                  <Badge variant="outline" className="text-xs">
                                    {CATEGORIE_OPTIONS.find(
                                      (c) => c.value === p.categorie_prestation,
                                    )?.label ?? p.categorie_prestation}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-slate-600 flex flex-wrap items-center gap-3">
                                {p.ville && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {p.ville}
                                  </span>
                                )}
                                {p.email && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    {p.email}
                                  </span>
                                )}
                                {p.telephone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {p.telephone}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-400 hidden sm:block" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* TAB: Demandes */}
              <TabsContent value="demandes" className="mt-0 space-y-3">
                {demandes.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Mail className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="font-medium">Aucune demande</p>
                    <p className="text-sm mt-1">
                      Demandez un prestataire pour qu'il soit référencé par
                      notre équipe
                    </p>
                  </div>
                ) : (
                  demandes.map((d) => {
                    const cfg =
                      DEMANDE_STATUT_CONFIG[d.statut] ??
                      DEMANDE_STATUT_CONFIG.NOUVELLE;
                    return (
                      <div
                        key={d.id}
                        className="border rounded-lg p-4 hover:bg-slate-50 transition"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold truncate">
                                {d.nom}
                              </h4>
                              <Badge className={cfg.className}>
                                {cfg.icon}
                                <span className="ms-1">{cfg.label}</span>
                              </Badge>
                            </div>
                            <div className="text-sm text-slate-600 flex flex-wrap items-center gap-3">
                              {d.type_prestation && (
                                <span className="capitalize">
                                  {d.type_prestation}
                                </span>
                              )}
                              {d.ville && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {d.ville}
                                </span>
                              )}
                              <span className="text-slate-400">
                                Demandé le {formatDate(d.created_at)}
                              </span>
                            </div>
                            {d.statut === "REFUSEE" && d.motif_refus && (
                              <div className="mt-2 text-sm text-red-600 bg-red-50 rounded p-2">
                                Motif : {d.motif_refus}
                              </div>
                            )}
                            {d.statut === "CONVERTIE" && d.prestataires && (
                              <div className="mt-2 text-sm text-green-700 bg-green-50 rounded p-2">
                                Prestataire créé :{" "}
                                <strong>{d.prestataires.nom_legal}</strong>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* WIZARD: Création de prestataire */}
      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouveau prestataire</DialogTitle>
            <DialogDescription>
              Étape {wizardStep + 1} sur 5 —{" "}
              {
                ["Identité", "Banque", "Fiscalité", "Contact", "Récapitulatif"][
                  wizardStep
                ]
              }
            </DialogDescription>
          </DialogHeader>

          {/* Progress */}
          <div className="flex items-center gap-2 mb-4">
            {[0, 1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`flex-1 h-2 rounded-full ${step <= wizardStep ? "bg-primary" : "bg-slate-200"}`}
              />
            ))}
          </div>

          {/* Step 0: Identité */}
          {wizardStep === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nom légal *</Label>
                <Input
                  placeholder="Raison sociale ou nom complet"
                  value={wizardForm.nom_legal}
                  onChange={(e) =>
                    setWizardForm((f) => ({ ...f, nom_legal: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type de prestataire *</Label>
                  <Select
                    value={wizardForm.type_prestataire}
                    onValueChange={(v) =>
                      setWizardForm((f) => ({
                        ...f,
                        type_prestataire: v as PrestataireType,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Catégorie</Label>
                  <Select
                    value={wizardForm.categorie_prestation}
                    onValueChange={(v) =>
                      setWizardForm((f) => ({
                        ...f,
                        categorie_prestation: v as PrestataireCategorie,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ICE (15 chiffres)</Label>
                  <Input
                    placeholder="000000000000000"
                    maxLength={15}
                    value={wizardForm.ice}
                    onChange={(e) =>
                      setWizardForm((f) => ({
                        ...f,
                        ice: e.target.value.replace(/\D/g, "").slice(0, 15),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Identifiant Fiscal (IF)</Label>
                  <Input
                    placeholder="Identifiant fiscal"
                    value={wizardForm.identifiant_fiscal}
                    onChange={(e) =>
                      setWizardForm((f) => ({
                        ...f,
                        identifiant_fiscal: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              {["sarl", "sa", "sas", "entreprise_individuelle"].includes(
                wizardForm.type_prestataire,
              ) && (
                <div className="space-y-2">
                  <Label>Registre de Commerce (RC)</Label>
                  <Input
                    placeholder="Numéro RC"
                    value={wizardForm.registre_commerce}
                    onChange={(e) =>
                      setWizardForm((f) => ({
                        ...f,
                        registre_commerce: e.target.value,
                      }))
                    }
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Adresse</Label>
                <Input
                  placeholder="Adresse complète"
                  value={wizardForm.adresse}
                  onChange={(e) =>
                    setWizardForm((f) => ({ ...f, adresse: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ville</Label>
                  <Input
                    value={wizardForm.ville}
                    onChange={(e) =>
                      setWizardForm((f) => ({ ...f, ville: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pays</Label>
                  <Input
                    value={wizardForm.pays}
                    onChange={(e) =>
                      setWizardForm((f) => ({ ...f, pays: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Banque */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nom de la banque</Label>
                <Input
                  placeholder="Ex: Attijariwafa Bank"
                  value={wizardForm.banque_nom}
                  onChange={(e) =>
                    setWizardForm((f) => ({ ...f, banque_nom: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Titulaire du compte</Label>
                <Input
                  placeholder="Doit correspondre au nom légal"
                  value={wizardForm.titulaire_compte}
                  onChange={(e) =>
                    setWizardForm((f) => ({
                      ...f,
                      titulaire_compte: e.target.value,
                    }))
                  }
                />
                {wizardForm.titulaire_compte &&
                  wizardForm.nom_legal &&
                  wizardForm.titulaire_compte.toLowerCase() !==
                    wizardForm.nom_legal.toLowerCase() && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Le titulaire diffère du nom légal
                    </p>
                  )}
              </div>
              <p className="text-sm text-slate-500">
                Vous pourrez uploader le scan RIB dans la fiche après création.
              </p>
            </div>
          )}

          {/* Step 2: Fiscalité */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>TVA applicable ?</Label>
                <Switch
                  checked={wizardForm.tva_applicable}
                  onCheckedChange={(v) =>
                    setWizardForm((f) => ({ ...f, tva_applicable: v }))
                  }
                />
              </div>
              {wizardForm.tva_applicable && (
                <div className="space-y-2">
                  <Label>Taux de TVA (%)</Label>
                  <Select
                    value={String(wizardForm.tva_taux)}
                    onValueChange={(v) =>
                      setWizardForm((f) => ({ ...f, tva_taux: Number(v) }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20%</SelectItem>
                      <SelectItem value="14">14%</SelectItem>
                      <SelectItem value="10">10%</SelectItem>
                      <SelectItem value="7">7%</SelectItem>
                      <SelectItem value="0">0% (Exonéré)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Contact */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="email@exemple.com"
                    value={wizardForm.email}
                    onChange={(e) =>
                      setWizardForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input
                    placeholder="+212 6..."
                    value={wizardForm.telephone}
                    onChange={(e) =>
                      setWizardForm((f) => ({
                        ...f,
                        telephone: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Zone d'intervention</Label>
                <Input
                  placeholder="Ex: Casablanca, National, etc."
                  value={wizardForm.zone_intervention}
                  onChange={(e) =>
                    setWizardForm((f) => ({
                      ...f,
                      zone_intervention: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          )}

          {/* Step 4: Récapitulatif */}
          {wizardStep === 4 && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-slate-500">Nom légal</div>
                  <div className="font-medium">
                    {wizardForm.nom_legal || "—"}
                  </div>
                  <div className="text-slate-500">Type</div>
                  <div>
                    {TYPE_OPTIONS.find(
                      (t) => t.value === wizardForm.type_prestataire,
                    )?.label ?? "—"}
                  </div>
                  <div className="text-slate-500">Catégorie</div>
                  <div>
                    {CATEGORIE_OPTIONS.find(
                      (c) => c.value === wizardForm.categorie_prestation,
                    )?.label ?? "—"}
                  </div>
                  <div className="text-slate-500">ICE</div>
                  <div>{wizardForm.ice || "—"}</div>
                  <div className="text-slate-500">IF</div>
                  <div>{wizardForm.identifiant_fiscal || "—"}</div>
                  <div className="text-slate-500">Ville</div>
                  <div>{wizardForm.ville || "—"}</div>
                  <div className="text-slate-500">Email</div>
                  <div>{wizardForm.email || "—"}</div>
                  <div className="text-slate-500">TVA</div>
                  <div>
                    {wizardForm.tva_applicable
                      ? `Oui (${wizardForm.tva_taux}%)`
                      : "Non"}
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Le prestataire sera créé en{" "}
                <Badge variant="outline">Brouillon</Badge>. Vous pourrez ensuite
                le compléter et le soumettre à validation.
              </p>
            </div>
          )}

          <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
            {wizardStep > 0 && (
              <Button
                variant="outline"
                onClick={() => setWizardStep((s) => s - 1)}
              >
                Précédent
              </Button>
            )}
            <div className="flex-1" />
            {wizardStep < 4 ? (
              <Button onClick={() => setWizardStep((s) => s + 1)}>
                Suivant
              </Button>
            ) : (
              <Button
                onClick={handleCreatePrestataire}
                disabled={creating || !wizardForm.nom_legal.trim()}
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                ) : null}
                Créer le prestataire
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DETAIL DIALOG: Fiche 360 */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : selectedPrestataire ? (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <DialogTitle className="text-lg">
                      {selectedPrestataire.nom_legal}
                    </DialogTitle>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {(() => {
                        const cfg =
                          STATUT_CONFIG[selectedPrestataire.statut] ??
                          STATUT_CONFIG.BROUILLON;
                        return (
                          <Badge className={cfg.className}>
                            {cfg.icon}
                            <span className="ms-1">{cfg.label}</span>
                          </Badge>
                        );
                      })()}
                      {selectedPrestataire.type_prestataire && (
                        <Badge variant="outline">
                          {TYPE_OPTIONS.find(
                            (t) =>
                              t.value === selectedPrestataire.type_prestataire,
                          )?.label ?? selectedPrestataire.type_prestataire}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {conformityScore && (
                    <div className="text-center shrink-0">
                      <div className="text-2xl font-bold text-primary">
                        {conformityScore.score}%
                      </div>
                      <div className="text-xs text-slate-500">Conformité</div>
                      <Progress
                        value={conformityScore.score}
                        className="w-20 h-2 mt-1"
                      />
                    </div>
                  )}
                </div>
              </DialogHeader>

              {/* Conformity checklist */}
              {conformityScore && (
                <div className="bg-slate-50 rounded-lg p-3 mb-4">
                  <div className="text-xs font-semibold text-slate-600 mb-2">
                    Checklist conformité
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {conformityScore.checklist.map((item) => (
                      <div
                        key={item.key}
                        className={`flex items-center gap-1.5 text-xs ${item.ok ? "text-emerald-700" : "text-slate-500"}`}
                      >
                        {item.ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Blocked warning */}
              {selectedPrestataire.statut === "BLOQUE" &&
                selectedPrestataire.raison_blocage && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-4 text-sm text-rose-800">
                    <strong>Raison du blocage :</strong>{" "}
                    {selectedPrestataire.raison_blocage}
                  </div>
                )}

              <Tabs
                value={detailTab}
                onValueChange={(v) => setDetailTab(v as typeof detailTab)}
              >
                <TabsList className="grid w-full grid-cols-5 mb-4">
                  <TabsTrigger value="info">Identité</TabsTrigger>
                  <TabsTrigger value="banque">Banque</TabsTrigger>
                  <TabsTrigger value="fiscalite">Fiscalité</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                  <TabsTrigger value="messages" className="gap-1">
                    <MessageCircle className="w-3 h-3" />
                    Messages
                  </TabsTrigger>
                </TabsList>

                {/* TAB: Info */}
                <TabsContent value="info" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nom légal</Label>
                      <Input
                        value={editForm.nom_legal ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            nom_legal: e.target.value,
                          }))
                        }
                        disabled={selectedPrestataire.statut === "BLOQUE"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={editForm.type_prestataire ?? ""}
                        onValueChange={(v) =>
                          setEditForm((f) => ({
                            ...f,
                            type_prestataire: v as PrestataireType,
                          }))
                        }
                        disabled={selectedPrestataire.statut === "BLOQUE"}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TYPE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>ICE</Label>
                      <Input
                        value={editForm.ice ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            ice: e.target.value.replace(/\D/g, "").slice(0, 15),
                          }))
                        }
                        maxLength={15}
                        disabled={selectedPrestataire.statut === "BLOQUE"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>IF</Label>
                      <Input
                        value={editForm.identifiant_fiscal ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            identifiant_fiscal: e.target.value,
                          }))
                        }
                        disabled={selectedPrestataire.statut === "BLOQUE"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Adresse</Label>
                      <Input
                        value={editForm.adresse ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            adresse: e.target.value,
                          }))
                        }
                        disabled={selectedPrestataire.statut === "BLOQUE"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Ville</Label>
                      <Input
                        value={editForm.ville ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, ville: e.target.value }))
                        }
                        disabled={selectedPrestataire.statut === "BLOQUE"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={editForm.email ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, email: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Téléphone</Label>
                      <Input
                        value={editForm.telephone ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            telephone: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* TAB: Banque */}
                <TabsContent value="banque" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nom de la banque</Label>
                    <Input
                      value={editForm.banque_nom ?? ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          banque_nom: e.target.value,
                        }))
                      }
                      disabled={selectedPrestataire.statut === "BLOQUE"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Titulaire du compte</Label>
                    <Input
                      value={editForm.titulaire_compte ?? ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          titulaire_compte: e.target.value,
                        }))
                      }
                      disabled={selectedPrestataire.statut === "BLOQUE"}
                    />
                  </div>
                </TabsContent>

                {/* TAB: Fiscalité */}
                <TabsContent value="fiscalite" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>TVA applicable ?</Label>
                    <Switch
                      checked={editForm.tva_applicable ?? false}
                      onCheckedChange={(v) =>
                        setEditForm((f) => ({ ...f, tva_applicable: v }))
                      }
                      disabled={selectedPrestataire.statut === "BLOQUE"}
                    />
                  </div>
                  {editForm.tva_applicable && (
                    <div className="space-y-2">
                      <Label>Taux de TVA (%)</Label>
                      <Select
                        value={String(editForm.tva_taux ?? 20)}
                        onValueChange={(v) =>
                          setEditForm((f) => ({ ...f, tva_taux: Number(v) }))
                        }
                        disabled={selectedPrestataire.statut === "BLOQUE"}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="20">20%</SelectItem>
                          <SelectItem value="14">14%</SelectItem>
                          <SelectItem value="10">10%</SelectItem>
                          <SelectItem value="7">7%</SelectItem>
                          <SelectItem value="0">0% (Exonéré)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </TabsContent>

                {/* TAB: Documents */}
                <TabsContent value="documents" className="space-y-4">
                  {selectedPrestataire.statut !== "BLOQUE" && canEdit && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <Select
                        value={uploadDocType}
                        onValueChange={(v) =>
                          setUploadDocType(
                            v as PrestataireDocument["type_document"],
                          )
                        }
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DOC_TYPE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}{" "}
                              {o.required && (
                                <span className="text-rose-500">*</span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFileSelect}
                      />
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <Loader2 className="w-4 h-4 me-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 me-2" />
                        )}
                        Uploader
                      </Button>
                    </div>
                  )}

                  {selectedDocs.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                      <p>Aucun document uploadé</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedDocs.map((doc) => {
                        const cfg =
                          DOC_STATUT_CONFIG[doc.statut] ??
                          DOC_STATUT_CONFIG.UPLOADED;
                        return (
                          <div
                            key={doc.id}
                            className="flex items-center gap-3 p-3 border rounded-lg"
                          >
                            <FileText className="w-8 h-8 text-slate-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">
                                {doc.file_name}
                              </div>
                              <div className="text-xs text-slate-500 flex items-center gap-2">
                                <span>
                                  {DOC_TYPE_OPTIONS.find(
                                    (o) => o.value === doc.type_document,
                                  )?.label ?? doc.type_document}
                                </span>
                                <span>•</span>
                                <span>
                                  {formatFileSize(doc.file_size_bytes)}
                                </span>
                                <span>•</span>
                                <span>{formatDate(doc.created_at)}</span>
                              </div>
                              {doc.statut === "REFUSE" && doc.review_note && (
                                <div className="text-xs text-rose-600 mt-1">
                                  Motif: {doc.review_note}
                                </div>
                              )}
                            </div>
                            <Badge className={cfg.className}>{cfg.label}</Badge>
                            {doc.statut !== "VALIDE" &&
                              canEdit &&
                              selectedPrestataire.statut !== "BLOQUE" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-slate-400 hover:text-rose-600"
                                  onClick={() => handleDeleteDoc(doc.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* TAB: Messages */}
                <TabsContent value="messages" className="space-y-4">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center py-12 text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin me-2" />
                      Chargement des messages...
                    </div>
                  ) : (
                    <div className="flex flex-col h-[400px]">
                      {/* Messages list */}
                      <ScrollArea className="flex-1 pe-2">
                        <div className="space-y-3">
                          {messages.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">
                              <MessageCircle className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                              <p className="font-medium">Aucun message</p>
                              <p className="text-sm mt-1">
                                Démarrez la conversation avec l'équipe
                                Sortir Au Maroc
                              </p>
                            </div>
                          ) : (
                            messages
                              .filter((m) => !m.is_internal)
                              .map((msg) => {
                                const isOwn = msg.sender_type === "pro";
                                return (
                                  <div
                                    key={msg.id}
                                    className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}
                                  >
                                    <Avatar className="w-8 h-8 flex-shrink-0">
                                      <AvatarFallback
                                        className={
                                          isOwn
                                            ? "bg-blue-100 text-blue-800"
                                            : "bg-[#a3001d] text-white"
                                        }
                                      >
                                        {isOwn ? (
                                          <User className="w-4 h-4" />
                                        ) : (
                                          "SB"
                                        )}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div
                                      className={`max-w-[70%] ${isOwn ? "items-end" : ""}`}
                                    >
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-medium text-slate-600">
                                          {isOwn ? "Vous" : "SAM"}
                                        </span>
                                        {msg.topic !== "general" && (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] px-1 py-0"
                                          >
                                            {msg.topic === "validation"
                                              ? "Validation"
                                              : msg.topic === "documents"
                                                ? "Documents"
                                                : msg.topic === "paiement"
                                                  ? "Paiement"
                                                  : msg.topic}
                                          </Badge>
                                        )}
                                      </div>
                                      <div
                                        className={`rounded-lg px-3 py-2 text-sm ${
                                          isOwn
                                            ? "bg-[#a3001d] text-white"
                                            : "bg-slate-100 text-slate-900"
                                        }`}
                                      >
                                        {msg.body}
                                      </div>
                                      <span className="text-[10px] text-slate-400 mt-1 block">
                                        {formatDate(msg.created_at)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })
                          )}
                          <div ref={messagesEndRef} />
                        </div>
                      </ScrollArea>

                      {/* Message input */}
                      <div className="border-t pt-3 mt-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Select
                            value={messageTopic}
                            onValueChange={(v) =>
                              setMessageTopic(v as PrestataireMessageTopic)
                            }
                          >
                            <SelectTrigger className="w-36 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="general" className="text-xs">
                                Général
                              </SelectItem>
                              <SelectItem
                                value="validation"
                                className="text-xs"
                              >
                                Validation
                              </SelectItem>
                              <SelectItem value="documents" className="text-xs">
                                Documents
                              </SelectItem>
                              <SelectItem value="paiement" className="text-xs">
                                Paiement
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              selectedPrestataire &&
                              loadMessages(selectedPrestataire.id)
                            }
                            className="h-8 w-8 p-0"
                          >
                            <RefreshCw
                              className={`w-4 h-4 ${messagesLoading ? "animate-spin" : ""}`}
                            />
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Textarea
                            value={messageBody}
                            onChange={(e) => setMessageBody(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Votre message..."
                            className="min-h-[60px] max-h-[100px] resize-none text-sm flex-1"
                          />
                          <Button
                            onClick={handleSendMessage}
                            disabled={!messageBody.trim() || sendingMessage}
                            className="bg-[#a3001d] hover:bg-[#8a0019] h-[60px] px-4"
                          >
                            {sendingMessage ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <Separator className="my-4" />

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {selectedPrestataire.statut === "BROUILLON" && canEdit && (
                  <Button
                    variant="outline"
                    onClick={handleSubmitForValidation}
                    disabled={saving}
                    className="gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Soumettre à validation
                  </Button>
                )}
                <div className="flex-1" />
                <Button variant="outline" onClick={() => setShowDetail(false)}>
                  Fermer
                </Button>
                {canEdit && (
                  <Button onClick={handleSaveDetail} disabled={saving}>
                    {saving ? (
                      <Loader2 className="w-4 h-4 me-2 animate-spin" />
                    ) : null}
                    Enregistrer
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : (
            <div className="py-8 text-center text-slate-500">
              Prestataire non trouvé
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DEMANDE DIALOG */}
      <Dialog open={showDemandeDialog} onOpenChange={setShowDemandeDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Demander un prestataire</DialogTitle>
            <DialogDescription>
              Soumettez une demande pour qu'un prestataire soit référencé par
              notre équipe
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du prestataire *</Label>
              <Input
                placeholder="ex: Mohamed Alami"
                value={demandeForm.nom}
                onChange={(e) =>
                  setDemandeForm((f) => ({ ...f, nom: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="presta@email.com"
                  value={demandeForm.contact_email}
                  onChange={(e) =>
                    setDemandeForm((f) => ({
                      ...f,
                      contact_email: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  placeholder="+212 6..."
                  value={demandeForm.contact_telephone}
                  onChange={(e) =>
                    setDemandeForm((f) => ({
                      ...f,
                      contact_telephone: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type de prestation</Label>
                <Select
                  value={demandeForm.type_prestation}
                  onValueChange={(v) =>
                    setDemandeForm((f) => ({ ...f, type_prestation: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIE_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ville</Label>
                <Input
                  placeholder="Casablanca"
                  value={demandeForm.ville}
                  onChange={(e) =>
                    setDemandeForm((f) => ({ ...f, ville: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Informations supplémentaires..."
                value={demandeForm.notes}
                onChange={(e) =>
                  setDemandeForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowDemandeDialog(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreateDemande}
              disabled={creatingDemande || !demandeForm.nom.trim()}
            >
              {creatingDemande ? (
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
              ) : null}
              Soumettre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ProPrestatairesTab;
