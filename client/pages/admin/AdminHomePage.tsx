import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Edit3,
  Loader2,
  Plus,
  Trash2,
  Home,
  Star,
  MapPin,
  TrendingUp,
  Sparkles,
  GripVertical,
  Power,
  PowerOff,
  Upload,
  Image as ImageIcon,
  X,
  Info,
  Save,
  Image,
  BookOpen,
  Globe,
  Flag,
  Video,
  Play,
  ExternalLink,
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
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import {
  AdminApiError,
  listAdminHomeCurationItems,
  createAdminHomeCurationItem,
  updateAdminHomeCurationItem,
  deleteAdminHomeCurationItem,
  listAdminEstablishmentsForSearch,
  listAdminUniverses,
  createAdminUniverse,
  updateAdminUniverse,
  reorderAdminUniverses,
  deleteAdminUniverse,
  uploadAdminUniverseImage,
  getAdminHomeSettings,
  updateAdminHomeSettings,
  uploadAdminHeroImage,
  deleteAdminHeroImage,
  listAdminHomeCities,
  createAdminHomeCity,
  updateAdminHomeCity,
  reorderAdminHomeCities,
  deleteAdminHomeCity,
  uploadAdminHomeCityImage,
  updateAdminHomeCityCountry,
  listAdminCountries,
  createAdminCountry,
  updateAdminCountry,
  deleteAdminCountry,
  reorderAdminCountries,
  listAdminCategoryImages,
  createAdminCategoryImage,
  updateAdminCategoryImage,
  deleteAdminCategoryImage,
  uploadAdminCategoryImage,
  listAdminCategories,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
  listAdminHomeVideos,
  createAdminHomeVideo,
  updateAdminHomeVideo,
  reorderAdminHomeVideos,
  deleteAdminHomeVideo,
  uploadAdminVideoThumbnail,
  type HomeCurationItemAdmin,
  type HomeVideoAdmin,
  type HomeCurationKind,
  type EstablishmentListItemAdmin,
  type UniverseAdmin,
  type HomeSettings,
  type HowItWorksItem,
  type HomeCityAdmin,
  type CategoryImageAdmin,
  type CategoryAdmin,
  type CountryAdmin,
  listPlatformSettings,
  updatePlatformSetting,
  type PlatformSetting,
} from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  LucideIconPicker,
  DynamicLucideIcon,
} from "@/components/admin/LucideIconPicker";
import { ColorPalette } from "@/components/admin/ColorPalette";

