import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { createProInventoryItem, updateProInventoryItem } from "@/lib/pro/api";
import type { ProInventoryCategory, ProInventoryItem, ProInventoryVariant } from "@/lib/pro/types";

import { ImageUploader } from "./ImageUploader";
import {
  ALL_ALLERGENS,
  DIETARY_PREFERENCES,
  SPICY_LEVELS,
  allergenById,
  dietaryById,
  normalizeAllergens,
  normalizeDietary,
  getMetaConfigForUniverse,
  type SpicyLevel,
  type UniverseMetaConfig,
} from "./inventoryAllergens";
import { getLabelsForUniverse, labelById, normalizeLabels } from "./inventoryLabels";
import { centsToMoneyInput, parseMoneyInputToCents, toDatetimeLocalValue } from "./inventoryUtils";

type VariantDraft = {
  title: string;
  quantity: string;
  unit: string;
  price: string;
  is_active: boolean;
  sort_order: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishmentId: string;
  universe: string | null | undefined;
  categories: ProInventoryCategory[];
  item: ProInventoryItem | null;
  canWrite: boolean;
  onSaved: () => void;
};

function categoryLabel(categories: ProInventoryCategory[], categoryId: string | null) {
  if (!categoryId) return "Sans catégorie";
  const map = new Map(categories.map((c) => [c.id, c] as const));
  const cur = map.get(categoryId);
  if (!cur) return "Catégorie";
  const chain: string[] = [cur.title];
  let p = cur.parent_id;
  while (p) {
    const node = map.get(p);
    if (!node) break;
    chain.unshift(node.title);
    p = node.parent_id;
  }
  return chain.join(" / ");
}

function toVariantDraft(v: ProInventoryVariant): VariantDraft {
  return {
    title: v.title ?? "",
    quantity: v.quantity === null || v.quantity === undefined ? "" : String(v.quantity),
    unit: v.unit ?? "",
    price: centsToMoneyInput(v.price),
    is_active: v.is_active ?? true,
    sort_order: String(v.sort_order ?? 0),
  };
}

function buildVariantPayload(d: VariantDraft) {
  const priceCents = parseMoneyInputToCents(d.price);
  if (priceCents === null) return { ok: false as const, error: "Prix variant invalide" };

  const quantityRaw = d.quantity.trim();
  const quantity = quantityRaw ? Math.round(Number(quantityRaw)) : null;
  if (quantityRaw && (!Number.isFinite(quantity) || quantity <= 0)) return { ok: false as const, error: "Quantité variant invalide" };

  const sort = Math.round(Number(d.sort_order || "0"));
  const sort_order = Number.isFinite(sort) ? sort : 0;

  const title = d.title.trim() || null;
  const unit = d.unit.trim() || null;

  return {
    ok: true as const,
    variant: {
      title,
      quantity,
      unit,
      price: priceCents,
      currency: "MAD",
      sort_order,
      is_active: d.is_active,
    },
  };
}

