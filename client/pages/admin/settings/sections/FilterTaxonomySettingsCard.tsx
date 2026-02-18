import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Plus, Trash2, Search, Utensils, Dumbbell, Zap, Building2, Landmark, ShoppingBag, Car } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CUISINE_TYPES,
  AMBIANCE_TYPES,
  PRICE_RANGES,
  SPORT_SPECIALTIES,
  SPORT_AMENITIES,
  LOISIRS_SPECIALTIES,
  LOISIRS_PUBLIC,
  HEBERGEMENT_TYPES,
  HOTEL_AMENITIES,
  ROOM_TYPES,
  CULTURE_TYPES,
  CULTURE_PUBLIC,
  SHOPPING_TYPES,
  SHOPPING_SERVICES,
  VEHICLE_TYPES,
  FUEL_TYPES,
  TRANSMISSION_TYPES,
  VEHICLE_FEATURES,
  RENTAL_SERVICES,
  VEHICLE_BRANDS,
} from "@/lib/taxonomy";
import type { ToastInput, SettingsReportPatch } from "../../AdminSettingsPage";

type UniverseTab = "restaurants" | "sport" | "loisirs" | "hebergement" | "culture" | "shopping" | "rentacar";

interface FilterTaxonomySettingsCardProps {
  onReport: (patch: SettingsReportPatch) => void;
  onToast: (toast: ToastInput) => void;
}

