import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Award,
  BarChart3,
  Bell,
  Building2,
  Calendar,
  Car,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Home,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  ListChecks,
  Mail,
  Megaphone,
  MessageSquare,
  Moon,
  Rocket,
  ScrollText,
  Search,
  Settings,
  Shield,
  Sparkles,
  Star,
  Tags,
  Timer,
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

type SearchItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string[];
  category: string;
};

const SEARCH_ITEMS: SearchItem[] = [
  // ── Tableau de bord ──
  {
    label: "Tableau de bord",
    to: "/admin",
    icon: LayoutDashboard,
    keywords: ["dashboard", "accueil", "home", "statistiques", "stats"],
    category: "Navigation principale",
  },

  // ── Utilisateurs ──
  {
    label: "Utilisateurs",
    to: "/admin/users",
    icon: Users,
    keywords: ["clients", "comptes", "membres", "inscrits"],
    category: "Navigation principale",
  },
  {
    label: "Comités d'Entreprise",
    to: "/admin/ce",
    icon: Users,
    keywords: ["ce", "comité", "entreprise", "salariés", "avantages"],
    category: "Navigation principale",
  },

  // ── Professionnels ──
  {
    label: "Professionnels",
    to: "/admin/pros",
    icon: UsersRound,
    keywords: ["pro", "partenaires", "business", "entreprises"],
    category: "Navigation principale",
  },

  // ── Établissements ──
  {
    label: "Établissements",
    to: "/admin/establishments",
    icon: Building2,
    keywords: ["lieux", "venues", "restaurants", "spas", "hammams", "activités"],
    category: "Établissements",
  },
  {
    label: "Revendications & Leads",
    to: "/admin/claim-requests",
    icon: Building2,
    keywords: ["revendication", "claim", "leads", "nouveaux"],
    category: "Établissements",
  },
  {
    label: "Import / Export",
    to: "/admin/import-export",
    icon: FileSpreadsheet,
    keywords: ["csv", "excel", "import", "export", "masse", "bulk", "seeding"],
    category: "Établissements",
  },

  // ── Réservations ──
  {
    label: "Réservations",
    to: "/admin/reservations",
    icon: ClipboardList,
    keywords: ["bookings", "commandes", "orders"],
    category: "Réservations",
  },
  {
    label: "Ramadan 2026",
    to: "/admin/ramadan",
    icon: Moon,
    keywords: ["ramadan", "iftar", "ftour"],
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
    icon: Tags,
    keywords: ["deals", "promotions", "promos", "réductions", "slots"],
    category: "Réservations",
  },

  // ── Packs & Fidélité ──
  {
    label: "Packs (modération)",
    to: "/admin/packs-moderation",
    icon: Tags,
    keywords: ["packs", "modération", "offres"],
    category: "Packs & Fidélité",
  },
  {
    label: "Finances packs",
    to: "/admin/finances",
    icon: CreditCard,
    keywords: ["finances", "revenus", "packs"],
    category: "Packs & Fidélité",
  },
  {
    label: "Fidélité",
    to: "/admin/loyalty-v2",
    icon: Award,
    keywords: ["fidélité", "loyalty", "points", "récompenses", "cartes"],
    category: "Packs & Fidélité",
  },

  // ── Paiements & Finance ──
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

  // ── Page d'accueil & Contenu ──
  {
    label: "Page d'accueil",
    to: "/admin/homepage",
    icon: Home,
    keywords: ["homepage", "landing", "vitrine", "hero", "apparence"],
    category: "Contenu",
  },
  {
    label: "Pages & Blog",
    to: "/admin/content",
    icon: FileText,
    keywords: ["blog", "articles", "pages", "cms", "rédaction"],
    category: "Contenu",
  },

  // ── Emailing ──
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

  // ── Visibilité ──
  {
    label: "Visibilité (SAM Media)",
    to: "/admin/visibility",
    icon: Rocket,
    keywords: ["boost", "promotion", "mise en avant", "featured", "offres", "devis", "factures", "commandes"],
    category: "Visibilité",
  },
  {
    label: "Publicités",
    to: "/admin/ads",
    icon: Sparkles,
    keywords: ["ads", "publicités", "campagnes", "enchères"],
    category: "Visibilité",
  },
  {
    label: "Liens Perso",
    to: "/admin/username-subscriptions",
    icon: Link2,
    keywords: ["liens", "username", "personnalisé", "book.sam.ma"],
    category: "Visibilité",
  },

  // ── Marketing ──
  {
    label: "Campagnes Push",
    to: "/admin/push-campaigns",
    icon: Bell,
    keywords: ["push", "notifications", "campagnes", "marketing"],
    category: "Marketing",
  },
  {
    label: "Bannières & Pop-ups",
    to: "/admin/banners",
    icon: Megaphone,
    keywords: ["bannières", "pop-ups", "popups", "banners"],
    category: "Marketing",
  },
  {
    label: "Roue de la Chance",
    to: "/admin/wheel",
    icon: Star,
    keywords: ["roue", "wheel", "fortune", "jeu", "concours"],
    category: "Marketing",
  },

  // ── Media Factory ──
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

  // ── Support & Formulaires ──
  {
    label: "Support",
    to: "/admin/support",
    icon: LifeBuoy,
    keywords: ["aide", "help", "tickets", "assistance"],
    category: "Navigation principale",
  },
  {
    label: "Formulaires",
    to: "/admin/contact-forms",
    icon: ClipboardCheck,
    keywords: ["formulaires", "contact", "soumissions"],
    category: "Navigation principale",
  },

  // ── Paramètres ──
  {
    label: "Paramètres",
    to: "/admin/settings",
    icon: Settings,
    keywords: ["settings", "configuration", "options"],
    category: "Configuration",
  },
  {
    label: "Location véhicules",
    to: "/admin/rental",
    icon: Car,
    keywords: ["location", "véhicules", "voiture", "rental", "assurances"],
    category: "Configuration",
  },

  // ── Collaborateurs & Rôles ──
  {
    label: "Collaborateurs",
    to: "/admin/collaborators",
    icon: Shield,
    keywords: ["team", "équipe", "membres", "staff"],
    category: "Configuration",
  },
  {
    label: "Suivi d'activité",
    to: "/admin/activity-tracking",
    icon: Timer,
    keywords: ["activité", "tracking", "temps", "travail", "suivi"],
    category: "Configuration",
  },
  {
    label: "Rôles & permissions",
    to: "/admin/roles",
    icon: BarChart3,
    keywords: ["roles", "droits", "accès", "permissions"],
    category: "Configuration",
  },

  // ── Logs & Audit ──
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
