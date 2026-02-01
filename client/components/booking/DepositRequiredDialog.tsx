import { Link } from "react-router-dom";
import { Loader2, Wallet } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { addLocalePrefix } from "@/lib/i18n/types";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  depositAmount: number;
  currencyLabel: string;
  unitAmount?: number | null;
  partySize?: number | null;
  onCancel: () => void;
  onPayAndConfirm: () => void;
  paying: boolean;
};

export function DepositRequiredDialog({ open, depositAmount, currencyLabel, unitAmount, partySize, onCancel, onPayAndConfirm, paying }: Props) {
  const { t, locale } = useI18n();

  const policySlug = locale === "en" ? "anti-no-show-policy" : "politique-anti-no-show";
  const policyHref = addLocalePrefix(`/content/${policySlug}`, locale);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            {t("booking.deposit.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-slate-700">
            {t("booking.deposit.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold text-slate-700">{t("booking.deposit.amount_label")}</div>
            <div className="text-sm font-extrabold text-foreground">{Math.round(depositAmount)} {currencyLabel}</div>
          </div>
          {typeof unitAmount === "number" && Number.isFinite(unitAmount) && unitAmount > 0 && typeof partySize === "number" && Number.isFinite(partySize) && partySize > 0 ? (
            <div className="mt-2 text-xs text-slate-600">
              {t("booking.deposit.pre_auth", {
                unit: Math.round(unitAmount),
                currency: currencyLabel,
                partySize: Math.round(partySize),
              })}
            </div>
          ) : null}
          <div className="mt-2 text-xs text-slate-600">
            {t("booking.deposit.note")}
          </div>
          <div className="mt-2 text-xs text-slate-600">
            {t("booking.deposit.payma_hint")}
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="space-y-3 text-xs text-slate-700">
            <div>
              <div className="font-semibold text-slate-900">{t("booking.deposit.pedagogy.context_label")}</div>
              <div className="mt-1">{t("booking.deposit.pedagogy.context_value")}</div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">{t("booking.deposit.pedagogy.impact_label")}</div>
              <div className="mt-1">{t("booking.deposit.pedagogy.impact_value")}</div>
            </div>

            <div className="text-slate-600">{t("booking.deposit.pedagogy.reassurance")}</div>

            <Link to={policyHref} className="inline-flex font-semibold text-primary underline underline-offset-2">
              {t("booking.deposit.pedagogy.learn_more")}
            </Link>
          </div>
        </div>

        <AlertDialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={paying}>
            {t("common.cancel")}
          </Button>
          <Button type="button" className="gap-2" onClick={onPayAndConfirm} disabled={paying}>
            {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {t("booking.deposit.pay_and_confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
