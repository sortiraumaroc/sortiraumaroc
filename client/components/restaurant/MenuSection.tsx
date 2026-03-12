import * as React from "react";

import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Gift, Minus, Plus, Search, ThumbsDown, ThumbsUp, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { isAuthed, openAuthModal } from "@/lib/auth";
import { useMenuVotes } from "@/hooks/useMenuVotes";
import type { VoteStats } from "@/lib/menuVotesApi";
import { useI18n } from "@/lib/i18n";
import { scrollElementIntoCenterX } from "@/lib/scroll";
import { AuthModalV2 } from "@/components/AuthModalV2";
import { DatePickerInput } from "@/components/DatePickerInput";
import { TimePickerInput } from "@/components/TimePickerInput";
import { Button } from "@/components/ui/button";
import type { DateTimeCompatibility, LegacyRestaurantHours } from "./openingHoursUtils";
import { formatTimeFr, isDateTimeCompatible, normalizeOpeningHours } from "./openingHoursUtils";

export type MenuBadge =
  | "New"
  | "Nouveau"
  | "Best seller"
  | "Chef selection"
  | "Spécialité"
  | "Spécialité du Chef"
  | "Healthy"
  | "Végétarien"
  | "Rapide";

export type MenuItem = {
  id: number;
  inventoryItemId?: string;
  slug?: string;
  name: string;
  description: string;
  price: string;
  badge?: MenuBadge;
  badges?: MenuBadge[];
};

export type MenuCategory = {
  id: string;
  name: string;
  items: MenuItem[];
};

export type Pack = {
  id: string;
  title: string;
  items: string[];
  price: number;
  original_price?: number;
  is_limited?: boolean;
  availability?: "today" | "week" | "permanent";
  max_reservations?: number;
};

type MenuSectionProps = {
  establishmentId: string;
  categories: MenuCategory[];
  packs?: Pack[];
  legacyHours?: LegacyRestaurantHours | null;
  className?: string;
};

// ---------------------------------------------------------------------------
// Menu preview constants
// ---------------------------------------------------------------------------
const PREVIEW_CATEGORIES = 5;
const PREVIEW_ITEMS_PER_CAT = 3;

type BookingSelection = {
  id: string;
  title: string;
  price?: number;
  originalPrice?: number;
};

function formatDhs(n: number): string {
  return `${Math.round(n)} Dhs`;
}


function normalizeBadge(b: string): MenuBadge {
  const value = b.trim();
  if (value === "New") return "Nouveau";
  if (value === "Chef selection") return "Spécialité du Chef";
  return value as MenuBadge;
}

function badgeLabel(
  badge: MenuBadge,
  t: (key: string) => string,
): { text: string; tone: "primary" | "neutral" } {
  switch (badge) {
    case "Nouveau":
    case "New":
      return { text: `🆕 ${t("menu.badge.new")}`, tone: "primary" };
    case "Spécialité":
    case "Chef selection":
    case "Spécialité du Chef":
      return { text: `⭐ ${t("menu.badge.specialty")}`, tone: "primary" };
    case "Best seller":
      return { text: `🔥 ${t("menu.badge.best_seller")}`, tone: "primary" };
    case "Healthy":
      return { text: `🥗 ${t("menu.badge.healthy")}`, tone: "neutral" };
    case "Végétarien":
      return { text: `🟢 ${t("menu.badge.vegetarian")}`, tone: "neutral" };
    case "Rapide":
      return { text: `⏱ ${t("menu.badge.fast")}`, tone: "neutral" };
    default:
      return { text: badge, tone: "neutral" };
  }
}

type MenuSortMode = "default" | "popular" | "best_sellers";

function getNormalizedBadges(item: Pick<MenuItem, "badge" | "badges">): MenuBadge[] {
  const raw = Array.isArray(item.badges) && item.badges.length ? item.badges : item.badge ? [item.badge] : [];
  return raw
    .map((b) => normalizeBadge(String(b)))
    .filter((b, i, arr) => arr.indexOf(b) === i);
}

