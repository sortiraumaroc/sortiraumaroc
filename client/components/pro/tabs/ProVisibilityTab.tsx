import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Rocket,
  Trash2,
  ShoppingCart,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pencil,
  Copy,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  TrendingUp,
  Eye,
  MousePointer,
  RefreshCw,
  RotateCcw,
  Pause,
  Play,
  Package,
  Check,
  Video,
  Settings,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeader as SectionHeaderTooltip } from "@/components/ui/section-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

import { MenuDigitalPlans } from "@/components/pro/visibility/MenuDigitalPlans";
import { MenuDigitalSync } from "@/components/pro/visibility/MenuDigitalSync";
import { UsernameSubscriptionSection } from "@/components/pro/visibility/UsernameSubscriptionSection";
import { ProVisibilityOrders } from "@/components/pro/visibility/ProVisibilityOrders";

import {
  createProCampaign,
  deleteProCampaign,
  updateProCampaign,
  listProCampaigns,
  listProVisibilityOffers,
  validateProVisibilityPromoCode,
  checkoutProVisibilityCart,
  confirmProVisibilityOrder,
  getEstablishmentUsername,
  getMenuDigitalStatus,
  type VisibilityOffer,
  type VisibilityCartItem,
  type VisibilityPromoValidationResponse,
  type UsernameInfo,
  type MenuDigitalStatus,
} from "@/lib/pro/api";
import { formatMoney } from "@/lib/money";
import type { Establishment, ProCampaign, ProRole } from "@/lib/pro/types";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

function canManage(role: ProRole) {
  return role === "owner" || role === "marketing";
}

function statusBadge(status: string) {
  if (status === "active") return { label: "Active", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (status === "paused") return { label: "Pause", cls: "bg-amber-100 text-amber-700 border-amber-200" };
  if (status === "ended") return { label: "Terminée", cls: "bg-slate-200 text-slate-700 border-slate-300" };
  if (status === "draft") return { label: "Brouillon", cls: "bg-slate-100 text-slate-700 border-slate-200" };
  return { label: status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
}

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getCampaignMetric(c: ProCampaign, key: string): number {
  const direct = (c as any)?.[key];
  const fromDirect = safeNumber(direct);
  if (fromDirect != null) return Math.round(fromDirect);

  const m = (c.metrics ?? {}) as Record<string, unknown>;
  const fromMetrics = safeNumber(m[key]);
  if (fromMetrics != null) return Math.round(fromMetrics);

  return 0;
}

function getCampaignBillingModel(c: ProCampaign): "cpc" | "cpm" | null {
  const direct = typeof (c as any)?.billing_model === "string" ? String((c as any).billing_model).trim().toLowerCase() : "";
  if (direct === "cpc" || direct === "cpm") return direct;

  const m = (c.metrics ?? {}) as Record<string, unknown>;
  const fromMetrics = typeof m.billing_model === "string" ? String(m.billing_model).trim().toLowerCase() : "";
  if (fromMetrics === "cpc" || fromMetrics === "cpm") return fromMetrics;

  return null;
}

function formatCampaignPeriod(c: ProCampaign): string {
  const start = c.starts_at ?? "";
  const end = c.ends_at ?? "";
  if (!start && !end) return "—";

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
    } catch {
      return d;
    }
  };

  return `${start ? formatDate(start) : "—"} → ${end ? formatDate(end) : "—"}`;
}

function formatDurationDays(durationDays: number | null | undefined): string | null {
  if (!durationDays || !Number.isFinite(durationDays)) return null;
  const days = Math.floor(durationDays);
  if (days === 365) return "1 an";
  if (days === 30) return "1 mois";
  if (days % 30 === 0 && days > 30) return `${Math.round(days / 30)} mois`;
  return `${days} jours`;
}

type ServiceSectionHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: typeof Video;
  variant?: "pack" | "option";
};

