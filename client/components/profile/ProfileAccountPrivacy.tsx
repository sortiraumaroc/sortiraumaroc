import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useI18n } from "@/lib/i18n";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { useToast } from "@/hooks/use-toast";

import { clearAuthed } from "@/lib/auth";
import { clearUserLocalData } from "@/lib/userData";
import { deactivateMyConsumerAccount, deleteMyConsumerAccount, requestMyConsumerDataExport } from "@/lib/consumerAccountApi";

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-bold text-foreground">{title}</div>
          <div className="mt-1 text-sm text-slate-600">{description}</div>
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  );
}

type ReasonOption = {
  code: string;
  labelKey: string;
  messageKey: string;
};

export function ProfileAccountPrivacy() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { toast } = useToast();

  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [exportLoading, setExportLoading] = useState(false);

  const deactivateReasons = useMemo<ReasonOption[]>(
    () => [
      {
        code: "pause",
        labelKey: "profile.privacy.reason.pause",
        messageKey: "profile.privacy.deactivate.message.pause",
      },
      {
        code: "not_using",
        labelKey: "profile.privacy.reason.not_using",
        messageKey: "profile.privacy.deactivate.message.not_using",
      },
      {
        code: "too_many_notifications",
        labelKey: "profile.privacy.reason.too_many_notifications",
        messageKey: "profile.privacy.deactivate.message.too_many_notifications",
      },
      {
        code: "technical_issue",
        labelKey: "profile.privacy.reason.technical_issue",
        messageKey: "profile.privacy.deactivate.message.technical_issue",
      },
      {
        code: "privacy_concerns",
        labelKey: "profile.privacy.reason.privacy_concerns",
        messageKey: "profile.privacy.deactivate.message.privacy_concerns",
      },
      {
        code: "not_found",
        labelKey: "profile.privacy.reason.not_found",
        messageKey: "profile.privacy.deactivate.message.not_found",
      },
      {
        code: "other",
        labelKey: "profile.privacy.reason.other",
        messageKey: "profile.privacy.deactivate.message.other",
      },
    ],
    [],
  );

  const deleteReasons = useMemo<ReasonOption[]>(
    () => [
      {
        code: "not_using_anymore",
        labelKey: "profile.privacy.delete.reason.not_using_anymore",
        messageKey: "profile.privacy.delete.message.not_using_anymore",
      },
      {
        code: "found_alternative",
        labelKey: "profile.privacy.delete.reason.found_alternative",
        messageKey: "profile.privacy.delete.message.found_alternative",
      },
      {
        code: "unsatisfied_experience",
        labelKey: "profile.privacy.delete.reason.unsatisfied_experience",
        messageKey: "profile.privacy.delete.message.unsatisfied_experience",
      },
      {
        code: "too_buggy",
        labelKey: "profile.privacy.delete.reason.too_buggy",
        messageKey: "profile.privacy.delete.message.too_buggy",
      },
      {
        code: "payment_issue",
        labelKey: "profile.privacy.delete.reason.payment_issue",
        messageKey: "profile.privacy.delete.message.payment_issue",
      },
      {
        code: "data_privacy",
        labelKey: "profile.privacy.delete.reason.data_privacy",
        messageKey: "profile.privacy.delete.message.data_privacy",
      },
      {
        code: "not_covered",
        labelKey: "profile.privacy.delete.reason.not_covered",
        messageKey: "profile.privacy.delete.message.not_covered",
      },
      {
        code: "other",
        labelKey: "profile.privacy.reason.other",
        messageKey: "profile.privacy.delete.message.other",
      },
    ],
    [],
  );

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState<string>(deactivateReasons[0]?.code ?? "pause");
  const [deactivateText, setDeactivateText] = useState<string>("");
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteReason, setDeleteReason] = useState<string>(deleteReasons[0]?.code ?? "not_using_anymore");
  const [deleteText, setDeleteText] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<string>("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmWord = t("profile.privacy.delete.confirm_word");

  const selectedDeactivate = deactivateReasons.find((r) => r.code === deactivateReason) ?? deactivateReasons[0];
  const selectedDelete = deleteReasons.find((r) => r.code === deleteReason) ?? deleteReasons[0];

  const resetDeactivateDialog = () => {
    setDeactivateReason(deactivateReasons[0]?.code ?? "pause");
    setDeactivateText("");
    setDeactivateLoading(false);
    setDeactivateError(null);
  };

  const resetDeleteDialog = () => {
    setDeleteStep(1);
    setDeleteReason(deleteReasons[0]?.code ?? "not_using_anymore");
    setDeleteText("");
    setDeleteConfirm("");
    setDeleteLoading(false);
    setDeleteError(null);
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      await requestMyConsumerDataExport({ format: exportFormat });
      toast({
        title: t("profile.privacy.export.toast.title"),
        description: t("profile.privacy.export.toast.description"),
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: t("common.error.generic"),
        description: e instanceof Error ? e.message : t("common.error.unexpected"),
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setDeactivateLoading(true);
    setDeactivateError(null);

    try {
      await deactivateMyConsumerAccount({
        reason_code: deactivateReason,
        reason_text: deactivateReason === "other" ? deactivateText : deactivateText || null,
      });

      clearUserLocalData();
      clearAuthed();

      toast({
        title: t("profile.privacy.deactivate.toast.title"),
        description: t("profile.privacy.deactivate.toast.description"),
      });

      setDeactivateOpen(false);
      resetDeactivateDialog();
      navigate("/");
    } catch (e) {
      setDeactivateError(e instanceof Error ? e.message : t("common.error.unexpected"));
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      await deleteMyConsumerAccount({
        reason_code: deleteReason,
        reason_text: deleteReason === "other" ? deleteText : deleteText || null,
      });

      clearUserLocalData();
      clearAuthed();

      toast({
        title: t("profile.privacy.delete.toast.title"),
        description: t("profile.privacy.delete.toast.description"),
      });

      setDeleteOpen(false);
      resetDeleteDialog();
      navigate("/");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t("common.error.unexpected"));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-primary/5 p-4">
        <div className="font-bold text-foreground">{t("profile.privacy.title")}</div>
        <div className="mt-1 text-sm text-slate-700">{t("profile.privacy.subtitle")}</div>
      </div>

      <SectionCard title={t("profile.privacy.export.title")} description={t("profile.privacy.export.description")}> 
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Select value={exportFormat} onValueChange={(v) => setExportFormat(v === "csv" ? "csv" : "json")}> 
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => void handleExport()} disabled={exportLoading} className="bg-primary hover:bg-primary/90 text-white font-bold">
            {exportLoading ? t("profile.privacy.export.button.loading") : t("profile.privacy.export.button")}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title={t("profile.privacy.deactivate.title")} description={t("profile.privacy.deactivate.description")}> 
        <AlertDialog
          open={deactivateOpen}
          onOpenChange={(open) => {
            setDeactivateOpen(open);
            if (!open) resetDeactivateDialog();
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="font-bold">
              {t("profile.privacy.deactivate.button")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("profile.privacy.deactivate.dialog.title")}</AlertDialogTitle>
              <AlertDialogDescription>{t("profile.privacy.deactivate.dialog.description")}</AlertDialogDescription>
            </AlertDialogHeader>

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>{t("profile.privacy.reason.label")}</Label>
                <Select value={deactivateReason} onValueChange={setDeactivateReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {deactivateReasons.map((r) => (
                      <SelectItem key={r.code} value={r.code}>
                        {t(r.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {t(selectedDeactivate?.messageKey ?? "profile.privacy.deactivate.message.other")}
              </div>

              <div className="space-y-2">
                <Label>{t("profile.privacy.reason.details.label")}</Label>
                <Textarea
                  value={deactivateText}
                  onChange={(e) => setDeactivateText(e.target.value)}
                  placeholder={t("profile.privacy.reason.details.placeholder")}
                />
              </div>

              {deactivateError ? <div className="text-sm text-red-600">{deactivateError}</div> : null}
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={deactivateLoading}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  onClick={() => void handleDeactivate()}
                  disabled={deactivateLoading}
                  className="bg-primary hover:bg-primary/90 text-white font-bold"
                >
                  {deactivateLoading ? t("profile.privacy.deactivate.button.loading") : t("profile.privacy.deactivate.button.confirm")}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SectionCard>

      <SectionCard title={t("profile.privacy.delete.title")} description={t("profile.privacy.delete.description")}> 
        <AlertDialog
          open={deleteOpen}
          onOpenChange={(open) => {
            setDeleteOpen(open);
            if (!open) resetDeleteDialog();
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="font-bold">
              {t("profile.privacy.delete.button")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("profile.privacy.delete.dialog.title")}</AlertDialogTitle>
              <AlertDialogDescription>{t("profile.privacy.delete.dialog.description")}</AlertDialogDescription>
            </AlertDialogHeader>

            <div className="mt-4 space-y-4">
              {deleteStep === 1 ? (
                <>
                  <div className="space-y-2">
                    <Label>{t("profile.privacy.reason.label")}</Label>
                    <Select value={deleteReason} onValueChange={setDeleteReason}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {deleteReasons.map((r) => (
                          <SelectItem key={r.code} value={r.code}>
                            {t(r.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    {t(selectedDelete?.messageKey ?? "profile.privacy.delete.message.other")}
                  </div>

                  <div className="space-y-2">
                    <Label>{t("profile.privacy.reason.details.label")}</Label>
                    <Textarea
                      value={deleteText}
                      onChange={(e) => setDeleteText(e.target.value)}
                      placeholder={t("profile.privacy.reason.details.placeholder")}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {t("profile.privacy.delete.step2.warning")}
                  </div>

                  <div className="space-y-2">
                    <Label>{t("profile.privacy.delete.step2.confirm_label", { word: confirmWord })}</Label>
                    <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
                  </div>
                </>
              )}

              {deleteError ? <div className="text-sm text-red-600">{deleteError}</div> : null}
            </div>

            <AlertDialogFooter>
              {deleteStep === 1 ? (
                <>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <Button onClick={() => setDeleteStep(2)} className="bg-primary hover:bg-primary/90 text-white font-bold">
                    {t("common.continue")}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setDeleteStep(1)}
                    disabled={deleteLoading}
                  >
                    {t("common.back")}
                  </Button>
                  <AlertDialogCancel disabled={deleteLoading}>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button
                      onClick={() => void handleDelete()}
                      disabled={deleteLoading || deleteConfirm.trim().toLowerCase() !== confirmWord.trim().toLowerCase()}
                      variant="destructive"
                      className="font-bold"
                    >
                      {deleteLoading ? t("profile.privacy.delete.button.loading") : t("profile.privacy.delete.button.confirm")}
                    </Button>
                  </AlertDialogAction>
                </>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SectionCard>

      <div className="text-xs text-slate-500">
        {t("profile.privacy.footer_hint")}
      </div>
    </div>
  );
}
