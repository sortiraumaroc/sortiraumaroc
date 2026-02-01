import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  Calendar,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Home,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Mail,
  MessageSquare,
  Rocket,
  ScrollText,
  Search,
  Settings,
  Shield,
  Star,
  Tag,
  Users,
  UsersRound,
  Video,
  Wallet,
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
import { Input } from "@/components/ui/input";

type SearchItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string[];
  category: string;
};

// Toutes les rubriques et sous-rubriques de l'admin
const SEARCH_ITEMS: SearchItem[] = [
  // Tableau de bord
  {
    label: "Tableau de bord",
    to: "/admin",
    icon: LayoutDashboard,
    keywords: ["dashboard", "accueil", "home", "statistiques", "stats"],
    category: "Navigation principale",
  },

  // Utilisateurs
  {
    label: "Utilisateurs",
    to: "/admin/users",
    icon: Users,
    keywords: ["clients", "comptes", "membres", "inscrits"],
    category: "Navigation principale",
  },
  {
    label: "Nettoyage comptes",
    to: "/admin/users/cleanup",
    icon: Users,
    keywords: ["cleanup", "nettoyage", "demo", "test", "fake", "suppression"],
    category: "Navigation principale",
  },

  // Professionnels
  {
    label: "Professionnels",
    to: "/admin/pros",
    icon: UsersRound,
    keywords: ["pro", "partenaires", "business", "entreprises"],
    category: "Navigation principale",
  },

  // Établissements
  {
    label: "Établissements",
    to: "/admin/establishments",
    icon: Building2,
    keywords: ["lieux", "venues", "restaurants", "spas", "hammams", "activités"],
    category: "Navigation principale",
  },
  {
    label: "Import / Export établissements",
    to: "/admin/import-export",
    icon: FileSpreadsheet,
    keywords: ["csv", "excel", "import", "export", "masse", "bulk", "seeding"],
    category: "Navigation principale",
  },

  // Réservations
  {
    label: "Réservations",
    to: "/admin/reservations",
    icon: ClipboardList,
    keywords: ["bookings", "commandes", "orders"],
    category: "Réservations",
  },
  {
    label: "Liste d'attente",
    to: "/admin/waitlist",
    icon: Calendar,
    keywords: ["waitlist", "attente", "queue"],
    category: "Réservations",
  },
  {
    label: "Offres & packs",
    to: "/admin/deals",
    icon: Tag,
    keywords: ["deals", "promotions", "promos", "réductions"],
    category: "Réservations",
  },

  // Paiements & Finance
  {
    label: "Paiements",
    to: "/admin/payments",
    icon: CreditCard,
    keywords: ["transactions", "factures", "invoices", "money"],
    category: "Finance",
  },
  {
    label: "Payout (versements)",
    to: "/admin/finance/payout-requests",
    icon: Wallet,
    keywords: ["payout", "versement", "virement", "transfert"],
    category: "Finance",
  },
  {
    label: "Écarts de paiement",
    to: "/admin/finance/discrepancies",
    icon: CreditCard,
    keywords: ["discrepancies", "écarts", "différences", "anomalies"],
    category: "Finance",
  },

  // Avis & signalements
  {
    label: "Avis & signalements",
    to: "/admin/reviews",
    icon: Star,
    keywords: ["reviews", "notes", "feedback", "modération", "signalements"],
    category: "Navigation principale",
  },

  // Contenu
  {
    label: "Contenu (Blog & Pages)",
    to: "/admin/content",
    icon: FileText,
    keywords: ["blog", "articles", "pages", "cms", "rédaction"],
    category: "Contenu",
  },
  {
    label: "Page d'accueil",
    to: "/admin/homepage",
    icon: Home,
    keywords: ["homepage", "landing", "vitrine"],
    category: "Contenu",
  },

  // Marketing
  {
    label: "Prospects marketing",
    to: "/admin/marketing/prospects",
    icon: Users,
    keywords: ["prospects", "contacts", "leads", "marketing", "emailing", "liste"],
    category: "Marketing",
  },

  // Emailing
  {
    label: "Templates emails",
    to: "/admin/emails/templates",
    icon: Mail,
    keywords: ["email", "mails", "templates", "modèles"],
    category: "Emailing",
  },
  {
    label: "Campagnes emails",
    to: "/admin/emails/campaigns",
    icon: Mail,
    keywords: ["campaigns", "newsletter", "marketing"],
    category: "Emailing",
  },
  {
    label: "Emails envoyés",
    to: "/admin/emails/sent",
    icon: Mail,
    keywords: ["sent", "historique", "envoyés"],
    category: "Emailing",
  },
  {
    label: "Paramètres emails",
    to: "/admin/emails/settings",
    icon: Settings,
    keywords: ["email settings", "configuration"],
    category: "Emailing",
  },

  // Visibilité
  {
    label: "Visibilité",
    to: "/admin/visibility",
    icon: Rocket,
    keywords: ["boost", "promotion", "mise en avant", "featured"],
    category: "Navigation principale",
  },

  // Media Factory
  {
    label: "Media Factory - Production",
    to: "/admin/production-media",
    icon: Video,
    keywords: ["media", "photos", "vidéos", "production", "shooting"],
    category: "Media Factory",
  },
  {
    label: "Media Factory - Messages",
    to: "/admin/messages",
    icon: MessageSquare,
    keywords: ["messages", "chat", "communication"],
    category: "Media Factory",
  },
  {
    label: "Media Factory - Prestataires",
    to: "/admin/partners",
    icon: UsersRound,
    keywords: ["prestataires", "photographes", "vidéastes"],
    category: "Media Factory",
  },
  {
    label: "Media Factory - Comptabilité",
    to: "/admin/production-media/compta",
    icon: CreditCard,
    keywords: ["compta", "comptabilité", "factures", "paiements media"],
    category: "Media Factory",
  },

  // Support
  {
    label: "Support",
    to: "/admin/support",
    icon: LifeBuoy,
    keywords: ["aide", "help", "tickets", "assistance"],
    category: "Navigation principale",
  },

  // Paramètres
  {
    label: "Paramètres",
    to: "/admin/settings",
    icon: Settings,
    keywords: ["settings", "configuration", "options"],
    category: "Configuration",
  },
  {
    label: "Collaborateurs",
    to: "/admin/collaborators",
    icon: Shield,
    keywords: ["team", "équipe", "membres", "staff"],
    category: "Configuration",
  },
  {
    label: "Rôles & permissions",
    to: "/admin/roles",
    icon: BarChart3,
    keywords: ["roles", "droits", "accès", "permissions"],
    category: "Configuration",
  },

  // Logs & Audit
  {
    label: "Journaux (logs)",
    to: "/admin/logs",
    icon: ScrollText,
    keywords: ["logs", "historique", "activité", "journal"],
    category: "Système",
  },
  {
    label: "Audit & tests",
    to: "/admin/audit-tests",
    icon: ListChecks,
    keywords: ["audit", "tests", "vérification", "qualité"],
    category: "Système",
  },
  {
    label: "Production check",
    to: "/admin/production-check",
    icon: ListChecks,
    keywords: ["production", "check", "santé", "health"],
    category: "Système",
  },
];

// Grouper les items par catégorie
function groupByCategory(items: SearchItem[]): Record<string, SearchItem[]> {
  return items.reduce(
    (acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, SearchItem[]>
  );
}

export function AdminGlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Raccourci clavier Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback(
    (to: string) => {
      setOpen(false);
      navigate(to);
    },
    [navigate]
  );

  const groupedItems = groupByCategory(SEARCH_ITEMS);
  const categories = Object.keys(groupedItems);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50 transition-colors"
      >
        <Search className="h-4 w-4 text-slate-400" />
        <span className="h-9 w-[180px] lg:w-[240px] flex items-center text-sm text-slate-500">
          Recherche globale...
        </span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-slate-100 px-1.5 font-mono text-[10px] font-medium text-slate-500 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Command Dialog */}
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
                    key={item.to}
                    value={`${item.label} ${item.keywords?.join(" ") ?? ""}`}
                    onSelect={() => handleSelect(item.to)}
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