function popularScore(badges: MenuBadge[]): number {
  if (badges.includes("Best seller")) return 3;
  if (badges.includes("Spécialité") || badges.includes("Spécialité du Chef") || badges.includes("Chef selection")) return 2;
  if (badges.includes("Nouveau") || badges.includes("New")) return 1;
  return 0;
}

function sortMenuItems(items: MenuItem[], mode: MenuSortMode): MenuItem[] {
  if (mode === "default") return items;

  const indexed = items.map((item, index) => {
    const badges = getNormalizedBadges(item);

    const score =
      mode === "best_sellers"
        ? badges.includes("Best seller")
          ? 1
          : 0
        : popularScore(badges);

    return { item, index, score };
  });

  indexed.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  return indexed.map((x) => x.item);
}

function MenuBadges({ item, isFavorite }: { item: MenuItem; isFavorite?: boolean }) {
  const { t } = useI18n();
  const badges = getNormalizedBadges(item);

  if (!badges.length && !isFavorite) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {isFavorite && (
        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          ❤️ {t("menu.vote.favorite_badge")}
        </span>
      )}
      {badges.map((b) => {
        const { text, tone } = badgeLabel(b, t);
        return (
          <span
            key={b}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
              tone === "primary" ? "bg-[#a3001d]/10 text-[#a3001d]" : "bg-slate-100 text-slate-700",
            )}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}

interface MenuItemCardProps {
  item: MenuItem;
  restaurantId?: string;
  voteStats?: VoteStats;
  myVote?: "like" | "dislike" | null;
  onVote?: (vote: "like" | "dislike") => void;
}

function MenuItemCard({ item, restaurantId, voteStats, myVote, onVote }: MenuItemCardProps) {
  const { t } = useI18n();

  const handleVote = (vote: "like" | "dislike") => {
    if (!isAuthed()) {
      openAuthModal();
      return;
    }
    onVote?.(vote);
  };

  const dishLink = item.slug && restaurantId ? `/restaurant/${encodeURIComponent(restaurantId)}/menu/${encodeURIComponent(item.slug)}` : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {dishLink ? (
            <Link to={dishLink} className="text-base sm:text-lg font-semibold text-slate-900 leading-snug hover:text-[#a3001d] transition-colors">
              {item.name}
            </Link>
          ) : (
            <div className="text-base sm:text-lg font-semibold text-slate-900 leading-snug">{item.name}</div>
          )}
        </div>
        <div className="shrink-0 text-end">
          <div className="text-base sm:text-lg font-semibold text-[#a3001d] tabular-nums whitespace-nowrap">{item.price}</div>
        </div>
      </div>

      <MenuBadges item={item} isFavorite={voteStats?.isFavorite} />

      {item.description ? <div className="mt-2 text-sm text-slate-600">{item.description}</div> : null}

      {/* Like / Dislike buttons */}
      {item.inventoryItemId && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleVote("like")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              myVote === "like"
                ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 border border-transparent",
            )}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            {(voteStats?.likes ?? 0) > 0 && <span>{voteStats!.likes}</span>}
          </button>
          <button
            type="button"
            onClick={() => handleVote("dislike")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              myVote === "dislike"
                ? "bg-red-100 text-red-700 border border-red-300"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 border border-transparent",
            )}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            {(voteStats?.dislikes ?? 0) > 0 && <span>{voteStats!.dislikes}</span>}
          </button>
        </div>
      )}
    </div>
  );
}

function computeUrgencyText(pack: Pack, t: (key: string) => string): string {
  if (pack.availability === "today") return `🔥 ${t("pack.urgency.today_only")}`;
  if (pack.is_limited && typeof pack.max_reservations === "number") return `⏳ ${t("pack.urgency.limited_recommended")}`;
  if (pack.is_limited) return `⚡ ${t("pack.urgency.high_demand")}`;
  return `🎯 ${t("pack.urgency.exclusive")}`;
}

