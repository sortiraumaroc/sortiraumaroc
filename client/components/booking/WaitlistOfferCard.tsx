import { Clock, Hourglass, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type { BookingRecord } from "@/lib/userData";

export type WaitlistOffer = {
  id: string;
  status: string;
  position: number;
  offer_expires_at: string | null;
};

function isOfferExpired(offer: WaitlistOffer): boolean {
  if (!offer.offer_expires_at) return true;
  const ts = Date.parse(offer.offer_expires_at);
  if (!Number.isFinite(ts)) return true;
  return ts < Date.now();
}

export function WaitlistOfferCard(props: {
  booking: BookingRecord;
  offer: WaitlistOffer;
  saving: boolean;
  onAccept: () => void;
  onRefuse: () => void;
  formatTime: (iso: string) => string;
}) {
  const { t } = useI18n();

  if (props.offer.status === "waiting") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Hourglass className="w-4 h-4 text-primary" />
          {t("booking_details.waitlist_offer.waiting_title")}
        </div>
        <div className="mt-2 text-sm text-slate-700">
          {t("booking_details.waitlist_offer.waiting_body", { position: props.offer.position })}
        </div>
      </div>
    );
  }

  if (props.offer.status !== "offer_sent") return null;

  const expired = isOfferExpired(props.offer);
  const expiresLabel = props.offer.offer_expires_at ? props.formatTime(props.offer.offer_expires_at) : "—";

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="inline-flex items-center rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-extrabold text-amber-700">
            {t("booking_details.waitlist_offer.badge")}
          </span>
          <span>{t("booking_details.waitlist_offer.title")}</span>
        </div>
        <div className="flex items-center gap-1 text-xs font-semibold text-amber-700">
          <Clock className="w-4 h-4" />
          {t("booking_details.waitlist_offer.expires_at", { time: expiresLabel })}
        </div>
      </div>

      {expired ? (
        <div className="mt-2 flex items-start gap-2 text-sm text-slate-700">
          <XCircle className="w-4 h-4 text-amber-700 mt-0.5" />
          <div>
            <div className="font-semibold">{t("booking_details.waitlist_offer.expired_title")}</div>
            <div className="text-xs text-slate-600">{t("booking_details.waitlist_offer.expired_body")}</div>
          </div>
        </div>
      ) : (
        <div className="mt-2 text-sm text-slate-700">{t("booking_details.waitlist_offer.body")}</div>
      )}

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <Button type="button" className="sm:flex-1" disabled={props.saving || expired} onClick={props.onAccept}>
          {t("booking_details.waitlist_offer.accept")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="sm:flex-1"
          disabled={props.saving}
          onClick={props.onRefuse}
        >
          {t("booking_details.waitlist_offer.refuse")}
        </Button>
      </div>
    </div>
  );
}