function humanAdminError(e: unknown): string {
  if (e instanceof AdminApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Erreur inattendue";
}

const CURATION_KINDS: {
  value: HomeCurationKind;
  label: string;
  icon: typeof Star;
}[] = [
  { value: "best_deals", label: "Nos meilleures offres", icon: Sparkles },
  { value: "selected_for_you", label: "Sélectionnés pour vous", icon: Star },
  { value: "near_you", label: "À proximité", icon: MapPin },
  { value: "most_booked", label: "Les plus réservés", icon: TrendingUp },
];

type CurationEditorState = {
  id?: string;
  universe: string;
  kind: HomeCurationKind;
  establishment_id: string;
  establishment_name?: string;
  city: string;
  starts_at: string;
  ends_at: string;
  weight: number;
  note: string;
};

type UniverseEditorState = {
  id?: string;
  slug: string;
  label_fr: string;
  label_en: string;
  icon_name: string;
  color: string;
  is_active: boolean;
  image_url: string | null;
};

type CityEditorState = {
  id?: string;
  name: string;
  slug: string;
  image_url: string | null;
  is_active: boolean;
  country_code: string;
};

type VideoEditorState = {
  id?: string;
  youtube_url: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  establishment_id: string | null;
  establishment_name: string | null;
  is_active: boolean;
};

// Sortable City Row Component
function SortableCityRow({
  city,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  city: HomeCityAdmin;
  onEdit: (c: HomeCityAdmin) => void;
  onDelete: (c: HomeCityAdmin) => void;
  onToggleActive: (c: HomeCityAdmin) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: city.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 p-4 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-5 h-5" />
      </button>

      <div className="w-16 h-12 rounded-md overflow-hidden bg-slate-100 flex-shrink-0">
        {city.image_url ? (
          <img
            src={city.image_url}
            alt={city.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <ImageIcon className="w-6 h-6" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{city.name}</span>
          {city.country_code && (
            <Badge variant="outline" className="text-xs">
              {city.country_code}
            </Badge>
          )}
          {!city.is_active && (
            <Badge variant="secondary" className="text-xs">
              Inactif
            </Badge>
          )}
        </div>
        <span className="text-sm text-slate-500">/{city.slug}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleActive(city)}
          title={city.is_active ? "Désactiver" : "Activer"}
        >
          {city.is_active ? (
            <Power className="w-4 h-4 text-green-600" />
          ) : (
            <PowerOff className="w-4 h-4 text-slate-400" />
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onEdit(city)}>
          <Edit3 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(city)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Sortable Country Row Component
function SortableCountryRow({
  country,
  onEdit,
  onDelete,
  onToggleActive,
  onSetDefault,
}: {
  country: CountryAdmin;
  onEdit: (c: CountryAdmin) => void;
  onDelete: (c: CountryAdmin) => void;
  onToggleActive: (c: CountryAdmin) => void;
  onSetDefault: (c: CountryAdmin) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: country.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 p-4 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-5 h-5" />
      </button>

      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-2xl">
        {country.flag_emoji || "🌍"}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{country.name}</span>
          <span className="text-sm text-slate-500">({country.code})</span>
          {country.is_default && (
            <Badge variant="default" className="text-xs bg-amber-500">
              ⭐ Par défaut
            </Badge>
          )}
          {!country.is_active && (
            <Badge variant="secondary" className="text-xs">
              Inactif
            </Badge>
          )}
        </div>
        <div className="text-sm text-slate-500 flex items-center gap-3">
          {country.phone_prefix && <span>{country.phone_prefix}</span>}
          {country.currency_code && <span>{country.currency_code}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!country.is_default && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSetDefault(country)}
            title="Définir comme pays par défaut"
          >
            <Star className="w-4 h-4 text-slate-400" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleActive(country)}
          title={country.is_active ? "Désactiver" : "Activer"}
        >
          {country.is_active ? (
            <Power className="w-4 h-4 text-green-600" />
          ) : (
            <PowerOff className="w-4 h-4 text-slate-400" />
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onEdit(country)}>
          <Edit3 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(country)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
          disabled={country.is_default}
          title={country.is_default ? "Impossible de supprimer le pays par défaut" : "Supprimer"}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Sortable Universe Row Component
function SortableUniverseRow({
  universe,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  universe: UniverseAdmin;
  onEdit: (u: UniverseAdmin) => void;
  onDelete: (u: UniverseAdmin) => void;
  onToggleActive: (u: UniverseAdmin) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: universe.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border bg-white p-4 ${
        !universe.is_active ? "opacity-60" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab hover:bg-slate-100 rounded p-1"
        type="button"
      >
        <GripVertical className="w-5 h-5 text-slate-400" />
      </button>

      <div
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `${universe.color}20` }}
      >
        <DynamicLucideIcon
          name={universe.icon_name}
          className="w-5 h-5"
          style={{ color: universe.color }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900">{universe.label_fr}</div>
        <div className="text-xs text-slate-500">
          {universe.label_en} • slug: {universe.slug}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onToggleActive(universe)}
          title={universe.is_active ? "Désactiver" : "Activer"}
        >
          {universe.is_active ? (
            <Power className="w-4 h-4 text-green-600" />
          ) : (
            <PowerOff className="w-4 h-4 text-slate-400" />
          )}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onEdit(universe)}>
          <Edit3 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-red-600 hover:text-red-700"
          onClick={() => onDelete(universe)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Sortable Video Row Component
function SortableVideoRow({
  video,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  video: HomeVideoAdmin;
  onEdit: (v: HomeVideoAdmin) => void;
  onDelete: (v: HomeVideoAdmin) => void;
  onToggleActive: (v: HomeVideoAdmin) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: video.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Extract YouTube video ID for thumbnail
  const getYoutubeVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&?\s]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) return match[1];
    }
    return null;
  };

  const videoId = getYoutubeVideoId(video.youtube_url);
  const thumbnailUrl = videoId
    ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 p-4 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-5 h-5" />
      </button>

      <div className="w-24 h-16 rounded-md overflow-hidden bg-slate-100 flex-shrink-0 relative">
        {thumbnailUrl ? (
          <>
            <img
              src={thumbnailUrl}
              alt={video.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Play className="w-6 h-6 text-white fill-white" />
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <Video className="w-6 h-6" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900 truncate">{video.title}</span>
          {!video.is_active && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
              Inactif
            </span>
          )}
        </div>
        {video.description && (
          <p className="text-sm text-slate-500 truncate">{video.description}</p>
        )}
        <a
          href={video.youtube_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
        >
          Voir sur YouTube <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleActive(video)}
          title={video.is_active ? "Désactiver" : "Activer"}
        >
          {video.is_active ? (
            <Power className="w-4 h-4 text-green-600" />
          ) : (
            <PowerOff className="w-4 h-4 text-slate-400" />
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onEdit(video)}>
          <Edit3 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(video)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Universes for category images
const UNIVERSES = [
  { value: "restaurants", label: "Restaurants" },
  { value: "sport", label: "Sport" },
  { value: "loisirs", label: "Loisirs" },
  { value: "hebergement", label: "Hébergement" },
  { value: "culture", label: "Culture" },
  { value: "shopping", label: "Shopping" },
];

export default function AdminHomePage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"appearance" | "curation" | "universes" | "countries" | "cities" | "videos" | "categories" | "footer">("appearance");

  // ==================== APPEARANCE STATE ====================
  const [homeSettings, setHomeSettings] = useState<HomeSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [heroUploading, setHeroUploading] = useState(false);
  const [heroDeleting, setHeroDeleting] = useState(false);

  // ==================== BLOG HERO STATE ====================
  const [blogHeroSettings, setBlogHeroSettings] = useState({
    title: "Blog",
    subtitle: "Actualités, guides et conseils pour vos sorties au Maroc.",
    background_image_url: null as string | null,
    overlay_opacity: 0.7,
  });
  const [blogHeroSaving, setBlogHeroSaving] = useState(false);

  // "Comment ça marche" section
  const [howItWorksSaving, setHowItWorksSaving] = useState(false);
  const DEFAULT_HOW_IT_WORKS = {
    title: "Comment ça marche ?",
    items: [
      { icon: "BadgePercent", title: "Offres exclusives", description: "Profitez de réductions et avantages uniques chez nos établissements partenaires au Maroc." },
      { icon: "Award", title: "Le meilleur choix", description: "Une sélection rigoureuse d'établissements pour toutes vos envies : restaurants, loisirs, bien-être..." },
      { icon: "Star", title: "Avis vérifiés", description: "Des recommandations authentiques de notre communauté pour vous guider dans vos choix." },
      { icon: "CalendarCheck", title: "Réservation facile", description: "Réservez instantanément, gratuitement, partout et à tout moment. 24h/24, 7j/7." },
    ],
  };

  // ==================== UNIVERSES STATE ====================
  const [universes, setUniverses] = useState<UniverseAdmin[]>([]);
  const [universesLoading, setUniversesLoading] = useState(false);
  const [universesError, setUniversesError] = useState<string | null>(null);
  const [universeDialogOpen, setUniverseDialogOpen] = useState(false);
  const [universeSaving, setUniverseSaving] = useState(false);
  const [universeImageUploading, setUniverseImageUploading] = useState(false);
  const [universeEditor, setUniverseEditor] =
    useState<UniverseEditorState | null>(null);

  // ==================== COUNTRIES STATE ====================
  const [countries, setCountries] = useState<CountryAdmin[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [countriesError, setCountriesError] = useState<string | null>(null);
  const [countryDialogOpen, setCountryDialogOpen] = useState(false);
  const [countrySaving, setCountrySaving] = useState(false);
  const [countryEditor, setCountryEditor] = useState<{
    id?: string;
    name: string;
    name_en: string;
    code: string;
    flag_emoji: string;
    currency_code: string;
    phone_prefix: string;
    is_active: boolean;
    is_default: boolean;
  } | null>(null);

  // ==================== CITIES STATE ====================
  const [cities, setCities] = useState<HomeCityAdmin[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);
  const [cityDialogOpen, setCityDialogOpen] = useState(false);
  const [citySaving, setCitySaving] = useState(false);
  const [cityEditor, setCityEditor] = useState<CityEditorState | null>(null);
  const [cityImageUploading, setCityImageUploading] = useState(false);
  const [cityCountryFilter, setCityCountryFilter] = useState<string>("");

  // ==================== VIDEOS STATE ====================
  const [videos, setVideos] = useState<HomeVideoAdmin[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [videoSaving, setVideoSaving] = useState(false);
  const [videoThumbnailUploading, setVideoThumbnailUploading] = useState(false);
  const [videoEditor, setVideoEditor] = useState<VideoEditorState | null>(null);

  // ==================== CATEGORIES (Category Images) STATE ====================
  const [categoryImages, setCategoryImages] = useState<CategoryImageAdmin[]>([]);
  const [categoryImagesLoading, setCategoryImagesLoading] = useState(false);
  const [categoryImagesError, setCategoryImagesError] = useState<string | null>(null);
  const [categoryUniverseFilter, setCategoryUniverseFilter] = useState<string>("");
  const [subcategoryCategoryFilter, setSubcategoryCategoryFilter] = useState<string>("");
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryImageUploading, setCategoryImageUploading] = useState(false);
  const categoryImageInputRef = useRef<HTMLInputElement | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<{
    id?: string;
    universe: string;
    category_id: string;
    category_slug: string;
    name: string;
    image_url: string;
    display_order: number;
    is_active: boolean;
  } | null>(null);

  // ==================== CURATION STATE ====================
  const [items, setItems] = useState<HomeCurationItemAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [universeFilter, setUniverseFilter] = useState<string>("");
  const [kindFilter, setKindFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<CurationEditorState | null>(null);
  const [estSearch, setEstSearch] = useState("");
  const [estResults, setEstResults] = useState<
    Array<{ id: string; name: string; city: string | null }>
  >([]);
  const [allEstablishments, setAllEstablishments] = useState<
    EstablishmentListItemAdmin[]
  >([]);
  const [establishmentsLoaded, setEstablishmentsLoaded] = useState(false);

  // ==================== FOOTER STATE ====================
  const [footerSocials, setFooterSocials] = useState<Record<string, string>>({
    FOOTER_SOCIAL_INSTAGRAM: "",
    FOOTER_SOCIAL_TIKTOK: "",
    FOOTER_SOCIAL_FACEBOOK: "",
    FOOTER_SOCIAL_YOUTUBE: "",
    FOOTER_SOCIAL_SNAPCHAT: "",
    FOOTER_SOCIAL_LINKEDIN: "",
  });
  const [footerLoading, setFooterLoading] = useState(false);
  const [footerSaving, setFooterSaving] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // ==================== APPEARANCE LOGIC ====================
  const refreshSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await getAdminHomeSettings(undefined);
      setHomeSettings(res.settings);
    } catch {
      // Use defaults if API fails
      setHomeSettings({ hero: { background_image_url: null, overlay_opacity: 0.7 } });
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "appearance") {
      void refreshSettings();
    }
  }, [tab, refreshSettings]);

  const handleHeroImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({
        title: "Format non supporté",
        description: "Utilisez JPG, PNG ou WebP",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Fichier trop volumineux",
        description: "Maximum 5 Mo",
        variant: "destructive",
      });
      return;
    }

    setHeroUploading(true);
    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        try {
          const res = await uploadAdminHeroImage(undefined, base64, file.type);
          toast({ title: "Image mise à jour" });
          setHomeSettings((prev) => prev ? {
            ...prev,
            hero: { ...prev.hero, background_image_url: res.url },
          } : prev);
        } catch (err) {
          toast({
            title: "Erreur",
            description: humanAdminError(err),
            variant: "destructive",
          });
        } finally {
          setHeroUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast({
        title: "Erreur",
        description: humanAdminError(err),
        variant: "destructive",
      });
      setHeroUploading(false);
    }
  }, [toast]);

  const handleDeleteHeroImage = useCallback(async () => {
    setHeroDeleting(true);
    try {
      await deleteAdminHeroImage(undefined);
      toast({ title: "Image supprimée" });
      setHomeSettings((prev) => prev ? {
        ...prev,
        hero: { ...prev.hero, background_image_url: null },
      } : prev);
    } catch (err) {
      toast({
        title: "Erreur",
        description: humanAdminError(err),
        variant: "destructive",
      });
    } finally {
      setHeroDeleting(false);
    }
  }, [toast]);

  const handleOverlayOpacityChange = useCallback(async (value: number) => {
    try {
      await updateAdminHomeSettings(undefined, "hero", {
        background_image_url: homeSettings?.hero.background_image_url ?? null,
        overlay_opacity: value,
        title: homeSettings?.hero.title ?? null,
        subtitle: homeSettings?.hero.subtitle ?? null,
      });
      setHomeSettings((prev) => prev ? {
        ...prev,
        hero: { ...prev.hero, overlay_opacity: value },
      } : prev);
    } catch (err) {
      toast({
        title: "Erreur",
        description: humanAdminError(err),
        variant: "destructive",
      });
    }
  }, [homeSettings, toast]);

  const [heroTextsSaving, setHeroTextsSaving] = useState(false);

  const handleSaveHeroTexts = useCallback(async () => {
    setHeroTextsSaving(true);
    try {
      await updateAdminHomeSettings(undefined, "hero", {
        background_image_url: homeSettings?.hero.background_image_url ?? null,
        overlay_opacity: homeSettings?.hero.overlay_opacity ?? 0.7,
        title: homeSettings?.hero.title ?? null,
        subtitle: homeSettings?.hero.subtitle ?? null,
      });
      toast({
        title: "Textes enregistrés",
        description: "Le titre et sous-titre du Hero ont été mis à jour.",
      });
    } catch (err) {
      toast({
        title: "Erreur",
        description: humanAdminError(err),
        variant: "destructive",
      });
    } finally {
      setHeroTextsSaving(false);
    }
  }, [homeSettings, toast]);

  // ==================== BLOG HERO LOGIC ====================
  // Load blog hero settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("sam_blog_hero");
      if (stored) {
        const parsed = JSON.parse(stored);
        setBlogHeroSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const handleSaveBlogHero = useCallback(async () => {
    setBlogHeroSaving(true);
    try {
      // Save to localStorage (used by Blog.tsx)
      localStorage.setItem("sam_blog_hero", JSON.stringify(blogHeroSettings));
      toast({
        title: "Paramètres du Blog enregistrés",
        description: "Le titre, sous-titre et style du hero Blog ont été mis à jour.",
      });
    } catch (err) {
      toast({
        title: "Erreur",
        description: humanAdminError(err),
        variant: "destructive",
      });
    } finally {
      setBlogHeroSaving(false);
    }
  }, [blogHeroSettings, toast]);

  // Get current how_it_works data with defaults
  const howItWorksData = homeSettings?.how_it_works ?? DEFAULT_HOW_IT_WORKS;

  const handleHowItWorksChange = useCallback((
    field: "title" | "items",
    value: string | HowItWorksItem[],
  ) => {
    setHomeSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        how_it_works: {
          ...howItWorksData,
          [field]: value,
        },
      };
    });
  }, [howItWorksData]);

  const handleHowItWorksItemChange = useCallback((
    index: number,
    field: keyof HowItWorksItem,
    value: string,
  ) => {
    setHomeSettings((prev) => {
      if (!prev) return prev;
      const items = [...(prev.how_it_works?.items ?? DEFAULT_HOW_IT_WORKS.items)];
      items[index] = { ...items[index], [field]: value };
      return {
        ...prev,
        how_it_works: {
          title: prev.how_it_works?.title ?? DEFAULT_HOW_IT_WORKS.title,
          items,
        },
      };
    });
  }, []);

  const handleSaveHowItWorks = useCallback(async () => {
    setHowItWorksSaving(true);
    try {
      await updateAdminHomeSettings(undefined, "how_it_works", howItWorksData);
      toast({ title: "Section mise à jour" });
    } catch (err) {
      toast({
        title: "Erreur",
        description: humanAdminError(err),
        variant: "destructive",
      });
    } finally {
      setHowItWorksSaving(false);
    }
  }, [howItWorksData, toast]);

  // ==================== UNIVERSES LOGIC ====================
  const refreshUniverses = useCallback(async () => {
    setUniversesLoading(true);
    setUniversesError(null);
    try {
      const res = await listAdminUniverses(undefined, { includeInactive: true });
      setUniverses(res.items ?? []);
    } catch (e) {
      setUniversesError(humanAdminError(e));
    } finally {
      setUniversesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "universes") {
      void refreshUniverses();
    }
  }, [tab, refreshUniverses]);

  const openNewUniverse = useCallback(() => {
    setUniverseEditor({
      slug: "",
      label_fr: "",
      label_en: "",
      icon_name: "Circle",
      color: "#a3001d",
      is_active: true,
      image_url: null,
    });
    setUniverseDialogOpen(true);
  }, []);

  const openEditUniverse = useCallback((u: UniverseAdmin) => {
    setUniverseEditor({
      id: u.id,
      slug: u.slug,
      label_fr: u.label_fr,
      label_en: u.label_en,
      icon_name: u.icon_name,
      color: u.color,
      is_active: u.is_active,
      image_url: u.image_url ?? null,
    });
    setUniverseDialogOpen(true);
  }, []);

  const handleDeleteUniverse = useCallback(
    async (u: UniverseAdmin) => {
      if (
        !confirm(
          `Supprimer l'univers "${u.label_fr}" ?\n\nAttention: cela n'est possible que si aucun établissement ou curation n'utilise cet univers.`,
        )
      )
        return;
      try {
        await deleteAdminUniverse(undefined, u.id);
        toast({ title: "Univers supprimé" });
        await refreshUniverses();
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
      }
    },
    [refreshUniverses, toast],
  );

  const handleToggleUniverseActive = useCallback(
    async (u: UniverseAdmin) => {
      try {
        await updateAdminUniverse(undefined, {
          id: u.id,
          is_active: !u.is_active,
        });
        toast({
          title: u.is_active ? "Univers désactivé" : "Univers activé",
        });
        await refreshUniverses();
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
      }
    },
    [refreshUniverses, toast],
  );

  const handleUniverseImageUpload = useCallback(
    async (file: File | null) => {
      if (!file || !universeEditor) return;

      const validTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Type de fichier non supporté",
          description: "Formats acceptés: JPEG, PNG, WebP",
          variant: "destructive",
        });
        return;
      }

      const maxBytes = 2 * 1024 * 1024; // 2MB
      if (file.size > maxBytes) {
        toast({
          title: "Fichier trop volumineux",
          description: "L'image doit faire moins de 2 Mo",
          variant: "destructive",
        });
        return;
      }

      setUniverseImageUploading(true);
      try {
        const result = await uploadAdminUniverseImage(undefined, {
          file,
          fileName: file.name,
        });
        setUniverseEditor((prev) =>
          prev ? { ...prev, image_url: result.item.public_url } : prev,
        );
        toast({ title: "Image téléchargée", description: "L'image a été uploadée avec succès." });
      } catch (e) {
        toast({
          title: "Erreur d'upload",
          description: humanAdminError(e),
          variant: "destructive",
        });
      } finally {
        setUniverseImageUploading(false);
      }
    },
    [universeEditor, toast],
  );

  const saveUniverse = useCallback(async () => {
    if (!universeEditor) return;
    if (!universeEditor.slug || !universeEditor.label_fr || !universeEditor.label_en) {
      toast({
        title: "Erreur",
        description: "Tous les champs obligatoires doivent être remplis",
        variant: "destructive",
      });
      return;
    }

    setUniverseSaving(true);
    try {
      if (!universeEditor.id) {
        await createAdminUniverse(undefined, {
          slug: universeEditor.slug,
          label_fr: universeEditor.label_fr,
          label_en: universeEditor.label_en,
          icon_name: universeEditor.icon_name,
          color: universeEditor.color,
          is_active: universeEditor.is_active,
          image_url: universeEditor.image_url,
        });
      } else {
        await updateAdminUniverse(undefined, {
          id: universeEditor.id,
          slug: universeEditor.slug,
          label_fr: universeEditor.label_fr,
          label_en: universeEditor.label_en,
          icon_name: universeEditor.icon_name,
          color: universeEditor.color,
          is_active: universeEditor.is_active,
          image_url: universeEditor.image_url,
        });
      }
      toast({ title: "Enregistré" });
      setUniverseDialogOpen(false);
      await refreshUniverses();
    } catch (e) {
      toast({
        title: "Erreur",
        description: humanAdminError(e),
        variant: "destructive",
      });
    } finally {
      setUniverseSaving(false);
    }
  }, [universeEditor, refreshUniverses, toast]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = universes.findIndex((u) => u.id === active.id);
      const newIndex = universes.findIndex((u) => u.id === over.id);

      const newOrder = arrayMove(universes, oldIndex, newIndex);
      setUniverses(newOrder);

      try {
        await reorderAdminUniverses(
          undefined,
          newOrder.map((u) => u.id),
        );
        toast({ title: "Ordre mis à jour" });
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
        await refreshUniverses();
      }
    },
    [universes, refreshUniverses, toast],
  );

  // ==================== COUNTRIES LOGIC ====================
  const refreshCountries = useCallback(async () => {
    setCountriesLoading(true);
    setCountriesError(null);
    try {
      const res = await listAdminCountries(undefined, { includeInactive: true });
      setCountries(res.items ?? []);
    } catch (e) {
      setCountriesError(humanAdminError(e));
    } finally {
      setCountriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "countries") {
      void refreshCountries();
    }
  }, [tab, refreshCountries]);

  const openNewCountry = useCallback(() => {
    setCountryEditor({
      name: "",
      name_en: "",
      code: "",
      flag_emoji: "",
      currency_code: "MAD",
      phone_prefix: "+212",
      is_active: true,
      is_default: false,
    });
    setCountryDialogOpen(true);
  }, []);

  const openEditCountry = useCallback((c: CountryAdmin) => {
    setCountryEditor({
      id: c.id,
      name: c.name,
      name_en: c.name_en ?? "",
      code: c.code,
      flag_emoji: c.flag_emoji ?? "",
      currency_code: c.currency_code ?? "MAD",
      phone_prefix: c.phone_prefix ?? "",
      is_active: c.is_active,
      is_default: c.is_default,
    });
    setCountryDialogOpen(true);
  }, []);

  const handleDeleteCountry = useCallback(
    async (c: CountryAdmin) => {
      if (c.is_default) {
        toast({
          title: "Erreur",
          description: "Impossible de supprimer le pays par défaut",
          variant: "destructive",
        });
        return;
      }
      if (!confirm(`Supprimer le pays "${c.name}" ?`)) return;
      try {
        await deleteAdminCountry(undefined, c.id);
        toast({ title: "Pays supprimé" });
        await refreshCountries();
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
      }
    },
    [refreshCountries, toast],
  );

  const handleToggleCountryActive = useCallback(
    async (c: CountryAdmin) => {
      try {
        await updateAdminCountry(undefined, {
          id: c.id,
          is_active: !c.is_active,
        });
        toast({
          title: c.is_active ? "Pays désactivé" : "Pays activé",
        });
        await refreshCountries();
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
      }
    },
    [refreshCountries, toast],
  );

  const handleSetDefaultCountry = useCallback(
    async (c: CountryAdmin) => {
      if (c.is_default) return;
      try {
        await updateAdminCountry(undefined, {
          id: c.id,
          is_default: true,
        });
        toast({ title: `${c.name} est maintenant le pays par défaut` });
        await refreshCountries();
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
      }
    },
    [refreshCountries, toast],
  );

  const saveCountry = useCallback(async () => {
    if (!countryEditor) return;
    if (!countryEditor.name || !countryEditor.code) {
      toast({
        title: "Erreur",
        description: "Le nom et le code pays sont obligatoires",
        variant: "destructive",
      });
      return;
    }

    setCountrySaving(true);
    try {
      if (!countryEditor.id) {
        await createAdminCountry(undefined, {
          name: countryEditor.name,
          name_en: countryEditor.name_en || null,
          code: countryEditor.code.toUpperCase(),
          flag_emoji: countryEditor.flag_emoji || null,
          currency_code: countryEditor.currency_code || null,
          phone_prefix: countryEditor.phone_prefix || null,
          is_active: countryEditor.is_active,
          is_default: countryEditor.is_default,
        });
      } else {
        await updateAdminCountry(undefined, {
          id: countryEditor.id,
          name: countryEditor.name,
          name_en: countryEditor.name_en || null,
          code: countryEditor.code.toUpperCase(),
          flag_emoji: countryEditor.flag_emoji || null,
          currency_code: countryEditor.currency_code || null,
          phone_prefix: countryEditor.phone_prefix || null,
          is_active: countryEditor.is_active,
          is_default: countryEditor.is_default,
        });
      }
      toast({ title: "Enregistré" });
      setCountryDialogOpen(false);
      await refreshCountries();
    } catch (e) {
      toast({
        title: "Erreur",
        description: humanAdminError(e),
        variant: "destructive",
      });
    } finally {
      setCountrySaving(false);
    }
  }, [countryEditor, refreshCountries, toast]);

  const handleCountryDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = countries.findIndex((c) => c.id === active.id);
      const newIndex = countries.findIndex((c) => c.id === over.id);
      const newOrder = arrayMove(countries, oldIndex, newIndex);

      setCountries(newOrder);

      try {
        await reorderAdminCountries(
          undefined,
          newOrder.map((c) => c.id),
        );
      } catch (e) {
        toast({
          title: "Erreur de réorganisation",
          description: humanAdminError(e),
          variant: "destructive",
        });
        await refreshCountries();
      }
    },
    [countries, refreshCountries, toast],
  );

  // ==================== CITIES LOGIC ====================
  const refreshCities = useCallback(async () => {
    setCitiesLoading(true);
    setCitiesError(null);
    try {
      const res = await listAdminHomeCities(undefined, { includeInactive: true });
      setCities(res.items ?? []);
    } catch (e) {
      setCitiesError(humanAdminError(e));
    } finally {
      setCitiesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "cities") {
      void refreshCities();
      // Also load countries for the filter
      if (countries.length === 0) {
        void refreshCountries();
      }
    }
  }, [tab, refreshCities, refreshCountries, countries.length]);

  const openNewCity = useCallback(() => {
    // Get default country code
    const defaultCountry = countries.find(c => c.is_default);
    setCityEditor({
      name: "",
      slug: "",
      image_url: null,
      is_active: true,
      country_code: defaultCountry?.code || "MA",
    });
    setCityDialogOpen(true);
  }, [countries]);

  const openEditCity = useCallback((c: HomeCityAdmin) => {
    setCityEditor({
      id: c.id,
      name: c.name,
      slug: c.slug,
      image_url: c.image_url,
      is_active: c.is_active,
      country_code: c.country_code || "MA",
    });
    setCityDialogOpen(true);
  }, []);

  const handleDeleteCity = useCallback(
    async (c: HomeCityAdmin) => {
      if (!confirm(`Supprimer la ville "${c.name}" ?`)) return;
      try {
        await deleteAdminHomeCity(undefined, c.id);
        toast({ title: "Ville supprimée" });
        await refreshCities();
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
      }
    },
    [refreshCities, toast],
  );

  const handleToggleCityActive = useCallback(
    async (c: HomeCityAdmin) => {
      try {
        await updateAdminHomeCity(undefined, {
          id: c.id,
          is_active: !c.is_active,
        });
        toast({
          title: c.is_active ? "Ville désactivée" : "Ville activée",
        });
        await refreshCities();
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
      }
    },
    [refreshCities, toast],
  );

  const saveCity = useCallback(async () => {
    if (!cityEditor) return;
    if (!cityEditor.name || !cityEditor.slug) {
      toast({
        title: "Erreur",
        description: "Le nom et le slug sont obligatoires",
        variant: "destructive",
      });
      return;
    }

    setCitySaving(true);
    try {
      if (!cityEditor.id) {
        await createAdminHomeCity(undefined, {
          name: cityEditor.name,
          slug: cityEditor.slug,
          image_url: cityEditor.image_url,
          is_active: cityEditor.is_active,
          country_code: cityEditor.country_code,
        });
      } else {
        await updateAdminHomeCity(undefined, {
          id: cityEditor.id,
          name: cityEditor.name,
          slug: cityEditor.slug,
          image_url: cityEditor.image_url,
          is_active: cityEditor.is_active,
          country_code: cityEditor.country_code,
        });
      }
      toast({ title: "Enregistré" });
      setCityDialogOpen(false);
      await refreshCities();
    } catch (e) {
      toast({
        title: "Erreur",
        description: humanAdminError(e),
        variant: "destructive",
      });
    } finally {
      setCitySaving(false);
    }
  }, [cityEditor, refreshCities, toast]);

  const handleCityImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !cityEditor?.id) return;

      setCityImageUploading(true);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;
          const res = await uploadAdminHomeCityImage(
            undefined,
            cityEditor.id!,
            base64,
            file.type,
          );
          setCityEditor((prev) =>
            prev ? { ...prev, image_url: res.url } : prev,
          );
          toast({ title: "Image téléversée" });
          setCityImageUploading(false);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        toast({
          title: "Erreur",
          description: humanAdminError(err),
          variant: "destructive",
        });
        setCityImageUploading(false);
      }
    },
    [cityEditor, toast],
  );

  const handleCityDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = cities.findIndex((c) => c.id === active.id);
      const newIndex = cities.findIndex((c) => c.id === over.id);

      const newOrder = arrayMove(cities, oldIndex, newIndex);
      setCities(newOrder);

      try {
        await reorderAdminHomeCities(
          undefined,
          newOrder.map((c) => c.id),
        );
        toast({ title: "Ordre mis à jour" });
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
        await refreshCities();
      }
    },
    [cities, refreshCities, toast],
  );

  // ==================== VIDEOS LOGIC ====================
  const refreshVideos = useCallback(async () => {
    setVideosLoading(true);
    setVideosError(null);
    try {
      const res = await listAdminHomeVideos(undefined, { includeInactive: true });
      setVideos(res.items ?? []);
    } catch (e) {
      setVideosError(humanAdminError(e));
    } finally {
      setVideosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "videos") {
      void refreshVideos();
    }
  }, [tab, refreshVideos]);

  const openNewVideo = useCallback(() => {
    setVideoEditor({
      youtube_url: "",
      title: "",
      description: null,
      thumbnail_url: null,
      establishment_id: null,
      establishment_name: null,
      is_active: true,
    });
    setVideoDialogOpen(true);
  }, []);

  const openEditVideo = useCallback((v: HomeVideoAdmin) => {
    setVideoEditor({
      id: v.id,
      youtube_url: v.youtube_url,
      title: v.title,
      description: v.description,
      thumbnail_url: v.thumbnail_url ?? null,
      establishment_id: v.establishment_id ?? null,
      establishment_name: v.establishment_name ?? null,
      is_active: v.is_active,
    });
    setVideoDialogOpen(true);
  }, []);

  const handleDeleteVideo = useCallback(
    async (v: HomeVideoAdmin) => {
      if (!confirm(`Supprimer la vidéo "${v.title}" ?`)) return;
      try {
        await deleteAdminHomeVideo(undefined, v.id);
        toast({ title: "Vidéo supprimée" });
        await refreshVideos();
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
      }
    },
    [refreshVideos, toast],
  );

  const handleToggleVideoActive = useCallback(
    async (v: HomeVideoAdmin) => {
      try {
        await updateAdminHomeVideo(undefined, {
          id: v.id,
          is_active: !v.is_active,
        });
        toast({
          title: v.is_active ? "Vidéo désactivée" : "Vidéo activée",
        });
        await refreshVideos();
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
      }
    },
    [refreshVideos, toast],
  );

  const saveVideo = useCallback(async () => {
    if (!videoEditor) return;
    if (!videoEditor.youtube_url || !videoEditor.title) {
      toast({
        title: "Erreur",
        description: "L'URL YouTube et le titre sont obligatoires",
        variant: "destructive",
      });
      return;
    }

    // Validate YouTube URL format
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]+/;
    if (!youtubeRegex.test(videoEditor.youtube_url)) {
      toast({
        title: "Erreur",
        description: "URL YouTube invalide",
        variant: "destructive",
      });
      return;
    }

    setVideoSaving(true);
    try {
      if (!videoEditor.id) {
        await createAdminHomeVideo(undefined, {
          youtube_url: videoEditor.youtube_url,
          title: videoEditor.title,
          description: videoEditor.description,
          thumbnail_url: videoEditor.thumbnail_url,
          establishment_id: videoEditor.establishment_id,
          is_active: videoEditor.is_active,
        });
      } else {
        await updateAdminHomeVideo(undefined, {
          id: videoEditor.id,
          youtube_url: videoEditor.youtube_url,
          title: videoEditor.title,
          description: videoEditor.description,
          thumbnail_url: videoEditor.thumbnail_url,
          establishment_id: videoEditor.establishment_id,
          is_active: videoEditor.is_active,
        });
      }
      toast({ title: "Enregistré" });
      setVideoDialogOpen(false);
      await refreshVideos();
    } catch (e) {
      toast({
        title: "Erreur",
        description: humanAdminError(e),
        variant: "destructive",
      });
    } finally {
      setVideoSaving(false);
    }
  }, [videoEditor, refreshVideos, toast]);

  const handleVideoDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = videos.findIndex((v) => v.id === active.id);
      const newIndex = videos.findIndex((v) => v.id === over.id);

      const newOrder = arrayMove(videos, oldIndex, newIndex);
      setVideos(newOrder);

      try {
        await reorderAdminHomeVideos(
          undefined,
          newOrder.map((v) => v.id),
        );
        toast({ title: "Ordre mis à jour" });
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
        await refreshVideos();
      }
    },
    [videos, refreshVideos, toast],
  );

  // Helper to extract YouTube video ID
  const getYoutubeVideoId = useCallback((url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&?\s]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) return match[1];
    }
    return null;
  }, []);

  // ==================== CATEGORIES (Category Images) LOGIC ====================
  const refreshCategoryImages = useCallback(async () => {
    setCategoryImagesLoading(true);
    setCategoryImagesError(null);

    try {
      const res = await listAdminCategoryImages(undefined, categoryUniverseFilter || undefined);
      const items = Array.isArray(res.items) ? res.items : [];
      setCategoryImages(
        [...items].sort((a, b) => {
          if (a.universe !== b.universe) return a.universe.localeCompare(b.universe);
          return a.display_order - b.display_order;
        }),
      );
    } catch (e) {
      setCategoryImages([]);
      setCategoryImagesError(humanAdminError(e));
    } finally {
      setCategoryImagesLoading(false);
    }
  }, [categoryUniverseFilter]);

  useEffect(() => {
    if (tab === "categories") {
      void refreshCategoryImages();
    }
  }, [tab, refreshCategoryImages]);

  const openNewCategory = useCallback(() => {
    setCategoryEditor({
      universe: "restaurants",
      category_id: "",
      category_slug: "",
      name: "",
      image_url: "",
      display_order: 0,
      is_active: true,
    });
    setCategoryDialogOpen(true);
  }, []);

  const openCategoryEditor = useCallback((row: CategoryImageAdmin) => {
    setCategoryEditor({
      id: row.id,
      universe: row.universe,
      category_id: row.category_id,
      category_slug: row.category_slug ?? "",
      name: row.name,
      image_url: row.image_url,
      display_order: row.display_order,
      is_active: row.is_active,
    });
    setCategoryDialogOpen(true);
  }, []);

  const deleteCategory = useCallback(
    async (row: CategoryImageAdmin) => {
      const ok = window.confirm(`Supprimer la catégorie "${row.name}" ?`);
      if (!ok) return;

      try {
        await deleteAdminCategoryImage(undefined, row.id);
        toast({ title: "Supprimé", description: "Catégorie supprimée." });
        await refreshCategoryImages();
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
      }
    },
    [refreshCategoryImages, toast],
  );

  const handleCategoryImageUpload = useCallback(
    async (file: File | null) => {
      if (!file || !categoryEditor) return;

      const validTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Type de fichier non supporté",
          description: "Formats acceptés: JPEG, PNG, WebP",
          variant: "destructive",
        });
        return;
      }

      const maxBytes = 2 * 1024 * 1024; // 2MB
      if (file.size > maxBytes) {
        toast({
          title: "Fichier trop volumineux",
          description: "L'image doit faire moins de 2 Mo",
          variant: "destructive",
        });
        return;
      }

      setCategoryImageUploading(true);
      try {
        const result = await uploadAdminCategoryImage(undefined, {
          file,
          fileName: file.name,
        });
        setCategoryEditor((prev) =>
          prev ? { ...prev, image_url: result.item.public_url } : prev,
        );
        toast({ title: "Image téléchargée", description: "L'image a été uploadée avec succès." });
      } catch (e) {
        toast({
          title: "Erreur d'upload",
          description: humanAdminError(e),
          variant: "destructive",
        });
      } finally {
        setCategoryImageUploading(false);
      }
    },
    [categoryEditor, toast],
  );

  const saveCategory = useCallback(async () => {
    if (!categoryEditor) return;

    if (!categoryEditor.category_id.trim()) {
      toast({
        title: "Erreur",
        description: "L'ID de catégorie est requis.",
        variant: "destructive",
      });
      return;
    }

    if (!categoryEditor.name.trim()) {
      toast({
        title: "Erreur",
        description: "Le nom est requis.",
        variant: "destructive",
      });
      return;
    }

    if (!categoryEditor.image_url.trim()) {
      toast({
        title: "Erreur",
        description: "L'URL de l'image est requise.",
        variant: "destructive",
      });
      return;
    }

    setCategorySaving(true);
    try {
      if (!categoryEditor.id) {
        await createAdminCategoryImage(undefined, {
          universe: categoryEditor.universe,
          category_id: categoryEditor.category_id.trim(),
          category_slug: categoryEditor.category_slug?.trim() || undefined,
          name: categoryEditor.name.trim(),
          image_url: categoryEditor.image_url.trim(),
          display_order: categoryEditor.display_order,
          is_active: categoryEditor.is_active,
        });
      } else {
        await updateAdminCategoryImage(undefined, {
          id: categoryEditor.id,
          universe: categoryEditor.universe,
          category_id: categoryEditor.category_id.trim(),
          category_slug: categoryEditor.category_slug?.trim() || undefined,
          name: categoryEditor.name.trim(),
          image_url: categoryEditor.image_url.trim(),
          display_order: categoryEditor.display_order,
          is_active: categoryEditor.is_active,
        });
      }

      toast({ title: "Enregistré", description: "Catégorie mise à jour." });
      setCategoryDialogOpen(false);
      await refreshCategoryImages();
    } catch (e) {
      toast({
        title: "Erreur",
        description: humanAdminError(e),
        variant: "destructive",
      });
    } finally {
      setCategorySaving(false);
    }
  }, [categoryEditor, refreshCategoryImages, toast]);

  const categoryColumns = useMemo<ColumnDef<CategoryImageAdmin>[]>(() => {
    return [
      {
        accessorKey: "universe",
        header: "Univers",
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.universe}
          </Badge>
        ),
      },
      {
        accessorKey: "category_id",
        header: "ID Catégorie",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-slate-700">
            {row.original.category_id}
          </span>
        ),
      },
      {
        accessorKey: "name",
        header: "Nom",
        cell: ({ row }) => (
          <span className="font-semibold text-slate-900">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "image_url",
        header: "Image",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <img
              src={row.original.image_url}
              alt={row.original.name}
              className="w-10 h-10 rounded-full object-cover border"
              onError={(e) => {
                const letter = encodeURIComponent(row.original.name.charAt(0));
                (e.target as HTMLImageElement).src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%2364748b'%3E${letter}%3C/text%3E%3C/svg%3E`;
              }}
            />
          </div>
        ),
      },
      {
        accessorKey: "display_order",
        header: "Ordre",
        cell: ({ row }) => (
          <span className="text-slate-600">{row.original.display_order}</span>
        ),
      },
      {
        accessorKey: "is_active",
        header: "Actif",
        cell: ({ row }) => (
          <span
            className={
              row.original.is_active
                ? "text-emerald-700 font-semibold"
                : "text-slate-400"
            }
          >
            {row.original.is_active ? "Oui" : "Non"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => openCategoryEditor(row.original)}
            >
              <Edit3 className="h-4 w-4" />
              Éditer
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="text-red-700 hover:text-red-700"
              onClick={() => void deleteCategory(row.original)}
              aria-label="Supprimer la catégorie"
              title="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ];
  }, [deleteCategory, openCategoryEditor]);

  // ==================== CURATION LOGIC ====================
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminHomeCurationItems(undefined, {
        universe: universeFilter || undefined,
        kind: (kindFilter as HomeCurationKind) || undefined,
      });
      setItems(res.items ?? []);
    } catch (e) {
      setError(humanAdminError(e));
    } finally {
      setLoading(false);
    }
  }, [universeFilter, kindFilter]);

  useEffect(() => {
    if (tab === "curation") {
      void refresh();
    }
  }, [tab, refresh]);

  // Load universes for curation selects
  useEffect(() => {
    if (universes.length === 0) {
      listAdminUniverses(undefined, { includeInactive: false })
        .then((res) => setUniverses(res.items ?? []))
        .catch(() => {});
    }
  }, [universes.length]);

  const openNew = useCallback(() => {
    setEditor({
      universe: universes[0]?.slug || "restaurants",
      kind: "selected_for_you",
      establishment_id: "",
      city: "",
      starts_at: "",
      ends_at: "",
      weight: 100,
      note: "",
    });
    setEstSearch("");
    setEstResults([]);
    setDialogOpen(true);
  }, [universes]);

  const openEdit = useCallback((row: HomeCurationItemAdmin) => {
    setEditor({
      id: row.id,
      universe: row.universe,
      kind: row.kind,
      establishment_id: row.establishment_id,
      establishment_name: row.establishments?.name ?? "",
      city: row.city ?? "",
      starts_at: row.starts_at ?? "",
      ends_at: row.ends_at ?? "",
      weight: row.weight,
      note: row.note ?? "",
    });
    setEstSearch(row.establishments?.name ?? "");
    setEstResults([]);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (row: HomeCurationItemAdmin) => {
      if (!confirm(`Supprimer cet élément de curation ?`)) return;
      try {
        await deleteAdminHomeCurationItem(undefined, row.id);
        toast({ title: "Supprimé" });
        await refresh();
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
      }
    },
    [refresh, toast],
  );

  const save = useCallback(async () => {
    if (!editor) return;
    if (!editor.establishment_id) {
      toast({
        title: "Erreur",
        description: "Sélectionnez un établissement",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (!editor.id) {
        await createAdminHomeCurationItem(undefined, {
          universe: editor.universe,
          kind: editor.kind,
          establishment_id: editor.establishment_id,
          city: editor.city || null,
          starts_at: editor.starts_at || null,
          ends_at: editor.ends_at || null,
          weight: editor.weight,
          note: editor.note || null,
        });
      } else {
        await updateAdminHomeCurationItem(undefined, {
          id: editor.id,
          universe: editor.universe,
          kind: editor.kind,
          establishment_id: editor.establishment_id,
          city: editor.city || null,
          starts_at: editor.starts_at || null,
          ends_at: editor.ends_at || null,
          weight: editor.weight,
          note: editor.note || null,
        });
      }
      toast({ title: "Enregistré" });
      setDialogOpen(false);
      await refresh();
    } catch (e) {
      toast({
        title: "Erreur",
        description: humanAdminError(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [editor, refresh, toast]);

  // Load establishments for search
  useEffect(() => {
    if (!establishmentsLoaded) {
      listAdminEstablishmentsForSearch(undefined)
        .then((res) => {
          setAllEstablishments(res.items ?? []);
          setEstablishmentsLoaded(true);
        })
        .catch(() => {
          setEstablishmentsLoaded(true);
        });
    }
  }, [establishmentsLoaded]);

  // Filter establishments based on search query
  useEffect(() => {
    if (!estSearch || estSearch.length < 2) {
      setEstResults([]);
      return;
    }
    const query = estSearch.toLowerCase();
    const filtered = allEstablishments
      .filter(
        (e) =>
          e.name?.toLowerCase().includes(query) ||
          e.city?.toLowerCase().includes(query),
      )
      .slice(0, 10)
      .map((e) => ({
        id: e.id,
        name: e.name,
        city: e.city ?? null,
      }));
    setEstResults(filtered);
  }, [estSearch, allEstablishments]);

  const columns: ColumnDef<HomeCurationItemAdmin>[] = useMemo(
    () => [
      {
        accessorKey: "establishments.name",
        header: "Établissement",
        cell: ({ row }) => {
          const est = row.original.establishments;
          return (
            <div className="flex items-center gap-3">
              {est?.cover_url && (
                <img
                  src={est.cover_url}
                  alt=""
                  className="w-10 h-10 rounded object-cover"
                />
              )}
              <div>
                <div className="font-medium">{est?.name ?? "—"}</div>
                <div className="text-xs text-slate-500">{est?.city ?? ""}</div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "kind",
        header: "Section",
        cell: ({ row }) => {
          const kind = CURATION_KINDS.find(
            (k) => k.value === row.original.kind,
          );
          return (
            <Badge variant="outline" className="gap-1">
              {kind?.icon && <kind.icon className="w-3 h-3" />}
              {kind?.label ?? row.original.kind}
            </Badge>
          );
        },
      },
      {
        accessorKey: "universe",
        header: "Univers",
        cell: ({ row }) => {
          const u = universes.find((x) => x.slug === row.original.universe);
          return (
            <div className="flex items-center gap-2">
              {u && (
                <DynamicLucideIcon
                  name={u.icon_name}
                  className="w-4 h-4"
                  style={{ color: u.color }}
                />
              )}
              <span>{u?.label_fr ?? row.original.universe}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "city",
        header: "Ville",
        cell: ({ row }) => row.original.city || "Toutes",
      },
      {
        accessorKey: "weight",
        header: "Poids",
        cell: ({ row }) => row.original.weight,
      },
      {
        accessorKey: "starts_at",
        header: "Période",
        cell: ({ row }) => {
          const start = row.original.starts_at;
          const end = row.original.ends_at;
          if (!start && !end) return "Permanent";
          return `${start?.split("T")[0] ?? "..."} → ${end?.split("T")[0] ?? "..."}`;
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openEdit(row.original)}
            >
              <Edit3 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-red-600 hover:text-red-700"
              onClick={() => handleDelete(row.original)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ),
      },
    ],
    [openEdit, handleDelete, universes],
  );

  // ==================== FOOTER LOGIC ====================
  const refreshFooterSettings = useCallback(async () => {
    setFooterLoading(true);
    try {
      const { items } = await listPlatformSettings();
      const footerItems = items.filter((s: PlatformSetting) => s.category === "footer");
      const map: Record<string, string> = { ...footerSocials };
      for (const item of footerItems) {
        map[item.key] = item.value;
      }
      setFooterSocials(map);
    } catch (e) {
      toast({ title: "Erreur", description: humanAdminError(e), variant: "destructive" });
    } finally {
      setFooterLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "footer") {
      void refreshFooterSettings();
    }
  }, [tab, refreshFooterSettings]);

  const saveFooterSocials = async () => {
    setFooterSaving(true);
    try {
      for (const [key, value] of Object.entries(footerSocials)) {
        await updatePlatformSetting(undefined, { key, value });
      }
      toast({ title: "Enregistré", description: "Liens sociaux du footer mis à jour." });
    } catch (e) {
      toast({ title: "Erreur", description: humanAdminError(e), variant: "destructive" });
    } finally {
      setFooterSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <AdminPageHeader
        title="Gestion de la page d'accueil"
        description="Configurez les sections et le contenu mis en avant sur la homepage"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="appearance">Apparence</TabsTrigger>
          <TabsTrigger value="curation">Sections Homepage</TabsTrigger>
          <TabsTrigger value="universes">Univers</TabsTrigger>
          <TabsTrigger value="countries">Pays</TabsTrigger>
          <TabsTrigger value="cities">Villes</TabsTrigger>
          <TabsTrigger value="videos">Vidéos</TabsTrigger>
          <TabsTrigger value="categories">Catégories</TabsTrigger>
          <TabsTrigger value="footer">Footer</TabsTrigger>
        </TabsList>

        {/* ==================== APPEARANCE TAB ==================== */}
        <TabsContent value="appearance" className="space-y-6 mt-4">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Image d'arrière-plan du Hero
            </h3>

            <div className="space-y-4">
              <div className="text-sm text-slate-600">
                <p>Personnalisez l'arrière-plan de la section principale de la homepage.</p>
                <p className="mt-1">
                  <strong>Résolution recommandée :</strong> 1920 × 500 px (Desktop) • Format : JPG, PNG ou WebP • Max 5 Mo
                </p>
              </div>

              {settingsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : (
                <>
                  {/* Current image preview */}
                  {homeSettings?.hero.background_image_url ? (
                    <div className="relative rounded-lg overflow-hidden border border-slate-200">
                      <div className="aspect-[4/1] relative">
                        <img
                          src={homeSettings.hero.background_image_url}
                          alt="Hero background"
                          className="w-full h-full object-cover"
                        />
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-primary to-[#6a000f]"
                          style={{ opacity: homeSettings.hero.overlay_opacity }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-white text-xl font-bold drop-shadow-lg">
                            Aperçu du Hero
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 end-2 gap-1"
                        onClick={handleDeleteHeroImage}
                        disabled={heroDeleting}
                      >
                        {heroDeleting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                        Supprimer
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                      <div
                        className="aspect-[4/1] rounded-lg flex items-center justify-center mb-4"
                        style={{ background: "linear-gradient(to right, #a3001d, #6a000f)" }}
                      >
                        <span className="text-white text-xl font-bold">
                          Gradient par défaut
                        </span>
                      </div>
                      <p className="text-sm text-slate-500">
                        Aucune image personnalisée. Le gradient rouge par défaut est utilisé.
                      </p>
                    </div>
                  )}

                  {/* Upload button */}
                  <div className="flex items-center gap-4">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleHeroImageUpload}
                        disabled={heroUploading}
                      />
                      <Button asChild disabled={heroUploading}>
                        <span className="gap-2">
                          {heroUploading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          {homeSettings?.hero.background_image_url
                            ? "Changer l'image"
                            : "Télécharger une image"}
                        </span>
                      </Button>
                    </label>
                  </div>

                  {/* Overlay opacity slider */}
                  {homeSettings?.hero.background_image_url && (
                    <div className="space-y-2 pt-4 border-t border-slate-200">
                      <Label className="text-sm font-medium">
                        Opacité de l'overlay ({Math.round((homeSettings.hero.overlay_opacity ?? 0.7) * 100)}%)
                      </Label>
                      <p className="text-xs text-slate-500">
                        Ajustez l'intensité du dégradé rouge au-dessus de l'image pour assurer la lisibilité du texte.
                      </p>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round((homeSettings.hero.overlay_opacity ?? 0.7) * 100)}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) / 100;
                          setHomeSettings((prev) => prev ? {
                            ...prev,
                            hero: { ...prev.hero, overlay_opacity: val },
                          } : prev);
                        }}
                        onMouseUp={(e) => {
                          const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
                          void handleOverlayOpacityChange(val);
                        }}
                        onTouchEnd={(e) => {
                          const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
                          void handleOverlayOpacityChange(val);
                        }}
                        className="w-full max-w-xs"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ==================== HERO TEXTS SECTION ==================== */}
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5" />
                Textes du Hero
              </h3>
              <Button
                onClick={handleSaveHeroTexts}
                disabled={heroTextsSaving || settingsLoading}
                size="sm"
                className="gap-2"
              >
                {heroTextsSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Enregistrer
              </Button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Personnalisez le titre et le sous-titre affichés sur la section Hero de la page d'accueil.
                Laissez vide pour utiliser les textes par défaut.
              </p>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="hero-title" className="text-sm font-medium">
                    Titre principal
                  </Label>
                  <Input
                    id="hero-title"
                    value={homeSettings?.hero.title ?? ""}
                    onChange={(e) => {
                      setHomeSettings((prev) => prev ? {
                        ...prev,
                        hero: { ...prev.hero, title: e.target.value || null },
                      } : prev);
                    }}
                    placeholder="Découvrez et réservez les meilleures activités"
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Texte par défaut : "Découvrez et réservez les meilleures activités"
                  </p>
                </div>

                <div>
                  <Label htmlFor="hero-subtitle" className="text-sm font-medium">
                    Sous-titre
                  </Label>
                  <Input
                    id="hero-subtitle"
                    value={homeSettings?.hero.subtitle ?? ""}
                    onChange={(e) => {
                      setHomeSettings((prev) => prev ? {
                        ...prev,
                        hero: { ...prev.hero, subtitle: e.target.value || null },
                      } : prev);
                    }}
                    placeholder="Restaurants, loisirs, wellness et bien plus. Réservez en ligne au Maroc"
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Texte par défaut : "Restaurants, loisirs, wellness et bien plus. Réservez en ligne au Maroc"
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900 mb-2">Conseils pour l'image du Hero</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600">
              <div>• Image <strong>large et panoramique</strong> (ratio ~4:1)</div>
              <div>• Fichier optimisé pour un chargement rapide</div>
              <div>• Tons <strong>sombres ou neutres</strong> pour le contraste</div>
              <div>• Overlay ajustable pour la lisibilité</div>
              <div>• Évitez les images trop détaillées</div>
            </div>
          </div>

          {/* ==================== BLOG HERO SECTION ==================== */}
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Hero de la page Blog
              </h3>
              <Button
                onClick={handleSaveBlogHero}
                disabled={blogHeroSaving}
                size="sm"
                className="gap-2"
              >
                {blogHeroSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Enregistrer
              </Button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Personnalisez l'apparence de la section Hero sur la page Blog.
                Le fond rouge dégradé est appliqué par défaut pour correspondre à la page d'accueil.
              </p>

              {/* Preview */}
              <div className="rounded-lg overflow-hidden border border-slate-200">
                <div
                  className="relative py-8 px-4 text-white text-center"
                  style={{
                    background: blogHeroSettings.background_image_url
                      ? `linear-gradient(to right, rgba(163, 0, 29, ${blogHeroSettings.overlay_opacity}), rgba(106, 0, 15, ${blogHeroSettings.overlay_opacity})), url(${blogHeroSettings.background_image_url}) center/cover`
                      : "linear-gradient(to right, #a3001d, #6a000f)",
                  }}
                >
                  <h4 className="text-xl font-bold mb-1">
                    {blogHeroSettings.title || "Blog"}
                  </h4>
                  <p className="text-sm text-white/90">
                    {blogHeroSettings.subtitle || "Actualités, guides et conseils pour vos sorties au Maroc."}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="blog-hero-title" className="text-sm font-medium">
                    Titre du Blog
                  </Label>
                  <Input
                    id="blog-hero-title"
                    value={blogHeroSettings.title}
                    onChange={(e) => {
                      setBlogHeroSettings((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }));
                    }}
                    placeholder="Blog"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="blog-hero-subtitle" className="text-sm font-medium">
                    Sous-titre du Blog
                  </Label>
                  <Input
                    id="blog-hero-subtitle"
                    value={blogHeroSettings.subtitle}
                    onChange={(e) => {
                      setBlogHeroSettings((prev) => ({
                        ...prev,
                        subtitle: e.target.value,
                      }));
                    }}
                    placeholder="Actualités, guides et conseils pour vos sorties au Maroc."
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="blog-hero-image" className="text-sm font-medium">
                    Image de fond (optionnel)
                  </Label>
                  <Input
                    id="blog-hero-image"
                    value={blogHeroSettings.background_image_url || ""}
                    onChange={(e) => {
                      setBlogHeroSettings((prev) => ({
                        ...prev,
                        background_image_url: e.target.value || null,
                      }));
                    }}
                    placeholder="https://example.com/image.jpg"
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Laissez vide pour utiliser le dégradé rouge par défaut
                  </p>
                </div>

                {blogHeroSettings.background_image_url && (
                  <div>
                    <Label className="text-sm font-medium">
                      Opacité de l'overlay : {Math.round(blogHeroSettings.overlay_opacity * 100)}%
                    </Label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(blogHeroSettings.overlay_opacity * 100)}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) / 100;
                        setBlogHeroSettings((prev) => ({
                          ...prev,
                          overlay_opacity: val,
                        }));
                      }}
                      className="w-full max-w-xs mt-1"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ==================== HOW IT WORKS SECTION ==================== */}
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Info className="w-5 h-5" />
                Section "Comment ça marche ?"
              </h3>
              <Button
                onClick={handleSaveHowItWorks}
                disabled={howItWorksSaving || settingsLoading}
                size="sm"
                className="gap-2"
              >
                {howItWorksSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Enregistrer
              </Button>
            </div>

            <div className="space-y-4">
              {/* Section Title */}
              <div className="flex items-center gap-3">
                <Label htmlFor="how-it-works-title" className="whitespace-nowrap text-sm">Titre :</Label>
                <Input
                  id="how-it-works-title"
                  value={howItWorksData.title}
                  onChange={(e) => handleHowItWorksChange("title", e.target.value)}
                  placeholder="Comment ça marche ?"
                  className="max-w-sm"
                />
              </div>

              {/* Compact Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {howItWorksData.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex gap-3"
                  >
                    <div className="flex-shrink-0">
                      <LucideIconPicker
                        value={item.icon}
                        onChange={(icon) => handleHowItWorksItemChange(idx, "icon", icon)}
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <Input
                        value={item.title}
                        onChange={(e) => handleHowItWorksItemChange(idx, "title", e.target.value)}
                        placeholder="Titre"
                        className="h-8 text-sm"
                      />
                      <Textarea
                        value={item.description}
                        onChange={(e) => handleHowItWorksItemChange(idx, "description", e.target.value)}
                        placeholder="Description..."
                        rows={2}
                        className="text-sm resize-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ==================== CURATION TAB ==================== */}
        <TabsContent value="curation" className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-2">
              <Select
                value={universeFilter || "all"}
                onValueChange={(v) =>
                  setUniverseFilter(v === "all" ? "" : v)
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tous les univers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les univers</SelectItem>
                  {universes
                    .filter((u) => u.is_active)
                    .map((u) => (
                      <SelectItem key={u.slug} value={u.slug}>
                        {u.label_fr}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              <Select
                value={kindFilter || "all"}
                onValueChange={(v) => setKindFilter(v === "all" ? "" : v)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Toutes les sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les sections</SelectItem>
                  {CURATION_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button className="gap-2" onClick={openNew}>
              <Plus className="w-4 h-4" />
              Ajouter un établissement
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <AdminDataTable columns={columns} data={items} isLoading={loading} />

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900 mb-2">
              Comment ça fonctionne ?
            </h3>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>
                • <strong>Nos meilleures offres</strong> : établissements avec
                promotions actives
              </li>
              <li>
                • <strong>Sélectionnés pour vous</strong> : recommandations
                personnalisées
              </li>
              <li>
                • <strong>À proximité</strong> : établissements proches de
                l'utilisateur
              </li>
              <li>
                • <strong>Les plus réservés</strong> : établissements populaires
                du mois
              </li>
              <li>
                • Le <strong>poids</strong> détermine l'ordre d'affichage (plus
                élevé = plus haut)
              </li>
              <li>
                • Les <strong>dates</strong> permettent de programmer des mises
                en avant temporaires
              </li>
            </ul>
          </div>
        </TabsContent>

        {/* ==================== UNIVERSES TAB ==================== */}
        <TabsContent value="universes" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-600">
              Glissez-déposez pour réorganiser l'ordre d'affichage sur la page
              d'accueil.
            </p>
            <Button className="gap-2" onClick={openNewUniverse}>
              <Plus className="w-4 h-4" />
              Ajouter un univers
            </Button>
          </div>

          {universesError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {universesError}
            </div>
          )}

          {universesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={universes.map((u) => u.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {universes.map((universe) => (
                    <SortableUniverseRow
                      key={universe.id}
                      universe={universe}
                      onEdit={openEditUniverse}
                      onDelete={handleDeleteUniverse}
                      onToggleActive={handleToggleUniverseActive}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900 mb-2">
              À propos des univers
            </h3>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>
                • Les univers s'affichent dans l'ordre défini sur la page
                d'accueil
              </li>
              <li>
                • Les univers désactivés ne sont pas visibles pour les
                utilisateurs
              </li>
              <li>
                • Un univers ne peut être supprimé que s'il n'est utilisé par
                aucun établissement
              </li>
            </ul>
          </div>
        </TabsContent>

        {/* ==================== COUNTRIES TAB ==================== */}
        <TabsContent value="countries" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-600">
              Gérez les pays où la plateforme opère. Le pays détecté automatiquement filtrera les villes affichées.
            </p>
            <Button className="gap-2" onClick={openNewCountry}>
              <Plus className="w-4 h-4" />
              Ajouter un pays
            </Button>
          </div>

          {countriesError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {countriesError}
            </div>
          )}

          {countriesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : countries.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucun pays configuré</p>
              <p className="text-sm mt-1">
                Ajoutez des pays pour permettre le filtrage géographique
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleCountryDragEnd}
            >
              <SortableContext
                items={countries.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {countries.map((country) => (
                    <SortableCountryRow
                      key={country.id}
                      country={country}
                      onEdit={openEditCountry}
                      onDelete={handleDeleteCountry}
                      onToggleActive={handleToggleCountryActive}
                      onSetDefault={handleSetDefaultCountry}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900 mb-2">
              À propos des pays
            </h3>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>
                • Le pays par défaut (⭐) est utilisé si la détection automatique échoue
              </li>
              <li>
                • Les villes sont associées à un pays via leur code pays (MA, FR, etc.)
              </li>
              <li>
                • La détection automatique utilise l'adresse IP de l'utilisateur
              </li>
              <li>
                • Les pays désactivés ne sont pas proposés aux utilisateurs
              </li>
            </ul>
          </div>
        </TabsContent>

        {/* ==================== CITIES TAB ==================== */}
        <TabsContent value="cities" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <p className="text-sm text-slate-600">
                Gérez les villes affichées dans la section "Autres villes" de la page d'accueil.
              </p>
              {countries.length > 1 && (
                <Select value={cityCountryFilter || "__all__"} onValueChange={(v) => setCityCountryFilter(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Tous les pays" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tous les pays</SelectItem>
                    {countries.map((c) => (
                      <SelectItem key={c.id} value={c.code}>
                        {c.flag_emoji} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button className="gap-2" onClick={openNewCity}>
              <Plus className="w-4 h-4" />
              Ajouter une ville
            </Button>
          </div>

          {citiesError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {citiesError}
            </div>
          )}

          {citiesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : cities.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucune ville configurée</p>
              <p className="text-sm mt-1">
                Ajoutez des villes pour les afficher sur la page d'accueil
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleCityDragEnd}
            >
              <SortableContext
                items={cities.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {cities.map((city) => (
                    <SortableCityRow
                      key={city.id}
                      city={city}
                      onEdit={openEditCity}
                      onDelete={handleDeleteCity}
                      onToggleActive={handleToggleCityActive}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900 mb-2">
              À propos des villes
            </h3>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>
                • Les villes s'affichent dans l'ordre défini dans la section "Autres villes au Maroc"
              </li>
              <li>
                • Chaque ville a une image de couverture et un slug pour l'URL
              </li>
              <li>
                • En cliquant sur une ville, l'utilisateur voit tous les établissements par univers
              </li>
              <li>
                • Les villes désactivées ne sont pas visibles pour les utilisateurs
              </li>
            </ul>
          </div>
        </TabsContent>

        {/* ==================== VIDEOS TAB ==================== */}
        <TabsContent value="videos" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-600">
              Gérez les vidéos YouTube affichées dans la section vidéos de la page d'accueil.
            </p>
            <Button className="gap-2" onClick={openNewVideo}>
              <Plus className="w-4 h-4" />
              Ajouter une vidéo
            </Button>
          </div>

          {videosError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {videosError}
            </div>
          )}

          {videosLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Video className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucune vidéo configurée</p>
              <p className="text-sm mt-1">
                Ajoutez des vidéos YouTube pour les afficher sur la page d'accueil
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleVideoDragEnd}
            >
              <SortableContext
                items={videos.map((v) => v.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {videos.map((video) => (
                    <SortableVideoRow
                      key={video.id}
                      video={video}
                      onEdit={openEditVideo}
                      onDelete={handleDeleteVideo}
                      onToggleActive={handleToggleVideoActive}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900 mb-2">
              A propos des vidéos
            </h3>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>
                • Les vidéos s'affichent dans un carousel sur la page d'accueil
              </li>
              <li>
                • Utilisez des URLs YouTube valides (youtube.com/watch?v=..., youtu.be/..., etc.)
              </li>
              <li>
                • Les miniatures sont automatiquement extraites de YouTube
              </li>
              <li>
                • Sur mobile: toucher 3 secondes affiche un aperçu animé, cliquer ouvre en plein écran
              </li>
              <li>
                • Sur desktop: cliquer ouvre un lecteur modal avec option plein écran
              </li>
              <li>
                • Les vidéos désactivées ne sont pas visibles pour les utilisateurs
              </li>
            </ul>
          </div>
        </TabsContent>

        {/* ==================== CATEGORIES TAB ==================== */}
        <TabsContent value="categories" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <p className="text-sm text-slate-600">
                Gérez les catégories pour la section "Votre envie du moment".
              </p>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-slate-600">Filtrer:</Label>
                <Select
                  value={categoryUniverseFilter}
                  onValueChange={(v) => setCategoryUniverseFilter(v === "__all__" ? "" : v)}
                >
                  <SelectTrigger className="w-40 h-8">
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tous</SelectItem>
                    {UNIVERSES.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="gap-2" onClick={openNewCategory}>
              <Plus className="w-4 h-4" />
              Ajouter une catégorie
            </Button>
          </div>

          {categoryImagesError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {categoryImagesError}
            </div>
          )}

          {categoryImagesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : categoryImages.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <Image className="h-10 w-10 mx-auto text-slate-400 mb-3" />
              <p className="text-slate-600 mb-2">Aucune catégorie configurée</p>
              <p className="text-sm text-slate-500">
                Les catégories définissent les images affichées sur la page d'accueil.
              </p>
            </div>
          ) : (
            <AdminDataTable columns={categoryColumns} data={categoryImages} />
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900 mb-2">
              À propos des catégories
            </h3>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>
                • Exemple : Français, Italien, Asiatique, Hammam, Spa, etc.
              </li>
              <li>
                • Les catégories s'affichent dans la section "Votre envie du moment" sur la homepage
              </li>
              <li>
                • L'ordre d'affichage est défini par le champ "Ordre"
              </li>
            </ul>
          </div>
        </TabsContent>

        {/* ==================== FOOTER TAB ==================== */}
        <TabsContent value="footer" className="space-y-4 mt-4">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Réseaux sociaux du footer
            </h3>
            <p className="text-sm text-slate-600 mb-6">
              Configurez les URLs de vos réseaux sociaux affichés dans le pied de page du site.
              Laissez un champ vide pour masquer le réseau correspondant.
            </p>

            {footerLoading ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Chargement...
              </div>
            ) : (
              <div className="space-y-4 max-w-xl">
                {[
                  { key: "FOOTER_SOCIAL_INSTAGRAM", label: "Instagram", placeholder: "https://instagram.com/sortiraumaroc" },
                  { key: "FOOTER_SOCIAL_TIKTOK", label: "TikTok", placeholder: "https://tiktok.com/@sortiraumaroc" },
                  { key: "FOOTER_SOCIAL_FACEBOOK", label: "Facebook", placeholder: "https://facebook.com/sortiraumaroc" },
                  { key: "FOOTER_SOCIAL_YOUTUBE", label: "YouTube", placeholder: "https://youtube.com/@sortiraumaroc" },
                  { key: "FOOTER_SOCIAL_SNAPCHAT", label: "Snapchat", placeholder: "https://snapchat.com/add/sortiraumaroc" },
                  { key: "FOOTER_SOCIAL_LINKEDIN", label: "LinkedIn", placeholder: "https://linkedin.com/company/sortiraumaroc" },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <Label htmlFor={key}>{label}</Label>
                    <Input
                      id={key}
                      value={footerSocials[key] || ""}
                      onChange={(e) => setFooterSocials((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="mt-1"
                    />
                  </div>
                ))}
                <Button onClick={() => void saveFooterSocials()} disabled={footerSaving}>
                  {footerSaving ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Save className="w-4 h-4 me-2" />}
                  Enregistrer
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ==================== CURATION EDITOR DIALOG ==================== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editor?.id ? "Modifier l'élément" : "Ajouter un établissement"}
            </DialogTitle>
          </DialogHeader>

          {editor && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Univers *</Label>
                  <Select
                    value={editor.universe}
                    onValueChange={(v) =>
                      setEditor((prev) =>
                        prev ? { ...prev, universe: v } : prev,
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {universes
                        .filter((u) => u.is_active)
                        .map((u) => (
                          <SelectItem key={u.slug} value={u.slug}>
                            {u.label_fr}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Section *</Label>
                  <Select
                    value={editor.kind}
                    onValueChange={(v) =>
                      setEditor((prev) =>
                        prev
                          ? { ...prev, kind: v as HomeCurationKind }
                          : prev,
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURATION_KINDS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Établissement *</Label>
                <Input
                  value={estSearch}
                  onChange={(e) => {
                    setEstSearch(e.target.value);
                    if (!e.target.value) {
                      setEditor((prev) =>
                        prev ? { ...prev, establishment_id: "" } : prev,
                      );
                    }
                  }}
                  placeholder="Rechercher un établissement..."
                />
                {estResults.length > 0 && (
                  <div className="border rounded-md max-h-40 overflow-y-auto">
                    {estResults.map((est) => (
                      <button
                        key={est.id}
                        type="button"
                        className="w-full text-start px-3 py-2 hover:bg-slate-100 text-sm"
                        onClick={() => {
                          setEditor((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  establishment_id: est.id,
                                  establishment_name: est.name,
                                }
                              : prev,
                          );
                          setEstSearch(est.name);
                          setEstResults([]);
                        }}
                      >
                        <div className="font-medium">{est.name}</div>
                        {est.city && (
                          <div className="text-xs text-slate-500">
                            {est.city}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {editor.establishment_id && (
                  <div className="text-xs text-green-600">
                    Sélectionné:{" "}
                    {editor.establishment_name || editor.establishment_id}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Ville (optionnel)</Label>
                <Input
                  value={editor.city}
                  onChange={(e) =>
                    setEditor((prev) =>
                      prev ? { ...prev, city: e.target.value } : prev,
                    )
                  }
                  placeholder="Laisser vide pour toutes les villes"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Date de début</Label>
                  <Input
                    type="datetime-local"
                    value={editor.starts_at}
                    onChange={(e) =>
                      setEditor((prev) =>
                        prev ? { ...prev, starts_at: e.target.value } : prev,
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date de fin</Label>
                  <Input
                    type="datetime-local"
                    value={editor.ends_at}
                    onChange={(e) =>
                      setEditor((prev) =>
                        prev ? { ...prev, ends_at: e.target.value } : prev,
                      )
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Poids (priorité d'affichage)</Label>
                <Input
                  type="number"
                  value={editor.weight}
                  onChange={(e) =>
                    setEditor((prev) =>
                      prev
                        ? { ...prev, weight: parseInt(e.target.value) || 0 }
                        : prev,
                    )
                  }
                  min={0}
                  max={1000}
                />
                <p className="text-xs text-slate-500">
                  Plus le poids est élevé, plus l'établissement apparaît en haut
                  de la section.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Note interne</Label>
                <Textarea
                  value={editor.note}
                  onChange={(e) =>
                    setEditor((prev) =>
                      prev ? { ...prev, note: e.target.value } : prev,
                    )
                  }
                  placeholder="Note visible uniquement par les admins..."
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== UNIVERSE EDITOR DIALOG ==================== */}
      <Dialog open={universeDialogOpen} onOpenChange={setUniverseDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {universeEditor?.id
                ? "Modifier l'univers"
                : "Ajouter un univers"}
            </DialogTitle>
          </DialogHeader>

          {universeEditor && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Slug (identifiant unique) *</Label>
                <Input
                  value={universeEditor.slug}
                  onChange={(e) =>
                    setUniverseEditor((prev) =>
                      prev
                        ? {
                            ...prev,
                            slug: e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9_-]/g, ""),
                          }
                        : prev,
                    )
                  }
                  placeholder="ex: restaurants, sport, loisirs"
                  disabled={!!universeEditor.id}
                />
                {universeEditor.id && (
                  <p className="text-xs text-slate-500">
                    Le slug ne peut pas être modifié après création
                  </p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Label FR *</Label>
                  <Input
                    value={universeEditor.label_fr}
                    onChange={(e) =>
                      setUniverseEditor((prev) =>
                        prev ? { ...prev, label_fr: e.target.value } : prev,
                      )
                    }
                    placeholder="ex: Manger & Boire"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Label EN *</Label>
                  <Input
                    value={universeEditor.label_en}
                    onChange={(e) =>
                      setUniverseEditor((prev) =>
                        prev ? { ...prev, label_en: e.target.value } : prev,
                      )
                    }
                    placeholder="ex: Food & drink"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Icône</Label>
                <LucideIconPicker
                  value={universeEditor.icon_name}
                  onChange={(v) =>
                    setUniverseEditor((prev) =>
                      prev ? { ...prev, icon_name: v } : prev,
                    )
                  }
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label>Couleur</Label>
                <ColorPalette
                  value={universeEditor.color}
                  onChange={(v) =>
                    setUniverseEditor((prev) =>
                      prev ? { ...prev, color: v } : prev,
                    )
                  }
                  className="w-full"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <div className="font-medium">Actif</div>
                  <div className="text-sm text-slate-500">
                    Les univers inactifs ne sont pas visibles sur la homepage
                  </div>
                </div>
                <Switch
                  checked={universeEditor.is_active}
                  onCheckedChange={(v) =>
                    setUniverseEditor((prev) =>
                      prev ? { ...prev, is_active: v } : prev,
                    )
                  }
                />
              </div>

              {/* Image Upload */}
              <div className="space-y-2">
                <Label>Image</Label>
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                    {universeEditor.image_url ? (
                      <img
                        src={universeEditor.image_url}
                        alt="Aperçu"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <ImageIcon className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="file"
                      id="universe-image-upload"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        handleUniverseImageUpload(file);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() =>
                        document.getElementById("universe-image-upload")?.click()
                      }
                      disabled={universeImageUploading}
                      className="gap-2"
                    >
                      {universeImageUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Téléchargement...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Télécharger une image
                        </>
                      )}
                    </Button>
                    {universeEditor.image_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setUniverseEditor((prev) =>
                            prev ? { ...prev, image_url: null } : prev,
                          )
                        }
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="w-4 h-4 me-1" />
                        Supprimer l'image
                      </Button>
                    )}
                    <p className="text-xs text-slate-500">
                      Formats: JPEG, PNG, WebP. Max 2 Mo.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Si TOUS les univers ont une image, les images seront affichées à la place des icônes.
                  Sinon, les icônes seront utilisées pour tous.
                </p>
              </div>

              {/* Preview */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-medium text-slate-500 mb-2">
                  Aperçu {universeEditor.image_url ? "(avec image)" : "(avec icône)"}
                </div>
                <div className="flex items-center gap-3">
                  {universeEditor.image_url ? (
                    <img
                      src={universeEditor.image_url}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: `${universeEditor.color}20`,
                      }}
                    >
                      <DynamicLucideIcon
                        name={universeEditor.icon_name}
                        className="w-6 h-6"
                        style={{ color: universeEditor.color }}
                      />
                    </div>
                  )}
                  <div>
                    <div className="font-medium">
                      {universeEditor.label_fr || "Label FR"}
                    </div>
                    <div className="text-sm text-slate-500">
                      {universeEditor.label_en || "Label EN"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUniverseDialogOpen(false)}
              disabled={universeSaving}
            >
              Annuler
            </Button>
            <Button
              onClick={saveUniverse}
              disabled={universeSaving}
              className="gap-2"
            >
              {universeSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== CITY EDITOR DIALOG ==================== */}
      <Dialog open={cityDialogOpen} onOpenChange={setCityDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {cityEditor?.id ? "Modifier la ville" : "Ajouter une ville"}
            </DialogTitle>
          </DialogHeader>

          {cityEditor && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nom de la ville *</Label>
                <Input
                  value={cityEditor.name}
                  onChange={(e) =>
                    setCityEditor((prev) =>
                      prev ? { ...prev, name: e.target.value } : prev,
                    )
                  }
                  placeholder="ex: Casablanca, Marrakech, Rabat"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Slug URL *</Label>
                  <Input
                    value={cityEditor.slug}
                    onChange={(e) =>
                      setCityEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              slug: e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, ""),
                            }
                          : prev,
                      )
                    }
                    placeholder="ex: casablanca, marrakech, rabat"
                  />
                  <p className="text-xs text-slate-500">
                    L'URL sera: /villes/{cityEditor.slug || "slug"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Pays</Label>
                  <Select
                    value={cityEditor.country_code}
                    onValueChange={(v) =>
                      setCityEditor((prev) =>
                        prev ? { ...prev, country_code: v } : prev,
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un pays" />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.length > 0 ? (
                        countries.map((country) => (
                          <SelectItem key={country.id} value={country.code}>
                            {country.flag_emoji} {country.name} ({country.code})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="MA">🇲🇦 Maroc (MA)</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    Code ISO du pays de cette ville
                  </p>
                </div>
              </div>

              {cityEditor.id && (
                <div className="space-y-2">
                  <Label>Image de couverture</Label>
                  <div className="flex items-start gap-4">
                    <div className="w-32 h-24 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                      {cityEditor.image_url ? (
                        <img
                          src={cityEditor.image_url}
                          alt={cityEditor.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <ImageIcon className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <input
                        type="file"
                        id="city-image-upload"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleCityImageUpload}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          document.getElementById("city-image-upload")?.click()
                        }
                        disabled={cityImageUploading}
                        className="gap-2"
                      >
                        {cityImageUploading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {cityEditor.image_url ? "Changer" : "Téléverser"}
                      </Button>
                      <p className="text-xs text-slate-500">
                        Format: JPG, PNG ou WebP • Max 5 Mo
                        <br />
                        Recommandé: 400 × 300 px
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!cityEditor.id && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      Après la création, vous pourrez ajouter une image de couverture.
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <div className="font-medium">Active</div>
                  <div className="text-sm text-slate-500">
                    Les villes inactives ne sont pas visibles sur la homepage
                  </div>
                </div>
                <Switch
                  checked={cityEditor.is_active}
                  onCheckedChange={(v) =>
                    setCityEditor((prev) =>
                      prev ? { ...prev, is_active: v } : prev,
                    )
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCityDialogOpen(false)}
              disabled={citySaving}
            >
              Annuler
            </Button>
            <Button
              onClick={saveCity}
              disabled={citySaving}
              className="gap-2"
            >
              {citySaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== COUNTRY EDITOR DIALOG ==================== */}
      <Dialog open={countryDialogOpen} onOpenChange={setCountryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {countryEditor?.id ? "Modifier le pays" : "Ajouter un pays"}
            </DialogTitle>
          </DialogHeader>

          {countryEditor && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nom du pays *</Label>
                  <Input
                    value={countryEditor.name}
                    onChange={(e) =>
                      setCountryEditor((prev) =>
                        prev ? { ...prev, name: e.target.value } : prev,
                      )
                    }
                    placeholder="ex: Maroc, France"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Nom (anglais)</Label>
                  <Input
                    value={countryEditor.name_en}
                    onChange={(e) =>
                      setCountryEditor((prev) =>
                        prev ? { ...prev, name_en: e.target.value } : prev,
                      )
                    }
                    placeholder="ex: Morocco, France"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Code pays (ISO) *</Label>
                  <Input
                    value={countryEditor.code}
                    onChange={(e) =>
                      setCountryEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              code: e.target.value
                                .toUpperCase()
                                .replace(/[^A-Z]/g, "")
                                .slice(0, 2),
                            }
                          : prev,
                      )
                    }
                    placeholder="MA"
                    maxLength={2}
                  />
                  <p className="text-xs text-slate-500">ISO 3166-1 alpha-2</p>
                </div>

                <div className="space-y-2">
                  <Label>Emoji drapeau</Label>
                  <Input
                    value={countryEditor.flag_emoji}
                    onChange={(e) =>
                      setCountryEditor((prev) =>
                        prev ? { ...prev, flag_emoji: e.target.value } : prev,
                      )
                    }
                    placeholder="🇲🇦"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Préfixe tél.</Label>
                  <Input
                    value={countryEditor.phone_prefix}
                    onChange={(e) =>
                      setCountryEditor((prev) =>
                        prev ? { ...prev, phone_prefix: e.target.value } : prev,
                      )
                    }
                    placeholder="+212"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Code devise</Label>
                <Input
                  value={countryEditor.currency_code}
                  onChange={(e) =>
                    setCountryEditor((prev) =>
                      prev
                        ? {
                            ...prev,
                            currency_code: e.target.value.toUpperCase().slice(0, 3),
                          }
                        : prev,
                    )
                  }
                  placeholder="MAD"
                  maxLength={3}
                />
                <p className="text-xs text-slate-500">ISO 4217 (ex: MAD, EUR, USD)</p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <div className="font-medium">Actif</div>
                  <div className="text-sm text-slate-500">
                    Les pays inactifs ne sont pas proposés aux utilisateurs
                  </div>
                </div>
                <Switch
                  checked={countryEditor.is_active}
                  onCheckedChange={(v) =>
                    setCountryEditor((prev) =>
                      prev ? { ...prev, is_active: v } : prev,
                    )
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <div className="font-medium">Pays par défaut</div>
                  <div className="text-sm text-slate-500">
                    Utilisé si la détection automatique échoue
                  </div>
                </div>
                <Switch
                  checked={countryEditor.is_default}
                  onCheckedChange={(v) =>
                    setCountryEditor((prev) =>
                      prev ? { ...prev, is_default: v } : prev,
                    )
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCountryDialogOpen(false)}
              disabled={countrySaving}
            >
              Annuler
            </Button>
            <Button
              onClick={saveCountry}
              disabled={countrySaving}
              className="gap-2"
            >
              {countrySaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== CATEGORY EDITOR DIALOG ==================== */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {categoryEditor?.id ? "Modifier la catégorie" : "Nouvelle catégorie"}
            </DialogTitle>
          </DialogHeader>

          {categoryEditor && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Univers *</Label>
                  <Select
                    value={categoryEditor.universe}
                    onValueChange={(v) =>
                      setCategoryEditor((prev) =>
                        prev ? { ...prev, universe: v } : prev,
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIVERSES.map((u) => (
                        <SelectItem key={u.value} value={u.value}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>ID Catégorie *</Label>
                  <Input
                    value={categoryEditor.category_id}
                    onChange={(e) =>
                      setCategoryEditor((prev) =>
                        prev ? { ...prev, category_id: e.target.value } : prev,
                      )
                    }
                    placeholder="french, asian, hammam..."
                  />
                  <p className="text-xs text-slate-500">
                    Identifiant unique pour le filtre
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">

                <div className="space-y-2">
                  <Label>Nom affiché *</Label>
                  <Input
                    value={categoryEditor.name}
                    onChange={(e) =>
                      setCategoryEditor((prev) =>
                        prev ? { ...prev, name: e.target.value } : prev,
                      )
                    }
                    placeholder="Français, Asiatique, Hammam..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Image *</Label>
                <div className="flex gap-2">
                  <Input
                    value={categoryEditor.image_url}
                    onChange={(e) =>
                      setCategoryEditor((prev) =>
                        prev ? { ...prev, image_url: e.target.value } : prev,
                      )
                    }
                    placeholder="https://example.com/image.jpg"
                    className="flex-1"
                  />
                  <input
                    ref={categoryImageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.currentTarget.value = "";
                      if (file) void handleCategoryImageUpload(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 shrink-0"
                    onClick={() => categoryImageInputRef.current?.click()}
                    disabled={categoryImageUploading}
                  >
                    {categoryImageUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Uploader
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  JPEG, PNG ou WebP. Max 2 Mo.
                </p>
                {categoryEditor.image_url && (
                  <div className="flex justify-center p-2 bg-slate-50 rounded-lg">
                    <img
                      src={categoryEditor.image_url}
                      alt="Aperçu"
                      className="w-20 h-20 rounded-full object-cover border-2 border-slate-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Ordre d'affichage</Label>
                  <Input
                    type="number"
                    value={categoryEditor.display_order}
                    onChange={(e) =>
                      setCategoryEditor((prev) =>
                        prev ? { ...prev, display_order: parseInt(e.target.value) || 0 } : prev,
                      )
                    }
                    min={0}
                  />
                  <p className="text-xs text-slate-500">
                    Les catégories sont triées par ordre croissant
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 h-fit">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Actif
                    </div>
                    <div className="text-xs text-slate-600">
                      Afficher sur la homepage
                    </div>
                  </div>
                  <Switch
                    checked={categoryEditor.is_active}
                    onCheckedChange={(checked) =>
                      setCategoryEditor((prev) =>
                        prev ? { ...prev, is_active: checked } : prev,
                      )
                    }
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCategoryDialogOpen(false)}
              disabled={categorySaving}
            >
              Annuler
            </Button>
            <Button
              className="gap-2"
              onClick={saveCategory}
              disabled={categorySaving}
            >
              {categorySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== VIDEO EDITOR DIALOG ==================== */}
      <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {videoEditor?.id ? "Modifier la vidéo" : "Ajouter une vidéo"}
            </DialogTitle>
          </DialogHeader>

          {videoEditor && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>URL YouTube *</Label>
                <Input
                  value={videoEditor.youtube_url}
                  onChange={(e) =>
                    setVideoEditor((prev) =>
                      prev ? { ...prev, youtube_url: e.target.value } : prev,
                    )
                  }
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                <p className="text-xs text-slate-500">
                  Formats acceptés: youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...
                </p>
              </div>

              {/* Thumbnail preview - custom or YouTube */}
              {(videoEditor.thumbnail_url || (videoEditor.youtube_url && getYoutubeVideoId(videoEditor.youtube_url))) && (
                <div className="rounded-lg overflow-hidden border border-slate-200 relative">
                  <img
                    src={videoEditor.thumbnail_url || `https://img.youtube.com/vi/${getYoutubeVideoId(videoEditor.youtube_url)}/mqdefault.jpg`}
                    alt="Aperçu"
                    className="w-full h-auto"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="w-12 h-12 text-white fill-white" />
                  </div>
                  {videoEditor.thumbnail_url && (
                    <div className="absolute top-2 start-2 px-2 py-1 bg-green-600 text-white text-xs rounded">
                      Couverture personnalisée
                    </div>
                  )}
                </div>
              )}

              {/* Custom thumbnail upload */}
              <div className="space-y-2">
                <Label>Couverture personnalisée (optionnelle)</Label>
                <div className="flex items-center gap-3">
                  <label className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={videoThumbnailUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        // Check file size (max 500KB)
                        if (file.size > 512000) {
                          toast({
                            title: "Erreur",
                            description: "L'image ne doit pas dépasser 500KB",
                            variant: "destructive",
                          });
                          return;
                        }
                        setVideoThumbnailUploading(true);
                        try {
                          const result = await uploadAdminVideoThumbnail(undefined, {
                            file,
                            fileName: file.name,
                          });
                          setVideoEditor((prev) =>
                            prev ? { ...prev, thumbnail_url: result.item.public_url } : prev
                          );
                          toast({ title: "Image uploadée" });
                        } catch (err) {
                          toast({
                            title: "Erreur",
                            description: humanAdminError(err),
                            variant: "destructive",
                          });
                        } finally {
                          setVideoThumbnailUploading(false);
                        }
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2"
                      disabled={videoThumbnailUploading}
                      asChild
                    >
                      <span>
                        {videoThumbnailUploading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {videoEditor.thumbnail_url ? "Changer l'image" : "Uploader une image"}
                      </span>
                    </Button>
                  </label>
                  {videoEditor.thumbnail_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setVideoEditor((prev) =>
                          prev ? { ...prev, thumbnail_url: null } : prev
                        )
                      }
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  640×360px recommandé (ratio 16:9), max 500KB. Sans image, la miniature YouTube sera utilisée.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Titre *</Label>
                <Input
                  value={videoEditor.title}
                  onChange={(e) =>
                    setVideoEditor((prev) =>
                      prev ? { ...prev, title: e.target.value } : prev,
                    )
                  }
                  placeholder="Titre de la vidéo"
                />
              </div>

              <div className="space-y-2">
                <Label>Description (optionnelle)</Label>
                <Textarea
                  value={videoEditor.description || ""}
                  onChange={(e) =>
                    setVideoEditor((prev) =>
                      prev ? { ...prev, description: e.target.value || null } : prev,
                    )
                  }
                  placeholder="Description courte de la vidéo..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Établissement lié (optionnel)</Label>
                <Select
                  value={videoEditor.establishment_id || "none"}
                  onValueChange={(v) =>
                    setVideoEditor((prev) => {
                      if (!prev) return prev;
                      if (v === "none") {
                        return { ...prev, establishment_id: null, establishment_name: null };
                      }
                      const est = allEstablishments.find((e) => e.id === v);
                      return {
                        ...prev,
                        establishment_id: v,
                        establishment_name: est?.name ?? null,
                      };
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un établissement..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="none">Aucun établissement</SelectItem>
                    {allEstablishments.map((est) => (
                      <SelectItem key={est.id} value={est.id}>
                        {est.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  Si un établissement est lié, un lien vers sa fiche s'affichera sous la vidéo
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <div className="font-medium">Active</div>
                  <div className="text-sm text-slate-500">
                    Les vidéos inactives ne sont pas visibles sur la homepage
                  </div>
                </div>
                <Switch
                  checked={videoEditor.is_active}
                  onCheckedChange={(v) =>
                    setVideoEditor((prev) =>
                      prev ? { ...prev, is_active: v } : prev,
                    )
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVideoDialogOpen(false)}
              disabled={videoSaving}
            >
              Annuler
            </Button>
            <Button
              onClick={saveVideo}
              disabled={videoSaving}
              className="gap-2"
            >
              {videoSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
