import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Tags,
  Loader2,
  Save,
  RefreshCw,
  Utensils,
  Sparkles,
  Building2,
  X,
  Plus,
  ChefHat,
  Palette,
  Settings2,
  Search,
} from "lucide-react";
import { loadAdminSessionToken } from "@/lib/adminApi";

// Tag configuration by universe
const TAG_CONFIG: Record<string, {
  specialties: string[];
  tags: string[];
  amenities: string[];
  ambiance: string[];
}> = {
  restaurants: {
    specialties: [
      "Marocain", "Méditerranéen", "Italien", "Japonais", "Asiatique", "Français",
      "Healthy", "Grillades", "Seafood", "Brunch", "Végétarien", "Vegan",
      "Pâtisserie", "Café", "Oriental", "Libanais", "Mexicain", "Indien",
      "Steakhouse", "Fusion", "Gastronomique", "Street food"
    ],
    tags: [
      "Nouveau", "Tendance", "Incontournable", "Bon plan", "Coup de cœur", "Premium",
      "Brunch", "Déjeuner", "Dîner", "Afterwork", "Rooftop", "Shisha",
      "Live music", "DJ", "Idéal en couple", "Entre amis", "Familial",
      "Business", "Groupe", "Anniversaire", "Terrasse", "Vue", "Instagrammable"
    ],
    amenities: [
      "Wi-Fi", "Parking", "Valet", "Climatisation", "Accès PMR", "Paiement carte",
      "Terrasse", "Vue mer", "Vue", "Menu kids", "Chaise bébé",
      "Options végétariennes", "Options vegan", "Sans gluten", "Halal",
      "Cocktails", "Happy hour", "Musique live", "Salle privée", "Réservation en ligne"
    ],
    ambiance: [
      "Cosy", "Chic", "Lounge", "Calme", "Festif", "Convivial", "Intimiste",
      "Moderne", "Traditionnel", "Romantique", "Rooftop", "Speakeasy",
      "Ambiance club", "Live band", "DJ set", "Candlelight", "Ambiance marocaine"
    ]
  },
  loisirs: {
    specialties: [
      "Escape game", "Bowling", "Laser game", "Karting", "Quad", "Paintball",
      "Jet ski", "Paddle", "Surf", "Plongée", "Golf", "Équitation",
      "Parachute", "Parapente", "Accrobranche", "Randonnée", "Aquapark"
    ],
    tags: [
      "Nouveau", "Tendance", "Sensations", "Adrénaline", "Team building",
      "Kids friendly", "Familial", "Entre amis", "Groupe", "Outdoor", "Indoor",
      "Sport", "Aventure", "Détente", "Anniversaire", "Événement"
    ],
    amenities: [
      "Wi-Fi", "Parking", "Climatisation", "Accès PMR", "Paiement carte",
      "Douches", "Vestiaires", "Matériel inclus", "Coach", "Casiers",
      "Espace détente", "Réservation en ligne", "Café/Snack"
    ],
    ambiance: [
      "Sportive", "Aventure", "Détente", "Adrénaline", "Family fun",
      "Moderne", "Nature", "Convivial", "Festif"
    ]
  },
  sport: {
    specialties: [
      "Hammam", "Massage", "Spa", "Yoga", "Pilates", "CrossFit", "Fitness",
      "Musculation", "Boxe", "Natation", "Padel", "Tennis", "Réflexologie",
      "Soins du visage", "Épilation", "Manucure", "Pédicure", "Coiffure", "Barber"
    ],
    tags: [
      "Nouveau", "Tendance", "Premium", "Coup de cœur", "Détente", "Bien-être",
      "Idéal en couple", "Entre amis", "Solo", "Homme", "Femme", "Mixte"
    ],
    amenities: [
      "Wi-Fi", "Parking", "Climatisation", "Accès PMR", "Paiement carte",
      "Douches", "Vestiaires", "Serviettes fournies", "Casiers", "Jacuzzi",
      "Sauna", "Piscine", "Réservation en ligne"
    ],
    ambiance: [
      "Zen", "Luxueux", "Moderne", "Traditionnel", "Cosy", "Intimiste",
      "Professionnel", "Détente", "Bien-être"
    ]
  },
  hebergement: {
    specialties: [
      "Riad", "Hôtel", "Villa", "Resort", "All inclusive", "Boutique hotel",
      "Maison d'hôtes", "Glamping", "Éco-lodge", "Suite", "Bungalow"
    ],
    tags: [
      "Nouveau", "Tendance", "Premium", "Coup de cœur", "Week-end",
      "Séjour romantique", "Voyage d'affaires", "All inclusive", "Vue mer",
      "Vue montagne", "Plage", "Piscine", "Spa", "Kids club", "Pet friendly"
    ],
    amenities: [
      "Wi-Fi", "Parking", "Climatisation", "Accès PMR", "Paiement carte",
      "Petit-déjeuner", "Room service", "Réception 24/7", "Navette aéroport",
      "Piscine", "Spa", "Salle de sport", "Plage privée", "Kids club",
      "Conciergerie", "Salles de réunion", "Restaurant"
    ],
    ambiance: [
      "Luxueux", "Romantique", "Familial", "Business", "Zen", "Bohème",
      "Traditionnel", "Moderne", "Vue panoramique", "Adults only"
    ]
  },
  culture: {
    specialties: [
      "Visite guidée", "Musée", "Monument", "Galerie d'art", "Théâtre",
      "Spectacle", "Atelier cuisine", "Atelier poterie", "Cours de danse",
      "Excursion", "Festival", "Concert"
    ],
    tags: [
      "Nouveau", "Incontournable", "Historique", "Artistique", "Éducatif",
      "Familial", "Groupe", "Privatisable", "Guide inclus", "Audio guide"
    ],
    amenities: [
      "Wi-Fi", "Parking", "Climatisation", "Accès PMR", "Paiement carte",
      "Boutique souvenirs", "Café", "Vestiaire", "Audio guide", "Guide multilingue"
    ],
    ambiance: [
      "Culturel", "Historique", "Artistique", "Éducatif", "Contemplatif",
      "Interactif", "Immersif"
    ]
  },
  rentacar: {
    specialties: [
      "Citadine", "Compacte", "Berline", "SUV", "4x4", "Monospace",
      "Utilitaire", "Luxe", "Cabriolet", "Électrique"
    ],
    tags: [
      "Nouveau", "Bon plan", "Premium", "Kilométrage illimité", "Assurance incluse",
      "GPS inclus", "Siège bébé disponible", "Livraison possible"
    ],
    amenities: [
      "Parking", "Paiement carte", "Assurance tous risques", "Assistance 24/7",
      "Livraison aéroport", "Livraison hôtel", "GPS", "Siège enfant"
    ],
    ambiance: []
  }
};

