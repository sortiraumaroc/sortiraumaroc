import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { validatePasswordResetToken, completePasswordReset, ConsumerAccountApiError } from "@/lib/consumerAccountApi";

type PageState = "loading" | "form" | "success" | "error";

export default function ResetPassword() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [pageState, setPageState] = useState<PageState>("loading");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [errorType, setErrorType] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setErrorType("missing_token");
      setPageState("error");
      return;
    }

    validatePasswordResetToken(token)
      .then((result) => {
        setMaskedEmail(result.email);
        setPageState("form");
      })
      .catch((err: unknown) => {
        if (err instanceof ConsumerAccountApiError) {
          setErrorType(err.message);
        } else {
          setErrorType("unknown_error");
        }
        setPageState("error");
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (newPassword.length < 8) {
      setFormError(t("reset_password.error.too_short"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError(t("reset_password.error.mismatch"));
      return;
    }

    setSubmitting(true);

    try {
      await completePasswordReset({ token, new_password: newPassword });
      setPageState("success");
    } catch (err: unknown) {
      if (err instanceof ConsumerAccountApiError) {
        if (err.message === "token_expired") {
          setFormError(t("reset_password.error.token_expired"));
        } else if (err.message === "token_already_used") {
          setFormError(t("reset_password.error.token_used"));
        } else {
          setFormError(t("reset_password.error.generic"));
        }
      } else {
        setFormError(t("reset_password.error.generic"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getErrorMessage = () => {
    switch (errorType) {
      case "missing_token":
        return t("reset_password.error.missing_token");
      case "invalid_token":
        return t("reset_password.error.invalid_token");
      case "token_expired":
        return t("reset_password.error.token_expired");
      case "token_already_used":
        return t("reset_password.error.token_used");
      default:
        return t("reset_password.error.generic");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="container mx-auto px-4 py-8 md:py-16">
        <div className="max-w-md mx-auto">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Header */}
            <div className="p-6 bg-primary/5 border-b border-slate-200 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white border-2 border-primary/20 mb-4">
                <KeyRound className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-xl md:text-2xl font-extrabold text-foreground">
                {t("reset_password.title")}
              </h1>
              {maskedEmail && pageState === "form" && (
                <p className="mt-2 text-sm text-slate-600">
                  {t("reset_password.for_account", { email: maskedEmail })}
                </p>
              )}
            </div>

            {/* Content */}
            <div className="p-6">
              {pageState === "loading" && (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                  <p className="text-slate-600">{t("reset_password.validating")}</p>
                </div>
              )}

              {pageState === "error" && (
                <div className="text-center py-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                    <AlertCircle className="w-8 h-8 text-red-600" />
                  </div>
                  <h2 className="text-lg font-bold text-foreground mb-2">
                    {t("reset_password.error.title")}
                  </h2>
                  <p className="text-slate-600 mb-6">{getErrorMessage()}</p>
                  <Button onClick={() => navigate("/")} variant="outline">
                    {t("reset_password.back_home")}
                  </Button>
                </div>
              )}

              {pageState === "form" && (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">{t("reset_password.new_password")}</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="********"
                        className="pe-10"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">{t("reset_password.password_hint")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">{t("reset_password.confirm_password")}</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="********"
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

                  {formError && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                      {formError}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/90 text-white font-bold"
                    disabled={submitting || !newPassword || !confirmPassword}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 me-2 animate-spin" />
                        {t("reset_password.submitting")}
                      </>
                    ) : (
                      t("reset_password.submit")
                    )}
                  </Button>
                </form>
              )}

              {pageState === "success" && (
                <div className="text-center py-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h2 className="text-lg font-bold text-foreground mb-2">
                    {t("reset_password.success.title")}
                  </h2>
                  <p className="text-slate-600 mb-6">
                    {t("reset_password.success.description")}
                  </p>
                  <Button
                    onClick={() => navigate("/")}
                    className="bg-primary hover:bg-primary/90 text-white font-bold"
                  >
                    {t("reset_password.success.login")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
