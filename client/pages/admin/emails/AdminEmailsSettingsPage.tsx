import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminApiError, deleteEmailBrandingLogo, getAdminEmailBranding, updateAdminEmailBranding, uploadEmailBrandingLogo, type AdminEmailBranding } from "@/lib/adminApi";

import { useToast } from "@/hooks/use-toast";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// Target logo dimensions for emails (width x height)
const LOGO_MAX_WIDTH = 200;
const LOGO_MAX_HEIGHT = 80;

async function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let width = img.width;
      let height = img.height;

      // Calculate scaling to fit within max dimensions while maintaining aspect ratio
      const widthRatio = LOGO_MAX_WIDTH / width;
      const heightRatio = LOGO_MAX_HEIGHT / height;
      const ratio = Math.min(widthRatio, heightRatio, 1); // Don't upscale

      width = Math.round(width * ratio);
      height = Math.round(height * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context not available"));
        return;
      }

      // Use better quality interpolation
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to PNG for transparency support (logos often need it)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create blob"));
          }
        },
        "image/png",
        0.95,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

export function AdminEmailsSettingsPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      toast({ title: "Parametres enregistres" });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Sauvegarde echouee", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Validate file type
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast({ title: "Type de fichier non supporte", description: "Utilisez PNG, JPEG ou WebP", variant: "destructive" });
      return;
    }

    // Validate file size (max 5MB before resize)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Fichier trop volumineux", description: "Maximum 5 Mo", variant: "destructive" });
      return;
    }

    setUploading(true);

    try {
      // Resize image
      const resizedBlob = await resizeImage(file);

      // Upload
      const result = await uploadEmailBrandingLogo(undefined, resizedBlob);

      setDraft((p) => ({ ...p, logo_url: result.url }));
      toast({ title: "Logo televerse", description: `Redimensionne a ${LOGO_MAX_WIDTH}x${LOGO_MAX_HEIGHT}px max` });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur lors du telechargement";
      toast({ title: "Echec du telechargement", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleLogoDelete = async () => {
    if (!draft.logo_url) return;

    setDeleting(true);

    try {
      await deleteEmailBrandingLogo(undefined);
      setDraft((p) => ({ ...p, logo_url: "" }));
      toast({ title: "Logo supprime" });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur lors de la suppression";
      toast({ title: "Echec de la suppression", description: msg, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const senders = useMemo(
    () => ["hello@sortiraumaroc.ma", "support@sortiraumaroc.ma", "pro@sortiraumaroc.ma", "finance@sortiraumaroc.ma", "noreply@sortiraumaroc.ma"],
    [],
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Emailing"
        description="Branding du template unique (logo/couleurs/signature) + liens legaux."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? "Chargement..." : "Rafraichir"}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
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
            <CardTitle className="text-base">Identite visuelle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Logo Upload Section */}
            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-start gap-4">
                {/* Preview */}
                <div className="w-[200px] h-[80px] border border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden">
                  {draft.logo_url ? (
                    <img src={draft.logo_url} alt="Logo email" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <div className="text-slate-400 flex flex-col items-center gap-1">
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-xs">Aucun logo</span>
                    </div>
                  )}
                </div>

                {/* Upload/Delete Buttons */}
                <div className="flex flex-col gap-2">
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="hidden" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Telechargement...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Telecharger
                      </>
                    )}
                  </Button>
                  {draft.logo_url && (
                    <Button type="button" variant="outline" size="sm" onClick={handleLogoDelete} disabled={deleting} className="w-full text-red-600 hover:text-red-700 hover:bg-red-50">
                      {deleting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Suppression...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Supprimer
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-500">
                PNG, JPEG ou WebP. Redimensionne automatiquement a {LOGO_MAX_WIDTH}x{LOGO_MAX_HEIGHT}px max.
              </div>
            </div>

            {/* URL Input (hidden but still functional for manual entry) */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">URL du logo (optionnel - modifiable manuellement)</Label>
              <Input value={draft.logo_url} onChange={(e) => setDraft((p) => ({ ...p, logo_url: e.target.value }))} placeholder="https://..." className="text-xs" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Primaire</Label>
                <div className="flex gap-2">
                  <Input value={draft.primary_color} onChange={(e) => setDraft((p) => ({ ...p, primary_color: e.target.value }))} className="flex-1" />
                  <input
                    type="color"
                    value={draft.primary_color}
                    onChange={(e) => setDraft((p) => ({ ...p, primary_color: e.target.value }))}
                    className="w-10 h-10 rounded border border-slate-200 cursor-pointer"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Secondaire</Label>
                <div className="flex gap-2">
                  <Input value={draft.secondary_color} onChange={(e) => setDraft((p) => ({ ...p, secondary_color: e.target.value }))} className="flex-1" />
                  <input
                    type="color"
                    value={draft.secondary_color}
                    onChange={(e) => setDraft((p) => ({ ...p, secondary_color: e.target.value }))}
                    className="w-10 h-10 rounded border border-slate-200 cursor-pointer"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Fond</Label>
                <div className="flex gap-2">
                  <Input value={draft.background_color} onChange={(e) => setDraft((p) => ({ ...p, background_color: e.target.value }))} className="flex-1" />
                  <input
                    type="color"
                    value={draft.background_color}
                    onChange={(e) => setDraft((p) => ({ ...p, background_color: e.target.value }))}
                    className="w-10 h-10 rounded border border-slate-200 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Nom expediteur (From name)</Label>
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
              <Label>Mentions legales (URL)</Label>
              <Input value={draft.legal_legal} onChange={(e) => setDraft((p) => ({ ...p, legal_legal: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>CGU (URL)</Label>
              <Input value={draft.legal_terms} onChange={(e) => setDraft((p) => ({ ...p, legal_terms: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Politique de confidentialite (URL)</Label>
              <Input value={draft.legal_privacy} onChange={(e) => setDraft((p) => ({ ...p, legal_privacy: e.target.value }))} />
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-semibold">Expediteurs disponibles</div>
              <div className="mt-2 space-y-1 text-sm">
                {senders.map((s) => (
                  <div key={s} className="font-mono">
                    {s}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Le SMTP doit etre valide pour que ces adresses envoient sans spam (SPF/DKIM/DMARC cote DNS).
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-semibold">Unsubscribe</div>
              <div className="text-xs text-slate-500 mt-1">
                Les campagnes marketing incluent automatiquement un lien de desinscription et le tracking (open/click).
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
              "Le SMTP est configure cote serveur via variables d'environnement (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS).\n\nPour tester: Parametres -> Emails (carte Test d'envoi) ou Templates -> Test d'envoi."
            }
            rows={4}
            className="text-xs font-mono"
          />
        </CardContent>
      </Card>
    </div>
  );
}