// Helper to render a filter section
function FilterSection({
  title,
  items,
  searchQuery,
  onDelete,
}: {
  title: string;
  items: readonly string[];
  searchQuery: string;
  onDelete: (item: string) => void;
}) {
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return [...items];
    const q = searchQuery.toLowerCase();
    return items.filter((item) => item.toLowerCase().includes(q));
  }, [items, searchQuery]);

  return (
    <AccordionItem value={title}>
      <AccordionTrigger className="text-sm font-medium">
        {title} ({items.length})
      </AccordionTrigger>
      <AccordionContent>
        <div className="flex flex-wrap gap-2 pt-2">
          {filteredItems.map((item) => (
            <div
              key={item}
              className={cn(
                "group flex items-center gap-2 px-3 py-1.5 rounded-full border",
                "bg-white hover:bg-slate-50 transition-colors text-sm"
              )}
            >
              <span className="text-slate-700">{item}</span>
              <button
                onClick={() => onDelete(item)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-200"
              >
                <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-500" />
              </button>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <p className="text-sm text-slate-500 py-2">Aucun résultat</p>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function FilterTaxonomySettingsCard({ onReport, onToast }: FilterTaxonomySettingsCardProps) {
  const [activeTab, setActiveTab] = useState<UniverseTab>("restaurants");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const universeConfig = {
    restaurants: {
      icon: <Utensils className="w-4 h-4" />,
      label: "Restaurants",
      sections: [
        { title: "Types de cuisine", items: CUISINE_TYPES },
        { title: "Ambiances", items: AMBIANCE_TYPES },
        { title: "Gammes de prix", items: PRICE_RANGES.map((p) => `${p.label} - ${p.description}`) },
      ],
    },
    sport: {
      icon: <Dumbbell className="w-4 h-4" />,
      label: "Sport & Bien-être",
      sections: [
        { title: "Spécialités", items: SPORT_SPECIALTIES },
        { title: "Équipements", items: SPORT_AMENITIES },
        { title: "Ambiances", items: AMBIANCE_TYPES },
      ],
    },
    loisirs: {
      icon: <Zap className="w-4 h-4" />,
      label: "Loisirs",
      sections: [
        { title: "Spécialités", items: LOISIRS_SPECIALTIES },
        { title: "Public cible", items: LOISIRS_PUBLIC },
      ],
    },
    hebergement: {
      icon: <Building2 className="w-4 h-4" />,
      label: "Hébergement",
      sections: [
        { title: "Types d'hébergement", items: HEBERGEMENT_TYPES },
        { title: "Équipements", items: HOTEL_AMENITIES },
        { title: "Types de chambre", items: ROOM_TYPES },
        { title: "Gammes de prix", items: PRICE_RANGES.map((p) => `${p.label} - ${p.description}`) },
      ],
    },
    culture: {
      icon: <Landmark className="w-4 h-4" />,
      label: "Culture",
      sections: [
        { title: "Types d'activité", items: CULTURE_TYPES },
        { title: "Public cible", items: CULTURE_PUBLIC },
      ],
    },
    shopping: {
      icon: <ShoppingBag className="w-4 h-4" />,
      label: "Shopping",
      sections: [
        { title: "Types de boutique", items: SHOPPING_TYPES },
        { title: "Services", items: SHOPPING_SERVICES },
      ],
    },
    rentacar: {
      icon: <Car className="w-4 h-4" />,
      label: "Location véhicule",
      sections: [
        { title: "Types de véhicule", items: VEHICLE_TYPES },
        { title: "Carburant", items: FUEL_TYPES },
        { title: "Transmission", items: TRANSMISSION_TYPES },
        { title: "Équipements", items: VEHICLE_FEATURES },
        { title: "Services", items: RENTAL_SERVICES },
        { title: "Marques", items: VEHICLE_BRANDS },
      ],
    },
  };

  const currentConfig = universeConfig[activeTab];

  const totalItems = useMemo(() => {
    return currentConfig.sections.reduce((acc, section) => acc + section.items.length, 0);
  }, [currentConfig]);

  const handleDeleteItem = (item: string) => {
    onToast({
      title: "Fonctionnalité en développement",
      description: `Pour supprimer "${item}", modifiez le fichier taxonomy.ts`,
      variant: "default",
    });
    setItemToDelete(null);
  };

  const handleAddItem = () => {
    if (!newItemName.trim() || !selectedCategory) return;

    onToast({
      title: "Fonctionnalité en développement",
      description: `Pour ajouter "${newItemName}" à "${selectedCategory}", modifiez le fichier taxonomy.ts`,
      variant: "default",
    });

    setShowAddDialog(false);
    setNewItemName("");
    setSelectedCategory("");
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Taxonomie des filtres</CardTitle>
            <InfoTooltip content="Gérez les options de filtres disponibles pour chaque univers. Ces valeurs sont utilisées dans les filtres de la page de résultats." />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as UniverseTab); setSearchQuery(""); }}>
          {/* Universe Tabs */}
          <TabsList className="grid w-full grid-cols-7 mb-4">
            {(Object.keys(universeConfig) as UniverseTab[]).map((key) => (
              <TabsTrigger key={key} value={key} className="flex items-center gap-1 text-xs sm:text-sm">
                {universeConfig[key].icon}
                <span className="hidden lg:inline">{universeConfig[key].label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Search and Add */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddDialog(true)}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Ajouter</span>
            </Button>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-sm text-slate-500">
              <span className="font-medium text-slate-700">{currentConfig.label}</span> — {totalItems} éléments au total
            </p>
          </div>

          {/* Content for each universe */}
          {(Object.keys(universeConfig) as UniverseTab[]).map((key) => (
            <TabsContent key={key} value={key} className="mt-0">
              <ScrollArea className="h-[500px] border rounded-lg p-4">
                <Accordion type="single" collapsible defaultValue={universeConfig[key].sections[0]?.title} className="space-y-2">
                  {universeConfig[key].sections.map((section) => (
                    <FilterSection
                      key={section.title}
                      title={section.title}
                      items={section.items}
                      searchQuery={searchQuery}
                      onDelete={(item) => setItemToDelete(item)}
                    />
                  ))}
                </Accordion>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>

        {/* Usage info */}
        <div className="mt-4 p-3 bg-slate-50 rounded-lg">
          <p className="text-sm text-slate-600">
            <strong>Note :</strong> Ces filtres sont définis dans le fichier <code className="bg-slate-200 px-1 rounded">taxonomy.ts</code>.
            Pour ajouter ou modifier des éléments, modifiez directement ce fichier.
            Les filtres sont affichés aux utilisateurs sur la page de résultats de chaque univers.
          </p>
        </div>

        {/* Add Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajouter un élément</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Univers</Label>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  {currentConfig.icon}
                  {currentConfig.label}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Catégorie</Label>
                <select
                  id="category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full h-10 px-3 border rounded-md text-sm"
                >
                  <option value="">Sélectionner une catégorie</option>
                  {currentConfig.sections.map((section) => (
                    <option key={section.title} value={section.title}>
                      {section.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newItemName">Nom</Label>
                <Input
                  id="newItemName"
                  placeholder="Ex: Nouvelle option"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Annuler
              </Button>
              <Button onClick={handleAddItem} disabled={!newItemName.trim() || !selectedCategory}>
                Ajouter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cet élément ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer "{itemToDelete}" ?
                Cette action nécessite une modification du fichier taxonomy.ts.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => itemToDelete && handleDeleteItem(itemToDelete)}
                className="bg-red-600 hover:bg-red-700"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
