import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Clock, ExternalLink, MapPin, Timer, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  acceptMyConsumerWaitlistOffer,
  cancelMyConsumerWaitlist,
  refuseMyConsumerWaitlistOffer,
  type ConsumerWaitlistItem,
} from "@/lib/consumerWaitlistApi";
import { useI18n } from "@/lib/i18n";

import { formatDateJjMmAa, formatHeureHhHMM } from "@shared/datetime";

function isOfferExpiredByIso(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return false;
  return ts <= Date.now();
}

function formatIsoDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDateJjMmAa(iso);
  } catch {
    return iso;
  }
}

function formatIsoTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const out = formatHeureHhHMM(iso);
  return out ? out : "—";
}

function getLabelAndStyle(item: ConsumerWaitlistItem, t: (k: string, vars?: Record<string, any>) => string): { label: string; className: string } {
  const status = String(item.status ?? "").trim();

  if (status === "offer_sent" && !isOfferExpiredByIso(item.offer_expires_at)) {
    return { label: t("profile.waitlist.status.offer"), className: "bg-amber-50 text-amber-800 border-amber-200" };
  }

  if (status === "waiting" || status === "queued") {
    return { label: t("profile.waitlist.status.waiting"), className: "bg-blue-50 text-blue-800 border-blue-200" };
  }

  if (status === "accepted" || status === "converted_to_booking") {
    return { label: t("profile.waitlist.status.accepted"), className: "bg-emerald-50 text-emerald-800 border-emerald-200" };
  }

  if (status === "cancelled" || status === "declined" || status === "expired" || status.startsWith("offer_") || status.endsWith("_gone")) {
    return { label: t("profile.waitlist.status.expired"), className: "bg-slate-100 text-slate-700 border-slate-200" };
  }

  return { label: status ? status : t("profile.waitlist.status.unknown"), className: "bg-slate-100 text-slate-700 border-slate-200" };
}

function isActiveItem(item: ConsumerWaitlistItem): boolean {
  const status = String(item.status ?? "").trim();
  if (status === "offer_sent") return !isOfferExpiredByIso(item.offer_expires_at);
  return status === "waiting" || status === "queued" || status === "offer_sent";
}

