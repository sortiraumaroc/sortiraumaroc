import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminApiError, getAdminEmailBranding, updateAdminEmailBranding, type AdminEmailBranding } from "@/lib/adminApi";

import { useToast } from "@/hooks/use-toast";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminEmailsNav } from "./AdminEmailsNav";

type Draft = {
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  from_name: string;
  contact_email: string;
  signature_fr: string;
  signature_en: string;
  legal_legal: string;
  legal_terms: string;
  legal_privacy: string;
};

function toDraft(item: AdminEmailBranding | null): Draft {
  const links = (item?.legal_links ?? {}) as any;
  return {
    logo_url: item?.logo_url ?? "",
    primary_color: item?.primary_color ?? "#A3001D",
    secondary_color: item?.secondary_color ?? "#000000",
    background_color: item?.background_color ?? "#FFFFFF",
    from_name: item?.from_name ?? "Sortir Au Maroc",
    contact_email: item?.contact_email ?? "hello@sortiraumaroc.ma",
    signature_fr: item?.signature_fr ?? "L'équipe Sortir Au Maroc",
    signature_en: item?.signature_en ?? "The Sortir Au Maroc team",
    legal_legal: String(links.legal ?? "https://sortiraumaroc.ma/mentions-legales"),
    legal_terms: String(links.terms ?? "https://sortiraumaroc.ma/cgu"),
    legal_privacy: String(links.privacy ?? "https://sortiraumaroc.ma/politique-de-confidentialite"),
  };
}

export function AdminEmailsSettingsPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>(() => toDraft(null));

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getAdminEmailBranding(undefined);
      setDraft(toDraft(res.item));
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    setSaving(true);

    try {
      await updateAdminEmailBranding(undefined, {
        logo_url: draft.logo_url.trim() || null,
        primary_color: draft.primary_color.trim(),
        secondary_color: draft.secondary_color.trim(),
        background_color: draft.background_color.trim(),
        from_name: draft.from_name.trim(),
        contact_email: draft.contact_email.trim(),
        signature_fr: draft.signature_fr.trim(),
        signature_en: draft.signature_en.trim(),
        legal_links: {
          legal: draft.legal_legal.trim(),
          terms: draft.legal_terms.trim(),
          privacy: draft.legal_privacy.trim(),
        },
      });
      toast({ title: "✔️ Paramètres enregistrés" });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "❌ Sauvegarde échouée", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const senders = useMemo(
    () => ["hello@sortiraumaroc.ma", "support@sortiraumaroc.ma", "pro@sortiraumaroc.ma", "finance@sortiraumaroc.ma", "no-reply@sortiraumaroc.ma"],
    [],
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Emailing"
        description="Branding du template unique (logo/couleurs/signature) + liens légaux."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? "Chargement…" : "Rafraîchir"}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        }
      />

      <Card className="border-slate-200">
        <CardContent className="p-4 space-y-3">
          <AdminEmailsNav />
          {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Identité visuelle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Logo (URL)</Label>
              <Input value={draft.logo_url} onChange={(e) => setDraft((p) => ({ ...p, logo_url: e.target.value }))} placeholder="https://…" />
              <div className="text-xs text-slate-500">Si vide, un logo par défaut est utilisé.</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Primaire</Label>
                <Input value={draft.primary_color} onChange={(e) => setDraft((p) => ({ ...p, primary_color: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Secondaire</Label>
                <Input value={draft.secondary_color} onChange={(e) => setDraft((p) => ({ ...p, secondary_color: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Fond</Label>
                <Input value={draft.background_color} onChange={(e) => setDraft((p) => ({ ...p, background_color: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Nom expéditeur (From name)</Label>
              <Input value={draft.from_name} onChange={(e) => setDraft((p) => ({ ...p, from_name: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>Email contact (footer)</Label>
              <Input value={draft.contact_email} onChange={(e) => setDraft((p) => ({ ...p, contact_email: e.target.value }))} inputMode="email" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Signature & liens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Signature FR</Label>
                <Input value={draft.signature_fr} onChange={(e) => setDraft((p) => ({ ...p, signature_fr: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Signature EN</Label>
                <Input value={draft.signature_en} onChange={(e) => setDraft((p) => ({ ...p, signature_en: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Mentions légales (URL)</Label>
              <Input value={draft.legal_legal} onChange={(e) => setDraft((p) => ({ ...p, legal_legal: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>CGU (URL)</Label>
              <Input value={draft.legal_terms} onChange={(e) => setDraft((p) => ({ ...p, legal_terms: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Politique de confidentialité (URL)</Label>
              <Input value={draft.legal_privacy} onChange={(e) => setDraft((p) => ({ ...p, legal_privacy: e.target.value }))} />
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-semibold">Expéditeurs disponibles</div>
              <div className="mt-2 space-y-1 text-sm">
                {senders.map((s) => (
                  <div key={s} className="font-mono">
                    {s}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Le SMTP doit être valide pour que ces adresses envoient sans spam (SPF/DKIM/DMARC côté DNS).
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-semibold">Unsubscribe</div>
              <div className="text-xs text-slate-500 mt-1">
                Les campagnes marketing incluent automatiquement un lien de désinscription et le tracking (open/click).
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Note SMTP</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            readOnly
            value={
              "Le SMTP est configuré côté serveur via variables d’environnement (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS).\n\nPour tester: Paramètres → Emails (carte Test d’envoi) ou Templates → Test d’envoi."
            }
            rows={4}
            className="text-xs font-mono"
          />
        </CardContent>
      </Card>
    </div>
  );
}