// Universal tags that apply to all universes
const UNIVERSAL_TAGS = [
  "Accessible", "Ouvert tard", "Réservation conseillée", "Calme", "Festif"
];

type Props = {
  establishmentId: string;
  universe?: string;
};

type TagsData = {
  specialties: string[];
  tags: string[];
  amenities: string[];
  ambiance_tags: string[];
  booking_enabled: boolean;
  menu_digital_enabled: boolean;
  verified: boolean;
};

async function adminApiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const sessionToken = loadAdminSessionToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (sessionToken) {
    headers["x-admin-session"] = sessionToken;
  }

  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers,
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
  }

  return payload;
}

function TagSection({
  title,
  icon: Icon,
  availableTags,
  selectedTags,
  onToggle,
  color = "slate",
}: {
  title: string;
  icon: React.ElementType;
  availableTags: string[];
  selectedTags: string[];
  onToggle: (tag: string) => void;
  color?: string;
}) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filteredTags = useMemo(() => {
    const lower = search.toLowerCase();
    return availableTags.filter(t => t.toLowerCase().includes(lower));
  }, [availableTags, search]);

  const displayTags = showAll ? filteredTags : filteredTags.slice(0, 15);

  const colorClasses: Record<string, { selected: string; unselected: string }> = {
    emerald: { selected: "bg-emerald-100 text-emerald-800 border-emerald-300", unselected: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-emerald-50" },
    blue: { selected: "bg-blue-100 text-blue-800 border-blue-300", unselected: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-blue-50" },
    purple: { selected: "bg-purple-100 text-purple-800 border-purple-300", unselected: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-purple-50" },
    amber: { selected: "bg-amber-100 text-amber-800 border-amber-300", unselected: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50" },
    slate: { selected: "bg-primary/10 text-primary border-primary/30", unselected: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" },
  };

  const colors = colorClasses[color] || colorClasses.slate;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
          <Icon className="w-4 h-4" />
          {title}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {selectedTags.length}
          </Badge>
        </h4>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer..."
            className="h-7 w-32 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Selected tags */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1 pb-2 border-b border-slate-100">
          {selectedTags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className={`cursor-pointer text-xs ${colors.selected}`}
              onClick={() => onToggle(tag)}
            >
              {tag}
              <X className="w-3 h-3 ml-1" />
            </Badge>
          ))}
        </div>
      )}

      {/* Available tags */}
      <div className="flex flex-wrap gap-1">
        {displayTags.filter(t => !selectedTags.includes(t)).map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className={`cursor-pointer text-xs ${colors.unselected}`}
            onClick={() => onToggle(tag)}
          >
            <Plus className="w-2.5 h-2.5 mr-0.5" />
            {tag}
          </Badge>
        ))}
        {filteredTags.length > 15 && !showAll && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px]"
            onClick={() => setShowAll(true)}
          >
            +{filteredTags.length - 15} autres
          </Button>
        )}
        {showAll && filteredTags.length > 15 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px]"
            onClick={() => setShowAll(false)}
          >
            Réduire
          </Button>
        )}
      </div>
    </div>
  );
}

