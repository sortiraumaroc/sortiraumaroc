import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Key, Mail, Smartphone, Trash2, Loader2, Shield } from "lucide-react";

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
import { deactivateMyConsumerAccount, deleteMyConsumerAccount, requestMyConsumerDataExport, requestPasswordResetLink, changePassword, listMyTrustedDevices, revokeMyTrustedDevice, revokeAllMyTrustedDevices, type TrustedDevice } from "@/lib/consumerAccountApi";

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

  // Password management states
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Trusted devices state
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [trustedDevicesLoading, setTrustedDevicesLoading] = useState(false);
  const [trustedDevicesLoaded, setTrustedDevicesLoaded] = useState(false);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const loadTrustedDevices = useCallback(async () => {
    setTrustedDevicesLoading(true);
    try {
      const result = await listMyTrustedDevices();
      setTrustedDevices(result.devices || []);
      setTrustedDevicesLoaded(true);
    } catch {
      setTrustedDevices([]);
      setTrustedDevicesLoaded(true);
    } finally {
      setTrustedDevicesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrustedDevices();
  }, [loadTrustedDevices]);

  const handleRevokeDevice = async (deviceId: string) => {
    setRevokingDeviceId(deviceId);
    try {
      await revokeMyTrustedDevice(deviceId);
      setTrustedDevices((prev) => prev.filter((d) => d.id !== deviceId));
      toast({
        title: "Appareil supprimé",
        description: "Cet appareil ne sera plus reconnu automatiquement.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de supprimer l'appareil",
      });
    } finally {
      setRevokingDeviceId(null);
    }
  };

  const handleRevokeAllDevices = async () => {
    setRevokingAll(true);
    try {
      await revokeAllMyTrustedDevices();
      setTrustedDevices([]);
      toast({
        title: "Tous les appareils supprimés",
        description: "Vous devrez vous reconnecter avec un code sur chaque appareil.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de supprimer les appareils",
      });
    } finally {
      setRevokingAll(false);
    }
  };

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

  const handlePasswordReset = async () => {
    setPasswordResetLoading(true);
    try {
      await requestPasswordResetLink();
      toast({
        title: t("profile.password.reset.toast.title"),
        description: t("profile.password.reset.toast.description"),
      });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "";
      if (errorMsg === "no_email" || errorMsg.includes("phone_only")) {
        toast({
          variant: "destructive",
          title: t("profile.password.reset.error.phone_only.title"),
          description: t("profile.password.reset.error.phone_only.description"),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("common.error.generic"),
          description: errorMsg || t("common.error.unexpected"),
        });
      }
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const resetChangePasswordDialog = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setChangePasswordError(null);
    setChangePasswordLoading(false);
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleChangePassword = async () => {
    setChangePasswordError(null);

    if (newPassword.length < 8) {
      setChangePasswordError(t("profile.password.change.error.too_short"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setChangePasswordError(t("profile.password.change.error.mismatch"));
      return;
    }

    setChangePasswordLoading(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast({
        title: t("profile.password.change.toast.title"),
        description: t("profile.password.change.toast.description"),
      });
      setChangePasswordOpen(false);
      resetChangePasswordDialog();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "";
      if (errorMsg.includes("invalid_current_password")) {
        setChangePasswordError(t("profile.password.change.error.invalid_current"));
      } else {
        setChangePasswordError(errorMsg || t("common.error.unexpected"));
      }
    } finally {
      setChangePasswordLoading(false);
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

      {/* Password Management Section */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <Key className="w-5 h-5 text-slate-500" />
          <div className="font-bold text-foreground">{t("profile.password.title")}</div>
        </div>
        <div className="text-sm text-slate-600 mb-4">{t("profile.password.description")}</div>

        <div className="space-y-4">
          {/* Reset Password (send by email) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-foreground">{t("profile.password.reset.title")}</div>
                <div className="text-xs text-slate-500">{t("profile.password.reset.description")}</div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handlePasswordReset()}
              disabled={passwordResetLoading}
              className="shrink-0"
            >
              {passwordResetLoading ? t("profile.password.reset.button.loading") : t("profile.password.reset.button")}
            </Button>
          </div>

          {/* Change Password */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
            <div className="flex items-start gap-3">
              <Key className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-foreground">{t("profile.password.change.title")}</div>
                <div className="text-xs text-slate-500">{t("profile.password.change.description")}</div>
              </div>
            </div>
            <AlertDialog
              open={changePasswordOpen}
              onOpenChange={(open) => {
                setChangePasswordOpen(open);
                if (!open) resetChangePasswordDialog();
              }}
            >
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">
                  {t("profile.password.change.button")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("profile.password.change.dialog.title")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("profile.password.change.dialog.description")}</AlertDialogDescription>
                </AlertDialogHeader>

                <div className="mt-4 space-y-4">
                  {/* Current Password */}
                  <div className="space-y-2">
                    <Label>{t("profile.password.change.current")}</Label>
                    <div className="relative">
                      <Input
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pe-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div className="space-y-2">
                    <Label>{t("profile.password.change.new")}</Label>
                    <div className="relative">
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pe-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="text-xs text-slate-500">{t("profile.password.change.hint")}</div>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <Label>{t("profile.password.change.confirm")}</Label>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pe-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {changePasswordError ? <div className="text-sm text-red-600">{changePasswordError}</div> : null}
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel disabled={changePasswordLoading}>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button
                      onClick={() => void handleChangePassword()}
                      disabled={changePasswordLoading || !currentPassword || !newPassword || !confirmPassword}
                      className="bg-primary hover:bg-primary/90 text-white font-bold"
                    >
                      {changePasswordLoading ? t("profile.password.change.button.loading") : t("profile.password.change.button.confirm")}
                    </Button>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Trusted Devices Section */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-slate-500" />
          <div className="font-bold text-foreground">Appareils de confiance</div>
        </div>
        <div className="text-sm text-slate-600 mb-4">
          Les appareils de confiance permettent de se connecter sans code de vérification SMS.
          Après une première connexion réussie, votre appareil est mémorisé pendant 90 jours.
        </div>

        {trustedDevicesLoading && !trustedDevicesLoaded ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            Chargement...
          </div>
        ) : trustedDevices.length === 0 ? (
          <div className="text-sm text-slate-500 py-3">
            Aucun appareil de confiance enregistré.
          </div>
        ) : (
          <div className="space-y-2">
            {trustedDevices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Smartphone className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground flex items-center gap-2">
                      <span className="truncate">{device.device_name}</span>
                      {device.is_current && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 shrink-0">
                          Cet appareil
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      Dernière utilisation : {new Date(device.last_used_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  disabled={revokingDeviceId === device.id || revokingAll}
                  onClick={() => void handleRevokeDevice(device.id)}
                >
                  {revokingDeviceId === device.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
            ))}

            {trustedDevices.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                disabled={revokingAll || !!revokingDeviceId}
                onClick={() => void handleRevokeAllDevices()}
              >
                {revokingAll ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Suppression...
                  </span>
                ) : (
                  "Supprimer tous les appareils de confiance"
                )}
              </Button>
            )}
          </div>
        )}
      </div>

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