function buildBookingUrl(params: {
  establishmentId: string;
  selection?: BookingSelection;
  date?: string;
  time?: string;
  people?: string;
}) {
  const qs = new URLSearchParams();

  if (params.selection) {
    qs.set("packId", params.selection.id);
    qs.set("packTitle", params.selection.title);

    if (typeof params.selection.price === "number" && Number.isFinite(params.selection.price)) {
      qs.set("packPrice", String(params.selection.price));
    }

    if (typeof params.selection.originalPrice === "number" && Number.isFinite(params.selection.originalPrice)) {
      qs.set("packOriginalPrice", String(params.selection.originalPrice));
    }
  }

  if (params.date) qs.set("date", params.date);
  if (params.time) qs.set("time", params.time);
  if (params.people) qs.set("people", params.people);

  const base = `/booking/${encodeURIComponent(params.establishmentId)}`;
  const query = qs.toString();
  return query ? `${base}?${query}` : base;
}

function selectionFromPack(pack: Pack): BookingSelection {
  return {
    id: pack.id,
    title: pack.title,
    price: pack.price,
    originalPrice: pack.original_price,
  };
}


function PackCard({ pack, onReserve }: { pack: Pack; onReserve: () => void }) {
  const { t } = useI18n();
  const urgency = computeUrgencyText(pack, t);

  return (
    <div className="rounded-2xl border border-[#a3001d]/15 bg-[#a3001d]/[0.04] p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-[#a3001d]" />
            <div className="text-base sm:text-lg font-semibold text-slate-900">🎁 {pack.title}</div>
          </div>
          <div className="mt-1 text-sm font-semibold text-orange-900">{urgency}</div>
        </div>
        {pack.is_limited ? (
          <span className="shrink-0 inline-flex items-center rounded-full bg-orange-100 text-orange-800 px-3 py-1 text-xs font-semibold">
            {t("common.limited_offer")}
          </span>
        ) : null}
      </div>

      <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
        {pack.items.map((it) => (
          <li key={it} className="flex items-start gap-2">
            <span className="mt-0.5 text-slate-500">•</span>
            <span className="min-w-0">{it}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <div className="text-sm text-slate-600">💰 {formatDhs(pack.price)} {t("common.per_person")}</div>
          {typeof pack.original_price === "number" && pack.original_price > pack.price ? (
            <div className="text-xs text-slate-500">
              ({t("common.instead_of")} <span className="line-through">{formatDhs(pack.original_price)}</span>)
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          onClick={onReserve}
          className="w-full sm:w-auto sm:px-8 h-10 text-sm bg-[#a3001d] hover:bg-[#a3001d]/90 text-white font-semibold rounded-xl"
        >
          {t("pack.book_cta")}
        </Button>
      </div>
    </div>
  );
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeForSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function PeoplePicker({ value, onChange, className }: { value: number; onChange: (value: number) => void; className?: string }) {
  const { t } = useI18n();
  const unit = value === 1 ? t("common.person.one") : t("common.person.other");

  return (
    <div className={cn("relative w-full", className)}>
      <Users className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
      <div
        className={cn(
          "w-full h-10 md:h-11 ps-10 pe-2 bg-slate-100 border border-slate-200 rounded-md flex items-center justify-between",
          "focus-within:ring-2 focus-within:ring-primary",
        )}
      >
        <div className="text-sm italic text-gray-700">{value} {unit}</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="h-9 w-9 rounded-md border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => onChange(value - 1)}
            disabled={value <= 1}
            aria-label={t("booking.people.remove_one")}
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="h-9 w-9 rounded-md border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => onChange(value + 1)}
            disabled={value >= 20}
            aria-label={t("booking.people.add_one")}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickBookingCard(args: {
  date: string;
  time: string;
  people: number;
  compatibility?: DateTimeCompatibility | null;
  onChangeDate: (date: string) => void;
  onChangeTime: (time: string) => void;
  onChangePeople: (people: number) => void;
  onReserve: () => void;
}) {
  const { t, locale } = useI18n();
  const canReserve = Boolean(args.date) && Boolean(args.time) && args.people > 0;

  const hintText = React.useMemo(() => {
    const compatibility = args.compatibility;
    if (!compatibility || compatibility.ok === true) return null;

    if (compatibility.reason === "closed_day") return t("restaurant.hours.compatibility.closed_day");
    if (compatibility.reason === "opens_at") {
      const time = locale === "fr" ? formatTimeFr(compatibility.timeHm) : compatibility.timeHm;
      return t("restaurant.hours.compatibility.opens_at", { time });
    }
    if (compatibility.reason === "opens_tomorrow_at") {
      const time = locale === "fr" ? formatTimeFr(compatibility.timeHm) : compatibility.timeHm;
      return t("restaurant.hours.compatibility.opens_tomorrow_at", { time });
    }

    return t("restaurant.hours.compatibility.not_compatible");
  }, [args.compatibility, locale, t]);

  return (
    <div id="reservation-rapide" data-cat="reservation" className="scroll-mt-44 rounded-2xl border border-primary/15 bg-primary/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{t("restaurant.quick_booking.title")}</div>
          <div className="mt-1 text-sm text-slate-700">{t("restaurant.quick_booking.subtitle")}</div>
        </div>
        <span className="shrink-0 inline-flex items-center rounded-full bg-white/70 border border-primary/20 px-3 py-1 text-xs font-semibold text-primary">
          {t("restaurant.quick_booking.duration")}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <DatePickerInput value={args.date} onChange={args.onChangeDate} />
        <TimePickerInput value={args.time} onChange={args.onChangeTime} />
        <PeoplePicker value={args.people} onChange={args.onChangePeople} />
      </div>


      {args.compatibility?.ok === false ? (
        <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <div className="font-semibold">{t("restaurant.quick_booking.closed_warning")}</div>
          {hintText ? <div className="mt-0.5 text-xs opacity-90">{hintText}</div> : null}
        </div>
      ) : null}

      <div className="mt-2 text-xs text-slate-600">
        {t("restaurant.quick_booking.advice")}
      </div>
    </div>
  );
}

export function MenuSection({ establishmentId, categories, packs, legacyHours, className }: MenuSectionProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [authOpen, setAuthOpen] = React.useState(false);
  const [pendingUrl, setPendingUrl] = React.useState<string | null>(null);

  // Menu item votes (like/dislike)
  const { votesMap, myVotesMap, toggleVote } = useMenuVotes(establishmentId);

  const hasPacks = Array.isArray(packs) && packs.length > 0;

  const menuCategories = React.useMemo(() => {
    const cleaned = categories || [];
    const result = cleaned.slice();

    if (hasPacks && !result.some((c) => c.id === "packs")) {
      result.unshift({ id: "packs", name: t("menu.group.packs"), items: [] });
    }

    if (hasPacks) {
      const idx = result.findIndex((c) => c.id === "packs");
      if (idx > 0) {
        const [p] = result.splice(idx, 1);
        result.unshift(p);
      }
    }

    return result;
  }, [categories, hasPacks, t]);

  const navItems = React.useMemo(() => {
    const items: Array<{ id: string; name: string }> = [];
    for (const c of menuCategories) items.push({ id: c.id, name: c.name });
    return items;
  }, [menuCategories]);

  const sectionId = (id: string) => `menu-section-${id}`;

  const mobileNavRef = React.useRef<HTMLDivElement | null>(null);

  const getSectionElement = (id: string): HTMLElement | null => {
    return document.getElementById(sectionId(id));
  };

  const [activeCategoryId, setActiveCategoryId] = React.useState<string>(navItems[0]?.id ?? "");
  const activeCategoryRef = React.useRef(activeCategoryId);
  const manualScrollUntilRef = React.useRef<number>(0);

  // Declare before scroll observer (which depends on menuExpanded)
  const [menuQuery, setMenuQuery] = React.useState<string>("");
  const [menuExpanded, setMenuExpanded] = React.useState(false);
  const [sortMode, setSortMode] = React.useState<MenuSortMode>("default");

  React.useEffect(() => {
    activeCategoryRef.current = activeCategoryId;
  }, [activeCategoryId]);

  React.useEffect(() => {
    const container = mobileNavRef.current;
    if (!container) return;

    const activeButton = container.querySelector<HTMLElement>(`[data-cat-id="${activeCategoryId}"]`);
    if (!activeButton) return;

    scrollElementIntoCenterX(container, activeButton, { padding: 12 });
  }, [activeCategoryId]);

  React.useEffect(() => {
    const first = navItems[0]?.id ?? "";
    if (first && activeCategoryId !== first) setActiveCategoryId(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navItems.length]);

  const scrollToCategory = (id: string) => {
    // Avoid category flicker while smooth-scrolling.
    manualScrollUntilRef.current = Date.now() + 800;
    setActiveCategoryId(id);
    getSectionElement(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  React.useEffect(() => {
    const elements = navItems
      .map((it) => getSectionElement(it.id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (!elements.length) return;

    // This menu category nav is sticky on mobile at top-[7.25rem] (≈ 116px).
    // We use a fixed activation line just under the sticky UI to avoid micro-oscillations.
    const activationLinePx = 116 + 12;
    const tolerancePx = 12;

    let raf = 0;

    const compute = () => {
      if (Date.now() < manualScrollUntilRef.current) return;

      const activationY = window.scrollY + activationLinePx;

      let chosen: { id: string; top: number } | null = null;
      for (const el of elements) {
        const id = el.dataset.cat;
        if (!id) continue;
        const top = window.scrollY + el.getBoundingClientRect().top;

        if (top <= activationY + tolerancePx) {
          if (!chosen || top > chosen.top) {
            chosen = { id, top };
          }
        }
      }

      const nextId = chosen?.id ?? elements[0]?.dataset?.cat ?? "";
      if (nextId && nextId !== activeCategoryRef.current) {
        setActiveCategoryId(nextId);
      }
    };

    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    schedule();

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navItems.length, menuExpanded]);

  const dateParam = searchParams.get("date") || "";
  const timeParam = searchParams.get("time") || "";
  const peopleParam = searchParams.get("people") || "";

  const [date, setDate] = React.useState<string>(dateParam);
  const [time, setTime] = React.useState<string>(timeParam);
  const [people, setPeople] = React.useState<number>(() => {
    const n = Number(peopleParam);
    return Number.isFinite(n) && n > 0 ? clampInt(n, 1, 20) : 2;
  });

  React.useEffect(() => {
    if (dateParam !== date) setDate(dateParam);
    if (timeParam !== time) setTime(timeParam);

    const n = Number(peopleParam);
    const next = Number.isFinite(n) && n > 0 ? clampInt(n, 1, 20) : 2;
    if (next !== people) setPeople(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam, timeParam, peopleParam]);

  const updateUrlParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);

    if (value && value.trim()) {
      next.set(key, value.trim());
    } else {
      next.delete(key);
    }

    setSearchParams(next, { replace: true });
  };

  const startBooking = (url: string) => {
    if (!isAuthed()) {
      setPendingUrl(url);
      setAuthOpen(true);
      return;
    }

    navigate(url);
  };

  const reservePack = (pack: Pack) => {
    startBooking(
      buildBookingUrl({
        establishmentId,
        selection: selectionFromPack(pack),
        date: date || undefined,
        time: time || undefined,
        people: people ? String(people) : undefined,
      }),
    );
  };

  const reserveQuick = () => {
    startBooking(
      buildBookingUrl({
        establishmentId,
        date: date || undefined,
        time: time || undefined,
        people: people ? String(people) : undefined,
      }),
    );
  };

  const onAuthSuccess = () => {
    setAuthOpen(false);
    if (!pendingUrl) return;
    navigate(pendingUrl);
    setPendingUrl(null);
  };

  const normalizedQuery = normalizeForSearch(menuQuery);

  const sortedMenuCategories = React.useMemo(() => {
    if (sortMode === "default") return menuCategories;

    return menuCategories.map((c) => {
      if (c.id === "packs") return c;
      return { ...c, items: sortMenuItems(c.items ?? [], sortMode) };
    });
  }, [menuCategories, sortMode]);

  // ---------------------------------------------------------------------------
  // Preview mode: show limited categories/items until user clicks "expand"
  // ---------------------------------------------------------------------------

  const nonPackCategories = React.useMemo(
    () => sortedMenuCategories.filter((c) => c.id !== "packs"),
    [sortedMenuCategories],
  );
  const hiddenCategoriesCount = Math.max(0, nonPackCategories.length - PREVIEW_CATEGORIES);

  const visibleCategories = React.useMemo(() => {
    if (menuExpanded) return nonPackCategories;
    return nonPackCategories.slice(0, PREVIEW_CATEGORIES);
  }, [nonPackCategories, menuExpanded]);

  const getVisibleItems = React.useCallback(
    (cat: MenuCategory): MenuItem[] => {
      if (menuExpanded) return cat.items;
      return cat.items.slice(0, PREVIEW_ITEMS_PER_CAT);
    },
    [menuExpanded],
  );

  const visibleNavItems = React.useMemo(() => {
    if (menuExpanded) return navItems;
    const items: Array<{ id: string; name: string }> = [];
    // Always include packs in nav if present
    for (const c of menuCategories) {
      if (c.id === "packs") items.push({ id: c.id, name: c.name });
    }
    for (const c of nonPackCategories.slice(0, PREVIEW_CATEGORIES)) {
      items.push({ id: c.id, name: c.name });
    }
    return items;
  }, [menuCategories, nonPackCategories, menuExpanded, navItems]);

  const searchResults = React.useMemo(() => {
    if (!normalizedQuery) return null;

    const results: Array<{
      id: string;
      name: string;
      items: MenuItem[];
      packs?: Pack[];
    }> = [];

    if (hasPacks) {
      const p = (packs ?? []).filter((pack) => {
        const hay = normalizeForSearch([pack.title, ...pack.items].join(" "));
        return hay.includes(normalizedQuery);
      });

      if (p.length) {
        results.push({ id: "packs", name: t("menu.group.packs"), items: [], packs: p });
      }
    }

    for (const c of (categories ?? [])) {
      const matched = (c.items ?? [])
        .filter((it) => {
          const hay = normalizeForSearch(`${it.name} ${it.description}`);
          return hay.includes(normalizedQuery);
        });

      const sorted = sortMenuItems(matched, sortMode);
      if (sorted.length) results.push({ id: c.id, name: c.name, items: sorted });
    }

    const total = results.reduce((sum, r) => sum + (r.packs ? r.packs.length : r.items.length), 0);

    return { results, total };
  }, [categories, hasPacks, packs, normalizedQuery, sortMode, t]);

  const searchBar = (
    <div className="relative">
      <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        value={menuQuery}
        onChange={(e) => setMenuQuery(e.target.value)}
        placeholder={t("menu.search.placeholder")}
        className="w-full h-10 md:h-11 ps-9 pe-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary text-sm font-[Circular_Std,_sans-serif]"
        type="search"
      />
    </div>
  );

  const sortBar = (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <span className="shrink-0 text-xs font-semibold text-slate-500">{t("menu.sort.label")}</span>
      {[
        { id: "default", label: t("menu.sort.all") },
        { id: "popular", label: t("menu.sort.popular") },
        { id: "best_sellers", label: t("menu.sort.best_sellers") },
      ].map((opt) => {
        const active = sortMode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => setSortMode(opt.id as MenuSortMode)}
            className={cn(
              "shrink-0 h-9 rounded-full px-4 text-sm font-semibold border transition",
              active
                ? "bg-[#a3001d] text-white border-[#a3001d]"
                : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  const normalizedHours = React.useMemo(() => {
    if (!legacyHours) return null;
    return normalizeOpeningHours({ legacyHours });
  }, [legacyHours]);

  const compatibility = React.useMemo(() => {
    if (!normalizedHours) return null;
    if (!date || !time) return null;
    return isDateTimeCompatible(normalizedHours, date, time);
  }, [normalizedHours, date, time]);

  const quickBooking = (
    <QuickBookingCard
      date={date}
      time={time}
      people={people}
      compatibility={compatibility}
      onChangeDate={(next) => {
        setDate(next);
        updateUrlParam("date", next);
      }}
      onChangeTime={(next) => {
        setTime(next);
        updateUrlParam("time", next);
      }}
      onChangePeople={(next) => {
        const v = clampInt(next, 1, 20);
        setPeople(v);
        updateUrlParam("people", String(v));
      }}
      onReserve={reserveQuick}
    />
  );

  return (
    <div className={cn("w-full font-[Circular_Std,_sans-serif]", className)}>
      <div className="mb-4 space-y-2">
        {searchBar}
        {sortBar}
      </div>

      {searchResults ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">
              {t("menu.search.results_label")} <span className="text-primary">{searchResults.total}</span>
            </div>
            <button
              type="button"
              className="text-sm font-semibold text-primary hover:text-primary/80"
              onClick={() => setMenuQuery("")}
            >
              {t("common.clear")}
            </button>
          </div>

          {searchResults.total === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
              {t("menu.search.no_results")}
            </div>
          ) : null}

          {searchResults.results.map((group) => (
            <div key={group.id} className="space-y-3">
              <div className="text-base font-semibold text-slate-900">{group.name}</div>

              {group.packs ? (
                <div className="space-y-4">
                  {group.packs.map((pack) => (
                    <PackCard key={pack.id} pack={pack} onReserve={() => reservePack(pack)} />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      restaurantId={establishmentId}
                      voteStats={item.inventoryItemId ? votesMap[item.inventoryItemId] : undefined}
                      myVote={item.inventoryItemId ? myVotesMap[item.inventoryItemId] ?? null : null}
                      onVote={(vote) => item.inventoryItemId && toggleVote(item.inventoryItemId, vote)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

        </div>
      ) : (
        <div className="md:grid md:grid-cols-12 md:gap-8">
          {/* ── Desktop sidebar ── */}
          <aside className="hidden md:block md:col-span-3">
            <div className="sticky top-28 flex flex-col gap-1.5 mt-3 md:mt-4">
              {visibleNavItems.map((item) => {
                const active = activeCategoryId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToCategory(item.id)}
                    className={cn(
                      "w-full text-start rounded-xl px-4 py-2 text-sm font-semibold border transition",
                      active
                        ? "bg-[#a3001d] text-white border-[#a3001d]"
                        : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    {item.name}
                  </button>
                );
              })}
              {!menuExpanded && hiddenCategoriesCount > 0 && (
                <button
                  type="button"
                  onClick={() => setMenuExpanded(true)}
                  className="w-full text-center rounded-xl px-4 py-2 text-xs font-semibold text-[#a3001d] border border-dashed border-[#a3001d]/30 hover:bg-[#a3001d]/5 transition"
                >
                  +{hiddenCategoriesCount} {t("menu.preview.categories_suffix")}
                </button>
              )}
            </div>
          </aside>

          <section className="md:col-span-9">
            {/* ── Mobile horizontal nav ── */}
            <div className="md:hidden sticky top-[7.25rem] z-20 -mx-4 px-4 py-2 mt-1 bg-white/95 backdrop-blur border-b border-slate-200">
              <div ref={mobileNavRef} className="flex gap-2 overflow-x-auto pb-1">
                {visibleNavItems.map((item) => {
                  const active = activeCategoryId === item.id;
                  return (
                    <button
                      key={item.id}
                      data-cat-id={item.id}
                      type="button"
                      onClick={() => scrollToCategory(item.id)}
                      className={cn(
                        "shrink-0 px-4 h-10 rounded-full text-sm font-semibold border",
                        active
                          ? "bg-[#a3001d] text-white border-[#a3001d]"
                          : "bg-white text-slate-800 border-slate-200",
                      )}
                    >
                      {item.name}
                    </button>
                  );
                })}
                {!menuExpanded && hiddenCategoriesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setMenuExpanded(true)}
                    className="shrink-0 px-4 h-10 rounded-full text-sm font-semibold border border-dashed border-[#a3001d]/30 text-[#a3001d]"
                  >
                    +{hiddenCategoriesCount}
                  </button>
                )}
              </div>
            </div>

            {/* ── Items panel ── */}
            <div className="pt-4 space-y-8">
              {hasPacks ? (
                <div id={sectionId("packs")} data-cat="packs" className="scroll-mt-44 space-y-4">
                  {(packs ?? []).map((pack) => (
                    <PackCard key={pack.id} pack={pack} onReserve={() => reservePack(pack)} />
                  ))}
                </div>
              ) : null}

              {visibleCategories.map((cat) => {
                const items = getVisibleItems(cat);
                const hiddenItemsCount = cat.items.length - items.length;
                return (
                  <div key={cat.id} id={sectionId(cat.id)} data-cat={cat.id} className="scroll-mt-44">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold text-slate-900">{cat.name}</h3>
                      <span className="text-xs font-semibold text-slate-500">{t("menu.items.count", { count: cat.items.length })}</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {items.map((item) => (
                        <MenuItemCard
                          key={item.id}
                          item={item}
                          restaurantId={establishmentId}
                          voteStats={item.inventoryItemId ? votesMap[item.inventoryItemId] : undefined}
                          myVote={item.inventoryItemId ? myVotesMap[item.inventoryItemId] ?? null : null}
                          onVote={(vote) => item.inventoryItemId && toggleVote(item.inventoryItemId, vote)}
                        />
                      ))}
                    </div>
                    {!menuExpanded && hiddenItemsCount > 0 && (
                      <p className="mt-2 text-center text-sm text-slate-400">
                        +{hiddenItemsCount} {hiddenItemsCount === 1 ? t("menu.preview.more_item") : t("menu.preview.more_items")}
                      </p>
                    )}
                  </div>
                );
              })}

              {/* ── Expand button ── */}
              {!menuExpanded && hiddenCategoriesCount > 0 && (
                <div className="flex justify-center pt-2 pb-4">
                  <button
                    type="button"
                    onClick={() => setMenuExpanded(true)}
                    className="flex items-center gap-2 rounded-xl border border-[#a3001d]/20 bg-[#a3001d]/5 px-6 py-3 text-sm font-semibold text-[#a3001d] hover:bg-[#a3001d]/10 transition"
                  >
                    <span>{t("menu.preview.see_full_menu")}</span>
                    <span className="text-xs opacity-70">(+{hiddenCategoriesCount} {t("menu.preview.categories_suffix")})</span>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <AuthModalV2
        isOpen={authOpen}
        onClose={() => {
          setAuthOpen(false);
          setPendingUrl(null);
        }}
        onAuthed={onAuthSuccess}
      />
    </div>
  );
}