export function AdminTagsServicesCard({ establishmentId, universe = "restaurants" }: Props) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Tags
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [ambianceTags, setAmbianceTags] = useState<string[]>([]);

  // Services
  const [bookingEnabled, setBookingEnabled] = useState(false);
  const [menuDigitalEnabled, setMenuDigitalEnabled] = useState(false);
  const [verified, setVerified] = useState(false);

  // Custom tag input
  const [customTag, setCustomTag] = useState("");
  const [customTagType, setCustomTagType] = useState<"specialties" | "tags" | "amenities" | "ambiance">("tags");

  // Get universe-specific tags
  const config = TAG_CONFIG[universe] || TAG_CONFIG.restaurants;
  const allTags = useMemo(() => [...config.tags, ...UNIVERSAL_TAGS], [config.tags]);

  const loadData = useCallback(async () => {
    if (!establishmentId) return;

    setLoading(true);
    try {
      const data = await adminApiFetch(
        `/api/admin/establishments/${encodeURIComponent(establishmentId)}/tags-services`
      );

      if (!data) return;

      setSpecialties(data.specialties || []);
      setTags(data.tags || []);
      setAmenities(data.amenities || []);
      setAmbianceTags(data.ambiance_tags || []);
      setBookingEnabled(data.booking_enabled ?? false);
      setMenuDigitalEnabled(data.menu_digital_enabled ?? false);
      setVerified(data.verified ?? false);
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur de chargement",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [establishmentId, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApiFetch(
        `/api/admin/establishments/${encodeURIComponent(establishmentId)}/tags-services`,
        {
          method: "PATCH",
          body: JSON.stringify({
            specialties,
            tags,
            amenities,
            ambiance_tags: ambianceTags,
            booking_enabled: bookingEnabled,
            menu_digital_enabled: menuDigitalEnabled,
            verified,
          }),
        }
      );

      toast({ title: "Tags et services enregistrés" });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = (type: "specialties" | "tags" | "amenities" | "ambiance", tag: string) => {
    const setter = {
      specialties: setSpecialties,
      tags: setTags,
      amenities: setAmenities,
      ambiance: setAmbianceTags,
    }[type];

    const current = {
      specialties,
      tags,
      amenities,
      ambiance: ambianceTags,
    }[type];

    if (current.includes(tag)) {
      setter(current.filter(t => t !== tag));
    } else {
      setter([...current, tag]);
    }
  };

  const addCustomTag = () => {
    if (!customTag.trim()) return;
    const tag = customTag.trim();

    const setter = {
      specialties: setSpecialties,
      tags: setTags,
      amenities: setAmenities,
      ambiance: setAmbianceTags,
    }[customTagType];

    const current = {
      specialties,
      tags,
      amenities,
      ambiance: ambianceTags,
    }[customTagType];

    if (!current.includes(tag)) {
      setter([...current, tag]);
    }
    setCustomTag("");
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Tags className="w-4 h-4 text-primary" />
            Tags et Services
            <Badge variant="outline" className="text-[10px] ml-2">
              {universe}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={loadData}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Services toggles */}
        <div className="p-4 bg-slate-50 rounded-lg space-y-3">
          <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-slate-500" />
            Services activés
          </h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={bookingEnabled} onCheckedChange={setBookingEnabled} />
              <Label className="text-xs">Réservation en ligne</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={menuDigitalEnabled} onCheckedChange={setMenuDigitalEnabled} />
              <Label className="text-xs">Menu digital</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={verified} onCheckedChange={setVerified} />
              <Label className="text-xs">Vérifié</Label>
            </div>
          </div>
        </div>

        {/* Custom tag input */}
        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
          <select
            value={customTagType}
            onChange={(e) => setCustomTagType(e.target.value as any)}
            className="h-8 text-xs rounded border-slate-200 bg-white"
          >
            <option value="specialties">Spécialité</option>
            <option value="tags">Tag</option>
            <option value="amenities">Équipement</option>
            <option value="ambiance">Ambiance</option>
          </select>
          <Input
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            placeholder="Ajouter un tag personnalisé..."
            className="h-8 text-sm flex-1"
            onKeyDown={(e) => e.key === "Enter" && addCustomTag()}
          />
          <Button size="sm" variant="outline" className="h-8" onClick={addCustomTag}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Specialties */}
        <TagSection
          title="Spécialités"
          icon={ChefHat}
          availableTags={config.specialties}
          selectedTags={specialties}
          onToggle={(tag) => toggleTag("specialties", tag)}
          color="emerald"
        />

        {/* General tags */}
        <TagSection
          title="Tags généraux"
          icon={Sparkles}
          availableTags={allTags}
          selectedTags={tags}
          onToggle={(tag) => toggleTag("tags", tag)}
          color="blue"
        />

        {/* Amenities */}
        <TagSection
          title="Équipements & Services"
          icon={Building2}
          availableTags={config.amenities}
          selectedTags={amenities}
          onToggle={(tag) => toggleTag("amenities", tag)}
          color="purple"
        />

        {/* Ambiance */}
        {config.ambiance.length > 0 && (
          <TagSection
            title="Ambiance"
            icon={Palette}
            availableTags={config.ambiance}
            selectedTags={ambianceTags}
            onToggle={(tag) => toggleTag("ambiance", tag)}
            color="amber"
          />
        )}
      </CardContent>
    </Card>
  );
}
