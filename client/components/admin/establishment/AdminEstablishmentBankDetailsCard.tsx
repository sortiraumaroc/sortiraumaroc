import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, ShieldCheck, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AdminApiError,
  getAdminEstablishmentBankDetails,
  listAdminEstablishmentBankDetailsHistory,
  listAdminEstablishmentBankDocuments,
  upsertAdminEstablishmentBankDetails,
  uploadAdminEstablishmentBankDocument,
  validateAdminEstablishmentBankDetails,
  type AdminProBankDetails,
  type AdminProBankDetailsHistoryItem,
  type AdminProBankDocument,
} from "@/lib/adminApi";

import { buildRib24FromParts, detectMoroccanBankName, digitsOnly } from "@shared/rib";

type Draft = {
  bank_code: string;
  locality_code: string;
  branch_code: string;
  account_number: string;
  rib_key: string;
  bank_address: string;
  holder_name: string;
  holder_address: string;
};

function toDraft(item: AdminProBankDetails | null): Draft {
  return {
    bank_code: item?.bank_code ?? "",
    locality_code: item?.locality_code ?? "",
    branch_code: item?.branch_code ?? "",
    account_number: item?.account_number ?? "",
    rib_key: item?.rib_key ?? "",
    bank_address: item?.bank_address ?? "",
    holder_name: item?.holder_name ?? "",
    holder_address: item?.holder_address ?? "",
  };
}

function normalizeDigitsFixed(input: string, maxLen: number): string {
  return digitsOnly(input).slice(0, maxLen);
}

function statusBadge(isValidated: boolean): { label: string; cls: string } {
  if (isValidated) return { label: "Validé", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  return { label: "En attente", cls: "bg-amber-100 text-amber-700 border-amber-200" };
}

function safeIsoToLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("fr-FR");
}

function pickRibFromHistoryData(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const v = data as Record<string, unknown>;
  return typeof v.rib_24 === "string" ? v.rib_24 : "";
}

function pickHolderFromHistoryData(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const v = data as Record<string, unknown>;
  return typeof v.holder_name === "string" ? v.holder_name : "";
}

type EditableField = "bank_code" | "locality_code" | "branch_code" | "account_number" | "rib_key" | "holder_name" | "holder_address" | "bank_address";

function ReadOnlyField(props: { label: string; value: string; onEdit: () => void; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-slate-50 border border-slate-200">
      <div className="min-w-0">
        <div className="text-[10px] text-slate-500 uppercase tracking-wide">{props.label}</div>
        <div className={`text-sm truncate ${props.mono ? "font-mono" : ""}`}>{props.value || "—"}</div>
      </div>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={props.onEdit}>
        <Pencil className="h-3.5 w-3.5 text-slate-500" />
      </Button>
    </div>
  );
}