function ServiceSectionHeader({ title, subtitle, icon: Icon, variant = "pack" }: ServiceSectionHeaderProps) {
  const bgClass = variant === "pack" ? "bg-rose-50 border-rose-100" : "bg-blue-50 border-blue-100";
  const iconColor = variant === "pack" ? "text-rose-600" : "text-blue-600";

  return (
    <div className={`rounded-lg border p-4 ${bgClass}`}>
      <div className="flex items-center gap-3">
        {Icon && <Icon className={`w-5 h-5 ${iconColor}`} />}
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

type OfferCardProps = {
  offer: VisibilityOffer;
  onAddToCart: (offerId: string) => void;
  variant?: "pack" | "option";
};

function OfferCard({ offer, onAddToCart, variant = "pack" }: OfferCardProps) {
  const durationLabel = formatDurationDays(offer.duration_days);
  const deliverables = Array.isArray(offer.deliverables) ? offer.deliverables : [];
  const title = offer.title || "Offre";

  // Calculate TTC (with 20% VAT)
  const taxRateBps = offer.tax_rate_bps ?? 2000;
  const taxAmount = Math.round((offer.price_cents * taxRateBps) / 10000);
  const priceTTC = offer.price_cents + taxAmount;

  const isPack = variant === "pack";
  const cardClass = isPack
    ? "border-rose-200 bg-gradient-to-br from-white to-rose-50/50"
    : "border-blue-200 bg-gradient-to-br from-white to-blue-50/50";
  const iconColor = isPack ? "text-rose-600" : "text-blue-600";
  const checkColor = isPack ? "text-rose-600" : "text-blue-600";
  const Icon = isPack ? Video : Settings;

  return (
    <Card className={`flex flex-col h-full ${cardClass}`}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Icon className={`w-5 h-5 ${iconColor}`} />
              <CardTitle className="text-lg">{title}</CardTitle>
            </div>
            {offer.description && (
              <CardDescription>{offer.description}</CardDescription>
            )}
          </div>
          {durationLabel && (
            <Badge variant="outline" className="text-slate-600">
              {durationLabel}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 flex flex-col">
        {/* Features list */}
        {deliverables.length > 0 && (
          <div className="space-y-2 flex-1">
            <div className="text-sm font-medium text-slate-700">Inclus :</div>
            <ul className="space-y-1.5">
              {deliverables.slice(0, 6).map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${checkColor}`} />
                  {d}
                </li>
              ))}
              {deliverables.length > 6 && (
                <li className="text-sm text-slate-500 ps-6">
                  + {deliverables.length - 6} autres...
                </li>
              )}
            </ul>
          </div>
        )}

        {!deliverables.length && <div className="flex-1" />}

        <Separator />

        {/* Pricing */}
        <div className="flex items-end justify-between">
          <div>
            {offer.price_cents > 0 ? (
              <>
                <div className="text-2xl font-bold text-slate-900">
                  {formatMoney(offer.price_cents, offer.currency)}
                  <span className="text-sm font-normal text-slate-500"> HT</span>
                </div>
                <div className="text-sm text-slate-500">
                  {formatMoney(priceTTC, offer.currency)} TTC (TVA 20%)
                </div>
              </>
            ) : (
              <div className="text-lg font-semibold text-amber-600">Sur devis</div>
            )}
          </div>
          {offer.allow_quantity && (
            <div className="text-sm text-slate-500">par unité</div>
          )}
        </div>

        {/* Action button */}
        <Button
          size="lg"
          className={`w-full ${isPack ? "bg-rose-600 hover:bg-rose-700" : ""}`}
          disabled={!offer.is_active || offer.price_cents <= 0}
          onClick={() => onAddToCart(offer.id)}
        >
          Ajouter au panier
        </Button>
      </CardContent>
    </Card>
  );
}

type OfferGridProps = {
  offers: VisibilityOffer[];
  onAddToCart: (offerId: string) => void;
  className?: string;
  variant?: "pack" | "option";
};

function OfferGrid({ offers, onAddToCart, className, variant = "pack" }: OfferGridProps) {
  return (
    <div className={className ?? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"}>
      {offers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} onAddToCart={onAddToCart} variant={variant} />
      ))}
    </div>
  );
}

type OfferCarouselProps = {
  offers: VisibilityOffer[];
  onAddToCart: (offerId: string) => void;
  variant?: "pack" | "option";
};

function OfferCarousel({ offers, onAddToCart, variant = "option" }: OfferCarouselProps) {
  return (
    <div className="flex items-stretch gap-4 overflow-x-auto pb-2 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {offers.map((offer) => (
        <div key={offer.id} className="min-w-[320px] w-[320px] snap-start">
          <OfferCard offer={offer} onAddToCart={onAddToCart} variant={variant} />
        </div>
      ))}
    </div>
  );
}

// Campaign types
const CAMPAIGN_TYPES = [
  { value: "home_feature", label: "Mise en avant Home" },
  { value: "sponsored_results", label: "Résultats sponsorisés" },
  { value: "featured_pack", label: "Pack mis en avant" },
  { value: "push_notification", label: "Push notification" },
  { value: "email_marketing", label: "Email marketing" },
];

const BILLING_MODELS = [
  { value: "cpc", label: "CPC (2 MAD / clic)" },
  { value: "cpm", label: "CPM (20 MAD / 1000 imp.)" },
];

const STATUS_FILTERS = [
  { value: "__all__", label: "Tous les statuts" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Pause" },
  { value: "draft", label: "Brouillon" },
  { value: "ended", label: "Terminée" },
];

type CampaignForm = {
  type: string;
  title: string;
  billingModel: "cpc" | "cpm";
  budget: string;
  startsAt: string;
  endsAt: string;
};

const emptyForm: CampaignForm = {
  type: "home_feature",
  title: "",
  billingModel: "cpc",
  budget: "",
  startsAt: "",
  endsAt: "",
};

type FormErrors = Record<string, boolean>;

const ITEMS_PER_PAGE = 10;

export function ProVisibilityTab({ establishment, role }: Props) {
  const { toast } = useToast();

  // Campaigns state
  const [items, setItems] = useState<ProCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<CampaignForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<ProCampaign | null>(null);
  const [editForm, setEditForm] = useState<CampaignForm>(emptyForm);
  const [editFormErrors, setEditFormErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState<ProCampaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Filters and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [sortBy, setSortBy] = useState<"title" | "budget" | "status" | "created">("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // Marketplace state
  const [offers, setOffers] = useState<VisibilityOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState<string | null>(null);

  const [cart, setCart] = useState<VisibilityCartItem[]>([]);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const [menuDigitalBilling, setMenuDigitalBilling] = useState<"monthly" | "annual">("annual");

  // Menu Digital status state
  const [menuDigitalStatus, setMenuDigitalStatus] = useState<MenuDigitalStatus | null>(null);
  const [menuDigitalLoading, setMenuDigitalLoading] = useState(true);

  // Username subscription state
  const [usernameInfo, setUsernameInfo] = useState<UsernameInfo | null>(null);
  const [usernameLoading, setUsernameLoading] = useState(true);

  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<VisibilityPromoValidationResponse | null>(null);
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const loadCampaigns = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listProCampaigns(establishment.id);
      setItems((data ?? []) as ProCampaign[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const refreshCampaigns = async () => {
    try {
      const data = await listProCampaigns(establishment.id);
      setItems((data ?? []) as ProCampaign[]);
    } catch {
      // ignore (best-effort polling)
    }
  };

  const loadOffers = async () => {
    setOffersLoading(true);
    setOffersError(null);

    try {
      const res = await listProVisibilityOffers(establishment.id);
      setOffers(res.offers ?? []);
    } catch (e) {
      setOffersError(e instanceof Error ? e.message : "Erreur");
      setOffers([]);
    } finally {
      setOffersLoading(false);
    }
  };

  const loadUsernameInfo = async () => {
    setUsernameLoading(true);
    try {
      const info = await getEstablishmentUsername(establishment.id);
      setUsernameInfo(info);
    } catch (e) {
      console.error("Error loading username info:", e);
      setUsernameInfo(null);
    } finally {
      setUsernameLoading(false);
    }
  };

  const loadMenuDigitalStatus = async () => {
    setMenuDigitalLoading(true);
    try {
      const status = await getMenuDigitalStatus(establishment.id);
      setMenuDigitalStatus(status);
    } catch (e) {
      console.error("Error loading menu digital status:", e);
      setMenuDigitalStatus(null);
    } finally {
      setMenuDigitalLoading(false);
    }
  };

  useEffect(() => {
    void loadCampaigns();
    void loadOffers();
    void loadUsernameInfo();
    void loadMenuDigitalStatus();
  }, [establishment.id]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshCampaigns();
    }, 10_000);

    return () => window.clearInterval(id);
  }, [establishment.id]);

  useEffect(() => {
    setAppliedPromo(null);
    setPromoError(null);
  }, [cart]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, sortBy, sortDir]);

  const handleAddToCart = (offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return;

    const type = String(offer.type ?? "").toLowerCase();
    const isMenuDigital = type === "menu_digital";

    setCart((prev) => {
      let next = prev;
      if (isMenuDigital) {
        next = prev.filter((i) => {
          const o = offers.find((x) => x.id === i.offer_id);
          return String(o?.type ?? "").toLowerCase() !== "menu_digital";
        });
      }

      const alreadyInCart = next.some((i) => i.offer_id === offerId);

      if (!offer.allow_quantity) {
        if (alreadyInCart) return next;
        return [...next, { offer_id: offerId, quantity: 1 }];
      }

      if (alreadyInCart) {
        return next.map((i) => (i.offer_id === offerId ? { ...i, quantity: Math.min(i.quantity + 1, 999) } : i));
      }

      return [...next, { offer_id: offerId, quantity: 1 }];
    });

    toast({
      title: isMenuDigital ? "Abonnement sélectionné" : "Ajouté au panier",
      description: offer.title || "Offre ajoutée",
    });
  };

  const handleRemoveFromCart = (offerId: string) => {
    setCart((prev) => prev.filter((i) => i.offer_id !== offerId));
  };

  const handleUpdateQuantity = (offerId: string, quantity: number) => {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer?.allow_quantity) return;

    if (quantity <= 0) {
      handleRemoveFromCart(offerId);
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.offer_id === offerId ? { ...i, quantity: Math.min(Math.max(quantity, 1), 999) } : i))
    );
  };

  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const offer = offers.find((o) => o.id === item.offer_id);
      return sum + (offer ? offer.price_cents * item.quantity : 0);
    }, 0);
  }, [cart, offers]);

  const cartDiscount = appliedPromo?.discount_cents ?? 0;
  const cartTotal = Math.max(0, cartSubtotal - cartDiscount);

  const handleApplyPromo = async () => {
    const code = promoCodeInput.trim();
    if (!code) return;

    setPromoApplying(true);
    setPromoError(null);

    try {
      const res = await validateProVisibilityPromoCode(establishment.id, cart, code);
      setAppliedPromo(res);
      toast({ title: "Code promo appliqué", description: res.promo.code });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Code promo invalide";
      setAppliedPromo(null);
      setPromoError(msg);
      toast({ title: "Code promo", description: msg, variant: "destructive" });
    } finally {
      setPromoApplying(false);
    }
  };

  const offersByType = useMemo(() => {
    const packs: VisibilityOffer[] = [];
    const options: VisibilityOffer[] = [];
    const menuDigital: VisibilityOffer[] = [];
    const mediaVideo: VisibilityOffer[] = [];
    const usernameSubscription: VisibilityOffer[] = [];
    const other: VisibilityOffer[] = [];

    for (const o of offers) {
      const t = (o.type ?? "").toLowerCase();
      if (t === "pack") packs.push(o);
      else if (t === "option") options.push(o);
      else if (t === "menu_digital") menuDigital.push(o);
      else if (t === "media_video") mediaVideo.push(o);
      else if (t === "username_subscription") usernameSubscription.push(o);
      else other.push(o);
    }

    return { packs, options, menuDigital, mediaVideo, usernameSubscription, other };
  }, [offers]);

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    setCheckingOut(true);
    try {
      const response = await checkoutProVisibilityCart(establishment.id, cart, appliedPromo?.promo.code || undefined);

      if (response.payment.confirm_endpoint) {
        await confirmProVisibilityOrder(establishment.id, response.order.id);
        setCart([]);
        setCheckoutDialogOpen(false);
        toast({
          title: "Commande confirmée !",
          description: `Commande #${response.order.id.slice(0, 8)} créée en mode démo`,
        });
      } else if (response.payment.payment_url) {
        window.location.href = response.payment.payment_url;
      }
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur lors du checkout",
        variant: "destructive",
      });
    } finally {
      setCheckingOut(false);
    }
  };

  // Statistics
  const stats = useMemo(() => {
    const activeCount = items.filter((i) => i.status === "active").length;
    const totalBudget = items.reduce((sum, c) => sum + (c.budget || 0), 0);
    const totalImpressions = items.reduce((sum, c) => sum + getCampaignMetric(c, "impressions"), 0);
    const totalClicks = items.reduce((sum, c) => sum + getCampaignMetric(c, "clicks"), 0);

    return { activeCount, totalBudget, totalImpressions, totalClicks };
  }, [items]);

  // Filtered and sorted campaigns
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => c.title.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
    }

    // Status filter
    if (statusFilter !== "__all__") {
      result = result.filter((c) => c.status === statusFilter);
    }

    // Sorting
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sortBy === "budget") {
        cmp = (a.budget || 0) - (b.budget || 0);
      } else if (sortBy === "status") {
        cmp = a.status.localeCompare(b.status);
      } else {
        // created (default)
        cmp = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [items, searchQuery, statusFilter, sortBy, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, currentPage]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const validateForm = (f: CampaignForm): FormErrors => {
    const errors: FormErrors = {};
    if (!f.title.trim()) errors.title = true;
    const budgetMad = Number(f.budget);
    if (!Number.isFinite(budgetMad) || budgetMad <= 0) errors.budget = true;
    return errors;
  };

  const create = async () => {
    if (!canManage(role)) return;

    const errors = validateForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({ title: "Erreur", description: "Veuillez remplir les champs obligatoires.", variant: "destructive" });
      return;
    }

    setCreating(true);
    setError(null);

    const title = form.title.trim();
    const budgetMad = Number(form.budget);
    const budget = Math.round(budgetMad * 100);

    const startsAt = form.startsAt ? new Date(form.startsAt).toISOString() : null;
    const endsAt = form.endsAt ? new Date(form.endsAt).toISOString() : null;

    try {
      await createProCampaign({
        establishmentId: establishment.id,
        data: {
          type: form.type,
          title,
          billing_model: form.billingModel,
          budget,
          starts_at: startsAt,
          ends_at: endsAt,
        },
      });

      toast({ title: "Campagne créée", description: `"${title}" a été créée avec succès.` });
      setForm(emptyForm);
      setFormErrors({});
      await loadCampaigns();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setError(msg);
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const openEditDialog = (campaign: ProCampaign) => {
    setEditingCampaign(campaign);
    setEditForm({
      type: campaign.type,
      title: campaign.title,
      billingModel: getCampaignBillingModel(campaign) || "cpc",
      budget: String((campaign.budget || 0) / 100),
      startsAt: campaign.starts_at ? campaign.starts_at.slice(0, 16) : "",
      endsAt: campaign.ends_at ? campaign.ends_at.slice(0, 16) : "",
    });
    setEditFormErrors({});
    setEditDialogOpen(true);
  };

  const saveEdit = async () => {
    if (!editingCampaign || !canManage(role)) return;

    const errors = validateForm(editForm);
    setEditFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({ title: "Erreur", description: "Veuillez remplir les champs obligatoires.", variant: "destructive" });
      return;
    }

    setSaving(true);

    const title = editForm.title.trim();
    const budgetMad = Number(editForm.budget);
    const budget = Math.round(budgetMad * 100);

    const startsAt = editForm.startsAt ? new Date(editForm.startsAt).toISOString() : null;
    const endsAt = editForm.endsAt ? new Date(editForm.endsAt).toISOString() : null;

    try {
      await updateProCampaign({
        establishmentId: establishment.id,
        campaignId: editingCampaign.id,
        data: {
          type: editForm.type,
          title,
          billing_model: editForm.billingModel,
          budget,
          starts_at: startsAt,
          ends_at: endsAt,
        },
      });

      toast({ title: "Campagne modifiée", description: `"${title}" a été mise à jour.` });
      setEditDialogOpen(false);
      setEditingCampaign(null);
      await loadCampaigns();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (campaign: ProCampaign) => {
    setDeletingCampaign(campaign);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingCampaign || !canManage(role)) return;

    setDeleting(true);
    try {
      await deleteProCampaign({ establishmentId: establishment.id, campaignId: deletingCampaign.id });
      toast({ title: "Campagne supprimée", description: `"${deletingCampaign.title}" a été supprimée.` });
      setDeleteDialogOpen(false);
      setDeletingCampaign(null);
      await loadCampaigns();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const duplicateCampaign = (campaign: ProCampaign) => {
    setForm({
      type: campaign.type,
      title: `${campaign.title} (copie)`,
      billingModel: getCampaignBillingModel(campaign) || "cpc",
      budget: String((campaign.budget || 0) / 100),
      startsAt: "",
      endsAt: "",
    });
    setFormErrors({});
    toast({ title: "Campagne dupliquée", description: "Modifiez les détails et créez la campagne." });

    // Scroll to form
    document.getElementById("campaign-form")?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleCampaignStatus = async (campaign: ProCampaign) => {
    if (!canManage(role)) return;

    const newStatus = campaign.status === "active" ? "paused" : "active";

    try {
      await updateProCampaign({
        establishmentId: establishment.id,
        campaignId: campaign.id,
        data: { status: newStatus },
      });

      toast({
        title: newStatus === "active" ? "Campagne activée" : "Campagne mise en pause",
        description: `"${campaign.title}" est maintenant ${newStatus === "active" ? "active" : "en pause"}.`,
      });
      await loadCampaigns();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
    setFormErrors({});
  };

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Campagnes actives
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold tabular-nums text-emerald-600">{stats.activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Impressions totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold tabular-nums">{stats.totalImpressions.toLocaleString("fr-FR")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <MousePointer className="w-3.5 h-3.5" />
              Clics totaux
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold tabular-nums">{stats.totalClicks.toLocaleString("fr-FR")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-600">Budget total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold tabular-nums">{formatMoney(stats.totalBudget, "MAD")}</div>
          </CardContent>
        </Card>
      </div>

      {error ? <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div> : null}

      {/* Tabs: Marketplace / Commandes */}
      <Tabs defaultValue="marketplace" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="marketplace" className="gap-2">
            <ShoppingCart className="w-4 h-4" />
            Marketplace
          </TabsTrigger>
          <TabsTrigger value="commandes" className="gap-2">
            <Package className="w-4 h-4" />
            Mes commandes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="marketplace">
          <Card>
            <CardHeader>
              <SectionHeaderTooltip
                title="OFFRES DISPONIBLES"
                description="Achetez des services de visibilité pour votre établissement."
                icon={ShoppingCart}
                titleClassName="text-sm font-extrabold tracking-wide text-primary uppercase"
              />
            </CardHeader>
            <CardContent className="space-y-4">
          {offersError ? (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{offersError}</span>
            </div>
          ) : null}

          {offersLoading ? (
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Chargement des offres…
            </div>
          ) : offers.length ? (
            <>
              <div className="space-y-6">
                {/* Username Subscription Section - Top of marketplace */}
                {(offersByType.usernameSubscription.length > 0 || !usernameLoading) && (
                  <UsernameSubscriptionSection
                    offer={offersByType.usernameSubscription[0] ?? null}
                    usernameInfo={usernameInfo}
                    establishmentId={establishment.id}
                    onAddToCart={handleAddToCart}
                    onRefresh={loadUsernameInfo}
                  />
                )}

                {/* Menu Digital Section - Show sync if enabled, otherwise show plans */}
                {!menuDigitalLoading && (
                  menuDigitalStatus?.enabled ? (
                    <MenuDigitalSync
                      establishmentId={establishment.id}
                      establishmentName={establishment.name || ""}
                    />
                  ) : offersByType.menuDigital.length ? (
                    <MenuDigitalPlans
                      offers={offersByType.menuDigital}
                      billingCycle={menuDigitalBilling}
                      onBillingCycleChange={setMenuDigitalBilling}
                      onAddToCart={handleAddToCart}
                    />
                  ) : null
                )}

                {offersByType.packs.length ? (
                  <div className="space-y-4">
                    <ServiceSectionHeader
                      title="SAM Media"
                      subtitle="Vidéo professionnelle + diffusion + sponsoring"
                      icon={Video}
                      variant="pack"
                    />
                    <OfferGrid
                      offers={offersByType.packs}
                      onAddToCart={handleAddToCart}
                      className="grid grid-cols-1 md:grid-cols-2 gap-4"
                      variant="pack"
                    />
                  </div>
                ) : null}

                {offersByType.options.length ? (
                  <div className="space-y-4">
                    <ServiceSectionHeader
                      title="Services complémentaires"
                      subtitle="Ajoutez des services à la carte pour booster votre visibilité"
                      icon={Settings}
                      variant="option"
                    />
                    <OfferCarousel offers={offersByType.options} onAddToCart={handleAddToCart} variant="option" />
                  </div>
                ) : null}

                {offersByType.other.length ? (
                  <div className="space-y-3">
                    <div>
                      <div className="font-semibold">Autres offres</div>
                    </div>
                    <OfferGrid offers={offersByType.other} onAddToCart={handleAddToCart} />
                  </div>
                ) : null}
              </div>

              {cart.length > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Panier
                    <Badge variant="secondary" className="ms-1">
                      {cart.length}
                    </Badge>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {cart.map((item) => {
                      const offer = offers.find((o) => o.id === item.offer_id);
                      if (!offer) return null;

                      const itemTotal = offer.price_cents * item.quantity;

                      return (
                        <div key={item.offer_id} className="flex items-center justify-between text-sm bg-white p-2 rounded">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{offer.title || offer.type}</div>
                            <div className="text-xs text-slate-600">
                              {formatMoney(offer.price_cents, offer.currency)} × {item.quantity}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 ms-2">
                            {offer.allow_quantity && (
                              <Input
                                type="number"
                                min={1}
                                max={999}
                                value={item.quantity}
                                onChange={(e) => handleUpdateQuantity(item.offer_id, parseInt(e.target.value) || 1)}
                                className="w-14 h-8 text-xs text-center"
                              />
                            )}

                            <div className="text-end min-w-[70px]">
                              <div className="font-semibold text-xs tabular-nums">{formatMoney(itemTotal, offer.currency)}</div>
                            </div>

                            <button
                              onClick={() => handleRemoveFromCart(item.offer_id)}
                              className="text-slate-400 hover:text-red-600 transition-colors"
                              aria-label="Supprimer du panier"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input
                        value={promoCodeInput}
                        onChange={(e) => setPromoCodeInput(e.target.value)}
                        placeholder="Code promo"
                        className="sm:col-span-2"
                      />
                      <Button
                        variant="outline"
                        disabled={promoApplying || cart.length === 0 || !promoCodeInput.trim()}
                        onClick={() => void handleApplyPromo()}
                      >
                        {promoApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Appliquer"}
                      </Button>
                    </div>

                    {promoError ? <div className="text-xs text-red-600">{promoError}</div> : null}

                    <div className="flex items-center justify-between text-sm">
                      <div className="text-slate-600">Sous-total</div>
                      <div className="font-semibold tabular-nums">
                        {formatMoney(cartSubtotal, offers.length > 0 ? offers[0]?.currency : "MAD")}
                      </div>
                    </div>

                    {appliedPromo ? (
                      <div className="flex items-center justify-between text-sm">
                        <div className="text-slate-600">Remise ({appliedPromo.promo.code})</div>
                        <div className="font-semibold tabular-nums text-emerald-700">
                          -{formatMoney(appliedPromo.discount_cents, offers.length > 0 ? offers[0]?.currency : "MAD")}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm">Total :</div>
                      <div className="text-lg font-bold tabular-nums">
                        {formatMoney(cartTotal, offers.length > 0 ? offers[0]?.currency : "MAD")}
                      </div>
                    </div>
                  </div>

                  <Button className="w-full" disabled={checkingOut} onClick={() => setCheckoutDialogOpen(true)}>
                    {checkingOut ? (
                      <>
                        <Loader2 className="w-4 h-4 me-2 animate-spin" />
                        Paiement…
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-4 h-4 me-2" />
                        Procéder au paiement
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-slate-600 text-center py-8">Aucune offre disponible pour le moment.</div>
          )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commandes">
          <ProVisibilityOrders establishmentId={establishment.id} />
        </TabsContent>
      </Tabs>

      {/* Checkout Dialog */}
      <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer votre commande</DialogTitle>
            <DialogDescription>
              Total : {formatMoney(cartTotal, offers.length > 0 ? offers[0]?.currency : "MAD")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-48 overflow-y-auto">
            {cart.map((item) => {
              const offer = offers.find((o) => o.id === item.offer_id);
              if (!offer) return null;
              return (
                <div key={item.offer_id} className="text-sm flex items-center justify-between">
                  <div>
                    <div className="font-medium">{offer.title || offer.type}</div>
                    <div className="text-xs text-slate-600">Quantité: {item.quantity}</div>
                  </div>
                  <div className="font-semibold">{formatMoney(offer.price_cents * item.quantity, offer.currency)}</div>
                </div>
              );
            })}
          </div>

          {appliedPromo ? (
            <div className="pt-3 border-t space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <div className="text-slate-600">Sous-total</div>
                <div className="font-semibold tabular-nums">
                  {formatMoney(cartSubtotal, offers.length > 0 ? offers[0]?.currency : "MAD")}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-slate-600">Remise ({appliedPromo.promo.code})</div>
                <div className="font-semibold tabular-nums text-emerald-700">
                  -{formatMoney(appliedPromo.discount_cents, offers.length > 0 ? offers[0]?.currency : "MAD")}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="font-semibold">Total</div>
                <div className="font-bold tabular-nums">
                  {formatMoney(cartTotal, offers.length > 0 ? offers[0]?.currency : "MAD")}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutDialogOpen(false)} disabled={checkingOut}>
              Annuler
            </Button>
            <Button onClick={() => void handleCheckout()} disabled={checkingOut} className="gap-2">
              {checkingOut ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Paiement…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmer & payer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!canManage(role) ? (
        <div className="text-sm text-slate-600 bg-slate-50 border rounded-lg p-3">
          Votre rôle ne permet pas de gérer la visibilité.
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 flex items-start gap-3">
        <Rocket className="w-4 h-4 mt-0.5 text-primary" />
        <div>
          <div className="font-semibold">Conseil conversion</div>
          <div className="mt-1">
            Combinez une offre de visibilité avec un pack limité pour créer un effet d'urgence. Pour gérer vos campagnes publicitaires, rendez-vous dans l'onglet <strong>Publicités</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}
