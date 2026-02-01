import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast, toast as toastFn } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import {
  AdminApiError,
  getAdminSettingsSnapshot,
  type BillingCompanyProfile,
} from "@/lib/adminApi";

import {
  SettingsSyncReport,
  type SettingsSyncReportValue,
} from "./settings/SettingsSyncReport";
import { FilterTaxonomySettingsCard } from "./settings/sections/FilterTaxonomySettingsCard";
import { ConsumerPromoSettingsCard } from "./settings/sections/ConsumerPromoSettingsCard";
import { VisibilityPromoSettingsCard } from "./settings/sections/VisibilityPromoSettingsCard";
import { BillingCompanyProfileSettingsCard } from "./settings/sections/BillingCompanyProfileSettingsCard";
import { PlatformSettingsCard } from "./settings/sections/PlatformSettingsCard";
import { isAdminSuperadmin } from "@/lib/adminApi";

function nowIso(): string {
  return new Date().toISOString();
}

export type ToastInput = Parameters<typeof toastFn>[0];

export type SettingsReportPatch = {
  created?: number;
  modified?: number;
  noop?: number;
};

function mergeReport(
  prev: SettingsSyncReportValue | null,
  patch: SettingsReportPatch,
  t: (
    key: string,
    params?: Record<string, string | number | null | undefined>,
  ) => string,
): SettingsSyncReportValue {
  const next = {
    created: (prev?.created ?? 0) + (patch.created ?? 0),
    modified: (prev?.modified ?? 0) + (patch.modified ?? 0),
    noop: (prev?.noop ?? 0) + (patch.noop ?? 0),
    updatedAt: nowIso(),
  };

  return {
    ...next,
    message: t("admin.settings.sync_report.message", {
      created: next.created,
      modified: next.modified,
      noop: next.noop,
    }),
  };
}

export function AdminSettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [billingCompanyProfile, setBillingCompanyProfile] =
    useState<BillingCompanyProfile | null>(null);

  const [report, setReport] = useState<SettingsSyncReportValue | null>(null);

  const updateReport = useCallback(
    (patch: SettingsReportPatch) => {
      setReport((prev) => mergeReport(prev, patch, t));
    },
    [t],
  );

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getAdminSettingsSnapshot();
      setBillingCompanyProfile(res.billing_company_profile ?? null);
    } catch (e) {
      if (e instanceof AdminApiError) {
        if (e.status === 403) {
          navigate("/admin");
          return;
        }
        setError(e.message);
      } else {
        setError(t("common.error.unexpected"));
      }
    } finally {
      setLoading(false);
    }
  }, [navigate, t]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const headerActions = useMemo(() => {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => void refreshAll()}
          disabled={loading}
        >
          {loading ? t("common.loading") : t("common.refresh")}
        </Button>
        <Button asChild variant="outline">
          <Link to="/admin/logs">{t("admin.settings.logs")}</Link>
        </Button>
      </div>
    );
  }, [loading, refreshAll, t]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("admin.settings.title")}
        description={t("admin.settings.description")}
        actions={headerActions}
      />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">
              {t("admin.settings.loading.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            {t("admin.settings.loading.body")}
          </CardContent>
        </Card>
      ) : null}

      {!loading ? (
        <Tabs defaultValue={isAdminSuperadmin() ? "platform" : "general"} className="w-full">
          <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
            {isAdminSuperadmin() && (
              <TabsTrigger value="platform" className="bg-amber-50 data-[state=active]:bg-amber-100">
                Mode Plateforme
              </TabsTrigger>
            )}
            <TabsTrigger value="general">Général</TabsTrigger>
            <TabsTrigger value="promos">Codes Promo</TabsTrigger>
            <TabsTrigger value="billing">Facturation</TabsTrigger>
          </TabsList>

          {isAdminSuperadmin() && (
            <TabsContent value="platform" className="space-y-4">
              <PlatformSettingsCard />
            </TabsContent>
          )}

          <TabsContent value="general" className="space-y-4">
            <FilterTaxonomySettingsCard
              onReport={updateReport}
              onToast={(t) => toast(t)}
            />
          </TabsContent>

          <TabsContent value="promos" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ConsumerPromoSettingsCard onToast={(t) => toast(t)} />
              <VisibilityPromoSettingsCard onToast={(t) => toast(t)} />
            </div>
          </TabsContent>

          <TabsContent value="billing" className="space-y-4">
            <BillingCompanyProfileSettingsCard
              profile={billingCompanyProfile}
              onProfileChange={setBillingCompanyProfile}
              onReport={updateReport}
              onToast={(t) => toast(t)}
            />
          </TabsContent>
        </Tabs>
      ) : null}

      {report ? <SettingsSyncReport value={report} /> : null}

      {!loading ? (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">
              {t("admin.settings.permissions.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            {t("admin.settings.permissions.body")}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