export function ItemEditorDialog({ open, onOpenChange, establishmentId, universe, categories, item, canWrite, onSaved }: Props) {
  const isEdit = !!item?.id;

  // Configuration dynamique selon l'univers
  const universeLabels = useMemo(() => getLabelsForUniverse(universe), [universe]);
  const metaConfig = useMemo(() => getMetaConfigForUniverse(universe), [universe]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");

  const [labels, setLabels] = useState<string[]>([]);

  const [basePrice, setBasePrice] = useState("");

  const [photos, setPhotos] = useState<string[]>([]);

  const [isActive, setIsActive] = useState(true);
  const [visibleWhenUnavailable, setVisibleWhenUnavailable] = useState(true);
  const [scheduledReactivationLocal, setScheduledReactivationLocal] = useState("");

  const [variants, setVariants] = useState<VariantDraft[]>([]);

  // Métadonnées alimentaires
  const [allergens, setAllergens] = useState<string[]>([]);
  const [dietary, setDietary] = useState<string[]>([]);
  const [spicyLevel, setSpicyLevel] = useState<SpicyLevel>("none");

  // Traductions (anglais)
  const [titleEn, setTitleEn] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [showTranslations, setShowTranslations] = useState(false);

  // Métadonnées dynamiques par univers (stockées dans meta avec préfixe "universe_")
  const [universeMeta, setUniverseMeta] = useState<Record<string, string[]>>({});

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setSaving(false);

    setTitle(item?.title ?? "");
    setDescription(item?.description ?? "");
    setCategoryId(item?.category_id ?? "");
    setLabels(normalizeLabels(item?.labels ?? []));
    setBasePrice(centsToMoneyInput(item?.base_price));
    setPhotos((item?.photos ?? []).slice());

    setIsActive(item?.is_active ?? true);
    setVisibleWhenUnavailable(item?.visible_when_unavailable ?? true);
    setScheduledReactivationLocal(toDatetimeLocalValue(item?.scheduled_reactivation_at));

    setVariants((item?.variants ?? []).map(toVariantDraft));

    // Métadonnées alimentaires depuis meta
    const meta = item?.meta ?? {};
    const metaAllergens = Array.isArray(meta.allergens) ? meta.allergens : [];
    const metaDietary = Array.isArray(meta.dietary) ? meta.dietary : [];

    // Traductions depuis meta
    const metaTitleEn = typeof meta.title_en === "string" ? meta.title_en : "";
    const metaDescriptionEn = typeof meta.description_en === "string" ? meta.description_en : "";
    setTitleEn(metaTitleEn);
    setDescriptionEn(metaDescriptionEn);
    setShowTranslations(!!(metaTitleEn || metaDescriptionEn));
    const metaSpicy = typeof meta.spicy_level === "string" ? meta.spicy_level : "none";
    setAllergens(normalizeAllergens(metaAllergens.map(String)));
    setDietary(normalizeDietary(metaDietary.map(String)));
    setSpicyLevel(SPICY_LEVELS.some((s) => s.id === metaSpicy) ? (metaSpicy as SpicyLevel) : "none");

    // Charger les métadonnées dynamiques par univers
    const loadedUniverseMeta: Record<string, string[]> = {};
    for (const section of metaConfig.sections) {
      const key = `universe_${section.id}`;
      const value = meta[key];
      if (Array.isArray(value)) {
        loadedUniverseMeta[section.id] = value.map(String);
      } else if (typeof value === "string") {
        loadedUniverseMeta[section.id] = [value];
      } else {
        loadedUniverseMeta[section.id] = [];
      }
    }
    setUniverseMeta(loadedUniverseMeta);
  }, [open, item, metaConfig]);

  const activeCategoryOptions = useMemo(() => {
    const all = categories.filter((c) => c.is_active);
    const map = new Map(all.map((c) => [c.id, c] as const));

    const buildLabel = (id: string): string => {
      const node = map.get(id);
      if (!node) return id;
      const chain: string[] = [node.title];
      let p = node.parent_id;
      while (p) {
        const parent = map.get(p);
        if (!parent) break;
        chain.unshift(parent.title);
        p = parent.parent_id;
      }
      return chain.join(" / ");
    };

    return all
      .map((c) => ({ id: c.id, label: buildLabel(c.id) }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [categories]);

  const hasVariants = variants.length > 0;

  const canSubmit = useMemo(() => {
    if (!canWrite) return false;
    if (saving) return false;
    if (title.trim().length < 2) return false;
    if (!hasVariants) {
      const cents = parseMoneyInputToCents(basePrice);
      if (cents === null) return false;
    }
    return true;
  }, [canWrite, saving, title, hasVariants, basePrice]);

  const addVariant = () => {
    setVariants((p) => [
      ...p,
      { title: "", quantity: "", unit: "", price: "", is_active: true, sort_order: String(p.length) },
    ]);
  };

  const removeVariant = (idx: number) => {
    setVariants((p) => p.filter((_, i) => i !== idx));
  };

  const toggleLabel = (id: string) => {
    setLabels((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  };

  const toggleAllergen = (id: string) => {
    setAllergens((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  };

  const toggleDietary = (id: string) => {
    setDietary((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  };

  // Toggle pour les métadonnées dynamiques par univers
  const toggleUniverseMeta = (sectionId: string, optionId: string, multiple: boolean) => {
    setUniverseMeta((prev) => {
      const current = prev[sectionId] ?? [];
      if (multiple) {
        // Checkbox: toggle
        const set = new Set(current);
        if (set.has(optionId)) set.delete(optionId);
        else set.add(optionId);
        return { ...prev, [sectionId]: Array.from(set) };
      } else {
        // Radio: remplacer
        return { ...prev, [sectionId]: [optionId] };
      }
    });
  };

  const submit = async () => {
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    const base_price = hasVariants ? null : parseMoneyInputToCents(basePrice);
    if (!hasVariants && base_price === null) {
      setError("Prix invalide");
      setSaving(false);
      return;
    }

    const cleanLabels = normalizeLabels(labels);

    const cleanPhotos = photos
      .map((p) => String(p ?? "").trim())
      .filter((p) => !!p);

    const variantsPayload: Array<{
      title?: string | null;
      quantity?: number | null;
      unit?: string | null;
      price: number;
      currency?: string;
      sort_order?: number;
      is_active?: boolean;
    }> = [];

    if (hasVariants) {
      for (const d of variants) {
        const built = buildVariantPayload(d);
        if (built.ok === false) {
          setError(built.error);
          setSaving(false);
          return;
        }
        variantsPayload.push(built.variant);
      }
    }

    const scheduled_reactivation_at = scheduledReactivationLocal.trim()
      ? new Date(scheduledReactivationLocal).toISOString()
      : null;

    // Construire l'objet meta avec les informations alimentaires et traductions
    const meta: Record<string, unknown> = {};
    if (metaConfig.showAllergens && allergens.length > 0) meta.allergens = allergens;
    if (metaConfig.showDietary && dietary.length > 0) meta.dietary = dietary;
    if (metaConfig.showSpicyLevel && spicyLevel !== "none") meta.spicy_level = spicyLevel;
    // Traductions anglais
    if (titleEn.trim()) meta.title_en = titleEn.trim();
    if (descriptionEn.trim()) meta.description_en = descriptionEn.trim();
    // Métadonnées dynamiques par univers
    for (const section of metaConfig.sections) {
      const values = universeMeta[section.id] ?? [];
      if (values.length > 0) {
        meta[`universe_${section.id}`] = values;
      }
    }

    try {
      if (isEdit && item) {
        await updateProInventoryItem({
          establishmentId,
          itemId: item.id,
          patch: {
            title: title.trim(),
            description: description.trim() || null,
            category_id: categoryId.trim() || null,
            labels: cleanLabels,
            photos: cleanPhotos,
            base_price,
            currency: "MAD",
            is_active: isActive,
            visible_when_unavailable: visibleWhenUnavailable,
            scheduled_reactivation_at,
            variants: variantsPayload,
            meta: Object.keys(meta).length > 0 ? meta : null,
          },
        });
      } else {
        await createProInventoryItem({
          establishmentId,
          data: {
            title: title.trim(),
            description: description.trim() || null,
            category_id: categoryId.trim() || null,
            labels: cleanLabels,
            photos: cleanPhotos,
            base_price,
            currency: "MAD",
            is_active: isActive,
            visible_when_unavailable: visibleWhenUnavailable,
            scheduled_reactivation_at,
            variants: variantsPayload,
            meta: Object.keys(meta).length > 0 ? meta : null,
          },
        });
      }

      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier" : "Créer"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Mettez à jour votre offre." : "Ajoutez un produit / service à votre inventaire."}
          </DialogDescription>
        </DialogHeader>

        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom <span className="text-xs text-slate-400 font-normal">(Français)</span></Label>
              <Input value={title} disabled={!canWrite} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Tajine d'agneau" />
            </div>

            <div className="space-y-2">
              <Label>Description <span className="text-xs text-slate-400 font-normal">(Français)</span></Label>
              <Textarea value={description} disabled={!canWrite} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Description du produit..." />
            </div>

            {/* Toggle traductions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTranslations(!showTranslations)}
                className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1"
              >
                🌐 {showTranslations ? "Masquer" : "Ajouter"} traduction anglaise
              </button>
            </div>

            {/* Champs anglais */}
            {showTranslations && (
              <div className="space-y-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                <div className="text-xs font-medium text-blue-700 flex items-center gap-1">
                  🇬🇧 English translation
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Name <span className="text-xs text-slate-400 font-normal">(English)</span></Label>
                  <Input
                    value={titleEn}
                    disabled={!canWrite}
                    onChange={(e) => setTitleEn(e.target.value)}
                    placeholder="Ex: Lamb Tajine"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Description <span className="text-xs text-slate-400 font-normal">(English)</span></Label>
                  <Textarea
                    value={descriptionEn}
                    disabled={!canWrite}
                    onChange={(e) => setDescriptionEn(e.target.value)}
                    rows={2}
                    placeholder="Product description..."
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Catégorie</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={categoryId}
                disabled={!canWrite}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Sans catégorie</option>
                {activeCategoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {categoryId ? <div className="text-xs text-slate-600">{categoryLabel(categories, categoryId)}</div> : null}
            </div>

            <div className="space-y-2">
              <Label>Labels</Label>
              <div className="flex flex-wrap gap-2">
                {universeLabels.map((l) => {
                  const active = labels.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      disabled={!canWrite}
                      onClick={() => toggleLabel(l.id)}
                      className={
                        "rounded-md border px-2 py-1 text-xs font-semibold transition " +
                        (active ? l.badgeClassName : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50") +
                        (canWrite ? "" : " opacity-60")
                      }
                    >
                      <span className="me-1">{l.emoji}</span>
                      {l.title}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Photos</Label>
              <ImageUploader
                establishmentId={establishmentId}
                photos={photos}
                onPhotosChange={setPhotos}
                disabled={!canWrite}
                maxPhotos={12}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <div className="font-bold text-slate-900">Disponibilité</div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">Actif</div>
                  <div className="text-xs text-slate-600">Disponible (sinon: rupture / indisponible)</div>
                </div>
                <Switch checked={isActive} disabled={!canWrite} onCheckedChange={(v) => setIsActive(v)} />
              </div>

              {!isActive ? (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">Visible mais grisé</div>
                    <div className="text-xs text-slate-600">Si désactivé, l'offre est masquée</div>
                  </div>
                  <Switch
                    checked={visibleWhenUnavailable}
                    disabled={!canWrite}
                    onCheckedChange={(v) => setVisibleWhenUnavailable(v)}
                  />
                </div>
              ) : null}

              {!isActive ? (
                <div className="space-y-2">
                  <Label>Programmer une réactivation</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledReactivationLocal}
                    disabled={!canWrite}
                    onChange={(e) => setScheduledReactivationLocal(e.target.value)}
                  />
                  <div className="text-xs text-slate-600">L'offre se réactivera automatiquement au prochain chargement.</div>
                </div>
              ) : null}
            </div>

            {/* Informations alimentaires - seulement pour restaurants */}
            {(metaConfig.showAllergens || metaConfig.showDietary || metaConfig.showSpicyLevel) && (
              <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
                <div className="font-bold text-slate-900">Informations alimentaires</div>

                {/* Niveau d'épice */}
                {metaConfig.showSpicyLevel && (
                  <div className="space-y-2">
                    <Label className="text-sm">Niveau d'épice</Label>
                    <div className="flex flex-wrap gap-1">
                      {SPICY_LEVELS.map((level) => (
                        <button
                          key={level.id}
                          type="button"
                          disabled={!canWrite}
                          onClick={() => setSpicyLevel(level.id)}
                          className={`
                            rounded-md border px-2 py-1 text-xs font-medium transition
                            ${spicyLevel === level.id
                              ? "bg-orange-100 text-orange-700 border-orange-300"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            }
                            ${!canWrite ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
                          `}
                        >
                          {level.emoji || "○"} {level.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Régimes alimentaires */}
                {metaConfig.showDietary && (
                  <div className="space-y-2">
                    <Label className="text-sm">Régimes / Certifications</Label>
                    <div className="flex flex-wrap gap-1">
                      {DIETARY_PREFERENCES.map((pref) => {
                        const active = dietary.includes(pref.id);
                        return (
                          <button
                            key={pref.id}
                            type="button"
                            disabled={!canWrite}
                            onClick={() => toggleDietary(pref.id)}
                            title={pref.description}
                            className={`
                              rounded-md border px-2 py-1 text-xs font-medium transition
                              ${active
                                ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                              }
                              ${!canWrite ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
                            `}
                          >
                            {pref.emoji} {pref.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Allergènes */}
                {metaConfig.showAllergens && (
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Allergènes présents
                      <span className="ms-1 text-xs text-slate-400 font-normal">(14 allergènes majeurs UE)</span>
                    </Label>
                    <div className="flex flex-wrap gap-1">
                      {ALL_ALLERGENS.map((allergen) => {
                        const active = allergens.includes(allergen.id);
                        return (
                          <button
                            key={allergen.id}
                            type="button"
                            disabled={!canWrite}
                            onClick={() => toggleAllergen(allergen.id)}
                            title={allergen.description}
                            className={`
                              rounded-md border px-2 py-1 text-xs font-medium transition
                              ${active
                                ? "bg-amber-100 text-amber-700 border-amber-300"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                              }
                              ${!canWrite ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
                            `}
                          >
                            {allergen.emoji} {allergen.title}
                          </button>
                        );
                      })}
                    </div>
                    {allergens.length > 0 && (
                      <div className="text-xs text-amber-600 mt-1">
                        ⚠️ {allergens.length} allergène{allergens.length > 1 ? "s" : ""} sélectionné{allergens.length > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sections dynamiques par univers */}
            {metaConfig.sections.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
                <div className="font-bold text-slate-900">Caractéristiques</div>

                {metaConfig.sections.map((section) => {
                  const selectedValues = universeMeta[section.id] ?? [];
                  return (
                    <div key={section.id} className="space-y-2">
                      <Label className="text-sm">{section.title}</Label>
                      <div className="flex flex-wrap gap-1">
                        {section.options.map((option) => {
                          const active = selectedValues.includes(option.id);
                          return (
                            <button
                              key={option.id}
                              type="button"
                              disabled={!canWrite}
                              onClick={() => toggleUniverseMeta(section.id, option.id, section.multiple)}
                              title={option.description}
                              className={`
                                rounded-md border px-2 py-1 text-xs font-medium transition
                                ${active
                                  ? "bg-primary/10 text-primary border-primary/30"
                                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                }
                                ${!canWrite ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
                              `}
                            >
                              {option.emoji} {option.title}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <div className="font-bold text-slate-900">Prix</div>

              <div className="text-xs text-slate-600">
                {hasVariants ? "Prix par quantité / option" : "Prix simple"}
              </div>

              {!hasVariants ? (
                <div className="space-y-2">
                  <Label>Prix (MAD)</Label>
                  <Input
                    value={basePrice}
                    disabled={!canWrite}
                    onChange={(e) => setBasePrice(e.target.value)}
                    placeholder="90"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Options (quantités)</Label>
                  <Button type="button" variant="outline" className="gap-2" disabled={!canWrite} onClick={addVariant}>
                    <Plus className="w-4 h-4" />
                    Ajouter
                  </Button>
                </div>

                {variants.length ? (
                  <div className="space-y-3">
                    {variants.map((v, idx) => (
                      <div key={idx} className="rounded-md border border-slate-200 p-3 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                          <div className="md:col-span-2 space-y-1">
                            <Label>Titre</Label>
                            <Input
                              value={v.title}
                              disabled={!canWrite}
                              onChange={(e) =>
                                setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))
                              }
                              placeholder="6 huîtres"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Qté</Label>
                            <Input
                              value={v.quantity}
                              disabled={!canWrite}
                              onChange={(e) =>
                                setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))
                              }
                              placeholder="6"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Unité</Label>
                            <Input
                              value={v.unit}
                              disabled={!canWrite}
                              onChange={(e) =>
                                setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)))
                              }
                              placeholder="pièces"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Prix</Label>
                            <Input
                              value={v.price}
                              disabled={!canWrite}
                              onChange={(e) =>
                                setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, price: e.target.value } : x)))
                              }
                              placeholder="180"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={v.is_active}
                              disabled={!canWrite}
                              onCheckedChange={(checked) =>
                                setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, is_active: checked } : x)))
                              }
                            />
                            <div className="text-sm text-slate-600">{v.is_active ? "Actif" : "Masqué"}</div>
                          </div>
                          <Button type="button" variant="outline" disabled={!canWrite} onClick={() => removeVariant(idx)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">Aucune option. (Vous pouvez définir un prix simple.)</div>
                )}

                {!variants.length ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={!canWrite}
                    onClick={() => setVariants([{ title: "", quantity: "", unit: "", price: "", is_active: true, sort_order: "0" }])}
                  >
                    <Plus className="w-4 h-4" />
                    Activer les prix par quantité
                  </Button>
                ) : (
                  <Button type="button" variant="outline" disabled={!canWrite} onClick={() => setVariants([])}>
                    Revenir au prix simple
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          <Button type="button" className="bg-primary text-white hover:bg-primary/90 font-bold gap-2" disabled={!canSubmit} onClick={submit}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
