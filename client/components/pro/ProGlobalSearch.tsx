import { useCallback, useEffect, useState } from "react";
import {
  Award,
  Bell,
  CalendarCheck,
  CreditCard,
  Eye,
  LayoutDashboard,
  LifeBuoy,
  ListPlus,
  Megaphone,
  MessageSquare,
  Moon,
  QrCode,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Tags,
  Users,
  Video,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

type ProSearchItem = {
  label: string;
  tab: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string[];
  category: string;
};

const SEARCH_ITEMS: ProSearchItem[] = [
  // ── Gestion ──
  {
    label: "Tableau de bord",
    tab: "dashboard",
    icon: LayoutDashboard,
    keywords: ["dashboard", "accueil", "statistiques", "stats", "chiffres"],
    category: "Gestion",
  },
  {
    label: "Fiche établissement",
    tab: "establishment",
    icon: Store,
    keywords: ["fiche", "profil", "établissement", "infos", "horaires", "photos", "description"],
    category: "Gestion",
  },
  {
    label: "Menu / Inventaire",
    tab: "offers",
    icon: Tags,
    keywords: ["menu", "inventaire", "produits", "services", "carte", "offres"],
    category: "Gestion",
  },
  {
    label: "Paramètres",
    tab: "settings",
    icon: SlidersHorizontal,
    keywords: ["settings", "configuration", "options", "paramètres"],
    category: "Gestion",
  },

  // ── Activité commerciale ──
  {
    label: "Packs & Promotions",
    tab: "promotion",
    icon: Megaphone,
    keywords: ["packs", "promotions", "promos", "offres", "deals"],
    category: "Activité commerciale",
  },
  {
    label: "Ramadan",
    tab: "ramadan",
    icon: Moon,
    keywords: ["ramadan", "iftar", "ftour", "menu"],
    category: "Activité commerciale",
  },
  {
    label: "Réservations",
    tab: "reservations",
    icon: CalendarCheck,
    keywords: ["réservations", "bookings", "commandes", "clients"],
    category: "Activité commerciale",
  },
  {
    label: "Liste d'attente",
    tab: "waitlist",
    icon: ListPlus,
    keywords: ["attente", "waitlist", "queue", "file"],
    category: "Activité commerciale",
  },
  {
    label: "Scanner QR",
    tab: "scanner",
    icon: QrCode,
    keywords: ["scanner", "qr", "code", "validation", "check-in"],
    category: "Activité commerciale",
  },
  {
    label: "Avis",
    tab: "reviews",
    icon: Star,
    keywords: ["avis", "reviews", "notes", "feedback", "étoiles"],
    category: "Activité commerciale",
  },
  {
    label: "Fidélité",
    tab: "loyalty",
    icon: Award,
    keywords: ["fidélité", "loyalty", "points", "récompenses", "cartes"],
    category: "Activité commerciale",
  },

  // ── Visibilité & Marketing ──
  {
    label: "Visibilité",
    tab: "visibility",
    icon: Eye,
    keywords: ["visibilité", "boost", "mise en avant", "featured"],
    category: "Visibilité & Marketing",
  },
  {
    label: "Publicités",
    tab: "ads",
    icon: Sparkles,
    keywords: ["publicités", "ads", "campagnes", "promotions"],
    category: "Visibilité & Marketing",
  },
  {
    label: "Media Factory",
    tab: "media",
    icon: Video,
    keywords: ["media", "photos", "vidéos", "production", "shooting"],
    category: "Visibilité & Marketing",
  },

  // ── Finance ──
  {
    label: "Facturation",
    tab: "billing",
    icon: CreditCard,
    keywords: ["facturation", "factures", "paiements", "billing", "abonnement"],
    category: "Finance",
  },

  // ── Communication ──
  {
    label: "Notifications",
    tab: "notifications",
    icon: Bell,
    keywords: ["notifications", "alertes", "rappels"],
    category: "Communication",
  },
  {
    label: "Équipe",
    tab: "team",
    icon: Users,
    keywords: ["équipe", "team", "collaborateurs", "membres", "staff"],
    category: "Communication",
  },
  {
    label: "Messages",
    tab: "messages",
    icon: MessageSquare,
    keywords: ["messages", "chat", "conversation", "communication"],
    category: "Communication",
  },
  {
    label: "Assistance",
    tab: "assistance",
    icon: LifeBuoy,
    keywords: ["aide", "help", "support", "assistance", "contact"],
    category: "Communication",
  },
];

function groupByCategory(items: ProSearchItem[]): Record<string, ProSearchItem[]> {
  return items.reduce(
    (acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, ProSearchItem[]>,
  );
}

type ProGlobalSearchProps = {
  onNavigateToTab: (tab: string) => void;
};

export function ProGlobalSearch({ onNavigateToTab }: ProGlobalSearchProps) {
  const [open, setOpen] = useState(false);

  // Raccourci clavier Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback(
    (tab: string) => {
      setOpen(false);
      onNavigateToTab(tab);
    },
    [onNavigateToTab],
  );

  const groupedItems = groupByCategory(SEARCH_ITEMS);
  const categories = Object.keys(groupedItems);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 rounded-md border border-white/30 bg-white/10 hover:bg-white/20 px-2.5 transition-colors"
      >
        <Search className="h-4 w-4 text-white/70" />
        <span className="hidden sm:flex h-9 w-[140px] lg:w-[180px] items-center text-sm text-white/70">
          Rechercher...
        </span>
        <span className="flex sm:hidden h-9 items-center" />
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-white/20 bg-white/10 px-1.5 font-mono text-[10px] font-medium text-white/60 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Rechercher une rubrique..." />
        <CommandList>
          <CommandEmpty>Aucun résultat trouvé.</CommandEmpty>
          {categories.map((category, index) => (
            <div key={category}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={category}>
                {groupedItems[category].map((item) => (
                  <CommandItem
                    key={item.tab}
                    value={`${item.label} ${item.keywords?.join(" ") ?? ""}`}
                    onSelect={() => handleSelect(item.tab)}
                    className="gap-2 cursor-pointer"
                  >
                    <item.icon className="h-4 w-4 text-slate-500" />
                    <span>{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
