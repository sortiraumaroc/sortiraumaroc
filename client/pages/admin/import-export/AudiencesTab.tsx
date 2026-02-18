import { useCallback, useEffect, useRef, useState } from "react";
import {
  Edit,
  Eye,
  Loader2,
  Plus,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { useToast } from "@/hooks/use-toast";
import { formatDateFr } from "@/lib/shared/utils";

type Audience = {
  id: string;
  name: string;
  description: string | null;
  filters: AudienceFilters;
  is_dynamic: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
};

type AudienceFilters = {
  cities?: string[];
  countries?: string[];
  genders?: string[];
  csp_list?: string[];
  age_min?: number;
  age_max?: number;
  interests?: string[];
};

type AudienceMember = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  country: string | null;
  age: number | null;
  gender: string | null;
  source?: string | null;
};

// Hardcoded countries and cities
const COUNTRIES = [
  { code: "MA", name: "Maroc", flag: "🇲🇦" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "AE", name: "Émirats Arabes Unis", flag: "🇦🇪" },
  { code: "BE", name: "Belgique", flag: "🇧🇪" },
  { code: "CH", name: "Suisse", flag: "🇨🇭" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
];

const CITIES: Record<string, string[]> = {
  MA: ["Casablanca", "Marrakech", "Rabat", "Tanger", "Agadir", "Essaouira", "Fès", "Meknès", "Tétouan", "Oujda", "Al Hoceima", "Ouarzazate", "Dakhla", "Kénitra", "Mohammedia", "Ifrane", "Salé", "El Jadida", "Khouribga", "Béni Mellal"],
  FR: ["Paris", "Lyon", "Marseille", "Bordeaux", "Nice", "Toulouse", "Nantes", "Strasbourg", "Lille", "Montpellier"],
  AE: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"],
  BE: ["Bruxelles", "Anvers", "Gand", "Liège"],
  CH: ["Genève", "Zurich", "Lausanne", "Berne"],
  CA: ["Montréal", "Toronto", "Vancouver", "Ottawa"],
};

const CSP_OPTIONS = [
  { value: "csp+", label: "CSP+" },
  { value: "csp", label: "CSP" },
  { value: "etudiant", label: "Étudiant" },
  { value: "retraite", label: "Retraité" },
];

const INTEREST_OPTIONS = [
  "restaurants",
  "sport",
  "loisirs",
  "culture",
  "hébergement",
  "shopping",
  "wellness",
  "gastronomie",
  "voyage",
];

export function AudiencesTab() {
  const { toast } = useToast();

  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAudience, setEditingAudience] = useState<Audience | null>(null);
  const [form, setForm] = useState({
    name: "",
    is_dynamic: true,
    filters: {
      cities: [] as string[],
      countries: [] as string[],
      gender: "all" as "all" | "male" | "female",
      csp_list: [] as string[],
      age_range: [18, 77] as [number, number],
      interests: [] as string[],
    },
  });
  const [saving, setSaving] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Members dialog
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [viewingAudience, setViewingAudience] = useState<Audience | null>(null);
  const [members, setMembers] = useState<AudienceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersPage, setMembersPage] = useState(1);
  const [membersTotalPages, setMembersTotalPages] = useState(1);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAudience, setDeletingAudience] = useState<Audience | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load to prospects
  const [loadingToProspects, setLoadingToProspects] = useState<string | null>(null);

  const loadAudiences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/newsletter/audiences", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setAudiences(data.items);
        }
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les audiences", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadAudiences();
  }, [loadAudiences]);

  // Auto-preview when filters change
  const triggerAutoPreview = useCallback(() => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }
    previewTimeoutRef.current = setTimeout(() => {
      void handlePreviewFilters();
    }, 300);
  }, []);

  const handlePreviewFilters = async () => {
    setPreviewLoading(true);
    try {
      const filters: Record<string, unknown> = {};
      if (form.filters.gender !== "all") {
        filters.genders = [form.filters.gender];
      }
      if (form.filters.csp_list.length > 0) filters.csp_list = form.filters.csp_list;
      if (form.filters.cities.length > 0) filters.cities = form.filters.cities;
      if (form.filters.countries.length > 0) filters.countries = form.filters.countries;
      if (form.filters.age_range[0] > 18) filters.age_min = form.filters.age_range[0];
      if (form.filters.age_range[1] < 77) filters.age_max = form.filters.age_range[1];
      if (form.filters.interests.length > 0) filters.interests = form.filters.interests;

      const res = await fetch("/api/admin/newsletter/preview-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ filters }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setPreviewCount(data.count);
        }
      }
    } catch {
      // Ignore
    } finally {
      setPreviewLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: "",
      is_dynamic: true,
      filters: {
        cities: [],
        countries: [],
        gender: "all",
        csp_list: [],
        age_range: [18, 77],
        interests: [],
      },
    });
    setPreviewCount(null);
    setEditingAudience(null);
  };

  const handleCreate = () => {
    resetForm();
    setDialogOpen(true);
    // Trigger initial preview
    setTimeout(() => void handlePreviewFilters(), 100);
  };

  const handleEdit = (audience: Audience) => {
    setEditingAudience(audience);
    const genders = audience.filters.genders || [];
    let gender: "all" | "male" | "female" = "all";
    if (genders.includes("male") && !genders.includes("female")) gender = "male";
    else if (genders.includes("female") && !genders.includes("male")) gender = "female";

    setForm({
      name: audience.name,
      is_dynamic: audience.is_dynamic,
      filters: {
        cities: audience.filters.cities || [],
        countries: audience.filters.countries || [],
        gender,
        csp_list: audience.filters.csp_list || [],
        age_range: [audience.filters.age_min || 18, audience.filters.age_max || 77],
        interests: audience.filters.interests || [],
      },
    });
    setPreviewCount(audience.member_count);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Erreur", description: "Le nom est requis", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const method = editingAudience ? "PUT" : "POST";
      const url = editingAudience
        ? `/api/admin/newsletter/audiences/${editingAudience.id}`
        : "/api/admin/newsletter/audiences";

      // Convert form to API format
      const filters: Record<string, unknown> = {};
      if (form.filters.gender !== "all") {
        filters.genders = [form.filters.gender];
      }
      if (form.filters.csp_list.length > 0) filters.csp_list = form.filters.csp_list;
      if (form.filters.cities.length > 0) filters.cities = form.filters.cities;
      if (form.filters.countries.length > 0) filters.countries = form.filters.countries;
      if (form.filters.age_range[0] > 18) filters.age_min = form.filters.age_range[0];
      if (form.filters.age_range[1] < 77) filters.age_max = form.filters.age_range[1];
      if (form.filters.interests.length > 0) filters.interests = form.filters.interests;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name,
          description: null,
          is_dynamic: form.is_dynamic,
          filters,
        }),
      });

      if (res.ok) {
        toast({ title: "Succès", description: editingAudience ? "Audience mise à jour" : "Audience créée" });
        setDialogOpen(false);
        void loadAudiences();
      } else {
        const data = await res.json();
        toast({ title: "Erreur", description: data.error || "Erreur lors de l'enregistrement", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Erreur lors de l'enregistrement", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingAudience) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/newsletter/audiences/${deletingAudience.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        toast({ title: "Succès", description: "Audience supprimée" });
        setDeleteDialogOpen(false);
        void loadAudiences();
      } else {
        const data = await res.json();
        toast({ title: "Erreur", description: data.error || "Erreur lors de la suppression", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Erreur lors de la suppression", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleViewMembers = async (audience: Audience) => {
    setViewingAudience(audience);
    setMembersPage(1);
    setMembersDialogOpen(true);
    await loadMembers(audience.id, 1);
  };

  const loadMembers = async (audienceId: string, page: number) => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/admin/newsletter/audiences/${audienceId}/members?page=${page}&limit=20`, {
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setMembers(data.items);
          setMembersTotalPages(data.totalPages);
        }
      }
    } catch {
      // Ignore
    } finally {
      setMembersLoading(false);
    }
  };

  const handleLoadToProspects = async (audience: Audience) => {
    setLoadingToProspects(audience.id);
    try {
      const res = await fetch(`/api/admin/newsletter/audiences/${audience.id}/load-to-prospects`, {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          toast({
            title: "Succès",
            description: `${data.count} contact(s) chargé(s) dans les prospects`,
          });
        }
      } else {
        const data = await res.json();
        toast({ title: "Erreur", description: data.error || "Erreur lors du chargement", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Erreur lors du chargement", variant: "destructive" });
    } finally {
      setLoadingToProspects(null);
    }
  };

  const toggleArrayValue = (arr: string[], value: string): string[] => {
    if (arr.includes(value)) {
      return arr.filter(v => v !== value);
    }
    return [...arr, value];
  };

  // Get available cities based on selected countries
  const getAvailableCities = () => {
    if (form.filters.countries.length === 0) {
      return Object.values(CITIES).flat();
    }
    return form.filters.countries.flatMap(code => CITIES[code] || []);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Audiences</CardTitle>
              <CardDescription>
                Créez des segments de contacts pour vos campagnes emailing
              </CardDescription>
            </div>
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Nouvelle audience
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Membres</TableHead>
                  <TableHead>Créée le</TableHead>
                  <TableHead className="w-[180px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : audiences.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Aucune audience créée
                    </TableCell>
                  </TableRow>
                ) : (
                  audiences.map((audience) => (
                    <TableRow key={audience.id}>
                      <TableCell className="font-medium">{audience.name}</TableCell>
                      <TableCell>
                        <Badge variant={audience.is_dynamic ? "default" : "secondary"}>
                          {audience.is_dynamic ? "Dynamique" : "Statique"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {audience.member_count}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateFr(audience.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewMembers(audience)}
                            title="Voir les membres"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(audience)}
                            title="Modifier"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleLoadToProspects(audience)}
                            disabled={loadingToProspects === audience.id}
                            title="Charger dans les prospects"
                          >
                            {loadingToProspects === audience.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setDeletingAudience(audience);
                              setDeleteDialogOpen(true);
                            }}
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog - Redesigned */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl">
                {editingAudience ? "Modifier l'audience" : "Créer une audience"}
              </DialogTitle>
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg">
                <Users className="h-4 w-4 text-slate-500 flex-shrink-0" />
                <span className="font-semibold tabular-nums">
                  {previewLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    (previewCount ?? 0).toLocaleString("fr-FR")
                  )}
                </span>
                <span className="text-sm text-slate-500 flex-shrink-0">contacts</span>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4 space-y-6">
            {/* Name + Dynamic toggle on same row */}
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <Label className="text-sm font-medium mb-2 block">Nom de l'audience</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Femmes CSP+ Casablanca"
                  className="h-10"
                />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Switch
                  id="dynamic"
                  checked={form.is_dynamic}
                  onCheckedChange={(v) => setForm(f => ({ ...f, is_dynamic: v }))}
                />
                <Label htmlFor="dynamic" className="text-sm whitespace-nowrap">
                  Dynamique
                </Label>
              </div>
            </div>

            {/* Filters Grid - 2 columns */}
            <div className="grid grid-cols-2 gap-6">
              {/* Left column */}
              <div className="space-y-5">
                {/* Genre */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Genre</Label>
                  <div className="flex gap-2">
                    {[
                      { value: "all" as const, label: "Tous" },
                      { value: "male" as const, label: "Homme" },
                      { value: "female" as const, label: "Femme" },
                    ].map((g) => (
                      <button
                        key={g.value}
                        type="button"
                        onClick={() => {
                          setForm(f => ({ ...f, filters: { ...f.filters, gender: g.value } }));
                          triggerAutoPreview();
                        }}
                        className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                          form.filters.gender === g.value
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white hover:bg-slate-50 border-slate-200'
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Age Range Slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Tranche d'âge</Label>
                    <span className="text-sm text-slate-600 font-medium">
                      {form.filters.age_range[0]} - {form.filters.age_range[1]} ans
                    </span>
                  </div>
                  <Slider
                    value={form.filters.age_range}
                    onValueChange={(value) => {
                      setForm(f => ({ ...f, filters: { ...f.filters, age_range: value as [number, number] } }));
                      triggerAutoPreview();
                    }}
                    min={18}
                    max={77}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>18 ans</span>
                    <span>77 ans</span>
                  </div>
                </div>

                {/* CSP */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Catégorie socio-professionnelle</Label>
                  <div className="flex flex-wrap gap-2">
                    {CSP_OPTIONS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => {
                          setForm(f => ({
                            ...f,
                            filters: { ...f.filters, csp_list: toggleArrayValue(f.filters.csp_list, c.value) }
                          }));
                          triggerAutoPreview();
                        }}
                        className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                          form.filters.csp_list.includes(c.value)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white hover:bg-slate-50 border-slate-200'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Centres d'intérêt */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Centres d'intérêt</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {INTEREST_OPTIONS.map((interest) => (
                      <button
                        key={interest}
                        type="button"
                        onClick={() => {
                          setForm(f => ({
                            ...f,
                            filters: { ...f.filters, interests: toggleArrayValue(f.filters.interests, interest) }
                          }));
                          triggerAutoPreview();
                        }}
                        className={`px-2.5 py-1 text-xs rounded-full border capitalize transition-colors ${
                          form.filters.interests.includes(interest)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white hover:bg-slate-50 border-slate-200'
                        }`}
                      >
                        {interest}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right column - Location */}
              <div className="space-y-5">
                {/* Pays */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Pays</Label>
                  <div className="flex flex-wrap gap-2">
                    {COUNTRIES.map((country) => (
                      <button
                        key={country.code}
                        type="button"
                        onClick={() => {
                          const newCountries = toggleArrayValue(form.filters.countries, country.code);
                          // Clear cities that are not in selected countries
                          const validCities = newCountries.length === 0
                            ? Object.values(CITIES).flat()
                            : newCountries.flatMap(code => CITIES[code] || []);
                          const filteredCities = form.filters.cities.filter(city => validCities.includes(city));
                          setForm(f => ({
                            ...f,
                            filters: { ...f.filters, countries: newCountries, cities: filteredCities }
                          }));
                          triggerAutoPreview();
                        }}
                        className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                          form.filters.countries.includes(country.code)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white hover:bg-slate-50 border-slate-200'
                        }`}
                      >
                        <span className="me-1">{country.flag}</span>
                        {country.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Villes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Villes</Label>
                    {form.filters.cities.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setForm(f => ({ ...f, filters: { ...f.filters, cities: [] } }));
                          triggerAutoPreview();
                        }}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        Tout effacer
                      </button>
                    )}
                  </div>

                  {/* Selected cities as tags */}
                  {form.filters.cities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {form.filters.cities.map(city => (
                        <span
                          key={city}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-primary text-white rounded-full"
                        >
                          {city}
                          <button
                            type="button"
                            onClick={() => {
                              setForm(f => ({
                                ...f,
                                filters: { ...f.filters, cities: f.filters.cities.filter(c => c !== city) }
                              }));
                              triggerAutoPreview();
                            }}
                            className="hover:opacity-70"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* City selection */}
                  <div className="border rounded-lg p-2 max-h-[180px] overflow-y-auto bg-slate-50/50">
                    {form.filters.countries.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-2">
                        Sélectionnez un pays pour filtrer les villes
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {getAvailableCities()
                          .filter(city => !form.filters.cities.includes(city))
                          .map((city) => (
                            <button
                              key={city}
                              type="button"
                              onClick={() => {
                                setForm(f => ({
                                  ...f,
                                  filters: { ...f.filters, cities: [...f.filters.cities, city] }
                                }));
                                triggerAutoPreview();
                              }}
                              className="px-2.5 py-1 text-xs rounded-full border bg-white hover:bg-slate-100 border-slate-200 transition-colors"
                            >
                              {city}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {form.filters.cities.length === 0
                      ? "Toutes les villes"
                      : `${form.filters.cities.length} ville(s) sélectionnée(s)`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              {editingAudience ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Membres de l'audience</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {viewingAudience?.name} - {viewingAudience?.member_count} membre(s)
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Pays</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Âge</TableHead>
                  <TableHead>Genre</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membersLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Aucun membre
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((member) => {
                    const source = member.source || "newsletter";
                    const sourceStyles: Record<string, { bg: string; text: string; label: string }> = {
                      "newsletter": { bg: "bg-green-100", text: "text-green-700", label: "Abonné" },
                      "import": { bg: "bg-blue-100", text: "text-blue-700", label: "Importé" },
                      "manual": { bg: "bg-purple-100", text: "text-purple-700", label: "Manuel" },
                    };
                    const style = sourceStyles[source.toLowerCase()] || { bg: "bg-gray-100", text: "text-gray-700", label: source };

                    return (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.email}</TableCell>
                        <TableCell>
                          {member.first_name || member.last_name
                            ? `${member.first_name || ""} ${member.last_name || ""}`.trim()
                            : "-"}
                        </TableCell>
                        <TableCell>{member.city || "-"}</TableCell>
                        <TableCell>{member.country || "-"}</TableCell>
                        <TableCell>
                          <Badge className={`${style.bg} ${style.text}`}>
                            {style.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{member.age || "-"}</TableCell>
                        <TableCell>
                          {member.gender === "male" ? "H" : member.gender === "female" ? "F" : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {membersTotalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                disabled={membersPage <= 1 || membersLoading}
                onClick={() => {
                  setMembersPage(p => p - 1);
                  if (viewingAudience) loadMembers(viewingAudience.id, membersPage - 1);
                }}
              >
                Précédent
              </Button>
              <span className="flex items-center px-3 text-sm">
                Page {membersPage} / {membersTotalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={membersPage >= membersTotalPages || membersLoading}
                onClick={() => {
                  setMembersPage(p => p + 1);
                  if (viewingAudience) loadMembers(viewingAudience.id, membersPage + 1);
                }}
              >
                Suivant
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setMembersDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'audience ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'audience "{deletingAudience?.name}" sera supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