export function ProfileWaitlist(props: { items: ConsumerWaitlistItem[]; onReload: () => void; loading?: boolean; error?: string | null }) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [savingId, setSavingId] = useState<string | null>(null);

  const items = props.items ?? [];
  const activeItems = items.filter(isActiveItem);
  const expiredItems = items.filter((x) => !isActiveItem(x));

  const handleCancel = (id: string) => {
    if (!id || savingId) return;
    void (async () => {
      setSavingId(id);
      try {
        await cancelMyConsumerWaitlist(id);
      } finally {
        setSavingId(null);
        props.onReload();
      }
    })();
  };

  const handleAccept = (id: string) => {
    if (!id || savingId) return;
    void (async () => {
      setSavingId(id);
      try {
        await acceptMyConsumerWaitlistOffer(id);
      } finally {
        setSavingId(null);
        props.onReload();
      }
    })();
  };

  const handleRefuse = (id: string) => {
    if (!id || savingId) return;
    void (async () => {
      setSavingId(id);
      try {
        await refuseMyConsumerWaitlistOffer(id);
      } finally {
        setSavingId(null);
        props.onReload();
      }
    })();
  };

  const renderCard = (item: ConsumerWaitlistItem) => {
    const est = item.establishment;
    const reservation = item.reservation;

    const status = getLabelAndStyle(item, t);
    const title = (est?.name ?? t("profile.waitlist.establishment_fallback")).trim();
    const city = (est?.city ?? "").trim();

    const dateIso = reservation?.starts_at ?? null;
    const dateLabel = formatIsoDateShort(dateIso);
    const timeLabel = formatIsoTimeShort(dateIso);

    const people = typeof reservation?.party_size === "number" ? Math.max(1, Math.round(reservation!.party_size!)) : null;

    const offerActive = String(item.status ?? "").trim() === "offer_sent" && !isOfferExpiredByIso(item.offer_expires_at);

    const canCancel = isActiveItem(item) && !offerActive;

    return (
      <div key={item.id} className="rounded-lg border-2 border-slate-200 bg-white overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-4 border-b border-slate-200 bg-primary/5">
          <div className="min-w-0">
            <div className="font-bold text-foreground truncate">{title}</div>
            <div className="mt-1 text-xs text-slate-600">
              {city ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {city}
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 font-mono">{item.id}</div>
          </div>

          <div className={cn("shrink-0 px-3 py-1 rounded-full border text-xs font-bold", status.className)}>{status.label}</div>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-primary mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-slate-600">{t("profile.waitlist.field.date")}</div>
              <div className="font-semibold text-foreground">{dateLabel}</div>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Timer className="w-4 h-4 text-primary mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-slate-600">{t("profile.waitlist.field.time")}</div>
              <div className="font-semibold text-foreground">{timeLabel}</div>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Users className="w-4 h-4 text-primary mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-slate-600">{t("profile.waitlist.field.people")}</div>
              <div className="font-semibold text-foreground">{people != null ? people : "—"}</div>
            </div>
          </div>
        </div>

        {offerActive ? (
          <div className="px-4 -mt-1 pb-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="text-xs font-bold text-amber-900">{t("booking_details.waitlist_offer.title")}</div>
              <div className="mt-1 text-xs text-amber-800">{t("profile.waitlist.offer.expires_at", { time: formatIsoTimeShort(item.offer_expires_at) })}</div>
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  className="bg-primary hover:bg-primary/90 text-white"
                  disabled={savingId === item.id}
                  onClick={() => handleAccept(item.id)}
                >
                  {t("booking_details.waitlist_offer.accept")}
                </Button>
                <Button type="button" variant="outline" disabled={savingId === item.id} onClick={() => handleRefuse(item.id)}>
                  {t("booking_details.waitlist_offer.refuse")}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="p-4 pt-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-slate-600">
            {typeof item.position === "number" && Number.isFinite(item.position) && item.position > 0 ? (
              <span>{t("profile.waitlist.position", { position: item.position })}</span>
            ) : null}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {reservation?.id ? (
              <Button type="button" variant="outline" className="gap-2" onClick={() => navigate(`/profile/bookings/${encodeURIComponent(reservation.id)}`)}>
                <ExternalLink className="w-4 h-4" />
                {t("profile.waitlist.view_reservation")}
              </Button>
            ) : null}

            {canCancel ? (
              <Button type="button" variant="outline" className="gap-2" disabled={savingId === item.id} onClick={() => handleCancel(item.id)}>
                <Trash2 className="w-4 h-4" />
                {t("profile.waitlist.cancel")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderSection = (args: { title: string; items: ConsumerWaitlistItem[]; emptyText: string }) => {
    if (!args.items.length) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-700">{args.title}</div>
          <div className="text-xs text-slate-500 tabular-nums">{args.items.length}</div>
        </div>
        <div className="space-y-4">{args.items.map(renderCard)}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-bold text-foreground">{t("profile.waitlist.title")}</div>
          <div className="text-sm text-slate-600">{t("profile.waitlist.subtitle")}</div>
        </div>
        <Button variant="outline" size="sm" onClick={props.onReload} disabled={Boolean(props.loading)}>
          {t("common.refresh")}
        </Button>
      </div>

      {props.error ? <div className="text-sm text-red-600">{props.error}</div> : null}

      {/* Empty state */}
      {!items.length && !props.loading ? (
        <div className="text-center py-8">
          <div className="text-slate-500 text-sm">{t("profile.waitlist.empty.title")}</div>
          <div className="mt-1 text-slate-400 text-xs">{t("profile.waitlist.empty.subtitle")}</div>
          <div className="mt-1 text-slate-400 text-xs">{t("profile.waitlist.empty.hint")}</div>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/profile?tab=bookings")}>
            {t("profile.tabs.bookings")}
          </Button>
        </div>
      ) : null}

      {/* Active items - shown first */}
      {renderSection({ title: t("profile.waitlist.section.active"), items: activeItems, emptyText: "" })}

      {/* Expired items - shown after with visual separation */}
      {expiredItems.length > 0 && activeItems.length > 0 ? <div className="border-t border-slate-200" /> : null}
      {renderSection({ title: t("profile.waitlist.section.expired"), items: expiredItems, emptyText: "" })}
    </div>
  );
}