export function AdminEstablishmentBankDetailsCard(props: { establishmentId: string }) {
  const { establishmentId } = props;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [item, setItem] = useState<AdminProBankDetails | null>(null);
  const [history, setHistory] = useState<AdminProBankDetailsHistoryItem[]>([]);
  const [documents, setDocuments] = useState<AdminProBankDocument[]>([]);

  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const [editingFields, setEditingFields] = useState<Set<EditableField>>(new Set());

  const bankName = useMemo(() => detectMoroccanBankName(draft.bank_code) ?? "Banque inconnue", [draft.bank_code]);

  const rib24 = useMemo(
    () =>
      buildRib24FromParts({
        bank_code: draft.bank_code,
        locality_code: draft.locality_code,
        branch_code: draft.branch_code,
        account_number: draft.account_number,
        rib_key: draft.rib_key,
      }),
    [draft.account_number, draft.bank_code, draft.branch_code, draft.locality_code, draft.rib_key],
  );

  const isDraftValid = !!rib24;
  const hasChanges = useMemo(() => {
    const before = toDraft(item);
    return JSON.stringify(before) !== JSON.stringify(draft);
  }, [draft, item]);

  // Un RIB est considéré "rempli" si tous les composants numériques sont présents
  const isRibFilled = Boolean(
    draft.bank_code && draft.locality_code && draft.branch_code && draft.account_number && draft.rib_key,
  );

  const startEditing = (field: EditableField) => {
    setEditingFields((prev) => new Set(prev).add(field));
  };

  const stopEditing = (field: EditableField) => {
    setEditingFields((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  const isEditing = (field: EditableField) => editingFields.has(field) || !isRibFilled;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [bankRes, histRes, docsRes] = await Promise.all([
        getAdminEstablishmentBankDetails(undefined, establishmentId),
        listAdminEstablishmentBankDetailsHistory(undefined, establishmentId),
        listAdminEstablishmentBankDocuments(undefined, establishmentId),
      ]);

      setItem(bankRes.item);
      setDraft(toDraft(bankRes.item));
      setHistory(histRes.items ?? []);
      setDocuments(docsRes.items ?? []);
      setEditingFields(new Set());
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Erreur inattendue";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = async () => {
    setSaving(true);
    setError(null);

    try {
      await upsertAdminEstablishmentBankDetails(undefined, establishmentId, {
        bank_code: draft.bank_code,
        locality_code: draft.locality_code,
        branch_code: draft.branch_code,
        account_number: draft.account_number,
        rib_key: draft.rib_key,
        bank_address: draft.bank_address || null,
        holder_name: draft.holder_name,
        holder_address: draft.holder_address || null,
      });
      toast({ title: "Sauvé", description: "RIB enregistré (validation compta requise)." });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const onValidate = async () => {
    setValidating(true);
    setError(null);

    try {
      await validateAdminEstablishmentBankDetails(undefined, establishmentId);
      toast({ title: "Validé", description: "RIB validé par la compta." });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setValidating(false);
    }
  };

  const onUploadPdf = async (file: File | null) => {
    if (!file) return;
    setUploading(true);

    try {
      await uploadAdminEstablishmentBankDocument(undefined, establishmentId, file);
      toast({ title: "Document ajouté", description: file.name });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Erreur upload";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const st = statusBadge(Boolean(item?.is_validated));

  return (
    <Card className="border-slate-200">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-bold flex items-center justify-between gap-3">
          <div className="min-w-0 truncate">RIB établissement (Superadmin)</div>
          <Badge className={st.cls}>{st.label}</Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 pt-0 space-y-3">
        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</div> : null}

        {loading ? (
          <div className="text-sm text-slate-600 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : (
          <>
            {/* Nom de la banque (auto) */}
            <div className="flex items-center gap-2 py-1.5 px-2 rounded bg-slate-50 border border-slate-200">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Banque</div>
                <div className="text-sm font-medium truncate">{bankName}</div>
              </div>
              {!isDraftValid && (
                <div className="text-[10px] text-red-600 shrink-0">RIB incomplet</div>
              )}
            </div>

            {/* Composants du RIB */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">Composants du RIB</div>

              <div className="grid grid-cols-5 gap-2">
                {isEditing("bank_code") ? (
                  <div>
                    <Label className="text-[10px]">Code banque</Label>
                    <Input
                      value={draft.bank_code}
                      onChange={(e) => setDraft((p) => ({ ...p, bank_code: normalizeDigitsFixed(e.target.value, 3) }))}
                      onBlur={() => stopEditing("bank_code")}
                      inputMode="numeric"
                      placeholder="3 ch."
                      className="font-mono text-center h-8 text-sm"
                    />
                  </div>
                ) : (
                  <ReadOnlyField label="Code banque" value={draft.bank_code} onEdit={() => startEditing("bank_code")} mono />
                )}

                {isEditing("locality_code") ? (
                  <div>
                    <Label className="text-[10px]">Code localité</Label>
                    <Input
                      value={draft.locality_code}
                      onChange={(e) => setDraft((p) => ({ ...p, locality_code: normalizeDigitsFixed(e.target.value, 3) }))}
                      onBlur={() => stopEditing("locality_code")}
                      inputMode="numeric"
                      placeholder="3 ch."
                      className="font-mono text-center h-8 text-sm"
                    />
                  </div>
                ) : (
                  <ReadOnlyField label="Code localité" value={draft.locality_code} onEdit={() => startEditing("locality_code")} mono />
                )}

                {isEditing("branch_code") ? (
                  <div>
                    <Label className="text-[10px]">Code agence</Label>
                    <Input
                      value={draft.branch_code}
                      onChange={(e) => setDraft((p) => ({ ...p, branch_code: normalizeDigitsFixed(e.target.value, 3) }))}
                      onBlur={() => stopEditing("branch_code")}
                      inputMode="numeric"
                      placeholder="3 ch."
                      className="font-mono text-center h-8 text-sm"
                    />
                  </div>
                ) : (
                  <ReadOnlyField label="Code agence" value={draft.branch_code} onEdit={() => startEditing("branch_code")} mono />
                )}

                {isEditing("account_number") ? (
                  <div>
                    <Label className="text-[10px]">N° compte</Label>
                    <Input
                      value={draft.account_number}
                      onChange={(e) => setDraft((p) => ({ ...p, account_number: normalizeDigitsFixed(e.target.value, 12) }))}
                      onBlur={() => stopEditing("account_number")}
                      inputMode="numeric"
                      placeholder="12 ch."
                      className="font-mono h-8 text-sm"
                    />
                  </div>
                ) : (
                  <ReadOnlyField label="N° compte" value={draft.account_number} onEdit={() => startEditing("account_number")} mono />
                )}

                {isEditing("rib_key") ? (
                  <div>
                    <Label className="text-[10px]">Clé RIB</Label>
                    <Input
                      value={draft.rib_key}
                      onChange={(e) => setDraft((p) => ({ ...p, rib_key: normalizeDigitsFixed(e.target.value, 3) }))}
                      onBlur={() => stopEditing("rib_key")}
                      inputMode="numeric"
                      placeholder="3 ch."
                      className="font-mono text-center h-8 text-sm"
                    />
                  </div>
                ) : (
                  <ReadOnlyField label="Clé RIB" value={draft.rib_key} onEdit={() => startEditing("rib_key")} mono />
                )}
              </div>
            </div>

            {/* Titulaire */}
            <div className="grid grid-cols-2 gap-2">
              {isEditing("holder_name") ? (
                <div>
                  <Label className="text-[10px]">Nom du titulaire</Label>
                  <Input
                    value={draft.holder_name}
                    onChange={(e) => setDraft((p) => ({ ...p, holder_name: e.target.value }))}
                    onBlur={() => stopEditing("holder_name")}
                    className="h-8 text-sm"
                  />
                </div>
              ) : (
                <ReadOnlyField label="Nom du titulaire" value={draft.holder_name} onEdit={() => startEditing("holder_name")} />
              )}

              {isEditing("holder_address") ? (
                <div>
                  <Label className="text-[10px]">Adresse du titulaire</Label>
                  <Input
                    value={draft.holder_address}
                    onChange={(e) => setDraft((p) => ({ ...p, holder_address: e.target.value }))}
                    onBlur={() => stopEditing("holder_address")}
                    className="h-8 text-sm"
                  />
                </div>
              ) : (
                <ReadOnlyField label="Adresse du titulaire" value={draft.holder_address} onEdit={() => startEditing("holder_address")} />
              )}
            </div>

            {/* Adresse banque */}
            {isEditing("bank_address") ? (
              <div>
                <Label className="text-[10px]">Adresse de la banque</Label>
                <Input
                  value={draft.bank_address}
                  onChange={(e) => setDraft((p) => ({ ...p, bank_address: e.target.value }))}
                  onBlur={() => stopEditing("bank_address")}
                  className="h-8 text-sm"
                />
              </div>
            ) : (
              <ReadOnlyField label="Adresse de la banque" value={draft.bank_address} onEdit={() => startEditing("bank_address")} />
            )}

            {/* Boutons d'action */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" onClick={() => void onSave()} disabled={saving || !isDraftValid || !hasChanges} className="gap-1.5 h-8">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Enregistrer
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => void onValidate()}
                disabled={validating || !item || digitsOnly(item?.rib_24 || "").length !== 24 || item.is_validated !== false}
                className="gap-1.5 h-8"
              >
                {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Valider compta
              </Button>

              <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading || saving || validating} className="h-8">
                Rafraîchir
              </Button>

              <div className="ml-auto text-[10px] text-slate-500">
                {item ? (
                  <>
                    MAJ : <span className="font-mono">{safeIsoToLocal(item.updated_at)}</span>
                    {item.is_validated ? (
                      <> • Validé : <span className="font-mono">{safeIsoToLocal(item.validated_at)}</span></>
                    ) : null}
                  </>
                ) : (
                  "Aucun RIB enregistré"
                )}
              </div>
            </div>

            {/* Documents et Historique */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">Documents (PDF)</div>

                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="application/pdf"
                    disabled={uploading || !item}
                    onChange={(e) => void onUploadPdf(e.target.files?.[0] ?? null)}
                    className="h-8 text-xs"
                  />
                  <Button variant="outline" size="sm" disabled className="gap-1.5 h-8 shrink-0">
                    <Upload className="h-3.5 w-3.5" />
                    PDF
                  </Button>
                </div>

                {documents.length ? (
                  <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                    {documents.map((d) => (
                      <div key={d.id} className="rounded border border-slate-200 p-2 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{d.file_name || "document.pdf"}</div>
                          <div className="text-[10px] text-slate-500">{safeIsoToLocal(d.uploaded_at)}</div>
                        </div>
                        {d.signed_url ? (
                          <Button variant="outline" size="sm" className="h-6 text-xs px-2" asChild>
                            <a href={d.signed_url} target="_blank" rel="noreferrer">Ouvrir</a>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" className="h-6 text-xs px-2" disabled>—</Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">Aucun document.</div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">Historique</div>

                {history.length ? (
                  <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                    {history.slice(0, 10).map((h) => {
                      const beforeRib = pickRibFromHistoryData(h.old_data);
                      const afterRib = pickRibFromHistoryData(h.new_data);
                      const beforeHolder = pickHolderFromHistoryData(h.old_data);
                      const afterHolder = pickHolderFromHistoryData(h.new_data);

                      return (
                        <div key={h.id} className="rounded border border-slate-200 p-2 text-xs">
                          <div className="text-[10px] text-slate-500">
                            {safeIsoToLocal(h.changed_at)}
                            {h.changed_by ? ` • ${h.changed_by}` : ""}
                          </div>
                          <div className="mt-1 text-slate-700 space-y-0.5">
                            {(beforeRib || afterRib) && beforeRib !== afterRib ? (
                              <div><span className="font-semibold">RIB:</span> <span className="font-mono text-[10px]">{beforeRib || "—"}</span> → <span className="font-mono text-[10px]">{afterRib || "—"}</span></div>
                            ) : null}
                            {(beforeHolder || afterHolder) && beforeHolder !== afterHolder ? (
                              <div><span className="font-semibold">Titulaire:</span> {beforeHolder || "—"} → {afterHolder || "—"}</div>
                            ) : null}
                            {beforeRib === afterRib && beforeHolder === afterHolder ? (
                              <div className="text-slate-400">MAJ (détails inchangés)</div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">Aucun historique.</div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
