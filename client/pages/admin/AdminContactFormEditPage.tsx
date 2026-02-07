import { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GripVertical,
  Settings,
  Eye,
  Palette,
  Bell,
  Mail,
  ExternalLink,
  Copy,
  Image,
  Type,
  AlignLeft,
  AtSign,
  Phone,
  Hash,
  List,
  CheckSquare,
  Calendar,
  Clock,
  Upload,
  Globe,
  MapPin,
  Star,
  EyeOff,
  ImagePlus,
  X,
  Loader2,
  Heading,
  FileText,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import {
  getAdminContactForm,
  updateAdminContactForm,
  addAdminContactFormField,
  updateAdminContactFormField,
  deleteAdminContactFormField,
  reorderAdminContactFormFields,
  type ContactForm,
  type ContactFormField,
  type ContactFormFieldType,
} from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// Image Uploader Component
function ImageUploader({
  value,
  onChange,
  label,
  description,
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  label: string;
  description?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      onChange(data.url);
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {value ? (
        <div className="relative group">
          <img
            src={value}
            alt={label}
            className="w-full h-40 object-cover rounded-lg border"
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="w-4 h-4 mr-1" />
              Changer
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => onChange(null)}
            >
              <X className="w-4 h-4 mr-1" />
              Supprimer
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Téléchargement...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <ImagePlus className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm font-medium">Télécharger une image</p>
              <p className="text-xs text-muted-foreground">PNG, JPG jusqu'à 5 MB</p>
            </div>
          )}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
        disabled={uploading}
      />
      {/* Fallback URL input */}
      <div className="flex gap-2 items-center">
        <span className="text-xs text-muted-foreground">ou</span>
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="https://..."
          className="flex-1 text-xs"
        />
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

const FIELD_TYPES: { value: ContactFormFieldType; label: string; icon: React.ReactNode }[] = [
  { value: "heading", label: "Titre", icon: <Heading className="w-4 h-4" /> },
  { value: "paragraph", label: "Description", icon: <FileText className="w-4 h-4" /> },
  { value: "text", label: "Texte court", icon: <Type className="w-4 h-4" /> },
  { value: "textarea", label: "Texte long", icon: <AlignLeft className="w-4 h-4" /> },
  { value: "email", label: "Email", icon: <AtSign className="w-4 h-4" /> },
  { value: "phone", label: "Téléphone", icon: <Phone className="w-4 h-4" /> },
  { value: "number", label: "Nombre", icon: <Hash className="w-4 h-4" /> },
  { value: "select", label: "Liste déroulante", icon: <List className="w-4 h-4" /> },
  { value: "radio", label: "Choix unique", icon: <CheckSquare className="w-4 h-4" /> },
  { value: "checkbox", label: "Choix multiples", icon: <CheckSquare className="w-4 h-4" /> },
  { value: "date", label: "Date", icon: <Calendar className="w-4 h-4" /> },
  { value: "time", label: "Heure", icon: <Clock className="w-4 h-4" /> },
  { value: "datetime", label: "Date et heure", icon: <Calendar className="w-4 h-4" /> },
  { value: "file", label: "Fichier", icon: <Upload className="w-4 h-4" /> },
  { value: "country", label: "Pays", icon: <Globe className="w-4 h-4" /> },
  { value: "google_place", label: "Adresse Google", icon: <MapPin className="w-4 h-4" /> },
  { value: "rating", label: "Notation", icon: <Star className="w-4 h-4" /> },
  { value: "hidden", label: "Champ caché", icon: <EyeOff className="w-4 h-4" /> },
];

export default function AdminContactFormEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [form, setForm] = useState<ContactForm | null>(null);
  const [fields, setFields] = useState<ContactFormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Field dialogs
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [editField, setEditField] = useState<ContactFormField | null>(null);
  const [deleteField, setDeleteField] = useState<ContactFormField | null>(null);

  // Form editing state (local changes)
  const [formChanges, setFormChanges] = useState<Partial<ContactForm>>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const loadForm = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { form: data } = await getAdminContactForm(undefined, id);
      setForm(data);
      setFields(data.fields || []);
      setFormChanges({});
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de charger le formulaire",
        variant: "destructive",
      });
      navigate("/admin/contact-forms");
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  const handleSave = async () => {
    if (!id || Object.keys(formChanges).length === 0) return;
    setSaving(true);
    try {
      const { form: updated } = await updateAdminContactForm(undefined, id, formChanges);
      setForm(updated);
      setFormChanges({});
      toast({ title: "Formulaire enregistré" });
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer le formulaire",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleFieldAdd = async (fieldType: ContactFormFieldType) => {
    if (!id) return;
    try {
      const typeInfo = FIELD_TYPES.find((t) => t.value === fieldType);
      const { field } = await addAdminContactFormField(undefined, id, {
        field_type: fieldType,
        label: typeInfo?.label || "Nouveau champ",
        is_required: false,
        width: "full",
      });
      setFields((prev) => [...prev, field]);
      setAddFieldOpen(false);
      setEditField(field);
      toast({ title: "Champ ajouté" });
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter le champ",
        variant: "destructive",
      });
    }
  };

  const handleFieldUpdate = async (fieldId: string, updates: Partial<ContactFormField>) => {
    try {
      const { field } = await updateAdminContactFormField(undefined, fieldId, updates);
      setFields((prev) => prev.map((f) => (f.id === fieldId ? field : f)));
      toast({ title: "Champ modifié" });
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de modifier le champ",
        variant: "destructive",
      });
    }
  };

  const handleFieldDelete = async () => {
    if (!deleteField) return;
    try {
      await deleteAdminContactFormField(undefined, deleteField.id);
      setFields((prev) => prev.filter((f) => f.id !== deleteField.id));
      setDeleteField(null);
      toast({ title: "Champ supprimé" });
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le champ",
        variant: "destructive",
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !id) return;

    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);

    const newFields = arrayMove(fields, oldIndex, newIndex);
    setFields(newFields);

    try {
      await reorderAdminContactFormFields(
        undefined,
        id,
        newFields.map((f) => f.id)
      );
    } catch (err) {
      console.error(err);
      // Revert on error
      setFields(fields);
    }
  };

  const updateFormField = (key: keyof ContactForm, value: unknown) => {
    setFormChanges((prev) => ({ ...prev, [key]: value }));
  };

  const currentForm = { ...form, ...formChanges } as ContactForm;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!form) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/contact-forms")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{form.name}</h1>
            <p className="text-sm text-muted-foreground">
              sam.ma/form/{form.slug}
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 h-6"
                onClick={() => {
                  navigator.clipboard.writeText(`https://sam.ma/form/${form.slug}`);
                  toast({ title: "Lien copié" });
                }}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => window.open(`/form/${form.slug}`, "_blank")}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Prévisualiser
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || Object.keys(formChanges).length === 0}
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="fields" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fields">
            <Settings className="w-4 h-4 mr-2" />
            Champs
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="w-4 h-4 mr-2" />
            Apparence
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Bell className="w-4 h-4 mr-2" />
            Paramètres
          </TabsTrigger>
        </TabsList>

        {/* Fields Tab */}
        <TabsContent value="fields" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Champs du formulaire</h2>
            <Button onClick={() => setAddFieldOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un champ
            </Button>
          </div>

          {fields.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">
                  Aucun champ ajouté. Commencez par ajouter des champs à votre formulaire.
                </p>
                <Button onClick={() => setAddFieldOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter un champ
                </Button>
              </CardContent>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={fields.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {fields.map((field) => (
                    <SortableFieldItem
                      key={field.id}
                      field={field}
                      onEdit={() => setEditField(field)}
                      onDelete={() => setDeleteField(field)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Section Hero</CardTitle>
              <CardDescription>
                Personnalisez l'en-tête de votre formulaire
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Afficher la section Hero</Label>
                <Switch
                  checked={currentForm.show_hero}
                  onCheckedChange={(v) => updateFormField("show_hero", v)}
                />
              </div>

              {currentForm.show_hero && (
                <>
                  <div className="space-y-2">
                    <Label>Titre</Label>
                    <Input
                      value={currentForm.hero_title}
                      onChange={(e) => updateFormField("hero_title", e.target.value)}
                      placeholder="Besoin d'informations ?"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Sous-titre</Label>
                    <Textarea
                      value={currentForm.hero_subtitle || ""}
                      onChange={(e) => updateFormField("hero_subtitle", e.target.value)}
                      placeholder="Contactez-nous ! Notre équipe vous répond rapidement."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Couleur de fond</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={currentForm.hero_background_color}
                          onChange={(e) => updateFormField("hero_background_color", e.target.value)}
                          className="w-12 h-10 p-1"
                        />
                        <Input
                          value={currentForm.hero_background_color}
                          onChange={(e) => updateFormField("hero_background_color", e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Couleur du texte</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={currentForm.hero_text_color}
                          onChange={(e) => updateFormField("hero_text_color", e.target.value)}
                          className="w-12 h-10 p-1"
                        />
                        <Input
                          value={currentForm.hero_text_color}
                          onChange={(e) => updateFormField("hero_text_color", e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  <ImageUploader
                    value={currentForm.hero_image_url}
                    onChange={(url) => updateFormField("hero_image_url", url)}
                    label="Image d'illustration"
                    description="Image affichée dans la section hero (recommandé: 800x600px)"
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Logo</CardTitle>
              <CardDescription>
                Ajoutez un logo personnalisé à votre formulaire
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Afficher le logo</Label>
                <Switch
                  checked={currentForm.show_logo}
                  onCheckedChange={(v) => updateFormField("show_logo", v)}
                />
              </div>

              {currentForm.show_logo && (
                <>
                  <ImageUploader
                    value={currentForm.logo_url}
                    onChange={(url) => updateFormField("logo_url", url)}
                    label="Image du logo"
                    description="Format recommandé: PNG transparent (200x80px)"
                  />

                  <Separator />

                  <div className="space-y-2">
                    <Label>Titre sous le logo</Label>
                    <Input
                      value={currentForm.logo_title || ""}
                      onChange={(e) => updateFormField("logo_title", e.target.value)}
                      placeholder="Nom de l'entreprise"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description sous le logo</Label>
                    <Textarea
                      value={currentForm.logo_description || ""}
                      onChange={(e) => updateFormField("logo_description", e.target.value)}
                      placeholder="Votre slogan ou courte description..."
                      rows={2}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Formulaire</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Titre du formulaire (optionnel)</Label>
                <Input
                  value={currentForm.form_title || ""}
                  onChange={(e) => updateFormField("form_title", e.target.value)}
                  placeholder="Envoyez-nous un message"
                />
              </div>

              <div className="space-y-2">
                <Label>Texte du bouton</Label>
                <Input
                  value={currentForm.submit_button_text}
                  onChange={(e) => updateFormField("submit_button_text", e.target.value)}
                  placeholder="Envoyer le message"
                />
              </div>

              <div className="space-y-2">
                <Label>Couleur du bouton</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={currentForm.submit_button_color}
                    onChange={(e) => updateFormField("submit_button_color", e.target.value)}
                    className="w-12 h-10 p-1"
                  />
                  <Input
                    value={currentForm.submit_button_color}
                    onChange={(e) => updateFormField("submit_button_color", e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Mise en page</Label>
                <Select
                  value={currentForm.layout}
                  onValueChange={(v) => updateFormField("layout", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="split">Split (Hero à gauche)</SelectItem>
                    <SelectItem value="centered">Centré</SelectItem>
                    <SelectItem value="full-width">Pleine largeur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Message de succès</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Message après soumission</Label>
                <Textarea
                  value={currentForm.success_message}
                  onChange={(e) => updateFormField("success_message", e.target.value)}
                  placeholder="Merci ! Votre message a bien été envoyé."
                />
              </div>

              <div className="space-y-2">
                <Label>URL de redirection (optionnel)</Label>
                <Input
                  value={currentForm.success_redirect_url || ""}
                  onChange={(e) => updateFormField("success_redirect_url", e.target.value)}
                  placeholder="https://sam.ma/merci"
                />
                <p className="text-xs text-muted-foreground">
                  Laisser vide pour afficher le message de succès
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informations générales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nom du formulaire</Label>
                <Input
                  value={formChanges.name ?? form.name}
                  onChange={(e) => updateFormField("name", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Slug (URL)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">sam.ma/form/</span>
                  <Input
                    value={formChanges.slug ?? form.slug}
                    onChange={(e) =>
                      updateFormField(
                        "slug",
                        e.target.value.toLowerCase().replace(/\s+/g, "-")
                      )
                    }
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description (interne)</Label>
                <Textarea
                  value={formChanges.description ?? form.description ?? ""}
                  onChange={(e) => updateFormField("description", e.target.value)}
                  placeholder="Description pour usage interne..."
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Formulaire actif</Label>
                  <p className="text-xs text-muted-foreground">
                    Désactiver pour masquer le formulaire publiquement
                  </p>
                </div>
                <Switch
                  checked={formChanges.is_active ?? form.is_active}
                  onCheckedChange={(v) => updateFormField("is_active", v)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Recevez une notification à chaque nouvelle soumission
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Activer les notifications</Label>
                <Switch
                  checked={formChanges.notify_on_submission ?? form.notify_on_submission}
                  onCheckedChange={(v) => updateFormField("notify_on_submission", v)}
                />
              </div>

              {(formChanges.notify_on_submission ?? form.notify_on_submission) && (
                <div className="space-y-2">
                  <Label>Emails de notification</Label>
                  <Textarea
                    value={(formChanges.notification_emails ?? form.notification_emails ?? []).join("\n")}
                    onChange={(e) =>
                      updateFormField(
                        "notification_emails",
                        e.target.value.split("\n").filter((v) => v.trim())
                      )
                    }
                    placeholder="email1@example.com&#10;email2@example.com"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Un email par ligne
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email de confirmation</CardTitle>
              <CardDescription>
                Envoyez un email automatique au visiteur après soumission
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Envoyer un email de confirmation</Label>
                <Switch
                  checked={formChanges.send_confirmation_email ?? form.send_confirmation_email}
                  onCheckedChange={(v) => updateFormField("send_confirmation_email", v)}
                />
              </div>

              {(formChanges.send_confirmation_email ?? form.send_confirmation_email) && (
                <>
                  <div className="space-y-2">
                    <Label>Objet de l'email</Label>
                    <Input
                      value={formChanges.confirmation_email_subject ?? form.confirmation_email_subject ?? ""}
                      onChange={(e) => updateFormField("confirmation_email_subject", e.target.value)}
                      placeholder="Merci pour votre message"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Contenu de l'email</Label>
                    <Textarea
                      value={formChanges.confirmation_email_body ?? form.confirmation_email_body ?? ""}
                      onChange={(e) => updateFormField("confirmation_email_body", e.target.value)}
                      placeholder="Bonjour {{name}}, nous avons bien reçu votre message..."
                      rows={5}
                    />
                    <p className="text-xs text-muted-foreground">
                      Utilisez {"{{name}}"} pour insérer le nom du visiteur
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SEO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Meta titre</Label>
                <Input
                  value={formChanges.meta_title ?? form.meta_title ?? ""}
                  onChange={(e) => updateFormField("meta_title", e.target.value)}
                  placeholder="Contactez-nous | Sortir Au Maroc"
                />
              </div>

              <div className="space-y-2">
                <Label>Meta description</Label>
                <Textarea
                  value={formChanges.meta_description ?? form.meta_description ?? ""}
                  onChange={(e) => updateFormField("meta_description", e.target.value)}
                  placeholder="Contactez notre équipe pour toute question..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Field Dialog */}
      <Dialog open={addFieldOpen} onOpenChange={setAddFieldOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un champ</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-4">
            {FIELD_TYPES.map((type) => (
              <Button
                key={type.value}
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => handleFieldAdd(type.value)}
              >
                {type.icon}
                <span className="ml-2">{type.label}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Field Dialog */}
      {editField && (
        <FieldEditDialog
          field={editField}
          onClose={() => setEditField(null)}
          onSave={(updates) => {
            handleFieldUpdate(editField.id, updates);
            setEditField(null);
          }}
        />
      )}

      {/* Delete Field Alert */}
      <AlertDialog open={!!deleteField} onOpenChange={() => setDeleteField(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce champ ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le champ "{deleteField?.label}" sera supprimé définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFieldDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Sortable Field Item
function SortableFieldItem({
  field,
  onEdit,
  onDelete,
}: {
  field: ContactFormField;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const typeInfo = FIELD_TYPES.find((t) => t.value === field.field_type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-3 bg-white rounded-lg border hover:border-primary/50 transition-colors"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-2 flex-1">
        <span className="text-muted-foreground">{typeInfo?.icon}</span>
        <span className="font-medium">{field.label}</span>
        {field.is_required && (
          <Badge variant="secondary" className="text-xs">
            Requis
          </Badge>
        )}
        <Badge variant="outline" className="text-xs">
          {typeInfo?.label}
        </Badge>
        {field.width !== "full" && (
          <Badge variant="outline" className="text-xs">
            {field.width === "half" ? "1/2" : "1/3"}
          </Badge>
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={onEdit}>
        <Settings className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onDelete}>
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}

// Field Edit Dialog
function FieldEditDialog({
  field,
  onClose,
  onSave,
}: {
  field: ContactFormField;
  onClose: () => void;
  onSave: (updates: Partial<ContactFormField>) => void;
}) {
  const [local, setLocal] = useState<Partial<ContactFormField>>({ ...field });

  const update = (key: keyof ContactFormField, value: unknown) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const needsOptions = ["select", "radio", "checkbox"].includes(field.field_type);
  const isPhone = field.field_type === "phone";
  const isFile = field.field_type === "file";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le champ</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Label</Label>
            <Input
              value={local.label ?? ""}
              onChange={(e) => update("label", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Placeholder</Label>
            <Input
              value={local.placeholder ?? ""}
              onChange={(e) => update("placeholder", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Texte d'aide</Label>
            <Input
              value={local.helper_text ?? ""}
              onChange={(e) => update("helper_text", e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Champ requis</Label>
            <Switch
              checked={local.is_required ?? false}
              onCheckedChange={(v) => update("is_required", v)}
            />
          </div>

          <div className="space-y-2">
            <Label>Largeur</Label>
            <Select
              value={local.width ?? "full"}
              onValueChange={(v) => update("width", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Pleine largeur</SelectItem>
                <SelectItem value="half">Demi largeur</SelectItem>
                <SelectItem value="third">Tiers</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {needsOptions && (
            <div className="space-y-2">
              <Label>Options</Label>
              <Textarea
                value={(local.options || []).map((o) => o.label).join("\n")}
                onChange={(e) => {
                  const lines = e.target.value.split("\n");
                  update(
                    "options",
                    lines.map((label) => ({
                      value: label.toLowerCase().replace(/\s+/g, "_"),
                      label,
                    }))
                  );
                }}
                placeholder="Option 1&#10;Option 2&#10;Option 3"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">Une option par ligne</p>
            </div>
          )}

          {isPhone && (
            <div className="space-y-2">
              <Label>Indicatif par défaut</Label>
              <Input
                value={local.default_country_code ?? "+212"}
                onChange={(e) => update("default_country_code", e.target.value)}
                placeholder="+212"
              />
            </div>
          )}

          {isFile && (
            <>
              <div className="space-y-2">
                <Label>Types de fichiers autorisés</Label>
                <Input
                  value={(local.allowed_file_types || []).join(", ")}
                  onChange={(e) =>
                    update(
                      "allowed_file_types",
                      e.target.value.split(",").map((v) => v.trim())
                    )
                  }
                  placeholder="image/*, application/pdf"
                />
              </div>

              <div className="space-y-2">
                <Label>Taille max (MB)</Label>
                <Input
                  type="number"
                  value={local.max_file_size_mb ?? 5}
                  onChange={(e) => update("max_file_size_mb", parseInt(e.target.value))}
                />
              </div>
            </>
          )}

          {["text", "textarea"].includes(field.field_type) && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min caractères</Label>
                <Input
                  type="number"
                  value={local.min_length ?? ""}
                  onChange={(e) =>
                    update("min_length", e.target.value ? parseInt(e.target.value) : null)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max caractères</Label>
                <Input
                  type="number"
                  value={local.max_length ?? ""}
                  onChange={(e) =>
                    update("max_length", e.target.value ? parseInt(e.target.value) : null)
                  }
                />
              </div>
            </div>
          )}

          {field.field_type === "number" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valeur min</Label>
                <Input
                  type="number"
                  value={local.min_value ?? ""}
                  onChange={(e) =>
                    update("min_value", e.target.value ? parseFloat(e.target.value) : null)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Valeur max</Label>
                <Input
                  type="number"
                  value={local.max_value ?? ""}
                  onChange={(e) =>
                    update("max_value", e.target.value ? parseFloat(e.target.value) : null)
                  }
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => onSave(local)}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
