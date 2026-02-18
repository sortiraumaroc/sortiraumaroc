/**
 * ReportEstablishmentDialog
 *
 * Modal dialog for reporting an establishment
 */

import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { isAuthed } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportReasonCode =
  | "closed_permanently"
  | "incorrect_info"
  | "fraudulent"
  | "inappropriate_content"
  | "safety_concern"
  | "other";

interface ReportEstablishmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishmentId: string;
  establishmentName: string;
}

// ---------------------------------------------------------------------------
// Reason options
// ---------------------------------------------------------------------------

const REPORT_REASONS: { code: ReportReasonCode; labelKey: string }[] = [
  { code: "closed_permanently", labelKey: "report.reason.closed_permanently" },
  { code: "incorrect_info", labelKey: "report.reason.incorrect_info" },
  { code: "fraudulent", labelKey: "report.reason.fraudulent" },
  { code: "inappropriate_content", labelKey: "report.reason.inappropriate_content" },
  { code: "safety_concern", labelKey: "report.reason.safety_concern" },
  { code: "other", labelKey: "report.reason.other" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportEstablishmentDialog({
  open,
  onOpenChange,
  establishmentId,
  establishmentName,
}: ReportEstablishmentDialogProps) {
  const { t } = useI18n();
  const { toast } = useToast();

  const [reasonCode, setReasonCode] = useState<ReportReasonCode | "">("");
  const [reasonText, setReasonText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reasonCode) {
      toast({
        title: t("report.error.select_reason"),
        variant: "destructive",
      });
      return;
    }

    if (!isAuthed()) {
      toast({
        title: t("report.error.login_required"),
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/consumer/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishment_id: establishmentId,
          reason_code: reasonCode,
          reason_text: reasonText.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        toast({
          title: data.error || t("report.error.generic"),
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      toast({
        title: t("report.success.title"),
        description: t("report.success.description"),
      });

      // Reset form and close
      setReasonCode("");
      setReasonText("");
      onOpenChange(false);
    } catch (e) {
      toast({
        title: t("report.error.generic"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setReasonCode("");
      setReasonText("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {t("report.title")}
          </DialogTitle>
          <DialogDescription>
            {t("report.description", { name: establishmentName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reason dropdown */}
          <div className="space-y-2">
            <Label htmlFor="reason">{t("report.reason_label")}</Label>
            <Select
              value={reasonCode}
              onValueChange={(val) => setReasonCode(val as ReportReasonCode)}
            >
              <SelectTrigger id="reason">
                <SelectValue placeholder={t("report.reason_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {REPORT_REASONS.map((reason) => (
                  <SelectItem key={reason.code} value={reason.code}>
                    {t(reason.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Additional details */}
          <div className="space-y-2">
            <Label htmlFor="details">{t("report.details_label")}</Label>
            <Textarea
              id="details"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={t("report.details_placeholder")}
              rows={4}
              maxLength={1000}
            />
            <div className="text-xs text-slate-400 text-end">
              {reasonText.length}/1000
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={submitting}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !reasonCode}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
                {t("report.submitting")}
              </>
            ) : (
              t("report.submit")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReportEstablishmentDialog;
